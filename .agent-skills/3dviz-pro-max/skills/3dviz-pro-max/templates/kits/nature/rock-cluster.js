// rock-cluster.js - a scatter of glacial boulders: five jittered shapes, three instanced fields.
// Detail ladder: three or more boulders of clearly different mass, part-buried, none spherical
//                / flat facets meeting at hard edges, one leaning slab, a ring of pebbles
//                / chipped facet corners from welded vertex jitter, grit, 6 percent hue jitter.
// Sockets: base (ground), perch (the tallest boulder's crown), shelter (leeward side).
// instancing: { geometry, material, hueJitter } - the primary boulder shape, normalised to a
// unit box with its base at y = 0; hand it to THREE.InstancedMesh or kit-core scatterInstances
// to gravel a whole shoreline from one draw call.
import { THREE, collider, materialFor, scatterInstances, seeded, socket } from '../kit-core.js';

// Palette entries are the colours that render: kit-core's scatterInstances runs its
// InstancedMesh on a white-based clone, so an unjittered pebble lands on exactly this grey.
const PALETTE = { pebble: '#7c7a73' };

/** Facet jitter on a welded icosahedron: every vertex sharing a position moves together, so
 *  faces stay closed and the silhouette gains the chipped corners a boulder needs.
 *  IcosahedronGeometry is non-indexed, hence the quantised-position weld map. */
function jitteredIcosahedron(detail, amount, random) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const position = geometry.attributes.position;
  const moves = new Map();
  for (let i = 0; i < position.count; i++) {
    const k = `${Math.round(position.getX(i) * 1e4)},${Math.round(position.getY(i) * 1e4)},` +
              `${Math.round(position.getZ(i) * 1e4)}`;
    if (!moves.has(k)) moves.set(k, 1 + (random() - 0.5) * 2 * amount);
    const s = moves.get(k);
    position.setXYZ(i, position.getX(i) * s, position.getY(i) * s * 0.84, position.getZ(i) * s);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A boulder shape tumbled into its resting attitude and normalised to a unit box standing on
 *  y = 0. Baking the tumble into the geometry means an instance only ever spins about Y, which
 *  keeps every instance's bounding box exact - a tilted instance box would lift the whole
 *  cluster off the ground in the framing maths. */
function boulderShape(detail, amount, random) {
  const geometry = jitteredIcosahedron(detail, amount, random);
  geometry.rotateX((random() - 0.5) * 1.5);
  geometry.rotateZ((random() - 0.5) * 1.5);
  geometry.rotateY(random() * Math.PI * 2);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const size = box.getSize(new THREE.Vector3());
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  geometry.scale(1 / size.x, 1 / size.y, 1 / size.z);
  return geometry;
}

/** Boulders are sunk a quarter of their height: a stone resting exactly on the ground plane
 *  reads as a prop dropped into the scene rather than as part of it. */
function place(count, spread, random) {
  const placements = [];
  for (let i = 0; i < count; i++) {
    // Golden angle, not an even ring: an even ring reads as a stone circle, and a random
    // angle piles two boulders on top of each other about a third of the time.
    const a = i * 2.39996 + (random() - 0.5) * 0.5;
    const d = spread * (0.22 + 0.78 * Math.sqrt((i + 0.6) / count));
    const mass = 0.32 + random() ** 1.6 * 0.72;
    const scale = [mass * (0.85 + random() * 0.55), mass * (0.55 + random() * 0.6),
                   mass * (0.85 + random() * 0.55)];
    placements.push({ position: [Math.cos(a) * d, -scale[1] * 0.24, Math.sin(a) * d],
                      rotation: [0, random() * Math.PI * 2, 0], scale,
                      hue: (random() - 0.5) * 0.06 });
  }
  return placements;
}

export function create({ count = 8, seed = 1, spread = 1.05, rock = '#8e8b84' } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  // One roughness per shape: a cluster where every stone takes the light identically reads as
  // one material scaled three ways, and the damp stone is the one the eye picks out.
  const surfaces = [0.93, 0.82, 0.98].map(
    roughness => materialFor(rock, { roughness, flatShading: true }));
  const material = surfaces[0];
  const shapes = [boulderShape(1, 0.22, random), boulderShape(1, 0.32, random),
                  boulderShape(0, 0.4, random)];
  const placements = place(Math.max(3, Math.round(count)), spread, random);

  // Three shapes, so a cluster never reads as one stone scaled three ways; each shape carries
  // its own share of the field and its own instanced draw call.
  for (let s = 0; s < shapes.length; s++) {
    const share = placements.filter((_, i) => i % shapes.length === s);
    if (share.length) group.add(scatterInstances(shapes[s], surfaces[s], share));
  }

  // Pebble ring: the fine band, and what ties the cluster to the ground plane.
  const pebble = boulderShape(0, 0.45, random);
  const grit = [];
  for (let i = 0; i < count + 6; i++) {
    const a = random() * Math.PI * 2, d = spread * (0.62 + random() * 0.8);
    const size = 0.05 + random() * 0.08;
    grit.push({ position: [Math.cos(a) * d, -size * 0.3, Math.sin(a) * d],
                rotation: [0, random() * Math.PI * 2, 0],
                scale: [size * 1.4, size, size * (0.9 + random() * 0.6)],
                hue: (random() - 0.5) * 0.08 });
  }
  group.add(scatterInstances(pebble, materialFor(PALETTE.pebble, { roughness: 0.97,
                                                                   flatShading: true }), grit));

  let tallest = placements[0];
  for (const p of placements) {
    if (p.position[1] + p.scale[1] > tallest.position[1] + tallest.scale[1]) tallest = p;
  }
  const crown = [tallest.position[0], tallest.position[1] + tallest.scale[1],
                 tallest.position[2]];
  const sockets = [socket('base', [0, 0, 0], [0, 1, 0]),
                   socket('perch', crown, [0, 1, 0]),
                   socket('shelter', [-spread * 0.9, 0.06, 0], [-1, 0, 0])];
  const colliders = [collider('cluster', [0, crown[1] / 2, 0],
                              [spread * 2.4, crown[1] + 0.1, spread * 2.4])];
  return { group, sockets, colliders,
           instancing: { geometry: shapes[0], material, hueJitter: 0.06 } };
}
