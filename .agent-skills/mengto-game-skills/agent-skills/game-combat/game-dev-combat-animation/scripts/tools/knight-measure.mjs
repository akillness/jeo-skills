// Knight strike measurements against docs/combat-animation-standard.md (rules 1, 2, 6, 7, 9).
//   node .dream-loop/moves/knight-measure.mjs [male|female] [attack,long_hit] [every]
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HumGenRig } from '../../src/player-native/humgen-rig.mjs';
import { HumGenMotion } from '../../src/player-native/humgen-motion.mjs';
import { createEquipmentGrips } from '../../src/player-equipment-grips.js';
import { shieldMountPosition, shieldFace } from '../../src/shield-mount.js';
import { gamePlayerMotion } from '../../src/game-player.js';
import { RULES } from '../../src/combat-rules.js';
import { json, buffer } from '../../tests/helpers/native-equipment.js';
const [gender = 'male', ids = 'attack,long_hit', every = '3'] = process.argv.slice(2);
const c = json('catalog.json').characters[gender], rig = new HumGenRig(json(c.rig), buffer(c.skinWeights));
const descriptors = json(c.motions).clips, clips = await Promise.all(descriptors.map(async d => (await new GLTFLoader().parseAsync(buffer(d.file), '')).animations[0]));
const motion = new HumGenMotion(rig, descriptors, clips, { classId: 'knight' }), grips = createEquipmentGrips(rig, { classId: 'knight' });
const bone = n => rig.byName.get(n), P = n => bone(n).getWorldPosition(new THREE.Vector3()), W = n => bone(n).getWorldQuaternion(new THREE.Quaternion());
motion.select('idle', { transition: false });motion.sample(0);const size = P('head').y / 1.56;
const gripFrame = side => new THREE.Matrix4().compose(grips.centers.get(side), grips.orientations.get(side), new THREE.Vector3(1, 1, 1)).premultiply(bone('hand.' + side).matrixWorld);
const seg = new THREE.Line3(), tmp = new THREE.Vector3();
for (const id of ids.split(',')) {
  const type = id === 'long_hit' ? 'heavy' : 'light', r = RULES[type], S = r.startup, T = S + r.active + r.recovery;
  motion.select(id, { transition: false });
  globalThis.__face = Infinity;const rows = [];let minHead = Infinity, minTip = Infinity, through = 0, behind = 0, yawMin = Infinity, yawMax = -Infinity, prevTip = null, peak = [0, 0];
  for (let i = 0; i <= Math.round(T * 60); i++) {
    const t = Math.min(T, i / 60);motion.sample(gamePlayerMotion({ hp: 20, action: { type, t } }, 0, motion.descriptors).time);
    const g = gripFrame('R'), base = new THREE.Vector3(0, .225, 0).applyMatrix4(g), tip = new THREE.Vector3(0, 1.18, 0).applyMatrix4(g);
    const head = new THREE.Vector3(0, .09 * size, .03 * size).applyQuaternion(W('head')).add(P('head'));
    const fist = new THREE.Vector3().setFromMatrixPosition(g);
    seg.set(base, tip);const headGap = seg.closestPointToPoint(head, true, tmp).distanceTo(head) - .11 * size;
    // Seen from the front (the Characters camera looks along -Z): the part of the blade in front of the face, against the face disc.
    let face2d = Infinity;const faceAt = P('head').add(new THREE.Vector3(0, .08 * size, .08 * size));for (let k = 0; k <= 20; k++) { const q = fist.clone().lerp(tip, k / 20);if (q.z > faceAt.z) face2d = Math.min(face2d, Math.hypot(q.x - faceAt.x, q.y - faceAt.y) - .1 * size); }
    globalThis.__face = Math.min(globalThis.__face ?? Infinity, face2d);if (face2d < .05) rows.push(`  FRONT-FACE overlap at ${t.toFixed(3)} (${(face2d * 100).toFixed(0)} cm)`);
    const sg = gripFrame('L'), board = shieldMountPosition().applyMatrix4(sg), face = shieldFace().transformDirection(sg);
    // Blade through the board disc (radius .24), and the sword fist behind the board.
    const d0 = base.clone().sub(board).dot(face), d1 = tip.clone().sub(board).dot(face);
    let pierce = false;
    if (d0 * d1 < 0) { const hit = base.clone().lerp(tip, d0 / (d0 - d1));pierce = hit.distanceTo(board) < .24; }
    if ([S * .7, S * .8, S].some(x => Math.abs(t - x) < 1 / 120)) console.log(`   board face at ${t.toFixed(3)}: ${face.toArray().map(v => v.toFixed(2))}`);
    const fd = fist.clone().sub(board).dot(face), lateral = fist.clone().sub(board).addScaledVector(face, -fd).length();
    const hidden = fd < 0 && fd > -.25 && lateral < .22;
    if (!globalThis.__yaw0 || i === 0) globalThis.__yaw0 = W('spine');const yaw = new THREE.Euler().setFromQuaternion(W('spine').multiply(globalThis.__yaw0.clone().invert()), 'YXZ').y;yawMin = Math.min(yawMin, yaw);yawMax = Math.max(yawMax, yaw);
    minHead = Math.min(minHead, headGap);minTip = Math.min(minTip, tip.y);if (pierce) through++;if (hidden) behind++;
    if (prevTip) { const v = tip.distanceTo(prevTip) * 60;if (v > peak[0]) peak = [v, t]; }prevTip = tip.clone();
    if (i % +every === 0 || pierce || hidden || headGap < .08) rows.push(`${t.toFixed(3)} head ${(headGap * 100).toFixed(0)}cm tip.y ${tip.y.toFixed(2)} fist ${fist.toArray().map(v => v.toFixed(2))} ${pierce ? 'PIERCE ' : ''}${hidden ? 'BEHIND ' : ''}yaw ${(yaw * 57.3).toFixed(0)}`);
  }
  console.log(`== ${gender} ${id}: face(front) min ${((globalThis.__face ?? 0) * 100).toFixed(0)} cm, head min ${(minHead * 100).toFixed(1)} cm, tip min ${minTip.toFixed(2)} m, board pierced ${through} frames, fist behind board ${behind} frames, pelvis turn ${((yawMax - yawMin) * 57.3).toFixed(0)} deg, tip peak ${peak[0].toFixed(1)} m/s at ${peak[1].toFixed(3)} (contact ${S})`);
  if (+every > 0) console.log(rows.join('\n'));
}
