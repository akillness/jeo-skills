"""
ue_materials: master materials, instances, Substrate, textures and shader-permutation audits
for the scenario-unreal-materials skill (UE 5.8 on macOS, Apple Silicon).

STATUS: NOT YET RUN IN UNREAL (UE 5.8 not installed on 2026-09-24).
- Sections 1 to 8 are pure Python (stdlib only, Python 3.11 compatible, so they also run inside
  the editor). They ran offline with system python3:
  tests/code/unreal-materials/test_ue_materials_offline.py.
- Section 9 (the in-editor layer, needs `import unreal`) ran only against a fake `unreal` module
  (tests/code/unreal-materials/fake_unreal.py, test_editor_layer_fake.py). That proves the Python
  logic, never UE behaviour. Every class, property, enum and pin name in CANDIDATES is a first
  guess with fallbacks: run probe() in a live 5.8 editor first and correct the tables from its JSON.

Library use:
  import ue_materials as um
  um.role_for("T_Panel_ORM")                     # "masks"
  um.check_texture({...props...})                 # findings for one texture
  um.texture_memory_bytes(2048, 2048, "BC1")      # 2,796,216 bytes with mips
  um.metalness_to_substrate((0.9, 0.6, 0.5), 1.0) # (diffuse_albedo, f0)
  um.census(records)                              # permutation keys per root material
  um.lint_graph(graph, profile="console60")       # findings on an exported material graph
  um.substrate_state(open("Config/DefaultEngine.ini").read())
  um.mask_cost(um.read_png("mask.png"))           # Horizontal Blend two-slab share (no PB, Adaptive only)
  um.cost_census(graph)                           # samples, independent vs dependent transcendentals
  um.audit_instance_values(records)               # F0, metal albedo, metallic and specular on MI values
  um.decal_response_for(um.decal_channels(g))     # smallest Decal Response for a receiver
  um.parse_listtextures(log_text)                 # cooked-build texture memory rows [verify format]

In the editor (Editor Python or a headless `UnrealEditor-Cmd <uproject> -run=pythonscript` job
started with scenario-unreal-expert's ue_run.run_python):
  um.probe("/abs/probe.json"); um.audit_textures("/Game/Kit"); um.build_kit_surface(...)
  um.make_instance(...); g = um.export_graph(mat); um.lint_graph(g); um.census_project(...)

Shared toolkit, not reimplemented here (<skills>/scenario-unreal-expert/scripts/): ue_run (headless jobs,
UE_RESULT line), ue_remote (live editor), ue_review (screenshot, render_still, image_checks),
ue_audit (generic asset audit and verdict), ue_stat (stat, CSV and trace parsers, budget_check).
"""

__version__ = "0.1"  # Unreal Engine Expert Skills v0.1 (2026-09-24; includes the refactor after blind grade U2)

import json
import math
import os
import re
import struct
import zlib

# =========================================================================== 1. findings
SEVERITIES = ("fail", "warn", "info")


def finding(rule, severity, message, fix="", node=None, source="", asset=None):
    """One audit row. severity: fail (blocks delivery), warn (fix or justify), info."""
    if severity not in SEVERITIES:
        raise ValueError("severity must be one of %s" % (SEVERITIES,))
    row = {"rule": rule, "severity": severity, "message": message}
    if fix:
        row["fix"] = fix
    if node is not None:
        row["node"] = node
    if source:
        row["source"] = source
    if asset is not None:
        row["asset"] = asset
    return row


def summarize(findings):
    """Counts per severity and a pass flag (no fail). Named summarize, not verdict: the
    project-level verdict belongs to scenario-unreal-expert's ue_audit.verdict()."""
    counts = {s: 0 for s in SEVERITIES}
    for f in findings:
        counts[f["severity"]] = counts.get(f["severity"], 0) + 1
    return {"pass": counts["fail"] == 0, "counts": counts,
            "rules": sorted(set(f["rule"] for f in findings))}


def to_markdown(findings, title="Material audit"):
    lines = ["# %s" % title, "", "| Severity | Rule | Asset / node | Message | Fix |", "|---|---|---|---|---|"]
    order = {s: i for i, s in enumerate(SEVERITIES)}
    for f in sorted(findings, key=lambda r: (order[r["severity"]], r["rule"])):
        where = f.get("asset") or ""
        if f.get("node"):
            where = (where + " " if where else "") + str(f["node"])
        cells = [f["severity"], f["rule"], where, f["message"], f.get("fix", "")]
        lines.append("| " + " | ".join(str(c).replace("|", "/") for c in cells) + " |")
    s = summarize(findings)
    lines += ["", "Pass: %s (%s)" % (s["pass"], ", ".join("%s %d" % kv for kv in s["counts"].items()))]
    return "\n".join(lines)


# =========================================================================== 2. textures
# Formats: bytes per texel, block size in texels (4 for BC formats, 1 for uncompressed).
FORMATS = {
    "BC1": (0.5, 4), "BC4": (0.5, 4), "BC3": (1.0, 4), "BC5": (1.0, 4), "BC6H": (1.0, 4),
    "BC7": (1.0, 4), "G8": (1.0, 1), "G16": (2.0, 1), "BGRA8": (4.0, 1), "RGBA16F": (8.0, 1),
    "R32F": (4.0, 1), "RGBA32F": (16.0, 1),
}

# Compression setting -> GPU format on desktop and console. BC1/BC3 split on alpha
# (Ben Cloward Materials 101 ep9 [h95X255NhOo 00:04:37, 00:06:24]; textures doc "BC6 and BC7").
# TC_ALPHA -> BC4 and TC_DISPLACEMENTMAP -> G16 are [added, verify].
COMPRESSION_FORMAT = {
    "TC_DEFAULT": ("BC1", "BC3"), "TC_MASKS": ("BC1", "BC3"), "TC_NORMALMAP": ("BC5", "BC5"),
    "TC_BC7": ("BC7", "BC7"), "TC_GRAYSCALE": ("G8", "G8"), "TC_ALPHA": ("BC4", "BC4"),
    "TC_HDR": ("RGBA16F", "RGBA16F"), "TC_HDR_COMPRESSED": ("BC6H", "BC6H"),
    "TC_EDITOR_ICON": ("BGRA8", "BGRA8"), "TC_DISPLACEMENTMAP": ("G16", "G16"),
    "TC_HALF_FLOAT": ("RGBA16F", "RGBA16F"), "TC_SINGLE_FLOAT": ("R32F", "R32F"),
}

# Material sampler type expected for (compression, sRGB). Mismatches are compile errors
# (Ben ep9 [h95X255NhOo 00:16:54, 00:17:26]); 5.7 adds Clean Graph > Fixup Mismatched Samplers.
# HDR, displacement and float rows are [verify].
def expected_sampler(compression, srgb):
    c = _norm_enum(compression, "TC_")
    if c == "TC_NORMALMAP":
        return "SAMPLERTYPE_NORMAL"
    if c == "TC_MASKS":
        return "SAMPLERTYPE_MASKS"
    if c == "TC_ALPHA":
        return "SAMPLERTYPE_ALPHA"
    if c in ("TC_GRAYSCALE", "TC_DISPLACEMENTMAP"):
        return "SAMPLERTYPE_GRAYSCALE" if srgb else "SAMPLERTYPE_LINEAR_GRAYSCALE"
    if c in ("TC_HDR", "TC_HDR_COMPRESSED", "TC_HALF_FLOAT", "TC_SINGLE_FLOAT"):
        return "SAMPLERTYPE_LINEAR_COLOR"
    return "SAMPLERTYPE_COLOR" if srgb else "SAMPLERTYPE_LINEAR_COLOR"


# Texture roles. "allowed" lists acceptable compression settings, first = default.
# Sources: Ben Cloward ep9 decision table [h95X255NhOo 00:15:45]; terrain ep2 CR/NOH
# [gjOO5g4cgng 00:13:08, 00:14:17]; textures doc (BC7 for unrelated channels, BC6H for HDR);
# Sumo (BC1 normal+height only on rough noisy surfaces) [SAr7oPKsgLE 00:23:25].
ROLES = {
    "base_color": dict(allowed=("TC_DEFAULT", "TC_BC7"), srgb=True, alpha=False,
                       group="TEXTUREGROUP_WORLD",
                       note="BC1; BC7 (2x memory) only when BC1 banding shows"),
    "base_color_alpha": dict(allowed=("TC_DEFAULT", "TC_BC7"), srgb=True, alpha=True,
                             group="TEXTUREGROUP_WORLD", note="BC3 or BC7 (same bytes, BC7 better)"),
    "color_rough": dict(allowed=("TC_BC7",), srgb=True, alpha=True, group="TEXTUREGROUP_WORLD",
                        note="packed CR: RGB colour, A roughness, BC7 sRGB on (alpha stays linear)"),
    "normal": dict(allowed=("TC_NORMALMAP",), srgb=False, alpha=False,
                   group="TEXTUREGROUP_WORLD_NORMAL_MAP", note="BC5, DirectX green (flip OpenGL)"),
    "normal_packed": dict(allowed=("TC_BC7",), srgb=False, alpha=True,
                          group="TEXTUREGROUP_WORLD_NORMAL_MAP",
                          note="NOH: RG normal, B AO, A height; never Normalmap (drops B and A)"),
    "masks": dict(allowed=("TC_MASKS", "TC_BC7"), srgb=False, alpha=None,
                  group="TEXTUREGROUP_WORLD_SPECULAR",
                  note="ORM-style packing; BC7 when channels are unrelated and BC1 blocks show"),
    "height": dict(allowed=("TC_GRAYSCALE", "TC_BC7", "TC_ALPHA", "TC_DISPLACEMENTMAP", "TC_MASKS"),
                   srgb=False, alpha=False, group="TEXTUREGROUP_WORLD",
                   note="better packed into a NOH or mask alpha; Grayscale (R8) when small and blocky"),
    "single": dict(allowed=("TC_GRAYSCALE", "TC_ALPHA", "TC_MASKS", "TC_BC7"), srgb=False, alpha=False,
                   group="TEXTUREGROUP_WORLD",
                   note="a lone grayscale map is a packing candidate (one sample per packed texture)"),
    "emissive": dict(allowed=("TC_DEFAULT", "TC_BC7", "TC_HDR_COMPRESSED"), srgb=True, alpha=False,
                     group="TEXTUREGROUP_WORLD", note="LDR emissive mask x scalar intensity"),
    "hdr": dict(allowed=("TC_HDR_COMPRESSED", "TC_HDR"), srgb=False, alpha=None,
                group="TEXTUREGROUP_WORLD", note="BC6H is 8x smaller than RGBA16F"),
    "ui": dict(allowed=("TC_EDITOR_ICON", "TC_DEFAULT", "TC_BC7"), srgb=True, alpha=None,
               group="TEXTUREGROUP_UI", note="UI group, mips optional"),
}

SUFFIX_ROLE = {}
for _role, _sfx in (
        ("base_color", "BC D DIFF DIFFUSE ALB ALBEDO BASECOLOR COLOR COL"),
        ("base_color_alpha", "BCA DA BCO"),
        ("color_rough", "CR"),
        ("normal", "N NRM NOR NORMAL"),
        ("normal_packed", "NOH NH NOHA"),
        ("masks", "ORM ORMS MRA ARM RMA RMO ASMR M MASK MASKS MSK CID"),
        ("height", "H HEIGHT DISP DISPLACEMENT"),
        ("single", "R ROUGH ROUGHNESS AO OCC CAV CAVITY METAL METALLIC G GRUNGE"),
        ("emissive", "E EM EMISSIVE EMIT"),
        ("hdr", "HDR HDRI"),
        ("ui", "UI ICON"),
):
    for _s in _sfx.split():
        SUFFIX_ROLE[_s] = _role


def role_for(name):
    """Texture role from its name suffix (T_<Name>_<Suffix>, optional UDIM or version digits).
    Returns None when the suffix is unknown (the texture then needs an explicit role)."""
    base = os.path.basename(str(name)).split(".")[0]
    parts = [p for p in re.split(r"[_\-]", base) if p]
    while parts and re.fullmatch(r"\d+|v\d+|\d{4}", parts[-1], flags=re.I):
        parts.pop()
    if len(parts) < 2:
        return None
    return SUFFIX_ROLE.get(parts[-1].upper())


def mip_count(width, height):
    """Full chain down to 1x1: 1024 -> 11, 2048 -> 12, 4096 -> 13 (textures doc table)."""
    return int(math.floor(math.log2(max(1, int(width), int(height))))) + 1


def texture_memory_bytes(width, height, fmt, mips=True):
    """GPU bytes for one 2D texture. BC formats pay at least one 4x4 block per mip.
    Checks against the textures doc table: BC1 2048 = 2.66 MiB, BC1 1024 = 682 KiB,
    BC3/BC5/BC7 double BC1."""
    if fmt not in FORMATS:
        raise ValueError("unknown format %r" % fmt)
    bpp, block = FORMATS[fmt]
    w, h = int(width), int(height)
    total = 0
    while True:
        bw = max(block, int(math.ceil(w / float(block))) * block)
        bh = max(block, int(math.ceil(h / float(block))) * block)
        total += int(bw * bh * bpp)
        if not mips or (w == 1 and h == 1):
            break
        w, h = max(1, w // 2), max(1, h // 2)
    return total


def gpu_format(compression, has_alpha=False, compression_no_alpha=False):
    c = _norm_enum(compression, "TC_")
    pair = COMPRESSION_FORMAT.get(c)
    if pair is None:
        return None
    return pair[1] if (has_alpha and not compression_no_alpha) else pair[0]


def resident_top_mip(src_w, src_h, lod_bias=0, group_lod_bias=0, max_texture_size=0,
                     group_max_lod_size=None, group_min_lod_size=None):
    """Top mip that ships: (source >> (texture LOD bias + group LOD bias)), then clamped to
    Maximum Texture Size (0 = none) and to the group's MaxLODSize / MinLODSize from
    DefaultDeviceProfiles.ini (textures doc, "TextureGroup, LODGroup and LODBias")."""
    w, h = int(src_w), int(src_h)
    bias = max(0, int(lod_bias) + int(group_lod_bias))
    for _ in range(bias):
        if w <= 1 and h <= 1:
            break
        w, h = max(1, w // 2), max(1, h // 2)
    caps = [c for c in (max_texture_size, group_max_lod_size) if c]
    for cap in caps:
        while max(w, h) > int(cap):
            w, h = max(1, w // 2), max(1, h // 2)
    if group_min_lod_size:
        while max(w, h) < int(group_min_lod_size) and (w < src_w or h < src_h):
            w, h = min(src_w, w * 2), min(src_h, h * 2)
    return w, h


def _pow2(n):
    n = int(n)
    return n > 0 and (n & (n - 1)) == 0


# Resolution ceilings by profile. Games: 2K (Ben [gjOO5g4cgng 00:08:49], Sumo [SAr7oPKsgLE
# 00:29:20]); cinematic stills may use Virtual Textures and more (textures doc).
PROFILE_MAX_RESIDENT = {"console60": 2048, "pc": 2048, "mobile": 1024, "cinematic": 8192}


def check_texture(props, role=None, profile="console60"):
    """Findings for one texture. props keys (all optional except name): name, compression_settings,
    srgb, lod_group, width, height, lod_bias, max_texture_size, group_lod_bias, group_max_lod_size,
    has_alpha, compression_no_alpha, mip_gen_settings, virtual_texture_streaming, never_stream,
    sampler_types_used (list), rvt_writer_input (bool), flip_green_channel, world_texture (bool)."""
    name = props.get("name", "?")
    role = role or props.get("role") or role_for(name)
    out = []
    if role is None:
        out.append(finding("texture_role_unknown", "warn",
                           "no role from the suffix of %s" % name,
                           "rename with a role suffix (_BC, _N, _ORM, _NOH, _CR, _H, _E) or pass role=",
                           asset=name))
        return out
    spec = ROLES[role]
    comp = _norm_enum(props.get("compression_settings"), "TC_") if props.get("compression_settings") else None
    srgb = props.get("srgb")
    if comp is not None and comp not in spec["allowed"]:
        sev = "fail"
        msg = "%s is %s, role %s allows %s" % (name, comp, role, "/".join(spec["allowed"]))
        if role == "normal_packed" and comp == "TC_NORMALMAP":
            msg = "%s: packed normal (NOH) compressed as Normalmap drops AO and height" % name
        if role == "normal" and comp == "TC_BC7":
            sev = "info"
            msg = "%s: normal as BC7; fine only if it carries extra data" % name
        out.append(finding("texture_compression", sev, msg, "set %s" % spec["allowed"][0],
                           source="Ben Cloward gjOO5g4cgng 00:11:02; h95X255NhOo 00:15:45", asset=name))
    if srgb is not None and bool(srgb) != spec["srgb"]:
        out.append(finding("texture_srgb", "fail",
                           "%s: sRGB %s, role %s needs %s" % (name, srgb, role, spec["srgb"]),
                           "set srgb=%s" % spec["srgb"], source="Ben Cloward h95X255NhOo 00:09:39",
                           asset=name))
    w, h = props.get("width"), props.get("height")
    if w and h:
        if not (_pow2(w) and _pow2(h)):
            out.append(finding("texture_npot", "warn", "%s: %dx%d is not a power of 2, it will not stream"
                               % (name, w, h), "resize the source to a power of 2",
                               source="textures doc, Non-Power of 2", asset=name))
        if (int(w) % 4) or (int(h) % 4):
            out.append(finding("texture_not_multiple_of_4", "warn",
                               "%s: top mip not a multiple of 4 is left uncompressed" % name, asset=name))
        rw, rh = resident_top_mip(w, h, props.get("lod_bias", 0), props.get("group_lod_bias", 0),
                                  props.get("max_texture_size", 0), props.get("group_max_lod_size"))
        cap = PROFILE_MAX_RESIDENT.get(profile, 2048)
        if max(rw, rh) > cap:
            sev = "fail" if (max(rw, rh) >= 4096 and profile != "cinematic") else "warn"
            out.append(finding("texture_resident_size", sev,
                               "%s ships at %dx%d, profile %s caps at %d" % (name, rw, rh, profile, cap),
                               "Maximum Texture Size %d or LOD Bias; detail comes from tiling layers, not resolution"
                               % cap, source="Ben gjOO5g4cgng 00:08:49; Sumo SAr7oPKsgLE 00:29:20", asset=name))
    mips = _norm_enum(props.get("mip_gen_settings"), "TMGS_") if props.get("mip_gen_settings") else None
    if mips == "TMGS_NO_MIPMAPS" and role != "ui" and props.get("world_texture", True):
        out.append(finding("texture_no_mips", "fail",
                           "%s has NoMipMaps on world content: cache misses and shimmer" % name,
                           "FromTextureGroup; never disable mips to fix blur",
                           source="Tech Art Aid y0QASid1v8w 00:53:23", asset=name))
    if spec["alpha"] is False and props.get("has_alpha") and not props.get("compression_no_alpha"):
        out.append(finding("texture_stray_alpha", "warn",
                           "%s: alpha detected on a 3-channel role, BC1 becomes BC3 (2x memory)" % name,
                           "compression_no_alpha=True", source="Ben h95X255NhOo 00:04:00", asset=name))
    if comp == "TC_HDR" and role in ("hdr", "emissive"):
        out.append(finding("texture_hdr_uncompressed", "warn",
                           "%s: RGBA16F is 8x the memory of HDR Compressed (BC6H)" % name,
                           "TC_HDR_COMPRESSED unless quality dictates", source="textures doc, BC6 and BC7",
                           asset=name))
    if props.get("rvt_writer_input") and props.get("virtual_texture_streaming"):
        out.append(finding("texture_vt_in_rvt_writer", "fail",
                           "%s is a streaming virtual texture used by an RVT writer (unsupported)" % name,
                           "virtual_texture_streaming=False for writer inputs", source="RVT doc, Additional Notes",
                           asset=name))
    if comp is not None and props.get("sampler_types_used"):
        exp = expected_sampler(comp, bool(srgb) if srgb is not None else spec["srgb"])
        for st in props["sampler_types_used"]:
            if _norm_enum(st, "SAMPLERTYPE_") != exp:
                out.append(finding("texture_sampler_mismatch", "fail",
                                   "%s sampled as %s, compression %s needs %s" % (name, st, comp, exp),
                                   "set the Texture Sample Sampler Type, or Clean Graph > Fixup Mismatched Samplers",
                                   source="Ben h95X255NhOo 00:17:26", asset=name))
    grp = props.get("lod_group")
    if grp and _norm_enum(grp, "TEXTUREGROUP_") != spec["group"] and role in ("normal", "normal_packed"):
        out.append(finding("texture_group", "info", "%s: group %s, normals usually %s" % (name, grp, spec["group"]),
                           asset=name))
    if comp == "TC_ALPHA":
        out.append(finding("texture_alpha_only", "info",
                           "%s: the Alpha compression setting keeps only the alpha channel" % name,
                           "author the data in A and sample A (sampler type Alpha)",
                           source="Ben Cloward h95X255NhOo 00:13:03", asset=name))
    if role == "normal" and props.get("normalize_after_mips") is False:
        out.append(finding("normal_mips_flatten", "info",
                           "%s: Normalize after making Mips off: distant normals shorten, panels flatten or shimmer" % name,
                           "turn it on; or Composite Texture on the roughness map (roughness from normal variance)",
                           source="textures doc, Texture Settings and Compositing Settings", asset=name))
    return out


# Cooked-build truth for texture memory: the Platforms panel and `listtextures` in a cooked or -game
# session are the ground truth (textures doc, Platforms Panel); `stat streaming` and
# r.Streaming.PoolSize diagnose the pool (textures doc, Mistakes). The listtextures layout below is
# a first guess [verify format on a 5.8 log]: one row per texture with 'W x H (N KB' pairs (max
# allowed first, in memory second), a PF_ format, a TEXTUREGROUP_ and an object path.
_LT_SIZE = re.compile(r"(\d+)\s*x\s*(\d+)\s*\(\s*([\d.,]+)\s*KB", re.I)


def parse_listtextures(text):
    """Rows from `listtextures` log output: [{'name', 'max_w', 'max_h', 'max_kb', 'mem_w', 'mem_h',
    'mem_kb', 'format', 'group', 'streaming'}]. Lines without an object path are skipped."""
    rows = []
    for line in (text or "").splitlines():
        path = re.search(r"(/(?:Game|Engine)/[^\s,]+)", line)
        sizes = _LT_SIZE.findall(line)
        if not path or not sizes:
            continue
        mx = sizes[0]
        mem = sizes[1] if len(sizes) > 1 else sizes[0]
        fmt = re.search(r"\b(PF_[A-Za-z0-9_]+)", line)
        grp = re.search(r"\b(TEXTUREGROUP_[A-Za-z0-9_]+)", line)
        tail = line[path.end():]
        yn = re.search(r"\b(YES|NO)\b", tail, re.I)
        rows.append({"name": path.group(1), "max_w": int(mx[0]), "max_h": int(mx[1]),
                     "max_kb": float(mx[2].replace(",", "")), "mem_w": int(mem[0]), "mem_h": int(mem[1]),
                     "mem_kb": float(mem[2].replace(",", "")), "format": fmt.group(1) if fmt else None,
                     "group": grp.group(1) if grp else None,
                     "streaming": (yn.group(1).upper() == "YES") if yn else None})
    return rows


def texture_memory_findings(rows, pool_mb=None, profile="console60", top=10):
    """Findings on parsed listtextures rows: textures resident above the profile cap, the total
    in memory against r.Streaming.PoolSize (MB) when given, and the top memory users (info)."""
    out = []
    cap = PROFILE_MAX_RESIDENT.get(profile, 2048)
    for r in rows:
        if max(r["mem_w"], r["mem_h"]) > cap:
            out.append(finding("cooked_texture_over_cap", "warn",
                               "%s resident at %dx%d in the cooked build (profile %s caps at %d)"
                               % (r["name"], r["mem_w"], r["mem_h"], profile, cap),
                               "Maximum Texture Size or the LOD group's MaxLODSize, not a bigger pool",
                               source="textures doc, TextureGroup and Mistakes", asset=r["name"]))
    total_mb = sum(r["mem_kb"] for r in rows) / 1024.0
    if pool_mb:
        if total_mb > float(pool_mb):
            out.append(finding("streaming_pool_over", "fail",
                               "textures in memory %.0f MB > r.Streaming.PoolSize %s MB (blurry textures)" % (total_mb, pool_mb),
                               "cut Max Texture Size / LOD bias on the top users; raising the pool hides the problem",
                               source="textures doc, Mistakes"))
    for r in sorted(rows, key=lambda x: -x["mem_kb"])[:top]:
        out.append(finding("texture_memory_top", "info", "%s %.0f KB (%s, %s)" % (r["name"], r["mem_kb"], r["format"], r["group"]),
                           asset=r["name"]))
    return out


def texture_fix(props, role=None):
    """Property changes that bring a texture to its role default (dict of property -> value
    name strings, e.g. {'compression_settings': 'TC_BC7', 'srgb': False})."""
    role = role or props.get("role") or role_for(props.get("name", ""))
    if role is None:
        return {}
    spec = ROLES[role]
    fix = {}
    comp = _norm_enum(props.get("compression_settings"), "TC_") if props.get("compression_settings") else None
    if comp not in spec["allowed"]:
        fix["compression_settings"] = spec["allowed"][0]
    if props.get("srgb") is None or bool(props.get("srgb")) != spec["srgb"]:
        fix["srgb"] = spec["srgb"]
    if spec["alpha"] is False and props.get("has_alpha") and not props.get("compression_no_alpha"):
        fix["compression_no_alpha"] = True
    if _norm_enum(props.get("mip_gen_settings") or "", "TMGS_") == "TMGS_NO_MIPMAPS" and role != "ui":
        fix["mip_gen_settings"] = "TMGS_FROM_TEXTURE_GROUP"
    if not props.get("lod_group"):
        fix["lod_group"] = spec["group"]
    return fix


def _norm_enum(value, prefix):
    """'TextureCompressionSettings.TC_BC7', '<TC_BC7: 22>', 'tc_bc7', 'BC7' -> 'TC_BC7'."""
    if value is None:
        return None
    s = str(value)
    m = re.search(r"(%s[A-Z0-9_]+)" % re.escape(prefix), s.upper())
    if m:
        return m.group(1)
    s = s.upper().split(".")[-1].strip("<> ")
    s = re.sub(r":.*$", "", s).strip()
    return s if s.startswith(prefix) else prefix + s


# =========================================================================== 3. PBR and Substrate values
def srgb_to_linear(c):
    c = float(c)
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def linear_to_srgb(c):
    c = max(0.0, float(c))
    return c * 12.92 if c <= 0.0031308 else 1.055 * (c ** (1.0 / 2.4)) - 0.055


def ior_to_f0(n, outside=1.0):
    """F0 = ((n - n_out) / (n + n_out))^2: glass 1.5 -> 0.04; legacy Specular's 0 to 0.08 range is
    IOR 1 to 1.788 (Epic, Nathaniel Morgan [SqPaL8HS_Lw 00:09:30]). Underwater: outside=1.33
    (Ben Cloward [sf-K257zWh8 00:15:13])."""
    n, o = float(n), float(outside)
    return ((n - o) / (n + o)) ** 2


def f0_to_ior(f0, outside=1.0):
    r = math.sqrt(max(0.0, min(0.999999, float(f0))))
    return float(outside) * (1.0 + r) / (1.0 - r)


def specular_to_f0(specular):
    """Legacy Specular 0.5 -> F0 0.04 (x 0.08) (Ben Cloward [a94Lpu1_4dg 00:13:28])."""
    return float(specular) * 0.08


def f0_to_specular(f0):
    return float(f0) / 0.08


def _as3(v):
    if isinstance(v, (int, float)):
        return (float(v),) * 3
    v = tuple(float(x) for x in v)
    return v[:3] if len(v) >= 3 else (v[0],) * 3


def metalness_to_substrate(base_color, metallic, specular=0.5):
    """Legacy inputs -> (Diffuse Albedo, F0), the math of the Metalness-To-DiffuseAlbedo-F0 helper:
    albedo = lerp(base, 0, metallic); F0 = lerp(specular * 0.08, base, metallic)
    (Ben Cloward [a94Lpu1_4dg 00:03:25, 00:14:02]). Linear values."""
    b, m = _as3(base_color), float(metallic)
    s = specular_to_f0(specular)
    albedo = tuple(bi * (1.0 - m) for bi in b)
    f0 = tuple(s * (1.0 - m) + bi * m for bi in b)
    return albedo, f0


# Measured values (linear). Metals: PBR doc base colour table; F0 table from the Substrate overview.
METAL_F0 = {
    "iron": (0.560, 0.570, 0.580), "silver": (0.972, 0.960, 0.915), "aluminum": (0.913, 0.921, 0.925),
    "gold": (1.000, 0.766, 0.336), "copper": (0.955, 0.637, 0.538), "chromium": (0.550, 0.556, 0.554),
    "nickel": (0.660, 0.609, 0.526), "titanium": (0.542, 0.497, 0.449), "cobalt": (0.662, 0.655, 0.634),
    "platinum": (0.672, 0.637, 0.585),
}
DIELECTRIC_F0 = {"water": 0.02, "plastic_low": 0.03, "glass_low": 0.03, "plastic_high": 0.05,
                 "glass_high": 0.08, "ruby": 0.08, "diamond": 0.17, "carbon_fiber": 0.18}
# Material classes allowed above the 0.08 dielectric ceiling (Morgan [SqPaL8HS_Lw 00:09:30]).
HIGH_F0_CLASSES = ("gem", "semiconductor", "metalloid", "carbon_fiber")


def check_values(params, kind="legacy", material_class=None, style="realistic", name="?"):
    """Findings on constant or instance parameter values (linear floats / RGB tuples).
    kind: 'legacy' (base_color, metallic, specular, roughness), 'substrate' (diffuse_albedo, f0,
    f90_connected, roughness), 'toon' (metallic, roughness, specular, toon_profile).
    Rules: Ben Cloward PBR [fePsD_8p9vM], Substrate [a94Lpu1_4dg 00:16:16], Morgan [SqPaL8HS_Lw
    00:09:30], Pitchfork toon [iMJJYXHMw4o 00:05:49, 00:06:22]."""
    out = []
    if kind == "legacy":
        m = params.get("metallic")
        if m is not None and 0.05 < float(m) < 0.95:
            out.append(finding("metallic_not_binary", "warn",
                               "%s: metallic %.2f (grey metal reads as plaster)" % (name, float(m)),
                               "0 or 1; in Substrate blend two slabs with Horizontal Blend",
                               source="Ben fePsD_8p9vM 00:20:55; VrY_SSvWdQ4 00:05:39", asset=name))
        s = params.get("specular")
        if s is not None:
            if float(s) > 0.5 and material_class not in HIGH_F0_CLASSES:
                out.append(finding("specular_above_half", "warn",
                                   "%s: specular %.2f > 0.5 (above 4%% reflectance)" % (name, float(s)),
                                   "0.5, or cavity x 0.5; shine is roughness", source="Ben fePsD_8p9vM 00:12:44",
                                   asset=name))
            if float(s) == 0.0 and style == "realistic":
                out.append(finding("specular_zero", "warn", "%s: specular 0 on a realistic material" % name,
                                   "high roughness instead", source="PBR doc, Specular (Resist!)", asset=name))
        bc = params.get("base_color")
        if bc is not None:
            srgb = [linear_to_srgb(c) * 255.0 for c in _as3(bc)]
            mx = max(srgb)
            metal = m is not None and float(m) >= 0.5
            if metal and mx < 180:
                out.append(finding("metal_too_dark", "fail",
                                   "%s: metal base colour max sRGB %.0f < 180" % (name, mx),
                                   "measured metal colour (METAL_F0 table)", source="Ben fePsD_8p9vM 00:22:48",
                                   asset=name))
            if not metal:
                rough = params.get("roughness")
                floor = 50 if (rough is not None and float(rough) >= 0.5) else 20
                if mx < floor:
                    out.append(finding("albedo_too_dark", "warn",
                                       "%s: base colour max sRGB %.0f < %d" % (name, mx, floor),
                                       source="Ben fePsD_8p9vM 00:05:28, 00:06:41", asset=name))
                if mx > 240:
                    out.append(finding("albedo_too_bright", "warn",
                                       "%s: base colour sRGB %.0f > 240" % (name, mx), asset=name))
    elif kind == "substrate":
        da = params.get("diffuse_albedo")
        f0 = params.get("f0")
        if f0 is not None:
            f0v = _as3(f0)
            avg = sum(f0v) / 3.0
            dark_albedo = da is not None and max(_as3(da)) <= 0.02
            is_metal = avg >= 0.3 or params.get("metal") is True
            if is_metal:
                if da is not None and not dark_albedo:
                    out.append(finding("metal_diffuse_not_black", "fail",
                                       "%s: F0 avg %.2f (metal) with diffuse albedo %s" % (name, avg, _as3(da)),
                                       "metals have black diffuse albedo", source="Ben a94Lpu1_4dg 00:16:16",
                                       asset=name))
                if avg < 0.5:
                    out.append(finding("metal_f0_low", "warn",
                                       "%s: metal F0 average %.2f < 0.5 (doc) / 0.6 (Ben)" % (name, avg),
                                       source="Substrate overview, Parameterization; Ben a94Lpu1_4dg 00:11:46",
                                       asset=name))
            else:
                ceiling = 0.18 if material_class in HIGH_F0_CLASSES else 0.08
                if max(f0v) > ceiling + 1e-6:
                    out.append(finding("dielectric_f0_high", "fail",
                                       "%s: dielectric F0 %.3f > %.2f" % (name, max(f0v), ceiling),
                                       "tag the class (gem, semiconductor, carbon_fiber) or lower F0",
                                       source="Ben a94Lpu1_4dg 00:16:16; Morgan SqPaL8HS_Lw 00:09:30", asset=name))
                if max(f0v) - min(f0v) > 0.01 and material_class not in ("thin_film", "iridescent"):
                    out.append(finding("dielectric_colored_f0", "warn",
                                       "%s: coloured F0 on a dielectric" % name,
                                       "grey F0; colour only for thin film (soap, nacre, feathers) or use Thin-Film",
                                       source="Ben VrY_SSvWdQ4 00:02:58", asset=name))
        if params.get("f90_connected"):
            out.append(finding("f90_connected", "info",
                               "%s: F90 is only a hue/saturation shift relative to F0" % name,
                               "leave F90 unconnected; Specular Profile for an exact Fresnel curve",
                               source="Morgan SqPaL8HS_Lw 00:18:40; Ben a94Lpu1_4dg 00:07:33", asset=name))
    elif kind == "toon":
        m = params.get("metallic")
        r = params.get("roughness")
        if m is not None and float(m) > 0.9:
            out.append(finding("toon_metallic_high", "warn",
                               "%s: toon metallic %.2f > 0.9 turns realistic" % (name, float(m)),
                               "0.8 to 0.9 at most", source="Pitchfork iMJJYXHMw4o 00:05:49", asset=name))
        if m is not None and r is not None and float(m) > 0.5 and float(r) < 0.35:
            out.append(finding("toon_reflection_unbanded", "warn",
                               "%s: roughness %.2f on metal: Toon BSDF reflections are not banded" % (name, float(r)),
                               "roughness >= 0.35 to 0.4", source="Pitchfork iMJJYXHMw4o 00:06:22", asset=name))
        if not params.get("toon_profile"):
            out.append(finding("toon_profile_missing", "fail", "%s: no Toon Profile assigned" % name,
                               "create/assign a Toon Profile asset", asset=name))
    else:
        raise ValueError("kind must be legacy, substrate or toon")
    return out


# Parameter name -> (kind, value role) for audit_instance_values. Extend per master; names that are
# not listed are ignored. Roles map onto check_values keys.
PARAM_ROLES = {
    "Metallic": ("legacy", "metallic"), "Specular": ("legacy", "specular"), "BaseColor": ("legacy", "base_color"),
    "Roughness": ("legacy", "roughness"), "BareMetalF0": ("substrate", "metal_f0"), "F0": ("substrate", "f0"),
    "DiffuseAlbedo": ("substrate", "diffuse_albedo"), "PaintF0": ("substrate", "f0"),
}


def audit_instance_values(records, roles=None):
    """Value audit on Material Instance parameters, not only on source textures: dielectric F0 at
    most 0.08 (class exceptions to about 0.18), metal diffuse albedo 0 and F0 average at least 0.5,
    Metallic 0 or 1, Specular not above 0.5 nor 0 on realistic assets (Ben Cloward [a94Lpu1_4dg
    00:16:16], [fePsD_8p9vM 00:12:44, 00:20:55]; Morgan [SqPaL8HS_Lw 00:09:30]).
    records: {mi_path: {'scalars': {name: float}, 'vectors': {name: (r, g, b)}, 'class': optional
    material class such as 'gem'}} (instance_values() builds it in the editor). roles: PARAM_ROLES
    shape. Returns findings with the MI path as asset."""
    roles = roles or PARAM_ROLES
    out = []
    for path, rec in sorted(records.items()):
        vals = dict(rec.get("scalars") or {})
        vals.update(rec.get("vectors") or {})
        by_kind = {"legacy": {}, "substrate": {}}
        metal_f0 = []
        for name, v in vals.items():
            if name not in roles:
                continue
            kind, role = roles[name]
            if role == "metal_f0":
                metal_f0.append((name, v))
            else:
                by_kind[kind][role] = v
        if by_kind["legacy"]:
            out += check_values(by_kind["legacy"], "legacy", rec.get("class"), name=path)
        if by_kind["substrate"]:
            out += check_values(by_kind["substrate"], "substrate", rec.get("class"), name=path)
        for name, v in metal_f0:
            out += check_values({"f0": v, "metal": True, "diffuse_albedo": (0.0, 0.0, 0.0)}, "substrate",
                                name="%s:%s" % (path, name))
    return out


# =========================================================================== 4. PNG, image statistics, packing, mask cost
PNG_SIG = b"\x89PNG\r\n\x1a\n"


def read_png(path):
    """8 or 16-bit, non-interlaced PNG (gray, gray+alpha, RGB, RGBA, palette) ->
    {'width','height','channels','pixels'(bytes, 8-bit, row-major interleaved)}. Pure stdlib,
    slow on big images (use step= in the statistics)."""
    with open(path, "rb") as f:
        data = f.read()
    if data[:8] != PNG_SIG:
        raise ValueError("%s: not a PNG" % path)
    pos, idat, palette, hdr = 8, [], None, None
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos:pos + 4])
        ctype = data[pos + 4:pos + 8]
        chunk = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if ctype == b"IHDR":
            hdr = struct.unpack(">IIBBBBB", chunk)
        elif ctype == b"PLTE":
            palette = chunk
        elif ctype == b"IDAT":
            idat.append(chunk)
        elif ctype == b"IEND":
            break
    if hdr is None:
        raise ValueError("%s: no IHDR" % path)
    w, h, depth, color, _, _, interlace = hdr
    if interlace:
        raise ValueError("%s: interlaced PNG not supported" % path)
    if depth not in (8, 16):
        raise ValueError("%s: bit depth %d not supported" % (path, depth))
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color]
    bpp = channels * depth // 8
    stride = w * bpp
    raw = zlib.decompress(b"".join(idat))
    out = bytearray(h * stride)
    prev = bytearray(stride)
    i = 0
    for y in range(h):
        ft = raw[i]
        i += 1
        line = bytearray(raw[i:i + stride])
        i += stride
        if ft == 1:
            for x in range(bpp, stride):
                line[x] = (line[x] + line[x - bpp]) & 255
        elif ft == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        elif ft == 3:
            for x in range(stride):
                left = line[x - bpp] if x >= bpp else 0
                line[x] = (line[x] + ((left + prev[x]) >> 1)) & 255
        elif ft == 4:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        elif ft != 0:
            raise ValueError("%s: bad filter %d" % (path, ft))
        out[y * stride:(y + 1) * stride] = line
        prev = line
    if depth == 16:
        out = bytearray(out[0::2])  # keep the high byte
    if color == 3:
        if palette is None:
            raise ValueError("%s: palette PNG without PLTE" % path)
        rgb = bytearray()
        for idx in out:
            rgb += palette[idx * 3:idx * 3 + 3]
        out, channels = rgb, 3
    return {"width": w, "height": h, "channels": channels, "pixels": bytes(out)}


def write_png(path, width, height, channels, pixels):
    """8-bit PNG writer (1, 2, 3 or 4 channels), filter 0. Returns path."""
    color = {1: 0, 2: 4, 3: 2, 4: 6}[channels]
    stride = width * channels
    if len(pixels) != stride * height:
        raise ValueError("pixel buffer is %d bytes, expected %d" % (len(pixels), stride * height))
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += pixels[y * stride:(y + 1) * stride]

    def chunk(tag, body):
        return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)

    d = os.path.dirname(os.path.abspath(path))
    if d and not os.path.isdir(d):
        os.makedirs(d)
    with open(path, "wb") as f:
        f.write(PNG_SIG + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, color, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))
    return path


def channel(img, index, step=1):
    """List of 8-bit values of one channel, sampling every `step` pixels in x and y."""
    w, h, c, px = img["width"], img["height"], img["channels"], img["pixels"]
    if index >= c:
        raise ValueError("image has %d channels" % c)
    vals = []
    for y in range(0, h, step):
        row = y * w * c
        for x in range(0, w, step):
            vals.append(px[row + x * c + index])
    return vals


def _percentile(sorted_vals, q):
    if not sorted_vals:
        return None
    k = (len(sorted_vals) - 1) * q / 100.0
    lo, hi = int(math.floor(k)), int(math.ceil(k))
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (k - lo)


def albedo_stats(img, rough=True, metal_mask=None, tolerance=0.005, step=1):
    """sRGB base colour audit: per-pixel value = max(R,G,B) (8-bit). Dielectric floor 20 (smooth) or
    50 (rough), ceiling 240; metal pixels (metal_mask channel list > 127) need >= 180
    (Ben Cloward [fePsD_8p9vM 00:05:28, 00:06:41, 00:22:48]). tolerance = allowed outlier share
    [added: a tool setting, not a source number]."""
    w, h, c, px = img["width"], img["height"], img["channels"], img["pixels"]
    vals, metal_vals, n = [], [], 0
    for y in range(0, h, step):
        for x in range(0, w, step):
            o = (y * w + x) * c
            v = max(px[o:o + min(3, c)])
            is_metal = metal_mask is not None and metal_mask[n] > 127
            (metal_vals if is_metal else vals).append(v)
            n += 1
    floor = 50 if rough else 20
    s = sorted(vals)
    res = {"floor": floor, "count": len(vals), "metal_count": len(metal_vals),
           "p1": _percentile(s, 1), "p50": _percentile(s, 50), "p99": _percentile(s, 99),
           "below_floor": (sum(1 for v in vals if v < floor) / float(len(vals))) if vals else 0.0,
           "above_240": (sum(1 for v in vals if v > 240) / float(len(vals))) if vals else 0.0,
           "metal_below_180": (sum(1 for v in metal_vals if v < 180) / float(len(metal_vals))) if metal_vals else 0.0}
    res["pass"] = (res["below_floor"] <= tolerance and res["above_240"] <= tolerance
                   and res["metal_below_180"] <= tolerance)
    return res


def metallic_binary_share(values, low=25, high=230):
    """Share of mid-grey metallic texels (Ben: metallic is a switch, greys only in transition pixels)."""
    if not values:
        return 0.0
    return sum(1 for v in values if low < v < high) / float(len(values))


def mask_cost(img, channel_index=0, tile=8, step=1, parameter_blended=False, blendable=False):
    """Horizontal Blend cost proxy for a NON-parameter-blended Horizontal Blend on Adaptive: Mix
    exactly 0 or 1 evaluates one slab, anything between evaluates both (Epic, Morgan [SqPaL8HS_Lw
    00:29:38]). With Use Parameter Blending the operator is one slab everywhere [00:37:35], and a
    Blendable project keeps one slab per pixel anyway [00:12:51]: then 'applies' is False and mask
    sharpness is an artistic choice, not a cost lever. Returns the share of texels strictly between
    0 and 255 and the share of tile x tile blocks containing any [added proxy: real tiles are in
    screen space]. Apply the graph's contrast curve to the mask first if it has one."""
    w, h, c, px = img["width"], img["height"], img["channels"], img["pixels"]
    mixed = 0
    total = 0
    tiles = {}
    for y in range(0, h, step):
        for x in range(0, w, step):
            v = px[(y * w + x) * c + channel_index]
            m = 0 < v < 255
            mixed += m
            total += 1
            key = (x // tile, y // tile)
            tiles[key] = tiles.get(key, False) or m
    res = {"nonunitary_texels": mixed / float(total) if total else 0.0,
           "tiles_two_slabs": (sum(1 for v in tiles.values() if v) / float(len(tiles))) if tiles else 0.0,
           "tile": tile, "applies": not (parameter_blended or blendable)}
    if parameter_blended:
        res["reason"] = "parameter-blended Horizontal Blend: one slab everywhere, sharpness is artistic only"
    elif blendable:
        res["reason"] = "Blendable GBuffer: one slab per pixel, sharpness is artistic only"
    else:
        res["reason"] = "Horizontal Blend without parameter blending (Adaptive): both slabs wherever 0 < Mix < 1"
    return res


def image_diff(img_a, img_b, step=1):
    """Mean and max absolute 8-bit difference over the shared channels of two same-size images, and
    the share of texels differing by more than 8 levels [added threshold]. For before/after captures:
    a static switch turned into an If, parameter blending on or off, a texture recompressed."""
    if (img_a["width"], img_a["height"]) != (img_b["width"], img_b["height"]):
        raise ValueError("image sizes differ")
    w, h = img_a["width"], img_a["height"]
    ca, cb = img_a["channels"], img_b["channels"]
    c = min(ca, cb, 3)
    pa, pb = img_a["pixels"], img_b["pixels"]
    total, mx, big, n = 0, 0, 0, 0
    for y in range(0, h, step):
        for x in range(0, w, step):
            oa, ob = (y * w + x) * ca, (y * w + x) * cb
            d = max(abs(pa[oa + k] - pb[ob + k]) for k in range(c))
            total += d
            mx = max(mx, d)
            big += d > 8
            n += 1
    return {"mean_abs": total / float(n) if n else 0.0, "max_abs": mx, "share_over_8": big / float(n) if n else 0.0}


def pack_channels(out_path, sources, size=None):
    """Channel packing before import (one sample instead of several; Ben [-UZlUUQSGgQ 00:12:36],
    Tech Art Aid [y0QASid1v8w 00:56:35]). sources: {'R': (png_path, channel) or int constant,
    'G': ..., 'B': ..., 'A': ... optional}. All images must share one size. Returns out_path."""
    order = ["R", "G", "B"] + (["A"] if "A" in sources else [])
    imgs, w, h = {}, None, None
    for k in order:
        src = sources.get(k, 0)
        if isinstance(src, (tuple, list)):
            img = imgs.get(src[0]) or read_png(src[0])
            imgs[src[0]] = img
            if w is None:
                w, h = img["width"], img["height"]
            elif (img["width"], img["height"]) != (w, h):
                raise ValueError("size mismatch: %s is %dx%d, expected %dx%d" % (src[0], img["width"], img["height"], w, h))
    if w is None:
        if not size:
            raise ValueError("constant-only packing needs size=(w, h)")
        w, h = size
    planes = []
    for k in order:
        src = sources.get(k, 0)
        if isinstance(src, (tuple, list)):
            planes.append(channel(imgs[src[0]], int(src[1])))
        else:
            planes.append([int(src)] * (w * h))
    buf = bytearray(w * h * len(order))
    for ci, plane in enumerate(planes):
        buf[ci::len(order)] = bytes(plane)
    return write_png(out_path, w, h, len(order), bytes(buf))


# Value-clamped ID masks (Sumo, Chris Pollitt [SAr7oPKsgLE 00:14:54, 00:15:27, 00:15:59]): one channel
# split into value bands gives 4 masks per channel (16 from one RGB texture), 8 per channel at most
# (32). Bands cannot overlap and each mask keeps sharp edges. Paint band centres so compression
# error stays inside the band [added margin reasoning]; the mask texture is linear (sRGB off).
def id_band_value(band, bands=4):
    """0..1 channel value that paints ID `band` (0..bands-1): the band centre, (band + 0.5) / bands."""
    band, bands = int(band), int(bands)
    if not 0 <= band < bands:
        raise ValueError("band %d outside 0..%d" % (band, bands - 1))
    return (band + 0.5) / bands


def id_band_mask(value, band, bands=4):
    """Shader math of one value-clamped mask: 1 inside [band/bands, (band+1)/bands), else 0 (the top
    band includes 1.0). In the graph: two If nodes or step() pairs on the channel, no texture."""
    lo, hi = band / float(bands), (band + 1) / float(bands)
    v = float(value)
    return 1.0 if (lo <= v < hi or (band == bands - 1 and v >= 1.0)) else 0.0


def id_band_from_texel(v8, bands=4):
    """Band index an 8-bit texel falls in (to audit a painted ID texture before import)."""
    return min(int(bands) - 1, int(int(v8) / 256.0 * int(bands)))


# =========================================================================== 5. permutations and usage flags
def lauf_permutations(n_usage_flags, n_unique_static_sets, quality_levels=1):
    """Jon Lauf's counting rule (Fortnite, [wobQ8ZKQpbc 00:23:50, 00:24:25]): permutations =
    usage flags x unique static parameter sets. 2 flags x 3 unique MIs = 6; one more flag on the
    parent adds 3, one more unique MI adds 2 (one per flag). A Quality Switch in the graph multiplies
    shader maps by the quality levels compiled (Nadro's grid: materials x quality levels x vertex
    factories x shader types [wobQ8ZKQpbc 00:05:32]): pass quality_levels for it."""
    return int(n_usage_flags) * int(n_unique_static_sets) * max(1, int(quality_levels))


def permutation_key(rec):
    """Key of one Material Instance record (see census()): effective static switch values,
    static component masks, base property overrides and usage flag overrides (5.8)."""
    def frozen(d):
        return tuple(sorted((str(k), json.dumps(v, sort_keys=True)) for k, v in (d or {}).items()))
    return (frozen(rec.get("static_switches")), frozen(rec.get("component_masks")),
            frozen(rec.get("base_overrides")), frozen(rec.get("usage_overrides")))


def census(records, root_defaults=None, shaders_per_key=None, budget_keys=None):
    """Permutation census per root material.
    records: list of {'path', 'root', 'static_switches' (effective values), 'static_overrides'
    (names overridden on this MI or its chain), 'component_masks', 'base_overrides',
    'usage_overrides', 'hspr' (Has Static Permutation Resource tag, 5.7)}.
    root_defaults: {root: {switch: default}}; shaders_per_key: {root: int} from list_shaders on a
    representative MI (an upper bound, Nadro [wobQ8ZKQpbc 00:18:57]); budget_keys: {root: int}.
    MIs whose effective values equal the root's defaults and carry no override share the root's
    shader map, so they add no key. Returns {root: {...}} plus findings under '_findings'."""
    root_defaults = root_defaults or {}
    shaders_per_key = shaders_per_key or {}
    budget_keys = budget_keys or {}
    roots = {}
    findings = []
    for rec in records:
        root = rec.get("root") or "?"
        r = roots.setdefault(root, {"mi_count": 0, "keys": {}, "hspr": 0, "redundant_overrides": [],
                                    "forking_mis": 0})
        r["mi_count"] += 1
        if rec.get("hspr"):
            r["hspr"] += 1
        defaults = root_defaults.get(root, {})
        for name in rec.get("static_overrides") or []:
            if name in defaults and (rec.get("static_switches") or {}).get(name) == defaults[name]:
                r["redundant_overrides"].append((rec.get("path"), name))
        default_key = permutation_key({"static_switches": {k: defaults[k] for k in (rec.get("static_switches") or {}) if k in defaults}})
        key = permutation_key(rec)
        forks = bool(rec.get("static_overrides") or rec.get("component_masks") or rec.get("base_overrides")
                     or rec.get("usage_overrides")) and key != default_key
        if forks:
            r["forking_mis"] += 1
            r["keys"].setdefault(key, []).append(rec.get("path"))
    for root, r in roots.items():
        r["unique_keys"] = len(r["keys"])
        spk = shaders_per_key.get(root)
        r["shaders_estimate"] = None if spk is None else int(spk) * (r["unique_keys"] + 1)
        r["keys"] = [{"key": _key_text(k), "mis": v} for k, v in sorted(r["keys"].items(), key=lambda kv: -len(kv[1]))]
        for path, name in r["redundant_overrides"]:
            findings.append(finding("static_override_at_default", "warn",
                                    "%s overrides %s at the parent default (a fork for nothing)" % (path, name),
                                    "untick the override", source="instances doc; mat-upd HSPR", asset=path))
        cap = budget_keys.get(root)
        if cap is not None and r["unique_keys"] > cap:
            findings.append(finding("permutation_budget", "fail",
                                    "%s: %d unique static sets, budget %d" % (root, r["unique_keys"], cap),
                                    "reuse an approved preset; move cheap choices to If/Enum/CPD",
                                    source="Lauf wobQ8ZKQpbc 00:17:30", asset=root))
        if r["hspr"] > r["forking_mis"]:
            findings.append(finding("hspr_without_fork", "info",
                                    "%s: %d MIs tagged Has Static Permutation Resource, %d fork by value"
                                    % (root, r["hspr"], r["forking_mis"]),
                                    "an editable switch left at default still counts as a permutation risk",
                                    source="mat-upd 5.7 HSPR", asset=root))
    roots["_findings"] = findings
    return roots


def _key_text(key):
    parts = []
    for label, items in zip(("switch", "mask", "base", "usage"), key):
        for k, v in items:
            parts.append("%s:%s=%s" % (label, k, v))
    return ", ".join(parts) or "(root default)"


def switch_ranking(records, root=None):
    """Fortnite's data-driven reset [wobQ8ZKQpbc 00:29:31]: count, per static switch, the MIs that
    set it True. Returns [(switch, count, share)] sorted, to keep the top N in a curated parent."""
    counts, n = {}, 0
    for rec in records:
        if root and rec.get("root") != root:
            continue
        n += 1
        for k, v in (rec.get("static_switches") or {}).items():
            if v is True:
                counts[k] = counts.get(k, 0) + 1
    return sorted(((k, c, c / float(n) if n else 0.0) for k, c in counts.items()), key=lambda t: (-t[1], t[0]))


# Fortnite's referencer rules (Lauf [wobQ8ZKQpbc 00:34:25]; slide code 00:36:35).
def usage_needs(referencers):
    """referencers: [{'class': 'StaticMesh', 'nanite': bool}, {'class': 'SkeletalMesh',
    'clothing_assets': int}, {'class': 'NiagaraSystem', 'depth': 1|2}, {'class':
    'GeometryCollection'}, ...]. Returns (needed flag set, notes)."""
    need, notes = set(), []
    for r in referencers:
        c = r.get("class", "")
        if c == "SkeletalMesh":
            need.add("used_with_skeletal_mesh")
            if int(r.get("clothing_assets") or 0) > 0:
                need.add("used_with_clothing")
        elif c == "StaticMesh":
            if r.get("nanite"):
                need.add("used_with_nanite")
        elif c == "NiagaraSystem":
            if int(r.get("depth") or 1) >= 2:
                need.add("used_with_niagara_mesh_particles")
            else:
                notes.append("NiagaraSystem references the material directly: sprite or ribbon flag, check the renderer")
        elif c == "GeometryCollection":
            need.add("used_with_geometry_collections")
        elif c in ("InstancedStaticMeshComponent", "HierarchicalInstancedStaticMeshComponent"):
            notes.append("ISM/HISM need no flag on GPU Scene platforms in 5.8 (Nadro wobQ8ZKQpbc 00:12:06)")
        elif c in ("SplineMeshComponent", "LandscapeProxy"):
            notes.append("%s lives in levels: check actors, the asset registry does not show it" % c)
    return need, notes


def plan_usage_changes(parent, parent_flags, mi_needs, parent_needs=()):
    """Fortnite's regression-free order [wobQ8ZKQpbc 00:36:35, 00:37:09]: pass 1 pins the flags each
    MI needs as MI overrides (release branch: they only pin states already true); pass 2 clears the
    parent flags no longer needed by the parent itself (main branch, QA runway).
    Returns {'pass1': {mi: [flags]}, 'pass2': {parent: [flags to clear]}, 'missing': {mi: [flags the
    MI needs that nothing provides today: a fallback-material bug already]}}."""
    parent_flags = set(parent_flags)
    pass1, missing = {}, {}
    for mi, needs in sorted(mi_needs.items()):
        needs = set(needs)
        pin = sorted(needs & parent_flags)
        lack = sorted(needs - parent_flags)
        if pin:
            pass1[mi] = pin
        if lack:
            missing[mi] = lack
    clear = sorted(parent_flags - set(parent_needs))
    return {"pass1": pass1, "pass2": {parent: clear}, "missing": missing}


# =========================================================================== 6. graph lint
# Exported graph schema (export_graph() in the editor writes it; tests build it by hand):
# {'path', 'domain', 'blend_mode', 'shading': 'substrate'|'legacy', 'usage': {flag: bool},
#  'automatically_set_usage_in_editor': bool, 'translucency_lighting_mode', 'refraction_method',
#  'nodes': {id: {'class': 'MaterialExpressionX', 'props': {...}, 'inputs': {pin: id | [id, out]}}},
#  'outputs': {'MP_BASE_COLOR': id | [id, out], ...}}
TEXTURE_CLASSES = {
    "MaterialExpressionTextureSample", "MaterialExpressionTextureSampleParameter2D",
    "MaterialExpressionTextureSampleParameterCube", "MaterialExpressionTextureSampleParameter2DArray",
    "MaterialExpressionTextureSampleParameterSubUV", "MaterialExpressionTextureSampleParameterVolume",
    "MaterialExpressionRuntimeVirtualTextureSample", "MaterialExpressionRuntimeVirtualTextureSampleParameter",
    "MaterialExpressionSceneTexture", "MaterialExpressionCurveAtlasRowParameter",
    "MaterialExpressionTextureObject", "MaterialExpressionTextureObjectParameter",
    "MaterialExpressionSparseVolumeTextureSample",
}
TRANSCENDENTAL_CLASSES = {
    "MaterialExpressionSine", "MaterialExpressionCosine", "MaterialExpressionTangent",
    "MaterialExpressionArcsine", "MaterialExpressionArccosine", "MaterialExpressionArctangent",
    "MaterialExpressionArctangent2", "MaterialExpressionPower", "MaterialExpressionLogarithm2",
    "MaterialExpressionLogarithm10", "MaterialExpressionLogarithm", "MaterialExpressionExponential",
    "MaterialExpressionExponential2", "MaterialExpressionDivide", "MaterialExpressionSquareRoot",
}
NOISE_CLASSES = {"MaterialExpressionNoise", "MaterialExpressionVectorNoise"}
RVT_WRITE_HAZARDS = {
    "MaterialExpressionTime": "Time is 0 in the RVT write pass (frozen)",
    "MaterialExpressionPanner": "Panner uses Time, frozen at 0 in the RVT",
    "MaterialExpressionCameraPositionWS": "camera position is the orthographic capture's",
    "MaterialExpressionCameraVectorWS": "camera vector is the capture's",
    "MaterialExpressionPixelDepth": "distance measured from the capture",
    "MaterialExpressionSceneDepth": "distance measured from the capture",
    "MaterialExpressionBumpOffset": "parallax has no perspective in the capture",
    "MaterialExpressionCollectionParameter": "MPC changes do not refresh RVT pages",
}
SUBSTRATE_KIND = {
    "MaterialExpressionSubstrateSlabBSDF": "slab",
    "MaterialExpressionSubstrateSimpleClearCoatBSDF": "slab",
    "MaterialExpressionSubstrateHorizontalMixing": "hblend",
    "MaterialExpressionSubstrateVerticalLayering": "vcoat",
    "MaterialExpressionSubstrateAdd": "add",
    "MaterialExpressionSubstrateWeight": "coverage",
    "MaterialExpressionSubstrateSelect": "select",
}
SLAB_FEATURE_PINS = {  # drop order when simplified (Morgan slide [SqPaL8HS_Lw 00:22:01])
    "glint": ("Glint Density", "GlintValue", "Glint UVs", "GlintUV"),
    "anisotropy": ("Anisotropy",),
    "second_roughness": ("Second Roughness", "SecondRoughness", "Second Roughness Weight", "SecondRoughnessWeight"),
    "fuzz": ("Fuzz Amount", "FuzzAmount", "Fuzz Roughness", "FuzzRoughness", "Fuzz Color", "FuzzColor"),
    "f90": ("F90",),
    "sss": ("SSS MFP", "SSSMFP", "SSS MFP Scale", "SSSMFPScale"),
}
LINT_PROFILES = {
    # closures: worst-case closure budget; blendable: project format; samplers: hard limit.
    "console60": {"closures": 1, "blendable": True, "samplers": 16, "texture_samples": 12, "rvts": 2},
    "pc_high": {"closures": 2, "blendable": False, "samplers": 16, "texture_samples": 16, "rvts": 2},
    "cinematic": {"closures": 4, "blendable": False, "samplers": 16, "texture_samples": 24, "rvts": 2},
    "mobile": {"closures": 1, "blendable": True, "samplers": 16, "texture_samples": 8, "rvts": 1},
}


def _src(v):
    if v is None:
        return None, ""
    if isinstance(v, (list, tuple)):
        return v[0], (v[1] if len(v) > 1 else "")
    return v, ""


def upstream(graph, start, stop_at=None, follow_pins=None):
    """Node ids reachable from `start` through inputs (start included). stop_at: set of classes
    whose own inputs are not followed. follow_pins: {class: [pin names]} to restrict which inputs
    a class passes on (used for RVT Replace)."""
    nodes = graph["nodes"]
    seen, stack = set(), [start]
    while stack:
        nid = stack.pop()
        if nid is None or nid in seen or nid not in nodes:
            continue
        seen.add(nid)
        n = nodes[nid]
        if stop_at and n.get("class") in stop_at and nid != start:
            continue
        pins = n.get("inputs", {})
        allowed = (follow_pins or {}).get(n.get("class"))
        for pin, v in pins.items():
            if allowed is not None and pin not in allowed:
                continue
            stack.append(_src(v)[0])
    return seen


def _input(node, *names):
    ins = node.get("inputs", {})
    for n in names:
        if n in ins and ins[n] is not None:
            return _src(ins[n])[0]
    return None


def _cls(graph, nid):
    return graph["nodes"].get(nid, {}).get("class", "")


def pixel_nodes(graph):
    """Nodes that feed any pixel-side output (everything but WPO)."""
    ids = set()
    for prop, v in graph.get("outputs", {}).items():
        if prop in ("MP_WORLD_POSITION_OFFSET",):
            continue
        ids |= upstream(graph, _src(v)[0])
    return ids


def classify_switch(graph, switch_id, used_share=None, heavy_transcendentals=4):
    """Lauf's rule [wobQ8ZKQpbc 00:40:24]: keep a static switch only if its exclusive branch
    contains texture samples, or heavy math that most instances skip; otherwise convert to If,
    Enum or Channel Mask. heavy_transcendentals is a tool threshold [added]."""
    n = graph["nodes"][switch_id]
    t = _input(n, "True", "A")
    f = _input(n, "False", "B")
    up_t = upstream(graph, t) if t else set()
    up_f = upstream(graph, f) if f else set()
    exclusive = (up_t | up_f) - (up_t & up_f)
    classes = [_cls(graph, i) for i in exclusive]
    fn_textures = any(graph["nodes"][i].get("props", {}).get("contains_texture_samples") for i in exclusive)
    if any(c in TEXTURE_CLASSES for c in classes) or fn_textures:
        return "keep", "gates texture samples"
    heavy = sum(1 for c in classes if c in TRANSCENDENTAL_CLASSES)
    if heavy >= heavy_transcendentals and (used_share is None or used_share < 0.5):
        return "keep", "gates heavy math (%d transcendental/division nodes) most instances skip" % heavy
    return "convert", "cheap branch (%d nodes, no textures): If (param into A, 0.5 into B, A>B pin) or an Enum-bound scalar" % len(exclusive)


_ARITH_CALLS = {"saturate", "lerp", "min", "max", "abs", "dot", "clamp", "frac", "floor", "ceil", "round",
                "float", "float2", "float3", "float4", "half", "half2", "half3", "half4", "step", "sign",
                "smoothstep", "length", "normalize", "sqrt", "rsqrt", "pow", "exp", "exp2", "log", "log2",
                "sin", "cos", "tan", "cross", "mad", "fmod", "rcp", "trunc", "any", "all", "select"}


def custom_is_plain_arithmetic(code):
    """True when a Custom node only does arithmetic that built-in nodes express (and fold).
    Custom blocks constant folding: 31 vs 29 instructions (Tech Art Aid [y0QASid1v8w 00:14:34])."""
    s = re.sub(r"//[^\n]*|/\*.*?\*/", " ", code or "", flags=re.S)
    if re.search(r"\b(for|while|do|switch|if|Texture2DSample|SampleLevel|SampleGrad|Load|View\.|Primitive\.|"
                 r"GetPrimitiveData|MaterialFloat|SceneTexture|Parameters\.)", s):
        return False
    if re.search(r"\.Sample\s*\(", s):
        return False
    for call in re.findall(r"([A-Za-z_][A-Za-z0-9_]*)\s*\(", s):
        if call not in _ARITH_CALLS:
            return False
    return True


def substrate_closures(graph, nid, forced_pb=False, log=None, depth=0):
    """Worst-case closures per pixel for the topology rooted at nid, by Epic's rules: slab 1;
    Horizontal Blend, Vertical Coat and Add sum their inputs unless parameter blended (then 1);
    Select evaluates one slab; parameter blending propagates to every operator beneath
    (Morgan [SqPaL8HS_Lw 00:29:38, 00:33:51, 00:36:04, 00:38:43]). Stops at slabs."""
    if nid is None or nid not in graph["nodes"]:
        return 0
    n = graph["nodes"][nid]
    kind = SUBSTRATE_KIND.get(n.get("class"), "other")
    props = n.get("props", {})
    pb = forced_pb or bool(props.get("use_parameter_blending")) or kind == "select"
    if log is not None:
        log.append({"depth": depth, "kind": kind, "node": nid, "pb": pb})
    if kind == "slab":
        return 1
    kids = [_src(v)[0] for pin, v in n.get("inputs", {}).items()
            if pin not in ("Mix", "Weight", "Thickness", "Top Thickness", "SelectValue", "Select Value")]
    subs = [substrate_closures(graph, k, pb if kind != "other" else forced_pb, log, depth + 1) for k in kids]
    total = sum(subs)
    if kind in ("hblend", "vcoat", "add"):
        return min(total, 1) if (pb and kind != "add") else total
    if kind == "select":
        return min(total, 1)
    return total


WORLD_ALIGNED_SAMPLES = 3  # one sample per projection axis per texture (pXOknekvmwE, agent translation [added])


def _is_sample(graph, nid):
    c = _cls(graph, nid)
    return c in TEXTURE_CLASSES and c not in ("MaterialExpressionTextureObject", "MaterialExpressionTextureObjectParameter")


def _function_samples(node):
    """Samples a material function call adds: an explicit 'function_samples' (someone opened it and
    summed it), else 3 per World Aligned Texture/Normal call, else its distinct textures (a floor)."""
    p = node.get("props", {})
    if p.get("function_samples") is not None:
        return int(p["function_samples"])
    fpath = str(p.get("function_path") or p.get("material_function") or "")
    if "WorldAligned" in fpath:
        return WORLD_ALIGNED_SAMPLES
    return int(p.get("function_textures") or (1 if p.get("contains_texture_samples") else 0))


def cost_census(graph):
    """What the instruction count hides, per pixel path (Tech Art Aid [y0QASid1v8w 00:20:57,
    00:39:34, 00:46:03]; Lauf/Nadro for functions [y0QASid1v8w 00:21:22, 00:22:31]):
    - samples: texture reads in nodes, plus what material functions add (_function_samples);
    - transcendentals split into 'independent' (no texture read upstream: they run inside the fetch
      latency, so scanlines, flicker or UV math next to a sample are nearly free) and 'dependent'
      (they consume a sampled value: paid in full after the wait);
    - dependent_reads: samples whose UVs come from noise or another sample (cache incoherent);
    - functions_unexpanded: calls nobody opened and summed ('cheap' in a name is not a measurement)."""
    nodes = graph.get("nodes", {})
    pix = pixel_nodes(graph)
    fcalls = [nid for nid in pix if _cls(graph, nid) == "MaterialExpressionMaterialFunctionCall"]
    direct = [nid for nid in pix if _is_sample(graph, nid)]
    fn_samples = sum(_function_samples(nodes[nid]) for nid in fcalls)
    samplers_up = set(direct) | set(nid for nid in fcalls if _function_samples(nodes[nid]) > 0)
    indep, dep = [], []
    for nid in pix:
        if _cls(graph, nid) in TRANSCENDENTAL_CLASSES:
            up = upstream(graph, nid) - {nid}
            (dep if up & samplers_up else indep).append(nid)
    dreads = []
    for nid in direct:
        uv = _input(nodes[nid], "UVs", "Coordinates", "UV")
        if uv:
            up = upstream(graph, uv)
            if any(_cls(graph, i) in NOISE_CLASSES or (i != nid and _is_sample(graph, i)) for i in up):
                dreads.append(nid)
    def _known(nid):
        p = nodes[nid].get("props", {})
        return (p.get("function_expanded") or p.get("function_samples") is not None
                or "WorldAligned" in str(p.get("function_path") or p.get("material_function") or ""))
    unexpanded = [nid for nid in fcalls if not _known(nid)]
    return {"samples": len(direct) + fn_samples, "direct_samples": len(direct), "function_samples": fn_samples,
            "transcendentals": len(indep) + len(dep), "independent_transcendentals": len(indep),
            "dependent_transcendentals": len(dep), "dependent_reads": len(dreads),
            "functions_unexpanded": [str(nodes[n].get("props", {}).get("function_path") or
                                         nodes[n].get("props", {}).get("material_function") or n) for n in unexpanded]}


def lint_graph(graph, profile="console60", target_layers=None, expected_usage=None, shape=None,
               heavy_transcendentals=4, textures=None, budgets=None, cvars=None):
    """Material graph lint. Returns findings. profile: key of LINT_PROFILES. target_layers: landscape
    target layer names; expected_usage: set of usage flags this parent may carry; shape: 'flat' or
    'enclosed' for translucent refraction choice. textures: {texture path: props} (compression_settings,
    srgb) to cross-check each sample's Sampler Type; budgets: project numbers {'texture_samples',
    'transcendentals', 'dependent_transcendentals'} (the sources give none, the project decides);
    cvars: {name: value} read by probe() (checks the Temporal Responsiveness cvar)."""
    P = LINT_PROFILES[profile]
    nodes = graph.get("nodes", {})
    path = graph.get("path", "?")
    out = []

    def add(rule, sev, msg, fix="", node=None, source=""):
        out.append(finding(rule, sev, msg, fix, node, source, asset=path))

    classes = {nid: n.get("class", "") for nid, n in nodes.items()}
    pix = pixel_nodes(graph)

    # --- permutation sources
    for nid, c in classes.items():
        if c == "MaterialExpressionStaticComponentMaskParameter":
            add("static_component_mask", "fail", "Static Component Mask Parameter: a permutation per choice",
                "Channel Mask Parameter, or dot(RGB, float3 param) then saturate", nid,
                "Lauf wobQ8ZKQpbc 00:42:35")
        if c in ("MaterialExpressionStaticSwitchParameter", "MaterialExpressionStaticSwitch"):
            verdict, why = classify_switch(graph, nid, heavy_transcendentals=heavy_transcendentals)
            if verdict == "convert":
                add("static_switch_cheap", "warn", "static switch %s: %s" % (
                    nodes[nid].get("props", {}).get("parameter_name", nid), why),
                    "If / Enum / Channel Mask, keep switches for texture gates", nid, "Lauf wobQ8ZKQpbc 00:40:24")
            t = _input(nodes[nid], "True", "A")
            f = _input(nodes[nid], "False", "B")
            kinds = set()
            for side in (t, f):
                if side:
                    kinds.add("ma" if "MaterialAttributes" in classes.get(side, "") else "value")
            if len(kinds) == 2:
                add("static_switch_mixed_types", "fail",
                    "static switch mixes Material Attributes and scalar/vector inputs (5.8 validation error)",
                    "same type on both inputs", nid, "mat-upd 5.8 engine changes")
        if c == "MaterialExpressionIf":
            if _input(nodes[nid], "A == B", "A==B", "AEqualsB", "A=B"):
                add("if_equal_pin", "warn", "If node uses the A == B pin (extra threshold cost)",
                    "param into A, 0.5 into B, use A > B / A < B (A > B is >=)", nid, "Lauf wobQ8ZKQpbc 00:40:56")
        if c == "MaterialExpressionCustom":
            if custom_is_plain_arithmetic(nodes[nid].get("props", {}).get("code", "")):
                add("custom_plain_arithmetic", "warn", "Custom node doing plain arithmetic blocks constant folding",
                    "built-in nodes", nid, "Tech Art Aid y0QASid1v8w 00:14:34")

    # --- runtime cost: samples, samplers, transcendentals, dependent reads
    tex_nodes = [nid for nid in pix if classes.get(nid) in TEXTURE_CLASSES
                 and classes.get(nid) not in ("MaterialExpressionTextureObject", "MaterialExpressionTextureObjectParameter")]
    cc = cost_census(graph)
    n_samples = cc["samples"]
    budgets = budgets or {}
    own_samplers = [nid for nid in tex_nodes if "WRAP_WORLD_GROUP" not in str(nodes[nid].get("props", {}).get("sampler_source", "")).upper()
                    and "CLAMP_WORLD_GROUP" not in str(nodes[nid].get("props", {}).get("sampler_source", "")).upper()
                    and classes.get(nid) != "MaterialExpressionSceneTexture"]
    if len(own_samplers) > P["samplers"]:
        add("sampler_limit", "fail", "%d samplers without a shared source (limit %d)" % (len(own_samplers), P["samplers"]),
            "Sampler Source = Shared: Wrap", source="landscape doc; Sumo SAr7oPKsgLE 00:41:43")
    if n_samples > P["texture_samples"]:
        add("texture_sample_budget", "warn", "%d texture samples in the pixel path (profile budget %d)"
            % (n_samples, P["texture_samples"]), "pack channels that share UVs; gradient-map grayscale",
            source="Tech Art Aid y0QASid1v8w 00:35:57, 00:56:35 (budget is a project setting [added])")
    if cc["transcendentals"]:
        add("transcendentals", "info", "%d transcendental/division nodes in the pixel path: %d independent of any texture "
            "read (hidden in fetch latency), %d consume a sampled value (paid in full); the instruction count shows neither"
            % (cc["transcendentals"], cc["independent_transcendentals"], cc["dependent_transcendentals"]),
            "keep screen and UV math independent of the sample; move the rest to vertex/Customized UVs; measure BasePass ms",
            source="Tech Art Aid y0QASid1v8w 00:20:57, 00:39:34, 00:46:03")
    for key, label in (("texture_samples", "samples"), ("transcendentals", "transcendentals"),
                       ("dependent_transcendentals", "dependent_transcendentals")):
        cap = budgets.get(key)
        if cap is not None and cc[label] > int(cap):
            add("cost_budget_" + key, "warn", "%d %s in the pixel path, project budget %d" % (cc[label], label.replace("_", " "), int(cap)),
                "pack samples, move math off the sampled value or to the vertex stage; confirm with ms on a fixed camera",
                source="Tech Art Aid y0QASid1v8w 00:20:57 (budget numbers are a project decision)")
    if cc["functions_unexpanded"]:
        add("function_not_expanded", "info", "%d material function(s) not opened: %s" % (
            len(cc["functions_unexpanded"]), ", ".join(sorted(set(cc["functions_unexpanded"])))[:300]),
            "open each and sum its samples and transcendentals ('cheap' in a name is not a measurement); record function_samples",
            source="Tech Art Aid y0QASid1v8w 00:21:22, 00:22:31")
    if textures:
        for nid in tex_nodes:
            props = nodes[nid].get("props", {})
            tex, st = props.get("texture"), props.get("sampler_type")
            tp = textures.get(tex) if tex else None
            if tp and st and tp.get("compression_settings"):
                srgb = tp.get("srgb")
                exp = expected_sampler(tp["compression_settings"], bool(srgb) if srgb is not None else True)
                if _norm_enum(st, "SAMPLERTYPE_") != exp:
                    add("sampler_type_mismatch", "fail", "%s samples %s as %s; its compression %s needs %s" % (
                        nid, tex, _norm_enum(st, "SAMPLERTYPE_"), _norm_enum(tp["compression_settings"], "TC_"), exp),
                        "set the sample's Sampler Type, or Clean Graph > Fixup Mismatched Samplers (5.7)", nid,
                        "Ben Cloward h95X255NhOo 00:16:54, 00:17:26; mat-upd 5.7")
    uv_by_texture = {}
    for nid in tex_nodes:
        n = nodes[nid]
        uv = _input(n, "UVs", "Coordinates", "UV")
        if uv:
            up = upstream(graph, uv)
            bad = [i for i in up if classes.get(i) in NOISE_CLASSES or (classes.get(i) in TEXTURE_CLASSES and i != nid)]
            if bad:
                add("dependent_read", "warn", "texture %s reads UVs from noise or another sample" % nid,
                    "keep UVs coherent; distort after sampling or accept the cost knowingly", nid,
                    "Tech Art Aid y0QASid1v8w 00:50:02")
        tex = n.get("props", {}).get("texture")
        if tex:
            uv_by_texture.setdefault(tex, set()).add(uv)
    for tex, uvs in uv_by_texture.items():
        if len(uvs) > 1:
            add("same_texture_many_uvs", "info", "%s sampled with %d different UVs: each is a full sample" % (tex, len(uvs)),
                source="Tech Art Aid y0QASid1v8w 00:55:37")
    gray_by_uv = {}
    for nid in tex_nodes:
        st = str(nodes[nid].get("props", {}).get("sampler_type", "")).upper()
        if "GRAYSCALE" in st:
            gray_by_uv.setdefault(_input(nodes[nid], "UVs", "Coordinates", "UV"), []).append(nid)
    for uv, ids in gray_by_uv.items():
        if len(ids) > 1:
            add("pack_grayscale", "warn", "%d grayscale samples share UVs %s" % (len(ids), uv),
                "pack them into one RGB(A) texture, sampler Masks", source="Tech Art Aid y0QASid1v8w 00:56:35")

    # --- RVT
    rvt_assets = set()
    for nid, c in classes.items():
        if c in ("MaterialExpressionRuntimeVirtualTextureSample", "MaterialExpressionRuntimeVirtualTextureSampleParameter"):
            vt = nodes[nid].get("props", {}).get("virtual_texture")
            if not vt:
                add("rvt_sample_unassigned", "fail", "RVT Sample without Virtual Texture set", "assign the RVT asset", nid,
                    "PrismaticaDev RLEPA16QDRw 00:35:58; Ben ucuSaiDuqiM 00:28:28")
            else:
                rvt_assets.add(vt)
        if c == "MaterialExpressionRuntimeVirtualTextureOutput":
            follow = {"MaterialExpressionRuntimeVirtualTextureReplace": ["Virtual Texture Output", "VirtualTextureOutput"]}
            ups = set()
            for pin, v in nodes[nid].get("inputs", {}).items():
                ups |= upstream(graph, _src(v)[0], follow_pins=follow)
            for i in ups:
                why = RVT_WRITE_HAZARDS.get(classes.get(i))
                if why:
                    add("rvt_write_hazard", "fail", "%s upstream of the RVT output: %s" % (classes[i], why),
                        "move it to the read pass, or keep it out with Runtime Virtual Texture Replace", i,
                        "PrismaticaDev RLEPA16QDRw 00:20:14, 00:16:44")
    if len(rvt_assets) > P["rvts"]:
        add("rvt_count", "warn", "%d distinct RVTs sampled: each carries a large fixed unpack cost" % len(rvt_assets),
            "pack masks into spare channels of one RVT per domain", source="PrismaticaDev RLEPA16QDRw 01:04:29")

    # --- Substrate topology
    front = graph.get("outputs", {}).get("MP_FRONT_MATERIAL")
    if front is not None:
        log = []
        est = substrate_closures(graph, _src(front)[0], log=log)
        slabs = [e for e in log if e["kind"] == "slab"]
        ops = [e for e in log if e["kind"] in ("hblend", "vcoat", "add", "select", "coverage")]
        if est > P["closures"]:
            add("substrate_closures", "warn" if not P["blendable"] else "info",
                "worst-case %d closures per pixel (profile %s budget %d)%s" % (
                    est, profile, P["closures"], "; Blendable simplifies to one slab anyway" if P["blendable"] else ""),
                "Use Parameter Blending on the rightmost operator, or one slab", source="Morgan SqPaL8HS_Lw 00:25:45, 00:36:04")
        if len(slabs) > 1 and not any(e["pb"] for e in ops) and profile in ("console60", "mobile"):
            add("substrate_no_parameter_blending", "warn", "%d slabs and no parameter blending in a %s project" % (len(slabs), profile),
                "enable Use Parameter Blending (plan it from the start, it propagates)", source="Morgan SqPaL8HS_Lw 00:38:43")
        for e in log:
            n = nodes[e["node"]]
            if e["kind"] == "add":
                add("substrate_add", "warn", "Substrate Add breaks energy conservation",
                    "valid only when one input is purely emissive; else Horizontal Blend or Vertical Coat",
                    e["node"], "Morgan SqPaL8HS_Lw 00:30:18")
            if e["kind"] == "vcoat":
                if e["pb"]:
                    add("vcoat_parameter_blended", "warn", "parameter blending on a Vertical Coat replaces transmission and depth with a heuristic",
                        "keep coats fully evaluated unless the platform forces it; A/B screenshot", e["node"], "Morgan SqPaL8HS_Lw 00:38:08")
                top = _input(n, "Top")
                if top and SUBSTRATE_KIND.get(_cls(graph, top)) == "slab":
                    tn = nodes[top]
                    if not _input(tn, "SSS MFP", "SSSMFP"):
                        add("vcoat_top_opaque", "fail", "Vertical Coat top slab has no SSS MFP: the bottom slab is never evaluated",
                            "non-zero MFP on the top (Transmittance-To-MFP)", e["node"], "Morgan SqPaL8HS_Lw 00:27:15")
            if e["kind"] == "hblend":
                mix = _input(n, "Mix")
                if mix and _cls(graph, mix) == "MaterialExpressionConstant":
                    add("hblend_constant_mix", "warn", "Horizontal Blend with a constant Mix: a dead branch or both slabs everywhere",
                        "remove the operator or drive Mix with a mask", e["node"], "Morgan SqPaL8HS_Lw 00:29:38")
            if e["kind"] == "slab":
                feats = [k for k, pins in SLAB_FEATURE_PINS.items() if _input(n, *pins)]
                if P["blendable"]:
                    for k in ("second_roughness", "glint"):
                        if k in feats:
                            add("blendable_unsupported_feature", "warn", "%s connected on a Blendable project: not rendered" % k,
                                "Adaptive only (high-end PC, stills) or remove", e["node"], "Ben Z281PRQInRA 00:06:07; Substrate overview")
                    if "fuzz" in feats and "sss" in feats:
                        add("blendable_fuzz_sss", "info", "fuzz and SSS on one slab: Blendable keeps only fuzz",
                            node=e["node"], source="Substrate overview, Material Simplification")
                if "f90" in feats:
                    add("f90_connected", "info", "F90 connected: only a hue/saturation shift relative to F0", node=e["node"],
                        source="Morgan SqPaL8HS_Lw 00:18:40")
                if "anisotropy" in feats:
                    add("slab_anisotropy", "info", "anisotropy moves the material to the Complex set", node=e["node"],
                        source="Substrate overview, Material Simplification")
    for nid, c in classes.items():
        if c.startswith("MaterialExpressionSubstrateToon"):
            if not nodes[nid].get("props", {}).get("toon_profile"):
                add("toon_profile_missing", "fail", "Toon BSDF without a Toon Profile", "assign a Toon Profile asset", nid)
        if c == "MaterialExpressionSubstrateShadingModels" and not graph.get("converted"):
            add("substrate_shading_models_node", "warn",
                "Substrate Shading Models node in a new material: it is the legacy auto-conversion target",
                "build from a Slab (Metalness-To-DiffuseAlbedo-F0 helper into the Slab for metalness maps)", nid,
                "Substrate overview, Additional Notes; Ben P5I38f2O6W8 00:10:47")

    # --- Temporal Responsiveness (5.7, experimental; mat-upd 5.7 TR)
    tr = [nid for nid, c in classes.items() if "TemporalResponsiveness" in c]
    if tr:
        add("temporal_responsiveness_experimental", "info",
            "Temporal Responsiveness node: experimental, costly; mask it to the scrolling region",
            "needs r.Velocity.TemporalResponsiveness.Supported=1 (engine ini or ConsoleVariables.ini); r.TSR.Visualize 3 to check",
            tr[0], "mat-upd 5.7 TR")
        if cvars is not None and not _truthy(cvars.get("r.Velocity.TemporalResponsiveness.Supported", 0)):
            add("tr_cvar_off", "fail", "Temporal Responsiveness used but r.Velocity.TemporalResponsiveness.Supported is off",
                "set it to 1 and recompile shaders", tr[0], "mat-upd 5.7 TR")
        if (graph.get("usage") or {}).get("used_with_nanite") and "MP_WORLD_POSITION_OFFSET" not in graph.get("outputs", {}):
            add("tr_nanite_needs_wpo", "warn", "Temporal Responsiveness on a Nanite material without WPO",
                "Nanite meshes need a small WPO value for the node to work", tr[0], "mat-upd 5.7 TR")

    # --- Material Parameter Collections (instances doc, Limitations)
    mpcs = set(str(nodes[nid].get("props", {}).get("collection")) for nid, c in classes.items()
               if c == "MaterialExpressionCollectionParameter" and nodes[nid].get("props", {}).get("collection"))
    if len(mpcs) > 2:
        add("mpc_limit", "fail", "%d Material Parameter Collections referenced (a material can reference at most 2)" % len(mpcs),
            "one collection for game-wide values, one for level values", source="instances doc, Limitations")

    # --- domains, blend modes, translucency, decals
    blend = str(graph.get("blend_mode", "")).upper()
    domain = str(graph.get("domain", "")).upper()
    is_decal = "DEFERRED_DECAL" in domain or any(c == "MaterialExpressionSubstrateConvertToDecal" for c in classes.values())
    if is_decal:
        if "OPAQUE" in blend or "MASKED" in blend:
            add("decal_blend_mode", "fail", "decal with blend mode %s" % blend,
                "Translucent (Grey/Colored Transmittance in Substrate) or Alpha Composite", source="Substrate overview, Extras")
        if "MODULATE" in blend:
            add("decal_modulate", "warn", "Modulate decals silently become Translucent with DBuffer decals",
                "DBuffer material expressions if the look needs it", source="decal doc")
        if (graph.get("usage") or {}).get("used_with_static_mesh") and not graph.get("mesh_decal"):
            add("decal_static_mesh", "warn", "decal material keeps Used with Static Mesh (static mesh shaders nobody draws)",
                "untick Used with Static Mesh (5.8), unless the material is applied to mesh-decal geometry [added caveat]",
                source="Nadro wobQ8ZKQpbc 00:18:38; D-cost U2 application")
    if "COLORED_TRANSMITTANCE" in blend:
        tinted = any(c == "MaterialExpressionSubstrateTransmittanceToMFP" for c in classes.values()) or graph.get("tinted")
        if not tinted:
            add("glass_grey_is_cheaper", "info", "Colored Transmittance without a tint",
                "Translucent Grey Transmittance (no extra post-DOF pass)", source="Ben sf-K257zWh8 00:00:33; Substrate overview")
    lm = str(graph.get("translucency_lighting_mode", "")).upper()
    if ("TRANSLUCENT" in blend or "TRANSMITTANCE" in blend) and "PER_PIXEL" in lm:
        add("translucent_forward_shading", "info", "Surface ForwardShading is the most expensive lighting mode",
            "Surface Translucency Volume unless local-light highlights on glass matter", source="Substrate overview, Lighting Modes")
    rm = str(graph.get("refraction_method", "")).upper()
    if shape == "flat" and "INDEX_OF_REFRACTION" in rm:
        add("refraction_by_shape", "warn", "IOR refraction on a flat pane", "Pixel Normal Offset for flat panes and water",
            source="Ben sf-K257zWh8 00:01:39")

    # --- usage flags
    usage = graph.get("usage", {}) or {}
    if graph.get("automatically_set_usage_in_editor"):
        add("auto_usage_on", "warn", "Automatically Set Usage in Editor is on: dropping it on a mesh adds flags silently",
            "turn it off here and in Project Settings > Rendering > Materials", source="Lauf wobQ8ZKQpbc 00:31:10")
    if ("UI" in domain) and usage.get("used_with_static_mesh"):
        add("ui_static_mesh", "warn", "UI material compiles static mesh shaders", "create via Content Browser > Material > UI Material, or untick Used with Static Mesh",
            source="Nadro wobQ8ZKQpbc 00:18:38, 00:19:54")
    if expected_usage is not None:
        for flag, on in sorted(usage.items()):
            if on and flag not in expected_usage and flag != "used_with_static_mesh":
                add("usage_flag_unplanned", "warn", "usage flag %s on the parent: a row of shaders for every unique instance" % flag,
                    "move it to the MI that needs it (5.8 Usage Flag Overrides [verify])", source="Lauf wobQ8ZKQpbc 00:24:25, 00:44:18")

    # --- landscape
    for nid, c in classes.items():
        if c == "MaterialExpressionLandscapeLayerBlend":
            layers = nodes[nid].get("props", {}).get("layers", [])
            types = [str(l.get("blend_type", "")).upper() for l in layers]
            names = [str(l.get("layer_name", "")) for l in layers]
            if types and all("HEIGHT" in t for t in types):
                add("landscape_all_height", "fail", "every layer is LB Height Blend: black spots where heights are 0",
                    "make the base layer LB Alpha Blend", nid, "landscape doc; Ben 0L5Azq6ugyo 00:15:20")
            elif types and "HEIGHT" in "".join(types) and "ALPHA" not in types[0] and "WEIGHT" not in types[0]:
                add("landscape_base_layer", "info", "first layer is not Alpha/Weight blend", node=nid)
            low = [x.lower() for x in names]
            if len(set(low)) != len(low):
                add("landscape_duplicate_layer", "fail", "duplicate layer names %s" % names, node=nid)
            if target_layers is not None:
                tl = set(x.lower() for x in target_layers)
                for nm in names:
                    if nm.lower() not in tl:
                        add("landscape_layer_no_target", "fail", "layer %s has no target layer: weight 0 forever" % nm,
                            "create the target layer and Layer Info with this name", nid, "landscape doc")
            if profile == "mobile" and len(names) > 3:
                add("landscape_mobile_layers", "warn", "%d layers on mobile (3 recommended)" % len(names), node=nid)
    if any(c == "MaterialExpressionLandscapeVisibilityMask" for c in classes.values()):
        if "OPAQUE" not in blend:
            add("landscape_holes_masked", "warn", "landscape material not Opaque with a Visibility Mask",
                "keep Opaque and connect Opacity Mask", source="landscape doc")
    return out


# Decal receivers (decal doc, Decal Response and Performance Implications): each DBuffer channel a
# receiver accepts adds material code, so a receiver's Decal Response lists only the channels the
# decals landing on it write. Overlapping DBuffer-expression decals do not blend: one wins by sort
# order (Recreating Legacy Behavior). Enum member names are [verify] (EMaterialDecalResponse).
_DECAL_OUTPUT_CHANNEL = {"MP_BASE_COLOR": "color", "MP_NORMAL": "normal", "MP_ROUGHNESS": "roughness",
                         "MP_METALLIC": "roughness", "MP_SPECULAR": "roughness"}
_DECAL_SLAB_CHANNEL = {"Diffuse Albedo": "color", "DiffuseAlbedo": "color", "F0": "roughness", "Normal": "normal",
                       "Roughness": "roughness"}


def decal_channels(graph):
    """DBuffer channels a decal material writes: legacy root outputs, or Substrate slab pins upstream
    of Convert To Decal. Returns a set of 'color', 'normal', 'roughness'."""
    ch = set()
    for prop in graph.get("outputs", {}):
        if prop in _DECAL_OUTPUT_CHANNEL:
            ch.add(_DECAL_OUTPUT_CHANNEL[prop])
    for nid, n in graph.get("nodes", {}).items():
        if SUBSTRATE_KIND.get(n.get("class")) == "slab":
            for pin, v in n.get("inputs", {}).items():
                if v is not None and pin in _DECAL_SLAB_CHANNEL:
                    ch.add(_DECAL_SLAB_CHANNEL[pin])
    return ch


def decal_response_for(channels):
    """Smallest Decal Response that covers the channels (union of every decal that lands on the
    receiver): set() -> MDR_NONE ... {'color','normal','roughness'} -> MDR_COLOR_NORMAL_ROUGHNESS."""
    ch = set(channels)
    unknown = ch - {"color", "normal", "roughness"}
    if unknown:
        raise ValueError("unknown decal channels %s" % sorted(unknown))
    if not ch:
        return "MDR_NONE"
    return "MDR_" + "_".join(c.upper() for c in ("color", "normal", "roughness") if c in ch)


# =========================================================================== 7. Substrate project settings (ini)
RENDERER_SECTION = "/Script/Engine.RendererSettings"
SUBSTRATE_KEYS = ("r.Substrate",)
# Key name for the project GBuffer format is [verify]: read it from a fresh 5.8 project's ini.
GBUFFER_FORMAT_KEYS = ("r.Substrate.ProjectGBufferFormat", "r.Substrate.GBufferFormat", "r.Substrate.BlendableGBuffer")


def read_ini_section(text, section):
    """Keys of one UE ini section as {key: [values]}, keeping +Key= array lines. A plain line scan:
    configparser breaks on UE's +/-/! prefixes and duplicate keys [added]."""
    cur, out = None, {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith(";") or line.startswith("#"):
            continue
        if line.startswith("[") and line.endswith("]"):
            cur = line[1:-1]
            continue
        if cur != section or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip().lstrip("+-.!")
        out.setdefault(k, []).append(v.strip())
    return out


def _truthy(v):
    return str(v).strip().lower() in ("1", "true", "yes", "on")


def substrate_state(ini_text):
    """{'substrate': True/False/None (None = key absent: new 5.8 projects default on, upgraded
    projects stay legacy, so absent means read the project's history), 'gbuffer_format': raw value
    or None, 'format_key': key found, 'keys': all r.Substrate* keys}."""
    sec = read_ini_section(ini_text, RENDERER_SECTION)
    st = {"substrate": None, "gbuffer_format": None, "format_key": None,
          "keys": {k: v[-1] for k, v in sec.items() if k.lower().startswith("r.substrate")}}
    for k in SUBSTRATE_KEYS:
        if k in sec:
            st["substrate"] = _truthy(sec[k][-1])
    for k in GBUFFER_FORMAT_KEYS:
        if k in sec:
            st["gbuffer_format"], st["format_key"] = sec[k][-1], k
            break
    return st


def set_ini_value(text, section, key, value):
    """Return new ini text with key=value in section (replaced if present, appended otherwise).
    The caller copies the original file to versions/ first (never overwrite a deliverable)."""
    lines = text.splitlines()
    out, cur, done, sec_seen = [], None, False, False
    for i, raw in enumerate(lines):
        line = raw.strip()
        if line.startswith("[") and line.endswith("]"):
            if cur == section and not done:
                out.append("%s=%s" % (key, value))
                done = True
            cur = line[1:-1]
            sec_seen = sec_seen or cur == section
            out.append(raw)
            continue
        if cur == section and "=" in line and line.split("=", 1)[0].strip() == key:
            if not done:
                out.append("%s=%s" % (key, value))
                done = True
            continue
        out.append(raw)
    if not done:
        if cur == section:
            out.append("%s=%s" % (key, value))
        else:
            if out and out[-1].strip():
                out.append("")
            out += ["[%s]" % section, "%s=%s" % (key, value)]
    return "\n".join(out) + "\n"


def gbuffer_memory_mb(width, height, bytes_per_pixel):
    """GBuffer MB at a resolution: legacy 16 B/px at 4K = 132.7 MB, Blendable 20 = 165.9 MB,
    Adaptive up to 80 = 663.6 MB (Ben Cloward [P5I38f2O6W8 00:05:13, 00:06:19])."""
    return int(width) * int(height) * float(bytes_per_pixel) / 1e6


ADAPTIVE_FEATURES = ("second_roughness", "haziness", "glints", "diffusion_mfp", "multi_closure", "rough_coat")
# The fact that makes the choice reversible or not across platforms (mat-upd 5.7: "If you set your
# project to Blendable, that becomes the ceiling, and all platforms will be Blendable"; Ben Cloward
# [P5I38f2O6W8 00:06:54]: Adaptive falls back per platform).
BLENDABLE_CEILING = ("Blendable is a ceiling: every platform, SM6 included, renders Blendable until the "
                     "project format changes")
ADAPTIVE_FALLBACK = ("Adaptive is a request: platforms without SM6 fall back to Blendable on their own, so "
                     "Blendable is never needed 'to support a lower platform'")


def choose_gbuffer_format(targets, needs=()):
    """Blendable vs Adaptive (Ben [P5I38f2O6W8 00:07:26], Morgan [SqPaL8HS_Lw 00:12:51], Substrate
    overview, 5.7 notes). targets: iterable of 'console60', 'console30', 'pc_high', 'pc_mid',
    'mobile', 'xr', 'switch', 'stills', 'archviz', 'automotive'. needs: Adaptive-only features.
    Blendable is a ceiling for every platform; Adaptive is a request that falls back per platform."""
    targets = set(targets)
    needs = set(needs)
    reasons = []
    low = targets & {"console60", "mobile", "xr", "switch", "pc_mid"}
    high = targets & {"pc_high", "stills", "archviz", "automotive", "console30"}
    if low and not needs:
        reasons.append("60 Hz or constrained targets %s: Blendable keeps legacy parity, fixed 20 B/px, no cook overhead" % sorted(low))
        reasons.append(BLENDABLE_CEILING)
        return "blendable", reasons
    if needs and (high or not low):
        reasons.append("needs %s, only on Adaptive (SM6 platforms)" % sorted(needs))
        reasons.append(ADAPTIVE_FALLBACK)
        reasons.append("cost: 20 to 80 B/px, about +15% cook time, DBuffer decals forced")
        return "adaptive", reasons
    if needs and low:
        reasons.append("needs %s but targets %s: Epic frames Blendable as the 60 Hz parity layer; drop the "
                       "features or measure an Adaptive build on the target before switching" % (sorted(needs), sorted(low)))
        reasons.append(ADAPTIVE_FALLBACK)
        reasons.append(BLENDABLE_CEILING)
        return "blendable", reasons
    if high:
        reasons.append("high-end PC or offline stills %s with no Adaptive-only need: Blendable is enough and cheaper" % sorted(high))
    reasons.append(BLENDABLE_CEILING)
    return "blendable", reasons


# =========================================================================== 8. landscape and RVT helpers
def is_prime(n):
    n = int(n)
    if n < 2:
        return False
    if n % 2 == 0:
        return n == 2
    r = int(math.isqrt(n))
    for d in range(3, r + 1, 2):
        if n % d == 0:
            return False
    return True


def prime_scales(approx):
    """Nearest primes to wanted tiling scales (world units per tile) so layer grids never line up
    (Ben Cloward [0L5Azq6ugyo 00:20:30]). Keeps them distinct."""
    out, used = [], set()
    for a in approx:
        a = int(round(a))
        for d in range(0, 10000):
            for cand in (a - d, a + d):
                if cand > 1 and is_prime(cand) and cand not in used:
                    out.append(cand)
                    used.add(cand)
                    break
            else:
                continue
            break
    return out


def check_rvt_writers(writers):
    """RVT writer hygiene (RVT doc; PrismaticaDev). writers: [{'name', 'mobility', 'pass_type'
    ('NEVER'|'EXCLUSIVE'|'ALWAYS' or UI names), 'collision' (bool), 'sort_priority' (int),
    'is_landscape', 'num_lods' (landscape), 'rvts': [asset names], 'is_ism'}]."""
    out = []
    by_rvt = {}
    for w in writers:
        name = w.get("name", "?")
        if str(w.get("mobility", "STATIC")).upper() not in ("STATIC", "EOMP_STATIC", "COMPONENTMOBILITY.STATIC"):
            out.append(finding("rvt_writer_not_static", "fail", "%s writes to an RVT but is %s" % (name, w.get("mobility")),
                               "Static writers only (movable ones redraw pages)", source="RVT doc", asset=name))
        never = "NEVER" in str(w.get("pass_type", "")).upper()
        if never and w.get("collision", False):
            out.append(finding("rvt_write_only_collision", "warn", "%s is write-only (Draw in Main Pass: Never) with collision on" % name,
                               "disable collision by hand", source="RVT doc", asset=name))
        if w.get("is_landscape"):
            if w.get("num_lods") not in (None, 0):
                out.append(finding("rvt_landscape_lods", "info", "%s: Virtual Texture Num LODs %s (0 is optimal)" % (name, w.get("num_lods")),
                                   asset=name))
            if w.get("sort_priority") not in (None, -1) and w.get("sort_priority") >= 0:
                out.append(finding("rvt_landscape_priority", "warn", "%s: landscape sort priority %s, stamps may draw under it" % (name, w.get("sort_priority")),
                                   "Translucency Sort Priority -1 on the landscape", source="PrismaticaDev RLEPA16QDRw 00:51:42", asset=name))
        if w.get("is_ism"):
            out.append(finding("rvt_ism_writer", "info", "%s: ISM writers get no instance culling or LOD in the RVT" % name, asset=name))
        for r in w.get("rvts", []):
            by_rvt.setdefault(r, []).append(w)
    for r, ws in by_rvt.items():
        seen = {}
        for w in ws:
            p = w.get("sort_priority", 0)
            seen.setdefault(p, []).append(w.get("name"))
        for p, names in seen.items():
            if len(names) > 1:
                out.append(finding("rvt_sort_priority_tie", "warn", "%s: writers %s share sort priority %s (undefined order)" % (r, names, p),
                                   "distinct Translucency Sort Priority for overlapping writers", source="RVT doc, Object Sort Priority", asset=r))
    return out


# =========================================================================== 9. in-editor layer (needs `import unreal`)
# First-guess names with fallbacks. probe() prints what the installed engine has; fix these tables
# from its JSON. None of this has run in Unreal yet.
CANDIDATES = {
    "expr": {
        "tex": ["MaterialExpressionTextureSampleParameter2D"],
        "texobj": ["MaterialExpressionTextureObjectParameter"],
        "scalar": ["MaterialExpressionScalarParameter"],
        "vector": ["MaterialExpressionVectorParameter"],
        "switch": ["MaterialExpressionStaticSwitchParameter"],
        "const": ["MaterialExpressionConstant"],
        "const3": ["MaterialExpressionConstant3Vector"],
        "lerp": ["MaterialExpressionLinearInterpolate"],
        "mul": ["MaterialExpressionMultiply"],
        "add": ["MaterialExpressionAdd"],
        "sub": ["MaterialExpressionSubtract"],
        "oneminus": ["MaterialExpressionOneMinus"],
        "sat": ["MaterialExpressionSaturate"],
        "if": ["MaterialExpressionIf"],
        "vcolor": ["MaterialExpressionVertexColor"],
        "vnormal": ["MaterialExpressionVertexNormalWS"],
        "mask": ["MaterialExpressionComponentMask"],
        "texcoord": ["MaterialExpressionTextureCoordinate"],
        "fn": ["MaterialExpressionMaterialFunctionCall"],
        "custom": ["MaterialExpressionCustom"],
        "scenetex": ["MaterialExpressionSceneTexture"],
        "slab": ["MaterialExpressionSubstrateSlabBSDF"],
        "hblend": ["MaterialExpressionSubstrateHorizontalMixing"],
        "vlayer": ["MaterialExpressionSubstrateVerticalLayering"],
        "metal2sub": ["MaterialExpressionSubstrateMetalnessToDiffuseAlbedoF0"],
        "t2mfp": ["MaterialExpressionSubstrateTransmittanceToMFP"],
        "unlit": ["MaterialExpressionSubstrateUnlitBSDF"],
        "todecal": ["MaterialExpressionSubstrateConvertToDecal"],
        "weight": ["MaterialExpressionSubstrateWeight"],
        "toon": ["MaterialExpressionSubstrateToonBSDF", "MaterialExpressionSubstrateToonShadingBSDF"],
        "rvt_out": ["MaterialExpressionRuntimeVirtualTextureOutput"],
        "rvt_sample": ["MaterialExpressionRuntimeVirtualTextureSampleParameter", "MaterialExpressionRuntimeVirtualTextureSample"],
        "llb": ["MaterialExpressionLandscapeLayerBlend"],
    },
    "pin": {
        "Diffuse Albedo": ["Diffuse Albedo", "DiffuseAlbedo"],
        "F0": ["F0"], "F90": ["F90"], "Roughness": ["Roughness"], "Normal": ["Normal"],
        "SSS MFP": ["SSS MFP", "SSSMFP", "SSS Mean Free Path"],
        "Emissive Color": ["Emissive Color", "EmissiveColor"],
        "Background": ["Background"], "Foreground": ["Foreground"], "Mix": ["Mix"],
        "Top": ["Top"], "Bottom": ["Base", "Bottom"], "Thickness": ["Thickness"],
        "Base Color": ["Base Color", "BaseColor"], "Metallic": ["Metallic"], "Specular": ["Specular"],
        "Transmittance Color": ["Transmittance Color", "TransmittanceColor"],
        "A>B": ["A > B", "A>B", "AGreaterThanB"], "A<B": ["A < B", "A<B", "ALessThanB"],
        "A==B": ["A == B", "A==B", "AEqualsB"],
        "Decal": ["Decal", "Decal Material", "DecalMaterial", "Material", ""],
        "Weight": ["Weight"], "A": ["A"], "B": ["B"],
    },
    "out": {  # output pin names of helper nodes
        "Diffuse Albedo": ["DiffuseAlbedo", "Diffuse Albedo"], "F0": ["F0"], "MFP": ["MFP", "Mean Free Path"],
    },
    "prop": {
        "MP_FRONT_MATERIAL": ["MP_FRONT_MATERIAL", "MP_FRONTMATERIAL"],
        "BLEND_TRANSLUCENT_COLORED_TRANSMITTANCE": ["BLEND_TRANSLUCENT_COLORED_TRANSMITTANCE", "BLEND_TRANSLUCENT_COLOREDTRANSMITTANCE"],
        "BLEND_TRANSLUCENT_GREY_TRANSMITTANCE": ["BLEND_TRANSLUCENT_GREY_TRANSMITTANCE", "BLEND_TRANSLUCENT"],
        "RM_INDEX_OF_REFRACTION_FROM_F0": ["RM_INDEX_OF_REFRACTION_FROM_F0", "RM_INDEX_OF_REFRACTION"],
        "RM_PIXEL_NORMAL_OFFSET": ["RM_PIXEL_NORMAL_OFFSET"],
        "TLM_SURFACE": ["TLM_SURFACE"],
        "SSM_WRAP_WORLD_GROUP_SETTINGS": ["SSM_WRAP_WORLD_GROUP_SETTINGS"],
        "MSS_SIMPLE_VOLUME": ["MSS_SIMPLE_VOLUME", "SSS_TYPE_SIMPLE_VOLUME"],
    },
    "usage_props": [
        "used_with_static_mesh", "used_with_skeletal_mesh", "used_with_nanite", "used_with_niagara_sprites",
        "used_with_niagara_ribbons", "used_with_niagara_mesh_particles", "used_with_particle_sprites",
        "used_with_mesh_particles", "used_with_morph_targets", "used_with_spline_meshes",
        "used_with_instanced_static_meshes", "used_with_geometry_collections", "used_with_clothing",
        "used_with_geometry_cache", "used_with_static_lighting", "used_with_hair_strands", "used_with_water",
        "used_with_editor_compositing", "used_with_virtual_heightfield_mesh", "used_with_lidar_point_cloud",
    ],
    "hspr_tags": ["HasStaticPermutationResource", "bHasStaticPermutationResource"],
    "mel_functions": [
        "create_material_expression", "connect_material_expressions", "connect_material_property",
        "recompile_material", "layout_material_expressions", "get_statistics", "list_shaders",
        "get_inputs_for_material_expression", "get_material_property_input_node",
        "get_material_expression_input_names", "get_material_used_textures", "get_used_textures",
        "set_base_material_usage", "set_material_usage", "has_material_usage",
        "get_static_switch_parameter_names", "get_scalar_parameter_names", "get_vector_parameter_names",
        "get_material_default_static_switch_parameter_value", "get_material_function_used_textures",
        "get_texture_parameter_names", "set_material_instance_static_switch_parameter_value",
        "get_material_instance_static_switch_parameter_value", "set_material_instance_scalar_parameter_value",
        "set_material_instance_vector_parameter_value", "set_material_instance_texture_parameter_value",
        "update_material_instance", "set_material_instance_parent", "get_expressions", "get_material_expressions",
        "rename_material_parameter_group",
    ],
    "cvars": ["r.Substrate", "r.Substrate.ProjectGBufferFormat", "r.Substrate.BytesPerPixel",
              "r.Substrate.MaxClosureCount", "r.Material.UseShaderCompilationParameters",
              "r.Material.StripUnusedDefaultTextures", "r.SkinCache.CompileShaders", "r.SkinCache.Allow",
              "slate.MaterialShaderMode", "r.VT.MaxUploadsPerFrame", "r.DBuffer",
              "r.InstancedStaticMeshes.UseInstancedStaticMeshVertexFactory",
              "r.Velocity.TemporalResponsiveness.Supported", "r.Streaming.PoolSize"],
}

_LOG = []


def log(msg):
    _LOG.append(str(msg))
    try:
        import unreal
        unreal.log("[ue_materials] %s" % msg)
    except Exception:
        pass


def _u():
    try:
        import unreal
    except ImportError:
        raise RuntimeError("ue_materials: this function needs Unreal Editor Python (import unreal failed)")
    return unreal


def _mel():
    return _u().MaterialEditingLibrary


def _eal():
    return _u().EditorAssetLibrary


def _cls_of(key):
    u = _u()
    for name in CANDIDATES["expr"].get(key, [key]):
        c = getattr(u, name, None)
        if c is not None:
            return c, name
    raise RuntimeError("no expression class for %s (tried %s); run probe()" % (key, CANDIDATES["expr"].get(key)))


def _enum_value(enum_name, key_or_members):
    u = _u()
    E = getattr(u, enum_name, None)
    if E is None:
        return None
    members = CANDIDATES["prop"].get(key_or_members, [key_or_members]) if isinstance(key_or_members, str) else key_or_members
    for m in members:
        if hasattr(E, m):
            return getattr(E, m)
    return None


def _set(obj, names, value):
    if isinstance(names, str):
        names = [names]
    last = None
    for n in names:
        try:
            obj.set_editor_property(n, value)
            return n
        except Exception as e:  # property absent or wrong type
            last = e
    log("set %s on %s failed: %s" % (names, _name(obj), last))
    return None


def _get(obj, names, default=None):
    if isinstance(names, str):
        names = [names]
    for n in names:
        try:
            return obj.get_editor_property(n)
        except Exception:
            continue
    return default


def _name(obj):
    try:
        return obj.get_name()
    except Exception:
        return str(obj)


def _path(obj):
    try:
        return obj.get_path_name().split(".")[0]
    except Exception:
        return str(obj)


def probe(out_path=None):
    """Run first in a 5.8 editor: which classes, functions, enum members, properties and cvars exist.
    Writes JSON if out_path. Use it to correct CANDIDATES before any build."""
    u = _u()
    MEL = u.MaterialEditingLibrary
    res = {"engine": None, "classes": {}, "substrate_toon_classes": [], "mel": {}, "enums": {}, "usage_props": {},
           "cvars": {}, "texture_props": {}, "slab_inputs": None, "notes": []}
    try:
        res["engine"] = u.SystemLibrary.get_engine_version()
    except Exception as e:
        res["notes"].append("engine version: %s" % e)
    for key, names in CANDIDATES["expr"].items():
        res["classes"][key] = [n for n in names if hasattr(u, n)]
    res["substrate_toon_classes"] = sorted(n for n in dir(u) if ("Substrate" in n or "Toon" in n))
    for f in CANDIDATES["mel_functions"]:
        res["mel"][f] = hasattr(MEL, f)
    for enum_name in ("BlendMode", "MaterialDomain", "TranslucencyLightingMode", "RefractionMode", "MaterialProperty",
                      "TextureCompressionSettings", "TextureGroup", "MaterialSamplerType", "SamplerSourceMode",
                      "TextureMipGenSettings", "MaterialUsage", "LandscapeLayerBlendType", "RuntimeVirtualTextureMaterialType",
                      "RuntimeVirtualTextureMainPassType"):
        E = getattr(u, enum_name, None)
        res["enums"][enum_name] = sorted(m for m in dir(E) if m.isupper()) if E is not None else None
    tmp = None
    try:
        tmp = u.Material()
    except Exception as e:
        res["notes"].append("transient Material(): %s" % e)
    if tmp is not None:
        for p in CANDIDATES["usage_props"] + ["automatically_set_usage_in_editor", "blend_mode", "material_domain",
                                              "translucency_lighting_mode", "refraction_method", "use_material_attributes",
                                              "tangent_space_normal", "material_decal_response", "two_sided"]:
            try:
                tmp.get_editor_property(p)
                res["usage_props"][p] = True
            except Exception:
                res["usage_props"][p] = False
        try:
            slab_cls, _ = _cls_of("slab")
            slab = MEL.create_material_expression(tmp, slab_cls, 0, 0)
            if hasattr(MEL, "get_material_expression_input_names"):
                res["slab_inputs"] = [str(x) for x in MEL.get_material_expression_input_names(slab)]
        except Exception as e:
            res["notes"].append("slab inputs: %s" % e)
    for cv in CANDIDATES["cvars"]:
        try:
            res["cvars"][cv] = u.SystemLibrary.get_console_variable_int_value(cv)
        except Exception as e:
            res["cvars"][cv] = "error: %s" % e
    try:
        t = u.Texture2D()
        for p in ("compression_settings", "srgb", "lod_group", "compression_no_alpha", "lod_bias", "max_texture_size",
                  "mip_gen_settings", "never_stream", "virtual_texture_streaming", "flip_green_channel",
                  "lossy_compression_amount"):
            try:
                t.get_editor_property(p)
                res["texture_props"][p] = True
            except Exception:
                res["texture_props"][p] = False
    except Exception as e:
        res["notes"].append("transient Texture2D(): %s" % e)
    if out_path:
        with open(out_path, "w") as f:
            json.dump(res, f, indent=2, default=str)
    return res


# ---------------------------------------------------------------- textures in the editor
def _asset_tag(asset_data, names):
    u = _u()
    for n in names:
        try:
            v = u.AssetRegistryHelpers.get_tag_value(asset_data, n)
            if isinstance(v, tuple):
                ok, val = (v[0], v[1]) if len(v) > 1 else (True, v[0])
                if ok and val not in (None, ""):
                    return val
            elif v not in (None, ""):
                return v
        except Exception:
            continue
    return None


def texture_props(tex, asset_data=None):
    """Dict for check_texture() from a loaded Texture2D (sizes from the 'Dimensions' asset tag when
    available [verify tag], else blueprint_get_size_x/y)."""
    p = {"name": _name(tex), "path": _path(tex)}
    for k in ("compression_settings", "srgb", "lod_group", "compression_no_alpha", "lod_bias", "max_texture_size",
              "mip_gen_settings", "never_stream", "virtual_texture_streaming", "flip_green_channel"):
        v = _get(tex, k)
        if v is not None:
            p[k] = v if isinstance(v, (bool, int, float)) else str(v)
    nrm = _get(tex, ["normalize_normals", "b_normalize_normals"])  # "Normalize after making Mips" [verify name]
    if nrm is not None:
        p["normalize_after_mips"] = bool(nrm)
    dims = _asset_tag(asset_data, ["Dimensions", "ImportedSize"]) if asset_data is not None else None
    if dims and "x" in str(dims):
        a, b = str(dims).lower().split("x")[:2]
        p["width"], p["height"] = int(float(a)), int(float(b))
    else:
        try:
            p["width"], p["height"] = int(tex.blueprint_get_size_x()), int(tex.blueprint_get_size_y())
        except Exception:
            pass
    alpha = _asset_tag(asset_data, ["HasAlphaChannel", "bHasAlphaChannel"]) if asset_data is not None else None
    if alpha is not None:
        p["has_alpha"] = _truthy(alpha)
    return p


def apply_texture_fix(tex, fix, dry_run=True):
    """Apply texture_fix() output. Returns the list of (property, old, new). Saves unless dry_run."""
    u = _u()
    enums = {"compression_settings": "TextureCompressionSettings", "lod_group": "TextureGroup",
             "mip_gen_settings": "TextureMipGenSettings"}
    changes = []
    for prop, val in fix.items():
        old = _get(tex, prop)
        new = val
        if prop in enums:
            new = _enum_value(enums[prop], [val])
            if new is None:
                log("enum %s.%s missing" % (enums[prop], val))
                continue
        changes.append((prop, str(old), str(val)))
        if not dry_run:
            _set(tex, prop, new)
    if changes and not dry_run:
        u.EditorAssetLibrary.save_loaded_asset(tex)
    return changes


def audit_textures(folder, apply=False, profile="console60"):
    """Texture policy over a folder: findings per texture and the planned (or applied) fixes."""
    u = _u()
    u.AssetRegistryHelpers.get_asset_registry()
    findings, fixes = [], {}
    for path in u.EditorAssetLibrary.list_assets(folder, recursive=True, include_folder=False):
        ad = u.EditorAssetLibrary.find_asset_data(path)
        try:
            cls = str(ad.asset_class_path.asset_name)
        except Exception:
            cls = str(getattr(ad, "asset_class", ""))
        if cls not in ("Texture2D",):
            continue
        tex = u.EditorAssetLibrary.load_asset(path)
        props = texture_props(tex, ad)
        f = check_texture(props, profile=profile)
        findings += f
        fx = texture_fix(props)
        if fx:
            fixes[props["path"]] = apply_texture_fix(tex, fx, dry_run=not apply)
    return {"findings": findings, "fixes": fixes, "summary": summarize(findings)}


def import_textures(files, dest, role_overrides=None, apply_policy=True):
    """Import image files with AssetImportTask (automated, saved), then apply the role policy."""
    u = _u()
    tasks = []
    for f in files:
        t = u.AssetImportTask()
        t.set_editor_property("filename", f)
        t.set_editor_property("destination_path", dest)
        t.set_editor_property("automated", True)
        t.set_editor_property("save", True)
        t.set_editor_property("replace_existing", False)
        tasks.append(t)
    u.AssetToolsHelpers.get_asset_tools().import_asset_tasks(tasks)
    imported = []
    for t in tasks:
        try:
            objs = list(t.get_objects())
        except Exception:
            objs = []
        for o in objs:
            imported.append(o)
            if apply_policy:
                role = (role_overrides or {}).get(_name(o))
                apply_texture_fix(o, texture_fix(texture_props(o), role=role), dry_run=False)
    return imported


# ---------------------------------------------------------------- graph building
class Graph(object):
    """Small builder over MaterialEditingLibrary with name fallbacks and a log of failed links.
    g = Graph(material); n = g.node('mul', x, y); g.link(a, 'R', n, 'A'); g.out(n, '', 'MP_BASE_COLOR')."""

    def __init__(self, material):
        self.m = material
        self.MEL = _mel()
        self.failed = []
        self.nodes = []

    def node(self, key, x, y, **props):
        cls, _ = _cls_of(key)
        e = self.MEL.create_material_expression(self.m, cls, int(x), int(y))
        for k, v in props.items():
            _set(e, k, v)
        self.nodes.append(e)
        return e

    def scalar(self, name, value, x, y, group="", priority=0, cpd_index=None):
        e = self.node("scalar", x, y, parameter_name=name, default_value=float(value))
        if group:
            _set(e, "group", group)
        _set(e, "sort_priority", int(priority))
        if cpd_index is not None:  # Custom Primitive Data: per-component values, no new MI
            _set(e, ["use_custom_primitive_data"], True)
            _set(e, ["primitive_data_index"], int(cpd_index))
        return e

    def vector(self, name, rgb, x, y, group="", priority=0):
        u = _u()
        e = self.node("vector", x, y, parameter_name=name)
        _set(e, "default_value", u.LinearColor(float(rgb[0]), float(rgb[1]), float(rgb[2]), 1.0))
        if group:
            _set(e, "group", group)
        _set(e, "sort_priority", int(priority))
        return e

    def texture(self, name, x, y, sampler="SAMPLERTYPE_COLOR", group="", texture=None, priority=0):
        e = self.node("tex", x, y, parameter_name=name)
        st = _enum_value("MaterialSamplerType", [sampler])
        if st is not None:
            _set(e, "sampler_type", st)
        ss = _enum_value("SamplerSourceMode", "SSM_WRAP_WORLD_GROUP_SETTINGS")
        if ss is not None:
            _set(e, "sampler_source", ss)
        if group:
            _set(e, "group", group)
        _set(e, "sort_priority", int(priority))
        if texture is not None:
            _set(e, "texture", texture)
        return e

    def switch(self, name, default, x, y, group="Features"):
        e = self.node("switch", x, y, parameter_name=name, default_value=bool(default))
        if group:
            _set(e, "group", group)
        return e

    def const(self, value, x, y):
        return self.node("const", x, y, r=float(value))

    def link(self, a, a_out, b, pin):
        for name in CANDIDATES["pin"].get(pin, [pin]):
            outs = CANDIDATES["out"].get(a_out, [a_out]) if a_out else [""]
            for o in outs:
                try:
                    if self.MEL.connect_material_expressions(a, o, b, name):
                        return name
                except Exception:
                    continue
        avail = None
        try:
            avail = [str(x) for x in self.MEL.get_material_expression_input_names(b)]
        except Exception:
            pass
        self.failed.append({"from": _name(a), "out": a_out, "to": _name(b), "pin": pin, "available": avail})
        log("link failed %s.%s -> %s.%s (inputs %s)" % (_name(a), a_out, _name(b), pin, avail))
        return None

    def out(self, a, a_out, prop_key):
        u = _u()
        prop = _enum_value("MaterialProperty", prop_key) if prop_key in CANDIDATES["prop"] else getattr(u.MaterialProperty, prop_key, None)
        if prop is None:
            self.failed.append({"from": _name(a), "prop": prop_key})
            return False
        ok = self.MEL.connect_material_property(a, a_out, prop)
        if not ok:
            self.failed.append({"from": _name(a), "prop": prop_key})
        return ok

    def op(self, key, a, b, x, y, a_out="", b_out=""):
        n = self.node(key, x, y)
        self.link(a, a_out, n, "A")
        if b is not None:
            self.link(b, b_out, n, "B")
        return n

    def finish(self, save=True):
        self.MEL.layout_material_expressions(self.m)
        self.MEL.recompile_material(self.m)
        if save:
            _eal().save_loaded_asset(self.m)
        return {"material": _path(self.m), "nodes": len(self.nodes), "failed_links": self.failed}


def new_material(path, overwrite=False):
    """Create an empty Material at /Game/.../Name. Refuses to overwrite an existing asset unless
    overwrite (then the caller has versioned it)."""
    u = _u()
    if u.EditorAssetLibrary.does_asset_exist(path) and not overwrite:
        raise RuntimeError("%s exists: duplicate it to a versioned name or pass overwrite=True after versioning" % path)
    folder, name = path.rsplit("/", 1)
    return u.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, u.Material, u.MaterialFactoryNew())


def project_uses_substrate():
    u = _u()
    try:
        return bool(u.SystemLibrary.get_console_variable_int_value("r.Substrate"))
    except Exception:
        return None


def build_kit_surface(path, substrate=None, overwrite=False, textures=None):
    """Opaque master for a modular kit (metal panels and painted surfaces with edge wear and dirt).
    Design (SKILL.md, stage 3): textures BaseColor, Normal, ORM (AO, Roughness, Metallic), Masks
    (R edge/curvature, G cavity, B paint ID) and a tiling Grunge, all on Shared: Wrap samplers.
    Static switches only where they gate textures (Lauf): UseWear (Masks + Grunge), UseDetailNormal.
    Paint mask source is an If on a scalar (vertex colour G vs Masks B), per-instance variation is
    Custom Primitive Data (0 WearOffset, 1 DirtOffset). Substrate: one slab from the Metalness helper
    (textures authored in metalness) + a bare-metal slab, Horizontal Blend with Use Parameter
    Blending on the wear mask (one closure everywhere, Morgan [SqPaL8HS_Lw 00:37:35], so the mask's
    sharpness is an artistic choice, not a cost lever); dirt lerps albedo/F0/roughness before the slab;
    Specular = 0.5 x (1 - cavity) under UseWear (specular occlusion). Legacy: the same masks drive
    lerps into the root pins. NOT YET RUN IN UNREAL."""
    if substrate is None:
        substrate = bool(project_uses_substrate())
    m = new_material(path, overwrite=overwrite)
    textures = textures or {}
    g = Graph(m)
    X = -1800
    bc = g.texture("BaseColor", X, -600, "SAMPLERTYPE_COLOR", "Textures", textures.get("BaseColor"), 0)
    nrm = g.texture("Normal", X, -300, "SAMPLERTYPE_NORMAL", "Textures", textures.get("Normal"), 1)
    orm = g.texture("ORM", X, 0, "SAMPLERTYPE_MASKS", "Textures", textures.get("ORM"), 2)
    msk = g.texture("Masks", X, 300, "SAMPLERTYPE_MASKS", "Wear", textures.get("Masks"), 0)
    grn = g.texture("Grunge", X, 600, "SAMPLERTYPE_MASKS", "Wear", textures.get("Grunge"), 1)
    uv = g.node("texcoord", X - 400, 600)
    gt = g.scalar("GrungeTiling", 3.0, X - 400, 750, "Wear", 9)
    guv = g.op("mul", uv, gt, X - 200, 650)
    g.link(guv, "", grn, "UVs")
    # paint mask: If(PaintFromVertexColor > 0.5 -> vertex colour G, else Masks B). Both inputs are
    # cheap (an interpolant and an already fetched texel), so no switch (Lauf's rule).
    vc = g.node("vcolor", X - 200, 900)
    pfv = g.scalar("PaintFromVertexColor", 0.0, X - 200, 1050, "Wear", 8)
    half = g.const(0.5, X - 200, 1150)
    paint_if = g.node("if", X + 200, 900)
    g.link(pfv, "", paint_if, "A")
    g.link(half, "", paint_if, "B")
    g.link(vc, "G", paint_if, "A>B")
    g.link(msk, "B", paint_if, "A<B")
    # wear = saturate((edge + (grunge - 0.5) * breakup - (1 - (amount + cpd0))) * sharpness) * paint
    amt = g.scalar("WearAmount", 0.3, X + 200, 300, "Wear", 1)
    cpd0 = g.scalar("WearOffset", 0.0, X + 200, 400, "Wear", 2, cpd_index=0)
    amt2 = g.op("add", amt, cpd0, X + 400, 350)
    inv = g.node("oneminus", X + 600, 350)
    g.link(amt2, "", inv, "")
    brk = g.scalar("WearBreakup", 0.5, X + 200, 550, "Wear", 3)
    gc = g.op("sub", grn, half, X + 400, 600, a_out="R")
    gcb = g.op("mul", gc, brk, X + 600, 600)
    edge = g.op("add", msk, gcb, X + 800, 450, a_out="R")
    e2 = g.op("sub", edge, inv, X + 1000, 400)
    sharp = g.scalar("WearSharpness", 12.0, X + 800, 650, "Wear", 4)
    e3 = g.op("mul", e2, sharp, X + 1200, 400)
    e4 = g.node("sat", X + 1400, 400)
    g.link(e3, "", e4, "")
    wear = g.op("mul", e4, paint_if, X + 1600, 450)
    zero = g.const(0.0, X + 1600, 650)
    sw_wear = g.switch("UseWear", False, X + 1800, 450)
    g.link(wear, "", sw_wear, "True")
    g.link(zero, "", sw_wear, "False")
    # dirt = saturate(cavity * DirtCavity + (1 - AO) * DirtAO + (grunge.R - 0.5)) * (DirtAmount + cpd1)
    dc = g.scalar("DirtCavity", 1.0, X + 200, 1300, "Dirt", 1)
    dao = g.scalar("DirtAO", 0.5, X + 200, 1400, "Dirt", 2)
    d1 = g.op("mul", msk, dc, X + 400, 1300, a_out="G")
    ao_inv = g.node("oneminus", X + 400, 1450)
    g.link(orm, "R", ao_inv, "")
    d2 = g.op("mul", ao_inv, dao, X + 600, 1450)
    d3 = g.op("add", d1, d2, X + 800, 1350)
    d4 = g.op("add", d3, gc, X + 1000, 1350)
    d5 = g.node("sat", X + 1200, 1350)
    g.link(d4, "", d5, "")
    damt = g.scalar("DirtAmount", 0.4, X + 1000, 1550, "Dirt", 0)
    cpd1 = g.scalar("DirtOffset", 0.0, X + 1000, 1650, "Dirt", 3, cpd_index=1)
    damt2 = g.op("add", damt, cpd1, X + 1200, 1600)
    dirt = g.op("mul", d5, damt2, X + 1400, 1400)
    sw_dirt = g.switch("UseWear", False, X + 1800, 1400)  # same parameter name: one switch value
    g.link(dirt, "", sw_dirt, "True")
    g.link(zero, "", sw_dirt, "False")
    # detail normal behind a switch (it gates a texture)
    det = g.texture("DetailNormal", X, 1800, "SAMPLERTYPE_NORMAL", "Detail", textures.get("DetailNormal"), 0)
    dtil = g.scalar("DetailTiling", 8.0, X - 400, 1900, "Detail", 1)
    duv = g.op("mul", uv, dtil, X - 200, 1850)
    g.link(duv, "", det, "UVs")
    blend_n, fn_asset = None, None
    for p in ("/Engine/Functions/Engine_MaterialFunctions02/Utility/BlendAngleCorrectedNormals.BlendAngleCorrectedNormals",):
        try:
            fn_asset = _u().EditorAssetLibrary.load_asset(p)
        except Exception:
            fn_asset = None
        if fn_asset:
            break
    if fn_asset:  # [verify] path; without it the detail normal replaces nothing
        blend_n = g.node("fn", X + 400, 1800)
        _set(blend_n, ["material_function", "function"], fn_asset)
        g.link(nrm, "RGB", blend_n, "BaseNormal")
        g.link(det, "RGB", blend_n, "AdditionalNormal")
    sw_det = g.switch("UseDetailNormal", False, X + 800, 1800)
    g.link(blend_n if fn_asset else nrm, "" if fn_asset else "RGB", sw_det, "True")
    g.link(nrm, "RGB", sw_det, "False")
    # dirt and metal targets
    dirt_col = g.vector("DirtColor", (0.12, 0.10, 0.08), X + 1600, 1700, "Dirt", 4)
    dirt_rough = g.scalar("DirtRoughness", 0.85, X + 1600, 1850, "Dirt", 5)
    rough_s = g.scalar("RoughnessScale", 1.0, X + 200, 100, "Surface", 1)
    rough = g.op("mul", orm, rough_s, X + 400, 50, a_out="G")
    rough_d = g.node("lerp", X + 2000, 1200)
    g.link(rough, "", rough_d, "A")
    g.link(dirt_rough, "", rough_d, "B")
    g.link(sw_dirt, "", rough_d, "Alpha")
    metal_f0 = g.vector("BareMetalF0", METAL_F0["iron"], X + 1800, -900, "Wear", 5)
    metal_rough = g.scalar("BareMetalRoughness", 0.3, X + 1800, -750, "Wear", 6)
    # specular occlusion from cavity: Specular = 0.5 x (1 - cavity) where Masks.G is 1 in crevices
    # (Ben: specular map = crevice map x 0.5 [fePsD_8p9vM 00:14:25]; PBR doc Cavity Maps), which
    # dims F0 in crevices through the helper. Masks is only sampled under UseWear, so the same switch
    # name picks between it and a flat 0.5 (no extra permutation) [added wiring].
    spec = g.scalar("Specular", 0.5, X + 400, -350, "Surface", 2)
    cav_inv = g.node("oneminus", X + 400, -250)
    g.link(msk, "G", cav_inv, "")
    spec_occ = g.op("mul", cav_inv, spec, X + 600, -250)
    sw_spec = g.switch("UseWear", False, X + 800, -300)
    g.link(spec_occ, "", sw_spec, "True")
    g.link(spec, "", sw_spec, "False")
    if substrate:
        helper = g.node("metal2sub", X + 600, -500)
        g.link(bc, "RGB", helper, "Base Color")
        g.link(orm, "B", helper, "Metallic")
        g.link(sw_spec, "", helper, "Specular")
        alb_d = g.node("lerp", X + 2000, -600)
        g.link(helper, "Diffuse Albedo", alb_d, "A")
        g.link(dirt_col, "", alb_d, "B")
        g.link(sw_dirt, "", alb_d, "Alpha")
        dirt_f0 = g.const(0.04, X + 1800, -300)
        f0_d = g.node("lerp", X + 2000, -350)
        g.link(helper, "F0", f0_d, "A")
        g.link(dirt_f0, "", f0_d, "B")
        g.link(sw_dirt, "", f0_d, "Alpha")
        base = g.node("slab", X + 2400, -300)
        g.link(alb_d, "", base, "Diffuse Albedo")
        g.link(f0_d, "", base, "F0")
        g.link(rough_d, "", base, "Roughness")
        g.link(sw_det, "", base, "Normal")
        bare = g.node("slab", X + 2400, -900)
        g.link(g.const(0.0, X + 2200, -1000), "", bare, "Diffuse Albedo")
        g.link(metal_f0, "", bare, "F0")
        g.link(metal_rough, "", bare, "Roughness")
        g.link(sw_det, "", bare, "Normal")
        mix = g.node("hblend", X + 2800, -500)
        _set(mix, ["use_parameter_blending"], True)
        g.link(base, "", mix, "Background")
        g.link(bare, "", mix, "Foreground")
        g.link(sw_wear, "", mix, "Mix")
        g.out(mix, "", "MP_FRONT_MATERIAL")
    else:
        bc_d = g.node("lerp", X + 2000, -600)
        g.link(bc, "RGB", bc_d, "A")
        g.link(dirt_col, "", bc_d, "B")
        g.link(sw_dirt, "", bc_d, "Alpha")
        bc_w = g.node("lerp", X + 2400, -600)
        g.link(bc_d, "", bc_w, "A")
        g.link(metal_f0, "", bc_w, "B")
        g.link(sw_wear, "", bc_w, "Alpha")
        met_w = g.node("lerp", X + 2400, -300)
        g.link(orm, "B", met_w, "A")
        g.link(g.const(1.0, X + 2200, -250), "", met_w, "B")
        g.link(sw_wear, "", met_w, "Alpha")
        rough_w = g.node("lerp", X + 2400, 0)
        g.link(rough_d, "", rough_w, "A")
        g.link(metal_rough, "", rough_w, "B")
        g.link(sw_wear, "", rough_w, "Alpha")
        g.out(bc_w, "", "MP_BASE_COLOR")
        g.out(met_w, "", "MP_METALLIC")
        g.out(rough_w, "", "MP_ROUGHNESS")
        g.out(sw_det, "", "MP_NORMAL")
        g.out(sw_spec, "", "MP_SPECULAR")
        g.out(orm, "R", "MP_AMBIENT_OCCLUSION")
    _set(m, "automatically_set_usage_in_editor", False)
    res = g.finish()
    res["substrate"] = substrate
    return m, res


def build_glass(path, flat=True, tinted=True, overwrite=False):
    """Kit glass (Ben Cloward's Substrate recipe [sf-K257zWh8]): Translucent Colored Transmittance
    (Grey when untinted, cheaper), Surface Translucency Volume, refraction by shape (Pixel Normal
    Offset for flat panes, IOR from F0 for enclosed shapes), slab Sub-Surface Type Simple Volume,
    Transmittance-To-MFP (colour + thickness 0.02), F0 0.04 (IOR 1.5), roughness 0.05 with a smudge
    lift. Frosted needs the project setting 'Substrate translucent material rough refraction'.
    NOT YET RUN IN UNREAL."""
    u = _u()
    m = new_material(path, overwrite=overwrite)
    bm = _enum_value("BlendMode", "BLEND_TRANSLUCENT_COLORED_TRANSMITTANCE" if tinted else "BLEND_TRANSLUCENT_GREY_TRANSMITTANCE")
    if bm is not None:
        _set(m, "blend_mode", bm)
    lm = _enum_value("TranslucencyLightingMode", "TLM_SURFACE")
    if lm is not None:
        _set(m, "translucency_lighting_mode", lm)
    rm = _enum_value("RefractionMode", "RM_PIXEL_NORMAL_OFFSET" if flat else "RM_INDEX_OF_REFRACTION_FROM_F0")
    if rm is not None:
        _set(m, ["refraction_method", "refraction_mode"], rm)
    g = Graph(m)
    slab = g.node("slab", 0, 0)
    sst = _enum_value("MaterialSubSurfaceType", "MSS_SIMPLE_VOLUME") if hasattr(u, "MaterialSubSurfaceType") else None
    if sst is not None:
        _set(slab, ["sub_surface_type", "subsurface_type"], sst)
    g.link(g.const(0.0, -600, -200), "", slab, "Diffuse Albedo")
    g.link(g.scalar("F0", round(ior_to_f0(1.5), 4), -600, -100, "Glass", 0), "", slab, "F0")
    rough = g.scalar("Roughness", 0.05, -900, 0, "Glass", 1)
    smudge = g.texture("Smudge", -900, 150, "SAMPLERTYPE_MASKS", "Glass", None, 2)
    lift = g.scalar("SmudgeRoughness", 0.2, -900, 350, "Glass", 3)
    sm = g.op("mul", smudge, lift, -600, 200, a_out="R")
    r2 = g.op("add", rough, sm, -400, 50)
    g.link(r2, "", slab, "Roughness")
    if tinted:
        t2m = g.node("t2mfp", -600, 450)
        g.link(g.vector("Tint", (0.85, 0.95, 0.93), -900, 450, "Glass", 4), "", t2m, "Transmittance Color")
        g.link(g.scalar("Thickness", 0.02, -900, 600, "Glass", 5), "", t2m, "Thickness")
        g.link(t2m, "MFP", slab, "SSS MFP")
    else:
        g.link(g.scalar("MFP", 1.0, -600, 450, "Glass", 4), "", slab, "SSS MFP")
    g.out(slab, "", "MP_FRONT_MATERIAL")
    _set(m, "automatically_set_usage_in_editor", False)
    return m, g.finish()


def build_screen(path, overwrite=False):
    """Emissive screen: Substrate Unlit BSDF is enough for a bare screen; this master keeps a glossy
    cover (slab, roughness 0.15) with Emissive = Content x Intensity x On, per-screen values through
    Custom Primitive Data (0 On, 1 IntensityScale) so one MI serves every screen [added design].
    Scrolling text smearing under TSR: the experimental Temporal Responsiveness node, masked to the
    text region, with r.Velocity.TemporalResponsiveness.Supported=1 and, on Nanite meshes, a small
    WPO (5.7, mat-upd); not built here (class name [verify] with probe()). The content math (scanlines,
    flicker) stays independent of the Content sample so it hides in the fetch latency (Tech Art Aid
    [y0QASid1v8w 00:46:03]). NOT YET RUN IN UNREAL."""
    m = new_material(path, overwrite=overwrite)
    g = Graph(m)
    content = g.texture("Content", -900, 0, "SAMPLERTYPE_COLOR", "Screen", None, 0)
    inten = g.scalar("EmissiveIntensity", 10.0, -900, 200, "Screen", 1)
    on = g.scalar("On", 1.0, -900, 300, "Screen", 2, cpd_index=0)
    iscale = g.scalar("IntensityScale", 1.0, -900, 400, "Screen", 3, cpd_index=1)
    e1 = g.op("mul", content, inten, -600, 100, a_out="RGB")
    e2 = g.op("mul", e1, on, -400, 150)
    e3 = g.op("mul", e2, iscale, -200, 200)
    if project_uses_substrate() is not False:
        slab = g.node("slab", 0, 0)
        g.link(g.const(0.0, -300, -200), "", slab, "Diffuse Albedo")
        g.link(g.const(0.04, -300, -100), "", slab, "F0")
        g.link(g.scalar("CoverRoughness", 0.15, -300, 0, "Screen", 4), "", slab, "Roughness")
        g.link(e3, "", slab, "Emissive Color")
        g.out(slab, "", "MP_FRONT_MATERIAL")
    else:
        g.out(e3, "", "MP_EMISSIVE_COLOR")
        g.out(g.scalar("CoverRoughness", 0.15, -300, 0, "Screen", 4), "", "MP_ROUGHNESS")
    _set(m, "automatically_set_usage_in_editor", False)
    return m, g.finish()


def build_decal(path, kind="grime", overwrite=False, mesh_decal=False):
    """Deferred decal master. kind: 'grime' (colour, roughness, opacity), 'markings' (atlas),
    'normal' (panel seams, normal only). Substrate: graph ends in Convert To Decal, blend mode
    Translucent (Grey Transmittance) or Alpha Composite (Substrate overview, Extras); the outputs
    connected decide what the DBuffer writes (decal_channels() reads them back for the receivers'
    Decal Response). Used with Static Mesh off unless mesh_decal (Nadro [wobQ8ZKQpbc 00:18:38];
    the mesh-decal exception is [added]). NOT YET RUN IN UNREAL."""
    m = new_material(path, overwrite=overwrite)
    _set(m, "automatically_set_usage_in_editor", False)
    if not mesh_decal:
        _set(m, "used_with_static_mesh", False)
    dom = _enum_value("MaterialDomain", ["MD_DEFERRED_DECAL"])
    if dom is not None:
        _set(m, "material_domain", dom)
    bm = _enum_value("BlendMode", "BLEND_TRANSLUCENT_GREY_TRANSMITTANCE")
    if bm is not None:
        _set(m, "blend_mode", bm)
    g = Graph(m)
    op = g.texture("Opacity", -900, 300, "SAMPLERTYPE_MASKS", "Decal", None, 1)
    opa = g.scalar("OpacityScale", 1.0, -900, 500, "Decal", 2)
    opm = g.op("mul", op, opa, -600, 350, a_out="R")
    substrate = project_uses_substrate() is not False
    if substrate:
        slab = g.node("slab", -300, 0)
        if kind in ("grime", "markings"):
            col = g.texture("Color", -900, -200, "SAMPLERTYPE_COLOR", "Decal", None, 0)
            g.link(col, "RGB", slab, "Diffuse Albedo")
            g.link(g.scalar("DecalRoughness", 0.8, -600, 0, "Decal", 3), "", slab, "Roughness")
        if kind == "normal":
            nm = g.texture("Normal", -900, -200, "SAMPLERTYPE_NORMAL", "Decal", None, 0)
            g.link(nm, "RGB", slab, "Normal")
        # opacity as Coverage Weight on the slab, then Convert To Decal last before Front Material
        # (Substrate overview: Extras nodes go last; Coverage Weight is presence) [verify pins]
        cov = g.node("weight", -150, 0)
        g.link(slab, "", cov, "A")
        g.link(opm, "", cov, "Weight")
        todecal = g.node("todecal", 0, 0)
        g.link(cov, "", todecal, "Decal")
        g.out(todecal, "", "MP_FRONT_MATERIAL")
    else:
        if kind in ("grime", "markings"):
            col = g.texture("Color", -900, -200, "SAMPLERTYPE_COLOR", "Decal", None, 0)
            g.out(col, "RGB", "MP_BASE_COLOR")
            g.out(g.scalar("DecalRoughness", 0.8, -600, 0, "Decal", 3), "", "MP_ROUGHNESS")
        if kind == "normal":
            nm = g.texture("Normal", -900, -200, "SAMPLERTYPE_NORMAL", "Decal", None, 0)
            g.out(nm, "RGB", "MP_NORMAL")
        g.out(opm, "", "MP_OPACITY")
    return m, g.finish()


# ---------------------------------------------------------------- instances
def make_instance(parent, path, scalars=None, vectors=None, textures=None, switches=None,
                  allow_static=False, overwrite=False):
    """Material Instance Constant under `parent` (a Material or MI). Static switches are refused
    unless allow_static (only the approved preset MIs set them: every unique set is a permutation,
    Lauf [wobQ8ZKQpbc 00:22:41]). MaterialEditingLibrary setters auto-update the instance in 5.7+."""
    u = _u()
    MEL = u.MaterialEditingLibrary
    if switches and not allow_static:
        raise ValueError("static switches on %s: set them on an approved preset parent instead (allow_static=True for presets)" % path)
    if u.EditorAssetLibrary.does_asset_exist(path) and not overwrite:
        raise RuntimeError("%s exists (version it before overwriting)" % path)
    folder, name = path.rsplit("/", 1)
    mi = u.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, u.MaterialInstanceConstant,
                                                            u.MaterialInstanceConstantFactoryNew())
    MEL.set_material_instance_parent(mi, parent)
    for k, v in (scalars or {}).items():
        MEL.set_material_instance_scalar_parameter_value(mi, k, float(v))
    for k, v in (vectors or {}).items():
        MEL.set_material_instance_vector_parameter_value(mi, k, u.LinearColor(*[float(c) for c in (list(v) + [1.0])[:4]]))
    for k, v in (textures or {}).items():
        tex = u.EditorAssetLibrary.load_asset(v) if isinstance(v, str) else v
        MEL.set_material_instance_texture_parameter_value(mi, k, tex)
    for k, v in (switches or {}).items():
        MEL.set_material_instance_static_switch_parameter_value(mi, k, bool(v))
    MEL.update_material_instance(mi)
    u.EditorAssetLibrary.save_loaded_asset(mi)
    return mi


def make_presets(master, folder, presets):
    """Approved static permutations as parent MIs, e.g. {'MI_Kit_Clean': {}, 'MI_Kit_Worn':
    {'UseWear': True}, 'MI_Kit_Hero': {'UseWear': True, 'UseDetailNormal': True}}. Children of these
    change only scalars, vectors and textures."""
    out = {}
    for name, sw in presets.items():
        out[name] = make_instance(master, folder.rstrip("/") + "/" + name, switches=sw, allow_static=bool(sw))
    return out


def set_cpd(component, index, value):
    """Custom Primitive Data on a primitive component: per-actor variation with no new MI and no
    new permutation (VTA [eBS3BOI5KnM 00:13:20]; Sumo per-actor wear [SAr7oPKsgLE 00:18:11])."""
    try:
        component.set_custom_primitive_data_float(int(index), float(value))
        return True
    except Exception as e:
        log("set_custom_primitive_data_float failed: %s" % e)
        return False


# ---------------------------------------------------------------- usage flags
def usage_flags(material):
    """Current usage flags of a Material (dict). For an MI returns its override flags if readable."""
    flags = {}
    for p in CANDIDATES["usage_props"]:
        v = _get(material, p)
        if v is not None:
            flags[p] = bool(v)
    return flags


_USAGE_ENUM = {  # usage property -> MaterialUsage member [verify]
    "used_with_skeletal_mesh": "MATUSAGE_SKELETAL_MESH", "used_with_nanite": "MATUSAGE_NANITE",
    "used_with_niagara_sprites": "MATUSAGE_NIAGARA_SPRITES", "used_with_niagara_ribbons": "MATUSAGE_NIAGARA_RIBBONS",
    "used_with_niagara_mesh_particles": "MATUSAGE_NIAGARA_MESH_PARTICLES", "used_with_clothing": "MATUSAGE_CLOTHING",
    "used_with_geometry_collections": "MATUSAGE_GEOMETRY_COLLECTIONS", "used_with_static_mesh": "MATUSAGE_STATIC_MESH",
    "used_with_morph_targets": "MATUSAGE_MORPH_TARGETS", "used_with_spline_meshes": "MATUSAGE_SPLINE_MESH",
}


def set_usage(obj, flag, value):
    """Set one usage flag. 5.8: set_base_material_usage is said to work on MIs (Lauf
    [wobQ8ZKQpbc 00:37:09], [verify signature]); fallback set_material_usage / set_editor_property
    on a Material. Returns the path used, or None."""
    u = _u()
    MEL = u.MaterialEditingLibrary
    usage = _enum_value("MaterialUsage", [_USAGE_ENUM.get(flag, "")])
    if hasattr(MEL, "set_base_material_usage") and usage is not None:
        try:
            MEL.set_base_material_usage(obj, usage, bool(value))
            return "set_base_material_usage"
        except Exception as e:
            log("set_base_material_usage: %s" % e)
    if value and hasattr(MEL, "set_material_usage") and usage is not None:
        try:
            MEL.set_material_usage(obj, usage)
            return "set_material_usage"
        except Exception as e:
            log("set_material_usage: %s" % e)
    return "set_editor_property" if _set(obj, flag, bool(value)) else None


# ---------------------------------------------------------------- graph export (bridge to lint_graph)
_EXPORT_PROPS = ("parameter_name", "default_value", "sampler_source", "sampler_type", "texture", "code",
                 "use_parameter_blending", "virtual_texture", "material_function", "layers", "r",
                 "use_custom_primitive_data", "primitive_data_index", "toon_profile", "sub_surface_type",
                 "collection")
_OUTPUT_PROPS = ("MP_BASE_COLOR", "MP_METALLIC", "MP_SPECULAR", "MP_ROUGHNESS", "MP_NORMAL", "MP_EMISSIVE_COLOR",
                 "MP_OPACITY", "MP_OPACITY_MASK", "MP_AMBIENT_OCCLUSION", "MP_WORLD_POSITION_OFFSET",
                 "MP_PIXEL_DEPTH_OFFSET", "MP_FRONT_MATERIAL", "MP_MATERIAL_ATTRIBUTES", "MP_REFRACTION")


def _plain(v):
    if isinstance(v, (bool, int, float, str)) or v is None:
        return v
    if isinstance(v, (list, tuple)):
        return [_plain(x) for x in v]
    try:
        return _path(v) if hasattr(v, "get_path_name") else str(v)
    except Exception:
        return str(v)


def export_graph(material):
    """Walk the graph from every material output (and inputs of each node) into the plain dict that
    lint_graph() reads. Pin names come from get_material_expression_input_names when present;
    otherwise inputs are keyed 'in0', 'in1'... [verify ordering]. Material function contents are not
    walked; a function call is marked contains_texture_samples when its asset lists textures."""
    u = _u()
    MEL = u.MaterialEditingLibrary
    ids, nodes = {}, {}

    def nid(e):
        k = e.get_path_name() if hasattr(e, "get_path_name") else id(e)
        if k not in ids:
            ids[k] = "n%d" % len(ids)
        return ids[k]

    def visit(e):
        i = nid(e)
        if i in nodes:
            return i
        rec = {"class": e.get_class().get_name(), "props": {}, "inputs": {}}
        nodes[i] = rec
        for p in _EXPORT_PROPS:
            v = _get(e, p)
            if v is not None:
                rec["props"][p] = _plain(v)
        if rec["class"] == "MaterialExpressionLandscapeLayerBlend" and "layers" in rec["props"]:
            rec["props"]["layers"] = [{"layer_name": str(_get(l, "layer_name")), "blend_type": str(_get(l, "blend_type"))}
                                      for l in (_get(e, "layers") or [])]
        if rec["class"] == "MaterialExpressionMaterialFunctionCall":
            fn = _get(e, ["material_function", "function"])
            try:
                used = MEL.get_material_function_used_textures(fn) if fn is not None and hasattr(MEL, "get_material_function_used_textures") else []
            except Exception:
                used = []
            rec["props"]["contains_texture_samples"] = bool(used)
            rec["props"]["function_textures"] = len(set(_path(t) for t in used))   # a floor: open it to count samples
            rec["props"]["function_path"] = _path(fn) if fn is not None else None
        try:
            ins = list(MEL.get_inputs_for_material_expression(material, e))
        except Exception:
            ins = []
        try:
            names = [str(x) for x in MEL.get_material_expression_input_names(e)]
        except Exception:
            names = []
        for k, src in enumerate(ins):
            if src is None:
                continue
            pin = names[k] if k < len(names) else "in%d" % k
            rec["inputs"][pin] = visit(src)
        return i

    outputs = {}
    for p in _OUTPUT_PROPS:
        prop = getattr(u.MaterialProperty, p, None)
        if prop is None:
            continue
        try:
            e = MEL.get_material_property_input_node(material, prop)
        except Exception:
            e = None
        if e is not None:
            outputs[p] = visit(e)
    g = {"path": _path(material), "nodes": nodes, "outputs": outputs,
         "domain": str(_get(material, "material_domain")), "blend_mode": str(_get(material, "blend_mode")),
         "translucency_lighting_mode": str(_get(material, "translucency_lighting_mode")),
         "refraction_method": str(_get(material, ["refraction_method", "refraction_mode"])),
         "usage": usage_flags(material),
         "automatically_set_usage_in_editor": bool(_get(material, "automatically_set_usage_in_editor", False)),
         "shading": "substrate" if "MP_FRONT_MATERIAL" in outputs else "legacy"}
    return g


def material_stats(material):
    """get_statistics fields (instruction counts are context, never the verdict: Tech Art Aid)."""
    MEL = _mel()
    out = {}
    try:
        s = MEL.get_statistics(material)
    except Exception as e:
        return {"error": str(e)}
    for f in ("num_vertex_shader_instructions", "num_pixel_shader_instructions", "num_samplers",
              "num_vertex_texture_samples", "num_pixel_texture_samples", "num_virtual_texture_samples",
              "num_uv_scalars", "num_interpolator_scalars"):
        v = _get(s, f)
        if v is None:
            v = getattr(s, f, None)
        if v is not None:
            out[f] = int(v)
    return out


def shader_count(material_or_mi):
    """Length of MaterialEditingLibrary.list_shaders (5.8), an upper bound (Nadro [wobQ8ZKQpbc
    00:18:57]). Returns (count, [(vertex_factory, shader_type)] sample) or (None, error)."""
    MEL = _mel()
    if not hasattr(MEL, "list_shaders"):
        return None, "list_shaders not exposed to Python [verify]"
    try:
        shaders = list(MEL.list_shaders(material_or_mi))
    except Exception as e:
        return None, str(e)
    sample = []
    for s in shaders[:20]:
        vf = _get(s, ["vertex_factory_type", "vertex_factory_name"], "")
        st = _get(s, ["shader_type", "shader_type_name"], "")
        sample.append((str(vf), str(st)))
    return len(shaders), sample


# ---------------------------------------------------------------- census in the editor
def _root_of(mi):
    try:
        return mi.get_base_material()
    except Exception:
        p = _get(mi, "parent")
        while p is not None and p.get_class().get_name() != "Material":
            p = _get(p, "parent")
        return p


def instance_record(mi, asset_data=None):
    """census() record for one MI: effective static switch values (from the root's names),
    which of them this MI or its parents override [verify: override flags are not exposed by the
    getter, so an MI whose value differs from the root default counts as overriding], HSPR tag."""
    u = _u()
    MEL = u.MaterialEditingLibrary
    root = _root_of(mi)
    rec = {"path": _path(mi), "root": _path(root) if root is not None else None, "static_switches": {},
           "static_overrides": [], "component_masks": {}, "base_overrides": {}, "usage_overrides": {}, "hspr": None}
    names = []
    try:
        names = [str(n) for n in MEL.get_static_switch_parameter_names(root)] if root is not None else []
    except Exception:
        pass
    for n in names:
        try:
            v = MEL.get_material_instance_static_switch_parameter_value(mi, n)
            rec["static_switches"][n] = bool(v)
        except Exception:
            continue
    defaults = root_switch_defaults(root) if root is not None else {}
    rec["static_overrides"] = [k for k, v in rec["static_switches"].items() if k in defaults and v != defaults[k]]
    if asset_data is not None:
        tag = _asset_tag(asset_data, CANDIDATES["hspr_tags"])
        rec["hspr"] = _truthy(tag) if tag is not None else None
    bpo = _get(mi, "base_property_overrides")
    if bpo is not None:
        for f in ("override_blend_mode", "override_two_sided", "override_shading_model"):
            if _get(bpo, f):
                rec["base_overrides"][f] = True
    return rec


def root_switch_defaults(root):
    MEL = _mel()
    out = {}
    try:
        names = [str(n) for n in MEL.get_static_switch_parameter_names(root)]
    except Exception:
        return out
    getter = None
    for fname in ("get_material_default_static_switch_parameter_value", "get_static_switch_parameter_default_value"):
        if hasattr(MEL, fname):
            getter = getattr(MEL, fname)
            break
    for n in names:
        try:
            out[n] = bool(getter(root, n)) if getter else None
        except Exception:
            continue
    return {k: v for k, v in out.items() if v is not None}


def census_project(folder="/Game", roots=None, budget_keys=None, with_shaders=True):
    """Asset-registry pass over MIs under folder, loading each MI (Fortnite's advice is asset data
    first; the HSPR tag pre-filters, but switch values need the object). Returns census() output
    plus per-root shader counts from list_shaders on the root."""
    u = _u()
    u.AssetRegistryHelpers.get_asset_registry()
    recs, root_defaults, shaders = [], {}, {}
    for path in u.EditorAssetLibrary.list_assets(folder, recursive=True, include_folder=False):
        ad = u.EditorAssetLibrary.find_asset_data(path)
        try:
            cls = str(ad.asset_class_path.asset_name)
        except Exception:
            cls = str(getattr(ad, "asset_class", ""))
        if cls != "MaterialInstanceConstant":
            continue
        mi = u.EditorAssetLibrary.load_asset(path)
        rec = instance_record(mi, ad)
        if roots and rec["root"] not in roots:
            continue
        recs.append(rec)
        if rec["root"] and rec["root"] not in root_defaults:
            root = u.EditorAssetLibrary.load_asset(rec["root"])
            root_defaults[rec["root"]] = root_switch_defaults(root)
            if with_shaders:
                n, _ = shader_count(root)
                if n is not None:
                    shaders[rec["root"]] = n
    res = census(recs, root_defaults, shaders, budget_keys)
    res["_records"] = recs
    res["_ranking"] = {r: switch_ranking(recs, r) for r in root_defaults}
    return res


def instance_values(mi):
    """{'scalars': {name: float}, 'vectors': {name: (r, g, b)}} effective on one MI, for
    audit_instance_values(). Names come from the root material [verify getter names in 5.8]."""
    u = _u()
    MEL = u.MaterialEditingLibrary
    root = _root_of(mi)
    out = {"scalars": {}, "vectors": {}}
    for kind, names_fn, get_fn in (("scalars", "get_scalar_parameter_names", "get_material_instance_scalar_parameter_value"),
                                   ("vectors", "get_vector_parameter_names", "get_material_instance_vector_parameter_value")):
        if root is None or not hasattr(MEL, names_fn) or not hasattr(MEL, get_fn):
            continue
        try:
            names = [str(n) for n in getattr(MEL, names_fn)(root)]
        except Exception:
            names = []
        for n in names:
            try:
                v = getattr(MEL, get_fn)(mi, n)
            except Exception:
                continue
            if kind == "vectors":
                v = (float(getattr(v, "r", 0.0)), float(getattr(v, "g", 0.0)), float(getattr(v, "b", 0.0)))
            out[kind][n] = v if kind == "vectors" else float(v)
    return out


def audit_instance_values_project(folder="/Game", roles=None, classes=None):
    """audit_instance_values over every MI under folder. classes: {mi_path: material class} for the
    high-F0 exceptions (gem, semiconductor, carbon_fiber). Returns (findings, records)."""
    u = _u()
    recs = {}
    for path in u.EditorAssetLibrary.list_assets(folder, recursive=True, include_folder=False):
        ad = u.EditorAssetLibrary.find_asset_data(path)
        try:
            cls = str(ad.asset_class_path.asset_name)
        except Exception:
            cls = str(getattr(ad, "asset_class", ""))
        if cls != "MaterialInstanceConstant":
            continue
        mi = u.EditorAssetLibrary.load_asset(path)
        rec = instance_values(mi)
        if classes and _path(mi) in classes:
            rec["class"] = classes[_path(mi)]
        recs[_path(mi)] = rec
    return audit_instance_values(recs, roles), recs


def referencers_of(path):
    """Referencer descriptions for usage_needs(): class, Nanite, clothing, Niagara depth.
    Loads only StaticMesh / SkeletalMesh referencers (Lauf: asset data first, load when a property
    must be read)."""
    u = _u()
    out = []
    try:
        refs = list(u.EditorAssetLibrary.find_package_referencers_for_asset(path, False))
    except Exception as e:
        log("referencers %s: %s" % (path, e))
        return out
    for r in refs:
        r = str(r)
        ad = u.EditorAssetLibrary.find_asset_data(r)
        try:
            cls = str(ad.asset_class_path.asset_name)
        except Exception:
            cls = str(getattr(ad, "asset_class", ""))
        rec = {"class": cls, "path": r}
        if cls == "StaticMesh":
            sm = u.EditorAssetLibrary.load_asset(r)
            ns = _get(sm, "nanite_settings")
            rec["nanite"] = bool(_get(ns, "enabled", False)) if ns is not None else False
            for rr in (u.EditorAssetLibrary.find_package_referencers_for_asset(r, False) or []):
                ad2 = u.EditorAssetLibrary.find_asset_data(str(rr))
                try:
                    c2 = str(ad2.asset_class_path.asset_name)
                except Exception:
                    c2 = ""
                if c2 == "NiagaraSystem":
                    out.append({"class": "NiagaraSystem", "depth": 2, "path": str(rr)})
        elif cls == "SkeletalMesh":
            sk = u.EditorAssetLibrary.load_asset(r)
            rec["clothing_assets"] = len(_get(sk, "mesh_clothing_assets", []) or [])
        elif cls == "NiagaraSystem":
            rec["depth"] = 1
        out.append(rec)
    return out


# ---------------------------------------------------------------- landscape RVT and review board
def setup_landscape_rvt(landscape, rvt_path, material_type="BASE_COLOR_NORMAL_SPECULAR", tile_count=256,
                        tile_size=256, overwrite=False):
    """Create an RVT asset, a volume fitted to the landscape, and register the landscape as a writer
    (sort priority -1, Num LODs 0). Material wiring (RVT Output + Sample in the landscape material)
    is a separate graph step. Names [verify]; the volume's Set Bounds button has no known Python
    call, so bounds come from the landscape's bounds. NOT YET RUN IN UNREAL."""
    u = _u()
    if u.EditorAssetLibrary.does_asset_exist(rvt_path) and not overwrite:
        rvt = u.EditorAssetLibrary.load_asset(rvt_path)
    else:
        folder, name = rvt_path.rsplit("/", 1)
        factory = getattr(u, "RuntimeVirtualTextureFactory", None)
        rvt = u.AssetToolsHelpers.get_asset_tools().create_asset(name, folder, u.RuntimeVirtualTexture,
                                                                 factory() if factory else None)
    mt = _enum_value("RuntimeVirtualTextureMaterialType", [material_type])
    if mt is not None:
        _set(rvt, "material_type", mt)
    _set(rvt, ["tile_count", "size"], int(tile_count))
    _set(rvt, "tile_size", int(tile_size))
    u.EditorAssetLibrary.save_loaded_asset(rvt)
    eas = u.get_editor_subsystem(u.EditorActorSubsystem)
    origin, extent = landscape.get_actor_bounds(False)
    vol = eas.spawn_actor_from_class(u.RuntimeVirtualTextureVolume, origin, u.Rotator(0, 0, 0))
    comp = _get(vol, ["virtual_texture_component", "VirtualTextureComponent"])
    if comp is not None:
        _set(comp, "virtual_texture", rvt)
        _set(comp, ["bounds_align_actor", "bounds_source_actor"], landscape)
    try:  # the volume is a unit box scaled to the area in cm (Ben [ucuSaiDuqiM 00:21:05]); pivot [verify]
        vol.set_actor_scale3d(u.Vector(extent.x * 2.0, extent.y * 2.0, extent.z * 2.0))
    except Exception as e:
        log("volume scale: %s" % e)
    current = list(_get(landscape, "runtime_virtual_textures", []) or [])
    if rvt not in current:
        current.append(rvt)
        _set(landscape, "runtime_virtual_textures", current)
    _set(landscape, "translucency_sort_priority", -1)
    _set(landscape, "virtual_texture_num_lods", 0)
    return {"rvt": _path(rvt), "volume": _name(vol)}


def spawn_board(materials, mesh_path="/Engine/BasicShapes/Sphere.Sphere", spacing=150.0, origin=(0, 0, 100)):
    """One mesh per material in a row (shader-ball board) for screenshots. Returns actors."""
    u = _u()
    eas = u.get_editor_subsystem(u.EditorActorSubsystem)
    mesh = u.EditorAssetLibrary.load_asset(mesh_path)
    actors = []
    for i, mat in enumerate(materials):
        loc = u.Vector(origin[0] + i * spacing, origin[1], origin[2])
        a = eas.spawn_actor_from_class(u.StaticMeshActor, loc, u.Rotator(0, 0, 0))
        comp = a.static_mesh_component
        comp.set_static_mesh(mesh)
        m = u.EditorAssetLibrary.load_asset(mat) if isinstance(mat, str) else mat
        comp.set_material(0, m)
        a.set_actor_label("Board_%02d_%s" % (i, _name(m)))
        actors.append(a)
    return actors


def console(cmd):
    u = _u()
    world = None
    try:
        world = u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
    except Exception:
        pass
    u.SystemLibrary.execute_console_command(world, cmd)


def capture(path, width=1920, height=1080, camera=None):
    """Request a screenshot through scenario-unreal-expert's ue_review.screenshot (HighResShot fallback).
    Returns the absolute path at once: the file appears only after the editor ticks, so check it
    afterwards (agent side: ue_review.wait_for_file(path), then ue_review.review_images; latent
    job: yield from ue_review.wait_screenshot(req)). Never in a commandlet: it renders nothing."""
    path = os.path.abspath(path)
    try:
        import ue_review
        req = ue_review.screenshot(path, width, height, camera=camera)
        return req.get("path", path) if isinstance(req, dict) else (req or path)
    except ImportError:
        console('HighResShot %dx%d filename="%s"' % (width, height, path))
        return path


def audit_rules():
    """This skill's texture role table in the shape scenario-unreal-expert's ue_audit accepts
    (rules['texture_suffixes'] = {'_SUFFIX': (compression, srgb)}), so the generic audit and
    check_texture() agree. check_texture() stays the finer policy (NOH, CR, resident size, HDR)."""
    table = {}
    for sfx, role in SUFFIX_ROLE.items():
        spec = ROLES[role]
        table["_" + sfx] = (spec["allowed"][0], spec["srgb"])
    return {"texture_suffixes": table}


def emit(obj):
    """Print the job result line through ue_run.result when available (UE_RESULT {json})."""
    try:
        import ue_run
        return ue_run.result(obj)
    except (ImportError, AttributeError):
        print("UE_RESULT " + json.dumps(obj, default=str))
        return obj
