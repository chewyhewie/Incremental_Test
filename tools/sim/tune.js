// Balance scorecard for the early game, plus an optional search for better numbers.
// Report only: it never edits config.js.
//
//   npm run tune                           score the current config.js
//   npm run tune -- --patch cand.json      score config.js with a patch applied
//   npm run tune -- --search --minutes 5   hill-climb from the current (patched) config
//                                          and print the best patch as JSON
//
// The reference player is Active greedyPayback. "T" is the moment it owns every
// Mutation and at least 10 of every host.
//
// A patch is JSON keyed by id; any field may be left out:
//   { "costGrowth": 1.3,
//     "generators": { "ecoli": { "baseCost": 10, "baseRate": 0.5 } },
//     "upgrades": { "rapidTranscription": { "cost": 80, "mult": 1.75 } } }
// A "costGrowth" Mutation takes `delta` instead of `mult`.

const fs = require("node:fs");
const { runProfile } = require("./sim.js");
const { loadLogic } = require("./load-logic.js");

// Pacing targets. Tool-side goals, not game balance, so they live here rather than
// in config.js.
const TARGETS = {
  minT: 30 * 60,          // T between 30...
  maxT: 40 * 60,          // ...and 40 minutes
  maxGap: 5 * 60,         // no stretch longer than this without a first-time purchase before T
  quickGap: 5,            // a first buy this soon after the previous one is "quick"
  maxQuickShare: 0.3,     // at most this share of first buys before T may be quick
};

// What --search may change, and how.
const SEARCH = {
  // One shared factor for every host, kept in this range. The floor matters: the
  // score only covers the game up to T, and a flatter curve (1.05) passes every
  // target while hosts pile up by the hundreds after T.
  costGrowth: [1.2, 2],
  // Mutations whose multiplier moves as one, and only to one of `choices`.
  multGroups: [
    { ids: ["plasmidLibrary", "flagellarOverdrive", "secondChromosome", "coldShockProteins", "diplococcalPairing"], choices: [1.5, 2, 3] },
    { ids: ["lacOperonJam", "molecularSyringe", "familyResemblance", "actinRocket", "sugarCoating"], choices: [1.5, 2, 3] },
    { ids: ["rapidTranscription"], choices: [1.5, 2, 3] },
    { ids: ["rapidTranslation"], choices: [1.5, 2, 3] },
    { ids: ["hostShutdown"], choices: [0.1, 0.2, 0.5] },
  ],
  // Mutations whose effect is never changed (their cost still is).
  fixedEffects: ["serialPassage"],
  // Host stats the search never changes.
  fixedGenerators: { ecoli: { baseCost: 10, baseRate: 1 } },
  // Each host's base rate must be at least this many times the previous host's.
  minRateStep: 5,
  // Largest change one nudge makes to a cost, rate or costGrowth, in log space
  // (0.35 is about +-35%).
  maxNudge: 0.35,
  // Host base costs never go below this.
  minBaseCost: 1,
  // Ranges for Mutations outside every group and not in fixedEffects.
  freeEffects: {
    boost: [1.05, Infinity],     // an output multiplier above 1
    cut: [0.1, 0.9],             // a cost multiplier below 1
    delta: [-0.06, -0.005],      // a "costGrowth" Mutation's delta
  },
  // On an equal score, prefer lower costGrowth (compared to this precision), then
  // wider gaps between hosts (the smallest baseRate ratio of neighbouring tiers).
  // Equal candidates are accepted too, so the search keeps moving once every
  // target passes.
  tiebreakCostGrowthStep: 0.01,
};

const REFERENCE = { name: "Active", strategy: "greedyPayback", checkEvery: 1 };
const RUN_SECONDS = 60 * 60; // comfortably past TARGETS.maxT

// ---------- Patches ----------

function applyPatch(CONFIG, patch) {
  if (patch.costGrowth !== undefined) CONFIG.costGrowth = patch.costGrowth;
  for (const [id, p] of Object.entries(patch.generators || {})) {
    const gen = CONFIG.generators.find((x) => x.id === id);
    if (!gen) throw new Error(`Patch: unknown generator "${id}"`);
    Object.assign(gen, p);
  }
  for (const [id, p] of Object.entries(patch.upgrades || {})) {
    const upg = CONFIG.upgrades.find((x) => x.id === id);
    if (!upg) throw new Error(`Patch: unknown upgrade "${id}"`);
    if (p.cost !== undefined) upg.cost = p.cost;
    if (p.mult !== undefined) upg.effect.mult = p.mult;
    if (p.delta !== undefined) upg.effect.delta = p.delta;
  }
}

// Every lever, as a full patch, read from the (possibly patched) config.
function patchFromConfig(CONFIG) {
  const patch = { costGrowth: CONFIG.costGrowth, generators: {}, upgrades: {} };
  for (const g of CONFIG.generators) patch.generators[g.id] = { baseCost: g.baseCost, baseRate: g.baseRate };
  for (const u of CONFIG.upgrades) {
    patch.upgrades[u.id] = u.effect.kind === "costGrowth"
      ? { cost: u.cost, delta: u.effect.delta }
      : { cost: u.cost, mult: u.effect.mult };
  }
  return patch;
}

// ---------- Scoring ----------

function evaluate(patch) {
  const r = runProfile(REFERENCE, {
    seconds: RUN_SECONDS, step: 1, wallSeconds: TARGETS.maxGap,
    patch: patch ? (c) => applyPatch(c, patch) : undefined,
  });

  const mutationTimes = r.firsts.filter((f) => f.type === "upgrade").map((f) => f.time);
  const tens = r.ownedCounts.filter((o) => o.count === 10).map((o) => o.time);
  const done = mutationTimes.length === r.final.upgradesTotal && tens.length === r.final.owned.length;
  const T = done ? Math.max(...mutationTimes, ...tens) : null;
  const end = T ?? RUN_SECONDS;

  // Only first-time purchases count: they are the new things to unlock, so they
  // set the pacing. Repeat host purchases are filler between them.
  const firsts = r.firsts.filter((f) => f.time <= end);
  const intervals = firsts.map((f, i) => f.time - (i === 0 ? 0 : firsts[i - 1].time));
  // The stretch from the last first buy to T (finishing 10 of each host) counts too.
  const tail = T !== null && firsts.length > 0 ? T - firsts[firsts.length - 1].time : 0;
  const maxGap = Math.max(0, tail, ...intervals);

  // First buys made at the same moment are one shop visit.
  const visits = [...new Set(firsts.map((f) => f.time))];
  let quick = 0;
  for (let i = 1; i < visits.length; i++) {
    if (visits[i] - visits[i - 1] < TARGETS.quickGap) quick++;
  }
  const quickShare = visits.length > 1 ? quick / (visits.length - 1) : 0;

  const pass = {
    T: T !== null && T >= TARGETS.minT && T <= TARGETS.maxT,
    gap: maxGap <= TARGETS.maxGap,
    quick: quickShare <= TARGETS.maxQuickShare,
  };

  // Lower is better. Weights follow the priorities: T, then gaps, then quick first
  // buys. A flat cost per failed target stops the search from trading a FAIL on a
  // higher priority for gains on a lower one.
  let score = 40 * !pass.T + 30 * !pass.gap + 15 * !pass.quick;
  const goals = r.final.upgradesTotal + r.final.owned.length;
  if (!done) score += 1000 + 50 * (goals - mutationTimes.length - tens.length);
  if (end < TARGETS.minT) score += ((TARGETS.minT - end) / 30) ** 2;
  if (end > TARGETS.maxT) score += ((end - TARGETS.maxT) / 30) ** 2;
  score += 2 * Math.max(0, maxGap - (TARGETS.maxGap - 10));
  score += 2 * quick;

  return { r, T, done, visits: visits.length, maxGap, tail, quick, quickShare, firsts, intervals, pass, score };
}

// ---------- Report ----------

function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${String(sec).padStart(2, "0")}s` : `${sec}s`;
}

function report(e) {
  const mark = (ok) => (ok ? "PASS" : "FAIL");
  const out = [];
  out.push("Scorecard: Active greedyPayback");
  out.push(`  ${mark(e.pass.T)}  T (all Mutations + 10 of each host): ${e.T === null ? `not reached in ${fmt(RUN_SECONDS)}` : fmt(e.T)}  (target ${fmt(TARGETS.minT)} - ${fmt(TARGETS.maxT)})`);
  out.push(`  ${mark(e.pass.gap)}  Longest stretch without a first buy before T: ${fmt(e.maxGap)}  (max ${fmt(TARGETS.maxGap)})`);
  out.push(`  ${mark(e.pass.quick)}  First buys < ${TARGETS.quickGap}s after the previous: ${e.quick} of ${e.visits - 1} (${Math.round(e.quickShare * 100)}%, max ${Math.round(TARGETS.maxQuickShare * 100)}%)`);
  out.push(`  Score ${e.score.toFixed(1)} (lower is better)`);
  out.push("", "  First buys          time      since previous");
  for (let i = 0; i < e.firsts.length; i++) {
    const f = e.firsts[i];
    out.push(`  ${f.name.padEnd(20)}${fmt(f.time).padStart(7)}   ${fmt(e.intervals[i]).padStart(7)}`);
  }
  if (e.T !== null) out.push(`  ${"T".padEnd(20)}${fmt(e.T).padStart(7)}   ${fmt(e.tail).padStart(7)}`);
  console.log(out.join("\n"));
}

// ---------- Search ----------

// Config rules a candidate must keep (tools/tests/config-integrity.test.js checks
// the same on config.js): host base cost and rate rise strictly with each tier,
// Mutation costs rise strictly in list order, and a per-host Mutation never costs
// less than its host's base cost.
function followsRules(patch, CONFIG) {
  const rising = (xs) => xs.every((x, i) => i === 0 || x > xs[i - 1]);
  if (!rising(CONFIG.generators.map((g) => patch.generators[g.id].baseCost))) return false;
  if (!rising(CONFIG.generators.map((g) => patch.generators[g.id].baseRate))) return false;
  if (!rising(CONFIG.upgrades.map((u) => patch.upgrades[u.id].cost))) return false;
  for (const u of CONFIG.upgrades) {
    const target = u.effect.targetId;
    if (target !== undefined && patch.upgrades[u.id].cost < patch.generators[target].baseCost) return false;
  }
  return true;
}

const nearest = (choices, x) => choices.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));

function applyFixedGenerators(patch) {
  for (const [id, fixed] of Object.entries(SEARCH.fixedGenerators)) Object.assign(patch.generators[id], fixed);
}

// Does every host's rate clear SEARCH.minRateStep times the previous host's?
function meetsRateStep(patch, CONFIG) {
  const rates = CONFIG.generators.map((g) => patch.generators[g.id].baseRate);
  return rates.every((r, i) => i === 0 || r >= SEARCH.minRateStep * rates[i - 1]);
}

// Smallest baseRate ratio between neighbouring host tiers.
function minRateRatio(patch, CONFIG) {
  const rates = CONFIG.generators.map((g) => patch.generators[g.id].baseRate);
  return Math.min(...rates.slice(1).map((r, i) => r / rates[i]));
}

// Ranking for the search: score, then the SEARCH tiebreaks. Negative if candidate
// a is better than b, 0 if they tie.
function rank(a, b) {
  if (Math.abs(a.e.score - b.e.score) > 1e-9) return a.e.score - b.e.score;
  const step = SEARCH.tiebreakCostGrowthStep;
  const growth = Math.round(a.patch.costGrowth / step) - Math.round(b.patch.costGrowth / step);
  if (growth !== 0) return growth;
  const gap = b.ratio - a.ratio;
  return Math.abs(gap) > 1e-9 ? gap : 0;
}

// Snap a patch onto the SEARCH rules: fixed host stats, each group shares one
// allowed multiplier (the first member's, rounded to the nearest choice),
// costGrowth is in range, and rates are raised to clear the minimum step.
function snapToSearchRules(patch, CONFIG) {
  const [lo, hi] = SEARCH.costGrowth;
  patch.costGrowth = Math.min(hi, Math.max(lo, patch.costGrowth));
  for (const { ids, choices } of SEARCH.multGroups) {
    const m = nearest(choices, patch.upgrades[ids[0]].mult);
    for (const id of ids) patch.upgrades[id].mult = m;
  }
  applyFixedGenerators(patch);
  for (let i = 1; i < CONFIG.generators.length; i++) {
    const prev = patch.generators[CONFIG.generators[i - 1].id];
    const cur = patch.generators[CONFIG.generators[i].id];
    cur.baseRate = Math.max(cur.baseRate, SEARCH.minRateStep * prev.baseRate);
  }
}

// Hill-climb: nudge 1-3 random levers, keep the change unless it ranks worse
// (see rank()). Candidates must follow the config rules and the SEARCH limits.
// Costs, rates and costGrowth move by up to SEARCH.maxNudge (in log space);
// grouped multipliers jump to another allowed choice. Each try takes about a second.
function search(startPatch, minutes, CONFIG) {
  snapToSearchRules(startPatch, CONFIG);
  if (!followsRules(startPatch, CONFIG)) {
    console.error("warning: the starting config breaks the config rules once snapped to SEARCH; few candidates may be accepted");
  }
  const candidate = (patch) => ({ patch, e: evaluate(patch), ratio: minRateRatio(patch, CONFIG) });
  let best = candidate(startPatch);
  console.error(`start score ${best.e.score.toFixed(1)}, costGrowth ${best.patch.costGrowth.toFixed(3)}, rate step ${best.ratio.toFixed(2)}`);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const nudge = () => Math.exp((Math.random() * 2 - 1) * SEARCH.maxNudge);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const genIds = Object.keys(best.patch.generators);
  const upgIds = Object.keys(best.patch.upgrades);
  // Mutations outside every group and not fixed keep a free multiplier (or delta).
  const grouped = new Set(SEARCH.multGroups.flatMap((g) => g.ids));
  const freeEffects = upgIds.filter((id) => !grouped.has(id) && !SEARCH.fixedEffects.includes(id));
  const [growthLo, growthHi] = SEARCH.costGrowth;
  const clamp = (x, [lo, hi]) => Math.min(hi, Math.max(lo, x));
  const { boost, cut, delta } = SEARCH.freeEffects;

  const stop = Date.now() + minutes * 60 * 1000;
  let tries = 0;
  while (Date.now() < stop) {
    tries++;
    const cand = clone(best.patch);
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const lever = Math.floor(Math.random() * 6);
      if (lever === 0) { const g = cand.generators[pick(genIds)]; g.baseCost = Math.max(SEARCH.minBaseCost, g.baseCost * nudge()); }
      else if (lever === 1) { const g = cand.generators[pick(genIds)]; g.baseRate *= nudge(); }
      else if (lever === 2) { const u = cand.upgrades[pick(upgIds)]; u.cost *= nudge(); }
      else if (lever === 3) {
        const { ids, choices } = pick(SEARCH.multGroups);
        const m = pick(choices);
        for (const id of ids) cand.upgrades[id].mult = m;
      } else if (lever === 4 && freeEffects.length > 0) {
        const u = cand.upgrades[pick(freeEffects)];
        if (u.delta !== undefined) u.delta = clamp(u.delta * nudge(), delta);
        else if (u.mult < 1) u.mult = clamp(u.mult * nudge(), cut);
        else u.mult = clamp(1 + (u.mult - 1) * nudge(), boost);
      } else cand.costGrowth = clamp(1 + (cand.costGrowth - 1) * nudge(), [growthLo, growthHi]);
    }
    applyFixedGenerators(cand);
    if (!followsRules(cand, CONFIG) || !meetsRateStep(cand, CONFIG)) continue;
    const c = candidate(cand);
    const order = rank(c, best);
    if (order <= 0) {
      if (order < 0) {
        const { e } = c;
        console.error(`try ${tries}: score ${e.score.toFixed(1)}, costGrowth ${cand.costGrowth.toFixed(3)}, rate step ${c.ratio.toFixed(2)}, T ${e.T === null ? "-" : fmt(e.T)}, gap ${fmt(e.maxGap)}, quick ${e.quick}`);
      }
      best = c;
    }
  }
  console.error(`${tries} tries`);
  return best;
}

// ---------- CLI ----------

function main() {
  const args = process.argv.slice(2);
  let patch = null;
  let doSearch = false;
  let minutes = 5;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--patch") patch = JSON.parse(fs.readFileSync(args[++i], "utf8"));
    else if (args[i] === "--search") doSearch = true;
    else if (args[i] === "--minutes") minutes = Number(args[++i]);
    else { console.error(`Unknown argument "${args[i]}". Options: --patch file.json, --search, --minutes N`); process.exit(1); }
  }

  if (!doSearch) {
    report(evaluate(patch));
    return;
  }
  const CONFIG = loadLogic({ patch: patch ? (c) => applyPatch(c, patch) : undefined }).CONFIG;
  const { patch: best, e } = search(patchFromConfig(CONFIG), minutes, CONFIG);
  report(e);
  console.log("\nBest patch (numbers are unrounded; round before copying into config.js):");
  console.log(JSON.stringify(best, null, 2));
}

if (require.main === module) main();

module.exports = { evaluate, applyPatch, patchFromConfig, followsRules, TARGETS, SEARCH };
