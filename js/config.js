// All balance numbers and tunables live here. Plain numbers only;
// state.js wraps them in Decimal where needed.

const CONFIG = {
  gameTitle: "Viral Load",

  startingVirions: 10,

  // Each purchase multiplies a generator's cost by this factor.
  costGrowth: 1.15,

  // Floor for costGrowth after "costGrowth" Mutations are applied, so stacking
  // them can never flatten the cost curve.
  minCostGrowth: 1.05,

  // A generator becomes visible once virions reach this fraction of its current
  // cost (after cost Mutations).
  unlockFraction: 0.5,

  // An upgrade becomes visible once virions reach this fraction of its cost.
  upgradeUnlockFraction: 0.25,

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
      baseRate: 1,       // virions per second, per generator
    },
    {
      id: "salmonella",
      name: "Salmonella",
      description: "Famous for ruining picnics. Now ruining itself for you.",
      genClass: 1,
      baseCost: 150,
      baseRate: 10,
    },
    {
      id: "cholerae",
      name: "V. cholerae",
      description: "Comma-shaped. Refuses to pause.",
      genClass: 1,
      baseCost: 2000,
      baseRate: 100,
    },
    {
      id: "listeria",
      name: "Listeria",
      description: "Thrives in the fridge. Cold storage is merely a suggestion.",
      genClass: 1,
      baseCost: 25000,
      baseRate: 1000,
    },
    {
      id: "meningitidis",
      name: "N. meningitidis",
      description: "Heads straight for the brain. Ambitious for a diplococcus.",
      genClass: 1,
      baseCost: 300000,
      baseRate: 10000,
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
      description: "Skip the proofreading. Class I hosts produce 2Ã— virions.",
      cost: 100,
      effect: { kind: "output", targetClass: 1, mult: 2 },
    },
    {
      id: "plasmidLibrary",
      name: "Plasmid Library",
      description: "Every lab keeps its plasmids in E. coli. E. coli produce 3Ã— virions.",
      cost: 500,
      effect: { kind: "output", targetId: "ecoli", mult: 3 },
    },
    {
      id: "rapidTranslation",
      name: "Rapid Translation",
      description: "Ribosomes on overtime. Class I hosts replicate 1.5Ã— faster.",
      cost: 1000,
      effect: { kind: "output", targetClass: 1, mult: 1.5 },
    },
    {
      id: "flagellarOverdrive",
      name: "Flagellar Overdrive",
      description: "Spin the whip harder. Salmonella produce 3Ã— virions.",
      cost: 5000,
      effect: { kind: "output", targetId: "salmonella", mult: 3 },
    },
    {
      id: "hostShutdown",
      name: "Host Shutdown",
      description: "Silence the host's own genes. Class I hosts cost 0.5Ã—.",
      cost: 10000,
      effect: { kind: "cost", targetClass: 1, mult: 0.5 },
    },
    {
      id: "secondChromosome",
      name: "Second Chromosome",
      description: "V. cholerae keeps a spare. V. cholerae produce 3Ã— virions.",
      cost: 60000,
      effect: { kind: "output", targetId: "cholerae", mult: 3 },
    },
    {
      id: "nutrientBroth",
      name: "Nutrient Broth",
      description: "Someone enriched the agar. All hosts produce 1.5Ã— virions.",
      cost: 100000,
      effect: { kind: "output", mult: 1.5 },
    },
    {
      id: "streamlinedGenome",
      name: "Streamlined Genome",
      description: "Discard the junk DNA. Class I host costs grow 1.13Ã— instead of 1.15Ã—.",
      cost: 400000,
      effect: { kind: "costGrowth", targetClass: 1, delta: -0.02 },
    },
    {
      id: "coldShockProteins",
      name: "Cold Shock Proteins",
      description: "Comfortable at 4Â°C. Listeria produce 3Ã— virions.",
      cost: 750000,
      effect: { kind: "output", targetId: "listeria", mult: 3 },
    },
    {
      id: "serialPassage",
      name: "Serial Passage",
      description: "Culture it again. And again. Every host produces Ã—1.1 per 10 owned.",
      cost: 2000000,
      effect: { kind: "milestone", targetClass: 1, per: 10, mult: 1.1 },
    },
    {
      id: "diplococcalPairing",
      name: "Diplococcal Pairing",
      description: "Two cells, twice the paperwork. N. meningitidis produce 3Ã— virions.",
      cost: 9000000,
      effect: { kind: "output", targetId: "meningitidis", mult: 3 },
    },
  ],
};
