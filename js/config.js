// All balance numbers and tunables live here. Plain numbers only;
// state.js wraps them in Decimal where needed.

const CONFIG = {
  gameTitle: "Viral Load",

  startingVirions: 10,

  // Each purchase multiplies a generator's cost by this factor. Tuned with the
  // balance simulator (npm run tune); the original design value was 1.15.
  costGrowth: 1.3,

  // Floor for costGrowth after "costGrowth" Mutations are applied, so stacking
  // them can never flatten the cost curve.
  minCostGrowth: 1.05,

  // A generator becomes visible once virions reach this fraction of its current
  // cost (after cost Mutations).
  unlockFraction: 0.1,

  // An upgrade becomes visible once virions reach this fraction of its cost.
  upgradeUnlockFraction: 0.1,

  // Loop and saving.
  tickMs: 100,                     // ~10 updates + renders per second
  autosaveMs: 30 * 1000,
  offlineCapSeconds: 8 * 60 * 60,  // 8 hours
  minOfflineSeconds: 5,            // don't bother reporting tiny gaps
  saveKey: "viralLoad.save",
  saveVersion: 2,

  // Class I generators: infected bacteria.
  generators: [
    {
      id: "ecoli",
      name: "E. coli",
      description: "A reliable gut-level workhorse. Asks no questions.",
      genClass: 1,
      baseCost: 10,
      baseRate: 0.5,     // virions per second, per generator
    },
    {
      id: "salmonella",
      name: "Salmonella",
      description: "Famous for ruining picnics. Now ruining itself for you.",
      genClass: 1,
      baseCost: 330,
      baseRate: 1.25,
    },
    {
      id: "cholerae",
      name: "V. cholerae",
      description: "Comma-shaped. Refuses to pause.",
      genClass: 1,
      baseCost: 2500,
      baseRate: 9,
    },
    {
      id: "listeria",
      name: "Listeria",
      description: "Thrives in the fridge. Cold storage is merely a suggestion.",
      genClass: 1,
      baseCost: 45000,
      baseRate: 600,
    },
    {
      id: "meningitidis",
      name: "N. meningitidis",
      description: "Heads straight for the brain. Ambitious for a diplococcus.",
      genClass: 1,
      baseCost: 400000,
      baseRate: 1000,
    },
  ],

  // One-time upgrades ("Mutations"), listed in cost order.
  //
  // effect.kind:
  //   "output"     multiplies production            (mult)
  //   "cost"       multiplies generator cost        (mult)
  //   "costGrowth" adds to the cost growth factor   (delta, negative to help)
  //   "milestone"  multiplies output once per `per` owned of that generator (mult, per)
  //
  // Targeting is independent of kind:
  //   targetId     applies to that one generator
  //   targetClass  applies to every generator of that class
  //   neither      applies to every generator (global)
  upgrades: [
    {
      id: "rapidTranscription",
      name: "Rapid Transcription",
      description: "Skip the proofreading. Class I hosts produce 1.75x virions.",
      cost: 85,
      effect: { kind: "output", targetClass: 1, mult: 1.75 },
    },
    {
      id: "plasmidLibrary",
      name: "Plasmid Library",
      description: "Every lab keeps its plasmids in E. coli. E. coli produce 2.5x virions.",
      cost: 450,
      effect: { kind: "output", targetId: "ecoli", mult: 2.5 },
    },
    {
      id: "rapidTranslation",
      name: "Rapid Translation",
      description: "Ribosomes on overtime. Class I hosts replicate 1.5x faster.",
      cost: 1250,
      effect: { kind: "output", targetClass: 1, mult: 1.5 },
    },
    {
      id: "flagellarOverdrive",
      name: "Flagellar Overdrive",
      description: "Spin the whip harder. Salmonella produce 2.25x virions.",
      cost: 3000,
      effect: { kind: "output", targetId: "salmonella", mult: 2.25 },
    },
    {
      id: "hostShutdown",
      name: "Host Shutdown",
      description: "Silence the host's own genes. Class I hosts cost 0.5x.",
      cost: 6000,
      effect: { kind: "cost", targetClass: 1, mult: 0.5 },
    },
    {
      id: "secondChromosome",
      name: "Second Chromosome",
      description: "V. cholerae keeps a spare. V. cholerae produce 2x virions.",
      cost: 30000,
      effect: { kind: "output", targetId: "cholerae", mult: 2 },
    },
    {
      id: "nutrientBroth",
      name: "Nutrient Broth",
      description: "Someone enriched the agar. All hosts produce 1.15x virions.",
      cost: 300000,
      effect: { kind: "output", mult: 1.15 },
    },
    {
      id: "streamlinedGenome",
      name: "Streamlined Genome",
      description: "Discard the junk DNA. Class I host costs grow 1.29x instead of 1.3x.",
      cost: 1000000,
      effect: { kind: "costGrowth", targetClass: 1, delta: -0.01 },
    },
    {
      id: "coldShockProteins",
      name: "Cold Shock Proteins",
      description: "Comfortable at 4°C. Listeria produce 2x virions.",
      cost: 2300000,
      effect: { kind: "output", targetId: "listeria", mult: 2 },
    },
    {
      id: "diplococcalPairing",
      name: "Diplococcal Pairing",
      description: "Two cells, twice the paperwork. N. meningitidis produce 3x virions.",
      cost: 2700000,
      effect: { kind: "output", targetId: "meningitidis", mult: 3 },
    },
    {
      id: "serialPassage",
      name: "Serial Passage",
      description: "Culture it again. And again. Every host produces x1.1 per 10 owned.",
      cost: 4000000,
      effect: { kind: "milestone", targetClass: 1, per: 10, mult: 1.1 },
    },
  ],
};
