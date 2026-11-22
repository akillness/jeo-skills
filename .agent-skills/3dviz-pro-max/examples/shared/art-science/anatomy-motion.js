import {THREE} from './scene-kit.js';
import {smooth, clamp} from './body-motion.js';

// Prepare corrective shapes once. Three.js blends positions and normals on the GPU, including shadows.
export function addMorphPoses(object, poses) {
  const g = object.geometry, source = g.attributes.position;
  g.morphAttributes.position = []; g.morphAttributes.normal = []; g.morphTargetsRelative = false;
  for (const pose of poses) {
    const target = g.clone(); target.morphAttributes = {};
    const p = target.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, ...pose(source.getX(i), source.getY(i), source.getZ(i)));
    target.computeVertexNormals();
    g.morphAttributes.position.push(p.clone());
    g.morphAttributes.normal.push(target.attributes.normal.clone());
    target.dispose();
  }
  object.updateMorphTargets(); object.frustumCulled = false;
}

export function rigArmMuscles(group, objects, pivot) {
  const root = new THREE.Bone(), elbow = new THREE.Bone(); elbow.position.copy(pivot);
  root.add(elbow); group.add(root); group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([root, elbow]);
  const muscles = objects.map(source => {
    const g = source.geometry, p = g.attributes.position, ix = new Uint16Array(p.count * 4), weights = new Float32Array(p.count * 4);
    g.computeBoundingBox(); const bounds = g.boundingBox, center = bounds.getCenter(new THREE.Vector3()), height = bounds.max.y - bounds.min.y;
    const colors = new Float32Array(p.count * 3), flesh = new THREE.Color('#b66c66'), tendon = new THREE.Color('#ded1ae');
    const biceps = /biceps/.test(source.userData.name);
    const deepHead = /medial head.*triceps/.test(source.userData.name);
    for (let i = 0; i < p.count; i++) {
      // Elbow rotation belongs to the distal attachment zone, not the upper-arm belly.
      const w = smooth((pivot.y + .12 - p.getY(i)) / .55); ix[i * 4 + 1] = 1; weights[i * 4] = 1 - w; weights[i * 4 + 1] = w;
      const u = (p.getY(i) - bounds.min.y) / height;
      const end = 1 - smooth(Math.min(u, 1 - u) / .2);
      flesh.clone().lerp(tendon, end * .85).toArray(colors, i * 3);
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ix, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    source.material.vertexColors = true; source.material.color.set(biceps ? '#f5c7aa' : '#cea4b6');
    const o = new THREE.SkinnedMesh(g, source.material); o.userData = source.userData;
    o.castShadow = o.receiveShadow = true; group.remove(source); group.add(o); o.bind(skeleton, new THREE.Matrix4());
    const shape = signed => (x, y, z) => {
      const u = clamp((y - bounds.min.y) / height), belly = Math.sin(Math.PI * u) ** 2;
      // End taper remains fixed; belly correction is illustrative, not measured tendon segmentation.
      const radial = 1 + signed * .18 * belly;
      return [center.x + (x - center.x) * radial,
        y - (y - center.y) * signed * .1 * belly,
        center.z + (z - center.z) * radial + (biceps ? 1 : -1) * Math.max(0, signed) * .13 * belly];
    };
    // This deep head sits against the humerus; generic belly shrinking drives its inner surface into bone.
    // Preserve its source belly and articulate only the distal attachment zone.
    if (!deepHead) addMorphPoses(o, [shape(1), shape(-.45)]);
    return {o, biceps};
  });
  return {elbow, muscles, dispose: () => skeleton.dispose()};
}
