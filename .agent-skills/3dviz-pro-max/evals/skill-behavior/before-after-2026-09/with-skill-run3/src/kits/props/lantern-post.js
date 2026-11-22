// lantern-post.js - a wrought iron lantern post with a glazed head on a scrolled bracket.
// Detail ladder: post + hanging lantern head silhouette, stepped base flare
//                / bracket arm with its diagonal brace, two shaft collars, four glazing bars
//                / bolt domes at the base, 2 cm bevels, per-instance hue jitter on the glass.
// Sockets: base (ground), hook (bracket end), lamp (inside the glazing).
// The glass is emissive geometry only. No light object is created here: lights belong to the
// rig that hosts the kit, so a scene can budget its own shadow-casting lights. Attach a
// PointLight at the `lamp` socket if the look needs a real pool of light.
import { THREE, bevelledBox, collider, materialFor, part, scatterInstances,
         seeded, socket } from '../kit-core.js';

const PALETTE = { collar: '#8d9099', stone: '#a49d90', bolt: '#b6bcc4' };
const SHAFT = 0.1, ARM = 0.46, HEAD = 0.34;

/** Stepped base: plate, flare block and a chamfered plinth, each wider than the one above,
 *  plus the four bolt domes that fix the plate down. A post rising straight out of the
 *  ground reads as a stick; the flare is what makes it read as fixed ironwork. */
function baseFlare(group, bolts, iron, stone, random) {
  group.add(part(bevelledBox({ width: 0.38, height: 0.05, depth: 0.38, bevel: 0.014 }),
                 stone, [0, 0.025, 0]));
  group.add(part(bevelledBox({ width: 0.26, height: 0.11, depth: 0.26, bevel: 0.02 }),
                 iron, [0, 0.105, 0]));
  group.add(part(bevelledBox({ width: 0.17, height: 0.1, depth: 0.17, bevel: 0.024 }),
                 iron, [0, 0.21, 0]));
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      bolts.push({ position: [sx * 0.145 + (random() - 0.5) * 0.006, 0.052,
                              sz * 0.145 + (random() - 0.5) * 0.006], hue: 0 });
    }
  }
}

/** Three tapering shaft segments separated by two collars. The taper is 1 cm over 2.6 m, so
 *  it never reads as a cone; the collars are what the eye actually counts at medium range. */
function shaft(group, bolts, { height, iron, collarMaterial }) {
  const segments = 4;
  const foot = 0.3, run = height - foot;
  const widths = [SHAFT, SHAFT * 0.95, SHAFT * 0.9, SHAFT * 0.85];
  for (let i = 0; i < segments; i++) {
    const y0 = foot + (run * i) / segments, h = run / segments;
    group.add(part(bevelledBox({ width: widths[i], height: h, depth: widths[i], bevel: 0.018 }),
                   iron, [0, y0 + h / 2, 0]));
    if (i === segments - 1) break;
    const w = widths[i] + 0.06;
    group.add(part(bevelledBox({ width: w, height: 0.055, depth: w, bevel: 0.014 }),
                   collarMaterial, [0, y0 + h, 0]));
    // Four bolts on every collar, one per face: the fine-band feature that sits halfway up the
    // shaft, where a close frame can still see it, rather than down on the cropped base plate.
    for (const [dx, dz] of [[w / 2, 0], [-w / 2, 0], [0, w / 2], [0, -w / 2]]) {
      bolts.push({ position: [dx, y0 + h, dz], hue: 0 });
    }
  }
}

/** Horizontal arm, the seven-link scroll curling under it, and the ring the lantern hangs on.
 *  A single diagonal strut reads as engineering; a stepped scroll reads as a smith, and it is
 *  the medium-band feature that survives once the glazing bars fall below a pixel. */
function bracket(group, bolts, { height, iron }) {
  const y = height - 0.18;
  group.add(part(bevelledBox({ width: ARM, height: 0.055, depth: 0.055, bevel: 0.013 }),
                 iron, [ARM / 2 - 0.02, y, 0]));
  const link = bevelledBox({ width: 0.115, height: 0.03, depth: 0.03, bevel: 0.008 });
  const scroll = [];
  const r = 0.3;
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * (Math.PI / 2);
    scroll.push({ position: [0.03 + r * Math.sin(a), y - 0.05 - r * (1 - Math.cos(a)), 0],
                  rotation: [0, 0, Math.PI / 2 - a], hue: 0 });
  }
  group.add(scatterInstances(link, iron, scroll));
  const ring = new THREE.TorusGeometry(0.038, 0.01, 5, 14);
  group.add(part(ring, iron, [ARM - 0.07, y - 0.05, 0]));
  for (const x of [0.035, ARM - 0.1]) bolts.push({ position: [x, y, 0.031], hue: 0 });
  return { armEnd: ARM - 0.07, armY: y - 0.055 };
}

/** The glazed head: four uprights, four inset emissive panes, mid glazing bars, tray and cap. */
function head(group, { armEnd, armY, iron, glassColour, size, swing }) {
  const shell = new THREE.Group();
  shell.position.set(armEnd, 0, 0);
  shell.rotation.y = swing;   // a hanging lantern comes to rest at its own angle, per seed
  group.add(shell);
  group = shell;
  const top = armY - 0.06, bottom = top - size * 1.16;
  const glass = materialFor(glassColour, { roughness: 0.16, emissive: glassColour,
                                           emissiveIntensity: 1.7 });
  group.add(part(bevelledBox({ width: size + 0.06, height: 0.03, depth: size + 0.06, bevel: 0.01 }),
                 iron, [0, bottom, 0]));
  const paneH = size * 1.16 - 0.12;
  for (let face = 0; face < 4; face++) {
    const a = (face * Math.PI) / 2;
    const pane = bevelledBox({ width: size - 0.05, height: paneH, depth: 0.012, bevel: 0.004 });
    pane.translate(0, 0, size / 2 - 0.018);
    group.add(part(pane, glass, [0, (top + bottom) / 2, 0], [0, a, 0]));
    const bar = bevelledBox({ width: size - 0.04, height: 0.018, depth: 0.02, bevel: 0.005 });
    bar.translate(0, 0, size / 2);
    group.add(part(bar, iron, [0, (top + bottom) / 2, 0], [0, a, 0]));
  }
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      group.add(part(bevelledBox({ width: 0.022, height: paneH + 0.05, depth: 0.022, bevel: 0.006 }),
                     iron, [sx * size / 2, (top + bottom) / 2, sz * size / 2]));
    }
  }
  const cap = new THREE.ConeGeometry(size * 0.82, 0.13, 4);
  cap.rotateY(Math.PI / 4);
  group.add(part(cap, iron, [0, top + 0.075, 0]));
  group.add(part(new THREE.SphereGeometry(0.026, 8, 6), iron, [0, top + 0.155, 0]));
  return { lamp: [armEnd, (top + bottom) / 2, 0], bottom };
}

export function create({ height = 2.82, headSize = HEAD, seed = 1,
                         iron = '#5f636d', glass = '#ffd9a0' } = {}) {
  const group = new THREE.Group();
  const random = seeded(seed);
  // Metalness with no environment map renders black: village ironwork is authored as a dark
  // dielectric so it keeps its form under the harness's two lights.
  const ironMaterial = materialFor(iron, { roughness: 0.5, metalness: 0.08 });
  const collarMaterial = materialFor(PALETTE.collar, { roughness: 0.3, metalness: 0.12 });
  const stone = materialFor(PALETTE.stone, { roughness: 0.92 });
  // Hue jitter goes into the colour handed to materialFor, never into the returned material:
  // materialFor caches, so mutating its result would tint every other lantern in the scene.
  const glassColour = `#${new THREE.Color(glass).offsetHSL((random() - 0.5) * 0.05, 0, 0)
    .getHexString()}`;
  const bolts = [];

  baseFlare(group, bolts, ironMaterial, stone, random);
  shaft(group, bolts, { height, iron: ironMaterial, collarMaterial });
  const { armEnd, armY } = bracket(group, bolts, { height, iron: ironMaterial });
  const { lamp } = head(group, { armEnd, armY, iron: ironMaterial, glassColour,
                                size: headSize, swing: (random() - 0.5) * 0.5 });
  group.add(scatterInstances(new THREE.SphereGeometry(0.019, 8, 5),
                             materialFor(PALETTE.bolt, { roughness: 0.22, metalness: 0.15 }), bolts));

  const sockets = [socket('base', [0, 0, 0], [0, 1, 0]),
                   socket('hook', [armEnd, armY, 0], [0, -1, 0]),
                   socket('lamp', lamp, [0, 1, 0])];
  const colliders = [collider('post', [0, height / 2, 0], [0.28, height, 0.28]),
                     collider('head', [armEnd, lamp[1], 0],
                              [headSize + 0.08, headSize * 1.2, headSize + 0.08])];
  return { group, sockets, colliders };
}
