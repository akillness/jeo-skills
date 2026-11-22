// building-kit.js - the shared vocabulary of Emberfall: curled-eave roofs, timber-framed walls,
// 2.0 m doors and lit windows. Every building is made of these, so the differences between them
// read as one culture rather than as a sample sheet. Change ROOF_CURL to restyle the whole village.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const ROOF_CURL = 0.34; // how far the eave dips below the straight line from ridge to wall top
export const DOOR_HEIGHT = 2.0; // stated scale cue: every door in the village is 2.0 m

/** Adds a mesh and returns it. Shadows on by default: nothing in this village floats unlit. */
export function add(parent, geometry, material, [x, y, z] = [0, 0, 0], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function roofProfile(width, height, overhang, thickness) {
  const half = width / 2 + overhang;
  const control = height * ROOF_CURL;
  const shape = new THREE.Shape();
  shape.moveTo(-half, -0.18);
  shape.quadraticCurveTo(-half * 0.44, control, 0, height);
  shape.quadraticCurveTo(half * 0.44, control, half, -0.18);
  shape.lineTo(half, -0.18 - thickness * 0.55);
  shape.quadraticCurveTo(half * 0.44, control - thickness, 0, height - thickness);
  shape.quadraticCurveTo(-half * 0.44, control - thickness, -half, -0.18 - thickness * 0.55);
  shape.closePath();
  return shape;
}

/** A curled-eave pitched roof. The ridge runs along z; width spans x. */
export function curlRoof(parent, material, { width, depth, height, overhang = 0.55, thickness = 0.26, y = 0 }) {
  const span = depth + overhang * 2;
  const geometry = new THREE.ExtrudeGeometry(roofProfile(width, height, overhang, thickness), {
    depth: span, bevelEnabled: false, steps: 1, curveSegments: 12
  });
  geometry.translate(0, 0, -span / 2);
  return add(parent, geometry, material, [0, y, 0]);
}

/** The filled gable end that closes the space under a curled roof. */
export function gable(parent, material, { width, height, thickness = 0.16, y = 0, z = 0 }) {
  const half = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.quadraticCurveTo(-half * 0.44, height * ROOF_CURL, 0, height);
  shape.quadraticCurveTo(half * 0.44, height * ROOF_CURL, half, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 12 });
  geometry.translate(0, 0, -thickness / 2);
  return add(parent, geometry, material, [0, y, z]);
}

/** Bevelled wall block, corner posts, a waist rail, a ground sill and two braces per long face. */
export function walls(parent, { width, depth, height, y = 0, wall, timber }) {
  add(parent, new RoundedBoxGeometry(width, height, depth, 3, 0.07), wall, [0, y + height / 2, 0]);
  const post = new RoundedBoxGeometry(0.19, height, 0.19, 2, 0.04);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(parent, post, timber, [sx * (width / 2 - 0.05), y + height / 2, sz * (depth / 2 - 0.05)]);
  }
  add(parent, new THREE.BoxGeometry(width + 0.06, 0.14, depth + 0.06), timber, [0, y + height * 0.62, 0]);
  add(parent, new THREE.BoxGeometry(width + 0.14, 0.19, depth + 0.14), timber, [0, y + 0.1, 0]);
  const run = width * 0.3, rise = height * 0.56;
  const brace = new THREE.BoxGeometry(0.13, Math.hypot(run, rise), 0.13);
  const angle = Math.atan2(run, rise);
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
    add(parent, brace, timber, [sx * run * 0.55, y + rise * 0.5 + 0.1, sz * (depth / 2 + 0.02)], [0, 0, -sx * angle]);
  }
}

/** A 2.0 m doorway with a lintel, facing +z. */
export function door(parent, { z, timber, glow, width = 1.05, y = 0 }) {
  add(parent, new THREE.BoxGeometry(width, DOOR_HEIGHT, 0.12), timber, [0, y + DOOR_HEIGHT / 2, z]);
  add(parent, new THREE.BoxGeometry(width + 0.34, 0.18, 0.2), timber, [0, y + DOOR_HEIGHT + 0.09, z]);
  add(parent, new THREE.PlaneGeometry(width * 0.7, 0.34), glow, [0, y + DOOR_HEIGHT - 0.3, z + 0.07]);
}

/** A lit window on the +/-z or +/-x face, `shift` metres along that face from centre. */
export function window_(parent, { axis, sign, offset, y, shift = 0, timber, glow, width = 0.6, height = 0.78 }) {
  const onZ = axis === 'z';
  const outward = sign * (offset + 0.05);
  const place = onZ ? [shift, y, outward] : [outward, y, shift];
  add(parent, new THREE.PlaneGeometry(width, height), glow, place, [0, onZ ? (sign > 0 ? 0 : Math.PI) : sign * Math.PI / 2, 0]);
  const frame = onZ
    ? new THREE.BoxGeometry(width + 0.16, height + 0.16, 0.1)
    : new THREE.BoxGeometry(0.1, height + 0.16, width + 0.16);
  add(parent, frame, timber, [place[0] - (onZ ? 0 : sign * 0.03), place[1], place[2] - (onZ ? sign * 0.03 : 0)]);
}

/** A hanging lantern: the emissive core is the only surface authored above the bloom threshold. */
export function lantern(parent, { position, iron, flame, size = 0.16, drop = 0.5 }) {
  const group = new THREE.Group();
  group.position.set(...position);
  add(group, new THREE.CylinderGeometry(0.02, 0.02, drop, 5), iron, [0, drop / 2, 0]);
  add(group, new THREE.SphereGeometry(size, 10, 8), flame, [0, 0, 0]);
  add(group, new THREE.CylinderGeometry(size * 1.25, size * 0.5, size * 0.7, 6), iron, [0, size * 1.1, 0]);
  parent.add(group);
  return group;
}

/** Stone footing that fills the gap between a level floor and sloping ground. */
export function plinth(parent, { width, depth, drop, stone }) {
  if (drop <= 0.05) return null;
  return add(parent, new THREE.BoxGeometry(width + 0.35, drop + 0.3, depth + 0.35), stone, [0, -(drop + 0.3) / 2 + 0.12, 0]);
}
