// Structural checks on CONFIG. These are the cheapest possible guard against
// content-authoring slips when new hosts and Mutations get added.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGame } = require("./helpers/load-game.js");

const g = loadGame();
const CONFIG = g.CONFIG;
const genIds = CONFIG.generators.map((x) => x.id);
const EFFECT_KINDS = ["output", "cost", "costGrowth", "milestone"];

test("generator ids are unique and non-empty", () => {
  assert.equal(new Set(genIds).size, genIds.length);
  for (const id of genIds) assert.match(id, /^[a-z][A-Za-z0-9]*$/);
});

test("upgrade ids are unique and non-empty", () => {
  const ids = CONFIG.upgrades.map((u) => u.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z][A-Za-z0-9]*$/);
});

test("every generator has the fields the UI and state helpers read", () => {
  for (const gen of CONFIG.generators) {
    assert.equal(typeof gen.name, "string", `${gen.id} name`);
    assert.ok(gen.name.length > 0, `${gen.id} name is not empty`);
    assert.ok(gen.description.length > 0, `${gen.id} description is not empty`);
    assert.equal(typeof gen.genClass, "number", `${gen.id} genClass`);
    // config.js holds plain numbers only; state.js wraps them in Decimal.
    assert.equal(typeof gen.baseCost, "number", `${gen.id} baseCost is a plain number`);
    assert.equal(typeof gen.baseRate, "number", `${gen.id} baseRate is a plain number`);
    assert.ok(gen.baseCost > 0 && gen.baseRate > 0, `${gen.id} is positive`);
  }
});

test("generator cost and rate both rise strictly with each tier", () => {
  for (let i = 1; i < CONFIG.generators.length; i++) {
    const prev = CONFIG.generators[i - 1];
    const cur = CONFIG.generators[i];
    assert.ok(cur.baseCost > prev.baseCost, `${cur.id} costs more than ${prev.id}`);
    assert.ok(cur.baseRate > prev.baseRate, `${cur.id} produces more than ${prev.id}`);
  }
});

test("payback time (cost / rate) grows with each tier, so later hosts are a commitment", () => {
  const paybacks = CONFIG.generators.map((x) => x.baseCost / x.baseRate);
  for (let i = 1; i < paybacks.length; i++) {
    assert.ok(paybacks[i] > paybacks[i - 1],
      `${CONFIG.generators[i].id} payback ${paybacks[i]}s > ${paybacks[i - 1]}s`);
  }
});

test("upgrades are listed in ascending cost order", () => {
  for (let i = 1; i < CONFIG.upgrades.length; i++) {
    assert.ok(CONFIG.upgrades[i].cost > CONFIG.upgrades[i - 1].cost,
      `${CONFIG.upgrades[i].id} (${CONFIG.upgrades[i].cost}) follows ` +
      `${CONFIG.upgrades[i - 1].id} (${CONFIG.upgrades[i - 1].cost})`);
  }
});

test("every upgrade has a known effect.kind and a plain-number cost", () => {
  for (const upg of CONFIG.upgrades) {
    assert.equal(typeof upg.cost, "number", `${upg.id} cost is a plain number`);
    assert.ok(upg.cost > 0, `${upg.id} cost is positive`);
    assert.ok(upg.description.length > 0, `${upg.id} has a description`);
    assert.ok(EFFECT_KINDS.includes(upg.effect.kind),
      `${upg.id} kind ${upg.effect.kind} is one of ${EFFECT_KINDS.join("/")}`);
  }
});

test("each effect.kind carries the fields its helper in state.js reads", () => {
  for (const { id, effect } of CONFIG.upgrades) {
    switch (effect.kind) {
      case "output":
      case "cost":
        assert.equal(typeof effect.mult, "number", `${id} needs mult`);
        assert.ok(effect.mult > 0, `${id} mult is positive`);
        break;
      case "costGrowth":
        assert.equal(typeof effect.delta, "number", `${id} needs delta`);
        assert.ok(effect.delta < 0, `${id} delta helps the player`);
        break;
      case "milestone":
        assert.equal(typeof effect.mult, "number", `${id} needs mult`);
        assert.equal(typeof effect.per, "number", `${id} needs per`);
        assert.ok(Number.isInteger(effect.per) && effect.per > 0, `${id} per is a positive int`);
        break;
      default:
        assert.fail(`unhandled kind ${effect.kind}`);
    }
  }
});

test("targeting is unambiguous: never both targetId and targetClass", () => {
  for (const { id, effect } of CONFIG.upgrades) {
    const both = effect.targetId !== undefined && effect.targetClass !== undefined;
    assert.ok(!both, `${id} sets both targetId and targetClass`);
  }
});

test("every effect.targetId names a real generator", () => {
  for (const { id, effect } of CONFIG.upgrades) {
    if (effect.targetId !== undefined) {
      assert.ok(genIds.includes(effect.targetId),
        `${id} targets "${effect.targetId}", which is not a generator`);
    }
  }
});

test("every effect.targetClass names a class some generator belongs to", () => {
  const classes = new Set(CONFIG.generators.map((x) => x.genClass));
  for (const { id, effect } of CONFIG.upgrades) {
    if (effect.targetClass !== undefined) {
      assert.ok(classes.has(effect.targetClass),
        `${id} targets class ${effect.targetClass}, which has no generators`);
    }
  }
});

test("each generator has exactly one per-host output Mutation", () => {
  const counts = new Map(genIds.map((id) => [id, 0]));
  for (const { effect } of CONFIG.upgrades) {
    if (effect.kind === "output" && effect.targetId !== undefined) {
      counts.set(effect.targetId, counts.get(effect.targetId) + 1);
    }
  }
  for (const [id, n] of counts) {
    assert.equal(n, 1, `${id} has ${n} per-host output Mutations, want exactly 1`);
  }
});

test("tunables are sane", () => {
  assert.ok(CONFIG.costGrowth > 1, "costs grow");
  assert.ok(CONFIG.minCostGrowth > 1, "the growth floor still grows");
  assert.ok(CONFIG.minCostGrowth <= CONFIG.costGrowth, "floor is not above the default");
  assert.ok(CONFIG.unlockFraction > 0 && CONFIG.unlockFraction <= 1);
  assert.ok(CONFIG.upgradeUnlockFraction > 0 && CONFIG.upgradeUnlockFraction <= 1);
  assert.ok(Number.isInteger(CONFIG.saveVersion) && CONFIG.saveVersion >= 1);
  assert.ok(CONFIG.tickMs > 0 && CONFIG.offlineCapSeconds > 0);
  assert.ok(CONFIG.startingVirions >= 0);
});

test("stacked costGrowth Mutations cannot reach the floor by themselves", () => {
  // If the authored deltas ever sum past the floor, the clamp silently starts
  // swallowing them, which would make a purchased Mutation do nothing.
  const total = CONFIG.upgrades
    .filter((u) => u.effect.kind === "costGrowth")
    .reduce((sum, u) => sum + u.effect.delta, 0);
  assert.ok(CONFIG.costGrowth + total > CONFIG.minCostGrowth,
    `all costGrowth deltas sum to ${total}, which hits the ${CONFIG.minCostGrowth} floor`);
});
