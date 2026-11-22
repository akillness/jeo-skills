// watermill.js - a stone-and-timber mill with a working overshot wheel, a launder feeding it
// and a first-floor loading door under a hoist beam. animate(dt) turns the wheel, nothing else.
// Detail ladder: wheel and launder breaking the +X gable, hoist beam, string course and ridge
//                / rims, spokes and paddles, frame timbers, recessed openings, loading door
//                / iron rim straps and hub bolts, peg heads, sill drip grooves, slipped tile.
// The ridge runs along X; the wheel hangs off the +X gable end and turns about the X axis.
import { THREE, bevelledBox, collider, materialFor, part, seeded, socket, wallWithOpenings }
  from '../kit-core.js';
import { darken, lighten } from '../primitives/bevelled-box.js';
import { create as insetWindow } from '../primitives/inset-window.js';
import { create as doorWithStep } from '../primitives/door-with-step.js';
import { create as timberFrame } from '../primitives/timber-frame.js';
import { create as roofSlope } from '../primitives/roof-tile-strip.js';

const WALL_T = 0.3, EAVE = 0.28, VERGE = 0.15, GROUND_H = 2.5, UPPER_H = 2.3;
const PALETTE = { stone: '#9a938a', plaster: '#ddd2bd', timber: '#54402c', roof: '#6f5145',
                  iron: '#33322f', pane: '#2c3a3e', water: '#9fc4c8' };

/** One pierced long wall plus its dressed openings. A door hole is dressed from the ground. */
function longWall(group, { width, base, height, faceZ, side, holes, material, seed }) {
  const wall = wallWithOpenings({ width, height, depth: WALL_T, openings: holes, material });
  wall.position.set(0, base, faceZ);
  group.add(wall);
  holes.forEach((hole, i) => {
    const dress = { width: hole.width, height: hole.height, stoneColor: PALETTE.stone, seed: seed + i };
    const built = hole.door
      ? doorWithStep({ ...dress, doorColor: PALETTE.timber, step: base < 0.1, hood: base < 0.1 })
      : insetWindow({ ...dress, bars: 1, rows: 2, frameColor: PALETTE.timber,
                      glassColor: PALETTE.pane });
    built.group.position.set(hole.x, base + (hole.door ? 0 : hole.y), faceZ + side * WALL_T / 2);
    built.group.rotation.y = side > 0 ? 0 : Math.PI;
    group.add(built.group);
  });
}

/** Both end walls of one storey, each with one small opening on the centre line. */
function endWalls(group, { width, depth, base, height, material, hole, seed }) {
  for (const side of [1, -1]) {
    const end = wallWithOpenings({ width: depth - 2 * WALL_T, height, depth: WALL_T, material,
                                   openings: [hole] });
    end.rotation.y = Math.PI / 2;
    end.position.set(side * (width / 2 - WALL_T / 2), base, 0);
    group.add(end);
    const unit = insetWindow({ width: hole.width, height: hole.height, bars: 1, rows: 1,
                               frameColor: PALETTE.timber, glassColor: PALETTE.pane,
                               stoneColor: PALETTE.stone, seed: seed + side });
    unit.group.position.set(side * (width / 2), base + hole.y, 0);
    unit.group.rotation.y = side * Math.PI / 2;
    group.add(unit.group);
  }
}

/** The wheel: rims with iron straps, spokes, a bolted hub and paddles. Built into its own
 *  group so animate(dt) turns exactly this and nothing else. */
function wheel(group, { radius, wheelWidth, paddles, x, y, seed }) {
  const hub = new THREE.Group();
  hub.position.set(x, y, 0);
  hub.rotation.z = Math.PI / 2;          // the wheel plane is YZ; it spins about world X
  const random = seeded(seed);
  const wood = materialFor(PALETTE.timber, { roughness: 0.76 });
  const iron = materialFor(PALETTE.iron, { roughness: 0.38, metalness: 0.7 });
  const bolt = new THREE.CylinderGeometry(0.036, 0.042, 0.05, 6);
  const spokeGeom = bevelledBox({ width: 0.11, height: radius - 0.1, depth: 0.08, bevel: 0.018 });
  for (const side of [1, -1]) {
    hub.add(part(new THREE.TorusGeometry(radius, 0.075, 5, 20), wood,
                 [0, side * wheelWidth / 2, 0], [Math.PI / 2, 0, 0]));
    hub.add(part(new THREE.TorusGeometry(radius - 0.11, 0.032, 4, 20), iron,
                 [0, side * wheelWidth / 2, 0], [Math.PI / 2, 0, 0]));
  }
  hub.add(part(new THREE.CylinderGeometry(0.19, 0.19, wheelWidth + 0.7, 10), wood, [0, 0, 0]));
  hub.add(part(new THREE.CylinderGeometry(0.075, 0.075, wheelWidth + 1.3, 8), iron, [0, 0, 0]));
  const spokes = Math.max(6, Math.round(paddles / 2));
  const bright = materialFor(lighten(PALETTE.iron, 0.4), { roughness: 0.3, metalness: 0.8 });
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2, sin = Math.sin(a), cos = Math.cos(a);
    for (const side of [1, -1]) {
      hub.add(part(spokeGeom, wood, [sin * radius / 2, side * wheelWidth / 2, cos * radius / 2],
                   [Math.PI / 2, 0, -a]));
    }
    hub.add(part(bolt, bright, [sin * 0.17, wheelWidth / 2 + 0.06, cos * 0.17]));
  }
  // Local X is tangential here, Y radial, Z along the axle: a paddle is thin, deep and wide.
  const blade = bevelledBox({ width: 0.05, height: 0.42, depth: wheelWidth - 0.06, bevel: 0.012 });
  for (let i = 0; i < paddles; i++) {
    const a = (i / paddles) * Math.PI * 2;
    const wet = materialFor(darken(PALETTE.timber, 0.2 + random() * 0.15), { roughness: 0.88 });
    hub.add(part(blade, wet, [Math.sin(a) * (radius - 0.21), 0, Math.cos(a) * (radius - 0.21)],
                 [Math.PI / 2, 0, -a]));
  }
  group.add(hub);
  return hub;
}

/** The launder carrying water over the wheel: trough, side boards, trestles, spilling lip. */
function launder(group, { x, y, length, seed }) {
  const wood = materialFor(darken(PALETTE.timber, 0.1), { roughness: 0.82 });
  const random = seeded(seed), mid = x + length / 2 - 0.4;
  for (const side of [1, -1]) {
    group.add(part(bevelledBox({ width: length, height: 0.14, depth: 0.06, bevel: 0.02 }), wood,
                   [mid, y + 0.07, side * 0.28]));
    for (const t of [0.5, 0.92]) {
      group.add(part(bevelledBox({ width: 0.13, height: y - 0.1, depth: 0.13, bevel: 0.026 }), wood,
                     [x + length * t + side * 0.12, (y - 0.1) / 2, side * 0.3],
                     [0, 0, side * (0.03 + random() * 0.02)]));
    }
    group.add(part(bevelledBox({ width: length * 0.48, height: 0.1, depth: 0.1, bevel: 0.022 }),
                   wood, [x + length * 0.71 + side * 0.12, y * 0.45, side * 0.3]));
  }
  group.add(part(bevelledBox({ width: length, height: 0.06, depth: 0.62, bevel: 0.018 }), wood,
                 [mid, y, 0]));
  group.add(part(bevelledBox({ width: 0.34, height: 0.16, depth: 0.5, bevel: 0.02 }),
                 materialFor(PALETTE.water, { roughness: 0.16, metalness: 0.1 }),
                 [x + 0.3, y - 0.06, 0], [0, 0, 0.5]));
}

export function create({ width = 6, depth = 4.5, wheelRadius = 1.6, paddles = 14,
                         roofPitchDeg = 42, speedRadPerSec = 0.55, seed = 1 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const halfDepth = depth / 2, pitch = (roofPitchDeg * Math.PI) / 180;
  const wallH = GROUND_H + UPPER_H, ridgeY = wallH + halfDepth * Math.tan(pitch);
  const stone = materialFor(PALETTE.stone, { roughness: 0.94 });
  const plaster = materialFor(PALETTE.plaster, { roughness: 0.9 });
  const faceZ = side => side * (halfDepth - WALL_T / 2);
  longWall(group, { width, base: 0, height: GROUND_H, faceZ: faceZ(1), side: 1, material: stone,
                    seed: seed + 1,
                    holes: [{ x: -width * 0.26, y: 1.05, width: 1, height: 2.1, door: true },
                            { x: width * 0.24, y: 1.35, width: 0.85, height: 0.95 }] });
  longWall(group, { width, base: 0, height: GROUND_H, faceZ: faceZ(-1), side: -1, material: stone,
                    seed: seed + 9, holes: [{ x: 0, y: 1.35, width: 0.85, height: 0.95 }] });
  endWalls(group, { width, depth, base: 0, height: GROUND_H, material: stone, seed: seed + 3,
                    hole: { x: 0, y: 1.3, width: 0.6, height: 0.8 } });
  // String course: the stone plinth stops and the timber storey starts on a projecting band.
  group.add(part(bevelledBox({ width: width + 0.16, height: 0.14, depth: depth + 0.16, bevel: 0.03 }),
                 materialFor(darken(PALETTE.stone, 0.18), { roughness: 0.9 }), [0, GROUND_H + 0.05, 0]));
  for (const side of [1, -1]) {
    longWall(group, { width, base: GROUND_H + 0.12, height: UPPER_H, faceZ: faceZ(side), side,
                      material: plaster, seed: seed + 20 + side,
                      holes: side > 0
                        ? [{ x: -width * 0.28, y: 1.15, width: 0.95, height: 2.0, door: true },
                           { x: width * 0.25, y: 1.3, width: 0.9, height: 1.0 }]
                        : [{ x: -width * 0.22, y: 1.3, width: 0.9, height: 1.0 },
                           { x: width * 0.22, y: 1.3, width: 0.9, height: 1.0 }] });
    const frame = timberFrame({ width, height: UPPER_H, posts: 4, braceRun: 0.8,
                                color: PALETTE.timber, seed: seed + 40 + side });
    frame.group.position.set(0, GROUND_H + 0.12, faceZ(side) + side * WALL_T / 2);
    frame.group.rotation.y = side > 0 ? 0 : Math.PI;
    group.add(frame.group);
  }
  endWalls(group, { width, depth, base: GROUND_H + 0.12, height: UPPER_H, material: plaster,
                    seed: seed + 5, hole: { x: 0, y: 1.2, width: 0.7, height: 0.9 } });
  for (const side of [1, -1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-halfDepth, 0); shape.lineTo(halfDepth, 0); shape.lineTo(0, ridgeY - wallH);
    shape.closePath();
    const gable = new THREE.ExtrudeGeometry(shape, { depth: WALL_T, bevelEnabled: false,
                                                     curveSegments: 1, steps: 1 });
    gable.rotateY(Math.PI / 2);
    gable.translate(side * width / 2 - WALL_T / 2, wallH, 0);
    group.add(part(gable, plaster));
    const slope = roofSlope({ width, run: halfDepth + EAVE, pitchRad: pitch, side,
                              color: PALETTE.roof, verge: VERGE, seed: seed + 60 + side });
    slope.group.position.y = ridgeY;
    group.add(slope.group);
  }
  group.add(part(bevelledBox({ width: width + 2 * VERGE, height: 0.13, depth: 0.28, bevel: 0.03 }),
                 materialFor(darken(PALETTE.roof, 0.2), { roughness: 0.86 }), [0, ridgeY + 0.035, 0]));
  // Hoist beam projecting from the +X gable: the mill's working silhouette above the wheel.
  group.add(part(bevelledBox({ width: 1.5, height: 0.16, depth: 0.16, bevel: 0.03 }),
                 materialFor(PALETTE.timber, { roughness: 0.74 }),
                 [width / 2 + 0.55, ridgeY - 0.55, 0]));
  const axleX = width / 2 + 0.95, axleY = wheelRadius + 0.32;
  const hub = wheel(group, { radius: wheelRadius, wheelWidth: 0.9, paddles, x: axleX, y: axleY,
                             seed: seed + 77 });
  launder(group, { x: axleX - 0.3, y: axleY + wheelRadius + 0.22, length: 2.6, seed: seed + 8 });
  const pier = bevelledBox({ width: 0.7, height: axleY + 0.3, depth: 0.28, bevel: 0.03 });
  for (const side of [1, -1]) {
    group.add(part(pier, materialFor(PALETTE.stone, { roughness: 0.93 }),
                   [width / 2 + 0.25, (axleY + 0.3) / 2, side * 0.95]));
  }
  const sockets = [socket('wheel', [axleX, axleY, 0], [1, 0, 0]),
                   socket('door', [-width * 0.26, 0, halfDepth], [0, 0, 1]),
                   socket('loading-door', [-width * 0.28, GROUND_H + 0.12, halfDepth], [0, 0, 1]),
                   socket('launder', [axleX + 2.2, axleY + wheelRadius + 0.25, 0], [1, 0, 0]),
                   socket('ridge', [0, ridgeY, 0], [0, 1, 0]),
                   socket('sign', [width * 0.24, GROUND_H - 0.35, halfDepth + 0.02], [0, 0, 1])];
  const colliders = [collider('walls', [0, wallH / 2, 0], [width, wallH, depth]),
                     collider('roof', [0, (wallH + ridgeY) / 2, 0],
                              [width + 2 * VERGE, ridgeY - wallH, depth + 2 * EAVE]),
                     collider('wheel', [axleX, axleY, 0], [1.3, wheelRadius * 2, wheelRadius * 2])];
  const spin = speedRadPerSec * (0.9 + random() * 0.2);
  return {
    group, sockets, colliders,
    animate(dt) {
      if (!(dt > 0)) return false;
      hub.rotation.y -= spin * dt;      // the hub is rolled onto X, so its local Y is the axle
      return true;
    }
  };
}
