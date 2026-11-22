// bloch-ball.js - recipe.single-qubit-bloch-ball, drawn under knowledge.style-technical-illustration.
//
// State: r = (rx, ry, rz) with |r| <= 1; rho = (I + r . sigma) / 2. The frame shown is a pure
// state at theta = 55 deg polar from +Z, phi = 35 deg azimuth from +X toward +Y, so |r| = 1.
// Three's up axis is +Y, so the Bloch +Z axis is drawn along +Y and Bloch +Y along -Z; the axis
// labels say which is which, because a silently rotated frame is a wrong plate.
// The ball has radius 1 in state space and is drawn at 1 unit = 1 metre: a Bloch radius is not a
// spatial distance, and nothing in the frame claims it is.
import * as THREE from 'three';
import { makeLabel, disposeLabel } from './label-sprite.js';

const RADIUS = 1;
const STATE = { thetaDeg: 55, phiDeg: 35 };
const SEGMENTS = 128;

/** Bloch (x, y, z) -> three (x, y, z). */
const toWorld = (x, y, z) => new THREE.Vector3(x, z, -y);

function circle(material, axis) {
  const points = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2, c = Math.cos(a) * RADIUS, s = Math.sin(a) * RADIUS;
    points.push(axis === 'z' ? toWorld(c, s, 0)
              : axis === 'x' ? toWorld(0, c, s) : toWorld(c, 0, s));
  }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
}

/** A shaft plus a cone head, both unlit, pointing from origin toward `end`. */
function arrow(end, color, radius, group) {
  const material = new THREE.MeshBasicMaterial({ color });
  const length = end.length(), head = Math.min(0.12, length * 0.16);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length - head, 16),
                               material);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(radius * 2.6, head, 20), material);
  const orient = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0),
                                                           end.clone().normalize());
  shaft.position.copy(end).multiplyScalar((length - head) / 2 / length);
  tip.position.copy(end).multiplyScalar((length - head / 2) / length);
  shaft.quaternion.copy(orient); tip.quaternion.copy(orient);
  group.add(shaft, tip);
  return material;
}

export function createBlochBall(look) {
  const group = new THREE.Group(), materials = [], labels = [];
  const { line, focus, callout, secondary } = look.palette;

  // The ball itself: a faint fill so the interior reads as a volume (mixed states live there),
  // never so strong that it competes with the line work.
  const shell = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 64, 48),
    new THREE.MeshBasicMaterial({ color: focus, transparent: true, opacity: 0.06,
                                  depthWrite: false }));
  group.add(shell); materials.push(shell.material);

  const lineMaterial = new THREE.LineBasicMaterial({ color: line, transparent: true, opacity: 0.55 });
  const faint = new THREE.LineBasicMaterial({ color: secondary });
  materials.push(lineMaterial, faint);
  group.add(circle(lineMaterial, 'z'), circle(faint, 'x'), circle(faint, 'y'));

  // Axes: 1.28 R so the arrow heads clear the sphere and the labels clear the heads.
  for (const [vector, text] of [[toWorld(1.28, 0, 0), '+x'], [toWorld(0, 1.28, 0), '+y'],
                                [toWorld(0, 0, 1.28), '+z  |0>'], [toWorld(0, 0, -1.28), '-z  |1>']]) {
    materials.push(arrow(vector, line, 0.008, group));
    const label = makeLabel(text, { color: line, height: 0.1 });
    label.position.copy(vector).multiplyScalar(1.12);
    group.add(label); labels.push(label);
  }

  // Six computational and superposition basis points, de-emphasised: they are reference, not state.
  const dot = new THREE.MeshBasicMaterial({ color: secondary });
  materials.push(dot);
  for (const point of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), dot);
    mesh.position.copy(toWorld(...point));
    group.add(mesh);
  }

  // The state vector. |r| = 1 here, so this is a pure state and the tip sits on the surface.
  const theta = THREE.MathUtils.degToRad(STATE.thetaDeg), phi = THREE.MathUtils.degToRad(STATE.phiDeg);
  const r = toWorld(Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta));
  materials.push(arrow(r, focus, 0.016, group));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 20, 16),
                             new THREE.MeshBasicMaterial({ color: focus }));
  tip.position.copy(r); group.add(tip); materials.push(tip.material);

  // Polar-angle wedge from +z to r: the angle theta is the quantity, so it is drawn, not written.
  const wedge = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 48, 0, theta),
    new THREE.MeshBasicMaterial({ color: focus, transparent: true, opacity: 0.14,
                                  side: THREE.DoubleSide, depthWrite: false }));
  wedge.quaternion.setFromEuler(new THREE.Euler(0, -THREE.MathUtils.degToRad(STATE.phiDeg + 90), 0));
  wedge.rotateZ(Math.PI / 2);
  group.add(wedge); materials.push(wedge.material);

  // One callout in the annotation hue, never on the focus part itself.
  const leaderEnd = r.clone().multiplyScalar(1.06).add(new THREE.Vector3(0.5, 0.34, 0.16));
  const leader = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([r.clone().multiplyScalar(1.03), leaderEnd]),
    new THREE.LineBasicMaterial({ color: callout }));
  group.add(leader); materials.push(leader.material);
  for (const [index, text] of ['|psi> = cos(t/2)|0> + e^(i p) sin(t/2)|1>',
                               't = 55 deg   p = 35 deg   |r| = 1.00',
                               'purity Tr(rho^2) = 1.00   P(0) = 0.79'].entries()) {
    const label = makeLabel(text, { color: index ? line : callout, height: index ? 0.075 : 0.085 });
    label.position.copy(leaderEnd).add(new THREE.Vector3(label.scale.x / 2, -index * 0.13, 0));
    group.add(label); labels.push(label);
  }

  return {
    group,
    /** Static plate: an instructional figure that drifts is harder to read, not livelier. */
    update() { return false; },
    dispose() {
      group.traverse(object => object.geometry?.dispose());
      for (const label of labels) disposeLabel(label);
      for (const material of materials) material.dispose();
    }
  };
}
