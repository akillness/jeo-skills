// lanterns.js - the practicals that carry the whole composition: kit lantern-posts along the
// lanes, and paper lanterns strung between the tall posts' hook sockets over the square and the
// bridge. Custom geometry here is the paper lantern itself and the cord (no kit blueprint covers
// either); the posts are knowledge.blueprint-lantern-post at T2.
// Light budget: 12 dynamic PointLights, the cap the look states; every other lantern is emissive
// only, which is why the paper is authored above the bloom threshold.
import { THREE, materialFor, seeded } from '../kits/kit-core.js';
import { create as lanternPost } from '../kits/props/lantern-post.js';
import { buildKit } from '../kits/kit-core.js';
import { surfaceFor } from './kit-families.js';

const PAPER = '#f2b25c', FRAME = '#c8642e';
const POSTS = [
  { x: -8.4, z: 2.2, yaw: 0.2, height: 4.6, light: true, tag: 'A' },
  { x: -1.2, z: 1.4, yaw: -0.3, height: 4.6, light: true, tag: 'A' },
  { x: 2.5, z: 1.7, yaw: 0.1, height: 4.6, light: true, tag: 'B' },
  { x: 12.3, z: 1.7, yaw: 3.2, height: 4.6, light: true, tag: 'B' },
  { x: -13.4, z: 2.9, yaw: 0.9, height: 2.82, light: true },
  { x: -19.8, z: 4.6, yaw: 0.4, height: 2.82, light: false },
  { x: 3.4, z: -11.0, yaw: 2.1, height: 2.82, light: true },
  { x: 17.2, z: 3.6, yaw: -0.8, height: 2.82, light: true },
  { x: -8.0, z: -3.4, yaw: 1.4, height: 2.82, light: true },
  { x: -3.8, z: 5.1, yaw: 2.6, height: 2.82, light: false }
];

/** A 35 cm paper lantern: lathe body, bamboo rings, a warm emissive that bloom can find. */
function paperLantern(radius = 0.175) {
  const group = new THREE.Group();
  const profile = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    profile.push(new THREE.Vector2(radius * (0.24 + Math.sin(t * Math.PI) * 0.98), (t - 0.5) * radius * 2.3));
  }
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 14),
    materialFor(PAPER, { roughness: 0.9, emissive: PAPER, emissiveIntensity: 1.8 }));
  const ring = materialFor(FRAME, { roughness: 0.72 });
  for (const y of [-radius * 1.12, radius * 1.12]) {
    group.add(new THREE.Mesh(new THREE.TorusGeometry(radius * 0.3, 0.014, 5, 10)
      .rotateX(Math.PI / 2).translate(0, y, 0), ring));
  }
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 5)
    .translate(0, radius * 1.2 + 0.11, 0), ring));
  group.add(body);
  return group;
}

/**
 * @param {THREE.Scene} scene
 * @param {(x: number, z: number) => number} heightAt
 * @returns {{group, lights, update(dt): boolean, dispose(): void}}
 */
export function createLanterns(heightAt) {
  const group = new THREE.Group();
  const random = seeded(90210);
  const lights = [];
  const swayers = [];
  const hooks = { A: [], B: [] };
  const cordMaterial = materialFor('#2b2b30', { roughness: 0.8 });

  const addLight = (position, intensity, distance) => {
    if (lights.length >= 12) return null;
    const light = new THREE.PointLight(PAPER, intensity, distance, 2);
    light.position.copy(position);
    if (lights.length === 0) {           // one shadow-casting practical: the square's lead lantern
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      light.shadow.bias = -0.0006;
      light.shadow.normalBias = 0.03;
      light.shadow.camera.far = 14;
    }
    lights.push(light);
    group.add(light);
    return light;
  };

  for (const spec of POSTS) {
    const kit = buildKit(lanternPost, { height: spec.height, glass: '#ffc47f',
      seed: Math.floor(random() * 900) + 1,
      tier: 'T2', surface: surfaceFor('lantern-post', 3, { size: 256, samples: 10 }) });
    const holder = new THREE.Group();
    holder.position.set(spec.x, heightAt(spec.x, spec.z), spec.z);
    holder.rotation.y = spec.yaw;
    holder.add(kit.group);
    group.add(holder);
    holder.updateMatrixWorld(true);
    const world = name => {
      const socket = kit.sockets.find(entry => entry.name === name) ?? kit.sockets[0];
      return holder.localToWorld(new THREE.Vector3(...socket.position_m));
    };
    if (spec.light) addLight(world('lamp'), spec.height > 4 ? 75 : 52, spec.height > 4 ? 11 : 7);
    if (spec.tag) hooks[spec.tag].push(world('hook'));
  }

  // Strings: a sagging cord between two hook sockets, lanterns hung at even spacing along it.
  for (const [tag, count] of [['A', 3], ['B', 4]]) {
    const [from, to] = hooks[tag];
    if (!from || !to) continue;
    const sag = from.distanceTo(to) * 0.09;
    const mid = from.clone().add(to).multiplyScalar(0.5).add(new THREE.Vector3(0, -sag * 2, 0));
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.012, 5, false), cordMaterial));
    for (let i = 1; i <= count; i++) {
      const point = curve.getPoint(i / (count + 1));
      const pivot = new THREE.Group();
      pivot.position.copy(point);
      const lantern = paperLantern(0.175 + random() * 0.03);
      lantern.position.y = -0.42;
      pivot.add(lantern);
      group.add(pivot);
      swayers.push({ pivot, phase: random() * Math.PI * 2,
                     period: 3.2 + random() * 1.6, amplitude: 0.052 });
      addLight(point.clone().setY(point.y - 0.42), 46, 6.5);
    }
  }

  let time = 0;
  return {
    group, lights,
    /** Every lantern sways on its own seeded sine: 3 degrees, 3.2-4.8 s, phase by position. */
    update(dt) {
      if (dt <= 0) return false;
      time += dt;
      for (const sway of swayers) {
        const angle = Math.sin((time / sway.period) * Math.PI * 2 + sway.phase) * sway.amplitude;
        sway.pivot.rotation.z = angle;
        sway.pivot.rotation.x = Math.cos((time / (sway.period * 1.37)) * Math.PI * 2 + sway.phase) * sway.amplitude * 0.6;
      }
      return true;
    },
    dispose() {
      for (const light of lights) { light.shadow?.map?.dispose(); light.dispose(); }
    }
  };
}
