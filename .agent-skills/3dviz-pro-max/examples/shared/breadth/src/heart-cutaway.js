// heart-cutaway.js - recipe.heart-cutaway under knowledge.style-scientific-encoding.
//
// A schematic four-chamber block, not a segmentation-derived mesh: ellipsoids placed by hand at
// roughly life size (about 126 mm base to apex), cut by one clipping plane and viewed from the
// front, so the patient's left chambers are on the right of frame. What is exact is the encoding.
// Colour is the data channel: ramp position = (pressure - 3) / (120 - 3) mmHg sampled from the
// record's five stops, and the colour bar in frame carries those five stops with their values, so
// a reader can match any chamber to a number without a caption.
import * as THREE from 'three';
import { makeLabel, disposeLabel } from './label-sprite.js';

const RANGE = { low: 3, high: 120 };   // mmHg; atria are means, ventricles peak systolic
const CUT_Z = 0.004;                   // the section plane, and the depth the hairlines sit at
const PARTS = [
  { name: 'RA · right atrium · 5 mmHg', mmHg: 5, at: [-0.024, 0.032], radii: [0.019, 0.017, 0.019], side: -1 },
  { name: 'LA · left atrium · 10 mmHg', mmHg: 10, at: [0.022, 0.032], radii: [0.019, 0.017, 0.019], side: 1 },
  { name: 'RV · right ventricle · 25 mmHg', mmHg: 25, at: [-0.024, -0.020], radii: [0.022, 0.034, 0.022], side: -1 },
  { name: 'LV · left ventricle · 120 mmHg', mmHg: 120, at: [0.024, -0.022], radii: [0.024, 0.036, 0.024], side: 1 }
];
// Great vessels leaving the base: short stubs, enough to say which way the blood goes.
const VESSELS = [{ mmHg: 120, x: 0.014, y: 0.080, radius: 0.009, height: 0.034, tilt: 0.16 },
                 { mmHg: 25, x: -0.014, y: 0.076, radius: 0.009, height: 0.030, tilt: -0.14 }];
const LABEL_X = 0.072, LABEL_H = 0.006;

/** Linear sample of the record's five ramp stops. sRGB interpolation - stated, not hidden. */
function sampleRamp(ramp, t) {
  const clamped = Math.min(1, Math.max(0, t)), span = clamped * (ramp.length - 1);
  const index = Math.min(ramp.length - 2, Math.floor(span));
  return new THREE.Color(ramp[index]).lerp(new THREE.Color(ramp[index + 1]), span - index);
}

const position = mmHg => (mmHg - RANGE.low) / (RANGE.high - RANGE.low);

/** A hairline ellipse in the cut plane: depth separation without borrowing the colour channel. */
function outline(rx, ry, material, at = [0, 0]) {
  const points = new THREE.EllipseCurve(at[0], at[1], rx, ry, 0, Math.PI * 2).getPoints(96)
    .map(point => new THREE.Vector3(point.x, point.y, CUT_Z + 0.0005));
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
}

export function createHeartCutaway(look) {
  const group = new THREE.Group(), materials = [], labels = [];
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), CUT_Z);
  const unlit = options => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, clippingPlanes: [plane],
                                                   ...options });
    materials.push(material);
    return material;
  };
  // The record puts separation on outline weight, not a second hue. Its "1 px darker" line is
  // written for a light page; on the fixed dark neutral the same job needs a light hairline.
  const hairline = new THREE.LineBasicMaterial({ color: look.palette.halo, transparent: true,
                                                 opacity: 0.42 });
  materials.push(hairline);
  const ellipsoid = radii => {
    const geometry = new THREE.SphereGeometry(1, 56, 40);
    geometry.scale(...radii);
    return geometry;
  };

  // Myocardium: outside the encoded range, so it stays the fixed neutral the record specifies.
  const wall = new THREE.Mesh(ellipsoid([0.058, 0.070, 0.045]), unlit({ color: '#343a42' }));
  group.add(wall, outline(0.058, 0.070, hairline));

  for (const part of PARTS) {
    const mesh = new THREE.Mesh(ellipsoid(part.radii),
                                unlit({ color: sampleRamp(look.ramp, position(part.mmHg)) }));
    mesh.position.set(part.at[0], part.at[1], 0);
    const label = makeLabel(part.name, { color: look.palette.label, height: LABEL_H });
    const labelX = part.side * (LABEL_X + label.scale.x / 2);
    label.position.set(labelX, part.at[1], CUT_Z + 0.001);
    const leader = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(part.side * LABEL_X, part.at[1], CUT_Z + 0.001),
      new THREE.Vector3(part.at[0] + part.side * part.radii[0] * 0.75, part.at[1], CUT_Z + 0.001)]),
      hairline);
    group.add(mesh, outline(part.radii[0], part.radii[1], hairline, part.at), label, leader);
    labels.push(label);
  }
  for (const vessel of VESSELS) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(vessel.radius, vessel.radius * 1.15, vessel.height, 32, 1, true),
      unlit({ color: sampleRamp(look.ramp, position(vessel.mmHg)) }));
    mesh.position.set(vessel.x, vessel.y, 0);
    mesh.rotation.z = vessel.tilt;
    group.add(mesh);
  }
  // The atrioventricular plane: two short marks where the valves sit, not modelled leaflets.
  for (const side of [-1, 1]) {
    const marks = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(side * 0.006, 0.0145, CUT_Z + 0.001),
      new THREE.Vector3(side * 0.040, 0.0145, CUT_Z + 0.001)]), hairline);
    group.add(marks);
  }

  // The colour bar: the same five stops the chambers were sampled from, with their mmHg values.
  const bar = new THREE.Group();
  bar.position.set(0, -0.092, CUT_Z + 0.001);
  for (const [index, stop] of look.ramp.entries()) {
    const swatch = new THREE.Mesh(new THREE.PlaneGeometry(0.024, 0.010),
                                  new THREE.MeshBasicMaterial({ color: stop }));
    materials.push(swatch.material);
    swatch.position.x = (index - 2) * 0.025;
    const value = Math.round(RANGE.low + (index / (look.ramp.length - 1)) * (RANGE.high - RANGE.low));
    const tick = makeLabel(`${value}`, { color: look.palette.label, height: LABEL_H });
    tick.position.set(swatch.position.x, -0.013, 0);
    bar.add(swatch, tick);
    labels.push(tick);
  }
  const title = makeLabel('chamber pressure, mmHg', { color: look.palette.label, height: 0.0065 });
  title.position.set(0, 0.013, 0);
  bar.add(title); labels.push(title);
  group.add(bar);

  return {
    group, clippingPlane: plane,
    /** Static plate: a value encoded in colour must hold still to be read against its bar. */
    update() { return false; },
    dispose() {
      group.traverse(object => object.geometry?.dispose());
      for (const sprite of labels) disposeLabel(sprite);
      for (const material of materials) material.dispose();
    }
  };
}
