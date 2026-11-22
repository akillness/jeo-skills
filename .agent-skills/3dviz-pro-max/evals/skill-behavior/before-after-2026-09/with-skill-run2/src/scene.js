// scene.js - assembles Lanternfall and owns the authoritative selection state. The lighting rig
// lives here rather than in main.js because lantern placement is scene data: the practicals and
// the buildings they hang on have to be built together.
import * as THREE from 'three';
import { createNightLanternRig } from './rigs/lighting-night-lantern.js';
import { createMaterials } from './village/materials.js';
import { createTerrain, riverCenter, heightAt, bankZ, WATER_Y } from './village/terrain.js';
import { createWater } from './village/water.js';
import { createBridge, createBoats, createMillWheel, createQuay } from './village/props.js';
import { createBuilding } from './village/buildings.js';
import { createFoliage, makeRandom } from './village/foliage.js';
import { createLanterns } from './village/lanterns.js';
import { createLampKeepers } from './village/creature-lamp-keepers.js';
import { createRiverDrakes } from './village/creature-river-drakes.js';
import { createLampMoths } from './village/creature-lamp-moths.js';
import { BUILDINGS, buildingKeepOut, lanternPoints, keeperRoutes, MOORINGS, DRAKES } from './village/village-layout.js';

/** 1 x 256 vertical gradient: a tinted sky, never the flat black that reads as unfinished. */
function gradientSky(zenith, horizon) {
  const canvas = Object.assign(document.createElement('canvas'), { width: 1, height: 256 });
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, zenith); gradient.addColorStop(1, horizon);
  context.fillStyle = gradient; context.fillRect(0, 0, 1, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createScene({ renderer, look }) {
  const scene = new THREE.Scene();
  const sky = gradientSky(look.sky.zenith, look.sky.horizon);
  scene.background = sky;
  scene.fog = new THREE.FogExp2(new THREE.Color(look.fog.color), look.fog.density);

  // Environment = the sky dome itself, at low intensity. The night-lantern record asks for no
  // environment; without a faint cool one the water and the wet quay render as black holes.
  const domeGeometry = new THREE.SphereGeometry(40, 20, 16);
  const domeMaterial = new THREE.MeshBasicMaterial({ map: sky, side: THREE.BackSide });
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(domeGeometry, domeMaterial));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(envScene, 0.1);
  scene.environment = environment.texture;
  scene.environmentIntensity = look.environment.intensity;

  const materials = createMaterials();
  // moonIntensity/fillIntensity above the record's 0.15/0.12: this is a 90 m valley, not the 20 m
  // street the record was tuned on, and the far bank has to stay legible. Still far too weak to key.
  const night = createNightLanternRig(scene, {
    maxLights: 10, shadowLanterns: 1, lanternRadius: 0.075, moonIntensity: 0.32, fillIntensity: 0.24
  });
  for (const { light } of night.lanterns) if (light?.shadow) light.shadow.camera.far = 26;

  const terrain = createTerrain();
  scene.add(terrain.mesh);
  const water = createWater(scene);
  const quay = createQuay(materials);
  scene.add(quay.group);
  const bridge = createBridge(materials);
  scene.add(bridge.group);
  const boats = createBoats(materials, MOORINGS);
  scene.add(boats.group);
  const wheel = createMillWheel(materials, -24, -8.4);
  scene.add(wheel.group);

  // Buildings: authoritative records first, meshes second, so selection never depends on a mesh.
  const random = makeRandom(77012026);
  const pickTargets = [], records = [], groups = new Map();
  for (const spec of BUILDINGS) {
    const group = createBuilding(spec, { materials, random });
    scene.add(group);
    pickTargets.push(group);
    groups.set(spec.id, group);
    records.push({ id: spec.id, name: spec.name, note: spec.note, dims: group.userData.dims,
      anchor: group.userData.anchor, size: group.userData.size });
  }

  const foliage = createFoliage(buildingKeepOut());
  scene.add(foliage.group);

  const crown = bridge.lanternSpots.slice(4, 6).map(([x, y, z]) => ({ x, y, z, pole: false }));
  const rest = bridge.lanternSpots.filter((_, i) => i < 4 || i > 5).map(([x, y, z]) => ({ x, y, z, pole: false }));
  const lanterns = createLanterns(scene, night, [...crown, ...lanternPoints(), ...rest], materials, water);
  scene.add(lanterns.group);
  // One wide cool streak: the thin moon on the water, the only cool highlight in the frame.
  water.addReflection(-26, riverCenter(-26) + 2, '#8fa6e8', 2.6, 16);

  const keepers = createLampKeepers(materials, keeperRoutes());
  scene.add(keepers.group);
  const drakes = createRiverDrakes(materials, DRAKES);
  scene.add(drakes.group);
  const moths = createLampMoths(materials, [
    { anchor: [4, heightAt(4, bankZ(4, 18.6)) + 3.6, bankZ(4, 18.6)], radius: 1.15, speed: 1.05, phase: 0 },
    { anchor: [-6, heightAt(-6, bankZ(-6, 13.4)) + 3.2, bankZ(-6, 13.4)], radius: 0.95, speed: -0.82, phase: 2.1 },
    { anchor: [-13, WATER_Y + 3.3, bankZ(-13, -5.5)], radius: 1.35, speed: 0.7, phase: 4.4 }
  ]);
  scene.add(moths.group);

  // Selection marker: one ring, moved and resized, so the highlight is a single owned object.
  const markerGeometry = new THREE.TorusGeometry(1, 0.06, 8, 44);
  const marker = new THREE.Mesh(markerGeometry, materials.marker);
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  scene.add(marker);

  let selected = null, time = 0;
  function select(id) {
    if (selected) {
      for (const material of groups.get(selected).userData.ownMaterials) {
        material.emissive.setHex(0x000000); material.emissiveIntensity = 0;
      }
    }
    selected = groups.has(id) ? id : null;
    if (!selected) { marker.visible = false; return null; }
    const group = groups.get(selected);
    for (const material of group.userData.ownMaterials) {
      material.emissive.set('#5a3a12'); material.emissiveIntensity = 0.7;
    }
    const spec = BUILDINGS.find(b => b.id === selected);
    const z = bankZ(spec.x, spec.off);
    const radius = Math.max(spec.w, spec.d) * 0.78 + 0.9;
    marker.position.set(spec.x, (spec.stilts ? WATER_Y : heightAt(spec.x, z)) + 0.12, z);
    marker.scale.set(radius, radius, 1);
    marker.visible = true;
    return records.find(r => r.id === selected);
  }

  return {
    scene, records, pickTargets, select,
    get selected() { return selected; },
    /** @returns {boolean} true while anything is animating; the loop parks when it goes false. */
    update(dt) {
      if (dt <= 0) return false;      // dt is 0 only when motion is paused on purpose
      time += dt;
      water.update(time);
      lanterns.update(time);
      boats.update(time);
      wheel.update(dt);
      keepers.update(time, dt);
      drakes.update(time, dt);
      moths.update(time);
      if (marker.visible) materials.marker.emissiveIntensity = 1.0 + Math.sin(time * 2.4) * 0.35;
      return true;
    },
    dispose() {
      night.dispose(); terrain.dispose(); water.dispose(); quay.dispose(); boats.dispose();
      wheel.dispose(); foliage.dispose(); lanterns.dispose(); keepers.dispose(); drakes.dispose();
      moths.dispose(); markerGeometry.dispose(); domeGeometry.dispose(); domeMaterial.dispose();
      for (const group of groups.values()) {
        group.traverse(object => object.geometry?.dispose());
        for (const material of group.userData.ownMaterials) material.dispose();
      }
      bridge.group.traverse(object => object.geometry?.dispose());
      materials.disposeAll(); sky.dispose(); environment.dispose(); pmrem.dispose();
    }
  };
}
