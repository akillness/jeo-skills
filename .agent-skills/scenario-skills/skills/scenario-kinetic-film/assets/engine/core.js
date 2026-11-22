// core.js: engine for kinetic films written as code. Every frame is a pure function of t (seconds),
// so the renderer can seek anywhere and sample sub-frames for motion blur.
// Tempo and palette come from the film's spec (configure / setPalette); everything is timed in beats.
export const W = 1920, H = 1080;
export let FPS = 60, BPM = 120, BEATS = 64, DUR = BEATS * 60 / BPM;
export const B = k => k * 60 / BPM;
export function configure(o = {}) {
  if (o.bpm) BPM = o.bpm;
  if (o.beats) BEATS = o.beats;
  if (o.fps) FPS = o.fps;
  DUR = B(BEATS);
}
// palette: bg (dark ground), paper (light ground and light type), accent (the brand color), hot (a hotter accent),
// ink (type on light grounds). Everything else is derived.
export const C = { bg: '#0C0E11', paper: '#F4F1EA', accent: '#FF5B2E', hot: '#FF3A0A', ink: '#141210' };
export function setPalette(p = {}) {
  Object.assign(C, p);
  C.tint = mixc(C.accent, '#FFFFFF', .72);      // the white-hot core of the comet and slashes
  C.tint2 = mixc(C.accent, '#FFFFFF', .5);
  C.side0 = mixc(C.accent, '#000000', .45);     // extrusion side colors
  C.side1 = mixc(C.bg, '#000000', .25);
  C.sideP = mixc(C.accent, '#000000', .62);
  C.panel = mixc(C.bg, C.paper, .035);
  const r = document.documentElement.style;
  for (const k of ['bg', 'paper', 'accent', 'hot', 'ink', 'panel']) r.setProperty('--' + k, C[k]);
}
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, u) => a + (b - a) * u;
export const E = {
  lin: u => u,
  inQuad: u => u * u,
  outQuad: u => 1 - (1 - u) * (1 - u),
  inCubic: u => u * u * u,
  outCubic: u => 1 - Math.pow(1 - u, 3),
  inOutCubic: u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2,
  outQuint: u => 1 - Math.pow(1 - u, 5),
  inOutQuint: u => u < .5 ? 16 * u ** 5 : 1 - Math.pow(-2 * u + 2, 5) / 2,
  outExpo: u => u >= 1 ? 1 : 1 - Math.pow(2, -10 * u),
  inExpo: u => u <= 0 ? 0 : Math.pow(2, 10 * u - 10),
  inOutExpo: u => u <= 0 ? 0 : u >= 1 ? 1 : u < .5 ? Math.pow(2, 20 * u - 10) / 2 : (2 - Math.pow(2, -20 * u + 10)) / 2,
  outBack: (u, s = 1.70158) => 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2),
  outElastic: u => u <= 0 ? 0 : u >= 1 ? 1 : Math.pow(2, -10 * u) * Math.sin((u * 10 - .75) * (2 * Math.PI / 3)) + 1,
};
export const tw = (t, a, b, e = E.outCubic) => e(clamp((t - a) / (b - a)));
// 0 -> 1 -> 0 envelope: rise over [a, a+r], hold, fall over [b-f, b]
export const env = (t, a, b, r = .1, f = .1) => Math.min(tw(t, a, a + r, E.outCubic), 1 - tw(t, b - f, b, E.inCubic));

export function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
// shot colors may be any CSS color: a canvas normalizes the rest to #rrggbb or rgba()
let probe;
const css = h => {
  probe ??= document.createElement('canvas').getContext('2d');
  probe.fillStyle = '#000';
  probe.fillStyle = h;
  return probe.fillStyle;
};
const hex = h => /^#[\da-f]{6}$/i.test(h) ? [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  : /^rgba?\(/.test(h) ? h.match(/[\d.]+/g).slice(0, 3).map(Number) : hex(css(h));
export function mixc(a, b, u) {
  const A = hex(a), Bc = hex(b);
  return '#' + A.map((v, i) => Math.round(lerp(v, Bc[i], clamp(u))).toString(16).padStart(2, '0')).join('');
}
export const rgba = (h, a) => `rgba(${hex(h).join(',')},${a})`;

export function el(tag, parent, cls, style) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (style) Object.assign(e.style, style);
  if (parent) parent.appendChild(e);
  return e;
}
export function vis(e, on) { const d = on ? '' : 'none'; if (e.style.display !== d) e.style.display = d; }
export function set(e, k, v) { if (e.style[k] !== v) e.style[k] = v; }
// center an element on (x, y), then apply extra transforms
export const at = (x, y, extra = '') => `translate(${x}px,${y}px) translate(-50%,-50%) ${extra}`;

// Display type. font-variation-settings drives Archivo's wght and wdth axes directly.
export function type(parent, text, o = {}) {
  const e = el('div', parent, 'type ' + (o.cls || ''));
  e.textContent = text;
  styleType(e, o);
  return e;
}
export function styleType(e, o = {}) {
  const s = e.style;
  s.fontFamily = o.font || 'Archivo';
  s.fontSize = (o.size || 150) + 'px';
  if (!o.font || o.font === 'Archivo') s.fontVariationSettings = `'wght' ${o.wght || 900}, 'wdth' ${o.wdth || 100}`;
  else s.fontWeight = o.weight || 700;
  s.color = o.color || C.paper;
  if (o.stroke) { s.color = 'transparent'; s.webkitTextStroke = `${o.stroke}px ${o.color || C.paper}`; }
  else if (s.webkitTextStroke) s.webkitTextStroke = '';
  s.letterSpacing = (o.ls || 0) + 'em';
  if (o.glow) s.textShadow = `0 0 ${o.glow}px ${rgba(C.accent, .55)}, 0 0 ${o.glow * 2.6}px ${rgba(C.accent, .28)}`;
}
// One span per letter, for per-letter animation.
export function letters(parent, text, o = {}) {
  const e = el('div', parent, 'type ' + (o.cls || ''));
  styleType(e, o);
  const spans = [...text].map(ch => { const s = el('span', e, 'ch'); s.textContent = ch === ' ' ? ' ' : ch; return s; });
  return { e, spans };
}
// Extruded 3D type: a stack of copies along -Z. The parent must preserve-3d.
export function extrude(parent, text, o = {}) {
  const g = el('div', parent, 'p3d xg');
  const n = o.layers || 32, depth = o.depth || 70;
  const s0 = o.side0 || C.side0, s1 = o.side1 || C.side1;
  const L = [];
  for (let i = n; i >= 0; i--) {
    const s = el('div', g, 'type xl');
    s.textContent = text;
    styleType(s, { ...o, glow: 0, color: i === 0 ? (o.face || C.paper) : mixc(s0, s1, i / n) });
    s.style.transform = `translateZ(${(-depth * i / n).toFixed(2)}px)`;
    if (i === 0 && o.glow) s.style.textShadow = `0 0 ${o.glow}px ${rgba(C.accent, .5)}`;
    L.push(s);
  }
  g.face = L[L.length - 1];
  return g;
}

// ---------- caption: spoken-style line, top left, current word in a highlight box ----------
export class Caption {
  constructor(film, phrases) {
    // own copies: the nested film in the rewind builds a second caption from the same phrase list
    this.f = film; this.ph = phrases.map(p => ({ ...p }));
    this.root = el('div', film.overlay, 'cap');
    for (const p of this.ph) {
      p.line = el('div', this.root, 'capline');
      p.box = el('div', p.line, 'capbox');
      p.spans = p.words.map(([w], i) => {
        const s = el('span', p.line, 'capw'); s.textContent = w;
        if (i < p.words.length - 1) el('span', p.line, 'capsp').textContent = ' ';
        return s;
      });
    }
  }
  measure() {
    for (const p of this.ph) p.geo = p.spans.map(s => [s.offsetLeft, s.offsetWidth]);
  }
  update(t, light) {
    const ink = light ? C.ink : C.paper, hi = light ? C.ink : C.accent, hiText = light ? C.accent : C.ink;
    for (const p of this.ph) {
      const on = t >= p.t0 - .05 && t < p.t1 + .15;
      vis(p.line, on);
      if (!on) continue;
      const out = tw(t, p.t1, p.t1 + .14, E.inCubic);
      set(p.line, 'opacity', (1 - out).toFixed(3));
      set(p.line, 'transform', `translateY(${(-10 * out).toFixed(2)}px)`);
      let cur = -1;
      p.words.forEach(([, wt], i) => {
        const s = p.spans[i], u = tw(t, wt - .03, wt + .1, E.outCubic);
        if (t >= wt - .01) cur = i;
        set(s, 'opacity', u.toFixed(3));
        set(s, 'transform', `translateY(${((1 - u) * 12).toFixed(2)}px)`);
      });
      p.spans.forEach((s, i) => set(s, 'color', i === cur ? hiText : ink));
      if (cur < 0) { set(p.box, 'opacity', '0'); continue; }
      // the box slides from the previous word to the current one
      const wt = p.words[cur][1], u = tw(t, wt - .01, wt + .08, E.outCubic);
      const [x1, w1] = p.geo[cur], [x0, w0] = cur > 0 ? p.geo[cur - 1] : [x1, 0];
      const x = lerp(x0, x1, u), w = lerp(w0, w1, u);
      set(p.box, 'opacity', '1');
      set(p.box, 'background', hi);
      set(p.box, 'transform', `translateX(${(x - 7).toFixed(2)}px)`);
      set(p.box, 'width', (w + 14).toFixed(2) + 'px');
    }
  }
}

// ---------- HUD: corner brackets, frame counter, label, REC, timecode ----------
export class HUD {
  constructor(film, label = '') {
    this.root = el('div', film.overlay, 'hud');
    this.br = ['tl', 'tr', 'bl', 'brr'].map(k => el('div', this.root, 'br ' + k));
    this.fr = el('div', this.root, 'hudt tl'); this.lb = el('div', this.root, 'hudt tr');
    this.rec = el('div', this.root, 'hudt bl'); this.tc = el('div', this.root, 'hudt brt');
    this.lb.textContent = label;
    this.dot = el('span', this.rec, 'recdot'); el('span', this.rec).textContent = 'REC';
  }
  update(t, light, alpha) {
    const f = Math.floor(t * FPS + 1e-6);
    this.fr.textContent = 'FRAME ' + String(f).padStart(4, '0');
    const s = Math.floor(t), ff = f % FPS;
    this.tc.textContent = `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
    set(this.root, 'opacity', alpha.toFixed(3));
    set(this.root, 'color', light ? rgba(C.ink, .55) : rgba(C.paper, .42));
    set(this.root, 'borderColor', light ? rgba(C.ink, .45) : rgba(C.paper, .32));
    set(this.dot, 'opacity', (t % 1 < .55 ? 1 : .25).toString());
    set(this.dot, 'background', light ? C.ink : C.accent);
  }
}

// ---------- FX canvas: comet, sparks, glyph bursts, slashes, dot flashes ----------
export class FX {
  constructor(parent, dsf, cls) {
    this.c = el('canvas', parent, 'fx ' + (cls || ''));
    this.c.width = W * dsf; this.c.height = H * dsf; this.dsf = dsf;
    this.x = this.c.getContext('2d');
  }
  clear() { const x = this.x; x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, this.c.width, this.c.height); x.setTransform(this.dsf, 0, 0, this.dsf, 0, 0); }
}

export function drawComet(x, seg, t) {
  const { t0, t1, path, ease = E.inOutCubic, tail = .14, size = 9, color = C.accent, hold = 0, fade = .08 } = seg;
  if (t < t0 || t > Math.max(t1 + Math.max(tail, hold) + fade, seg.trail ? seg.trailEnd + .25 : 0)) return;
  const P = s => path(ease(clamp((s - t0) / (t1 - t0))), s);
  const head = Math.min(t, t1);
  const N = 28, pts = [];
  for (let i = 0; i <= N; i++) {
    const s = head - tail * (1 - i / N);
    if (s < t0) continue;
    pts.push(P(s));
  }
  // after arrival the tail drains into the head, and the head fades unless held
  const after = t - t1;
  const drain = after > 0 ? clamp(after / tail) : 0;
  const keep = pts.slice(Math.floor(drain * pts.length));
  const headA = after > hold ? 1 - clamp((after - hold) / fade) : 1;
  x.save(); x.globalCompositeOperation = 'lighter'; x.lineCap = 'round';
  if (seg.trail && t < seg.trailEnd + .25) {
    // a thin line stays behind along the path the comet has traveled
    const ta = .55 * (1 - clamp((t - seg.trailEnd) / .25));
    x.strokeStyle = rgba(color, ta); x.lineWidth = 2.4; x.beginPath();
    for (let i = 0; i <= 60; i++) { const s = t0 + (head - t0) * i / 60, p = P(s); i ? x.lineTo(...p) : x.moveTo(...p); }
    x.stroke();
  }
  if (seg.trail && t > t1 + Math.max(tail, hold) + fade) { x.restore(); return; }
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < keep.length; i++) {
      const u = i / keep.length;
      x.strokeStyle = pass ? rgba(C.tint, .9 * u * headA) : rgba(color, .35 * u * headA);
      x.lineWidth = pass ? size * .55 * u : size * 2.2 * u;
      x.beginPath(); x.moveTo(...keep[i - 1]); x.lineTo(...keep[i]); x.stroke();
    }
  }
  if (headA > 0 && keep.length) {
    const [hx, hy] = P(head);
    const g = x.createRadialGradient(hx, hy, 0, hx, hy, size * 3.4);
    g.addColorStop(0, rgba(C.tint, headA)); g.addColorStop(.22, rgba(C.tint2, .95 * headA));
    g.addColorStop(.45, rgba(color, .55 * headA)); g.addColorStop(1, rgba(color, 0));
    x.fillStyle = g; x.beginPath(); x.arc(hx, hy, size * 3.4, 0, 7); x.fill();
  }
  x.restore();
}

export function drawBurst(x, b, t) {
  const age = t - b.t0, life = b.life || .6;
  if (age < 0 || age > life) return;
  const r = rng(b.seed || 7), n = b.n || 26;
  x.save(); x.globalCompositeOperation = b.blend || 'lighter'; x.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = (b.angle ?? 0) + (r() - .5) * (b.spread ?? Math.PI * 2);
    const sp = (b.speed || 900) * (.35 + .65 * r()), l = life * (.45 + .55 * r());
    if (age > l) { r(); continue; }
    const k = age / l, drag = (1 - Math.exp(-3.2 * age)) / 3.2;
    const px = b.x + Math.cos(a) * sp * drag, py = b.y + Math.sin(a) * sp * drag + (b.g ?? 260) * age * age;
    const v = sp * Math.exp(-3.2 * age), len = (b.len || .035) * v + 2;
    const al = (1 - k) * (b.alpha ?? 1);
    if (b.glyphs) {
      const ch = b.glyphs[Math.floor(r() * b.glyphs.length)];
      x.save(); x.translate(px, py); x.rotate((r() - .5) * 2 * k * 2);
      x.font = `600 ${b.gsize || 30}px JBM`; x.fillStyle = rgba(b.color || C.accent, al);
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 0, 0); x.restore();
    } else {
      x.strokeStyle = rgba(b.color || C.accent, al); x.lineWidth = (b.w || 3) * (1 - k * .5);
      x.beginPath(); x.moveTo(px, py); x.lineTo(px - Math.cos(a) * len, py - Math.sin(a) * len); x.stroke();
    }
  }
  x.restore();
}

export function drawSlash(x, s, t) {
  const { t0, x1, y1, x2, y2, dur = .12, hold = .22, fade = .2, w = 7, color = C.accent } = s;
  const age = t - t0;
  if (age < 0 || age > dur + hold + fade) return;
  const u = E.outCubic(clamp(age / dur));
  const tailU = E.inCubic(clamp((age - dur * .6) / (hold + fade)));
  const a = age > dur + hold ? 1 - (age - dur - hold) / fade : 1;
  const hx = lerp(x1, x2, u), hy = lerp(y1, y2, u), tx = lerp(x1, x2, tailU * u), ty = lerp(y1, y2, tailU * u);
  x.save(); x.globalCompositeOperation = 'lighter'; x.lineCap = 'round';
  [[w * 5, .18], [w * 2.2, .45], [w, .95], [w * .35, 1]].forEach(([lw, al], i) => {
    x.strokeStyle = i === 3 ? rgba(C.tint, al * a) : rgba(color, al * a);
    x.lineWidth = lw; x.beginPath(); x.moveTo(tx, ty); x.lineTo(hx, hy); x.stroke();
  });
  x.restore();
}

export function drawDots(x, d, t) {
  const age = t - d.t0;
  if (age < 0 || age > d.dur) return;
  const a = Math.sin(Math.PI * age / d.dur) * (d.alpha || .55);
  const sp = d.sp || 18;
  x.save();
  for (let gx = d.cx - d.rx; gx <= d.cx + d.rx; gx += sp) for (let gy = d.cy - d.ry; gy <= d.cy + d.ry; gy += sp) {
    const q = ((gx - d.cx) / d.rx) ** 2 + ((gy - d.cy) / d.ry) ** 2;
    if (q > 1) continue;
    // a ring that expands outward from the center over the flash
    const ring = 1 - Math.abs(Math.sqrt(q) - age / d.dur * 1.1) * 2.2;
    const al = a * clamp(.25 + ring) * (1 - q * .6);
    if (al <= .01) continue;
    x.fillStyle = rgba(d.color || C.paper, al);
    x.fillRect(gx - 1.6, gy - 1.6, 3.2, 3.2);
  }
  x.restore();
}

// ---------- effects ----------
// Speed lines on a spoke pattern. Outward: a burst that stretches and drains. Inward: lines that keep converging.
export function drawRays(x, o, t) {
  const { t0, dur = .5, cx = 960, cy = 540, n = 64, inward = false, color = C.paper, w = 2.4, r0 = 60, r1 = 1400, seed = 3, alpha = 1, rate = 2.2 } = o;
  const age = t - t0;
  if (age < 0 || age > dur) return;
  const r = rng(seed), k = age / dur;
  x.save(); x.globalCompositeOperation = o.blend || 'lighter'; x.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, sp = .55 + .9 * r(), off = r(), ww = w * (.45 + 1.1 * r()), jit = r();
    let h, tl, al;
    if (inward) {
      const q = (age * rate * sp + off) % 1, rad = u => r0 + (r1 - r0) * Math.pow(1 - clamp(u), 1.7);
      h = rad(q); tl = rad(q - .16 - .1 * jit); al = Math.sin(Math.PI * q) * Math.pow(k, .6) * Math.min(1, (1 - k) * 12);
    } else {
      const q = clamp(age / (dur * (.45 + .55 * sp)));
      h = lerp(r0, r1, E.outCubic(q)); tl = lerp(r0, r1, E.inCubic(q)); al = 1 - q;
    }
    if (al <= .01 || h <= tl - 1e-3 && !inward) continue;
    x.strokeStyle = rgba(color, clamp(al * alpha)); x.lineWidth = ww;
    x.beginPath(); x.moveTo(cx + Math.cos(a) * tl, cy + Math.sin(a) * tl); x.lineTo(cx + Math.cos(a) * h, cy + Math.sin(a) * h); x.stroke();
  }
  x.restore();
}
// Expanding shockwave ring.
export function drawRing(x, o, t) {
  const { t0, dur = .45, cx = 960, cy = 540, r0 = 20, r1 = 700, w = 10, color = C.accent, alpha = 1, sy = 1 } = o;
  const k = (t - t0) / dur;
  if (k < 0 || k > 1) return;
  x.save(); x.globalCompositeOperation = o.blend || 'lighter';
  x.strokeStyle = rgba(color, (1 - k) * alpha); x.lineWidth = w * (1 - k * .8);
  x.beginPath(); x.ellipse(cx, cy, lerp(r0, r1, E.outCubic(k)), lerp(r0, r1, E.outCubic(k)) * sy, 0, 0, 7); x.stroke();
  x.restore();
}
// Drifting points of light that wrap inside a region: keeps a quiet frame alive.
export function drawBokeh(x, o, t) {
  const { t0, t1, n = 40, x0 = 0, y0 = 0, x1 = W, y1 = H, color = C.accent, size = 3, vx = 0, vy = -30, seed = 5, alpha = .6 } = o;
  if (t < t0 || t > t1) return;
  const r = rng(seed), fade = Math.min(1, (t - t0) / .25, (t1 - t) / .25), age = t - t0;
  x.save(); x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const px0 = r(), py0 = r(), sp = .5 + r(), sz = size * (.4 + 1.3 * r() * r()), ph = r() * 7, wob = 6 + 18 * r();
    const px = x0 + (((px0 * (x1 - x0) + vx * sp * age + Math.sin(age * 1.3 + ph) * wob) % (x1 - x0)) + (x1 - x0)) % (x1 - x0);
    const py = y0 + (((py0 * (y1 - y0) + vy * sp * age + Math.cos(age * 1.1 + ph) * wob) % (y1 - y0)) + (y1 - y0)) % (y1 - y0);
    const a = fade * alpha * (.35 + .65 * Math.abs(Math.sin(age * (1.5 + sp) + ph)));
    x.fillStyle = rgba(color, a * .35); x.beginPath(); x.arc(px, py, sz * 2.6, 0, 7); x.fill();
    x.fillStyle = rgba(color, a); x.beginPath(); x.arc(px, py, sz, 0, 7); x.fill();
  }
  x.restore();
}
// Comic starburst that pops in, spins, and can melt into a circle (morph 0 -> 1).
export function drawStarburst(x, o, t) {
  const { t0, t1, cx = 960, cy = 540, r = 300, spikes = 16, jag = .42, spin = .5, color = C.accent, seed = 9, pop = .18, morph } = o;
  if (t < t0 || t > t1) return;
  const rr = rng(seed), age = t - t0;
  const s = E.outBack(clamp(age / pop), 2.4) * (1 - E.inCubic(clamp((t - (t1 - .12)) / .12)));
  const m = morph ? E.inOutCubic(clamp((t - morph[0]) / (morph[1] - morph[0]))) : 0;
  const N = spikes * 2, rot = age * spin + (o.rot || 0);
  x.save(); x.fillStyle = color; x.beginPath();
  for (let i = 0; i <= N; i++) {
    const j = i % N, out = j % 2 === 0, v = rr();
    const rad = r * s * lerp(out ? (1 + .18 * v) : (1 - jag * (.7 + .5 * v)), .82, m);
    const a = rot + j / N * Math.PI * 2 + (out ? 0 : (v - .5) * .12);
    const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad * (o.sy || 1);
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  }
  x.closePath(); x.fill(); x.restore();
}
// A type element cut into horizontal bands, so it can glitch (offset each band).
export function slices(parent, text, o = {}, k = 7) {
  const g = el('div', parent, 'abs');
  const parts = [];
  for (let i = 0; i < k; i++) {
    const e = type(g, text, { ...o, cls: (o.cls || '') + (i ? ' abs' : '') });
    e.style.clipPath = `inset(${(i / k * 100).toFixed(2)}% -10% ${(100 - (i + 1) / k * 100).toFixed(2)}% -10%)`;
    if (i) { e.style.left = '0'; e.style.top = '0'; }
    parts.push(e);
  }
  g.parts = parts; g.w = parts[0].offsetWidth; g.h = parts[0].offsetHeight;
  return g;
}
export function glitch(g, t, t0, dur, amp = 90, seed = 1) {
  const on = t >= t0 && t < t0 + dur, r = rng(seed + Math.floor(t * 30));
  g.parts.forEach((p, i) => set(p, 'transform', on ? `translateX(${((r() - .5) * 2 * amp * (r() < .55 ? 1 : .15)).toFixed(1)}px)` : 'none'));
}
// Per-letter tumble-in: each letter drops, spins and scales into place, staggered.
export function tumble(spans, t, t0, o = {}) {
  const { stagger = .03, dur = .32, rot = 70, dy = -140, seed = 4, from = .2 } = o;
  const r = rng(seed);
  spans.forEach((s, i) => {
    const rv = r() - .5, dv = .5 + r(), u = clamp((t - t0 - i * stagger) / dur), e = E.outBack(u, 2);
    set(s, 'display', 'inline-block');
    set(s, 'transform', `translateY(${((1 - e) * dy * dv).toFixed(1)}px) rotate(${((1 - e) * rot * rv * 2).toFixed(2)}deg) scale(${lerp(from, 1, e).toFixed(3)})`);
    set(s, 'opacity', clamp(u * 3).toFixed(3));
  });
}
