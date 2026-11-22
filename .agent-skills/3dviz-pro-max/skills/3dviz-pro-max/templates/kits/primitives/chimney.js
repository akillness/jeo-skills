// chimney.js - a brick stack with corbelled courses, a stone cap and a clay pot.
// The chimney is the second silhouette read of any village building, after the roof pitch.
// Detail ladder: stack breaking the ridge line, pot above the cap / three corbel courses
//                stepping out under the cap, brick coursing / chamfered cap arris, soot band.
// Local frame: base at y = 0, growing +Y. Sockets: top (the pot mouth, where smoke starts).
import { THREE, bevelledBox, collider, materialFor, part, seeded, socket } from '../kit-core.js';
import { darken, lighten } from './bevelled-box.js';

export function create({ width = 0.62, depth = 0.52, height = 2.2, brickColor = '#9c6a55',
                         stoneColor = '#b3aa9c', pot = true, courses = 6, seed = 1 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const brick = materialFor(brickColor, { roughness: 0.88 });
  const shade = materialFor(darken(brickColor, 0.16), { roughness: 0.9 });
  const corbel = 0.34, shaft = height - corbel;

  group.add(part(bevelledBox({ width, height: shaft, depth, bevel: 0.028 }), brick,
                 [0, shaft / 2, 0]));
  // Brick coursing: thin recessed bands, alternating shade, so the stack is not one blank slab.
  const band = shaft / courses;
  for (let i = 1; i < courses; i++) {
    group.add(part(bevelledBox({ width: width - 0.03, height: 0.022, depth: depth - 0.03,
                                 bevel: 0.006 }), shade, [0, i * band, 0]));
  }
  // Three corbel courses stepping out: this is the medium-band feature that says "chimney".
  for (let i = 0; i < 3; i++) {
    const grow = 0.045 * (i + 1);
    group.add(part(bevelledBox({ width: width + grow, height: corbel / 3.4, depth: depth + grow,
                                 bevel: 0.016 }), i % 2 ? shade : brick,
                   [0, shaft + (i + 0.5) * (corbel / 3.2), 0]));
  }
  const cap = height + 0.05;
  group.add(part(bevelledBox({ width: width + 0.2, height: 0.1, depth: depth + 0.2, bevel: 0.024 }),
                 materialFor(stoneColor, { roughness: 0.84 }), [0, cap, 0]));
  // Weathered arris on the cap: a light band on the drip edge, seeded in length.
  group.add(part(bevelledBox({ width: (width + 0.2) * (0.6 + random() * 0.3), height: 0.024,
                               depth: 0.024, bevel: 0.007 }),
                 materialFor(lighten(stoneColor, 0.3), { roughness: 0.55 }),
                 [(random() - 0.5) * 0.1, cap + 0.05, (depth + 0.2) / 2 - 0.012]));

  let top = cap + 0.05;
  if (pot) {
    const clay = materialFor(darken(brickColor, 0.05), { roughness: 0.78 });
    const potH = 0.34;
    group.add(part(new THREE.CylinderGeometry(0.1, 0.13, potH, 12, 1, true), clay,
                   [0, top + potH / 2, 0]));
    group.add(part(new THREE.TorusGeometry(0.105, 0.02, 5, 12), clay, [0, top + potH, 0],
                   [Math.PI / 2, 0, 0]));
    // Soot: a near-black ring inside the pot mouth. Fine band, three centimetres tall.
    group.add(part(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 10), materialFor('#1c1815',
                                                                                   { roughness: 1 }),
                   [0, top + potH - 0.03, 0]));
    top += potH;
  }

  const sockets = [socket('top', [0, top, 0], [0, 1, 0]),
                   socket('base', [0, 0, 0], [0, 1, 0])];
  const colliders = [collider('stack', [0, height / 2, 0], [width + 0.2, height, depth + 0.2])];
  return { group, sockets, colliders, top };
}
