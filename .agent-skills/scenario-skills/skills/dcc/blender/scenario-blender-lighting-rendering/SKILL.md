---
name: scenario-blender-lighting-rendering
description: "Use when lighting, rendering or compositing in Blender: light a character, product or hero shot, interior at dusk or night, three-point or motivated lighting, sun and sky, HDRI, EEVEE vs Cycles settings, light leaks or noise, flat or muddy renders, subject not standing out, AgX/ACES color management, render passes, EXR, light groups, bloom and vignette in the 5.x compositor, rule of thirds and value checks, toon/NPR looks, or judging a render like a lighter."
license: MIT
---

# Lighting, rendering and compositing

Expert lighting controls where the eye goes. Shape comes from gradients, the subject is separated
from its surroundings by value (checked desaturated), every light has a source and a purpose, and
every decision is measured on the render, not on lamp values. Work from a controlled base, change
one thing at a time, and compare. If a sibling skill named here is missing from your available
skills, load it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-blender-expert (execution channel, review loop, 5.2 API changes).
Related: scenario-blender-texturing-shading (materials, skin SSS),
scenario-blender-previs-storyboard (shot planning, cameras).

Toolkit: [`scripts/bx_light.py`](scripts/bx_light.py) (tested on 5.2.1): rigs placed relative to
subject and camera, EEVEE/Cycles presets, color setup and audit, 5.x compositor helpers, render
analysis. Import: `sys.path.append("<this skill>/scripts"); import bx_light as BL`.

## Stance (the expert delta)

- **Value separation first.** Andy Goralczyk separates character from background by value in almost
  every shot and checks it desaturated. Andrew Price: the highest-contrast area becomes the focal
  point whether you want it or not (the bright window beats the couch). Fix by darkening the set
  before brightening the subject.
- **Light size and distance are the controls.** Andrew: a large source reads form and hides pores, a
  small one reads texture and grit, so a face key is a large source, never a small bulb (unless toon
  or deliberately harsh). Inverse square is an attention tool: move a light closer instead of adding
  helpers. No key:fill ratio is a rule (Andrew: "half the key is bogus"): dim the shadow side until
  it reads as shadow with detail, and measure on the subject.
- **Motivate, then cheat plausibly.** Every light needs a source and a color from the world (Gleb
  Alexandrov, Lino Thomas). Andy puts the rim on the key side, because on the shadow side it reads
  as a bounce from nowhere. When the source is behind the subject he fakes a key into the face.
  Shadow casters and light linking keep cheats off the set. Gleb stops before the image "looks lit".
- **EEVEE is a trench coat (Andrew).** Ray tracing is off in a factory scene. World light passes
  through walls unless the volume probe's outer samples sit at the inner walls (Andrew; measured
  0.26 leak to 0.002; 5.2.1 puts samples one spacing inside the box, so size the box from the
  points). Soft lights need per-light jitter (Gleb) and custom distance (measured: automatic
  distance loses 8 %).
- **Cycles economy (Andy, Sprite Fright):** 3 bounces, no caustics, no clamping, Fast GI, and
  bounces faked with lights. Keep sharp speculars for the eyes and hero metal only.
- **Linear and wide until the end (Jacob Holiday).** EXR stays linear while PNG bakes the view
  transform. AgX hides clipping (linear 4 displays 0.91), so read the EXR. Global brightness is
  `exposure` in the view transform, not scaled lights (keeps every ratio, including world and
  emissives). AgX for scenes, Khronos PBR Neutral for product color. Set the working space once
  (Nathan Vegdahl).
- **Rebalance in comp, not by re-rendering** (Wyatt, Robin). In Cycles, light groups per role (key,
  fill, rim, window): one render, then gains in the compositor (`BL.light_groups`,
  `BL.lightgroup_mix`). EEVEE has no light-group outputs: use light linking and view layers.
- **Always comp, lightly (Pau Homs):** bloom, vignette, then a correction, stopping before it reads
  as a filter. In 5.x the compositor is a node group.
- **Color has three contrasts (Lino):** value, saturation and hue. Keep one saturated focus hue and
  desaturate its complement over large areas.

## Establish first

| Input                               | Why it changes the plan                                                                                                      | Default when silent                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Still or animation                  | Continuity, flicker and temporal denoise                                                                                     | Still                                                      |
| Engine                              | EEVEE: stylized, fast iteration, volumes, NPR, viewport comp with passes. Cycles: glass close-ups, bounce realism, reference | EEVEE to iterate, plus a Cycles reference render           |
| Style                               | Toon terminators need a small, unjittered key                                                                                | Stylized-realistic                                         |
| Subject and focus point             | Rig target (the face), mask for the analysis                                                                                 | Character head, else bbox center                           |
| Time and motivation                 | Color scheme: warm practicals, cool sky, sun                                                                                 | Night/dusk interior: warm key (2,700 K [added]), cool fill |
| Delivery                            | PNG display plus EXR master; external grade?                                                                                 | PNG + 32-bit multilayer EXR                                |
| Color fidelity                      | Brand RGB: Khronos PBR Neutral; skin: ACES 2.0 or AgX High Contrast                                                          | AgX                                                        |
| Late balance changes, comp hand-off | Cycles light groups per role, multilayer EXR                                                                                 | groups when rendering in Cycles                            |

## Workflow

1. **Compose, then lock the camera.** Lighting is view dependent (Andrew). Use `BL.screen_xy` and
   `BL.aim_camera_at_frame_point(head, 1/3 or 2/3, 0.62)` for look room, and 80 mm for boxy
   products. GATE: one focal element; subject near a thirds point or a deliberate symmetry, pyramid
   or full frame.
2. **Controlled base.** For a studio: world strength 0 and a near-black rough ground (Andrew). For
   an EEVEE interior: `pb = BL.volume_probe_for_room(inner_lo, inner_hi, cell=0.5, wall=0.2)` (outer
   samples on the inner walls), `BL.probe_report(pb, inner_lo, inner_hi)`, then `BL.bake_probes()`.
   For an exterior: `BL.outdoor_sun_sky(..., azimuth_space="world")`. GATE: `probe_report` flags
   nothing and a world-only render of a sealed interior is near black.
3. **Key.** Use `BL.three_point`, `BL.motivated_interior` (window + practical, cheated linked key,
   spot practical, rims, bounce) or `BL.outdoor_sun_sky`. Lights stay out of walls automatically.
   GATE: `BL.light_report(target=head, face=head)` has no flags (frontal key, key below the eye
   line, key smaller than the head), and a clay render (`BL.clay(True)`) gives
   `internal_ratio >= 2.5`.
4. **Supporting lights.** Add fill, rim, bounce and `BL.eye_light`, plus `BL.shadow_caster`,
   `BL.fake_sun`, `BL.split_world` or `BL.haze` as needed. Linking lives on the light OBJECT
   (`obj.light_linking`, via `BL.link_light`), not the Light datablock. Adjust one lamp at a time:
   `BL.light_contributions(lights, mask, dir)`, or in Cycles `BL.lightgroup_check(exr, mask)` from
   one render. GATE: the key has the largest share on the subject, the world is under 10 % indoors,
   and each rim is motivated.
5. **Measure and look.** `r = BL.render(base)` gives PNG + EXR. Then
   `mask = BL.mask_cryptomatte(r["exr"], names)` (or `BL.mask_workbench`),
   `rep = BL.analyse(r["png"], mask, exr=r["exr"])`, `BL.verdict(rep)` and `BL.value_study(...)`,
   and open the images. GATE: the verdict is empty and in the value study the subject owns a value
   group; otherwise darken the set, carve with spots or blockers, and link the key.
6. **Color.** `BL.color_setup(view, look, exposure)` (brightness here, never by scaling lamps) and
   `BL.color_audit()`. GATE: the audit is empty, no complementary clash is flagged, clip is at most
   0.5 % outside emitters, and the linear max is intended.
7. **Render settings.** `BL.preset_eevee(quality="final", interior=...)` or
   `BL.preset_cycles(quality="final", budget="film")`. For EEVEE finals, render a Cycles preview
   reference (Andrew). GATE: the subject is within about 30 % of Cycles and there are no engine
   artifacts (critique section 7).
8. **Comp.** Cycles: `mix = BL.lightgroup_mix(gains, exr=r["exr"])` re-grades key/fill/rim/window
   from the EXR in about 0.2 s (`BL.set_gain`, RGB gains recolor). Then
   `BL.comp_finish(bloom=0.25, vignette=0.3, contrast=0.05, source=mix["socket"])`; masks with
   `BL.matte(tree, names)`; pixel sizes through `BL.relative_px`; passes, back to beauty and view
   layers are in procedures P13. GATE: re-run the verdict on the finished frame; the vignette ratio
   should fall.
9. **Deliver with evidence:** final PNG, EXR, value study, the light table, the verdict, and what
   was not verified.

**Animation:** pin the sun per location with `sun_azimuth` within about 30 deg (Andy). Light the
wide shot and propagate it to coverage. Check shots with `BL.contact_sheet` and `BL.sheet_stats`
(outliers more than 0.5 stop from the median). Keep temporal denoise on and never use ray-tracing
resolution 1/16.

## Numbers

| Value                                                                                                                                                                                     | Relative to     | Source                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------- |
| Level of a white card: point P/(4π²d²), area P/(π²d²), sun S/π                                                                                                                            | `BL.energy_for` | measured, both engines |
| Source as big as its distance delivers 75 % of the nominal level                                                                                                                          | apparent size   | measured               |
| AgX display: 0.18 to 0.463, 1.0 to 0.773, 4.0 to 0.910                                                                                                                                    | linear value    | measured               |
| Key 40 deg off axis, 35 deg up, 3 subject radii, size = radius                                                                                                                            | subject, camera | [added] defaults       |
| Frontal flag: key < 20 deg off the camera axis                                                                                                                                            | camera axis     | [added]                |
| Sun angle about 2 deg; continuity ±30 deg                                                                                                                                                 | set             | Andy                   |
| Kelvin: candle 1,500, incandescent 2,000 to 2,500, daylight 6,500 (practical default 2,700 [added])                                                                                       | light           | Andrew                 |
| EEVEE: RT 1:1 and GI 1:2 for finals, Fast GI steps 16, shadow steps 12 to 16 (leaks), shadow rays 2 (penumbra)                                                                            | render          | Andrew                 |
| Volume probe: outer samples on the inner walls (samples at local (i+1)/(N+1)x2-1); leak 0.22 at 0.44 m inside, 0.054 at 0.2 m, 0.002 at the wall, 0.009 past the wall; surfel density 100 | room            | Andrew, measured       |
| Brand color error (of 255): Khronos 3.8, AgX 27 to 42, Standard 33                                                                                                                        | white furnace   | measured               |
| Haze density about 0.05 for a room                                                                                                                                                        | volume          | Andrew                 |
| Cycles film: 3 bounces, clamp 0, no caustics, 100 test / 500 to 1,500 final samples                                                                                                       | render          | Andy                   |
| EXR: multilayer, half float, DWAA for comp; 32-bit masters                                                                                                                                | output          | Robin, Andy            |
| Verdict: surround separation ≥ 0.10, edge merge ≤ 35 %, clay form ratio ≥ 2.5, value range ≥ 0.30, clip ≤ 0.5 %                                                                           | display luma    | [added], calibrated    |

## Quality gates

Measurable:

```python
rep = BL.analyse(png, mask, exr=exr); problems = BL.verdict(rep)          # [] = pass
flags = BL.light_report(target=head, face=head)["flags"]; audit = BL.color_audit()
probe = BL.probe_report(pb, inner_lo, inner_hi)["flags"]                  # EEVEE interiors: []
groups = BL.lightgroup_check(exr, mask)                                   # Cycles: rel_error ~0, shares
shares = BL.light_contributions(lights, mask, out_dir)                   # per-light share on subject
```

Visual: open the render, the `value_study` panel (desaturated | value groups | squint) and, for
sequences, the contact sheet. Judge them with [`references/critique.md`](references/critique.md):
first read, value structure, form, motivation, color, composition, artifacts, finish.

## Common mistakes

| Mistake                                                         | What it looks like                             | Fix                                                                       |
| --------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| Frontal key                                                     | Flat, "flash photo", clay form ratio about 1.3 | Key 30 to 60 deg off axis, above the eye line                             |
| Practical behind the subject used as the key                    | Dull face, bright wall steals focus            | Cheated key on the source's side, linked to the subject                   |
| Bare point practical near a wall                                | Blown wall, shelf becomes the focal point      | Spot with the shade's cone; blocker                                       |
| EEVEE interior without probe, or a probe box drawn to the walls | Shadows lifted blue/gray everywhere, muddy     | Outer samples at the inner walls (`probe_report`), bake, sealed-room test |
| Small bulb as a face key                                        | Pores and texture, harsh face                  | Large source (head-sized or more); flag in `light_report(face=)`          |
| Brightening by scaling lamps                                    | World and emissives left behind, ratios drift  | `exposure` in the view transform                                          |
| `light.data.light_linking`                                      | AttributeError                                 | Linking and light groups are Object properties                            |
| Re-rendering to rebalance lights                                | Hours per tweak                                | Cycles light groups + `lightgroup_mix`                                    |
| Rig lights inside walls                                         | A rim that contributes nothing                 | `avoid=subject` (default in rigs)                                         |
| Unlinked faked key                                              | Set brightens with the subject, no separation  | `link_key=True`; key share high, background share near 0                  |
| Judging clipping on AgX PNG                                     | Highlights look fine, EXR at 20+               | Read `linear_max`, use exposure                                           |
| Big soft jittered key on a toon material                        | Dithered, noisy terminator                     | Small unjittered key for NPR (Wyatt: crisp shadows for toon)              |
| Inverted hull outline                                           | Character goes dark or flat                    | Outline material transparent to shadow rays (`outline_hull`)              |
| AOV named in shader only                                        | Pass silently missing                          | `BL.register_aovs()`                                                      |
| Pixel-sized comp effects                                        | Look changes between preview and final         | `BL.relative_px`                                                          |
| Exclude instead of indirect-only in layers                      | Missing shadows in the comp                    | `indirect_only` (0.0004 vs 0.016 diff)                                    |

## Blender 5.2 notes

- EEVEE id is `BLENDER_EEVEE`; `use_raytracing` is False by default;
  `use_bloom/ssr/gtao/soft_shadows` are gone (Glare node, ray tracing, Fast GI, per-light jitter).
- Probes are `SPHERE/PLANE/VOLUME`; `lightprobe_cache_bake` runs synchronously headless; the
  sphere-probe default is 512. Volume samples sit one spacing inside the box faces, never on them.
- EEVEE writes Cryptomatte but no Object Index pass; light groups are Cycles only (EEVEE Render
  Layers has no `Combined_<group>`); light linking works in both engines. `light_linking` and
  `lightgroup` are Object properties; `bpy.types.Light` has neither.
- Compositor: `scene.compositing_node_group`, Group Output, `ShaderNodeMix` (color sockets 6/7,
  result 2), menu inputs take display names ('Bloom'). GPU is the default device. Assets live in
  `datafiles/assets/nodes/compositing_nodes_essentials.blend`.
- Color: the working space is read-only (use `bpy.ops.wm.set_working_color_space`); looks are
  prefixed ('AgX - Punchy'); 'Linear'/'Raw' are rejected; camera log spaces exist; Principled Thin
  Wall exists for window glass.
- `matrix_world` is stale after setting a transform; call `view_layer.update()`. OIIO
  `read_image(subimage, ...)`: the first argument selects the part.

## References

- [`references/procedures.md`](references/procedures.md): tested code for every stage (P1 units to
  P17 exposure and color), with measured results and test paths. Load before writing code.
- `references/critique.md`: the rubric to judge a render or sequence, in expert reading order, with
  the code check behind each question.
- [`references/expert-notes.md`](references/expert-notes.md): principles per expert with timestamps,
  plus the disagreements table. Load for judgment calls and attribution.
- [`references/sources.md`](references/sources.md): the 15 videos, credentials, best timestamps, and
  which to consult for which question.
