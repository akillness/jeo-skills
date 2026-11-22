// tree-round.js - a broadleaf tree: flared roots, a tapering leaning trunk, clustered canopy.
// Detail ladder: leaning trunk against a lobed (never spherical) crown, root flare at the base
//                / four branches reaching into their own canopy lobes, six overlapping lobes
//                / faceted lobe shading, bark collar rings, per-lobe hue jitter of 7 percent.
// Sockets: base (ground), canopy (crown centre), swing (the lowest branch fork).
// instancing: { geometry, material, hueJitter } - hand these to THREE.InstancedMesh, or to
// kit-core scatterInstances, to plant a wood from one canopy lobe. animate(dt) (alias sway)
// rocks the crown and the branches; it returns false when dt <= 0.
import { THREE, collider, materialFor, part, scatterInstances, seeded, socket } from '../kit-core.js';

// Palette entries are the colours that render: kit-core's scatterInstances runs its
// InstancedMesh on a white-based clone, so an unjittered lobe lands on exactly this green.
const PALETTE = { bark: '#7a6149', collar: '#8d7452', leaf: '#6a9150', root: '#6d5640' };

/** Root flare: six wedges splayed out of the base. A trunk that meets the ground as a clean
 *  cylinder reads as a dowel pushed into grass, at every distance. */
function roots(group, { radius, random }) {
  const cone = new THREE.ConeGeometry(radius * 0.75, radius * 3.4, 5);
  cone.rotateZ(-Math.PI / 2);      // tip toward +X, so an instance is one Y rotation
  cone.scale(1, 0.5, 1);            // flattened into a buttress rather than a spike
  cone.rotateZ(-0.7);             // angled down so the tip buries itself at the ground
  cone.translate(radius * 0.25, radius * 0.85, 0);
  const placements = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + random() * 0.35;
    placements.push({ position: [0, 0, 0], rotation: [0, a, 0],
                      scale: [0.8 + random() * 0.5, 1, 0.75 + random() * 0.6],
                      hue: (random() - 0.5) * 0.05 });
  }
  group.add(scatterInstances(cone, materialFor(PALETTE.root, { roughness: 0.94 }), placements));
}

/** Four tapering trunk segments, each leaning a little further than the one below, with a
 *  bark collar over every join so the trunk reads as grown rather than extruded. */
function trunk(group, { height, radius, lean, random }) {
  const bark = materialFor(PALETTE.bark, { roughness: 0.9 });
  const collar = materialFor(PALETTE.collar, { roughness: 0.78 });
  let x = 0, y = 0;
  const stops = [];
  for (let i = 0; i < 4; i++) {
    const h = height / 4;
    const r0 = radius * (1 - i * 0.17), r1 = radius * (1 - (i + 1) * 0.17);
    const tilt = lean * (0.2 + i * 0.3) + (random() - 0.5) * 0.05;
    const geometry = new THREE.CylinderGeometry(r1, r0, h, 8);
    const mesh = part(geometry, bark, [x + Math.sin(tilt) * h / 2, y + h / 2, 0], [0, 0, -tilt]);
    group.add(mesh);
    x += Math.sin(tilt) * h;
    y += h * Math.cos(tilt);
    stops.push({ x, y, r: r1 });
    if (i < 3) {
      const ring = new THREE.CylinderGeometry(r1 * 1.16, r1 * 1.16, 0.05, 8);
      group.add(part(ring, collar, [x, y, 0], [0, 0, -tilt]));
    }
  }
  return stops;
}

/** Branches from the upper two trunk stops out to where the canopy lobes will sit. */
function branches(group, stops, { random }) {
  const bark = materialFor(PALETTE.bark, { roughness: 0.88 });
  const arms = new THREE.Group();
  const tips = [];
  for (let i = 0; i < 4; i++) {
    const from = stops[1 + (i % 2)];
    const a = (i / 4) * Math.PI * 2 + random() * 0.6;
    const reach = 0.5 + random() * 0.35;
    const rise = 0.45 + random() * 0.3;
    const length = Math.hypot(reach, rise);
    const geometry = new THREE.CylinderGeometry(from.r * 0.28, from.r * 0.52, length, 6);
    geometry.translate(0, length / 2, 0);
    const mesh = part(geometry, bark, [from.x, from.y, 0]);
    mesh.rotation.set(0, a, Math.atan2(reach, rise));
    arms.add(mesh);
    tips.push([from.x + Math.cos(a) * reach, from.y + rise, -Math.sin(a) * reach]);
  }
  group.add(arms);
  return { arms, tips };
}

export function create({ seed = 1, age = 1, lean = 0.09, height = 3.4, radius = 0.19,
                         leaf = '#6a9150' } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const trunkH = height * 0.52 * (0.7 + 0.3 * age);
  const r = radius * (0.6 + 0.4 * age);
  roots(group, { radius: r, random });
  const stops = trunk(group, { height: trunkH, radius: r, lean, random });
  const { arms, tips } = branches(group, stops, { random });

  // --- canopy: six overlapping lobes, never one sphere -------------------------------------
  // The lobe is tumbled once, in geometry space: an instance then only spins about Y, which
  // keeps every instance bounding box exact and the crown sitting where the framing says.
  const lobe = new THREE.IcosahedronGeometry(1, 1);
  lobe.rotateX(0.6);
  lobe.rotateZ(0.9);
  const material = materialFor(leaf, { roughness: 0.82, flatShading: true });
  const top = stops[3];
  const crown = [top.x, top.y + height * 0.18 * age, 0];
  const scale = height * 0.2 * (0.65 + 0.35 * age);
  const placements = [{ position: crown, scale: scale * 1.15, hue: (random() - 0.5) * 0.1,
                        rotation: [0, random() * 6.28, 0] }];
  for (const tip of tips) {
    placements.push({ position: [tip[0], tip[1] + scale * 0.5, tip[2]],
                      scale: [scale * (0.7 + random() * 0.45), scale * (0.6 + random() * 0.4),
                              scale * (0.7 + random() * 0.45)],
                      rotation: [0, random() * 6.28, 0],
                      hue: (random() - 0.5) * 0.1 });
  }
  placements.push({ position: [crown[0] + scale * 0.5, crown[1] - scale * 0.55, scale * 0.4],
                    scale: scale * 0.8, rotation: [0, random() * 6.28, 0],
                    hue: (random() - 0.5) * 0.1 });
  const canopy = new THREE.Group();
  canopy.add(scatterInstances(lobe, material, placements));
  group.add(canopy);

  let phase = random() * 6.28;
  const sway = (dt, amplitude = 0.02) => {
    if (!(dt > 0)) return false;
    phase += dt * 1.15;
    canopy.rotation.z = Math.sin(phase) * amplitude;
    canopy.rotation.x = Math.sin(phase * 0.62) * amplitude * 0.6;
    arms.rotation.z = Math.sin(phase + 0.7) * amplitude * 0.5;
    return true;
  };
  const sockets = [socket('base', [0, 0, 0], [0, 1, 0]),
                   socket('canopy', crown, [0, 1, 0]),
                   socket('swing', [stops[1].x, stops[1].y, 0], [0, -1, 0])];
  const colliders = [collider('trunk', [top.x / 2, trunkH / 2, 0], [r * 2.4, trunkH, r * 2.4]),
                     collider('canopy', crown, [scale * 3.4, scale * 2.6, scale * 3.4])];
  return { group, sockets, colliders, animate: sway, sway,
           instancing: { geometry: lobe, material, hueJitter: 0.1 } };
}
