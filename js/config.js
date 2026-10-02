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
      baseRate: 1,       // virions per second, per generator
    },
    {
      id: "salmonella",
      name: "Salmonella",
      description: "Famous for ruining picnics. Now ruining itself for you.",
      genClass: 1,
      baseCost: 170,
      baseRate: 5,
    },
    {
      id: "cholerae",
      name: "V. cholerae",
      description: "Comma-shaped. Refuses to pause.",
      genClass: 1,
      baseCost: 4300,
      baseRate: 26,
    },
    {
      id: "listeria",
      name: "Listeria",
      description: "Thrives in the fridge. Cold storage is merely a suggestion.",
      genClass: 1,
      baseCost: 52000,
      baseRate: 130,
    },
    {
      id: "meningitidis",
      name: "N. meningitidis",
      description: "Heads straight for the brain. Ambitious for a diplococcus.",
      genClass: 1,
      baseCost: 300000,
      baseRate: 2100,
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
      id: "plasmidLibrary",
      name: "Plasmid Library",
      description: "Every lab keeps its plasmids in E. coli. E. coli produce 3x virions.",
      cost: 600,
      effect: { kind: "output", targetId: "ecoli", mult: 3 },
    },
    {
      id: "flagellarOverdrive",
      name: "Flagellar Overdrive",
      description: "Spin the whip harder. Salmonella produce 3x virions.",
      cost: 1400,
      effect: { kind: "output", targetId: "salmonella", mult: 3 },
    },
    {
      id: "secondChromosome",
      name: "Second Chromosome",
      description: "V. cholerae keeps a spare. V. cholerae produce 3x virions.",
      cost: 5100,
      effect: { kind: "output", targetId: "cholerae", mult: 3 },
    },
    {
      id: "coldShockProteins",
      name: "Cold Shock Proteins",
      description: "Comfortable at 4°C. Listeria produce 3x virions.",
      cost: 69000,
      effect: { kind: "output", targetId: "listeria", mult: 3 },
    },
    {
      id: "rapidTranscription",
      name: "Rapid Transcription",
      description: "Skip the proofreading. Class I hosts produce 1.5x virions.",
      cost: 75000,
      effect: { kind: "output", targetClass: 1, mult: 1.5 },
    },
    {
      id: "lacOperonJam",
      name: "Lac Operon Jam",
      description: "Someone wedged the lactose switch open. E. coli produce 1.5x virions.",
      cost: 110000,
      effect: { kind: "output", targetId: "ecoli", mult: 1.5 },
    },
    {
      id: "diplococcalPairing",
      name: "Diplococcal Pairing",
      description: "Two cells, twice the paperwork. N. meningitidis produce 3x virions.",
      cost: 310000,
      effect: { kind: "output", targetId: "meningitidis", mult: 3 },
    },
    {
      id: "hostShutdown",
      name: "Host Shutdown",
      description: "Silence the host's own genes. Class I hosts cost 0.5x.",
      cost: 410000,
      effect: { kind: "cost", targetClass: 1, mult: 0.5 },
    },
    {
      id: "molecularSyringe",
      name: "Molecular Syringe",
      description: "Why knock when you can inject? Salmonella produce 1.5x virions.",
      cost: 590000,
      effect: { kind: "output", targetId: "salmonella", mult: 1.5 },
    },
    {
      id: "familyResemblance",
      name: "Family Resemblance",
      description: "Its toxin gene came from a virus. You're practically related. V. cholerae produce 1.5x virions.",
      cost: 670000,
      effect: { kind: "output", targetId: "cholerae", mult: 1.5 },
    },
    {
      id: "rapidTranslation",
      name: "Rapid Translation",
      description: "Ribosomes on overtime. Class I hosts replicate 3x faster.",
      cost: 2900000,
      effect: { kind: "output", targetClass: 1, mult: 3 },
    },
    {
      id: "actinRocket",
      name: "Actin Rocket",
      description: "Hijacks the host's scaffolding for a jet pack. Listeria produce 1.5x virions.",
      cost: 34000000,
      effect: { kind: "output", targetId: "listeria", mult: 1.5 },
    },
    {
      id: "sugarCoating",
      name: "Sugar Coating",
      description: "A polysaccharide capsule. The immune system sees nothing. N. meningitidis produce 1.5x virions.",
      cost: 94000000,
      effect: { kind: "output", targetId: "meningitidis", mult: 1.5 },
    },
    {
      id: "serialPassage",
      name: "Serial Passage",
      description: "Culture it again. And again. Every host produces x1.1 per 10 owned.",
      cost: 200000000,
      effect: { kind: "milestone", targetClass: 1, per: 10, mult: 1.1 },
    },
  ],
};
