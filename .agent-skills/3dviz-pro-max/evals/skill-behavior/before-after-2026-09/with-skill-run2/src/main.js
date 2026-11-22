// main.js - LOOK is pasted from two resolved catalog records, VIEWS are the named cameras the
// capture script drives, and everything below the wiring comment is scaffold plumbing.
// Sources: knowledge.lighting-mood-night-lantern (sky, fog, tone mapping, environment, post)
//        + knowledge.style-lantern-festival-riverside (camera, palette, motion, materials).
// Departures from those records are listed in docs/design-system.md.
import * as THREE from 'three';
import { createScene } from './scene.js';
import { installViewer } from './viewer-contract.js';
import { installPanel } from './ui-panel.js';
import { createCameraRig } from './rigs/camera-orbit-follow.js';
import { createPostStack } from './rigs/post-stack.js';

export const LOOK = {
  toneMapping: 'ACESFilmicToneMapping',
  exposure: 1.15,
  sky: { zenith: '#070c18', horizon: '#1b2a4a' },
  fog: { color: '#0b1526', density: 0.013 },
  environment: { intensity: 0.14 },
  camera: { fovDeg: 42, heightM: 1.6, minPolarDeg: 32, maxPolarDeg: 86, minDistM: 6, maxDistM: 78 },
  palette: { shadow: '#1b2a4a', band: '#5a4b7a', lantern: '#f2b25c', frame: '#c8642e', plaster: '#e8d9b8' },
  post: { enabled: true, bloom: { threshold: 1.0, strength: 0.5, radius: 0.8 }, vignette: 0.45 }
};

const VIEWS = {
  overview: { position: [-46, 28, 44], target: [4, 6, 6] },
  quay: { position: [-6, 11, -6], target: [2, 2.5, 14] },
  bridge: { position: [-21, 6, -3], target: [0, 3.0, 3] },
  terrace: { position: [-40, 14, -2], target: [-16, 4, -14] },
  beacon: { position: [4, 18, 14], target: [18, 11, 28] }
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
let loop = null;
const invalidate = () => loop?.invalidate();
const rig = createCameraRig({ camera, canvas, views: VIEWS, invalidate, limits: {
  minPolarDeg: LOOK.camera.minPolarDeg, maxPolarDeg: LOOK.camera.maxPolarDeg,
  minDist: LOOK.camera.minDistM, maxDist: LOOK.camera.maxDistM
} });
const post = LOOK.post.enabled ? createPostStack({ renderer, scene: world.scene, camera,
  bloom: LOOK.post.bloom, vignette: LOOK.post.vignette,
  toneMapping: { mode: LOOK.toneMapping.replace('ToneMapping', ''), exposure: LOOK.exposure } }) : null;

// Demand-driven loop from the scaffold: a still scene holds no pending frame, so a captured frame
// is the frame the browser last drew. The first frame after idle is charged one frame of time.
function createRenderLoop({ draw, fps = 60 }) {
  let pending = null, previous = null, lastRender = null, active = true, drawing = false, dirty = false;
  const step = 1000 / fps;
  function frame(timestamp) {
    pending = null;
    if (!active) return;
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

/** Selection is one path: the scene owns the state, the panel and the camera only display it. */
function choose(id) {
  const record = world.select(id);
  panel.render(record ?? null);
  if (record) rig.focus(record.anchor, Math.max(11, record.size * 1.9), null, null);
  invalidate();
}
const panel = installPanel({
  views: VIEWS, records: world.records,
  onView: name => window.__viewer.setView(name),
  onSelect: id => choose(world.selected === id ? null : id)
});

// Canvas picking: a drag that ends more than 5 px from where it started is a camera move, not a click.
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
let down = null;
canvas.addEventListener('pointerdown', event => { down = [event.clientX, event.clientY]; });
canvas.addEventListener('pointerup', event => {
  if (!down || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 5) { down = null; return; }
  down = null;
  const box = canvas.getBoundingClientRect();
  pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(world.pickTargets, true)[0];
  choose(hit ? hit.object.userData.buildingId ?? hit.object.parent?.userData.id ?? null : null);
});

const control = document.querySelector('#control');
control.addEventListener('click', () => {
  paused = !paused;
  control.textContent = paused ? 'Resume motion' : 'Pause motion';
  control.setAttribute('aria-pressed', String(paused));
  invalidate();
});
document.querySelector('#reset').addEventListener('click', () => { choose(null); rig.reset(); });

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
  loop.dispose(); post?.dispose(); rig.dispose(); world.dispose(); renderer.dispose();
}, { once: true });

rig.reset(); viewport.setAttribute('aria-busy', 'false');
loop.setActive(!document.hidden);
