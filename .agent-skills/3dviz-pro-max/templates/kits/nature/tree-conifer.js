// tree-conifer.js - a spruce: flared roots, a leaning tapered bole, eight whorls of boughs.
// Detail ladder: narrow leaning cone silhouette with a bare bole and a leader spike
//                / eight separate whorls of decreasing radius, each turned off the one below
//                / seven countable drooping boughs per whorl, faceted shading, 7 percent hue jitter.
// Sockets: base (ground), leader (tip), nest (the lowest whorl, for hanging a lantern).
// instancing: { geometry, material, hueJitter } - one bough geometry plants a whole forest via
// THREE.InstancedMesh or kit-core scatterInstances. animate(dt) (alias sway) returns false at dt <= 0.
import { THREE, collider, materialFor, part, scatterInstances, seeded, socket } from '../kit-core.js';

// Palette entries are the colours that render: kit-core's scatterInstances runs its
// InstancedMesh on a white-based clone, so an unjittered bough lands on exactly this green.
const PALETTE = { bark: '#6b5442', needle: '#4b7554', root: '#6d5640' };
const WHORLS = 8, PER_WHORL = 9;

/** One bough: a cone flattened in Y and laid along +X with its butt on the trunk axis, so a
 *  placement is just an azimuth and a droop. Countable boughs are what separate a spruce from
 *  a stack of party hats at any distance closer than twenty metres. */
function boughGeometry() {
  const geometry = new THREE.ConeGeometry(0.3, 1, 6);
  geometry.rotateZ(-Math.PI / 2);
  geometry.scale(1, 0.4, 1);
  geometry.translate(0.5, 0, 0);
  return geometry;
}

/** The mass behind the boughs: a unit cone standing on y = 0 so an instance scale is the whorl
 *  radius and depth in metres. Boughs alone read as thorns on a stick; the skirt is the body
 *  they grow out of, and the boughs poke past its rim so they stay countable. */
function skirtGeometry() {
  const geometry = new THREE.ConeGeometry(1, 1, 9);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

/** Root flare, shared in spirit with tree-round but shallower: a conifer buttresses less. */
function roots(group, { radius, random }) {
  const cone = new THREE.ConeGeometry(radius * 0.7, radius * 3.0, 5);
  cone.rotateZ(-Math.PI / 2);      // tip toward +X, so an instance is one Y rotation
  cone.scale(1, 0.5, 1);            // flattened into a buttress rather than a spike
  cone.rotateZ(-0.72);             // angled down so the tip buries itself at the ground
  cone.translate(radius * 0.25, radius * 0.8, 0);
  const placements = Array.from({ length: 5 }, (_, i) => ({
    position: [0, 0, 0], rotation: [0, (i / 5) * Math.PI * 2 + random() * 0.4, 0],
    scale: [0.8 + random() * 0.4, 1, 0.7 + random() * 0.5], hue: (random() - 0.5) * 0.05 }));
  group.add(scatterInstances(cone, materialFor(PALETTE.root, { roughness: 0.95 }), placements));
}

export function create({ seed = 1, age = 1, lean = 0.06, height = 4.2, radius = 0.16,
                         needle = '#4b7554' } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const h = height * (0.62 + 0.38 * age);
  const r = radius * (0.6 + 0.4 * age);
  roots(group, { radius: r, random });

  // --- the bole: four leaning tapered segments, bare for the lowest fifth of the tree -------
  const bark = materialFor(PALETTE.bark, { roughness: 0.92 });
  let x = 0, y = 0;
  const spine = [[0, 0]];
  for (let i = 0; i < 4; i++) {
    const seg = h / 4;
    const tilt = lean * (0.2 + i * 0.3);
    group.add(part(new THREE.CylinderGeometry(r * (1 - (i + 1) * 0.2), r * (1 - i * 0.2), seg, 7),
                   bark, [x + Math.sin(tilt) * seg / 2, y + seg / 2, 0], [0, 0, -tilt]));
    x += Math.sin(tilt) * seg;
    y += seg * Math.cos(tilt);
    spine.push([x, y]);
  }
  const spineAt = t => {
    const u = Math.min(0.999, Math.max(0, t)) * 4;
    const i = Math.floor(u), f = u - i;
    return [spine[i][0] + (spine[i + 1][0] - spine[i][0]) * f,
            spine[i][1] + (spine[i + 1][1] - spine[i][1]) * f];
  };

  // --- the whorls: eight rings of boughs over eight skirts, each smaller than the one below --
  const skirtR = h * 0.27;
  const geometry = boughGeometry();
  const skirt = skirtGeometry();
  const material = materialFor(needle, { roughness: 0.86, flatShading: true });
  const placements = [], skirts = [];
  for (let i = 0; i < WHORLS; i++) {
    const t = 0.16 + (i / (WHORLS - 1)) * 0.82;
    const [sx, sy] = spineAt(t);
    const shrink = (1 - i / (WHORLS + 1.6)) ** 1.5;
    const reach = skirtR * shrink;
    const turn = random() * Math.PI * 2;
    skirts.push({ position: [sx, sy - reach * 0.18, 0], rotation: [0, turn, 0],
                  scale: [reach * 0.86, reach * 0.95, reach * 0.86],
                  hue: (random() - 0.5) * 0.1 });
    for (let b = 0; b < PER_WHORL; b++) {
      const a = turn + (b / PER_WHORL) * Math.PI * 2 + (random() - 0.5) * 0.2;
      const arm = reach * (1.0 + random() * 0.3);
      placements.push({ position: [sx, sy, 0], rotation: [0, a, -(0.34 + random() * 0.26)],
                        scale: [arm, arm * 0.95, arm * (0.75 + random() * 0.35)],
                        hue: (random() - 0.5) * 0.1 });
    }
  }
  const crown = new THREE.Group();
  crown.add(scatterInstances(skirt, material, skirts));
  crown.add(scatterInstances(geometry, material, placements));
  // Leader spike: the bare shoot above the top whorl, the read that says conifer at thirty metres.
  const tip = spineAt(1);
  const leader = new THREE.ConeGeometry(skirtR * 0.16, h * 0.19, 7);
  crown.add(part(leader, material, [tip[0], tip[1] + h * 0.08, 0]));
  group.add(crown);

  let phase = random() * 6.28;
  const sway = (dt, amplitude = 0.018) => {
    if (!(dt > 0)) return false;
    phase += dt * 0.95;
    crown.rotation.z = Math.sin(phase) * amplitude;
    crown.rotation.x = Math.sin(phase * 0.7 + 1.1) * amplitude * 0.7;
    return true;
  };
  const top = tip[1] + h * 0.14;
  const sockets = [socket('base', [0, 0, 0], [0, 1, 0]),
                   socket('leader', [tip[0], top, 0], [0, 1, 0]),
                   socket('nest', [skirtR * 0.7, spineAt(0.2)[1], 0], [1, 0, 0])];
  const colliders = [collider('bole', [x / 2, h / 2, 0], [r * 2.6, h, r * 2.6]),
                     collider('crown', [x / 2, h * 0.6, 0], [skirtR * 2.2, h * 0.9, skirtR * 2.2])];
  return { group, sockets, colliders, animate: sway, sway,
           instancing: { geometry, material, hueJitter: 0.1 } };
}
