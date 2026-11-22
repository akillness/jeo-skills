// terrain-felt-ground.js - the ground the village stands on: a felted bowl of rolling hills,
// flat lanes and plots cut into it, and one river gorge carved across the east side.
// Everything else in the scene asks `heightAt(x, z)` where to sit, so nothing floats.
// The terrain carries vertex colours (three dyed wool patches) rather than a texture, which is
// what makes it read as cut felt layers instead of a painted plane.
import * as THREE from 'three';
import { LOOK, VILLAGE } from './look.js';
import { nearestPathPoint } from '../kits/layout/village-layout.js';

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Integer hash -> [0,1). Deterministic, so the same build draws the same hills. */
function hash2(ix, iz, seed) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(seed | 0, 69069);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise on a unit grid with a smoothstep fade - cheap, and continuous enough for felt. */
function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Centre line of the river at depth z: a slow meander, never a ruled channel. */
export const riverCentreX = z => VILLAGE.riverX + VILLAGE.riverWave * Math.sin(z * 0.062)
  + VILLAGE.riverWave * 0.35 * Math.sin(z * 0.17 + 1.3);

/**
 * Builds `heightAt` for a village plan: hills everywhere, flattened along the lanes and under
 * the plots, then the river gorge cut through whatever is left.
 */
export function createHeightField(plan) {
  const plots = plan.plots.map(plot => ({ x: plot.position[0], z: plot.position[1],
                                          reach: Math.hypot(...plot.footprint_m) / 2 + 1.6 }));
  function hills(x, z) {
    const large = valueNoise(x * 0.028, z * 0.028, 11) - 0.5;
    const medium = valueNoise(x * 0.075, z * 0.075, 29) - 0.5;
    const fine = valueNoise(x * 0.19, z * 0.19, 71) - 0.5;
    const rim = smoothstep(17, 46, Math.hypot(x, z));      // the bowl the village sits in
    return large * 5.4 + medium * 1.7 + fine * 0.5 + rim * 7.2;
  }
  function flatness(x, z) {
    const lane = nearestPathPoint(plan.paths, [x, z]).distance;
    let open = smoothstep(VILLAGE.pathWidth * 0.75, 13, lane);
    for (const plot of plots) {
      open = Math.min(open, smoothstep(plot.reach, plot.reach + 8,
                                       Math.hypot(x - plot.x, z - plot.z)));
    }
    return open;
  }
  return function heightAt(x, z) {
    const ground = hills(x, z) * flatness(x, z);
    const d = Math.abs(x - riverCentreX(z));
    const wet = 1 - smoothstep(VILLAGE.riverFlat, VILLAGE.riverEdge, d);
    return ground * (1 - wet) + VILLAGE.riverBedY * wet;
  };
}

/** The felted ground itself, plus the river surface that fills the gorge. */
export function createTerrain({ heightAt, materialise }) {
  const { terrainSize: size, terrainSegments: segments } = VILLAGE;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colour = new Float32Array(position.count * 3);
  const patch = new THREE.Color(), moss = new THREE.Color(LOOK.palette.moss);
  const sage = new THREE.Color(LOOK.palette.sage), oat = new THREE.Color(LOOK.palette.oatmeal);
  const wool = new THREE.Color(LOOK.palette.wool);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    const y = heightAt(x, z);
    position.setY(i, y);
    // Three dyed wool patches, chosen by slope and wetness, so the ground reads as cut layers.
    const damp = 1 - smoothstep(VILLAGE.riverFlat, VILLAGE.riverEdge + 2.2,
                                Math.abs(x - riverCentreX(z)));
    const dry = valueNoise(x * 0.09, z * 0.09, 5);
    // Moss green is the village green; sage takes the dry hill shoulders, oatmeal the tops, and
    // the wet shoulder of the gorge goes to mid wool brown.
    patch.copy(moss).lerp(sage, Math.min(1, dry * 0.55 + Math.max(0, y) * 0.05));
    patch.lerp(oat, smoothstep(2.4, 7.5, y));
    patch.lerp(wool, Math.min(0.92, damp * 0.9));
    patch.offsetHSL(0, 0, (valueNoise(x * 0.5, z * 0.5, 13) - 0.5) * 0.08 - 0.02);
    colour.set([patch.r, patch.g, patch.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colour, 3));
  geometry.computeVertexNormals();
  const ground = new THREE.Mesh(geometry, materialise({ color: '#ffffff', roughness: 0.97,
                                                        vertexColors: true }));
  ground.receiveShadow = true;
  ground.name = 'terrain';

  // River: one plane at the water line. It is only visible where the gorge drops below it.
  const ripple = rippleNormalMap();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1),
    new THREE.MeshStandardMaterial({ color: LOOK.palette.water, roughness: 0.22, metalness: 0.0,
                                     normalMap: ripple, normalScale: new THREE.Vector2(0.5, 0.5),
                                     transparent: true, opacity: 0.86 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = VILLAGE.waterY;
  water.receiveShadow = false;
  water.name = 'river';

  const group = new THREE.Group();
  group.add(ground, water);
  return {
    group, ground, water,
    /** Scrolls the ripple normals at 0.012 uv/s so the river is never a frozen sheet. */
    animate(dt) {
      if (!(dt > 0)) return false;
      ripple.offset.x += 0.012 * dt;
      ripple.offset.y += 0.019 * dt;
      return true;
    },
    dispose() { geometry.dispose(); water.geometry.dispose(); water.material.dispose(); ripple.dispose(); }
  };
}

/** A small tiling normal map drawn on a canvas: no remote texture, no fetch at runtime. */
function rippleNormalMap() {
  const s = 128, canvas = Object.assign(document.createElement('canvas'), { width: s, height: s });
  const image = canvas.getContext('2d').createImageData(s, s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const h = Math.sin((x / s) * Math.PI * 4) * 0.5 + Math.sin((y / s) * Math.PI * 6 + 1.1) * 0.5;
      const dx = Math.cos((x / s) * Math.PI * 4) * 0.35, dy = Math.cos((y / s) * Math.PI * 6 + 1.1) * 0.4;
      const i = (y * s + x) * 4;
      image.data[i] = 128 + dx * 90; image.data[i + 1] = 128 + dy * 90;
      image.data[i + 2] = 235 + h * 8; image.data[i + 3] = 255;
    }
  }
  canvas.getContext('2d').putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(26, 26);
  return texture;
}

/** Lane ribbon that follows the ground and stops at the gorge, where the bridge takes over. */
export function createLanes(plan, heightAt, material) {
  const group = new THREE.Group();
  for (const path of plan.paths) {
    for (let i = 1; i < path.points.length; i++) {
      const [ax, az] = path.points[i - 1], [bx, bz] = path.points[i];
      const steps = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 1.2));
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps, t1 = (s + 1) / steps;
        const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0;
        const x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
        if (Math.abs(mx - riverCentreX(mz)) < VILLAGE.riverEdge + 1.4) continue;  // the gorge
        const geometry = new THREE.PlaneGeometry(path.width, Math.hypot(x1 - x0, z1 - z0) * 1.35);
        geometry.rotateX(-Math.PI / 2);
        const strip = new THREE.Mesh(geometry, material);
        strip.rotation.y = Math.atan2(x0 - x1, z0 - z1);
        strip.position.set(mx, heightAt(mx, mz) + 0.03, mz);
        strip.receiveShadow = true;
        group.add(strip);
      }
    }
  }
  return group;
}
