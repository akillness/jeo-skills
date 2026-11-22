import * as THREE from 'three';
import { BEND } from './shaders.js';

// Instanced sprite batch: billboards (or flat roof decals) driven from the CPU.
// MODE 0 = texture additive (black background images = glow)
// MODE 1 = texture with luminance alpha (soft white puffs / snow)
// MODE 2 = vertical light thread (procedural gradient), anchored at the bottom
// MODE 3 = ring on the roof (procedural), flat
// MODE 4 = soft dark disc (blob shadow / footprints), flat
// MODE 5 = texture alpha (premultiplied, own alpha channel)
// MODE 6 = crisp star body with rim (premultiplied, HDR colour)
const VERT = /* glsl */`
${BEND}
attribute vec3 iPos; attribute vec2 iSize; attribute float iRot; attribute vec4 iCol; attribute float iFrame;
uniform vec2 uAtlas; uniform float uFlat; uniform float uAnchor;
varying vec2 vUv; varying vec4 vCol; varying vec2 vQ;
void main(){
  vec2 q = position.xy;
  q.y += uAnchor * 0.5;
  vQ = position.xy * 2.0;
  vec2 s = q * iSize;
  float cs = cos(iRot), sn = sin(iRot);
  s = vec2(s.x*cs - s.y*sn, s.x*sn + s.y*cs);
  vec4 mv;
  if (uFlat > 0.5) {
    vec3 w = iPos + vec3(s.x, 0.0, s.y);
    mv = viewMatrix * vec4(bendW(w), 1.0);
  } else {
    mv = viewMatrix * vec4(bendW(iPos), 1.0);
    mv.xy += s;
  }
  gl_Position = projectionMatrix * mv;
  float fx = mod(iFrame, uAtlas.x); float fy = floor(iFrame / uAtlas.x);
  vUv = (uv + vec2(fx, uAtlas.y - 1.0 - fy)) / uAtlas;
  vCol = iCol;
}`;

const FRAG = /* glsl */`
uniform sampler2D uTex; uniform float uTime;
varying vec2 vUv; varying vec4 vCol; varying vec2 vQ;
void main(){
#if MODE == 0
  vec3 t = texture2D(uTex, vUv).rgb;
  gl_FragColor = vec4(t * vCol.rgb * vCol.a, 0.0);
#elif MODE == 1
  vec3 t = texture2D(uTex, vUv).rgb;
  float a = clamp(max(t.r, max(t.g, t.b)) * 1.15, 0.0, 1.0) * vCol.a;
  gl_FragColor = vec4(vCol.rgb * a, a);
#elif MODE == 2
  float x = abs(vUv.x - 0.5) * 2.0;
  float core = exp(-x*x*18.0) + 0.35*exp(-x*x*3.0);
  float fall = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.04, vUv.y + 0.02);
  float flick = 0.75 + 0.25*sin(uTime*9.0 + vUv.y*40.0);
  gl_FragColor = vec4(vCol.rgb * core * fall * flick * vCol.a, 0.0);
#elif MODE == 3
  float r = length(vQ);
  float d1 = (r - 0.72) * 9.0, d2 = (r - 0.35) * 7.0;
  float ring = exp(-d1*d1) + 0.35*exp(-d2*d2) + 0.25*(1.0 - smoothstep(0.0, 1.0, r));
  float a = ring * (1.0 - smoothstep(0.85, 1.0, r));
  gl_FragColor = vec4(vCol.rgb * a * vCol.a, 0.0);
#elif MODE == 4
  float r = length(vQ);
  float a = (1.0 - smoothstep(0.15, 1.0, r)) * vCol.a;
  gl_FragColor = vec4(vCol.rgb * a, a);
#elif MODE == 6
  // crisp star body (normal blending, HDR colour so it glows) with a thin amber rim: stays a
  // readable golden star even over the white snow, where an additive sprite would wash out
  vec3 t = texture2D(uTex, vUv).rgb;
  float l = max(t.r, max(t.g, t.b));
  float body = smoothstep(0.62, 0.80, l);
  float rim = smoothstep(0.40, 0.62, l) * (1.0 - body);
  vec3 col = mix(vCol.rgb * vec3(0.55, 0.30, 0.08), vCol.rgb, body);
  col *= 1.0 + 0.5 * smoothstep(0.30, 0.0, length(vUv - 0.5));
  float a = clamp(body + rim * 0.9, 0.0, 1.0) * vCol.a;
  gl_FragColor = vec4(col * a, a);
#else
  vec4 t = texture2D(uTex, vUv);
  float a = t.a * vCol.a;
  gl_FragColor = vec4(t.rgb * vCol.rgb * a, a);
#endif
}`;

export class Batch {
  constructor(scene, { tex = null, cap = 256, mode = 0, atlas = [1, 1], flat = false, anchorBottom = false, renderOrder = 10, depthTest = true, uniforms = {} } = {}) {
    this.cap = cap; this.list = [];
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.getAttribute('position')); g.setAttribute('uv', base.getAttribute('uv'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    this.aRot = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.aFrame = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    for (const a of [this.aPos, this.aSize, this.aRot, this.aCol, this.aFrame]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iSize', this.aSize); g.setAttribute('iRot', this.aRot);
    g.setAttribute('iCol', this.aCol); g.setAttribute('iFrame', this.aFrame);
    g.instanceCount = 0;
    const additive = mode === 0 || mode === 2 || mode === 3;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      defines: { MODE: mode },
      uniforms: Object.assign({
        uTex: { value: tex }, uAtlas: { value: new THREE.Vector2(atlas[0], atlas[1]) },
        uFlat: { value: flat ? 1 : 0 }, uAnchor: { value: anchorBottom ? 1 : 0 },
      }, uniforms),
      transparent: true, depthWrite: false, depthTest,
      blending: additive ? THREE.CustomBlending : THREE.NormalBlending,
      premultipliedAlpha: !additive,
    });
    if (additive) { this.mat.blendSrc = THREE.OneFactor; this.mat.blendDst = THREE.OneFactor; this.mat.blendEquation = THREE.AddEquation; }
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.geo = g;
    scene.add(this.mesh);
  }
  // p: {x,y,z,vx,vy,vz,life,size,size1,sx,sy,rot,vr,r,g,b,a,a1,frame,drag,grav,fadeIn}
  spawn(p) {
    if (this.list.length >= this.cap) this.list.shift();
    const q = Object.assign({ vx: 0, vy: 0, vz: 0, life: 1, age: 0, size: 1, size1: null, sx: 1, sy: 1, rot: 0, vr: 0, r: 1, g: 1, b: 1, a: 1, a1: 0, frame: 0, drag: 0, grav: 0, fadeIn: 0.0 }, p);
    if (q.size1 === null) q.size1 = q.size;
    this.list.push(q);
    return q;
  }
  clear() { this.list.length = 0; }
  update(dt) {
    const L = this.list;
    let n = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life && !p.keep) continue;
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.vr * dt;
      L[n++] = p;
    }
    L.length = n;
    const P = this.aPos.array, S = this.aSize.array, R = this.aRot.array, C = this.aCol.array, F = this.aFrame.array;
    for (let i = 0; i < n; i++) {
      const p = L[i];
      const t = p.keep ? 0 : Math.min(1, p.age / p.life);
      const sz = p.size + (p.size1 - p.size) * t;
      let a = p.a + (p.a1 - p.a) * t;
      if (p.fadeIn > 0) a *= Math.min(1, p.age / p.fadeIn);
      P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z;
      S[i * 2] = sz * p.sx; S[i * 2 + 1] = sz * p.sy;
      R[i] = p.rot;
      C[i * 4] = p.r; C[i * 4 + 1] = p.g; C[i * 4 + 2] = p.b; C[i * 4 + 3] = a;
      F[i] = p.frame;
    }
    this.geo.instanceCount = n;
    for (const a of [this.aPos, this.aSize, this.aRot, this.aCol, this.aFrame]) a.needsUpdate = true;
  }
}
