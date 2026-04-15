// ============================================================================
// Westeros Homebrew Subclass Automation — Main Entry Point
// ============================================================================
// This module automates all five homebrew subclasses for the Westeros campaign.
// It hooks into Midi-QOL, DAE, and the core dnd5e system to handle:
//   1. The Spurned Saltling (Fighter) — UPDATED
//   2. Way of the Gràg (Monk)
//   3. Circle of the Greenblood (Druid)
//   4. Bastard of the Woods (Barbarian)
//   5. The Flenser (Rogue)
// ============================================================================

import { SpurnedSaltling } from "./spurned-saltling.mjs";
import { Grag } from "./grag.mjs";
import { Greenblood } from "./greenblood.mjs";
import { BastardWoods } from "./bastard-woods.mjs";
import { Flenser } from "./flenser.mjs";
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
  // Confirm dependencies
  if (!game.modules.get("midi-qol")?.active) {
    ui.notifications.error("Westeros Homebrew requires Midi-QOL to be active!");
    return;
  }
  if (!game.modules.get("dae")?.active) {
    ui.notifications.warn("Westeros Homebrew recommends DAE for full automation.");
  }

  // Expose helpers globally for macro fallback usage
  globalThis.WesterosHomebrew = {
    helpers: WesterosHelpers,
    spurnedSaltling: SpurnedSaltling,
    grag: Grag,
    greenblood: Greenblood,
    bastardWoods: BastardWoods,
    flenser: Flenser,
    MODULE_ID
  };

  // Register all subclass hooks
  SpurnedSaltling.register();
  Grag.register();
  Greenblood.register();
  BastardWoods.register();
  Flenser.register();

  console.log(`${MODULE_ID} | All five subclass automations registered.`);
  if (game.user.isGM) {
    ui.notifications.info("Westeros Homebrew Automation loaded — 5 subclasses active.");
  }
});
