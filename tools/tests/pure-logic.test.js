// The balance simulator (tools/sim/) runs config.js, state.js and loop.js with NO
// browser globals. These tests fail if game logic in those files starts depending
// on the DOM, localStorage or timers, which would make the simulator impossible.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadLogic } = require("../sim/load-logic.js");
const { runProfile, STRATEGY_ORDER } = require("../sim/sim.js");
const { STRATEGIES } = require("../sim/strategies.js");

test("pure-logic files load without any browser globals", () => {
  const g = loadLogic();
  g.reset();
  assert.equal(typeof g.fn.getTotalPerSec, "function");
  assert.equal(typeof g.fn.update, "function");
  assert.ok(g.fn.buyGenerator("ecoli"));
  g.fn.update(10);
  assert.ok(g.state.virions.gt(0));
});

const SHORT_RUN = { seconds: 600, step: 1, wallSeconds: 300 };

for (const strategy of Object.keys(STRATEGIES)) {
  test(`${strategy}: a short simulated run buys hosts and reaches milestones`, () => {
    const r = runProfile({ name: "Test", strategy, checkEvery: 1 }, SHORT_RUN);
    assert.ok(r.firsts.some((f) => f.id === "ecoli"), "bought E. coli");
    assert.ok(r.milestones.length > 0, "reached at least one power of 10");
    for (let i = 1; i < r.milestones.length; i++) {
      assert.ok(r.milestones[i].time >= r.milestones[i - 1].time, "milestones in time order");
    }
  });
}

test("every strategy in STRATEGY_ORDER exists", () => {
  for (const name of STRATEGY_ORDER) assert.equal(typeof STRATEGIES[name], "function", name);
});

test("cheapestFirst buys the cheapest visible item first", () => {
  const r = runProfile({ name: "Test", strategy: "cheapestFirst", checkEvery: 1 }, SHORT_RUN);
  assert.equal(r.firsts[0].id, "ecoli");
  assert.equal(r.firsts[0].cost.toNumber(), 10);
});
