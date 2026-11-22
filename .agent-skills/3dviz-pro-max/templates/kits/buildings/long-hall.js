// long-hall.js - a five-bay timber long hall: two doors, a covered porch and two chimneys.
// Detail ladder: long ridge with two chimneys and the porch breaking the eave line
//                / bay rhythm of frame posts, recessed windows and doors, lapped roof courses
//                / peg heads, sill drip grooves, worn step nosings, hanging sign with eye hooks.
// The ridge runs along X, the long walls face +/-Z, y = 0 is the ground plane.
import { THREE, bevelledBox, collider, materialFor, part, seeded, socket,
         wallWithOpenings } from '../kit-core.js';
import { create as insetWindow } from '../primitives/inset-window.js';
import { create as doorWithStep } from '../primitives/door-with-step.js';
import { create as timberFrame } from '../primitives/timber-frame.js';
import { create as roofSlope } from '../primitives/roof-tile-strip.js';
import { create as chimney } from '../primitives/chimney.js';
import { create as sign } from '../primitives/sign.js';

const WALL_T = 0.24, EAVE = 0.3, VERGE = 0.16;
const WIN = { width: 1.0, height: 1.15, y: 1.9 }, DOOR = { width: 1.05, height: 2.1 };
const PALETTE = { plaster: '#e2d8c4', timber: '#6a5036', roof: '#7d5348', brick: '#96654f',
                  stone: '#b0a698', pane: '#2b353b', door: '#7d6141' };

/** Bay centre lines across the usable wall width, so openings never hang off a corner. */
function bays(width, count) {
  const usable = width - 2 * WALL_T - 0.5;
  return Array.from({ length: count }, (_, i) => (-0.5 + (i + 0.5) / count) * usable);
}

/** One long wall: the pierced plaster, its dressed openings and its exposed frame. */
function longWall(group, { width, wallH, faceZ, sign: side, xs, doorAt, seed }) {
  const holes = xs.map((x, i) => (doorAt.includes(i)
    ? { x, y: DOOR.height / 2, width: DOOR.width, height: DOOR.height, door: true }
    : { x, y: WIN.y, width: WIN.width, height: WIN.height, door: false }));
  const wall = wallWithOpenings({ width, height: wallH, depth: WALL_T, openings: holes,
                                  material: materialFor(PALETTE.plaster, { roughness: 0.92 }) });
  wall.position.z = faceZ;
  group.add(wall);
  const face = faceZ + side * (WALL_T / 2);
  holes.forEach((hole, i) => {
    const built = hole.door
      ? doorWithStep({ width: DOOR.width, height: DOOR.height, doorColor: PALETTE.door,
                       stoneColor: PALETTE.stone, seed: seed + i })
      : insetWindow({ width: WIN.width, height: WIN.height, bars: 1, rows: 2,
                      frameColor: PALETTE.timber, glassColor: PALETTE.pane,
                      stoneColor: PALETTE.stone, seed: seed + i });
    built.group.position.set(hole.x, hole.door ? 0 : hole.y, face);
    built.group.rotation.y = side > 0 ? 0 : Math.PI;
    group.add(built.group);
  });
  const frame = timberFrame({ width, height: wallH, posts: xs.length + 1, midRail: true,
                              braceRun: 0.85, color: PALETTE.timber,
                              seed: seed + (side > 0 ? 11 : 23) });
  frame.group.position.z = face;
  frame.group.rotation.y = side > 0 ? 0 : Math.PI;
  group.add(frame.group);
}

/** The gable triangle that closes an end wall above the eave line. */
function gable(group, { halfDepth, wallH, ridgeY, x, material }) {
  const shape = new THREE.Shape();
  shape.moveTo(-halfDepth, 0); shape.lineTo(halfDepth, 0); shape.lineTo(0, ridgeY - wallH);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: WALL_T, bevelEnabled: false,
                                                      curveSegments: 1, steps: 1 });
  geometry.rotateY(Math.PI / 2);
  geometry.translate(x - WALL_T / 2, wallH, 0);
  group.add(part(geometry, material));
}

/** A monopitch porch standing clear of the front wall: posts, beam, braces and a tiled slope. */
function porch(group, { x, halfDepth, seed }) {
  const top = 2.75, run = 1.4, pitch = 0.38;
  const wood = materialFor(PALETTE.timber, { roughness: 0.7 });
  const eaveY = top - run * Math.tan(pitch);
  const postH = eaveY - 0.14;
  for (const side of [1, -1]) {
    const px = x + side * 1.15;
    group.add(part(bevelledBox({ width: 0.15, height: postH, depth: 0.15, bevel: 0.028 }), wood,
                   [px, postH / 2, halfDepth + run - 0.14]));
    group.add(part(bevelledBox({ width: 0.09, height: 0.5, depth: 0.09, bevel: 0.02 }), wood,
                   [px - side * 0.16, postH - 0.18, halfDepth + run - 0.3],
                   [0, 0, side * Math.PI / 4]));
    group.add(part(bevelledBox({ width: 0.3, height: 0.1, depth: 0.34, bevel: 0.02 }),
                   materialFor(PALETTE.stone, { roughness: 0.88 }),
                   [px, 0.05, halfDepth + run - 0.14]));
  }
  group.add(part(bevelledBox({ width: 2.6, height: 0.17, depth: 0.16, bevel: 0.03 }), wood,
                 [x, eaveY - 0.07, halfDepth + run - 0.14]));
  const slope = roofSlope({ width: 2.6, run, pitchRad: pitch, color: PALETTE.roof, verge: 0.12,
                            rows: 5, seed: seed + 5 });
  slope.group.position.set(x, top, halfDepth - 0.06);
  group.add(slope.group);
  return { eaveY, run };
}

export function create({ width = 12, depth = 5.5, wallHeight = 3, bayCount = 5,
                         roofPitchDeg = 38, seed = 1 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const halfDepth = depth / 2, pitch = (roofPitchDeg * Math.PI) / 180;
  const plaster = materialFor(PALETTE.plaster, { roughness: 0.92 });
  const xs = bays(width, bayCount);
  const doorAt = [1, Math.max(2, bayCount - 2)];
  const ridgeY = wallHeight + halfDepth * Math.tan(pitch);

  for (const side of [1, -1]) {
    longWall(group, { width, wallH: wallHeight, faceZ: side * (halfDepth - WALL_T / 2), sign: side,
                      xs, doorAt: side > 0 ? doorAt : [], seed: seed + (side > 0 ? 0 : 40) });
  }
  for (const side of [1, -1]) {
    const end = wallWithOpenings({ width: depth - 2 * WALL_T, height: wallHeight, depth: WALL_T,
                                   material: plaster,
                                   openings: [{ x: 0, y: 1.9, width: 0.85, height: 1.0 }] });
    end.rotation.y = Math.PI / 2;
    end.position.x = side * (width / 2 - WALL_T / 2);
    group.add(end);
    const unit = insetWindow({ width: 0.85, height: 1.0, bars: 1, rows: 1, frameColor:
                               PALETTE.timber, glassColor: PALETTE.pane, stoneColor: PALETTE.stone,
                               seed: seed + 70 + side });
    unit.group.position.set(side * (width / 2), 1.9, 0);
    unit.group.rotation.y = side * Math.PI / 2;
    group.add(unit.group);
    gable(group, { halfDepth, wallH: wallHeight, ridgeY, material: plaster,
                   x: side * width / 2 });
  }

  for (const side of [1, -1]) {
    const slope = roofSlope({ width, run: halfDepth + EAVE, pitchRad: pitch, side,
                              color: PALETTE.roof, verge: VERGE, seed: seed + 3 * side + 9 });
    slope.group.position.y = ridgeY;
    group.add(slope.group);
  }
  group.add(part(bevelledBox({ width: width + 2 * VERGE, height: 0.14, depth: 0.3, bevel: 0.035 }),
                 materialFor(PALETTE.brick, { roughness: 0.86 }), [0, ridgeY + 0.04, 0]));

  const stacks = [];
  for (const side of [1, -1]) {
    const x = side * width * (0.27 + random() * 0.04), base = wallHeight - 0.5;
    const stack = chimney({ width: 0.7, depth: 0.6, height: ridgeY + 0.95 - base,
                            brickColor: PALETTE.brick, stoneColor: PALETTE.stone,
                            seed: seed + 17 + side });
    stack.group.position.set(x, base, 0);
    group.add(stack.group);
    stacks.push([x, base + stack.top, 0]);
  }

  const doorX = xs[doorAt[0]];
  porch(group, { x: doorX, halfDepth, seed });
  const board = sign({ boardWidth: 0.95, boardHeight: 0.6, arm: 0.75, boardColor: PALETTE.timber,
                       seed: seed + 31 });
  board.group.position.set(xs[doorAt[1]] + 1.1, wallHeight - 0.45, halfDepth);
  group.add(board.group);

  const sockets = [socket('door', [xs[doorAt[1]], 0, halfDepth], [0, 0, 1]),
                   socket('porch-door', [doorX, 0, halfDepth], [0, 0, 1]),
                   socket('chimney-west', stacks[1], [0, 1, 0]),
                   socket('chimney-east', stacks[0], [0, 1, 0]),
                   socket('sign', [xs[doorAt[1]] + 1.1, wallHeight - 0.45, halfDepth], [0, 0, 1]),
                   socket('lean-to', [-width / 2, 0, 0], [-1, 0, 0])];
  const colliders = [collider('walls', [0, wallHeight / 2, 0], [width, wallHeight, depth]),
                     collider('roof', [0, (wallHeight + ridgeY) / 2, 0],
                              [width + 2 * VERGE, ridgeY - wallHeight, depth + 2 * EAVE]),
                     collider('porch', [doorX, 1.3, halfDepth + 0.7], [2.6, 2.6, 1.4])];
  return { group, sockets, colliders };
}
