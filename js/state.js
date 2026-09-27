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
  };
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

function getGeneratorCost(id) {
  const gen = getGeneratorConfig(id);
  const owned = state.generators[id].owned;
  return new Decimal(gen.baseCost)
    .times(Decimal.pow(getCostGrowth(gen), owned))
    .times(getUpgradeMultiplier("cost", gen))
    .ceil();
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

function buyGenerator(id) {
  const cost = getGeneratorCost(id);
  if (!canAfford(cost)) return false;
  state.virions = state.virions.minus(cost);
  state.generators[id].owned += 1;
  return true;
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
