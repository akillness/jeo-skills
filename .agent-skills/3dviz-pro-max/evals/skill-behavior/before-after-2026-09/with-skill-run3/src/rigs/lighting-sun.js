// lighting-sun.js - defaults are knowledge.lighting-mood-dusk-golden-hour verbatim. Change
// elevationDeg / azimuthDeg first (they set where every shadow points), then intensity, then
// colour. The overcast-soft alternative is commented below: swap the whole block, not one number.
import * as THREE from 'three';

// knowledge.lighting-mood-dusk-golden-hour: 20 min before sunset, sun elevation 6 deg, key:fill ~ 6:1.
const DUSK_GOLDEN_HOUR = {
  color: '#ffb46b', intensity: 3.2, elevationDeg: 6, azimuthDeg: 250,
  rimColor: '#ffd9a8', rimIntensity: 0.8, rimElevationDeg: 12, rimAzimuthDeg: 70,
  skyColor: '#6f8fc9', groundColor: '#4a3a2a', fillIntensity: 0.5,
  shadowExtent: 20, mapSize: 2048, bias: -0.0002, normalBias: 0.03, distance: 30
};

// knowledge.lighting-mood-overcast-soft: midday under full cloud, no sun disc, contrast under 2:1.
// The cloud deck IS the source, so the hemisphere carries the light and shadows stay off:
// { color: '#e8edf2', intensity: 0.6, elevationDeg: 70, azimuthDeg: 180, castShadow: false,
//   rimIntensity: 0, skyColor: '#cfd8e6', groundColor: '#6a6f66', fillIntensity: 1.2,
//   shadowExtent: 25, mapSize: 1024, bias: -0.0003, normalBias: 0.04 }
// Pair it with fog #cfd6dd density 0.035, environmentIntensity 0.35 and exposure 1.0.

/**
 * Adds a key / fill / rim sun rig to a scene and returns the lights plus a dispose().
 * @param {THREE.Scene} scene
 * @param {Partial<typeof DUSK_GOLDEN_HOUR> & {castShadow?: boolean}} [options]
 */
export function createSunRig(scene, options = {}) {
  const settings = { castShadow: true, ...DUSK_GOLDEN_HOUR, ...options };
  const place = (light, elevationDeg, azimuthDeg) => light.position.setFromSphericalCoords(
    settings.distance,
    THREE.MathUtils.degToRad(90 - elevationDeg),
    THREE.MathUtils.degToRad(azimuthDeg));

  const key = new THREE.DirectionalLight(settings.color, settings.intensity);
  place(key, settings.elevationDeg, settings.azimuthDeg);
  key.castShadow = settings.castShadow;
  if (key.castShadow) {
    key.shadow.mapSize.set(settings.mapSize, settings.mapSize);
    key.shadow.bias = settings.bias;
    key.shadow.normalBias = settings.normalBias;
    const box = key.shadow.camera;
    box.left = box.bottom = -settings.shadowExtent;
    box.right = box.top = settings.shadowExtent;
    box.far = settings.distance * 2;
    box.updateProjectionMatrix();
  }
  scene.add(key);

  const fill = new THREE.HemisphereLight(settings.skyColor, settings.groundColor, settings.fillIntensity);
  scene.add(fill);

  let rim = null;
  if (settings.rimIntensity > 0) {
    rim = new THREE.DirectionalLight(settings.rimColor, settings.rimIntensity);
    place(rim, settings.rimElevationDeg, settings.rimAzimuthDeg);
    scene.add(rim);
  }

  return {
    key, fill, rim, settings,
    /** Removes the lights and frees their shadow maps. */
    dispose() {
      for (const light of [key, fill, rim]) {
        if (!light) continue;
        light.parent?.remove(light);
        light.shadow?.map?.dispose();
        light.dispose?.();
      }
    }
  };
}
