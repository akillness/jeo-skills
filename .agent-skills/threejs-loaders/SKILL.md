---
name: threejs-loaders
description: >
  Load and manage Three.js assets with LoadingManager, GLTFLoader, DRACOLoader,
  KTX2Loader, texture/HDR loaders, async error handling, caching, progress reporting,
  and resource ownership. Use when importing GLB/GLTF models, textures, HDR assets, or
  compressed geometry, or when fixing slow, failed, duplicated, or leaky asset loads.
  Triggers on: Three.js loader, GLTFLoader, GLB, glTF, DRACOLoader, KTX2Loader,
  LoadingManager, texture loader, HDR loader, loading progress, asset cache.
allowed-tools: Bash Read Write Edit Glob Grep
license: MIT
metadata:
  tags: three.js, loaders, gltf, glb, draco, ktx2, assets, loading-manager, webgl
  version: "1.0"
  source: https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-loaders
---

# Three.js Loaders

Use this skill for asset fetch/decode lifecycle, loader configuration, caching, progress,
and cleanup. Route what happens after a model loads to `threejs-animation`,
`threejs-materials`, `threejs-textures`, or `threejs-geometry`.

## When to use this skill

- Load GLB/GLTF models, textures, cubemaps, HDR/EXR assets, or other Three.js formats
- Configure Draco and KTX2 transcoding with paths compatible with the deployment
- Convert callback-based loading into a cancellable/observable feature boundary
- Diagnose missing assets, CORS failures, decoder path errors, duplicated fetches, or leaks

## Instructions

### Step 1: Inspect deployment and asset constraints

1. Confirm the installed Three.js revision and import add-ons from that project's supported
   path, typically `three/addons/...`.
2. Determine asset URLs after the bundler/base-path transform; do not hard-code a local
   development path that will fail in production.
3. Verify licensing, size budget, compression, CORS, and the runtime support required by
   the asset before adding a loader or decoder.

### Step 2: Configure loading once per asset pipeline

```js
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const manager = new THREE.LoadingManager();
manager.onError = (url) => console.error(`Failed to load ${url}`);

const draco = new DRACOLoader(manager);
draco.setDecoderPath("/draco/");

const loader = new GLTFLoader(manager);
loader.setDRACOLoader(draco);
const gltf = await loader.loadAsync("/models/product.glb");
scene.add(gltf.scene);
```

Own and reuse configured loaders. Configure DRACO/KTX2 decoders before the first request;
verify deployed decoder files and MIME types with the browser network panel.

### Step 3: Separate transport, preparation, and ownership

| Phase | Responsibility |
|---|---|
| Fetch/decode | Loader and `LoadingManager` |
| Normalize | Name validation, scale/origin policy, material/animation preparation |
| Cache | Explicit asset key and shared ownership policy |
| Attach | Feature owns scene attachment and per-instance state |
| Dispose | Release only resources no live consumer shares |

Return a typed asset result or throw a contextual error. Avoid swallowing load errors and
rendering a silent empty scene. Cache the decoded shared asset only when consumers agree
on mutability; clone scene graphs before per-instance mutation.

### Step 4: Handle progress and failures honestly

Use `LoadingManager` for aggregate progress, but treat byte progress as optional because
servers may omit content lengths. Render a recoverable loading/error state in the host UI
and include the failed URL and status context in diagnostics.

### Step 5: Verify production behavior

- Test a clean-cache production build, not only a development server.
- Test an unavailable asset, decoder URL failure, slow response, and unsupported format.
- Confirm GLTF animation/model name assumptions with the actual exported asset.
- Mount/unmount or replace assets repeatedly; no retained scene nodes or duplicate fetches
  should accumulate.

## Examples

### Load an HDR environment

Use the matching HDR/EXR loader, then hand the texture to `threejs-textures`/`threejs-lighting`
for renderer-version-appropriate prefiltering and environment ownership.

### Load multiple assets

Create an explicit promise boundary such as `Promise.all` only when the feature needs all
assets before it can render. For progressive scenes, attach safe independent assets as they
arrive and keep a known fallback/error state for each.

## Best practices

1. Reuse configured loaders and managers instead of creating them on every render.
2. Treat decoder/transcoder directories as deployable application assets and test them.
3. Use GLB/GLTF as the primary model interchange; add legacy loaders only for real inputs.
4. Cache shared immutable assets and clone per-instance scene state deliberately.
5. Dispose decoders and feature-owned Three.js resources during teardown.

## References

- [Three.js Loaders source coverage](https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-loaders)
- [GLTFLoader documentation](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)
- [Three.js manual: loading 3D models](https://threejs.org/manual/#en/loaders)
