// selection.js - picking and the panel that reads the model. Following knowledge.inspectable-
// selection: a click on any child mesh resolves to the semantic building, the marker is a cool ring
// that no material in this warm scene could be mistaken for, and the panel list is the visible
// equivalent control for anyone who cannot hit a 4 m roof with a pointer.
import * as THREE from 'three';

const EMPTY = 'Nothing selected. Click a building, or choose one from the list.';

function marker(color) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthWrite: false });
  const outer = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 64), material);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.022, 6, 48), material);
  outer.rotation.x = inner.rotation.x = -Math.PI / 2;
  group.add(outer, inner);
  for (let i = 0; i < 4; i++) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.34), material);
    tick.position.set(Math.cos(i * Math.PI / 2) * 1.16, 0, Math.sin(i * Math.PI / 2) * 1.16);
    tick.rotation.y = -i * Math.PI / 2;
    group.add(tick);
  }
  group.visible = false;
  return { group, material };
}

/** Walks up from a hit mesh to the group that carries the semantic id. */
function ownerOf(object) {
  let node = object;
  while (node && !node.userData.buildingId) node = node.parent;
  return node?.userData.buildingId ?? null;
}

export function createSelection({ scene, records, canvas, camera, dom, onFocus, invalidate }) {
  const { group, material } = marker(dom.ringColor ?? '#cfe4ff');
  scene.add(group);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pickables = records.map(record => record.object);
  const buttons = new Map();
  let selected = null;

  for (const record of records) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `pick-${record.id}`;
    button.className = 'pick';
    button.textContent = record.data.name;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => select(record.id, true));
    dom.list.append(button);
    buttons.set(record.id, button);
  }

  function hit(event) {
    const box = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, true);
    return hits.length ? ownerOf(hits[0].object) : null;
  }

  function render(record) {
    dom.title.textContent = record ? record.data.name : 'Emberfall';
    dom.program.textContent = record ? record.data.program : EMPTY;
    dom.rows.replaceChildren();
    if (!record) return;
    const facts = [['Consumes', record.data.consumes], ['Produces', record.data.produces],
      ['Stands where', record.data.site], ['Reads by', record.data.tell]];
    for (const [label, value] of facts) {
      const term = document.createElement('dt');
      term.textContent = label;
      const detail = document.createElement('dd');
      detail.textContent = value;
      dom.rows.append(term, detail);
    }
  }

  function select(id, frame = false) {
    const record = records.find(item => item.id === id) ?? null;
    selected = record?.id ?? null;
    for (const [key, button] of buttons) button.setAttribute('aria-pressed', String(key === selected));
    if (record) {
      group.visible = true;
      group.position.copy(record.anchor).setY(record.anchor.y + 0.16);
      group.scale.setScalar(record.radius);
      if (frame) onFocus?.(record);
    } else {
      group.visible = false;
    }
    render(record);
    invalidate?.();
    return Boolean(record);
  }

  const onPointerDown = event => { if (event.button === 0) pointerStart = { x: event.clientX, y: event.clientY }; };
  let pointerStart = null;
  const onPointerUp = event => {
    if (!pointerStart) return;
    const dragged = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5;
    pointerStart = null;
    if (dragged) return; // an orbit drag is not a click
    const id = hit(event);
    select(id, Boolean(id));
  };
  const onPointerMove = event => { canvas.style.cursor = hit(event) ? 'pointer' : 'grab'; };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.style.cursor = 'grab';
  render(null);

  return {
    select,
    clear: () => select(null),
    get selected() { return selected; },
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      material.dispose();
    }
  };
}
