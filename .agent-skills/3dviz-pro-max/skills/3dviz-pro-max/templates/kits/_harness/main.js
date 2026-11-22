// main.js - loads exactly one blueprint module, frames it and publishes the capture contract.
// Renderer lines are the SKILL.md contract ones: sRGB output, ACESFilmic, exposure 1.0, pixel
// ratio capped at 2, PCF soft shadows, one sun plus one hemisphere fill, neutral grey ground.
// No post-processing: a proof capture must show geometry, not bloom.
// Loading, framing and triangle counting live in ./blueprint-views.js.
import * as THREE from 'three';
import { installViewer } from './viewer-contract.js';
import { buildViews, loadBlueprint, triangles } from './blueprint-views.js';

const STEP_S = 1 / 60;   // motion advances in fixed steps, never by wall clock, while capturing

const meta = name => document.querySelector(`meta[name="${name}"]`)?.content ?? '';
// kit-proof.py injects capture="1". A hand-opened page leaves it empty and runs the blueprint's
// own animate(dt) on the wall clock, so creatures walk and mill and cart wheels turn.
const CAPTURING = meta('capture') === '1';
const canvas = document.querySelector('#world');
const hud = document.querySelector('#hud');

function fail(message, cause) {
  const box = document.querySelector('#error');
  box.hidden = false;
  box.textContent = message;
  if (cause) throw cause;
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (cause) {
  fail('This harness needs WebGL.', cause);
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#6d7075');
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 400);
const sun = new THREE.DirectionalLight('#fff4e2', 2.6);
sun.position.set(6, 9, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006;
scene.add(sun, new THREE.HemisphereLight('#cdd7e6', '#6a6257', 1.1));
const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64),
                              new THREE.MeshStandardMaterial({ color: '#8a8a86', roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const turntable = new THREE.Group();
scene.add(turntable);

function resize() {
  const width = innerWidth, height = innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

let spinning = true, viewer = null, angle = 0, last = performance.now(), built = null;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  // The turntable proves the page is live for --motion-check. setView freezes it at angle 0 so
  // every named capture is the same frame on every run - and for the same reason a capturing
  // page never advances the blueprint's own animation here: window.__kitAdvance does that, in
  // whole fixed steps, exactly when the proof asks for it.
  if (spinning) {
    angle += dt * 0.25;
    turntable.rotation.y = angle;
    if (!CAPTURING) built?.animate?.(dt);
  }
  renderer.render(scene, camera);
  viewer?.markReady();
}

async function start() {
  const params = JSON.parse(meta('params') || '{}');
  // Quality tier: a page with no `tier` meta is T1 and builds exactly what it always did.
  // `surface` carries the record's tiers.T2 block - {families, seed, size, ao} - as JSON.
  const tier = meta('tier') || 'T1';
  const surface = JSON.parse(meta('surface') || '{}');
  built = await loadBlueprint(meta('module'), params, meta('factory'), { tier, surface });
  turntable.add(built.group);
  const box = new THREE.Box3().setFromObject(built.group);
  const sockets = built.sockets ?? [];
  const { views, fit, detail_socket } = buildViews(box, sockets, {
    detailSocket: meta('detail-socket'), maxClose: Number(meta('max-close-m')) || Infinity });
  const size = box.getSize(new THREE.Vector3());
  window.__kitInfo = {
    blueprint: meta('blueprint'), module: meta('module'), params,
    tier: built.info?.tier ?? 'T1',
    surface: built.info?.surface ? { ...built.info.surface, ao: built.info.ao } : null,
    triangles: triangles(built.group),
    bounds_m: { min: box.min.toArray(), max: box.max.toArray(), size: size.toArray() },
    fit_distance_m: Number(fit.toFixed(4)),
    view_distances_m: Object.fromEntries(Object.entries(views).map(([name, view]) => [
      name, Number(new THREE.Vector3(...view.position)
        .distanceTo(new THREE.Vector3(...view.target)).toFixed(4))])),
    sockets: sockets.map(entry => entry.name),
    detail_socket,
    animated: typeof built.animate === 'function',
    colliders: (built.colliders ?? []).map(entry => entry.name),
    three: THREE.REVISION
  };
  hud.textContent = `${meta('blueprint')} · ${window.__kitInfo.triangles} tris · `
    + `${size.toArray().map(v => v.toFixed(2)).join(' x ')} m`;
  const controls = { target: new THREE.Vector3(), update() { camera.lookAt(this.target); } };
  viewer = installViewer({
    camera, controls, views,
    setView(name) {
      spinning = false;
      angle = 0;
      turntable.rotation.y = 0;
      camera.position.set(...views[name].position);
      controls.target.set(...views[name].target);
      controls.update();
    }
  });
  // Deterministic motion for --motion-check: advance `seconds` of simulated time in fixed steps
  // and report whether the blueprint moved. Two runs of the same seconds agree exactly, so a
  // motion capture is as reproducible as a still one.
  window.__kitAdvance = seconds => {
    let moved = false;
    for (let t = 0; t < seconds - 1e-9; t += STEP_S) {
      moved = Boolean(built.animate?.(Math.min(STEP_S, seconds - t))) || moved;
    }
    return moved;
  };
  resize();
  addEventListener('resize', resize);
  camera.position.set(...views.mid.position);
  controls.target.set(...views.mid.target);
  controls.update();
  requestAnimationFrame(frame);
}

start().catch(error => fail(`Blueprint failed to load: ${error.message}`, error));
