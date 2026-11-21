// hero3d.js: one seek-safe hero 3D object for a motionmaxxing film (ported from motion-unslop v2 + the gen-1 SVG-logo extrusion).
//
// Runs INSIDE the renderer (plain HTML + Motion runtime, or HyperFrames) on Three.js r186. No Blender, no DCC, no network at render time.
// Normal use is through the Motion runtime: M.hero3d(canvas, { objects | build, state }) loads this module for you (see runtime/README.md "3D").
// Direct use:
//   const hero = await createHero3D(canvas, { objects: [{ id: 'mark', kind: 'logo', svg: 'M0 0 ...' }], state: (t, objs, ctx) => ({ ... }) });
//   hero.renderAt(t);          // every visible property is a pure function of (t, state)
//
// Seek-safety contract (why this file looks the way it does):
//   * renderAt() RESETS every transform, light and uniform from options + state on every call.
//     Nothing accumulates between frames, so frame 75 is identical whether you jumped to it or
//     played through 0..74 (HyperFrames renders in parallel workers that seek out of order).
//   * No clocks, no requestAnimationFrame, no Math.random(). Use rng(seed) for scatter.
//   * All assets (font, env image, glTF, screen image) load inside createHero3D(); await it
//     before the first render. No fetch happens in renderAt().
//
// Imports: the vendored three.js and addons import each other by RELATIVE path (vendor/addons/* were patched from the bare specifier 'three'),
// so no importmap is needed. Never mix this vendor copy with a second copy of three on the page.

import * as THREE from "./vendor/three.module.js";
import { RoomEnvironment } from "./vendor/addons/environments/RoomEnvironment.js";
import { HDRLoader } from "./vendor/addons/loaders/HDRLoader.js";
import { EXRLoader } from "./vendor/addons/loaders/EXRLoader.js";
import { FontLoader } from "./vendor/addons/loaders/FontLoader.js";
import { TTFLoader } from "./vendor/addons/loaders/TTFLoader.js";
import { GLTFLoader } from "./vendor/addons/loaders/GLTFLoader.js";
import { SVGLoader } from "./vendor/addons/loaders/SVGLoader.js";
import { RoundedBoxGeometry } from "./vendor/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries, toCreasedNormals } from "./vendor/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "./vendor/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "./vendor/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "./vendor/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "./vendor/addons/postprocessing/BokehPass.js";
import { OutputPass } from "./vendor/addons/postprocessing/OutputPass.js";

export { THREE };

// ---------------------------------------------------------------------------------------------
// Time helpers (pure). Use these to write state(t) without a separate animation library.
// ---------------------------------------------------------------------------------------------
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const ease = {
  linear: (x) => x,
  smooth: (x) => x * x * (3 - 2 * x),
  cubicOut: (x) => 1 - (1 - x) ** 3,
  quartOut: (x) => 1 - (1 - x) ** 4, // motion-unslop default arrival
  expoOut: (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
  expoInOut: (x) =>
    x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2,
  launchIn: (x) => x * x * x,
};
// M.hero3d merges Motion.ease (softLand, whip, glide, snapSettle, popOver, crashIn, accelExit ...) into this table, so key(t, [..., 'softLand']) works.
const lerp = (a, b, u) => (Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * u) : a + (b - a) * u);

/** key(t, [[t0, v0], [t1, v1, 'quartOut'], ...]) -> value at t. v may be a number or an array.
 *  The ease on a key shapes the segment that ARRIVES at that key. Clamped at both ends. */
export function key(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e = "smooth"] = keys[i];
    const [t0, v0] = keys[i - 1];
    if (t <= t1) return lerp(v0, v1, (typeof e === "function" ? e : ease[e] || ease.smooth)((t - t0) / (t1 - t0)));
  }
  return keys[keys.length - 1][1];
}
/** Gaussian bump: 1 at c, falls off with width w. For one-off flashes / sweeps. */
export const pulse = (t, c, w) => Math.exp(-(((t - c) / w) ** 2));
/** Seeded PRNG (mulberry32). Never use Math.random() in a film. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// Material recipes. MeshPhysicalMaterial everywhere: MeshStandardMaterial with default values
// is the "plastic CG" look. Every recipe assumes an environment map is present.
// ---------------------------------------------------------------------------------------------
export const MATERIALS = {
  // Polished metal. Colour tints it: '#ffffff' chrome, '#f1c16b' gold, '#c9a18a' rose gold.
  chrome: { color: "#ffffff", metalness: 1, roughness: 0.07 },
  // Real refraction. attenuationColor tints the body by thickness, dispersion splits edges.
  glass: {
    color: "#ffffff",
    metalness: 0,
    roughness: 0.03,
    transmission: 1,
    thickness: 0.8,
    ior: 1.5,
    attenuationDistance: 3,
    dispersion: 0.25,
    specularIntensity: 1,
    clearcoat: 0.3,
  },
  // Soft anodised / powder-coat look: broad highlight, sheen on grazing edges.
  satin: {
    color: "#d9d5cf",
    metalness: 0.25,
    roughness: 0.38,
    sheen: 0.5,
    sheenRoughness: 0.4,
    sheenColor: "#ffffff",
    clearcoat: 0.25,
    clearcoatRoughness: 0.35,
  },
  // Thin-film metal (holo coin, oil-slick). Needs a contrasty env or it reads as grey.
  iridescent: {
    // Base must NOT be a perfect mirror: over F0=1 (white metal) thin-film interference cancels
    // out and the result is plain chrome. A mid-grey metal base leaves room for the colours.
    color: "#cfcfcf",
    metalness: 1,
    roughness: 0.12,
    iridescence: 1,
    iridescenceIOR: 1.8,
    iridescenceThicknessRange: [180, 400], // thin + narrow = pastel holo foil; wide (250-900) = oil slick
  },
  // Glossy injection-moulded plastic in the brand colour, with a lacquer coat.
  brandPlastic: {
    color: "#3355ff",
    metalness: 0,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    specularIntensity: 0.7,
  },
};

export function makeMaterial(name = "chrome", color, extra = {}) {
  const recipe = { ...(MATERIALS[name] || MATERIALS.chrome), ...extra };
  if (color) recipe[name === "glass" ? "attenuationColor" : "color"] = color;
  const { color: c, attenuationColor: ac, sheenColor: sc, warp, ...rest } = recipe;
  const m = new THREE.MeshPhysicalMaterial(rest);
  if (c) m.color.set(c);
  if (ac) m.attenuationColor.set(ac);
  if (sc) m.sheenColor.set(sc);
  if (warp) addWarp(m, warp === true ? {} : warp);
  // Without a thickness map three uses the MAX thickness everywhere: one flat hue (reads as copper).
  if (m.iridescence > 0 && !m.iridescenceThicknessMap) m.iridescenceThicknessMap = filmThicknessMap();
  return m;
}

let filmMap = null;
/** Smooth deterministic 256x256 pattern (sum of sines, no randomness) used as thin-film thickness. */
function filmThicknessMap() {
  if (filmMap) return filmMap;
  const n = 256,
    d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const u = (x / n) * Math.PI * 2,
        v = (y / n) * Math.PI * 2;
      const f = 0.5 + 0.3 * Math.sin(u + Math.sin(v) * 1.2) + 0.2 * Math.sin(v + Math.cos(u) * 0.8); // one soft cycle, tileable
      const i = (y * n + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = Math.round(f * 255);
      d[i + 3] = 255;
    }
  filmMap = new THREE.DataTexture(d, n, n); // thickness is read from the G channel
  filmMap.wrapS = filmMap.wrapT = THREE.RepeatWrapping;
  filmMap.needsUpdate = true;
  return filmMap;
}

/** Liquid-surface normal warp. Flat extruded faces reflect ONE direction of the environment, so
 *  a whole letter face is either all-lit or all-dark ("mirror tile" look). Bending the shading
 *  normal with smooth object-space waves makes each face show a band of the environment, which
 *  is what real polished type and liquid chrome look like. Pure function of (position, uWarpTime);
 *  renderAt() sets uWarpTime from state.warpTime (default: frozen at 0, i.e. no flow).
 *  { amount: 0.18 (0.08 subtle polish .. 0.4 liquid), scale: 1.4 (waves per unit), flow: 1 } */
function addWarp(m, { amount = 0.18, scale = 1.4 } = {}) {
  m.userData.warp = {
    uWarpTime: { value: 0 },
    uWarpAmount: { value: amount },
    uWarpScale: { value: scale },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.warp);
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vWarpP; varying vec3 vWX; varying vec3 vWY; varying vec3 vWZ;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vWarpP = position; vWX = normalMatrix * vec3(1.,0.,0.); vWY = normalMatrix * vec3(0.,1.,0.); vWZ = normalMatrix * vec3(0.,0.,1.);`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWarpP; varying vec3 vWX; varying vec3 vWY; varying vec3 vWZ;
        uniform float uWarpTime, uWarpAmount, uWarpScale;`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          vec3 q = vWarpP * uWarpScale; float T = uWarpTime;
          vec3 w = vec3(
            sin(q.y * 1.7 + 1.5 * sin(q.x * 1.3 + T) + q.z * 0.8),
            sin(q.x * 1.9 + 1.5 * sin(q.y * 1.1 - T * 0.8) + 0.6),
            sin((q.x + q.y) * 1.2 + T * 0.6));
          vec3 wv = vWX * w.x + vWY * w.y + vWZ * w.z;
          wv -= dot(wv, normal) * normal;              // keep the bend tangential
          normal = normalize(normal + wv * uWarpAmount);
        }`,
      );
  };
  m.customProgramCacheKey = () => "hero3d-warp";
}

// ---------------------------------------------------------------------------------------------
// Environment. The env map IS the lighting: chrome reflects it, glass refracts it.
//   'studio' (default): black cyclorama + softboxes. High contrast, the classic product look.
//   'room':             three.js RoomEnvironment (neutral grey interior; softer, lower contrast).
//   'plate.jpg|png':    an equirectangular image, e.g. an AI-generated plate. LDR images are
//                       expanded to pseudo-HDR (envBoost) so highlights are bright enough to bloom.
//   'x.hdr' | 'x.exr':  a real HDRI.
// A moving "sweep" softbox can be added to ANY of these; it is baked into the PMREM per frame,
// so the light sweep is a real reflection travelling across the surface, not a 2D gradient.
// ---------------------------------------------------------------------------------------------
function softbox(w, h, intensity, color = "#ffffff") {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.DoubleSide,
    }),
  );
  return m;
}

function studioScene() {
  const s = new THREE.Scene();
  // Cyclorama: near-black vertex-coloured sphere with a faint glow at the horizon.
  // Chrome shows the environment, not the object: keep most of it DARK so the few cards read.
  const g = new THREE.SphereGeometry(30, 48, 24);
  const col = [],
    p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 30;
    const v = y < 0 ? 0.001 + 0.008 * Math.exp(-((y * 7) ** 2)) : 0.002 + 0.012 * Math.exp(-((y * 5) ** 2));
    col.push(v, v, v * 1.05);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const add = (m, pos) => {
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  // Front faces of flat type reflect what is BEHIND THE CAMERA, so that is where the structure goes.
  add(softbox(24, 0.5, 3.5), [0, -1.4, 16]); // horizon strip: the bright line across chrome faces
  add(softbox(5, 7, 5, "#fff1e0"), [-9, 6, 8]); // warm key card, top-left
  add(softbox(2, 16, 6, "#dcefff"), [12, 1, -7]); // cool rim strip, back-right: lights edges/bevels
  add(softbox(10, 3, 1.5), [0, 16, 0]); // small overhead: tops of letters and bevels
  return s;
}

function imageScene(texture, boost) {
  // Equirect on a sphere so the same PMREM path handles images, HDRIs and the sweep card.
  const s = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { map: { value: texture }, boost: { value: boost } },
    vertexShader:
      "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
    // LDR -> pseudo-HDR: brightest ~10% of the plate is pushed to 1+boost so it can bloom.
    fragmentShader: `uniform sampler2D map; uniform float boost; varying vec2 vUv;
      void main(){ vec3 c = texture2D(map, vec2(1.0 - vUv.x, vUv.y)).rgb;
        float l = max(c.r, max(c.g, c.b));
        gl_FragColor = vec4(c * (1.0 + boost * pow(l, 6.0)), 1.0); }`,
  });
  s.add(new THREE.Mesh(new THREE.SphereGeometry(30, 64, 32), mat));
  return s;
}

async function loadEnvScene(env, boost) {
  if (!env || env === "studio") return studioScene();
  if (env === "room") return new RoomEnvironment();
  const ext = env.split("?")[0].split(".").pop().toLowerCase();
  if (ext === "hdr") return imageScene(await new HDRLoader().loadAsync(env), 0);
  if (ext === "exr") return imageScene(await new EXRLoader().loadAsync(env), 0);
  const tex = await new THREE.TextureLoader().loadAsync(env);
  tex.colorSpace = THREE.SRGBColorSpace;
  return imageScene(tex, boost);
}

// ---------------------------------------------------------------------------------------------
// Geometry kinds
// ---------------------------------------------------------------------------------------------
const fontCache = new Map();
const DEFAULT_FONT = new URL("./fonts/Inter-Bold-Latin.ttf", import.meta.url).href; // static Inter Bold, Latin subset (OFL); pass opts.font for the brand face
async function loadFont(url) {
  url = url || DEFAULT_FONT;
  // opentype.js cannot read woff2 or variable axes: convert with runtime/hero3d/tools/fontconv.py first.
  if (/\.woff2(\?|$)/i.test(url)) throw new Error("hero3d: woff2 is not readable by opentype.js. Run runtime/hero3d/tools/fontconv.py (woff2/variable -> static .ttf).");
  if (!fontCache.has(url)) {
    const loader = /\.json(\?|$)/i.test(url) ? new FontLoader() : new TTFLoader();
    fontCache.set(
      url,
      loader.loadAsync(url).then((d) => (d.generateShapes ? d : new FontLoader().parse(d))),
    );
  }
  return fontCache.get(url);
}

/** Creased normals for extruded shapes: smooth across the bevel steps, crisp at the face/wall edges, and the big flat caps keep their exact +-z normal (otherwise caps pick up the
 *  bevel's tilt at their boundary vertices and show fan-shaped shading). */
function smoothBevel(geo, crease = 0.5) {
  const g = toCreasedNormals(geo.index ? geo.toNonIndexed() : geo, crease),
    p = g.attributes.position,
    n = g.attributes.normal,
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1).sub(a);
    c.fromBufferAttribute(p, i + 2).sub(a);
    b.cross(c).normalize();
    if (Math.abs(b.z) > 0.9995) for (let k = 0; k < 3; k++) n.setXYZ(i + k, 0, 0, Math.sign(b.z));
  }
  return g;
}

/** Extruded, bevelled type. The bevel is what catches light; without it chrome text looks flat.
 *  tracking is in em (negative = tighter, display type usually wants -0.02..-0.05). */
function textGeometry(font, text, o = {}) {
  const size = o.size ?? 1,
    tracking = o.tracking ?? -0.02;
  const extrude = {
    depth: o.depth ?? 0.3 * size,
    curveSegments: o.curveSegments ?? 12,
    bevelEnabled: true,
    bevelThickness: o.bevelThickness ?? 0.05 * size,
    bevelSize: o.bevelSize ?? 0.03 * size,
    bevelSegments: o.bevelSegments ?? 6,
  };
  const scale = size / font.data.resolution;
  const parts = [];
  let x = 0;
  for (const ch of text) {
    const glyph = font.data.glyphs[ch] || font.data.glyphs["?"];
    if (ch.trim()) {
      const g = new THREE.ExtrudeGeometry(font.generateShapes(ch, size), extrude);
      g.translate(x, 0, 0);
      parts.push(g);
    }
    x += glyph.ha * scale + tracking * size;
  }
  // creased normals: smooth bevels, crisp face/wall edges (flat per-triangle normals make a lacquer or chrome bevel read as facets)
  const geo = smoothBevel(
    mergeGeometries(
      parts.map((g) => (g.index ? g.toNonIndexed() : g)),
      false,
    ),
    o.crease ?? 0.5,
  );
  geo.computeBoundingBox();
  const c = new THREE.Vector3();
  geo.boundingBox.getCenter(c);
  geo.translate(-c.x, -c.y, -c.z); // pivot at the visual centre
  return geo;
}

/** SVG mark extruded with a bevel. Several parts that must line up (ring + dot) use { center:false, perUnit: <world units per SVG unit>, ref: <reference size> } so they share one
 *  coordinate system (SVG origin = object origin) and one depth/bevel. `svg` = a path `d` string, an array of d strings (one outline each), or full <svg> markup (every path/fill rule is read by SVGLoader;
 *  holes come from winding / evenodd). Centred, y flipped (SVG y is down), scaled so the WIDTH is `size` world units; depth / bevel are fractions of `size`. */
function logoGeometry(o = {}) {
  const markup = Array.isArray(o.svg)
    ? `<svg xmlns="http://www.w3.org/2000/svg">${o.svg.map((d) => `<path d="${d}"/>`).join("")}</svg>`
    : /^\s*<svg/i.test(o.svg || "")
      ? o.svg
      : `<svg xmlns="http://www.w3.org/2000/svg"><path d="${o.svg}"/></svg>`;
  const shapes = new SVGLoader().parse(markup).paths.flatMap((p) => p.toShapes());
  if (!shapes.length) throw new Error("hero3d: logo svg has no fillable shapes (strokes are ignored; outline them first)");
  // work in SVG units first, then normalise (bevel values are relative to the final width)
  const probe = new THREE.ShapeGeometry(shapes);
  probe.computeBoundingBox();
  const w = probe.boundingBox.max.x - probe.boundingBox.min.x,
    k = o.perUnit ?? (o.size ?? 2.6) / w,
    size = o.ref ?? w * k;
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth: (o.depth ?? 0.16) * size / k,
    bevelEnabled: true,
    bevelThickness: (o.bevelThickness ?? 0.022) * size / k,
    bevelSize: (o.bevelSize ?? 0.016) * size / k,
    bevelSegments: o.bevelSegments ?? 6,
    curveSegments: o.curveSegments ?? 48,
  });
  geo.scale(k, -k, k);
  // the y mirror reverses triangle winding: swap vertices 1 and 2 of every triangle so faces point outward again
  const swap = (arr, n) => { for (let i = 0; i < arr.count; i += 3) for (let j = 0; j < n; j++) { const a = arr.array[(i + 1) * n + j]; arr.array[(i + 1) * n + j] = arr.array[(i + 2) * n + j]; arr.array[(i + 2) * n + j] = a; } };
  if (geo.index) { const ix = geo.index; for (let i = 0; i < ix.count; i += 3) { const a = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, a); } }
  else { swap(geo.attributes.position, 3); if (geo.attributes.uv) swap(geo.attributes.uv, 2); }
  // smooth the bevel (creaseAngle ~29 deg) but keep the face / wall edges crisp; without this a chrome or lacquer bevel shows facets
  const out = smoothBevel(geo, o.crease ?? 0.5);
  out.computeBoundingBox();
  const c = new THREE.Vector3();
  out.boundingBox.getCenter(c);
  if (o.center !== false) out.translate(-c.x, -c.y, -c.z);
  return out;
}

/** Coin: lathe profile with a raised rim and recessed face, so the rim reads as a bright ring. */
function coinGeometry(r = 1, t = 0.16) {
  const h = t / 2,
    prof = [
      [0, h * 0.55],
      [0.8, h * 0.55],
      [0.83, h * 0.8],
      [0.86, h],
      [0.965, h],
      [1, h * 0.72],
      [1, -h * 0.72],
      [0.965, -h],
      [0.86, -h],
      [0.83, -h * 0.8],
      [0.8, -h * 0.55],
      [0, -h * 0.55],
    ];
  // Profile runs bottom -> top so LatheGeometry's normals face OUT (top -> bottom renders inside-out).
  const g = new THREE.LatheGeometry(
    prof.reverse().map(([x, y]) => new THREE.Vector2(x * r, y)),
    160,
  );
  g.rotateX(Math.PI / 2); // face the camera (+Z)
  // Planar UVs across the face (lathe UVs run around the rim, so a texture or thin-film
  // thickness map would be constant across the face).
  const p = g.attributes.position,
    uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * r) + 0.5, p.getY(i) / (2 * r) + 0.5);
  return g;
}

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape(),
    x = -w / 2,
    y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

async function buildObject(o, defaults) {
  const mat = o.materialInstance || makeMaterial(o.material ?? defaults.material, o.color, o.materialParams);
  const root = new THREE.Group();
  let mixer = null;
  switch (o.kind) {
    case "group":
      break; // empty transform node for parenting parts
    case "extrudedText": {
      const font = await loadFont(o.font ?? defaults.font);
      root.add(new THREE.Mesh(textGeometry(font, o.text ?? "Launch", o), mat));
      break;
    }
    case "logo": {
      if (!o.svg) throw new Error('hero3d: kind "logo" needs opts.svg (path d, array of d, or <svg> markup)');
      root.add(new THREE.Mesh(logoGeometry(o), mat));
      break;
    }
    case "coin": {
      const r = o.radius ?? 1;
      root.add(new THREE.Mesh(coinGeometry(r, o.thickness ?? 0.16 * r), mat));
      if (o.text) {
        // embossed mark on both faces
        const font = await loadFont(o.font ?? defaults.font);
        const g = textGeometry(font, o.text, {
          size: r * (o.markSize ?? 0.9),
          depth: 0.02 * r,
          bevelThickness: 0.012 * r,
          bevelSize: 0.01 * r,
          bevelSegments: 3,
          tracking: 0,
        });
        const front = new THREE.Mesh(g, mat);
        front.position.z = 0.16 * r * 0.28;
        const back = front.clone();
        back.rotation.y = Math.PI;
        back.position.z *= -1;
        root.add(front, back);
      }
      break;
    }
    case "glassSlab": {
      const [w, h, d] = o.dimensions ?? [2.4, 3, 0.3];
      root.add(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 6, o.cornerRadius ?? 0.14), mat));
      break;
    }
    case "phone": {
      const [w, h, d] = o.dimensions ?? [1, 2.08, 0.11],
        r = o.cornerRadius ?? 0.14;
      root.add(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 8, r), mat)); // frame + back
      const sg = new THREE.ShapeGeometry(roundedRectShape(w * 0.94, h * 0.965, r * 0.85), 12);
      sg.computeBoundingBox();
      const bb = sg.boundingBox,
        uv = sg.attributes.uv,
        p = sg.attributes.position;
      for (let i = 0; i < uv.count; i++)
        uv.setXY(
          i,
          (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x),
          (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y),
        );
      const glass = new THREE.MeshPhysicalMaterial({
        color: "#000000",
        roughness: 0.04,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        emissive: "#ffffff",
        emissiveIntensity: o.screenIntensity ?? 1,
      });
      if (o.screen) {
        const tx = await new THREE.TextureLoader().loadAsync(o.screen);
        tx.colorSpace = THREE.SRGBColorSpace;
        glass.emissiveMap = tx;
      } else glass.emissive.set("#050608");
      const screen = new THREE.Mesh(sg, glass);
      screen.position.z = d / 2 + 0.001;
      root.add(screen);
      break;
    }
    case "gltf": {
      const gltf = await new GLTFLoader().loadAsync(o.src);
      const model = gltf.scene;
      if (o.material)
        model.traverse((m) => {
          if (m.isMesh) m.material = mat;
        });
      const box = new THREE.Box3().setFromObject(model),
        size = box.getSize(new THREE.Vector3());
      const k = (o.fit ?? 2) / Math.max(size.x, size.y, size.z); // fit longest side to `fit`
      model.scale.setScalar(k);
      model.position.copy(box.getCenter(new THREE.Vector3()).multiplyScalar(-k));
      root.add(model);
      if (gltf.animations.length) {
        mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach((a) => mixer.clipAction(a).play());
      }
      break;
    }
    default:
      throw new Error(`hero3d: unknown kind "${o.kind}"`);
  }
  root.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return {
    id: o.id ?? "hero",
    root,
    mixer,
    base: {
      position: o.position ?? [0, 0, 0],
      rotation: o.rotation ?? [0, 0, 0],
      scale: o.scale ?? 1,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// createHero3D
// ---------------------------------------------------------------------------------------------
/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts
 *   kind, text, font, material, color, materialParams  single-object shorthand (id 'hero')
 *   objects: [{ id, kind, ...same keys, position, rotation, scale, parent }]   several objects (keep it to 1-2 visible
 *            subjects; a mark built from parts is ONE subject: give the parts `parent: '<group id>'`,
 *            where the group is { id, kind: 'group' } with no geometry)
 *   width=1920, height=1080, pixelRatio=1            pinned: never read devicePixelRatio for video
 *   background: null (transparent, default) | '#0b0b0c'
 *   envMap: 'studio' | 'room' | url(.jpg/.png/.hdr/.exr);  envIntensity=1; envRotation=[0,0,0]; envBoost=4
 *   sweep: { width: 0.8, intensity: 14, color, from: [-9,1,12], to: [9,1,12], tilt: 0.35 }  moving softbox (state.sweep drives it).
 *          It sits on the CAMERA side: flat faces reflect what is behind the camera.
 *   key:   { position: [-5,6,5], intensity: 2, color }   top-left key by default; false to disable
 *   rim:   { position: [5,3,-6], intensity: 3, color }   false to disable
 *   ground: false | { y: -1, opacity: 0.45 }  shadow catcher (only the shadow is drawn; works transparent)
 *   camera: { fov: 30, position: [0,0.3,9], target: [0,0,0] }
 *   toneMapping: 'neutral' (brand-accurate, default) | 'agx' | 'aces';  exposure=1
 *   bloom: false | { strength: 0.06, radius: 0, threshold: 3, falloff: [1,.55,.25,.08,.02], clamp: 6 }  (threshold in linear HDR: only real highlights)
 *   dof:   false | { aperture: 0.0015, maxblur: 0.006, focus }   focus defaults to camera->target distance
 *   msaa=4   samples on the post-processing target (the canvas's own antialias is lost behind a composer)
 *   state(t, objs, ctx) -> state | void   the shot as a pure function (alias: motion). Runs AFTER every transform/light/camera was reset to base, so anything it does
 *          not touch is back at base. objs = { id: Object3D } (also usable directly: objs.mark.rotation.y = ...), ctx = { f, t, W, H, THREE, scene, camera, keyLight, rimLight, objects, key, pulse, ease, rng, hero }.
 *          Return a state object (below) for camera/lights/post; objects may be driven by return value or by mutation.
 *   build(THREE, scene, camera, ctx) -> Object3D[] | { id: Object3D }   build your own meshes/groups; returned objects join the per-frame reset and state.objects[id]
 *   objects[].kind: extrudedText | logo (svg: path d | [d..] | <svg> markup; size, depth, bevelThickness, bevelSize, crease) | coin | glassSlab | phone | gltf | group
 * @returns {Promise<{renderAt(t:number, state?:object):void, scene, camera, renderer, objects, dispose()}>}
 *
 * state (all optional, all absolute, never deltas):
 *   camera: { position, target, fov }
 *   keyPosition, rimPosition: [x,y,z]   move the lights (a travelling key makes the bevel catch light)
 *   objects: { [id]: { position, rotation, scale, visible } }   (single-object: id 'hero')
 *   sweep: 0..1 position of the sweep softbox along from->to; null/undefined = no sweep
 *   exposure, bloom (strength), focus (DOF distance), envIntensity, keyIntensity, rimIntensity
 *   animTime: glTF clip time (defaults to t);  warpTime: phase of the liquid warp (materialParams.warp)
 */
export async function createHero3D(canvas, opts = {}) {
  const W = opts.width ?? 1920,
    H = opts.height ?? 1080;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
    premultipliedAlpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(opts.pixelRatio ?? 1);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = {
    neutral: THREE.NeutralToneMapping,
    agx: THREE.AgXToneMapping,
    aces: THREE.ACESFilmicToneMapping,
    none: THREE.NoToneMapping,
  }[opts.toneMapping ?? "neutral"];
  renderer.shadowMap.enabled = !!opts.ground;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  if (opts.background) scene.background = new THREE.Color(opts.background);
  else renderer.setClearColor(0x000000, 0);

  // --- objects
  const specs = opts.objects ?? (opts.kind ? [{ id: "hero", ...opts }] : []);
  const objects = await Promise.all(specs.map((s) => buildObject(s, opts)));
  // `parent: '<id>'` nests an object under another (a mark built from parts moves as ONE object).
  // Safe with the per-frame reset: renderAt sets each root's LOCAL transform, parents first or not.
  const byId = Object.fromEntries(objects.map((o) => [o.id, o]));
  specs.forEach((sp, i) => {
    const parent = sp.parent && byId[sp.parent];
    if (sp.parent && !parent) throw new Error(`hero3d: parent "${sp.parent}" not found for "${objects[i].id}"`);
    (parent ? parent.root : scene).add(objects[i].root);
  });

  // --- environment (+ optional sweep card baked per frame)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = await loadEnvScene(opts.envMap, opts.envBoost ?? 4);
  const sw = {
    width: 0.8, // keep it NARROW (~4 deg): a wide card flashes the whole object instead of travelling
    intensity: 14,
    color: "#ffffff",
    from: [-9, 1, 12],
    to: [9, 1, 12],
    tilt: 0.35, // radians of roll: a diagonal streak reads as a sweep, a vertical one as a wipe
    ...(opts.sweep || {}),
  };
  const card = softbox(sw.width, 26, sw.intensity, sw.color);
  card.visible = false;
  envScene.add(card);
  const envSize = opts.envSize ?? 256;
  const baseEnv = pmrem.fromScene(envScene, 0.02, 0.1, 100, { size: envSize });
  let sweepEnv = null,
    sweepKey = null;
  function envFor(sweep) {
    if (sweep == null || sweep <= 0 || sweep >= 1) return baseEnv.texture;
    const k = Math.round(sweep * 1e4); // cache by value: repeated seeks cost nothing
    if (k !== sweepKey) {
      card.position.fromArray(lerp(sw.from, sw.to, sweep));
      card.lookAt(0, 0, 0);
      card.rotateZ(sw.tilt);
      card.visible = true;
      sweepEnv?.dispose();
      sweepEnv = pmrem.fromScene(envScene, 0.02, 0.1, 100, { size: envSize });
      card.visible = false;
      sweepKey = k;
    }
    return sweepEnv.texture;
  }
  scene.environmentRotation.fromArray(opts.envRotation ?? [0, 0, 0]);

  // --- lights: env does the lighting; key/rim add the sharp speculars that bloom
  const mkLight = (cfg, def) => {
    if (cfg === false) return null;
    const c = { ...def, ...(cfg || {}) },
      l = new THREE.DirectionalLight(c.color ?? "#ffffff", c.intensity);
    l.position.fromArray(c.position);
    l.userData.base = c.intensity;
    l.userData.basePos = [...c.position];
    scene.add(l);
    return l;
  };
  const keyLight = mkLight(opts.key, { position: [-5, 6, 5], intensity: 2 });
  const rimLight = mkLight(opts.rim, { position: [5, 3, -6], intensity: 3 });
  if (opts.ground && keyLight) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.radius = 6;
    keyLight.shadow.bias = -0.0005;
    Object.assign(keyLight.shadow.camera, {
      left: -6,
      right: 6,
      top: 6,
      bottom: -6,
      far: 40,
    });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.ShadowMaterial({ opacity: opts.ground.opacity ?? 0.45 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = opts.ground.y ?? -1;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // --- camera
  const cam0 = {
    fov: 30,
    position: [0, 0.3, 9],
    target: [0, 0, 0],
    ...(opts.camera || {}),
  };
  const camera = new THREE.PerspectiveCamera(cam0.fov, W / H, 0.1, 200);

  // --- custom objects from opts.build: they join the per-frame reset and state.objects[id]
  const ctx = { W, H, THREE, scene, camera, keyLight, rimLight, key, pulse, ease, rng, f: 0, t: 0 };
  if (opts.build) {
    const made = await opts.build(THREE, scene, camera, ctx);
    const list = Array.isArray(made) ? made.map((m, i) => [m.name || "obj" + i, m]) : Object.entries(made || {});
    for (const [id, ob] of list) {
      const root = ob.isObject3D ? ob : ob.root;
      if (!root.parent) scene.add(root);
      root.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      const rec = { id, root, mixer: null, base: { position: root.position.toArray(), rotation: [root.rotation.x, root.rotation.y, root.rotation.z], scale: root.scale.toArray() } };
      objects.push(rec);
      byId[id] = rec;
    }
  }

  // --- post: Render -> Bokeh -> Bloom (on linear HDR, so only real highlights glow) -> Output
  let composer = null,
    bloomPass = null,
    bokehPass = null;
  if (opts.bloom || opts.dof) {
    const rt = new THREE.WebGLRenderTarget(W, H, {
      type: THREE.HalfFloatType,
      samples: opts.msaa ?? 4,
    });
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(opts.pixelRatio ?? 1);
    composer.setSize(W, H);
    composer.addPass(new RenderPass(scene, camera));
    if (opts.dof) {
      const d = {
        aperture: 0.0015,
        maxblur: 0.006,
        ...(opts.dof === true ? {} : opts.dof),
      };
      bokehPass = new BokehPass(scene, camera, {
        focus: d.focus ?? 9,
        aperture: d.aperture,
        maxblur: d.maxblur,
      });
      bokehPass.userData = d;
      composer.addPass(bokehPass);
    }
    if (opts.bloom) {
      const b = {
        strength: 0.06, // mirror materials: 0.03-0.08. Above ~0.15 the frame fogs.
        radius: 0,
        threshold: 3,
        ...(opts.bloom === true ? {} : opts.bloom),
      };
      bloomPass = new UnrealBloomPass(new THREE.Vector2(W, H), b.strength, b.radius, b.threshold);
      bloomPass.userData = b;
      // Tighter mip weights than three's default [1,.8,.6,.4,.2]: the glow hugs the highlight
      // instead of fogging the whole frame when a 10x-bright softbox hits a mirror surface.
      bloomPass.compositeMaterial.uniforms.bloomFactors.value = b.falloff ?? [1, 0.55, 0.25, 0.08, 0.02];
      // Clamp what feeds the bloom. A punctual light on a roughness-0.07 mirror has a GGX peak in the
      // thousands; unclamped, one glint fogs the entire frame. The picture itself is not clamped.
      const hp = bloomPass.materialHighPassFilter;
      hp.fragmentShader = hp.fragmentShader.replace(
        "mix( outputColor, texel, alpha )",
        `mix( outputColor, min( texel, vec4( ${(b.clamp ?? 6).toFixed(2)} ) ), alpha )`,
      );
      hp.needsUpdate = true;
      composer.addPass(bloomPass);
    }
    composer.addPass(new OutputPass());
  }

  const v3 = new THREE.Vector3();
  const warpUniforms = new Set();
  scene.traverse((m) => m.material?.userData?.warp && warpUniforms.add(m.material.userData.warp));
  const stateFn = opts.state ?? opts.motion;
  const objMap = Object.fromEntries(objects.map((o) => [o.id, o.root]));
  Object.assign(ctx, { keyLight, rimLight, objects: objMap, hero: null });
  function renderAt(t, state, f = Math.round(t * 30)) {
    // 1. Reset everything to base, THEN ask for the state. No carry-over from the previous call, so frame N is the same whether jumped to or played to.
    for (const o of objects) {
      o.root.position.fromArray(o.base.position);
      o.root.rotation.set(...o.base.rotation);
      Array.isArray(o.base.scale) ? o.root.scale.fromArray(o.base.scale) : o.root.scale.setScalar(o.base.scale);
      o.root.visible = true;
    }
    camera.position.fromArray(cam0.position);
    camera.fov = cam0.fov;
    if (keyLight) keyLight.position.fromArray(keyLight.userData.basePos);
    if (rimLight) rimLight.position.fromArray(rimLight.userData.basePos);
    ctx.t = t;
    ctx.f = f;
    if (state == null) state = (stateFn ? stateFn(t, objMap, ctx) : null) || {};
    for (const o of objects) {
      const s = state.objects?.[o.id];
      if (!s) { o.mixer?.setTime(state.animTime ?? t); continue; }
      if (s.position) o.root.position.fromArray(s.position);
      if (s.rotation) o.root.rotation.set(...s.rotation);
      if (s.scale != null) Array.isArray(s.scale) ? o.root.scale.fromArray(s.scale) : o.root.scale.setScalar(s.scale);
      o.root.visible = s.visible ?? true;
      o.mixer?.setTime(state.animTime ?? t);
    }
    const c = { ...cam0, ...(state.camera || {}) };
    camera.position.fromArray(c.position);
    camera.fov = c.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(v3.fromArray(c.target));
    if (keyLight && state.keyPosition) keyLight.position.fromArray(state.keyPosition);
    if (rimLight && state.rimPosition) rimLight.position.fromArray(state.rimPosition);
    scene.environment = envFor(state.sweep);
    scene.environmentIntensity = state.envIntensity ?? opts.envIntensity ?? 1;
    if (keyLight) keyLight.intensity = state.keyIntensity ?? keyLight.userData.base;
    if (rimLight) rimLight.intensity = state.rimIntensity ?? rimLight.userData.base;
    renderer.toneMappingExposure = state.exposure ?? opts.exposure ?? 1;
    for (const u of warpUniforms) u.uWarpTime.value = state.warpTime ?? 0;
    // 2. Render.
    if (composer) {
      if (bokehPass) {
        bokehPass.uniforms.focus.value =
          state.focus ?? bokehPass.userData.focus ?? camera.position.distanceTo(v3.fromArray(c.target));
        bokehPass.uniforms.aperture.value = state.aperture ?? bokehPass.userData.aperture;
      }
      if (bloomPass) bloomPass.strength = state.bloom ?? bloomPass.userData.strength;
      composer.render();
    } else renderer.render(scene, camera);
  }

  // Compile every shader now so the first sought frame is not a blank compile frame.
  scene.environment = baseEnv.texture;
  renderer.compile(scene, camera);

  const handle = {
    renderAt,
    scene,
    camera,
    renderer,
    canvas,
    W,
    H,
    objects: Object.fromEntries(objects.map((o) => [o.id, o])),
    dispose() {
      composer?.dispose();
      baseEnv.dispose();
      sweepEnv?.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
  ctx.hero = handle;
  renderAt(0, undefined, 0); // warm-up draw: compiles the post chain and any transmission pass now, not on the first sought frame
  return handle;
}
