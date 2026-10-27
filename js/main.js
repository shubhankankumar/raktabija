// Boot, input, the frame loop and the DOM screens.
import { createGame, resize, update, currentLevel } from './game.js';
import { METER_MAX, LEVELS } from './config.js';
import { createRenderer } from './render.js';
import { unlock, setMuted, sfx } from './audio.js';

const STEP = 1 / 120; // fixed simulation step: same physics at 60, 144 or 240 Hz
const MAX_STEPS = 12; // after a stall, drop time instead of spiralling

const $ = (id) => document.getElementById(id);
const canvas = $('arena');
const ui = {
  hud: $('hud'),
  score: $('hud-score'),
  wave: $('hud-wave'),
  level: $('hud-level'),
  swarm: $('hud-swarm'),
  hp: $('hud-hp'),
  meter: $('hud-meter'),
  banner: $('banner'),
  vignette: $('vignette'),
  menu: $('menu'),
  pause: $('pause'),
  over: $('over'),
  best: $('menu-best'),
  overScore: $('over-score'),
  overLevel: $('over-level'),
  overSwarm: $('over-swarm'),
  overBest: $('over-best'),
  mute: $('btn-mute'),
  god: $('hud-god'),
};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage blocked: play on without saving */
    }
  },
};
let best = Number.parseInt(store.get('raktabija.best'), 10) || 0;
let muted = store.get('raktabija.muted') === '1';
setMuted(muted);

function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    paper: v('--color-paper'),
    wall: v('--wall'),
    ground: v('--ground'),
    cloud: v('--cloud'),
    vein: v('--vein'),
    seam: v('--seam'),
    gloss: v('--gloss'),
    shell: v('--roach-shell'),
    shellDark: v('--roach-shell-dark'),
    margin: v('--roach-margin'),
    leg: v('--roach-leg'),
    nymph: v('--roach-nymph'),
    foot: v('--chappal-foot'),
    shade: v('--chappal-foot-shade'),
    rim: v('--chappal-rim'),
    strap: v('--chappal-strap'),
    strapDark: v('--chappal-strap-dark'),
    blood: v('--color-blood'),
    dust: v('--color-dust'),
    alert: v('--color-alert'),
  };
}

const view = createRenderer(canvas, readPalette());
let game = createGame(innerWidth / innerHeight);
let state = 'menu'; // menu | play | pause | over
let last = 0,
  acc = 0;
let bannerTimer = 0;
let god = false; // Q: test mode, survives restarts until toggled off

function fit() {
  resize(game, innerWidth / innerHeight);
  view.resize(innerWidth, innerHeight, devicePixelRatio || 1, game);
}

// ---- screens ----

function show(next) {
  state = next;
  keys.clear(); // a key held while a screen opened (or the tab lost focus) never gets its keyup

  ui.menu.hidden = next !== 'menu';
  ui.pause.hidden = next !== 'pause';
  ui.over.hidden = next !== 'over';
  ui.hud.hidden = next === 'menu';
  canvas.classList.toggle('is-playing', next === 'play');
  if (next === 'menu') {
    ui.vignette.className = 'vignette';
    game = createGame(innerWidth / innerHeight);
    fit();
  }
  const focus = { menu: 'btn-play', pause: 'btn-resume', over: 'btn-again' }[next];
  if (focus) $(focus).focus({ preventScroll: true });
}

function start() {
  unlock();
  game = createGame(innerWidth / innerHeight);
  game.god = god;
  fit();
  hud.reset();
  ui.vignette.className = 'vignette';
  banner(currentLevel(game).name, `Wave 1 of ${LEVELS.length}`);
  sfx.wave();
  acc = 0;
  show('play');
}

// not while dying: the game-over screen only opens from 'play', so pausing then would strand the run
function pause() {
  if (state === 'play' && !game.over) show('pause');
}
function resume() {
  if (state === 'pause') {
    last = performance.now();
    show('play');
  }
}

function gameOver() {
  const score = Math.floor(game.score);
  const isBest = score > best;
  if (isBest) {
    best = score;
    store.set('raktabija.best', String(best));
  }
  ui.overScore.textContent = score.toLocaleString();
  ui.overLevel.textContent = `Wave ${game.level + 1}, ${currentLevel(game).name}`;
  ui.overSwarm.textContent = game.swarm.length;
  ui.overBest.textContent = isBest ? 'New best' : best.toLocaleString();
  renderBest();
  setTimeout(() => {
    if (state === 'play') show('over');
  }, 1100); // let the splat land first
}

function renderBest() {
  ui.best.textContent = best ? best.toLocaleString() : 'none yet';
}

function banner(title, sub, alert = false) {
  ui.banner.querySelector('span').textContent = sub;
  ui.banner.querySelector('strong').textContent = title;
  ui.banner.classList.toggle('is-alert', alert);
  ui.banner.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    ui.banner.hidden = true;
  }, 1700);
}

function flashHit() {
  if (reducedMotion.matches) return;
  ui.vignette.classList.add('is-hit');
  setTimeout(() => ui.vignette.classList.remove('is-hit'), 90);
}

// HUD writes only when a shown value changes
const hud = {
  prev: {},
  reset() {
    this.prev = {};
  },
  set(key, value, apply) {
    if (this.prev[key] !== value) {
      this.prev[key] = value;
      apply(value);
    }
  },
  sync(g) {
    this.set('score', Math.floor(g.score).toLocaleString(), (v) => {
      ui.score.textContent = v;
    });
    this.set('wave', g.level, (v) => {
      ui.wave.textContent = `Wave ${v + 1} of ${LEVELS.length}`;
      ui.level.textContent = currentLevel(g).name;
    });
    this.set('swarm', g.swarm.length, (v) => {
      ui.swarm.textContent = v;
    });
    this.set('hp', g.hp, (v) => {
      [...ui.hp.children].forEach((pip, i) => pip.classList.toggle('is-lost', i >= v));
      ui.hp.setAttribute('aria-valuenow', v);
      ui.vignette.classList.toggle('is-critical', v === 1);
    });
    this.set('meter', Math.round((g.meter / METER_MAX) * 50) / 50, (v) => {
      ui.meter.style.setProperty('--fill', v);
      ui.meter.setAttribute('aria-valuenow', Math.round(v * 100));
    });
  },
};

// ---- game events → sound and UI ----

function drainEvents() {
  for (const e of game.events) {
    switch (e.type) {
      case 'hit':
        sfx.hit();
        flashHit();
        break;
      case 'land':
        sfx.land(Math.min(1, e.impact / 25));
        break;
      case 'throw':
        sfx.whoosh();
        break;
      case 'slam':
        sfx.slam();
        break;
      case 'slam-warn':
        sfx.slamWarn();
        break;
      case 'graze':
        sfx.graze();
        break;
      case 'birth':
        sfx.birth();
        if (!e.full) banner('A soldier rises', `Swarm of ${e.swarm}`);
        break;
      case 'baby-lost':
        sfx.babyLost();
        break;
      case 'level':
        sfx.wave();
        banner(e.name, `Wave ${e.level + 1} of ${LEVELS.length}${e.boss ? ', the giant chappal' : ''}`, e.boss);
        break;
      case 'death':
        sfx.death();
        flashHit();
        gameOver();
        break;
    }
  }
  game.events.length = 0;
}

// ---- input ----

const keys = new Set();
const KEY_DIR = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  a: [-1, 0],
  d: [1, 0],
  w: [0, -1],
  s: [0, 1],
};

// mouse/trackpad steers on hover; touch runs only while the finger is down. Lift or leave and it stops dead
function aim(e) {
  if (state !== 'play' || (e.pointerType !== 'mouse' && !e.buttons)) return;
  // on touch, keep the roach above the finger so it stays visible
  const lift = e.pointerType === 'touch' ? 70 : 0;
  game.target = view.pick(e.clientX, e.clientY - lift, game.target || {});
}
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  aim(e);
});
canvas.addEventListener('pointermove', aim);
for (const t of ['pointerup', 'pointercancel', 'pointerleave'])
  canvas.addEventListener(t, (e) => {
    if (e.type !== 'pointerup' || e.pointerType !== 'mouse') game.target = null;
  });

addEventListener('keydown', (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.repeat && !KEY_DIR[k]) return; // holding P, M or Q must not flicker the toggle
  if (k === 'p' || k === 'Escape') {
    state === 'play' ? pause() : resume();
    return;
  }
  if (k === 'm') {
    toggleMute();
    return;
  }
  if (k === 'q' && state === 'play') {
    god = game.god = !god;
    ui.god.hidden = !god;
    banner(god ? 'God mode' : 'Mortal again', god ? 'Testing: chappals pass through' : 'Testing off');
    return;
  }
  if (state === 'play' && KEY_DIR[k]) {
    keys.add(k);
    game.target = null;
    e.preventDefault();
  }
});
addEventListener('keyup', (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));

function readKeys() {
  let x = 0,
    z = 0;
  for (const k of keys) {
    x += KEY_DIR[k][0];
    z += KEY_DIR[k][1];
  }
  game.steer.x = x;
  game.steer.z = z;
}

function toggleMute() {
  muted = !muted;
  setMuted(muted);
  store.set('raktabija.muted', muted ? '1' : '0');
  renderMute();
}

function renderMute() {
  ui.mute.textContent = muted ? 'Sound off' : 'Sound on';
}

$('btn-play').addEventListener('click', start);
$('btn-again').addEventListener('click', start);
$('btn-resume').addEventListener('click', resume);
$('btn-pause').addEventListener('click', pause);
for (const id of ['btn-quit', 'btn-menu']) $(id).addEventListener('click', () => show('menu'));
ui.mute.addEventListener('click', toggleMute);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
addEventListener('blur', pause);
addEventListener('resize', fit);

// ---- loop ----

function frame(now) {
  acc = Math.min(acc + (now - last) / 1000, STEP * MAX_STEPS);
  last = now;
  if (state === 'play') {
    readKeys();
    for (; acc >= STEP; acc -= STEP) update(game, STEP);
    drainEvents();
    hud.sync(game);
  } else {
    acc = 0;
  }
  view.draw(game, state === 'menu', now / 1000, reducedMotion.matches);
  requestAnimationFrame(frame);
}

fit();
renderBest();
renderMute();
show('menu');
requestAnimationFrame((t) => {
  last = t;
  frame(t);
});
