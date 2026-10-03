# Prestige design: Recombination

Design for the prestige layer: the reset loop, self-replicating hosts, Recombination
Point (RP) perks, autobuyers, post-prestige Mutations, and (as a skeleton) opt-in
challenges with host defences. Nothing here is built yet; section 7 splits the work into
phases, each its own task. Phases 1 and 2 ship together, and phase 7 is a skeleton that
needs more design. All numbers are starting points to tune with the
simulator (`npm run sim` / `npm run tune`), and every one of them belongs in `CONFIG`.

**Why prestige:** every Mutation is owned by ~30–45 min. After that only ever-pricier
hosts are left, and the sim shows ever-longer walls from ~1h 15m.

---

## 1. The Recombination loop

| Resets | Keeps |
|---|---|
| Virions (back to `startingVirions`, plus perk bonuses) | RP, and RP earned in total |
| Hosts and their colonies | Perks |
| Mutations (unless kept by a perk), unlocked flags | Autobuyer settings |
| Run stats | Lifetime stats, Recombination count |

### RP earned
Based on virions produced **this run** (`stats.run.totalProduced`):
```
RP_gain = floor( (P_run / RP_BASE) ^ RP_EXP )        RP_BASE = 1e9, RP_EXP = 0.5
```
| P_run | 1e9 | 4e9 | 1e10 | 1e11 | 1e12 |
|---|---|---|---|---|---|
| RP | 1 | 2 | 3 | 10 | 31 |

With today's balance, `npm run sim` passes 1e9 produced at 35–47 min depending on
playstyle, about when the Mutations run out, and 1e10 at ~1h 50m–2h. So the first
Recombination becomes available right where the current content ends.

**What sets the reset point.** The square root alone doesn't. After the early game,
production levels off against geometric host costs, so `P_run` grows roughly linearly
with time and RP per minute falls throughout the run. What stops resetting every few
seconds is the colony fill ramp (2c): a fresh run takes minutes to refill its colonies.
- The **Recombine** button appears once `RP_gain ≥ 1`. It shows "+N RP", "next RP at X",
  and **RP per minute this run**, the usual aid for deciding when to reset. Show RP per
  minute **unfloored**: `floor` makes it a sawtooth (0.017–0.033 across run 1), which is
  noise.

> **Known risk: short runs.** In the review's simulation
> ([prestige-review.md §2.2](prestige-review.md)), the best reset time is ~10 min at
> c = 1000. At c = 10 it falls from ~20 min to under a minute as lifetime RP grows,
> because the passive bonus applies in full at once while only the colony part ramps up.
> Faster Division, Reverse Transcriptase, Persister Cells and Primed Inoculum shorten it
> further. Check this with the multi-run sim (section 6) before tuning perks; if runs
> collapse, the RP formula is the lever to revisit.

### Passive bonus
```
output × (1 + RP_MULT · RP_lifetime)                   RP_MULT = 0.1
```
The bonus counts RP **earned**, not RP unspent, so spending in the shop never lowers
production and no purchase ever feels bad.

**Order of operations:** the bonus is one more multiplicative factor. A host's output is
`baseRate × Mutation multipliers × milestone multiplier × (1 + RP_MULT · RP_lifetime) × N`,
where N is its cells (2b). Before Lysogenic Takeover there are no colonies, so N = B.

### Safety and first reset
A confirm dialog lists exactly what resets, and names what the RP will buy (on the first
reset, Lysogenic Takeover). `saveGame()` runs right before and right after the reset.

The first "+1 RP" looks like a bad deal on its own (+10 %). So the Recombination tab
appears at the first `RP_gain ≥ 1` and shows Lysogenic Takeover's effect and price
**before** the player resets.

---

## 2. Self-replication: hosts that infect more hosts

### 2a. First perk: Lysogenic Takeover (1 RP)
> Infected hosts divide, and their daughters come pre-infected.

This is the only perk shown in the shop until it is bought, and every other perk lists
it as a prerequisite. That makes it the first RP purchase. The first Recombination
always yields ≥ 1 RP, so it is affordable at once.

Without it, the first reset is a pure loss: with only the +10 % bonus, run 2 earns its
first RP at the same minute run 1 did. That is why build phases 1 and 2 ship together
(section 7).

### 2b. Model: Gompertz colonies
Per host type:

| Symbol | Meaning |
|---|---|
| `B` | hosts **bought** (integer, today's `owned`) |
| `N` | infected **cells**, a real number with B ≤ N ≤ K. Production becomes `rate × N` instead of `rate × owned` |
| `c` | colony size: extra cells each bought host can seed (starts at **10**) |
| `b` | growth rate per second (**replication speed**) |

```
dN/dt = b·N·ln(K/N)                    K = B·(1 + c)
```
Each cell's growth rate is `b·ln(K/N)`: high while the colony is small, falling smoothly
to 0 as it reaches the cap. This is the Gompertz curve, the standard model for bacterial
and tumour growth.

- **Interferon ceiling (K):** innate immunity caps each colony. N never exceeds
  `B·(1+c)`, so a colony is at most a `(1+c)×` multiplier on bought hosts. There is no
  runaway, and buying hosts stays the main lever because every purchase raises K.
- **Before Lysogenic Takeover** hosts don't divide: `N = B` and production is
  `rate × owned`, exactly as today. This is why the v3→v4 migration sets `cells = owned`.
- **The cap alone bounds growth.** No clearance or other opposing force is needed to
  keep the model finite. Host defences (clearance) are an opt-in challenge mechanic,
  sketched in section 8.
- **N never exceeds K.** Buying hosts and capacity upgrades only raise K, and a
  Recombination empties every colony, so in this layer a colony only grows. Clamp
  `N ≤ K` anyway, for float drift and for saves that lose a removed capacity upgrade on
  load.

### 2c. Closed forms
With `N₀` the cells at the start of a step of length `t`, and `A = ln(K/N₀) ≥ 0`:
```
N(t)     = K·exp( −A·e^(−b·t) )

∫₀ᵗ N dτ = (K/b)·[ E1(A·e^(−b·t)) − E1(A) ]         A > 0  (growing)
         = K·t                                      A = 0  (exactly full)

virions  = rate · ∫₀ᵗ N dτ
```
`E1` is the exponential integral. It has no elementary form, but is standard: a power
series for small arguments and a continued fraction at `x ≥ 1`, about 20 lines plus
tests against reference values. (A shrinking colony, `A < 0`, needs `Ei` as well; that
only arises with clearance, so it belongs to the challenge in section 8.)
- **Exact for any dt.** `update(dt)` and offline progress call the same function, so
  8 h offline is as exact as a 100 ms tick.
- **Underflow guard:** for long t, `A·e^(−bt)` underflows to 0 and `E1(0)` is infinite.
  Work with `ln x = ln A − b·t` directly, and for tiny x use `E1(x) ≈ −γ − ln x`
  (γ ≈ 0.5772). Without this, 8 h offline returned Infinity in testing.
- **Checked:** the integral matches a 2-million-step trapezoid integration of the exact
  N(t) to 9 significant figures, growing (N₀=10, K=10 010, b=0.03 and 0.01); the
  shrinking branch was checked too (section 8). The series and continued fraction for E1
  agree with reference values to about 15 digits.
- **Fill time** from N₀ to a fraction φ of the cap: `t = ln( A / −ln φ ) / b`. A new
  colony has `A = ln(1 + c)` whatever B is, so the time to 95 % is
  `ln( ln(1 + c) / 0.0513 ) / b`. That grows only as the log of a log of c, so a huge
  colony size doesn't mean a long wait.
- **Buying mid-growth:** `B += n; N += n`, recompute K, and the next step continues from
  there. New hosts arrive infected but haven't divided yet. A full colony of 10 E. coli
  that buys an 11th drops to 92 % of its new cap and refills to 95 % in about 17 s.
- **Types:** B, N and K are plain numbers. They are host counts, not resource amounts, so
  the Decimal rule is respected. `rate` and virions stay Decimal.

**Starting values:** `c = 10`; `b` from 0.03/s (E. coli) down to 0.01/s
(N. meningitidis), since bigger cells divide slower. A new colony reaches 95 % of its cap
in **2.1 min** (E. coli) to **6.4 min** (N. meningitidis).

**Balance flag:** the colony bonus is up to ×11. An earlier draft used c = 1000 (×1001),
which made run 2 buy every run-1 Mutation within ~3 minutes
([prestige-review.md §2.3](prestige-review.md)). At ×11, run-1 Mutations stay relevant in
run 2. `RP_BASE`, perk prices and post-prestige content are still tuned with the
multi-run sim, and c is the main balance dial for this layer.

### 2d. Does this need tickspeed?
**No.** Tickspeed matters when production can only be stepped forward numerically. With
closed forms, `update(dt)` is exact for any dt, and offline progress is just one long dt.
**Replication speed** becomes upgrades that multiply `b` (how fast colonies fill),
distinct from output multipliers (how much each cell yields).

A global tickspeed would only be needed for the coupled mechanics in 2f, which have no
closed form and need fixed-substep integration.

### 2e. Host defences: moved
Lab alerts (host clearance that steps up during a run) were moved out of the core layer
into an opt-in challenge. See section 8.

### 2f. Upgrades to self-replication
Colony-size upgrades multiply c rather than add to it, so their value stays proportional
as c grows from its starting 10.

| Upgrade | Effect | Model impact |
|---|---|---|
| Faster Division (levels) | `b × 1.5` per level | none |
| Bigger Colonies (levels) | `c × 2` per level | none |
| Quorum Sensing | output per cell × `(1 + N/K)` | none (∫N² is the same E1 form with `2A` in place of A) |
| Persister Cells | the first host of each type bought after a Recombination starts its colony at 25 % of capacity instead of empty | reset rule only |
| Horizontal Gene Transfer | type *i+1* colonies seed type *i*: `dNᵢ/dt += h·Nᵢ₊₁` | **coupled ODEs:** fixed-substep integration (RK4) and chunked offline progress; tickspeed comes back here |

- Faster colony fill (Faster Division here, Reverse Transcriptase in section 5) also
  shortens the best reset time. See the known risk in section 1.
- Biofilm (`K × 1.5` for a class) was dropped. Bigger Colonies (global) and Quorum Hijack
  (per host) already cover capacity.
- Interferon Antagonist (`f × 0.5`) and Adaptive Immunity (clearance as a predator–prey
  variable) act on clearance, so they moved to section 8.

### 2g. Why Gompertz over logistic
The logistic model (Alternatives, A1) was the previous design. Compared at the same rate
(0.02/s) and cap (1e4) from a single cell, Gompertz reaches 43 % at 2 min while
logistic is still at 0.1 %. Both are full by 15 min.

**Pros**
- It's the textbook curve for bacterial and tumour growth, which suits the theme.
- Fill time barely depends on colony size (95 % at c = 1 → c = 1e9 only goes from 2.2 to
  5.0 min at b = 0.02), so a large c gives a big reward without a long wait. Logistic
  slows as c grows (2.5 → 20 min).
- A fast, satisfying start: growth is quickest when the colony is small.
- Clearance, if added (section 8), folds in exactly and **only** moves the cap. It never
  slows refills, and at a large c it can't erase colonies, where logistic loses
  everything at `f ≥ c/(1+c)`.
- Bounded by its own cap, so host buying stays central within each run.

**Cons**
- Production needs the exponential integral (E1) and an underflow guard: more code and
  tests than logistic's `ln`.
- A long tail near the cap: 95 % → 99 % is slow.
- It's still a capped multiplier that goes quiet once full; open-ended growth is left to
  the next prestige layer (power-law, see the roadmap).
- Harder to explain to players than "fills up to a cap".
- c is the main balance dial: changing it shifts RP and every later content price.

---

## 3. Autobuyers (RP)
Bought once with RP, then toggled on and off and configured in an **Automation** panel.
- **Host autobuyer** (one per class): buys Max of each host every interval, cheapest
  first. Interval upgrades: 10 s → 5 s → 1 s.
- **Mutation autobuyer:** buys the cheapest affordable visible Mutation.
- **Auto-Recombine:** recombines when the RP gain reaches X, or after Y minutes,
  player-set.
- **Per-host buy mode:** each host card remembers its own ×1/×10/Max.

Autobuyers run inside `update()`, in pure logic, so the simulator can use them. They do
**not** run offline in the first version: offline stays closed-form with no purchases,
and the "While you were away" notice says so.

## 4. Other RP perks
Perks reuse the existing effect data (`effect.kind` plus `targetId`/`targetClass`). Extend
`ownedEffects()` in `state.js` to iterate owned perks as well as Mutations, with
`mult ^ level` for levelled perks.

**Prices:** levelled perks cost geometrically more per level (`basePrice × growth^level`).
Lifetime RP keeps climbing, so linear prices would soon make every perk trivial.

| Perk | Effect |
|---|---|
| Viral Memory (levels) | start each run with the N cheapest Mutations owned. Set **both** `owned` and `unlocked` (CLAUDE.md rule 6). Re-check its value with the sim: it was a trap at c = 1000, where run 2 bought every Mutation within minutes |
| Primed Inoculum (levels) | start with 1e3 / 1e5 / 1e7 virions |
| Lab Contacts (levels) | hosts cost × 0.9 per level (`"cost"`) |
| Genome Compression (levels) | costGrowth −0.01 per level (`"costGrowth"`, floored at `minCostGrowth`). Reuses the retired Streamlined Genome effect |
| Cold Storage (levels) | offline cap 8 h → 12 h → 24 h |
| Recombinase | RP gain × 1.5 (new `"rpGain"` kind), applied **before** `floor`: `floor(1.5 · (P_run/RP_BASE)^RP_EXP)` |
| Antigen Library | each lifetime RP gives +0.15 output instead of +0.1 |
| Class II Licence | unlocks Class II hosts (protists). Class III is gated on more Recombinations |

## 5. Post-prestige Mutations
- **Gating:** a new optional config field, `requires: { perk: "lysogenicTakeover" }`.
  Until the perk is owned, the Mutation is hidden and cannot be bought, following the
  existing unlock and owned-implies-unlocked rules. Mutations are not gated on
  Recombination count.
- **New effect kinds:** `"growth"` (b × mult) and `"capacity"` (c × mult). Both keep
  `targetId`/`targetClass` targeting. (A `"clearance"` kind belongs to section 8.)

| Mutation | Effect |
|---|---|
| Reverse Transcriptase | colonies divide 1.5x faster (`growth`) |
| Quorum Hijack (one per host) | that host's colony size × 1.5 (`capacity`). One per host keeps the "same number of per-host Mutations" test true |
| Antigenic Drift | output × (1 + 0.05 × Recombinations) (new `"perRecombination"` kind) |
| Gut Flora Network | E. coli colony fill (N/K) boosts Salmonella output (first synergy Mutation) |
| Tier-3 per-host Mutations | another 3x per host, priced above Serial Passage |

**Fixed prices meet a growing bonus.** The passive bonus grows every Recombination, so each
run reaches a fixed-price Mutation sooner. In the review's simulation, expensive Mutations
lengthened runs for about 7 resets, after which they were all bought in the first few
minutes. Their prices are a tuning target for the multi-run sim.

**Ordering rule:** Mutations stay in strictly ascending cost order by appending gated
ones above the current top cost (Serial Passage). The config-integrity tests gain
checks that `requires` names a real perk and that per-host gated Mutations still cost at
least their host's `baseCost`.

Capsid Hardening and Superantigen Decoy (clearance Mutations) moved to section 8.

---

## 6. Everything else

### State and save (v4)
- `generators[id].cells` (N) alongside `owned` (B).
- `prestige: { rp, rpLifetime, recombinations, perks: { id: level }, autobuyers: {…} }`.
- `stats` splits into `stats.run` and `stats.lifetime`, and the Stats tab gets a
  Run/Lifetime toggle.
- `migrateSave` v3→v4: today's stats become both run and lifetime; `cells = owned`; empty
  prestige block. Because a v3 save's `totalProduced` becomes `P_run`, existing players
  can recombine at once (a 4 h save gets ~5 RP). This is intended: it rewards players
  who were already here.

### Pure logic
The colony closed form, the RP formula, `recombine()`, perk effects and autobuyers all
live in `config.js` / `state.js` / `loop.js`, so the simulator runs the real formulas.
Splitting out a `js/prestige.js` later means adding it to the sim loader
(`tools/sim/load-logic.js`), the test loader and `pure-logic.test.js`.

Production is no longer constant across a step, so:
- `update(dt)` credits `rate × ∫N` from the closed form, not `getTotalPerSec() × dt`;
- `produce()` takes the amount produced rather than a rate and a duration;
- `bestPerSec` records the rate at the end of the step.

### Config
`CONFIG.prestige`: `rpBase`, `rpExp`, `rpMult` and the perk list. Each generator gains `growthRate` (b), and
`colonySize` (c, starting at 10) is a top-level default.

### UI
- **Recombination tab**, shown from the first time RP gain ≥ 1: gain preview (with
  unfloored RP per minute), the Recombine button, and the perk shop as a short tree
  (Lysogenic Takeover at the root). The shop is visible before the first reset, so the
  player sees what the first RP buys.
- **Host cards:** a colony line, e.g. "7,410 cells · colony 74 %".
- **Automation panel:** autobuyer toggles and intervals.

### Simulator and tuner
- Multi-run sim (`--runs N`) with prestige strategies: "recombine at first RP" and
  "recombine at peak RP/min".
- **Sim accuracy:**
  - `sim.js` counts produced virions from what `update(dt)` credits, not
    `getTotalPerSec() × step`, which no longer matches under the closed form.
  - `strategies.candidates()` values a host at its full-colony output,
    `owned × (1 + c)`. Its instant gain (one more cell) is a tiny fraction of that, so
    `greedyPayback` would stop buying hosts.
- **New tuner targets:**
  - first Recombination at 35–60 min (the sim today gives 35–47 min);
  - run-1 Mutations still being bought after minute T_m of run 2 (T_m to be set);
  - the peak-RP/min reset time across runs, to catch the short-run risk in section 1;
  - new colonies reach 95 % in 2–10 min.

### Tests
- Closed form vs. a fine numerical integration, within tolerance, including the
  exactly-full case (A = 0) and a nearly full colony (A ≈ 1e-15).
- E1 against reference values, across the series / continued-fraction switch.
- The integral stays finite and exact at t = 8 h.
- `B ≤ N ≤ K` after every step, including after loading a save whose K dropped.
- Buying mid-growth.
- `recombine()` resets exactly the fields listed in section 1.
- Recombinase multiplies before `floor` (e.g. 1.4 base RP × 1.5 gives 2, not 1).
- Perk-granted Mutations are both `owned` and `unlocked`.
- v3→v4 migration.

### Achievements (later)
"First Recombination", "Colony at 100 %". ("Survived an autoclave" goes with the
challenges in section 8.)

---

## 7. Build phases
Each phase is its own task and leaves the game working.
1. **Core loop:** RP formula, Recombine button and reset, passive RP bonus, run/lifetime
   stats, save v4, multi-run sim.
2. **Self-replication:** Lysogenic Takeover, Gompertz colonies, closed-form update and
   offline progress (E1-based production), colony line on host cards.

   > **Ship phases 1 and 2 together.** They are built as separate tasks, but phase 1
   > alone makes the first reset a pure loss: Lysogenic Takeover is the only use for the
   > first RP (section 2a).
3. **Gated Mutations:** the `growth`/`capacity` kinds, `requires` gating, the first gated
   Mutations.
4. **Shop breadth:** the remaining perks (section 4) and the non-coupled upgrades from 2f.
5. **Automation:** autobuyers and auto-Recombine.
6. **Later:** coupled mechanics (Horizontal Gene Transfer) with substep integration;
   Class II hosts.
7. **Opt-in challenges:** host defences (lab alerts) and the clearance upgrades, as
   challenge runs. **Skeleton only; needs further design first** (section 8).

---

## 8. Opt-in challenges: host defences (skeleton)

> **Status: skeleton. Further design is required before this can be built.** This holds
> the lab-alert design that was moved out of the core layer, plus the known problems to
> solve. Nothing here is final, and section 7's phase 7 depends on it.

### Why it moved
The Gompertz cap (`K = B·(1+c)`) bounds colonies by itself, so clearance was never
needed to keep the model finite. As a forced mechanic, alerts added the most code and
risk in the layer (the `Ei` branch, offline threshold-splitting, `f_step` tuning, a
Defence meter) while acting as a flat output tax. As an **opt-in challenge**, the same
opposing force becomes a choice the player makes for a reward.

### Concept (to design)
- A **challenge run** (working name "Lab Audit"): the player starts a Recombination with
  host defences switched on and earns a reward for reaching a goal.
- **To decide:** the goal, the reward (a perk, an RP multiplier, a unique Mutation), how
  challenges are unlocked, whether more than one exists, and how they show in the UI.

### Carried-over mechanics (from the former 2e)
Clearance is **relative**, `δ = f·b`, so every host loses the same proportion. It folds
exactly back into Gompertz with a lower cap:
```
dN/dt = b·N·ln(K/N) − f·b·N  =  b·N·ln(K'/N)        K' = max(B, K·e^(−f))
f     = f_step[k] × anti-clearance multipliers
k     = thresholds passed during the run             (e.g. 1e10, 1e12, 1e14 — to be replaced, see below)
```
| Alert | Flavour |
|---|---|
| 1 | Antibiotic added to the medium |
| 2 | Autoclave cycle scheduled |
| 3 | Phage-resistant strain introduced |

- **Effect:** only the cap moves; growth speed b is unchanged. At full fill a host yields
  `rate × max(1, (1 + c)·e^(−f))`. Example f = 0.5 / 1 / 1.5 leaves 61 % / 37 % / 22 % of
  the colony.
- **Shrinking:** a colony above its new cap shrinks along the same curve. That needs the
  `A < 0` closed form, `∫₀ᵗ N dτ = (K'/b)·[ Ei(−A) − Ei(−A·e^(−b·t)) ]`, with a small-x
  guard `Ei(x) ≈ γ + ln x` mirroring the E1 one. At f = 0.5, reaching within 5 % of the
  new cap takes 78 s (b = 0.03) to 233 s (b = 0.01). This branch was checked against
  numerical integration (N₀=10 010 → K'=3 683; N₀=5 000 → K'=1 000).
- **Offline:** split the interval where a threshold is crossed (solve or bisect).
- **UI:** a Defence meter showing the alert and `e^(−f)` as capacity, e.g. "−39 %".
- **Upgrades that counter it:** Interferon Antagonist (perk, `f × 0.5`), Capsid Hardening
  (Mutation, `f × 0.5`), Superantigen Decoy (Mutation, `f × 0.75`), via a `"clearance"`
  effect kind. Adaptive Immunity (`f = a·I`, `dI/dt = β·N·I − d·I`, predator–prey, needs
  substep integration) is a candidate for a harder challenge.
- **Achievement:** "Survived an autoclave".

### Known problems to solve first
From [prestige-review.md](prestige-review.md):
- **Fixed thresholds stop working.** Production grows with the lifetime bonus, so fixed
  `P_run` thresholds all fire in the first minutes after a few Recombinations. Use
  relative thresholds (for example a fraction of the previous run, or time into the run).
- **Alerts before colonies do nothing.** With no colonies (before Lysogenic Takeover) an
  alert lowers nothing, but the meter would still show a loss. Require the perk.
- **Harshness depends on c.** The colony bonus disappears at `f = ln(1 + c)`: 6.9 at
  c = 1000 but only 2.4 at c = 10, where f = 1.5 already removes 78 % of host output.
  Set `f_step` after c is chosen.
- **Counters are output multipliers.** Since `K' = K·e^(−f)`, lowering f is an `e^(Δf)`
  output multiplier. Capsid Hardening and Superantigen Decoy target the same f, so merge
  them or give them different jobs.
- **Ambiguity:** Quorum Sensing's `(1 + N/K)` should say whether it uses K or K' under
  clearance.

### Tests (when built)
- Shrinking case (A < 0, `Ei` branch) vs. numerical integration; `Ei` against reference
  values.
- With every alert passed, the cap never drops below B.
- One alert lowers every host's colony bonus by the same proportion.
- An offline stretch that crosses a threshold equals two separate steps.

---

## Alternatives considered

### A1. Logistic colonies (previous model)
The first design used a logistic S-curve. It was set aside for Gompertz (see 2g): it is a
capped `(1 + c)×` multiplier that fills in 2.5 min at c = 1 (10 min at c = 1e4, 20 min at
c = 1e9) and then stays flat for the rest of the run, and its clearance slows refills
and erases the colony bonus entirely once `f ≥ c/(1+c)`. The original sections follow,
unchanged.

#### 2b. Model: logistic colonies with clearance
Per host type:

| Symbol | Meaning |
|---|---|
| `B` | hosts **bought** (integer, today's `owned`) |
| `N` | infected **cells**, a real number ≥ B. Production becomes `rate × N` instead of `rate × owned` |
| `c` | colony size: extra cells each bought host can seed (starts at 1) |
| `r` | division rate per second (**replication speed**) |
| `f` | clearance fraction (**host anti-viral defence**): the share of division cancelled by immune killing, `0 ≤ f < 1` |

Clearance is **relative**: it kills cells at `δ = f·r`, a fixed fraction of each
host's own division rate. So one alert hits every host by the same proportion, however
fast it divides.
```
dN/dt = r·N·(1 − N/K) − f·r·N          K = B·(1 + c)
```
The clearance term folds exactly back into a logistic equation with adjusted
parameters:
```
r' = r·(1 − f)
K' = max(B, K·(1 − f))                 f is clamped to fMax < 1, so r' > 0
dN/dt = r'·N·(1 − N/K')
```
There are two limits, and together they make one familiar S-curve:
- **Interferon ceiling (K):** innate immunity caps each colony. This is what stops
  runaway exponential growth: N never exceeds `B·(1+c)`, so a colony is at most a
  `(1+c)×` multiplier on bought hosts. Buying hosts stays the main lever, because every
  purchase raises K.
- **Clearance (f):** immune cells kill infected cells. This slows filling (r') **and**
  lowers the ceiling (K') by the same factor, `1 − f`. It is the dial that host
  defences turn (2e). At full fill the colony bonus is `max(1, (1 + c)(1 − f))`, so
  clearance can remove the colony bonus but never touches bought hosts.

#### 2c. Closed forms
With `N₀` the cells at the start of a step of length `t`:
```
N(t)     = K' / (1 + A·e^(−r'·t))                 A = (K' − N₀) / N₀
∫₀ᵗ N dτ = K'·t + (K'/r')·ln( N₀/K' + (1 − N₀/K')·e^(−r'·t) )
virions  = rate · ∫₀ᵗ N dτ
```
- **Exact for any dt.** `update(dt)` and offline progress call the same function, so
  8 h offline is as exact as a 100 ms tick.
- **Numerically stable:** for large t, `e^(−r't)` goes to 0 and nothing overflows. The
  form also covers a colony shrinking toward a lowered ceiling (N₀ > K', where A goes
  negative). Clamp the result to N ≥ B.
- **Checked:** against a 1 ms Euler integration (N₀=10, K'=20, r'=0.02) the
  closed form agrees to 4 significant figures at t = 60 s and 600 s, and when shrinking
  from N₀=30. It stays finite at t = 8 h.
- **Buying mid-growth:** `B += n; N += n`, recompute K, and the next step continues from
  there. New hosts arrive infected but haven't divided yet.
- **Types:** B, N and K are plain numbers. They are host counts, not resource amounts, so
  the Decimal rule is respected. `rate` and virions stay Decimal.

**Starting values:** `c = 1`; `r` from 0.03/s (E. coli) down to 0.01/s
(N. meningitidis), since bigger cells divide slower; `f = 0` until the first lab alert. Filling from 50 % to 95 % of
capacity takes `ln(19)/r'`, which is 147 s at r' = 0.02.

#### 2e. Defence escalation: lab alerts
As the run's virions produced crosses thresholds, the lab fights back and the
clearance fraction steps up:
```
f = min(fMax, f_step[k] × anti-clearance multipliers)
k = thresholds passed by P_run                 (e.g. 1e10, 1e12, 1e14, …)
```
| Alert | Flavour |
|---|---|
| 1 | Antibiotic added to the medium |
| 2 | Autoclave cycle scheduled |
| 3 | Phage-resistant strain introduced |

- **Why relative:** an absolute δ would hit slow hosts far harder (r ranges 0.03 to
  0.01/s), and every step would have to stay below the slowest host's r to keep the
  formulas valid. As a fraction, every host loses the same share, and `fMax < 1` keeps
  `r' > 0` everywhere.
- **Gradual, not instant:** a colony above its new, lower ceiling shrinks along the same
  S-curve (the closed form with N₀ > K'), so output eases down over a minute or two.
- **Pair with colony size:** the bonus at full fill is `(1 + c)(1 − f)`. At `c = 1`, any
  `f ≥ 0.5` erases the colony bonus entirely, so the `f_step` values have to be tuned
  together with colony-size upgrades (Bigger Colonies, Quorum Hijack). The values are
  not set yet; tune them with the multi-run sim.
- f is constant between alerts, so the closed form holds. When an offline stretch
  crosses a threshold, split the interval at the crossing (solve for when P_run hits it,
  or bisect).
- A **Defence** meter shows the current alert and its single effect: division speed and
  colony capacity both at `(1 − f)`, e.g. "−25 %".
- Each run gets a rising opposing force for perks and Mutations to counter. This absorbs
  the roadmap's "antibiotic wave" event idea.

#### 2f. Upgrades to self-replication

| Upgrade | Effect | Model impact |
|---|---|---|
| Faster Division (levels) | `r × 1.5` per level | none |
| Bigger Colonies (levels) | `c + 1` per level | none |
| Interferon Antagonist | `f × 0.5` | none |
| Biofilm | `K × 1.5` for a whole class | none |
| Quorum Sensing | output per cell × `(1 + N/K)` | none (∫N² of a logistic also has a closed form) |
| Persister Cells | the first host of each type bought after a Recombination starts its colony at 25 % of capacity instead of empty | reset rule only |
| Horizontal Gene Transfer | type *i+1* colonies seed type *i*: `dNᵢ/dt += h·Nᵢ₊₁` | **coupled ODEs:** fixed-substep integration (RK4) and chunked offline progress; tickspeed comes back here |
| Adaptive Immunity (late, opt-in) | f becomes a variable `f = min(fMax, a·I)`, `dI/dt = b·N·I − d·I` (predator–prey) | coupled and oscillating; swings feel bad when idle, so keep it optional |

#### Logistic-specific lines elsewhere in the original design
- 2d: "**Replication speed** becomes upgrades that multiply `r` (how fast colonies fill),"
- 5: "**New effect kinds:** `"growth"` (r × mult), `"capacity"` (c + delta) and `"clearance"` (f × mult)."
- 5: "Quorum Hijack (one per host) | that host's colonies hold +1 cell per host (`capacity`)."
- 6 Config: "the clearance fraction at each alert (`f_step`) and its cap `fMax`."
- 6 UI: "**Host cards:** a colony line, e.g. "19.4 cells · colony 74 %"."
- 6 Tuner: "New tuner targets: first Recombination 45–75 min; run 2 reaches run 1's peak production in ≤ ⅓ of the time; colonies fill in 1–5 min."
- 6 Tests: "Closed form vs. fine Euler integration, within tolerance, including the shrinking case."
- 6 Tests: "Clearance never reaches `fMax` or above, even with every alert passed, so `r' > 0`."
- 7: "2. **Self-replication:** Lysogenic Takeover, logistic colonies, closed-form update and offline progress, colony line on host cards."

### A2. Power-law and exponential growth
Open-ended replication (`dN/dt = g·N^p`), its von Bertalanffy variant with clearance, and
plain exponential growth were analysed and kept for the **next prestige layer**. The
analysis, numbers and required fixes are in [roadmap.md](roadmap.md#next-prestige-layer-power-law-replication-analysis).
