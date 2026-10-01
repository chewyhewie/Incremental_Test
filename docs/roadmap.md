# Roadmap

Ideas for after the prototype. Not in priority order.

## Prestige: Recombination
- [ ] Reset progress to earn **Recombination Points (RP)** based on total virions produced
- [ ] RP give a permanent production multiplier
- [ ] RP shop with permanent perks (starting virions, cheaper hosts, faster offline gains)
- [ ] Track lifetime stats across resets

## Replication speed (tickspeed), after prestige
Only meaningful once production compounds; with flat per-host rates it equals an output multiplier.
- [ ] Compounding production: higher-class hosts spawn lower-class hosts, and/or virion growth proportional to current virions
- [ ] `getTickspeed()` scales the dt fed to production only (`produce(dt * tickspeed)`); event/buff timers stay on real time
- [ ] New Mutation `effect.kind: "speed"`; consider converting Rapid Translation to it
- [ ] Offline progress must use the same scaled time (closed form or chunked simulation); `rate × seconds` no longer works
- [ ] Save-shape change: bump `CONFIG.saveVersion` and add a `migrateSave()` step

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
- [ ] Buy ×1 / ×10 / ×max toggle
- [ ] Statistics page (time played, total produced, highest virions/sec)
- [ ] Choice of number notation (scientific, engineering, letters)
- [ ] Manual "Save now" button and last-saved indicator
- [ ] Keyboard shortcuts

## Audio
- [ ] Sound effects (purchase, upgrade, achievement)
- [ ] Optional ambient lab background loop
- [ ] Mute / volume setting (saved)

## Balance
- [ ] Improve the current balance (applied from a 6-minute search, "q4"). It passes every tuner target, but longer searches could likely lower `costGrowth` (now 1.55) and smooth the pacing: the longest stretch without a first buy is 4m 22s against a 5 min limit, and Host Shutdown sits at the extreme 0.1x
- [ ] Give `--search` a tie-breaker once all targets pass (e.g. prefer T near 35 min, even first-buy spacing, lower `costGrowth`, wider rate steps between host tiers); today a passing config scores 0 and the search has nothing left to aim for

## Developer tools
- [x] Cheapest-first sim strategy
- [ ] Add more sim strategies (e.g. save up for the next Mutation, buy hosts in ×10 batches)
