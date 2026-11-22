// kits-gltf.test.js - container checks for the Blender-authored glTF heroes.
// Node has no WebGL, so this file deliberately proves only that the binary is a well-formed
// glTF 2.0 GLB that carries what the blueprint records claim: material slots, at least one
// mesh, the socket empties in node extras and (for the lantern) the emissive strength
// extension. The visual proof is the capture set under evidence/kits/, not this test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 2 * 1024 * 1024;          // the cap scripts/blueprint_validation.py enforces
const JSON_CHUNK = 0x4e4f534a;              // 'JSON'
const BIN_CHUNK = 0x004e4942;               // 'BIN\0'

/** Split a GLB into its header fields and its JSON chunk, the way GLTFLoader does. */
function readGlb(name) {
  const path = fileURLToPath(new URL(`./kits/gltf/${name}`, import.meta.url));
  const bytes = readFileSync(path);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = {
    magic: bytes.subarray(0, 4).toString('latin1'),
    version: view.getUint32(4, true),
    length: view.getUint32(8, true),
    bytes: statSync(path).size
  };
  const chunks = [];
  let offset = 12;
  let json = null;
  while (offset + 8 <= bytes.length) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    chunks.push(chunkType);
    if (chunkType === JSON_CHUNK) {
      json = JSON.parse(bytes.subarray(offset + 8, offset + 8 + chunkLength).toString('utf8'));
    }
    offset += 8 + chunkLength;
  }
  return { header, chunks, json };
}

function socketNames(json) {
  return (json.nodes ?? [])
    .filter(node => typeof node.extras?.socket === 'string')
    .map(node => node.extras.socket)
    .sort();
}

const ASSETS = [
  ['stone-guildhall.glb', ['banner', 'chimney', 'door', 'lantern'], 4],
  ['iron-lantern.glb', ['base', 'hook', 'lamp'], 3]
];

for (const [name, sockets, materials] of ASSETS) {
  test(`${name} is a well-formed glTF 2.0 binary container`, () => {
    const { header, chunks, json } = readGlb(name);
    assert.equal(header.magic, 'glTF');
    assert.equal(header.version, 2);
    assert.equal(header.length, header.bytes, 'the header length must match the file size');
    assert.ok(header.bytes <= MAX_BYTES, `${name} is ${header.bytes} bytes, over the 2 MB cap`);
    assert.deepEqual(chunks, [JSON_CHUNK, BIN_CHUNK]);
    assert.equal(json.asset.version, '2.0');
    assert.ok(json.meshes.length >= 1, 'at least one mesh');
    assert.ok(json.meshes[0].primitives.length >= 1, 'at least one primitive');
  });

  test(`${name} carries its material slots, UVs and socket extras`, () => {
    const { json } = readGlb(name);
    assert.equal(json.materials.length, materials);
    for (const material of json.materials) assert.ok(material.name.length > 0);
    for (const primitive of json.meshes[0].primitives) {
      assert.ok('POSITION' in primitive.attributes);
      assert.ok('NORMAL' in primitive.attributes);
      assert.ok('TEXCOORD_0' in primitive.attributes, 'the smart UV project must have run');
    }
    assert.deepEqual(socketNames(json), sockets);
    for (const node of json.nodes) {
      if (!node.extras?.socket) continue;
      assert.equal(node.extras.normal.length, 3, `${node.extras.socket} needs a 3-vector normal`);
    }
  });

  test(`${name} ships without Draco compression the harness cannot decode`, () => {
    const { json } = readGlb(name);
    assert.ok(!(json.extensionsUsed ?? []).includes('KHR_draco_mesh_compression'));
    assert.equal(json.extensionsRequired, undefined);
  });
}

test('the lantern glazing exports KHR_materials_emissive_strength', () => {
  const { json } = readGlb('iron-lantern.glb');
  assert.ok(json.extensionsUsed.includes('KHR_materials_emissive_strength'));
  const glass = json.materials.find(material => material.name === 'LanternGlass');
  assert.ok(glass.extensions.KHR_materials_emissive_strength.emissiveStrength > 1);
});

test('the loader wrappers resolve their imports and export a create factory', async () => {
  // Calling create() would need fetch over file://, which Node does not do; importing the
  // module is still worth asserting, because it proves three, three/addons/GLTFLoader and
  // ../kit-core.js all resolve from the example package the way the harness expects.
  for (const name of ['stone-guildhall', 'iron-lantern']) {
    const module = await import(`./kits/gltf/${name}.js`);
    assert.equal(typeof module.create, 'function');
    assert.equal(module.create.length, 0, 'create takes one optional options object');
  }
});
