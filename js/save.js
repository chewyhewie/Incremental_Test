// Saving, loading, offline progress, export/import, hard reset.
// Save format: base64(JSON), with Decimals stored as strings.

function serializeState(s) {
  return {
    version: CONFIG.saveVersion,
    lastSaved: s.lastSaved,
    virions: s.virions.toString(),
    generators: s.generators,
    upgrades: s.upgrades,
  };
}

// Builds a fresh state and copies in whatever valid fields the save has,
// so saves from older versions (missing new generators/upgrades) still load.
function deserializeState(data) {
  if (!data || typeof data !== "object") throw new Error("Save is not an object");
  data = migrateSave(data);

  const s = newState();
  const virions = new Decimal(data.virions);
  // NaN shows up as a non-finite mantissa, but break_infinity stores infinities
  // as a finite mantissa with a sentinel exponent, so check the magnitude too.
  if (!Number.isFinite(virions.mantissa) || virions.abs().gte(Decimal.MAX_VALUE)) {
    throw new Error("Invalid virions value");
  }
  s.virions = virions;
  s.lastSaved = Number.isFinite(data.lastSaved) ? data.lastSaved : Date.now();

  for (const id in s.generators) {
    const g = data.generators && data.generators[id];
    if (g) {
      s.generators[id].owned = Math.max(0, Math.floor(Number(g.owned) || 0));
      s.generators[id].unlocked = !!g.unlocked;
    }
  }
  for (const id in s.upgrades) {
    const u = data.upgrades && data.upgrades[id];
    if (u) {
      s.upgrades[id].owned = !!u.owned;
      // An owned upgrade is always revealed, so a doctored save can't hide one.
      s.upgrades[id].unlocked = !!u.unlocked || !!u.owned;
    }
  }
  return s;
}

// Upgrade old save data to the current version, one step at a time.
function migrateSave(data) {
  const version = Number(data.version) || 0;
  if (version > CONFIG.saveVersion) throw new Error("Save is from a newer version of the game");
  if (version < 2) {
    // v1 stored each upgrade as a bare "acquired" boolean; v2 stores
    // { owned, unlocked }. Anything already acquired counts as revealed.
    const upgrades = {};
    for (const id in data.upgrades || {}) {
      const owned = !!data.upgrades[id];
      upgrades[id] = { owned, unlocked: owned };
    }
    data.upgrades = upgrades;
    data.version = 2;
  }
  return data;
}

function encodeSave(s) {
  return btoa(JSON.stringify(serializeState(s)));
}

function decodeSave(text) {
  return deserializeState(JSON.parse(atob(text.trim())));
}

function saveGame() {
  if (!state) return;
  state.lastSaved = Date.now();
  try {
    localStorage.setItem(CONFIG.saveKey, encodeSave(state));
  } catch (e) {
    console.warn("Save failed:", e);
  }
}

// Returns a loaded state, or null if there is no usable save.
function loadGame() {
  try {
    const text = localStorage.getItem(CONFIG.saveKey);
    return text ? decodeSave(text) : null;
  } catch (e) {
    console.warn("Load failed, starting fresh:", e);
    return null;
  }
}

// Grants production for time since lastSaved (capped).
// Returns { seconds, gained } or null if the gap was too small to mention.
function applyOfflineProgress() {
  const away = (Date.now() - state.lastSaved) / 1000;
  const seconds = Math.min(away, CONFIG.offlineCapSeconds);
  if (!(seconds >= CONFIG.minOfflineSeconds)) return null;
  const gained = getTotalPerSec().times(seconds);
  state.virions = state.virions.plus(gained);
  checkUnlocks();
  return { seconds, gained, capped: away > CONFIG.offlineCapSeconds };
}

function exportSave() {
  saveGame();
  return encodeSave(state);
}

// Replaces the current state with an imported one. Throws on bad input.
function importSave(text) {
  const imported = decodeSave(text);
  state = imported;
  const offline = applyOfflineProgress();
  saveGame();
  return offline;
}

function hardReset() {
  try {
    localStorage.removeItem(CONFIG.saveKey);
  } catch (e) {
    console.warn("Could not clear save:", e);
  }
  state = newState();
  checkUnlocks();
  saveGame();
}
