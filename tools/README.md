# tools/

Developer tooling. **Nothing here ships.** The game is plain static files served
straight from the repo root, and it must never depend on npm or Node — see the Tech
constraints in `CLAUDE.md`.

## Tests

```sh
npm test          # node --test tools/tests/
```

No dependencies to install. It uses Node's built-in test runner (`node:test` +
`node:assert`), so Node 22+ and a clone of the repo are all you need. (The `test`
script passes a glob rather than a directory, which older Node does not expand.)

Run it after touching game logic, balance numbers, or the save format.

### How the tests reach the game

The game ships as `<script defer>` tags sharing globals, so there is nothing to
`require`. `tests/helpers/load-game.js` runs the real `js/*.js` files inside a fresh V8
context (one per test file) with small stand-ins for the browser APIs the game uses
(`localStorage`, `btoa`/`atob`, a dummy `document`). Tests exercise the actual game
source, never a copy. `js/main.js` is excluded because it calls `init()` on load.

One wrinkle worth knowing: top-level `const CONFIG` and `let state` are *lexical*
bindings, so they are not properties of the context object the way function declarations
are. The helper exposes them as `g.CONFIG` and `g.state` getters that evaluate inside the
context; `g.fn` holds the game's functions.

```js
const g = loadGame();
g.reset(500);                                   // state = newState(), 500 virions
g.state.upgrades.hostShutdown.owned = true;
g.fn.checkUnlocks();
assert.ok(g.state.generators.cholerae.unlocked);
```

### vendor/

`vendor/break_infinity-2.2.0.min.js` is a copy of the library `index.html` loads from
jsDelivr, kept here so the suite runs offline and deterministically. The version is in
the filename, and `static-assets.test.js` fails if it ever stops matching the version
`index.html` pins — so re-vendor this file when that pin changes.

## Balance simulator

```sh
npm run sim
npm run sim -- --hours 8 --step 0.5 --idle-minutes 30 --wall-minutes 5
```

Plays the economy at high speed from a fresh save, once for every strategy × playstyle
(`STRATEGY_ORDER` × `PLAYSTYLES` in `sim/sim.js`). For each run it prints when each
host and Mutation is first bought, when total virions produced passes each power of 10,
and any walls (stretches with no purchase longer than `--wall-minutes`, or than the
playstyle's shopping interval if that is longer). It ends with comparison tables across
all runs: a summary, when each Mutation is bought, and when each host's owned count
reaches 1, 10, 100... (also in the CSV as `owned_count` events). The same events go to
`sim/results/sim-<timestamp>.csv` and `sim/results/latest.csv` (gitignored). Offline
progress is not simulated.

- `sim/load-logic.js` loads the vendored Decimal plus **only** `config.js`,
  `state.js` and `loop.js` into a `node:vm` context with no browser stubs at all.
  If game logic ever needs the DOM or `localStorage`, loading fails
  (`tests/pure-logic.test.js` catches it).
- `sim/strategies.js` holds buying strategies. A strategy is `(g) => void` and must
  buy through the exported `buy()` helper so purchases get logged. To add one,
  write the function, add it to `STRATEGIES`, and list its name in
  `STRATEGY_ORDER` in `sim/sim.js`. The test suite smoke-tests every strategy.
- `greedyPayback` buys the lowest cost-per-(virions/sec gained) item, saving up when
  it cannot afford it yet. Cost-type Mutations add no production, so it buys them as
  soon as they are affordable.
- `cheapestFirst` always buys the cheapest visible item, host or Mutation, saving up
  when it cannot afford it yet.

## Balance scorecard and tuning

```sh
npm run tune                             # score the current config.js
npm run tune -- --patch cand.json        # score config.js with a patch applied
npm run tune -- --search --minutes 5     # hill-climb and print the best patch
```

`sim/tune.js` runs Active greedyPayback for 30 minutes of game time and grades the
early-game pacing against `TARGETS`: T (all Mutations + 10 of each host) in 15–20 min,
no purchase-free gap over 3 min before T, at most 30% of purchases within 5s of the
previous one, and no first-buy interval over 2x the even spacing. It prints PASS/FAIL,
a score (lower is better) and the first-buy timeline.

A patch is JSON keyed by id, and every field is optional:

```json
{ "costGrowth": 1.3,
  "generators": { "listeria": { "baseCost": 45000, "baseRate": 600 } },
  "upgrades": { "hostShutdown": { "cost": 6000, "mult": 0.5 },
                "streamlinedGenome": { "delta": -0.01 } } }
```

It is applied in memory through `loadLogic({ patch })`, so `config.js` is never
touched. The search nudges 1–3 random levers at a time and keeps any improvement. Its
numbers are unrounded, so round them, re-score with `--patch`, then copy them into
`config.js` by hand (and update the Mutation descriptions).
