// Mutation effects: the three targeting modes, each effect kind, reveal and buying.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGame } = require("./helpers/load-game.js");

const g = loadGame();
const { CONFIG } = g;
const fn = g.fn;

const rate = (id) => g.num(fn.getGeneratorRate(id));

// ---------------------------------------------------------------------------
// Targeting is independent of effect kind.
// ---------------------------------------------------------------------------

test("baseline rates come straight from config", () => {
  g.reset();
  for (const gen of CONFIG.generators) assert.equal(rate(gen.id), gen.baseRate, gen.id);
});

test("targetId applies to that one generator and no other", () => {
  g.reset();
  g.state.upgrades.plasmidLibrary.owned = true; // output x3, targetId ecoli
  assert.equal(rate("ecoli"), 3);
  assert.equal(rate("salmonella"), 10, "untouched");
  assert.equal(rate("cholerae"), 100, "untouched");
  assert.equal(rate("meningitidis"), 10000, "untouched");
});

test("targetClass applies to every generator of that class", () => {
  g.reset();
  g.state.upgrades.rapidTranscription.owned = true; // output x2, targetClass 1
  for (const gen of CONFIG.generators) {
    assert.equal(rate(gen.id), gen.baseRate * 2, gen.id);
  }
});

test("an effect with neither target is global", () => {
  g.reset();
  g.state.upgrades.nutrientBroth.owned = true; // output x1.5, no target
  for (const gen of CONFIG.generators) {
    assert.equal(rate(gen.id), gen.baseRate * 1.5, gen.id);
  }
});

test("a global effect would also reach a generator of a brand-new class", () => {
  // Guards the intent: Nutrient Broth should keep working when Class II arrives.
  const iso = loadGame();
  iso.CONFIG.generators.push({
    id: "amoeba", name: "Amoeba", description: "", genClass: 2,
    baseCost: 1e9, baseRate: 1e5,
  });
  iso.reset();
  assert.equal(iso.num(iso.fn.getGeneratorRate("amoeba")), 1e5);
  iso.state.upgrades.nutrientBroth.owned = true;
  assert.equal(iso.num(iso.fn.getGeneratorRate("amoeba")), 1.5e5, "global reaches class 2");
  iso.state.upgrades.rapidTranscription.owned = true; // targetClass 1
  assert.equal(iso.num(iso.fn.getGeneratorRate("amoeba")), 1.5e5, "class 1 effect does not");
});

test("multipliers from different Mutations stack multiplicatively", () => {
  g.reset();
  g.state.upgrades.rapidTranscription.owned = true; // class 1, x2
  g.state.upgrades.rapidTranslation.owned = true;   // class 1, x1.5
  g.state.upgrades.plasmidLibrary.owned = true;     // ecoli,  x3
  g.state.upgrades.nutrientBroth.owned = true;      // global, x1.5
  assert.equal(rate("ecoli"), 1 * 2 * 1.5 * 3 * 1.5);
  assert.equal(rate("salmonella"), 10 * 2 * 1.5 * 1.5, "no ecoli-only bonus");
});

test("an unowned Mutation has no effect", () => {
  g.reset();
  g.state.upgrades.plasmidLibrary.unlocked = true; // revealed but not bought
  assert.equal(rate("ecoli"), 1);
});

// ---------------------------------------------------------------------------
// milestone
// ---------------------------------------------------------------------------

test("milestone grants one step per `per` owned", () => {
  g.reset();
  g.state.upgrades.serialPassage.owned = true; // x1.1 per 10 owned
  const cases = [[0, 0], [9, 0], [10, 1], [19, 1], [25, 2], [100, 10]];
  for (const [owned, steps] of cases) {
    g.state.generators.ecoli.owned = owned;
    assert.ok(Math.abs(rate("ecoli") - Math.pow(1.1, steps)) < 1e-9,
      `${owned} owned -> 1.1^${steps}`);
  }
});

test("milestone applies per generator, using that generator's own count", () => {
  g.reset();
  g.state.upgrades.serialPassage.owned = true;
  g.state.generators.ecoli.owned = 30;      // 3 steps
  g.state.generators.salmonella.owned = 10; // 1 step
  assert.ok(Math.abs(rate("ecoli") - Math.pow(1.1, 3)) < 1e-9);
  assert.ok(Math.abs(rate("salmonella") - 10 * Math.pow(1.1, 1)) < 1e-9);
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
  assert.equal(rate("ecoli"), 1);
});

// ---------------------------------------------------------------------------
// Reveal at 25% of cost
// ---------------------------------------------------------------------------

test("no Mutation is revealed at the starting virion count", () => {
  g.reset(CONFIG.startingVirions);
  fn.checkUnlocks();
  const visible = CONFIG.upgrades.filter((u) => g.state.upgrades[u.id].unlocked);
  assert.deepEqual(g.plain(visible.map((u) => u.id)), []);
});

test("every Mutation is revealed at exactly 25% of its cost", () => {
  for (const upg of CONFIG.upgrades) {
    const threshold = Math.ceil(upg.cost * CONFIG.upgradeUnlockFraction);
    g.reset(threshold - 1);
    fn.checkUnlocks();
    assert.equal(g.state.upgrades[upg.id].unlocked, false,
      `${upg.id} hidden at ${threshold - 1}`);
    g.reset(threshold);
    fn.checkUnlocks();
    assert.equal(g.state.upgrades[upg.id].unlocked, true,
      `${upg.id} revealed at ${threshold}`);
  }
});

test("reveal does not grant the Mutation", () => {
  g.reset(1e9);
  fn.checkUnlocks();
  for (const upg of CONFIG.upgrades) {
    assert.equal(g.state.upgrades[upg.id].unlocked, true, `${upg.id} revealed`);
    assert.equal(g.state.upgrades[upg.id].owned, false, `${upg.id} not granted`);
  }
});

test("a revealed Mutation stays revealed after spending back down", () => {
  g.reset(25);
  fn.checkUnlocks();
  assert.equal(g.state.upgrades.rapidTranscription.unlocked, true);
  g.state.virions = new g.Decimal(0);
  fn.checkUnlocks();
  assert.equal(g.state.upgrades.rapidTranscription.unlocked, true);
});

test("Mutation reveal ignores cost Mutations (upgrade prices are fixed)", () => {
  g.reset(24);
  g.state.upgrades.hostShutdown.owned = true; // discounts hosts, not Mutations
  fn.checkUnlocks();
  assert.equal(g.state.upgrades.rapidTranscription.unlocked, false,
    "still hidden at 24: Host Shutdown does not discount Mutations");
});

// ---------------------------------------------------------------------------
// Buying
// ---------------------------------------------------------------------------

test("buyUpgrade deducts the cost and marks it owned", () => {
  g.reset(100);
  fn.checkUnlocks();
  assert.equal(fn.buyUpgrade("rapidTranscription"), true);
  assert.equal(g.state.upgrades.rapidTranscription.owned, true);
  assert.equal(g.num(g.state.virions), 0);
});

test("buyUpgrade refuses a second purchase", () => {
  g.reset(1000);
  fn.checkUnlocks();
  assert.equal(fn.buyUpgrade("rapidTranscription"), true);
  const left = g.num(g.state.virions);
  assert.equal(fn.buyUpgrade("rapidTranscription"), false);
  assert.equal(g.num(g.state.virions), left, "no double charge");
});

test("buyUpgrade refuses when unaffordable", () => {
  g.reset(99);
  fn.checkUnlocks();
  assert.equal(fn.buyUpgrade("rapidTranscription"), false);
  assert.equal(g.num(g.state.virions), 99);
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
  g.reset(1e9);
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
  g.reset(1e9);
  fn.checkUnlocks();
  for (const upg of CONFIG.upgrades) fn.buyUpgrade(upg.id);
  g.state.generators.ecoli.owned = 10;
  // class x2, class x1.5, ecoli x3, global x1.5, milestone 1.1^1
  const expected = 1 * 2 * 1.5 * 3 * 1.5 * 1.1;
  assert.ok(Math.abs(rate("ecoli") - expected) < 1e-9, `${rate("ecoli")} ~= ${expected}`);
  assert.ok(Number.isFinite(fn.getTotalPerSec().mantissa));
});
