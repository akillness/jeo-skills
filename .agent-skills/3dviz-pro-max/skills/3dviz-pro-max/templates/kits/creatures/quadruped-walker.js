// quadruped-walker.js - a four-legged village animal that walks a route procedurally.
// Detail ladder: barrel body, arched neck and tail silhouette / three-segment legs, muzzle, ears
//                and horns / hoof splits, eye highlights, nostril dots, per-seed coat jitter.
// Gait: diagonal pairs, offsets [0, 0.5, 0.5, 0]. The stance foot follows a cycloid whose ground
// span equals the body travel of that stance, so the planted hoof holds its world position while
// the body bobs at twice the stride rate. No clip data. Sockets: harness, head, back.
import { THREE, bevelledBox, collider, footCycle, materialFor, part, routeStep, seeded,
         socket, twoBoneIk } from '../kit-core.js';

const HIP_Y = 0.62, THIGH = 0.34, SHIN = 0.32, HOOF_H = 0.08;
const NECK_LEAN = 0.42, EAR_PITCH = -0.15, TAIL_LIFT = 0.8;
const DUTY = 0.62, LIFT = 0.1, OFFSETS = [0, 0.5, 0.5, 0];   // front-l, front-r, rear-l, rear-r
const START_PHASE = 0.78;   // a still of the rig is mid-stride: one diagonal pair off the ground
const LEGS = [[0.155, 0.34, 1], [-0.155, 0.34, 1], [0.15, -0.33, -1], [-0.15, -0.33, -1]];
const PALETTE = { coat: '#b39a78', belly: '#ded0b6', hoof: '#332c26', horn: '#e2d3ae',
                  nose: '#6b504a', eye: '#1d1916', spark: '#fff6e2' };

/** Cone frustum on +Y for limbs, neck, ears, horns, tail; along +Z when `flat` (trunk, muzzle). */
function cone({ top, bottom, length, radial = 8, flat = false }) {
  const geometry = new THREE.CylinderGeometry(top, bottom, length, radial, 1);
  if (flat) geometry.rotateX(Math.PI / 2);
  return geometry;
}
/** Every material the animal wears, in one place: five distinct roughness bands. */
function palette(coat) {
  const m = (color, roughness, metalness = 0) => materialFor(color, { roughness, metalness });
  return { hide: m(coat, 0.86), pale: m(PALETTE.belly, 0.9), hoof: m(PALETTE.hoof, 0.42, 0.05),
           nose: m(PALETTE.nose, 0.34), horn: m(PALETTE.horn, 0.58),
           eye: m(PALETTE.eye, 0.18, 0.1), spark: m(PALETTE.spark, 0.25) };
}
/** Hip -> thigh -> knee -> shin -> hoof, built once and posed every frame by rotation alone. */
function buildLeg(body, index, random, { hide, hoof }) {
  const [x, z, bend] = LEGS[index];
  const hip = new THREE.Group(), knee = new THREE.Group(), foot = new THREE.Group();
  hip.position.set(x, HIP_Y, z); knee.position.y = -THIGH; foot.position.y = -SHIN;
  foot.name = `hoof-${index}`; body.add(hip); hip.add(knee); knee.add(foot);
  hip.add(part(cone({ top: 0.062, bottom: 0.048, length: THIGH }), hide, [0, -THIGH / 2, 0]));
  knee.add(part(cone({ top: 0.045, bottom: 0.031, length: SHIN }), hide, [0, -SHIN / 2, 0]));
  knee.add(part(new THREE.SphereGeometry(0.038, 8, 6), hide, [0, -SHIN + 0.02, 0]));  // fetlock
  for (const side of [1, -1]) {   // a split hoof: the smallest authored feature, ~3.6 cm across
    foot.add(part(bevelledBox({ width: 0.036, height: HOOF_H, depth: 0.1, bevel: 0.012 }), hoof,
                  [side * 0.021, -HOOF_H / 2, 0.012 + random() * 0.004]));
  }
  return { hip, knee, foot, bend };
}
/** One ear: two flattened cones - an outer shell and a pale inner one - off the skull side. */
function buildEar(head, side, random, hide, pale) {
  const ear = new THREE.Group();
  ear.position.set(side * 0.088, 0.055, -0.05);
  ear.rotation.set(EAR_PITCH, 0, side * 1.15 + (random() - 0.5) * 0.12);
  head.add(ear);
  for (const [top, bottom, length, material, z] of [[0.014, 0.062, 0.15, hide, 0],
                                                    [0.009, 0.04, 0.11, pale, 0.012]]) {
    const shell = cone({ top, bottom, length, radial: 6 });
    shell.scale(1, 1, 0.45);                                    // flattened: an ear, not a spike
    ear.add(part(shell, material, [0, 0.058, z]));
  }
  return ear;
}
/** Skull, muzzle, ears, horns and eyes as one group so the neck can nod the whole head. */
function buildHead(neck, random, { hide, pale, nose, horn, eye, spark }) {
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.3, 0.02);
  neck.add(head);
  const skull = bevelledBox({ width: 0.17, height: 0.18, depth: 0.21, bevel: 0.035 });
  head.add(part(skull, hide, [0, 0.03, 0.02]));
  head.add(part(cone({ top: 0.055, bottom: 0.075, length: 0.17, radial: 9, flat: true }), pale,
                [0, -0.035, 0.19]));
  head.add(part(new THREE.SphereGeometry(0.05, 9, 7), nose, [0, -0.032, 0.27]));
  const ears = [];
  for (const side of [1, -1]) {   // eye, its 7 mm highlight, a nostril dot: the finest features
    for (const [r, w, h, material, at] of [[0.024, 9, 7, eye, [0.072, 0.05, 0.104]],
                                           [0.007, 6, 5, spark, [0.064, 0.064, 0.121]],
                                           [0.011, 6, 5, nose, [0.022, -0.058, 0.3]]]) {
      head.add(part(new THREE.SphereGeometry(r, w, h), material, [side * at[0], at[1], at[2]]));
    }
    ears.push(buildEar(head, side, random, hide, pale));
    const spike = new THREE.Group();
    spike.position.set(side * 0.05, 0.115, -0.02); spike.rotation.set(-0.95, 0, side * 0.3);
    head.add(spike);
    spike.add(part(cone({ top: 0.008, bottom: 0.026, length: 0.14, radial: 6 }), horn, [0, 0.07, 0]));
    for (let ring = 0; ring < 3; ring++) {                    // fine band: horn growth rings
      spike.add(part(new THREE.TorusGeometry(0.021 - ring * 0.004, 0.0038, 4, 8), horn,
                     [0, 0.024 + ring * 0.028, 0], [Math.PI / 2, 0, 0]));
    }
  }
  return { head, ears };
}

export function create({ scale = 1, strideM = 0.62, strideHz = 1.1, speed = 0, seed = 1,
                         coat = PALETTE.coat, yawRateRad = 1.8 } = {}) {
  const group = new THREE.Group(), rig = new THREE.Group(), body = new THREE.Group();
  rig.scale.setScalar(scale);
  group.add(rig); rig.add(body);
  const random = seeded(seed);
  const skin = palette(coat), { hide, pale } = skin;   // silhouette band follows: trunk, neck, tail
  body.add(part(cone({ top: 0.2, bottom: 0.17, length: 0.78, radial: 9, flat: true }), hide,
                [0, HIP_Y + 0.06, 0.02]));
  body.add(part(new THREE.SphereGeometry(0.215, 10, 8), hide, [0, HIP_Y + 0.05, 0.31]));
  body.add(part(new THREE.SphereGeometry(0.195, 10, 8), hide, [0, HIP_Y + 0.04, -0.3]));
  body.add(part(new THREE.SphereGeometry(0.17, 9, 7), pale, [0, HIP_Y - 0.07, 0.02]));
  const neck = new THREE.Group(), tail = new THREE.Group();
  neck.position.set(0, HIP_Y + 0.16, 0.4); neck.rotation.x = NECK_LEAN; body.add(neck);
  tail.position.set(0, HIP_Y + 0.13, -0.44); tail.rotation.x = TAIL_LIFT; body.add(tail);
  neck.add(part(cone({ top: 0.085, bottom: 0.13, length: 0.34, radial: 9 }), hide, [0, 0.14, 0]));
  tail.add(part(cone({ top: 0.016, bottom: 0.038, length: 0.3, radial: 6 }), hide, [0, 0.14, 0]));
  tail.add(part(new THREE.SphereGeometry(0.036, 8, 6), pale, [0, 0.3, 0]));
  const { head, ears } = buildHead(neck, random, skin);
  const legs = LEGS.map((_, index) => buildLeg(body, index, random, skin));
  const cruise = strideM * strideHz * scale;
  const state = { phase: START_PHASE, time: 0, position: [0, 0, 0], heading: 0, distance: 0, waypoint: 0,
                  speed: speed > 0 ? speed : cruise, route: null, loop: false, moving: true };

  /** Every visible degree of freedom is a pure function of phase, so a pose is reproducible. */
  function pose() {
    const bob = 0.022 * Math.cos(4 * Math.PI * state.phase);
    const drive = Math.min(1, state.speed / Math.max(cruise, 1e-6));
    const beat = 2 * Math.PI * state.phase;
    body.position.y = bob;
    legs.forEach((leg, index) => {
      const [dz, lift] = footCycle(state.phase + OFFSETS[index], strideM * DUTY, DUTY, LIFT);
      const [thigh, knee] = twoBoneIk(dz, HOOF_H + lift - HIP_Y - bob, THIGH, SHIN, leg.bend);
      leg.hip.rotation.x = thigh; leg.knee.rotation.x = knee;
      leg.foot.rotation.x = -(thigh + knee) + (lift / LIFT) * 0.32;   // ankle: flat, then toe roll
    });
    neck.rotation.x = NECK_LEAN + Math.sin(beat) * 0.05 * drive;
    head.rotation.x = Math.sin(beat + 0.9) * 0.07 * drive;
    tail.rotation.y = Math.sin(beat * 0.5) * 0.28 * drive;
    tail.rotation.x = TAIL_LIFT - Math.sin(2 * beat) * 0.06;
    ears.forEach((e, i) => { e.rotation.x = EAR_PITCH + Math.sin(state.time * 1.7 + i) * 0.09; });
    group.position.set(...state.position); group.rotation.y = state.heading;
  }
  /** Points may be [x, z] or [x, y, z]; the walker only ever uses the ground plane. */
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
  // `harness` leads: the proof harness aims its detail view at sockets[0] lifted by 0.35 of the
  // model height, and from the chest that lands on the head.
  rig.updateMatrixWorld(true);
  const at = (n, x, y, z) => n.localToWorld(new THREE.Vector3(x, y, z)).toArray()
    .map(v => Math.round(v * 1000) / 1000);
  const sockets = [socket('harness', at(body, 0, HIP_Y + 0.02, 0.44), [0, 0, 1]),
                   socket('head', at(head, 0, 0.15, 0.02), [0, 1, 0]),
                   socket('back', at(body, 0, HIP_Y + 0.26, -0.06), [0, 1, 0])];
  const box = v => v.map(value => value * scale);
  const colliders = [collider('trunk', box([0, 0.68, 0]), box([0.44, 0.44, 0.92])),
                     collider('head', box([0, 1.0, 0.52]), box([0.24, 0.3, 0.34]))];
  pose();                        // the rig is delivered mid-stride, not in its rest pose
  return { group, sockets, colliders, animate, setRoute, state };
}
