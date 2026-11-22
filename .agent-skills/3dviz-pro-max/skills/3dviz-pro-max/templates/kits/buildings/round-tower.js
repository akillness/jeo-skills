// round-tower.js - a battered round stone tower: corbelled parapet, crenellations, a conical
// cap with a banner, arrow slits up the shaft and an outside stair to a raised door.
// Detail ladder: tapered shaft, crenellated crown and cone cap breaking the sky, stair wedge
//                / merlon rhythm, corbel ring, string courses, recessed door and arrow slits
//                / chamfered merlon caps, worn tread nosings, banner ties, weathered arrises.
// The shaft is centred on the origin; the door and its stair face +Z. y = 0 is the ground.
import { THREE, bevelledBox, collider, materialFor, part, scatterInstances, seeded,
         socket } from '../kit-core.js';
import { lighten } from '../primitives/bevelled-box.js';
import { create as insetWindow } from '../primitives/inset-window.js';
import { create as doorWithStep } from '../primitives/door-with-step.js';
import { create as stairFlight } from '../primitives/stairs.js';

const SEG = 24;
const PALETTE = { stone: '#a49b8e', dark: '#6a6357', timber: '#54402c', pane: '#141210',
                  slate: '#4f545a', banner: '#8c3f45', iron: '#33322f' };

/** Radius of the battered shaft at height y: a tower that does not taper reads as a pipe. */
function radiusAt(y, height, base, top) {
  return base + (top - base) * Math.min(1, Math.max(0, y / height));
}

/** Merlons and their embrasures around the crown, as one instanced ring. */
function crenellation(group, { radius, y, count, seed }) {
  const random = seeded(seed);
  const merlon = bevelledBox({ width: 0.46, height: 0.62, depth: 0.34, bevel: 0.035 });
  const placements = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    placements.push({ position: [Math.sin(a) * radius, y + 0.31, Math.cos(a) * radius],
                      rotation: [0, a, 0], hue: (random() - 0.5) * 0.05 });
  }
  group.add(scatterInstances(merlon, materialFor(PALETTE.stone, { roughness: 0.9 }),
                             placements));
  // A lighter capstone on every third merlon: weather, seeded, still countable at close range.
  const caps = placements.filter((_, i) => i % 3 === 0).map(entry => ({
    position: [entry.position[0], y + 0.65, entry.position[2]], rotation: entry.rotation,
    scale: [1.06, 0.14, 1.12], hue: 0 }));
  group.add(scatterInstances(merlon, materialFor(lighten(PALETTE.stone, 0.22),
                                                 { roughness: 0.6 }), caps));
}

/** The conical cap over the wall-walk, its eave ring, finial and banner. */
function cap(group, { radius, y, seed }) {
  const random = seeded(seed);
  const slate = materialFor(PALETTE.slate, { roughness: 0.62 });
  const height = radius * 1.5;
  group.add(part(new THREE.ConeGeometry(radius + 0.22, height, SEG, 3), slate,
                 [0, y + height / 2, 0]));
  group.add(part(new THREE.TorusGeometry(radius + 0.24, 0.07, 5, SEG), materialFor(PALETTE.dark,
                                                                                   { roughness: 0.88 }),
                 [0, y + 0.06, 0], [Math.PI / 2, 0, 0]));
  const poleTop = y + height + 0.95;
  group.add(part(new THREE.CylinderGeometry(0.045, 0.055, 1.1, 8),
                 materialFor(PALETTE.iron, { roughness: 0.4, metalness: 0.7 }),
                 [0, y + height + 0.5, 0]));
  const banner = materialFor(PALETTE.banner, { roughness: 0.68 });
  for (let i = 0; i < 3; i++) {
    group.add(part(bevelledBox({ width: 0.34, height: 0.2, depth: 0.02, bevel: 0.006 }), banner,
                   [0.2 + i * 0.02, poleTop - 0.22 - i * 0.2, 0],
                   [0, 0, (random() - 0.5) * 0.12 - 0.05 * i]));
  }
  return poleTop;
}

export function create({ height = 8, baseRadius = 2.2, topRadius = 1.75, merlons = 14,
                         slits = 5, doorHeight = 1.7, seed = 1 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const stone = materialFor(PALETTE.stone, { roughness: 0.93 });
  const dark = materialFor(PALETTE.dark, { roughness: 0.95 });

  // Splayed plinth, then the battered shaft in one tapered drum.
  group.add(part(new THREE.CylinderGeometry(baseRadius + 0.05, baseRadius + 0.42, 0.85, SEG),
                 dark, [0, 0.425, 0]));
  group.add(part(new THREE.CylinderGeometry(topRadius, baseRadius + 0.05, height - 0.85, SEG),
                 stone, [0, 0.85 + (height - 0.85) / 2, 0]));
  // String courses: projecting bands that stop the shaft reading as one extruded tube.
  for (const t of [0.18, 0.36, 0.54, 0.72, 0.9]) {
    const y = 0.85 + (height - 0.85) * t;
    const r = radiusAt(y, height, baseRadius + 0.05, topRadius);
    group.add(part(new THREE.CylinderGeometry(r + 0.09, r + 0.11, 0.16, SEG), dark, [0, y, 0]));
  }
  // Corbel ring under the parapet: the medium-band feature that says "fortified", not "silo".
  group.add(part(new THREE.CylinderGeometry(topRadius + 0.34, topRadius + 0.02, 0.42, SEG),
                 stone, [0, height + 0.21, 0]));
  group.add(part(new THREE.CylinderGeometry(topRadius + 0.36, topRadius + 0.36, 0.14, SEG),
                 dark, [0, height + 0.49, 0]));
  crenellation(group, { radius: topRadius + 0.13, y: height + 0.56, count: merlons,
                        seed: seed + 21 });
  const poleTop = cap(group, { radius: topRadius - 0.15, y: height + 0.62, seed: seed + 3 });

  // Arrow slits climb the shaft on a slow spiral, the way a real newel stair lights itself.
  for (let i = 0; i < slits; i++) {
    const y = 2.6 + i * ((height - 3.4) / Math.max(1, slits - 1));
    const a = (i * 0.7 + random() * 0.12) - 0.35;
    const r = radiusAt(y, height, baseRadius + 0.05, topRadius);
    // The shaft has no hole, so the dressing must stand proud: the frame carries the reveal
    // out past the surface and the dark pane sits 4 cm in front of it, inside the frame mouth.
    const slit = insetWindow({ width: 0.26, height: 1.05, inset: 0.12, frame: 0.11, bars: 0,
                               rows: 0, sill: false, frameColor: PALETTE.stone,
                               glassColor: PALETTE.pane, seed: seed + 40 + i });
    slit.group.position.set(Math.sin(a) * (r + 0.12), y, Math.cos(a) * (r + 0.12));
    slit.group.rotation.y = a;
    group.add(slit.group);
  }
  const lightR = radiusAt(height - 1.1, height, baseRadius + 0.05, topRadius);
  const light = insetWindow({ width: 0.7, height: 0.95, inset: 0.12, bars: 1, rows: 1,
                              frameColor: PALETTE.timber, glassColor: '#ffcf8f',
                              stoneColor: PALETTE.stone, emissive: '#ffcf8f',
                              emissiveIntensity: 0.9, seed: seed + 9 });
  light.group.position.set(0, height - 1.1, lightR + 0.12);
  group.add(light.group);

  // Raised door on a stair: a tower entered at ground level has given its defence away.
  const doorR = radiusAt(doorHeight, height, baseRadius + 0.05, topRadius);
  const door = doorWithStep({ width: 0.95, height: 2.0, inset: 0.14, step: false, hood: false,
                              doorColor: PALETTE.timber, stoneColor: PALETTE.stone,
                              seed: seed + 7 });
  door.group.position.set(0, doorHeight, doorR + 0.12);
  group.add(door.group);
  // Arched head over the door: seven voussoirs on a real semicircle, each yawed back onto the
  // curved wall. Laying an arch on one flat plane over a drum is what makes it look scattered.
  const archR = 0.56, springY = doorHeight + 1.95;
  const shaftR = radiusAt(springY, height, baseRadius + 0.05, topRadius);
  const voussoir = bevelledBox({ width: 0.26, height: 0.32, depth: 0.3, bevel: 0.022 });
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + ((i + 0.5) / 7) * Math.PI;
    const x = Math.sin(a) * archR, yaw = Math.asin(x / shaftR);
    group.add(part(voussoir,
                   i === 3 ? materialFor(lighten(PALETTE.stone, 0.2), { roughness: 0.78 }) : stone,
                   [x, springY + Math.cos(a) * archR, Math.cos(yaw) * shaftR + 0.07],
                   [0, yaw, -a]));
  }
  // A landing platform on two corbels, with the flight arriving at its outer edge.
  const steps = Math.max(4, Math.round(doorHeight / 0.24));
  const landing = doorR + 1.0;
  const flight = stairFlight({ steps, width: 1.15, rise: doorHeight / steps, going: 0.27,
                               color: PALETTE.stone, seed: seed + 11 });
  flight.group.rotation.y = Math.PI;
  flight.group.position.set(0, 0, landing + steps * 0.27);
  group.add(flight.group);
  group.add(part(bevelledBox({ width: 1.5, height: 0.18, depth: 1.15, bevel: 0.03 }),
                 materialFor(PALETTE.stone, { roughness: 0.88 }),
                 [0, doorHeight - 0.09, doorR + 0.5]));
  for (const side of [1, -1]) {
    group.add(part(bevelledBox({ width: 0.2, height: 0.5, depth: 0.34, bevel: 0.03 }), dark,
                   [side * 0.55, doorHeight - 0.42, doorR + 0.28], [0.5, 0, 0]));
  }

  const walkway = height + 0.56;
  const sockets = [socket('door', [0, doorHeight, doorR], [0, 0, 1]),
                   socket('banner', [0, poleTop, 0], [0, 1, 0]),
                   socket('walkway', [0, walkway, 0], [0, 1, 0]),
                   socket('lantern', [0, height - 1.1, lightR], [0, 0, 1]),
                   socket('stair-foot', [0, 0, landing + steps * 0.27 + 0.28], [0, 0, 1])];
  const colliders = [collider('shaft', [0, height / 2, 0],
                              [baseRadius * 2 + 0.84, height, baseRadius * 2 + 0.84]),
                     collider('crown', [0, height + 0.6, 0],
                              [topRadius * 2 + 0.9, 1.3, topRadius * 2 + 0.9]),
                     collider('stair', [0, doorHeight / 2, doorR + steps * 0.14 + 0.5],
                              [1.5, doorHeight, steps * 0.27 + 1.2])];
  return { group, sockets, colliders };
}
