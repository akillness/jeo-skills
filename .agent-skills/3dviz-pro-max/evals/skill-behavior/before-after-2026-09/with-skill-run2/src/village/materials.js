// materials.js - the shared surfaces. Roughness values are deliberately spread across the range
// (water 0.15, wet quay 0.30, plank 0.55, ground 0.62, roof 0.70, stone 0.78, plaster 0.84,
// lantern paper 0.90) so lantern light lands differently on every material family.
import * as THREE from 'three';

export function createMaterials() {
  const materials = {
    timber: new THREE.MeshStandardMaterial({ color: '#6b4f36', roughness: 0.62 }),
    plank: new THREE.MeshStandardMaterial({ color: '#7a5c3e', roughness: 0.55 }),
    stone: new THREE.MeshStandardMaterial({ color: '#5f6068', roughness: 0.78 }),
    wetStone: new THREE.MeshStandardMaterial({ color: '#48505f', roughness: 0.3, metalness: 0.04 }),
    door: new THREE.MeshStandardMaterial({ color: '#3c2e27', roughness: 0.55 }),
    // Windows sit just under the lantern emissive so they read as inhabited without blooming hard.
    window: new THREE.MeshStandardMaterial({
      color: '#f7d69c', emissive: '#f2b25c', emissiveIntensity: 1.5, roughness: 0.5, side: THREE.DoubleSide
    }),
    lanternPaper: new THREE.MeshStandardMaterial({
      color: '#f2b25c', emissive: '#f2b25c', emissiveIntensity: 3.2, roughness: 0.9
    }),
    skin: new THREE.MeshStandardMaterial({ color: '#b3937a', roughness: 0.85 }),
    mothBody: new THREE.MeshStandardMaterial({ color: '#3a2f3f', roughness: 0.8 }),
    mothWing: new THREE.MeshStandardMaterial({
      color: '#e8d9b8', emissive: '#f2b25c', emissiveIntensity: 0.4, roughness: 0.9,
      transparent: true, opacity: 0.72, side: THREE.DoubleSide
    }),
    marker: new THREE.MeshStandardMaterial({
      color: '#f2b25c', emissive: '#f2b25c', emissiveIntensity: 1.1, roughness: 0.4,
      transparent: true, opacity: 0.85
    })
  };
  return {
    ...materials,
    disposeAll() { for (const material of Object.values(materials)) material.dispose(); }
  };
}
