// Procedural gear geometry (shape only). All surface detail comes from the
// fal-generated brass material (assets/tex/brass.jpg).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const cache = new Map();

function chaikin(pts, iterations = 2) {
  let p = pts;
  for (let it = 0; it < iterations; it++) {
    const out = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      out.push(new THREE.Vector2(a.x * 0.75 + b.x * 0.25, a.y * 0.75 + b.y * 0.25));
      out.push(new THREE.Vector2(a.x * 0.25 + b.x * 0.75, a.y * 0.25 + b.y * 0.75));
    }
    p = out;
  }
  return p;
}

/**
 * Build a gear BufferGeometry lying in the XY plane, centered on the origin,
 * extruded along Z (thickness centered on z=0).
 */
export function gearGeometry({ r = 3, teeth, depth, thick = 0.7, spokes = 5, hubR, rim, style = 'spoked' } = {}) {
  teeth = teeth ?? Math.max(10, Math.round(r * 6.2));
  depth = depth ?? Math.min(0.55, 0.11 * r + 0.08);
  hubR = hubR ?? Math.max(0.35, r * 0.17);
  rim = rim ?? Math.max(0.28, r * 0.12);
  const key = [r, teeth, depth, thick, spokes, hubR, rim, style].join('|');
  if (cache.has(key)) return cache.get(key);

  const shape = new THREE.Shape();
  const pitch = (Math.PI * 2) / teeth;
  const rootR = r - depth;
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a0 = i * pitch;
    // trapezoid tooth: root 0.56 of pitch, tip 0.30
    const rootHalf = pitch * 0.28, tipHalf = pitch * 0.15;
    const c = a0 + pitch * 0.5;
    pts.push(new THREE.Vector2(Math.cos(a0) * rootR, Math.sin(a0) * rootR));
    pts.push(new THREE.Vector2(Math.cos(c - rootHalf) * rootR, Math.sin(c - rootHalf) * rootR));
    pts.push(new THREE.Vector2(Math.cos(c - tipHalf) * r, Math.sin(c - tipHalf) * r));
    pts.push(new THREE.Vector2(Math.cos(c + tipHalf) * r, Math.sin(c + tipHalf) * r));
    pts.push(new THREE.Vector2(Math.cos(c + rootHalf) * rootR, Math.sin(c + rootHalf) * rootR));
  }
  shape.setFromPoints(pts);

  if (style === 'spoked' && spokes > 0) {
    const rOut = rootR - rim;
    const rIn = hubR + Math.max(0.18, r * 0.06);
    const ws = Math.max(0.22, r * 0.11); // spoke width
    if (rOut - rIn > 0.25) {
      for (let k = 0; k < spokes; k++) {
        const t0 = (k / spokes) * Math.PI * 2 + 0.3;
        const t1 = ((k + 1) / spokes) * Math.PI * 2 + 0.3;
        const oa = Math.asin(Math.min(0.95, ws / 2 / rOut));
        const ia = Math.asin(Math.min(0.95, ws / 2 / rIn));
        const hole = [];
        const segs = 18;
        for (let s = 0; s <= segs; s++) {
          const a = t0 + oa + (t1 - oa - (t0 + oa)) * (s / segs);
          hole.push(new THREE.Vector2(Math.cos(a) * rOut, Math.sin(a) * rOut));
        }
        const isegs = 8;
        for (let s = 0; s <= isegs; s++) {
          const a = t1 - ia + (t0 + ia - (t1 - ia)) * (s / isegs);
          hole.push(new THREE.Vector2(Math.cos(a) * rIn, Math.sin(a) * rIn));
        }
        const smooth = chaikin(hole, 3);
        // holes must wind opposite to the outline
        smooth.reverse();
        shape.holes.push(new THREE.Path(smooth));
      }
    }
  }

  const bevel = Math.min(0.07, thick * 0.12);
  let g = new THREE.ExtrudeGeometry(shape, {
    depth: thick - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 2,
    curveSegments: 6,
  });
  g.translate(0, 0, -thick / 2 + bevel);

  // Hub boss + axle stub
  const boss = new THREE.CylinderGeometry(hubR, hubR * 1.05, thick + 0.22, 28, 1);
  boss.rotateX(Math.PI / 2);
  const axle = new THREE.CylinderGeometry(hubR * 0.42, hubR * 0.42, thick + 0.9, 20, 1);
  axle.rotateX(Math.PI / 2);
  // cylinder UVs are 0..1, rescale to world-ish units so the tiling matches the face
  for (const cg of [boss, axle]) {
    const uv = cg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * hubR * 6, uv.getY(i) * 1.2);
  }
  const ni = (x) => { const y = x.index ? x.toNonIndexed() : x; y.clearGroups(); return y; };
  g = mergeGeometries([ni(g), ni(boss), ni(axle)], false);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  cache.set(key, g);
  return g;
}

/** A simple brass ring/disc (pendulum bob back plate, vault rim, etc.). */
export function discGeometry(r, thick, segs = 48) {
  const g = new THREE.CylinderGeometry(r, r, thick, segs, 1);
  g.rotateX(Math.PI / 2);
  return g;
}
