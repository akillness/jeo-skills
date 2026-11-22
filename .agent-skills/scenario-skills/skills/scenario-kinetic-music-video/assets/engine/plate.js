// Clean footage plates. Footage is NEVER filtered: rgb is the source pixel (sRGB-decoded), optionally cut out by the subject matte.
// Code graphics are layered around it: draw them before the plate (behind everything), draw plate({matte:true}) to put the
// subject back in front of "behind-the-subject" graphics, then draw front graphics after.
//   const v = await E.loadVideo('dance_a');            // load()
//   await v.frame(t - slot);                          // prepare()
//   E.drawPlate(E, v, { fit:'cover', zoom:1, x:0, y:0 });              // full-frame plate
//   E.drawPlate(E, v, { matte:true });                                   // only the subject (alpha = matte), same framing
//   const p = E.plateToScreen(E, v, [u,v], opts)  -> pixel coords (E.W x E.H, y down) of a video-UV point (e.g. a pose landmark)
import * as THREE from "three";
import { clock } from "./blur.js";

// A motion-blur sample drawing a moving clip that prepare() did not advance this frame would mix in a stale frame;
// main.js then renders the frame without blur and render.mjs lists it
function checkClip(v) {
  if (clock.sub && v.meta?.n > 1 && v.prepared !== clock.id)
    clock.stale = v.name ?? "a clip";
}

const VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const FS = `
  uniform sampler2D tVideo, tMatte; uniform float uMatte, uInvMatte, uOpacity, uFeather, uMirror; uniform vec4 uCrop; varying vec2 vUv;
  void main(){
    vec2 uv = vUv; if (uMirror > 0.5) uv.x = 1.0 - uv.x; uv = uCrop.xy + uv * uCrop.zw;
    vec3 c = texture2D(tVideo, uv).rgb;
    float a = 1.0;
    if (uMatte > 0.5) { float m = texture2D(tMatte, uv).r; m = smoothstep(0.5 - uFeather, 0.5 + uFeather, m); a = mix(m, 1.0 - m, uInvMatte); }
    a *= uOpacity;
    gl_FragColor = vec4(c * a, a);
  }`;
export function makePlateMaterial(o = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tVideo: { value: null },
      tMatte: { value: null },
      uMatte: { value: o.matte ? 1 : 0 },
      uInvMatte: { value: o.invert ? 1 : 0 },
      uOpacity: { value: o.opacity ?? 1 },
      uFeather: { value: o.feather ?? 0.12 },
      uMirror: { value: o.mirror ? 1 : 0 },
      uCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
    },
    vertexShader: VS,
    fragmentShader: FS,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
}
// Layout of a plate on screen, in pixels. fit 'cover' (default) or 'contain'; zoom scales around (x,y) offset in px from centre; rot in rad.
export function plateRect(E, v, o = {}) {
  const c = o.crop ?? [0, 0, 1, 1],
    // the crop's own shape, so a cropped region is windowed rather than stretched to the clip's shape
    va = (v.meta.w * c[2]) / (v.meta.h * c[3]),
    sa = E.W / E.H;
  const cover = (o.fit ?? "cover") === "cover";
  let w, h;
  if (va > sa === cover) {
    h = E.H;
    w = h * va;
  } else {
    w = E.W;
    h = w / va;
  }
  const z = o.zoom ?? 1;
  w *= z;
  h *= z;
  const cx = E.W / 2 + (o.x ?? 0) * E.SCALE,
    cy = E.H / 2 + (o.y ?? 0) * E.SCALE;
  return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy, rot: o.rot ?? 0 };
}
export function plateToScreen(E, v, p, o = {}) {
  const r = plateRect(E, v, o),
    c = o.crop ?? [0, 0, 1, 1];
  let u = (p[0] - c[0]) / c[2];
  if (o.mirror) u = 1 - u;
  let x = r.x + u * r.w,
    y = r.y + ((p[1] - c[1]) / c[3]) * r.h;
  if (r.rot) {
    const dx = x - r.cx,
      dy = y - r.cy,
      c = Math.cos(r.rot),
      s = Math.sin(r.rot);
    x = r.cx + dx * c - dy * s;
    y = r.cy + dx * s + dy * c;
  }
  return [x, y];
}
const _pl = {};
export function drawPlate(E, v, o = {}) {
  if (!_pl.scene) {
    _pl.scene = new THREE.Scene();
    _pl.cam = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);
    _pl.geo = new THREE.PlaneGeometry(1, 1);
    _pl.pool = [];
    _pl.frame = -1;
  }
  // a new frame, or a motion-blur sample of this one, reuses the pool (E.pass is 0 without blur)
  if (_pl.frame !== E.frame || _pl.pass !== E.pass) {
    _pl.frame = E.frame;
    _pl.pass = E.pass;
    _pl.used = 0;
  }
  checkClip(v);
  let m = _pl.pool[_pl.used];
  if (!m) {
    m = new THREE.Mesh(_pl.geo, makePlateMaterial());
    _pl.pool.push(m);
  }
  _pl.used++;
  const U = m.material.uniforms;
  U.tVideo.value = v.tex;
  U.tMatte.value = v.mtex;
  U.uMatte.value = o.matte ? 1 : 0;
  U.uInvMatte.value = o.invert ? 1 : 0;
  U.uOpacity.value = o.opacity ?? 1;
  U.uFeather.value = o.feather ?? 0.12;
  U.uMirror.value = o.mirror ? 1 : 0;
  const c = o.crop ?? [0, 0, 1, 1];
  U.uCrop.value.set(c[0], 1 - c[1] - c[3], c[2], c[3]);
  const r = plateRect(E, v, o);
  _pl.cam.left = 0;
  _pl.cam.right = E.W;
  _pl.cam.top = 0;
  _pl.cam.bottom = E.H;
  _pl.cam.updateProjectionMatrix();
  m.scale.set(r.w, -r.h, 1);
  m.position.set(r.cx, r.cy, 0);
  m.rotation.z = r.rot || 0;
  _pl.scene.children.length = 0;
  _pl.scene.add(m);
  E.renderer.render(_pl.scene, _pl.cam);
}
// Plate as a texture on your own mesh (e.g. inside a 3D world, or a type-as-mask shader): material with tVideo/tMatte set each frame.
export function plateMaterialFor(v, o = {}) {
  const m = makePlateMaterial(o);
  m.onBeforeRender = () => {
    checkClip(v);
    m.uniforms.tVideo.value = v.tex;
    m.uniforms.tMatte.value = v.mtex;
  };
  return m;
}
