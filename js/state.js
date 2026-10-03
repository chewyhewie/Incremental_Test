// The single game-state object and the pure-ish helpers that read/modify it.
// All resource amounts and costs are break_infinity Decimals.

let state = null;

function newState() {
  const generators = {};
  for (const gen of CONFIG.generators) {
    generators[gen.id] = { owned: 0, unlocked: false };
  }
  const upgrades = {};
  for (const upg of CONFIG.upgrades) {
    upgrades[upg.id] = { owned: false, unlocked: false };
  }
  return {
    version: CONFIG.saveVersion,
    lastSaved: Date.now(),
    virions: new Decimal(CONFIG.startingVirions),
    generators,
    upgrades,
    stats: newStats(),
  };
}

// Counters for the Stats tab. Prestige may later split these into run/lifetime.
function newStats() {
  return {
    startedAt: Date.now(),          // first played (ms)
    timePlayed: 0,                  // seconds with the game open
    offlineSeconds: 0,              // seconds credited by offline progress
    totalProduced: new Decimal(0),  // all virions produced, online and offline
    bestPerSec: new Decimal(0),     // highest production seen
    hostsBought: 0,                 // every host purchase; bulk buys count each
  };
}

// Credit production to virions and the stats. Shared by update() and offline progress.
function produce(perSec, seconds) {
  const produced = perSec.times(seconds);
  state.virions = state.virions.plus(produced);
  state.stats.totalProduced = state.stats.totalProduced.plus(produced);
  state.stats.bestPerSec = Decimal.max(state.stats.bestPerSec, perSec);
  return produced;
}

function getGeneratorConfig(id) {
  return CONFIG.generators.find((g) => g.id === id);
}

function getUpgradeConfig(id) {
  return CONFIG.upgrades.find((u) => u.id === id);
}

// Does an owned upgrade's effect apply to this generator? `targetId` picks one
// generator, `targetClass` a whole class, and an effect with neither is global.
function effectApplies(effect, gen) {
  if (effect.targetId !== undefined && effect.targetId !== gen.id) return false;
  if (effect.targetClass !== undefined && effect.targetClass !== gen.genClass) return false;
  return true;
}

// Every owned effect of a given kind that applies to this generator.
function* ownedEffects(kind, gen) {
  for (const upg of CONFIG.upgrades) {
    if (!state.upgrades[upg.id].owned) continue;
    if (upg.effect.kind !== kind) continue;
    if (!effectApplies(upg.effect, gen)) continue;
    yield upg.effect;
  }
}

// Product of all owned upgrade multipliers of a given kind for one generator.
function getUpgradeMultiplier(kind, gen) {
  let mult = 1;
  for (const effect of ownedEffects(kind, gen)) {
    mult *= effect.mult;
  }
  return mult;
}

// The per-purchase cost growth factor, after "costGrowth" Mutations.
function getCostGrowth(gen) {
  let growth = CONFIG.costGrowth;
  for (const effect of ownedEffects("costGrowth", gen)) {
    growth += effect.delta;
  }
  return Math.max(CONFIG.minCostGrowth, growth);
}

// "milestone" Mutations grant a multiplier once per `per` owned of this generator.
// Decimal because the exponent grows without bound as `owned` climbs.
function getMilestoneMultiplier(gen, owned) {
  let mult = new Decimal(1);
  for (const effect of ownedEffects("milestone", gen)) {
    mult = mult.times(Decimal.pow(effect.mult, Math.floor(owned / effect.per)));
  }
  return mult;
}

// One purchase's price, from factors the caller has already looked up.
function priceAt(gen, growth, costMult, owned) {
  return new Decimal(gen.baseCost)
    .times(Decimal.pow(growth, owned))
    .times(costMult)
    .ceil();
}

// The price of the purchase made when `owned` are already owned.
function getGeneratorCostAt(id, owned) {
  const gen = getGeneratorConfig(id);
  return priceAt(gen, getCostGrowth(gen), getUpgradeMultiplier("cost", gen), owned);
}

function getGeneratorCost(id) {
  return getGeneratorCostAt(id, state.generators[id].owned);
}

// Total price of the next `count` purchases, equal to buying them one at a time.
// Prices are rounded up one by one until they pass 2^53; beyond that every price
// is already whole, so the rest is a geometric series and the cost of a huge
// Max stays cheap to compute.
function getBulkCost(id, count) {
  const gen = getGeneratorConfig(id);
  const growth = getCostGrowth(gen);
  const costMult = getUpgradeMultiplier("cost", gen);
  const owned = state.generators[id].owned;
  let total = new Decimal(0);
  let i = 0;
  for (; i < count; i++) {
    const cost = priceAt(gen, growth, costMult, owned + i);
    if (cost.gt(Number.MAX_SAFE_INTEGER)) break;
    total = total.plus(cost);
  }
  if (i === count) return total;
  const series = Decimal.pow(growth, count - i).minus(1).div(growth - 1);
  return total.plus(priceAt(gen, growth, costMult, owned + i).times(series));
}

// How many of this generator the current virions can buy in one go.
// The geometric series (ignoring ceil) gives an upper bound; ceil can only make
// it dearer, so step down until the exact bulk cost fits, then check the next.
function getMaxAffordable(id) {
  const gen = getGeneratorConfig(id);
  const growth = getCostGrowth(gen);
  const first = new Decimal(gen.baseCost)
    .times(Decimal.pow(growth, state.generators[id].owned))
    .times(getUpgradeMultiplier("cost", gen));
  if (state.virions.lt(first)) return 0;
  const ratio = state.virions.times(growth - 1).div(first).plus(1);
  let n = Math.max(0, Math.floor(ratio.log10() / Math.log10(growth)));
  while (n > 0 && !canAfford(getBulkCost(id, n))) n -= 1;
  while (canAfford(getBulkCost(id, n + 1))) n += 1;
  return n;
}

// Virions per second produced by ONE generator of this type.
function getGeneratorRate(id) {
  const gen = getGeneratorConfig(id);
  const owned = state.generators[id].owned;
  return new Decimal(gen.baseRate)
    .times(getUpgradeMultiplier("output", gen))
    .times(getMilestoneMultiplier(gen, owned));
}

// Virions per second produced by all owned generators of this type.
function getGeneratorOutput(id) {
  return getGeneratorRate(id).times(state.generators[id].owned);
}

function getTotalPerSec() {
  let total = new Decimal(0);
  for (const gen of CONFIG.generators) {
    total = total.plus(getGeneratorOutput(gen.id));
  }
  return total;
}

// Not stored: everything you started with or produced, minus what you still hold.
// Clamped because saves from before stats existed only know a lower bound.
function getVirionsSpent() {
  const spent = state.stats.totalProduced.plus(CONFIG.startingVirions).minus(state.virions);
  return Decimal.max(spent, 0);
}

function canAfford(cost) {
  return state.virions.gte(cost);
}

function checkUnlocks() {
  for (const gen of CONFIG.generators) {
    const g = state.generators[gen.id];
    if (!g.unlocked && state.virions.gte(getGeneratorCost(gen.id).times(CONFIG.unlockFraction))) {
      g.unlocked = true;
    }
  }
  // Upgrade costs are fixed, so this reads the config cost directly.
  for (const upg of CONFIG.upgrades) {
    const u = state.upgrades[upg.id];
    if (!u.unlocked && state.virions.gte(new Decimal(upg.cost).times(CONFIG.upgradeUnlockFraction))) {
      u.unlocked = true;
    }
  }
}

// Buy exactly `count` (all or nothing).
function buyGenerators(id, count) {
  if (count < 1) return false;
  const cost = getBulkCost(id, count);
  if (!canAfford(cost)) return false;
  state.virions = state.virions.minus(cost);
  state.generators[id].owned += count;
  state.stats.hostsBought += count;
  return true;
}

function buyGenerator(id) {
  return buyGenerators(id, 1);
}

function buyUpgrade(id) {
  const u = state.upgrades[id];
  // Never sell something the player cannot see: owned implies unlocked.
  if (u.owned || !u.unlocked) return false;
  const cost = new Decimal(getUpgradeConfig(id).cost);
  if (!canAfford(cost)) return false;
  state.virions = state.virions.minus(cost);
  u.owned = true;
  return true;
}
