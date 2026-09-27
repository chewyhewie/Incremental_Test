// Guards on index.html itself. The game has no build step, so index.html IS the
// dependency graph: if it drifts, the browser breaks in ways the other tests
// (which load js/*.js directly) would never notice.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { REPO, JS_DIR, GAME_FILES, VENDOR_DECIMAL } = require("./helpers/load-game.js");

const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
// Every local script src, in document order.
const localScripts = [...html.matchAll(/<script[^>]*\bsrc="(js\/[^"]+)"/g)].map((m) => m[1]);

test("the vendored Decimal matches the version index.html pins", () => {
  const cdn = html.match(/break_infinity\.js@([\d.]+)/);
  assert.ok(cdn, "index.html loads break_infinity from a pinned URL");
  const vendored = path.basename(VENDOR_DECIMAL).match(/break_infinity-([\d.]+)\.min\.js/);
  assert.ok(vendored, "the vendored copy carries its version in the filename");
  assert.equal(
    cdn[1], vendored[1],
    `index.html pins break_infinity ${cdn[1]} but the tests load ${vendored[1]}. ` +
    `Re-vendor tools/tests/vendor/ so the suite tests what the game ships.`,
  );
});

test("the vendored Decimal file exists and defines Decimal", () => {
  assert.ok(fs.existsSync(VENDOR_DECIMAL));
  const src = fs.readFileSync(VENDOR_DECIMAL, "utf8");
  assert.ok(src.includes("Decimal"), "the bundle mentions Decimal");
});

test("Decimal loads before any game script that uses it", () => {
  const decimalAt = html.indexOf("break_infinity");
  const firstGameAt = html.indexOf('src="js/');
  assert.ok(decimalAt !== -1 && firstGameAt !== -1);
  assert.ok(decimalAt < firstGameAt, "break_infinity is listed first");
});

test("scripts are listed in dependency order", () => {
  // config defines CONFIG; state reads it; loop/save/ui call into state; main starts up.
  const expected = ["js/config.js", "js/state.js", "js/loop.js", "js/save.js", "js/ui.js", "js/main.js"];
  assert.deepEqual(localScripts, expected);
});

test("main.js is loaded last, because it calls init() immediately", () => {
  assert.equal(localScripts.at(-1), "js/main.js");
});

test("every script tag uses defer, so the DOM exists before init runs", () => {
  const tags = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
  for (const tag of tags) {
    assert.match(tag, /\bdefer\b/, `${tag} is deferred`);
  }
});

test("every file in js/ is referenced by index.html", () => {
  const onDisk = fs.readdirSync(JS_DIR).filter((f) => f.endsWith(".js")).sort();
  const referenced = localScripts.map((s) => s.replace(/^js\//, "")).sort();
  assert.deepEqual(onDisk, referenced,
    "a js/ file is either unreferenced (dead, or forgotten in index.html) or missing");
});

test("the test harness loads the same game files index.html does, minus main.js", () => {
  const expected = localScripts.map((s) => s.replace(/^js\//, "")).filter((f) => f !== "main.js");
  assert.deepEqual(GAME_FILES, expected,
    "helpers/load-game.js has drifted from index.html's script list");
});

test("the game loads no third-party script other than the pinned Decimal", () => {
  const remote = [...html.matchAll(/<script[^>]*\bsrc="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  assert.equal(remote.length, 1, `expected only break_infinity, got ${remote.join(", ")}`);
  assert.match(remote[0], /break_infinity\.js@\d/, "and it is version-pinned");
});

test("no bundler or npm artifact has crept into the game itself", () => {
  // Node is allowed only under tools/. The game must stay static files.
  for (const f of ["node_modules", "dist", "build", "webpack.config.js", "vite.config.js"]) {
    assert.ok(!fs.existsSync(path.join(REPO, f)), `${f} must not exist at the repo root`);
  }
  assert.ok(!/type="module"/.test(html), "scripts share globals; no ES modules");
  assert.ok(!/require\(|from ['"]/.test(fs.readFileSync(path.join(JS_DIR, "state.js"), "utf8")),
    "js/state.js has no module imports");
});

test("the DOM ids the UI looks up all exist in index.html", () => {
  const ui = fs.readFileSync(path.join(JS_DIR, "ui.js"), "utf8");
  const ids = [...ui.matchAll(/getElementById\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, "found some getElementById calls to check");
  for (const id of new Set(ids)) {
    assert.ok(html.includes(`id="${id}"`), `index.html is missing id="${id}"`);
  }
});

test("the tab buttons and panels line up", () => {
  const tabs = [...html.matchAll(/data-tab="([^"]+)"/g)].map((m) => m[1]).sort();
  const panels = [...html.matchAll(/data-tab-panel="([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(tabs, panels, "every tab button has a matching panel");
});
