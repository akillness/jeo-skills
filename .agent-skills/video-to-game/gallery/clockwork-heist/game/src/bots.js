// AI teammates. They walk with the same physics as players, take scripted
// (always successful) arcs for flagged jumps, and cooperate on lever puzzles:
// the first to reach a near lever holds it while anyone still has to pass,
// and someone who already passed holds the far lever for the last one.
import * as THREE from 'three';
import { BOT_PATH, PUZZLES, LEVEL } from './levelData.js';

const LEASH = 14;          // max distance ahead of the rearmost human
const ARRIVE = 0.14;

const puzzleOf = new Map();
for (const p of PUZZLES) { puzzleOf.set(p.near, { p, side: 'near' }); puzzleOf.set(p.far, { p, side: 'far' }); }

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export class Bot {
  constructor(game, thief) {
    this.game = game;
    this.t = thief;
    this.nodeSurf = new Map();
    this.reset();
  }

  reset() {
    this.jump = null;
    this.faceDir = 0;
    this.ni = this.nodeIndexForX(this.t.body.x);
    this.vaultLever = null;
    this.vaultWait = 0;
    this.stuck = 0;
  }

  onRespawn() { this.jump = null; this.vaultLever = null; this.ni = this.nodeIndexForX(this.t.body.x); }

  get world() { return this.game.level.world; }

  /** First node at or after x (walkable without jumping from a checkpoint). */
  nodeIndexForX(x) {
    for (let i = 0; i < BOT_PATH.length; i++) {
      const n = BOT_PATH[i];
      if (n.vault) return i;
      if (n.x === undefined) continue;
      if (n.x >= x - 0.6) return i;
    }
    return BOT_PATH.length - 1;
  }

  spreadOffset(node) {
    if (!node.spread) return node.lever ? 0 : (this.t.slot - 1.5) * 0.3;
    const k = this.t.slot / 3;
    return node.spread[0] + (node.spread[1] - node.spread[0]) * k;
  }

  /** Live position {x, y, surf} of a path node for this bot. */
  nodePos(node) {
    const w = this.world;
    const off = this.spreadOffset(node);
    if (node.surf) {
      const s = w.byId.get(node.surf);
      if (node.rel !== undefined) {
        const cx = (s.x0 + s.x1) / 2;
        return { x: cx + node.rel + off, y: s.y, surf: s };
      }
      const x = node.x + off;
      return { x, y: w.topAt(s, x) ?? s.y ?? 0, surf: s };
    }
    const x = node.x + off;
    let s = this.nodeSurf.get(node);
    if (!s) {
      const hit = w.probe(x, 0.2, node.y + 0.05, node.y - 0.3, true);
      s = hit ? hit.s : null;
      if (s) this.nodeSurf.set(node, s);
    }
    return { x, y: node.y, surf: s };
  }

  idle() { return { move: 0, jumpPressed: false, jumpHeld: false, frozen: false }; }
  frozen() { return { move: 0, jumpPressed: false, jumpHeld: false, frozen: true }; }

  walk(dx) {
    const a = Math.abs(dx);
    const move = a > ARRIVE * 0.6 ? Math.sign(dx) * (a < 0.7 ? 0.4 : 1) : 0;
    if (move) this.faceDir = Math.sign(move);
    return { move, jumpPressed: false, jumpHeld: false, frozen: false };
  }

  posX(th) { return th.dead ? LEVEL.checkpoints[th.cp].x : th.body.x; }

  rearHumanX() {
    let m = Infinity;
    for (const th of this.game.thieves) if (!th.isBot) m = Math.min(m, this.posX(th));
    return m;
  }

  // ------------------------------------------------------------ main step
  step(h) {
    const t = this.t, b = t.body;
    b.jumpedThisStep = false; b.landedThisStep = false;
    if (this.jump) return this.stepJump(h);
    const node = BOT_PATH[this.ni];
    if (!node) return this.idle();
    if (node.vault) return this.stepVault();
    const tp = this.nodePos(node);
    const onSurf = b.grounded && (tp.surf ? b.ground === tp.surf : Math.abs(b.y - tp.y) < 0.08);
    const dx = tp.x - b.x;

    // a lever someone else already keeps pulled: no need to stand exactly on it
    if (node.lever && onSurf && Math.abs(dx) < 1.4 && !t.holding && this.leverDecision(node) === 'go' && this.canLeave(node)) {
      this.ni++;
      return this.walk(dx);
    }
    if (!onSurf) {
      if (b.grounded && node.jump) return this.startJump(node);
      if (!b.grounded) return this.idle(); // falling / carried: let physics settle
      // grounded on another surface but the edge is a walk: walk on
      return this.walk(dx);
    }
    if (Math.abs(dx) > ARRIVE) {
      if (t.holding) this.game.release(t);
      return this.walk(dx);
    }
    // ---- arrived: decide whether to leave
    if (node.lever) {
      const d = this.leverDecision(node);
      const lv = this.game.level.levers.get(node.lever);
      if (d === 'hold') {
        if (t.holding !== lv) { if (t.holding) this.game.release(t); if (!lv.heldBy) this.game.grab(t, lv); }
        this.faceDir = Math.sign(lv.x - b.x) || 1;
        return this.frozen();
      }
      if (t.holding) this.game.release(t);
      if (d === 'wait') return this.walk(dx);
    }
    if (!this.canLeave(node)) return this.walk(dx);
    // advance
    this.ni++;
    const next = BOT_PATH[this.ni];
    if (next && next.jump && !next.vault) {
      const np = this.nodePos(next);
      if (!(b.ground === np.surf)) return this.startJump(next);
    }
    return this.walk(dx);
  }

  canLeave(node) {
    const L = this.game.level;
    if (node.wait && !this.condition(node.wait)) return false;
    const next = BOT_PATH[this.ni + 1];
    if (!next) return false;
    if (next.gate) {
      const g = L.gates.find((q) => q.def.id === next.gate);
      if (g && g.open < 0.95) return false;
    }
    if (next.hazard && !this.condition(next.hazard === 'P2' ? 'P2safe' : next.hazard)) return false;
    // stay near the humans
    if (next.x !== undefined) {
      const rear = this.rearHumanX();
      const nextIsFar = next.lever && puzzleOf.get(next.lever)?.side === 'far';
      if (rear !== Infinity && next.x > rear + LEASH && !nextIsFar) return false;
    }
    // reachability sanity for jumps onto moving things
    if (next.jump && next.surf) {
      const np = this.nodePos(next);
      if (np.y - this.t.body.y > 2.2) return false;
    }
    return true;
  }

  condition(name) {
    const L = this.game.level;
    switch (name) {
      case 'M1left': { const m = L.movers[0]; return m.x < m.def.xa + 0.35; }
      case 'M1right': { const m = L.movers[0]; return m.x > m.def.xb - 0.35; }
      case 'P1left': { const p = L.pendulums.find((q) => q.def.id === 'P1'); return p.theta < -p.def.amp * 0.93; }
      case 'P1right': { const p = L.pendulums.find((q) => q.def.id === 'P1'); return p.theta > p.def.amp * 0.93; }
      case 'P2safe': { const p = L.pendulums.find((q) => q.def.id === 'P2'); return p.braked && p.atExtreme; }
      case 'HBup': { const br = L.bridges[0]; return br.y > br.def.yUp - 0.05; }
      default: return true;
    }
  }

  leverDecision(node) {
    const info = puzzleOf.get(node.lever);
    if (!info) return 'go';
    const { p, side } = info;
    const L = this.game.level;
    const me = this.t;
    const others = this.game.thieves.filter((o) => o !== me);
    const behind = others.filter((o) => this.posX(o) < p.passX - 0.3);
    const heldByOther = (id) => { const l = L.levers.get(id); return l.heldBy && l.heldBy !== me; };
    if (side === 'near') {
      if (heldByOther(p.near) || heldByOther(p.far)) return 'go';
      if (behind.length) return 'hold';
      return 'wait';
    }
    // far side: keep the way open while anyone (incl. the near holder) is still behind
    if (!behind.length) return 'go';
    if (heldByOther(p.far)) return 'go';
    return 'hold';
  }

  // ------------------------------------------------------------ scripted jump arc
  startJump(node) {
    const b = this.t.body;
    if (this.t.holding) this.game.release(this.t);
    const tp = this.nodePos(node);
    const dist = Math.hypot(tp.x - b.x, tp.y - b.y);
    const T = clamp(0.3 + dist * 0.07, 0.42, 0.85);
    this.jump = { node, x0: b.x, y0: b.y, T, t: 0, hc: 0.75 + Math.min(1.2, dist * 0.12) };
    this.faceDir = Math.sign(tp.x - b.x) || this.faceDir;
    b.grounded = false; b.ground = null;
    b.jumpedThisStep = true;
    return { kinematic: true };
  }

  stepJump(h) {
    const b = this.t.body, j = this.jump;
    j.t += h;
    const s = Math.min(1, j.t / j.T);
    const tp = this.nodePos(j.node);
    const apex = Math.max(j.y0, tp.y) + j.hc;
    const c = 2 * apex - (j.y0 + tp.y) / 2;
    const x = j.x0 + (tp.x - j.x0) * s;
    const y = (1 - s) * (1 - s) * j.y0 + 2 * s * (1 - s) * c + s * s * tp.y;
    b.vx = (x - b.x) / h; b.vy = (y - b.y) / h;
    b.x = x; b.y = y;
    b.carryVX = 0; b.carryVY = 0;
    if (s >= 1) {
      b.y = tp.y; b.vy = 0; b.vx = 0;
      b.grounded = true; b.ground = tp.surf;
      b.landedThisStep = true; b.lastLandSpeed = 7.5;
      b.jumped = false;
      this.jump = null;
    }
    return { kinematic: true };
  }

  // ------------------------------------------------------------ the vault finale
  stepVault() {
    const L = this.game.level, me = this.t, b = me.body;
    const V = L.vault;
    if (V.opened) {
      if (me.holding) this.game.release(me);
      this.vaultWait += 1 / 120;
      if (this.vaultWait < 1.6 || !L.treasureReachable()) return this.walk(0);
      // with humans in the heist, the bots gather round and leave the grab to a player
      const humans = this.game.thieves.some((o) => !o.isBot);
      const side = b.x < V.def.x ? -1 : 1;
      const tx = humans ? V.def.x + side * (1.7 + Math.abs(me.slot - 1.5) * 0.5) : V.def.x + (me.slot - 1.5) * 0.3;
      return this.walk(tx - b.x);
    }
    // choose a free vault lever (prefer the one with my colour)
    const ids = V.def.levers;
    const claimed = new Set(this.game.thieves.filter((o) => o !== me && o.bot && o.bot.vaultLever && o.isBot).map((o) => o.bot.vaultLever));
    const free = (id) => { const l = L.levers.get(id); return (!l.heldBy || l.heldBy === me) && !claimed.has(id); };
    if (!this.vaultLever || !free(this.vaultLever)) {
      const mine = ids[me.slot];
      this.vaultLever = free(mine) ? mine : ids.filter(free).sort((a, c) => Math.abs(L.levers.get(a).x - b.x) - Math.abs(L.levers.get(c).x - b.x))[0] || null;
    }
    if (!this.vaultLever) return this.walk(0);
    const lv = L.levers.get(this.vaultLever);
    const tx = lv.x - 0.42;
    const dx = tx - b.x;
    if (Math.abs(dx) > ARRIVE || !b.grounded) { if (me.holding) this.game.release(me); return this.walk(dx); }
    if (me.holding !== lv) { if (me.holding) this.game.release(me); if (!lv.heldBy) this.game.grab(me, lv); }
    this.faceDir = 1;
    return this.frozen();
  }
}
