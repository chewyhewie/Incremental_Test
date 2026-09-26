// All balance numbers and tunables live here. Plain numbers only;
// state.js wraps them in Decimal where needed.

const CONFIG = {
  gameTitle: "Viral Load",

  startingVirions: 10,

  // Each purchase multiplies a generator's cost by this factor.
  costGrowth: 1.15,

  // A generator becomes visible once virions reach this fraction of its base cost.
  unlockFraction: 0.5,

  // Loop and saving.
  tickMs: 100,                     // ~10 updates + renders per second
  autosaveMs: 30 * 1000,
  offlineCapSeconds: 8 * 60 * 60,  // 8 hours
  minOfflineSeconds: 5,            // don't bother reporting tiny gaps
  saveKey: "viralLoad.save",
  saveVersion: 1,

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
  ],

  // One-time upgrades ("Mutations").
  // effect.kind: "output" multiplies production, "cost" multiplies generator cost.
  upgrades: [
    {
      id: "rapidTranscription",
      name: "Rapid Transcription",
      description: "Skip the proofreading. Class I hosts produce 2× virions.",
      cost: 100,
      effect: { kind: "output", targetClass: 1, mult: 2 },
    },
    {
      id: "rapidTranslation",
      name: "Rapid Translation",
      description: "Ribosomes on overtime. Class I hosts replicate 1.5× faster.",
      cost: 1000,
      effect: { kind: "output", targetClass: 1, mult: 1.5 },
    },
    {
      id: "hostShutdown",
      name: "Host Shutdown",
      description: "Silence the host's own genes. Class I hosts cost 0.5×.",
      cost: 10000,
      effect: { kind: "cost", targetClass: 1, mult: 0.5 },
    },
  ],
};
