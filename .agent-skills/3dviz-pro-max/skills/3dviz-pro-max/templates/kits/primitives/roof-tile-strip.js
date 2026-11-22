// roof-tile-strip.js - one roof slope as lapped tile courses in a single InstancedMesh.
// Each course is laid a few degrees flatter than the roof plane and lifted off it, so its lower
// edge laps the course below and throws the shadow line that makes a roof read as tiled.
// Detail ladder: the slope plane and its eave overhang / three to four visible courses per metre
//                / chamfered course edges, per-course hue jitter, a lifted slipped tile.
// Local frame: origin on the ridge line; the slope falls toward side * +Z. Base course last.
// Sockets: ridge (the top of the slope), eave (the low outer edge).
import { THREE, bevelledBox, materialFor, part, scatterInstances, seeded,
         socket } from '../kit-core.js';
import { darken } from './bevelled-box.js';

const LAP_RAD = 0.13, LIFT = 0.03;

export function create({ width = 4.2, run = 1.95, pitchRad = 0.733, rows = 0, side = 1,
                         color = '#8d5a4a', hueJitter = 0.045, slipped = true,
                         verge = 0.15, seed = 1 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const drop = run * Math.tan(pitchRad);
  const slope = Math.hypot(run, drop);
  const courses = rows > 0 ? rows : Math.max(3, Math.round(slope * 3.2));
  const strip = bevelledBox({ width: width + 2 * verge, height: 0.06,
                              depth: slope / courses + 0.045, bevel: 0.012 });
  const placements = [];
  for (let i = 0; i < courses; i++) {
    const t = (i + 0.5) / courses;
    placements.push({ position: [0, -t * drop + Math.cos(pitchRad) * LIFT,
                                 side * (t * run + Math.sin(pitchRad) * LIFT)],
                      rotation: [side * (pitchRad - LAP_RAD), 0, 0],
                      hue: (random() - 0.5) * hueJitter });
  }
  group.add(scatterInstances(strip, materialFor(color, { roughness: 0.8 }),
                             placements));

  // Barge board along the verge: without it the courses end in mid-air at the gable.
  const barge = materialFor(darken(color, 0.4), { roughness: 0.86 });
  for (const end of [1, -1]) {
    group.add(part(bevelledBox({ width: 0.055, height: 0.11, depth: slope + 0.12, bevel: 0.02 }),
                   barge, [end * (width / 2 + verge), -drop / 2 + 0.05, side * run / 2],
                   [side * pitchRad, 0, 0]));
  }
  // One slipped tile per slope: the cheapest way to say "weathered" without a texture.
  if (slipped) {
    const t = 0.45 + random() * 0.3;
    group.add(part(bevelledBox({ width: 0.36, height: 0.05, depth: slope / courses + 0.02,
                                 bevel: 0.012 }), materialFor(darken(color, 0.18),
                                                              { roughness: 0.72 }),
                   [(random() - 0.5) * width * 0.6, -t * drop + 0.075,
                    side * (t * run + 0.035)],
                   [side * (pitchRad - LAP_RAD - 0.16), (random() - 0.5) * 0.25, 0]));
  }

  const sockets = [socket('ridge', [0, 0, 0], [0, 1, 0]),
                   socket('eave', [0, -drop, side * run], [0, 0, side])];
  return { group, sockets, colliders: [], drop, slope };
}
