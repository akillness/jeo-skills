// coupled-gears.js - recipe.coupled-gears under knowledge.style-stylized-realism lit by
// knowledge.lighting-mood-dark-studio-product.
//
// Two spur gears on fixed shafts: 24 and 16 teeth, module 10 mm, so pitch radii are 0.12 m and
// 0.08 m and the centre distance is exactly 0.20 m. The ratio is enforced in the update, not
// eyeballed: omega2 = -omega1 * N1 / N2, which enforces the angular speed ratio.
// The tooth flank is a straight trapezoid, not an involute - contact is not solved at this ratio
// and reads correctly at this size, and design-system.md says so rather than implying more.
import * as THREE from 'three';
import { makeLabel, disposeLabel } from './label-sprite.js';

const MODULE_M = 0.01, TEETH = { drive: 24, driven: 16 };
const THICKNESS = 0.03, BORE = 0.014, OMEGA = 0.9;   // rad/s on the drive gear
const TOOTH = [[0.16, 0], [0.30, 1], [0.54, 1], [0.68, 0]];   // [fraction of pitch, tip flag]

/** One gear plate: extruded trapezoidal teeth around a bored disc. */
function gearGeometry(teeth, crafted = false) {
  const pitch = (Math.PI * 2) / teeth;
  const root = (MODULE_M * teeth) / 2 - 1.25 * MODULE_M;
  const tip = (MODULE_M * teeth) / 2 + MODULE_M;
  const shape = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {
    const base = i * pitch;
    const at = (fraction, radius) => [Math.cos(base + fraction * pitch) * radius,
                                      Math.sin(base + fraction * pitch) * radius];
    if (i === 0) shape.moveTo(...at(0, root)); else shape.lineTo(...at(0, root));
    for (const [fraction, isTip] of TOOTH) shape.lineTo(...at(fraction, isTip ? tip : root));
  }
  shape.closePath();
  shape.holes.push(new THREE.Path().absarc(0, 0, BORE, 0, Math.PI * 2, true));
  if (crafted) {
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      shape.holes.push(new THREE.Path().absarc(Math.cos(a) * root * .58,
        Math.sin(a) * root * .58, root * .205, 0, Math.PI * 2, true));
    }
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: THICKNESS, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015,
    bevelSegments: 2, curveSegments: 24
  });
  geometry.translate(0, 0, -THICKNESS / 2);
  geometry.computeVertexNormals();
  return geometry;
}

export function createCoupledGears(look, { crafted = false } = {}) {
  const group = new THREE.Group(), materials = [], labels = [];
  const { steel, brass, plate, shaft } = look.palette;
  const metal = colour => new THREE.MeshStandardMaterial({
    color: colour, metalness: 1, roughness: look.materials.metalRoughness });
  const drive = new THREE.Mesh(gearGeometry(TEETH.drive, crafted), metal(steel));
  const driven = new THREE.Mesh(gearGeometry(TEETH.driven, crafted), metal(brass));
  materials.push(drive.material, driven.material);
  const pitchDrive = (Math.PI * 2) / TEETH.drive, pitchDriven = (Math.PI * 2) / TEETH.driven;
  // Phase so a drive tooth points at the driven gear's gap along the line of centres; the ratio
  // then keeps them meshed without any per-frame correction.
  const phase = { drive: -0.42 * pitchDrive, driven: Math.PI - 0.84 * pitchDriven };
  drive.position.set(-0.10, 0.16, 0);
  driven.position.set(0.10, 0.16, 0);

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.016, 0.16),
    new THREE.MeshStandardMaterial({ color: plate, metalness: 0,
                                     roughness: look.materials.plateRoughness }));
  base.position.set(0, -0.008, -0.02);
  materials.push(base.material);
  const post = new THREE.MeshStandardMaterial({ color: shaft, metalness: 1, roughness: 0.28 });
  materials.push(post);
  for (const gear of [drive, driven]) {
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 20), post);
    column.position.set(gear.position.x, 0.08, -0.035);
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(BORE * 0.92, BORE * 0.92, 0.075, 20),
                                post);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(gear.position.x, gear.position.y, -0.014);
    column.castShadow = axle.castShadow = true;
    group.add(column, axle);
  }
  for (const mesh of [drive, driven, base]) { mesh.castShadow = true; mesh.receiveShadow = true; }
  group.add(drive, driven, base);

  // Stated dimensions in frame: a product shot without a scale cue is a shape, not an object.
  const label = makeLabel('24 T / 16 T  ·  module 10 mm  ·  centre distance 200 mm  ·  ratio 3:2',
                          { color: '#c8ced6', height: 0.013 });
  label.position.set(0, 0.302, 0.02);
  group.add(label); labels.push(label);

  if (crafted) {
    const finish = new THREE.MeshStandardMaterial({color:'#b8bfc5',metalness:.93,roughness:.23});
    const dark = new THREE.MeshStandardMaterial({color:'#25333d',metalness:.72,roughness:.36});
    materials.push(finish, dark);
    function part(geometry, material, parent, x, y, z) {
      const m = new THREE.Mesh(geometry, material); m.position.set(x,y,z);
      m.castShadow = m.receiveShadow = true; parent.add(m); return m;
    }
    for (const [gear, teeth] of [[drive,TEETH.drive],[driven,TEETH.driven]]) {
      const r = MODULE_M * teeth / 2;
      for (const face of [-1,1]) {
        for (let i = 0; i < 3; i++)
          part(new THREE.TorusGeometry(r-.018-i*.0024,.0008,8,80),finish,gear,0,0,face*.017);
        const hub = part(new THREE.CylinderGeometry(.027,.027,.013,48),finish,gear,0,0,face*.021);
        hub.rotation.x = Math.PI/2;
        for (let i = 0; i < 6; i++) {
          const a = i*Math.PI/3;
          const bolt = part(new THREE.CylinderGeometry(.0028,.0028,.0025,6),dark,gear,
            .02*Math.cos(a),.02*Math.sin(a),face*.029);
          bolt.rotation.x = Math.PI/2;
        }
      }
      const bearing = part(new THREE.CylinderGeometry(.036,.036,.022,48),dark,group,
        gear.position.x,gear.position.y,-.05); bearing.rotation.x=Math.PI/2;
      part(new THREE.BoxGeometry(.064,.13,.032),dark,group,gear.position.x,.065,-.057);
      part(new THREE.BoxGeometry(.09,.012,.085),finish,group,gear.position.x,.006,-.043);
      for (const dx of [-.033,.033]) for (const dz of [-.026,.026])
        part(new THREE.CylinderGeometry(.004,.004,.004,6),dark,group,gear.position.x+dx,.014,-.043+dz);
    }
  }
  drive.rotation.z = phase.drive; driven.rotation.z = phase.driven;
  let time = 0;
  return {
    group,
    /** @returns {boolean} always true: this exhibit is the moving one. */
    update(dt) {
      if (dt <= 0) return false;
      time += dt;
      drive.rotation.z = phase.drive + OMEGA * time;
      driven.rotation.z = phase.driven - OMEGA * time * (TEETH.drive / TEETH.driven);
      return true;
    },
    dispose() {
      group.traverse(object => object.geometry?.dispose());
      for (const sprite of labels) disposeLabel(sprite);
      for (const material of materials) material.dispose();
    }
  };
}
