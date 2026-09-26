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
    upgrades[upg.id] = false;
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

// Product of all owned upgrade multipliers of a given kind for a generator class.
function getUpgradeMultiplier(kind, genClass) {
  let mult = 1;
  for (const upg of CONFIG.upgrades) {
    if (state.upgrades[upg.id] && upg.effect.kind === kind && upg.effect.targetClass === genClass) {
      mult *= upg.effect.mult;
    }
  }
  return mult;
}

function getGeneratorCost(id) {
  const gen = getGeneratorConfig(id);
  const owned = state.generators[id].owned;
  return new Decimal(gen.baseCost)
    .times(Decimal.pow(CONFIG.costGrowth, owned))
    .times(getUpgradeMultiplier("cost", gen.genClass))
    .ceil();
}

// Virions per second produced by ONE generator of this type.
function getGeneratorRate(id) {
  const gen = getGeneratorConfig(id);
  return new Decimal(gen.baseRate).times(getUpgradeMultiplier("output", gen.genClass));
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
    if (!g.unlocked && state.virions.gte(gen.baseCost * CONFIG.unlockFraction)) {
      g.unlocked = true;
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
  if (state.upgrades[id]) return false;
  const cost = new Decimal(getUpgradeConfig(id).cost);
  if (!canAfford(cost)) return false;
  state.virions = state.virions.minus(cost);
  state.upgrades[id] = true;
  return true;
}
