import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HumGenRig } from '../../src/player-native/humgen-rig.mjs';
import { HumGenMotion } from '../../src/player-native/humgen-motion.mjs';
import { skillMotionId } from '../../src/player-native/skill-performances.mjs';
import { json, buffer } from '../../tests/helpers/native-equipment.js';
const [gender = 'female', classId = 'archer', type = 'powerShot', from = '0', to = '9'] = process.argv.slice(2);
const c = json('catalog.json').characters[gender], rig = new HumGenRig(json(c.rig), buffer(c.skinWeights));
const descriptors = json(c.motions).clips, clips = await Promise.all(descriptors.map(async d => (await new GLTFLoader().parseAsync(buffer(d.file), '')).animations[0]));
const motion = new HumGenMotion(rig, descriptors, clips, { classId }), id = skillMotionId(type);motion.prepareSkill(id);
const clip = motion.clips.get(id), names = rig.bones.map(b => b.name);
const tracks = clip.tracks.filter(t => t.name.endsWith('.quaternion'));
const times = tracks[0].times;
for (let f = 1; f < times.length; f++) {
  if (times[f] < +from || times[f] > +to) continue;
  const big = [];
  for (const t of tracks) { const a = new THREE.Quaternion().fromArray(t.values, (f - 1) * 4), b = new THREE.Quaternion().fromArray(t.values, f * 4), d = a.angleTo(b) * 180 / Math.PI;if (d > 12) big.push(t.name.replace('.quaternion', '').replace('HG_', '') + ' ' + d.toFixed(0)); }
  console.log(times[f].toFixed(3), big.join(', '));
}
const rootTrack = clip.tracks.find(t => t.name.endsWith('.position'));
const spin = clip.tracks.find(t => t.name === rig.root.name + '.quaternion');
for (let f = 0; f < rootTrack.times.length; f++) if (rootTrack.times[f] >= +from && rootTrack.times[f] <= +to) {
  const q = new THREE.Quaternion().fromArray(spin.values, f * 4), e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
  const hips = tracks.find(t => t.name.includes('spine.quaternion') || t.name === 'HG_spine.quaternion');
  console.log('root', rootTrack.times[f].toFixed(3), [...rootTrack.values.slice(f * 3, f * 3 + 3)].map(v => v.toFixed(3)).join(','), 'yaw', (e.y * 57.3).toFixed(1));
}
