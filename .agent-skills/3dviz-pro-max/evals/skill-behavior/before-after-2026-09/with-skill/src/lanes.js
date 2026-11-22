// lanes.js - the paths. Every lane in village-model.js becomes a ribbon that hugs the terrain and,
// wherever the ground steps, a stone tread on the riser. The theme asks that paths visibly reach
// the buildings, so lanes are geometry, not a texture.
import * as THREE from 'three';
import { heightAt } from './terrain.js';

const LIFT = 0.075;      // how far the ribbon rides above the ground, to beat z-fighting
const SAMPLE_M = 0.55;   // spacing along the lane
const STEP_RISE = 0.16;  // rise between samples that earns a stone tread

function curveFor(points) {
  return new THREE.CatmullRomCurve3(
    points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.4);
}

/** @returns {{mesh: THREE.Mesh, steps: THREE.InstancedMesh, sample(id, t): THREE.Vector3}} */
export function createLanes({ lanes, surface, stone }) {
  const positions = [], indices = [], stepFrames = [];
  let vertex = 0;
  for (const lane of lanes) {
    const curve = curveFor(lane.points);
    const count = Math.max(8, Math.round(curve.getLength() / SAMPLE_M));
    let previousY = null;
    for (let i = 0; i <= count; i++) {
      const point = curve.getPoint(i / count);
      const tangent = curve.getTangent(i / count);
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(lane.width / 2);
      const y = heightAt(point.x, point.z);
      for (const sign of [-1, 1]) {
        const px = point.x + side.x * sign, pz = point.z + side.z * sign;
        positions.push(px, heightAt(px, pz) + LIFT, pz);
      }
      if (i > 0) {
        const a = vertex - 2, b = vertex - 1, c = vertex, d = vertex + 1;
        indices.push(a, c, b, b, c, d);
        if (previousY !== null && Math.abs(y - previousY) > STEP_RISE) {
          stepFrames.push({ point: point.clone().setY(Math.max(y, previousY) + LIFT + 0.03),
            angle: Math.atan2(tangent.x, tangent.z), width: lane.width });
        }
      }
      previousY = y;
      vertex += 2;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.receiveShadow = true;

  const steps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.17, 0.42), stone, Math.max(1, stepFrames.length));
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
  stepFrames.forEach((frame, index) => {
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), frame.angle);
    scale.set(frame.width * 0.94, 1, 1);
    matrix.compose(frame.point, quaternion, scale);
    steps.setMatrixAt(index, matrix);
  });
  steps.count = stepFrames.length;
  steps.castShadow = true;
  steps.receiveShadow = true;
  return { mesh, steps, stepCount: stepFrames.length };
}
