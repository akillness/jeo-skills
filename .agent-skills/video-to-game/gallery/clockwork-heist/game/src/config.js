// Global tuning for CLOCKWORK HEIST.
export const PHYS = {
  gravity: 32,
  runSpeed: 6.4,
  groundAccel: 60,
  groundDecel: 48,
  airAccel: 32,
  jumpV: 12.4,          // apex ~2.4 units
  jumpCut: 0.45,
  maxFall: 22,
  coyote: 0.11,
  buffer: 0.14,
  hw: 0.26,             // half width of the thief collider
  h: 0.95,              // collider height
  dt: 1 / 120,          // fixed physics step
};

export const PLAYER_COLORS = [
  { name: 'Red', hex: 0xd8141c, css: '#e0262c', hue: 0.0 },
  { name: 'Blue', hex: 0x1450e6, css: '#2f6bff', hue: 0.62 },
  { name: 'Yellow', hex: 0xf2c418, css: '#ffd21f', hue: 0.14 },
  { name: 'Green', hex: 0x18a83a, css: '#25c24a', hue: 0.36 },
];

// Keyboard schemes: one per local player.
export const KEY_SCHEMES = [
  { label: 'W A S D', left: ['KeyA'], right: ['KeyD'], jump: ['KeyW', 'Space'], act: ['KeyS', 'KeyE'] },
  { label: 'ARROWS', left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp'], act: ['ArrowDown', 'ShiftRight'] },
  { label: 'I J K L', left: ['KeyJ'], right: ['KeyL'], jump: ['KeyI'], act: ['KeyK', 'KeyU'] },
  { label: 'NUMPAD 8456', left: ['Numpad4'], right: ['Numpad6'], jump: ['Numpad8'], act: ['Numpad5', 'Numpad2'] },
];

export const CAMERA = {
  fov: 34,
  minDist: 14,
  maxDist: 30,
  height: 2.6,     // camera sits a bit above its target -> sees the top of horizontal gears
  lookAhead: 1.4,
};

export const HEIST_MINUTES = 10; // real minutes before the clock strikes midnight (diegetic timer: 11:50 -> 12:00)
