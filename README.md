# Westeros Homebrew Subclasses

Foundry VTT v13 automation for the homebrew subclasses used in the Westeros campaign.

**Version 3.1.0** — verified on Foundry v13 and v14

## Active subclasses

| Subclass | Class | Script |
|---|---|---|
| The Spurned Saltling | Fighter | `scripts/spurned-saltling.mjs` |
| Circle of the Greenblood | Druid | `scripts/greenblood.mjs` |
| The Flenser | Rogue | `scripts/flenser.mjs` |
| The Waylaid Bravo | Fighter | `scripts/waylaid-bravo.mjs` |
| School of Mentalism | Wizard | `scripts/mentalism.mjs` |

## Removed in 3.0.0

- **Way of the Gràg / Fist of the Gràg** (Monk) — `grag.mjs` deleted
- **Bastard of the Woods** (Barbarian) — `bastard-woods.mjs` deleted

Those characters have left the campaign. Their scripts are no longer shipped or
registered. Actor flags left over in the `westeros-homebrew` namespace are inert
and safe to leave in place.

## Compatibility

| | Foundry v13 | Foundry v14 |
|---|---|---|
| dnd5e system | 5.1 – 5.2.5 | **5.3.0+ required** |
| Midi-QOL | 13.0.29+ | 14.0.7+ |
| DAE | 13.0.6+ | 14.0.9+ |
| Times Up | 11.3.x | **discontinued — do not install** |

Times Up has no v14 release. Core now covers most of what it did, and its
special-duration handling was folded into DAE, so `flags.dae.specialDuration`
(used by Quick as a Snake and Calm as Still Water) keeps working without it.

`scripts/helpers.mjs` carries a compatibility layer that detects the running
generation and reshapes Active Effect data accordingly, so the same build runs
on both. Subclass scripts author changes with `H.MODE.ADD`, never
`CONST.ACTIVE_EFFECT_MODES.ADD`.

## Dependencies

- **Required:** Midi-QOL, DAE (Dynamic Active Effects)

## Architecture

```
westeros-homebrew/
├── module.json
├── README.md
└── scripts/
    ├── main.mjs             # Entry point — registers all subclasses
    ├── helpers.mjs          # Shared utilities (flags, rolls, effects, UI)
    ├── spurned-saltling.mjs
    ├── greenblood.mjs
    ├── flenser.mjs
    ├── waylaid-bravo.mjs
    └── mentalism.mjs
```

## Contractual feature names

Dispatch is by case-insensitive substring match on item names. **Renaming any of
these on a DDB re-import will silently break automation.** Check them after every
DDB Importer run.

### The Waylaid Bravo
`Water Dancing`, `Quick as a Snake`, `Swift as a Deer`, `Fierce as a Wolverine`,
`Calm as Still Water`, `Braavosi Footwork`, `Water Dancer's Guard`,
`The Bravo's Schooling`, `The Dance of the First Sword`

### School of Mentalism
`The Forged Chain`, `Chain Link: <Metal>`, `Waking Nightmare`,
`Malleable Illusions`, `Pyrite into Gold`

## Post-import setup

Activate this module **before** importing characters from D&D Beyond so the hooks
are registered, then run the relevant initialisation macro:

```js
// Saltling
WesterosHomebrew.spurnedSaltling.initialize(canvas.tokens.controlled[0]?.actor);

// Waylaid Bravo
WesterosHomebrew.waylaidBravo.initialize(canvas.tokens.controlled[0]?.actor);

// Mentalism
WesterosHomebrew.mentalism.initialize(canvas.tokens.controlled[0]?.actor);
```

### GM-only: forging a new Mentalism chain link

```js
WesterosHomebrew.mentalism.forgeLink(
  canvas.tokens.controlled[0]?.actor,
  "Jadeite",          // link name
  ["poison"]          // Waking Nightmare damage types granted
);
```

## Module settings

| Setting | Description |
|---|---|
| Debug Mode | Logs detailed automation to the browser console (F12) |
| Auto-Apply Effects | Auto-apply DAE effects from subclass features |

## Troubleshooting

- **Feature does nothing?** Confirm the item is a *Feat* type and its name still
  contains the contractual substring.
- **Water Dancer's Guard not applying?** The dancing condition requires no armour,
  no shield, and exactly one equipped one-handed finesse melee weapon.
- **Waking Nightmare never prompts?** Midi-QOL's optional bonus system must be
  enabled, and the spell's damage type must match a forged link (below wizard 10).
- **Effects not expiring?** On v13, Times Up must be active. On v14, core and DAE handle expiry — Times Up should be uninstalled.
- **Console errors?** Enable Debug Mode and check the console.
