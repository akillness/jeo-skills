// Emberhollow — a lantern-lit papercraft village you can walk your eye around.
// Boots the renderer, assembles the world, and runs the frame loop.

import * as THREE from 'three';
import { PALETTE } from './world/noise-and-palette.js';
import { createTerrain, createWater } from './world/terrain.js';
import { createSky, createStars, createAurora, createLights } from './world/sky-and-light.js';
import { createVillage } from './world/village-layout.js';
import { createWoods, createSquare, createFireflies } from './world/scenery.js';
import { createCreatures } from './systems/creatures.js';
import { createCameraRig } from './systems/camera-rig.js';
import { createSelection } from './systems/selection.js';
import { createHud } from './ui/hud.js';

const container = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(PALETTE.fog, 0.0068);

const rig = createCameraRig(renderer);

// --- world -----------------------------------------------------------------
const ticking = [];
function add(object) {
  scene.add(object);
  if (object.userData && object.userData.tick) ticking.push(object.userData.tick);
  return object;
}

add(createSky());
add(createStars());
add(createAurora());
add(createLights());
add(createTerrain());
add(createWater());
add(createWoods());
add(createSquare());
add(createFireflies());

const village = createVillage();
scene.add(village.group);
for (const b of village.buildings) {
  if (b.userData.tick) ticking.push(b.userData.tick);
}

const creatures = add(createCreatures());

// --- interaction -----------------------------------------------------------
const hud = createHud({
  onPick: (id) => (id ? selection.selectById(id) : selection.select(null)),
  onReset: () => { selection.select(null); rig.reset(); }
});

const selection = createSelection({
  camera: rig.camera,
  buildings: village.buildings,
  renderer,
  onChange: (building) => {
    hud.show(building);
    if (building) rig.focusOn(building);
  }
});
scene.add(selection.ring);

window.addEventListener('resize', () => {
  rig.onResize();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- loop ------------------------------------------------------------------
const clock = new THREE.Clock();
let started = false;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  for (const tick of ticking) tick(t, dt);
  selection.tick(t);
  rig.update(dt);

  renderer.render(scene, rig.camera);
  if (!started) { started = true; hud.hideLoader(); }
  requestAnimationFrame(frame);
}

frame();

// Keep a handle for debugging in the console.
window.emberhollow = { scene, renderer, rig, selection, creatures };
