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
//     "upgrades": { "rapidTranscription": { "cost": 80, "mult": 1.75 },
//                   "streamlinedGenome": { "delta": -0.01 } } }

const fs = require("node:fs");
const { runProfile } = require("./sim.js");
const { loadLogic } = require("./load-logic.js");

// Pacing targets. Tool-side goals, not game balance, so they live here rather than
// in config.js.
const TARGETS = {
  minT: 15 * 60,          // T between 15...
  maxT: 20 * 60,          // ...and 20 minutes
  maxGap: 3 * 60,         // no purchase-free stretch longer than this before T
  quickGap: 5,            // a purchase this soon after the previous one is "quick"
  maxQuickShare: 0.3,     // at most this share of purchases before T may be quick
  maxSpacing: 2,          // no first-buy interval longer than 2x the even spacing
};

const REFERENCE = { name: "Active", strategy: "greedyPayback", checkEvery: 1 };
const RUN_SECONDS = 30 * 60;

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

  const times = r.purchaseTimes.filter((t) => t <= end);
  const gaps = [];
  let prev = 0;
  for (const t of times) { gaps.push(t - prev); prev = t; }
  const maxGap = Math.max(0, ...gaps);
  const quick = gaps.slice(1).filter((x) => x < TARGETS.quickGap).length;
  const quickShare = times.length > 1 ? quick / (times.length - 1) : 0;

  const firsts = r.firsts.filter((f) => f.time <= end);
  const even = end / firsts.length;
  const intervals = firsts.map((f, i) => f.time - (i === 0 ? 0 : firsts[i - 1].time));
  const maxSpacing = Math.max(...intervals) / even;
  let unevenness = 0;
  for (const iv of intervals) unevenness += ((iv - even) / even) ** 2;

  const pass = {
    T: T !== null && T >= TARGETS.minT && T <= TARGETS.maxT,
    gap: maxGap <= TARGETS.maxGap,
    quick: quickShare <= TARGETS.maxQuickShare,
    spacing: maxSpacing <= TARGETS.maxSpacing,
  };

  // Lower is better. Weights follow the priorities: T, then walls, then quick
  // purchases, then spacing. A flat cost per failed target stops the search from
  // trading a FAIL on a higher priority for gains on a lower one.
  let score = 40 * !pass.T + 30 * !pass.gap + 15 * !pass.quick + 10 * !pass.spacing;
  if (!done) score += 1000 + 50 * (16 - mutationTimes.length - tens.length);
  if (end < TARGETS.minT) score += ((TARGETS.minT - end) / 30) ** 2;
  if (end > TARGETS.maxT) score += ((end - TARGETS.maxT) / 30) ** 2;
  score += 2 * Math.max(0, maxGap - (TARGETS.maxGap - 10));
  score += 2 * quick;
  score += unevenness;

  return { r, T, done, purchases: times.length, maxGap, quick, quickShare, firsts, intervals, even, maxSpacing, pass, score };
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
  out.push(`  ${mark(e.pass.gap)}  Longest gap before T: ${fmt(e.maxGap)}  (max ${fmt(TARGETS.maxGap)})`);
  out.push(`  ${mark(e.pass.quick)}  Purchases < ${TARGETS.quickGap}s after the previous: ${e.quick} of ${e.purchases - 1} (${Math.round(e.quickShare * 100)}%, max ${Math.round(TARGETS.maxQuickShare * 100)}%)`);
  out.push(`  ${mark(e.pass.spacing)}  Longest first-buy interval: ${e.maxSpacing.toFixed(2)}x the even spacing of ${fmt(e.even)}  (max ${TARGETS.maxSpacing}x)`);
  out.push(`  Score ${e.score.toFixed(1)} (lower is better)`);
  out.push("", "  First buys          time      since previous");
  for (let i = 0; i < e.firsts.length; i++) {
    const f = e.firsts[i];
    out.push(`  ${f.name.padEnd(20)}${fmt(f.time).padStart(7)}   ${fmt(e.intervals[i]).padStart(7)}`);
  }
  console.log(out.join("\n"));
}

// ---------- Search ----------

// Hill-climb: nudge 1-3 random levers by up to +-35% (in log space), keep the
// change if the score improves. Crude, but each run takes ~0.3s.
function search(startPatch, minutes) {
  let best = startPatch;
  let bestEval = evaluate(best);
  console.error(`start score ${bestEval.score.toFixed(1)}`);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const nudge = () => Math.exp((Math.random() * 2 - 1) * 0.35);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const genIds = Object.keys(best.generators);
  const upgIds = Object.keys(best.upgrades);

  const stop = Date.now() + minutes * 60 * 1000;
  let tries = 0;
  while (Date.now() < stop) {
    tries++;
    const cand = clone(best);
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const lever = Math.floor(Math.random() * 5);
      if (lever === 0) { const g = cand.generators[pick(genIds)]; g.baseCost = Math.max(1, g.baseCost * nudge()); }
      else if (lever === 1) { const g = cand.generators[pick(genIds)]; g.baseRate *= nudge(); }
      else if (lever === 2) { const u = cand.upgrades[pick(upgIds)]; u.cost *= nudge(); }
      else if (lever === 3) {
        const u = cand.upgrades[pick(upgIds)];
        if (u.delta !== undefined) u.delta = Math.min(-0.005, Math.max(-0.06, u.delta * nudge()));
        else if (u.mult < 1) u.mult = Math.min(0.9, Math.max(0.3, u.mult * nudge()));
        else u.mult = Math.max(1.05, 1 + (u.mult - 1) * nudge());
      } else cand.costGrowth = Math.min(1.3, Math.max(1.07, 1 + (cand.costGrowth - 1) * nudge()));
    }
    const e = evaluate(cand);
    if (e.score < bestEval.score) {
      best = cand;
      bestEval = e;
      console.error(`try ${tries}: score ${e.score.toFixed(1)}, T ${e.T === null ? "-" : fmt(e.T)}, gap ${fmt(e.maxGap)}, quick ${e.quick}`);
    }
  }
  console.error(`${tries} tries`);
  return { patch: best, e: bestEval };
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
  const { patch: best, e } = search(patchFromConfig(CONFIG), minutes);
  report(e);
  console.log("\nBest patch (numbers are unrounded; round before copying into config.js):");
  console.log(JSON.stringify(best, null, 2));
}

if (require.main === module) main();

module.exports = { evaluate, applyPatch, patchFromConfig, TARGETS };
