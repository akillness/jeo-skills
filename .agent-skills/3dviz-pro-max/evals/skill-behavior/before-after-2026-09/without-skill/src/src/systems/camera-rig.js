// Orbit camera with a remembered home view, eased fly-to, and a hard reset.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const HOME_POS = new THREE.Vector3(46, 34, 62);
const HOME_LOOK = new THREE.Vector3(0, 3, 2);

export function createCameraRig(renderer) {
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 800);
  camera.position.copy(HOME_POS);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME_LOOK);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 8;
  controls.maxDistance = 190;
  controls.maxPolarAngle = Math.PI * 0.49;   // never dip under the ground
  controls.minPolarAngle = 0.12;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.85;
  controls.panSpeed = 0.6;
  controls.update();

  const flight = {
    active: false, elapsed: 0, duration: 1.0,
    fromPos: new THREE.Vector3(), toPos: new THREE.Vector3(),
    fromLook: new THREE.Vector3(), toLook: new THREE.Vector3()
  };

  function flyTo(pos, look, duration = 1.0) {
    flight.fromPos.copy(camera.position);
    flight.fromLook.copy(controls.target);
    flight.toPos.copy(pos);
    flight.toLook.copy(look);
    flight.elapsed = 0;
    flight.duration = duration;
    flight.active = true;
  }

  /** Frame a building: stand off by its size, keeping the current viewing side. */
  function focusOn(object3d) {
    const height = object3d.userData.height ?? 6;
    const radius = object3d.userData.radius ?? 4;
    const look = new THREE.Vector3(
      object3d.position.x, object3d.position.y + height * 0.45, object3d.position.z);
    const dir = new THREE.Vector3().subVectors(camera.position, look);
    dir.y = 0;
    if (dir.lengthSq() < 0.001) dir.set(1, 0, 1);
    dir.normalize();
    const dist = Math.max(14, radius * 3.4 + height * 1.15);
    const pos = look.clone().addScaledVector(dir, dist);
    pos.y = look.y + height * 0.75 + 6;
    flyTo(pos, look, 1.05);
  }

  function reset() {
    flyTo(HOME_POS, HOME_LOOK, 1.1);
  }

  /** Cancel an in-flight move as soon as the user grabs the camera. */
  controls.addEventListener('start', () => { flight.active = false; });

  function update(dt) {
    if (flight.active) {
      flight.elapsed += dt;
      const t = Math.min(1, flight.elapsed / flight.duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;  // ease in-out cubic
      camera.position.lerpVectors(flight.fromPos, flight.toPos, e);
      controls.target.lerpVectors(flight.fromLook, flight.toLook, e);
      if (t >= 1) flight.active = false;
    }
    controls.update();
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  return { camera, controls, update, reset, focusOn, flyTo, onResize };
}
