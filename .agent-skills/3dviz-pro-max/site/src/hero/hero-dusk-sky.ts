// The hero's dusk sky. Same device as `gradientSky()` in examples/shared/standalone-runtime.js —
// a one-pixel-wide canvas stretched over the frame as `scene.background` — with the colours of
// `knowledge.style-lantern-festival-riverside` (src/generated/palette.json): night at the zenith,
// dusk through the middle, and the lantern warm as a band where the ridge meets the sky.
import * as THREE from 'three';

const HEIGHT = 256;

/**
 * Stops as [offset, colour] down the frame. The warm band sits a little above the island so the
 * roofs read against it; below it the sky returns to dusk and settles on plum, which keeps the
 * bottom of the frame dark enough for the copy that runs over it.
 */
const STOPS: readonly (readonly [number, string])[] = [
  [0, '#1b2a4a'], // palette.night
  [0.38, '#5a4b7a'], // palette.dusk
  [0.58, '#f2b25c'], // palette.lantern — the horizon band
  [0.72, '#5a4b7a'],
  [1, '#3a3560'], // palette.plum
];

/** One CanvasTexture; the caller owns it and must dispose it with the scene. */
export function createDuskSky(): THREE.CanvasTexture {
  const source = Object.assign(document.createElement('canvas'), { width: 1, height: HEIGHT });
  const context = source.getContext('2d');
  if (!context) throw new Error('hero: no 2D context for the dusk sky');
  const gradient = context.createLinearGradient(0, 0, 0, HEIGHT);
  for (const [offset, color] of STOPS) gradient.addColorStop(offset, color);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1, HEIGHT);
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
