// ============================================================================
// The Spurned Saltling — Fighter Subclass Automation
// ============================================================================
// Karma Scale: -25 (Abyssal) to +25 (Ascendant)
//
// Features:
//   Level 3:  Brackish Blood, Salt Scourge, The Tainted Limb, Tidal Surge
//   Level 3+: Karma System (tracks moral choices, gates abilities)
//
// ABYSSAL PATH (Tainted Limb Evolution):
//   Karma -8:  Constricting Grasp (grapple on limb hit)
//   Karma -13: Elongated Reach (10ft reach, 1d8)
//   Karma -15: PATH LOCK — Beast's Brand (permanent -2 CHA vs non-Ironborn)
//   Karma -18: Barbed Maw (poison + extra damage)
//   Karma -23: The Maw Beneath (Capstone)
//
// ASCENDANT PATH (Noble Soul):
//   Karma +8:  Inspiring Presence (reaction +1d4)
//   Karma +13: Mark of Defiance (force disadvantage on attacks vs others)
//   Karma +15: PATH LOCK — Saint's Halo (permanent +2 CHA vs non-Ironborn)
//   Karma +18: Heart of the Storm (enhanced Second Wind)
//   Karma +23: The Iron Seat (Capstone)
//
// Level 7 Features (The Forking Tide):
//   Karma -8 or lower:  Apex Predator
//   Karma +8 or higher: Iron Discipline
//   Karma -5 to +5:     Stillwater
//
// Level 10 Capstones:
//   Karma -23 or lower: The Maw Beneath
//   Karma +23 or higher: The Iron Seat
//   Karma -5 to +5 (maintained): Weight of Stillwater
// ============================================================================

import { WesterosHelpers as H } from "./helpers.mjs";

const MODULE_ID = "westeros-homebrew";
const SUBCLASS = "spurned-saltling";

// Karma constants for easy reference and maintenance
const KARMA = {
  MIN: -25,
  MAX: 25,
  // Ability unlock thresholds
  CONSTRICTING_GRASP: -8,
  ELONGATED_REACH: -13,
  BARBED_MAW: -18,
  MAW_BENEATH: -23,
  INSPIRING_PRESENCE: 8,
  MARK_OF_DEFIANCE: 13,
  HEART_OF_STORM: 18,
  IRON_SEAT: 23,
  // Path lock thresholds
  BEAST_BRAND: -15,
  SAINT_HALO: 15,
  // Level 7 feature thresholds
  APEX_PREDATOR: -8,
  IRON_DISCIPLINE: 8,
  STILLWATER_MIN: -5,
  STILLWATER_MAX: 5,
  // Passive tier boundaries (Abyssal)
  TIER_UNSETTLING_MAX: -1,
  TIER_UNSETTLING_MIN: -5,
  TIER_CREEPING_MAX: -6,
  TIER_CREEPING_MIN: -10,
  TIER_FADING_MAX: -11,
  TIER_FADING_MIN: -15,
  TIER_BEAST_ASCENDS_MAX: -16,
  TIER_BEAST_ASCENDS_MIN: -20,
  TIER_DROWNED_MAX: -21,
  TIER_DROWNED_MIN: -25,
  // Passive tier boundaries (Ascendant)
  TIER_GLIMMER_MIN: 1,
  TIER_GLIMMER_MAX: 5,
  TIER_AGAINST_MIN: 6,
  TIER_AGAINST_MAX: 10,
  TIER_DEFIANT_MIN: 11,
  TIER_DEFIANT_MAX: 15,
  TIER_HEART_MIN: 16,
  TIER_HEART_MAX: 20,
  TIER_LEGEND_MIN: 21,
  TIER_LEGEND_MAX: 25
};

export class SpurnedSaltling {

  static register() {
    H.log("Registering The Spurned Saltling automation (Karma scale: -25 to +25)");

    // Rest hooks for resource resets
    Hooks.on("dnd5e.restCompleted", this._onRest.bind(this));

    // Midi-QOL hooks
    Hooks.on("midi-qol.preItemRoll", this._onPreItemRoll.bind(this));
    Hooks.on("midi-qol.postActiveEffects", this._onPostActiveEffects.bind(this));
    Hooks.on("midi-qol.preAttackRoll", this._onPreAttackRoll.bind(this));
    Hooks.on("midi-qol.postDamageRoll", this._onPostDamageRoll.bind(this));

    // Custom karma change hook
    Hooks.on(`${MODULE_ID}.karmaChanged`, this._onKarmaChanged.bind(this));

    // Combat turn hook for grapple damage
    Hooks.on("combatTurn", this._onCombatTurn.bind(this));
    Hooks.on("combatRound", this._onCombatTurn.bind(this));
  }

  // ==========================
  // REST HANDLER
  // ==========================

  static async _onRest(actor, result) {
    if (!this._isSubclass(actor)) return;
    const isLong = result.longRest;

    const prof = H.getProfBonus(actor);
    const conMod = H.getAbilityMod(actor, "con");
    const chaMod = H.getAbilityMod(actor, "cha");

    if (isLong) {
      // Long rest — reset everything
      await H.resetOnLongRest(actor, `${SUBCLASS}.lashingStrike`, prof);
      await H.resetOnLongRest(actor, `${SUBCLASS}.tidalSurge`, prof);
      await H.resetOnLongRest(actor, `${SUBCLASS}.inspiringPresence`, Math.max(1, chaMod));
      await H.resetOnLongRest(actor, `${SUBCLASS}.markOfDefiance`, prof);
      await H.resetOnLongRest(actor, `${SUBCLASS}.lordsWrit`, Math.max(1, conMod));
      await H.resetOnLongRest(actor, `${SUBCLASS}.heartOfStorm`, 1);
      await H.resetOnLongRest(actor, `${SUBCLASS}.barbedMaw`, 1);
      await H.resetOnLongRest(actor, `${SUBCLASS}.capstone`, 1);
      await H.resetOnLongRest(actor, `${SUBCLASS}.stillwaterCalm`, 1);
      await H.resetOnLongRest(actor, `${SUBCLASS}.patientStrike`, 1);
      await H.resetOnLongRest(actor, `${SUBCLASS}.turningTide`, 1);
      
      H.log(`${actor.name}: All Saltling resources restored (long rest)`);
    } else {
      // Short rest — partial reset
      await H.resetOnLongRest(actor, `${SUBCLASS}.lashingStrike`, prof);
      await H.resetOnLongRest(actor, `${SUBCLASS}.tidalSurge`, prof);
      await H.resetOnLongRest(actor, `${SUBCLASS}.barbedMaw`, 1);
      await H.resetOnLongRest(actor, `${SUBCLASS}.patientStrike`, 1);
      
      H.log(`${actor.name}: Short rest resources restored`);
    }
  }

  // ==========================
  // KARMA SYSTEM
  // ==========================

  static async _onKarmaChanged(actor, newKarma, oldKarma) {
    if (!this._isSubclass(actor)) return;

    // Clamp karma to valid range
    newKarma = Math.max(KARMA.MIN, Math.min(KARMA.MAX, newKarma));

    H.log(`Karma changed for ${actor.name}: ${oldKarma} → ${newKarma}`);

    // Check for Beast's Brand trigger at -15
    if (newKarma <= KARMA.BEAST_BRAND && oldKarma > KARMA.BEAST_BRAND) {
      const alreadyBranded = await H.getFlag(actor, `${SUBCLASS}.beastBrand`);
      if (!alreadyBranded) {
        await H.setFlag(actor, `${SUBCLASS}.beastBrand`, true);
        
        // Apply permanent effect
        const brandEffect = H.createEffectData(
          "The Beast's Brand",
          "icons/creatures/fish/fish-marlin-swordfish-background.webp",
          [
            { key: "system.skills.per.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-2", priority: 20 },
            { key: "system.skills.dec.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-2", priority: 20 }
          ],
          {}, // No duration — permanent
          { [MODULE_ID]: { beastBrand: true, permanent: true } }
        );
        await H.applyEffect(actor, brandEffect);

        H.chatMessage(`
          <h3>⚠️ The Beast's Brand</h3>
          <p><b>${actor.name}</b> has crossed the threshold at Karma ${KARMA.BEAST_BRAND}.</p>
          <p>They permanently gain <b>-2 to Persuasion and Deception checks against non-Ironborn</b>.</p>
          <p><i>The transformation has left marks that cannot be hidden. Your eyes have gone flat and dark, your movements have become predatory, and there is something in your voice that makes children cry at the sound of it.</i></p>
        `);
      }
    }

    // Check for Saint's Halo trigger at +15
    if (newKarma >= KARMA.SAINT_HALO && oldKarma < KARMA.SAINT_HALO) {
      const alreadyHaloed = await H.getFlag(actor, `${SUBCLASS}.saintHalo`);
      if (!alreadyHaloed) {
        await H.setFlag(actor, `${SUBCLASS}.saintHalo`, true);
        
        // Apply permanent effect
        const haloEffect = H.createEffectData(
          "The Saint's Halo",
          "icons/magic/light/explosion-star-glow-silhouette.webp",
          [
            { key: "system.skills.per.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "2", priority: 20 },
            { key: "system.skills.dec.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "2", priority: 20 }
          ],
          {}, // No duration — permanent
          { [MODULE_ID]: { saintHalo: true, permanent: true } }
        );
        await H.applyEffect(actor, haloEffect);

        H.chatMessage(`
          <h3>👑 The Saint's Halo</h3>
          <p><b>${actor.name}</b> has crossed the threshold at Karma +${KARMA.SAINT_HALO}.</p>
          <p>They permanently gain <b>+2 to Persuasion and Deception checks against non-Ironborn</b>.</p>
          <p><i>The grace of true humanity remains present in you throughout all your actions. The sight of you brings calm to the hearts of the masses.</i></p>
        `);
      }
    }

    // Notify of path locking (Abyssal locks Ascendant)
    if (newKarma <= KARMA.BEAST_BRAND && oldKarma > KARMA.BEAST_BRAND) {
      H.chatMessage(`
        <p>⚓ <b>${actor.name}</b>'s Ascendant abilities are now <b>DORMANT</b>.</p>
        <p>The path of the Crown is locked until Karma rises above ${KARMA.BEAST_BRAND}.</p>
      `);
    }

    // Notify of path locking (Ascendant locks Abyssal limb evolution)
    if (newKarma >= KARMA.SAINT_HALO && oldKarma < KARMA.SAINT_HALO) {
      H.chatMessage(`
        <p>👑 <b>${actor.name}</b>'s Tainted Limb evolution has <b>STOPPED</b>.</p>
        <p>The path of the Deep is locked. The limb will not grow further.</p>
      `);
    }

    // Track ability unlocks
    await this._checkAbilityUnlocks(actor, newKarma, oldKarma);

    // Update passive effects based on new karma tier
    await this._updateKarmaEffects(actor, newKarma);
  }

  static async _checkAbilityUnlocks(actor, newKarma, oldKarma) {
    const unlocked = await H.getFlag(actor, `${SUBCLASS}.unlocked`) ?? {};

    // Abyssal unlocks
    if (newKarma <= KARMA.CONSTRICTING_GRASP && !unlocked.constrictingGrasp) {
      unlocked.constrictingGrasp = true;
      H.chatMessage(`<p>🐙 <b>${actor.name}</b> unlocks <b>Constricting Grasp</b> at Karma ${newKarma}!</p>`);
    }
    if (newKarma <= KARMA.ELONGATED_REACH && !unlocked.elongatedReach) {
      unlocked.elongatedReach = true;
      H.chatMessage(`<p>🐙 <b>${actor.name}</b> unlocks <b>Elongated Reach</b> at Karma ${newKarma}! Tainted Limb: 10 ft reach, 1d8 damage.</p>`);
    }
    if (newKarma <= KARMA.BARBED_MAW && !unlocked.barbedMaw) {
      unlocked.barbedMaw = true;
      H.chatMessage(`<p>🦷 <b>${actor.name}</b> unlocks <b>Barbed Maw</b> at Karma ${newKarma}!</p>`);
    }

    // Ascendant unlocks
    if (newKarma >= KARMA.INSPIRING_PRESENCE && !unlocked.inspiringPresence) {
      unlocked.inspiringPresence = true;
      H.chatMessage(`<p>✨ <b>${actor.name}</b> unlocks <b>Inspiring Presence</b> at Karma +${newKarma}!</p>`);
    }
    if (newKarma >= KARMA.MARK_OF_DEFIANCE && !unlocked.markOfDefiance) {
      unlocked.markOfDefiance = true;
      H.chatMessage(`<p>👁️ <b>${actor.name}</b> unlocks <b>Mark of Defiance</b> at Karma +${newKarma}!</p>`);
    }
    if (newKarma >= KARMA.HEART_OF_STORM && !unlocked.heartOfStorm) {
      unlocked.heartOfStorm = true;
      H.chatMessage(`<p>⚡ <b>${actor.name}</b> unlocks <b>Heart of the Storm</b> at Karma +${newKarma}!</p>`);
    }

    await H.setFlag(actor, `${SUBCLASS}.unlocked`, unlocked);
  }

  static async _updateKarmaEffects(actor, karma) {
    // Remove old karma tier effects
    const oldEffects = actor.effects.filter(e => e.flags?.[MODULE_ID]?.karmaTier);
    for (const effect of oldEffects) {
      await effect.delete();
    }

    // Apply new tier effect based on current karma
    let tierEffect = null;

    // Abyssal tiers
    if (karma <= KARMA.TIER_DROWNED_MAX) {
      tierEffect = this._createKarmaTierEffect("Drowned in the Drowned One's Embrace", karma);
    } else if (karma <= KARMA.TIER_BEAST_ASCENDS_MAX) {
      tierEffect = this._createKarmaTierEffect("Ascension of the Beast", karma);
    } else if (karma <= KARMA.TIER_FADING_MAX) {
      tierEffect = this._createKarmaTierEffect("Fading Humanity", karma);
    } else if (karma <= KARMA.TIER_CREEPING_MAX) {
      tierEffect = this._createKarmaTierEffect("Creeping Monstrosity", karma);
    } else if (karma <= KARMA.TIER_UNSETTLING_MAX) {
      tierEffect = this._createKarmaTierEffect("Unsettling Presence", karma);
    }
    // Ascendant tiers
    else if (karma >= KARMA.TIER_LEGEND_MIN) {
      tierEffect = this._createKarmaTierEffect("Legend of Two Worlds", karma);
    } else if (karma >= KARMA.TIER_HEART_MIN) {
      tierEffect = this._createKarmaTierEffect("Heart of the Isles", karma);
    } else if (karma >= KARMA.TIER_DEFIANT_MIN) {
      tierEffect = this._createKarmaTierEffect("Defiant Paragon", karma);
    } else if (karma >= KARMA.TIER_AGAINST_MIN) {
      tierEffect = this._createKarmaTierEffect("Against Expectation", karma);
    } else if (karma >= KARMA.TIER_GLIMMER_MIN) {
      tierEffect = this._createKarmaTierEffect("Glimmer of Nobility", karma);
    }

    if (tierEffect) {
      await H.applyEffect(actor, tierEffect);
    }
  }

  static _createKarmaTierEffect(tierName, karma) {
    const changes = [];
    
    // =============================
    // ABYSSAL TIERS (-1 to -25)
    // =============================
    
    // -1 to -5: Unsettling Presence
    if (karma >= KARMA.TIER_UNSETTLING_MIN && karma <= KARMA.TIER_UNSETTLING_MAX) {
      changes.push({ key: "system.skills.per.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-1" });
      changes.push({ key: "system.skills.dec.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-1" });
    }
    // -6 to -10: Creeping Monstrosity
    else if (karma >= KARMA.TIER_CREEPING_MIN && karma <= KARMA.TIER_CREEPING_MAX) {
      changes.push({ key: "system.skills.per.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-2" });
      changes.push({ key: "system.skills.dec.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-2" });
      changes.push({ key: "system.skills.itm.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1" });
      changes.push({ key: "system.skills.sur.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1" });
    }
    // -11 to -15: Fading Humanity (Beast's Brand applied separately at -15)
    else if (karma >= KARMA.TIER_FADING_MIN && karma <= KARMA.TIER_FADING_MAX) {
      // Note: -2 CHA handled by Beast's Brand permanent effect at -15
      // Additional effects for this tier:
      changes.push({ key: "system.skills.itm.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "2" });
      // Advantage on Animal Handling would need special handling
    }
    // -16 to -20: Ascension of the Beast
    else if (karma >= KARMA.TIER_BEAST_ASCENDS_MIN && karma <= KARMA.TIER_BEAST_ASCENDS_MAX) {
      changes.push({ key: "system.skills.itm.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "3" });
      changes.push({ key: "system.abilities.int.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-1" });
      // Beast communication, perception advantage would need special handling
    }
    // -21 to -25: Drowned in the Drowned One's Embrace
    else if (karma >= KARMA.TIER_DROWNED_MIN && karma <= KARMA.TIER_DROWNED_MAX) {
      changes.push({ key: "system.skills.itm.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "4" });
      changes.push({ key: "system.abilities.int.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-2" });
      // No sleep needed, beast neutrality would need special handling
    }
    
    // =============================
    // ASCENDANT TIERS (+1 to +25)
    // =============================
    
    // +1 to +5: Glimmer of Nobility
    else if (karma >= KARMA.TIER_GLIMMER_MIN && karma <= KARMA.TIER_GLIMMER_MAX) {
      changes.push({ key: "system.skills.per.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1" });
    }
    // +6 to +10: Against Expectation
    else if (karma >= KARMA.TIER_AGAINST_MIN && karma <= KARMA.TIER_AGAINST_MAX) {
      changes.push({ key: "system.skills.per.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "2" });
      changes.push({ key: "system.skills.ins.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "2" });
    }
    // +11 to +15: Defiant Paragon (Saint's Halo applied separately at +15)
    else if (karma >= KARMA.TIER_DEFIANT_MIN && karma <= KARMA.TIER_DEFIANT_MAX) {
      // Note: +2 CHA handled by Saint's Halo permanent effect at +15
      changes.push({ key: "system.skills.per.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "2" });
      changes.push({ key: "system.skills.ins.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "2" });
    }
    // +16 to +20: Heart of the Isles
    else if (karma >= KARMA.TIER_HEART_MIN && karma <= KARMA.TIER_HEART_MAX) {
      changes.push({ key: "system.skills.per.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "3" });
      changes.push({ key: "system.skills.ins.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "3" });
      changes.push({ key: "system.skills.dec.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "3" });
    }
    // +21 to +25: Legend of Two Worlds
    else if (karma >= KARMA.TIER_LEGEND_MIN && karma <= KARMA.TIER_LEGEND_MAX) {
      changes.push({ key: "system.skills.per.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "4" });
      changes.push({ key: "system.skills.ins.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "4" });
      changes.push({ key: "system.skills.dec.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "4" });
      changes.push({ key: "system.skills.itm.bonuses.check", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "4" });
    }

    return H.createEffectData(
      `Karma: ${tierName}`,
      "icons/svg/aura.svg",
      changes,
      {}, // No duration
      { [MODULE_ID]: { karmaTier: true, tierName, karmaValue: karma } }
    );
  }

  // ==========================
  // PRE-ITEM ROLL — Feature dispatch
  // ==========================

  static async _onPreItemRoll(workflow) {
    if (!workflow?.actor || !this._isSubclass(workflow.actor)) return;
    const itemName = workflow.item?.name?.toLowerCase() ?? "";

    // Dispatch based on feature name
    if (itemName.includes("salt scourge")) {
      return this._saltScourge(workflow);
    }
    if (itemName.includes("tidal surge")) {
      return this._tidalSurgeCheck(workflow);
    }
    if (itemName.includes("constricting grasp")) {
      return this._constrictingGrasp(workflow);
    }
    if (itemName.includes("barbed maw")) {
      return this._barbedMaw(workflow);
    }
    if (itemName.includes("inspiring presence")) {
      return this._inspiringPresence(workflow);
    }
    if (itemName.includes("mark of defiance")) {
      return this._markOfDefiance(workflow);
    }
    if (itemName.includes("heart of the storm")) {
      return this._heartOfTheStorm(workflow);
    }
    if (itemName.includes("maw beneath")) {
      return this._mawBeneath(workflow);
    }
    if (itemName.includes("iron seat")) {
      return this._ironSeat(workflow);
    }
    if (itemName.includes("stillwater") || itemName.includes("the calm")) {
      return this._stillwaterCalm(workflow);
    }
    if (itemName.includes("patient strike")) {
      return this._patientStrike(workflow);
    }
    if (itemName.includes("weight of stillwater") || itemName.includes("turning tide")) {
      return this._turningTide(workflow);
    }
  }

  // ==========================
  // POST-ACTIVE-EFFECTS — Apply riders
  // ==========================

  static async _onPostActiveEffects(workflow) {
    if (!workflow?.actor || !this._isSubclass(workflow.actor)) return;
    if (!workflow.hitTargets?.size) return;

    const itemName = workflow.item?.name?.toLowerCase() ?? "";

    // Salt Scourge speed reduction
    if (itemName.includes("salt scourge")) {
      await this._applySaltScourgeEffect(workflow);
    }
  }

  // ==========================
  // PRE-ATTACK-ROLL — Apex Predator advantage
  // ==========================

  static async _onPreAttackRoll(workflow) {
    if (!workflow?.actor || !this._isSubclass(workflow.actor)) return;

    const karma = await H.getFlag(workflow.actor, `${SUBCLASS}.karma`) ?? 0;
    if (karma > KARMA.APEX_PREDATOR) return; // Need Karma -8 or lower for Apex Predator

    // Check if actor has Apex Predator
    const hasApex = workflow.actor.items.some(i => 
      i.type === "feat" && i.name.toLowerCase().includes("apex predator")
    );
    if (!hasApex) return;

    // Check target HP
    const target = workflow.targets?.first();
    if (!target?.actor) return;

    const hp = target.actor.system.attributes.hp;
    if (hp.value < hp.max / 2) {
      workflow.advantage = true;
      H.log(`Apex Predator: Advantage granted vs ${target.actor.name} (wounded)`);
    }
  }

  // ==========================
  // POST-DAMAGE-ROLL — Tidal Surge prompt
  // ==========================

  static async _onPostDamageRoll(workflow) {
    if (!workflow?.actor || !this._isSubclass(workflow.actor)) return;
    if (!workflow.hitTargets?.size) return;

    // Only on melee weapon attacks
    if (!["mwak"].includes(workflow.item?.system?.actionType)) return;

    // Don't trigger on Tidal Surge itself
    if (workflow.item?.name?.toLowerCase().includes("tidal surge")) return;

    await this._tidalSurgePrompt(workflow);
  }

  // ==========================
  // SALT SCOURGE
  // ==========================

  static async _saltScourge(workflow) {
    H.log("Salt Scourge activated");
    // The attack roll and damage are handled by the item itself
    // We just need to log and let postActiveEffects handle the speed reduction
  }

  static async _applySaltScourgeEffect(workflow) {
    const target = workflow.hitTargets.first();
    if (!target?.actor) return;

    const slowEffect = H.createEffectData(
      "Salt Scourge — Slowed",
      "icons/magic/water/wave-water-blue.webp",
      [
        { key: "system.attributes.movement.walk", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-10", priority: 20 }
      ],
      { rounds: 1 },
      { dae: { specialDuration: ["turnStartSource"] } }
    );

    await H.applyEffect(target.actor, slowEffect);
    H.log(`Salt Scourge: Applied -10 speed to ${target.actor.name}`);
  }

  // ==========================
  // TIDAL SURGE
  // ==========================

  static async _tidalSurgeCheck(workflow) {
    // Check uses
    const uses = await H.getUses(workflow.actor, `${SUBCLASS}.tidalSurge`);
    if (uses <= 0) {
      ui.notifications.warn("No Tidal Surge uses remaining (recharges on short rest).");
      return false;
    }
  }

  static async _tidalSurgePrompt(workflow) {
    const actor = workflow.actor;
    const target = workflow.hitTargets.first();
    if (!target) return;

    const uses = await H.getUses(actor, `${SUBCLASS}.tidalSurge`);
    if (uses <= 0) return; // Silent fail

    const choice = await H.buttonDialog(
      "Tidal Surge",
      `<p>You hit <b>${target.actor.name}</b>. Invoke Tidal Surge?</p>
       <p>Bonus cold damage + STR save or push 10 ft.</p>
       <p><small>Uses remaining: ${uses}</small></p>`,
      [
        { id: "yes", label: "Use Tidal Surge", value: true },
        { id: "no", label: "Skip", value: false }
      ]
    );

    if (!choice) return;

    // Expend use
    await H.expendUse(actor, `${SUBCLASS}.tidalSurge`);

    // Determine damage die
    const fighterLevel = actor.classes?.fighter?.system?.levels ?? actor.system.details.level ?? 1;
    let damageDie = "1d6";
    if (fighterLevel >= 10) damageDie = "1d10";
    else if (fighterLevel >= 7) damageDie = "1d8";

    // Roll damage
    const damageRoll = await H.rollDice(damageDie);
    await H.applyDamage(target, damageRoll.total, "cold");

    // Strength save
    const dc = H.getStandardDC(actor, "con");
    const { roll, success } = await H.promptSavingThrow(target.actor, "str", dc);

    let pushMsg = success 
      ? `<span style="color:green"><b>${target.actor.name}</b> resists the push.</span>`
      : `<span style="color:red"><b>${target.actor.name}</b> is pushed 10 ft away!</span><br><small>GM: Move the token manually.</small>`;

    H.chatMessage(`
      <h3>🌊 Tidal Surge!</h3>
      <p><b>${actor.name}</b> channels the tide through their strike!</p>
      <p>Cold damage: <b>${damageRoll.total}</b></p>
      <p>STR Save DC ${dc}: ${roll.total} — ${pushMsg}</p>
      <p><small>${uses - 1} uses remaining</small></p>
    `);
  }

  // ==========================
  // CONSTRICTING GRASP (Karma -8)
  // ==========================

  static async _constrictingGrasp(workflow) {
    const actor = workflow.actor;
    
    // Check karma
    const karma = await H.getFlag(actor, `${SUBCLASS}.karma`) ?? 0;
    if (karma > KARMA.CONSTRICTING_GRASP) {
      ui.notifications.warn(`Constricting Grasp requires Karma ${KARMA.CONSTRICTING_GRASP} or lower.`);
      return false;
    }
    if (karma >= KARMA.SAINT_HALO) {
      ui.notifications.warn(`Constricting Grasp is dormant (Karma +${KARMA.SAINT_HALO} or higher).`);
      return false;
    }

    const target = H.getFirstTarget();
    if (!target) return false;

    // Contested Athletics
    const actorRoll = await actor.rollSkill("ath", { fastForward: true, chatMessage: true });
    const targetSkill = target.actor.system.skills.acr.total >= target.actor.system.skills.ath.total ? "acr" : "ath";
    const targetRoll = await target.actor.rollSkill(targetSkill, { fastForward: true, chatMessage: true });

    if (actorRoll.total >= targetRoll.total) {
      // Apply grappled
      const grappleEffect = H.createEffectData(
        "Grappled (Constricting Grasp)",
        "icons/skills/melee/strike-chain-link-white.webp",
        [
          { key: "system.attributes.movement.walk", mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE, value: "0" }
        ],
        {},
        { [MODULE_ID]: { grappledBy: actor.id, saltlingGrapple: true } }
      );
      
      await H.applyEffect(target.actor, grappleEffect);
      await H.setFlag(actor, `${SUBCLASS}.grappleTarget`, target.actor.id);

      H.chatMessage(`
        <h3>🐙 Constricting Grasp!</h3>
        <p><b>${actor.name}</b> wraps their Tainted Limb around <b>${target.actor.name}</b>!</p>
        <p>${actor.name}: ${actorRoll.total} vs ${target.actor.name}: ${targetRoll.total}</p>
        <p><b>${target.actor.name} is GRAPPLED!</b></p>
        <p><small>Use bonus action to Constrict for 1d6 + STR damage.</small></p>
      `);
    } else {
      H.chatMessage(`
        <p><b>${actor.name}</b> tries to grapple but <b>${target.actor.name}</b> slips free!</p>
        <p>${actor.name}: ${actorRoll.total} vs ${target.actor.name}: ${targetRoll.total}</p>
      `);
    }
  }

  // ==========================
  // BARBED MAW (Karma -18)
  // ==========================

  static async _barbedMaw(workflow) {
    const actor = workflow.actor;

    // Check karma
    const karma = await H.getFlag(actor, `${SUBCLASS}.karma`) ?? 0;
    if (karma > KARMA.BARBED_MAW) {
      ui.notifications.warn(`Barbed Maw requires Karma ${KARMA.BARBED_MAW} or lower.`);
      return false;
    }

    // Check uses
    const uses = await H.getUses(actor, `${SUBCLASS}.barbedMaw`);
    if (uses <= 0) {
      ui.notifications.warn("Barbed Maw already used (recharges on short rest).");
      return false;
    }

    const target = H.getFirstTarget();
    if (!target) return false;

    await H.expendUse(actor, `${SUBCLASS}.barbedMaw`);

    // Roll damage
    const damageRoll = await H.rollDice("2d6");
    await H.applyDamage(target, damageRoll.total, "piercing");

    // CON save for poison
    const dc = H.getStandardDC(actor, "con");
    const { roll, success } = await H.promptSavingThrow(target.actor, "con", dc);

    if (!success) {
      const poisonEffect = H.createEffectData(
        "Poisoned (Barbed Maw)",
        "icons/skills/toxins/poison-bottle-corked-fire-green.webp",
        [
          { key: "flags.midi-qol.disadvantage.attack.all", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "1" },
          { key: "flags.midi-qol.disadvantage.ability.check.all", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "1" }
        ],
        { rounds: 1 },
        { dae: { specialDuration: ["turnEnd"] } }
      );
      await H.applyEffect(target.actor, poisonEffect);
    }

    const poisonMsg = success 
      ? `<span style="color:green">${target.actor.name} resists the poison.</span>`
      : `<span style="color:purple">${target.actor.name} is POISONED until end of their next turn!</span>`;

    H.chatMessage(`
      <h3>🦷 Barbed Maw!</h3>
      <p>Hooked teeth tear into <b>${target.actor.name}</b>!</p>
      <p>Piercing damage: <b>${damageRoll.total}</b></p>
      <p>CON Save DC ${dc}: ${roll.total} — ${poisonMsg}</p>
    `);
  }

  // ==========================
  // INSPIRING PRESENCE (Karma +8)
  // ==========================

  static async _inspiringPresence(workflow) {
    const actor = workflow.actor;

    const karma = await H.getFlag(actor, `${SUBCLASS}.karma`) ?? 0;
    if (karma < KARMA.INSPIRING_PRESENCE) {
      ui.notifications.warn(`Inspiring Presence requires Karma +${KARMA.INSPIRING_PRESENCE} or higher.`);
      return false;
    }
    if (karma <= KARMA.BEAST_BRAND) {
      ui.notifications.warn(`Inspiring Presence is dormant (Karma ${KARMA.BEAST_BRAND} or lower).`);
      return false;
    }

    const uses = await H.getUses(actor, `${SUBCLASS}.inspiringPresence`);
    if (uses <= 0) {
      ui.notifications.warn("No Inspiring Presence uses remaining (recharges on long rest).");
      return false;
    }

    await H.expendUse(actor, `${SUBCLASS}.inspiringPresence`);

    const bonusRoll = await H.rollDice("1d4");

    H.chatMessage(`
      <h3>✨ Inspiring Presence!</h3>
      <p><b>${actor.name}</b> inspires an ally!</p>
      <p>Bonus to roll: <b>+${bonusRoll.total}</b></p>
      <p><small>Add this to the ally's attack roll, ability check, or saving throw.</small></p>
      <p><small>${uses - 1} uses remaining</small></p>
    `);
  }

  // ==========================
  // MARK OF DEFIANCE (Karma +13)
  // ==========================

  static async _markOfDefiance(workflow) {
    const actor = workflow.actor;

    const karma = await H.getFlag(actor, `${SUBCLASS}.karma`) ?? 0;
    if (karma < KARMA.MARK_OF_DEFIANCE) {
      ui.notifications.warn(`Mark of Defiance requires Karma +${KARMA.MARK_OF_DEFIANCE} or higher.`);
      return false;
    }

    const uses = await H.getUses(actor, `${SUBCLASS}.markOfDefiance`);
    if (uses <= 0) {
      ui.notifications.warn("No Mark of Defiance uses remaining (recharges on long rest).");
      return false;
    }

    const target = H.getFirstTarget();
    if (!target) return false;

    await H.expendUse(actor, `${SUBCLASS}.markOfDefiance`);

    const dc = H.getStandardDC(actor, "con");

    const markEffect = H.createEffectData(
      `Mark of Defiance (${actor.name})`,
      "icons/magic/control/debuff-chains-ropes-purple.webp",
      [],
      { rounds: 1 },
      { 
        [MODULE_ID]: { markOfDefiance: true, markerActorId: actor.id, saveDC: dc },
        dae: { specialDuration: ["turnEndSource"] }
      }
    );

    await H.applyEffect(target.actor, markEffect);

    H.chatMessage(`
      <h3>👁️ Mark of Defiance!</h3>
      <p><b>${actor.name}</b> marks <b>${target.actor.name}</b>!</p>
      <p>Until end of ${actor.name}'s next turn, attacks vs anyone else require WIS Save DC ${dc} or suffer disadvantage.</p>
      <p><small>${uses - 1} uses remaining</small></p>
    `);
  }

  // ==========================
  // HEART OF THE STORM (Karma +18)
  // ==========================

  static async _heartOfTheStorm(workflow) {
    const actor = workflow.actor;

    const karma = await H.getFlag(actor, `${SUBCLASS}.karma`) ?? 0;
    if (karma < KARMA.HEART_OF_STORM) {
      ui.notifications.warn(`Heart of the Storm requires Karma +${KARMA.HEART_OF_STORM} or higher.`);
      return false;
    }

    const uses = await H.getUses(actor, `${SUBCLASS}.heartOfStorm`);
    if (uses <= 0) {
      ui.notifications.warn("Heart of the Storm already used (recharges on long rest).");
      return false;
    }

    const sourceToken = H.getTokenFromActor(actor);
    if (!sourceToken) return false;

    const allies = H.getTokensInRadius(sourceToken, 15, CONST.TOKEN_DISPOSITIONS.FRIENDLY);
    if (allies.length === 0) {
      ui.notifications.warn("No allies within 15 feet.");
      return false;
    }

    // Select up to 3 allies
    const allyOptions = allies.slice(0, 6).map(t => 
      `<option value="${t.id}">${t.actor.name}</option>`
    ).join("");

    const selectedIds = await new Promise(resolve => {
      new Dialog({
        title: "Heart of the Storm",
        content: `
          <p>Choose up to 3 allies within 15 feet:</p>
          <form>
            <div class="form-group"><label>Ally 1:</label><select id="a1"><option value="">—</option>${allyOptions}</select></div>
            <div class="form-group"><label>Ally 2:</label><select id="a2"><option value="">—</option>${allyOptions}</select></div>
            <div class="form-group"><label>Ally 3:</label><select id="a3"><option value="">—</option>${allyOptions}</select></div>
          </form>
        `,
        buttons: {
          confirm: {
            label: "Rally!",
            callback: (html) => resolve([
              html.find("#a1").val(),
              html.find("#a2").val(),
              html.find("#a3").val()
            ].filter(id => id))
          },
          cancel: { label: "Cancel", callback: () => resolve([]) }
        },
        default: "confirm"
      }).render(true);
    });

    if (!selectedIds.length) return;

    await H.expendUse(actor, `${SUBCLASS}.heartOfStorm`);

    const conMod = H.getAbilityMod(actor, "con");
    const fighterLevel = actor.classes?.fighter?.system?.levels ?? actor.system.details.level ?? 1;
    const healAmount = conMod + fighterLevel;

    let results = [];

    for (const tokenId of selectedIds) {
      const allyToken = canvas.tokens.get(tokenId);
      if (!allyToken?.actor) continue;

      // Heal
      await H.applyHealing(allyToken, healAmount);

      // Apply advantage on next attack
      const stormEffect = H.createEffectData(
        "Heart of the Storm — Rallied",
        "icons/magic/lightning/bolt-strike-blue.webp",
        [
          { key: "flags.midi-qol.advantage.attack.all", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "1" }
        ],
        { rounds: 1 },
        { dae: { specialDuration: ["1Attack"] } }
      );
      await H.applyEffect(allyToken.actor, stormEffect);

      const speed = Math.floor(allyToken.actor.system.attributes.movement.walk / 2);
      results.push(`<li><b>${allyToken.actor.name}</b>: +${healAmount} HP, advantage on next attack, can move ${speed} ft as reaction</li>`);
    }

    H.chatMessage(`
      <h3>⚡ Heart of the Storm!</h3>
      <p><b>${actor.name}</b> rallies their allies with Second Wind!</p>
      <ul>${results.join("")}</ul>
    `);
  }

  // ==========================
  // STILLWATER FEATURES (Karma -5 to +5)
  // ==========================

  static async _stillwaterCalm(workflow) {
    const actor = workflow.actor;

    const karma = await H.getFlag(actor, `${SUBCLASS}.karma`) ?? 0;
    if (karma < KARMA.STILLWATER_MIN || karma > KARMA.STILLWATER_MAX) {
      ui.notifications.warn(`The Calm requires Karma between ${KARMA.STILLWATER_MIN} and +${KARMA.STILLWATER_MAX}.`);
      return false;
    }

    const uses = await H.getUses(actor, `${SUBCLASS}.stillwaterCalm`);
    if (uses <= 0) {
      ui.notifications.warn("The Calm already used (recharges on long rest).");
      return false;
    }

    await H.expendUse(actor, `${SUBCLASS}.stillwaterCalm`);

    // Apply immunity to frightened, charmed, confused for 1 minute
    const calmEffect = H.createEffectData(
      "The Calm — Stillwater",
      "icons/magic/water/water-hand.webp",
      [
        { key: "system.traits.ci.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "frightened" },
        { key: "system.traits.ci.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "charmed" }
      ],
      { seconds: 60 },
      { [MODULE_ID]: { stillwaterCalm: true } }
    );
    await H.applyEffect(actor, calmEffect);

    H.chatMessage(`
      <h3>🌊 The Calm</h3>
      <p><b>${actor.name}</b> enters a state of perfect stillness.</p>
      <p><b>For 1 minute:</b> Immune to frightened, charmed, and confused conditions.</p>
    `);
  }

  static async _patientStrike(workflow) {
    const actor = workflow.actor;

    const karma = await H.getFlag(actor, `${SUBCLASS}.karma`) ?? 0;
    if (karma < KARMA.STILLWATER_MIN || karma > KARMA.STILLWATER_MAX) {
      ui.notifications.warn(`Patient Strike requires Karma between ${KARMA.STILLWATER_MIN} and +${KARMA.STILLWATER_MAX}.`);
      return false;
    }

    const uses = await H.getUses(actor, `${SUBCLASS}.patientStrike`);
    if (uses <= 0) {
      ui.notifications.warn("Patient Strike already used (recharges on short rest).");
      return false;
    }

    const target = H.getFirstTarget();
    if (!target) return false;

    await H.expendUse(actor, `${SUBCLASS}.patientStrike`);

    // Apply disadvantage on target's next attack
    const strikeEffect = H.createEffectData(
      "Patient Strike — Debuffed",
      "icons/skills/melee/strike-polearm-light-orange.webp",
      [
        { key: "flags.midi-qol.disadvantage.attack.all", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "1" }
      ],
      { rounds: 1 },
      { dae: { specialDuration: ["1Attack"] } }
    );
    await H.applyEffect(target.actor, strikeEffect);

    H.chatMessage(`
      <h3>⚔️ Patient Strike</h3>
      <p><b>${actor.name}</b> forgoes bonus damage for a calculated blow!</p>
      <p><b>${target.actor.name}</b> has disadvantage on their next attack roll.</p>
    `);
  }

  // ==========================
  // WEIGHT OF STILLWATER (Capstone, Karma -5 to +5 maintained)
  // ==========================

  static async _turningTide(workflow) {
    const actor = workflow.actor;

    const karma = await H.getFlag(actor, `${SUBCLASS}.karma`) ?? 0;
    if (karma < KARMA.STILLWATER_MIN || karma > KARMA.STILLWATER_MAX) {
      ui.notifications.warn(`Turning Tide requires Karma between ${KARMA.STILLWATER_MIN} and +${KARMA.STILLWATER_MAX}.`);
      return false;
    }

    const fighterLevel = actor.classes?.fighter?.system?.levels ?? actor.system.details.level ?? 1;
    if (fighterLevel < 10) {
      ui.notifications.warn("Weight of Stillwater requires Fighter level 10.");
      return false;
    }

    const uses = await H.getUses(actor, `${SUBCLASS}.turningTide`);
    if (uses <= 0) {
      ui.notifications.warn("Turning Tide already used this Stillwater activation.");
      return false;
    }

    await H.expendUse(actor, `${SUBCLASS}.turningTide`);

    H.chatMessage(`
      <h3>🌊 The Turning Tide!</h3>
      <p><b>${actor.name}</b> forces a creature to reroll!</p>
      <p><small>GM: Apply the reroll to the appropriate attack, check, or save. The Saltling chooses which result is used.</small></p>
    `);
  }

  // ==========================
  // THE MAW BENEATH — Capstone (Karma -23)
  // ==========================

  static async _mawBeneath(workflow) {
    const actor = workflow.actor;

    const karma = await H.getFlag(actor, `${SUBCLASS}.karma`) ?? 0;
    if (karma > KARMA.MAW_BENEATH) {
      ui.notifications.warn(`The Maw Beneath requires Karma ${KARMA.MAW_BENEATH} or lower.`);
      return false;
    }

    const fighterLevel = actor.classes?.fighter?.system?.levels ?? actor.system.details.level ?? 1;
    if (fighterLevel < 10) {
      ui.notifications.warn("The Maw Beneath requires Fighter level 10.");
      return false;
    }

    // Toggle off if already active
    const existing = actor.effects.find(e => e.name === "The Maw Beneath — Transformed");
    if (existing) {
      await existing.delete();
      H.chatMessage(`<p><b>${actor.name}</b>'s arm slowly reforms into its usual twisted shape.</p>`);
      return;
    }

    const uses = await H.getUses(actor, `${SUBCLASS}.capstone`);
    if (uses <= 0) {
      ui.notifications.warn("The Maw Beneath already used (recharges on long rest).");
      return false;
    }

    await H.expendUse(actor, `${SUBCLASS}.capstone`);

    // Apply transformation
    const transformEffect = H.createEffectData(
      "The Maw Beneath — Transformed",
      "icons/creatures/tentacles/tentacles-octopus-black-gray.webp",
      [],
      { seconds: 60 },
      { [MODULE_ID]: { mawBeneath: true } }
    );
    await H.applyEffect(actor, transformEffect);

    // Abyssal Terror — frighten nearby hostiles
    const sourceToken = H.getTokenFromActor(actor);
    const dc = H.getStandardDC(actor, "con");
    let fearResults = [];

    if (sourceToken) {
      const hostiles = H.getTokensInRadius(sourceToken, 15, CONST.TOKEN_DISPOSITIONS.HOSTILE);
      
      for (const hostile of hostiles) {
        const { roll, success } = await H.promptSavingThrow(hostile.actor, "wis", dc);
        
        if (!success) {
          const fearEffect = H.createEffectData(
            "Frightened (Abyssal Terror)",
            "icons/magic/control/fear-fright-monster-grin-purple.webp",
            [
              { key: "flags.midi-qol.disadvantage.attack.all", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "1" }
            ],
            { rounds: 1 },
            { dae: { specialDuration: ["turnEnd"] } }
          );
          await H.applyEffect(hostile.actor, fearEffect);
          fearResults.push(`<li>${hostile.actor.name}: ${roll.total} — <span style="color:red">FRIGHTENED</span></li>`);
        } else {
          fearResults.push(`<li>${hostile.actor.name}: ${roll.total} — <span style="color:green">SAVED</span></li>`);
        }
      }
    }

    H.chatMessage(`
      <h3>🐙 THE MAW BENEATH!</h3>
      <p><i>The flesh splits open along seams that were never there before...</i></p>
      <p><b>${actor.name}</b>'s arm transforms into a writhing mass of tendrils!</p>
      <hr>
      <p><b>For 1 minute:</b></p>
      <ul>
        <li>Tendril reach: <b>15 feet</b></li>
        <li>Tendril damage: <b>2d6 + STR</b></li>
        <li>Can grapple up to <b>2 creatures</b></li>
      </ul>
      ${fearResults.length ? `<hr><p><b>Abyssal Terror</b> (WIS DC ${dc}):</p><ul>${fearResults.join("")}</ul>` : ''}
    `);
  }

  // ==========================
  // THE IRON SEAT — Capstone (Karma +23)
  // ==========================

  static async _ironSeat(workflow) {
    const actor = workflow.actor;

    const karma = await H.getFlag(actor, `${SUBCLASS}.karma`) ?? 0;
    if (karma < KARMA.IRON_SEAT) {
      ui.notifications.warn(`The Iron Seat requires Karma +${KARMA.IRON_SEAT} or higher.`);
      return false;
    }

    const fighterLevel = actor.classes?.fighter?.system?.levels ?? actor.system.details.level ?? 1;
    if (fighterLevel < 10) {
      ui.notifications.warn("The Iron Seat requires Fighter level 10.");
      return false;
    }

    // Toggle off if already active
    const existing = actor.effects.find(e => e.name === "The Iron Seat — Active");
    if (existing) {
      await existing.delete();
      H.chatMessage(`<p><b>${actor.name}</b> releases their commanding presence.</p>`);
      return;
    }

    const uses = await H.getUses(actor, `${SUBCLASS}.capstone`);
    if (uses <= 0) {
      ui.notifications.warn("The Iron Seat already used (recharges on long rest).");
      return false;
    }

    await H.expendUse(actor, `${SUBCLASS}.capstone`);

    const conMod = H.getAbilityMod(actor, "con");

    // Apply self buffs
    const seatEffect = H.createEffectData(
      "The Iron Seat — Active",
      "icons/environment/people/king.webp",
      [
        { key: "flags.midi-qol.advantage.ability.save.all", mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM, value: "1" },
        { key: "system.traits.ci.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "frightened" },
        { key: "system.traits.ci.value", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "charmed" }
      ],
      { seconds: 60 },
      { [MODULE_ID]: { ironSeat: true, conMod } }
    );
    await H.applyEffect(actor, seatEffect);

    H.chatMessage(`
      <h3>👑 THE IRON SEAT!</h3>
      <p><b>${actor.name}</b> projects an aura of absolute command!</p>
      <hr>
      <p><b>For 1 minute (15 ft aura):</b></p>
      <ul>
        <li><b>Commanding Presence:</b> Hostiles WIS save or disadvantage on attacks vs others</li>
        <li><b>Iron Mandate:</b> Allies add <b>+${conMod}</b> to attacks and saves</li>
        <li><b>Unshakeable:</b> Advantage on all saves, immune to fear/charm/forced movement</li>
      </ul>
      <p><small>GM: Apply Iron Mandate to allies manually or use Aura Effects module.</small></p>
    `);
  }

  // ==========================
  // COMBAT TURN — Grapple cold damage
  // ==========================

  static async _onCombatTurn(combat, updateData, options) {
    const combatant = combat.combatant;
    if (!combatant?.actor || !this._isSubclass(combatant.actor)) return;

    const actor = combatant.actor;

    // Check for Maw Beneath grapple
    const hasMaw = actor.effects.find(e => e.name === "The Maw Beneath — Transformed");
    if (!hasMaw) return;

    // Find grappled targets
    for (const t of canvas.tokens.placeables) {
      const grappleEffect = t.actor?.effects.find(e => 
        e.flags?.[MODULE_ID]?.grappledBy === actor.id
      );
      
      if (grappleEffect) {
        const coldRoll = await H.rollDice("1d6");
        await H.applyDamage(t, coldRoll.total, "cold");
        H.chatMessage(`<p><b>${t.actor.name}</b> takes <b>${coldRoll.total}</b> cold damage from the Maw's crushing tendrils!</p>`);
      }
    }
  }

  // ==========================
  // Utility
  // ==========================

  static _isSubclass(actor) {
    if (!actor) return false;
    
    const hasFeature = actor.items.some(i =>
      i.type === "feat" &&
      (i.name.toLowerCase().includes("saltling") ||
       i.name.toLowerCase().includes("tainted limb") ||
       i.name.toLowerCase().includes("tidal surge") ||
       i.name.toLowerCase().includes("salt scourge") ||
       i.name.toLowerCase().includes("brackish blood") ||
       i.name.toLowerCase().includes("maw beneath") ||
       i.name.toLowerCase().includes("iron seat") ||
       i.name.toLowerCase().includes("stillwater") ||
       i.name.toLowerCase().includes("apex predator") ||
       i.name.toLowerCase().includes("iron discipline"))
    );
    
    const hasFlag = H.getFlag(actor, `${SUBCLASS}.active`);
    
    return hasFeature || hasFlag;
  }

  // ==========================
  // STATIC API for Macros
  // ==========================

  /**
   * Initialize a character's Saltling resources
   * Call from macro: SpurnedSaltling.initializeResources(token.actor)
   */
  static async initializeResources(actor) {
    if (!actor) {
      ui.notifications.warn("No actor provided.");
      return;
    }

    const prof = H.getProfBonus(actor);
    const chaMod = H.getAbilityMod(actor, "cha");
    const conMod = H.getAbilityMod(actor, "con");

    await H.setFlag(actor, `${SUBCLASS}.active`, true);
    await H.setFlag(actor, `${SUBCLASS}.karma`, 0);
    await H.setFlag(actor, `${SUBCLASS}.unlocked`, {});
    await H.setFlag(actor, `${SUBCLASS}.lashingStrike.uses`, prof);
    await H.setFlag(actor, `${SUBCLASS}.lashingStrike.max`, prof);
    await H.setFlag(actor, `${SUBCLASS}.tidalSurge.uses`, prof);
    await H.setFlag(actor, `${SUBCLASS}.tidalSurge.max`, prof);
    await H.setFlag(actor, `${SUBCLASS}.inspiringPresence.uses`, Math.max(1, chaMod));
    await H.setFlag(actor, `${SUBCLASS}.inspiringPresence.max`, Math.max(1, chaMod));
    await H.setFlag(actor, `${SUBCLASS}.markOfDefiance.uses`, prof);
    await H.setFlag(actor, `${SUBCLASS}.markOfDefiance.max`, prof);
    await H.setFlag(actor, `${SUBCLASS}.lordsWrit.uses`, Math.max(1, conMod));
    await H.setFlag(actor, `${SUBCLASS}.lordsWrit.max`, Math.max(1, conMod));
    await H.setFlag(actor, `${SUBCLASS}.heartOfStorm.uses`, 1);
    await H.setFlag(actor, `${SUBCLASS}.heartOfStorm.max`, 1);
    await H.setFlag(actor, `${SUBCLASS}.barbedMaw.uses`, 1);
    await H.setFlag(actor, `${SUBCLASS}.barbedMaw.max`, 1);
    await H.setFlag(actor, `${SUBCLASS}.capstone.uses`, 1);
    await H.setFlag(actor, `${SUBCLASS}.capstone.max`, 1);
    await H.setFlag(actor, `${SUBCLASS}.stillwaterCalm.uses`, 1);
    await H.setFlag(actor, `${SUBCLASS}.stillwaterCalm.max`, 1);
    await H.setFlag(actor, `${SUBCLASS}.patientStrike.uses`, 1);
    await H.setFlag(actor, `${SUBCLASS}.patientStrike.max`, 1);
    await H.setFlag(actor, `${SUBCLASS}.turningTide.uses`, 1);
    await H.setFlag(actor, `${SUBCLASS}.turningTide.max`, 1);

    ui.notifications.info(`${actor.name}'s Saltling resources initialized (Karma scale: ${KARMA.MIN} to +${KARMA.MAX}).`);
    H.log(`Initialized Saltling resources for ${actor.name}`);
  }

  /**
   * Get current karma value
   * Call from macro: SpurnedSaltling.getKarma(token.actor)
   */
  static async getKarma(actor) {
    if (!actor) return 0;
    return await H.getFlag(actor, `${SUBCLASS}.karma`) ?? 0;
  }

  /**
   * Adjust karma by a delta value
   * Call from macro: SpurnedSaltling.adjustKarma(token.actor, -3)
   */
  static async adjustKarma(actor, delta) {
    if (!actor || typeof delta !== "number") return;

    const oldKarma = await this.getKarma(actor);
    const newKarma = Math.max(KARMA.MIN, Math.min(KARMA.MAX, oldKarma + delta));

    await H.setFlag(actor, `${SUBCLASS}.karma`, newKarma);
    
    // Trigger karma changed hook
    Hooks.call(`${MODULE_ID}.karmaChanged`, actor, newKarma, oldKarma);

    return newKarma;
  }

  /**
   * Set karma to a specific value
   * Call from macro: SpurnedSaltling.setKarma(token.actor, -10)
   */
  static async setKarma(actor, value) {
    if (!actor || typeof value !== "number") return;

    const oldKarma = await this.getKarma(actor);
    const newKarma = Math.max(KARMA.MIN, Math.min(KARMA.MAX, value));

    await H.setFlag(actor, `${SUBCLASS}.karma`, newKarma);
    
    // Trigger karma changed hook
    Hooks.call(`${MODULE_ID}.karmaChanged`, actor, newKarma, oldKarma);

    return newKarma;
  }

  /**
   * Display karma status in chat
   * Call from macro: SpurnedSaltling.showKarmaStatus(token.actor)
   */
  static async showKarmaStatus(actor) {
    if (!actor) return;

    const karma = await this.getKarma(actor);
    const unlocked = await H.getFlag(actor, `${SUBCLASS}.unlocked`) ?? {};
    const beastBrand = await H.getFlag(actor, `${SUBCLASS}.beastBrand`);
    const saintHalo = await H.getFlag(actor, `${SUBCLASS}.saintHalo`);

    // Determine tier name
    let tierName = "Neutral";
    if (karma <= KARMA.TIER_DROWNED_MAX) tierName = "Drowned in the Drowned One's Embrace";
    else if (karma <= KARMA.TIER_BEAST_ASCENDS_MAX) tierName = "Ascension of the Beast";
    else if (karma <= KARMA.TIER_FADING_MAX) tierName = "Fading Humanity";
    else if (karma <= KARMA.TIER_CREEPING_MAX) tierName = "Creeping Monstrosity";
    else if (karma <= KARMA.TIER_UNSETTLING_MAX) tierName = "Unsettling Presence";
    else if (karma >= KARMA.TIER_LEGEND_MIN) tierName = "Legend of Two Worlds";
    else if (karma >= KARMA.TIER_HEART_MIN) tierName = "Heart of the Isles";
    else if (karma >= KARMA.TIER_DEFIANT_MIN) tierName = "Defiant Paragon";
    else if (karma >= KARMA.TIER_AGAINST_MIN) tierName = "Against Expectation";
    else if (karma >= KARMA.TIER_GLIMMER_MIN) tierName = "Glimmer of Nobility";

    // Build unlocked abilities list
    let abyssalAbilities = [];
    let ascendantAbilities = [];

    if (unlocked.constrictingGrasp) abyssalAbilities.push("Constricting Grasp");
    if (unlocked.elongatedReach) abyssalAbilities.push("Elongated Reach");
    if (unlocked.barbedMaw) abyssalAbilities.push("Barbed Maw");
    if (unlocked.inspiringPresence) ascendantAbilities.push("Inspiring Presence");
    if (unlocked.markOfDefiance) ascendantAbilities.push("Mark of Defiance");
    if (unlocked.heartOfStorm) ascendantAbilities.push("Heart of the Storm");

    const brandStatus = beastBrand ? "🔴 <b>BRANDED</b> (permanent -2 CHA vs non-Ironborn)" : "—";
    const haloStatus = saintHalo ? "🟢 <b>HALOED</b> (permanent +2 CHA vs non-Ironborn)" : "—";

    H.chatMessage(`
      <h3>⚖️ Karma Status: ${actor.name}</h3>
      <p><b>Current Karma:</b> ${karma} / ${KARMA.MIN} to +${KARMA.MAX}</p>
      <p><b>Current Tier:</b> ${tierName}</p>
      <hr>
      <p><b>Beast's Brand:</b> ${brandStatus}</p>
      <p><b>Saint's Halo:</b> ${haloStatus}</p>
      <hr>
      <p><b>Abyssal Abilities Unlocked:</b> ${abyssalAbilities.length ? abyssalAbilities.join(", ") : "None"}</p>
      <p><b>Ascendant Abilities Unlocked:</b> ${ascendantAbilities.length ? ascendantAbilities.join(", ") : "None"}</p>
      <hr>
      <p><small>Path locks at ±${Math.abs(KARMA.BEAST_BRAND)}. Capstones require ±${Math.abs(KARMA.MAW_BENEATH)}.</small></p>
    `);
  }
}

// Export karma constants for external use
export { KARMA };
