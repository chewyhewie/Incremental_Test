// Save/load: round trip, the v1 -> v2 migration, offline progress, reset.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGame } = require("./helpers/load-game.js");

// A genuine pre-change v1 save: upgrades were bare booleans and only three
// generators existed. Kept as a literal so the migration stays covered even
// after the current shape moves on again.
const V1_SAVE = {
  version: 1,
  lastSaved: 1_700_000_000_000,
  virions: "12345",
  generators: {
    ecoli: { owned: 7, unlocked: true },
    salmonella: { owned: 2, unlocked: true },
    cholerae: { owned: 0, unlocked: false },
  },
  upgrades: { rapidTranscription: true, rapidTranslation: false, hostShutdown: true },
};

const encodeV1 = (g, data = V1_SAVE) => g.fn.btoa(JSON.stringify(data));

// ---------------------------------------------------------------------------
// Round trip
// ---------------------------------------------------------------------------

test("a save round trips through encode/decode unchanged", () => {
  const g = loadGame();
  g.reset(4321);
  g.state.generators.ecoli.owned = 12;
  g.state.generators.listeria.owned = 3;
  g.fn.checkUnlocks();
  g.fn.buyUpgrade("rapidTranscription");

  const restored = g.fn.decodeSave(g.fn.encodeSave(g.state));
  assert.equal(restored.virions.toString(), g.state.virions.toString());
  assert.equal(restored.generators.ecoli.owned, 12);
  assert.equal(restored.generators.listeria.owned, 3);
  assert.equal(restored.upgrades.rapidTranscription.owned, true);
  assert.equal(restored.upgrades.rapidTranscription.unlocked, true);
  assert.equal(restored.upgrades.serialPassage.owned, false);
});

test("very large virion counts survive the round trip exactly", () => {
  const g = loadGame();
  g.reset();
  g.state.virions = new g.Decimal("1.2345e300");
  const restored = g.fn.decodeSave(g.fn.encodeSave(g.state));
  assert.equal(restored.virions.toString(), "1.2345e+300");
  assert.ok(restored.virions instanceof g.Decimal);
});

test("Decimals are stored as strings, and the version is stamped", () => {
  const g = loadGame();
  g.reset(500);
  const raw = JSON.parse(g.fn.atob(g.fn.encodeSave(g.state)));
  assert.equal(typeof raw.virions, "string", "virions serialized as a string");
  assert.equal(raw.version, g.CONFIG.saveVersion);
  assert.equal(typeof raw.lastSaved, "number");
});

test("unlocked flags survive so revealed rows stay revealed across a reload", () => {
  const g = loadGame();
  g.reset(200000);
  g.fn.checkUnlocks();
  const revealedGens = g.CONFIG.generators.filter((x) => g.state.generators[x.id].unlocked).length;
  const revealedUpgs = g.CONFIG.upgrades.filter((u) => g.state.upgrades[u.id].unlocked).length;
  assert.ok(revealedGens > 0 && revealedUpgs > 0, "something was revealed");

  const restored = g.fn.decodeSave(g.fn.encodeSave(g.state));
  assert.equal(g.CONFIG.generators.filter((x) => restored.generators[x.id].unlocked).length, revealedGens);
  assert.equal(g.CONFIG.upgrades.filter((u) => restored.upgrades[u.id].unlocked).length, revealedUpgs);
});

// ---------------------------------------------------------------------------
// v1 -> v2 migration
// ---------------------------------------------------------------------------

test("a v1 save loads without throwing", () => {
  const g = loadGame();
  assert.doesNotThrow(() => g.fn.decodeSave(encodeV1(g)));
});

test("v1 boolean upgrades become { owned, unlocked }, acquired implying revealed", () => {
  const g = loadGame();
  const s = g.fn.decodeSave(encodeV1(g));
  assert.deepEqual(g.plain(s.upgrades.rapidTranscription), { owned: true, unlocked: true });
  assert.deepEqual(g.plain(s.upgrades.rapidTranslation), { owned: false, unlocked: false });
  assert.deepEqual(g.plain(s.upgrades.hostShutdown), { owned: true, unlocked: true });
});

test("a v1 save keeps its virions and owned counts", () => {
  const g = loadGame();
  const s = g.fn.decodeSave(encodeV1(g));
  assert.equal(s.virions.toString(), "12345");
  assert.equal(s.generators.ecoli.owned, 7);
  assert.equal(s.generators.salmonella.owned, 2);
  assert.equal(s.generators.ecoli.unlocked, true);
});

test("hosts and Mutations added after a v1 save default to empty", () => {
  const g = loadGame();
  const s = g.fn.decodeSave(encodeV1(g));
  for (const id of ["listeria", "meningitidis"]) {
    assert.deepEqual(g.plain(s.generators[id]), { owned: 0, unlocked: false }, id);
  }
  for (const id of ["plasmidLibrary", "nutrientBroth", "serialPassage"]) {
    assert.deepEqual(g.plain(s.upgrades[id]), { owned: false, unlocked: false }, id);
  }
});

test("a Mutation acquired under v1 still takes effect after migrating", () => {
  const g = loadGame();
  g.state = g.fn.decodeSave(encodeV1(g)); // has hostShutdown (Class I cost x0.5)
  const withMutation = g.num(g.fn.getGeneratorCost("ecoli"));
  g.state.upgrades.hostShutdown.owned = false;
  const without = g.num(g.fn.getGeneratorCost("ecoli"));
  assert.ok(withMutation < without, `${withMutation} < ${without}`);
});

test("migration is idempotent: a migrated save re-encodes at the current version", () => {
  const g = loadGame();
  const once = g.fn.decodeSave(encodeV1(g));
  const twice = g.fn.decodeSave(g.fn.encodeSave(once));
  assert.deepEqual(g.plain(twice.upgrades.rapidTranscription), { owned: true, unlocked: true });
  assert.equal(twice.generators.ecoli.owned, 7);
});

// ---------------------------------------------------------------------------
// Rejecting bad input
// ---------------------------------------------------------------------------

test("a save from a newer version is refused", () => {
  const g = loadGame();
  const future = g.fn.btoa(JSON.stringify({
    version: g.CONFIG.saveVersion + 1, virions: "1", generators: {}, upgrades: {},
  }));
  assert.throws(() => g.fn.decodeSave(future), /newer version/i);
});

test("garbage input is refused rather than silently accepted", () => {
  const g = loadGame();
  for (const bad of ["not base64 at all!!", g.fn.btoa("{not json"), g.fn.btoa("null"), g.fn.btoa('"a string"')]) {
    assert.throws(() => g.fn.decodeSave(bad), `rejects ${bad.slice(0, 20)}`);
  }
});

// Build a save whose only oddity is the virion count.
const withVirions = (g, virions) => g.fn.btoa(JSON.stringify({
  version: g.CONFIG.saveVersion, lastSaved: Date.now(),
  virions, generators: {}, upgrades: {},
}));

test("a save with an unparseable virion count is refused", () => {
  const g = loadGame();
  // The rejection comes out of break_infinity's own parser here. Note it is
  // lenient about trailing junk ("12abc" parses as 12), so only inputs with no
  // leading number at all throw.
  for (const bad of ["banana", "", "  "]) {
    assert.throws(() => g.fn.decodeSave(withVirions(g, bad)), `rejects ${JSON.stringify(bad)}`);
  }
});

test("a save with NaN virions is refused", () => {
  const g = loadGame();
  assert.throws(() => g.fn.decodeSave(withVirions(g, "NaN")), /invalid virions/i);
});

test("a save with infinite virions is refused", () => {
  // break_infinity encodes Infinity as a finite mantissa with a sentinel
  // exponent, so this slips past a naive isFinite check on the mantissa alone.
  const g = loadGame();
  for (const bad of ["Infinity", "-Infinity"]) {
    assert.throws(() => g.fn.decodeSave(withVirions(g, bad)), /invalid virions/i,
      `rejects ${bad}`);
  }
});

test("an enormous but finite virion count is still accepted", () => {
  // The point of break_infinity: 1e999999 is legitimate progress, not corruption.
  const g = loadGame();
  const s = g.fn.decodeSave(withVirions(g, "1e999999"));
  assert.equal(s.virions.toString(), "1e+999999");
});

test("a negative virion count loads without crashing", () => {
  const g = loadGame();
  const s = g.fn.decodeSave(withVirions(g, "-5"));
  assert.equal(g.num(s.virions), -5, "not rejected, but nothing is affordable");
  g.state = s;
  assert.equal(g.fn.canAfford(new g.Decimal(1)), false);
});

test("owned counts are clamped to non-negative integers", () => {
  const g = loadGame();
  const odd = g.fn.btoa(JSON.stringify({
    version: g.CONFIG.saveVersion,
    lastSaved: Date.now(),
    virions: "100",
    generators: {
      ecoli: { owned: -5, unlocked: true },
      salmonella: { owned: 3.7, unlocked: true },
      cholerae: { owned: "12", unlocked: true },
      listeria: { owned: "abc", unlocked: true },
    },
    upgrades: {},
  }));
  const s = g.fn.decodeSave(odd);
  assert.equal(s.generators.ecoli.owned, 0, "negative clamped to 0");
  assert.equal(s.generators.salmonella.owned, 3, "fraction floored");
  assert.equal(s.generators.cholerae.owned, 12, "numeric string coerced");
  assert.equal(s.generators.listeria.owned, 0, "unparseable becomes 0");
});

test("a doctored save cannot hide a Mutation the player owns", () => {
  const g = loadGame();
  const doctored = g.fn.btoa(JSON.stringify({
    version: g.CONFIG.saveVersion,
    lastSaved: Date.now(),
    virions: "100",
    generators: {},
    upgrades: { hostShutdown: { owned: true, unlocked: false } },
  }));
  const s = g.fn.decodeSave(doctored);
  assert.equal(s.upgrades.hostShutdown.owned, true);
  assert.equal(s.upgrades.hostShutdown.unlocked, true, "owned forces unlocked");
});

// ---------------------------------------------------------------------------
// localStorage paths
// ---------------------------------------------------------------------------

test("loadGame returns null when there is no save", () => {
  const g = loadGame();
  assert.equal(g.fn.loadGame(), null);
});

test("loadGame returns null on a corrupt save instead of throwing", () => {
  const g = loadGame();
  g.localStorage.setItem(g.CONFIG.saveKey, "this is not a save");
  assert.equal(g.fn.loadGame(), null);
});

test("saveGame then loadGame restores the same progress", () => {
  const g = loadGame();
  g.reset(777);
  g.state.generators.salmonella.owned = 5;
  g.fn.saveGame();
  const loaded = g.fn.loadGame();
  assert.equal(loaded.generators.salmonella.owned, 5);
  assert.equal(g.num(loaded.virions), 777);
});

test("exportSave produces text importSave accepts", () => {
  const g = loadGame();
  g.reset(2500);
  g.state.generators.cholerae.owned = 4;
  const text = g.fn.exportSave();

  const h = loadGame(); // a different session
  h.reset(0);
  h.fn.importSave(text);
  assert.equal(h.state.generators.cholerae.owned, 4);
  assert.ok(h.num(h.state.virions) >= 2500);
});

test("importSave tolerates surrounding whitespace, as pasted text often has", () => {
  const g = loadGame();
  g.reset(120);
  const text = `\n  ${g.fn.encodeSave(g.state)}  \n`;
  const h = loadGame();
  h.reset(0);
  assert.doesNotThrow(() => h.fn.importSave(text));
  assert.ok(h.num(h.state.virions) >= 120);
});

test("hardReset wipes progress and recomputes what should be visible", () => {
  const g = loadGame();
  g.reset(1e6);
  g.state.generators.ecoli.owned = 50;
  g.fn.checkUnlocks();
  g.fn.saveGame();

  g.fn.hardReset();
  assert.equal(g.state.generators.ecoli.owned, 0);
  assert.equal(g.num(g.state.virions), g.CONFIG.startingVirions);
  // startingVirions is 10, and E. coli appears at 5.
  assert.equal(g.state.generators.ecoli.unlocked, true, "E. coli visible immediately");
  assert.equal(g.state.generators.listeria.unlocked, false);
});

// ---------------------------------------------------------------------------
// Offline progress
// ---------------------------------------------------------------------------

test("offline progress is production x seconds away", () => {
  const g = loadGame();
  g.reset(0);
  g.state.generators.ecoli.owned = 10;
  const perSec = g.num(g.fn.getTotalPerSec());
  g.state.lastSaved = Date.now() - 60 * 1000;
  const result = g.fn.applyOfflineProgress();
  assert.ok(result, "a 60s gap is reported");
  assert.ok(Math.abs(result.seconds - 60) < 2, `seconds ~= 60, got ${result.seconds}`);
  const expected = perSec * result.seconds;
  assert.ok(Math.abs(g.num(result.gained) - expected) < 1e-6 * expected, `gained ~= ${expected}, got ${g.num(result.gained)}`);
  assert.equal(result.capped, false);
});

test("offline progress is capped, and says so", () => {
  const g = loadGame();
  g.reset(0);
  g.state.generators.ecoli.owned = 1;
  g.state.lastSaved = Date.now() - 48 * 3600 * 1000; // two days
  const result = g.fn.applyOfflineProgress();
  assert.equal(result.seconds, g.CONFIG.offlineCapSeconds);
  assert.equal(result.capped, true);
  const perSec = g.num(g.fn.getTotalPerSec());
  assert.equal(g.num(result.gained), perSec * g.CONFIG.offlineCapSeconds, "rate x the capped window");
});

test("a gap shorter than minOfflineSeconds is not reported", () => {
  const g = loadGame();
  g.reset(0);
  g.state.generators.ecoli.owned = 10;
  g.state.lastSaved = Date.now() - 1000; // 1s
  assert.equal(g.fn.applyOfflineProgress(), null);
  assert.equal(g.num(g.state.virions), 0, "and grants nothing");
});

test("offline progress reveals anything the new total affords", () => {
  const g = loadGame();
  g.reset(0);
  g.state.generators.ecoli.owned = 100;
  g.state.lastSaved = Date.now() - 60 * 1000; // enough to pass V. cholerae's threshold
  g.fn.applyOfflineProgress();
  assert.equal(g.state.generators.cholerae.unlocked, true, "cholerae revealed");
});
