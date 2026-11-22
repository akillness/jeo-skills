// village-plan.js - the authored site plan. Hand-placed rather than seeded, because the look
// asks for a specific composition: one landmark at 2x its neighbours' height standing on the
// east bluff in the right third of the frame, the bridge as the only large curved mass, and the
// square held on the west river terrace. Every pad here is stamped into the height field, so a
// building stands on level ground and the lanes climb to meet the bridge.
import { TERRACE_Y } from './terrain.js';

const T = TERRACE_Y;

/** Building sites. `pad` is {r, blend, y}: the disc of ground levelled under the structure. */
export const SITES = [
  { id: 'cottage-hero', kind: 'timber-cottage', tier: 'T3', name: "Ferryman's cottage",
    blurb: 'Hero build: Blender-baked T3 hero from the cottage kit. Two bays, tiled gable, chimney.',
    x: -4.6, z: -5.2, yaw: 0.12, pad: { r: 4.0, blend: 3.0, y: T }, params: {}, focus: 8.5 },
  { id: 'cottage-weaver', kind: 'timber-cottage', tier: 'T2', name: "Weaver's cottage",
    blurb: 'Single storey, wider plan, seed 7 - the same kit, a visibly different building.',
    x: -12.6, z: -3.6, yaw: 0.42, pad: { r: 4.0, blend: 3.0, y: T },
    params: { width: 4.8, depth: 3.6, seed: 7, roofPitchDeg: 46 }, focus: 8 },
  { id: 'cottage-tall', kind: 'timber-cottage', tier: 'T2', name: 'Two-storey river house',
    blurb: 'Two storeys on the same footprint: the kit takes storeys, so height varies by param.',
    x: -9.2, z: 6.0, yaw: 3.0, pad: { r: 4.0, blend: 3.0, y: T },
    params: { width: 4.4, depth: 3.4, storeys: 2, seed: 13, roofPitchDeg: 38 }, focus: 9.5 },
  { id: 'cottage-lane', kind: 'timber-cottage', tier: 'T2', name: 'Lane-end cottage',
    blurb: 'The smallest house on the plan, turned off the lane at 51 degrees.',
    x: -18.4, z: -2.0, yaw: 0.9, pad: { r: 3.6, blend: 2.8, y: T },
    params: { width: 3.8, depth: 3.2, seed: 21 }, focus: 7.5 },
  { id: 'long-hall', kind: 'long-hall', tier: 'T2', name: 'Guild long hall',
    blurb: 'Five-bay timber hall: two doors, a covered porch and two chimneys on one ridge.',
    x: -15.0, z: 9.2, yaw: 3.24, pad: { r: 7.5, blend: 3.4, y: T },
    params: { width: 11, depth: 5.2, bayCount: 5, seed: 3 }, focus: 13 },
  { id: 'stall-fruit', kind: 'market-stall', tier: 'T2', name: 'Fruit stall',
    blurb: 'Trestle stall, eight canopy stripes, twenty-two pieces of produce with hue jitter.',
    x: -2.4, z: 3.6, yaw: 3.05, pad: { r: 2.4, blend: 2.0, y: T }, params: { seed: 2 }, focus: 5 },
  { id: 'stall-cloth', kind: 'market-stall', tier: 'T2', name: 'Cloth stall',
    blurb: 'The same kit at seed 5 and ten stripes: a different stall, not a clone.',
    x: -5.2, z: 4.4, yaw: 3.32, pad: { r: 2.4, blend: 2.0, y: T },
    params: { seed: 5, stripes: 10, width: 3.1 }, focus: 5 },
  { id: 'stall-river', kind: 'market-stall', tier: 'T2', name: 'Riverside stall',
    blurb: 'Turned to face the quay, seed 11, a shallower canopy.',
    x: 0.6, z: -2.8, yaw: -1.35, pad: { r: 2.4, blend: 2.0, y: T },
    params: { seed: 11, height: 2.25, depth: 2.1 }, focus: 5 },
  { id: 'watermill', kind: 'watermill', tier: 'T2', name: 'River mill',
    blurb: 'Kept at T2, not the baked T3 hero, because T2 still turns its wheel; the bake is static.',
    x: 0.8, z: -12.5, yaw: 0, pad: { r: 3.2, blend: 2.6, y: -0.6 },
    params: { width: 6, depth: 4.5, wheelRadius: 1.6, speedRadPerSec: 0.5, seed: 4 }, focus: 11 },
  { id: 'stone-bridge', kind: 'stone-bridge', tier: 'T2', name: 'Lantern bridge',
    blurb: 'The only large curved mass in the scene; fifteen voussoirs and a raised keystone.',
    x: 7.2, z: 0, yaw: 0, y: -1.05, pad: null,
    params: { span: 7.5, width: 3.6, rise: 1.05, springHeight: 0.55, voussoirCount: 15,
              approach: 1.7, seed: 6 }, focus: 12 },
  { id: 'guildhall', kind: 'stone-guildhall', tier: 'GLB', name: 'Stone guildhall',
    blurb: 'Blender-authored GLB hero (8.0 x 6.6 m, 8 908 tris) loaded through its kit wrapper.',
    x: 16.4, z: -5.0, yaw: -0.62, pad: { r: 6.5, blend: 3.4, y: 2.9 }, params: {}, focus: 14 },
  { id: 'round-tower', kind: 'round-tower', tier: 'T2', name: 'Watch tower',
    blurb: 'The landmark: 9.5 m of battered stone on a 3.4 m bluff, crowned with crenellations.',
    x: 19.6, z: 6.4, yaw: 3.6, pad: { r: 4.2, blend: 3.2, y: 3.4 },
    params: { height: 9.5, baseRadius: 2.3, topRadius: 1.8, merlons: 14, seed: 8 }, focus: 17 }
];

/** Extra pads with no building on them: the two bridge heads the lanes ramp up to. */
export const EXTRA_PADS = [
  { x: 2.2, z: 0.1, r: 2.2, blend: 3.6, y: 1.0 },
  { x: 12.6, z: 0.1, r: 2.4, blend: 3.6, y: 1.0 }
];

export const LANES = [
  { width: 3.0, points: [[-25, 5.4], [-18, 3.6], [-12, 1.9], [-6, 1.0], [-1.5, 0.4], [2.2, 0.1]] },
  { width: 3.0, points: [[12.6, 0.1], [15.4, 1.4], [18.0, 4.2], [19.6, 6.4]] },
  { width: 2.1, points: [[15.4, 1.4], [16.2, -2.0], [16.4, -5.0]] },
  { width: 2.2, points: [[-6, 1.0], [-6.6, -3.4], [-5.6, -8.2], [-2.4, -11.4], [0.8, -12.5]] },
  { width: 1.8, points: [[-12, 1.9], [-13.4, 5.6], [-15.0, 9.2]] }
];

export const pads = () => [
  ...SITES.filter(site => site.pad).map(site => ({ x: site.x, z: site.z, ...site.pad })),
  ...EXTRA_PADS
];
