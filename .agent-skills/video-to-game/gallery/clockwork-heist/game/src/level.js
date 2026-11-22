// Gameplay geometry of the clock tower: physics surfaces + their visuals, all driven by LEVEL.
import * as THREE from 'three';
import { World } from './physics.js';
import { LEVEL } from './levelData.js';
import { gearGeometry, discGeometry } from './gears.js';
import * as M from './materials.js';

const TAU = Math.PI * 2;
const PLAY_DEPTH = 2.4; // z-thickness of walkways / floors around the play plane

// ---------------------------------------------------------------- GLB helpers
function firstMesh(root) { let m = null; root.traverse((o) => { if (!m && o.isMesh) m = o; }); return m; }

/** Bake a GLB into one geometry + material, normalised so its bounding box is known. */
function bakeModel(gltf) {
  const mesh = firstMesh(gltf.scene);
  gltf.scene.updateMatrixWorld(true);
  const g = mesh.geometry.clone();
  g.applyMatrix4(mesh.matrixWorld);
  g.computeBoundingBox();
  return { geometry: g, material: mesh.material, box: g.boundingBox.clone() };
}

/** Split the generated lever into a static base and a rotating handle (rod + knob). */
function splitLever(gltf) {
  const { geometry: g0, material } = bakeModel(gltf);
  const g = g0.index ? g0 : g0.toNonIndexed();
  const bb = g.boundingBox;
  const h = bb.max.y - bb.min.y;
  g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  g.scale(1 / h, 1 / h, 1 / h); // height 1, base on y=0, axis through x=z=0
  const pos = g.attributes.position;
  // find where the thin rod starts: lowest slice above which every vertex hugs the axis (until the knob)
  const maxR = new Float32Array(100);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i); const r = Math.hypot(pos.getX(i), pos.getZ(i));
    const k = Math.min(99, Math.max(0, Math.floor(y * 100)));
    maxR[k] = Math.max(maxR[k], r);
  }
  let split = 0.3;
  for (let k = 12; k < 60; k++) {
    let ok = true;
    for (let j = k; j < k + 8; j++) if (maxR[j] > 0.07) { ok = false; break; }
    if (ok) { split = k / 100 + 0.005; break; }
  }
  const pivot = Math.max(0.08, split - 0.07);
  const idx = g.index ? g.index.array : null;
  const triCount = idx ? idx.length / 3 : pos.count / 3;
  const base = [], handle = [];
  for (let t = 0; t < triCount; t++) {
    const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2;
    const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;
    const cr = Math.max(Math.hypot(pos.getX(a), pos.getZ(a)), Math.hypot(pos.getX(b), pos.getZ(b)), Math.hypot(pos.getX(c), pos.getZ(c)));
    (cy > split && cr < 0.2 ? handle : base).push(a, b, c);
  }
  const make = (list) => { const s = g.clone(); s.setIndex(list); return s; };
  const baseG = make(base);
  const handleG = make(handle);
  handleG.translate(0, -pivot, 0);
  return { baseG, handleG, pivot, material };
}

/** Material clone that recolours the generated red knob (keeps shading). */
function knobTintMaterial(src, hex) {
  const m = src.clone();
  m.userData.knob = { value: new THREE.Color(hex) };
  m.userData.glow = { value: 0 };
  m.envMapIntensity = 1.3;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uKnob = m.userData.knob;
    sh.uniforms.uGlow = m.userData.glow;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uKnob;\nuniform float uGlow;\nfloat knobMask;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 c = diffuseColor.rgb;
          knobMask = smoothstep(0.42, 0.62, 1.0 - max(c.g, c.b) / max(c.r, 0.001)) * step(0.1, c.r);
          float l = max(c.r, max(c.g, c.b));
          diffuseColor.rgb = mix(c, uKnob * (0.35 + 1.1 * l), knobMask);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uKnob * knobMask * uGlow;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.0, knobMask);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.25, knobMask);`);
  };
  m.customProgramCacheKey = () => 'knobTint';
  return m;
}

// ---------------------------------------------------------------- Level
export class Level {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.world = new World();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.gears = [];      // vertical walkable gears {def, mesh, surf}
    this.flatGears = [];
    this.movers = [];
    this.pendulums = [];
    this.levers = new Map();
    this.gates = [];
    this.bridges = [];
    this.gems = [];
    this.vault = null;
    this.events = [];     // audio/fx events emitted during update
    this.t = 0;
  }

  build(assets) {
    const tex = assets.tex;
    this.slabModel = assets.models.slab ? bakeModel(assets.models.slab) : null;
    this.leverModel = assets.models.lever ? splitLever(assets.models.lever) : null;
    for (const b of LEVEL.boxes) this.buildBox(b);
    for (const s of LEVEL.slabs) this.buildSlab(s);
    for (const g of LEVEL.gears) this.buildGear(g);
    for (const f of LEVEL.flatGears) this.buildFlatGear(f);
    for (const m of LEVEL.movers) this.buildMover(m);
    for (const p of LEVEL.pendulums) this.buildPendulum(p);
    for (const l of LEVEL.levers) this.buildLever(l);
    for (const g of LEVEL.gates) this.buildGate(g);
    for (const b of LEVEL.bridges) this.buildBridge(b);
    this.buildVault(assets);
    this.buildGems(assets);
    this.update(0, 0);
  }

  // ---------------- static blocks
  buildBox(b) {
    const surf = this.world.addBox({ ...b });
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    let mesh;
    if (b.style === 'hall') {
      // deep gallery floor: extends towards the camera so the inlaid marble fills the bottom of the frame
      const d = 16;
      const g = M.worldBox(w, h, d);
      const side = M.wood({ scale: 0.3, tint: 0x6a4a34 });
      const top = M.floorInlay({ tile: 3.2 });
      mesh = new THREE.Mesh(g, [side, side, top, side, side, side]);
      mesh.position.set(cx, cy, -4 + d / 2);
    } else if (b.style === 'wall') {
      const d = 9;
      mesh = new THREE.Mesh(M.offsetUV(M.worldBox(w, h, d), cx * 0.1, 0), M.wood({ scale: 0.25, tint: 0x5a4030 }));
      mesh.position.set(cx, cy, -d / 2 + 2.0);
    } else if (b.style === 'stone') {
      const d = PLAY_DEPTH + 0.6;
      mesh = new THREE.Mesh(M.offsetUV(M.worldBox(w, h, d), cx * 0.37, cy * 0.21), M.stone({ scale: 0.22, tint: 0xa89a86 }));
      mesh.position.set(cx, cy, 0);
      this.addTrim(b.x0, b.x1, b.y1, d / 2);
    } else { // walk: a slim suspended stone walkway on brass girders
      const d = PLAY_DEPTH;
      const vis = 0.9;
      mesh = new THREE.Mesh(M.offsetUV(M.worldBox(w, vis, d), cx * 0.37, cy * 0.21), M.stone({ scale: 0.3, tint: 0xb8a990 }));
      mesh.position.set(cx, b.y1 - vis / 2, 0);
      this.addTrim(b.x0, b.x1, b.y1, d / 2);
      this.addTrim(b.x0, b.x1, b.y1, -d / 2 - 0.16);
      const girderMat = M.brass({ scale: 0.4, rough: 0.38, tint: 0xc0a070 });
      const beam = new THREE.Mesh(M.worldBox(w - 0.2, 0.36, 0.5), girderMat);
      beam.position.set(cx, b.y1 - vis - 0.18, 0.2);
      beam.castShadow = true;
      this.root.add(beam);
      for (let x = b.x0 + 1.0; x < b.x1 - 0.5; x += 3.6) {
        const post = new THREE.Mesh(M.worldBox(0.26, 12, 0.26), girderMat);
        post.position.set(x, b.y1 - vis - 6, -0.6);
        post.castShadow = true;
        this.root.add(post);
        const brace = new THREE.Mesh(M.worldBox(0.14, 2.4, 0.14), girderMat);
        brace.position.set(x + 0.7, b.y1 - vis - 1.0, -0.6);
        brace.rotation.z = 0.7;
        this.root.add(brace);
      }
    }
    mesh.castShadow = b.style !== 'wall';
    mesh.receiveShadow = true;
    this.root.add(mesh);
  }

  addTrim(x0, x1, y, zFront) {
    const trim = new THREE.Mesh(M.worldBox(x1 - x0 + 0.06, 0.16, 0.16), M.brass({ scale: 0.6, rough: 0.26 }));
    trim.position.set((x0 + x1) / 2, y - 0.1, zFront + 0.02);
    trim.castShadow = true;
    this.root.add(trim);
  }

  // ---------------- floating stone slabs (GLB)
  slabMesh(width) {
    const sm = this.slabModel;
    if (!sm) {
      const m = new THREE.Mesh(M.worldBox(width, 0.7, 1.6), M.stone());
      m.userData.top = 0.35;
      return m;
    }
    const bw = sm.box.max.x - sm.box.min.x;
    const s = width / bw;
    const mat = sm.material.clone();
    mat.envMapIntensity = 0.8;
    const m = new THREE.Mesh(sm.geometry, mat);
    m.scale.setScalar(s);
    const g = new THREE.Group();
    m.position.set(-(sm.box.min.x + sm.box.max.x) / 2 * s, -sm.box.max.y * s, -(sm.box.min.z + sm.box.max.z) / 2 * s);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    return g; // origin = centre of the top face
  }

  buildSlab(s) {
    const surf = this.world.addOneway({ id: s.id, x0: s.x0, x1: s.x1, y: s.y });
    const g = this.slabMesh(s.x1 - s.x0 + 0.25);
    g.position.set((s.x0 + s.x1) / 2, s.y + 0.04, 0);
    this.root.add(g);
    surf.mesh = g;
  }

  // ---------------- vertical rotating gears (walk on their teeth)
  buildGear(def) {
    const surf = this.world.addCircle({ id: def.id, cx: def.cx, cy: def.cy, r: def.r, omega: def.omega });
    const geo = gearGeometry({ r: def.r, thick: 1.3, spokes: def.r > 3 ? 6 : 5 });
    const mesh = new THREE.Mesh(geo, M.brass({ scale: 0.22, rough: 0.3 }));
    mesh.position.set(def.cx, def.cy, 0);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.root.add(mesh);
    // axle into the depth + bearing block
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 7, 20), M.brass({ scale: 0.5, rough: 0.4, tint: 0xb89a70 }));
    axle.rotation.x = Math.PI / 2;
    axle.position.set(def.cx, def.cy, -4);
    axle.castShadow = true;
    this.root.add(axle);
    const teeth = Math.max(10, Math.round(def.r * 6.2));
    let phase = 0;
    if (def.meshWith) {
      const o = LEVEL.gears.find((g) => g.id === def.meshWith);
      const oTeeth = Math.max(10, Math.round(o.r * 6.2));
      const a = Math.atan2(def.cy - o.cy, def.cx - o.cx);
      const other = this.gears.find((g) => g.def.id === o.id);
      if (other) other.phase = a - 0.5 * TAU / oTeeth;
      phase = a + Math.PI;
    }
    this.gears.push({ def, mesh, surf, phase, teeth });
  }

  // ---------------- flat gears (turntable platforms)
  buildFlatGear(def) {
    const surf = this.world.addOneway({ id: def.id, x0: def.cx - def.r * 0.97, x1: def.cx + def.r * 0.97, y: def.y });
    const thick = def.r > 3 ? 0.6 : 0.45;
    const geo = gearGeometry({ r: def.r, thick, spokes: def.r > 3 ? 6 : 0, style: def.r > 3 ? 'spoked' : 'solid' }).clone();
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, M.brass({ scale: 0.24, rough: 0.28 }));
    mesh.position.set(def.cx, def.y - thick / 2, 0);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.root.add(mesh);
    // static centre boss + support shaft
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 24, 20), M.brass({ scale: 0.4, rough: 0.42, tint: 0xa88a62 }));
    shaft.position.set(def.cx, def.y - thick - 12, 0);
    shaft.castShadow = true;
    this.root.add(shaft);
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(def.r * 0.2, def.r * 0.22, 0.24, 28), M.brass({ scale: 0.5, rough: 0.22 }));
    boss.position.set(def.cx, def.y + 0.06, 0);
    boss.castShadow = true; boss.receiveShadow = true;
    this.root.add(boss);
    this.flatGears.push({ def, mesh, surf });
  }

  // ---------------- moving slab on a brass rail
  buildMover(def) {
    const surf = this.world.addOneway({ id: def.id, x0: def.xa - def.w / 2, x1: def.xa + def.w / 2, y: def.y });
    const g = this.slabMesh(def.w + 0.2);
    this.root.add(g);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, def.xb - def.xa + def.w + 3, 12), M.brass({ scale: 0.6 }));
    rail.rotation.z = Math.PI / 2;
    rail.position.set((def.xa + def.xb) / 2, def.y - 0.55, -1.25);
    this.root.add(rail);
    const carriage = new THREE.Mesh(M.worldBox(0.9, 0.5, 0.45), M.brass({ scale: 0.5, rough: 0.35 }));
    carriage.castShadow = true;
    this.root.add(carriage);
    this.movers.push({ def, mesh: g, carriage, surf, x: def.xa });
  }

  // ---------------- pendulums
  buildPendulum(def) {
    const group = new THREE.Group();
    group.position.set(def.px, def.py, -0.75);
    this.root.add(group);
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.9, 28), M.brass({ scale: 0.4, rough: 0.3 }));
    housing.rotation.x = Math.PI / 2;
    housing.position.set(def.px, def.py, -1.0);
    this.root.add(housing);
    const arm = new THREE.Group();
    group.add(arm);
    const rodMat = M.brass({ scale: 0.35, rough: 0.26 });
    const rod = new THREE.Mesh(M.worldBox(0.22, def.len, 0.22), rodMat);
    rod.position.y = -def.len / 2;
    rod.castShadow = true;
    arm.add(rod);
    // twin guide rods like the video's long pendulum
    const rod2 = new THREE.Mesh(M.worldBox(0.08, def.len * 0.92, 0.08), rodMat);
    rod2.position.set(0.32, -def.len * 0.46, 0.05);
    arm.add(rod2);
    const rod3 = rod2.clone(); rod3.position.x = -0.32; arm.add(rod3);
    const bob = new THREE.Group();
    bob.position.y = -def.len;
    arm.add(bob);
    const disc = new THREE.Mesh(discGeometry(def.bobR, 0.5, 56), M.brass({ scale: 0.3, rough: 0.24 }));
    disc.castShadow = true; disc.receiveShadow = true;
    bob.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(def.bobR, 0.11, 10, 56), M.brass({ scale: 0.6, rough: 0.2, tint: 0xfff0d0 }));
    bob.add(rim);
    const hub = new THREE.Mesh(discGeometry(def.bobR * 0.28, 0.75, 28), M.brass({ scale: 0.6, rough: 0.2 }));
    bob.add(hub);
    let saddle = null;
    if (def.ride) {
      saddle = new THREE.Mesh(M.worldBox(2.9, 0.16, 1.6), M.brass({ scale: 0.4, rough: 0.3 }));
      saddle.castShadow = true; saddle.receiveShadow = true;
      this.root.add(saddle);
      // two struts holding the saddle on the disc
      for (const sx of [-0.8, 0.8]) {
        const st = new THREE.Mesh(M.worldBox(0.12, 0.5, 0.12), rodMat);
        st.position.set(sx, def.bobR + 0.02 - 0.25, 0.75);
        bob.add(st);
      }
    }
    const surf = def.ride ? this.world.addOneway({ id: def.id, x0: 0, x1: 0, y: 0 }) : null;
    this.pendulums.push({
      def, group, arm, bob, saddle, surf,
      phi: def.phase || 0, theta: 0, omegaPhi: TAU / def.period,
      braked: false, x: def.px, y: def.py - def.len, vx: 0, vy: 0, lastSign: 0,
    });
  }

  // ---------------- levers (generated GLB split into base + handle)
  buildLever(def) {
    const group = new THREE.Group();
    group.position.set(def.x, def.y, def.vault ? -0.1 : 0.35);
    this.root.add(group);
    const H = 1.18;
    let handle;
    let knobMat = null;
    if (this.leverModel) {
      const lm = this.leverModel;
      knobMat = knobTintMaterial(lm.material, def.knob);
      const base = new THREE.Mesh(lm.baseG, knobMat);
      base.scale.setScalar(H);
      base.castShadow = true; base.receiveShadow = true;
      group.add(base);
      handle = new THREE.Group();
      handle.position.y = lm.pivot * H;
      const hm = new THREE.Mesh(lm.handleG, knobMat);
      hm.scale.setScalar(H);
      hm.castShadow = true;
      handle.add(hm);
      group.add(handle);
    } else {
      handle = new THREE.Group();
      group.add(handle);
    }
    const lever = {
      def, id: def.id, x: def.x, y: def.y, group, handle, knobMat,
      heldBy: null, angle: 0.55, glow: 0, pulse: 0,
    };
    handle.rotation.z = lever.angle;
    this.levers.set(def.id, lever);
  }

  isHeld(id) { const l = this.levers.get(id); return !!(l && l.heldBy); }
  anyHeld(ids) { return ids.some((id) => this.isHeld(id)); }

  // ---------------- portcullis gate
  buildGate(def) {
    const surf = this.world.addBox({ id: def.id, x0: def.x0, x1: def.x1, y0: def.yClosed, y1: def.yClosed + def.h });
    const group = new THREE.Group();
    const mat = M.brass({ scale: 0.5, rough: 0.34, tint: 0xd8c09a });
    const depth = PLAY_DEPTH + 0.4;
    const bars = 7;
    for (let i = 0; i < bars; i++) {
      const z = -depth / 2 + (i + 0.5) * depth / bars;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, def.h + 0.6, 10), mat);
      bar.position.set(0, def.h / 2 + 0.2, z);
      bar.castShadow = true;
      group.add(bar);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 10), mat);
      spike.position.set(0, -0.12, z);
      spike.rotation.x = Math.PI;
      group.add(spike);
    }
    for (let j = 0; j < 4; j++) {
      const cross = new THREE.Mesh(M.worldBox(0.16, 0.14, depth), mat);
      cross.position.set(0, 0.35 + j * (def.h / 3.3), 0);
      cross.castShadow = true;
      group.add(cross);
    }
    group.position.set((def.x0 + def.x1) / 2, def.yClosed, 0);
    this.root.add(group);
    this.gates.push({ def, surf, group, open: 0, wasOpen: false });
  }

  // ---------------- rising gear bridge
  buildBridge(def) {
    const surf = this.world.addOneway({ id: def.id, x0: def.cx - def.r * 0.97, x1: def.cx + def.r * 0.97, y: def.yDown });
    const thick = 0.55;
    const geo = gearGeometry({ r: def.r, thick, spokes: 5 }).clone();
    geo.rotateX(-Math.PI / 2);
    const group = new THREE.Group();
    const gear = new THREE.Mesh(geo, M.brass({ scale: 0.24, rough: 0.28 }));
    gear.position.y = -thick / 2;
    gear.castShadow = true; gear.receiveShadow = true;
    group.add(gear);
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 30, 24), M.brass({ scale: 0.8, rough: 0.35, tint: 0xb08e60 }));
    screw.position.y = -thick - 15;
    screw.castShadow = true;
    group.add(screw);
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.75, 0.22, 24), M.brass({ scale: 0.5, rough: 0.22 }));
    boss.position.y = 0.05;
    group.add(boss);
    group.position.set(def.cx, def.yDown, 0);
    this.root.add(group);
    this.bridges.push({ def, surf, group, gear, y: def.yDown, vy: 0, wasMoving: false });
  }

  // ---------------- vault (generated round door) + treasure (generated GLB)
  buildVault(assets) {
    const v = LEVEL.vault;
    const group = new THREE.Group();
    group.position.set(v.x, v.y, -2.9);
    this.root.add(group);
    // stone surround
    const ring = new THREE.Mesh(new THREE.TorusGeometry(v.r + 0.18, 0.32, 16, 64), M.brass({ scale: 0.5, rough: 0.25 }));
    ring.castShadow = true;
    group.add(ring);
    // dark recess behind the door, lit gold when opened
    const recess = new THREE.Mesh(new THREE.CylinderGeometry(v.r, v.r * 0.85, 2.2, 48, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x2a1a0c, roughness: 0.8, side: THREE.BackSide, map: null }));
    recess.rotation.x = Math.PI / 2;
    recess.position.z = -1.1;
    group.add(recess);
    const back = new THREE.Mesh(new THREE.CircleGeometry(v.r * 0.86, 48), new THREE.MeshStandardMaterial({ color: 0x3a2410, roughness: 0.6, metalness: 0.4 }));
    back.position.z = -2.15;
    group.add(back);
    // door: cylinder with the generated door art on its front cap
    const hinge = new THREE.Group();
    hinge.position.set(v.r, 0, 0.25);
    group.add(hinge);
    const doorMatFront = new THREE.MeshStandardMaterial({
      map: assets.tex.vault, metalness: 0.9, roughness: 0.32, envMapIntensity: 1.3,
    });
    const doorMatSide = M.brass({ scale: 0.6, rough: 0.3 });
    const doorGeo = new THREE.CylinderGeometry(v.r, v.r, 0.5, 64);
    doorGeo.rotateX(Math.PI / 2);
    const door = new THREE.Mesh(doorGeo, [doorMatSide, doorMatFront, doorMatSide]);
    door.position.set(-v.r, 0, 0);
    door.castShadow = true;
    hinge.add(door);
    // the treasure
    let treasure = null;
    const tg = assets.models.treasure;
    if (tg) {
      treasure = new THREE.Group();
      const model = tg.scene.clone(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const s = 1.5 / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(s);
      const c = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
      model.position.set(-c.x, -c.y, -c.z);
      model.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (o.material) { o.material = o.material.clone(); o.material.envMapIntensity = 1.6; o.material.emissive = new THREE.Color(0x3a1004); } } });
      treasure.add(model);
    } else {
      treasure = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0x801008, metalness: 0.2, roughness: 0.1 }));
    }
    treasure.position.set(v.x, v.y, -3.6);
    this.root.add(treasure);
    const glow = new THREE.PointLight(0xffb060, 0, 7, 1.8);
    glow.position.set(v.x, v.y, -2.4);
    this.root.add(glow);
    this.vault = { def: v, group, hinge, door, treasure, glow, open: 0, opened: false, taken: false, home: new THREE.Vector3(v.x, v.y, -3.6) };
  }

  // ---------------- gems (generated GLB, instanced)
  buildGems(assets) {
    let geo, mat;
    const gg = assets.models.gem;
    if (gg) {
      const { geometry, material, box } = bakeModel(gg);
      const size = box.getSize(new THREE.Vector3());
      const s = 0.42 / Math.max(size.x, size.y, size.z);
      geo = geometry.clone();
      const c = box.getCenter(new THREE.Vector3());
      geo.translate(-c.x, -c.y, -c.z);
      geo.scale(s, s, s);
      geo.computeVertexNormals();
      mat = new THREE.MeshStandardMaterial({
        map: material.map || null, color: 0xe8f6ff, metalness: 0.35, roughness: 0.06,
        envMapIntensity: 3.0, emissive: 0x4a90c8, emissiveIntensity: 0.55, flatShading: true,
      });
    } else {
      geo = new THREE.OctahedronGeometry(0.2);
      mat = new THREE.MeshStandardMaterial({ color: 0xcfefff, emissive: 0x3070a0, metalness: 0.4, roughness: 0.05 });
    }
    const n = LEVEL.gems.length;
    const inst = new THREE.InstancedMesh(geo, mat, n);
    inst.castShadow = false;
    inst.frustumCulled = false;
    this.root.add(inst);
    this.gemMesh = inst;
    this.gems = LEVEL.gems.map(([x, y], i) => ({ i, x, y, taken: false, t: 0, phase: i * 1.7 }));
    // soft halo behind each gem so they read from afar
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    hg.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(n), 1));
    this.gemHalo = new THREE.Points(hg, new THREE.ShaderMaterial({
      uniforms: { uMap: { value: M.dotTexture() }, uScale: { value: 600 } },
      vertexShader: 'attribute float aA; uniform float uScale; varying float vA; void main(){ vA = aA; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = 1.5 * uScale / -mv.z; }',
      fragmentShader: 'uniform sampler2D uMap; varying float vA; void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA; gl_FragColor = vec4(vec3(0.55, 0.8, 1.0) * a, a); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.gemHalo.frustumCulled = false;
    this.root.add(this.gemHalo);
    this.updateGemMatrices(0);
  }

  updateGemMatrices(t) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (const g of this.gems) {
      let sc = 1;
      let y = g.y + Math.sin(t * 2.2 + g.phase) * 0.12;
      if (g.taken) {
        g.t += 1 / 60;
        sc = Math.max(0, 1 - g.t * 3);
        y += g.t * 3;
      }
      e.set(0.25, t * 1.6 + g.phase, 0);
      q.setFromEuler(e);
      p.set(g.x, y, 0);
      s.setScalar(sc);
      m.compose(p, q, s);
      this.gemMesh.setMatrixAt(g.i, m);
      if (this.gemHalo) {
        this.gemHalo.geometry.attributes.position.setXYZ(g.i, g.x, y, -0.05);
        this.gemHalo.geometry.attributes.aA.setX(g.i, sc * (0.32 + 0.12 * Math.sin(t * 4 + g.phase)));
      }
    }
    this.gemMesh.instanceMatrix.needsUpdate = true;
    if (this.gemHalo) {
      this.gemHalo.geometry.attributes.position.needsUpdate = true;
      this.gemHalo.geometry.attributes.aA.needsUpdate = true;
      this.gemHalo.material.uniforms.uScale.value = window.innerHeight * 0.9;
    }
  }

  resetState() {
    for (const l of this.levers.values()) { l.heldBy = null; }
    for (const g of this.gems) { g.taken = false; g.t = 0; }
    for (const p of this.pendulums) { p.phi = p.def.phase || 0; p.braked = false; }
    for (const b of this.bridges) { b.y = b.def.yDown; }
    for (const g of this.gates) g.open = 0;
    const v = this.vault;
    v.open = 0; v.opened = false; v.taken = false; v.treasure.position.copy(v.home); v.treasure.visible = true;
    this.t = 0;
  }

  // ---------------------------------------------------------------- simulation
  /** Fixed-step update of every moving surface. t = sim time. */
  update(t, h) {
    this.t = t;
    // vertical gears
    for (const g of this.gears) {
      g.surf.omega = g.def.omega;
    }
    // movers: cosine oscillation starting at xa
    for (const m of this.movers) {
      const d = m.def;
      const mid = (d.xa + d.xb) / 2, half = (d.xb - d.xa) / 2, w = TAU / d.period;
      const x = mid - half * Math.cos(w * t);
      const vx = half * w * Math.sin(w * t);
      m.x = x;
      Object.assign(m.surf, { x0: x - d.w / 2, x1: x + d.w / 2, y: d.y, vx, vy: 0 });
    }
    // pendulums (phase-driven; a held brake lever parks the bob at the end of its swing)
    for (const p of this.pendulums) {
      const d = p.def;
      const brake = d.brakeBy ? this.anyHeld(d.brakeBy) : false;
      const prevTheta = p.theta;
      if (h > 0) {
        if (brake) {
          // keep swinging until the next extreme, then hold
          const c = Math.cos(p.phi);
          const atExtreme = Math.abs(Math.sin(p.phi)) > 0.995;
          if (!atExtreme) {
            const next = p.phi + p.omegaPhi * h;
            if (Math.sign(Math.cos(next)) !== Math.sign(c) && c !== 0) {
              // crossed an extreme this step: snap to it
              p.phi = Math.round((next - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
            } else p.phi = next;
          }
        } else p.phi += p.omegaPhi * h;
      }
      if (brake !== p.braked) { this.events.push({ type: brake ? 'brake' : 'unbrake', x: d.px, y: d.py - d.len }); p.braked = brake; }
      p.theta = d.amp * Math.sin(p.phi);
      const dTheta = h > 0 ? (p.theta - prevTheta) / h : 0;
      p.x = d.px + d.len * Math.sin(p.theta);
      p.y = d.py - d.len * Math.cos(p.theta);
      p.vx = d.len * Math.cos(p.theta) * dTheta;
      p.vy = d.len * Math.sin(p.theta) * dTheta;
      p.atExtreme = Math.abs(Math.sin(p.phi)) > 0.97;
      // whoosh cue when passing the bottom fast
      const sgn = Math.sign(p.theta);
      if (sgn !== p.lastSign && Math.abs(dTheta) > 0.3) this.events.push({ type: 'swoosh', x: p.x, y: p.y });
      p.lastSign = sgn;
      if (p.surf) {
        const top = p.y + d.bobR + 0.1;
        Object.assign(p.surf, { x0: p.x - 1.45, x1: p.x + 1.45, y: top, vx: p.vx, vy: p.vy });
      }
    }
    // gates: open while any of their levers is held
    for (const g of this.gates) {
      const want = this.anyHeld(g.def.by) ? 1 : 0;
      const speed = want ? 1.4 : 0.9;
      const prev = g.open;
      g.open = THREE.MathUtils.clamp(g.open + Math.sign(want - g.open) * speed * h, 0, 1);
      if ((g.open > prev && prev === 0) || (g.open < prev && prev === 1)) this.events.push({ type: 'gate', x: g.def.x0, y: g.def.yClosed + 1.5 });
      const lift = g.open * (g.def.h + 0.2);
      Object.assign(g.surf, { y0: g.def.yClosed + lift, y1: g.def.yClosed + g.def.h + lift, active: g.open < 0.92 });
    }
    // bridges: rise while a lever is held
    for (const b of this.bridges) {
      const up = this.anyHeld(b.def.by);
      const target = up ? b.def.yUp : b.def.yDown;
      const speed = up ? 5.5 : 3.2;
      const prev = b.y;
      if (Math.abs(target - b.y) > 1e-4) b.y += THREE.MathUtils.clamp(target - b.y, -speed * h, speed * h);
      b.vy = h > 0 ? (b.y - prev) / h : 0;
      const moving = Math.abs(b.vy) > 0.01;
      if (moving && !b.wasMoving) this.events.push({ type: 'bridge', x: b.def.cx, y: b.y });
      b.wasMoving = moving;
      Object.assign(b.surf, { y: b.y, vx: 0, vy: b.vy });
    }
    // vault
    const v = this.vault;
    if (!v.opened && this.anyAllHeld(v.def.levers)) {
      v.opened = true;
      this.events.push({ type: 'vault', x: v.def.x, y: v.def.y });
    }
    if (v.opened) v.open = Math.min(1, v.open + h * 0.45);
  }

  anyAllHeld(ids) { return ids.every((id) => this.isHeld(id)); }

  /** Per-frame visual sync (rotation of gears, lever handles...). */
  updateVisual(dt, time) {
    const t = this.t;
    for (const g of this.gears) g.mesh.rotation.z = g.phase + g.def.omega * t;
    for (const f of this.flatGears) f.mesh.rotation.y = f.def.spin * t;
    for (const m of this.movers) {
      m.mesh.position.set(m.x, m.def.y + 0.04, 0);
      m.carriage.position.set(m.x, m.def.y - 0.55, -1.2);
    }
    for (const p of this.pendulums) {
      p.arm.rotation.z = p.theta;
      if (p.saddle) p.saddle.position.set(p.x, p.y + p.def.bobR + 0.02, 0);
    }
    for (const g of this.gates) g.group.position.y = g.def.yClosed + g.open * (g.def.h + 0.2);
    for (const b of this.bridges) {
      b.group.position.y = b.y;
      b.gear.rotation.y += (b.vy * 0.35 + 0.08) * dt;
    }
    for (const l of this.levers.values()) {
      const target = l.heldBy ? -0.55 : 0.55;
      l.angle += (target - l.angle) * Math.min(1, dt * (l.heldBy ? 14 : 7));
      l.handle.rotation.z = l.angle;
      // vault levers pulse while waiting for a hand; held levers glow
      const isVaultWaiting = l.def.vault && !this.vault.opened && !l.heldBy;
      const glowTarget = l.heldBy ? 1.6 : (isVaultWaiting || l.hint) ? 0.7 + 0.6 * Math.sin(time * 6) : 0;
      l.hint = false;
      l.glow += (glowTarget - l.glow) * Math.min(1, dt * 8);
      if (l.knobMat) l.knobMat.userData.glow.value = Math.max(0, l.glow);
    }
    // vault door swing + treasure
    const v = this.vault;
    const e = v.open < 0.35 ? 0 : THREE.MathUtils.smootherstep((v.open - 0.35) / 0.65, 0, 1);
    v.door.rotation.z = -Math.min(1, v.open / 0.35) * Math.PI * 1.5; // unscrew first
    v.hinge.rotation.y = -e * 1.85;
    v.glow.intensity = e * 6;
    if (!v.taken) {
      const tz = -3.6 + e * 3.6;
      v.treasure.position.set(v.def.x, v.def.y - e * 1.9 + Math.sin(time * 2) * 0.12 * e, tz);
      v.treasure.rotation.y = time * 0.9;
    }
    this.updateGemMatrices(time);
  }

  /** Treasure position for pickups (only once the door is open). */
  treasureReachable() { return this.vault.opened && this.vault.open > 0.95 && !this.vault.taken; }
}
