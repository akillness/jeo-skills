// scene.js - assembles the riverside lantern village: sky and fog from the look, the carved
// height field, the river, the practicals, the kit buildings, the planting, the props and the
// walkers. Everything that moves is collected into one update(dt) whose return value keeps the
// demand-driven loop awake.
import * as THREE from 'three';
import { createNightLanternRig } from './rigs/lighting-night-lantern.js';
import { gradientSky, skyEnvironment } from './world/sky.js';
import { createTerrain, laneRibbon, densify, makeHeightField, WATER_Y } from './world/terrain.js';
import { LANES, pads } from './world/village-plan.js';
import { createWater } from './world/water.js';
import { createVillage } from './world/village.js';
import { createLanterns } from './world/lanterns.js';
import { createNature } from './world/nature.js';
import { createProps } from './world/props.js';
import { createCreatures } from './world/creatures.js';

const EMBER_COUNT = 9;

/** Warm embers drifting over the square: the only other surface above the bloom threshold. */
function createEmbers(heightAt, colour) {
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(0.035, 6, 5);
  const material = new THREE.MeshStandardMaterial({ color: colour, emissive: colour,
                                                    emissiveIntensity: 3.0, roughness: 0.4 });
  const embers = [];
  for (let i = 0; i < EMBER_COUNT; i++) {
    const angle = (i / EMBER_COUNT) * Math.PI * 2;
    const x = -4 + Math.cos(angle) * (2.6 + i * 0.42), z = 1 + Math.sin(angle) * (2.2 + i * 0.3);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, heightAt(x, z) + 2.1 + (i % 4) * 0.42, z);
    mesh.userData = { home: mesh.position.y, phase: i * 0.83, drift: 0.5 + (i % 3) * 0.22 };
    embers.push(mesh);
    group.add(mesh);
  }
  return { group, embers, geometry, material };
}

/** @returns {Promise<{scene, update(dt), items, heightAt, dispose()}>} */
export async function createScene({ renderer, look }) {
  const scene = new THREE.Scene();
  const sky = gradientSky(look.sky);
  const environment = skyEnvironment(renderer, sky);
  scene.background = sky;
  scene.environment = environment.texture;
  scene.environmentIntensity = look.environment.intensity;
  scene.fog = new THREE.FogExp2(new THREE.Color(look.fog.color), look.fog.density);

  const heightAt = makeHeightField(pads());
  const ground = createTerrain(heightAt);
  scene.add(ground.mesh);
  for (const lane of LANES) scene.add(laneRibbon(densify(lane.points), lane.width, heightAt));

  const water = createWater(renderer);
  scene.add(water.group);

  // Lighting: the rig carries knowledge.lighting-mood-night-lantern; the values pasted in come
  // from knowledge.style-lantern-festival-riverside (rim colour, hemisphere pair, intensities).
  const rig = createNightLanternRig(scene, {
    moonColor: look.lights.rim.color, moonIntensity: look.lights.rim.intensity,
    moonElevationDeg: look.lights.rim.elevationDeg, moonAzimuthDeg: look.lights.rim.azimuthDeg,
    skyColor: look.lights.fill.sky, groundColor: look.lights.fill.ground,
    fillIntensity: look.lights.fill.intensity, maxLights: 0
  });
  rig.moon.castShadow = true;                 // the rim is the only shadow that describes the site
  rig.moon.shadow.mapSize.set(2048, 2048);
  rig.moon.shadow.camera.near = 12;
  rig.moon.shadow.camera.far = 150;
  Object.assign(rig.moon.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42 });
  rig.moon.shadow.bias = -0.0006;
  rig.moon.shadow.normalBias = 0.04;
  rig.moon.shadow.camera.updateProjectionMatrix();

  const village = await createVillage(heightAt);
  scene.add(village.group);
  const lanterns = createLanterns(heightAt);
  scene.add(lanterns.group);
  const nature = createNature(heightAt);
  scene.add(nature.group);
  const props = createProps(heightAt);
  scene.add(props.group);
  const creatures = createCreatures(heightAt);
  scene.add(creatures.group);
  const embers = createEmbers(heightAt, look.palette.ember);
  scene.add(embers.group);

  let time = 0;
  return {
    scene, heightAt, items: village.items, creatures, waterY: WATER_Y,
    lightCount: lanterns.lights.length,
    /** @returns {boolean} true while anything is animating. */
    update(dt) {
      if (dt <= 0) return false;
      time += dt;
      for (const ember of embers.embers) {
        ember.position.y = ember.userData.home
          + Math.sin(time * ember.userData.drift + ember.userData.phase) * 0.28;
      }
      const moving = [water.update(dt), lanterns.update(dt), village.animate(dt),
                      nature.animate(dt), creatures.animate(dt)];
      return moving.some(Boolean);
    },
    dispose() {
      water.dispose(); lanterns.dispose(); village.dispose(); rig.dispose();
      embers.geometry.dispose(); embers.material.dispose();
      scene.traverse(object => object.geometry?.dispose());
      sky.dispose(); environment.dispose();
    }
  };
}
