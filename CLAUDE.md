# Viral Load: project guide

Browser incremental (idle) game. The player is a microscopic virus in a lab
petri dish, trying to multiply as much as possible.

## Theme & tone
- Neutral and slightly irreverent. Not grim, not medically realistic.
- Visuals: dark background, glowing green/teal accents (tokens in `style.css` `:root`).
- Terms: resource = **Virions**, generators = **hosts** (Class I = infected
  bacteria), one-time upgrades = **Mutations**.

## Tech constraints
- Plain HTML, CSS, JavaScript. No frameworks, npm, bundlers, or build step.
- Runs as static files on GitHub Pages; develop with VS Code Live Server.
- Scripts are plain `<script defer>` tags sharing globals (no ES modules).
  Load order in `index.html` matters.
- **break_infinity.js** (pinned `@2.2.0` via jsDelivr) for every resource
  amount and cost. Never use plain JS numbers for virions or costs.

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

## Rules
1. **One state object.** All persistent game state lives in `state`
   (`state.js`). Transient UI-only data (messages) lives in `uiState` (`ui.js`)
   and is never saved.
2. **Only `render()` updates the screen.** It runs ~10×/sec from the loop.
   Event handlers change state, then call `render()`. `buildUI()` creates DOM
   once at startup.
3. **Delta time.** The loop measures real elapsed time (`Date.now()`) and
   passes seconds to `update(dt)`. Never assume a fixed tick length.
4. **No magic numbers** outside `config.js`. New generators and upgrades are
   added as config entries; the UI builds from config.
5. **Costs** grow ×1.15 per purchase and are rounded up (`ceil`).
   Upgrade effects are data (`effect.kind` = `"output"` | `"cost"`).
6. **Unlocks:** a generator becomes visible once virions reach 50% of its
   base cost; the `unlocked` flag is saved so it stays visible.
7. **Number format:** plain numbers below 1e6, then `1.23e6` (`formatNumber`).
8. **Saving:** localStorage, base64 JSON, Decimals stored as strings. Save
   has `version` and `lastSaved`. Autosave every 30s, on `beforeunload`, and
   when the tab is hidden. When changing the save shape, bump
   `CONFIG.saveVersion` and add a step in `migrateSave()`.
9. **Offline progress** = production × time since `lastSaved`, capped at 8h,
   reported in the "While you were away..." notice.
10. There is no click-to-earn action by design.
