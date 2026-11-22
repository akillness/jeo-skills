// Full-draw fit for both shots: finger vs elbow height, arm raise and elbow flexion (both bodies).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HumGenRig } from '../../src/player-native/humgen-rig.mjs';
import { HumGenMotion } from '../../src/player-native/humgen-motion.mjs';
import { skillMotionId } from '../../src/player-native/skill-performances.mjs';
import { armAnatomy, elbowFlexion } from '../../src/player-native/arm-anatomy.mjs';
import { gamePlayerMotion } from '../../src/game-player.js';
import { RULES } from '../../src/combat-rules.js';
import { json, buffer } from '../../tests/helpers/native-equipment.js';
for (const gender of ['female', 'male']) {
  const c = json('catalog.json').characters[gender], rig = new HumGenRig(json(c.rig), buffer(c.skinWeights));
  const descriptors = json(c.motions).clips, clips = await Promise.all(descriptors.map(async d => (await new GLTFLoader().parseAsync(buffer(d.file), '')).animations[0]));
  const anatomy = armAnatomy(rig), by = n => rig.byName.get(n), P = n => by(n).getWorldPosition(new THREE.Vector3());
  const raise = side => { const down = new THREE.Vector3(0, -1, 0).applyQuaternion(by('spine.003').getWorldQuaternion(new THREE.Quaternion()).multiply(anatomy.chest));return Math.acos(THREE.MathUtils.clamp(P('forearm.' + side).sub(P('upper_arm.' + side)).normalize().dot(down), -1, 1)) * 57.3; };
  for (const move of ['shoot', 'powerShot']) {
    const motion = new HumGenMotion(rig, descriptors, clips, { classId: 'archer' }), id = skillMotionId(move);motion.prepareSkill(id);motion.select(id, { transition: false });
    const { startup: S, active, recovery } = RULES[move], T = S + active + recovery;let maxRaise = [0, 0];
    for (let f = 0; f <= Math.round(T * 60); f++) { const t = f / 60;motion.sample(gamePlayerMotion({ hp: 20, action: { type: move, t } }, 0, motion.descriptors).time);rig.root.updateMatrixWorld(true);const r = raise('R');if (r > maxRaise[0]) maxRaise = [r, t]; }
    motion.sample(gamePlayerMotion({ hp: 20, action: { type: move, t: S - 1 / 60 } }, 0, motion.descriptors).time);rig.root.updateMatrixWorld(true);
    console.log(gender, move.padEnd(9), 'elbow-finger', ((P('forearm.R').y - P('f_middle.01.R').y) * 100).toFixed(1), 'cm  raise@full', raise('R').toFixed(0), ' maxRaise', maxRaise[0].toFixed(0), '@', maxRaise[1].toFixed(2), ' flex', (elbowFlexion(anatomy, 'R', by('forearm.R').quaternion) * 57.3).toFixed(0), ' finger-shoulder', ((P('f_middle.01.R').y - P('upper_arm.R').y) * 100).toFixed(0));
    motion.dispose();
  }
}
