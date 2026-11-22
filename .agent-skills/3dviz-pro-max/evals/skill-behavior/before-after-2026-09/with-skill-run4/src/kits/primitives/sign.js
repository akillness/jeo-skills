// sign.js - a hanging trade sign: wrought bracket, eye hooks, a framed board and a painted field.
// Detail ladder: the board hanging clear of the wall, breaking the facade line / bracket arm with
//                its diagonal stay, board frame and painted field / eye hooks, rivets, chipped paint.
// Local frame: the mount face is the XY plane at z = 0; the bracket reaches out along +Z.
// Sockets: mount (against the wall), hang (the hook the board swings from), face (the board front).
import { THREE, bevelledBox, materialFor, part, seeded, socket } from '../kit-core.js';
import { darken, lighten } from './bevelled-box.js';

export function create({ boardWidth = 0.8, boardHeight = 0.5, arm = 0.7, drop = 0.28,
                         bracket = true, boardColor = '#6b4f34', fieldColor = '#c8a45c',
                         ironColor = '#2b2b30', seed = 1 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const iron = materialFor(ironColor, { roughness: 0.4, metalness: 0.62 });
  const wood = materialFor(boardColor, { roughness: 0.7 });
  const hangZ = bracket ? arm : 0.06;

  if (bracket) {
    group.add(part(bevelledBox({ width: 0.05, height: 0.05, depth: arm + 0.1, bevel: 0.012 }),
                   iron, [0, 0, arm / 2]));
    // Diagonal stay: without it the arm reads as floating, and a bracket without a stay
    // is the single most common tell of an unconsidered sign.
    const stay = Math.hypot(arm * 0.7, 0.42);
    group.add(part(bevelledBox({ width: 0.035, height: stay, depth: 0.035, bevel: 0.009 }), iron,
                   [0, -0.21, arm * 0.35], [Math.atan2(arm * 0.7, 0.42), 0, 0]));
    for (const y of [0.12, -0.12]) {
      group.add(part(bevelledBox({ width: 0.11, height: 0.09, depth: 0.05, bevel: 0.012 }), iron,
                     [0, y, 0.02]));
    }
    // A curl at the arm end: three shrinking blocks reading as a wrought scroll.
    for (let i = 0; i < 3; i++) {
      group.add(part(bevelledBox({ width: 0.03, height: 0.06 - i * 0.012, depth: 0.03,
                                   bevel: 0.008 }), iron,
                     [0, 0.045 + i * 0.035, arm - 0.04 - i * 0.035]));
    }
  }

  // Two eye hooks and their links: the board hangs, it is not glued to the arm.
  const ring = new THREE.TorusGeometry(0.028, 0.008, 5, 10);
  for (const side of [1, -1]) {
    const x = side * boardWidth * 0.33;
    group.add(part(ring, iron, [x, -drop + 0.03, hangZ], [Math.PI / 2, 0, 0]));
    group.add(part(bevelledBox({ width: 0.016, height: drop - 0.04, depth: 0.016, bevel: 0.004 }),
                   iron, [x, -drop / 2 + 0.02, hangZ]));
  }

  const boardY = -drop - boardHeight / 2;
  group.add(part(bevelledBox({ width: boardWidth, height: boardHeight, depth: 0.05, bevel: 0.014 }),
                 wood, [0, boardY, hangZ]));
  // Painted field, recessed inside a proud frame: the frame is what survives at mid distance.
  const field = materialFor(fieldColor, { roughness: 0.55 });
  group.add(part(bevelledBox({ width: boardWidth - 0.11, height: boardHeight - 0.11, depth: 0.03,
                               bevel: 0.008 }), field, [0, boardY, hangZ + 0.026]));
  // A painted glyph: two crossed bars, dark, standing 8 mm off the field.
  const glyph = materialFor(darken(boardColor, 0.4), { roughness: 0.62 });
  for (const rotation of [0.5, -0.5]) {
    group.add(part(bevelledBox({ width: boardWidth * 0.42, height: 0.045, depth: 0.014,
                                 bevel: 0.004 }), glyph, [0, boardY, hangZ + 0.045],
                   [0, 0, rotation]));
  }
  // Chipped paint: one seeded bare patch at a board corner.
  group.add(part(bevelledBox({ width: 0.07, height: 0.05, depth: 0.012, bevel: 0.004 }),
                 materialFor(lighten(boardColor, 0.32), { roughness: 0.75 }),
                 [(random() - 0.5) * (boardWidth - 0.16),
                  boardY + (random() - 0.5) * (boardHeight - 0.14), hangZ + 0.044]));

  const sockets = [socket('mount', [0, 0, 0], [0, 0, -1]),
                   socket('hang', [0, -drop + 0.03, hangZ], [0, 1, 0]),
                   socket('face', [0, boardY, hangZ + 0.05], [0, 0, 1])];
  return { group, sockets, colliders: [] };
}
