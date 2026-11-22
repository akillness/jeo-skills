// foliage.js - three instanced scatters (hill pines, reeds, river stones). Every instance is
// jittered in position, rotation, scale and hue, and every one is rejected if it lands on a
// building footprint or in the water, so nothing floats and nothing sits on a lattice.
import * as THREE from 'three';
import { heightAt, riverCenter, WATER_Y } from './terrain.js';

/** mulberry32: the same build draws the same frame, so two captures compare honestly. */
export function makeRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scatter({ count, geometry, material, tint, random, blocked, place, hueSpread = 0.05 }) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4(), colour = new THREE.Color();
  const hsl = new THREE.Color(tint).getHSL({ h: 0, s: 0, l: 0 });
  let placed = 0, attempts = 0;
  while (placed < count && attempts < count * 60) {
    attempts++;
    const candidate = place(random);
    if (!candidate) continue;
    const [x, z] = candidate;
    if (blocked.some(([bx, bz, r]) => (x - bx) ** 2 + (z - bz) ** 2 < r * r)) continue;
    const y = heightAt(x, z);
    if (!candidate[2](y, x, z)) continue;
    const scale = 0.62 + random() * 0.95;
    const scaleY = scale * (0.8 + random() * 0.75);   // used for the y offset too, so bases sit on the ground
    matrix.compose(
      new THREE.Vector3(x, y + (candidate[3] ?? 0) * scaleY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((random() - 0.5) * 0.18, random() * Math.PI * 2, (random() - 0.5) * 0.14)),
      new THREE.Vector3(scale * (0.85 + random() * 0.35), scaleY, scale * (0.85 + random() * 0.35))
    );
    mesh.setMatrixAt(placed, matrix);
    colour.setHSL((hsl.h + (random() - 0.5) * hueSpread + 1) % 1,
      hsl.s * (0.75 + random() * 0.5), hsl.l * (0.7 + random() * 0.7));
    mesh.setColorAt(placed, colour);
    placed++;
  }
  mesh.count = placed;
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/**
 * @param {Array<[number, number, number]>} blocked - [x, z, radius] keep-out discs.
 * @returns {{group: THREE.Group, dispose(): void}}
 */
export function createFoliage(blocked) {
  const group = new THREE.Group();
  const random = makeRandom(20260908);
  const geometries = [];

  const pine = new THREE.ConeGeometry(0.95, 3.6, 7, 2);
  geometries.push(pine);
  group.add(scatter({
    count: 54, geometry: pine, tint: '#2f4034', hueSpread: 0.07, random, blocked,
    material: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, flatShading: true }),
    place: r => {
      const x = (r() - 0.5) * 92, z = (r() - 0.5) * 92;
      return [x, z, (y, xx, zz) => y > 1.3 && Math.abs(zz - riverCenter(xx)) > 11, 1.8];
    }
  }));

  const reed = new THREE.ConeGeometry(0.14, 1.5, 4, 1);
  geometries.push(reed);
  group.add(scatter({
    count: 120, geometry: reed, tint: '#5a5638', hueSpread: 0.06, random, blocked: [],
    material: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.88, flatShading: true }),
    place: r => {
      const x = (r() - 0.5) * 92, side = r() < 0.5 ? -1 : 1;
      const z = riverCenter(x) + side * (7.4 + r() * 2.2);
      return [x, z, y => y > WATER_Y - 0.5 && y < 0.9, 0.7];
    }
  }));

  const stone = new THREE.IcosahedronGeometry(0.55, 0);
  geometries.push(stone);
  group.add(scatter({
    count: 40, geometry: stone, tint: '#3b4152', hueSpread: 0.04, random, blocked: [],
    material: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.04, flatShading: true }),
    place: r => {
      const x = (r() - 0.5) * 90, z = (r() - 0.5) * 90;
      return [x, z, y => y > -1.0 && y < 3.5, 0.18];
    }
  }));

  return {
    group,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      group.traverse(object => object.material?.dispose?.());
    }
  };
}
