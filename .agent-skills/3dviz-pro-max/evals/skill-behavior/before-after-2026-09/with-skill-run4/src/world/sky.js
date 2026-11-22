// sky.js - a two-stop painted dusk gradient, used both as the background and, through PMREM, as
// the environment. The look asks for no stars and no moon disc: the sky is a gradient, and the
// environment it lights with is the same blue-violet, so nothing in the scene gets an untinted
// white ambient (anti-slop item 2).
import * as THREE from 'three';

/** Equirectangular canvas: zenith at the top, the horizon band in the middle, ground below. */
export function gradientSky({ zenith, horizon, ground }) {
  const canvas = Object.assign(document.createElement('canvas'), { width: 8, height: 512 });
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, zenith);
  gradient.addColorStop(0.42, zenith);
  gradient.addColorStop(0.52, horizon);
  gradient.addColorStop(0.56, horizon);
  gradient.addColorStop(1, ground);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 8, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

/** PMREM of that same gradient: a tinted environment, not a studio room. */
export function skyEnvironment(renderer, texture) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(texture);
  pmrem.dispose();
  return target;
}
