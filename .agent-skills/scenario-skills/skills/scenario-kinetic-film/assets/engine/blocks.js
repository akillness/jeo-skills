// blocks.js: the scene blocks a kinetic film is assembled from. Each block is a class placed on the beat grid in
// spec.js as [Block, startBeat, endBeat, options]. Blocks with a nominal length (static N, in beats) scale their
// internal timing to the span they are given; sequencing blocks (Words, Strike) take absolute beats.
// Rule built into every block: nothing parks. The camera always moves, a new idea lands every beat or half
// beat, and transitions are moves (whip, zoom through a letter, slot reel, collapse), not fades.
import { W, H, B, C, DUR, FPS, E, clamp, lerp, tw, env, rng, mixc, rgba, el, vis, set, at, type, styleType, letters, extrude, tumble } from './core.js';

// ---------- helpers (exported for custom blocks) ----------
const NS = 'http://www.w3.org/2000/svg';
export function svg(tag, parent, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
export const qb = (a, b, c, u) => { const v = 1 - u; return [v * v * a[0] + 2 * v * u * b[0] + u * u * c[0], v * v * a[1] + 2 * v * u * b[1] + u * u * c[1]]; };
export const cb = (a, b, c, d, u) => { const v = 1 - u; return [v * v * v * a[0] + 3 * v * v * u * b[0] + 3 * v * u * u * c[0] + u * u * u * d[0], v * v * v * a[1] + 3 * v * v * u * b[1] + 3 * v * u * u * c[1] + u * u * u * d[1]]; };
// Reparameterize any curve by arc length, so a comet moves at the speed its easing says.
export function arcLen(fn, n = 400) {
  const P = [], L = [0];
  for (let i = 0; i <= n; i++) { P.push(fn(i / n)); if (i) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); }
  const tot = L[n];
  const f = u => {
    const d = clamp(u) * tot; let lo = 0, hi = n;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] < d) lo = m; else hi = m; }
    const s = (d - L[lo]) / ((L[hi] - L[lo]) || 1);
    return [lerp(P[lo][0], P[hi][0], s), lerp(P[lo][1], P[hi][1], s)];
  };
  f.len = tot;
  return f;
}
export const polyline = pts => arcLen(u => {
  const n = pts.length - 1, x = clamp(u) * n, i = Math.min(n - 1, Math.floor(x)), s = x - i;
  return [lerp(pts[i][0], pts[i + 1][0], s), lerp(pts[i][1], pts[i + 1][1], s)];
}, pts.length * 60);
export const chamferPts = (x, y, w, h, c) => [[x + c, y], [x + w - c, y], [x + w, y + c], [x + w, y + h - c], [x + w - c, y + h], [x + c, y + h], [x, y + h - c], [x, y + c], [x + c, y]];
export const ptsAttr = P => P.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
export const shake = (a, amp = 10, k = 16, w = 64) => a < 0 ? 0 : amp * Math.exp(-k * a) * Math.sin(w * a);
export const GLYPHS = '{}<>/;=()[]*+'.split('');
export const fmt = n => n.toLocaleString('en-US');
export const meas = e => [e.offsetWidth, e.offsetHeight];
// position of an element relative to an ancestor (offsetLeft alone is relative to the nearest transformed parent)
export function relPos(e, root) {
  let x = 0, y = 0;
  for (let n = e; n && n !== root; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; if (n.offsetParent === null) break; }
  return [x, y];
}
// {lines}, {frames} and {seconds} in on-screen text are filled from the film itself, so the numbers stay true
export const fillVars = (f, v) => String(v).replace('{lines}', fmt(f.src.lines || 0)).replace('{frames}', fmt(Math.round(DUR * FPS))).replace('{seconds}', String(Math.round(DUR)));
export const punch = (t, t0, k = 9) => t < t0 ? 0 : Math.exp(-k * (t - t0));
// palette names ('bg', 'paper', 'accent', 'hot', 'ink') or any CSS color
export const cc = c => (c && C[c]) || c;
const isLight = g => !!g && g !== 'bg' && g !== C.bg;
const typeOn = g => isLight(g) ? C.ink : C.paper;
export function glowDot(x, cx, cy, r, a = 1, color = C.accent) {
  if (a <= 0) return;
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r * 3.4);
  g.addColorStop(0, rgba(C.tint, a)); g.addColorStop(.22, rgba(C.tint2, .95 * a)); g.addColorStop(.45, rgba(color, .55 * a)); g.addColorStop(1, rgba(color, 0));
  x.save(); x.globalCompositeOperation = 'lighter'; x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r * 3.4, 0, 7); x.fill(); x.restore();
}
// slot-reel number: every digit is a column of 0-9 that spins down and settles on its target
export function reel(parent, text, o) {
  const row = el('div', parent, 'abs reel');
  styleType(row, o);
  row.cols = [];
  for (const ch of String(text)) {
    if (!/\d/.test(ch)) { el('span', row, 'rch').textContent = ch; continue; }
    const c = el('span', row, 'rcol'), inner = el('span', c, 'rin');
    inner.textContent = Array.from({ length: 30 }, (_, i) => i % 10).join('\n');
    const probe = el('span', row, 'rch'); probe.textContent = ch; c.style.width = probe.offsetWidth + 'px'; probe.remove();
    row.cols.push({ inner, d: +ch });
  }
  return row;
}
export function spinReel(row, t, t0, dur = .7, stagger = .07) {
  row.cols.forEach((c, i) => {
    const u = E.outCubic(clamp((t - t0 - i * stagger) / dur)), pos = (20 + c.d) * u;
    set(c.inner, 'transform', `translateY(${(-pos).toFixed(4)}em)`);
  });
}
// a bright band that sweeps across a face (background-clip text)
export function sheen(face, base) {
  Object.assign(face.style, { backgroundImage: `linear-gradient(100deg, ${base} 40%, #FFFFFF 47%, ${C.tint} 50%, ${base} 57%)`, backgroundSize: '320% 100%', webkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', backgroundPosition: '100% 0' });
}
// camera that flies through the counter of a glyph: P = the glyph's center in stage coordinates
function zoomThrough(t, ta, tb, P, base) {
  const z = tw(t, ta, tb, E.inExpo);
  if (z <= 0) return null;
  const s0 = base.s || 1, S = s0 * Math.exp(Math.log(70) * z), m = E.inOutCubic(clamp(z * 1.5));
  const tx = lerp(960 + s0 * (P[0] - 960), 960, m), ty = lerp(540 + s0 * (P[1] - 540), 540, m);
  return { x: P[0] - 960 - (tx - 960) / S, y: P[1] - 540 - (ty - 540) / S, s: S, r: (base.r || 0) * (1 - clamp(z * 3)) };
}
// the center of a glyph's counter (the hole of an O, 0, D...) inside a letters() element placed at (cx, cy)
function counterOf(L, i, cx, cy, size) {
  const sp = L.spans[i], [w, h] = meas(L.e);
  return [cx - w / 2 + sp.offsetLeft + sp.offsetWidth / 2, cy - h / 2 + .48 * size];
}
// punch effects on an entrance: hit 1 = flash and shake, hit 2 = rays, ring and sparks too
function hitFx(f, t0, o = {}) {
  const hit = o.hit ?? 1, g = o.ground, light = isLight(g);
  if (!hit) return;
  f.shake(t0, 9 + 5 * hit); f.bump(t0, .025 + .02 * hit); f.fast(t0 - .03, t0 + .28, hit > 1 ? 12 : 8);
  if (hit > 1) {
    const rc = light ? C.ink : (o.rayColor ? cc(o.rayColor) : C.paper);
    f.ray({ t0, dur: .55, color: rc, n: 90, r0: 120, r1: 1600, w: 2.6, screen: true, seed: Math.round(t0 * 97), ...(light ? { blend: 'source-over', alpha: .5 } : {}) });
    f.ring({ t0, dur: .5, r0: 40, r1: 1100, w: 16, color: light ? C.ink : C.accent, screen: true, ...(light ? { blend: 'source-over', alpha: .45 } : {}) });
    if (o.at) f.burst({ t0, x: o.at[0], y: o.at[1], n: 44, speed: 1700, life: .55, w: 3.3, seed: Math.round(t0 * 13), ...(light ? { color: C.ink, blend: 'source-over' } : {}) });
    f.flash({ t0, dur: .24, rise: .015, color: C.accent, peak: light ? .12 : .24 });
  } else f.flash({ t0, dur: .12, rise: .01, color: '#FFFFFF', peak: light ? .2 : .3 });
}

// ---------- base ----------
export class Scene {
  static N = 0;
  constructor(f, k0, k1, o = {}) {
    this.f = f; this.k0 = k0; this.k1 = k1; this.o = o; this.t0 = B(k0); this.t1 = B(k1);
    this.sc = this.constructor.N ? (k1 - k0) / this.constructor.N : 1;
    this.pre = o.pre || 0; this.post = o.post || 0; this.dir = o.dir || 1;
    this.root = el('div', f.scenesEl, 'scene');
    this.build();
    // transitions owned by the spec: whipIn: [dx, dy, dur, roll] lands this block, whipOut leaves it
    if (o.whipIn) f.whip(this.t0, ...o.whipIn);
    if (o.whipOut) f.whip(this.t1, ...o.whipOut);
  }
  // a beat offset inside the scene, scaled to its span, as seconds
  k(rel) { return B(this.k0 + rel * this.sc); }
  build() {}
  update() {}
  // default camera: a slow push with a little roll, so no shot is ever locked off
  cam(t) { const u = clamp((t - this.t0) / (this.t1 - this.t0)); return { s: 1 + .06 * E.inOutCubic(u), r: this.dir * lerp(-.7, .7, u) }; }
}

// ---------- Words: kinetic type, one idea per beat ----------
// shots: [{ at, style, text, ground, color, size, wdth, in, fx, ... }]
//   style: 'punch3d' (extruded, flies out of depth) | 'slam' (huge, letters tumble, ghost rows) |
//          'stack' ([kicker, word], word slams half a beat later, accent bar) | 'pair' ([line1, line2] from both sides) |
//          'split' ([small, big] big word slams from the right; scramble, glitch, note, code backdrop) | 'cut' (a hard cut word)
//   in: 'cut' | 'whipX' | 'whipY' | 'whipXr'   fx: 'punch' | 'hit' | 'none'
// charge: true = converging speed lines into a glowing point before the first shot
// exit: { type: 'zoom', at, char } (fly through the counter of a letter of the last shot) | { type: 'collapse', at } | { type: 'flash', at }
export class Words extends Scene {
  build() {
    const f = this.f, o = this.o;
    this.root.classList.add('persp');
    this.shots = o.shots.map((s, i) => {
      s = { ...s, t: B(s.at), te: B(i < o.shots.length - 1 ? o.shots[i + 1].at : this.k1), i };
      const g = s.ground ? cc(s.ground) : null;
      s.tf = s.flip ? B(s.at + s.flip.at) : null;
      if (g) f.ground(s.t, s.tf ?? s.te, g);
      if (s.flip) { if (s.flip.ground) f.ground(s.tf, s.te, cc(s.flip.ground)); f.cut(s.tf); f.shake(s.tf, 10); f.bump(s.tf, .04); }
      s.col = cc(s.color) || typeOn(s.ground);
      const sh = SHOTS[s.style || 'slam'](this, s);
      if (s.in === 'whipX') f.whip(s.t, 1650, 0, .12, 2); else if (s.in === 'whipXr') f.whip(s.t, -1650, 0, .12, -2);
      else if (s.in === 'whipY') f.whip(s.t, 0, 1150, .12); else if (i > 0 || !o.charge) f.cut(s.t);
      const fx = s.fx || 'hit', ht = sh.hitT ?? s.t;
      if (fx === 'beat') { const half = s.at % 1 !== 0; f.shake(ht, half ? 8 : 12); f.bump(ht, half ? .03 : .05); f.fast(ht, ht + .12, 8); }
      else hitFx(f, ht, { hit: fx === 'punch' ? 2 : fx === 'hit' ? 1 : 0, ground: s.ground, at: sh.hitAt || [960, s.y || 540] });
      if (fx !== 'none') f.cue(ht, s.cue || (fx === 'punch' ? (s.big ? 'impact_big' : 'impact') : 'hit'), s.gain ?? (fx === 'punch' ? 1 : s.at % 1 ? .7 : .9));
      if (fx === 'punch') f.cue(ht + .02, 'sparkle', .4);
      return { s, ...sh };
    });
    if (o.charge) {
      const first = this.shots[0].s.t;
      f.ray({ t0: this.t0, dur: first - this.t0, inward: true, color: C.accent, n: 80, r0: 26, r1: 1150, w: 2, rate: 2.4, screen: true, seed: 2 });
      f.paint((x, t) => { if (t < this.t0 || t > first + .03) return; const q = clamp((t - this.t0) / (first - this.t0)); glowDot(x, 960, 540, 4 + 10 * q * q + Math.sin(t * 46) * 1.5 * q, Math.min(1, (t - this.t0) * 8)); }, true);
      f.cue(first, 'suck', .45, { end: first });
    }
    const ex = o.exit;
    if (ex) {
      this.exT = B(ex.at ?? this.k1 - .9);
      const last = this.shots[this.shots.length - 1];
      if (ex.type === 'zoom') { this.zP = last.counter(ex.char ?? 1); f.smear(this.exT + .1, this.t1, 2.2); f.fast(this.exT, this.t1, 12); f.cue(this.exT, 'whoosh_big', .85); }
      if (ex.type === 'collapse') { this.exE = B(ex.end ?? this.k1 - .4); f.fast(this.exT, this.exE + .05, 10); f.cue(this.exT, 'suck', .7, { end: this.exE }); f.comet({ t0: this.exE - B(.1), t1: this.exE, path: () => [960, 540], ease: E.lin, tail: .01, size: 11, hold: B(.4), fade: .03 }); }
      if (ex.type === 'flash') { f.flash({ t0: this.exT, dur: this.t1 - this.exT, rise: (this.t1 - this.exT) / 2, color: '#FFFFFF', peak: 1 }); f.cut(this.exT); f.cue(this.exT, 'whoosh_big', .6); }
    }
  }
  cam(t) {
    const base = super.cam(t);
    if (this.zP) { const z = zoomThrough(t, this.exT, this.t1, this.zP, base); if (z) return z; }
    return base;
  }
  update(t) {
    for (const sh of this.shots) {
      const on = t >= sh.s.t - .01 && t < sh.s.te;
      vis(sh.g, on);
      if (on) sh.update(t);
    }
    if (this.o.exit?.type === 'collapse') {
      const last = this.shots[this.shots.length - 1], c = tw(t, this.exT, this.exE, E.inExpo);
      set(last.g, 'transformOrigin', '960px 540px');
      set(last.g, 'transform', `scale(${lerp(1, 0, c).toFixed(4)})`);
      set(last.g, 'opacity', (1 - clamp((c - .7) / .3)).toFixed(3));
    }
  }
}
const fitTo = (w, max = 1760) => Math.min(1, max / Math.max(1, w));
// the Words shot styles; validate.js checks spec styles against SHOT_STYLES
const SHOTS = {
  punch3d(b, s) {
    const size = s.size || 360, wd = s.wdth || 118;
    const g = el('div', b.root, 'abs p3d', { left: '960px', top: (s.y || 540) + 'px' });
    const echo = [3, 2, 1].map(i => type(g, s.text, { size, wdth: wd, stroke: 2.5, color: rgba(s.col, .1 + .1 * (3 - i)), cls: 'abs' }));
    const X = extrude(g, s.text, { size, wdth: wd, layers: 30, depth: size * .3, face: s.col }); X.classList.add('abs');
    const [w, h] = meas(X.face), fit = fitTo(w);
    return { g, update(t) {
      const u = tw(t, s.t, s.t + .3, E.outExpo), dr = clamp((t - s.t) / Math.max(.3, s.te - s.t)), z = lerp(-2600, 0, u) + 160 * dr;
      set(g, 'transform', `translateZ(${z.toFixed(1)}px) rotateX(${lerp(14, 2, u).toFixed(2)}deg) rotateY(${(lerp(-18, 0, u) + 9 * dr).toFixed(2)}deg) scale(${fit})`);
      set(X, 'transform', `translate(${-w / 2}px,${-h / 2}px)`);
      echo.forEach((e, i) => {
        const ul = tw(t - (3 - i) * .05, s.t, s.t + .3, E.outExpo), zl = lerp(-2600, 0, ul) - (3 - i) * 170;
        set(e, 'transform', `translate(${-w / 2}px,${-h / 2}px) translateZ(${(zl - z).toFixed(1)}px)`);
        set(e, 'opacity', tw(t, s.t, s.t + .12).toFixed(3));
      });
    } };
  },
  slam(b, s) {
    const size = s.size || 430, wd = s.wdth || 112, y = s.y || 540;
    const g = el('div', b.root, 'abs full');
    const echo = s.echo === false ? [] : [-2, -1, 1, 2].map(k => ({ k, e: type(g, s.text, { size, wdth: wd, stroke: 3, color: rgba(s.col, Math.abs(k) === 1 ? .32 : .16), cls: 'abs' }) }));
    const L = letters(g, s.text, { size, wdth: wd, color: s.col, cls: 'abs', glow: s.glow });
    if (s.dot) L.spans[L.spans.length - 1].style.color = C.accent;
    const fit = fitTo(L.e.offsetWidth), text = [...s.text];
    const scr = s.scramble ? [B(s.at + s.scramble[0]), B(s.at + s.scramble[1])] : null;
    (s.inverts || []).forEach(k => { b.f.invert(B(s.at + k) + 1 / 60, 2 / 60); b.f.shake(B(s.at + k), 8); b.f.bump(B(s.at + k), .03); });
    if (scr) b.f.cue(scr[0], 'glitch', .45);
    if (s.glyphs) b.f.burst({ t0: s.t, x: 1150, y, n: 20, speed: 1100, life: .9, g: 600, glyphs: GLYPHS, gsize: 40, color: s.col, alpha: .85, seed: 133 + s.i, blend: 'source-over' });
    const fc = s.flip ? cc(s.flip.color) || typeOn(s.flip.ground) : null;
    return { g, counter: i => counterOf(L, i, 960, y, size * fit), update(t) {
      const a = t - s.t, sl = tw(t, s.t, s.t + .16, E.outExpo);
      if (fc) { const col = t >= s.tf ? fc : s.col; set(L.e, 'color', col); echo.forEach(({ k, e }) => styleType(e, { size, wdth: wd, stroke: 3, color: rgba(col, Math.abs(k) === 1 ? .32 : .16) })); }
      if (scr) { const rr = rng(Math.floor(t * 30) + 3); L.spans.forEach((sp, i) => { const turn = t > scr[0] + i * B(.2) && t < scr[1]; const ch = turn && rr() < .7 ? GLYPHS[Math.floor(rr() * GLYPHS.length)] : text[i]; if (sp.textContent !== ch) sp.textContent = ch; }); }
      set(L.e, 'transform', at(960, y, `scale(${(lerp(s.from ?? 1.3, 1, sl) * (1 + .05 * a) * fit).toFixed(4)})`));
      if (s.tumble !== false) tumble(L.spans, t, s.t, { stagger: .018, dur: .2, rot: 30, dy: -90, seed: 12 + s.i, from: .6 });
      echo.forEach(({ k, e }) => {
        const dir = (k > 0 ? 1 : -1) * (Math.abs(k) === 1 ? 1 : -1);
        set(e, 'transform', at(960 + dir * (60 + a * 460), y + k * size * .8 * fit, `scale(${fit})`));
        set(e, 'opacity', tw(t, s.t + .03 * Math.abs(k), s.t + .1 + .03 * Math.abs(k)).toFixed(3));
      });
    } };
  },
  stack(b, s) {
    const [k1t, wt] = s.text, size = s.size || 480, ks = s.kickerSize || 170, y = s.y || 600, t2 = B(s.at + (s.second ?? .5));
    const g = el('div', b.root, 'abs full');
    const K = letters(g, k1t, { size: ks, wdth: 125, color: s.col, cls: 'abs' });
    const Wd = letters(g, wt, { size, wdth: s.wdth || 100, color: s.col, cls: 'abs' });
    const fit = fitTo(Wd.e.offsetWidth), ww = Wd.e.offsetWidth * fit;
    const bar = el('div', g, 'abs', { background: C.accent, height: '30px', width: '0px' });
    b.f.bump(t2, .045); b.f.shake(t2, 9); b.f.cue(t2, 'hit', .7);
    K.spans.forEach((_, i) => b.f.cue(s.t + .08 + i * .025, 'pop', .1));
    return { g, counter: i => counterOf(Wd, i, 960, y, size * fit), update(t) {
      set(g, 'transform', `rotate(${lerp(-2.5, 1.2, clamp((t - s.t) / Math.max(.3, s.te - s.t))).toFixed(3)}deg)`);
      const kf = Math.min(fitTo(K.e.offsetWidth), Math.max(.55, fit * 1.15));
      set(K.e, 'transform', at(960, y - size * .5 * fit - ks * .5 * kf - 6, `scale(${kf.toFixed(4)})`));
      tumble(K.spans, t, s.t, { stagger: .025, dur: .26, rot: 80, dy: -160, seed: 13 + s.i });
      const sl = tw(t, t2, t2 + .15, E.outExpo);
      vis(Wd.e, t >= t2 - .01);
      set(Wd.e, 'transform', at(960, y, `scale(${(lerp(1.7, 1, sl) * (1 + .06 * clamp((t - t2) / .6)) * fit).toFixed(4)})`));
      set(Wd.e, 'opacity', clamp(sl * 3).toFixed(3));
      const bw = tw(t, t2 + B(.3), t2 + B(.7), E.outExpo);
      set(bar, 'width', (ww * bw).toFixed(1) + 'px');
      set(bar, 'transform', `translate(${960 - ww / 2}px, ${y + size * .4 * fit}px)`);
    } };
  },
  pair(b, s) {
    const [l1, l2] = s.text, size = s.size || 320, t2 = B(s.at + (s.second ?? .5)), c2 = cc(s.color2) || C.accent;
    const g = el('div', b.root, 'abs full');
    const echo = [-1, 1].map(() => type(g, `${l1} ${l2}`, { size: size * .68, wdth: 115, stroke: 2, color: rgba(s.col, .2), cls: 'abs' }));
    const A = type(g, l1, { size, wdth: 115, color: s.col, cls: 'abs' });
    const Bw = type(g, l2, { size, wdth: 115, color: c2, glow: isLight(s.ground) ? 0 : 22, cls: 'abs' });
    const fit = Math.min(fitTo(A.offsetWidth), fitTo(Bw.offsetWidth));
    b.f.shake(t2, 12); b.f.bump(t2, .04); b.f.cue(t2, 'hit', .75); b.f.fast(t2, t2 + .25, 10);
    return { g, update(t) {
      const a = tw(t, s.t, s.t + .2, E.outExpo), c = tw(t, t2, t2 + .2, E.outExpo), d = t - s.t;
      set(A, 'transform', at(960 - 900 * (1 - a), 540 - size * .47 * fit, `scale(${((1 + .04 * d) * fit).toFixed(4)})`));
      vis(Bw, t >= t2 - .01);
      set(Bw, 'transform', at(960 + 900 * (1 - c), 540 + size * .47 * fit, `scale(${((1 + .04 * d) * fit).toFixed(4)})`));
      echo.forEach((e, i) => { const sg = i ? 1 : -1; set(e, 'transform', at(960 + sg * (100 + d * 300), 540 + sg * 420)); set(e, 'opacity', a.toFixed(3)); });
    } };
  },
  split(b, s) {
    const f = b.f, [sm, bg] = s.text, size = s.size || 420, y = s.y || 590;
    const g = el('div', b.root, 'abs full');
    let codebg = null;
    if (s.code) { codebg = el('div', g, 'abs mono codebg'); codebg.textContent = (f.src.code || '').split('\n').slice(40, 100).join('\n'); }
    const small = type(g, sm, { size: s.smallSize || 170, wdth: 110, color: typeOn(s.ground), cls: 'abs' });
    const col = cc(s.color) || C.accent;
    const L = letters(g, bg, { size, wdth: s.wdth || 104, color: col, glow: isLight(s.ground) ? 0 : 26, cls: 'abs' });
    const fit = fitTo(L.e.offsetWidth + small.offsetWidth * .3), [lw, lh] = meas(L.e), sw = small.offsetWidth;
    const note = s.note ? el('div', g, 'abs mono note') : null;
    const scr = s.scramble ? [B(s.at + s.scramble[0]), B(s.at + s.scramble[1])] : null, glt = s.glitch != null ? B(s.at + s.glitch) : null;
    const tb2 = B(s.at + (s.second ?? .5));
    f.burst({ t0: tb2, x: 960 + lw * .14, y, n: 18, speed: 1050, life: .9, g: 600, glyphs: GLYPHS, gsize: 38, color: typeOn(s.ground), alpha: .85, seed: 6 + s.i });
    f.dot({ t0: tb2 - .02, dur: .6, cx: 960, cy: 560, rx: 900, ry: 400, sp: 22 });
    if (!isLight(s.ground)) f.bokeh({ t0: tb2, t1: s.te, n: 40, color: C.accent, size: 2.6, vy: -40, alpha: .5, seed: 8 + s.i });
    if (glt) f.cue(glt, 'glitch', .6);
    if (note) for (let i = 0; i < 22; i++) f.cue(B(s.at + (s.noteAt ?? 1)) + .42 * i / 22, 'key', .14);
    const text = [...bg], t2 = B(s.at + (s.second ?? .5));
    return { g, hitAt: [960 + lw * .14, y], hitT: t2, counter: i => counterOf(L, i, 960, y, size * fit), update(t) {
      const a = t - s.t;
      if (codebg) { set(codebg, 'transform', `translate(${(140 - a * 60).toFixed(1)}px, ${(-60 - a * 210).toFixed(1)}px) rotate(-8deg)`); set(codebg, 'opacity', (.09 * tw(t, s.t, s.t + .3)).toFixed(3)); }
      const ui = tw(t, s.t + B(.1), s.t + B(.1) + .25, E.outExpo);
      set(small, 'transform', at(960 - lw * fit / 2 + sw * fit / 2 + 14 - 220 * (1 - ui), y - lh * fit / 2 - 30, `scale(${fit})`));
      set(small, 'opacity', clamp(ui * 2).toFixed(3));
      const sl = tw(t, t2, t2 + .2, E.outExpo);
      vis(L.e, t >= t2 - .01);
      set(L.e, 'transform', at(960 + 520 * (1 - sl), y, `scaleX(${lerp(1.45, 1, sl).toFixed(3)}) scale(${fit})`));
      set(L.e, 'opacity', tw(t, t2 - .01, t2 + .03).toFixed(3));
      const rr = rng(Math.floor(t * 30) + 9), gl = glt != null && t >= glt && t < glt + .16;
      L.spans.forEach((sp, i) => {
        const turn = scr && t > scr[0] + i * B(.3) && t < scr[1];
        const ch = turn && rr() < .7 ? GLYPHS[Math.floor(rr() * GLYPHS.length)] : text[i];
        if (sp.textContent !== ch) sp.textContent = ch;
        set(sp, 'transform', gl ? `translate(${((rr() - .5) * 90).toFixed(1)}px, ${((rr() - .5) * 26).toFixed(1)}px)` : 'none');
      });
      if (!isLight(s.ground)) set(L.e, 'textShadow', gl ? `14px 0 rgba(255,40,70,.75), -14px 0 rgba(40,200,255,.6)` : `0 0 26px ${rgba(col, .55)}, 0 0 68px ${rgba(col, .28)}`);
      if (note) {
        const n = Math.floor(tw(t, B(s.at + (s.noteAt ?? 1)), B(s.at + (s.noteAt ?? 1)) + .42, E.lin) * s.note.length);
        note.textContent = s.note.slice(0, n) + (n > 0 && n < s.note.length ? '▍' : '');
        set(note, 'transform', at(960, y + lh * fit / 2 + 50));
      }
    } };
  },
  cut(b, s) {
    const size = s.size || 400, wd = s.wdth || 104, dy = s.dy || 0, rot = s.rot || 0;
    const g = el('div', b.root, 'abs full');
    const ec = s.col === C.ink ? rgba(C.ink, .25) : rgba(s.col, .22);
    const echo = s.echo === false ? [] : [-1, 1].map(() => type(g, s.text, { size, wdth: wd, stroke: 3, color: ec, cls: 'abs' }));
    const L = letters(g, s.text, { size, wdth: wd, color: s.col, glow: s.col === C.accent && !isLight(s.ground) ? 26 : 0, stroke: s.stroke || 0, cls: 'abs' });
    const fit = fitTo(L.e.offsetWidth, 1800);
    if (s.rgb) b.f.invert(s.t + 1 / 60, 2 / 60);
    return { g, counter: i => counterOf(L, i, 960, 540 + dy, size * fit), update(t) {
      const a = t - s.t, p = tw(t, s.t, s.t + .14, E.outExpo);
      if (s.rgb) { const v = shake(a, 16, 6, 40); set(L.e, 'textShadow', `${v.toFixed(1)}px 0 rgba(255,40,70,.75), ${(-v).toFixed(1)}px 0 rgba(40,200,255,.65)`); }
      set(L.e, 'transform', at(960, 540 + dy, `scale(${(lerp(1.25, 1, p) * (1 + .24 * a) * fit).toFixed(4)}) rotate(${(rot * (1 + .5 * (1 - p)) + 6 * a * (rot >= 0 ? 1 : -1)).toFixed(2)}deg)`));
      echo.forEach((e, i) => { const sg = i ? 1 : -1; set(e, 'transform', at(960 + sg * (120 + a * 1100), 540 + dy + sg * size * .86 * fit, `rotate(${rot}deg) scale(${fit})`)); });
    } };
  },
};
export const SHOT_STYLES = Object.freeze(Object.keys(SHOTS));

// ---------- Strike: "NO <thing>." over a mock of the thing, then the thing dies ----------
// items: [{ word, ui: { type: 'timeline', title, tag, tracks } | { type: 'tiles', tiles: [[label, icon], ...] } | { type: 'rack', rows: [...] },
//           ground, at, kill: 'slash' | 'topple' | 'power' }]   no: the word that slams beside each item ('NO')
// Each item: mock enters, NO slams at +1 beat, the word fills at +1.5, the mock dies at +2. tvOff: the last item ends in a TV switch-off point.
function timelinePanel(parent, ui) {
  const p = el('div', parent, 'panel');
  const hd = el('div', p, 'phead');
  for (let i = 0; i < 3; i++) el('span', hd, 'pdot');
  el('span', hd, 'mono ptitle').textContent = ui.title || 'untitled_v1';
  el('span', hd, 'mono ptag').textContent = ui.tag || 'EXPORTING';
  const ru = el('div', p, 'ruler');
  for (let i = 0; i < 24; i++) {
    el('div', ru, 'tick', { left: (160 + i * 40) + 'px', height: i % 4 ? '7px' : '13px' });
    if (i % 4 === 0) el('div', ru, 'mono tlab', { left: (164 + i * 40) + 'px' }).textContent = `00:${String(i / 4 * 10).padStart(2, '0')}`;
  }
  const names = ui.tracks || ['V3', 'V2', 'V1', 'FX', 'CAM', 'A1', 'A2'], r = rng(21);
  p.clips = [];
  names.slice(0, 7).forEach((n, i) => {
    const row = el('div', p, 'trow', { top: (82 + i * 46) + 'px' });
    el('div', row, 'mono tname').textContent = n;
    let x = 160 + r() * 60;
    while (x < 1060) {
      const w = 70 + r() * 210;
      p.clips.push(el('div', row, 'clip' + (r() < .18 ? ' hot' : ''), { left: x + 'px', width: Math.min(w, 1090 - x) + 'px' }));
      x += w + 8 + r() * 50;
    }
  });
  p.ph = el('div', p, 'playhead');
  return p;
}
function noRow(no, w, t, tNo, tFill, y, o) {
  if (!no.__w) { no.__w = no.offsetWidth; w.__w = w.offsetWidth; }
  const nw = no.__w, ww = w.__w, gap = 54, tot = nw + gap + ww, sc = Math.min(1, 1680 / tot);
  const u = tw(t, tNo, tNo + .18, E.outExpo), xw = lerp(960, 960 + (tot / 2 - ww / 2) * sc, u), xn = 960 + (-tot / 2 + nw / 2) * sc;
  vis(no, t >= tNo - .01);
  const dr = Math.max(0, t - tNo) * 70;
  set(w, 'transform', at(xw + dr, y, `scale(${sc.toFixed(4)})`));
  set(no, 'transform', at(xn - 60 * (1 - u) + dr, y, `scale(${(sc * lerp(1.9, 1, u)).toFixed(4)}) rotate(${lerp(-12, -3, u).toFixed(2)}deg)`));
  set(no, 'opacity', clamp(u * 3).toFixed(3));
  const filled = t >= tFill;
  if (w.__filled !== filled) { styleType(w, { ...o, stroke: filled ? 0 : 3 }); w.__filled = filled; }
}
export class Strike extends Scene {
  build() {
    const f = this.f, r = this.root, o = this.o, n = o.items.length, span = (this.k1 - this.k0) / n;
    r.classList.add('persp');
    this.items = o.items.map((it, i) => {
      const k = it.at ?? this.k0 + i * span, kEnd = i < n - 1 ? (o.items[i + 1].at ?? this.k0 + (i + 1) * span) : this.k1;
      const ui = it.ui || { type: 'timeline' }, kill = it.kill || { timeline: 'slash', tiles: 'topple', rack: 'power' }[ui.type] || 'slash';
      const g = cc(it.ground) || null, light = isLight(it.ground);
      const S = { it, ui, kill, k, kEnd, t: B(k), te: B(kEnd), light, tNo: B(k + 1), tFill: B(k + 1.5), tK: B(k + 2) };
      if (g) f.ground(S.t, S.te, g);
      if (i > 0) f.whip(S.t, i % 2 ? 1700 : 0, i % 2 ? 0 : 1150, .13, i % 2 ? -2 : 0);
      S.box = el('div', r, 'abs full p3d');
      S.wo = { size: 170, wdth: 110, color: light ? C.ink : C.paper };
      const mk = parent => {
        const no = type(parent, o.no || 'NO', { size: 170, wdth: 110, color: C.accent, glow: light ? 0 : 18, cls: 'abs' });
        const w = type(parent, it.word, { ...S.wo, stroke: 3, cls: 'abs' });
        return { no, w };
      };
      if (kill === 'slash') {
        const P1 = [250, 1010], P2 = [1700, 110], d = [P2[0] - P1[0], P2[1] - P1[1]], dl = Math.hypot(...d), dn = [d[0] / dl, d[1] / dl], nn = [-dn[1], dn[0]];
        S.n = nn;
        const E1 = [P1[0] - dn[0] * 3000, P1[1] - dn[1] * 3000], E2 = [P2[0] + dn[0] * 3000, P2[1] + dn[1] * 3000];
        const poly = sg => `polygon(${[E1, E2, [E2[0] + sg * nn[0] * 4000, E2[1] + sg * nn[1] * 4000], [E1[0] + sg * nn[0] * 4000, E1[1] + sg * nn[1] * 4000]].map(q => `${q[0].toFixed(0)}px ${q[1].toFixed(0)}px`).join(',')})`;
        S.halves = [1, -1].map(sg => {
          const h = el('div', S.box, 'abs full'); h.style.clipPath = poly(sg);
          h.p = timelinePanel(h, ui); h.p.style.left = '400px'; h.p.style.top = '430px';
          Object.assign(h, mk(h)); return h;
        });
        f.comet({ t0: S.tK - .03, t1: S.tK + .09, path: u => [lerp(P1[0], P2[0], u), lerp(P1[1], P2[1], u)], ease: E.lin, tail: .07, size: 11 });
        f.slash({ t0: S.tK - .03, x1: P1[0], y1: P1[1], x2: P2[0], y2: P2[1], dur: .12, hold: .1, fade: .1, w: 7 });
        f.slash({ t0: S.tK + .07, x1: 330, y1: 150, x2: 1620, y2: 980, dur: .08, hold: .06, fade: .1, w: 6 });
        [.32, .5, .68].forEach((q, j) => f.burst({ t0: S.tK + .02 + j * .02, x: lerp(P1[0], P2[0], q), y: lerp(P1[1], P2[1], q), n: 20, speed: 1000, life: .5, seed: 30 + j, w: 2.6 }));
        f.flash({ t0: S.tK, dur: .2, rise: .015, color: C.accent, peak: .22 }); f.shake(S.tK, 16); f.bump(S.tK, .04);
        f.cue(S.tK - .03, 'slash', 1); f.cue(S.tK, 'impact', .7); f.cue(S.tK + .07, 'slash', .6);
        f.fast(S.tK - .05, S.tK + .8, 10);
      } else {
        Object.assign(S, mk(S.box));
        if (ui.type === 'tiles') {
          S.tiles = el('div', S.box, 'abs p3d', { left: '441px', top: '480px', width: '1038px', height: '274px' });
          const rr = rng(17 + i);
          S.tl = (ui.tiles || []).slice(0, 8).map(([nm, ic, ver], j) => {
            const t = el('div', S.tiles, 'tile' + (light ? ' lt' : ''), { left: (j % 4) * 266 + 'px', top: Math.floor(j / 4) * 150 + 'px' });
            el('div', t, 'ticon').textContent = ic || '◆';
            el('div', t, 'mono tlabel').textContent = nm;
            el('div', t, 'mono tver').textContent = ver || '';
            t.rz = (rr() - .5) * 50; t.z0 = -700 - rr() * 900;
            f.cue(S.t + .05 + j * .035, 'pop', .2); f.cue(S.tK + j * .045 + .25, 'thock', .4);
            return t;
          });
          f.slash({ t0: S.tK + B(.55), x1: 380, y1: 900, x2: 1560, y2: 360, dur: .1, hold: .14, fade: .22, w: 6 }); f.cue(S.tK + B(.55), 'slash', .6);
          f.fast(S.t, S.t + .6, 8); f.fast(S.tK, S.tK + .9, 8);
        } else {
          S.rack = el('div', S.box, 'abs', { left: '510px', top: '440px', width: '900px', height: '378px' });
          S.units = (ui.rows || ['NODE 01', 'NODE 02', 'NODE 03']).slice(0, 3).map((nm, j) => {
            const u = el('div', S.rack, 'unit', { top: j * 134 + 'px' });
            el('div', u, 'mono uname').textContent = nm;
            const leds = el('div', u, 'leds');
            u.leds = Array.from({ length: 14 }, () => el('span', leds, 'led'));
            el('div', u, 'vents');
            f.cue(S.t + .05 + j * .1, 'thock', .5);
            return u;
          });
          S.tK = B(k + 2.5);
          f.comet({ t0: S.tK - B(.6), t1: S.tK, path: u => qb([2050, 380], [1700, 420], [1410, 630], u), ease: E.inCubic, tail: .14, size: 9 });
          f.burst({ t0: S.tK, x: 1410, y: 630, n: 22, speed: 900, life: .45, seed: 44 });
          f.cue(S.tK, 'power_down', .8);
        }
      }
      f.bump(S.tNo, .035); f.shake(S.tNo, 8); f.cue(S.tNo, 'thock', .8); f.cue(S.tNo, 'hit', .85);
      return S;
    });
    const L = this.items[n - 1];
    if (o.tvOff !== false) {
      this.tv = [B(this.k1 - .7), B(this.k1 - .4), this.t1];
      f.paint((x, t) => { const a = clamp((t - this.tv[1]) / .05) * (1 - clamp((t - this.t1 - .02) / .06)); glowDot(x, 960, 629, 9, a, '#FFFFFF'); });
      f.fast(this.tv[0], this.t1, 8); f.cue(this.tv[0], 'glitch', .4);
    }
  }
  update(t) {
    this.items.forEach((S, i) => {
      const on = t >= S.t - .01 && t < S.te;
      vis(S.box, on);
      if (!on) return;
      if (S.halves) {
        const e = tw(t, S.t, S.t + .42, E.outExpo), a = t - S.tK - .04, n = S.n;
        set(S.box, 'transform', `translateZ(${lerp(-1500, 0, e).toFixed(1)}px) rotateX(${lerp(28, 0, e).toFixed(2)}deg) rotateZ(${lerp(-5, 0, e).toFixed(2)}deg)`);
        set(S.box, 'opacity', clamp(e * 2).toFixed(3));
        S.halves.forEach((h, j) => {
          const sg = j ? -1 : 1, u = a > 0 ? E.outCubic(clamp(a / .5)) : 0, g = a > 0 ? a * a : 0;
          set(h, 'transform', `translate(${(sg * n[0] * 120 * u).toFixed(1)}px,${(sg * n[1] * 120 * u + (j ? 820 : 1050) * g).toFixed(1)}px) rotate(${(sg * 8 * u).toFixed(2)}deg)`);
          set(h, 'opacity', (1 - clamp((a - .35) / .4)).toFixed(3));
          set(h.p, 'transform', `rotateX(14deg) translateY(${(18 * Math.sin(t * 3)).toFixed(1)}px)`);
          set(h.p.ph, 'left', (240 + ((t - S.t) * 900) % 900).toFixed(1) + 'px');
          h.p.clips.forEach((c, q) => set(c, 'opacity', (Math.floor(t * 14 + q * 1.7) % 5 === 0 ? .45 : 1).toString()));
          noRow(h.no, h.w, t, S.tNo, S.tFill, 260, S.wo);
        });
        return;
      }
      noRow(S.no, S.w, t, S.tNo, S.tFill, 260, S.wo);
      if (S.tl) {
        const sw = tw(t, S.t, S.tK, E.inOutCubic), hot = t >= S.tFill && t < S.tFill + .14;
        set(S.tiles, 'transform', `rotateX(${lerp(24, 8, sw).toFixed(2)}deg) rotateY(${lerp(-18, 12, sw).toFixed(2)}deg) translateZ(${lerp(-200, 60, sw).toFixed(1)}px)`);
        S.tl.forEach((tile, j) => {
          const p = tw(t, S.t + j * .035, S.t + j * .035 + .38, E.outBack);
          const d = tw(t, S.tK + j * .045, S.tK + j * .045 + .3, E.inCubic), fall = Math.max(0, t - S.tK - j * .045 - .3);
          set(tile, 'transform', `translateZ(${lerp(tile.z0, 0, p).toFixed(1)}px) rotateZ(${(tile.rz * (1 - p)).toFixed(2)}deg) translateY(${(d * 70 + 5 * Math.sin(t * 4 + j * 1.3) + 1400 * fall * fall).toFixed(1)}px) rotateX(${(-100 * d).toFixed(2)}deg)`);
          set(tile, 'opacity', (clamp(p * 1.6) * (1 - clamp((d - .8) / .2) * .5)).toFixed(3));
          set(tile, 'borderColor', hot ? C.accent : '');
        });
      }
      if (S.units) {
        const sw = tw(t, S.t, S.te, E.inOutCubic);
        set(S.rack, 'transform', `perspective(1400px) rotateY(${lerp(22, -14, sw).toFixed(2)}deg) rotateX(${lerp(8, -4, sw).toFixed(2)}deg) translateX(${lerp(-60, 60, sw).toFixed(1)}px)`);
        S.units.forEach((u, j) => {
          const p = tw(t, S.t + .05 + j * .1, S.t + .05 + j * .1 + .3, E.outBack), sh = t > S.tK ? shake(t - S.tK - j * .03, 6, 10, 70) : 0;
          set(u, 'transform', `translateX(${(-1100 * (1 - p) + sh).toFixed(1)}px) translateY(${(t < S.tK ? 2 * Math.sin(t * 47 + j * 2) : 0).toFixed(2)}px)`);
          set(u, 'opacity', clamp(p * 1.4).toFixed(3));
          u.leds.forEach((l, q) => {
            const dead = t > S.tK + (13 - q) * .018 + j * .03, blink = Math.floor(t * 12 + q * 3.7 + j * 5.1) % 4 !== 0;
            set(l, 'background', dead ? '#2A2D31' : (q % 5 === 0 ? (blink ? C.accent : C.sideP) : (blink ? C.paper : '#4A4C50')));
          });
        });
      }
      if (this.tv && i === this.items.length - 1) {
        const o1 = tw(t, this.tv[0], this.tv[1], E.inCubic), o2 = tw(t, this.tv[1], this.tv[2], E.inExpo);
        set(S.box, 'transformOrigin', '960px 629px');
        set(S.box, 'transform', `scale(${lerp(1, .003, o2).toFixed(4)},${lerp(1, .006, o1).toFixed(4)})`);
        set(S.box, 'filter', o1 > 0 ? `brightness(${(1 + 3 * o1).toFixed(2)})` : 'none');
      }
    });
  }
}

// ---------- Graph: a comet draws a graph, it folds, a giant number lands, the camera flies through it ----------
// { number: '0', label: 'CUTS', sub: 'OFF THE BEAT', ground: 'paper', ticks: i => i * 4 + 'f', portal: true }
export class Graph extends Scene {
  static N = 6;
  build() {
    const f = this.f, r = this.root, o = this.o;
    this.s = svg('svg', r, { class: 'full abs', viewBox: '0 0 1920 1080', style: 'overflow:visible' });
    const X0 = 260, X1 = 1660, Y0 = 210, Y1 = 760, sp = o.from || [960, 629];
    this.pR = polyline([sp, [sp[0], Y1], [X1, Y1]]); this.pL = polyline([[sp[0], Y1], [X0, Y1], [X0, Y0]]);
    this.dropLen = Y1 - sp[1];
    this.axR = svg('polyline', this.s, { points: ptsAttr([[sp[0], Y1], [X1, Y1]]), fill: 'none', stroke: rgba(C.paper, .55), 'stroke-width': 2 });
    this.axL = svg('polyline', this.s, { points: ptsAttr([[sp[0], Y1], [X0, Y1], [X0, Y0]]), fill: 'none', stroke: rgba(C.paper, .55), 'stroke-width': 2 });
    this.lenL = this.pL.len;
    this.ticks = svg('g', this.s);
    const tl = o.ticks || (i => i * 4 + 'f');
    for (let i = 0; i <= 14; i++) {
      svg('line', this.ticks, { x1: X0 + i * 100, x2: X0 + i * 100, y1: Y1, y2: i % 2 ? Y1 + 10 : Y1 + 18, stroke: rgba(C.paper, .4), 'stroke-width': 1.5 });
      if (i % 2 === 0) { const tx = svg('text', this.ticks, { x: X0 + i * 100, y: Y1 + 46, class: 'svgmono', 'text-anchor': 'middle' }); tx.textContent = tl(i); }
    }
    const curve = u => cb([X0, Y1], [720, 770], [780, 190], [1110, 235], u), curve2 = u => cb([1110, 235], [1380, 272], [1460, 290], [X1, 280], u);
    const pts = []; for (let i = 0; i <= 120; i++) pts.push(curve(i / 120)); for (let i = 1; i <= 60; i++) pts.push(curve2(i / 60));
    this.cpath = polyline(pts);
    this.cv = svg('path', this.s, { d: 'M' + pts.map(p => p.map(v => v.toFixed(1)).join(' ')).join(' L'), fill: 'none', stroke: C.accent, 'stroke-width': 4, 'stroke-linecap': 'round', class: 'glowline' });
    this.cvLen = this.cpath.len;
    this.kq = [0, .3, .56, .8, 1];
    this.kd = this.kq.map(q => { const [x, y] = this.cpath(q); return svg('rect', this.s, { x: -11, y: -11, width: 22, height: 22, fill: C.bg, stroke: C.accent, 'stroke-width': 3, transform: `translate(${x} ${y}) rotate(45)` }); });
    this.tA = this.k(0); this.tA1 = this.k(1); this.tC0 = this.k(1); this.tC1 = this.k(2.6); this.tPop = this.k(2.9); this.tF = [this.k(3.35), this.k(3.9)]; this.tZ = this.k(4); this.tX = this.k(5.2);
    f.comet({ t0: this.tA, t1: this.tA1, path: u => this.pR(u), ease: E.inOutCubic, tail: .14, size: 8 });
    f.comet({ t0: this.tA + .12, t1: this.tA1, path: u => this.pL(u), ease: E.inOutCubic, tail: .14, size: 8 });
    f.comet({ t0: this.tC0, t1: this.tC1, path: u => this.cpath(u), ease: E.inOutCubic, tail: .16, size: 10 });
    this.kq.forEach((q, i) => { const [x, y] = this.cpath(q); f.burst({ t0: this.tPop + i * .065, x, y, n: 12, speed: 620, life: .38, seed: 60 + i, w: 2.6 }); f.ring({ t0: this.tPop + i * .065, dur: .35, cx: x, cy: y, r0: 8, r1: 70, w: 4 }); });
    const gr = o.ground ?? 'paper', light = isLight(gr), ink = light ? C.ink : C.paper;
    this.g = el('div', r, 'abs full');
    this.zEcho = [0, 1, 2].map(() => type(this.g, o.number ?? '0', { size: 780, stroke: 3, color: rgba(ink, .4), cls: 'abs' }));
    this.portal = el('div', this.g, 'abs', { background: C.bg, borderRadius: '50%' });
    vis(this.portal, o.portal !== false);
    this.zero = type(this.g, o.number ?? '0', { size: 780, color: ink, cls: 'abs' });
    this.kw = type(this.g, o.label || '', { size: 128, wdth: 100, color: ink, cls: 'abs' });
    this.kb = el('div', this.g, 'abs mono sub' + (light ? ' lt' : '')); this.kb.textContent = o.sub || '';
    [this.zW, this.zH] = meas(this.zero);
    this.zfit = fitTo(this.zW + 40 + this.kw.offsetWidth + 60, 1500);
    this.zX = 500; this.zY = 540;
    this.oPt = [this.zX, this.zY - this.zH / 2 * this.zfit + .485 * 780 * this.zfit];
    if (gr) f.ground(this.tZ, this.t1, cc(gr));
    f.ray({ t0: this.tZ, dur: .5, color: ink, alpha: light ? .5 : .8, n: 70, r0: 280, r1: 1500, w: 3, screen: true, seed: 71, ...(light ? { blend: 'source-over' } : {}) });
    f.shake(this.tZ, 18); f.bump(this.tZ, .06); f.bump(this.k(5), .03);
    f.fast(this.tZ - .03, this.tZ + .25, 12); f.fast(this.tF[0], this.tZ, 8);
    if (o.portal !== false) { f.smear(this.tX + .05, this.t1, 2.2); f.fast(this.tX, this.t1, 12); f.cue(this.tX, 'whoosh_big', .8); }
    f.cue(this.tA, 'draw', .55); f.cue(this.tC0, 'draw', .5); this.kq.forEach((q, i) => f.cue(this.tPop + i * .065, 'tick', .5));
    f.cue(this.tF[0], 'suck', .45, { end: this.tZ }); f.cue(this.tZ, 'impact', 1);
  }
  head(t) { return this.cpath(E.inOutCubic(clamp((t - this.tC0) / (this.tC1 - this.tC0)))); }
  cam(t) {
    const u = clamp((t - this.t0) / (this.t1 - this.t0));
    let s = 1 + .05 * u, x = 0, y = 0, r = lerp(.6, -.6, u);
    const fin = tw(t, this.tC0 - .25, this.tC0 + .2, E.inOutCubic) * (1 - tw(t, this.tC1, this.tC1 + .4, E.inOutCubic));
    if (fin > 0) { const [hx, hy] = this.head(t - .06); x = (hx - 960) * .8 * fin; y = (hy - 540) * .8 * fin; s *= lerp(1, 1.5, fin); }
    if (this.o.portal !== false) { const z = zoomThrough(t, this.tX, this.t1, this.oPt, { s, r }); if (z) return z; }
    return { x, y, s, r };
  }
  update(t) {
    const a = tw(t, this.tA, this.tA1, E.inOutCubic), aL = tw(t, this.tA + .12, this.tA1, E.inOutCubic);
    this.axR.setAttribute('stroke-dasharray', `${Math.max(0, this.pR.len * a - this.dropLen).toFixed(1)} 9999`);
    this.axL.setAttribute('stroke-dasharray', `${(this.lenL * aL).toFixed(1)} 9999`);
    set(this.ticks, 'opacity', tw(t, this.k(.7), this.k(.7) + .2).toFixed(3));
    const c = tw(t, this.tC0, this.tC1, E.inOutCubic);
    this.cv.setAttribute('stroke-dasharray', `${(this.cvLen * c).toFixed(1)} 9999`);
    const fold = tw(t, this.tF[0], this.tF[1], E.inCubic);
    set(this.s, 'transformOrigin', '960px 760px');
    set(this.s, 'transform', `scaleY(${(1 - fold).toFixed(4)}) scaleX(${(1 - fold * .3).toFixed(4)})`);
    vis(this.s, t < this.tZ);
    this.kd.forEach((d, i) => {
      const show = c >= this.kq[i] - .001 ? tw(t, this.tC0 + (this.tC1 - this.tC0) * this.kq[i] * .9, this.tC0 + (this.tC1 - this.tC0) * this.kq[i] * .9 + .12, E.outBack) : 0;
      const pop = tw(t, this.tPop + i * .065, this.tPop + i * .065 + .16, E.outCubic), [x, y] = this.cpath(this.kq[i]);
      d.setAttribute('transform', `translate(${x} ${y}) rotate(45) scale(${(show * (1 + pop * 1.2)).toFixed(3)})`);
      d.setAttribute('opacity', (1 - pop).toFixed(3));
    });
    vis(this.g, t >= this.tZ - .02);
    if (t < this.tZ - .02) return;
    const z = tw(t, this.tZ, this.tZ + .22, E.outExpo), zf = this.zfit;
    set(this.zero, 'transform', at(this.zX, this.zY, `scale(${(lerp(2.8, 1, z) * zf).toFixed(3)})`));
    set(this.zero, 'opacity', tw(t, this.tZ - .02, this.tZ + .04).toFixed(3));
    set(this.portal, 'width', this.zW * .32 + 'px'); set(this.portal, 'height', 780 * .5 + 'px');
    set(this.portal, 'transform', at(this.oPt[0], this.oPt[1], `scale(${(lerp(2.8, 1, z) * zf).toFixed(3)})`));
    this.zEcho.forEach((e, i) => {
      const p0 = this.tZ + i * B(.5), q = clamp((t - p0) / .5);
      set(e, 'transform', at(this.zX, this.zY, `scale(${(lerp(1, 1.7, E.outCubic(q)) * zf).toFixed(3)})`));
      set(e, 'opacity', (t >= p0 ? (1 - q) * .9 : 0).toFixed(3));
    });
    const k1 = tw(t, this.tZ + .05, this.tZ + .3, E.outExpo), k2 = tw(t, this.tZ + .12, this.tZ + .4, E.outExpo), lx = this.zX + this.zW * zf / 2 + 60;
    set(this.kw, 'transform', `translate(${(lx + 320 * (1 - k1)).toFixed(1)}px, 452px) scale(${zf})`); set(this.kw, 'transformOrigin', '0 0');
    set(this.kw, 'opacity', k1.toFixed(3));
    set(this.kb, 'transform', `translate(${(lx + 8 + 220 * (1 - k2)).toFixed(1)}px, 610px)`);
    set(this.kb, 'opacity', k2.toFixed(3));
  }
}

// ---------- Hero: a kicker line, then an extruded 3D title flies in, orbits, flips and shines ----------
// { kicker: 'YOU ARE', title: 'THE POST.', sub: 'press start to deliver', chevron: '> ' }
export class Hero extends Scene {
  static N = 8;
  build() {
    const f = this.f, r = this.root, o = this.o;
    r.classList.add('persp');
    this.by = letters(r, o.kicker || '', { size: 120, wdth: 125, cls: 'abs' });
    this.byFit = fitTo(this.by.e.offsetWidth, 1500);
    this.w = el('div', r, 'abs p3d', { left: '960px', top: '590px' });
    this.ghost = [3, 2, 1].map(i => type(this.w, o.title, { size: 250, wdth: 108, stroke: 2, color: rgba(C.accent, .16 * (4 - i)), cls: 'abs' }));
    this.title = extrude(this.w, o.title, { size: 250, wdth: 108, layers: 44, depth: 96, face: C.paper });
    this.title.classList.add('abs');
    sheen(this.title.face, C.paper);
    [this.tw0, this.th0] = meas(this.title.face);
    this.tfit = fitTo(this.tw0, 1500);
    this.sub = el('div', r, 'abs mono chev');
    el('span', this.sub, 'chv').textContent = o.chevron ?? '> ';
    this.subT = el('span', this.sub); this.subC = el('span', this.sub, 'blk');
    this.tL = this.k(2);
    const cx = 960, cy = 590;
    f.comet({ t0: this.k(.4), t1: this.tL, path: u => { const ang = -2.2 + u * Math.PI * 2.4, rr = 360 * (1 - u * u * u) + 4; return [cx + Math.cos(ang) * rr * 1.3, cy + Math.sin(ang) * rr * .62]; }, ease: E.inCubic, tail: .22, size: 10 });
    f.slash({ t0: this.tL + .03, x1: 480, y1: 840, x2: 1460, y2: 330, dur: .11, hold: .16, fade: .25, w: 6 });
    hitFx(f, this.tL, { hit: 2, at: [960, 590] });
    f.bump(this.k(4), .03); f.bump(this.k(6), .03);
    f.bokeh({ t0: this.t0, t1: this.t1, n: 46, color: C.accent, size: 2.4, vx: 24, vy: -30, alpha: .45, seed: 84 });
    f.fast(this.t0, this.t0 + .5, 8); f.fast(this.k(4), this.k(4.5), 10); f.fast(this.k(6), this.k(6.6), 8);
    this.by.spans.forEach((_, i) => f.cue(this.t0 + .06 + i * .025, 'key', .2));
    f.cue(this.k(.4), 'whoosh', .6); f.cue(this.tL, 'impact_big', 1); f.cue(this.tL + .03, 'slash', .8);
    f.cue(this.k(3.3), 'sparkle', .35); f.cue(this.k(6.2), 'sparkle', .35); f.cue(this.k(4) + .05, 'whoosh_big', .55);
    f.slash({ t0: this.k(5.5), x1: -100, y1: 700, x2: 2020, y2: 480, dur: .1, hold: .05, fade: .2, w: 4 }); f.cue(this.k(5.5), 'slash', .75);
    const sub = o.sub || '';
    for (let i = 0; i < Math.min(16, sub.length); i++) f.cue(this.k(5) + .4 * i / Math.min(16, sub.length), 'key', .16);
  }
  cam(t) {
    const u = clamp((t - this.t0) / (this.t1 - this.t0)), land = tw(t, this.t0, this.t0 + .6, E.outExpo);
    return { s: lerp(this.o.landZoom ?? 1.7, 1, land) * (1 + .08 * E.inOutCubic(u)), r: lerp(-1, 1, u) + 4 * (1 - land), x: lerp(-30, 30, u) };
  }
  update(t) {
    const d = t - this.t0, ent = tw(t, this.t0, this.t0 + .35, E.outExpo);
    tumble(this.by.spans, t, this.t0, { stagger: .025, dur: .3, rot: 60, dy: -120, seed: 25 });
    set(this.by.e, 'transform', at(960 + 700 * (1 - ent) - d * 90, 270, `scale(${this.byFit})`));
    const u = tw(t, this.tL, this.tL + .45, E.outExpo), orb = E.inOutCubic(tw(t, this.tL, this.t1, E.lin)), flip = 360 * E.inOutCubic(tw(t, this.k(4), this.k(4) + .3, E.lin));
    vis(this.w, t >= this.tL - .01);
    const z = lerp(-2400, 0, u) + 60 * orb;
    set(this.w, 'transform', `translateZ(${z.toFixed(1)}px) rotateX(${(lerp(18, 9, u) - 6 * orb + flip).toFixed(2)}deg) rotateY(${(lerp(-140, -18, u) + 48 * orb).toFixed(2)}deg) scale(${this.tfit})`);
    set(this.w, 'opacity', tw(t, this.tL - .01, this.tL + .05).toFixed(3));
    set(this.title, 'transform', `translate(${-this.tw0 / 2}px,${-this.th0 / 2}px)`);
    const sw = Math.max(tw(t, this.k(3.3), this.k(3.3) + .5, E.inOutCubic) * (t < this.k(6.2) ? 1 : 0), tw(t, this.k(6.2), this.k(6.2) + .5, E.inOutCubic));
    set(this.title.face, 'backgroundPosition', `${lerp(100, 0, sw).toFixed(2)}% 0`);
    const gh = tw(t, this.k(6), this.k(6.6), E.outCubic);
    this.ghost.forEach((g, i) => { set(g, 'transform', `translate(${-this.tw0 / 2}px,${-this.th0 / 2}px) translateZ(${(-(3 - i) * 190 * gh - 100).toFixed(1)}px)`); set(g, 'opacity', gh.toFixed(3)); });
    const txt = this.o.sub || '', n = Math.floor(tw(t, this.k(5), this.k(5) + .4, E.lin) * txt.length);
    this.subT.textContent = txt.slice(0, n);
    set(this.subC, 'opacity', t < this.k(5) ? '0' : (n < txt.length || Math.floor(t * 3.4) % 2 === 0 ? '1' : '0'));
    set(this.sub, 'transform', at(960, 885));
    set(this.sub, 'opacity', (txt ? tw(t, this.k(4.8), this.k(5)) : 0).toFixed(3));
  }
}

// ---------- Prompt: a brief types itself (camera on the caret), keywords punch, then a push into Enter = the drop ----------
// { label: 'BRIEF.md', text: [['plain text '], ['keyword', 1], ...], unit: 'CHARS', doodles: true }
// The Enter key fills the frame with the accent on the block's last beat: start the next block on an accent ground.
export class Prompt extends Scene {
  static N = 19;
  build() {
    const f = this.f, r = this.root, o = this.o;
    r.classList.add('persp');
    this.g = el('div', r, 'abs full p3d');
    const X = 340, Y = 395, Wd = 1240, Hd = 330;
    this.X = X; this.Y = Y;
    this.panel = el('div', this.g, 'abs briefbox', { left: X + 'px', top: Y + 'px', width: Wd + 'px', height: Hd + 'px' });
    this.s = svg('svg', this.g, { class: 'full abs', viewBox: '0 0 1920 1080' });
    const P = chamferPts(X, Y, Wd, Hd, 16);
    this.outline = svg('polyline', this.s, { points: ptsAttr(P), fill: 'none', stroke: rgba(C.paper, .75), 'stroke-width': 2.2 });
    this.oPath = polyline(P); this.oLen = this.oPath.len;
    const hd = el('div', this.panel, 'bhead');
    const l = el('div', hd, 'mono'); el('span', l, 'bdot'); el('span', l).textContent = o.label || 'BRIEF.md';
    this.count = el('div', hd, 'mono');
    this.text = el('div', this.panel, 'btext mono');
    this.chars = []; this.kws = [];
    for (const [s, kw] of o.text) {
      const host = kw ? el('span', this.text, 'kw') : this.text;
      const i0 = this.chars.length;
      for (const ch of s) { const c = el('span', host, 'bc'); c.textContent = ch; this.chars.push(c); }
      if (kw) this.kws.push({ host, i0, i1: this.chars.length - 1 });
    }
    this.caret = el('div', this.text, 'caret');
    this.cpos = this.chars.map(c => [...relPos(c, this.text), c.offsetWidth]);
    // typing fills beats 1.3 to 11.4 of the block, whatever the length of the brief
    const rr = rng(11), raw = this.chars.map(c => (.55 + .9 * rr()) + (/[,:.]/.test(c.textContent) ? 3 : 0)), tot = raw.reduce((a, b) => a + b, 0);
    const ta = this.k(1.3), tb = this.k(11.4); let tt = ta;
    this.tc = raw.map(v => { const x = tt; tt += v / tot * (tb - ta); return x; });
    this.kws.forEach(k => { k.t = this.tc[k.i1] + .04; });
    this.enter = el('div', this.panel, 'enter'); this.enter.textContent = '↵';
    this.tE = this.k(13.5); this.tP = this.k(16); this.tPush = this.k(14.6);
    this.kt = this.kws.map(k => k.t);
    this.doodles = o.doodles !== false;
    if (this.doodles) {
      const kt = this.kt;
      this.aa = type(this.g, 'Aa', { size: 150, cls: 'abs' });
      if (kt.length > 1) f.comet({ t0: kt[1], t1: this.k(18), path: (u, s) => { const a = (s - kt[1]) * 4.2 - 1.2; return [1695 + Math.cos(a) * 120, 300 + Math.sin(a) * 52]; }, ease: E.lin, tail: .3, size: 7 });
      this.orb = svg('ellipse', this.s, { cx: 1695, cy: 300, rx: 120, ry: 52, fill: 'none', stroke: rgba(C.paper, .25), 'stroke-width': 1.5, 'stroke-dasharray': '4 7' });
      this.cube = Array.from({ length: 12 }, () => svg('line', this.s, { stroke: C.accent, 'stroke-width': 2.4, 'stroke-linecap': 'round' }));
      this.tun = [0, 1, 2, 3].map(() => svg('polyline', this.s, { fill: 'none', stroke: rgba(C.paper, .6), 'stroke-width': 1.8 }));
      this.cutA = el('div', this.g, 'abs cutsq'); this.cutB = el('div', this.g, 'abs cutsq');
      this.cutA.style.clipPath = 'polygon(0 0,100% 0,0 100%)'; this.cutB.style.clipPath = 'polygon(100% 0,100% 100%,0 100%)';
    }
    f.comet({ t0: this.k(.1), t1: this.k(1.3), path: u => this.oPath(u), ease: E.inOutCubic, tail: .16, size: 9 });
    this.kws.forEach((k, i) => {
      const [l2, tp, w] = this.cpos[k.i1];
      f.burst({ t0: k.t, x: X + 40 + l2 + w, y: Y + 74 + tp + 20, n: 14, speed: 700, life: .35, seed: 140 + i, w: 2.4 });
      f.bump(k.t, .02); f.cue(k.t + .02, 'pop', .35); f.cue(k.t + .02, 'tick', .3);
    });
    this.pulses = this.kws.slice(0, 6).map((kw, i) => {
      const t = this.k(12.5 + i * .5), [l2, tp, w] = this.cpos[kw.i1], [l0] = this.cpos[kw.i0], cx = X + 40 + (l0 + l2 + w) / 2, cy = Y + 74 + tp + 20;
      f.cue(t, 'tick', .45); f.cue(t, 'pop', .3); f.bump(t, .025);
      f.burst({ t0: t, x: cx, y: cy, n: 18, speed: 900, life: .4, seed: 170 + i, w: 2.6 });
      f.ring({ t0: t, dur: .4, cx, cy, r0: 30, r1: 260, w: 6, sy: .45 });
      return t;
    });
    f.ray({ t0: this.tPush, dur: this.t1 - this.tPush, inward: true, color: C.accent, n: 110, r0: 70, r1: 1300, w: 2.2, rate: 1.9, screen: true, seed: 151 });
    [15, 16, 17, 17.5, 18, 18.25, 18.5].forEach(k => f.ring({ t0: this.k(k), dur: .32, r0: 1100, r1: 60, w: 6, color: C.paper, alpha: .5, screen: true }));
    f.ring({ t0: this.tP, dur: .45, r0: 40, r1: 900, w: 14, screen: true });
    f.flash({ t0: this.tP, dur: .18, rise: .01, color: C.accent, peak: .25 }); f.shake(this.tP, 12);
    f.fast(this.t0, this.k(1.5), 8); f.fast(this.k(11.6), this.k(12.6), 8); f.fast(this.tPush, this.t1 + .05, 10);
    f.smear(this.k(17.5), this.t1, 1.8);
    f.light(this.k(18.3), this.t1);
    f.cue(this.k(.1), 'draw', .6); this.tc.forEach((v, i) => { if (this.chars[i].textContent !== ' ' || i % 2) f.cue(v, 'key', .18); });
    f.cue(this.tE, 'pop', .5); f.cue(this.tP, 'click', 1); f.cue(this.t1 - 1.5, 'riser', .9, { end: this.t1 });
  }
  nAt(t) { let lo = 0, hi = this.tc.length; while (lo < hi) { const m = (lo + hi) >> 1; if (this.tc[m] <= t) lo = m + 1; else hi = m; } return lo; }
  caretAt(t) {
    const n = this.nAt(t), i = Math.min(n, this.chars.length - 1), [l, tp, w] = this.cpos[i];
    return [this.X + 40 + l + (n >= this.chars.length ? w : 0), this.Y + 74 + tp + 20];
  }
  cam(t) {
    let ax = 0, ay = 0;
    for (let q = 0; q < 10; q++) { const p = this.caretAt(t - q * .05); ax += p[0]; ay += p[1]; }
    ax /= 10; ay /= 10;
    const fin = tw(t, this.k(1.3) - .35, this.k(1.3) + .45, E.inOutCubic) * (1 - tw(t, this.k(11.6), this.k(12.5), E.inOutCubic));
    let x = (ax - 960) * .78 * fin, y = (ay - 540 + 30) * .9 * fin, s = lerp(1, 1.6, fin) * (1 - .1 * Math.sin(Math.PI * tw(t, this.k(11.6), this.k(13.6), E.lin)));
    const p1 = tw(t, this.tPush, this.tP, E.inOutCubic), p2 = tw(t, this.tP + .05, this.t1, E.inExpo);
    const kx = this.X + 1240 - 28 - 35, ky = this.Y + 330 - 24 - 24;
    x = lerp(x, kx - 960, p1); y = lerp(y, ky - 540, p1);
    s *= lerp(1, 2.6, p1) * Math.exp(Math.log(16) * p2);
    const dr = tw(t, this.t0, this.tPush, E.lin);
    return { x, y, s: s * (1 + .03 * dr * (1 - p1)), r: lerp(-1.4, .9, dr) * (1 - p1) };
  }
  update(t) {
    const o = tw(t, this.k(.1), this.k(1.3), E.inOutCubic);
    this.outline.setAttribute('stroke-dasharray', `${(this.oLen * o).toFixed(1)} 99999`);
    set(this.panel, 'opacity', tw(t, this.k(1), this.k(1.6), E.outCubic).toFixed(3));
    const n = this.nAt(t);
    this.chars.forEach((c, i) => set(c, 'visibility', i < n ? 'visible' : 'hidden'));
    this.count.textContent = `${String(n).padStart(3, '0')} / 2000 ${this.o.unit || 'CHARS'}`;
    this.kws.forEach((k, i) => {
      const h = tw(t, k.t, k.t + .13, E.outCubic), pt = this.pulses[i], pu = pt != null && t >= pt ? punch(t, pt, 10) : 0;
      set(k.host, 'backgroundSize', `${(h * 100).toFixed(1)}% 100%`);
      set(k.host, 'color', h > .5 ? C.ink : C.paper);
      set(k.host, 'display', 'inline-block');
      set(k.host, 'transform', `scale(${(1 + .32 * pu + .1 * (t >= k.t ? punch(t, k.t, 12) : 0)).toFixed(4)})`);
    });
    const typing = n > 0 && n < this.chars.length, ref = this.chars[Math.min(n, this.chars.length - 1)];
    const [rx, ry] = relPos(ref, this.text);
    set(this.caret, 'transform', `translate(${n < this.chars.length ? rx : rx + ref.offsetWidth}px,${ry + 4}px)`);
    set(this.caret, 'opacity', t < this.k(1.2) || t > this.tP ? '0' : (typing || Math.floor(t * 3.4) % 2 === 0 ? '1' : '0'));
    const e1 = tw(t, this.tE, this.tE + .25, E.outBack), pr = tw(t, this.tP, this.tP + .08, E.outCubic), rel = tw(t, this.tP + .08, this.tP + .25, E.outCubic);
    set(this.enter, 'transform', `scale(${(e1 * (1 - pr * .14 + rel * .14) * (1 + .06 * Math.sin(t * 18) * (t > this.tPush && t < this.tP ? 1 : 0))).toFixed(3)})`);
    set(this.enter, 'background', t >= this.tP ? C.accent : 'transparent');
    set(this.enter, 'color', t >= this.tP ? C.ink : C.paper);
    set(this.enter, 'borderColor', t >= this.tPush ? C.accent : rgba(C.paper, .5));
    set(this.enter, 'boxShadow', t > this.tPush ? `0 0 ${(20 + 30 * tw(t, this.tPush, this.tP)).toFixed(0)}px ${rgba(C.accent, .8)}` : 'none');
    if (this.doodles) {
      const kt = this.kt, dm = i => kt[i] == null ? 0 : tw(t, kt[i], kt[i] + .3, E.outBack);
      const d0 = dm(0), ph = (t - (kt[0] || 0)) * 3.1;
      styleType(this.aa, { size: 150, wght: Math.round(500 + 400 * Math.sin(ph)), wdth: Math.round(93 + 32 * Math.sin(ph * .73 + 1)) });
      set(this.aa, 'transform', at(225, 560, `scale(${d0.toFixed(3)})`)); set(this.aa, 'opacity', clamp(d0).toFixed(3));
      this.orb.setAttribute('opacity', clamp(dm(1)).toFixed(3));
      const d2 = dm(2), ca = (t - (kt[2] || 0)) * 1.6, cb2 = (t - (kt[2] || 0)) * 1.05 + .5;
      const V = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x, y, z]))).map(([x, y, z]) => {
        let X = x * Math.cos(ca) - z * Math.sin(ca), Z = x * Math.sin(ca) + z * Math.cos(ca), Y = y * Math.cos(cb2) - Z * Math.sin(cb2); Z = y * Math.sin(cb2) + Z * Math.cos(cb2);
        const s = 62 * d2 * 4 / (4 + Z); return [1700 + X * s, 660 + Y * s];
      });
      [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b], i) => {
        const l = this.cube[i];
        l.setAttribute('x1', V[a][0].toFixed(1)); l.setAttribute('y1', V[a][1].toFixed(1)); l.setAttribute('x2', V[b][0].toFixed(1)); l.setAttribute('y2', V[b][1].toFixed(1));
        l.setAttribute('opacity', clamp(d2).toFixed(3));
      });
      const d3 = clamp(dm(3));
      this.tun.forEach((p, i) => { const q = ((t - (kt[3] || 0)) * .9 + i / 4) % 1, s = .2 + q * 1.1; p.setAttribute('points', ptsAttr(chamferPts(235 - 110 * s, 835 - 62 * s, 220 * s, 124 * s, 10 * s))); p.setAttribute('opacity', (d3 * Math.sin(Math.PI * q)).toFixed(3)); });
      const d4 = clamp(dm(4)), cq = ((t - (kt[4] || 0)) * 1.4) % 1, sep = E.outCubic(clamp((cq - .3) / .35)) * (1 - clamp((cq - .8) / .2));
      set(this.cutA, 'transform', at(228 - 16 * sep, 292 - 16 * sep, `rotate(45deg) scale(${d4.toFixed(3)})`));
      set(this.cutB, 'transform', at(228 + 16 * sep, 292 + 16 * sep, `rotate(45deg) scale(${d4.toFixed(3)})`));
    }
    const dr = tw(t, this.t0, this.k(14.4), E.inOutCubic);
    set(this.g, 'transform', `rotateY(${lerp(-7, 0, dr).toFixed(3)}deg) rotateX(${lerp(8, 0, dr).toFixed(3)}deg)`);
  }
}

// ---------- Stretch: a word on the variable width axis, ghost rows, a live ruler and the CSS that drives it ----------
// { word: 'BOUNCE.', grounds: [[0, 'accent'], [4, 'paper'], [5, 'accent']], code: true }
export class Stretch extends Scene {
  static N = 8;
  build() {
    const f = this.f, r = this.root, o = this.o;
    this.word = o.word;
    this.g = el('div', r, 'abs full');
    this.echo = [-2, -1, 1, 2].map(k => ({ k, e: type(this.g, this.word, { size: 240, color: rgba(C.ink, Math.abs(k) === 1 ? .34 : .17), wdth: 62, stroke: 3, cls: 'abs' }) }));
    this.w = type(this.g, this.word, { size: 240, color: C.ink, wdth: 62, cls: 'abs' });
    styleType(this.w, { size: 240, wdth: 125 }); this.fit = fitTo(this.w.offsetWidth * 1.08, 1780);
    this.rule = el('div', this.g, 'abs rule');
    this.px = el('div', this.g, 'abs mono pxl');
    this.code = el('div', this.g, 'abs mono codel'); vis(this.code, o.code !== false);
    const gr = o.grounds || [[0, 'accent'], [4, 'paper'], [5, 'accent']];
    gr.forEach(([k, g], i) => { const kb = i < gr.length - 1 ? gr[i + 1][0] : 8; f.ground(this.k(k), this.k(kb), cc(g)); if (i) { f.cut(this.k(k)); f.bump(this.k(k), .05); f.shake(this.k(k), 10); f.cue(this.k(k), 'hit', .85); } });
    hitFx(f, this.t0, { hit: 2, ground: 'accent', at: [960, 500] });
    [1, 2, 3, 6, 7].forEach(k => f.bump(this.k(k), .03));
    f.fast(this.t0, this.k(.8), 10); f.fast(this.k(1), this.k(2), 8); f.fast(this.k(2.4), this.k(3.2), 8); f.fast(this.k(4), this.k(5.4), 10); f.fast(this.k(6), this.k(7), 8);
    f.cue(this.t0, 'drop', 1); f.cue(this.k(1), 'stretch', .8); f.cue(this.k(2.5), 'squeeze', .5); f.cue(this.k(4), 'squeeze', .7); f.cue(this.k(5), 'stretch', .8); f.cue(this.k(6), 'tick', .4);
  }
  wdthAt(t) {
    let v = 62;
    if (t >= this.k(1)) v = 62 + 63 * E.outElastic(clamp((t - this.k(1)) / (this.k(3) - this.k(1))));
    if (t >= this.k(4)) v = lerp(125, 66, E.inOutExpo(clamp((t - this.k(4)) / (this.k(4.8) - this.k(4)))));
    if (t >= this.k(5)) v = 66 + 59 * E.outElastic(clamp((t - this.k(5)) / (this.k(7) - this.k(5))));
    return v;
  }
  wghtAt(t) { return 900 - 680 * Math.sin(Math.PI * clamp((t - this.k(2.5)) / (this.k(3.5) - this.k(2.5)))); }
  update(t) {
    const v = this.wdthAt(t), wd = Math.min(125, v), over = Math.max(0, v - 125) / 125;
    const ls = .07 * tw(t, this.k(6), this.k(7), E.outExpo) - .07 * tw(t, this.k(7), this.k(7.6), E.inCubic);
    styleType(this.w, { size: 240, color: C.ink, wdth: wd.toFixed(2), wght: Math.round(this.wghtAt(t)), ls: ls.toFixed(4) });
    const s = tw(t, this.t0, this.t0 + .2, E.outExpo), a = t - this.t0, sc = lerp(1.5, 1, s) * (1 + .025 * a) * this.fit;
    set(this.w, 'transform', at(960 + 26 * Math.sin(a * 2.4), 500 + 12 * Math.sin(a * 3.1), `scale(${(sc * (1 + over)).toFixed(4)},${sc.toFixed(4)}) rotate(${(-2.5 * (t >= this.k(5) ? punch(t, this.k(5), 6) : 0)).toFixed(2)}deg)`));
    this.echo.forEach(({ k, e }) => {
      const vk = Math.min(125, this.wdthAt(t - Math.abs(k) * .08)), dir = k > 0 ? 1 : -1;
      styleType(e, { size: 240, color: rgba(C.ink, Math.abs(k) === 1 ? .34 : .17), wdth: vk.toFixed(2), stroke: 3 });
      set(e, 'transform', at(960 + dir * a * 330, 500 + k * 235 * this.fit, `scale(${sc.toFixed(4)})`));
      set(e, 'opacity', tw(t, this.t0 + .04 * Math.abs(k), this.t0 + .14 + .04 * Math.abs(k)).toFixed(3));
    });
    const width = this.w.offsetWidth * (1 + over) * sc;
    set(this.rule, 'width', width.toFixed(1) + 'px'); set(this.rule, 'transform', at(960, 690));
    this.px.textContent = `${fmt(Math.round(width))} PX`; set(this.px, 'transform', at(960, 722));
    this.code.textContent = `font-variation-settings: "wdth" ${Math.round(wd)}, "wght" ${Math.round(this.wghtAt(t))};`;
    set(this.code, 'transform', at(960, 815));
  }
}

// ---------- Fly: the camera flies through extruded words in depth, then orbits the last one ----------
// { words: [['DODGE', 'paper'], ['THE', 'accent'], ['BIG', 'paper'], ['FEET.', 'accent']] }
export class Fly extends Scene {
  static N = 11;
  constructor(f, k0, k1, o) { super(f, k0, k1, o); this.noGrid = true; }
  camZ(t) { return lerp(this.cz0, this.cz1, this.ease(tw(t, this.t0, this.k(8), E.lin))); }
  build() {
    const f = this.f, r = this.root, o = this.o;
    r.classList.add('persp', 'fly');
    this.world = el('div', r, 'abs p3d', { left: '960px', top: '540px' });
    const ws = o.words, n = ws.length, gap = 6100 / Math.max(1, n - 1), off = [[0, 0], [160, -30], [-120, 30], [0, 0], [140, 20], [-140, -20]];
    this.items = ws.map(([s, c], i) => {
      const col = cc(c) || C.paper, isA = col === C.accent, z = -i * gap, [dx, dy] = i === n - 1 ? [0, 0] : off[i % off.length];
      const w = el('div', this.world, 'abs p3d');
      const x = extrude(w, s, { size: 250, wdth: 104, layers: 36, depth: 90, face: col, side0: isA ? C.side0 : C.sideP, side1: C.side1, glow: isA ? 20 : 0 });
      x.classList.add('abs');
      const fw = x.face.offsetWidth, fh = x.face.offsetHeight, fit = fitTo(fw, 1500);
      x.style.transform = `translate(${-fw / 2}px,${-fh / 2}px)`;
      w.fit = fit;
      const pw = el('div', this.world, 'abs p3d');
      const ps = svg('svg', pw, { width: 1560, height: 760, viewBox: '0 0 1560 760', class: 'abs', style: 'left:-780px;top:-380px;overflow:visible' });
      svg('polyline', ps, { points: ptsAttr(chamferPts(6, 6, 1548, 748, 40)), fill: 'none', stroke: rgba(C.accent, .25), 'stroke-width': 12 });
      svg('polyline', ps, { points: ptsAttr(chamferPts(6, 6, 1548, 748, 40)), fill: 'none', stroke: C.accent, 'stroke-width': 3.5 });
      svg('polyline', ps, { points: ptsAttr(chamferPts(330, 220, 900, 320, 24)), fill: 'none', stroke: rgba(C.paper, .18), 'stroke-width': 2 });
      return { w, pw, z, dx, dy, rot: [-3, 4, -5, 2, -4, 3][i % 6] };
    });
    this.cz0 = -700; this.cz1 = (n - 1) * gap - 140;
    this.ease = u => .4 * u + .6 * E.inOutCubic(u);
    this.passes = this.items.slice(0, -1).map(it => { let k = 0; while (k < 8 && this.camZ(this.k(k)) + it.z < 950) k += .05; return k; });
    const rr = rng(77);
    this.dust = Array.from({ length: 460 }, () => { const a = rr() * Math.PI * 2, rad = 380 + rr() * 1300; return [Math.cos(a) * rad, Math.sin(a) * rad * .7, -(n - 1) * gap - 1300 + rr() * ((n - 1) * gap + 2100), .6 + rr()]; });
    f.paint((x, t) => {
      if (t < this.t0 || t >= this.t1) return;
      const c = this.view(t), c2 = this.view(t - .03);
      x.save(); x.globalCompositeOperation = 'lighter'; x.lineCap = 'round';
      for (const [dx, dy, dz, sz] of this.dust) {
        const p = this.project(dx, dy, dz, c), q = this.project(dx, dy, dz, c2);
        if (!p || !q) continue;
        const al = clamp(p[2] * .55) * (1 - clamp((t - this.k(10.6)) / .3));
        x.strokeStyle = rgba(sz > 1.3 ? C.accent : C.paper, al); x.lineWidth = Math.min(8, 2 * sz * p[2]);
        x.beginPath(); x.moveTo(q[0], q[1]); x.lineTo(p[0], p[1]); x.stroke();
      }
      x.restore();
    }, true);
    f.fast(this.t0, this.k(8.5), 10); f.fast(this.k(8.5), this.t1, 8);
    f.burst({ t0: this.k(8), x: 960, y: 560, n: 30, speed: 1200, life: .5, seed: 91 });
    f.shake(this.k(8), 14); f.bump(this.k(8), .04);
    this.passes.forEach((k, i) => { f.cue(this.k(k) - .14, 'whoosh_big', .65 + i * .1); f.slash({ t0: this.k(k) - .02, x1: -100, y1: 620 - i * 60, x2: 2020, y2: 470 + i * 60, dur: .09, hold: .06, fade: .18, w: 4 }); });
    f.cue(this.k(8), 'impact', .9); f.cue(this.k(10.4), 'whoosh', .5);
  }
  view(t) {
    const u = tw(t, this.t0, this.k(8), E.lin), e = this.ease(u), orb = E.inOutCubic(tw(t, this.k(8), this.k(10.8), E.lin));
    return { cz: this.camZ(t), roll: lerp(2, -5, e) + 8 * Math.sin(u * Math.PI * 2.2) * (1 - orb), yaw: lerp(7, -3, e) + 50 * orb };
  }
  project(x, y, z, c) {
    const rel = z + c.cz, d = 1100 - rel;
    if (d < 60) return null;
    const k = 1100 / d, a = c.roll * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    return [960 + (x * ca - y * sa) * k, 540 + (x * sa + y * ca) * k, k];
  }
  update(t) {
    const c = this.view(t), land = t - this.k(8), zp = -140 * clamp(land / .2);
    set(this.world, 'transform', `rotateZ(${c.roll.toFixed(3)}deg) translateZ(${zp.toFixed(1)}px) rotateY(${c.yaw.toFixed(3)}deg) translateZ(${(c.cz - zp).toFixed(1)}px)`);
    for (const it of this.items) {
      const rel = it.z + c.cz, near = 1 - clamp((rel - 650) / 380), far = clamp(1 - (-rel - 900) / 1300);
      vis(it.w, rel < 1080); vis(it.pw, rel - 260 < 1080);
      set(it.w, 'transform', `translate3d(${it.dx}px,${it.dy}px,${it.z}px) scale(${it.w.fit})`);
      set(it.w, 'opacity', Math.min(near, far).toFixed(3));
      const pn = 1 - clamp((rel - 260 - 600) / 420);
      set(it.pw, 'transform', `translate3d(${it.dx * .6}px,${it.dy * .6}px,${it.z - 260}px) rotateZ(${it.rot}deg)`);
      set(it.pw, 'opacity', Math.min(pn, .15 + .85 * clamp(1 - (-(rel - 260) - 900) / 1600)).toFixed(3));
    }
    set(this.root, 'opacity', (1 - tw(t, this.k(10.7), this.t1, E.inExpo)).toFixed(3));
  }
  cam(t) { return { s: 1 + .5 * tw(t, this.k(10.5), this.t1, E.inExpo) }; }
}

// ---------- Notes: notes typed in a panel, the preview answers each one (camera moves between them) ----------
// { preview: 'BOUNCE.', notes: [['make it warmer', 'recolor'], ['shorter opening', 'trim'], ['louder on the hits', 'punch']],
//   segments: [['HOOK', 180], ['TITLE', 160], ...] (widths sum to 1000), tag: 'PREVIEW  ·  00:24', panel: 'NOTES', file: 'spec.js' }
export class Notes extends Scene {
  static N = 16;
  build() {
    const f = this.f, r = this.root, o = this.o;
    r.classList.add('persp');
    this.g = el('div', r, 'abs full p3d');
    this.pv = el('div', this.g, 'abs pvwin', { left: '130px', top: '250px', width: '1000px', height: '562px' });
    this.pvIn = el('div', this.pv, 'abs full');
    this.burstSvg = svg('svg', this.pvIn, { class: 'abs', width: 1000, height: 562, viewBox: '0 0 1000 562' });
    this.burstPoly = svg('polygon', this.burstSvg, { fill: C.paper });
    this.pvW = type(this.pvIn, o.preview, { size: 150, color: C.ink, wdth: 118, cls: 'abs' });
    this.pvFit = fitTo(this.pvW.offsetWidth, 900);
    this.scan = el('div', this.pv, 'abs scanl');
    el('div', this.pv, 'abs mono pvtag').textContent = o.tag || 'PREVIEW';
    this.strip = el('div', this.g, 'abs strip', { left: '130px', top: '836px', width: '1000px' });
    const segs = o.segments || [['OPEN', 220], ['HOOK', 190], ['BUILD', 120], ['DROP', 150], ['RUN', 90], ['END', 230]];
    let x = 0;
    this.segs = segs.map(([nm, w], i) => { const s = el('div', this.strip, 'seg' + (i === 0 ? ' hot' : ''), { left: x + 'px', width: (w - 6) + 'px' }); s.textContent = nm; s.w0 = w; x += w; return s; });
    this.ph = el('div', this.strip, 'sph');
    this.np = el('div', this.g, 'abs npanel', { left: '1190px', top: '250px', width: '600px', height: '650px' });
    const hd = el('div', this.np, 'nhead'); el('div', hd, 'mono').textContent = o.panel || 'NOTES'; el('div', hd, 'mono dimt').textContent = o.file || '';
    this.list = el('div', this.np, 'nlist');
    this.inp = el('div', this.np, 'ninput mono');
    this.inTxt = el('span', this.inp); this.inCar = el('span', this.inp, 'ncaret');
    this.send = el('div', this.np, 'nsend'); this.send.textContent = '↑';
    this.bgw = type(r, ' ', { size: 300, wdth: 115, stroke: 3.5, color: rgba(C.paper, .24), cls: 'abs' });
    const slots = [[.7, 2.4], [4.5, 7.2], [9.6, 11.2]];
    this.notes = (o.notes || []).slice(0, 3).map(([s, fx], i) => {
      const bub = el('div', this.list, 'bub'); el('div', bub, 'btxt').textContent = s;
      const rep = el('div', bub, 'mono rep'); rep.textContent = o.done || '✓ re-rendered';
      return { s, fx, ta: this.k(slots[i][0]), tb: this.k(slots[i][1]), bub, rep };
    });
    const shotFor = fx => fx === 'trim' ? 'S' : fx === 'punch' ? 'F' : 'P';
    this.SH = { W: [960, 575, 1], I: [1420, 720, 1.42], P: [630, 531, 1.42], S: [630, 858, 1.75], F: [630, 531, 1.87] };
    this.shots = [[this.t0, 'W'], [this.k(.5), 'I']];
    this.notes.forEach((n, i) => { this.shots.push([n.tb + .1, shotFor(n.fx)]); if (i < this.notes.length - 1) this.shots.push([this.notes[i + 1].ta - B(.2), 'I']); });
    this.shots.push([this.k(15.4), 'W']);
    this.shots.slice(1).forEach(([k]) => { f.smear(k, k + .24, 2); f.fast(k, k + .26, 10); });
    this.notes.forEach(n => { const L = n.s.length; for (let i = 0; i < L; i++) f.cue(n.ta + (n.tb - .15 - n.ta) * (i + .5) / L, 'key', .2); f.cue(n.tb, 'send', 1.4); f.cue(n.tb, 'pop', .4); f.cue(n.tb + .5, 'tick', .4); });
    this.shots.slice(1, -1).forEach(([k]) => f.cue(k - .1, 'whoosh', .4));
    const tr = this.notes.find(n => n.fx === 'trim');
    if (tr) { f.slash({ t0: tr.tb + .3, x1: 240, y1: 805, x2: 240, y2: 910, dur: .08, hold: .1, fade: .2, w: 5 }); f.cue(tr.tb + .3, 'slash', .85); }
    const pn = this.notes.find(n => n.fx === 'punch');
    this.punches = pn ? [0, 1, 2, 3].map(i => pn.tb + B(.8 + i)).filter(x => x < this.k(15.4)) : [];
    this.punches.forEach((k, i) => { f.shake(k, 12); f.bump(k, .04); f.cue(k, i === 3 ? 'impact_big' : 'impact', i === 3 ? .9 : .7); f.fast(k, k + .2, 8); });
    if (this.punches[2]) f.invert(this.punches[2] + 1 / 60, 2 / 60);
    f.fast(this.t0, this.k(.6), 8); f.fast(this.k(15.4), this.t1, 8); f.cue(this.t0, 'whoosh', .5);
  }
  cam(t) {
    let i = 0;
    while (i < this.shots.length - 1 && t >= this.shots[i + 1][0]) i++;
    const cur = this.SH[this.shots[i][1]], prev = i ? this.SH[this.shots[i - 1][1]] : cur;
    const st = t - this.shots[i][0], u = E.inOutCubic(clamp(st / .24)), drift = 1 + .06 * st;
    return { x: lerp(prev[0], cur[0], u) - 960 + 16 * Math.sin(t * 2.1) + 45 * st, y: lerp(prev[1], cur[1], u) - 540 + 10 * Math.sin(t * 1.7 + 1), s: lerp(prev[2], cur[2], u) * drift, r: .8 * Math.sin(t * 1.3) };
  }
  update(t) {
    const e = tw(t, this.t0, this.t0 + .45, E.outExpo), out = tw(t, this.k(15.4), this.t1, E.inExpo);
    set(this.g, 'transform', `translateZ(${lerp(-700, 0, e) - 500 * out}px) rotateY(${lerp(24, 0, e).toFixed(2)}deg) rotateX(${(50 * out).toFixed(2)}deg)`);
    set(this.g, 'opacity', (clamp(e * 2) * (1 - out)).toFixed(3));
    const rc = this.notes.find(n => n.fx === 'recolor'), tr = this.notes.find(n => n.fx === 'trim');
    const h = rc ? tw(t, rc.tb + .15, rc.tb + .55, E.inOutCubic) : 0;
    set(this.pvIn, 'background', mixc(C.accent, C.hot, h));
    let pk = 0, rot = 0;
    this.punches.forEach((k, i) => { if (t >= k) { pk = punch(t, k, 7); rot = (i % 2 ? 1 : -1) * 4; } });
    set(this.pvW, 'transform', at(500, 281, `scale(${((1 + .3 * pk) * this.pvFit).toFixed(4)}) rotate(${(rot * pk).toFixed(2)}deg)`));
    const bs = this.punches.length ? tw(t, this.punches[0], this.punches[0] + .2, E.outBack) : 0, R = 330 * bs * (1 + .12 * pk);
    if (bs > 0) {
      const rr = rng(5), a0 = (t - this.punches[0]) * .8, N = 32;
      this.burstPoly.setAttribute('points', Array.from({ length: N }, (_, j) => { const v = rr(), rad = j % 2 ? R * (.55 - .12 * v) : R * (1 + .15 * v), a = a0 + j / N * Math.PI * 2; return `${(500 + Math.cos(a) * rad).toFixed(1)},${(281 + Math.sin(a) * rad * .78).toFixed(1)}`; }).join(' '));
    }
    vis(this.burstSvg, bs > 0);
    let sw = -1;
    for (const n of this.notes) { const q = (t - n.tb - .1) / .5; if (q >= 0 && q <= 1) sw = q; }
    vis(this.scan, sw >= 0);
    if (sw >= 0) set(this.scan, 'transform', `translateX(${(sw * 1000).toFixed(1)}px)`);
    const c = tr ? tw(t, tr.tb + .35, tr.tb + .65, E.outExpo) : 0;
    let x = 0;
    this.segs.forEach((s, i) => { const w = i === 0 ? lerp(s.w0, s.w0 / 2, c) : s.w0; set(s, 'left', x.toFixed(1) + 'px'); set(s, 'width', (w - 6).toFixed(1) + 'px'); x += w; });
    set(this.ph, 'left', (((t - this.t0) * 160) % x).toFixed(1) + 'px');
    let typed = '', caret = false, bt = '', b0 = 0;
    for (const n of this.notes) {
      if (t >= n.ta && t < n.tb) { typed = n.s.slice(0, Math.ceil(tw(t, n.ta, n.tb - .15, E.lin) * n.s.length)); caret = true; }
      if (t >= n.ta - .05 && t < n.tb + 1.4) { bt = n.s.toUpperCase(); b0 = n.ta; }
      const b = tw(t, n.tb, n.tb + .28, E.outBack), rp = tw(t, n.tb + .5, n.tb + .7, E.outCubic);
      vis(n.bub, t >= n.tb);
      set(n.bub, 'transform', `translateY(${(30 * (1 - b)).toFixed(1)}px) scale(${lerp(.9, 1, b).toFixed(3)})`);
      set(n.bub, 'opacity', clamp(b).toFixed(3)); set(n.rep, 'opacity', rp.toFixed(3));
    }
    set(this.send, 'transform', `scale(${this.notes.some(n => t >= n.tb && t < n.tb + .12) ? .86 : 1})`);
    this.inTxt.textContent = typed || ' ';
    set(this.inCar, 'opacity', caret || Math.floor(t * 3.4) % 2 ? '1' : '0');
    if (this.bgw.textContent !== (bt || ' ')) this.bgw.textContent = bt || ' ';
    set(this.bgw, 'transform', `translate(${(1500 - (t - b0) * 520).toFixed(1)}px, 360px)`);
  }
}

// ---------- Counters: the source as a plane the camera flies over, giant numbers on slot reels ----------
// { counters: [['14', 'BLOCKS'], ['{lines}', 'LINES OF SOURCE'], ['{frames}', 'FRAMES RENDERED']], title: 'tour / spec.js' }
// '{lines}' and '{frames}' are filled from the film itself.
export class Counters extends Scene {
  static N = 11;
  build() {
    const f = this.f, r = this.root, o = this.o;
    r.classList.add('persp');
    this.plane = el('div', r, 'abs codewin', { left: '180px', top: '-560px', width: '1560px', height: '1740px', transformOrigin: '50% 100%' });
    const hd = el('div', this.plane, 'phead'); for (let i = 0; i < 3; i++) el('span', hd, 'pdot');
    el('span', hd, 'mono ptitle').textContent = o.title || 'film / spec.js';
    this.body = el('div', this.plane, 'cbody');
    this.inner = el('div', this.body, 'cinner big');
    this.hlRow = el('div', this.body, 'abs hlrow');
    const lines = (o.source || f.src.code || '').split('\n');
    this.nl = lines.length;
    this.html = lines.map((l, i) => `<span class="ln">${i + 1}</span>${hl(l) || ' '}`);
    this.LH = 30;
    this.vrows = Array.from({ length: 62 }, () => { const d = el('div', this.inner, 'cl abs'); d.style.width = '100%'; return d; });
    const fill = v => fillVars(f, v);
    const cs = o.counters || [], step = 3;
    this.cnt = cs.map(([v, l], i) => {
      const g = el('div', r, 'abs full'), k = 2 + i * step, k1 = i < cs.length - 1 ? 2 + (i + 1) * step : 11;
      const num = reel(g, fill(v), { size: 360, color: C.accent, glow: 22 });
      const lab = type(g, l, { size: 120, wdth: 122, cls: 'abs' });
      num.fit = fitTo(num.offsetWidth, 1700); lab.fit = fitTo(lab.offsetWidth, 1700);
      const t0 = this.k(k);
      f.cue(t0, 'impact', .8); f.cue(t0 + .05, 'tick_run', .3, { dur: .7 }); f.fast(t0, t0 + 1, 10); f.bump(t0, .05); f.shake(t0, 12);
      f.flash({ t0, dur: .2, rise: .01, color: C.accent, peak: .18 });
      f.burst({ t0, x: 960, y: 450, n: 30, speed: 1300, life: .5, seed: 160 + i });
      return { g, num, lab, t: t0, t1: this.k(k1) };
    });
    f.fast(this.t0, this.k(2), 10);
    f.cue(this.t0, 'scroll', .55, { dur: this.t1 - this.t0 });
  }
  update(t) {
    const e = tw(t, this.t0, this.t0 + .5, E.outExpo), dim = this.cnt.some(c => t >= c.t && t < c.t1) ? .32 : 1;
    set(this.plane, 'transform', `translateY(${(500 * (1 - e)).toFixed(1)}px) rotateX(${lerp(70, 56, e).toFixed(2)}deg) rotateZ(${(-4 + 3 * Math.sin((t - this.t0) * .9)).toFixed(2)}deg)`);
    set(this.plane, 'opacity', (e * dim).toFixed(3));
    const y = Math.pow(Math.max(0, t - this.t0), 1.15) * 3900, first = Math.floor(y / this.LH);
    this.vrows.forEach((d, i) => {
      const li = (first + i) % this.nl;
      if (d.__li !== li) { d.innerHTML = this.html[li]; d.__li = li; }
      set(d, 'transform', `translateY(${((first + i) * this.LH - y).toFixed(1)}px)`);
    });
    set(this.hlRow, 'transform', `translateY(${(1080 - (y % this.LH)).toFixed(1)}px)`);
    this.cnt.forEach(c => {
      const on = t >= c.t - .01 && t < c.t1;
      vis(c.g, on);
      if (!on) return;
      const p = tw(t, c.t, c.t + .2, E.outExpo), x = tw(t, c.t1 - .12, c.t1, E.inCubic), a = t - c.t;
      set(c.num, 'transform', at(960, 450 - 300 * x, `scale(${(lerp(1.5, 1, p) * (1 + .05 * a) * c.num.fit).toFixed(4)})`));
      set(c.lab, 'transform', at(960 + 300 * (1 - tw(t, c.t + .08, c.t + .35, E.outExpo)), 720 + 300 * x, `scale(${c.lab.fit})`));
      set(c.lab, 'opacity', tw(t, c.t + .08, c.t + .2).toFixed(3));
      set(c.g, 'opacity', (1 - x).toFixed(3));
      spinReel(c.num, t, c.t, .75);
    });
  }
}
const KW = new Set('const let var class extends return if else for while new this function import export from of await async super static'.split(' '));
export function hl(line) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const re = /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b([A-Za-z_]\w*)\b|\b(\d+(?:\.\d+)?)\b/g;
  let out = '', last = 0, m;
  while ((m = re.exec(line))) {
    out += esc(line.slice(last, m.index));
    if (m[1]) out += `<i class="cm">${esc(m[1])}</i>`;
    else if (m[2]) out += `<i class="st">${esc(m[2])}</i>`;
    else if (m[3]) out += KW.has(m[3]) ? `<i class="kw">${m[3]}</i>` : (/^[A-Z]/.test(m[3]) ? `<i class="ty">${m[3]}</i>` : m[3]);
    else if (m[4]) out += `<i class="nu">${m[4]}</i>`;
    last = re.lastIndex;
  }
  return out + esc(line.slice(last));
}

// ---------- Progress: a two-line claim renders itself, frames of the film ride a conveyor past a render head ----------
// { lines: ['DRAWN', 'FRAME BY FRAME.'], cards: [['FOURTEEN', 'bg', 'paper'], ['BLOCKS', 'accent', 'ink'], ...], label: 'RENDER  4K · 60 FPS', doneLabel: 'RENDER  ✓ DONE', doneRight: 'FRAME BY FRAME', ground: 'paper' }
export class Progress extends Scene {
  static N = 9;
  build() {
    const f = this.f, r = this.root, o = this.o, [l1, l2] = o.lines;
    this.R = el('div', r, 'abs full');
    this.r1o = type(this.R, l1, { size: 170, color: rgba(C.ink, .45), stroke: 2.5, cls: 'abs' });
    this.r1 = type(this.R, l1, { size: 170, color: C.ink, cls: 'abs' });
    this.r2 = type(this.R, l2, { size: 170, color: C.accent, cls: 'abs' });
    this.f1 = fitTo(this.r1.offsetWidth, 1700); this.f2 = fitTo(this.r2.offsetWidth, 1700);
    this.r1w = this.r1.offsetWidth * this.f1;
    this.r1s = el('div', this.R, 'abs rhead');
    this.bar = el('div', this.R, 'abs rbar lt'); this.barFill = el('div', this.bar, 'rfill');
    this.big = el('div', this.R, 'abs mono bigc');
    this.barL = el('div', this.R, 'abs mono rlab lt'); this.barR = el('div', this.R, 'abs mono rlab lt');
    this.belt = el('div', this.R, 'abs full');
    this.head = el('div', this.R, 'abs rhead');
    const FR = o.cards || [['01', 'bg', 'paper'], ['02', 'accent', 'ink'], ['03', 'paper', 'ink'], ['04', 'bg', 'accent'], ['05', 'accent', 'ink']];
    this.cards = FR.map(([wd, bg, col], i) => {
      const c = el('div', this.belt, 'abs fcard');
      const tx = type(c, wd, { size: 50, wdth: 110, color: cc(col), cls: 'abs' });
      tx.style.left = '50%'; tx.style.top = '50%'; tx.style.transform = `translate(-50%,-50%) scale(${fitTo(tx.offsetWidth, 210)})`;
      return { c, tx, bg: cc(bg), col: cc(col), x0: i * 262 };
    });
    this.beltW = Math.max(FR.length, 8) * 262;
    this.frames = Math.round(DUR * FPS);
    this.tR1 = this.t0 + .02; this.tR2 = this.k(1.7);
    f.ground(this.t0, this.t1, cc(o.ground || 'paper'));
    f.burst({ t0: this.tR2, x: 1200, y: 520, n: 30, speed: 1300, life: .5, seed: 111, color: C.ink, blend: 'source-over' });
    f.shake(this.tR1, 10); f.shake(this.tR2, 16); f.bump(this.tR1, .035); f.bump(this.tR2, .05); f.bump(this.k(7), .05);
    f.fast(this.tR1 - .03, this.tR2 + .3, 10); f.fast(this.k(2), this.k(7), 6);
    f.cue(this.tR1, 'impact', .8); f.cue(this.tR2, 'impact_big', 1);
    f.cue(this.k(2), 'tick_run', .35, { dur: this.k(7) - this.k(2) }); f.cue(this.k(7), 'ding', .7);
  }
  cam(t) { const u = tw(t, this.t0, this.t1, E.lin); return { s: 1 + .1 * E.inOutCubic(u), r: lerp(-1.2, 1.2, u), y: lerp(-10, 20, u) }; }
  update(t) {
    const o = this.o, a1 = tw(t, this.tR1, this.tR1 + .2, E.outExpo), a2 = tw(t, this.tR2, this.tR2 + .2, E.outExpo);
    vis(this.r2, t >= this.tR2 - .01);
    const r1t = at(960, 262 - 300 * (1 - a1), `scale(${this.f1})`), wp = tw(t, this.tR1 + .1, this.tR2 - .05, E.inOutCubic);
    set(this.r1, 'transform', r1t); set(this.r1o, 'transform', r1t);
    set(this.r1, 'clipPath', `inset(-20% ${((1 - wp) * 100).toFixed(2)}% -20% 0)`);
    vis(this.r1s, wp > 0 && wp < 1);
    set(this.r1s, 'transform', `translate(${(960 - this.r1w / 2 + this.r1w * wp - 2).toFixed(1)}px, ${(262 - 300 * (1 - a1) - 92).toFixed(1)}px)`);
    set(this.r2, 'transform', at(960 + 800 * (1 - a2), 432, `scaleX(${lerp(1.45, 1, a2).toFixed(3)}) scale(${this.f2})`));
    set(this.r2, 'opacity', clamp(a2 * 2).toFixed(3));
    const b = tw(t, this.k(1.9), this.k(2.3), E.outCubic), prog = tw(t, this.k(2), this.k(7), E.inOutCubic), done = t >= this.k(7);
    [this.bar, this.barL, this.barR, this.big, this.belt, this.head].forEach(n => set(n, 'opacity', b.toFixed(3)));
    set(this.bar, 'transform', at(960, 768));
    const off = Math.max(0, t - this.k(1.9)) * 820;
    this.cards.forEach(cd => {
      const x = ((cd.x0 - off - 200) % this.beltW + this.beltW) % this.beltW - 300, ren = x + 120 < 960 || done;
      set(cd.c, 'transform', `translate(${x.toFixed(1)}px, 552px)`);
      if (cd.ren !== ren) { cd.ren = ren; set(cd.c, 'background', ren ? cd.bg : 'transparent'); set(cd.c, 'borderStyle', ren ? 'solid' : 'dashed'); styleType(cd.tx, { size: 50, wdth: 110, color: ren ? cd.col : rgba(C.ink, .35), stroke: ren ? 0 : 1.5 }); }
    });
    set(this.head, 'transform', 'translate(958px, 527px)');
    set(this.barFill, 'width', (prog * 100).toFixed(2) + '%');
    this.barL.textContent = done ? (o.doneLabel || 'RENDER  ✓ DONE') : (o.label || 'RENDER  4K · 60 FPS');
    this.barR.textContent = done ? (o.doneRight || '') : `${Math.round(prog * 100)}%`;
    set(this.barL, 'transform', 'translate(210px, 798px)'); set(this.barR, 'transform', `translate(${1710 - this.barR.offsetWidth}px, 798px)`);
    this.big.textContent = `${String(Math.round(prog * this.frames)).padStart(4, '0')} / ${this.frames}`;
    set(this.big, 'transform', at(960, 905, `scale(${(1 + .12 * (done ? punch(t, this.k(7), 8) : 0)).toFixed(4)})`));
    set(this.big, 'color', done ? C.accent : C.ink);
  }
}

// ---------- Chain: A to B to C as one long world; the camera rides the comet from node to node, then pulls back ----------
// { nodes: [['BRIEF', 'brief.md'], ['BEATS', '{seconds} s on the grid'], ['FILM.', '4K · 60 FPS', 'accent']] }
export class Chain extends Scene {
  static N = 12;
  build() {
    const f = this.f, r = this.root, o = this.o;
    this.g = el('div', r, 'abs full');
    this.nodes = o.nodes.slice(0, 3).map(([s, tag, c], i) => {
      const col = cc(c) || (i === o.nodes.length - 1 ? C.accent : C.paper);
      const w = type(this.g, s, { size: 300, wdth: 110, color: col, glow: col === C.accent ? 26 : 0, cls: 'abs' });
      const tg = el('div', this.g, 'abs mono ctag big'); tg.textContent = fillVars(f, tag || '');
      const fit = fitTo(w.offsetWidth, 1500);
      return { w, tg, x: 960 + i * 2000, y: 520, ww: w.offsetWidth * fit, fit };
    });
    const [a, b, c] = this.nodes;
    const s1 = arcLen(u => qb([-200, 160], [300, 140], [a.x - a.ww / 2 - 40, a.y], u));
    const s2 = arcLen(u => qb([a.x + a.ww / 2 + 40, a.y], [1960, 120], [b.x - b.ww / 2 - 40, b.y], u));
    const s3 = arcLen(u => qb([b.x + b.ww / 2 + 40, b.y], [3960, 940], [c.x - c.ww / 2 - 40, c.y], u));
    this.s2 = s2; this.s3 = s3;
    this.tn = [this.k(.6), this.k(4), this.k(7)];
    this.c2 = [this.k(2.6), this.tn[1]]; this.c3 = [this.k(5.6), this.tn[2]];
    f.comet({ t0: this.t0 - .05, t1: this.tn[0], path: s1, ease: E.inCubic, tail: .18, size: 10 });
    f.comet({ t0: this.c2[0], t1: this.c2[1], path: s2, ease: E.inOutCubic, tail: .2, size: 10, trail: true, trailEnd: this.t1 });
    f.comet({ t0: this.c3[0], t1: this.c3[1], path: s3, ease: E.inOutCubic, tail: .2, size: 10, trail: true, trailEnd: this.t1 });
    f.burst({ t0: this.tn[2], x: c.x, y: c.y, n: 40, speed: 1500, life: .55, seed: 121 });
    this.nodes.forEach((nd, i) => f.ring({ t0: this.tn[i], dur: i === 2 ? .5 : .45, cx: nd.x, cy: nd.y, r0: 40, r1: i === 2 ? 900 : 700, w: i === 2 ? 16 : 12 }));
    f.flash({ t0: this.tn[2], dur: .25, rise: .015, color: C.accent, peak: .2 });
    f.bokeh({ t0: this.t0, t1: this.t1, n: 120, x0: -600, x1: 5600, y0: -300, y1: 1400, color: C.accent, size: 2.4, vx: 30, vy: -20, alpha: .45, seed: 122 });
    this.tn.forEach((k, i) => { f.cue(k, i === 2 ? 'impact_big' : 'impact', i === 2 ? 1 : .75); f.fast(k - .03, k + .25, 10); f.shake(k, i === 2 ? 18 : 10); f.bump(k, i === 2 ? .06 : .035); });
    f.smear(this.c2[0] + .1, this.c2[1] - .2, 2); f.smear(this.c3[0] + .1, this.c3[1] - .2, 2); f.fast(this.c2[0], this.c2[1], 10); f.fast(this.c3[0], this.c3[1], 10); f.fast(this.k(8), this.k(11.5), 6);
    f.cue(this.t0, 'whoosh', .5); f.cue(this.c2[0] + .2, 'whoosh_big', .6); f.cue(this.c3[0] + .2, 'whoosh_big', .7);
  }
  cam(t) {
    const follow = (seg, path) => path(E.inOutCubic(clamp((t - seg[0]) / (seg[1] - seg[0]))));
    const st = tw(t, this.t0, this.c2[0] + .1, E.inOutCubic);
    let x = lerp(-90, 60, st), y = 0, s = 1 + .14 * st, r = lerp(-1.5, .5, st);
    if (t >= this.c2[0]) { const [hx, hy] = follow(this.c2, this.s2), m = tw(t, this.c2[0], this.c2[0] + .25, E.inOutCubic); s = lerp(s, 1, m); r = lerp(r, 0, m); x = lerp(x, hx - 960 + (2000 - (hx - 960)) * tw(t, this.c2[1] - .2, this.c2[1], E.outCubic), m); y = (hy - 520) * .5 * m * (1 - tw(t, this.c2[1] - .2, this.c2[1])); }
    if (t >= this.c2[1]) { const q = tw(t, this.c2[1], this.c3[0] + .25, E.inOutCubic); x = 2000 + lerp(-50, 70, q); y = 0; s = 1 + .12 * q; r = lerp(0, 1, q); }
    if (t >= this.c3[0]) { const [hx, hy] = follow(this.c3, this.s3), m = tw(t, this.c3[0], this.c3[0] + .25, E.inOutCubic); s = lerp(s, 1, m); r = lerp(r, 0, m); x = lerp(x, hx - 960 + (4000 - (hx - 960)) * tw(t, this.c3[1] - .2, this.c3[1], E.outCubic), m); y = (hy - 520) * .5 * m * (1 - tw(t, this.c3[1] - .2, this.c3[1])); }
    if (t >= this.c3[1]) { const p = tw(t, this.k(8), this.k(11.4), E.inOutCubic); x = lerp(4000, 2000, p); y = lerp(0, -20, p); s = lerp(1.04, .34, p); r = lerp(0, -2.5, p); }
    return { x, y, s, r };
  }
  update(t) {
    this.nodes.forEach((n, i) => {
      const k = this.tn[i], u = tw(t, k, k + .22, E.outExpo);
      vis(n.w, t >= k - .01);
      set(n.w, 'transform', at(n.x + 500 * (1 - u) * (i === 2 ? 1 : 0), n.y, (i === 2 ? `scaleX(${lerp(1.45, 1, u).toFixed(3)})` : `scale(${lerp(1.35, 1, u).toFixed(3)})`) + ` scale(${n.fit})`));
      set(n.w, 'opacity', clamp(u * 2).toFixed(3));
      if (i < 2) set(n.w, 'clipPath', `inset(-30% ${((1 - tw(t, k - .02, k + .2, E.outCubic)) * 100).toFixed(1)}% -30% 0)`);
      const g = tw(t, k + .25, k + .5, E.outCubic);
      set(n.tg, 'transform', at(n.x, n.y + 200 + 12 * (1 - g))); set(n.tg, 'opacity', g.toFixed(3));
    });
  }
}

// ---------- Rewind: the film so far plays backwards inside a tilting playback window ----------
// { from: seconds to rewind from (default: this block's start) }
export class Rewind extends Scene {
  static noNest = true;
  static N = 8;
  build() {
    const f = this.f, r = this.root;
    r.classList.add('persp');
    this.w3 = el('div', r, 'abs full p3d');
    this.win = el('div', this.w3, 'abs pbwin', { left: '335px', top: '205px', width: '1250px', height: '703px' });
    this.inner = el('div', this.win, 'abs', { width: '1920px', height: '1080px', transformOrigin: '0 0', transform: `scale(${1250 / 1920})` });
    this.nested = new f.constructor(this.inner, { nested: true, dsf: 1, src: f.src, logo: f.logo, spec: f.spec });
    this.lines = [0, 1, 2].map(() => el('div', this.win, 'abs track'));
    this.hd = el('div', this.w3, 'abs mono pbhead');
    el('span', this.hd).textContent = this.o.label || 'PLAYBACK';
    this.spd = el('span', this.hd, 'pbspd');
    this.bar = el('div', this.w3, 'abs pbbar'); this.bph = el('div', this.bar, 'pbph');
    this.tc = el('div', this.w3, 'abs mono pbtc');
    this.from = this.o.from ?? this.t0 - .05;
    this.endT = this.k(7.2);
    this.rate = (this.from - .45) / Math.pow(this.endT - this.t0, 1.1);
    f.fast(this.t0, this.t1, 8); f.fast(this.endT, this.t1, 12);
    f.cue(this.t0, 'rewind', .8, { dur: this.k(7.5) - this.t0 }); f.cue(this.endT, 'whoosh_big', .7);
    [2, 4, 6].forEach(k => f.bump(this.k(k), .025));
  }
  tn(t) { return clamp(this.from - Math.pow(Math.max(0, t - this.t0), 1.1) * this.rate, .45, this.from); }
  cam(t) { const u = tw(t, this.t0, this.t1, E.lin); return { s: 1 + .06 * u, r: lerp(1, -1, u) }; }
  update(t) {
    const e = tw(t, this.t0, this.t0 + .25, E.outExpo), z = tw(t, this.endT, this.t1, E.inExpo), u = tw(t, this.t0, this.endT, E.inOutCubic);
    const tn = this.tn(t);
    this.nested.render(tn);
    set(this.w3, 'transform', `rotateY(${(lerp(-14, 10, u) * (1 - z)).toFixed(3)}deg) rotateX(${(lerp(8, 3, u) * (1 - z)).toFixed(3)}deg) translateZ(${lerp(-500, 0, e).toFixed(1)}px)`);
    set(this.win, 'transform', `scale(${lerp(1, 1.56, z).toFixed(4)})`); set(this.win, 'transformOrigin', '625px 351px');
    set(this.win, 'opacity', (clamp(e * 3) * (1 - clamp((z - .7) / .3))).toFixed(3));
    const ui = e * (1 - z);
    [this.hd, this.bar, this.tc].forEach(n => set(n, 'opacity', ui.toFixed(3)));
    set(this.hd, 'transform', 'translate(335px, 160px)'); set(this.bar, 'transform', 'translate(335px, 932px)');
    this.spd.textContent = `◀◀  ${Math.round(18 * 1.1 * Math.pow(Math.max(.05, t - this.t0), .1))}×`;
    set(this.bph, 'width', (tn / DUR * 100).toFixed(2) + '%');
    const s = Math.floor(tn), ff = Math.floor((tn % 1) * FPS);
    this.tc.textContent = `00:${String(s).padStart(2, '0')}:${String(ff).padStart(2, '0')}  /  00:${Math.floor(DUR)}:${String(Math.floor((DUR % 1) * FPS)).padStart(2, '0')}`;
    set(this.tc, 'transform', `translate(${1585 - this.tc.offsetWidth}px, 952px)`);
    this.lines.forEach((l, i) => { set(l, 'transform', `translateY(${(((t * (420 + i * 210) + i * 211) % 760) - 30).toFixed(1)}px)`); set(l, 'opacity', (.35 + .25 * Math.sin(t * 13 + i)).toFixed(3)); });
  }
}

// ---------- Logo: a line, a slash, the logo builds, the end line; then it holds with a slow push and a sheen ----------
// { mark: ['id', ...] (SVG ids that drop in one by one), word: ['id', ...] (SVG ids wiped in after), tagline, small, width: 840 }
// Without mark/word ids the whole logo wipes in. The logo comes from spec.logo (inline SVG text).
export class Logo extends Scene {
  static N = 11;
  // starts the end card (Film.endCard): finish.py's motion gates stop here, or 4.5 s before the end if that is earlier
  static endCard = true;
  build() {
    const f = this.f, r = this.root, o = this.o;
    this.line = el('div', r, 'abs lline');
    const svgEl = (() => { const d = document.createElement('div'); d.innerHTML = f.logo; return d.querySelector('svg'); })();
    const vb = (svgEl?.getAttribute('viewBox') || '0 0 840 207').split(/[\s,]+/).map(Number), lw = o.width || 840, lh = lw * vb[3] / vb[2];
    this.lw0 = lw; this.lh0 = lh;
    this.lw = el('div', r, 'abs', { left: '960px', top: (o.y || 505) + 'px' });
    this.d = el('div', this.lw, 'abs logo'); this.d.innerHTML = f.logo;
    this.wm = el('div', this.lw, 'abs logo'); this.wm.innerHTML = f.logo;
    this.sh = el('div', this.lw, 'abs logo sheen'); this.sh.innerHTML = f.logo;
    const mark = o.mark || [], word = o.word || [];
    this.dia = mark.map(id => this.d.querySelector('#' + id)).filter(Boolean);
    if (mark.length) { word.forEach(id => { const p = this.d.querySelector('#' + id); if (p) p.style.display = 'none'; }); mark.forEach(id => { const p = this.wm.querySelector('#' + id); if (p) p.style.display = 'none'; }); }
    else vis(this.d, false);
    for (const host of [this.d, this.wm, this.sh]) { const s = host.querySelector('svg'); if (s) { s.setAttribute('width', lw); s.setAttribute('height', lh); s.style.overflow = 'visible'; } }
    if (!svgEl) {
      // no logo file: a type wordmark wipes in instead
      [this.wm, this.sh].forEach((h, i) => { h.innerHTML = ''; const t = type(h, o.wordmark || f.spec.title || '', { size: 150, wdth: 104, color: i ? '#FFFFFF' : C.paper }); t.style.whiteSpace = 'nowrap'; });
      this.lw0 = this.wm.firstChild.offsetWidth; this.lh0 = this.wm.firstChild.offsetHeight;
    }
    this.sub = el('div', r, 'abs endline'); this.sub.textContent = o.tagline || '';
    this.made = el('div', r, 'abs mono made'); this.made.textContent = o.small || '';
    this.tS = this.k(1);
    f.slash({ t0: this.tS, x1: 420, y1: 545, x2: 1500, y2: 535, dur: .1, hold: .1, fade: .3, w: 5 });
    f.burst({ t0: this.tS + .04, x: 960, y: 540, n: 30, speed: 1100, life: .55, seed: 141 });
    f.flash({ t0: this.tS, dur: .3, rise: .02, color: '#FFFFFF', peak: .12 });
    f.bokeh({ t0: this.k(1.5), t1: this.t1 + 1, n: 70, color: C.paper, size: 2.4, vy: -26, alpha: .3, seed: 142 });
    f.fast(this.tS - .02, this.tS + .6, 10);
    f.cue(this.tS, 'logo_hit', 1.1);
    this.dia.forEach((_, i) => f.cue(this.tS + .1 + i * .075, 'tick', .3));
    f.cue(this.k(5.6), 'sparkle', .3);
  }
  cam(t) { return { s: 1 + .09 * E.outCubic(tw(t, this.tS, this.t1, E.lin)) }; }
  update(t) {
    const l = tw(t, this.tS - .02, this.tS + .16, E.outExpo), lo = tw(t, this.tS + .14, this.tS + .45, E.inCubic);
    vis(this.line, t >= this.tS - .02);
    set(this.line, 'width', (lerp(4, 1100, l) * (1 - lo * .6)).toFixed(1) + 'px');
    set(this.line, 'transform', at(960, 540)); set(this.line, 'opacity', (1 - lo).toFixed(3));
    set(this.lw, 'transform', `translate(${-this.lw0 / 2}px,${-this.lh0 / 2}px)`);
    this.dia.forEach((p, i) => {
      const u = tw(t, this.tS + .08 + i * .075, this.tS + .08 + i * .075 + .4, E.outBack);
      set(p, 'transform', `translateY(${(-70 * (1 - u)).toFixed(1)}px)`); set(p, 'visibility', u > 0 ? 'visible' : 'hidden');
      p.style.transformBox = 'fill-box';
    });
    const w = tw(t, this.tS + (this.dia.length ? .3 : .05), this.tS + .95, E.inOutCubic);
    set(this.wm, 'clipPath', `inset(-20% ${((1 - w) * 100).toFixed(2)}% -20% 0)`);
    set(this.wm, 'transform', `translateX(${(26 * (1 - w)).toFixed(1)}px)`);
    const sw = tw(t, this.k(5.6), this.k(5.6) + .9, E.inOutCubic);
    vis(this.sh, sw > 0 && sw < 1);
    set(this.sh, 'webkitMaskPosition', `${lerp(130, -30, sw).toFixed(2)}% 0`);
    const s1 = tw(t, this.k(3.5), this.k(3.5) + .4, E.outCubic), s2 = tw(t, this.k(4.6), this.k(4.6) + .4, E.outCubic), ly = (this.o.y || 505) + this.lh0 / 2;
    set(this.sub, 'transform', at(960, ly + 60 + 14 * (1 - s1))); set(this.sub, 'opacity', s1.toFixed(3));
    set(this.made, 'transform', at(960, ly + 118 + 10 * (1 - s2))); set(this.made, 'opacity', (s2 * .8).toFixed(3));
  }
}

// ---------- Picture: an image (key art, a product, a screenshot) cut in with a slash, pushed, with words slammed over it ----------
// { src: 'art/key.png', words: [[beat, 'TEXT', 'paper'|'accent'], ...], reveal: 'slash' | 'zoom', focus: [x, y] (0-1, where to push in), x, y (word position),
//   tint: 0.35 (darken for type), frame: true (a chamfered frame grows round it), weather: 'rain' | 'snow' | 'dust' | null,
//   cutIns: [[beat, scale, [fx, fy], cue]] (hard punch-in cuts to a detail of the same image, on the beat) }
// A still image parks the frame: the block keeps it moving with a fast push and pan, a slight 3D tilt,
// a punch-in on every word, and a weather layer drawn over it.
// Scenario MCP is the natural source: generate the image to the brief, upscale it, drop it in the film folder.
export class Picture extends Scene {
  static N = 8;
  build() {
    const f = this.f, r = this.root, o = this.o;
    r.classList.add('persp');
    this.g = el('div', r, 'abs full');
    this.img = el('div', this.g, 'abs pic', { backgroundImage: `url("${o.src}")`, backgroundPosition: `${(o.focus || [.5, .5])[0] * 100}% ${(o.focus || [.5, .5])[1] * 100}%` });
    this.shade = el('div', this.g, 'abs full', { background: `linear-gradient(180deg, ${rgba(C.bg, .1)}, ${rgba(C.bg, o.tint ?? .35)} 70%, ${rgba(C.bg, (o.tint ?? .35) + .25)})` });
    this.halves = null;
    this.s = svg('svg', this.g, { class: 'full abs', viewBox: '0 0 1920 1080', style: 'overflow:visible' });
    this.frame = svg('polyline', this.s, { points: ptsAttr(chamferPts(70, 70, 1780, 940, 36)), fill: 'none', stroke: C.accent, 'stroke-width': 4 });
    this.fLen = polyline(chamferPts(70, 70, 1780, 940, 36)).len;
    vis(this.frame, o.frame !== false);
    this.words = (o.words || []).map(([k, text, c], i) => {
      const L = letters(this.g, text, { size: o.size || 260, wdth: 112, color: cc(c) || C.paper, glow: cc(c) === C.accent ? 22 : 0, cls: 'abs' });
      L.e.style.textShadow = `0 8px 40px ${rgba(C.bg, .6)}`;
      const t = B(this.k0 + k * this.sc), fit = fitTo(L.e.offsetWidth, o.x ? 2 * Math.min(o.x, 1920 - o.x) - 120 : 1600);
      f.shake(t, 10); f.bump(t, .035); f.cue(t, 'hit', .85); f.fast(t, t + .2, 8);
      return { L, t, fit, i };
    });
    this.tR = this.t0;
    if ((o.reveal || 'slash') === 'slash') {
      f.slash({ t0: this.t0 - .02, x1: 1800, y1: -60, x2: 120, y2: 1140, dur: .12, hold: .08, fade: .2, w: 8 });
      f.cue(this.t0 - .02, 'slash', 1); f.flash({ t0: this.t0, dur: .2, rise: .01, color: '#FFFFFF', peak: .35 });
    } else { f.cue(this.t0, 'whoosh_big', .7); }
    f.cue(this.t0, 'impact', .9); f.shake(this.t0, 14); f.bump(this.t0, .05); f.fast(this.t0, this.t0 + .45, 10);
    this.words.forEach(w => f.fast(w.t, w.t + .2, 8));
    this.cutIns = (o.cutIns || []).map(([k, sc, fp, cue]) => {
      const t = B(this.k0 + k * this.sc);
      f.cut(t); f.shake(t, 12); f.bump(t, .04); f.fast(t, t + .2, 8); f.cue(t, cue || 'hit', .9);
      f.flash({ t0: t, dur: .1, rise: .005, color: '#FFFFFF', peak: .25 });
      return { t, sc, fp };
    });
    const wx = o.weather === undefined ? 'dust' : o.weather;
    if (wx) {
      const rr = rng(193), P = Array.from({ length: wx === 'rain' ? 420 : 160 }, () => [rr(), rr(), .4 + rr(), rr()]);
      f.paint((x, t) => {
        if (t < this.t0 || t >= this.t1) return;
        const a = Math.min(1, (t - this.t0) / .15, (this.t1 - t) / .1), age = t - this.t0;
        x.save(); x.globalCompositeOperation = 'lighter'; x.lineCap = 'round';
        for (const [px, py, sp, ph] of P) {
          if (wx === 'rain') {
            // fast diagonal streaks, longer and brighter when near the lens
            const vy = 2600 * sp, y = ((py * 1300 + age * vy) % 1300) - 110, xx = ((px * 2100 + age * vy * .18) % 2100) - 90, L = 40 + 70 * sp;
            x.strokeStyle = rgba(C.paper, (.14 + .26 * sp) * a); x.lineWidth = .9 + 1.8 * sp * sp;
            x.beginPath(); x.moveTo(xx, y); x.lineTo(xx - L * .18, y - L); x.stroke();
          } else {
            const vy = wx === 'snow' ? 90 * sp : -35 * sp, y = (((py * 1180 + age * vy) % 1180) + 1180) % 1180 - 50, xx = px * 1920 + Math.sin(age * (1 + sp) + ph * 7) * 30;
            x.fillStyle = rgba(wx === 'snow' ? '#FFFFFF' : C.paper, (wx === 'snow' ? .5 : .28) * sp * a);
            x.beginPath(); x.arc(xx, y, (wx === 'snow' ? 2.6 : 1.8) * sp + .6, 0, 7); x.fill();
          }
        }
        x.restore();
      }, true);
    }
  }
  cam(t) { const u = tw(t, this.t0, this.t1, E.lin); return { s: 1 + .1 * E.inOutCubic(u), r: lerp(-1, 1, u), x: lerp(-25, 25, u) }; }
  update(t) {
    const o = this.o, u = tw(t, this.t0, this.t1, E.lin), rv = tw(t, this.t0, this.t0 + .45, E.outExpo);
    const z = (o.reveal || 'slash') === 'zoom' ? lerp(2.4, 1, rv) : lerp(1.18, 1, rv);
    let pk = 0; this.words.forEach(w => { if (t >= w.t) pk = punch(t, w.t, 8); });
    const f0 = o.focus || [.5, .5], pan = (u - .5) * 70;
    let ci = null; this.cutIns.forEach(c => { if (t >= c.t) ci = c; });
    set(this.img, 'transformOrigin', ci ? `${(ci.fp[0] * 100).toFixed(1)}% ${(ci.fp[1] * 100).toFixed(1)}%` : '50% 50%');
    const cz = ci ? ci.sc * (1 + .14 * (t - ci.t)) : 1;
    set(this.img, 'transform', `scale(${cz.toFixed(4)}) perspective(1600px) rotateY(${lerp(-3, 3, u).toFixed(3)}deg) translate(${(-pan - (f0[0] - .5) * 60 * u).toFixed(1)}px, ${(-(f0[1] - .5) * 40 * u).toFixed(1)}px) scale(${(z * (1.06 + .24 * E.inOutCubic(u)) * (1 + .07 * pk)).toFixed(4)})`);
    // slash reveal: the image opens along the diagonal the slash drew
    if ((o.reveal || 'slash') === 'slash') { const p = (1 - rv) * 50; set(this.g, 'clipPath', `polygon(${50 + p}% ${-p}%, 100% 0, 100% 100%, ${50 - p}% ${100 + p}%, 0 100%, 0 0)`); }
    else set(this.g, 'opacity', rv.toFixed(3));
    this.frame.setAttribute('stroke-dasharray', `${(this.fLen * tw(t, this.t0 + .2, this.t0 + .9, E.inOutCubic)).toFixed(1)} 99999`);
    this.words.forEach(({ L, t: tw0, fit, i }) => {
      const nx = this.words[i + 1]?.t ?? this.t1, on = t >= tw0 - .01 && t < nx;
      vis(L.e, on);
      if (!on) return;
      const sl = tw(t, tw0, tw0 + .16, E.outExpo);
      set(L.e, 'transform', at(o.x || 960, o.y || 600, `scale(${(lerp(1.4, 1, sl) * (1 + .05 * (t - tw0)) * fit).toFixed(4)})`));
      tumble(L.spans, t, tw0, { stagger: .02, dur: .22, rot: 30, dy: -90, seed: 200 + i, from: .6 });
    });
  }
}
