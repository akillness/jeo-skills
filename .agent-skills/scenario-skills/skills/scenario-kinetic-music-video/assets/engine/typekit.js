// Kinetic typography kit (Canvas2D side). All timing is driven by lyric word onsets from E.words.
// House rules (see STYLE.md): words land ON their onset (visual peak at w.s, entry starts ~3 frames earlier),
// spring overshoot, exits 3x faster than entries, never exit mid-syllable.
import * as THREE from "three";
import { clamp, spring, PAL } from "./core.js";

export function stretchKW(v) {
  if (!v || v === "normal") return "normal";
  if (typeof v === "string" && !v.endsWith("%")) return v;
  const x = parseFloat(v);
  const K = [
    [50, "ultra-condensed"],
    [62.5, "extra-condensed"],
    [75, "condensed"],
    [87.5, "semi-condensed"],
    [100, "normal"],
    [112.5, "semi-expanded"],
    [125, "expanded"],
    [150, "extra-expanded"],
  ];
  let b = K[0];
  for (const k of K) if (Math.abs(k[0] - x) < Math.abs(b[0] - x)) b = k;
  return b[1];
}
export const LEAD = 0.05; // seconds a word starts animating before its sung onset (~3 frames @60)

// Scale curve for a word pop around onset s: tiny anticipation dip, spring overshoot, settle.
export function popScale(
  t,
  s,
  { k = 300, z = 0.38, from = 0.0, antic = 0.06 } = {},
) {
  const dt = t - (s - LEAD);
  if (dt < 0) return from;
  return (
    from +
    (1 - from) * spring(dt, k, z) -
    antic * Math.exp(-dt * 40) * Math.sin(Math.min(dt * 40, Math.PI))
  );
}
// Alpha envelope: in over 2 frames from (s-LEAD), out over `out` seconds after `e`.
export function wordAlpha(t, s, e, { out = 0.12, hold = 0.0 } = {}) {
  const a = clamp((t - (s - LEAD)) / 0.035);
  const b = 1 - clamp((t - (e + hold)) / out);
  return Math.min(a, b);
}

export function fontStr({
  font = "Archivo",
  size = 120,
  weight = 900,
  italic = false,
} = {}) {
  return `${italic ? "italic " : ""}${weight} ${Math.round(size)}px "${font}"`;
}

// Immediate-mode word draw with transform. o: {font,size,weight,stretch('75%'..'125%'),tracking(em),color,alpha,align('center'|'left'|'right'),baseline,sx,sy,rot,skewX,stroke,strokeColor,strokeOnly,glow,glowColor,italic}
export function drawText(ctx, text, x, y, o = {}) {
  ctx.save();
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  if (o.skewX) ctx.transform(1, 0, o.skewX, 1, 0, 0);
  ctx.scale(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1);
  ctx.font = fontStr(o);
  ctx.fontStretch = stretchKW(o.stretch);
  ctx.letterSpacing = `${(o.tracking ?? 0) * (o.size ?? 120)}px`;
  ctx.textAlign = o.align ?? "center";
  ctx.textBaseline = o.baseline ?? "middle";
  ctx.globalAlpha = clamp(o.alpha ?? 1);
  if (o.glow) {
    ctx.shadowColor = o.glowColor ?? o.color ?? PAL.accent;
    ctx.shadowBlur = o.glow;
  }
  if (o.stroke) {
    ctx.lineWidth = o.stroke;
    ctx.strokeStyle = o.strokeColor ?? o.color ?? PAL.accent;
    ctx.lineJoin = "miter";
    ctx.strokeText(text, 0, 0);
  }
  if (!o.strokeOnly) {
    ctx.fillStyle = o.color ?? PAL.white;
    ctx.fillText(text, 0, 0);
  }
  ctx.restore();
}
export function measure(ctx, text, o = {}) {
  ctx.save();
  ctx.font = fontStr(o);
  ctx.fontStretch = stretchKW(o.stretch);
  ctx.letterSpacing = `${(o.tracking ?? 0) * (o.size ?? 120)}px`;
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

// Largest size, up to o.size, at which `text` fits maxW: hero type sized for 1920 wide overflows a portrait canvas.
export function fitSize(ctx, text, o, maxW) {
  const size = o.size ?? 120;
  const w = measure(ctx, text, { ...o, size });
  return w > maxW ? size * (maxW / w) : size;
}

// Per-letter staggered pop. Letters of `text` start at s + i*stagger. o.dy = vertical travel in px, o.jitter.
export function drawStagger(ctx, text, x, y, t, s, o = {}) {
  const st = o.stagger ?? 0.025,
    chars = [...text];
  const widths = chars.map((c) => measure(ctx, c, o));
  const tot = widths.reduce((a, b) => a + b, 0);
  let cx = o.align === "left" ? x : o.align === "right" ? x - tot : x - tot / 2;
  chars.forEach((ch, i) => {
    const si = s + i * st;
    const sc = popScale(t, si, o.spring);
    const al =
      wordAlpha(t, si, o.e ?? 1e9, { out: o.out ?? 0.1 }) * (o.alpha ?? 1);
    const dy = (1 - clamp(sc)) * (o.dy ?? 60);
    if (al > 0.001)
      drawText(ctx, ch, cx + widths[i] / 2, y + dy, {
        ...o,
        align: "center",
        s: Math.max(0, sc) * (o.s ?? 1),
        alpha: al,
      });
    cx += widths[i];
  });
  return tot;
}

// Karaoke line: all words laid out; each lights up (color + punch) at its onset. Returns layout boxes.
// o.maxW shrinks the whole line to fit that width (a long line on a narrow portrait canvas) instead of running off it.
export function drawKaraoke(ctx, E, line, t, o = {}) {
  let size = o.size ?? 64;
  let gap = size * (o.gap ?? 0.28);
  const ws = line.words.map((w) => ({
    ...w,
    txt: o.upper === false ? w.w : w.w.toUpperCase(),
  }));
  let widths = ws.map((w) => measure(ctx, w.txt, { ...o, size }));
  let tot = widths.reduce((a, b) => a + b, 0) + gap * (ws.length - 1);
  if (o.maxW > 0 && tot > o.maxW) {
    const k = o.maxW / tot; // width scales linearly with size, tracking included
    size *= k;
    gap *= k;
    widths = widths.map((w) => w * k);
    tot = o.maxW;
  }
  let x =
    o.align === "left" ? o.x : o.align === "right" ? o.x - tot : o.x - tot / 2;
  const boxes = [];
  const lineA =
    clamp((t - (line.s - (o.lineLead ?? 0.25))) / 0.08) *
    (1 - clamp((t - (line.e + (o.tail ?? 0.25))) / 0.1));
  ws.forEach((w, i) => {
    const lit = t >= w.s - LEAD;
    const p = lit ? popScale(t, w.s, { from: 0.9 }) : 0.9;
    const col = lit
      ? (o.litColor ?? PAL.white)
      : (o.dimColor ?? "rgba(255,176,0,0.28)");
    drawText(ctx, w.txt, x + widths[i] / 2, o.y, {
      ...o,
      align: "center",
      size,
      s: p,
      color: col,
      alpha: lineA * (o.alpha ?? 1),
      glow: lit ? o.glow : 0,
    });
    boxes.push({ x, w: widths[i], word: w });
    x += widths[i] + gap;
  });
  return boxes;
}

// House subtitle: small mono uppercase, bottom-left of the safe band, sung words bright, upcoming words dim. The HUD
// draws this automatically when E.hud.sub is true; scenes that show the lyric big should set E.hud.sub = false.
export function drawSubtitle(ctx, E, t, o = {}) {
  t = E.atFrame(t); // the output frame's time inside a motion-blur sample, so the subtitle stays sharp
  const ln = E.lineAt(t, 0.25);
  if (!ln || t > ln.e + 0.5) return;
  const R = E.SAFE,
    S = E.SCALE;
  // 990 keeps a 1080-high full-frame canvas exactly where it was at any --scale; elsewhere 90 px above the band's bottom
  const legacy = E.CANVAS[1] === 1080 && R.y === 0 && R.h === E.H;
  const size = (o.size ?? 26) * S;
  const x = o.x != null ? o.x * S : R.x + 96 * S,
    y = o.y != null ? o.y * S : legacy ? 990 * S : R.y + R.h - 90 * S;
  const fade =
    clamp((t - (ln.s - 0.25)) / 0.08) * (1 - clamp((t - (ln.e + 0.35)) / 0.15));
  ctx.save();
  ctx.globalAlpha = fade * (o.alpha ?? 1);
  ctx.fillStyle = PAL.accent;
  ctx.fillRect(x - 18 * E.SCALE, y - size * 0.55, 4 * E.SCALE, size * 1.1);
  drawKaraoke(ctx, E, ln, t, {
    x,
    y,
    size,
    font: "JetBrains Mono",
    weight: 600,
    align: "left",
    tracking: 0.06,
    gap: 0.55,
    litColor: PAL.white,
    dimColor: "rgba(255,176,0,0.35)",
    lineLead: 0.25,
    tail: 0.35,
    alpha: o.alpha, // drawText sets globalAlpha outright, so the words need o.alpha passed, not just set above
    maxW:
      o.maxW ??
      (E.ORIENT === "landscape"
        ? undefined
        : Math.max(0, R.x + R.w - x - 52 * S)),
  });
  ctx.restore();
}

// Fullscreen HDR blit of a G2D canvas texture into the current render target. intensity>1 makes it bloom.
const _blit = {};
export function blitG2D(
  E,
  g,
  intensity = 1.0,
  blending = THREE.NormalBlending,
) {
  if (!_blit.scene) {
    _blit.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    _blit.mat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    _blit.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), _blit.mat);
    _blit.scene = new THREE.Scene();
    _blit.scene.add(_blit.mesh);
  }
  _blit.mat.map = g.tex;
  _blit.mat.color.setScalar(intensity);
  _blit.mat.blending = blending;
  _blit.mat.premultipliedAlpha = false;
  _blit.mat.needsUpdate = true;
  E.renderer.render(_blit.scene, _blit.cam);
}
