# Procedures (Editor Python and ue_materials, full code)

**Status of every block: not yet run in Unreal** (UE 5.8 not installed on 2026-09-24). Each block
starts with `# test: <id>`. `tests/code/unreal-materials/run_procedure_snippets.py` extracts these
exact blocks and runs them in order in one namespace:

- offline against `fake_unreal.py` (done 2026-09-24): proves the Python logic only, never UE
  behavior;
- in UE, as a headless job through scenario-unreal-expert's
  `ue_run.run_python(uproject, ".../run_procedure_snippets.py", args=["--out", OUT])`: pending.
  Blocks tagged `live-editor` need a ticking editor with a viewport and are skipped headless; blocks
  tagged `agent-side` drive a live editor from outside and are skipped by the runner.

Deeper tests of the same functions (P16 and P17 were added on 2026-09-24 after the blind grade U2):
`test_ue_materials_offline.py` (pure layer, stdlib) and `test_editor_layer_fake.py` (in-editor layer
on the fake). When the probe (P0) contradicts a name here, fix `ue_materials.CANDIDATES` and this
file together.

**Channels** (owned by scenario-unreal-expert): headless
`UnrealEditor-Cmd <uproject> -run=pythonscript -script=<file>` loads no level and does not tick, so
it builds, imports, audits and lints, but cannot screenshot or time frames. A live editor (Epic's
5.8 MCP server first, `ue_remote.PythonRemote` otherwise) does captures, view modes and GPU timing.

**Context the blocks assume:** `OUT` (absolute output folder), `PROJECT_DIR` (folder of the
`.uproject`), `SAMPLE_PNGS` (three grayscale PNGs; the runner writes them). In your own job, define
them first.

## P0. Session: import path and API probe

Why: every UE class, pin and property name in this skill is a first guess; the probe lists what 5.8
really exposes before anything is built (the Substrate and Toon class names in particular, digest
P1).

```python
# test: P0_probe
# status: not yet run in Unreal; offline: run_procedure_snippets.py on fake_unreal (logic only)
import json, os, sys
SKILLS = os.environ.get("UE_SKILLS", os.path.expanduser("~/.claude/skills"))
for p in (os.path.join(SKILLS, "scenario-unreal-materials", "scripts"), os.path.join(SKILLS, "scenario-unreal-expert", "scripts")):
    if p not in sys.path:
        sys.path.append(p)
import unreal
import ue_materials as um

KIT = "/Game/Kit/Materials"
probe = um.probe(os.path.join(OUT, "probe_materials.json"))
print("engine", probe["engine"], "| r.Substrate", probe["cvars"].get("r.Substrate"))
print("slab pins", probe["slab_inputs"])
print("expression keys with no class (fix CANDIDATES['expr']):", sorted(k for k, v in probe["classes"].items() if not v))
print("MaterialEditingLibrary functions absent:", sorted(k for k, v in probe["mel"].items() if not v))
print("Substrate/Toon classes:", [c for c in probe["substrate_toon_classes"] if "Toon" in c])
```

Check: `probe_materials.json` exists; `slab_inputs` lists Diffuse Albedo, F0, F90...; `list_shaders`
present (5.8). Record corrections in `CANDIDATES`.

## P1. Substrate state and the GBuffer decision

Why: new 5.8 projects have Substrate on with Blendable; upgraded projects stay legacy until opted in
(Substrate overview, New Projects). Blendable is a ceiling for every platform, Adaptive a request
that falls back per platform, 20 to 80 B/px, about +15% cook, forced DBuffer decals (Ben Cloward
[P5I38f2O6W8 00:05:46, 00:06:54]; Morgan [SqPaL8HS_Lw 00:11:36]). Conversion of a material is
one-way.

```python
# test: P1_substrate_decision
# status: not yet run in Unreal; offline: fake (logic) + test_ue_materials_offline.py t_ini
ini = os.path.join(PROJECT_DIR, "Config", "DefaultEngine.ini")
text = open(ini).read() if os.path.isfile(ini) else ""
state = um.substrate_state(text)           # None = key absent: read the project's history
live = um.project_uses_substrate()          # the running engine's cvar
fmt, reasons = um.choose_gbuffer_format(["console60", "pc_mid"], needs=[])
print("ini:", state, "| cvar r.Substrate:", live, "| decision:", fmt, reasons)
for bpp in (16, 20, 80):
    print("%d B/px at 4K = %.0f MB" % (bpp, um.gbuffer_memory_mb(3840, 2160, bpp)))
CHANGE = False    # set True only after the decision is written down; restart the editor afterwards
if CHANGE:
    import shutil, time
    vdir = os.path.join(PROJECT_DIR, "versions", time.strftime("v%Y%m%d-%H%M%S DefaultEngine"))
    os.makedirs(vdir)
    shutil.copy2(ini, vdir)                 # version before overwrite
    with open(ini, "w") as f:
        f.write(um.set_ini_value(text, um.RENDERER_SECTION, "r.Substrate", "True"))
```

`choose_gbuffer_format` writes both facts into its reasons: Blendable caps every platform, SM6
included, so it is never the answer "for the weaker platform"; Adaptive already falls back to
Blendable where SM6 is missing (mat-upd 5.7; Ben [P5I38f2O6W8 00:06:54]). The GBuffer format key is
`r.Substrate.ProjectGBufferFormat` in this module's guess list [verify]: read it from a fresh 5.8
project's ini instead of typing it. Never set `r.Substrate` off once a material holds Substrate
nodes (P3 export shows `shading: substrate`).

## P2. Textures: pack, import, apply the role policy, check albedo

Why: samples are the budget, so pack grayscale maps that share UVs (Ben [-UZlUUQSGgQ 00:12:36]; Tech
Art Aid [y0QASid1v8w 00:56:35]); compression by role, sRGB only on color (Ben [h95X255NhOo
00:09:39]); a packed normal is never Normalmap (Ben [gjOO5g4cgng 00:11:02]); 2K ceiling in games
(Ben [gjOO5g4cgng 00:08:49]; Sumo [SAr7oPKsgLE 00:29:20]).

```python
# test: P2_textures
# status: not yet run in Unreal; offline: fake + t_check_texture, t_stats_and_packing
orm = um.pack_channels(os.path.join(OUT, "T_Panel_ORM.png"),
                       {"R": (SAMPLE_PNGS[0], 0), "G": (SAMPLE_PNGS[1], 0), "B": (SAMPLE_PNGS[2], 0)})
stats = um.albedo_stats(um.read_png(SAMPLE_PNGS[1]), rough=True)   # run on base color sources
print("albedo check (sRGB floor 50 rough / 20 smooth, ceiling 240, metals >= 180):", stats["pass"], stats)
imported = um.import_textures([orm], "/Game/Kit/Textures")          # AssetImportTask, automated, saved
report = um.audit_textures("/Game/Kit/Textures", apply=True, profile="console60")
print(um.summarize(report["findings"]), report["fixes"])
with open(os.path.join(OUT, "texture_audit.md"), "w") as f:
    f.write(um.to_markdown(report["findings"], "Kit textures"))
```

Roles come from suffixes (`um.role_for`): `_BC` color BC1 (BC7 only when BC1 bands), `_N` Normalmap
BC5, `_ORM` Masks (BC7 when the packed channels are unrelated masks), `_NOH` and `_CR` BC7, `_H`
Grayscale, `_E` emissive, `_HDR` HDR Compressed (BC6H, 8x smaller than RGBA16F). Rename or pass
`role_overrides` for anything else. Platform sizes come from texture LOD groups in
`DefaultDeviceProfiles.ini`, not resized sources (textures doc). Judge RDO artifacts with Editor
Show Final Encode on (the editor shows Fast encodes; textures doc); RDO changes disk size, not
memory.

More texture rules the audit reports:

- The Sampler Type of every sample must match its texture's compression; P3 cross-checks the graph
  against these settings (`lint_graph(..., textures=...)`, rule `sampler_type_mismatch`); Clean
  Graph > Fixup Mismatched Samplers (5.7) repairs it by hand (Ben [h95X255NhOo 00:16:54]; mat-upd).
- Normal maps keep Normalize after making Mips (`normal_mips_flatten` when off). Where distant
  panels still shimmer, Composite Texture on the roughness map moves the lost normal variance into
  roughness (textures doc, Compositing Settings).
- The Alpha compression setting keeps only A: author that data in alpha and sample A
  (`texture_alpha_only`; Ben [h95X255NhOo 00:13:03]). In a 4-channel mask, put the most important
  channel (roughness) in alpha [00:08:33].
- ID textures for value-clamped masks (P3 options): paint each region at `um.id_band_value(band)` (4
  bands per channel), sRGB off, and check painted texels with `um.id_band_from_texel` before import.

## P3. The kit master (opaque surface: metal, paint, wear, dirt)

Design. Textures BaseColor, Normal, ORM, Masks (R edge, G cavity, B paint ID), a tiling Grunge and a
DetailNormal, all Shared: Wrap.

- `Wear = saturate((edge + (grunge - 0.5) x Breakup - (1 - (WearAmount + CPD0))) x Sharpness) x PaintMask`,
  with `PaintMask = If(PaintFromVertexColor > 0.5: vertex G, else Masks.B)` (an If: both inputs are
  cheap, Lauf [wobQ8ZKQpbc 00:40:24]).
- `Dirt = saturate(cavity x DirtCavity + (1 - AO) x DirtAO + grunge - 0.5) x (DirtAmount + CPD1)`.
- `Specular = 0.5 x (1 - cavity)`: specular occlusion in crevices (Ben [fePsD_8p9vM 00:14:25]:
  "create a crevice map and then multiply it by 0.5"; PBR doc Cavity Maps); Masks.G is 1 in crevices
  here [added convention]. Through the Metalness helper it dims F0 in crevices. Ben calls it subtle
  and optional on terrain [0L5Azq6ugyo 00:08:39].
- Switches: UseWear (gates Masks and Grunge, and picks the specular occlusion) and UseDetailNormal.
  Per-actor variation: Custom Primitive Data 0 WearOffset, 1 DirtOffset.
- Substrate: the Metalness helper feeds the base slab (dirt lerps albedo, F0 toward 0.04 and
  roughness before the slab); a bare-metal slab takes albedo 0 and a measured F0 (iron 0.56); a
  Horizontal Blend with Use Parameter Blending takes Mix = wear. Parameter blending makes it one
  slab everywhere (Morgan [SqPaL8HS_Lw 00:37:35]), so WearSharpness is an art control, not a cost
  lever; `um.mask_cost` matters only for a blend without parameter blending on Adaptive [00:29:38].
  Legacy: the same masks drive root lerps.

```python
# test: P3_kit_master
# status: not yet run in Unreal; offline: fake + test_editor_layer_fake.py t_kit_substrate
path = KIT + "/M_Kit_Surface"
if unreal.EditorAssetLibrary.does_asset_exist(path):
    master = unreal.EditorAssetLibrary.load_asset(path)       # reuse; version before rebuilding
else:
    master, info = um.build_kit_surface(path)                 # substrate=None follows r.Substrate
    assert not info["failed_links"], info["failed_links"]     # each entry lists the pins that exist
graph = um.export_graph(master)
with open(os.path.join(OUT, "M_Kit_Surface.graph.json"), "w") as f:
    json.dump(graph, f, indent=1, default=str)
used = {}                                                   # textures the graph samples: sampler cross-check
for n in graph["nodes"].values():
    t = n["props"].get("texture")
    if t and unreal.EditorAssetLibrary.does_asset_exist(t):
        used[t] = um.texture_props(unreal.EditorAssetLibrary.load_asset(t))
BUDGETS = {"texture_samples": 12}                           # project decision [added]; add 'transcendentals' once set
findings = um.lint_graph(graph, profile="console60", expected_usage={"used_with_nanite"},
                         textures=used, budgets=BUDGETS, cvars=probe["cvars"])
print(um.to_markdown(findings, "M_Kit_Surface"))
print("cost census:", um.cost_census(graph))
print("stats (context, not the verdict):", um.material_stats(master), "| shaders:", um.shader_count(master)[0])
```

Gate: no fail or warn in the lint (no `sampler_type_mismatch`); `substrate_closures` 1; samplers 6
of 16, all Shared: Wrap; every `function_not_expanded` resolved by opening the function, summing its
samples and transcendentals and recording `function_samples` on the export (Tech Art Aid
[y0QASid1v8w 00:21:22]). If a pin name fails, `info["failed_links"]` carries the available input
names: fix `CANDIDATES["pin"]`.

Options (same master behind a texture-gating switch, or a sibling master):

- **Value-clamped ID masks** instead of a binary paint ID: one channel carries 4 value bands (8 at
  most), so one RGB mask gives 16 masks with sharp edges that cannot overlap (Sumo [SAr7oPKsgLE
  00:14:54, 00:15:59]); signed channel weights build virtual masks [00:17:05]. In the graph: two If
  nodes per band on the already fetched channel, no extra sample (`um.id_band_mask` is the reference
  math).
- **World-aligned texture and normal** across modular seams, when pieces snap vertex to vertex: two
  sets at 64 and 48 world units per tile blended by Fast Gradient 3D noise (scale 0.01, levels 5, x4
  then saturate) (Ben [pXOknekvmwE 00:05:03, 00:08:57, 00:12:57]). World Aligned Texture takes a
  Texture Object and samples 3 times per texture (`cost_census` counts 3 per call) [added], so two
  sets of color and normal cost 12 samples: use packed textures, or bake.
- **World-space directional blends**: dust or snow on up-facing surfaces, a water line, north-facing
  moss, from the world normal and height, with a textured falloff rather than a feathered edge (Sumo
  [SAr7oPKsgLE 00:20:11, 00:21:16]).

## P4. Glass, screen and decal masters

Why: blend mode and domain cannot change per instance without new shaders, so each gets its own
master [added, consistent with HSPR guidance]. Glass is Ben Cloward's Substrate recipe
[sf-K257zWh8]: flat panes use Pixel Normal Offset; Gray Transmittance when untinted. Decals end in
Convert To Decal (Substrate overview, Extras).

```python
# test: P4_glass_screen_decal
# status: not yet run in Unreal; offline: fake + t_other_masters
built = {}
for name, fn in (("M_Kit_Glass", lambda p: um.build_glass(p, flat=True, tinted=True)),
                 ("M_Kit_Screen", um.build_screen),
                 ("M_Kit_Decal_Grime", lambda p: um.build_decal(p, "grime")),
                 ("M_Kit_Decal_Seams", lambda p: um.build_decal(p, "normal"))):
    p = KIT + "/" + name
    built[name] = unreal.EditorAssetLibrary.load_asset(p) if unreal.EditorAssetLibrary.does_asset_exist(p) else fn(p)[0]
for name, mat in built.items():
    f = um.lint_graph(um.export_graph(mat), profile="console60", shape="flat" if "Glass" in name else None)
    print(name, um.summarize(f))
glass, screen, grime = built["M_Kit_Glass"], built["M_Kit_Screen"], built["M_Kit_Decal_Grime"]
```

Frosted panels also need Project Settings > Rendering > Substrate > "Substrate translucent material
rough refraction" (distortion pass costs more; ini key [verify]). Decal masters come out with Used
with Static Mesh off (`build_decal(..., mesh_decal=False)`).

Screens: keep emissive intensity calibrated against the lighter's exposure (handoff to
scenario-unreal-lighting-rendering). Keep scanline, flicker and scroll math independent of the
Content sample so it runs inside the fetch latency (Tech Art Aid [y0QASid1v8w 00:46:03]); HDR screen
content as HDR Compressed (BC6H). Scrolling text that smears under TSR: the Temporal Responsiveness
node (5.7, experimental, costly), masked to the text region. It needs
`r.Velocity.TemporalResponsiveness.Supported=1` (the article names BaseWindowsEngine.ini
`[/Script/Engine.Renderer]` or ConsoleVariables.ini; the Mac location [verify]),
`recompileshaders all` before 5.7.1, and a small WPO on Nanite meshes; levels above 0 to 0.5 give
medium history rejection, above 0.5 full; check with `r.TSR.Visualize 3` (mat-upd 5.7).
`lint_graph(..., cvars=probe["cvars"])` flags the missing cvar (`tr_cvar_off`) and a Nanite material
without WPO (`tr_nanite_needs_wpo`). Class name [verify] with P0.

## P5. Approved presets, child instances, per-actor variation

Why: permutations are usage flags x unique static sets (Lauf [wobQ8ZKQpbc 00:23:50]); only preset
parents set switches, children change scalars, vectors and textures; variation per placed actor
through Custom Primitive Data costs no instance and no permutation (VTA [eBS3BOI5KnM 00:13:20]; Sumo
[SAr7oPKsgLE 00:18:11]).

```python
# test: P5_presets_instances
# status: not yet run in Unreal; offline: fake + t_instances_census_usage
PRESETS = {"MI_Kit_Clean": {}, "MI_Kit_Worn": {"UseWear": True},
           "MI_Kit_Hero": {"UseWear": True, "UseDetailNormal": True}}
presets = {}
for name, sw in PRESETS.items():
    p = KIT + "/Presets/" + name
    presets[name] = (unreal.EditorAssetLibrary.load_asset(p) if unreal.EditorAssetLibrary.does_asset_exist(p)
                     else um.make_instance(master, p, switches=sw, allow_static=bool(sw)))
children = {"MI_Panel_Blue": (presets["MI_Kit_Worn"], {"WearAmount": 0.35, "WearSharpness": 16.0},
                              {"BareMetalF0": um.METAL_F0["aluminum"]}),
            "MI_Floor_Grey": (presets["MI_Kit_Clean"], {"RoughnessScale": 0.9}, {})}
for name, (parent, sc, vec) in children.items():
    p = KIT + "/" + name
    if not unreal.EditorAssetLibrary.does_asset_exist(p):
        um.make_instance(parent, p, scalars=sc, vectors=vec)
print(um.check_values({"base_color": um.METAL_F0["aluminum"], "metallic": 1.0}, "legacy", name="BareMetalF0"))
import random
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
for a in eas.get_all_level_actors():                       # CPD 0 WearOffset, 1 DirtOffset
    comp = getattr(a, "static_mesh_component", None)
    if comp is not None:
        um.set_cpd(comp, 0, random.uniform(-0.1, 0.1))
        um.set_cpd(comp, 1, random.uniform(-0.1, 0.2))
```

Save the level afterwards (`LevelEditorSubsystem.save_current_level()`) when CPD values were set on
placed actors.

## P6. Permutation census and switch ranking

Why: the count that matters is unique static sets per root, times the shaders of one set from 5.8
`ListShaders` (an upper bound; Nadro [wobQ8ZKQpbc 00:18:57]); Fortnite ranked switches by how many
instances set them [00:29:31].

```python
# test: P6_census
# status: not yet run in Unreal; offline: fake + t_permutations
res = um.census_project("/Game/Kit", budget_keys={KIT + "/M_Kit_Surface": 2})   # Worn and Hero
root = res.get(KIT + "/M_Kit_Surface", {})
print("MIs", root.get("mi_count"), "| unique static sets", root.get("unique_keys"),
      "| shaders (upper bound)", root.get("shaders_estimate"))
print(um.to_markdown(res["_findings"], "Permutation census"))
print("switch ranking:", res["_ranking"].get(KIT + "/M_Kit_Surface"))
with open(os.path.join(OUT, "census.json"), "w") as f:
    json.dump({k: v for k, v in res.items() if k != "_records"}, f, indent=1, default=str)
```

Gate: `unique_keys` within the approved preset count; no `static_override_at_default`; every
HSPR-tagged MI is a preset or has a written reason (an editable switch at default is still a
permutation risk, mat-upd 5.7).

A Quality Switch multiplies shader maps by the quality levels compiled:
`um.lauf_permutations(flags, keys, quality_levels=n)` (Nadro [wobQ8ZKQpbc 00:05:32]). Before adding
a switch, read `res["_ranking"]`: a function few instances set belongs in a duplicate or a sibling
master, not behind one more switch (Fortnite ranked every switch by the share of MIs setting it and
kept the top 10 [00:29:31]). The same count decides lean master vs Material Layering System: project
`lauf_permutations` for the planned presets and flags, and prefer a layer library when the material
library is large (Sumo [SAr7oPKsgLE 00:03:20]; instances doc).

## P7. Usage flags right-sizing (Fortnite's two passes)

Why: a flag on a parent adds a row of shaders to every unique child (Lauf [wobQ8ZKQpbc 00:24:25]);
derive needs from referencers, pin them on MIs, then clear the parent, or shipped assets fall back
to the default material [00:32:46, 00:37:09].

```python
# test: P7_usage_flags
# status: not yet run in Unreal; offline: fake + t_instances_census_usage
parent_flags = [k for k, v in um.usage_flags(master).items() if v and k != "used_with_static_mesh"]
needs = {}
for rec in res.get("_records", []):
    needs[rec["path"]], notes = um.usage_needs(um.referencers_of(rec["path"]))
parent_needs, _ = um.usage_needs(um.referencers_of(um._path(master)))
plan = um.plan_usage_changes(um._path(master), parent_flags, needs, parent_needs)
print(json.dumps(plan, indent=1))
APPLY = False    # pass 1 (MI overrides) on the release branch; pass 2 (parent) on main with QA runway
if APPLY:
    for mi_path, flags in plan["pass1"].items():
        mi = unreal.EditorAssetLibrary.load_asset(mi_path)
        for fl in flags:
            print(mi_path, fl, um.set_usage(mi, fl, True))
        unreal.EditorAssetLibrary.save_loaded_asset(mi)
    for fl in plan["pass2"][um._path(master)]:
        um.set_usage(master, fl, False)
    unreal.MaterialEditingLibrary.recompile_material(master)
    unreal.EditorAssetLibrary.save_loaded_asset(master)
```

Also: Project Settings > Engine > Rendering > Materials > "Automatically set Material usage flags in
editor default" off (Lauf [00:31:10]; ini key [verify]); UI materials from Content Browser >
Material > UI Material; Used with Static Mesh off on UI, Niagara-only, sprite and decal materials
(Nadro [00:18:38]; D-cost U2 application; lint rule `decal_static_mesh`), except a decal material
applied to mesh-decal geometry [added]. Before "optimizing" by deleting nodes: 5.8 compiles only
connected, non-zero outputs (`r.Material.UseShaderCompilationParameters`, default on; P0 reads it),
so a zero WPO or a PDO switched off adds no shaders (Nadro [00:13:13]); compare `shader_count`
before and after instead. Project-level levers, one at a time and only after measuring:
`r.SkinCache.CompileShaders=2` with `r.SkinCache.Allow=1` when every skeletal mesh already renders
through the skin cache (Fortnite's biggest win, 2,353 MB), and `slate.MaterialShaderMode=2` (hybrid)
for UI-heavy projects (Nadro [00:11:34, 00:14:19, 00:15:57]). `plan["missing"]` lists MIs that need
a flag nothing provides today: they already render the fallback, fix them first. Gate: the P10 board
shows no gray default material on any mesh type.

## P8. Static switch triage and conversion plan

Why: 282 switches in one Fortnite parent, many gating nothing but a tint or a UV channel (Lauf
[wobQ8ZKQpbc 00:28:18, 00:39:52]). Graph surgery by script is fragile: rebuild from a cleaned
template, then remap instances.

```python
# test: P8_switch_triage
# status: not yet run in Unreal; offline: fake + t_switch_heavy
g = um.export_graph(master)
triage = sorted(set((n["props"].get("parameter_name"),) + um.classify_switch(g, nid)
                    for nid, n in g["nodes"].items()
                    if n["class"] in ("MaterialExpressionStaticSwitchParameter", "MaterialExpressionStaticSwitch")))
for row in triage:
    print(row)


def remap(records, new_parent, converted, suffix="_v2"):
    """After a new parent turned the 'convert' switches into scalars (If: param into A, 0.5 into B,
    A > B / A < B pins; or an Enum-bound scalar, in the 5.7 release notes), recreate each MI with 1.0 / 0.0 values.
    Old MIs stay (never delete); swap references with the asset tools once the board passes."""
    made = []
    for rec in records:
        scal = {name: (1.0 if rec["static_switches"].get(name) else 0.0) for name in converted}
        made.append(um.make_instance(new_parent, rec["path"] + suffix, scalars=scal))
    return made
```

Static Component Mask Parameters become Channel Mask Parameters or dot(RGB, float3 param) then
saturate (Lauf [00:42:35]). Gate: P6 census shows fewer keys; P10 before/after captures of each
preset differ by less than the chosen threshold (`um.image_diff`).

## P9. GPU cost A/B on a fixed camera (agent-side, live editor)

Why: the instruction count is "often total nonsense" (Tech Art Aid [y0QASid1v8w 00:20:57]); the
verdict is measured ms on a fixed view. The editor must tick while frames are measured, so this runs
from the agent side against a live editor (Epic's MCP server is preferred; this uses
`ue_remote.PythonRemote`).

```python
# test: P9_cost_ab agent-side
# status: not yet run; needs a live editor with the P10 board in view. System python3 on the agent side.
import glob, os, time
import ue_remote
py = ue_remote.PythonRemote()
ASSIGN = ("import unreal\nm = unreal.EditorAssetLibrary.load_asset(%r)\n"
          "for a in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors():\n"
          "    if a.get_actor_label().startswith('Board_'):\n"
          "        a.static_mesh_component.set_material(0, m)\n")
py.exec("import ue_materials as um\nfor c in ('r.ScreenPercentage 100', 't.MaxFPS 0'): um.console(c)\n")
csvs = {}
for label, mi in (("worn", KIT + "/Presets/MI_Kit_Worn"), ("hero", KIT + "/Presets/MI_Kit_Hero")):
    py.exec(ASSIGN % mi)
    time.sleep(3.0)                                        # shaders compiled, streaming settled [added]
    py.exec("import ue_materials as um\num.console('CsvProfile Frames=300')\n")   # [verify command form]
    time.sleep(20.0)
    csvs[label] = sorted(glob.glob(os.path.join(PROJECT_DIR, "Saved", "Profiling", "CSV", "*.csv")))[-1]
import ue_stat
for label, path in csvs.items():
    frames = ue_stat.csv_frames(ue_stat.parse_csv_profile(path))
    print(label, ue_stat.summarize(frames, key="gpu"), ue_stat.budget_check(frames, 16.6, key="gpu"))
# Per-pass columns (BasePass, Translucency, DBuffer decals) need the GPU stat columns of 5.8 CSVs
# [verify names]; ProfileGPU or an Insights trace with the GPU channel gives the same split.
```

Record `material_stats()` and `um.cost_census(um.export_graph(mat))` next to the ms: samples,
independent vs dependent transcendentals and dependent reads explain a delta that the instruction
count cannot. On this Mac the Apple GPU is not GCN: Tech Art Aid's cycle table ranks costs, the ms
decide [added].

## P10. Review board, view modes and image checks (live editor)

Why: a material is judged in context under light, not in the preview; the board makes presets
comparable, and screenshots are checked for all-white or all-black frames before anyone looks
(scenario-unreal-expert's image_checks).

```python
# test: P10_review_board live-editor
# status: not yet run in Unreal; offline: fake (logic only)
board_mats = [KIT + "/Presets/MI_Kit_Clean", KIT + "/Presets/MI_Kit_Worn", KIT + "/Presets/MI_Kit_Hero",
              KIT + "/MI_Panel_Blue", KIT + "/M_Kit_Glass", KIT + "/M_Kit_Screen"]
board = um.spawn_board(board_mats, spacing=160.0)
shots = [um.capture(os.path.join(OUT, "board_lit.png"), 1920, 1080)]   # returns at once, file lands after ticks
with open(os.path.join(OUT, "board_shots.json"), "w") as f:
    json.dump(shots, f)
print("requested:", shots)
```

The captures land after the editor ticks, so check them from the agent side (system python3), then
look:

```python
# test: P10b_review_checks agent-side
# status: not yet run; agent side, after P10 in a live editor
import json, os
import ue_review
shots = json.load(open(os.path.join(OUT, "board_shots.json")))
for s in shots:
    ue_review.wait_for_file(s, timeout=60)
rep = ue_review.review_images(shots, sheet=os.path.join(OUT, "board_sheet.png"))
print(rep)                  # all_white / all_black / uniform flags first, then open the sheet
```

Switch the viewport mode between requests in separate calls
(`um.console("viewmode shadercomplexity")`, request, let it tick, `um.console("viewmode lit")`): a
mode change and a capture in the same script see the same frame. Add captures in the Substrate view
modes (Material Count, Material Classification; viewport View Modes > Substrate, console form
[verify]) and the buffer visualizations Base Color, Roughness, Specular, Metallic
(`r.BufferVisualizationTarget` [verify]). Shader Complexity is instruction-count based: a coarse
hint, never proof (mat-upd; Tech Art Aid). For a fallback-material check after P7, repeat the board
with one mesh of each type (static, Nanite, skeletal, cloth, Niagara mesh) per affected MI. For
glass and other translucency, one Shader Complexity or Quad Overdraw capture shows overdraw only
(pbr doc).

When a Substrate material looks or costs wrong, open Window > Substrate in its Material Editor
before touching the graph: it lists every feature in the order the project's format will downgrade
it and previews the parameter-blending result (Morgan [SqPaL8HS_Lw 00:12:51, 00:38:43]). GUI only: a
computer-use agent or a human reads it (gui-paths.md).

## P11. Landscape RVT setup and writer hygiene

Why: cache the heavy landscape material in an RVT (Ben [ucuSaiDuqiM 00:27:53]); size the volume to
the area that matters; landscape sort priority -1, Num LODs 0, static writers, write-only writers
without collision (RVT doc; PrismaticaDev [RLEPA16QDRw 00:51:42]).

```python
# test: P11_landscape_rvt
# status: not yet run in Unreal; offline: fake + t_textures_rvt_board, t_landscape_rvt
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
lands = [a for a in eas.get_all_level_actors() if a.get_class().get_name() in ("Landscape", "LandscapeStreamingProxy")]
if lands and not unreal.EditorAssetLibrary.does_asset_exist("/Game/Terrain/RVT_Landscape"):
    print(um.setup_landscape_rvt(lands[0], "/Game/Terrain/RVT_Landscape", "BASE_COLOR_NORMAL_SPECULAR", 256, 256))
writers = [{"name": a.get_name(), "is_landscape": True,
            "sort_priority": um._get(a, "translucency_sort_priority", 0),
            "num_lods": um._get(a, "virtual_texture_num_lods"),
            "rvts": [um._path(r) for r in (um._get(a, "runtime_virtual_textures", []) or [])]} for a in lands]
print(um.to_markdown(um.check_rvt_writers(writers), "RVT writers"))
print("prime tiling scales (cm per tile):", um.prime_scales([300, 400, 600, 900]))
```

Then wire the landscape material: its result into Runtime Virtual Texture Output (world-space
normals: transform tangent to world before writing, world to tangent after reading; PrismaticaDev
[00:31:58]) and a Runtime Virtual Texture Sample (Virtual Texture assigned) into the main pass. This
graph step is GUI or template work. Lint the landscape material with
`um.lint_graph(um.export_graph(mat), target_layers=[...])`: it catches write-pass hazards (Time,
Panner, camera, parallax, MPC upstream of the output), unassigned samples, more than two RVTs,
all-height layer blends and layer names with no target layer. Large worlds: stream low mips as an
SVT and rebuild after any RVT change (Build > Build Virtual Textures; a stale SVT is disabled in
game, RVT doc). Gate: `stat gpu` VirtualTextureUpdate near idle on a still camera; near, mid and far
screenshots.

## P12. Toon BSDF material (5.8, experimental)

Why: the 5.8 Substrate Toon BSDF bands per light (color, multiple lights, sky, Lumen) on the
Blendable path; the ramp lives in a Toon Profile asset (Pitchfork [iMJJYXHMw4o 00:02:00, 00:07:02];
rn58). Class names are unknown until the probe: the block adapts.

```python
# test: P12_toon
# status: not yet run in Unreal; offline: fake (logic only; the fake has no Toon Profile class)
tp = KIT + "/M_Toon"
if not unreal.EditorAssetLibrary.does_asset_exist(tp):
    toon_mat = um.new_material(tp)
    g = um.Graph(toon_mat)
    toon = g.node("toon", 0, 0)
    g.link(g.vector("BaseColor", (0.5, 0.5, 0.5), -500, -200, "Toon"), "", toon, "Base Color")
    g.link(g.scalar("Metallic", 0.0, -500, -80, "Toon"), "", toon, "Metallic")
    g.link(g.scalar("Specular", 0.5, -500, 40, "Toon"), "", toon, "Specular")
    g.link(g.scalar("Roughness", 0.5, -500, 160, "Toon"), "", toon, "Roughness")
    g.out(toon, "", "MP_FRONT_MATERIAL")
    profile = None
    profile_cls = next((getattr(unreal, n) for n in ("ToonProfile", "SubstrateToonProfile") if hasattr(unreal, n)), None)  # [verify]
    if profile_cls is not None:
        try:
            profile = unreal.AssetToolsHelpers.get_asset_tools().create_asset("TP_Kit", KIT, profile_cls, None)
            um._set(toon, ["toon_profile", "profile"], profile)
        except Exception as e:
            print("Toon Profile creation needs its factory [verify]:", e)
    print(g.finish(), "| profile:", profile)
    print(um.check_values({"metallic": 0.0, "roughness": 0.5, "specular": 0.5, "toon_profile": profile}, "toon", name="M_Toon"))
```

Profile values to set once the property names are known (Pitchfork): Diffuse Indirect Scale 1 (Lumen
response), Diffuse Ramp Includes Shadow on, Specular Indirect Scale 0 (removes the back-side glow),
Shadow Extinction 10, ramp offset noise strength about 0.025. Instances: metallic at most 0.8 to
0.9, roughness at least 0.35 on metals (reflections are not banded), no AO. Pattern UVs from the
triplanar dithered node in pre-skinned space (coordinate 3) for characters [verify node name].

## P13. Post-process EV cel shading (whole-world look)

Why: Visual Tech Art quantizes exposure values, not luminance, before the tonemapper, so the
stylization never changes scene brightness [eBS3BOI5KnM 00:18:18, 00:18:52]; max component, not
desaturation [00:05:38]. The HLSL is a translation of his graph [added]; his smooth step is a custom
curve, smoothstep stands in.

```python
# test: P13_pp_cel_ev
# status: not yet run in Unreal; offline: fake (logic only)
HLSL = r"""
float3 lightRGB = Scene / max(Base, 1e-4);
float v = max(lightRGB.r, max(lightRGB.g, lightRGB.b));
float3 hue = lightRGB / max(v, 1e-6);
float ev = log2(max(v, 1e-6)) * Bands;
float s = smoothstep(0.5 - Softness, 0.5 + Softness, frac(ev));
float vq = exp2((floor(ev) + s) / Bands);
float isSky = step(max(Base.r, max(Base.g, Base.b)), 1e-4);
return lerp(hue * vq * Base, Scene, isSky);
"""
pp_path = KIT + "/M_PP_CelEV"
if not unreal.EditorAssetLibrary.does_asset_exist(pp_path):
    pp = um.new_material(pp_path)
    um._set(pp, "material_domain", unreal.MaterialDomain.MD_POST_PROCESS)
    loc = um._enum_value("BlendableLocation", ["BL_SCENE_COLOR_AFTER_DOF", "BL_BEFORE_TONEMAPPING"])  # [verify]
    if loc is not None:
        um._set(pp, "blendable_location", loc)
    g = um.Graph(pp)
    custom = g.node("custom", -200, 0, code=HLSL)
    ci = getattr(unreal, "CustomInput", None)                     # [verify struct and field names]
    if ci is not None:
        ins = []
        for n in ("Scene", "Base", "Bands", "Softness"):
            x = ci()
            x.set_editor_property("input_name", n)
            ins.append(x)
        um._set(custom, "inputs", ins)
    scene = g.node("scenetex", -700, -100)
    base = g.node("scenetex", -700, 100)
    sid = getattr(unreal, "SceneTextureId", None)
    if sid is not None:
        um._set(scene, "scene_texture_id", getattr(sid, "PPI_POST_PROCESS_INPUT0", None))
        um._set(base, "scene_texture_id", getattr(sid, "PPI_BASE_COLOR", None))
    g.link(scene, "Color", custom, "Scene")
    g.link(base, "Color", custom, "Base")
    g.link(g.scalar("Bands", 1.0, -700, 300, "Cel"), "", custom, "Bands")
    g.link(g.scalar("Softness", 0.1, -700, 400, "Cel"), "", custom, "Softness")
    g.out(custom, "", "MP_EMISSIVE_COLOR")
    print(g.finish())
```

Assign it to an unbound Post Process Volume (`unbound = True`, blendables array [verify struct]).
Gates: mean log2 luminance of captures with and without the material stay close (exposure
unchanged); bands follow a sun sweep at three elevations; the sky is left unquantized; eye
adaptation off when a stepped sky is used (Chris Murphy [exMzwH7EJUY 00:09:39]); outlines run before
AA ("Scene Color After DOF") or they shimmer [00:22:31]. Unlike this global pass, the Toon BSDF
(P12) keeps per-light control: the deciding condition is whole-world look versus per-asset banding.

## P14. Decal placement and receivers

Why: DBuffer decals are the UE5 default (and forced on Adaptive); enable Decal Response only on
receivers and channels in use; characters walking through decal volumes do not receive; mesh decals
are expensive in the path tracer (decal doc; Substrate overview).

```python
# test: P14_decals
# status: not yet run in Unreal; offline: fake (logic only)
dmi_path = KIT + "/MI_Decal_Grime_A"
dmi = (unreal.EditorAssetLibrary.load_asset(dmi_path) if unreal.EditorAssetLibrary.does_asset_exist(dmi_path)
       else um.make_instance(grime, dmi_path, scalars={"OpacityScale": 0.8, "DecalRoughness": 0.85}))
eas = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
decal = eas.spawn_actor_from_class(unreal.DecalActor, unreal.Vector(0, 0, 0), unreal.Rotator(pitch=-90.0))  # projects along X [verify]
decal.set_decal_material(dmi)
comp = decal.decal
um._set(comp, "decal_size", unreal.Vector(64, 128, 128))
um._set(comp, "sort_order", 1)             # distinct values on overlapping decals: DBuffer-expression decals do not blend
um._set(comp, "fade_screen_size", 0.01)
chans = um.decal_channels(um.export_graph(grime)) | um.decal_channels(um.export_graph(built["M_Kit_Decal_Seams"]))
resp = um.decal_response_for(chans)                             # union of what the decals landing on the kit write
print("kit receivers' Decal Response:", resp)
mdr = getattr(unreal, "MaterialDecalResponse", None)            # [verify enum and property]
if mdr is not None:
    if hasattr(mdr, resp):
        um._set(master, "material_decal_response", getattr(mdr, resp))
        unreal.MaterialEditingLibrary.recompile_material(master)
        unreal.EditorAssetLibrary.save_loaded_asset(master)
    if hasattr(mdr, "MDR_NONE"):
        um._set(screen, "material_decal_response", mdr.MDR_NONE)    # screens never receive
```

Characters: `receives_decals = False` on their primitive components [verify]. Receivers: each
DBuffer channel a receiver accepts adds material code, so its Decal Response is the union of the
channels its decals write (default Color Normal Roughness); a receiver blending decals itself
through DBuffer Texture expressions takes None to avoid double application. Overlapping
DBuffer-expression decals do not accumulate: one wins by sort order, so give overlapping decals
distinct `sort_order` values and author stains as one decal (decal doc, Recreating Legacy Behavior).
Gate: `stat gpu` with `ShowFlag.Decals 0` vs 1 on the same camera prices the decals (decal doc).

## P15. Parameter blending A/B (live editor)

Why: parameter blending is near-lossless on Horizontal Blend and lossy on Vertical Coat
(transmission and depth replaced by a heuristic, Morgan [SqPaL8HS_Lw 00:37:35, 00:38:08]). Measure
the look difference before accepting it anywhere it was not planned.

```python
# test: P15_parameter_blending_ab live-editor
# status: not yet run in Unreal; offline: fake (logic only)
src, dst = KIT + "/M_Kit_Surface", KIT + "/M_Kit_Surface_NoPB"
if not unreal.EditorAssetLibrary.does_asset_exist(dst):
    unreal.EditorAssetLibrary.duplicate_asset(src, dst)
nopb = unreal.EditorAssetLibrary.load_asset(dst)
front = unreal.MaterialEditingLibrary.get_material_property_input_node(nopb, unreal.MaterialProperty.MP_FRONT_MATERIAL)
if front is not None:
    um._set(front, "use_parameter_blending", False)
    unreal.MaterialEditingLibrary.recompile_material(nopb)
pair = um.spawn_board([KIT + "/Presets/MI_Kit_Worn", nopb], spacing=160.0, origin=(0, 400, 100))
a = um.capture(os.path.join(OUT, "pb_on_off.png"), 1920, 1080)
print("capture:", a, "| compare the two balls' crops with um.image_diff on the saved PNG halves")
```

Gate: horizontal blends keep PB when the difference is small; the non-PB copy stays as the evidence
(never delete it).

## P16. Value audit on instance parameters

Why: the PBR guardrails apply to what instances set, not only to source textures: dielectric F0 at
most 0.08 (gems, semiconductors, carbon fiber to about 0.18), metals with diffuse albedo 0 and F0
average at least 0.5, Metallic 0 or 1, Specular at most 0.5 and never 0 on realistic assets (Ben
Cloward [a94Lpu1_4dg 00:16:16], [fePsD_8p9vM 00:12:44, 00:20:55]; Morgan [SqPaL8HS_Lw 00:09:30]).
`um.PARAM_ROLES` maps parameter names to roles; add your master's names
(`um.PARAM_ROLES["PaintSpec"] = ("legacy", "specular")`).

```python
# test: P16_instance_values
# status: not yet run in Unreal; offline: fake + test_editor_layer_fake.py t_v2_editor_additions
vals_findings, vals = um.audit_instance_values_project("/Game/Kit", classes={})   # {mi_path: 'gem'} for exceptions
print(um.to_markdown(vals_findings, "Instance values"))
with open(os.path.join(OUT, "instance_values.json"), "w") as f:
    json.dump(vals, f, indent=1, default=str)
```

Gate: no `dielectric_f0_high`, `metal_diffuse_not_black` or `metal_too_dark`; every
`metallic_not_binary` sits on a hybrid surface (corroded or dusty metal) with a written reason (PBR
doc).

## P17. Cooked texture memory (agent-side)

Why: per-platform format, LOD bias, top mip and streaming are hard to predict; the Platforms panel
(X dropped, S streamed, I inline) previews them in the editor and `listtextures` in a cooked build
is the ground truth (textures doc, Platforms Panel). A pool that overflows shows as blurry textures:
fix the top users with Maximum Texture Size or the LOD group's MaxLODSize, not a bigger pool
(textures doc, Mistakes).

```python
# test: P17_cooked_texture_memory agent-side
# status: not yet run; needs a cooked build (packaged by scenario-unreal-pipeline-automation) or a -game session
import glob, os
import ue_materials as um
logs = sorted(glob.glob(os.path.join(PROJECT_DIR, "Saved", "Logs", "*.log")), key=os.path.getmtime)  # [verify packaged Mac path]
rows = um.parse_listtextures(open(logs[-1], errors="replace").read())
POOL_MB = None          # r.Streaming.PoolSize read in the same session, in MB
f = um.texture_memory_findings(rows, pool_mb=POOL_MB, profile="console60")
print(len(rows), "textures |", um.summarize(f))
print(um.to_markdown(f, "Cooked texture memory"))
```

Start the cooked build with the console commands `listtextures` and `stat streaming` (for example
through `-ExecCmds=` [verify argument form]). The parser's row layout is a first guess [verify
format on a 5.8 log]. To separate wanted-mip accuracy from pool size: `r.Streaming.DropMips 1`, then
`r.Streaming.FullyLoadUsedTextures 1` (textures doc). Gate: no `streaming_pool_over`; every
`cooked_texture_over_cap` has a reason.
