// bevelled-box.js - the base solid of every kit: a chamfered block that can carry edge wear.
// Detail ladder: block silhouette / real chamfer on all twelve edges, no shaded fake
//                / lighter worn arrises along the top edges, seeded in length and offset.
// Sockets: top (centre of the upper face), front (+Z face centre). Base sits at y = 0.
import { THREE, bevelledBox, collider, materialFor, part, seeded, socket } from '../kit-core.js';

/** Lighten a hex colour toward white without leaving the string-keyed material cache. */
export function lighten(color, amount) {
  const mixed = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), Math.min(1, amount));
  return `#${mixed.getHexString()}`;
}

/** Darken a hex colour toward black; used for the shadow line under a lip or a sill. */
export function darken(color, amount) {
  const mixed = new THREE.Color(color).lerp(new THREE.Color('#000000'), Math.min(1, amount));
  return `#${mixed.getHexString()}`;
}

export function create({ width = 1, height = 1, depth = 1, bevel = 0.03, color = '#b3aa9c',
                         roughness = 0.82, metalness = 0, wear = 0, seed = 1,
                         grounded = true } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const y = grounded ? height / 2 : 0;
  group.add(part(bevelledBox({ width, height, depth, bevel }),
                 materialFor(color, { roughness, metalness }), [0, y, 0]));

  // Worn arris: a thin, lighter sliver riding each long top edge. It is the cheapest fine-band
  // feature there is - two boxes - and it is what stops a chamfer reading as a shaded gradient.
  if (wear > 0) {
    const rub = materialFor(lighten(color, 0.3 * wear), { roughness: Math.max(0.2, roughness - 0.25),
                                                          metalness });
    const thickness = Math.max(0.006, bevel * 0.8);
    for (const side of [1, -1]) {
      const span = width * (0.62 + random() * 0.3);
      const shift = (random() - 0.5) * (width - span) * 0.9;
      group.add(part(bevelledBox({ width: span, height: thickness, depth: thickness,
                                   bevel: thickness * 0.3 }), rub,
                     [shift, y + height / 2 - thickness * 0.4,
                      side * (depth / 2 - thickness * 0.4)]));
    }
  }

  const sockets = [socket('top', [0, y + height / 2, 0], [0, 1, 0]),
                   socket('front', [0, y, depth / 2], [0, 0, 1])];
  const colliders = [collider('body', [0, y, 0], [width, height, depth])];
  return { group, sockets, colliders };
}
