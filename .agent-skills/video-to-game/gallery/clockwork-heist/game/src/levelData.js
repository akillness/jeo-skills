// The clock tower, left to right. Units: the thieves are ~1 unit tall.
// y = 0 is the floor of the starting gallery. The play plane is z = 0.

export const LEVEL = {
  killY: -14,
  camBounds: { minX: -9.5, maxX: 207.5 },

  // Solid blocks (style: 'hall' marble-inlay gallery floor, 'stone' masonry, 'walk' stone walkway with brass trim, 'wall')
  boxes: [
    { id: 'floorA', x0: -17, x1: 19, y0: -9, y1: 0, style: 'hall' },
    { id: 'wallL', x0: -21.5, x1: -16.6, y0: -9, y1: 22, style: 'wall' },
    { id: 'C1', x0: 76.4, x1: 91.0, y0: -2.4, y1: 2.2, style: 'walk' },
    { id: 'arch1', x0: 81.4, x1: 86.0, y0: 5.5, y1: 24, style: 'stone' },
    { id: 'D0', x0: 99.2, x1: 101.6, y0: -14, y1: 7.3, style: 'stone' },
    { id: 'E0a', x0: 118.4, x1: 131.6, y0: 4.6, y1: 7.3, style: 'walk' },
    { id: 'E0b', x0: 134.4, x1: 146.0, y0: 4.6, y1: 7.3, style: 'walk' },
    { id: 'F0', x0: 158.0, x1: 165.0, y0: -14, y1: 7.3, style: 'stone' },
    { id: 'floorH', x0: 187.0, x1: 216.5, y0: -9, y1: 8.0, style: 'hall' },
    { id: 'wallR', x0: 215.8, x1: 221.5, y0: -9, y1: 30, style: 'wall' },
  ],

  // Floating stone slabs (one-way, land from above)
  slabs: [
    { id: 'B1', x0: 21.6, x1: 24.2, y: -0.6 },
    { id: 'B2', x0: 35.3, x1: 37.7, y: -0.2 },
    { id: 'B3', x0: 55.0, x1: 57.6, y: 1.2 },
    { id: 'F1', x0: 175.0, x1: 177.4, y: 8.2 },
  ],

  // Flat (horizontal) gears used as one-way floors: center x, radius, top y
  flatGears: [
    { id: 'C0', cx: 72.2, r: 4.2, y: 2.2, spin: 0.25 },
    { id: 'HG1', cx: 93.4, r: 1.6, y: 3.9, spin: -0.6 },
    { id: 'HG2', cx: 97.2, r: 1.6, y: 5.6, spin: 0.6 },
  ],

  // Vertical rotating gears: walkable top arc. omega < 0 = clockwise (top carries right)
  gears: [
    { id: 'G1', cx: 29.6, cy: -4.9, r: 4.3, omega: -0.42 },
    { id: 'G2', cx: 43.8, cy: -3.9, r: 4.6, omega: 0.38 },
    { id: 'G3', cx: 49.54, cy: -0.85, r: 2.4, omega: -0.728, meshWith: 'G2' },
    { id: 'G4', cx: 170.2, cy: 3.4, r: 3.9, omega: -0.5 },
    { id: 'G5', cx: 182.3, cy: 4.9, r: 3.5, omega: 0.55 },
  ],

  // Moving slab (one-way) oscillating horizontally
  movers: [
    { id: 'M1', xa: 60.0, xb: 65.6, y: 1.6, w: 2.4, period: 4.2 },
  ],

  // Pendulums. ride = the bob carries a level brass saddle you can stand on.
  // hazard = the bob knocks thieves out. brakeBy = levers that stop it at the top of its swing.
  pendulums: [
    { id: 'P1', px: 110.0, py: 18.2, len: 14.0, amp: 0.5236, period: 5.6, phase: 0, bobR: 1.35, ride: true },
    { id: 'P2', px: 133.0, py: 19.4, len: 10.6, amp: 0.9076, period: 3.6, phase: 0, bobR: 1.35, hazard: true, brakeBy: ['C', 'D'] },
  ],

  levers: [
    { id: 'A', x: 72.2, y: 2.2, knob: 0xc8141c },
    { id: 'B', x: 88.6, y: 2.2, knob: 0xc8141c },
    { id: 'C', x: 123.6, y: 7.3, knob: 0x1fa040 },
    { id: 'D', x: 141.6, y: 7.3, knob: 0x1fa040 },
    { id: 'E', x: 143.6, y: 7.3, knob: 0xc8141c },
    { id: 'F', x: 160.6, y: 7.3, knob: 0xc8141c },
    // vault: one knob per thief colour, all four must be held at once
    { id: 'V1', x: 192.6, y: 8.0, knob: 0xd8141c, vault: true },
    { id: 'V2', x: 195.6, y: 8.0, knob: 0x1450e6, vault: true },
    { id: 'V3', x: 208.4, y: 8.0, knob: 0xf2c418, vault: true },
    { id: 'V4', x: 211.4, y: 8.0, knob: 0x18a83a, vault: true },
  ],

  gates: [
    { id: 'gate1', x0: 83.35, x1: 84.05, yClosed: 2.2, h: 3.3, by: ['A', 'B'] },
  ],

  bridges: [
    { id: 'HB', cx: 152.0, r: 3.0, yDown: -6.5, yUp: 7.3, by: ['E', 'F'] },
  ],

  vault: { x: 202.0, y: 11.6, r: 2.7, levers: ['V1', 'V2', 'V3', 'V4'], treasure: { x: 202.0, y: 9.5 } },

  gems: [
    [-4, 0.9], [0, 2.3], [4, 0.9], [8.5, 2.6], [13, 0.9],
    [22.9, 0.5], [27.5, 1.6], [31.6, 1.0], [36.5, 2.2], [41.5, 1.6], [45.4, 2.4], [49.5, 3.6], [53.0, 3.2], [56.3, 2.4],
    [62.8, 3.4], [69.0, 3.4], [79.0, 3.3], [85.6, 3.3], [93.4, 5.2], [97.2, 6.9],
    [104.2, 10.4], [110.0, 8.6], [115.8, 10.4], [121.0, 8.4], [128.0, 8.4], [133.0, 9.6], [139.0, 8.4], [147.5, 9.3], [152.0, 8.8], [156.5, 9.3],
    [163.0, 8.4], [168.6, 9.2], [173.0, 9.5], [176.2, 9.6], [181.0, 10.0], [185.4, 10.4],
    [190.0, 9.1], [199.0, 9.1], [205.0, 9.1], [214.0, 9.1],
  ],

  checkpoints: [
    { x: -6, y: 0, trigger: -100 },
    { x: 22.9, y: -0.6, trigger: 21.6 },
    { x: 56.3, y: 1.2, trigger: 55.0 },
    { x: 70.6, y: 2.2, trigger: 68.6 },
    { x: 89.8, y: 2.2, trigger: 86.5 },
    { x: 100.4, y: 7.3, trigger: 99.6 },
    { x: 120.6, y: 7.3, trigger: 118.6 },
    { x: 137.6, y: 7.3, trigger: 136.0 },
    { x: 161.8, y: 7.3, trigger: 158.6 },
    { x: 189.6, y: 8.0, trigger: 187.6 },
  ],

  // Hall sections (wood panelling back wall instead of the open tower)
  halls: [
    { x0: -17, x1: 19.4, floorY: 0, ceilY: 9.6 },
    { x0: 186.6, x1: 216.5, floorY: 8.0, ceilY: 18.2 },
  ],

  spawn: [[-9.2, 0], [-7.8, 0], [-6.4, 0], [-5.0, 0]],
};

// ---------------------------------------------------------------------------
// Bot route. AI thieves walk with the same physics as players and use a
// scripted, always-successful arc for edges flagged `jump`.
//   surf: id of the gear/slab/mover/bob/bridge the node sits on (y read live)
//   rel: x relative to a moving surface's centre
//   wait: named condition to leave this node forward
//   gate / hazard: the edge INTO this node needs that obstacle open / braked
//   lever: lever id used at this node (puzzle logic decides whether to hold it)
//   spread: offsets so waiting bots do not stand inside each other
export const BOT_PATH = [
  { x: -6.0, y: 0 },
  { x: 18.4, y: 0 },
  { x: 22.9, surf: 'B1', jump: true, spread: [-0.9, 0.9] },
  { x: 27.6, surf: 'G1', jump: true },
  { x: 31.2, surf: 'G1' },
  { x: 36.5, surf: 'B2', jump: true, spread: [-0.9, 0.9] },
  { x: 41.4, surf: 'G2', jump: true },
  { x: 45.6, surf: 'G2' },
  { x: 48.9, surf: 'G3', jump: true },
  { x: 50.6, surf: 'G3' },
  { x: 56.3, surf: 'B3', jump: true, spread: [-1.0, 1.0] },
  { x: 57.2, surf: 'B3', wait: 'M1left', spread: [-1.4, 0.2] },
  { surf: 'M1', rel: 0, jump: true, wait: 'M1right', spread: [-0.9, 0.9] },
  { x: 69.6, surf: 'C0', jump: true, spread: [-0.4, 0.6] },
  { x: 71.78, surf: 'C0', lever: 'A' },
  { x: 82.6, y: 2.2, spread: [-2.6, 0] },
  { x: 85.4, y: 2.2, gate: 'gate1' },
  { x: 88.18, y: 2.2, lever: 'B' },
  { x: 90.4, y: 2.2 },
  { x: 93.4, surf: 'HG1', jump: true, spread: [-0.8, 0.8] },
  { x: 97.2, surf: 'HG2', jump: true, spread: [-0.8, 0.8] },
  { x: 100.2, y: 7.3, jump: true, spread: [-0.8, 0.6] },
  { x: 101.1, y: 7.3, wait: 'P1left', spread: [-1.7, 0.2] },
  { surf: 'P1', rel: 0, jump: true, wait: 'P1right', spread: [-0.8, 0.8] },
  { x: 119.6, y: 7.3, jump: true, spread: [-0.4, 0.8] },
  { x: 123.18, y: 7.3, lever: 'C' },
  { x: 130.6, y: 7.3, wait: 'P2safe', spread: [-2.6, 0.4] },
  { x: 135.6, y: 7.3, jump: true, hazard: 'P2', spread: [-0.4, 0.8] },
  { x: 137.6, y: 7.3 },
  { x: 141.18, y: 7.3, lever: 'D' },
  { x: 143.18, y: 7.3, lever: 'E' },
  { x: 145.4, y: 7.3, wait: 'HBup', spread: [-1.6, 0.4] },
  { x: 150.4, surf: 'HB', jump: true, spread: [-0.9, 0.9] },
  { x: 153.6, surf: 'HB', wait: 'HBup' },
  { x: 159.2, y: 7.3, jump: true, spread: [-0.6, 0.6] },
  { x: 160.18, y: 7.3, lever: 'F' },
  { x: 164.4, y: 7.3, spread: [-2.4, 0.4] },
  { x: 168.2, surf: 'G4', jump: true },
  { x: 171.6, surf: 'G4' },
  { x: 176.2, surf: 'F1', jump: true, spread: [-0.9, 0.9] },
  { x: 180.0, surf: 'G5', jump: true },
  { x: 184.0, surf: 'G5' },
  { x: 188.8, y: 8.0, jump: true, spread: [-0.6, 0.6] },
  { vault: true },
];

// Lever puzzles: two levers open the same obstacle. Thieves with x < passX still need it open.
export const PUZZLES = [
  { id: 'gate1', near: 'A', far: 'B', obstacleX: 83.7, passX: 85.0 },
  { id: 'P2', near: 'C', far: 'D', obstacleX: 133.0, passX: 136.8 },
  { id: 'HB', near: 'E', far: 'F', obstacleX: 152.0, passX: 158.6 },
];
