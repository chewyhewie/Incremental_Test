// The tick loop: update(dt) must scale with real elapsed time, never a fixed tick.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGame } = require("./helpers/load-game.js");

const g = loadGame();
const fn = g.fn;

// Balance numbers are read from CONFIG so these tests survive retuning.
const baseRate = (id) => g.CONFIG.generators.find((x) => x.id === id).baseRate;

// Rates like 0.39 or 1.1 are not exact in binary, so compare with a relative tolerance.
function near(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.abs(expected), `${msg ?? ""} ${actual} ~= ${expected}`);
}

test("update(dt) adds production x dt", () => {
  g.reset(0);
  g.state.generators.ecoli.owned = 10;
  const perSec = 10 * baseRate("ecoli");
  fn.update(2);
  near(g.num(g.state.virions), 2 * perSec);
  fn.update(0.5);
  near(g.num(g.state.virions), 2.5 * perSec);
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
  near(g.num(g.state.virions), whole, "delta time is linear:");
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
  const cheapest = g.CONFIG.upgrades[0]; // listed in ascending cost order
  const threshold = cheapest.cost * g.CONFIG.upgradeUnlockFraction;
  g.reset(0);
  g.state.generators.ecoli.owned = Math.ceil(threshold / baseRate("ecoli")) + 1;
  assert.equal(g.state.upgrades[cheapest.id].unlocked, false);
  fn.update(1); // enough virions to pass the cheapest Mutation's reveal threshold
  assert.equal(g.state.upgrades[cheapest.id].unlocked, true);
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

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

test("update(dt) adds to time played and virions produced", () => {
  g.reset(0);
  g.state.generators.ecoli.owned = 4;
  const perSec = 4 * baseRate("ecoli");
  fn.update(3);
  fn.update(0.5);
  near(g.state.stats.timePlayed, 3.5);
  near(g.num(g.state.stats.totalProduced), 3.5 * perSec);
});

test("time played counts even with nothing to produce", () => {
  g.reset(0);
  fn.update(2);
  near(g.state.stats.timePlayed, 2);
  assert.equal(g.num(g.state.stats.totalProduced), 0);
});

test("best production rises with production and never falls", () => {
  g.reset(0);
  g.state.generators.ecoli.owned = 10;
  fn.update(1);
  const best = g.num(g.state.stats.bestPerSec);
  near(best, 10 * baseRate("ecoli"));
  g.state.generators.ecoli.owned = 2;
  fn.update(1);
  assert.equal(g.num(g.state.stats.bestPerSec), best, "kept the higher figure");
});

test("virions spent is produced + starting - held", () => {
  g.reset();
  g.state.generators.ecoli.owned = 1;
  fn.update(100);
  const before = g.state.virions;
  fn.buyGenerators("ecoli", 3);
  const spent = before.minus(g.state.virions);
  near(g.num(fn.getVirionsSpent()), g.num(spent), "only the purchase was spent");
});

test("virions spent never shows a negative figure", () => {
  g.reset();
  g.state.virions = new g.Decimal(1e9); // more than was ever produced, as a migrated save can be
  assert.equal(g.num(fn.getVirionsSpent()), 0);
});
