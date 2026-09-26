# Viral Load

A small browser idle game. You are a microscopic virus loose in a laboratory
petri dish, and your only goal is to make more of yourself.

Infect bacteria to produce **virions**, spend them on more hosts, and buy
**mutations** that speed everything up. Production keeps going while you're
away (up to 8 hours).

## Play
Open `index.html` in a browser, or serve the folder with any static server
(e.g. VS Code Live Server). It also runs as-is on GitHub Pages.

Progress saves automatically to your browser's localStorage. Use
**Settings** to export or import a save, or to hard reset.

## Tech
Plain HTML, CSS, and JavaScript with no build step.
[break_infinity.js](https://github.com/Patashu/break_infinity.js) handles
the very large numbers. See `CLAUDE.md` for project conventions and
`docs/roadmap.md` for planned features.
