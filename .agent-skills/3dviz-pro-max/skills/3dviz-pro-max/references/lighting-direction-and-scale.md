# Lighting direction, scale and ownership

Use this when lighting must explain form, survive a scene-scale change, or switch between states.
Start from the intended image: decide which edges, surfaces, routes or details the light should reveal.
Numeric defaults are starting points to adapt under the chosen camera, exposure, materials and scale.

## Make direction visible

- Define a key by azimuth and elevation, then derive its position or direction from those values.
- Verify direction controls from a view with an informative receiver or occluder: lit faces and,
  where enabled, cast shadows should respond to the actual light direction. Symmetry or occlusion
  can hide the effect in a particular view; do not add fake pixel changes to pass a check.
- Name the emitter owner and receiver owner. A lantern owns its bulb and local light; nearby walls,
  ground and props receive that light. Keep both sides in the same coordinate system.
- Model the fixture as part of the optical path. An opaque sealed floor can block the downlight that
  the composition needs; use an open frame, aperture or deliberate bounce instead of raising ambient.
- Directional and local lights can coexist when each has a clear job. Moon shadows are allowed when
  deliberate; do not disable or add them merely because a retrieved mood profile used another choice.

## Rescale local lights deliberately

Three.js `SpotLight.intensity` is luminous intensity in candela when physically correct lighting is
used. Its cone points from the light toward `target`; `distance` limits influence and `decay = 2`
gives inverse-square falloff. See the official [Three.js SpotLight documentation](https://threejs.org/docs/pages/SpotLight.html).

The glTF punctual-light transform changes a light's position and direction, but node scale does not
change its range or intensity. The extension also defines inverse-square point and spot attenuation.
See [KHR_lights_punctual: light transforms and attenuation](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_lights_punctual/README.md#range-property).

For a **uniform full-scene rescale** by `s`, preserving the same inverse-square point/spot appearance
at corresponding surfaces and fixed exposure gives the derived relation:

```text
distance' = s × distance
range'     = s × range
intensity' = s² × intensity
```

This is a rendering-equivalence derivation, not a physical law saying a smaller lamp emits less. It
does not scale directional-light intensity. Re-derive when exposure, materials, light size, decay,
geometry proportions or the desired image also change.

Object transforms move a child light, but scalar settings such as range, intensity, shadow near/far
and bias still need explicit review. Obtain the final world position after normalization before
placing scene-owned lights, or keep the light and fixture under the same transformed owner.

## Fit shadows to the final world

- Fit a directional shadow camera to visible receivers, not to authoring-space dimensions. An
  oversized volume spends shadow texels on empty space.
- Set point/spot shadow near and far planes around the useful pool. Tiny normalized scenes need much
  smaller values than metre-scale source scenes.
- Tune bias and normal bias at final scale. A bias copied from a large scene can detach contact
  shadows or erase small details.
- Choose shadow casters from the composition and runtime cost. Two shadow-casting practicals may fit
  one scene; it is not a universal quota. Inspect the selected hero light and likely occluders.

## Preserve the authored darkness

- A night image should serve its chosen art direction. Shaped pools, silhouettes and warm/cool
  separation are useful options, not required treatments. Judge fill and colour through the intended image.
- Keep a visible emitter aligned with every practical light. Emissive material shows the source;
  the PointLight or SpotLight illuminates receivers. One does not replace the other.
- Isolate the contributing source classes that actually exist in the rig, then compare the combined
  result from one camera at fixed exposure. Test exposure separately so it does not hide an aiming error.
- Keep controls truthful. Pause/resume must affect motion in the active view, and lighting sliders
  must update the authoritative light state and visible readout.
- On day/night switches, restore background, fog, environment, exposure, light visibility and any
  temporarily changed emissive or surface materials. Preserve the user's pre-existing motion choice;
  a diagnostic mode may start paused, but should not silently overwrite the surrounding scene's
  preference or re-pause after the user resumes. Preserve camera state unless the control promises a view
  reset. Give light/material mutations one owner and dispose resources once.

Useful catalog search candidates include `knowledge.emissive-practical-light-balance`,
`knowledge.lighting-mood-night-lantern` and `knowledge.gltf-punctual-light-units-handoff`. Resolve and
adapt them for the current scene; their presence does not establish that a rendered result was checked.
