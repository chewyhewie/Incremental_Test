# Roadmap

Ideas for after the prototype. Not in priority order, except that prestige is next.

## Prestige: Recombination (next)
Once every Mutation is owned (~30–45 min for greedyPayback) only hosts are left to
buy, and the sim shows ever-longer walls from about 1h 15m. Prestige fills that gap.
Full design, equations and numbers: [prestige.md](prestige.md). Build phases:
- [ ] Core loop: RP from virions produced this run (`floor(sqrt(P_run / 1e9))`), Recombine reset, passive output bonus from lifetime RP, run/lifetime stats, save v4, multi-run sim
- [ ] Self-replication: first RP perk (Lysogenic Takeover); hosts grow Gompertz colonies (colony size c = 10) with closed-form production via the exponential integral, so no tickspeed is needed. Ship together with the core loop: without Lysogenic Takeover the first reset is a pure loss
- [ ] Gated Mutations: `growth` / `capacity` effect kinds, `requires` gating, first gated Mutations
- [ ] Shop breadth: Viral Memory, Primed Inoculum, Lab Contacts, Genome Compression, Cold Storage, Recombinase, colony upgrades
- [ ] Automation: host and Mutation autobuyers, auto-Recombine
- [ ] Later: coupled colony mechanics (Horizontal Gene Transfer) with substep integration
- [ ] Opt-in challenges: host defences (lab alerts, clearance upgrades, Adaptive Immunity) as challenge runs. Skeleton only, needs more design ([prestige.md §8](prestige.md#8-opt-in-challenges-host-defences-skeleton))

## Replication speed (tickspeed)
Superseded by the colony design: production has closed forms, so "replication speed"
is upgrades to the colony growth rate `b` ([prestige.md §2d](prestige.md#2d-does-this-need-tickspeed)).
A global tickspeed only returns if coupled mechanics (§2f) land, since those need
fixed-substep integration and chunked offline progress.

## Next prestige layer: power-law replication (analysis)
Groundwork for the prestige layer after Recombination. The first layer's Gompertz
colonies are a capped multiplier that goes quiet once full; this layer would add
**open-ended** replication. Kept from the colony-model exploration (Oct 2026). Example
numbers use g = 0.02/s.

**Exponential baseline: why not.** `dN/dt = g·N` doubles every 35 s at any size and runs
away: from 10 cells, 1.6e6 at 10 min, 1.9e32 at 1 h, 1.4e251 after 8 h offline.
Proportional clearance (`−δ·N`) does **not** cap it; it only lowers the rate to g − δ.
Threshold alerts that cut g (e.g. ×0.75 each) only stretch the doubling time (1e12 cells
at 37 min instead of 23 min), so each alert must be harsher than the last.

**Power-law replication: the exponent is the dial.**
```
dN/dt = g·N^p                0 < p < 1     q = 1 − p
N(t)     = (N₀^q + q·g·t)^(1/q)
∫₀ᵗ N dτ = ( u^((1+q)/q) − N₀^(1+q) ) / ((1+q)·g)        u = N₀^q + q·g·t
```
- Growth is polynomial of degree 1/q: p = 0.5 → t², 0.75 → t⁴, 0.85 → t^6.7. The
  per-cell rate `g/N^q` falls as the colony grows, so doubling stretches: 1.1 min at
  10 cells, 3.5 min at 1e3, 20 min at 1e6, 1.9 h at 1e9 (p = 0.75).
- Closed forms checked against a 1 ms Euler integration (p = 0.75, t = 600 s: N 521.30
  vs 521.30; ∫N 98 925.0 vs 98 924.7). Still no tickspeed needed.
- At long times `N ∝ g^(1/q)`, so a 1.5x g perk at p = 0.75 is eventually worth ~5x.
- Cells from 10 (g = 0.02):

  | p | 1 min | 10 min | 1 h | 2 h | 8 h |
  |---|---|---|---|---|---|
  | 0.5 | 14 | 84 | 1.5e3 | 5.7e3 | 8.5e4 |
  | 0.75 | 19 | 521 | 1.5e5 | 2.0e6 | 4.5e8 |
  | 0.9 | 25 | 8.1e3 | 1.9e9 | 8.9e11 | 5.0e17 |

**Limiters act on the exponent.** Lab alerts, if this layer uses them (in Recombination they
are an opt-in challenge), lower p (e.g. −0.05 each): the colony keeps
its cells and future growth bends lower, so there's no sudden drop (1e6 cells at 2.8 h
instead of 1.7 h). Unlike exponential, an alert changes the curve's degree, and that
stacks with the built-in slowdown. Clamp p to [pMin, pMax ≈ 0.85]. This bounds runaway
and keeps q away from 0, where `1/q` makes the formula numerically unstable. N can
outgrow plain numbers at high p, so it needs `Decimal.pow`.

**Three fixes it cannot ship without**
1. **Multiplier form.** Literal cells drown purchases: at 1 h (p = 0.75), buying 10 hosts
   adds 0.0065 % to the cell count. Instead, each host type gets a colony multiplier
   `M ≥ 1` with `dM/dt = g·M^p`, and production = `rate × B × M`, so buying hosts stays a
   linear lever. (Simplification: all colonies of a type share one age.)
2. **Log-based RP.** With `RP = sqrt(P_run / 1e9)`, RP per minute **rises** with run
   length (p = 0.75: 0.08 → 0.18 → 0.46 → 1.2 → 3.4 per min at 30 min → 8 h), so the best
   play is never to reset. With P ∝ t^(1+1/q), a power-style `RP = P^e` only rewards
   resetting when `e < q/(1+q)`, and p upgrades keep shrinking that bound. Use
   `RP = floor(k·log10(P_run / RP_BASE))` instead, where RP/min falls for any polynomial
   growth. (For comparison, a capped colony's RP/min falls under sqrt RP: 0.0063 → 0.0016.)
3. **Sensitivity and offline dominance.** At 1 h, p = 0.60 → 5.5e3 cells, 0.75 → 1.5e5,
   0.85 → 1.8e7: a 0.25 change in p spans 3 000x. Every p-changing upgrade needs
   simulator coverage. 8 h offline at p = 0.75 gives 3 000x the cells of 1 h, so the
   offline cap and the Cold Storage perk become major levers.

**Von Bertalanffy variant: power-law with a natural cap.**
```
dN/dt = g·N^p − δ·N          cap N∞ = (g/δ)^(1/q)
y = N^q  →  dy/dt = q·(g − δ·y)  →  y(t) = g/δ + (y₀ − g/δ)·e^(−q·δ·t),   N = y^(1/q)
```
- Clearance **alone** creates the cap, because the per-cell growth rate falls with size
  while the per-cell kill rate doesn't. No separate interferon mechanic is needed, and
  alerts and anti-clearance upgrades move the cap.
- N always has a closed form. ∫N is closed (binomial expansion) when 1/q is a whole
  number, so restrict p to {1/2, 2/3, 3/4, 4/5} and make p upgrades
  **"growth degree +1"** (2 → 3 → 4 → 5).
- Slow and steady: 95 % of a 1e4 cap takes 2.4 h (p = 0.75, δ = 0.002), vs 52 min for
  power-law with an interferon cap `g·N^p·(1 − N/K)` and 10 min for logistic. That suits
  a layer meant to keep growing through a whole run.

**Model comparison numbers** (from 1 cell)

| Time to 95 % of a cap of 1 + c | c = 1e3 | c = 1e4 | c = 1e6 | c = 1e9 |
|---|---|---|---|---|
| Gompertz (b = 0.02, first layer) | 4.1 m | 4.3 m | 4.7 m | 5.0 m |
| Logistic (r = 0.02) | 8.2 m | 10.1 m | 14 m | 20 m |
| Power-law p = 0.75, same cells | 15 m | 30 m | 1.7 h | 9.7 h |

## More generators
- [ ] More Class I hosts beyond N. meningitidis (e.g. Staphylococcus, Pseudomonas, Streptococcus)
- [ ] Class II hosts (e.g. protists / amoebae) with their own upgrade line
- [ ] Class III hosts (e.g. lab mice?), gated behind prestige
- [ ] Per-generator milestone bonuses (e.g. ×2 at 25 / 50 / 100 owned)

## Mutations
- [ ] Tiered upgrades per generator
- [ ] Synergy upgrades (one host type boosts another)
- [ ] Upgrades that improve offline progress or its cap
- [ ] Reuse the removed Streamlined Genome's effect (lowering cost scaling, e.g. Class I costs grow 1.29x instead of 1.3x). The `"costGrowth"` effect kind and the `minCostGrowth` floor are still supported, but no Mutation uses them right now

## Achievements
- [ ] Achievement list with unlock conditions (first host, 1e6 virions, own 100 E. coli…)
- [ ] Small global bonus per achievement
- [ ] Toast notification on unlock

## Events & flavour
- [ ] Random events: lab tech sneezes (bonus), autoclave cycle (temporary slowdown), antibiotic wave
- [ ] Rotating flavour text / lab-notebook log
- [ ] Animated petri dish that fills up as virions grow

## Quality of life
- [x] Buy ×1 / ×10 / ×max toggle (Hosts tab; the mode is UI-only and not saved)
- [x] Statistics page (time played, total produced, highest virions/sec): Stats tab, `state.stats`, save v3
- [ ] Choice of number notation (scientific, engineering, letters)
- [ ] Manual "Save now" button and last-saved indicator
- [ ] Keyboard shortcuts

## Audio
- [ ] Sound effects (purchase, upgrade, achievement)
- [ ] Optional ambient lab background loop
- [ ] Mute / volume setting (saved)

## Balance
- [x] Improve the current balance: replaced "q4" with "A3" (`costGrowth` 1.55 to 1.3, every host rate at least 5x the previous tier). Passes every tuner target: T 31m 38s, longest gap 4m 08s
- [x] Give `--search` a tie-breaker once all targets pass: lower `costGrowth`, then wider host rate gaps (`SEARCH` in `tools/sim/tune.js`). Lower `costGrowth` alone drove every run to the 1.05 floor, which passed the tuner but ran away after T, so the range now starts at 1.2
- [ ] cheapestFirst finishes its Mutations at ~2h with ~28 min between each of its last three (Actin Rocket, Sugar Coating, Serial Passage); the tuner only scores greedyPayback, so this is invisible to it. Revisit after prestige changes the late game

## Developer tools
- [x] Cheapest-first sim strategy
- [ ] Add more sim strategies (e.g. save up for the next Mutation, buy hosts in ×10 batches)
