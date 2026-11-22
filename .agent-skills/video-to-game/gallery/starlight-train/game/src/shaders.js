import * as THREE from 'three';

// Global uniforms shared by every patched material.
export const U = {
  uBendK: { value: 0.0 },     // track curvature (curved-world bend)
  uBendX0: { value: 0.0 },    // bend origin (follows the camera focus)
  uTime: { value: 0.0 },
  uScroll: { value: 0.0 },    // distance travelled by the train (world scroll)
  uWagonX: { value: new Array(6).fill(0) },
  uWagonLit: { value: new Array(6).fill(0) },
  uWin: { value: [0.085, 0.235, 0.345, 0.455, 0.565, 0.675, 0.80, 0.915] },
  uDawn: { value: 0.0 },
  uPassX0: { value: 1e7 },
};

export const BEND = /* glsl */`
uniform float uBendK;
uniform float uBendX0;
vec3 bendW(vec3 p){
  float dx = p.x - uBendX0;
  float a = clamp(dx, -70.0, 70.0);
  float ext = max(abs(dx) - 70.0, 0.0);
  p.z -= uBendK * (a*a + 140.0*ext);
  return p;
}
`;

export const NOISE = /* glsl */`
uint ihash(uint x, uint y){ uint h = x*374761393u + y*668265263u; h = (h ^ (h >> 13u)) * 1274126177u; return h ^ (h >> 16u); }
float h01(int x, int y){ return float(ihash(uint(x), uint(y)) & 16777215u) / 16777215.0; }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = p - i;
  vec2 u = f*f*(3.0-2.0*f);
  int ix = int(i.x); int iy = int(i.y);
  float a = h01(ix, iy), b = h01(ix+1, iy), c = h01(ix, iy+1), d = h01(ix+1, iy+1);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
`;

export const TERRAIN = /* glsl */`
uniform float uPassX0;
float terrainH(float xw, float z){
  float pk = smoothstep(uPassX0, uPassX0 + 90.0, xw);
  float far = max(0.0, -z - 3.4);
  float nr = max(0.0, z - 3.4);
  float vary = 0.78 + 0.22*sin(xw*0.0123 + 1.3) + 0.10*sin(xw*0.041 + 0.4);
  float hFar = (5.2*(1.0 - exp(-far/5.0)) - max(0.0, far - 13.0)*0.55) * vary + pk * (4.0*(1.0 - exp(-far/6.0)) + max(0.0, far - 30.0)*0.18);
  float hNear = (-nr*(0.26 + 0.07*sin(xw*0.019)) - nr*nr*0.0035) * (1.0 + pk*0.9);
  float n1 = vnoise(vec2(xw*0.045, z*0.05))*2.0-1.0;
  float n2 = vnoise(vec2(xw*0.13+17.0, z*0.13+5.0))*2.0-1.0;
  float amp = smoothstep(3.4, 10.0, abs(z));
  float h = hFar + hNear + (n1*2.0 + n2*0.55)*amp;
  float bed = 1.0 - smoothstep(2.6, 3.4, abs(z));
  float drift = max(0.0, vnoise(vec2(xw*0.35, z*0.6)) - 0.45) * 0.35;
  return h + bed*drift;
}
// polygonal (voronoi) cells: x = cell id, y = squared distance to the nearest site, z = to the second
vec3 cells(vec2 p){
  vec2 i = floor(p); vec2 f = p - i;
  float d1 = 9.0, d2 = 9.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    int cx = int(i.x) + x; int cy = int(i.y) + y;
    vec2 o = vec2(h01(cx, cy), h01(cx + 7, cy + 13));
    vec2 r = vec2(float(x), float(y)) + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = h01(cx + 31, cy + 57); } else if (d < d2) { d2 = d; }
  }
  return vec3(id, d1, d2);
}
`;

export const PROJECT_BEND = /* glsl */`
vec4 bwp = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  bwp = instanceMatrix * bwp;
#endif
bwp = modelMatrix * bwp;
bwp.xyz = bendW(bwp.xyz);
vec4 mvPosition = viewMatrix * bwp;
gl_Position = projectionMatrix * mvPosition;
`;

// Patch a built-in material so it follows the curved track. `extra(sh)` can add more edits.
export function patchBend(mat, key = 'bend', extra = null, uniforms = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uBendK = U.uBendK;
    sh.uniforms.uBendX0 = U.uBendX0;
    sh.uniforms.uTime = U.uTime;
    for (const k in uniforms) sh.uniforms[k] = uniforms[k];
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + BEND + '\nuniform float uTime;\n')
      .replace('#include <project_vertex>', PROJECT_BEND);
    if (extra) extra(sh);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

// Convert a GLTF material (Trellis output: PBR, metallic=1 without env) into a soft Lambert one.
export function toLambert(src, opts = {}) {
  const m = new THREE.MeshLambertMaterial({ map: src.map || null, color: 0xffffff, ...opts });
  if (m.map) { m.map.colorSpace = THREE.SRGBColorSpace; m.map.anisotropy = 4; }
  return m;
}

// Foliage fix-up for the generated fir textures: deep blue-green needles, fill atlas holes
// (near-black texels) with snow on upward faces and needles elsewhere.
export function foliageMaterial(map, key) {
  const m = new THREE.MeshLambertMaterial({ map });
  return patchBend(m, key, (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vUpY;')
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        {
          vec3 n = objectNormal;
          #ifdef USE_INSTANCING
            n = mat3(instanceMatrix) * n;
          #endif
          vUpY = normalize(mat3(modelMatrix) * n).y;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vUpY;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 c = diffuseColor.rgb;
          float lum = dot(c, vec3(0.3, 0.59, 0.11));
          float blue = clamp((c.b - c.r) * 3.0 - 0.1, 0.0, 1.0) * (1.0 - smoothstep(0.30, 0.65, lum));
          vec3 needle = vec3(0.035, 0.075, 0.07) + c * vec3(0.10, 0.20, 0.17);
          c = mix(c, needle, blue * 0.92);
          float mxc = max(c.r, max(c.g, c.b)), mnc = min(c.r, min(c.g, c.b));
          float sat = (mxc - mnc) / max(mxc, 1e-3);
          float grayHole = (1.0 - smoothstep(0.10, 0.20, sat)) * (1.0 - smoothstep(0.22, 0.40, lum));
          float hole = max(1.0 - smoothstep(0.012, 0.05, lum), grayHole);
          vec3 fill = mix(vec3(0.04, 0.08, 0.075), vec3(0.76, 0.83, 0.92), smoothstep(0.05, 0.55, vUpY));
          diffuseColor.rgb = mix(c, fill, hole);
          // reference look: dark green needle tiers under thick white snow caps
          float lum2 = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          float under = 1.0 - smoothstep(0.66, 0.95, vUpY);
          vec3 needle2 = vec3(0.032, 0.115, 0.062) * (0.8 + 0.9 * lum2);
          diffuseColor.rgb = mix(diffuseColor.rgb, needle2, under * 0.9);
          float cap = smoothstep(0.50, 0.85, vUpY) * smoothstep(0.25, 0.55, lum2);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.87, 0.89) * (0.88 + 0.25 * lum2), cap * 0.6);
        }`);
  });
}

// Rocks of the reference: flat charcoal faces under heavy, bright snow caps.
export function rockMaterial(map, key) {
  const m = new THREE.MeshLambertMaterial({ map });
  return patchBend(m, key, (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vUpY;')
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        {
          vec3 n = objectNormal;
          #ifdef USE_INSTANCING
            n = mat3(instanceMatrix) * n;
          #endif
          vUpY = normalize(mat3(modelMatrix) * n).y;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vUpY;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 c = diffuseColor.rgb;
          float lum = dot(c, vec3(0.3, 0.59, 0.11));
          float snow = smoothstep(0.30, 0.55, lum);
          vec3 stone = vec3(0.030, 0.034, 0.038) * (0.8 + 2.2 * lum);
          vec3 cap = vec3(0.80, 0.84, 0.87) * (0.9 + 0.2 * lum);
          float up = smoothstep(0.35, 0.80, vUpY);
          diffuseColor.rgb = mix(stone, cap, clamp(snow * 0.85 + up * 0.55 * snow + up * 0.25, 0.0, 1.0));
        }`);
  });
}
