// main.js - LOOK is knowledge.style-lantern-festival-riverside's defaults.values, pasted, with
// the two departures recorded in docs/design-system.md (fog density, orbit range). VIEWS are the
// named camera positions the capture script drives. The renderer, loop and disposal wiring below
// is the scaffold's and is meant to stay as it is.
import * as THREE from 'three';
import { createScene } from './scene.js';
import { installViewer } from './viewer-contract.js';
import { createCameraRig } from './rigs/camera-orbit-follow.js';
import { createPostStack } from './rigs/post-stack.js';
import { createSelection } from './world/selection.js';

// Source: knowledge.style-lantern-festival-riverside (sky, fog, lights, camera, tone map, post).
export const LOOK = {
  toneMapping: 'ACESFilmicToneMapping',
  exposure: 0.9,
  sky: { zenith: '#1b2a4a', horizon: '#5a4b7a', ground: '#2a2233' },
  fog: { color: '#3a3560', density: 0.016 },
  environment: { intensity: 0.55 },
  lights: {
    fill: { sky: '#5a4b7a', ground: '#2a1f1a', intensity: 0.8 },
    rim: { color: '#8a7bb8', intensity: 0.85, elevationDeg: 14, azimuthDeg: 210 }
  },
  camera: { fovDeg: 42, minPolarDeg: 42, maxPolarDeg: 88, minDistM: 3, maxDistM: 62 },
  palette: { lantern: '#f2b25c', accent: '#c8642e', plaster: '#e8d9b8', ember: '#ffd9a8' },
  post: { enabled: true, bloom: { threshold: 1.0, strength: 0.28, radius: 0.6 }, vignette: 0.25 }
};

const VIEWS = {
  overview: { position: [-21, 18, 31], target: [3, 1.5, -2] },
  square: { position: [-12.6, 2.7, 4.4], target: [-3.2, 1.6, 0.6] },
  bridge: { position: [-4.5, 2.2, -10.0], target: [7.2, 1.0, -1.2] },
  mill: { position: [9.5, 3.2, -20.5], target: [1.6, 0.6, -12.4] },
  bluff: { position: [2.0, 10.5, 21.0], target: [19.6, 8.0, 6.4] },
  lane: { position: [-8.5, 2.8, 7.5], target: [-16.5, 1.3, 2.5] },
  cottage: { position: [-10.4, 2.7, -1.8], target: [-4.7, 1.5, -5.0] }
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

const camera = new THREE.PerspectiveCamera(LOOK.camera.fovDeg, 1, 0.1, 320);
// Awaited: the T3 hero and the guildhall are files, and __sceneReady must not fire on a frame
// drawn before they land - a capture of a half-built village is worse than a slower first frame.
const world = await createScene({ renderer, look: LOOK });
let loop = null;
const invalidate = () => loop?.invalidate();
const rig = createCameraRig({ camera, canvas, views: VIEWS, invalidate, limits: {
  minPolarDeg: LOOK.camera.minPolarDeg, maxPolarDeg: LOOK.camera.maxPolarDeg,
  minDist: LOOK.camera.minDistM, maxDist: LOOK.camera.maxDistM
} });
const post = LOOK.post.enabled ? createPostStack({ renderer, scene: world.scene, camera,
  bloom: LOOK.post.bloom, vignette: LOOK.post.vignette,
  toneMapping: { mode: LOOK.toneMapping.replace('ToneMapping', ''), exposure: LOOK.exposure } }) : null;

const info = document.querySelector('#info');
const picks = document.querySelector('#picks');
const selection = createSelection({ camera, canvas, items: world.items, heightAt: world.heightAt,
  invalidate, onChange(item) {
    for (const button of picks.children) button.setAttribute('aria-pressed', String(button.dataset.id === item?.id));
    info.innerHTML = item
      ? `<strong>${item.name}</strong><span>${item.kind} &middot; built at ${item.tier}</span><span>${item.blurb}</span>`
      : '<strong>Nothing selected</strong><span>Click a building, or pick one from the list.</span>';
  } });
world.scene.add(selection.ring);

function choose(id) {
  const item = selection.select(id);
  if (item) rig.focus(item.centre, item.focus, null, null);
}
for (const item of world.items) {
  const button = document.createElement('button');
  button.type = 'button'; button.dataset.id = item.id; button.id = `pick-${item.id}`;
  button.textContent = item.name; button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => choose(item.id));
  picks.append(button);
}
selection.select(null);

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
  const pulsing = selection.update(paused ? 0 : dt);
  const cameraChanged = rig.update(dt);
  if (post) post.render(dt); else renderer.render(world.scene, camera);
  viewer.markReady();
  return moving || pulsing || cameraChanged;
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
document.querySelector('#reset').addEventListener('click', () => {
  selection.select(null);
  rig.reset();
});
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
  loop.dispose(); post?.dispose(); rig.dispose(); selection.dispose(); world.dispose(); renderer.dispose();
}, { once: true });

rig.reset(); viewport.setAttribute('aria-busy', 'false');
loop.setActive(!document.hidden);
