# Critique rubric: judging your own materials

Use after every stage gate. Render first
(`M.preview(objs, out, rigs=("studio", "backlit", "roughness"))`, EEVEE and Cycles), open the sheet,
then walk the list. Each item says what an expert looks at and how to check it in code where
possible. Score each section pass / fix; fix before moving on.

## 1. Values (before anything else)

- Albedo reads as a plausible surface color on the Diffuse Color pass with Standard view, not lit
  color (Kaspar). Code: `M.value_report(objs)["albedo_srgb_max_channel"]`; dielectrics roughly sRGB
  30 to 240, metals 180 to 255 [added, Substance PBR guide].
- No pure white and no pure black surfaces; sclera and teeth off-white (Kaspar, kAdgrBS4eDA
  [01:36:52]).
- Metallic is a mask: 0 or 1, fractional only in transitions (Ryan King, Price: delete an all-black
  metallic map). Code: `metallic_grey_fraction` under 0.05 (live Bevel/AO wear exceeds this until
  baked).
- Scanned sets: AO multiplied into base color unless true displacement is used; albedo otherwise
  free of baked lighting (Price). Stylized unlit art: light painted in on purpose, and it reads with
  no lights (`rigs=("unlit",)`, Abbitt).
- Skin hue leans red, not orange; darker skin lightens toward light brown around brows, cheeks and
  nose, lips darker and more saturated (Kaspar, 0vGNOtX9iPk [01:01:46], [01:23:46]).

## 2. Roughness (the map that sells the surface; framing [added]: Kaspar puts micro detail here, Price varies it everywhere)

- In the `roughness` rig (Base Color black), the surface still tells its story: breakup, zones, wear
  smoother or rougher than the base. Uniform roughness reads CG. Code: `roughness_std` above 0.01.
- Skin: forehead, nose, cheeks and lids glossier; chin and brows rough; lips glossy; palms and
  fingertips not sweaty; nails and fingertips consistent (Kaspar).
- Pores readable up close, invisible noise at mid distance (Kaspar, D7kuKx7BV1A).
- Worn metal edges smoother than the paint; dirt rougher than the base.

## 3. Masks and detail placement

- Every variation follows form: cheek highlight follows the cheek, wear on convex edges, dirt in
  cavities and on up-facing surfaces, streaks run down (Kaspar, 0vGNOtX9iPk [01:36:46]); grime
  follows water paths, corners and openings, in big, medium and small shapes, checked against a
  photo reference (Price).
- Masks reach 0 and 1 (contrast through a ramp); a mask that stays mid-gray does nothing (Price,
  Ryan King).
- Tiling breaks up at viewing distance: no visible repeat (Price's sun-fade and grime masks).
- Each layer earns its place: mute effect groups one at a time (`node.mute = True`) and compare
  renders (Price).
- Chosen restraint: variation where it adds definition, nothing where it distracts ("they all choose
  very well where to put the colors and where to leave them out", 0vGNOtX9iPk [01:35:31]).
- Crossing masks do not leave holes; creases darken, never lighten (Kaspar, uTjfRGGV6ys).
- Painted contributions blend in at distance and do not read as strokes (Kaspar, uTjfRGGV6ys
  [01:52:08]).
- No visible UV seams in painted or baked maps: render views that cross seams (`test_uvpaint.py`
  style).

## 4. Bump and normals

- Bump subtle, not stepped, not plastic; Distance in real units (Kaspar). Code: `audit_material`
  warnings.
- Normals combined by chaining Bump nodes or Add + Normalize, never raw Add (Kaspar). Code:
  `audit_material` error.
- Normal maps through a Normal Map node, Non-Color, correct green convention (OpenGL in Blender;
  DirectX sets `convention='DIRECTX'`).
- Never a normal map and true displacement from the same set (Price; `audit_material` error).
  Displacement: Simple subdivision, shade smooth, Cubic height, Scale set deliberately (5.2 default
  0.01; Poliigon 0.2); grazing-light render shows relief at the silhouette without terracing.
- Modeled wrinkles are not re-enhanced in the shader (Kaspar, uTjfRGGV6ys [01:28:51]).

## 5. Light response

- Backlit: ears, nostrils, lids, lips and fingers glow red; forehead, jaw and palm center stay
  opaque; frontal view not waxy (Kaspar, D7kuKx7BV1A).
- From below and hard backlight: no surprises (bump artifacts, unexpected shine).
- Hair: streaky, stylized highlights, less shine at the silhouette (Kaspar, 8GD1C9qLi-4).
- Eyes: pupil centered from the side through the cornea, shimmer on the lower iris, highlight small,
  sclera not blown out (Kaspar).

## 6. Engines and portability

- EEVEE and Cycles nearly identical side by side (Kaspar). If not: Bevel, Pointiness, anisotropy or
  AO in the tree (Cycles-only or different in EEVEE), EEVEE refraction thickness, SSS differences.
- Anything a game engine or EEVEE needs is baked; baked material rebuilt from the maps matches the
  procedural one except resolution (Kaspar, EDEMbeZfVcc [00:46:36]).
- Color spaces right on every image; images saved (`image.is_dirty` False); glTF export carries base
  color, metallic-roughness, normal and (if wanted) occlusion.

## 7. Node tree hygiene

- Frames and labels per channel (base color, SSS, roughness, bump), shared masks as node groups
  placed next to consumers, named reroutes; someone else can read it (Kaspar, EDEMbeZfVcc
  [00:06:04]; Price: label as you build).
- Noise Detail at most 5 or 6 (Price: cost doubles per level); scale applied on objects using Object
  coordinates or physical UV scale; texture scale checked against a human reference (Price).
- Materials named with the asset prefix; no leftover placeholder or grid materials; `diffuse_color`
  set for solid view.
- Every image node has an explicit UV map or vector input (Kaspar, kN5aq1qXUCE [02:16:08]).

## Report format

State per section: pass or the fix applied, with the metric (value_report numbers, audit findings)
and the sheet path you looked at. Say what was not verified (for example "EEVEE not checked", "no
backlit render").
