// Mutation effects: the three targeting modes, each effect kind, reveal and buying.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGame } = require("./helpers/load-game.js");

const g = loadGame();
const { CONFIG } = g;
const fn = g.fn;

const rate = (id) => g.num(fn.getGeneratorRate(id));

// Balance numbers are read from CONFIG so these tests survive retuning.
const base = (id) => CONFIG.generators.find((x) => x.id === id).baseRate;
const upgCfg = (id) => CONFIG.upgrades.find((x) => x.id === id);
const mult = (id) => upgCfg(id).effect.mult;

// Mutations are listed in ascending cost order (config-integrity checks it).
const cheapest = CONFIG.upgrades[0];
const latest = CONFIG.upgrades[CONFIG.upgrades.length - 1];
// Enough virions to reveal and buy every Mutation.
const affordAll = CONFIG.upgrades.reduce((sum, u) => sum + u.cost, 0);

// Multipliers pass through Decimal, so compare with a relative tolerance.
function near(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.abs(expected), `${msg ?? ""} ${actual} ~= ${expected}`);
}

// ---------------------------------------------------------------------------
// Targeting is independent of effect kind.
// ---------------------------------------------------------------------------

test("baseline rates come straight from config", () => {
  g.reset();
  for (const gen of CONFIG.generators) assert.equal(rate(gen.id), gen.baseRate, gen.id);
});

test("targetId applies to that one generator and no other", () => {
  g.reset();
  g.state.upgrades.plasmidLibrary.owned = true; // output, targetId ecoli
  near(rate("ecoli"), base("ecoli") * mult("plasmidLibrary"));
  for (const id of ["salmonella", "cholerae", "listeria", "meningitidis"]) {
    assert.equal(rate(id), base(id), `${id} untouched`);
  }
});

test("targetClass applies to every generator of that class", () => {
  g.reset();
  g.state.upgrades.rapidTranscription.owned = true; // output, targetClass 1
  for (const gen of CONFIG.generators) {
    near(rate(gen.id), gen.baseRate * mult("rapidTranscription"), gen.id);
  }
});

// No shipped Mutation is global right now, so these tests add a test-only one
// to a scratch instance to keep untargeted effects covered.
const TEST_GLOBAL_MULT = 1.5;
function withGlobalMutation() {
  const iso = loadGame();
  iso.CONFIG.upgrades.push({
    id: "_global", name: "", description: "", cost: 1,
    effect: { kind: "output", mult: TEST_GLOBAL_MULT },
  });
  return iso;
}

test("an effect with neither target is global", () => {
  const iso = withGlobalMutation();
  iso.reset();
  iso.state.upgrades._global.owned = true; // output, no target
  for (const gen of CONFIG.generators) {
    near(iso.num(iso.fn.getGeneratorRate(gen.id)), gen.baseRate * TEST_GLOBAL_MULT, gen.id);
  }
});

test("a global effect would also reach a generator of a brand-new class", () => {
  // Guards the intent: a global Mutation should keep working when Class II arrives.
  const iso = withGlobalMutation();
  iso.CONFIG.generators.push({
    id: "amoeba", name: "Amoeba", description: "", genClass: 2,
    baseCost: 1e9, baseRate: 1e5,
  });
  iso.reset();
  assert.equal(iso.num(iso.fn.getGeneratorRate("amoeba")), 1e5);
  iso.state.upgrades._global.owned = true;
  const boosted = 1e5 * TEST_GLOBAL_MULT;
  near(iso.num(iso.fn.getGeneratorRate("amoeba")), boosted, "global reaches class 2");
  iso.state.upgrades.rapidTranscription.owned = true; // targetClass 1
  near(iso.num(iso.fn.getGeneratorRate("amoeba")), boosted, "class 1 effect does not");
});

test("multipliers from different Mutations stack multiplicatively", () => {
  g.reset();
  g.state.upgrades.rapidTranscription.owned = true; // class 1
  g.state.upgrades.rapidTranslation.owned = true;   // class 1
  g.state.upgrades.plasmidLibrary.owned = true;     // ecoli only
  g.state.upgrades.lacOperonJam.owned = true;       // ecoli only
  const shared = mult("rapidTranscription") * mult("rapidTranslation");
  near(rate("ecoli"), base("ecoli") * shared * mult("plasmidLibrary") * mult("lacOperonJam"));
  near(rate("salmonella"), base("salmonella") * shared, "no ecoli-only bonus");
});

test("an unowned Mutation has no effect", () => {
  g.reset();
  g.state.upgrades.plasmidLibrary.unlocked = true; // revealed but not bought
  assert.equal(rate("ecoli"), base("ecoli"));
});

// ---------------------------------------------------------------------------
// milestone
// ---------------------------------------------------------------------------

test("milestone grants one step per `per` owned", () => {
  g.reset();
  g.state.upgrades.serialPassage.owned = true; // x mult per `per` owned
  const { per, mult: m } = upgCfg("serialPassage").effect;
  const cases = [[0, 0], [per - 1, 0], [per, 1], [2 * per - 1, 1], [2.5 * per, 2], [10 * per, 10]];
  for (const [owned, steps] of cases) {
    g.state.generators.ecoli.owned = owned;
    near(rate("ecoli"), base("ecoli") * Math.pow(m, steps), `${owned} owned -> ${m}^${steps}`);
  }
});

test("milestone applies per generator, using that generator's own count", () => {
  g.reset();
  g.state.upgrades.serialPassage.owned = true;
  const { per, mult: m } = upgCfg("serialPassage").effect;
  g.state.generators.ecoli.owned = 3 * per;  // 3 steps
  g.state.generators.salmonella.owned = per; // 1 step
  near(rate("ecoli"), base("ecoli") * Math.pow(m, 3));
  near(rate("salmonella"), base("salmonella") * m);
});

test("milestone stays a finite Decimal where a JS float overflows", () => {
  // This is why getMilestoneMultiplier uses Decimal.pow rather than Math.pow.
  assert.equal(Math.pow(1.1, 10000), Infinity, "the float really does overflow");

  g.reset();
  g.state.upgrades.serialPassage.owned = true;
  g.state.generators.ecoli.owned = 100000; // 10000 steps
  const r = fn.getGeneratorRate("ecoli");
  assert.ok(r instanceof g.Decimal);
  assert.ok(Number.isFinite(r.mantissa), "mantissa is finite");
  assert.ok(r.exponent > 300, `exponent ${r.exponent} is large but representable`);
  assert.ok(Number.isFinite(fn.getTotalPerSec().mantissa), "the total survives too");
});

test("milestone does nothing when the Mutation is not owned", () => {
  g.reset();
  g.state.generators.ecoli.owned = 500;
  assert.equal(rate("ecoli"), base("ecoli"));
});

// ---------------------------------------------------------------------------
// Reveal at upgradeUnlockFraction of cost
// ---------------------------------------------------------------------------

// Thresholds like 60000 * 0.1 are not exact in floating point, so these probe
// just below and just above the threshold rather than at it.
const BELOW = 0.999;
const ABOVE = 1.001;

// Pins which Mutations a brand-new game shows. If this changes, it is a balance
// decision (startingVirions, costs or upgradeUnlockFraction moved), so update it on
// purpose.
test("no Mutation is revealed at the starting virion count", () => {
  g.reset(CONFIG.startingVirions);
  fn.checkUnlocks();
  const visible = CONFIG.upgrades.filter((u) => g.state.upgrades[u.id].unlocked);
  assert.deepEqual(g.plain(visible.map((u) => u.id)), []);
});

test("every Mutation is revealed at upgradeUnlockFraction of its cost", () => {
  for (const upg of CONFIG.upgrades) {
    const threshold = upg.cost * CONFIG.upgradeUnlockFraction;
    g.reset(threshold * BELOW);
    fn.checkUnlocks();
    assert.equal(g.state.upgrades[upg.id].unlocked, false,
      `${upg.id} hidden just below ${threshold}`);
    g.reset(threshold * ABOVE);
    fn.checkUnlocks();
    assert.equal(g.state.upgrades[upg.id].unlocked, true,
      `${upg.id} revealed just above ${threshold}`);
  }
});

test("reveal does not grant the Mutation", () => {
  g.reset(latest.cost);
  fn.checkUnlocks();
  for (const upg of CONFIG.upgrades) {
    assert.equal(g.state.upgrades[upg.id].unlocked, true, `${upg.id} revealed`);
    assert.equal(g.state.upgrades[upg.id].owned, false, `${upg.id} not granted`);
  }
});

test("a revealed Mutation stays revealed after spending back down", () => {
  g.reset(upgCfg("rapidTranscription").cost);
  fn.checkUnlocks();
  assert.equal(g.state.upgrades.rapidTranscription.unlocked, true);
  g.state.virions = new g.Decimal(0);
  fn.checkUnlocks();
  assert.equal(g.state.upgrades.rapidTranscription.unlocked, true);
});

test("Mutation reveal ignores cost Mutations (upgrade prices are fixed)", () => {
  // The most expensive Mutation is not revealed at a new game's starting
  // virions, so its reveal is testable.
  const threshold = latest.cost * CONFIG.upgradeUnlockFraction;
  g.reset(threshold * BELOW);
  g.state.upgrades.hostShutdown.owned = true; // discounts hosts, not Mutations
  fn.checkUnlocks();
  assert.equal(g.state.upgrades[latest.id].unlocked, false,
    `still hidden just below ${threshold}: Host Shutdown does not discount Mutations`);
});

// ---------------------------------------------------------------------------
// Buying
// ---------------------------------------------------------------------------

test("buyUpgrade deducts the cost and marks it owned", () => {
  g.reset(upgCfg("rapidTranscription").cost);
  fn.checkUnlocks();
  assert.equal(fn.buyUpgrade("rapidTranscription"), true);
  assert.equal(g.state.upgrades.rapidTranscription.owned, true);
  assert.equal(g.num(g.state.virions), 0);
});

test("buyUpgrade refuses a second purchase", () => {
  g.reset(cheapest.cost * 2);
  fn.checkUnlocks();
  assert.equal(fn.buyUpgrade(cheapest.id), true);
  const left = g.num(g.state.virions);
  assert.equal(fn.buyUpgrade(cheapest.id), false);
  assert.equal(g.num(g.state.virions), left, "no double charge");
});

test("buyUpgrade refuses when unaffordable", () => {
  const short = upgCfg("rapidTranscription").cost - 1;
  g.reset(short);
  fn.checkUnlocks();
  assert.equal(fn.buyUpgrade("rapidTranscription"), false);
  assert.equal(g.num(g.state.virions), short);
});

test("buyUpgrade refuses a Mutation that has not been revealed", () => {
  // owned must imply unlocked, or render() would hide a Mutation already paid for.
  g.reset(1e9);
  assert.equal(g.state.upgrades.serialPassage.unlocked, false, "not revealed yet");
  assert.equal(fn.buyUpgrade("serialPassage"), false);
  assert.equal(g.state.upgrades.serialPassage.owned, false);
  assert.equal(g.num(g.state.virions), 1e9, "not charged");
});

test("owned implies unlocked for every Mutation bought normally", () => {
  g.reset(affordAll);
  fn.checkUnlocks();
  for (const upg of CONFIG.upgrades) {
    assert.equal(fn.buyUpgrade(upg.id), true, `bought ${upg.id}`);
  }
  for (const upg of CONFIG.upgrades) {
    const u = g.state.upgrades[upg.id];
    assert.ok(!u.owned || u.unlocked, `${upg.id}: owned implies unlocked`);
  }
});

test("buying every Mutation leaves production finite and correct", () => {
  g.reset(affordAll);
  fn.checkUnlocks();
  for (const upg of CONFIG.upgrades) fn.buyUpgrade(upg.id);
  const { per } = upgCfg("serialPassage").effect;
  g.state.generators.ecoli.owned = per; // one milestone step
  // Every output and milestone Mutation that reaches E. coli, multiplied together.
  let expected = base("ecoli");
  for (const u of CONFIG.upgrades) {
    const e = u.effect;
    if (e.kind !== "output" && e.kind !== "milestone") continue;
    if (e.targetId && e.targetId !== "ecoli") continue;
    expected *= e.mult;
  }
  near(rate("ecoli"), expected);
  assert.ok(Number.isFinite(fn.getTotalPerSec().mantissa));
});
