"""
ut_pipeline: runner side of the scenario-unity-pipeline-automation skill (tools / build engineer).

Import pipeline for art drops (FBX + PNG), naming rules, prefabs, Addressables groups and labels
(packed by loading condition), content builds, content-validation tests, command-line builds
with a report, player smoke runs, and CI files. Imports the shared toolkit of scenario-unity-expert
(ut_env, ut_run, ut_live, ut_review, ut_stat); never copies it.

    import sys; sys.path.insert(0, "<skills>/scenario-unity-pipeline-automation/scripts")
    import ut_pipeline as up
    P = up.ut_env.base_project("3d", "<project>/tests/projects/my-pipeline")
    up.install(P)                                   # AgentKit core + Pipeline kit, Addressables 2.9.1, rules JSON
    drop = up.make_art_drop("/tmp/drop", n=200)     # Blender FBX + PNG, with known defects
    r = up.run_pipeline(P, drop, target="macos")    # import, prefabs, groups, content, tests, build, smoke (one platform)
    up.consistency_check(P, target="macos")         # -consistencyCheck: importers deterministic?
    up.counters(P), up.hard_references(P), up.release_check(P, profile), up.release_ready(repo, app)

System python3 3.9+, stdlib only (PIL used when present for faster PNGs; Blender for FBX).
Run in Unity 6000.3.21f1 on macOS (Apple Silicon) on 2026-09-24:
tests/code/unity-pipeline-automation/ (results in archive/tests/unity-pipeline-automation/).
"""

__version__ = "0.1"  # Unity Expert Skills v0.1 (2026-09-24): counters, consistency check, same target per stage, checks

import csv
import hashlib
import json
import os
import random
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
SKILLS = os.path.dirname(SKILL)
LEAD_SCRIPTS = os.path.join(SKILLS, "scenario-unity-expert", "scripts")
if LEAD_SCRIPTS not in sys.path:
    sys.path.insert(0, LEAD_SCRIPTS)

import ut_env    # noqa: E402
import ut_run    # noqa: E402
import ut_live   # noqa: E402, F401  re-exported: references/procedures.md imports it from here
import ut_review  # noqa: E402
import ut_stat   # noqa: E402, F401  kept with its siblings as part of the module's namespace

AGENTKIT_SRC = os.path.join(HERE, "AgentKit")          # AgentKit/Pipeline/** -> Assets/Editor/AgentKit/Pipeline/**
RUNTIME_SRC = os.path.join(HERE, "Runtime")            # copied to Assets/Scripts/AgentKitRuntime/
RULES_PATH = "Assets/Settings/Pipeline/prop_import_rules.json"
ADDRESSABLES_VERSION = "2.9.1"                         # the default this editor's manifest declares

# One file both sides read: the AssetPostprocessor (C#, declared with context.DependsOnSourceAsset
# so an edit reimports what it governs), the jobs, the content tests, and scan_drop() here.
DEFAULT_RULES = {
    "version": 1,
    "root": "Assets/Art/Props",
    "shared_folder": "_Shared",
    "name_pattern": "^[A-Z][A-Za-z0-9]*(_[A-Z][A-Za-z0-9]*)*_[0-9]{2}$",
    "suffix_roles": {
        "_BaseColor": "BaseColor", "_Albedo": "BaseColor", "_A": "BaseColor",
        "_Normal": "Normal", "_N": "Normal", "_nrm": "Normal",
        "_Mask": "Mask", "_Detail": "Detail",
    },
    "required_roles": ["BaseColor"],
    "linear_roles": ["Normal", "Mask"],
    "texture_max_size": 1024,
    "texture_max_size_mobile": 512,
    "vertex_budget": 5000,
    "min_size_m": 0.05,
    "max_size_m": 20.0,
    "category_label_prefix": "biome_",
    "group_prefix": "Props",
    "prebuild_gate": True,
    "prebuild_test_category": "PipelinePreBuild",
}

MODEL_EXTS = (".fbx",)
TEXTURE_EXTS = (".png", ".tga", ".jpg", ".jpeg", ".psd", ".exr")


# ============================================================================ install
def add_packages(project, packages):
    """Add or pin UPM packages in Packages/manifest.json before Unity opens the project (the
    editor resolves them at start; a batch job then imports them). Returns {name: (old, new)}.
    Pin explicit versions: this editor's manifest defaults lag the Manual (unity-6.3-traps)."""
    root = ut_env.find_project(project)["root"]
    path = os.path.join(root, "Packages", "manifest.json")
    with open(path) as f:
        man = json.load(f)
    deps = man.setdefault("dependencies", {})
    changed = {}
    for name, ver in packages.items():
        if deps.get(name) != ver:
            changed[name] = (deps.get(name), ver)
            deps[name] = ver
    if changed:
        man["dependencies"] = dict(sorted(deps.items()))
        with open(path, "w") as f:
            json.dump(man, f, indent=2)
            f.write("\n")
    return changed


def write_rules(project, rules=None, **overrides):
    """Write Assets/Settings/Pipeline/prop_import_rules.json (merged over DEFAULT_RULES).
    Changing it reimports the textures and models it governs (the postprocessor declares the
    dependency); changing the postprocessor CODE needs a GetVersion() bump instead."""
    root = ut_env.find_project(project)["root"]
    data = dict(DEFAULT_RULES)
    data.update(read_rules(project, default=None) or {})
    data.update(rules or {})
    data.update(overrides)
    path = os.path.join(root, RULES_PATH)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    text = json.dumps(data, indent=2, sort_keys=True) + "\n"
    old = Path(path).read_text() if os.path.isfile(path) else None
    if old != text:
        with open(path, "w") as f:
            f.write(text)
    return path


def read_rules(project=None, default=DEFAULT_RULES, path=None):
    if path is None:
        if project is None:
            return dict(default) if default else None
        path = os.path.join(ut_env.find_project(project)["root"], RULES_PATH)
    if not os.path.isfile(path):
        return dict(default) if default else None
    with open(path) as f:
        return json.load(f)


def install(project, addressables=ADDRESSABLES_VERSION, rules=None, runtime=True, tests=True):
    """AgentKit core (scenario-unity-expert) + this skill's C# (Assets/Editor/AgentKit/Pipeline/), the
    runtime smoke component (Assets/Scripts/AgentKitRuntime/), the rules JSON, Addressables.
    tests=False leaves out the NUnit content tests (they compile into Assembly-CSharp-Editor,
    which the Test Framework scans: observed 2026-09-24). Returns what changed."""
    root = ut_env.find_project(project)["root"]
    out = {"core": ut_env.install_agentkit(root)}
    written = []
    for dirpath, _dirs, files in os.walk(AGENTKIT_SRC):
        rel = os.path.relpath(dirpath, AGENTKIT_SRC)          # "Pipeline", "Pipeline/Tests"
        if not tests and "Tests" in rel.split(os.sep):
            continue
        for fn in files:
            if fn.endswith(".cs") or fn.endswith(".asmdef"):      # PipelineCli/ has its own asmdef (package-gated)
                written += _copy_if_changed(os.path.join(dirpath, fn),
                                            os.path.normpath(os.path.join(root, "Assets", "Editor", "AgentKit", rel, fn)), root)
    out["pipeline"] = written
    if runtime and os.path.isdir(RUNTIME_SRC):
        rt = []
        for fn in os.listdir(RUNTIME_SRC):
            if fn.endswith(".cs"):
                rt += _copy_if_changed(os.path.join(RUNTIME_SRC, fn),
                                       os.path.join(root, "Assets", "Scripts", "AgentKitRuntime", fn), root)
        out["runtime"] = rt
    if addressables:
        out["packages"] = add_packages(root, {"com.unity.addressables": addressables})
    out["rules"] = os.path.relpath(write_rules(root, rules), root)
    return out


TEMPLATES = os.path.join(HERE, "templates")


def install_asmdef_template(project, folder="Assets/Pipeline", name="PipelineAsmdef"):
    """Project-side pipeline code in its own assemblies (the layout the Test Framework expects):
    <folder>/Editor/Game.Pipeline.Editor.asmdef (Editor only, UnityEditor APIs) and
    <folder>/Tests/Game.Pipeline.Tests.asmdef (test assembly: nunit, UnityEditor.TestRunner,
    UNITY_INCLUDE_TESTS) referencing it. A test assembly cannot reference Assembly-CSharp or
    Assembly-CSharp-Editor (observed: CS0103 "The name 'AgentKit' does not exist in the current
    context", and that one error aborts every batch job), so AgentKit's own content tests stay next
    to the kit, and a team's pipeline rules that tests must call go here.
    Returns the written paths (relative to the project)."""
    root = ut_env.find_project(project)["root"]
    src = os.path.join(TEMPLATES, name)
    written = []
    for dirpath, _d, files in os.walk(src):
        rel = os.path.relpath(dirpath, src)
        for fn in sorted(files):
            if fn.endswith((".cs", ".asmdef")):
                written += _copy_if_changed(os.path.join(dirpath, fn), os.path.normpath(os.path.join(root, folder, rel, fn)), root)
    return written


def _copy_if_changed(src, dst, root):
    with open(src, "rb") as f:
        data = f.read()
    if os.path.isfile(dst):
        with open(dst, "rb") as f:
            if f.read() == data:
                return []
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, "wb") as f:
        f.write(data)
    return [os.path.relpath(dst, root)]


# ============================================================================ naming (mirror of PipelineRules.cs)
def normalize_name(raw):
    """'barrel wood 7' -> 'Barrel_Wood_07'; 'Pot-Clay-Big' -> 'Pot_Clay_Big_01'. Same algorithm as
    AgentKit.Pipeline.PipelineRules.Normalize (checked against it in the live test)."""
    tokens = [t for t in re.split(r"[\s\-_\.]+", raw.strip()) if t]
    if not tokens:
        return ""
    out = []
    for t in tokens:
        out.append(t if t[0].isdigit() else t[0].upper() + t[1:])
    if out[-1].isdigit():
        out[-1] = out[-1].zfill(2)
    else:
        out.append("01")
    return "_".join(out)


def texture_role(stem, rules=None):
    """('Barrel_Wood_07_nrm') -> ('Normal', 'Barrel_Wood_07'). Longest matching suffix wins,
    case-insensitive. ('Unknown', stem) when no suffix matches."""
    rules = rules or DEFAULT_RULES
    best = None
    for suf, role in rules["suffix_roles"].items():
        if stem.lower().endswith(suf.lower()) and (best is None or len(suf) > len(best[0])):
            best = (suf, role)
    if best is None:
        return "Unknown", stem
    return best[1], stem[: len(stem) - len(best[0])]


def scan_drop(drop, rules=None):
    """Offline preflight of an art drop, before any Unity process: what will be accepted,
    renamed or rejected, with reasons. The C# ImportDrop job is authoritative; this lets an
    agent answer 'what is wrong with this drop' in milliseconds."""
    rules = rules or DEFAULT_RULES
    pat = re.compile(rules["name_pattern"])
    manifest = _read_manifest(drop)
    props, rejects, renames, seen, shared = [], [], [], {}, []
    for dirpath, _dirs, files in os.walk(drop):
        rel = os.path.relpath(dirpath, drop)
        if rel.startswith("_gen"):
            continue
        for fn in sorted(files):
            stem, ext = os.path.splitext(fn)
            if rel == "Shared":                                  # drop convention; lands in <root>/<shared_folder>
                if ext.lower() in TEXTURE_EXTS:
                    shared.append(os.path.join(rel, fn))
                continue
            if ext.lower() not in MODEL_EXTS:
                continue
            name = normalize_name(stem)
            reasons = []
            if not pat.match(name):
                reasons.append("name '%s' does not match %s after normalization" % (name, rules["name_pattern"]))
            if name != stem:
                renames.append({"from": os.path.join(rel, fn), "to": name})
            texs = {}
            for other in files:
                ost, oext = os.path.splitext(other)
                if oext.lower() not in TEXTURE_EXTS:
                    continue
                role, base = texture_role(ost, rules)
                if role != "Unknown" and normalize_name(base) == name:
                    texs[role] = other
            for req in rules.get("required_roles", []):
                if req not in texs:
                    reasons.append("missing %s texture" % req)
            item = {"file": os.path.join(rel, fn), "name": name, "category": rel.split(os.sep)[0],
                    "textures": texs, "labels": manifest.get(os.path.join(rel, fn), {}).get("labels", []),
                    "reasons": reasons}
            seen.setdefault(name, []).append(item)
    for name, items in seen.items():                       # a duplicate name is ambiguous: reject every copy
        if len(items) > 1:
            for it in items:
                it["reasons"].append("duplicate name (%s)" % ", ".join(i["file"] for i in items))
    for items in seen.values():
        for it in items:
            (rejects if it["reasons"] else props).append(it)
    renames = [r for r in renames if not any(x["file"] == r["from"] for x in rejects)]
    return {"accepted": len(props), "rejected": sorted(rejects, key=lambda x: x["file"]), "renamed": renames,
            "shared_textures": shared, "props": sorted(props, key=lambda x: x["file"])}


def _read_manifest(drop):
    path = os.path.join(drop, "manifest.csv")
    out = {}
    if not os.path.isfile(path):
        return out
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            out[row["file"]] = {"labels": [x for x in (row.get("labels") or "").split(";") if x],
                                "detail": row.get("detail") or ""}
    return out


# ============================================================================ art drop generation
CATEGORIES = {
    "Forest": ["Barrel_Wood", "Crate_Wood", "Stump_Oak", "Log_Pile", "Mushroom_Red", "Fence_Wood", "Rock_Mossy",
               "Lantern_Iron", "Bench_Wood", "Well_Stone"],
    "Desert": ["Pot_Clay", "Cactus_Tall", "Rock_Sand", "Barrel_Metal", "Tent_Pole", "Crate_Metal", "Bones_Camel",
               "Urn_Clay", "Sign_Wood", "Anvil_Iron"],
    "Dungeon": ["Chest_Iron", "Torch_Metal", "Bone_Pile", "Grate_Metal", "Pillar_Stone", "Skull_Stack",
                "Cage_Iron", "Altar_Stone", "Door_Iron", "Brazier_Metal"],
}
SHAPE_BY_WORD = {"Barrel": "cylinder", "Log": "cylinder", "Pillar": "cylinder", "Stump": "cylinder", "Torch": "cylinder",
                 "Pot": "sphere", "Urn": "sphere", "Rock": "ico", "Mushroom": "cone", "Cactus": "cylinder",
                 "Tent": "cone", "Skull": "ico", "Bone": "ico", "Bones": "ico", "Brazier": "cone", "Well": "torus",
                 "Cage": "cube", "Chest": "cube", "Crate": "cube", "Fence": "cube", "Bench": "cube", "Sign": "cube",
                 "Anvil": "cube", "Grate": "cube", "Altar": "cube", "Door": "cube", "Lantern": "cube"}

_BLENDER_SCRIPT = r'''
import bpy, json, sys, math
args = json.loads(open(sys.argv[sys.argv.index("--") + 1]).read())
def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials): bpy.data.materials.remove(m)
def make(shape, dims, name, dense=False):
    x, y, z = dims
    if shape == "cylinder":
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.5, depth=1.0)
    elif shape == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.5)
    elif shape == "ico":
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=6 if dense else 2, radius=0.5)
    elif shape == "cone":
        bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.5, depth=1.0)
    elif shape == "torus":
        bpy.ops.mesh.primitive_torus_add(major_radius=0.4, minor_radius=0.1)
    else:
        bpy.ops.mesh.primitive_cube_add(size=1.0)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (x, y, z)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    zmin = min((ob.matrix_world @ v.co).z for v in ob.data.vertices)
    for v in ob.data.vertices: v.co.z -= zmin          # pivot at the base: props sit on the ground
    return ob
for p in args["props"]:
    clear()
    parts = []
    main = make(p["shape"], p["dims"], p["mesh_name"], p.get("dense", False))
    parts.append(main)
    if p.get("two_parts"):
        head = make("sphere", [p["dims"][0] * 1.4] * 3, p["mesh_name"] + "_Head")
        head.location.z = p["dims"][2]
        parts.append(head)
    for i, ob in enumerate(parts):
        mat = bpy.data.materials.new("MAT_%s_%d" % (p["mesh_name"], i))
        ob.data.materials.append(mat)
    if p.get("scale") and p["scale"] != 1:
        for ob in parts:
            ob.scale = (p["scale"],) * 3
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.select_all(action="SELECT")
    legacy = p.get("legacy_export", False)      # Blender defaults: FBX_SCALE_NONE, no Apply Transform
    bpy.ops.export_scene.fbx(filepath=p["out"], use_selection=True, object_types={"MESH"},
                             apply_scale_options="FBX_SCALE_NONE" if legacy else "FBX_SCALE_ALL",
                             axis_forward="-Z", axis_up="Y", bake_space_transform=not legacy,
                             mesh_smooth_type="FACE", use_mesh_modifiers=True,
                             add_leaf_bones=False, bake_anim=False, path_mode="STRIP")
print("GENERATED", len(args["props"]))
'''


def make_art_drop(dest, n=200, seed=7, defects=True, tex_size=256, blender=None, timeout=900):
    """Write a synthetic art drop the way an outsourcer delivers it:
      <dest>/<Category>/<Name>.fbx (Blender 5.2 FBX export: Apply Scalings "FBX All", Apply Transform
      on, -Z forward, Y up: rotation 0 and scale 1 in Unity, observed 2026-09-24)
      <dest>/<Category>/<Name>_BaseColor.png, _Normal.png   <dest>/Shared/<Name>_Detail.png
      <dest>/manifest.csv  (file, extra loading-condition labels, shared detail texture)
    With defects=True it also contains, on purpose: a lowercase name with spaces and a one-digit
    variant plus an alias suffix (_nrm), a hyphenated name without variant, a centimetre export
    (x100), an over-budget mesh, a prop without a BaseColor texture, a duplicate name across
    folders (both copies rejected), a 4096 px texture, a two-mesh prop, a Blender-defaults export
    (root rotated 90 degrees on X and scaled x100 in Unity), and stray files. Returns the manifest dict
    (also written to <dest>/_gen/expected.json) with the expected outcome of each defect."""
    rng = random.Random(seed)
    os.makedirs(dest, exist_ok=True)
    gen = os.path.join(dest, "_gen")
    os.makedirs(gen, exist_ok=True)
    cats = list(CATEGORIES)
    per_cat = [n // 3 + (1 if i < n % 3 else 0) for i in range(3)]
    props, rows = [], []
    for ci, cat in enumerate(cats):
        os.makedirs(os.path.join(dest, cat), exist_ok=True)
        words = CATEGORIES[cat]
        for k in range(per_cat[ci]):
            base = words[k % len(words)]
            variant = k // len(words) + 1
            name = "%s_%02d" % (base, variant)
            first = base.split("_")[0]
            shape = SHAPE_BY_WORD.get(first, "cube")
            s = rng.uniform(0.4, 1.6)
            dims = [round(s * rng.uniform(0.6, 1.2), 3), round(s * rng.uniform(0.6, 1.2), 3), round(s * rng.uniform(0.8, 1.8), 3)]
            metal = any(w in base for w in ("Metal", "Iron"))
            labels = []
            if base.startswith("Rock_Mossy") and variant % 2 == 0:
                labels.append("biome_dungeon")          # the same rock streams in the dungeon too
            if base.startswith("Pot_Clay") and variant % 3 == 0:
                labels.append("biome_dungeon")
            props.append({"category": cat, "file_stem": name, "name": name, "shape": shape, "dims": dims,
                          "detail": "Trim_Metal_01" if metal else "Grime_01", "labels": labels})
    expected = {"renamed": {}, "rejected": {}, "prefab_errors": {}, "warnings": {}, "big_textures": {}}
    if defects:
        def find(cat, pred):
            for p in props:
                if p["category"] == cat and pred(p):
                    return p
            raise RuntimeError("no prop for defect in %s" % cat)
        p = find("Forest", lambda q: q["name"].startswith("Barrel_Wood"))
        p["file_stem"] = p["name"].replace("_", " ").lower().replace(" 0", " ")   # 'barrel wood 1'
        p["normal_suffix"] = "_nrm"
        expected["renamed"][p["file_stem"]] = p["name"]
        p = find("Desert", lambda q: q["name"].startswith("Pot_Clay") and q["name"].endswith("_01"))
        p["file_stem"] = "Pot-Clay"                                                   # -> Pot_Clay_01
        expected["renamed"]["Pot-Clay"] = "Pot_Clay_01"
        p = find("Dungeon", lambda q: q["name"].startswith("Pillar_Stone"))
        p["scale"] = 100.0                                                            # centimetre export
        expected["prefab_errors"][p["name"]] = "size"
        p = find("Forest", lambda q: q["name"].startswith("Rock_Mossy"))
        p["dense"] = True                                                             # over the vertex budget
        p["shape"] = "ico"
        expected["warnings"][p["name"]] = "vertex_budget"
        p = find("Desert", lambda q: q["name"].startswith("Rock_Sand"))
        p["no_basecolor"] = True
        expected["rejected"][p["name"]] = "missing BaseColor texture"
        p = find("Dungeon", lambda q: q["name"].startswith("Torch_Metal"))
        p["two_parts"] = True
        p = find("Dungeon", lambda q: q["name"].startswith("Door_Iron"))
        p["big_texture"] = 4096
        expected["big_textures"][p["name"]] = 4096
        p = find("Desert", lambda q: q["name"].startswith("Urn_Clay"))
        p["legacy_export"] = True                                                     # Blender defaults
        expected["warnings"][p["name"]] = "rotation+scale"
        # duplicate name across folders: a second Crate_Wood_01 delivered in Desert
        dup = dict(find("Forest", lambda q: q["name"] == "Crate_Wood_01"))
        dup.update({"category": "Desert", "labels": []})
        props.append(dup)
        expected["rejected"]["Desert/Crate_Wood_01"] = "duplicate name"
        expected["rejected"]["Forest/Crate_Wood_01"] = "duplicate name"
        with open(os.path.join(dest, "Forest", "notes.txt"), "w") as f:
            f.write("stray file from the outsourcer, must be ignored\n")
    # FBX through Blender
    bprops = []
    for p in props:
        p["mesh_name"] = "SM_" + p["name"]
        p["out"] = os.path.join(dest, p["category"], p["file_stem"] + ".fbx")
        bprops.append({k: p.get(k) for k in ("shape", "dims", "mesh_name", "out", "dense", "two_parts", "scale", "legacy_export")})
    args_path = os.path.join(gen, "blender_args.json")
    with open(args_path, "w") as f:
        json.dump({"props": bprops}, f)
    script_path = os.path.join(gen, "make_drop.py")
    with open(script_path, "w") as f:
        f.write(_BLENDER_SCRIPT)
    blender = blender or shutil.which("blender") or "/Applications/Blender.app/Contents/MacOS/Blender"
    t0 = time.time()
    r = subprocess.run([blender, "-b", "--factory-startup", "-P", script_path, "--", args_path],
                       capture_output=True, text=True, timeout=timeout)
    if "GENERATED" not in r.stdout:
        raise RuntimeError("Blender export failed:\n" + r.stdout[-3000:] + r.stderr[-2000:])
    blender_s = round(time.time() - t0, 1)
    # textures
    t0 = time.time()
    os.makedirs(os.path.join(dest, "Shared"), exist_ok=True)
    _write_texture(os.path.join(dest, "Shared", "Grime_01_Detail.png"), tex_size, (120, 110, 100), rng, "gray")
    _write_texture(os.path.join(dest, "Shared", "Trim_Metal_01_Detail.png"), tex_size, (140, 140, 150), rng, "gray")
    hue = {"Forest": (70, 120, 50), "Desert": (190, 160, 100), "Dungeon": (90, 85, 95)}
    for p in props:
        folder = os.path.join(dest, p["category"])
        if not p.get("no_basecolor"):
            size = p.get("big_texture") or tex_size
            _write_texture(os.path.join(folder, p["file_stem"] + "_BaseColor.png"), size, hue[p["category"]], rng, "color")
        _write_texture(os.path.join(folder, p["file_stem"] + p.get("normal_suffix", "_Normal") + ".png"), tex_size,
                       (128, 128, 255), rng, "normal")
        rows.append({"file": os.path.join(p["category"], p["file_stem"] + ".fbx"), "labels": ";".join(p["labels"]),
                     "detail": p["detail"]})
    with open(os.path.join(dest, "manifest.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["file", "labels", "detail"])
        w.writeheader()
        w.writerows(rows)
    out = {"dest": os.path.abspath(dest), "fbx": len(props), "textures": sum(1 for _ in _walk_files(dest, TEXTURE_EXTS)),
           "blender_s": blender_s, "textures_s": round(time.time() - t0, 1), "seed": seed, "expected": expected,
           "blender": blender}
    with open(os.path.join(gen, "expected.json"), "w") as f:
        json.dump(out, f, indent=2)
    return out


def _walk_files(root, exts):
    for dirpath, _d, files in os.walk(root):
        for fn in files:
            if fn.lower().endswith(exts):
                yield os.path.join(dirpath, fn)


def _write_texture(path, size, rgb, rng, kind):
    """Small procedural PNG: noise around a base colour, a flat-ish normal map, or grey detail.
    PIL when available (fast), else the pure-Python encoder of ut_review."""
    try:
        from PIL import Image  # noqa: WPS433
        if kind == "normal":
            img = Image.new("RGB", (size, size), rgb)
            px = img.load()
            step = max(1, size // 64)
            for y in range(0, size, step):
                for x in range(0, size, step):
                    d = rng.randint(-12, 12)
                    for yy in range(y, min(y + step, size)):
                        for xx in range(x, min(x + step, size)):
                            px[xx, yy] = (128 + d, 128 - d, 250)
        else:
            noise = Image.effect_noise((size, size), 40).convert("L")
            base = Image.new("RGB", (size, size), rgb)
            if kind == "gray":
                img = noise.convert("RGB")
            else:
                img = Image.blend(base, Image.merge("RGB", (noise, noise, noise)), 0.25)
        img.save(path, optimize=False)
        return
    except ImportError:
        pass
    px = []
    for y in range(size):
        for x in range(size):
            d = rng.randint(-10, 10)
            if kind == "normal":
                px.append((128 + d // 2, 128 - d // 2, 250))
            else:
                px.append(tuple(max(0, min(255, c + d)) for c in rgb))
    ut_review.write_png(path, size, size, px)


# ============================================================================ stages (batch jobs)
NS = "AgentKit.Pipeline."


def cli_target(target):
    """'macos' -> 'StandaloneOSX' (ut_run.TARGETS); a BuildTarget name passes through; None stays None."""
    if not target:
        return None
    return ut_run.TARGETS.get(str(target).lower(), (target, target))[0]


# Every stage takes target= and launches with -buildTarget: the build target is an import dependency
# (Abud Chavez, S2P9n5U9xVw [00:15:49]) and a project never imported starts on the default platform
# (6.3 Manual, -batchmode), so a stage launched on another platform reimports textures for it and the
# next stage reimports them back (measured: test_live_checks.py target_switch).
def import_drop(project, drop, target=None, timeout=3600, **args):
    """AgentKit.Pipeline.ArtDropJobs.ImportDrop: plan (names, roles, rejects), copy changed files
    into <root>/<Category>/<Name>/ inside one StartAssetEditing/StopAssetEditing batch, import,
    then audit every imported texture and model against the rules. result["import_assetdb"]: the
    AssetDatabase counters of the batch (gate: refreshes 1). -nographics is fine."""
    a = {"drop": os.path.abspath(drop)}
    a.update(args)
    return ut_run.run_method(project, NS + "ArtDropJobs.ImportDrop", a, timeout=timeout, build_target=cli_target(target))


def build_prefabs(project, target=None, timeout=3600, **args):
    """AgentKit.Pipeline.ArtDropJobs.BuildPrefabs: URP Lit material per prop, FBX material remap
    (SaveAndReimport inside one batch: result["remap_assetdb"]["refreshes"] is 1, not one per FBX),
    Prefab Variant of each model prefab with a BoxCollider, size and budget checks. Built in a
    preview scene: never touches the user's open scene."""
    return ut_run.run_method(project, NS + "ArtDropJobs.BuildPrefabs", args, timeout=timeout, build_target=cli_target(target))


def assign_addressables(project, layout="condition", key_by="label", target=None, timeout=1800, **args):
    """AgentKit.Pipeline.AddressablesJobs.AssignGroups. layout: 'condition' (group every asset by
    the set of loading conditions that need it; shared dependencies placed explicitly, Valheim's
    rule), 'category' (one group per art folder, the naive layout), 'isolate' (category groups +
    Addressables Analyze 'Fix' = one Duplicate Asset Isolation group). Labels and groups are
    created in ordinal order (the settings keep insertion order)."""
    a = {"layout": layout, "key_by": key_by}
    a.update(args)
    return ut_run.run_method(project, NS + "AddressablesJobs.AssignGroups", a, timeout=timeout, build_target=cli_target(target))


def build_content(project, target="macos", clean=True, layout_report=True, timeout=3600, **args):
    """AgentKit.Pipeline.AddressablesJobs.BuildContent in a process launched on the target platform
    (-buildTarget): builder index, ClearCachedData + BuildCache.PurgeCache(false) when clean,
    BuildPlayerContent, then reads the build layout (bundles, sizes, duplicates, bytes loaded per
    label) and copies addressables_content_state.bin into Builds/ContentState/<target>/."""
    a = {"clean": clean, "layout_report": layout_report}
    a.update(args)
    return ut_run.run_method(project, NS + "AddressablesJobs.BuildContent", a, timeout=timeout,
                             build_target=cli_target(target))


def audit(project, target=None, timeout=1800, **args):
    return ut_run.run_method(project, NS + "ArtDropJobs.AuditProps", args, timeout=timeout, build_target=cli_target(target))


# ============================================================================ checks
def counters(project, target=None, extra_args=None, timeout=1800):
    """AgentKit.Pipeline.PipelineChecks.Counters: AssetDatabase counters since this editor started
    (UnityEditor.Experimental.AssetDatabaseExperimental.counters on 6.3): imports, refreshes, domain
    reloads, cache-server connects and artifacts. A job launched right after a change
    reports what the launch refresh cost (e.g. a platform switch, a postprocessor change)."""
    return ut_run.run_method(project, NS + "PipelineChecks.Counters", {}, timeout=timeout,
                             build_target=cli_target(target), extra_args=extra_args)


def hard_references(project, scenes=None, target=None, timeout=1800):
    """AgentKit.Pipeline.PipelineChecks.HardReferences: build scenes (active profile or Build
    Settings, or `scenes`) whose dependencies include Addressable entries (loaded twice) or assets
    under the governed art root. result["ok"] is False on any Addressable reference."""
    a = {"scenes": list(scenes)} if scenes else {}
    return ut_run.run_method(project, NS + "PipelineChecks.HardReferences", a, timeout=timeout, build_target=cli_target(target))


def release_check(project, profile=None, forbidden=None, target=None, timeout=1800):
    """AgentKit.Pipeline.PipelineChecks.ReleaseCheck: the profile's and the Player settings' defines
    against forbidden regexes (default PipelineChecks.DefaultForbiddenDefines, or
    Assets/Settings/Pipeline/pipeline_checks.json), non-empty scene list, Development off."""
    a = {}
    if profile:
        a["profile"] = profile
    if forbidden is not None:
        a["forbidden"] = list(forbidden)
    return ut_run.run_method(project, NS + "PipelineChecks.ReleaseCheck", a, timeout=timeout, build_target=cli_target(target))


# Lines the 6.3 editor writes for -consistencyCheck (observed 2026-09-24, test_live_checks.py consistency):
#   Importer(TextureImporter) generated inconsistent result for asset(guid:bf2e...) "Assets/_ConsistencyProbe/T_Probe_BaseColor.png"
#   ConsistencyChecker - total checked: 12184, found inconsistencies: 3, skipped: 7390
_CONSISTENCY_ASSET = re.compile(r'Importer\((\w+)\) generated inconsistent result for asset\(guid:([0-9a-f]+)\) "([^"]+)"')
_CONSISTENCY_SUMMARY = re.compile(r"ConsistencyChecker - total checked: (\d+), found inconsistencies: (\d+), skipped: (\d+)")


def parse_consistency(text, scope=("Assets/",), baseline=()):
    """-> {"checked", "found", "skipped", "assets": [{importer, guid, path}], "in_scope": [...], "summary_seen"}.
    in_scope = flagged assets under `scope` minus `baseline` paths (known package or third-party
    inconsistencies: two URP 17.3 shaders were flagged in a -nographics run here)."""
    assets = [{"importer": m.group(1), "guid": m.group(2), "path": m.group(3)} for m in _CONSISTENCY_ASSET.finditer(text)]
    m = _CONSISTENCY_SUMMARY.search(text)
    in_scope = [a for a in assets if a["path"].startswith(tuple(scope)) and a["path"] not in set(baseline)]
    return {"checked": int(m.group(1)) if m else None, "found": int(m.group(2)) if m else None,
            "skipped": int(m.group(3)) if m else None, "summary_seen": bool(m), "assets": assets, "in_scope": in_scope}


def consistency_check(project, target=None, timeout=3600, extra_args=None, scope=("Assets/",), baseline=()):
    """Importer determinism, the way the 6.3 Manual proves it: launch with -consistencyCheck (every
    asset whose import can be checked is reimported and compared with the cached artifact; each
    difference is logged, and with -consistencyCheckSourceMode cacheserver nothing inconsistent is
    uploaded to Unity Accelerator). Run it before trusting a shared cache or a CI Library, and after
    any change to an AssetPostprocessor or ScriptedImporter. Observed: 12,184 checked in 23.5 s here.
    Returns {"ok" (no flagged asset in scope), "checked", "found", "in_scope", "assets", "seconds", ...}."""
    r = ut_run.run_method(project, "AgentKit.AgentJob.Echo", {"consistency": True}, timeout=timeout,
                          build_target=cli_target(target), extra_args=["-consistencyCheck"] + list(extra_args or []))
    parsed = parse_consistency(ut_run.read_text(r.get("log")), scope, baseline)
    out = {"ok": bool(r.get("ok")) and parsed["summary_seen"] and not parsed["in_scope"], "job_ok": r.get("ok"),
           "seconds": r.get("seconds"), "log": r.get("log"), "exit_code": r.get("exit_code"),
           "active_target": r.get("active_target"), "error": r.get("error")}
    out.update(parsed)
    if r.get("ok") and not parsed["summary_seen"]:
        out["error"] = "no ConsistencyChecker summary line in the log (flag not passed through?)"
    return out


# ============================================================================ git and provenance (release builds)
def git_state(repo):
    """{"repo", "revision", "dirty": [porcelain lines]} for the project's repository. A release
    build starts from a clean tree, and a pipeline rerun must leave it clean (change-only writes)."""
    def git(*a):
        return subprocess.run(["git", "-C", repo] + list(a), capture_output=True, text=True)
    top = git("rev-parse", "--show-toplevel")
    if top.returncode != 0:
        return {"repo": False, "revision": None, "dirty": []}
    rev = git("rev-parse", "HEAD").stdout.strip() or None
    dirty = [ln for ln in git("status", "--porcelain", "--untracked-files=all").stdout.splitlines() if ln.strip()]
    return {"repo": True, "root": top.stdout.strip(), "revision": rev, "dirty": dirty}


def provenance(build_output):
    """The Unity CLI's provenance manifest of a `unity build` (unity-build.provenance.json: editor
    version and changeset, packages, target, profile, execute method, git revision and dirty flag,
    outcome). Observed on macOS: written INSIDE the .app bundle root, where codesign does not
    expect loose files, so copy it out before signing. Returns the dict (plus "path") or None."""
    out = os.path.abspath(build_output)
    for cand in (os.path.join(out, "unity-build.provenance.json"),
                 os.path.join(os.path.dirname(out), "unity-build.provenance.json")):
        if os.path.isfile(cand):
            with open(cand) as f:
                d = json.load(f)
            d["path"] = cand
            return d
    return None


def release_ready(repo, build_output=None):
    """Release gate on the runner side: a clean git tree now, and (when the build went through the
    Unity CLI) a provenance manifest that recorded a clean tree. Returns {"ok", "problems", ...}."""
    st = git_state(repo)
    problems = []
    if not st["repo"]:
        problems.append("not a git repository: no provenance for a release build")
    elif st["dirty"]:
        problems.append("dirty tree: %d change(s), first: %s" % (len(st["dirty"]), st["dirty"][0]))
    prov = provenance(build_output) if build_output else None
    if build_output and prov is None:
        problems.append("no unity-build.provenance.json for %s (built without the Unity CLI?)" % build_output)
    elif prov is not None:
        g = prov.get("git") or prov.get("source") or {}
        if g.get("dirty") is True:
            problems.append("provenance says the tree was dirty at build time")
        if not g:
            problems.append("provenance has no git block (project not in a git repository at build time)")
    return {"ok": not problems, "problems": problems, "git": st, "provenance": prov}


def run_pipeline(project, drop, target="macos", out=None, profile=None, tests=True, smoke_label="biome_forest",
                 layout="condition", release=False):
    """The CI sequence, one Unity process per stage (as a CI runner would), every stage launched on
    the SAME platform (-buildTarget): import, prefabs, groups, content build, EditMode tests, player
    build (profile or target; release=True adds -agentRelease so the gate refuses debug defines),
    player smoke run. Stops at the first failed stage, including a stage whose envelope reports
    another active platform. Returns {stage: envelope summary}."""
    stages = {}
    cli = cli_target(target)
    seen_targets = {}

    def step(name, fn):
        t0 = time.time()
        r = fn()
        ok = bool(r.get("ok"))
        if r.get("active_target"):
            seen_targets[name] = r["active_target"]
            if len(set(seen_targets.values())) > 1:
                ok = False
                r["error"] = "stages ran on different platforms: %s" % seen_targets
        stages[name] = {"ok": ok, "seconds": round(time.time() - t0, 1), "error": r.get("error"),
                        "active_target": r.get("active_target"),
                        "result": r.get("result") if name != "tests" else r.get("summary")}
        return ok

    if not step("import", lambda: import_drop(project, drop, target=target)):
        return stages
    if not step("prefabs", lambda: build_prefabs(project, target=target)):
        return stages
    if not step("addressables", lambda: assign_addressables(project, layout=layout, target=target)):
        return stages
    if not step("content", lambda: build_content(project, target)):
        return stages
    if tests and not step("tests", lambda: ut_run.run_tests(project, "EditMode", extra_args=["-buildTarget", cli])):
        return stages
    build = ut_run.build(project, target, profile=profile, out=out, extra_args=["-agentRelease"] if release else None)
    stages["build"] = {"ok": bool(build.get("ok")), "seconds": build.get("seconds"), "error": build.get("error"),
                       "active_target": build.get("active_target"), "result": build.get("result")}
    if build.get("ok") and target.lower() in ("macos", "osx", "standaloneosx") and smoke_label:
        app = build["result"]["output_path"]
        stages["smoke"] = player_smoke(app, smoke_label)
    return stages


# ============================================================================ player smoke
def player_smoke(app, label, timeout=120, extra_args=None):
    """Launch a built macOS player headless and let AgentAddressablesSmoke load every Addressable
    with `label`, then quit. Reads the player log line `AGENT_SMOKE {json}`.
      <Game>.app/Contents/MacOS/<exe> -batchmode -nographics -logFile <log> -agentSmoke <label>
    Proves the content build and the catalog ship inside the player, not only in the editor."""
    app = os.path.abspath(app)
    macos = os.path.join(app, "Contents", "MacOS")
    exes = [f for f in os.listdir(macos)] if os.path.isdir(macos) else []
    if not exes:
        return {"ok": False, "error": "no executable in %s" % macos}
    exe = os.path.join(macos, exes[0])
    log = os.path.join(os.path.dirname(app), "smoke-%s.log" % label)
    cmd = [exe, "-batchmode", "-nographics", "-logFile", log, "-agentSmoke", label] + list(extra_args or [])
    t0 = time.time()
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        code = p.returncode
    except subprocess.TimeoutExpired:
        code = None
    text = ut_run.read_text(log)
    res = None
    for line in text.splitlines():
        i = line.find("AGENT_SMOKE ")
        if i >= 0:
            try:
                res = json.loads(line[i + len("AGENT_SMOKE "):])
            except ValueError:
                pass
    out = {"ok": bool(res and res.get("ok")), "exit_code": code, "seconds": round(time.time() - t0, 1),
           "log": log, "result": res, "cmd": cmd}
    if res is None:
        out["error"] = "no AGENT_SMOKE line: boot scene without AgentAddressablesSmoke, or the player crashed"
    return out


# ============================================================================ CI files
def ci_shell(project_rel="..", unity_version="6000.3.21f1", target="StandaloneOSX", drop_var="ART_DROP",
             profile=None, out="Builds/macOS/Game.app", layout="condition"):
    """A CI script with raw Unity commands (no Python on the runner): one Unity process per stage,
    AgentKit job protocol (args.json in, result.json out), stop at the first failure.
    - The SAME platform on every stage, tests included (TARGET_ARGS): build target is an import
      dependency, so a stage on another platform reimports textures (measured in test_live_checks.py).
    - -runTests never gets -quit.
    - Optional, from the environment: ACCELERATOR=host:port (Unity Accelerator; -quit then needs
      -cacheServerWaitForUploadCompletion), CONSISTENCY=1 (a -consistencyCheck stage before trusting
      a shared cache), RELEASE=1 (clean git tree required, build launched with -agentRelease so the
      pre-build gate refuses debug defines)."""
    prof = ' -activeBuildProfile "%s"' % profile if profile else ""
    return """#!/usr/bin/env bash
# Generated by ut_pipeline.ci_shell (scenario-unity-pipeline-automation v0.2). One Unity process per stage.
# Usage: ART_DROP=/abs/drop ci/pipeline.sh     (UNITY=/path/to/Unity to override the editor)
#   ACCELERATOR=host:10080  use Unity Accelerator     CONSISTENCY=1  -consistencyCheck stage first
#   RELEASE=1               clean git tree + -agentRelease on the build
set -euo pipefail
UNITY="${UNITY:-/Applications/Unity/Hub/Editor/%(ver)s/Unity.app/Contents/MacOS/Unity}"
P="$(cd "$(dirname "$0")/%(proj)s" && pwd)"
L="$P/Logs/ci"; mkdir -p "$L"
TARGET="${TARGET:-%(target)s}"
TARGET_ARGS=(-buildTarget "$TARGET")       # every stage, tests included: build target is an import dependency
CACHE_ARGS=()
if [ -n "${ACCELERATOR:-}" ]; then          # -quit ends the editor before uploads finish unless told to wait
  CACHE_ARGS=(-EnableCacheServer -cacheServerEndpoint "$ACCELERATOR" -cacheServerNamespacePrefix "$(basename "$P")" \\
              -cacheServerEnableDownload true -cacheServerEnableUpload true -cacheServerWaitForConnection 5000 \\
              -cacheServerWaitForUploadCompletion)
fi
REL_ARGS=()
job() {  # job <name> <json args> <Namespace.Class.Method> [extra Unity args...]
  local name="$1" args="$2" method="$3"; shift 3
  mkdir -p "$L/$name"; printf '%%s' "$args" > "$L/$name/args.json"
  if [ -f "$L/$name/result.json" ]; then mv "$L/$name/result.json" "$L/$name/result.prev.json"; fi   # never rm
  local t0=$SECONDS
  "$UNITY" -batchmode -nographics -quit -accept-apiupdate -projectPath "$P" -logFile "$L/$name/unity.log" \\
    "${TARGET_ARGS[@]}" ${CACHE_ARGS[@]+"${CACHE_ARGS[@]}"} "$@" -executeMethod "$method" -agentJob "$L/$name" \\
    || { echo "stage $name: Unity exit $?"; grep -E "error CS|Exception|AGENT_RESULT" "$L/$name/unity.log" | tail -n 5; exit 1; }
  grep -Eq '"ok": *true' "$L/$name/result.json" || { echo "stage $name: job reported ok=false"; exit 1; }
  grep -Eq '"active_target": *"'"$TARGET"'"' "$L/$name/result.json" || { echo "stage $name: ran on another platform"; exit 1; }
  echo "stage $name ok ($((SECONDS - t0)) s)"
}
if [ "${CONSISTENCY:-0}" = 1 ]; then       # full reimport compared with the cache: importers must be deterministic
  job consistency '{}' AgentKit.AgentJob.Echo -consistencyCheck
  grep -E "ConsistencyChecker - total checked" "$L/consistency/unity.log" || { echo "stage consistency: no checker summary"; exit 1; }
  if grep -Eq 'generated inconsistent result for asset\\(guid:[0-9a-f]+\\) "Assets/' "$L/consistency/unity.log"; then   # packages: baseline them
    echo "stage consistency: inconsistent imports"; grep -E 'generated inconsistent result for asset\\(guid:[0-9a-f]+\\) "Assets/' "$L/consistency/unity.log" | head -n 5; exit 1
  fi
fi
if [ -n "${%(drop)s:-}" ]; then
  job import  "{\\"drop\\": \\"${%(drop)s}\\"}" AgentKit.Pipeline.ArtDropJobs.ImportDrop
  job prefabs '{}' AgentKit.Pipeline.ArtDropJobs.BuildPrefabs
  job groups  '{"layout": "%(layout)s"}' AgentKit.Pipeline.AddressablesJobs.AssignGroups
fi
job content '{"clean": true}' AgentKit.Pipeline.AddressablesJobs.BuildContent
t0=$SECONDS   # tests: never -quit with -runTests (the editor would quit before the XML is written); exit 2 = a test failed
"$UNITY" -batchmode -nographics -accept-apiupdate -projectPath "$P" "${TARGET_ARGS[@]}" ${CACHE_ARGS[@]+"${CACHE_ARGS[@]}"} \\
  -runTests -testPlatform EditMode -testResults "$L/editmode.xml" -logFile "$L/tests.log" \\
  || { echo "tests failed (exit $?): $L/editmode.xml"; exit 1; }
echo "stage tests ok ($((SECONDS - t0)) s)"
if [ "${RELEASE:-0}" = 1 ]; then           # a release is built from a committed tree, and says so in its log
  git -C "$P" rev-parse --git-dir >/dev/null 2>&1 || { echo "release: not a git repository"; exit 1; }
  if [ -n "$(git -C "$P" status --porcelain --untracked-files=all)" ]; then
    echo "release: dirty tree"; git -C "$P" status --porcelain --untracked-files=all | head -n 10; exit 1
  fi
  REL_ARGS=(-agentRelease)
fi
job build   '{"target": "%(target)s", "out": "%(out)s"}' AgentKit.AgentBuild.Build%(prof)s ${REL_ARGS[@]+"${REL_ARGS[@]}"}
echo "CI OK"
""" % {"ver": unity_version, "proj": project_rel, "target": target, "drop": drop_var, "out": out, "prof": prof, "layout": layout}


def github_actions_yaml(kind="unity-cli", unity_version="6000.3.21f1", target="StandaloneOSX", runner=None,
                        project_path="."):
    """A GitHub Actions workflow. kind='unity-cli' (Unity CLI beta: install editor, activate, test,
    build, return the seat with if: always()) or 'gameci' (GameCI v4 Docker images, Linux runner).
    NOT run here (needs a runner and license secrets); YAML syntax checked offline."""
    if kind == "gameci":
        return """name: unity-ci
on: {push: {branches: [main]}, pull_request: {}}
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: {lfs: true}
      - uses: actions/cache@v4
        with:
          path: %(pp)s/Library
          key: Library-${{ hashFiles('%(pp)s/Assets/**', '%(pp)s/Packages/**', '%(pp)s/ProjectSettings/**') }}
          restore-keys: Library-
      - uses: game-ci/unity-test-runner@v4
        id: tests
        env:
          UNITY_LICENSE: ${{ secrets.UNITY_LICENSE }}
          UNITY_EMAIL: ${{ secrets.UNITY_EMAIL }}
          UNITY_PASSWORD: ${{ secrets.UNITY_PASSWORD }}
        with:
          projectPath: %(pp)s
          unityVersion: %(ver)s
          testMode: EditMode
          coverageEnabled: false        # coverage broke Unity 6 PlayMode runs (GameCI docs)
          githubToken: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: ${{ steps.tests.outputs.artifactsPath }}
  build:
    needs: test
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        targetPlatform: [StandaloneLinux64, WebGL, Android]   # IL2CPP needs a host OS matching the target
    steps:
      - uses: actions/checkout@v4
        with: {lfs: true}
      - uses: actions/cache@v4
        with:
          path: %(pp)s/Library
          key: Library-${{ matrix.targetPlatform }}-${{ hashFiles('%(pp)s/Assets/**', '%(pp)s/Packages/**', '%(pp)s/ProjectSettings/**') }}
          restore-keys: Library-${{ matrix.targetPlatform }}-
      - uses: game-ci/unity-builder@v4
        env:
          UNITY_LICENSE: ${{ secrets.UNITY_LICENSE }}
          UNITY_EMAIL: ${{ secrets.UNITY_EMAIL }}
          UNITY_PASSWORD: ${{ secrets.UNITY_PASSWORD }}
        with:
          projectPath: %(pp)s
          unityVersion: %(ver)s
          targetPlatform: ${{ matrix.targetPlatform }}
          # workflow env vars are invisible inside Unity: pass inputs as customParameters
          customParameters: -agentJob Logs/ci/content
      - uses: actions/upload-artifact@v4
        with:
          name: Build-${{ matrix.targetPlatform }}
          path: build/${{ matrix.targetPlatform }}
""" % {"ver": unity_version, "pp": project_path}
    runner = runner or "macos-15"
    return """name: unity-ci
on: {push: {branches: [main]}, pull_request: {}}
env:
  UNITY_VERSION: %(ver)s
  UNITY_NO_CONSENT_PROMPT: "1"
  UNITY_NO_UPDATE_CHECK: "1"
jobs:
  test-and-build:
    runs-on: %(runner)s
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@v4
        with: {lfs: true}
      - uses: actions/cache@v4
        with:
          path: %(pp)s/Library
          key: Library-%(target)s-${{ hashFiles('%(pp)s/Packages/packages-lock.json', '%(pp)s/ProjectSettings/ProjectVersion.txt') }}
          restore-keys: Library-%(target)s-
      - name: Install the Unity CLI (beta) and the editor
        run: |
          curl -fsSL https://public-cdn.cloud.unity3d.com/hub/prod/cli/install.sh | UNITY_CLI_CHANNEL=beta bash
          echo "$HOME/.unity/bin" >> "$GITHUB_PATH"
          "$HOME/.unity/bin/unity" install "$UNITY_VERSION" --yes --accept-eula
      - name: Activate (paid seat or service account; a Personal license activates only through Unity Hub sign-in; not run here)
        run: |
          unity auth login --client-id "${{ secrets.UNITY_SERVICE_ACCOUNT_ID }}" --secret-from-stdin <<< "${{ secrets.UNITY_SERVICE_ACCOUNT_SECRET }}"
          unity license activate --non-interactive
      - name: EditMode tests (exit 8 = failing tests, do not retry; other non-zero = no verdict, retry)
        run: unity test %(pp)s --editor-version "$UNITY_VERSION" --mode EditMode --report-format nunit,junit --output test-results.xml --timeout 900
      - name: Addressables content, then player
        run: |
          unity run %(pp)s --editor-version "$UNITY_VERSION" -- -buildTarget %(target)s -executeMethod AgentKit.Pipeline.AddressablesJobs.BuildContent -logFile content.log
          # --output-path ABSOLUTE: the CLI resolves a relative path against the shell's cwd, not the project (observed)
          unity build %(pp)s --editor-version "$UNITY_VERSION" --target %(target)s --output-path "$GITHUB_WORKSPACE/%(pp)s/Builds/%(target)s/Game.app" --execute-method AgentKit.Pipeline.PipelineBuild.BuildFromCommandLine --timeout 3600 --no-tail
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: results
          path: |
            test-results*.xml
            Builds/**/agent_build_report.json
            Builds/ContentState/**
      - name: Return the license seat
        if: always()
        run: unity license return --yes
""" % {"ver": unity_version, "runner": runner, "target": target, "pp": project_path}


def write_ci(dest_dir, kinds=("shell", "unity-cli", "gameci"), **kw):
    """Write ci/pipeline.sh and .github/workflows/*.yml under dest_dir. Returns the paths."""
    out = []
    if "shell" in kinds:
        p = os.path.join(dest_dir, "ci", "pipeline.sh")
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w") as f:
            f.write(ci_shell(**{k: v for k, v in kw.items() if k in ("project_rel", "unity_version", "target", "profile", "out", "layout")}))
        os.chmod(p, 0o755)
        out.append(p)
    for kind in ("unity-cli", "gameci"):
        if kind in kinds:
            p = os.path.join(dest_dir, ".github", "workflows", "unity-%s.yml" % kind)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "w") as f:
                f.write(github_actions_yaml(kind, **{k: v for k, v in kw.items() if k in ("unity_version", "target", "runner", "project_path")}))
            out.append(p)
    return out


def yaml_syntax_ok(path):
    """Offline YAML syntax check with Ruby's Psych (ships with macOS) when PyYAML is absent."""
    try:
        import yaml  # noqa: WPS433
        with open(path) as f:
            yaml.safe_load(f)
        return {"ok": True, "via": "pyyaml"}
    except ImportError:
        pass
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "via": "pyyaml", "error": str(e)}
    ruby = shutil.which("ruby")
    if not ruby:
        return {"ok": None, "via": None, "error": "no YAML parser available"}
    r = subprocess.run([ruby, "-ryaml", "-e", "YAML.load_file(ARGV[0]); puts 'OK'", path], capture_output=True, text=True)
    return {"ok": r.returncode == 0 and "OK" in r.stdout, "via": "ruby", "error": r.stderr.strip()[-500:]}


# ============================================================================ offline checks
def file_hashes(root, subdirs=("Assets",), exts=None):
    """{relpath: sha1} for idempotence checks (a second pipeline run must change nothing)."""
    out = {}
    for sub in subdirs:
        base = os.path.join(root, sub)
        for dirpath, _d, files in os.walk(base):
            for fn in files:
                if exts and not fn.lower().endswith(exts):
                    continue
                p = os.path.join(dirpath, fn)
                with open(p, "rb") as f:
                    out[os.path.relpath(p, root)] = hashlib.sha1(f.read()).hexdigest()
    return out


def diff_hashes(before, after):
    added = sorted(set(after) - set(before))
    removed = sorted(set(before) - set(after))
    changed = sorted(k for k in set(before) & set(after) if before[k] != after[k])
    return {"added": added, "removed": removed, "changed": changed,
            "count": len(added) + len(removed) + len(changed)}


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="scenario-unity-pipeline-automation runner")
    sub = ap.add_subparsers(dest="cmd")
    s = sub.add_parser("scan", help="offline preflight of an art drop")
    s.add_argument("drop")
    g = sub.add_parser("make-drop", help="generate a synthetic art drop (Blender FBX + PNG)")
    g.add_argument("dest")
    g.add_argument("-n", type=int, default=200)
    a = ap.parse_args()
    if a.cmd == "scan":
        r = scan_drop(a.drop)
        print(json.dumps({k: v for k, v in r.items() if k != "props"}, indent=2))
    elif a.cmd == "make-drop":
        print(json.dumps(make_art_drop(a.dest, n=a.n), indent=2))
    else:
        ap.print_help()
