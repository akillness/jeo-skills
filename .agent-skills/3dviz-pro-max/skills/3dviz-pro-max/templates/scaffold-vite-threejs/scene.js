// scene.js - replace the hero, the scale cues and the scatter with your subject. Keep the sky /
// fog / environment block, the materialFor cache, at least one scale cue with a stated real
// dimension, and per-instance jitter on anything you repeat.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const SCATTER_COUNT = 30, MOTE_COUNT = 6;

// Deterministic jitter (mulberry32): the same build draws the same frame, so captures compare.
function makeRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 1 x 256 vertical gradient: cheap, tinted, and never the flat black that reads as unfinished.
function gradientSky(zenith, horizon) {
  const canvas = Object.assign(document.createElement('canvas'), { width: 1, height: 256 });
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, zenith); gradient.addColorStop(1, horizon);
  context.fillStyle = gradient; context.fillRect(0, 0, 1, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

export function createScene({ renderer, look }) {
  const scene = new THREE.Scene(), sky = gradientSky(look.sky.zenith, look.sky.horizon);
  scene.background = sky;
  scene.fog = new THREE.FogExp2(new THREE.Color(look.fog.color), look.fog.density);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture; scene.environmentIntensity = look.environment.intensity;

  const materials = new Map();
  function materialFor({ color, roughness = 0.7, metalness = 0, emissive = '#000000', emissiveIntensity = 0 }) {
    const key = [color, roughness, metalness, emissive, emissiveIntensity].join('|');
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity }));
    return materials.get(key);
  }
  function solid(geometry, material, position) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh); return mesh;
  }
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), materialFor({ color: look.palette.ground, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  // Hero: 1.6 x 2.2 x 1.2 m bevelled box. A 5 cm bevel is what catches the key light on an edge.
  solid(new RoundedBoxGeometry(1.6, 2.2, 1.2, 4, 0.05), materialFor({ color: look.palette.hero, roughness: 0.45 }), [0, 1.1, 0]);
  // Scale cues with stated dimensions: 2.0 m door frame, 0.45 m bench seat, 1.75 m figure.
  const frame = materialFor({ color: look.palette.prop, roughness: 0.6 });
  solid(new THREE.BoxGeometry(0.12, 2.0, 0.12), frame, [-2.4, 1.0, 1.6]);
  solid(new THREE.BoxGeometry(0.12, 2.0, 0.12), frame, [-3.5, 1.0, 1.6]);
  solid(new THREE.BoxGeometry(1.22, 0.14, 0.12), frame, [-2.95, 2.07, 1.6]);
  const timber = materialFor({ color: '#8a6a49', roughness: 0.8 });
  solid(new THREE.BoxGeometry(1.8, 0.08, 0.45), timber, [2.6, 0.45, 1.9]);
  solid(new THREE.BoxGeometry(0.1, 0.45, 0.4), timber, [1.85, 0.22, 1.9]);
  solid(new THREE.BoxGeometry(0.1, 0.45, 0.4), timber, [3.35, 0.22, 1.9]);
  solid(new THREE.CapsuleGeometry(0.22, 1.31, 6, 12), materialFor({ color: '#9aa0a6', roughness: 0.85 }), [-1.5, 0.88, 3.2]);
  // Scatter: one draw call, jittered position, rotation, scale and hue - never a uniform grid.
  const random = makeRandom(20260908);
  const scatter = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.45, 0), materialFor({ color: '#ffffff', roughness: 0.85 }), SCATTER_COUNT);
  const matrix = new THREE.Matrix4(), tint = new THREE.Color(), hsl = new THREE.Color(look.palette.foliage).getHSL({ h: 0, s: 0, l: 0 });
  for (let i = 0; i < SCATTER_COUNT; i++) {
    const angle = random() * Math.PI * 2, radius = 6 + random() * 16, scale = 0.6 + random() * 0.9;
    matrix.compose(new THREE.Vector3(Math.cos(angle) * radius, scale * 0.45, Math.sin(angle) * radius),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, random() * Math.PI * 2, 0)),
      new THREE.Vector3(scale, scale * (0.8 + random() * 0.6), scale));
    scatter.setMatrixAt(i, matrix);
    scatter.setColorAt(i, tint.setHSL(hsl.h + (random() - 0.5) * 0.06, hsl.s * (0.8 + random() * 0.4), hsl.l * (0.75 + random() * 0.5)));
  }
  scatter.castShadow = true; scatter.receiveShadow = true; scene.add(scatter);
  // Motes: the only surfaces authored above the bloom threshold, so bloom has one honest source,
  // and the scene's standing idle motion. Keep at least one moving thing here - update() returning
  // true is what keeps the demand-driven loop alive, and a still scene reads as a frozen page.
  const moteGeometry = new THREE.SphereGeometry(0.06, 12, 8), motes = [];
  const moteMaterial = materialFor({ color: look.palette.mote, roughness: 0.4, emissive: look.palette.mote, emissiveIntensity: 3 });
  for (let i = 0; i < MOTE_COUNT; i++) {
    const mote = new THREE.Mesh(moteGeometry, moteMaterial);
    const angle = (i / MOTE_COUNT) * Math.PI * 2; mote.position.set(Math.cos(angle) * 2.6, 1.4 + random() * 1.3, Math.sin(angle) * 2.6);
    mote.userData = { phase: random() * Math.PI * 2, home: mote.position.y };
    motes.push(mote); scene.add(mote);
  }
  let time = 0;
  return {
    scene, materialFor,
    /** @returns {boolean} true while anything is animating; the loop parks when it goes false. */
    update(dt) {
      if (dt <= 0) return false;   // dt is 0 only when motion is paused on purpose
      time += dt;
      for (const mote of motes) mote.position.y = mote.userData.home + Math.sin(time * 0.9 + mote.userData.phase) * 0.18;
      return true;
    },
    dispose() {
      scene.traverse(object => object.geometry?.dispose());
      for (const material of materials.values()) material.dispose();
      sky.dispose(); environment.dispose(); pmrem.dispose();
    }
  };
}
