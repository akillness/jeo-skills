import * as THREE from 'three';
import { patchBend } from './shaders.js';
import { clamp, lerp } from './noise.js';

export const PH = {
  RUN: 5.7, AIR: 6.1, LAT: 0.78, ACC_G: 40, ACC_A: 17, G: 28, JUMP: 10.4, GLIDE_VY: -2.0,
  HALF_W: 1.12, HEIGHT: 1.22, CATCH_R: 1.2,
};

// The spirit: Trellis GLB with procedural animation in the vertex shader
// (no rig available: legs swing, cloak flutters / opens like wings when gliding).
// Visual scale of the spirit (physics keep PH.HEIGHT): a touch bigger than life so it reads at
// gameplay distance, like the hero of the reference video.
export const SPIRIT_VIS = 1.28;

// Shared procedural animation (no rig): legs swing, cloak flutters / opens like wings when gliding.
const SPIRIT_ANIM = /* glsl */`
  {
    vec4 tcol = texture(uMapV, uv);
    float lum = dot(tcol.rgb, vec3(0.3, 0.59, 0.11));
    float isCloak = smoothstep(0.16, 0.36, lum);
    float isBody = 1.0 - isCloak;
    float y = position.y;
    // legs
    float legW = isBody * (1.0 - smoothstep(-0.22, -0.10, y));
    float side = clamp(position.x * 30.0, -1.0, 1.0);
    float swing = sin(uPhase) * 0.70 * uRun * (1.0 - uAir) * side - uAir * 0.45;
    float a = swing * legW;
    float hy = -0.11;
    float dy = transformed.y - hy, dz = transformed.z;
    transformed.y = hy + dy * cos(a) - dz * sin(a);
    transformed.z = dy * sin(a) + dz * cos(a);
    transformed.y += legW * uAir * 0.05;
    // cloak
    float low = clamp((0.30 - y) / 0.85, 0.0, 1.0);
    float back = 1.0 - smoothstep(-0.12, 0.06, position.z);
    float flut = (uRun * 0.13 + uAir * 0.09 + uGlide * 0.16 + uWind * 0.22) * low * low;
    float wave = sin(uTime * 13.0 + y * 11.0 + position.x * 7.0) * 0.5 + 0.5;
    transformed.z -= isCloak * flut * (0.35 + 0.65 * back) * (0.7 + 0.6 * wave);
    transformed.x *= 1.0 + isCloak * uGlide * 0.75 * low;
    transformed.y += isCloak * uGlide * 0.10 * low * low;
  }`;
const SPIRIT_UNI = `uniform float uRun; uniform float uPhase; uniform float uAir; uniform float uGlide; uniform float uWind; uniform sampler2D uMapV;`;

export function createSpirit(scene, glb) {
  let src = null; glb.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
  const geo = src.geometry; geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const map = src.material.map; if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; }
  const S = PH.HEIGHT * SPIRIT_VIS / (bb.max.y - bb.min.y);
  const u = {
    uRun: { value: 0 }, uPhase: { value: 0 }, uAir: { value: 0 }, uGlide: { value: 0 }, uWind: { value: 0 },
    uMapV: { value: map }, uGlow: { value: 0.22 }, uFlash: { value: 0 }, uAlpha: { value: 1 }, uOutline: { value: 0.03 / S },
  };
  const mat = new THREE.MeshLambertMaterial({ map, transparent: true, color: 0xf2f4f6 });
  patchBend(mat, 'spirit', (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${SPIRIT_UNI}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SPIRIT_ANIM}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uGlow; uniform float uFlash; uniform float uAlpha; float gCl;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        gCl = smoothstep(0.16, 0.36, dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)));
        // dark charcoal body/legs (reads against the white roofs), clean white cloak
        diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.55, 0.6, 0.7), diffuseColor.rgb, gCl);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 vd = normalize(vViewPosition);
          float fres = pow(1.0 - clamp(abs(dot(normalize(normal), vd)), 0.0, 1.0), 2.5);
          totalEmissiveRadiance += diffuseColor.rgb * gCl * (uGlow + uFlash);
          totalEmissiveRadiance += vec3(0.62, 0.78, 1.0) * fres * (0.30 + uFlash) * (0.35 + 0.65 * gCl);
        }`)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= uAlpha;');
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.setScalar(S);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  // ink outline (inverted hull, same animation): keeps the little spirit readable on the snow
  const omat = new THREE.MeshBasicMaterial({ color: 0x0a1220, side: THREE.BackSide, transparent: true, fog: false });
  patchBend(omat, 'spiritOutline', (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${SPIRIT_UNI}\nuniform float uOutline;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SPIRIT_ANIM}\ntransformed += normalize(normal) * uOutline;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uAlpha;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= uAlpha * 0.85;');
  });
  const outline = new THREE.Mesh(geo, omat);
  outline.frustumCulled = false;
  outline.renderOrder = 4;
  mesh.add(outline);
  const root = new THREE.Group();
  root.add(mesh);
  mesh.position.y = -bb.min.y * S;   // feet at root origin
  scene.add(root);
  return { root, mesh, mat, u, S };
}

export function makePlayerState() {
  return {
    x: 0, y: 4, z: 0, vx: 0, vy: 0, vz: 0, onGround: false, coyote: 0, jumpBuf: 0, jumpCut: false,
    glide: false, facing: Math.PI / 2, state: 'play', stunT: 0, inv: 0, phase: 0, airT: 0, land: 0,
    stepAcc: 0, stepSide: 1, deadT: 0, fallX: 0, visible: 1, wind: 0, lean: 0, spinT: 0,
  };
}

// One physics step. `ev` collects events for audio/fx: jump, land, step, fall, bump.
export function stepPlayer(P, dt, inp, train, ev) {
  const roofTop = train.roofTop;
  if (P.state === 'gone') return;
  if (P.state === 'fall') {
    P.vy -= PH.G * dt; P.x += P.vx * dt * 0.3; P.y += P.vy * dt;
    P.deadT += dt;
    return;
  }
  if (P.state === 'respawn') {
    P.deadT += dt;
    const g = train.groundAt(P.x, P.z).h;
    P.y = lerp(P.y, g, Math.min(1, dt * 3.5));
    if (P.deadT > 1.0) { P.state = 'play'; P.y = g; P.onGround = true; P.inv = 1.8; }
    return;
  }
  let ix = 0, iz = 0;
  const control = P.state === 'play';
  if (control) { ix = inp.x; iz = -inp.y; }
  const len = Math.hypot(ix, iz); if (len > 1) { ix /= len; iz /= len; }
  if (P.state === 'stun') { P.stunT -= dt; if (P.stunT <= 0) P.state = 'play'; }

  // jump buffer / coyote
  if (control && inp.jumpPressed) P.jumpBuf = 0.13;
  P.jumpBuf = Math.max(0, P.jumpBuf - dt);
  P.coyote = Math.max(0, P.coyote - dt);

  const maxH = P.onGround ? PH.RUN : PH.AIR;
  const windV = P.wind * (P.onGround ? 1.0 : 1.35);
  const tvx = ix * maxH + windV, tvz = iz * maxH * PH.LAT;
  const acc = P.onGround ? PH.ACC_G : PH.ACC_A;
  const ax = acc * (P.state === 'stun' ? 0.25 : 1);
  P.vx += clamp(tvx - P.vx, -ax * dt, ax * dt);
  P.vz += clamp(tvz - P.vz, -ax * dt, ax * dt);

  if (P.jumpBuf > 0 && (P.onGround || P.coyote > 0) && control) {
    P.vy = PH.JUMP; P.onGround = false; P.coyote = 0; P.jumpBuf = 0; P.jumpCut = false; P.airT = 0;
    ev.push('jump');
  }
  if (!inp.jumpHeld && P.vy > 3 && !P.jumpCut && !P.onGround) { P.vy *= 0.5; P.jumpCut = true; }

  P.vy -= PH.G * dt;
  P.glide = !P.onGround && inp.jumpHeld && P.vy < 0 && control;
  if (P.glide) P.vy = Math.max(P.vy, PH.GLIDE_VY);
  P.vy = Math.max(P.vy, -26);

  // horizontal move with roof-end walls (can't walk into the side of the next car from below)
  const nx = P.x + P.vx * dt;
  const gN = train.groundAt(nx, P.z).h;
  if (gN > P.y + 0.42) { P.vx = 0; ev.push('bump'); } else P.x = nx;
  P.z = clamp(P.z + P.vz * dt, -PH.HALF_W, PH.HALF_W);
  if (Math.abs(P.z) >= PH.HALF_W) P.vz = 0;
  P.y += P.vy * dt;

  const g = train.groundAt(P.x, P.z).h;
  const solid = g > roofTop - 1.2;
  if (solid && P.y <= g && P.vy <= 0) {
    if (!P.onGround) { ev.push(P.airT > 0.25 ? 'land' : 'touch'); P.land = Math.min(1, 0.35 + Math.abs(P.vy) * 0.06); }
    P.y = g; P.vy = 0; P.onGround = true; P.jumpCut = false;
  } else if (P.onGround && solid && P.y - g < 0.3 && P.vy <= 0) {
    P.y = g;
  } else {
    if (P.onGround) P.coyote = 0.11;
    P.onGround = false;
  }
  if (!P.onGround) P.airT += dt; else P.airT = 0;

  // footsteps
  const sp = Math.hypot(P.vx, P.vz);
  if (P.onGround && sp > 0.8) {
    P.phase += dt * (6.0 + sp * 1.55);
    P.stepAcc += sp * dt;
    if (P.stepAcc > 0.62) { P.stepAcc = 0; P.stepSide *= -1; ev.push('step'); }
  } else if (P.onGround) {
    P.phase += dt * 2.0;
  }

  if (P.y < roofTop - 2.4 && P.state === 'play') {
    P.state = 'fall'; P.deadT = 0; P.fallX = P.x; ev.push('fall');
  }
}

// Visual update of the spirit mesh from the physics state.
export function poseSpirit(sp, P, dt, time) {
  const speed = Math.hypot(P.vx, P.vz);
  if (speed > 0.6 && P.state !== 'fall') {
    const target = Math.atan2(P.vx, P.vz);
    let d = target - P.facing; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    P.facing += d * Math.min(1, dt * 12);
  }
  const runAmt = P.onGround ? clamp(speed / PH.RUN, 0, 1) : 0;
  sp.u.uRun.value = lerp(sp.u.uRun.value, runAmt, Math.min(1, dt * 10));
  sp.u.uPhase.value = P.phase;
  sp.u.uAir.value = lerp(sp.u.uAir.value, P.onGround ? 0 : 1, Math.min(1, dt * 10));
  sp.u.uGlide.value = lerp(sp.u.uGlide.value, P.glide ? 1 : 0, Math.min(1, dt * 8));
  sp.u.uWind.value = lerp(sp.u.uWind.value, Math.min(1, Math.abs(P.wind) / 3), Math.min(1, dt * 4));
  P.land = Math.max(0, P.land - dt * 3.2);
  const bob = P.onGround ? Math.abs(Math.sin(P.phase)) * 0.07 * runAmt : 0;
  const squash = P.land * 0.28;
  const stretch = !P.onGround ? clamp(P.vy * 0.012, -0.08, 0.12) : 0;
  sp.root.position.set(P.x, P.y + bob, P.z);
  // three-quarter cheat: turn the figure a little toward the camera (it sits on the near side, behind)
  let dv = -0.48 - P.facing; while (dv > Math.PI) dv -= Math.PI * 2; while (dv < -Math.PI) dv += Math.PI * 2;
  sp.root.rotation.set(0, P.facing + dv * 0.35, 0);
  P.lean = lerp(P.lean, runAmt * 0.16 + (P.state === 'stun' ? -0.4 : 0), Math.min(1, dt * 8));
  sp.mesh.rotation.x = P.lean;
  if (P.spinT > 0) { P.spinT -= dt; sp.root.rotation.y += (1 - P.spinT / 0.6) * Math.PI * 2; }
  const sxz = 1 + squash - stretch * 0.5, sy = 1 - squash + stretch;
  sp.mesh.scale.set(sp.S * sxz, sp.S * sy, sp.S * sxz);
  let alpha = 1;
  if (P.state === 'fall') alpha = clamp(1 - (P.deadT - 0.5) / 0.6, 0, 1);
  if (P.state === 'respawn') alpha = clamp(P.deadT / 0.6, 0, 1);
  if (P.state === 'gone') alpha = 0;
  if (P.inv > 0 && P.state === 'play') alpha *= 0.55 + 0.45 * (Math.sin(time * 30) > 0 ? 1 : 0.2);
  sp.u.uAlpha.value = alpha;
  sp.root.visible = alpha > 0.01 && P.visible > 0;
}
