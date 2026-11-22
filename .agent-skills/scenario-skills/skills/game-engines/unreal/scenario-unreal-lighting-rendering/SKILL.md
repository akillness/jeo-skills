---
name: scenario-unreal-lighting-rendering
description: 'Use when lighting or rendering in Unreal Engine 5.8: physical light units and exposure (EV100, lux, lumens), Lumen GI and reflections, MegaLights, virtual shadow maps, sky, fog and clouds, post process and color grading, the path tracer, or Movie Render Graph stills. Triggers: "Lumen is noisy", "MegaLights noise", "the interior is too dark", "light leaks", neon signs, a night or dusk scene, "fireflies", "path tracer vs Lumen", "render a still", EXR settings.'
license: MIT
---

# Lighting and rendering in Unreal Engine 5.8

Expert lighting in Unreal is a calibrated camera, physical light values, and a renderer that sees
the same scene you do; everything else is art direction layered on top and listed as such. Each step
is proved with a representation view and a number before the lit image is trusted; noise is fixed in
the system that owns it. If a sibling skill named here is missing from your available skills, load
it with `skill_get` (Scenario MCP) or ask the user to install it
(https://github.com/scenario-labs/skills#install); unattended, proceed from tool schemas and flag
the gap.

**REQUIRED BACKGROUND:** scenario-unreal-expert (channels, review loop, 5.8 traps).

**Status (2026-09-24):** [`scripts/ue_light.py`](scripts/ue_light.py) is **not yet run in Unreal**;
200 pure, 65 editor-layer and 20 procedure checks pass offline against a fake `unreal`. First editor
run: `tests/code/unreal-lighting-rendering/job_00_probe_lighting.py`.

## Stance (the expert delta)

- **Camera before lights.** Default auto exposure "childproofs" the engine: a 10 lux and a 100,000
  lux sun look alike. Chrome ball at the subject, Exposure Compensation 0, Min/Max EV100 clamped to
  the conditions, then lights; emissive last (Gobey nlbJwMoj1Dg [00:02:38] [00:11:40]; Faucher
  BGoaPyfZlYg [00:01:34]). Judge through Game Settings exposure, never the viewport EV100 override
  (Gobey [00:21:56]).
- **Physical values remove problems; cheats go on top and in the report.** Real lumens removed about
  80 percent of Lumen flicker (Argyriou Q1whHlGJB_o [00:14:41]); albedo is lighting, at most 0.8,
  floor 0.02 [added] (path tracer doc; Gobey [00:07:30]; Faucher X5zVhc5ahl0 [00:22:24]). Every
  light has a visible fixture and a source shaped like it (Faucher 0GYyHDuaPcg [00:15:14]
  [00:15:47]). Moons, fills and boosts are fine when listed (`cheat_inventory`): the path tracer
  will not show them.
- **Emissive is the look, lights do the lighting.** Small bright emissive is noisy, screen-space and
  clamped harder since 5.6 (`r.Lumen.ScreenProbeGather.MaxRayIntensity` 10): a neon sign gets a rect
  light fitted to its face, in front of it (Faucher 1e6oOiKh91U [00:12:30]; Gobey Q&A [00:37:33];
  MegaLights doc). Under Lumen, small emissive meshes get Emissive Light Source, optionally a
  Lumen-only boost of 5 to 10 through a Ray Tracing Quality Switch [verify node] (Campbell
  BKaAzhMHJZ0 [00:14:09]); the path tracer ignores that switch and double counts a tube plus its
  light (path tracer doc).
- **The renderer sees a proxy; look at it.** Lumen Scene and Surface Cache (black = screen traces
  only, pink = no cards, often a one-mesh room), MegaLights shadow caster mismatch, VSM cached
  pages, each against the lit view from the same camera (Faucher [00:07:21] [00:06:42]; Lumen,
  MegaLights, VSM docs).
- **MegaLights noise is stolen samples, not light count.** Hidden lights take up to 20 percent of
  samples (50 after failed reprojection), a directional up to 50. Tight radius, cones, barn doors,
  no light inside geometry, clusters merged, the sun on deferred plus VSM (Narkowicz and Costa
  dmmN8_c8Tb0 [00:10:37] [00:16:40]). Alpha masks are ignored by its ray tracing by default
  (MegaLights doc).
- **Shadow method follows what moves.** Local lights stay ray traced in gameplay: every character
  crossing a VSM local light invalidates its pages, while ray tracing pays per visible pixel with
  free penumbras (Campbell [00:26:25] [00:31:42]). VSM for the sun and for content ray tracing
  cannot represent, with a written reason.
- **A dark interior is a tone-mapper problem first; light before you grade.** Toe 0.55 to 0.3 and
  Local Exposure Shadow Contrast 0.6 before any fill (Gobey [00:14:58] [00:15:32]); then the ladder:
  direct light, one light's indirect boost, Diffuse Color Boost, global exposure last (Faucher
  0GYyHDuaPcg [00:08:14] [00:13:42]). Glossy surfaces need a direct light: Lumen indirect gives
  little specular (Faucher [00:10:28]).
- **For the still, the path tracer is ground truth and samples are its only quality knob.** On the
  deferred path, samples buy motion blur and anti-aliasing only; Lumen or shadow noise is fixed at
  the light or the PPV (Faucher X5zVhc5ahl0 [00:07:43]; fVg5ihB8Wdc [00:09:15]; Comly,
  demystifying-mrq).

## Establish first

| Input                                            | Changes                                               | Default when silent                                                                                                    |
| ------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Platform, frame rate                             | Lumen scalability, MegaLights, HWRT                   | console 60 fps: Lumen High; budgets from scenario-unreal-performance; Mac numbers are proxies                          |
| What this Mac runs (probe)                       | every plan                                            | M5 Max, macOS 26.5.1: Lumen HWRT and MegaLights Experimental, Nanite and VSM Beta, path tracer supported (deltas file) |
| Deliverable                                      | exposure mode, still plan                             | gameplay plus one still; direct delivery (tone-mapped PNG plus EXR)                                                    |
| Conditions the player walks between              | EV100 bracket                                         | `CONDITIONS`: interior 4, blue hour 6.5 [added], low sun 7, moonlit 1                                                  |
| Style                                            | physical vs art-directed moon and sun                 | physical base; film moon and a 15 degree sun floor only for readability (Faucher; Oakley rX0wZZxpB-U [00:19:16])       |
| Key cameras; glass and emissive fixtures in shot | fog scattering, cheats, glass and double-count audits | bookmarks from the brief; front layer only in a PPV around hero glass                                                  |

## Workflow

Editor Python via Epic's MCP server or `ue_remote`; `import ue_light as L`; full code in
[`references/procedures.md`](references/procedures.md). Screenshots are latent: one capture per
call.

1. **Probe and settings (P0, P1).** `probe()`, `render_settings_report`, `ini_patch` after a backup;
   extended luminance range only in a new project. GATE: probe JSON read.
2. **Calibrate the camera (P2).** `spawn_calibrator` at the subject, then one unbound `PPV_Global`:
   `apply_exposure(ppv, exposure_plan("gameplay", ("interior", "blue_hour")))`, `apply_look` (Local
   Exposure mandatory with Lumen GI; Film only here). GATE: `ppv_lint` no fail; HDR view shows each
   target inside the clamps.
3. **Exterior (P3).** `build_exterior_rig(exterior_rig_plan("blue_hour", key_camera_forward=...))`:
   Sky Atmosphere, sun at 120,000 lux below the horizon, real-time Sky Light, volumetric fog with
   black inscattering, Scattering Distribution from the key camera's angle to the light (0.9 into
   it, 0 from the side: Faucher 1LfiYtKDsac [00:16:06]). Steady lamps scatter above 1 for halos,
   flickering ones 0. GATE: `scene_lint` clean; sun out of MegaLights.
4. **Practicals, neon, openings (P4, P5).** `FIXTURES` lumens and kelvin, radius from
   `tight_attenuation_radius` capped by the room, source radius, length or size matching the
   fixture, one rect per shelf, `neon_sign_light` in front of each sign, `opening_rect_light` for
   the window; emissive via `emissive_for_stops`, then `emissive_strategy` (Emissive Light Source,
   optional boost). GATE: `light_lint` no warn in the gameplay profile (fixture, shape, VSM,
   clusters), or a written reason.
5. **Does the renderer see it (P7 to P9).** Lumen views vs lit; `room_shell_lint` on pink;
   MegaLights dump and mismatch view; masked casters; VSM cached pages. GATE: no black or pink where
   light must bounce; no hidden light in the dump; VSM red share near 0; noise judged in motion.
6. **Look (P10).** Ambient shape first, then the focal hue, then "the promise of more": light
   leaving the frame, a lit side street (Oakley [00:07:34] [00:09:19] [00:08:44]); the shadow-lift
   ladder in order; grade last; white-balance direction by A/B screenshot. GATE: `frame_report` B3
   to B8.
7. **Review loop (P11, P12).** Per bookmark: `log_mark`, capture,
   `frame_report(frame, brief, log_text=log_since(...))`, one change, logged in `iterations.jsonl`.
   The 5.8 exposure-range warning fails the frame; glossy regions must hold a highlight; walk the
   player path for adaptation. Timings use P12's measure preset (async compute, dynamic resolution
   off) and go to scenario-unreal-performance. GATE: no fail.
8. **The still (P13).** Scene audit first: Base Color buffer through `albedo_check`,
   `emissive_fixture_pairs` (A/B `r.PathTracing.EnableEmissive 0`, Indirect Emissive off),
   `glass_lint`. Then
   `still_plan("path_traced", "final", glass=True, sky_atmosphere_visible=True, emissive_fixtures=...)`,
   `mrg_lint` clean, `set_cine_camera_exposure` (Manual metering, Apply Physical Camera Exposure),
   `queue_mrg_still`. Still-only cheats via `still_only_light_plan` on their own lighting channel.
   Offline: gray card within 1/3 stop on the linear EXR, `compare_ground_truth`, 100 percent crops;
   a render that differs from the viewport walks `RENDER_DIFF_TRIAGE`. GATE: C1 to C11 of
   critique.md.
9. **Handoff (P14).** `lighting_manifest(path, ctx)`: lights, PPVs, lint, cheats, emissive pairs,
   masked casters, cvars.

## Numbers

| Item                 | Value                                                                                                     | Relative to, source                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Sun, moon            | 120,000 lux at zenith (0.545 degrees); moon 0.26 lux                                                      | Epic sky doc                                                      |
| Look targets (EV100) | sunlit 14, cloudy 10, low sun 7, interior 4, moonlit 1, moonless -2                                       | Gobey chart [00:12:02]; targets, not meter readings               |
| Fixtures             | candle 12 lm 1,900 K; decorative 300; interior 1,000; exterior 10,000; street 2,500 to 10,000 lm          | Gobey chart; Argyriou [00:13:36]                                  |
| Units                | 1 cd = 625 unitless = 12.6 lm (point) = 3.14 lm (rect) = 1.76 lm (spot, 44 degrees)                       | exposure doc                                                      |
| Exposure             | EV100 = log2(N^2 / t x 100 / ISO); B = L / 2^(EV100 + comp); f/2.8, 1/50, ISO 800 is EV100 5.6            | exposure doc                                                      |
| Auto exposure        | Low 70 to 80, High 80 to 95 percent; Speed Up 3 above Speed Down 1                                        | exposure doc; Gobey frame [00:21:52]                              |
| Local Exposure, Film | contrast 0.6 to 1 (default 0.8); Toe 0.55 default, 0.3 for dark interiors                                 | exposure doc; Gobey                                               |
| Albedo               | 0.02 [added] to 0.8 path traced, 0.9 Lumen                                                                | path tracer doc; Faucher 1e6oOiKh91U [00:13:35]                   |
| MegaLights           | 20 percent of samples to hidden lights (50 after failed reprojection); sun up to 50                       | SIGGRAPH [00:10:37] [00:16:40]                                    |
| Path-traced still    | 1 temporal, spatial 256 draft to 1024 or more final; glass 10 bounces; Max Path Intensity default         | path tracer doc; Faucher X5zVhc5ahl0 [00:16:47]                   |
| Deferred still       | spatial only, odd (9 draft, 15 final, 31 thin bright), AA None above 8, Motion Blur Amount 0, warm-up 250 | Faucher fVg5ihB8Wdc [00:06:01] [00:10:58]; 1e6oOiKh91U [00:09:56] |

## Quality gates

- **Measurable:** `ppv_lint`, `light_lint`, `scene_lint`, `glass_lint`, `room_shell_lint`,
  `mrg_lint`, `cvar_lint` without fail; `frame_report` on every bookmark with the log since capture
  (blank frames and the exposure-range warning fail); `albedo_check` on the Base Color buffer; gray
  card from linear EXRs; `compare_ground_truth` within a stop outside listed cheats; `red_fraction`
  on the VSM cache view; `temporal_flicker` on warm-ups. Thresholds marked [added] are calibrated
  per project on one approved frame.
- **Visual:** each bookmark full size and as a thumbnail beside its representation views; a camera
  move for noise; inner corners for leaks; glossy highlights; the still at 100 percent; in the order
  of [`references/critique.md`](references/critique.md).

## Common mistakes

| Mistake                                                          | Looks like                             | Fix                                                                                                              |
| ---------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Lighting under default auto exposure                             | any value "looks fine"; flicker        | `exposure_plan`, comp 0, then physical lights                                                                    |
| Neon lit by emissive only                                        | splotchy, crawling GI                  | rect light per sign; Emissive Light Source                                                                       |
| Tube plus its light in a path-traced still                       | fixtures glow twice as bright as Lumen | A/B `r.PathTracing.EnableEmissive 0`; Indirect Emissive off                                                      |
| Sky light or exposure raised for a small window                  | splotches, flat gray interior          | `opening_rect_light` sized to the opening                                                                        |
| Many small lights, big radii, a sun indoors under MegaLights     | noise and ghosting in motion           | tight bounds, merge clusters, sun on VSM                                                                         |
| Local lights on VSM over moving characters                       | constant invalidation, cost spikes     | ray-traced shadows; VSM only with a reason                                                                       |
| Grilles or plants under MegaLights                               | solid shadows once off-screen          | model the holes, or EvaluateMaterialMode 1                                                                       |
| One mesh for the whole room                                      | pink surface cache, screen-space GI    | split walls, floors, ceilings; Max Lumen Mesh Cards                                                              |
| Fill lights to rescue a dark interior; grading first             | flat, view-dependent GI                | toe and local exposure, then the ladder; grade last                                                              |
| Glossy bar top lit only by Lumen                                 | dry, dead surface                      | a direct light it can reflect                                                                                    |
| More MRG samples for Lumen noise; even or mixed deferred samples | noise unchanged, blur on a still       | `NOISE_TRIAGE`, `still_plan`, `mrg_lint`                                                                         |
| HDRIBackdrop in a path-traced still                              | double lighting                        | remove it; Sky Light cubemap plus `r.PathTracing.VisibleLights 2`, which does nothing under Reference Atmosphere |
| Render differs from the viewport, cvars pasted                   | "the render is broken"                 | `RENDER_DIFF_TRIAGE`: Global Game Overrides first                                                                |
| Still-only rim left in the level                                 | the cheat lights gameplay              | own lighting channel, indirect 0, in the shot sequence                                                           |

## Handoffs

- **Receives** from scenario-unreal-world-building: the level, modular walls, floors and ceilings 10
  cm or thicker, correct mobility, room volumes tagged `room`, fixture meshes tagged
  `fixture:<name>`, emissive meshes tagged `emissive`. From scenario-unreal-materials: masters
  exposing `EmissiveIntensity` (and `LumenEmissiveScale` behind a Ray Tracing Quality Switch),
  albedo 0.02 to 0.8, IOR glass on Surface ForwardShading. From scenario-unreal-vfx: particle lights
  (shadows off, Allow MegaLights).
- **Delivers** to scenario-unreal-cinematics: the lit level, `lighting_manifest.json`, the exposure
  plan (EV100, ISO and shutter for their aperture), `still_plan` presets, MRG variables, still-only
  cheat plans. To scenario-unreal-performance: light counts, shadow methods, measured passes. To
  scenario-unreal-materials and scenario-unreal-world-building: albedo, glass, masked-caster and
  room-shell fixes.

## UE 5.8 notes

- MegaLights Production Ready (lighting channels, cloud shadows, mismatch views); directional lights
  excluded unless `r.MegaLights.DirectionalLights 1`; `r.MegaLights.Debug`,
  `r.MegaLights.DownsampleMode`.
- Lumen Lite at Medium (Beta); SSGI deprecated; RTGI gone since 5.4; detail tracing deprecated;
  `r.Lumen.HeightFog 1` default.
- `r.EyeAdaptation.CachedLightingPreExposure` (default 4) unifies pre-exposure, with an on-screen
  warning when exposure leaves the supported range.
- ACES 2.0 is the SDR path; OCIO 2.5.1; grading scopes `ShowFlag.VisualizeColorGrading`.
- Path tracer on Mac (macOS 26.4+); back-face culling always on; HDRIBackdrop incompatible;
  Reference Atmosphere ignores Sky Lights.
- Movie Render Graph Production Ready: Basic config by default, Light Modifier, layer warm-ups,
  DWAA/DWAB EXR.
- Python: the Rotator's positional order is roll, pitch, yaw, so `ue_light` passes keywords
  [verify].

## References

- `references/procedures.md`: P0 to P14, full code, each block with its test id and status. Load
  before writing lighting code.
- `references/critique.md`: setup, frame, render and budget rubrics mapped to code findings. Load at
  every gate.
- [`references/expert-notes.md`](references/expert-notes.md): depth per expert with timestamps,
  disagreements and deciding conditions.
- [`references/gui-paths.md`](references/gui-paths.md): menus and editors for a computer-use agent
  or a human.
- [`references/sources.md`](references/sources.md): every source, credential, URL, best timestamps,
  revision history.
- `scripts/ue_light.py`: the toolkit; its docstring lists every call and where it runs.
