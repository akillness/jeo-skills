// inset-window.js - a window recessed behind the wall face: reveal, frame, glazing bars,
// emissive glass, sill board and its drip groove. This is what makes a wall read as thick.
// Detail ladder: dark recess in the wall plane / frame and glazing bars standing proud of
//                the glass, sill projecting past the wall / drip groove, corner pegs, hue jitter.
// Local frame: the opening spans XY at the wall face, looking down +Z; the caller positions it.
// Sockets: glass (the pane centre, pushed back by inset), sill (the outer lip of the sill board).
import { THREE, bevelledBox, materialFor, part, seeded, socket } from '../kit-core.js';
import { darken, lighten } from './bevelled-box.js';

const BAR_D = 0.035;

/** Vertical and horizontal glazing bars laid over the pane, in front of it, never coplanar. */
function glazingBars(group, { width, height, bars, rows, z, material }) {
  const inner = { w: width - 0.02, h: height - 0.02 };
  for (let i = 1; i <= bars; i++) {
    const x = -inner.w / 2 + (i * inner.w) / (bars + 1);
    group.add(part(bevelledBox({ width: 0.03, height: inner.h, depth: BAR_D, bevel: 0.008 }),
                   material, [x, 0, z]));
  }
  for (let i = 1; i <= rows; i++) {
    const y = -inner.h / 2 + (i * inner.h) / (rows + 1);
    group.add(part(bevelledBox({ width: inner.w, height: 0.03, depth: BAR_D, bevel: 0.008 }),
                   material, [0, y, z]));
  }
}

export function create({ width = 0.8, height = 0.9, inset = 0.12, frame = 0.07, bars = 1,
                         rows = 1, sill = true, frameColor = '#6b4f34', glassColor = '#2f3a3f',
                         stoneColor = '#b3aa9c', emissive = null, emissiveIntensity = 0,
                         seed = 1 } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  const wood = materialFor(frameColor, { roughness: 0.72 });
  // Per-instance hue jitter on the glass so a row of windows is not one repeated decal.
  const tint = new THREE.Color(glassColor);
  tint.offsetHSL((random() - 0.5) * 0.05, 0, (random() - 0.5) * 0.04);
  const pane = materialFor(`#${tint.getHexString()}`, { roughness: 0.18, metalness: 0.05,
                                                        emissive, emissiveIntensity });

  // Reveal: four dark jambs lining the hole, so the recess has sides rather than a flat back.
  const reveal = materialFor(darken(stoneColor, 0.55), { roughness: 0.95 });
  const jambs = [[width, 0.02, 0, height / 2], [width, 0.02, 0, -height / 2],
                 [0.02, height, width / 2, 0], [0.02, height, -width / 2, 0]];
  for (const [w, h, x, y] of jambs) {
    group.add(part(bevelledBox({ width: w, height: h, depth: inset, bevel: 0.004 }), reveal,
                   [x, y, -inset / 2]));
  }

  group.add(part(bevelledBox({ width: width - 0.04, height: height - 0.04, depth: 0.02,
                               bevel: 0.006 }), pane, [0, 0, -inset + 0.04]));
  const barZ = -inset + 0.055 + BAR_D / 2;
  glazingBars(group, { width, height, bars, rows, z: barZ, material: wood });

  // The frame itself sits in the reveal mouth and stands 2 cm out of the wall face.
  const cheeks = [[width + frame, frame, 0, (height + frame) / 2],
                  [width + frame, frame, 0, -(height + frame) / 2],
                  [frame, height + frame, (width + frame) / 2, 0],
                  [frame, height + frame, -(width + frame) / 2, 0]];
  for (const [w, h, x, y] of cheeks) {
    group.add(part(bevelledBox({ width: w, height: h, depth: 0.07, bevel: 0.014 }), wood,
                   [x, y, -0.015]));
  }

  if (sill) {
    const board = materialFor(stoneColor, { roughness: 0.88 });
    const lip = -height / 2 - frame / 2 - 0.035;
    group.add(part(bevelledBox({ width: width + frame + 0.16, height: 0.07, depth: 0.22,
                                 bevel: 0.018 }), board, [0, lip, 0.06]));
    // Drip groove: a 2.5 cm shadow line under the sill lip. The smallest feature authored here.
    group.add(part(bevelledBox({ width: width + frame + 0.09, height: 0.024, depth: 0.028,
                                 bevel: 0.006 }), materialFor(darken(stoneColor, 0.72),
                                                              { roughness: 0.97 }),
                   [0, lip - 0.047, 0.14]));
    // Head drip: a lighter weathered band above the frame, where rain runs off the lintel.
    group.add(part(bevelledBox({ width: width + frame + 0.12, height: 0.06, depth: 0.14,
                                 bevel: 0.016 }), materialFor(lighten(stoneColor, 0.14),
                                                              { roughness: 0.9 }),
                   [0, height / 2 + frame / 2 + 0.05, 0.035]));
  }

  const sockets = [socket('glass', [0, 0, -inset + 0.04], [0, 0, 1]),
                   socket('sill', [0, -height / 2 - frame / 2 - 0.07, 0.14], [0, 1, 0])];
  return { group, sockets, colliders: [] };
}
