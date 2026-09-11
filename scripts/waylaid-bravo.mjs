// ============================================================================
// The Waylaid Bravo — Fighter Subclass Automation
// ============================================================================
// Features:
//   Level 3:  The Bravo's Schooling  (proficiencies + initiative advantage)
//   Level 3:  Water Dancer's Guard   (+2/+3 AC while dancing — auto-toggled)
//   Level 3:  Water Dancing          (Flourish pool + three forms)
//               → Quick as a Snake / Swift as a Deer / Fierce as a Wolverine
//   Level 7:  Calm as Still Water    (reaction, spend Flourish, +DEX to AC)
//   Level 7:  Braavosi Footwork      (+10 ft, Guard +1, bonus-action Disengage)
//   Level 10: The Dance of the First Sword (1 min, 1/long rest capstone)
//
// CONTRACTUAL ITEM NAMES (substring matched, case-insensitive):
//   "Water Dancing", "Quick as a Snake", "Swift as a Deer",
//   "Fierce as a Wolverine", "Calm as Still Water", "Braavosi Footwork",
//   "Water Dancer's Guard", "The Bravo's Schooling",
//   "The Dance of the First Sword"
// Renaming any of these on DDB re-import will silently break dispatch.
// ============================================================================

import { WesterosHelpers as H } from "./helpers.mjs";

const MODULE_ID = "westeros-homebrew";
const SUBCLASS = "waylaidBravo";

const GUARD_EFFECT = "Water Dancer's Guard (Dancing)";
const DANCE_EFFECT = "The Dance of the First Sword";

export class WaylaidBravo {

  static register() {
    H.log("Registering The Waylaid Bravo automation");

    Hooks.on("dnd5e.restCompleted", this._onRest.bind(this));
    Hooks.on("midi-qol.preItemRoll", this._onPreItemRoll.bind(this));
    Hooks.on("preUpdateActor", this._onPreUpdateActor.bind(this));

    // Dancing-condition watchers — re-evaluate whenever gear or turn changes
    Hooks.on("updateItem", this._onUpdateItem.bind(this));
    Hooks.on("createItem", this._onUpdateItem.bind(this));
    Hooks.on("deleteItem", this._onUpdateItem.bind(this));
    Hooks.on("combatTurnChange", this._onTurnChange.bind(this));

    // main.mjs calls register() from inside the "ready" hook, so a
    // Hooks.once("ready") registered here would never fire. Run immediately if
    // the game is already ready, otherwise defer.
    const initialSweep = () => {
      for (const actor of game.actors) {
        if (this._isSubclass(actor)) this.refreshGuard(actor);
      }
    };
    if (game.ready) initialSweep();
    else Hooks.once("ready", initialSweep);
  }

  // ==========================================================================
  // SCALING
  // ==========================================================================

  static _level(actor) {
    return actor.classes?.fighter?.system?.levels ?? actor.system?.details?.level ?? 0;
  }

  /** Water Dance die: d6 (3-6), d8 (7-9), d10 (10+) */
  static _danceDie(actor) {
    const lvl = this._level(actor);
    if (lvl >= 10) return "1d10";
    if (lvl >= 7) return "1d8";
    return "1d6";
  }

  /** Bleed die: d4 (3-6), d6 (7-9), d8 (10+) */
  static _bleedDie(actor) {
    const lvl = this._level(actor);
    if (lvl >= 10) return "1d8";
    if (lvl >= 7) return "1d6";
    return "1d4";
  }

  /** Flourish pool: flat integers — deliberately NOT prof-bonus, for DDB parity */
  static _maxFlourishes(actor) {
    const lvl = this._level(actor);
    if (lvl >= 10) return 6;
    if (lvl >= 7) return 5;
    return 4;
  }

  /** Guard AC bonus: +2 (3-6), +3 (7+) */
  static _guardBonus(actor) {
    return this._level(actor) >= 7 ? 3 : 2;
  }

  static _saveDC(actor) {
    return H.getStandardDC(actor, "dex"); // 8 + prof + DEX
  }

  // ==========================================================================
  // THE DANCING CONDITION
  // ==========================================================================
  // Dancing = no armour + one-handed finesse melee weapon equipped + off hand
  // empty (no shield, no second equipped weapon).
  // ==========================================================================

  static isDancing(actor) {
    if (!actor) return false;

    const equipped = actor.items.filter(i => i.system?.equipped);

    // 1. No armour (clothing is permitted)
    const wearingArmour = equipped.some(i => {
      if (i.type !== "equipment") return false;
      const t = i.system?.type?.value ?? i.system?.armor?.type ?? "";
      return ["light", "medium", "heavy"].includes(t);
    });
    if (wearingArmour) return false;

    // 2. No shield
    const hasShield = equipped.some(i => {
      if (i.type !== "equipment") return false;
      const t = i.system?.type?.value ?? i.system?.armor?.type ?? "";
      return t === "shield";
    });
    if (hasShield) return false;

    // 3. Exactly one equipped melee weapon, finesse, not two-handed
    const meleeWeapons = equipped.filter(i => i.type === "weapon" && this._isMelee(i));
    if (meleeWeapons.length !== 1) return false;

    const blade = meleeWeapons[0];
    const props = blade.system?.properties;
    const has = (p) => (props instanceof Set) ? props.has(p) : !!props?.[p];
    if (!has("fin")) return false;
    if (has("two")) return false;

    return true;
  }

  static _isMelee(item) {
    const at = item.system?.actionType ?? "";
    const type = item.system?.type?.value ?? item.system?.weaponType ?? "";
    if (at === "rwak") return false;
    return ["simpleM", "martialM", "natural", "improv", ""].includes(type) || at === "mwak";
  }

  static getBlade(actor) {
    return actor.items.find(i =>
      i.type === "weapon" && i.system?.equipped && this._isMelee(i)
    );
  }

  static _bladeDamageType(actor) {
    const blade = this.getBlade(actor);
    const parts = blade?.system?.damage?.base?.types ?? null;
    if (parts instanceof Set && parts.size) return Array.from(parts)[0];
    const legacy = blade?.system?.damage?.parts?.[0]?.[1];
    return legacy || "piercing";
  }

  // ==========================================================================
  // GUARD EFFECT — auto-applied / auto-removed
  // ==========================================================================

  static async refreshGuard(actor) {
    if (!actor || !this._isSubclass(actor)) return;
    if (!actor.isOwner) return;

    const shouldHave = this.isDancing(actor);
    const existing = actor.effects.find(e => e.name === GUARD_EFFECT);
    const bonus = this._guardBonus(actor);

    if (shouldHave && !existing) {
      const eff = H.createEffectData(
        GUARD_EFFECT,
        "icons/skills/melee/blade-tip-energy-teal.webp",
        [
          {
            key: "system.attributes.ac.bonus",
            mode: H.MODE.ADD,
            value: `${bonus}`,
            priority: 20
          },
          {
            key: "flags.dnd5e.initiativeAdv",
            mode: H.MODE.OVERRIDE,
            value: "1",
            priority: 20
          }
        ],
        {}
      );
      await H.applyEffect(actor, eff);
      H.log(`Water Dancer's Guard applied to ${actor.name} (+${bonus} AC)`);
    } else if (shouldHave && existing) {
      // Level-up may have changed the bonus — keep it in sync.
      // Effect changes live at effect.changes on v13 and effect.system.changes
      // on v14, so read and write through the helpers.
      const current = H.effectChanges(existing);
      const change = current.find(c => c.key === "system.attributes.ac.bonus");
      if (change && change.value !== `${bonus}`) {
        const changes = foundry.utils.deepClone(current);
        changes.find(c => c.key === "system.attributes.ac.bonus").value = `${bonus}`;
        await H.updateEffectChanges(existing, changes);
      }
    } else if (!shouldHave && existing) {
      await existing.delete();
      H.log(`Water Dancer's Guard removed from ${actor.name}`);
    }

    // Braavosi Footwork speed rider (7th) rides the same condition
    await this._refreshFootwork(actor, shouldHave);
  }

  static async _refreshFootwork(actor, dancing) {
    const NAME = "Braavosi Footwork (Dancing)";
    const qualifies = dancing && this._level(actor) >= 7;
    const existing = actor.effects.find(e => e.name === NAME);

    if (qualifies && !existing) {
      const eff = H.createEffectData(
        NAME,
        "icons/skills/movement/feet-winged-boots-brown.webp",
        [
          {
            key: "system.attributes.movement.walk",
            mode: H.MODE.ADD,
            value: "10",
            priority: 20
          }
        ],
        {}
      );
      await H.applyEffect(actor, eff);
    } else if (!qualifies && existing) {
      await existing.delete();
    }
  }

  static async _onUpdateItem(item) {
    const actor = item?.parent;
    if (!actor || actor.documentName !== "Actor") return;
    if (!this._isSubclass(actor)) return;
    await this.refreshGuard(actor);
  }

  static async _onTurnChange(combat) {
    const actor = combat?.combatant?.actor;
    if (!actor || !this._isSubclass(actor)) return;
    await this.refreshGuard(actor);
  }

  // ==========================================================================
  // REST HANDLER
  // ==========================================================================

  static async _onRest(actor, result) {
    if (!this._isSubclass(actor)) return;

    const max = this._maxFlourishes(actor);
    await H.resetOnLongRest(actor, `${SUBCLASS}.flourishes`, max);
    await this._syncPoolItem(actor, max, max);

    if (result?.longRest) {
      const uses = this._level(actor) >= 15 ? 2 : 1;
      if (this._level(actor) >= 10) {
        await H.resetOnLongRest(actor, `${SUBCLASS}.firstSword`, uses);
      }
      await H.unsetFlag(actor, `${SUBCLASS}.notTodaySpent`);
    }

    await this.refreshGuard(actor);
  }

  /** Keeps the "Water Dancing" Foundry item's uses in sync for Argon HUD display. */
  static async _syncPoolItem(actor, value, max) {
    const item = actor.items.find(i => i.name.toLowerCase().includes("water dancing"));
    if (!item) return;
    try {
      await item.update({ "system.uses.value": value, "system.uses.max": `${max}` });
    } catch (e) {
      H.log("Could not sync Water Dancing item uses:", e);
    }
  }

  // ==========================================================================
  // PRE-ITEM ROLL — dispatch
  // ==========================================================================

  static async _onPreItemRoll(workflow) {
    if (!workflow?.actor || !this._isSubclass(workflow.actor)) return;
    const name = workflow.item?.name?.toLowerCase() ?? "";

    if (name.includes("quick as a snake")) return this._flourish(workflow, "snake");
    if (name.includes("swift as a deer")) return this._flourish(workflow, "deer");
    if (name.includes("fierce as a wolverine")) return this._flourish(workflow, "wolverine");
    if (name.includes("calm as still water")) return this._calmAsStillWater(workflow);
    if (name.includes("dance of the first sword")) return this._firstSword(workflow);
    if (name.includes("water dancing")) return this._poolStatus(workflow);
  }

  // ==========================================================================
  // FLOURISHES
  // ==========================================================================

  static async _spendFlourish(actor) {
    const uses = await H.getUses(actor, `${SUBCLASS}.flourishes`);
    if (uses <= 0) {
      ui.notifications.warn("No Flourishes remaining. Take a short rest.");
      return null;
    }
    await H.expendUse(actor, `${SUBCLASS}.flourishes`);
    await this._syncPoolItem(actor, uses - 1, this._maxFlourishes(actor));
    return uses - 1;
  }

  static async _flourish(workflow, form) {
    const actor = workflow.actor;

    if (!this.isDancing(actor)) {
      ui.notifications.warn("You are not dancing — check armour, shield, and off hand.");
      return false;
    }

    const target = H.getFirstTarget();
    if (!target) return false;

    const remaining = await this._spendFlourish(actor);
    if (remaining === null) return false;

    const die = this._danceDie(actor);
    const dmgType = this._bladeDamageType(actor);
    const dmgRoll = await H.rollDice(die);
    await H.applyDamage(target, dmgRoll.total, dmgType);

    let rider = "";

    // ---- Quick as a Snake — AC -2 until start of your next turn ----
    if (form === "snake") {
      const eff = H.createEffectData(
        "Quick as a Snake — Opened Guard",
        "icons/skills/melee/strike-dagger-serrated-green.webp",
        [
          {
            key: "system.attributes.ac.bonus",
            mode: H.MODE.ADD,
            value: "-2",
            priority: 20
          }
        ],
        { rounds: 1, specialDuration: ["turnStartSource"] }
      );
      await H.applyEffect(target.actor, eff);
      rider = `<b>${target.actor.name}</b>'s AC is reduced by <b>2</b> until the start of your next turn.`;
    }

    // ---- Swift as a Deer — free 15 ft, no OA ----
    if (form === "deer") {
      rider = `Move up to <b>15 feet</b> now without provoking opportunity attacks. This does not cost movement.`;
    }

    // ---- Fierce as a Wolverine — CON save or bleed ----
    if (form === "wolverine") {
      const dc = this._saveDC(actor);
      const bleed = this._bleedDie(actor);
      const bloodless = ["construct", "undead", "ooze"].includes(
        (target.actor.system?.details?.type?.value ?? "").toLowerCase()
      );

      if (bloodless) {
        rider = `<i>${target.actor.name} has no blood to spill — no bleed applied.</i>`;
      } else {
        const { roll, success } = await H.promptSavingThrow(target.actor, "con", dc);
        if (success) {
          rider = `<b>${target.actor.name}</b> holds the wound closed. (CON ${roll.total} vs DC ${dc})`;
        } else {
          const eff = H.createEffectData(
            "Fierce as a Wolverine — Bleeding",
            "icons/skills/wounds/blood-spurt-spray-red.webp",
            [
              {
                key: "flags.midi-qol.OverTime",
                mode: H.MODE.OVERRIDE,
                value: `turn=start,damageRoll=${bleed},damageType=${dmgType},saveDC=${dc},saveAbility=con,saveRemove=true,label=Bleeding`,
                priority: 20
              }
            ],
            { seconds: 60, rounds: 10 },
            { [MODULE_ID]: { waylaidBravoBleed: true } }
          );
          await H.applyEffect(target.actor, eff);
          rider = `<b>${target.actor.name}</b> is <b>bleeding</b> — ${bleed} at the start of each turn, CON DC ${dc} to end. (rolled ${roll.total})`;
        }
      }
    }

    H.chatMessage(`
      <h3>${actor.name} — Water Dancing</h3>
      <p><b>+${dmgRoll.total}</b> ${dmgType} damage (${die})</p>
      <p>${rider}</p>
      <p><small>${remaining} Flourish(es) remaining.</small></p>
    `);

    return false; // module resolves the feature; suppress the default item roll
  }

  // ==========================================================================
  // CALM AS STILL WATER (7th) — reaction, spend a Flourish
  // ==========================================================================
  // The Foundry item carries its own non-transfer AE:
  //   system.attributes.ac.bonus  ADD  @abilities.dex.mod   (specialDuration: isAttacked)
  // Midi resolves the AC change before the attack lands, exactly like Shield.
  // This handler only gates the resource and the dancing condition.
  // ==========================================================================

  static async _calmAsStillWater(workflow) {
    const actor = workflow.actor;

    if (this._level(actor) < 7) {
      ui.notifications.warn("Calm as Still Water requires Fighter level 7.");
      return false;
    }
    if (!this.isDancing(actor)) {
      ui.notifications.warn("You are not dancing — Calm as Still Water is unavailable.");
      return false;
    }

    const remaining = await this._spendFlourish(actor);
    if (remaining === null) return false;

    const dex = H.getAbilityMod(actor, "dex");
    H.chatMessage(`
      <h3>${actor.name} — Calm as Still Water</h3>
      <p><b>+${dex} AC</b> against the triggering attack.</p>
      <p><small>If it misses, move 5 feet without provoking. ${remaining} Flourish(es) remaining.</small></p>
    `);

    return true; // let the item's own AE apply
  }

  // ==========================================================================
  // THE DANCE OF THE FIRST SWORD (10th capstone)
  // ==========================================================================

  static async _firstSword(workflow) {
    const actor = workflow.actor;

    if (this._level(actor) < 10) {
      ui.notifications.warn("The Dance of the First Sword requires Fighter level 10.");
      return false;
    }
    if (!this.isDancing(actor)) {
      ui.notifications.warn("You must be dancing to begin the dance.");
      return false;
    }

    const uses = await H.getUses(actor, `${SUBCLASS}.firstSword`);
    if (uses <= 0) {
      ui.notifications.warn("The Dance of the First Sword has no uses remaining.");
      return false;
    }
    await H.expendUse(actor, `${SUBCLASS}.firstSword`);
    await H.unsetFlag(actor, `${SUBCLASS}.notTodaySpent`);

    const die = this._danceDie(actor);

    const eff = H.createEffectData(
      DANCE_EFFECT,
      "icons/skills/melee/blade-tips-triple-steel.webp",
      [
        {
          key: "system.bonuses.mwak.damage",
          mode: H.MODE.ADD,
          value: `+${die}`,
          priority: 20
        },
        {
          key: "flags.midi-qol.grants.disadvantage.attack.all",
          mode: H.MODE.OVERRIDE,
          value: "1",
          priority: 20
        }
      ],
      { seconds: 60, rounds: 10 },
      { [MODULE_ID]: { firstSword: true } }
    );
    await H.applyEffect(actor, eff);

    H.chatMessage(`
      <h3>⚔️ ${actor.name} begins The Dance of the First Sword</h3>
      <p><b>Unbroken Rhythm</b> — every melee hit deals an extra ${die}.</p>
      <p><b>Water Moves Around Stone</b> — attacks against you have disadvantage.</p>
      <p><b>Not Today</b> — the first hit that would drop you to 0 leaves you at 1 instead.</p>
      <p><small>Duration 1 minute. ${uses - 1} use(s) remaining.</small></p>
    `);

    return false;
  }

  // ==========================================================================
  // NOT TODAY — death-defiance while dancing
  // ==========================================================================

  static _onPreUpdateActor(actor, update) {
    if (!this._isSubclass(actor)) return;

    const newHp = foundry.utils.getProperty(update, "system.attributes.hp.value");
    if (newHp === undefined || newHp > 0) return;

    const dancing = actor.effects.some(e => e.name === DANCE_EFFECT);
    if (!dancing) return;

    if (H.getFlag(actor, `${SUBCLASS}.notTodaySpent`)) return;

    foundry.utils.setProperty(update, "system.attributes.hp.value", 1);
    actor.setFlag(MODULE_ID, `${SUBCLASS}.notTodaySpent`, true);

    H.chatMessage(`
      <h3>"What do we say to the god of death?"</h3>
      <p><b>${actor.name}</b> is left standing at <b>1 hit point</b>.</p>
      <p><i>Not today.</i> Move up to your speed without provoking opportunity attacks.</p>
    `);
  }

  // ==========================================================================
  // STATUS
  // ==========================================================================

  static async _poolStatus(workflow) {
    const actor = workflow.actor;
    const uses = await H.getUses(actor, `${SUBCLASS}.flourishes`);
    const max = this._maxFlourishes(actor);
    const sword = await H.getUses(actor, `${SUBCLASS}.firstSword`);

    H.chatMessage(`
      <h3>${actor.name} — Water Dancing</h3>
      <p><b>Flourishes:</b> ${uses} / ${max} &nbsp;|&nbsp; <b>Die:</b> ${this._danceDie(actor)}</p>
      <p><b>Water Dance Save DC:</b> ${this._saveDC(actor)}</p>
      <p><b>Dancing:</b> ${this.isDancing(actor) ? "✅ yes" : "❌ no — check armour / shield / off hand"}</p>
      ${this._level(actor) >= 10 ? `<p><b>Dance of the First Sword:</b> ${sword} use(s)</p>` : ""}
    `);
    return false;
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  static _isSubclass(actor) {
    if (!actor) return false;
    const hasFeature = actor.items.some(i =>
      i.type === "feat" &&
      (i.name.toLowerCase().includes("water dancing") ||
       i.name.toLowerCase().includes("water dancer") ||
       i.name.toLowerCase().includes("waylaid bravo") ||
       i.name.toLowerCase().includes("bravo's schooling") ||
       i.name.toLowerCase().includes("braavosi footwork") ||
       i.name.toLowerCase().includes("first sword"))
    );
    const hasFlag = H.getFlag(actor, `${SUBCLASS}.active`);
    return hasFeature || hasFlag;
  }

  // ==========================================================================
  // Macro entry point — "Waylaid Bravo - Initialize Resources"
  // ==========================================================================

  static async initialize(actor) {
    if (!actor) {
      ui.notifications.error("No actor supplied.");
      return;
    }
    const max = this._maxFlourishes(actor);
    await H.setFlag(actor, `${SUBCLASS}.active`, true);
    await H.resetOnLongRest(actor, `${SUBCLASS}.flourishes`, max);
    if (this._level(actor) >= 10) {
      await H.resetOnLongRest(actor, `${SUBCLASS}.firstSword`, this._level(actor) >= 15 ? 2 : 1);
    }
    await H.unsetFlag(actor, `${SUBCLASS}.notTodaySpent`);
    await this._syncPoolItem(actor, max, max);
    await this.refreshGuard(actor);

    ui.notifications.info(`Waylaid Bravo initialised for ${actor.name}: ${max} Flourishes, ${this._danceDie(actor)} die.`);
  }
}
