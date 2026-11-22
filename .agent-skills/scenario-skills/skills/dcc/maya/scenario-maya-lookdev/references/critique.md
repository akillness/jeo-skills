# Critique: how the agent judges its own look dev

Order of judgment: the lint (numbers), then the reference strip (calibration), then each material
against its photo, then the turntable as a whole. A stage passes only when every measurable gate
passes and every visual item for the materials present has been looked at and noted. Report as:
verdict, evidence (lint verdict, sheet and crop paths), what was not verified.

## 1. Measurable gates: `mx_shade.lint_scene()`

`sh.verdict(issues)["pass"]` requires zero errors. Warnings need a reason in the report if left;
info lines are prompts.

| Rule                                                                | Level                                           | Protects against                                                                                                                                                                  | Source                                                 |
| ------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| data_not_raw                                                        | error                                           | roughness, metal, normal, height, mask maps color-managed                                                                                                                         | SARK 00:19:10, JHILL 00:21:10, Maya 2027 help          |
| color_raw                                                           | error                                           | an 8/16-bit color map tagged Raw (washed out)                                                                                                                                     | RAYC 00:17:28                                          |
| linear_color_raw                                                    | warn                                            | EXR, HDR or .tx color input (or HDRI) tagged Raw under ACEScg                                                                                                                     | Maya 2027 help, Arnold ACES page                       |
| rules_can_reset                                                     | warn                                            | a deliberate color space that Reapply Rules would reset                                                                                                                           | Maya 2027 help                                         |
| outalpha_without_ail                                                | error when the header shows no alpha, else warn | grayscale map read from a missing alpha                                                                                                                                           | RAYC 00:19:14, SARK 00:20:17                           |
| mixed_role                                                          | warn                                            | one file feeding color and data inputs                                                                                                                                            | [added]                                                |
| jpeg                                                                | warn                                            | compressed textures                                                                                                                                                               | SARK 00:07:14                                          |
| missing_file                                                        | error                                           | a path that does not exist (first UDIM tile)                                                                                                                                      | [added]                                                |
| udim_off                                                            | error                                           | UDIM file name with UV Tiling Mode off (only 1001 renders)                                                                                                                        | [added]                                                |
| normal_direct / normal_as_bump                                      | error / warn                                    | normal map into a shader or a Bump-mode bump2d                                                                                                                                    | lookdev digest checklist, SARK 00:21:44                |
| default_name                                                        | warn                                            | untraceable nodes                                                                                                                                                                 | SARK 00:15:11, RAYC 00:15:47                           |
| weight_over_1 / color_over_1                                        | warn                                            | energy breaking (OpenPBR specular weight and table metal colors exempt)                                                                                                           | Arnold OpenPBR doc                                     |
| metal_white_f82                                                     | info                                            | metal without its edge tint                                                                                                                                                       | OPBRV 00:02:51                                         |
| metal_coat                                                          | info                                            | coat on bare metal                                                                                                                                                                | Arnold Standard Surface doc, Coat                      |
| transmission_saturated                                              | warn                                            | ink-like glass                                                                                                                                                                    | Arnold OpenPBR doc, ARVID 00:18:13                     |
| transmission_depth_zero / _scale                                    | info / warn                                     | tint without absorption; depth more than 10x off the object's thickness                                                                                                           | Arnold OpenPBR doc, lookdev digest                     |
| thin_film_units                                                     | warn / info                                     | nanometers pasted into OpenPBR (or the reverse)                                                                                                                                   | OPBRV 00:12:35                                         |
| dispersion                                                          | info                                            | dispersion on flat, parallel-faced glass, where it shows no fringe but costs samples; keep it for faceted gems and close bevels [added optics]                                    | Arnold OpenPBR doc ("gems only")                       |
| dielectric_priority                                                 | warn                                            | transmissive meshes that touch or overlap (bounding boxes) at the same Dielectric Priority: the overlap medium is undefined; higher number wins (glass 3, inclusions 2, liquid 1) | Arnold OpenPBR doc, Dielectric Priority                |
| opacity_thick                                                       | warn                                            | opacity on a thick surface                                                                                                                                                        | Arnold OpenPBR doc, Geometry                           |
| aniso_zero_roughness / aniso_faceting                               | warn                                            | invisible or faceted brushing                                                                                                                                                     | ARVID 00:15:12, Arnold SS doc                          |
| uniform_roughness                                                   | info (hero shaders)                             | nothing breaks up roughness or normals                                                                                                                                            | ARVID 00:35:49                                         |
| polished_no_smudge                                                  | info (hero shaders)                             | polished metal or glass (roughness < 0.1) whose roughness comes from noise only: no smudge or fingerprint source (file or cell noise)                                             | Arnold OpenPBR doc, Specular Roughness; ARVID 00:25:11 |
| no_tx                                                               | info                                            | textures without a pre-baked .tx sibling (one line for the scene)                                                                                                                 | ARV-T 00:14:44 (lighting notes); RAYC 00:13:04         |
| hair_diffuse, hair_melanin_texture, hair_tint, hair_ior, hair_shift | warn / info                                     | non-physical Standard Hair                                                                                                                                                        | Arnold Standard Hair doc                               |
| disp_no_subdiv, disp_padding, autobump_no_uvs, disp_zero_twice      | warn                                            | faceted or clipped displacement, zero values that add                                                                                                                             | JHILL 00:27:32, Arnold displacement doc                |
| smooth_preview_stack                                                | error                                           | Smooth Mesh Preview under Arnold subdivision                                                                                                                                      | Arnold subdivision doc                                 |
| subdiv_budget                                                       | error                                           | faces x 4^iterations above the budget (default 20 M [added])                                                                                                                      | Arnold subdivision doc                                 |
| unassigned                                                          | warn                                            | meshes left on the default shading group                                                                                                                                          | [added]                                                |

Also: `mx_validate.validate(profile="model")` clean on the received asset, `handoff_report()`
written, every texture's .tx present before a farm render (Raycast [vPHhVrxxThU 00:14:34]). For a
hero product, each material judged against a real photo lit like the photo (Arvid [cpMBRIWwghg
00:02:44, 00:36:21]): a flawless material under the wrong light is not yet judged.

## 2. The reference strip (frame 1 of the turntable)

- **Chrome ball:** reflects the HDRI the right way up and rotated like the dome; strips of the
  studio HDR read as clean shapes. Wrong orientation: dome rotation or format. Nothing reflected:
  the ball's shader or the HDRI connection.
- **Gray ball vs the chart's neutral patches:** neutral (channel spread small) and close to the
  neutral 5 patch (sRGB 122, about 0.19 linear, next to the 0.18 ball [added]). A color cast on both
  points to the HDRI (fix the HDRI, Raycast [vPHhVrxxThU 00:36:02]); a cast on the ball only points
  to its shader; everything too saturated under ACEScg points to an HDRI tagged Raw.
- **Chart:** lit like the asset (diffuse shader), patches in order (dark skin top left). A flat,
  unlit chart means a surface shader (Raycast's own correction).

## 3. Per material: what the experts look at

Render the material's crop at final samples with the other lobes isolated first (`isolate_lobes`),
then the full shader, next to the reference photo at a matching angle (Arvid [cpMBRIWwghg
00:02:44]).

**Painter transfer.** Under Painter's HDRI and focal length, highlights, diffusion, bumps and normal
strength "pretty similar" to the Painter screenshot (Sarkamari [ZtEiVa3MPLg 00:13:42]); rotating the
dome, roughness breakup reacts (Sarkamari [ZtEiVa3MPLg 00:26:30]). Mismatch order of suspects: color
spaces, grayscale plugs, normal convention, then values.

**Metals.** Edge tint at grazing (chrome slightly blue, gold warm) [tEUiIBApw-U 00:02:17];
reflections broken but not wobbly; brushed highlights stretch perpendicular to the brushing and are
smooth, not stepped (Arnold SS doc); no specks that survive more AA and specular samples. If they
do, it is data: halve the bump, clamp the texture (Raycast [vPHhVrxxThU 00:33:43, 00:34:16]).

**Glass and crystal.** Tint deepens where the glass is thicker; no black refraction (transmission
ray depth, lighting's setting); what is seen through it is slightly distorted, not a perfect mirror
(Arvid [cpMBRIWwghg 00:32:20]); iridescence only at grazing angles [cpMBRIWwghg 00:29:40];
dispersion only on gems or close bevels; where crystal, gasket or liquid overlap, the priority order
is set (container highest). Thin panes on single-sided geometry do not refract the background (thin
walled, [tEUiIBApw-U 00:13:37]).

**Skin.** Ear backlight reads red, the nose is not waxy, eyelid corners hold, pores read as light
"going in" (J Hill [mpk6IurOWbs 00:18:31, 00:20:08, 00:28:39]); oil on the T-zone and lips reads as
oil, not plastic, and roughness is "not too glossy, not too matte" on the nose [mpk6IurOWbs
00:22:18]; micro noise adds chatter without making the skin matte [mpk6IurOWbs 00:37:31].

**Car paint.** Flake size and density match a close-up photo, flip-flop reads, highlights "jump"
across panels when the camera or asset turns (Arvid [cpMBRIWwghg 00:45:05]), the paint is "not super
smooth anywhere" [cpMBRIWwghg 00:54:59], and flakes survive the denoiser [cpMBRIWwghg 00:54:27].

**Leather, rubber, stone.** Leather grain very subtle, visible in highlights more than in shadow
(Arvid [cpMBRIWwghg 00:05:05]); rubber darker than intuition (linear 0.01 to 0.04) with glossy oily
patches [cpMBRIWwghg 00:06:25, 00:10:47]; stone and plaster matte through diffuse roughness, with
large-scale roughness variation.

**Hair.** Plausible natural color from melanin, primary and secondary highlights, no diffuse
flatness, blond hair not noisy at final AA, strands round in close-ups (accurate or adaptive
scattering) (Arnold Standard Hair doc; groom digest).

**Displacement.** No black holes (padding), no stair-stepping or faceting on silhouettes
(iterations), the object neither inflated nor shrunk (zero value), fine detail from autobump present
in camera rays; A/B against the normal-mapped version shows light going into the detail (J Hill
[mpk6IurOWbs 00:28:39]).

## 4. The turntable as a whole

- Asset spin (frames 1 to N): forms read from every side, no material flips to wrong values at some
  angle, highlights travel and break across surfaces.
- HDRI spin (N+1 to 2N): the asset holds under light from every direction, no angle exposes a wrong
  color space or a missing map (dark or flat patches), reference balls agree with the asset.
- What reads as CG (expert-notes list): straight reflections, uniform roughness, perfect refraction,
  detail only in a normal map on a smooth silhouette, crushed blacks, flat lifeless framing, wrong
  texture spaces, values above 1.

## 5. Honest reporting

Say which renders were looked at, at which resolution and samples; mark every value that is a
starting point [added] rather than matched to reference; list soft test failures and [verify] items
still open. Never call a material done from a lint pass alone.
