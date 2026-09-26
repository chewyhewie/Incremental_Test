// Entry point: load or create state, apply offline progress, start everything.

function init() {
  const loaded = loadGame();
  state = loaded || newState();

  if (loaded) {
    const offline = applyOfflineProgress();
    if (offline) uiState.notice = offlineMessage(offline);
  }
  checkUnlocks();

  buildUI();
  render();
  startLoop();

  setInterval(saveGame, CONFIG.autosaveMs);
  window.addEventListener("beforeunload", saveGame);
  // Mobile browsers often skip beforeunload; saving on hide covers that.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveGame();
  });
}

init();
