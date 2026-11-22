// compositor.js: composes a film from its spec (blocks on a beat grid, captions, HUD) into one seekable film.
// A camera rig moves the whole scene layer every frame (scene drift + whips + shakes + beat bumps),
// color grounds swap behind it, and FX draw either in world space (with the camera) or in screen space.
import { B, C, E, tw, rgba, el, vis, set, Caption, HUD, FX, drawComet, drawBurst, drawSlash, drawDots,
  drawRays, drawRing, drawBokeh, drawStarburst } from './core.js';

export class Film {
  constructor(root, o = {}) {
    this.nested = !!o.nested; this.src = o.src || {}; this.logo = o.logo || ''; this.spec = o.spec;
    this.LIGHT = new Set([C.accent, C.paper, C.hot, '#FFFFFF']);
    const dsf = this.nested ? 1 : (o.dsf || window.devicePixelRatio || 1);
    this.stage = el('div', root, 'stage');
    this.groundEl = el('div', this.stage, 'ground');
    this.bgfx = new FX(this.stage, dsf, 'bgfx');
    this.cam = el('div', this.stage, 'cam');
    this.scenesEl = el('div', this.cam, 'scenes');
    this.fx = new FX(this.stage, dsf, 'fxc');
    this.sfx = new FX(this.stage, dsf, 'sfxc');
    this.flashEl = el('div', this.stage, 'flash');
    this.invEl = el('div', this.stage, 'inv');
    el('div', this.stage, 'vig');
    this.overlay = el('div', this.stage, 'overlay');
    for (const k of ['comets', 'bursts', 'slashes', 'dots', 'flashes', 'lights', 'fasts', 'cues', 'hardCuts', 'rays', 'rings', 'bokehs', 'stars',
      'paints', 'grounds', 'shakes', 'bumps', 'whips', 'smears', 'inverts']) this[k] = [];
    this.scenes = this.spec.scenes.filter(([S]) => !(this.nested && S.noNest)).map(([S, k0, k1, opts]) => new S(this, k0, k1, opts || {}));
    // captions are written in beats: [startBeat, endBeat, [[word, beat], ...]]
    const phrases = (this.spec.captions || []).map(([a, b, words]) => ({ t0: B(a), t1: B(b), words: words.map(([w, k]) => [w, B(k)]) }));
    this.cap = new Caption(this, phrases); this.cap.measure();
    // extra sound cues straight from the spec: [[beat, name, gain], ...] (custom sounds such as a footstep or a doorbell)
    for (const [k, name, gain] of this.spec.cues || []) this.cue(B(k), name, gain ?? 1);
    this.hud = new HUD(this, this.spec.hud || '');
    vis(this.hud.root, this.spec.hud !== false);
  }
  comet(o) { this.comets.push(o); }
  burst(o) { this.bursts.push(o); }
  slash(o) { this.slashes.push(o); }
  dot(o) { this.dots.push(o); }
  flash(o) { this.flashes.push(o); }
  light(a, b) { this.lights.push([a, b]); }
  fast(a, b, n) { this.fasts.push([a, b, n]); }
  ray(o) { this.rays.push(o); }
  ring(o) { this.rings.push(o); }
  bokeh(o) { this.bokehs.push(o); }
  star(o) { this.stars.push(o); }
  paint(fn, screen = false) { this.paints.push({ fn, screen }); }
  ground(a, b, color) { this.grounds.push([a, b, color]); }
  shake(t0, amp = 14, k = 13) { this.shakes.push([t0, amp, k]); }
  bump(t0, amt = .035) { this.bumps.push([t0, amt]); }
  smear(a, b, k = 3) { this.smears.push([a, b, k]); }
  invert(t0, dur = 1 / 30) { this.inverts.push([t0, dur]); }
  // whip: the camera flies off in (dx, dy) and the next shot arrives from the opposite side; the cut sits in the middle
  whip(tc, dx, dy = 0, d = .13, rot = 0) { this.whips.push({ tc, dx, dy, d, rot }); this.smear(tc - d, tc + d, 3.4); this.cut(tc); this.cue(tc - .12, 'whoosh', .6); }
  // hard cuts: every scene start plus explicit ones; motion blur never samples across them
  cuts() { return [...new Set([...this.scenes.filter(s => !s.pre).map(s => s.t0), ...this.hardCuts])].sort((a, b) => a - b); }
  cut(t) { this.hardCuts.push(t); }
  // the end card starts at the latest block whose class sets static endCard (the Logo); null without one
  endCard() { const t = this.scenes.filter(q => q.constructor.endCard).map(q => q.t0); return t.length ? Math.max(...t) : null; }
  cue(t, name, gain = 1, o = {}) { if (!this.nested) this.cues.push({ t, name, gain, ...o }); }
  shutter(t) {
    let k = 1;
    for (const [a, b, m] of this.smears) if (t >= a && t <= b) k = Math.max(k, m);
    return k;
  }
  samples(t, dt) {
    let n = 4;
    for (const [a, b, k] of this.fasts) if (t + dt >= a && t <= b) n = Math.max(n, k);
    const sh = this.shutter(t);
    if (sh > 1) n = Math.max(n, Math.ceil(sh * 6));
    return n;
  }
  noGrid(t) { return this.scenes.some(q => q.noGrid && t >= q.t0 && t < q.t1); }
  groundAt(t) {
    let g = null;
    for (const [a, b, c] of this.grounds) if (t >= a && t < b) g = c;
    return g;
  }
  camAt(t) {
    let x = 0, y = 0, s = 1, r = 0;
    const sc = this.scenes.find(q => t >= q.t0 && t < q.t1) || this.scenes.find(q => t >= q.t0 - q.pre && t < q.t1 + q.post);
    if (sc) { const c = sc.cam(t); x += c.x || 0; y += c.y || 0; s *= c.s || 1; r += c.r || 0; }
    for (const w of this.whips) {
      if (t >= w.tc - w.d && t < w.tc) { const u = E.inCubic((t - w.tc + w.d) / w.d); x += w.dx * u; y += w.dy * u; r += w.rot * u; }
      else if (t >= w.tc && t < w.tc + w.d) { const u = 1 - E.outCubic((t - w.tc) / w.d); x -= w.dx * u; y -= w.dy * u; r -= w.rot * u; }
    }
    for (const [t0, amp, k] of this.shakes) {
      const a = t - t0;
      if (a < 0 || a > 1.2) continue;
      const e = amp * Math.exp(-k * a);
      x += e * Math.sin(a * 61 + 1); y += e * .7 * Math.sin(a * 73 + 2); r += e * .03 * Math.sin(a * 47);
    }
    for (const [t0, amt] of this.bumps) {
      const a = t - t0;
      if (a < 0 || a > .8) continue;
      s *= 1 + amt * (1 - Math.exp(-a / .014)) * Math.exp(-a * 9);
    }
    return { x, y, s, r };
  }
  render(t) {
    const g = this.groundAt(t);
    const light = (g && this.LIGHT.has(g)) || this.lights.some(([a, b]) => t >= a && t < b);
    set(this.groundEl, 'background', g || 'transparent');
    for (const s of this.scenes) {
      const on = t >= s.t0 - s.pre && t < s.t1 + s.post;
      vis(s.root, on);
      if (on) s.update(t);
    }
    const c = this.camAt(t);
    this.camNow = c;
    set(this.cam, 'transform', `translate(960px,540px) rotate(${c.r.toFixed(4)}deg) scale(${c.s.toFixed(5)}) translate(${(-960 - c.x).toFixed(2)}px,${(-540 - c.y).toFixed(2)}px)`);
    // world-space canvases share the camera transform
    const world = fx => { fx.clear(); const x = fx.x; x.translate(960, 540); x.rotate(c.r * Math.PI / 180); x.scale(c.s, c.s); x.translate(-960 - c.x, -540 - c.y); return x; };
    const bx = world(this.bgfx);
    if (!light && !this.noGrid(t)) {
      // dot grid in world space: it moves with the camera, so even an empty frame shows the move
      const R = Math.hypot(960, 540) / c.s + 140, ox = 960 + c.x, oy = 540 + c.y;
      bx.fillStyle = rgba(C.paper, .16);
      for (let gx = Math.floor((ox - R) / 128) * 128 + 64; gx < ox + R; gx += 128)
        for (let gy = Math.floor((oy - R) / 128) * 128 + 76; gy < oy + R; gy += 128) bx.fillRect(gx - 1.3, gy - 1.3, 2.6, 2.6);
    }
    for (const d of this.dots) drawDots(bx, d, t);
    for (const b of this.bokehs) if (!b.screen) drawBokeh(bx, b, t);
    for (const s of this.stars) if (!s.front) drawStarburst(bx, s, t);
    const x = world(this.fx);
    for (const p of this.paints) if (!p.screen) p.fn(x, t);
    for (const s of this.stars) if (s.front) drawStarburst(x, s, t);
    for (const cm of this.comets) drawComet(x, cm, t);
    for (const s of this.slashes) drawSlash(x, s, t);
    for (const b of this.bursts) drawBurst(x, b, t);
    for (const r of this.rays) if (!r.screen) drawRays(x, r, t);
    for (const r of this.rings) if (!r.screen) drawRing(x, r, t);
    this.sfx.clear();
    const sx = this.sfx.x;
    for (const p of this.paints) if (p.screen) p.fn(sx, t);
    for (const b of this.bokehs) if (b.screen) drawBokeh(sx, b, t);
    for (const r of this.rays) if (r.screen) drawRays(sx, r, t);
    for (const r of this.rings) if (r.screen) drawRing(sx, r, t);
    let fa = 0, fc = '#FFFFFF';
    for (const f of this.flashes) {
      const a = t - f.t0;
      if (a < 0 || a > f.dur) continue;
      const v = (f.peak ?? 1) * (a < f.rise ? a / f.rise : 1 - (a - f.rise) / (f.dur - f.rise));
      if (v > fa) { fa = v; fc = f.color; }
    }
    set(this.flashEl, 'opacity', fa.toFixed(3)); set(this.flashEl, 'background', fc);
    vis(this.invEl, this.inverts.some(([a, d]) => t >= a && t < a + d));
    this.cap.update(t, light);
    // the frame counter shows the output frame, not the sub-frame sample, so motion blur never smears its digits
    const ft = !this.nested && window.__frameT != null ? window.__frameT : t;
    const hf = this.spec.hudOut || [this.spec.beats - 4, this.spec.beats - 2];
    this.hud.update(ft, light, Math.min(tw(t, .02, .35), 1 - tw(t, B(hf[0]), B(hf[1]))));
  }
}
