// felt-material-pass.js - the art direction, applied as one pass over finished kit geometry.
// knowledge.style-felt-wool: wool has almost no specular lobe, so the softness has to come from a
// sheen-driven fibre rim, never from gloss. Every kit module authors its own MeshStandardMaterial
// palette; this pass re-makes each one as felt while keeping the hue relationships the kit chose,
// so a plaster wall, a roof tile and an oak stave still read as three different bolts of cloth.
import * as THREE from 'three';
import { LOOK } from './look.js';

const { roughness: [MIN_R, MAX_R], sheen, sheenRoughness, sheenColor } = LOOK.felt;
const converted = new Map();      // source material uuid -> felt material, so the count stays low
const made = [];

/** Build a felt material from scratch (the terrain and the selection ring use this directly). */
export function materialise({ color, roughness = 0.9, emissive = null, emissiveIntensity = 0,
                              vertexColors = false, flatShading = false, map = null,
                              transparent = false, opacity = 1 }) {
  const material = new THREE.MeshPhysicalMaterial({
    color, roughness, metalness: 0, vertexColors, flatShading, map, transparent, opacity,
    sheen, sheenRoughness, sheenColor: new THREE.Color(sheenColor)
  });
  if (emissive) { material.emissive = new THREE.Color(emissive); material.emissiveIntensity = emissiveIntensity; }
  made.push(material);
  return material;
}

/** Wool sits in a narrow matte band; the mapping keeps the kit's ordering of rough vs smooth. */
const feltRoughness = r => MIN_R + (MAX_R - MIN_R) * Math.min(1, Math.max(0, r));

/** Desaturate towards wool: dyed felt tops out around 70% saturation, bodies at 25-45%. */
function woolColour(source) {
  const hsl = source.getHSL({ h: 0, s: 0, l: 0 });
  const colour = new THREE.Color();
  colour.setHSL(hsl.h, Math.min(hsl.s * 0.82, 0.7), Math.min(0.86, hsl.l * 0.97));
  return colour;
}

function convert(source) {
  const existing = converted.get(source.uuid);
  if (existing) return existing;
  const felt = materialise({
    color: woolColour(source.color),
    roughness: feltRoughness(source.roughness),
    emissive: source.emissive && source.emissive.getHex() !== 0
      ? `#${source.emissive.getHexString()}` : null,
    emissiveIntensity: source.emissiveIntensity,
    vertexColors: source.vertexColors,
    flatShading: source.flatShading,
    map: source.map,
    transparent: source.transparent,
    opacity: source.opacity
  });
  converted.set(source.uuid, felt);
  return felt;
}

/**
 * Re-materialises everything under `root` as felt and turns shadows on.
 * @param {THREE.Object3D} root
 * @param {{shadows?: boolean}} [options]
 */
export function feltify(root, { shadows = true } = {}) {
  root.traverse(node => {
    if (!node.isMesh && !node.isInstancedMesh) return;
    node.material = Array.isArray(node.material) ? node.material.map(convert) : convert(node.material);
    if (shadows) { node.castShadow = true; node.receiveShadow = true; }
  });
  return root;
}

/** Distinct roughness values now live in the frame - anti-slop item 13 is read from this. */
export function feltRoughnessValues() {
  return [...new Set(made.map(material => Math.round(material.roughness * 1000) / 1000))].sort();
}

export function disposeFelt() {
  for (const material of made) material.dispose();
  made.length = 0;
  converted.clear();
}
