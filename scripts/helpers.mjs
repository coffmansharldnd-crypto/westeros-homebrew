// ============================================================================
// Westeros Homebrew — Shared Helpers
// ============================================================================
// COMPATIBILITY LAYER (v3.1.0)
// This file abstracts every API that changed between Foundry v13 and v14 so
// the subclass scripts never have to care which generation they run on.
//
// What changed in v14 and how it is handled here:
//   1. Active Effects v2 — `changes` moved to `system.changes`, `mode` (number)
//      became `type` (string), `icon` became `img`. Handled by MODE and the
//      _normalizeEffectData() pass in createEffectData()/applyEffect().
//   2. canvas.grid.measureDistance() removed (a v12 deprecation) — measurePath().
//   3. dnd5e rollAbilitySave()/rollSkill(id, opts) deprecated in dnd5e 4.1 —
//      rollSavingThrow({ability}) / rollSkill({skill}).
//   4. AppV1 Dialog deprecated since v13 — DialogV2.
// Every shim falls back to the old API when the new one is absent, so this file
// stays correct on Foundry v13 + dnd5e 5.1/5.2 as well as v14 + dnd5e 5.3.
// ============================================================================

const MODULE_ID = "westeros-homebrew";

export class WesterosHelpers {

  static log(...args) {
    if (game.settings.get(MODULE_ID, "debugMode")) {
      console.log(`${MODULE_ID} |`, ...args);
    }
  }

  // ==========================================================================
  // VERSION DETECTION
  // ==========================================================================

  /** Foundry core generation (13, 14, ...). */
  static get gen() {
    return Number(game.release?.generation ?? 13);
  }

  /** True when running Foundry v14 or later (Active Effects v2). */
  static get isV14() {
    return this.gen >= 14;
  }

  /** dnd5e system version as a major integer. */
  static get systemMajor() {
    return Number(game.system?.version?.split(".")[0] ?? 5);
  }

  // ==========================================================================
  // ACTIVE EFFECT CHANGE MODES
  // ==========================================================================
  // v13: numeric enum on CONST.ACTIVE_EFFECT_MODES
  // v14: lowercase string keys of CONST.ACTIVE_EFFECT_CHANGE_TYPES
  // Always author changes with H.MODE.ADD, never CONST.ACTIVE_EFFECT_MODES.ADD.
  // ==========================================================================

  static get MODE() {
    if (this.isV14) {
      return {
        CUSTOM: "custom",
        MULTIPLY: "multiply",
        ADD: "add",
        SUBTRACT: "subtract",
        DOWNGRADE: "downgrade",
        UPGRADE: "upgrade",
        OVERRIDE: "override"
      };
    }
    const M = CONST.ACTIVE_EFFECT_MODES ?? {};
    return {
      CUSTOM: M.CUSTOM ?? 0,
      MULTIPLY: M.MULTIPLY ?? 1,
      ADD: M.ADD ?? 2,
      SUBTRACT: M.ADD ?? 2,      // no v13 equivalent — use ADD with a negative value
      DOWNGRADE: M.DOWNGRADE ?? 3,
      UPGRADE: M.UPGRADE ?? 4,
      OVERRIDE: M.OVERRIDE ?? 5
    };
  }

  /** Numeric v13 mode -> v14 string type. */
  static _modeToType(mode) {
    if (typeof mode === "string") return mode;
    return ({ 0: "custom", 1: "multiply", 2: "add", 3: "downgrade", 4: "upgrade", 5: "override" })[mode] ?? "add";
  }

  /** v14 string type -> numeric v13 mode. */
  static _typeToMode(type) {
    if (typeof type === "number") return type;
    return ({ custom: 0, multiply: 1, add: 2, subtract: 2, downgrade: 3, upgrade: 4, override: 5 })[type] ?? 2;
  }

  /**
   * Reshape effect creation data for the running generation.
   * Accepts either shape as input and is safe to call more than once.
   */
  static _normalizeEffectData(data) {
    if (!data || typeof data !== "object") return data;
    const out = foundry.utils.deepClone(data);
    let changes = out.system?.changes ?? out.changes ?? [];

    if (this.isV14) {
      changes = changes.map(c => {
        const type = this._modeToType(c.type ?? c.mode);
        const { mode, ...rest } = c;
        return { ...rest, type };
      });
      out.system = { ...(out.system ?? {}), changes };
      delete out.changes;
    } else {
      changes = changes.map(c => {
        const mode = this._typeToMode(c.mode ?? c.type);
        const { type, ...rest } = c;
        return { ...rest, mode };
      });
      out.changes = changes;
      if (out.system?.changes) delete out.system.changes;
    }

    // `icon` was renamed to `img` in v12 and the shim is gone in v14.
    // Emit `img` only, on every generation.
    if (out.icon && !out.img) out.img = out.icon;
    delete out.icon;

    return out;
  }

  /** Read an effect's changes regardless of generation. */
  static effectChanges(effect) {
    return effect?.system?.changes ?? effect?.changes ?? [];
  }

  /** Update an effect's changes regardless of generation. */
  static async updateEffectChanges(effect, changes) {
    if (!effect) return;
    const normalized = this.isV14
      ? changes.map(c => {
          const type = this._modeToType(c.type ?? c.mode);
          const { mode, ...rest } = c;
          return { ...rest, type };
        })
      : changes.map(c => {
          const mode = this._typeToMode(c.mode ?? c.type);
          const { type, ...rest } = c;
          return { ...rest, mode };
        });
    return effect.update(this.isV14 ? { "system.changes": normalized } : { changes: normalized });
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

  /** Custom DC = base + prof + ability mod (for features that don't use the standard 8 base) */
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
  // canvas.grid.measureDistance() was deprecated in v12 and removed in v14.
  // measurePath() exists in v12+, so it is the primary path here.

  static getDistanceBetweenTokens(token1, token2) {
    if (!token1 || !token2) return Infinity;
    const gs = canvas.grid.size;
    const a = { x: token1.x + gs / 2, y: token1.y + gs / 2 };
    const b = { x: token2.x + gs / 2, y: token2.y + gs / 2 };

    if (typeof canvas.grid.measurePath === "function") {
      return canvas.grid.measurePath([a, b])?.distance ?? Infinity;
    }
    if (typeof canvas.grid.measureDistance === "function") {
      return canvas.grid.measureDistance(a, b);
    }
    const px = Math.hypot(b.x - a.x, b.y - a.y);
    return (px / gs) * (canvas.scene?.grid?.distance ?? 5);
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
  // dnd5e 4.1 replaced rollAbilitySave(id, opts) with rollSavingThrow({ability}).

  static async promptSavingThrow(targetActor, ability, dc, options = {}) {
    let roll;
    try {
      if (typeof targetActor.rollSavingThrow === "function") {
        const result = await targetActor.rollSavingThrow(
          { ability, target: dc, ...options },
          { configure: false },
          {}
        );
        roll = Array.isArray(result) ? result[0] : result;
      } else {
        roll = await targetActor.rollAbilitySave(ability, {
          targetValue: dc, fastForward: true, chatMessage: true, ...options
        });
      }
    } catch (err) {
      console.error(`${MODULE_ID} | Saving throw failed for ${targetActor?.name}`, err);
      return { roll: null, success: false };
    }
    const total = roll?.total ?? 0;
    return { roll, success: total >= dc };
  }

  // ---- Skill check ----
  // dnd5e 4.1 replaced rollSkill(id, opts) with rollSkill({skill}).

  static async rollSkill(actor, skill, options = {}) {
    try {
      const result = await actor.rollSkill({ skill, ...options }, { configure: false }, {});
      return Array.isArray(result) ? result[0] : result;
    } catch (err) {
      try {
        return await actor.rollSkill(skill, { fastForward: true, chatMessage: true, ...options });
      } catch (err2) {
        console.error(`${MODULE_ID} | Skill check failed for ${actor?.name} (${skill})`, err2);
        return null;
      }
    }
  }

  // ---- Apply damage helper ----

  static async applyDamage(targetToken, amount, damageType = "bludgeoning") {
    if (!targetToken?.actor) return;
    try {
      return await MidiQOL.applyTokenDamage(
        [{ damage: amount, type: damageType }],
        amount,
        new Set([targetToken]),
        null,
        null
      );
    } catch (err) {
      console.warn(`${MODULE_ID} | MidiQOL.applyTokenDamage failed, applying directly`, err);
      const actor = targetToken.actor;
      if (typeof actor.applyDamage === "function") {
        return actor.applyDamage([{ value: amount, type: damageType }]);
      }
      const hp = actor.system.attributes.hp;
      return actor.update({ "system.attributes.hp.value": Math.max(0, hp.value - amount) });
    }
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
    const data = {
      name,
      img: icon || "icons/svg/aura.svg",
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
    // specialDuration is a DAE flag, not a core duration field — strip it from
    // duration so v14's stricter duration schema does not reject it.
    delete data.duration.specialDuration;
    return this._normalizeEffectData(data);
  }

  static async applyEffect(actor, effectData) {
    return actor.createEmbeddedDocuments("ActiveEffect", [this._normalizeEffectData(effectData)]);
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

  // ---- Dialog helpers ----
  // AppV1 Dialog was deprecated in v13. DialogV2 exists in v13 and v14, so it
  // is the primary path with an AppV1 fallback for older cores.

  static async buttonDialog(title, content, buttons) {
    const DV2 = foundry.applications?.api?.DialogV2;
    if (DV2) {
      try {
        const result = await DV2.wait({
          window: { title },
          content,
          buttons: buttons.map((btn, i) => ({
            action: btn.id,
            label: btn.label,
            default: i === 0,
            callback: () => btn.value ?? btn.id
          })),
          rejectClose: false
        });
        return result ?? null;
      } catch (err) {
        this.log("DialogV2 failed, falling back to AppV1 Dialog", err);
      }
    }
    const AppV1Dialog = foundry.appv1?.api?.Dialog ?? globalThis.Dialog;
    if (!AppV1Dialog) {
      console.error(`${MODULE_ID} | No dialog implementation available.`);
      return null;
    }
    return new Promise(resolve => {
      new AppV1Dialog({
        title,
        content,
        buttons: buttons.reduce((acc, btn) => {
          acc[btn.id] = { label: btn.label, callback: () => resolve(btn.value ?? btn.id) };
          return acc;
        }, {}),
        default: buttons[0]?.id,
        close: () => resolve(null)
      }).render(true);
    });
  }

  /**
   * Dialog containing a form. Returns { fieldId: value } for each id in
   * `fieldIds`, or null if cancelled. Works on DialogV2 (native DOM) and
   * AppV1 Dialog (jQuery).
   */
  static async formDialog(title, content, fieldIds, confirmLabel = "Confirm") {
    const read = (root) => {
      const out = {};
      for (const id of fieldIds) {
        const el = root?.querySelector?.(`#${id}`);
        out[id] = el?.value ?? "";
      }
      return out;
    };

    const DV2 = foundry.applications?.api?.DialogV2;
    if (DV2) {
      try {
        return await DV2.wait({
          window: { title },
          content,
          buttons: [
            {
              action: "confirm",
              label: confirmLabel,
              default: true,
              callback: (event, button, dialog) =>
                read(button?.form ?? dialog?.element ?? button?.closest?.("form"))
            },
            { action: "cancel", label: "Cancel", callback: () => null }
          ],
          rejectClose: false
        });
      } catch (err) {
        this.log("DialogV2 form failed, falling back to AppV1 Dialog", err);
      }
    }

    const AppV1Dialog = foundry.appv1?.api?.Dialog ?? globalThis.Dialog;
    if (!AppV1Dialog) {
      console.error(`${MODULE_ID} | No dialog implementation available.`);
      return null;
    }
    return new Promise(resolve => {
      new AppV1Dialog({
        title,
        content,
        buttons: {
          confirm: { label: confirmLabel, callback: (html) => resolve(read(html?.[0] ?? html)) },
          cancel: { label: "Cancel", callback: () => resolve(null) }
        },
        default: "confirm",
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
