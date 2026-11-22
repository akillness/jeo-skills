// water.js - the river: a planar mirror under two scrolling ripple layers, so every lantern on
// the quay appears twice, once in the air and once in the water (the look's signature technique).
// Custom geometry: no kit blueprint covers water. The ripple normal maps are drawn into a canvas
// at build time from summed sines - nothing is fetched and nothing ships.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RIVER, WATER_Y } from './terrain.js';

const WIDTH = 30, LENGTH = 152, SIZE = 256;

/** Ripple normal map: two crossed sine trains encoded as a tangent-space normal. */
function rippleNormalMap(scale, steepness) {
  const canvas = Object.assign(document.createElement('canvas'), { width: SIZE, height: SIZE });
  const context = canvas.getContext('2d');
  const image = context.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = (x / SIZE) * Math.PI * 2 * scale, v = (y / SIZE) * Math.PI * 2 * scale;
      // d/du and d/dv of h = sin(u) * 0.6 + sin(v * 1.7 + u * 0.4) * 0.4
      const dx = Math.cos(u) * 0.6 + Math.cos(v * 1.7 + u * 0.4) * 0.16;
      const dy = Math.cos(v * 1.7 + u * 0.4) * 0.68;
      const nx = -dx * steepness, ny = -dy * steepness, nz = 1;
      const inverse = 1 / Math.hypot(nx, ny, nz);
      const index = (y * SIZE + x) * 4;
      image.data[index] = (nx * inverse * 0.5 + 0.5) * 255;
      image.data[index + 1] = (ny * inverse * 0.5 + 0.5) * 255;
      image.data[index + 2] = (nz * inverse * 0.5 + 0.5) * 255;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 48);
  return texture;
}

/**
 * @returns {{group: THREE.Group, update(dt: number): boolean, dispose(): void}} update scrolls the
 *   two ripple layers along 37 deg and 128 deg, the two directions the look asks for.
 */
export function createWater(renderer) {
  const group = new THREE.Group();
  const plane = () => new THREE.PlaneGeometry(WIDTH, LENGTH).rotateX(-Math.PI / 2);

  const mirror = new Reflector(plane(), {
    clipBias: 0.006, textureWidth: 1024, textureHeight: 1024, color: 0x9aa0c4
  });
  mirror.position.set(RIVER.x, WATER_Y - 0.015, 0);
  group.add(mirror);

  const layers = [
    { map: rippleNormalMap(3, 1.1), speed: [0.02 * Math.cos(0.646), 0.02 * Math.sin(0.646)],
      opacity: 0.34, colour: '#2b3a63', roughness: 0.14, y: WATER_Y },
    { map: rippleNormalMap(5, 0.7), speed: [0.012 * Math.cos(2.234), 0.012 * Math.sin(2.234)],
      opacity: 0.2, colour: '#4a4a78', roughness: 0.26, y: WATER_Y + 0.012 }
  ];
  const surfaces = layers.map(layer => {
    const material = new THREE.MeshStandardMaterial({
      color: layer.colour, roughness: layer.roughness, metalness: 0.08, transparent: true,
      opacity: layer.opacity, normalMap: layer.map, depthWrite: false
    });
    material.normalScale.set(0.55, 0.55);
    const mesh = new THREE.Mesh(plane(), material);
    mesh.position.set(RIVER.x, layer.y, 0);
    mesh.renderOrder = 2;
    mesh.name = 'river';
    group.add(mesh);
    return { mesh, material, layer };
  });

  return {
    group,
    update(dt) {
      if (dt <= 0) return false;
      for (const { layer } of surfaces) {
        layer.map.offset.x = (layer.map.offset.x + layer.speed[0] * dt) % 1;
        layer.map.offset.y = (layer.map.offset.y + layer.speed[1] * dt) % 1;
      }
      return true;
    },
    dispose() {
      mirror.dispose?.();
      mirror.geometry.dispose();
      for (const { mesh, material, layer } of surfaces) {
        mesh.geometry.dispose(); material.dispose(); layer.map.dispose();
      }
    }
  };
}
