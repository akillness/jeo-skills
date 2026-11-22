// main.js - start here. Change LOOK (numbers pasted from a resolved `defaults.values` block),
// VIEWS (named camera positions the capture script drives) and which rigs you import.
// The renderer, resize, loop and disposal wiring below is meant to stay as it is.
import * as THREE from 'three';
import { createScene } from './scene.js';
import { installViewer } from './viewer-contract.js';
import { createCameraRig } from './rigs/camera-orbit-follow.js';
import { createSunRig } from './rigs/lighting-sun.js';
import { createPostStack } from './rigs/post-stack.js';

// Source: knowledge.lighting-mood-dusk-golden-hour (sky, fog, tone mapping, environment, post)
// + knowledge.style-painterly (camera, palette). Run `python3 scripts/resolve.py <id>` for yours.
export const LOOK = {
  toneMapping: 'ACESFilmicToneMapping',
  exposure: 0.9,
  sky: { zenith: '#3a4a7a', horizon: '#f2a55c' },
  fog: { color: '#e8b07a', density: 0.02 },
  environment: { intensity: 0.25 },
  camera: { fovDeg: 40, heightM: 1.7, minPolarDeg: 55, maxPolarDeg: 88, minDistM: 4, maxDistM: 30 },
  palette: { ground: '#e9d8a6', hero: '#c97b4a', prop: '#7fa6c9', foliage: '#5c7a4a', mote: '#ffd9a8' },
  // Post is on: rigs/post-stack.js moves the tone map into the composited frame (three applies
  // renderer.toneMapping only to frames drawn straight to the canvas). Set enabled:false to
  // drop the composer and hand tone mapping back to the renderer.
  post: { enabled: true, bloom: { threshold: 1.0, strength: 0.3, radius: 0.7 }, vignette: 0.25 }
};

const VIEWS = {
  overview: { position: [13, 8, 15], target: [0, 1.2, 0] },
  hero: { position: [3.6, 2.1, 5.2], target: [0, 1.1, 0] },
  eye: { position: [-4.6, 1.7, 7.4], target: [-0.4, 1.0, 0.6] }
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

const camera = new THREE.PerspectiveCamera(LOOK.camera.fovDeg, 1, 0.1, 300);
const world = createScene({ renderer, look: LOOK });
const sun = createSunRig(world.scene, {});
// `loop` is assigned below; the rig only ever calls invalidate from an event, after that.
let loop = null;
const invalidate = () => loop?.invalidate();
const rig = createCameraRig({ camera, canvas, views: VIEWS, invalidate, limits: {
  minPolarDeg: LOOK.camera.minPolarDeg, maxPolarDeg: LOOK.camera.maxPolarDeg,
  minDist: LOOK.camera.minDistM, maxDist: LOOK.camera.maxDistM
} });
// The stack takes tone mapping off the renderer and applies it last, inside the composited frame.
const post = LOOK.post.enabled ? createPostStack({ renderer, scene: world.scene, camera,
  bloom: LOOK.post.bloom, vignette: LOOK.post.vignette,
  toneMapping: { mode: LOOK.toneMapping.replace('ToneMapping', ''), exposure: LOOK.exposure } }) : null;

// Demand-driven loop, ported from examples/early-slice/render-loop.js: a still scene holds no
// pending animation frame, so a captured frame is the frame the browser last drew.
function createRenderLoop({ draw, fps = 60 }) {
  let pending = null, previous = null, lastRender = null, active = true, drawing = false, dirty = false;
  const step = 1000 / fps;
  function frame(timestamp) {
    pending = null;
    if (!active) return;
    // The first frame after idle has no previous timestamp. Charging it dt = 0 would make every
    // "did anything move?" answer false, the loop would park, and the next wake-up would be
    // another zero-dt frame - a scene frozen forever. Charge it one frame's worth of time.
    const elapsed = previous === null ? step : timestamp - previous;
    if (lastRender !== null && timestamp - lastRender < step) { pending = requestAnimationFrame(frame); return; }
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
loop = createRenderLoop({ draw(dt) {
  const moving = world.update(paused ? 0 : dt);
  const cameraChanged = rig.update(dt);
  if (post) post.render(dt); else renderer.render(world.scene, camera);
  viewer.markReady();
  return moving || cameraChanged;
} });
const viewer = installViewer({ camera, controls: rig.controls, views: VIEWS,
  setView: rig.setView, invalidate });

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
  invalidate();
});
document.querySelector('#reset').addEventListener('click', () => rig.reset());
new ResizeObserver(() => {
  const { width, height } = viewport.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  post?.setSize(width, height);
  camera.aspect = width / height; camera.updateProjectionMatrix();
  invalidate();
}).observe(viewport);

document.addEventListener('visibilitychange', () => loop.setActive(!document.hidden));
addEventListener('pagehide', () => {
  loop.dispose(); post?.dispose(); rig.dispose(); sun.dispose(); world.dispose(); renderer.dispose();
}, { once: true });

rig.reset(); viewport.setAttribute('aria-busy', 'false');
loop.setActive(!document.hidden);
