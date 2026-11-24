# Raktabija

You are one cockroach on a polished marble kitchen floor, and every chappal in the house is coming for you.

Play it here: **https://raktabija.pages.dev**

The name comes from Raktabija, the demon in the Devi Mahatmya. Every drop of his blood that touched the ground turned into another Raktabija. Here, every close call makes another roach.

## How to play

Move with the arrow keys or WASD. With a mouse or on a phone, hold down where you want to go and the roach runs there. It has a real top speed and it stops the moment you let go.

Chappals fall with gravity. The dark shadow on the floor is where one is going to land, so watch the shadows, not the chappals. Thrown chappals and the giant one get a red ring.

When a chappal lands right next to you without hitting you, that's a near miss. Three near misses fill the blood meter, and a full meter gives birth to a baby roach that follows you around. Each baby adds 50% to how fast your score goes up. Babies can get squashed too, so keep them out of the way. You can have up to 12.

You get three lives.

### Controls

**P** or **Esc** pauses, **M** toggles sound, and **Q** toggles god mode.

God mode lets chappals pass straight through you. It stays on across restarts until you press Q again, and any run where you used it won't count as your best score.

### The waves

1. **First blood.** Slow drops, mostly random.
2. **They know.** Faster, and more of them are aimed at you.
3. **Crossfire.** Now they also get thrown from the side.
4. **Mummy is home.** A giant chappal starts slamming down where you're standing. When the red ring shows up, move.
5. **Raktabija.** Everything at once. This wave never ends, so it's about how long you last.

## Run locally

The game uses ES modules, so the browser won't load it straight from a file. Serve the folder with either of these:

```sh
npm start
```

or

```sh
python -m http.server 8080
```

Then open http://localhost:8080.

## Project structure

The game logic in `js/game.js` doesn't touch the DOM at all. It just takes input and time and updates the state, which is why it can be tested in Node. It steps at a fixed 120 times a second no matter what your screen refresh rate is.

`js/render.js` draws everything with three.js. There are no images anywhere. The roach (modelled on an American cockroach) and the blue-strap Hawai chappal are built entirely from three.js shapes. Sound effects are synthesised in `js/audio.js` instead of loaded from files.

All the difficulty numbers (wave lengths, how often chappals fall, how many are aimed at you, gravity, the near-miss distance) live in `js/config.js`, so balancing the game means editing one file.

```
index.html        menu, HUD, pause and game-over screens
css/tokens.css    every colour, font size and spacing value
css/base.css      reset
css/style.css     screens and HUD
css/fonts.css     font faces
fonts/            Big Shoulders Display and Barlow (SIL Open Font License)
js/config.js      waves and tuning
js/game.js        the simulation
js/render.js      the three.js scene
js/audio.js       sound
js/main.js        startup, input, game loop, switching screens
js/vendor/        three.js 0.160.0, trimmed to what render.js needs
tests/            node:test suites
tools/            deploy and vendoring scripts
```

## Tests

```sh
npm test
```

This runs the simulation tests and a check that the cut-down three.js build still has every piece `render.js` uses. There are no packages to install.

`npm run format` runs Prettier. CI runs the tests on every push to main and every pull request.

## Deploy

It's hosted on Cloudflare Pages.

```sh
sh tools/deploy.sh preview   # private preview link
sh tools/deploy.sh           # live site
```

The script runs the tests first and only uploads `index.html`, `_headers`, `css`, `fonts` and `js`.

The page doesn't load anything from any other site. Fonts and three.js are served from the same place as the game, so the content security policy in `_headers` only allows `'self'`.

If you start using a new `THREE` class in `render.js`, run `sh tools/vendor-three.sh` to rebuild the trimmed copy. `npm test` will remind you if you forget.

There's also `tools/redirect-worker.js`, a tiny Cloudflare Worker that forwards the old workers.dev address to the Pages site.
