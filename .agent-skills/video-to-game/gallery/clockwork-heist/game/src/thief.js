// A hooded thief: fal-generated rigged GLB (Meshy rig + animation clips),
// tinted per player, with a verlet-simulated cape billowing behind it.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Body } from './physics.js';
import { PHYS } from './config.js';

const TARGET_HEIGHT = 1.22;
let protoInfo = null; // shared prepared clips + scale

function prepareProto(gltf) {
  if (protoInfo) return protoInfo;
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  // skinned meshes: measure the bind pose with bone transforms applied
  scene.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); o.boundingBox = null; } });
  const box = new THREE.Box3().setFromObject(scene, true);
  const h = box.max.y - box.min.y;
  const scale = TARGET_HEIGHT / h;
  const clips = {};
  for (const c of gltf.animations) clips[c.name] = c;

  // Physics drives vertical motion: flatten the hips' vertical travel in airborne clips.
  const flattenHipsY = (clip, ref) => {
    for (const t of clip.tracks) {
      if (t.name === 'Hips.position') {
        const v = t.values;
        for (let i = 1; i < v.length; i += 3) v[i] = ref + (v[i] - ref) * 0.15;
      }
    }
  };
  const restY = 66;
  const jump = clips.jump ? clips.jump.clone() : null;
  if (jump) flattenHipsY(jump, restY);
  const sub = (clip, name, a, b) => THREE.AnimationUtils.subclip(clip, name, a, b, 30);
  const out = {
    idle: clips.idle,
    run: clips.run,
    sneak: clips.sneak,
    pull: clips.pull,
    victory: clips.victory,
    knock: clips.knock,
    wave: clips.wave,
    fall: clips.fall,
    jumpUp: jump ? sub(jump, 'jumpUp', 14, 25) : clips.idle,
    jumpDown: jump ? sub(jump, 'jumpDown', 25, 33) : clips.idle,
    land: jump ? sub(jump, 'land', 33, 46) : clips.idle,
  };
  protoInfo = { scale, minY: box.min.y, clips: out };
  return protoInfo;
}

function tintMaterial(src, colorHex) {
  const m = src.clone();
  m.metalness = 0.0;
  m.roughness = 0.82;
  const tint = new THREE.Color(colorHex);
  m.userData.tint = { value: tint };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTint = m.userData.tint;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec3 c = diffuseColor.rgb;
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
          float sat = (mx - mn) / (mx + 1e-4);
          float k = smoothstep(0.22, 0.45, l) * (1.0 - smoothstep(0.18, 0.4, sat));
          vec3 cloth = uTint * (0.42 + 0.78 * smoothstep(0.2, 0.85, l));
          vec3 darkCloth = c * (0.6 + 1.1 * uTint);
          diffuseColor.rgb = mix(mix(c, darkCloth, 0.6), cloth, k);
        }`
      );
  };
  m.customProgramCacheKey = () => 'thiefTint';
  return m;
}

// ---------------- cape (verlet cloth) ----------------
// A hooded cloak: particles on half-rings around the shoulders (open at the front),
// widening towards the hem, so it always shows its colour from the side camera.
class Cape {
  constructor(scene, colorHex, fabricTex) {
    this.W = 9; this.H = 10;
    this.rTop = 0.135; this.rBot = 0.5; this.len = 0.9; this.arc = 3.7;
    const n = this.W * this.H;
    this.p = new Float32Array(n * 3);
    this.q = new Float32Array(n * 3); // previous
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const uv = new Float32Array(n * 2);
    const idx = [];
    for (let j = 0; j < this.H; j++) for (let i = 0; i < this.W; i++) {
      const k = j * this.W + i;
      uv[k * 2] = i / (this.W - 1) * 2; uv[k * 2 + 1] = (1 - j / (this.H - 1)) * 1.5;
      if (i < this.W - 1 && j < this.H - 1) {
        const a = k, b = k + 1, c = k + this.W, d = k + this.W + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.geo = geo;
    let map = null;
    if (fabricTex) { map = fabricTex.clone(); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.needsUpdate = true; }
    const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.72, metalness: 0.0, side: THREE.DoubleSide, map, envMapIntensity: 0.6 });
    if (map) mat.color.multiplyScalar(1.2);
    mat.emissive = new THREE.Color(colorHex).multiplyScalar(0.14);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.ready = false;
    this.t = Math.random() * 10;
    const da = this.arc / (this.W - 1);
    this.restH = []; this.restB = [];
    for (let j = 0; j < this.H; j++) { const r = this.ring(j); this.restH.push(r * da * 1.02); this.restB.push(2 * r * Math.sin(da) * 1.02); }
  }
  ring(j) { return this.rTop + (this.rBot - this.rTop) * Math.pow(j / (this.H - 1), 0.8); }
  ang(i) { return -this.arc / 2 + this.arc * i / (this.W - 1); }
  reset(base, back, lat) {
    for (let j = 0; j < this.H; j++) for (let i = 0; i < this.W; i++) {
      const k = (j * this.W + i) * 3;
      const a = this.ang(i), r = this.ring(j);
      const dx = back.x * Math.cos(a) + lat.x * Math.sin(a), dz = back.z * Math.cos(a) + lat.z * Math.sin(a);
      this.p[k] = this.q[k] = base.x + dx * r;
      this.p[k + 1] = this.q[k + 1] = base.y - j * (this.len / (this.H - 1));
      this.p[k + 2] = this.q[k + 2] = base.z + dz * r;
    }
    this.ready = true;
  }
  step(dt, base, back, lat, vel, gust) {
    if (!this.ready) this.reset(base, back, lat);
    const W = this.W, H = this.H, p = this.p, q = this.q;
    this.t += dt;
    const sub = 2; const h = dt / sub;
    const restV = this.len / (H - 1);
    const moving = Math.min(1, Math.abs(vel.x) / 4);
    for (let s = 0; s < sub; s++) {
      for (let j = 1; j < H; j++) for (let i = 0; i < W; i++) {
        const k = (j * W + i) * 3;
        const fl = Math.sin(this.t * 11 + j * 0.8 + i * 1.1) * 0.6 + Math.sin(this.t * 5.7 + j * 1.6 - i * 0.7) * 0.4;
        const lift = (0.35 + j / H);
        const ax = -vel.x * 1.5 * lift + back.x * (0.3 + gust * 0.4) * lift + fl * (0.3 + moving * 1.4);
        const ay = -12.5 - vel.y * 1.0 * lift + fl * (0.25 + moving * 1.3);
        const az = fl * (0.25 + moving * 0.8) + 0.5 * moving * lift;
        for (let c = 0; c < 3; c++) {
          const cur = p[k + c];
          const acc = c === 0 ? ax : c === 1 ? ay : az;
          const v = (cur - q[k + c]) * 0.92;
          q[k + c] = cur;
          p[k + c] = cur + v + acc * h * h;
        }
      }
      // pin the collar around the neck
      for (let i = 0; i < W; i++) {
        const k = i * 3, a = this.ang(i), r = this.rTop;
        p[k] = base.x + (back.x * Math.cos(a) + lat.x * Math.sin(a)) * r;
        p[k + 1] = base.y;
        p[k + 2] = base.z + (back.z * Math.cos(a) + lat.z * Math.sin(a)) * r;
        q[k] = p[k]; q[k + 1] = p[k + 1]; q[k + 2] = p[k + 2];
      }
      for (let it = 0; it < 4; it++) {
        for (let j = 0; j < H; j++) {
          for (let i = 0; i < W; i++) {
            const k = (j * W + i) * 3;
            if (j < H - 1) this.solve(k, k + W * 3, restV, j === 0);
            if (j > 0 && i < W - 1) this.solve(k, k + 3, this.restH[j], false);
            if (j > 0 && i < W - 2) this.solve(k, k + 6, this.restB[j], false);
          }
        }
        // stay outside the body (a vertical capsule under the neck)
        for (let j = 1; j < H; j++) {
          const minR = 0.125 + j * 0.013;
          for (let i = 0; i < W; i++) {
            const k = (j * W + i) * 3;
            const dy = p[k + 1] - base.y;
            if (dy < -0.95) continue;
            const dx = p[k] - base.x, dz = p[k + 2] - base.z;
            const d = Math.hypot(dx, dz);
            if (d < minR) {
              const f = d > 1e-5 ? minR / d : 1;
              if (d > 1e-5) { p[k] = base.x + dx * f; p[k + 2] = base.z + dz * f; }
              else { p[k] = base.x + back.x * minR; p[k + 2] = base.z + back.z * minR; }
            }
          }
        }
      }
    }
    const pos = this.geo.attributes.position.array;
    pos.set(p);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
  solve(a, b, rest, pinA) {
    const p = this.p;
    const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    const diff = (d - rest) / d;
    if (pinA) {
      p[b] -= dx * diff; p[b + 1] -= dy * diff; p[b + 2] -= dz * diff;
    } else {
      const h = diff * 0.5;
      p[a] += dx * h; p[a + 1] += dy * h; p[a + 2] += dz * h;
      p[b] -= dx * h; p[b + 1] -= dy * h; p[b + 2] -= dz * h;
    }
  }
  setVisible(v) { this.mesh.visible = v; }
  dispose(scene) { scene.remove(this.mesh); this.geo.dispose(); }
}

// ---------------- thief ----------------
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Thief {
  constructor(game, slot, colorDef, x, y) {
    this.game = game;
    this.slot = slot;
    this.color = colorDef;
    this.isBot = true;
    this.controller = null;
    this.body = new Body(x, y);
    this.facing = 1;
    this.turn = 1;
    this.anim = null;
    this.holding = null;     // lever currently held
    this.dead = false; this.respawnT = 0;
    this.victory = false;
    this.knockT = 0;
    this.airT = 0;
    this.squash = 0;
    this.gems = 0; this.falls = 0;
    this.botState = null;

    const info = prepareProto(game.assets.models.thief);
    this.info = info;
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(game.assets.models.thief.scene);
    this.model.scale.setScalar(info.scale);
    this.model.position.y = -info.minY * info.scale;
    this.model.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true; o.receiveShadow = true;
        o.frustumCulled = false;
        o.material = tintMaterial(o.material, colorDef.hex);
      }
    });
    this.pivot = new THREE.Group();
    this.pivot.add(this.model);
    this.root.add(this.pivot);
    game.scene.add(this.root);

    this.spine = this.model.getObjectByName('Spine02') || this.model.getObjectByName('Spine01');
    this.neck = this.model.getObjectByName('neck') || this.spine;
    this.lShoulder = this.model.getObjectByName('LeftArm');
    this.rShoulder = this.model.getObjectByName('RightArm');

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const [k, clip] of Object.entries(info.clips)) {
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      if (['jumpUp', 'jumpDown', 'land', 'knock'].includes(k)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[k] = a;
    }
    this.play('idle', 0);
    this.cape = new Cape(game.scene, colorDef.hex, game.assets.tex.fabric);
    this.velSmooth = new THREE.Vector3();
    this.lastPos = new THREE.Vector3(x, y, 0);
  }

  play(name, fade = 0.15, timeScale = 1) {
    const a = this.actions[name];
    if (!a) return;
    if (this.anim === name) { a.timeScale = timeScale; return; }
    const prev = this.anim ? this.actions[this.anim] : null;
    a.reset();
    a.enabled = true;
    a.timeScale = timeScale;
    a.setEffectiveWeight(1);
    a.play();
    if (prev && fade > 0) prev.crossFadeTo(a, fade, false);
    else if (prev) prev.stop();
    this.anim = name;
  }

  get x() { return this.body.x; }
  get y() { return this.body.y; }
  get center() { return { x: this.body.x, y: this.body.y + 0.5 }; }

  /** Visual update (after physics or kinematic bot motion). vx/vy = world velocity, grounded flag. */
  updateVisual(dt, st) {
    const { vx, vy, grounded, moving } = st;
    // facing
    if (Math.abs(st.faceDir || 0) > 0.01) this.facing = Math.sign(st.faceDir);
    this.turn += (this.facing - this.turn) * Math.min(1, dt * 14);
    const yaw = Math.PI / 2 * this.turn - 0.3 * (1 - Math.abs(this.turn)) - 0.42 * Math.sign(this.turn);
    this.pivot.rotation.y = yaw;

    // animation state
    let want = 'idle', ts = 1;
    if (this.victory) want = 'victory';
    else if (this.knockT > 0) want = 'knock';
    else if (this.holding) want = 'pull';
    else if (!grounded) {
      this.airT += dt;
      if (vy > 0.5) want = 'jumpUp';
      else want = this.airT > 0.9 ? 'fall' : 'jumpDown';
    } else {
      this.airT = 0;
      if (moving && Math.abs(vx) > 0.6) { want = 'run'; ts = THREE.MathUtils.clamp(Math.abs(vx) / PHYS.runSpeed, 0.55, 1.25); }
      else if (st.waving) want = 'wave';
    }
    if (want !== this.anim) {
      const fade = want === 'jumpUp' ? 0.06 : want === 'run' && this.anim === 'jumpDown' ? 0.1 : 0.16;
      this.play(want, fade, ts);
    } else if (want === 'run') this.actions.run.timeScale = ts;

    // squash & stretch
    this.squash *= Math.exp(-dt * 10);
    const sy = 1 + this.squash, sxz = 1 - this.squash * 0.5;
    this.pivot.scale.set(sxz, sy, sxz);

    this.root.position.set(this.body.x, this.body.y, 0);
    this.mixer.update(dt);

    // cape
    this.root.updateMatrixWorld(true);
    const fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw);
    const back = { x: -fwdX, z: -fwdZ };
    const latX = Math.cos(yaw), latZ = -Math.sin(yaw);
    const base = _v;
    if (this.neck) this.neck.getWorldPosition(base); else base.set(this.body.x, this.body.y + 0.75, 0);
    if (this.spine) { this.spine.getWorldPosition(_v2); base.lerp(_v2, 0.45); }
    base.y += 0.02;
    base.x += back.x * 0.03; base.z += back.z * 0.03;
    const lat = { x: latX, z: latZ };
    const cur = new THREE.Vector3(this.body.x, this.body.y, 0);
    const vel = cur.clone().sub(this.lastPos).divideScalar(Math.max(dt, 1e-3));
    if (vel.length() > 30) vel.set(0, 0, 0); // teleport
    this.velSmooth.lerp(vel, Math.min(1, dt * 8));
    this.lastPos.copy(cur);
    const gust = 0.6 + Math.sin(this.game.time * 0.7 + this.slot) * 0.4;
    this.cape.step(Math.min(dt, 1 / 30), base, back, lat, this.velSmooth, gust);
  }

  landImpact(speed) { this.squash = -Math.min(0.28, speed * 0.018); }
  jumpImpulse() { this.squash = 0.2; }

  setVisible(v) { this.root.visible = v; this.cape.setVisible(v); }
  resetCape() { this.cape.ready = false; this.lastPos.set(this.body.x, this.body.y, 0); this.velSmooth.set(0, 0, 0); }

  dispose() { this.game.scene.remove(this.root); this.cape.dispose(this.game.scene); }
}
