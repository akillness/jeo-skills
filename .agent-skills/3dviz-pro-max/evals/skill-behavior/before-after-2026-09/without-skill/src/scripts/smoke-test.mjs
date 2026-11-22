// Headless sanity check: builds the whole world graph and runs 120 simulated
// frames of every animation tick. Catches runtime errors the bundler cannot.
// Run with:  node scripts/smoke-test.mjs

import { createTerrain, createWater, heightAt } from '../src/world/terrain.js';
import { createSky, createStars, createAurora, createLights } from '../src/world/sky-and-light.js';
import { createVillage, VILLAGE } from '../src/world/village-layout.js';
import { createWoods, createSquare, createFireflies } from '../src/world/scenery.js';
import { createCreatures } from '../src/systems/creatures.js';

const ticks = [];
const objects = [];
function register(name, obj) {
  objects.push([name, obj]);
  if (obj.userData && obj.userData.tick) ticks.push(obj.userData.tick);
  return obj;
}

register('sky', createSky());
register('stars', createStars());
register('aurora', createAurora());
register('lights', createLights());
const terrain = register('terrain', createTerrain());
register('water', createWater());
register('woods', createWoods());
register('square', createSquare());
register('fireflies', createFireflies());
const village = createVillage();
for (const b of village.buildings) if (b.userData.tick) ticks.push(b.userData.tick);
register('creatures', createCreatures());

let meshes = 0, tris = 0;
const countIn = (root) => root.traverse((o) => {
  if (!o.isMesh) return;
  meshes++;
  const idx = o.geometry.index;
  tris += (idx ? idx.count : o.geometry.attributes.position.count) / 3;
});
objects.forEach(([, o]) => countIn(o));
countIn(village.group);

// Ground truth checks.
const flatSpread = Math.max(
  ...[[0, 0], [6, 4], [-6, -4], [8, -8]].map(([x, z]) => heightAt(x, z))
) - Math.min(...[[0, 0], [6, 4], [-6, -4], [8, -8]].map(([x, z]) => heightAt(x, z)));

const problems = [];
if (village.buildings.length !== VILLAGE.length) problems.push('building count mismatch');
if (flatSpread > 1.0) problems.push(`village basin not flat enough: ${flatSpread.toFixed(2)}`);
for (const b of village.buildings) {
  if (!b.userData.name || !b.userData.desc) problems.push(`missing dossier: ${b.userData.id}`);
  if (!Number.isFinite(b.position.y)) problems.push(`bad ground y: ${b.userData.id}`);
}

// Run the animation for two seconds of simulated time.
for (let i = 0; i < 120; i++) {
  const t = i / 60;
  for (const tick of ticks) tick(t, 1 / 60);
}

// Creature positions must stay finite and above the terrain.
const creatures = objects.find(([n]) => n === 'creatures')[1];
creatures.traverse((o) => {
  if (!Number.isFinite(o.position.x + o.position.y + o.position.z)) {
    problems.push('non-finite creature transform');
  }
});

console.log(`buildings: ${village.buildings.length}  meshes: ${meshes}  triangles: ${Math.round(tris)}`);
console.log(`animation ticks registered: ${ticks.length}`);
console.log(`terrain vertices: ${terrain.geometry.attributes.position.count}`);
console.log(`village basin height spread: ${flatSpread.toFixed(3)}`);

if (problems.length) {
  console.error('FAIL\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log('OK — world builds and animates without errors');
