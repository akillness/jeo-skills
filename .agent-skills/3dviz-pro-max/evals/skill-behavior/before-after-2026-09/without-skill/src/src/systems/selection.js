// Click / hover picking for buildings, plus the emissive highlight and the
// rotating ring that marks the current pick.

import * as THREE from 'three';
import { PALETTE } from '../world/noise-and-palette.js';

/** Walk up from a hit mesh to the building group that owns it. */
function ownerOf(object) {
  let o = object;
  while (o) {
    if (o.userData && o.userData.selectable) return o;
    o = o.parent;
  }
  return null;
}

function collectMaterials(root) {
  const list = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.emissive) return;
    list.push({
      mat: o.material,
      emissive: o.material.emissive.getHex(),
      intensity: o.material.emissiveIntensity
    });
  });
  return list;
}

export function createSelection({ camera, buildings, renderer, onChange }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pickables = [];
  buildings.forEach(b => b.traverse(o => { if (o.isMesh) pickables.push(o); }));

  const cache = new Map();
  buildings.forEach(b => cache.set(b, collectMaterials(b)));

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.055, 8, 48),
    new THREE.MeshBasicMaterial({ color: PALETTE.jade, transparent: true, opacity: 0.9 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;

  let selected = null;
  let hovered = null;
  let downAt = null;

  /** A gentle wash, not a blowout: matte parts pick up a faint rim of colour,
   *  parts that already glow (lanterns, windows) just burn a little brighter. */
  function paint(building, on, color, boost) {
    const entries = cache.get(building);
    if (!entries) return;
    for (const e of entries) {
      if (!on) {
        e.mat.emissive.setHex(e.emissive);
        e.mat.emissiveIntensity = e.intensity;
      } else if (e.emissive !== 0x000000) {
        e.mat.emissiveIntensity = e.intensity * (1 + boost * 0.5);
      } else {
        e.mat.emissive.setHex(color);
        e.mat.emissiveIntensity = boost;
      }
    }
  }

  function select(building) {
    if (selected === building) return;
    if (selected) paint(selected, false);
    selected = building;
    if (selected) {
      if (hovered === selected) hovered = null;
      paint(selected, true, PALETTE.jade, 0.26);
      const r = (selected.userData.radius ?? 4) * 1.35;
      ring.scale.setScalar(r);
      ring.position.set(selected.position.x, selected.position.y + 0.35, selected.position.z);
      ring.visible = true;
    } else {
      ring.visible = false;
    }
    onChange(selected);
  }

  function pick(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    return hits.length ? ownerOf(hits[0].object) : null;
  }

  const el = renderer.domElement;
  el.style.cursor = 'grab';
  el.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 6) return;                    // that was an orbit drag, not a click
    select(pick(e));
  });
  el.addEventListener('pointermove', (e) => {
    if (downAt) return;
    const hit = pick(e);
    if (hit === hovered) return;
    if (hovered && hovered !== selected) paint(hovered, false);
    hovered = hit && hit !== selected ? hit : null;
    if (hovered) paint(hovered, true, PALETTE.ember, 0.14);
    el.style.cursor = hit ? 'pointer' : 'grab';
  });

  function tick(t) {
    if (!ring.visible) return;
    ring.rotation.z = t * 0.8;
    ring.material.opacity = 0.55 + Math.sin(t * 3) * 0.3;
  }

  return {
    ring, tick, select,
    selectById: (id) => select(buildings.find(b => b.userData.id === id) || null),
    get current() { return selected; }
  };
}
