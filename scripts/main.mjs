// ============================================================================
// Westeros Homebrew Subclass Automation — Main Entry Point
// ============================================================================
// This module automates the five active homebrew subclasses for the Westeros
// campaign. It hooks into Midi-QOL, DAE, and the core dnd5e system to handle:
//   1. The Spurned Saltling  (Fighter) — Karma system
//   2. Circle of the Greenblood (Druid)
//   3. The Flenser           (Rogue)
//   4. The Waylaid Bravo     (Fighter) — Water Dancing / Flourishes
//   5. School of Mentalism   (Wizard)  — The Forged Chain
//
// REMOVED in v3.0.0:
//   - Way of the Gràg / Fist of the Gràg (Monk)
//   - Bastard of the Woods (Barbarian)
//   Those characters have left the campaign; their scripts are no longer
//   shipped or registered. Any existing actor flags under the
//   `westeros-homebrew` namespace for them are inert and can be ignored.
// ============================================================================

import { SpurnedSaltling } from "./spurned-saltling.mjs";
import { Greenblood } from "./greenblood.mjs";
import { Flenser } from "./flenser.mjs";
import { WaylaidBravo } from "./waylaid-bravo.mjs";
import { Mentalism } from "./mentalism.mjs";
import { WesterosHelpers } from "./helpers.mjs";

const MODULE_ID = "westeros-homebrew";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initialising Westeros Homebrew Subclass Automation`);

  // Register module settings
  game.settings.register(MODULE_ID, "debugMode", {
    name: "Debug Mode",
    hint: "Logs detailed automation info to console.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "autoApplyEffects", {
    name: "Auto-Apply Active Effects",
    hint: "Automatically apply DAE-compatible active effects from subclass features.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
});

Hooks.once("ready", () => {
  const gen = Number(game.release?.generation ?? 13);
  const sysVersion = game.system?.version ?? "unknown";
  console.log(`${MODULE_ID} | Foundry v${gen} | dnd5e ${sysVersion}`);

  // Confirm dependencies
  if (!game.modules.get("midi-qol")?.active) {
    ui.notifications.error("Westeros Homebrew requires Midi-QOL to be active!");
    return;
  }
  if (!game.modules.get("dae")?.active) {
    ui.notifications.warn(
      "Westeros Homebrew requires DAE for full automation — special durations " +
      "and the Waking Nightmare optional bonus depend on it."
    );
  }

  // Times Up was discontinued at v14; its special-duration handling moved into
  // DAE. Warn only on v13, where the module is still doing that job.
  if (gen < 14 && !game.modules.get("times-up")?.active) {
    ui.notifications.warn("Westeros Homebrew: Times Up is not active — timed effects may not expire.");
  }

  // Expose helpers globally for macro fallback usage
  globalThis.WesterosHomebrew = {
    helpers: WesterosHelpers,
    spurnedSaltling: SpurnedSaltling,
    greenblood: Greenblood,
    flenser: Flenser,
    waylaidBravo: WaylaidBravo,
    mentalism: Mentalism,
    MODULE_ID,
    generation: gen
  };

  // Register all subclass hooks
  SpurnedSaltling.register();
  Greenblood.register();
  Flenser.register();
  WaylaidBravo.register();
  Mentalism.register();

  console.log(`${MODULE_ID} | All five subclass automations registered.`);
  if (game.user.isGM) {
    ui.notifications.info(`Westeros Homebrew loaded — 5 subclasses active (Foundry v${gen}).`);
  }
});
