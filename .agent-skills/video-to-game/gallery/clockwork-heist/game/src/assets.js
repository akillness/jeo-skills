// Loads every fal-generated asset (textures, GLB models, audio) with a progress callback.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const TEX = {
  brass: 'assets/tex/brass.jpg',
  floor: 'assets/tex/floor_inlay.jpg',
  hall: 'assets/tex/hall_wall.jpg',
  clock: 'assets/tex/clock_face.jpg',
  handHour: 'assets/tex/hand_hour.webp',
  handMinute: 'assets/tex/hand_minute.webp',
  backplate: 'assets/tex/backplate.jpg',
  wood: 'assets/tex/wood.jpg',
  stone: 'assets/tex/stone.jpg',
  fabric: 'assets/tex/fabric.jpg',
  env: 'assets/tex/env.jpg',
  vault: 'assets/tex/vault_door.jpg',
  rays: 'assets/tex/rays.jpg',
};
const DATA_TEX = new Set([]); // none: every texture is colour data

const MODELS = {
  thief: 'assets/models/thief.glb',
  slab: 'assets/models/slab.glb',
  lever: 'assets/models/lever.glb',
  gem: 'assets/models/gem.glb',
  treasure: 'assets/models/treasure.glb',
};

export const SOUNDS = {
  music: 'assets/audio/music.mp3',
  jump: 'assets/audio/jump.mp3',
  land: 'assets/audio/land.mp3',
  lever: 'assets/audio/lever.mp3',
  leverUp: 'assets/audio/lever_release.mp3',
  gate: 'assets/audio/gate.mp3',
  gem: 'assets/audio/gem.mp3',
  bonk: 'assets/audio/bonk.mp3',
  respawn: 'assets/audio/respawn.mp3',
  swoosh: 'assets/audio/swoosh.mp3',
  bell: 'assets/audio/bell.mp3',
  vault: 'assets/audio/vault.mp3',
  win: 'assets/audio/win.mp3',
  tick: 'assets/audio/tick.mp3',
  bridge: 'assets/audio/bridge.mp3',
  join: 'assets/audio/join.mp3',
};

export async function loadAssets(renderer, onProgress = () => {}) {
  const total = Object.keys(TEX).length + Object.keys(MODELS).length + Object.keys(SOUNDS).length;
  let done = 0;
  const tick = () => { done++; onProgress(done / total); };
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const tl = new THREE.TextureLoader();
  const tex = {};
  const texJobs = Object.entries(TEX).map(([k, url]) =>
    tl.loadAsync(url).then((t) => {
      t.colorSpace = DATA_TEX.has(k) ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, maxAniso);
      tex[k] = t;
    }).catch((e) => { console.warn('texture missing', url, e?.message || e); tex[k] = null; }).finally(tick));

  const gl = new GLTFLoader();
  const models = {};
  const modelJobs = Object.entries(MODELS).map(([k, url]) =>
    gl.loadAsync(url).then((g) => { models[k] = g; })
      .catch((e) => { console.warn('model missing', url, e?.message || e); models[k] = null; }).finally(tick));

  const audio = {};
  const audioJobs = Object.entries(SOUNDS).map(([k, url]) =>
    fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => { audio[k] = b; })
      .catch(() => { audio[k] = null; }).finally(tick));

  await Promise.all([...texJobs, ...modelJobs, ...audioJobs]);
  return { tex, models, audio };
}
