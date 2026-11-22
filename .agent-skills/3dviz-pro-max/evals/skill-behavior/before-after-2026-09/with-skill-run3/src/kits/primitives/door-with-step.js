// door-with-step.js - a plank door recessed in its opening, with iron straps, a ring handle,
// a stone threshold and a step that breaks the wall plane at the bottom of the silhouette.
// Detail ladder: step and hood breaking the wall line / recessed leaf, plank gaps, strap hinges
//                / clenched nail heads, ring handle, worn nosing on the step.
// Local frame: origin at the doorway centre ON THE GROUND, the leaf rises +Y, face looks +Z.
// Sockets: handle (the ring), step (front edge of the stone step, where a figure stands).
import { THREE, bevelledBox, collider, materialFor, part, scatterInstances, seeded,
         socket } from '../kit-core.js';
import { darken, lighten } from './bevelled-box.js';

/** Vertical boards with real gaps between them: a flat panel never reads as a door. */
function leaf(group, { width, height, planks, z, colour, random }) {
  const gap = 0.016;
  const board = (width - gap * (planks - 1)) / planks;
  const nails = [];
  for (let i = 0; i < planks; i++) {
    const x = -width / 2 + board / 2 + i * (board + gap);
    const shade = darken(colour, 0.06 + random() * 0.12);
    group.add(part(bevelledBox({ width: board, height, depth: 0.055, bevel: 0.01 }),
                   materialFor(shade, { roughness: 0.66 + random() * 0.08 }),
                   [x, height / 2, z]));
    for (const y of [height * 0.22, height * 0.78]) nails.push([x, y, z + 0.045]);
  }
  return nails;
}

export function create({ width = 0.95, height = 1.95, planks = 4, inset = 0.1, hood = true,
                         doorColor = '#5d4630', ironColor = '#2b2b30', stoneColor = '#b3aa9c',
                         step = true, seed = 1 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const iron = materialFor(ironColor, { roughness: 0.42, metalness: 0.65 });
  const leafZ = -inset - 0.03;

  const reveal = materialFor(darken(stoneColor, 0.55), { roughness: 0.95 });
  const jambs = [[width + 0.04, 0.02, 0, height], [0.02, height, (width + 0.02) / 2, height / 2],
                 [0.02, height, -(width + 0.02) / 2, height / 2]];
  for (const [w, h, x, y] of jambs) {
    group.add(part(bevelledBox({ width: w, height: h, depth: inset, bevel: 0.004 }), reveal,
                   [x, y, -inset / 2]));
  }
  const nails = leaf(group, { width, height, planks, z: leafZ, colour: doorColor, random });

  // Two strap hinges across the whole leaf, standing 2 cm proud of the boards.
  for (const y of [height * 0.22, height * 0.78]) {
    group.add(part(bevelledBox({ width: width * 0.86, height: 0.075, depth: 0.03, bevel: 0.008 }),
                   iron, [-width * 0.04, y, leafZ + 0.045]));
  }
  const ring = new THREE.TorusGeometry(0.062, 0.014, 6, 14);
  const handle = part(ring, iron, [width * 0.3, height * 0.5, leafZ + 0.05]);
  group.add(handle);
  group.add(part(new THREE.CylinderGeometry(0.026, 0.03, 0.05, 8), iron,
                 [width * 0.3, height * 0.58, leafZ + 0.045], [Math.PI / 2, 0, 0]));

  // Clenched nail heads: the smallest authored feature, 2.4 cm across.
  const head = new THREE.CylinderGeometry(0.012, 0.015, 0.012, 6);
  head.rotateX(Math.PI / 2);
  group.add(scatterInstances(head, materialFor(lighten(ironColor, 0.35),
                                               { roughness: 0.4, metalness: 0.6 }),
                             nails.map(position => ({ position, hue: 0 }))));

  const stone = materialFor(stoneColor, { roughness: 0.88 });
  if (step) {
    group.add(part(bevelledBox({ width: width + 0.42, height: 0.13, depth: 0.5, bevel: 0.03 }),
                   stone, [0, 0.065, 0.19]));
    // Worn nosing: the front arris of a stone step is always lighter than its face.
    group.add(part(bevelledBox({ width: width + 0.3, height: 0.03, depth: 0.03, bevel: 0.009 }),
                   materialFor(lighten(stoneColor, 0.28), { roughness: 0.6 }),
                   [0, 0.115, 0.435]));
    group.add(part(bevelledBox({ width: width + 0.12, height: 0.06, depth: 0.16, bevel: 0.02 }),
                   stone, [0, 0.16, -0.02]));
  }
  if (hood) {
    const beam = materialFor(darken(doorColor, 0.15), { roughness: 0.75 });
    group.add(part(bevelledBox({ width: width + 0.5, height: 0.1, depth: 0.34, bevel: 0.025 }),
                   beam, [0, height + 0.18, 0.12]));
    for (const side of [1, -1]) {
      group.add(part(bevelledBox({ width: 0.1, height: 0.56, depth: 0.22, bevel: 0.02 }), beam,
                     [side * (width / 2 + 0.14), height - 0.05, 0.08],
                     [0, 0, side * 0.42]));
    }
  }

  const sockets = [socket('handle', [width * 0.3, height * 0.5, leafZ + 0.06], [0, 0, 1]),
                   socket('step', [0, 0.13, 0.4], [0, 1, 0])];
  const colliders = [collider('leaf', [0, height / 2, leafZ], [width, height, 0.06])];
  return { group, sockets, colliders };
}
