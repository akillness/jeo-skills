// signboard.js - a hanging tavern sign: bevelled board, moulded border, scrolled iron bracket.
// Detail ladder: post + cantilevered arm + swinging board silhouette, stepped base
//                / scroll brace of seven links, raised border moulding, two hanging eye rings
//                / bolt domes on the arm, a carved emblem boss, 1.5 cm bevels, hue jitter.
// Sockets: base (ground), bracket (arm end), swing-a and swing-b (the two hanging eyes).
import { THREE, bevelledBox, collider, materialFor, part, scatterInstances,
         seeded, socket } from '../kit-core.js';

const PALETTE = { post: '#6b533a', iron: '#4c4e56', board: '#8d5f3a', border: '#c2a15f',
                  face: '#efe3c8', stone: '#928b7e' };

/** Stepped stone plinth and the collar that ties it to the post. */
function foot(group, { width }) {
  group.add(part(bevelledBox({ width: width + 0.24, height: 0.09, depth: width + 0.24,
                               bevel: 0.02 }), materialFor(PALETTE.stone, { roughness: 0.93 }),
                 [0, 0.045, 0]));
  group.add(part(bevelledBox({ width: width + 0.11, height: 0.13, depth: width + 0.11,
                               bevel: 0.026 }), materialFor(PALETTE.stone, { roughness: 0.86 }),
                 [0, 0.155, 0]));
  group.add(part(bevelledBox({ width: width + 0.05, height: 0.05, depth: width + 0.05,
                               bevel: 0.014 }), materialFor(PALETTE.post, { roughness: 0.62 }),
                 [0, 0.245, 0]));
}

/** The arm and its scrolled brace: seven short links stepped around a quarter circle, which
 *  reads as smithed ironwork where a single diagonal bar reads as a strut. */
function bracket(group, bolts, { height, reach, iron }) {
  const y = height - 0.1;
  group.add(part(bevelledBox({ width: reach, height: 0.055, depth: 0.05, bevel: 0.013 }),
                 iron, [reach / 2 - 0.02, y, 0]));
  const link = bevelledBox({ width: 0.13, height: 0.028, depth: 0.028, bevel: 0.007 });
  const scroll = [];
  const r = 0.34;
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * (Math.PI / 2);
    scroll.push({ position: [0.04 + r * Math.sin(a), y - 0.05 - r * (1 - Math.cos(a)), 0],
                  rotation: [0, 0, -a + Math.PI / 2], hue: 0 });
  }
  group.add(scatterInstances(link, iron, scroll));
  for (const x of [0.035, reach - 0.06]) bolts.push({ position: [x, y, 0.028], hue: 0 });
  return y;
}

/** Two eye rings and the four-link chains the board hangs on. A chain, not a bar: it is what
 *  makes the board read as free to swing, and it drops the board far enough below the arm that
 *  a close frame holds both. Returns the two hanging points. */
function hangers(group, { armY, reach, iron, boardWidth }) {
  const points = [];
  const link = new THREE.TorusGeometry(0.03, 0.008, 4, 12);
  const turned = link.clone();
  turned.rotateY(Math.PI / 2);
  for (const sx of [-1, 1]) {
    const x = reach * 0.5 + sx * boardWidth * 0.34;
    group.add(part(new THREE.TorusGeometry(0.036, 0.01, 4, 14), iron, [x, armY - 0.06, 0]));
    for (let i = 0; i < 4; i++) {
      group.add(part(i % 2 ? turned : link, iron, [x, armY - 0.13 - i * 0.048, 0]));
    }
    points.push([x, armY - 0.35, 0]);
  }
  return points;
}

/** The board itself: a bevelled core, a raised border on both faces and a carved boss. */
function board(group, { centre, width, height, random }) {
  const core = materialFor(PALETTE.board, { roughness: 0.72 });
  const faceMaterial = materialFor(PALETTE.face, { roughness: 0.88 });
  group.add(part(bevelledBox({ width, height, depth: 0.055, bevel: 0.015 }), core, centre));
  const border = materialFor(PALETTE.border, { roughness: 0.38, metalness: 0.16 });
  for (const sz of [1, -1]) {
    const z = centre[2] + sz * 0.036;
    group.add(part(bevelledBox({ width: width - 0.1, height: height - 0.1, depth: 0.012,
                                 bevel: 0.005 }), faceMaterial, [centre[0], centre[1], z]));
    const bars = [[width, 0.045, 0, (height - 0.045) / 2], [width, 0.045, 0, -(height - 0.045) / 2],
                  [0.045, height, (width - 0.045) / 2, 0], [0.045, height, -(width - 0.045) / 2, 0]];
    for (const [w, h, dx, dy] of bars) {
      group.add(part(bevelledBox({ width: w, height: h, depth: 0.022, bevel: 0.006 }), border,
                     [centre[0] + dx, centre[1] + dy, z]));
    }
    const boss = new THREE.CylinderGeometry(height * 0.2, height * 0.23, 0.022, 10);
    boss.rotateX(Math.PI / 2);
    group.add(part(boss, border, [centre[0] + (random() - 0.5) * 0.01, centre[1], z + 0.012]));
  }
}

export function create({ height = 2.62, reach = 0.86, boardWidth = 0.78, boardHeight = 0.52,
                         seed = 1, postWidth = 0.11 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const iron = materialFor(PALETTE.iron, { roughness: 0.48, metalness: 0.1 });
  const bolts = [];
  foot(group, { width: postWidth });
  group.add(part(bevelledBox({ width: postWidth, height: height - 0.27, depth: postWidth,
                               bevel: 0.017 }), materialFor(PALETTE.post, { roughness: 0.8 }),
                 [0, 0.27 + (height - 0.27) / 2, 0]));
  group.add(part(bevelledBox({ width: postWidth + 0.05, height: 0.055, depth: postWidth + 0.05,
                               bevel: 0.013 }), materialFor(PALETTE.post, { roughness: 0.58 }),
                 [0, height - 0.02, 0]));
  // A mid-post iron band: the one fine-band feature that lands in the middle of a close frame
  // rather than at the cropped top or bottom of a tall prop.
  const band = materialFor('#7d7a72', { roughness: 0.3, metalness: 0.12 });
  const bandY = height * 0.46;
  group.add(part(bevelledBox({ width: postWidth + 0.045, height: 0.06, depth: postWidth + 0.045,
                               bevel: 0.013 }), band, [0, bandY, 0]));
  for (const [dx, dz] of [[(postWidth + 0.045) / 2, 0], [0, (postWidth + 0.045) / 2]]) {
    bolts.push({ position: [dx, bandY, dz], hue: 0 });
    bolts.push({ position: [-dx, bandY, -dz], hue: 0 });
  }
  const armY = bracket(group, bolts, { height, reach, iron });
  const points = hangers(group, { armY, reach, iron, boardWidth });
  const centre = [reach * 0.5, points[0][1] - boardHeight / 2, 0];
  board(group, { centre, width: boardWidth, height: boardHeight, random });
  group.add(scatterInstances(new THREE.SphereGeometry(0.018, 8, 5),
                             materialFor('#a9a49a', { roughness: 0.24, metalness: 0.14 }), bolts));

  const sockets = [socket('base', [0, 0, 0], [0, 1, 0]),
                   socket('bracket', [reach - 0.02, armY, 0], [0, -1, 0]),
                   socket('swing-a', points[0], [0, -1, 0]),
                   socket('swing-b', points[1], [0, -1, 0])];
  const colliders = [collider('post', [0, height / 2, 0], [postWidth + 0.24, height,
                                                           postWidth + 0.24]),
                     collider('board', centre, [boardWidth, boardHeight, 0.12])];
  return { group, sockets, colliders };
}
