// crate.js - a nailed shipping crate: horizontal planks, corner posts and a diagonal brace.
// Detail ladder: cubic mass broken by four corner posts standing 2 cm proud of every face
//                / four planks a side with 1 cm gaps, a diagonal brace on two faces, lid battens
//                / dome nail heads at every plank end, 1 cm bevels, per-plank hue jitter.
// Sockets: lid (stacking face), base (ground), label (front face at eye height for a stall).
import { THREE, bevelledBox, collider, materialFor, part, scatterInstances,
         seeded, socket } from '../kit-core.js';

const PALETTE = { plank: '#b08a5c', post: '#8a6a45', brace: '#7d6140', nail: '#cfc9bd' };
const POST = 0.062, PLANK_T = 0.032, GAP = 0.011;

/** One instanced ring of side planks: the geometry carries the face offset, the instance
 *  rotation picks the face. Four faces from one geometry keeps the crate under a thousand
 *  triangles while every plank still gets its own hue. */
function sidePlanks(size, count, random) {
  const half = size / 2;
  const plankH = (size - (count + 1) * GAP) / count;
  const geometry = bevelledBox({ width: size - 2 * POST + 0.01, height: plankH,
                                 depth: PLANK_T, bevel: 0.009 });
  geometry.translate(0, 0, half - PLANK_T / 2 + 0.004);
  const placements = [];
  const ys = [];
  for (let face = 0; face < 4; face++) {
    for (let i = 0; i < count; i++) {
      const y = GAP + plankH / 2 + i * (plankH + GAP);
      placements.push({ position: [0, y, 0], rotation: [0, (face * Math.PI) / 2, 0],
                        hue: (random() - 0.5) * 0.05 });
      if (face === 0) ys.push(y);
    }
  }
  return { geometry, placements, ys, plankH };
}

/** Corner posts: the crate's silhouette break. Flush battens read as paint, not as timber. */
function cornerPosts(group, size) {
  const wood = materialFor(PALETTE.post, { roughness: 0.7 });
  const off = size / 2 - POST / 2 + 0.018;
  const geometry = bevelledBox({ width: POST, height: size, depth: POST, bevel: 0.011 });
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) group.add(part(geometry, wood, [sx * off, size / 2, sz * off]));
  }
}

/** A single diagonal brace across two opposite faces, laid over the planks. */
function braces(group, size) {
  const span = size - 2 * POST;
  const length = Math.hypot(span, size * 0.86);
  const geometry = bevelledBox({ width: length, height: 0.055, depth: 0.026, bevel: 0.008 });
  geometry.rotateZ(Math.atan2(size * 0.86, span));
  geometry.translate(0, size / 2, size / 2 + PLANK_T * 0.6);
  const wood = materialFor(PALETTE.brace, { roughness: 0.75 });
  for (const face of [0, 2]) {
    group.add(part(geometry, wood, [0, 0, 0], [0, (face * Math.PI) / 2, 0]));
  }
}

/** Lid: four planks running the other way plus two battens, so the top is not a slab. */
function lid(group, size, count, random) {
  const wood = materialFor(PALETTE.plank, { roughness: 0.82 });
  const width = (size - (count + 1) * GAP) / count;
  for (let i = 0; i < count; i++) {
    const x = -size / 2 + GAP + width / 2 + i * (width + GAP);
    group.add(part(bevelledBox({ width, height: PLANK_T, depth: size - 0.02, bevel: 0.008 }),
                   wood, [x, size + PLANK_T / 2 + (random() - 0.5) * 0.003, 0]));
  }
  const batten = materialFor(PALETTE.post, { roughness: 0.7 });
  for (const sz of [1, -1]) {
    group.add(part(bevelledBox({ width: size + 0.02, height: 0.03, depth: 0.05, bevel: 0.008 }),
                   batten, [0, size + PLANK_T + 0.014, sz * (size / 2 - 0.07)]));
  }
}

export function create({ size = 0.62, planks = 4, seed = 1, braced = true } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  // Inner liner: without it the plank gaps show the sky straight through the crate, which
  // reads as a broken box rather than as a packed one.
  group.add(part(bevelledBox({ width: size - 0.07, height: size - 0.04, depth: size - 0.07,
                               bevel: 0.01 }), materialFor('#3a2c1e', { roughness: 0.98 }),
                 [0, size / 2, 0]));
  const { geometry, placements, ys } = sidePlanks(size, planks, random);
  group.add(scatterInstances(geometry, materialFor(PALETTE.plank, { roughness: 0.82 }),
                             placements));
  cornerPosts(group, size);
  if (braced) braces(group, size);
  lid(group, size, planks, random);

  // Dome nail heads at every plank end. Positions are rotated in JS because the instance
  // rotation has to orient the flattened dome as well as place it.
  const nail = new THREE.SphereGeometry(0.014, 7, 4);
  nail.scale(1, 1, 0.5);
  const z0 = size / 2 + PLANK_T * 0.55;
  const nails = [];
  for (let face = 0; face < 4; face++) {
    const a = (face * Math.PI) / 2, sin = Math.sin(a), cos = Math.cos(a);
    for (const y of ys) {
      for (const u of [-(size / 2 - POST - 0.012), size / 2 - POST - 0.012]) {
        nails.push({ position: [u * cos + z0 * sin, y, -u * sin + z0 * cos],
                     rotation: [0, a, 0], hue: 0 });
      }
    }
  }
  group.add(scatterInstances(nail, materialFor(PALETTE.nail, { roughness: 0.33, metalness: 0.55 }),
                             nails));

  const top = size + PLANK_T + 0.03;
  const sockets = [socket('lid', [0, top, 0], [0, 1, 0]),
                   socket('base', [0, 0, 0], [0, 1, 0]),
                   socket('label', [0, size * 0.6, size / 2 + PLANK_T], [0, 0, 1])];
  const colliders = [collider('crate', [0, top / 2, 0], [size + 0.04, top, size + 0.04])];
  return { group, sockets, colliders };
}
