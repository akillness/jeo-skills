// stone-bridge.js - a single segmental-arch stone bridge: voussoir ring with a raised keystone,
// coursed spandrels, cutwaters, a cobbled deck and a coped parapet on both sides.
// Detail ladder: the arch void and its reflected line, the parapet running the whole length
//                / individual voussoirs, spandrel coursing, cutwaters, cobble courses
//                / raised keystone, chamfered coping arris, worn cobbles, drip line under coping.
// The deck runs along X; the water passes along Z beneath the arch. y = 0 is the river bed.
import { THREE, bevelledBox, collider, materialFor, part, scatterInstances, seeded,
         socket } from '../kit-core.js';
import { darken, lighten } from '../primitives/bevelled-box.js';
import { create as railRun } from '../primitives/railing.js';

const PALETTE = { stone: '#a79c8c', dark: '#7e7466', cobble: '#8f887c', moss: '#5f6d4b',
                  parapet: '#8e8577' };

/** Geometry of a segmental arch: the circle that passes through both springings and the crown. */
function archGeometry(span, rise, springY) {
  const radius = (span * span / 4 + rise * rise) / (2 * rise);
  return { radius, centreY: springY + rise - radius, half: Math.asin(span / 2 / radius) };
}

/** The voussoir ring: wedge blocks around the arc, the keystone raised and lighter. */
function voussoirs(group, { arch, width, count, thickness, seed }) {
  const random = seeded(seed);
  const stone = materialFor(PALETTE.stone, { roughness: 0.92 });
  const light = materialFor(lighten(PALETTE.stone, 0.2), { roughness: 0.82 });
  const dark = materialFor(darken(PALETTE.stone, 0.22), { roughness: 0.95 });
  const tangential = (2 * arch.half * arch.radius) / count * 1.06;
  const block = bevelledBox({ width: tangential, height: thickness, depth: width + 0.14,
                              bevel: 0.022 });
  const keyIndex = Math.floor(count / 2);
  for (let i = 0; i < count; i++) {
    const a = -arch.half + ((i + 0.5) / count) * 2 * arch.half;
    const key = i === keyIndex;
    const r = arch.radius + (key ? 0.07 : 0);
    group.add(part(block, key ? light : (i % 2 ? stone : dark),
                   [Math.sin(a) * r, arch.centreY + Math.cos(a) * r, 0], [0, 0, -a]));
    if (!key) continue;
    group.add(part(bevelledBox({ width: tangential * 0.6, height: 0.12, depth: width + 0.2,
                                 bevel: 0.02 }), light,
                   [0, arch.centreY + arch.radius + thickness / 2 + 0.1, 0]));
  }
  random();
}

/** The spandrel mass, sliced across the span. Each slice starts on the arch extrados, so the
 *  void under the arch is real, and the slice joints read as masonry coursing. */
function spandrel(group, { arch, span, length, width, deckY, slices, thickness, seed }) {
  const random = seeded(seed);
  const step = length / slices;
  const extrados = arch.radius + thickness / 2;
  for (let i = 0; i < slices; i++) {
    const x = -length / 2 + (i + 0.5) * step;
    let base = 0;
    if (Math.abs(x) < span / 2 + step) {
      const dy = extrados * extrados - x * x;
      if (dy > 0) base = Math.max(0, arch.centreY + Math.sqrt(dy));
    }
    const height = deckY - 0.16 - base;
    if (height <= 0.05) continue;
    const shade = i % 2 ? darken(PALETTE.stone, 0.14) : lighten(PALETTE.stone, 0.07);
    group.add(part(bevelledBox({ width: step + 0.01, height, depth: width, bevel: 0.02 }),
                   materialFor(shade, { roughness: 0.9 + (i % 2) * 0.05 }),
                   [x, base + height / 2, 0]));
  }
  // Moss at the springing: two dark patches where the masonry meets the water line.
  for (const side of [1, -1]) {
    group.add(part(bevelledBox({ width: 0.5 + random() * 0.4, height: 0.13, depth: width - 0.05,
                                 bevel: 0.02 }), materialFor(PALETTE.moss, { roughness: 0.99 }),
                   [side * (span / 2 - 0.3), 0.07 + random() * 0.06, 0]));
  }
}

/** Cobbled deck: courses across the width, plus loose cobbles for the fine band. */
function deck(group, { length, width, deckY, seed }) {
  const random = seeded(seed);
  const courses = Math.round(length / 0.42), across = 7;
  const cobble = bevelledBox({ width: length / courses - 0.02, height: 0.09,
                               depth: width / across - 0.025, bevel: 0.014 });
  const placements = [];
  for (let i = 0; i < courses; i++) {
    for (let j = 0; j < across; j++) {
      const x = -length / 2 + (i + 0.5) * (length / courses);
      const z = -width / 2 + (j + 0.5) * (width / across);
      placements.push({ position: [x + (random() - 0.5) * 0.02, deckY - 0.045,
                                   z + (random() - 0.5) * 0.02],
                        rotation: [0, (random() - 0.5) * 0.12, 0],
                        scale: [0.94 + random() * 0.1, 1, 0.92 + random() * 0.12],
                        hue: (random() - 0.5) * 0.07 });
    }
  }
  group.add(scatterInstances(cobble, materialFor(PALETTE.cobble,
                                                 { roughness: 0.88 }), placements));
  group.add(part(bevelledBox({ width: length, height: 0.16, depth: width, bevel: 0.02 }),
                 materialFor(darken(PALETTE.stone, 0.3), { roughness: 0.94 }),
                 [0, deckY - 0.16, 0]));
}

export function create({ span = 6, width = 3.4, rise = 1.5, springHeight = 0.9, voussoirCount = 15,
                         approach = 1.7, parapetHeight = 0.95, seed = 1 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const arch = archGeometry(span, rise, springHeight);
  const thickness = 0.45;
  const length = span + 2 * approach;
  const deckY = arch.centreY + arch.radius + thickness / 2 + 0.3;

  spandrel(group, { arch, span, length, width, deckY, slices: 22, thickness, seed: seed + 2 });
  voussoirs(group, { arch, width, count: voussoirCount, thickness, seed: seed + 5 });
  deck(group, { length, width, deckY, seed: seed + 9 });

  // Cutwaters: wedge piers at both springings, on both faces, breaking the flow and the elevation.
  const wedge = bevelledBox({ width: 0.62, height: springHeight + 0.75, depth: 0.62, bevel: 0.03 });
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      group.add(part(wedge, materialFor(darken(PALETTE.stone, 0.1), { roughness: 0.93 }),
                     [sx * (span / 2 + 0.1), (springHeight + 0.75) / 2,
                      sz * (width / 2 + 0.06)], [0, Math.PI / 4, 0]));
      group.add(part(bevelledBox({ width: 0.72, height: 0.14, depth: 0.72, bevel: 0.03 }),
                     materialFor(lighten(PALETTE.stone, 0.16), { roughness: 0.75 }),
                     [sx * (span / 2 + 0.1), springHeight + 0.8,
                      sz * (width / 2 + 0.06)], [0, Math.PI / 4, 0]));
    }
  }
  // String course: the projecting band the parapet stands on, running the full length.
  for (const sz of [1, -1]) {
    group.add(part(bevelledBox({ width: length + 0.08, height: 0.13, depth: 0.18, bevel: 0.026 }),
                   materialFor(darken(PALETTE.stone, 0.24), { roughness: 0.9 }),
                   [0, deckY - 0.22, sz * (width / 2 + 0.03)]));
    const rail = railRun({ length, height: parapetHeight, style: 'parapet', thickness: 0.26,
                           color: PALETTE.parapet, seed: seed + 30 + sz });
    rail.group.position.set(0, deckY - 0.05, sz * (width / 2 - 0.11));
    group.add(rail.group);
  }
  // A slumped coping stone: one block out of line, seeded, the bridge's only asymmetry.
  group.add(part(bevelledBox({ width: 0.55, height: 0.16, depth: 0.42, bevel: 0.028 }),
                 materialFor(lighten(PALETTE.stone, 0.1), { roughness: 0.86 }),
                 [(random() - 0.5) * length * 0.5, deckY + parapetHeight - 0.12,
                  (width / 2 - 0.11)], [0.04, (random() - 0.5) * 0.16, 0.05]));

  const sockets = [socket('deck-centre', [0, deckY, 0], [0, 1, 0]),
                   socket('deck-west', [-length / 2, deckY, 0], [-1, 0, 0]),
                   socket('deck-east', [length / 2, deckY, 0], [1, 0, 0]),
                   socket('keystone', [0, arch.centreY + arch.radius + thickness / 2,
                                       width / 2 + 0.07], [0, 0, 1]),
                   socket('lantern', [-length * 0.32, deckY + parapetHeight,
                                      width / 2 - 0.11], [0, 1, 0])];
  const colliders = [collider('deck', [0, deckY - 0.08, 0], [length, 0.32, width]),
                     collider('parapet-north', [0, deckY + parapetHeight / 2, width / 2 - 0.05],
                              [length, parapetHeight, 0.4]),
                     collider('parapet-south', [0, deckY + parapetHeight / 2, -width / 2 + 0.05],
                              [length, parapetHeight, 0.4]),
                     collider('abutments', [0, deckY / 2, 0], [length, deckY, width])];
  return { group, sockets, colliders };
}
