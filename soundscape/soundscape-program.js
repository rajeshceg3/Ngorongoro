/* Ngorongoro Crater soundscape: what the place sounds like, not its name.
 * Scenes follow the world's chapters: dawn on the rim, crater floor by day,
 * the flamingo lake, and the Maasai rim at night. All synthesis, no samples. */

import {
  makeCtx, windNoise, whistleWind, coos, birdChirps, insects, lapping,
  croaks, howls, bells, hoots, distantThunder,
} from '../soundscape/soundscape-layers.js';

const S = 12, SEED = 8041;
const mk = (render, seconds = S) => ({ render, seconds });

export default {
  defaultScene: 'dawn',
  layers: {
    grassWind: mk((c) => windNoise(c, { color: 0.028, gustDepth: 0.5, base: 0.5, seed: SEED + 1 })),
    rimWhistle: mk((c) => whistleWind(c, { fMin: 260, fMax: 720, q: 7, gain: 0.16, seed: SEED + 2 })),
    doves: mk((c) => coos(c, { count: 7, f: 590, gain: 0.3, seed: SEED + 3 })),
    savannaBirds: mk((c) => birdChirps(c, { count: 10, fLo: 1900, fHi: 3600, trill: 14, gain: 0.3, seed: SEED + 4, minGap: 0.7 })),
    middayInsects: mk((c) => insects(c, { f: 4300, pulseHz: 17, gain: 0.05, seed: SEED + 5 })),
    lakeLap: mk((c) => lapping(c, { gain: 0.4, period: 2.1, depth: 0.7, seed: SEED + 6 })),
    flamingoFlock: mk((c) => croaks(c, { count: 12, f: 640, gain: 0.09, seed: SEED + 7 })),
    crickets: mk((c) => insects(c, { f: 4700, pulseHz: 32, gain: 0.055, seed: SEED + 8 })),
    hyena: mk((c) => howls(c, { count: 2, f0: 480, f1: 860, dur: 1.9, gain: 0.24, seed: SEED + 9 })),
    cowbells: mk((c) => bells(c, { count: 4, f: 610, gain: 0.07, seed: SEED + 10, minGap: 2.2 })),
    stormFar: mk((c) => distantThunder(c, { count: 2, gain: 0.2, seed: SEED + 11 })),
    owls: mk((c) => hoots(c, { count: 2, f: 330, gain: 0.2, seed: SEED + 12 })),
  },
  scenes: {
    dawn: [
      { layer: 'grassWind', gain: 0.5 }, { layer: 'rimWhistle', gain: 0.5 },
      { layer: 'doves', gain: 0.55 }, { layer: 'savannaBirds', gain: 0.5 },
      { layer: 'cowbells', gain: 0.5 },
    ],
    day: [
      { layer: 'grassWind', gain: 0.42 }, { layer: 'middayInsects', gain: 0.6 },
      { layer: 'savannaBirds', gain: 0.3 }, { layer: 'stormFar', gain: 0.4 },
    ],
    lake: [
      { layer: 'lakeLap', gain: 0.7 }, { layer: 'flamingoFlock', gain: 1.0 },
      { layer: 'grassWind', gain: 0.3 }, { layer: 'savannaBirds', gain: 0.22 },
    ],
    night: [
      { layer: 'crickets', gain: 0.6 }, { layer: 'hyena', gain: 0.5 },
      { layer: 'grassWind', gain: 0.28 }, { layer: 'cowbells', gain: 0.25 },
      { layer: 'owls', gain: 0.35 },
    ],
  },
};
