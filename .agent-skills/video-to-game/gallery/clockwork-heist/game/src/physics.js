// Tiny 2D platformer physics in the XY plane (z is purely visual).
// Surfaces:
//   box    {x0,x1,y0,y1,vx,vy}  solid on every side (floors, walls, gates)
//   oneway {x0,x1,y,vx,vy}      land from above only (stone slabs, flat gears, pendulum bobs, bridges)
//   circle {cx,cy,r,omega}      walkable top arc of a rotating vertical gear; carries the rider
import { PHYS } from './config.js';

export class World {
  constructor() {
    this.boxes = [];
    this.oneways = [];
    this.circles = [];
    this.byId = new Map();
  }
  _reg(s) { if (s.id) this.byId.set(s.id, s); return s; }
  addBox(b) { Object.assign(b, { kind: 'box', vx: b.vx ?? 0, vy: b.vy ?? 0, active: b.active ?? true }); this.boxes.push(b); return this._reg(b); }
  addOneway(o) { Object.assign(o, { kind: 'oneway', vx: o.vx ?? 0, vy: o.vy ?? 0, active: o.active ?? true }); this.oneways.push(o); return this._reg(o); }
  addCircle(c) { Object.assign(c, { kind: 'circle', omega: c.omega ?? 0, maxSin: c.maxSin ?? 0.86, active: c.active ?? true }); this.circles.push(c); return this._reg(c); }
  /** Walkable top of a surface at x (null if x is outside it). */
  topAt(s, x) {
    if (!s) return null;
    if (s.kind === 'circle') {
      const dx = x - s.cx;
      if (Math.abs(dx) > s.r) return null;
      return s.cy + Math.sqrt(Math.max(0, s.r * s.r - dx * dx));
    }
    if (s.kind === 'oneway') return s.y;
    return s.y1;
  }

  /** Highest walkable surface top under [x-hw, x+hw] between yLow and the given upper limits. */
  probe(x, hw, prevY, yLow, falling) {
    let best = null, bestTop = -Infinity;
    const fx0 = x - hw * 0.78, fx1 = x + hw * 0.78;
    for (const b of this.boxes) {
      if (!b.active || fx1 <= b.x0 || fx0 >= b.x1) continue;
      const t = b.y1;
      if (t <= prevY + 0.06 && t >= yLow && t > bestTop) { bestTop = t; best = b; }
    }
    const owTol = falling ? 0.24 : 0.06;
    for (const o of this.oneways) {
      if (!o.active || fx1 <= o.x0 || fx0 >= o.x1) continue;
      const t = o.y;
      if (t <= prevY + owTol && t >= yLow && t > bestTop) { bestTop = t; best = o; }
    }
    for (const c of this.circles) {
      if (!c.active) continue;
      const lim = c.r * c.maxSin;
      for (const sx of [x - hw * 0.6, x, x + hw * 0.6]) {
        const dx = sx - c.cx;
        if (Math.abs(dx) > lim) continue;
        const t = c.cy + Math.sqrt(c.r * c.r - dx * dx);
        if (t <= prevY + owTol && t >= yLow && t > bestTop) { bestTop = t; best = c; }
      }
    }
    return best ? { s: best, top: bestTop } : null;
  }
}

function approach(v, target, delta) {
  if (v < target) return Math.min(target, v + delta);
  return Math.max(target, v - delta);
}

export class Body {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.hw = PHYS.hw; this.h = PHYS.h;
    this.grounded = false; this.ground = null;
    this.carryVX = 0; this.carryVY = 0;
    this.coyote = 0; this.buffer = 0;
    this.jumped = false; this.cut = false;
    this.stun = 0;
    this.landedThisStep = false; this.jumpedThisStep = false;
    this.lastLandSpeed = 0;
  }
  teleport(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.grounded = false; this.ground = null;
    this.carryVX = this.carryVY = 0; this.stun = 0;
  }
}

/**
 * Advance one fixed step.
 * ctl: { move: -1..1, jumpPressed: bool (edge, consumed here), jumpHeld: bool, frozen: bool }
 */
export function stepBody(b, world, dt, ctl) {
  const P = PHYS;
  b.landedThisStep = false; b.jumpedThisStep = false;

  // 1) ride the current ground
  b.carryVX = 0; b.carryVY = 0;
  if (b.grounded && b.ground && b.ground.active !== false) {
    const g = b.ground;
    if (g.kind === 'circle') {
      b.carryVX = -g.omega * (b.y - g.cy);
      b.carryVY = g.omega * (b.x - g.cx);
    } else {
      b.carryVX = g.vx || 0; b.carryVY = g.vy || 0;
    }
    b.x += b.carryVX * dt;
    if (g.kind !== 'circle') b.y += b.carryVY * dt;
  }

  // 2) horizontal control
  if (b.stun > 0) {
    b.stun -= dt;
    b.vx = approach(b.vx, 0, 6 * dt);
  } else if (ctl.frozen) {
    b.vx = approach(b.vx, 0, P.groundDecel * dt);
  } else {
    const target = ctl.move * P.runSpeed;
    const accel = b.grounded ? (Math.abs(target) > 0.01 ? P.groundAccel : P.groundDecel) : P.airAccel;
    // turning around on the ground is snappier
    const turning = Math.sign(target) !== 0 && Math.sign(target) !== Math.sign(b.vx) && Math.abs(b.vx) > 0.1;
    b.vx = approach(b.vx, target, accel * (turning && b.grounded ? 1.6 : 1) * dt);
  }

  // 3) jump (with coyote time + input buffer)
  b.coyote = b.grounded ? P.coyote : b.coyote - dt;
  if (ctl.jumpPressed) b.buffer = P.buffer; else b.buffer -= dt;
  if (b.buffer > 0 && b.coyote > 0 && b.stun <= 0 && !ctl.frozen) {
    b.vy = P.jumpV + Math.max(0, b.carryVY * 0.6);
    b.vx += b.carryVX * 0.85;
    b.grounded = false; b.ground = null;
    b.coyote = 0; b.buffer = 0; b.jumped = true; b.cut = false;
    b.jumpedThisStep = true;
  }
  if (b.jumped && !b.cut && !ctl.jumpHeld && b.vy > 0) { b.vy *= P.jumpCut; b.cut = true; }

  // 4) gravity
  if (b.grounded) b.vy = 0;
  else b.vy = Math.max(-P.maxFall, b.vy - P.gravity * dt);

  // 5) horizontal move + solid collisions (with small step-up)
  const prevX = b.x;
  b.x += b.vx * dt;
  for (const s of world.boxes) {
    if (!s.active) continue;
    if (b.x + b.hw <= s.x0 || b.x - b.hw >= s.x1) continue;
    if (b.y >= s.y1 - 0.02 || b.y + b.h <= s.y0 + 0.02) continue;
    if (b.grounded && s.y1 - b.y <= 0.34 && s.y1 - b.y > 0) { b.y = s.y1; continue; }
    if (prevX <= (s.x0 + s.x1) / 2) b.x = s.x0 - b.hw - 1e-4; else b.x = s.x1 + b.hw + 1e-4;
    b.vx = s.vx || 0;
  }

  // 6) vertical move
  const prevY = b.y;
  b.y += b.vy * dt;
  if (b.vy > 0) {
    for (const s of world.boxes) {
      if (!s.active) continue;
      if (b.x + b.hw * 0.8 <= s.x0 || b.x - b.hw * 0.8 >= s.x1) continue;
      if (prevY + b.h <= s.y0 + 0.08 && b.y + b.h > s.y0) { b.y = s.y0 - b.h; b.vy = 0; }
    }
  }
  const wasGrounded = b.grounded;
  if (b.vy <= 0) {
    const snapDown = wasGrounded ? 0.32 : 0;
    const hit = world.probe(b.x, b.hw, prevY, b.y - snapDown, !wasGrounded);
    if (hit && b.y <= hit.top + 0.001 + (wasGrounded ? 0.32 : 0)) {
      if (!wasGrounded) { b.landedThisStep = true; b.lastLandSpeed = -b.vy; }
      b.y = hit.top; b.vy = 0; b.grounded = true; b.ground = hit.s;
      b.jumped = false;
    } else {
      b.grounded = false; b.ground = null;
    }
  } else {
    b.grounded = false; b.ground = null;
  }

  // 7) final push-out from solids (moving gates, crushers...)
  for (const s of world.boxes) {
    if (!s.active) continue;
    const ox = Math.min(b.x + b.hw - s.x0, s.x1 - (b.x - b.hw));
    const oy = Math.min(b.y + b.h - s.y0, s.y1 - b.y);
    if (ox <= 0.001 || oy <= 0.001) continue;
    if (ox < oy) {
      if (b.x < (s.x0 + s.x1) / 2) b.x = s.x0 - b.hw - 1e-4; else b.x = s.x1 + b.hw + 1e-4;
    } else {
      if (b.y + b.h / 2 > (s.y0 + s.y1) / 2) { b.y = s.y1; b.vy = Math.max(b.vy, 0); }
      else { b.y = s.y0 - b.h; b.vy = Math.min(b.vy, 0); }
    }
  }
}
