/* Soundscape engine: opt-in Web Audio wrapper around soundscape-layers.js.
 * - No AudioContext is created until start() is called from a user gesture.
 * - Layers are pre-rendered to looping AudioBuffers (seam-crossfaded by the layer lib).
 * - setScene(name) crossfades layer gains; setOn(false) ramps master to 0 (mute keeps ctx).
 * - Suspends when the tab is hidden, resumes when visible if still on. */

import { mulberry32 } from './soundscape-layers.js';

export function createSoundscape(program, { masterGain = 0.85, fadeSec = 2.0 } = {}) {
  const state = {
    ctx: null, master: null, on: false, scene: null,
    buffers: new Map(), nodes: new Map(), building: null,
  };

  function renderLayer(sr, id) {
    const def = program.layers[id];
    const seconds = def.seconds || 12;
    const n = Math.floor(sr * seconds);
    const rand = mulberry32(def.seed || 1);
    const ctxLike = { sr, seconds, n, rand, L: new Float32Array(n), R: new Float32Array(n) };
    const out = def.render(ctxLike) || ctxLike;
    const buf = state.ctx.createBuffer(2, n, sr);
    buf.copyToChannel(out.L, 0); buf.copyToChannel(out.R, 1);
    return buf;
  }

  async function build() {
    if (state.building) return state.building;
    state.building = (async () => {
      const AC = window.AudioContext || window.webkitAudioContext;
      state.ctx = new AC();
      state.master = state.ctx.createGain();
      state.master.gain.value = 0;
      state.master.connect(state.ctx.destination);
      const sr = state.ctx.sampleRate;
      for (const id of Object.keys(program.layers)) {
        state.buffers.set(id, renderLayer(sr, id));
      }
      for (const [sceneName, entries] of Object.entries(program.scenes)) {
        for (const e of entries) {
          if (state.nodes.has(e.layer)) continue;
          const src = state.ctx.createBufferSource();
          src.buffer = state.buffers.get(e.layer);
          src.loop = true;
          const g = state.ctx.createGain();
          g.gain.value = 0;
          src.connect(g); g.connect(state.master);
          src.start();
          state.nodes.set(e.layer, g);
        }
      }
    })();
    return state.building;
  }

  function applyScene(name, fade = fadeSec) {
    const t = state.ctx.currentTime;
    const target = new Map();
    for (const e of program.scenes[name] || []) target.set(e.layer, e.gain);
    for (const [layer, g] of state.nodes) {
      const want = target.get(layer) || 0;
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(want, t, fade / 3);
    }
    state.scene = name;
  }

  return {
    get on() { return state.on; },
    get scene() { return state.scene; },
    get context() { return state.ctx; },
    async start(sceneName) {
      await build();
      await state.ctx.resume();
      state.on = true;
      const t = state.ctx.currentTime;
      state.master.gain.cancelScheduledValues(t);
      state.master.gain.setTargetAtTime(masterGain, t, 0.8);
      this.setScene(sceneName || program.defaultScene || Object.keys(program.scenes)[0], 1.2);
    },
    setScene(name, fade) {
      if (!state.ctx || !program.scenes[name]) return;
      applyScene(name, fade);
    },
    setOn(on) {
      if (!state.ctx) return;
      state.on = on;
      const t = state.ctx.currentTime;
      state.master.gain.cancelScheduledValues(t);
      state.master.gain.setTargetAtTime(on ? masterGain : 0, t, 0.45);
      if (on) state.ctx.resume();
    },
    handleVisibility() {
      if (!state.ctx) return;
      if (document.hidden) state.ctx.suspend();
      else if (state.on) state.ctx.resume();
    },
  };
}

/* Wire a toggle button to the engine. Keeps the existing button element and aria pattern. */
export function wireSoundButton(button, engine, { labelOn = 'Sound on', labelOff = 'Sound', ariaOn = 'Turn sound off', ariaOff = 'Turn sound on', onChange, keepText = false } = {}) {
  let started = false;
  const sync = () => {
    button.setAttribute('aria-pressed', String(engine.on));
    button.setAttribute('aria-label', engine.on ? ariaOn : ariaOff);
    if (!keepText && button.dataset.keepText === undefined) button.textContent = engine.on ? labelOn : labelOff;
    if (onChange) onChange(engine.on);
  };
  button.addEventListener('click', async () => {
    if (!started) { started = true; await engine.start(); }
    else engine.setOn(!engine.on);
    sync();
  });
  document.addEventListener('visibilitychange', () => engine.handleVisibility());
  sync();
}
