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

// Per-host Mutations come in sets, one per generator, so no host is left out.
test("every generator has the same number (at least 1) of per-host output Mutations", () => {
  const counts = new Map(genIds.map((id) => [id, 0]));
  for (const { effect } of CONFIG.upgrades) {
    if (effect.kind === "output" && effect.targetId !== undefined) {
      counts.set(effect.targetId, counts.get(effect.targetId) + 1);
    }
  }
  const want = counts.get(genIds[0]);
  assert.ok(want >= 1, `${genIds[0]} has no per-host output Mutation`);
  for (const [id, n] of counts) {
    assert.equal(n, want, `${id} has ${n} per-host output Mutations, want ${want} like ${genIds[0]}`);
  }
});

// A host-specific Mutation must not be buyable long before its host: a boost for a
// host the player cannot have yet is a wasted purchase.
test("every per-host Mutation costs at least its host's base cost", () => {
  for (const { id, cost, effect } of CONFIG.upgrades) {
    if (effect.targetId === undefined) continue;
    const host = CONFIG.generators.find((x) => x.id === effect.targetId);
    assert.ok(cost >= host.baseCost,
      `${id} costs ${cost}, below ${host.id}'s base cost of ${host.baseCost}`);
  }
});

// The tuner's --search rules name Mutations by id; a rename or removal here would
// otherwise only surface as a crash mid-search.
test("tuner SEARCH rules name real Mutations", () => {
  const { SEARCH } = require("../sim/tune.js");
  const ids = new Set(CONFIG.upgrades.map((u) => u.id));
  for (const { ids: group, choices } of SEARCH.multGroups) {
    for (const id of group) assert.ok(ids.has(id), `SEARCH group names unknown Mutation "${id}"`);
    assert.ok(choices.length > 0, `group ${group.join(",")} has choices`);
  }
  for (const id of SEARCH.fixedEffects) assert.ok(ids.has(id), `SEARCH.fixedEffects names unknown Mutation "${id}"`);
  for (const id of Object.keys(SEARCH.fixedGenerators)) {
    assert.ok(genIds.includes(id), `SEARCH.fixedGenerators names unknown host "${id}"`);
  }
});

test("the current config follows the tuner's search rules", () => {
  const { followsRules, patchFromConfig } = require("../sim/tune.js");
  assert.ok(followsRules(patchFromConfig(CONFIG), CONFIG));
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

// "Ã—" and "Â°" are what "×" and "°" become when UTF-8 text is decoded as
// Windows-1252 and saved again. The game shows these strings verbatim.
test("names and descriptions have no double-encoded (mojibake) characters", () => {
  for (const item of [...CONFIG.generators, ...CONFIG.upgrades]) {
    for (const text of [item.name, item.description]) {
      assert.doesNotMatch(text, /[ÂÃ]/, `${item.id}: "${text}"`);
    }
  }
});

// Descriptions spell out effect sizes ("2.5x virions", "x1.1 per 10 owned"), so a
// retune that forgets the text would show players the wrong number.
test("each Mutation's description states its current effect size", () => {
  const n = (x) => String(+x.toFixed(4)); // 1.3 + -0.01 -> "1.29", not 1.2900000000000003
  for (const upg of CONFIG.upgrades) {
    const e = upg.effect;
    const text = upg.description;
    if (e.kind === "costGrowth") {
      assert.ok(text.includes(`${n(CONFIG.costGrowth + e.delta)}x`) && text.includes(`${n(CONFIG.costGrowth)}x`),
        `${upg.id}: "${text}" should mention ${n(CONFIG.costGrowth + e.delta)}x and ${n(CONFIG.costGrowth)}x`);
    } else {
      assert.ok(text.includes(`${n(e.mult)}x`) || text.includes(`x${n(e.mult)}`),
        `${upg.id}: "${text}" should mention ${n(e.mult)}x`);
    }
  }
});

test("buyModes are distinct whole counts of at least 1, or \"max\"", () => {
  assert.ok(CONFIG.buyModes.length > 0, "at least one buy mode");
  assert.equal(new Set(CONFIG.buyModes).size, CONFIG.buyModes.length, "no duplicates");
  for (const mode of CONFIG.buyModes) {
    assert.ok(mode === "max" || (Number.isInteger(mode) && mode >= 1), `bad buy mode ${mode}`);
  }
});
