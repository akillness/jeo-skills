// main.js - wiring only. The look numbers live in src/look.js, the scene in scene.js, the
// picking in src/selection-controller.js. The renderer, resize, loop and disposal below are the
// scaffold's and are meant to stay as they are.
import * as THREE from 'three';
import { createScene } from './scene.js';
import { installViewer } from './viewer-contract.js';
import { createCameraRig } from './rigs/camera-orbit-follow.js';
import { createSunRig } from './rigs/lighting-sun.js';
import { createPostStack } from './rigs/post-stack.js';
import { createSelection } from './src/selection-controller.js';
import { LOOK } from './src/look.js';

export { LOOK };

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

const camera = new THREE.PerspectiveCamera(LOOK.camera.fovDeg, 1, 0.15, 400);
const world = createScene({ renderer, look: LOOK });
// Shadow extent fitted to the visible village (the dusk profile's own instruction), not to its
// 20 m default: an oversized extent wastes the map, an undersized one drops the far shadows.
const sun = createSunRig(world.scene, { shadowExtent: 34, distance: 72, mapSize: 2048 });

/** Named views, derived from where the plan actually put things, so a frame always holds its subject. */
function buildViews(entries) {
  const find = id => entries.find(entry => entry.id === id);
  const from = (entry, [dx, dy, dz], distance) => {
    const length = Math.hypot(dx, dy, dz);
    return { position: [entry.focus[0] + (dx / length) * distance,
                        entry.focus[1] + (dy / length) * distance,
                        entry.focus[2] + (dz / length) * distance],
             target: entry.focus };
  };
  const views = { overview: { position: [27, 21, 33], target: [0, 1.4, 0] } };
  const hall = find('moot-hall');
  if (hall) views.green = { position: [hall.focus[0] - 9.5, 2.4, hall.focus[2] + 10.5],
                            target: [hall.focus[0], 2.2, hall.focus[2]] };
  const mill = find('mill');
  if (mill) views.mill = from(mill, [-0.35, 0.42, 1], 13);
  const tower = find('tower');
  if (tower) views.tower = from(tower, [0.75, 0.3, 0.85], 17);
  const bridge = find('bridge');
  if (bridge) views.bridge = from(bridge, [0.2, 0.34, 1], 11);
  return views;
}
const VIEWS = buildViews(world.entries);

let loop = null;
const invalidate = () => loop?.invalidate();
const rig = createCameraRig({ camera, canvas, views: VIEWS, invalidate, limits: {
  minPolarDeg: LOOK.camera.minPolarDeg, maxPolarDeg: LOOK.camera.maxPolarDeg,
  minDist: LOOK.camera.minDistM, maxDist: LOOK.camera.maxDistM
} });
const post = LOOK.post.enabled ? createPostStack({ renderer, scene: world.scene, camera,
  bloom: LOOK.post.bloom, vignette: LOOK.post.vignette,
  toneMapping: { mode: LOOK.toneMapping.replace('ToneMapping', ''), exposure: LOOK.exposure } }) : null;

const selection = createSelection({
  entries: world.entries, scene: world.scene, camera, canvas, invalidate,
  heightAt: world.heightAt,
  onFocus: entry => rig.focus(entry.focus, Math.max(7, entry.reach * 2.3 + 4))
});

// Demand-driven loop from the scaffold: a still scene holds no pending frame, so a captured
// frame is the frame the browser last drew. The first frame after idle is charged one frame's
// worth of time, never dt = 0, or update() answers "nothing moved" and the loop parks forever.
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
  const step = paused ? 0 : dt;
  const moving = world.update(step);
  const marker = selection.animate(step);
  const cameraChanged = rig.update(dt);
  if (post) post.render(dt); else renderer.render(world.scene, camera);
  viewer.markReady();
  return moving || marker || cameraChanged;
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
// A scene that starts paused under prefers-reduced-motion must say so: a button reading
// "Pause motion" over a still scene is a control that lies about the state it owns.
const paintControl = () => {
  control.textContent = paused ? 'Resume motion' : 'Pause motion';
  control.setAttribute('aria-pressed', String(paused));
};
paintControl();
control.addEventListener('click', () => {
  paused = !paused;
  paintControl();
  invalidate();
});
// Reset is one promise: the home view back, and nothing selected.
document.querySelector('#reset').addEventListener('click', () => { rig.reset(); selection.clear(); });

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
  loop.dispose(); post?.dispose(); rig.dispose(); sun.dispose();
  selection.dispose(); world.dispose(); renderer.dispose();
}, { once: true });

document.querySelector('#stats').textContent =
  `${world.stats.buildings} buildings, ${world.stats.walkers} walkers, `
  + `${world.stats.practicals} lantern practicals, ${world.stats.roughness.length} roughness values`;
window.__village = { stats: world.stats, select: id => selection.select(id, { focus: true }),
                     clear: () => selection.clear(), get selected() { return selection.selected; } };

rig.reset(); viewport.setAttribute('aria-busy', 'false');
loop.setActive(!document.hidden);
