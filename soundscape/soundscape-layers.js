/* Soundscape layers: deterministic pure-JS DSP. Runs in browser and node.
 * Every render returns {L, R} Float32Arrays, loop-seam crossfaded, peak <= ~0.9.
 * No DOM, no AudioContext - the engine wraps these in Web Audio nodes. */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;

export function makeCtx(sr, seconds, seed) {
  const n = Math.floor(sr * seconds);
  return { sr, seconds, n, rand: mulberry32(seed), L: new Float32Array(n), R: new Float32Array(n) };
}

/* Crossfade the loop seam: blend the head into the tail so buf[N-1] -> buf[0] is smooth. */
export function seam(ctx, fadeSec = 0.25) {
  const X = Math.min(Math.floor(ctx.sr * fadeSec), ctx.n >> 2);
  for (let i = 0; i < X; i++) {
    const t = i / X, s = Math.sin(t * Math.PI / 2), c = Math.cos(t * Math.PI / 2);
    const j = ctx.n - X + i;
    ctx.L[j] = ctx.L[j] * c + ctx.L[i] * s;
    ctx.R[j] = ctx.R[j] * c + ctx.R[i] * s;
  }
  return ctx;
}

/* One-pole lowpassed ("pink-ish/brown-ish") noise with a slow random gust envelope. */
export function windNoise(ctx, { color = 0.02, gustRate = 0.07, gustDepth = 0.55, base = 0.5, seed = 1, seamFade = 0.5 } = {}) {
  const rand = mulberry32(seed);
  for (const ch of ['L', 'R']) {
    const b = ctx[ch];
    let v = 0, gust = 1, gTarget = 1, gCount = 0;
    const gWindow = Math.max(1, Math.floor(ctx.sr * gustRate * 20));
    for (let i = 0; i < ctx.n; i++) {
      v = (1 - color) * v + color * (rand() * 2 - 1);
      if (gCount-- <= 0) { gTarget = 1 - gustDepth + gustDepth * 2 * rand(); gCount = gWindow; }
      gust += (gTarget - gust) * 0.0004;
      b[i] = v * base * gust * (1 / color) * 0.02;
    }
  }
  return seam(ctx, seamFade);
}

/* Whistling wind: noise through a slowly wandering bandpass (crest/ridge whistle). */
export function whistleWind(ctx, { fMin = 300, fMax = 1200, wander = 0.05, q = 6, gain = 0.4, seed = 2 } = {}) {
  const rand = mulberry32(seed);
  for (const ch of ['L', 'R']) {
    const b = ctx[ch];
    let f = (fMin + fMax) / 2, fT = f, x1 = 0, x2 = 0, y1 = 0, y2 = 0, cnt = 0;
    const win = Math.floor(ctx.sr * wander * 40);
    for (let i = 0; i < ctx.n; i++) {
      if (cnt-- <= 0) { fT = fMin + (fMax - fMin) * rand(); cnt = win; }
      f += (fT - f) * 0.0002;
      const w = TAU * f / ctx.sr, alpha = Math.sin(w) / (2 * q), cw = Math.cos(w);
      const a0 = 1 + alpha, b0 = alpha, b2 = -alpha;
      const a1 = -2 * cw / a0, a2 = (1 - alpha) / a0;
      const x = rand() * 2 - 1;
      const yy = (b0 / a0) * x + (b2 / a0) * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = yy;
      b[i] = yy * gain;
    }
  }
  return seam(ctx);
}

/* Time-varying one-pole filtered noise helper used by water/rustle beds. */
function filteredBed(ctx, { color = 0.15, rate = 0.4, depth = 0.7, gain = 0.5, seed = 3, rhythmSec = 0, rhythmDepth = 0 }) {
  const rand = mulberry32(seed);
  for (const ch of ['L', 'R']) {
    const b = ctx[ch];
    let v = 0, ph = rand() * TAU;
    for (let i = 0; i < ctx.n; i++) {
      v = (1 - color) * v + color * (rand() * 2 - 1);
      let env = 1 - depth / 2 + depth * Math.sin(ph);
      if (rhythmSec > 0) {
        ph += TAU / (ctx.sr * rhythmSec * (0.85 + 0.3 * Math.sin(i / ctx.sr * 0.13 + seed)));
        env = 1 - rhythmDepth / 2 + rhythmDepth / 2 * Math.sin(ph);
      }
      b[i] = v * gain * env * (0.5 / color) * 0.05;
    }
  }
  return seam(ctx, 0.5);
}

/* Water lapping on a shore: rhythmic gentle swells. */
export function lapping(ctx, o = {}) {
  return filteredBed(ctx, { color: 0.06, gain: o.gain ?? 0.5, seed: o.seed ?? 11, rhythmSec: o.period ?? 1.6, rhythmDepth: o.depth ?? 0.75 });
}

/* Stream/river babble: brighter fast-modulated bed. */
export function streamBed(ctx, o = {}) {
  return filteredBed(ctx, { color: 0.5, gain: o.gain ?? 0.35, seed: o.seed ?? 12, rhythmSec: o.period ?? 0.23, rhythmDepth: o.depth ?? 0.5 });
}

/* Leaf / grass rustle: bright noise with irregular burst envelope. */
export function rustle(ctx, o = {}) {
  return filteredBed(ctx, { color: 0.65, gain: o.gain ?? 0.22, seed: o.seed ?? 13, rhythmSec: o.period ?? 0.9, rhythmDepth: o.depth ?? 0.85 });
}

/* Deep rumble bed (swell, thunder distance, geyser basement). */
export function rumble(ctx, { gain = 0.5, seed = 14, swellSec = 7 } = {}) {
  return filteredBed(ctx, { color: 0.01, gain, seed, rhythmSec: swellSec, rhythmDepth: 0.8 });
}

/* Generic event scatterer. shape(t, e) returns sample at event-local time t (sec). */
export function events(ctx, { count, shape, minGap = 0.15, gain = 0.5, seed = 21, panSpread = 1, avoidEdge = 0.15 }) {
  const rand = mulberry32(seed);
  const placed = [];
  let guard = 0;
  while (placed.length < count && guard++ < count * 60) {
    const at = avoidEdge + rand() * (ctx.seconds - 2 * avoidEdge);
    if (placed.every((p) => Math.abs(p.at - at) > minGap)) placed.push({ at, dur: 0, seed: rand() });
  }
  for (const ev of placed) {
    const e = { rand: mulberry32((ev.seed * 1e9) | 0), sr: ctx.sr };
    const pan = (rand() * 2 - 1) * panSpread;
    const gL = Math.cos((pan + 1) * Math.PI / 4), gR = Math.sin((pan + 1) * Math.PI / 4);
    const start = Math.floor(ev.at * ctx.sr);
    const maxLen = Math.min(ctx.n - start, Math.floor(ctx.sr * 4));
    for (let i = 0; i < maxLen; i++) {
      const t = i / ctx.sr;
      const s = shape(t, e);
      if (s === null) break;
      ctx.L[start + i] += s * gL * gain;
      ctx.R[start + i] += s * gR * gain;
    }
  }
  return seam(ctx);
}

/* Bird chirp: sine with pitch glide + optional trill AM + slight 2nd harmonic. */
export function birdChirps(ctx, { count = 12, fLo = 2200, fHi = 4200, durLo = 0.08, durHi = 0.3, trill = 0, gain = 0.35, seed = 31, syllables = 1, minGap = 0.4 } = {}) {
  return events(ctx, {
    count, minGap, gain, seed, avoidEdge: 0.9,
    shape: (t, e) => {
      const dur = durLo + e.rand() * (durHi - durLo);
      const syl = syllables + Math.floor(e.rand() * 1.4);
      const sylDur = dur, gap = dur * 0.45;
      const k = Math.floor(t / (sylDur + gap));
      if (k >= syl) return null;
      const lt = t - k * (sylDur + gap);
      if (lt > sylDur) return 0;
      const f0 = fLo + e.rand() * (fHi - fLo);
      const f1 = f0 * (0.7 + e.rand() * 0.8);
      const ph = TAU * (f0 * lt + (f1 - f0) * lt * lt / (2 * sylDur));
      const env = Math.sin(Math.PI * lt / sylDur) ** 1.5;
      const am = trill > 0 ? 0.55 + 0.45 * Math.sin(TAU * trill * lt) : 1;
      return (Math.sin(ph) + 0.25 * Math.sin(2 * ph)) * env * am * 0.6;
    },
  });
}

/* Dove/pigeon coo: low hollow 2-3 note phrases. */
export function coos(ctx, { count = 6, f = 620, gain = 0.3, seed = 32 } = {}) {
  return events(ctx, {
    count, minGap: 1.2, gain, seed, avoidEdge: 1.0,
    shape: (t, e) => {
      const notes = [0, 0.22, 0.5];
      const dur = 0.16;
      const k = notes.findIndex((_, i) => t >= notes[i] && t <= notes[i] + dur);
      if (k < 0) { if (t > notes[notes.length - 1] + dur) return null; return 0; }
      const lt = t - notes[k];
      const f0 = f * (0.92 + e.rand() * 0.16) * (k === 1 ? 1.12 : 1);
      const env = Math.sin(Math.PI * lt / dur);
      return (Math.sin(TAU * f0 * lt) + 0.4 * Math.sin(TAU * f0 * 2 * lt)) * env * env * 0.5;
    },
  });
}

/* Owl hoot: low two-note. */
export function hoots(ctx, { count = 3, f = 340, gain = 0.32, seed = 33 } = {}) {
  return events(ctx, {
    count, minGap: 3, gain, seed, avoidEdge: 1.4,
    shape: (t, e) => {
      const seq = [[0, 0.28], [0.5, 0.6]];
      for (const [s0, d] of seq) {
        if (t >= s0 && t <= s0 + d) {
          const lt = t - s0, f0 = f * (0.94 + e.rand() * 0.1);
          const env = Math.sin(Math.PI * lt / d);
          return (Math.sin(TAU * f0 * lt) + 0.3 * Math.sin(TAU * f0 * 2.01 * lt)) * env * 0.55;
        }
      }
      return t > seq[seq.length - 1][0] + seq[seq.length - 1][1] ? null : 0;
    },
  });
}

/* Howl (wolf/dingo/hyena-whoop-ish): long sine glide with vibrato + breath noise. */
export function howls(ctx, { count = 2, f0 = 420, f1 = 700, dur = 2.4, gain = 0.3, seed = 34 } = {}) {
  return events(ctx, {
    count, minGap: 4, gain, seed, avoidEdge: 2.8,
    shape: (t, e) => {
      if (t > dur) return null;
      const k = t / dur;
      const up = e.rand() > 0.4;
      const f = (up ? f0 + (f1 - f0) * Math.sin(k * Math.PI * 0.65) : f1 - (f1 - f0) * Math.sin(k * Math.PI * 0.6)) * (0.94 + e.rand() * 0.12);
      const vib = 1 + 0.012 * Math.sin(TAU * 5.5 * t);
      const env = Math.sin(Math.PI * k) ** 1.3;
      return (Math.sin(TAU * f * vib * t) * 0.8 + (e.rand() * 2 - 1) * 0.06) * env * 0.5;
    },
  });
}

/* Resonant tone band helper: narrow biquad bandpass driven by noise. */
function resonBand(ctx, { f = 5200, q = 18, gain = 0.2, seed = 41, pulseHz = 0, pulseDepth = 1, jitter = 0.1 }) {
  const rand = mulberry32(seed);
  for (const ch of ['L', 'R']) {
    const b = ctx[ch];
    const w = TAU * f * (1 + (rand() * 2 - 1) * jitter) / ctx.sr;
    const alpha = Math.sin(w) / (2 * q), cw = Math.cos(w), a0 = 1 + alpha;
    const b0 = alpha / a0, b2 = -alpha / a0, a1 = -2 * cw / a0, a2 = (1 - alpha) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, ph = rand() * TAU;
    for (let i = 0; i < ctx.n; i++) {
      const x = rand() * 2 - 1;
      const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      let am = 1;
      if (pulseHz > 0) { ph += TAU * pulseHz / ctx.sr; am = 1 - pulseDepth / 2 + pulseDepth / 2 * Math.sin(ph); }
      b[i] = y * gain * am * q * 0.5;
    }
  }
  return seam(ctx);
}

/* Insect bed: cicada/cricket shimmer - pulsed narrowband resonance. */
export function insects(ctx, { f = 5200, pulseHz = 24, gain = 0.05, seed = 41, q = 22 } = {}) {
  return resonBand(ctx, { f, q, gain, seed, pulseHz, pulseDepth: 0.9 });
}

/* Snapping-shrimp crackle bed: dense tiny decay clicks. */
export function crackle(ctx, { density = 90, gain = 0.2, seed = 42 } = {}) {
  const count = Math.floor(ctx.seconds * density);
  return events(ctx, {
    count, minGap: 0.004, gain, seed, avoidEdge: 0.05,
    shape: (t, e) => {
      if (t > 0.02) return null;
      return (e.rand() * 2 - 1) * Math.exp(-t * 900) * 0.8;
    },
  });
}

/* Bubbles rising: short sine blips with rising pitch. */
export function bubbles(ctx, { count = 24, gain = 0.14, seed = 43 } = {}) {
  return events(ctx, {
    count, minGap: 0.1, gain, seed, avoidEdge: 0.35,
    shape: (t, e) => {
      const dur = 0.09 + e.rand() * 0.12;
      if (t > dur) return null;
      const f0 = 300 + e.rand() * 500, f1 = f0 * (1.5 + e.rand());
      const ph = TAU * (f0 * t + (f1 - f0) * t * t / (2 * dur));
      return Math.sin(ph) * Math.sin(Math.PI * t / dur) * 0.5;
    },
  });
}

/* Parrotfish grazing: short scrape bursts. */
export function scrapes(ctx, { count = 10, gain = 0.18, seed = 44 } = {}) {
  return events(ctx, {
    count, minGap: 0.7, gain, seed, avoidEdge: 0.4,
    shape: (t, e) => {
      const dur = 0.22;
      if (t > dur) return null;
      const env = Math.sin(Math.PI * t / dur) ** 2;
      return (e.rand() * 2 - 1) * env * (0.4 + 0.6 * Math.abs(Math.sin(TAU * 60 * t))) * 0.5;
    },
  });
}

/* Mudpot / hot spring bloops: short falling sines. */
export function bloops(ctx, { count = 26, fLo = 190, fHi = 420, gain = 0.22, seed = 45 } = {}) {
    return events(ctx, {
    count, minGap: 0.12, gain, seed, avoidEdge: 0.35,
    shape: (t, e) => {
      const dur = 0.16;
      if (t > dur) return null;
      const f1 = fLo + e.rand() * (fHi - fLo), f0 = f1 * (1.6 + e.rand() * 0.8);
      const ph = TAU * (f0 * t + (f1 - f0) * t * t / (2 * dur));
      return Math.sin(ph) * Math.sin(Math.PI * t / dur) ** 1.2 * 0.6;
    },
  });
}

/* Geyser / steam hiss burst bed: swell-decay noise bursts over a hiss floor. */
export function steam(ctx, { count = 5, gain = 0.3, floor = 0.06, seed = 46 } = {}) {
  filteredBed(ctx, { color: 0.35, gain: floor, seed: seed + 1, rhythmSec: 0.31, rhythmDepth: 0.4 });
  const n0 = ctx.n;
  const add = makeCtx(ctx.sr, ctx.seconds, seed + 7);
  events(add, {
    count, minGap: 1.8, gain, seed, avoidEdge: 3.5,
    shape: (t, e) => {
      const dur = 1.6 + e.rand() * 1.6;
      if (t > dur) return null;
      const env = Math.exp(-t * 1.6) * Math.min(1, t * 8);
      return (e.rand() * 2 - 1) * env * 0.7;
    },
  });
  for (let i = 0; i < n0; i++) { ctx.L[i] += add.L[i]; ctx.R[i] += add.R[i]; }
  return ctx;
}

/* Bell hits (camel bells, cowbells): FM metallic with decay, sparse. */
export function bells(ctx, { count = 5, f = 840, gain = 0.16, seed = 47, minGap = 1.6 } = {}) {
  return events(ctx, {
    count, minGap, gain, seed, avoidEdge: 1.2,
    shape: (t, e) => {
      const dur = 0.9;
      if (t > dur) return null;
      const f0 = f * (0.9 + e.rand() * 0.2);
      const mod = Math.sin(TAU * f0 * 1.41 * t) * 2.2 * Math.exp(-t * 6);
      const env = Math.exp(-t * 5.5);
      return Math.sin(TAU * f0 * t + mod) * env * 0.5;
    },
  });
}

/* Woodpecker drumming: rapid knock burst. */
export function drumming(ctx, { count = 3, gain = 0.25, seed = 48 } = {}) {
  return events(ctx, {
    count, minGap: 3, gain, seed, avoidEdge: 0.8,
    shape: (t, e) => {
      const rate = 16 + e.rand() * 8, dur = 0.55;
      if (t > dur) return null;
      const k = t * rate, frac = k - Math.floor(k);
      const hit = frac < 0.25 ? Math.sin(Math.PI * frac / 0.25) : 0;
      return (e.rand() * 2 - 1) * 0.35 * hit * Math.exp(-frac * 9) * (1 - t / dur);
    },
  });
}

/* Monkey/roar-ish distant low modulated call (howler-ish). */
export function distantRoars(ctx, { count = 3, f = 130, gain = 0.22, seed = 49 } = {}) {
  return events(ctx, {
    count, minGap: 5, gain, seed, avoidEdge: 2.5,
    shape: (t, e) => {
      const dur = 2.2;
      if (t > dur) return null;
      const k = t / dur;
      const am = 0.55 + 0.45 * Math.sin(TAU * (9 + e.rand() * 3) * t);
      const env = Math.sin(Math.PI * k) ** 1.4;
      return (Math.sin(TAU * f * t * (1 + 0.02 * Math.sin(TAU * 3 * t))) + 0.5 * Math.sin(TAU * f * 2.03 * t)) * am * env * 0.35;
    },
  });
}

/* Frog peeps: high short cheeps in clusters. */
export function peeps(ctx, { count = 16, f = 2900, gain = 0.12, seed = 50 } = {}) {
  return events(ctx, {
    count, minGap: 0.25, gain, seed, avoidEdge: 0.3,
    shape: (t, e) => {
      const dur = 0.14;
      if (t > dur) return null;
      const f0 = f * (0.9 + e.rand() * 0.25);
      return Math.sin(TAU * f0 * t) * Math.sin(Math.PI * t / dur) ** 1.6 * 0.5;
    },
  });
}

/* Croaks (raven/crow): harsh short noise-burst calls. */
export function croaks(ctx, { count = 5, gain = 0.2, seed = 51, f = 900 } = {}) {
  return events(ctx, {
    count, minGap: 1.4, gain, seed, avoidEdge: 0.45,
    shape: (t, e) => {
      const dur = 0.22;
      if (t > dur) return null;
      const am = 0.4 + 0.6 * Math.abs(Math.sin(TAU * (28 + e.rand() * 10) * t));
      const env = Math.sin(Math.PI * t / dur) ** 1.4;
      return Math.sin(TAU * f * (0.9 + e.rand() * 0.2) * t) * am * env * 0.55;
    },
  });
}

/* Distant engine drone swell (boat passing far away). */
export function distantEngine(ctx, { f = 68, gain = 0.1, seed = 52, periodSec = 26 } = {}) {
  const rand = mulberry32(seed);
  for (const ch of ['L', 'R']) {
    const b = ctx[ch];
    const ph0 = rand() * TAU;
    for (let i = 0; i < ctx.n; i++) {
      const t = i / ctx.sr;
      const swell = Math.max(0, Math.sin(TAU * t / periodSec + ph0)) ** 2.4;
      b[i] = (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 2.02 * t) + 0.25 * Math.sin(TAU * f * 3.1 * t)) * swell * gain * 0.4;
    }
  }
  return seam(ctx);
}

/* Thunder/distant storm rumble events. */
export function distantThunder(ctx, { count = 2, gain = 0.25, seed = 53 } = {}) {
  return events(ctx, {
    count, minGap: 6, gain, seed, avoidEdge: 3.7,
    shape: (t, e) => {
      const dur = 3.4;
      if (t > dur) return null;
      let v = e._v || 0;
      const x = (e.rand() * 2 - 1) * 0.08;
      v = 0.985 * v + x;
      e._v = v;
      const env = Math.exp(-t * 1.1) * Math.min(1, t * 6);
      return v * 6 * env;
    },
  });
}

/* Rain on canopy: dense bright pitter bed. */
export function rain(ctx, { gain = 0.28, seed = 54 } = {}) {
  return filteredBed(ctx, { color: 0.8, gain, seed, rhythmSec: 0.11, rhythmDepth: 0.45 });
}

export const layers = {
  windNoise, whistleWind, lapping, streamBed, rustle, rumble, birdChirps, coos,
  hoots, howls, insects, crackle, bubbles, scrapes, bloops, steam, bells,
  drumming, distantRoars, peeps, croaks, distantEngine, distantThunder, rain, events,
};
