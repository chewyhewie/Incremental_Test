// Balance simulator: plays the real game economy at high speed and reports when
// things happen. Report only; it never changes config.js.
//
//   npm run sim
//   npm run sim -- --hours 8 --step 0.5 --idle-minutes 30 --wall-minutes 5
//
// Offline progress is deliberately not simulated.

const fs = require("node:fs");
const path = require("node:path");
const { loadLogic } = require("./load-logic.js");
const { STRATEGIES } = require("./strategies.js");

// Every strategy is run under every playstyle.
// checkEvery: seconds of game time between visits to the shop.
const PLAYSTYLES = [
  { name: "Active", checkEvery: 1 },
  { name: "Idle", checkEvery: 60 },
];
const STRATEGY_ORDER = ["greedyPayback", "cheapestFirst"];

const DEFAULTS = { hours: 4, step: 1, idleMinutes: 1, wallMinutes: 10 };

const RESULTS_DIR = path.join(__dirname, "results");

// ---------- Simulation ----------

/**
 * Run one profile from a fresh save.
 * @returns {{ profile, purchases, purchaseTimes, firsts, ownedCounts, milestones, walls, final, realMs }}
 */
function runProfile(profile, { seconds, step, wallSeconds, patch }) {
  const started = Date.now();
  const strategy = STRATEGIES[profile.strategy];
  if (!strategy) throw new Error(`Unknown strategy "${profile.strategy}"`);

  const g = loadLogic({ patch });
  g.reset();
  const { fn, CONFIG, Decimal } = g;

  const itemName = {};
  for (const x of CONFIG.generators) itemName[x.id] = x.name;
  for (const x of CONFIG.upgrades) itemName[x.id] = x.name;

  let t = 0;
  const purchaseTimes = [];
  const firsts = [];        // first purchase of each item, in order
  const ownedCounts = [];   // when each host's owned count reaches 1, 10, 100...
  const seen = new Set();
  g.onBuy = (c) => {
    purchaseTimes.push(t);
    if (c.type === "generator") {
      const owned = g.state.generators[c.id].owned;
      if (isPowerOf10(owned)) ownedCounts.push({ time: t, id: c.id, name: itemName[c.id], count: owned });
    }
    if (seen.has(c.id)) return;
    seen.add(c.id);
    firsts.push({ time: t, type: c.type, id: c.id, name: itemName[c.id], cost: c.cost });
  };

  // Milestones on total virions PRODUCED (starting virions don't count), so the
  // numbers track the economy's pace rather than how much was just spent.
  let produced = new Decimal(0);
  let nextPow = 1;
  const milestones = [];

  let nextCheck = 0;
  // Small epsilon so fractional steps don't skip the final step or a check-in.
  const eps = step * 1e-6;
  while (t < seconds - eps) {
    if (t >= nextCheck - eps) {
      strategy(g);
      nextCheck += profile.checkEvery;
    }
    produced = produced.plus(fn.getTotalPerSec().times(step));
    fn.update(step);
    t += step;
    while (produced.gte(Decimal.pow(10, nextPow))) {
      milestones.push({ time: t, pow: nextPow });
      nextPow += 1;
    }
  }

  // A wall is a stretch with no purchase. An idle player only shops every
  // checkEvery seconds, so their threshold is at least one visit interval.
  const threshold = Math.max(wallSeconds, profile.checkEvery);
  const walls = [];
  // Purchases always happen before the final step, so `seconds` marks the open end.
  let prev = 0;
  for (const p of [...purchaseTimes, seconds]) {
    if (p - prev > threshold + eps) {
      walls.push({ start: prev, end: p, duration: p - prev, open: p === seconds });
    }
    prev = p;
  }

  const state = g.state;
  return {
    profile,
    purchases: purchaseTimes.length,
    purchaseTimes,
    firsts,
    ownedCounts,
    milestones,
    walls,
    wallThreshold: threshold,
    final: {
      virions: state.virions,
      produced,
      perSec: fn.getTotalPerSec(),
      owned: CONFIG.generators.map((x) => [x.name, state.generators[x.id].owned]),
      upgradesOwned: CONFIG.upgrades.filter((x) => state.upgrades[x.id].owned).length,
      upgradesTotal: CONFIG.upgrades.length,
    },
    realMs: Date.now() - started,
  };
}

function isPowerOf10(n) {
  while (n >= 10 && n % 10 === 0) n /= 10;
  return n === 1;
}

// ---------- Formatting ----------

// Mirrors formatNumber in js/ui.js (not loaded here: ui.js is browser code).
function formatNumber(d) {
  if (d.lt(1e6)) return Math.floor(d.toNumber()).toLocaleString("en-US");
  const mantissa = Math.floor(d.mantissa * 100) / 100;
  return `${mantissa.toFixed(2)}e${d.exponent}`;
}

function formatTime(totalSeconds) {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (h > 0) return `${h}h ${pad(m)}m ${pad(sec)}s`;
  if (m > 0) return `${m}m ${pad(sec)}s`;
  return `${sec}s`;
}

function table(headers, rows, align) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const fmt = (r) => r.map((c, i) => (align[i] === "r" ? String(c).padStart(widths[i]) : String(c).padEnd(widths[i]))).join("  ");
  return [fmt(headers), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map(fmt)]
    .map((line) => "  " + line.trimEnd())
    .join("\n");
}

function printReport(r, seconds) {
  const { profile } = r;
  const out = [];
  const title = `${profile.name}: ${profile.strategy}, shops every ${formatTime(profile.checkEvery)}, ${formatTime(seconds)} of game time (ran in ${r.realMs} ms)`;
  out.push("", "=".repeat(title.length), title, "=".repeat(title.length));

  out.push("", "First purchases");
  out.push(table(
    ["Time", "Type", "Item", "Cost"],
    r.firsts.map((f) => [formatTime(f.time), f.type === "generator" ? "Host" : "Mutation", f.name, formatNumber(f.cost)]),
    ["r", "l", "l", "r"],
  ));

  out.push("", "Total virions produced");
  out.push(table(
    ["Reached", "Time"],
    r.milestones.map((m) => [`1e${m.pow}`, formatTime(m.time)]),
    ["r", "r"],
  ));

  out.push("", `Walls (no purchase for more than ${formatTime(r.wallThreshold)})`);
  if (r.walls.length === 0) out.push("  none");
  else {
    out.push(table(
      ["From", "To", "Length"],
      r.walls.map((w) => [formatTime(w.start), w.open ? "end of run" : formatTime(w.end), formatTime(w.duration)]),
      ["r", "r", "r"],
    ));
  }

  const f = r.final;
  out.push("", "At the end");
  out.push(`  ${formatNumber(f.virions)} virions, ${formatNumber(f.perSec)}/sec, ${formatNumber(f.produced)} produced, ${r.purchases} purchases`);
  out.push(`  Hosts: ${f.owned.map(([n, c]) => `${n} ${c}`).join(", ")}`);
  out.push(`  Mutations: ${f.upgradesOwned}/${f.upgradesTotal}`);
  console.log(out.join("\n"));
}

// One row per run, side by side. Milestone columns are the three highest powers of
// 10 any run reached, so the table follows the balance as it changes.
function printComparison(results) {
  const top = Math.max(...results.map((r) => r.milestones.at(-1)?.pow ?? 0));
  const pows = [top - 2, top - 1, top].filter((p) => p >= 1);
  const timeTo = (r, p) => {
    const m = r.milestones.find((x) => x.pow === p);
    return m ? formatTime(m.time) : "-";
  };
  const title = "Comparison";
  console.log(["", "=".repeat(title.length), title, "=".repeat(title.length)].join("\n"));
  console.log(table(
    ["Playstyle", "Strategy", ...pows.map((p) => `1e${p}`), "First wall", "Walls", "Final /sec", "Mutations"],
    results.map((r) => [
      r.profile.name,
      r.profile.strategy,
      ...pows.map((p) => timeTo(r, p)),
      r.walls.length ? formatTime(r.walls[0].start) : "none",
      r.walls.length,
      formatNumber(r.final.perSec),
      `${r.final.upgradesOwned}/${r.final.upgradesTotal}`,
    ]),
    ["l", "l", ...pows.map(() => "r"), "r", "r", "r", "r"],
  ));

  // Item-by-item timings, one column per run. "-" means it never happened.
  const CONFIG = loadLogic().CONFIG;
  const runCols = results.map((r) => `${r.profile.name} ${r.profile.strategy}`);
  const align = ["l", ...results.map(() => "r")];

  console.log("\nMutations bought");
  console.log(table(
    ["Mutation", ...runCols],
    CONFIG.upgrades.map((u) => [
      u.name,
      ...results.map((r) => {
        const f = r.firsts.find((x) => x.id === u.id);
        return f ? formatTime(f.time) : "-";
      }),
    ]),
    align,
  ));

  console.log("\nHosts owned");
  const rows = [];
  for (const gen of CONFIG.generators) {
    const counts = [...new Set(results.flatMap((r) => r.ownedCounts.filter((o) => o.id === gen.id).map((o) => o.count)))]
      .sort((a, b) => a - b);
    for (const count of counts) {
      rows.push([
        `${gen.name} ×${count}`,
        ...results.map((r) => {
          const o = r.ownedCounts.find((x) => x.id === gen.id && x.count === count);
          return o ? formatTime(o.time) : "-";
        }),
      ]);
    }
  }
  console.log(table(["Host", ...runCols], rows, align));
}

// ---------- CSV ----------

const CSV_HEADER = ["profile", "strategy", "event", "id", "name", "time_s", "time_fmt", "value", "duration_s"];

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRows(r) {
  const base = [r.profile.name, r.profile.strategy];
  const rows = [];
  for (const f of r.firsts) {
    rows.push([...base, `first_buy_${f.type}`, f.id, f.name, f.time, formatTime(f.time), f.cost.toString(), ""]);
  }
  for (const o of r.ownedCounts) {
    rows.push([...base, "owned_count", o.id, o.name, o.time, formatTime(o.time), o.count, ""]);
  }
  for (const m of r.milestones) {
    rows.push([...base, "virions_produced", `1e${m.pow}`, "", m.time, formatTime(m.time), `1e${m.pow}`, ""]);
  }
  for (const w of r.walls) {
    rows.push([...base, "wall_start", "", w.open ? "until end of run" : "", w.start, formatTime(w.start), "", w.duration]);
  }
  return rows;
}

function writeCsv(results) {
  const lines = [CSV_HEADER, ...results.flatMap(csvRows)].map((r) => r.map(csvCell).join(","));
  const text = lines.join("\n") + "\n";
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const file = path.join(RESULTS_DIR, `sim-${stamp}.csv`);
  fs.writeFileSync(file, text);
  fs.writeFileSync(path.join(RESULTS_DIR, "latest.csv"), text);
  return file;
}

// ---------- CLI ----------

function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  const keys = { "--hours": "hours", "--step": "step", "--idle-minutes": "idleMinutes", "--wall-minutes": "wallMinutes" };
  for (let i = 0; i < argv.length; i++) {
    const key = keys[argv[i]];
    const value = Number(argv[i + 1]);
    if (!key || !(value > 0)) {
      throw new Error(`Bad argument "${argv[i]} ${argv[i + 1] ?? ""}". Options: ${Object.keys(keys).join(", ")} (positive numbers)`);
    }
    opts[key] = value;
    i++;
  }
  return opts;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  const seconds = opts.hours * 3600;
  const settings = { seconds, step: opts.step, wallSeconds: opts.wallMinutes * 60 };
  const playstyles = PLAYSTYLES.map((p) => (p.name === "Idle" ? { ...p, checkEvery: opts.idleMinutes * 60 } : p));
  const profiles = STRATEGY_ORDER.flatMap((strategy) => playstyles.map((p) => ({ ...p, strategy })));

  const started = Date.now();
  const results = profiles.map((p) => runProfile(p, settings));
  for (const r of results) printReport(r, seconds);
  printComparison(results);

  const file = writeCsv(results);
  console.log(`\n${results.length} runs in ${((Date.now() - started) / 1000).toFixed(1)} s. CSV written to ${path.relative(process.cwd(), file)} (and latest.csv)`);
}

if (require.main === module) main();

module.exports = { runProfile, PLAYSTYLES, STRATEGY_ORDER, formatTime };
