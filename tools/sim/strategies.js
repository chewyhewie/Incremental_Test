// Buying strategies for the simulated player.
//
// A strategy is `(g) => void`: it looks at the game through `g` (from loadLogic())
// and buys things via buy() below, which calls the game's own buyGenerator /
// buyUpgrade, so affordability and visibility are enforced exactly as in the
// browser. To add one, write it here, add it to STRATEGIES at the bottom, and list
// it in STRATEGY_ORDER in sim.js.

// Everything the player can currently see and still buy, with its cost and (unless
// `gains` is false) the virions/sec it would add. Gain is measured by applying the
// purchase temporarily and asking the real state.js functions, so milestone jumps,
// targeting and every other rule are honoured without being re-implemented here.
function candidates(g, { gains = true } = {}) {
  const { fn, CONFIG, Decimal } = g;
  const state = g.state;
  const before = gains ? fn.getTotalPerSec() : null;
  const list = [];

  for (const gen of CONFIG.generators) {
    const s = state.generators[gen.id];
    if (!s.unlocked) continue;
    const c = { type: "generator", id: gen.id, cost: fn.getGeneratorCost(gen.id) };
    if (gains) {
      // Owning one more only changes this generator's own output, so there is no
      // need to recompute the total.
      const was = fn.getGeneratorOutput(gen.id);
      s.owned += 1;
      c.gain = fn.getGeneratorOutput(gen.id).minus(was);
      s.owned -= 1;
    }
    list.push(c);
  }

  for (const upg of CONFIG.upgrades) {
    const s = state.upgrades[upg.id];
    if (!s.unlocked || s.owned) continue;
    const c = { type: "upgrade", id: upg.id, kind: upg.effect.kind, cost: new Decimal(upg.cost) };
    if (gains) {
      s.owned = true;
      c.gain = fn.getTotalPerSec().minus(before);
      s.owned = false;
    }
    list.push(c);
  }
  return list;
}

// Every strategy should buy through this, so the simulator's `g.onBuy` hook can
// log the purchase and the price actually paid.
function buy(g, c) {
  const ok = c.type === "generator" ? g.fn.buyGenerator(c.id) : g.fn.buyUpgrade(c.id);
  if (ok && g.onBuy) g.onBuy(c);
  return ok;
}

// Saving-up fast path shared by the strategies. While a strategy waits for an item,
// its choice can only change when something new is unlocked or the player can
// afford the item, so it can skip re-evaluating every step until then.
function unlockCount(g) {
  let n = 0;
  for (const id in g.state.generators) if (g.state.generators[id].unlocked) n++;
  for (const id in g.state.upgrades) if (g.state.upgrades[id].unlocked) n++;
  return n;
}

function stillWaiting(g) {
  const w = g.wait;
  return !!w && w.sig === unlockCount(g) && g.state.virions.lt(w.cost);
}

// cost: the cheapest price that would change the decision, or null for "nothing".
function waitFor(g, cost) {
  g.wait = cost === null ? null : { sig: unlockCount(g), cost };
}

// Buy whatever has the best payback (cost / virions-per-second gained). If the best
// item is not affordable yet, save up for it rather than buying something worse.
// Repeats until the best item is out of reach.
function greedyPayback(g) {
  if (stillWaiting(g)) return;

  for (;;) {
    const list = candidates(g);

    // Cost and costGrowth Mutations add no production, so their payback is
    // infinite. They are permanent discounts on every future host, so buy them
    // the moment they are affordable.
    const discounts = list.filter((c) => c.type === "upgrade" && c.gain.lte(0));
    const discount = discounts.find((c) => g.fn.canAfford(c.cost));
    if (discount) { buy(g, discount); continue; }

    let best = null;
    let bestPayback = null;
    for (const c of list) {
      if (c.gain.lte(0)) continue;
      const payback = c.cost.div(c.gain);
      if (best === null || payback.lt(bestPayback)) { best = c; bestPayback = payback; }
    }
    if (best !== null && g.fn.canAfford(best.cost)) { buy(g, best); continue; }

    let cost = best ? best.cost : null;
    for (const c of discounts) if (cost === null || c.cost.lt(cost)) cost = c.cost;
    waitFor(g, cost);
    return;
  }
}

// Always buy the cheapest visible item, host or Mutation, ignoring what it does.
// If it is not affordable yet, save up for it. Ties go to config order (hosts
// first). Repeats until the cheapest item is out of reach.
function cheapestFirst(g) {
  if (stillWaiting(g)) return;

  for (;;) {
    let cheapest = null;
    for (const c of candidates(g, { gains: false })) {
      if (cheapest === null || c.cost.lt(cheapest.cost)) cheapest = c;
    }
    if (cheapest !== null && g.fn.canAfford(cheapest.cost)) { buy(g, cheapest); continue; }

    waitFor(g, cheapest ? cheapest.cost : null);
    return;
  }
}

const STRATEGIES = { greedyPayback, cheapestFirst };

module.exports = { STRATEGIES, candidates, buy };
