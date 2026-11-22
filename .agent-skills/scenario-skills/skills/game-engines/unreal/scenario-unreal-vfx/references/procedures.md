# scenario-unreal-vfx procedures (full code)

Every in-editor snippet here is **not yet run in Unreal** (engine not installed on 2026-09-24).
"Offline" procedures ran with system python3 (numpy, Pillow) through
`python3 tests/code/unreal-vfx/run_all.py --offline`. Names marked [verify] are answered by
`tests/code/unreal-vfx/job_00_vfx_probe.py`; after its first run, replace each [verify] here with
what `archive/tests/unreal-vfx/<stamp>/probe.json` recorded.

Channels (owned by scenario-unreal-expert): headless jobs through
`ue_run.run_python(uproject, script)` (`UnrealEditor-Cmd <uproject> -run=pythonscript -script=...`,
no level loaded, no rendering); live work through Epic's 5.8 MCP server (a Python toolset, V14),
`ue_remote.PythonRemote().exec(code)` or `ue_remote.RemoteControl().call(...)`; captures through
`ue_review.screenshot` in a rendering editor (never under `-nullrhi`).

Setup for every in-editor snippet:

```python
import sys
sys.path.insert(0, "<project>/skills/scenario-unreal-vfx/scripts")
sys.path.insert(0, "<project>/skills/scenario-unreal-expert/scripts")
import unreal
import ue_vfx as V
```

The strategy in one paragraph: Python cannot add or edit emitters, modules, renderers, simulation
stages or scratchpads (5.8 API, audited classes). So every effect is a **duplicate of a template**
whose structure is final and whose variable parts are **User parameters** under a written contract
(`V.TEMPLATE_CONTRACTS`), its look comes from **Material Instances and textures** swapped by
parameter, its cost class from an **Effect Type** asset and system properties, and its variation per
placement from **component overrides** set at spawn by gameplay. Anything the template does not
expose becomes one precise GUI request (module input to bind to which User parameter), made once,
then verified by script.

---

## V0. Probe the engine (run first)

Test: `tests/code/unreal-vfx/job_00_vfx_probe.py`. Status: not yet run in Unreal.

```python
rep = V.probe()        # classes with Niagara/GeometryCollection/Dataflow/Fracture/FieldSystem/ChaosCache/FXConverter,
                       # enum members (NCPoolMethod, NiagaraAgeUpdateMode, NiagaraCullReaction,
                       # NiagaraScalabilityUpdateFrequency, ClusterConnectionTypeEnum, DamageModelTypeEnum),
                       # dir() of NiagaraEffectType, NiagaraComponent, GeometryCollectionComponent, NiagaraDataChannelAsset
V.console("DumpConsoleCommands")   # then grep the project log for fx., Niagara, p.Chaos, GeometryCollection, ChaosVD, Removal
```

The job also lists `/Niagara`, `/NiagaraFluids` and `/Engine/EditorResources/FieldNodes` assets
whose path matches Template, Fountain, Minimal, SpriteBurst, Gas or FS_. Two discovery routes stay
open and are only used once the probe proves them: helper classes of the Cascade to Niagara
converter plugin (Python-driven emitter merging works in commandlets since 5.7, deltas) and
community MCP bridges that advertise Niagara stack authoring (db-lyon/ue-mcp) [verify both]. A
Developer Mode `unreal.py` stub (Project Settings > Plugins > Python) is the most complete list of
what the installed engine exposes.

## V1. Classify elements and write the plan (offline)

Test: `test_vfx_offline.py::TestPlanning::test_classify_fireball_elements`. Status: offline, passed.

```python
plan = V.plan_table([
    dict(name="fireball head", gameplay_critical=True, persistent=False, spawns_per_second=1, live_particles=3,
         modules=("Initialize Particle", "Sub UV Animation", "Scale Color", "Sprite Renderer")),
    dict(name="trail ribbon + wisps", gameplay_critical=False, persistent=False, spawns_per_second=1,
         live_particles=40, needs_events_collision_or_ribbon=True),
    dict(name="embers", gameplay_critical=False, persistent=False, spawns_per_second=1, live_particles=60,
         modules=("Initialize Particle", "Add Velocity", "Drag", "Gravity Force", "Scale Color", "Scale Sprite Size")),
    dict(name="impact flash + ring", gameplay_critical=True, persistent=False, spawns_per_second=2, live_particles=30),
    dict(name="impact smoke + sparks", gameplay_critical=False, persistent=False, spawns_per_second=2, live_particles=150,
         modules=("Initialize Particle", "Sub UV Animation", "Drag", "Scale Color", "Scale Sprite Size", "Curl Noise")),
    dict(name="wall dust + small debris", gameplay_critical=False, persistent=False, spawns_per_second=20,
         live_particles=400),                      # break events arrive in bursts: NDC listener
])
for row in plan:
    print(row["name"], row["effect_type"], row["spawn"], row["emitter"], row["sim_target"])
```

Rules encoded (Kiraly 71c5yv-XeY8 table [00:45:57]): classify critical or not and one-shot or
persistent first; pool moderate spawns, Data Channel for high volume; stateless when every module is
in the 17-module list and no events, collision, ribbons or mesh sampling are needed; NDC listeners
are stateful; CPU for small counts because each GPU system pays an RT dispatch. `ndc_rate_per_s=5`
and `gpu_min_particles=1000` are [added] starting points: validate with V10.

## V1b. Group elements into systems: one Effect Type per SYSTEM (offline)

Test: `test_vfx_offline.py::TestRefactorV2::test_effect_type_is_per_system`. Status: offline,
passed.

`classify_element` gives each element the Effect Type its class would want, but an Effect Type is
assigned in each System's properties (Kiraly [00:20:16]): one system cannot carry two. v0.1 of this
skill listed per-emitter Effect Types in one system, which the blind grade flagged as an error (the
embers would have inherited the uncullable critical type). Group first:

```python
plan = V.system_plan(rows, {                       # rows from V1
    "fireball head": "NS_Fireball", "trail ribbon + wisps": "NS_Fireball", "embers": "NS_Fireball",
    "impact flash + ring": "NS_FireballImpact", "impact smoke + sparks": "NS_FireballImpact",
    "wall dust + small debris": "NS_WallDebris"})
for name, s in plan.items():
    print(name, s["effect_type"], "self:", s["scalability_self"], "split:", s["split_candidates"])
    for p in s["problems"]:
        print("  ", p["level"], p["code"], p["msg"])
```

- The system takes its most critical element's type (NS_Fireball: NET_OneShotCritical because of the
  head).
- Less critical emitters in it get Emitter State > Scalability Mode Self: distance cull with "Sleep
  and Let Particles Finish", spawn count scale by distance and 0.5 on Low (Kiraly
  [00:26:03]-[00:27:08], GUI edit, gui-paths.md). Keep the read-critical emitters at every level;
  drop embers first.
- A non-critical element that is spammy (NDC rate) or GPU-simulated inside a critical system is a
  split candidate: its own system can then carry NET_OneShot, its caps and a budget [split rule
  added from Kiraly's table].
- An NDC listener is always its own looping system (Infinite loop plus Complete if Unused, NDC doc);
  one-shot and persistent elements never share a system (Spawn Only and Kill and Clear versus
  Continuous and Asleep, Kiraly [00:23:31], [00:24:35]).

The same grouping for other effects: a muzzle flash (critical flash, non-critical smoke puff and
shell eject in their own NET_OneShot system), a healing AoE (NET_PersistentCritical for the rim,
interior motes on Scalability Mode Self), rain or leaves (NET_Ambient, all emitters secondary).

## V2. Duplicate a template, set system properties, verify the contract (headless)

Test: `tests/code/unreal-vfx/job_niagara_template_pass.py`. Status: not yet run in Unreal.

```python
sysA = V.duplicate_template("/Game/VFX/Templates/NS_T_Projectile",          # project template built once (V2b)
                            "/Game/VFX/Fireball/NS_Fireball")               # refuses to overwrite: version instead
log = V.set_system_properties(sysA, {
    "effect_type": "/Game/VFX/EffectTypes/NET_OneShotCritical",
    "max_pool_size": 12,                   # = the Effect Type per-system cap (Kiraly [00:33:22])
    "pool_prime_size": 0,                  # priming hitches for assets loaded during play (NiagaraSystem doc)
    "warmup_time": 0.0,                    # warmup evaluates frames in sequence and hitches (scalability doc)
    "require_current_frame_data": True,    # the head follows a moving projectile this frame; False for static FX
})
params = V.user_parameters(sysA)           # NiagaraUserParameterInfo field names [verify]
check = V.contract_verdict(V.TEMPLATE_CONTRACTS["projectile"], params)
print(log, check)                          # missing -> one GUI binding request (gui-paths.md, "Expose a User parameter")
V.asset_subsystem().save_loaded_asset(sysA, only_if_is_dirty=False)
```

`fixed_bounds` appears twice in the 5.8 Python doc (a Box and a bool): `V.niagara_facts` reads it by
type; set the bool and the box through the Niagara Editor until the probe shows which one Python
writes [verify]. Per-placement bounds can be set at runtime with
`NiagaraComponent.set_system_fixed_bounds(local_box)` (doc-listed).

Size fixed bounds for what the system leaves behind, not for the head (test
`TestRefactorV2::test_fixed_bounds_for_travelling_effects`, offline, passed):

```python
print(V.fixed_bounds_check(speed_cm_s=2000, max_lifetime_s=1.2, effect_radius_cm=50, box_half_extent_cm=300))
# needed 2450 cm: a 300 cm box culls the smoke trail while it is on screen (BOUNDS_TOO_SMALL)
print(V.fixed_bounds_check(10000, 1.0, 20))      # PREFER_DYNAMIC: small effect traveling far
```

World-space particles trail up to speed x lifetime behind a moving emitter [derived]. Fixed bounds
are cheaper than dynamic ones except for a small effect that travels a large distance, the doc's own
exception (scalability doc, Fixed vs Dynamic Bounds); there keep dynamic bounds or shorten
world-space lifetimes. Check in the debugger with System Show Bounds.

### V2b. The template library (built once, then only parameterized)

A human or GUI agent builds each template once in the Niagara Editor from an engine template (Simple
Sprite Burst, Fountain, FountainLightweight, Minimal; Niagara Fluids gas templates for smoke bakes),
binding the contract's User parameters:

| Template                  | Emitters (structure final)                                                                                                                                                      | Contract (`V.TEMPLATE_CONTRACTS`)                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| NS_T_Projectile           | head sprite (Sub UV 8 x 8, velocity-aligned stretch), dark wisps (alpha blended), ribbon trail (stateful), embers (stateless)                                                   | projectile                                              |
| NS_T_Impact               | flash (1 sprite, 2 to 3 frames), burst sprites (flipbook), smoke (flipbook, fast then slow playback), sparks (velocity aligned), ring at `User.Radius`, optional decal renderer | impact                                                  |
| NS_T_ImpactListener (NDC) | Infinite loop + Complete if Unused, System-level NDC reader, spawn and read modules, per-surface emitters                                                                       | ndc_impact_listener (payload in the Data Channel asset) |
| NS_T_DebrisFill (NDC)     | fills removed GC pieces with particles sized by piece volume (Van Allen [00:35:24])                                                                                             | payload: location, extents, mass, colors                |

The contract is what the agent verifies after every duplicate (V2) and what gameplay sets at spawn
(V6). Names are a project convention [added]; the rule "drive the ring from the gameplay radius" is
Keyser's (#1 [00:09:44]).

## V3. Effect Types: create from presets or build once, then assign

Test: `job_niagara_template_pass.py` (creation attempt is logged as soft). Status: not yet run in
Unreal.

```python
for name in ("NET_OneShot", "NET_OneShotCritical", "NET_PersistentCritical", "NET_Ambient"):
    eft, log = V.create_effect_type("/Game/VFX/EffectTypes/" + name, name)   # factory and fields [verify]
    print(name, log)                                                        # each field "ok" or "FAILED: ..."
res = V.assign_effect_type(["/Game/VFX/Fireball/NS_Fireball", "/Game/VFX/Fireball/NS_FireballImpact"],
                           "/Game/VFX/EffectTypes/NET_OneShotCritical")
```

If creation fails (the audited 5.8 Python doc does not cover `NiagaraEffectType`), a human or GUI
agent builds the four assets from the preset table (`V.EFFECT_TYPE_PRESETS`, gui-paths.md "Effect
Type asset") and the agent only assigns them. Preset values (Kiraly): NET_OneShot Spawn Only, Kill
and Clear, Distance significance, 15 per system and about 30 per type, pre-cull on, 0.0 s outside
frustum and without render; NET_PickupPersistent Continuous, Asleep, 5 per system, 1.0 s delayed
cull, pre-cull off. Per-quality example: High and up 30 / 15, Medium 5000 cm with 30 / 15, Low 2000
cm with 20 / 8. Warnings: keep gameplay-critical feedback out of the aggressive type (player-hit
sparks, [00:22:58]); thousands of live systems on one type spike the significance refresh (about 30
ms, [00:19:44]).

Check the caps offline:

```python
V.caps_verdict(max_system_instances=12, max_effect_type_instances=24, max_pool_size=12)   # [] when consistent
```

What each Effect Type setting actually saves (Kiraly): Max Distance stops the system **ticking**, it
has nothing to do with GPU or render culling, and the scalability manager's tick pays for the
distance check [00:16:57]; Max Effect Type and System Instances are hard caps with significance
choosing survivors [00:17:29]-[00:18:02]; Cull Proxy renders copies of an already simulated
instance, which saves the tick and still costs the RT [00:18:02]. So a render-thread problem is not
solved by distance culling (V10 `lever_check`).

FX budgets (test `TestRefactorV2::test_budget_guard_and_oscillation`, offline, passed). Budget
scaling is for non-critical types in high-intensity moments only [00:34:39]; it does nothing until
`fx.Budget.Enabled 1`, which lives in INI files [00:35:12]; too tight a budget oscillates (cull,
cost drops, spawns return, cost rises), damped by `fx.Budget.AdjustedUsageDecayRate`
[00:36:50]-[00:37:21]; Max Global Budget Usage is the nuclear option (footsteps in heavy combat)
[00:36:18].

```python
cvars = {"fx.Budget.Enabled": 1, "fx.Budget.AdjustedUsageDecayRate": 0.5}   # decay value [added]: tune on the stress run
print(V.budget_verdict(V.EFFECT_TYPE_PRESETS["NET_OneShot"], gameplay_critical=False, cvars=cvars))   # []
print(V.budget_verdict(dict(V.EFFECT_TYPE_PRESETS["NET_OneShotCritical"], budget_scaling=True), True, cvars))
# -> BUDGET_ON_CRITICAL
# after the V9/V10 stress run, TotalActive per frame from the Debug HUD (Show Global Budget Info) or a trace:
print(V.budget_oscillation(total_active_series))    # oscillating -> raise the budget or the decay rate
```

Put the `fx.Budget.*` lines in `Config/DefaultEngine.ini` (or the device profile) with
scenario-unreal-performance; the Effect Type's Budget Scaling curves are in the preset
(`NET_Ambient`, frame 00:34:38).

## V4. Audit every Niagara system (headless)

Test: `job_niagara_template_pass.py` runs the verdict on one system. Status: not yet run in Unreal.

```python
rows = V.audit_niagara("/Game")                      # systems without an Effect Type sort first: the first fix list
for r in rows:
    for p in r["verdict"]:
        print(r["path"], p["level"], p["code"], p["msg"])
import json; json.dump(rows, open("<out>/niagara_audit.json", "w"), indent=1, default=str)
```

Verdict rules: no Effect Type (error), warmup, fixed tick delta, Require Current Frame Data on a
static effect, GPU emitters without fixed bounds [added, verify], frequently spawned without a pool,
priming on mid-play loads, Effect Type not matching the planned class. Read the results with the
lead's `ue_audit.verdict(report, profile)` if the project has a shared profile.

## V5. Textures: reuse first, generate the rest, import with the right settings

Test: `test_vfx_offline.py::TestImageMetrics::test_procedural_textures` (generation, offline,
passed); import and settings not yet run in Unreal.

Trümpler's decision tree first (KaNDezgsg4M [00:16:33]): do I need a texture; is there one in the
project, engine or a licensed pack; is there a simple tool; only then paint or simulate. Search
existing content:

```python
eas = V.asset_subsystem()
hits = [p for p in eas.list_assets("/Game", recursive=True, include_folder=False)
        if any(k in p.lower() for k in ("smoke", "fire", "spark", "noise", "glow", "flipbook"))]
```

Generate what is missing (offline, system python3):

```python
import ue_vfx as V
V.save_png(V.make_glow_dot(256), "<out>/T_GlowDot.png")                # dot, blur, blur more, artifacts (Shishido [00:14:22])
V.save_png(V.make_gradient_lut(V.FIRE_RAMP), "<out>/T_LUT_Fire.png")   # grayscale flipbook + LUT beats color variants
V.save_png(V.make_erosion_noise(512), "<out>/T_Erosion_Noise.png")     # tileable erosion mask (Trümpler [00:39:52])
```

Import and set (in editor):

```python
tex = V.import_textures(["<out>/T_GlowDot.png", "<out>/T_Erosion_Noise.png", "<out>/T_LUT_Fire.png"], "/Game/VFX/Textures")
for t in tex:
    role = "lut" if "LUT" in t.get_name() else ("erosion" if "Erosion" in t.get_name() else "mask")
    print(t.get_name(), V.apply_texture_settings(t, role, max_size=256))   # enum member names [verify]
```

Author sources large and cap in engine with Maximum Texture Size (a 32 x 32 ash sprite is a blurry
blob near camera, Trümpler [00:19:32]). Audit every VFX texture after import, headless (test
`TestRefactorV2::test_texture_import_rules` runs the facts and verdict on a stand-in object offline;
the engine call is not yet run in Unreal):

```python
for row in V.audit_vfx_textures("/Game/VFX"):          # role guessed from the name: mask, erosion, lut, flipbook, color
    for p in row["verdict"]:
        print(row["path"], p["level"], p["code"], p["msg"])  # MASK_SRGB, LOD_GROUP, NOT_POW2, SMALL_SOURCE, NO_SIZE_CAP
```

Rules: masks and erosion noise with sRGB off (channels used as data), `TEXTUREGROUP_Effects`, power
of two, flipbook grids that divide the texture, big sources kept and capped with Maximum Texture
Size (pass `needed_size` to `texture_facts` when the effect's screen size is known). Pack three
masks into RGB only when they share UVs, panning and resolution (`V.pack_masks`). Check every
flipbook: `V.flipbook_check(1024, 1024, 8, 8, sub_uv_end_frame=63)`. SubUV frame blending is on by
default on sprite and mesh renderers since 5.4. Licenses: attribution-required assets are
impractical in large productions; the ArtStation standard license covers one project and 2,000 sales
(Trümpler [00:10:14]-[00:11:20]).

## V6. Spawn with pooling, route spam to a Data Channel (PIE)

Test: none automated yet; run in a live editor after V2. Status: not yet run in Unreal.

```python
impact = V.load("/Game/VFX/Fireball/NS_FireballImpact")
comp = V.spawn_pooled(impact, (0, 0, 100), method="AUTO_RELEASE", pie=True)   # NCPoolMethod member names [verify]
V.set_user_params(comp, {"User.Radius": 300.0,                                # the gameplay damage radius, same number
                         "User.SurfaceColor": unreal.LinearColor(0.35, 0.33, 0.30, 1.0),
                         "User.ImpactNormal": unreal.Vector(-1, 0, 0)})
```

- Manual Release (a character on fire removed by a gameplay cue): keep the component, then Release
  to Pool, never Destroy (Kiraly [00:32:18]); the Python name of the release call is [verify].
- In gameplay code (scenario-unreal-gameplay owns it): Blueprint Spawn System at Location with
  Pooling Method Auto Release; set User parameters from the ability's data.
- Data Channel route for bursts: the listener system and the Data Channel asset are built once (V2b,
  gui-paths.md); gameplay writes with Write To Niagara Data Channel or its Batch variant, flags
  Visible to Blueprint / Niagara CPU / Niagara GPU (Kiraly frame 00:45:03). Chaos destruction and
  Niagara collision events are payload types (NDC doc). Asset values the agent may set with
  `set_editor_property` [verify]: see `V.NDC_ISLANDS_EXAMPLE` (Islands, Aligned Static, extents 1000
  / 5000 / 250, island pool 4).
- Remote Control route (live editor, 5.8 disables remote UFUNCTION calls by default: enable in
  Remote Control project settings and allow-list the function):

```python
import ue_remote
rc = ue_remote.RemoteControl()
rc.call("/Game/Maps/VFX_Review.VFX_Review:PersistentLevel.NiagaraActor_0.NiagaraComponent0",   # object path [verify]
        "SetVariableFloat", {"InVariableName": "User.Radius", "InValue": 300.0})              # C++ name and params [verify]
```

## V7. Deterministic capture series (live editor)

Test: `tests/code/unreal-vfx/live_capture_series.py`. Status: not yet run in Unreal.

1. Review level: the game's own lighting or a neutral but textured background (never a flat color:
   `ue_review.image_checks` flags a uniform frame as blank, and value is judged over the game
   background, Keyser #3 [00:02:54]), a Post Process Volume with Manual exposure (fixed EV100) so
   values do not drift [added; exposure belongs to scenario-unreal-lighting-rendering], the gameplay
   camera distance (not a close-up).
2. Place, parameterize, capture at fixed ages, then the same ages with the component's rendering off
   (clean plates for effect masks). `V.capture_ages` is a generator: one editor tick per yield,
   screenshots through `ue_review.screenshot` + `wait_screenshot`. Headless-launched, as a latent
   job:

```python
import ue_run
res = ue_run.run_python(uproject, "<project>/tests/code/unreal-vfx/live_capture_series.py",
                        map="/Game/Maps/VFX_Review", mode="latent",
                        args={"system": "/Game/VFX/Fireball/NS_FireballImpact", "params": {"User.Radius": 300.0},
                              "camera_location": [-600, 0, 250], "camera_rotation": [-12, 0, 0]})
print(res["ok"], res["result"]["fx"]["series"], res["result"]["center_px"], res["result"]["radius_edge_px"])
```

The job's core, usable in a running editor (MCP Python tool call or
`ue_remote.PythonRemote().exec`), driven by `V.run_on_ticker`:

```python
def review(system_path, ages, out):
    actor, comp = V.place_system(V.load(system_path), (0, 0, 100))
    V.set_user_params(comp, {"User.Radius": 300.0})
    ue_review.set_camera((-600, 0, 250), (-12, 0, 0))
    fx = yield from V.capture_ages(comp, ages, out, 1280, 720, prefix="fx")
    comp.set_rendering_enabled(False)
    plates = yield from V.capture_ages(comp, ages, out, 1280, 720, prefix="plate")
    return fx, plates
V.run_on_ticker(review("/Game/VFX/Fireball/NS_FireballImpact",
                       [0.0, 0.033, 0.066, 0.1, 0.15, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0], "<out>/capture"), print)
```

3. Project the intended points for scoring:
   `UnrealEditorSubsystem.world_to_screen(unreal.Vector(0, 0, 100))` for the center and a point at
   the radius for `radius_px` (doc-listed; returns None off screen); the latent job returns both.
   Alternatives: `comp.reset_system()` then `comp.advance_simulation_by_time(t, 1/60)` (doc-listed)
   before a screenshot; `fixed_tick_delta` on the system for repeatable steps during reviews only
   (it forces game-thread ticking). For motion review in real time, render a short Sequencer shot
   through scenario-unreal-cinematics (Movie Render Graph). Then repeat the look in PIE with the
   gameplay camera (`LevelEditorSubsystem.editor_request_begin_play`, doc-listed): "the viewport
   lies" (Shishido [00:05:05]).

## V8. Score the captures (offline)

Test: `run_all.py` self test (synthetic impact series, offline, passed 2026-09-24). Status: offline.

```bash
python3 tests/code/unreal-vfx/score_captures.py --series \
  --plates --event-time 0.0 --window-end 1.0 --kind impact \
  --center 640,360 --radius-px 180 --key-age 0.1 --fps 30 <out >/capture/fx_series.json <out >/capture/plate_series.json
```

It runs `ue_review.image_checks` on every frame when the lead toolkit is present (any blank frame,
all white, all black or uniform, makes the series not deliverable: the self test includes that
negative control), computes the intensity curve (peak mode: "intensity is not size"), timing, value
bands, blowout, saturation, core and fringe, focal error, footprint against the radius, palette,
size classes, color-blind contrast, strobing, then `V.score_rubric` and writes `vfx_report.json`
plus color, L* grayscale and squint contact sheets. The agent must open and look at the three sheets
and score the judgment rows of `critique.md` in writing. A projectile adds
`--head x,y --tail x,y --velocity 1,0 --kind projectile --event-time <hit>`.

v0.2 adds, on the same run: `saturation_under_values` (C2: good values can hide bad saturation,
Keyser #4 [00:15:36]), `accent_focal_distance` (C4: the 10 % accent near the focal point, Firsova
[00:14:39]-[00:15:14]), `size_classes_series` (S2: few big, more medium, many small, held over time,
Firsova [00:04:31]-[00:05:05]) and, with `--schedule <file>.json` (the V15 schedule), rubric T7. See
V16 for what to do when one fails.

## V9. Crowd and stress tests

Test: none automated yet. Status: not yet run in Unreal.

```python
actors = V.stress_grid_place(V.load("/Game/VFX/Fireball/NS_FireballImpact"), n=20, spacing=300.0)   # the doc's 20 x 20
V.console("stat unit")
V.console("fx.Niagara.Debug.Hud Enabled=1 OverviewEnabled=1 SystemDebugVerbosity=2 SystemFilter=*Impact*")
```

Read Game Thread Average in the Niagara Debugger Performance overlay, then hide the overlay and read
`stat unit` Frame and Draw (lightweight doc). Compare stateful against stateless versions and
per-impact pooled spawns against one NDC listener (Kiraly: per-impact NS_ImpactConcrete about 487 us
GT against the listener about 146 us; RT unchanged because particles still render [00:45:15]). Also
a mixed crowd with other effects and characters from the gameplay camera: does the important effect
still dominate (critique G4, V5)?

## V10. Fixed-scenario measurement (Kiraly's method)

Test: offline verdicts in `test_vfx_offline.py::TestPlanning::test_budgets`; the capture itself is
not yet run.

1. A deterministic worst realistic fight (N casters firing, M walls breaking), driven by a Blueprint
   timer or a Sequencer shot so it repeats [added].
2. Match the target's core count: Kiraly limits affinity to 4 cores (slide 00:01:26); on macOS use a
   machine with that count or an engine thread limit such as `-corelimit=N` [verify flag].
3. In PIE or a Development build: `stat unit`, `stat NiagaraOverview`, `stat NiagaraSystems`,
   `stat NiagaraEmitters` (raise `stats.MaxPerGroup` if rows are truncated). Stat overlays are
   on-screen text: screenshot and read them, or better record Insights: launch with
   `-trace=default -statnamedevents` (or `trace.file default,statnamedevents`, then `trace.stop`);
   without named events Niagara does not appear (Kiraly [00:10:52]). Parse the `.utrace` with the
   lead's `ue_stat` (TraceQuery JSONL, 5.8) and summarize:

```python
import ue_stat, ue_vfx as V
recs = ue_stat.parse_jsonl("<out>/fight.jsonl")               # TraceQuery JSONL (5.8); schema [verify]
print(ue_stat.sniff_schema(recs)["types"])                    # first real file: correct the schema
frames = ue_stat.trace_frames(recs)
print(ue_stat.budget_check(frames, 16.67))                    # frame budget, p95/p99, hitches
top = V.niagara_trace_summary(ue_stat.timer_totals(recs))     # NS_ and Niagara timers: total, per-frame avg and max
verdict = V.niagara_overview_verdict(
    {"GT Concurrent Total": {"avg": 1.1, "max": 2.4}, "GT Total": {"avg": 0.6, "max": 1.2}, "RT Total": {"avg": 0.9, "max": 2.0}},
    measured_cores=4, target_cores=4)                          # budgets default to V.DEFAULT_FX_BUDGET_MS [added]
table = V.before_after(before_rows, after_rows)                # keep Kiraly's before/after table per lever
```

4. Worst-case single instance: `comp.init_for_performance_baseline()` (doc-listed: no distance
   culling, LOD distance 0).
5. Pick the lever for the thread that is over budget, then change one lever, repeat, keep the table;
   accept only with visual parity at the same moments (Kiraly [00:21:21]). Test
   `TestRefactorV2::test_lever_check` (offline, passed):

```python
print(V.lever_check("RT", "max_distance_cull"))   # ok False: stops ticking, not rendering; try caps, CPU, stateless
```

| Lever                                   | Saves                                      | Does not save                           | Source                 |
| --------------------------------------- | ------------------------------------------ | --------------------------------------- | ---------------------- |
| Effect Type on every system             | GT, GT Concurrent, RT (fewer live systems) |                                         | Kiraly [00:20:48]      |
| Max Distance                            | the tick (GT, GT Concurrent)               | RT, GPU; the manager pays for the check | [00:16:57]             |
| Instance caps                           | all threads (instances removed)            |                                         | [00:17:29]-[00:18:02]  |
| Cull proxy                              | the tick                                   | RT                                      | [00:18:02]             |
| Stateless emitters                      | GT, RT, GPU, memory                        |                                         | frame 00:39:43         |
| NDC listener instead of per-hit systems | GT (487 to 146 us)                         | RT (particles still render)             | [00:45:15]-[00:45:46]  |
| CPU instead of GPU for small counts     | RT dispatch, GPU                           |                                         | [00:05:47], [00:39:56] |
| FX budget                               | non-critical cost under load               | critical effects (never budget them)    | [00:34:39]-[00:37:21]  |

6. Deliver the table and the scenario to scenario-unreal-performance.

## V11. Scalability sweep

Test: none automated yet. Status: not yet run in Unreal.

```python
for q in (0, 1, 2, 3):
    V.console("sg.EffectsQuality %d" % q, pie=True)
    # check fx.Niagara.QualityLevel follows (Kiraly [00:27:17]) [verify]
    # run the V10 scenario; capture the same frames (V7 in PIE); record active and culled counts from the Debug HUD
```

Pass: gameplay-critical parts intact at Low (re-score G1 and T1), embers and secondary smoke fade
instead of popping, persistent effects do not restart when the camera swings behind cover (delayed
cull 1 s, Kiraly [00:25:07]). Editor distance preview:
`comp.set_preview_lod_distance(True, d, max_d)` (doc-listed) [verify its effect on culling].
Per-emitter Scalability Mode Self, spawn count scale by distance and per-platform overrides are GUI
edits (gui-paths.md).

## V12. Niagara Fluids template tuning without opening the solver

Test: none. Status: not yet run in Unreal.

Use only for hero smoke or for baking: Fluids are Beta (5.8 doc); 2D gas is the documented choice
for game fire and torches, 3D gas for hero or cinematic shots. Create from a template once
(gui-paths.md), place it, list its User parameters and set the Emitter Summary values it exposes:

```python
actor, comp = V.place_system(V.load("/Game/VFX/Smoke/NS_Dust_Gas3D"), (0, 0, 0))
for p in V.user_parameters(comp.get_asset()):
    print(p)                                                      # names per template [verify]
for iters in (6, 10):                                             # Xiao Yue's comparison, PikR41luBws [00:16:17]
    V.set_user_params(comp, {"User.PressureIterations": iters})   # hypothetical name: use the listed one
    comp.reset_system(); comp.advance_simulation_by_time(1.0, 1 / 60.0)
    # capture (V7) and read GPU time (Debug HUD GPU compute or Insights GPU track) [verify]
```

Pick the cheapest setting that keeps swirl and volume; Cubic advection keeps detail, Linear is
cheaper; shape the look in the source (directional burst, temperature off and density buoyancy down
for heavy dust), not with solver turbulence ("energy coming from nowhere", [00:11:14]). For
cinematics set the Scalability overrides at Cinematic so Movie Render Queue's game overrides switch
quality at render time (fluids doc). Heterogeneous Volumes: `r.HeterogeneousVolumes.Allow` (5.8);
the particle volume-domain renderer is the fallback on lower end ([00:32:28]).

## V13. Flipbook bake and validation

Test: `test_vfx_offline.py::TestPlanning::test_flipbook` (math, offline, passed); the bake is GUI.

Bake in the Niagara Editor (Baker > Open Baker Tab): Timeline Frames Per Second 30 (the editor's
authoring rate), Frames Per Dimension 8 x 8, Texture Size 1024 or 2048, Source Binding None, Bake;
**Clear** before a variation or the previous texture is overwritten (Flipbook Baker doc). Whether
the baker is scriptable in 5.8 is [verify]. Then validate by script:

```python
print(V.flipbook_check(1024, 1024, 8, 8, sub_uv_end_frame=63, baker_fps=30))
```

Material (scenario-unreal-materials builds the master): Translucent, RGB divided by A into Emissive
(the bake is premultiplied with black), A into Opacity; playback fast then slow like smoke slowed by
air (Trümpler [00:13:08]). Check both offline (test `TestRefactorV2::test_premultiplied_bake` and
`test_fade_and_playback_curves`, passed):

```python
print(V.premultiplied_check("<out>/T_Smoke_SubUV_8x8.png"))   # True -> the material must divide RGB by A
print(V.flipbook_playback_verdict([(0, 0), (0.5, 48), (1, 63)], frames=64))   # fast then slow: clean
print(V.flipbook_playback_verdict([(0, 0), (1, 63)], frames=64))              # LINEAR_PLAYBACK
```

The playback curve lives in the template (Sub UV Animation with a curve-driven frame, or a User
curve the template exposes [verify module option]); write it into the GUI request, then verify the
capture (V8 timing). Frame blending is on by default since 5.4. For stock flipbooks Trümpler also
adds color and size curves ([00:12:36]-[00:13:40]).

## V14. A Niagara toolset for Epic's MCP server

Test: none. Status: not yet run in Unreal.

Epic's 5.8 MCP ships no Niagara toolset in the saved doc; a Python toolset wraps this skill's calls
so an MCP client can use them live. Save as `<Plugin>/Content/Python/vfx_tools.py` and run
`ModelContextProtocol.RefreshTools`:

```python
import unreal
import toolset_registry
import ue_vfx as V

@unreal.uclass()
class VFXTools(unreal.ToolsetDefinition):
    """Niagara template-and-parameters tools: audit, contract check, user parameters, Effect Type assignment."""

    @staticmethod
    @toolset_registry.tool_call
    def audit_niagara(root: str) -> str:
        """Audit NiagaraSystem assets under a content path.

        Args:
            root: content path such as /Game/VFX.
        Returns:
            JSON list of facts and verdicts per system.
        """
        import json
        return json.dumps(V.audit_niagara(root), default=str)

    @staticmethod
    @toolset_registry.tool_call
    def set_user_float(actor_label: str, name: str, value: float) -> str:
        """Set a float User parameter on a placed Niagara actor.

        Args:
            actor_label: the actor's label in the Outliner.
            name: parameter name such as User.Radius.
            value: new value.
        Returns:
            Log line.
        """
        eas = V.actor_subsystem()
        for a in eas.get_all_level_actors():
            if a.get_actor_label() == actor_label:
                comp = a.get_component_by_class(unreal.NiagaraComponent)
                return str(V.set_user_params(comp, {name: float(value)}))
        return "actor not found"
```

Tool calls run serially on the game thread (MCP doc); keep each small.

## V15. Timing plan: spawn schedule, wind-up, strobing (offline, before any template work)

Test: `TestRefactorV2::test_spawn_schedule`, `test_strobe_risk`. Status: offline, passed; the
capture check (V8 `--schedule`) is not yet run on real frames.

Write the ability's beats on one clock (cast input = 0) before building, hand the times to the
template builder and to scenario-unreal-gameplay, and re-check them on the capture:

```python
schedule = [
    dict(name="hand glow",   role="windup",  start=0.00, end=0.35),   # wind-up: the cast animation's window
    dict(name="head",        role="travel",  start=0.35, end=0.95),
    dict(name="impact flash", role="flash",  start=0.95, end=0.95),   # peak on the hit frame
    dict(name="sparks",      role="sparks",  start=0.95, end=1.00),
    dict(name="debris",      role="debris",  start=0.97, end=1.05),
    dict(name="smoke",       role="smoke",   start=1.00, end=1.40),   # consequence after cause
    dict(name="scorch decal", role="persistent", start=0.95, end=4.0),
]
v = V.spawn_schedule_verdict(schedule, hit_time=0.95, window_end=1.5, windup=(0.0, 0.35))
print(v["ok"], [(p["code"], p["msg"]) for p in v["problems"]])
print(V.strobe_risk(speed_cm_s=2000, head_length_cm=30, fps=60))    # step 33 cm > 30 cm head: strobes
```

Rules (with the check codes):

- **Anticipation rides the cast animation** (`WINDUP_NOT_SYNCED`, `NO_ANTICIPATION`): use any window
  between input and firing and lean on the character's wind-up (Keyser #5 [00:08:47]-[00:09:54]);
  the effect continues the character's line of action (Firsova [00:06:45]-[00:07:51]). The wind-up
  is spawned from the cast montage (an animation notify owned by scenario-unreal-animation and
  scenario-unreal-gameplay), so the two cannot drift. With no window (instant heal), move the
  interest into the falloff (`NO_WINDOW`, Keyser #5 [00:09:20], [00:18:07]).
- **Build-up stops spawning exactly at the hit** (`BUILDUP_AFTER_HIT`; Shishido [00:30:00]):
  charging clouds, gathering sparks and the like end on the hit frame, not "about then". Role
  `windup` is the caster's anticipation (ends at release); role `buildup` gathers toward the hit
  itself (a meteor's darkening sky, a charged slam).
- **The flash is on the hit frame** (`FLASH_NOT_ON_HIT`; Keyser #5 [00:14:34]).
- **Consequences follow causes** (`CAUSE_ORDER`): flash, then debris and sparks, then smoke;
  Shishido starts rain 1.8 s and the floor candy 2.2 s after the falling candy for the same reason
  ([00:31:20], [00:37:02]).
- **Nothing but persistent marks spawns after the gameplay window** (`SPAWNS_AFTER_WINDOW`; Keyser
  #1 [00:15:21]).
- **Strobing**: a round head that moves more than its own length per frame does not blend frame to
  frame (Keyser #5 [00:07:40]-[00:08:47]). `strobe_risk` returns the stretch factor for rubric T4
  (IoU at least 0.2); build it as a velocity-aligned sprite scaled by speed (Scale Sprite Size By
  Speed is one of the 17 stateless modules, so the head can stay stateless; the renderer's alignment
  option name is [verify]) and bake motion blur into the head texture so a paused frame reads
  direction (Keyser #2 [00:03:31]-[00:04:04]). The 1D overlap formula is [added].
- **On impact, never destroy the projectile actor under live trail particles** [added from
  Shishido's fades [00:39:23] and Van Allen's hidden removal [00:37:03]]: detach or deactivate the
  trail system so its particles finish their fade, then release it to the pool.

## V16. Look diagnostics when a rubric row fails (offline plus live counts)

Test: `TestRefactorV2::test_duplicate_spawn_blowout`, `test_fade_and_playback_curves`,
`test_saturation_under_values`, `test_accent_and_size_classes_over_time`. Status: offline, passed;
the Debugger counts are not yet read from a real editor.

| Failing row                | Diagnose                                                                                                                                                                         | Fix                                                                                                                                                                                                                   | Source                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| V2 blowout                 | count live particles per emitter and systems per event in the Niagara Debugger or FX Outliner, then `V.duplicate_spawn_check({"glow dot": 1, "systems_per_event": 1}, observed)` | remove the duplicates (six dots instead of one; an event that spawns the system from gameplay and again from a notify), then back the additive core with an alpha-blended saturated layer that "fakes the saturation" | Shishido [00:17:42]-[00:18:14]             |
| S4 popcorning              | `V.fade_curve_verdict(alpha_curve, size_curve)` on the Scale Color and Scale Sprite Size curves you asked for                                                                    | opacity 1 to 0 from about mid-life, not shrink-only; match the colors between layers; restart smaller if the mass got too big                                                                                         | Shishido [00:11:24], [00:39:23]-[00:40:00] |
| C2 saturation under values | `V.saturation_under_values(key, mask)` after the value pass (V1) is correct                                                                                                      | desaturate the high values toward the core; keep saturation in the fringe and dark edges                                                                                                                              | Keyser #4 [00:15:36]-[00:16:49]            |
| C4 palette and accent      | `V.palette_shares` and `V.accent_focal_distance(key, mask, focal_px)`                                                                                                            | about 60 / 30 / 10, the 10 % accent at the focal point; iterate with gradient maps, which keep the value structure                                                                                                    | Firsova [00:14:39]-[00:16:24]              |
| S2 size classes            | `V.size_classes_series(masks)` on the debris, spark and ember frames                                                                                                             | few big, more medium, many small, and the same ratio as the effect grows and dies                                                                                                                                     | Firsova [00:04:31]-[00:05:05]              |
| V6 color-blind             | `V.cvd_contrast(key, mask, "deuteranopia")` and `"protanopia"` on a capture over the game's real green and brown ground (a red-orange fireball over grass is the classic case)   | bump the element's value, do not light the whole effect                                                                                                                                                               | Keyser #3 [00:10:54]-[00:12:03]            |

Grayscale for every value judgment is linear-light L* (`V.lstar`), never a channel average or an OS
grayscale filter, which exaggerates (Keyser #3 [00:13:32]; Firsova [00:12:58]-[00:14:39]).

---

## D0. Source mesh audit before any Geometry Collection

Test: `TestRefactorV2::test_source_mesh_watertight` (offline, passed); the export is not yet run in
Unreal.

Source meshes must be watertight and non-intersecting: open faces simulate worse and unpredictably,
intersecting parts are pushed apart at simulation start (Chaos docs, Geometry Collections: Best
practices). Fix them in the DCC (scenario-maya-expert, scenario-blender-expert) before fracturing.

```python
V.export_static_mesh_obj(V.load("/Game/Destruction/SM_Wall"), "<out>/SM_Wall.obj")   # AssetExportTask [verify]
rep = V.mesh_watertight_check(V.read_obj_faces("<out>/SM_Wall.obj"))                  # offline part
print(rep["watertight"], rep["boundary_edges"], rep["nonmanifold_edges"], rep["shells"], rep["action"])
```

More than one shell means separate parts: check them for overlaps by eye or in the DCC (intersection
is not computed here).

## D1. Harden a Geometry Collection (headless)

Test: `tests/code/unreal-vfx/job_gc_harden.py`. Status: not yet run in Unreal.

**Choose ONE damage model first; it decides which number you tune** (Xiao Yue
[00:19:54]-[00:20:27]). v0.1 of this skill showed Material Strength and Connectivity in the workflow
and then tuned a per-level threshold array here; the blind grade flagged the inconsistency.

| Model                                     | Threshold comes from                                                                     | What you tune                                                                                  | Pick when                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Material Strength and Connectivity (5.3+) | contact area with siblings x the physical material's tensile strength                    | tensile strength on the physical material (D3), then strain (D4); the array is not the knob    | structural pieces (walls, pillars, bridges): the most physical option, weak corners by construction |
| User-defined thresholds                   | the per-level `damage_threshold` array (quickstart 5000, 500, 50), decreasing with depth | the array, plus physical-material damage multipliers across many assets (Van Allen [00:27:58]) | art-directed breaks, props, when you need exact per-level control                                   |

Size-specific thresholds are a flag on top (`use_size_specific_damage_threshold`: larger pieces
harder to break), not a model; shock propagation needs them (Caillaud [00:19:37]).

```python
gc = V.load("/Game/Destruction/GC_Wall")
print(V.gc_verdict(V.gc_facts(gc), placements=12))
MSC = True                                   # the wall is structural
common = {
    "enable_nanite": True,                  # set_enable_nanite: works after fracture, gives GC rendering a LOD (Caillaud [00:04:21])
    "strip_on_cook": True,                  # stripping non-Nanite geometry cut about 95 % of asset size [00:05:28]
    "enable_nanite_fallback": False,        # True only if a non-Nanite platform ships
    "root_proxy_meshes": ["/Game/Destruction/SM_Wall"],             # renders until the first break; collision stays on the GC
    "custom_renderer_class": "GeometryCollectionRootProxyRenderer", # ISM batching of proxies (5.5 notes) [verify class]
    "remove_on_max_sleep": True, "maximum_sleep_time": (3.0, 5.0), "removal_duration": (1.0, 2.0),
    "automatic_crumble_partial_clusters": True,   # asset-level crumbling for Remove on Sleep (GeometryCollection doc)
    "slow_moving_as_sleeping": True,
    "physics_material": "/Game/Destruction/PM_Concrete",   # D3: density, friction, restitution, tensile strength
}
if MSC:
    model = {"damage_model": "<DamageModelTypeEnum member for Material Strength and Connectivity>"}  # probe lists it [verify]
else:
    model = {"damage_threshold": [5000.0, 500.0, 50.0],   # per level, decreasing (quickstart); tune in the gym
             "use_material_damage_modifiers": True}       # physical material multipliers steer every destructible
log = V.harden_gc(gc, dict(common, **model))  # resolve the enum string to unreal.DamageModelTypeEnum.<MEMBER> first
print(log)                                  # every field "ok" or "FAILED: ..."; read-only attributes need set_editor_property
print(V.gc_verdict(V.gc_facts(gc), placements=12))   # MSC_TENSILE if the physical material has no tensile strength
```

Not on this class (use Dataflow or Fracture Mode): fracture, anchors, per-bone Remove on Break with
random min and max timers and Cluster Crumbling, one-way interaction for debris levels, Tiny Geo,
per-region convex generation. `cluster_connection_type` and `damage_model` are settable enums here
(Bounds Overlap Filtered or Proximity; Material Strength and Connectivity) [enum member names
verify]. Use a duplicate while testing (the job does): never overwrite a delivered asset.

Judge the whole recipe, not only the asset (test `TestRefactorV2::test_gc_recipe`, offline, passed);
the keys describe any destructible (wall, pillar, crate, bridge, glass pane):

```python
print(V.gc_recipe_verdict(dict(
    source_watertight=True, random_seed=7, material="concrete", fracture="cluster voronoi, noise, grout", levels=3,
    hold="anchor", connection="proximity", contact_area_threshold=10.0, damage_model="msc", tensile_strength=5.0,
    one_convex_per_cluster=True, leaf_box_below=0.3, debris_one_way=True,
    remove_on_break=True, break_delay=(5.0, 10.0), removal_duration=(1.0, 2.0), cluster_crumbling=True,
    ships_low_end=True, platform_removal_multiplier={"LowPC": 0.5}, tiny_geo="merge",
    interior_material=True, interior_distance_bake=True, settle="disable", debris_needs_wake=False,
    vfx_reads_breaks=True, chaos_data_generation=True, notify_breaks=True, debris_profile="broken_bones")))
```

## D2. Batch meshes into destructibles through a Dataflow template

Test: `job_gc_harden.py` records the Dataflow classes; the batch is not yet run. Status: not yet run
in Unreal.

Prerequisite: one template Dataflow per material, built by a human in the Dataflow editor or copied
from Content Examples 5.6 (Caillaud's barrier: variables InputMesh, NumPieces, AnchorHeight,
InteriorMaterial; Static Mesh To Collection, Uniform Fracture, internal-face selection with UV and a
distance-to-surface bake, anchoring subgraph with Set Anchor State from a bottom box, Proximity,
leaf and root convex generation and simplification, Geometry Collection Terminal; t_jyTILDYo8
[00:24:31]-[00:34:05]). 5.8 also offers a default Dataflow template at asset creation.

```python
import math
template = V.load("/Game/Destruction/DF_Concrete")
for mesh_path in mesh_paths:
    mesh = V.load(mesh_path)
    gc = ...   # create the GC asset: Fracture Mode "New" or an AssetTools factory [verify: probe lists factories]
    gc.set_dataflow_asset(template)                               # doc-listed setter
    ext = mesh.get_bounding_box().max - mesh.get_bounding_box().min
    volume_m3 = (ext.x * ext.y * ext.z) / 1e6
    pieces = max(8, min(120, int(40 * volume_m3)))                # density rule, not a fixed count (Xiao Yue [00:33:13]); constants [added]
    ov = dict(gc.get_editor_property("overrides") or {})
    ov.update({"NumPieces": str(pieces), "AnchorHeight": "20"})   # overrides Map[str, str]; which field carries 5.6 variables [verify]
    gc.set_editor_property("overrides", ov)
    # regenerate: discover with [n for n in dir(unreal) if "Dataflow" in n]; the speaker says the Utility Blueprint API
    # is exposed to Python (t_jyTILDYo8 [00:39:50]) [verify function name]
    V.asset_subsystem().save_loaded_asset(gc, only_if_is_dirty=False)
```

Interior faces are part of the recipe, not an afterthought: select internal faces (or Select by
Attribute), assign the interior material, add a UV channel unwrapped on those faces only, and bake
the distance to the external surface into a texture through a Texture terminal next to the GC
terminal, so broken faces read as thick material, not a painted shell (Caillaud t_jyTILDYo8
[00:28:21]-[00:30:19], [00:34:05]; Xiao Yue's auto UV and bake tools in Fracture Mode, zFiHDRREv7E
[00:07:15]; render-only embedded geometry such as rebar adds depth [00:07:49]). Selections must be
procedural (by attribute, box, level), because painted selections break when the mesh changes
([00:19:13]). A late "halve the rigid bodies" request is a variable change plus regenerate, not a
rework ([00:05:24]). GC To Collection chains a crude low-end GC into a finer high-end one
([00:26:43]).

## D3. Physical materials as the control surface

Test: `test_vfx_offline.py::TestPlanning::test_destruction` (`physmat_check`, offline, passed).
Creation not yet run.

Create three to six `PhysicalMaterial` assets (stone, concrete, wood, glass, metal) and tune the
whole game's destructibles through them (Lego Fortnite practice, Van Allen [00:27:58]):

```python
tools = unreal.AssetToolsHelpers.get_asset_tools()
pm = tools.create_asset("PM_Concrete", "/Game/Destruction", unreal.PhysicalMaterial, unreal.PhysicalMaterialFactoryNew())  # factory [verify]
log = {}
for k, v in {"density": 2.3, "friction": 1.0, "restitution": 0.02}.items():   # g/cm3; property names [verify]
    V._set(pm, k, v, log)
# friction combine Max and the destruction damage threshold multiplier / tensile strength: names [verify with dir(pm)]
print(log, V.physmat_check(2.3, 1.0, 0.02, "Max"))
```

Density is g/cm3: stone 2, not 2000; when a sim "goes crazy", check the density first ([00:26:11]).
"Your eyes will lie to you": check the numbers ([00:28:32]). With Material Strength and Connectivity
(D1), the physical material's tensile strength sets every threshold (contact area x tensile
strength, Xiao Yue [00:20:27]); set it here (`strength.tensile_strength` on the asset [verify with
dir(pm)]) and `gc_facts` reads it back for `gc_verdict`.

## D4. Break test gym with a scripted hit (PIE)

Test: none automated yet. Status: not yet run in Unreal.

Gym level: the wall on a floor, a fixed camera, a turret Blueprint or the call below.

```python
plan = V.strain_plan([500000.0, 50000.0, 5000.0], projectile_speed=2000.0, reference_speed=2000.0)
V.console("t.OverrideFPS 60", pie=True)          # fixed 60 fps review in PIE (McAdams and Monson [00:29:57]) [verify]
V.console("stat unit", pie=True)
gc_actor = [a for a in unreal.GameplayStatics.get_all_actors_of_class(V.world(True), unreal.GeometryCollectionActor)][0]
gc_comp = gc_actor.get_component_by_class(unreal.GeometryCollectionComponent)
print(V.apply_strain(gc_comp, (0, 0, 150), plan["strain"], radius=plan["radius"],
                     breaking_velocity=(-plan["breaking_linear_velocity"], 0, 0)))    # names and order [verify]
# as a latent job (ue_run mode="latent"): LevelEditorSubsystem.editor_request_begin_play(), yield until
# V.world(True) is not None, apply the strain, then for t in (0, 0.1, 0.5, 2, 10): yield the wait in seconds,
# req = ue_review.screenshot(path, 1280, 720); yield from ue_review.wait_screenshot(req)
```

Record the frame series (Insights or a CSV profile, parsed by `ue_stat`) and judge
`V.destruction_run_verdict(frame_ms, break_index, budget_ms=16.67)`: break-frame spike, frames over
budget, recovery frames (Xiao Yue's recovery criterion [00:27:36]). Record the break in the Chaos
Visual Debugger (active bodies, contacts; record only the channels you need, files grow fast,
[00:35:13]); CVD console commands [verify]. In gameplay (scenario-unreal-gameplay), the projectile
does the same two calls on hit, scaled by speed, plus collision for must-break objects (a gate)
because fast objects can tunnel (Van Allen [00:31:57]). 5.7 `FindLeafTransformByLineTrace` returns
the exact leaf a trace hits, for decals or strain on the right piece.

## D5. Density soak and piece-count gym

Test: none automated yet. Status: not yet run in Unreal.

Place N copies (the level designer's real count, Caillaud's 32 [00:02:24]) with
`V.actor_subsystem().spawn_actor_from_object(gc, loc)`, break them all, record frame time. Repeat
with the piece-count variable at 10, 50, 100 and keep the highest that holds the budget (t_jyTILDYo8
[00:35:12]). Order of fixes when over budget: Nanite and root proxy; Remove on Break timers and Tiny
Geo; one-way debris and simple leaf proxies (boxes under 0.3 relative size, one convex per cluster);
throttles (clusters broken per frame, Project Settings since 5.6) last, accepting that a burst
becomes a ripple.

## D6. Per-platform debris lifetime and throttles

Test: none. Status: not yet run in Unreal.

Find the removal-timer multiplier and throttle cvars in the probe's console names (filter Removal,
Chaos, GeometryCollection) rather than trusting remembered names; since 5.6 several are Project
Settings. Put the multiplier in the low-end device profile (`Config/DefaultDeviceProfiles.ini`,
owned with scenario-unreal-performance) and soak on that profile (Van Allen [00:11:56]): one asset
ships on every PC tier, the low tier just clears debris sooner. Removal can be disabled per
component at runtime, for example for a cinematic instance ([00:12:29]).

Remove on Break itself (Fracture Mode trash-can tool, per bone or group; gui-paths.md): two random
min and max ranges, the delay after a piece breaks from its parent and the removal duration, so
pieces do not vanish in sync; turn on **Cluster Crumbling** so a cluster that lands unbroken
crumbles into its pieces instead of shrinking as one big chunk (Caillaud [00:08:39]-[00:10:17]). It
is the per-piece tool Caillaud prefers; Remove on Sleep is the per-asset "little sister" (3 s
example) and the only one settable from Python (D1, with `automatic_crumble_partial_clusters`).
Whether a Dataflow node sets Remove on Break is [verify]. Hide the shrink with dust from the NDC
debris listener (D7; Van Allen [00:37:03]).

## D7. Debris VFX through a Data Channel

Test: none. Status: not yet run in Unreal.

Van Allen's pattern [00:33:43]-[00:38:41]: gather piece data (ID, volume, mass, transform) in the
destructible's construction script; on the break or removal event remove the piece at once (Remove
on Break 0 / 0 for tiny pieces) and write an NDC entry; the NS_T_DebrisFill listener emits particles
that fill the missing volume, scaled by piece size, with smoke and debris colors from the material.
It skips the unstable first frames of interpenetration: 150 destructibles never went below 30 fps
(hardware not stated). The agent's part: `V.duplicate_template` of the listener (its own system,
`system_plan` enforces it), Effect Type NET_OneShot, an FX budget only with
`fx.Budget.AdjustedUsageDecayRate` set and `budget_oscillation` clean on the break stress run (V3;
Kiraly [00:36:50]-[00:37:21]), colors and counts through the payload or User parameters, then V8 and
D4 on the result.

Prerequisites before Niagara can read a single break (Xiao Yue zFiHDRREv7E [00:08:42]-[00:09:16]):
**Chaos data generation enabled in Project Settings** (GUI or DefaultEngine.ini [setting name
verify]) **and** event notification (breaks, optionally collisions and removals) on each GC
component that should report:

```python
print(V.enable_break_events(gc_comp, breaks=True))      # set_notify_breaks / notify_breaks [verify]; not yet run in Unreal
```

Without both, the listener and the Chaos data interface receive nothing and the effect silently
never spawns. The Niagara Chaos data interface then gives spawn position, inherited velocity,
normals, restitution and friction, filterable by surface type or physical material, one emitter per
surface ([00:10:30]-[00:11:03]). Gameplay hygiene on the same event: get the broken bone IDs and
switch only those bones to a debris collision profile so rubble does not block the player (Xiao Yue
[00:09:50]-[00:10:24]); a debris profile on the whole GC would let the player walk through the
intact wall.

## D8. Settle policy: sleep or disable, never sleep to hold

Test: `gc_recipe_verdict` keys `settle`, `debris_needs_wake`, `hold` (offline, passed). Field
placement not yet run.

- An intact structure is held by anchors or kinematic bones, never by sleep ("just don't sleep", Van
  Allen [00:23:40]-[00:24:35]).
- Settled debris: a sleep field just above the ground with a custom velocity threshold stops solver
  updates until something hits the pieces again, with less jitter; if the pieces never need to wake
  or pile up, **disable** them instead, it performs better (Xiao Yue [00:27:36]-[00:28:45]).
  Disabled bodies never wake, sleeping ones wake on contact, Kill removes at once (Chaos docs, Sleep
  and Disable).
- Engine field Blueprints: `FS_SleepDisable_Generic` (Engine/Content/EditorResources/FieldNodes;
  gui-paths.md). Doc examples: sleep threshold 2 versus 50, disable threshold 2 versus 200 (higher
  is more aggressive); use the field's Debug option to see which pieces it caught.
- Measure recovery after the collapse (`destruction_run_verdict`): fewer awake bodies means the
  frame rate comes back faster (Xiao Yue [00:27:36]).

---

## W1. Worked order for U7 (fireball, trail, impact, shattering wall; PC, 60 fps)

The same order serves any projectile ability plus destructible (a frost bolt shattering an ice
pillar, a rocket through a wooden gate); only the classes, materials and numbers change.

1. V0 probe; gameplay numbers (collision radius, damage radius, speed, fire rate, max simultaneous,
   cast animation timing).
2. V1 classify, V1b group into systems. U7 result, one Effect Type per system:

   | System                       | Effect Type                                 | Critical emitters                    | Scalability Mode Self                                   | Spawn                                |
   | ---------------------------- | ------------------------------------------- | ------------------------------------ | ------------------------------------------------------- | ------------------------------------ |
   | NS_Fireball                  | NET_OneShotCritical                         | head (stateless if modules fit, CPU) | ribbon trail (stateful), dark wisps, embers (stateless) | pooled, attached to the projectile   |
   | NS_FireballImpact            | NET_OneShotCritical                         | flash, damage ring on `User.Radius`  | smoke, sparks (CPU for small counts)                    | pool Auto Release                    |
   | NS_ImpactListener (optional) | NET_OneShot                                 | none                                 | all                                                     | NDC Islands when hits come in bursts |
   | NS_WallDebris (NDC listener) | NET_OneShot, budget only with decay damping | none                                 | all                                                     | Chaos break events                   |

3. V15 timing plan: hand glow spawned from the cast animation (wind-up, ends at release), the head's
   travel, flash on the hit frame, then sparks and debris, then smoke, gone inside the window;
   `strobe_risk` at 2000 cm/s gives the head stretch.
4. V2b templates (GUI once, if the project has none), V2 duplicates and `fixed_bounds_check` for the
   trail; V3 Effect Types and `budget_verdict`; V5 textures and `audit_vfx_textures`; V13 flipbook
   checks; materials from scenario-unreal-materials.
5. V7 and V8 on the impact at gameplay distance: flash peak at the hit frame, ring edge on
   `User.Radius`, smoke gone inside the window, core near white, fringe saturated, saturation under
   values, accent at the impact point, size classes held. On the projectile: head brightest and
   stretched along travel, dark wisps behind, dim trail, no strobing. V16 for any failing row; the
   color-blind capture over the level's grass.
6. D0 source audit, D2 or Fracture Mode for `GC_Wall` (concrete noise and grout, interior bake), D1
   with one damage model, D3 materials (tensile strength for MSC), D6 removal and crumbling, D8
   settle policy, D4 gym break with strain scaled by projectile speed, D7 debris with break events
   on.
7. V9 crowd, V11 scalability, V10 fixed scenario on the target core count with `lever_check` before
   each change and `budget_oscillation` for the debris type; iterate one lever per pass.
8. Deliver the budget sheet and the scenario to scenario-unreal-performance; captures and
   `vfx_report.json` to the lead for review.
