// main.js - LOOK is the resolved catalog mood; VIEWS are the named cameras the capture script
// drives. Renderer, loop, resize and disposal wiring below is the scaffold's and stays as it is.
import * as THREE from 'three';
import { createScene } from './scene.js';
import { installViewer } from './viewer-contract.js';
import { createSelection } from './selection.js';
import { createCameraRig } from './rigs/camera-orbit-follow.js';
import { createSunRig } from './rigs/lighting-sun.js';
import { createPostStack } from './rigs/post-stack.js';

// Source: knowledge.lighting-mood-dusk-golden-hour (sky, fog, tone mapping, environment, post,
// and the sun rig's key/fill/rim) + knowledge.style-ghibli-painterly-pastoral (value grouping,
// material discipline, per-instance jitter), re-tuned to this record's exposure of 0.9.
// See docs/design-system.md for every departure and why.
export const LOOK = {
  toneMapping: 'ACESFilmicToneMapping',
  exposure: 0.9,
  sky: { zenith: '#3a4a7a', horizon: '#f2a55c' },
  fog: { color: '#e8b07a', density: 0.0062 },
  environment: { intensity: 0.25 },
  camera: { fovDeg: 40, heightM: 1.7, minPolarDeg: 42, maxPolarDeg: 87, minDistM: 6, maxDistM: 95 },
  post: { enabled: true, bloom: { threshold: 1.0, strength: 0.3, radius: 0.7 }, vignette: 0.25 },
  palette: {
    // Three hue families - dusk blue, woodland green, ochre timber - plus the ember accent.
    turf: '#61703f', turfShade: '#3d4a2a', earth: '#7d5c3c', mud: '#4c4331',
    lane: '#8c7a5c', paving: '#7d7365', stone: '#8b8578', rock: '#7a7266',
    plaster: '#dcc59c', plasterAlt: '#c6a87c', thatch: '#9c7a45',
    timber: '#6e4d31', darkTimber: '#3f2d1e', bark: '#4c3a2b', iron: '#3a3e44', coal: '#282420',
    canopy: '#4f6b39', canopyBands: ['#3d5730', '#54713c', '#6d8b4b'],
    shrub: '#4b6335', reed: '#7b7d46', cloth: '#cbb692', cloak: '#a24f36', stalk: '#dccdb2', stump: '#6d563c',
    coats: ['#b06a3e', '#8d5637', '#c4834c'],
    water: '#2e4a56', smoke: '#cdbda8',
    windowGlow: '#ffcf8f', flame: '#ffd9a8', forge: '#ff8a3c', capGlow: '#ffc27a', mothWing: '#ffe3b0'
  }
};

const VIEWS = {
  overview: { position: [30, 24, 40], target: [-1, 6, 0] },
  beacon: { position: [3, 15.5, -21], target: [-2, 12, -6] },
  lane: { position: [-7.5, 10.35, -0.6], target: [6, 7.8, 2] },
  millpond: { position: [27, 6.5, 24], target: [13.8, 1.2, 11.2] },
  terraces: { position: [-30, 20, 24], target: [-6, 6, 9] }
};

const canvas = document.querySelector('#world');
const viewport = canvas.parentElement;
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch (cause) {
  const box = document.querySelector('#error');
  box.hidden = false; box.textContent = 'This scene needs WebGL. Try a browser with hardware acceleration.';
  throw cause;
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE[LOOK.toneMapping];
renderer.toneMappingExposure = LOOK.exposure;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(LOOK.camera.fovDeg, 1, 0.1, 400);
const world = createScene({ renderer, look: LOOK });
// Shadow extent fitted to the 62 m village rather than the record's 20 m demo scene.
// Fill raised from the record's 0.5 to 0.8 (key:fill ~4:1, not 6:1): this scene carries far more
// dark canopy mass than the record's demo scene, and at 0.5 the tree silhouettes read as holes.
const sun = createSunRig(world.scene, { shadowExtent: 42, distance: 90, mapSize: 2048,
  fillIntensity: 0.8, groundColor: '#5c4a38' });
const rig = createCameraRig({ camera, canvas, views: VIEWS, limits: {
  minPolarDeg: LOOK.camera.minPolarDeg, maxPolarDeg: LOOK.camera.maxPolarDeg,
  minDist: LOOK.camera.minDistM, maxDist: LOOK.camera.maxDistM
} });
const post = LOOK.post.enabled ? createPostStack({ renderer, scene: world.scene, camera,
  bloom: LOOK.post.bloom, vignette: LOOK.post.vignette,
  toneMapping: { mode: LOOK.toneMapping.replace('ToneMapping', ''), exposure: LOOK.exposure } }) : null;

// Demand-driven loop: a still scene holds no pending frame, so a capture is the frame last drawn.
function createRenderLoop({ draw, fps = 60 }) {
  let pending = null, previous = null, lastRender = null, active = true, drawing = false, dirty = false;
  function frame(timestamp) {
    pending = null;
    if (!active) return;
    const elapsed = previous === null ? 0 : timestamp - previous;
    if (lastRender !== null && timestamp - lastRender < 1000 / fps) { pending = requestAnimationFrame(frame); return; }
    previous = timestamp; lastRender = timestamp; dirty = false; drawing = true;
    let moving = false;
    try { moving = draw(Math.min(elapsed / 1000, 0.05)); } finally { drawing = false; }
    if (active && (moving || dirty)) pending = requestAnimationFrame(frame); else previous = null;
  }
  const api = {
    invalidate() { dirty = true; if (active && !drawing && pending === null) pending = requestAnimationFrame(frame); },
    setActive(value) { active = value; if (active) return api.invalidate();
      if (pending !== null) cancelAnimationFrame(pending); pending = previous = lastRender = null; },
    dispose() { active = false; if (pending !== null) cancelAnimationFrame(pending); pending = null; }
  };
  return api;
}

let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
const loop = createRenderLoop({ draw(dt) {
  const moving = world.update(paused ? 0 : dt);
  const cameraChanged = rig.update(dt);
  if (post) post.render(dt); else renderer.render(world.scene, camera);
  viewer.markReady();
  return moving || cameraChanged;
} });
const viewer = installViewer({ camera, controls: rig.controls, views: VIEWS,
  setView: rig.setView, invalidate: () => loop.invalidate() });

const selection = createSelection({
  scene: world.scene, records: world.records, canvas, camera,
  dom: { list: document.querySelector('#picks'), title: document.querySelector('#sel-title'),
    program: document.querySelector('#sel-program'), rows: document.querySelector('#sel-facts') },
  onFocus(record) {
    const lift = record.data.landmark ? 6.5 : 2.4;
    // Approach from outside the village, so framing never lands inside a neighbour's roof.
    const out = new THREE.Vector3(record.anchor.x, 0, record.anchor.z).normalize();
    rig.focus([record.anchor.x, record.anchor.y + lift, record.anchor.z],
      record.radius * 2.8, [out.x, 0.5, out.z]);
  },
  invalidate: () => loop.invalidate()
});

const nav = document.querySelector('#views');
for (const name of Object.keys(VIEWS)) {
  const button = document.createElement('button');
  button.type = 'button'; button.id = `view-${name}`; button.textContent = name;
  button.addEventListener('click', () => window.__viewer.setView(name));
  nav.append(button);
}
const control = document.querySelector('#control');
control.addEventListener('click', () => {
  paused = !paused;
  control.textContent = paused ? 'Resume motion' : 'Pause motion';
  control.setAttribute('aria-pressed', String(paused));
  loop.invalidate();
});
// Reset returns the home view and drops the selection, so the frame matches overview exactly.
document.querySelector('#reset').addEventListener('click', () => {
  selection.clear(); rig.reset(); loop.invalidate();
});
new ResizeObserver(() => {
  const { width, height } = viewport.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  post?.setSize(width, height);
  camera.aspect = width / height; camera.updateProjectionMatrix();
  loop.invalidate();
}).observe(viewport);

document.addEventListener('visibilitychange', () => loop.setActive(!document.hidden));
addEventListener('pagehide', () => {
  loop.dispose(); post?.dispose(); rig.dispose(); selection.dispose();
  sun.dispose(); world.dispose(); renderer.dispose();
}, { once: true });

rig.reset(); viewport.setAttribute('aria-busy', 'false');
loop.setActive(!document.hidden);
