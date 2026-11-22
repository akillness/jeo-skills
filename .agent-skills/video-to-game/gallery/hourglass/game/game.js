// HOURGLASS — a tiny wanderer climbs the falling time.
// Three.js r160. Every texture, sprite, model, music and sound in assets/ was generated with fal.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = (id) => document.getElementById(id);
const errBox = $('err');
const showErr = (m) => { errBox.textContent += m + '\n'; };
window.addEventListener('error', (e) => showErr(e.message || String(e)));
window.addEventListener('unhandledrejection', (e) => showErr('promise: ' + ((e.reason && e.reason.message) || e.reason)));


// ───────────────────────────── world constants ─────────────────────────────
const YN = 20.0;        // neck centre height
const YC = 5.5;         // widest point of the lower bulb
const RMAX = 9.6;       // inner radius at the widest point
const RN = 0.62;        // inner radius of the neck
const GLASS_T = 0.26;   // glass thickness
const SLOPE = 0.66;     // angle of repose (tan)
const Q_IDLE = 0.6;     // sand flow when the stream falls freely (area units / s)
const Q_CALL = 2.1;     // sand flow when the wanderer calls it
const SAND_TOTAL = 135; // sand in the upper bulb at the start (area units)
const SAND_MIN = 3.0;   // the glass never empties completely (visual floor)
const BASE = 3.2;       // initial sand floor level
const START_X = 0.95;

const MOTES_DEF = [
  { x: 3.4, y: 7.5 },
  { x: -6.6, y: 9.5 },
  { x: 4.6, y: 12.5 },
];

function bulbR(y) {
  const t = y <= YN ? y : 2 * YN - y;
  if (t <= 0) return 0;
  if (t < YC) { const q = (YC - t) / YC; return RMAX * Math.sqrt(Math.max(0, 1 - q * q)); }
  let u = Math.min(1, (t - YC) / (YN - YC));
  u = Math.pow(u, 1.25);
  const s = u * u * (3 - 2 * u);
  return RN + (RMAX - RN) * (1 - s);
}

const GLSL_COMMON = /* glsl */`
  const float YN = ${YN.toFixed(4)};
  const float YC = ${YC.toFixed(4)};
  const float RMAX = ${RMAX.toFixed(4)};
  const float RN = ${RN.toFixed(4)};
  float bulbR(float y) {
    float t = y <= YN ? y : 2.0 * YN - y;
    if (t <= 0.0) return 0.0;
    if (t < YC) { float q = (YC - t) / YC; return RMAX * sqrt(max(0.0, 1.0 - q * q)); }
    float u = clamp((t - YC) / (YN - YC), 0.0, 1.0);
    u = pow(u, 1.25);
    float s = u * u * (3.0 - 2.0 * u);
    return RN + (RMAX - RN) * (1.0 - s);
  }
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
`;

// ───────────────────────────── renderer / scene ─────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG_COLOR = new THREE.Color('#d9cfb9');
scene.fog = new THREE.Fog(FOG_COLOR, 34, 120);
scene.background = FOG_COLOR.clone();

const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 8, 23);

const SUN = new THREE.Vector3(-0.55, 0.78, 0.32).normalize();
scene.add(new THREE.HemisphereLight(0xf4ead4, 0x66767a, 1.35));
const sunLight = new THREE.DirectionalLight(0xfff0d2, 1.6);
sunLight.position.copy(SUN).multiplyScalar(50);
scene.add(sunLight);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.32, 0.5, 0.93);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const gradePass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uPaper: { value: null },
    uRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uFade: { value: 0 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform sampler2D uPaper; uniform vec2 uRes; uniform float uFade;
    varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float p = texture2D(uPaper, vUv * uRes / 820.0).r;
      c *= 1.0 + (p - 0.959) * 3.2;
      c = mix(c, c * vec3(1.035, 1.0, 0.93), 0.55);
      vec3 cc = clamp(c, 0.0, 1.0);
      c = c + (cc * cc * (3.0 - 2.0 * cc) - cc) * 0.35;
      vec2 d = vUv - 0.5; d.x *= uRes.x / uRes.y;
      float v = smoothstep(1.05, 0.28, length(d));
      c *= mix(0.74, 1.0, v);
      c = mix(c, vec3(0.985, 0.955, 0.885), uFade);
      gl_FragColor = vec4(c, 1.0);
    }`,
});
composer.addPass(gradePass);

function pointScale() {
  const h = renderer.domElement.height;
  return h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  gradePass.uniforms.uRes.value.set(w, h);
  for (const p of particleSystems) p.material.uniforms.uScale.value = pointScale();
}
window.addEventListener('resize', onResize);

// ───────────────────────────── loading ─────────────────────────────
const manager = new THREE.LoadingManager();
let loadedCount = 0, totalCount = 0;
const bar = document.querySelector('#loading .bar i');
function bumpProgress() { bar.style.width = Math.round(100 * loadedCount / Math.max(1, totalCount)) + '%'; }
const texLoader = new THREE.TextureLoader(manager);
const gltfLoader = new GLTFLoader(manager);

function loadTex(url, srgb = true) {
  totalCount++;
  return new Promise((res, rej) => texLoader.load(url, (t) => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    loadedCount++; bumpProgress(); res(t);
  }, undefined, (e) => rej(new Error('texture ' + url))));
}
function loadGLB(url) {
  totalCount++;
  return new Promise((res, rej) => gltfLoader.load(url, (g) => { loadedCount++; bumpProgress(); res(g); }, undefined, () => rej(new Error('glb ' + url))));
}

// ───────────────────────────── audio ─────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audio = { ctx: null, master: null, buffers: {}, loops: {}, ready: false, muted: false };
const AUDIO_FILES = {
  music: 'assets/music.mp3', sand: 'assets/sfx_sand_loop.mp3', call: 'assets/sfx_call_loop.mp3',
  chime: 'assets/sfx_chime.mp3', step: 'assets/sfx_step.mp3', ascend: 'assets/sfx_ascend.mp3', turn: 'assets/sfx_turn.mp3',
};
function initAudio() {
  if (audio.ctx || !AudioCtx) return;
  try {
    audio.ctx = new AudioCtx();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.9;
    audio.master.connect(audio.ctx.destination);
    for (const [k, url] of Object.entries(AUDIO_FILES)) {
      fetch(url).then((r) => r.arrayBuffer()).then((ab) => audio.ctx.decodeAudioData(ab)).then((buf) => {
        audio.buffers[k] = buf;
        if (k === 'music' && audio.wantMusic) startMusic();
        if ((k === 'sand' || k === 'call') && audio.wantLoops) startLoop(k);
      }).catch(() => {});
    }
  } catch (e) { audio.ctx = null; }
}
function resumeAudio() {
  initAudio();
  if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  audio.wantMusic = true; audio.wantLoops = true;
  if (audio.buffers.music && !audio.musicStarted) startMusic();
  for (const k of ['sand', 'call']) if (audio.buffers[k] && !audio.loops[k]) startLoop(k);
}
function startMusic() {
  if (!audio.ctx || audio.musicStarted) return;
  audio.musicStarted = true;
  audio.musicGain = audio.ctx.createGain();
  audio.musicGain.gain.value = 0.5;
  audio.musicGain.connect(audio.master);
  const buf = audio.buffers.music;
  const dur = buf.duration - 2.5, xf = 6;
  const schedule = (when) => {
    const src = audio.ctx.createBufferSource(); src.buffer = buf;
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(1, when + 4);
    g.gain.setValueAtTime(1, when + dur - xf);
    g.gain.linearRampToValueAtTime(0.0001, when + dur);
    src.connect(g); g.connect(audio.musicGain);
    src.start(when); src.stop(when + dur + 0.1);
    const next = when + dur - xf;
    setTimeout(() => schedule(next), Math.max(0, (next - audio.ctx.currentTime - 3) * 1000));
  };
  schedule(audio.ctx.currentTime + 0.05);
}
function startLoop(k) {
  if (!audio.ctx || audio.loops[k]) return;
  const src = audio.ctx.createBufferSource(); src.buffer = audio.buffers[k]; src.loop = true;
  const g = audio.ctx.createGain(); g.gain.value = 0;
  src.connect(g); g.connect(audio.master); src.start();
  audio.loops[k] = { src, g };
}
function setLoop(k, v, rate) {
  const l = audio.loops[k];
  if (!l) return;
  l.g.gain.setTargetAtTime(v, audio.ctx.currentTime, 0.12);
  if (rate) l.src.playbackRate.setTargetAtTime(rate, audio.ctx.currentTime, 0.2);
}
function sfx(k, vol = 1, rate = 1) {
  if (!audio.ctx || !audio.buffers[k] || audio.ctx.state !== 'running') return;
  const src = audio.ctx.createBufferSource(); src.buffer = audio.buffers[k]; src.playbackRate.value = rate;
  const g = audio.ctx.createGain(); g.gain.value = vol;
  src.connect(g); g.connect(audio.master); src.start();
}

// ───────────────────────────── sand simulation (lower bulb) ─────────────────────────────
const N = 241, X0 = -RMAX, DX = (2 * RMAX) / (N - 1);
const sandH = new Float32Array(N), sandFloor = new Float32Array(N), sandCeil = new Float32Array(N);
function lowerCeil(ax) {
  if (ax <= RN) return YN;
  if (ax >= RMAX) return YC;
  let lo = YC, hi = YN; // bulbR decreasing on [YC, YN]
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (bulbR(m) >= ax) lo = m; else hi = m; }
  return lo;
}
for (let i = 0; i < N; i++) {
  const x = X0 + i * DX, ax = Math.abs(x);
  sandFloor[i] = ax < RMAX ? YC * (1 - Math.sqrt(Math.max(0, 1 - (x / RMAX) ** 2))) : YC;
  sandCeil[i] = lowerCeil(ax) - 0.05;
}
function sandReset() {
  for (let i = 0; i < N; i++) {
    const x = X0 + i * DX;
    sandH[i] = Math.min(sandCeil[i], Math.max(sandFloor[i], BASE + 1.7 * Math.exp(-x * x / 9)));
  }
  relax(30);
}
function sandAt(x) {
  let f = (x - X0) / DX;
  if (f <= 0) return sandH[0];
  if (f >= N - 1) return sandH[N - 1];
  const i = Math.floor(f), t = f - i;
  return sandH[i] * (1 - t) + sandH[i + 1] * t;
}
function deposit(xc, amount) {
  const sig = 0.24, i0 = Math.max(0, Math.floor((xc - 4 * sig - X0) / DX)), i1 = Math.min(N - 1, Math.ceil((xc + 4 * sig - X0) / DX));
  let wsum = 0;
  for (let i = i0; i <= i1; i++) { const d = (X0 + i * DX - xc) / sig; wsum += Math.exp(-0.5 * d * d); }
  if (wsum <= 0) return;
  for (let i = i0; i <= i1; i++) {
    const d = (X0 + i * DX - xc) / sig;
    sandH[i] = Math.min(sandCeil[i], sandH[i] + amount * Math.exp(-0.5 * d * d) / wsum / DX);
  }
}
function relax(iter) {
  const lim = SLOPE * DX;
  for (let it = 0; it < iter; it++) {
    const fwd = (it & 1) === 0;
    for (let k = 0; k < N - 1; k++) {
      const i = fwd ? k : N - 2 - k;
      const a = sandH[i], b = sandH[i + 1], d = a - b;
      if (d > lim) {
        let m = (d - lim) * 0.5;
        m = Math.min(m, a - sandFloor[i], sandCeil[i + 1] - b);
        if (m > 0) { sandH[i] -= m; sandH[i + 1] += m; }
      } else if (d < -lim) {
        let m = (-d - lim) * 0.5;
        m = Math.min(m, b - sandFloor[i + 1], sandCeil[i] - a);
        if (m > 0) { sandH[i] += m; sandH[i + 1] -= m; }
      }
    }
  }
}

// dilated 2D surface for rendering: H(x,z) = max_x' h(x') - S*sqrt((x-x')^2 + z^2)
const NXT = 121, NZT = 48, DXT = (2 * RMAX) / (NXT - 1), DZT = RMAX / (NZT - 1);
const hc = new Float32Array(NXT);
const dilF = new Float32Array(NXT * NZT);
const dilHalf = new Uint16Array(NXT * NZT);
const distTab = new Float32Array(NZT * NXT);
for (let j = 0; j < NZT; j++) for (let d = 0; d < NXT; d++) distTab[j * NXT + d] = SLOPE * Math.hypot(d * DXT, j * DZT);
const dilTex = new THREE.DataTexture(dilHalf, NXT, NZT, THREE.RedFormat, THREE.HalfFloatType);
dilTex.magFilter = THREE.LinearFilter; dilTex.minFilter = THREE.LinearFilter;
dilTex.wrapS = dilTex.wrapT = THREE.ClampToEdgeWrapping;
function updateDilation() {
  for (let i = 0; i < NXT; i++) {
    const x = -RMAX + i * DXT;
    const f = clamp((x - X0) / DX, 0, N - 1), i0 = Math.min(N - 2, Math.floor(f)), t = f - i0;
    const thick = (sandH[i0] - sandFloor[i0]) * (1 - t) + (sandH[i0 + 1] - sandFloor[i0 + 1]) * t;
    hc[i] = thick > 0.02 ? sandAt(x) : -100; // empty glass bowl is not sand
  }
  for (let j = 0; j < NZT; j++) {
    const row = j * NXT;
    for (let i = 0; i < NXT; i++) {
      let best = -1e9;
      for (let k = 0; k < NXT; k++) {
        const v = hc[k] - distTab[row + (i > k ? i - k : k - i)];
        if (v > best) best = v;
      }
      dilF[row + i] = best;
    }
  }
  for (let n = 0; n < dilF.length; n++) dilHalf[n] = THREE.DataUtils.toHalfFloat(dilF[n]);
  dilTex.needsUpdate = true;
}

// ───────────────────────────── upper bulb sand (analytic crater) ─────────────────────────────
const NU = 241;
const upBot = new Float32Array(NU), upTop = new Float32Array(NU);
for (let i = 0; i < NU; i++) {
  const x = X0 + i * DX, ax = Math.abs(x);
  upBot[i] = 2 * YN - lowerCeil(ax);
  upTop[i] = ax < RMAX ? 2 * YN - YC * (1 - Math.sqrt(Math.max(0, 1 - (x / RMAX) ** 2))) : 2 * YN - YC;
}
const upper = { L: YN + 10, D: 0.6 };
function upperSurf(x, L, D) { return Math.min(L, L - D + SLOPE * Math.abs(x)); }
function upperArea(L, D) {
  let a = 0;
  for (let i = 0; i < NU; i++) {
    const x = X0 + i * DX;
    const top = Math.min(upperSurf(x, L, D), upTop[i]);
    if (top > upBot[i]) a += (top - upBot[i]) * DX;
  }
  return a;
}
function solveUpper(amount) {
  const frac = Math.max(0, Math.min(1, amount / SAND_TOTAL));
  const Dwant = 0.6 + 3.0 * (1 - frac);
  let lo = YN + 0.3, hi = 2 * YN;
  for (let k = 0; k < 30; k++) {
    const m = (lo + hi) / 2;
    const D = Math.min(Dwant, Math.max(0, m - (YN + 0.3)));
    if (upperArea(m, D) < amount) lo = m; else hi = m;
  }
  upper.L = lo;
  upper.D = Math.min(Dwant, Math.max(0, lo - (YN + 0.3)));
}

// ───────────────────────────── shared materials ─────────────────────────────
const uni = {
  uTime: { value: 0 },
  uSun: { value: SUN.clone() },
  uSandTex: { value: null },
  uPlayer: { value: new THREE.Vector4(0, 0, 0, 0) },
  uMoteA: { value: new THREE.Vector4(0, 0, 0, 0) },
  uMoteB: { value: new THREE.Vector4(0, 0, 0, 0) },
  uMoteC: { value: new THREE.Vector4(0, 0, 0, 0) },
  uLand: { value: new THREE.Vector4(0, 0, 0, 0) },
  uSandLit: { value: new THREE.Color('#e2bd73') },
  uSandMid: { value: new THREE.Color('#c39553') },
  uSandShd: { value: new THREE.Color('#8a6a45') },
  uShadowTint: { value: new THREE.Color('#7f7f86') },
  uFogColor: { value: FOG_COLOR.clone() },
  uCam: { value: new THREE.Vector3() },
};

const SAND_SHADE = /* glsl */`
  uniform float uTime; uniform vec3 uSun; uniform sampler2D uSandTex;
  uniform vec4 uPlayer; uniform vec4 uMoteA; uniform vec4 uMoteB; uniform vec4 uMoteC; uniform vec4 uLand;
  uniform vec3 uSandLit; uniform vec3 uSandMid; uniform vec3 uSandShd; uniform vec3 uShadowTint; uniform vec3 uFogColor; uniform vec3 uCam;
  vec3 moteGlow(vec4 m, vec3 w) {
    if (m.w <= 0.0) return vec3(0.0);
    vec3 d = w - m.xyz;
    return vec3(1.0, 0.78, 0.42) * m.w * 0.55 / (1.0 + dot(d, d) * 0.9);
  }
  vec3 sandShade(vec3 w, vec3 n, vec2 tuv, float skin) {
    float ndl = dot(n, uSun);
    float wrap = clamp(ndl * 0.85 + 0.30, 0.0, 1.0);
    vec3 col = mix(uSandShd, uSandMid, smoothstep(0.05, 0.55, wrap));
    col = mix(col, uSandLit, smoothstep(0.55, 1.0, wrap));
    float g = dot(texture2D(uSandTex, tuv).rgb, vec3(0.2126, 0.7152, 0.0722));
    float g2 = dot(texture2D(uSandTex, tuv * 3.7 + 0.31).rgb, vec3(0.2126, 0.7152, 0.0722));
    col *= 0.86 + (g - 0.545) * 2.4 + (g2 - 0.545) * 1.3;
    float sp = step(0.985, hash12(floor(tuv * 900.0)));
    col += sp * vec3(0.30, 0.24, 0.14) * smoothstep(0.4, 1.0, wrap);
    // soft drifting cloud / foliage shadows, like the reference
    float cl = fbm(w.xz * 0.15 + vec2(uTime * 0.011, -uTime * 0.004) + w.y * 0.05);
    float cs = smoothstep(0.50, 0.64, cl) * (1.0 - skin * 0.5);
    col = mix(col, col * uShadowTint * 0.95, cs * 0.62);
    // player contact shadow
    vec2 pd = (w.xz - vec2(uPlayer.x, 0.0)) * vec2(1.0, 1.7);
    float lift = clamp(uPlayer.y - uPlayer.z, 0.0, 3.0);
    float ps = (1.0 - smoothstep(0.08, 0.42 + lift * 0.12, length(pd))) * (1.0 - smoothstep(0.0, 2.6, lift)) * step(abs(w.y - uPlayer.z), 1.0);
    col *= 1.0 - ps * 0.42;
    // warm light pools from the motes and the impact
    col += moteGlow(uMoteA, w) + moteGlow(uMoteB, w) + moteGlow(uMoteC, w);
    vec3 ld = w - uLand.xyz;
    col += vec3(1.0, 0.82, 0.5) * uLand.w * 0.22 / (1.0 + dot(ld, ld) * 2.5);
    col *= mix(1.0, 0.93, skin);
    return col;
  }
  vec3 applyFog(vec3 c, vec3 w) {
    float d = length(w - uCam);
    return mix(c, uFogColor, smoothstep(34.0, 120.0, d));
  }
`;

// lower sand: top surface
const sandTopMat = new THREE.ShaderMaterial({
  uniforms: {
    ...uni,
    uDil: { value: dilTex },
    uDilMap: { value: new THREE.Vector4(-RMAX, 2 * RMAX, RMAX, 0) },
    uDilSize: { value: new THREE.Vector2(NXT, NZT) },
  },
  vertexShader: /* glsl */`
    uniform sampler2D uDil; uniform vec4 uDilMap; uniform vec2 uDilSize;
    varying vec3 vW; varying vec3 vN;
    float dilH(vec2 xz) {
      vec2 uv = clamp(vec2((xz.x - uDilMap.x) / uDilMap.y, abs(xz.y) / uDilMap.z), 0.0, 1.0);
      uv = (uv * (uDilSize - 1.0) + 0.5) / uDilSize;
      return texture2D(uDil, uv).r;
    }
    void main() {
      vec3 p = position;
      p.y = dilH(p.xz);
      float e = 0.14;
      float hx = dilH(p.xz + vec2(e, 0.0)) - dilH(p.xz - vec2(e, 0.0));
      float hz = dilH(p.xz + vec2(0.0, e)) - dilH(p.xz - vec2(0.0, e));
      vN = normalize(vec3(-hx, 2.0 * e, -hz));
      vec4 wp = modelMatrix * vec4(p, 1.0);
      vW = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: GLSL_COMMON + SAND_SHADE + /* glsl */`
    varying vec3 vW; varying vec3 vN;
    void main() {
      float r = length(vW.xz);
      if (r > bulbR(vW.y) - 0.035 || vW.y > YN - 0.2) discard;
      vec3 c = sandShade(vW, normalize(vN), vW.xz * 0.21, 0.0);
      gl_FragColor = vec4(applyFog(c, vW), 1.0);
    }`,
});

// lower sand: the body pressed against the glass
const sandSkinLowerMat = new THREE.ShaderMaterial({
  uniforms: sandTopMat.uniforms,
  side: THREE.DoubleSide,
  vertexShader: /* glsl */`varying vec3 vW; varying vec3 vN; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
  fragmentShader: GLSL_COMMON + SAND_SHADE + /* glsl */`
    uniform sampler2D uDil; uniform vec4 uDilMap; uniform vec2 uDilSize;
    varying vec3 vW; varying vec3 vN;
    float dilH(vec2 xz) {
      vec2 uv = clamp(vec2((xz.x - uDilMap.x) / uDilMap.y, abs(xz.y) / uDilMap.z), 0.0, 1.0);
      uv = (uv * (uDilSize - 1.0) + 0.5) / uDilSize;
      return texture2D(uDil, uv).r;
    }
    void main() {
      float h = dilH(vW.xz);
      if (vW.y > h) discard;
      vec3 n = normalize(vN);
      float depth = clamp((h - vW.y) / 3.0, 0.0, 1.0);
      vec3 c = sandShade(vW, normalize(n + vec3(0.0, 0.6, 0.0)), vec2(atan(vW.z, vW.x) * 3.0, vW.y * 0.25), 1.0);
      c *= 1.0 - depth * 0.16;
      c *= 0.94 + 0.06 * sin(vW.y * 9.0 + fbm(vW.xz * 0.6) * 6.0);
      gl_FragColor = vec4(applyFog(c, vW), 1.0);
    }`,
});

// upper sand (analytic crater)
const upperUniforms = { ...uni, uL: { value: YN + 10 }, uD: { value: 0.6 }, uS: { value: SLOPE } };
const sandUpTopMat = new THREE.ShaderMaterial({
  uniforms: upperUniforms,
  vertexShader: /* glsl */`
    uniform float uL; uniform float uD; uniform float uS;
    varying vec3 vW; varying vec3 vN;
    void main() {
      vec3 p = position;
      float r = length(p.xz);
      float crater = uL - uD + uS * r;
      p.y = min(uL, crater);
      vN = crater < uL ? normalize(vec3(-uS * p.x / max(r, 1e-3), 1.0, -uS * p.z / max(r, 1e-3))) : vec3(0.0, 1.0, 0.0);
      vec4 wp = modelMatrix * vec4(p, 1.0); vW = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: GLSL_COMMON + SAND_SHADE + /* glsl */`
    varying vec3 vW; varying vec3 vN;
    void main() {
      if (length(vW.xz) > bulbR(vW.y) - 0.035 || vW.y < YN + 0.2) discard;
      vec3 c = sandShade(vW, normalize(vN), vW.xz * 0.21, 0.0);
      gl_FragColor = vec4(applyFog(c, vW), 1.0);
    }`,
});
const sandUpSkinMat = new THREE.ShaderMaterial({
  uniforms: upperUniforms,
  side: THREE.DoubleSide,
  vertexShader: sandSkinLowerMat.vertexShader,
  fragmentShader: GLSL_COMMON + SAND_SHADE + /* glsl */`
    uniform float uL; uniform float uD; uniform float uS;
    varying vec3 vW; varying vec3 vN;
    void main() {
      float r = length(vW.xz);
      float h = min(uL, uL - uD + uS * r);
      if (vW.y > h) discard;
      float depth = clamp((h - vW.y) / 4.0, 0.0, 1.0);
      vec3 c = sandShade(vW, normalize(normalize(vN) + vec3(0.0, 0.6, 0.0)), vec2(atan(vW.z, vW.x) * 3.0, vW.y * 0.25), 1.0);
      c *= 1.0 - depth * 0.14;
      // the funnel draining toward the neck reads darker through the glass
      float funnel = 1.0 - smoothstep(0.0, 1.8 + (vW.y - YN) * 0.55, abs(vW.x));
      c *= 1.0 - funnel * 0.16 * (1.0 - smoothstep(YN, YN + 6.0, vW.y));
      c *= 0.93 + 0.07 * sin(vW.y * 9.0 + fbm(vW.xz * 0.6) * 6.0);
      gl_FragColor = vec4(applyFog(c, vW), 1.0);
    }`,
});

// ───────────────────────────── geometry builders ─────────────────────────────
function latheProfile(y0, y1, steps, inset) {
  const pts = [];
  for (let k = 0; k <= steps; k++) {
    const y = y0 + (y1 - y0) * k / steps;
    pts.push(new THREE.Vector2(Math.max(0.0001, bulbR(y) + inset), y));
  }
  return pts;
}

// glass
const glassMat = new THREE.ShaderMaterial({
  uniforms: { ...uni, uSky: { value: null }, uEdge: { value: 1.0 } },
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  vertexShader: /* glsl */`varying vec3 vW; varying vec3 vN; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
  fragmentShader: GLSL_COMMON + /* glsl */`
    uniform vec3 uCam; uniform vec3 uSun; uniform sampler2D uSky; uniform float uTime; uniform float uEdge;
    varying vec3 vW; varying vec3 vN;
    void main() {
      vec3 n = normalize(vN);
      vec3 v = normalize(uCam - vW);
      float nv = abs(dot(n, v));
      float fr = pow(1.0 - nv, 4.0);
      vec3 rf = reflect(-v, faceforward(n, -v, n));
      vec2 suv = vec2(0.5 + rf.x * 0.35, 0.55 + rf.y * 0.3);
      vec3 sky = texture2D(uSky, suv).rgb;
      // tall soft window reflections on the front of the bulb, as in the reference
      float az = atan(n.z, n.x);
      float front = smoothstep(0.0, 0.3, n.z) * step(0.0, dot(n, v));
      float band = smoothstep(0.2, 0.0, abs(az - 2.2)) * front * (0.55 + 0.45 * sin(vW.y * 0.35 + 1.0));
      float band2 = smoothstep(0.12, 0.0, abs(az - 0.85)) * front * 0.6;
      vec3 tint = vec3(0.70, 0.86, 0.90);
      vec3 col = mix(tint, vec3(0.97, 1.0, 1.0), fr) * (0.8 + 0.2 * sky);
      float a = (0.008 + fr * 0.6 + band * 0.13 + band2 * 0.08) * uEdge;
      col += vec3(1.0, 0.98, 0.94) * (band * 0.2 + band2 * 0.15);
      gl_FragColor = vec4(col, clamp(a, 0.0, 0.85));
    }`,
});

// sprite material (painted cut-outs) — mip bias gives a soft depth-of-field
function spriteMat(tex, { tint = '#ffffff', blur = 0, fog = 0, alpha = 1, fade = null } = {}) {
  const f = fade || (blur > 2 ? [0.12, 0.12, 0.12, 0.12] : [0.05, 0.05, 0.05, 0.05]);
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uTint: { value: new THREE.Color(tint) }, uBlur: { value: blur }, uFogAmt: { value: fog }, uFogColor: { value: FOG_COLOR }, uAlpha: { value: alpha }, uFade: { value: new THREE.Vector4(...f) } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform vec3 uTint; uniform float uBlur; uniform float uFogAmt; uniform vec3 uFogColor; uniform float uAlpha; uniform vec4 uFade;
      varying vec2 vUv;
      void main() {
        vec4 t = texture2D(map, vUv, uBlur);
        float e = smoothstep(0.0, uFade.x + 1e-4, vUv.x) * smoothstep(0.0, uFade.y + 1e-4, 1.0 - vUv.x) * smoothstep(0.0, uFade.z + 1e-4, vUv.y) * smoothstep(0.0, uFade.w + 1e-4, 1.0 - vUv.y);
        float a = t.a * uAlpha * e;
        if (a < 0.03) discard;
        vec3 c = mix(t.rgb * uTint, uFogColor, uFogAmt);
        gl_FragColor = vec4(c, a);
      }`,
  });
}

// ───────────────────────────── particles ─────────────────────────────
const particleSystems = [];
class Particles {
  constructor(max, tex, renderOrder = 6) {
    this.max = max;
    this.list = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.frame = new Float32Array(max); this.rot = new Float32Array(max); this.col = new Float32Array(max * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aFrame', new THREE.BufferAttribute(this.frame, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uScale: { value: pointScale() } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aSize; attribute float aAlpha; attribute float aFrame; attribute float aRot; attribute vec3 aColor;
        uniform float uScale;
        varying float vAlpha; varying float vFrame; varying float vRot; varying vec3 vColor;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uScale / max(0.2, -mv.z);
          vAlpha = aAlpha; vFrame = aFrame; vRot = aRot; vColor = aColor;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying float vAlpha; varying float vFrame; varying float vRot; varying vec3 vColor;
        void main() {
          vec2 pc = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          pc = vec2(c * pc.x - s * pc.y, s * pc.x + c * pc.y) * 1.02 + 0.5;
          if (pc.x < 0.0 || pc.x > 1.0 || pc.y < 0.0 || pc.y > 1.0) discard;
          float col = mod(vFrame, 2.0), row = floor(vFrame / 2.0);
          vec2 uv = vec2((col + pc.x) * 0.5, (1.0 - row) * 0.5 + (1.0 - pc.y) * 0.5);
          vec3 t = texture2D(uMap, uv).rgb;
          gl_FragColor = vec4(t * vColor, vAlpha);
        }`,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
    this.geo = g;
    scene.add(this.points);
    particleSystems.push(this);
  }
  spawn(o) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({
      x: o.x, y: o.y, z: o.z || 0, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      life: 0, max: o.life || 1, s0: o.s0 ?? 0.2, s1: o.s1 ?? (o.s0 ?? 0.2), a: o.a ?? 1, frame: o.frame || 0,
      rot: o.rot ?? Math.random() * 6.28, vr: o.vr || 0, g: o.g || 0, drag: o.drag || 0,
      r: o.r ?? 1, gr: o.gr ?? 1, b: o.b ?? 1, fadeIn: o.fadeIn ?? 0.1, twinkle: o.twinkle || 0, follow: o.follow || null,
    });
  }
  update(dt, t) {
    const L = this.list;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy -= p.g * dt;
      const dr = Math.max(0, 1 - p.drag * dt);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.vr * dt;
      if (p.floor && p.y < sandAt(p.x)) { p.y = sandAt(p.x); p.vy *= -0.2; p.vx *= 0.5; }
      L[w++] = p;
    }
    L.length = w;
    for (let i = 0; i < w; i++) {
      const p = L[i], k = p.life / p.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.size[i] = p.s0 + (p.s1 - p.s0) * k;
      let a = p.a * Math.min(1, p.life / Math.max(0.001, p.fadeIn)) * (1 - k) * (1 - k * 0.2);
      if (p.twinkle) a *= 0.55 + 0.45 * Math.sin(t * p.twinkle + i * 1.7);
      this.alpha[i] = a;
      this.frame[i] = p.frame; this.rot[i] = p.rot;
      this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.gr; this.col[i * 3 + 2] = p.b;
    }
    this.geo.setDrawRange(0, w);
    for (const k of ['position', 'aSize', 'aAlpha', 'aFrame', 'aRot', 'aColor']) this.geo.attributes[k].needsUpdate = true;
  }
}

// ───────────────────────────── game state ─────────────────────────────
const G = {
  state: 'loading', t: 0, stateT: 0,
  remaining: SAND_TOTAL, flow: 0, flowTarget: 0, calling: false, callT: 0,
  xLand: 0, yLand: BASE, landing: true,
  motes: [], collected: 0, turns: 0, playTime: 0, keptFrac: 0,
  firstCall: false, turnPending: false, turnAt: 0, turnReset: false, whiteIn: 0, endT: 0,
};
const P = {
  x: START_X, y: BASE, vx: 0, vy: 0, facing: 1, grounded: true, coyote: 0, jumpBuf: 0,
  phase: 0, legAmp: 0, armSwing: 0, armRaise: 0, armFwd: 0, tuck: 0, glow: 0, yaw: Math.PI / 2,
  stepAcc: 0, visible: true, lean: 0,
};
const keys = new Set();
let world = null;

// ───────────────────────────── build the world ─────────────────────────────
async function build() {
  const [skyTex, sandTex, paperTex, fxTex, scarfTex, cliffTex, ridgeTex, rkBoulder, rkCluster, rkLedge, rkPillar,
    lfDarkA, lfDarkB, lfGoldA, lfGoldB, wanderer, rock3d] = await Promise.all([
    loadTex('assets/bg_sky.jpg'), loadTex('assets/sand.jpg'), loadTex('assets/paper.jpg', false), loadTex('assets/fx_atlas.webp'),
    loadTex('assets/scarf_tex.png'), loadTex('assets/spr_cliff.webp'), loadTex('assets/spr_ridge.webp'),
    loadTex('assets/spr_rock_boulder.webp'), loadTex('assets/spr_rock_cluster.webp'), loadTex('assets/spr_rock_ledge.webp'), loadTex('assets/spr_rock_pillar.webp'),
    loadTex('assets/spr_leaf_dark_a.webp'), loadTex('assets/spr_leaf_dark_b.webp'), loadTex('assets/spr_leaf_gold_a.webp'), loadTex('assets/spr_leaf_gold_b.webp'),
    loadGLB('assets/wanderer.glb'), loadGLB('assets/rock3d_cluster.glb'),
  ]);
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
  paperTex.wrapS = paperTex.wrapT = THREE.RepeatWrapping;
  uni.uSandTex.value = sandTex;
  gradePass.uniforms.uPaper.value = paperTex;
  glassMat.uniforms.uSky.value = skyTex;

  const W = {};

  // sky: duotone-graded watercolor backdrop
  {
    const h = 300, w = h * 1536 / 2752;
    const m = new THREE.ShaderMaterial({
      uniforms: { map: { value: skyTex }, uDark: { value: new THREE.Color('#6b7470') }, uLight: { value: new THREE.Color('#efe5cf') } },
      depthWrite: false, fog: false,
      vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D map; uniform vec3 uDark; uniform vec3 uLight; varying vec2 vUv;
        void main() {
          vec3 t = texture2D(map, vUv).rgb;
          float l = dot(t, vec3(0.2126, 0.7152, 0.0722));
          float k = pow(smoothstep(0.2, 0.98, l), 1.6);
          vec3 c = mix(uDark, uLight, k);
          c = mix(c, t * vec3(1.02, 1.0, 0.94), 0.12);
          float haze = smoothstep(0.75, 0.2, distance(vUv, vec2(0.35, 0.62)));
          c = mix(c, uLight * 1.04, haze * 0.25);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    sky.position.set(0, 26, -58);
    sky.renderOrder = -20;
    scene.add(sky);
  }

  const addSprite = (tex, x, y, z, height, opts = {}) => {
    const aspect = tex.image.width / tex.image.height;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height), spriteMat(tex, opts));
    mesh.position.set(x, y, z);
    if (opts.flip) mesh.scale.x = -1;
    if (opts.rot) mesh.rotation.z = opts.rot;
    mesh.renderOrder = opts.order ?? -10;
    scene.add(mesh);
    return mesh;
  };

  // far rock silhouettes (blurred, fogged)
  addSprite(rkPillar, -26, 4, -36, 22, { blur: 3.2, fog: 0.62, tint: '#9aa4a2', order: -15 });
  addSprite(rkBoulder, 25, 1, -38, 14, { blur: 3.2, fog: 0.62, tint: '#9aa4a2', order: -15 });
  addSprite(rkPillar, 27, 22, -40, 26, { blur: 3.4, fog: 0.66, tint: '#9aa4a2', flip: true, order: -15 });
  addSprite(rkCluster, -28, 26, -38, 16, { blur: 3.4, fog: 0.64, tint: '#9aa4a2', order: -15 });
  addSprite(rkBoulder, -24, 46, -40, 16, { blur: 3.4, fog: 0.66, tint: '#9aa4a2', flip: true, order: -15 });
  addSprite(rkPillar, 24, 44, -38, 22, { blur: 3.4, fog: 0.64, tint: '#9aa4a2', order: -15 });
  // soft grey rock silhouettes seen through the glass, as in the reference
  addSprite(rkPillar, -10, 5, -30, 17, { blur: 3.6, fog: 0.6, tint: '#959e9c', order: -14 });
  addSprite(rkBoulder, 11, 3, -32, 11, { blur: 3.6, fog: 0.62, tint: '#959e9c', order: -14, flip: true });
  addSprite(rkCluster, 8, 18, -34, 12, { blur: 3.8, fog: 0.64, tint: '#959e9c', order: -14 });
  addSprite(rkPillar, -12, 25, -33, 19, { blur: 3.8, fog: 0.64, tint: '#959e9c', order: -14, flip: true });
  addSprite(rkBoulder, 3, 35, -34, 13, { blur: 3.8, fog: 0.64, tint: '#959e9c', order: -14 });
  // mid rocks between sky and glass
  addSprite(rkCluster, -19, 9, -16, 11, { blur: 1.2, fog: 0.16, tint: '#6f7d7e', order: -12 });
  addSprite(rkBoulder, 19.5, 18, -18, 10, { blur: 1.2, fog: 0.18, tint: '#6f7d7e', flip: true, order: -12 });
  addSprite(rkLedge, -18, 33, -17, 7, { blur: 1.2, fog: 0.16, tint: '#6f7d7e', order: -12, fade: [0.2, 0.2, 0.1, 0.1] });
  addSprite(rkCluster, 18, 38, -16, 10, { blur: 1.2, fog: 0.16, tint: '#6f7d7e', flip: true, order: -12 });

  // cave walls (left = painted cliff, right = mirrored)
  const cliffH = 23;
  for (const [y, z, s, x] of [[3, 3.9, 1.0, -13.4], [20, 3.5, 1.06, -13.1], [38, 3.7, 0.98, -13.3], [56, 3.5, 1.0, -13.1]]) addSprite(cliffTex, x, y, z, cliffH * s, { order: -8, tint: '#c3cdcd', fade: [0, 0, 0.12, 0.12] });
  for (const [y, z, s, x] of [[11, 3.7, 1.04, 13.6], [29, 3.9, 0.98, 13.3], [47, 3.5, 1.02, 13.5], [-6, 3.8, 1.0, 13.5]]) addSprite(cliffTex, x, y, z, cliffH * s, { flip: true, order: -8, tint: '#c3cdcd', fade: [0, 0, 0.12, 0.12] });
  // gold sprigs near the walls
  addSprite(lfGoldA, -11.8, 4.2, 2.5, 3.6, { order: -7, rot: -0.15 });
  addSprite(lfGoldB, 12.2, 14, 2.0, 3.2, { order: -7, rot: 0.2, flip: true });
  addSprite(lfGoldA, -12.3, 25, 2.0, 3.0, { order: -7, rot: -0.3 });
  addSprite(lfGoldB, 11.6, 33, 2.0, 3.0, { order: -7, rot: 0.25 });

  // 3D painted rocks (image-to-3D) for real parallax
  {
    const src = rock3d.scene;
    src.traverse((o) => {
      if (o.isMesh) {
        const map = o.material.map;
        o.material = new THREE.MeshLambertMaterial({ map, color: new THREE.Color('#a3b2b6'), emissive: new THREE.Color('#4f5a5c'), emissiveMap: map });
      }
    });
    const place = (x, y, z, s, ry, rz = 0) => {
      const r = src.clone(true);
      r.position.set(x, y, z); r.scale.setScalar(s); r.rotation.set(0, ry, rz);
      scene.add(r);
    };
    place(-12.8, -1.6, 4.5, 7.5, 0.5);
    place(13.2, -1.8, 3.2, 8.0, -0.6);
    place(-13.6, 11.2, 1.0, 5.0, 1.4, 0.1);
    place(13.9, 21.6, 1.2, 5.5, -1.0, -0.15);
    place(-13.4, 31.5, 1.4, 5.0, 2.2, 0.2);
    place(13.7, 41.0, 1.0, 5.0, -2.4, 0.0);
  }

  // foreground: rock ridge hiding the base of the glass, dark leaves out of focus
  addSprite(ridgeTex, -1.5, -4.2, 7.8, 11.5, { order: 19, tint: '#9fabab', flip: true, fade: [0.05, 0.05, 0, 0.05] });
  addSprite(ridgeTex, 0.5, 1.4, 7.5, 11.5, { order: 20, tint: '#e4ecea' });
  const fg = [
    addSprite(lfDarkB, -10.8, 1.5, 12.5, 6.5, { order: 21, blur: 2.6, tint: '#55625f', rot: 0.35 }),
    addSprite(lfDarkA, 10.5, 9.5, 13.0, 7.0, { order: 21, blur: 2.8, tint: '#4e5b58', rot: 2.6 }),
    addSprite(lfDarkA, -10.5, 18, 13.0, 6.5, { order: 21, blur: 2.8, tint: '#4e5b58', rot: -2.4 }),
    addSprite(lfDarkB, 10.8, 27, 12.5, 6.0, { order: 21, blur: 2.6, tint: '#55625f', rot: -0.4, flip: true }),
    addSprite(lfDarkA, -10.2, 36, 13.0, 6.5, { order: 21, blur: 2.8, tint: '#4e5b58', rot: -2.2 }),
    addSprite(lfGoldB, -8.6, 4.2, 9.5, 3.2, { order: 21, blur: 1.2, rot: -0.2 }),
  ];

  // ── the hourglass ──
  const LS = 160;
  const sandTop = new THREE.Mesh(new THREE.PlaneGeometry(2 * RMAX, 2 * RMAX, LS, 110).rotateX(-Math.PI / 2), sandTopMat);
  sandTop.frustumCulled = false;
  scene.add(sandTop);
  const skinLower = new THREE.Mesh(new THREE.LatheGeometry(latheProfile(0.02, YN - 0.3, 150, -0.012), 112), sandSkinLowerMat);
  skinLower.frustumCulled = false;
  scene.add(skinLower);
  const upTop = new THREE.Mesh(new THREE.PlaneGeometry(2 * RMAX, 2 * RMAX, 140, 140).rotateX(-Math.PI / 2), sandUpTopMat);
  upTop.frustumCulled = false;
  scene.add(upTop);
  const skinUpper = new THREE.Mesh(new THREE.LatheGeometry(latheProfile(YN + 0.05, 2 * YN - 0.02, 170, -0.012), 112), sandUpSkinMat);
  skinUpper.frustumCulled = false;
  scene.add(skinUpper);
  // the sand plug in the neck narrows into the falling stream
  const tipPts = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12, y = YN - 0.75 + t * 0.85;
    tipPts.push(new THREE.Vector2(Math.max(0.09, lerp(0.09, bulbR(y) - 0.012, Math.pow(t, 0.7))), y));
  }
  const funnelTip = new THREE.Mesh(new THREE.LatheGeometry(tipPts, 48), sandUpSkinMat);
  funnelTip.frustumCulled = false;
  scene.add(funnelTip);

  const glassOuter = new THREE.Mesh(new THREE.LatheGeometry(latheProfile(0, 2 * YN, 260, GLASS_T), 120), glassMat);
  glassOuter.renderOrder = 10;
  scene.add(glassOuter);
  const glassInner = new THREE.Mesh(new THREE.LatheGeometry(latheProfile(0.05, 2 * YN - 0.05, 260, 0.0), 120), glassMat.clone());
  glassInner.material.uniforms = { ...glassMat.uniforms, uEdge: { value: 0.45 } };
  glassInner.renderOrder = 9;
  scene.add(glassInner);

  // the falling stream (a ribbon re-shaped every frame)
  const SEG = 72;
  const streamGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array((SEG + 1) * 2 * 3), sUv = new Float32Array((SEG + 1) * 2 * 2), sIdx = [];
  for (let k = 0; k < SEG; k++) { const a = k * 2; sIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  streamGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  streamGeo.setAttribute('uv', new THREE.BufferAttribute(sUv, 2).setUsage(THREE.DynamicDrawUsage));
  streamGeo.setIndex(sIdx);
  const streamMat = new THREE.ShaderMaterial({
    uniforms: { ...uni, uFlow: { value: 1 }, uGlow: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: GLSL_COMMON + /* glsl */`
      uniform sampler2D uSandTex; uniform float uTime; uniform float uFlow; uniform float uGlow; uniform vec3 uSandLit; uniform vec3 uSandShd;
      varying vec2 vUv; varying vec3 vW;
      void main() {
        float across = abs(vUv.x * 2.0 - 1.0);
        float edge = 1.0 - smoothstep(0.45, 1.0, across);
        float scroll = vUv.y * 0.9 - uTime * 3.4;
        float g = dot(texture2D(uSandTex, vec2(vUv.x * 0.18, scroll * 0.35)).rgb, vec3(0.2126, 0.7152, 0.0722));
        float streak = vnoise(vec2(vUv.x * 10.0, scroll * 4.0));
        float grains = step(0.78, hash12(floor(vec2(vUv.x * 14.0, scroll * 40.0))));
        vec3 col = mix(uSandShd, uSandLit * 1.12, 0.45 + (g - 0.545) * 4.0 + streak * 0.35 - across * 0.25);
        col += grains * vec3(0.25, 0.2, 0.1);
        col += uGlow * vec3(1.0, 0.82, 0.45) * (0.45 + streak * 0.6 + grains * 0.8);
        float a = edge * uFlow * (0.78 + 0.22 * streak);
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
      }`,
  });
  const stream = new THREE.Mesh(streamGeo, streamMat);
  stream.frustumCulled = false;
  stream.renderOrder = 5;
  scene.add(stream);

  // particles
  const fx = new Particles(900, fxTex, 12);      // grains, puffs, sparkles
  const dust = new Particles(260, fxTex, 11);    // floating golden dust (ambient)
  for (let i = 0; i < 220; i++) spawnDust(dust, true);

  // motes of light
  const orbTex = fxTex.clone(); orbTex.repeat.set(0.5, 0.5); orbTex.offset.set(0, 0.5); orbTex.needsUpdate = true;
  const starTex = fxTex.clone(); starTex.repeat.set(0.5, 0.5); starTex.offset.set(0.5, 0); starTex.needsUpdate = true;
  const motes = MOTES_DEF.map((d, i) => {
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: orbTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, color: new THREE.Color(1.0, 0.86, 0.6) }));
    halo.scale.setScalar(2.6); halo.renderOrder = 13;
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: orbTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, color: new THREE.Color(1.6, 1.4, 1.05) }));
    core.scale.setScalar(0.85); core.renderOrder = 14;
    const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, color: new THREE.Color(1.3, 1.15, 0.9) }));
    star.scale.setScalar(1.5); star.renderOrder = 14;
    scene.add(halo, core, star);
    return { ...d, i, halo, core, star, taken: false, fly: 0, done: false, px: d.x, py: d.y };
  });

  // the wanderer (image-to-3D GLB), deformed in the vertex shader for walk / jump / call poses
  const charRoot = new THREE.Group();
  scene.add(charRoot);
  const wscene = wanderer.scene;
  let charMat = null;
  wscene.traverse((o) => {
    if (o.isMesh) {
      const map = o.material.map;
      charMat = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: map }, uSun: uni.uSun, uCam: uni.uCam, uGlow: { value: 0 },
          uPhase: { value: 0 }, uLegAmp: { value: 0 }, uArmSwing: { value: 0 }, uArmRaise: { value: 0 }, uArmFwd: { value: 0 }, uTuck: { value: 0 },
          uFade: { value: 1 },
        },
        transparent: false, side: THREE.DoubleSide,
        vertexShader: /* glsl */`
          uniform float uPhase, uLegAmp, uArmSwing, uArmRaise, uArmFwd, uTuck;
          varying vec2 vUv; varying vec3 vN; varying vec3 vW;
          mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
          void main() {
            vec3 p = position; vec3 n = normal;
            float Y = -p.z; float X = p.x;
            float side = X < 0.0 ? -1.0 : 1.0;
            float legW = (1.0 - smoothstep(0.305, 0.335, Y)) * (1.0 - smoothstep(0.10, 0.13, abs(X)));
            if (legW > 0.0) {
              float a = sin(uPhase) * uLegAmp * side + uTuck * (side > 0.0 ? 0.55 : -0.35);
              vec2 q = rot2(a) * vec2(p.y, Y - 0.42);
              vec3 pp = vec3(p.x, q.x, -(q.y + 0.42));
              vec2 nq = rot2(a) * vec2(n.y, -n.z);
              p = mix(p, pp, legW); n = normalize(mix(n, vec3(n.x, nq.x, -nq.y), legW));
            }
            float armW = smoothstep(0.15, 0.235, abs(X)) * (1.0 - smoothstep(0.79, 0.85, Y)) * smoothstep(0.42, 0.47, Y);
            if (armW > 0.0) {
              vec3 piv = vec3(side * 0.125, 0.0, -0.785);
              vec3 q = p - piv;
              float phi = side * (uArmRaise - 0.34);
              vec2 a2 = rot2(phi) * vec2(q.x, -q.z); q.x = a2.x; q.z = -a2.y;
              float psi = -sin(uPhase) * uArmSwing * side + uArmFwd;
              vec2 b2 = rot2(psi) * vec2(q.y, -q.z); q.y = b2.x; q.z = -b2.y;
              vec2 na = rot2(phi) * vec2(n.x, -n.z); vec3 nn = vec3(na.x, n.y, -na.y);
              vec2 nb = rot2(psi) * vec2(nn.y, -nn.z); nn = vec3(nn.x, nb.x, -nb.y);
              p = mix(p, piv + q, armW); n = normalize(mix(n, nn, armW));
            }
            vUv = uv;
            vec4 wp = modelMatrix * vec4(p, 1.0);
            vW = wp.xyz;
            vN = normalize(mat3(modelMatrix) * n);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */`
          uniform sampler2D map; uniform vec3 uSun; uniform vec3 uCam; uniform float uGlow;
          varying vec2 vUv; varying vec3 vN; varying vec3 vW;
          void main() {
            vec4 t = texture2D(map, vUv);
            vec3 n = normalize(vN);
            vec3 v = normalize(uCam - vW);
            if (dot(n, v) < 0.0) n = -n;
            float diff = clamp(dot(n, uSun) * 0.5 + 0.5, 0.0, 1.0);
            vec3 col = t.rgb * (0.68 + 0.5 * diff);
            float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.5);
            col += rim * vec3(1.0, 0.93, 0.78) * 0.28;
            col += uGlow * vec3(1.0, 0.78, 0.38) * (0.18 + rim * 0.9);
            gl_FragColor = vec4(col, 1.0);
          }`,
      });
      o.material = charMat;
      o.frustumCulled = false;
    }
  });
  charRoot.add(wscene);

  // the scarf — verlet ribbon textured with the scarf fabric from the generated character sheet
  const SC_N = 15;
  const scarf = { n: SC_N, seg: 0.058, pts: [] };
  for (let i = 0; i < SC_N; i++) scarf.pts.push({ x: START_X - i * 0.06, y: BASE + 0.86, z: 0, px: START_X - i * 0.06, py: BASE + 0.86, pz: 0 });
  const scGeo = new THREE.BufferGeometry();
  const scPos = new Float32Array(SC_N * 2 * 3), scUv = new Float32Array(SC_N * 2 * 2), scIdx = [];
  for (let i = 0; i < SC_N; i++) { scUv[i * 4] = 0; scUv[i * 4 + 1] = i / (SC_N - 1); scUv[i * 4 + 2] = 1; scUv[i * 4 + 3] = i / (SC_N - 1); }
  for (let i = 0; i < SC_N - 1; i++) { const a = i * 2; scIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  scGeo.setAttribute('position', new THREE.BufferAttribute(scPos, 3).setUsage(THREE.DynamicDrawUsage));
  scGeo.setAttribute('uv', new THREE.BufferAttribute(scUv, 2));
  scGeo.setIndex(scIdx);
  const scMat = new THREE.MeshBasicMaterial({ map: scarfTex, side: THREE.DoubleSide, color: new THREE.Color(1, 1, 1) });
  const scMesh = new THREE.Mesh(scGeo, scMat);
  scMesh.frustumCulled = false;
  scene.add(scMesh);
  scarf.geo = scGeo; scarf.pos = scPos; scarf.mat = scMat;

  // golden sprigs that grow on the other side (ending)
  const sprigs = [lfGoldA, lfGoldB].map((tex, i) => {
    const m = addSprite(tex, 0, 0, 0.3 - i * 0.6, 1.6, { order: 15, flip: i === 1 });
    m.visible = false;
    return m;
  });
  const finalLight = new THREE.Sprite(new THREE.SpriteMaterial({ map: orbTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, color: new THREE.Color(1.5, 1.25, 0.85), opacity: 0 }));
  finalLight.scale.setScalar(7); finalLight.renderOrder = 14;
  scene.add(finalLight);

  Object.assign(W, { fg, sandTop, skinLower, upTop, skinUpper, glassOuter, glassInner, stream, streamGeo, sPos, sUv, SEG, streamMat, fx, dust, motes, charRoot, charMat, scarf, sprigs, finalLight });
  return W;
}

function spawnDust(dust, initial) {
  const cy = camera.position.y;
  const near = Math.random() < 0.12; // a few big out-of-focus specks close to the lens
  dust.spawn({
    x: (Math.random() - 0.5) * (near ? 16 : 34), y: cy + (Math.random() - 0.5) * (initial ? 22 : 24) * (near ? 0.6 : 1), z: near ? 9 + Math.random() * 5 : (Math.random() - 0.5) * 14 + 1,
    vx: (Math.random() - 0.5) * 0.15, vy: 0.05 + Math.random() * 0.12, vz: 0,
    life: 9 + Math.random() * 10, s0: near ? 0.25 + Math.random() * 0.25 : 0.07 + Math.random() * 0.1, frame: 0,
    a: near ? 0.18 + Math.random() * 0.15 : 0.6 + Math.random() * 0.4,
    fadeIn: 2.0, twinkle: 1.5 + Math.random() * 3, r: 1.0, gr: 0.85, b: 0.55,
  });
}

// ───────────────────────────── helpers ─────────────────────────────
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const smooth = (t) => t * t * (3 - 2 * t);

let hintTimer = null;
function hint(text, seconds = 4) {
  const el = $('hint');
  el.textContent = text;
  el.style.opacity = text ? 1 : 0;
  clearTimeout(hintTimer);
  if (text && seconds > 0) hintTimer = setTimeout(() => { el.style.opacity = 0; }, seconds * 1000);
}

function groundAt(x) {
  if (G.state === 'upper' || G.state === 'ending' || G.state === 'end') return upperSurf(x, upper.L, upper.D);
  return sandAt(x);
}
function wallLimit(y) {
  const r = Math.min(bulbR(y + 0.35), bulbR(y + 1.0));
  return Math.max(0, r - 0.24);
}

// stream centre-line: from the neck down to the landing point
function streamPoint(t, out) {
  const y0 = YN + 1.2, y1 = G.yLand, x1 = G.xLand;
  const yc = y1 + (y0 - y1) * 0.42;
  const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
  out.x = b * 0 + c * x1;
  out.y = a * y0 + b * yc + c * y1;
  return out;
}
function streamXAt(y) {
  // invert the Bezier in y (monotonic) by bisection
  let lo = 0, hi = 1; const p = { x: 0, y: 0 };
  for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; streamPoint(m, p); if (p.y > y) lo = m; else hi = m; }
  streamPoint((lo + hi) / 2, p);
  return p.x;
}

// ───────────────────────────── game flow ─────────────────────────────
function resetRun(keepMotes) {
  sandReset();
  G.remaining = SAND_TOTAL; G.flow = 0; G.calling = false; G.xLand = 0;
  solveUpper(G.remaining);
  P.x = START_X; P.y = sandAt(START_X); P.vx = 0; P.vy = 0; P.facing = 1; P.yaw = Math.PI / 2; P.visible = true;
  for (const p of world.scarf.pts) { p.x = p.px = P.x - 0.2; p.y = p.py = P.y + 0.86; p.z = p.pz = 0; }
  if (!keepMotes) {
    G.collected = 0;
    for (const m of world.motes) { m.taken = false; m.done = false; m.fly = 0; m.px = m.x; m.py = m.y; }
    document.querySelectorAll('#hud .cyc i').forEach((d) => d.classList.remove('on'));
  }
  updateDilation();
}

function setState(s) { G.state = s; G.stateT = 0; }

function startGame() {
  resumeAudio();
  $('title').style.opacity = 0;
  $('hud').style.opacity = 1;
  setState('play');
  G.playTime = 0;
  hint('← → walk · space jump · hold ↓ to call the sand', 9);
}

function restart() {
  $('end').style.opacity = 0;
  $('hud').style.opacity = 1;
  gradePass.uniforms.uFade.value = 0;
  G.turns = 0;
  for (const s of world.sprigs) s.visible = false;
  world.finalLight.material.opacity = 0;
  resetRun(false);
  camDist = 23;
  camPos.set(clamp(P.x * 0.5, -4.5, 4.5), Math.max(8.2, P.y + 2.0), 23);
  camLook.set(clamp(P.x * 0.55, -5, 5), Math.max(6.9, P.y + 0.7), 0);
  G.whiteIn = 1;
  setState('play');
  G.playTime = 0;
  hint('← → walk · space jump · hold ↓ to call the sand', 6);
}

// input
const KEY_LEFT = ['ArrowLeft', 'KeyA', 'KeyQ'], KEY_RIGHT = ['ArrowRight', 'KeyD'];
const KEY_JUMP = ['Space', 'ArrowUp', 'KeyW', 'KeyZ'], KEY_CALL = ['ArrowDown', 'KeyS', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyC', 'KeyX'];
const down = (list) => list.some((k) => keys.has(k));
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyM') { audio.muted = !audio.muted; if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.9; }
  if (G.state === 'title' && (e.code === 'Space' || e.code === 'Enter')) { startGame(); return; }
  if (G.state === 'end' && G.stateT > 1.5 && (e.code === 'Space' || e.code === 'Enter')) { restart(); return; }
  if (KEY_JUMP.includes(e.code)) P.jumpBuf = 0.14;
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (KEY_JUMP.includes(e.code) && P.vy > 2 && !P.grounded && G.state === 'play') P.vy *= 0.55;
});
window.addEventListener('blur', () => keys.clear());
window.addEventListener('pointerdown', () => { if (G.state === 'title') startGame(); else if (G.state === 'end' && G.stateT > 1.5) restart(); });

// ───────────────────────────── per-frame update ─────────────────────────────
const tmpP = { x: 0, y: 0 };
let camDist = 23;
const camLook = new THREE.Vector3(0, 6, 0);
const camPos = new THREE.Vector3(0, 8, 23);

function collectMote(m) {
  m.taken = true; m.fly = 0;
  G.collected++;
  sfx('chime', 0.8, 0.95 + G.collected * 0.07);
  const dots = document.querySelectorAll('#hud .cyc i');
  dots.forEach((d, i) => d.classList.toggle('on', i < G.collected));
  for (let k = 0; k < 26; k++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3;
    world.fx.spawn({ x: m.px, y: m.py, z: 0.2, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.8 + Math.random() * 0.6, s0: 0.25, s1: 0.05, frame: 3, drag: 2.5, r: 1.2, gr: 1.0, b: 0.7, vr: 2 });
  }
  world.fx.spawn({ x: m.px, y: m.py, z: 0.3, life: 0.9, s0: 1.2, s1: 4.5, frame: 0, a: 0.9, r: 1.2, gr: 1.0, b: 0.7 });
  if (G.collected === 1) hint('gather the three lights', 4);
  if (G.collected === 3) hint('step into the falling sand', 0);
}

function updatePlay(dt) {
  const left = down(KEY_LEFT), right = down(KEY_RIGHT);
  const allLight = G.collected >= 3;
  const canCall = !allLight && G.remaining > SAND_MIN && P.grounded;
  const wantCall = down(KEY_CALL) && canCall;
  G.calling = wantCall;
  if (wantCall) {
    G.callT += dt;
    if (!G.firstCall && G.callT > 1.2) { G.firstCall = true; hint('the sand answers — build a dune toward the light', 5); }
  } else G.callT = 0;

  if (G.calling && Math.random() < dt * 22) {
    const hx = P.x + P.facing * 0.32, hy = P.y + 0.78;
    const dx = G.xLand - hx, dy = G.yLand + 0.6 - hy;
    world.fx.spawn({ x: hx, y: hy, z: 0.15, vx: dx * 1.1 + (Math.random() - 0.5) * 0.4, vy: dy * 1.1 + 0.6 + Math.random() * 0.5, life: 0.9, s0: 0.12, s1: 0.04, frame: 3, a: 0.95, r: 1.25, gr: 1.0, b: 0.65, vr: 3, drag: 0.6 });
  }
  // horizontal movement
  const dir = (right ? 1 : 0) - (left ? 1 : 0);
  if (dir !== 0) P.facing = dir;
  const slopeAhead = (groundAt(P.x + 0.12 * (dir || P.facing)) - groundAt(P.x - 0.12 * (dir || P.facing))) / 0.24;
  let target = 0;
  if (!G.calling) {
    const uphill = Math.max(0, slopeAhead * (dir || 0));
    target = dir * 3.5 * clamp(1 - uphill * 0.42, 0.42, 1.08);
  }
  P.vx = damp(P.vx, target, P.grounded ? 12 : 5, dt);

  // slide on steep sand
  const g = groundAt(P.x);
  const localSlope = (groundAt(P.x + 0.1) - groundAt(P.x - 0.1)) / 0.2;
  if (P.grounded && Math.abs(localSlope) > 0.86 && !G.calling) P.vx -= Math.sign(localSlope) * 7 * dt;

  // jump
  P.coyote = P.grounded ? 0.1 : P.coyote - dt;
  P.jumpBuf -= dt;
  if (P.jumpBuf > 0 && P.coyote > 0) {
    P.vy = 10.1; P.grounded = false; P.coyote = 0; P.jumpBuf = 0;
    sfx('step', 0.55, 0.85);
    for (let k = 0; k < 7; k++) world.fx.spawn({ x: P.x + (Math.random() - 0.5) * 0.3, y: g + 0.05, z: (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5) * 1.6, vy: 0.6 + Math.random() * 1.4, g: 6, life: 0.7, s0: 0.07, frame: 0, a: 0.8, r: 1.0, gr: 0.8, b: 0.5 });
  }

  // the stream: landing target
  const wl = wallLimit(P.y);
  let tx = 0;
  if (G.calling) tx = clamp(P.x + P.facing * 1.35, -wallLimit(g) + 0.2, wallLimit(g) - 0.2);
  G.xLand = damp(G.xLand, tx, G.calling ? 2.6 : 0.9, dt);

  // stream interaction
  const sx = streamXAt(clamp(P.y + 0.6, G.yLand, YN));
  const inStream = Math.abs(P.x - sx) < 0.42 && P.y + 0.4 < YN && G.flow > 0.15;
  if (inStream && allLight) { startAscent(); return; }
  if (inStream && !allLight && !G.calling) {
    // the falling sand weighs on her: she wades through it slowly
    P.vx = clamp(P.vx, -1.3, 1.3);
    if (!P.grounded) P.vy -= 26 * dt;
    if (Math.random() < 0.7) {
      const sd = Math.random() < 0.5 ? -1 : 1;
      world.fx.spawn({ x: P.x + sd * 0.1, y: P.y + 1.15, z: 0.12, vx: sd * (0.8 + Math.random()), vy: 0.6 + Math.random() * 0.6, g: 10, life: 0.6, s0: 0.06, frame: 0, a: 0.85, r: 1, gr: 0.82, b: 0.5 });
    }
  }

  // integrate
  P.vy -= 24 * dt;
  P.x += P.vx * dt;
  P.y += P.vy * dt;
  if (Math.abs(P.x) > wl) { P.x = Math.sign(P.x) * wl; P.vx = 0; }
  const g2 = groundAt(P.x);
  if (P.y <= g2 + 0.02 && P.vy <= 0.5) {
    if (!P.grounded && P.vy < -6) {
      sfx('step', 0.5, 0.75);
      for (let k = 0; k < 6; k++) world.fx.spawn({ x: P.x + (Math.random() - 0.5) * 0.4, y: g2 + 0.05, z: (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5) * 2, vy: 0.4 + Math.random(), g: 6, life: 0.6, s0: 0.07, frame: 0, a: 0.7, r: 1, gr: 0.8, b: 0.5 });
      world.fx.spawn({ x: P.x, y: g2 + 0.2, z: 0.2, life: 1.0, s0: 0.6, s1: 1.4, frame: 2, a: 0.35, r: 1, gr: 0.85, b: 0.6 });
    }
    P.y = g2; P.vy = 0; P.grounded = true;
  } else if (P.y > g2 + 0.06) {
    P.grounded = false;
  }
  if (P.grounded) P.y = Math.max(P.y, g2);

  // footsteps
  if (P.grounded && Math.abs(P.vx) > 0.5) {
    P.stepAcc += Math.abs(P.vx) * dt;
    if (P.stepAcc > 0.62) {
      P.stepAcc = 0;
      sfx('step', 0.16 + Math.random() * 0.08, 0.9 + Math.random() * 0.3);
      world.fx.spawn({ x: P.x - P.facing * 0.1, y: g2 + 0.03, z: 0.05, vx: -P.vx * 0.15, vy: 0.5, g: 4, life: 0.6, s0: 0.25, s1: 0.6, frame: 2, a: 0.25, r: 1, gr: 0.85, b: 0.6 });
    }
  }

  // motes
  for (const m of world.motes) {
    if (m.taken) continue;
    const dx = m.px - P.x, dy = m.py - (P.y + 0.62);
    if (dx * dx + dy * dy < 0.78 * 0.78) collectMote(m);
  }

  // out of sand → the hourglass turns
  if (G.remaining <= SAND_MIN + 0.001 && G.flow < 0.05) {
    if (G.stateT > 0 && !G.turnPending) { G.turnPending = true; G.turnAt = G.t + 1.6; }
  }
  if (G.turnPending && G.t > G.turnAt) { G.turnPending = false; startTurn(); }
}

function startAscent() {
  setState('ascend');
  P.vy = 2; P.grounded = false;
  sfx('ascend', 0.9);
  hint('', 0);
}

function updateAscend(dt) {
  const sx = G.yLand < P.y ? streamXAt(clamp(P.y + 0.5, G.yLand, YN)) : 0;
  P.x = damp(P.x, sx - 0.05, 4, dt);
  P.vy = damp(P.vy, 4.6, 1.2, dt);
  P.y += P.vy * dt;
  P.vx = 0;
  if (Math.random() < 0.9) world.fx.spawn({ x: P.x + (Math.random() - 0.5) * 0.6, y: P.y + Math.random() * 1.2, z: (Math.random() - 0.5) * 0.5, vx: (Math.random() - 0.5) * 0.4, vy: -1.5 - Math.random(), life: 1.1, s0: 0.18, s1: 0.02, frame: 3, a: 0.9, r: 1.2, gr: 1.0, b: 0.7, vr: 3 });
  // entering the upper sand: she vanishes into the falling time, then bursts out of the crater
  const craterBottom = upper.L - upper.D;
  if (P.y > YN + 0.6 && craterBottom > YN + 0.9) P.visible = false;
  if (P.y >= craterBottom - 0.05) {
    P.y = craterBottom; P.vy = 0; P.visible = true; P.grounded = true;
    setState('upper');
    G.keptFrac = (G.remaining - SAND_MIN) / (SAND_TOTAL - SAND_MIN);
    sfx('step', 0.8, 0.6);
    for (let k = 0; k < 36; k++) {
      const a = Math.PI * (0.15 + Math.random() * 0.7), s = 2 + Math.random() * 4;
      world.fx.spawn({ x: P.x, y: P.y + 0.2, z: (Math.random() - 0.5) * 0.6, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 9, life: 1.2, s0: 0.09, frame: 0, a: 0.9, r: 1, gr: 0.82, b: 0.5 });
    }
    world.fx.spawn({ x: P.x, y: P.y + 0.6, z: 0.3, life: 1.0, s0: 1.0, s1: 3.0, frame: 1, a: 0.8, r: 1, gr: 0.85, b: 0.6 });
    world.fx.spawn({ x: P.x, y: P.y + 0.4, z: 0.3, life: 1.6, s0: 1.2, s1: 3.4, frame: 2, a: 0.45, r: 1, gr: 0.85, b: 0.6 });
    hint('the other side', 3);
  }
}

function updateUpper(dt) {
  const left = down(KEY_LEFT), right = down(KEY_RIGHT);
  const dir = (right ? 1 : 0) - (left ? 1 : 0);
  if (dir !== 0) P.facing = dir;
  P.vx = damp(P.vx, dir * 3.0, 10, dt);
  const L = upper.L, D = upper.D;
  const craterR = D / SLOPE;
  const inCrater = Math.abs(P.x) < craterR - 0.05;
  if (inCrater && P.grounded) P.x -= Math.sign(P.x || 1) * 0.5 * dt * (1 - Math.abs(P.x) / craterR); // sand drains toward the funnel
  P.coyote = P.grounded ? 0.1 : P.coyote - dt;
  P.jumpBuf -= dt;
  if (P.jumpBuf > 0 && P.coyote > 0) { P.vy = 9.5; P.grounded = false; P.jumpBuf = 0; P.coyote = 0; sfx('step', 0.5, 0.85); }
  P.vy -= 24 * dt;
  P.x += P.vx * dt; P.y += P.vy * dt;
  const wl = wallLimit(P.y);
  if (Math.abs(P.x) > wl) { P.x = Math.sign(P.x) * wl; P.vx = 0; }
  const g = upperSurf(P.x, L, D);
  if (P.y <= g + 0.02 && P.vy <= 0.5) { P.y = g; P.vy = 0; P.grounded = true; } else if (P.y > g + 0.06) P.grounded = false;
  if (P.grounded && Math.abs(P.vx) > 0.5) {
    P.stepAcc += Math.abs(P.vx) * dt;
    if (P.stepAcc > 0.62) { P.stepAcc = 0; sfx('step', 0.18, 0.95 + Math.random() * 0.2); }
  }
  // reaching the rim of the crater: the journey is complete
  const rim = Math.min(craterR + 0.35, wallLimit(P.y) - 0.06);
  if (P.grounded && Math.abs(P.x) >= rim && G.stateT > 1.0) startEnding();
  if (G.stateT > 14) startEnding();
}

function startEnding() {
  if (G.state === 'ending') return;
  setState('ending');
  G.endT = 0;
  hint('', 0);
  const s = world.sprigs;
  s[0].position.set(P.x + P.facing * 0.75, P.y, 0.3); s[1].position.set(P.x + P.facing * 1.25, P.y, -0.2);
  for (const m of s) { m.visible = true; m.scale.set(m.scale.x < 0 ? -0.001 : 0.001, 0.001, 1); }
  sfx('ascend', 0.6, 0.8);
  if (audio.musicGain) audio.musicGain.gain.setTargetAtTime(0.75, audio.ctx.currentTime, 2);
}

function updateEnding(dt) {
  G.endT += dt;
  const t = G.endT;
  P.vx = 0;
  P.facing = P.facing || 1;
  // sprigs grow from the sand
  world.sprigs.forEach((m, i) => {
    const k = smooth(clamp((t - 0.4 - i * 0.5) / 1.6, 0, 1));
    const sx = (i === 1 ? -1 : 1) * Math.max(0.001, k);
    m.scale.set(sx, Math.max(0.001, k), 1);
    const base = m.geometry.parameters.height;
    m.position.y = P.y + base * k * 0.5 - 0.05;
  });
  // the three lights leave her scarf and rise to the dome
  const fl = world.finalLight;
  fl.position.set(P.x * 0.3, Math.min(2 * YN - 3.0, upper.L + 4.2), -0.5);
  fl.material.opacity = smooth(clamp((t - 2.5) / 3, 0, 1)) * (0.85 + 0.15 * Math.sin(G.t * 2));
  if (t > 1.2 && t < 4.5 && Math.random() < 0.6) {
    world.fx.spawn({ x: P.x + (Math.random() - 0.5) * 0.4, y: P.y + 0.9, z: 0.2, vx: (0 - P.x) * 0.25 + (Math.random() - 0.5), vy: 3.5 + Math.random() * 2, life: 2.6, s0: 0.3, s1: 0.1, frame: 3, a: 1, r: 1.2, gr: 1.0, b: 0.7, vr: 2 });
  }
  if (t > 7.5 && G.state === 'ending') {
    setState('end');
    const kept = Math.round(100 * clamp(G.keptFrac, 0, 1));
    const mm = Math.floor(G.playTime / 60), ss = Math.floor(G.playTime % 60);
    $('end').querySelector('.stats').textContent = `${kept}% of the sand kept · ${mm}:${String(ss).padStart(2, '0')}${G.turns ? ` · ${G.turns} turn${G.turns > 1 ? 's' : ''} of the glass` : ''}`;
    $('end').style.opacity = 1;
    $('hud').style.opacity = 0;
  }
}

function startTurn() {
  setState('turning');
  sfx('turn', 0.9);
  hint('', 0);
}
function updateTurning(dt) {
  const t = G.stateT;
  gradePass.uniforms.uFade.value = t < 1.4 ? smooth(t / 1.4) : t < 2.0 ? 1 : 1 - smooth(clamp((t - 2.0) / 1.4, 0, 1));
  if (t >= 1.5 && !G.turnReset) {
    G.turnReset = true;
    G.turns++;
    resetRun(true);
  }
  if (t > 3.4) {
    G.turnReset = false;
    gradePass.uniforms.uFade.value = 0;
    setState('play');
    hint(G.collected ? 'the hourglass turned — your light remains' : 'the hourglass turned', 4);
  }
}

// sand flow + simulation, every state
function updateSand(dt) {
  const flowing = G.state !== 'title' && G.state !== 'loading' && G.state !== 'turning';
  let want = G.calling ? Q_CALL : Q_IDLE;
  if (G.remaining <= SAND_MIN + 0.001) want = 0;
  if (G.state === 'title') want = Q_IDLE;
  G.flow = damp(G.flow, want, 2.5, dt);
  if (flowing && G.state !== 'end') {
    const amt = Math.min(G.flow * dt, Math.max(0, G.remaining - SAND_MIN));
    if (amt > 0) {
      G.remaining -= amt;
      deposit(G.xLand, amt);
    }
  }
  relax(24);
  G.yLand = sandAt(G.xLand);
  solveUpper(G.remaining);
  updateDilation();
}

function updateStreamMesh() {
  const W = world, pos = W.sPos, uv = W.sUv, SEG = W.SEG;
  const width = 0.11 + 0.06 * clamp((G.flow - Q_IDLE) / (Q_CALL - Q_IDLE), 0, 1) + (G.collected >= 3 ? 0.03 : 0);
  let prevX = 0, prevY = YN + 1.2, vacc = 0;
  for (let k = 0; k <= SEG; k++) {
    const t = k / SEG;
    streamPoint(t, tmpP);
    let tx = tmpP.x - prevX, ty = tmpP.y - prevY;
    if (k === 0) { streamPoint(1 / SEG, tmpP); tx = tmpP.x; ty = tmpP.y - (YN + 1.2); streamPoint(0, tmpP); }
    const len = Math.hypot(tx, ty) || 1;
    vacc += k === 0 ? 0 : len;
    const nx = -ty / len, ny = tx / len;
    const neck = clamp((YN - tmpP.y) / 1.5, 0, 1);
    const w = width * (0.55 + 0.45 * neck) * (1 + 0.6 * smooth(clamp((t - 0.88) / 0.12, 0, 1)));
    pos[k * 6] = tmpP.x + nx * w; pos[k * 6 + 1] = tmpP.y + ny * w; pos[k * 6 + 2] = 0;
    pos[k * 6 + 3] = tmpP.x - nx * w; pos[k * 6 + 4] = tmpP.y - ny * w; pos[k * 6 + 5] = 0;
    uv[k * 4] = 0; uv[k * 4 + 1] = vacc; uv[k * 4 + 2] = 1; uv[k * 4 + 3] = vacc;
    prevX = tmpP.x; prevY = tmpP.y;
  }
  W.streamGeo.attributes.position.needsUpdate = true;
  W.streamGeo.attributes.uv.needsUpdate = true;
  W.streamMat.uniforms.uFlow.value = clamp(G.flow / 0.35, 0, 1);
  W.streamMat.uniforms.uGlow.value = damp(W.streamMat.uniforms.uGlow.value, G.collected >= 3 && G.state === 'play' ? 0.55 + 0.25 * Math.sin(G.t * 3) : (G.calling ? 0.25 : 0), 4, 1 / 60);
}

function updateImpact(dt) {
  if (G.flow < 0.1 || G.state === 'loading') return;
  const rate = G.flow * 18;
  const n = Math.floor(rate * dt + Math.random());
  for (let k = 0; k < n; k++) {
    const a = Math.PI * (0.12 + Math.random() * 0.76), s = 0.8 + Math.random() * 1.8 * (0.6 + G.flow * 0.4);
    world.fx.spawn({ x: G.xLand + (Math.random() - 0.5) * 0.15, y: G.yLand + 0.05, z: (Math.random() - 0.5) * 0.3, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.9, vz: (Math.random() - 0.5) * 0.8, g: 9, life: 0.45 + Math.random() * 0.4, s0: 0.05 + Math.random() * 0.05, frame: 0, a: 0.75, r: 1.0, gr: 0.82, b: 0.5 });
  }
  if (Math.random() < dt * (2 + G.flow * 2)) world.fx.spawn({ x: G.xLand, y: G.yLand + 0.25, z: 0.25, life: 1.4, s0: 0.5, s1: 1.4 + G.flow * 0.4, frame: 2, a: 0.22 + G.flow * 0.06, r: 1, gr: 0.85, b: 0.62, vy: 0.25, fadeIn: 0.3 });
  if (Math.random() < dt * (1.5 + G.flow * 1.5)) world.fx.spawn({ x: G.xLand, y: G.yLand + 0.35, z: 0.3, life: 0.5, s0: 0.45, s1: 0.8 + G.flow * 0.25, frame: 1, a: 0.35, r: 1, gr: 0.85, b: 0.6, rot: (Math.random() - 0.5) * 0.6 });
  // a few grains falling alongside the stream
  if (Math.random() < dt * 8) {
    const t = Math.random() * 0.9;
    streamPoint(t, tmpP);
    world.fx.spawn({ x: tmpP.x + (Math.random() - 0.5) * 0.25, y: tmpP.y, z: (Math.random() - 0.5) * 0.2, vy: -3, g: 6, life: 0.6, s0: 0.05, frame: 0, a: 0.6, r: 1, gr: 0.82, b: 0.5 });
  }
}

function updateMotes(dt) {
  for (const m of world.motes) {
    const bob = Math.sin(G.t * 1.3 + m.i * 2.1) * 0.13;
    if (!m.taken) {
      m.px = m.x + Math.sin(G.t * 0.5 + m.i) * 0.08; m.py = m.y + bob;
      const pulse = 0.85 + 0.15 * Math.sin(G.t * 2.4 + m.i);
      m.halo.position.set(m.px, m.py, 0.25); m.core.position.set(m.px, m.py, 0.3); m.star.position.set(m.px, m.py, 0.35);
      m.halo.scale.setScalar(2.4 * pulse); m.core.scale.setScalar(0.8 + 0.08 * Math.sin(G.t * 4 + m.i));
      m.star.scale.setScalar(1.3 + 0.25 * Math.sin(G.t * 3.1 + m.i)); m.star.material.rotation = G.t * 0.4 + m.i;
      m.halo.visible = m.core.visible = m.star.visible = G.state !== 'loading';
      if (Math.random() < dt * 3) {
        const a = Math.random() * 6.28;
        world.fx.spawn({ x: m.px + Math.cos(a) * 0.5, y: m.py + Math.sin(a) * 0.5, z: 0.3, vx: -Math.sin(a) * 0.5, vy: Math.cos(a) * 0.5 + 0.2, life: 1.4, s0: 0.16, s1: 0.03, frame: 3, a: 0.9, r: 1.2, gr: 1.0, b: 0.75, vr: 2 });
      }
    } else if (!m.done) {
      m.fly += dt * 2.2;
      const k = smooth(clamp(m.fly, 0, 1));
      const tx = P.x, ty = P.y + 0.75;
      const x = lerp(m.px, tx, k), y = lerp(m.py, ty, k) + Math.sin(k * Math.PI) * 0.6;
      m.halo.position.set(x, y, 0.25); m.core.position.set(x, y, 0.3); m.star.position.set(x, y, 0.35);
      const s = 1 - k * 0.85;
      m.halo.scale.setScalar(2.4 * s); m.core.scale.setScalar(0.8 * s); m.star.scale.setScalar(1.3 * s);
      if (m.fly >= 1) { m.done = true; m.halo.visible = m.core.visible = m.star.visible = false; }
    }
  }
  const pm = (m) => (m.taken ? 0 : 1);
  const [a, b, c] = world.motes;
  uni.uMoteA.value.set(a.px, a.py, 0, pm(a));
  uni.uMoteB.value.set(b.px, b.py, 0, pm(b));
  uni.uMoteC.value.set(c.px, c.py, 0, pm(c));
}

function updateCharacter(dt) {
  const W = world;
  const moving = Math.abs(P.vx) > 0.15 && P.grounded;
  P.phase += Math.abs(P.vx) * dt * 4.3;
  const air = !P.grounded && G.state !== 'ascend';
  const callK = G.calling ? 1 : 0;
  const asc = G.state === 'ascend' ? 1 : 0;
  const end = G.state === 'ending' || G.state === 'end' ? 1 : 0;
  P.legAmp = damp(P.legAmp, moving ? clamp(Math.abs(P.vx) / 3.5, 0, 1) * 0.62 : 0, 10, dt);
  P.armSwing = damp(P.armSwing, moving ? 0.45 : 0, 10, dt);
  P.tuck = damp(P.tuck, air ? 1 : 0, 10, dt);
  P.armRaise = damp(P.armRaise, air ? 0.75 : asc ? 2.35 : callK ? 0.35 : end ? 0.55 : 0, 7, dt);
  P.armFwd = damp(P.armFwd, callK ? 1.75 : asc ? 0.2 : 0, 6, dt);
  const charged = G.collected / 3;
  P.glow = damp(P.glow, asc ? 1 : callK * 0.45 + charged * 0.18 + end * 0.4, 4, dt);

  // facing: turn through the front (toward the camera) like a 2.5D character
  let yawT = P.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
  if (G.state === 'ending' || G.state === 'end') yawT = P.facing > 0 ? 0.45 : -0.45;
  if (G.state === 'title') yawT = 0.9;
  P.yaw = damp(P.yaw, yawT, 9, dt);
  const breathe = Math.sin(G.t * 2.1) * 0.012;
  const bob = moving ? Math.abs(Math.sin(P.phase)) * 0.045 : 0;
  W.charRoot.position.set(P.x, P.y + bob, 0);
  W.charRoot.rotation.set(0, P.yaw, 0);
  P.lean = damp(P.lean, clamp(P.vx / 3.5, -1, 1) * 0.08 * P.facing - callK * 0.1, 6, dt);
  W.charRoot.rotation.x = 0;
  W.charRoot.children[0].rotation.x = P.lean;
  W.charRoot.scale.set(1, 1 + breathe, 1);
  W.charRoot.visible = P.visible;

  const u = W.charMat.uniforms;
  u.uPhase.value = P.phase; u.uLegAmp.value = P.legAmp; u.uArmSwing.value = P.armSwing;
  u.uArmRaise.value = P.armRaise; u.uArmFwd.value = P.armFwd; u.uTuck.value = P.tuck; u.uGlow.value = P.glow;

  // scarf
  const sc = W.scarf, pts = sc.pts;
  const ax = P.x + Math.sin(P.yaw) * -0.07, ay = P.y + bob + 0.86, az = Math.cos(P.yaw) * -0.07;
  pts[0].x = ax; pts[0].y = ay; pts[0].z = az;
  const windX = -P.vx * 2.2 + Math.sin(G.t * 0.9) * 1.6 - P.facing * 4.6;
  const windY = asc ? -9 : 2.9 + Math.sin(G.t * 2.3) * 1.2;
  const dt2 = Math.min(dt, 1 / 30) ** 2;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const vx = (p.x - p.px) * 0.94, vy = (p.y - p.py) * 0.94, vz = (p.z - p.pz) * 0.9;
    p.px = p.x; p.py = p.y; p.pz = p.z;
    const fl = (Math.sin(G.t * 8.5 - i * 0.9) * 4.5 + Math.sin(G.t * 13.1 - i * 1.7) * 2.0) * (i / pts.length);
    p.x += vx + (windX) * dt2 * 9;
    p.y += vy + (windY - 5.5 + fl) * dt2 * 9;
    p.z += vz + Math.sin(G.t * 6 + i) * dt2 * 6 - p.z * 0.05;
  }
  for (let it = 0; it < 4; it++) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      const k = (d - sc.seg) / d;
      if (i === 1) { b.x -= dx * k; b.y -= dy * k; b.z -= dz * k; }
      else { a.x += dx * k * 0.5; a.y += dy * k * 0.5; a.z += dz * k * 0.5; b.x -= dx * k * 0.5; b.y -= dy * k * 0.5; b.z -= dz * k * 0.5; }
    }
    pts[0].x = ax; pts[0].y = ay; pts[0].z = az;
  }
  const pos = sc.pos, cam = camera.position;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    let tx = q.x - o.x, ty = q.y - o.y, tz = q.z - o.z;
    const vx = cam.x - p.x, vy = cam.y - p.y, vz = cam.z - p.z;
    let bx = ty * vz - tz * vy, by = tz * vx - tx * vz, bz = tx * vy - ty * vx;
    const bl = Math.hypot(bx, by, bz) || 1;
    const w = (0.07 - 0.036 * (i / (pts.length - 1)));
    bx = bx / bl * w; by = by / bl * w; bz = bz / bl * w;
    const wave = Math.sin(G.t * 9.0 - i * 0.85) * 0.045 * (i / (pts.length - 1)) / w;
    const cx = p.x + bx * wave, cy = p.y + by * wave, cz = p.z + bz * wave;
    pos[i * 6] = cx + bx; pos[i * 6 + 1] = cy + by; pos[i * 6 + 2] = cz + bz;
    pos[i * 6 + 3] = cx - bx; pos[i * 6 + 4] = cy - by; pos[i * 6 + 5] = cz - bz;
  }
  sc.geo.attributes.position.needsUpdate = true;
  sc.geo.computeBoundingSphere();
  const gk = P.glow;
  sc.mat.color.setRGB(1 + gk * 0.6, 1 + gk * 0.45, 1 + gk * 0.15);
  W.charRoot.visible = P.visible;
  W.scarf.geo && (W.scarf.mat.visible = P.visible);
}

function updateCamera(dt) {
  const W = world;
  let tx, ty, look, dist = 23;
  const sway = Math.sin(G.t * 0.11) * 1.4;
  if (G.state === 'title' || G.state === 'loading') {
    const k = 0.5 - 0.5 * Math.cos(G.t * 0.07);
    tx = sway * 1.2; ty = 8.4 + k * 4.5; look = new THREE.Vector3(0, ty - 1.4 + k * 1.2, 0); dist = 25.5;
  } else if (G.state === 'ending' || G.state === 'end') {
    const k = smooth(clamp(G.stateT / 7, 0, 1));
    const ly = clamp(P.y - 0.5, 27.5, 31.5);
    if (G.state === 'end') { tx = sway; ty = ly - 1; dist = 39; look = new THREE.Vector3(0, ly, 0); }
    else { tx = lerp(P.x * 0.5, 0, k) + sway; ty = lerp(P.y + 1.6, ly - 1, k); dist = lerp(23, 39, k); look = new THREE.Vector3(lerp(P.x * 0.55, 0, k), lerp(P.y + 0.8, ly, k), 0); }
  } else {
    const fy = P.y;
    ty = Math.max(8.2, fy + 2.0);
    tx = clamp(P.x * 0.5, -4.5, 4.5) + sway;
    look = new THREE.Vector3(clamp(P.x * 0.55, -5, 5), Math.max(6.9, fy + 0.7), 0);
    if (G.state === 'ascend') { ty = fy + 1.2; look.y = fy + 0.9; }
  }
  dist *= Math.max(1, 1.5 / camera.aspect);
  camDist = damp(camDist, dist, G.state === 'ending' ? 1.2 : 2.5, dt);
  const k = G.state === 'ascend' ? 3.5 : 2.6;
  camPos.x = damp(camPos.x, tx, k, dt);
  camPos.y = damp(camPos.y, ty, k, dt);
  camPos.z = damp(camPos.z, camDist, k, dt);
  camLook.x = damp(camLook.x, look.x, k, dt);
  camLook.y = damp(camLook.y, look.y, k, dt);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  uni.uCam.value.copy(camera.position);
}

function updateHUD() {
  const frac = clamp((G.remaining - SAND_MIN) / (SAND_TOTAL - SAND_MIN), 0, 1);
  const top = $('sandTop'), bot = $('sandBot'), st = $('sandStream');
  top.setAttribute('y', (20 - 18 * frac).toFixed(2)); top.setAttribute('height', (18 * frac).toFixed(2));
  bot.setAttribute('y', (38 - 18 * (1 - frac) * 0.9).toFixed(2)); bot.setAttribute('height', (18 * (1 - frac) * 0.9).toFixed(2));
  st.setAttribute('opacity', G.flow > 0.1 ? 1 : 0);
}

function updateAudio() {
  if (!audio.ctx) return;
  const camD = Math.hypot(camera.position.x - G.xLand, camera.position.y - G.yLand) / 20;
  setLoop('sand', clamp(G.flow / Q_CALL, 0.25, 1) * clamp(1.3 - camD * 0.6, 0.2, 1) * (G.flow > 0.05 ? 0.55 : 0), 0.9 + G.flow * 0.08);
  setLoop('call', G.calling ? 0.45 : G.state === 'ascend' ? 0.35 : 0);
}

// ───────────────────────────── main loop ─────────────────────────────
const clock = new THREE.Clock();
let manual = false;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (!world) return;
  if (!manual) tick(dt);
  composer.render(dt);
}
function tick(dt) {
  G.t += dt; G.stateT += dt;
  uni.uTime.value = G.t;
  if (G.state === 'play') { G.playTime += dt; updatePlay(dt); }
  else if (G.state === 'ascend') { G.playTime += dt; updateAscend(dt); }
  else if (G.state === 'upper') { G.playTime += dt; updateUpper(dt); }
  else if (G.state === 'ending' || G.state === 'end') updateEnding(dt);
  else if (G.state === 'turning') updateTurning(dt);
  else if (G.state === 'title') { P.y = sandAt(P.x); }

  updateSand(dt);
  updateStreamMesh();
  updateImpact(dt);
  updateMotes(dt);
  updateCharacter(dt);
  updateCamera(dt);
  uni.uPlayer.value.set(P.x, P.y, groundAt(P.x), 1);
  uni.uLand.value.set(G.xLand, G.yLand, 0, G.flow > 0.1 ? 0.6 + G.flow * 0.3 : 0);
  upperUniforms.uL.value = upper.L; upperUniforms.uD.value = upper.D;
  world.fx.update(dt, G.t);
  world.dust.update(dt, G.t);
  if (world.dust.list.length < 220 && Math.random() < 0.8) spawnDust(world.dust, false);
  if (G.whiteIn > 0) { G.whiteIn = Math.max(0, G.whiteIn - dt / 1.3); if (G.state !== 'turning') gradePass.uniforms.uFade.value = smooth(G.whiteIn); }
  const fgA = G.state === 'ending' ? 1 - smooth(clamp(G.stateT / 2.5, 0, 1)) : G.state === 'end' ? 0 : 1;
  for (const m of world.fg) { m.material.uniforms.uAlpha.value = fgA; m.visible = fgA > 0.01; }
  updateHUD();
  updateAudio();
}

// ───────────────────────────── boot ─────────────────────────────
(async () => {
  try {
    world = await build();
    sandReset();
    resetRun(false);
    // the title pose: on the mound, as in the first frame of the reference
    P.x = START_X; P.y = sandAt(P.x); P.facing = 1;
    setState('title');
    for (let i = 0; i < 30; i++) updateSand(1 / 60);
    $('loading').style.opacity = 0;
    setTimeout(() => { $('loading').style.display = 'none'; }, 1300);
    $('title').style.opacity = 1;
    window.__hg = {
      G, P, upper, sandAt, world, keys,
      start: () => { if (G.state === 'title') startGame(); },
      give: (n) => { for (const m of world.motes.slice(0, n)) if (!m.taken) collectMote(m); },
      tp: (x, y) => { P.x = x; P.y = y ?? groundAt(x); P.vx = P.vy = 0; },
      setRemaining: (v) => { G.remaining = v; },
      setState,
      // deterministic simulation for automated tests: hold keys for `sec` seconds at 60 Hz
      sim: (sec, held = []) => {
        manual = true;
        keys.clear(); for (const k of held) keys.add(k);
        const n = Math.round(sec * 60);
        for (let i = 0; i < n; i++) tick(1 / 60);
        keys.clear();
        return JSON.stringify({ s: G.state, x: +P.x.toFixed(2), y: +P.y.toFixed(2), g: P.grounded, rem: +G.remaining.toFixed(1), col: G.collected, xl: +G.xLand.toFixed(2), yl: +G.yLand.toFixed(2) });
      },
      press: (code) => { P.jumpBuf = 0.14; },
      auto: () => { manual = false; },
    };
    frame();
  } catch (e) {
    showErr('boot: ' + (e && e.stack || e));
  }
})();
