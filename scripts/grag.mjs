// ============================================================================
// Way of the Gràg — Monk Subclass Automation
// ============================================================================
// Features:
//   Level 3:  The Stone Fist (extra 1d6/1d8 on unarmed, 2/short rest, magical)
//   Level 3:  Numbing Blow (1 ki — CON save or speed -10 + poisoned)
//   Level 3:  The Living Hand (proficiency/expertise — handled at character build)
//   Level 6:  Frosted Vigil (advantage on ambush, perception prof/expertise — passive)
//   Level 6:  Self-Reliance (2 ki — end blinded/deafened/paralysed/poisoned)
//   Level 10: Frozen Sinew (reaction — 1 ki, reduce BPS damage by 1d10+WIS+monk level)
//   Level 10: Shatter Strike (2/short rest, 2 ki — extra 3d8 + STR save or prone)
// ============================================================================

import { WesterosHelpers as H } from "./helpers.mjs";

const MODULE_ID = "westeros-homebrew";
const SUBCLASS = "grag";

export class Grag {

  static register() {
    H.log("Registering Way of the Gràg automation");

    Hooks.on("dnd5e.restCompleted", this._onRest.bind(this));
    Hooks.on("midi-qol.preItemRoll", this._onPreItemRoll.bind(this));
    Hooks.on("midi-qol.damageRollComplete", this._onDamageRollComplete.bind(this));
    Hooks.on("midi-qol.preApplyDynamicEffects", this._onPreApplyDamage.bind(this));
  }

  // ==========================
  // REST HANDLER
  // ==========================

  static async _onRest(actor, result) {
    if (!this._isSubclass(actor)) return;

    const monkLevel = actor.classes?.monk?.system?.levels ?? 0;

    if (result.longRest || !result.longRest) {
      // Stone Fist: 2/short rest
      await H.resetOnLongRest(actor, `${SUBCLASS}.stoneFist`, 2);
    }

    if (result.longRest || !result.longRest) {
      // Shatter Strike: 2/short rest (level 10)
      if (monkLevel >= 10) {
        await H.resetOnLongRest(actor, `${SUBCLASS}.shatterStrike`, 2);
      }
    }
  }

  // ==========================
  // PRE-ITEM ROLL — Feature dispatch
  // ==========================

  static async _onPreItemRoll(workflow) {
    if (!workflow?.actor || !this._isSubclass(workflow.actor)) return;
    const itemName = workflow.item?.name?.toLowerCase() ?? "";

    if (itemName.includes("numbing blow")) {
      return this._numbingBlow(workflow);
    }
    if (itemName.includes("self-reliance") || itemName.includes("self reliance")) {
      return this._selfReliance(workflow);
    }
    if (itemName.includes("frozen sinew")) {
      return this._frozenSinew(workflow);
    }
    if (itemName.includes("shatter strike")) {
      return this._shatterStrike(workflow);
    }
  }

  // ==========================
  // STONE FIST — Extra damage on unarmed strike
  // ==========================

  static async _onDamageRollComplete(workflow) {
    if (!workflow?.actor || !this._isSubclass(workflow.actor)) return;

    const item = workflow.item;
    if (!item) return;

    // Check if this is an unarmed strike
    const isUnarmed = item.name.toLowerCase().includes("unarmed") ||
                      item.system?.type?.value === "natural";
    if (!isUnarmed) return;

    // Check if Stone Fist uses remain
    const uses = await H.getUses(workflow.actor, `${SUBCLASS}.stoneFist`);
    if (uses <= 0) return;

    const monkLevel = workflow.actor.classes?.monk?.system?.levels ?? 0;
    const dieDamage = monkLevel >= 7 ? "1d8" : "1d6";

    // Prompt to use Stone Fist
    const choice = await H.buttonDialog(
      "The Stone Fist",
      `<p>You hit with an unarmed strike. Spend a Stone Fist use for extra <b>${dieDamage}</b> bludgeoning damage?</p>
       <p><small>${uses} use(s) remaining (2/short rest)</small></p>`,
      [
        { id: "yes", label: `Deal +${dieDamage}`, value: "yes" },
        { id: "no", label: "Normal strike", value: "no" }
      ]
    );

    if (choice !== "yes") return;

    await H.expendUse(workflow.actor, `${SUBCLASS}.stoneFist`);
    const bonusRoll = await H.rollDice(dieDamage);

    // Add bonus damage to the workflow
    if (workflow.damageRoll) {
      const newFormula = `${workflow.damageRoll.formula} + ${bonusRoll.total}`;
      workflow.damageTotal = (workflow.damageTotal ?? 0) + bonusRoll.total;
    }

    H.chatMessage(`
      <b>${workflow.actor.name}</b> — <b>The Stone Fist</b> strikes with devastating force!<br>
      Extra damage: <b>${bonusRoll.total}</b> bludgeoning (${dieDamage})<br>
      <small>${uses - 1} use(s) remaining.</small>
    `);
  }

  // ==========================
  // NUMBING BLOW — 1 ki, CON save or speed -10 + poisoned
  // ==========================

  static async _numbingBlow(workflow) {
    const actor = workflow.actor;
    const target = H.getFirstTarget();
    if (!target) return false;

    // Ki check — uses the system resource (ki points)
    const kiResource = actor.system.resources?.primary;
    if (!kiResource || kiResource.value < 1) {
      ui.notifications.warn("Not enough ki points (need 1).");
      return false;
    }

    // Spend ki
    await actor.update({ "system.resources.primary.value": kiResource.value - 1 });

    const dc = H.getStandardDC(actor, "wis"); // ki save DC = 8 + prof + WIS

    const { roll, success } = await H.promptSavingThrow(target.actor, "con", dc);

    if (!success) {
      // Apply speed reduction + poisoned
      const numbEffect = H.createEffectData(
        "Numbing Blow",
        "icons/magic/frost/snowflake-ice-blue.webp",
        [
          {
            key: "system.attributes.movement.walk",
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: "-10",
            priority: 20
          },
          {
            key: "macro.CE",
            mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
            value: "Poisoned",
            priority: 20
          }
        ],
        { rounds: 1, specialDuration: ["turnEnd"] }
      );
      await H.applyEffect(target.actor, numbEffect);

      H.chatMessage(`
        <b>${actor.name}</b> delivers a <b>Numbing Blow!</b><br>
        <b>${target.actor.name}</b> <span style="color:red">FAILS</span> CON save (${roll.total} vs DC ${dc}).<br>
        Speed reduced by 10 ft and <b>poisoned</b> until end of its next turn.
      `);
    } else {
      H.chatMessage(`
        <b>${actor.name}</b> attempts a <b>Numbing Blow</b>.<br>
        <b>${target.actor.name}</b> <span style="color:green">SAVES</span> (${roll.total} vs DC ${dc}).
      `);
    }
  }

  // ==========================
  // SELF-RELIANCE — 2 ki, end a condition
  // ==========================

  static async _selfReliance(workflow) {
    const actor = workflow.actor;
    const monkLevel = actor.classes?.monk?.system?.levels ?? 0;
    if (monkLevel < 6) {
      ui.notifications.warn("Self-Reliance requires monk level 6.");
      return false;
    }

    const kiResource = actor.system.resources?.primary;
    if (!kiResource || kiResource.value < 2) {
      ui.notifications.warn("Not enough ki points (need 2).");
      return false;
    }

    // Find applicable conditions on the actor
    const removable = ["blinded", "deafened", "paralyzed", "paralysed", "poisoned"];
    const activeConditions = actor.effects.filter(e =>
      removable.some(c => e.name.toLowerCase().includes(c))
    );

    if (activeConditions.length === 0) {
      ui.notifications.info("You don't have any removable conditions (blinded, deafened, paralysed, poisoned).");
      return false;
    }

    const buttons = activeConditions.map((e, i) => ({
      id: `cond_${i}`,
      label: e.name,
      value: e.id
    }));
    buttons.push({ id: "cancel", label: "Cancel", value: null });

    const chosen = await H.buttonDialog(
      "Self-Reliance",
      `<p>Spend 2 ki to end one condition. Choose which to remove:</p>`,
      buttons
    );

    if (!chosen) return false;

    await actor.update({ "system.resources.primary.value": kiResource.value - 2 });
    const effect = actor.effects.get(chosen);
    if (effect) await effect.delete();

    H.chatMessage(`
      <b>${actor.name}</b> uses <b>Self-Reliance</b>, mending their own body.<br>
      Condition removed: <b>${effect?.name ?? "Unknown"}</b> (2 ki spent).
    `);
  }

  // ==========================
  // FROZEN SINEW — Reaction, 1 ki, reduce BPS by 1d10+WIS+monk level
  // ==========================

  static async _frozenSinew(workflow) {
    // This is better handled via the preApplyDamage hook, but we provide
    // the manual trigger as a status check.
    const actor = workflow.actor;
    const monkLevel = actor.classes?.monk?.system?.levels ?? 0;
    if (monkLevel < 10) {
      ui.notifications.warn("Frozen Sinew requires monk level 10.");
      return false;
    }
    H.chatMessage(`<b>Frozen Sinew</b> is passive — it will prompt you automatically when you take bludgeoning, piercing, or slashing damage.`);
  }

  static async _onPreApplyDamage(workflow) {
    // Check each target — if this actor IS a target and IS a Grag monk
    if (!workflow?.targets) return;

    for (const target of workflow.targets) {
      const actor = target.actor;
      if (!actor || !this._isSubclass(actor)) continue;

      const monkLevel = actor.classes?.monk?.system?.levels ?? 0;
      if (monkLevel < 10) continue;

      // Check damage types
      const bpsTypes = ["bludgeoning", "piercing", "slashing"];
      const hasBPS = workflow.damageDetail?.some(d => bpsTypes.includes(d.type));
      if (!hasBPS) continue;

      // Check ki
      const kiResource = actor.system.resources?.primary;
      if (!kiResource || kiResource.value < 1) continue;

      // Check reaction
      const reactionUsed = await H.getFlag(actor, `${SUBCLASS}.reactionUsed`);
      if (reactionUsed) continue;

      const wisMod = H.getAbilityMod(actor, "wis");

      const choice = await H.buttonDialog(
        "Frozen Sinew — Reaction",
        `<p>You are about to take ${workflow.damageTotal} damage (includes BPS).</p>
         <p>Spend 1 ki and your reaction to reduce by <b>1d10 + ${wisMod} + ${monkLevel}</b>?</p>`,
        [
          { id: "yes", label: "Absorb it!", value: "yes" },
          { id: "no", label: "Take the hit", value: "no" }
        ]
      );

      if (choice !== "yes") continue;

      await actor.update({ "system.resources.primary.value": kiResource.value - 1 });
      await H.setFlag(actor, `${SUBCLASS}.reactionUsed`, true);

      const reductionRoll = await H.rollDice("1d10");
      const totalReduction = reductionRoll.total + wisMod + monkLevel;

      // Apply healing to offset (since Midi applies damage then we heal back)
      setTimeout(async () => {
        await H.applyHealing(target, Math.min(totalReduction, workflow.damageTotal));
      }, 500);

      H.chatMessage(`
        <b>${actor.name}</b> — <b>Frozen Sinew</b> absorbs the blow!<br>
        Damage reduced by <b>${totalReduction}</b> (1d10[${reductionRoll.total}] + ${wisMod} + ${monkLevel}).
      `);
    }
  }

  // ==========================
  // SHATTER STRIKE — 2/short rest, 2 ki, 3d8 + STR save or prone
  // ==========================

  static async _shatterStrike(workflow) {
    const actor = workflow.actor;
    const target = H.getFirstTarget();
    if (!target) return false;

    const monkLevel = actor.classes?.monk?.system?.levels ?? 0;
    if (monkLevel < 10) {
      ui.notifications.warn("Shatter Strike requires monk level 10.");
      return false;
    }

    const uses = await H.getUses(actor, `${SUBCLASS}.shatterStrike`);
    if (uses <= 0) {
      ui.notifications.warn("No Shatter Strike uses remaining (2/short rest).");
      return false;
    }

    const kiResource = actor.system.resources?.primary;
    if (!kiResource || kiResource.value < 2) {
      ui.notifications.warn("Not enough ki points (need 2).");
      return false;
    }

    await H.expendUse(actor, `${SUBCLASS}.shatterStrike`);
    await actor.update({ "system.resources.primary.value": kiResource.value - 2 });

    // Roll extra damage
    const damageRoll = await H.rollDice("3d8");
    const dc = H.getStandardDC(actor, "wis"); // ki save DC

    // Apply damage
    await H.applyDamage(target, damageRoll.total, "bludgeoning");

    // STR save for prone
    const { roll, success } = await H.promptSavingThrow(target.actor, "str", dc);

    let proneMsg = "";
    if (!success) {
      const proneEffect = H.createEffectData(
        "Prone (Shatter Strike)",
        "icons/svg/falling.svg",
        [
          {
            key: "macro.CE",
            mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
            value: "Prone",
            priority: 20
          }
        ],
        { specialDuration: ["turnEnd"] }
      );
      await H.applyEffect(target.actor, proneEffect);
      proneMsg = `<b>${target.actor.name}</b> is knocked <b>prone!</b> (STR ${roll.total} vs DC ${dc})`;
    } else {
      proneMsg = `<b>${target.actor.name}</b> stays standing (STR ${roll.total} vs DC ${dc})`;
    }

    H.chatMessage(`
      <b>${actor.name}</b> delivers a devastating <b>Shatter Strike!</b><br>
      Extra damage: <b>${damageRoll.total}</b> bludgeoning (3d8)<br>
      ${proneMsg}<br>
      <small>${uses - 1} use(s) remaining. 2 ki spent.</small>
    `);
  }

  // ==========================
  // Utility
  // ==========================

  static _isSubclass(actor) {
    if (!actor) return false;
    const hasFeature = actor.items.some(i =>
      i.type === "feat" &&
      (i.name.toLowerCase().includes("stone fist") ||
       i.name.toLowerCase().includes("gràg") ||
       i.name.toLowerCase().includes("grag") ||
       i.name.toLowerCase().includes("numbing blow"))
    );
    const hasFlag = H.getFlag(actor, `${SUBCLASS}.active`);
    return hasFeature || hasFlag;
  }
}
