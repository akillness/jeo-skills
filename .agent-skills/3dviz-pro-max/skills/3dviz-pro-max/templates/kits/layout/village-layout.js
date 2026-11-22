// village-layout.js - a seeded village plan: lanes, building plots and scatter zones.
// Detail ladder (read on the ground, not in a mesh): lane running across the site and the plots
// hugging it / every plot square to the lane it faces, none overlapping / scatter zones filling
// the gaps the plots leave. No record: this is a composition part, not something an agent places.
// Pure data and no floating-point trig in the positions, so the same seed yields the same plan in
// Node and in a browser; every number is rounded to millimetres before it enters the plan.
import { THREE, materialFor, seeded } from '../kit-core.js';

const KINDS = [{ kind: 'cottage', footprint_m: [4.2, 3.4] },
               { kind: 'workshop', footprint_m: [5, 4] },
               { kind: 'market-stall', footprint_m: [2.6, 2.2] },
               { kind: 'barn', footprint_m: [6, 4.2] },
               { kind: 'long-hall', footprint_m: [8, 4.5] }];
const SCATTER = [{ kind: 'tree', density: 0.06 }, { kind: 'rock', density: 0.12 },
                 { kind: 'reeds', density: 0.4 }];
const round = value => Math.round(value * 1000) / 1000;
const radiusOf = ([w, d]) => Math.hypot(w, d) / 2;

/** Squared distance from a point to a segment, plus the closest point on it. */
function nearestOnSegment([px, pz], [ax, az], [bx, bz]) {
  const dx = bx - ax, dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq)) : 0;
  const cx = ax + dx * t, cz = az + dz * t;
  return { point: [cx, cz], distance: Math.hypot(px - cx, pz - cz) };
}

/** Closest point on any lane in the plan, which is what a plot turns its front towards. */
export function nearestPathPoint(paths, point) {
  let best = { point: [0, 0], distance: Infinity };
  for (const path of paths) {
    for (let i = 1; i < path.points.length; i++) {
      const hit = nearestOnSegment(point, path.points[i - 1], path.points[i]);
      if (hit.distance < best.distance) best = hit;
    }
  }
  return best;
}

/** A main lane crossing the site plus one spur, both wandering by a seeded lateral offset. */
function lanes(random, radius, pathWidth) {
  const span = radius * 0.94, points = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    points.push([round(-span + 2 * span * t), round((random() - 0.5) * radius * 0.42)]);
  }
  const from = points[1];
  const spur = [from];
  for (let i = 1; i <= 3; i++) {
    spur.push([round(from[0] + (random() - 0.35) * radius * 0.3 * i),
               round(from[1] + i * radius * 0.26 + (random() - 0.5) * radius * 0.1)]);
  }
  return [{ name: 'main-lane', width: round(pathWidth), points },
          { name: 'spur', width: round(pathWidth * 0.62), points: spur }];
}

/** Rejection sampling in the disc: a candidate must clear the lanes, the other plots and the rim. */
function plotAt(random, paths, plots, radius, pathWidth, kind) {
  const reach = radiusOf(kind.footprint_m);
  for (let attempt = 0; attempt < 240; attempt++) {
    const x = (random() * 2 - 1) * radius, z = (random() * 2 - 1) * radius;
    if (Math.hypot(x, z) > radius - reach) continue;
    const near = nearestPathPoint(paths, [x, z]);
    if (near.distance < pathWidth / 2 + reach + 0.8) continue;
    if (near.distance > pathWidth / 2 + reach + 9) continue;   // a village hugs its lane
    if (plots.some(plot => Math.hypot(plot.position[0] - x, plot.position[1] - z)
                           < reach + radiusOf(plot.footprint_m) + 1.4)) continue;
    // The plot's +Z (its door normal) points at the closest lane point: plots face the street.
    const yaw = Math.atan2(near.point[0] - x, near.point[1] - z);
    return { position: [round(x), round(z)], yawRad: Math.round(yaw * 10000) / 10000,
             footprint_m: [...kind.footprint_m], kind: kind.kind };
  }
  return null;
}

/** Rectangles of open ground for props and nature, kept clear of every plot and lane. */
function scatterZones(random, paths, plots, radius, pathWidth) {
  const zones = [];
  for (let index = 0; index < SCATTER.length * 2; index++) {
    const template = SCATTER[index % SCATTER.length];
    const half = [2.2 + random() * 1.8, 1.8 + random() * 1.4];
    for (let attempt = 0; attempt < 300; attempt++) {
      const x = (random() * 2 - 1) * radius, z = (random() * 2 - 1) * radius;
      const reach = Math.hypot(half[0], half[1]);
      if (Math.hypot(x, z) > radius - reach) continue;
      if (nearestPathPoint(paths, [x, z]).distance < pathWidth / 2 + reach * 0.7) continue;
      if (plots.some(plot => Math.hypot(plot.position[0] - x, plot.position[1] - z)
                             < reach + radiusOf(plot.footprint_m) + 0.4)) continue;
      if (zones.some(zone => Math.hypot(zone.centre_m[0] - x, zone.centre_m[1] - z)
                             < reach * 1.4)) continue;
      zones.push({ kind: template.kind, density: template.density,
                   centre_m: [round(x), round(z)],
                   polygon: [[round(x - half[0]), round(z - half[1])],
                             [round(x + half[0]), round(z - half[1])],
                             [round(x + half[0]), round(z + half[1])],
                             [round(x - half[0]), round(z + half[1])]] });
      break;
    }
  }
  return zones;
}

/**
 * Plan one village. Deterministic in `seed`: the same seed returns a byte-identical plan.
 * @returns {{paths: object[], plots: object[], scatterZones: object[]}}
 */
export function planVillage({ seed = 1, radius = 26, plotCount = 8, pathWidth = 2.6 } = {}) {
  const random = seeded(seed);
  const paths = lanes(random, radius, pathWidth);
  const plots = [];
  for (let index = 0; index < plotCount; index++) {
    const plot = plotAt(random, paths, plots, radius, pathWidth, KINDS[index % KINDS.length]);
    if (plot) plots.push(plot);
  }
  return { paths, plots, scatterZones: scatterZones(random, paths, plots, radius, pathWidth) };
}

/**
 * Choose a plot for a blueprint's footprint: the smallest free plot that still contains it.
 * Pure - the caller owns the `taken` set, so a plan can be replayed without being mutated.
 */
export function place(plan, footprint_m, taken = new Set()) {
  const [width, depth] = footprint_m;
  let best = null;
  plan.plots.forEach((plot, index) => {
    if (taken.has(index)) return;
    const [w, d] = plot.footprint_m;
    if (w + 0.001 < width || d + 0.001 < depth) return;
    const slack = w * d - width * depth;
    if (best === null || slack < best.slack) best = { index, plot, slack };
  });
  if (best === null) return null;
  return { index: best.index, position: [...best.plot.position], yawRad: best.plot.yawRad,
           kind: best.plot.kind, footprint_m: [...best.plot.footprint_m] };
}

/** The lanes as flat quads a metre-scale scene can show. Geometry only, no record, no proof. */
export function pathRibbon(plan, { colour = '#8a7b63', y = 0.012 } = {}) {
  const group = new THREE.Group();
  const material = materialFor(colour, { roughness: 0.96 });
  for (const path of plan.paths) {
    for (let i = 1; i < path.points.length; i++) {
      const [ax, az] = path.points[i - 1], [bx, bz] = path.points[i];
      const length = Math.hypot(bx - ax, bz - az);
      const geometry = new THREE.PlaneGeometry(path.width, length + path.width * 0.5);
      geometry.rotateX(-Math.PI / 2);      // face up; the height axis now runs along -Z
      const strip = new THREE.Mesh(geometry, material);
      strip.rotation.y = Math.atan2(ax - bx, az - bz);
      strip.position.set((ax + bx) / 2, y, (az + bz) / 2);
      strip.receiveShadow = true;
      group.add(strip);
    }
  }
  return group;
}
