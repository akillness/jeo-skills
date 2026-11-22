// Persistent frame (z=100). It holds 2D, 3D and footage sections together as one piece, and its subtitle
// track guarantees every sung word is readable somewhere. All content comes from `HUD` in engine/timeline.js.
// It lays out inside E.SAFE, so on a 9:16 canvas nothing sits under the platform's own UI.
// Scenes steer it per frame:
//   E.hud = { alpha:1, sub:true, corners:true, label:'', theme:'dark'|'light', ink:null, accent:null }
//   theme 'dark' = light ink for dark frames (default), 'light' = dark ink for white/colour frames. ink/accent override colours.
// HUD config (timeline.js):
//   title      'SONG TITLE'                      top-left
//   mark       null | { path:'M0 0L10 5…', w:10, h:10, alphas?:[…] }  optional glyph left of the title (SVG path d, drawn with Path2D;
//              `alphas` repeats the path stacked with those opacities, e.g. a layered logo mark). Brand marks: official paths only.
//   sections   [[t, 'CODE'], …]                  top-right section code, plus BAR n/N and 4 beat squares
//   counters   [{ label:'COUNT', keys:[[t, v], …], interp:'lin'|'log', fmt:'int'|'short'|'sci'|'clock'|'text', suffix:'', texts:[] }]
//              bottom-right, stacked upwards. This is where the video's "spine" usually lives (a clock, a countdown, a counter).
//              'clock' = value in minutes after midnight -> HH:MM:SS (+ suffix). 'text' = texts[floor(value)].
//   progress   true                              bottom-left song progress hairline
//   dark/light { ink, accent, sub }              optional theme colours
import { PAL, clamp } from "../core.js";
import * as TL from "../timeline.js";
const CFG = {
  title: "UNTITLED",
  mark: null,
  sections: [[0, "SECTION_01"]],
  counters: [],
  progress: true,
  ...(TL.HUD ?? {}),
};
let g,
  markPath = null;
const pad2 = (n) => String(Math.floor(n)).padStart(2, "0");
function keyed(K, t, interp) {
  if (!K || !K.length) return 0;
  if (t <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++)
    if (t <= K[i][0]) {
      const [a, b] = K[i - 1],
        [c, d] = K[i],
        u = (t - a) / (c - a);
      if (!isFinite(d)) return u < 1 ? b : d;
      return interp === "log" && b > 0 && d > 0
        ? Math.exp(Math.log(b) + (Math.log(d) - Math.log(b)) * u)
        : b + (d - b) * u;
    }
  return K[K.length - 1][1];
}
function fmt(v, c) {
  const f = c.fmt ?? "int";
  if (f === "text") return (c.texts ?? [])[Math.max(0, Math.floor(v))] ?? "";
  if (!isFinite(v) || v >= 1e15) return "∞";
  if (f === "clock") {
    const s = Math.max(0, v) * 60;
    return `${pad2((s / 3600) % 24)}:${pad2((s / 60) % 60)}:${pad2(s % 60)}`;
  }
  if (f === "sci") {
    if (v < 1e6) return Math.floor(v).toLocaleString("en-US");
    const e = Math.floor(Math.log10(v));
    return (v / 10 ** e).toFixed(2) + "E" + e;
  }
  if (f === "short" && v >= 1e5) {
    for (const [d, k] of [
      [1e12, "T"],
      [1e9, "B"],
      [1e6, "M"],
      [1e3, "K"],
    ])
      if (v >= d) return (v / d).toFixed(v / d < 10 ? 2 : 1) + k;
  }
  return Math.floor(v).toLocaleString("en-US");
}

export default {
  blur: false, // renders once per frame under motion blur, so its digits stay sharp; a TIMELINE entry's blur overrides it
  async load(E) {
    g = E.makeG2D(E.W, E.H);
    if (CFG.mark?.path) markPath = new Path2D(CFG.mark.path);
  },
  render(E, t, rt) {
    const H = E.hud;
    if (H.alpha <= 0.001 && !E.debugSafe) return 0; // --safe still outlines the band when a scene hides the HUD
    const S = E.SCALE,
      c = g.ctx;
    g.clear();
    c.save();
    const dark = (H.theme ?? "dark") !== "light",
      TH = (dark ? CFG.dark : CFG.light) ?? {};
    const ink = H.ink ?? TH.ink ?? (dark ? PAL.white : PAL.ink),
      acc = H.accent ?? TH.accent ?? (dark ? PAL.accent : PAL.ink);
    let si = 0;
    CFG.sections.forEach((s, i) => {
      if (t >= s[0]) si = i;
    });
    const sec = CFG.sections[si];
    // Everything anchors to the safe band (the full frame on landscape, inside the platform UI on 9:16).
    const R = E.SAFE,
      left = R.x,
      top = R.y,
      right = R.x + R.w,
      bottom = R.y + R.h;
    const M = 40 * S,
      L = 22 * S;
    c.textBaseline = "middle";
    c.letterSpacing = `${1.8 * S}px`;
    c.shadowColor = dark ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.6)";
    c.shadowBlur = 8 * S; // legible over footage
    if (H.corners !== false) {
      c.globalAlpha = 0.7 * H.alpha;
      c.strokeStyle = ink;
      c.lineWidth = 1.5 * S;
      [
        [left + M, top + M, 1, 1],
        [right - M, top + M, -1, 1],
        [left + M, bottom - M, 1, -1],
        [right - M, bottom - M, -1, -1],
      ].forEach(([x, y, sx, sy]) => {
        c.beginPath();
        c.moveTo(x, y + sy * L);
        c.lineTo(x, y);
        c.lineTo(x + sx * L, y);
        c.stroke();
      });
      c.font = `600 ${14 * S}px "JetBrains Mono"`;
      c.fillStyle = ink;
      const ly = top + M + 12 * S;
      let lx = left + M + 12 * S;
      // top-left: optional mark + title
      if (markPath) {
        const mh = 14 * S,
          k = mh / CFG.mark.h,
          al = CFG.mark.alphas ?? [1];
        al.forEach((a, j) => {
          c.save();
          c.translate(lx, ly - mh / 2 - j * mh * 0.24);
          c.scale(k, k);
          c.globalAlpha = a * H.alpha;
          c.fillStyle = ink;
          c.fill(markPath);
          c.restore();
        });
        lx += CFG.mark.w * k + 10 * S;
      }
      c.globalAlpha = 0.9 * H.alpha;
      c.textAlign = "left";
      c.fillText(CFG.title, lx, ly);
      // top-right: section code + bar counter with beat squares
      c.textAlign = "right";
      const b = E.beat(t);
      const bars = CFG.bars ?? E.A?.downbeats?.length ?? 0;
      c.fillText(
        `${pad2(si + 1)} ${sec[1]}${H.label ? "  ·  " + H.label : ""}`,
        right - M - 12 * S,
        ly,
      );
      c.globalAlpha = 0.6 * H.alpha;
      c.fillText(
        `BAR ${pad2(Math.max(1, b.bar + 1))}/${bars}`,
        right - M - 12 * S - 66 * S,
        ly + 22 * S,
      );
      for (let k = 0; k < 4; k++) {
        c.globalAlpha = (k === b.inBar ? 1 : 0.25) * H.alpha;
        c.fillStyle = k === b.inBar ? acc : ink;
        c.fillRect(
          right - M - 12 * S - (3 - k) * 14 * S - 9 * S,
          ly + 17 * S,
          9 * S,
          9 * S,
        );
      }
      // bottom-right: counters (the spine), stacked upwards
      const by = bottom - M - 12 * S;
      (CFG.counters ?? []).forEach((ct, j) => {
        c.globalAlpha = (j === 0 ? 0.9 : 0.6) * H.alpha;
        c.fillStyle = ink;
        c.fillText(
          `${ct.label ? ct.label + " " : ""}${fmt(keyed(ct.keys, t, ct.interp), ct)}${ct.suffix ?? ""}`,
          right - M - 12 * S,
          by - j * 20 * S,
        );
      });
      // bottom-left: progress hairline
      if (CFG.progress !== false) {
        const p = clamp(t / E.dur),
          px = left + M + 12 * S,
          pw = 220 * S;
        c.globalAlpha = 0.25 * H.alpha;
        c.fillStyle = ink;
        c.fillRect(px, by, pw, 2 * S);
        c.globalAlpha = 0.9 * H.alpha;
        c.fillStyle = acc;
        c.fillRect(px, by, pw * p, 2 * S);
      }
    }
    c.restore();
    if (H.sub) drawSub(c, E, t, H, dark, ink, TH.sub ?? acc);
    if (E.debugSafe) {
      c.save();
      c.strokeStyle = "#ff00ff";
      c.lineWidth = 2 * S;
      c.setLineDash([12 * S, 8 * S]);
      c.strokeRect(E.SAFE.x, E.SAFE.y, E.SAFE.w, E.SAFE.h);
      c.restore();
    }
    g.commit();
    E.renderer.setRenderTarget(rt);
    E.blitG2D(E, g, 1.0);
  },
};
// subtitle track: karaoke mono line, bottom-left above the progress line; off landscape it shrinks to fit the safe band
// and rises above the counter stack, since a band-wide line would run into the counters at bottom-right
function drawSub(c, E, t, H, dark, ink, bar) {
  const ln = E.lineAt(t, 0.25);
  if (!ln || t > ln.e + 0.5) return;
  const S = E.SCALE,
    R = E.SAFE,
    wide = E.ORIENT === "landscape",
    lift = wide ? 92 : Math.max(92, 61 + 20 * (CFG.counters ?? []).length);
  const size = 24 * S,
    x = R.x + 92 * S,
    y = R.y + R.h - lift * S,
    maxW = wide ? undefined : R.w - 92 * S - 52 * S;
  const fade =
    clamp((t - (ln.s - 0.25)) / 0.08) * (1 - clamp((t - (ln.e + 0.35)) / 0.15));
  c.save();
  c.globalAlpha = fade * H.alpha;
  c.fillStyle = bar;
  c.fillRect(x - 16 * S, y - size * 0.55, 4 * S, size * 1.1);
  E.drawKaraoke(c, E, ln, t, {
    x,
    y,
    size,
    font: "JetBrains Mono",
    weight: 600,
    align: "left",
    tracking: 0.05,
    gap: 0.55,
    litColor: ink,
    dimColor: dark ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.3)",
    lineLead: 0.25,
    tail: 0.35,
    maxW,
    // drawText sets globalAlpha outright, so the words need the HUD's alpha passed; not `fade`, which
    // drawKaraoke's own line fade (lineLead, tail) already applies
    alpha: H.alpha,
  });
  c.restore();
}
