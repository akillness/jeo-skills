import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { U, patchBend, foliageMaterial, rockMaterial } from './shaders.js';
import { createBackdrop, createTerrain, createTrack, createScenery, createSnowfall } from './world.js';
import { buildTrain, updateTrain, N_WAGONS } from './train.js';
import { createSpirit, makePlayerState, stepPlayer, poseSpirit, PH } from './player.js';
import { Batch } from './fx.js';
import { makeFx, Stars, Boughs, Wind } from './hazards.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { clamp, lerp, damp, rng, terrainH, TERR } from './noise.js';

const qs = new URLSearchParams(location.search);
const OPT = {
  autoplay: qs.has('autoplay'), seed: +(qs.get('seed') || 0) || ((Math.random() * 1e9) | 0),
  t0: +(qs.get('t') || 0), lives: +(qs.get('lives') || 3), journey: +(qs.get('journey') || 165), zoom: +(qs.get('zoom') || 1),
};

const JOURNEY = OPT.journey;           // seconds of night left before the train reaches the dawn
const TRAIN_SPEED = 9.5;
const PHASES = [
  { name: 'Moonlit Valley', t: 0 },
  { name: 'Pine Forest', t: JOURNEY * 0.315 },
  { name: 'High Pass', t: JOURNEY * 0.655 },
];
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ renderer / scene
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
// atmospheric haze of the video: pale blue-grey, a touch of teal (distant slopes melt into it)
const FOG_NIGHT = new THREE.Color(0x7393ab), FOG_DAWN = new THREE.Color(0xc4a7a2);
scene.fog = new THREE.FogExp2(FOG_NIGHT.clone(), 0.0105);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 2600);
scene.add(camera);

// moonlight from behind the scene, like the reference (the moon hangs above the far range):
// snow tops and roofs catch the light, the faces turned to the camera (rocks, carriage sides,
// firs) fall into a cool teal-navy shade; soft blue sky fill, charcoal bounce
const HEMI_SKY = new THREE.Color(0x9fbdd3), HEMI_DAWN = new THREE.Color(0xf2d6c8);
const hemi = new THREE.HemisphereLight(HEMI_SKY, 0x26303a, 1.15);
const moon = new THREE.DirectionalLight(0xe4edf3, 2.4);
moon.position.set(-8, 70, -50);
scene.add(hemi, moon, moon.target);
const starLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffc266, 0, 9, 1.5); l.userData.busy = false; scene.add(l); return l; });
const spiritLight = new THREE.PointLight(0xd8e6ff, 2.2, 4.5, 1.6); scene.add(spiritLight);
const lampLight = new THREE.PointLight(0xffbf72, 16, 22, 1.4); scene.add(lampLight);

// ------------------------------------------------------------------ post processing
// HDR scene (half float, MSAA) -> bloom on the bright warm lights -> one grading pass that does
// exposure + filmic tone curve, the colour grade of the reference video (neutral snow, charcoal
// darks with a teal-navy cast, saturated amber lights), soft halation, edge softness, a hint of
// chromatic aberration, watercolour paper, vignette and film grain, then sRGB encoding.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uPaper: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
    uFade: { value: 1 }, uFadeCol: { value: new THREE.Color(0x070c16) }, uTime: { value: 0 }, uFlash: { value: 0 }, uDawn: { value: 0 },
    uExposure: { value: 0.92 }, uVig: { value: 0.5 }, uGrain: { value: 0.032 }, uCA: { value: 1.0 }, uSoft: { value: 0.5 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform sampler2D uPaper; uniform vec2 uRes; uniform float uFade; uniform vec3 uFadeCol;
    uniform float uTime; uniform float uFlash; uniform float uDawn;
    uniform float uExposure; uniform float uVig; uniform float uGrain; uniform float uCA; uniform float uSoft;
    varying vec2 vUv;

    // filmic curve: linear toe (dark navy keeps its colour), long soft exponential shoulder
    vec3 filmic(vec3 x){ return 1.0 - exp(-max(x, 0.0)); }
    vec3 toSRGB(vec3 c){
      c = clamp(c, 0.0, 1.0);
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    vec3 rgb2hsv(vec3 c){
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-6)), d / (q.x + 1e-6), q.x);
    }
    vec3 hsv2rgb(vec3 c){
      vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
      return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
    }
    float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

    void main(){
      vec2 px = 1.0 / uRes;
      vec2 d = vUv - 0.5;
      float r2 = dot(d * vec2(uRes.x / uRes.y, 1.0), d * vec2(uRes.x / uRes.y, 1.0));
      // chromatic aberration, only toward the frame edges (sub-pixel at the centre)
      vec2 ca = d * px * uCA * (0.3 + 2.0 * r2) * 2.4;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + ca).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - ca).b;
      // soft lens: a light 6-tap blur blended in toward the frame corners
      float soft = uSoft * clamp(smoothstep(0.30, 0.95, r2) * 0.8, 0.0, 0.8);
      if (soft > 0.02) {
        vec3 b = vec3(0.0);
        float rad = 2.2 + 2.0 * soft;
        b += texture2D(tDiffuse, vUv + px * vec2( 1.0,  0.0) * rad).rgb;
        b += texture2D(tDiffuse, vUv + px * vec2(-0.5,  0.87) * rad).rgb;
        b += texture2D(tDiffuse, vUv + px * vec2(-0.5, -0.87) * rad).rgb;
        b += texture2D(tDiffuse, vUv + px * vec2(-1.0,  0.0) * rad * 1.9).rgb;
        b += texture2D(tDiffuse, vUv + px * vec2( 0.5,  0.87) * rad * 1.9).rgb;
        b += texture2D(tDiffuse, vUv + px * vec2( 0.5, -0.87) * rad * 1.9).rgb;
        c = mix(c, b / 6.0, soft);
      }

      // ---- exposure + filmic tone curve (scene is linear HDR)
      vec3 x = c * uExposure;
      // keep warm highlights from bleaching to white too early: tone-map luminance, carry chroma
      float lin = dot(x, vec3(0.2126, 0.7152, 0.0722));
      vec3 tmC = filmic(x);
      float tmL = filmic(vec3(lin)).r;
      vec3 tmP = x * (tmL / max(lin, 1e-4));
      c = mix(tmC, clamp(tmP, 0.0, 1.0), 0.45);
      c = toSRGB(c);

      // ---- colour grade (display space)
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // hue work: blue-violet casts of the raw render -> the teal-grey of the video; warm lights richer
      vec3 hsv = rgb2hsv(c);
      float h = hsv.x;
      float violet = smoothstep(0.56, 0.62, h) * (1.0 - smoothstep(0.80, 0.88, h));
      hsv.x = mix(h, 0.555, violet * 0.6);
      hsv.y *= mix(1.0, 0.85, violet);
      float warm = (1.0 - smoothstep(0.10, 0.17, h)) * step(0.0, h) + smoothstep(0.95, 1.0, h);
      hsv.y = min(1.0, hsv.y * (1.0 + 0.35 * warm * smoothstep(0.25, 0.7, hsv.z)));
      float greenH = smoothstep(0.22, 0.30, h) * (1.0 - smoothstep(0.45, 0.52, h));
      hsv.y *= 1.0 + 0.25 * greenH;
      c = hsv2rgb(hsv);
      // split toning: charcoal-teal shadows, near-neutral cool mids, very slightly warm paper whites
      float sh = 1.0 - smoothstep(0.0, 0.42, l);
      float hi = smoothstep(0.55, 0.95, l);
      c = mix(c, c * vec3(0.84, 1.00, 1.12) + vec3(0.006, 0.016, 0.026), sh * 0.7);
      c = mix(c, c * vec3(1.02, 1.01, 0.98), hi * 0.4);
      // contrast: deepen the darks (the render's shadows are milky), soft roll-off of the whites
      c = max(c - 0.018, 0.0) * 1.03;
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.28);
      // overall saturation, a bit below the raw render (the video is muted, its lights are not)
      float l2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l2), c, 0.98);
      // dawn: warm the whole grade
      c = mix(c, c * vec3(1.10, 0.98, 0.90) + vec3(0.03, 0.01, 0.0), uDawn * 0.8);

      // ---- watercolour paper + vignette + grain
      vec2 puv = vUv * uRes / 1100.0;
      float p = texture2D(uPaper, puv).r;
      float p2 = texture2D(uPaper, puv * 0.31 + 0.27).r;
      c *= 0.965 + 0.05 * p + 0.025 * p2;
      float vig = smoothstep(0.18, 0.95, r2);
      c = mix(c, c * vec3(0.55, 0.62, 0.74), vig * uVig);
      c += vec3(1.0, 0.86, 0.6) * uFlash * 0.22;
      float g = hash12(vUv * uRes + fract(uTime * 13.7) * 311.0) - 0.5;
      c += g * uGrain * (0.35 + 0.65 * (1.0 - abs(l2 - 0.5) * 2.0));
      c = mix(c, uFadeCol, uFade);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};
let composer, bloom, paint;
function setupComposer() {
  const w = innerWidth, h = innerHeight, pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  // threshold above the moonlit snow: only the lamps, windows, stars and the moon glow
  bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.75, 0.72, 1.6);
  composer.addPass(bloom);
  paint = new ShaderPass(GradeShader);   // last pass: writes display-referred sRGB to the screen
  composer.addPass(paint);
}

// ------------------------------------------------------------------ loading
const audio = new Audio();
const input = new Input();
input.onUserGesture = () => { if (G.mode !== 'loading') audio.resume(); updateSoundHint(); };

const TEX = {
  sky: 'assets/tex/sky.jpg', mtnFar: 'assets/tex/mountains_far.png', mtnMid: 'assets/tex/mountains_mid.png', snow: 'assets/tex/snow.jpg',
  star: 'assets/tex/star.png', sparkles: 'assets/tex/sparkles.png', puff: 'assets/tex/puff.png', paper: 'assets/tex/paper.jpg',
};
const MODELS = {
  spirit: 'assets/models/spirit.glb', green: 'assets/models/wagon_green.glb', red: 'assets/models/wagon_red.glb', loco: 'assets/models/loco.glb',
  pine: 'assets/models/pine.glb', rock: 'assets/models/rock.glb', bough: 'assets/models/bough.glb',
};
const SOUNDS = {
  music: 'assets/audio/music.m4a', train: 'assets/audio/train_loop.wav', catch: 'assets/audio/catch.wav', light: 'assets/audio/light.wav',
  wagon: 'assets/audio/wagon.wav', jump: 'assets/audio/jump.wav', land: 'assets/audio/land.wav', miss: 'assets/audio/miss.wav',
  fall: 'assets/audio/fall.wav', respawn: 'assets/audio/respawn.wav', bough: 'assets/audio/bough.wav', wind: 'assets/audio/wind.wav',
  whistle: 'assets/audio/whistle.wav', win: 'assets/audio/win.wav', dawn: 'assets/audio/dawn.wav', shooting: 'assets/audio/shooting.wav', ui: 'assets/audio/ui.wav',
};

async function loadAll() {
  const total = Object.keys(TEX).length + Object.keys(MODELS).length + Object.keys(SOUNDS).length;
  let done = 0;
  const tick = () => { done++; $('loadbar').style.width = `${Math.round(done / total * 100)}%`; };
  const tl = new THREE.TextureLoader();
  const tex = {};
  const texP = Object.entries(TEX).map(([k, url]) => new Promise((res, rej) => tl.load(url, (t) => {
    t.colorSpace = k === 'paper' ? THREE.NoColorSpace : THREE.SRGBColorSpace; tex[k] = t; tick(); res();
  }, undefined, rej)));
  const gl = new GLTFLoader();
  const glb = {};
  const modelP = Object.entries(MODELS).map(([k, url]) => new Promise((res, rej) => gl.load(url, (g) => { glb[k] = g; tick(); res(); }, undefined, rej)));
  const audioP = audio.load(SOUNDS, tick);
  await Promise.all([...texP, ...modelP, audioP]);
  return { tex, glb };
}

// ------------------------------------------------------------------ world
let W = null;     // all world objects
const G = {
  mode: 'loading', time: 0, t: 0, scroll: 0, score: 0, best: 0, lives: 3, combo: 0, comboT: 0, caught: 0, missed: 0, falls: 0,
  phase: -1, nextStar: 0, nextBough: 3, ended: null, endT: 0, introT: 0, shoot: [], demo: true, msgT: 0, paused: false,
  camFocus: new THREE.Vector3(), camShake: 0, dawn: 0, fadeT: 1, winT: 0,
};
try { G.best = +(localStorage.getItem('starlight-train-best') || 0); } catch (e) { G.best = 0; }
let R = rng(OPT.seed);

function buildWorld({ tex, glb }) {
  const backdrop = createBackdrop(camera, tex);
  const terrain = createTerrain(scene, tex);
  const track = createTrack(scene);
  // scenery materials (Lambert, bent, instanced)
  const meshOf = (g) => { let m = null; g.scene.traverse((o) => { if (o.isMesh && !m) m = o; }); return m; };
  const pineSrc = meshOf(glb.pine), rockSrc = meshOf(glb.rock);
  const pineMap = pineSrc.material.map; pineMap.colorSpace = THREE.SRGBColorSpace;
  const rockMap = rockSrc.material.map; rockMap.colorSpace = THREE.SRGBColorSpace;
  const pineMat = foliageMaterial(pineMap, 'pine');
  const rockMat = rockMaterial(rockMap, 'rock');
  const pineGeo = pineSrc.geometry.clone(); pineGeo.computeBoundingBox();
  const rockGeo = rockSrc.geometry.clone();
  const scenery = createScenery(scene, pineGeo, pineMat, rockGeo, rockMat, OPT.seed % 1000 + 3);
  const snow = createSnowfall(scene);
  const train = buildTrain(scene, glb);
  const spirit = createSpirit(scene, glb.spirit);

  const common = { uTime: U.uTime };
  const B = {
    disc: new Batch(scene, { mode: 4, flat: true, cap: 260, renderOrder: 6, uniforms: common }),
    ring: new Batch(scene, { mode: 3, flat: true, cap: 16, renderOrder: 7, uniforms: common }),
    smoke: new Batch(scene, { tex: tex.puff, mode: 1, cap: 140, renderOrder: 11, uniforms: common }),
    puff: new Batch(scene, { tex: tex.puff, mode: 1, cap: 300, renderOrder: 12, uniforms: common }),
    thread: new Batch(scene, { mode: 2, anchorBottom: true, cap: 16, renderOrder: 13, uniforms: common }),
    star: new Batch(scene, { tex: tex.star, mode: 6, cap: 24, renderOrder: 14, uniforms: common }),
    spark: new Batch(scene, { tex: tex.sparkles, mode: 0, atlas: [2, 2], cap: 1100, renderOrder: 16, uniforms: common }),
    streak: new Batch(scene, { tex: tex.puff, mode: 1, cap: 160, renderOrder: 17, uniforms: common }),
  };
  const fx = makeFx(B);
  const stars = new Stars(B, fx, train, starLights);
  const boughs = new Boughs(scene, glb.bough, pineGeo, pineMat, B);
  const wind = new Wind();
  // persistent sprites: spirit halo + blob shadow, locomotive lamp glow
  const halo = B.spark.spawn({ x: 0, y: 0, z: 0, keep: true, life: 1, size: 3.4, frame: 1, r: 0.62, g: 0.74, b: 1.0, a: 0.06, a1: 0.06 });
  const shadow = B.disc.spawn({ x: 0, y: 0, z: 0, keep: true, life: 1, size: 1.1, r: 0.07, g: 0.10, b: 0.15, a: 0.6, a1: 0.6 });
  const lamp = B.spark.spawn({ x: 0, y: 0, z: 0, keep: true, life: 1, size: 2.6, frame: 1, r: 1.0, g: 0.8, b: 0.5, a: 0.7, a1: 0.7 });
  const lampBeam = B.puff.spawn({ x: 0, y: 0, z: 0, keep: true, life: 1, size: 1, sx: 7, sy: 2.2, r: 1.0, g: 0.82, b: 0.55, a: 0.06, a1: 0.06 });
  paint.uniforms.uPaper.value = tex.paper;
  tex.paper.wrapS = tex.paper.wrapT = THREE.MirroredRepeatWrapping;
  W = { backdrop, terrain, track, scenery, snow, train, spirit, B, fx, stars, boughs, wind, halo, shadow, lamp, lampBeam, P: makePlayerState(), smokeT: 0 };
}

// ------------------------------------------------------------------ HUD
const hud = {
  wagons: [], lastScore: -1, lastLives: -1, lastCombo: -1,
  build() {
    const box = $('wagonsHud'); box.innerHTML = '';
    // displayed rear (left) -> front (right), like the train on screen
    for (let i = N_WAGONS - 1; i >= 0; i--) {
      const d = document.createElement('div'); d.className = 'pip';
      d.innerHTML = '<i></i><i></i><i></i>';
      box.appendChild(d); this.wagons[i] = d;
    }
  },
  update() {
    const tr = W.train;
    for (const w of tr.wagons) {
      const el = this.wagons[w.i]; if (!el) continue;
      const is = el.children;
      for (let k = 0; k < 3; k++) is[k].classList.toggle('on', w.lit > k);
      el.classList.toggle('full', w.lit >= 3);
    }
    if (G.score !== this.lastScore) { $('score').textContent = G.score.toLocaleString('en-US'); this.lastScore = G.score; }
    if (G.lives !== this.lastLives) {
      const l = $('lives'); l.innerHTML = '';
      for (let i = 0; i < Math.max(0, G.lives); i++) { const im = document.createElement('img'); im.src = 'assets/ui/spirit.png'; im.alt = ''; l.appendChild(im); }
      this.lastLives = G.lives;
    }
    const combo = G.comboT > 0 && G.combo > 1 ? G.combo : 0;
    if (combo !== this.lastCombo) { $('combo').textContent = combo ? `×${combo}` : ''; $('combo').classList.toggle('show', !!combo); this.lastCombo = combo; }
    const prog = clamp(G.t / JOURNEY, 0, 1);
    $('jfill').style.width = `${prog * 100}%`;
    $('jmark').style.left = `${prog * 100}%`;
  },
};
let msgTimer = 0;
function showMsg(text, dur = 2.2, cls = '') {
  const m = $('msg'); m.textContent = text; m.className = 'show ' + cls; msgTimer = dur;
}
const popups = [];
function popup(text, x, y, z, cls = '') {
  const el = document.createElement('div'); el.className = 'popup ' + cls; el.textContent = text;
  $('popups').appendChild(el);
  popups.push({ el, p: new THREE.Vector3(x, y, z), t: 0 });
}
const _v = new THREE.Vector3();
function updatePopups(dt) {
  for (const p of popups) {
    p.t += dt; p.p.y += dt * 1.1;
    _v.copy(p.p); _v.z -= U.uBendK.value * Math.pow(clamp(_v.x - U.uBendX0.value, -70, 70), 2);
    _v.project(camera);
    p.el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px, ${(-_v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%)`;
    p.el.style.opacity = String(clamp(1.4 - p.t * 1.1, 0, 1));
    if (p.t > 1.4) { p.el.remove(); p.dead = true; }
  }
  for (let i = popups.length - 1; i >= 0; i--) if (popups[i].dead) popups.splice(i, 1);
}
// off-screen star indicators
const edgeEls = [];
function updateEdges() {
  const box = $('edges');
  const list = (G.mode === 'play' && W) ? W.stars.list.filter((s) => s.state === 'fall') : [];
  while (edgeEls.length < list.length) { const e = document.createElement('div'); e.className = 'edge'; box.appendChild(e); edgeEls.push(e); }
  for (let i = 0; i < edgeEls.length; i++) {
    const e = edgeEls[i]; const s = list[i];
    if (!s) { e.style.display = 'none'; continue; }
    const tx = s.kind === 'star' || s.kind === 'shoot-hover' ? W.train.wagons[s.w].x + s.lx : s.x;
    _v.set(tx, W.train.roofTop + 1.2, s.z);
    _v.z -= U.uBendK.value * Math.pow(clamp(_v.x - U.uBendX0.value, -70, 70), 2);
    _v.project(camera);
    const off = _v.x < -0.92 || _v.x > 0.92;
    if (!off) { e.style.display = 'none'; continue; }
    e.style.display = 'block';
    const right = _v.x > 0;
    const yy = clamp((-_v.y * 0.5 + 0.5) * innerHeight, 90, innerHeight - 90);
    e.style.left = right ? '' : '18px'; e.style.right = right ? '18px' : '';
    e.style.top = `${yy}px`;
    e.classList.toggle('r', right);
  }
}

function updateSoundHint() {
  const el = $('soundhint'); if (!el) return;
  el.style.display = (!audio.running && G.mode !== 'loading' && !audio.muted) ? 'block' : 'none';
}

// ------------------------------------------------------------------ game flow
function resetRun(demo) {
  R = rng(OPT.seed + (demo ? 101 : 0) + Math.floor(G.time * 1000));
  const tr = W.train;
  const demoLit = [3, 2, 3, 1, 3, 2];
  for (const w of tr.wagons) { w.lit = demo ? demoLit[w.i] : 0; w.frac = w.lit / 3; w.flash = 0; }
  W.stars.clear(); W.boughs.clear(); W.wind.reset();
  for (const k of ['puff', 'spark', 'streak', 'disc']) W.B[k].list = W.B[k].list.filter((p) => p.keep);
  const P = W.P;
  Object.assign(P, makePlayerState());
  const w0 = tr.wagons[2];
  P.x = w0.x - 2; P.z = 0; P.y = tr.groundAt(P.x, 0).h; P.onGround = true; P.facing = Math.PI / 2;
  G.t = demo ? 0 : OPT.t0; G.score = 0; G.lives = OPT.lives; G.combo = 0; G.comboT = 0; G.caught = 0; G.missed = 0; G.falls = 0;
  G.phase = -1; G.nextStar = demo ? 1.0 : 2.2; G.nextBough = 2.5; G.ended = null; G.endT = 0; G.dawn = 0; G.winT = 0;
  G.shoot = [{ t: JOURNEY * 0.70, done: false }, { t: JOURNEY * 0.86, done: false }];
  G.scrollStart = G.scroll; G.t0 = G.t;
  TERR.passX0 = U.uPassX0.value = demo ? 1e7 : G.scroll + (PHASES[2].t - G.t) * TRAIN_SPEED - 40;
  G.demo = demo;
  hud.lastLives = -1; hud.lastScore = -1;
}

function startGame() {
  // the audio context may only start after a real user gesture (gamepad presses are not one)
  if (!navigator.userActivation || navigator.userActivation.hasBeenActive) audio.resume();
  audio.play('ui', { vol: 0.8 });
  resetRun(false);
  G.mode = 'intro'; G.introT = 0;
  $('title').classList.add('hidden'); $('results').classList.add('hidden');
  $('hud').classList.remove('hidden');
  audio.play('whistle', { vol: 0.7, delay: 0.2 });
  audio.fade('music', 0.55, 1.5); audio.fade('amb', 0.42, 1.5);
  showMsg('Catch the falling stars', 3.2, 'intro');
}

function toTitle() {
  resetRun(true);
  G.mode = 'title';
  $('title').classList.remove('hidden'); $('results').classList.add('hidden'); $('hud').classList.add('hidden');
  audio.fade('music', 0.45, 2); audio.fade('amb', 0.3, 2);
}

function endGame(kind) {
  if (G.ended) return;
  G.ended = kind; G.mode = 'ending'; G.endT = 0;
  W.stars.clear(); W.boughs.clear();
  for (const p of popups) p.el.remove(); popups.length = 0;
  if (kind === 'win') {
    G.score += Math.max(0, Math.round(JOURNEY - G.t)) * 20 + G.lives * 500;
    audio.play('win', { vol: 1.0 });
    showMsg('The train shines', 4.5, 'big');
    for (const w of W.train.wagons) { w.lit = 3; w.flash = 1.2; }
  } else if (kind === 'dawn') {
    audio.play('dawn', { vol: 0.9 });
    showMsg('Daybreak', 4, 'big');
    audio.fade('music', 0.15, 3);
  } else {
    audio.play('dawn', { vol: 0.9, rate: 0.9 });
    showMsg('The spirit fades', 4, 'big');
    audio.fade('music', 0.15, 3);
  }
  if (G.score > G.best) { G.best = G.score; try { localStorage.setItem('starlight-train-best', String(G.best)); } catch (e) { /* ignore */ } }
}

function showResults() {
  G.mode = 'results';
  const lit = W.train.wagons.filter((w) => w.lit >= 3).length;
  $('resTitle').textContent = G.ended === 'win' ? 'The train shines' : G.ended === 'dawn' ? 'Daybreak' : 'The spirit fades';
  $('rStars').textContent = String(G.caught);
  $('rWagons').textContent = `${lit}/${N_WAGONS}`;
  $('rScore').textContent = G.score.toLocaleString('en-US');
  $('rBest').textContent = G.best.toLocaleString('en-US');
  $('results').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('msg').className = ''; msgTimer = 0;
  G.resultsT = 0;
}

// scenery density along the line: sparse valley, dense pine forest, bare rocky high pass
function sceneryDensity(xw) {
  if (G.demo) return [0.75, 0.7, 0.45];
  const t = (xw - G.scrollStart) / TRAIN_SPEED + G.t0;
  const f = clamp((t - PHASES[1].t + 6) / 8, 0, 1) * (1 - clamp((t - PHASES[2].t + 4) / 8, 0, 1));
  const pass = clamp((t - PHASES[2].t + 4) / 8, 0, 1);
  return [0.55 + f * 0.45 - pass * 0.3, 0.55 + pass * 0.45 - f * 0.2, 0.45 + pass * 0.5];
}

// ------------------------------------------------------------------ director: stars, boughs, wind
function phaseAt(t) { return t >= PHASES[2].t ? 2 : t >= PHASES[1].t ? 1 : 0; }

function spawnStar(ph) {
  const tr = W.train, P = W.P;
  const pending = {};
  for (const s of W.stars.list) if (s.state === 'fall') pending[s.w] = (pending[s.w] || 0) + (s.kind === 'star' ? 1 : 3);
  let cands = tr.wagons.filter((w) => w.lit + (pending[w.i] || 0) < 3);
  if (!cands.length && G.demo) {   // attract mode: let a few lamps fade so stars keep falling
    for (const w of tr.wagons) if (R() < 0.5) w.lit = Math.floor(R() * 3);
    cands = tr.wagons.filter((w) => w.lit + (pending[w.i] || 0) < 3);
  }
  if (!cands.length) return false;
  const pw = tr.wagonAt(P.x);
  let sum = 0;
  const wts = cands.map((w) => { const d = Math.abs(w.i - pw); const v = d === 0 ? 2.6 : d === 1 ? 2.2 : d === 2 ? 1.1 : 0.45; sum += v; return v; });
  let r = R() * sum, pick = cands[0];
  for (let i = 0; i < cands.length; i++) { r -= wts[i]; if (r <= 0) { pick = cands[i]; break; } }
  const lx = lerp(tr.roofMin + 1.3, tr.roofMax - 1.3, R());
  const z = (R() * 2 - 1) * 0.72;
  const dist = Math.abs(pick.x + lx - P.x);
  const base = ph === 0 ? 6.6 : ph === 1 ? 5.8 : 5.0;
  const T = Math.max(base, dist / 4.4 + 2.0);
  W.stars.spawn({ w: pick.i, lx, z, T, height: 13 + R() * 5 });
  return true;
}
function spawnShooting() {
  const tr = W.train;
  const cands = tr.wagons.filter((w) => w.lit === 0);
  const list = cands.length ? cands : tr.wagons.filter((w) => w.lit < 3);
  if (!list.length) return;
  const P = W.P;
  list.sort((a, b) => Math.abs(a.x - P.x) - Math.abs(b.x - P.x));
  const pick = list[Math.min(list.length - 1, R() < 0.6 ? 0 : 1)];
  W.stars.spawn({ w: pick.i, lx: lerp(tr.roofMin + 2, tr.roofMax - 2, R()), z: 0, kind: 'shoot' });
  audio.play('shooting', { vol: 0.9 });
}

function director(dt) {
  const ph = phaseAt(G.t);
  if (ph !== G.phase) {
    G.phase = ph;
    if (!G.demo && G.mode === 'play' && ph > 0) { showMsg(PHASES[ph].name, 2.6, 'phase'); audio.play('whistle', { vol: 0.45 }); }
  }
  G.nextStar -= dt;
  const maxActive = ph === 0 ? (G.t < 25 ? 1 : 2) : ph === 1 ? 2 : 3;
  if (G.nextStar <= 0 && W.stars.activeCount() < maxActive) {
    if (spawnStar(ph)) G.nextStar = ph === 0 ? 3.0 : ph === 1 ? 2.4 : 2.0;
    else G.nextStar = 0.5;
  }
  if (!G.demo) for (const s of G.shoot) if (!s.done && G.t >= s.t) { s.done = true; spawnShooting(); }
  // overhanging boughs in the forest
  if (ph === 1 || (G.demo && ph === 0 && G.t > 6)) {
    G.nextBough -= dt;
    if (G.nextBough <= 0) {
      const tr = W.train;
      const x = tr.front + 28;
      const full = R() < 0.6;
      const tip = full ? 1.45 : -0.15 + R() * 0.25;
      const gy = terrainH(x + G.scroll, -4.9);
      W.boughs.spawn(x, tr.roofTop, tip, gy);
      G.nextBough = 5.0 + R() * 2.6;
    }
  }
  const wev = [];
  W.wind.update(dt, ph === 2 && !G.demo, wev);
  for (const e of wev) if (e === 'warn') audio.play('wind', { vol: 0.85 });
}

// ------------------------------------------------------------------ autopilot (title screen attract + tests)
function autopilot() {
  const P = W.P, tr = W.train;
  const inp = { x: 0, y: 0, jumpHeld: false, jumpPressed: false };
  if (P.state !== 'play') return inp;
  let target = null, best = 1e9;
  for (const s of W.stars.list) {
    if (s.state !== 'fall') continue;
    const tx = s.kind === 'shoot' ? s.p2.x : tr.wagons[s.w].x + s.lx;
    const left = s.kind === 'shoot' ? (s.flyT - s.t) + 3.5 : (s.T - s.t);
    const need = Math.abs(tx - P.x) / PH.RUN + 0.35;
    const score = need < left ? need : 1e6 + need;
    if (score < best) { best = score; target = { x: tx, z: s.z, s }; }
  }
  const tx = target ? target.x : tr.wagons[tr.wagonAt(P.x)].x;
  const tz = target ? target.z : 0;
  const dx = tx - P.x, dz = tz - P.z;
  inp.x = Math.abs(dx) > 0.12 ? Math.sign(dx) * Math.min(1, Math.abs(dx) / 0.7) : 0;
  inp.y = Math.abs(dz) > 0.1 ? -Math.sign(dz) * Math.min(1, Math.abs(dz) / 0.5) : 0;
  if (P.wind < -0.8) inp.x = Math.max(inp.x, dx < -1.5 ? inp.x : 0.9);
  const dir = Math.sign(inp.x);
  if (dir !== 0 && P.onGround) {
    const g = tr.groundAt(P.x + dir * 0.9, P.z).h;
    if (g < tr.roofTop - 1.2 && Math.abs(dx) > 0.6) inp.jumpPressed = true;
  }
  if (target && P.onGround && Math.abs(dx) < 0.7 && Math.abs(dz) < 0.7) {
    const h = target.s.y - (P.y + 0.55);
    if (h > 0.9 && h < 2.9) inp.jumpPressed = true;
  }
  for (const b of W.boughs.list) {
    const bdx = b.x - P.x;
    if (bdx > 1.9 && bdx < 3.4 && P.z < b.tipZ + 0.35 && P.onGround) inp.jumpPressed = true;
  }
  inp.jumpHeld = inp.jumpPressed || (!P.onGround && (P.vy > 0 || Math.abs(dx) > 1.0));
  return inp;
}

// ------------------------------------------------------------------ simulation step (fixed dt)
const evBuf = [];
function simulate(dt, inp) {
  G.time += dt;
  U.uTime.value = G.time;
  const playing = G.mode === 'play' || G.mode === 'intro';
  const speed = TRAIN_SPEED * (G.mode === 'ending' && G.ended === 'dawn' ? Math.max(0.15, 1 - G.endT * 0.25) : 1);
  G.scroll += speed * dt;
  U.uScroll.value = G.scroll;
  // curvature of the track
  U.uBendK.value = 0.0011 + 0.0012 * Math.sin(G.scroll * 0.0049) + 0.0005 * Math.sin(G.scroll * 0.0123 + 1.0);

  const P = W.P, tr = W.train;
  if (G.mode === 'play' || G.mode === 'title') {
    G.t += dt;
    director(dt);
  }
  if (G.mode === 'title' && G.t > 70) resetRun(true);

  P.wind = W.wind.v;
  evBuf.length = 0;
  const control = (G.mode === 'play' && !OPT.autoplay) ? inp : (G.mode === 'title' || G.mode === 'play' ? autopilot() : { x: 0, y: 0, jumpHeld: false, jumpPressed: false });
  if (G.mode === 'intro' || G.mode === 'results' || G.mode === 'ending') { control.x = 0; control.y = 0; control.jumpPressed = false; }
  P.inv = Math.max(0, P.inv - dt);
  stepPlayer(P, dt, control, tr, evBuf);
  for (const e of evBuf) {
    if (e === 'jump') { audio.play('jump', { vol: 0.8, rate: 0.95 + Math.random() * 0.1 }); W.fx.puffRing(P.x, P.y, P.z, 4, 0.15, 0.35, 0.35); }
    else if (e === 'land') { audio.play('land', { vol: 0.9 }); W.fx.puffRing(P.x, P.y, P.z, 8, 0.2, 0.5, 0.55); }
    else if (e === 'touch') { audio.play('land', { vol: 0.4, rate: 1.1 }); }
    else if (e === 'step') {
      audio.play('land', { vol: 0.22, rate: 1.15 + Math.random() * 0.25 });
      const a = P.facing, side = P.stepSide * 0.11;
      W.fx.footprint(P.x + Math.cos(a) * side, P.y, P.z - Math.sin(a) * side, a);
      if (Math.random() < 0.6) W.fx.kick(P.x, P.y, P.z, P.vx);
    } else if (e === 'fall') {
      audio.play('fall', { vol: 0.9 });
      G.combo = 0; G.comboT = 0;
    }
  }
  // fall -> lose a life -> respawn
  if (P.state === 'fall' && P.deadT > 1.1) {
    if (playing && !G.demo) { G.lives--; G.falls++; }
    if (playing && !G.demo && G.lives <= 0) { P.state = 'gone'; endGame('fade'); }
    else {
      const wi = tr.wagonAt(P.fallX);
      const w = tr.wagons[wi];
      let lx = clamp(P.fallX - w.x, tr.roofMin + 1.6, tr.roofMax - 1.6);
      P.x = w.x + lx; P.z = 0; P.y = tr.roofTop + 3.2; P.vx = P.vy = P.vz = 0;
      P.state = 'respawn'; P.deadT = 0;
      audio.play('respawn', { vol: 0.8 });
      W.fx.sparkBurst(P.x, P.y - 1.5, P.z, 22, 3, [0.75, 0.85, 1.0], 0.45);
    }
  }

  // stars
  const sev = [];
  W.stars.update(dt, P, G.time, sev);
  for (const e of sev) {
    const s = e.star;
    if (e.type === 'catch') onCatch(s);
    else {
      audio.play('miss', { vol: 0.7 });
      W.fx.sparkBurst(s.x, s.y, s.zz ?? s.z, 14, 2.2, [1, 0.8, 0.55], 0.35);
      W.fx.puffRing(s.x, s.yEnd - 0.4, s.z, 5, 0.15, 0.4, 0.4);
      if (!G.demo && G.mode === 'play') { G.missed++; G.combo = 0; G.comboT = 0; }
    }
  }
  // boughs
  const bev = [];
  W.boughs.update(dt, speed, P, bev);
  for (const e of bev) {
    if (e.type === 'whoosh') audio.play('bough', { vol: 0.55, rate: 1.0 + Math.random() * 0.1 });
    if (e.type === 'hit') {
      audio.play('bough', { vol: 0.9 }); audio.play('land', { vol: 0.8, rate: 0.8 });
      P.vx = -8.5; P.vy = 5.5; P.onGround = false; P.state = 'stun'; P.stunT = 0.55; P.spinT = 0.6;
      W.fx.puffRing(P.x, P.y + 0.6, P.z, 10, 0.3, 0.7, 0.7);
      G.combo = 0; G.comboT = 0; G.camShake = 0.5;
    }
  }
  G.comboT = Math.max(0, G.comboT - dt);

  // wind streaks
  if (W.wind.level > 0.05) {
    const n = W.wind.level * dt * 70;
    for (let i = 0; i < n; i++) {
      W.B.streak.spawn({ x: P.x + 18 + Math.random() * 14, y: tr.roofTop - 1 + Math.random() * 6, z: -3 + Math.random() * 7, vx: -38 - Math.random() * 18, vy: -1, vz: 0,
        life: 0.9, size: 1, sx: 2.6 + Math.random() * 2, sy: 0.06 + Math.random() * 0.05, r: 0.9, g: 0.95, b: 1, a: 0.32 * W.wind.level, a1: 0 });
    }
  }
  // locomotive smoke + lamp
  const L = tr.loco;
  W.smokeT -= dt;
  while (W.smokeT < 0) {
    W.smokeT += 0.07;
    W.B.smoke.spawn({ x: L.chimney.x + (Math.random() - 0.5) * 0.3, y: L.chimney.y, z: L.chimney.z, vx: -speed * 0.55 + (Math.random() - 0.5), vy: 2.2 + Math.random() * 1.2, vz: (Math.random() - 0.5) * 0.8,
      life: 2.6 + Math.random(), size: 0.8, size1: 4.6, r: 0.78, g: 0.81, b: 0.88, a: 0.42, a1: 0, drag: 0.6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.6 });
  }
  W.lamp.x = L.lamp.x; W.lamp.y = L.lamp.y; W.lamp.z = L.lamp.z; W.lamp.a = W.lamp.a1 = 0.7 + Math.sin(G.time * 13) * 0.03;
  W.lampBeam.x = L.lamp.x + 5.5; W.lampBeam.y = L.lamp.y - 0.4; W.lampBeam.z = L.lamp.z;
  lampLight.position.set(L.lamp.x + 6, L.lamp.y + 0.5, 0.6);

  // world motion
  updateTrain(tr, dt, G.time);
  W.scenery.update(G.scroll, sceneryDensity);
  W.track.update(G.scroll);
  for (const k in W.B) W.B[k].update(dt);

  // ending sequence
  if (G.mode === 'ending') {
    G.endT += dt;
    if (G.ended === 'dawn') G.dawn = Math.min(1, G.dawn + dt * 0.35);
    if (G.ended === 'win') {
      G.winT += dt;
      if (Math.random() < dt * 14) {
        const x = P.x + (Math.random() - 0.3) * 60;
        W.B.spark.spawn({ x, y: tr.roofTop + 14 + Math.random() * 10, z: -10 - Math.random() * 30, vx: -12, vy: -9, vz: 2, life: 1.4, size: 1.2, size1: 0.2, r: 1, g: 0.88, b: 0.6, a: 1, a1: 0, frame: 3 });
      }
    }
    if (G.endT > 5.2) showResults();
  }
  if (G.mode === 'intro') { G.introT += dt; if (G.introT > 1.6) G.mode = 'play'; }
  if (G.mode === 'play' && !G.ended) {
    if (tr.wagons.every((w) => w.lit >= 3)) endGame('win');
    else if (G.t >= JOURNEY) endGame('dawn');
    // dawn creeping in during the last seconds
    G.dawn = clamp((G.t - (JOURNEY - 14)) / 14, 0, 1) * 0.45;
  }
  if (G.mode === 'results') G.resultsT = (G.resultsT || 0) + dt;
}

function onCatch(s) {
  const tr = W.train, w = tr.wagons[s.w], P = W.P;
  const big = s.kind.startsWith('shoot');
  const before = w.lit;
  w.lit = Math.min(3, w.lit + (big ? 3 : 1));
  w.flash = 1;
  const z = s.zz ?? s.z;
  W.fx.sparkBurst(s.x, s.y, z, big ? 50 : 28, big ? 7 : 5);
  // the caught light pours down into the carriage
  for (let i = 0; i < 14; i++) {
    W.B.spark.spawn({ x: s.x + (Math.random() - 0.5) * 0.4, y: s.y, z: z + (Math.random() - 0.5) * 0.4, vx: (w.x - s.x) * 0.4 + (Math.random() - 0.5) * 2, vy: -4 - Math.random() * 3, vz: (Math.random() - 0.5) * 2,
      life: 0.7, size: 0.6, size1: 0.1, r: 1, g: 0.85, b: 0.55, a: 1, a1: 0, frame: 1, drag: 1.5 });
  }
  W.spirit.u.uFlash.value = 1.0;
  if (G.mode === 'play' && !G.demo) {
    G.combo = G.comboT > 0 ? Math.min(5, G.combo + 1) : 1; G.comboT = 7.5;
    const pts = (big ? 500 : 100) * G.combo;
    G.score += pts; G.caught++;
    popup(`+${pts}`, s.x, s.y + 0.6, z, big ? 'big' : '');
  }
  audio.play('catch', { vol: 0.95, rate: 1 + 0.05 * Math.max(0, G.combo - 1) });
  audio.play('light', { vol: 0.8, delay: 0.18 });
  if (w.lit >= 3 && before < 3) {
    if (G.mode === 'play' && !G.demo) { G.score += 300; showMsg('Wagon lit', 1.6, 'small'); }
    audio.play('wagon', { vol: 0.85, delay: 0.35 });
    for (let i = 0; i < 40; i++) {
      const lx = (Math.random() - 0.5) * 11;
      W.B.spark.spawn({ x: w.x + lx, y: tr.roofTop + 0.2, z: (Math.random() - 0.5) * 2.4, vx: 0, vy: 1.5 + Math.random() * 2.5, vz: 0, life: 1.2 + Math.random(), size: 0.5, size1: 0.05, r: 1, g: 0.85, b: 0.55, a: 1, a1: 0, frame: Math.floor(Math.random() * 4), drag: 0.5 });
    }
  }
  if (P.state === 'play' && !P.onGround) P.vy = Math.max(P.vy, 3.5);   // tiny lift on mid-air catches
}

// ------------------------------------------------------------------ camera
// closer, higher three-quarter view like the reference: the train crosses the frame diagonally,
// the roofs are seen from above and the spirit / stars read large
const CAM_OFF = new THREE.Vector3(-4.6, 6.4, 8.8);
const CAM_LOOK = new THREE.Vector3(8.0, -1.2, -9.5);
let CAM_FOV = 50;
if (qs.has('cam')) { const v = qs.get('cam').split(',').map(Number); CAM_OFF.set(v[0], v[1], v[2]); CAM_LOOK.set(v[3], v[4], v[5]); if (v[6]) CAM_FOV = v[6]; }
const _look = new THREE.Vector3();
function updateCamera(dt) {
  const P = W.P, tr = W.train;
  let fx, fy, fz, off = CAM_OFF, look = CAM_LOOK, k = 3.2;
  if (G.mode === 'title') {
    fx = tr.wagons[2].x + Math.sin(G.time * 0.11) * 16 + 2; fy = tr.roofTop + 1.5; fz = 0;
    off = _tmpOff.set(-12, 9.0, 19.5); look = _tmpLook.set(13, -0.8, -19); k = 1.2;
  } else if (G.mode === 'ending' && G.ended === 'win') {
    const u = clamp(G.endT / 4.5, 0, 1); const e = u * u * (3 - 2 * u);
    fx = P.x + e * 4; fy = tr.roofTop + 0.6 + e * 2; fz = 0;
    off = _tmpOff.set(lerp(CAM_OFF.x, -14, e), lerp(CAM_OFF.y, 12.5, e), lerp(CAM_OFF.z, 22, e)); look = CAM_LOOK; k = 2;
  } else if (G.mode === 'results' || G.mode === 'ending') {
    fx = G.camFocus.x; fy = G.camFocus.y; fz = G.camFocus.z; k = 1;
  } else {
    fx = P.x + clamp(P.vx, -6, 6) * 0.32;
    fy = tr.roofTop + 0.6 + clamp(P.y - tr.roofTop, -2, 3) * 0.22;
    fz = P.z * 0.35;
    if (G.mode === 'intro') k = 2.2;
  }
  G.camFocus.x = damp(G.camFocus.x, fx, k, dt);
  G.camFocus.y = damp(G.camFocus.y, fy, k * 0.9, dt);
  G.camFocus.z = damp(G.camFocus.z, fz, k, dt);
  if (!G._camOff) G._camOff = off.clone();
  G._camOff.x = damp(G._camOff.x, off.x * OPT.zoom, 1.6, dt); G._camOff.y = damp(G._camOff.y, off.y * OPT.zoom, 1.6, dt); G._camOff.z = damp(G._camOff.z, off.z * OPT.zoom, 1.6, dt);
  if (!G._camLook) G._camLook = look.clone();
  G._camLook.x = damp(G._camLook.x, look.x, 1.6, dt); G._camLook.y = damp(G._camLook.y, look.y, 1.6, dt); G._camLook.z = damp(G._camLook.z, look.z, 1.6, dt);
  G.camShake = Math.max(0, G.camShake - dt * 1.8);
  const sh = G.camShake * G.camShake;
  const sway = Math.sin(G.time * 0.37) * 0.25;
  camera.position.set(G.camFocus.x + G._camOff.x + sway + (Math.random() - 0.5) * sh * 0.6, G.camFocus.y + G._camOff.y + Math.sin(G.time * 0.53) * 0.12 + (Math.random() - 0.5) * sh * 0.5, G.camFocus.z + G._camOff.z);
  _look.set(G.camFocus.x + G._camLook.x, G.camFocus.y + G._camLook.y, G.camFocus.z + G._camLook.z);
  camera.lookAt(_look);
  U.uBendX0.value = G.camFocus.x;
}
const _tmpOff = new THREE.Vector3(), _tmpLook = new THREE.Vector3();

// ------------------------------------------------------------------ per-frame visuals
function updateVisuals(dt) {
  const P = W.P, tr = W.train;
  poseSpirit(W.spirit, P, dt, G.time);
  W.spirit.u.uFlash.value = Math.max(0, W.spirit.u.uFlash.value - dt * 2.2);
  const g = tr.groundAt(P.x, P.z).h;
  const vis = W.spirit.root.visible;
  W.halo.x = P.x; W.halo.y = P.y + 0.55; W.halo.z = P.z;
  W.halo.a = W.halo.a1 = vis ? 0.05 + W.spirit.u.uFlash.value * 0.5 : 0;
  const hAbove = P.y - g;
  const okG = g > tr.roofTop - 1.2;
  W.shadow.x = P.x; W.shadow.z = P.z; W.shadow.y = (okG ? g : -50) + 0.03;
  W.shadow.size = W.shadow.size1 = clamp(1.15 - hAbove * 0.13, 0.5, 1.15);
  W.shadow.a = W.shadow.a1 = vis && okG ? clamp(0.62 - hAbove * 0.08, 0.18, 0.62) : 0;
  spiritLight.position.set(P.x, P.y + 1.9, P.z + 1.2);
  spiritLight.intensity = vis ? 0.9 + W.spirit.u.uFlash.value * 10 : 0;
  // snowfall follows the camera focus, drifts backwards with the train's speed + gusts
  const sm = W.snow.mat.uniforms;
  sm.uCenter.value.set(G.camFocus.x + 8, G.camFocus.y + 4, G.camFocus.z - 8);
  sm.uDrift.value += dt * (TRAIN_SPEED * 0.75 + W.wind.level * 22);
  sm.uWind.value = W.wind.level;
  const passK = G.demo ? 0 : clamp((G.t - PHASES[2].t + 2) / 6, 0, 1);
  sm.uAmount.value = clamp(0.62 + passK * 0.3 + W.wind.level * 0.25, 0, 1);
  sm.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  W.backdrop.update(G.scroll, camera.position.x);
  // fog + dawn
  U.uDawn.value = G.dawn;
  scene.fog.color.copy(FOG_NIGHT).lerp(FOG_DAWN, G.dawn);
  hemi.intensity = 1.15 + G.dawn * 0.9;
  hemi.color.copy(HEMI_SKY).lerp(HEMI_DAWN, G.dawn * 0.6);
  paint.uniforms.uDawn.value = G.dawn;
  // screen fade
  const fadeTarget = (G.mode === 'loading') ? 1 : (G.mode === 'ending' && G.ended === 'fade' ? clamp((G.endT - 2.5) / 2.5, 0, 0.75) : 0);
  G.fadeT = damp(G.fadeT, fadeTarget, 2.5, dt);
  paint.uniforms.uFade.value = G.fadeT;
  paint.uniforms.uTime.value = G.time;
  paint.uniforms.uFlash.value = Math.max(0, (paint.uniforms.uFlash.value || 0) - dt * 2);
}

// ------------------------------------------------------------------ main loop
let last = performance.now(), acc = 0;
const STEP = 1 / 120;
let simulating = false;
function frame(now) {
  requestAnimationFrame(frame);
  if (simulating) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.mode === 'loading') { if (composer) composer.render(); return; }
  const inp = input.poll();
  handleMeta(inp);
  if (!G.paused) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 8) { simulate(STEP, inp); inp.jumpPressed = false; acc -= STEP; n++; }
    if (n === 8) acc = 0;
    updateCamera(dt);
    updateVisuals(dt);
  }
  hud.update();
  updatePopups(G.paused ? 0 : dt);
  updateEdges();
  if (msgTimer > 0 && !G.paused) { msgTimer -= dt; if (msgTimer <= 0) $('msg').className = ''; }
  composer.render();
}

function handleMeta(inp) {
  if (inp.mute) { audio.setMuted(!audio.muted); }
  if (G.mode === 'title') {
    if (inp.start || inp.jumpPressed || inp.pointer) startGame();
  } else if (G.mode === 'results') {
    if ((inp.start || inp.jumpPressed || inp.pointer) && G.resultsT > 0.8) startGame();
  } else if (G.mode === 'play' || G.mode === 'intro') {
    if (inp.pause) setPaused(!G.paused);
    else if (G.paused && (inp.jumpPressed || inp.start)) setPaused(false);
  }
}
function setPaused(p) {
  G.paused = p;
  $('pause').classList.toggle('hidden', !p);
  if (p) audio.fade('music', 0.15, 0.3); else audio.fade('music', 0.55, 0.5);
}
document.addEventListener('visibilitychange', () => { if (document.hidden && (G.mode === 'play' || G.mode === 'intro')) setPaused(true); });

function onResize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  // wider screens see more of the train; narrow ones pull the camera back a little
  camera.fov = w / h < 1.2 ? CAM_FOV + 11 : CAM_FOV; camera.updateProjectionMatrix();
  if (composer) { composer.setSize(w, h); bloom.setSize(w / 2, h / 2); }
  if (paint) paint.uniforms.uRes.value.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  if (W) W.backdrop.layout(camera);
}
addEventListener('resize', onResize);

// ------------------------------------------------------------------ test hooks
window.__train = {
  get G() { return G; }, get W() { return W; }, opt: OPT,
  three: { THREE, renderer, scene, camera, get composer() { return composer; }, get paint() { return paint; } },
  start: () => startGame(),
  // run the simulation without real time (deterministic fixed steps) with optional autopilot input
  sim(seconds, auto = true) {
    simulating = true;
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) {
      const inp = auto ? { x: 0, y: 0, jumpHeld: false, jumpPressed: false } : input.poll();
      if (auto && G.mode === 'play') Object.assign(inp, autopilot());
      simulate(STEP, inp);
      if (G.mode === 'results' && auto) break;
      if (i % 4 === 0) { updateCamera(STEP * 4); updateVisuals(STEP * 4); }
    }
    hud.update(); updatePopups(0.016);
    simulating = false; last = performance.now();
    return { mode: G.mode, t: G.t, score: G.score, lives: G.lives, caught: G.caught, lit: W.train.wagons.map((w) => w.lit), ended: G.ended };
  },
  state: () => ({ mode: G.mode, t: +G.t.toFixed(2), score: G.score, lives: G.lives, caught: G.caught, missed: G.missed, falls: G.falls,
    lit: W.train.wagons.map((w) => w.lit), P: { x: +W.P.x.toFixed(2), y: +W.P.y.toFixed(2), z: +W.P.z.toFixed(2), state: W.P.state, onGround: W.P.onGround },
    stars: W.stars.list.length, boughs: W.boughs.list.length, wind: W.wind.state, ended: G.ended }),
  litAll: () => { for (const w of W.train.wagons) w.lit = 3; },
  setLit: (arr) => arr.forEach((v, i) => { W.train.wagons[i].lit = v; }),
  teleport: (x, z = 0) => { const P = W.P; P.x = x; P.z = z; P.y = W.train.groundAt(x, z).h + 0.01; P.vx = P.vy = P.vz = 0; },
  spawnStarAbovePlayer: (h = 6) => {
    const P = W.P, tr = W.train; const wi = tr.wagonAt(P.x); const w = tr.wagons[wi];
    return W.stars.spawn({ w: wi, lx: P.x - w.x, z: P.z, T: 3, height: h });
  },
  spawnBough: (dx = 25, tip = 1.45) => W.boughs.spawn(W.P.x + dx, W.train.roofTop, tip, 0),
  setBands: (far, mid) => { W.backdrop.bands.far = far; W.backdrop.bands.mid = mid; W.backdrop.layout(camera); },
  setCam: (v) => { CAM_OFF.set(v[0], v[1], v[2]); CAM_LOOK.set(v[3], v[4], v[5]); if (v[6]) { CAM_FOV = v[6]; onResize(); } G._camOff = null; G._camLook = null; },
  journey: JOURNEY,
};

// ------------------------------------------------------------------ boot
(async function boot() {
  setupComposer();
  onResize();
  requestAnimationFrame(frame);
  try {
    const assets = await loadAll();
    buildWorld(assets);
    hud.build();
    onResize();
    resetRun(true);
    G.mode = 'title';
    $('loading').classList.add('hidden');
    $('title').classList.remove('hidden');
    audio.fade('music', 0.45, 2); audio.fade('amb', 0.3, 2);
    // warm up shaders
    renderer.compile(scene, camera);
    if (OPT.autoplay) setTimeout(() => startGame(), 300);
    updateSoundHint();
    document.title = 'Starlight Train';
    window.__ready = true;
  } catch (e) {
    console.error(e);
    $('loading').querySelector('.label').textContent = 'Could not load the game assets.';
  }
})();
setInterval(updateSoundHint, 1000);
