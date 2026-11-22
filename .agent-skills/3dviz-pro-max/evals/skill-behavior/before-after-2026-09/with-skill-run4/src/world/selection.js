// selection.js - picking a building. A pointer that presses and releases in the same place casts
// a ray at the structures only; a hit walks up to the holder carrying userData.selectable.
// The highlight is a pulsing ring laid on the ground, never a change to the building's own
// material: kit materials come out of a shared cache, so tinting one would tint every clone.
import * as THREE from 'three';

const MOVE_TOLERANCE = 6;

export function createSelection({ camera, canvas, items, heightAt, invalidate, onChange }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.86, 1, 56).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#f2b25c', emissive: '#f2b25c', emissiveIntensity: 2.2,
                                     roughness: 0.5, transparent: true, opacity: 0.9,
                                     side: THREE.DoubleSide, depthWrite: false })
  );
  ring.visible = false;
  ring.renderOrder = 3;
  const byId = new Map(items.map(item => [item.id, item]));
  let selected = null, down = null, time = 0;

  function select(id) {
    const item = byId.get(id) ?? null;
    selected = item;
    if (item) {
      const radius = Math.max(2.2, item.radius * 0.8);
      ring.position.set(item.base[0], heightAt(item.base[0], item.base[2]) + 0.09, item.base[2]);
      ring.scale.setScalar(radius);
      ring.visible = true;
    } else {
      ring.visible = false;
    }
    onChange?.(item);
    invalidate?.();
    return item;
  }

  function pick(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(items.map(item => item.object), true);
    for (const hit of hits) {
      let node = hit.object;
      while (node && !node.userData?.selectable) node = node.parent;
      if (node) return select(node.userData.selectable);
    }
    return select(null);
  }

  const onDown = event => { down = [event.clientX, event.clientY]; };
  const onUp = event => {
    if (!down) return;
    const moved = Math.hypot(event.clientX - down[0], event.clientY - down[1]);
    down = null;
    if (moved <= MOVE_TOLERANCE) pick(event);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);

  return {
    ring, select,
    get selected() { return selected; },
    /** The ring breathes, so a selection stays visible while the camera settles. */
    update(dt) {
      if (!ring.visible || dt <= 0) return false;
      time += dt;
      ring.material.emissiveIntensity = 2.1 + Math.sin(time * 2.4) * 0.7;
      return true;
    },
    dispose() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      ring.geometry.dispose(); ring.material.dispose();
    }
  };
}
