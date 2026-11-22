// timber-cottage.js - a two-bay timber-framed cottage with a tiled gable roof.
// Detail ladder: gable + chimney silhouette / frame timbers + window insets / sill drips + pegs.
// The ridge runs along X, the long walls face +/-Z, the gable ends face +/-X, y = 0 is the ground.
import { THREE, bevelledBox, collider, insetPanel, materialFor, part, scatterInstances,
         seeded, socket, wallWithOpenings } from '../kit-core.js';

const STOREY_H = 2.4, WALL_T = 0.22, EAVE = 0.25, VERGE = 0.15, TIMBER_D = 0.09;
const PALETTE = { plaster: '#e5dccb', timber: '#6b4f34', roof: '#8d5a4a', brick: '#9c6a55',
                  stone: '#b3aa9c', pane: '#2f3a3f' };

/** Windows for one storey of one long wall, and the door on the ground storey of the front.
 *  Every position is a fraction of the width, so a narrow cottage keeps its openings inside
 *  its own walls instead of hanging them off the corners. */
function longWallOpenings(storey, front, width) {
  const y = storey * STOREY_H + 1.6;
  const bay = width * (front ? 0.305 : 0.25);
  const holes = [{ x: bay, y, width: 0.8, height: 0.9 },
                 { x: -bay, y, width: 0.8, height: 0.9 }];
  if (front && storey === 0) holes.push({ x: 0, y: 0.975, width: 0.95, height: 1.95 });
  return holes;
}

/** The four timber positions of one long wall, as fractions of the width. */
function timberPositions(front, width) {
  const outer = width * 0.45, inner = width * (front ? 0.15 : 0.083);
  return [-outer, -inner, inner, outer];
}

/** Four exposed timbers per long wall, standing 7 cm proud of the plaster, plus their pegs.
 *  The timbers are set 2 cm into the wall and stand out of it: a frame flush with the plaster
 *  is a stripe, not a frame, and disappears entirely at the medium distance. */
function frameTimbers(group, pegs, { width, wallH, faceZ, sign, xs, random }) {
  const wood = materialFor(PALETTE.timber, { roughness: 0.72 });
  const face = faceZ + sign * (WALL_T / 2);
  const timberZ = face + sign * (TIMBER_D / 2 - 0.02);
  const post = bevelledBox({ width: 0.16, height: wallH - 0.24, depth: TIMBER_D, bevel: 0.03 });
  for (const base of xs) {
    // Seeded placement jitter: two cottages from two seeds are visibly different buildings.
    const x = base + (random() - 0.5) * 0.1;
    group.add(part(post, wood, [x, wallH / 2 - 0.06, timberZ]));
    for (const y of [0.16, wallH - 0.28]) {
      pegs.push({ x, y, z: face + sign * (TIMBER_D - 0.02 + 0.018) });
    }
  }
  const plate = bevelledBox({ width, height: 0.18, depth: TIMBER_D, bevel: 0.03 });
  group.add(part(plate, wood, [0, wallH - 0.09, timberZ]));
  group.add(part(bevelledBox({ width, height: 0.16, depth: TIMBER_D, bevel: 0.03 }), wood,
                 [0, 0.08, timberZ]));
}

/** One dressed opening in wall-local space, looking down +Z: recessed frame and pane, plus the
 *  sill board and its drip groove for anything smaller than a doorway. The caller positions and
 *  rotates the group, so a gable-end window is dressed exactly like a long-wall one. */
function windowUnit(hole) {
  const unit = insetPanel({ width: hole.width, height: hole.height, depth: 0.12, frame: 0.06,
                            frameMaterial: materialFor(PALETTE.timber, { roughness: 0.7 }),
                            panelMaterial: materialFor(PALETTE.pane, { roughness: 0.25,
                                                                      metalness: 0.05 }) });
  if (hole.height >= 1.5) return unit;
  const board = materialFor(PALETTE.stone, { roughness: 0.85 });
  const shadow = materialFor('#3b362f', { roughness: 0.95 });
  const lip = -hole.height / 2 - 0.03;
  unit.add(part(bevelledBox({ width: hole.width + 0.16, height: 0.07, depth: 0.2, bevel: 0.02 }),
                board, [0, lip, 0.07]));
  unit.add(part(bevelledBox({ width: hole.width + 0.1, height: 0.025, depth: 0.03, bevel: 0.008 }),
                shadow, [0, lip - 0.045, 0.14]));
  return unit;
}

/** Overlapping tile strips: one InstancedMesh per roof, hue jittered 4 % per strip. */
function roof(group, { width, halfDepth, wallH, pitch, random }) {
  const run = halfDepth + EAVE, ridgeY = wallH + halfDepth * Math.tan(pitch);
  const eaveY = wallH - EAVE * Math.tan(pitch);
  const slope = Math.hypot(run, ridgeY - eaveY);
  const rows = Math.max(3, Math.round(slope * 3));
  const strip = bevelledBox({ width: width + 2 * VERGE, height: 0.06,
                              depth: slope / rows + 0.04, bevel: 0.012 });
  // Each course is laid 7 degrees flatter than the roof plane and lifted off it, so its lower
  // edge laps over the course below and throws the shadow line that makes a roof read as tiled.
  const lap = 0.13, lift = 0.03;
  const placements = [];
  for (const side of [1, -1]) {
    const normal = [Math.cos(pitch) * lift, side * Math.sin(pitch) * lift];
    for (let i = 0; i < rows; i++) {
      const t = (i + 0.5) / rows;
      placements.push({ position: [0, ridgeY - t * (ridgeY - eaveY) + normal[0],
                                   side * t * run + normal[1]],
                        rotation: [side * (pitch - lap), 0, 0], hue: (random() - 0.5) * 0.04 });
    }
  }
  group.add(scatterInstances(strip, materialFor(PALETTE.roof, { roughness: 0.8 }), placements));
  group.add(part(bevelledBox({ width: width + 2 * VERGE, height: 0.12, depth: 0.26, bevel: 0.03 }),
                 materialFor(PALETTE.brick, { roughness: 0.85 }), [0, ridgeY + 0.03, 0]));
  return { ridgeY, eaveY };
}

/** Brick stack breaking the ridge line: the second silhouette read after the gable itself. */
function chimney(group, { x, wallH, ridgeY }) {
  const brick = materialFor(PALETTE.brick, { roughness: 0.88 });
  const top = ridgeY + 0.7;
  const height = top - wallH + 0.4;
  group.add(part(bevelledBox({ width: 0.62, height, depth: 0.52, bevel: 0.03 }), brick,
                 [x, top - height / 2, 0]));
  group.add(part(bevelledBox({ width: 0.74, height: 0.1, depth: 0.64, bevel: 0.02 }),
                 materialFor(PALETTE.stone, { roughness: 0.85 }), [x, top + 0.05, 0]));
  return top + 0.1;
}

/** The gable triangle that closes each end wall above the eave line. */
function gableEnd(group, { halfDepth, wallH, ridgeY, x, material }) {
  const shape = new THREE.Shape();
  shape.moveTo(-halfDepth, 0); shape.lineTo(halfDepth, 0); shape.lineTo(0, ridgeY - wallH);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: WALL_T, bevelEnabled: false,
                                                      curveSegments: 1, steps: 1 });
  geometry.rotateY(Math.PI / 2);
  geometry.translate(x - WALL_T / 2, wallH, 0);
  group.add(part(geometry, material));
}

export function create({ width = 4.2, depth = 3.4, storeys = 1, seed = 1, roofPitchDeg = 42 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const halfDepth = depth / 2, wallH = STOREY_H * storeys;
  const pitch = (roofPitchDeg * Math.PI) / 180;
  const plaster = materialFor(PALETTE.plaster, { roughness: 0.9 });
  const pegs = [];

  for (const sign of [1, -1]) {
    const faceZ = sign * (halfDepth - WALL_T / 2);
    const holes = [];
    for (let storey = 0; storey < storeys; storey++) {
      holes.push(...longWallOpenings(storey, sign > 0, width));
    }
    const wall = wallWithOpenings({ width, height: wallH, depth: WALL_T, openings: holes,
                                    material: plaster });
    wall.position.z = faceZ;
    group.add(wall);
    for (const hole of holes) {
      const unit = windowUnit(hole);
      unit.position.set(hole.x, hole.y, faceZ + sign * (WALL_T / 2));
      unit.rotation.y = sign > 0 ? 0 : Math.PI;
      group.add(unit);
    }
    frameTimbers(group, pegs, { width, wallH, faceZ, sign, random,
                                xs: timberPositions(sign > 0, width) });
  }

  const endHoles = [];
  for (let storey = 0; storey < storeys; storey++) {
    endHoles.push({ x: 0, y: storey * STOREY_H + 1.6, width: 0.7, height: 0.8 });
  }
  for (const sign of [1, -1]) {
    const end = wallWithOpenings({ width: depth - 2 * WALL_T, height: wallH, depth: WALL_T,
                                   openings: endHoles, material: plaster });
    end.rotation.y = Math.PI / 2;
    end.position.x = sign * (width / 2 - WALL_T / 2);
    group.add(end);
    for (const hole of endHoles) {
      const unit = windowUnit(hole);
      unit.position.set(sign * (width / 2), hole.y, -hole.x);
      unit.rotation.y = sign * Math.PI / 2;
      group.add(unit);
    }
  }

  const { ridgeY } = roof(group, { width, halfDepth, wallH, pitch, random });
  for (const sign of [1, -1]) {
    gableEnd(group, { halfDepth, wallH, ridgeY, material: plaster,
                      x: sign * (width / 2 - WALL_T / 2) + sign * WALL_T / 2 });
  }
  const chimneyTop = chimney(group, { x: width * 0.3, wallH, ridgeY });

  // Door step and threshold: both stand outside the wall plane, so the silhouette breaks.
  const stone = materialFor(PALETTE.stone, { roughness: 0.88 });
  group.add(part(bevelledBox({ width: 1.35, height: 0.12, depth: 0.5, bevel: 0.03 }), stone,
                 [0, 0.06, halfDepth + 0.16]));
  group.add(part(bevelledBox({ width: 1.05, height: 0.06, depth: 0.16, bevel: 0.02 }), stone,
                 [0, 0.15, halfDepth - 0.02]));
  const door = materialFor(PALETTE.timber, { roughness: 0.62 });
  group.add(part(bevelledBox({ width: 0.9, height: 1.9, depth: 0.08, bevel: 0.02 }), door,
                 [0, 0.97, halfDepth - WALL_T + 0.02]));

  // Peg heads at every frame joint: the smallest authored feature, ~7 cm across.
  const pegGeometry = new THREE.CylinderGeometry(0.035, 0.04, 0.035, 8);
  pegGeometry.rotateX(Math.PI / 2);
  group.add(scatterInstances(pegGeometry, materialFor('#a07a52', { roughness: 0.55 }),
                             pegs.map(p => ({ position: [p.x, p.y, p.z], hue: 0 }))));

  const sockets = [socket('door', [0, 0, halfDepth], [0, 0, 1]),
                   socket('chimney', [width * 0.3, chimneyTop, 0], [0, 1, 0]),
                   socket('sign', [0, wallH - 0.32, halfDepth + 0.02], [0, 0, 1]),
                   socket('lean-to', [-width / 2, 0, 0], [-1, 0, 0])];
  const colliders = [collider('walls', [0, wallH / 2, 0], [width, wallH, depth]),
                     collider('roof', [0, (wallH + ridgeY) / 2, 0],
                              [width + 2 * VERGE, ridgeY - wallH, depth + 2 * EAVE]),
                     collider('step', [0, 0.06, halfDepth + 0.16], [1.35, 0.12, 0.5])];
  return { group, sockets, colliders };
}
