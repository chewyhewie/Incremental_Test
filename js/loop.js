// Game loop: advances state by real elapsed time, then renders.

let lastTick = Date.now();

// Advance the simulation by dt seconds.
function update(dt) {
  if (!(dt > 0)) return;
  produce(getTotalPerSec(), dt);
  state.stats.timePlayed += dt;
  checkUnlocks();
}

function tick() {
  const now = Date.now();
  // Clamp so a sleeping machine can't grant more than the offline cap in one tick.
  const dt = Math.min((now - lastTick) / 1000, CONFIG.offlineCapSeconds);
  lastTick = now;
  update(dt);
  render();
}

function startLoop() {
  lastTick = Date.now();
  setInterval(tick, CONFIG.tickMs);
}
