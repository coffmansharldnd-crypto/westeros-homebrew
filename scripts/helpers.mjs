// ============================================================================
// Westeros Homebrew — Shared Helpers
// ============================================================================

const MODULE_ID = "westeros-homebrew";

export class WesterosHelpers {

  static log(...args) {
    if (game.settings.get(MODULE_ID, "debugMode")) {
      console.log(`${MODULE_ID} |`, ...args);
    }
  }

  // ---- Flag helpers (world-scoped for persistence) ----

  static getFlag(actor, key) {
    return actor.getFlag(MODULE_ID, key);
  }

  static async setFlag(actor, key, value) {
    return actor.setFlag(MODULE_ID, key, value);
  }

  static async unsetFlag(actor, key) {
    return actor.unsetFlag(MODULE_ID, key);
  }

  // ---- Ability score / save DC helpers ----

  static getAbilityMod(actor, ability) {
    return actor.system.abilities[ability]?.mod ?? 0;
  }

  static getProfBonus(actor) {
    return actor.system.attributes.prof ?? 2;
  }

  /** Standard DC = 8 + prof + ability mod */
  static getStandardDC(actor, ability) {
    return 8 + this.getProfBonus(actor) + this.getAbilityMod(actor, ability);
  }

  /** Custom DC = base + prof + ability mod (for Bastard of the Woods: 5 + prof + mod) */
  static getCustomDC(actor, ability, base = 5) {
    return base + this.getProfBonus(actor) + this.getAbilityMod(actor, ability);
  }

  static getSpellDC(actor) {
    return actor.system.attributes.spelldc ?? this.getStandardDC(actor, "cha");
  }

  // ---- Resource / uses tracking via flags ----

  static async getUses(actor, featureKey) {
    return this.getFlag(actor, `${featureKey}.uses`) ?? 0;
  }

  static async setUses(actor, featureKey, value) {
    return this.setFlag(actor, `${featureKey}.uses`, value);
  }

  static async getMaxUses(actor, featureKey) {
    return this.getFlag(actor, `${featureKey}.maxUses`) ?? 0;
  }

  static async setMaxUses(actor, featureKey, value) {
    return this.setFlag(actor, `${featureKey}.maxUses`, value);
  }

  static async expendUse(actor, featureKey) {
    const uses = await this.getUses(actor, featureKey);
    if (uses <= 0) return false;
    await this.setUses(actor, featureKey, uses - 1);
    return true;
  }

  // ---- Long rest hook to reset uses ----

  static async resetOnLongRest(actor, featureKey, maxUses) {
    await this.setUses(actor, featureKey, maxUses);
    await this.setMaxUses(actor, featureKey, maxUses);
  }

  static async resetOnShortRest(actor, featureKey, restoreAmount) {
    const current = await this.getUses(actor, featureKey);
    const max = await this.getMaxUses(actor, featureKey);
    await this.setUses(actor, featureKey, Math.min(current + restoreAmount, max));
  }

  // ---- Token/Actor retrieval ----

  static getTokenFromActor(actor) {
    return canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
  }

  static getActorFromToken(tokenId) {
    const token = canvas.tokens.get(tokenId);
    return token?.actor;
  }

  // ---- Distance helpers ----

  static getDistanceBetweenTokens(token1, token2) {
    if (!token1 || !token2) return Infinity;
    const gs = canvas.grid.size;
    const d = canvas.grid.measureDistance(
      { x: token1.x + gs / 2, y: token1.y + gs / 2 },
      { x: token2.x + gs / 2, y: token2.y + gs / 2 }
    );
    return d;
  }

  static getTokensInRadius(sourceToken, radiusFeet, disposition = null) {
    return canvas.tokens.placeables.filter(t => {
      if (t.id === sourceToken.id) return false;
      const dist = this.getDistanceBetweenTokens(sourceToken, t);
      if (dist > radiusFeet) return false;
      if (disposition !== null && t.document.disposition !== disposition) return false;
      return true;
    });
  }

  // ---- Saving throw prompt ----

  static async promptSavingThrow(targetActor, ability, dc, options = {}) {
    const roll = await targetActor.rollAbilitySave(ability, {
      targetValue: dc,
      fastForward: true,
      chatMessage: true,
      ...options
    });
    return { roll, success: roll.total >= dc };
  }

  // ---- Apply damage helper ----

  static async applyDamage(targetToken, amount, damageType = "bludgeoning") {
    if (!targetToken?.actor) return;
    return MidiQOL.applyTokenDamage(
      [{ damage: amount, type: damageType }],
      amount,
      new Set([targetToken]),
      null,
      null
    );
  }

  // ---- Apply healing helper ----

  static async applyHealing(targetToken, amount) {
    if (!targetToken?.actor) return;
    const actor = targetToken.actor;
    const hp = actor.system.attributes.hp;
    const newHp = Math.min(hp.value + amount, hp.max);
    return actor.update({ "system.attributes.hp.value": newHp });
  }

  // ---- Active Effect creation ----

  static createEffectData(name, icon, changes = [], duration = {}, flags = {}) {
    return {
      name,
      icon: icon || "icons/svg/aura.svg",
      origin: "",
      disabled: false,
      changes,
      duration: {
        rounds: duration.rounds ?? null,
        turns: duration.turns ?? null,
        seconds: duration.seconds ?? null,
        startRound: game.combat?.round ?? 0,
        startTurn: game.combat?.turn ?? 0,
        ...duration
      },
      flags: {
        [MODULE_ID]: { isWesterosEffect: true },
        dae: { specialDuration: duration.specialDuration ?? [] },
        ...flags
      }
    };
  }

  static async applyEffect(actor, effectData) {
    return actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
  }

  static async removeEffect(actor, effectName) {
    const effect = actor.effects.find(e => e.name === effectName);
    if (effect) return effect.delete();
  }

  // ---- Chat message helpers ----

  static async chatMessage(content, speaker = null) {
    return ChatMessage.create({
      speaker: speaker ?? ChatMessage.getSpeaker(),
      content: `<div class="westeros-homebrew">${content}</div>`
    });
  }

  // ---- Roll helpers ----

  static async rollDice(formula) {
    const roll = new Roll(formula);
    await roll.evaluate();
    return roll;
  }

  // ---- Dialog helper ----

  static async buttonDialog(title, content, buttons) {
    return new Promise(resolve => {
      new Dialog({
        title,
        content,
        buttons: buttons.reduce((acc, btn) => {
          acc[btn.id] = {
            label: btn.label,
            callback: () => resolve(btn.value ?? btn.id)
          };
          return acc;
        }, {}),
        default: buttons[0]?.id,
        close: () => resolve(null)
      }).render(true);
    });
  }

  // ---- Target selection helper ----

  static getFirstTarget() {
    const targets = game.user.targets;
    if (targets.size === 0) {
      ui.notifications.warn("You must target a token first.");
      return null;
    }
    return targets.first();
  }

  static getAllTargets() {
    return Array.from(game.user.targets);
  }
}
