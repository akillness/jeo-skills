# Godogen engine guides

Condensed from the guides at upstream commit
`05cebffc8b10c5817e8a3db495b82e7b6004ab84`. Match every recipe to the installed engine or
package version before changing a real project.

## Godot 4 C# lane

### Stack and project shape

- Godot 4 .NET/Mono build, C#, and Jolt physics for 3D
- every Godot C# class is `partial`
- `project.godot` version fields and `Godot.NET.Sdk`/`TargetFramework` match the installed
  Godot and .NET versions
- `{ProjectName}.csproj` matches `assembly_name` and enables dynamic loading
- runtime code under `scripts/`, scenes under `scenes/`, runtime-loaded files only under
  `assets/`

Build gate:

```bash
dotnet build
godot --headless --import
godot --headless --quit
```

Run import again after asset changes. Headless RID warnings at exit can be benign.

### Build-time scene generation

Godogen writes one-shot C# `SceneTree` builder scripts and runs them headlessly to emit
`.tscn` scenes:

```bash
godot --headless --script scenes/BuildX.cs
```

Builder rules that can fail silently:

1. set every generated node's `Owner` to the scene root or it will not serialize;
2. do not recurse into instantiated GLB or `.tscn` nodes with a nonempty `SceneFilePath`, or
   imported meshes can be inlined into enormous text scenes;
3. count nodes before packing, instantiate the packed scene, compare counts, and save only on
   a match;
4. call `SetScript()` last because it disposes the current C# wrapper;
5. build leaf scenes before parent scenes.

For imported GLBs, measure the `MeshInstance3D` AABB and use a primitive box, sphere, or capsule
collider. `CreateTrimeshShape()` and `CreateConvexShape()` on imported meshes can collapse
performance.

Other silent traps:

- procedural meshes need normals and correct winding to receive shadows;
- packed `MultiMeshInstance3D` plus GLB can lose the mesh;
- raycasts may miss `ConcavePolygonShape3D`;
- `.gdignore` makes the importer skip a directory without an obvious failure;
- guessed C# enum names are often wrong because examples skew toward GDScript;
- use exponential, delta-based damping rather than per-tick multiplication.

### Proof video

Use hardware Vulkan for correct video. Software Vulkan can still produce stills but should be
reported rather than presented as equivalent video proof.

```bash
godot --headless --import
godot --write-movie screenshots/result/frame.png \
  --fixed-fps 30 --quit-after 450 --script test/Presentation.cs
ffmpeg -y -framerate 30 -pattern_type glob \
  -i 'screenshots/result/frame*.png' \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart \
  screenshots/result/video.mp4
```

On headless Linux, run under Xvfb with a 1920x1080x24 screen and the real Vulkan ICD. Position
the camera during builder setup or `_Initialize`; Godot renders the first movie frame before
`_Process`. Drive scripted capture input, not live keys.

## Bevy Rust lane

### Version and project rules

- use current stable Bevy and Rust edition 2024;
- let `cargo add bevy` resolve the version, then pin the exact result;
- keep every `bevy_*` crate on the same minor;
- verify APIs against installed crate source, `cargo doc`, and runtime errors rather than model
  memory;
- keep one crate with a thin `src/main.rs`, app wiring in `src/lib.rs`, feature plugins under
  `src/game/`, and runtime-loaded files only in `assets/`.

Build gate:

```bash
cargo fmt
cargo check
cargo build
```

Use development optimization for dependencies so iteration remains usable:

```toml
[profile.dev]
opt-level = 1
[profile.dev.package."*"]
opt-level = 3
```

Known traps:

- glTF JPEG textures require the Bevy `jpeg` feature or render white;
- UI box properties belong inside the `Node` component for current APIs;
- procedural mesh winding can make geometry invisible under back-face culling;
- a transform anchor with visible children needs both `Transform` and `Visibility`.

### Offscreen capture

Do not record the windowed binary on headless Linux. Use a dedicated
`src/bin/capture.rs` that reuses the real scene code and renders to a `RenderTarget::Image`.

Key rules:

1. disable the primary window and Winit; use `ScheduleRunnerPlugin`;
2. allocate the target image directly in the world before camera and `OnEnter` systems read
   it, because a deferred `Commands` insertion yields black frames;
3. point the camera at the image target and save with Bevy's screenshot observer;
4. wait for asynchronous saves before exit;
5. advance time manually at 1/30 second for deterministic motion;
6. run from the crate root so `AssetServer` resolves `assets/` correctly.

```bash
RESULT=screenshots/result/0
cargo run --bin capture -- frames "$RESULT" 450
ffmpeg -y -framerate 30 -i "$RESULT/frame%05d.png" \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart \
  "$RESULT/video.mp4"
```

Software Vulkan is acceptable for Bevy capture but slower. State which renderer produced the
proof.

## Babylon.js TypeScript lane

### Project and runtime

- Vite vanilla TypeScript
- `@babylonjs/core` and `@babylonjs/loaders`
- fullscreen canvas and `engine.runRenderLoop`
- gameplay under `src/`; generated runtime assets under `src/assets/`
- delta-based updates from `scene.onBeforeRenderObservable`

```bash
npm create vite@latest . -- --template vanilla-ts
npm install @babylonjs/core @babylonjs/loaders
npm install
npm run dev
npm run build
```

`npm run build` is a compile gate, not proof. Bind Vite to a shareable fixed endpoint:

```ts
server: { host: true, port: 5173 }
```

Give the user `http://<host>:5173` and keep the dev server running while iterating.

### Runtime traps

Import Babylon modules from package subpaths. Some capabilities rely on side-effect imports
that tree-shaking removes. If runtime says a feature must be imported before use, add the
specific registration import it names, including the GLTF loader when required.

For Havok:

- install `@babylonjs/havok`;
- serve `HavokPhysics.wasm` from `public/`;
- load it with `HavokPhysics({ locateFile: () => "/HavokPhysics.wasm" })`;
- register the physics side-effect module before using `PhysicsAggregate`.

### Browser capture

Capture the running dev URL with Playwright Core or headless Chrome. Wait until the scene has
rendered and textures/GLBs have loaded; use a game readiness flag or a bounded settle delay
after network idle.

On Linux, use Xvfb and request hardware Vulkan. Read the WebGL renderer string and warn if it
contains `swiftshader`, `llvmpipe`, or `lavapipe`.

For proof video, capture frames at about 30 fps for 15-20 seconds and encode:

```bash
ffmpeg -framerate 30 -i frame_%04d.png \
  -c:v libx264 -pix_fmt yuv420p proof.mp4
```

A valid clip shows gameplay changing throughout its duration. A blank first frame, one repeated
frame, or an unplayed video file is not proof.

## Shared completion gate

For every lane:

- compile/import passes;
- the game launches without structural errors;
- runtime assets load from their intended paths;
- the actual rendered result has been inspected;
- capture uses the intended renderer and shows progression;
- the final 15-20 second proof is watched back if the user did not see the live game.
