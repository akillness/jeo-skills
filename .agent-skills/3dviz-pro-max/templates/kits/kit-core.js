// kit-core.js - shared building blocks for every kit module.
// One material cache, one seeded RNG, one socket helper. Import three by bare specifier:
// the harness supplies an import map; Node callers must sit inside a tree that has three.
// No module in templates/kits/ may exceed 200 lines or import anything outside this file.
// Nothing here draws: a kit module returns geometry, sockets and colliders, and the page
// that hosts it owns the renderer, the lights and the camera.
// The walker gait maths lives in ./kit-walk.js and is re-exported below, so a creature module
// still imports one file and neither file has to break the 200-line rule to hold both.
import * as THREE from 'three';
export { twoBoneIk, footCycle, routeStep } from './kit-walk.js';
// The T2 surface layer is re-exported the same way, so a caller still imports one file.
// Plain `export ... from` bindings: kit-surface.js imports THREE from here, and a live
// re-export is what keeps that cycle harmless in every ES module loader.
export { surfaceMaps, applySurface, buildKit } from './kit-surface.js';
// Runtime tier switching lives in ./kit-lod.js for the same reason: one import, two files.
export { lodFor, blockout } from './kit-lod.js';

const materials = new Map();

/** Cached MeshStandardMaterial. Options that carry a texture bypass the cache. */
export function materialFor(color, { roughness = 0.65, metalness = 0, emissive = null,
                                     emissiveIntensity = 0, map = null, flatShading = false } = {}) {
  const options = { color, roughness, metalness, flatShading };
  if (emissive) Object.assign(options, { emissive, emissiveIntensity });
  if (map) return new THREE.MeshStandardMaterial({ ...options, map });
  const key = JSON.stringify([color, roughness, metalness, emissive, emissiveIntensity, flatShading]);
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial(options));
  return materials.get(key);
}

/** Deterministic mulberry32 stream so a blueprint renders identically on every proof run. */
export function seeded(seed) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box with a real chamfer: bevel is geometry, not a normal map (2-4 cm at village scale).
 *  Extruded along +Z and re-centred on the origin, so it drops into a Mesh unrotated. */
export function bevelledBox({ width, height, depth, bevel = 0.03, segments = 1 }) {
  const b = Math.max(0.001, Math.min(bevel, width / 2.05, height / 2.05, depth / 2.05));
  const w = width / 2 - b, h = height / 2 - b;
  const shape = new THREE.Shape();
  shape.moveTo(-w, -h); shape.lineTo(w, -h); shape.lineTo(w, h); shape.lineTo(-w, h);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b,
    bevelOffset: 0, bevelSegments: segments, curveSegments: 1, steps: 1
  });
  geometry.translate(0, 0, -(depth / 2 - b));
  geometry.computeVertexNormals();
  return geometry;
}

/** One mesh, positioned and shadowed the way every kit part is. */
export function part(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Recessed opening: outer frame + inset plane, so the wall reads as having thickness.
 *  Local frame: the opening spans XY and looks down +Z; `depth` is how far the panel sits back. */
export function insetPanel({ width, height, depth = 0.12, frame = 0.06,
                             frameMaterial, panelMaterial, bevel = 0.015 }) {
  const group = new THREE.Group();
  const wood = frameMaterial ?? materialFor('#6f5138', { roughness: 0.72 });
  const pane = panelMaterial ?? materialFor('#2b2f33', { roughness: 0.25, metalness: 0.05 });
  group.add(part(bevelledBox({ width: width - frame, height: height - frame, depth: 0.03, bevel }),
                 pane, [0, 0, -depth]));
  const bars = [[width, frame, 0, (height - frame) / 2], [width, frame, 0, -(height - frame) / 2],
                [frame, height - 2 * frame, (width - frame) / 2, 0],
                [frame, height - 2 * frame, -(width - frame) / 2, 0]];
  for (const [w, h, x, y] of bars) {
    group.add(part(bevelledBox({ width: w, height: h, depth: frame, bevel }), wood,
                   [x, y, -depth + frame / 2 + 0.02]));
  }
  return group;
}

/** A wall pierced by real holes: piers between openings, plus a sill and header for each.
 *  Openings are {x, y, width, height} in wall-local metres, y measured from the wall base.
 *  Openings must not overlap in x; they are cut, not decalled, so the wall keeps its depth. */
export function wallWithOpenings({ width, height, depth, openings = [], material, bevel = 0.03 }) {
  const group = new THREE.Group();
  const sorted = [...openings].sort((a, b) => a.x - b.x);
  const solid = (w, h, x, y) => {
    if (w <= 0.001 || h <= 0.001) return;
    group.add(part(bevelledBox({ width: w, height: h, depth, bevel }), material,
                   [x, y, 0]));
  };
  let cursor = -width / 2;
  for (const hole of sorted) {
    const left = hole.x - hole.width / 2, right = hole.x + hole.width / 2;
    const bottom = hole.y - hole.height / 2, top = hole.y + hole.height / 2;
    solid(left - cursor, height, (cursor + left) / 2, height / 2);
    solid(hole.width, bottom, hole.x, bottom / 2);
    solid(hole.width, height - top, hole.x, (height + top) / 2);
    cursor = right;
  }
  solid(width / 2 - cursor, height, (cursor + width / 2) / 2, height / 2);
  return group;
}

const whites = new WeakMap();

/** three multiplies instanceColor into the material colour, so an instanced field whose base
 *  colour appears on both sides renders that colour squared. Every InstancedMesh therefore
 *  runs on a white-based clone and setColorAt writes the absolute colour; the caller's own
 *  material keeps its colour for the non-instanced meshes that share the cache entry. */
function whiteBased(material) {
  if (!whites.has(material)) {
    const clone = material.clone();
    clone.color.setRGB(1, 1, 1);
    whites.set(material, clone);
  }
  return whites.get(material);
}

/** InstancedMesh with per-instance position/rotation/scale/hue jitter from a seeded stream.
 *  Placements are {position, rotation, scale, hue}; hue shifts the material's colour, it never
 *  replaces it, so a scattered field stays inside the palette it was authored in - and an
 *  unjittered instance renders exactly the colour the module asked materialFor to make. */
export function scatterInstances(geometry, material, placements) {
  const mesh = new THREE.InstancedMesh(geometry, whiteBased(material), placements.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const tint = new THREE.Color();
  const base = new THREE.Color(material.color).getHSL({ h: 0, s: 0, l: 0 });
  placements.forEach((placement, index) => {
    const s = placement.scale ?? 1;
    position.set(...placement.position);
    euler.set(...(placement.rotation ?? [0, 0, 0]));
    quaternion.setFromEuler(euler);
    scale.set(...(Array.isArray(s) ? s : [s, s, s]));
    mesh.setMatrixAt(index, matrix.compose(position, quaternion, scale));
    const hue = placement.hue ?? 0;
    mesh.setColorAt(index, tint.setHSL(base.h + hue, base.s,
                                       Math.min(1, base.l * (1 + hue * 4))));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/** Socket descriptor consumed by layout/village-layout.js and echoed in the record. */
export function socket(name, position_m, normal = [0, 1, 0]) {
  return { name, position_m: [...position_m], normal: [...normal] };
}

/** Axis-aligned collider descriptor: physics reads these, never the render meshes. */
export function collider(name, centre_m, size_m) {
  return { name, centre_m: [...centre_m], size_m: [...size_m] };
}

/** Attach `child.group` to `parent` at a named socket, aligning +Y to the socket normal. */
export function attach(parentGroup, sockets, name, child) {
  const target = sockets.find(entry => entry.name === name);
  if (!target) throw new Error(`Unknown socket: ${name}`);
  const group = child.group ?? child;
  group.position.set(...target.position_m);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
                                      new THREE.Vector3(...target.normal).normalize());
  parentGroup.add(group);
  return group;
}

/** Triangle count of anything already built. Kits state a poly budget; this is how it is read. */
export function triangleCount(object) {
  let total = 0;
  object.traverse(node => {
    const geometry = node.geometry;
    if (!geometry) return;
    const instances = node.isInstancedMesh ? node.count : 1;
    const indexed = geometry.index ? geometry.index.count : geometry.attributes.position.count;
    total += (indexed / 3) * instances;
  });
  return total;
}

export { THREE };
