// The tick loop: update(dt) must scale with real elapsed time, never a fixed tick.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGame } = require("./helpers/load-game.js");

const g = loadGame();
const fn = g.fn;

// Balance numbers are read from CONFIG so these tests survive retuning.
const baseRate = (id) => g.CONFIG.generators.find((x) => x.id === id).baseRate;

test("update(dt) adds production x dt", () => {
  g.reset(0);
  g.state.generators.ecoli.owned = 10;
  const perSec = 10 * baseRate("ecoli");
  fn.update(2);
  assert.equal(g.num(g.state.virions), 2 * perSec);
  fn.update(0.5);
  assert.equal(g.num(g.state.virions), 2.5 * perSec);
});

test("two half-steps equal one whole step", () => {
  g.reset(0);
  g.state.generators.salmonella.owned = 3;
  fn.update(1);
  const whole = g.num(g.state.virions);

  g.reset(0);
  g.state.generators.salmonella.owned = 3;
  fn.update(0.5);
  fn.update(0.5);
  assert.equal(g.num(g.state.virions), whole, "delta time is linear");
});

test("update ignores non-positive and non-numeric dt", () => {
  g.reset(100);
  g.state.generators.ecoli.owned = 10;
  for (const dt of [0, -1, -0.001, NaN, undefined]) {
    fn.update(dt);
    assert.equal(g.num(g.state.virions), 100, `dt=${dt} changes nothing`);
  }
});

test("update reveals whatever the new total affords", () => {
  g.reset(0);
  g.state.generators.ecoli.owned = 100;
  assert.equal(g.state.generators.cholerae.unlocked, false);
  fn.update(10); // enough virions to pass V. cholerae's reveal threshold
  assert.equal(g.state.generators.cholerae.unlocked, true);
});

test("update reveals Mutations too", () => {
  g.reset(0);
  g.state.generators.ecoli.owned = 30;
  assert.equal(g.state.upgrades.rapidTranscription.unlocked, false);
  fn.update(1); // enough virions to pass Rapid Transcription's reveal threshold
  assert.equal(g.state.upgrades.rapidTranscription.unlocked, true);
});

test("production with nothing owned leaves the total alone", () => {
  g.reset(50);
  fn.update(3600);
  assert.equal(g.num(g.state.virions), 50);
});

test("a very long dt stays finite and exact", () => {
  g.reset(0);
  g.state.generators.meningitidis.owned = 1;
  fn.update(g.CONFIG.offlineCapSeconds);    // 8h
  assert.equal(g.num(g.state.virions), baseRate("meningitidis") * g.CONFIG.offlineCapSeconds);
});

test("milestone bonuses are picked up by the loop as counts grow", () => {
  g.reset(0);
  g.fn.checkUnlocks();
  g.state.upgrades.serialPassage.unlocked = true;
  g.state.upgrades.serialPassage.owned = true;
  g.state.generators.ecoli.owned = 9;
  fn.update(1);
  const slow = g.num(g.state.virions);
  g.state.generators.ecoli.owned = 10; // crosses the first milestone
  g.reset(0);
  g.state.upgrades.serialPassage.owned = true;
  g.state.generators.ecoli.owned = 10;
  fn.update(1);
  assert.ok(g.num(g.state.virions) > slow, "10 hosts with a milestone beat 9 without");
});
