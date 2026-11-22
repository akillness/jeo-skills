// Scenery: far backplate, the giant clock, galleries, background/foreground gears,
// light shafts and drifting dust. Nothing here collides; it only sells the tower.
import * as THREE from 'three';
import { LEVEL } from './levelData.js';
import { gearGeometry } from './gears.js';
import * as M from './materials.js';

const TAU = Math.PI * 2;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const ShaftShader = {
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xffd9a0) }, uAlpha: { value: 0.22 }, uMap: { value: null }, uUseMap: { value: 0 } },
  vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `
    uniform float uTime; uniform vec3 uColor; uniform float uAlpha; uniform sampler2D uMap; uniform float uUseMap;
    varying vec2 vUv; varying vec3 vW;
    float h(float n){ return fract(sin(n) * 43758.5453); }
    float noise(float x){ float i = floor(x); float f = fract(x); return mix(h(i), h(i + 1.0), smoothstep(0.0, 1.0, f)); }
    void main(){
      float flick0 = 0.85 + 0.15 * sin(uTime * 0.7 + vW.x * 0.05);
      if (uUseMap > 0.5) {
        vec3 m = texture2D(uMap, vUv).rgb;
        float l = dot(m, vec3(0.333));
        float shimmer = 0.85 + 0.15 * noise(vUv.x * 30.0 + uTime * 0.3);
        float a0 = l * uAlpha * 4.2 * flick0 * shimmer * smoothstep(0.0, 0.18, vUv.y);
        gl_FragColor = vec4(uColor * a0, a0);
        return;
      }
      float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
      float along = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
      float streak = 0.55 + 0.45 * noise(vUv.x * 9.0 + uTime * 0.15) * noise(vUv.x * 23.0 - uTime * 0.1 + 4.0);
      float flick = 0.85 + 0.15 * sin(uTime * 0.7 + vW.x * 0.05);
      float a = edge * along * streak * flick * uAlpha;
      vec3 col = uColor;
      if (uUseMap > 0.5) { vec3 m = texture2D(uMap, vec2(vUv.x, vUv.y)).rgb; a *= 0.6 + 0.8 * dot(m, vec3(0.33)); }
      gl_FragColor = vec4(col * a, a);
    }`,
};

const DustShader = {
  uniforms: { uTime: { value: 0 }, uMap: { value: null }, uScale: { value: 300 } },
  vertexShader: `
    attribute float aSize; attribute float aSeed;
    uniform float uTime; uniform float uScale;
    varying float vA;
    void main(){
      vec3 p = position;
      p.x += sin(uTime * 0.31 + aSeed * 6.0) * 0.6;
      p.y += sin(uTime * 0.23 + aSeed * 9.0) * 0.4 + cos(uTime * 0.11 + aSeed) * 0.3;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize * uScale / -mv.z;
      vA = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (0.6 + aSeed) + aSeed * 20.0));
    }`,
  fragmentShader: `
    uniform sampler2D uMap; varying float vA;
    void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * t.a * vA * 0.55, t.a * vA * 0.55); }`,
};

export class Decor {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.spinners = []; // {mesh, axis:'z'|'y', speed}
    this.shafts = [];
  }

  build(assets) {
    const tex = assets.tex;
    this.buildBackplate(tex);
    this.buildClock(tex);
    this.buildHalls(tex);
    this.buildTowerStructure();
    this.buildTowerGears();
    this.buildForeground();
    this.buildShafts(tex);
    this.buildDust();
  }

  // ------------------------------------------------ far background (camera-parallaxed)
  buildBackplate(tex) {
    if (!tex.backplate) return;
    const H = 104, W = H * (tex.backplate.image.width / tex.backplate.image.height);
    const mat = new THREE.MeshBasicMaterial({ map: tex.backplate, fog: false, color: 0xe2d2b8, depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
    m.renderOrder = -10;
    m.position.z = -100;
    this.root.add(m);
    this.backplate = m;
    // aerial-perspective haze veil in front of the far plate (warm, sunlit dust)
    const haze = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uC: { value: new THREE.Color(0xc8a878) }, uA: { value: 0.16 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uC; uniform float uA; varying vec2 vUv; void main(){ float a = uA * (0.75 + 0.5 * smoothstep(0.2, 0.9, vUv.x)) * (0.8 + 0.3 * vUv.y); gl_FragColor = vec4(uC, a); }',
    }));
    haze.renderOrder = -9;
    haze.position.z = -98;
    this.root.add(haze);
    this.haze = haze;
  }

  buildClock(tex) {
    const g = new THREE.Group();
    const R = 10.5;
    const faceMat = new THREE.MeshBasicMaterial({ map: tex.clock, color: 0xf0e2c4, fog: true });
    const face = new THREE.Mesh(new THREE.CircleGeometry(R, 96), faceMat);
    g.add(face);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.15, 0.45, 16, 120), M.brass({ scale: 0.25, rough: 0.3 }));
    g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(R + 1.2, 0.25, 12, 120), M.brass({ scale: 0.25, rough: 0.35, tint: 0xc8a878 }));
    ring2.position.z = -0.3;
    g.add(ring2);
    // hands (generated cut-outs), pivot near the bottom ring of each image
    const mkHand = (t, len, pivotV) => {
      const asp = t.image.width / t.image.height;
      const geo = new THREE.PlaneGeometry(len * asp, len);
      geo.translate(0, len * (0.5 - pivotV), 0);
      const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.35, color: 0x9a8a78, fog: true, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      return m;
    };
    if (tex.handHour) { this.hourHand = mkHand(tex.handHour, R * 0.62, 0.075); this.hourHand.position.z = 0.12; g.add(this.hourHand); }
    if (tex.handMinute) { this.minHand = mkHand(tex.handMinute, R * 0.88, 0.06); this.minHand.position.z = 0.2; g.add(this.minHand); }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 24), M.brass({ scale: 0.5, rough: 0.2 }));
    cap.rotation.x = Math.PI / 2; cap.position.z = 0.3;
    g.add(cap);
    g.position.set(60, 10, -46);
    this.root.add(g);
    this.clock = g;
    // back-light glow so the dial reads as translucent glass lit by daylight
    const glow = new THREE.Mesh(new THREE.CircleGeometry(R * 1.55, 64), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uC: { value: new THREE.Color(0xffd8a0) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uC; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.62, d) * 0.22; gl_FragColor = vec4(uC * a, a); }',
    }));
    glow.position.z = -0.6;
    g.add(glow);
  }

  // ------------------------------------------------ wood-panelled galleries
  buildHalls(tex) {
    this.halls = LEVEL.halls;
    this.candles = [];
    LEVEL.halls.forEach((h, hi) => {
      const height = h.ceilY - h.floorY + 1.2;
      const width = h.x1 - h.x0;
      if (tex.hall) {
        const t = tex.hall.clone();
        t.wrapS = THREE.MirroredRepeatWrapping;
        const tileW = height * (tex.hall.image.width / tex.hall.image.height);
        t.repeat.set(width / tileW, 1);
        t.needsUpdate = true;
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, metalness: 0.0, envMapIntensity: 0.5, color: 0xffffff }));
        wall.position.set((h.x0 + h.x1) / 2, h.floorY + height / 2 - 0.4, -3.8);
        wall.receiveShadow = true;
        this.root.add(wall);
        // candles from the panelling art: sconces sit at u≈0.265 / 0.729, v≈0.51 of each tile
        const us = [0.265, 0.729];
        for (let k = 0; k * tileW < width; k++) {
          for (const u0 of us) {
            const u = k % 2 === 0 ? u0 : 1 - u0; // mirrored tiles
            const x = h.x0 + (k + u) * tileW;
            if (x > h.x1 - 0.5) continue;
            this.candles.push({ x, y: h.floorY - 0.4 + height * 0.535, z: -3.55, hall: hi });
          }
        }
      }
      // ceiling + beams
      const ceil = new THREE.Mesh(M.worldBox(width + 2, 1.0, 7), M.wood({ scale: 0.3, tint: 0x6a4a34 }));
      ceil.position.set((h.x0 + h.x1) / 2, h.ceilY + 0.5, -0.8);
      ceil.receiveShadow = true;
      this.root.add(ceil);
      for (let x = h.x0 + 1.5; x < h.x1; x += 4.2) {
        const beam = new THREE.Mesh(M.worldBox(0.55, 0.7, 7.2), M.wood({ scale: 0.3, tint: 0x5a3c28 }));
        beam.position.set(x, h.ceilY - 0.3, -0.6);
        beam.castShadow = true;
        this.root.add(beam);
      }
      // dark timber frame where the gallery opens onto the tower
      const openEdge = hi === 0 ? h.x1 : h.x0;
      const post = new THREE.Mesh(M.worldBox(1.3, h.ceilY - h.floorY + 22, 2.2), M.wood({ scale: 0.3, tint: 0x3e2a1c }));
      post.position.set(openEdge + (hi === 0 ? 0.65 : -0.65), h.floorY + (h.ceilY - h.floorY + 22) / 2 - 12, -2.6);
      post.castShadow = true;
      this.root.add(post);
    });
    // candle lights + flames (a light per two sconces keeps the shader light count low)
    const flameMat = new THREE.SpriteMaterial({ map: M.dotTexture(), color: 0xffb35a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flames = [];
    this.candles.forEach((c, i) => {
      const s = new THREE.Sprite(flameMat);
      s.position.set(c.x, c.y + 0.2, c.z + 0.1);
      s.scale.set(0.7, 0.9, 1);
      this.root.add(s);
      this.flames.push({ s, seed: i * 1.3 });
      if (i % 2 === 0) {
        const L = new THREE.PointLight(0xff9a48, 14, 13, 1.7);
        L.position.set(c.x, c.y + 0.3, -1.6);
        this.root.add(L);
        c.light = L;
      }
    });
  }

  hallFactor(x) {
    let f = 0;
    for (const h of LEVEL.halls) {
      const a = THREE.MathUtils.smoothstep(x, h.x0 - 6, h.x0 + 4);
      const b = 1 - THREE.MathUtils.smoothstep(x, h.x1 - 4, h.x1 + 6);
      f = Math.max(f, Math.min(a, b));
    }
    return f;
  }

  // ------------------------------------------------ structure: columns, girders, back wall
  buildTowerStructure() {
    const r = rng(7);
    const x0 = 20, x1 = 186;
    // back wall of the shaft (stone) far behind the gears
    for (let x = x0 + 8; x < x1; x += 21 + r() * 8) {
      const col = new THREE.Mesh(M.worldBox(1.6, 70, 1.6), M.wood({ scale: 0.25, tint: 0x4a3222 }));
      col.position.set(x, 4, -12 - r() * 8);
      col.castShadow = true;
      this.root.add(col);
      const girder = new THREE.Mesh(M.worldBox(14 + r() * 8, 0.8, 0.8), M.brass({ scale: 0.3, rough: 0.45, tint: 0x9a7a50 }));
      girder.position.set(x + 5, 15 + r() * 8, col.position.z + 1);
      this.root.add(girder);
    }
  }

  // ------------------------------------------------ background gear forest
  addGear(x, y, z, r, speed, opts = {}) {
    const geo = gearGeometry({ r, thick: opts.thick ?? Math.max(0.5, r * 0.18), spokes: opts.spokes ?? (r > 2.2 ? 6 : 5), style: opts.style ?? 'spoked' });
    let mesh;
    if (opts.flat) {
      const g2 = geo.clone(); g2.rotateX(-Math.PI / 2);
      mesh = new THREE.Mesh(g2, opts.mat || M.brass({ scale: 0.2, rough: 0.34 }));
    } else mesh = new THREE.Mesh(geo, opts.mat || M.brass({ scale: 0.2, rough: 0.34 }));
    mesh.position.set(x, y, z);
    mesh.rotation[opts.flat ? 'y' : 'z'] = opts.phase ?? 0;
    mesh.castShadow = opts.cast ?? (z > -9);
    mesh.receiveShadow = z > -9;
    this.root.add(mesh);
    this.spinners.push({ mesh, axis: opts.flat ? 'y' : 'z', speed });
    if (!opts.flat && !opts.noAxle) {
      const ax = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.08 + 0.12, r * 0.08 + 0.12, 6, 14), M.brass({ scale: 0.4, rough: 0.45, tint: 0xa08060 }));
      ax.rotation.x = Math.PI / 2;
      ax.position.set(x, y, z - 3);
      this.root.add(ax);
    }
    return mesh;
  }

  /** Add a gear meshing with `parent` at angle a (keeps teeth interlocked). */
  addMeshing(parent, pr, a, r, z, speedParent, mat) {
    const teethP = Math.max(10, Math.round(pr * 6.2));
    const teethC = Math.max(10, Math.round(r * 6.2));
    const d = pr + r - Math.min(0.55, 0.11 * pr + 0.08) * 0.5 - Math.min(0.55, 0.11 * r + 0.08) * 0.5;
    const x = parent.position.x + Math.cos(a) * d, y = parent.position.y + Math.sin(a) * d;
    const speed = -speedParent * pr / r;
    const phaseP = parent.rotation.z;
    // tooth of the parent pointing along a at t=0 -> gap of the child facing back
    const k = Math.round((a - phaseP) / (TAU / teethP) - 0.5);
    const parentToothAngle = phaseP + (k + 0.5) * TAU / teethP;
    const phase = a + Math.PI + (parentToothAngle - a) * (-pr / r);
    return this.addGear(x, y, z, r, speed, { phase, mat, cast: z > -9 });
  }

  buildTowerGears() {
    const r = rng(42);
    const sizes = [1.6, 2.2, 3.0, 4.0, 5.2, 6.6];
    const dark = M.brass({ scale: 0.18, rough: 0.42, tint: 0x8a7458, key: 'dark' });
    // hand-placed hero gears near the play plane (behind it) echoing the video
    const heroes = [
      [26, 6.5, -4.5, 3.0, 0.3], [40, 9.5, -6, 4.0, -0.22], [58, 7.5, -5, 2.2, 0.5], [66, -6.5, -3.6, 5.2, -0.16],
      [79, 10, -7, 5.2, 0.14], [96, -5.5, -4.2, 3.0, 0.35], [113, 15, -8, 4.0, -0.2], [125, -1.5, -5.5, 4.0, 0.18],
      [146, 14, -7, 5.2, -0.15], [150, -3, -5, 3.0, 0.3], [166, 15, -6.5, 4.0, 0.2], [178, -2.2, -4.6, 4.0, -0.25],
    ];
    const heroMat = M.brass({ scale: 0.2, rough: 0.36, tint: 0xb89a74, key: 'hero' });
    for (const [x, y, z, rad, sp] of heroes) {
      const g = this.addGear(x, y, z, rad, sp, { phase: r() * TAU, mat: heroMat });
      if (r() < 0.75) this.addMeshing(g, rad, r() * TAU, sizes[Math.floor(r() * 3)], z, sp, heroMat);
    }
    // deeper layers
    for (let x = 18; x < 190; x += 5 + r() * 6) {
      const z = -10 - r() * 14;
      const rad = sizes[Math.floor(r() * sizes.length)];
      const y = -10 + r() * 30;
      const sp = (r() < 0.5 ? -1 : 1) * (0.06 + r() * 0.25) / Math.sqrt(rad);
      const g = this.addGear(x, y, z, rad, sp, { mat: dark, phase: r() * TAU, cast: false });
      if (r() < 0.5) this.addMeshing(g, rad, r() * TAU, sizes[Math.floor(r() * 4)], z, sp, dark);
    }
    // flat gears stacked on shafts in the mid ground (like the video's turntables)
    for (let x = 30; x < 185; x += 26 + r() * 10) {
      const z = -7 - r() * 5;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 40, 12), M.brass({ scale: 0.3, rough: 0.45, tint: 0xa08060 }));
      shaft.position.set(x, 0, z);
      this.root.add(shaft);
      const n = 2 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        this.addGear(x, -12 + i * 4.5 + r() * 2, z, sizes[1 + Math.floor(r() * 3)], (r() < 0.5 ? -1 : 1) * 0.25, { flat: true, thick: 0.45, phase: r() * TAU });
      }
    }
  }

  buildForeground() {
    const mat = M.brass({ scale: 0.16, rough: 0.38, tint: 0x9a7448, key: 'fg' });
    const spots = [[24, -8.6, 5.0, 6.6, 0.12], [47, -8.2, 5.6, 5.2, -0.15], [70, -7.4, 5.2, 4.0, 0.18], [96, -4.6, 5.2, 6.6, 0.1], [121, -2.8, 6.0, 5.2, -0.12], [149, -3.5, 5.0, 6.6, 0.1], [173, -1.8, 5.4, 4.0, -0.2]];
    for (const [x, y, z, rad, sp] of spots) this.addGear(x, y, z, rad, sp, { mat, cast: false, noAxle: true, thick: 1.0 });
  }

  // ------------------------------------------------ light shafts + dust
  buildShafts(tex) {
    const r = rng(99);
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
    geo.translate(0, -0.5, 0); // origin at the top (window)
    for (let x = 22; x < 190; x += 9 + r() * 9) {
      const mat = new THREE.ShaderMaterial({
        ...ShaftShader,
        uniforms: THREE.UniformsUtils.clone(ShaftShader.uniforms),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      if (tex.rays) { mat.uniforms.uMap.value = tex.rays; mat.uniforms.uUseMap.value = 1; }
      const z = -3 - r() * 16;
      mat.uniforms.uAlpha.value = 0.1 + r() * 0.12 + (z < -10 ? 0.05 : 0);
      const m = new THREE.Mesh(geo, mat);
      const w = (tex.rays ? 9 : 3) + r() * 7, len = 46 + r() * 12;
      m.scale.set(w, len, 1);
      m.position.set(x + 14, 26 + r() * 6, z);
      m.rotation.z = -0.62 - r() * 0.12; // falling down-left from the windows (upper right)
      m.renderOrder = 5;
      this.root.add(m);
      this.shafts.push(m);
    }
  }

  buildDust() {
    const N = 900;
    const pos = new Float32Array(N * 3), size = new Float32Array(N), seed = new Float32Array(N);
    const r = rng(5);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (r() - 0.5) * 60; pos[i * 3 + 1] = (r() - 0.5) * 30; pos[i * 3 + 2] = -10 + r() * 18;
      size[i] = 0.05 + r() * 0.16; seed[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({ ...DustShader, uniforms: THREE.UniformsUtils.clone(DustShader.uniforms), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    mat.uniforms.uMap.value = M.dotTexture();
    this.dust = new THREE.Points(g, mat);
    this.dust.frustumCulled = false;
    this.root.add(this.dust);
    this.dustBase = pos.slice();
  }

  // ------------------------------------------------ per frame
  update(dt, time, camera, clockFrac) {
    const cx = camera.position.x, cy = camera.position.y;
    if (this.backplate) {
      this.backplate.position.x = cx * 0.86 + 14;
      this.backplate.position.y = cy * 0.55 + 14;
      this.haze.position.x = this.backplate.position.x;
      this.haze.position.y = this.backplate.position.y;
    }
    if (this.clock) {
      this.clock.position.x = 100 + (cx - 100) * 0.8;
      this.clock.position.y = cy * 0.7 + 9.5;
      // 11:50 -> 12:00 over the heist (minute hand from 50 to 60)
      const minutes = 50 + clockFrac * 10;
      if (this.minHand) this.minHand.rotation.z = -minutes / 60 * TAU;
      if (this.hourHand) this.hourHand.rotation.z = -((11 + minutes / 60) / 12) * TAU;
    }
    for (const s of this.spinners) s.mesh.rotation[s.axis] += s.speed * dt;
    for (const sh of this.shafts) sh.material.uniforms.uTime.value = time;
    // dust follows the camera, wrapping around it
    if (this.dust) {
      this.dust.material.uniforms.uTime.value = time;
      const p = this.dust.geometry.attributes.position;
      const base = this.dustBase;
      for (let i = 0; i < p.count; i++) {
        let x = base[i * 3] + time * 0.15;
        x = ((x - cx) % 60 + 90) % 60 - 30 + cx;
        let y = base[i * 3 + 1] + Math.sin(time * 0.05 + i) * 0.5;
        y = ((y - cy) % 30 + 45) % 30 - 15 + cy;
        p.setXYZ(i, x, y, base[i * 3 + 2]);
      }
      p.needsUpdate = true;
      this.dust.material.uniforms.uScale.value = window.innerHeight * 0.9;
    }
    // candle flicker
    if (this.flames) for (const f of this.flames) {
      const k = 0.85 + 0.15 * Math.sin(time * 11 + f.seed) * Math.sin(time * 7.3 + f.seed * 2);
      f.s.scale.set(0.6 * k, 0.85 * k, 1);
    }
    if (this.candles) for (const c of this.candles) if (c.light) c.light.intensity = 14 * (0.85 + 0.15 * Math.sin(time * 9 + c.x));
  }
}
