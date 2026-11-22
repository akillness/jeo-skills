// fence-run.js - a paddock fence of instanced posts carrying three sagging rails.
// Detail ladder: post rhythm along the run, rails visibly dipping between every pair of posts
//                / chamfered post caps, three rail courses, per-post lean off vertical
//                / nail heads at each rail-to-post joint, 1 cm bevels, per-post hue jitter.
// Sockets: start and end (the two run ends, for butting runs together), gate (mid-run top).
import { THREE, bevelledBox, collider, materialFor, part, scatterInstances,
         seeded, socket } from '../kit-core.js';

const PALETTE = { post: '#8b6f4a', rail: '#ab8b60', nail: '#d8d2c6' };
const POST_W = 0.125, RAIL_H = 0.085, RAIL_T = 0.05, SEGMENTS = 4;
const RAIL_Z = POST_W / 2 + RAIL_T / 2 - 0.008;

/** Post positions along the run. The end posts sit exactly on the run ends so two runs butt
 *  together without a double post, and every interior post carries a seeded lean and hue. */
function postPlacements(length, count, random) {
  const placements = [];
  for (let i = 0; i < count; i++) {
    const x = -length / 2 + (length * i) / (count - 1);
    placements.push({ position: [x, 0, 0], rotation: [0, (random() - 0.5) * 0.16,
                                                      (random() - 0.5) * 0.05],
                      hue: (random() - 0.5) * 0.06, x });
  }
  return placements;
}

/** One rail course across one bay, built as SEGMENTS chords of a parabolic sag. A straight
 *  rail is the single thing that makes a procedural fence read as a fence-shaped decal. */
function railSegments(x0, x1, y, sag, out) {
  const height = u => y - sag * (1 - (2 * u - 1) ** 2);
  for (let s = 0; s < SEGMENTS; s++) {
    const u0 = s / SEGMENTS, u1 = (s + 1) / SEGMENTS;
    const ax = x0 + (x1 - x0) * u0, bx = x0 + (x1 - x0) * u1;
    const ay = height(u0), by = height(u1);
    const length = Math.hypot(bx - ax, by - ay);
    out.push({ position: [(ax + bx) / 2, (ay + by) / 2, 0],
               rotation: [0, 0, Math.atan2(by - ay, bx - ax)],
               scale: [length, 1, 1], hue: 0 });
  }
}

export function create({ length_m = 4.6, posts = 4, height = 1.18, seed = 1, sag = 0.055 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const count = Math.max(2, Math.round(posts));
  const placed = postPlacements(length_m, count, random);

  // --- silhouette band: the posts, each with a chamfered cap so the top is not a cut stick ---
  const postGeometry = bevelledBox({ width: POST_W, height, depth: POST_W, bevel: 0.014 });
  postGeometry.translate(0, height / 2, 0);
  const cap = new THREE.ConeGeometry(POST_W * 0.86, 0.1, 4);
  cap.rotateY(Math.PI / 4);
  cap.translate(0, height + 0.042, 0);
  const postMaterial = materialFor(PALETTE.post, { roughness: 0.86 });
  group.add(scatterInstances(postGeometry, postMaterial, placed));
  group.add(scatterInstances(cap, materialFor(PALETTE.post, { roughness: 0.62 }), placed));

  // --- medium band: three rail courses, each sagging inside every bay -----------------------
  const levels = [height * 0.86, height * 0.56, height * 0.26];
  const railPlacements = [];
  const nails = [];
  for (let bay = 0; bay < count - 1; bay++) {
    for (const y of levels) {
      railSegments(placed[bay].x, placed[bay + 1].x, y, sag, railPlacements);
    }
  }
  for (const p of placed) {
    for (const y of levels) {
      for (const dx of [-0.028, 0.028]) {
        nails.push({ position: [p.x + dx + (random() - 0.5) * 0.008, y,
                                RAIL_Z + RAIL_T / 2 + 0.004], hue: 0 });
      }
    }
  }
  // Rails are nailed to one face of the posts, not buried in them: a rail on the post centre
  // line hides its own nails inside the post and loses the whole fine band.
  const railGeometry = bevelledBox({ width: 1, height: RAIL_H, depth: RAIL_T, bevel: 0.01 });
  railGeometry.translate(0, 0, RAIL_Z);
  group.add(scatterInstances(railGeometry, materialFor(PALETTE.rail, { roughness: 0.74 }),
                             railPlacements));

  // --- fine band: a nail head on each face of every rail-to-post joint ----------------------
  const nail = new THREE.SphereGeometry(0.021, 7, 4);
  nail.scale(1, 1, 0.5);
  group.add(scatterInstances(nail, materialFor(PALETTE.nail, { roughness: 0.31, metalness: 0.6 }),
                             nails));

  const sockets = [socket('start', [-length_m / 2, 0, 0], [-1, 0, 0]),
                   socket('end', [length_m / 2, 0, 0], [1, 0, 0]),
                   socket('gate', [0, height, 0], [0, 1, 0])];
  const colliders = [collider('run', [0, height / 2, RAIL_Z / 2],
                              [length_m + POST_W, height, POST_W + RAIL_T + 0.02])];
  return { group, sockets, colliders };
}
