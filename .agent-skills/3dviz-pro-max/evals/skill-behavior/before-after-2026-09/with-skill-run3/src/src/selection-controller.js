// selection-controller.js - picking a building, and showing that it is picked. The selected id
// is the authoritative state: the marker, the panel copy, the button pressed-states and the
// camera focus are all read from it, so they can never disagree with each other.
// Nothing here mutates a building's materials - the kits share cached materials, so tinting one
// wall would tint every wall in the hollow.
import * as THREE from 'three';
import { materialise } from './felt-material-pass.js';
import { LOOK } from './look.js';

const DRAG_PIXELS = 6;      // further than this between pointerdown and pointerup is an orbit

/** A dyed-felt ring of stitch dashes plus a hovering pin: legible at 40 m and at 4 m. */
function createMarker() {
  const group = new THREE.Group();
  group.visible = false;
  const felt = materialise({ color: LOOK.palette.accent, roughness: 0.9 });
  const glow = materialise({ color: LOOK.palette.lamp, roughness: 0.85,
                             emissive: LOOK.palette.lamp, emissiveIntensity: 2.4 });
  const ring = new THREE.Group();
  const dash = new THREE.BoxGeometry(0.42, 0.06, 0.14);
  const stitches = new THREE.InstancedMesh(dash, felt, 28);
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler(), scale = new THREE.Vector3(1, 1, 1);
  const position = new THREE.Vector3();
  // The radius moves the stitches, it never scales them (a 5 m building would get 2 m planks),
  // and each stitch is dropped onto the ground under it - the ring has to follow a gorge bank.
  const setRadius = (radius, groundAt = () => 0) => {
    for (let i = 0; i < stitches.count; i++) {
      const angle = (i / stitches.count) * Math.PI * 2;
      euler.set(0, -angle, 0);
      quaternion.setFromEuler(euler);
      scale.set(1, 1, i % 2 ? 0.55 : 1);
      const dx = Math.cos(angle) * radius, dz = Math.sin(angle) * radius;
      position.set(dx, groundAt(dx, dz) + 0.05, dz);
      stitches.setMatrixAt(i, matrix.compose(position, quaternion, scale));
    }
    stitches.instanceMatrix.needsUpdate = true;
  };
  setRadius(2);
  ring.add(stitches);
  group.add(ring);

  const pin = new THREE.Group();
  const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), glow);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.9, 8), felt);
  stem.position.y = -0.62;
  pin.add(head, stem);
  group.add(pin);
  return { group, ring, pin, setRadius, geometries: [dash, head.geometry, stem.geometry] };
}

/**
 * @param {{entries: object[], scene: THREE.Object3D, camera: THREE.Camera, canvas: HTMLElement,
 *   heightAt: (x: number, z: number) => number,
 *   onFocus: (entry: object) => void, invalidate: () => void}} options
 */
export function createSelection({ entries, scene, camera, canvas, heightAt, onFocus, invalidate }) {
  const marker = createMarker();
  scene.add(marker.group);
  const list = document.querySelector('#buildings');
  const readout = document.querySelector('#selected');
  const buttons = new Map();
  let selected = null, time = 0;

  for (const entry of entries) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `pick-${entry.id}`;
    button.className = 'pick';
    button.textContent = entry.name;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => select(entry.id, { focus: true }));
    list.append(button);
    buttons.set(entry.id, button);
  }

  function paint() {
    for (const [id, button] of buttons) button.setAttribute('aria-pressed', String(id === selected));
    const entry = entries.find(item => item.id === selected);
    if (!entry) {
      readout.innerHTML = '<p class="hint">Click a building in the scene, or pick one from the list. '
        + 'Reset view returns to the overview and clears the selection.</p>';
      marker.group.visible = false;
      return;
    }
    readout.innerHTML = `<h2>${entry.name}</h2><p class="role">${entry.role}</p>`
      + `<p>${entry.blurb}</p><p class="metric">${entry.height.toFixed(1)} m tall`
      + ` &middot; standing at ${entry.focus[0].toFixed(1)}, ${entry.focus[2].toFixed(1)}</p>`;
    const base = new THREE.Box3().setFromObject(entry.group);
    const radius = Math.max(1.8, Math.max(base.max.x - base.min.x, base.max.z - base.min.z) * 0.66);
    const [cx, , cz] = entry.focus;
    const foot = heightAt(cx, cz);
    marker.setRadius(radius, (dx, dz) => heightAt(cx + dx, cz + dz) - foot);
    marker.group.position.set(cx, foot, cz);
    marker.pin.position.y = (base.max.y - foot) + 1.6;
    marker.group.visible = true;
  }

  function select(id, { focus = false } = {}) {
    const entry = entries.find(item => item.id === id);
    selected = entry ? id : null;
    paint();
    if (entry && focus) onFocus(entry);
    invalidate();
    return selected;
  }

  function clear() { selected = null; paint(); invalidate(); }

  // --- picking in the scene: a click, never the tail of an orbit drag ------------------------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = null;
  const onDown = event => { down = { x: event.clientX, y: event.clientY }; };
  const onUp = event => {
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > DRAG_PIXELS) return;
    down = null;
    const box = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - box.left) / box.width) * 2 - 1,
                -((event.clientY - box.top) / box.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    for (const hit of raycaster.intersectObjects(entries.map(entry => entry.group), true)) {
      let node = hit.object;
      while (node && !node.userData.buildingId) node = node.parent;
      if (node) { select(node.userData.buildingId, { focus: true }); return; }
    }
    clear();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  paint();

  return {
    select, clear,
    get selected() { return selected; },
    /** The pin breathes and turns, so a selection is legible in a still frame too. The ring
     *  cannot spin: each stitch carries the ground height under its own place on the circle. */
    animate(dt) {
      if (!(dt > 0) || !marker.group.visible) return false;
      time += dt;
      marker.pin.position.y += Math.sin(time * 2.1) * dt * 0.9;
      marker.pin.rotation.y += dt * 1.4;
      return true;
    },
    dispose() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      for (const geometry of marker.geometries) geometry.dispose();
    }
  };
}
