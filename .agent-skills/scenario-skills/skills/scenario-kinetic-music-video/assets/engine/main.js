// Kinetic-music-video engine: compositor, post pipeline, deterministic frame API. With motion blur on, each frame's
// pass is followed by sub-frame samples of its blurred layers, averaged in a float target before post (blur.js).
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { TexturePass } from "three/addons/postprocessing/TexturePass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import * as core from "./core.js";
import * as TL from "./timeline.js";
const TIMELINE = TL.TIMELINE;
import * as roto from "./roto.js";
import * as typekit from "./typekit.js";
import * as plate from "./plate.js";
import * as cv from "./canvas.js";
import * as blur from "./blur.js";

const Q = new URLSearchParams(location.search);
const SCALE = parseFloat(Q.get("scale") ?? "1");
// A bad canvas value must reach window.__error (render.mjs reports it) instead of killing the module before boot.
let CANVAS = cv.PRESETS.landscape,
  canvasError = null;
try {
  CANVAS = cv.resolveCanvas(Q.get("canvas"), TL.CANVAS);
} catch (e) {
  canvasError = e;
}
const even = (n) => Math.max(2, 2 * Math.round(n / 2)); // H.264 4:2:0 needs even sides at every --scale
const W = even(CANVAS[0] * SCALE),
  H = even(CANVAS[1] * SCALE);
// orientation and band come from the canvas, not the rounded preview size, so --scale never changes which entries render
const ORIENT = cv.orientation(CANVAS[0], CANVAS[1]);
const SAFE = cv.safeRect(W, H, cv.safeInsets(CANVAS[0], CANVAS[1], TL.SAFE));
const ONLY = Q.get("only") ? Q.get("only").split(",") : null;
const PLAY = Q.get("play");
let BLUR = blur.DEFAULTS,
  blurError = null;
try {
  BLUR = blur.resolveBlur(
    {
      blur: Q.get("blur"),
      shutter: Q.get("shutter"),
      blurmax: Q.get("blurmax"),
    },
    TL.BLUR,
    SCALE,
  );
} catch (e) {
  blurError = e;
}

const canvas = document.getElementById("c");
canvas.width = W;
canvas.height = H;
canvas.style.width = W + "px";
canvas.style.height = H + "px";
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  preserveDrawingBuffer: true,
  powerPreference: "high-performance",
  alpha: false,
});
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // final shader does sRGB encode itself
renderer.toneMapping = THREE.NoToneMapping;
renderer.autoClear = false;

const mkRT = (samples = 4) =>
  new THREE.WebGLRenderTarget(W, H, {
    type: THREE.HalfFloatType,
    samples,
    colorSpace: THREE.LinearSRGBColorSpace,
    depthBuffer: true,
  });
const accum = mkRT(0);
const _emptyScene = new THREE.Scene(),
  _emptyCam = new THREE.OrthographicCamera();
const layerRTs = [];
const getLayerRT = (i) => (layerRTs[i] ??= mkRT(4));

// ---- composite layers into accum
const compMat = new THREE.ShaderMaterial({
  uniforms: { tex: { value: null }, opacity: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
  fragmentShader: `uniform sampler2D tex; uniform float opacity; varying vec2 vUv; void main(){ vec4 c=texture2D(tex,vUv); gl_FragColor=vec4(c.rgb*opacity, c.a*opacity); }`,
  depthTest: false,
  depthWrite: false,
  transparent: true,
});
const quad = new core.FSQuad(compMat);
function blendFor(mode) {
  compMat.blending = THREE.CustomBlending;
  if (mode === "add") {
    compMat.blendSrc = THREE.OneFactor;
    compMat.blendDst = THREE.OneFactor;
  } else if (mode === "screen") {
    compMat.blendSrc = THREE.OneFactor;
    compMat.blendDst = THREE.OneMinusSrcColorFactor;
  } else if (mode === "multiply") {
    compMat.blendSrc = THREE.DstColorFactor;
    compMat.blendDst = THREE.ZeroFactor;
  } else {
    compMat.blendSrc = THREE.OneFactor;
    compMat.blendDst = THREE.OneMinusSrcAlphaFactor;
  } // premultiplied normal
  compMat.blendEquation = THREE.AddEquation;
  compMat.needsUpdate = true;
}

// ---- post
const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType }),
);
composer.setPixelRatio(1);
composer.setSize(W, H);
const texPass = new TexturePass(accum.texture);
composer.addPass(texPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.0, 0.55, 1.05);
// Above scale 1 (the 4K master) the bloom runs at the scale-1 size, since UnrealBloomPass blurs in texels of its own
// targets; its bright pass then averages each SCALE x SCALE cell instead of reading only its middle, so a thin line keeps
// a steady glow as it moves. The engine supplies that whole bright pass (three's LuminosityHighPassShader with the
// averaged read), so a three release that reformats its shader text cannot break it; it relies only on the uniforms
// UnrealBloomPass feeds. Three's shaders run untouched at scale 1 or below.
let scaleError = null;
if (SCALE > 1) {
  const setSize = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) =>
    setSize(Math.round(w / SCALE), Math.round(h / SCALE));
  const hp = bloom.materialHighPassFilter,
    fed = [
      "tDiffuse",
      "luminosityThreshold",
      "smoothWidth",
      "defaultColor",
      "defaultOpacity",
    ];
  if (hp?.uniforms && fed.every((k) => k in hp.uniforms)) {
    hp.vertexShader = `varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
    hp.fragmentShader = `uniform sampler2D tDiffuse; uniform vec3 defaultColor;
      uniform float defaultOpacity, luminosityThreshold, smoothWidth; varying vec2 vUv;
      void main(){
        vec2 o = ${(SCALE / 2).toFixed(4)} / vec2(textureSize(tDiffuse, 0));
        vec4 texel = 0.25 * (texture2D(tDiffuse, vUv - o) + texture2D(tDiffuse, vUv + o)
          + texture2D(tDiffuse, vUv + vec2(o.x, -o.y)) + texture2D(tDiffuse, vUv + vec2(-o.x, o.y)));
        float v = luminance(texel.xyz);
        vec4 outputColor = vec4(defaultColor.rgb, defaultOpacity);
        float alpha = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v);
        gl_FragColor = mix(outputColor, texel, alpha);
      }`;
    hp.needsUpdate = true;
  } else
    scaleError = new Error(
      `--scale ${SCALE}: this three.js changed UnrealBloomPass's bright pass uniforms; update the 4K bloom fix in main.js`,
    );
}
composer.addPass(bloom);
// Above scale 1, grain and scanlines keep their scale-1 cells, so the 4K master carries the approved texture
const FC =
  SCALE > 1
    ? `(floor(gl_FragCoord.xy / ${SCALE.toFixed(4)}) + 0.5)`
    : "gl_FragCoord.xy";
const FCY =
  SCALE > 1
    ? `(floor(gl_FragCoord.y / ${SCALE.toFixed(4)}) + 0.5)`
    : "gl_FragCoord.y";
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(W, H) },
    uFrame: { value: 0 },
    uExposure: { value: 1 },
    uCA: { value: 0.0015 },
    uGrain: { value: 0.05 },
    uVig: { value: 0.35 },
    uFlash: { value: 0 },
    uFlashCol: { value: new THREE.Color(1, 0.85, 0.6) },
    uInvert: { value: 0 },
    uPunch: { value: 0 },
    uShake: { value: new THREE.Vector2() },
    uRot: { value: 0 },
    uScan: { value: 0 },
    uGlitch: { value: 0 },
    uAmber: { value: new THREE.Color("#FFA010") },
    uWarm: { value: 0 },
    uLetterbox: { value: 0 },
    uSat: { value: 1 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uFade: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uWarm, uFrame, uExposure, uCA, uGrain, uVig, uFlash, uInvert, uPunch, uRot, uScan, uGlitch, uLetterbox, uSat, uFade;
    uniform vec2 uShake; uniform vec3 uFlashCol, uAmber, uTint; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.); }
    vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c,vec3(1./2.4))-0.055, step(0.0031308,c)); }
    void main(){
      vec2 uv = vUv - 0.5; float asp = uRes.x/uRes.y; uv.x *= asp;
      float cr = cos(uRot), sr = sin(uRot); uv = mat2(cr,-sr,sr,cr)*uv; uv /= (1.0+uPunch); uv.x /= asp; uv += 0.5 + uShake;
      if(uGlitch>0.){ float row=floor(uv.y*38.); float g=h(vec2(row, floor(uFrame/2.))); if(g<uGlitch*0.6){ uv.x += (h(vec2(row,uFrame))-0.5)*0.12*uGlitch; } }
      vec2 d = (uv-0.5); float r2 = dot(d,d);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + d*uCA*(1.+r2*4.)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - d*uCA*(1.+r2*4.)).b;
      col *= uExposure * uTint;
      if (uWarm < 0.5) {
        // grade 'neutral' (default): footage passes through untouched. Values <= 1 are identity (no grade, no tonemap, no clamp).
        // Only HDR graphics (>1) are compressed: hue-preserving, with a white-hot core so neon reads like a tube.
        float mx = max(max(col.r,col.g),col.b); if (mx > 1.0) { float k = 1.0 - 1.0/mx; col = mix(col/mx, vec3(1.0), clamp(k*0.55,0.,1.)); }
      } else {
        // grade 'warm': amber-on-black palettes only. Clamps g<=r, b<=g (kills cool CA fringes), 50% hue-preserving ACES.
        col.g = min(col.g, col.r * 1.02); col.b = min(col.b, col.g * 0.98);
        vec3 a1 = aces(col); float mx = max(max(col.r,col.g),max(col.b,1e-4)); vec3 a2 = col * (aces(vec3(mx)).r / mx); col = mix(a1, a2, 0.5);
      }
      float lum = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(vec3(lum), col, uSat);
      if (uWarm > 0.5) {
        // pull saturated yellows toward amber (ACES turns #FFB000 lemon), then re-clamp blue (kills pink casts on skin)
        float mx=max(col.r,1e-4), mn=min(min(col.r,col.g),col.b); float st=(mx-mn)/mx; col.g = mix(col.g, min(col.g, col.r*0.46), smoothstep(0.5,0.9,st)); col.b = min(col.b, col.g*0.85);
        vec3 inv = mix(uAmber, vec3(0.012,0.006,0.0), smoothstep(0.02,0.6,lum));
        col = mix(col, inv, uInvert);                  // brand-colour poster invert
      } else {
        col = mix(col, vec3(1.0) - col, uInvert);      // true RGB invert (graphics-only frames)
      }
      col += uFlashCol * uFlash;
      col *= 1.0 - uVig * smoothstep(0.15, 0.85, r2*2.2);
      if(uScan>0.) col *= 1.0 - uScan*0.5*(0.5+0.5*sin(${FCY}*3.14159*0.5));
      col = clamp(col,0.,1.);
      col = toSRGB(col);
      col += (h(${FC} + fract(uFrame*0.61803)*100.) - 0.5) * uGrain;
      float lb = uLetterbox * 0.5 * (1.0 - (uRes.x/uRes.y)/2.39);
      if (vUv.y < lb || vUv.y > 1.0-lb) col = vec3(0.);
      gl_FragColor = vec4(col*uFade, 1.0);
    }`,
};
const finalPass = new ShaderPass(FinalShader);
composer.addPass(finalPass);

// Neutral by default so footage is never altered. Projects override per video with `export const POST = {...}` in timeline.js
// (e.g. { grade:'warm', grain:0.045, vignette:0.35, ca:0.0015 } for an all-graphics amber-on-black piece); scenes override per frame.
const POST_DEFAULT = {
  bloom: 0.55,
  bloomRadius: 0.35,
  bloomThreshold: 1.05,
  exposure: 1.0,
  ca: 0,
  grain: 0,
  vignette: 0,
  flash: 0,
  flashCol: [1, 0.82, 0.55],
  invert: 0,
  punch: 0,
  shake: [0, 0],
  rot: 0,
  scan: 0,
  glitch: 0,
  letterbox: 0,
  sat: 1,
  tint: [1, 1, 1],
  fade: 1,
  grade: "neutral",
  invertCol: "#FFA010",
  ...(TL.POST ?? {}),
};

// ---- engine object passed to scenes
const HUD_DEFAULT = { alpha: 1, label: "", sub: true, corners: true };
const E = {
  THREE,
  core,
  renderer,
  W,
  H,
  SCALE,
  CANVAS, // [w, h] at scale 1
  ORIENT, // 'landscape' | 'portrait' | 'square'
  SAFE, // { x, y, w, h } in px: the band platform UI never covers (the full frame unless the canvas is 9:16-tall)
  debugSafe: Q.has("safe"), // still.mjs --safe: the HUD outlines SAFE
  safeCamera: (cam) => cv.centerOnSafe(cam, W, H, SAFE), // centers a PerspectiveCamera's frame on SAFE
  plateFit: cv.plateFit, // E.plateFit(E, v): 'cover' when the clip's shape fits the canvas, else 'contain'
  post: { ...POST_DEFAULT },
  hud: { ...HUD_DEFAULT },
  frame: 0,
  fps: 60,
  // motion blur (ENGINE_API.md, Motion blur): E.t is the sample's time inside a sample, E.frameT the output frame's
  frameT: 0,
  pass: 0, // 0 in the frame pass, 1 and up in its samples
  blur: BLUR, // the resolved settings
  blurring: false, // true while a layer that blurs this frame renders
  atFrame: (t) =>
    E.pass === 0 ? t : t === E.t ? E.frameT : t + (E.frameT - E.t),
  // registered in load(), in global seconds
  cut: (t) => mark("cut", [t], () => BL.extra.push(t)),
  fast: (a, b, n) => mark("fast", [a, b, n], () => BL.fasts.push([a, b, n])),
  shutter: (a, b, k) =>
    mark("shutter", [a, b, k], () => BL.shutters.push([a, b, k])),
  sharp: (a, b) => mark("sharp", [a, b], () => BL.sharps.push([a, b])),
  ...core,
  ...roto,
  ...typekit,
  ...plate,
  roto,
  typekit,
};
window.E = E;
const BL = {
  cuts: [],
  extra: [],
  fasts: [],
  shutters: [],
  sharps: [],
  sealed: false,
};
let floatBlend = false, // EXT_float_blend: samples add by blending into one float target
  acc = null; // the accumulation targets, made on the first frame that blurs
function mark(name, args, add) {
  if (BL.sealed) throw new Error(`E.${name}() belongs in load()`);
  const [a, b, x] = args;
  const ok =
    args.every(Number.isFinite) &&
    (args.length < 2 || a < b) &&
    (name !== "fast" || (Number.isInteger(x) && x >= 2)) &&
    (name !== "shutter" || x >= 1);
  if (!ok)
    throw new Error(
      `E.${name}(${args.join(", ")}): use seconds with start before end${name === "fast" ? ", and a sample count of 2 or more" : name === "shutter" ? ", and a multiplier of 1 or more" : ""}`,
    );
  add();
}

async function boot() {
  if (canvasError) throw canvasError;
  if (scaleError) throw scaleError;
  if (blurError) throw blurError;
  const [A, L] = await Promise.all([
    fetch("/engine/data/audio.json").then((r) => r.json()),
    fetch("/engine/data/lyrics.json").then((r) => r.json()),
  ]);
  Object.assign(E, core.makeTimeline(A, L));
  E.dur = A.duration;
  await Promise.all([
    document.fonts.load("900 100px Archivo"),
    document.fonts.load('100px "Archivo Black"'),
    document.fonts.load("100px Anton"),
    document.fonts.load('400 100px "JetBrains Mono"'),
    document.fonts.load("900 100px Doto"),
    document.fonts.load('100px "Black Han Sans"'),
    document.fonts.load("900 100px Unbounded"),
    document.fonts.load('italic 100px "Instrument Serif"'),
    document.fonts.load('100px "Instrument Serif"'),
  ]);
  await document.fonts.ready;
  await Promise.all([
    core.loadFont3D("ArchivoBlack", "/assets/fonts/ArchivoBlack.ttf"),
    core.loadFont3D("Anton", "/assets/fonts/Anton.ttf"),
    core.loadFont3D("BlackHanSans", "/assets/fonts/BlackHanSans.ttf"),
  ]);
  // load scenes
  E.layers = [];
  for (const entry of TIMELINE) {
    if (ONLY && !ONLY.includes(entry.id)) continue;
    if (!cv.onCanvas(entry, ORIENT)) continue; // a scene laid out for the other canvas never renders, --only included
    if (
      !ONLY &&
      entry.variant &&
      entry.variant !== (Q.get("variant") || Q.get("ending") || "a")
    )
      continue; // alternate versions of a section (e.g. endings): render with --variant b
    const mod = await import(
      `/engine/scenes/${entry.file ?? entry.id + ".js"}`
    );
    const scene = mod.default;
    const layer = { ...entry, scene, loaded: false };
    E.layers.push(layer);
  }
  if (ONLY && !E.layers.length)
    throw new Error(
      `--only ${ONLY.join(",")}: nothing renders on the ${ORIENT} canvas (check the ids and their canvas tags)`,
    );
  await Promise.all(
    E.layers.map(async (l) => {
      if (l.scene.load) await l.scene.load(E, l);
      l.loaded = true;
    }),
  );
  for (const l of E.layers) {
    const { sharp, floor } = blur.layerBlur(l.blur, l.scene.blur, l.id);
    l.sharp = sharp;
    if (floor) BL.fasts.push([l.start, l.end, floor]);
  }
  // cuts come from every entry on this canvas and variant, so an --only preview slides its shutters like the full render
  BL.cuts = blur.cutList(
    blur.cutEntries(TIMELINE, {
      onCanvas: (e) => cv.onCanvas(e, ORIENT),
      variant: Q.get("variant") || Q.get("ending"),
      loaded: E.layers,
    }),
    {
      beats: E.A.beats,
      words: E.words,
      lead: typekit.LEAD,
      extra: BL.extra,
      o: BLUR,
    },
  );
  BL.sealed = true;
  if (BLUR.on) {
    if (!renderer.extensions.has("EXT_color_buffer_float"))
      throw new Error(
        "motion blur needs float render targets (EXT_color_buffer_float): render with --blur off",
      );
    floatBlend = !!renderer.getContext().getExtension("EXT_float_blend");
  }
  window.__ready = true;
}
const bootP = boot().catch((e) => {
  console.error(e);
  window.__error = String(e.stack || e);
});

// Composite the active layers at time t into accum. In a sample, a sharp layer keeps the frame pass's render target.
function composite(active, t, sample, blurred) {
  blur.clock.pass++;
  renderer.setRenderTarget(accum);
  renderer.setClearColor(0x000000, 1);
  renderer.clear(true, true, true);
  active.forEach((l, i) => {
    const rt = getLayerRT(i);
    if (!(sample && l.sharp)) {
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, true);
      E.blurring = blurred && !l.sharp;
      blur.clock.layer = i; // trackAt records and replays per layer
      const op = l.scene.render(E, t, rt, l);
      blur.clock.layer = null;
      renderer.setRenderTarget(rt);
      renderer.render(_emptyScene, _emptyCam); // force MSAA resolve even if the scene drew nothing
      l._op = typeof op === "number" ? op : 1;
    }
    blendFor(l.blend ?? "normal");
    compMat.uniforms.tex.value = rt.texture;
    compMat.uniforms.opacity.value = l._op;
    quad.render(renderer, accum, false);
  });
}

// ---- motion blur: float sums of the sample composites, made only when a frame blurs
const _fq = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;
const fetchMat = (body, uniforms, blending) =>
  new THREE.ShaderMaterial({
    uniforms,
    vertexShader: _fq,
    fragmentShader: `uniform sampler2D tex, tSum; uniform float uN; void main(){ ivec2 p = ivec2(gl_FragCoord.xy); ${body} }`,
    depthTest: false,
    depthWrite: false,
    blending,
    ...(blending === THREE.CustomBlending && {
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
    }),
  });
function accumulator() {
  const rt = () =>
    new THREE.WebGLRenderTarget(W, H, {
      type: THREE.FloatType,
      depthBuffer: false,
    });
  const u = () => ({
    tex: { value: null },
    tSum: { value: null },
    uN: { value: 1 },
  });
  return {
    sums: floatBlend ? [rt()] : [rt(), rt()], // without EXT_float_blend, ping-pong instead of blending
    keep: mkRT(0),
    add: new core.FSQuad(
      floatBlend
        ? fetchMat(
            "gl_FragColor = texelFetch(tex, p, 0);",
            u(),
            THREE.CustomBlending,
          )
        : fetchMat(
            "gl_FragColor = texelFetch(tSum, p, 0) + texelFetch(tex, p, 0);",
            u(),
            THREE.NoBlending,
          ),
    ),
    // sum / n, exact for identical samples: a still frame comes out bit-identical to one without blur
    div: new core.FSQuad(
      fetchMat(
        "gl_FragColor = texelFetch(tex, p, 0) / uN;",
        u(),
        THREE.NoBlending,
      ),
    ),
  };
}
function addInto(a, tex) {
  const m = a.add.material.uniforms;
  m.tex.value = tex;
  if (floatBlend) return a.add.render(renderer, a.sums[0]);
  m.tSum.value = a.sums[0].texture;
  a.add.render(renderer, a.sums[1]);
  a.sums.reverse();
}
function copyInto(a, tex, target, n = 1) {
  const m = a.div.material.uniforms;
  m.tex.value = tex;
  m.uN.value = n;
  a.div.render(renderer, target);
}
// The frame pass already sits in accum. Render the other samples (footage, the HUD, grain and E.post stay on the frame),
// average them into accum, and restore the frame's state even if a scene throws.
function accumulate(active, t, times, frameIdx) {
  const { n, reuse, render } = blur.passes(times, t);
  const a = (acc ??= accumulator()),
    C = blur.clock,
    P = E.post,
    HU = E.hud;
  copyInto(a, accum.texture, a.keep);
  for (const s of a.sums) {
    renderer.setRenderTarget(s);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
  }
  if (reuse) addInto(a, accum.texture);
  C.sub = true;
  C.stale = null;
  try {
    render.forEach((ts, j) => {
      E.t = ts;
      E.pass = j + 1;
      C.shift = ts - t;
      E.post = JSON.parse(JSON.stringify(POST_DEFAULT)); // a sample's post and HUD writes are dropped
      E.hud = { ...HUD_DEFAULT };
      composite(active, ts, true, true);
      addInto(a, accum.texture);
    });
  } finally {
    C.sub = false;
    C.shift = 0;
    E.t = t;
    E.pass = 0;
    E.post = P;
    E.hud = HU;
  }
  if (C.stale) {
    copyInto(a, a.keep.texture, accum);
    (window.__blurFallbacks ??= []).push([frameIdx, C.stale]);
  } else copyInto(a, a.sums[0].texture, accum, n);
  renderer.setClearColor(0x000000, 0);
}

// Render global time t. Returns when the frame is on the canvas.
async function renderTime(t, frameIdx = Math.round(t * E.fps)) {
  await bootP;
  if (window.__error) throw new Error(window.__error);
  E.t = t;
  E.frameT = t;
  E.pass = 0;
  E.frame = frameIdx;
  E.post = JSON.parse(JSON.stringify(POST_DEFAULT));
  E.hud = { ...HUD_DEFAULT };
  const active = E.layers
    .filter((l) => t >= l.start && t < l.end)
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  const times = PLAY ? null : blur.framePlan(t, E.fps, BLUR, BL);
  blur.clock.id++;
  core.trackFrame(times !== null);
  for (const l of active) if (l.scene.prepare) await l.scene.prepare(E, t, l);
  composite(active, t, false, times !== null);
  if (times) accumulate(active, t, times, frameIdx);
  const P = E.post,
    U = finalPass.uniforms;
  bloom.strength = P.bloom;
  bloom.radius = P.bloomRadius;
  bloom.threshold = P.bloomThreshold;
  U.uFrame.value = frameIdx;
  U.uExposure.value = P.exposure;
  U.uCA.value = P.ca;
  U.uGrain.value = P.grain;
  U.uVig.value = P.vignette;
  U.uFlash.value = P.flash < 0.02 ? 0 : P.flash;
  U.uFlashCol.value.setRGB(...P.flashCol);
  U.uInvert.value = P.invert;
  U.uPunch.value = P.punch;
  U.uShake.value.set(...P.shake);
  U.uWarm.value = P.grade === "warm" ? 1 : 0;
  U.uAmber.value.set(P.invertCol);
  U.uRot.value = P.rot;
  U.uScan.value = P.scan;
  U.uGlitch.value = P.glitch;
  U.uLetterbox.value = P.letterbox;
  U.uSat.value = P.sat;
  U.uTint.value.set(...P.tint);
  U.uFade.value = P.fade;
  renderer.setRenderTarget(null);
  composer.render();
  return true;
}
window.renderFrame = (frameIdx, fps = 60) => {
  E.fps = fps;
  return renderTime(frameIdx / fps, frameIdx);
};
window.renderTime = (t) => renderTime(t);
window.grab = async (type = "image/jpeg", q = 0.93) => {
  const b = await new Promise((r) => canvas.toBlob(r, type, q));
  return new Uint8Array(await b.arrayBuffer());
};

// Interactive preview: ?t=12.3 renders a still; ?play=1 plays in realtime (no audio sync guarantees)
if (Q.get("t")) bootP.then(() => renderTime(parseFloat(Q.get("t"))));
if (Q.get("play"))
  bootP.then(() => {
    const t0 = parseFloat(Q.get("play"));
    const s = performance.now();
    const loop = async () => {
      await renderTime(t0 + (performance.now() - s) / 1000);
      requestAnimationFrame(loop);
    };
    loop();
  });
