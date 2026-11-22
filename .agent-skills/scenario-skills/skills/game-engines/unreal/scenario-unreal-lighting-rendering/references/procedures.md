# Procedures (Editor Python and ue_light, full code)

**Status of every block: not yet run in Unreal** (UE 5.8 not installed on 2026-09-24). Each block
starts with `# test: <id>`. `tests/code/unreal-lighting-rendering/job_procedures_snippets.py`
extracts these exact blocks from this file and runs them in order in one namespace: today against a
fake `unreal` module (proves the Python logic and the calls into `ue_light`, not engine names),
later inside a live editor on a test level it builds (`py "<path>/job_procedures_snippets.py"` in
the editor console, or through Epic's MCP server or `ue_remote.PythonRemote().exec`). A block marked
`# soft-block` holds calls whose names are unconfirmed: if it raises, the runner records a soft
failure (a name to fix after the probe) instead of a hard one. Deeper tests:
`test_ue_light_offline.py` (200 checks of the pure layer), `test_editor_layer_fake.py` (65 checks),
and the probe `job_00_probe_lighting.py` (runs headless through scenario-unreal-expert's
`ue_run.run_python`).

Context the blocks assume (the runner builds it): `OUT` an output folder; `CAMS` bookmark camera
labels (`CAM_Street`, `CAM_BarWide`, `CAM_Counter`); `PENDANTS` list of `(label, location)` of
pendant fixture meshes; `CANDLES`, `SHELF` (min, max of the back-bar shelf), `SIGN_FACE` (min, max
of the neon sign face), `WINDOW` (min, max of the window opening, inward `+X`), `ROOM_DEPTH` cm;
`MEGALIGHTS` bool (project setting, read in P0); `NEW_PROJECT` bool; `SKY_LUMINANCE` cd/m2 measured
in P11 (placeholder until then); `R` is scenario-unreal-expert's `ue_review` (a stub in the fake
run). Screenshots are latent: in a live editor run each capture step in its own call so a frame
renders between commands; the MCP server runs tool calls serially on the game thread.

## P0. Probe the engine and the project before planning

Why: most names in this skill are unconfirmed on 5.8; the Mac clears the M2+ bars (Nanite, VSM Beta;
Lumen HWRT, MegaLights Experimental) and macOS 26.4 for the path tracer (deltas file, "This Mac").
Converted projects keep old renderer settings (deltas file, Lighting).

```python
# test: P0_probe
# status: not yet run in Unreal 5.8; test: job_procedures_snippets.py (block P0_probe), deeper: job_00_probe_lighting.py
import json, os
import unreal
import ue_light as L

facts = L.probe()                                   # classes, enums, property names, cvar values; changes nothing
with open(os.path.join(OUT, "probe_lighting.json"), "w") as f:
    json.dump(facts, f, indent=1, default=str)
ini = os.path.join(unreal.Paths.project_config_dir(), "DefaultEngine.ini")
settings = L.render_settings_report(open(ini).read(), wants=("lumen", "vsm", "megalights", "path_tracer", "extended_range"))
for x in settings["findings"]:
    print(x["status"], x["id"], x["message"])
bad_pp = [k for k, ok in facts["pp_fields"].items() if not ok] if isinstance(facts["pp_fields"], dict) else facts["pp_fields"]
print("engine", facts["engine"], "| PostProcessSettings names to fix:", bad_pp)
ml = facts["cvars"].get("r.MegaLights.EnableForProject")     # a string means the cvar name is wrong: keep the runner's value
MEGALIGHTS = bool(ml) if isinstance(ml, (int, float, bool)) else MEGALIGHTS
```

## P1. Project rendering settings (text edit, then restart)

Why: Lumen GI and reflections, VSM, distance fields for software Lumen, Support Hardware Ray Tracing
for MegaLights, the path tracer and hit lighting (MegaLights doc; path tracer doc; Lumen doc).
Extended luminance range only at project start: switching later breaks every exposure setup
(exposure doc). Version before overwrite (project rule).

```python
# test: P1_project_settings
# status: not yet run in Unreal 5.8 (pure text edit); test: job_procedures_snippets.py (block P1_project_settings)
import shutil, time
wanted = {"r.DynamicGlobalIlluminationMethod": "1", "r.ReflectionMethod": "1", "r.Shadow.Virtual.Enable": "1",
          "r.GenerateMeshDistanceFields": "True", "r.RayTracing": "True", "r.Lumen.HardwareRayTracing": "True",
          "r.MegaLights.EnableForProject": "True", "r.PathTracing": "True", "r.SkinCache.CompileShaders": "True"}
if NEW_PROJECT:
    wanted["r.DefaultFeature.AutoExposure.ExtendDefaultLuminanceRange"] = "True"
backup = ini + ".v" + time.strftime("%Y%m%d_%H%M%S")      # never overwrite without a copy
shutil.copy2(ini, backup)
with open(ini) as f:
    new_text = L.ini_patch(f.read(), wanted)
with open(ini, "w") as f:
    f.write(new_text)
print("backup", backup, "; restart the editor, then re-run P0 and read the log for RHI, ray tracing and MegaLights status")
```

## P2. Calibrate the camera (and place the chrome ball) before any light

Why: auto exposure "childproofs" Unreal, a 10 lux and a 100,000 lux sun look the same; Exposure
Compensation 0 and Min/Max EV100 clamped to the conditions the player walks between (Gobey
nlbJwMoj1Dg [00:02:38] [00:11:40] [00:12:14]). Local Exposure is always set up with Lumen GI; Film
settings live only in this project-wide PPV (exposure doc). Viewport exposure must be on Game
Settings or screenshots bypass the PPV (Gobey [00:21:56]). The chrome and gray balls go in first, at
the subject: the chrome ball shows what the environment reflects before any light exists (Faucher
BGoaPyfZlYg [00:01:34]); the chart checks albedo (Gobey [00:07:30]). Low/High Percent stay inside
the doc's 70 to 80 and 80 to 95, Speed Up above Speed Down (3 and 1 on Gobey's frame [00:21:52]).

```python
# test: P2_exposure_first
# status: not yet run in Unreal 5.8; test: job_procedures_snippets.py (block P2_exposure_first)
probe_actor = L.spawn_calibrator(PENDANTS[0][1][:2] + (100.0,))   # chrome + gray balls at the subject, before any light
ppv = L.get_or_spawn_ppv("PPV_Global", unbound=True, priority=0.0)
gameplay = L.exposure_plan("gameplay", ("interior", "blue_hour"))       # EV100 4 to 6.5, comp 0
changes = L.apply_exposure(ppv, gameplay)
changes += L.apply_look(ppv, L.look_values(dark_interior=False, lumen_gi=True))
print([c[0] for c in changes])
for cmd in L.VIEW_MODES["hdr"][0]:        # HDR (Eye Adaptation) meter on; screenshot each bookmark next, then turn it off
    L.console(cmd)
```

## P3. Physically based dusk exterior

Why: Sky Atmosphere with a real sun lets the atmosphere make the sky (Epic sky doc: 120,000 lux at
zenith, 0.545 degrees); the strong directional stays on deferred plus VSM, out of MegaLights
(MegaLights doc, Directional Lights); height fog inscattering black when the atmosphere drives the
fog, volumetric fog on (sky doc; Faucher 1LfiYtKDsac [00:11:12]). Scattering Distribution follows
the key camera's angle to the light: near 0.9 looking into it, near 0 for shafts seen from the side
(Faucher [00:16:06]; sky doc, Common Questions); pass `key_to_light` when the brightest source is a
street lamp, not the sun. Steady street lamps take Volumetric Scattering Intensity above 1 for halos
in the haze (Faucher [00:13:23]; 0GYyHDuaPcg [00:12:51]); flickering ones stay at 0.

```python
# test: P3_exterior_rig
# status: not yet run in Unreal 5.8; test: job_procedures_snippets.py (block P3_exterior_rig)
street_cam = next(a for a in L.level_actors() if a.get_actor_label() == "CAM_Street")
r = street_cam.get_actor_rotation()
rig = L.exterior_rig_plan("blue_hour", moon=False, sun_azimuth=225.0, volumetric_fog=True, atmosphere_drives_fog=True,
                          key_camera_forward=L.forward_from_rotator({"pitch": r.pitch, "yaw": r.yaw}))
made = L.build_exterior_rig(rig)          # reuses actors with the same labels, never deletes
print(sorted(made), rig["lights"][0]["rotation"], "scattering", rig["fog"]["volumetric_fog_scattering_distribution"],
      rig["fog"].get("needs_project_setting"))
```

## P4. Practicals from the fixture table

Why: real lumens and temperatures (Gobey chart: candle 12 lm at 1,900 K, decorative 300 lm, interior
1,000 lm; Argyriou street lamps 2,500 to 10,000 lm); think in fixtures, so mostly spotlights
(Argyriou [00:19:37]); every light has a visible fixture and a source shaped like it: Source Radius
about the bulb, Source Length for a tube, Source Width and Height for a panel (Faucher 0GYyHDuaPcg
[00:15:14] [00:15:47]; `light_lint` checks both halves: `fixture_missing`, `source_shape`,
`source_point`); tight attenuation (Argyriou [00:26:32]); merge a row of shelf lights into one rect
(MegaLights doc). The radius is the smaller of the 6-stops-under rule and the room depth [added].
Glossy surfaces under these lights (bar top, bottles, wet street) need a direct light they can
reflect: Lumen indirect gives them little specular (Faucher [00:10:28]); `frame_report` role
`glossy` checks it.

```python
# test: P4_practicals
# status: not yet run in Unreal 5.8; test: job_procedures_snippets.py (block P4_practicals)
EV_INTERIOR = 4.0
spawned = []
for label, loc in PENDANTS:
    cd = L.lumens_to_candela(600, "spot", 60.0)
    radius = min(L.tight_attenuation_radius(cd, EV_INTERIOR), ROOM_DEPTH)
    spawned.append(L.spawn_light("spot", (loc[0], loc[1], loc[2] - 15), L.aim_rotator(loc, (loc[0], loc[1], 0)), label="L_" + label,
                                 tags=["fixture:pendant", "room:bar", "role:practical"], intensity=600, units="lumens", kelvin=2700,
                                 outer_cone_angle=60.0, source_radius=3.0, attenuation_radius=radius, max_draw_distance=3000.0,
                                 cast_shadows=True))
for label, loc in CANDLES:
    spawned.append(L.spawn_light("point", loc, label="L_" + label, tags=["fixture:candle", "room:bar", "role:practical"],
                                 intensity=12, units="lumens", kelvin=1900, source_radius=1.0, attenuation_radius=150.0,
                                 max_draw_distance=1500.0, cast_shadows=False))
smin, smax = SHELF
center = ((smin[0] + smax[0]) / 2, smin[1] - 5, (smin[2] + smax[2]) / 2)
spawned.append(L.spawn_light("rect", center, L.aim_rotator(center, (center[0], center[1] - 100, center[2])), label="L_BackBar",
                             tags=["fixture:decorative", "room:bar", "role:practical"], intensity=300, units="lumens", kelvin=2700,
                             source_width=smax[0] - smin[0], source_height=20.0, barn_door_angle=45.0, attenuation_radius=300.0,
                             max_draw_distance=2500.0, cast_shadows=MEGALIGHTS))
print(len(spawned), "practicals")
```

## P5. Neon signs and the window opening

Why: emissive is the look, a real light does the lighting; small bright emissive is noisy and
screen-space, and 5.6 clamps it harder (`r.Lumen.ScreenProbeGather.MaxRayIntensity` 10) (Faucher
1e6oOiKh91U [00:12:30]; Gobey Q&A [00:37:33]; Lumen doc; deltas file). The light sits in front of
the sign, not inside it (MegaLights doc). Set the emissive only after exposure (Gobey [00:02:38]); a
flickering sign gets no volumetric scattering (sky doc). A small bright opening needs a rect sized
to it (Faucher 0GYyHDuaPcg [00:06:18]).

```python
# test: P5_neon_and_opening
# status: not yet run in Unreal 5.8; test: job_procedures_snippets.py (block P5_neon_and_opening)
tube_L = L.emissive_for_stops(EV_INTERIOR, stops=4.0)          # cd/m2, 4 stops over mid gray at EV100 4 [added default]
sign = L.neon_sign_light(SIGN_FACE[0], SIGN_FACE[1], outward="+X", tube_length_cm=420, tube_diameter_cm=1.5,
                         tube_luminance=tube_L, color=(1.0, 0.1, 0.6), ev100=EV_INTERIOR)
L.spawn_light("rect", sign["location"], sign["rotation"], label="L_Neon_Open", tags=sign["tags"] + ["room:bar", "flicker"],
              intensity=sign["intensity"], units="candelas", color=sign["light_color"], source_width=sign["source_width"],
              source_height=sign["source_height"], attenuation_radius=sign["attenuation_radius"],
              volumetric_scattering_intensity=0.0, cast_shadows=MEGALIGHTS, max_draw_distance=3000.0)
win = L.opening_rect_light(WINDOW[0], WINDOW[1], inward="+X", room_depth_cm=ROOM_DEPTH, sky_luminance=SKY_LUMINANCE)
L.spawn_light("rect", win["location"], win["rotation"], label="L_Window_Sky", tags=win["tags"] + ["room:bar"],
              intensity=win["intensity"], units=win["intensity_units"], color=win["light_color"], source_width=win["source_width"],
              source_height=win["source_height"], barn_door_angle=88.0, barn_door_length=20.0,
              attenuation_radius=win["attenuation_radius"], max_draw_distance=4000.0)
print("neon", round(sign["intensity"], 2), "cd; window", win["intensity"], "cd; tube emissive", round(tube_L, 1))
```

Emissive by renderer (`emissive_strategy`): in real time a small emissive mesh is culled from the
Lumen Scene, so the sign mesh gets Emissive Light Source (Lumen doc, troubleshooting); an optional
Lumen-only boost of 5 to 10 times the visible value through a Ray Tracing Quality Switch master adds
bounce without blow-out (Campbell BKaAzhMHJZ0 [00:14:09]; Avowed quoted about 1 visible against 5 to
10 in the Lumen scene, read here as a ratio [added]), listed in `cheat_inventory`; fill lights are
the fallback when it stays noisy or lacks specular [00:14:42]. The path tracer ignores the Ray
Tracing Quality Switch (it takes the Normal input), so the boost does not exist in the still, and
the tube plus its rect light double count there (P13).

```python
# test: P5b_neon_emissive
# soft-block: the material instance and its parameter names come from scenario-unreal-materials; emissive_light_source is [verify]
# status: not yet run in Unreal 5.8; test: job_procedures_snippets.py (block P5b_neon_emissive)
strategy = L.emissive_strategy("gameplay", small=True, lumen=True, path_traced_still=True)
L.set_mi_scalar("/Game/Materials/MI_Neon_Pink", "EmissiveIntensity", tube_L)              # visible value, after exposure
if strategy["emissive_light_source"]:
    L.set_emissive_light_source("SM_Neon_Sign")
if strategy["lumen_boost"]:                                                                # only with the switch master
    L.set_mi_scalar("/Game/Materials/MI_Neon_Pink", "LumenEmissiveScale", strategy["lumen_boost"][0])
print(strategy["why"])
```

## P6. Light lint, safe fixes only

Why: the MegaLights noise and cost causes are content (hidden lights, huge bounds, clusters, a sun
indoors: SIGGRAPH [00:10:37] [00:16:40]; MegaLights doc); Argyriou's audit list (max draw distance,
one shadowed dynamic light per room without MegaLights, Static lights ignored by Lumen, indirect
intensity cheats); the fixture rule with source shapes (Faucher 0GYyHDuaPcg [00:15:14] [00:15:47]);
local lights on VSM under gameplay, where every character moving through the light invalidates its
pages, so ray-traced shadows (the MegaLights default) scale better and give free penumbras (Campbell
BKaAzhMHJZ0 [00:26:25] [00:31:42]): keep VSM only with a written `vsm_reason:` tag (dense alpha
foliage, content ray tracing cannot represent); still-only cheat lights left active in the gameplay
level. Only mechanical fixes are automatic; the rest goes in the report.

```python
# test: P6_light_lint
# status: not yet run in Unreal 5.8; test: job_procedures_snippets.py (block P6_light_lint)
lights = L.collect_lights()
rooms = L.collect_rooms("room")
ctx = {"profile": "gameplay", "lumen": True, "megalights": MEGALIGHTS, "megalights_directional": False,
       "has_interiors": True, "rooms": rooms, "ev100": EV_INTERIOR}
findings = L.light_lint(lights, ctx)
fixed = []
for x in findings:
    if x["id"] in ("max_draw_distance", "volumetric_trails"):
        actor = next(a for a in L.level_actors() if a.get_actor_label() == x["subject"])
        comp = actor.get_component_by_class(unreal.LightComponent)
        if x["id"] == "max_draw_distance":
            comp.set_editor_property("max_draw_distance", 3000.0)
        else:
            comp.set_editor_property("volumetric_scattering_intensity", 0.0)
        fixed.append((x["id"], x["subject"]))
with open(os.path.join(OUT, "light_lint.json"), "w") as f:
    json.dump(findings, f, indent=1, default=str)
print(len(findings), "findings, fixed:", fixed)
```

## P7. Representation views: is the renderer seeing my scene?

Why: most artifacts are proxy mismatches, so compare a representation view with the lit view from
the same camera: Lumen Scene and Surface Cache (black = screen traces only, pink = no cards), mesh
distance fields for software Lumen (Faucher 1e6oOiKh91U [00:07:21] [00:14:40]; Lumen doc). The
chrome and gray probes placed in P2 show what the environment reflects (Faucher BGoaPyfZlYg
[00:01:34]); `spawn_calibrator` reuses them. Pink on a room shell usually means one mesh holds the
whole room: split walls, floors and ceilings (Faucher [00:06:09] [00:06:42]) or raise Max Lumen Mesh
Cards from 12 in the mesh Build Settings (Lumen doc, Surface Cache); `room_shell_lint` finds them
(P7b).

```python
# test: P7_lumen_views
# soft-block: view mode console names and R.screenshot are [verify]
# status: not yet run in Unreal 5.8; test: job_procedures_snippets.py (block P7_lumen_views)
probe_actor = L.spawn_calibrator(PENDANTS[0][1][:2] + (100.0,))
shots = []
for step in L.capture_plan(CAMS, ("lit", "lumen_overview", "lumen_cards", "mesh_distance_fields"), OUT, "lumen"):
    L.view_from(step["camera"])
    for c in step["enable"]:
        L.console(c)
    R.screenshot(step["file"], 1920, 1080)          # latent in a live editor: one step per call
    for c in step["disable"]:
        L.console(c)
    shots.append(step["file"])
print(len(shots), "captures; compare each representation view with its lit twin")
```

```python
# test: P7b_room_shells
# status: not yet run in Unreal 5.8; test: job_procedures_snippets.py (block P7b_room_shells)
shells = L.room_shell_lint(L.collect_mesh_bounds(), L.collect_rooms("room"))
for x in shells:
    print(x["status"], x["subject"], "->", x["fix"])      # a content fix: hand to scenario-unreal-world-building
```

## P8. MegaLights: noise is stolen samples

Why: hidden lights take up to 20 percent of samples (50 after failed reprojection), a directional up
to 50; quality is per-pixel light complexity (SIGGRAPH [00:10:37] [00:16:40] [00:48:40]). Light
Complexity names the thieves; the mismatch view with screen traces off shows proxy shadows
(MegaLights doc). Probe pixels are mouse-driven: freeze and dump instead.

```python
# test: P8_megalights
# soft-block: MegaLights visualization cvars and the dump format are [verify]
# status: not yet run in Unreal 5.8; test: job_procedures_snippets.py (block P8_megalights)
L.view_from("CAM_BarWide")
mark = L.log_mark("ml_dump_1")
for c in L.VIEW_MODES["megalights_complexity_dump"][0]:
    L.console(c)
# next call, after a frame has rendered:
dump = L.log_since("ml_dump_1")
top = L.rank_lights_in_dump(dump, [x["label"] for x in L.collect_lights()])
print("lights named in the dump, most frequent first:", top[:8])
for c in L.VIEW_MODES["megalights"][0] + L.VIEW_MODES["megalights_raw_rt_shadows"][0]:
    L.console(c)                                     # shadow caster mismatch, raw ray-traced shadows
R.screenshot(os.path.join(OUT, "megalights_mismatch.png"), 1920, 1080)
for c in L.VIEW_MODES["megalights"][1] + L.VIEW_MODES["megalights_raw_rt_shadows"][1] + L.VIEW_MODES["megalights_complexity_dump"][1]:
    L.console(c)
```

Fix order from what the dump and the lint say: move lights out of walls, or switch them off with
Affects World (never delete); shrink radius, cone and barn doors; fit rect Source Width and Height
to the opening; merge clusters; keep the sun out of MegaLights (`r.MegaLights.DirectionalLights 0`,
default) or cap `r.MegaLights.DirectionalLightSampleFraction` (5.7+); lower Nanite Fallback Relative
Error on mismatching meshes, or move a hero light to VSM (MegaLights doc). Re-capture under a
scripted camera move: noise shows in motion.

Alpha-masked casters: MegaLights ray tracing ignores masks by default (only screen traces see them),
so a grille, a plant or a bead curtain casts a solid shadow once it leaves the screen (MegaLights
doc, Alpha Masking; SIGGRAPH [00:26:09]). Order of fixes: model the holes as geometry
(scenario-unreal-world-building), `r.MegaLights.HardwareRayTracing.EvaluateMaterialMode 1` at a real
cost, or VSM on the one light that must show the pattern.

```python
# test: P8b_masked_casters
# soft-block: material blend mode names through get_materials / get_base_material are [verify]
# status: not yet run in Unreal 5.8; test: job_procedures_snippets.py (block P8b_masked_casters)
masked = L.collect_masked_casters()
print([(x["id"], x["message"]) for x in L.scene_lint({"megalights": MEGALIGHTS, "masked_casters": masked}, "lumen")])
```

## P9. VSM cache and cost

Why: VSM cost is invalidation: with a still camera the Cached Page view should be green, static
invalidated pages near 0; WPO, Blueprint property writes, inflated bounds and any light rotation
invalidate; reduce Source Radius or Angle before SMRT counts (VSM doc).

```python
# test: P9_vsm
# soft-block: VSM visualization and stats names are [verify]
# status: not yet run in Unreal 5.8; test: job_procedures_snippets.py (block P9_vsm)
L.view_from("CAM_Street")
for c in L.VIEW_MODES["vsm_cache"][0]:
    L.console(c)
cache_png = os.path.join(OUT, "vsm_cache_still.png")
R.screenshot(cache_png, 1920, 1080)                  # camera still: red = invalidated pages
for c in L.VIEW_MODES["vsm_cache"][1]:
    L.console(c)
red = L.red_fraction(cache_png)
print("VSM invalidated share with a still camera: %.3f (target near 0)" % red)
```

## P10. Look: tone mapper, local exposure, grade last

Why: a dark interior under a correct exterior is a tone-mapper problem first; the shadow-lift ladder
goes from honest to dishonest (Gobey [00:14:58] [00:15:32]; Faucher 0GYyHDuaPcg [00:08:14]
[00:13:42]). Light it before you grade it (Oakley rX0wZZxpB-U [00:10:18]). Check the white-balance
direction on a screenshot (exposure doc vs Gobey [00:17:31]). Art-direction order before any grade
(Oakley): the ambient first, shape and color transitions in the shadows, from a balanced skylight
([00:07:34]; `shadow_shape`); then the eye's path, a limited hue range with the focal element across
the wheel ([00:09:19]; `focal_hue_contrast`); then "the promise of more", light leaving the frame, a
side street lit, shafts composed with blockers ([00:08:44]; Faucher 1LfiYtKDsac [00:13:55]), judged
by eye on the thumbnail.

```python
# test: P10_look
# status: not yet run in Unreal 5.8; test: job_procedures_snippets.py (block P10_look)
for step, what, honesty in L.SHADOW_LIFT_LADDER:
    print(honesty, "|", step, "|", what)
DARK_INTERIOR = True                                  # decided from P11's frame report (crushed_playable, shadow_shape)
if DARK_INTERIOR:
    L.apply_look(ppv, L.look_values(dark_interior=True))
L.apply_look(ppv, {"white_temp": 5000.0})              # candidate; keep only if the A/B screenshots show the intended warm/cool split
```

## P11. Review loop: capture, measure, critique, change one thing

Why: judge through the game's own camera and exposure, at fixed bookmarks, with numbers and eyes
(Argyriou [00:08:36]; Oakley's rubric; MCP talk lesson in scenario-unreal-expert: an agent approved
an all-white frame). `frame_report` runs offline on the captured files. The log since the capture
goes in too: 5.8 prints a warning when exposure leaves the range Lumen's and the Sky Light's cached
lighting support (`r.EyeAdaptation.CachedLightingPreExposure`, default 4), and that warning fails
the frame (5.8 release notes; Lumen doc, Outdated); its exact text is [verify], so the grep is
loose. Glossy regions (wet street, bar top) must hold a highlight (Faucher 0GYyHDuaPcg [00:10:28]).
Walk the player path between the conditions (street to bar) with a scripted camera move to judge
adaptation, and noise in motion (Gobey [00:19:12]; SIGGRAPH [00:48:40]).

```python
# test: P11_review_loop
# status: not yet run in Unreal 5.8; test: job_procedures_snippets.py (block P11_review_loop)
brief = {"use": "gameplay", "regions": {
    "window_from_street": {"box": [0.35, 0.30, 0.65, 0.70], "role": "focal"},
    "street_ground": {"box": [0.0, 0.75, 1.0, 1.0], "role": "playable"},
    "street_shadow": {"box": [0.0, 0.0, 0.25, 0.6], "role": "shadow"},
    "neon": {"box": [0.40, 0.10, 0.60, 0.25], "role": "neon"},
    "bar_glow": {"box": [0.40, 0.35, 0.60, 0.65], "role": "practical"},
    "street_wet": {"box": [0.30, 0.85, 0.70, 1.0], "role": "glossy"},
    "sky": {"box": [0.0, 0.0, 1.0, 0.15], "role": "ambient"}}}
L.view_from("CAM_Street")
frame = os.path.join(OUT, "iter01_street_lit.png")
L.log_mark("iter01")
R.screenshot(frame, 1920, 1080)                       # returns a request; the file lands after the editor ticks
R.wait_for_file(frame)                                 # agent side, in the next call (blocking here would stall the game thread)
report = L.frame_report(frame, brief, log_text=L.log_since("iter01"))   # blank frame and exposure-range warning fail
L.write_report(report, os.path.join(OUT, "iter01_street"), frame)
with open(os.path.join(OUT, "iterations.jsonl"), "a") as f:
    f.write(json.dumps({"iter": 1, "camera": "CAM_Street", "verdict": report["verdict"],
                        "changed": "P2 to P6 baseline", "findings": [x["id"] for x in report["findings"] if x["status"] != "pass"]}) + "\n")
print(report["verdict"], [(x["id"], x["status"]) for x in report["findings"]])
```

## P12. Gameplay budget capture (hand the numbers to scenario-unreal-performance)

Why: measure passes, not FPS; async compute off to isolate, dynamic resolution off, fixed cameras, a
no-lights baseline (Argyriou [00:08:36]; Campbell BKaAzhMHJZ0 [00:38:37] [00:39:10]; Lumen, VSM,
MegaLights docs). Lumen GI plus reflections at or under 4 ms at 60 fps, 1080p internal on console
(Lumen doc). A Mac number is a relative proxy, never the console figure.

```python
# test: P12_budget
# soft-block: ProfileGPU output lands in the log after a frame; the line format is [verify]
# status: not yet run in Unreal 5.8; test: job_procedures_snippets.py (block P12_budget)
prev = L.apply_cvars(L.CVAR_PRESETS["measure"]["cvars"])
results = {}
for cam in CAMS:
    L.view_from(cam)
    tag = L.log_mark("gpu_" + cam)
    L.console("ProfileGPU")
    # next call, after a frame:
    rows = L.profilegpu_passes(L.log_since(tag))
    results[cam] = L.pass_budget(rows, fps=60)
L.restore_cvars(prev)
with open(os.path.join(OUT, "budget_by_camera.json"), "w") as f:
    json.dump(results, f, indent=1, default=str)
print({c: r["groups"] for c, r in results.items()})
```

## P13. The cinematic still: path tracer (or deferred) through Movie Render Graph

Why: path-traced stills are all spatial, 1 temporal; the PPV sample count is ignored by MRG; Max
Path Intensity stays default; HDRIBackdrop double counts; Reference Atmosphere for a visible Sky
Atmosphere, and then any Sky Light is ignored, so `r.PathTracing.VisibleLights 2` does nothing (it
only shows a Sky Light's specified cubemap); glass needs bounces (path tracer doc; Faucher
X5zVhc5ahl0 [00:16:47] [00:23:06]). Script variable overrides, never node defaults (scripting doc).
The still's exposure lives on the CineCamera as Manual metering with Apply Physical Camera Exposure,
so ISO, shutter and aperture count and the gameplay PPV stays intact (exposure doc, Manual
Algorithm) [added design]. Mac: path tracing needs macOS 26.4 or later (5.8 notes); this Mac runs
26.5.1.

First the scene audit (P13a), because the path tracer shows what the scene really is:

- **Albedo** is lighting: base color above 0.8 lengthens paths and washes out, near-black makes
  shadows "incredibly dark" (path tracer doc; Faucher X5zVhc5ahl0 [00:22:24]; Gobey nlbJwMoj1Dg
  [00:07:30]). Capture the Base Color buffer and run `albedo_check`; corrections go to
  scenario-unreal-materials.
- **Emissive plus light double counting**: a tube or bulb with its own real light is counted twice.
  List pairs with `emissive_fixture_pairs`, A/B with `r.PathTracing.EnableEmissive 0`, then turn off
  Indirect Emissive in Lighting Components (`still_plan(..., emissive_fixtures=True)`); it is
  global, so every emissive loses its bounce (path tracer doc, Emissive Materials row, PPV table).
- **Glass**: Refraction Method Index of Refraction and Lighting Mode Surface ForwardShading,
  otherwise the path tracer uses transparency, not a bounce, roughness ignored; Thin Translucent
  only for thin films (path tracer doc; Faucher [00:14:36] [00:15:43]); `glass_lint`.

```python
# test: P13a_scene_audit
# soft-block: Base Color buffer view mode names and material property names are [verify]
# status: not yet run in Unreal 5.8; test: job_procedures_snippets.py (block P13a_scene_audit)
L.view_from("CINE_BarHero")
for c in L.VIEW_MODES["base_color"][0]:
    L.console(c)
bc_png = os.path.join(OUT, "still_basecolor.png")
R.screenshot(bc_png, 1920, 1080)                      # latent: next call reads the file
for c in L.VIEW_MODES["base_color"][1]:
    L.console(c)
alb = L.albedo_check(bc_png, renderer="path_traced")
pairs = L.emissive_fixture_pairs(L.collect_lights(), L.collect_emissive_meshes())
scene = {"hdri_backdrop": sum(1 for a in L.level_actors() if "HDRIBackdrop" in type(a).__name__),
         "sky_light": {"real_time_capture": True, "cubemap_resolution": 512}, "sky_atmosphere": True, "reference_atmosphere": True,
         "atmosphere_drives_fog": True, "support_sky_affects_height_fog": True,
         "height_fog": {"volumetric": True, "fog_inscattering_black": True, "directional_inscattering_black": True},
         "albedo_max": alb.get("albedo_max"), "emissive_light_pairs": pairs,
         "glass": L.collect_glass_materials(["/Game/Materials/M_Glass_Window"])}   # glass masters from scenario-unreal-materials
audit = L.scene_lint(scene, "path_traced")
print([(x["status"], x["id"]) for x in audit + alb["findings"]])
```

```python
# test: P13_still
# soft-block: needs the template graph /Game/Cinematics/MRG_LightingStill and a one-frame sequence from scenario-unreal-cinematics
# status: not yet run in Unreal 5.8; test: job_procedures_snippets.py (block P13_still)
plan = L.still_plan("path_traced", "final", delivery="direct", glass=True, sky_atmosphere_visible=True,
                    emissive_fixtures=bool(pairs))
problems = [x for x in L.mrg_lint(plan) if x["status"] in ("warn", "fail")]
assert not problems, problems
cam = next(a for a in L.level_actors(unreal.CineCameraActor) if a.get_actor_label() == "CINE_BarHero")
still_cam = L.camera_for_ev100(EV_INTERIOR, shutter_s=1 / 48, aperture=2.8)      # aperture from scenario-unreal-cinematics (DOF)
ev = L.set_cine_camera_exposure(cam, still_cam["iso"], still_cam["shutter_s"], still_cam["aperture"])   # Manual + physical camera
L.set_pp(cam.get_cine_camera_component(), {k: v for k, v in plan["ppv"].items() if v is not None})   # still-only settings on the camera
L.log_mark("still_pt")
job = L.queue_mrg_still("/Game/Cinematics/LS_BarHero.LS_BarHero", "/Game/Maps/L_Bar.L_Bar",
                        "/Game/Cinematics/MRG_LightingStill", L.mrg_variables(plan), job_name="BarHero_PT")
print("EV100 %.2f" % ev, job)
```

After the render (the log shows `UE_LIGHT_MRG_DONE`), offline:
`frame_report(exr, {"ev100": ev, "regions": {... "grey_card": ...}}, log_text=L.log_since("still_pt"))`
on the linear EXR (gray card within 1/3 stop of intent, no exposure-range warning), then a Lumen
deferred layer of the same camera and `compare_ground_truth(lumen_exr, pt_exr, regions)`: regions
more than a stop apart are setup problems (Faucher 0GYyHDuaPcg [00:07:43]), except where
`cheat_inventory` lists a Lumen-only cheat (indirect boost, Diffuse Color Boost, Lumen-only emissive
boost). Judge at 100 percent: denoiser mush on roughness breakup (Faucher X5zVhc5ahl0 [00:06:39]);
toggle `r.PathTracing.Denoiser` after convergence to compare without re-accumulating (path tracer
doc).

If the rendered frame differs from the viewport, walk `L.RENDER_DIFF_TRIAGE` in order: Global Game
Overrides first (it raises quality at render time and, in MRG, acts only while connected: disconnect
it to test), then cvar nodes and the job's console variable overrides, Use LODZero and the foliage
triangle cap, warm-up, the exposure path, then the renderer's own blind spots (MRG doc, Globals and
Game Overrides; Comly demystifying-mrq, CVARS; Faucher fVg5ihB8Wdc [00:03:33]).

Still-only cheats (a rim on the hero, a small fill, a faked bounce) are fine for one shot and wrong
for the game (Faucher 1LfiYtKDsac [00:25:40]). Isolate each with lighting channels: light on channel
1 only, hero meshes on channels 0 and 1 (Faucher [00:24:02]). Direct light honors channels and
MegaLights supports them in 5.8 (deltas file); Lumen GI bounce probably does not [verify], hence
Indirect Lighting Intensity 0 [added]; whether the path tracer honors channels is not in the notes
[verify with an A/B render with the light hidden]. The light belongs in the shot's Level Sequence as
a spawnable (scenario-unreal-cinematics); if spawned in the level for a test, switch Affects World
off after the render (`light_lint` flags `still_only_in_gameplay`).

```python
# test: P13b_still_only_rim
# soft-block: mesh lighting_channels property name is [verify]
# status: not yet run in Unreal 5.8; test: job_procedures_snippets.py (block P13b_still_only_rim)
hero_meshes = ["SM_BackBar_Shelf"]                    # the still's hero props, from the brief
rim = L.still_only_light_plan(hero_meshes, kind="rect", intensity=2.0)
src, dst = (300.0, 700.0, 330.0), (300.0, 790.0, 150.0)
rim_actor = L.spawn_light("rect", src, L.aim_rotator(src, dst), label="L_Rim_Still_BackBar", tags=rim["tags"],
                          intensity=rim["intensity"], units=rim["units"], lighting_channels=rim["lighting_channels"],
                          indirect_lighting_intensity=rim["indirect_lighting_intensity"], source_width=64.0, source_height=64.0,
                          attenuation_radius=300.0, max_draw_distance=1500.0)
for label, channels in rim["targets"].items():
    L.set_lighting_channels(label, channels)
# after the render: rim_actor's light component affects_world False, and the plan goes to scenario-unreal-cinematics
print(rim["home"], rim["verify"])
```

Deferred alternative when the path tracer is unavailable or too slow:
`L.still_plan("deferred", "final", thin_bright=True)` gives 31 spatial samples, AA None, Motion Blur
Amount 0, 250 warm-up frames and PPV Lumen quality 4 with hit lighting for reflections; prove
warm-up by rendering 125 and 250 and checking `temporal_flicker([a, b])` passes. The draft and
preview warm-ups (64, 32) are this skill's shortcuts for layout, not finals [added].

## P14. Handoff manifest

Why: scenario-unreal-cinematics needs the rig, the exposure and the still template;
scenario-unreal-performance needs light counts, shadow methods and measured passes; both need the
cheat list.

```python
# test: P14_handoff
# status: not yet run in Unreal 5.8; test: job_procedures_snippets.py (block P14_handoff)
manifest = L.lighting_manifest(os.path.join(OUT, "lighting_manifest.json"),
                               {"profile": "gameplay", "lumen": True, "megalights": MEGALIGHTS, "ev100": EV_INTERIOR})
print("manifest", manifest)
```

## Without a script: what stays GUI or graph work

- **Material graphs** (the neon master with exposed `EmissiveIntensity` and `LumenEmissiveScale`
  behind a Ray Tracing Quality Switch for a Lumen-only boost as in Avowed, glass with Index of
  Refraction and Surface ForwardShading, PathTracingQualitySwitch, cloud volume materials):
  scenario-unreal-materials authors the masters once; this skill sets instance scalars
  (`set_mi_scalar`) and checks the glass masters (`glass_lint`).
- **Movie Render Graph template** `MRG_LightingStill`: authored once by a human or an MCP session
  with exposed variables `SpatialSamples`, `TemporalSamples`, `WarmUpFrames`, `UsePathTracer`,
  `DisableToneCurve`, `ReferenceMotionBlur` (Comly: promote pins to variables; one graph, many
  shots). Engine example to read first: `MovieGraphCreateConfigExample.py` in
  `/Engine/Plugins/MovieScene/MovieRenderPipeline/Content/Python/`.
- **Light Complexity probe pixel** (mouse hover): substitute freeze plus dump (P8).
- **Viewport exposure menu (Game Settings)**, the backslash calibration chart, the HDR meter
  numbers: judge through bookmark cameras and linear EXRs (P11, P13); spawn the calibrator mesh
  instead of the backslash chart.
- **Day Sequence and Celestial Vault** time-of-day plugins (Experimental): scriptable through
  Sequencer Python once class names are listed (`[n for n in dir(unreal) if "DaySequence" in n]`);
  hand to scenario-unreal-cinematics for keyed sequences.
