// Keyboard (QWERTY / AZERTY via physical key codes) + native Gamepad API (standard mapping).
const LEFT = ['ArrowLeft', 'KeyA'], RIGHT = ['ArrowRight', 'KeyD'], UP = ['ArrowUp', 'KeyW'], DOWN = ['ArrowDown', 'KeyS'];
const JUMP = ['Space', 'KeyK', 'KeyJ'], START = ['Enter', 'NumpadEnter'], PAUSE = ['Escape', 'KeyP'], MUTE = ['KeyM'];

export class Input {
  constructor() {
    this.keys = new Set(); this.edges = new Set();
    this.prevPad = {}; this.padConnected = false; this.lastDevice = 'keyboard';
    this.onUserGesture = null;
    addEventListener('keydown', (e) => {
      if ([...LEFT, ...RIGHT, ...UP, ...DOWN, ...JUMP, 'Space'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.edges.add(e.code);
      this.keys.add(e.code); this.lastDevice = 'keyboard';
      this.onUserGesture && this.onUserGesture();
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => { this.keys.clear(); });
    addEventListener('pointerdown', () => { this.onUserGesture && this.onUserGesture(); this.edges.add('Pointer'); });
    addEventListener('gamepadconnected', () => { this.padConnected = true; });
    this.state = { x: 0, y: 0, jumpHeld: false, jumpPressed: false, start: false, pause: false, mute: false, any: false };
  }
  _k(list) { return list.some((c) => this.keys.has(c)); }
  _e(list) { return list.some((c) => this.edges.has(c)); }
  poll() {
    const s = this.state;
    let x = (this._k(RIGHT) ? 1 : 0) - (this._k(LEFT) ? 1 : 0);
    let y = (this._k(UP) ? 1 : 0) - (this._k(DOWN) ? 1 : 0);
    let jumpHeld = this._k(JUMP);
    let jumpPressed = this._e(JUMP);
    let start = this._e(START);
    let pause = this._e(PAUSE);
    const mute = this._e(MUTE);
    let any = this.edges.size > 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      this.padConnected = true;
      const b = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
      const prev = this.prevPad[gp.index] || {};
      const now = {};
      for (let i = 0; i < gp.buttons.length; i++) now[i] = b(i);
      const edge = (i) => now[i] && !prev[i];
      const dz = 0.22;
      let ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.abs(ax) < dz) ax = 0; else ax = Math.sign(ax) * (Math.abs(ax) - dz) / (1 - dz);
      if (Math.abs(ay) < dz) ay = 0; else ay = Math.sign(ay) * (Math.abs(ay) - dz) / (1 - dz);
      const dx = (now[15] ? 1 : 0) - (now[14] ? 1 : 0), dy = (now[12] ? 1 : 0) - (now[13] ? 1 : 0);
      if (Math.abs(ax) > Math.abs(x)) x = ax;
      if (dx) x = dx;
      if (Math.abs(ay) > Math.abs(y)) y = -ay;
      if (dy) y = dy;
      if (now[0]) jumpHeld = true;
      if (edge(0)) { jumpPressed = true; }
      if (edge(9)) { start = true; pause = true; }
      for (let i = 0; i < gp.buttons.length; i++) if (edge(i)) { any = true; this.lastDevice = 'gamepad'; }
      this.prevPad[gp.index] = now;
    }
    s.x = Math.max(-1, Math.min(1, x)); s.y = Math.max(-1, Math.min(1, y));
    s.jumpHeld = jumpHeld; s.jumpPressed = jumpPressed; s.start = start; s.pause = pause; s.mute = mute; s.any = any;
    s.pointer = this.edges.has('Pointer');
    this.edges.clear();
    return s;
  }
}
