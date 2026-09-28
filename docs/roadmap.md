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

## Developer tools
- [x] Cheapest-first sim strategy
- [ ] Add more sim strategies (e.g. save up for the next Mutation, buy hosts in ×10 batches)
