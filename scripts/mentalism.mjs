// ============================================================================
// School of Mentalism — Wizard Subclass Automation
// ============================================================================
// Features:
//   Level 2:  The Forged Chain (Pyrite, Quicksilver)
//   Level 2:  Waking Nightmare (INT mod to one damage roll / short rest,
//             gated by forged link damage types)
//   Level 6:  The Unyielding Mind (psychic resistance, adv. vs charm/fright)
//             + Electrum & Bronze links forged
//   Level 10: The Whole Chain (Waking Nightmare applies to ALL damage types)
//   Level 10: Malleable Illusions (GM adjudicated — chat prompt only)
//   Level 11: Pyrite into Gold — Gilded Illusion (INT mod / long rest)
//             and The Waking World (ignore psychic resistance)
//
// DESIGN NOTE — Waking Nightmare uses Midi-QOL's native "optional bonus"
// system rather than injecting damage post-roll. The module maintains an
// Active Effect carrying flags.midi-qol.optional.wakingNightmare.* and
// enables/disables it on preItemRoll depending on whether the spell's damage
// types match the character's forged links. Midi then handles the prompt,
// the bonus, and the once-per-short-rest tracking itself.
// ============================================================================

import { WesterosHelpers as H } from "./helpers.mjs";

const MODULE_ID = "westeros-homebrew";
const SUBCLASS = "mentalism";
const WN_EFFECT_NAME = "Waking Nightmare (Optional Bonus)";

// Foundational links. Key = lowercase match string used against item names.
const FOUNDATIONAL_LINKS = {
  pyrite:      { label: "Pyrite",      level: 2,  school: "Illusion",      types: ["psychic"] },
  quicksilver: { label: "Quicksilver", level: 2,  school: "Glamor",        types: [] },
  electrum:    { label: "Electrum",    level: 6,  school: "Evocation",     types: ["lightning"] },
  bronze:      { label: "Bronze",      level: 6,  school: "Divination",    types: ["radiant"] },
  platinum:    { label: "Platinum",    level: 10, school: "Transmutation", types: ["acid"] }
};

export class Mentalism {

  static register() {
    H.log("Registering School of Mentalism automation");

    Hooks.on("dnd5e.restCompleted", this._onRest.bind(this));
    Hooks.on("midi-qol.preItemRoll", this._onPreItemRoll.bind(this));
    Hooks.on("midi-qol.preTargetDamageApplication", this._onPreTargetDamage.bind(this));
  }

  // ==========================
  // LINK TRACKING
  // ==========================

  /**
   * Returns the set of forged links as [{key, label, types}].
   * Foundational links are detected from items named "Chain Link: <Metal>".
   * GM-granted links live in the flag mentalism.customLinks as
   * [{label, types:[...]}] and are added by Mentalism.forgeLink().
   */
  static forgedLinks(actor) {
    const links = [];
    const names = actor.items
      .filter(i => i.name?.toLowerCase().includes("chain link"))
      .map(i => i.name.toLowerCase());

    for (const [key, data] of Object.entries(FOUNDATIONAL_LINKS)) {
      if (names.some(n => n.includes(key))) links.push({ key, ...data });
    }

    const custom = H.getFlag(actor, `${SUBCLASS}.customLinks`) ?? [];
    for (const link of custom) {
      links.push({ key: link.label?.toLowerCase() ?? "custom", label: link.label, types: link.types ?? [] });
    }
    return links;
  }

  /** Damage types currently carried by forged links. Returns "ALL" at wizard 10+. */
  static wakingNightmareTypes(actor) {
    const wizLevel = actor.classes?.wizard?.system?.levels ?? 0;
    if (wizLevel >= 10) return "ALL"; // The Whole Chain
    const types = new Set();
    for (const link of this.forgedLinks(actor)) {
      for (const t of (link.types ?? [])) types.add(t.toLowerCase());
    }
    // Safety net: Pyrite is forged at level 2 regardless of item bookkeeping.
    if (!types.size) types.add("psychic");
    return types;
  }

  /** GM-callable: register a new link forged in play. */
  static async forgeLink(actor, label, types = []) {
    if (!actor) return ui.notifications.warn("No actor supplied.");
    const custom = foundry.utils.duplicate(H.getFlag(actor, `${SUBCLASS}.customLinks`) ?? []);
    if (custom.some(l => l.label?.toLowerCase() === label.toLowerCase())) {
      return ui.notifications.warn(`${actor.name} has already forged the ${label} link.`);
    }
    custom.push({ label, types: types.map(t => t.toLowerCase()) });
    await H.setFlag(actor, `${SUBCLASS}.customLinks`, custom);
    H.chatMessage(`
      <h3>A New Link is Forged</h3>
      <p><b>${actor.name}</b> adds the <b>${label}</b> link to the chain.</p>
      ${types.length ? `<p>Waking Nightmare now carries: <b>${types.join(", ")}</b>.</p>` : ""}
      <p><small>Remember to add a "Chain Link: ${label}" feature item and its granted spells.</small></p>
    `);
  }

  // ==========================
  // WAKING NIGHTMARE — Midi optional bonus plumbing
  // ==========================

  static _wakingNightmareEffectData() {
    const M = H.MODE.OVERRIDE;
    return {
      name: WN_EFFECT_NAME,
      icon: "icons/magic/control/fear-fright-monster-purple.webp",
      disabled: true,
      changes: [
        { key: "flags.midi-qol.optional.wakingNightmare.label", mode: M, value: "Waking Nightmare", priority: 20 },
        { key: "flags.midi-qol.optional.wakingNightmare.count", mode: M, value: "short-rest", priority: 20 },
        { key: "flags.midi-qol.optional.wakingNightmare.damage.all", mode: M, value: "+@abilities.int.mod", priority: 20 }
      ],
      flags: { [MODULE_ID]: { isWesterosEffect: true, wakingNightmare: true } }
    };
  }

  static async _ensureWakingNightmareEffect(actor) {
    let effect = actor.effects.find(e => e.name === WN_EFFECT_NAME);
    if (!effect) {
      await H.applyEffect(actor, this._wakingNightmareEffectData());
      effect = actor.effects.find(e => e.name === WN_EFFECT_NAME);
      H.log("Created Waking Nightmare optional-bonus effect on", actor.name);
    }
    return effect;
  }

  /** Pull damage types off an item across dnd5e v3 (damage.parts) and v4+ (activities). */
  static _spellDamageTypes(item) {
    const types = new Set();
    try {
      // dnd5e v3 style
      for (const part of (item.system?.damage?.parts ?? [])) {
        if (part?.[1]) types.add(String(part[1]).toLowerCase());
      }
      // dnd5e v4+ activities style
      const activities = item.system?.activities;
      if (activities) {
        for (const activity of activities) {
          for (const part of (activity?.damage?.parts ?? [])) {
            const set = part?.types;
            if (set?.forEach) set.forEach(t => types.add(String(t).toLowerCase()));
            else if (part?.type) types.add(String(part.type).toLowerCase());
          }
        }
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | Mentalism: could not read damage types from ${item?.name}`, err);
    }
    return types;
  }

  // ==========================
  // PRE-ITEM ROLL
  // ==========================

  static async _onPreItemRoll(workflow) {
    const actor = workflow?.actor;
    if (!actor || !this._isSubclass(actor)) return;

    const item = workflow.item;
    const itemName = item?.name?.toLowerCase() ?? "";

    // --- Named feature dispatch (GM-facing reference cards) ---
    if (itemName.includes("the forged chain") || itemName.includes("chain link")) {
      return this._chainStatus(workflow);
    }
    if (itemName.includes("malleable illusion")) {
      return this._malleableIllusions(workflow);
    }
    if (itemName.includes("waking nightmare")) {
      return this._wakingNightmareStatus(workflow);
    }

    // --- Waking Nightmare gating ---
    if (item?.type === "spell") {
      await this._gateWakingNightmare(actor, item);
      await this._gildedIllusionPrompt(workflow);
    }
  }

  static async _gateWakingNightmare(actor, item) {
    const effect = await this._ensureWakingNightmareEffect(actor);
    if (!effect) return;

    const allowed = this.wakingNightmareTypes(actor);
    let qualifies = false;

    if (allowed === "ALL") {
      qualifies = this._spellDamageTypes(item).size > 0;
    } else {
      for (const t of this._spellDamageTypes(item)) {
        if (allowed.has(t)) { qualifies = true; break; }
      }
    }

    if (effect.disabled === !qualifies) return; // already in the right state
    await effect.update({ disabled: !qualifies });
    H.log(`Waking Nightmare ${qualifies ? "armed" : "disarmed"} for ${item.name}`);
  }

  static async _wakingNightmareStatus(workflow) {
    const actor = workflow.actor;
    const allowed = this.wakingNightmareTypes(actor);
    const list = allowed === "ALL" ? "<b>all damage types</b> (The Whole Chain)" : `<b>${[...allowed].join(", ")}</b>`;
    H.chatMessage(`
      <h3>Waking Nightmare</h3>
      <p>Currently applies to ${list}.</p>
      <p>Add <b>+${H.getAbilityMod(actor, "int")}</b> to one damage roll per short rest.</p>
      <p><small>Midi will offer the bonus automatically after a qualifying damage roll.</small></p>
    `);
    return false;
  }

  static async _chainStatus(workflow) {
    const actor = workflow.actor;
    const links = this.forgedLinks(actor);
    const rows = links.map(l =>
      `<tr><td><b>${l.label}</b></td><td>${l.school ?? "—"}</td><td>${(l.types ?? []).join(", ") || "—"}</td></tr>`
    ).join("");
    H.chatMessage(`
      <h3>The Forged Chain</h3>
      <table><tr><th>Link</th><th>Discipline</th><th>Nightmare Type</th></tr>${rows}</table>
    `);
    return false;
  }

  // ==========================
  // MALLEABLE ILLUSIONS (Level 10) — GM adjudicated
  // ==========================

  static async _malleableIllusions(workflow) {
    H.chatMessage(`
      <h3>Malleable Illusions</h3>
      <p><b>${workflow.actor.name}</b> reshapes a long-duration illusion as a bonus action.</p>
      <p><small>GM: set the DC for seeing through the reshaped illusion. Failure over
      repeated exposures means the world begins to remember the illusion as true.</small></p>
    `);
    return false;
  }

  // ==========================
  // GILDED ILLUSION (Level 11)
  // ==========================

  static async _gildedIllusionPrompt(workflow) {
    const actor = workflow.actor;
    const wizLevel = actor.classes?.wizard?.system?.levels ?? 0;
    if (wizLevel < 11) return;

    const item = workflow.item;
    const school = item?.system?.school ?? "";
    const level = item?.system?.level ?? 0;
    if (school !== "ill" || level < 1) return;

    const uses = await H.getUses(actor, `${SUBCLASS}.gildedIllusion`);
    if (uses <= 0) return;

    const choice = await H.buttonDialog(
      "Gilded Illusion",
      `<p>Make one inanimate, nonmagical object within <b>${item.name}</b> <b>real</b>?</p>
       <p><small>${uses} use(s) remaining (INT mod / long rest)</small></p>`,
      [
        { id: "yes", label: "Gild it", value: "yes" },
        { id: "no", label: "Illusion only", value: "no" }
      ]
    );
    if (choice !== "yes") return;

    await H.expendUse(actor, `${SUBCLASS}.gildedIllusion`);
    H.chatMessage(`
      <h3>Gilded Illusion</h3>
      <p><b>${actor.name}</b> makes one object within <b>${item.name}</b> real — solid enough to
      bear weight, block a doorway, or span a chasm.</p>
      <p><small>${uses - 1} use(s) remaining.</small></p>
    `);
  }

  // ==========================
  // THE WAKING WORLD (Level 11) — ignore psychic resistance
  // ==========================

  static _onPreTargetDamage(token, options) {
    try {
      const workflow = options?.workflow;
      const actor = workflow?.actor;
      if (!actor || !this._isSubclass(actor)) return;
      if ((actor.classes?.wizard?.system?.levels ?? 0) < 11) return;

      const targetActor = token?.actor ?? token;
      const traits = targetActor?.system?.traits;
      const dr = traits?.dr?.value;
      const di = traits?.di?.value;
      const hasResistance = dr?.has ? dr.has("psychic") : Array.from(dr ?? []).includes("psychic");
      const hasImmunity = di?.has ? di.has("psychic") : Array.from(di ?? []).includes("psychic");
      if (!hasResistance || hasImmunity) return;

      const detail = options?.ditem?.damageDetail ?? workflow?.damageDetail ?? [];
      const psychic = detail
        .filter(d => String(d?.type).toLowerCase() === "psychic")
        .reduce((sum, d) => sum + (d?.damage ?? d?.value ?? 0), 0);
      if (!psychic) return;

      const restored = Math.floor(psychic / 2);
      const ditem = options?.ditem;
      if (ditem && typeof ditem.hpDamage === "number") {
        ditem.hpDamage += restored;
        if (typeof ditem.newHP === "number") ditem.newHP = Math.max(0, ditem.newHP - restored);
        H.chatMessage(`<b>The Waking World:</b> psychic resistance ignored — <b>+${restored}</b> damage restored against ${targetActor.name}.`);
      } else {
        console.warn(`${MODULE_ID} | Mentalism: unexpected ditem shape, applying manual fallback notice.`);
        H.chatMessage(`<b>The Waking World:</b> ${targetActor.name} resists psychic damage — GM, apply <b>+${restored}</b> additional damage manually.`);
      }
    } catch (err) {
      console.error(`${MODULE_ID} | Mentalism: The Waking World failed`, err);
    }
  }

  // ==========================
  // REST HANDLER
  // ==========================

  static async _onRest(actor, result) {
    if (!this._isSubclass(actor)) return;
    const wizLevel = actor.classes?.wizard?.system?.levels ?? 0;

    // Waking Nightmare short-rest tracking is handled natively by Midi's
    // optional bonus count. Only Gilded Illusion needs flag tracking.
    if (result?.longRest && wizLevel >= 11) {
      const max = Math.max(1, H.getAbilityMod(actor, "int"));
      await H.resetOnLongRest(actor, `${SUBCLASS}.gildedIllusion`, max);
      H.chatMessage(`<b>Gilded Illusion</b> restored: ${max} use(s).`);
    }
  }

  // ==========================
  // INITIALISATION (run post-import via macro)
  // ==========================

  static async initialize(actor) {
    if (!actor) return ui.notifications.warn("Select a token first.");
    await H.setFlag(actor, `${SUBCLASS}.active`, true);
    if (!H.getFlag(actor, `${SUBCLASS}.customLinks`)) {
      await H.setFlag(actor, `${SUBCLASS}.customLinks`, []);
    }
    await this._ensureWakingNightmareEffect(actor);

    const wizLevel = actor.classes?.wizard?.system?.levels ?? 0;
    if (wizLevel >= 11) {
      const max = Math.max(1, H.getAbilityMod(actor, "int"));
      await H.resetOnLongRest(actor, `${SUBCLASS}.gildedIllusion`, max);
    }

    const links = this.forgedLinks(actor);
    H.chatMessage(`
      <h3>School of Mentalism — Initialised</h3>
      <p><b>${actor.name}</b> — wizard level ${wizLevel}.</p>
      <p>Links detected: <b>${links.map(l => l.label).join(", ") || "none (check Chain Link item names)"}</b></p>
      <p>Waking Nightmare bonus: <b>+${H.getAbilityMod(actor, "int")}</b> once per short rest.</p>
    `);
  }

  // ==========================
  // Utility
  // ==========================

  static _isSubclass(actor) {
    if (!actor) return false;
    const hasFeature = actor.items.some(i =>
      i.type === "feat" &&
      (i.name.toLowerCase().includes("mummer") ||
       i.name.toLowerCase().includes("mentalism") ||
       i.name.toLowerCase().includes("forged chain") ||
       i.name.toLowerCase().includes("waking nightmare") ||
       i.name.toLowerCase().includes("chain link") ||
       i.name.toLowerCase().includes("pyrite into gold"))
    );
    const hasFlag = H.getFlag(actor, `${SUBCLASS}.active`);
    return hasFeature || !!hasFlag;
  }
}
