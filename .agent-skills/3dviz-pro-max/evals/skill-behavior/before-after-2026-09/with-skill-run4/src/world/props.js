// props.js - the objects that say people live here: a well and a cart on the square (T2, the
// tier the viewer walks up to), barrels, crates, fences, a clothesline and two signboards (T1
// where they sit in the middle distance). Everything is a kit blueprint; nothing is authored here.
import { THREE, buildKit, seeded } from '../kits/kit-core.js';
import { create as well } from '../kits/props/well.js';
import { create as cart } from '../kits/props/cart.js';
import { create as barrel } from '../kits/props/barrel.js';
import { create as crate } from '../kits/props/crate.js';
import { create as fenceRun } from '../kits/props/fence-run.js';
import { create as clothesline } from '../kits/props/clothesline.js';
import { create as signboard } from '../kits/props/signboard.js';
import { surfaceFor } from './kit-families.js';

const FACTORY = { well, cart, barrel, crate, 'fence-run': fenceRun, clothesline, signboard };
// [kind, x, z, yaw, tier, params]
const PLACED = [
  ['well', -7.6, -1.6, 0.3, 'T2', { seed: 2 }],
  ['cart', -1.9, -1.2, 2.35, 'T2', { seed: 5 }],
  ['signboard', -3.1, 1.0, 1.75, 'T2', { seed: 3 }],
  ['signboard', 13.6, 0.9, -1.5, 'T1', { seed: 9, height: 2.4 }],
  ['barrel', -0.4, -3.9, 0.6, 'T1', { seed: 1 }],
  ['barrel', -0.9, -4.5, 1.9, 'T1', { seed: 4 }],
  ['barrel', 2.1, -11.4, 0.2, 'T1', { seed: 6, height: 1.02 }],
  ['barrel', 2.6, -12.2, 2.4, 'T1', { seed: 8 }],
  ['crate', -5.9, 3.1, 0.4, 'T1', { seed: 2 }],
  ['crate', -6.3, 3.4, 1.2, 'T1', { seed: 7, size: 0.54 }],
  ['crate', -1.6, 4.6, 2.8, 'T1', { seed: 3 }],
  ['crate', 2.3, -13.4, 0.9, 'T1', { seed: 5, size: 0.7 }],
  ['clothesline', -11.4, -6.6, 0.5, 'T1', { seed: 4, span: 4.6 }],
  ['clothesline', -20.2, -1.0, 1.9, 'T1', { seed: 9, span: 3.8, sheets: 4 }],
  ['fence-run', -23.5, -9.5, 0.35, 'T1', { seed: 1, length_m: 7.0, posts: 6 }],
  ['fence-run', -18.2, -12.8, 1.85, 'T1', { seed: 3, length_m: 6.2, posts: 5 }],
  ['fence-run', -14.6, -14.2, 0.15, 'T1', { seed: 5, length_m: 5.4, posts: 5 }],
  ['fence-run', -9.6, 8.2, 3.05, 'T1', { seed: 7, length_m: 5.0, posts: 4 }]
];

export function createProps(heightAt) {
  const group = new THREE.Group();
  const random = seeded(5150);
  for (const [kind, x, z, yaw, tier, params] of PLACED) {
    const seed = params.seed ?? 1;
    const kit = tier === 'T2'
      ? buildKit(FACTORY[kind], { ...params, tier: 'T2',
          surface: surfaceFor(kind, seed, { size: 384, samples: 12 }) })
      : FACTORY[kind](params);
    kit.group.position.set(x, heightAt(x, z), z);
    kit.group.rotation.y = yaw + (random() - 0.5) * 0.08;
    group.add(kit.group);
  }
  return { group };
}
