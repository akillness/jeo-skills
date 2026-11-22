// timber-cottage-t3.js — the T3 hero: the cottage module's own geometry, baked in Blender.
// Detail ladder: same silhouette as the T1 module, gable roof and chimney unchanged
//                / 3 cm bevel on every arris, so eaves and sills catch a highlight
//                / baked colour with family grain, occlusion darkening the reveals and the eaves.
// Built by templates/kits/blender/export-hero-tier.py from the harness GLB of buildings/
// timber-cottage.js — no geometry is authored here or in the Blender script.
// The bake is static: emissive glazing and any per-frame motion of the T1 module are flattened.
// create() is asynchronous because the geometry lives in a file: it returns a Promise of the
// same { group, sockets, colliders } shape every procedural kit module returns synchronously.
import { THREE, socket } from '../kit-core.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ASSET_URL = new URL('./timber-cottage-t3.glb', import.meta.url).href;
// Used only when a GLB is served without its extras (an optimiser that strips them, say).
// These are the record's sockets, in the same order and the same metres.
const FALLBACK_SOCKETS = [
  { name: 'door', position_m: [0, 0, 1.7], normal: [0, 0, 1] },
  { name: 'chimney', position_m: [1.26, 4.73, 0], normal: [0, 1, 0] },
  { name: 'sign', position_m: [0, 2.08, 1.72], normal: [0, 0, 1] },
  { name: 'lean-to', position_m: [-2.1, 0, 0], normal: [-1, 0, 0] }
];

/**
 * Sockets travel inside the asset: the harness export wrote each one as an empty node carrying
 * its name and its glTF-space normal, Blender kept them as custom properties, and the hero
 * export wrote them back into node extras — which GLTFLoader surfaces as `object.userData`.
 * Reading them back is what keeps the record, the bake script and the runtime in agreement.
 */
function socketsFromExtras(root, scale) {
  const found = [];
  const world = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse(node => {
    const name = node.userData?.socket;
    if (typeof name !== 'string') return;
    node.getWorldPosition(world);
    const normal = node.userData.normal ?? [0, 1, 0];
    found.push(socket(name, [world.x, world.y, world.z], [normal[0], normal[1], normal[2]]));
  });
  if (found.length) return found;
  return FALLBACK_SOCKETS.map(entry => socket(entry.name,
    entry.position_m.map(value => value * scale), entry.normal));
}

export function create({ scale = 1 } = {}) {
  return new GLTFLoader().loadAsync(ASSET_URL).then(gltf => {
    const group = gltf.scene;
    group.scale.setScalar(scale);
    group.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
    });
    const box = new THREE.Box3().setFromObject(group);
    const colliders = [{ name: 'body', min: box.min.toArray(), max: box.max.toArray() }];
    return { group, sockets: socketsFromExtras(group, scale), colliders };
  });
}
