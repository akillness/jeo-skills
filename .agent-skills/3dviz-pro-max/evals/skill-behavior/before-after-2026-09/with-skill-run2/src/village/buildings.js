// buildings.js - one generator, five roof grammars. Change ROOF_PITCH and the wall/roof hue
// jitter first; the silhouette rule (every house is a stack of rectangles, only the bridge and
// the mill wheel are large curves) comes from knowledge.style-lantern-festival-riverside.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { heightAt, bankZ, WATER_Y } from './terrain.js';

const ROOF_PITCH = THREE.MathUtils.degToRad(30);
const DOOR_H = 2.0;      // m - the scale cue that appears on every building
const STOREY_H = 2.55;   // m

function jitterColor(hex, random, hueSpread = 0.03, lightSpread = 0.18) {
  const hsl = new THREE.Color(hex).getHSL({ h: 0, s: 0, l: 0 });
  return new THREE.Color().setHSL(
    (hsl.h + (random() - 0.5) * hueSpread + 1) % 1,
    THREE.MathUtils.clamp(hsl.s * (0.85 + random() * 0.4), 0, 0.45),
    THREE.MathUtils.clamp(hsl.l * (1 - lightSpread / 2 + random() * lightSpread), 0.04, 0.8)
  );
}

/** Gable: two slanted slabs plus the two end walls, so no sky shows through the ridge. */
function gableRoof(w, d, materials) {
  const parts = [];
  const overhang = 0.38, halfD = d / 2 + overhang;
  const rise = halfD * Math.tan(ROOF_PITCH);
  const slab = new THREE.BoxGeometry(w + 0.7, 0.14, halfD / Math.cos(ROOF_PITCH));
  for (const side of [-1, 1]) {
    const mesh = new THREE.Mesh(slab, materials.roof);
    mesh.position.set(0, rise / 2, (side * halfD) / 2);
    mesh.rotation.x = side * ROOF_PITCH;
    parts.push(mesh);
  }
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0); shape.lineTo(d / 2, 0); shape.lineTo(0, (d / 2) * Math.tan(ROOF_PITCH));
  const end = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
  end.rotateY(Math.PI / 2);
  for (const side of [-1, 1]) {
    const mesh = new THREE.Mesh(end, materials.wall);
    mesh.position.set(side * (w / 2 - 0.06), 0, 0);
    parts.push(mesh);
  }
  return { parts, height: rise };
}

/** Hip: a four-sided cone turned 45 deg so its ridges land on the box corners. */
function hipRoof(w, d, materials, flare = 1.08) {
  const radius = (Math.hypot(w, d) / 2) * flare;
  const height = Math.max(w, d) * 0.42;
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 4, 1), materials.roof);
  mesh.rotation.y = Math.PI / 4;
  mesh.position.y = height / 2;
  return { parts: [mesh], height };
}

function coneRoof(w, d, materials) {
  const radius = (Math.max(w, d) / 2) * 1.15;
  const height = radius * 1.35;
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 14, 1), materials.roof);
  mesh.position.y = height / 2;
  return { parts: [mesh], height };
}

function addWindows(group, spec, materials, random, storeys) {
  const glow = materials.window;
  const pane = new THREE.PlaneGeometry(0.62, 0.86);
  for (let s = 0; s < storeys; s++) {
    const y = s * STOREY_H + 1.55;
    const count = 1 + Math.floor(random() * 2);
    for (let i = 0; i < count; i++) {
      if (random() < 0.22) continue;            // a few shutters are closed: no clone rows
      const front = new THREE.Mesh(pane, glow);
      front.position.set((random() - 0.5) * (spec.w - 1.1), y, spec.d / 2 + 0.03);
      group.add(front);
      const sideMesh = new THREE.Mesh(pane, glow);
      sideMesh.rotation.y = Math.PI / 2;
      sideMesh.position.set(spec.w / 2 + 0.03, y, (random() - 0.5) * (spec.d - 1.1));
      group.add(sideMesh);
    }
  }
}

/**
 * Builds one selectable building.
 * @param {object} spec - {id, name, note, x, off, w, d, storeys, roof, rot, wall, roofTint, stilts}
 * @param {{materials: object, random: () => number}} ctx
 * @returns {THREE.Group} with userData {id, name, note, dims, size, anchor}
 */
export function createBuilding(spec, ctx) {
  const { materials, random } = ctx;
  const group = new THREE.Group();
  const z = bankZ(spec.x, spec.off);
  const ground = spec.stilts ? WATER_Y : heightAt(spec.x, z);
  group.position.set(spec.x, ground - 0.12, z);
  group.rotation.y = spec.rot ?? (random() - 0.5) * 0.5;

  const own = {
    wall: new THREE.MeshStandardMaterial({ color: jitterColor(spec.wall ?? '#e8d9b8', random), roughness: 0.84 }),
    roof: new THREE.MeshStandardMaterial({ color: jitterColor(spec.roofTint ?? '#c8642e', random, 0.05), roughness: 0.7 }),
    window: materials.window
  };
  const storeys = spec.storeys ?? 2;
  const tiers = spec.roof === 'tiered' ? storeys : 1;
  let base = 0, w = spec.w, d = spec.d, roofTop = 0;

  if (spec.stilts) {                              // posts down to the riverbed, 0.22 m square
    const post = new THREE.BoxGeometry(0.22, 3.2, 0.22);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(post, materials.timber);
      leg.position.set(sx * (w / 2 - 0.3), -1.3, sz * (d / 2 - 0.3));
      leg.castShadow = true; group.add(leg);
    }
    base = 0.35;
  } else {
    // Plinth: a 1.2 m stone footing so a house on a terrace riser never shows daylight under a corner.
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.5, 1.4, spec.d + 0.5), materials.stone);
    plinth.position.y = -0.6; plinth.receiveShadow = true; plinth.castShadow = true;
    group.add(plinth);
  }

  for (let t = 0; t < tiers; t++) {
    const bodyH = spec.roof === 'tiered' ? STOREY_H : storeys * STOREY_H;
    const body = new THREE.Mesh(new RoundedBoxGeometry(w, bodyH, d, 3, 0.05), own.wall);
    body.position.y = base + bodyH / 2;
    body.castShadow = true; body.receiveShadow = true;
    group.add(body);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.16, d + 0.12), materials.timber);
    beam.position.y = base + bodyH;
    group.add(beam);
    base += bodyH;
    const roofKind = spec.roof === 'tiered' ? 'hip' : spec.roof;
    const roof = roofKind === 'gable' ? gableRoof(w, d, own)
      : roofKind === 'cone' ? coneRoof(w, d, own)
        : hipRoof(w, d, own, spec.roof === 'tiered' ? 1.3 : 1.08);
    for (const part of roof.parts) {
      part.position.y += base; part.castShadow = true; part.receiveShadow = true; group.add(part);
    }
    roofTop = base + roof.height;
    if (spec.roof === 'tiered') { base += 0.55; w *= 0.84; d *= 0.84; }
  }

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, DOOR_H, 0.1), materials.door);
  door.position.set(spec.dx ?? 0, (spec.stilts ? 0.35 : 0) + DOOR_H / 2, spec.d / 2 + 0.04);
  group.add(door);
  addWindows(group, spec, own, random, spec.roof === 'tiered' ? tiers : storeys);

  group.userData = {
    id: spec.id, name: spec.name, note: spec.note,
    dims: `${spec.w.toFixed(1)} x ${spec.d.toFixed(1)} m footprint - ridge ${(ground + roofTop).toFixed(1)} m above the water - door 2.0 m`,
    size: Math.max(spec.w, spec.d, roofTop), anchor: [spec.x, ground + roofTop * 0.5, z],
    ownMaterials: [own.wall, own.roof]
  };
  for (const child of group.children) child.userData.buildingId = spec.id;
  return group;
}
