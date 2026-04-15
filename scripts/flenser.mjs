// ============================================================================
// The Flenser — Rogue Subclass Automation
// ============================================================================
// Features:
//   Level 3:  The Flenser's Trade (proficiency — handled at character build)
//   Level 3:  Tallow Preparations (short/long rest crafting, bonus action deploy)
//             → Rendering Fire, Smoke Tallow, Wax Brand
//   Level 7:  Smoke-Blind (see through smoke 15 ft, stealth adv, fire resist)
//   Level 7:  Ibbenese Cleverness (escape grapples, move through hostiles, squeeze)
//   Level 10: The Leviathan's Toll (extra 3d6/3d8 on sneak attack + condition)
// ============================================================================

import { WesterosHelpers as H } from "./helpers.mjs";

const MODULE_ID = "westeros-homebrew";
const SUBCLASS = "flenser";

export class Flenser {

  static register() {
    H.log("Registering The Flenser automation");

    Hooks.on("dnd5e.restCompleted", this._onRest.bind(this));
    Hooks.on("midi-qol.preItemRoll", this._onPreItemRoll.bind(this));
    Hooks.on("midi-qol.damageRollComplete", this._onDamageComplete.bind(this));
  }

  // ==========================
  // REST HANDLER
  // ==========================

  static async _onRest(actor, result) {
    if (!this._isSubclass(actor)) return;
    const prof = H.getProfBonus(actor);
    const rogueLevel = actor.classes?.rogue?.system?.levels ?? 0;

    // Tallow Preparations: prof bonus per short/long rest
    await H.resetOnLongRest(actor, `${SUBCLASS}.tallowPreps`, prof);

    if (result.longRest) {
      // Leviathan's Toll: 2/long rest
      if (rogueLevel >= 10) {
        await H.resetOnLongRest(actor, `${SUBCLASS}.leviathanToll`, 2);
      }
    }
  }

  // ==========================
  // PRE-ITEM ROLL — Feature dispatch
  // ==========================

  static async _onPreItemRoll(workflow) {
    if (!workflow?.actor || !this._isSubclass(workflow.actor)) return;
    const itemName = workflow.item?.name?.toLowerCase() ?? "";

    if (itemName.includes("rendering fire")) {
      return this._renderingFire(workflow);
    }
    if (itemName.includes("smoke tallow")) {
      return this._smokeTallow(workflow);
    }
    if (itemName.includes("wax brand")) {
      return this._waxBrand(workflow);
    }
    if (itemName.includes("tallow prep")) {
      return this._tallowStatus(workflow);
    }
    if (itemName.includes("leviathan") || itemName.includes("toll cut")) {
      return this._leviathanTollManual(workflow);
    }
  }

  // ==========================
  // TALLOW PREPARATIONS
  // ==========================

  static _getPrepDC(actor) {
    return H.getStandardDC(actor, "dex"); // 8 + prof + DEX
  }

  // --- Rendering Fire ---

  static async _renderingFire(workflow) {
    const actor = workflow.actor;
    const uses = await H.getUses(actor, `${SUBCLASS}.tallowPreps`);
    if (uses <= 0) {
      ui.notifications.warn("No Tallow Preparations remaining.");
      return false;
    }

    const targets = H.getAllTargets();
    if (targets.length === 0) {
      ui.notifications.warn("Target creatures in the 5-foot radius of impact.");
      return false;
    }

    await H.expendUse(actor, `${SUBCLASS}.tallowPreps`);

    const rogueLevel = actor.classes?.rogue?.system?.levels ?? 0;
    const mainDice = rogueLevel >= 8 ? "3d6" : "2d6";
    const dotDice = rogueLevel >= 8 ? "1d6" : "1d4";
    const dc = this._getPrepDC(actor);

    let results = [];

    for (const target of targets) {
      const { roll, success } = await H.promptSavingThrow(target.actor, "dex", dc);

      if (!success) {
        const dmgRoll = await H.rollDice(mainDice);
        await H.applyDamage(target, dmgRoll.total, "fire");

        // Apply burning DoT
        const burnEffect = H.createEffectData(
          "Rendering Fire — Burning",
          "icons/magic/fire/flame-burning-hand-red.webp",
          [
            {
              key: "flags.midi-qol.OverTime",
              mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
              value: `turn=start,damageRoll=${dotDice},damageType=fire,label=Rendering Fire Burn`,
              priority: 20
            }
          ],
          { rounds: 1, specialDuration: ["turnStart"] },
          { [MODULE_ID]: { renderingFireDot: true } }
        );
        await H.applyEffect(target.actor, burnEffect);

        results.push(`<b>${target.actor.name}</b>: <span style="color:red">FAIL</span> (${roll.total}) — ${dmgRoll.total} fire + ${dotDice} burn next turn`);
      } else {
        const halfDmgRoll = await H.rollDice(mainDice);
        const halfDmg = Math.floor(halfDmgRoll.total / 2);
        await H.applyDamage(target, halfDmg, "fire");
        results.push(`<b>${target.actor.name}</b>: <span style="color:green">SAVE</span> (${roll.total}) — ${halfDmg} fire (half)`);
      }
    }

    H.chatMessage(`
      <b>${actor.name}</b> hurls a pot of volatile whale oil — <b>Rendering Fire!</b><br>
      DEX Save DC ${dc} | ${mainDice} fire damage<br>
      ${results.join("<br>")}<br>
      <small>${uses - 1} preparation(s) remaining.</small>
    `);
  }

  // --- Smoke Tallow ---

  static async _smokeTallow(workflow) {
    const actor = workflow.actor;
    const uses = await H.getUses(actor, `${SUBCLASS}.tallowPreps`);
    if (uses <= 0) {
      ui.notifications.warn("No Tallow Preparations remaining.");
      return false;
    }

    await H.expendUse(actor, `${SUBCLASS}.tallowPreps`);

    // Apply heavily obscured effect (visual reminder)
    const smokeEffect = H.createEffectData(
      "Smoke Tallow — Heavily Obscured",
      "icons/magic/air/fog-gas-smoke-dense-brown.webp",
      [],
      { rounds: 1, specialDuration: ["turnEnd"] }
    );
    await H.applyEffect(actor, smokeEffect);

    // Rogue level 7+: Smoke-Blind lets them see through it
    const rogueLevel = actor.classes?.rogue?.system?.levels ?? 0;
    const seeThrough = rogueLevel >= 7;

    H.chatMessage(`
      <b>${actor.name}</b> cracks a tallow cake — <b>Smoke Tallow!</b><br>
      10-foot radius becomes <b>heavily obscured</b> until end of next turn.<br>
      ${seeThrough ? `<i>${actor.name} can see through the smoke (Smoke-Blind, 15 ft).</i><br>` : ""}
      You can <b>Hide</b> as part of this bonus action.<br>
      <small>${uses - 1} preparation(s) remaining. Place a smoke template on the map.</small>
    `);
  }

  // --- Wax Brand ---

  static async _waxBrand(workflow) {
    const actor = workflow.actor;
    const uses = await H.getUses(actor, `${SUBCLASS}.tallowPreps`);
    if (uses <= 0) {
      ui.notifications.warn("No Tallow Preparations remaining.");
      return false;
    }

    await H.expendUse(actor, `${SUBCLASS}.tallowPreps`);

    // Apply weapon coating effect
    const brandEffect = H.createEffectData(
      "Wax Brand — Active",
      "icons/magic/fire/dagger-rune-enchant-flame-orange.webp",
      [
        {
          key: "system.bonuses.mwak.damage",
          mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          value: "1d6[fire]",
          priority: 20
        }
      ],
      {
        seconds: 60, // 1 minute
        specialDuration: ["1Attack"] // expires after first hit
      },
      { [MODULE_ID]: { waxBrand: true } }
    );
    await H.applyEffect(actor, brandEffect);

    // Flag for blinding on sneak attack
    await H.setFlag(actor, `${SUBCLASS}.waxBrandActive`, true);

    H.chatMessage(`
      <b>${actor.name}</b> slathers their weapon in burning tallow — <b>Wax Brand!</b><br>
      Next weapon hit deals <b>+1d6 fire</b>.<br>
      If combined with <b>Sneak Attack</b>: target must WIS save or be <b>blinded</b> for 1 turn.<br>
      <small>Lasts 1 minute or until you hit. ${uses - 1} preparation(s) remaining.</small>
    `);
  }

  static async _tallowStatus(workflow) {
    const uses = await H.getUses(workflow.actor, `${SUBCLASS}.tallowPreps`);
    H.chatMessage(`<b>Tallow Preparations:</b> ${uses} remaining.`);
  }

  // ==========================
  // WAX BRAND — Blinding on Sneak Attack
  // ==========================

  static async _onDamageComplete(workflow) {
    if (!workflow?.actor || !this._isSubclass(workflow.actor)) return;

    const actor = workflow.actor;
    const rogueLevel = actor.classes?.rogue?.system?.levels ?? 0;

    // --- Wax Brand blinding check ---
    const waxActive = await H.getFlag(actor, `${SUBCLASS}.waxBrandActive`);
    if (waxActive && workflow.isCritical !== undefined) {
      // Check if sneak attack was applied
      const isSneakAttack = workflow.item?.system?.properties?.has("snk") ||
                            workflow.item?.name?.toLowerCase().includes("sneak");

      // Simpler check: was the damage notably high (sneak attack adds dice)
      if (isSneakAttack || (workflow.damageTotal > 20 && rogueLevel >= 3)) {
        await H.unsetFlag(actor, `${SUBCLASS}.waxBrandActive`);

        for (const target of (workflow.targets ?? [])) {
          const dc = this._getPrepDC(actor);
          const { roll, success } = await H.promptSavingThrow(target.actor, "wis", dc);

          if (!success) {
            const blindEffect = H.createEffectData(
              "Wax Brand — Blinded",
              "icons/magic/fire/explosion-fireball-medium-orange.webp",
              [
                {
                  key: "macro.CE",
                  mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
                  value: "Blinded",
                  priority: 20
                }
              ],
              { rounds: 1, specialDuration: ["turnEnd"] }
            );
            await H.applyEffect(target.actor, blindEffect);
            H.chatMessage(`<b>${target.actor.name}</b> is <b>blinded</b> by the burning tallow! (WIS ${roll.total} vs DC ${dc})`);
          } else {
            H.chatMessage(`<b>${target.actor.name}</b> shakes off the tallow flash. (WIS ${roll.total} vs DC ${dc})`);
          }
        }
      }
    }

    // --- Leviathan's Toll check ---
    if (rogueLevel >= 10) {
      await this._checkLeviathanToll(workflow);
    }
  }

  // ==========================
  // THE LEVIATHAN'S TOLL — Level 10 Capstone
  // ==========================

  static async _checkLeviathanToll(workflow) {
    const actor = workflow.actor;
    if (!actor) return;

    const uses = await H.getUses(actor, `${SUBCLASS}.leviathanToll`);
    if (uses <= 0) return;

    // Check if this was a sneak attack
    const isSneakAttack = workflow.item?.system?.properties?.has("snk") ||
                          actor.items.some(i => i.name.toLowerCase().includes("sneak attack"));

    if (!isSneakAttack) return;

    // Check targets for conditions
    for (const target of (workflow.targets ?? [])) {
      const conditions = ["prone", "restrained", "grappled", "blinded",
                          "frightened", "poisoned", "slowed"];
      const hasCondition = target.actor.effects.some(e =>
        conditions.some(c => e.name.toLowerCase().includes(c))
      );

      if (!hasCondition) continue;

      // Check if target has fire DoT (Rendering Fire)
      const hasFireDot = target.actor.effects.some(e =>
        e.flags?.[MODULE_ID]?.renderingFireDot
      );

      const targetSize = target.actor.system.traits?.size ?? "med";
      const isHugeOrLarger = ["huge", "grg"].includes(targetSize);

      const baseDice = isHugeOrLarger ? "3d8" : "3d6";
      const fireBonusDice = isHugeOrLarger ? "1d8" : "1d6";

      let totalFormula = baseDice;
      let description = `${baseDice} bonus damage`;
      if (hasFireDot) {
        totalFormula += ` + ${fireBonusDice}`;
        description += ` + ${fireBonusDice} fire (burning target)`;
      }

      const choice = await H.buttonDialog(
        "The Leviathan's Toll",
        `<p><b>${target.actor.name}</b> is affected by a condition and was hit with Sneak Attack.</p>
         <p>Declare a <b>Toll Cut</b> for <b>${description}</b>?</p>
         <p><small>${uses} use(s) remaining (2/long rest)</small></p>`,
        [
          { id: "yes", label: "Toll Cut!", value: "yes" },
          { id: "no", label: "Normal hit", value: "no" }
        ]
      );

      if (choice !== "yes") continue;

      await H.expendUse(actor, `${SUBCLASS}.leviathanToll`);

      const tollRoll = await H.rollDice(totalFormula);
      const mainDamageType = hasFireDot ? "fire" : workflow.defaultDamageType ?? "piercing";
      await H.applyDamage(target, tollRoll.total, mainDamageType);

      H.chatMessage(`
        <h3>🐋 The Leviathan's Toll!</h3>
        <p><b>${actor.name}</b> finds the seam and cuts deep — a <b>Toll Cut!</b></p>
        <p>Extra damage: <b>${tollRoll.total}</b> (${totalFormula})</p>
        ${isHugeOrLarger ? "<p><i>Huge+ creature: upgraded dice.</i></p>" : ""}
        ${hasFireDot ? "<p><i>Burning target: bonus fire damage.</i></p>" : ""}
        <p><small>${uses - 1} use(s) remaining.</small></p>
      `);
    }
  }

  static async _leviathanTollManual(workflow) {
    const uses = await H.getUses(workflow.actor, `${SUBCLASS}.leviathanToll`);
    H.chatMessage(`<b>Leviathan's Toll:</b> ${uses} use(s) remaining. Triggers automatically on qualifying Sneak Attacks.`);
  }

  // ==========================
  // Utility
  // ==========================

  static _isSubclass(actor) {
    if (!actor) return false;
    const hasFeature = actor.items.some(i =>
      i.type === "feat" &&
      (i.name.toLowerCase().includes("flenser") ||
       i.name.toLowerCase().includes("tallow") ||
       i.name.toLowerCase().includes("rendering fire") ||
       i.name.toLowerCase().includes("leviathan"))
    );
    const hasFlag = H.getFlag(actor, `${SUBCLASS}.active`);
    return hasFeature || hasFlag;
  }
}
