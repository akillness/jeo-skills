// scene.js - assembles Threadwater Hollow. Everything substantial lives under src/: the look
// numbers, the height field, the buildings, the dressing and the walkers. This file only owns
// the sky, the fog, the environment, the plan, the wool-mote idle motion and the update order.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { planVillage } from './kits/layout/village-layout.js';
import { LOOK, VILLAGE } from './src/look.js';
import { createHeightField, createTerrain, createLanes, riverCentreX } from './src/terrain-felt-ground.js';
import { feltify, materialise, feltRoughnessValues, disposeFelt } from './src/felt-material-pass.js';
import { createBuildings } from './src/village-buildings.js';
import { createDressing } from './src/village-dressing.js';
import { createCreatures } from './src/village-creatures.js';

const MOTE_COUNT = 9;

/** 1 x 256 vertical gradient sky: cheap, tinted, and never the flat black that reads unfinished. */
function gradientSky(zenith, horizon) {
  const canvas = Object.assign(document.createElement('canvas'), { width: 1, height: 256 });
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, zenith); gradient.addColorStop(0.62, horizon);
  gradient.addColorStop(1, '#c98a55');
  context.fillStyle = gradient; context.fillRect(0, 0, 1, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A village plan whose plots all keep clear of the river gorge. Deterministic in the seed. */
function planClearOfTheRiver() {
  for (let attempt = 0; attempt < 12; attempt++) {
    const plan = planVillage({ seed: VILLAGE.seed + attempt * 7, radius: VILLAGE.radius,
                               plotCount: VILLAGE.plotCount, pathWidth: VILLAGE.pathWidth });
    plan.plots = plan.plots.filter(plot => Math.abs(plot.position[0]
      - riverCentreX(plot.position[1])) > VILLAGE.riverEdge + 3.4);
    plan.scatterZones = plan.scatterZones.filter(zone => Math.abs(zone.centre_m[0]
      - riverCentreX(zone.centre_m[1])) > VILLAGE.riverEdge + 2);
    if (plan.plots.length >= 7) return plan;
  }
  throw new Error('no seed produced a village plan clear of the river');
}

export function createScene({ renderer, look = LOOK }) {
  const scene = new THREE.Scene();
  const sky = gradientSky(look.sky.zenith, look.sky.horizon);
  scene.background = sky;
  scene.fog = new THREE.FogExp2(new THREE.Color(look.fog.color), look.fog.density);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = look.environment.intensity;

  const plan = planClearOfTheRiver();
  const heightAt = createHeightField(plan);
  const terrain = createTerrain({ heightAt, materialise });
  scene.add(terrain.group);
  scene.add(createLanes(plan, heightAt, materialise({ color: '#b9a583', roughness: 0.99 })));

  const buildings = createBuildings({ plan, heightAt });
  const dressing = createDressing({ plan, heightAt, entries: buildings.entries });
  const creatures = createCreatures({ plan, heightAt, THREE });
  for (const group of [buildings.group, dressing.group, creatures.group]) {
    feltify(group);
    scene.add(group);
  }

  // Wool motes: the only surfaces authored above the bloom threshold besides the lantern paper,
  // and the scene's standing idle motion when every walker happens to be behind a roof.
  const moteMaterial = materialise({ color: look.palette.lamp, roughness: 0.5,
                                     emissive: look.palette.lamp, emissiveIntensity: 2.6 });
  const moteGeometry = new THREE.SphereGeometry(0.055, 10, 8);
  const motes = [];
  for (let i = 0; i < MOTE_COUNT; i++) {
    const mote = new THREE.Mesh(moteGeometry, moteMaterial);
    const angle = (i / MOTE_COUNT) * Math.PI * 2, radius = 5 + (i % 4) * 2.6;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    mote.position.set(x, heightAt(x, z) + 1.6 + (i % 3) * 0.7, z);
    mote.userData = { phase: i * 1.31, home: mote.position.y };
    motes.push(mote);
    scene.add(mote);
  }

  let time = 0;
  return {
    scene, heightAt, entries: buildings.entries, plan,
    stats: { buildings: buildings.entries.length, walkers: creatures.walkers.length,
             practicals: dressing.practicals, roughness: feltRoughnessValues() },
    /** @returns {boolean} true while anything is animating; the loop parks when it goes false. */
    update(dt) {
      if (dt <= 0) return false;          // dt is 0 only when motion is paused on purpose
      time += dt;
      for (const mote of motes) {
        mote.position.y = mote.userData.home + Math.sin(time * 0.8 + mote.userData.phase) * 0.22;
      }
      const moved = [terrain.animate(dt), buildings.animate(dt), dressing.animate(dt),
                     creatures.animate(dt)];
      return moved.some(Boolean);
    },
    dispose() {
      scene.traverse(object => object.geometry?.dispose());
      terrain.dispose();
      moteGeometry.dispose();
      disposeFelt();
      sky.dispose(); environment.dispose(); pmrem.dispose();
    }
  };
}
