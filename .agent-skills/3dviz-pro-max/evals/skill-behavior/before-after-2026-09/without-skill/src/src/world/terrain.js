// Faceted papercraft terrain: a flat village basin, a carved river gorge,
// terraced meadows and a northern cliff ridge — all from one height field.

import * as THREE from 'three';
import { fbm, clamp, smoothstep, PALETTE } from './noise-and-palette.js';

export const TERRAIN_SIZE = 260;
const SEGMENTS = 200;
export const WATER_LEVEL = -1.6;

/** Centre of the river channel at a given x. */
function riverCenter(x) {
  return 34 + Math.sin(x * 0.045) * 11 + Math.sin(x * 0.017 + 1.7) * 6;
}

/** The single source of truth for ground height. Everything else samples it. */
export function heightAt(x, z) {
  // Rolling meadow base.
  let h = fbm(x * 0.012, z * 0.012, 4) * 7.5;
  h += fbm(x * 0.045 + 11, z * 0.045 - 4, 3) * 1.7;

  // Northern ridge: paper cliffs that fold upward behind the village.
  const ridge = smoothstep(-28, -96, z);
  h += ridge * (26 + fbm(x * 0.02 + 5, z * 0.02 + 9, 3) * 16);

  // Eastern terraces — stepped shelves give the silhouette variety.
  const terraceMask = smoothstep(38, 78, x) * smoothstep(50, 6, Math.abs(z + 6));
  h += terraceMask * (Math.round(h * 0.6) * 1.8 + 6);

  // Village basin: flatten a generous plateau so buildings sit true.
  const basin = Math.hypot(x * 0.85, (z + 4) * 1.05);
  const flat = smoothstep(46, 16, basin);
  h = h * (1 - flat * 0.94) + 1.4 * flat * 0.94;

  // River gorge cut across the south.
  const dRiver = Math.abs(z - riverCenter(x));
  const gorge = smoothstep(26, 4, dRiver);
  h = h * (1 - gorge) + (WATER_LEVEL - 3.4 + smoothstep(0, 14, dRiver) * 3.0) * gorge;

  // Beach shelf along the banks.
  const bank = smoothstep(4, 15, dRiver) * smoothstep(30, 16, dRiver);
  h += bank * 0.8;

  // Away from the gorge, flatten dips toward a dry floor so the water plane
  // only ever fills the river — the meadows stay meadows.
  const nearRiver = smoothstep(38, 12, dRiver);
  const dryFloor = WATER_LEVEL + 1.2;
  const dry = h >= dryFloor ? h : dryFloor + (h - dryFloor) * 0.12;
  h = h * nearRiver + dry * (1 - nearRiver);

  return h;
}

/** Height plus a small tolerance, for placing objects on the ground. */
export function groundY(x, z) { return heightAt(x, z); }

function colorForVertex(x, z, h, target) {
  const slope = Math.abs(heightAt(x + 1.4, z) - heightAt(x - 1.4, z)) +
                Math.abs(heightAt(x, z + 1.4) - heightAt(x, z - 1.4));
  const c = target;
  const shore = smoothstep(WATER_LEVEL + 2.4, WATER_LEVEL - 0.4, h);
  const alpine = smoothstep(20, 34, h);
  const snowy = smoothstep(33, 44, h);
  const rocky = clamp(slope * 0.16, 0, 1);

  c.setHex(PALETTE.grassLow);
  c.lerp(new THREE.Color(PALETTE.grassHigh), smoothstep(0, 14, h));
  c.lerp(new THREE.Color(PALETTE.moss), fbm(x * 0.08, z * 0.08, 2) * 0.5 + 0.5);
  c.lerp(new THREE.Color(PALETTE.rock), Math.max(rocky, alpine * 0.85));
  c.lerp(new THREE.Color(PALETTE.rockHigh), alpine * rocky * 0.7);
  c.lerp(new THREE.Color(PALETTE.snow), snowy);
  c.lerp(new THREE.Color(PALETTE.sand), shore * 0.9);
  return c;
}

export function createTerrain() {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    colorForVertex(x, z, h, tmp);
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 1, metalness: 0
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** Translucent river surface with a slow paper-ripple wobble. */
export function createWater() {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, 60, 60);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: PALETTE.water, transparent: true, opacity: 0.82,
    roughness: 0.22, metalness: 0.15, flatShading: true
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WATER_LEVEL;
  mesh.name = 'water';
  const base = geo.attributes.position.array.slice();
  mesh.userData.tick = (t) => {
    const arr = geo.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] = Math.sin(base[i] * 0.12 + t * 1.1) * 0.16 +
                   Math.cos(base[i + 2] * 0.15 - t * 0.8) * 0.14;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  };
  return mesh;
}
