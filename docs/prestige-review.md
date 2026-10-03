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

**Caveat:** perk prices are undefined, so the multi-run numbers leave out perks. The
numbers reflect `config.js` as of this date (costGrowth 1.3).

**Update:** lab alerts have since moved out of the core layer into an opt-in challenge
skeleton ([prestige.md §8](prestige.md#8-opt-in-challenges-host-defences-skeleton)).
Alert findings from this review now live there, so they are trimmed below.

**Applied to prestige.md (2026-10-03):**
- c = 10;
- the "ship phases 1 and 2 together" note;
- Lysogenic Takeover shown before the first reset;
- unfloored RP per minute, and the order of operations for the passive bonus;
- Biofilm dropped;
- geometric perk prices, with Recombinase applied before floor;
- simulator accuracy fixes and the new tuner targets;
- existing saves' production counts toward RP.

**Declined:**
- **Lifetime-banked RP formula:** the per-run formula is kept. The short-run risk is
  recorded in prestige.md §1.
- **Merging phases 1 and 2:** they stay separate tasks that ship together.
- **Mutation waves gated on Recombination count:** not adopted, and the
  `{ recombinations: n }` gate was removed.

The recommendations below are kept as written, for the record.

**Follow-up analyses**, added after the first review using the same setup:
- **c = 10 plus expensive Mutations** (§2.2, §2.3). A lower colony size alone makes runs
  shorter. Expensive Mutations lengthen runs, but only for about 7 resets.
- **Alternative RP formulas** (§2.2). Every formula based on this run's production gives
  short runs or no resets. A formula based on lifetime production lets runs lengthen on
  their own. **It is now the recommended fix.**
- **Removing lab alerts** (§2.4). Alerts were never needed to bound the Gompertz curve,
  because the cap `K = B·(1+c)` does that alone. Removing them drops the `Ei` branch,
  offline threshold-splitting, `f_step` and three clearance upgrades. They moved to an
  opt-in challenge.

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

**Close, with changes.** Fix the phasing and decide on the intended run length. Then
build.

The follow-up analyses point to one main fix: **base RP on lifetime production rather
than this run's production** (§2.2). Tweaking the formula's shape does not fix short runs;
changing what it measures does.

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

**Fix:** decide the target run length explicitly (for example 20–30 min). Then switch to
the lifetime-banked formula below. Bringing the host autobuyer forward to ship with the
first reset helps whatever formula is used.

#### Follow-up: does c = 10 plus expensive Mutations fix it?
This was tested with 6 placeholder Mutations, each ×3 to all output, priced at 1e10
through 1e15. They show the effect of the idea, not a proposed price list.

Best minute to reset, by lifetime RP:

| Setup | 1 | 100 | 1 000 | 10 000 |
|---|---|---|---|---|
| c = 1000 (current doc) | 14 m | 11.5 m | 10 m | 9.5 m |
| c = 10 alone | 19.5 m | 9 m | 5.5 m | **0.5 m** |
| c = 10 + expensive Mutations | 70 m | 90 m+ | 40 m | 10.5 m |

- **c = 10 alone is worse.** At large c, most of the boost comes through colonies, and the
  fill delay was the only brake on short runs. At c = 10, most of the boost is the lifetime
  RP bonus, which applies in full from second zero.
- **Expensive Mutations only help for a while.** Waiting pays only while production keeps
  rising within a run. These Mutations create those rises while they are still ahead of the
  player. Their prices are fixed, though, and the lifetime bonus grows, so each run reaches
  them sooner.

When the extras were bought, in repeated 40-min runs:

| Run | Extras bought at (minutes into the run) |
|---|---|
| 2 | 19 |
| 4 | 7, 13, 26 |
| 6 | 2, 4, 6, 11, 22 |
| 8 (~5.4 h) | 0, 1, 1, 2, 4, 7 |

By run 8 the economy is back to flat production and short runs. Together the six ×3
Mutations also multiply output by 729, so lifetime RP reaches about 128 000 by 8 h.

**Verdict:** this helps for about 7 resets. To make it last, release Mutations in waves
with `requires: { recombinations: n }`. Each wave should be priced against the bonus
expected at that point.

#### Follow-up: alternative RP formulas
Once production levels off, this run's production grows roughly in step with time. Any
formula that rises more slowly than that (a square root, a quarter power, a log) then earns
less RP per minute the longer you stay, so resetting early wins. A linear formula never
loses RP per minute, so you never reset. Changing the formula's shape cannot fix this.

Best minute to reset, by lifetime RP 1 / 100 / 1 000 / 10 000. Constant factors in the
formulas don't move the peak, so they were left out.

| Formula | c = 1000 | c = 10 |
|---|---|---|
| √(produced this run), current | 14 / 11.5 / 10 / 9.5 | 19.5 / 9 / 5.5 / 0.5 |
| (produced this run)^0.25 | 7.5 / 5 / 3.5 / 0.5 | 11 / 2.5 / 0.5 / 0.5 |
| produced this run, linear | never (120 m+) | never (120 m+) |
| log10(produced this run) | 4.5 / 2 / 0.5 / 0.5 | 11.5 / 3 / 0.5 / 0.5 |
| √(peak virions/sec) | 7.5 / 6.5 / 4 / 4 | 9.5 / 3 / 0.5 / 0.5 |

| Formula | Pros | Cons |
|---|---|---|
| √ of this run's production (current) | Simple; "RP per minute" is easy to read | Runs shrink to the colony fill time (~10 min), or under a minute at c = 10 |
| Lower power or log | Slows how fast numbers grow | Makes short runs even more attractive |
| Linear | Waiting is never wasted | No reason to reset; the reset point disappears |
| √ of peak virions/sec | Rewards getting stronger, not idling; "reset when you hit the wall" is intuitive | Plateaus come quickly, so runs are still short; a brief spike counts as the peak |
| **√ of lifetime production; a reset claims the difference** | See below | See below |

**Lifetime-banked formula:**
```
RP_total = floor( (P_lifetime / RP_BASE) ^ RP_EXP )
RP_gain  = RP_total − RP_earned
```

Pros:
- No virion is wasted, so there is no reason to spam resets. The only question is whether
  the bonus jump is worth rebuilding, which players understand.
- The UI can show "+50 % production" instead of a jumpy RP-per-minute number.
- Runs get longer on their own. Doubling RP needs 4× the lifetime virions, while production
  only doubles.
- The first reset still lands at ~35 min, where run-1 content ends.

Cons:
- RP grows much more slowly, so `RP_MULT` and perk prices need retuning.
- Runs keep lengthening. By 8 h a run takes 1½–2 h, which is the cue for new content or
  the next layer.
- There is no single best reset moment. "Reset when the bonus would grow by about 50 %" is
  the usual rule, and the UI should teach it.
- Existing saves get a lump of RP on load, the same issue as with the current formula
  (open question 8).

Results over 8 h of play (c = 1000):

| Policy | Run lengths (min) | Lifetime RP |
|---|---|---|
| Current formula, 10-min runs (about its best) | 35, then 10 every run | ~109 000 |
| Lifetime-banked, reset when pending ≥ ½ lifetime RP | 35, 3, 3, 4 … 48, 67, 91 | ~5 500 |
| Lifetime-banked, reset when pending ≥ lifetime RP | 35, 3, 4, 5 … 42, 71, 124 | ~4 100 |

At c = 10 the pattern is the same but slower: 35, 11, 12, 17 … 75, 116 min.

**Recommendation:** adopt the lifetime-banked formula. It removes the cause of concern 2,
so the fix no longer depends on a steady supply of new content. It works alongside c = 10
and gated Mutation waves, which become content that arrives as runs lengthen. Drop the
"RP per minute" readout, make the gain preview show the bonus increase, and retune bonus
strength with the multi-run sim. For the tuner, a target on run-length growth fits better
than one on the best reset time.

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

**Follow-up:** c = 10 does fix this concern. In run 2 the first 1e10 Mutation isn't
reached until minute 19, so Mutations stay relevant. On its own, c = 10 makes §2.2 worse;
pair it with the lifetime-banked formula.

### 2.4 Lab alerts (resolved: moved to opt-in challenges)
The original concern was that fixed `P_run` thresholds turned alerts into a flat tax after a
few runs. The follow-up found that alerts are not needed to constrain the Gompertz curve,
because the cap bounds it alone. Alerts added the most risk in the layer (the `Ei` branch,
offline threshold-splitting, `f_step` tuning, a Defence meter) for the least player value.

They now sit in [prestige.md §8](prestige.md#8-opt-in-challenges-host-defences-skeleton)
as an opt-in challenge skeleton. The problems to solve before building them (relative
thresholds, harshness at low c, counters that are just multipliers) are listed there.

Removing them also loses the layer's only opposing force and its theme beats. An opt-in
challenge, or the next power-law layer where a constraint is genuinely needed, is the
better home for that.

### 2.5 The novel mechanic collapses into multipliers (taste, but decide it)
At full fill every colony is exactly `output × (1+c)`. Bigger Colonies, Biofilm and Quorum
Hijack are three spellings of "×output".

The only part the player experiences as new is the 2–8 minute ramp after each purchase.
That is a fine flavour mechanic. With alerts moved out, it costs only E1 and an underflow
guard to deliver it.

This is acceptable if deliberate. Two ways to make it a real decision:
- a trade-off between capacity and speed (for example a perk that raises c but lowers b);
- the coupled mechanics (HGT), which currently sit in "Later".

Either way, merge the duplicate capacity upgrades.

### 2.6 First-reset clarity (missing)
At the first unlock the preview says "+1 RP", which is worth +10%. That looks like a
terrible deal, even though the actual payoff (Lysogenic Takeover, ≈×1000) is large.

**Fix:** show the Recombination tab with Lysogenic Takeover's effect and price before the
first reset, and make the confirm dialog name it.

Also, run-1 RP/min is a floor sawtooth (0.017–0.033, see §3), so the "RP per minute"
readout is noise in run 1. Display the unfloored rate. If the lifetime-banked formula is
adopted (§2.2), drop this readout and show the bonus increase instead.

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
| 2 | Shape of the reset optimum | **Risk** (§2.2). Run 1: RP/min is flat at 0.017–0.033 with a floor sawtooth. Run 2+: the peak is pinned at 8–15 min by fill time. Every concave per-run formula behaves the same; the lifetime-banked formula avoids it. |
| 3 | Passive bonus `× (1 + 0.1·RP_lifetime)` | **Correct and stable.** Gain ∝ √P ∝ √bonus gives `L ~ n²` per reset, so it is polynomial with no runaway (lifetime RP 1 → 30 943 over 33 runs). The doc doesn't state the order of operations (multiplicative with Mutations?). |
| 4 | `N(t) = K·exp(−A·e^(−bt))` | **Correct.** Satisfies N(0) = N₀ and the ODE. |
| 5 | ∫N, A > 0: `(K/b)[E1(Ae^(−bt)) − E1(A)]` | **Correct.** Follows from substituting u = A·e^(−bτ). |
| 6 | A = 0 → `K·t` | **Correct** and continuous with the growing branch as A → 0. Float drift can make A slightly negative on a full colony, so clamp `N ≤ K` (now in prestige.md §2b). |
| 7 | Fill time `t = ln(A/−ln φ)/b`, 2.7 / 8.2 min | **Correct.** 163 s and 490 s. |
| 8 | 11th E. coli refills in ~20 s | **Correct.** 20.6 s. Note the colony starts at 91 % of its new cap. |
| 9 | 2g comparisons (43 % vs 0.1 % at 2 min; 2.2 → 5.0 min; logistic 2.5 → 20 min, 10 min at 1e4) | **All correct.** 43.4 %, 0.11 %, 2.17 / 5.0 min, 2.45 / 19.7 / 10.1 min. |
| 10 | Quorum Sensing ∫N² with 2A | **Correct** (cap K²). |
| 11 | Biofilm `K × 1.5` vs Bigger Colonies `c × 2` | **Ambiguous order.** `1.5·B(1+c)` vs `B(1+1.5c)`. They differ slightly, and Biofilm also multiplies the bought-host floor. |
| 12 | Recombinase RP × 1.5 | **Ambiguous:** before or after floor? After floor, it rounds 1 RP to 1 at first unlock. |
| 13 | Antigenic Drift `1 + 0.05·R` | **Correct**, linear in R. Weak next to L ~ n². |
| 14 | Perk prices, Primed Inoculum, Cold Storage | **Unverifiable.** No prices given. With L reaching ~3e4 in 5 h, linear prices make RP meaningless quickly. |

The clearance formulas were also checked and are correct: the fold into `K' = K·e^(−f)`, the
`A < 0` `Ei` branch, the alert percentages, and the 78–233 s shrink time. They moved to
prestige.md §8 together with the notes on them, including the missing `Ei` small-argument
guard.

**Numeric range:** fine. After 5 h, lifetime RP ≈ 3e4, bonus ×3e3, production ≈ 2e13/s.
N ≈ 1e5 per host as a plain number is safe. Store RP and lifetime RP as Decimal or check
they stay < 2^53; at n² growth they will.

**Tick/offline consistency:** correct by construction while B and the rates are constant
during a step. Without alerts, offline progress is a single closed-form step with no
splitting.

---

## 4. What's working
- Lifetime-RP bonus with spending never lowering output: a good anti-feels-bad rule.
- Closed forms make `update(dt)` and offline progress the same code path. The derivations
  are right, and the underflow analysis caught a real bug.
- Gompertz over logistic is well argued. Fill time only grows with ln ln c, and the cap
  bounds growth on its own, so any opposing force can stay optional.
- The fill ramp gives a natural minimum run length. That brake is useful once it is
  tuned on purpose.
- Pure-logic placement, the `requires` gating, and owned-implies-unlocked handling for
  Viral Memory all fit CLAUDE.md.
- Autobuyers in `update()` so the sim can use them, and not running offline in v1: good
  scoping.

---

## 5. Open questions
1. What is the target run length after run 2? (It currently falls out of b.) Should run
   lengths grow over time? The lifetime-banked formula makes them grow.
2. Is the ×1000 jump at the first perk intended, or should colonies start small and grow?
3. Should RP use lifetime production (recommended) or this run's production? If lifetime,
   what bonus increase should the UI suggest resetting at?
4. If Mutations are released in waves, how many waves are there, and at which
   Recombination counts?
5. Is the passive bonus multiplicative with Mutations and colony size? Is Recombinase
   applied before floor?
6. Does Biofilm scale K or c?
7. What are the perk price curves? Are they geometric per level?
8. How should existing v3 saves with large `totalProduced` be treated? (A 4 h save gets
   ~5 RP on load. Is that fine?)

Questions about alerts and clearance (thresholds, `f_step`, duplicate counters, whether
Quorum Sensing uses K or K') moved to prestige.md §8.

---

## 6. Before building
1. Re-phase so the first reset ships with Lysogenic Takeover. Consider bringing the host
   autobuyer forward too.
2. Decide on the RP formula. The recommendation is lifetime-banked (§2.2). Update §1 of
   prestige.md, the gain preview and the tuner targets to match.
3. Build the multi-run sim first, with a steady-state host valuation for
   `greedyPayback`. Simulate 10+ resets. Report run lengths per reset, and give the sim a
   "reset when the bonus grows by X %" strategy for the lifetime formula.
4. Prototype c ∈ {10, 100, 1000} and pick by "Mutations still matter in run 2". c = 10
   passed that test in the follow-up. If Mutations come in waves, set each wave's
   `requires: { recombinations: n }` and prices from the sim.
5. Collapse the duplicate capacity upgrades (Bigger Colonies, Biofilm, Quorum Hijack).
