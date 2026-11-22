// creatures.js - the moving life of Emberfall: three fox-folk walking their own errands, a drift of
// lantern moths around the beacon, and the smithy's smoke. Position is state, not decoration: each
// resident owns a distance along its route and the mesh is moved to wherever that distance lands.
import * as THREE from 'three';
import { MOTH_COUNT, RESIDENTS } from './village-model.js';
import { heightAt } from './terrain.js';

const FOLK_HEIGHT = 1.5; // stated scale cue: an adult fox-folk stands 1.5 m under a 2.0 m door

function limb(parent, geometry, material, position) {
  const pivot = new THREE.Group();
  pivot.position.set(...position);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -0.3;
  mesh.castShadow = true;
  pivot.add(mesh);
  parent.add(pivot);
  return pivot;
}

function foxFolk(mats, coat) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.62;
  const put = (geometry, material, position, rotation = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    body.add(mesh);
    return mesh;
  };
  put(new THREE.CapsuleGeometry(0.19, 0.34, 4, 10), coat, [0, 0.17, 0]);
  put(new THREE.ConeGeometry(0.33, 0.62, 9), mats.cloak, [0, 0.06, 0]);
  put(new THREE.SphereGeometry(0.17, 12, 10), coat, [0, 0.53, 0]);
  put(new THREE.ConeGeometry(0.1, 0.28, 8), coat, [0, 0.5, 0.2], [Math.PI / 2, 0, 0]);
  for (const sx of [-1, 1]) put(new THREE.ConeGeometry(0.07, 0.2, 5), coat, [sx * 0.11, 0.68, -0.02], [-0.2, 0, sx * 0.3]);
  put(new THREE.ConeGeometry(0.11, 0.72, 7), coat, [0, 0.05, -0.3], [-1.15, 0, 0]);
  put(new THREE.ConeGeometry(0.26, 0.22, 9), mats.cloth, [0, 0.72, 0]);
  const legs = [-1, 1].map(sx => limb(body, new THREE.CapsuleGeometry(0.07, 0.34, 3, 6), coat, [sx * 0.11, -0.14, 0]));
  const arm = limb(body, new THREE.CapsuleGeometry(0.06, 0.28, 3, 6), coat, [0.21, 0.3, 0.04]);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 5), mats.iron);
  pole.position.set(0.24, 0.16, 0.16);
  pole.rotation.x = -0.4;
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), mats.flame);
  flame.position.set(0.24, -0.12, 0.28);
  const lantern = new THREE.Group();
  lantern.add(pole, flame);
  arm.add(lantern);
  group.add(body);
  group.scale.setScalar(FOLK_HEIGHT / 1.45); // built at 1.45 m, normalised to the stated 1.5 m
  return { group, body, legs, arm, lantern };
}

function routeLengths(route) {
  const spans = [];
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    total += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
    spans.push(total);
  }
  return { spans, total };
}

function pointAt(route, spans, distance) {
  let index = 0;
  while (index < spans.length - 1 && distance > spans[index]) index++;
  const start = index === 0 ? 0 : spans[index - 1];
  const t = Math.min(1, Math.max(0, (distance - start) / ((spans[index] - start) || 1)));
  const [ax, az] = route[index], [bx, bz] = route[index + 1];
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: bx - ax, dz: bz - az };
}

/**
 * @returns {{group, update(dt): boolean, residents: Array}} update returns true while anything
 * moved, so the demand-driven loop knows to schedule another frame.
 */
export function createCreatures({ mats, palette, beaconAnchor, smokeOrigin }) {
  const group = new THREE.Group();
  const residents = RESIDENTS.map((record, index) => {
    const coat = mats.coats[index % mats.coats.length];
    const figure = foxFolk(mats, coat);
    const { spans, total } = routeLengths(record.route);
    group.add(figure.group);
    return {
      ...record, figure, spans, total,
      distance: (record.offset / 10) * total, direction: 1, rest: 0, phase: record.offset,
      restAt: spans[Math.max(0, record.restIndex - 1)] ?? total * 0.5
    };
  });

  const moths = [];
  const wing = new THREE.PlaneGeometry(0.26, 0.16);
  for (let i = 0; i < MOTH_COUNT; i++) {
    const moth = new THREE.Group();
    const bodyMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.09, 3, 6), mats.mothBody);
    const wings = [-1, 1].map(sx => {
      const pivot = new THREE.Group();
      const mesh = new THREE.Mesh(wing, mats.mothWing);
      mesh.position.x = sx * 0.13;
      pivot.add(mesh);
      moth.add(pivot);
      return { pivot, sx };
    });
    moth.add(bodyMesh);
    group.add(moth);
    moths.push({ moth, wings, radius: 3.6 + (i % 4) * 1.35, speed: 0.35 + (i % 3) * 0.13,
      lift: 5.4 + (i % 5) * 0.85, phase: i * 0.7, bob: 0.4 + (i % 3) * 0.25 });
  }

  const puffs = [];
  for (let i = 0; i < 5; i++) {
    const material = mats.smoke.clone();
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), material);
    mesh.position.copy(smokeOrigin);
    group.add(mesh);
    puffs.push({ mesh, material, t: i / 5 });
  }

  let time = 0;
  return {
    group, residents,
    update(dt) {
      if (dt <= 0) return false;
      time += dt;
      for (const resident of residents) {
        if (resident.rest > 0) {
          resident.rest -= dt;
        } else {
          const previous = resident.distance;
          resident.distance += resident.direction * resident.speed * dt;
          if ((previous - resident.restAt) * (resident.distance - resident.restAt) < 0) resident.rest = resident.restSeconds;
          if (resident.distance >= resident.total) { resident.distance = resident.total; resident.direction = -1; resident.rest = resident.restSeconds * 0.6; }
          if (resident.distance <= 0) { resident.distance = 0; resident.direction = 1; resident.rest = resident.restSeconds * 0.6; }
          resident.phase += dt * resident.speed * 4.2;
        }
        const walking = resident.rest <= 0;
        const point = pointAt(resident.route, resident.spans, resident.distance);
        const figure = resident.figure;
        figure.group.position.set(point.x, heightAt(point.x, point.z), point.z);
        figure.group.rotation.y = Math.atan2(point.dx * resident.direction, point.dz * resident.direction);
        const swing = walking ? Math.sin(resident.phase) : Math.sin(time * 1.1) * 0.12;
        figure.legs[0].rotation.x = swing * 0.55;
        figure.legs[1].rotation.x = -swing * 0.55;
        figure.body.position.y = 0.62 + (walking ? Math.abs(Math.sin(resident.phase)) * 0.035 : 0);
        figure.arm.rotation.x = -0.35 + swing * 0.18;
        figure.lantern.rotation.z = Math.sin(resident.phase * 0.5) * 0.22;
      }
      for (const moth of moths) {
        const angle = time * moth.speed + moth.phase;
        moth.moth.position.set(
          beaconAnchor.x + Math.cos(angle) * moth.radius,
          beaconAnchor.y + moth.lift + Math.sin(time * 1.4 + moth.phase) * moth.bob,
          beaconAnchor.z + Math.sin(angle) * moth.radius);
        moth.moth.rotation.y = -angle;
        const flap = Math.sin(time * 13 + moth.phase) * 0.9;
        for (const { pivot, sx } of moth.wings) pivot.rotation.z = sx * (0.5 + flap * 0.5);
      }
      for (const puff of puffs) {
        puff.t = (puff.t + dt * 0.14) % 1;
        const rise = puff.t * 5.2;
        puff.mesh.position.set(smokeOrigin.x + rise * 0.22, smokeOrigin.y + rise, smokeOrigin.z - rise * 0.1);
        puff.mesh.scale.setScalar(0.4 + puff.t * 1.9);
        puff.material.opacity = 0.32 * Math.sin(Math.PI * puff.t);
      }
      return true;
    },
    dispose() { for (const puff of puffs) puff.material.dispose(); }
  };
}
