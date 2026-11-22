// Face landmarks on the bound body mesh at rest, in the head bone's frame (cm).
import * as THREE from 'three';
import { HumGenRig } from '../../src/player-native/humgen-rig.mjs';
import { json, buffer, equipmentMesh } from '../../tests/helpers/native-equipment.js';
for (const gender of ['female', 'male']) {
  const c = json('catalog.json').characters[gender], rig = new HumGenRig(json(c.rig), buffer(c.skinWeights));
  const bodyModel = await equipmentMesh(c.body), model = new THREE.Group();model.add(rig.root, bodyModel);rig.bind(bodyModel);rig.reset?.();rig.root.updateMatrixWorld(true);
  const body = [...rig.meshes].find(m => /body/i.test(m.name)), g = body.geometry, bones = body.skeleton.bones;
  const head = rig.byName.get('head'), hp = head.getWorldPosition(new THREE.Vector3()), hq = head.getWorldQuaternion(new THREE.Quaternion()).invert();
  const pts = [];
  for (let i = 0; i < g.attributes.position.count; i++) {
    let w = 0;for (let k = 0; k < 4; k++) { const n = bones[g.attributes.skinIndex.getComponent(i, k)]?.userData.nativeName ?? '';if (/^(head|jaw)/.test(n)) w += g.attributes.skinWeight.getComponent(i, k); }
    if (w > .9) pts.push(body.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(body.matrixWorld));
  }
  const W = p => p.toArray().map(x => (x * 100).toFixed(1)), L = p => p.clone().sub(hp).applyQuaternion(hq).toArray().map(x => (x * 100).toFixed(1));
  const nose = pts.reduce((a, b) => b.z > a.z ? b : a), front = pts.filter(p => Math.abs(p.x) < .015 && p.z > nose.z - .06), chin = front.reduce((a, b) => b.y < a.y ? b : a);
  const right = pts.filter(p => p.x < -.03), jawCorner = right.filter(p => p.y < chin.y + .04).reduce((a, b) => b.x < a.x ? b : a);
  const back = pts.reduce((a, b) => b.z < a.z ? b : a), top = pts.reduce((a, b) => b.y > a.y ? b : a);
  console.log(gender, 'head bone world', W(hp));
  for (const [n, p] of [['nose', nose], ['chin', chin], ['jaw corner R', jawCorner], ['back of skull', back], ['crown', top]]) console.log('  ', n.padEnd(14), 'world', W(p).join(','), ' headLocal', L(p).join(','));
  rig.dispose();
}
