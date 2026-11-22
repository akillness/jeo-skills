// terrain.js - the ground of Emberfall: a terraced hillside falling east into a pond.
// `heightAt` is the single source of ground height; buildings, paths, scatter and creatures all
// read it, so nothing floats. Change TERRACE_STEP to alter how the hillside is stepped.
import * as THREE from 'three';

export const TERRACE_STEP = 1.15;
export const POND = { x: 16, z: 14, radius: 15 }; // disc is generous; terrain clips the shoreline
export const WATER_LEVEL = -1.4;
export const GROUND_SIZE = 150;

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Landform before terracing: a ridge to the north-west, the village knoll, an east shoulder and
// the pond basin, plus one low-frequency wobble so no tread is machine flat.
function landform(x, z) {
  const ridge = 7.4 * Math.exp(-(((x + 26) ** 2) + ((z + 20) ** 2)) / 1500);
  const knoll = 3.8 * Math.exp(-(((x + 2) ** 2) + ((z + 6) ** 2)) / 620);
  const shoulder = 2.4 * Math.exp(-(((x - 24) ** 2) + ((z + 24) ** 2)) / 1500);
  const basin = -6.0 * (1 - smoothstep(0, 26, Math.hypot(x - POND.x, z - POND.z)));
  const wobble = 0.95 * Math.sin(x * 0.085) * Math.cos(z * 0.072);
  return ridge + knoll + shoulder + basin + wobble + 0.55;
}

/** Ground height in metres at world (x, z). Terraced near the village, organic further out. */
export function heightAt(x, z) {
  const h = landform(x, z);
  const step = Math.floor(h / TERRACE_STEP);
  const fraction = h / TERRACE_STEP - step;
  // Flat treads with a short riser: smoothstep compresses the transition into the last 40%.
  const terraced = (step + smoothstep(0.52, 0.94, fraction)) * TERRACE_STEP;
  const mix = 0.82 * (1 - smoothstep(18, 38, Math.hypot(x - 1, z + 1)));
  return h * (1 - mix) + terraced * mix;
}

/** Surface normal by central difference; used to paint slope and to stand things upright. */
export function normalAt(x, z, e = 0.6) {
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return new THREE.Vector3(-dx, 2 * e, -dz).normalize();
}

/**
 * The ground mesh. Albedo is painted per vertex into four masses - sunlit turf, shaded turf,
 * bare earth on the risers and damp mud at the waterline - rather than textured per blade.
 */
export function createTerrain({ material, palette }) {
  const segments = 190;
  const geometry = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const turf = new THREE.Color(palette.turf);
  const shade = new THREE.Color(palette.turfShade);
  const earth = new THREE.Color(palette.earth);
  const mud = new THREE.Color(palette.mud);
  const scratch = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    const y = heightAt(x, z);
    position.setY(i, y);
    const slope = 1 - normalAt(x, z, 0.8).y;
    const wet = 1 - smoothstep(0.4, 2.6, y - WATER_LEVEL);
    const banding = 0.5 + 0.25 * Math.sin(x * 0.16 + z * 0.11) + 0.25 * Math.sin(z * 0.37 - x * 0.08);
    scratch.copy(turf).lerp(shade, 0.34 * banding * (1 - slope));
    scratch.lerp(earth, smoothstep(0.12, 0.34, slope));
    scratch.lerp(mud, wet);
    colors[i * 3] = scratch.r; colors[i * 3 + 1] = scratch.g; colors[i * 3 + 2] = scratch.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

/** Still pond water: the one low-roughness surface in the scene, so it alone catches the sun. */
export function createWater(material) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(POND.radius, 64), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(POND.x, WATER_LEVEL, POND.z);
  mesh.receiveShadow = true;
  return mesh;
}
