// export-glb.js - the harness in export mode: build one blueprint and hand its GLB back.
// Loaded instead of main.js by `kit_proof_harness.py --export-glb`, which is how the Blender
// hero tier (T3) gets the module's own geometry without re-modelling it in Python. There is no
// renderer, no camera and no capture here: the page builds the kit, serialises it and stops.
// Sockets are copied onto empty nodes so `export_extras` can carry them through Blender.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { loadBlueprint, triangles } from './blueprint-views.js';

const meta = name => document.querySelector(`meta[name="${name}"]`)?.content ?? '';

/** Base64 in fixed slices: one fromCharCode over a megabyte-long array blows the stack. */
function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Replace every coloured InstancedMesh with one plain Mesh per instance.
 *
 * GLTFExporter writes an InstancedMesh out as one node per instance but drops `instanceColor`
 * entirely, so thatch courses and scattered props would arrive in Blender pure white and bake
 * white. Cloning the material once per distinct instance colour keeps the module's own palette,
 * which is also what the record's `families` map is keyed on. Returns the number expanded.
 */
function expandInstanceColours(root) {
  const instanced = [];
  root.traverse(node => { if (node.isInstancedMesh && node.instanceColor) instanced.push(node); });
  const matrix = new THREE.Matrix4();
  const colour = new THREE.Color();
  for (const mesh of instanced) {
    const group = new THREE.Group();
    group.name = `${mesh.name || 'instanced'}-expanded`;
    group.applyMatrix4(mesh.matrix);
    const palette = new Map();
    for (let index = 0; index < mesh.count; index += 1) {
      mesh.getMatrixAt(index, matrix);
      mesh.getColorAt(index, colour);
      const key = colour.getHexString();
      let material = palette.get(key);
      if (!material) {
        material = mesh.material.clone();
        material.color.copy(colour);
        material.vertexColors = false;
        palette.set(key, material);
      }
      const child = new THREE.Mesh(mesh.geometry, material);
      child.applyMatrix4(matrix);
      group.add(child);
    }
    mesh.parent.add(group);
    mesh.removeFromParent();
  }
  return instanced.length;
}

async function run() {
  const params = JSON.parse(meta('params') || '{}');
  const tier = meta('tier') || 'T1';
  const surface = JSON.parse(meta('surface') || '{}');
  const built = await loadBlueprint(meta('module'), params, meta('factory'), { tier, surface });
  const group = built.group;
  const sockets = built.sockets ?? [];
  const counted = triangles(group);
  const expanded = expandInstanceColours(group);
  // Custom properties on an empty survive the glTF -> Blender -> glTF round trip, so the baked
  // hero keeps the same socket names and normals the procedural module published.
  for (const entry of sockets) {
    const node = new THREE.Object3D();
    node.name = `socket-${entry.name}`;
    node.position.fromArray(entry.position_m ?? [0, 0, 0]);
    node.userData = { socket: entry.name, normal: entry.normal ?? [0, 1, 0] };
    group.add(node);
  }
  group.userData = { ...group.userData, blueprint: meta('blueprint'), tier,
                     params: JSON.stringify(params) };
  group.updateMatrixWorld(true);
  const buffer = await new GLTFExporter().parseAsync(group, {
    binary: true, onlyVisible: false, includeCustomExtensions: true, trs: false });
  window.__kitExport = {
    blueprint: meta('blueprint'), module: meta('module'), tier, params,
    triangles: counted, bytes: buffer.byteLength, instanced_expanded: expanded,
    sockets: sockets.map(entry => entry.name), three: THREE.REVISION };
  window.__kitGlb = base64(buffer);
  window.__kitExportReady = true;
}

run().catch(error => {
  window.__kitExportError = String(error?.stack ?? error?.message ?? error);
  window.__kitExportReady = true;
});
