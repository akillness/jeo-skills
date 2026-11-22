// well.js - a stone draw-well with a shingled roof, a cranked windlass and a hanging bucket.
// Detail ladder: roof gable over a round stone drum, two posts, bucket hanging in the opening
//                / three courses of dressed blocks, coping ring, shingle courses, crank arm
//                / rope coils on the windlass, iron end bands, 2 cm bevels, per-block hue jitter.
// Sockets: rim (coping top), crank (handle end), bucket (rope end), base (ground).
import { THREE, bevelledBox, collider, materialFor, part, scatterInstances,
         seeded, socket } from '../kit-core.js';

const PALETTE = { stone: '#9d968a', coping: '#b0a999', post: '#6d5335', shingle: '#7a5a49',
                  iron: '#34343a', rope: '#c2ab7e', bucket: '#8a6a45' };

/** Three courses of dressed blocks around the drum, each course offset half a block so the
 *  joints break. One geometry per course, one instance per block: the hue jitter is what
 *  keeps a ring of identical boxes from reading as a extruded circle. */
function drum(group, { radius, courses, blocks, wall, height, random }) {
  const stone = materialFor(PALETTE.stone, { roughness: 0.93 });
  const h = height / courses;
  for (let c = 0; c < courses; c++) {
    const width = ((2 * Math.PI * radius) / blocks) * 0.9;
    const geometry = bevelledBox({ width, height: h * 0.94, depth: wall, bevel: 0.018 });
    geometry.translate(0, h / 2 + c * h, radius - wall / 2);
    const placements = [];
    for (let i = 0; i < blocks; i++) {
      const a = ((i + (c % 2) * 0.5) / blocks) * Math.PI * 2;
      placements.push({ position: [0, 0, 0], rotation: [0, a, 0], hue: (random() - 0.5) * 0.07 });
    }
    group.add(scatterInstances(geometry, stone, placements));
  }
  const cap = bevelledBox({ width: ((2 * Math.PI * radius) / blocks) * 1.02, height: 0.075,
                            depth: wall + 0.075, bevel: 0.016 });
  cap.translate(0, height + 0.037, radius - wall / 2);
  const caps = Array.from({ length: blocks }, (_, i) => ({
    position: [0, 0, 0], rotation: [0, ((i + 0.25) / blocks) * Math.PI * 2, 0],
    hue: (random() - 0.5) * 0.05 }));
  group.add(scatterInstances(cap, materialFor(PALETTE.coping, { roughness: 0.82 }), caps));
  return height + 0.075;
}

/** Shingled gable over the well: strips laid a little flatter than the pitch so each course
 *  laps the one below and throws a shadow line, the same read as the cottage roof. */
function roof(group, { rimY, span, postH, pitch, random }) {
  const eaveY = rimY + postH;
  const run = span / 2 + 0.16;
  const ridgeY = eaveY + run * Math.tan(pitch);
  const slope = Math.hypot(run, ridgeY - eaveY);
  const rows = Math.max(3, Math.round(slope * 5));
  const strip = bevelledBox({ width: span + 0.3, height: 0.035,
                              depth: slope / rows + 0.03, bevel: 0.008 });
  const placements = [];
  for (const side of [1, -1]) {
    for (let i = 0; i < rows; i++) {
      const t = (i + 0.5) / rows;
      placements.push({ position: [0, ridgeY - t * (ridgeY - eaveY) + 0.018, side * t * run],
                        rotation: [side * (pitch - 0.12), 0, 0], hue: (random() - 0.5) * 0.05 });
    }
  }
  group.add(scatterInstances(strip, materialFor(PALETTE.shingle, { roughness: 0.86 }), placements));
  group.add(part(bevelledBox({ width: span + 0.34, height: 0.07, depth: 0.11, bevel: 0.02 }),
                 materialFor(PALETTE.post, { roughness: 0.66 }), [0, ridgeY + 0.02, 0]));
  return ridgeY;
}

/** Windlass barrel, its iron end bands, the crank arm and the coiled rope. */
function windlass(group, { span, y, radius, random }) {
  const iron = materialFor(PALETTE.iron, { roughness: 0.44, metalness: 0.7 });
  const barrel = new THREE.CylinderGeometry(radius, radius, span - 0.1, 10);
  barrel.rotateZ(Math.PI / 2);
  group.add(part(barrel, materialFor(PALETTE.post, { roughness: 0.7 }), [0, y, 0]));
  for (const sx of [1, -1]) {
    const band = new THREE.CylinderGeometry(radius + 0.012, radius + 0.012, 0.03, 10);
    band.rotateZ(Math.PI / 2);
    group.add(part(band, iron, [sx * (span / 2 - 0.09), y, 0]));
  }
  // Rope coils: five rings wound over the barrel, each nudged along it by a seeded amount.
  const coil = new THREE.TorusGeometry(radius + 0.014, 0.014, 4, 14);
  coil.rotateY(Math.PI / 2);
  const rope = materialFor(PALETTE.rope, { roughness: 0.97 });
  const coils = [];
  for (let i = 0; i < 5; i++) {
    coils.push({ position: [-0.1 + i * 0.035 + (random() - 0.5) * 0.008, y, 0], hue: 0 });
  }
  group.add(scatterInstances(coil, rope, coils));
  const armX = span / 2 + 0.13;
  group.add(part(bevelledBox({ width: 0.045, height: 0.26, depth: 0.045, bevel: 0.011 }),
                 iron, [armX, y - 0.1, 0]));
  group.add(part(bevelledBox({ width: 0.05, height: 0.05, depth: 0.26, bevel: 0.012 }),
                 materialFor(PALETTE.post, { roughness: 0.58 }), [armX, y - 0.21, 0.12]));
  return { handle: [armX, y - 0.21, 0.25], rope };
}

export function create({ radius = 0.66, postHeight = 1.28, seed = 1, blocks = 12,
                         wall = 0.24, drumHeight = 0.72, roofPitchDeg = 38 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const rimY = drum(group, { radius, courses: 3, blocks, wall, height: drumHeight, random });
  const span = 2 * (radius - wall * 0.4);
  const post = materialFor(PALETTE.post, { roughness: 0.74 });
  for (const sx of [1, -1]) {
    group.add(part(bevelledBox({ width: 0.095, height: postHeight, depth: 0.095, bevel: 0.016 }),
                   post, [sx * (span / 2), rimY + postHeight / 2, 0]));
  }
  const ridgeY = roof(group, { rimY, span, postH: postHeight,
                               pitch: (roofPitchDeg * Math.PI) / 180, random });
  const axleY = rimY + postHeight - 0.24;
  const { handle, rope } = windlass(group, { span, y: axleY, radius: 0.075, random });

  // Rope and bucket hanging over the well mouth: the reason the whole thing is here. The
  // bucket has to clear the coping, or it hangs inside the drum where nothing can see it.
  const drop = axleY - rimY - 0.34;
  const line = new THREE.CylinderGeometry(0.014, 0.014, drop, 6);
  group.add(part(line, rope, [0.12, axleY - drop / 2, 0]));
  const bucketH = 0.26;
  const staves = new THREE.CylinderGeometry(0.13, 0.115, bucketH, 12, 1, true);
  group.add(part(staves, materialFor(PALETTE.bucket, { roughness: 0.8 }),
                 [0.12, axleY - drop - bucketH / 2 + 0.02, 0]));
  const hoop = new THREE.TorusGeometry(0.128, 0.011, 4, 14);
  hoop.rotateX(Math.PI / 2);
  group.add(part(hoop, materialFor(PALETTE.iron, { roughness: 0.4, metalness: 0.65 }),
                 [0.12, axleY - drop - 0.03, 0]));

  const sockets = [socket('rim', [0, rimY, 0], [0, 1, 0]),
                   socket('crank', handle, [0, 0, 1]),
                   socket('bucket', [0.12, axleY - drop, 0], [0, -1, 0]),
                   socket('base', [0, 0, 0], [0, 1, 0])];
  const colliders = [collider('drum', [0, drumHeight / 2, 0],
                              [2 * radius, drumHeight + 0.075, 2 * radius]),
                     collider('roof', [0, (rimY + postHeight + ridgeY) / 2, 0],
                              [span + 0.34, ridgeY - rimY - postHeight, 2 * radius + 0.4])];
  return { group, sockets, colliders };
}
