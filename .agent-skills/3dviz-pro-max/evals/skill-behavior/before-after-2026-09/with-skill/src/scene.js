// scene.js - assembles Emberfall: sky and fog, the terraced ground, the lanes, the eight buildings,
// the woodland scatter and the moving life. State lives in village-model.js; this file only builds
// what displays it. Change LOOK in main.js for mood, village-model.js for what the place contains.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LANES } from './village-model.js';
import { createMaterials, disposeMaterials } from './materials.js';
import { createTerrain, createWater, heightAt } from './terrain.js';
import { createLanes } from './lanes.js';
import { createBuildings } from './buildings.js';
import { createScatter, createWaymarkers } from './scatter.js';
import { createCreatures } from './creatures.js';

// 1 x 256 vertical gradient: cheap, tinted, and never the flat black that reads as unfinished.
function gradientSky(zenith, horizon) {
  const canvas = Object.assign(document.createElement('canvas'), { width: 1, height: 256 });
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, zenith);
  gradient.addColorStop(0.62, horizon);
  gradient.addColorStop(1, horizon);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createScene({ renderer, look }) {
  const scene = new THREE.Scene();
  const sky = gradientSky(look.sky.zenith, look.sky.horizon);
  scene.background = sky;
  scene.fog = new THREE.FogExp2(new THREE.Color(look.fog.color), look.fog.density);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = look.environment.intensity;

  const mats = createMaterials(look.palette);
  scene.add(createTerrain({ material: mats.ground, palette: look.palette }));
  scene.add(createWater(mats.water));

  const lanes = createLanes({ lanes: LANES, surface: mats.lane, stone: mats.stone });
  scene.add(lanes.mesh, lanes.steps);

  const village = createBuildings({ mats });
  scene.add(village.group);

  const scatter = createScatter({ mats, palette: look.palette });
  scene.add(scatter.group, createWaymarkers({ mats }));

  // Fence along the store's lane: 1.1 m posts, the second stated scale cue after the 2.0 m doors.
  const fence = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const x = -4.4 - i * 1.35, z = 15.9 + Math.sin(i * 0.5) * 0.35;
    const y = heightAt(x, z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 6), mats.timber);
    post.position.set(x, y + 0.5, z);
    post.rotation.z = Math.sin(i * 1.7) * 0.05;
    post.castShadow = true;
    fence.add(post);
    if (i > 0) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.09, 0.07), mats.timber);
      rail.position.set(x + 0.68, y + 0.78, z);
      rail.rotation.y = 0.2;
      rail.castShadow = true;
      fence.add(rail);
    }
  }
  scene.add(fence);

  const beacon = village.records.find(record => record.id === 'beacon');
  const smithy = village.records.find(record => record.id === 'smithy');
  const smokeOrigin = smithy.object.localToWorld(new THREE.Vector3(-1.9, 6.5, -1.4));
  const creatures = createCreatures({
    mats, palette: look.palette, smokeOrigin,
    beaconAnchor: beacon.anchor.clone()
  });
  scene.add(creatures.group);

  return {
    scene, mats, records: village.records, creatures,
    counts: { buildings: village.records.length, trees: scatter.treeCount, steps: lanes.stepCount },
    update(dt) { return creatures.update(dt); },
    dispose() {
      scene.traverse(object => object.geometry?.dispose());
      creatures.dispose();
      disposeMaterials(mats);
      sky.dispose();
      environment.dispose();
      pmrem.dispose();
    }
  };
}
