// Small synthesised sound effects. The AudioContext is created on the first user gesture.
let ac = null;
let muted = false;

export function unlock() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
  }
  if (ac.state === 'suspended') ac.resume();
}

export function setMuted(m) {
  muted = m;
}

function env(gain, t, vol, dur) {
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone(f1, f2, dur, type = 'sine', vol = 0.12, delay = 0) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay,
    o = ac.createOscillator(),
    g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f1, t);
  o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  env(g, t, vol, dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur);
}

let noiseBuf = null;
function noise(dur, freq, vol = 0.3) {
  if (!ac || muted) return;
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ac.currentTime,
    src = ac.createBufferSource(),
    f = ac.createBiquadFilter(),
    g = ac.createGain();
  src.buffer = noiseBuf;
  f.type = 'lowpass';
  f.frequency.value = freq;
  env(g, t, vol, dur);
  src.connect(f).connect(g).connect(ac.destination);
  src.start(t);
  src.stop(t + dur);
}

export const sfx = {
  hit: () => {
    noise(0.18, 1800, 0.5);
    tone(160, 60, 0.15, 'square', 0.08);
  },
  // rubber sole slapping marble: a sharp crack over a short low thud, louder the harder it lands
  land: (v = 1) => {
    noise(0.07, 3200, 0.22 * v);
    tone(140, 60, 0.08, 'sine', 0.12 * v);
  },
  whoosh: () => noise(0.3, 700, 0.07),
  slam: () => {
    noise(0.35, 400, 0.6);
    tone(90, 35, 0.4, 'sine', 0.3);
  },
  slamWarn: () => tone(220, 180, 0.25, 'triangle', 0.06),
  graze: () => tone(1400, 1900, 0.05, 'triangle', 0.04),
  birth: () => {
    tone(300, 700, 0.18, 'sawtooth', 0.05);
    tone(600, 900, 0.12, 'sine', 0.06, 0.08);
  },
  babyLost: () => {
    noise(0.1, 1200, 0.25);
    tone(500, 200, 0.12, 'triangle', 0.05);
  },
  // war drums: three low hits, the last one heavier
  wave: () => {
    for (const [d, v] of [
      [0, 0.35],
      [0.22, 0.35],
      [0.44, 0.55],
    ]) {
      tone(95, 42, 0.45, 'sine', v, d);
    }
    noise(0.25, 260, 0.25);
  },
  death: () => {
    noise(0.5, 900, 0.6);
    tone(200, 40, 0.6, 'sawtooth', 0.1);
  },
};
