// Loads the REAL game files (js/*.js) into a fresh V8 context per test file.
//
// The game ships as plain `<script defer>` tags sharing globals, so there is
// nothing to `require`. Instead we build a context with the few browser globals
// the game touches and run each file in it, in the same order as index.html.
//
// Two V8 details shape the API below:
//   - `function foo()` at the top level of a script becomes a property of the
//     context object, so game functions are reachable as `g.fn.foo`.
//   - `const CONFIG` / `let state` / `const uiState` go into the global LEXICAL
//     environment instead, so they are NOT properties of the context. They are
//     exposed here as getters that evaluate inside the context. `state` is also
//     reassigned by newState(), so a captured reference would go stale.

const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

const REPO = path.resolve(__dirname, "..", "..", "..");
const JS_DIR = path.join(REPO, "js");
const VENDOR_DECIMAL = path.join(__dirname, "..", "vendor", "break_infinity-2.2.0.min.js");

// Same order as index.html. main.js is deliberately absent: it calls init() on load,
// which would touch the DOM and start timers.
const GAME_FILES = ["config.js", "state.js", "loop.js", "save.js", "ui.js"];

// Minimal stand-ins for the browser APIs the game uses. buildUI()/render() are
// never called by the suite, so `document` only has to exist.
function makeStubs() {
  const store = new Map();
  return {
    console,
    Date,
    Math,
    Number,
    JSON,
    Infinity,
    NaN,
    isFinite,
    isNaN,
    btoa: (s) => Buffer.from(s, "binary").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
      get length() { return store.size; },
    },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
    window: { addEventListener: () => {} },
    setInterval: () => 0,
    clearInterval: () => {},
  };
}

/**
 * Build an isolated game instance.
 * @returns {{
 *   fn: object, CONFIG: object, state: object, uiState: object,
 *   Decimal: Function, run: (src: string) => any,
 *   reset: (virions?: number|string) => object,
 *   num: (d: any) => number, str: (d: any) => string,
 *   localStorage: object, files: string[]
 * }}
 */
function loadGame() {
  const ctx = makeStubs();
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  const load = (file) =>
    vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });

  load(VENDOR_DECIMAL);
  for (const f of GAME_FILES) load(path.join(JS_DIR, f));

  const run = (src) => vm.runInContext(src, ctx);

  const g = {
    fn: ctx,
    Decimal: ctx.Decimal,
    localStorage: ctx.localStorage,
    files: GAME_FILES.slice(),
    run,

    // Lexical bindings: must be read through the context each time.
    get CONFIG() { return run("CONFIG"); },
    get state() { return run("state"); },
    set state(v) { ctx.__incoming = v; run("state = __incoming"); delete ctx.__incoming; },
    get uiState() { return run("uiState"); },

    /** Fresh state, optionally with a virion count. Returns the new state. */
    reset(virions) {
      run("state = newState()");
      if (virions !== undefined) {
        run(`state.virions = new Decimal(${JSON.stringify(String(virions))})`);
      }
      return g.state;
    },

    /** Decimal (or number) -> number, for assertions. */
    num(d) { return typeof d === "number" ? d : d.toNumber(); },
    /** Decimal (or anything) -> string, for exact big-number assertions. */
    str(d) { return String(d); },

    /**
     * Copy a plain value out of the VM realm into this one.
     *
     * Objects and arrays created inside the context have that context's
     * Object/Array prototypes, so assert.deepStrictEqual against a literal here
     * fails with "same structure but not reference-equal". Pass VM data through
     * this before any deep comparison.
     */
    plain(v) { return JSON.parse(JSON.stringify(v)); },
  };

  return g;
}

module.exports = { loadGame, REPO, JS_DIR, GAME_FILES, VENDOR_DECIMAL };
