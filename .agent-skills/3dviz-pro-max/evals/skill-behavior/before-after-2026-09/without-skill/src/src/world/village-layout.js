// Where everything stands, who lives there, and what the dossier says about it.

import * as THREE from 'three';
import { paperMaterial, PALETTE } from './noise-and-palette.js';
import { groundY } from './terrain.js';
import { box, part } from './building-kit.js';
import { cottage, mushroomHouse, windmill, watchtower } from './building-kinds.js';
import { stiltHouse, marketStall, moonwell, bridge } from './building-kinds-2.js';

export const VILLAGE = [
  { id: 'hall', name: 'Hearthmoot Hall', kind: 'Moot house', x: 0, z: -12, rot: 0.05, r: 5,
    make: () => cottage({ width: 8, depth: 5.4, stories: 2, roof: PALETTE.roofPlum, roofHeight: 3.2 }),
    desc: 'Where the hollow argues, votes, and then eats. Its rafters are folded from a single hundred-year page.',
    stats: { Households: '—', Founded: 'Year 4', Craft: 'Council & feasts' } },

  { id: 'lanternworks', name: 'Emberglass Lanternworks', kind: 'Workshop', x: -14, z: -3, rot: 0.5, r: 4,
    make: () => cottage({ width: 6, depth: 4.4, roof: PALETTE.roofOchre, wall: PALETTE.paperWarm, roofHeight: 2.6 }),
    desc: 'Every lantern in Emberhollow was blown here. The kiln has not gone cold in nine winters.',
    stats: { Households: '2', Founded: 'Year 11', Craft: 'Glass & flame' } },

  { id: 'teahouse', name: 'Toadstool Tea House', kind: 'Tea house', x: 12, z: -9, rot: -0.4, r: 4,
    make: () => mushroomHouse({ radius: 2.6, height: 3.6 }),
    desc: 'Grown, not built. The cap sheds rain and the stem keeps the kettle warm without any fire at all.',
    stats: { Households: '1', Founded: 'Grown, Year 6', Craft: 'Moss tea' } },

  { id: 'quill', name: 'The Curling Quill', kind: 'Bindery', x: 15, z: 5, rot: -1.0, r: 3.6,
    make: () => cottage({ width: 4.4, depth: 4.0, stories: 2, storyH: 2.4, roof: PALETTE.roofIndigo, roofHeight: 2.8 }),
    desc: 'A leaning two-storey bindery. The upper floor oversails the lane so readers stay dry.',
    stats: { Households: '1', Founded: 'Year 19', Craft: 'Books & maps' } },

  { id: 'bramblegate', name: 'Bramblegate Cottage', kind: 'Dwelling', x: -16, z: 9, rot: 0.9, r: 3.4,
    make: () => cottage({ width: 5, depth: 4, roof: PALETTE.roofTeal, roofHeight: 2.2 }),
    desc: 'The oldest roof in the hollow, patched so often that none of the original paper remains.',
    stats: { Households: '1', Founded: 'Year 2', Craft: 'Beekeeping' } },

  { id: 'loomhouse', name: 'Old Weft Loomhouse', kind: 'Weavery', x: -5, z: 14, rot: 3.0, r: 3.8,
    make: () => cottage({ width: 6.4, depth: 4.2, roof: PALETTE.roofOchre, roofHeight: 2.3 }),
    desc: 'Four looms, one window, and a great deal of opinion about dye.',
    stats: { Households: '3', Founded: 'Year 8', Craft: 'Cloth & dye' } },

  { id: 'sporewick', name: 'Sporewick Bunkhouse', kind: 'Lodging', x: 21, z: 14, rot: 0.7, r: 4,
    make: () => mushroomHouse({ radius: 2.2, height: 4.2, cap: PALETTE.roofPlum }),
    desc: 'Bunks for travellers who arrive after the bridge lanterns are lit. Snoring is traditional.',
    stats: { Households: '6 beds', Founded: 'Year 21', Craft: 'Lodging' } },

  { id: 'mill', name: 'Windwhistle Mill', kind: 'Mill', x: 31, z: -23, rot: -0.35, r: 5,
    make: () => windmill({ height: 9.5 }),
    desc: 'Set on the east terrace to catch the valley draught. Its sails have not stopped since it was raised.',
    stats: { Households: '2', Founded: 'Year 14', Craft: 'Flour & sawing' } },

  { id: 'watch', name: 'Watch of Nine Bells', kind: 'Beacon tower', x: -31, z: -27, rot: 0.2, r: 4,
    make: () => watchtower({ height: 13.5 }),
    desc: 'Nine bells, one beacon. Lit at dusk so nobody walking the ridge road loses the hollow.',
    stats: { Households: '1 watcher', Founded: 'Year 5', Craft: 'Signal fire' } },

  { id: 'market', name: 'Fernwick Stall', kind: 'Market stall', x: 6, z: 7, rot: -0.2, r: 3,
    make: () => marketStall({}),
    desc: 'Glowfruit, river salt and rumours. Packed away every night, out again before first light.',
    stats: { Households: '—', Founded: 'Daily', Craft: 'Produce' } },

  { id: 'moonwell', name: 'The Moonwell', kind: 'Well', x: -7, z: 1, rot: 0, r: 2.6,
    make: () => moonwell(),
    desc: 'Fed by the same spring as the river, but its water glows. Nobody has asked why too loudly.',
    stats: { Households: '—', Founded: 'Before the village', Craft: 'Water' } },

  { id: 'mistfoot', name: 'Mistfoot Stilt House', kind: 'River dwelling', x: -17, z: 27, rot: 0.15, r: 4,
    make: () => stiltHouse({ legHeight: 5.0 }),
    desc: 'Stands ankle-deep in the Ember Run. When the water rises, the family simply pulls up the ladder.',
    stats: { Households: '1', Founded: 'Year 17', Craft: 'Fishing' } },

  { id: 'bridge', name: 'Lanternspan Bridge', kind: 'Crossing', x: 2, z: 40, rot: 0, r: 4,
    make: () => bridge({ span: 30, rise: 4.6 }), flat: true,
    desc: 'Thirty paces of arched plank across the Ember Run, lit at both ends so the crossing is never dark.',
    stats: { Households: '—', Founded: 'Year 9', Craft: 'Passage' } }
];

/** Stone plinth so a building sits flush on uneven ground. */
function plinth(x, z, r, baseY) {
  let maxDrop = 0;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    maxDrop = Math.max(maxDrop, baseY - groundY(x + Math.cos(a) * r, z + Math.sin(a) * r));
  }
  const h = Math.max(0.5, maxDrop + 0.7);
  const geo = new THREE.CylinderGeometry(r * 1.02, r * 1.14, h, 9);
  const mesh = part(geo, paperMaterial(PALETTE.stone), 0, -h / 2 + 0.08, 0);
  return mesh;
}

/** Builds every structure, parented to a group, with selection metadata. */
export function createVillage() {
  const group = new THREE.Group();
  group.name = 'village';
  const buildings = [];

  for (const spec of VILLAGE) {
    const holder = new THREE.Group();
    const y = spec.flat ? -1.2 : groundY(spec.x, spec.z);
    holder.position.set(spec.x, y, spec.z);
    holder.rotation.y = spec.rot;

    const model = spec.make();
    holder.add(model);
    if (!spec.flat) holder.add(plinth(spec.x, spec.z, spec.r, y));
    if (spec.flat) {
      const abut = paperMaterial(PALETTE.stone);
      for (const sz of [-1, 1]) {
        holder.add(box(4.4, 6, 4, abut, 0, -2.6, sz * 15.5));
      }
    }

    holder.userData = {
      selectable: true, id: spec.id, name: spec.name, kind: spec.kind,
      desc: spec.desc, stats: spec.stats,
      height: model.userData.height ?? 6,
      radius: spec.r
    };
    if (model.userData.tick) holder.userData.tick = model.userData.tick;
    group.add(holder);
    buildings.push(holder);
  }
  return { group, buildings };
}
