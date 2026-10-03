# Review: Recombination prestige design

Review of [prestige.md](prestige.md) as of 2026-10-03, before any code is written. It
covers the design and checks the doc's math.

**Method.** I read the whole doc and the current logic (`config.js`, `state.js`, `loop.js`,
`save.js`, `tools/sim/*`). To check the numbers, I ran the real economy in memory through
`tools/sim/load-logic.js` with the `greedyPayback` strategy, using one-off scripts that
were not saved. The scripts added three things on top of the real logic:
- the passive bonus `× (1 + 0.1 · RP_lifetime)`;
- Gompertz colonies with c = 1000, b running from 0.03 (E. coli) down to 0.01
  (N. meningitidis), f = 0, and 1 s steps;
- a steady-state host valuation, `owned × (1 + c)`, for the strategy's purchase decisions.

**Caveat:** perk prices and `f_step` are undefined, so the multi-run numbers leave out
perks and lab alerts. The numbers reflect `config.js` as of this date (costGrowth 1.3).

---

## 1. Overall read
The math is clean, and the core loop (sqrt RP, a lifetime-RP bonus, colonies) is sound in
shape. However, the doc puts the reset optimum in the wrong place and misjudges what
shapes it:
- **Phase 1 alone makes the reset a pure loss.** Run 2 earns its first RP at the same
  minute run 1 did.
- **From run 2 on, the optimal run length is set by colony fill time (~10 min), not by
  content.** Players will reset 30+ times in a few hours, long before autobuyers exist.
- **The ×1001 colony jump makes all run-1 content obsolete within ~3 minutes.**

**Close, with changes.** Fix the phasing, decide on the intended run length, and make the
alert thresholds scale. Then build.

---

## 2. Major concerns (ranked)

### 2.1 Phase 1 is not a shippable reward (wrong)
Phase 1 ships the reset and the +10%/RP bonus, but Lysogenic Takeover, the only thing
1 RP can buy, arrives in Phase 2. Simulated run 2 with ×1.1 output:

| | 1st RP at | P_run at 40 min |
|---|---|---|
| Run 1 (×1.0) | ~35–40 min | 1.45e9 |
| Run 2 (×1.1) | ~37–40 min | 1.85e9 |

The player throws away 40 minutes to replay the same 40 minutes for another +10%. That is
the classic punishing first prestige.

**Fix:** merge Phases 1 and 2. The first reset must ship together with the thing that
makes run 2 different. Failing that, Phase 1 needs a bonus that is felt immediately (for
example ×2 per RP early on).

### 2.2 The optimal run length is governed by fill time, and it is short (wrong / missing)
"A square root gives diminishing returns, so resetting eventually beats waiting" is true,
but it isn't what sets the optimum.

After the early game, production plateaus against the 1.3 cost growth, so `P_run ≈ k·t`,
RP ≈ √t, and RP/min ∝ 1/√t. That falls from the first minute. The only thing stopping
reset-spam is the colony fill ramp. Simulated RP/min by reset minute, with fill:

| Lifetime RP | 3 m | 5 m | 8 m | 10 m | 15 m | 20 m |
|---|---|---|---|---|---|---|
| 1 (run 2) | 0.33 | 1.4 | 2.5 | 2.9 | **3.1** | 3.0 |
| 1 000 | 22 | 35 | 43 | **44** | 42 | 39 |
| 100 000 | 339 | 481 | 553 | **556** | 522 | 481 |

The peak sits at 8–15 min forever. It is flat, so it is forgiving and easy to find.
Over the same ~5 h, shorter fixed intervals win:

| Interval | Lifetime RP |
|---|---|
| 8 min | 30 943 |
| 15 min | 25 445 |
| 30 min | 11 244 |
| 60 min | 4 222 |

Consequences:
- Each run is ~10 minutes of manually re-buying ~90 of each of 5 hosts, and Automation is
  Phase 5. That is the "grind the early game for the tenth time" failure.
- **Faster Division and Reverse Transcriptase (b ×1.5) shorten the optimal run further.**
  As written they are "reset more often" upgrades, not "replication speed".
- Persister Cells and Primed Inoculum do the same.

**Fix:** decide the target run length explicitly (for example 20–30 min), then pick one:
- bring the host autobuyer forward to ship with the first reset; or
- make RP depend on something that keeps growing within a run (for example best
  production, or `log P` with a stronger exponent); or
- make fill deliberately slower.

Add a tuner target for "peak RP/min reset time".

### 2.3 Colonies obsolete every run-1 Mutation immediately (wrong for fit)
With colonies, run 2 reaches run 1's 40-minute total in ~3 minutes, at 4e9/s by 5 min.
The most expensive Mutation (Serial Passage) costs 2e8, so all 14 Mutations are bought in
the first ~3 minutes of every later run. Effects:
- The tuner target "run 2 reaches run 1's peak in ≤ ⅓ of the time" passes trivially
  (~1/13).
- Viral Memory, which pre-owns cheap Mutations, is near-worthless: a trap perk.
- "Priced above Serial Passage" for gated Mutations understates it. They need to start
  around 1e12+.

**Fix:** start c much lower (c ≈ 10–30) and let Bigger Colonies grow it. Otherwise accept
the jump deliberately and re-price everything on the run-2 scale.

### 2.4 Lab alerts become a flat tax, not an escalating force (wrong)
Thresholds are fixed on `P_run` (1e10, 1e12, 1e14), but `P_run` scales with the lifetime
bonus. At lifetime RP ≈ 1 000, a run makes ~1e13 in its first 10 min, so every alert fires
in the opening minutes of every run. After that:
- f is constant for the whole run, so "a rising opposing force within each run" is gone
  by run 3.
- Since `K' = K·e^(−f)`, every clearance counter (Interferon Antagonist, Capsid Hardening,
  Superantigen Decoy) is just an `e^(Δf)` output multiplier.
- Alert 1 also fires in run 1 at 1e10, before any colonies exist. The Defence meter would
  show "−39 %" doing nothing.

**Fix:**
- Tie thresholds to something relative (for example a fraction of the previous run's
  `P_run`, or time into the run).
- Gate alerts on Lysogenic Takeover.

### 2.5 The novel mechanic collapses into multipliers (taste, but decide it)
At full fill every colony is exactly `output × (1+c)·e^(−f)`.
- Bigger Colonies, Biofilm and Quorum Hijack are three spellings of "×output".
- Interferon Antagonist, Capsid Hardening and Superantigen Decoy are three spellings of
  "−f". Capsid Hardening ("clearance 0.5x") and Superantigen Decoy ("lab-alert clearance
  0.75x") target the same f, since alerts are the only source of f.

The only part the player experiences as new is the 2–8 minute ramp after each purchase.
That is a fine flavour mechanic, but it costs E1/Ei, underflow guards and offline
threshold-splitting to deliver it.

This is acceptable if deliberate. Two ways to make it a real decision:
- a trade-off between capacity and speed (for example a perk that raises c but lowers b);
- the coupled mechanics (HGT), which currently sit in "Later".

Either way, merge the duplicate upgrades.

### 2.6 First-reset clarity (missing)
At the first unlock the preview says "+1 RP", which is worth +10%. That looks like a
terrible deal, even though the actual payoff (Lysogenic Takeover, ≈×1000) is large.

**Fix:** show the Recombination tab with Lysogenic Takeover's effect and price before the
first reset, and make the confirm dialog name it.

Also, run-1 RP/min is a floor sawtooth (0.017–0.033, see §3), so the "RP per minute"
readout is noise in run 1. Display the unfloored rate.

### 2.7 Sim and strategy assumptions break under colonies (missing, implementation risk)
- `sim.js` tracks `produced` as `getTotalPerSec() × step`. Under the closed form that
  diverges from what `update(dt)` actually credits.
- `strategies.candidates()` scores a host by its instant output gain with `owned + 1`.
  With colonies that gain is about 1/1000 of the true value, so `greedyPayback` would stop
  buying hosts. To get usable numbers I had to swap in steady-state output.
- `produce(perSec, seconds)` and `bestPerSec` assume constant rate across a step.

The doc's sim/tuner section needs to cover all three.

---

## 3. Math check

| # | Formula | Verdict |
|---|---|---|
| 1 | `RP = floor((P_run/1e9)^0.5)` and its table | **Correct.** 1, 2, 3 (3.16), 10, 31 (31.6). Sim confirms 1e9 at ~35 m active / ~48 m idle, and 1e10 at ~1h50–2h. |
| 2 | Shape of the reset optimum | **Risk** (§2.2). Run 1: RP/min is flat at 0.017–0.033 with a floor sawtooth. Run 2+: the peak is pinned at 8–15 min by fill time. |
| 3 | Passive bonus `× (1 + 0.1·RP_lifetime)` | **Correct and stable.** Gain ∝ √P ∝ √bonus gives `L ~ n²` per reset, so it is polynomial with no runaway (lifetime RP 1 → 30 943 over 33 runs). The doc doesn't state the order of operations (multiplicative with Mutations?). |
| 4 | Gompertz with clearance folds into `K' = K·e^(−f)` | **Correct.** `bN·ln(K/N) − fbN = bN·ln(Ke^(−f)/N)`. |
| 5 | `N(t) = K'·exp(−A·e^(−bt))` | **Correct.** Satisfies N(0) = N₀ and the ODE. |
| 6 | ∫N, A > 0: `(K'/b)[E1(Ae^(−bt)) − E1(A)]` | **Correct.** Follows from substituting u = A·e^(−bτ). |
| 7 | ∫N, A < 0: `(K'/b)[Ei(−A) − Ei(−Ae^(−bt))]` | **Correct**, and positive. **Missing:** the doc only gives the small-x guard for E1. Ei needs the mirror guard, `Ei(x) ≈ γ + ln x`, because A ≈ 0⁻ happens on every tick of a full colony after float drift. |
| 8 | A = 0 → `K'·t` | **Correct** and continuous with both branches. Both reduce to `K'·t` as A → 0. |
| 9 | Fill time `t = ln(A/−ln φ)/b`, 2.7 / 8.2 min | **Correct.** 163 s and 490 s. "A = ln(1+c) whatever B is" only holds at f = 0; otherwise A = ln(1+c) − f. |
| 10 | 11th E. coli refills in ~20 s | **Correct.** 20.6 s. Note the colony starts at 91 % of its new cap. |
| 11 | 2g comparisons (43 % vs 0.1 % at 2 min; 2.2 → 5.0 min; logistic 2.5 → 20 min, 10 min at 1e4) | **All correct.** 43.4 %, 0.11 %, 2.17 / 5.0 min, 2.45 / 19.7 / 10.1 min. |
| 12 | Alerts f = 0.5 / 1 / 1.5 → 61 / 37 / 22 %; vanish at f ≈ 6.9 | **Correct.** ln 1001 = 6.909. |
| 13 | Alert shrink "over a minute or two" | **Risk, minor.** Within 5 % of the new cap at f = 0.5 takes 78 s (b = 0.03) to **233 s** (b = 0.01). |
| 14 | Alert thresholds on `P_run` | **Risk** (§2.4). They stop scaling after a few runs. `f_step` is **unverifiable** (undefined). |
| 15 | Quorum Sensing ∫N² with 2A | **Correct** (cap K'²). It is ambiguous whether `N/K` uses K or K' (under alerts the max is 1 + e^(−f) vs 2). |
| 16 | Biofilm `K × 1.5` vs Bigger Colonies `c × 2` | **Ambiguous order.** `1.5·B(1+c)` vs `B(1+1.5c)`. They differ slightly, and Biofilm also multiplies the bought-host floor. |
| 17 | Recombinase RP × 1.5 | **Ambiguous:** before or after floor? After floor, it rounds 1 RP to 1 at first unlock. |
| 18 | Antigenic Drift `1 + 0.05·R` | **Correct**, linear in R. Weak next to L ~ n². |
| 19 | Perk prices, Primed Inoculum, Cold Storage | **Unverifiable.** No prices given. With L reaching ~3e4 in 5 h, linear prices make RP meaningless quickly. |

**Numeric range:** fine. After 5 h, lifetime RP ≈ 3e4, bonus ×3e3, production ≈ 2e13/s.
N ≈ 1e5 per host as a plain number is safe. Store RP and lifetime RP as Decimal or check
they stay < 2^53; at n² growth they will.

**Tick/offline consistency:** correct by construction while f, B and the rates are
constant during a step. Offline needs threshold-splitting (the doc covers this), and the
Ei guard in #7 is still needed.

---

## 4. What's working
- Lifetime-RP bonus with spending never lowering output: a good anti-feels-bad rule.
- Closed forms make `update(dt)` and offline progress the same code path. The derivations
  are right, and the underflow analysis caught a real bug.
- Gompertz over logistic is well argued. Clearance only moves the cap, and fill time only
  grows with ln ln c.
- The fill ramp gives a natural minimum run length. That brake is useful once it is
  tuned on purpose.
- Pure-logic placement, the `requires` gating, and owned-implies-unlocked handling for
  Viral Memory all fit CLAUDE.md.
- Autobuyers in `update()` so the sim can use them, and not running offline in v1: good
  scoping.

---

## 5. Open questions
1. What is the target run length after run 2? (It currently falls out of b.)
2. Is the ×1000 jump at the first perk intended, or should colonies start small and grow?
3. Should alerts escalate within a run every run, or be a run-number progression?
4. Is the passive bonus multiplicative with Mutations and colony size? Is Recombinase
   applied before floor?
5. Does Quorum Sensing use K or K'? Does Biofilm scale K or c?
6. What are the perk price curves? Are they geometric per level?
7. Should Capsid Hardening and Superantigen Decoy be one Mutation?
8. How should existing v3 saves with large `totalProduced` be treated? (A 4 h save gets
   ~5 RP on load. Is that fine?)

---

## 6. Before building
1. Re-phase so the first reset ships with Lysogenic Takeover. Consider bringing the host
   autobuyer forward too.
2. Build the multi-run sim first, with a steady-state host valuation for
   `greedyPayback`. Simulate 10+ resets and report the peak-RP/min reset time per run.
3. Prototype c ∈ {10, 100, 1000} and pick by "Mutations still matter in run 2".
4. Redesign alert thresholds to be relative, then define `f_step`.
5. Add the Ei small-argument guard and a near-zero-A test (A = ±1e-15) to the test list.
6. Collapse the duplicate capacity and clearance upgrades.
