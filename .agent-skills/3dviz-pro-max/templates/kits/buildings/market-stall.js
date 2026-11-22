// market-stall.js - a trestle market stall: striped canopy with a sagging ridge and a scalloped
// valance, a plank counter on trestles, stacked goods and a hanging price board.
// Detail ladder: pitched canopy, valance fringe and the goods breaking the counter line
//                / individual canopy stripes with their sag, trestle legs, crates and baskets
//                / rope lashings at every post head, chamfered arrises, per-fruit hue jitter.
// The ridge runs along X, the counter faces +Z, y = 0 is the ground plane.
import { THREE, bevelledBox, collider, materialFor, part, scatterInstances, seeded,
         socket } from '../kit-core.js';
import { darken, lighten } from '../primitives/bevelled-box.js';
import { create as sign } from '../primitives/sign.js';

const PALETTE = { timber: '#8a6a45', dark: '#5d4630', cloth: '#d9d2c2', stripe: '#a8443f',
                  rope: '#9c8455', crate: '#7d6242', fruit: '#c86a2c', sack: '#c9bb98' };

/** The canopy: stripes running down each slope, drooping toward the middle of the span. */
function canopy(group, { width, run, ridgeY, drop, stripes, sag, seed }) {
  const random = seeded(seed);
  const halfRun = run / 2, slope = Math.hypot(halfRun, drop), pitch = Math.atan2(drop, halfRun);
  const stripeW = width / stripes;
  const cloth = materialFor(PALETTE.cloth, { roughness: 0.95 });
  const stripe = materialFor(PALETTE.stripe, { roughness: 0.93 });
  const panel = bevelledBox({ width: stripeW - 0.012, height: 0.035, depth: slope + 0.08,
                              bevel: 0.01 });
  for (let i = 0; i < stripes; i++) {
    const x = -width / 2 + (i + 0.5) * stripeW;
    // Catenary droop: deepest at mid-span, none at the end posts. Two boxes per bay would be a
    // tent; the sag is what makes it read as cloth stretched over a frame.
    const droop = sag * Math.sin((Math.PI * (i + 0.5)) / stripes);
    for (const side of [1, -1]) {
      group.add(part(panel, i % 2 ? stripe : cloth,
                     [x, ridgeY - droop - drop / 2, side * halfRun / 2],
                     [side * pitch, 0, 0]));
    }
  }
  // Scalloped valance hanging from the front eave: the fringe is the stall's whole silhouette.
  const scallop = bevelledBox({ width: stripeW * 0.86, height: 0.26, depth: 0.03, bevel: 0.012 });
  const placements = [];
  for (let i = 0; i < stripes; i++) {
    const x = -width / 2 + (i + 0.5) * stripeW;
    const droop = sag * Math.sin((Math.PI * (i + 0.5)) / stripes);
    placements.push({ position: [x, ridgeY - drop - droop - 0.14, halfRun + 0.03],
                      rotation: [0, 0, (random() - 0.5) * 0.06],
                      hue: (random() - 0.5) * 0.05 });
  }
  group.add(scatterInstances(scallop, materialFor(PALETTE.stripe,
                                                  { roughness: 0.94 }), placements));
}

/** Crates and loose produce standing ON the counter boards, plus sacks leaning at the front.
 *  Goods pushed to the back of a stall sit in the canopy's own shadow and stop reading. */
function goods(group, { width, depth, counterY, seed }) {
  const random = seeded(seed);
  const crate = bevelledBox({ width: 0.42, height: 0.3, depth: 0.34, bevel: 0.018 });
  const crates = [];
  for (let i = 0; i < 5; i++) {
    const stacked = i > 2;
    crates.push({ position: [-width * 0.36 + i * 0.42 + (random() - 0.5) * 0.06,
                             counterY + 0.16 + (stacked ? 0.31 : 0), 0.46 + random() * 0.26],
                  rotation: [0, (random() - 0.5) * 0.5, 0], hue: (random() - 0.5) * 0.08 });
  }
  group.add(scatterInstances(crate, materialFor(PALETTE.crate, { roughness: 0.85 }),
                             crates));
  // Slat gaps: one darker band across each crate face, so a crate is not a solid block.
  const slat = bevelledBox({ width: 0.44, height: 0.035, depth: 0.36, bevel: 0.008 });
  group.add(scatterInstances(slat, materialFor(darken(PALETTE.crate, 0.45),
                                               { roughness: 0.9 }),
                             crates.map(c => ({ ...c, position: [c.position[0],
                                                                 c.position[1] + 0.02,
                                                                 c.position[2]] }))));
  const fruit = new THREE.IcosahedronGeometry(0.062, 0);
  const heap = [];
  for (let i = 0; i < 22; i++) {
    const a = random() * Math.PI * 2, r = 0.26 * Math.sqrt(random());
    heap.push({ position: [width * 0.3 + Math.cos(a) * r, counterY + 0.09 + random() * 0.09,
                           depth / 2 - 0.32 + Math.sin(a) * r * 0.7],
                rotation: [random() * 3, random() * 3, 0], scale: 0.8 + random() * 0.5,
                hue: (random() - 0.5) * 0.09 });
  }
  group.add(scatterInstances(fruit, materialFor(PALETTE.fruit, { roughness: 0.55 }),
                             heap));
  // Sacks: a faceted lump squashed and tied, never a smooth sphere - a sphere reads as a ball.
  const lump = new THREE.IcosahedronGeometry(0.3, 0);
  for (let i = 0; i < 2; i++) {
    const z = depth / 2 + 0.3 + random() * 0.1;
    const sack = part(lump, materialFor(PALETTE.sack, { roughness: 0.97, flatShading: true }),
                      [-width * 0.4 + i * 0.52, 0.25, z], [0, random() * 2, (random() - 0.5) * 0.2]);
    sack.scale.set(1, 0.82, 0.92);
    group.add(sack);
    group.add(part(new THREE.CylinderGeometry(0.055, 0.085, 0.11, 6),
                   materialFor(darken(PALETTE.sack, 0.3), { roughness: 0.99 }),
                   [-width * 0.4 + i * 0.52, 0.48, z]));
  }
}

export function create({ width = 2.8, depth = 1.9, height = 2.4, stripes = 8, seed = 1 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const wood = materialFor(PALETTE.timber, { roughness: 0.78 });
  const dark = materialFor(PALETTE.dark, { roughness: 0.86 });
  const rope = materialFor(PALETTE.rope, { roughness: 0.98 });
  const ridgeY = height + 0.32, drop = 0.34, counterY = 0.92;

  const post = bevelledBox({ width: 0.09, height, depth: 0.09, bevel: 0.02 });
  const lash = new THREE.TorusGeometry(0.068, 0.016, 4, 10);
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const x = sx * (width / 2 - 0.08), z = sz * (depth / 2 - 0.06);
      group.add(part(post, sz > 0 ? wood : dark, [x, height / 2, z]));
      // Rope lashing at every post head: three centimetres of cord, the finest thing here.
      for (const y of [height - 0.14, height - 0.26]) {
        group.add(part(lash, rope, [x, y, z], [Math.PI / 2, 0, (random() - 0.5) * 0.3]));
      }
      group.add(part(bevelledBox({ width: 0.22, height: 0.07, depth: 0.22, bevel: 0.02 }),
                     materialFor(darken(PALETTE.timber, 0.35), { roughness: 0.9 }),
                     [x, 0.035, z]));
    }
  }
  for (const sz of [1, -1]) {
    group.add(part(bevelledBox({ width: width + 0.06, height: 0.07, depth: 0.07, bevel: 0.018 }),
                   dark, [0, height - 0.05, sz * (depth / 2 - 0.06)]));
  }
  group.add(part(bevelledBox({ width: width + 0.06, height: 0.08, depth: 0.08, bevel: 0.02 }),
                 dark, [0, ridgeY, 0]));
  for (const sx of [1, -1]) {   // king posts carrying the ridge above the eave rails
    group.add(part(bevelledBox({ width: 0.07, height: ridgeY - height + 0.1, depth: 0.07,
                                 bevel: 0.016 }), wood,
                   [sx * (width / 2 - 0.08), (ridgeY + height - 0.1) / 2, 0]));
  }
  canopy(group, { width: width + 0.24, run: depth + 0.4, ridgeY, drop, stripes, sag: 0.13,
                  seed: seed + 5 });

  // Counter: three boards with real gaps, on two trestles, with a kick board below.
  for (let i = 0; i < 3; i++) {
    group.add(part(bevelledBox({ width: width - 0.1, height: 0.05, depth: 0.19, bevel: 0.012 }),
                   materialFor(lighten(PALETTE.timber, 0.06 * i), { roughness: 0.7 - i * 0.05 }),
                   [0, counterY, depth / 2 - 0.12 - i * 0.21]));
  }
  for (const sx of [1, -1]) {
    for (const lean of [1, -1]) {
      group.add(part(bevelledBox({ width: 0.07, height: counterY - 0.04, depth: 0.07,
                                   bevel: 0.016 }), wood,
                     [sx * (width / 2 - 0.32) + lean * 0.13, counterY / 2 - 0.02,
                      depth / 2 - 0.28], [lean * 0.16, 0, 0]));
    }
  }
  group.add(part(bevelledBox({ width: width - 0.24, height: 0.34, depth: 0.04, bevel: 0.012 }),
                 dark, [0, counterY - 0.28, depth / 2 - 0.06]));
  goods(group, { width, depth, counterY, seed: seed + 17 });

  const board = sign({ boardWidth: 0.62, boardHeight: 0.4, bracket: false, drop: 0.22,
                       boardColor: PALETTE.dark, seed: seed + 31 });
  board.group.position.set(-width * 0.3, height - 0.12, depth / 2 - 0.05);
  group.add(board.group);

  // 'front' comes first: it is the side a path must meet, and it is what a detail view frames.
  const sockets = [socket('front', [0, 0, depth / 2 + 0.15], [0, 0, 1]),
                   socket('counter', [0, counterY, depth / 2 - 0.2], [0, 1, 0]),
                   socket('goods-left', [-width * 0.3, counterY + 0.32, depth / 2 - 0.35], [0, 1, 0]),
                   socket('goods-right', [width * 0.3, counterY + 0.12, depth / 2 - 0.32], [0, 1, 0]),
                   socket('sign', [-width * 0.3, height - 0.12, depth / 2 - 0.05], [0, 0, 1]),
                   socket('keeper', [0, 0, -depth / 2 - 0.35], [0, 0, -1]),
                   socket('ridge', [0, ridgeY, 0], [0, 1, 0])];
  const colliders = [collider('frame', [0, height / 2, 0], [width, height, depth]),
                     collider('counter', [0, counterY - 0.2, depth / 2 - 0.2],
                              [width, 0.45, 0.65]),
                     collider('canopy', [0, ridgeY - drop / 2, 0],
                              [width + 0.3, 0.5, depth + 0.5])];
  return { group, sockets, colliders };
}
