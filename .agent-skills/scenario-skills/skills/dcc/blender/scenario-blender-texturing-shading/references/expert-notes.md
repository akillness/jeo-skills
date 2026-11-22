# Expert notes: texturing and shading

The judgment behind SKILL.md, by expert, with video id and timestamp (`[hh:mm:ss]`). Video ids
resolve to `https://www.youtube.com/watch?v=<id>`; details in `sources.md`. [added] marks the skill
author's own additions; "measured" marks facts established by the tests in
`tests/code/blender-texturing-shading/`.

---

## Julien Kaspar (Blender Studio), Snow stylized character shading lives, 2021

Eight livestreams, Blender 3.0 alpha, Principled BSDF v1 and EEVEE Legacy. One expert, so
"consensus" below means convictions he repeats across sessions. Values quoted are his; version
translations are marked.

### Method: layered masks in nodes

- Flat base colors per material first, then black/white masks mixed in nodes, "very non-destructive,
  like Substance" (0vGNOtX9iPk [00:05:14], [02:04:38]). Masks are later reused for roughness, SSS
  and bump (0vGNOtX9iPk [02:05:50]).
- Masks gate procedural textures rather than tint: "not just adding color, but adding textures via
  masks" (kN5aq1qXUCE [01:03:05]).
- Start skin darker and build value up by painting brightness in (0vGNOtX9iPk [00:18:50]).
- Lips mask inverted and multiplied into the brighter/darker masks so brightening never touches the
  lips (0vGNOtX9iPk [01:04:32], [01:20:46]).
- Vertex colors vs texture paint: vertex colors for broad soft masks on a dense retopo (fast, blur
  works, no UVs) (0vGNOtX9iPk [01:19:25]; D7kuKx7BV1A [00:21:38]); texture paint when vertex
  resolution shows (hands) or for height and streaks (kN5aq1qXUCE [00:58:32]; uTjfRGGV6ys
  [00:55:37]). Deciding condition: mask frequency against vertex density.
- Color attributes are per face corner: face masking gives hard borders (nails), vertex masking soft
  ones (0vGNOtX9iPk [02:06:31]).
- Name color attributes `col_*`: attribute pickers mix them up with UV maps (kN5aq1qXUCE
  [01:34:39]).
- Keep the whole character at a consistent level of progress, not the skin finished first
  (kN5aq1qXUCE [01:08:24]).
- Organize as you go: frames, labels, color codes, node groups, named reroutes; a shared mask
  becomes a node group duplicated next to each consumer instead of long crossing links (kN5aq1qXUCE
  [00:42:16]; EDEMbeZfVcc [00:07:09], [00:08:17]).

### Judging values

- Diffuse Color view with the Standard view transform: "whatever is a value of one, I want that to
  be white" (0vGNOtX9iPk [00:09:32]; kN5aq1qXUCE [00:45:55]). In 5.2 the default is AgX, Standard
  still exists.
- Matcap sculpting made his characters too pale, darker skin tones especially (0vGNOtX9iPk
  [00:07:51]).
- Neutral mid-gray non-gradient background; an HDRI like the forest one tints everything green
  (0vGNOtX9iPk [00:13:20], [01:58:52]).
- Isolate channels by unplugging or muting links: base color to black to read bump and reflections,
  normal off to read roughness (kN5aq1qXUCE [01:26:09]; D7kuKx7BV1A [01:19:36]).
  `M.preview(rigs=("roughness",))` automates this.
- Test under many lights, including a light from below that most HDRIs cannot give (D7kuKx7BV1A
  [00:28:31], [00:40:50]); a strong backlight reveals bump too (uTjfRGGV6ys [01:43:52]).
- EEVEE for iteration (viewport samples 1 while painting), Cycles as the reference; Cycles exposed
  an unnormalized-normal bug EEVEE hid (uTjfRGGV6ys [01:21:33], [01:25:29]; D7kuKx7BV1A [00:39:44]).
- EEVEE loses fine texture detail when zoomed out; judge fine texture at working distance
  (kAdgrBS4eDA [00:25:37]).

### Skin (Snow #6 is the key session)

- SSS makes stylized skin read as skin; its amount follows anatomy: "anything where the light
  passing through would be obscured by bone, less light would actually come through" (D7kuKx7BV1A
  [00:20:31]). High: earlobe, tragus, nose wings and tip, eyelids, lips inside and out, fingers and
  fingertips, thumb pad. Low: brows, forehead, cheekbones, jaw, palm center, back of hand
  (D7kuKx7BV1A [00:12:43], [00:38:36], [00:43:05]).
- Mask pure black/white, Map Range sets the actual values: min 0.02, max 0.06 then about 0.15 (v1
  "Subsurface") (D7kuKx7BV1A [00:16:39], [00:40:17]). Translation: in v1 that input also multiplied
  the radius, which is Subsurface Scale in v2. Measured in 5.2 (Random Walk rescaled): 0.02 to 0.15
  turned a 0.33 m head's ears white-pink and waxy under a backlight; 0.005 to 0.04 gave the red glow
  he describes (`test_skin.py`, sss sheets).
- Increasing SSS makes skin waxy; use it as variation (D7kuKx7BV1A [00:09:49], [00:44:14]). A small
  SSS value costs about as much render time as a large one (D7kuKx7BV1A [00:51:34]).
- Backlit test rig: rotate the HDRI to backlight, add area lights straight behind the head at power
  50, plus a light from below (D7kuKx7BV1A [00:14:27], [00:16:06], [00:40:50]). Ears, lips and
  fingers should glow red, the frontal view should not look waxy (D7kuKx7BV1A [00:17:13]).
- SSS color inherited the darkening masks of the base color network and darkened the upper lip; he
  duplicated the network into its own "SSS" frame (D7kuKx7BV1A [00:24:31]). 5.2 has no Subsurface
  Color: the SSS albedo is Base Color; redden via Subsurface Radius or a separate Subsurface
  Scattering node [added].
- Fact-check the SSS color against subdermal references: redder than the surface (D7kuKx7BV1A
  [00:10:21]).
- Pores in roughness, not bump: "I want that to be not in the bump for extra skin detail, but in the
  roughness" (D7kuKx7BV1A [01:00:38]). Voronoi Smooth F1 (no cell cracks), scales 100 and 200 (first
  tries 250) mixed by a detail-0 noise, general noise mixed at 0.2 to 0.25; pores slightly glossier,
  cracks rougher (D7kuKx7BV1A [01:01:10], [01:06:38], [01:09:10], [01:20:47]).
- Base skin roughness 0.68 then 0.72 (D7kuKx7BV1A [01:18:28]); a later check found skin too wet at
  0.44 and raised it (8GD1C9qLi-4 [02:13:18]). Rough mask remapped to 0.72 to 1 (D7kuKx7BV1A
  [01:24:15]).
- Face roughness zoning: glossier forehead, nose, cheeks, under the eyes and lids, a bit on the ear;
  lips and inner mouth fully glossy; shaved chin rough; brows not glossy (D7kuKx7BV1A [01:26:22],
  [01:31:20]). Check palms and fingertips: they easily go sweaty; shiny fingertips next to rough
  nails make no sense (8GD1C9qLi-4 [02:15:32], [02:25:33]).
- Wet mouth without touching specular: keep 0.5, tongue roughness about 0.4 with strong waxy SSS,
  teeth roughness 0.4, slight SSS, cream color (D7kuKx7BV1A [00:50:05], [00:50:52]).
- Paint region masks as black/white plus Map Range, not absolute painted values that get color
  managed (D7kuKx7BV1A [01:21:56]).
- Stylized restraint: no wrinkles or realistic imperfections, but "the details that are there should
  be a reflection of how the real materials behave" (D7kuKx7BV1A [00:29:03]).
- Stubble and hairline: keep flat, gradient to skin color bottom to top, a little detail for
  directional shine, a touch of SSS to blend into flesh (8GD1C9qLi-4 [02:02:25], [02:07:46],
  [02:11:20]).

### Eyes (Snow #5)

- Procedural rather than painted; Rain's painted iris looked worse and was less adjustable
  (kAdgrBS4eDA [01:04:50]).
- One object per eye with its origin at the eyeball center, mirror modifier removed, stray keys
  cleared; object-space gradients break if the eye is stretched in edit mode (kAdgrBS4eDA
  [01:12:07], [01:17:07], [01:25:07]).
- Spherical gradient in object space, two Color Ramps for iris and pupil, a Linear Light mix with
  noise to break the circles without moving them, darker limbal rim via Multiply (kAdgrBS4eDA
  [01:10:25], [01:19:30], [01:21:40]). Implementation note [added]: a gradient centered on the
  eyeball center is constant over the eyeball surface, so `stylized_eye` measures distance from the
  front pole instead.
- Never pure white sclera: "just like there is no 100% black anywhere on any surface, there's no
  100% white"; tint toward flesh at the edges (kAdgrBS4eDA [01:22:52], [01:36:52]).
- Iris streaks from a Voronoi stretched along one axis (kAdgrBS4eDA [01:30:35]); `stylized_eye`
  builds radial streaks from polar coordinates [added].
- Iris: gray with a hint of blue, too saturated or green reads creepy (kAdgrBS4eDA [01:57:47]);
  later darker, deeper blue and metallic for the shine of a real iris (D7kuKx7BV1A [00:00:35]).
- Deepen the iris indentation so the refracted shimmer catches light only on the lower iris
  (D7kuKx7BV1A [00:01:52]); refraction re-spheres the concave iris, IOR matters, depth barely
  (kAdgrBS4eDA [01:43:13]).
- Cornea: Transmission 1, low roughness; he used Glossy + Refraction through a Mix Shader because v1
  specular would not go low enough, and Add Shader is not physically correct (kAdgrBS4eDA
  [01:41:28], [01:44:49]). Cornea casts no shadow (kAdgrBS4eDA [01:42:39]). Pupil mask into specular
  so the pupil has no highlight (kAdgrBS4eDA [01:46:40]).
- 5.2 translation, measured: EEVEE needs Material Output Thickness 0 on the cornea shell or it
  magnifies the iris across the eye; `visible_shadow = False` is honored by EEVEE and Cycles.
- Scale the pupil to its neutral size (about 0.7) before baking so a dilation shape key does not
  stretch the bake (kAdgrBS4eDA [01:48:26], [01:50:38]).
- Subtle bump from the gradient through Map Range (Color Ramps clip) at strength 0.1 (kAdgrBS4eDA
  [01:53:47], [01:55:34]).

### Cloth, seams, painted height

- Photo textures contribute only their structural pattern: blur until the weave disappears, Grain
  Extract against the original, keep the difference as a mask (rKVeLjxZzTc [00:02:47], [00:04:03]).
  `M.high_pass` is the numpy equivalent.
- Use a color map only as pattern: saturation 0, value lowered, multiplied into the flat color
  (kN5aq1qXUCE [01:17:00]).
- Bump: lower Distance (about 0.001), Strength 0.1 to 0.2 for fabric (kN5aq1qXUCE [01:23:24]);
  displacement maps Non-Color (kN5aq1qXUCE [01:30:28]).
- Straightened UV strips as coordinate systems: Separate XYZ on a strip UV gives band masks for hems
  (Greater Than hard, Map Range soft), and a second texture branch on a rotated UV map turns the
  weave on the hem (kN5aq1qXUCE [01:45:30], [01:56:20]).
- Stitches: a stitch-row texture at the bottom of the UV tile with strips laid flat on it;
  consistent texel density across strips or stitch size varies (8GD1C9qLi-4 [00:13:16]; rKVeLjxZzTc
  [01:36:02]).
- Crossing masks multiply into holes: process lines separately and combine after; creases multiply
  darker, never lighten (uTjfRGGV6ys [00:48:52], [00:49:27]).
- Painted height: 2K, 32-bit float, base 0.5, Non-Color (he forgot, chat caught it); non-destructive
  but clips at the texture range and never changes the silhouette (uTjfRGGV6ys [00:55:37],
  [01:39:56], [01:44:30]). Do not re-sculpt modeled wrinkles in the shader (uTjfRGGV6ys [01:28:51]).
- Combining bumps: Vector Math Add then Normalize fixed a wrong glossy look in Cycles (uTjfRGGV6ys
  [01:24:56], [01:25:29]); chaining Bump nodes is the cleaner standard [added], and what
  `pbr_from_textures` does.
- One painted 0.5-based color-variation map split by Color Ramps into a bright (Add wash) and a dark
  (Multiply) mask; height times fabric structure through a high-contrast ramp gives acid wash on
  raised areas only (rKVeLjxZzTc [02:04:12]; kAdgrBS4eDA [00:24:56]).
- Keep clothing simple: some wear and variation, never realistic or distracting (rKVeLjxZzTc
  [01:58:09]).
- UVs outside 0..1 are wrong for painting and tileable images, fine as procedural coordinates
  (rKVeLjxZzTc [00:57:07]).
- Custom logo: a "logo" UV map projected from view on the front faces, all other UVs scaled to zero
  in a corner (EDEMbeZfVcc [00:50:36]). `M.add_decal` parks other loops outside 0..1 with Extension
  CLIP instead.

### Hair shading

- Stylized hair: extra detail without realism, no bump or strand detail, "a bit brush-strokey"
  (8GD1C9qLi-4 [00:56:53]). Micro detail in roughness (D7kuKx7BV1A [01:59:21]).
- Real anisotropy in Cycles from a Tangent node on a strand-aligned UV map, streak texture into
  Anisotropic Rotation in a 0 to 0.5 range; fake anisotropy node group for EEVEE; separate EEVEE and
  Cycles material outputs (D7kuKx7BV1A [01:55:27], [02:13:27]; 8GD1C9qLi-4 [01:09:34], [01:13:56]).
  Measured: EEVEE 5.2 still renders Principled anisotropy isotropic.
- Fresnel through Map Range (not Color Ramp) added to roughness so hair is less shiny at the
  silhouette; clamp or the shader breaks (8GD1C9qLi-4 [00:52:07], [00:54:13]).
- Through-the-clump streak painting: Normal falloff, Occlude and Backface Culling off so one stroke
  passes through the whole object (8GD1C9qLi-4 [00:47:42]). Measured in the GUI test: equal paint on
  front and back.

### Baking, presentation, housekeeping

- Procedural is fine for Cycles (Sprite Fright mostly unbaked); bake for portability and for EEVEE
  load time; ship the asset baked, keep procedural networks separately (EDEMbeZfVcc [00:04:55],
  [00:48:13], [00:53:04]). Bake is flattening a layer stack (EDEMbeZfVcc [00:38:16]).
- Bake recipe: Emit via a Node Wrangler preview, margin 8 px, 30+ samples (1 only for flat color,
  "one sample is not a good idea for normal maps"), disable the Mask modifier's render visibility,
  validate by rebuilding the material from the maps (EDEMbeZfVcc [00:31:58], [01:21:12], [01:36:11],
  [00:45:28]). Details in scenario-blender-uv-baking.
- Stylized diffuse maps may carry a bit of AO or lighting; he does not strictly separate albedo from
  diffuse (EDEMbeZfVcc [01:34:26]).
- Global clay and wire switch: a node group in every material driven by one custom property (clay:
  diffuse 0.6 gray, SSS 0, roughness 0.6) (EDEMbeZfVcc [00:15:26], [00:17:04]).
- Camera-ray world: camera sees flat gray, the HDRI lights the character; "a really neat trick that
  I'm basically always using" (8GD1C9qLi-4 [00:35:14], [00:35:50]).
- Autosave does not save painted images: save or pack them (8GD1C9qLi-4 [01:22:36]). 5.2 release
  notes say autosave now covers texture paint; a headless script still has to save explicitly.
- Viewport display colors: pick each material's diffuse color into `diffuse_color` for animators
  (kAdgrBS4eDA [01:05:09]).
- UDIMs are little used at the studio because procedural detail plus low-resolution masks suffice
  (kAdgrBS4eDA [00:11:43]); used on Snow's body for export (EDEMbeZfVcc [00:54:33]).

---

## Measured facts added by this skill (5.2.1)

- EEVEE: Bevel node gives no edges (Edges mask mean 0.0016 vs 0.111 in Cycles); AO node works but
  differs (screen space); Principled anisotropy ignored; Geometry Pointiness and Random Per Island
  constant (std 0.001 and 0.0 vs 0.013 and 0.288 in Cycles,
  `tests/code/blender-texturing-shading/probes/probe_pointiness.py`, `probe_island.py`); box
  projection matches Cycles; Grunge/Variation noise identical.
- Bevel/AO masks are stochastic per sample: thresholded metallic 0% fractional at 1 spp, 17 to 18%
  at 16 and 128 spp.
- Noise Texture Fac clusters in about 0.3 to 0.7; stretch before using as breakup.
- Cornea shell needs Thickness 0 in EEVEE; raytrace refraction off hides the eye.
- Texture paint: strokes issued before a redraw are occluded by the previous draw's depth buffer
  (162 texels in one run, full coverage in another; about 14,000 after a redraw every run); scripted
  strokes place one dab per point; factory paint color black.
- New FLOAT_COLOR attributes start white (1, 1, 1, 1).
- `bmesh.ops.create_uvsphere(calc_uvs=True)` writes UVs only into an existing UV layer.

## Andrew Price (Blender Guru, founder of Poliigon): "How to Texture in Blender", 2024

1h53 course on Blender 4.2, frames checked by the distiller. The most complete realistic workflow in
the sources. Video uHCJoNEWjXo.

### Stance

- Production realism = scanned PBR set plus procedural and painted masks on top; hundred-node
  full-procedural materials are a game-pipeline niche, "almost never done" in VFX or animation
  [00:08:02]. Deciding condition against Kaspar and Ryan King: realistic hero surfaces take scans;
  stylized, file-free or endlessly variable assets go procedural.
- Every map but base color is data, Non-Color: "it's not about what looks better or what you can
  see, it's what's actually correct" [00:21:29], [00:22:03].
- "The normal map and the displacement map should not be used together" (confirmed by Brecht): same
  relief, doubled bump, and a normal map on true displacement wrecks it; Node Wrangler and the
  Megascans importer get this wrong [00:29:57], [00:41:59]. Keep the normal map only if you never
  displace or combine heights [00:39:47].
- Texturing is mostly shader work: reuse the maps you have (displacement as a detail source for
  masks) instead of raising paint resolution [01:12:45], [01:18:48].
- "You have to label what you're building as you build it" [00:58:32].

### PBR base

- A texture is a per-pixel slider: a flat 0.2 gray Non-Color image into Roughness equals Roughness
  0.2 [00:02:50].
- Real sizes: an 8 x 4 m wall, then 10 x 5 m so one 2.5 m texture tile maps exactly, scale applied
  [00:09:08], [00:19:58]. Keep a human scale reference in the scene [01:26:41].
- Download: 8K for a large wall, JPEG is fine for color and data, displacement 16-bit TIFF; skip ORM
  (for real-time) [00:15:32], [00:16:07].
- AO: Mix Color Multiply, A = base color, B = AO, factor 1 ("crank it all the way up almost
  always"): the flash-lit capture removed cavity shadows; optional under true displacement
  [00:22:36]-[00:26:23].
- All-black metallic map: delete it, it only costs render time [00:26:54].
- Normal Map node, not a direct link; yellow into purple is the missing-converter hint [00:27:25].
- True displacement: Displacement node into Material Output Displacement, Material Settings
  "Displacement and Bump", Subdivision Surface Simple (Catmull-Clark rounds the corners), shade
  smooth, Cubic interpolation on the height image, Poliigon Scale 0.2 (a fixed 20 cm range) and
  Midlevel 0.5 [00:32:05]-[00:39:15], [01:16:38]. EEVEE cannot do displacement only; it shows
  Displacement and Bump [00:32:50].
- Normal maps survive 8-bit; grayscale displacement needs 16-bit; bump derived from a grayscale map
  is worse than a normal map (slope from neighboring pixels) [00:37:36].
- Judge relief with a grazing sun in Cycles (sky strength 0.15, sun about 15 degrees): "our wall is
  paper thin" was the failure [00:35:56], [00:37:04].
- Node Wrangler Principled Setup needs fixing: normal plus displacement both wired, Linear, Scale 1,
  metallic added, no AO [00:41:59]. `M.pbr_from_textures` does not repeat these.

### Masks and layers

- Color tweaks non-destructively: HSV after the AO multiply, hue shifts of about 0.04 only; frames
  show saturation 0.9, value 1.2 to 1.4 [00:47:10]-[00:50:22].
- Sun-fade mask: Noise (UV coordinates; Generated stretches) into a Color Ramp with stops pulled to
  about 0.47 and 0.71 so the mask reaches 0 and 1 [00:50:55]-[00:55:50]. Noise Detail cost roughly
  doubles per level: "I wouldn't go over like five or six" [00:57:26].
- The Mix Color node is the workhorse: A = previous color, B = effect color, Factor = mask
  [01:00:11], [01:23:29].
- Vertex colors for environment masks: image painting on tiling UVs repeats every stroke, needs a
  second UV map, wastes the image on long walls and must be redone when the layout changes;
  resolution is the vertex count, so subdivide (20 cuts) with high Subdivision modifiers lowered and
  hidden first (crash) [01:03:20]-[01:09:40]. Attribute node names are exact and case-sensitive
  [01:38:39].
- Color Burn: painted mask (A) burned by a contrast-ramped displacement map (B) breaks soft
  low-resolution paint along individual bricks; flip the ramp to move the effect into the grout;
  works at mid and low paint strength only [01:12:13]-[01:20:26]. Setting the effect Mix to Multiply
  turns B's value into an opacity control [01:19:22].
- Decal: Alpha into the Mix Factor, Extension Clip, Mapping for size and position; chain order sets
  age (under grime = older) [01:22:23]-[01:29:26].
- Roughness: never unplug the map to get the slider back; HSV Value below 1 shinier, above 1 duller;
  wet leaks = Mix toward a target roughness by the mold mask; the wall's roughness is about 0.7
  [01:29:38]-[01:36:14]. Every property varies somewhere, "like in games" [01:34:35].
- Efflorescence: the same group with a flipped ramp in Screen (Add exceeds 1) [01:38:07]-[01:40:48].
  Spalling: Subtract on the height before the Displacement node (factor about 0.14) and brighten the
  same area's color because fresh breaks have no grime [01:44:33]-[01:50:57].
- Masks follow reality: moisture in corners and around windows, big, medium and small shapes,
  compared against a photo reference throughout [01:02:53], [01:42:58].
- Paint while viewing the final shader, not the mask [01:21:32]; mute layers one at a time (`M`) to
  see each contribution [00:48:18].

## Grant Abbitt (Gabbitt): texture painting 2021, 4.0, 4.3, 5.1

Videos WjS_zNQNVlw, E29D9rS8op8, _-zAhCOUpog, 7kSRXnAi7uA. Long-running Blender educator (GameDev.tv
courses).

- Setup: apply scale before unwrapping [E29D9rS8op8 00:00:33]; Smart UV Project island margin 0.01
  to 0.05, larger when the texture will be downscaled for a game [E29D9rS8op8 00:01:40; WjS_zNQNVlw
  00:01:27]; Texture Slots > Base Color 2048 x 2048, alpha off, filled with the dominant color
  [E29D9rS8op8 00:02:45]; bleed 12 px ("a really good idea") [E29D9rS8op8 00:04:21]; paint in
  Material Preview [00:03:18].
- The image is saved separately from the .blend; a star marks unsaved paint [WjS_zNQNVlw 00:02:50;
  7kSRXnAi7uA 00:06:31].
- Texture paint projects the brush in screen space: strokes stretch on faces angled away and vanish
  at edges; paint facing the surface [_-zAhCOUpog 00:02:13]. No layers: Erase punches alpha (needs
  an alpha channel); the practical eraser is sampling the base color and painting it back
  [00:07:05], [00:07:38].
- 4.3 brush assets: Paint Hard (no pressure), Paint Hard Pressure (size), Paint Soft (strength),
  Paint Soft Pressure (both), Blur, Smear (blends more easily than Blur), Clone (source at the 3D
  cursor), Fill (strength 1 fills everything), Erase variants, Mask (needs a stencil image; give it
  a fake user) [_-zAhCOUpog 00:04:24]-[00:09:16]. Custom textured brush: duplicate the asset, white
  color, saturation 0, image texture, Anchored stroke, then "Save Changes to Asset" or the edits are
  lost [00:09:49]-[00:11:28].
- Stylized painted light (5.1): "the extremities you make lighter and the crevices you make darker";
  start with a vertical gradient fill (dark bottom, light top); crevices with a darker color at
  strength about 0.25; edge highlights with a near-white brush in Screen; global darkening with a
  black Fill in Multiply at about 0.1 per tap ("Multiply is pretty much the same as darken, but it
  does it slightly better"); light only the crack edge facing the light; Smear to blend harsh lines
  [7kSRXnAi7uA 00:07:35]-[00:19:01]. Deciding condition against Price: stylized or unlit game art
  paints light into the albedo; PBR keeps albedo clean.
- Judge hand-painted textures unlit: image straight into Material Output, or Solid with Flat
  lighting [7kSRXnAi7uA 00:12:27]. `M.preview(rigs=("unlit",))` and `M.painted_light` implement
  both.

## Ryan King (Ryan King Art): procedural nodes and texture painting

Videos 5B244CYX1Tw, 4d4N8d4ki2Y, 6jT4K0JpGNs. Author of procedural material packs.

- Object coordinates for procedurals ("for most procedural textures you're going to use object"),
  after applying scale; Generated stretches [5B244CYX1Tw 00:38:37], [00:40:12].
- Metallic 1 for metal, 0 otherwise; texture it only where the two mix [5B244CYX1Tw 00:18:15].
- Object Info Random into a Color Ramp gives each duplicate its own color from one material
  [5B244CYX1Tw 00:45:06]. Pointiness is a free cavity/edge mask, Cycles only, density dependent
  [00:41:19] (measured: EEVEE constant).
- A mostly mid-gray factor blends weakly: add contrast before using it as a mask [5B244CYX1Tw
  01:00:03] (measured: Noise Fac clusters in 0.3 to 0.7).
- Never plug height into Normal: Bump node [5B244CYX1Tw 00:54:20].
- Painted bump: a 0.5-gray image through a Bump node; black carves, white raises; view in Material
  Preview [4d4N8d4ki2Y 00:44:43]-[00:47:24].
- Islands as large as possible, no overlaps, inside 0..1; fill a new image with the dominant color;
  4K for a hero stylized prop [6jT4K0JpGNs 00:04:36]-[00:08:39]. Stroke spacing and jitter for dots,
  Line stroke for straight lines [6jT4K0JpGNs 00:18:59].

## Surfaced Studio: texture painting starter (3.3)

Video ywR8HsNeXQQ.

- Texture Slots mode Material, not Single Image: paints every channel of every material [00:05:07].
- Most failures are state: wrong object holds the paint icon, missing UVs or image, a brush texture
  or texture mask, stroke settings; Load Factory Settings when lost [00:03:08], [00:28:21],
  [00:42:03].
- Face-selection paint masks stored as vertex groups give clean region borders
  [00:16:32]-[00:18:49].
- "Your texture mask defines where you paint, the texture defines what you're painting with"
  [00:33:25]. Roughness painted black (shinier) and white (rougher) through a Voronoi texture mask
  gives irregular patches [00:37:42]-[00:41:30].

## NoPoly and YanSculpts

- NoPoly (nQaUsgf9ZUg, self-described non-expert): UV coordinates for images, Object for procedurals
  [00:07:21]; the Mix factor only reads black and white, colors go in A/B [00:18:12]; a stretched 3D
  procedural (wood grain, Mapping scale (3, 3, 0.1), distortion 2, detail 5) only reads right on two
  axes [00:10:14], [00:11:20].
- YanSculpts (kbyK_N65YEk): course trailer, no technique; only a layer order for painted skin (base,
  variation, imperfections, freckles; separate gray maps for bump, specular and SSS) [00:02:24].

## Disagreements and deciding conditions (whole skill)

| Topic                | Positions                                                                                                                            | Deciding condition                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Procedural vs images | Price: scans plus masks; Kaspar, Ryan King: procedural                                                                               | realistic hero surface vs stylized or variable asset                                                                       |
| Normal vs height     | Price: one or the other; importers wire both                                                                                         | displacement or height combining planned: displacement; export or 8-bit: normal map                                        |
| Where masks live     | Kaspar, Price: vertex colors; Abbitt, Ryan, Surfaced: images                                                                         | mask frequency vs vertex density; tiling UVs and changing layouts favor vertex colors; export and fine detail favor images |
| Light in albedo      | Abbitt paints light (unlit art); Price keeps albedo clean, AO multiply only for scans; Kaspar allows a bit of AO in stylized diffuse | unlit or stylized game art vs PBR render                                                                                   |
| AO                   | Price: multiply at 1 for scanned sets; game engines keep it separate (ORM) [added]                                                   | render with no true displacement vs real-time export                                                                       |
| Seam bleed           | Kaspar 8 px, Abbitt 12 px                                                                                                            | more when textures get downscaled                                                                                          |
| Bake                 | Kaspar: at the end, for portability; Price: large environment detail stays in the shader (baking it would be "ginormous")            | export target or EEVEE load time vs Cycles render                                                                          |
