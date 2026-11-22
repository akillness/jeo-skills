#!/usr/bin/env python3
"""
ue_pipeline: the pipeline TD layer of the Unreal Engine 5.8 agent team
(skill scenario-unreal-pipeline-automation). Import policy, naming, asset-class rules (Nanite,
collision, LODs), material instance assignment, Python EditorValidators, reports, test and
build command lines, log parsing.

STATUS (2026-09-24): the PURE layer ran offline under python3 (tests in
tests/code/unreal-pipeline-automation/). Every IN-EDITOR function is NOT YET RUN IN UNREAL:
Unreal Engine was not installed when this was written. Names marked [verify] come from notes,
older versions or inference; UNREAL_API lists every engine name this module touches, and
tests/code/unreal-pipeline-automation/in_engine/first_run_checks.py checks them in the editor.

Builds on the lead skill's toolkit (<skills>/scenario-unreal-expert/scripts): ue_env.find_engine,
ue_run.run_python / run_commandlet / run_uat / build_buildcookrun / scan_log / result, and,
when present, ue_audit.audit_assets and ue_review.screenshot. Nothing here reimplements them.

Import:  import sys; sys.path.insert(0, "<skills>/scenario-unreal-pipeline-automation/scripts")
         import ue_pipeline as P

PURE (python3 anywhere, and inside Unreal)
  naming      CONVENTIONS, base_name(), asset_name(), check_name(), texture_role(), ROLE_SETTINGS
  intake      file_sha1(), scan_sources(), read_dcc_manifest(), sidecar_issues(),
              read_material_sidecar(), project_path_problems()
  plan        plan_imports() (sha1 and import-policy changes -> reimport), stage_plan(),
              publish_diff(), manifest_from_records()
  policy      PROP_PIPELINE_SETTINGS, pipeline_settings() (post-import MI route or Interchange's
              own MI route, vertex colour), EnumRef, PathRef
  rules       ASSET_CLASSES, classify(), nanite_decision(), collision_decision(),
              lod_decision(), mesh_rules(), pipeline_stack_problems(), frame_camera()
  validation  ISSUES, DEFAULT_RULES, validate_mesh_facts(), validate_texture_facts(),
              new_issues(), allow_list_from()
  reports     summarize(), write_report(), contact_sheet_html()
  commands    python_job_command(), datavalidation_command(), resave_command(),
              cook_command(), automation_command(), gauntlet_command(), package_command(),
              buildcookrun_problems(), launcher_args(), buildcookrun_diff(), batch_job(),
              shell_line()
  logs        parse_uat_log(), parse_automation_report(), parse_batch_results(),
              validation_messages(), job_verdict()
  config      ini_set(), zen_ci_patch()
  (also pure) normalize_role(), texture_params(), role_settings(), prefix_for()
IN-EDITOR (need the `unreal` module; NOT YET RUN IN UNREAL)
  api_presence(), ensure_pipeline_preset(), describe_pipeline(), interchange_fbx_flags(),
  import_source(), apply_texture_role(), create_material_instance(), assign_materials(),
  apply_mesh_rules(), mesh_facts(), texture_facts(), register_validators(), engine_validate(),
  validate_paths(), redirectors_under(), run_import_plan()
CLI (python3): plan | diff | package | problems | compare-launcher | parse-uat |
               automation-report | verdict
Jobs inside Unreal: scripts/ue_pipeline_job.py (through ue_run.run_python) and
scripts/ue_contact_sheet_job.py (mode="latent").
"""

__version__ = "0.1"  # Unreal Engine Expert Skills v0.1 (2026-09-24; includes the refactor after the U8 grade)

import csv
import hashlib
import json
import math
import os
import re
import shlex
import shutil
import sys
import time
import traceback
import unicodedata

_HERE = os.path.dirname(os.path.abspath(__file__))
_LEAD = os.path.join(os.path.dirname(os.path.dirname(_HERE)), "scenario-unreal-expert", "scripts")


def _lead(name):
    """Import a module of the lead skill (ue_env, ue_run, ue_audit, ue_review) or None."""
    if os.path.isdir(_LEAD) and _LEAD not in sys.path:
        sys.path.append(_LEAD)
    try:
        return __import__(name)
    except ImportError:
        return None


def write_json(path, obj):
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, sort_keys=False, default=str)
    os.replace(tmp, path)
    return path


def read_json(path):
    with open(path, "r", encoding="utf-8-sig") as f:
        return json.load(f)


# =================================================================================== naming
# Epic: "Recommended Asset Naming Conventions" (5.8 doc). Allar: Gamemakin UE style guide.
# Values are tuples of accepted prefixes. Keys are Unreal class names as get_class().get_name()
# returns them [verify for Blueprint subclasses]. "(added)" entries extend a table by analogy.
CONVENTIONS = {
    "epic": {
        "source": "Epic, Recommended Asset Naming Conventions (5.8)",
        "prefixes": {
            "StaticMesh": ("SM_",), "SkeletalMesh": ("SK_",), "Texture2D": ("T_",),
            "TextureCube": ("HDR_", "T_"), "Material": ("M_", "PPM_"),
            "MaterialInstanceConstant": ("MI_",), "PhysicsAsset": ("PHYS_",),
            "PhysicalMaterial": ("PM_",), "Blueprint": ("BP_", "BI_", "AC_"),
            "AnimBlueprint": ("ABP_",), "WidgetBlueprint": ("WBP_",), "DataTable": ("DT_",),
            "CurveTable": ("CT_",), "UserDefinedEnum": ("E_",), "UserDefinedStruct": ("F_",),
            "NiagaraSystem": ("FXS_",), "NiagaraEmitter": ("FXE_",), "NiagaraScript": ("FXF_",),
            "ControlRigBlueprint": ("Rig_",), "Skeleton": ("SKEL_",), "AnimMontage": ("AM_",),
            "AnimSequence": ("AS_",), "BlendSpace": ("BS_",), "LevelSequence": ("LS_",),
            "RemoteControlPreset": ("RCP_",),
            # (added) not in Epic's table; Allar's prefixes by analogy
            "MaterialFunction": ("MF_",), "MaterialParameterCollection": ("MPC_",),
        },
        "level_prefix": None,
    },
    "allar": {
        "source": "Allar ue5-style-guide 1.2 (UE4-era community guide)",
        "prefixes": {
            "StaticMesh": ("S_",), "SkeletalMesh": ("SK_",), "Texture2D": ("T_",),
            "TextureCube": ("TC_",), "TextureRenderTarget2D": ("RT_",), "Material": ("M_", "PP_"),
            "MaterialInstanceConstant": ("MI_",), "MaterialFunction": ("MF_",),
            "MaterialParameterCollection": ("MPC_",), "PhysicsAsset": ("PHYS_",),
            "PhysicalMaterial": ("PM_",), "Blueprint": ("BP_", "BPI_", "BPFL_"),
            "WidgetBlueprint": ("WBP_",), "UserDefinedEnum": ("E",), "UserDefinedStruct": ("F", "S"),
            "AnimSequence": ("A_",), "AnimMontage": ("AM_",), "BlendSpace": ("BS_",),
            "AimOffsetBlendSpace": ("AO_",), "Skeleton": ("SKEL_",), "DataTable": ("DT_",),
            "FoliageType": ("FT_",), "SoundWave": ("A_",),
        },
        "level_prefix": None,  # Allar: no prefix, suffixes _P _Geo _Lighting _Audio _Gameplay
    },
}
NAME_CHARS = re.compile(r"^[A-Za-z0-9_]+$")  # Allar 00.1
MESH_PREFIX_TOKENS = ("SM", "S", "SK", "GEO", "MESH")
TEXTURE_PREFIX_TOKENS = ("T", "TX", "TEX")
DCC_SUFFIX_TOKENS = ("geo", "mesh", "grp", "low", "lp")   # Maya `_geo` habit (FlippedNormals) [added]

# Texture roles. Letter order of a pack is its channel order (Allar 1.2.6.1: `_ERO` = emissive R,
# roughness G, AO B). ARM (Megascans style) is read as ORM [added].
ROLE_ALIASES = {
    "base_color": ("D", "BC", "BASECOLOR", "ALBEDO", "DIFFUSE", "COL", "COLOR", "COLOUR"),
    "normal": ("N", "NRM", "NOR", "NORMAL"),
    "roughness": ("R", "ROUGH", "ROUGHNESS"),
    "metallic": ("M", "MET", "METAL", "METALLIC", "METALNESS"),
    "ao": ("O", "AO", "OCC", "OCCLUSION"),
    "emissive": ("E", "EMISSIVE", "EMIT"),
    "opacity": ("A", "ALPHA", "OPACITY", "MASK"),
    "height": ("H", "HEIGHT", "DISP", "DISPLACEMENT"),
    "specular": ("S", "SPEC", "SPECULAR"),
    "bump": ("B", "BUMP"),
}
_ALIAS_TO_ROLE = {a: r for r, al in ROLE_ALIASES.items() for a in al}
PACK_LETTERS = set("ORMEAHS")
PACK_ALIASES = {"ARM": "ORM"}
TEXTURE_EXTS = (".png", ".tga", ".tif", ".tiff", ".exr", ".jpg", ".jpeg", ".psd", ".hdr")

# (compression, srgb, lod_group) per role; enum member names on unreal.TextureCompressionSettings
# and unreal.TextureGroup [verify]. Base color and emissive sRGB on, everything else linear.
ROLE_SETTINGS = {
    "base_color": ("TC_DEFAULT", True, "TEXTUREGROUP_WORLD"),
    "emissive": ("TC_DEFAULT", True, "TEXTUREGROUP_WORLD"),
    "normal": ("TC_NORMALMAP", False, "TEXTUREGROUP_WORLD_NORMAL_MAP"),
    "pack": ("TC_MASKS", False, "TEXTUREGROUP_WORLD_SPECULAR"),
    "roughness": ("TC_MASKS", False, "TEXTUREGROUP_WORLD_SPECULAR"),
    "metallic": ("TC_MASKS", False, "TEXTUREGROUP_WORLD_SPECULAR"),
    "ao": ("TC_MASKS", False, "TEXTUREGROUP_WORLD_SPECULAR"),
    "specular": ("TC_MASKS", False, "TEXTUREGROUP_WORLD_SPECULAR"),
    "opacity": ("TC_MASKS", False, "TEXTUREGROUP_WORLD"),
    "height": ("TC_MASKS", False, "TEXTUREGROUP_WORLD"),
    "bump": ("TC_MASKS", False, "TEXTUREGROUP_WORLD"),
}


def _ascii(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")


def base_name(stem, strip=MESH_PREFIX_TOKENS, drop_suffixes=DCC_SUFFIX_TOKENS, keep_underscores=False):
    """'sm_crate-wood 3' -> ('CrateWood', '03'). Returns (base or None, variant or None).

    ASCII only, [A-Za-z0-9] words joined in PascalCase (Allar 00.1, 1.1), a trailing number
    becomes a two-digit variant (Allar 1.1: variants from 01). Known type prefixes in `strip`
    and DCC suffixes such as `_geo` are removed."""
    tokens = [t for t in re.split(r"[^A-Za-z0-9]+", _ascii(stem or "")) if t]
    if tokens and len(tokens) > 1 and tokens[0].upper() in {s.upper() for s in strip}:
        tokens = tokens[1:]
    while len(tokens) > 1 and tokens[-1].lower() in drop_suffixes:
        tokens.pop()
    variant = None
    if len(tokens) > 1 and tokens[-1].isdigit():
        variant = "%02d" % int(tokens.pop())
    while len(tokens) > 1 and tokens[-1].lower() in drop_suffixes:
        tokens.pop()
    if not tokens:
        return None, variant
    words = [t[:1].upper() + t[1:] for t in tokens]
    return ("_" if keep_underscores else "").join(words), variant


def prefix_for(class_name, convention="epic"):
    p = CONVENTIONS[convention]["prefixes"].get(class_name)
    return p[0] if p else None


def asset_name(class_name, base, variant=None, suffix=None, convention="epic"):
    """SM_CrateWood_01, T_CrateWood_01_N, MI_CrateWood_01. Raises for an unknown class."""
    pre = prefix_for(class_name, convention)
    if pre is None:
        raise KeyError("no %s prefix for class %s" % (convention, class_name))
    parts = [pre + base] + [x for x in (variant, suffix) if x]
    return "_".join(parts)


def texture_role(name):
    """Role from the last token: 'T_Crate_01_N' -> 'normal'; '_ORM' -> 'pack:ORM'; None if unknown."""
    stem = os.path.splitext(os.path.basename(name or ""))[0]
    tok = re.split(r"[_\-. ]+", stem)[-1].upper() if stem else ""
    if not tok:
        return None
    tok = PACK_ALIASES.get(tok, tok)
    if tok in _ALIAS_TO_ROLE:
        return _ALIAS_TO_ROLE[tok]
    if 2 <= len(tok) <= 4 and set(tok) <= PACK_LETTERS and len(set(tok)) == len(tok):
        return "pack:" + tok
    return None


def role_settings(role):
    if role is None:
        return None
    return ROLE_SETTINGS["pack" if role.startswith("pack:") else role]


ROLE_SUFFIX = {"base_color": "D", "normal": "N", "roughness": "R", "metallic": "M", "ao": "O",
               "emissive": "E", "opacity": "A", "height": "H", "specular": "S", "bump": "B"}  # Allar 1.2


def normalize_role(role):
    """'base_color', 'BaseColor', 'ORM', 'pack:ORM', 'Normal' -> a ROLE_SETTINGS role or 'pack:XYZ'."""
    if not role:
        return None
    if role in ROLE_SETTINGS and role != "pack":
        return role
    if role.startswith("pack:"):
        return "pack:" + role.split(":", 1)[1].upper()
    return texture_role("x_" + re.sub(r"[^A-Za-z]", "", role))


def check_name(name, class_name, convention="epic", folder=None, project_root=None):
    """Naming issues for one asset: list of {id, severity, msg}. Pure."""
    out = []
    if not NAME_CHARS.match(name or ""):
        out.append(_issue("N02", "error", "%r has characters outside [A-Za-z0-9_]" % name))
    allowed = CONVENTIONS[convention]["prefixes"].get(class_name)
    if allowed and not any(name.startswith(p) for p in allowed):
        out.append(_issue("N01", "error", "%s should start with %s (%s)"
                          % (name, " or ".join(allowed), CONVENTIONS[convention]["source"])))
    if "__" in (name or "") or (name or "").endswith("_"):
        out.append(_issue("N03", "warning", "%s has an empty name part" % name))
    last = (name or "").split("_")[-1]
    if last.isdigit() and len(last) != 2:
        out.append(_issue("N03", "warning", "%s: numeric variants are two digits from 01 (Allar 1.1)" % name))
    if class_name == "Texture2D" and texture_role(name) is None:
        out.append(_issue("N04", "warning", "%s has no recognised texture suffix (_D _N _ORM ...)" % name))
    if project_root and folder and not (folder + "/").startswith(project_root.rstrip("/") + "/"):
        out.append(_issue("F01", "error", "%s is outside the project folder %s (Allar 2.2)" % (folder, project_root)))
    return out


def project_path_problems(path):
    """Spaces or non-ASCII in the project path (Allar 2.1; the deltas list it as [verify] for UAT)."""
    out = []
    if " " in path:
        out.append("project path contains spaces: keep the .uproject in a path without spaces [verify impact]")
    try:
        path.encode("ascii")
    except UnicodeEncodeError:
        out.append("project path is not ASCII (Allar 2.1.3: mysterious failures)")
    return out


# =================================================================================== intake
def file_sha1(path, block=1 << 20):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        while True:
            b = f.read(block)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


MESH_EXTS = (".fbx", ".usd", ".usda", ".usdc", ".usdz", ".glb", ".gltf", ".obj", ".abc")
SKIP_DIRS = ("archive", "versions", "fixed", "__pycache__", ".git")


def scan_sources(root, exts=MESH_EXTS, skip_dirs=SKIP_DIRS, hash_files=True):
    """Mesh files under root with their textures, sidecars and sha1. Pure file work.

    Each entry: {path, stem, ext, rel_dir, category, sha1, bytes, textures: {role: path},
    material_sidecar, dcc_settings}. category = first folder under root ('' at the top).
    Textures: files next to the mesh named <stem>_<ROLE>.<ext>. Sidecars: <stem>.materials.json
    (slots and channels, Bardoux MjjkWH0eT3U [00:06:30]) and Maya's <file>.settings.json."""
    out = []
    root = os.path.abspath(root)
    for d, dirs, files in os.walk(root):
        dirs[:] = sorted(x for x in dirs if x not in skip_dirs and not x.endswith(".fbm"))
        low = {f.lower(): f for f in files}
        for f in sorted(files):
            stem, ext = os.path.splitext(f)
            if ext.lower() not in exts:
                continue
            p = os.path.join(d, f)
            rel = os.path.relpath(d, root)
            rel = "" if rel == "." else rel
            tex = {}
            for g in sorted(files):
                gs, ge = os.path.splitext(g)
                if ge.lower() in TEXTURE_EXTS and gs.lower().startswith(stem.lower() + "_"):
                    r = texture_role(gs)
                    if r and r not in tex:
                        tex[r] = os.path.join(d, g)
            side = low.get((stem + ".materials.json").lower())
            dcc = low.get((f + ".settings.json").lower())
            out.append({
                "path": p, "stem": stem, "ext": ext.lower(), "rel_dir": rel,
                "category": rel.split(os.sep)[0] if rel else "",
                "sha1": file_sha1(p) if hash_files else None, "bytes": os.path.getsize(p),
                "textures": tex,
                "material_sidecar": os.path.join(d, side) if side else None,
                "dcc_settings": os.path.join(d, dcc) if dcc else None,
            })
    return out


def read_dcc_manifest(path):
    """{file name: {path, sha1, kind, scene, preset}} from scenario-maya-pipeline-scripting's summary.json
    (records[].result.exports) or an export manifest {name: {...}}. Pure."""
    data = read_json(path)
    man = {}
    if isinstance(data, dict) and "records" in data:
        for r in data.get("records", []):
            res = r.get("result") if isinstance(r.get("result"), dict) else {}
            for e in res.get("exports") or []:
                name = os.path.basename(e.get("path", ""))
                man[name] = {"path": e.get("path"), "sha1": e.get("sha1"), "kind": e.get("kind"),
                             "scene": r.get("scene"), "preset": e.get("preset"),
                             "status": r.get("status")}
    elif isinstance(data, dict):
        for k, v in data.items():
            if isinstance(v, dict):
                man[k] = dict(v)
    return man


def sidecar_issues(settings):
    """Checks on a DCC export settings sidecar (scenario-maya-pipeline-scripting writes <file>.settings.json
    with every FBX option queried back). Returns issue dicts. Pure; tolerant to missing keys."""
    out = []
    s = (settings or {}).get("settings") or settings or {}
    unit = s.get("FBXExportConvertUnitString")
    if unit is not None and str(unit).lower() != "cm":
        out.append(_issue("D01", "error", "FBX exported in %s; Unreal is 1 uu = 1 cm" % unit))
    scale = s.get("FBXExportScaleFactor")
    if scale not in (None, 1, 1.0, "1", "1.0"):
        out.append(_issue("D02", "error", "FBX scale factor %s, expected 1.0" % scale))
    ver = s.get("FBXExportFileVersion")
    if ver and not str(ver).upper().startswith("FBX2020"):
        out.append(_issue("D03", "warning", "FBX version %s; Epic's pipeline uses FBX 2020.2" % ver))
    log = (settings or {}).get("fbx_log") or {}
    parsed = log.get("parsed") if isinstance(log, dict) else None
    if isinstance(parsed, dict) and parsed.get("errors"):
        out.append(_issue("D04", "error", "the FBX exporter logged %s error(s)" % parsed.get("errors")))
    if isinstance(log, dict) and log.get("path") is None and "fbx_log" in (settings or {}):
        out.append(_issue("D05", "warning", "no FBX export log found next to the export"))
    return out


def read_material_sidecar(path):
    """{"slots": {slot: {role: texture path}}, "normal_convention", "category", "units"} or {}.
    Relative texture paths resolve against the sidecar's folder."""
    if not path or not os.path.isfile(path):
        return {}
    data = read_json(path)
    d = os.path.dirname(os.path.abspath(path))
    slots = {}
    for slot, ch in (data.get("slots") or {}).items():
        slots[slot] = {}
        for role, p in (ch or {}).items():
            slots[slot][role] = p if os.path.isabs(p) else os.path.normpath(os.path.join(d, p))
    data["slots"] = slots
    return data


# =================================================================================== plan
def _kind_from(entry, dcc, settings=None):
    preset = (dcc or {}).get("preset") or (settings or {}).get("preset") or ""
    if "skeletal" in preset:
        return "skeletal"
    if "anim" in preset:
        return "animation"
    return "static"


def plan_imports(sources, dest_root, convention="epic", category_map=None, previous=None,
                 dcc_manifest=None, project_root=None, master=None, param_map=None,
                 per_asset_folders=True, policy=None):
    """Deterministic import plan from scan_sources() output. Pure.

    Names come from the plan, never from the importer (Interchange ignores
    AssetImportTask.destination_name, 5.8 API). One folder per asset under
    dest_root/<Category>/<Base>[_NN] (Allar: no type folders). Returns
    {"items": [...], "rejected": [...], "meta": {...}}. Item action: import (new), reimport
    (sha1 changed, or import policy changed), skip (unchanged), handoff (skeletal or
    animation: scenario-unreal-animation).

    policy: a version string for the import policy (for example "PL_PropsImport@3"). An asset
    keeps the pipeline stack it was imported with and reimport reuses it (Interchange doc,
    Reimporting Assets), so a policy change never reaches existing assets by itself: when the
    manifest's policy differs, the item becomes a reimport that passes the new preset
    explicitly in override_pipelines [added rule from that doc fact]."""
    category_map = category_map or {}
    prev = previous or {}
    dcc_manifest = dcc_manifest or {}
    items, rejected, seen = [], [], {}
    for s in sources:
        base, variant = base_name(s["stem"])
        if not base:
            rejected.append({"source": s["path"], "reason": "cannot derive a name from %r" % s["stem"]})
            continue
        dcc = dcc_manifest.get(os.path.basename(s["path"])) or {}
        settings, settings_err = None, None
        if s.get("dcc_settings"):
            try:
                settings = read_json(s["dcc_settings"])
            except (OSError, ValueError) as e:
                settings_err = str(e)
        kind = _kind_from(s, dcc, settings)
        cat_key = s.get("category") or ""
        category = category_map.get(cat_key.lower(), base_name(cat_key, strip=())[0] if cat_key else "Misc")
        cls = "SkeletalMesh" if kind == "skeletal" else "StaticMesh"
        mesh = asset_name(cls, base, variant, convention=convention)
        folder_leaf = base + ("_" + variant if variant else "")
        folder = "/".join(x for x in (dest_root.rstrip("/"), category, folder_leaf if per_asset_folders else None) if x)
        key = folder + "/" + mesh
        if key in seen:
            rejected.append({"source": s["path"], "reason": "name collision with %s (%s)" % (seen[key], mesh)})
            continue
        seen[key] = s["path"]
        side = read_material_sidecar(s.get("material_sidecar"))
        side_slots = side.get("slots") or {}
        multi = len(side_slots) > 1
        textures, tex_names = [], set()

        def add_tex(path, role, slot):
            role = normalize_role(role)
            if role is None:
                return
            slot_part = base_name(slot, strip=())[0] if (multi and slot != "*") else None
            suffix = "_".join(x for x in (slot_part, ROLE_SUFFIX.get(role) or role.split(":", 1)[-1]) if x)
            name = asset_name("Texture2D", base, variant, suffix, convention)
            if name not in tex_names:
                tex_names.add(name)
                textures.append({"source": path, "role": role, "slot": slot, "name": name})
        for slot, ch in sorted(side_slots.items()):
            for role, p in sorted(ch.items()):
                add_tex(p, role, slot)
        for role, p in sorted((s.get("textures") or {}).items()):
            add_tex(p, role, "*")
        slots = sorted(side_slots.keys())
        mi = {slot: asset_name("MaterialInstanceConstant", base, variant,
                               (base_name(slot, strip=())[0] if multi else None), convention)
              for slot in slots} or {"*": asset_name("MaterialInstanceConstant", base, variant, convention=convention)}
        old = prev.get(os.path.basename(s["path"])) or prev.get(key) or {}
        reason = None
        if kind != "static":
            action = "handoff"
        elif not old:
            action = "import"
        elif old.get("sha1") != s.get("sha1"):
            action, reason = "reimport", "source changed"
        elif policy is not None and old.get("policy") != policy:
            action, reason = "reimport", "import policy %s -> %s" % (old.get("policy"), policy)
        else:
            action = "skip"
        issues = check_name(mesh, cls, convention, folder, project_root)
        if settings is not None:
            issues += sidecar_issues(settings)
        elif settings_err:
            issues.append(_issue("D06", "warning", "unreadable DCC settings sidecar: %s" % settings_err))
        if dcc.get("status") in ("fail", "error", "crash", "timeout"):
            issues.append(_issue("D07", "error", "the DCC batch reported %s for this export" % dcc["status"]))
        items.append({
            "source": s["path"], "sha1": s.get("sha1"), "kind": kind, "category": category,
            "base": base, "variant": variant, "folder": folder, "mesh_name": mesh,
            "mesh_path": folder + "/" + mesh, "textures": textures, "material_instances": mi,
            "slots": side.get("slots") or {}, "normal_convention": side.get("normal_convention", "directx"),
            "asset_class": side.get("asset_class"), "action": action, "reason": reason,
            "policy": policy, "issues": issues,
        })
    return {"items": items, "rejected": rejected,
            "meta": {"dest_root": dest_root, "convention": convention, "master": master,
                     "param_map": param_map or {}, "project_root": project_root, "policy": policy,
                     "created": time.strftime("%Y-%m-%dT%H:%M:%S"), "count": len(items)}}


def stage_plan(plan, staging_dir):
    """Copy each source to staging_dir/<Base>/<target name><ext> so the importer's
    "use source name" gives the planned asset name and no rename (redirector) is needed [added,
    verify with Interchange]. Sources are never written. Returns the plan with item['staged']
    and texture['staged']. Pure file work."""
    for it in plan["items"]:
        if it["action"] in ("skip", "handoff"):
            continue
        d = os.path.join(staging_dir, it["base"] + ("_" + it["variant"] if it["variant"] else ""))
        os.makedirs(d, exist_ok=True)
        it["staged"] = _copy_if_changed(it["source"], os.path.join(d, it["mesh_name"] + os.path.splitext(it["source"])[1]))
        for t in it["textures"]:
            if os.path.isfile(t["source"]):
                t["staged"] = _copy_if_changed(t["source"], os.path.join(d, t["name"] + os.path.splitext(t["source"])[1]))
    return plan


def _copy_if_changed(src, dst):
    if os.path.abspath(src) == os.path.abspath(dst):
        return dst
    if not (os.path.isfile(dst) and os.path.getsize(dst) == os.path.getsize(src) and file_sha1(dst) == file_sha1(src)):
        shutil.copy2(src, dst)
    return dst


def manifest_from_records(records):
    """{source file name: {sha1, mesh_path, status, policy}} for the next run's reimport diff."""
    man = {}
    for r in records:
        if r.get("source"):
            man[os.path.basename(r["source"])] = {"sha1": r.get("sha1"), "mesh_path": r.get("mesh_path"),
                                                  "status": r.get("status"), "policy": r.get("policy")}
    return man


def publish_diff(old, new, hash_key="sha1"):
    """added / modified / removed / unchanged between two manifests (same semantics as
    scenario-maya-pipeline-scripting's publish_diff, Borderlands lfWkJrkhd2U [00:24:23])."""
    o, n = old or {}, new or {}
    both = set(o) & set(n)
    return {"added": sorted(set(n) - set(o)), "removed": sorted(set(o) - set(n)),
            "modified": sorted(k for k in both if (o[k] or {}).get(hash_key) != (n[k] or {}).get(hash_key)),
            "unchanged": sorted(k for k in both if (o[k] or {}).get(hash_key) == (n[k] or {}).get(hash_key))}


# =================================================================================== rules
# Asset classes. lod_group values are the engine LOD groups listed by the Interchange import
# reference (Small Prop, Large Prop, Level Architecture, Foliage, Deco, High Detail, Vista);
# their FName spellings are [verify]. Collision kinds and every threshold are project defaults
# [added]: change them in the plan, not in code.
ASSET_CLASSES = {
    "prop_small": {"lod_group": "SmallProp", "collision": "kdop26", "min_lods": 3},
    "prop_large": {"lod_group": "LargeProp", "collision": "decomposition", "min_lods": 4},
    "architecture": {"lod_group": "LevelArchitecture", "collision": "box", "min_lods": 3},
    "hero": {"lod_group": "HighDetail", "collision": "decomposition", "min_lods": 4},
    "foliage": {"lod_group": "Foliage", "collision": "dcc_or_none", "min_lods": 3},
    "deco": {"lod_group": "Deco", "collision": "dcc_or_none", "min_lods": 2},
    "vista": {"lod_group": "Vista", "collision": "none", "min_lods": 2},
}
SMALL_PROP_MAX_CM = 150.0      # [added] project default: largest extent of a "small" prop
DECOMPOSITION = {"hull_count": 4, "max_hull_verts": 16, "hull_precision": 100000}  # editor dialog defaults [verify]
NANITE_BLEND_MODES = ("BLEND_OPAQUE", "BLEND_MASKED")  # Nanite doc: Opaque and Masked only


def classify(category=None, extent_cm=None, explicit=None, category_classes=None):
    """Asset class for a mesh: explicit (sidecar asset_class) > category map > size. Pure."""
    if explicit in ASSET_CLASSES:
        return explicit
    cc = {k.lower(): v for k, v in (category_classes or {}).items()}
    if category and category.lower() in cc and cc[category.lower()] in ASSET_CLASSES:
        return cc[category.lower()]
    if extent_cm is not None and extent_cm > SMALL_PROP_MAX_CM:
        return "prop_large"
    return "prop_small"


def nanite_decision(info, target=None, min_tris=None):
    """Nanite on or off for one static mesh, with reasons. Pure.

    info: {kind, blend_modes [BLEND_*], has_morph_targets, uses_wpo, tris}.
    target: {"nanite": bool, "name": str}. Rules: the Nanite doc ("enabled wherever possible on
    platforms that support it"; Opaque and Masked only; no morph targets; WPO limited), the VSM
    doc (Shadow Depths: "enable Nanite on all supported geometry, including low-poly meshes"),
    Oztalay (S2olUc9zcB8 [00:32:54]: not everything can be Nanite; DxBKmQ-0kfw [00:37:15]: set
    fallback settings on every Nanite mesh). min_tris is an explicit project opt-out, off by default."""
    target = target or {"nanite": True, "name": "Nanite-capable target"}
    reasons, warnings = [], []
    if not target.get("nanite", True):
        return {"nanite": False, "reasons": ["target %s has no Nanite: classic LODs" % target.get("name", "?")],
                "warnings": [], "set_fallback": False}
    if info.get("kind", "static") != "static":
        return {"nanite": False, "reasons": ["%s mesh: scenario-unreal-animation decides" % info.get("kind")],
                "warnings": [], "set_fallback": False}
    bad = [b for b in (info.get("blend_modes") or []) if b and b not in NANITE_BLEND_MODES]
    if bad:
        return {"nanite": False, "reasons": ["blend mode %s: Nanite would draw the default material "
                                             "(split the translucent part to its own mesh)" % ", ".join(sorted(set(bad)))],
                "warnings": [], "set_fallback": False}
    if info.get("has_morph_targets"):
        return {"nanite": False, "reasons": ["morph targets are not supported by Nanite"], "warnings": [],
                "set_fallback": False}
    tris = info.get("tris")
    if min_tris and tris is not None and tris < min_tris:
        return {"nanite": False, "reasons": ["project opt-out below %d triangles (the VSM doc recommends "
                                             "Nanite on low-poly meshes too)" % min_tris],
                "warnings": [], "set_fallback": False}
    if info.get("uses_wpo"):
        warnings.append("WPO material: supported but limited; cap the WPO displacement and watch the "
                        "programmable raster cost (Oztalay)")
    if "BLEND_MASKED" in (info.get("blend_modes") or []):
        warnings.append("masked material: programmable raster for Nanite and VSM (Oztalay)")
    reasons.append("opaque or masked static mesh on a Nanite target (Nanite doc; VSM doc: low-poly too)")
    return {"nanite": True, "reasons": reasons, "warnings": warnings, "set_fallback": True}


def collision_decision(asset_class, custom_collision_count=0, extent_cm=None):
    """Which simple collision to keep or create. DCC collision (UCX_/UBX_/UCP_/USP_ named meshes,
    Interchange "Import Collision According to Mesh Name") always wins. Pure.
    Returns {"action": keep|box|kdop26|decomposition|none, "reason"}."""
    if custom_collision_count and custom_collision_count > 0:
        return {"action": "keep", "reason": "%d DCC collision primitive(s) from UCX_/UBX_/UCP_/USP_ meshes"
                % custom_collision_count}
    kind = ASSET_CLASSES.get(asset_class, ASSET_CLASSES["prop_small"])["collision"]
    if kind == "dcc_or_none":
        return {"action": "none", "reason": "%s: no DCC collision and the class allows none" % asset_class}
    return {"action": kind, "reason": "%s class default [added]" % asset_class}


def lod_decision(asset_class, nanite, explicit_reduction=None):
    """LOD plan for a non-Nanite mesh: the engine LOD group of its class, or explicit
    reduction settings [(percent_triangles, screen_size), ...] given by the project."""
    if nanite:
        return {"mode": "nanite", "min_lods": 1, "note": "Nanite: no LOD chain; set fallback settings"}
    cls = ASSET_CLASSES.get(asset_class, ASSET_CLASSES["prop_small"])
    if explicit_reduction:
        return {"mode": "reduction", "reduction": [list(x) for x in explicit_reduction],
                "min_lods": len(explicit_reduction)}
    return {"mode": "lod_group", "lod_group": cls["lod_group"], "min_lods": cls["min_lods"]}


def mesh_rules(facts, plan_meta=None, asset_class=None):
    """Combined decision for one imported static mesh from its facts. Pure."""
    meta = plan_meta or {}
    ext = max(facts.get("extent_cm") or [0.0]) if facts.get("extent_cm") else None
    cls = classify(facts.get("category"), ext, asset_class or facts.get("asset_class"), meta.get("category_classes"))
    nd = nanite_decision({"kind": "static", "blend_modes": [m.get("blend_mode") for m in facts.get("materials", [])],
                          "has_morph_targets": facts.get("has_morph_targets"), "uses_wpo": facts.get("uses_wpo"),
                          "tris": facts.get("tris")}, meta.get("target"), meta.get("nanite_min_tris"))
    return {"asset_class": cls, "nanite": nd,
            "collision": collision_decision(cls, facts.get("simple_collision_count", 0), ext),
            "lods": lod_decision(cls, nd["nanite"], meta.get("lod_reduction"))}


def pipeline_stack_problems(stack):
    """Checks on an Interchange pipeline stack given as ordered names or paths. Pure.
    Interchange PM (Oq6KbrqkGnw): stack order is execution order, a tweak pipeline above the
    default one sees no factory nodes [00:20:22]; a Graph Inspector left in the stack pops up
    during automated imports [00:40:00]."""
    out = []
    names = [os.path.basename(str(s)).split(".")[0] for s in (stack or [])]
    if not names:
        return [_issue("P01", "error", "empty pipeline stack")]
    default_idx = next((i for i, n in enumerate(names) if re.search(r"(Default|Generic).*Asset", n, re.I)), None)
    for i, n in enumerate(names):
        if re.search(r"GraphInspector", n, re.I):
            out.append(_issue("P02", "error", "%s in the stack: it opens a window during automated imports" % n))
        if default_idx is not None and i < default_idx and not re.search(r"Default|Generic", n, re.I):
            out.append(_issue("P03", "error", "%s runs before %s and will see no factory nodes" % (n, names[default_idx])))
    if default_idx is None:
        out.append(_issue("P04", "warning", "no default or generic assets pipeline in the stack"))
    return out


def frame_camera(bmin, bmax, fov_deg=40.0, margin=1.25, yaw_deg=45.0, pitch_deg=-20.0):
    """Camera location and rotation that frame a bounding box (Unreal axes: X forward, Z up).
    Returns {"location": [x,y,z], "rotation": [pitch, yaw, roll], "distance"}. Pure."""
    c = [(a + b) / 2.0 for a, b in zip(bmin, bmax)]
    r = max(1e-3, 0.5 * math.sqrt(sum((b - a) ** 2 for a, b in zip(bmin, bmax))))
    d = margin * r / math.sin(math.radians(max(5.0, min(170.0, fov_deg))) / 2.0)
    p, y = math.radians(pitch_deg), math.radians(yaw_deg)
    fwd = (math.cos(p) * math.cos(y), math.cos(p) * math.sin(y), math.sin(p))
    loc = [c[i] - fwd[i] * d for i in range(3)]
    return {"location": loc, "rotation": [pitch_deg, yaw_deg, 0.0], "distance": d, "center": c}


# =================================================================================== validation
ISSUES = {
    "N01": "name prefix does not match the class", "N02": "characters outside [A-Za-z0-9_]",
    "N03": "empty name part or variant not two digits", "N04": "texture suffix not recognised",
    "F01": "asset outside the project folder", "F02": "package path too long for cooking",
    "M01": "empty slot or engine default material", "M02": "material instance parent is not an approved master",
    "M03": "slot uses a base material, not an instance", "M04": "texture parameter missing on the master",
    "C01": "no simple collision", "L01": "non-Nanite mesh with too few LODs",
    "L02": "LOD screen sizes do not decrease", "X01": "Nanite on a mesh with a non-opaque, non-masked material",
    "X02": "eligible mesh left without Nanite on a Nanite target", "S01": "size outside the plausible range",
    "S02": "pivot is not where the project wants it", "T01": "texture size not a power of two",
    "T02": "texture larger than the maximum", "T03": "normal map with sRGB on or non-normal compression",
    "T04": "linear data texture with sRGB on", "I01": "import produced no mesh or several",
    "I02": "importer name differed from the plan (renamed, redirector left)", "R01": "redirectors left",
    "V01": "engine or team validator failed", "D01": "DCC export not in cm", "D02": "DCC export scale not 1",
    "D03": "FBX version not 2020", "D04": "FBX exporter errors", "D05": "no FBX log",
    "D06": "unreadable DCC sidecar", "D07": "DCC batch failure", "P01": "empty pipeline stack",
    "P02": "Graph Inspector in an automated stack", "P03": "pipeline above the default one",
    "P04": "no default assets pipeline", "E01": "exception during import",
    "I03": "planned name already held by another asset (duplicate left)",
    "SC01": "files not checked out: run stopped before saving",
}

DEFAULT_RULES = {
    "convention": "epic",
    "project_root": None,               # e.g. "/Game/MyGame" (Allar 2.2)
    "masters": [],                      # approved master material paths (from scenario-unreal-materials)
    "require_instances": True,          # Allar 2.8 "material instances only" policy
    "max_texture": 8192,                # Allar 7.3
    "pow2_exempt_groups": ["TEXTUREGROUP_UI"],   # Allar 7.1: power of two except UI
    "nanite_target": True,
    "size_range_cm": [0.5, 10000.0],    # [added] catches cm/m/inch export errors; tune per project
    "pivot": None,                      # "bottom_center" to enforce [added]
    "pivot_tolerance_cm": 1.0,
    "max_cook_path": None,              # characters; set if the project targets a path limit
    "collision_exempt_classes": ["vista", "foliage", "deco"],
    "require_checkout": False,          # Perforce: check out each chunk, stop on failure (Bardoux [00:55:27])
}


def _issue(iid, severity, msg, **extra):
    d = {"id": iid, "severity": severity, "msg": msg}
    d.update(extra)
    return d


def _is_pow2(n):
    return isinstance(n, int) and n > 0 and (n & (n - 1)) == 0


def validate_mesh_facts(facts, rules=None):
    """Issues for one static mesh from mesh_facts() output. Pure: the same function runs in the
    registered EditorValidator (on save and from menus) and in the post-import report.

    facts: {name, path, folder, class, tris, nanite, lod_count, lod_screen_sizes,
    simple_collision_count, extent_cm, bounds_min, materials: [{slot, path, class, parent,
    is_default, blend_mode}], asset_class, cook_path_length, expected_nanite}."""
    r = dict(DEFAULT_RULES, **(rules or {}))
    out = check_name(facts.get("name", ""), facts.get("class", "StaticMesh"), r["convention"],
                     facts.get("folder"), r.get("project_root"))
    mats = facts.get("materials") or []
    masters = set(r.get("masters") or [])
    for m in mats:
        slot = m.get("slot")
        if not m.get("path") or m.get("is_default"):
            out.append(_issue("M01", "error", "slot %s has no material or the engine default" % slot))
            continue
        if m.get("class") == "Material" and r.get("require_instances"):
            out.append(_issue("M03", "warning", "slot %s uses base material %s; use an instance" % (slot, m["path"])))
        if m.get("class") == "MaterialInstanceConstant" and masters and _pkg(m.get("parent")) not in {_pkg(x) for x in masters}:
            out.append(_issue("M02", "error", "slot %s: %s parent %s is not an approved master" % (slot, m["path"], m.get("parent"))))
    blend = [m.get("blend_mode") for m in mats if m.get("blend_mode")]
    if facts.get("nanite") and any(b not in NANITE_BLEND_MODES for b in blend):
        out.append(_issue("X01", "error", "Nanite with blend modes %s: Nanite draws the default material" % sorted(set(blend))))
    if (not facts.get("nanite") and r.get("nanite_target") and facts.get("expected_nanite")):
        out.append(_issue("X02", "warning", "eligible for Nanite but off (VSM doc: non-Nanite shadow depth is much costlier)"))
    cls = facts.get("asset_class") or "prop_small"
    if not facts.get("simple_collision_count") and cls not in (r.get("collision_exempt_classes") or []):
        out.append(_issue("C01", "error", "no simple collision (Nanite meshes need it too)"))
    if not facts.get("nanite"):
        need = ASSET_CLASSES.get(cls, ASSET_CLASSES["prop_small"])["min_lods"]
        if facts.get("lod_count") is not None and facts["lod_count"] < need:
            out.append(_issue("L01", "error", "%d LOD(s), class %s wants at least %d" % (facts["lod_count"], cls, need)))
        ss = facts.get("lod_screen_sizes") or []
        if any(b >= a for a, b in zip(ss, ss[1:])):
            out.append(_issue("L02", "warning", "LOD screen sizes do not decrease: %s" % ss))
    ext = facts.get("extent_cm")
    lo, hi = r.get("size_range_cm") or (None, None)
    if ext and lo is not None and (max(ext) < lo or max(ext) > hi):
        out.append(_issue("S01", "warning", "largest extent %.1f cm outside [%s, %s]: unit or scale error?" % (max(ext), lo, hi)))
    if r.get("pivot") == "bottom_center" and facts.get("bounds_min") and facts.get("bounds_max"):
        bmin, bmax, tol = facts["bounds_min"], facts["bounds_max"], r.get("pivot_tolerance_cm", 1.0)
        cx, cy = (bmin[0] + bmax[0]) / 2.0, (bmin[1] + bmax[1]) / 2.0
        if abs(bmin[2]) > tol or abs(cx) > tol or abs(cy) > tol:
            out.append(_issue("S02", "warning", "pivot not at bottom centre (min z %.2f, centre %.2f, %.2f)" % (bmin[2], cx, cy)))
    if r.get("max_cook_path") and facts.get("cook_path_length") and facts["cook_path_length"] > r["max_cook_path"]:
        out.append(_issue("F02", "error", "cook path length %d > %d" % (facts["cook_path_length"], r["max_cook_path"])))
    return out


def validate_texture_facts(facts, rules=None):
    """Issues for one texture: {name, path, folder, width, height, srgb, compression, lod_group, role}. Pure."""
    r = dict(DEFAULT_RULES, **(rules or {}))
    out = check_name(facts.get("name", ""), "Texture2D", r["convention"], facts.get("folder"), r.get("project_root"))
    w, h = facts.get("width"), facts.get("height")
    grp = facts.get("lod_group")
    if w and h:
        if grp not in (r.get("pow2_exempt_groups") or []) and not (_is_pow2(w) and _is_pow2(h)):
            out.append(_issue("T01", "error", "%dx%d is not a power of two (Allar 7.1)" % (w, h)))
        if max(w, h) > r["max_texture"]:
            out.append(_issue("T02", "error", "%dx%d exceeds %d (Allar 7.3)" % (w, h, r["max_texture"])))
    role = facts.get("role") or texture_role(facts.get("name"))
    comp = str(facts.get("compression") or "")
    if role == "normal" and (facts.get("srgb") or (comp and "NORMAL" not in comp.upper())):
        out.append(_issue("T03", "error", "normal map: sRGB %s, compression %s (want off, TC_NORMALMAP)" % (facts.get("srgb"), comp)))
    elif role and role not in ("base_color", "emissive", "normal") and facts.get("srgb"):
        out.append(_issue("T04", "error", "%s data with sRGB on" % role))
    return out


def _pkg(path):
    """'/Game/A/M_X.M_X' -> '/Game/A/M_X'."""
    return (path or "").split(".")[0]


def allow_list_from(records):
    """Allow-list keys {'<asset>|<issue id>'} from an existing report: adopt validation on a live
    project without failing on legacy errors (Fray KuIWCzujtag [00:38:07])."""
    keys = set()
    for r in records:
        for i in r.get("issues", []):
            if i.get("severity") == "error":
                keys.add("%s|%s" % (r.get("mesh_path") or r.get("path"), i["id"]))
    return keys


def new_issues(records, allow):
    """Error issues not in the allow list: what makes CI red. Red must mean new."""
    out = []
    for r in records:
        for i in r.get("issues", []):
            if i.get("severity") == "error" and "%s|%s" % (r.get("mesh_path") or r.get("path"), i["id"]) not in allow:
                out.append(dict(i, asset=r.get("mesh_path") or r.get("path")))
    return out


# =================================================================================== reports
NOT_VERIFIED_DEFAULT = [
    "visual review of the contact sheet (pivot, scale, normals, texture assignment, LOD pops)",
    "collision fit in the collision view mode",
    "in-editor API names marked [verify] (first_run_checks.py)",
]


def summarize(records):
    """Totals, decisions and issue counts across import records."""
    tot = {}
    ids = {}
    for r in records:
        tot[r.get("status", "?")] = tot.get(r.get("status", "?"), 0) + 1
        for i in r.get("issues", []):
            k = "%s:%s" % (i["id"], i["severity"])
            ids[k] = ids.get(k, 0) + 1
    dec = [r.get("decision") or {} for r in records]
    return {"records": len(records), "status": tot, "issues": dict(sorted(ids.items())),
            "nanite": sum(1 for d in dec if (d.get("nanite") or {}).get("nanite")),
            "collision": _count(((d.get("collision") or {}).get("action") for d in dec)),
            "classes": _count((d.get("asset_class") for d in dec)),
            "errors": sum(1 for r in records for i in r.get("issues", []) if i["severity"] == "error"),
            "ok": all(r.get("status") in ("pass", "warn", "skip", "handoff") for r in records)}


def _count(it):
    out = {}
    for x in it:
        if x:
            out[x] = out.get(x, 0) + 1
    return out


def write_report(records, out_dir, meta=None, not_verified=None, extra=None):
    """report.json (meta, summary, records, not_verified), report.csv, manifest.json. Returns paths."""
    os.makedirs(out_dir, exist_ok=True)
    summary = summarize(records)
    body = {"meta": meta or {}, "summary": summary, "not_verified": list(not_verified or NOT_VERIFIED_DEFAULT),
            "records": records}
    if extra:
        body.update(extra)
    jp = write_json(os.path.join(out_dir, "report.json"), body)
    cp = os.path.join(out_dir, "report.csv")
    with open(cp, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["source", "mesh_path", "status", "class", "nanite", "collision", "lods", "tris",
                    "errors", "warnings", "issue_ids", "seconds"])
        for r in records:
            d = r.get("decision") or {}
            fa = r.get("facts") or {}
            iss = r.get("issues", [])
            w.writerow([r.get("source"), r.get("mesh_path"), r.get("status"), d.get("asset_class"),
                        fa.get("nanite"), (d.get("collision") or {}).get("action"), fa.get("lod_count"),
                        fa.get("tris"), sum(1 for i in iss if i["severity"] == "error"),
                        sum(1 for i in iss if i["severity"] == "warning"),
                        " ".join(sorted({i["id"] for i in iss})), r.get("seconds")])
    mp = write_json(os.path.join(out_dir, "manifest.json"), manifest_from_records(records))
    return {"json": jp, "csv": cp, "manifest": mp, "summary": summary}


def contact_sheet_html(images, out_html, cols=6, title="Import review"):
    """A plain HTML grid of screenshots with captions and image-check flags, for a human pass.
    images: [{"path", "caption", "flags": [..]}]. Pure."""
    import html as _h
    cells = []
    for im in images:
        rel = os.path.relpath(im["path"], os.path.dirname(os.path.abspath(out_html)))
        flags = " ".join(im.get("flags") or [])
        cells.append('<figure><img src="%s" loading="lazy"><figcaption>%s<br><b>%s</b></figcaption></figure>'
                     % (_h.escape(rel), _h.escape(im.get("caption", "")), _h.escape(flags)))
    doc = ("<!doctype html><meta charset=utf-8><title>%s</title><style>body{font:13px sans-serif;"
           "background:#222;color:#ddd}main{display:grid;grid-template-columns:repeat(%d,1fr);gap:8px}"
           "img{width:100%%}b{color:#f77}</style><h1>%s</h1><main>%s</main>"
           % (_h.escape(title), cols, _h.escape(title), "".join(cells)))
    os.makedirs(os.path.dirname(os.path.abspath(out_html)), exist_ok=True)
    with open(out_html, "w", encoding="utf-8") as f:
        f.write(doc)
    return out_html


# =================================================================================== commands
def _engine(engine=None):
    if engine:
        return engine
    env = _lead("ue_env")
    eng = env.find_engine() if env else None
    if not eng:
        root = os.environ.get("UE_ROOT", "/Users/Shared/Epic Games/UE_5.8")
        b = os.path.join(root, "Engine", "Binaries", "Mac")
        eng = {"root": root, "editor": os.path.join(b, "UnrealEditor.app", "Contents", "MacOS", "UnrealEditor"),
               "editor_cmd": os.path.join(b, "UnrealEditor-Cmd"),
               "uat": os.path.join(root, "Engine", "Build", "BatchFiles", "RunUAT.sh"), "guessed": True}
    return eng


COMMON = ("-unattended", "-nosplash", "-stdout", "-FullStdOutLogOutput")  # [verify] on Mac


def shell_line(argv):
    return shlex.join([str(a) for a in argv])


def python_job_command(uproject, script, engine=None, fatal_script_errors=True):
    """argv for a one-off headless script (prefer ue_run.run_python, which stages the job in a
    space-free folder: -script= is split on spaces).

    Exit code rule: a Python failure only logs an error unless -ScriptErrorsAreFatal (5.5
    release notes; documented for -ExecutePythonScript, [verify] under -run=pythonscript), so
    exit code 0 alone never proves the job worked. Add the flag, and still require the job's
    own result line (ue_run's UE_RESULT, read with job_verdict())."""
    if " " in script:
        raise ValueError("-script path must not contain spaces; use ue_run.run_python: %s" % script)
    e = _engine(engine)
    a = [e["editor_cmd"], uproject, "-run=pythonscript", "-script=" + script]
    if fatal_script_errors:
        a.append("-ScriptErrorsAreFatal")
    return a + list(COMMON)


def datavalidation_command(uproject, engine=None):
    """-run=DataValidation: C++ and (engine-gathered) Blueprint rules only by default (data
    validation doc); Python validators run in our own job after add_validator."""
    e = _engine(engine)
    return [e["editor_cmd"], uproject, "-run=DataValidation"] + list(COMMON)


def resave_command(uproject, fixup_redirects=True, autocheckout=False, autocheckin=False, engine=None):
    """ResavePackages (naming doc; spelling -fixupredirects from its example, [verify])."""
    e = _engine(engine)
    a = [e["editor_cmd"], uproject, "-run=ResavePackages", "-projectonly"]
    if fixup_redirects:
        a.append("-fixupredirects")
    if autocheckout:
        a.append("-autocheckout")
    if autocheckin:
        a.append("-autocheckin")
    return a + list(COMMON)


def cook_command(uproject, platform="Mac", validation=True, engine=None, extra=()):
    """Cook only, with 5.4+ cook-time validation (without -ValidationErrorsAreFatal errors are
    downgraded to warnings). Cook platform 'Mac' (MacNoEditor is UE4)."""
    e = _engine(engine)
    a = [e["editor_cmd"], uproject, "-run=cook", "-targetplatform=" + platform]
    if validation:
        a += ["-RunAssetValidation", "-RunMapValidation", "-ValidationErrorsAreFatal"]
    return a + list(extra) + list(COMMON)


def automation_command(uproject, tests, report_dir, rendering=False, engine=None):
    """`Automation RunTest A+B;Quit` with -ReportExportPath (automation doc). rendering=True uses
    the GUI binary without -nullrhi (screenshot tests); otherwise -Cmd with -nullrhi [verify]."""
    e = _engine(engine)
    names = tests if isinstance(tests, str) else "+".join(tests)
    a = [e["editor"] if rendering else e["editor_cmd"], uproject,
         "-ExecCmds=Automation RunTest %s;Quit" % names, "-ReportExportPath=" + report_dir]
    if not rendering:
        a.append("-nullrhi")
    return a + list(COMMON)


def gauntlet_command(uproject, test="UE.BootTest", build="local", platform="Mac",
                     configuration="Development", runtest=None, engine=None, extra=()):
    """RunUAT RunUnreal: -build is WHERE the build is (editor, local, a path), not what to build
    (Zack Hamilton, 3ftOkc-cA7U [00:13:16]). Built-ins: UE.BootTest, UE.EditorAutomation,
    UE.TargetAutomation (Gauntlet doc) [verify on Mac]."""
    e = _engine(engine)
    a = [e["uat"], "RunUnreal", "-project=" + uproject, "-platform=" + platform,
         "-configuration=" + configuration, "-build=" + build, "-test=" + test]
    if runtest:
        a.append("-runtest=" + runtest)
    return a + list(extra)


def package_command(uproject, archive_dir, platform="Mac", config="Development", engine=None,
                    nop4=True, distribution=False, incremental=False, extra=()):
    """BuildCookRun argv through the lead's ue_run.build_buildcookrun (cook validation on),
    plus -nop4, -distribution (.xcarchive and dSYMs on Apple, Josh Adams uxdEt9XXKb8 [00:19:48])
    and -cookincremental (5.6, Beta in 5.8) when asked. All added flags [verify]."""
    e = _engine(engine)
    x = list(extra)
    if nop4:
        x.append("-nop4")
    if distribution:
        x.append("-distribution")
    if incremental:
        x.append("-cookincremental")
    run = _lead("ue_run")
    if run and hasattr(run, "build_buildcookrun"):
        return run.build_buildcookrun(e["uat"], uproject, platform=platform, config=config,
                                      archive_dir=archive_dir, extra=x)
    cmd = [e["uat"], "BuildCookRun", "-project=" + uproject, "-platform=" + platform,
           "-clientconfig=" + config, "-unattended", "-utf8output", "-build", "-cook", "-stage",
           "-pak", "-package", "-archive", "-archivedirectory=" + archive_dir,
           "-additionalcookeroptions=-RunAssetValidation -RunMapValidation -ValidationErrorsAreFatal"]
    return cmd + x


def buildcookrun_problems(argv):
    """Static checks on a BuildCookRun argv. Pure. Josh Adams (uxdEt9XXKb8): you need one of
    -cook or -skipcook ('skipcook is not the same thing as not having cook' [00:20:20]); cook
    does not stage [00:19:14]. Profile in Development or Test (packaging doc)."""
    a = [str(x) for x in argv]
    low = [x.lower() for x in a]
    out = []

    def has(flag):
        return any(x == flag or x.startswith(flag + "=") for x in low)
    if not has("-cook") and not has("-skipcook"):
        out.append("error: neither -cook nor -skipcook")
    if has("-cook") and has("-skipcook"):
        out.append("error: both -cook and -skipcook")
    if has("-package") and not has("-stage"):
        out.append("error: -package without -stage (the app gets no data)")
    if has("-archive") and not has("-archivedirectory"):
        out.append("warn: -archive without -archivedirectory")
    if has("-archive") and not has("-package"):
        out.append("warn: -archive without -package: no packaged app to archive (Package is its own "
                   "BuildCookRun stage; on Apple -package delivers the .app, Josh Adams uxdEt9XXKb8 [00:19:48])")
    plat = next((x.split("=", 1)[1] for x in low if x.startswith("-platform=")), "")
    if plat.endswith("noeditor"):
        out.append("error: %s is a UE4 platform name; use Mac or Windows" % plat)
    cfg = next((x.split("=", 1)[1] for x in low if x.startswith("-clientconfig=")), "")
    if cfg == "shipping" and not has("-distribution"):
        out.append("warn: Shipping build for testing; profile and smoke-test Development or Test first")
    if has("-distribution") and cfg != "shipping":
        out.append("warn: -distribution usually goes with -clientconfig=Shipping")
    if has("-cook") and not any("validationerrorsarefatal" in x for x in low):
        out.append("warn: no -ValidationErrorsAreFatal: cook validation errors become warnings")
    proj = next((x.split("=", 1)[1] for x in a if x.lower().startswith("-project=")), "")
    for p in project_path_problems(proj):
        out.append("warn: " + p)
    return out


def launcher_args(text):
    """Arguments after `BuildCookRun` in a line copied from the Project Launcher's Output Log (UAT
    doc, Command Line: build a custom launch profile once, copy everything after BuildCookRun,
    never hand-type the long line). Accepts a full log line or a bare argument string. Pure."""
    t = (text or "").strip()
    i = t.find("BuildCookRun")
    if i >= 0:
        t = t[i + len("BuildCookRun"):]
    try:
        return shlex.split(t)
    except ValueError:
        return t.split()


def _flag_map(argv):
    out = {}
    for a in argv:
        a = str(a)
        if not a.startswith("-"):
            continue
        k, _, v = a.partition("=")
        out[k.lower()] = v
    return out


BCR_PATH_FLAGS = ("-project", "-archivedirectory", "-scriptsforproject", "-stagingdirectory", "-ue4exe", "-unrealexe")


def buildcookrun_diff(ours, launcher):
    """Compare our BuildCookRun argv with the launcher's reference line (launcher_args()). Pure.
    Returns {"missing": flags the launcher has and we lack, "extra": ours only, "differ":
    [(flag, ours, launcher)] for value flags such as -platform or -clientconfig}. Path values
    (project, archive) are not compared; decide each difference, do not copy blindly."""
    a = _flag_map([x for x in ours if str(x).startswith("-")])
    b = _flag_map(launcher_args(launcher) if isinstance(launcher, str) else launcher)
    differ = sorted((k, a[k], b[k]) for k in set(a) & set(b)
                    if k not in BCR_PATH_FLAGS and a[k].lower() != b[k].lower())
    return {"missing": sorted(set(b) - set(a)), "extra": sorted(set(a) - set(b)), "differ": differ}


def batch_job(function_path, arguments):
    """JSON for the 5.8 batch processor (BatchProcessLibrary.run_batch / -run=BatchProcessCommandlet).
    function_path format from the 5.8 notes: '/Game/Python/<module>_PY.<Class>:<func>' [verify]."""
    return json.dumps({"function": function_path, "arguments": list(arguments)})


# =================================================================================== logs
def parse_uat_log(text):
    """{ok, exit_code, success_line, failure_line, errors[:40], archive_hint}. Wording of the UAT
    summary lines is [verify] on 5.8; exit code wins when present."""
    code = None
    for m in re.finditer(r"ExitCode[=:\s]+(-?\d+)", text or ""):
        code = int(m.group(1))
    succ = re.search(r"BUILD SUCCESSFUL", text or "")
    fail = re.search(r"BUILD FAILED|AutomationTool exiting with ExitCode=[1-9]", text or "")
    errs = [ln.strip() for ln in (text or "").splitlines()
            if re.search(r"\berror\b|: Error:|ERROR:", ln) and "0 error" not in ln][:40]
    app = re.findall(r"(/[^\s'\"]+\.app)\b", text or "")
    ok = (code == 0) if code is not None else bool(succ and not fail)
    return {"ok": ok, "exit_code": code, "success_line": bool(succ), "failure_line": bool(fail),
            "errors": errs, "apps": sorted(set(app))[:10]}


def parse_automation_report(report_dir):
    """Totals and failures from -ReportExportPath/index.json. The key names follow the report UE
    writes (succeeded, failed, notRun, tests[].state, entries[].event) [verify on 5.8]."""
    p = os.path.join(report_dir, "index.json")
    if not os.path.isfile(p):
        return {"ok": False, "error": "no index.json in %s" % report_dir}
    d = read_json(p)
    g = {k.lower(): v for k, v in d.items()}
    tests = g.get("tests") or []
    failed = []
    for t in tests:
        tl = {k.lower(): v for k, v in t.items()}
        state = str(tl.get("state", "")).lower()
        if state not in ("success", "succeeded", "pass", "passed"):
            msgs = []
            for e in tl.get("entries") or []:
                ev = e.get("event") or e.get("Event") or {}
                if str(ev.get("type", ev.get("Type", ""))).lower() == "error":
                    msgs.append(ev.get("message") or ev.get("Message"))
            failed.append({"name": tl.get("fulltestpath") or tl.get("testdisplayname"), "state": state,
                           "errors": msgs[:5]})
    n_fail = g.get("failed", len(failed))
    return {"ok": not failed and not n_fail, "succeeded": g.get("succeeded"), "failed": n_fail,
            "not_run": g.get("notrun"), "tests": len(tests), "failures": failed}


def parse_batch_results(path):
    """Rows of Saved/MultiprocessResults/results.txt (5.8 batch processor: Passed, ArgumentSummary,
    Output per call) [verify exact layout]. Accepts a JSON list, a {"Results": [...]} object or JSON lines."""
    with open(path, "r", encoding="utf-8-sig") as f:
        text = f.read()
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            rows = data.get("Results") or data.get("results") or []
        else:
            rows = list(data)
    except ValueError:
        rows = [json.loads(ln) for ln in text.splitlines() if ln.strip().startswith("{")]
    passed = [r for r in rows if r.get("Passed", r.get("passed"))]
    return {"total": len(rows), "passed": len(passed), "failed": len(rows) - len(passed),
            "failures": [r for r in rows if not r.get("Passed", r.get("passed"))][:50]}


def job_verdict(envelope, require_summary_ok=False):
    """CI verdict for one Python job run through ue_run (its envelope dict or a path to the JSON
    that `ue_run.py` printed). The engine's exit code is not the verdict: without
    -ScriptErrorsAreFatal a Python failure only logs an error (5.5 release notes). Red when the
    envelope is not ok, has no result, timed out, logged Python errors, or (optionally) its
    result's summary is not ok. Returns {"exit_code": 0|1, "reasons": [...]}. Pure."""
    env = read_json(envelope) if isinstance(envelope, str) else (envelope or {})
    why = []
    if not env.get("ok"):
        why.append("job not ok: %s" % (env.get("error") or "no error text"))
    if env.get("timed_out"):
        why.append("timed out")
    if env.get("result") is None:
        why.append("no result (no UE_RESULT line: the job never reported)")
    py = (env.get("log") or {}).get("python_errors") or []
    if py:
        why.append("%d Python error line(s), first: %s" % (len(py), str(py[0])[:160]))
    res = env.get("result") if isinstance(env.get("result"), dict) else {}
    summ = res.get("summary") if isinstance(res.get("summary"), dict) else None
    if require_summary_ok and summ is not None and not summ.get("ok", False):
        why.append("summary not ok: %s" % summ.get("status"))
    return {"exit_code": 1 if why else 0, "reasons": why}


def validation_messages(text):
    """(asset, message) pairs from DataValidation or cook validation log lines, for allow-listing
    legacy errors. Heuristic: an error line naming a /Game/ path [verify message format]."""
    out = []
    for ln in (text or "").splitlines():
        if re.search(r"Error", ln) and "/Game/" in ln and re.search(r"Validat|AssetCheck|DataValidation", ln):
            m = re.search(r"(/Game/[A-Za-z0-9_/.\-]+)", ln)
            out.append((m.group(1).split(".")[0] if m else None, ln.strip()))
    return out


# =================================================================================== config
def ini_set(text, section, key, value):
    """Set key=value in [section] of an ini text, idempotently; adds the section if missing. Pure."""
    lines = (text or "").splitlines()
    head = "[%s]" % section
    out, in_sec, done, found_sec = [], False, False, False
    for ln in lines:
        s = ln.strip()
        if s.startswith("[") and s.endswith("]"):
            if in_sec and not done:
                out.append("%s=%s" % (key, value))
                done = True
            in_sec = s == head
            found_sec = found_sec or in_sec
            out.append(ln)
            continue
        if in_sec and re.match(r"^\s*[+\-.!]?%s\s*=" % re.escape(key), ln):
            if not done:
                out.append("%s=%s" % (key, value))
                done = True
            continue
        out.append(ln)
    if in_sec and not done:
        out.append("%s=%s" % (key, value))
        done = True
    if not found_sec:
        if out and out[-1].strip():
            out.append("")
        out += [head, "%s=%s" % (key, value)]
    return "\n".join(out) + "\n"


def zen_ci_patch(text):
    """5.8 release notes: 'Projects should set LimitProcessLifetime=false in the Zen.AutoLaunch
    section of the DefaultEngine.ini' so Zenserver does not start and stop between CI steps."""
    return ini_set(text, "Zen.AutoLaunch", "LimitProcessLifetime", "false")


# =================================================================================== in-editor
# Every name below is touched inside Unreal. first_run_checks.py reports which exist on 5.8.
UNREAL_API = [
    "get_editor_subsystem", "EditorAssetSubsystem", "StaticMeshEditorSubsystem", "EditorValidatorSubsystem",
    "EditorValidatorBase", "DataValidationResult", "InterchangeManager", "ImportAssetParameters",
    "SoftObjectPath", "AssetImportTask", "AssetToolsHelpers", "MaterialInstanceConstant",
    "MaterialInstanceConstantFactoryNew", "MaterialEditingLibrary", "StaticMesh", "Texture2D", "Material",
    "TextureCompressionSettings", "TextureGroup", "BlendMode", "ScriptCollisionShapeType",
    "EditorScriptingMeshReductionOptions", "EditorScriptingMeshReductionSettings", "AssetRegistryHelpers",
    "ScopedSlowTask", "ScopedEditorTransaction", "collect_garbage", "SystemLibrary", "Paths", "Text",
    "uclass", "ufunction", "load_asset", "log", "log_warning", "log_error",
    "InterchangeVertexColorImportOption", "InterchangeMaterialImportOption", "ValidateAssetsSettings",
    "AutomationLibrary", "AutomationScheduler", "LevelEditorSubsystem", "UnrealEditorSubsystem",
    "EditorActorSubsystem",
]
DEFAULT_PIPELINE = "/Interchange/Pipelines/DefaultAssetsPipeline"  # engine plugin content [verify path]
DEFAULT_MATERIAL_HINTS = ("WorldGridMaterial", "DefaultMaterial")

# Import policy for static props. Each row: candidates, value, why. A candidate is a dotted
# property path on the duplicated generic assets pipeline, or (path, value) when spellings need
# different values; the first that exists wins. Values may be EnumRef or PathRef, resolved
# inside Unreal. Property and enum names are [verify]: describe_pipeline() dumps the real ones
# on the first run, and ensure_pipeline_preset() lists every row it could not set.
class EnumRef(tuple):
    """An unreal enum member resolved at set time: EnumRef("InterchangeMaterialImportOption",
    ("DO_NOT_IMPORT", ...)) tries unreal.<enum>.<member> for each spelling. Pure container."""
    def __new__(cls, enum_name, members):
        return tuple.__new__(cls, (enum_name, tuple(members)))


class PathRef(str):
    """A content path set as unreal.SoftObjectPath inside Unreal (e.g. a Parent Material)."""


PROP_PIPELINE_SETTINGS = [
    (["use_source_name_for_asset"], True, "asset name from the staged file name (plan names)"),
    (["mesh_pipeline.import_static_meshes"], True, "static props"),
    (["mesh_pipeline.import_skeletal_meshes"], False, "skeletal goes to scenario-unreal-animation's preset"),
    (["mesh_pipeline.combine_static_meshes"], True, "one static mesh per file [added]"),
    (["mesh_pipeline.import_collision_according_to_mesh_name"], True, "UCX_/UBX_/UCP_/USP_ from the DCC"),
    (["mesh_pipeline.import_collision"], False, "class rule adds collision after import [added]"),
    (["mesh_pipeline.build_nanite"], False, "decided per mesh after import (nanite_decision)"),
    (["mesh_pipeline.generate_lightmap_u_vs", "mesh_pipeline.generate_lightmap_uvs"], False,
     "Nanite doc: off unless Lightmass bakes"),
    ([("common_meshes_properties.vertex_color_import_option",
       EnumRef("InterchangeVertexColorImportOption", ("IVCIO_IGNORE", "IGNORE"))),
      ("mesh_pipeline.vertex_color_import_option",
       EnumRef("InterchangeVertexColorImportOption", ("IVCIO_IGNORE", "IGNORE")))], None,
     "Vertex Color Import Option = Ignore unless the master reads vertex colour (pipeline digest P2 preset)"),
    (["animation_pipeline.import_animations"], False, "static props"),
    ([("material_pipeline.material_import",
       EnumRef("InterchangeMaterialImportOption", ("DO_NOT_IMPORT", "IMPORT_NONE"))),
      "material_pipeline.import_materials", "material_pipeline.b_import_materials"], False,
     "DCC shaders (lambert1) never become assets; instances come from the plan"),
    (["texture_pipeline.import_textures"], False, "textures import from staged files with explicit roles"),
    (["texture_pipeline.detect_normal_map_texture"], True, "safety net if textures are imported"),
]


def pipeline_settings(route="post_import", master=None, master_uses_vertex_color=False):
    """Import policy rows for ensure_pipeline_preset(). Pure.

    route "post_import" (default, PROP_PIPELINE_SETTINGS): materials off, textures from staged
    files, one instance per slot made after import with an explicit parameter map (every
    parameter checked on the master, M04 when missing).
    route "interchange_mi": Interchange's own route (Interchange doc, Materials): Material Import
    = Import as Material Instance, Parent Material = the project master, textures imported with
    the mesh and Detect Normal Map on. Fewer steps, but the instance only fills the parameters
    Interchange knows, by the parent's parameter names (Interchange note, agent translation): use
    it when the master's parameter names match, or map textures afterwards and still run
    validate_mesh_facts (M02 parent, M04 parameters).
    master_uses_vertex_color: keep the file's vertex colours (Replace) instead of Ignore."""
    rows = [list(r) for r in PROP_PIPELINE_SETTINGS]
    if master_uses_vertex_color:
        for r in rows:
            if "vertex_color" in str(r[0]):
                r[0] = [(c[0], EnumRef("InterchangeVertexColorImportOption", ("IVCIO_REPLACE", "REPLACE")))
                        for c in r[0]]
                r[2] = "the master reads vertex colour: keep the file's colours"
    if route == "post_import":
        return [tuple(r) for r in rows]
    if route != "interchange_mi":
        raise ValueError("route must be post_import or interchange_mi: %r" % route)
    if not master:
        raise ValueError("interchange_mi needs the master material path (Parent Material)")
    out = []
    for r in rows:
        key = str(r[0])
        if "material_import" in key or "import_materials" in key:
            out.append(([("material_pipeline.material_import",
                          EnumRef("InterchangeMaterialImportOption",
                                  ("IMPORT_AS_MATERIAL_INSTANCES", "IMPORT_AS_MATERIAL_INSTANCE")))], None,
                        "Interchange doc: Material Import = Import as Material Instance"))
            out.append((["material_pipeline.parent_material"], PathRef(master),
                        "Interchange doc: Parent Material = the project master (else /Interchange/Materials parents)"))
        elif "texture_pipeline.import_textures" in key:
            out.append((r[0], True, "textures travel with the mesh in this route"))
        else:
            out.append(tuple(r))
    return out


def _u():
    import unreal  # only inside Unreal (or a test fake)
    return unreal


def _eas():
    u = _u()
    return u.get_editor_subsystem(u.EditorAssetSubsystem)


def _sms():
    u = _u()
    return u.get_editor_subsystem(u.StaticMeshEditorSubsystem)


def _enum(enum_name, *members):
    u = _u()
    e = getattr(u, enum_name, None)
    for m in members:
        if e is not None and hasattr(e, m):
            return getattr(e, m)
    raise AttributeError("unreal.%s has none of %s [verify]" % (enum_name, members))


def _get(obj, name):
    try:
        return obj.get_editor_property(name)
    except Exception:
        return getattr(obj, name)


def _resolve(value):
    """EnumRef -> unreal enum member, PathRef -> unreal.SoftObjectPath, anything else as is."""
    if isinstance(value, EnumRef):
        return _enum(value[0], *value[1])
    if isinstance(value, PathRef):
        return _u().SoftObjectPath(str(value))
    return value


def _set_path(root, dotted, value):
    parts = dotted.split(".")
    obj = root
    for p in parts[:-1]:
        obj = _get(obj, p)
    obj.set_editor_property(parts[-1], _resolve(value))


def ensure_pipeline_preset(dest_path, settings=None, source=DEFAULT_PIPELINE, overwrite=False):
    """IN-EDITOR, NOT YET RUN IN UNREAL. Duplicate the engine's generic assets pipeline into the
    project and set the import policy (Interchange PM, Oq6KbrqkGnw [00:10:59]: presets are team
    policy; [00:39:28]: scripted imports use the pipeline's defaults, not the dialog memory).
    Returns {path, created, set: [...], failed: [...]}; `failed` lists names to fix on 5.8."""
    eas = _eas()
    rec = {"path": dest_path, "created": False, "set": [], "failed": []}
    if eas.does_asset_exist(dest_path) and not overwrite:
        asset = eas.load_asset(dest_path)
    else:
        asset = eas.duplicate_asset(source, dest_path)
        rec["created"] = asset is not None
        if asset is None:
            raise RuntimeError("could not duplicate %s to %s [verify source path]" % (source, dest_path))
    for candidates, value, why in (settings or PROP_PIPELINE_SETTINGS):
        last = None
        for c in candidates:
            path, val = c if isinstance(c, tuple) else (c, value)
            try:
                _set_path(asset, path, val)
                rec["set"].append({"property": path, "value": str(val), "why": why})
                break
            except Exception as e:  # try the next spelling
                last = "%s: %s" % (type(e).__name__, e)
        else:
            names = [c[0] if isinstance(c, tuple) else c for c in candidates]
            rec["failed"].append({"candidates": names, "value": str(value), "error": last, "why": why})
    eas.save_loaded_asset(asset, only_if_is_dirty=False)
    return rec


def describe_pipeline(path=DEFAULT_PIPELINE, depth=1):
    """IN-EDITOR, NOT YET RUN. Property names of a pipeline asset and its sub-objects, from dir():
    the first-run source of truth for PROP_PIPELINE_SETTINGS."""
    asset = _u().load_asset(path)
    out = {"path": path, "class": type(asset).__name__, "properties": [n for n in dir(asset) if not n.startswith("_")]}
    if depth:
        out["children"] = {}
        for n in out["properties"]:
            if n.endswith("pipeline") or n.endswith("properties"):
                try:
                    child = _get(asset, n)
                    out["children"][n] = {"class": type(child).__name__,
                                          "properties": [x for x in dir(child) if not x.startswith("_")]}
                except Exception:
                    pass
    return out


def interchange_fbx_flags():
    """IN-EDITOR, NOT YET RUN. Values of the FBX feature-flag cvars the 5.8 doc still lists
    (Interchange.FeatureFlags.Import.FBX, .FBX.ToLevel) to know which importer handles FBX."""
    u = _u()
    out = {}
    for cv in ("Interchange.FeatureFlags.Import.FBX", "Interchange.FeatureFlags.Import.FBX.ToLevel"):
        try:
            out[cv] = u.SystemLibrary.get_console_variable_bool_value(cv)
        except Exception as e:
            out[cv] = "unreadable: %s" % e
    return out


def import_source(path, folder, pipeline=None, reimport_of=None, use_interchange=True, expect_name=None):
    """IN-EDITOR, NOT YET RUN IN UNREAL. Import one file into folder with an explicit pipeline
    (never the dialog's remembered settings). Interchange first (InterchangeManager.import_asset
    with ImportAssetParameters: is_automated, override_pipelines [verify field names]); legacy
    AssetImportTask as fallback (automated, replace_existing; destination_name is ignored by
    Interchange). Imports are not undoable: the caller snapshots first. Returns [objects].

    The saved 5.8 API page gives import_asset and reimport_asset as "Array[Object] or None"
    (None when the import fails). Reimport reuses the stack stored on the asset unless
    override_pipelines is passed, so the preset goes in on reimport too. If a build returns a
    bool instead, the new or expected-name assets of the folder are returned (folder diff)."""
    u = _u()
    if use_interchange and hasattr(u, "InterchangeManager"):
        eas = _eas()
        before = set(_pkg(x) for x in (eas.list_assets(folder, recursive=False, include_folder=False)
                                        if eas.does_directory_exist(folder) else []))
        mgr = u.InterchangeManager.get_interchange_manager_scripted()
        params = u.ImportAssetParameters()
        for name, val in (("is_automated", True), ("replace_existing", True)):
            try:
                params.set_editor_property(name, val)
            except Exception:
                pass
        if pipeline:
            pipes = list(_get(params, "override_pipelines") or [])
            pipes.append(u.SoftObjectPath(pipeline))
            params.set_editor_property("override_pipelines", pipes)
        if reimport_of is not None:
            objs = mgr.reimport_asset(reimport_of, params)
        else:
            objs = mgr.import_asset(folder, u.InterchangeManager.create_source_data(path), params)
        if isinstance(objs, bool):
            if not objs:
                return []
            want = expect_name or os.path.splitext(os.path.basename(path))[0]
            after = [_pkg(x) for x in eas.list_assets(folder, recursive=False, include_folder=False)]
            objs = [eas.load_asset(x) for x in after if x not in before or x.rsplit("/", 1)[-1] == want]
            if reimport_of is not None and reimport_of not in objs:
                objs.append(reimport_of)
        return [o for o in (objs or []) if o is not None]
    task = u.AssetImportTask()
    for name, val in (("filename", path), ("destination_path", folder), ("automated", True),
                      ("replace_existing", True), ("save", False)):
        task.set_editor_property(name, val)
    u.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    return list(task.get_objects())


def apply_texture_role(tex, role, normal_convention="directx"):
    """IN-EDITOR, NOT YET RUN. Compression, sRGB and texture group by role (Allar 7; Interchange
    Detect Normal Map is only a safety net). OpenGL normals (Blender, Unity, glTF bakes) get the
    green channel flipped for Unreal's DirectX convention [verify property flip_green_channel]."""
    comp, srgb, grp = role_settings(role)
    tex.set_editor_property("compression_settings", _enum("TextureCompressionSettings", comp))
    tex.set_editor_property("srgb", srgb)
    try:
        tex.set_editor_property("lod_group", _enum("TextureGroup", grp))
    except AttributeError:
        pass
    if role == "normal" and normal_convention == "opengl":
        tex.set_editor_property("flip_green_channel", True)
    return {"compression": comp, "srgb": srgb, "lod_group": grp}


def create_material_instance(name, folder, parent_path, textures_by_param, overwrite=False):
    """IN-EDITOR, NOT YET RUN. Get or create MI_<name> under folder with the approved master as
    parent, then set texture parameters by name. Parameters absent from the master are reported
    (M04), never guessed. Returns (mi, "created"|"existed", issues)."""
    u = _u()
    eas = _eas()
    mel = u.MaterialEditingLibrary
    path = folder + "/" + name
    issues = []
    if eas.does_asset_exist(path) and not overwrite:
        mi, status = eas.load_asset(path), "existed"
        if not isinstance(mi, u.MaterialInstanceConstant):
            raise TypeError("%s exists as %s" % (path, type(mi).__name__))
    else:
        tools = u.AssetToolsHelpers.get_asset_tools()
        try:
            mi = tools.create_asset(name, folder, u.MaterialInstanceConstant,
                                    u.MaterialInstanceConstantFactoryNew(), overwrite_existing=overwrite)
        except TypeError:  # pre-5.8 signature
            mi = tools.create_asset(name, folder, u.MaterialInstanceConstant, u.MaterialInstanceConstantFactoryNew())
        status = "created"
        if mi is None:
            raise RuntimeError("create_asset returned None for %s" % path)
    parent = u.load_asset(parent_path)
    if parent is None:
        raise RuntimeError("master material not found: %s" % parent_path)
    mel.set_material_instance_parent(mi, parent)
    try:
        known = set(str(n) for n in mel.get_texture_parameter_names(parent))
    except Exception:
        known = None
    for param, tex in (textures_by_param or {}).items():
        if known is not None and param not in known:
            issues.append(_issue("M04", "error", "%s has no texture parameter %r" % (parent_path, param)))
            continue
        mel.set_material_instance_texture_parameter_value(mi, param, tex)
    try:
        mel.update_material_instance(mi)
    except Exception:
        pass
    return mi, status, issues


def assign_materials(mesh, mi_by_slot):
    """IN-EDITOR, NOT YET RUN. Put an instance on every slot: exact slot name, else '*'."""
    done = []
    for i, sm in enumerate(list(mesh.get_editor_property("static_materials"))):
        slot = str(sm.get_editor_property("material_slot_name"))
        mi = mi_by_slot.get(slot) or mi_by_slot.get("*")
        if mi is not None:
            mesh.set_material(i, mi)
            done.append({"slot": slot, "material": mi.get_path_name()})
    return done


def apply_mesh_rules(mesh, decision):
    """IN-EDITOR, NOT YET RUN IN UNREAL. Nanite, LODs and collision in one pass (each change
    rebuilds the mesh; save once afterwards). Returns what was done."""
    _u()
    sms = _sms()
    done = {}
    nd = decision["nanite"]
    ns = mesh.get_editor_property("nanite_settings")
    ns.set_editor_property("enabled", bool(nd["nanite"]))
    if hasattr(sms, "set_nanite_settings"):
        sms.set_nanite_settings(mesh, ns, apply_changes=True)
    else:
        mesh.set_editor_property("nanite_settings", ns)
    done["nanite"] = bool(nd["nanite"])
    lods = decision["lods"]
    if lods["mode"] == "lod_group":
        # Whether assigning a LOD group regenerates LODs is not stated by any saved 5.8 page:
        # set it (StaticMesh.set_lod_group with rebuild if exposed [verify], else the property),
        # then COUNT, and build the chain explicitly when the count is short.
        if hasattr(mesh, "set_lod_group"):
            try:
                mesh.set_lod_group(lods["lod_group"], True)
            except TypeError:
                mesh.set_lod_group(lods["lod_group"])
        else:
            mesh.set_editor_property("lod_group", lods["lod_group"])
        done["lod_group"] = lods["lod_group"]
        if sms.get_lod_count(mesh) < lods.get("min_lods", 1):
            done["lods_set"] = _set_lods(mesh, DEFAULT_LOD_REDUCTION[:max(lods.get("min_lods", 1), 2)])
            done["lod_fallback"] = "LOD group gave %d LOD(s); explicit reduction applied" % sms.get_lod_count(mesh)
    elif lods["mode"] == "reduction":
        done["lods_set"] = _set_lods(mesh, lods["reduction"])
    col = decision["collision"]["action"]
    if col in ("box", "kdop26") and sms.get_simple_collision_count(mesh) == 0:
        shape = _enum("ScriptCollisionShapeType", "BOX" if col == "box" else "NDOP26")
        sms.add_simple_collisions(mesh, shape)
    elif col == "decomposition" and sms.get_simple_collision_count(mesh) == 0:
        sms.set_convex_decomposition_collisions(mesh, DECOMPOSITION["hull_count"],
                                                DECOMPOSITION["max_hull_verts"], DECOMPOSITION["hull_precision"])
    done["collision"] = col
    done["simple_collision_count"] = sms.get_simple_collision_count(mesh)
    return done


# Explicit LOD chain when a LOD group does not build one: (percent triangles, screen size),
# screen sizes strictly decreasing (L02). [added] start values, not an expert number: the
# pipeline digest's sketch uses the same halving; tune per project in plan meta lod_reduction.
DEFAULT_LOD_REDUCTION = [(1.0, 1.0), (0.5, 0.5), (0.25, 0.25), (0.125, 0.125)]


def _set_lods(mesh, reduction):
    """IN-EDITOR, NOT YET RUN. StaticMeshEditorSubsystem.set_lods with explicit settings."""
    u = _u()
    opts = u.EditorScriptingMeshReductionOptions()
    opts.set_editor_property("auto_compute_lod_screen_size", False)
    opts.set_editor_property("reduction_settings", [
        u.EditorScriptingMeshReductionSettings(percent_triangles=p, screen_size=s) for p, s in reduction])
    return _sms().set_lods(mesh, opts)


def _blend_name(mat):
    try:
        base = mat.get_base_material()
        return str(base.get_editor_property("blend_mode")).split(".")[-1].split(":")[0].strip("<> ").upper()
    except Exception:
        return None


def mesh_facts(mesh, category=None, asset_class=None):
    """IN-EDITOR, NOT YET RUN. The facts validate_mesh_facts() and mesh_rules() read."""
    u = _u()
    sms = _sms()
    path = mesh.get_path_name()
    pkg = _pkg(path)
    facts = {"name": mesh.get_name(), "path": pkg, "folder": pkg.rsplit("/", 1)[0], "class": "StaticMesh",
             "category": category, "asset_class": asset_class}
    try:
        facts["tris"] = int(mesh.get_num_triangles(0))
    except Exception:
        facts["tris"] = None
    ns = mesh.get_editor_property("nanite_settings")
    facts["nanite"] = bool(ns.get_editor_property("enabled"))
    facts["lod_count"] = sms.get_lod_count(mesh)
    try:
        facts["lod_screen_sizes"] = [round(float(x), 4) for x in sms.get_lod_screen_sizes(mesh)]
    except Exception:
        facts["lod_screen_sizes"] = None
    facts["simple_collision_count"] = sms.get_simple_collision_count(mesh)
    box = mesh.get_bounding_box()
    mn, mx = box.get_editor_property("min"), box.get_editor_property("max")
    facts["bounds_min"] = [mn.x, mn.y, mn.z]
    facts["bounds_max"] = [mx.x, mx.y, mx.z]
    facts["extent_cm"] = [mx.x - mn.x, mx.y - mn.y, mx.z - mn.z]
    mats = []
    for sm in mesh.get_editor_property("static_materials"):
        m = sm.get_editor_property("material_interface")
        rec = {"slot": str(sm.get_editor_property("material_slot_name")), "path": None, "class": None,
               "is_default": True}
        if m is not None:
            p = m.get_path_name()
            rec["path"] = _pkg(p)
            rec["class"] = type(m).__name__
            rec["is_default"] = any(h in p for h in DEFAULT_MATERIAL_HINTS)
            if isinstance(m, u.MaterialInstanceConstant):
                par = m.get_editor_property("parent")
                rec["parent"] = _pkg(par.get_path_name()) if par else None
            rec["blend_mode"] = _blend_name(m)
        mats.append(rec)
    facts["materials"] = mats
    try:
        facts["cook_path_length"] = int(_eas().get_asset_filename_length_for_cooking(pkg))
    except Exception:
        facts["cook_path_length"] = None
    return facts


def texture_facts(tex):
    """IN-EDITOR, NOT YET RUN. Size getters are [verify] (blueprint_get_size_x / _y)."""
    pkg = _pkg(tex.get_path_name())
    f = {"name": tex.get_name(), "path": pkg, "folder": pkg.rsplit("/", 1)[0]}
    try:
        f["width"], f["height"] = int(tex.blueprint_get_size_x()), int(tex.blueprint_get_size_y())
    except Exception:
        f["width"] = f["height"] = None
    f["srgb"] = bool(tex.get_editor_property("srgb"))
    f["compression"] = str(tex.get_editor_property("compression_settings")).split(".")[-1].strip("<> ").split(":")[0]
    f["lod_group"] = str(tex.get_editor_property("lod_group")).split(".")[-1].strip("<> ").split(":")[0]
    f["role"] = texture_role(f["name"])
    return f


_VALIDATORS = []   # module-level references keep registered validators alive [verify need]
_VALIDATOR_RULES = {}


def _validator_classes():
    """Define the uclasses once per session (Python-generated types need no unique names since
    5.5, but defining once keeps registration idempotent)."""
    if "classes" in _VALIDATOR_RULES:
        return _VALIDATOR_RULES["classes"]
    u = _u()

    def _report(self, asset, issues):
        errs = [i for i in issues if i["severity"] == "error"]
        for i in issues:
            if i["severity"] == "warning":
                self.asset_warning(asset, u.Text("[%s] %s" % (i["id"], i["msg"])))
        for i in errs:
            self.asset_fails(asset, u.Text("[%s] %s" % (i["id"], i["msg"])))
        if not errs:
            self.asset_passes(asset)   # every path must call passes or fails (validation doc)
        return self.get_validation_result()

    @u.uclass()
    class PipelineMeshValidator(u.EditorValidatorBase):
        @u.ufunction(override=True)
        def k2_can_validate_asset(self, asset):
            return isinstance(asset, u.StaticMesh)   # cheap: class test only (Fray [00:31:47])

        @u.ufunction(override=True)
        def k2_validate_loaded_asset(self, asset):
            try:
                rules = _VALIDATOR_RULES.get("rules") or DEFAULT_RULES
                facts = mesh_facts(asset)
                meta = {"target": {"nanite": rules.get("nanite_target", True)}}
                dec = mesh_rules(facts, meta)
                facts["asset_class"] = dec["asset_class"]
                facts["expected_nanite"] = dec["nanite"]["nanite"]
                issues = validate_mesh_facts(facts, rules)
            except Exception as e:
                issues = [_issue("E01", "error", "validator crashed: %s" % e)]
            return _report(self, asset, issues)

    @u.uclass()
    class PipelineTextureValidator(u.EditorValidatorBase):
        @u.ufunction(override=True)
        def k2_can_validate_asset(self, asset):
            return isinstance(asset, u.Texture2D)

        @u.ufunction(override=True)
        def k2_validate_loaded_asset(self, asset):
            try:
                issues = validate_texture_facts(texture_facts(asset), _VALIDATOR_RULES.get("rules"))
            except Exception as e:
                issues = [_issue("E01", "error", "validator crashed: %s" % e)]
            return _report(self, asset, issues)

    _VALIDATOR_RULES["classes"] = (PipelineMeshValidator, PipelineTextureValidator)
    return _VALIDATOR_RULES["classes"]


def register_validators(rules=None, only_under=None):
    """IN-EDITOR, NOT YET RUN IN UNREAL. Register the Python validators with the editor's
    validator subsystem (Python validators are not gathered at startup: they register
    themselves, every session; call this from Content/Python/init_unreal.py and at the top of
    every job that validates). Idempotent. Returns the class names registered."""
    u = _u()
    _VALIDATOR_RULES["rules"] = dict(DEFAULT_RULES, **(rules or {}))
    if _VALIDATORS:
        return [type(v).__name__ for v in _VALIDATORS]
    vs = u.get_editor_subsystem(u.EditorValidatorSubsystem)
    for cls in _validator_classes():
        v = cls()
        vs.add_validator(v)   # [verify Python name of AddValidator]
        _VALIDATORS.append(v)
    return [type(v).__name__ for v in _VALIDATORS]


def engine_validate(asset_paths):
    """IN-EDITOR, NOT YET RUN. Run every registered validator (C++, Blueprint, ours) on the given
    packages through EditorValidatorSubsystem [verify validate_assets_with_settings signature and
    return shape]. Returns {"raw": str(result), "ok": bool or None}."""
    u = _u()
    vs = u.get_editor_subsystem(u.EditorValidatorSubsystem)
    eas = _eas()
    datas = [eas.find_asset_data(p) for p in asset_paths]
    settings = u.ValidateAssetsSettings()
    try:
        res = vs.validate_assets_with_settings(datas, settings)
    except TypeError:
        results = u.ValidateAssetsResults()
        res = vs.validate_assets_with_settings(datas, settings, results)
    n_fail = res[0] if isinstance(res, tuple) else res if isinstance(res, int) else None
    return {"raw": str(res), "ok": (n_fail == 0) if isinstance(n_fail, int) else None}


def _wait_registry():
    """Headless, the asset registry may still be scanning: wait before any registry query
    (pattern of the 5.8 batch processor example; ue_run's boot also does it). Cheap once done."""
    try:
        _u().AssetRegistryHelpers.get_asset_registry().wait_for_completion()
        return True
    except Exception:
        return False


def redirectors_under(paths):
    """IN-EDITOR, NOT YET RUN. Package names of ObjectRedirector assets under the given folders,
    read from the asset registry (the measured gate for "zero redirectors", instead of counting
    our own renames). AssetData field names (asset_class_path.asset_name, package_name) [verify]."""
    u = _u()
    _wait_registry()
    reg = u.AssetRegistryHelpers.get_asset_registry()
    out = []
    for p in paths:
        for d in reg.get_assets_by_path(p, recursive=True):
            cls = getattr(d, "asset_class_path", None)
            name = str(getattr(cls, "asset_name", cls)) if cls is not None else str(getattr(d, "asset_class", ""))
            if name == "ObjectRedirector":
                out.append(str(d.package_name))
    return sorted(set(out))


def api_presence(names=None):
    """IN-EDITOR, NOT YET RUN. {name: bool} for every engine name this module uses."""
    u = _u()
    return {n: hasattr(u, n) for n in (names or UNREAL_API)}


def validate_paths(paths, rules=None):
    """IN-EDITOR, NOT YET RUN. Register the validators, then facts and issues for each static
    mesh or texture under the given packages or folders, plus engine_validate() on them.
    For CI: DataValidation (C++ rules) is a separate commandlet; this is the Python-rules pass."""
    u = _u()
    eas = _eas()
    rules = dict(DEFAULT_RULES, **(rules or {}))
    names = register_validators(rules)
    _wait_registry()
    pkgs = []
    for p in paths:
        if eas.does_directory_exist(p):
            pkgs += [_pkg(x) for x in eas.list_assets(p, recursive=True, include_folder=False)]
        else:
            pkgs.append(_pkg(p))
    records = []
    for p in sorted(set(pkgs)):
        t0 = time.time()
        a = eas.load_asset(p)
        if isinstance(a, u.StaticMesh):
            f = mesh_facts(a)
            dec = mesh_rules(f, {"target": {"nanite": rules.get("nanite_target", True)}})
            f["asset_class"], f["expected_nanite"] = dec["asset_class"], dec["nanite"]["nanite"]
            iss = validate_mesh_facts(f, rules)
        elif isinstance(a, u.Texture2D):
            f = texture_facts(a)
            iss = validate_texture_facts(f, rules)
        else:
            continue
        records.append({"path": p, "mesh_path": p, "facts": f, "issues": iss, "seconds": round(time.time() - t0, 4),
                        "status": "fail" if any(i["severity"] == "error" for i in iss) else ("warn" if iss else "pass")})
    ev = engine_validate([r["path"] for r in records]) if records else None
    # our rules' own cost per asset (load + facts + rules): the local proxy for the 5.8 cook
    # stat DataValidation.ReportCookValidationStats (per-validator duration, on by default)
    cost = {"max_seconds": max([r["seconds"] for r in records] or [0]),
            "total_seconds": round(sum(r["seconds"] for r in records), 3)}
    return {"validators": names, "records": records, "summary": summarize(records), "engine_validation": ev,
            "cost": cost}


def texture_params(item, textures, param_map, slot="*"):
    """{master parameter: texture} for one slot: shared ('*') textures first, then the slot's own,
    which win. param_map comes with the master (scenario-unreal-materials): role -> parameter name,
    'pack' for any packed map. Pure given the textures dict {name: texture object}."""
    out = {}
    for pref in ("*", slot):
        for t in item["textures"]:
            if t.get("slot", "*") != pref or t["name"] not in textures:
                continue
            p = param_map.get(t["role"]) or (param_map.get("pack") if t["role"].startswith("pack:") else None)
            if p:
                out[p] = textures[t["name"]]
    return out


def run_import_plan(plan_path, out_dir=None, chunk=25, rules=None, pipeline=None, do_validate=True):
    """IN-EDITOR JOB, NOT YET RUN IN UNREAL. Execute a plan from plan_imports()/stage_plan():
    per item import (or reimport) with the explicit pipeline, textures with roles, one MI per
    slot from the master, class rules (Nanite, LODs, collision) in one pass, facts and issues;
    save per chunk and collect_garbage(); then registered validators and the lead's ue_audit on
    the touched folders; report.json/.csv and manifest.json. One bad file never stops the run.
    Headless: run through ue_run.run_python with scripts/ue_pipeline_job.py. In an open editor:
    the same function through the MCP toolset or ue_remote.PythonRemote (write lock)."""
    u = _u()
    eas = _eas()
    plan = read_json(plan_path)
    meta = plan.get("meta", {})
    pipeline = pipeline or meta.get("pipeline")
    out_dir = out_dir or os.path.join(str(u.Paths.project_saved_dir()), "PipelineReports", time.strftime("%Y%m%d-%H%M%S"))
    rules = dict(DEFAULT_RULES, **(meta.get("rules") or {}), **(rules or {}))
    if meta.get("master") and not rules.get("masters"):
        rules["masters"] = [meta["master"]]
    registered = register_validators(rules) if do_validate else []
    _wait_registry()
    records, touched = [], set()
    items = plan["items"]
    stopped = None
    for start in range(0, len(items), chunk):
        batch = items[start:start + chunk]
        dirty = []
        with u.ScopedSlowTask(len(batch), "Importing %d-%d of %d" % (start + 1, start + len(batch), len(items))) as task:
            task.make_dialog(True)
            for it in batch:
                if task.should_cancel():
                    break
                task.enter_progress_frame(1)
                records.append(_import_item(it, meta, rules, pipeline, dirty, touched))
        if dirty and rules.get("require_checkout"):
            # Bardoux (MjjkWH0eT3U [00:55:27]): scripts check the files they touch are checked out
            # and stop if not. 5.8's PythonScript commandlet enables source control first.
            if not eas.checkout_loaded_assets(dirty):
                stopped = "checkout failed for chunk %d-%d: nothing saved, run stopped" % (start + 1, start + len(batch))
                records.append({"source": None, "status": "fail",
                                "issues": [_issue("SC01", "error", stopped)]})
                break
        if dirty:
            eas.save_loaded_assets(dirty, only_if_is_dirty=True)
        u.collect_garbage()
    for r in plan.get("rejected", []):
        records.append({"source": r["source"], "status": "fail", "issues": [_issue("I01", "error", r["reason"])]})
    extra = {"validators": registered}
    paths = sorted({r["mesh_path"] for r in records if r.get("status") in ("pass", "warn")})
    if do_validate and paths:
        try:
            extra["engine_validation"] = engine_validate(paths)
        except Exception as e:
            extra["engine_validation"] = {"error": "%s: %s" % (type(e).__name__, e)}
        audit = _lead("ue_audit")
        if audit and hasattr(audit, "audit_assets"):
            try:
                rep_a = audit.audit_assets(sorted(touched), rules=_audit_rules(rules), profile=rules.get("audit_profile", "game"))
                extra["audit"] = {"verdict": rep_a.get("verdict"), "summary": rep_a.get("summary")}
            except Exception as e:
                extra["audit"] = {"error": "%s: %s" % (type(e).__name__, e)}
        else:
            extra["audit"] = {"error": "ue_audit not available"}
    extra["redirectors_left"] = sum(len(r.get("redirectors") or []) for r in records)
    try:
        extra["redirectors_found"] = redirectors_under(sorted(touched)) if touched else []
    except Exception as e:
        extra["redirectors_found"] = {"error": "%s: %s" % (type(e).__name__, e)}
    if stopped:
        extra["stopped"] = stopped
    rep = write_report(records, out_dir, meta=dict(meta, plan=plan_path, pipeline=pipeline), extra=extra)
    return {"report": rep["json"], "csv": rep["csv"], "manifest": rep["manifest"], "summary": rep["summary"],
            "validators": registered, "out_dir": out_dir, "redirectors_left": extra["redirectors_left"],
            "redirectors_found": extra["redirectors_found"], "stopped": stopped}


def _rename_to_plan(obj, want, rec):
    """Rename an imported asset to its planned package when the importer chose another name
    (I02: a redirector is left; fix up redirectors before cooking, the Zen loader ignores
    core redirects). A rename onto a path a real asset already holds fails (naming doc), which
    is how a re-run silently leaves a duplicate: refuse it (I03) and report both paths.
    Returns the object that holds the planned name, or None."""
    have = _pkg(obj.get_path_name())
    if have == want:
        return obj
    eas = _eas()
    if eas.does_asset_exist(want):
        rec["issues"].append(_issue("I03", "error", "imported as %s but %s already exists: duplicate left, "
                                    "reimport the existing asset instead of importing again" % (have, want)))
        rec.setdefault("duplicates", []).append(have)
        return None
    rec["issues"].append(_issue("I02", "warning", "imported as %s, renamed to %s (redirector left)" % (have, want)))
    eas.rename_loaded_asset(obj, want)
    rec.setdefault("redirectors", []).append(have)
    return obj


def _audit_rules(rules):
    """This skill's rules in the lead's ue_audit vocabulary (second opinion, same facts)."""
    out = {"allowed_parents": list(rules.get("masters") or []),
           "texture_max_size": rules.get("max_texture", 8192)}
    if rules.get("max_cook_path"):
        out["max_cook_path_length"] = rules["max_cook_path"]
    return out


def _import_item(it, meta, rules, pipeline, dirty, touched):
    u = _u()
    eas = _eas()
    t0 = time.time()
    rec = {"source": it["source"], "sha1": it.get("sha1"), "mesh_path": it["mesh_path"], "action": it["action"],
           "policy": it.get("policy"), "issues": list(it.get("issues") or []), "status": "pass"}
    if it["action"] in ("skip", "handoff"):
        rec["status"] = it["action"]
        return rec
    try:
        eas.make_directory(it["folder"])
        existing = eas.load_asset(it["mesh_path"]) if (it["action"] == "reimport" and eas.does_asset_exist(it["mesh_path"])) else None
        objs = import_source(it.get("staged") or it["source"], it["folder"], pipeline, reimport_of=existing,
                             expect_name=it["mesh_name"])
        meshes = [o for o in objs if isinstance(o, u.StaticMesh)]
        if len(meshes) != 1:
            rec["issues"].append(_issue("I01", "error", "expected 1 static mesh, got %d" % len(meshes)))
            rec["status"] = "fail"
            return rec
        mesh = meshes[0]
        rec["redirectors"] = []
        if _rename_to_plan(mesh, it["mesh_path"], rec) is None:
            rec["status"] = "fail"
            return rec
        textures = {}
        for t in it["textures"]:
            src = t.get("staged") or t["source"]
            tobjs = [o for o in import_source(src, it["folder"], meta.get("texture_pipeline"), expect_name=t["name"])
                     if isinstance(o, u.Texture2D)]
            if tobjs:
                tex = _rename_to_plan(tobjs[0], it["folder"] + "/" + t["name"], rec)
                if tex is None:
                    continue
                apply_texture_role(tex, t["role"], it.get("normal_convention", "directx"))
                textures[t["name"]] = tex
                dirty.append(tex)
        mis = {}
        if meta.get("master"):
            for slot, mi_name in it["material_instances"].items():
                params = texture_params(it, textures, meta.get("param_map") or {}, slot)
                mi, status, iss = create_material_instance(mi_name, it["folder"], meta["master"], params)
                rec["issues"] += iss
                mis[slot] = mi
                dirty.append(mi)
        rec["materials"] = assign_materials(mesh, mis) if mis else []
        facts = mesh_facts(mesh, it.get("category"), it.get("asset_class"))
        decision = mesh_rules(facts, meta, it.get("asset_class"))
        rec["decision"] = decision
        rec["applied"] = apply_mesh_rules(mesh, decision)
        dirty.append(mesh)
        facts = mesh_facts(mesh, it.get("category"), decision["asset_class"])
        facts["expected_nanite"] = decision["nanite"]["nanite"]
        rec["facts"] = facts
        rec["issues"] += validate_mesh_facts(facts, rules)
        for tex in textures.values():
            rec["issues"] += validate_texture_facts(texture_facts(tex), rules)
        touched.add(it["folder"])
        rec["status"] = "fail" if any(i["severity"] == "error" for i in rec["issues"]) else (
            "warn" if rec["issues"] else "pass")
    except Exception as e:
        rec["issues"].append(_issue("E01", "error", "%s: %s" % (type(e).__name__, e)))
        rec["traceback"] = traceback.format_exc(limit=4)
        rec["status"] = "fail"
    rec["seconds"] = round(time.time() - t0, 2)
    return rec


# =================================================================================== CLI
def _main(argv):
    import argparse
    if argv and argv[0] == "problems":   # the rest is a BuildCookRun argv full of -flags
        out = buildcookrun_problems(argv[1:])
        print("\n".join(out) or "no problems found")
        return 1 if any(x.startswith("error") for x in out) else 0
    ap = argparse.ArgumentParser(prog="ue_pipeline.py", description=__doc__.split("\n")[1])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan", help="scan DCC exports and write an import plan (pure)")
    p.add_argument("--src", required=True)
    p.add_argument("--dest", required=True, help="content path, e.g. /Game/MyGame/Art/Props")
    p.add_argument("--out", required=True)
    p.add_argument("--convention", default="epic", choices=sorted(CONVENTIONS))
    p.add_argument("--master")
    p.add_argument("--param-map", default="{}", help='JSON, e.g. {"base_color":"BaseColor","normal":"Normal","pack":"ORM"}')
    p.add_argument("--dcc-manifest")
    p.add_argument("--previous")
    p.add_argument("--project-root")
    p.add_argument("--pipeline")
    p.add_argument("--policy", help="import policy version, e.g. PL_PropsImport@3: a change reimports")
    p.add_argument("--stage", help="staging folder: copies sources under their target names")
    s = sub.add_parser("diff")
    s.add_argument("old")
    s.add_argument("new")
    k = sub.add_parser("package", help="print the BuildCookRun command and its problems")
    k.add_argument("--project", required=True)
    k.add_argument("--archive", required=True)
    k.add_argument("--config", default="Development")
    k.add_argument("--platform", default="Mac")
    sub.add_parser("problems", help="static checks on a BuildCookRun argv: problems <args...>")
    c = sub.add_parser("compare-launcher", help="our BuildCookRun line vs the Project Launcher's")
    c.add_argument("--project", required=True)
    c.add_argument("--archive", required=True)
    c.add_argument("--launcher", required=True, help="text file holding the line copied from the Output Log")
    c.add_argument("--config", default="Development")
    c.add_argument("--platform", default="Mac")
    v = sub.add_parser("verdict", help="CI exit code from a ue_run envelope JSON")
    v.add_argument("envelope")
    v.add_argument("--require-summary-ok", action="store_true")
    g = sub.add_parser("parse-uat")
    g.add_argument("log")
    r = sub.add_parser("automation-report")
    r.add_argument("dir")
    a = ap.parse_args(argv)
    if a.cmd == "plan":
        prev = read_json(a.previous) if a.previous else None
        dcc = read_dcc_manifest(a.dcc_manifest) if a.dcc_manifest else None
        plan = plan_imports(scan_sources(a.src), a.dest, a.convention, previous=prev, dcc_manifest=dcc,
                            project_root=a.project_root, master=a.master, param_map=json.loads(a.param_map),
                            policy=a.policy)
        if a.pipeline:
            plan["meta"]["pipeline"] = a.pipeline
        if a.stage:
            stage_plan(plan, a.stage)
        write_json(a.out, plan)
        print(json.dumps({"items": len(plan["items"]), "rejected": len(plan["rejected"]),
                          "actions": _count(i["action"] for i in plan["items"]), "out": a.out}))
        return 0
    if a.cmd == "diff":
        print(json.dumps(publish_diff(read_json(a.old), read_json(a.new)), indent=2))
        return 0
    if a.cmd == "package":
        cmd = package_command(os.path.abspath(a.project), os.path.abspath(a.archive), a.platform, a.config)
        print(shell_line(cmd))
        for x in buildcookrun_problems(cmd):
            print(x)
        return 0
    if a.cmd == "compare-launcher":
        cmd = package_command(os.path.abspath(a.project), os.path.abspath(a.archive), a.platform, a.config)
        with open(a.launcher, "r", encoding="utf-8", errors="replace") as f:
            d = buildcookrun_diff(cmd, f.read())
        print(json.dumps(d, indent=2))
        return 0 if not (d["missing"] or d["differ"]) else 1
    if a.cmd == "verdict":
        res = job_verdict(a.envelope, a.require_summary_ok)
        print(json.dumps(res, indent=2))
        return res["exit_code"]
    if a.cmd == "parse-uat":
        with open(a.log, "r", encoding="utf-8", errors="replace") as f:
            res = parse_uat_log(f.read())
        print(json.dumps(res, indent=2))
        return 0 if res["ok"] else 1
    if a.cmd == "automation-report":
        res = parse_automation_report(a.dir)
        print(json.dumps(res, indent=2))
        return 0 if res.get("ok") else 1
    return 2


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
