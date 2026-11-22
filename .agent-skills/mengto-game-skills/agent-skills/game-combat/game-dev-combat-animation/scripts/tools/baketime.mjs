import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HumGenRig } from '../../src/player-native/humgen-rig.mjs';
import { HumGenMotion } from '../../src/player-native/humgen-motion.mjs';
import { skillMotionId } from '../../src/player-native/skill-performances.mjs';
import { json, buffer } from '../../tests/helpers/native-equipment.js';
const c = json('catalog.json').characters.female, rig = new HumGenRig(json(c.rig), buffer(c.skinWeights));
const descriptors = json(c.motions).clips, clips = await Promise.all(descriptors.map(async d => (await new GLTFLoader().parseAsync(buffer(d.file), '')).animations[0]));
let t0 = performance.now();const motion = new HumGenMotion(rig, descriptors, clips, { classId: 'archer', strikes: 'bow' });console.log('construct (bakes attack/long_hit)', (performance.now() - t0).toFixed(0), 'ms');
for (const type of ['shoot', 'powerShot']) { t0 = performance.now();motion.prepareSkill(skillMotionId(type));console.log('bake', type, (performance.now() - t0).toFixed(0), 'ms'); }
