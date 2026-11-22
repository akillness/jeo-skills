// Draw-hand position against the jaw anchor through a shot, in the head's frame (cm: +x left, +y up, +z forward).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HumGenRig } from '../../src/player-native/humgen-rig.mjs';
import { HumGenMotion } from '../../src/player-native/humgen-motion.mjs';
import { skillMotionId } from '../../src/player-native/skill-performances.mjs';
import { gamePlayerMotion } from '../../src/game-player.js';
import { RULES } from '../../src/combat-rules.js';
import { BOW_ANCHOR } from '../../src/bow-anchor.js';
import { json, buffer } from '../../tests/helpers/native-equipment.js';
const [gender = 'female', move = 'shoot'] = process.argv.slice(2);
const c = json('catalog.json').characters[gender], rig = new HumGenRig(json(c.rig), buffer(c.skinWeights));
const descriptors = json(c.motions).clips, clips = await Promise.all(descriptors.map(async d => (await new GLTFLoader().parseAsync(buffer(d.file), '')).animations[0]));
const motion = new HumGenMotion(rig, descriptors, clips, { classId: 'archer' }), id = skillMotionId(move);motion.prepareSkill(id);motion.select(id, { transition: false });
const by = n => rig.byName.get(n), P = n => by(n).getWorldPosition(new THREE.Vector3()), W = n => by(n).getWorldQuaternion(new THREE.Quaternion());
const { startup: S, active, recovery } = RULES[move], T = S + active + recovery, size = P('head').y / 1.6;
for (let f = 0; f <= Math.round(T * 30); f++) {
  const t = f / 30;motion.sample(gamePlayerMotion({ hp: 20, action: { type: move, t } }, 0, motion.descriptors).time);rig.root.updateMatrixWorld(true);
  const hq = W('head').invert(), rel = v => v.clone().sub(P('head')).applyQuaternion(hq).multiplyScalar(100).toArray().map(x => x.toFixed(0).padStart(4)).join('');
  const jaw = new THREE.Vector3(...BOW_ANCHOR).multiplyScalar(size).applyQuaternion(W('head')).add(P('head'));
  const w = n => P(n).multiplyScalar(100).toArray().map(x => x.toFixed(0).padStart(4)).join('');
  console.log(String(f).padStart(2), t.toFixed(2), 'W finger', w('f_middle.01.R'), ' elbow', w('forearm.R'), ' shR', w('upper_arm.R'), ' shL', w('upper_arm.L'), ' head', w('head'), ' |', 'finger', rel(P('f_middle.01.R')), ' elbow', rel(P('forearm.R')), ' jawDist', (P('f_middle.01.R').distanceTo(jaw) * 100).toFixed(0), t >= S ? (t < S + active ? 'LOOSE' : '') : '');
}
