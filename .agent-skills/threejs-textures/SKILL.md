---
name: threejs-textures
description: >
  Load, configure, and optimize Three.js textures: color space, wrapping, filtering,
  mipmaps, UV transforms, normal/AO/PBR maps, cube and HDR environments, data/canvas/video
  textures, render targets, texture memory, and disposal. Use when images look wrong,
  UVs repeat incorrectly, HDR/IBL is needed, or texture quality and GPU memory need tuning.
  Triggers on: Three.js texture, TextureLoader, UV mapping, color space, sRGB, mipmap,
  anisotropy, normal map, environment map, cubemap, HDR texture, render target, video texture.
allowed-tools: Bash Read Write Edit Glob Grep
license: MIT
metadata:
  tags: three.js, textures, uv, color-space, hdr, environment-map, render-target, webgl
  version: "1.0"
  source: https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-textures
---

# Three.js Textures

Use this skill for texture assets, UV behavior, color/data interpretation, environment
maps, and GPU texture memory. Route asset transport/decoder setup to `threejs-loaders`,
PBR material semantics to `threejs-materials`, and direct lighting decisions to
`threejs-lighting`.

## When to use this skill

- Load and configure base-color, normal, roughness, metalness, AO, emissive, or alpha maps
- Fix color mismatch, blurry/distant images, seams, bad repeats, incorrect UVs, or missing AO
- Use HDR/cubemap environments, canvas/video/data textures, or render targets
- Reduce texture memory, resolution, sampling, or duplicated GPU allocations

## Instructions

### Step 1: Classify every texture by meaning

1. Identify whether the texture stores visible color or non-color data.
2. Use the renderer/version's documented color-space settings for visible color textures;
   do not apply display color treatment to normal, roughness, metalness, depth, or data maps.
3. Confirm the mesh has the UV channel the material map expects. Ambient occlusion often
   needs a second UV set depending on the material and asset pipeline.

```js
const baseColor = await new THREE.TextureLoader().loadAsync("/textures/albedo.jpg");
baseColor.colorSpace = THREE.SRGBColorSpace;
baseColor.wrapS = THREE.RepeatWrapping;
baseColor.wrapT = THREE.RepeatWrapping;
baseColor.repeat.set(2, 2);
```

### Step 2: Choose sampling and wrapping from visual evidence

| Need | Setting direction |
|---|---|
| Tileable map | Repeat/mirrored wrapping and intentional `repeat` |
| Hard pixel-art texture | Nearest filtering, no accidental mip blur |
| Normal 3D asset | Mipmaps plus appropriate min/mag filtering |
| Oblique surface detail | Anisotropy within measured device limits |
| Cutout alpha | Correct material alpha policy, not texture filtering alone |
| Dynamic canvas/video | `CanvasTexture` / `VideoTexture` with lifecycle control |

Do not set maximum anisotropy globally by habit. Query hardware capability and use a
quality tier based on actual visual value.

### Step 3: Handle environment and render textures as GPU resources

An HDR/equirectangular texture generally requires the renderer-version-appropriate
preprocessing path before use as a PBR environment. Set `scene.environment` and
`scene.background` separately according to the intended effect. A render target's texture
is produced by a render pass and must be resized/disposed with that pass.

### Step 4: Budget memory and ownership

Texture memory scales with dimensions, mip levels, format, and copies—not only file size.
Reuse immutable texture instances, avoid loading the same URL through multiple owners, and
release feature-owned textures/render targets when their last user unmounts.

```js
function disposeTexture(texture) {
  texture?.dispose();
}
```

Do not dispose a texture held by another material or shared asset cache.

### Step 5: Verify visual correctness and lifecycle

- Test base-color, normal, roughness, metalness, AO, and emissive maps under representative
  lights and color management.
- Inspect UV seams and repeat orientation on the actual mesh.
- Test the target device/profile for memory pressure and frame-time behavior.
- Resize render targets, stop/release video resources, and dispose feature-owned GPU textures.

## Examples

### PBR texture set

Wire each map to its semantic material property, set color space only for visible color
maps, and validate the asset's normal-map convention. A flat or inverted normal look is
usually map convention, tangent/UV, or color-data handling—not a roughness issue.

### Dynamic video surface

Create `VideoTexture` from an explicitly owned video element, handle play/pause/error and
cross-origin setup, and dispose the texture plus media resource according to the UI lifecycle.

## Best practices

1. Distinguish display color from numeric data before setting color space.
2. Keep UV channel expectations explicit in the asset pipeline.
3. Use texture dimensions and compression appropriate to the device budget.
4. Reuse shared textures and dispose only when their final consumer is gone.
5. Treat render targets and video/canvas textures as active lifecycle resources.

## References

- [Three.js Textures source coverage](https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-textures)
- [Texture documentation](https://threejs.org/docs/#api/en/textures/Texture)
- [Three.js manual: textures](https://threejs.org/manual/#en/textures)
