// stairs.js - a straight flight: treads, real risers, a raking stringer and worn nosings.
// Detail ladder: the raking wedge against a wall / individual treads with a shadow under each
//                nosing / lighter worn nosing arris and a seeded chipped corner per flight.
// Local frame: base at the origin, the flight climbs +Y and runs toward +Z.
// Sockets: base (foot of the flight), landing (top tread, where a figure arrives).
import { THREE, bevelledBox, collider, materialFor, part, seeded, socket } from '../kit-core.js';
import { darken, lighten } from './bevelled-box.js';

export function create({ steps = 6, width = 1.2, rise = 0.18, going = 0.3, color = '#b3aa9c',
                         stringer = true, nosing = 0.04, seed = 1 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const stone = materialFor(color, { roughness: 0.87 });
  const shade = materialFor(darken(color, 0.35), { roughness: 0.94 });
  const worn = materialFor(lighten(color, 0.26), { roughness: 0.52 });
  const tread = bevelledBox({ width, height: 0.07, depth: going + nosing, bevel: 0.016 });

  for (let i = 0; i < steps; i++) {
    const y = (i + 1) * rise, z = i * going + (going + nosing) / 2 - nosing;
    group.add(part(tread, stone, [0, y - 0.035, z]));
    // Riser set back behind the nosing: that setback is the shadow line under every step.
    group.add(part(bevelledBox({ width: width - 0.05, height: rise - 0.07 + 0.02,
                                 depth: going * 0.5, bevel: 0.008 }), shade,
                   [0, y - rise / 2 - 0.03, z + going * 0.2]));
    // Worn nosing arris, seeded in length so no two steps are the same rub.
    const span = width * (0.5 + random() * 0.42);
    group.add(part(bevelledBox({ width: span, height: 0.022, depth: 0.022, bevel: 0.006 }), worn,
                   [(random() - 0.5) * (width - span) * 0.8, y - 0.012,
                    z - (going + nosing) / 2 + 0.012]));
  }

  if (stringer) {
    const runZ = steps * going, riseY = steps * rise;
    const length = Math.hypot(runZ, riseY);
    const angle = Math.atan2(riseY, runZ);
    for (const side of [1, -1]) {
      // The cheek rides 13 cm above the flight line so its underside meets the ground at the
      // foot and its top stands a little proud of every tread, the way a cut stringer does.
      group.add(part(bevelledBox({ width: 0.11, height: 0.24, depth: length + 0.1, bevel: 0.024 }),
                     stone, [side * (width / 2 + 0.05), riseY / 2 + 0.13, runZ / 2],
                     [-angle, 0, 0]));
    }
  }
  // One chipped corner: a small dark wedge missing from a random tread edge.
  const chipStep = Math.floor(random() * steps);
  group.add(part(bevelledBox({ width: 0.09, height: 0.05, depth: 0.07, bevel: 0.012 }), shade,
                 [(random() - 0.5) * (width - 0.2), (chipStep + 1) * rise - 0.045,
                  chipStep * going - nosing / 2],
                 [0, random() * 0.6, 0]));

  const top = [0, steps * rise, steps * going - going / 2];
  const sockets = [socket('base', [0, 0, -nosing], [0, 1, 0]), socket('landing', top, [0, 1, 0])];
  const colliders = [collider('flight', [0, steps * rise / 2, steps * going / 2],
                              [width + 0.2, steps * rise, steps * going])];
  return { group, sockets, colliders, top };
}
