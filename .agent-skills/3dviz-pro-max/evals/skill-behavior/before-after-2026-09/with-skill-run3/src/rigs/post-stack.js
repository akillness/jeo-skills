// post-stack.js - pmndrs postprocessing 6.39.4 with three 0.180.0. Change the bloom threshold
// first: it must sit above every diffuse surface and below the emissives, or the whole frame
// glows. Pass dof only when something in the scene is genuinely meant to be out of focus.
//
// TONE MAPPING - this stack owns it. three applies renderer.toneMapping only while drawing to the
// canvas (WebGLRenderer sets NoToneMapping whenever _currentRenderTarget !== null, three 0.180
// src/renderers/WebGLRenderer.js) and every pass here draws into a render target, so a composited
// frame with the tone map left on the renderer comes out flat. Passing `toneMapping` therefore
// sets renderer.toneMapping = NoToneMapping and appends a ToneMappingEffect LAST in the final
// EffectPass - one tone map, applied once, at the end. Exposure still rides on
// renderer.toneMappingExposure: the effect shader includes three's <tonemapping_pars_fragment>,
// whose `toneMappingExposure` uniform the renderer sets on every material it refreshes. Set it
// before the first render; dispose() restores both values. Note: an SRGB scene.background is
// toneMapped=false on the canvas path, but it IS tone mapped here, so the sky reads a shade deeper.
import { HalfFloatType, NoToneMapping } from 'three';
import {
  BloomEffect, DepthOfFieldEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect,
  ToneMappingMode, VignetteEffect
} from 'postprocessing';

const TONE_MAPPING_MODES = { ACESFilmic: ToneMappingMode.ACES_FILMIC, AgX: ToneMappingMode.AGX, Neutral: ToneMappingMode.NEUTRAL };

/**
 * @param {object} options
 * @param {THREE.WebGLRenderer} options.renderer
 * @param {THREE.Scene} options.scene
 * @param {THREE.Camera} options.camera
 * @param {{threshold: number, strength: number, radius: number}} [options.bloom]
 * @param {number} [options.vignette] - darkness 0..1; 0 disables the effect.
 * @param {{focusDistance: number, focusRange: number, bokehScale: number}} [options.dof]
 * @param {{mode: 'ACESFilmic'|'AgX'|'Neutral', exposure: number}} [options.toneMapping]
 * @returns {{composer, effects, render(dt), setSize(w, h), dispose()}}
 */
export function createPostStack({ renderer, scene, camera, bloom, vignette = 0, dof = null, toneMapping = null }) {
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));
  const effects = {};
  if (bloom) {
    effects.bloom = new BloomEffect({
      luminanceThreshold: bloom.threshold,
      luminanceSmoothing: 0.08,
      intensity: bloom.strength,
      radius: bloom.radius,
      mipmapBlur: true
    });
  }
  if (vignette > 0) effects.vignette = new VignetteEffect({ offset: 0.35, darkness: vignette });
  if (dof) {
    effects.dof = new DepthOfFieldEffect(camera, {
      focusDistance: dof.focusDistance,
      focusRange: dof.focusRange,
      bokehScale: dof.bokehScale ?? 2,
      resolutionScale: 0.5
    });
  }
  const previous = { toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure };
  if (toneMapping) {
    const mode = TONE_MAPPING_MODES[toneMapping.mode];
    if (mode === undefined) throw new RangeError(`Unknown tone mapping mode: ${toneMapping.mode}`);
    renderer.toneMapping = NoToneMapping;
    if (Number.isFinite(toneMapping.exposure)) renderer.toneMappingExposure = toneMapping.exposure;
    effects.toneMapping = new ToneMappingEffect({ mode }); // last in, last operator in the shader
  }
  const list = Object.values(effects);
  // One EffectPass merges the shaders; a pass per effect costs a full-screen blit each.
  if (list.length) composer.addPass(new EffectPass(camera, ...list));
  return {
    composer,
    effects,
    /** Call instead of renderer.render; dt drives the effects' own time uniforms. */
    render(dt) { composer.render(dt); },
    /** Call from the same ResizeObserver that resizes the renderer. */
    setSize(width, height) { composer.setSize(width, height); },
    dispose() {
      renderer.toneMapping = previous.toneMapping; renderer.toneMappingExposure = previous.exposure;
      for (const effect of list) effect.dispose();
      composer.dispose();
    }
  };
}
