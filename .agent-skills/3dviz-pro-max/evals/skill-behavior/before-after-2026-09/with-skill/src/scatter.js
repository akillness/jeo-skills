// scatter.js - the woodland around Emberfall. Canopies are built as three stacked value bands
// baked into vertex colours and then tinted per instance, so the forest reads as grouped painted
// masses rather than as leaves. Everything is rejection-sampled away from lanes, walls and water.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDINGS, LANES } from './village-model.js';
import { WATER_LEVEL, heightAt } from './terrain.js';

/** Deterministic jitter (mulberry32): the same build draws the same frame, so captures compare. */
export function makeRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paint(geometry, hex) {
  const color = new THREE.Color(hex), count = geometry.attributes.position.count;
  const array = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) array.set([color.r, color.g, color.b], i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(array, 3));
  return geometry;
}

/** Three flattened layers, lit band on top, shaded band beneath: a canopy painted, not grown. */
function canopyGeometry(bands) {
  const layers = [
    paint(new THREE.IcosahedronGeometry(1.35, 1).scale(1, 0.66, 1).translate(0, 0.5, 0), bands[0]),
    paint(new THREE.IcosahedronGeometry(1.15, 1).scale(1.12, 0.6, 1.12).translate(0.28, 1.42, -0.2), bands[1]),
    paint(new THREE.IcosahedronGeometry(0.86, 1).scale(1.05, 0.58, 1.05).translate(-0.32, 2.15, 0.24), bands[2])
  ];
  return mergeGeometries(layers, false);
}

function distanceToLanes(x, z) {
  let best = Infinity;
  for (const lane of LANES) {
    for (let i = 1; i < lane.points.length; i++) {
      const [ax, az] = lane.points[i - 1], [bx, bz] = lane.points[i];
      const dx = bx - ax, dz = bz - az, length = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (length || 1)));
      best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)) - lane.width);
    }
  }
  return best;
}

function blocked(x, z, clearance) {
  if (heightAt(x, z) < WATER_LEVEL + 0.35) return true;
  if (distanceToLanes(x, z) < clearance) return true;
  // `clear` gives the landmark its breathing room; everything else clears its own footprint.
  return BUILDINGS.some(b => Math.hypot(x - b.x, z - b.z) < (b.clear ?? b.selectRadius) + clearance);
}

/** Clustered sampling: groves, not confetti. */
function sample(random, { count, clearance, inner, outer, spread }) {
  const spots = [];
  let guard = 0;
  while (spots.length < count && guard++ < count * 60) {
    const angle = random() * Math.PI * 2;
    const radius = inner + random() * (outer - inner);
    const cx = Math.cos(angle) * radius, cz = Math.sin(angle) * radius;
    for (let k = 0; k < 3 && spots.length < count; k++) {
      const x = cx + (random() - 0.5) * spread, z = cz + (random() - 0.5) * spread;
      if (!blocked(x, z, clearance)) spots.push([x, z]);
    }
  }
  return spots;
}

function instance(geometry, material, spots, place, random) {
  const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(), euler = new THREE.Euler();
  const tint = new THREE.Color();
  spots.forEach(([x, z], index) => {
    const { y, scale: s, tilt, hue } = place(x, z, random);
    position.set(x, y, z);
    euler.set(tilt.x, random() * Math.PI * 2, tilt.z);
    quaternion.setFromEuler(euler);
    scale.set(s.x, s.y, s.z);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    if (hue) mesh.setColorAt(index, tint.setHSL(hue.h, hue.s, hue.l));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * @returns {{group: THREE.Group, lamps: THREE.Mesh[]}} lamps are the emissive path mushrooms that
 * main.js may pulse; everything else is static.
 */
export function createScatter({ mats, palette }) {
  const group = new THREE.Group();
  const random = makeRandom(20260908);
  const base = new THREE.Color(palette.canopy).getHSL({ h: 0, s: 0, l: 0 });

  const trees = sample(random, { count: 96, clearance: 2.4, inner: 7, outer: 62, spread: 9 });
  const canopy = canopyGeometry(palette.canopyBands);
  group.add(instance(canopy, mats.canopy, trees, (x, z, rng) => {
    const s = 1.5 + rng() * 1.5; // mature canopies land between 8 and 14 m tall
    return { y: heightAt(x, z) + 2.5 + s * 0.9, scale: { x: s, y: s * (0.85 + rng() * 0.4), z: s },
      tilt: { x: (rng() - 0.5) * 0.09, z: (rng() - 0.5) * 0.09 },
      hue: { h: base.h + (rng() - 0.5) * 0.05, s: base.s * (0.8 + rng() * 0.4), l: base.l * (0.7 + rng() * 0.6) } };
  }, makeRandom(11)));
  group.add(instance(new THREE.CylinderGeometry(0.16, 0.3, 5.4, 6), mats.bark, trees, (x, z, rng) => {
    const s = 1.1 + rng() * 0.8;
    return { y: heightAt(x, z) + 2.5, scale: { x: s * 0.8, y: s, z: s * 0.8 },
      tilt: { x: (rng() - 0.5) * 0.08, z: (rng() - 0.5) * 0.08 } };
  }, makeRandom(11)));

  const rocks = sample(random, { count: 54, clearance: 1.0, inner: 5, outer: 58, spread: 6 });
  group.add(instance(new THREE.DodecahedronGeometry(0.5, 0), mats.rock, rocks, (x, z, rng) => {
    const s = 0.5 + rng() * 1.5;
    return { y: heightAt(x, z) + s * 0.16, scale: { x: s, y: s * (0.5 + rng() * 0.5), z: s * (0.8 + rng() * 0.5) },
      tilt: { x: rng() * 0.4, z: rng() * 0.4 } };
  }, makeRandom(29)));

  const shrubs = sample(random, { count: 120, clearance: 0.9, inner: 4, outer: 50, spread: 5 });
  group.add(instance(new THREE.IcosahedronGeometry(0.55, 0), mats.shrub, shrubs, (x, z, rng) => {
    const s = 0.6 + rng() * 0.9;
    return { y: heightAt(x, z) + s * 0.3, scale: { x: s, y: s * 0.7, z: s },
      tilt: { x: (rng() - 0.5) * 0.2, z: (rng() - 0.5) * 0.2 },
      hue: { h: base.h + 0.02 + (rng() - 0.5) * 0.05, s: base.s * (0.7 + rng() * 0.5), l: base.l * (0.8 + rng() * 0.7) } };
  }, makeRandom(53)));

  // Reeds: only where the ground meets the waterline, which is where they would actually stand.
  const reeds = [];
  const reedRandom = makeRandom(71);
  for (let guard = 0; guard < 4000 && reeds.length < 150; guard++) {
    const angle = reedRandom() * Math.PI * 2, radius = 5 + reedRandom() * 8;
    const x = 16 + Math.cos(angle) * radius, z = 14 + Math.sin(angle) * radius;
    const y = heightAt(x, z);
    if (y > WATER_LEVEL - 0.5 && y < WATER_LEVEL + 0.45) reeds.push([x, z]);
  }
  group.add(instance(new THREE.ConeGeometry(0.07, 1.5, 4), mats.reed, reeds, (x, z, rng) => ({
    y: heightAt(x, z) + 0.6, scale: { x: 1, y: 0.7 + rng() * 0.9, z: 1 },
    tilt: { x: (rng() - 0.5) * 0.35, z: (rng() - 0.5) * 0.35 }
  }), makeRandom(97)));
  return { group, treeCount: trees.length, rockCount: rocks.length, reedCount: reeds.length };
}

/** Waymarker mushrooms: the woodland motif, repeated down every lane so the paths read at dusk. */
export function createWaymarkers({ mats }) {
  const group = new THREE.Group();
  const random = makeRandom(1409);
  const stem = new THREE.CylinderGeometry(0.09, 0.14, 0.75, 7);
  const cap = new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  for (const lane of LANES) {
    const curve = new THREE.CatmullRomCurve3(lane.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.4);
    const count = Math.max(2, Math.round(curve.getLength() / 7));
    for (let i = 0; i <= count; i++) {
      const point = curve.getPoint(i / count), tangent = curve.getTangent(i / count);
      const side = (i % 2 ? 1 : -1) * (lane.width / 2 + 0.5 + random() * 0.4);
      const x = point.x - tangent.z * side, z = point.z + tangent.x * side;
      const y = heightAt(x, z);
      const marker = new THREE.Group();
      marker.position.set(x, y, z);
      marker.rotation.y = random() * Math.PI;
      const scale = 0.8 + random() * 0.7;
      marker.scale.setScalar(scale);
      const stalk = new THREE.Mesh(stem, mats.stalk);
      stalk.position.y = 0.37; stalk.castShadow = true;
      const head = new THREE.Mesh(cap, mats.capGlow);
      head.position.y = 0.72; head.castShadow = true;
      marker.add(stalk, head);
      group.add(marker);
    }
  }
  return group;
}
