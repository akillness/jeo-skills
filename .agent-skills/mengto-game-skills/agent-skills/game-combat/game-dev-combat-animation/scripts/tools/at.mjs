import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HumGenRig } from '../../src/player-native/humgen-rig.mjs';
import { HumGenMotion } from '../../src/player-native/humgen-motion.mjs';
import { createEquipmentGrips } from '../../src/player-equipment-grips.js';
import { json, buffer } from '../../tests/helpers/native-equipment.js';
const [gender = 'male', id = 'long_hit', ...ts] = process.argv.slice(2);
const c = json('catalog.json').characters[gender], rig = new HumGenRig(json(c.rig), buffer(c.skinWeights));
const descriptors = json(c.motions).clips, clips = await Promise.all(descriptors.map(async d => (await new GLTFLoader().parseAsync(buffer(d.file), '')).animations[0]));
const motion = new HumGenMotion(rig, descriptors, clips, { classId: 'knight' }), grips = createEquipmentGrips(rig, { classId: 'knight' });
const bone = n => rig.byName.get(n), P = n => bone(n).getWorldPosition(new THREE.Vector3()), f = v => v.toArray().map(x => x.toFixed(2)).join(',');
motion.select(id, { transition: false });
for (const t of ts.map(Number)) {
  motion.sample(t);
  const g = new THREE.Matrix4().compose(grips.centers.get('R'), grips.orientations.get('R'), new THREE.Vector3(1, 1, 1)).premultiply(bone('hand.R').matrixWorld);
  const fist = new THREE.Vector3().setFromMatrixPosition(g), dir = new THREE.Vector3(0, 1, 0).transformDirection(g);
  console.log(t, 'fist', f(fist), 'blade dir', f(dir), 'head bone', f(P('head')), 'eyeL', bone('eye.L') ? f(P('eye.L')) : '-', 'nose-ish', f(new THREE.Vector3(0, .09, .1).applyQuaternion(bone('head').getWorldQuaternion(new THREE.Quaternion())).add(P('head'))));
}
