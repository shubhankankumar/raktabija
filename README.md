# Raktabija

One cockroach against every chappal in the house. A battle on a polished marble kitchen floor.

Named after Raktabija, the demon from the Devi Mahatmya whose every drop of blood rose as another of him.

## Play

- Move with the arrow keys / WASD, or hold the mouse button / a finger where you want to run. The roach runs at a real top speed toward it and stops dead when you let go.
- Chappals fall under gravity: the dark shadow on the floor is where one lands. Red rings mark thrown ones and the giant one.
- Three near misses (a landing just beside you) fill the blood meter.
- A full meter births a baby roach that follows you. Each one adds +50% to your score rate, but a chappal can squash them.
- You have three lives. Waves 4 and 5 drop a giant chappal on where you stand: when the red ring appears, move.
- `P` or `Esc` pauses, `M` toggles sound.
- `Q` (during a run) toggles god mode for testing: chappals and boss strikes pass through you. It stays on across restarts until you press `Q` again.

Five waves; the last one never ends and keeps getting harder.

## Run

ES modules need a web server (opening `index.html` from disk will not work). Both commands below serve the same static files; use whichever you have installed:

```sh
npm start              # npx serve on http://localhost:8080
# or
python -m http.server 8080
```

## Test

```sh
npm test               # node --test, no dependencies
npm run format         # prettier, settings in .prettierrc.json
```

## Layout

```
index.html        screens: menu, HUD, pause, game over
css/tokens.css    colour, type and spacing tokens
css/base.css      reset and base rules
css/style.css     game screens and HUD
js/config.js      wave table and tuning numbers
js/game.js        simulation (pure, no DOM; tested)
js/render.js      three.js scene
js/vendor/        three.js 0.160.0, cut down to the parts render.js uses (tools/vendor-three.sh)
css/fonts.css     self-hosted fonts (files in fonts/)
js/audio.js       synthesised sound effects
js/main.js        boot, input, loop, screen switching
tests/            node:test suite for game.js, plus a check that js/vendor has every part render.js uses
tools/deploy.sh   publish to Cloudflare Pages
```

Everything is modelled from three.js primitives (the roach is an American cockroach, the chappal a blue-strap Hawai), so there are no image assets. The simulation steps at a fixed 120 Hz. Every colour lives in `css/tokens.css`. Fonts are Big Shoulders Display and Barlow (SIL Open Font License), served from this site with system fallbacks.

## Deploy

```sh
sh tools/deploy.sh preview   # private preview URL to check first
sh tools/deploy.sh           # live: https://raktabija.pages.dev
```

It runs the tests, then uploads only `index.html`, `_headers`, `css/`, `fonts/` and `js/`. Security headers live in `_headers`. The page loads nothing from other sites, so the CSP is `'self'` only. If you use a new `THREE.*` name in `js/render.js`, run `sh tools/vendor-three.sh` (`npm test` reminds you).
