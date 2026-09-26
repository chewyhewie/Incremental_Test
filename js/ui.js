// DOM construction (once) and render() (the only function that updates the screen).

// Transient, non-saved UI state (messages). Game state lives in `state`.
const uiState = {
  notice: null,          // "While you were away..." text, or null
  settingsMessage: "",
};

const els = {
  generators: {},
  upgrades: {},
};

// ---------- Formatting ----------

// Plain numbers below 1e6 (with separators), scientific like 1.23e6 above.
function formatNumber(value, decimals = 0) {
  const d = value instanceof Decimal ? value : new Decimal(value);
  if (d.lt(1e6)) {
    const n = d.toNumber();
    const shown = decimals === 0 ? Math.floor(n) : n;
    return shown.toLocaleString("en-US", { maximumFractionDigits: decimals });
  }
  // Floor the mantissa so 9.999e6 shows as 9.99e6, never 10.00e6.
  const mantissa = Math.floor(d.mantissa * 100) / 100;
  return `${mantissa.toFixed(2)}e${d.exponent}`;
}

function formatRate(value) {
  return formatNumber(value, 1);
}

function formatDuration(totalSeconds) {
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// ---------- Build ----------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Only touch the DOM when the text actually changes.
function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

function buildUI() {
  els.virions = document.getElementById("virions");
  els.perSec = document.getElementById("per-sec");
  els.notice = document.getElementById("notice");
  els.noticeText = document.getElementById("notice-text");
  els.settingsMessage = document.getElementById("settings-message");
  els.saveText = document.getElementById("save-text");

  const genList = document.getElementById("generator-list");
  for (const gen of CONFIG.generators) {
    const row = el("div", "card");
    const info = el("div", "card-info");
    const title = el("div", "card-title");
    title.append(el("span", "card-name", gen.name));
    const owned = el("span", "badge");
    title.append(owned);
    info.append(title, el("div", "card-desc", gen.description));
    const output = el("div", "card-stat");
    info.append(output);

    const button = el("button", "buy");
    button.type = "button";
    button.addEventListener("click", () => {
      if (buyGenerator(gen.id)) render();
    });

    row.append(info, button);
    genList.append(row);
    els.generators[gen.id] = { row, owned, output, button };
  }

  const upgList = document.getElementById("upgrade-list");
  for (const upg of CONFIG.upgrades) {
    const row = el("div", "card");
    const info = el("div", "card-info");
    info.append(el("div", "card-name", upg.name), el("div", "card-desc", upg.description));

    const button = el("button", "buy");
    button.type = "button";
    button.addEventListener("click", () => {
      if (buyUpgrade(upg.id)) render();
    });

    row.append(info, button);
    upgList.append(row);
    els.upgrades[upg.id] = { row, button };
  }

  document.getElementById("notice-dismiss").addEventListener("click", () => {
    uiState.notice = null;
    render();
  });

  document.getElementById("export-btn").addEventListener("click", onExport);
  document.getElementById("import-btn").addEventListener("click", onImport);
  document.getElementById("reset-btn").addEventListener("click", onHardReset);
}

// ---------- Settings handlers ----------

function onExport() {
  const text = exportSave();
  navigator.clipboard.writeText(text).then(
    () => { uiState.settingsMessage = "Save copied to clipboard."; render(); },
    () => {
      els.saveText.value = text;
      uiState.settingsMessage = "Clipboard unavailable. Your save is in the box below.";
      render();
    }
  );
}

function onImport() {
  const text = els.saveText.value;
  if (!text.trim()) {
    uiState.settingsMessage = "Paste a save into the box first.";
    render();
    return;
  }
  try {
    const offline = importSave(text);
    els.saveText.value = "";
    uiState.settingsMessage = "Save imported.";
    uiState.notice = offline ? offlineMessage(offline) : null;
  } catch (e) {
    uiState.settingsMessage = "That doesn't look like a valid save.";
  }
  render();
}

function onHardReset() {
  if (!confirm("Hard reset? This wipes ALL progress and cannot be undone.")) return;
  hardReset();
  uiState.notice = null;
  uiState.settingsMessage = "Progress wiped. Back to square one.";
  render();
}

function offlineMessage({ seconds, gained, capped }) {
  const capNote = capped ? " (capped at 8h)" : "";
  return `While you were away for ${formatDuration(seconds)}${capNote}, your hosts produced ${formatNumber(gained)} virions.`;
}

// ---------- Render ----------

function render() {
  setText(els.virions, formatNumber(state.virions));
  setText(els.perSec, `${formatRate(getTotalPerSec())} / sec`);

  for (const gen of CONFIG.generators) {
    const g = state.generators[gen.id];
    const e = els.generators[gen.id];
    e.row.hidden = !g.unlocked;
    if (!g.unlocked) continue;

    const cost = getGeneratorCost(gen.id);
    setText(e.owned, `×${g.owned}`);
    setText(
      e.output,
      `${formatRate(getGeneratorRate(gen.id))}/s each · ${formatRate(getGeneratorOutput(gen.id))}/s total`
    );
    setText(e.button, `Infect · ${formatNumber(cost)}`);
    e.button.disabled = !canAfford(cost);
  }

  for (const upg of CONFIG.upgrades) {
    const e = els.upgrades[upg.id];
    const owned = state.upgrades[upg.id];
    e.row.classList.toggle("owned", owned);
    setText(e.button, owned ? "Acquired" : `Mutate · ${formatNumber(upg.cost)}`);
    e.button.disabled = owned || !canAfford(new Decimal(upg.cost));
  }

  els.notice.hidden = !uiState.notice;
  if (uiState.notice) setText(els.noticeText, uiState.notice);
  setText(els.settingsMessage, uiState.settingsMessage);
}
