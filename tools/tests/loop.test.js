// The tick loop: update(dt) must scale with real elapsed time, never a fixed tick.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGame } = require("./helpers/load-game.js");

const g = loadGame();
const fn = g.fn;

test("update(dt) adds production x dt", () => {
  g.reset(0);
  g.state.generators.ecoli.owned = 10; // 10/s
  fn.update(2);
  assert.equal(g.num(g.state.virions), 20);
  fn.update(0.5);
  assert.equal(g.num(g.state.virions), 25);
});

test("two half-steps equal one whole step", () => {
  g.reset(0);
  g.state.generators.salmonella.owned = 3; // 30/s
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
  g.state.generators.ecoli.owned = 100; // 100/s
  assert.equal(g.state.generators.cholerae.unlocked, false);
  fn.update(10); // +1000 virions, cholerae appears at 1000
  assert.equal(g.state.generators.cholerae.unlocked, true);
});

test("update reveals Mutations too", () => {
  g.reset(0);
  g.state.generators.ecoli.owned = 30;
  assert.equal(g.state.upgrades.rapidTranscription.unlocked, false);
  fn.update(1); // +30 virions, Rapid Transcription appears at 25
  assert.equal(g.state.upgrades.rapidTranscription.unlocked, true);
});

test("production with nothing owned leaves the total alone", () => {
  g.reset(50);
  fn.update(3600);
  assert.equal(g.num(g.state.virions), 50);
});

test("a very long dt stays finite and exact", () => {
  g.reset(0);
  g.state.generators.meningitidis.owned = 1; // 10000/s
  fn.update(g.CONFIG.offlineCapSeconds);    // 8h
  assert.equal(g.num(g.state.virions), 10000 * g.CONFIG.offlineCapSeconds);
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
