// lighting-studio.js - defaults are knowledge.lighting-mood-dark-studio-product verbatim.
// Change the panel sizes in metres before you change intensity: a product's form is read from the
// shape of the reflection, and a 1.2 x 1.8 m soft box at 35 deg is a different shape from a strip.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// key:fill ~ 3:1; the rim reads about a stop over the key on the silhouette edge only.
const DARK_STUDIO = {
  subject: [0, 0.4, 0], environmentIntensity: 0.15, distance: 2.8,
  key: { color: '#ffffff', intensity: 12, width: 1.2, height: 1.8, elevationDeg: 35, azimuthDeg: 315 },
  fill: { color: '#eaf0ff', intensity: 4, width: 2.0, height: 1.2, elevationDeg: 15, azimuthDeg: 60 },
  rim: { color: '#ffffff', intensity: 8, width: 0.4, height: 1.6, elevationDeg: 25, azimuthDeg: 170 },
  contact: { color: '#ffffff', intensity: 0.3, mapSize: 2048, bias: -0.0001, normalBias: 0.02, extent: 6 }
};

/**
 * Adds a RoomEnvironment plus the three-panel dark studio set and a contact-shadow light.
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer - needed for the PMREM pass.
 * @param {Partial<typeof DARK_STUDIO>} [options]
 */
export function createStudioRig(scene, renderer, options = {}) {
  RectAreaLightUniformsLib.init(); // Required once before any RectAreaLight renders.
  const settings = { ...DARK_STUDIO, ...options };
  const subject = new THREE.Vector3(...settings.subject);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = settings.environmentIntensity;

  const panels = {};
  for (const name of ['key', 'fill', 'rim']) {
    const panel = settings[name];
    const light = new THREE.RectAreaLight(panel.color, panel.intensity, panel.width, panel.height);
    light.position.setFromSphericalCoords(settings.distance,
      THREE.MathUtils.degToRad(90 - panel.elevationDeg),
      THREE.MathUtils.degToRad(panel.azimuthDeg)).add(subject);
    light.lookAt(subject);
    scene.add(light);
    panels[name] = light;
  }

  // RectAreaLights cast no shadow; this weak directional supplies the single contact shadow.
  const contact = new THREE.DirectionalLight(settings.contact.color, settings.contact.intensity);
  contact.position.set(subject.x, subject.y + 4, subject.z + 0.5);
  contact.target.position.copy(subject);
  contact.castShadow = true;
  contact.shadow.mapSize.set(settings.contact.mapSize, settings.contact.mapSize);
  contact.shadow.bias = settings.contact.bias;
  contact.shadow.normalBias = settings.contact.normalBias;
  const box = contact.shadow.camera;
  box.left = box.bottom = -settings.contact.extent;
  box.right = box.top = settings.contact.extent;
  box.updateProjectionMatrix();
  scene.add(contact, contact.target);

  return {
    ...panels, contact, environment, settings,
    dispose() {
      for (const light of [panels.key, panels.fill, panels.rim, contact]) {
        light.parent?.remove(light);
        light.shadow?.map?.dispose();
        light.dispose?.();
      }
      contact.target.parent?.remove(contact.target);
      scene.environment = null;
      environment.dispose(); pmrem.dispose();
    }
  };
}
