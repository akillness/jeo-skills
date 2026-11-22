import { THREE, mat, mesh, sphere, tube, cylinderBetween, label, disposeGroup } from '../scene-kit.js';

export { THREE, mat, mesh, sphere, tube, cylinderBetween, label };

export const tissue = {
  muscle: () => mat(0xa9283c, .54),
  muscleDark: () => mat(0x681d32, .62),
  tendon: () => mat(0xd5c9ae, .72),
  bone: () => mat(0xe8dfc6, .7),
  cartilage: () => mat(0x88c6bb, .38, 0, { transparent: true, opacity: .78 }),
  nerve: () => mat(0xf2bd4b, .44, 0, { emissive: 0x5a3100, emissiveIntensity: .18 }),
  vesselRed: () => mat(0xc74855, .42),
  vesselBlue: () => mat(0x437fa8, .42),
  tissue: () => mat(0xb7646e, .6, 0, { transparent: true, opacity: .9 }),
};

export function capsuleBetween(a, b, radius, material, parent, radial = 24) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const length = start.distanceTo(end);
  const object = mesh(new THREE.CapsuleGeometry(radius, Math.max(.001, length - radius * 2), 10, radial), material, [0, 0, 0], parent);
  object.position.copy(start).add(end).multiplyScalar(.5);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
  return object;
}

export function taperedMuscle(a, b, radius, material, parent, tendonMaterial = null) {
  const group = new THREE.Group(); parent.add(group);
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const axis = end.clone().sub(start), length = axis.length();
  const belly = mesh(new THREE.CapsuleGeometry(radius, Math.max(.02, length * .58), 12, 28), material, [0, 0, 0], group);
  belly.position.copy(start).lerp(end, .5);
  belly.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
  if (tendonMaterial) {
    cylinderBetween(a, start.clone().lerp(end, .18).toArray(), radius * .28, tendonMaterial, group);
    cylinderBetween(start.clone().lerp(end, .82).toArray(), b, radius * .28, tendonMaterial, group);
  }
  return { group, belly };
}

export function disc(position, radius, depth, material, parent, rotation = [Math.PI / 2, 0, 0]) {
  const object = mesh(new THREE.CylinderGeometry(radius, radius, depth, 48), material, position, parent);
  object.rotation.set(...rotation); return object;
}

export function ring(position, major, tubeRadius, material, parent, arc = Math.PI * 2, rotation = [Math.PI / 2, 0, 0]) {
  const object = mesh(new THREE.TorusGeometry(major, tubeRadius, 12, 64, arc), material, position, parent);
  object.rotation.set(...rotation); return object;
}

export function branch(parent, points, radius, material, children = []) {
  const trunk = tube(points, radius, material, parent, 36);
  for (const child of children) branch(parent, child.points, child.radius ?? radius * .65, material, child.children ?? []);
  return trunk;
}

export function arrowAlong(parent, start, end, color = 0xffffff, scale = 1) {
  const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
  const arrow = new THREE.ArrowHelper(b.clone().sub(a).normalize(), a, a.distanceTo(b), color, .15 * scale, .08 * scale);
  parent.add(arrow); return arrow;
}

export function setOpacity(root, opacity) {
  root.traverse((object) => {
    if (!object.material) return;
    for (const material of [object.material].flat()) {
      material.transparent = opacity < .999;
      material.opacity = opacity;
      material.depthWrite = opacity > .5;
    }
  });
}

export function range(id, labelText, min, max, step, state, key, refresh) {
  return { id, label: labelText, type: 'range', min, max, step, get: () => state[key], set: (value) => { state[key] = THREE.MathUtils.clamp(Number(value), min, max); refresh(); } };
}

export function select(id, labelText, options, state, key, refresh) {
  return { id, label: labelText, type: 'select', options, get: () => state[key], set: (value) => { if (options.some((o) => o.value === value)) state[key] = value; refresh(); } };
}

export function button(id, labelText, action) {
  return { id, label: labelText, type: 'button', get: () => '', set: action };
}

export function finish(group, update, reset, controls, stats, note, sources, detail = [5, 2.6, 6]) {
  return { group, update, reset, controls, stats, note, sources, views: { detail: { position: detail, target: [0, 0, 0] } }, dispose: () => disposeGroup(group) };
}
