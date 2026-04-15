# Westeros Homebrew Subclass Automation

A Foundry VTT module that automates all five homebrew subclasses for the Westeros D&D 5e campaign.

## Version 2.1.0 — Expanded Karma Scale

This version updates the Spurned Saltling's Karma system to use a **-25 to +25 scale** (previously -10 to +10), providing more granular progression and clearer thresholds.

## Subclasses Automated

| Subclass | Base Class | Key Automations |
|---|---|---|
| **The Spurned Saltling** | Fighter | Karma system, Salt Scourge, Tainted Limb, Tidal Surge, Constricting Grasp, Barbed Maw, Inspiring Presence, Mark of Defiance, Heart of the Storm, Apex Predator/Iron Discipline/Stillwater, The Maw Beneath/The Iron Seat |
| **Way of the Gràg** | Monk | Stone Fist (bonus damage), Numbing Blow (speed + poison), Self-Reliance (condition removal), Frozen Sinew (damage reduction), Shatter Strike (3d8 + prone) |
| **Circle of the Greenblood** | Druid | Two Branches of the Root (poison rider on heals), The Ground Provides (AoE regen garden), Sangre Verde (capstone heal burst) |
| **Bastard of the Woods** | Barbarian | Bear Vice (3-stage grapple), Sanding Edge (catch blade reaction), Stone's Throw (leap attack), Storm Clap (environmental stun), Bear and the Maiden Fair (animal taming) |
| **The Flenser** | Rogue | Tallow Preparations (Rendering Fire / Smoke Tallow / Wax Brand), Smoke-Blind (passive), Ibbenese Cleverness (passive), Leviathan's Toll (bonus damage on conditioned targets) |

## The Spurned Saltling — Karma System

The Saltling uses a **Karma** value from **-25 (Abyssal)** to **+25 (Ascendant)**, starting at 0.

### Path Locking

- At **Karma -15**: Ascendant abilities become dormant. The character gains **The Beast's Brand** — a permanent -2 penalty to all Charisma checks vs non-Ironborn that persists even if Karma rises.
- At **Karma +15**: The Tainted Limb stops evolving. Abyssal abilities already unlocked are retained but no new ones can be gained. The character gains **The Saint's Halo** — a permanent +2 bonus to all Charisma checks vs non-Ironborn.

### GM Karma Adjustment

Use the "Saltling - Adjust Karma [GM]" macro to adjust a character's Karma based on their roleplayed actions.

## Requirements

- **Foundry VTT** v12 or v13
- **Midi-QOL** (required — handles attack/damage workflow hooks)
- **DAE** (recommended — active effects automation)
- **Times Up** (recommended — automatic effect duration tracking)

## Installation on The Forge

### Step 1: Package the Module

1. Download/clone this folder so you have:
   ```
   westeros-homebrew/
   ├── module.json
   ├── README.md
   └── scripts/
       ├── main.mjs
       ├── helpers.mjs
       ├── spurned-saltling.mjs   ← NEW (replaces drowned-one.mjs)
       ├── grag.mjs
       ├── greenblood.mjs
       ├── bastard-woods.mjs
       └── flenser.mjs
   ```

2. **Zip the folder** — the zip must contain the `westeros-homebrew/` folder at root:
   ```
   westeros-homebrew.zip
   └── westeros-homebrew/
       ├── module.json
       └── scripts/...
   ```

### Step 2: Upload to The Forge

1. Log in to [The Forge](https://forge-vtt.com) and go to **My Account → Assets Library**.
2. Create a folder called `modules` if it doesn't exist.
3. Upload `westeros-homebrew.zip` into the `modules` folder.
4. Go to **My Games** → select your game → **Configure** → **Modules**.
5. Click **Install Module** → **Upload Module** → select the zip.

### Step 3: Enable the Module in Foundry

1. Launch your game world.
2. Go to **Settings** → **Manage Modules**.
3. Find **"Westeros Homebrew Subclass Automation"** and tick the checkbox.
4. Ensure **Midi-QOL**, **DAE**, and **Times Up** are also enabled.
5. Click **Save Module Settings**.
6. You should see: *"Westeros Homebrew Automation loaded — 5 subclasses active."*

### Step 4: Configure Midi-QOL

1. Go to **Settings** → **Module Settings** → **Midi-QOL**.
2. Under **Workflow**:
   - Set **Auto Roll Attack** to your preference.
   - Set **Auto Roll Damage** to "Attack Hits".
   - Set **Auto Apply Damage** to "Yes".
3. Under **Saves**:
   - Enable **Auto Check Saves**.
4. Ensure onUse macro hooks are enabled.

## Setting Up Character Features

For each PC using a homebrew subclass, create **Feature items** on their character sheet that the module can detect by name.

### Detection Keywords

| Subclass | Create features containing ANY of these words |
|---|---|
| Spurned Saltling | "Saltling", "Tainted Limb", "Tidal Surge", "Salt Scourge", "Brackish Blood", "Maw Beneath", "Iron Seat" |
| Gràg | "Stone Fist", "Gràg", "Grag", "Numbing Blow" |
| Greenblood | "Greenblood", "Two Branches", "Ground Provides", "Sangre Verde" |
| Bastard of the Woods | "Bear Vice", "Sanding Edge", "Bastard", "Storm Clap" |
| Flenser | "Flenser", "Tallow", "Rendering Fire", "Leviathan" |

### Recommended Feature Items — The Spurned Saltling

Create these as **Feat** type items:

**Level 3:**
- "Brackish Blood" (Passive)
- "Salt Scourge" (Action — ranged spell attack, CON-based, 1d8 cold)
- "The Tainted Limb" (Weapon — 1d6 bludgeoning, Light)
- "Tidal Surge" (Special — bonus cold + push on melee hit)

**Karma -8 Threshold:**
- "Constricting Grasp" (Special — grapple on Tainted Limb hit)

**Karma +8 Threshold:**
- "Inspiring Presence" (Reaction — +1d4 to ally)

**Karma -13 Threshold:**
- "Elongated Reach" — Update Tainted Limb to 10 ft reach, 1d8 damage

**Karma +13 Threshold:**
- "Mark of Defiance" (Bonus Action)

**Karma -18 Threshold:**
- "Barbed Maw" (Special — 1/short rest)

**Karma +18 Threshold:**
- "Heart of the Storm" (Enhancement — 1/long rest)

**Level 7:**
- "Apex Predator" (Passive — if Karma -8 or lower)
- "Iron Discipline" (Passive + Reaction — if Karma +8 or higher)
- "Stillwater" (Passive — if Karma between -5 and +5)

**Level 10:**
- "The Maw Beneath" (Bonus Action — 1/long rest, requires Karma -23)
- "The Iron Seat" (Action — 1/long rest, requires Karma +23)
- "Weight of Stillwater" (Bonus Action — 1/long rest, requires Karma -5 to +5 maintained)

### Alternative: Flag-Based Detection

```js
// Run in Foundry console (F12)
let actor = game.actors.getName("CharacterName");
await actor.setFlag("westeros-homebrew", "spurned-saltling.active", true);
await actor.setFlag("westeros-homebrew", "spurned-saltling.karma", 0);
```

### Initialising Saltling Resources

After enabling the module, run the "Saltling - Initialize Resources" macro or take a long rest.

## Saltling Macros Included

| Macro | Purpose |
|-------|---------|
| Saltling - View Karma | Display current Karma value and tier |
| Saltling - Adjust Karma [GM] | GM tool to adjust Karma with reason |
| Saltling - Initialize Resources | Set up all resource counters |
| Saltling - Lashing Strike | Bonus action Tainted Limb attack |
| Saltling - Constricting Grasp | Grapple attempt after Limb hit |
| Saltling - Constrict | Bonus action damage to grappled target |
| Saltling - Barbed Maw | Poison + extra damage |
| Saltling - Inspiring Presence | Reaction +1d4 to ally |
| Saltling - Mark of Defiance | Force disadvantage on attacks vs others |
| Saltling - Heart of the Storm | Enhanced Second Wind |
| Saltling - Lord's Writ | Command ally to attack or move |
| Saltling - The Maw Beneath | Tentacle transformation capstone |
| Saltling - The Iron Seat | Command aura capstone |

## What's Automated vs Manual

| Feature | Automation Level | Manual Steps |
|---|---|---|
| Karma tracking | ✅ Full (via macro) | DM decides when to adjust |
| Salt Scourge | ✅ Full (attack + speed effect) | — |
| Tidal Surge | ✅ Prompts on melee hit | — |
| Constricting Grasp | ✅ Full (contest + grapple) | — |
| Barbed Maw | ✅ Full (save + poison) | — |
| Inspiring Presence | ✅ Rolls bonus die | Player adds to ally's roll |
| Mark of Defiance | ⚠️ Applies mark | Save enforcement is manual |
| Heart of the Storm | ✅ Full (heal + advantage) | Reaction movement is manual |
| Apex Predator | ✅ Auto-advantage vs wounded | — |
| Iron Discipline aura | ⚠️ Passive | Set up Aura Effects module |
| Maw Beneath | ✅ Full (transform + frighten) | — |
| Iron Seat | ✅ Full (self buffs) | Aura buffs need manual/module |

## Module Settings

| Setting | Description |
|---|---|
| **Debug Mode** | Logs detailed automation to browser console (F12) |
| **Auto-Apply Effects** | Whether to auto-apply DAE effects from features |

## Troubleshooting

- **Features not triggering?** Check that the character has a Feat-type item with the correct keyword in its name.
- **Karma not tracking?** Run the "Initialize Resources" macro or check the flag manually.
- **Saves not rolling?** Ensure Midi-QOL's "Auto Check Saves" is enabled.
- **Effects not expiring?** Ensure Times Up module is active.

## Architecture

```
westeros-homebrew/
├── module.json              # Module manifest
├── README.md                # This file
└── scripts/
    ├── main.mjs             # Entry point — registers all subclasses
    ├── helpers.mjs          # Shared utilities
    ├── spurned-saltling.mjs # The Spurned Saltling (Fighter) ← NEW
    ├── grag.mjs             # Way of the Gràg (Monk)
    ├── greenblood.mjs       # Circle of the Greenblood (Druid)
    ├── bastard-woods.mjs    # Bastard of the Woods (Barbarian)
    └── flenser.mjs          # The Flenser (Rogue)
```

## Changelog

### v2.1.0 — Expanded Karma Scale
- **UPDATED** Karma system from -10/+10 to **-25/+25** scale (50-point range)
- **UPDATED** All karma thresholds:
  - First abilities (Constricting Grasp / Inspiring Presence): ±8
  - Second abilities (Elongated Reach / Mark of Defiance): ±13
  - Path Lock (Beast's Brand / Saint's Halo): ±15
  - Third abilities (Barbed Maw / Heart of the Storm): ±18
  - Capstones (Maw Beneath / Iron Seat): ±23
  - Level 7 Apex/Iron: ±8
  - Level 7 Stillwater: -5 to +5
- **NEW** Saint's Halo permanent +2 CHA bonus at Karma +15 (mirrors Beast's Brand)
- **NEW** Weight of Stillwater capstone automation
- **NEW** Full Stillwater path automation (The Calm, Patient Strike, Turning Tide)

### v2.0.0
- **REPLACED** Oath of the Drowned One (Paladin) with The Spurned Saltling (Fighter)
- **NEW** Karma system with dual-path progression (Abyssal/Ascendant)
- **NEW** Permanent "Beast's Brand" penalty when crossing Karma -5
- **NEW** Stillwater path for balanced players (Level 7)
- **NEW** Full automation for all Saltling features

### v1.0.0
- Initial release with 5 subclasses
