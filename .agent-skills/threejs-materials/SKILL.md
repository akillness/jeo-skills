---
name: threejs-materials
description: >
  Choose, configure, and optimize Three.js mesh materials: basic, Lambert, Phong,
  Standard, Physical, toon, points, lines, and shader-backed surfaces; PBR maps,
  transparency, environment reflections, cloning, and disposal. Use when styling meshes,
  tuning PBR, fixing transparency or material sharing bugs, or reducing material cost.
  Triggers on: Three.js material, MeshStandardMaterial, MeshPhysicalMaterial, PBR,
  roughness, metalness, transparency, environment map, mesh surface, material clone.
allowed-tools: Bash Read Write Edit Glob Grep
license: MIT
metadata:
  tags: three.js, materials, pbr, meshstandardmaterial, meshphysicalmaterial, transparency, webgl
  version: "1.0"
  source: https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-materials
---

# Three.js Materials

Use this skill for mesh surface semantics and cost. Route image maps/UVs/HDR assets to
`threejs-textures`, lighting and shadow setup to `threejs-lighting`, and custom GLSL to
`threejs-shaders`.

## When to use this skill

- Select a material type that matches unlit, classic-lighting, PBR, stylized, or custom work
- Configure base color, metalness, roughness, normal/AO/emissive maps, and environment response
- Fix transparency sorting, invisible backsides, unexpectedly shared edits, or material leaks
- Reduce material variants, shader complexity, or draw-call fragmentation after profiling

## Instructions

### Step 1: Choose the simplest material that expresses the intent

| Requirement | Default material |
|---|---|
| No lighting / debug / sprite-like mesh | `MeshBasicMaterial` |
| Low-cost classic diffuse scene | `MeshLambertMaterial` |
| Classic specular look | `MeshPhongMaterial` |
| Normal physically based surface | `MeshStandardMaterial` |
| Clearcoat, transmission, advanced PBR | `MeshPhysicalMaterial` |
| Cel-shaded style | `MeshToonMaterial` |
| Custom vertex/fragment program | `ShaderMaterial` via `threejs-shaders` |

Start with `MeshStandardMaterial` for normal PBR work, then add physical features only
when their visual benefit justifies the shader cost and renderer support.

### Step 2: Set PBR inputs coherently

```js
const material = new THREE.MeshStandardMaterial({
  color: 0x9ca3af,
  metalness: 0.65,
  roughness: 0.28,
  map: baseColorTexture,
  normalMap,
  roughnessMap,
  metalnessMap,
  envMapIntensity: 1,
});
```

Base-color textures need the correct color-space configuration; data maps such as normal,
roughness, metalness, and AO do not use the same display color treatment. See
`threejs-textures` for map loading and UV-channel requirements. Evaluate material values
under representative lights and an environment map, not in an unlit empty scene.

### Step 3: Handle transparency explicitly

Use `transparent: true` only when alpha blending is necessary. Set `depthWrite`,
`side`, `alphaTest`, and `renderOrder` based on a diagnosed visual requirement; broad
render-order overrides can hide an underlying sort problem. Prefer alpha test for hard-cut
foliage/decals when it satisfies the desired appearance.

### Step 4: Respect material ownership

Materials are commonly shared. A mutation to `mesh.material.color` changes every consumer
of that material. Clone before per-object changes, keep the clone's lifecycle explicit,
and call `dispose()` when its final consumer leaves.

```js
const uniqueMaterial = sharedMaterial.clone();
mesh.material = uniqueMaterial;
uniqueMaterial.color.set("#3b82f6");
```

### Step 5: Verify look and cost

- Test direct light, environment response, shadows, and a neutral background.
- Test transparent objects overlapping one another and opaque geometry.
- Inspect whether a change creates many distinct material/program variants.
- Test cleanup for replaced or cloned materials and their owned maps.

## Examples

### Metal product surface

Use `MeshStandardMaterial`, a calibrated base color, metallic/roughness maps, and an HDR
environment. A metallic object with no environment has little to reflect; adding arbitrary
point lights is not a substitute for the missing IBL signal.

### Per-object highlight

Clone a shared material only if the highlight cannot be represented through a uniform,
instance attribute, outline pass, or other non-duplicating mechanism. Restore/dispose it
when selection changes.

## Best practices

1. Match material choice to the rendering intent before adjusting many parameters.
2. Keep texture color-space and UV-channel rules correct; a wrong map interpretation is
   not fixable with roughness guesses.
3. Minimize material variants in repeated geometry.
4. Measure expensive physical/transmission features on target devices.
5. Dispose clones and their feature-owned textures, but never dispose shared assets early.

## References

- [Three.js Materials source coverage](https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-materials)
- [Materials documentation](https://threejs.org/docs/#api/en/materials/Material)
- [Three.js manual: materials](https://threejs.org/manual/#en/materials)
