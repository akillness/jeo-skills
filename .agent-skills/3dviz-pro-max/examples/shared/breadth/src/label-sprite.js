// label-sprite.js - one canvas-text sprite helper shared by all three exhibits. Text is drawn
// with a system font stack on a local canvas: no remote font, no image asset, nothing fetched at
// runtime. Height is given in metres so a label keeps its real size next to a stated dimension.
import * as THREE from 'three';

const FONT = '600 48px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/**
 * @param {string} text
 * @param {{color?: string, height?: number, font?: string, background?: string}} [options]
 *   height is the sprite's world height in metres.
 * @returns {THREE.Sprite} with `.material.map` owned by the sprite; dispose both.
 */
export function makeLabel(text, { color = '#3a4650', height = 0.11, font = FONT,
                                  background = null } = {}) {
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  const padding = 16;
  const width = Math.ceil(measure.measureText(text).width) + padding * 2;
  const canvas = Object.assign(document.createElement('canvas'), { width, height: 72 });
  const context = canvas.getContext('2d');
  if (background) { context.fillStyle = background; context.fillRect(0, 0, width, 72); }
  context.font = font; context.fillStyle = color;
  context.textBaseline = 'middle'; context.textAlign = 'left';
  context.fillText(text, padding, 38);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;            // a text atlas has no useful mip chain
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true,
                                                             depthWrite: false }));
  sprite.scale.set(height * (width / 72), height, 1);
  return sprite;
}

/** Frees a sprite made by makeLabel: the texture is not shared with anything else. */
export function disposeLabel(sprite) {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}
