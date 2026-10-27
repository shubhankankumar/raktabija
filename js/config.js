// All tuning lives here. World units: 1 unit ~ 4 cm, so the roach (0.9 long) is a big American cockroach.
// The floor is the x/z plane, y is up. Times in seconds.
// every: seconds between chappals (only one is ever in the air), aim: share of drops aimed at you,
// slam: seconds between giant-chappal strikes.
// prettier-ignore
export const LEVELS = [
  { name: 'First blood',   dur: 25, every: 1.5, aim: 0.35, kinds: ['drop'] },
  { name: 'They know',     dur: 30, every: 1.1, aim: 0.6,  kinds: ['drop'] },
  { name: 'Crossfire',     dur: 30, every: 1.0, aim: 0.6,  kinds: ['drop', 'throw'] },
  { name: 'Mummy is home', dur: 35, every: 1.2, aim: 0.5,  kinds: ['drop', 'throw'], slam: 3.6 },
  { name: 'Raktabija',     dur: Infinity, every: 0.9, aim: 0.6, kinds: ['drop', 'throw'], slam: 4.5 },
];

export const ARENA_D = 4.5; // half-depth of the floor; half-width follows the screen's aspect
export const GRAVITY = 30; // units/s², a heavy fall that still reads on screen
export const DROP_HEIGHT = 11; // fall time = sqrt(2h/g) ~ 0.86 s: the shadow is the warning
export const THROW_TIME = 1.1; // flight time of a thrown chappal
export const RESTITUTION = 0.22; // rubber sole on marble: one small bounce
export const FLOOR_FRICTION = 9; // units/s² of sliding deceleration
export const REST_TIME = 1.4; // a spent chappal lies there this long, the last FADE_TIME of it vanishing
export const FADE_TIME = 0.45;

export const PLAYER_RADIUS = 0.32;
export const PLAYER_SPEED = 4.2; // top speed; the old game was effectively instant
export const PLAYER_ACCEL = 28;
export const ROACH_HEIGHT = 0.3; // a chappal hurts once its sole is lower than this
export const BABY_RADIUS = 0.18;

export const CHAPPAL_LEN = 1.5; // sole length
export const CHAPPAL_R = 0.3; // capsule half-thickness
export const SLAM_SCALE = 3;
export const SLAM_WARN = 1.2; // reticle time before the giant one lands

export const MAX_HP = 3;
export const INVULN_TIME = 1.2;
export const GRAZE_BAND = 0.55; // a landing this close (beyond touching) counts as a near miss
export const GRAZE_GAIN = 34; // meter per near miss: three dodges birth a soldier
export const GRAZE_BONUS = 25;
export const METER_MAX = 100;
export const MAX_SWARM = 12;
export const MAX_PARTICLES = 300;
