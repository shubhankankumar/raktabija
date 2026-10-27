// Pure game state and simulation in world units (see config.js). No DOM or three.js here,
// so it runs under `node --test`. main.js steps it at a fixed rate; update() pushes events
// ({ type, ... }) that the UI layer turns into sound and screens.
import {
  LEVELS, ARENA_D, GRAVITY, DROP_HEIGHT, THROW_TIME, RESTITUTION, FLOOR_FRICTION, REST_TIME,
  PLAYER_RADIUS, PLAYER_SPEED, PLAYER_ACCEL, ROACH_HEIGHT, BABY_RADIUS, CHAPPAL_LEN, CHAPPAL_R,
  SLAM_SCALE, SLAM_WARN, MAX_HP, INVULN_TIME, GRAZE_BAND, GRAZE_GAIN, GRAZE_BONUS, METER_MAX,
  MAX_SWARM, MAX_PARTICLES,
} from './config.js';

export function createGame(aspect = 16 / 9, rand = Math.random) {
  const g = {
    rand, hw: ARENA_D, hd: ARENA_D, time: 0,
    over: false, score: 0, level: 0, levelTime: 0, volleyTimer: 1.2, slamTimer: 2,
    hp: MAX_HP, invuln: 0, meter: 0, shake: 0, god: false, // god: test mode, nothing hurts
    player: { x: 0, z: 1.5, vx: 0, vz: 0, r: PLAYER_RADIUS, heading: -Math.PI / 2, gait: 0 },
    target: null,          // pointer aim on the floor, or null
    steer: { x: 0, z: 0 }, // keyboard direction, overrides the pointer while held
    swarm: [], chappals: [], particles: [],
    events: [],
  };
  resize(g, aspect);
  return g;
}

export function resize(g, aspect) {
  g.hd = ARENA_D;
  g.hw = clamp(ARENA_D * aspect * 0.9, 3, 9); // the camera is tilted, so the floor reads a bit wider than it is
  g.player.x = clamp(g.player.x, -g.hw + g.player.r, g.hw - g.player.r);
  g.player.z = clamp(g.player.z, -g.hd + g.player.r, g.hd - g.player.r);
}

export const currentLevel = (g) => LEVELS[Math.min(g.level, LEVELS.length - 1)];

export function update(g, dt) {
  updateEffects(g, dt);
  if (g.over) return; // let the splat finish
  const lv = currentLevel(g);
  g.time += dt;
  g.levelTime += dt;
  g.invuln = Math.max(0, g.invuln - dt);
  g.shake = Math.max(0, g.shake - dt * 3);

  movePlayer(g, dt);
  moveSwarm(g, dt);
  spawn(g, dt, lv);
  moveChappals(g, dt);
  if (g.over) return;

  g.score += dt * 10 * (g.level + 1) * (1 + g.swarm.length * 0.5);
  if (g.levelTime >= lv.dur) {
    g.level++;
    g.levelTime = 0;
    g.events.push({ type: 'level', level: g.level, name: currentLevel(g).name, boss: !!currentLevel(g).slam });
  }
}

// Velocity-limited steering: the roach runs at a real speed toward the cursor and decelerates on arrival.
function movePlayer(g, dt) {
  const p = g.player;
  let dx = 0, dz = 0;
  if (g.steer.x || g.steer.z) {
    const l = Math.hypot(g.steer.x, g.steer.z);
    dx = g.steer.x / l * PLAYER_SPEED; dz = g.steer.z / l * PLAYER_SPEED;
  } else if (g.target) {
    const tx = clamp(g.target.x, -g.hw + p.r, g.hw - p.r) - p.x, tz = clamp(g.target.z, -g.hd + p.r, g.hd - p.r) - p.z;
    const d = Math.hypot(tx, tz);
    // brake curve: full speed until the last few cm, then a hard stop like a real roach, no slow drift in
    if (d > 0.02) { const s = Math.min(PLAYER_SPEED, Math.sqrt(2 * PLAYER_ACCEL * d) * 0.8) / d; dx = tx * s; dz = tz * s; }
  }
  const ex = dx - p.vx, ez = dz - p.vz, e = Math.hypot(ex, ez), a = PLAYER_ACCEL * dt;
  if (e <= a) { p.vx = dx; p.vz = dz; } else { p.vx += ex / e * a; p.vz += ez / e * a; }

  p.x += p.vx * dt; p.z += p.vz * dt;
  if (Math.abs(p.x) > g.hw - p.r) { p.x = Math.sign(p.x) * (g.hw - p.r); p.vx = 0; }
  if (Math.abs(p.z) > g.hd - p.r) { p.z = Math.sign(p.z) * (g.hd - p.r); p.vz = 0; }
  const speed = Math.hypot(p.vx, p.vz);
  if (speed > 0.15) p.heading = turnToward(p.heading, Math.atan2(p.vz, p.vx), 14 * dt);
  p.gait += speed * dt;
}

function moveSwarm(g, dt) {
  const p = g.player, n = g.swarm.length, max = PLAYER_SPEED * 1.4 * dt;
  g.swarm.forEach((b, i) => {
    const a = g.time * 0.9 + (i / n) * Math.PI * 2, ring = 0.9 + (i % 3) * 0.3;
    let dx = p.x + Math.cos(a) * ring - b.x, dz = p.z + Math.sin(a) * ring - b.z;
    const d = Math.hypot(dx, dz), step = Math.min(max, d * 5 * dt);
    if (d > 0.01) { dx = dx / d * step; dz = dz / d * step; b.heading = turnToward(b.heading, Math.atan2(dz, dx), 10 * dt); }
    b.x += dx; b.z += dz; b.gait += step;
  });
}

function spawn(g, dt, lv) {
  const ramp = lv.dur === Infinity ? Math.min(g.levelTime / 45, 2) : 0; // the endless wave keeps tightening
  g.volleyTimer -= dt;
  if (g.volleyTimer <= 0) {
    g.volleyTimer = Math.max(0.45, lv.every - ramp * 0.2);
    for (let i = 0, n = lv.count + Math.floor(ramp); i < n; i++) {
      const kind = lv.kinds[Math.floor(g.rand() * lv.kinds.length)];
      if (kind === 'throw') spawnThrow(g); else spawnDrop(g, g.rand() < lv.aim);
    }
  }
  if (lv.slam) {
    g.slamTimer -= dt;
    if (g.slamTimer <= 0) { g.slamTimer = lv.slam; spawnSlam(g); }
  }
}

function makeChappal(g, kind, x, y, z, scale = 1) {
  const c = {
    kind, x, y, z, vx: 0, vy: 0, vz: 0, scale,
    r: CHAPPAL_R * scale, reach: (CHAPPAL_LEN / 2 - CHAPPAL_R) * scale,
    yaw: g.rand() * Math.PI * 2, spin: (g.rand() - 0.5) * 2, tilt: (g.rand() - 0.5) * 0.6,
    tx: x, tz: z,           // where it will land, for the shadow and reticle
    state: 'air', rest: REST_TIME, touched: false, grazed: false,
  };
  g.chappals.push(c);
  return c;
}

// Falls straight down from overhead. Aimed drops lead the roach a little.
export function spawnDrop(g, aimed) {
  const p = g.player, t = Math.sqrt(2 * DROP_HEIGHT / GRAVITY);
  const x = aimed ? p.x + p.vx * t * 0.5 + (g.rand() - 0.5) * 0.6 : (g.rand() * 2 - 1) * (g.hw - 0.8);
  const z = aimed ? p.z + p.vz * t * 0.5 + (g.rand() - 0.5) * 0.6 : (g.rand() * 2 - 1) * (g.hd - 0.8);
  return makeChappal(g, 'drop', clamp(x, -g.hw, g.hw), DROP_HEIGHT, clamp(z, -g.hd, g.hd));
}

// Thrown from beyond an edge on a ballistic arc that lands where the roach is, then skids on.
export function spawnThrow(g) {
  const p = g.player, side = Math.floor(g.rand() * 3); // left, right, far wall
  const x0 = side === 0 ? -g.hw - 2 : side === 1 ? g.hw + 2 : (g.rand() * 2 - 1) * g.hw;
  const z0 = side === 2 ? -g.hd - 2 : (g.rand() * 2 - 1) * g.hd * 0.8;
  const tx = clamp(p.x + p.vx * THROW_TIME * 0.4, -g.hw, g.hw), tz = clamp(p.z + p.vz * THROW_TIME * 0.4, -g.hd, g.hd);
  const c = makeChappal(g, 'throw', x0, 1.6, z0);
  c.vx = (tx - x0) / THROW_TIME;
  c.vz = (tz - z0) / THROW_TIME;
  c.vy = (0.5 * GRAVITY * THROW_TIME * THROW_TIME - c.y) / THROW_TIME;
  c.spin = (g.rand() < 0.5 ? -1 : 1) * (8 + g.rand() * 6); // thrown chappals spin flat like a frisbee
  c.tilt *= 0.4;
  c.tx = tx; c.tz = tz;
  g.events.push({ type: 'throw' });
  return c;
}

// The giant chappal: dropped from high enough that its fall is the warning time.
export function spawnSlam(g) {
  const p = g.player;
  const c = makeChappal(g, 'slam', p.x, 0.5 * GRAVITY * SLAM_WARN * SLAM_WARN, p.z, SLAM_SCALE);
  c.spin = 0; c.tilt = 0;
  g.events.push({ type: 'slam-warn' });
  return c;
}

// distance on the floor from a point to the chappal's sole axis (a capsule of radius c.r)
export function chappalDist(c, x, z) {
  const ax = Math.cos(c.yaw) * c.reach, az = Math.sin(c.yaw) * c.reach;
  const t = c.reach ? clamp(((x - c.x) * ax + (z - c.z) * az) / (c.reach * c.reach), -1, 1) : 0;
  return Math.hypot(x - (c.x + ax * t), z - (c.z + az * t));
}

function moveChappals(g, dt) {
  const p = g.player;
  for (let i = g.chappals.length - 1; i >= 0; i--) {
    const c = g.chappals[i];
    if (c.state === 'rest') {
      c.rest -= dt;
      if (c.rest <= 0) g.chappals.splice(i, 1);
      continue;
    }

    if (c.state === 'air') {
      c.vy -= GRAVITY * dt; // no drag: a rubber sole this heavy falls like a stone
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      c.yaw += c.spin * dt;
      if (c.y <= 0) land(g, c);
    } else { // sliding on the marble
      c.x += c.vx * dt; c.z += c.vz * dt; c.yaw += c.spin * dt;
      const v = Math.hypot(c.vx, c.vz), dv = FLOOR_FRICTION * dt;
      if (v <= dv) { c.vx = c.vz = 0; c.spin = 0; c.state = 'rest'; continue; }
      c.vx -= c.vx / v * dv; c.vz -= c.vz / v * dv;
      c.spin *= Math.exp(-4 * dt);
      c.tilt *= Math.exp(-20 * dt);
    }
    if (Math.abs(c.x) > g.hw + 5 || Math.abs(c.z) > g.hd + 5) { g.chappals.splice(i, 1); continue; }

    // only a sole that is down at roach height and still moving can squash anything
    if (c.y > ROACH_HEIGHT) continue;
    const d = chappalDist(c, p.x, p.z);
    if (d < p.r + c.r) {
      if (!g.god && g.invuln === 0) { hurt(g); if (g.over) return; }
    } else if (c.touched && !c.grazed && d < p.r + c.r + GRAZE_BAND) {
      graze(g, c);
    }
    if (c.touched) c.grazed = true; // the near-miss window is the first floor contact only
    for (let b = g.swarm.length - 1; b >= 0; b--) {
      const s = g.swarm[b];
      if (chappalDist(c, s.x, s.z) < s.r + c.r) {
        g.swarm.splice(b, 1);
        burst(g, s.x, s.z, 'blood', 14, 2.5);
        g.events.push({ type: 'baby-lost' });
      }
    }
  }
}

function land(g, c) {
  c.y = 0;
  const first = !c.touched;
  c.touched = true;
  if (first) {
    c.vx *= 0.6; c.vz *= 0.6; c.spin *= 0.4; // impact friction bites on first contact
    burst(g, c.x, c.z, 'dust', c.kind === 'slam' ? 26 : 6, c.kind === 'slam' ? 5 : 2);
    if (c.kind === 'slam') g.shake = Math.max(g.shake, 1);
    g.events.push({ type: c.kind === 'slam' ? 'slam' : 'land', x: c.x, z: c.z, impact: -c.vy });
  }
  if (-c.vy > 3) { c.vy = -c.vy * RESTITUTION; c.y = 0.001; } // a small rubbery bounce, then it settles
  else { c.vy = 0; c.state = 'slide'; }
}

function graze(g, c) {
  g.score += GRAZE_BONUS;
  g.meter += GRAZE_GAIN;
  burst(g, (c.x + g.player.x) / 2, (c.z + g.player.z) / 2, 'dust', 5, 1.5);
  g.events.push({ type: 'graze' });
  if (g.meter >= METER_MAX) { g.meter = 0; birth(g); }
}

export function birth(g) {
  const p = g.player;
  burst(g, p.x, p.z, 'blood', 16, 2.5);
  if (g.swarm.length >= MAX_SWARM) { g.score += 500; g.events.push({ type: 'birth', full: true }); return; }
  g.swarm.push({ x: p.x, z: p.z, r: BABY_RADIUS, heading: p.heading, gait: 0 });
  g.events.push({ type: 'birth', swarm: g.swarm.length });
}

function hurt(g) {
  const p = g.player;
  g.hp = Math.max(0, g.hp - 1);
  g.invuln = INVULN_TIME;
  g.shake = Math.max(g.shake, 0.7);
  burst(g, p.x, p.z, 'dust', 10, 2.5);
  if (g.hp === 0) {
    g.over = true;
    burst(g, p.x, p.z, 'blood', 40, 3.5);
    g.events.push({ type: 'death' });
  } else {
    g.events.push({ type: 'hit', hp: g.hp });
  }
}

function updateEffects(g, dt) {
  for (const q of g.particles) {
    q.vy -= (q.kind === 'blood' ? GRAVITY * 0.5 : 2) * dt;
    const drag = Math.exp(-(q.kind === 'dust' ? 3 : 0.5) * dt);
    q.vx *= drag; q.vz *= drag;
    q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    if (q.y < 0.01) { q.y = 0.01; q.vy = 0; q.vx *= 0.5; q.vz *= 0.5; } // blood beads on the floor
    q.life -= dt;
  }
  g.particles = g.particles.filter((q) => q.life > 0);
}

function burst(g, x, z, kind, n, speed) {
  for (let i = 0; i < n && g.particles.length < MAX_PARTICLES; i++) {
    const a = g.rand() * Math.PI * 2, v = speed * (0.3 + g.rand() * 0.7);
    const life = kind === 'blood' ? 1.2 + g.rand() : 0.4 + g.rand() * 0.4;
    g.particles.push({ kind, x, y: 0.1, z, vx: Math.cos(a) * v, vy: speed * g.rand(), vz: Math.sin(a) * v, life, max: life });
  }
}

function turnToward(a, b, k) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * Math.min(1, k);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
