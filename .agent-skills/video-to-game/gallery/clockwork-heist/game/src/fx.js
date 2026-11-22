// Lightweight particle bursts (landing dust, gem sparkles, lever sparks, respawn poofs, confetti).
import * as THREE from 'three';
import { dotTexture } from './materials.js';

const N = 900;

export class Fx {
  constructor(scene) {
    this.scene = scene;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.size = new Float32Array(N);
    this.alpha = new Float32Array(N);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: dotTexture() }, uScale: { value: 400 } },
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute vec3 color;
        uniform float uScale; varying vec3 vC; varying float vA;
        void main(){ vC = color; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / -mv.z; }`,
      fragmentShader: `
        uniform sampler2D uMap; varying vec3 vC; varying float vA;
        void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA; if (a < 0.003) discard; gl_FragColor = vec4(vC * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    scene.add(this.points);
    this.p = [];
    for (let i = 0; i < N; i++) this.p.push({ life: 0 });
    this.cursor = 0;
  }

  emit(o) {
    const p = this.p[this.cursor];
    this.cursor = (this.cursor + 1) % N;
    Object.assign(p, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 1.5, size: 0.3, grow: 0, a: 1, life: 1, max: 1, r: 1, gC: 1, b: 1 }, o);
    p.max = p.life;
  }

  dust(x, y, n = 8) {
    for (let i = 0; i < n; i++) {
      const s = Math.random() < 0.5 ? -1 : 1;
      this.emit({ x: x + s * Math.random() * 0.3, y: y + 0.05, z: (Math.random() - 0.5) * 0.6, vx: s * (1 + Math.random() * 2.5), vy: 0.4 + Math.random() * 0.9, vz: (Math.random() - 0.5), drag: 3.5, size: 0.35 + Math.random() * 0.35, grow: 0.9, a: 0.28, life: 0.6 + Math.random() * 0.4, r: 0.9, gC: 0.75, b: 0.55 });
    }
  }

  sparkle(x, y, hex = 0xffffff) {
    const c = new THREE.Color(hex);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 3;
      this.emit({ x, y, z: 0.1, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 1, vz: (Math.random() - 0.5) * 2, g: -3, drag: 2.5, size: 0.16 + Math.random() * 0.12, a: 1.4, life: 0.5 + Math.random() * 0.4, r: 0.7 + c.r * 0.4, gC: 0.85 + c.g * 0.2, b: 1.0 });
    }
    this.emit({ x, y, z: 0.1, size: 1.6, grow: -1.5, a: 0.9, life: 0.35, r: 0.8, gC: 0.95, b: 1.0 });
  }

  sparks(x, y, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI, s = 2 + Math.random() * 4;
      this.emit({ x, y, z: 0.2, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: (Math.random() - 0.5) * 2, g: -14, drag: 0.6, size: 0.1 + Math.random() * 0.08, a: 1.6, life: 0.4 + Math.random() * 0.5, r: 1.0, gC: 0.72, b: 0.35 });
    }
  }

  poof(x, y, hex) {
    const c = new THREE.Color(hex);
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.5;
      this.emit({ x, y, z: 0.1, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: (Math.random() - 0.5) * 2, drag: 3, size: 0.35 + Math.random() * 0.4, grow: 0.6, a: 0.7, life: 0.5 + Math.random() * 0.5, r: 0.5 + c.r * 0.6, gC: 0.5 + c.g * 0.6, b: 0.5 + c.b * 0.6 });
    }
  }

  stars(x, y) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.emit({ x, y, z: 0.4, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3 + 1.5, drag: 2, size: 0.3, a: 1.5, life: 0.7, r: 1, gC: 0.9, b: 0.5 });
    }
  }

  confetti(x, y) {
    const cols = [[1, 0.2, 0.2], [0.25, 0.45, 1], [1, 0.85, 0.2], [0.2, 0.9, 0.35], [1, 0.8, 0.45]];
    for (let i = 0; i < 160; i++) {
      const c = cols[i % cols.length];
      const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 7;
      this.emit({ x, y, z: (Math.random() - 0.5) * 2, vx: Math.cos(a) * s * 0.8, vy: Math.abs(Math.sin(a)) * s + 3, vz: (Math.random() - 0.5) * 4, g: -6, drag: 1.2, size: 0.14 + Math.random() * 0.14, a: 1.3, life: 1.6 + Math.random() * 1.6, r: c[0], gC: c[1], b: c[2] });
    }
  }

  update(dt, camera) {
    for (let i = 0; i < N; i++) {
      const p = this.p[i];
      if (p.life <= 0) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      p.life -= dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k + p.g * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.size = Math.max(0, p.size + p.grow * dt);
      const f = Math.max(0, p.life / p.max);
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 3] = p.r; this.col[i * 3 + 1] = p.gC; this.col[i * 3 + 2] = p.b;
      this.size[i] = p.size;
      this.alpha[i] = p.a * Math.min(1, f * 2.5) * (f > 0.9 ? (1 - f) * 10 : 1);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    this.mat.uniforms.uScale.value = window.innerHeight * 0.9;
  }
}
