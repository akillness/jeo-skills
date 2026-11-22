# 3D games

Most "3D" mobile games make a fine 2.5D playable. Decide the approach before any generation job
runs, write the choice and the reason in `analysis/brief.md`, and tell the user.

## Pick the approach

| Approach                       | When                                                                                                                        | Scenario jobs                                                                                        | Look                                                                                            | Size                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **2.5D from frames** (default) | the camera is fixed, side-on or top-down, or only pans (for example a 3D platformer with a fixed side camera)               | plate, sheets, logo, SFX, music                                                                      | the game's own art at phone size; depth faked with parallax, code-drawn faux-3D blocks, scaling | 0.6–0.9 MB                                                      |
| **Real 3D** (three.js + a GLB) | the camera moves freely through a 3D world: chase cams, banking tracks, flights (for example a racer down a twisting track) | the above plus a clean render, an image-to-3D mesh, a track texture                                  | real perspective, banking, speed; models are simplified (baked, unlit)                          | about 1.6 MB of the 2 MB Meta budget (three.js alone is 473 KB) |
| **Interactive video**          | the moment can't be rebuilt (cinematic, physics-heavy), and the choice is a branch: tap A or B, the clip plays              | one video clip per branch (generated, or the studio's own footage); nothing is playable between taps | the game's own look                                                                             | heavy: one clip per branch                                      |

Rule of thumb: **a fixed or side camera means 2.5D; a free 3D camera means consider three.js.**
Interactive video is a last resort for a single choice; it is not built or tested here.

## The pattern that worked: three.js inside the runtime's 2D canvas

three.js renders the world into an **offscreen WebGL canvas**, and the game draws that canvas into
the runtime's 2D canvas each frame. The runtime is unchanged: mute, hint hand, CTA pill, banners,
end card and every QA hook work exactly as in the 2D games.

```js
// build once (the game's init)
const cv = document.createElement("canvas");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
} catch (e) {
  W3.failed = true;
} // no WebGL: keep a 2D fallback (the sky plate) so the ad still plays
renderer.setPixelRatio(1);

// on resize: cap the buffer, keep a constant horizontal field of view
const v = PA.view,
  w = Math.round(Math.min(v.gw * v.dpr, 720)),
  h = Math.round((w * v.gh) / v.gw);
renderer.setSize(w, h, false);
camera.aspect = v.gw / v.gh;
camera.fov =
  (2 * Math.atan(Math.tan(((HFOV / 2) * Math.PI) / 180) / camera.aspect) * 180) / Math.PI; // HFOV = 46
camera.updateProjectionMatrix();

// in game.draw: render, then draw the WebGL canvas into the 2D canvas in the same frame
renderer.render(scene, camera);
c.drawImage(cv, 0, 0, PA.view.w, PA.view.h); // then the 2D HUD, hand, banners on top
```

- **Draw right after `render()`** in the same frame. Then `preserveDrawingBuffer` is not needed.
- **Cap the WebGL buffer** at 720 px wide with pixel ratio 1. That is sharp enough under a 2D HUD,
  kind to low-end GPUs, and keeps QA runs inside `qa.py`'s wall-clock limit (headless Chromium
  renders WebGL in software, through SwiftShader).
- **Constant horizontal FOV:** portrait screens vary in height, not in what the player must see left
  to right. Fix the horizontal view (46° for a chase cam), derive the vertical one from the play
  area, and add FOV only for effects (a warp: +14°).
- **Physics in a plain JS file** (no three.js), shared by the game and a headless Node sim that runs
  the QA bot policies. Tune in the sim first; in one racer build the QA run matched the sim to 0.1
  s.

## Bundle three.js without loaders (about 473 KB)

`build.py` refuses `fetch(` in the game's own code. Stock three.js and `GLTFLoader` carry loader
code, so bundle only the classes you use, with no loaders, and load the model from a packed JS
include instead (`scripts/pack_glb.py`).

`vendor/package.json` (pin exact versions; keep it and the lock file, not `node_modules`):

```json
{ "private": true, "dependencies": { "three": "0.170.0", "esbuild": "0.24.0" } }
```

`vendor/entry.js`, which imports only what the ad uses:

```js
import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  Group,
  Mesh,
  Sprite,
  SpriteMaterial,
  MeshBasicMaterial,
  BufferGeometry,
  BufferAttribute,
  Float32BufferAttribute,
  PlaneGeometry,
  SphereGeometry,
  BoxGeometry,
  Texture,
  CanvasTexture,
  Vector3,
  Matrix4,
  Quaternion,
  Color,
  Fog,
  AdditiveBlending,
  DoubleSide,
  BackSide,
  SRGBColorSpace,
  RepeatWrapping,
  ClampToEdgeWrapping,
  LinearMipmapLinearFilter,
  LinearFilter,
} from "three";
window.THREE = { WebGLRenderer, Scene, PerspectiveCamera, /* ...the same list... */ LinearFilter };
```

Build from the project. Install first: `npm install --ignore-scripts --prefix vendor` on the first
build, which writes the lock file, then `npm ci --ignore-scripts --prefix vendor`.

```bash
ESB=$(ls vendor/node_modules/@esbuild/*/bin/esbuild | head -1)
"$ESB" vendor/entry.js --bundle --minify --format=iife --target=es2019 --legal-comments=none --outfile=src/three.min.js
! grep -q "fetch(\|XMLHttpRequest\|localStorage\|</script" src/three.min.js # must print nothing
```

Then in `src/index.src.html`, after the runtime and before the game:

```html
<!-- include: src/three.min.js -->
<!-- include: src/pod_mesh.js -->
```

Add a one-line MIT header to `three.min.js` (three.js is MIT). `build.py` treats `*.min.js` and
`vendor/` includes as third-party and does not scan them for `fetch`. The real guard is `qa.py`'s
`zero_network_requests`.

## A 3D model from frames (image-to-3D)

1. **Clean render first.** An image model (pick it with `recommend`), high quality, 1024²: one
   object, centered, plain mid-gray background, three-quarter view. Use crops of the frames where
   the object is sharpest as references, and "redraw at full detail, same design" in the prompt.
2. **Image-to-3D** on that render. Pick the image-to-3D model with `recommend` and check its schema
   with `model_schema_get` before the run. Settings: a face-limit or low-poly setting if the model's
   schema offers one (about 6,000 faces), standard texture, no PBR maps, no delighting (keeps the
   baked look for an unlit material), and alignment to the input image if offered. One run gave a
   usable mesh.
3. **Pack it:**
   `python3 $SKILL/scripts/pack_glb.py $P --glb assets/raw/pod.glb --name POD_MESH --yaw -10 --preview analysis/pod_axes.png`.
   This bakes node transforms, recenters, scales to radius 1, quantizes (int16 positions, uint16 UVs
   and indices) and writes base64 into `src/pod_mesh.js` (193 KB for 7.7k triangles). The texture
   goes to `assets/raw/pod_tex.jpg`, downscaled to 512². Decode code is in the script's docstring.

Caveats seen:

- 7.7k triangles came back for a 6,000-face limit.
- The GLB was 1.6 MB with a 2048² JPEG texture. Downscale it to 512.
- Alignment to the input image still left the model about 10° off in yaw. Read the angle from the
  `--preview` axis views and pass `--yaw`.
- glTF UVs need `texture.flipY = false` in three.js.
- Drop the normals and use `MeshBasicMaterial`: the baked texture carries the lighting, and the mesh
  gets smaller. It does not react to scene light (a warp glow), so fake that with sprites.

## Fidelity in 3D: match the camera framing

"Pieces at the game's scale" becomes **"camera at the game's framing"**. Measure on frames, then
match in the first QA hook frame:

- the hero's screen size and position (the pod's width as a share of the screen, its height from the
  bottom);
- the horizon height;
- the track or road width at the hero's position. Put a recording frame next to the hook in
  `COMPARE`.

## Sizes (one racer build)

Meta HTML 1,594 KB of 2,048: three.js 473, mesh 193, music 147, images 480, all × 1.33 as base64.
Keep the music short and images small: a 3D ad has little room left.

## QA

- WebGL works in the headless shell through SwiftShader. A full run takes about 2.5 min, against
  about 1 min for a 2D game.
- The bots can't see the 3D scene. Expose what they need in `qa()` (the best lateral line, whether a
  boost is good now) and the client-px positions of the 2D controls.
- Archive rule: keep `vendor/package.json`, the lock file and the built `src/three.min.js`; drop
  `node_modules` (38 MB; `npm ci --ignore-scripts` restores it).
