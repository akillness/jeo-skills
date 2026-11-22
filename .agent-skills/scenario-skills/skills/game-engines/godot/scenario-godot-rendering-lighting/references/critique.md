# Critique rubric (scenario-godot-rendering-lighting 0.1)

Use it on every contact sheet and capture you produce, in this order. Open the image (Read the PNG)
before scoring it, and score from pixels, never from the inspector. Where a number exists, write it
next to the verdict. Keep a sheet to 1600 px or less, and open single images only to inspect a
detail.

## 1. Value pattern (squint test)

- Run `gl.squint(img)` and open the result.
- Pass: one clear focal value (the lightest or highest-contrast area) on the subject, plus a
  readable silhouette against the background.
- Numbers from `look_checks`:
  - `focal_contrast` at least 0.05 when `focus` is given;
  - `range_p95_p05` above 0.25.
- Fail signs:
  - even gray everywhere (`flat_values`);
  - two competing bright areas;
  - the subject merges into the background (`subject_does_not_separate`).

## 2. Exposure and tone

- Pass: `clipped` (luma above 0.98) under 0.05 and `crushed` (below 0.02) under 0.3. Exceptions are
  allowed only when the brief asks for it (horror can crush, a snow scene can sit high).
- Check the guide spheres:
  - the white sphere is not a flat disc;
  - the dark sphere keeps a terminator;
  - the mirror shows sky and horizon.
- Tonemapper choice: name it and say why.
  - AgX holds hue in emissive and saturated highlights (P5).
  - ACES and Filmic brighten the mids and push orange toward yellow.

## 3. Color intent

- `warm_cool_split` above 0 means warm lights and cool shadows; below 0 means the reverse. It should
  match the brief.
- Saturation: no unintended neon (stray glTF emission), and no gray unless grayscale is intended.
  The `greyscale` flag confirms intended monochrome post.
- Practicals: each visible lamp or candle has a light of its color, and artificial light stays below
  the sun outdoors.

## 4. GI and shadow artifacts (close-ups)

- **Leaks**: light under walls or at room corners; for SDFGI and VoxelGI, look at the inside of the
  sealed room.
- **Lightmaps**: UV2 seams, black texels and blotches from the denoiser. At Low quality some seams
  are expected; recheck at the final quality.
- **SDFGI**: blotches from captures before 40 frames; cascade shifts when the camera moves (use a
  capture sequence).
- **Shadows**:
  - acne stripes mean the bias is too low;
  - peter-panning means the bias is too high;
  - visible cascade seams mean Blend Splits is off;
  - shadows that pop in mean max distance is too short.
- **Banding** in the sky or in fog: turn on debanding.

## 5. Atmosphere

- Fog adds depth, so far objects lose contrast, but it does not wash the frame: the p95 to p05 range
  should stay within about 0.1 of the no-fog range [added].
- God rays: shafts are visible only when the light passes through an opening the camera looks
  across. Haze alone does not count as god rays (P10).
- Glow: halos stay on the emitters, with no full-screen bloom wash.

## 6. Renderer and tier parity

- Put the target renderers side by side (`capture_renderers`). List what each one drops, from the
  WARNING lines and from the image.
  - On Mobile the glow halo shape changes.
  - Compatibility is brighter and washed out, so retune it or accept it explicitly.
- The low tier sheet keeps the same mood and focal area. If it does not, the base look relies on
  Forward+-only effects: move the mood into fog, glow, tonemap, lightmaps and probes.

## 7. Cost

- GPU ms per tier, measured on Vulkan, fits the budget, with 20 percent headroom for gameplay
  [added].
- No single effect costs more than its visual contribution. For example, volumetric fog size 512 at
  +3.9 ms is only worth it when the fog is a hero element.

## Verdict format

```
Sheet: <path>
Verdict: ship / iterate / reject
Value: <pass|fail> (focal_contrast 0.12, range 0.31)
Tone: <pass|fail> (clipped 0.00, crushed 0.01, AgX)
Colour: <...>
Artifacts: <list or none>
Parity: <what mobile/compat lose>
Next change: <one variable to sweep next>
```

Change one variable per iteration, and stop after three iterations without improvement. Then change
the approach (GI method, light placement), not the slider.
