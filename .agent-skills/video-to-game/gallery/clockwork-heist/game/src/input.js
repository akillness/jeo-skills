// Keyboard (4 local schemes) + gamepads.
import { KEY_SCHEMES } from './config.js';

const down = new Set();
const pressedEdge = new Set();
let anyKeyListeners = [];

const GAME_KEYS = new Set(KEY_SCHEMES.flatMap((s) => [...s.left, ...s.right, ...s.jump, ...s.act]));

window.addEventListener('keydown', (e) => {
  if (GAME_KEYS.has(e.code) || e.code === 'Enter' || e.code === 'Escape') e.preventDefault();
  if (!down.has(e.code)) pressedEdge.add(e.code);
  down.add(e.code);
  for (const f of anyKeyListeners) f(e.code);
});
window.addEventListener('keyup', (e) => { down.delete(e.code); });
window.addEventListener('blur', () => down.clear());

export function onAnyKey(f) { anyKeyListeners.push(f); }
export function keyDown(code) { return down.has(code); }
export function keyPressed(code) { return pressedEdge.has(code); }

/** Call once per frame at the very end. */
export function endFrame() { pressedEdge.clear(); padPrev = padNow; padNow = readPads(); }

// ---------------- gamepads ----------------
let padNow = [], padPrev = [];
function readPads() {
  const out = [];
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) {
    if (!p) continue;
    const ax = p.axes[0] || 0;
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    out[p.index] = {
      move: Math.abs(ax) > 0.3 ? Math.sign(ax) : (b(14) ? -1 : b(15) ? 1 : 0),
      jump: b(0) || b(12),
      act: b(2) || b(1) || b(5) || b(7),
      start: b(9),
    };
  }
  return out;
}
export function padState(i) { return padNow[i] || null; }
export function padPressed(i, k) { return !!(padNow[i] && padNow[i][k] && !(padPrev[i] && padPrev[i][k])); }
export function padIndices() { return padNow.map((p, i) => (p ? i : -1)).filter((i) => i >= 0); }

/** Controller object handed to a human player. */
export class Controller {
  constructor(kind, index) { this.kind = kind; this.index = index; } // kind: 'keys' | 'pad'
  get label() { return this.kind === 'keys' ? KEY_SCHEMES[this.index].label : `PAD ${this.index + 1}`; }
  read() {
    if (this.kind === 'keys') {
      const s = KEY_SCHEMES[this.index];
      const any = (arr) => arr.some((c) => down.has(c));
      const anyP = (arr) => arr.some((c) => pressedEdge.has(c));
      return {
        move: (any(s.right) ? 1 : 0) - (any(s.left) ? 1 : 0),
        jumpPressed: anyP(s.jump),
        jumpHeld: any(s.jump),
        act: any(s.act),
      };
    }
    const p = padNow[this.index];
    if (!p) return { move: 0, jumpPressed: false, jumpHeld: false, act: false };
    return { move: p.move, jumpPressed: padPressed(this.index, 'jump'), jumpHeld: p.jump, act: p.act };
  }
  joinPressed() {
    if (this.kind === 'keys') {
      const s = KEY_SCHEMES[this.index];
      return [...s.jump, ...s.act].some((c) => pressedEdge.has(c));
    }
    return padPressed(this.index, 'jump') || padPressed(this.index, 'start');
  }
}
