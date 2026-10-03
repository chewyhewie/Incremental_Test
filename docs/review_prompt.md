You're reviewing a design plan for a new prestige layer (or comparable major feature) in a browser-based incremental game. The designer wants a high-level review: is the core idea sound, does it fit the existing game, and what are the biggest risks before any code gets written. This is not a line edit and not a balance pass. Don't tune individual numbers unless a number reveals a structural problem, such as a gain formula that makes resetting immediately always optimal.

<game_context>
Refer to CLAUDE.md
</game_context>

<design_doc>
[Paste the design plan here.]
</design_doc>

<focus>
[Optional: anything the designer specifically wants scrutinized, or wants you to leave alone. Delete this block if unused.]
</focus>

## How to approach the review

Before reviewing, read the relevant parts of the codebase (existing layer logic, gain formulas, save format) to ground your understanding of the current game, and note anywhere the design doc conflicts with how things actually work. Read the whole document before forming opinions. Evaluate it the way an experienced incremental game designer would: someone who has played and dissected many games in the genre and knows where prestige layers typically succeed and fail.

These are the lenses that matter most. Not all will apply. Skip what isn't relevant rather than padding.

The reset bargain. A prestige layer asks players to throw away progress. Does the plan make that feel like a reward rather than a punishment? Look at what resets and what persists, how quickly the player recovers lost ground, and what they get that they couldn't get any other way. Check the shape of the gain formula: is there a sensible, discoverable optimal reset point, or does it degenerate into reset-spamming or never resetting?

Fit with existing layers. Does the new layer give earlier mechanics new relevance or make them obsolete? Does it speed up earlier content so re-runs feel fast, or will players grind the same early game for the tenth time? Is tedium automated away at the right moment (auto-buyers, auto-resets of lower layers)?

Novelty versus multiplier creep. Does the layer introduce a genuinely new mechanic or decision space, or is it mostly a bigger multiplier on existing numbers? The latter isn't automatically bad, but it should be a deliberate choice.

Pacing. Consider time to first reset, time between resets, and the shape of progress over the layer's lifespan. Where are the walls, and are they intentional? Does growth risk running away (stacking exponents) or stalling? Does the plan account for both active and idle or offline play?

Onboarding and clarity. At the moment of first unlock, will a player understand what they're about to lose, what they'll gain, and why they'd want to do it? Does the UI preview gains before the reset?

Long-term structure. Does this layer leave room for future content, or paint the game into a corner with number scales that blow past what's manageable, mechanics that will be awkward to extend, or currencies that become meaningless later?

Scope and implementation risk. Is the scope proportionate to the payoff? Flag anything that looks expensive or bug-prone: save migration for existing players, big-number precision limits, tick-loop performance, interactions between many stacked multipliers. If the plan is large, suggest what a smaller first version could look like.

Decisions and depth. Are the choices meaningful tradeoffs that vary by situation, or is there one obvious path? Watch for trap options and strictly dominated upgrades.

Distinguish clearly between three kinds of feedback: things the plan gets wrong, things it doesn't address, and things that are a matter of taste. A missing section is a different problem from a bad decision, and the designer should be able to tell which you mean.

If the game context is thin, don't invent details about the existing game. State the assumption you're making, or turn it into a question.

Be direct. If you think the core premise is flawed, say so up front rather than burying it under minor notes. Equally, don't manufacture problems to seem thorough. If a section is solid, one sentence saying so is enough.

## Checking the math

Separately from the design review, verify the document's math. This is different from the balance tuning excluded above. You're not judging whether a constant feels right; you're checking that each formula is correct, does what the doc says it's meant to do, and behaves sensibly across the full range of values a player will actually reach.

Start by listing every formula in the doc: production, costs, prestige gain, the effects of the new currency, softcaps, and anything else expressed as an equation. Then check each one individually.

Compare it to its stated intent. If the doc says "gain roughly doubles for every 10x more points," confirm the formula actually does that. A gain formula of (points / 1e10)^0.3 does, since 10^0.3 ≈ 2, but an exponent of 0.5 would roughly triple it instead. Mismatches between the prose and the equation are one of the most common errors in design docs.

Recompute any worked examples, tables or milestone numbers in the doc rather than trusting them.

Evaluate the formula at concrete points: just below the unlock threshold, at the threshold, at the expected first reset, at a typical mid-layer value and at the far end of the layer. Watch for edge cases such as floor or rounding producing zero gain at unlock, division by zero, logarithms of values below 1 going negative, and anything that makes having more of a resource worse.

Then check how the formulas behave together as a system.

Growth class and feedback loops. Identify whether each key quantity grows polynomially, exponentially or faster over time, and how the new layer's effects compose with existing multipliers. Pay particular attention to loops where a resource boosts its own production: if production scales with the amount held raised to a power k, then k below 1 gives polynomial growth, k equal to 1 gives exponential growth, and k above 1 blows up in finite time. Apply the same check across resets. If each prestige multiplies the next run's gains, work out the per-cycle growth factor and whether it accelerates. Compare cost scaling against production scaling, since the gap between them is what creates walls and sets pacing.

The optimal reset point. Model prestige gain per unit of time as a function of when the player resets, and find where it peaks. Report whether an optimum exists, roughly when it falls, and whether a player could plausibly find it.

Softcaps and breakpoints. Check that each one is continuous at its threshold (no sudden jump or drop), that the function stays monotonic, and that the softcapped region still meaningfully rewards progress.

Numeric range and precision. Estimate the largest values this layer will produce. Plain JavaScript numbers top out around 1.8e308; beyond that the game needs break_infinity.js, and beyond roughly 1e(9e15) it needs break_eternity.js. Flag places where floating-point precision could cause problems, like adding small increments to very large totals.

Order of operations. Flag anywhere the doc is ambiguous about whether bonuses are additive or multiplicative with each other, or whether exponents apply before or after multipliers. These choices change results by orders of magnitude, and the doc should state them explicitly.

Tick and offline consistency. If anything compounds per tick, results will depend on tick rate and won't match an offline-progress calculation unless the doc accounts for that.

Show your work with numbers rather than reasoning alone; a small table of computed values is more useful than a paragraph. If you can run code, use it to compute values and simulate a few reset cycles, but don't create or modify any project files. Where the doc doesn't give enough to check something, such as a missing constant or an undefined variable, say exactly what's missing instead of inventing a value.

Classify each finding as an error (the math is wrong or doesn't match the stated intent), a risk (the math is correct but behaves badly in some range), or unverifiable (not enough information to check).

## Output format

1. Overall read (2–4 sentences): your honest top-line assessment. Is this ready to build, close with changes, or in need of rethinking?
2. Major concerns, ranked by importance: for each, what the issue is, why it matters for the player experience, and a concrete suggestion or direction. Label each as "wrong," "missing," or "taste."
3. Math check: list each formula with a one-line verdict (correct, error, risk or unverifiable), then give detail and the values you computed for anything that isn't correct. Any error serious enough to change the design should also appear in Major concerns. This section can run longer than the five-minute target for the rest of the review.
4. What's working: brief notes on the parts worth protecting during revision.
5. Open questions: things the doc leaves ambiguous that the designer should decide before implementation.
6. Before building: the short list of things you'd want resolved or prototyped first (for example, "simulate the gain formula over the first ten resets").