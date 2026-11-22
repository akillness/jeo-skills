// clothesline.js - two braced poles carrying a sagging line of pegged washing.
// Detail ladder: two A-braced poles and the line dipping between them, sheets breaking the gap
//                / cross arms, diagonal braces, five sheets each hung at its own angle and size
//                / two pegs per sheet, a darker hem strip along every bottom edge, hue jitter.
// Sockets: left and right (pole feet), line (lowest point of the rope).
import { THREE, bevelledBox, collider, materialFor, part, scatterInstances,
         seeded, socket } from '../kit-core.js';

const PALETTE = { pole: '#7a6142', rope: '#cbb98d', cloth: '#d9cdb4', hem: '#a89c86',
                  peg: '#a8834f' };
const SEGMENTS = 14;

/** Rope height at parameter u across the span: a parabola is close enough to a catenary at
 *  these sags, and a straight line is what makes a washing line read as a wire diagram. */
function lineY(u, top, sag) {
  return top - sag * 4 * u * (1 - u);
}

/** One pole: post, cross arm, a diagonal brace on each side and a splayed foot. */
function pole(group, { x, height, random }) {
  const wood = materialFor(PALETTE.pole, { roughness: 0.84 });
  const lean = (random() - 0.5) * 0.04;
  group.add(part(bevelledBox({ width: 0.085, height, depth: 0.085, bevel: 0.014 }), wood,
                 [x, height / 2, 0], [0, 0, lean]));
  group.add(part(bevelledBox({ width: 0.06, height: 0.055, depth: 0.7, bevel: 0.012 }),
                 materialFor(PALETTE.pole, { roughness: 0.66 }), [x, height - 0.05, 0]));
  for (const sz of [1, -1]) {
    const brace = bevelledBox({ width: 0.42, height: 0.05, depth: 0.05, bevel: 0.012 });
    brace.rotateX(sz * Math.PI / 4);
    group.add(part(brace, wood, [x, height - 0.22, sz * 0.18]));
  }
  group.add(part(bevelledBox({ width: 0.24, height: 0.055, depth: 0.24, bevel: 0.016 }), wood,
                 [x, 0.028, 0]));
}

/** The rope, as chords of the sag curve. Instanced, so the whole line costs one draw call. */
function rope(group, { span, top, sag }) {
  const geometry = bevelledBox({ width: 1, height: 0.017, depth: 0.017, bevel: 0.004 });
  const placements = [];
  for (let s = 0; s < SEGMENTS; s++) {
    const u0 = s / SEGMENTS, u1 = (s + 1) / SEGMENTS;
    const ax = -span / 2 + span * u0, bx = -span / 2 + span * u1;
    const ay = lineY(u0, top, sag), by = lineY(u1, top, sag);
    placements.push({ position: [(ax + bx) / 2, (ay + by) / 2, 0],
                      rotation: [0, 0, Math.atan2(by - ay, bx - ax)],
                      scale: [Math.hypot(bx - ax, by - ay), 1, 1], hue: 0 });
  }
  group.add(scatterInstances(geometry, materialFor(PALETTE.rope, { roughness: 0.96 }), placements));
}

export function create({ span = 4.2, height = 1.98, sheets = 5, seed = 1, sag = 0.22 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const top = height - 0.02;
  for (const sx of [-1, 1]) pole(group, { x: sx * (span / 2), height, random });
  rope(group, { span, top, sag });

  // --- the washing: each sheet gets its own width, drop, yaw and lean off the line ----------
  const cloth = bevelledBox({ width: 1, height: 1, depth: 0.016, bevel: 0.006 });
  cloth.translate(0, -0.5, 0);
  const hemGeometry = bevelledBox({ width: 1, height: 0.05, depth: 0.024, bevel: 0.006 });
  const pegGeometry = bevelledBox({ width: 0.026, height: 0.075, depth: 0.03, bevel: 0.007 });
  const panels = [], hems = [], pegs = [];
  for (let i = 0; i < sheets; i++) {
    const u = (i + 0.75) / (sheets + 0.5);
    const x = -span / 2 + span * u;
    const y = lineY(u, top, sag) - 0.02;
    const width = 0.42 + random() * 0.34;
    const drop = 0.6 + random() * 0.42;
    const yaw = (random() - 0.5) * 0.5;
    const lean = (random() - 0.5) * 0.16;
    // Wide hue jitter, not a whisper of it: five near-white panels read as a fence, and the
    // whole point of washing is that somebody's shirt is a different colour from the sheets.
    const hue = (random() - 0.5) * 0.28;
    panels.push({ position: [x, y, 0], rotation: [0, yaw, lean], scale: [width, drop, 1], hue });
    hems.push({ position: [x + Math.sin(lean) * drop, y - drop * Math.cos(lean), 0],
                rotation: [0, yaw, lean], scale: [width, 1, 1], hue });
    for (const side of [-0.36, 0.36]) {
      pegs.push({ position: [x + side * width * Math.cos(yaw), y + 0.03,
                             -side * width * Math.sin(yaw)],
                  rotation: [0, yaw, 0], hue: (random() - 0.5) * 0.08 });
    }
  }
  group.add(scatterInstances(cloth, materialFor(PALETTE.cloth, { roughness: 0.95 }), panels));
  group.add(scatterInstances(hemGeometry, materialFor(PALETTE.hem, { roughness: 0.88 }), hems));
  group.add(scatterInstances(pegGeometry, materialFor(PALETTE.peg, { roughness: 0.6 }), pegs));

  const sockets = [socket('left', [-span / 2, 0, 0], [0, 1, 0]),
                   socket('right', [span / 2, 0, 0], [0, 1, 0]),
                   socket('line', [0, lineY(0.5, top, sag), 0], [0, 1, 0])];
  const colliders = [collider('run', [0, height / 2, 0], [span + 0.3, height, 0.72])];
  return { group, sockets, colliders };
}
