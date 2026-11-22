import * as THREE from 'three';
import { U, BEND, NOISE, TERRAIN, PROJECT_BEND, patchBend } from './shaders.js';
import { terrainH, rng } from './noise.js';

// ---------------------------------------------------------------- sky + painted mountains (camera layers)
export function createBackdrop(camera, tex) {
  const group = new THREE.Group();
  camera.add(group);

  // Night sky of the reference: deep slate-navy gradient, crisp pin-point stars, a big pale moon
  // with a soft halo. The painted sky texture only provides the moon disc (its craters).
  tex.sky.generateMipmaps = true; tex.sky.minFilter = THREE.LinearMipmapLinearFilter;
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: tex.sky }, uRect: { value: new THREE.Vector4(0.08, 0.22, 0.74, 0.78) }, uDawn: U.uDawn, uTime: U.uTime,
      uMoon: { value: new THREE.Vector3(0.2695, 0.7704, 51.0) }, uTexSize: { value: new THREE.Vector2(2048, 1152) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D uTex; uniform vec4 uRect; uniform float uDawn; uniform float uTime; uniform vec3 uMoon; uniform vec2 uTexSize; varying vec2 vUv;
      float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      void main(){
        vec2 uv = uRect.xy + vUv * uRect.zw;
        // gradient (linear values, graded later): slate navy at the top, lighter teal haze at the horizon
        float y = vUv.y;
        vec3 c = mix(vec3(0.040, 0.080, 0.120), vec3(0.016, 0.034, 0.060), smoothstep(0.30, 1.0, y));
        c = mix(vec3(0.11, 0.16, 0.20), c, smoothstep(0.05, 0.50, y));
        // moon (pixel distance in the texture)
        vec2 dp = (uv - uMoon.xy) * uTexSize;
        float dm = length(dp) / uMoon.z;
        vec3 mt = texture2D(uTex, uv, 1.6).rgb;   // mip bias: smooth the paper grain of the painting
        float ml = dot(mt, vec3(0.3, 0.55, 0.15));
        float disc = (1.0 - smoothstep(0.96, 1.02, dm)) * (1.0 - uDawn * 0.6);
        // (linear texture values: maria ~0.15, highlands ~0.45)
        vec3 moonCol = mix(vec3(0.46, 0.52, 0.52), vec3(1.42, 1.45, 1.34), smoothstep(0.14, 0.42, ml));
        c = mix(c, moonCol, disc);
        c += vec3(0.20, 0.26, 0.30) * exp(-max(dm - 1.0, 0.0) * 5.0) * (1.0 - disc) * 0.6;
        c += vec3(0.04, 0.06, 0.08) * exp(-max(dm - 1.0, 0.0) * 0.9) * (1.0 - disc);
        // pin-point stars, twinkling, fewer near the horizon
        vec2 sp = gl_FragCoord.xy / 7.0;
        vec2 cell = floor(sp);
        float h = hash(cell);
        vec2 o = vec2(hash(cell + 17.3), hash(cell + 41.7)) - 0.5;
        float d = length(fract(sp) - 0.5 - o * 0.5) * 7.0;
        float star = step(0.985, h) * (1.0 - smoothstep(0.35, 1.25 + 0.6 * fract(h * 57.0), d));
        float tw = 0.55 + 0.45 * sin(uTime * (1.5 + h * 3.0) + h * 80.0);
        c += vec3(1.6, 1.7, 1.8) * star * tw * smoothstep(0.25, 0.6, y) * (1.0 - disc) * (0.6 + 1.4 * fract(h * 131.0)) * (1.0 - uDawn);
        // dawn: warm the horizon, lift the sky
        vec3 dawnCol = mix(vec3(0.95, 0.55, 0.30), vec3(0.62, 0.36, 0.40), smoothstep(0.2, 0.55, y));
        dawnCol = mix(dawnCol, vec3(0.12, 0.14, 0.28), smoothstep(0.55, 1.0, y));
        c = mix(c, dawnCol * 0.55 + c * 0.4, uDawn * 0.9);
        gl_FragColor = vec4(c, 1.0);
      }`,
    depthWrite: false, depthTest: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), skyMat);
  sky.renderOrder = -100; sky.frustumCulled = false;
  group.add(sky);

  const mk = (t, tint, order, v0, v1, haze) => {
    t.wrapS = THREE.MirroredRepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: t }, uOff: { value: 0 }, uRep: { value: 1 }, uV: { value: new THREE.Vector2(v0, v1) }, uTint: { value: new THREE.Color().setRGB(...tint) }, uFog: { value: new THREE.Color(0x60758a) }, uHaze: { value: haze }, uDawn: U.uDawn },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D uTex; uniform float uOff; uniform float uRep; uniform vec2 uV; uniform vec3 uTint; uniform vec3 uFog; uniform float uHaze; uniform float uDawn; varying vec2 vUv;
        void main(){
          vec4 t = texture2D(uTex, vec2(vUv.x * uRep + uOff, mix(uV.x, uV.y, vUv.y)));
          t *= smoothstep(0.0, 0.22, vUv.y);
          // painted snow -> moonlit slate snow, rock bands -> deep teal-grey (flat, like the reference)
          float l = dot(t.rgb, vec3(0.3, 0.59, 0.11)) / max(t.a, 1e-3);
          // (texture values are linear here: painted snow ~0.5, rock bands ~0.1)
          vec3 rock = vec3(0.075, 0.110, 0.145), snow = vec3(0.40, 0.48, 0.55);
          vec3 c = mix(rock, snow, smoothstep(0.14, 0.42, l)) * uTint;
          float mist = 1.0 - smoothstep(0.0, 0.6, vUv.y);
          c = mix(c, uFog, clamp(mist * 0.7 + uHaze, 0.0, 1.0));
          c = mix(c, c * vec3(1.28, 0.96, 0.95) + vec3(0.05, 0.02, 0.01), uDawn * 0.8);
          gl_FragColor = vec4(c * t.a, t.a);
        }`,
      // kept in the opaque list (drawn right after the sky, before the 3D world) with premultiplied blending
      transparent: false, depthWrite: false, depthTest: false, fog: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    mesh.renderOrder = order; mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  const far = mk(tex.mtnFar, [0.92, 0.98, 1.04], -90, 0.28, 0.74, 0.45);
  const mid = mk(tex.mtnMid, [1.0, 1.0, 1.0], -80, 0.08, 0.72, 0.12);

  const api = {
    group, sky, far, mid,
    // screen-space bands (fractions of the frustum height, 0 = bottom) of the painted ranges
    bands: { far: [0.55, 1.0, 0.95], mid: [0.38, 0.86, 0.88] },
    layout(cam) {
      const D = 900;
      const h = 2 * D * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const w = h * cam.aspect;
      sky.position.set(0, 0, -D); sky.scale.set(w * 1.06, h * 1.06, 1);
      // keep the sky texture aspect: visible uv width follows the screen aspect
      const texAspect = 2048 / 1152;
      const vh = 0.5, vw = Math.min(0.95, vh * (cam.aspect / texAspect));
      skyMat.uniforms.uRect.value.set(Math.max(0.0, 0.264 - 0.25 * vw), 0.766 - 0.88 * vh, vw, vh);
      // mountain bands, positioned in screen space (fractions of the frustum height)
      const band = (mesh, z, y0, y1, rep) => {
        const hh = 2 * z * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
        const ww = hh * cam.aspect * 1.08;
        const yA = (y0 - 0.5) * hh, yB = (y1 - 0.5) * hh;
        mesh.position.set(0, (yA + yB) / 2, -z);
        mesh.scale.set(ww, yB - yA, 1);
        mesh.material.uniforms.uRep.value = rep * cam.aspect / (16 / 9);
      };
      band(far, 880, ...this.bands.far);
      band(mid, 860, ...this.bands.mid);
    },
    update(scroll, camX) {
      far.material.uniforms.uOff.value = (scroll * 0.00012 + camX * 0.0004);
      mid.material.uniforms.uOff.value = (scroll * 0.00045 + camX * 0.0012);
    },
  };
  return api;
}

// ---------------------------------------------------------------- terrain (GPU displaced, scrolling)
function terrainGeometry() {
  const xs = []; for (let x = -175; x <= 235; x += 1.25) xs.push(x);
  const zs = [];
  for (let z = -175; z < -24; z += 2.5) zs.push(z);
  for (let z = -24; z < -4; z += 1.0) zs.push(z);
  for (let z = -4; z < 4; z += 0.4) zs.push(z);
  for (let z = 4; z < 18; z += 1.0) zs.push(z);
  for (let z = 18; z <= 34; z += 2.0) zs.push(z);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
  let k = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    pos[k * 3] = xs[i]; pos[k * 3 + 1] = 0; pos[k * 3 + 2] = zs[j];
    uv[k * 2] = i / (nx - 1); uv[k * 2 + 1] = j / (nz - 1); k++;
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nx * nz * 3).fill(0), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e5);
  return g;
}

export function createTerrain(scene, tex) {
  const snow = tex.snow; snow.wrapS = snow.wrapT = THREE.MirroredRepeatWrapping; snow.anisotropy = 8;
  const mat = new THREE.MeshLambertMaterial({ map: snow, color: 0xffffff });
  const extraU = {
    uScroll: U.uScroll, uWagonX: U.uWagonX, uWagonLit: U.uWagonLit, uWin: U.uWin, uPassX0: U.uPassX0,
    uShadowCol: { value: new THREE.Color(0x8aa0ab) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uBendK: U.uBendK, uBendX0: U.uBendX0, uTime: U.uTime }, extraU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + BEND + NOISE + TERRAIN + `
        uniform float uScroll; uniform float uTime;
        varying vec3 vTP; varying float vXW; varying float vSlope;`)
      .replace('#include <beginnormal_vertex>', `
        float xw = position.x + uScroll;
        float hC = terrainH(xw, position.z);
        float hx = terrainH(xw + 0.6, position.z) - terrainH(xw - 0.6, position.z);
        float hz = terrainH(xw, position.z + 0.6) - terrainH(xw, position.z - 0.6);
        vec3 objectNormal = normalize(vec3(-hx, 1.2, -hz));
        vSlope = 1.0 - objectNormal.y;`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position.x, hC, position.z); vTP = transformed; vXW = xw;`)
      .replace('#include <uv_vertex>', `#ifdef USE_MAP
          vMapUv = vec2(position.x + uScroll, position.z) * 0.055;
        #endif`)
      .replace('#include <project_vertex>', PROJECT_BEND);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE + TERRAIN + `
        uniform float uWagonX[6]; uniform float uWagonLit[6]; uniform float uWin[8];
        uniform vec3 uShadowCol; uniform float uTime;
        varying vec3 vTP; varying float vXW; varying float vSlope;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec2 q = vec2(vXW, vTP.z);
          // neutral moonlit snow (the raw texture is lavender-blue)
          float sl = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          diffuseColor.rgb = mix(vec3(sl), diffuseColor.rgb, 0.45) * vec3(0.84, 0.95, 1.0);
          // soft blue wind-shadow washes
          float wash = smoothstep(0.45, 0.85, vnoise(q * vec2(0.03, 0.05) + 9.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uShadowCol * 1.15, wash * 0.45);
          // track bed slightly darker / trodden
          float bed = 1.0 - smoothstep(1.0, 2.4, abs(vTP.z));
          diffuseColor.rgb *= 1.0 - bed * 0.12;
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // warm light patches thrown on the snow by the lit windows (near side of the train)
          float zf = vTP.z;
          if (zf > 1.4 && zf < 7.0) {
            float warm = 0.0;
            for (int i = 0; i < 6; i++) {
              float lit = uWagonLit[i];
              if (lit < 0.001) continue;
              float lx = vTP.x - uWagonX[i];
              if (abs(lx) > 7.2) continue;
              for (int j = 0; j < 8; j++) {
                float on = smoothstep(uWin[j] - 0.07, uWin[j] + 0.01, lit);
                if (on < 0.001) continue;
                float wx = (uWin[j] - 0.5) * 12.0;
                float t = zf - 1.7;
                float dx = abs(lx - wx - t * 0.24);
                float hw = (j == 0 || j == 7) ? 0.16 : 0.33;
                float m = (1.0 - smoothstep(hw - 0.06, hw + 0.2, dx)) * smoothstep(1.8, 2.5, zf) * (1.0 - smoothstep(3.6, 5.2, zf));
                warm += m * on;
              }
            }
            float grain = 0.82 + 0.18 * vnoise(vec2(vXW, zf) * 3.0);
            float wl = min(warm, 1.0) * grain;
            diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.86, 0.62), wl);
            totalEmissiveRadiance += vec3(1.0, 0.55, 0.18) * wl * 0.55;
          }
          // tiny moonlit sparkles in the snow
          vec2 gq = vec2(vXW, vTP.z) * 13.0;
          vec2 g = floor(gq);
          float sp = h01(int(g.x), int(g.y));
          float rnd = 1.0 - smoothstep(0.06, 0.28, length(fract(gq) - 0.5));
          float tw = 0.5 + 0.5 * sin(uTime * 2.5 + sp * 60.0);
          totalEmissiveRadiance += vec3(0.75, 0.85, 1.0) * step(0.9975, sp) * rnd * tw * 0.4;
        }`);
  };
  mat.customProgramCacheKey = () => 'terrain';
  const mesh = new THREE.Mesh(terrainGeometry(), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  scene.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------- rails + sleepers
export function createTrack(scene) {
  const railMat = patchBend(new THREE.MeshLambertMaterial({ color: 0x2b3038, emissive: 0x0b0f16 }), 'rail');
  const railGeo = new THREE.BoxGeometry(440, 0.11, 0.09, 220, 1, 1);
  for (const z of [-0.74, 0.74]) {
    const r = new THREE.Mesh(railGeo, railMat);
    r.position.set(30, 0.16, z); r.frustumCulled = false;
    scene.add(r);
  }
  const N = 520, SP = 0.85;
  const slMat = patchBend(new THREE.MeshLambertMaterial({ color: 0x3a3029 }), 'sleeper');
  const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.1, 2.25), slMat, N);
  const m = new THREE.Matrix4();
  for (let i = 0; i < N; i++) { m.makeTranslation(-190 + i * SP, 0.06, 0); sl.setMatrixAt(i, m); }
  sl.frustumCulled = false;
  scene.add(sl);
  return { update(scroll) { sl.position.x = -(scroll % SP); } };
}

// ---------------------------------------------------------------- instanced scenery (pines + rocks), recycled along the track
export function createScenery(scene, pineGeo, pineMat, rockGeo, rockMat, seed = 7) {
  const R = rng(seed);
  const SPAN = 400, X0 = -150;
  const pines = [], rocks = [];
  const nP = 104, nR = 84, nC = 70;
  for (let i = 0; i < nP; i++) {
    // all pines behind the track (a pine between the camera and the train would hide the game)
    const cluster = R();
    const sc = 7 + R() * 9 + (cluster > 0.8 ? 4 : 0);
    const z = -(4.2 + sc * 0.23 + Math.pow(R(), 1.5) * 88);     // canopy never reaches the cars
    pines.push({ xw: X0 + R() * SPAN, z, s: sc, rot: R() * Math.PI * 2, tilt: (R() - 0.5) * 0.06, k: R() });
  }
  for (let i = 0; i < nR; i++) {
    const side = R() < 0.75 ? -1 : 1;
    const sc = side < 0 ? 2.2 + R() * 5.5 : 2.4 + R() * 3.2;
    const z = side < 0 ? -(3.9 + sc * 0.52 + Math.pow(R(), 1.6) * 42) : (9.5 + R() * 18);
    rocks.push({ xw: X0 + R() * SPAN, z, s: sc, rot: R() * Math.PI * 2, sy: 0.5 + R() * 0.45, tx: (R() - 0.5) * 0.5, tz: (R() - 0.5) * 0.5, k: R() });
  }
  // crags: extra rocks hugging the track, only shown on the high pass
  for (let i = 0; i < nC; i++) {
    const sc = 3.0 + R() * 6.0;
    rocks.push({ xw: X0 + R() * SPAN, z: -(3.9 + sc * 0.52 + Math.pow(R(), 1.4) * 18), s: sc, rot: R() * Math.PI * 2, sy: 0.32 + R() * 0.35,
      tx: (R() - 0.5) * 0.6, tz: (R() - 0.5) * 0.6, k: R(), crag: true });
  }
  const pineMesh = new THREE.InstancedMesh(pineGeo, pineMat, nP);
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, nR + nC);
  pineMesh.frustumCulled = false; rockMesh.frustumCulled = false;
  scene.add(pineMesh, rockMesh);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < nP; i++) { c.setHSL(0.45, 0.06, 0.84 + R() * 0.16); pineMesh.setColorAt(i, c); }
  for (let i = 0; i < nR + nC; i++) { c.setHSL(0.55, 0.03, 0.85 + R() * 0.15); rockMesh.setColorAt(i, c); }
  return {
    pines, rocks,
    // density(xw) -> [pineDensity, rockDensity] in 0..1 (varies with the leg of the journey)
    update(scroll, density) {
      for (let i = 0; i < nP; i++) {
        const t = pines[i];
        while (t.xw - scroll < X0) t.xw += SPAN;
        const x = t.xw - scroll;
        const vis = !density || t.k < density(t.xw)[0] || t.z < -45;
        const y = terrainH(t.xw, t.z) - 0.25 * t.s * 0.08;
        e.set(t.tilt, t.rot, 0); q.setFromEuler(e);
        const sc = vis ? t.s : 0.0001;
        // slimmer, taller firs than the raw model (closer to the reference's spruces)
        p.set(x, y + t.s * 0.47 * 1.12, t.z); s.set(sc * 0.74, sc * 1.12, sc * 0.74);
        m.compose(p, q, s); pineMesh.setMatrixAt(i, m);
      }
      for (let i = 0; i < nR + nC; i++) {
        const r = rocks[i];
        while (r.xw - scroll < X0) r.xw += SPAN;
        const x = r.xw - scroll;
        const vis = r.crag ? (density ? r.k < density(r.xw)[2] : false) : (!density || r.k < density(r.xw)[1]);
        const y = terrainH(r.xw, r.z);
        e.set(r.tx || 0, r.rot, r.tz || 0); q.setFromEuler(e);
        const sc = vis ? 1 : 0.0001;
        p.set(x, y + r.s * r.sy * 0.02, r.z); s.set(r.s * sc, r.s * r.sy * sc, r.s * sc);
        m.compose(p, q, s); rockMesh.setMatrixAt(i, m);
      }
      pineMesh.instanceMatrix.needsUpdate = true; rockMesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- falling snow (GPU)
export function createSnowfall(scene, count = 3200) {
  const g = new THREE.BufferGeometry();
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seed[i] = Math.random();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: U.uTime, uBendK: U.uBendK, uBendX0: U.uBendX0,
      uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(110, 46, 80) },
      uDrift: { value: 0 }, uScale: { value: 400 }, uWind: { value: 0 }, uAmount: { value: 0.7 },
    },
    vertexShader: BEND + `
      attribute vec4 seed; uniform float uTime; uniform vec3 uCenter; uniform vec3 uBox; uniform float uDrift; uniform float uScale; uniform float uWind; uniform float uAmount;
      varying float vA;
      void main(){
        vec3 p = seed.xyz * uBox;
        p.x -= uDrift * (0.7 + 0.6 * seed.w);
        p.y -= uTime * (0.9 + seed.w * 0.9);
        p.z += sin(uTime * (0.4 + seed.w) + seed.x * 30.0) * 0.8;
        p.x += sin(uTime * 0.7 + seed.y * 20.0) * 0.6;
        vec3 lo = uCenter - uBox * 0.5;
        p = mod(p - lo, uBox) + lo;
        vec4 mv = viewMatrix * vec4(bendW(p), 1.0);
        gl_Position = projectionMatrix * mv;
        float sz = (0.05 + 0.09 * seed.w * seed.w) * (1.0 + uWind * 0.5);
        gl_PointSize = clamp(sz * uScale / -mv.z, 1.0, 9.0);
        vA = (1.0 - smoothstep(30.0, 150.0, -mv.z)) * (0.55 + 0.45 * seed.y) * step(seed.z * 0.999, uAmount);
      }`,
    fragmentShader: `varying float vA;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = (1.0 - smoothstep(0.05, 0.5, d)) * vA;
        gl_FragColor = vec4(vec3(0.9, 0.95, 1.0) * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.NormalBlending, premultipliedAlpha: true,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 20;
  scene.add(pts);
  return { pts, mat };
}
