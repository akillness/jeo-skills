// Arm and hand plausibility across every frame of the four strikes: joint ranges and the skinned
// mesh's own stretch, measured on the real skin.  node .dream-loop/moves/armcheck.mjs [gender] [moves] [detail]
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HumGenRig } from '../../src/player-native/humgen-rig.mjs';
import { HumGenMotion } from '../../src/player-native/humgen-motion.mjs';
import { skillMotionId } from '../../src/player-native/skill-performances.mjs';
import { armAnatomy, boneTwist, elbowFlexion } from '../../src/player-native/arm-anatomy.mjs';
import { gamePlayerMotion } from '../../src/game-player.js';
import { RULES } from '../../src/combat-rules.js';
import { json, buffer, equipmentMesh } from '../../tests/helpers/native-equipment.js';
const DEG = 180 / Math.PI;
const [gender = 'male', moveList = 'knight:attack,knight:long_hit,archer:shoot,archer:powerShot', detail = ''] = process.argv.slice(2);
const c = json('catalog.json').characters[gender], rig = new HumGenRig(json(c.rig), buffer(c.skinWeights));
const bodyModel = await equipmentMesh(c.body), model = new THREE.Group();model.add(rig.root, bodyModel);rig.bind(bodyModel);
const descriptors = json(c.motions).clips, clips = await Promise.all(descriptors.map(async d => (await new GLTFLoader().parseAsync(buffer(d.file), '')).animations[0]));
const anatomy = armAnatomy(rig), by = n => rig.byName.get(n);
const W = n => by(n).getWorldQuaternion(new THREE.Quaternion()), P = n => by(n).getWorldPosition(new THREE.Vector3());
// Wrist bend: the hand's swing away from its bind on the forearm, its roll about the forearm removed.
const wristBend = side => {
  const s = anatomy.sides[side], local = by('hand.' + side).quaternion, delta = s.hand.clone().invert().multiply(local);
  const axis = s.foreAxis.clone().applyQuaternion(s.hand.clone().invert()).normalize();
  const proj = axis.clone().multiplyScalar(axis.dot(new THREE.Vector3(delta.x, delta.y, delta.z)));
  const twist = new THREE.Quaternion(proj.x, proj.y, proj.z, delta.w).normalize(), swing = delta.clone().multiply(twist.invert());
  return 2 * Math.acos(Math.min(1, Math.abs(swing.w))) * DEG;
};
const elevation = side => {
  const chest = W('spine.003').multiply(anatomy.chest), down = new THREE.Vector3(0, -1, 0).applyQuaternion(chest);
  return Math.acos(THREE.MathUtils.clamp(P('forearm.' + side).sub(P('upper_arm.' + side)).normalize().dot(down), -1, 1)) * DEG;
};
// Skin: edges of the body mesh whose two ends belong mostly to one side's arm or hand bones.
const body = [...rig.meshes].find(m => /body/i.test(m.name)) || [...rig.meshes][0];console.log('meshes', [...rig.meshes].map(m => m.name + ':' + m.geometry.attributes.position.count).join(' '));
const g = body.geometry, skinIndex = g.attributes.skinIndex, skinWeight = g.attributes.skinWeight, bones = body.skeleton.bones;
const armOf = new Map();
const regionOf = i => {
  let best = -1, w = 0;for (let k = 0; k < 4; k++) { const wk = skinWeight.getComponent(i, k);if (wk > w) { w = wk;best = skinIndex.getComponent(i, k); } }
  const name = bones[best]?.userData.nativeName || bones[best]?.name || '';
  const m = name.match(/^(upper_arm|forearm|hand|f_[a-z]+\.\d+|thumb\.\d+)\.([LR])$/);return m ? m[1].replace(/\.\d+$/, '').replace(/^f_[a-z]+$/, 'finger').replace(/^thumb$/, 'finger') + '.' + m[2] : null;
};
const index = g.index ? g.index.array : null, edges = [], seen = new Set();
const tri = index ? index.length / 3 : g.attributes.position.count / 3;
for (let t = 0; t < tri; t++) for (const [a0, b0] of [[0, 1], [1, 2], [2, 0]]) {
  const a = index ? index[t * 3 + a0] : t * 3 + a0, b = index ? index[t * 3 + b0] : t * 3 + b0, key = a < b ? a + ',' + b : b + ',' + a;
  if (seen.has(key)) continue;seen.add(key);
  const ra = armOf.get(a) ?? (armOf.set(a, regionOf(a)), armOf.get(a)), rb = armOf.get(b) ?? (armOf.set(b, regionOf(b)), armOf.get(b));
  if (ra && rb && ra.slice(-1) === rb.slice(-1)) edges.push([a, b, ra]);
}
const verts = [...new Set(edges.flatMap(([a, b]) => [a, b]))];
const skinned = () => { body.updateMatrixWorld(true);body.skeleton.update();const out = new Map();for (const i of verts) out.set(i, body.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(body.matrixWorld));return out; };
rig.reset?.();rig.root.updateMatrixWorld(true);
const bindPos = skinned(), bindLen = edges.map(([a, b]) => bindPos.get(a).distanceTo(bindPos.get(b)));
console.log(`${gender}: ${edges.length} arm/hand skin edges on ${body.name}`);
for (const spec of moveList.split(',')) {
  const [classId, move] = spec.split(':');
  const motion = new HumGenMotion(rig, descriptors, clips, { classId });
  const idle = move === 'idle', melee = ['attack', 'long_hit'].includes(move), id = idle ? 'idle' : melee ? move : skillMotionId(move), clock = move === 'attack' ? 'light' : move === 'long_hit' ? 'heavy' : move;
  if (!melee && !idle) motion.prepareSkill(id);motion.select(id, { transition: false });
  const r = RULES[clock] ?? { startup: 0, active: 0, recovery: 6 }, T = r.startup + r.active + r.recovery, worst = {};
  const note = (key, value, t, extra = '') => { if (!worst[key] || value > worst[key][0]) worst[key] = [value, t, extra]; };
  for (let f = 0; f <= Math.round(T * 30); f++) {
    const t = Math.min(T, f / 30);motion.sample(idle ? t : gamePlayerMotion({ hp: 20, action: { type: clock, t } }, 0, motion.descriptors).time);rig.root.updateMatrixWorld(true);
    for (const side of ['L', 'R']) {
      note('elbow flex ' + side, elbowFlexion(anatomy, side, by('forearm.' + side).quaternion) * DEG, t);
      note('elbow hyperext ' + side, -elbowFlexion(anatomy, side, by('forearm.' + side).quaternion) * DEG, t);
      note('wrist bend ' + side, wristBend(side), t);
      note('wrist roll ' + side, Math.abs(boneTwist(anatomy, side, 'hand', by('hand.' + side).quaternion)) * DEG, t);
      note('forearm roll ' + side, Math.abs(boneTwist(anatomy, side, 'fore', by('forearm.' + side).quaternion)) * DEG, t);
      note('humerus roll ' + side, Math.abs(boneTwist(anatomy, side, 'upper', by('upper_arm.' + side).quaternion)) * DEG, t);
      note('arm raise ' + side, elevation(side), t);
    }
    const pos = skinned();
    const byRegion = new Map();
    edges.forEach(([a, b, region], k) => { const ratio = pos.get(a).distanceTo(pos.get(b)) / Math.max(1e-6, bindLen[k]);if (!byRegion.has(region)) byRegion.set(region, []);byRegion.get(region).push(ratio); });
    const row = [];
    for (const [region, list] of byRegion) { list.sort((x, y) => x - y);const st = list[Math.floor(list.length * .99)], cr = 1 / list[Math.floor(list.length * .01)];note('stretch99 ' + region, st, t);note('crush99 ' + region, cr, t);if (detail === 'trace' && /\.R$/.test(region) && /upper|fore/.test(region)) row.push(region.split('.')[0].slice(0, 5) + ' s' + st.toFixed(2) + ' c' + cr.toFixed(2)); }
    if (detail === 'trace') console.log(t.toFixed(2), 'raiseR', elevation('R').toFixed(0), 'flexR', (elbowFlexion(anatomy, 'R', by('forearm.R').quaternion) * DEG).toFixed(0), 'humR', (boneTwist(anatomy, 'R', 'upper', by('upper_arm.R').quaternion) * DEG).toFixed(0), 'foreR', (boneTwist(anatomy, 'R', 'fore', by('forearm.R').quaternion) * DEG).toFixed(0), row.join(' '));
  }
  console.log(`== ${classId} ${move}`);
  for (const [key, [v, t]] of Object.entries(worst).sort()) if (detail || !/stretch|crush/.test(key) || v > 1.0) console.log(`  ${key.padEnd(22)} ${v.toFixed(key.startsWith('stretch') || key.startsWith('crush') ? 2 : 0).padStart(6)} at ${t.toFixed(2)} s`);
  motion.dispose();
}
