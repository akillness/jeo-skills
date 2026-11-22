// materials.js - every surface in the village, in one place. Roughness is the main storytelling
// dial here: pond 0.11, iron 0.38, plaster 0.62 ... thatch 0.95, so no two material families catch
// the low sun the same way. Emissives (flame, forge, window, cap) are the only surfaces authored
// above the bloom threshold of 1.0, which is what keeps bloom honest.
import * as THREE from 'three';

const standard = (options) => new THREE.MeshStandardMaterial(options);

export function createMaterials(palette) {
  const emissive = (color, intensity, extra = {}) =>
    standard({ color, roughness: 0.3, emissive: color, emissiveIntensity: intensity, ...extra });

  const mats = {
    ground: standard({ vertexColors: true, roughness: 0.95 }),
    water: standard({ color: palette.water, roughness: 0.11, metalness: 0.15, transparent: true, opacity: 0.92 }),
    paving: standard({ color: palette.paving, roughness: 0.9 }),
    lane: standard({ color: palette.lane, roughness: 0.92, side: THREE.DoubleSide }),
    stone: standard({ color: palette.stone, roughness: 0.88 }),
    rock: standard({ color: palette.rock, roughness: 0.9 }),
    plaster: standard({ color: palette.plaster, roughness: 0.62 }),
    plasterAlt: standard({ color: palette.plasterAlt, roughness: 0.66 }),
    thatch: standard({ color: palette.thatch, roughness: 0.95 }),
    timber: standard({ color: palette.timber, roughness: 0.78 }),
    darkTimber: standard({ color: palette.darkTimber, roughness: 0.7 }),
    bark: standard({ color: palette.bark, roughness: 0.85 }),
    stump: standard({ color: palette.stump, roughness: 0.92 }),
    iron: standard({ color: palette.iron, roughness: 0.38, metalness: 0.65 }),
    coal: standard({ color: palette.coal, roughness: 0.96 }),
    canopy: standard({ vertexColors: true, roughness: 0.9 }),
    shrub: standard({ color: palette.shrub, roughness: 0.88 }),
    reed: standard({ color: palette.reed, roughness: 0.85 }),
    cloth: standard({ color: palette.cloth, roughness: 0.85, side: THREE.DoubleSide }),
    cloak: standard({ color: palette.cloak, roughness: 0.82 }),
    stalk: standard({ color: palette.stalk, roughness: 0.8 }),
    mothBody: standard({ color: palette.darkTimber, roughness: 0.8 }),
    smoke: standard({ color: palette.smoke, roughness: 1, transparent: true, opacity: 0.28, depthWrite: false }),
    glow: emissive(palette.windowGlow, 1.5, { side: THREE.DoubleSide }),
    flame: emissive(palette.flame, 2.2),
    forge: emissive(palette.forge, 2.4, { side: THREE.DoubleSide }),
    capGlow: emissive(palette.capGlow, 1.7),
    mothWing: emissive(palette.mothWing, 1.3, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    coats: palette.coats.map(color => standard({ color, roughness: 0.8 }))
  };
  return mats;
}

export function disposeMaterials(mats) {
  for (const value of Object.values(mats)) {
    if (Array.isArray(value)) value.forEach(material => material.dispose());
    else value.dispose();
  }
}
