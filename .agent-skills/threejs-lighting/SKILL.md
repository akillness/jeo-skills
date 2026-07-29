---
name: threejs-lighting
description: >
  Design and debug Three.js lighting with directional, point, spot, hemisphere, and area
  lights, shadow maps, image-based lighting, environment maps, light helpers, and
  performance budgets. Use when lighting a 3D scene, configuring shadows, setting up HDR
  illumination, matching a visual reference, or fixing dark, flat, or expensive renders.
  Triggers on: Three.js lighting, directional light, point light, spot light, shadows,
  shadow map, ambient light, HDR environment, IBL, environment map, light helper.
allowed-tools: Bash Read Write Edit Glob Grep
license: MIT
metadata:
  tags: three.js, lighting, shadows, environment-map, ibl, hdr, pbr, webgl
  version: "1.0"
  source: https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-lighting
---

# Three.js Lighting

Use this skill for light selection, shadow behavior, and image-based illumination. Route
PBR surface settings to `threejs-materials`, HDR/environment asset setup to
`threejs-textures`, and screen-space effects to `threejs-postprocessing`.

## When to use this skill

- Light a scene with physically meaningful direct and ambient/environment contribution
- Configure directional, point, or spot shadows without uncontrolled quality cost
- Set up an HDR environment for PBR reflections and diffuse illumination
- Diagnose black, flat, overexposed, acne-prone, or performance-heavy lighting

## Instructions

### Step 1: Start from material and exposure reality

1. Confirm the mesh uses a light-reactive material such as `MeshStandardMaterial`; an
   unlit `MeshBasicMaterial` cannot demonstrate lighting changes.
2. Establish renderer color/tone settings before compensating with arbitrary light values.
3. Decide whether the scene needs direct lights, image-based lighting, or both. A single
   ambient light hides shape; use it sparingly as fill, not as an all-purpose fix.

### Step 2: Choose the narrowest light model

| Visual requirement | Default |
|---|---|
| Sun/moon-like directional source | `DirectionalLight` |
| Local bulb or small emitter | `PointLight` |
| Cone/projector with falloff | `SpotLight` |
| Soft sky/ground fill | `HemisphereLight` |
| Large studio panel | `RectAreaLight` |
| PBR reflection and ambient response | Environment map / IBL |

```js
const key = new THREE.DirectionalLight(0xffffff, 3);
key.position.set(4, 6, 3);
key.castShadow = true;
scene.add(key);
scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x223344, 1));
```

Use helpers during setup, then remove or gate them in production views.

### Step 3: Make shadows intentional

```js
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

mesh.castShadow = true;
mesh.receiveShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 0.5;
key.shadow.camera.far = 30;
```

Tighten the shadow camera/frustum around real casters and receivers. Increase map size,
number of shadow-casting lights, or update frequency only after profiling target hardware.
Address acne/peter-panning by checking geometry scale, bias, and normal bias—not by
blindly pushing values until artifacts invert.

### Step 4: Add image-based lighting when PBR requires it

Load and preprocess an HDR/equirectangular asset through the appropriate loader/PMREM
path for the installed Three.js version. Set `scene.environment` for material response;
set `scene.background` separately when the environment should also be visible.

### Step 5: Verify look and budget

- Compare the material response with shadows off/on, direct light only, and IBL only.
- Test shadow edges, moving casters, and objects near the light's shadow bounds.
- Profile on target devices with real scene density before raising quality tiers.
- Verify teardown disposes feature-owned environment/render resources through the
  texture-loading owner.

## Examples

### Small product presentation

Use a key directional/area source, low-intensity fill, and an environment map. Do not
simulate every studio bounce with many shadowed point lights; PBR environment lighting is
usually more stable and cheaper.

### Outdoor scene

Use one directional sun, a sky/ground hemisphere contribution, and a bounded shadow
camera that follows the visible play/view area only when required.

## Best practices

1. Light for material response, not only for a bright screenshot.
2. Keep shadow casters/receivers and the shadow frustum as small as the visual need allows.
3. Use environment maps for PBR instead of stacking ambient lights.
4. Tune tone mapping/exposure at the renderer level before distorting every light.
5. Treat every shadow quality increase as a measured performance tradeoff.

## References

- [Three.js Lighting source coverage](https://github.com/CloudAI-X/threejs-skills/tree/main/skills/threejs-lighting)
- [Lights documentation](https://threejs.org/docs/#api/en/lights/Light)
- [Three.js manual: shadows](https://threejs.org/manual/#en/shadows)
