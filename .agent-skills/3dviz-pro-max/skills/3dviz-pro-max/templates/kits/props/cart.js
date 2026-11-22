// cart.js - a two-wheeled farm cart with spoked wheels, a planked bed and draught shafts.
// Detail ladder: wheel discs + shaft line breaking the box of the bed, tilted prop leg
//                / eight spokes and a hub per wheel, planked bed with gaps, side stanchions
//                / iron tyre band, hub caps, nail heads, 1 cm bevels, per-plank hue jitter.
// Sockets: bed (load surface), yoke (shaft ends), axle (hub centre), tail (rear board).
// animate(dt) rolls the wheels for a cart being pulled; it returns false when dt <= 0.
import { THREE, bevelledBox, collider, materialFor, part, scatterInstances,
         seeded, socket } from '../kit-core.js';

const PALETTE = { plank: '#a57f52', frame: '#6f5334', iron: '#33333a', hub: '#5d4529' };

/** One wheel: felloe ring, iron tyre, hub, cap and eight tapered spokes, built in the XY
 *  plane so the group's own +Z is the axle and animate() only ever touches rotation.z. */
function wheel(radius, random) {
  const group = new THREE.Group();
  const felloe = new THREE.TorusGeometry(radius - 0.055, 0.055, 5, 20);
  group.add(part(felloe, materialFor(PALETTE.hub, { roughness: 0.8 })));
  const tyre = new THREE.TorusGeometry(radius, 0.024, 4, 24);
  group.add(part(tyre, materialFor(PALETTE.iron, { roughness: 0.44, metalness: 0.72 })));
  const hubGeometry = new THREE.CylinderGeometry(0.085, 0.075, 0.19, 10);
  hubGeometry.rotateX(Math.PI / 2);
  group.add(part(hubGeometry, materialFor(PALETTE.hub, { roughness: 0.66 })));
  const spoke = bevelledBox({ width: 0.05, height: radius - 0.13, depth: 0.045, bevel: 0.011 });
  spoke.translate(0, (radius - 0.13) / 2 + 0.06, 0);
  const wood = materialFor(PALETTE.frame, { roughness: 0.72 });
  const placements = [];
  for (let i = 0; i < 8; i++) {
    placements.push({ position: [0, 0, 0], rotation: [0, 0, (i / 8) * Math.PI * 2],
                      hue: (random() - 0.5) * 0.05 });
  }
  group.add(scatterInstances(spoke, wood, placements));
  const cap = new THREE.SphereGeometry(0.055, 8, 5);
  group.add(part(cap, materialFor(PALETTE.iron, { roughness: 0.38, metalness: 0.7 }),
                 [0, 0, 0.105]));
  return group;
}

/** Planked bed with 1 cm gaps and a chamfered edge rail on each long side. */
function bed(group, nails, { width, depth, y, planks, random }) {
  const wood = materialFor(PALETTE.plank, { roughness: 0.83 });
  const gap = 0.012;
  const w = (depth - (planks + 1) * gap) / planks;
  for (let i = 0; i < planks; i++) {
    const z = -depth / 2 + gap + w / 2 + i * (w + gap);
    group.add(part(bevelledBox({ width, height: 0.035, depth: w, bevel: 0.008 }), wood,
                   [0, y + (random() - 0.5) * 0.004, z]));
    for (const sx of [-1, 1]) nails.push({ position: [sx * (width / 2 - 0.07), y + 0.021, z] });
  }
  const rail = materialFor(PALETTE.frame, { roughness: 0.7 });
  for (const sz of [1, -1]) {
    group.add(part(bevelledBox({ width: width + 0.04, height: 0.055, depth: 0.05, bevel: 0.012 }),
                   rail, [0, y + 0.045, sz * (depth / 2 + 0.02)]));
  }
  for (const sx of [1, -1]) {
    group.add(part(bevelledBox({ width: 0.05, height: 0.055, depth: depth + 0.1, bevel: 0.012 }),
                   rail, [sx * (width / 2 + 0.02), y + 0.045, 0]));
  }
}

/** Side stanchions and the two boards that keep a load on the bed. */
function sides(group, { width, depth, y, height }) {
  const wood = materialFor(PALETTE.frame, { roughness: 0.7 });
  for (const sz of [1, -1]) {
    for (const x of [-width * 0.32, 0, width * 0.32]) {
      group.add(part(bevelledBox({ width: 0.05, height, depth: 0.05, bevel: 0.012 }), wood,
                     [x, y + height / 2, sz * (depth / 2 + 0.02)]));
    }
    group.add(part(bevelledBox({ width: width + 0.02, height: 0.09, depth: 0.032, bevel: 0.009 }),
                   materialFor(PALETTE.plank, { roughness: 0.83 }),
                   [0, y + height - 0.06, sz * (depth / 2 + 0.02)]));
  }
}

export function create({ width = 1.7, depth = 0.98, wheelRadius = 0.44, seed = 1,
                         planks = 6, sideHeight = 0.34 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const axleY = wheelRadius + 0.024;   // the iron tyre, not the felloe, meets the ground
  const bedY = axleY + 0.12;
  const nails = [];
  bed(group, nails, { width, depth, y: bedY, planks, random });
  sides(group, { width, depth, y: bedY + 0.02, height: sideHeight });

  const axle = new THREE.CylinderGeometry(0.045, 0.045, depth + 0.42, 8);
  axle.rotateX(Math.PI / 2);
  group.add(part(axle, materialFor(PALETTE.iron, { roughness: 0.5, metalness: 0.6 }),
                 [width * 0.06, wheelRadius, 0]));
  const wheels = [];
  for (const sz of [1, -1]) {
    const built = wheel(wheelRadius, random);
    built.position.set(width * 0.06, axleY, sz * (depth / 2 + 0.16));
    group.add(built);
    wheels.push(built);
  }

  // Draught shafts and their cross bar: the line that tells a viewer this is pulled, not parked.
  const shaftLength = width * 0.86;
  const shaft = bevelledBox({ width: shaftLength, height: 0.055, depth: 0.05, bevel: 0.012 });
  shaft.rotateZ(-0.09);
  const frame = materialFor(PALETTE.frame, { roughness: 0.7 });
  for (const sz of [1, -1]) {
    group.add(part(shaft, frame, [-width / 2 - shaftLength / 2 + 0.06, bedY - 0.02,
                                  sz * depth * 0.28]));
  }
  group.add(part(bevelledBox({ width: 0.05, height: 0.05, depth: depth * 0.62, bevel: 0.012 }),
                 frame, [-width / 2 - shaftLength + 0.14, bedY - 0.09, 0]));
  const leg = bevelledBox({ width: 0.055, height: bedY - 0.02, depth: 0.055, bevel: 0.012 });
  leg.rotateZ(0.22);
  group.add(part(leg, frame, [width / 2 - 0.1, (bedY - 0.02) / 2, 0]));

  group.add(scatterInstances(new THREE.SphereGeometry(0.013, 7, 4),
                             materialFor('#c6bfb2', { roughness: 0.3, metalness: 0.6 }),
                             nails.map(n => ({ ...n, hue: 0 }))));

  let phase = 0;
  const sockets = [socket('bed', [0, bedY + 0.04, 0], [0, 1, 0]),
                   socket('yoke', [-width / 2 - shaftLength + 0.14, bedY - 0.09, 0], [-1, 0, 0]),
                   socket('axle', [width * 0.06, axleY, 0], [0, 0, 1]),
                   socket('tail', [width / 2 + 0.05, bedY + 0.2, 0], [1, 0, 0])];
  const colliders = [collider('bed', [0, bedY + sideHeight / 2, 0],
                              [width + 0.1, sideHeight + 0.1, depth + 0.14]),
                     collider('wheels', [width * 0.06, axleY, 0],
                              [2 * wheelRadius, 2 * wheelRadius, depth + 0.5])];
  return {
    group, sockets, colliders,
    /** Rolls both wheels at the speed a cart of this radius would turn. */
    animate(dt, speed = 1.1) {
      if (!(dt > 0)) return false;
      phase += (dt * speed) / wheelRadius;
      for (const w of wheels) w.rotation.z = phase;
      return true;
    }
  };
}
