// Dusk dome, drifting aurora ribbons, stars and the three-light rig that
// gives Emberhollow its cold-blue / warm-ember contrast.

import * as THREE from 'three';
import { PALETTE, makeRng } from './noise-and-palette.js';

const SKY_VERT = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(h, 0.75));
    // Warm ember bloom sitting low in the north-west, where the sun just set.
    float sunset = pow(max(0.0, dot(normalize(vDir), normalize(vec3(-0.75, 0.12, -0.6)))), 11.0);
    col += uGlow * sunset * 0.32;
    // Paper grain so the gradient never looks like plastic.
    float grain = fract(sin(dot(vDir.xy, vec2(12.9898, 78.233))) * 43758.5453);
    col += (grain - 0.5) * 0.012;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createSky() {
  const geo = new THREE.SphereGeometry(400, 32, 20);
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(PALETTE.nightTop) },
      uHorizon: { value: new THREE.Color(PALETTE.nightHorizon) },
      uGlow: { value: new THREE.Color(PALETTE.nightGlow) }
    }
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'sky';
  return sky;
}

export function createStars() {
  const rng = makeRng(90210);
  const count = 900;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(rng() * 0.85 + 0.05);
    const r = 340;
    pos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    pos[i * 3 + 1] = Math.cos(phi) * r;
    pos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
    c.setHSL(0.55 + rng() * 0.14, 0.5, 0.6 + rng() * 0.4);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 2.4, vertexColors: true, transparent: true, opacity: 0.9,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false
  });
  const stars = new THREE.Points(geo, mat);
  stars.userData.tick = (t) => { stars.rotation.y = t * 0.004; };
  return stars;
}

/** Three translucent ribbons of aurora that drift and breathe over the ridge. */
export function createAurora() {
  const group = new THREE.Group();
  const hues = [PALETTE.jade, 0x8a6fe0, 0x4fb4d8];
  const ribbons = [];
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.PlaneGeometry(320, 70, 48, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: hues[i], transparent: true, opacity: 0.1 - i * 0.02,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 74 + i * 16, -170 - i * 22);
    mesh.rotation.x = -0.18;
    group.add(mesh);
    ribbons.push({ mesh, geo, base: geo.attributes.position.array.slice(), phase: i * 2.1 });
  }
  group.userData.tick = (t) => {
    for (const r of ribbons) {
      const arr = r.geo.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = r.base[i], y = r.base[i + 1];
        arr[i + 1] = y + Math.sin(x * 0.02 + t * 0.35 + r.phase) * 12 * (y > 0 ? 1 : 0.25);
      }
      r.geo.attributes.position.needsUpdate = true;
      r.mesh.material.opacity = 0.06 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.4 + r.phase));
    }
  };
  return group;
}

/** Lighting rig: cold moon key, warm ember bounce, and a soft hemisphere fill. */
export function createLights() {
  const group = new THREE.Group();

  const moon = new THREE.DirectionalLight(0x9fc4ff, 1.35);
  moon.position.set(-70, 96, -58);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 320;
  const d = 90;
  moon.shadow.camera.left = -d; moon.shadow.camera.right = d;
  moon.shadow.camera.top = d; moon.shadow.camera.bottom = -d;
  moon.shadow.bias = -0.0012;
  moon.shadow.normalBias = 0.035;
  group.add(moon);

  const ember = new THREE.DirectionalLight(PALETTE.emberDeep, 0.55);
  ember.position.set(48, 22, 60);
  group.add(ember);

  const hemi = new THREE.HemisphereLight(0x6b7bb8, 0x3b2a20, 0.65);
  group.add(hemi);

  // The village square's own hearth glow.
  const hearth = new THREE.PointLight(PALETTE.ember, 90, 70, 2);
  hearth.position.set(0, 7, 2);
  group.add(hearth);
  group.userData.tick = (t) => {
    hearth.intensity = 78 + Math.sin(t * 3.1) * 9 + Math.sin(t * 7.7) * 5;
  };
  return group;
}
