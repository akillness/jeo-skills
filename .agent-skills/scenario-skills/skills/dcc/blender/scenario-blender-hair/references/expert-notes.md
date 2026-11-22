# Expert notes: hair and fur

These are the principles and judgment calls of each expert, with timestamps `[hh:mm:ss]` into the
source video (full list in `sources.md`). Four talks were recorded on Blender 3.5 to 4.5. Where
5.2.1 behaves differently, it is marked **5.2**. `[added]` marks my own additions.

## Daniel Bystedt: human hairstyle as a layered node graph (BCON23, `Kx88edAbiek`)

**Core stance**

- Grow hair on a **separate hair cap mesh**, never on the body mesh, so topology or density changes
  on the character never break the groom `[00:02:19]`.
- Split the cap into pieces along the part (a hard edge) so interpolation does not blend hair across
  the part `[00:02:53]`. **5.2:** Interpolate's _Part by Mesh Islands_ (on by default) formalizes
  this. The test measured 21% of children near the part crossing it with islands off, 0% with
  islands on.
- Hand grooming sets only the big shapes. Overlap, clumping, tip curl and flyaways are procedural
  `[00:13:24]`.
- A realistic hairstyle is **stacked populations**: broad clumps, thin clumps, flyaways and a few
  art-directed strands, each its own branch, then joined `[00:01:43]`.
- The **parting line** is the recurring weak spot of every hair system (bald-looking, flat crown)
  and needs dedicated fixes `[00:31:29]`, `[00:33:15]`.
- Straight tips read as "bad CG hair". Real hair curves at the end "like a little whoop"
  `[00:14:32]`.

**Grooming judgment**

- Use Projected falloff to comb on a head. Sphere misses hair on the far side under the brush
  `[00:05:06]`.
- Grow/Shrink with Scale Uniform off, so hair extends along its direction `[00:05:41]`.
- Paint selection on the Curve domain, not Point `[00:07:24]`.
- Resample guides to 15 points before shaping long hair `[00:08:38]`.
- Groom one side of the part at a time: grow everything long, comb it into place, shrink back,
  "exactly how a professional hairdresser would do" `[00:09:52]`.
- Display Strip plus subdivisions before judging thickness `[00:10:23]`.
- Shrinkwrap Hair Curves with Above Surface 0 pushes out only points inside the cap, with an offset
  distance. He prefers it to sculpt collision for the offset `[00:11:33]`, `[00:12:09]`.

**Procedural layers**

- Noise: Cumulative Offset off, lower Scale along Curve (keeps length, less mess), Offset per Curve
  on for per-strand randomness `[00:13:24]` to `[00:14:32]`.
- Roll Hair Curves with a short roll length so only the tip rolls, plus random orientation
  `[00:15:08]`, `[00:15:44]`.
- Interpolate at density 5,000 per square unit for a population, then thin the strands with Set Hair
  Curve Profile before judging, or thousands of default-thickness strands are "a mess" `[00:17:28]`.
- **Shape parameter:** 1 affects only the tip, towards 0 the whole curve, negative only the roots
  `[00:18:04]`.
- Clump for wide clumps: Shape towards 0.3, groomed curves as guides (existing guide map), Factor
  reduced so clumping is "somewhat but not very much". A/B by toggling `[00:19:47]` to `[00:21:31]`.
  High Guide Distance gives few large clumps when guides are procedural `[00:20:20]`.
- Density map: paint white at the part, 50% gray elsewhere, black where bald. Use a Color Ramp with
  the black stop just above 0.5 so the gray can be dialed both ways `[00:22:04]` to `[00:23:46]`.
  The Image Texture silently does nothing without a Named Attribute `UVMap` as its vector
  `[00:22:38]`. **5.2:** Interpolate also has a _Mask Texture_ image input and a fractional _Density
  Mask_, both verified.
- Expose a Global Density input (default 1, min 0) that multiplies every branch, to thin the whole
  groom when it gets slow `[00:24:21]`.
- Thin clumps: duplicate the branch, change the clump value, and give the duplicated Noise and Roll
  a **different seed** and higher frequency so layers overlap instead of stacking identically
  `[00:27:54]` to `[00:29:44]`.
- Debug colors: Store Named Attribute (color) per branch, read by an Attribute node in the shader
  `[00:26:08]`.
- Where groomed curves interpolate badly (the center line), add a second low-density Interpolate as
  a separate set of clump guides `[00:30:17]`.
- Parting fixes:
  - Root snap: roots within a distance snap onto the part line `[00:32:06]`.
  - Lift: Displace Hair Curves along the surface normal with Shape near 0. Its factor is Geometry
    Proximity (target **Edges**, the line has no faces), then Map Range from distance 0..2 to 0..1,
    then a Float Curve bump shaped until the part looks natural `[00:33:51]` to `[00:41:16]`.
- Exaggerate an effect first to see what it does, then dial it back `[00:35:01]`.

**How he judges:** coverage at the part, volume at the crown, slightly curled tips, overlapping wide
and thin clumps with no identical shapes, clumping readable but not obvious, and per-population
debug colors `[00:14:32]`, `[00:21:31]`, `[00:29:44]`, `[00:32:06]`.

## Kerstin Schmidbauer: full-body animal fur (BCON25, `ZrBbNhCgGww`)

**Core stance**

- Grooming is like sculpting: primary shapes with the simplest setup first, detail last, many
  iterations `[00:01:43]`, `[00:11:01]`.
- "I do my entire hair grooms with only **two points** on the guides until I got all those fur
  directions where I want them" `[00:21:00]`. Default 8 makes combing tangle and clip. 3 is enough
  for short fur, 8 only for really long hair `[00:19:44]` to `[00:21:34]`.
- **Even guide spacing** matters more than count. Gaps give bald spots and children that drift or
  misbehave in deformation `[00:11:36]`, `[00:12:09]`.
- "Don't fight the system, it works in a very predictable way": delete a bad curve and add a new
  one, and separate mesh parts where hair must never grow `[00:34:56]`, `[00:35:31]`.
- Finish the mesh (topology and **non-overlapping UVs**) before grooming, because curves bind to UV
  space `[00:09:19]`, `[00:38:24]`.

**Reference and planning**

- Use the same subspecies and season coat, ideally many photos of one individual (Flickr albums from
  one location), and never mix short and long coats `[00:03:24]` to `[00:06:21]`. Examine a related
  pet for growth direction and density, which photos hide `[00:07:00]`.
- Draw-overs mark landmarks where fur changes (neck ruff, straight chest fur, clumpy back, fanning
  tail) and flow arrows, before any 3D `[00:07:36]` to `[00:08:43]`.
- Split into objects per landmark: face, cheeks, ears inner and outer, neck, body, tail, feet. It is
  better for performance and easier to work, but the seams need density and clipping cleanup.
  Optionally join everything at the end with Join Geometry if performance allows `[00:13:15]` to
  `[00:14:25]`.

**Density and masks**

- Interpolate spawns over the entire surface and children far from any guide "do whatever". Always
  use a density-mask vertex group `[00:22:07]` to `[00:25:37]`. Turn interpolation off while weight
  painting for speed `[00:24:27]`.
- Density is hairs per square meter, so expect to raise it "by a lot" `[00:23:18]`.
- Too low a density gives bald spots that grow under deformation. Too high a density gives clipping,
  blobs that show every ripple, and slow renders `[00:12:42]`, `[00:13:15]`.
- Masks for everything: vertex groups per region (`fur` suffix for density) plus separate groups for
  noise, clump, length, extra clump. Extra groups cost little `[00:25:37]`, `[00:26:14]`,
  `[00:32:36]`.
- Vertex groups are fast but limited by vertex density. Textures give detail on low-poly meshes
  `[00:15:00]`.

**Layers**

- Trim with Replace Length off and a small Random Offset is "immediately a lot more realistic". Mask
  it, or short-fur areas lose their guides to trimming and go bald `[00:27:26]`, `[00:28:02]`.
- Clump factor from a `clump` group painted only where clumping belongs (cheeks). Clumps look "a bit
  too crazy" at first, so use Tip Spread and Clump Offset. More guides give smaller clumps
  `[00:28:35]` to `[00:30:52]`.
- Noise is texture-like displacement over the whole groom. Frizz is random per point, per hair. Both
  are needed `[00:16:48]`, `[00:17:23]`.
- Reduce Frizz strongly and mask it: right for cheeks, too much elsewhere `[00:31:27]`,
  `[00:32:01]`.
- "The hairs are never straight or perfectly straight. There's always a little bit of clump"
  `[00:31:27]`.
- Length changes must be gradual like density. Abrupt changes render as shadows or dents
  `[00:36:05]`, `[00:36:43]`. At the head she accepts Grow/Shrink brushes despite the inconsistency
  risk, because masking every length there is tedious `[00:36:43]`.
- Fur direction fans: deselect all, add one curve, comb it, deselect, add the next. Later curves
  interpolate between these `[00:43:09]`.

**Deformation and troubleshooting**

- "If your mesh looks the deformation looks too harsh, the hair will look like 10 time worse"
  `[00:33:50]`. Keep a pose-mode window to check often `[00:44:23]`.
- Bald spots come from uneven or low density, no guide nearby, or stretching. Add guides and check
  that interpolation is on `[00:33:16]`, `[00:40:47]`.
- A new guide inside a thin mesh (ear) interpolates toward guides on the other side. Try Puff, or
  place and comb by hand `[00:41:56]`.
- Hair growing inside the mouth: separate the mouth interior from the fur surface. Curves that lost
  their surface become invalid and must be snapped or deleted `[00:34:23]` to `[00:45:31]`.
- A length dent (a short patch that looks like a texture spot) is fixed by deleting those curves and
  re-adding them with the Density brush, interpolation on `[00:36:05]`, `[00:47:50]`.
- Invalid surface UVs (curves ignore the rig, guides refuse to appear on that island) mean
  overlapping UVs: "absolutely no stacking. But it is okay to use udims" `[00:37:50]`, `[00:38:24]`.
  Mirror plus Flip UVs can leave the center seam unmerged: fix it with UV Merge by Distance
  `[00:39:00]`.
- Topology changed after grooming: curves stay valid but float or sink, so Snap to Nearest Surface,
  which works about 99% of the time `[00:39:36]`.
- Shape-key-like blend: duplicate the groom, sculpt the variant, then in GN run Set Position with a
  Mix between the own position and the other object's position (Object Info plus Sample Index by
  Index), driven by a custom property. It breaks when curve counts differ `[00:50:04]` to
  `[00:53:28]`. Not tested here.

**How she judges:** likeness to the real animal, no bald spots at rest and in pose, no abrupt length
or density changes (shadow dents), every region with visible but controlled clump, noise and length
variation, reviewed region by region `[00:02:17]`, `[00:31:27]`, `[00:44:23]`, `[00:47:15]`.

## Simon Thommes: procedural fur in geometry nodes (Blender Studio, `gCQN5vNgHiI`)

**Core stance**

- A groom can be almost entirely procedural: minimal hand grooming, then stacked assets with
  randomized inputs `[00:03:04]`.
- **Randomize per curve, not per point.** Random Value keyed on Curve ID is the main tool for frizz,
  curl, noise and strays `[00:25:31]`.
- Judge at **full render density**. Uniform clumps and equal lengths only show in a render
  `[00:16:44]`, `[00:19:32]`.
- You do not need the internals of the assets. Use each as one node in a higher-level tree
  `[00:23:43]`.
- Layer clumping at several scales with guide masks for randomness `[00:15:39]`, `[00:31:01]`.

**Mechanics**

- Density is per square unit of surface. Scaling the surface in Edit Mode changes the curve count,
  not the density `[00:02:32]`, `[00:09:02]`. **5.2:** object scale is ignored, since density counts
  the mesh's local area (verified).
- Curves remember their surface UV: after surface edits, Snap to Deformed Surface puts them back
  `[00:03:04]`.
- Display Strip plus subdivisions, otherwise radius changes are invisible `[00:03:48]`.
- Set Hair Curve Profile Shape 0.5 means full width at the root falling linearly to 0. Higher falls
  off faster, negative reverses. Factor Min and Max scale the ends `[00:04:20]`.
- Frizz: a per-point random offset. Cumulative Offset on looks more natural. Preserve Length makes
  curves crumple instead of grow `[00:05:57]` to `[00:07:04]`.
- A deformer at the end of the stack plus rest position in Interpolate makes hair follow
  deformation. Edit Mode changes are not deformation; shape keys are `[00:07:38]`, `[00:08:16]`.
  **5.2:** Hair Dynamics (Animation) plus Resting Surface. Shape keys and armature were verified.
- Guide maps: with Existing Guide Map on, the groomed curves are the clump centers. Turn it off for
  procedural guides, where Guide Distance is the average distance between guides (default 10 cm).
  **Guide Mask** randomly removes guides and "looks a little bit more random and less uniform" than
  a larger distance `[00:12:37]` to `[00:14:52]`.
- Radius and density are coupled: at 1M/m² you need about 0.2 mm radius `[00:16:44]`.

**The highland-cow recipe (values from the talk)**

| Step           | Values                                                                                                                                           | Time                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| Interpolate    | Density 1,000,000 (160,000 curves on his patch), Viewport Amount 4%                                                                              | `[00:09:02]`, `[00:09:35]`   |
| Noise          | Factor from a painted `noise strength` vertex group                                                                                              | `[00:10:07]`                 |
| Curl           | Radius 2 cm, frequency up, Curl Start 1, Factor End "much lower", Random Offset 0.5, Existing Guide Map off, Guide Distance 1 cm, Guide Mask 0.2 | `[00:12:04]`, `[00:14:18]`   |
| Frizz          | negative Shape, Distance 2 mm                                                                                                                    | `[00:15:04]`                 |
| Clump          | Existing Guide Map off, Guide Distance 1 mm, Guide Mask 0.1, lower Shape                                                                         | `[00:16:12]`                 |
| Profile        | Radius 0.2 mm                                                                                                                                    | `[00:16:44]`                 |
| Trim           | Replace Length off, Random Offset 5 mm                                                                                                           | `[00:22:20]`                 |
| Rotate         | Random Offset 5°                                                                                                                                 | `[00:22:20]`                 |
| Frizz factor   | Random Value, ID = Curve ID, Map Range From Min 0.8 (80% get none)                                                                               | `[00:26:03]`                 |
| Curl variation | per-curve random factor; frequency via Spline Parameter, Map Range low at root, high at tip ("gravity pulls more at the roots")                  | `[00:27:10]` to `[00:28:52]` |
| Strays         | Noise with Boolean random per Curve ID, probability 0.1, higher scale, Distance 5 mm, higher scale along curve, moved up the stack               | `[00:29:54]`, `[00:30:28]`   |
| Clump 2        | Guide Distance 4 mm, Guide Mask 0.25, gentler shape, Clump Offset 5 mm                                                                           | `[00:31:01]`                 |
| Final Frizz    | per-curve random, Shape -0.2, Distance 2 mm, Cumulative Offset off (clump tips stay clean)                                                       | `[00:32:08]`                 |

**Shading and review**

- "The principled hair BSDF, that works only for Cycles, so if you want to use Eevee make sure to
  just use the regular principled BSDF" `[00:18:25]`. **5.2:** EEVEE renders it at about 36% of the
  Cycles luminance (measured). The rule holds.
- Curves Info Intercept goes into a color mix: darker root, brighter reddish tip `[00:18:25]`. Make
  the surface mesh darker with specular off `[00:18:59]`.
- Color variation: Attribute `surface_uv_coordinate` into a Noise Texture, Mix Soft Light, Color
  Ramp. Duplicate that for per-curve variation, randomize roughness, and raise roughness a little
  `[00:20:04]` to `[00:21:13]`.
- Review rig: square camera, warm fill from the top, small key from the side, cool rim from the
  other side, darker bluish world `[00:17:16]`.
- First-render critique list: clumps too uniform (strays needed), all hairs the same length, shader
  lacks variation, curling too regular `[00:19:32]`.
- A/B each variation by muting its link `[00:26:37]`. Disable viewport display of render-only layers
  `[00:22:53]`.
- Full-density patch: a Mask modifier on the surface with a small vertex group, off for render
  `[00:32:51]`. **5.2:** this has no effect while Resting Surface is on. Use a patch Density Mask
  instead (verified).

## Daniel Bystedt: GN hair cards for games (own channel, `g_ZIOafq4QU`)

This is a walkthrough of his paid generator file, so treat it as a specification of what a card
generator must control.

- Groom with hair curves and let cards deform along them. Card tilt aligns to the surface, so you
  keep grooming with curve brushes `[00:00:00]`, `[00:21:53]`.
- Use a decimated proxy head for collision, normal and color sampling, so the groom stays responsive
  `[00:01:07]`, `[00:21:18]`.
- Controls:
  - Build direction: cards are modeled root at the origin, tip toward the positive axis
    `[00:02:20]`.
  - Tip tilt randomize, and align to surface vs world `[00:02:53]`, `[00:03:26]`.
  - Root snap distance, and snap-if-inside with an offset `[00:03:59]`, `[00:04:34]`.
  - Subdivide by length, 1 per 20 cm `[00:05:08]`.
  - Normal from surface factor `[00:05:40]`.
- Transfers: a `mask` vertex group removes cards. Color from a surface color attribute is sampled at
  the root or projected. The UV of the root's closest surface point (a dedicated `UV transfer` map)
  lets one texture tint regions across all cards `[00:06:53]` to `[00:09:13]`.
- Parting line as a curve object: roots within a distance snap onto it, and a lift bumps hair up by
  distance from the line `[00:09:50]` to `[00:11:03]`.
- Layers: thick cards for coverage, sparse thin cards offset along the normal to fake flyaways, and
  a textured, transparent **hair cap** underneath for coverage and a soft hairline `[00:19:32]` to
  `[00:22:28]`.
- Split front and back groom objects where grooming one disturbs the other, then join them in GN
  `[00:17:15]`.
- Texture scene: hair on planes under an orthographic camera, with hair kept inside the UV tile.
  AOVs and compositor outputs are normal, alpha, random per hair, specular and intercept
  `[00:23:04]` to `[00:24:13]`.

## Sara Matsumoto: mesh hair from hair curves (BCON24, `vXBL-oiqY7Q`)

- Keep groomable hair curves and convert them to mesh cards or tubes in GN. The same groom then
  renders in EEVEE or Cycles, or exports to games `[00:02:14]`. She now prefers mesh hair even for
  Cycles ("more control", curves feel "more unstable"), and it renders fast: about 1 to 3 min per
  frame on her characters `[00:40:54]`, `[00:41:28]`.
- Strand textures are made in Blender from real hair curves rendered to passes `[00:03:55]`. Plate
  rules:
  - UVs on the growth strip are mandatory: "if you don't do UVs the hair is never going to attach"
    `[00:04:28]`.
  - Uneven lengths `[00:05:04]`.
  - Hair reaching the tile **sides** (gaps become tube seams) with a **gap in the center** so cards
    can use half the UV `[00:09:16]`, `[00:34:27]`.
  - Blend Hair Curves for a fluffier, separated look `[00:07:29]`, plus a second system for flyaways
    `[00:08:03]`.
- Passes: depth, normal, position, AO, specular. Depth comes out white, so remap it `[00:09:16]` to
  `[00:10:57]`.
- Judge the material on a curved plane with one moving point light. A round blob highlight is wrong;
  push for a stretched, anisotropic one `[00:11:37]` to `[00:14:53]`.
- Card material:
  - Alpha, normal map plus bump from depth, a little metallic.
  - Roughness varied around 0.5, not constant.
  - Position pass into Tangent, with raised Anisotropic `[00:12:10]` to `[00:14:53]`.
  - Root color by a vertical ramp; highlight color masked by AO `[00:15:26]` to `[00:17:06]`.
- GN tree:
  - Resample first, because Snake Hook scrambles point order `[00:18:49]`.
  - Arc profile: resolution 1 is flat, and she uses 3 segments to cover roots better `[00:19:54]`.
  - Tubes from a flat Spiral (start radius = end radius, height 0, resolution 6, 1 rotation). A
    closed arc gives seams `[00:21:33]` to `[00:22:40]`.
  - One width value must drive both cards and tubes `[00:24:21]`.
- UVs: capture Spline Parameter on the curve (length) and on the profile (width) and store them as
  `UVs`. Cards (3 sides) get U × 0.5 compared with tubes (6 sides), switched with the geometry
  `[00:25:10]` to `[00:31:27]`. **5.2:** a FLOAT2 CORNER attribute named `UVMap` works directly and
  converts to a UV layer (verified).
- Root attach: Geometry Proximity to the scalp on the UV Y = 0 row, **last** in the tree
  `[00:32:09]` to `[00:33:47]`.
- Interpolation "doesn't appear" until density is very high ("like a million") at her scale
  `[00:39:47]`. Separate systems hide roots at the nape and hairline `[00:40:21]`.

## Where they disagree, and what decides

| Topic               | Position A                                                            | Position B                                                                                      | Deciding condition                                                                                     |
| ------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Points per guide    | Schmidbauer: 2 while placing, 3 short, 8 max `[00:20:24]`             | Bystedt: resample to 15 before shaping `[00:08:38]`                                             | Length and curvature: start low for direction, raise when shape along the strand matters               |
| Clump guides        | Groomed curves as clump centers (Bystedt, art-directed) `[00:20:59]`  | Procedural: Existing Guide Map off, Guide Distance plus Guide Mask (Thommes) `[00:13:45]`       | Art-directed hairstyle vs natural fur                                                                  |
| Splitting the groom | One object per landmark (Schmidbauer) `[00:13:15]`                    | One object with masks (Thommes); front and back objects where they disturb each other (Bystedt) | Groom size, performance, overlap while combing                                                         |
| Mask source         | Vertex groups: fast, limited by vertex density                        | Textures: detail on low poly (Schmidbauer `[00:15:00]`, Bystedt `[00:22:04]`)                   | Mesh resolution vs needed detail                                                                       |
| Frizz shape         | Positive (tip-weighted) default                                       | Negative when stacked on curls or clumps (Thommes `[00:15:04]`)                                 | Whether tips carry a shape that must survive                                                           |
| Cumulative offset   | On: natural frizz (Thommes `[00:07:04]`)                              | Off: Noise per strand (Bystedt `[00:13:24]`), final Frizz (Thommes `[00:32:08]`)                | Base variation vs final fine jitter                                                                    |
| Strands vs mesh     | Curves plus Principled Hair in Cycles (Thommes, Bystedt, Schmidbauer) | Mesh cards and tubes even for Cycles (Matsumoto), cards for games (Bystedt)                     | Offline Cycles vs EEVEE, realtime or export; Matsumoto also cites stability                            |
| Length control      | Grow/Shrink brush at the head (Schmidbauer) `[00:36:43]`              | Trim with masks and random offset (Thommes, Schmidbauer elsewhere)                              | Many distinct lengths in small areas favor brushes (a human's job in 5.2.1); broad regions favor masks |
| Intersection        | Shrinkwrap Hair Curves with an offset (Bystedt) `[00:12:09]`          | Sculpt collision option (brush-time only)                                                       | Bystedt wants an offset distance and a non-destructive fix                                             |
