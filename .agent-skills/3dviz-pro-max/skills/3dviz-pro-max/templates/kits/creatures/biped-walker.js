// biped-walker.js - a village figure that walks a route on two legs with counter-swinging arms.
// Detail ladder: standing person silhouette, hat brim and tunic hem / two-joint legs and arms,
//                belt, boots, collar / cuff bands, brow and nose, eye highlights, hem stitching.
// Gait: legs half a cycle apart, each arm counter to the leg on its own side, torso leaning with
// speed. The stance boot follows a cycloid whose ground span equals the body travel of that
// stance, so the planted boot does not slide. The rig starts mid-stride, one boot off the ground,
// because a still of a walker should read as walking. Sockets: harness (belt), head, back.
import { THREE, bevelledBox, collider, footCycle, materialFor, part, routeStep, seeded,
         socket, twoBoneIk } from '../kit-core.js';

const HIP_Y = 0.9, THIGH = 0.44, SHIN = 0.42, BOOT_H = 0.09, START_PHASE = 0.8;
const DUTY = 0.6, LIFT = 0.13, SHOULDER_Y = 0.47, UPPER = 0.29, FORE = 0.28;
const PALETTE = { tunic: '#7a6f9c', trouser: '#4d4c4a', skin: '#d9a97f', boot: '#4a3a2c',
                  belt: '#3a2e24', hood: '#8d5f4c', eye: '#221c18', spark: '#fff6e6' };
/** Cone frustum standing on +Y: limbs, neck and torso all share it. */
function column({ top, bottom, length, radial = 8 }) {
  return new THREE.CylinderGeometry(top, bottom, length, radial, 1);
}
/** Hip -> thigh -> knee -> shin -> boot. The boot is a real block with a proud sole. */
function buildLeg(parent, index, cloth) {
  const side = index === 0 ? 1 : -1;
  const hip = new THREE.Group(), knee = new THREE.Group(), boot = new THREE.Group();
  hip.position.set(side * 0.115, 0, 0); knee.position.y = -THIGH; boot.position.y = -SHIN;
  boot.name = `foot-${index}`; parent.add(hip); hip.add(knee); knee.add(boot);
  hip.add(part(column({ top: 0.085, bottom: 0.065, length: THIGH }), cloth, [0, -THIGH / 2, 0]));
  knee.add(part(column({ top: 0.066, bottom: 0.05, length: SHIN }), cloth, [0, -SHIN / 2, 0]));
  const leather = materialFor(PALETTE.boot, { roughness: 0.48 });
  const sole = materialFor('#2c241d', { roughness: 0.9 });   // a sole standing 2.5 cm proud
  boot.add(part(bevelledBox({ width: 0.11, height: BOOT_H, depth: 0.26, bevel: 0.025 }), leather,
                [0, -BOOT_H / 2 + 0.01, 0.045]));
  boot.add(part(bevelledBox({ width: 0.125, height: 0.025, depth: 0.28, bevel: 0.008 }), sole,
                [0, -BOOT_H + 0.012, 0.045]));
  boot.add(part(column({ top: 0.062, bottom: 0.07, length: 0.11, radial: 7 }), leather,
                [0, 0.045, -0.01]));
  return { hip, knee, boot };
}
/** Shoulder -> upper arm -> elbow -> forearm -> hand, with a cuff band at the wrist. */
function buildArm(torso, index, cloth, skin) {
  const side = index === 0 ? 1 : -1;
  const shoulder = new THREE.Group(), elbow = new THREE.Group();
  shoulder.position.set(side * 0.185, SHOULDER_Y, 0); elbow.position.y = -UPPER;
  torso.add(shoulder); shoulder.add(elbow);
  shoulder.add(part(new THREE.SphereGeometry(0.077, 9, 7), cloth, [0, 0, 0]));   // deltoid
  shoulder.add(part(column({ top: 0.062, bottom: 0.048, length: UPPER }), cloth, [0, -UPPER / 2, 0]));
  elbow.add(part(column({ top: 0.047, bottom: 0.038, length: FORE * 0.62 }), cloth,
                 [0, -FORE * 0.31, 0]));
  elbow.add(part(new THREE.TorusGeometry(0.042, 0.011, 5, 10), materialFor(PALETTE.belt,
                 { roughness: 0.55 }), [0, -FORE * 0.62, 0], [Math.PI / 2, 0, 0]));
  elbow.add(part(column({ top: 0.036, bottom: 0.033, length: FORE * 0.38 }), skin,
                 [0, -FORE * 0.81, 0]));
  const hand = part(bevelledBox({ width: 0.062, height: 0.1, depth: 0.048, bevel: 0.016 }), skin,
                    [0, -FORE - 0.04, 0.01]);
  hand.name = `hand-${index}`;
  elbow.add(hand);
  return { shoulder, elbow };
}
/** Head with a brow ridge, a nose and a hood brim, so a face reads at the detail distance. */
function buildHead(neck, skin) {
  const head = new THREE.Group();
  head.name = 'head'; head.position.y = 0.09; neck.add(head);
  head.add(part(bevelledBox({ width: 0.17, height: 0.21, depth: 0.185, bevel: 0.045 }), skin,
                [0, 0.1, 0]));
  head.add(part(new THREE.SphereGeometry(0.02, 7, 6), skin, [0, 0.085, 0.1]));
  const hood = materialFor(PALETTE.hood, { roughness: 0.82 });
  head.add(part(column({ top: 0.075, bottom: 0.1, length: 0.09, radial: 9 }), hood, [0, 0.2, 0]));
  head.add(part(new THREE.TorusGeometry(0.101, 0.021, 5, 14), hood, [0, 0.158, 0],
                [Math.PI / 2, 0, 0]));
  const dark = materialFor(PALETTE.eye, { roughness: 0.2, metalness: 0.08 });
  const spark = materialFor(PALETTE.spark, { roughness: 0.25 });
  for (const side of [1, -1]) {   // eye and its 6 mm highlight: the finest features on the face
    head.add(part(new THREE.SphereGeometry(0.019, 8, 6), dark, [side * 0.045, 0.108, 0.086]));
    head.add(part(new THREE.SphereGeometry(0.006, 5, 4), spark, [side * 0.04, 0.12, 0.098]));
  }
  return head;
}
export function create({ scale = 1, strideM = 0.72, strideHz = 0.95, speed = 0, seed = 1,
                         tunic = PALETTE.tunic, yawRateRad = 2.4 } = {}) {
  const group = new THREE.Group(), rig = new THREE.Group(), body = new THREE.Group();
  const hips = new THREE.Group(), torso = new THREE.Group();
  rig.scale.setScalar(scale); hips.position.y = HIP_Y;
  group.add(rig); rig.add(body); body.add(hips); hips.add(torso);
  const random = seeded(seed);
  const cloth = materialFor(tunic, { roughness: 0.88 });
  const trouser = materialFor(PALETTE.trouser, { roughness: 0.92 });
  const skin = materialFor(PALETTE.skin, { roughness: 0.62 });
  // Silhouette band: tapering torso, shoulders wider than hips, hat breaking the head line.
  const wear = (geometry, at) => torso.add(part(geometry, cloth, at));
  wear(column({ top: 0.155, bottom: 0.125, length: 0.27, radial: 9 }), [0, 0.145, 0]);
  wear(column({ top: 0.185, bottom: 0.16, length: 0.24, radial: 9 }), [0, 0.38, 0]);
  wear(bevelledBox({ width: 0.24, height: 0.055, depth: 0.17, bevel: 0.025 }), [0, 0.475, 0]);
  torso.add(part(bevelledBox({ width: 0.29, height: 0.05, depth: 0.235, bevel: 0.02 }),
                 materialFor(PALETTE.belt, { roughness: 0.5, metalness: 0.15 }), [0, 0.03, 0]));
  torso.add(part(bevelledBox({ width: 0.06, height: 0.055, depth: 0.03, bevel: 0.01 }),
                 materialFor('#c9a24b', { roughness: 0.35, metalness: 0.55 }), [0, 0.03, 0.122]));
  const neck = new THREE.Group();  neck.position.y = 0.5;  torso.add(neck);
  neck.add(part(column({ top: 0.05, bottom: 0.068, length: 0.08, radial: 7 }), skin, [0, 0.03, 0]));
  const head = buildHead(neck, skin);
  const legs = [buildLeg(hips, 0, trouser), buildLeg(hips, 1, trouser)];
  const arms = [buildArm(torso, 0, cloth, skin), buildArm(torso, 1, cloth, skin)];
  const stitch = materialFor('#ded4c0', { roughness: 0.7 });
  for (let i = 0; i < 14; i++) {          // fine band: hem stitches round the skirt, seed-jittered
    const a = (i / 14) * Math.PI * 2 + random() * 0.05;
    torso.add(part(new THREE.SphereGeometry(0.009, 5, 4), stitch,
                   [Math.sin(a) * 0.128, 0.022, Math.cos(a) * 0.128]));
  }
  const cruise = strideM * strideHz * scale;
  const state = { phase: START_PHASE, time: 0, position: [0, 0, 0], heading: 0, distance: 0,
                  waypoint: 0, speed: speed > 0 ? speed : cruise, route: null, loop: false,
                  moving: true };
  /** Every visible degree of freedom is a pure function of phase, so a pose is reproducible. */
  function pose() {
    const bob = 0.026 * Math.cos(4 * Math.PI * state.phase);
    const drive = Math.min(1, state.speed / Math.max(cruise, 1e-6));
    hips.position.y = HIP_Y + bob;
    torso.rotation.x = 0.11 * drive;
    hips.rotation.y = Math.sin(2 * Math.PI * state.phase) * 0.06 * drive;
    legs.forEach((leg, index) => {
      const [dz, lift] = footCycle(state.phase + index * 0.5, strideM * DUTY, DUTY, LIFT);
      const [thigh, knee] = twoBoneIk(dz, BOOT_H + lift - HIP_Y - bob, THIGH, SHIN, -1);
      leg.hip.rotation.x = thigh; leg.knee.rotation.x = knee;
      leg.boot.rotation.x = -(thigh + knee) + (lift / LIFT) * 0.3;    // sole flat, then toe roll
    });
    arms.forEach((arm, index) => {
      const swing = Math.sin(2 * Math.PI * (state.phase + index * 0.5));
      arm.shoulder.rotation.x = swing * 0.5 * drive;       // counter to the leg on the same side
      arm.shoulder.rotation.z = (index === 0 ? 1 : -1) * 0.09;
      arm.elbow.rotation.x = -0.28 - Math.max(0, -swing) * 0.35 * drive;
    });
    head.rotation.x = -0.09 * drive + Math.sin(4 * Math.PI * state.phase) * 0.02;
    head.rotation.y = Math.sin(state.time * 0.6) * 0.12;        // an idle look around
    group.position.set(...state.position); group.rotation.y = state.heading;
  }
  /** Points may be [x, z] or [x, y, z]; a lane polyline from village-layout.js drops straight in. */
  function setRoute(points, loop = false) {
    const route = (points ?? []).map(p => (p.length > 2 ? [p[0], p[2]] : [p[0], p[1]]));
    Object.assign(state, { route, loop, moving: route.length > 1,
                           waypoint: Math.min(1, route.length - 1) });
    if (route.length) state.position = [route[0][0], 0, route[0][1]];
    if (route.length > 1) {
      state.heading = Math.atan2(route[1][0] - route[0][0], route[1][1] - route[0][1]);
    }
    pose();
    return state;
  }
  /** kit-core's routeStep turns towards the waypoint and walks; this module only poses. */
  function animate(dt, override = null) {
    if (!routeStep(state, dt, { yawRateRad, strideM: strideM * scale, arrival: 0.12 * scale,
                                speed: override })) return false;
    pose();
    return true;
  }
  // Sockets come off the rig's rest pose, so re-proportioning cannot falsify the record.
  // `harness` is the belt and leads the list: the proof harness aims its detail view at sockets[0]
  // lifted by 0.35 of the figure's height, and from the belt that lands on the face.
  rig.updateMatrixWorld(true);
  const at = (n, x, y, z) => n.localToWorld(new THREE.Vector3(x, y, z)).toArray()
    .map(v => Math.round(v * 1000) / 1000);
  const sockets = [socket('harness', at(torso, 0, 0.05, 0.15), [0, 0, 1]),
                   socket('head', at(head, 0, 0.26, 0), [0, 1, 0]),
                   socket('back', at(torso, 0, 0.42, -0.14), [0, 0, -1])];
  const box = v => v.map(value => value * scale);
  const colliders = [collider('torso', box([0, 1.28, 0]), box([0.42, 0.66, 0.3])),
                     collider('legs', box([0, 0.45, 0]), box([0.34, 0.9, 0.3]))];
  pose();                        // the rig is delivered mid-stride, not in its rest pose
  return { group, sockets, colliders, animate, setRoute, state };
}
