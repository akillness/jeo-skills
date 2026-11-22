// viewer-contract.js - do not rename the two globals. `python3 scripts/capture.py` and the
// evaluation harness read exactly `window.__sceneReady` and `window.__viewer`; add nothing else.
// Change only what a view is made of if your camera is not an orbit camera.

/**
 * Publishes the capture contract for a scene.
 * @param {object} options
 * @param {THREE.Camera} options.camera - camera moved by setView when no rig setView is given.
 * @param {object} options.controls - OrbitControls-like object with a `target` and `update()`.
 * @param {Record<string, {position: number[], target: number[]}>} options.views - named views.
 * @param {(name: string) => void} [options.setView] - rig mover; use it when a rig owns tweens.
 * @param {() => void} [options.invalidate] - demand-driven loop invalidator. Required for a
 *   demand-driven loop: without it setView moves the camera and no frame is ever drawn.
 * @returns {{markReady: () => void}} call markReady() right after the first renderer.render.
 */
export function installViewer({ camera, controls, views, setView, invalidate }) {
  function apply(name) {
    const view = views[name];
    if (!view) return false;
    if (setView) {
      setView(name);
    } else {
      camera.position.set(...view.position);
      controls.target.set(...view.target);
      controls.update();
    }
    invalidate?.();   // never optional in practice: a moved camera with no redraw is a dead control
    return true;
  }
  window.__viewer = { views: Object.keys(views), setView: apply };
  return { markReady() { window.__sceneReady = true; } };
}
