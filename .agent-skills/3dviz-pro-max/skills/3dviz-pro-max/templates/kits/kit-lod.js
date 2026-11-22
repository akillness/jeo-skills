// kit-lod.js - one THREE.LOD per blueprint instance, plus the T0 blockout proxy.
// A blueprint can declare several quality tiers (T0 blockout, T1 module, T2 procedural surface,
// T3 baked GLB). lodFor() puts the ones you built into a single LOD so a scene can hold all of
// them and pay for one: three swaps the level by camera distance every frame.
// Distances are metres and come from the proof log's `view_distances_m`, so a tier switches out
// at the distance it was actually proved at rather than at a guessed number.
// Never wrap an instanced background field in a LOD: one InstancedMesh is one draw call at any
// count, while one LOD per repeat adds a per-frame update and removes no draws (eval run 3
// measured 4,773 draw calls at 5 fps when every object was its own mesh).
import { THREE, bevelledBox, collider, materialFor, part } from './kit-core.js';

// Nearest first, exactly the order three wants levels added in.
export const TIER_ORDER = ['T3', 'T2', 'T1', 'T0'];
// Measured on the timber-cottage proof log: close 8.83 m, far 27.2 m. T3 and T2 both sit at 0
// because a scene rarely ships both; when it does, pass distinct distances or lodFor throws.
export const DEFAULT_DISTANCES = { T3: 0, T2: 0, T1: 8.83, T0: 27.2 };
// A fraction of the switch distance in three (r180 LOD.update), not metres: 8 % is enough that a
// slow orbit around the switch radius does not flicker between two tiers.
export const DEFAULT_HYSTERESIS = 0.08;

/** Kit modules return { group, sockets, colliders }; a caller may pass either that or an Object3D. */
function objectOf(value) {
  const object = value && (value.isObject3D ? value : value.group);
  if (!object || !object.isObject3D) {
    throw new Error('kit-lod: each tier must be an Object3D or a kit result with a .group');
  }
  return object;
}

/**
 * Build a THREE.LOD from the tiers you actually have.
 *
 * @param {Object} objects  { T3, T2, T1, T0 }, any subset; values are Object3D or kit results.
 * @param {Object} [options]
 * @param {Object} [options.distances]   metres per tier; nearer tiers must have smaller values.
 * @param {number} [options.hysteresis]  fraction of the switch distance, 0.08 by default.
 * @returns {THREE.LOD} with `autoUpdate` left true, so a render loop needs no extra call.
 */
export function lodFor(objects, { distances = DEFAULT_DISTANCES, hysteresis = DEFAULT_HYSTERESIS,
                                  autoUpdate = true } = {}) {
  if (!objects || typeof objects !== 'object') {
    throw new Error('kit-lod.lodFor: pass an object of tier name to Object3D');
  }
  const lod = new THREE.LOD();
  let previous = null;
  for (const tier of TIER_ORDER) {
    if (!objects[tier]) continue;
    const distance = distances[tier] ?? DEFAULT_DISTANCES[tier] ?? 0;
    if (!Number.isFinite(distance) || distance < 0) {
      throw new Error(`kit-lod.lodFor: ${tier} needs a finite distance in metres, got ${distance}`);
    }
    if (previous && distance <= previous.distance) {
      throw new Error(`kit-lod.lodFor: ${tier} at ${distance} m is not farther than `
        + `${previous.tier} at ${previous.distance} m; give each tier its own switch distance`);
    }
    lod.addLevel(objectOf(objects[tier]), distance, hysteresis);
    previous = { tier, distance };
  }
  if (lod.levels.length === 0) {
    throw new Error(`kit-lod.lodFor: no tier to add; expected one of ${TIER_ORDER.join(', ')}`);
  }
  lod.autoUpdate = autoUpdate;
  return lod;
}

/**
 * The T0 proxy: one bevelled box the size the record declares, for the blocking pass.
 *
 * It is generated, never shipped and never proved - it exists so placement, collision and
 * draw-call budgets can be settled before any tier is built.
 *
 * @param {Object} record  a blueprint record with `tiers.T0.size_m` = [width, height, depth].
 * @param {Object} [options] `color` and `roughness` of the proxy material.
 * @returns {{group: THREE.Group, sockets: Array, colliders: Array, info: Object}}
 */
export function blockout(record, { color = '#8d8880', roughness = 0.95 } = {}) {
  const size = record?.tiers?.T0?.size_m;
  if (!Array.isArray(size) || size.length !== 3
      || !size.every(value => Number.isFinite(value) && value > 0)) {
    throw new Error(`kit-lod.blockout: ${record?.id ?? 'record'} has no tiers.T0.size_m `
      + '[width, height, depth] in metres');
  }
  const [width, height, depth] = size;
  const bevel = Math.min(0.06, width / 8, height / 8, depth / 8);
  const group = new THREE.Group();
  group.add(part(bevelledBox({ width, height, depth, bevel }),
                 materialFor(color, { roughness }), [0, height / 2, 0]));
  return { group, sockets: [],
           colliders: [collider('blockout', [0, height / 2, 0], [width, height, depth])],
           info: { tier: 'T0', source: 'tiers.T0.size_m', size_m: [...size] } };
}
