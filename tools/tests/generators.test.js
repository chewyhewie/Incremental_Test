// Generator cost scaling, production, unlock thresholds and buying.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGame } = require("./helpers/load-game.js");

const g = loadGame();
const { CONFIG } = g;
const fn = g.fn;

// Balance numbers are read from CONFIG so these tests survive retuning.
const gen = (id) => CONFIG.generators.find((x) => x.id === id);
const upg = (id) => CONFIG.upgrades.find((x) => x.id === id);

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
    assert.equal(g.num(fn.getGeneratorCost("ecoli")), expectedCost(gen("ecoli").baseCost, owned),
      `ecoli at ${owned} owned`);
  }
});

test("costs are rounded up and always whole numbers", () => {
  g.reset();
  g.state.generators.salmonella.owned = 3;
  const raw = gen("salmonella").baseCost * Math.pow(CONFIG.costGrowth, 3);
  assert.ok(!Number.isInteger(raw), "pick an owned count where ceil matters");
  assert.equal(g.num(fn.getGeneratorCost("salmonella")), Math.ceil(raw));
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
  // baseCost * growth^5000 is astronomically large; just pin the magnitude.
  const expectedExp = Math.log10(gen("meningitidis").baseCost) + 5000 * Math.log10(CONFIG.costGrowth);
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
  assert.equal(half, Math.ceil(gen("ecoli").baseCost * Math.pow(CONFIG.costGrowth, 4) * upg("hostShutdown").effect.mult));
  assert.ok(half < full);
});

// No shipped Mutation uses "costGrowth" right now, so these tests add a test-only
// one to a scratch instance to keep the effect kind covered.
const TEST_DELTA = -0.01;
function withCostGrowthMutation() {
  const iso = loadGame();
  iso.CONFIG.upgrades.push({
    id: "_streamlined", name: "", description: "", cost: 1,
    effect: { kind: "costGrowth", targetClass: 1, delta: TEST_DELTA },
  });
  iso.reset();
  return iso;
}

test('a "costGrowth" Mutation changes the exponent base, not the multiplier', () => {
  const iso = withCostGrowthMutation();
  iso.state.generators.ecoli.owned = 20;
  const plain = iso.num(iso.fn.getGeneratorCost("ecoli"));
  iso.state.upgrades._streamlined.owned = true;
  const reduced = iso.num(iso.fn.getGeneratorCost("ecoli"));
  const base = gen("ecoli").baseCost;
  assert.equal(plain, expectedCost(base, 20, CONFIG.costGrowth));
  assert.equal(reduced, expectedCost(base, 20, CONFIG.costGrowth + TEST_DELTA));
  assert.ok(reduced < plain);
});

test("costGrowth compounds: the discount widens as you buy more", () => {
  const iso = withCostGrowthMutation();
  const discountAt = (owned) => {
    iso.state.upgrades._streamlined.owned = false;
    iso.state.generators.ecoli.owned = owned;
    const plain = iso.num(iso.fn.getGeneratorCost("ecoli"));
    iso.state.upgrades._streamlined.owned = true;
    const cheap = iso.num(iso.fn.getGeneratorCost("ecoli"));
    return 1 - cheap / plain;
  };
  const d20 = discountAt(20);
  const d100 = discountAt(100);
  assert.ok(d100 > d20, `discount at 100 owned (${d100}) exceeds at 20 (${d20})`);
});

test("getCostGrowth reports the plain factor, and the Mutation's factor", () => {
  const iso = withCostGrowthMutation();
  const ecoli = iso.fn.getGeneratorConfig("ecoli");
  assert.equal(iso.fn.getCostGrowth(ecoli), CONFIG.costGrowth);
  iso.state.upgrades._streamlined.owned = true;
  assert.equal(iso.fn.getCostGrowth(ecoli), CONFIG.costGrowth + TEST_DELTA);
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
  const ecoli = 7 * gen("ecoli").baseRate;
  const salmonella = 3 * gen("salmonella").baseRate;
  assert.equal(g.num(fn.getGeneratorOutput("ecoli")), ecoli);
  assert.equal(g.num(fn.getGeneratorOutput("salmonella")), salmonella);
  assert.equal(g.num(fn.getTotalPerSec()), ecoli + salmonella);
});

test("an owned-zero generator contributes nothing", () => {
  g.reset();
  assert.equal(g.num(fn.getTotalPerSec()), 0);
  assert.equal(g.num(fn.getGeneratorOutput("cholerae")), 0);
});

// ---------------------------------------------------------------------------
// Unlocks: the threshold must follow the CURRENT cost, not the base cost.
// ---------------------------------------------------------------------------

// Thresholds like 150 * 0.1 are not exact in floating point, so these probe just
// below and just above the threshold rather than at it.
const BELOW = 0.999;
const ABOVE = 1.001;

test("a generator is revealed at unlockFraction of its current cost", () => {
  for (const gen of CONFIG.generators) {
    const threshold = gen.baseCost * CONFIG.unlockFraction;
    g.reset(threshold * BELOW);
    fn.checkUnlocks();
    assert.equal(g.state.generators[gen.id].unlocked, false,
      `${gen.id} hidden just below ${threshold}`);
    g.reset(threshold * ABOVE);
    fn.checkUnlocks();
    assert.equal(g.state.generators[gen.id].unlocked, true,
      `${gen.id} revealed just above ${threshold}`);
  }
});

test("a cost Mutation lowers the reveal threshold too (regression)", () => {
  // Host Shutdown halves Class I costs, so V. cholerae must appear at half its
  // usual threshold. Probe halfway between the two.
  const hostShutdown = CONFIG.upgrades.find((u) => u.id === "hostShutdown").effect.mult;
  const cholerae = CONFIG.generators.find((x) => x.id === "cholerae").baseCost;
  const between = cholerae * CONFIG.unlockFraction * (1 + hostShutdown) / 2;

  g.reset(between);
  fn.checkUnlocks();
  assert.equal(g.state.generators.cholerae.unlocked, false, `not yet at ${between} without the Mutation`);

  g.reset(between);
  g.state.upgrades.hostShutdown.owned = true;
  fn.checkUnlocks();
  assert.equal(g.state.generators.cholerae.unlocked, true, `revealed at ${between} with the Mutation`);
});

test("the reveal threshold tracks the discounted cost for every host", () => {
  for (const gen of CONFIG.generators) {
    const discounted = Math.ceil(gen.baseCost * 0.5) * CONFIG.unlockFraction * ABOVE;
    g.reset(discounted);
    g.state.upgrades.hostShutdown.owned = true;
    fn.checkUnlocks();
    assert.equal(g.state.generators[gen.id].unlocked, true,
      `${gen.id} revealed at ${discounted} with Host Shutdown`);
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
  g.reset(gen("ecoli").baseCost);
  assert.equal(fn.buyGenerator("ecoli"), true);
  assert.equal(g.state.generators.ecoli.owned, 1);
  assert.equal(g.num(g.state.virions), 0);
});

test("buyGenerator refuses when the player cannot afford it", () => {
  const short = gen("ecoli").baseCost - 1;
  g.reset(short);
  assert.equal(fn.buyGenerator("ecoli"), false);
  assert.equal(g.state.generators.ecoli.owned, 0);
  assert.equal(g.num(g.state.virions), short, "virions untouched");
});

test("each purchase makes the next one dearer", () => {
  g.reset(100);
  const first = g.num(fn.getGeneratorCost("ecoli"));
  fn.buyGenerator("ecoli");
  const second = g.num(fn.getGeneratorCost("ecoli"));
  assert.ok(second > first, `${second} > ${first}`);
  assert.equal(second, Math.ceil(gen("ecoli").baseCost * CONFIG.costGrowth));
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
