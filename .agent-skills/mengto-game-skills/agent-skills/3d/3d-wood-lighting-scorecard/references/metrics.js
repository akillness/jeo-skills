/* Objective render metrics -> anchored 0-10 scores.
   Works unchanged in the page (window.KiboriMetrics) and in Node (require).
   Input: RGBA bytes of ONE captured frame + regions given as fractions of the frame.
   Every sub-metric maps to a score through three anchors [v@3, v@6, v@9] (linear between and
   beyond, clamped 0..10; anchors may run high->low for "lower is better"). Anchors are the
   numbers written into references/rubric.md. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KiboriMetrics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const v = i / 255; LIN[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function anchor(v, a, cap) {      // a = [v3, v6, v9]; cap = [v9 ends, v3 again] for "too much is wrong too"
    if (v == null || !isFinite(v)) return null;
    const [a3, a6, a9] = a;
    let s = (v - a3) / (a6 - a3) <= 1 ? 3 + 3 * (v - a3) / (a6 - a3) : 6 + 3 * (v - a6) / (a9 - a6);
    s = clamp(s, 0, 10);
    if (cap && v > cap[0]) s = Math.min(s, clamp(9 - 6 * (v - cap[0]) / (cap[1] - cap[0]), 0, 9));
    return s;
  }
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;

  function prep(rgba, W, H) {
    const Y = new Float32Array(W * H), R = new Float32Array(W * H), B = new Float32Array(W * H);
    for (let i = 0, j = 0; i < W * H; i++, j += 4) {
      R[i] = rgba[j]; B[i] = rgba[j + 2];
      Y[i] = 0.2126 * rgba[j] + 0.7152 * rgba[j + 1] + 0.0722 * rgba[j + 2];
    }
    return { W, H, Y, R, B, rgba };
  }
  function integral(F, W, H) {
    const I = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let row = 0;
      for (let x = 0; x < W; x++) { row += F[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
    return I;
  }
  function boxAt(I, W, H, x, y, r) {
    const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
    const s = I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];
    return s / ((x1 - x0) * (y1 - y0));
  }
  function rect(f, W, H) { return [Math.round(f[0] * W), Math.round(f[1] * H), Math.round(f[2] * W), Math.round(f[3] * H)]; }
  function hist(vals, scale) { const h = new Uint32Array(256 * scale + 1); for (const v of vals) h[clamp(Math.round(v * scale), 0, 256 * scale)]++; return h; }
  function pct(h, n, p, scale) { let c = 0; const t = n * p; for (let i = 0; i < h.length; i++) { c += h[i]; if (c >= t) return i / scale; } return 255; }
  function bil(Y, W, H, x, y) {
    x = clamp(x, 0, W - 1.001); y = clamp(y, 0, H - 1.001);
    const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * W + x0;
    return (Y[i] * (1 - fx) + Y[i + 1] * fx) * (1 - fy) + (Y[i + W] * (1 - fx) + Y[i + W + 1] * fx) * fy;
  }
  function lineProfile(P, p0, p1, n, perp, k) {   // fractions -> px; averaged over +-k px across
    const { W, H, Y } = P, x0 = p0[0] * W, y0 = p0[1] * H, x1 = p1[0] * W, y1 = p1[1] * H;
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, out = [];
    for (let i = 0; i < n; i++) { const t = i / (n - 1); let s = 0, c = 0;
      for (let o = -k; o <= k; o++) { s += bil(Y, W, H, x0 + dx * t + nx * (perp + o), y0 + dy * t + ny * (perp + o)); c++; }
      out.push(s / c); }
    return out;
  }
  const smooth = (a, r) => a.map((_, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - r); j <= Math.min(a.length - 1, i + r); j++) { s += a[j]; c++; } return s / c; });

  /* ------------------------------------------------------------ measure */
  function measure(rgba, W, H, R, opt) {
    opt = opt || {};
    const P = prep(rgba, W, H), { Y } = P;
    const I1 = integral(Y, W, H), out = {}, items = [];
    const item = (id, name, parts) => {
      const ss = parts.map(p => p.score).filter(s => s != null);
      items.push({ id, name, score: ss.length ? +mean(ss).toFixed(2) : null, parts });
    };
    const part = (k, v, a, note, cap) => ({ k, v: v == null ? null : +(+v).toFixed(4), anchors: a, cap: cap || undefined, score: (() => { const s = anchor(v, a, cap); return s == null ? null : +s.toFixed(2); })(), note: note || '' });

    /* whole-frame tone ---------------------------------------------------- */
    const all = new Float32Array(W * H); let clipN = 0, crushN = 0, wash = 0;
    for (let i = 0, j = 0; i < W * H; i++, j += 4) {
      all[i] = Y[i];
      if (rgba[j] >= 254 || rgba[j + 1] >= 254 || rgba[j + 2] >= 254) clipN++;
      if (Y[i] < 2) crushN++;
    }
    const hAll = hist(all, 4), pAll = q => pct(hAll, W * H, q, 4);
    out.clipPct = 100 * clipN / (W * H); out.crushPct = 100 * crushN / (W * H);
    out.p1 = pAll(0.01); out.p50 = pAll(0.5); out.p99 = pAll(0.99);
    out.rangeStops = Math.log2(Math.max(LIN[Math.round(out.p99)], 1e-5) / Math.max(LIN[Math.round(out.p1)], 2e-4));

    /* 1 materials / grain ------------------------------------------------- */
    if (R.grain) {
      const [x0, y0, x1, y1] = rect(R.grain.rect, W, H), ang = R.grain.angle || 0, ca = Math.cos(ang), sa = Math.sin(ang);
      let sm = 0, n = 0, eAlong = 0, eAcross = 0, hp2 = 0, lowM = 0, low2 = 0;
      for (let y = y0 + 1; y < y1 - 1; y++) for (let x = x0 + 1; x < x1 - 1; x++) {
        const i = y * W + x, gx = (Y[i + 1] - Y[i - 1]) * 0.5, gy = (Y[i + W] - Y[i - W]) * 0.5;
        const al = gx * ca + gy * sa, ac = -gx * sa + gy * ca; eAlong += al * al; eAcross += ac * ac;
        const b4 = boxAt(I1, W, H, x, y, 4), b14 = boxAt(I1, W, H, x, y, 14);
        hp2 += (Y[i] - b4) * (Y[i] - b4); lowM += b14; low2 += b14 * b14; sm += Y[i]; n++;
      }
      const mu = sm / n, lowMean = lowM / n;
      out.grainContrast = Math.sqrt(hp2 / n) / Math.max(mu, 1);
      out.grainAniso = eAcross / Math.max(eAlong, 1e-6);
      out.toneVar = Math.sqrt(Math.max(0, low2 / n - lowMean * lowMean)) / Math.max(mu, 1);
      item('grain', 'Materials & grain', [
        part('grainContrast', out.grainContrast, [0.006, 0.022, 0.05], 'band-pass 1-8 px std / mean'),
        part('grainAniso', out.grainAniso, [1.1, 1.9, 3.2], 'gradient energy across/along the grain axis'),
        part('toneVar', out.toneVar, [0.008, 0.035, 0.08], 'broad tonal drift (cathedral arcs, ring bands)')]);
    }

    /* 2 key / fill contrast ----------------------------------------------- */
    if (R.lit && R.shade) {
      const m = r => { const [x0, y0, x1, y1] = rect(r, W, H); let s = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += LIN[Math.round(Y[y * W + x])]; n++; } return s / Math.max(n, 1); };
      const lit = m(R.lit), shade = m(R.shade);
      out.keyFillStops = Math.log2(Math.max(lit, 1e-5) / Math.max(shade, 1e-5)); out.shadeLin = shade;
      item('keyfill', 'Key / fill contrast', [
        part('keyFillStops', out.keyFillStops, [0.7, 1.7, 2.8], 'lit face vs shaded face, linear stops'),
        part('rangeStops', out.rangeStops, [3.0, 5.0, 7.0], 'p99 / p1 whole frame, stops'),
        part('shadeAlive', out.shadeLin * 1000, [1.5, 4, 10], 'shaded face linear x1000 (fill must not crush to 0)')]);
    }

    /* 3 shadows / contact ------------------------------------------------- */
    if (R.shadow && R.litRef && R.contact) {
      const m = r => { const [x0, y0, x1, y1] = rect(r, W, H); let s = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += LIN[Math.round(Y[y * W + x])]; n++; } return s / Math.max(n, 1); };
      out.shadowRatio = m(R.litRef) / Math.max(m(R.shadow), 1e-5);
      const prof = smooth(lineProfile(P, R.contact.p0, R.contact.p1, 64, 0, 2), 1), lin = prof.map(v => LIN[clamp(Math.round(v), 0, 255)]);
      if (opt.debug) out.contactProfile = prof.map(v => Math.round(v));
      const far = mean(lin.slice(-8)) || 1e-5;
      out.contactDark = mean(lin.slice(0, 3)) / far;
      let up = 0, tot = 0; for (let i = 1; i < 40; i++) { tot++; if (lin[i] >= lin[i - 1] * 0.985) up++; }
      out.penumbraMono = up / tot;
      /* peter-panning: a bright sliver between the object and its shadow = a drop in brightness moving away from contact */
      let gap = 0; for (let i = 1; i < 16; i++) gap = Math.max(gap, (lin[i - 1] - lin[i]) / far); out.contactGap = gap;
      item('shadow', 'Shadows & contact', [
        part('shadowRatio', out.shadowRatio, [1.6, 3.5, 7], 'lit / shadowed bench, linear'),
        part('contactDark', out.contactDark, [0.75, 0.42, 0.18], 'contact strip / open bench (lower is better)'),
        part('penumbraMono', out.penumbraMono, [0.6, 0.8, 0.95], 'penumbra rises monotonically from contact'),
        part('contactGap', out.contactGap, [0.30, 0.10, 0.02], 'bright sliver at the base = peter-panning (lower is better)')]);
    }

    /* 4 volumetric shafts + dust ----------------------------------------- */
    if (R.shaft) {
      const s = R.shaft, n = 48;
      const ax = smooth(lineProfile(P, s.p0, s.p1, n, 0, 3), 1);
      let off;
      if (s.ref) off = smooth(lineProfile(P, s.ref.p0, s.ref.p1, n, 0, 3), 1);                    /* same heights, out of the beam */
      else { const o1 = lineProfile(P, s.p0, s.p1, n, s.off, 3), o2 = lineProfile(P, s.p0, s.p1, n, -s.off, 3); off = o1.map((v, i) => (v + o2[i]) / 2); }
      const d = ax.map((v, i) => v - off[i]);
      out.shaftDelta = mean(d); out.shaftPeak = Math.max(...d);
      const ds = smooth(d, 2); let r2 = 0; for (let i = 1; i < n - 1; i++) r2 += Math.abs(ds[i - 1] - 2 * ds[i] + ds[i + 1]);
      out.shaftRough = (r2 / (n - 2)) / Math.max(out.shaftPeak, 1);
      /* dust: soft specks brighter than their local mean, inside the beam volume minus a reference patch of dark wall outside it */
      const specks = r => { const [x0, y0, x1, y1] = rect(r, W, H); let c = 0, tot = 0;
        for (let y = Math.max(y0, 7); y < Math.min(y1, H - 7); y++) for (let x = Math.max(x0, 7); x < Math.min(x1, W - 7); x++) { tot++; if (Y[y * W + x] - boxAt(I1, W, H, x, y, 3) > 6) c++; }
        return c / Math.max(tot, 1); };
      out.dustFrac = R.dust ? Math.max(0, specks(R.dust.rect) - specks(R.dust.ref)) : 0;
      item('shafts', 'Volumetric shafts & dust', [
        part('shaftDelta', out.shaftDelta, [1.2, 4, 9], 'levels above the parallel off-axis strips; above 35 the beam is washing the blacks', [35, 70]),
        part('shaftRough', out.shaftRough, [0.5, 0.22, 0.08], 'jaggedness of the falloff (lower is better)'),
        part('dustFrac', out.dustFrac, [0.0002, 0.001, 0.003], 'soft specks 6+ levels above their 7 px neighbourhood, inside the beam minus a dark-wall patch')]);
    }

    /* 5 background rays --------------------------------------------------- */
    if (R.bgRays) {
      const b = R.bgRays, prof = smooth(lineProfile(P, b.p0, b.p1, 96, 0, Math.max(2, b.k || 10)), 1);
      const sp = prof.slice().sort((a, c) => a - c); out.rayContrast = sp[Math.floor(sp.length * 0.92)] - sp[Math.floor(sp.length * 0.08)];
      let peaks = 0; const sm2 = smooth(prof, 2); for (let i = 3; i < sm2.length - 3; i++) if (sm2[i] > sm2[i - 3] + 0.7 && sm2[i] > sm2[i + 3] + 0.7 && sm2[i] >= sm2[i - 1] && sm2[i] > sm2[i + 1]) peaks++;
      out.rayPeaks = peaks;
      item('rays', 'Background rays', [
        part('rayContrast', out.rayContrast, [1.0, 3.0, 6.5], 'p92-p8 across the wall band, levels; above 45 the rays are a wall of glare', [45, 90]),
        part('rayPeaks', out.rayPeaks, [1, 2, 4], 'distinct bands across the wall')]);
    }

    /* 6 colour / tone mapping -------------------------------------------- */
    {
      const parts = [
        part('clipPct', out.clipPct, [4, 1.2, 0.25], '% of pixels with any channel >= 254 (lower is better)'),
        part('p1', out.p1, [34, 18, 7], 'black point: p1 luma. High = volumetrics/ambient washed the blacks (lower is better)'),
        part('crushPct', out.crushPct, [45, 22, 8], '% pixels < 2 (lower is better; a dark room still needs shadow detail)')];
      if (R.litRef && R.shadow) {
        const wb = r => { const [x0, y0, x1, y1] = rect(r, W, H); let s = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += P.R[y * W + x] - P.B[y * W + x]; n++; } return s / Math.max(n, 1); };
        out.warmCool = wb(R.litRef) - wb(R.shadow);
        parts.push(part('warmCool', out.warmCool, [1, 8, 18], 'R-B of the same bench in light minus in shadow: warm key over a cool fill'));
      }
      if (R.wall) {   /* posterisation: share of pixels sitting in long horizontal runs of one identical RGB triple */
        const [x0, y0, x1, y1] = rect(R.wall, W, H); let flat = 0, tot = 0;
        for (let y = y0; y < y1; y += 2) { let run = 1;
          for (let x = x0 + 1; x <= x1; x++) {
            const same = x < x1 && rgba[(y * W + x) * 4] === rgba[(y * W + x - 1) * 4] && rgba[(y * W + x) * 4 + 1] === rgba[(y * W + x - 1) * 4 + 1] && rgba[(y * W + x) * 4 + 2] === rgba[(y * W + x - 1) * 4 + 2];
            if (same) run++; else { if (run >= 6 && rgba[(y * W + x - 1) * 4 + 1] > 5) flat += run; run = 1; } tot++; } }
        out.flatRun = flat / Math.max(tot, 1);
        parts.push(part('flatRun', out.flatRun, [0.5, 0.2, 0.04], 'share of wall pixels in runs of 6+ identical values = 8-bit banding (lower is better)'));
      }
      item('tone', 'Colour & tone mapping', parts);
    }

    /* 7 texture resolution / texel density -------------------------------- */
    if (R.grain) {
      const [x0, y0, x1, y1] = rect(R.grain.rect, W, H); let e = 0, n = 0;
      for (let y = y0 + 1; y < y1 - 1; y++) for (let x = x0 + 1; x < x1 - 1; x++) { const i = y * W + x, l = Y[i] * 4 - Y[i - 1] - Y[i + 1] - Y[i - W] - Y[i + W]; e += l * l; n++; }
      out.fineStd = Math.sqrt(e / n) / 2;
      const parts = [part('fineStd', out.fineStd, [0.5, 1.4, 3.2], '1-px Laplacian std in levels (sharp, not blurry)')];
      if (opt.texelPerPx != null) { out.texelPerPx = opt.texelPerPx; parts.push(part('texelPerPx', opt.texelPerPx, [0.45, 0.9, 1.6], 'source texels per device pixel at the finest grain band; <1 = magnified (soft)')); }
      if (opt.shimmer != null) { out.shimmer = opt.shimmer; parts.push(part('shimmer', opt.shimmer, [3.2, 1.9, 1.15], 'half-pixel shift diff / expected from gradient; >2 = minification shimmer (lower is better)')); }
      item('texture', 'Texture resolution & texel density', parts);
    }

    /* 8 specular / roughness realism ------------------------------------- */
    if (R.spec) {
      const [x0, y0, x1, y1] = rect(R.spec, W, H), lin = [], hpv = [];
      let clip = 0, n = 0;
      for (let y = y0 + 4; y < y1 - 4; y += 2) for (let x = x0 + 4; x < x1 - 4; x += 2) {
        lin.push(LIN[Math.round(boxAt(I1, W, H, x, y, 6))]);           /* blurred: the broad sheen, not the grain */
        const q = Y[y * W + x]; hpv.push(q - boxAt(I1, W, H, x, y, 3));
        const i = (y * W + x) * 4; if (rgba[i] >= 250 && rgba[i + 1] >= 245) clip++; n++;
      }
      lin.sort((a, c) => a - c);
      const at = q => lin[Math.min(lin.length - 1, Math.floor(lin.length * q))];
      out.sheenSpread = at(0.95) / Math.max(at(0.25), 1e-5);
      out.paintClip = clip / Math.max(n, 1);
      /* roughness breakup: local texture inside the brightest quartile of the sheen */
      let s = 0, c = 0, mu = 0; const thr = at(0.75); let k = 0;
      for (let y = y0 + 4; y < y1 - 4; y += 2) for (let x = x0 + 4; x < x1 - 4; x += 2) { if (LIN[Math.round(boxAt(I1, W, H, x, y, 6))] >= thr) { s += hpv[k] * hpv[k]; mu += Y[y * W + x]; c++; } k++; }
      out.hlBreakup = c ? Math.sqrt(s / c) / Math.max(mu / c, 1) : 0;
      item('spec', 'Specular & roughness realism', [
        part('sheenSpread', out.sheenSpread, [1.06, 1.3, 1.9], 'p95 / p25 of the blurred wood in linear light: a sheen that travels across the board'),
        part('paintClip', out.paintClip, [0.05, 0.01, 0.0005], 'share of near-white pixels in the wood = plastic paint, not oil (lower is better)'),
        part('hlBreakup', out.hlBreakup, [0.004, 0.018, 0.045], 'grain texture surviving inside the sheen: roughness map breaking it up')]);
    }

    const ss = items.map(i => i.score).filter(s => s != null);
    return { metrics: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Array.isArray(v) ? v : +(+v).toFixed(4)])), items, total: ss.length ? +mean(ss).toFixed(2) : null, min: ss.length ? +Math.min(...ss).toFixed(2) : null };
  }
  return { measure, anchor };
});
