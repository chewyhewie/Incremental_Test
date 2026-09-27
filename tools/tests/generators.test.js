// Generator cost scaling, production, unlock thresholds and buying.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGame } = require("./helpers/load-game.js");

const g = loadGame();
const { CONFIG } = g;
const fn = g.fn;

// Expected cost with no upgrades: ceil(baseCost * growth^owned).
const expectedCost = (base, owned, growth = CONFIG.costGrowth) =>
  Math.ceil(base * Math.pow(growth, owned));

test("cost at 0 owned is exactly baseCost", () => {
  g.reset();
  for (const gen of CONFIG.generators) {
    assert.equal(g.num(fn.getGeneratorCost(gen.id)), gen.baseCost, gen.id);
  }
});

test("cost grows by CONFIG.costGrowth per purchase", () => {
  g.reset();
  for (const owned of [1, 5, 20, 57]) {
    g.state.generators.ecoli.owned = owned;
    assert.equal(g.num(fn.getGeneratorCost("ecoli")), expectedCost(10, owned),
      `ecoli at ${owned} owned`);
  }
});

test("costs are rounded up and always whole numbers", () => {
  g.reset();
  g.state.generators.salmonella.owned = 3;
  // 150 * 1.15^3 = 228.26..., so ceil matters here.
  assert.equal(g.num(fn.getGeneratorCost("salmonella")), 229);
  for (const gen of CONFIG.generators) {
    for (const owned of [0, 1, 7, 13]) {
      g.state.generators[gen.id].owned = owned;
      const c = g.num(fn.getGeneratorCost(gen.id));
      assert.ok(Number.isInteger(c), `${gen.id} at ${owned} owned -> ${c} is whole`);
    }
  }
});

test("cost and rate are Decimals, never plain numbers", () => {
  g.reset();
  assert.ok(fn.getGeneratorCost("ecoli") instanceof g.Decimal);
  assert.ok(fn.getGeneratorRate("ecoli") instanceof g.Decimal);
  assert.ok(fn.getGeneratorOutput("ecoli") instanceof g.Decimal);
  assert.ok(fn.getTotalPerSec() instanceof g.Decimal);
});

test("costs stay exact far past what a JS float could hold", () => {
  g.reset();
  g.state.generators.meningitidis.owned = 5000;
  const cost = fn.getGeneratorCost("meningitidis");
  assert.ok(Number.isFinite(cost.mantissa), "mantissa is finite");
  // 300000 * 1.15^5000 is astronomically large; just pin the magnitude.
  const expectedExp = Math.log10(300000) + 5000 * Math.log10(1.15);
  assert.ok(Math.abs(cost.exponent - Math.floor(expectedExp)) <= 1,
    `exponent ${cost.exponent} ~= ${Math.floor(expectedExp)}`);
});

test('a "cost" Mutation multiplies the price (Host Shutdown halves Class I)', () => {
  g.reset();
  g.state.generators.ecoli.owned = 4;
  const full = g.num(fn.getGeneratorCost("ecoli"));
  g.state.upgrades.hostShutdown.owned = true;
  const half = g.num(fn.getGeneratorCost("ecoli"));
  // ceil() is applied after the multiplier, so compare against the same formula.
  assert.equal(half, Math.ceil(10 * Math.pow(1.15, 4) * 0.5));
  assert.ok(half < full);
});

test('a "costGrowth" Mutation changes the exponent base, not the multiplier', () => {
  g.reset();
  g.state.generators.ecoli.owned = 20;
  const plain = g.num(fn.getGeneratorCost("ecoli"));
  g.state.upgrades.streamlinedGenome.owned = true;
  const reduced = g.num(fn.getGeneratorCost("ecoli"));
  assert.equal(plain, expectedCost(10, 20, 1.15));
  assert.equal(reduced, expectedCost(10, 20, 1.13));
  assert.ok(reduced < plain);
});

test("costGrowth compounds: the discount widens as you buy more", () => {
  g.reset();
  const discountAt = (owned) => {
    g.state.upgrades.streamlinedGenome.owned = false;
    g.state.generators.ecoli.owned = owned;
    const plain = g.num(fn.getGeneratorCost("ecoli"));
    g.state.upgrades.streamlinedGenome.owned = true;
    const cheap = g.num(fn.getGeneratorCost("ecoli"));
    return 1 - cheap / plain;
  };
  const d20 = discountAt(20);
  const d100 = discountAt(100);
  assert.ok(d100 > d20, `discount at 100 owned (${d100}) exceeds at 20 (${d20})`);
});

test("getCostGrowth reports the plain factor, and the Mutation's factor", () => {
  g.reset();
  const ecoli = fn.getGeneratorConfig("ecoli");
  assert.equal(fn.getCostGrowth(ecoli), CONFIG.costGrowth);
  g.state.upgrades.streamlinedGenome.owned = true;
  assert.equal(fn.getCostGrowth(ecoli), 1.13);
});

test("getCostGrowth clamps at CONFIG.minCostGrowth", () => {
  const iso = loadGame(); // a scratch instance: this test mutates CONFIG
  iso.reset();
  iso.CONFIG.upgrades.push({
    id: "_hugeReduction", name: "", description: "", cost: 1,
    effect: { kind: "costGrowth", targetClass: 1, delta: -5 },
  });
  iso.state.upgrades._hugeReduction = { owned: true, unlocked: true };
  assert.equal(
    iso.fn.getCostGrowth(iso.fn.getGeneratorConfig("ecoli")),
    iso.CONFIG.minCostGrowth,
  );
});

test("output is rate x owned, and the total is the sum over all generators", () => {
  g.reset();
  g.state.generators.ecoli.owned = 7;
  g.state.generators.salmonella.owned = 3;
  assert.equal(g.num(fn.getGeneratorOutput("ecoli")), 7);       // 1/s each
  assert.equal(g.num(fn.getGeneratorOutput("salmonella")), 30); // 10/s each
  assert.equal(g.num(fn.getTotalPerSec()), 37);
});

test("an owned-zero generator contributes nothing", () => {
  g.reset();
  assert.equal(g.num(fn.getTotalPerSec()), 0);
  assert.equal(g.num(fn.getGeneratorOutput("cholerae")), 0);
});

// ---------------------------------------------------------------------------
// Unlocks: the threshold must follow the CURRENT cost, not the base cost.
// ---------------------------------------------------------------------------

test("a generator is revealed at exactly 50% of its current cost", () => {
  for (const gen of CONFIG.generators) {
    const threshold = gen.baseCost * CONFIG.unlockFraction;
    g.reset(threshold - 1);
    fn.checkUnlocks();
    assert.equal(g.state.generators[gen.id].unlocked, false,
      `${gen.id} hidden at ${threshold - 1}`);
    g.reset(threshold);
    fn.checkUnlocks();
    assert.equal(g.state.generators[gen.id].unlocked, true,
      `${gen.id} revealed at ${threshold}`);
  }
});

test("a cost Mutation lowers the reveal threshold too (regression)", () => {
  // V. cholerae costs 2000, so it normally appears at 1000. With Host Shutdown
  // halving Class I costs it must appear at 500 instead.
  g.reset(500);
  fn.checkUnlocks();
  assert.equal(g.state.generators.cholerae.unlocked, false, "not yet at 500 without the Mutation");

  g.reset(500);
  g.state.upgrades.hostShutdown.owned = true;
  fn.checkUnlocks();
  assert.equal(g.state.generators.cholerae.unlocked, true, "revealed at 500 with the Mutation");
});

test("the reveal threshold tracks the discounted cost for every host", () => {
  for (const gen of CONFIG.generators) {
    const discounted = Math.ceil(gen.baseCost * 0.5) * CONFIG.unlockFraction;
    g.reset(Math.ceil(discounted));
    g.state.upgrades.hostShutdown.owned = true;
    fn.checkUnlocks();
    assert.equal(g.state.generators[gen.id].unlocked, true,
      `${gen.id} revealed at ${Math.ceil(discounted)} with Host Shutdown`);
  }
});

test("once revealed a generator stays revealed after spending back down", () => {
  g.reset(1000);
  fn.checkUnlocks();
  assert.equal(g.state.generators.cholerae.unlocked, true);
  g.state.virions = new g.Decimal(0);
  fn.checkUnlocks();
  assert.equal(g.state.generators.cholerae.unlocked, true, "still visible at 0 virions");
});

test("reveal does not depend on how many you own", () => {
  g.reset(0);
  g.state.generators.listeria.owned = 0;
  fn.checkUnlocks();
  assert.equal(g.state.generators.listeria.unlocked, false);
});

// ---------------------------------------------------------------------------
// Buying
// ---------------------------------------------------------------------------

test("buyGenerator deducts the cost and increments owned", () => {
  g.reset(10);
  assert.equal(fn.buyGenerator("ecoli"), true);
  assert.equal(g.state.generators.ecoli.owned, 1);
  assert.equal(g.num(g.state.virions), 0);
});

test("buyGenerator refuses when the player cannot afford it", () => {
  g.reset(9);
  assert.equal(fn.buyGenerator("ecoli"), false);
  assert.equal(g.state.generators.ecoli.owned, 0);
  assert.equal(g.num(g.state.virions), 9, "virions untouched");
});

test("each purchase makes the next one dearer", () => {
  g.reset(100);
  const first = g.num(fn.getGeneratorCost("ecoli"));
  fn.buyGenerator("ecoli");
  const second = g.num(fn.getGeneratorCost("ecoli"));
  assert.ok(second > first, `${second} > ${first}`);
  assert.equal(second, Math.ceil(10 * 1.15));
});

test("buying is affordable exactly at the cost, not a virion below", () => {
  g.reset();
  g.state.generators.ecoli.owned = 10;
  const cost = fn.getGeneratorCost("ecoli");
  g.state.virions = cost.minus(1);
  assert.equal(fn.buyGenerator("ecoli"), false);
  g.state.virions = cost;
  assert.equal(fn.buyGenerator("ecoli"), true);
  assert.equal(g.num(g.state.virions), 0);
});
