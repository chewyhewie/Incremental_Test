// All balance numbers and tunables live here. Plain numbers only;
// state.js wraps them in Decimal where needed.

const CONFIG = {
  gameTitle: "Viral Load",

  startingVirions: 10,

  // Each purchase multiplies a generator's cost by this factor. Tuned with the
  // balance simulator (npm run tune); the original design value was 1.15.
  costGrowth: 1.55,

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
      baseCost: 5,
      baseRate: 0.39,    // virions per second, per generator
    },
    {
      id: "salmonella",
      name: "Salmonella",
      description: "Famous for ruining picnics. Now ruining itself for you.",
      genClass: 1,
      baseCost: 230,
      baseRate: 3.1,
    },
    {
      id: "cholerae",
      name: "V. cholerae",
      description: "Comma-shaped. Refuses to pause.",
      genClass: 1,
      baseCost: 1100,
      baseRate: 14,
    },
    {
      id: "listeria",
      name: "Listeria",
      description: "Thrives in the fridge. Cold storage is merely a suggestion.",
      genClass: 1,
      baseCost: 47000,
      baseRate: 210,
    },
    {
      id: "meningitidis",
      name: "N. meningitidis",
      description: "Heads straight for the brain. Ambitious for a diplococcus.",
      genClass: 1,
      baseCost: 280000,
      baseRate: 2000,
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
      cost: 210,
      effect: { kind: "output", targetId: "ecoli", mult: 3 },
    },
    {
      id: "flagellarOverdrive",
      name: "Flagellar Overdrive",
      description: "Spin the whip harder. Salmonella produce 3x virions.",
      cost: 890,
      effect: { kind: "output", targetId: "salmonella", mult: 3 },
    },
    {
      id: "secondChromosome",
      name: "Second Chromosome",
      description: "V. cholerae keeps a spare. V. cholerae produce 3x virions.",
      cost: 2800,
      effect: { kind: "output", targetId: "cholerae", mult: 3 },
    },
    {
      id: "coldShockProteins",
      name: "Cold Shock Proteins",
      description: "Comfortable at 4°C. Listeria produce 3x virions.",
      cost: 48000,
      effect: { kind: "output", targetId: "listeria", mult: 3 },
    },
    {
      id: "rapidTranscription",
      name: "Rapid Transcription",
      description: "Skip the proofreading. Class I hosts produce 1.5x virions.",
      cost: 61000,
      effect: { kind: "output", targetClass: 1, mult: 1.5 },
    },
    {
      id: "lacOperonJam",
      name: "Lac Operon Jam",
      description: "Someone wedged the lactose switch open. E. coli produce 2x virions.",
      cost: 86000,
      effect: { kind: "output", targetId: "ecoli", mult: 2 },
    },
    {
      id: "diplococcalPairing",
      name: "Diplococcal Pairing",
      description: "Two cells, twice the paperwork. N. meningitidis produce 3x virions.",
      cost: 300000,
      effect: { kind: "output", targetId: "meningitidis", mult: 3 },
    },
    {
      id: "hostShutdown",
      name: "Host Shutdown",
      description: "Silence the host's own genes. Class I hosts cost 0.1x.",
      cost: 320000,
      effect: { kind: "cost", targetClass: 1, mult: 0.1 },
    },
    {
      id: "molecularSyringe",
      name: "Molecular Syringe",
      description: "Why knock when you can inject? Salmonella produce 2x virions.",
      cost: 680000,
      effect: { kind: "output", targetId: "salmonella", mult: 2 },
    },
    {
      id: "familyResemblance",
      name: "Family Resemblance",
      description: "Its toxin gene came from a virus. You're practically related. V. cholerae produce 2x virions.",
      cost: 1600000,
      effect: { kind: "output", targetId: "cholerae", mult: 2 },
    },
    {
      id: "rapidTranslation",
      name: "Rapid Translation",
      description: "Ribosomes on overtime. Class I hosts replicate 3x faster.",
      cost: 5800000,
      effect: { kind: "output", targetClass: 1, mult: 3 },
    },
    {
      id: "actinRocket",
      name: "Actin Rocket",
      description: "Hijacks the host's scaffolding for a jet pack. Listeria produce 2x virions.",
      cost: 24000000,
      effect: { kind: "output", targetId: "listeria", mult: 2 },
    },
    {
      id: "sugarCoating",
      name: "Sugar Coating",
      description: "A polysaccharide capsule. The immune system sees nothing. N. meningitidis produce 2x virions.",
      cost: 71000000,
      effect: { kind: "output", targetId: "meningitidis", mult: 2 },
    },
    {
      id: "serialPassage",
      name: "Serial Passage",
      description: "Culture it again. And again. Every host produces x1.1 per 10 owned.",
      cost: 210000000,
      effect: { kind: "milestone", targetClass: 1, per: 10, mult: 1.1 },
    },
  ],
};
