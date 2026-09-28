# Viral Load: project guide

Browser incremental (idle) game. The player is a microscopic virus in a lab
petri dish, trying to multiply as much as possible.

## Theme & tone
- Neutral and slightly irreverent. Not grim, not medically realistic.
- Visuals: dark background, glowing green/teal accents (tokens in `style.css` `:root`).
- Terms: resource = **Virions**, generators = **hosts** (Class I = infected
  bacteria), one-time upgrades = **Mutations**.

## Tech constraints
- The game itself is plain HTML/CSS/JS: no frameworks, no build step.
  It must run directly from static files via Live Server and GitHub
  Pages. Never make the game depend on npm or Node.
- Node/npm are allowed ONLY for developer tools in `tools/`.
- Run `npm test` after changes to game logic or save format.
- Scripts are plain `<script defer>` tags sharing globals (no ES modules).
  Load order in `index.html` matters.
- **break_infinity.js** (pinned `@2.2.0` via jsDelivr) for every resource
  amount and cost. Never use plain JS numbers for virions, costs, or any
  multiplier raised to an owned count — `Math.pow(1.1, 10000)` is `Infinity`,
  silently. Use `Decimal.pow`.

## File layout
- `index.html`: markup and script tags
- `style.css`: all styles
- `js/config.js`: `CONFIG`, **all** balance numbers (costs, rates, multipliers, timings)
- `js/state.js`: the `state` object, `newState()`, cost/production helpers, buy functions
- `js/loop.js`: `update(dt)` and the tick loop
- `js/save.js`: save/load, offline progress, export/import, hard reset, migrations
- `js/ui.js`: `buildUI()`, `render()`, number formatting, settings handlers
- `js/main.js`: startup
- `docs/roadmap.md`: future ideas for use and to be maintained by Claude
- `docs/todo.md`: notes for use and to be maintained by user. This file should NOT be edited by Claude, but it should be merged in all commits.
- `tools/`: developer tooling, never shipped. `tools/tests/` is the `npm test`
  suite (`node:test`, no dependencies); see `tools/README.md`. `tools/sim/` is
  the balance simulator (see below)
- `package.json`: dev-only, holds the `test`, `sim` and `tune` scripts. The game does not use it.

## Balance simulator
- `npm run sim` plays 4h of game time for every strategy × playstyle and prints
  milestone and wall tables; CSV goes to `tools/sim/results/` (gitignored).
- `npm run tune` scores the early-game pacing targets (`TARGETS` in
  `tools/sim/tune.js`) PASS/FAIL. Run it after any balance change.
- Both are report-only: never change balance numbers because of a run unless
  the user asks. Details and flags: `tools/README.md`.
- **Game logic stays pure.** Costs, production, upgrade effects and `update(dt)`
  live in `config.js` / `state.js` / `loop.js`, which must never touch the DOM,
  `localStorage`, or timers at load time or in those functions. The sim loads
  exactly those three files with no browser globals, so it runs the real
  formulas; putting logic in `ui.js`/`save.js` would make it silently wrong.
  `tools/tests/pure-logic.test.js` enforces the loading part.

## Rules
1. **One state object.** All persistent game state lives in `state`
   (`state.js`). Transient UI-only data (messages, active tab) lives in `uiState` (`ui.js`)
   and is never saved.
2. **Only `render()` updates the screen.** It runs ~10×/sec from the loop.
   Event handlers change state, then call `render()`. `buildUI()` creates DOM
   once at startup.
3. **Delta time.** The loop measures real elapsed time (`Date.now()`) and
   passes seconds to `update(dt)`. Never assume a fixed tick length.
4. **No magic numbers** outside `config.js`. New generators and upgrades are
   added as config entries; the UI builds from config.
5. **Costs** grow ×1.3 per purchase and are rounded up (`ceil`).
   Upgrade effects are data: `effect.kind` = `"output"` | `"cost"` | `"costGrowth"`
   | `"milestone"`. Targeting is independent of kind — `targetId` hits one
   generator, `targetClass` a whole class, and neither means global.
6. **Unlocks:** a generator becomes visible once virions reach 10% of its
   current cost (after cost Mutations), an upgrade at 10% of its cost; the
   `unlocked` flag is saved so it stays visible.
   **Owned implies unlocked:** `buyUpgrade` refuses a hidden Mutation, and
   loading forces `unlocked` when `owned`. Anything that grants a Mutation
   (prestige perks, achievements) must set both flags, or `render()` hides
   what the player owns.
7. **Number format:** plain numbers below 1e6, then `1.23e6` (`formatNumber`).
8. **Saving:** localStorage, base64 JSON, Decimals stored as strings. Save
   has `version` and `lastSaved`. Autosave every 30s. When changing the save
   shape, bump `CONFIG.saveVersion` and add a step in `migrateSave()`.
9. **Offline progress** = production × time since `lastSaved`, capped at 8h,
   reported in the "While you were away..." notice.
10. There is no click-to-earn action by design.
11. **Mutation descriptions state their effect sizes** ("2.5x virions"), so
    change the text whenever the number changes. A config-integrity test checks it.
12. **Tests read balance numbers from `CONFIG`**, never hard-coded costs, rates or
    multipliers, so retuning doesn't break the suite.
13. **Encoding:** source files are UTF-8. `config.js` was once double-encoded
    (`×` showed as `Ã—`), so check non-ASCII text after any scripted edit.
