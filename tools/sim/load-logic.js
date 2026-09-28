// Loads ONLY the game's pure-logic files into a bare V8 context: no DOM, no
// localStorage, no timers. If one of these files ever reaches for a browser API at
// load time, this throws, which is the point: the simulator must run the real game
// formulas, and those must stay browser-free. See the "Balance simulator" section
// in CLAUDE.md.

const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { JS_DIR, VENDOR_DECIMAL } = require("../tests/helpers/load-game.js");

// Same relative order as index.html.
const LOGIC_FILES = ["config.js", "state.js", "loop.js"];

// `patch`, if given, is called with CONFIG right after config.js loads, so tools can
// try balance numbers in memory without editing config.js.
function loadLogic({ patch } = {}) {
  // Only JS built-ins (Math, Date, JSON...) exist here, which vm provides itself.
  const ctx = vm.createContext({});
  const load = (file) =>
    vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
  const run = (src) => vm.runInContext(src, ctx);

  load(VENDOR_DECIMAL);
  for (const f of LOGIC_FILES) {
    load(path.join(JS_DIR, f));
    if (f === "config.js" && patch) patch(run("CONFIG"));
  }

  // `const CONFIG` / `let state` are lexical bindings, not context properties,
  // so read them through the context each time (newState() replaces `state`).
  return {
    fn: ctx,
    Decimal: ctx.Decimal,
    run,
    get CONFIG() { return run("CONFIG"); },
    get state() { return run("state"); },
    reset() { run("state = newState()"); },
  };
}

module.exports = { loadLogic, LOGIC_FILES };
