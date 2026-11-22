// terrain.js - the ground the village stands on: a rolling heightfield carved by a river,
// flattened into a river terrace for the square, raised into a bluff on the east bank, and
// levelled into a pad under every building so nothing sits on a slope.
// Custom geometry (no kit blueprint covers terrain): height field, vertex colouring, lane ribbon.
import { THREE, materialFor, seeded } from '../kits/kit-core.js';

export const RIVER = { x: 7, amp: 1.6, freq: 0.07, sigma: 3.4, depth: 3.6 };
export const WATER_Y = -0.9;
export const TERRACE_Y = 0.28;          // the west-bank river terrace the village square sits on

const SIZE = 150, SEGMENTS = 260;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
/** Channel centreline: the river wanders, so no bank is a straight line. */
export const riverX = z => RIVER.x + RIVER.amp * Math.sin(z * RIVER.freq);

/**
 * Ground height in metres. Order matters: the channel is carved before the square is flattened
 * and before the pads are stamped, so a pad can never dam the river and the river can never
 * swallow a building pad.
 */
export function makeHeightField(pads = []) {
  return function heightAt(x, z) {
    let h = 0.62 * Math.sin(0.11 * x + 0.4) * Math.cos(0.083 * z)
          + 0.42 * Math.sin(0.067 * z + 1.1)
          + 0.22 * Math.sin(0.19 * x - 0.7) * Math.sin(0.14 * z + 2.2);
    h += 1.7 * Math.exp(-(((x + 24) ** 2) + ((z + 15) ** 2)) / 150);          // west pasture knoll
    h += 3.1 * smoothstep(9.5, 19, x - 1.2 * Math.sin(z * 0.05));             // east bluff
    h = Math.max(h, -0.5);                                                    // no accidental ponds
    const dx = x - riverX(z);
    h -= RIVER.depth * Math.exp(-(dx * dx) / (2 * RIVER.sigma * RIVER.sigma));
    const square = smoothstep(13, 7.5, Math.hypot((x + 6) * 0.92, z * 1.05));
    h = lerp(h, TERRACE_Y, square);
    for (const pad of pads) {
      const d = Math.hypot(x - pad.x, z - pad.z);
      h = lerp(h, pad.y, smoothstep(pad.r + (pad.blend ?? 2.4), pad.r, d));
    }
    return h;
  };
}

const GRASS = new THREE.Color('#39432f'), DRY = new THREE.Color('#4a4436');
const EARTH = new THREE.Color('#4b4137'), MUD = new THREE.Color('#332b26');
const BED = new THREE.Color('#221d20');

/** Colour by height and by distance to the water line, so bank, terrace and bluff read apart. */
function groundColour(target, h, slope, jitter) {
  if (h < WATER_Y - 0.15) target.copy(BED);
  else if (h < WATER_Y + 0.55) target.copy(MUD).lerp(EARTH, smoothstep(WATER_Y - 0.1, WATER_Y + 0.55, h));
  else if (h < 1.1) target.copy(EARTH).lerp(GRASS, smoothstep(0.35, 1.1, h));
  else target.copy(GRASS).lerp(DRY, smoothstep(1.2, 3.4, h));
  target.lerp(DRY, Math.min(0.45, slope * 0.9));            // exposed earth on the steep faces
  target.offsetHSL(0, 0, jitter);
  return target;
}

/** The heightfield mesh plus a ground-following ribbon builder for the lanes. */
export function createTerrain(heightAt) {
  const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colours = new Float32Array(position.count * 3);
  const random = seeded(4711), colour = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    const h = heightAt(x, z);
    position.setY(i, h);
    const slope = Math.abs(heightAt(x + 0.8, z) - h) + Math.abs(heightAt(x, z + 0.8) - h);
    groundColour(colour, h, slope, (random() - 0.5) * 0.05);
    colours[i * 3] = colour.r; colours[i * 3 + 1] = colour.g; colours[i * 3 + 2] = colour.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return { mesh, geometry, material };
}

/**
 * A lane laid on the ground: one quad strip that samples the height field, so a lane climbing
 * the bridge ramp stays on the earth instead of cutting through it.
 */
export function laneRibbon(points, width, heightAt, { colour = '#6d6152', lift = 0.035 } = {}) {
  const positions = [], indices = [];
  for (let i = 0; i < points.length; i++) {
    const previous = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    const tx = next[0] - previous[0], tz = next[1] - previous[1];
    const length = Math.hypot(tx, tz) || 1;
    const nx = -tz / length * width / 2, nz = tx / length * width / 2;
    for (const side of [-1, 1]) {
      const x = points[i][0] + nx * side, z = points[i][1] + nz * side;
      positions.push(x, heightAt(x, z) + lift, z);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, materialFor(colour, { roughness: 0.88 }));
  mesh.receiveShadow = true;
  return mesh;
}

/** Densify a polyline so a ribbon follows the ground instead of spanning between corners. */
export function densify(points, step = 1.2) {
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1], [bx, bz] = points[i];
    const count = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < count; k++) out.push([lerp(ax, bx, k / count), lerp(az, bz, k / count)]);
  }
  out.push(points[points.length - 1]);
  return out;
}
