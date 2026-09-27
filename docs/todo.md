Todo:
3. Rapid Translation multiplies output by 1.5 because production is continous - implement tickspeed.
5. Balance and pacing
6. Implement first prestige

Brainstorming section:
- Prestige (Recombination)
    - Bacterial anti-viral mechanisms (restriction enzymes, CRISPR, cGAS-STING, see Rotem Sorek)
    - Maybe some type of Red Queen mechanics
    - Maybe some branching paths - lytic/temperate phages
    - Maybe development of anti-defence proteins
    - Maybe development of better infection mechanisms
- Infect higher organisms (stage 2)
    - Start having to deal with immune systems
- Infect human cells (stage 3?)

List of names:
E. coli
S. typhimurium
V. cholerae
L. monocytogenes
M. tuberculosis

Bacilis
Staphylococcus
Neisseria
Helicobacter
Legionella

Reminder:
Claude.md rule 4

Simulation script prompt:
I want to add a Node.js balance-simulation script to this project. It
should play through the game's economy at high speed and report how long
milestones take, so I can tune balance numbers without clicking through
the game manually. Before writing any code, read the current js/ files,
then show me a plan and wait for my approval.

## Hard requirements
- The simulator must use the game's actual formulas and config.js
  values, not a duplicated copy. If the current code structure makes
  that impossible (e.g. formulas mixed into UI code or relying on
  browser globals), propose the smallest refactor that separates pure
  game logic (costs, production, upgrade effects) from browser-only code
  (DOM, localStorage). Explain the options and trade-offs in the plan.
- The game itself must still run exactly as before: plain static files,
  no build step, works with Live Server and on GitHub Pages. Node is a
  developer tool only; players never need it.
- Put simulator code in a sim/ folder. If you add a package.json (e.g. to
  install break_infinity.js for Node), add node_modules/ to .gitignore.
- Add an npm script so I can run it with `npm run sim`.

## How the simulated player behaves
- Time advances in fixed steps (default 1 second of game time).
- Clicks per second is a setting. Run two profiles by default:
  "idle" (0 clicks/sec) and "active" (5 clicks/sec).
- Buying strategy: each step, buy whatever gives the best payback
  (cost divided by the production gained); buy upgrades as soon as
  affordable if they pay back faster than any generator. Keep this
  strategy in its own function so I can add others later.
- Stop after a configurable amount of game time (default 4 hours).

## Report
For each profile, print a readable table to the console showing the game
time at which the player:
- first buys each generator and each upgrade
- reaches each power of 10 in virions (1e3, 1e6, 1e9, ...)
Also flag "walls": any gap longer than 5 minutes with no purchase.
Save the same results as a CSV in sim/results/ (gitignored) so I can
chart them later.

## Rules
- Do not change any balance numbers in config.js. Report only; I'll
  decide what to tune.
- Offline progress is out of scope for now.
- Keep the simulator fast: 4 hours of game time should run in a few
  seconds.

## Also
- Update CLAUDE.md with a short section on the simulator: how to run
  it, and the rule that game logic must stay in the shared pure-logic
  files so the simulator remains accurate.
- Add a line to docs/roadmap.md: "Add more sim strategies (e.g. only
  buy cheapest item)."

## Done when
`npm run sim` prints milestone tables for both profiles, the CSV is
written, and the game still works unchanged in the browser.