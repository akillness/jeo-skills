// railing.js - a run of railing in two builds: turned balusters, or a solid parapet with coping.
// Detail ladder: the rail line breaking a deck or a walkway edge / posts, top and bottom rails,
//                baluster rhythm or coping overhang / chamfered post caps, worn coping arris.
// Local frame: the run lies along X, centred on the origin, base at y = 0, thickness in Z.
// Sockets: start (-X end), end (+X end), both at rail height.
import { THREE, bevelledBox, collider, materialFor, part, scatterInstances, seeded,
         socket } from '../kit-core.js';
import { darken, lighten } from './bevelled-box.js';

function balustrade(group, { length, height, posts, thickness, wood, dark, balusterMaterial,
                             random }) {
  const railH = 0.09;
  const postGeom = bevelledBox({ width: 0.11, height: height - railH, depth: thickness,
                                 bevel: 0.022 });
  const capGeom = bevelledBox({ width: 0.15, height: 0.05, depth: thickness + 0.04, bevel: 0.014 });
  for (let i = 0; i < posts; i++) {
    const x = -length / 2 + (i * length) / Math.max(1, posts - 1);
    group.add(part(postGeom, wood, [x, (height - railH) / 2, 0]));
    group.add(part(capGeom, dark, [x, height - railH + 0.025, 0]));
  }
  for (const [y, h] of [[height - railH / 2, railH], [height * 0.34, 0.06]]) {
    group.add(part(bevelledBox({ width: length + 0.12, height: h, depth: thickness * 0.8,
                                 bevel: 0.016 }), wood, [0, y, 0]));
  }
  // Balusters between the posts, instanced, with a small seeded lean each.
  const baluster = bevelledBox({ width: 0.05, height: height * 0.55, depth: thickness * 0.6,
                                 bevel: 0.01 });
  const placements = [];
  const gaps = Math.max(2, Math.round(length * 3));
  for (let i = 0; i < gaps; i++) {
    const x = -length / 2 + ((i + 0.5) * length) / gaps;
    placements.push({ position: [x, height * 0.34 + height * 0.28, 0],
                      rotation: [0, 0, (random() - 0.5) * 0.05], hue: (random() - 0.5) * 0.04 });
  }
  group.add(scatterInstances(baluster, balusterMaterial, placements));
}

function parapet(group, { length, height, thickness, stone, dark, worn, random }) {
  const wallH = height - 0.12;
  group.add(part(bevelledBox({ width: length, height: wallH, depth: thickness, bevel: 0.03 }),
                 stone, [0, wallH / 2, 0]));
  // Coursing: two recessed bands, so the parapet is masonry rather than an extruded strip.
  for (const t of [0.36, 0.72]) {
    group.add(part(bevelledBox({ width: length - 0.02, height: 0.025, depth: thickness - 0.03,
                                 bevel: 0.007 }), dark, [0, wallH * t, 0]));
  }
  group.add(part(bevelledBox({ width: length + 0.06, height: 0.12, depth: thickness + 0.13,
                               bevel: 0.026 }), stone, [0, wallH + 0.06, 0]));
  const span = length * (0.55 + random() * 0.35);
  group.add(part(bevelledBox({ width: span, height: 0.026, depth: 0.026, bevel: 0.007 }), worn,
                 [(random() - 0.5) * (length - span) * 0.8, wallH + 0.115,
                  (thickness + 0.13) / 2 - 0.013]));
}

export function create({ length = 3, height = 1.0, posts = 4, style = 'baluster',
                         thickness = 0.12, color = '#6b4f34', seed = 1 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const main = materialFor(color, { roughness: 0.72 });
  const dark = materialFor(darken(color, 0.24), { roughness: 0.82 });
  const worn = materialFor(lighten(color, 0.28), { roughness: 0.5 });
  if (style === 'parapet') {
    parapet(group, { length, height, thickness, stone: main, dark, worn, random });
  } else {
    balustrade(group, { length, height, posts, thickness, wood: main, dark, random,
                        balusterMaterial: materialFor(darken(color, 0.24),
                                                      { roughness: 0.82 }) });
  }
  const sockets = [socket('start', [-length / 2, height, 0], [-1, 0, 0]),
                   socket('end', [length / 2, height, 0], [1, 0, 0])];
  const colliders = [collider('run', [0, height / 2, 0], [length, height, thickness + 0.13])];
  return { group, sockets, colliders };
}
