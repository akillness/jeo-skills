"""
ue_audit: audit assets like a lead would before a handoff: naming, texture sizes and
compression, Nanite, collision, LODs, material slots and instance parents, references.

STATUS: evaluate(), verdict(), naming and texture rules ran offline on synthetic facts
(tests/code/unreal-expert/test_ue_audit_offline.py). The in-editor fact collection
(audit_assets, collect_facts) is NOT YET RUN IN UNREAL; every property it reads is tried
defensively and a failed read becomes an info line naming the API to [verify].

Design: collect_facts(asset) turns one loaded asset into plain data (in the editor);
evaluate(facts, rules) applies rules to that data (pure Python, anywhere). A domain skill
adds rules by passing its own dict, or extends facts in its own scripts/ue_<domain>.py.

  import ue_audit
  rep = ue_audit.audit_assets(["/Game/Props"], rules={"allowed_parents":
                              ["/Game/MaterialLibrary/M_PropMaster"]})   # in the editor
  v = ue_audit.verdict(rep, profile="game")      # anywhere: pass, errors, warnings, info
  ue_audit.save_report(rep, "/abs/Saved/Reports/props_audit.json")

Headless: ue_run.run_python(uproject, job) with a job that calls audit_assets (no level
needed). Profiles: game (default), cinematic, mobile, prototype.
"""

__version__ = "0.1"  # Unreal Engine Expert Skills v0.1 (2026-09-24)

import json
import os
import re

# Epic's recommended prefixes (Recommended Asset Naming Conventions, UE 5.8 docs). They
# differ from the UE4 Allar guide (SM_ vs S_, FXS_ vs PS_): pick one per project and put
# it here. MF_ for material functions is Allar's [added]. Maps (World) have no Epic prefix.
EPIC_PREFIXES = {
    "StaticMesh": "SM_", "SkeletalMesh": "SK_", "Texture2D": "T_", "TextureCube": "HDR_",
    "Material": "M_", "MaterialInstanceConstant": "MI_", "MaterialFunction": "MF_",
    "PhysicsAsset": "PHYS_", "PhysicalMaterial": "PM_", "Blueprint": "BP_",
    "AnimBlueprint": "ABP_", "WidgetBlueprint": "WBP_", "BlueprintInterface": "BI_",
    "DataTable": "DT_", "CurveTable": "CT_", "UserDefinedEnum": "E_",
    "UserDefinedStruct": "F_", "NiagaraSystem": "FXS_", "NiagaraEmitter": "FXE_",
    "NiagaraScript": "FXF_", "Skeleton": "SKEL_", "AnimMontage": "AM_",
    "AnimSequence": "AS_", "BlendSpace": "BS_", "LevelSequence": "LS_",
    "IKRigDefinition": "Rig_", "MediaSource": "MS_", "MediaOutput": "MO_",
    "MediaPlayer": "MP_", "MediaProfile": "MPR_", "RemoteControlPreset": "RCP_",
    "OpenColorIOConfiguration": "OCIO_", "LevelSnapshot": "SNAP_",
    "DisplayClusterConfigurationData": "NDC_", "World": None,
}
POST_PROCESS_PREFIX = "PPM_"

# Texture name suffix -> expected (compression setting, sRGB). Project conventions [added];
# override with rules["texture_suffixes"]. Normal maps: BC5 normal compression, sRGB off;
# packed masks (ORM): Masks, sRGB off (textures doc, Materials 101 Ep9).
TEXTURE_SUFFIXES = {
    "_N": ("TC_NORMALMAP", False), "_Normal": ("TC_NORMALMAP", False),
    "_ORM": ("TC_MASKS", False), "_M": ("TC_MASKS", False), "_Mask": ("TC_MASKS", False),
    "_R": ("TC_MASKS", False), "_AO": ("TC_MASKS", False),
    "_D": ("TC_DEFAULT", True), "_BC": ("TC_DEFAULT", True), "_BaseColor": ("TC_DEFAULT", True),
    "_E": ("TC_DEFAULT", True),
}
DEFAULT_MATERIAL_MARKERS = ("WorldGridMaterial", "/Engine/EngineMaterials/DefaultMaterial",
                            "DefaultLitMaterial")

DEFAULT_RULES = {
    "prefixes": EPIC_PREFIXES,
    "name_pattern": r"^[A-Za-z0-9_]+$",       # Allar 00.1: no spaces, no Unicode
    "texture_max_size": 8192,                 # pipeline digest (Allar 7, Interchange)
    "texture_power_of_two": True,             # except UI texture group
    "texture_suffixes": TEXTURE_SUFFIXES,
    "mesh_require_simple_collision": True,    # Nanite meshes need simple collision too
    "mesh_flag_default_complex": True,        # Profiling with Purpose, C-AjCqjKRSs [00:34:34]
    "lod_triangle_threshold": 1000,           # [added] non-Nanite meshes above this need LODs
    "min_lods": 2,                            # [added] LOD0 plus at least one
    "nanite_hint_triangles": 5000,            # [added] opaque static mesh above this: why no Nanite?
    "allowed_parents": [],                    # MI root materials allowed (empty = any)
    "forbid_default_material": True,
    "forbid_custom_hlsl": True,               # Sam Deiter, k0tgmrBuIJc [00:39:27]
    "flag_translucency_after_dof": True,      # C-AjCqjKRSs [00:48:38]
    "skeletal_require_physics_asset": True,
    "max_cook_path_length": None,             # set to your platform limit to enforce
    "max_static_switches": None,              # permutation budget per instance (materials skill)
    "lods_even_if_nanite": False,
}

# Per-profile severity changes: code -> new severity (or None to drop the issue).
PROFILES = {
    "game": {},
    "cinematic": {"mesh.no_collision": "info", "mesh.complex_as_default": "info",
                  "mesh.lods": "info", "mesh.nanite_off": "info",
                  "material.translucency_after_dof": "info", "skel.no_physics_asset": "info"},
    "mobile": {"mesh.nanite_off": None, "texture.size": "error", "mesh.lods": "error"},
    "prototype": {"naming.prefix": "info", "texture.compression": "info", "texture.srgb": "info",
                  "mesh.lods": "info", "mesh.nanite_off": None, "mesh.complex_as_default": "info",
                  "texture.npot": "info"},
}
PROFILE_RULES = {"mobile": {"texture_max_size": 2048,   # [added] start value
                            "lods_even_if_nanite": True}}  # no Nanite on mobile: fallback only


def _pow2(n):
    return n > 0 and (n & (n - 1)) == 0


def expected_prefix(facts, rules):
    cls = facts.get("class")
    if cls == "Material" and "POST_PROCESS" in str(facts.get("material_domain", "")).upper():
        return POST_PROCESS_PREFIX
    return rules["prefixes"].get(cls)


def _issue(sev, code, msg):
    return {"severity": sev, "code": code, "message": msg}


def evaluate(facts, rules=None):
    """Apply rules to one asset's facts (plain dict). Returns a list of issues
    {severity: error|warn|info, code, message}. Pure: tested offline."""
    r = dict(DEFAULT_RULES, **(rules or {}))
    out = []
    name, cls = facts.get("name", ""), facts.get("class", "")
    for e in facts.get("collect_errors", []):
        out.append(_issue("info", "audit.unread", "could not read %s [verify API]" % e))
    if facts.get("is_redirector"):
        out.append(_issue("warn", "asset.redirector", "redirector: fix up (ResavePackages "
                          "-fixupredirects) before cooking; Zen Loader ignores core redirects"))
        return out
    if r["name_pattern"] and not re.match(r["name_pattern"], name or ""):
        out.append(_issue("error", "naming.chars", "name %r has characters outside %s"
                          % (name, r["name_pattern"])))
    pre = expected_prefix(facts, r)
    if pre and not name.startswith(pre):
        out.append(_issue("warn", "naming.prefix", "%s should start with %s" % (cls, pre)))
    lim = r.get("max_cook_path_length")
    if lim and facts.get("cook_path_length") and facts["cook_path_length"] > lim:
        out.append(_issue("error", "asset.cook_path_length", "cook path %d chars > %d"
                          % (facts["cook_path_length"], lim)))
    if facts.get("referencers") == 0:
        out.append(_issue("info", "asset.unreferenced", "no referencers (hard or soft)"))

    if cls in ("Texture2D", "TextureCube"):
        size = facts.get("size") or [0, 0]
        mx = max(size) if size else 0
        if mx and mx > r["texture_max_size"]:
            out.append(_issue("warn", "texture.size", "%dx%d exceeds %d" % (size[0], size[1],
                                                                          r["texture_max_size"])))
        ui = "UI" in str(facts.get("lod_group", "")).upper()
        if r["texture_power_of_two"] and not ui and size and not all(_pow2(s) for s in size):
            out.append(_issue("warn", "texture.npot", "%dx%d is not a power of two (no mips "
                              "or streaming)" % (size[0], size[1])))
        for suf, (comp, srgb) in sorted(r["texture_suffixes"].items(), key=lambda kv: -len(kv[0])):
            if name.endswith(suf):
                got = str(facts.get("compression", ""))
                if got and got != comp:
                    out.append(_issue("warn", "texture.compression", "suffix %s expects %s, got %s"
                                      % (suf, comp, got)))
                if "srgb" in facts and bool(facts["srgb"]) != srgb:
                    out.append(_issue("warn", "texture.srgb", "suffix %s expects sRGB %s"
                                      % (suf, "on" if srgb else "off")))
                break

    if cls == "StaticMesh":
        nanite = bool(facts.get("nanite"))
        tris = facts.get("triangles")
        if r["mesh_require_simple_collision"] and facts.get("simple_collisions", 1) == 0:
            out.append(_issue("warn", "mesh.no_collision", "no simple collision (Nanite meshes "
                              "need it too; only LODs become unnecessary)"))
        if r["mesh_flag_default_complex"] and "USE_DEFAULT" in str(facts.get("collision_trace", "")):
            out.append(_issue("info", "mesh.complex_as_default", "complex collision from LOD0 "
                              "(or the full Nanite mesh) by default: costs memory, streaming and "
                              "queries; prefer simple-as-complex unless precise traces need it"))
        if (not nanite or r.get("lods_even_if_nanite")) and tris is not None and \
                tris >= r["lod_triangle_threshold"] and \
                facts.get("lods", 1) < r["min_lods"]:
            out.append(_issue("warn", "mesh.lods", "%d triangles, %d LOD(s), not Nanite"
                              % (tris, facts.get("lods", 1))))
        if not nanite and tris is not None and tris >= r["nanite_hint_triangles"] and \
                facts.get("opaque", True):
            out.append(_issue("info", "mesh.nanite_off", "opaque mesh with %d triangles is not "
                              "Nanite: decide on purpose (Nanite needs M2+ on Mac, Beta)" % tris))
        _check_slots(facts.get("materials", []), r, out)

    if cls == "SkeletalMesh":
        if r["skeletal_require_physics_asset"] and not facts.get("physics_asset"):
            out.append(_issue("warn", "skel.no_physics_asset", "no physics asset"))
        _check_slots(facts.get("materials", []), r, out)

    if cls == "MaterialInstanceConstant":
        root = facts.get("root_material")
        if r["allowed_parents"] and root not in r["allowed_parents"]:
            out.append(_issue("error", "mi.parent_not_allowed", "root %s is not an approved master"
                              % root))
        ms = r.get("max_static_switches")
        if ms is not None and facts.get("static_switch_overrides", 0) > ms:
            out.append(_issue("warn", "mi.permutations", "%d static switch overrides > %d: each "
                              "unique set compiles its own shaders" % (facts["static_switch_overrides"], ms)))

    if cls == "Material":
        if r["forbid_custom_hlsl"] and facts.get("custom_expressions", 0) > 0:
            out.append(_issue("warn", "material.custom_hlsl", "%d Custom (HLSL) node(s): build "
                              "with nodes unless the HLSL is required" % facts["custom_expressions"]))
        if r["flag_translucency_after_dof"] and "TRANSLUCENT" in str(facts.get("blend_mode", "")).upper() \
                and "AFTER_DOF" in str(facts.get("translucency_pass", "")).upper():
            out.append(_issue("warn", "material.translucency_after_dof", "translucent After DOF "
                              "renders at full output resolution regardless of dynamic resolution"))
    return out


def _check_slots(slots, r, out):
    for s in slots:
        path = s.get("path") or ""
        if r["forbid_default_material"] and (not path or any(m in path for m in DEFAULT_MATERIAL_MARKERS)):
            out.append(_issue("error", "mesh.default_material", "slot %r uses %s"
                              % (s.get("slot"), path or "no material")))
            continue
        if s.get("class") == "Material":
            out.append(_issue("info", "mesh.material_not_instance", "slot %r uses a base material; "
                              "prefer an instance of an approved master" % s.get("slot")))
        root = s.get("root")
        if r["allowed_parents"] and root and root not in r["allowed_parents"]:
            out.append(_issue("error", "mi.parent_not_allowed", "slot %r root %s not approved"
                              % (s.get("slot"), root)))


def build_report(facts_list, rules=None):
    """Evaluate a list of facts into a report dict. Pure."""
    assets, by_class, by_code = [], {}, {}
    for f in facts_list:
        issues = evaluate(f, rules)
        assets.append({"path": f.get("path"), "class": f.get("class"), "facts": f,
                       "issues": issues})
        by_class[f.get("class")] = by_class.get(f.get("class"), 0) + 1
        for i in issues:
            by_code[i["code"]] = by_code.get(i["code"], 0) + 1
    return {"assets": assets, "summary": {"assets": len(assets), "by_class": by_class,
                                          "issues": by_code},
            "rules": dict(DEFAULT_RULES, **(rules or {}))}


def verdict(report, profile="game"):
    """Apply a profile to a report: {"profile", "pass", "errors", "warnings", "info",
    "counts"}. pass is True when no error remains. Lines read
    'error: <path>: <code>: <message>'. Pure."""
    if profile not in PROFILES:
        raise ValueError("profile must be one of %s" % sorted(PROFILES))
    change = PROFILES[profile]
    extra_rules = PROFILE_RULES.get(profile)
    buckets = {"error": [], "warn": [], "info": []}
    for a in report.get("assets", []):
        issues = a["issues"]
        if extra_rules:
            issues = evaluate(a.get("facts", {}), dict(report.get("rules", {}), **extra_rules))
        for i in issues:
            sev = change.get(i["code"], i["severity"]) if i["code"] in change else i["severity"]
            if sev is None:
                continue
            buckets[sev].append("%s: %s: %s: %s" % (sev, a.get("path"), i["code"], i["message"]))
    return {"profile": profile, "pass": not buckets["error"], "errors": buckets["error"],
            "warnings": buckets["warn"], "info": buckets["info"],
            "counts": {k: len(v) for k, v in buckets.items()}}


def save_report(report, path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=str)
    return path


# =========================================================================== in the editor
def _enum_name(v):
    n = getattr(v, "name", None)
    return n if isinstance(n, str) else str(v).split(".")[-1].split(":")[0].strip("<> ")


def _try(facts, key, fn):
    try:
        facts[key] = fn()
    except Exception as e:
        facts.setdefault("collect_errors", []).append("%s (%s)" % (key, type(e).__name__))


def _root_material(mat):
    try:
        base = mat.get_base_material()
        return base.get_path_name().split(".")[0] if base else None
    except Exception:
        return None


def _slot_facts(mat_list, slot_attr):
    import unreal
    slots = []
    for i, s in enumerate(mat_list or []):
        m = s.get_editor_property("material_interface")
        try:
            slot_name = str(s.get_editor_property(slot_attr))
        except Exception:
            slot_name = str(i)
        slots.append({"slot": slot_name,
                      "path": m.get_path_name() if m else None,
                      "class": type(m).__name__ if m else None,
                      "root": _root_material(m) if m else None,
                      "translucent": bool(m and "TRANSLUCENT" in _enum_name(
                          m.get_base_material().get_editor_property("blend_mode")).upper())
                      if m and isinstance(m, unreal.MaterialInterface) else False})
    return slots


def collect_facts(asset, path=None, referencers=False):
    """One loaded asset -> plain facts dict. Every read is guarded [verify names on 5.8]."""
    import unreal
    eas = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
    f = {"class": type(asset).__name__, "name": asset.get_name(),
         "path": path or asset.get_path_name().split(".")[0]}
    _try(f, "cook_path_length", lambda: eas.get_asset_filename_length_for_cooking(f["path"]))
    if referencers:
        _try(f, "referencers", lambda: len(eas.find_package_referencers_for_asset(f["path"], False)))
    if isinstance(asset, unreal.ObjectRedirector):
        f["is_redirector"] = True
        return f
    if isinstance(asset, unreal.Texture2D):
        _try(f, "size", lambda: [asset.blueprint_get_size_x(), asset.blueprint_get_size_y()])
        _try(f, "compression", lambda: _enum_name(asset.get_editor_property("compression_settings")))
        _try(f, "srgb", lambda: bool(asset.get_editor_property("srgb")))
        _try(f, "lod_group", lambda: _enum_name(asset.get_editor_property("lod_group")))
        _try(f, "virtual_texture", lambda: bool(asset.get_editor_property("virtual_texture_streaming")))
    elif isinstance(asset, unreal.StaticMesh):
        sms = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
        _try(f, "lods", lambda: asset.get_num_lods())
        _try(f, "triangles", lambda: asset.get_num_triangles(0))
        _try(f, "nanite", lambda: bool(asset.get_editor_property("nanite_settings").enabled))
        _try(f, "simple_collisions", lambda: sms.get_simple_collision_count(asset))
        _try(f, "collision_trace", lambda: _enum_name(
            asset.get_editor_property("body_setup").get_editor_property("collision_trace_flag")))
        _try(f, "materials", lambda: _slot_facts(asset.get_editor_property("static_materials"),
                                                 "material_slot_name"))
        _try(f, "bounds_cm", lambda: _extent(asset.get_bounding_box()))
        if "materials" in f:
            f["opaque"] = not any(s.get("translucent") for s in f["materials"])
    elif isinstance(asset, unreal.SkeletalMesh):
        _try(f, "physics_asset", lambda: (asset.get_editor_property("physics_asset") or None) and
             asset.get_editor_property("physics_asset").get_path_name())
        _try(f, "skeleton", lambda: asset.get_editor_property("skeleton").get_path_name())
        _try(f, "materials", lambda: _slot_facts(asset.get_editor_property("materials"),
                                                 "material_slot_name"))
    elif isinstance(asset, unreal.MaterialInstanceConstant):
        _try(f, "root_material", lambda: _root_material(asset))
        _try(f, "parent", lambda: asset.get_editor_property("parent").get_path_name())
        _try(f, "static_switch_overrides", lambda: len([
            p for p in asset.get_editor_property("static_parameters").get_editor_property(
                "static_switch_parameters") if p.get_editor_property("override")]))
    elif isinstance(asset, unreal.Material):
        _try(f, "blend_mode", lambda: _enum_name(asset.get_editor_property("blend_mode")))
        _try(f, "material_domain", lambda: _enum_name(asset.get_editor_property("material_domain")))
        _try(f, "translucency_pass", lambda: _enum_name(asset.get_editor_property("translucency_pass")))
        _try(f, "custom_expressions", lambda: _count_custom(asset))
    return f


def _extent(box):
    lo, hi = box.min, box.max
    return [round(hi.x - lo.x, 2), round(hi.y - lo.y, 2), round(hi.z - lo.z, 2)]


def _count_custom(material):
    """Count Custom (HLSL) expressions. 5.8 adds GetExpressions for material graphs; the
    Python name is [verify], so two spellings are tried."""
    import unreal
    mel = unreal.MaterialEditingLibrary
    for fn in ("get_expressions", "get_material_expressions"):
        if hasattr(mel, fn):
            exprs = getattr(mel, fn)(material)
            return sum(1 for e in exprs if isinstance(e, unreal.MaterialExpressionCustom))
    raise AttributeError("no expression listing function on MaterialEditingLibrary")


def resolve_paths(paths):
    """Folders (recursive) and asset paths -> sorted unique package paths (in the editor)."""
    import unreal
    eas = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
    out = set()
    for p in paths:
        p = p.rstrip("/")
        if eas.does_directory_exist(p):
            for a in eas.list_assets(p, recursive=True, include_folder=False):
                out.add(str(a).split(".")[0])
        elif eas.does_asset_exist(p):
            out.add(p.split(".")[0])
    return sorted(out)


def audit_assets(paths, rules=None, referencers=False, profile=None):
    """In the editor: load each asset under `paths`, collect facts, evaluate rules.
    Read-only: loads, never saves or modifies. Returns the report (and its verdict under
    report["verdict"] when profile is given). NOT YET RUN IN UNREAL."""
    import unreal
    eas = unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)
    facts = []
    for p in resolve_paths(paths):
        try:
            asset = eas.load_asset(p)
        except Exception as e:
            facts.append({"path": p, "class": "Unknown", "name": p.rsplit("/", 1)[-1],
                          "collect_errors": ["load_asset (%s)" % type(e).__name__]})
            continue
        if asset is None:
            continue
        facts.append(collect_facts(asset, p, referencers=referencers))
    rep = build_report(facts, rules)
    if profile:
        rep["verdict"] = verdict(rep, profile)
    return rep
