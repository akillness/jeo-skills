// terrain.js - the single source of ground height. Everything that must not float (buildings,
// the bridge, the keepers' path) samples heightAt(), so the mesh and the placement can never
// disagree. Change the river meander in riverCenter() and the terrace step in heightAt().
import * as THREE from 'three';

export const RIVER_HALF = 8;      // m, half-width of the water channel
export const WATER_Y = -0.3;      // m, water surface below the bank lip so a mud strip shows
export const TERRAIN_SIZE = 104;  // m, square side of the ground mesh

export function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Centre line of the Slowwater at x, in metres. Two sines so the meander never repeats visibly. */
export function riverCenter(x) {
  return 5 * Math.sin(x * 0.055) + 2 * Math.sin(x * 0.13 + 1.2);
}

/**
 * Ground height in metres. Riverbed at -1.9 m, five 1.15 m terraces on the north bank,
 * a flat 1.25 m quay on the south bank, and a headland under the beacon at (18, +24 inland).
 */
export function heightAt(x, z) {
  const d = z - riverCenter(x);
  const a = Math.abs(d);
  let h = -1.9 * (1 - smoothstep(0, RIVER_HALF, a));
  if (a > RIVER_HALF) {
    const u = a - RIVER_HALF;
    if (d < 0) {
      const step = Math.min(5, Math.floor(u / 6));
      const frac = step < 5 ? smoothstep(0.3, 0.75, u / 6 - Math.floor(u / 6)) : 0;
      h = 1.15 * (step + frac) + 0.9 * smoothstep(28, 44, u);
    } else {
      h = 1.25 * smoothstep(0, 2.5, u)
        + 6.4 * Math.exp(-(((x - 18) / 13) ** 2) - ((u - 24) / 11) ** 2)
        + 1.4 * smoothstep(30, 46, u);
    }
    // Surface roughness, faded in over the first 3 m so the bank lip stays a clean edge.
    h += (0.18 * Math.sin(x * 0.53) * Math.cos(z * 0.47) + 0.12 * Math.sin(x * 0.21 + z * 0.31))
      * smoothstep(0, 3, u);
  }
  return h;
}

/** Place by river offset instead of absolute z, so a building never drifts off its own bank. */
export function bankZ(x, offset) {
  return riverCenter(x) + offset;
}

/** Ground normal by central difference; used to lay paths and flag ground flat enough to build on. */
export function slopeAt(x, z) {
  const e = 0.6;
  return Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
}

const MUD = new THREE.Color('#3a2f26');
const WET_STONE = new THREE.Color('#2e3446');
const GRASS = new THREE.Color('#3d4a37');
const ROCK = new THREE.Color('#4a4453');

/**
 * Displaced plane with vertex colours: bed mud, wet stone at the waterline, terrace grass,
 * headland rock. Vertex colour rather than a texture keeps the build free of remote assets.
 */
export function createTerrain() {
  const segments = 208;
  const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    const y = heightAt(x, z);
    position.setY(i, y);
    const wetness = smoothstep(1.4, -0.2, y);          // 1 at the waterline, 0 up the bank
    const bed = smoothstep(-0.4, -1.6, y);
    c.copy(GRASS).lerp(ROCK, smoothstep(4.5, 8.5, y)).lerp(WET_STONE, wetness).lerp(MUD, bed);
    const tint = 0.88 + 0.24 * (Math.sin(x * 1.7) * Math.cos(z * 1.3) * 0.5 + 0.5);
    colors[i * 3] = c.r * tint; colors[i * 3 + 1] = c.g * tint; colors[i * 3 + 2] = c.b * tint;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  // Roughness 0.62: damp riverside ground. Wetter stone (0.3) is the quay strip added in scene.js.
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return { mesh, dispose() { geometry.dispose(); material.dispose(); } };
}
