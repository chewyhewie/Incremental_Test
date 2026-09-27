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
