# Roadmap

Ideas for after the prototype. Not in priority order, except that prestige is next.

## Prestige: Recombination (next)
Once every Mutation is owned (~30-45 min for greedyPayback) only hosts are left to
buy, and the sim shows ever-longer walls from about 1h 15m. Prestige fills that gap.
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
- [x] Improve the current balance: replaced "q4" with "A3" (`costGrowth` 1.55 to 1.3, every host rate at least 5x the previous tier). Passes every tuner target: T 31m 38s, longest gap 4m 08s
- [x] Give `--search` a tie-breaker once all targets pass: lower `costGrowth`, then wider host rate gaps (`SEARCH` in `tools/sim/tune.js`). Lower `costGrowth` alone drove every run to the 1.05 floor, which passed the tuner but ran away after T, so the range now starts at 1.2
- [ ] cheapestFirst finishes its Mutations at ~2h with ~28 min between each of its last three (Actin Rocket, Sugar Coating, Serial Passage); the tuner only scores greedyPayback, so this is invisible to it. Revisit after prestige changes the late game

## Developer tools
- [x] Cheapest-first sim strategy
- [ ] Add more sim strategies (e.g. save up for the next Mutation, buy hosts in ×10 batches)
