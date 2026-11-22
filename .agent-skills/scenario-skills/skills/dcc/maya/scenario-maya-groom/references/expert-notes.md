# Expert notes: grooming (the depth behind SKILL.md)

Per-source notes live in `notes/groom/` (never edited to fit this skill). Timestamps are [hh:mm:ss]
in each video. Lines marked [added] are this skill's reconstruction (mostly mapping advice given in
Houdini or legacy XGen onto 2027 Interactive Groom nodes); [verify] marks a name or behavior to
confirm on the installed Maya.

## Jesus Fernandez (Senior Groom TD at ILM, ex Lead Groom TD at MPC): Groom Fundamentals, 2021

Software independent by design; demos in Houdini 18 and Maya 2019 legacy XGen. The judgment layer of
this skill.

**01 Flow** (CEk0IQ6dk3A)

- Three levels of control: flow, clumps, per strand [00:01:09]. Flow is macro and comes first, "on
  the guides at the start" [00:06:43]; it lets you read the fur volume against the model volume
  [00:07:16].
- "The flow itself reflects pressure" [00:02:47]: where streams press, neighbors share the
  compression curve [00:03:20]; two opposing streams leave a straighter band that interpolates
  between them [00:03:56]; messy stacked areas still obey who presses whom [00:04:29].
- Length is the only per-strand attribute that feeds flow: short hair shows sudden direction
  changes, long hair integrates larger collisions [00:05:02] [00:05:36].
- Method: draw arrows over a high-resolution reference, then copy them onto the groom; his standard
  approach for complex faces [00:10:35] [00:11:08].
- Faceted, broken guides after posing: more map resolution (TPU), Interpolate sampling, or more
  guides, then Smooth [00:09:31].
- Agent translation [added]: the flow sheet (`G.flow_vector`, `G.make_guides`) is the arrow drawing;
  `analyze_strands()["flow"]` flags neighbor disagreement, the measurable form of broken guides.

**02 Clump profile** (_ukhuMbKIQ4)

- A clump is hairs bound by an attraction force; the profile is where along the strand the pull
  builds [00:00:05] [00:01:10]; tip, middle or constant attraction give three shapes [00:01:43].
- The failure he sees most: uniformity, "most of them lack this difference in size and this
  difference in shape" [00:07:52]; in six to eight reference clumps none shares a shape [00:09:45].
  Number and describe each reference clump [00:08:24].
- Roots sparse: "you most of the time need the roots to be quite sparse or with no effect so you can
  fill up more of the base" [00:17:56]; his final ramp holds 0 up to about 14 % of the length (frame
  00:18:12).
- Legacy XGen Clump Scale ramp behaves like a radius: 0.01 at mid length gives a spike [00:05:38]
  (frame 00:06:00), a mid bulge about 0.9 an onion (frame 00:10:51). The 2027 help calls IG Clump
  Scale a magnitude ("tighter at the tips and more relaxed at the root"), the opposite reading
  [verify: `test_groom_stack.py` measures it].
- Some big shapes are flow, not clumps: decide which system owns a shape [00:07:19]. Some clumps
  never attach to the root [00:06:45]. Randomize per clump once the profile works [00:17:24]. Ramp
  interpolation changes the shape; the popup and the Attribute Editor must agree [00:10:49].
- [added] `G.CLUMP_PROFILES` holds root_loose, spike (0.01 at 0.455) and onion (0.896 at 0.512) in
  the radius reading; `G.profile_ramp(name, convention)` converts. One Clump modifier carries one
  ramp, so profile variety comes from two or three primaries with different ramps on complementary
  `G.partition` masks (P5).

**03 Clump systems** (8kJj1W9gGrA)

- Two levels, big and small [00:00:23]; three to five small per big [00:01:31]; small clumps carry
  the big clump's force plus their own [00:00:57].
- "Try to always stay with two clump systems as much as you can" [00:09:11]; three for really long
  hair or manes, where one- or two-hair groups make hollows inside clumps [00:06:19] [00:07:25];
  four almost never.
- Strays come from removing the big clump's influence locally, not from a new system [00:04:16].
  [added] IG: holes in the primary Clump's mask (`G.patches`, P5).
- [added] In IG, secondary Clump Points Density about 3 to 5 times the primary, since density is per
  unit area; `G.build_clumps(ratio=4)`, lint warns outside 3 to 5.

**05 Clump modifiers: mask and noise** (u-e5k4edXLI, drawings only)

- Two independent knobs: the mask (attraction, "blend" in Houdini) and noise (a deformation
  unrelated to the force) [00:04:23] [00:04:55]. "The mask will basically define how much the shape
  is a triangle or a square" [00:03:16].
- Noise has scale (units from the base position) and frequency [00:05:32] [00:07:28]. High frequency
  is fray, on few hairs (damage, afro hair) [00:07:28] [00:07:59]; mid frequency is the common case
  [00:08:14]; constant frequency looks fake, except Maine Coon type cats [00:08:15].
- [added] Measured by `G.noise_frequency` (cycles per strand from zero-crossing spacing);
  `analyze_strands` reports the frequency CV and the fray share (strands at 2x the median), and
  `strand_verdict` flags a single frequency or fray on more than 20 % of noisy strands.

**06 Mask versus tightness** (LbqWjd0p-qw)

- Mask includes or excludes hairs; tightness is the pull toward the clump curve and defines the
  profile [00:04:27] [00:12:13]. Tightness 0 keeps the clump's shape without converging; mask 0
  removes the influence [00:05:32] [00:06:08].
- With straight guides both look the same; test with noisy guides [00:10:00] [00:10:32].
- [added] IG nearest equivalents: modifier mask for his mask; Clump strength plus Clump Scale for
  tightness; Clump Noise with Noise Correlation or shape below the Clump for "follow without
  converging" [verify by the one-clump test].
- [added] The one-clump test as numbers: `G.clump_follow(strands)` gives tip_spread and
  shape_coherence; the P5b sweep (`test_groom_clump_levels.py`) tells which IG knob keeps the
  coherence (his tightness) on this install.

**07 Breaking clumps with noise** (QQm4nLGFxFM)

- Three ways to break a clump: blend, tightness, content behavior [00:01:00] to [00:02:32]; "pretty
  much anything that you do inside of the clumps break the shapes of the clumps" [00:03:06].
- Noise on the small clump guides breaks the big clump but keeps its roots; noise on strands breaks
  the small clumps too; mask the noise to the tip half [00:04:10] [00:04:42] [00:13:39].
- "Breaking the clumps will bring softness to the tips" [00:09:48]; same silhouette, defined or soft
  [00:09:16]. Lower frequency breaks tips slowly and naturally [00:12:35].
- Square clumps: tight small clumps inside a less tight big clump, both blends reduced, plus noise
  [00:16:55].
- [added] IG levels: primary Clump = big, secondary Clump (control map = primary) = small, Noise
  modifier = strand level; Clump Noise with its Noise Scale ramp low over the first half is the
  nearest to noise on clump guides (`G.TIP_HALF_RAMP`, the `build_clumps` default when clump noise
  is on). `G.compare_states` measures tips moving while roots stay; `G.breakup_report` measures
  whether the small clumps survived (spread ratio near 1 for clump-level noise, well above 1 for
  strand noise), and lint flags clump noise that reaches the roots.

**08 Breakup by length** (lRm2sBSOo00)

- Scale keeps the shape (and scales its noise), extend risks criss-crossing, cut shortens [00:01:08]
  [00:03:18]. Prefer increasing over reducing [00:01:40].
- The useful level is the small clumps; on the big clump guide it barely breaks, on strands it
  explodes the clump [00:06:05] [00:11:12].
- "If your value is one try to put like 0.8 and 1.2 so you always keep them as balanced as you can"
  [00:09:33].
- Fluffy recipe: "a big shape with a really nice break up, fuzzy tips and then a halo" [00:15:01];
  in a clump of four, one longer, one cut, one flyaway from the root, triangle kept [00:17:48]
  [00:18:22].
- [added] IG: Scale modifier above the clumps with a random multiplier (expression), Cut modifier or
  Clump Secondary Cut ("0.1 cuts 10 percent", 2027 help); no direct "extend without shape change"
  modifier [verify].

## Henning, FlippedNormals: Introduction to XGen Quick Start, 2020 (rfxt0ubgLXc)

Legacy XGen primer in Maya 2020; failure-avoidance habits and starting numbers, not film judgment.

- Two parts: really good guides, then modifiers [00:08:22]; as few guides as possible at first
  [00:08:54]; interpolation is "technically correct though it's not artistically correct"
  [00:22:10]; fix parts with region maps, not "a crap ton of guides" [00:23:15], or separate
  descriptions [00:24:40].
- "All hair clumps all the time" [00:27:45]: Setup Maps densities stacked 20, 30, 50 [00:27:45]
  [00:30:00]; the Guide option puts clumps on your guides, "really handy if you have some kind of
  stylized character" [00:27:13].
- Noise needs Modifier CV Count about 20 [00:28:52]; a Noise modifier at mask 1 "kills most of your
  clumping", use 0.1 to 0.5, magnitude low at the root, more at the tip; frequency 1 calm, 10 crazy
  [00:32:05] to [00:33:09].
- Numbers: density 1000 to 2000 (1 is "ridiculously low") [00:13:07]; width about 0.05 by default
  too high [00:14:30]; Taper and Taper Start 0.8 [00:14:47]; leave Length at 1 and scale guides
  [00:14:11]; rebuild guides to 10 CVs for sculpting [00:15:58].
- Legacy survival: set project, UVs, save before starting, never update Maya mid-project [00:01:33]
  to [00:03:37]; save the texture then the Ptex [00:19:55]; Export Patches for Batch Render before
  rendering [00:35:20]; assign the shader to the description [00:36:24]; specular samples 2 to 5
  [00:38:00].

## Hadi Karimi (likeness artist): Creating Realistic Hair with XGen, 2021 (RkpJ4LGJrf8)

Legacy XGen; dense narration to [00:31:44], then timelapse with a few captions.

- Guides, maps, modifiers are the three systems; grooming strand by strand is not the job
  [00:00:17]. Understand values rather than copy numbers, which differ with scale [00:21:23].
- One density map painted in ZBrush against the reference and reused for every description (brows,
  lashes, scalp, transition, fuzz) [00:02:45] [00:22:54]; connect the file's alpha to each
  description's mask (Hypershade Graph Network) [00:22:54] to [00:23:26].
- Hairline realism from thinning: a width map painted at about 60 % opacity lowers the width of edge
  strays [00:09:53] [00:10:28]; transition hair between scalp and face hair [01:54:41]; peach fuzz,
  thinner and translucent [02:07:27].
- Width random expression 0.006 to 0.008 at his scale [00:06:44]; Modifier CV Count 20 [00:07:18];
  Width Ramp tapers the tip [00:07:18].
- Modifiers: Clumping first, "probably the most important" [00:11:25] (Setup Maps 60 for brows,
  noise-expression mask, clump roots tightened [00:11:58] to [00:13:01]), then Cut, Coil (very low
  radius), Noise subtle on brows [00:13:40] [00:14:21]. Stack duplicates at different percentages
  instead of pushing one [00:20:46].
- Long hair: the first clump from Guide rather than density, "a better control over the hair"
  [00:53:36]; region maps near the part [01:24:59].
- Lashes: upper and lower in two descriptions, lower thinner and sparser, two face rows plus a width
  map so they do not form one line [00:14:53] [00:27:35]. First and last guide, interpolate between
  [00:05:13]; interpolated guides come out shorter, reset length [00:05:44]; mirror guides on
  symmetric topology [00:08:51].
- Duplicating a description: uncheck Include Patch Bindings, Replace with Selected Faces, regenerate
  clump points [00:23:56] to [00:25:56].
- Grow on the head while the likeness mesh changes; a scalp is better for animation or poor topology
  [00:03:31].

## Arvid Schneider (VFX lighting supervisor): XGen Fur with aiStandardHair, 2017 (EXF_7Zgg65M)

He disclaims being a groomer; the value is look-dev and lighting habits.

- Guide modifier before sculpting; one effect per sculpt layer, blended by the layer slider
  [00:05:19] [00:10:47]; comb with Collide with Meshes on, tolerance about 0.1 [00:06:58]
  [00:08:06]; changing guide scale resets the comb [00:08:06].
- Clumps come from dirt, rain and wetness; the default clump is too strong, paint where it applies,
  blur, leave a little everywhere [00:18:49] to [00:23:31].
- IG inherits UVs from the base: a texture into Base Color with Melanin 0 [00:25:13] [00:33:00];
  long hair hides the stripes, so length is part of the look-dev, or texture the base too [00:37:41]
  to [00:39:23].
- Roughness encodes cleanliness: low shiny, higher dusty [00:36:35]. Light with a key along the
  groom direction plus an HDRI dome [00:34:32]. Hide the fur for DOF and light tests [00:41:11];
  clamp fireflies at 5 [00:42:53].
- Density Multiplier x2, x3, x5 as the groom firms up; modifiers apply unchanged [00:11:20]
  [00:32:22].

## Andrew Giovannini (real-time hair, Cyberpunk 2077, Gearbox): XGen to UE5 Groom Setup, 2024 (fw7ZSW4naR0)

The only source who shipped real-time grooms.

- Layered descriptions: body, fringe, fill, many small breakup descriptions [00:03:46]. The fill:
  body guides rebuilt to 20 CVs and cut to about 2/3; without it "you can see right through to the
  scalp" [00:04:48] to [00:05:56] [00:12:29].
- Big shape changes with a lattice and soft select, then fix roots [00:06:31] to [00:08:46].
- Clump recipe: first clump on the guides with random variation; second at density 7.5 splitting
  each into 4 or 5; clump noise pushed toward the root, value 2 (4, 10 more broken); a third level;
  Cut random up to 10; a final noise [00:09:43] to [00:11:25]. Iterate one clump layer at a time
  [00:12:48].
- "I never apply it to the main body I only apply it to the Strays": noise 0 on the body, 3 on
  strays, stray share 5 % (some 20 %) [00:08:57] to [00:11:59].
- Convert legacy to IG one description at a time (all at once makes pop-outs), then Rebuild each
  once [00:13:46] [00:15:26]. Rogue stray: Sculpt, Freeze, Cut with Invert Frozen [00:17:04].
- Export: Current Frame, Write Final Width [00:20:40]; light scene with guides and the growth cap
  only [00:21:35]; the Outliner is the bottleneck, hide everything and script the reparenting
  [00:23:58] to [00:28:47].
- Tag your real guides, skip the redundant fill guides: "a much cleaner Sim than generating them
  randomly" [00:18:17] [00:30:45]. Group ids for separate materials and sim settings [00:33:04].
  Root UVs need UV set `map1` [00:34:20]; without them binding to another head "just wouldn't work"
  [00:44:36]. Fix Epic's Python 2 prints [00:36:35]. Save a new scene after baking; attributes
  cannot be reapplied [00:37:47].
- Unreal (UE 5.3 era, the note's estimate): Support Compute Skin Cache; import Y-up conversion
  hedged ("I believe") [00:40:46]; fewer sim guides are cheaper [00:41:22]; binding source and
  target of the same topology, right mesh section [00:43:25] to [00:44:36]; MetaHuman hair material
  covers "90, 95 %" [00:46:18]; physics: Sub Steps 40 (default 5), Iteration Count 10, Collision
  Radius about 3.5 (from 0.1), Stretch Stiffness 1, Bend Scale tip about 0.1, do not lower Bend
  Damping far [00:51:04] to [00:55:08].

## Derek Flood (3D artist, instructor): Animating XGen Hair with Linear Wires and Alembic, 2023 (7IS_tnkO_oU)

The full three-file handoff (groom, rig, shot).

- Hair animation is driven by a small set of wires, never the hair itself; the groom stays the
  look-dev asset [00:00:00] to [00:00:33].
- Create wires with a Linear Wire, halve its Density Multiplier, add wires with the Place brush and
  interpolation [00:01:25] to [00:01:59].
- Export from inGuide, not the description, which exports "all of my hundred thousand hairs"
  [00:02:34]; Multiple Transforms and Write Final Width on, "if we don't have that it will
  incorrectly write out the files" [00:03:11].
- Empty scene: import, Prefix Hierarchy Names, FBX to the rig [00:03:52] to [00:05:37]. Rig: a proxy
  that encloses the whole groom, skinned to head and neck, curves wrapped to it [00:05:50] to
  [00:07:01].
- Tests and shots start at the rest pose; Reference State Update at frame 1 [00:10:54]. Curve to
  Spline: Align to Normals off, source Cache [00:09:17] to [00:10:22]. Magnitude scale ramp: 1 along
  the length, 0 at the root when the head moves the roots [00:11:27] to [00:11:59]. Save a new
  version at frame 1 [00:12:34].
- Separate wire and geometry caches, namespaces stripped, UV Write for geometry [00:08:05] to
  [00:09:13] [00:14:00] to [00:15:04]; the lighting file swaps the Curve to Spline cache and merges
  the geometry cache [00:15:41] to [00:16:46].
- Dynamics variant: in the rig, Make Selected Curves Dynamic with the scalp, export the hairSystem
  output curves, read them exactly like keys [00:18:06] to [00:18:41]; thick self-collision display
  for readable sim playblasts [00:18:41].

## Autodesk: XGen Interactive Grooming, Maya 2027 help (sources/docs/fx-groom__xgen-interactive-groom.md)

- IG is Maya nodes computed on the GPU, saved in the scene, optionally cached to Alembic; legacy
  Geometry Instancer descriptions do not work with its tools or modifiers.
- New description: `descriptionShape`, `description_base`, a Scale modifier at the bottom, a Sculpt
  modifier with one layer, the default hair shader. Head hair: "create a mesh of the scalp region
  only".
- Stack bottom to top; Curve to Spline and Spline Cache on top disable everything below (the Guide
  modifier does not). Clump before or after Noise or Sculpt looks different: try both.
- Curve to Spline "convert[s] a series of existing curves to interactive groom hairs", and "the
  curve density cannot be modified": on a description it makes one hair per curve. The Guide
  modifier's guides "take their initial shape from the surrounding hairs", can be "generated from
  existing curves", and use "an interpolation method" controlled "using region maps". [added] So
  guides go through a Guide modifier whose inGuide reads the curves through a Curve to Spline
  (`G.wire_guides`), as Flood feeds a Linear Wire's inGuide [00:09:17].
- Secondary clumps: same Map Subdivision Level (duplicate the primary), higher Clump Points Density,
  Use Control Map with the primary. Region map as clump control map so clumps do not cross a part.
  Jagged clumps: raise Map Subdivision Level. Same mask for density and clump magnitude.
- Clump attributes: Clump, Clump Scale (root to tip), Volumize, Variance, Preserve Length (0
  stretches, 100 does not); Points: Randomness, Density (per unit area), Density Mask, Seed; Map:
  Radius Variance, Map Subdivision Level, Use Control Map, Control Using, Control Mask; Advanced:
  Flatness, Offset, Curl, Orient with ramps; Secondary: Copy, Copy Variance, Cut (0.1 = 10 %),
  Noise, Noise Frequency (cycles per clump), Noise Correlation (%), Noise Scale.
- Curls: CV Count 24 to 36, Curl above 1, Curl Scale, Offset, `xgmSeExpr` `rand(1,-1)` on Curl.
  Density Multiplier 0.5 halves the creation density; density is per unit area and ignores working
  units; placed hairs ignore the Density Mask.
- Density writes to `description_base`, Width to `descriptionShape`, Freeze and Select are global:
  not layered.
- Linear Wire > Make Wires Dynamic: nHair system and `xgmCurveToSpline_dynamic`; play, rewind,
  Reference State Update, play; Guide modifiers have no Reference State.
- Cache any state (description, mid-stack modifier, `InGuide_base`); third-party importers need
  Multiple Transforms and Write Final Width.
- Games: widen to card width, Face Camera off, Twist with Align to Surface, then convert.
- Default shader `hairPhysicalShader`, Ai Kd Ind 0: raise it with indirect light.
- MEL: `xgmSplineQuery` (-listSplineDescriptions, -splineCount, -videoMemory*), `xgmSplineSelect`
  (-convertToFreeze, -replaceBySelectedFaces), `xgmSplineApplyRenderOverride`,
  `xgmExportSplineDataInternal -output`.

## Autodesk: Arnold Standard Hair, MtoA XGen, Hair Rendering (sources/docs/fx-groom__arnold-hair-xgen-rendering.md)

- Realism from base color or melanin, roughness, IOR; diffuse, tints, opacity and indirect scales
  are artistic. Melanin first; a texture goes into Base Color with Melanin 0. Melanin blonde about
  0.2, red and brown about 0.5, black 1.0; Melanin Redness and Randomize for variation.
- Roughness 0.2 default; IOR 1.55, outside 1.4 to 1.6 for wet hair; Shift 0 to 10 degrees for human
  hair (Piedmont 2.8, light-brown European 2.9, dark-brown European 3.0, Indian 3.7, Japanese 3.6,
  Chinese 3.6, African-American 2.3), 0 synthetic.
- Scattering Mode (MtoA 5.6): Approximate, Accurate (round in close-ups, 10 to 30 % slower,
  noisier), Adaptive.
- Blond: Extra Depth on the shader, then specular samples 2 to 5 or AA. Old `hair` shader values do
  not map.
- Ribbon mode for hair; MPW only in ribbon mode; higher AA needs less MPW; transparency depth 0
  disables the MPW transparency (the page contradicts itself; test); opacity < 1 costs significantly
  and needs Ai Opaque off.
- XGen: load MtoA before XGen; save if RenderView differs from the viewport; Card primitives
  unsupported; legacy motion blur needs Export Patches for Batch Render.

## Epic Games: XGen Guidelines and Alembic for Grooms (sources/docs/fx-groom__xgen-to-unreal-groom-alembic.md)

- Only curves tagged `groom_guide` simulate; otherwise 10 % of hairs are auto-tagged.
  `groom_group_id` for materials; `groom_root_uv` (Uniform float2) per hair; widths from Maya
  converted (fallback 1 cm); every node a unique name; schema version 1.5.
- Scripts: `groom_group_id` short plus `_AbcGeomScope` `con`; `guides` transform with `groom_guide`
  1, `riCurves` 1, scope `con`, curve shapes reparented; root UVs by `getUVAtPoint` on `map1` into a
  vectorArray with scope `uni`, type `vector2`. Python 2, API 1.0, `otawa` typo: `mx_groom` ports
  them.
- Export Cache on this page: Current Frame, Multiple Transforms **off**, Write Final Width on.

## Disagreements and the deciding condition

| Topic                         | A                                                                          | B                                                                             | Decide by                                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multiple Transforms on export | off (Epic)                                                                 | on (2027 help "required for third-party importers"; Flood)                    | the hierarchy Epic's scripts expect (`description                                                                                                                                 | SplineGrp0`): export both once, `inspect_abc`, then choose [verify] |
| Grow on head or scalp         | head while the likeness changes (Hadi)                                     | scalp cap for animation, bad topology, root UVs (Hadi, Giovannini, 2027 help) | still portrait: head; animated or real time: scalp cap                                                                                                                            |
| Clump levels                  | two, three for long hair (Fernandez)                                       | stack as many as you like (FlippedNormals)                                    | film realism: Fernandez; a primer's exploration is not a rule                                                                                                                     |
| Clump placement               | random by density, Randomness > 0                                          | on the guides (stylized; Hadi's long hair)                                    | realistic fur and hair: random; art-directed locks: guides                                                                                                                        |
| Noise location                | light global noise (FlippedNormals, Hadi on brows)                         | 0 on the body, strays only (Giovannini)                                       | short hair, brows, lashes, fur tolerate light global noise; long clumped hair keeps noise on strays                                                                               |
| Noise level                   | strand noise (Noise modifier)                                              | clump-level noise (secondary Clump Noise, tip half)                           | what must survive (Fernandez 07): to break the big clumps and keep the small ones and the roots, clump level; strand level only on a share of hairs (fray, flyaways)              |
| Strays                        | separate breakup descriptions with noise on a 5 to 20 % share (Giovannini) | holes in the big clump's mask (Fernandez 03 [00:04:16])                       | stray clumps that leave the big shape: holes in the primary's mask; single flyaways and real-time breakup layers: a sparse strand-noise share (Giovannini; Fernandez 08 flyaways) |
| Masks                         | expressions (Hadi)                                                         | painted maps (Schneider)                                                      | uniform random variation: expression; art-directed regions (wet belly, dirty patches): image (P6)                                                                                 |
| Sim guides                    | tag your own (Giovannini)                                                  | auto 10 % (Epic default)                                                      | tag real guides whenever the sim matters; auto only with a low percentage                                                                                                         |
| Where dynamics live           | rig file, nHair on FBX curves (Flood)                                      | groom file, Make Wires Dynamic (2027 help)                                    | department ownership: rig or CFX owns motion, Flood; solo or groom-owned, in-groom                                                                                                |
| Legacy or IG                  | legacy with region maps and Setup Maps (Hadi)                              | IG from the start (Schneider, Flood) or converted (Giovannini)                | 2027: IG for new work; legacy only for inherited assets                                                                                                                           |
| Clump Scale ramp direction    | radius-like (legacy, Fernandez's frames)                                   | magnitude (2027 help)                                                         | measure with the one-clump test before trusting either                                                                                                                            |

## Outdated for Maya 2027

- Legacy XGen as the main path (Fernandez's Maya 2019, FlippedNormals 2020, Hadi 2021, Epic 2018.6):
  Ptex save-twice, `.xgen` sidecars, Setup Maps and Export Patches are legacy chores; whether legacy
  XGen and Ptex work on macOS Apple Silicon is unverified.
- aiHair is deprecated (Schneider 2017); Standard Hair gained `scattering_mode` in MtoA 5.6.0.
- Per-light samples (Schneider: area 6, dome 3) predate Global Light Sampling; Maya IPR is replaced
  by Arnold RenderView; no Arnold GPU on macOS.
- Epic's scripts are Python 2 and API 1.0; Maya 2027 is Python 3 only and Alembic Ogawa only.
- Color management: "sRGB" for web textures is `sRGB Encoded Rec.709 (sRGB)` as the default input
  role since 2026.2.
- Prefs path: macOS 2027 uses `~/Library/Preferences/Autodesk/maya/2027`, not `Documents/maya/2020`.
- Unreal UI and physics names in Giovannini's stream are UE 5.3 era; "preload" in his physics panel
  is an uncertain caption.
