// The live hero: the crafted-village diorama at golden hour — its daylight studio rig under a dusk
// sky — at the exact camera the poster was shot from. Renderer settings are the breadth branch of
// examples/shared/standalone-runtime.js with the exposure opened and the key warmed (see below);
// any other drift here becomes a visible difference between the poster and the frame that
// crossfades over it (site/scripts/hero-poster-diff.py).
//
// Dormant: the shipped hero is a baked frame of the skill's village *kit*, a different model from
// examples/village, so nothing imports this module while HERO_LIVE_LOOK is null (hero-looks.ts).
// Kept, and kept compiling, for when a live look is re-enabled.
import * as THREE from 'three';
import { village } from '@examples/breadth/src/crafted-village.js';
import { breadth } from '@examples/catalog.js';
import { createStudioRig } from '@examples/lighting-studio.js';
import { createDuskSky } from './hero-dusk-sky';

const FOV = 38;
const ZOOM_ASPECT = 1.35; // the runtime zooms out on narrow viewports rather than crop the subject
const ORBIT_RATE = 0.02; // rad/s at the fastest point of the swing
const ORBIT_LIMIT = THREE.MathUtils.degToRad(8); // never drift further than this from the poster
const BREADTH_STUDIO = { subject: [0, 0.14, 0], distance: 1.4 };
/**
 * The craft branch of mountScene, warmed to golden hour: it runs the same rig at exposure .72 with
 * environmentIntensity .2 and the three panels at 60 % of their dark-studio strength. Golden hour
 * keeps the rig and the panel scale, opens the exposure to 1 and warms the key to the runtime's own
 * daylight key colour, so the island is lit rather than moonlit.
 */
const EXPOSURE = 1;
const ENVIRONMENT_INTENSITY = 0.4;
const PANEL_SCALE = 0.6;
const KEY_COLOR = '#fff0dd';
/** The study's own overview camera; the site and examples/village frame the island identically. */
const VIEW = breadth.village.views.overview;
/**
 * Distance multiplier on the study's camera, measured against the frame rather than guessed (phase
 * 3): 1 is the study's own view, which puts the diorama across only two thirds of a 16:9 frame — a
 * small island in a lot of sky. 0.82 brings that to ~80 % with the village still fully inside.
 * Applied inside createHeroScene, so the poster capture and the live hero cannot disagree about it.
 */
const FRAMING = 0.82;
const UP = new THREE.Vector3(0, 1, 0);

export interface HeroScene {
  /** Draws one frame and resolves `ready` on the first call. */
  render(): void;
  resize(width: number, height: number): void;
  /** Places the camera for `seconds` of idle orbit; 0 is the poster camera exactly. */
  setOrbit(seconds: number): void;
  dispose(): void;
  ready: Promise<void>;
}

export interface HeroSceneOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

/** Meshes, lines and points all carry the two fields the dispose walk needs. */
type Drawable = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
};

function isDrawable(object: THREE.Object3D): object is Drawable {
  return 'geometry' in object || 'material' in object;
}

function materialsOf(object: Drawable): THREE.Material[] {
  if (Array.isArray(object.material)) return object.material;
  return object.material ? [object.material] : [];
}

/** The dispose walk from standalone-runtime.js: every geometry, material and texture once. */
function disposeGroup(group: THREE.Object3D | undefined): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  group?.traverse((object) => {
    if (!isDrawable(object)) return;
    if (object.geometry) geometries.add(object.geometry);
    for (const material of materialsOf(object)) {
      materials.add(material);
      // Object.values on a Material is untyped; instanceof is the narrowing, not a cast.
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  group?.removeFromParent();
}

/**
 * createStudioRig builds its three panels in a loop, so the type inferred from the JS module has
 * no key/fill/rim members: narrow them back with instanceof instead of asserting a shape, and fail
 * loudly if the rig ever stops returning one of them.
 */
function panelOf(rig: Record<string, unknown>, name: string): THREE.RectAreaLight {
  const panel = rig[name];
  if (!(panel instanceof THREE.RectAreaLight)) {
    throw new Error(`hero: the studio rig has no ${name} panel`);
  }
  return panel;
}

/** Builds the village at golden hour on `canvas`. */
export async function createHeroScene({
  canvas,
  width,
  height,
}: HeroSceneOptions): Promise<HeroScene> {
  // Counter the phase-3 gate checks read: a page that must stay on the poster never increments it.
  window.__heroScenes = (window.__heroScenes ?? 0) + 1;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 200);
  const studio = createStudioRig(scene, renderer, BREADTH_STUDIO);
  const sky = createDuskSky();
  scene.background = sky;
  renderer.toneMappingExposure = EXPOSURE;
  scene.environmentIntensity = ENVIRONMENT_INTENSITY;
  const panels = { key: panelOf(studio, 'key'), fill: panelOf(studio, 'fill'), rim: panelOf(studio, 'rim') };
  for (const panel of Object.values(panels)) panel.intensity *= PANEL_SCALE;
  panels.key.color.set(KEY_COLOR);
  const model = await village();
  scene.add(model.group);

  const target = new THREE.Vector3().fromArray(VIEW.target);
  // The framing multiplier walks the camera along the study's view axis; the angle, and therefore
  // every shadow and highlight the studio rig computes, is untouched.
  const home = new THREE.Vector3().fromArray(VIEW.position).sub(target).multiplyScalar(FRAMING);
  const swing = new THREE.Vector3();
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  let disposed = false;

  function setOrbit(seconds: number): void {
    const angle = ORBIT_LIMIT * Math.sin((ORBIT_RATE / ORBIT_LIMIT) * seconds);
    camera.position.copy(swing.copy(home).applyAxisAngle(UP, angle).add(target));
    camera.lookAt(target);
  }

  function resize(nextWidth: number, nextHeight: number): void {
    if (!nextWidth || !nextHeight || disposed) return;
    renderer.setSize(nextWidth, nextHeight, false);
    camera.aspect = nextWidth / nextHeight;
    camera.zoom = Math.min(1, camera.aspect / ZOOM_ASPECT);
    camera.updateProjectionMatrix();
  }

  function render(): void {
    if (disposed) return;
    renderer.render(scene, camera);
    resolveReady();
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    model.dispose?.();
    sky.dispose();
    disposeGroup(model.group);
    studio.dispose();
    renderer.dispose();
  }

  setOrbit(0);
  resize(width, height);
  return { render, resize, setOrbit, dispose, ready };
}
