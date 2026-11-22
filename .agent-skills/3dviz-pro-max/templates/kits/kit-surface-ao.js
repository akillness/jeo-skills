// kit-surface-ao.js - vertex-baked occlusion and imperfection for quality tier T2. Writes the
// geometry `color` attribute (no UV2, no aoMap, no post-processing, no dependency).
// Interface frozen by phase 9A step 0; bodies are filled in by worker B.
import { THREE, seeded } from './kit-core.js';

const UP = new THREE.Vector3(0, 1, 0), SIDE = new THREE.Vector3(1, 0, 0);
const now = () => (globalThis.performance ?? Date).now();
const grid = value => Math.round(value * 1e4);   // 0.1 mm position key for vertex clustering

/** Ensure a Float32 3-component `color` attribute of ones. Returns it. Idempotent. */
function colorAttribute(geometry) {
  let attribute = geometry.getAttribute('color');
  if (!attribute || attribute.itemSize !== 3) {
    const count = geometry.getAttribute('position').count;
    attribute = new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3);
    geometry.setAttribute('color', attribute);
  }
  return attribute;
}

/** Multiply one vertex by a scalar shade in [0,1]. */
function shade(attribute, index, value) {
  attribute.setXYZ(index, attribute.getX(index) * value,
                   attribute.getY(index) * value, attribute.getZ(index) * value);
}

/** Vertices grouped by position on a 0.1 mm grid, each with the summed normal of its members.
 *  Kit geometry is almost all unindexed, so every corner is carried four to six times: clustering
 *  removes ~80% of the rays (950 -> 185 ms on the cottage, measured) and its averaged normal also
 *  removes the shading seam a per-face normal leaves along an edge two faces share. */
function vertexClusters(geometry) {
  const position = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const clusters = new Map();
  const scratch = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    const key = `${grid(position.getX(i))},${grid(position.getY(i))},${grid(position.getZ(i))}`;
    let cluster = clusters.get(key);
    if (!cluster) clusters.set(key, cluster = { index: i, normal: new THREE.Vector3(), members: [] });
    cluster.members.push(i);
    cluster.normal.add(scratch.fromBufferAttribute(normals, i));
  }
  return [...clusters.values()];
}

/** True as soon as any mesh is hit inside raycaster.far: first hit wins, one reused array. */
function occluded(raycaster, meshes, hits) {
  for (const mesh of meshes) {
    hits.length = 0;
    raycaster.intersectObject(mesh, false, hits);
    if (hits.length) return true;
  }
  return false;
}

/** Hemisphere-sampled AO into `geometry.attributes.color`; returns {vertices, casts, ms, skipped}.
 *  Rays are cast in WORLD space against the group's own meshes; the shade is written back into the
 *  vertex's own local geometry. InstancedMesh shares one geometry, so per-instance occlusion is
 *  impossible - per-instance variety comes from wearTint through instanceColor. */
export function bakeVertexAO(group, { samples = 24, radius = 0.45, maxVertices = 40000,
                                      groundDirt = 0.6, floor = 0.35, seed = 1 } = {}) {
  const started = now();
  group.updateMatrixWorld(true);
  const meshes = [];
  group.traverse(o => { if (o.isMesh && o.geometry?.getAttribute('position')) meshes.push(o); });
  // One entry per distinct geometry, keyed to the first mesh carrying it: a geometry shared by
  // several meshes (or by an InstancedMesh) is baked once, from that one world placement.
  const geometries = new Map();
  for (const mesh of meshes) if (!geometries.has(mesh.geometry)) geometries.set(mesh.geometry, mesh);
  let vertices = 0;
  for (const geometry of geometries.keys()) vertices += geometry.getAttribute('position').count;
  if (vertices > maxVertices) return { vertices, casts: 0, ms: 0, skipped: 'maxVertices' };
  const raycaster = new THREE.Raycaster();
  raycaster.far = radius;
  const random = seeded(seed);
  const spheres = meshes.map(mesh => {   // world bounding sphere per mesh, for the near filter
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    return mesh.geometry.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
  });
  const hits = [], near = [];
  const origin = new THREE.Vector3(), normal = new THREE.Vector3(), direction = new THREE.Vector3();
  const u = new THREE.Vector3(), v = new THREE.Vector3(), normalMatrix = new THREE.Matrix3();
  let casts = 0;
  for (const [geometry, mesh] of geometries) {
    if (!geometry.getAttribute('normal')) continue;
    const position = geometry.getAttribute('position');
    const colors = colorAttribute(geometry);
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    for (const cluster of vertexClusters(geometry)) {
      origin.fromBufferAttribute(position, cluster.index).applyMatrix4(mesh.matrixWorld);
      normal.copy(cluster.normal).applyMatrix3(normalMatrix).normalize();
      origin.addScaledVector(normal, radius * 0.004);   // lift off: a self-hit is not occlusion
      u.crossVectors(Math.abs(normal.y) < 0.99 ? UP : SIDE, normal).normalize();
      v.crossVectors(normal, u);
      near.length = 0;   // only spheres reaching within `radius` can occlude: filter once, not per ray
      for (let m = 0; m < meshes.length; m += 1) {
        const reach = spheres[m].radius + radius;
        if (origin.distanceToSquared(spheres[m].center) <= reach * reach) near.push(meshes[m]);
      }
      let open = 0;
      for (let s = 0; s < samples; s += 1) {
        // Malley's method: a cosine-weighted hemisphere is a uniform disc lifted to the sphere.
        const r = Math.sqrt(random()), phi = 2 * Math.PI * random();
        direction.copy(u).multiplyScalar(r * Math.cos(phi))
          .addScaledVector(v, r * Math.sin(phi))
          .addScaledVector(normal, Math.sqrt(Math.max(0, 1 - r * r)));
        raycaster.set(origin, direction.normalize());
        casts += 1;
        if (!occluded(raycaster, near, hits)) open += 1;
      }
      const value = floor + (1 - floor) * (samples ? open / samples : 1);
      for (const member of cluster.members) shade(colors, member, value);
    }
    colors.needsUpdate = true;
    if (groundDirt > 0) groundDirtGradient(geometry, groundDirt, 0.35, mesh.matrixWorld);
    applyVertexColors(mesh);
  }
  return { vertices, casts, ms: Number((now() - started).toFixed(2)), skipped: null };
}

/** Switch the baked attribute on, cloning so a shared material is not switched on elsewhere. */
export function applyVertexColors(mesh) {
  if (!mesh.material || mesh.material.vertexColors) return mesh.material;
  mesh.material = mesh.material.clone();
  mesh.material.vertexColors = true;
  return mesh.material;
}

/** Darken vertices by height above y=0 (works on any vertex count). Local positions are lifted to
 *  world height through `matrixWorld` when given; without one the geometry is treated as already
 *  at world height, true of kit geometry parented at the origin. */
export function groundDirtGradient(geometry, height_m = 0.6, amount = 0.35, matrixWorld = null) {
  const position = geometry.getAttribute('position');
  if (!position || height_m <= 0 || amount <= 0) return null;
  const colors = colorAttribute(geometry);
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    point.fromBufferAttribute(position, i);
    if (matrixWorld) point.applyMatrix4(matrixWorld);
    const t = 1 - Math.min(1, Math.max(0, point.y) / height_m);
    if (t > 0) shade(colors, i, 1 - amount * t * t);
  }
  colors.needsUpdate = true;
  return colors;
}

/** Darken toward bounding-box edges (curvature-free edge wear): the SECOND smallest distance to
 *  a box face, so a vertex in the middle of a face keeps its colour. MEASURED LIMIT - a bevelled
 *  kit box carries vertices only at its corners, so every one of them falls inside the band and
 *  the result is a flat 8-20% darken. Only subdivided or lathed geometry reads as wear. */
export function edgeDarken(geometry, amount = 0.2, band_m = 0.05) {
  const position = geometry.getAttribute('position');
  if (!position || amount <= 0) return null;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const thinnest = Math.min(...box.getSize(new THREE.Vector3()).toArray());
  const band = Math.max(1e-4, Math.min(band_m, thinnest * 0.25));
  const colors = colorAttribute(geometry);
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    point.fromBufferAttribute(position, i);
    const faces = [point.x - box.min.x, box.max.x - point.x, point.y - box.min.y,
                   box.max.y - point.y, point.z - box.min.z, box.max.z - point.z].sort((a, b) => a - b);
    const t = 1 - Math.min(1, Math.max(0, faces[1]) / band);
    if (t > 0) shade(colors, i, 1 - amount * t);
  }
  colors.needsUpdate = true;
  return colors;
}

/** Hue/lightness/roughness jitter of +/-`amount` on a clone; the input material is untouched. */
export function wearTint(material, amount = 0.06, random = Math.random) {
  const clone = material.clone();
  const hsl = clone.color.getHSL({ h: 0, s: 0, l: 0 });
  const light = 1 + (random() * 2 - 1) * amount;
  clone.color.setHSL((hsl.h + (random() * 2 - 1) * amount + 1) % 1, hsl.s,
                     Math.min(1, Math.max(0, hsl.l * light)));
  if (typeof clone.roughness === 'number') {
    clone.roughness = Math.min(1, Math.max(0, clone.roughness * (1 + (random() * 2 - 1) * amount)));
  }
  return clone;
}

/** Jitter a placement; returns a new object. `position` m, `rotation` rad, `scale` a fraction. */
export function jitterPlacement(placement, random = Math.random,
                                { position = 0, rotation = 0, scale = 0 } = {}) {
  const signed = amount => (random() * 2 - 1) * amount;
  const base = placement.position ?? [0, 0, 0];
  const spin = placement.rotation ?? [0, 0, 0];
  const size = placement.scale ?? 1;
  const factor = 1 + signed(scale);
  return {
    ...placement,
    position: [base[0] + signed(position), base[1] + signed(position), base[2] + signed(position)],
    rotation: [spin[0] + signed(rotation), spin[1] + signed(rotation), spin[2] + signed(rotation)],
    scale: Array.isArray(size) ? size.map(value => value * factor) : size * factor
  };
}

export { THREE };
