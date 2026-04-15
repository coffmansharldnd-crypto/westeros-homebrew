// ============================================================================
// Bastard of the Woods — Barbarian Subclass Automation
// ============================================================================
// Features:
//   Level 3:  Bear Vice (grapple with escalating tightenings)
//   Level 3:  Sanding Edge (reaction — catch blade, convert slashing→bludgeoning)
//   Level 6:  Stone's Throw (bonus action leap from height → attack or Bear Vice)
//   Level 6:  Storm Clap (environmental stun, multiple methods)
//   Level 10: The Bear and the Maiden Fair (tame animals via Bear Vice)
// ============================================================================

import { WesterosHelpers as H } from "./helpers.mjs";

const MODULE_ID = "westeros-homebrew";
const SUBCLASS = "bastard-woods";

export class BastardWoods {

  static register() {
    H.log("Registering Bastard of the Woods automation");

    Hooks.on("dnd5e.restCompleted", this._onRest.bind(this));
    Hooks.on("midi-qol.preItemRoll", this._onPreItemRoll.bind(this));
    Hooks.on("midi-qol.preApplyDynamicEffects", this._onSandingEdgeReaction.bind(this));
  }

  // ==========================
  // REST HANDLER
  // ==========================

  static async _onRest(actor, result) {
    if (!this._isSubclass(actor)) return;
    const isLong = result.longRest;
    const strMod = H.getAbilityMod(actor, "str");

    if (isLong) {
      await H.resetOnLongRest(actor, `${SUBCLASS}.bearVice`, 3 + strMod);
      await H.setFlag(actor, `${SUBCLASS}.sandingEdgeReady`, true);
    } else {
      // Short rest restores 1 Bear Vice use
      await H.resetOnShortRest(actor, `${SUBCLASS}.bearVice`, 1);
      // Sanding Edge heals on short rest
      await H.setFlag(actor, `${SUBCLASS}.sandingEdgeReady`, true);
    }
  }

  // ==========================
  // PRE-ITEM ROLL — Feature dispatch
  // ==========================

  static async _onPreItemRoll(workflow) {
    if (!workflow?.actor || !this._isSubclass(workflow.actor)) return;
    const itemName = workflow.item?.name?.toLowerCase() ?? "";

    if (itemName.includes("bear vice")) {
      return this._bearVice(workflow);
    }
    if (itemName.includes("sanding edge")) {
      return this._sandingEdgeManual(workflow);
    }
    if (itemName.includes("stone's throw") || itemName.includes("stones throw")) {
      return this._stonesThrow(workflow);
    }
    if (itemName.includes("storm clap")) {
      return this._stormClap(workflow);
    }
    if (itemName.includes("bear and the maiden") || itemName.includes("maiden fair")) {
      return this._bearMaidenFair(workflow);
    }
  }

  // ==========================
  // BEAR VICE — Grapple with escalating tightenings
  // ==========================

  static async _bearVice(workflow) {
    const actor = workflow.actor;
    const target = H.getFirstTarget();
    if (!target) return false;

    const token = H.getTokenFromActor(actor);
    const dist = H.getDistanceBetweenTokens(token, target);
    if (dist > 5) {
      ui.notifications.warn("Target must be within 5 feet.");
      return false;
    }

    // Check uses
    const uses = await H.getUses(actor, `${SUBCLASS}.bearVice`);
    if (uses <= 0) {
      ui.notifications.warn("No Bear Vice uses remaining.");
      return false;
    }

    const strMod = H.getAbilityMod(actor, "str");
    const prof = H.getProfBonus(actor);
    let baseDC = 5 + prof + strMod;

    // Check if we're already in a Bear Vice grapple
    const currentGrapple = await H.getFlag(actor, `${SUBCLASS}.bearViceState`);

    if (currentGrapple && currentGrapple.targetId === target.actor.id) {
      // Continue tightening
      return this._bearViceTighten(actor, target, currentGrapple);
    }

    // New grapple attempt
    await H.expendUse(actor, `${SUBCLASS}.bearVice`);

    const { roll, success } = await H.promptSavingThrow(target.actor, "str", baseDC);

    if (!success) {
      // Apply Grappled
      const grappleEffect = H.createEffectData(
        "Bear Vice — Grappled",
        "icons/skills/melee/unarmed-punch-fist-yellow-red.webp",
        [
          {
            key: "system.attributes.movement.walk",
            mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
            value: "0",
            priority: 50
          },
          {
            key: "macro.CE",
            mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
            value: "Grappled",
            priority: 20
          }
        ],
        { rounds: 10 } // lasts until escape
      );
      await H.applyEffect(target.actor, grappleEffect);

      // Track state
      await H.setFlag(actor, `${SUBCLASS}.bearViceState`, {
        targetId: target.actor.id,
        tightenCount: 0,
        dcPenalty: 0,
        baseDC
      });

      H.chatMessage(`
        <b>${actor.name}</b> wraps <b>${target.actor.name}</b> in a crushing <b>Bear Vice!</b><br>
        <span style="color:red">${target.actor.name} FAILS</span> STR save (${roll.total} vs DC ${baseDC}) — <b>Grappled!</b><br>
        <small>Use Bear Vice again as a bonus action to tighten (up to 3 times). DC decreases by 1 each tighten.</small><br>
        <small>${uses - 1} Bear Vice use(s) remaining.</small>
      `);
    } else {
      H.chatMessage(`
        <b>${actor.name}</b> attempts a <b>Bear Vice</b> on <b>${target.actor.name}</b>.<br>
        <span style="color:green">${target.actor.name} BREAKS FREE</span> (${roll.total} vs DC ${baseDC}).
      `);
    }
  }

  static async _bearViceTighten(actor, target, state) {
    const tighten = state.tightenCount + 1;
    const dc = state.baseDC - tighten; // DC decreases by 1 per tighten
    const strMod = H.getAbilityMod(actor, "str");

    if (tighten > 3) {
      H.chatMessage("Bear Vice has reached maximum tightening (3).");
      return;
    }

    const { roll, success } = await H.promptSavingThrow(target.actor, "str", dc);

    if (success) {
      // Escape!
      await H.removeEffect(target.actor, "Bear Vice — Grappled");
      await H.removeEffect(target.actor, "Bear Vice — Restrained");
      await H.unsetFlag(actor, `${SUBCLASS}.bearViceState`);

      H.chatMessage(`
        <b>${target.actor.name}</b> <span style="color:green">breaks free</span> from the Bear Vice! (${roll.total} vs DC ${dc})
      `);
      return;
    }

    // Tighten effects
    let tightenMsg = "";

    if (tighten === 1) {
      // First tighten: 1d4 + STR damage
      const dmgRoll = await H.rollDice(`1d4 + ${strMod}`);
      await H.applyDamage(target, dmgRoll.total, "bludgeoning");
      tightenMsg = `<b>First Tighten:</b> ${dmgRoll.total} bludgeoning damage (1d4 + ${strMod})`;
    } else if (tighten === 2) {
      // Second tighten: upgrade to Restrained
      await H.removeEffect(target.actor, "Bear Vice — Grappled");
      const restrainEffect = H.createEffectData(
        "Bear Vice — Restrained",
        "icons/skills/melee/unarmed-punch-fist-yellow-red.webp",
        [
          {
            key: "system.attributes.movement.walk",
            mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
            value: "0",
            priority: 50
          },
          {
            key: "flags.midi-qol.disadvantage.attack.all",
            mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
            value: "1",
            priority: 20
          },
          {
            key: "flags.midi-qol.grants.advantage.attack.all",
            mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
            value: "1",
            priority: 20
          }
        ],
        { rounds: 10 }
      );
      await H.applyEffect(target.actor, restrainEffect);
      tightenMsg = `<b>Second Tighten:</b> Upgraded to <b>Restrained!</b> (adv on attacks against, disadv on their attacks)`;
    } else if (tighten === 3) {
      // Third tighten: Unconscious
      await H.removeEffect(target.actor, "Bear Vice — Restrained");
      const unconsciousEffect = H.createEffectData(
        "Bear Vice — Unconscious",
        "icons/svg/unconscious.svg",
        [
          {
            key: "macro.CE",
            mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
            value: "Unconscious",
            priority: 20
          }
        ],
        { rounds: 10 }
      );
      await H.applyEffect(target.actor, unconsciousEffect);
      tightenMsg = `<b>Third Tighten:</b> <b>${target.actor.name}</b> falls <b>Unconscious!</b> They exit the battle.`;
    }

    // Update state
    await H.setFlag(actor, `${SUBCLASS}.bearViceState`, {
      ...state,
      tightenCount: tighten,
      dcPenalty: tighten
    });

    H.chatMessage(`
      <b>${actor.name}</b> tightens the <b>Bear Vice!</b><br>
      <span style="color:red">${target.actor.name} FAILS</span> STR save (${roll.total} vs DC ${dc}).<br>
      ${tightenMsg}
    `);
  }

  // ==========================
  // SANDING EDGE — Reaction to catch blade
  // ==========================

  static async _onSandingEdgeReaction(workflow) {
    if (!workflow?.targets) return;

    for (const target of workflow.targets) {
      const actor = target.actor;
      if (!actor || !this._isSubclass(actor)) continue;

      // Check if the incoming damage is slashing
      const hasSlashing = workflow.damageDetail?.some(d => d.type === "slashing");
      if (!hasSlashing) continue;

      // Check if sanding edge is ready
      const ready = await H.getFlag(actor, `${SUBCLASS}.sandingEdgeReady`);
      if (!ready) continue;

      const choice = await H.buttonDialog(
        "Sanding Edge — Reaction",
        `<p>An enemy attacks you with a slashing weapon dealing <b>${workflow.damageTotal}</b> damage.</p>
         <p>Catch the blade? You take <b>full damage + 1d8</b> this hit, but all future slashing from this weapon becomes <b>bludgeoning</b> (which you resist).</p>`,
        [
          { id: "catch", label: "Catch the Blade!", value: "catch" },
          { id: "pass", label: "Take the hit normally", value: "pass" }
        ]
      );

      if (choice !== "catch") continue;

      await H.setFlag(actor, `${SUBCLASS}.sandingEdgeReady`, false);

      // Extra 1d8 damage from catching
      const extraRoll = await H.rollDice("1d8");

      // Apply resistance to bludgeoning effect on self
      const resistEffect = H.createEffectData(
        "Sanding Edge — Bludgeoning Resistance",
        "icons/equipment/hand/gauntlet-plate-grey.webp",
        [
          {
            key: "system.traits.dr.value",
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: "bludgeoning",
            priority: 20
          }
        ],
        {} // permanent passive from subclass
      );
      // Only add if not already present
      if (!actor.effects.some(e => e.name === "Sanding Edge — Bludgeoning Resistance")) {
        await H.applyEffect(actor, resistEffect);
      }

      // Mark the enemy's weapon as sanded (flag on enemy)
      const attackerId = workflow.actor?.id;
      if (attackerId) {
        await H.setFlag(workflow.actor, `${SUBCLASS}.sandedWeapon`, workflow.item?.id);
      }

      H.chatMessage(`
        <b>${actor.name}</b> catches the blade with a bare hand — <b>Sanding Edge!</b><br>
        Takes an extra <b>${extraRoll.total}</b> damage (1d8) from the catch.<br>
        The weapon's <b>slashing</b> damage is converted to <b>bludgeoning</b>.<br>
        ${actor.name} has <b>resistance to bludgeoning</b> damage.<br>
        <small>Sanding Edge recovers on short or long rest, or via healing spell/bandages.</small>
      `);
    }
  }

  static async _sandingEdgeManual(workflow) {
    const ready = await H.getFlag(workflow.actor, `${SUBCLASS}.sandingEdgeReady`);
    H.chatMessage(`<b>Sanding Edge</b> is ${ready ? "<b>ready</b>" : "<b>spent</b> (heals on short rest, healing spell, or bandages)"}.`);
  }

  // ==========================
  // STONE'S THROW — Bonus action leap attack
  // ==========================

  static async _stonesThrow(workflow) {
    const actor = workflow.actor;
    const target = H.getFirstTarget();
    if (!target) return false;

    const barbLevel = actor.classes?.barbarian?.system?.levels ?? 0;
    if (barbLevel < 6) {
      ui.notifications.warn("Stone's Throw requires barbarian level 6.");
      return false;
    }

    const dexMod = H.getAbilityMod(actor, "dex");
    const prof = H.getProfBonus(actor);
    const dc = 5 + prof + dexMod;

    const { roll, success } = await H.promptSavingThrow(target.actor, "dex", dc);

    if (!success) {
      const actionChoice = await H.buttonDialog(
        "Stone's Throw — Success!",
        `<p><b>${target.actor.name}</b> <span style="color:red">FAILS</span> DEX save (${roll.total} vs DC ${dc})!</p>
         <p>Choose your follow-up:</p>`,
        [
          { id: "attack", label: "Attack Twice", value: "attack" },
          { id: "vice", label: "Bear Vice (skip 1st tighten)", value: "vice" }
        ]
      );

      if (actionChoice === "attack") {
        H.chatMessage(`
          <b>${actor.name}</b> leaps from above! <b>Stone's Throw!</b><br>
          <b>${target.actor.name}</b> fails DEX save — <b>two attacks</b> this turn!<br>
          <small>Roll your attacks manually.</small>
        `);
      } else if (actionChoice === "vice") {
        // Enter Bear Vice with first tighten already applied
        const strMod = H.getAbilityMod(actor, "str");
        const baseDC = 5 + prof + strMod;

        const grappleEffect = H.createEffectData(
          "Bear Vice — Grappled",
          "icons/skills/melee/unarmed-punch-fist-yellow-red.webp",
          [
            {
              key: "system.attributes.movement.walk",
              mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
              value: "0",
              priority: 50
            }
          ],
          { rounds: 10 }
        );
        await H.applyEffect(target.actor, grappleEffect);

        // First tighten damage auto-applied
        const dmgRoll = await H.rollDice(`1d4 + ${strMod}`);
        await H.applyDamage(target, dmgRoll.total, "bludgeoning");

        await H.setFlag(actor, `${SUBCLASS}.bearViceState`, {
          targetId: target.actor.id,
          tightenCount: 1,
          dcPenalty: 0, // No DC penalty — Stone's Throw exempts
          baseDC
        });

        H.chatMessage(`
          <b>${actor.name}</b> leaps and crushes <b>${target.actor.name}</b> in a <b>Bear Vice!</b><br>
          First tighten auto-applied: <b>${dmgRoll.total}</b> bludgeoning.<br>
          No DC penalty for subsequent tightenings (Stone's Throw bonus).<br>
          <small>Continue tightening with Bear Vice on subsequent turns.</small>
        `);
      }
    } else {
      H.chatMessage(`
        <b>${actor.name}</b> leaps from above, but <b>${target.actor.name}</b> <span style="color:green">dodges!</span> (${roll.total} vs DC ${dc})
      `);
    }
  }

  // ==========================
  // STORM CLAP — Environmental stun
  // ==========================

  static async _stormClap(workflow) {
    const actor = workflow.actor;
    const barbLevel = actor.classes?.barbarian?.system?.levels ?? 0;
    if (barbLevel < 6) {
      ui.notifications.warn("Storm Clap requires barbarian level 6.");
      return false;
    }

    // Choose method
    const method = await H.buttonDialog(
      "Storm Clap — Choose Method",
      `<p>How do you produce the thunder?</p>`,
      [
        { id: "stone", label: "Shatter Stone (STR check)", value: "stone" },
        { id: "wind", label: "Shatter Wind (bladder, auto)", value: "wind" },
        { id: "oak", label: "Shatter Oak (STR DC 20)", value: "oak" },
        { id: "ice", label: "Shatter Ice (STR check)", value: "ice" },
        { id: "other", label: "Other (DM discretion)", value: "other" },
        { id: "cancel", label: "Cancel", value: null }
      ]
    );

    if (!method) return false;

    let succeeded = false;

    if (method === "wind") {
      // Auto-success if bladder prepared
      const hasBladder = await H.getFlag(actor, `${SUBCLASS}.bladderPrepared`);
      if (!hasBladder) {
        ui.notifications.warn("You need a prepared air bladder! Prepare one during downtime.");
        return false;
      }
      await H.unsetFlag(actor, `${SUBCLASS}.bladderPrepared`);
      succeeded = true;
    } else if (method === "oak") {
      const strRoll = await H.rollDice("1d20 + " + H.getAbilityMod(actor, "str"));
      succeeded = strRoll.total >= 20;
      H.chatMessage(`STR check to crack oak: <b>${strRoll.total}</b> vs DC 20 — ${succeeded ? "<span style='color:green'>SUCCESS</span>" : "<span style='color:red'>FAIL</span>"}`);
    } else if (method === "stone" || method === "ice" || method === "other") {
      // DM sets DC — prompt for it
      const dcInput = await H.buttonDialog(
        "Storm Clap — DM Sets DC",
        `<p>DM: What is the DC for this Storm Clap attempt?</p>`,
        [
          { id: "10", label: "DC 10 (Easy)", value: 10 },
          { id: "13", label: "DC 13 (Medium)", value: 13 },
          { id: "15", label: "DC 15 (Hard)", value: 15 },
          { id: "18", label: "DC 18 (Very Hard)", value: 18 }
        ]
      );

      if (!dcInput) return false;
      const dc = Number(dcInput);
      const strRoll = await H.rollDice("1d20 + " + H.getAbilityMod(actor, "str"));
      succeeded = strRoll.total >= dc;
      H.chatMessage(`STR check: <b>${strRoll.total}</b> vs DC ${dc} — ${succeeded ? "<span style='color:green'>SUCCESS</span>" : "<span style='color:red'>FAIL</span>"}`);
    }

    if (!succeeded) {
      H.chatMessage(`<b>${actor.name}</b> fails to produce the Storm Clap.`);
      return;
    }

    // Apply stunned to ALL creatures within 10 ft (including allies!)
    const token = H.getTokenFromActor(actor);
    if (!token) return;

    const allNearby = H.getTokensInRadius(token, 10);
    let stunned = [];

    for (const t of allNearby) {
      const stunEffect = H.createEffectData(
        "Storm Clap — Stunned",
        "icons/magic/sonic/explosion-shock-wave-teal.webp",
        [
          {
            key: "macro.CE",
            mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
            value: "Stunned",
            priority: 20
          },
          {
            key: "flags.midi-qol.grants.advantage.attack.all",
            mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
            value: "1",
            priority: 20
          }
        ],
        { rounds: 1, specialDuration: ["turnEnd"] }
      );
      await H.applyEffect(t.actor, stunEffect);
      stunned.push(t.actor.name);
    }

    H.chatMessage(`
      <h3>⚡ Storm Clap!</h3>
      <p><b>${actor.name}</b> produces a deafening crack via <b>${method}</b>!</p>
      <p><b>All creatures</b> within 10 ft are <b>stunned</b> for 1 turn cycle:</p>
      <p>${stunned.join(", ") || "No creatures in range."}</p>
      <p><small>Warning: This affects allies too!</small></p>
    `);
  }

  // ==========================
  // THE BEAR AND THE MAIDEN FAIR — Level 10 animal taming
  // ==========================

  static async _bearMaidenFair(workflow) {
    const actor = workflow.actor;
    const barbLevel = actor.classes?.barbarian?.system?.levels ?? 0;
    if (barbLevel < 10) {
      ui.notifications.warn("The Bear and the Maiden Fair requires barbarian level 10.");
      return false;
    }

    const target = H.getFirstTarget();
    if (!target) return false;

    // Check if we're currently in a Bear Vice at stage 3 with this target
    const state = await H.getFlag(actor, `${SUBCLASS}.bearViceState`);

    if (!state || state.targetId !== target.actor.id || state.tightenCount < 3) {
      H.chatMessage(`
        <b>The Bear and the Maiden Fair</b> — You must first reach the <b>third tightening</b> of Bear Vice with a non-intelligent creature (animal) to tame it.<br>
        <small>Initiate a Bear Vice on the creature first.</small>
      `);
      return false;
    }

    // Determine creature size for effects
    const creatureSize = target.actor.system.traits?.size ?? "med";
    let damageDice, specialAbility;

    if (["tiny", "sm"].includes(creatureSize)) {
      damageDice = "2d4";
      specialAbility = "latch onto enemy's face → <b>stunned</b> for 1 turn";
    } else if (creatureSize === "med") {
      damageDice = "3d4";
      specialAbility = "tackle → <b>grappled</b> for 1 turn (skip 1st Bear Vice tighten)";
    } else {
      damageDice = "4d4";
      specialAbility = "charge → <b>frightened</b> for 1 turn";
    }

    // Remove unconscious, set as tamed
    await H.removeEffect(target.actor, "Bear Vice — Unconscious");
    await H.unsetFlag(actor, `${SUBCLASS}.bearViceState`);

    // Flag the tamed creature
    await H.setFlag(actor, `${SUBCLASS}.tamedCreature`, {
      id: target.actor.id,
      name: target.actor.name,
      size: creatureSize,
      damageDice,
      specialAbility
    });

    H.chatMessage(`
      <h3>🐻 The Bear and the Maiden Fair!</h3>
      <p><b>${actor.name}</b> releases their grip. <b>${target.actor.name}</b> recognises a worthy equal.</p>
      <p><b>Tamed creature:</b> ${target.actor.name} (${creatureSize})</p>
      <p><b>Damage:</b> ${damageDice} per turn</p>
      <p><b>Special:</b> ${specialAbility}</p>
      <p><small>In combat: fights until encounter ends. Outside combat: 3 utility tasks then returns to nature.</small></p>
    `);
  }

  // ==========================
  // Utility
  // ==========================

  static _isSubclass(actor) {
    if (!actor) return false;
    const hasFeature = actor.items.some(i =>
      i.type === "feat" &&
      (i.name.toLowerCase().includes("bear vice") ||
       i.name.toLowerCase().includes("sanding edge") ||
       i.name.toLowerCase().includes("bastard") ||
       i.name.toLowerCase().includes("storm clap"))
    );
    const hasFlag = H.getFlag(actor, `${SUBCLASS}.active`);
    return hasFeature || hasFlag;
  }
}
