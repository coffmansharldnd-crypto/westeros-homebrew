// ============================================================================
// Circle of the Greenblood — Druid Subclass Automation
// ============================================================================
// Features:
//   Level 2:  Poison Spray cantrip (granted), Tongue of Blossom (proficiency)
//   Level 3:  Circle Spells (auto-prepared), Two Branches of the Root
//   Level 6:  The Ground Provides (Healer's Garden — AoE regen)
//   Level 10: Sangre Verde (drop to 10 HP, burst heal, difficult terrain)
// ============================================================================

import { WesterosHelpers as H } from "./helpers.mjs";

const MODULE_ID = "westeros-homebrew";
const SUBCLASS = "greenblood";

export class Greenblood {

  static register() {
    H.log("Registering Circle of the Greenblood automation");

    Hooks.on("dnd5e.restCompleted", this._onRest.bind(this));
    Hooks.on("midi-qol.preItemRoll", this._onPreItemRoll.bind(this));
    Hooks.on("midi-qol.RollComplete", this._onHealComplete.bind(this));
    Hooks.on("preUpdateActor", this._onPreUpdateActor.bind(this));

    // Combat turn hook for Healer's Garden regen
    Hooks.on("combatTurnChange", this._onTurnChange.bind(this));
  }

  // ==========================
  // REST HANDLER
  // ==========================

  static async _onRest(actor, result) {
    if (!this._isSubclass(actor)) return;
    const isLong = result.longRest;

    if (isLong) {
      const wisMod = H.getAbilityMod(actor, "wis");

      // Two Branches of the Root: WIS mod uses per long rest
      await H.resetOnLongRest(actor, `${SUBCLASS}.twoBranches`, Math.max(wisMod, 1));

      // The Ground Provides: 1/long rest
      await H.resetOnLongRest(actor, `${SUBCLASS}.groundProvides`, 1);

      // Tongue of Blossom — Speak with Plants: 1/long rest
      await H.resetOnLongRest(actor, `${SUBCLASS}.speakPlants`, 1);

      // Sangre Verde: 2-long-rest cooldown
      const svCounter = (await H.getFlag(actor, `${SUBCLASS}.sangreVerdeCounter`)) ?? 0;
      if (svCounter > 0) {
        await H.setFlag(actor, `${SUBCLASS}.sangreVerdeCounter`, svCounter - 1);
        if (svCounter - 1 === 0) {
          H.chatMessage(`<b>${actor.name}</b> — <i>Sangre Verde</i> is available again.`);
        }
      }
    }
  }

  // ==========================
  // PRE-ITEM ROLL — Feature dispatch
  // ==========================

  static async _onPreItemRoll(workflow) {
    if (!workflow?.actor || !this._isSubclass(workflow.actor)) return;
    const itemName = workflow.item?.name?.toLowerCase() ?? "";

    if (itemName.includes("two branches") || itemName.includes("two faces")) {
      return this._twoBranches(workflow);
    }
    if (itemName.includes("ground provides") || itemName.includes("healer's garden")) {
      return this._groundProvides(workflow);
    }
    if (itemName.includes("sangre verde")) {
      return this._sangreVerdeManual(workflow);
    }
  }

  // ==========================
  // TWO BRANCHES OF THE ROOT — Poison rider on healing spells
  // ==========================

  static async _onHealComplete(workflow) {
    if (!workflow?.actor || !this._isSubclass(workflow.actor)) return;

    // Check if the spell restored HP
    const item = workflow.item;
    if (!item || item.type !== "spell") return;

    // Check if this spell heals — look at the damageRoll for healing type
    const isHealingSpell = workflow.item?.system?.damage?.parts?.some(
      p => p[1] === "healing"
    ) || item.name.toLowerCase().includes("heal") ||
      item.name.toLowerCase().includes("cure") ||
      item.name.toLowerCase().includes("restoration");

    if (!isHealingSpell) return;

    // Check uses
    const uses = await H.getUses(workflow.actor, `${SUBCLASS}.twoBranches`);
    if (uses <= 0) return;

    // Get healed target(s)
    const targets = H.getAllTargets();
    if (targets.length === 0) return;

    const choice = await H.buttonDialog(
      "Two Branches of the Root",
      `<p>You cast a healing spell. Trigger <b>Two Branches of the Root</b> to deal poison damage to a creature within 5 ft of the healed target?</p>
       <p><small>${uses} use(s) remaining (WIS mod/long rest)</small></p>`,
      [
        { id: "yes", label: "Invoke the Root", value: "yes" },
        { id: "no", label: "Heal only", value: "no" }
      ]
    );

    if (choice !== "yes") return;

    await H.expendUse(workflow.actor, `${SUBCLASS}.twoBranches`);

    const dc = H.getStandardDC(workflow.actor, "wis");
    const wisMod = H.getAbilityMod(workflow.actor, "wis");

    // Prompt: target the creature to receive poison damage
    H.chatMessage(`
      <b>${workflow.actor.name}</b> — <b>Two Branches of the Root</b> activated!<br>
      Target a creature within 5 ft of the healed target. It must make a <b>CON save DC ${dc}</b>
      or take <b>1d8 + ${wisMod} poison damage</b>.<br>
      <small>Select the poison target and use the button below, or apply manually.</small>
    `);

    // Auto-resolve if there's a secondary target
    // In practice, the player should target the poison victim before casting.
    // We provide the damage roll for manual application:
    const poisonRoll = await H.rollDice(`1d8 + ${wisMod}`);
    H.chatMessage(`
      Poison damage roll: <b>${poisonRoll.total}</b> (1d8 + ${wisMod})<br>
      <small>Apply to the failing creature manually, or target them before casting next time.</small>
    `);
  }

  // ==========================
  // THE GROUND PROVIDES — Healer's Garden (AoE regen)
  // ==========================

  static async _groundProvides(workflow) {
    const actor = workflow.actor;

    const uses = await H.getUses(actor, `${SUBCLASS}.groundProvides`);
    if (uses <= 0) {
      ui.notifications.warn("The Ground Provides has been used (1/long rest).");
      return false;
    }

    const wisMod = H.getAbilityMod(actor, "wis");
    const rounds = Math.max(wisMod, 1);

    await H.expendUse(actor, `${SUBCLASS}.groundProvides`);

    // Place a flag on the actor marking the garden's location and duration
    const token = H.getTokenFromActor(actor);
    if (!token) return;

    await H.setFlag(actor, `${SUBCLASS}.gardenActive`, true);
    await H.setFlag(actor, `${SUBCLASS}.gardenLocation`, { x: token.x, y: token.y });
    await H.setFlag(actor, `${SUBCLASS}.gardenRounds`, rounds);
    await H.setFlag(actor, `${SUBCLASS}.gardenHealAmount`, Math.max(wisMod, 1));

    // Apply a visual marker effect to the caster
    const gardenEffect = H.createEffectData(
      "Healer's Garden Active",
      "icons/magic/nature/leaf-rune-glow-green.webp",
      [],
      { rounds }
    );
    await H.applyEffect(actor, gardenEffect);

    H.chatMessage(`
      <b>${actor.name}</b> kneels and the earth blooms — <b>The Ground Provides!</b><br>
      A <b>Healer's Garden</b> (5 ft radius) appears at their position.<br>
      Friendly creatures starting their turn in the garden heal <b>${Math.max(wisMod, 1)} HP</b>.<br>
      Duration: <b>${rounds} rounds</b>.<br>
      <small>Place a template or tile at the token's position to mark the area.</small>
    `);
  }

  // ==========================
  // HEALER'S GARDEN — Turn-start regen
  // ==========================

  static async _onTurnChange(combat, prior, current) {
    // Check all Greenblood druids for active gardens
    for (const t of canvas.tokens.placeables) {
      const actor = t.actor;
      if (!actor || !this._isSubclass(actor)) continue;

      const gardenActive = await H.getFlag(actor, `${SUBCLASS}.gardenActive`);
      if (!gardenActive) continue;

      const gardenLoc = await H.getFlag(actor, `${SUBCLASS}.gardenLocation`);
      const healAmount = await H.getFlag(actor, `${SUBCLASS}.gardenHealAmount`) ?? 1;
      let roundsLeft = await H.getFlag(actor, `${SUBCLASS}.gardenRounds`) ?? 0;

      if (roundsLeft <= 0) {
        await H.setFlag(actor, `${SUBCLASS}.gardenActive`, false);
        await H.removeEffect(actor, "Healer's Garden Active");
        continue;
      }

      // Find the combatant whose turn just started
      const currentCombatant = combat.combatants.get(current.combatantId);
      const currentToken = currentCombatant?.token?.object;
      if (!currentToken || !currentToken.actor) continue;

      // Check if friendly and within 5 ft of garden location
      if (currentToken.document.disposition !== CONST.TOKEN_DISPOSITIONS.FRIENDLY) continue;

      const gs = canvas.grid.size;
      const dx = Math.abs(currentToken.x - gardenLoc.x);
      const dy = Math.abs(currentToken.y - gardenLoc.y);
      const distFt = Math.max(dx, dy) / gs * canvas.scene.grid.distance;

      if (distFt <= 5) {
        await H.applyHealing(currentToken, healAmount);
        H.chatMessage(`
          <b>${currentToken.actor.name}</b> stands in the <b>Healer's Garden</b> and regains <b>${healAmount} HP</b>.
        `);
      }

      // Decrement rounds (once per full round)
      if (current.turn === 0) {
        await H.setFlag(actor, `${SUBCLASS}.gardenRounds`, roundsLeft - 1);
      }
    }
  }

  // ==========================
  // SANGRE VERDE — Level 10 Capstone
  // ==========================

  static async _onPreUpdateActor(actor, changes, options, userId) {
    if (!this._isSubclass(actor)) return;

    const newHp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
    if (newHp === undefined || newHp > 0) return;

    const currentHp = actor.system.attributes.hp.value;
    if (currentHp <= 0) return;

    const druidLevel = actor.classes?.druid?.system?.levels ?? 0;
    if (druidLevel < 10) return;

    const counter = await H.getFlag(actor, `${SUBCLASS}.sangreVerdeCounter`);
    if (counter && counter > 0) return;

    const wisMod = H.getAbilityMod(actor, "wis");
    const healBase = wisMod + Math.floor(druidLevel / 2);

    const choice = await H.buttonDialog(
      "Sangre Verde",
      `<p><i>"They say their blood runs green..."</i></p>
       <p>You are dropping to 0 HP. Activate <b>Sangre Verde</b>?</p>
       <p>Drop to <b>10 HP</b> instead. Allies within 15 ft heal <b>${wisMod} + ${Math.floor(druidLevel / 2)} + 1d8</b>.</p>
       <p>Ground within 15 ft becomes difficult terrain for hostiles for 1 round.</p>`,
      [
        { id: "rise", label: "Sangre Verde!", value: "rise" },
        { id: "fall", label: "Accept fate", value: "fall" }
      ]
    );

    if (choice !== "rise") return;

    // Override HP to 10
    changes.system.attributes.hp.value = 10;

    // Set 2-long-rest cooldown
    await H.setFlag(actor, `${SUBCLASS}.sangreVerdeCounter`, 2);

    // Roll healing burst
    const healRoll = await H.rollDice("1d8");
    const totalHeal = healBase + healRoll.total;

    const token = H.getTokenFromActor(actor);
    if (token) {
      // Heal allies within 15 ft
      const allies = H.getTokensInRadius(token, 15, CONST.TOKEN_DISPOSITIONS.FRIENDLY);
      for (const ally of allies) {
        await H.applyHealing(ally, totalHeal);
      }

      // Apply difficult terrain effect to hostiles (visual marker)
      const hostiles = H.getTokensInRadius(token, 15, CONST.TOKEN_DISPOSITIONS.HOSTILE);
      for (const hostile of hostiles) {
        const terrainEffect = H.createEffectData(
          "Sangre Verde — Entangling Roots",
          "icons/magic/nature/root-vine-entangled-green.webp",
          [
            {
              key: "system.attributes.movement.walk",
              mode: H.MODE.MULTIPLY,
              value: "0.5",
              priority: 20
            }
          ],
          { rounds: 1, specialDuration: ["turnStartSource"] }
        );
        await H.applyEffect(hostile.actor, terrainEffect);
      }
    }

    H.chatMessage(`
      <h3>🌿 Sangre Verde!</h3>
      <p><b>${actor.name}</b>'s blood runs green — the Mother's power surges!</p>
      <p>Drops to <b>10 HP</b> instead of 0.</p>
      <p>Allies within 15 ft heal <b>${totalHeal}</b> (${wisMod} + ${Math.floor(druidLevel / 2)} + ${healRoll.total}).</p>
      <p>Hostile creatures within 15 ft treat the ground as <b>difficult terrain</b> for 1 round.</p>
      <p><small>Cooldown: 2 long rests.</small></p>
    `);
  }

  static async _sangreVerdeManual(workflow) {
    const actor = workflow.actor;
    const counter = await H.getFlag(actor, `${SUBCLASS}.sangreVerdeCounter`) ?? 0;
    if (counter > 0) {
      H.chatMessage(`<b>Sangre Verde</b> is on cooldown — <b>${counter}</b> long rest(s) remaining.`);
    } else {
      H.chatMessage(`<b>Sangre Verde</b> is <b>available</b>. It will trigger automatically when you drop to 0 HP.`);
    }
  }

  // ==========================
  // TWO BRANCHES (manual item trigger)
  // ==========================

  static async _twoBranches(workflow) {
    const actor = workflow.actor;
    const uses = await H.getUses(actor, `${SUBCLASS}.twoBranches`);
    H.chatMessage(`<b>Two Branches of the Root</b>: <b>${uses}</b> use(s) remaining. It triggers automatically when you cast a healing spell.`);
  }

  // ==========================
  // Utility
  // ==========================

  static _isSubclass(actor) {
    if (!actor) return false;
    const hasFeature = actor.items.some(i =>
      i.type === "feat" &&
      (i.name.toLowerCase().includes("greenblood") ||
       i.name.toLowerCase().includes("two branches") ||
       i.name.toLowerCase().includes("ground provides") ||
       i.name.toLowerCase().includes("sangre verde") ||
       i.name.toLowerCase().includes("curandera"))
    );
    const hasFlag = H.getFlag(actor, `${SUBCLASS}.active`);
    return hasFeature || hasFlag;
  }
}
