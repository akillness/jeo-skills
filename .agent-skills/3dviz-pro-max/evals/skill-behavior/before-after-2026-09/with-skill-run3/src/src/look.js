// look.js - the one place the art direction lives. Numbers are pasted `defaults.values` blocks:
//   knowledge.style-felt-wool                (palette, materials, sheen, camera fov, motion)
//   knowledge.lighting-mood-dusk-golden-hour (sky, fog, tone mapping, sun rig, environment, post)
// Departures from those blocks are listed in docs/design-system.md. Change this file and
// rigs/lighting-sun.js together: the sun rig carries the same lighting numbers.

export const LOOK = {
  toneMapping: 'ACESFilmicToneMapping',
  exposure: 0.9,                                   // dusk profile; felt profile asks 1.0
  sky: { zenith: '#3a4a7a', horizon: '#f2a55c' },
  fog: { color: '#e8b07a', density: 0.0072 },   // profile 0.02 was tuned for a 20 m set
  environment: { intensity: 0.25 },
  // felt-wool camera fov 45; orbit limits rescaled from figure scale (0.4-4 m) to village scale.
  camera: { fovDeg: 45, minPolarDeg: 55, maxPolarDeg: 88, minDistM: 6, maxDistM: 82 },
  palette: {
    shadow: '#35302c',      // deep felt shadow
    wool: '#8c6f5a',        // mid wool brown
    oatmeal: '#d8c3a5',     // lit oatmeal wool
    accent: '#e2725b',      // dyed felt accent patch
    sage: '#7f9b8e',        // secondary sage patch
    moss: '#5f7a4f',        // dyed moss green: the village green (added, see design-system.md)
    lamp: '#ffc58f',        // lantern paper, the one emissive family
    water: '#6f8296'
  },
  // Wool has no specular lobe: softness comes from a sheen rim, never from gloss.
  felt: { roughness: [0.86, 1.0], sheen: 0.6, sheenRoughness: 0.8, sheenColor: '#ffe6cf' },
  post: { enabled: true, bloom: { threshold: 1.0, strength: 0.3, radius: 0.7 }, vignette: 0.25 }
};

// Village plan constants shared by the terrain, the buildings and the walkers.
export const VILLAGE = {
  seed: 20260908, radius: 24, plotCount: 14, pathWidth: 2.8,
  riverX: 12.5, riverWave: 2.4, riverBedY: -1.95, waterY: -1.45,
  riverFlat: 1.6, riverEdge: 3.6,          // full-depth half-width, then the bank shoulder
  terrainSize: 132, terrainSegments: 190
};
