// kit-surface.js - procedural surface for quality tier T2. No files ship: every map is drawn
// into a canvas at build time from a seed, so two seeds differ and one seed always repeats.
// The drawing lives in ./kit-surface-draw.js and ./kit-surface-draw-organic.js (fabric, fur)
// so every file stays under 200 lines. Interface frozen by phase 9A step 0.
import { THREE, seeded } from './kit-core.js';
import { bakeVertexAO, groundDirtGradient, edgeDarken } from './kit-surface-ao.js';
import { STYLE, drawHeight, heightToAlbedo, heightToNormal,
         heightToRoughness } from './kit-surface-draw.js';
import { ORGANIC } from './kit-surface-draw-organic.js';

export const FAMILIES = ['wood', 'plaster', 'stone', 'roof-tile', 'metal', 'fabric', 'fur'];

// Measured, not assumed (phase 9A): every kit surface reaches the page through ExtrudeGeometry
// - bevelledBox, wallWithOpenings, gableEnd alike - whose UV generator emits *metres*, not 0..1
// (a 0.42 x 2.40 m pier carries u in [-1.2, 1.2]); only primitives (CylinderGeometry pegs, spheres,
// a loaded glTF) are normalised. So a mesh's repeat comes from its UV extent against its bounding
// box: within this ratio means metres, one repeat covering one tile.
const WORLD_UV_RATIO = 2.5;
// scatterInstances white-bases its material so instanceColor carries the absolute colour: an
// InstancedMesh never reports a palette hex, so its mean instance colour is matched to the
// nearest mapped hex within this linear-RGB distance.
const INSTANCE_TOLERANCE = 0.045;

const cache = new Map();
const probe = new THREE.Color(), mean = new THREE.Color(), extent = new THREE.Vector3();

const now = () => (globalThis.performance ?? Date).now();
const round = value => Number(value.toFixed(2));

/** albedo (sRGB) + normalMap + roughnessMap (NoColorSpace), cached on family|seed|size. */
export function surfaceMaps(family, { seed = 1, size = 1024, tile_m = 1 } = {}) {
  const key = `${family}|${seed}|${size}`;
  if (cache.has(key)) return cache.get(key);
  const style = STYLE[family];
  if (!style) throw new Error(`kit-surface.surfaceMaps: unknown family ${family}`);
  const random = seeded(seed);
  const height = ORGANIC[family] ? ORGANIC[family](size, random)
                                 : drawHeight(family, size, random);
  const maps = {
    map: texture(heightToAlbedo(height, size, family), THREE.SRGBColorSpace),
    normalMap: texture(heightToNormal(height, size, style.normal), THREE.NoColorSpace),
    roughnessMap: texture(heightToRoughness(height, size, family), THREE.NoColorSpace),
    tile_m
  };
  cache.set(key, maps);
  return maps;
}

/** One CanvasTexture, wrapped and mipmapped. Repeat and anisotropy are set per mesh below. */
function texture(canvas, colorSpace) {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = colorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.needsUpdate = true;
  return map;
}

/** The family for one mesh, by palette hex, falling back to the mean per-instance colour. */
function familyFor(object, families) {
  if (!object.material?.color) return null;
  const direct = families['#' + object.material.color.getHexString()];
  if (direct || !object.instanceColor) return direct ?? null;
  const count = Math.min(object.instanceColor.count, 32);
  mean.setRGB(0, 0, 0);
  for (let i = 0; i < count; i += 1) mean.add(probe.fromBufferAttribute(object.instanceColor, i));
  mean.multiplyScalar(1 / count);
  let best = null, nearest = INSTANCE_TOLERANCE;
  for (const [hex, family] of Object.entries(families)) {
    const distance = Math.hypot(probe.set(hex).r - mean.r, probe.g - mean.g, probe.b - mean.b);
    if (distance < nearest) { nearest = distance; best = family; }
  }
  return best;
}

/** Repeat for one mesh, from its UV convention: {repeat, mode}. */
function repeatFor(object, tile_m) {
  const geometry = object.geometry;
  // A loaded asset may declare its own UV scale in metres per UV unit - _harness/blueprint-views
  // measures it off the glTF, where a whole building can be packed into 0..1 (the guildhall is
  // 151.6 m per unit) and the guess below would magnify one ashlar across a wall.
  const declared = geometry.userData?.uv_m;
  if (declared > 0) return { repeat: declared / (tile_m || 1), mode: 'declared' };
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const span = Math.max(...geometry.boundingBox.getSize(extent).toArray()) || 1;
  const uv = geometry.getAttribute('uv');
  let spread = 0;
  for (let i = 0; uv && i < uv.count; i += 1) {
    spread = Math.max(spread, Math.abs(uv.getX(i)), Math.abs(uv.getY(i)));
  }
  // ExtrudeGeometry always emits shape-space metres; the ratio heuristic serves only foreign
  // geometry (it misjudged a 0.31 m well block as normalised and magnified one ashlar 2.6x).
  const world = geometry.type === 'ExtrudeGeometry' || (Boolean(uv) && spread / span < WORLD_UV_RATIO);
  return { repeat: (world ? 1 : span) / (tile_m || 1), mode: world ? 'world' : 'normalised' };
}

/** The family's maps at one repeat. `repeat` lives on the texture, not the material, so two meshes
 *  needing different repeats cannot share one: the second gets a clone, which shares the canvas
 *  `source` and costs no second upload. Skipping it made a 0.16 m timber wear a 0.08 m peg's. */
function mapsAt(family, options, repeat, anisotropy) {
  const base = surfaceMaps(family, options);
  const key = `${family}|${options.seed}|${options.size}|${repeat.toFixed(4)}|${anisotropy}`;
  if (!cache.has(key)) {
    const tuned = { tile_m: base.tile_m };
    for (const name of ['map', 'normalMap', 'roughnessMap']) {
      tuned[name] = base[name].clone();
      tuned[name].repeat.set(repeat, repeat);
      tuned[name].anisotropy = anisotropy;
      tuned[name].needsUpdate = true;
    }
    cache.set(key, tuned);
  }
  return cache.get(key);
}

/** Swap every mapped material in `group` for a textured clone; unmapped colours stay flat. One
 *  clone per source material uuid *and repeat*. `dispose()` releases the clones only. */
export function applySurface(group, { families = {}, seed = 1, size = 1024, anisotropy = 4 } = {}) {
  const swapped = new Map(), unmapped = new Set(), uv = new Set();
  group.traverse(object => {
    if (!object.isMesh && !object.isInstancedMesh) return;
    const family = familyFor(object, families);
    if (!family) {
      if (object.material?.color) unmapped.add('#' + object.material.color.getHexString());
      return;
    }
    const style = STYLE[family];
    const fit = repeatFor(object, style.tile_m);
    uv.add(fit.mode);
    const key = `${object.material.uuid}|${fit.repeat.toFixed(4)}`;
    let material = swapped.get(key);
    if (!material) {
      const maps = mapsAt(family, { seed, size, tile_m: style.tile_m }, fit.repeat, anisotropy);
      material = object.material.clone();
      Object.assign(material, { map: maps.map, normalMap: maps.normalMap,
                                roughnessMap: maps.roughnessMap });
      // three multiplies roughnessMap into material.roughness, so an unadjusted map can only
      // make a surface glossier than T1. Divide by the map's mean to keep the authored feel.
      material.roughness = Math.min(1, material.roughness * 2 / (1 + style.rough));
      material.needsUpdate = true;
      swapped.set(key, material);
    }
    object.material = material;
  });
  return {
    materials: [...swapped.values()], unmapped: [...unmapped], uv: [...uv],
    dispose() {
      for (const material of swapped.values()) material.dispose();
      swapped.clear();
    }
  };
}

/** Occlusion, ground dirt and edge wear, in the one order that leaves the colour attribute valid:
 *  edge wear seeds it, vertexColors goes on once it exists, bakeVertexAO multiplies on top. */
function occlude(group, materials, options) {
  const geometries = new Set();
  group.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
  for (const geometry of geometries) edgeDarken(geometry, options.edge ?? 0.2);
  for (const material of materials) material.vertexColors = true;
  const baked = bakeVertexAO(group, { samples: options.samples ?? 24,
                                      radius: options.radius_m ?? 0.45,
                                      groundDirt: options.ground_dirt_m ?? 0.6 });
  if (baked?.skipped) {
    group.traverse(object => object.geometry
      && groundDirtGradient(object.geometry, options.ground_dirt_m ?? 0.6, 0.35, object.matrixWorld));
  }
  return baked;
}

/** Everything a tier does *after* the geometry exists: surface, occlusion, the info block. Split
 *  from buildKit so the harness can finish a loaded glTF the same way (blueprint-views.js). */
export function finishKit(built, { tier = 'T1', surface = {} } = {}) {
  const info = { tier, surface: null, ao: null };
  if (tier !== 'T2') return { ...built, info };
  const started = now();
  const applied = applySurface(built.group, surface);
  info.surface = { seed: surface.seed ?? 1, size: surface.size ?? 1024,
                   materials: applied.materials.length, unmapped: applied.unmapped,
                   uv: applied.uv, ms: round(now() - started) };
  const at = now();
  try {
    info.ao = { ...occlude(built.group, applied.materials, surface.ao ?? {}),
                ms: round(now() - at) };
  } catch (error) {
    // A T2 without occlusion is honest, one that fails to build is not; the skip reason is logged.
    for (const material of applied.materials) material.vertexColors = false;
    info.ao = { skipped: error.message, ms: round(now() - at) };
  }
  return { ...built, info, dispose: applied.dispose };
}

/** The one entry point for a module: build a kit at a tier. `create` never learns about tiers.
 *  A raw `create({tier: 'T2'})` returns T1 - the module has no tier branch by design. */
export function buildKit(factory, { tier = 'T1', surface = {}, ...params } = {}) {
  return finishKit(factory(params), { tier, surface });
}

export { THREE, bakeVertexAO, groundDirtGradient, edgeDarken };
