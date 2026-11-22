// iron-lantern.js — loads the Blender-authored lantern GLB and normalises it to the kit contract.
// Detail ladder: post, glazed head and pyramid cap silhouette against the sky
//                / hook arm with its diagonal stay, brass collars, four recessed glass panes
//                / 6 mm two-segment chamfers, finial, KHR_materials_emissive_strength glazing.
// Sockets: base, lamp, hook — read from the GLB's node extras, not hard-coded here.
// create() is asynchronous because the geometry lives in a file: it returns a Promise of the
// same { group, sockets, colliders } shape every procedural kit module returns synchronously.
import { THREE, socket } from '../kit-core.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ASSET_URL = new URL('./iron-lantern.glb', import.meta.url).href;
// Used only when a GLB is served without its extras (an optimiser that strips them, say).
const FALLBACK_SOCKETS = [
  { name: 'base', position_m: [0, 0, 0], normal: [0, 1, 0] },
  { name: 'lamp', position_m: [0, 2.96, 0], normal: [0, 1, 0] },
  { name: 'hook', position_m: [0, 2.6, -0.44], normal: [0, 0, -1] }
];

/**
 * Sockets travel inside the asset: each Blender empty exported its `socket` name and its
 * glTF-space `normal` into node extras, which GLTFLoader surfaces as `object.userData`.
 * Reading them back is what keeps the record, the .blend-free build script and the runtime
 * in agreement — nobody retypes a coordinate.
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
    const colliders = [{ name: 'post', min: box.min.toArray(), max: box.max.toArray() }];
    return { group, sockets: socketsFromExtras(group, scale), colliders };
  });
}
