---
name: scenario-maya-lighting-rendering
description: 'Use when lighting or rendering in Maya with Arnold: a product hero shot, a character close-up or a sequence (master and shot lighting), key, fill and rim placement, "the Arnold render is noisy" or fireflies, render settings and time budgets, AOVs, light groups and EXRs for Nuke, OIDN or noice denoising, ACES or OCIO color, renders that look flat or too dark, Render Setup layers, batch or command-line renders, or judging a lit frame like a lighting supervisor.'
license: MIT
---

# Lighting and rendering in Maya 2027 (Arnold)

Expert lighting is a story decision made measurable: know where the eye must land, shape every form
with one dominant light, structure values back to front, prove it with light groups and numbers
before the eye signs off. Rendering is engineering: find the noise in the AOVs before touching a
sampler, deliver scene-linear EXRs whose passes rebuild the beauty, judge through a tone-mapping
view. If a sibling skill named here is missing from your available skills, load it with `skill_get`
(Scenario MCP) or ask the user to install it (https://github.com/scenario-labs/skills#install);
unattended, proceed from tool schemas and flag the gap.

**REQUIRED BACKGROUND:** scenario-maya-expert (execution channel, review loop, 2027 version traps).

**Status (2026-09-24):** [`scripts/mx_light.py`](scripts/mx_light.py) is **not yet run in Maya**:
138 offline checks passed (python3 + numpy); the Maya layer ran only against a fake `maya.cmds`.
Once Maya is installed: `tests/code/maya-lighting-rendering/run_all.sh`, then fix names from
`probe_lighting.json`.

## Stance (the expert delta)

- **Story and target first; brighten by darkening.** "What is the story I am trying to tell?" before
  any button; the target may be a hand or a door, not the face by default (KT [00:16:50] [00:15:49];
  TZ-C [00:10:51]). To brighten the subject, darken its surround; pushing the subject clips it (KT
  [00:30:31]).
- **One light stands above the others.** "Too many light sources at the same intensity" is the
  common failure (BR-B ch6 Balance); a rim hotter than the key fails too: "small and hot" is
  radiance, not more energy (JHILL [00:13:47]). Arvid keeps the key strongest (ARV-L [00:06:51]);
  for Brejon it is the main shaping light (BR [00:23:36]). Decider: pick the key by the shape it
  gives, then measure ONE dominant group on the subject mask.
- **Key upstage, measured from the face axis.** Light the far side of the face (BR-B ch8.5);
  measured from the lens axis, a turned face gets a frontal key [added test]. No light on the camera
  side (BR [00:13:46]); the wrap is front-ish, lower, more saturated, about twice the key's size (BR
  [00:26:54] [00:27:59]); never an ambient light.
- **Values back to front, counterchange behind every subject.** Far blacks lifted and flat,
  foreground darkest and most contrasty (TZ-C [00:08:38]); light behind shadow and shadow behind
  light, never dark on dark (BR [00:38:56] [00:40:02]); vignette the lighting with blockers (BR-B
  ch6 Vignetting).
- **Reference first; on polished products the reflections are the product.** Real photographs of the
  same subject and situation, their light placement rebuilt before judging any material (ARV-C
  [00:02:44] [00:36:21]); Brejon lost two days without one (BR [00:08:13]). Each softbox sits on the
  reflected view ray of the plane it defines (`reflection_placement`) [added], black flags give dark
  bands; soft means large (JHILL [00:08:26]).
- **Find the noisy AOV, then raise that sampler only.** The wrong rays cost time and leave the noise
  (SMP § Removing Noise); rays per pixel = AA² x samples², so raising AA means lowering the rest
  (ARV-T [00:07:12]). Maya 2027 uses Global Light Sampling: one count, 4 or fewer on CPU; per-light
  samples only matter on dome, distant and local-mode lights (SMP § Limitations). Emission is the
  noisiest light (LGT § Mesh Light vs Emission).
- **90% of the look in the beauty; grades go back into the lights.** Shaping cannot be faked in comp
  (KT [00:45:39]); light groups answer small notes (SARK [00:11:28]); "I ALWAYS copy back the
  values" (BR-B ch8 Final result) as a multiplier on the light color (BR [01:03:30]).
- **Judge through the ACES view, deliver scene-linear.** Without tone mapping you under-light into
  "a complicated rig of 50 lights" (BRJ-CM Ch.1); output transform off for EXR (CM); under ACEScg a
  linear HDRI is linear Rec.709, not Raw (CM § ACES Workflow).

## Establish first

| Input                                       | Changes                                         | Default when silent                                                                                     |
| ------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Deliverable: still or sequence, size, range | sampling, denoiser, budget                      | still; block at 320 px, preview at half size                                                            |
| Story and focal target                      | every gate                                      | product: the dial or logo; character: the speaking face                                                 |
| References                                  | light placement, values                         | photos of the same subject and situation in `brief["references"]`; the critique warns without           |
| Machine                                     | device, denoiser                                | macOS: CPU only, no Arnold GPU or OptiX; OIDN                                                           |
| Mood, art direction                         | face lit/shadow ratio, symmetry                 | "drama", 2 stops [added `MOOD_RATIO_STOPS`]; natural, asymmetric (BR-B ch6 Planet 51)                   |
| Continuity contract                         | allowed shot tweaks, one master per camera axis | conservative: exposure, transform, visibility (BR [00:37:17])                                           |
| Color pipeline                              | rendering space, view, delivery                 | Maya default: ACEScg, ACES view, EXR ACEScg half                                                        |
| Comp needs                                  | AOV preset, light groups (16 max)               | groups on RGBA, Z, subject mask; `comp` preset for a compositor                                         |
| Render budget                               | settings ladder                                 | measured on a preview, extrapolated before a final                                                      |
| DOF and motion blur                         | 3D or comp; what must be sharp                  | 3D for hair, glass, overlapping depth (BR [00:54:45]); bokeh needs small bright sources (BR [00:55:51]) |

## Workflow

Headless through scenario-maya-expert's `mx_run.py --plugins mtoa` (`import mx_light as L`); frame
analysis runs in plain python3. Arnold RenderView is GUI only: iterate with batch renders you open.

1. **Intake.** `mx_validate.validate(profile="shot")` on shots; scenario-maya-lookdev's
   `handoff_report` for assets; `L.cm_audit_scene()`; write the brief (`L.default_brief`, procedures
   P1) with its references; read in each where the key, rims and dark bands sit. GATE: no validation
   fail, color audit pass, story, target and references written.
2. **Plan and block.** `L.plan_product_rig(name, bb_min, bb_max, cam_pos)` or
   `L.plan_character_rig(char, head_c, head_size, cam_pos, face_forward)`;
   `L.rig_plan_checks(plan)`; `L.apply_rig(plan)`. Brejon's order: practicals, key, wrap, rim, top;
   atmosphere from the first render (BR [00:19:46] [00:33:29]). Render on gray
   (`with L.grey_shading(0.18)`, preset `block`), open `L.light_group_sheet(exr, png)`. Aperture
   from `L.dof_plan(near, far, focal)` on `L.view_depth_range` of what must be sharp. GATE: key
   upstage, wrap off the lens axis, 16 groups or fewer; each light solo does its job (BR
   [00:25:14]); DOF plan holdable.
3. **Shape and balance by measurement.** `r = L.render_shot(out, cam, masks={"subject": [root]})`,
   `rep = L.analyze_frame(png=r["png"], exr=r["exr"], brief=brief)`, `L.write_report(rep, out)`.
   Work the findings top-down (reference, eye path, values, separation, balance, face, color). GATE:
   no fail; every warn fixed or kept with the reason; `annotated.png`, `squint.png` and the solo
   sheet judged with [`references/critique.md`](references/critique.md).
4. **Master to shots (sequences).** A lights-only master per camera axis, referenced into each shot,
   rendered out of the box first, widest shot first; tweaks only within the contract, logged
   (procedures P13; BR-B ch8). GATE: `L.compare_frames` against master and neighbors; signature
   features (a character's rim) in every shot.
5. **Noise and budget.** `pair = L.render_seed_pair(out, cam)` (denoiser off),
   `L.noise_pair(pair["a"], pair["b"])`, `L.next_step(...)`, or
   `L.noise_loop(render_pair, settings)`. Fireflies go to `L.FIREFLY_PLAYBOOK`, not to samples. OIDN
   first in the chain (`L.set_denoiser(first=True)`), noice for sequences; OIDN forces a box filter
   and denoises full frames (AOV § OIDN): cut detail crops from a full frame, render the
   `detail_loss` reference with a box filter. `L.extrapolate_time`, `L.sequence_budget`,
   `L.TIME_SINKS` before cutting samples. GATE: beauty noise at the brief's target under the chosen
   denoiser; `L.detail_loss` about 0.8 or more on hero detail; time fits.
6. **Passes and comp handoff.** `L.set_light_groups(one_dict)`, `L.setup_aovs("comp")`,
   `L.add_mask_aov`, `L.setup_exr_driver()`; `L.check_sums`, `L.group_contract`, `L.comp_recipe`.
   Comp notes return through `L.grade_to_light`. GATE: groups plus default rebuild the beauty within
   1%, no empty requested pass, EXR single-part, zip, half color, float Z/P/N.
7. **Final and delivery.** Render Setup layers as a template (`L.make_layer`,
   `L.export_render_setup`), `L.render_cmd(...)` with `-rst`, or `L.render_shot` per frame; .tx
   pre-baked, auto-TX off, use-existing on (ARV-T [00:14:44]); `L.licence_check_cmd()`, then
   `L.render_env(final=True)` so an unlicensed batch aborts instead of watermarking; re-time one
   full frame; check exit code and files; critique; new version. GATE: frames on disk, report
   written, not-verified list stated.

## Numbers

| Item                 | Value                                                                                                                                                     | Relative to, source                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Rays per pixel       | AA² x samples²: AA 3 diffuse 2 = 36; AA 6 specular 6 = 1296                                                                                               | SMP § Camera (AA)                                                             |
| Global light samples | 4 on CPU; 1 or 0 when a dome or distant light dominates                                                                                                   | SMP § Best setting                                                            |
| Adaptive             | AA 3 to 4, Max AA 20, threshold 0.015 [verify 2027 default]; off in previews                                                                              | SMP                                                                           |
| Motion blur, DOF     | AA about 12, up to 20 for strong DOF, secondaries 1                                                                                                       | ARV-T [00:20:29]                                                              |
| Ray depth            | diffuse 1 to 2 products and exteriors, 3 to 4 interiors; specular 2 unless glass or inter-reflecting metal                                                | ARV-T [00:05:59]; SARK [00:08:27]                                             |
| Skydome resolution   | 1k for lighting only; the HDRI width (cap 8k) when chrome or glass reflects it                                                                            | ARV-T [00:07:54]; LGT § Resolution                                            |
| DOF                  | `aiApertureSize` = radius (world units) = focal/(2N); sharp depth about c d / radius, c = frame width/1200 [added]; same framing, same depth at any focal | LGT § Aperture Size; `L.dof_plan`                                             |
| Clamps               | indirect 10 or more; pixel clamp 30 to 50                                                                                                                 | BRJ-CM Ch.1 Range                                                             |
| Light AOVs           | 16 max; Brejon used 9 for 30 lights                                                                                                                       | AOV; BR [01:12:25]                                                            |
| noice                | strength 0.45 (0.2 texture, 0.8 GI and SSS), `-ef` up to 2, no `-t` on macOS                                                                              | AOV § Arnold Denoiser                                                         |
| ACES view            | scene 1.0 shows about 0.81; a bit more than 16 reaches white                                                                                              | MLC [00:02:13]                                                                |
| Wrap                 | 2x the key's size, lower; 30 deg or more off the lens axis [added threshold]                                                                              | BR [00:27:59] [00:13:46]                                                      |
| Starting exposure    | E = log2(pi d² target), normalized area light at distance d; 15 at 1 m in cm                                                                              | [added] from LGT § Exposure, § Normalize; Arvid's 15 to 20 (ARV-L [00:03:58]) |

## Quality gates

- **Code:** `rig_plan_checks` pass; `scene_checks` no fail (ambient, Samples 0, HDRI Raw under
  ACEScg, dome resolution, group typos, key upstage); `render_settings_report` answered (denoiser,
  TX, device); `analyze_frame` verdict passes; `check_sums` ok; `cm_audit` pass; the noise loop
  stopped for a stated reason. `L.THRESHOLDS` are [added]: calibrate on an approved frame.
- **Visual:** the beauty at full size and as `squint.png`, beside its reference; `annotated.png`
  (saliency peak, clipped red, crushed blue); the solo sheet; the -5 to +5 stop bracket; sequences
  cut with neighbors. Judge with `references/critique.md`, in order.

## Common mistakes

| Mistake                                             | Looks like                         | Fix                                                                                                  |
| --------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Key measured from the camera                        | frontal, flat key on a turned face | `plan_character_rig` measures from the face axis                                                     |
| Fill from the lens axis, or an ambient light        | flat faces, no core shadow         | wrap front-ish off axis; delete ambient (unsupported in Arnold)                                      |
| Rim equal to or above the key                       | two competing sources              | rim at least 0.5 stop under the key; `rim_equals_key`                                                |
| Raising AA or every sampler for noise               | time explodes, noise stays         | `noise_pair`, then one sampler; AA for alpha, blur, reflected diffuse                                |
| Per-light samples raised on area lights             | no effect under GLS                | global light samples; per-light only for dome, distant or local mode                                 |
| Emissive geometry as the light                      | noise that samples cannot clean    | area or mesh light (LGT)                                                                             |
| Light-group typo                                    | empty pass, no error               | one dict; `group_contract`, `check_sums`                                                             |
| A light group for bounce cards or an emissive plane | empty `RGBA_cards`                 | groups live on lights; a card lands in its light's group; emission is `O` (emission AOV, LPE `C.*O`) |
| Aperture from habit ("f/11 holds a product")        | half the product soft              | `L.dof_plan`; camera nearer perpendicular to what must be sharp                                      |
| Dome at 1k while chrome reflects a 4k HDRI          | soft reflections                   | resolution at the HDRI width                                                                         |
| HDRI or EXR left on the Raw rule under ACEScg       | oversaturated, wrong lighting      | linear Rec.709 input space                                                                           |
| Old light values copied into 2027                   | renders look dark, rig grows       | re-judge exposure through the ACES view                                                              |

## Handoffs

- **Receives** from scenario-maya-lookdev: `<asset>_lookdev_v###.ma`, a passing `handoff_report()`
  JSON, the turntable sheet, sampling notes (SSS, transmission depth, detail to protect from the
  denoiser). From scenario-maya-animation: a shot version, rigs referenced,
  `validate(profile="shot")` clean, the approved playblast. From scenario-maya-fx and
  scenario-maya-groom: versioned caches with frame ranges.
- **Delivers** to comp or the client: EXRs `<shot>_<layer>_v###.####.exr` (ACEScg scene-linear,
  single-part, zip, half color, float Z/P/N, light groups, masks); display PNGs; `critique.md/json`,
  `annotated.png`, solo and bracket sheets; `comp_recipe` JSON; the render log (seconds per frame,
  rays per pixel); the not-verified list. Back to scenario-maya-lookdev when a fix must change GI or
  reflections, or repeats across shots (BRJ-CM Ch.9).

## Maya 2027 notes

- MtoA 5.6.x (Arnold 7.5, license ARNOL_2027); Arnold RenderView, since Maya IPR does not work with
  MtoA 5+.
- Global Light Sampling by default, per-light sampling mode in 5.6.0; per-group indirect AOVs
  exclude emission (Arnold 7.3), so sums need RGBA_default and emission.
- macOS: `settings_lint` fails a GPU device; OIDN in new scenes; no `noice -t`.
- Batch renders abort on license failure by default (Arnold 7.3, `abort_on_license_fail`); `mx_run`
  sets WN25's override `ARNOLD_FORCE_ABORT_ON_LICENSE_FAIL=0` so tests watermark [verify value].
  `Render -r arnold`, never `maya -render`.
- OCIO v2: ACEScg, ACES view; input `sRGB Encoded Rec.709 (sRGB)` since 2026.2; no ACES2065-1
  rendering space; .tx, .hdr, .exr rules default to Raw; query names.
- Render Setup and legacy layers are exclusive per session; setups travel as JSON templates.

## References

- [`references/expert-notes.md`](references/expert-notes.md): depth per expert with timestamps,
  disagreements and deciders. Load when a decision is not covered above.
- [`references/procedures.md`](references/procedures.md): blocks P0 to P13, brief to master and
  shot. Load before writing lighting code.
- `references/critique.md`: frame critique mapped to code checks, rubrics, severity. Load at every
  gate.
- [`references/gui-paths.md`](references/gui-paths.md): menus and editors for a computer-use agent
  or a human.
- [`references/sources.md`](references/sources.md): sources, credentials, URLs, timestamps.
- `scripts/mx_light.py`: the toolkit; its docstring lists every call and where it runs.
