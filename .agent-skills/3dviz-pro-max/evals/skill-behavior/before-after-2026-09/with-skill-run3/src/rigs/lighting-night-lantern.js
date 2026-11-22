// lighting-night-lantern.js - defaults are knowledge.lighting-mood-night-lantern verbatim.
// Change the lantern colour and candela first; keep decay 2 (physical falloff is what makes a
// pool of light read as night) and keep the moon weak enough that it only draws silhouettes.
import * as THREE from 'three';

// 60 cd at 2.4 m gives a pool about 3 m across; space lanterns so pools overlap by about a third.
const NIGHT_LANTERN = {
  moonColor: '#9fb4ff', moonIntensity: 0.15, moonElevationDeg: 22, moonAzimuthDeg: 40,
  skyColor: '#16233f', groundColor: '#241a12', fillIntensity: 0.12,
  lanternColor: '#ffb46b', lanternIntensity: 60, lanternHeight: 2.4, lanternRadius: 0.09,
  maxLights: 12, mapSize: 1024, bias: -0.0004, normalBias: 0.02, shadowLanterns: 2
};

/**
 * Adds the moon + hemisphere fill and returns createLantern(position) for the practicals.
 * @param {THREE.Scene} scene
 * @param {Partial<typeof NIGHT_LANTERN>} [options]
 */
export function createNightLanternRig(scene, options = {}) {
  const settings = { ...NIGHT_LANTERN, ...options };
  const moon = new THREE.DirectionalLight(settings.moonColor, settings.moonIntensity);
  moon.position.setFromSphericalCoords(60,
    THREE.MathUtils.degToRad(90 - settings.moonElevationDeg),
    THREE.MathUtils.degToRad(settings.moonAzimuthDeg));
  moon.castShadow = false;
  scene.add(moon);
  const fill = new THREE.HemisphereLight(settings.skyColor, settings.groundColor, settings.fillIntensity);
  scene.add(fill);

  const globe = new THREE.SphereGeometry(settings.lanternRadius, 12, 8);
  const glass = new THREE.MeshStandardMaterial({
    color: settings.lanternColor, emissive: settings.lanternColor, emissiveIntensity: 4, roughness: 0.35
  });
  const lanterns = [];

  /**
   * Adds one lantern. Past `maxLights` the mesh still glows but no PointLight is added: the
   * emissive-only fallback keeps the look and keeps the shader under its light-count limit.
   * @param {number[]} position - [x, y, z]; y is replaced by lanternHeight.
   * @returns {{mesh: THREE.Mesh, light: THREE.PointLight | null}}
   */
  function createLantern(position) {
    const mesh = new THREE.Mesh(globe, glass);
    mesh.position.set(position[0], settings.lanternHeight, position[2]);
    scene.add(mesh);
    let light = null;
    if (lanterns.length < settings.maxLights) {
      light = new THREE.PointLight(settings.lanternColor, settings.lanternIntensity, 0, 2);
      light.position.copy(mesh.position);
      if (lanterns.length < settings.shadowLanterns) {
        light.castShadow = true;
        light.shadow.mapSize.set(settings.mapSize, settings.mapSize);
        light.shadow.bias = settings.bias;
        light.shadow.normalBias = settings.normalBias;
      }
      scene.add(light);
    }
    const lantern = { mesh, light };
    lanterns.push(lantern);
    return lantern;
  }

  return {
    moon, fill, lanterns, createLantern, settings,
    dispose() {
      for (const light of [moon, fill]) { light.parent?.remove(light); light.dispose?.(); }
      for (const { mesh, light } of lanterns) {
        mesh.parent?.remove(mesh);
        if (light) { light.parent?.remove(light); light.shadow?.map?.dispose(); light.dispose(); }
      }
      globe.dispose(); glass.dispose();
    }
  };
}
