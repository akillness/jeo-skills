# Procedures: pipeline automation for Unreal Engine 5.8

**Status: not yet run in Unreal.** UE 5.8 was not installed when this was written (2026-09-24). What
ran: the pure layer of `scripts/ue_pipeline.py` (naming, intake, plan, staging, rules, validation,
reports, command builders, log parsers, ini patch, CLI) under python3 in
`tests/code/unreal-pipeline-automation/test_offline_pure.py`; the in-editor layer and both job files
against a fake `unreal` module in `test_offline_fake_unreal.py` (control flow only: ordering, error
isolation, save per chunk, validator passes/fails contract, report); every Python block of this file
compiled by `test_snippets_compile.py`. Once 5.8 is installed:
`python3 tests/code/unreal-pipeline-automation/in_engine/run_in_unreal.py --project /abs/NoSpaces/MyGame.uproject`,
then replace each "not yet run" below with the version it ran on.

Layers, same as the lead skill: `scripts/ue_pipeline.py` (import as `P`) plus the lead's
`<skills>/scenario-unreal-expert/scripts` (`ue_env`, `ue_run`, `ue_remote`, `ue_audit`,
`ue_review`). `P` finds the lead's folder itself. [verify] marks a name no saved 5.8 page confirms;
[added] marks this skill's own rule. Toolkit calls are thin: **P3b shows the engine calls under the
import, P5 the raw validator, P7 the raw screenshot loop, P8 the raw redirector query**, so a run
can be checked, or rebuilt, without the toolkit.

The procedures are written for any batch, from one reimported asset to thousands: a new batch runs
P0 to P9; changed sources run P1 with `previous=` and `policy=` then P3 (P11); a live project
adopting rules runs P5 with an allow list; a build alone runs P9.

```python
# parent-side imports used by every procedure below (system python3)
import sys
SK = "/abs/skills"                     # where the scenario-unreal-* skills live (no spaces is safest)
sys.path[:0] = [SK + "/scenario-unreal-pipeline-automation/scripts", SK + "/scenario-unreal-expert/scripts"]
import ue_pipeline as P
import ue_env
import ue_run
```

---

## P0. Preflight: Mac, engine, project, channel

Not yet run in Unreal. Tests: `ue_env` offline tests (lead), `test_offline_pure.py`
(`project_path_problems`).

```python
import subprocess, json
UPROJECT = "/abs/Dev/MyGame/MyGame.uproject"
pf = ue_env.preflight()                       # macOS >= 14.5, Apple Silicon, RAM, Xcode window
print("\n".join(pf["lines"]))                 # Xcode 26.6 here: 'unlisted' warning (26.4 incompatible)
eng = ue_env.find_engine()                    # None until the launcher install exists
prj = ue_env.find_project(UPROJECT)
problems = P.project_path_problems(UPROJECT)  # spaces, non-ASCII (Allar 2.1)
need = ["PythonScriptPlugin", "EditorScriptingUtilities", "DataValidation", "PythonAutomationTest"]
plan_plugins = ue_env.plan_plugins(UPROJECT, need)   # what enable_plugins would change [verify ids]
# Write-lock rule (Jamie Dale [01:17:18]): is an editor holding this project?
ps = subprocess.run(["pgrep", "-fl", "UnrealEditor"], capture_output=True, text=True).stdout
editor_open = UPROJECT in ps or prj and prj.get("root", "~") in ps
channel = "in-editor (MCP toolset or PythonRemote)" if editor_open else "headless (ue_run.run_python)"
# Perforce: files another user holds will refuse our save; 5.8's PythonScript commandlet enables
# source control before the script, and run_import_plan(rules={"require_checkout": True}) checks
# out each chunk and stops if checkout fails (Bardoux, MjjkWH0eT3U [00:55:27]).
opened = subprocess.run(["p4", "opened"], capture_output=True, text=True).stdout if prj else ""
print(json.dumps({"engine": bool(eng), "problems": problems, "plugins": plan_plugins, "channel": channel,
                  "p4_opened": opened.count("\n")}, default=str))
```

Gate: no `error:` line, no path problem, channel chosen, no file of the destination opened by
someone else. Interchange Editor and Interchange Framework are on by default (Interchange doc); Data
Validation is on by default (data validation doc). Enabling PythonAutomationTest needs an editor
restart.

---

## P1. Plan and stage the DCC exports (offline)

Tested offline: `test_offline_pure.py` (IntakeAndPlan, Cli), fixtures from `make_fixtures.py`. Pure
Python, no Unreal.

```python
EXPORTS = "/abs/Exports/Props"                 # scenario-maya-pipeline-scripting <out>/fbx, or ZBrush/Blender exports
plan = P.plan_imports(
    P.scan_sources(EXPORTS),                   # mesh files, textures <stem>_<ROLE>, sidecars, sha1
    "/Game/MyGame/Art/Props",
    convention="epic",                         # or "allar", once per project
    dcc_manifest=P.read_dcc_manifest("/abs/maya_out/summary.json"),   # presets: skeletal -> handoff
    previous=None,                             # after the first run: P.read_json(".../manifest.json") -> skip / reimport
    policy="PL_PropsImport@1",                 # bump when the preset changes: unchanged files then reimport
    project_root="/Game/MyGame",
    master="/Game/MyGame/MaterialLibrary/M_PropMaster",               # from scenario-unreal-materials
    param_map={"base_color": "BaseColor", "normal": "Normal", "pack": "ORM"})
plan["meta"]["pipeline"] = "/Game/MyGame/Pipelines/PL_PropsImport"   # P2
plan["meta"]["category_classes"] = {"walls": "architecture", "foliage": "foliage"}
plan["meta"]["target"] = {"nanite": True, "name": "PC, console, Mac M2+"}
P.stage_plan(plan, "/abs/Staging/Props")       # copies under target names; sources never written
P.write_json("/abs/Staging/plan.json", plan)
print(len(plan["items"]), "items,", len(plan["rejected"]), "rejected")
for r in plan["rejected"]:
    print("REJECTED", r["source"], r["reason"])
for it in plan["items"]:
    for i in it["issues"]:
        print(it["mesh_name"], i["id"], i["msg"])  # D01 units, D02 scale, D03 FBX version, N01...
```

CLI equivalent:
`python3 ue_pipeline.py plan --src /abs/Exports/Props --dest /Game/MyGame/Art/Props --out /abs/Staging/plan.json --master /Game/MyGame/MaterialLibrary/M_PropMaster --param-map '{"base_color":"BaseColor","normal":"Normal","pack":"ORM"}' --dcc-manifest /abs/maya_out/summary.json --project-root /Game/MyGame --pipeline /Game/MyGame/Pipelines/PL_PropsImport --stage /abs/Staging/Props`.

Why stage: Interchange ignores `AssetImportTask.destination_name` (5.8 API); the preset sets "use
source name for asset", so a file named `SM_CrateWood_03.fbx` should become `SM_CrateWood_03` with
no rename and no redirector [verify with Interchange on install]. The material sidecar
`<stem>.materials.json` carries what FBX cannot (Bardoux, MjjkWH0eT3U [00:06:30]):

```json
{
  "asset_class": "architecture",
  "normal_convention": "opengl",
  "slots": {
    "Frame": {
      "base_color": "tex/wall_Frame_BC.png",
      "normal": "tex/wall_Frame_N.png"
    },
    "Panel": {
      "BaseColor": "tex/wall_Panel_BC.png",
      "pack:ORM": "tex/wall_Panel_ORM.png"
    }
  }
}
```

Gate: items plus rejections equal the scanned files; every rejection has a reason; the staging copy
left the sources byte-identical (the test checks sha1 before and after).

---

## P2. Import policy: a project pipeline preset, and a Python pipeline only when filtering is needed

Not yet run in Unreal. Tests: `test_offline_fake_unreal.py` (Preset: set and failed lists, enum
rows, the Interchange MI route), `test_offline_pure.py` (`pipeline_stack_problems`,
PolicyAndRoutes).

```python
job = SK + "/scenario-unreal-pipeline-automation/scripts/ue_pipeline_job.py"
d = ue_run.run_python(UPROJECT, job, args={"action": "describe"})        # real property names on 5.8
p = ue_run.run_python(UPROJECT, job, args={"action": "preset", "dest": "/Game/MyGame/Pipelines/PL_PropsImport",
                                           "route": "post_import",      # or "interchange_mi" (below)
                                           "master": "/Game/MyGame/MaterialLibrary/M_PropMaster",
                                           "vertex_color": False})      # True only if the master reads vertex color
print(p["result"]["set"], p["result"]["failed"])   # failed: fix the row names from `describe`
f = ue_run.run_python(UPROJECT, job, args={"action": "flags"})           # Interchange FBX cvars, API presence
stack = ["/Interchange/Pipelines/DefaultAssetsPipeline", "/Game/MyGame/Pipelines/PL_FolderRouting"]
print(P.pipeline_stack_problems(stack))            # P02 Graph Inspector, P03 order (Oq6KbrqkGnw [00:20:22])
```

The policy (`P.PROP_PIPELINE_SETTINGS`, returned by `P.pipeline_settings()`): use source name for
asset; static meshes only; combine static meshes; collision by DCC name (`UCX_` `UBX_` `UCP_`
`USP_`, Interchange doc) and no generated collision (the class rule adds it after import [added]);
Build Nanite off at import (decided per mesh, P3); Generate Lightmap UVs off for Lumen (Nanite doc);
**Vertex Color Import Option = Ignore** unless the master reads vertex color (pipeline digest P2
preset; the Interchange reference lists Replace, Ignore, Override); materials not imported (Maya's
`lambert1` never becomes an asset; instances come from the plan); textures imported separately from
staged files with explicit roles. Enum values are `P.EnumRef` rows resolved inside Unreal
(`InterchangeVertexColorImportOption.IVCIO_IGNORE`, `InterchangeMaterialImportOption.DO_NOT_IMPORT`
[verify both]); a row whose names do not exist lands in `failed`, never silently.

Two material routes, chosen per project:

| Route                   | Pipeline rows                                                                                                                                      | Use when                                                                                 | Caveat                                                                                                                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `post_import` (default) | Material Import off; one `MI_` per slot created after import from the plan's parameter map (P3b)                                                   | the master's parameter names are the studio's own, several slots, packed maps            | more code; every parameter is checked on the master (M04)                                                                                                                                                                                      |
| `interchange_mi`        | Material Import = Import as Material Instance, Parent Material = master, textures with the mesh, Detect Normal Map on (Interchange doc, Materials) | the master uses the parameter names Interchange fills (base color, normal, roughness...) | Interchange fills only the parameters it knows, by the parent's names (Interchange note, agent translation): map the rest after import, then validate (M02, M04). With no Parent Material it picks its own parents in `/Interchange/Materials` |

Reimport reuses the pipeline stack stored on each asset (Interchange doc, Reimporting Assets): after
changing this preset, bump `policy=` in P1 so unchanged files reimport with the new preset passed
explicitly (P11). Point the project to the preset in Project Settings > Engine > Interchange if
humans import too (Interchange PM [00:12:40]), and hide nothing in it that a scripted import needs:
scripted imports read the preset's defaults [00:39:28].

When unwanted content must never be created (hidden helper meshes, a name filter), add a Python
pipeline after the default one and disable factory nodes plus their dependencies (Interchange PM
[00:31:33], [00:32:39]). Sketch, every Interchange Python name [verify] (the doc's sample is
truncated):

```python
# <Project>/Content/Python/pl_filter_by_name.py, imported from init_unreal.py so it exists before
# any stack references it; then create an "Interchange Python Pipeline" asset pointing to the class.
import unreal

@unreal.uclass()
class PipelineFilterByName(unreal.InterchangePythonPipelineBase):
    exclude_substring = unreal.uproperty(str, meta=dict(Category="Filter"))

    @unreal.ufunction(override=True)
    def scripted_execute_pipeline(self, base_node_container, source_datas, content_base_path):  # [verify name, args]
        needle = (self.get_editor_property("exclude_substring") or "").lower()
        if not needle:
            return True
        for uid in base_node_container.get_nodes(unreal.InterchangeStaticMeshFactoryNode):    # [verify]
            node = base_node_container.get_node(uid)
            if needle in str(node.get_display_label()).lower():
                node.set_enabled(False)                                                       # [verify]
                for dep in node.get_factory_dependencies():                                   # [verify]
                    base_node_container.get_node(dep).set_enabled(False)
        return True
```

Debug a pipeline with the Graph Inspector pipeline at the end of a manual import, never in an
automated stack ([00:40:00]).

---

## P3. Headless import job (any batch size)

Not yet run in Unreal. Tests: `test_offline_fake_unreal.py` (ImportPlan, Unstaged, Jobs, Hardening:
LOD fallback, checkout stop, bool-returning import, duplicate guard), `test_offline_pure.py`
(ExitCodesAndLauncher: `job_verdict`).

```python
res = ue_run.run_python(UPROJECT, job, args={"action": "import", "plan": "/abs/Staging/plan.json",
                                             "chunk": 25}, timeout=4 * 3600)
if not res["ok"]:
    print(res.get("error"), res["log"]["python_errors"][:5], res["log_tail"][-20:])
else:
    r = res["result"]
    print(r["summary"])            # status counts, issue ids, Nanite count, collision kinds, classes
    print(r["report"], r["csv"], r["manifest"], "redirectors left:", r["redirectors_left"])
```

What `run_import_plan` does (`scripts/ue_pipeline.py`; raw engine calls in P3b): waits for the asset
registry, then per item an Interchange import with `is_automated` and the preset in
`override_pipelines` (reimport for a changed sha1 or policy, with the preset passed again because
reimport otherwise reuses the stack stored on the asset, Interchange doc); rename to the planned
name only if the importer disagreed (I02), refused when the name is already taken (I03); textures
imported, then compression, sRGB and texture group set from the role, and the green channel flipped
for `opengl` normals; one instance per slot from the master, texture parameters set only if the
master has them (M04 otherwise); facts, then `P.mesh_rules` (class, Nanite, collision, LODs),
applied in one pass, with the LOD count checked after the LOD group and an explicit chain when it is
short; facts again and `validate_mesh_facts` / `validate_texture_facts` (L01 count, L02 screen sizes
decreasing). Per chunk: checkout when `rules["require_checkout"]` (stop on failure, SC01),
`save_loaded_assets`, `unreal.collect_garbage()` (commandlet-safe since 5.6). After all:
`engine_validate` (every registered validator), the lead's
`ue_audit.audit_assets(folders, rules, profile="game")`, and `redirectors_under(folders)` from the
registry. One exception fails one record (E01), never the run.

Numbers to expect: the first run is DDC-heavy (Nanite builds, distance fields, shaders) [added];
measure seconds per file on the 5 to 10 file trial and set the timeout from it. The ScopedSlowTask
dialog is a no-op headless [verify].

Verdict: the envelope, not the exit code (a Python failure only logs an error unless
`-ScriptErrorsAreFatal`, 5.5 notes). `ue_run.py` exits 1 when the job is not ok; in Python:
`v = P.job_verdict(res, require_summary_ok=True)`, CLI
`python3 ue_pipeline.py verdict import.json --require-summary-ok`. A raw call without `ue_run`
(`P.python_job_command`) adds `-ScriptErrorsAreFatal` [verify it applies to `-run=pythonscript`;
documented for `-ExecutePythonScript`] and must still print a result line.

Gate: `len(records) == items + rejected`; `summary["ok"]` or every failure explained by an issue id;
`job_verdict` exit 0; `stopped` is None (SC01 means a checkout failed and nothing of that chunk was
saved); `redirectors_found` handled in P8; I03 (a planned name already held by another asset) means
the item should have been a reimport.

### P3b. The engine calls under `run_import_plan` (no toolkit)

Not yet run in Unreal. Tests: the same calls run against the fake `unreal` in
`test_offline_fake_unreal.py` (ImportPlan, Hardening); the names are checked on the real build by
`in_engine/first_run_checks.py`.

What each file goes through, written against `unreal` only, so a reviewer can check the engine calls
behind `P.*` and a run can be rebuilt without the toolkit. Confirmed by the saved 5.8 API page:
`InterchangeManager.get_interchange_manager_scripted`, `create_source_data`, `import_asset` and
`reimport_asset` (both return the imported objects, or None on failure),
`AssetTools.create_asset(..., overwrite_existing)`, `EditorAssetSubsystem` load, save, rename and
checkout calls. Everything else is [verify].

```python
import unreal

eas = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
mel = unreal.MaterialEditingLibrary
tools = unreal.AssetToolsHelpers.get_asset_tools()
mgr = unreal.InterchangeManager.get_interchange_manager_scripted()
unreal.AssetRegistryHelpers.get_asset_registry().wait_for_completion()   # headless: registry may still scan

PIPELINE = "/Game/MyGame/Pipelines/PL_PropsImport"
MASTER = unreal.load_asset("/Game/MyGame/MaterialLibrary/M_PropMaster")
PARAMS = {"base_color": "BaseColor", "normal": "Normal", "pack": "ORM"}      # from scenario-unreal-materials


def interchange(path, folder, existing=None):
    params = unreal.ImportAssetParameters()
    params.set_editor_property("is_automated", True)                        # no dialog [verify field]
    params.set_editor_property("override_pipelines", [unreal.SoftObjectPath(PIPELINE)])  # also on reimport
    if existing is not None:
        return list(mgr.reimport_asset(existing, params) or [])             # stored stack unless overridden
    src = unreal.InterchangeManager.create_source_data(path)
    return list(mgr.import_asset(folder, src, params) or [])


def import_one(staged_mesh, textures, folder, mesh_name, existing=None):
    """textures: [(staged_path, role, T_name)]. Returns the mesh and its dirty assets."""
    meshes = [o for o in interchange(staged_mesh, folder, existing) if isinstance(o, unreal.StaticMesh)]
    if len(meshes) != 1:
        raise RuntimeError("I01: expected 1 static mesh, got %d" % len(meshes))
    mesh, dirty = meshes[0], []
    if mesh.get_name() != mesh_name:                                         # staging should make this rare
        want = folder + "/" + mesh_name
        if eas.does_asset_exist(want):
            raise RuntimeError("I03: %s exists: reimport it instead of importing again" % want)
        eas.rename_loaded_asset(mesh, want)                                  # leaves a redirector (P8)
    by_param = {}
    for path, role, name in textures:
        tex = [o for o in interchange(path, folder) if isinstance(o, unreal.Texture2D)][0]
        linear = role != "base_color"
        tex.set_editor_property("srgb", not linear)
        tex.set_editor_property("compression_settings",
                                unreal.TextureCompressionSettings.TC_NORMALMAP if role == "normal"
                                else unreal.TextureCompressionSettings.TC_MASKS if linear
                                else unreal.TextureCompressionSettings.TC_DEFAULT)
        by_param[PARAMS["pack" if role.startswith("pack") else role]] = tex
        dirty.append(tex)
    mi_name = "MI_" + mesh_name[3:]
    mi = tools.create_asset(mi_name, folder, unreal.MaterialInstanceConstant,
                            unreal.MaterialInstanceConstantFactoryNew(), overwrite_existing=False)
    mel.set_material_instance_parent(mi, MASTER)
    known = set(str(n) for n in mel.get_texture_parameter_names(MASTER))   # M04 when a name is missing
    for param, tex in by_param.items():
        if param in known:
            mel.set_material_instance_texture_parameter_value(mi, param, tex)
    for i in range(len(mesh.get_editor_property("static_materials"))):
        mesh.set_material(i, mi)
    dirty.append(mi)
    # one pass: Nanite, collision, LODs (each rebuilds the mesh)
    nanite = True                                                            # P.nanite_decision(...) decides
    ns = mesh.get_editor_property("nanite_settings")
    ns.set_editor_property("enabled", nanite)
    sms.set_nanite_settings(mesh, ns, apply_changes=True)
    if sms.get_simple_collision_count(mesh) == 0:                            # UCX_ from the DCC wins
        sms.add_simple_collisions(mesh, unreal.ScriptCollisionShapeType.NDOP26)
    if not nanite:
        mesh.set_editor_property("lod_group", "SmallProp")                  # or StaticMesh.set_lod_group [verify]
        if sms.get_lod_count(mesh) < 3:                                      # a group may build no LODs: count
            opts = unreal.EditorScriptingMeshReductionOptions()
            opts.set_editor_property("auto_compute_lod_screen_size", False)
            opts.set_editor_property("reduction_settings", [
                unreal.EditorScriptingMeshReductionSettings(percent_triangles=p, screen_size=s)
                for p, s in ((1.0, 1.0), (0.5, 0.5), (0.25, 0.25))])       # [added] halving chain
            sms.set_lods(mesh, opts)
        sizes = list(sms.get_lod_screen_sizes(mesh))                        # L02: must decrease
        assert all(b < a for a, b in zip(sizes, sizes[1:])), sizes
    dirty.append(mesh)
    return mesh, dirty


def save_chunk(dirty, require_checkout=False):
    if require_checkout and not eas.checkout_loaded_assets(dirty):          # Bardoux: stop, save nothing
        raise RuntimeError("SC01: checkout failed")
    eas.save_loaded_assets(dirty, only_if_is_dirty=True)
    unreal.collect_garbage()                                                 # commandlet-safe since 5.6
```

The toolkit adds what this sketch leaves out: plan names and staging, per-slot instances, the class
rules, the OpenGL green-channel flip, texture groups, facts and validation per record, error
isolation per file, reports and manifests.

---

## P4. The same job inside an open editor (write lock)

Not yet run in Unreal. Tests: none offline beyond P3's fake run (same function).

Option A, Python remote execution through the lead's client (Project Settings > Plugins > Python >
Enable Remote Execution, off by default, keep it on loopback):

```python
import ue_remote
pr = ue_remote.PythonRemote(project="MyGame")
pr.open()
code = "\n".join([
    "import sys, json",
    "sys.path.insert(0, %r)" % (SK + "/scenario-unreal-pipeline-automation/scripts"),
    "import importlib, ue_pipeline as P",
    "importlib.reload(P)",
    "r = P.run_import_plan(%r, chunk=25)" % "/abs/Staging/plan.json",
    "print('UE_RESULT ' + json.dumps({'ok': True, 'result': {'report': r['report'], 'summary': r['summary']}}))",
])
out = pr.exec(code)
print(out["ue_result"] or out["errors"])
pr.close()
```

The same call is how scenario-maya-pipeline-scripting can trigger an import right after an export
(Epic used remote execution from Maya for exactly this, Jamie Dale [01:16:47]). Remote Control is
the wrong tool here: 5.8 blocks remote UFUNCTION calls by default (5.8 notes).

Option B, a project MCP toolset (Unreal MCP doc: Python toolsets under a plugin's `Content/Python`,
tools serialized on the game thread, so keep calls short: one chunk per call):

```python
# <Project>/Plugins/AgentPipeline/Content/Python/pipeline_toolset.py  (.uplugin "CanContainContent": true)
import sys
import unreal
import toolset_registry
sys.path.insert(0, "/abs/skills/scenario-unreal-pipeline-automation/scripts")
import ue_pipeline as P


@unreal.uclass()
class PipelineTools(unreal.ToolsetDefinition):
    """Import, validate and report DCC exports with the project's pipeline rules."""

    @toolset_registry.tool_call
    @staticmethod
    def import_plan_chunk(plan_path: str, start: int, count: int) -> str:
        """Import items [start, start+count) of a plan written by ue_pipeline.plan_imports.

        Args:
            plan_path: Absolute path to plan.json, without spaces.
            start: First item index.
            count: Number of items; 25 keeps each call short.

        Returns:
            Absolute path of the report.json written for this chunk.
        """
        plan = P.read_json(plan_path)
        plan["items"] = plan["items"][start:start + count]
        plan["rejected"] = [] if start else plan["rejected"]
        part = plan_path.replace(".json", "_%04d.json" % start)
        P.write_json(part, plan)
        return P.run_import_plan(part, chunk=count)["report"]

    @toolset_registry.tool_call
    @staticmethod
    def validate_folder(folder: str) -> str:
        """Run the pipeline validators on every static mesh and texture under a folder.

        Args:
            folder: Content path such as /Game/MyGame/Art/Props.

        Returns:
            JSON summary with status counts and issue ids.
        """
        import json
        return json.dumps(P.validate_paths([folder])["summary"])
```

Decorator order copied from the doc excerpt; check the shipped
`toolset_registry/toolsets/core/actor.py` [verify]. After editing:
`ModelContextProtocol.RefreshTools`, reconnect the client. Await each `call_tool` before the next.

---

## P5. Validators: register, prove, allow-list, run in CI and in the cook

Not yet run in Unreal. Tests: `test_offline_pure.py` (Validation: every issue id fires on a crafted
fact dict, allow list), `test_offline_fake_unreal.py` (Validators: passes exactly once, fails with
ids, a crash becomes a failure).

```python
# <Project>/Content/Python/init_unreal.py   (runs at editor start, from any Content/Python path)
import sys
sys.path.insert(0, "/abs/skills/scenario-unreal-pipeline-automation/scripts")
try:
    import ue_pipeline
    ue_pipeline.register_validators({
        "project_root": "/Game/MyGame",
        "masters": ["/Game/MyGame/MaterialLibrary/M_PropMaster"],
        "convention": "epic",
    })
except Exception as e:                       # never block editor start-up
    import unreal
    unreal.log_warning("pipeline validators not registered: %s" % e)
# No job launching here: a script imported from init_unreal must guard its entry point with
# `if __name__ == "__main__":` (5.8 batch processor note: fork bomb).
```

The validators (`PipelineMeshValidator`, `PipelineTextureValidator`) filter by class only in
`k2_can_validate_asset` (cheap, Fray [00:31:47]) and run the same pure rules as the import report in
`k2_validate_loaded_asset`, calling `asset_passes` whenever no error was found (a path without
passes or fails is reported "not checked", data validation doc). They run on save (on by default),
from Content Browser > Validate Assets, and in our jobs. The same thing without the toolkit (5.8
override names from the saved API page; `add_validator` and keeping a module-level reference
[verify]):

```python
import unreal

@unreal.uclass()
class MeshCollisionValidator(unreal.EditorValidatorBase):
    @unreal.ufunction(override=True)
    def k2_can_validate_asset(self, asset):
        return isinstance(asset, unreal.StaticMesh)          # runs before load: a class test only

    @unreal.ufunction(override=True)
    def k2_validate_loaded_asset(self, asset):
        sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
        if sms.get_simple_collision_count(asset) == 0:
            self.asset_fails(asset, unreal.Text("[C01] %s has no simple collision" % asset.get_name()))
        else:
            self.asset_passes(asset)                          # every path: passes or fails
        return self.get_validation_result()


_KEEP = [MeshCollisionValidator()]                            # keep a reference alive for the session
unreal.get_editor_subsystem(unreal.EditorValidatorSubsystem).add_validator(_KEEP[0])
```

Cost: 5.8 reports each validator's duration during cook (`DataValidation.ReportCookValidationStats`,
on by default; data validation note, cross-source). Read the stats block of the cook log
(`grep -i validat <cook log>`; exact wording [verify]) and keep ours from dominating. Locally,
`validate_paths(...)["cost"]` gives our rules' own seconds per asset (load plus facts plus rules): a
validator that needs more than a class test in `k2_can_validate_asset`, or loads other assets, is
the usual culprit.

Prove each rule before trusting it (Fray [01:46:04]): the fixtures of `make_fixtures.py` break one
rule each (S01 unit error, T01 non-power-of-two, name collision, broken file). A new rule gets a new
fixture, and the run must show it failing for the right reason before the fix.

CI, three layers, because none covers the others:

```python
ALLOW = "/abs/ci/validation_allow.json"
v = ue_run.run_python(UPROJECT, job, args={"action": "validate", "paths": ["/Game/MyGame"]}, timeout=3600)
recs = v["result"]["records"] if v["ok"] else []
allow = set(P.read_json(ALLOW)) if __import__("os").path.isfile(ALLOW) else P.allow_list_from(recs)
new = P.new_issues(recs, allow)              # red must mean new (Fray [00:38:07])
dv = ue_run.run_commandlet(UPROJECT, "DataValidation")   # C++ and engine-gathered rules only
print(len(new), "new errors;", "DataValidation ok" if dv["ok"] else dv["log"]["errors"][:5])
# third layer: the cook in P9 carries -RunAssetValidation -RunMapValidation -ValidationErrorsAreFatal
```

Whether Python validators exist inside the DataValidation or cook commandlets depends on Python
being initialized there (lazy init since 5.6) and on `init_unreal.py` running: treat it as [verify]
and keep the explicit `validate` job as the Python-rules gate [added]. On a live project, write the
first run's errors to the allow list, then burn it down (Fray: "faster than you think"). The
`validate` job waits for the asset registry before listing (`wait_for_completion()`, 5.8 batch
example) because headless it may still be scanning.

---

## P6. Automation tests: Python editor tests, headless run, report

Not yet run in Unreal. Tests: `test_offline_pure.py` (`automation_command`,
`parse_automation_report` on a synthetic report).

```python
# <Project>/Content/Python/Tests/test_pipeline_rules.py   (plugin PythonAutomationTest; discovered as
# Editor > Python > <Project> > Tests > test_pipeline_rules [verify path]). Fixture assets come from P3 on make_fixtures.
import unreal
import ue_pipeline as P

FIXTURES = "/Game/MyGame/Tests/Pipeline"


def test_unit_error_is_flagged():
    mesh = unreal.load_asset(FIXTURES + "/Crates/CrateMeters/SM_CrateMeters")
    assert mesh is not None, "fixture missing: run the pipeline on make_fixtures first"
    ids = [i["id"] for i in P.validate_mesh_facts(P.mesh_facts(mesh))]
    assert "S01" in ids, "expected S01 (size), got %s" % ids


def test_clean_crate_passes():
    mesh = unreal.load_asset(FIXTURES + "/Crates/CrateWood_03/SM_CrateWood_03")
    errors = [i for i in P.validate_mesh_facts(P.mesh_facts(mesh), {"project_root": "/Game/MyGame"})
              if i["severity"] == "error"]
    assert not errors, errors


@unreal.AutomationScheduler.add_latent_command
def screenshot_matches_reference():
    """Screenshot comparison (automation doc): latent, needs a rendering editor."""
    task = unreal.AutomationLibrary.take_high_res_screenshot(1280, 720, "PipelineCrate")   # [verify args]
    while not task.is_task_done():
        yield
    unreal.AutomationLibrary.compare_image_against_reference("PipelineCrate", "PipelineCrate", 0.02)  # [verify]
```

Run and read:

```python
REPORT = "/abs/ci/automation"
cmd = P.automation_command(UPROJECT, ["Editor.Python"], REPORT, engine=eng)          # -nullrhi: no screenshots
subprocess.run(cmd, timeout=3600)
print(P.parse_automation_report(REPORT))   # ok, failed, failures[name, errors]
shots = P.automation_command(UPROJECT, "Editor.Python.MyGame.Tests.test_pipeline_rules", REPORT, rendering=True, engine=eng)
```

Rules from the sources: any error log fails a test, so a smoke test needs no assert, only a clean
log and a 0.5 to 1 s settle (Fray [01:04:47], [01:03:07]); Epic's Smoke flag means under 1 s each
(automation doc), so tag slow walk-throughs as Product or Stress; do not assume editor state, clean
up files (Test Design Guidelines); Blueprint functional tests take their name from the actor label
and their time limit doubles as a speed check (Hamilton [00:22:12], [00:26:46]). Tiers: push
(validators and fast tests), build (full suite), weekend (packaged smoke) (Fray [01:31:46]). Review
any AI-written test: it must fail when the bug is put back (Fray [02:02:02]).

Gauntlet from the terminal:
`P.gauntlet_command(UPROJECT, test="UE.EditorAutomation", build="editor", runtest="Editor.Python")`
for editor tests, `test="UE.TargetAutomation", build=<staged build>` for packaged ones (Gauntlet
doc) [verify on Mac].

---

## P7. Contact sheet review

Not yet run in Unreal. Tests: `test_offline_fake_unreal.py` (Jobs: contact sheet through the
fallback path and through the lead's `ue_review`), `test_offline_pure.py` (`frame_camera`,
`contact_sheet_html`).

```python
import glob, os
meshes = [r["mesh_path"] for r in P.read_json(REPORT_JSON)["records"] if r.get("status") in ("pass", "warn", "fail") and r.get("facts")]
shots = ue_run.run_python(UPROJECT, SK + "/scenario-unreal-pipeline-automation/scripts/ue_contact_sheet_job.py",
                          args={"meshes": meshes, "out_dir": "/abs/review/shots",
                                "level": "/Game/MyGame/Dev/L_Lookdev"},          # from scenario-unreal-lighting-rendering
                          mode="latent", timeout=3600)
import ue_review
pngs = sorted(glob.glob("/abs/review/shots/*.png"))
rev = ue_review.review_images(pngs, sheet="/abs/review/sheet.png")   # image_checks per frame + a tiled PNG
P.contact_sheet_html([{"path": f["path"], "caption": os.path.basename(f["path"]),
                       "flags": [l for l in f["verdict"] if l.startswith(("error", "warn"))]} for f in rev["frames"]],
                     "/abs/review/index.html")
print(rev["errors"], rev["warnings"])   # then LOOK at sheet.png: an agent approved an all-white frame once (lDf_y-YPELo [00:17:29])
```

The loop inside `ue_contact_sheet_job.py`, without the toolkit: it needs editor ticks and rendering,
so it runs in a rendering editor (`ue_run.run_python(..., mode="latent")`, or a Python automation
test run with `Automation RunTest` in the GUI binary), never in the commandlet (no level, no
rendering) or under `-nullrhi`. Screenshot calls from the automation doc (Screenshot Support);
camera and FOV from the 5.8 Level Editor Subsystem notes; `P.frame_camera` is pure:

```python
import os
import unreal
import ue_pipeline as P


@unreal.AutomationScheduler.add_latent_command          # automation-test form; ue_run's latent mode drives the same generator
def contact_sheet(meshes=("/Game/MyGame/Art/Props/Crates/CrateWood_03/SM_CrateWood_03",), out_dir="/abs/review/shots"):
    les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    ues = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    les.load_level("/Game/MyGame/Dev/L_Lookdev")        # closes the current level without saving
    les.set_level_viewport_fov(40.0)                     # 5.8, clamped 5 to 170 [verify signature]
    for path in meshes:
        mesh = unreal.load_asset(path)
        actor = actors.spawn_actor_from_object(mesh, unreal.Vector(0, 0, 0))
        box = mesh.get_bounding_box()
        mn, mx = box.get_editor_property("min"), box.get_editor_property("max")
        cam = P.frame_camera([mn.x, mn.y, mn.z], [mx.x, mx.y, mx.z], fov_deg=40.0)
        ues.set_level_viewport_camera_info(unreal.Vector(*cam["location"]),
                                           unreal.Rotator(pitch=cam["rotation"][0], yaw=cam["rotation"][1], roll=0.0))
        for _ in range(30):                              # settle: let streaming and lighting catch up
            yield
        task = unreal.AutomationLibrary.take_high_res_screenshot(1280, 720, os.path.join(out_dir, mesh.get_name() + ".png"))
        while not task.is_task_done():                   # the editor must tick for the file to appear
            yield
        actors.destroy_actor(actor)
```

Then on the parent side `ue_review.review_images` (numeric check of every frame) before anyone,
human or model, judges the look.

What to look for (pipeline digest): scale next to a mannequin, pivot, normal map green channel
(bumps inverted means the convention was wrong), texture on the right slot, no default grid
material; on a sample, collision in the collision view mode and LOD transitions with `r.ForceLOD 1`
to `3` on non-Nanite meshes. This Mac (M5 Max) can show Nanite and VSM; an M1 could not (macOS doc).

---

## P8. Redirectors and resave

Not yet run in Unreal. Tests: `test_offline_pure.py` (`resave_command`),
`test_offline_fake_unreal.py` (Unstaged: `redirectors_left` and the registry-measured
`redirectors_found`).

```python
if r["redirectors_found"]:                        # from the registry, not from our rename count
    # editor closed; under Perforce -autocheckout (read-only files cannot be resaved otherwise),
    # then a human submits, or -autocheckin on an automated run (naming doc)
    out = ue_run.run_commandlet(UPROJECT, "ResavePackages", ["-fixupredirects", "-autocheckout", "-projectonly"])
    print(out["ok"], out["log"]["summary"])
```

The measurement, raw (AssetData field names [verify]); `P.redirectors_under(folders)` wraps it:

```python
import unreal
reg = unreal.AssetRegistryHelpers.get_asset_registry()
reg.wait_for_completion()
left = [str(d.package_name) for d in reg.get_assets_by_path("/Game/MyGame/Art/Props", recursive=True)
        if str(d.asset_class_path.asset_name) == "ObjectRedirector"]
print(len(left), left[:10])
```

Spelling: the naming doc's prose says `-FixupRedirectors`, its example `-fixupredirects`; use the
example [verify]. Fix redirectors before deleting anything renamed, and before cooking (the Zen
loader ignores core redirects). After an engine upgrade, resave the whole project once so loads stop
paying the PostLoad upgrade path (Ari [00:10:13]): same commandlet without `-fixupredirects`.

---

## P9. Cook, package, boot

Not yet run in Unreal. Tests: `test_offline_pure.py` (Commands, Logs, ini, ExitCodesAndLauncher:
launcher diff, `-archive` without `-package`), lead's `build_buildcookrun` tests.

```python
import os
ini = os.path.join(os.path.dirname(UPROJECT), "Config", "DefaultEngine.ini")
with open(ini, encoding="utf-8") as fh:
    patched = P.zen_ci_patch(fh.read())            # [Zen.AutoLaunch] LimitProcessLifetime=false (5.8 notes)
# write `patched` back only on CI machines, after a versioned copy of the ini (never-delete rule)
cmd = P.package_command(UPROJECT, "/abs/Builds/MyGame_Dev", platform="Mac", config="Development")
print(P.shell_line(cmd))
assert not [x for x in P.buildcookrun_problems(cmd) if x.startswith("error")]
b = ue_run.run_uat(cmd[1:], timeout=6 * 3600)
u = P.parse_uat_log("\n".join(b["log_tail"]))    # or the full stdout.log in b["job_dir"]
apps = [os.path.join(dp, d) for dp, ds, _ in os.walk("/abs/Builds/MyGame_Dev") for d in ds if d.endswith(".app")]
boot = ue_run.run_uat(P.gauntlet_command(UPROJECT, test="UE.BootTest", build="local")[1:], timeout=3600)
print(b["ok"], u["ok"], apps, boot["ok"])
```

The command (lead's builder plus `-nop4`):
`RunUAT.sh BuildCookRun -project=... -platform=Mac -clientconfig=Development -unattended -utf8output -build -cook -stage -pak -package -iostore -archive -archivedirectory=... -additionalcookeroptions="-RunAssetValidation -RunMapValidation -ValidationErrorsAreFatal" -nop4`.
Flags from the batch sources:
`-project -platform -clientconfig -build -cook -stage -pak -package -archive`; the rest [added]
[verify]. Package is its own stage: without `-package` the archive holds staged files, not a
finished `.app` (UAT doc; Josh Adams [00:19:48]); `buildcookrun_problems` warns.

Reference line, never hand-typed (UAT doc, Command Line): in the editor, Platforms > Project
Launcher > add a custom profile for Mac, Development, by-the-book cook, package and archive; run it
once; copy the Output Log line after `BuildCookRun` into `ci/launcher_buildcookrun.txt` (versioned).
Then:

```python
with open("/abs/ci/launcher_buildcookrun.txt", encoding="utf-8") as fh:
    diff = P.buildcookrun_diff(cmd, fh.read())    # missing / extra / differ, path values ignored
print(diff)   # decide each flag: adopt the launcher's, or keep ours with a reason (e.g. cook validation)
```

CLI:
`python3 ue_pipeline.py compare-launcher --project ... --archive ... --launcher ci/launcher_buildcookrun.txt`
(exit 1 while flags are missing or differ).

Iterating on content, not shipping: `P.cook_command(UPROJECT)` cooks only
(`-run=cook -targetplatform=Mac` with fatal validation) and catches cook errors without packaging;
against Zen, `package_command(..., incremental=True)` adds `-cookincremental` (5.6, Beta in 5.8; the
packaging page only knows `-iterate`).

Mac specifics (Josh Adams, uxdEt9XXKb8): Xcode assembles and signs the app "whether or not you edit
in Xcode" [00:03:33]; that a content-only project therefore needs full Xcode too is an inference
[verify with a content-only BuildCookRun]; 5.8 wants 26.0 to 26.1.x and 26.4 is incompatible (macOS
doc), this Mac has 26.6 (unlisted); command-line builds regenerate the Xcode project each time
[00:28:26]; `-distribution` makes an `.xcarchive` with dSYMs; build machines sign with an App Store
Connect `.p8` key of the smallest sufficient role [00:13:34]; a received zip gets the quarantine
attribute: `xattr -dr com.apple.quarantine MyGame.app` [added exact command]. Incremental cook
against Zen: `package_command(..., incremental=True)` adds `-cookincremental` (Beta).

Gate: UAT exit 0, `.app` in the archive, BootTest passes, no error lines; then hand the archive
path, UAT verdict, BootTest result and changelist to QA and scenario-unreal-performance.

---

## P10. Batch processor for thousands of assets (5.8)

Not yet run in Unreal. Tests: `test_offline_pure.py` (`batch_job`, `parse_batch_results`).

```python
# <Project>/Content/Python/pipeline_batch.py   imported from init_unreal.py so the uclass is registered
import json
import unreal


@unreal.uclass()
class PipelineBatch(unreal.Object):
    @unreal.ufunction(static=True, params=[str], ret=str)
    def audit_one(args_json):
        import ue_pipeline as P
        a = json.loads(args_json)
        mesh = unreal.load_asset(a["asset"])
        issues = P.validate_mesh_facts(P.mesh_facts(mesh), a.get("rules")) if mesh else [{"id": "I01", "severity": "error", "msg": "missing"}]
        return json.dumps({"asset": a["asset"], "errors": [i["id"] for i in issues if i["severity"] == "error"]})


if __name__ == "__main__":        # critical: init_unreal imports this module (5.8 notes: fork bomb)
    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    reg.wait_for_completion()
    assets = [str(d.package_name) for d in reg.get_assets_by_path("/Game/MyGame", recursive=True)]   # [verify]
    job = {"function": "/Game/Python/pipeline_batch_PY.PipelineBatch:audit_one",               # [verify path format]
           "arguments": [{"asset": a} for a in assets]}
    print(unreal.BatchProcessLibrary.run_batch(json.dumps(job), num_workers=8))
```

Command line: `UnrealEditor MyGame -run=BatchProcessCommandlet Jobs.json -numworkers=8`, results in
`Saved/MultiprocessResults/results.txt`, read with `P.parse_batch_results(path)`. Use it for audits
over tens of thousands of assets; a few hundred do not need it.

---

## P11. Reimport only what changed

Tested offline: `test_offline_pure.py` (`publish_diff`, previous-manifest actions, policy change),
`test_offline_fake_unreal.py` (Hardening: reimport passes the preset).

```python
old = P.read_json("/abs/runs/2026-09-20/manifest.json")          # written by every run_import_plan
plan = P.plan_imports(P.scan_sources(EXPORTS), "/Game/MyGame/Art/Props", previous=old,
                      master="/Game/MyGame/MaterialLibrary/M_PropMaster")
new = {__import__("os").path.basename(i["source"]): {"sha1": i["sha1"]} for i in plan["items"]}
print(P.publish_diff(old, new))    # added / modified / removed / unchanged (same shape as scenario-maya-pipeline-scripting)
bumped = P.plan_imports(P.scan_sources(EXPORTS), "/Game/MyGame/Art/Props", previous=old, policy="PL_PropsImport@2")
print([(i["mesh_name"], i["reason"]) for i in bumped["items"] if i["action"] == "reimport"])
```

`reimport` items go through `InterchangeManager.reimport_asset`. Each asset stores the stack it was
imported with and reimport reuses it (Interchange doc), so `import_source` passes the preset in
`override_pipelines` on reimport too; and a preset change with unchanged sources is still a
reimport: bump `policy=` and the plan marks those items `reimport` with the reason
`import policy <old> -> <new>` (the manifest stores the policy per source). The reimport conflict
window can no longer keep material assignments: change the source or reassign by script. Removed
sources are reported, never deleted automatically (check `find_package_referencers_for_asset` and
ask before any delete; `delete_asset` is a force delete that may clear undo, 5.8 API).

---

## P12. A button for humans (Editor Utility)

Not yet run in Unreal. No offline test (Blueprint asset).

The agent needs no button; artists do. Build an Asset Action Utility (Content Browser > Editor
Utilities > Editor Utility Blueprint > Asset Action Utility), set Supported Classes first
(StaticMesh; empty SupportedClasses is a data validation error in 5.8), add a function whose body is
one Execute Python Script node (the supported bridge; Python-defined Blueprint Function Libraries
are not, Python doc):

```python
# body of the Execute Python Script node (input pin: none; output pin: report_path)
import unreal, ue_pipeline as P
sel = [a for a in unreal.EditorUtilityLibrary.get_selected_assets() if isinstance(a, unreal.StaticMesh)]
res = P.validate_paths([a.get_path_name().split(".")[0] for a in sel])
report_path = P.write_report(res["records"], unreal.Paths.project_saved_dir() + "PipelineReports/manual")["json"]
unreal.log("pipeline check: %s" % res["summary"])
```

Wrap edits in one transaction so Undo reverts the batch (Oztalay, m6mJ9r7ytks [00:05:10]); for long
jobs use an Editor Utility Task that always calls Finish Executing Task [00:22:03].

---

## P13. Datasmith (CAD, archviz) import

Not yet run in Unreal. No offline test.

```python
import unreal
scene = unreal.DatasmithSceneElement.construct_datasmith_scene_from_file("/abs/cad/plant.udatasmith")
if scene is None:
    raise RuntimeError("Datasmith could not read the file")
opts = scene.get_options(unreal.DatasmithImportOptions)
opts.base_options.scene_handling = unreal.DatasmithImportScene.NEW_LEVEL   # headless: load or create a level first [verify]
tess = scene.get_options(unreal.DatasmithCommonTessellationOptions)
if tess:
    tess.options.chord_tolerance, tess.options.max_edge_length, tess.options.normal_tolerance = 0.1, 0, 30
result = scene.import_scene("/Game/MyGame/CAD/Plant")
ok = result.import_succeed
scene.destroy_scene()        # frees memory
print(ok)                    # then P3-style post-processing (names, collision, Nanite) on the created assets
```

Do most edits after import: pre-import scene filtering is bypassed on reimport (Datasmith doc),
unlike Interchange pipelines, which are stored on the asset.

---

## P14. CI script (tiers)

Not yet run. The shell calls the tested CLI (`plan`, `verdict`, `compare-launcher`, `package`,
`parse-uat`; tests in `test_offline_pure.py`) and the lead's `ue_run.py`.

```bash
#!/bin/bash
# ci_pipeline.sh  PUSH | BUILD | WEEKEND     (project path without spaces; editor closed on this machine)
# Exit codes: every step is judged by its own verdict, never by the engine's exit code alone.
set -euo pipefail
TIER="${1:-PUSH}"
SK=/abs/skills
P="$SK/scenario-unreal-pipeline-automation/scripts"
R="$SK/scenario-unreal-expert/scripts"
PROJ=/abs/Dev/MyGame/MyGame.uproject
OUT=/abs/ci/$(date +%Y%m%d-%H%M%S)
mkdir -p "$OUT"
POLICY=PL_PropsImport@3 # bump when the preset changes
python3 "$P/ue_pipeline.py" plan --src /abs/Exports/Props --dest /Game/MyGame/Art/Props --out "$OUT/plan.json" \
  --previous /abs/ci/last/manifest.json --pipeline /Game/MyGame/Pipelines/PL_PropsImport --policy "$POLICY" \
  --stage "$OUT/staging"
python3 "$R/ue_run.py" --project "$PROJ" --timeout 14400 "$P/ue_pipeline_job.py" -- \
  "{\"action\": \"import\", \"plan\": \"$OUT/plan.json\", \"out_dir\": \"$OUT/import\"}" >"$OUT/import.json" || true
python3 "$P/ue_pipeline.py" verdict "$OUT/import.json" --require-summary-ok # red on a crashed or failed job
python3 "$R/ue_run.py" --project "$PROJ" --commandlet DataValidation >"$OUT/dv.json"
[ "$TIER" = PUSH ] && exit 0
SC=${P4PORT:+-autocheckout} # Perforce: read-only files need a checkout to resave
python3 "$R/ue_run.py" --project "$PROJ" --commandlet ResavePackages -- -fixupredirects $SC -projectonly >"$OUT/resave.json"
python3 "$P/ue_pipeline.py" compare-launcher --project "$PROJ" --archive "$OUT/build" \
  --launcher /abs/ci/launcher_buildcookrun.txt >"$OUT/launcher_diff.json" || echo "launcher diff: review $OUT/launcher_diff.json"
CMD=$(python3 "$P/ue_pipeline.py" package --project "$PROJ" --archive "$OUT/build" | head -1)
eval "$CMD" >"$OUT/uat.log" 2>&1
python3 "$P/ue_pipeline.py" parse-uat "$OUT/uat.log"
[ "$TIER" = WEEKEND ] && "/Users/Shared/Epic Games/UE_5.8/Engine/Build/BatchFiles/RunUAT.sh" RunUnreal \
  -project="$PROJ" -platform=Mac -configuration=Development -build=local -test=UE.BootTest
cp "$OUT/import/manifest.json" /abs/ci/last/manifest.json 2>/dev/null || true
```

Run it identically on a workstation and the build machine (Hamilton [00:25:15]); keep known failures
disabled rather than red so a new break shows (Hamilton [00:28:26]); zero warnings as the target
(Ari [00:19:59]); push when you can watch for about an hour (Fray [01:56:41]).
