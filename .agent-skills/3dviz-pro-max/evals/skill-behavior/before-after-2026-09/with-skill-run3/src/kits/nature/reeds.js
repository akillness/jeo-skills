// reeds.js - a clump of instanced water reeds on a low tussock, bending in the wind.
// Detail ladder: a fan of blades of clearly different heights over a mounded tussock
//                / every blade curving in its own direction, a dozen carrying seed heads
//                / tapered blade tips down to 3 mm, faceted tussock, 8 percent hue jitter.
// Sockets: base (ground), tip (tallest blade), edge (the downwind side of the clump).
// instancing: { geometry, material, hueJitter } - the blade itself, standing on y = 0 with its
// tip at y = 1, so one THREE.InstancedMesh or kit-core scatterInstances call fills a whole bank.
// animate(dt) (alias sway) bends every blade about its own base; it returns false when dt <= 0.
import { THREE, collider, materialFor, scatterInstances, seeded, socket } from '../kit-core.js';

// Palette entries are the colours that render: kit-core's scatterInstances runs its
// InstancedMesh on a white-based clone, so an unjittered blade lands on exactly this hex.
const PALETTE = { blade: '#7c9455', head: '#a48a56', tussock: '#5c633b' };

/** A unit blade: base on y = 0, tip at y = 1, thinned from 14 mm to 3 mm and swept along +X
 *  by a quadratic so the whole clump does not read as a hedgehog of straight spikes. */
function bladeGeometry(curve) {
  const geometry = new THREE.CylinderGeometry(0.003, 0.014, 1, 3, 5);
  geometry.translate(0, 0.5, 0);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const t = Math.max(0, position.getY(i));
    position.setX(i, position.getX(i) + curve * t * t);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** The seed head sits where the blade tip lands, in the same geometry space, so one instance
 *  transform carries blade and head together and the head can never drift off its stem. */
function headGeometry(curve) {
  const geometry = new THREE.SphereGeometry(0.028, 5, 4);
  geometry.scale(1, 2.6, 1);
  geometry.translate(curve * 0.9, 0.9, 0);
  return geometry;
}

/** Low faceted mound the blades grow out of: without it the clump floats on the ground plane. */
function tussock(spread, random) {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const position = geometry.attributes.position;
  const moves = new Map();
  for (let i = 0; i < position.count; i++) {
    const k = `${Math.round(position.getX(i) * 1e3)},${Math.round(position.getY(i) * 1e3)},` +
              `${Math.round(position.getZ(i) * 1e3)}`;
    if (!moves.has(k)) moves.set(k, 1 + (random() - 0.5) * 0.3);
    const s = moves.get(k);
    position.setXYZ(i, position.getX(i) * s * spread * 0.95,
                    Math.max(0, position.getY(i)) * s * spread * 0.19, position.getZ(i) * s * spread * 0.95);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function create({ count = 40, seed = 1, spread = 0.62, height = 1.25,
                         blade = '#7c9455' } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const material = materialFor(blade, { roughness: 0.88, flatShading: true });
  const headMaterial = materialFor(PALETTE.head, { roughness: 0.94 });
  const curves = [0.17, 0.34];
  const shapes = curves.map(bladeGeometry);
  const fields = [];

  const total = Math.max(6, Math.round(count));
  for (let s = 0; s < curves.length; s++) {
    const placements = [];
    const heads = [];
    for (let i = s; i < total; i += curves.length) {
      const a = random() * Math.PI * 2;
      const d = spread * Math.sqrt(random());
      const scale = height * (0.5 + random() ** 1.4 * 0.62);
      const placement = { position: [Math.cos(a) * d, -0.02, Math.sin(a) * d],
                          rotation: [0, random() * Math.PI * 2, 0], scale,
                          hue: (random() - 0.5) * 0.08,
                          phase: random() * Math.PI * 2, gust: 0.05 + random() * 0.09 };
      placements.push(placement);
      if (random() < 0.32) heads.push(placement);
    }
    const mesh = scatterInstances(shapes[s], material, placements);
    group.add(mesh);
    fields.push({ mesh, placements, blades: true });
    if (heads.length) {
      // One head mesh per blade curvature: a head built for the hooked blade and hung on a
      // gently curved one floats a hand's width off its own stem.
      const crown = scatterInstances(headGeometry(curves[s]), headMaterial, heads);
      group.add(crown);
      fields.push({ mesh: crown, placements: heads });
    }
  }
  group.add(scatterInstances(tussock(spread, random),
                             materialFor(PALETTE.tussock, { roughness: 0.97, flatShading: true }),
                             [{ position: [0, 0, 0], hue: 0 }]));

  // --- wind: each blade rotates about its own base, at its own phase and gust strength ------
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const vector = new THREE.Vector3();
  const scaleVector = new THREE.Vector3();
  let time = 0;
  const sway = (dt, strength = 1) => {
    if (!(dt > 0)) return false;
    time += dt;
    for (const field of fields) {
      field.placements.forEach((placement, index) => {
        const bend = Math.sin(time * 1.7 + placement.phase) * placement.gust * strength;
        euler.set(bend, placement.rotation[1], bend * 0.45);
        quaternion.setFromEuler(euler);
        vector.set(...placement.position);
        scaleVector.setScalar(placement.scale);
        field.mesh.setMatrixAt(index, matrix.compose(vector, quaternion, scaleVector));
      });
      field.mesh.instanceMatrix.needsUpdate = true;
    }
    return true;
  };

  let tallest = fields[0].placements[0];
  for (const field of fields) {
    if (!field.blades) continue;
    for (const p of field.placements) if (p.scale > tallest.scale) tallest = p;
  }
  const sockets = [socket('base', [0, 0, 0], [0, 1, 0]),
                   socket('tip', [tallest.position[0], tallest.scale, tallest.position[2]],
                          [0, 1, 0]),
                   socket('edge', [spread, 0.04, 0], [1, 0, 0])];
  const colliders = [collider('clump', [0, height * 0.4, 0],
                              [spread * 2.2, height * 0.9, spread * 2.2])];
  return { group, sockets, colliders, animate: sway, sway,
           instancing: { geometry: shapes[0], material, hueJitter: 0.08 } };
}
