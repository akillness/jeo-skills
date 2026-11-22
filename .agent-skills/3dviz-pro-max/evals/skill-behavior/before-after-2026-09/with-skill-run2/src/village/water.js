// water.js - the Slowwater plus the trick that carries this look: every lantern appears twice,
// once in the air and once as a stretched streak on the surface (the signature technique of
// knowledge.style-lantern-festival-riverside). Change SCROLL first if the shimmer reads too fast.
import * as THREE from 'three';
import { WATER_Y, TERRAIN_SIZE } from './terrain.js';

const SCROLL = 0.02;   // uv/s, from the style record's two scrolling normal layers

/** Procedural normal map: two crossed wave trains, finite-differenced into a tangent normal. */
function waveNormalMap(size = 256) {
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  const height = (u, v) =>
    Math.sin((u * 6.0 + v * 2.0) * Math.PI * 2) * 0.6 +
    Math.sin((u * 2.0 - v * 5.0) * Math.PI * 2) * 0.4 +
    Math.sin((u * 11.0 + v * 9.0) * Math.PI * 2) * 0.12;
  const e = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const dx = (height(u + e, v) - height(u - e, v)) * 0.06;
      const dy = (height(u, v + e) - height(u, v - e)) * 0.06;
      const normal = new THREE.Vector3(-dx, -dy, 1).normalize();
      const i = (y * size + x) * 4;
      image.data[i] = (normal.x * 0.5 + 0.5) * 255;
      image.data[i + 1] = (normal.y * 0.5 + 0.5) * 255;
      image.data[i + 2] = (normal.z * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(14, 14);
  return texture;
}

/** Soft vertical streak used for a lantern's reflection: bright core, fading tails. */
function streakTexture(size = 64) {
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient; context.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/**
 * @param {THREE.Scene} scene
 * @returns {{mesh, addReflection(x, z, color, width, length), update(time), dispose()}}
 */
export function createWater(scene) {
  const normalMap = waveNormalMap();
  // envMapIntensity 2.4 and a floor of emissive keep the river from rendering as a black hole:
  // at night a real river still carries the sky. Roughness stays at the style record's 0.15.
  const material = new THREE.MeshStandardMaterial({
    color: '#16233f', roughness: 0.15, metalness: 0.22, normalMap,
    emissive: '#0c1830', emissiveIntensity: 0.55, envMapIntensity: 2.4,
    normalScale: new THREE.Vector2(0.5, 0.5)
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = WATER_Y;
  mesh.renderOrder = 1;
  scene.add(mesh);

  const streak = streakTexture();
  const geometry = new THREE.PlaneGeometry(1, 1);
  const reflections = [];
  /** A lantern's double on the water: additive, so it adds light without adding a light. */
  function addReflection(x, z, color, width = 1.1, length = 4.2) {
    const material2 = new THREE.MeshBasicMaterial({
      map: streak, color, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: true
    });
    const plane = new THREE.Mesh(geometry, material2);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(x, WATER_Y + 0.02, z);
    plane.scale.set(width, length, 1);
    plane.renderOrder = 2;
    scene.add(plane);
    reflections.push({ plane, material: material2, phase: reflections.length * 1.7, width, length });
    return plane;
  }

  return {
    mesh, addReflection,
    update(time) {
      normalMap.offset.set(time * SCROLL, time * SCROLL * 0.6);
      material.normalScale.setScalar(0.38 + Math.sin(time * 0.5) * 0.08);
      for (const r of reflections) {
        const wobble = Math.sin(time * 1.3 + r.phase) * 0.5 + Math.sin(time * 2.7 + r.phase) * 0.25;
        r.material.opacity = 0.55 + 0.28 * (wobble * 0.5 + 0.5);
        r.plane.scale.set(r.width * (1 + wobble * 0.12), r.length * (1 + wobble * 0.08), 1);
      }
    },
    dispose() {
      normalMap.dispose(); streak.dispose(); geometry.dispose();
      material.dispose(); mesh.geometry.dispose();
      for (const r of reflections) r.material.dispose();
    }
  };
}
