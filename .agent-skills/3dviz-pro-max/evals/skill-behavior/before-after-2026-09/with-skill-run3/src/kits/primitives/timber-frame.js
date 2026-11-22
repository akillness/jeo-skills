// timber-frame.js - exposed half-timber framing that stands proud of a wall face.
// A frame flush with the plaster is a stripe; only a frame with real thickness throws the
// shadow that makes a building read as built out of pieces.
// Detail ladder: post rhythm breaking the wall / posts, top plate, sill beam and corner braces
//                standing 7 cm proud of the plaster / chamfers, 9 cm peg heads at every joint.
// Local frame: the wall face is the XY plane at z = 0; the frame grows toward +Z.
// Sockets: plate (top plate centre), sill (sill beam centre).
import { THREE, bevelledBox, materialFor, part, scatterInstances, seeded,
         socket } from '../kit-core.js';
import { darken, lighten } from './bevelled-box.js';

const EMBED = 0.02;   // how far a beam is buried in the plaster; the rest stands proud

export function create({ width = 4.2, height = 2.4, posts = 4, depth = 0.09, postWidth = 0.16,
                         braces = true, braceRun = 0, midRail = false, color = '#6b4f34',
                         pegColor = '#a07a52', seed = 1 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const beamZ = depth / 2 - EMBED;
  const wood = materialFor(color, { roughness: 0.74 });
  const dark = materialFor(darken(color, 0.22), { roughness: 0.8 });
  const pegs = [];

  const plateH = 0.18, sillH = 0.16;
  const inner = height - plateH - sillH;
  const post = bevelledBox({ width: postWidth, height: inner, depth, bevel: 0.03 });
  for (let i = 0; i < posts; i++) {
    // Seeded placement jitter: two walls from two seeds are visibly different buildings.
    const base = (-0.5 + (i + 0.5) / posts) * (width - postWidth * 2.4);
    const x = base + (random() - 0.5) * (width / posts) * 0.18;
    group.add(part(post, i % 2 ? wood : dark, [x, sillH + inner / 2, beamZ]));
    const pegZ = beamZ + depth / 2 + 0.014;
    pegs.push([x, sillH + 0.13, pegZ], [x, height - plateH - 0.13, pegZ]);
    if (midRail) pegs.push([x, sillH + inner * 0.52, pegZ]);
  }
  group.add(part(bevelledBox({ width, height: plateH, depth, bevel: 0.03 }), wood,
                 [0, height - plateH / 2, beamZ]));
  group.add(part(bevelledBox({ width, height: sillH, depth, bevel: 0.03 }), wood,
                 [0, sillH / 2, beamZ]));
  if (midRail) {
    group.add(part(bevelledBox({ width, height: 0.13, depth: depth * 0.85, bevel: 0.025 }), dark,
                   [0, sillH + inner * 0.52, beamZ]));
  }

  // Corner braces: the diagonal is what tells a viewer the frame carries load, not decoration.
  if (braces) {
    const run = braceRun > 0 ? braceRun : Math.min(width * 0.22, inner * 0.85);
    const length = Math.hypot(run, run) + 0.06;
    for (const side of [1, -1]) {
      group.add(part(bevelledBox({ width: 0.13, height: length, depth: depth * 0.9, bevel: 0.026 }),
                     wood, [side * (width / 2 - run / 2 - postWidth * 0.6),
                            sillH + run / 2 + 0.02, beamZ - 0.008],
                     [0, 0, side * Math.PI / 4]));
      pegs.push([side * (width / 2 - postWidth * 0.9), sillH + 0.14, beamZ + depth / 2 + 0.012]);
    }
  }

  // Peg heads: hexagonal, 7 cm across, two per post. The fine band of every timber building.
  const peg = new THREE.CylinderGeometry(0.042, 0.048, 0.04, 6);
  peg.rotateX(Math.PI / 2);
  group.add(scatterInstances(peg, materialFor(pegColor, { roughness: 0.52 }),
                             pegs.map(position => ({ position, hue: (random() - 0.5) * 0.05 }))));
  // A single lighter rubbed band along the sill beam: weather, not a texture map.
  group.add(part(bevelledBox({ width: width * 0.8, height: 0.022, depth: 0.022, bevel: 0.006 }),
                 materialFor(lighten(color, 0.3), { roughness: 0.5 }),
                 [(random() - 0.5) * width * 0.1, sillH - 0.012, beamZ + depth / 2 - 0.01]));

  const sockets = [socket('plate', [0, height - plateH / 2, beamZ + depth / 2], [0, 0, 1]),
                   socket('sill', [0, sillH / 2, beamZ + depth / 2], [0, 0, 1])];
  return { group, sockets, colliders: [] };
}
