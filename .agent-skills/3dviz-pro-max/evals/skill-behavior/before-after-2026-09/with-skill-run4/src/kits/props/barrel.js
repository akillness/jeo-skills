// barrel.js - a coopered oak barrel: bulged staves, iron hoops and a plank head.
// Detail ladder: bulged silhouette + chime standing proud of the head
//                / individual staves with gaps, four hoops, three-plank lid
//                / hoop rivets, 1.2 cm stave bevels, per-stave hue jitter.
// Sockets: lid (head centre), base (ground), tap (bung hole on the +Z belly).
import { THREE, bevelledBox, collider, materialFor, part, scatterInstances,
         seeded, socket } from '../kit-core.js';

const PALETTE = { oak: '#a8794a', iron: '#3a3a40', head: '#b78e5e', rivet: '#cfc9bd' };
const COURSES = 4, THICKNESS = 0.055, HOOP_TUBE = 0.017;
const HOOP_STOPS = [0.055, 0.25, 0.5, 0.75, 0.945];

/** Barrel profile: 0.86 R at both heads, full R at the belly. A cylinder is a bucket. */
function profile(t, radius, bulge) {
  return radius * (1 - bulge * (2 * t - 1) ** 2);
}

/** One course of staves, pre-tilted and pushed out to its own radius so a single Y rotation
 *  per instance places it. Baking the tilt into the geometry avoids Euler-order surprises. */
function staveCourse(index, { height, radius, staves, bulge, gap }) {
  const h = height / COURSES;
  const y0 = index * h, y1 = y0 + h, yc = (y0 + y1) / 2;
  const r0 = profile(y0 / height, radius, bulge), r1 = profile(y1 / height, radius, bulge);
  const rc = profile(yc / height, radius, bulge);
  const width = ((2 * Math.PI * rc) / staves) * (1 - gap);
  const geometry = bevelledBox({ width, height: h * 1.03, depth: THICKNESS, bevel: 0.012 });
  geometry.rotateX(Math.atan2(r1 - r0, h));
  geometry.translate(0, yc, rc - THICKNESS / 2);
  return geometry;
}

/** Five iron hoops: one at each head and one over every course join. Each stands 1 cm proud
 *  of the staves, which is what turns a wooden cylinder into a coopered barrel. */
function hoops(group, rivets, { height, radius, bulge, random }) {
  const iron = materialFor(PALETTE.iron, { roughness: 0.42, metalness: 0.7 });
  for (const t of HOOP_STOPS) {
    const y = t * height;
    const r = profile(t, radius, bulge) + HOOP_TUBE * 0.4;
    const torus = new THREE.TorusGeometry(r, HOOP_TUBE, 4, 18);
    torus.rotateX(Math.PI / 2);
    group.add(part(torus, iron, [0, y, 0]));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + random() * 0.2;
      rivets.push({ position: [Math.sin(a) * (r + HOOP_TUBE * 0.6), y,
                               Math.cos(a) * (r + HOOP_TUBE * 0.6)],
                    rotation: [0, a - Math.PI / 2, -Math.PI / 2], hue: 0 });
    }
  }
}

/** A solid head disc with two raised seam battens and a bung boss on the top head. A head cut
 *  from three chord-fitted planks leaves triangular gaps at the rim that the eye reads as a
 *  hole straight into the cask, so the boards are laid over a closed disc instead. */
function head(group, { height, radius, bulge, top, random }) {
  const wood = materialFor(PALETTE.head, { roughness: 0.86 });
  const r = profile(top ? 0.96 : 0.04, radius, bulge) - THICKNESS * 0.75;
  const y = top ? height - 0.05 : 0.05;
  const disc = new THREE.CylinderGeometry(r, r, 0.05, 16);
  group.add(part(disc, wood, [0, y, 0]));
  if (!top) return;
  const seam = materialFor('#8d6a44', { roughness: 0.93 });
  for (const sx of [-1, 1]) {
    const x = sx * r * 0.42;
    const depth = 2 * Math.sqrt(Math.max(0.01, r * r - (Math.abs(x) + 0.02) ** 2));
    group.add(part(bevelledBox({ width: 0.028, height: 0.022, depth, bevel: 0.006 }), seam,
                   [x, y + 0.032, 0]));
  }
  const bung = new THREE.CylinderGeometry(0.035, 0.04, 0.028, 8);
  group.add(part(bung, materialFor(PALETTE.rivet, { roughness: 0.55 }),
                 [r * 0.5 * (random() - 0.5), y + 0.034, r * 0.4]));
}

export function create({ height = 0.94, radius = 0.34, staves = 16, seed = 1,
                         bulge = 0.2, gap = 0.06 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const oak = materialFor(PALETTE.oak, { roughness: 0.78 });
  const angles = Array.from({ length: staves }, (_, i) => (i / staves) * Math.PI * 2);

  for (let index = 0; index < COURSES; index++) {
    const geometry = staveCourse(index, { height, radius, staves, bulge, gap });
    // Hue jitter per stave: a coopered barrel is never one flat brown, and the variation is
    // the only fine-band feature still legible once the rivets fall below a pixel.
    const placements = angles.map(a => ({ position: [0, 0, 0], rotation: [0, a, 0],
                                          hue: (random() - 0.5) * 0.05 }));
    group.add(scatterInstances(geometry, oak, placements));
  }

  const rivets = [];
  hoops(group, rivets, { height, radius, bulge, random });
  head(group, { height, radius, bulge, top: true, random });
  head(group, { height, radius, bulge, top: false, random });

  const rivetGeometry = new THREE.CylinderGeometry(0.012, 0.014, 0.012, 6);
  group.add(scatterInstances(rivetGeometry,
                             materialFor(PALETTE.rivet, { roughness: 0.34, metalness: 0.6 }),
                             rivets));

  const sockets = [socket('lid', [0, height, 0], [0, 1, 0]),
                   socket('base', [0, 0, 0], [0, 1, 0]),
                   socket('tap', [0, height * 0.34, radius], [0, 0, 1])];
  const colliders = [collider('barrel', [0, height / 2, 0], [2 * radius, height, 2 * radius])];
  return { group, sockets, colliders };
}
