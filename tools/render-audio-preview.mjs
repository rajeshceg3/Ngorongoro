#!/usr/bin/env node
/* Render a world program to a preview WAV + run structural checks.
 * Usage: node render-preview.mjs <program.mjs> <out.wav> [--scene NAME] [--seconds N]
 * Prints a JSON report: duration, peak dBFS, RMS dBFS, clipped samples, DC offset,
 * spectral centroid, per-scene band energies, loop-seam discontinuity per layer.
 * Exit 1 when a hard check fails (clipping, silence, seam spike). */

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeCtx } from '../soundscape/soundscape-layers.js';

const [progPath, outPath, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]] : null).filter(Boolean));
const SR = 44100;
const SCENE_SECONDS = 10;

const program = (await import(pathToFileURL(progPath))).default;

function renderLayer(sr, id) {
  const def = program.layers[id];
  const seconds = def.seconds || 12;
  const ctxLike = makeCtx(sr, seconds, def.seed || 1);
  return def.render(ctxLike) || ctxLike;
}

const layerData = new Map();
for (const id of Object.keys(program.layers)) layerData.set(id, renderLayer(SR, id));

/* Mix a scene tour: each scene SCENE_SECONDS with 1.5s crossfades. */
const sceneNames = args.scene ? [args.scene] : Object.keys(program.scenes);
const tourSeconds = sceneNames.length * SCENE_SECONDS;
const total = SR * tourSeconds;
const mix = { L: new Float32Array(total), R: new Float32Array(total) };

sceneNames.forEach((sceneName, si) => {
  const entries = program.scenes[sceneName] || [];
  const start = si * SCENE_SECONDS * SR;
  const len = SCENE_SECONDS * SR;
  for (let i = 0; i < len; i++) {
    /* scene gain envelope: 1.5s in/out ramps for the tour */
    const t = i / SR;
    const env = Math.min(1, t / 1.5, (SCENE_SECONDS - t) / 1.5);
    for (const e of entries) {
      const buf = layerData.get(e.layer);
      const idx = (start * 0 + i + si * 7919) % buf.L.length;
      mix.L[start + i] += buf.L[idx] * e.gain * env;
      mix.R[start + i] += buf.R[idx] * e.gain * env;
    }
  }
});

/* Master gain like the browser engine. */
const MG = 0.85;
for (let i = 0; i < total; i++) { mix.L[i] *= MG; mix.R[i] *= MG; }

/* ---------- structural checks ---------- */
function dbfs(x) { return 20 * Math.log10(Math.max(x, 1e-9)); }
let peak = 0, sumSq = 0, clipped = 0, dc = 0;
for (let i = 0; i < total; i++) {
  for (const s of [mix.L[i], mix.R[i]]) {
    const a = Math.abs(s);
    if (a > peak) peak = a;
    if (a >= 0.999) clipped++;
    sumSq += s * s;
    dc += s;
  }
}
const rms = Math.sqrt(sumSq / (2 * total));
dc /= 2 * total;

/* Spectral centroid (mono mix, simple DFT over windows via FFT-lite: use zero-cross + band energies with Goertzel). */
function bandEnergy(samples, f, sr) {
  const w = 2 * Math.PI * f / sr, cw = 2 * Math.cos(w);
  let s0 = 0, s1 = 0, s2 = 0;
  const N = Math.min(samples.length, sr * 4);
  for (let i = 0; i < N; i++) { s0 = samples[i] + cw * s1 - s2; s2 = s1; s1 = s0; }
  return (s1 * s1 + s2 * s2 - cw * s1 * s2) / N;
}
const mono = new Float32Array(total);
for (let i = 0; i < total; i++) mono[i] = (mix.L[i] + mix.R[i]) / 2;
const bands = {};
for (const f of [80, 200, 500, 1200, 3000, 6000, 10000]) bands[f] = +dbfs(Math.sqrt(Math.max(bandEnergy(mono, f, SR), 1e-12))).toFixed(1);

/* Loop-seam discontinuity per layer: wrap step vs the layer's own p99 step, with an absolute floor. */
const seams = {};
for (const [id, buf] of layerData) {
  const d = Math.max(Math.abs(buf.L[buf.L.length - 1] - buf.L[0]), Math.abs(buf.R[buf.R.length - 1] - buf.R[0]));
  const steps = [];
  for (let i = 1; i < Math.min(buf.L.length, 44100); i += 7) steps.push(Math.abs(buf.L[i] - buf.L[i - 1]));
  steps.sort((a, b) => a - b);
  const p99 = steps[Math.floor(steps.length * 0.99)] || 0;
  let peakL = 0;
  for (let i = 0; i < buf.L.length; i += 13) { const a = Math.abs(buf.L[i]); if (a > peakL) peakL = a; }
  seams[id] = { step: +d.toFixed(4), p99: +p99.toFixed(4), layerPeak: +peakL.toFixed(3) };
}

/* Per-scene RMS: catches miswired scenes (all-zero gains). */
const sceneStats = {};
sceneNames.forEach((name, si) => {
  const start = si * SCENE_SECONDS * SR, len = SCENE_SECONDS * SR;
  let sq = 0;
  for (let i = start + SR; i < start + len - SR; i++) sq += mix.L[i] * mix.L[i] + mix.R[i] * mix.R[i];
  sceneStats[name] = +dbfs(Math.sqrt(sq / (2 * (len - 2 * SR)))).toFixed(1);
});

const failures = [];
if (clipped > 0) failures.push(`clipped samples: ${clipped}`);
if (peak > 0.98) failures.push(`peak ${dbfs(peak).toFixed(1)} dBFS too hot`);
if (rms < 0.005) failures.push(`RMS ${dbfs(rms).toFixed(1)} dBFS near silence`);
if (rms > 0.25) failures.push(`RMS ${dbfs(rms).toFixed(1)} dBFS too loud`);
for (const [name, v] of Object.entries(sceneStats)) if (v < -50) failures.push(`scene ${name} near silence (${v} dBFS)`);
for (const [id, m] of Object.entries(seams)) {
  if (m.step > Math.max(0.02, 3 * m.p99) && m.step > 0.3 * m.layerPeak && m.layerPeak > 0.02)
    failures.push(`layer ${id} loop seam step ${m.step} (p99 ${m.p99}, peak ${m.layerPeak})`);
}

/* ---------- write WAV ---------- */
function wav(L, R, sr) {
  const n = L.length, bytes = 44 + n * 4;
  const b = Buffer.alloc(bytes);
  b.write('RIFF', 0); b.writeUInt32LE(bytes - 8, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 44 + i * 4 + 2);
  }
  return b;
}
writeFileSync(outPath, wav(mix.L, mix.R, SR));

const report = {
  program: progPath, out: outPath, sr: SR,
  seconds: tourSeconds, scenes: sceneNames, sceneRmsDbfs: sceneStats,
  peakDbfs: +dbfs(peak).toFixed(1), rmsDbfs: +dbfs(rms).toFixed(1),
  clipped, dcOffset: +dc.toFixed(5),
  bandDbfs: bands, seamRatio: seams, failures,
};
console.log(JSON.stringify(report, null, 1));
process.exit(failures.length ? 1 : 0);
