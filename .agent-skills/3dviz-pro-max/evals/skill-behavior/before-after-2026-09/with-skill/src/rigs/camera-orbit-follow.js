// camera-orbit-follow.js - change `limits` (they come from a style profile's camera.orbit block)
// and the tween duration. Call rig.update(dt) once per frame and render when it returns true.
// Ported from examples/early-slice/main.js (focus / resetView / the follow cancel on user input).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const TWEEN_SECONDS = 0.9;

/**
 * @param {{camera: THREE.PerspectiveCamera, canvas: HTMLElement,
 *   limits: {minPolarDeg: number, maxPolarDeg: number, minDist: number, maxDist: number},
 *   views: Record<string, {position: number[], target: number[]}>}} options - views[0] is home.
 */
export function createCameraRig({ camera, canvas, limits, views }) {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.enablePan = false;
  controls.minDistance = limits.minDist; controls.maxDistance = limits.maxDist;
  controls.minPolarAngle = THREE.MathUtils.degToRad(limits.minPolarDeg);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(limits.maxPolarDeg);

  const home = Object.keys(views)[0];
  let tween = null, follow = null;

  // Any hand on the mouse wins: a tween or a follow that fights the user reads as a broken camera.
  const cancel = () => { tween = null; follow = null; };
  controls.addEventListener('start', cancel);

  /** Moves to a world position over TWEEN_SECONDS; followFn keeps tracking a moving subject. */
  function focus(position, distance = 7, viewDirection = null, followFn = null) {
    follow = followFn;
    const target = new THREE.Vector3(...position);
    const direction = viewDirection
      ? new THREE.Vector3(...viewDirection).normalize()
      : camera.position.clone().sub(controls.target).normalize();
    tween = {
      elapsed: 0,
      from: camera.position.clone(),
      targetFrom: controls.target.clone(),
      to: target.clone().addScaledVector(direction, distance),
      target
    };
  }

  function setView(name) {
    const view = views[name];
    if (!view) return false;
    cancel();
    camera.position.set(...view.position);
    controls.target.set(...view.target); controls.update();
    return true;
  }

  return {
    controls,
    focus,
    setView,
    reset: () => setView(home),
    /** @returns {boolean} true while the camera is still moving, so the loop keeps drawing. */
    update(dt) {
      if (tween) {
        if (follow) {
          const next = new THREE.Vector3(...follow());
          tween.to.add(next.clone().sub(tween.target));
          tween.target.copy(next);
        }
        tween.elapsed += dt;
        const p = Math.min(1, tween.elapsed / TWEEN_SECONDS), ease = p * p * (3 - 2 * p);
        camera.position.lerpVectors(tween.from, tween.to, ease);
        controls.target.lerpVectors(tween.targetFrom, tween.target, ease);
        if (p === 1) tween = null;
      } else if (follow) {
        const target = new THREE.Vector3(...follow());
        camera.position.add(target.clone().sub(controls.target));
        controls.target.copy(target);
      }
      return controls.update() || Boolean(tween || follow);
    },
    dispose() { cancel(); controls.removeEventListener('start', cancel); controls.dispose(); }
  };
}
