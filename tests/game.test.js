import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, update, spawnDrop, spawnThrow, spawnSlam, birth, chappalDist } from '../js/game.js';
import { LEVELS, MAX_HP, METER_MAX, PLAYER_SPEED, GRAVITY, DROP_HEIGHT } from '../js/config.js';

// deterministic rng
const seeded = (s = 1) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
const quiet = (g) => { g.volleyTimer = Infinity; g.slamTimer = Infinity; return g; };
const run = (g, secs, dt = 1 / 120) => { for (let t = 0; t < secs; t += dt) update(quiet(g), dt); };
const dropOn = (g, x, z) => { const c = spawnDrop(g, false); c.x = c.tx = x; c.z = c.tz = z; return c; };

test('score grows over time, faster with a swarm', () => {
  const a = quiet(createGame(16 / 9, seeded()));
  const b = quiet(createGame(16 / 9, seeded()));
  birth(b); birth(b);
  run(a, 1); run(b, 1);
  assert.ok(a.score > 9 && a.score < 11);
  assert.ok(b.score > a.score * 1.9);
});

test('the roach runs at a capped speed, not straight to the cursor', () => {
  const g = quiet(createGame(16 / 9, seeded()));
  g.player.x = -5; g.player.z = 0;
  g.target = { x: 5, z: 0 };
  run(g, 0.5);
  assert.ok(g.player.x - -5 <= PLAYER_SPEED * 0.5 + 1e-6, 'no teleporting');
  run(g, 4);
  assert.ok(Math.abs(g.player.x - 5) < 0.05, 'arrives and settles');
  assert.ok(Math.hypot(g.player.vx, g.player.vz) < 0.1);
});

test('a chappal falls under gravity, not at a constant drift', () => {
  const g = quiet(createGame(16 / 9, seeded()));
  const c = dropOn(g, 4, 4);
  run(g, 0.4);
  assert.ok(Math.abs(c.vy + GRAVITY * 0.4) < 0.2, 'speed grows linearly with time');
  assert.ok(Math.abs(DROP_HEIGHT - c.y - 0.5 * GRAVITY * 0.16) < 0.1, 'distance grows with t²');
});

test('a drop landing on the roach costs a life and grants invulnerability', () => {
  const g = quiet(createGame(16 / 9, seeded()));
  dropOn(g, g.player.x, g.player.z);
  run(g, 1.2);
  assert.equal(g.hp, MAX_HP - 1);
  dropOn(g, g.player.x, g.player.z);
  g.invuln = 5;
  run(g, 1.2);
  assert.equal(g.hp, MAX_HP - 1, 'no damage while invulnerable');
});

test('a chappal overhead does not hurt until it comes down', () => {
  const g = quiet(createGame(16 / 9, seeded()));
  dropOn(g, g.player.x, g.player.z);
  run(g, 0.5);
  assert.equal(g.hp, MAX_HP);
});

test('god mode: chappals pass through without damage', () => {
  const g = quiet(createGame(16 / 9, seeded()));
  g.god = true;
  dropOn(g, g.player.x, g.player.z);
  run(g, 1.2);
  assert.equal(g.hp, MAX_HP);
});

test('three hits end the game', () => {
  const g = quiet(createGame(16 / 9, seeded()));
  for (let i = 0; i < 3; i++) { g.invuln = 0; dropOn(g, g.player.x, g.player.z); run(g, 1.2); }
  assert.equal(g.over, true);
});

test('near misses fill the meter and a full meter births a roach', () => {
  const g = quiet(createGame(16 / 9, seeded()));
  for (let i = 0; i < 3; i++) {
    const c = dropOn(g, g.player.x, g.player.z);
    c.yaw = 0; c.z += g.player.r + c.r + 0.2; // lands just beside, lengthwise
    run(g, 2);
  }
  assert.equal(g.hp, MAX_HP);
  assert.equal(g.swarm.length, 1);
  assert.ok(g.meter < METER_MAX);
});

test('a thrown chappal lands where the roach stood', () => {
  const g = quiet(createGame(16 / 9, seeded(5)));
  const c = spawnThrow(g);
  g.god = true;
  let landed = null;
  for (let t = 0; t < 3 && !landed; t += 1 / 120) { update(quiet(g), 1 / 120); if (c.touched) landed = { x: c.x, z: c.z }; }
  assert.ok(landed);
  assert.ok(Math.hypot(landed.x - g.player.x, landed.z - g.player.z) < 0.3);
});

test('spent chappals settle and are cleared', () => {
  const g = quiet(createGame(16 / 9, seeded(3)));
  g.god = true;
  for (let i = 0; i < 10; i++) { spawnThrow(g); spawnDrop(g, false); }
  run(g, 6);
  assert.equal(g.chappals.length, 0);
});

test('the giant chappal hurts only if you stay under it', () => {
  const g = quiet(createGame(16 / 9, seeded()));
  spawnSlam(g);
  run(g, 2);
  assert.equal(g.hp, MAX_HP - 1, 'stood still: hit');

  const h = quiet(createGame(16 / 9, seeded()));
  spawnSlam(h);
  h.target = { x: -h.hw, z: -h.hd }; // run
  run(h, 2);
  assert.equal(h.hp, MAX_HP, 'ran away: safe');
});

test('levels advance on time and the last one never ends', () => {
  const g = quiet(createGame(16 / 9, seeded()));
  g.god = true;
  const total = LEVELS.slice(0, -1).reduce((s, l) => s + l.dur, 0);
  run(g, total + 60, 1 / 30);
  assert.equal(g.level, LEVELS.length - 1);
  assert.equal(LEVELS.length, 5);
});

test('chappal hitbox follows the sole, not a circle', () => {
  const g = quiet(createGame(16 / 9, seeded()));
  const c = dropOn(g, 0, 0);
  c.yaw = 0; // toe toward +x
  assert.ok(chappalDist(c, c.reach, 0) < 1e-9, 'toe end is on the axis');
  assert.ok(Math.abs(chappalDist(c, 0, c.reach) - c.reach) < 1e-9, 'side is only `reach` away');
  c.yaw = Math.PI / 2;
  assert.ok(chappalDist(c, 0, c.reach) < 1e-9);
});
