"""
mx_shade: look-dev building blocks for Maya 2027 + Arnold (MtoA 5.6.x).

STATUS: the Maya layer is NOT YET RUN IN MAYA (written 2026-09-24, Maya 2027 not installed).
The pure-Python layer (texture-set parsing, colour-space name resolution, Rec.709 to ACEScg
math, presets, Standard Surface to OpenPBR porting, displacement math, image headers,
framing math, the lint rules) ran offline: tests/code/maya-lookdev/test_mx_shade_offline.py.
The Maya layer's Python logic also ran end to end against a fake maya.cmds
(tests/code/maya-lookdev/test_jobs_fakemaya.py): that proves no typos or broken control flow,
nothing about Maya 2027 behaviour.
Attribute names go through candidate tables and fail loudly when none exists;
tests/code/maya-lookdev/job_00_probe_lookdev.py dumps the real 2027 names to fix the tables.

  import sys; sys.path.insert(0, "<skills>/scenario-maya-lookdev/scripts"); import mx_shade as sh
  ts = sh.parse_texture_set("/abs/textures")            # {"sets": {set: {channel: info}}, ...}
  rep = sh.build_material(ts["sets"]["case"], "case", meshes=["case_geo"])      # OpenPBR
  sh.apply_preset(rep["shader"], "steel_polished")       # F0 / F82 from the Arnold table
  sh.smudge_roughness(rep["shader"])                     # fingerprints and smudges on polish
  sh.add_displacement(rep["sg"], "/abs/case_disp.exr", ["case_geo"], scale=0.1, zero=0.0)
  ld = sh.lookdev_scene(["case_GRP"], hdri="/abs/studio.hdr", frames=24)
  sh.render_frames([1, 7, 13, 19, 25, 31, 37, 43], "/abs/out/turn")
  issues = sh.lint_scene(); sh.verdict(issues)
  sh.handoff_report("/abs/out/case_lookdev.json")

Headless through mx_run (scenario-maya-expert):
  python3 mx_run.py --plugins mtoa --scene in.ma --save-as out/in_ld.ma mx_shade.py -- \
      --build /abs/textures --name case --meshes case_geo
  python3 mx_run.py --plugins mtoa --scene out/in_ld.ma mx_shade.py -- --lint --json /abs/lint.json

Sources are cited as in <skills>/scenario-maya-lookdev/references/sources.md: OPBR (Arnold OpenPBR doc),
SS (Arnold Standard Surface, Hair, Displacement doc), CM (Maya 2027 colour management help),
WN25/WN27 (What's New), JHILL (mpk6IurOWbs), ARVID (cpMBRIWwghg), SARK (ZtEiVa3MPLg),
RAYC (vPHhVrxxThU), OPBRV (tEUiIBApw-U). [added] marks this toolkit's own defaults.
"""

__version__ = "0.1"  # Maya Expert Skills v0.1 (2026-09-24)
import glob
import json
import math
import os
import re
import shutil
import struct
import sys
import time

_HERE = os.path.dirname(os.path.abspath(__file__))
_EXPERT_SCRIPTS = os.path.normpath(os.path.join(_HERE, "..", "..", "scenario-maya-expert", "scripts"))
if os.path.isdir(_EXPERT_SCRIPTS) and _EXPERT_SCRIPTS not in sys.path:
    sys.path.append(_EXPERT_SCRIPTS)


def _mxr():
    """scenario-maya-expert's mx_review (PNG IO, contact sheets, camera math). Shared, not duplicated."""
    import mx_review
    return mx_review


# =========================================================================== texture sets
TEXTURE_EXTS = ("tx", "exr", "tif", "tiff", "png", "tga", "hdr", "jpg", "jpeg", "psd", "bmp")
EXT_PREFERENCE = ("exr", "tif", "tiff", "png", "tga", "psd", "bmp", "hdr", "jpg", "jpeg")
FLOAT_EXTS = ("exr", "hdr")
LOSSY_EXTS = ("jpg", "jpeg")

# channel: (aliases normalized to lowercase alphanumerics, role, grayscale)
CHANNELS = {
    "base_color": (("basecolor", "albedo", "diffuse", "diffusecolor", "color", "colour", "col", "diff",
                    "basecol"), "color", False),
    "roughness": (("roughness", "rough", "rgh"), "data", True),
    "metalness": (("metalness", "metallic", "metal"), "data", True),
    "normal": (("normal", "normalgl", "normalopengl", "nrm", "nor", "normalmap", "normaldx",
                "normaldirectx", "nrml"), "data", False),
    "height": (("height", "bump", "heightmap"), "data", True),
    "displacement": (("displacement", "disp", "displace", "dsp"), "data", True),
    "emission": (("emissive", "emission", "emit", "emissioncolor"), "color", False),
    "opacity": (("opacity", "alpha", "cutout"), "data", True),
    "ao": (("ao", "ambientocclusion", "occlusion", "mixedao", "aomap"), "data", True),
    "specular": (("specular", "specularlevel", "spec", "speclevel"), "data", True),
    "subsurface_color": (("subsurfacecolor", "sss", "scattercolor", "subsurface"), "color", False),
    "coat": (("coat", "clearcoat", "coatweight"), "data", True),
    "transmission": (("transmission", "transmissive"), "data", True),
    "packed_orm": (("orm", "occlusionroughnessmetallic", "arm", "aorm"), "data", False),
}
PACKED = {"packed_orm": {"R": "ao", "G": "roughness", "B": "metalness"}}
NORMAL_CONVENTION = {"normaldx": "directx", "normaldirectx": "directx",
                     "normalgl": "opengl", "normalopengl": "opengl"}

_ALIAS = {}
for _ch, (_aliases, _role, _gray) in CHANNELS.items():
    for _a in _aliases:
        _ALIAS[_a] = _ch
_ALIASES_BY_LEN = sorted(_ALIAS, key=len, reverse=True)
_UDIM_RE = re.compile(r"^(?P<stem>.+?)[._](?P<udim>1\d{3}|<udim>)$", re.I)


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def split_texture_name(filename):
    """'case_Roughness.1001.png' -> ('case_Roughness', 1001, 'png'). A <UDIM> token gives
    udim='token'. Returns None for names without an extension."""
    base = os.path.basename(filename)
    if "." not in base:
        return None
    stem, ext = base.rsplit(".", 1)
    udim = None
    m = _UDIM_RE.match(stem)
    if m:
        stem = m.group("stem")
        u = m.group("udim")
        udim = "token" if u.startswith("<") else int(u)
    return stem, udim, ext.lower()


def classify_stem(stem):
    """(channel, texture_set, alias) for a file stem, longest suffix match on tokens first
    ('leather_Base_Color' -> base_color, 'leather'), then on the joined name."""
    toks = [t for t in re.split(r"[_\-. ]+", stem) if t]
    for k in (3, 2, 1):
        if len(toks) < k:
            continue
        cand = _norm("".join(toks[-k:]))
        if cand in _ALIAS:
            return _ALIAS[cand], "_".join(toks[:-k]), cand
    n = _norm(stem)
    for a in _ALIASES_BY_LEN:
        if len(a) >= 4 and n.endswith(a) and len(n) > len(a):
            return _ALIAS[a], stem[:len(stem) - len(a)].rstrip("_-. "), a
    return None, stem, None


def parse_texture_set(source, prefer_tx=False):
    """Group texture files (a folder, non-recursive, or a list of paths) into texture sets.

    Returns {"sets": {set_name: {channel: info}}, "unmatched": [paths]}. info keys: channel,
    path (the file to load: the 1001 tile for UDIMs), pattern (with <UDIM>), tiles, udim, ext,
    source_ext (for .tx), role (color|data), gray, alias, normal_convention (opengl|directx|
    None), packed ({"R": "ao", ...} or None), tx (sibling .tx or None), alternatives.
    Painter's "$mesh_$textureSet_$channel(.$udim)" names, Unreal-style packed ORM, Mari-style
    "diffuse.1001.exr" and <UDIM> tokens are recognised [added]."""
    if isinstance(source, str):
        files = sorted(glob.glob(os.path.join(source, "*")))
    else:
        files = list(source)
    groups = {}          # (set, channel, alias) -> {ext: {"tiles": {udim: path}, "single": path}}
    unmatched = []
    for p in files:
        if os.path.isdir(p):
            continue
        sp = split_texture_name(p)
        if not sp or sp[2] not in TEXTURE_EXTS:
            continue
        stem, udim, ext = sp
        ch, tset, alias = classify_stem(stem)
        if not ch:
            unmatched.append(p)
            continue
        g = groups.setdefault((tset or "default", ch, alias, stem), {})
        e = g.setdefault(ext, {"tiles": {}, "single": None, "token": None})
        if udim == "token":
            e["token"] = p
        elif udim is None:
            e["single"] = p
        else:
            e["tiles"][udim] = p
    sets = {}
    for (tset, ch, alias, stem), by_ext in sorted(groups.items()):
        order = (["tx"] if prefer_tx else []) + list(EXT_PREFERENCE) + ["tx"]
        ext = next(e for e in order if e in by_ext)
        e = by_ext[ext]
        tiles = sorted(e["tiles"])
        if tiles:
            path = e["tiles"][tiles[0]]
            pattern = re.sub(r"([._])%d(\.[^.]+)$" % tiles[0], r"\1<UDIM>\2", path)
            udim = True
        elif e["token"]:
            path = pattern = e["token"]
            udim = True
        else:
            path = pattern = e["single"]
            udim = False
        src_ext = next((x for x in EXT_PREFERENCE if x in by_ext), None) if ext == "tx" else ext
        tx = None
        if "tx" in by_ext and ext != "tx":
            te = by_ext["tx"]
            tx = te["tiles"].get(tiles[0]) if tiles else te["single"]
        _, role, gray = CHANNELS[ch]
        info = {"channel": ch, "path": path, "pattern": pattern, "tiles": tiles, "udim": udim, "ext": ext,
                "source_ext": src_ext, "role": role, "gray": gray, "alias": alias,
                "normal_convention": NORMAL_CONVENTION.get(alias) if ch == "normal" else None,
                "packed": PACKED.get(ch), "tx": tx, "alternatives": [], "stem": stem}
        chans = sets.setdefault(tset, {})
        if ch in chans:                      # e.g. Normal_OpenGL and Normal_DirectX both exported
            keep, other = _prefer(chans[ch], info)
            keep["alternatives"].append(other["path"])
            chans[ch] = keep
        else:
            chans[ch] = info
    return {"sets": sets, "unmatched": unmatched}


def _prefer(a, b):
    """Pick one of two infos for the same channel: OpenGL normals over DirectX (Maya and
    Arnold read Y+ [added]), then the richer file type."""
    rank = {"opengl": 0, None: 1, "directx": 2}
    if a["channel"] == "normal" and rank[a["normal_convention"]] != rank[b["normal_convention"]]:
        return (a, b) if rank[a["normal_convention"]] < rank[b["normal_convention"]] else (b, a)
    ea = EXT_PREFERENCE.index(a["ext"]) if a["ext"] in EXT_PREFERENCE else 99
    eb = EXT_PREFERENCE.index(b["ext"]) if b["ext"] in EXT_PREFERENCE else 99
    return (a, b) if ea <= eb else (b, a)


# =========================================================================== colour spaces
SPACE_ROLES = ("srgb", "linear_srgb", "raw", "acescg")
SPACE_CANDIDATES = {
    # CM: default input role "sRGB Encoded Rec.709 (sRGB)" since 2026.2 (was "sRGB")
    "srgb": ("sRGB Encoded Rec.709 (sRGB)", "sRGB", "srgb_texture", "Utility - sRGB - Texture",
             "sRGB - Texture", "Input - Generic - sRGB - Texture"),
    # CM spells it two ways in the 2027 help; both normalize to 'scenelinearrec709srgb'
    "linear_srgb": ("scene-linear Rec.709-sRGB", "scene-linear Rec 709/sRGB", "Linear Rec.709 (sRGB)",
                    "lin_rec709", "lin_srgb", "Utility - Linear - sRGB", "Utility - Linear - Rec.709"),
    "raw": ("Raw", "Utility - Raw", "raw", "Non-Color"),
    "acescg": ("ACEScg", "ACES - ACEScg", "lin_ap1"),
}


def resolve_space(role, available):
    """Exact colour space name for a role in this config's input space list. Never hardcode a
    name (CM: 'query names, never hardcode'); raises LookupError with the list if nothing fits."""
    if role not in SPACE_CANDIDATES:
        raise ValueError("role must be one of %s" % (SPACE_ROLES,))
    avail = list(available or [])
    for c in SPACE_CANDIDATES[role]:
        if c in avail:
            return c
    by_norm = {}
    for a in avail:
        by_norm.setdefault(_norm(a), a)
    for c in SPACE_CANDIDATES[role]:
        if _norm(c) in by_norm:
            return by_norm[_norm(c)]
    passes = []
    if role == "raw":
        passes = [lambda n: n in ("raw", "utilityraw", "noncolor", "data")]
    elif role == "srgb":
        passes = [lambda n: "srgb" in n and "linear" not in n and ("rec709" in n or "texture" in n),
                  lambda n: "srgb" in n and "linear" not in n and not n.startswith("lin")]
    elif role == "linear_srgb":
        passes = [lambda n: ("rec709" in n or "srgb" in n) and ("linear" in n or n.startswith("lin"))]
    elif role == "acescg":
        passes = [lambda n: "acescg" in n]
    for test in passes:
        for a in avail:
            if test(_norm(a)):
                return a
    raise LookupError("no %s colour space among: %s" % (role, avail))


def space_role_for(channel_role, ext, source_ext=None):
    """Input space role for a texture: data maps Raw; colour maps sRGB when 8/16-bit, linear
    Rec.709 when EXR/HDR (CM 'EXR ... almost always scene-linear Rec 709/sRGB'). A .tx takes
    the role of the file it was made from (source_ext) [added]."""
    if channel_role == "data":
        return "raw"
    e = (source_ext or ext or "").lower()
    return "linear_srgb" if e in FLOAT_EXTS else "srgb"


# Linear Rec.709 (D65) to ACEScg (AP1, D60), Bradford-adapted [added: the matrix used by the
# ACES OCIO configs]. The Arnold OpenPBR metal table is "sRGB linear"; Maya colour swatches are
# rendering-space numbers (CM), so under ACEScg the table values must be converted.
REC709_TO_ACESCG = ((0.6130974024, 0.3395231462, 0.0473794514),
                    (0.0701937217, 0.9163538791, 0.0134523991),
                    (0.0206155951, 0.1095697729, 0.8698146321))


def _mat_vec(m, v):
    return tuple(m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2] for i in range(3))


def _mat_inv(m):
    a, b, c = m[0]
    d, e, f = m[1]
    g, h, i = m[2]
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    return ((( e * i - f * h) / det, -(b * i - c * h) / det, (b * f - c * e) / det),
            (-(d * i - f * g) / det, (a * i - c * g) / det, -(a * f - c * d) / det),
            (( d * h - e * g) / det, -(a * h - b * g) / det, (a * e - b * d) / det))


def rec709_to_acescg(rgb):
    return _mat_vec(REC709_TO_ACESCG, rgb)


def acescg_to_rec709(rgb):
    return _mat_vec(_mat_inv(REC709_TO_ACESCG), rgb)


def convert_linear_rec709(rgb, rendering_space):
    """(converted rgb, method) for a linear Rec.709 colour typed into a swatch."""
    n = _norm(rendering_space)
    if "acescg" in n or "ap1" in n:
        return rec709_to_acescg(rgb), "matrix Rec.709 to ACEScg"
    if ("rec709" in n or "srgb" in n) and ("linear" in n or n.startswith("lin")):
        return tuple(rgb), "identity (rendering space is linear Rec.709)"
    raise ValueError("no built-in conversion to rendering space %r: use OCIO" % rendering_space)


def srgb8_to_linear(v):
    c = v / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


# =========================================================================== presets
# Arnold OpenPBR doc, Base > Metalness: F0 (base_color) and F82 tint (specular_color), linear sRGB.
METALS_OPENPBR = {
    "aluminium": ((0.916, 0.923, 0.924), (0.910, 0.936, 0.959)),
    "brass": ((0.962, 0.713, 0.464), (0.971, 0.994, 1.019)),
    "chromium": ((0.654, 0.685, 0.701), (0.688, 0.728, 0.798)),
    "copper": ((0.932, 0.623, 0.522), (0.982, 0.947, 0.945)),
    "gold": ((1.059, 0.773, 0.307), (0.971, 1.018, 0.994)),
    "iron": ((0.530, 0.513, 0.494), (0.765, 0.767, 0.802)),
    "nickel": ((0.697, 0.641, 0.563), (0.815, 0.834, 0.871)),
    "platinum": ((0.765, 0.730, 0.676), (0.793, 0.815, 0.840)),
    "silver": ((0.991, 0.985, 0.974), (0.994, 0.995, 0.998)),
    "steel": ((0.669, 0.639, 0.598), (0.789, 0.823, 0.870)),
    "titanium": ((0.441, 0.400, 0.361), (0.865, 0.906, 0.946)),
    "zinc": ((0.808, 0.844, 0.865), (0.762, 0.833, 0.896)),
}
# Arnold Standard Surface doc, Metalness table: base color / specular color. Differs from the
# OpenPBR table on purpose (different Fresnel model); steel, chromium, titanium absent.
METALS_STANDARD = {
    "aluminium": ((0.912, 0.914, 0.920), (0.970, 0.979, 0.988)),
    "copper": ((0.926, 0.721, 0.504), (0.996, 0.957, 0.823)),
    "gold": ((0.944, 0.776, 0.373), (0.998, 0.981, 0.751)),
    "iron": ((0.531, 0.512, 0.496), (0.571, 0.540, 0.586)),
    "lead": ((0.632, 0.626, 0.641), (0.803, 0.808, 0.862)),
    "mercury": ((0.781, 0.779, 0.779), (0.879, 0.910, 0.941)),
    "nickel": ((0.649, 0.610, 0.541), (0.797, 0.801, 0.789)),
    "platinum": ((0.679, 0.642, 0.588), (0.785, 0.789, 0.784)),
    "silver": ((0.962, 0.949, 0.922), (0.999, 0.998, 0.998)),
}
COLOR_KEYS = ("base_color", "specular_color", "transmission_color", "transmission_scatter",
              "subsurface_color", "coat_color", "fuzz_color", "emission_color", "flake_color",
              "specular_flip_flop", "flake_flip_flop")
POLISHED_METAL_ROUGHNESS = 0.05      # [added] inside the 0 to 0.15 polished range of the digest


def _p(values, source, added=(), requires=(), notes="", units=None, metal=None):
    return {"values": dict(values), "source": source, "added": list(added), "requires": list(requires),
            "notes": notes, "units": dict(units or {}), "metal": metal}


PRESETS = {}
for _m, (_f0, _f82) in METALS_OPENPBR.items():
    PRESETS["metal_" + _m] = _p(
        {"base_weight": 1.0, "base_metalness": 1.0, "base_color": _f0, "specular_color": _f82,
         "specular_weight": 1.0, "specular_roughness": POLISHED_METAL_ROUGHNESS, "coat_weight": 0.0},
        "OPBR Base Metalness table (F0, F82); OPBRV 00:02:51", added=["specular_roughness"],
        notes="IOR is ignored for metals (OPBR). Break up roughness with a ranged noise (ARVID).",
        metal=_m)
PRESETS["steel_polished"] = dict(PRESETS["metal_steel"])
PRESETS["steel_brushed"] = _p(
    dict(PRESETS["metal_steel"]["values"], specular_roughness=0.15, specular_roughness_anisotropy=0.5),
    "OPBR steel; ARVID 00:15:43 (brake disc roughness about 0.15, anisotropy up, specular samples 3)",
    added=["specular_roughness_anisotropy"], metal="steel",
    requires=["rotation or tangent direction for the brushing", "UVs", "aiSubdivSmoothDerivs 1 and at least "
              "1 subdivision iteration (SS Specular Anisotropy)", "roughness above 0 (ARVID 00:15:12)"])
PRESETS["mirror_chrome_ball"] = _p(
    {"base_weight": 1.0, "base_metalness": 1.0, "base_color": (1.0, 1.0, 1.0), "specular_roughness": 0.0,
     "specular_color": (1.0, 1.0, 1.0), "coat_weight": 0.0},
    "OPBR Base Metalness: mirror = metalness 1, roughness 0, base colour and weight 1")
PRESETS["grey_ball"] = _p(
    {"base_weight": 1.0, "base_color": (0.18, 0.18, 0.18), "base_metalness": 0.0, "specular_weight": 0.0,
     "base_diffuse_roughness": 0.0},
    "RAYC 00:38:03 (Lambert grey ball); 18 percent grey [added, many studios]", added=["base_color",
                                                                                       "specular_weight"],
    notes="Raycast used 0.5 ('I think'). Decider: the studio convention; record it in the scene.")
PRESETS["chart_diffuse"] = _p({"base_weight": 1.0, "specular_weight": 0.0, "base_metalness": 0.0},
                              "RAYC description: the chart must be a diffuse (Lambert) shader, not a surface "
                              "shader, so it reacts to light")
PRESETS["glass_clear"] = _p(
    {"transmission_weight": 1.0, "specular_roughness": 0.0, "specular_ior": 1.5, "base_metalness": 0.0,
     "transmission_color": (1.0, 1.0, 1.0)},
    "OPBR Transmission; ARVID 00:17:40", requires=["transmission_depth scaled to the object (set_transmission_"
                                                   "depth)", "GITransmissionDepth >= interfaces crossed"])
PRESETS["glass_tinted"] = _p(
    dict(PRESETS["glass_clear"]["values"], transmission_color=(0.9, 0.95, 0.93)),
    "ARVID 00:18:13 (light tint, lower depth to deepen); OPBR Transmission Color (saturated = infinite "
    "density)", added=["transmission_color"], requires=["transmission_depth: lower it to deepen the tint"])
PRESETS["sapphire_crystal"] = _p(
    {"transmission_weight": 1.0, "specular_roughness": 0.0, "specular_ior": 1.77, "base_metalness": 0.0,
     "transmission_color": (1.0, 1.0, 1.0), "transmission_dispersion_abbe_number": 72.0,
     "transmission_dispersion_scale": 0.0},
    "digest P9 (IOR about 1.77); OPBR Dispersion", added=["specular_ior", "transmission_dispersion_abbe_number",
                                                          "transmission_dispersion_scale"],
    notes="Real sapphire Abbe is about 72 [added]; the OPBR page prints '92 (sapphire preset)'. Dispersion is "
          "left off for a flat watch crystal: parallel faces send every wavelength out parallel to where it came in, "
          "so the fringe is invisible at crystal thickness [added optics; OPBR checklist 'gems only']. Turn "
          "dispersion_scale up (small) for faceted gems or a bevelled crystal edge seen close (digest P9), and pay "
          "for it in AA or transmission samples.")
PRESETS["diamond"] = _p(
    {"transmission_weight": 1.0, "specular_roughness": 0.0, "specular_ior": 2.42, "base_metalness": 0.0,
     "transmission_dispersion_abbe_number": 55.0, "transmission_dispersion_scale": 1.0},
    "OPBR Dispersion (Abbe 55 = diamond preset)", added=["specular_ior", "transmission_dispersion_scale"],
    notes="Dispersion costs camera AA or transmission samples (OPBR Dispersion tip).")
PRESETS["water"] = _p({"transmission_weight": 1.0, "specular_roughness": 0.0, "specular_ior": 1.33,
                       "base_metalness": 0.0}, "OPBR Transmission", added=["specular_ior"])
PRESETS["skin"] = _p(
    {"subsurface_weight": 1.0, "subsurface_radius_scale": (1.0, 0.35, 0.2), "specular_ior": 1.4,
     "base_metalness": 0.0},
    "OPBR Radius Scale; JHILL 00:17:25, 00:18:31, 00:19:36", units={"subsurface_radius": ("mm", 1.0)},
    requires=["base colour map into subsurface_color (JHILL 00:16:53)", "closed mesh, outward normals (SS)",
              "real-world scale"],
    notes="J Hill: 1 mm mean free path (scale 0.1 in a cm scene). The SS doc example is 3.7, 1.4, 0.7 mm, "
          "about 3.7 times deeper: decide with the ear backlight and nose waxiness test.")
PRESETS["skin_oil_coat"] = _p({"coat_roughness": 0.1, "coat_ior": 1.33},
                              "JHILL 00:32:49 (coat roughness about 0.1, IOR 'like water')", added=["coat_ior"],
                              requires=["coat_weight driven by the inverted roughness map (coat_mask_from_"
                                        "roughness)"])
PRESETS["leather"] = _p({"specular_roughness": 0.2, "base_metalness": 0.0},
                        "ARVID 00:05:05 (roughness about 0.2)",
                        requires=["alligator cell noise bump, scale 400 to 500, very subtle (noise_bump)",
                                  "base colour from reference"])
PRESETS["rubber"] = _p({"base_color": (0.03, 0.03, 0.03), "specular_roughness": 0.3, "base_metalness": 0.0},
                       "ARVID 00:06:25 (linear base 0.01 to 0.04), 00:10:47 (roughness 0.2 to 0.4)",
                       added=["base_color", "specular_roughness"],
                       requires=["roughness_breakup(lo=0.2, hi=0.4, scale 10 to 20)"])
PRESETS["stone"] = _p({"base_diffuse_roughness": 0.8, "base_metalness": 0.0},
                      "OPBR Base Diffuse Roughness ('high = concrete, plaster, sand')", added=["base_diffuse_roughness"],
                      requires=["large-scale roughness variation", "fine bump"])

# aiStandardHair: Arnold Standard Hair doc (HAIR). Melanin 0.2 blonde, 0.5 red/brown, 1.0 black;
# roughness 0.2; IOR 1.55; shift 0 to 10 degrees (measured 2.3 to 3.7); diffuse 0; tints white.
HAIR_PRESETS = {
    "black": {"melanin": 1.0}, "brown": {"melanin": 0.5}, "red": {"melanin": 0.5},
    "blonde": {"melanin": 0.2}, "textured": {"melanin": 0.0},
}
HAIR_BASE = {"base_weight": 1.0, "base_color": (1.0, 1.0, 1.0), "roughness": 0.2, "ior": 1.55, "shift": 3.0,
             "diffuse": 0.0, "specular_tint": (1.0, 1.0, 1.0), "specular2_tint": (1.0, 1.0, 1.0),
             "transmission_tint": (1.0, 1.0, 1.0)}


def preset(name):
    if name not in PRESETS:
        raise KeyError("unknown preset %s; known: %s" % (name, sorted(PRESETS)))
    return PRESETS[name]


# =========================================================================== Standard Surface <-> OpenPBR
def openpbr_to_standard(values, metal=None):
    """Translate canonical OpenPBR values to aiStandardSurface canonical keys (ss_* keys carry
    Standard Surface semantics). Returns (values, notes). OPBR vs SS: thin film micrometers vs
    nanometers; emission nits vs weight (1000 nits = 1, WN25); SSS radius roles swapped;
    dispersion scale 0 = off vs Abbe 0 = off; fuzz is sheen; metals need the SS table."""
    out, notes = {}, []
    v = dict(values)
    if metal and v.get("base_metalness", 0) >= 0.99:
        if metal in METALS_STANDARD:
            v["base_color"], v["specular_color"] = METALS_STANDARD[metal]
            notes.append("metal colours from the Standard Surface table (%s)" % metal)
        else:
            notes.append("no Standard Surface table entry for %s: OpenPBR F0/F82 used as an approximation; "
                         "prefer OpenPBR for this metal" % metal)
    for k, val in v.items():
        if k == "thin_film_thickness":
            out["ss_thin_film_thickness_nm"] = val * 1000.0
        elif k == "thin_film_weight":
            notes.append("Standard Surface has no thin film weight: thickness 0 disables it")
        elif k == "emission_luminance":
            out["ss_emission_weight"] = val / 1000.0
        elif k == "subsurface_radius":
            out["ss_subsurface_scale"] = val
        elif k == "subsurface_radius_scale":
            out["ss_subsurface_radius_rgb"] = val
        elif k == "transmission_dispersion_scale":
            continue
        elif k == "transmission_dispersion_abbe_number":
            out[k] = val if v.get("transmission_dispersion_scale", 0) > 0 else 0.0
        elif k == "coat_darkening":
            notes.append("coat_darkening has no Standard Surface equivalent (coatAffectColor is manual)")
        elif k in ("specular_ior",) and v.get("base_metalness", 0) >= 0.99:
            continue
        else:
            out[k] = val
    return out, notes


def port_standard_to_openpbr(ss):
    """aiStandardSurface attribute values (Maya names) to canonical OpenPBR values. Returns
    (values, notes). Use it to check a converted scene (menu 'Convert All Standard Surface to
    OpenPBR Surface', WN27 MTOA-2560) and to port tutorial values."""
    out, notes = {}, []
    simple = {"base": "base_weight", "baseColor": "base_color", "diffuseRoughness": "base_diffuse_roughness",
              "metalness": "base_metalness", "specular": "specular_weight", "specularColor": "specular_color",
              "specularRoughness": "specular_roughness", "specularIOR": "specular_ior",
              "specularAnisotropy": "specular_roughness_anisotropy", "transmission": "transmission_weight",
              "transmissionColor": "transmission_color", "transmissionDepth": "transmission_depth",
              "transmissionScatter": "transmission_scatter", "subsurface": "subsurface_weight",
              "subsurfaceColor": "subsurface_color", "subsurfaceAnisotropy": "subsurface_scatter_anisotropy",
              "coat": "coat_weight", "coatColor": "coat_color", "coatRoughness": "coat_roughness",
              "coatIOR": "coat_ior", "sheen": "fuzz_weight", "sheenColor": "fuzz_color",
              "sheenRoughness": "fuzz_roughness", "thinFilmIOR": "thin_film_ior", "emissionColor": "emission_color",
              "opacity": "geometry_opacity", "thinWalled": "geometry_thin_walled",
              "dielectricPriority": "dielectric_priority"}
    for k, val in ss.items():
        if k in simple:
            out[simple[k]] = val
        elif k == "thinFilmThickness":
            out["thin_film_thickness"] = val / 1000.0
            if val > 0:
                out["thin_film_weight"] = 1.0
            notes.append("thin film nm to micrometers (/1000); MtoA 5.6.0 thin film energy change can shift "
                         "hue (WN27)")
        elif k == "emission":
            out["emission_luminance"] = val * 1000.0
        elif k == "subsurfaceRadius":
            out["subsurface_radius_scale"] = val
        elif k == "subsurfaceScale":
            out["subsurface_radius"] = val
        elif k == "transmissionDispersion":
            out["transmission_dispersion_abbe_number"] = val if val > 0 else 20.0
            out["transmission_dispersion_scale"] = 1.0 if val > 0 else 0.0
        elif k in ("coatAffectColor", "coatAffectRoughness"):
            notes.append("%s dropped: OpenPBR coat darkening (default 1) is the physical version" % k)
        elif k == "subsurfaceType":
            notes.append("subsurfaceType has no OpenPBR equivalent in the saved docs [verify]")
        else:
            notes.append("not ported: %s" % k)
    if out.get("base_metalness", 0) >= 0.99:
        notes.append("metal: Standard Surface colours do not carry over; set F0/F82 from METALS_OPENPBR (OPBR)")
    if "geometry_opacity" in out and isinstance(out["geometry_opacity"], (list, tuple)):
        out["geometry_opacity"] = sum(out["geometry_opacity"]) / 3.0
    return out, notes


# =========================================================================== displacement math
DEFAULT_MAX_POLYS = 20000000          # [added] refuse subdivision above this many polygons per shape


def infer_zero_value(path):
    """(zero value, reason). JHILL 00:26:59: 0.5 for mid-grey maps, 0 for a zero-baked float
    EXR. Inferred from the file type: always confirm against the bake settings."""
    ext = (path or "").rsplit(".", 1)[-1].lower()
    if ext in FLOAT_EXTS:
        return 0.0, "float map (%s): assumed baked with zero at 0 (ZBrush/Mudbox 32-bit style)" % ext
    if ext in ("tif", "tiff", "tx"):
        return 0.5, "%s: assumed an integer map with mid-grey zero; set zero=0 for a 32-bit float bake" % ext
    return 0.5, "integer map (%s): mid-grey is zero" % ext


def subdiv_polys(faces, iterations):
    """SS Subdivision Iterations: each iteration quadruples the polygon count."""
    return int(faces) * 4 ** int(iterations)


def bounds_padding(scale, zero, value_range=(0.0, 1.0), height=1.0, margin=1.1):
    """Largest displacement distance times a margin [added]. SS Bounds Padding: the shader gives
    the final displacement, the padding is set to contain it (too low clips, too high is slow)."""
    lo, hi = value_range
    return max(abs(hi - zero), abs(zero - lo)) * abs(scale * height) * margin


# =========================================================================== image headers
def image_info(path):
    """Width, height, channels and alpha for PNG, OpenEXR and Radiance HDR headers (pure Python).
    Unknown formats return {"format": ext} only."""
    ext = path.rsplit(".", 1)[-1].lower()
    info = {"format": ext}
    try:
        with open(path, "rb") as f:
            head = f.read(65536)
    except (IOError, OSError) as exc:
        info["error"] = str(exc)
        return info
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        w, h, depth, ctype = struct.unpack(">IIBB", head[16:26])
        alpha = ctype in (4, 6)
        pos = 8
        while pos + 8 <= len(head):
            ln, tag = struct.unpack(">I4s", head[pos:pos + 8])
            if tag == b"tRNS":
                alpha = True
            if tag in (b"IDAT", b"IEND"):
                break
            pos += 12 + ln
        info.update(format="png", width=w, height=h, bit_depth=depth,
                    channels={0: 1, 2: 3, 3: 3, 4: 2, 6: 4}.get(ctype), alpha=alpha)
    elif head[:4] == b"\x76\x2f\x31\x01":
        try:
            info.update(_exr_header(head))
        except (ValueError, struct.error) as exc:
            info.update(format="exr", error="header parse: %s" % exc)
    elif head[:2] == b"#?":
        text = head.decode("latin-1", "replace")
        m = re.search(r"\n\s*\n([-+][YX])\s+(\d+)\s+([-+][YX])\s+(\d+)", text)
        if m:
            a, b = int(m.group(2)), int(m.group(4))
            w, h = (b, a) if "Y" in m.group(1) else (a, b)
            info.update(format="hdr", width=w, height=h, channels=3, alpha=False)
    return info


def _exr_header(head):
    pos = 8
    chans, dw = [], None
    while pos < len(head):
        end = head.index(b"\0", pos)
        name = head[pos:end].decode("latin-1")
        if not name:
            break
        tend = head.index(b"\0", end + 1)
        atype = head[end + 1:tend].decode("latin-1")
        size = struct.unpack("<i", head[tend + 1:tend + 5])[0]
        val = head[tend + 5:tend + 5 + size]
        if name == "channels" and atype == "chlist":
            p = 0
            while p < len(val) and val[p:p + 1] != b"\0":
                e = val.index(b"\0", p)
                ptype = struct.unpack("<i", val[e + 1:e + 5])[0]
                chans.append((val[p:e].decode("latin-1"), {0: "uint", 1: "half", 2: "float"}.get(ptype, ptype)))
                p = e + 1 + 16                      # pixel type, pLinear, 3 reserved, x and y sampling
        elif name == "dataWindow" and atype == "box2i":
            dw = struct.unpack("<iiii", val[:16])
        pos = tend + 5 + size
    out = {"format": "exr", "channels": [c for c, _ in chans],
           "pixel_types": sorted(set(str(t) for _, t in chans)),
           "alpha": any(c == "A" or c.endswith(".A") for c, _ in chans)}
    if dw:
        out.update(width=dw[2] - dw[0] + 1, height=dw[3] - dw[1] + 1)
    return out


def write_rgbe_hdr(path, width, height, pixel):
    """Write a flat (uncompressed) Radiance RGBE file. pixel(x, y) -> (r, g, b) linear, y=0 top."""
    out = bytearray(b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y %d +X %d\n" % (height, width))
    for y in range(height):
        for x in range(width):
            r, g, b = pixel(x, y)
            m = max(r, g, b)
            if m < 1e-32:
                out += b"\0\0\0\0"
                continue
            mant, e = math.frexp(m)
            s = mant * 256.0 / m
            out += bytes((int(r * s), int(g * s), int(b * s), e + 128))
    with open(path, "wb") as f:
        f.write(bytes(out))
    return path


def studio_hdr_pixel(width, height, key=8.0, top=4.0, floor=0.02):
    """Procedural lat-long studio [added]: dark floor, grey sky gradient, two tall softbox strips
    at +-60 degrees azimuth and a soft top light, all neutral. A stand-in when no HDRI is given,
    so chrome shows strips and the grey ball shows a key side. A real HDRI is preferred."""
    def px(x, y):
        az = (x + 0.5) / width * 360.0 - 180.0
        el = 90.0 - (y + 0.5) / height * 180.0
        if el < 0:
            v = floor
        else:
            v = 0.08 + 0.12 * (el / 90.0)
            for c in (-60.0, 60.0):
                if abs(az - c) < 12.0 and 5.0 < el < 55.0:
                    v = key
            if el > 72.0:
                v = max(v, top)
        return (v, v, v)
    return px


# ColorChecker Classic, 24 patches, 8-bit sRGB, row-major from the top-left 'dark skin' [added:
# the widely published X-Rite values; for relative checks only, not a calibration target].
COLOR_CHECKER_SRGB8 = (
    (115, 82, 68), (194, 150, 130), (98, 122, 157), (87, 108, 67), (133, 128, 177), (103, 189, 170),
    (214, 126, 44), (80, 91, 166), (193, 90, 99), (94, 60, 108), (157, 188, 64), (224, 163, 46),
    (56, 61, 150), (70, 148, 73), (175, 54, 60), (231, 199, 31), (187, 86, 149), (8, 133, 161),
    (243, 243, 242), (200, 200, 200), (160, 160, 160), (122, 122, 121), (85, 85, 85), (52, 52, 52))


def write_color_checker(path, patch=40, gap=6):
    """6 x 4 chart PNG (8-bit sRGB) on a black frame. Returns (path, (w, h))."""
    cols, rows = 6, 4
    w, h = cols * patch + (cols + 1) * gap, rows * patch + (rows + 1) * gap
    buf = bytearray(b"\x14\x14\x14" * (w * h))
    for i, rgb in enumerate(COLOR_CHECKER_SRGB8):
        r, c = divmod(i, cols)
        x0, y0 = gap + c * (patch + gap), gap + r * (patch + gap)
        row = bytes(rgb) * patch
        for y in range(y0, y0 + patch):
            o = (y * w + x0) * 3
            buf[o:o + patch * 3] = row
    _mxr().write_png(path, w, h, buf, channels=3)
    return path, (w, h)


# =========================================================================== framing math
def frame_distance(radius, focal_mm, aperture_h_mm=36.0, aspect=16.0 / 9.0, margin=1.15):
    """Camera distance that fits a bounding sphere in both directions (film fit horizontal)."""
    hfov = 2.0 * math.atan(aperture_h_mm / 2.0 / focal_mm)
    vfov = 2.0 * math.atan(math.tan(hfov / 2.0) / aspect)
    return radius * margin / math.sin(min(hfov, vfov) / 2.0)


def ref_strip_layout(depth, focal_mm, aperture_h_mm=36.0, aspect=16.0 / 9.0, size=0.07):
    """Camera-space positions (camera looks down -Z) for the chrome ball, grey ball and chart in
    the lower-right corner at `depth` [added layout]. Returns {name: (x, y, z, radius_or_wh)}."""
    hw = depth * aperture_h_mm / 2.0 / focal_mm
    hh = hw / aspect
    s = size * hh
    chrome = (hw - 1.6 * s, -hh + 1.6 * s, -depth, s)
    grey = (hw - 4.0 * s, -hh + 1.6 * s, -depth, s)
    cw, ch = 4.8 * s, 3.2 * s
    chart = (grey[0] - 1.4 * s - cw / 2.0, -hh + 0.4 * s + ch / 2.0, -depth, (cw, ch))
    return {"chrome": chrome, "grey": grey, "chart": chart, "half_width": hw, "half_height": hh}


def turntable_keys(frames):
    """Asset spins over 1..N, then the HDRI over N+1..2N; 360 lands one frame past each range
    so the loop has no duplicate frame [added; RAYC 00:06:01 keys 360 on the last frame]."""
    n = int(frames)
    return {"asset": ((1, 0.0), (n + 1, 360.0)), "hdri": ((n + 1, 0.0), (2 * n + 1, 360.0)),
            "range": (1, 2 * n)}


# =========================================================================== lint (pure Python)
DEFAULT_NAME_RE = re.compile(r"^(openPBRSurface|aiStandardSurface|standardSurface|lambert|blinn|phong|"
                             r"file|place2dTexture|aiNormalMap|bump2d|displacementShader|aiImage|"
                             r"aiStandardHair|aiCarPaint|aiLayerShader|aiMixShader|surfaceShader)\d+"
                             r"(SG)?$")
INITIAL_NODES = ("initialShadingGroup", "initialParticleSE", "lambert1", "standardSurface1", "openPBRSurface1")
WEIGHT_KEYS = ("base_weight", "specular_weight", "transmission_weight", "subsurface_weight", "coat_weight",
               "fuzz_weight", "thin_film_weight")


def _iss(level, rule, node, msg, fix=None, source=None):
    return {"level": level, "rule": rule, "node": node, "msg": msg, "fix": fix, "source": source}


def lint(data, max_polys=DEFAULT_MAX_POLYS):
    """Rules over extract()'s plain data. Returns a list of issues {level error|warn|info,
    rule, node, msg, fix, source}. Pure Python, so every rule is testable without Maya."""
    issues = []
    rs = data.get("rendering_space") or ""
    acescg = "acescg" in _norm(rs)
    raw_names = set(data.get("raw_names") or ["Raw"])
    for f in data.get("files", []):
        node, cs, ext, role = f["node"], f.get("color_space"), f.get("ext", ""), f.get("role")
        is_raw = cs in raw_names
        if role == "data" and not is_raw:
            issues.append(_iss("error", "data_not_raw", node, "data map (%s) in %s, not Raw" % (
                ",".join(f.get("sinks_short", [])), cs), "colorSpace Raw + ignoreColorSpaceFileRules 1",
                "SARK 00:19:10; JHILL 00:21:10; CM"))
        if role == "color" and is_raw and ext not in FLOAT_EXTS + ("tx",):
            issues.append(_iss("error", "color_raw", node, "8/16-bit colour map tagged Raw: renders washed out",
                               "the sRGB input space", "RAYC 00:17:28"))
        if role in ("color", "env") and is_raw and ext in FLOAT_EXTS + ("tx",) and acescg:
            issues.append(_iss("warn", "linear_color_raw", node,
                               "%s colour input tagged Raw under ACEScg: read as ACEScg; a linear Rec.709 file "
                               "wants the scene-linear Rec.709-sRGB input space" % ext,
                               "resolve_space('linear_srgb')", "CM ACES Workflow; tx/hdr/exr rules tag Raw"))
        if role == "mixed":
            issues.append(_iss("warn", "mixed_role", node, "one file feeds both colour and data inputs",
                               "split into two file nodes with their own colour spaces", None))
        if cs and not f.get("ignore_rules"):
            issues.append(_iss("warn", "rules_can_reset", node, "Ignore Color Space File Rules is off: Reapply "
                               "Rules would reset %s" % cs, "ignoreColorSpaceFileRules 1", "CM"))
        if f.get("uses_out_alpha") and not f.get("alpha_is_luminance") and f.get("has_alpha") is not True:
            lvl = "error" if f.get("has_alpha") is False else "warn"
            issues.append(_iss(lvl, "outalpha_without_ail", node,
                               "outAlpha wired with Alpha Is Luminance off and no alpha channel %s: reads no data"
                               % ("(checked)" if lvl == "error" else "(unknown)"),
                               "alphaIsLuminance 1, or wire outColorR", "RAYC 00:19:14; SARK 00:20:17"))
        if ext in LOSSY_EXTS:
            issues.append(_iss("warn", "jpeg", node, "JPEG texture (compression artefacts)", "PNG, TIFF or EXR",
                               "SARK 00:07:14"))
        if f.get("exists") is False:
            issues.append(_iss("error", "missing_file", node, "file not found: %s" % f.get("path"), None, None))
        if f.get("name_has_udim") and not f.get("udim_mode"):
            issues.append(_iss("error", "udim_off", node, "UDIM file name but UV Tiling Mode is off: only tile "
                               "1001 renders", "uvTilingMode UDIM (Mari)", None))
        if f.get("normal_like") and f.get("direct_to_shader_normal"):
            issues.append(_iss("error", "normal_direct", node, "normal map wired straight into the shader "
                               "normal", "go through aiNormalMap or a tangent-space bump2d", "digest checklist"))
        if f.get("normal_like") and f.get("bump_interp") == 0:
            issues.append(_iss("warn", "normal_as_bump", node, "normal map read by bump2d in Bump mode",
                               "bumpInterp Tangent Space Normals, or aiNormalMap", "SARK 00:21:44"))
    shape_by = {s["shape"]: s for s in data.get("shapes", [])}
    for sh in data.get("shaders", []):
        node, fam, v, con = sh["node"], sh.get("family"), sh.get("values", {}), set(sh.get("connected", []))
        meshes = [shape_by[m] for m in sh.get("meshes", []) if m in shape_by]
        if sh.get("default_name") and node not in INITIAL_NODES:
            issues.append(_iss("warn", "default_name", node, "default shader name", "name <asset>_<part>_MTL",
                               "SARK 00:15:11; RAYC 00:15:47"))
        if fam in ("openpbr", "standard"):
            metal = (v.get("base_metalness") or 0) >= 0.99 and "base_metalness" not in con
            for k in WEIGHT_KEYS:
                if k == "specular_weight" and fam == "openpbr":
                    continue                       # OPBR: specular weight above 1 stays physical
                if isinstance(v.get(k), (int, float)) and v[k] > 1.0 + 1e-6 and k not in con:
                    issues.append(_iss("warn", "weight_over_1", node, "%s = %.3g breaks energy conservation" % (
                        k, v[k]), "keep weights in 0..1", "OPBR Energy Conservation"))
            for k in COLOR_KEYS:
                c = v.get(k)
                if isinstance(c, (list, tuple)) and k not in con and max(c) > 1.0 + 1e-6:
                    if metal and k in ("base_color", "specular_color"):
                        continue                   # the OPBR metal table itself has values above 1
                    issues.append(_iss("warn", "color_over_1", node, "%s above 1: %s" % (k, _fmt(c)),
                                       "colours in 0..1", "OPBR Energy Conservation"))
            if metal and fam == "openpbr":
                sc = v.get("specular_color")
                if isinstance(sc, (list, tuple)) and min(sc) > 0.999 and "specular_color" not in con:
                    issues.append(_iss("info", "metal_white_f82", node, "metal with a white F82 edge tint",
                                       "set specular_color from METALS_OPENPBR", "OPBRV 00:02:51"))
            if metal and (v.get("coat_weight") or 0) > 0 and "coat_weight" not in con:
                issues.append(_iss("info", "metal_coat", node, "bare metal has coat > 0",
                                   "coat 0 unless the metal is lacquered", "SS Coat"))
            tw = v.get("transmission_weight") or 0
            if tw > 0 or "transmission_weight" in con:
                tc = v.get("transmission_color")
                if isinstance(tc, (list, tuple)) and "transmission_color" not in con:
                    if max(tc) - min(tc) > 0.5 or min(tc) < 0.1:
                        issues.append(_iss("warn", "transmission_saturated", node,
                                           "saturated transmission colour %s = near-infinite density" % _fmt(tc),
                                           "light tint, deepen with a lower transmission_depth",
                                           "OPBR Transmission Color; ARVID 00:18:13"))
                    depth = v.get("transmission_depth")
                    if fam == "openpbr" and depth is not None and depth <= 0 and min(tc) < 0.999:
                        issues.append(_iss("info", "transmission_depth_zero", node,
                                           "tinted glass with depth 0: the colour is a surface tint, not "
                                           "absorption", "set_transmission_depth()", "OPBR Transmission Color"))
                    if depth and depth > 0 and meshes and "transmission_depth" not in con:
                        size = min(min(m.get("bbox_size") or [0]) or 0 for m in meshes)
                        if size > 0 and not (0.1 * size <= depth <= 10.0 * size):
                            issues.append(_iss("warn", "transmission_depth_scale", node,
                                               "transmission_depth %.4g vs object thickness %.4g: more than 10x off"
                                               % (depth, size), "depth near the object's size, then tune",
                                               "OPBR Transmission Depth ('world space length')"))
            tf = v.get("thin_film_thickness")
            if fam == "openpbr" and (v.get("thin_film_weight") or 0) > 0 and tf and tf > 1.0:
                issues.append(_iss("warn", "thin_film_units", node, "thin_film_thickness %.4g micrometers: above 1 "
                                   "fades the colours; a nanometer value was probably pasted" % tf,
                                   "divide Standard Surface nm by 1000", "OPBRV 00:12:35; OPBR Thin Film"))
            if fam == "standard" and tf and 0 < tf < 10:
                issues.append(_iss("info", "thin_film_units", node, "Standard Surface thin film is in nanometers "
                                   "(0 to 2000): %.4g looks like micrometers" % tf, "multiply by 1000", "SS"))
            if (v.get("transmission_dispersion_scale") or 0) > 0:
                issues.append(_iss("info", "dispersion", node, "dispersion on: worth it on faceted gems and prisms; a flat, "
                                   "parallel-faced crystal or window shows almost none [added optics]; costs AA or "
                                   "transmission samples", None, "OPBR Dispersion; OPBR checklist 'gems only'"))
            op = v.get("geometry_opacity")
            op_low = ("geometry_opacity" in con) or (isinstance(op, (int, float)) and op < 0.999) or (
                isinstance(op, (list, tuple)) and min(op) < 0.999)
            if op_low and not v.get("geometry_thin_walled"):
                issues.append(_iss("warn", "opacity_thick", node, "opacity below 1 on a thick surface",
                                   "thin walled for cutouts, transmission for glass", "OPBR Geometry Opacity"))
            aniso = (v.get("specular_roughness_anisotropy") or 0) > 0 or "specular_roughness_anisotropy" in con
            if aniso:
                if (v.get("specular_roughness") or 0) <= 0 and "specular_roughness" not in con:
                    issues.append(_iss("warn", "aniso_zero_roughness", node, "anisotropy is invisible at roughness 0",
                                       "roughness above 0", "ARVID 00:15:12"))
                for m in meshes:
                    if (m.get("iterations") or 0) < 1 or not m.get("smooth_derivs"):
                        issues.append(_iss("warn", "aniso_faceting", m["shape"], "anisotropic shader without "
                                           "smooth tangents and 1+ subdivision: faceted highlights",
                                           "aiSubdivSmoothDerivs 1, aiSubdivIterations >= 1", "SS Specular Anisotropy"))
            if sh.get("hero") and not (con & {"specular_roughness", "geometry_normal", "geometry_coat_normal"}):
                issues.append(_iss("info", "uniform_roughness", node, "nothing breaks up roughness or normals",
                                   "roughness_breakup(), noise_bump(); smudge_roughness() on polished metal or glass",
                                   "ARVID 00:35:49"))
            polished = (metal or tw >= 0.99) and (v.get("specular_roughness") or 0) < 0.1
            ups = set(sh.get("rough_upstream") or [])
            if sh.get("hero") and polished and "specular_roughness" in con and not ups & {"file", "aiCellNoise", "aiImage"}:
                issues.append(_iss("info", "polished_no_smudge", node, "polished hero surface broken up by noise only: "
                                   "no smudge or fingerprint mask on roughness",
                                   "smudge_roughness() with a scan or cell noise; match the reference's cleanliness",
                                   "OPBR Specular Roughness (fingerprint map example); ARVID 00:25:11"))
        if fam == "hair":
            if (v.get("diffuse") or 0) > 0:
                issues.append(_iss("warn", "hair_diffuse", node, "diffuse > 0 on Standard Hair",
                                   "diffuse 0 unless dirty, damaged or sprayed hair", "HAIR Diffuse"))
            if "base_color" in con and (v.get("melanin") or 0) > 0:
                issues.append(_iss("warn", "hair_melanin_texture", node, "textured base colour with melanin > 0",
                                   "melanin 0 when base colour is textured", "HAIR Texturing Hair"))
            for k in ("specular_tint", "specular2_tint", "transmission_tint"):
                c = v.get(k)
                if isinstance(c, (list, tuple)) and min(c) < 0.999 and k not in con:
                    issues.append(_iss("info", "hair_tint", node, "%s not white" % k, "white for realistic hair",
                                       "HAIR Specular Tint"))
            ior = v.get("ior")
            if ior is not None and not (1.4 <= ior <= 1.6):
                issues.append(_iss("info", "hair_ior", node, "IOR %.3g outside 1.4 to 1.6 (wet hair only)" % ior,
                                   "1.55", "HAIR IOR"))
            s = v.get("shift")
            if s is not None and not (0 <= s <= 10):
                issues.append(_iss("info", "hair_shift", node, "shift %.3g outside 0 to 10 degrees" % s, "about 3",
                                   "HAIR Shift"))
    issues += _dielectric_issues(data, shape_by)
    no_tx = [f["node"] for f in data.get("files", [])
             if f.get("has_tx") is False and f.get("ext") != "tx" and f.get("exists") is not False]
    if no_tx:
        issues.append(_iss("info", "no_tx", no_tx[0], "%d texture(s) without a pre-baked .tx (%s): auto-TX converts them "
                           "on every machine at the first render" % (len(no_tx), ", ".join(no_tx[:6])),
                           "TX Manager or maketx before a heavy asset or a batch; batch with auto-TX off, use "
                           "existing TX on", "ARV-T 00:14:44; RAYC 00:13:04"))
    for sg in data.get("sgs", []):
        if sg.get("default_name") and sg["sg"] not in INITIAL_NODES:
            issues.append(_iss("warn", "default_name", sg["sg"], "default shading group name",
                               "<material>_SG", "SARK 00:15:11"))
        if not sg.get("displacement"):
            continue
        if sg.get("disp_zero_shader") and any((shape_by.get(m, {}).get("zero") or 0) for m in sg.get("members", [])):
            issues.append(_iss("warn", "disp_zero_twice", sg["sg"], "zero value set on the displacement node and on "
                               "the shape: they add", "set it in one place", "SS Shader vs Per-Object Displacement"))
        for m in sg.get("members", []):
            s = shape_by.get(m)
            if not s:
                continue
            if s.get("subdiv_type") in (None, 0, "none") or (s.get("iterations") or 0) < 1:
                issues.append(_iss("warn", "disp_no_subdiv", m, "displaced mesh without Arnold subdivision",
                                   "aiSubdivType catclark, 2 iterations to work, 3 to 4 final", "JHILL 00:27:32"))
            if not (s.get("padding") or 0) > 0:
                issues.append(_iss("warn", "disp_padding", m, "bounds padding 0: displacement will clip to black",
                                   "bounds_padding()", "SS Bounds Padding"))
            if s.get("autobump") and not s.get("has_uvs"):
                issues.append(_iss("warn", "autobump_no_uvs", m, "autobump needs UVs", None, "SS Autobump"))
    for s in data.get("shapes", []):
        it = s.get("iterations") or 0
        if it > 0 and s.get("smooth_preview"):
            issues.append(_iss("error", "smooth_preview_stack", s["shape"], "Smooth Mesh Preview on with Arnold "
                               "subdivision: Arnold renders the preview mesh too (4x per level)",
                               "displaySmoothMesh 0", "SS MtoA Subdivision Settings"))
        if it > 0 and s.get("faces"):
            polys = subdiv_polys(s["faces"], it) * (4 ** 2 if s.get("smooth_preview") else 1)
            if polys > max_polys:
                issues.append(_iss("error", "subdiv_budget", s["shape"], "%d faces x 4^%d = %d polygons" % (
                    s["faces"], it, polys), "fewer iterations, autobump, or adaptive error", "SS Iterations"))
        if s.get("unassigned"):
            issues.append(_iss("warn", "unassigned", s["shape"], "mesh on the default shading group",
                               "assign a named material", None))
    return issues


def _bbox_overlap(a, b, tol=1e-4):
    """Axis-aligned boxes [xmin, ymin, zmin, xmax, ymax, zmax] touch or overlap (tol in scene units)."""
    return all(a[i] <= b[i + 3] + tol and b[i] <= a[i + 3] + tol for i in range(3))


def _dielectric_issues(data, shape_by):
    """Nested dielectrics are on by default and the higher Dielectric Priority wins where media
    overlap (OPBR Dielectric Priority: glass 3, ice and bubbles 2, liquid 1; default 0 'not
    physically correct'). Two transmissive materials whose meshes touch or overlap with the
    same priority leave the overlap to chance (bounding-box test, OPBR agent checklist)."""
    out, media = [], []
    for sh in data.get("shaders", []):
        v, con = sh.get("values", {}), set(sh.get("connected", []))
        if sh.get("family") not in ("openpbr", "standard"):
            continue
        if (v.get("transmission_weight") or 0) <= 0 and "transmission_weight" not in con:
            continue
        for m in sh.get("meshes", []):
            bb = (shape_by.get(m) or {}).get("bbox")
            if bb:
                media.append((sh["node"], m, bb, v.get("dielectric_priority", 0) or 0))
    seen = set()
    for i, (na, ma, ba, pa) in enumerate(media):
        for nb, mb, bb, pb in media[i + 1:]:
            if na == nb or pa != pb or (na, nb) in seen or not _bbox_overlap(ba, bb):
                continue
            seen.add((na, nb))
            out.append(_iss("warn", "dielectric_priority", na, "transmissive %s and %s touch or overlap (%s, %s) with the "
                            "same dielectric priority %d" % (na, nb, ma.split("|")[-1], mb.split("|")[-1], pa),
                            "higher number wins: container glass 3, inclusions 2, liquid 1; model the liquid slightly "
                            "into the glass", "OPBR Dielectric Priority; nested dielectrics on by default"))
    return out


def _fmt(c):
    return "(%s)" % ", ".join("%.3g" % x for x in c)


def verdict(issues):
    """{"pass": no errors, "errors": n, "warnings": n, "info": n, "lines": [...]}"""
    lines = ["%s: %s [%s] %s%s" % (i["level"], i["node"], i["rule"], i["msg"],
                                   (" -> " + i["fix"]) if i.get("fix") else "") for i in issues]
    n = lambda lv: sum(1 for i in issues if i["level"] == lv)
    return {"pass": n("error") == 0, "errors": n("error"), "warnings": n("warn"), "info": n("info"),
            "lines": lines}


# =========================================================================== Maya layer
def _cmds():
    import maya.cmds as cmds
    return cmds


_TYPES = None


def _have_type(t):
    global _TYPES
    if _TYPES is None:
        _TYPES = set(_cmds().allNodeTypes() or [])
    return t in _TYPES


def ensure_arnold():
    """Load MtoA and make sure the Arnold option nodes exist. Returns the MtoA version."""
    global _TYPES
    cmds = _cmds()
    if not cmds.pluginInfo("mtoa", q=True, loaded=True):
        os.environ.setdefault("ARNOLD_FORCE_ABORT_ON_LICENSE_FAIL", "0")     # WN25: abort by default
        cmds.loadPlugin("mtoa", quiet=True)
        _TYPES = None
    if not cmds.objExists("defaultArnoldRenderOptions"):
        try:
            import mtoa.core
            mtoa.core.createOptions()                                      # [verify]
        except Exception:
            pass
    if not cmds.objExists("defaultArnoldRenderOptions"):
        raise RuntimeError("defaultArnoldRenderOptions missing after loading mtoa")
    return cmds.pluginInfo("mtoa", q=True, version=True)


def cm_info():
    """Rendering space, view, config and the input space names of this session."""
    cmds = _cmds()
    q = lambda **kw: cmds.colorManagementPrefs(q=True, **kw)
    info = {}
    for key, kw in (("enabled", {"cmEnabled": True}), ("rendering_space", {"renderingSpaceName": True}),
                    ("view", {"viewTransformName": True}), ("config", {"configFilePath": True}),
                    ("inputs", {"inputSpaceNames": True})):
        try:
            info[key] = q(**kw)
        except Exception as exc:
            info[key] = None
            info.setdefault("errors", []).append("%s: %s" % (key, exc))
    return info


def space_name(role_or_name):
    """Exact input space name for a role ('srgb', 'linear_srgb', 'raw', 'acescg'), or the name
    itself if it already exists in this config."""
    inputs = cm_info().get("inputs") or []
    if role_or_name in SPACE_CANDIDATES:
        return resolve_space(role_or_name, inputs)
    if inputs and role_or_name not in inputs:
        raise LookupError("colour space %r not in this config" % role_or_name)
    return role_or_name


def to_rendering_space(rgb):
    """Convert a linear Rec.709 colour (the Arnold tables, Arvid's typed values) to the
    rendering space: OCIO when its Python bindings load (exposed since 2026.1, deltas 2.7),
    else the built-in matrix. Returns (rgb, method)."""
    info = cm_info()
    rs = info.get("rendering_space") or ""
    try:
        import PyOpenColorIO as OCIO                                      # [verify] module name in mayapy
        cfg = OCIO.Config.CreateFromFile(info["config"]) if info.get("config") else OCIO.GetCurrentConfig()
        src = resolve_space("linear_srgb", info.get("inputs") or [])
        proc = cfg.getProcessor(src, rs).getDefaultCPUProcessor()
        return tuple(proc.applyRGB(list(rgb))), "OCIO %s to %s" % (src, rs)
    except Exception:
        return convert_linear_rec709(rgb, rs)


OPENPBR_TYPES = ("openPBRSurface", "aiOpenPBRSurface", "aiOpenPbrSurface")
STANDARD_TYPES = ("aiStandardSurface", "standardSurface")
OPENPBR_ATTRS = {
    "base_weight": ("baseWeight",), "base_color": ("baseColor",), "base_diffuse_roughness": ("baseDiffuseRoughness",),
    "base_metalness": ("baseMetalness",), "specular_weight": ("specularWeight",), "specular_color": ("specularColor",),
    "specular_roughness": ("specularRoughness",), "specular_ior": ("specularIOR", "specularIor"),
    "specular_roughness_anisotropy": ("specularRoughnessAnisotropy", "specularAnisotropy"),
    "transmission_weight": ("transmissionWeight",), "transmission_color": ("transmissionColor",),
    "transmission_depth": ("transmissionDepth",), "transmission_scatter": ("transmissionScatter",),
    "transmission_scatter_anisotropy": ("transmissionScatterAnisotropy",),
    "transmission_dispersion_scale": ("transmissionDispersionScale",),
    "transmission_dispersion_abbe_number": ("transmissionDispersionAbbeNumber",),
    "subsurface_weight": ("subsurfaceWeight",), "subsurface_color": ("subsurfaceColor",),
    "subsurface_radius": ("subsurfaceRadius",), "subsurface_radius_scale": ("subsurfaceRadiusScale",),
    "subsurface_scatter_anisotropy": ("subsurfaceScatterAnisotropy", "subsurfaceAnisotropy"),
    "coat_weight": ("coatWeight",), "coat_color": ("coatColor",), "coat_roughness": ("coatRoughness",),
    "coat_roughness_anisotropy": ("coatRoughnessAnisotropy",), "coat_ior": ("coatIOR", "coatIor"),
    "coat_darkening": ("coatDarkening",), "fuzz_weight": ("fuzzWeight",), "fuzz_color": ("fuzzColor",),
    "fuzz_roughness": ("fuzzRoughness",), "thin_film_weight": ("thinFilmWeight",),
    "thin_film_thickness": ("thinFilmThickness",), "thin_film_ior": ("thinFilmIOR", "thinFilmIor"),
    "emission_luminance": ("emissionLuminance",), "emission_color": ("emissionColor",),
    "geometry_opacity": ("geometryOpacity", "opacity"), "geometry_thin_walled": ("geometryThinWalled", "thinWalled"),
    "geometry_normal": ("normalCamera", "geometryNormal"), "geometry_coat_normal": ("geometryCoatNormal", "coatNormal"),
    "geometry_tangent": ("geometryTangent",), "dielectric_priority": ("dielectricPriority",),
}
STANDARD_ATTRS = {
    "base_weight": ("base",), "base_color": ("baseColor",), "base_diffuse_roughness": ("diffuseRoughness",),
    "base_metalness": ("metalness",), "specular_weight": ("specular",), "specular_color": ("specularColor",),
    "specular_roughness": ("specularRoughness",), "specular_ior": ("specularIOR",),
    "specular_roughness_anisotropy": ("specularAnisotropy",), "specular_rotation": ("specularRotation",),
    "transmission_weight": ("transmission",), "transmission_color": ("transmissionColor",),
    "transmission_depth": ("transmissionDepth",), "transmission_scatter": ("transmissionScatter",),
    "transmission_scatter_anisotropy": ("transmissionScatterAnisotropy",),
    "transmission_dispersion_abbe_number": ("transmissionDispersion",),
    "transmission_extra_roughness": ("transmissionExtraRoughness",), "subsurface_weight": ("subsurface",),
    "subsurface_color": ("subsurfaceColor",), "ss_subsurface_radius_rgb": ("subsurfaceRadius",),
    "ss_subsurface_scale": ("subsurfaceScale",), "subsurface_type": ("subsurfaceType",),
    "subsurface_scatter_anisotropy": ("subsurfaceAnisotropy",), "coat_weight": ("coat",), "coat_color": ("coatColor",),
    "coat_roughness": ("coatRoughness",), "coat_ior": ("coatIOR",), "coat_affect_color": ("coatAffectColor",),
    "coat_affect_roughness": ("coatAffectRoughness",), "fuzz_weight": ("sheen",), "fuzz_color": ("sheenColor",),
    "fuzz_roughness": ("sheenRoughness",), "ss_thin_film_thickness_nm": ("thinFilmThickness",),
    "thin_film_ior": ("thinFilmIOR",), "ss_emission_weight": ("emission",), "emission_color": ("emissionColor",),
    "geometry_opacity": ("opacity",), "geometry_thin_walled": ("thinWalled",), "geometry_normal": ("normalCamera",),
    "geometry_coat_normal": ("coatNormal",), "dielectric_priority": ("dielectricPriority",),
}
HAIR_ATTRS = {
    "base_weight": ("base",), "base_color": ("baseColor",), "melanin": ("melanin",),
    "melanin_redness": ("melaninRedness",), "melanin_randomize": ("melaninRandomize",), "roughness": ("roughness",),
    "ior": ("ior", "IOR"), "shift": ("shift",), "specular_tint": ("specularTint",), "specular2_tint": ("specular2Tint",),
    "transmission_tint": ("transmissionTint",), "diffuse": ("diffuse",), "extra_depth": ("extraDepth",),
    "extra_samples": ("extraSamples",), "scattering_mode": ("scatteringMode",), "opacity": ("opacity",),
    "indirect_diffuse": ("indirectDiffuse",), "indirect_specular": ("indirectSpecular",),
}
CARPAINT_ATTRS = {
    "base_weight": ("base",), "base_color": ("baseColor",), "base_roughness": ("baseRoughness",),
    "specular_weight": ("specular",), "specular_color": ("specularColor",), "specular_flip_flop": ("specularFlipFlop",),
    "specular_roughness": ("specularRoughness",), "specular_ior": ("specularIOR",), "flake_color": ("flakeColor",),
    "flake_flip_flop": ("flakeFlipFlop",), "flake_roughness": ("flakeRoughness",), "flake_scale": ("flakeScale",),
    "flake_density": ("flakeDensity",), "flake_normal_randomize": ("flakeNormalRandomize",),
    "flake_layers": ("flakeLayers",), "coat_weight": ("coat",), "coat_color": ("coatColor",),
    "coat_roughness": ("coatRoughness",), "coat_ior": ("coatIOR",), "geometry_coat_normal": ("coatNormal",),
    "geometry_normal": ("normalCamera",),
}


def family_of_type(t):
    if t in OPENPBR_TYPES or "openpbr" in t.lower():
        return "openpbr"
    if t in STANDARD_TYPES:
        return "standard"
    if t == "aiStandardHair":
        return "hair"
    if t == "aiCarPaint":
        return "carpaint"
    return "other"


def _table(family):
    return {"openpbr": OPENPBR_ATTRS, "standard": STANDARD_ATTRS, "hair": HAIR_ATTRS,
            "carpaint": CARPAINT_ATTRS}.get(family, {})


def _camel(key):
    parts = key.split("_")
    return parts[0] + "".join(p[:1].upper() + p[1:] for p in parts[1:])


def resolve_attr(node, key, required=True):
    """Maya attribute on `node` for a canonical key (OpenPBR snake_case names), through the
    candidate table then camelCase variants. Raises KeyError with the candidates if required."""
    cmds = _cmds()
    fam = family_of_type(cmds.nodeType(node))
    cands = list(_table(fam).get(key, ()))
    cam = _camel(key)
    for extra in (cam, cam.replace("Ior", "IOR")):
        if extra not in cands:
            cands.append(extra)
    for a in cands:
        if cmds.attributeQuery(a, node=node, exists=True):
            return a
    if required:
        raise KeyError("%s (%s) has none of %s for %s" % (node, cmds.nodeType(node), cands, key))
    return None


def _enum_index(plug, label):
    cmds = _cmds()
    node, attr = plug.split(".", 1)
    try:
        entries = (cmds.attributeQuery(attr, node=node, listEnum=True) or [""])[0].split(":")
    except Exception:
        return None
    parsed = []
    for i, e in enumerate(entries):
        name, _, idx = e.partition("=")
        parsed.append((_norm(name), int(idx) if idx else i))
    want = _norm(label)
    for n, idx in parsed:
        if n == want:
            return idx
    for n, idx in parsed:
        if want and want in n:
            return idx
    return None


def set_enum(plug, label):
    """Set an enum by label (case and punctuation ignored, substring allowed). False if absent."""
    cmds = _cmds()
    node, attr = plug.split(".", 1)
    if not cmds.attributeQuery(attr, node=node, exists=True):
        return False
    idx = _enum_index(plug, label)
    if idx is None:
        return False
    cmds.setAttr(plug, idx)
    return True


def set_plug(plug, value):
    """setAttr by the plug's type: colours and vectors, enums by label, strings, bools."""
    cmds = _cmds()
    t = cmds.getAttr(plug, type=True)
    if isinstance(value, (list, tuple)) and t not in ("float3", "double3"):
        cmds.setAttr(plug, float(value[0]))                 # a scalar plug given a triple (e.g. noise scale)
    elif isinstance(value, (list, tuple)):
        cmds.setAttr(plug, *[float(x) for x in value], type="double3")
    elif t == "enum" and isinstance(value, str):
        if not set_enum(plug, value):
            raise ValueError("%s has no enum label %s" % (plug, value))
    elif t == "string":
        cmds.setAttr(plug, value, type="string")
    elif t in ("bool", "long", "short", "byte", "enum"):
        cmds.setAttr(plug, int(value))
    elif t in ("float3", "double3") and isinstance(value, (int, float)):
        cmds.setAttr(plug, float(value), float(value), float(value), type="double3")
    else:
        cmds.setAttr(plug, float(value))


def set_values(node, values, convert=True, strict=False):
    """Set canonical values on a shader. Colours (COLOR_KEYS) are treated as linear Rec.709 and
    converted to the rendering space when convert=True. Returns {"set", "missing", "converted"}."""
    rep = {"set": {}, "missing": [], "converted": {}}
    for k, val in values.items():
        attr = resolve_attr(node, k, required=strict)
        if not attr:
            rep["missing"].append(k)
            continue
        if convert and k in COLOR_KEYS and isinstance(val, (list, tuple)):
            new, how = to_rendering_space(val)
            rep["converted"][k] = {"from": list(val), "to": [round(x, 6) for x in new], "method": how}
            val = new
        set_plug("%s.%s" % (node, attr), val)
        rep["set"][k] = attr
    return rep


def pick_shader_type(shader_type="openPBRSurface"):
    global _TYPES
    if not _have_type(shader_type) and shader_type.startswith("ai"):
        ensure_arnold()
        _TYPES = None
    if _have_type(shader_type):
        return shader_type
    if shader_type in OPENPBR_TYPES:
        for t in OPENPBR_TYPES:
            if _have_type(t):
                return t
    raise RuntimeError("shader type %s not available (is mtoa loaded?)" % shader_type)


def get_or_create_material(name, shader_type="openPBRSurface"):
    """<name>_MTL and <name>_SG, idempotent. Raises if <name>_MTL exists with another type."""
    cmds = _cmds()
    shader_type = pick_shader_type(shader_type)
    sh, sg = name + "_MTL", name + "_SG"
    if cmds.objExists(sh):
        if cmds.nodeType(sh) != shader_type:
            raise ValueError("%s exists as %s, not %s" % (sh, cmds.nodeType(sh), shader_type))
    else:
        sh = cmds.shadingNode(shader_type, asShader=True, name=sh)
    if not cmds.objExists(sg):
        sg = cmds.sets(renderable=True, noSurfaceShader=True, empty=True, name=sg)
    elif cmds.nodeType(sg) != "shadingEngine":
        raise ValueError("%s exists and is not a shadingEngine" % sg)
    if not cmds.isConnected(sh + ".outColor", sg + ".surfaceShader"):
        cmds.connectAttr(sh + ".outColor", sg + ".surfaceShader", force=True)
    return sh, sg


def assign(sg, members):
    """Assign objects or faces to a shading group (selection-free)."""
    if members:
        _cmds().sets(members, e=True, forceElement=sg)


def _get_or_create(node_type, name, **kw):
    cmds = _cmds()
    if cmds.objExists(name):
        if cmds.nodeType(name) != node_type:
            raise ValueError("%s exists as %s, not %s" % (name, cmds.nodeType(name), node_type))
        return name
    return cmds.shadingNode(node_type, name=name, **kw)


P2D_ATTRS = ("coverage", "translateFrame", "rotateFrame", "mirrorU", "mirrorV", "stagger", "wrapU", "wrapV",
             "repeatUV", "offset", "rotateUV", "noiseUV", "vertexUvOne", "vertexUvTwo", "vertexUvThree",
             "vertexCameraOne")


def place2d(name):
    return _get_or_create("place2dTexture", name, asUtility=True)


def file_texture(path, name, space, place=None, udim=None, gray=False):
    """Colour-managed file node with an explicit input space. space: a role ('srgb',
    'linear_srgb', 'raw', 'acescg') or an exact name. The space is set AFTER the path (the
    rules fire on the path) and Ignore Color Space File Rules is turned on (CM). UDIM names
    (.1001. or <UDIM>) switch UV Tiling Mode to UDIM (Mari)."""
    cmds = _cmds()
    if cmds.objExists(name):
        if cmds.nodeType(name) != "file":
            raise ValueError("%s exists as %s" % (name, cmds.nodeType(name)))
        f = name
    else:
        f = cmds.shadingNode("file", asTexture=True, isColorManaged=True, name=name)
    p = place or place2d(name + "_P2D")
    for a in P2D_ATTRS:
        cmds.connectAttr("%s.%s" % (p, a), "%s.%s" % (f, a), force=True)
    cmds.connectAttr(p + ".outUV", f + ".uvCoord", force=True)
    cmds.connectAttr(p + ".outUvFilterSize", f + ".uvFilterSize", force=True)
    if udim is None:
        udim = bool(re.search(r"[._](1\d{3}|<udim>)\.[^.]+$", path, re.I))
    set_enum(f + ".uvTilingMode", "udim" if udim else "off")               # labels [verify]
    cmds.setAttr(f + ".fileTextureName", path, type="string")
    cmds.setAttr(f + ".colorSpace", space_name(space), type="string")
    cmds.setAttr(f + ".ignoreColorSpaceFileRules", 1)
    cmds.setAttr(f + ".alphaIsLuminance", 1 if gray else 0)
    return f


def connect_map(file_node, dst_plug, channel=None):
    """File to destination: colour plugs take outColor, float plugs outColorR (or the packed
    channel R/G/B). Returns the source plug."""
    cmds = _cmds()
    t = cmds.getAttr(dst_plug, type=True)
    src = file_node + (".outColor" if t in ("float3", "double3") else ".outColor" + (channel or "R"))
    cmds.connectAttr(src, dst_plug, force=True)
    return src


def normal_map(file_node, name, convention="opengl", tangent_space="standard", strength=1.0):
    """aiNormalMap fed by the file's outColor. DirectX maps invert Y. tangent_space='mikk' uses
    the MIKKTSpace mode of MtoA 5.6.1.1+ (Maya 2027.1, WN27 tangent_space_type). Returns
    (node, out_plug, notes)."""
    cmds = _cmds()
    notes = []
    nm = _get_or_create("aiNormalMap", name, asUtility=True)
    cmds.connectAttr(file_node + ".outColor", nm + ".input", force=True)
    inv = "invertY" if cmds.attributeQuery("invertY", node=nm, exists=True) else None
    if inv:
        cmds.setAttr(nm + "." + inv, 1 if convention == "directx" else 0)
    elif convention == "directx":
        notes.append("aiNormalMap has no invertY attribute: flip green upstream [verify]")
    if cmds.attributeQuery("strength", node=nm, exists=True):
        cmds.setAttr(nm + ".strength", strength)
    if tangent_space != "standard":
        attr = next((a for a in ("tangentSpaceType", "tangent_space_type") if cmds.attributeQuery(
            a, node=nm, exists=True)), None)
        if not attr or not set_enum(nm + "." + attr, tangent_space):
            notes.append("tangent space %s not available on this MtoA (needs 5.6.1.1)" % tangent_space)
    return nm, nm + ".outValue", notes


def bump_node(name, value_src=None, mode="bump", depth=None, normal_in=None, convention="opengl"):
    """Maya bump2d. mode 'bump' (height) or 'tangent' (tangent-space normal map fed through
    bumpValue, SARK 00:22:17). normal_in: an upstream normal (aiNormalMap.outValue) plugged
    into the hidden normalCamera to combine normal and height (RAYC 00:23:40)."""
    cmds = _cmds()
    b = _get_or_create("bump2d", name, asUtility=True)
    set_enum(b + ".bumpInterp", "tangent space normals" if mode == "tangent" else "bump")
    if value_src:
        cmds.connectAttr(value_src, b + ".bumpValue", force=True)
    if depth is not None:
        cmds.setAttr(b + ".bumpDepth", depth)
    if normal_in:
        cmds.connectAttr(normal_in, b + ".normalCamera", force=True)
    if mode == "tangent":
        for a, v in (("aiFlipR", 0), ("aiFlipG", 1 if convention == "directx" else 0)):   # [verify names]
            if cmds.attributeQuery(a, node=b, exists=True):
                cmds.setAttr(b + "." + a, v)
    return b, b + ".outNormal"


def _shapes(members):
    cmds = _cmds()
    out = []
    for m in members or []:
        node = m.split(".")[0]
        if cmds.nodeType(node) == "mesh":
            out.append(cmds.ls(node, long=True)[0])
        else:
            out += [s for s in cmds.listRelatives(node, shapes=True, fullPath=True, type="mesh") or []
                    if not cmds.getAttr(s + ".intermediateObject")]
    return list(dict.fromkeys(out))


def build_material(textures, name, meshes=None, shader_type="openPBRSurface", normal_mode="aiNormalMap",
                   tangent_space="standard", height_mode="auto", bump_depth=0.2, ao="skip",
                   displacement=None, prefer_tx=False, texture_set=None):
    """Material from a texture set: the per-map contract of Sarkamari, J Hill and Raycast.

    textures: a folder, a file list, parse_texture_set() output (texture_set picks the set) or
    one set {channel: info}. normal_mode: 'aiNormalMap' (default; SARK 00:21:10), 'bump2d'
    (tangent-space bump2d, JHILL 00:24:31), 'hybrid' (aiNormalMap into bump2d with the height,
    RAYC 00:23:40). height_mode: 'auto' (bump unless a displacement map or hybrid), 'bump',
    'displacement', 'none'. ao: 'skip' (path-traced hero, digest decider 4) or 'multiply'
    (match a Painter or real-time look, SARK 00:16:19). displacement: kwargs for
    add_displacement (scale is required for a meaningful result). Returns a report dict."""
    cmds = _cmds()
    ensure_arnold()
    chans = _pick_set(textures, texture_set, prefer_tx)
    sh, sg = get_or_create_material(name, shader_type)
    fam = family_of_type(cmds.nodeType(sh))
    rep = {"shader": sh, "sg": sg, "family": fam, "files": {}, "connections": [], "spaces": {}, "notes": [],
           "channels": sorted(chans)}
    p = place2d(name + "_P2D")
    files = {}
    for ch, info in sorted(chans.items()):
        role = space_role_for(info["role"], info["ext"], info.get("source_ext"))
        path = info["tx"] if (prefer_tx and info.get("tx")) else info["path"]
        f = file_texture(path, "%s_%s_TEX" % (name, ch), role, place=p, udim=info["udim"], gray=info["gray"])
        files[ch] = f
        rep["files"][ch] = f
        rep["spaces"][f] = cmds.getAttr(f + ".colorSpace")

    def wire(src_file, key, channel=None):
        attr = resolve_attr(sh, key, required=False)
        if not attr:
            rep["notes"].append("%s has no input for %s" % (sh, key))
            return None
        dst = "%s.%s" % (sh, attr)
        src = connect_map(src_file, dst, channel)
        rep["connections"].append((src, dst))
        return dst

    base = files.get("base_color")
    ao_src = files.get("ao")
    ao_channel = None
    if not ao_src and "packed_orm" in files:
        ao_src, ao_channel = files["packed_orm"], "R"
    if base:
        if ao == "multiply" and ao_src:
            md = _get_or_create("multiplyDivide", name + "_AO_MULT", asUtility=True)
            cmds.setAttr(md + ".operation", 1)
            cmds.connectAttr(base + ".outColor", md + ".input1", force=True)
            if ao_channel:
                for c in "XYZ":
                    cmds.connectAttr(ao_src + ".outColor" + ao_channel, md + ".input2" + c, force=True)
            else:
                cmds.connectAttr(ao_src + ".outColor", md + ".input2", force=True)
            dst = "%s.%s" % (sh, resolve_attr(sh, "base_color"))
            cmds.connectAttr(md + ".output", dst, force=True)
            rep["connections"].append((md + ".output", dst))
            rep["notes"].append("AO multiplied into base colour (matching a Painter/real-time look)")
        else:
            wire(base, "base_color")
            if ao_src:
                rep["notes"].append("AO map not used (path-traced render computes occlusion; ao='multiply' to "
                                    "match Painter)")
    for ch, key in (("roughness", "specular_roughness"), ("metalness", "base_metalness"),
                    ("specular", "specular_weight"), ("coat", "coat_weight"), ("transmission", "transmission_weight"),
                    ("subsurface_color", "subsurface_color"), ("opacity", "geometry_opacity"),
                    ("emission", "emission_color")):
        if ch in files:
            wire(files[ch], key)
    if "packed_orm" in files:
        wire(files["packed_orm"], "specular_roughness", "G")
        wire(files["packed_orm"], "base_metalness", "B")
    if "emission" in files:
        if fam == "openpbr":
            a = resolve_attr(sh, "emission_luminance", required=False)
            if a and not cmds.listConnections("%s.%s" % (sh, a), s=True, d=False):
                cmds.setAttr("%s.%s" % (sh, a), 1000.0)
                rep["notes"].append("emission_luminance 1000 nits (= Standard Surface emission 1, WN25); tune")
        else:
            a = resolve_attr(sh, "ss_emission_weight", required=False)
            if a:
                cmds.setAttr("%s.%s" % (sh, a), 1.0)
    if "subsurface_color" in files:
        a = resolve_attr(sh, "subsurface_weight", required=False)
        if a:
            cmds.setAttr("%s.%s" % (sh, a), 1.0)
    shapes = _shapes(meshes)
    if "opacity" in files:
        for s in shapes:
            if cmds.attributeQuery("aiOpaque", node=s, exists=True):
                cmds.setAttr(s + ".aiOpaque", 0)                             # SS Geometry Opacity
        rep["notes"].append("aiOpaque off on the assigned meshes (opacity needs it off)")
    # normals and height
    nrm_file, height_file = files.get("normal"), files.get("height")
    disp_file = files.get("displacement")
    hm = height_mode
    if hm == "auto":                   # a displacement map wins over height-as-bump (autobump covers the
        hm = "none" if disp_file else ("bump" if height_file else "none")      # high frequencies, SS Autobump)
    normal_out = None
    if nrm_file:
        conv = chans["normal"].get("normal_convention") or "opengl"
        if normal_mode in ("aiNormalMap", "hybrid"):
            nm, normal_out, notes = normal_map(nrm_file, name + "_NRM", conv, tangent_space)
            rep["notes"] += notes
        elif normal_mode == "bump2d":
            b, normal_out = bump_node(name + "_NRM_BMP", nrm_file + ".outAlpha", mode="tangent", convention=conv)
        else:
            raise ValueError("normal_mode must be aiNormalMap, bump2d or hybrid")
        rep["normal_convention"] = conv
    if height_file and hm == "bump":
        b, out = bump_node(name + "_BMP", height_file + ".outColorR", mode="bump", depth=bump_depth,
                           normal_in=normal_out)
        normal_out = out
        rep["notes"].append("height as bump (bumpDepth %.3g, a starting value [added]: tune on the N AOV)"
                            % bump_depth)
    if normal_out:
        dst = "%s.%s" % (sh, resolve_attr(sh, "geometry_normal"))
        cmds.connectAttr(normal_out, dst, force=True)
        rep["connections"].append((normal_out, dst))
    if shapes:
        assign(sg, shapes)
    disp_src = disp_file or (height_file if hm == "displacement" else None)
    if disp_src:
        kw = dict(displacement or {})
        if "scale" not in kw:
            rep["notes"].append("displacement scale not given: 1.0 scene unit per map unit; set it from the bake")
        rep["displacement"] = add_displacement(sg, disp_src, shapes or None, **kw)
    rep["assigned"] = shapes
    return rep


def _pick_set(textures, texture_set, prefer_tx):
    if isinstance(textures, dict) and "sets" in textures:
        sets = textures["sets"]
    elif isinstance(textures, dict) and textures and all(isinstance(v, dict) and "channel" in v
                                                          for v in textures.values()):
        return textures
    else:
        sets = parse_texture_set(textures, prefer_tx=prefer_tx)["sets"]
    if texture_set:
        return sets[texture_set]
    if len(sets) != 1:
        raise ValueError("%d texture sets found (%s): pass texture_set=" % (len(sets), sorted(sets)))
    return list(sets.values())[0]


def add_displacement(sg, source, meshes=None, scale=1.0, zero=None, iterations=2, subdiv_type="catclark",
                     padding=None, value_range=None, autobump=True, max_polys=DEFAULT_MAX_POLYS, name=None,
                     adaptive_error=None):
    """Displacement the Arnold way: map (Raw) into a displacementShader on the SG's displacement
    slot, amplitude on the shader's scale, zero value, padding, autobump and subdivision per
    shape (JHILL 00:26:26 to 00:29:12; SS Displacement, Bounds Padding). Smooth Mesh Preview is
    turned off (never stack it on Arnold subdivision). Raises when faces x 4^iterations exceeds
    max_polys. source: a file node or a path. Returns a report."""
    cmds = _cmds()
    base = name or re.sub(r"_SG$", "", sg)
    if cmds.objExists(source) and cmds.nodeType(source) == "file":
        f = source
        path = cmds.getAttr(f + ".fileTextureName")
    else:
        path = source
        f = file_texture(path, base + "_displacement_TEX", "raw", gray=True)
    if zero is None:
        zero, why = infer_zero_value(path)
    else:
        why = "given"
    ext = path.rsplit(".", 1)[-1].lower()
    if value_range is None:
        value_range = (-1.0, 1.0) if ext in FLOAT_EXTS else (0.0, 1.0)     # [added] measure the map if you can
    d = _get_or_create("displacementShader", base + "_DSP", asShader=True)
    cmds.connectAttr(f + ".outColorR", d + ".displacement", force=True)
    cmds.setAttr(d + ".scale", scale)
    cmds.connectAttr(d + ".displacement", sg + ".displacementShader", force=True)
    for a in ("aiDisplacementZeroValue", "aiDispZeroValue"):              # shader-side zero adds: keep 0 [verify]
        if cmds.attributeQuery(a, node=d, exists=True):
            cmds.setAttr(d + "." + a, 0.0)
    pad = padding if padding is not None else bounds_padding(scale, zero, value_range)
    shapes = _shapes(meshes) if meshes else _shapes(cmds.sets(sg, q=True) or [])
    rep = {"file": f, "node": d, "zero": zero, "zero_reason": why, "scale": scale, "padding": pad,
           "iterations": iterations, "shapes": {}, "missing_attrs": []}
    for s in shapes:
        faces = cmds.polyEvaluate(s, face=True)
        polys = subdiv_polys(faces, iterations)
        if polys > max_polys:
            raise ValueError("%s: %d faces x 4^%d = %d polygons > %d; lower iterations or rely on autobump"
                             % (s, faces, iterations, polys, max_polys))
        cmds.setAttr(s + ".displaySmoothMesh", 0)
        if not set_enum(s + ".aiSubdivType", subdiv_type):
            rep["missing_attrs"].append(s + ".aiSubdivType")
        for a, v in (("aiSubdivIterations", iterations), ("aiDispZeroValue", zero), ("aiDispPadding", pad),
                     ("aiDispAutobump", 1 if autobump else 0), ("aiDispHeight", 1.0)):
            if cmds.attributeQuery(a, node=s, exists=True):
                cmds.setAttr("%s.%s" % (s, a), v)
            else:
                rep["missing_attrs"].append("%s.%s" % (s, a))
        if adaptive_error is not None and cmds.attributeQuery("aiSubdivPixelError", node=s, exists=True):
            cmds.setAttr(s + ".aiSubdivPixelError", adaptive_error)
        rep["shapes"][s] = {"faces": faces, "polys": polys}
    return rep


def mm_to_scene(mm):
    unit = _cmds().currentUnit(q=True, linear=True)
    per_mm = {"mm": 1.0, "cm": 0.1, "m": 0.001, "in": 1.0 / 25.4, "ft": 1.0 / 304.8, "yd": 1.0 / 914.4}
    if unit not in per_mm:
        raise ValueError("unknown linear unit %s" % unit)
    return mm * per_mm[unit]


def apply_preset(shader, name, overrides=None, convert=True, mesh=None):
    """Apply a PRESETS entry (canonical OpenPBR semantics) to an OpenPBR or Standard Surface
    shader; Standard Surface gets the translated values (openpbr_to_standard). Units in the
    preset (skin radius in mm) are converted to scene units; glass depth follows `mesh`."""
    cmds = _cmds()
    pr = preset(name)
    fam = family_of_type(cmds.nodeType(shader))
    values = dict(pr["values"])
    for key, (unit, amount) in pr.get("units", {}).items():
        if unit == "mm":
            values[key] = mm_to_scene(amount)
    values.update(overrides or {})
    notes = []
    if fam == "standard":
        values, notes = openpbr_to_standard(values, pr.get("metal"))
    elif fam != "openpbr":
        raise ValueError("%s is %s: presets target OpenPBR or Standard Surface" % (shader, cmds.nodeType(shader)))
    rep = set_values(shader, values, convert=convert)
    rep.update(preset=name, source=pr["source"], added=pr["added"], requires=pr["requires"], notes=notes + (
        [pr["notes"]] if pr["notes"] else []))
    if mesh and (values.get("transmission_weight") or 0) > 0:
        rep["transmission_depth"] = set_transmission_depth(shader, mesh)
    return rep


def set_transmission_depth(shader, mesh, factor=1.0):
    """Transmission depth = smallest bounding-box size of the mesh x factor [added start], so
    absorption reads across the object's thickness (OPBR: 'a world space length'; ARVID: lower
    depth deepens the tint). Tune by eye afterwards."""
    cmds = _cmds()
    bb = cmds.exactWorldBoundingBox(mesh)
    size = min(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2])
    size = size if size > 0 else max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2])
    depth = size * factor
    cmds.setAttr("%s.%s" % (shader, resolve_attr(shader, "transmission_depth")), depth)
    return depth


def skin(name, meshes=None, color_file=None, radius_mm=1.0, shader_type="openPBRSurface", oil_mask_from=None,
         oil_range=(0.3, 0.6)):
    """Skin in one shader (JHILL 00:16:53 to 00:19:36): colour map into subsurface colour,
    subsurface 1, radius scale (1, 0.35, 0.2), radius in mm converted to scene units, IOR 1.4.
    oil_mask_from: the roughness file node; its inverted, crunched value drives coat weight with
    coat roughness 0.1 (JHILL 00:30:40, an aiRange replaces his custom aiRampFloat [added])."""
    cmds = _cmds()
    sh, sg = get_or_create_material(name, shader_type)
    rep = apply_preset(sh, "skin", overrides={"subsurface_radius": mm_to_scene(radius_mm)})
    if color_file:
        dst = "%s.%s" % (sh, resolve_attr(sh, "subsurface_color"))
        connect_map(color_file, dst)
    if oil_mask_from:
        r = _get_or_create("aiRange", name + "_OIL_RNG", asUtility=True)
        cmds.connectAttr(oil_mask_from + ".outColor", r + ".input", force=True)
        for a, v in (("inputMin", oil_range[0]), ("inputMax", oil_range[1]), ("outputMin", 1.0), ("outputMax", 0.0)):
            cmds.setAttr("%s.%s" % (r, a), v)
        cmds.connectAttr(r + ".outColorR", "%s.%s" % (sh, resolve_attr(sh, "coat_weight")), force=True)
        apply_preset(sh, "skin_oil_coat")
    assign(sg, _shapes(meshes))
    rep.update(shader=sh, sg=sg)
    return rep


def hair_shader(name, color="brown", targets=None, base_color_file=None, scattering_mode="adaptive"):
    """aiStandardHair with physical defaults (HAIR): melanin by colour or 0 with a textured base
    colour, roughness 0.2, IOR 1.55, shift 3, diffuse 0, tints white; scattering mode adaptive
    when MtoA 5.6 exposes it (WN27). targets: XGen description or curve shapes."""
    cmds = _cmds()
    ensure_arnold()
    sh, sg = get_or_create_material(name, "aiStandardHair")
    vals = dict(HAIR_BASE)
    vals.update(HAIR_PRESETS["textured" if base_color_file else color])
    rep = set_values(sh, vals, convert=False)
    if base_color_file:
        connect_map(base_color_file, "%s.%s" % (sh, resolve_attr(sh, "base_color")))
    a = resolve_attr(sh, "scattering_mode", required=False)
    if a and scattering_mode:
        rep["scattering_mode"] = set_enum("%s.%s" % (sh, a), scattering_mode)
    if targets:
        cmds.sets(targets, e=True, forceElement=sg)
    rep.update(shader=sh, sg=sg)
    return rep


LOBE_WEIGHTS = {"base": "base_weight", "specular": "specular_weight", "transmission": "transmission_weight",
               "subsurface": "subsurface_weight", "coat": "coat_weight", "fuzz": "fuzz_weight",
               "thin_film": "thin_film_weight", "emission": "emission_luminance"}


def isolate_lobes(shader, keep=("base",)):
    """ARVID 00:36:52 'I just kill everything': zero every lobe weight except `keep`, render,
    then add the next lobe. Returns the saved {attr: value} for restore_values(); connected
    weights are left alone and listed under '_connected'."""
    cmds = _cmds()
    saved, connected = {}, []
    for lobe, key in LOBE_WEIGHTS.items():
        attr = resolve_attr(shader, key, required=False)
        if not attr:
            continue
        plug = "%s.%s" % (shader, attr)
        if cmds.listConnections(plug, source=True, destination=False):
            connected.append(attr)
            continue
        saved[attr] = cmds.getAttr(plug)
        if lobe not in keep:
            cmds.setAttr(plug, 0.0)
    saved["_connected"] = connected
    return saved


def restore_values(shader, saved):
    cmds = _cmds()
    for attr, v in saved.items():
        if not attr.startswith("_"):
            cmds.setAttr("%s.%s" % (shader, attr), v)


def roughness_breakup(shader, lo, hi, scale=15.0, octaves=3, key="specular_roughness", name=None):
    """aiNoise -> aiRange (smoothstep, output lo..hi) -> roughness (ARVID 00:09:40 to 00:10:47:
    noise scale 10 to 20, range 0.2 to 0.4 for rubber). Returns the created nodes."""
    cmds = _cmds()
    base = name or shader.replace("_MTL", "") + "_" + key
    n = _get_or_create("aiNoise", base + "_NOISE", asTexture=True)
    set_plug(n + ".scale", (scale, scale, scale))
    if cmds.attributeQuery("octaves", node=n, exists=True):
        cmds.setAttr(n + ".octaves", octaves)
    r = _get_or_create("aiRange", base + "_RNG", asUtility=True)
    cmds.connectAttr(n + ".outColor", r + ".input", force=True)
    for a, v in (("outputMin", lo), ("outputMax", hi), ("smoothstep", 1)):
        cmds.setAttr("%s.%s" % (r, a), v)
    cmds.connectAttr(r + ".outColorR", "%s.%s" % (shader, resolve_attr(shader, key)), force=True)
    return {"noise": n, "range": r}


def smudge_roughness(shader, amount=0.15, file=None, scale=20.0, key="specular_roughness", name=None):
    """Smudges and fingerprints on polished metal and glass, read only in reflections (OPBR
    Specular Roughness: a fingerprint map is the doc's own roughness example). Source: a
    grayscale smudge or fingerprint scan (Raw, outColorR), else Arvid's procedural route for
    smudge-like breakup (ARVID 00:25:11 to 00:27:22: aiCellNoise worley [verify label],
    aiComplement, aiRange with output max about 0.15). The smudge is ADDED to what drives
    roughness now, a value or a connection such as roughness_breakup [added composition], so
    the clean areas keep the polish. Restrict it per object with user_mask. Returns the nodes."""
    cmds = _cmds()
    base = name or shader.replace("_MTL", "") + "_smudge"
    plug = "%s.%s" % (shader, resolve_attr(shader, key))
    prev = (cmds.listConnections(plug, source=True, destination=False, plugs=True) or [None])[0]
    prev_val = None if prev else cmds.getAttr(plug)
    nodes = {}
    if file:
        src = file_texture(file, base + "_TEX", "raw", gray=True)
        nodes["file"] = src
    else:
        c = _get_or_create("aiCellNoise", base + "_CELL", asTexture=True)
        if not set_enum(c + ".pattern", "worley"):
            raise ValueError("aiCellNoise has no worley pattern [verify labels]")
        set_plug(c + ".scale", (scale, scale, scale))
        inv = _get_or_create("aiComplement", base + "_INV", asUtility=True)
        cmds.connectAttr(c + ".outColor", inv + ".input", force=True)
        src = inv
        nodes.update(cell=c, complement=inv)
    r = _get_or_create("aiRange", base + "_RNG", asUtility=True)
    cmds.connectAttr(src + ".outColor", r + ".input", force=True)
    for a, v in (("outputMin", 0.0), ("outputMax", amount)):
        cmds.setAttr("%s.%s" % (r, a), v)
    add = _get_or_create("aiAdd", base + "_ADD", asUtility=True)                  # [verify] aiAdd input1/input2
    if prev:
        cmds.connectAttr(prev, add + ".input1R", force=True)
    else:
        set_plug(add + ".input1", (prev_val, prev_val, prev_val))
    cmds.connectAttr(r + ".outColor", add + ".input2", force=True)
    cmds.connectAttr(add + ".outColorR", plug, force=True)
    nodes.update(range=r, add=add, previous=prev or prev_val)
    return nodes


def noise_bump(shader, height=0.01, scale=450.0, pattern="alligator", octaves=3, key="geometry_normal",
               name=None, upstream=None):
    """aiCellNoise (alligator) red channel -> aiBump2d -> shader normal (ARVID 00:04:33: scale
    400 to 500, 2 or 3 octaves, very subtle). upstream: a previous bump's outValue, chained into
    this bump's normal (ARVID 00:08:34 chains coarse to fine)."""
    cmds = _cmds()
    base = name or shader.replace("_MTL", "") + "_micro"
    c = _get_or_create("aiCellNoise", base + "_CELL", asTexture=True)
    if not set_enum(c + ".pattern", pattern):
        raise ValueError("aiCellNoise has no pattern %s [verify labels]" % pattern)
    set_plug(c + ".scale", (scale, scale, scale))
    if cmds.attributeQuery("octaves", node=c, exists=True):
        cmds.setAttr(c + ".octaves", octaves)
    b = _get_or_create("aiBump2d", base + "_BMP", asUtility=True)
    cmds.connectAttr(c + ".outColorR", b + ".bumpMap", force=True)
    cmds.setAttr(b + ".bumpHeight", height)
    if upstream:
        cmds.connectAttr(upstream, b + ".normal", force=True)
    if key:
        cmds.connectAttr(b + ".outValue", "%s.%s" % (shader, resolve_attr(shader, key)), force=True)
    return {"cell": c, "bump": b, "out": b + ".outValue"}


def coat_waviness(shader, scales=(3.0, 25.0, 80.0, 200.0), mix=0.01, height=1.0, name=None):
    """Orange peel and panel waviness on the COAT normal, not the base normal (ARVID 00:43:25 to
    00:47:46): aiNoise at scales 3, 25, 80, 200, each mixed about 0.01 in an aiLayerFloat, into an
    aiBump2d whose output drives the coat normal."""
    cmds = _cmds()
    base = name or shader.replace("_MTL", "") + "_coatWave"
    lf = _get_or_create("aiLayerFloat", base + "_LYR", asUtility=True)
    noises = []
    for i, s in enumerate(scales, 1):
        n = _get_or_create("aiNoise", "%s_N%d" % (base, i), asTexture=True)
        set_plug(n + ".scale", (s, s, s))
        cmds.connectAttr(n + ".outColorR", "%s.input%d" % (lf, i), force=True)
        for a, v in (("enable%d" % i, 1), ("mix%d" % i, mix)):
            if cmds.attributeQuery(a, node=lf, exists=True):
                cmds.setAttr("%s.%s" % (lf, a), v)
        noises.append(n)
    b = _get_or_create("aiBump2d", base + "_BMP", asUtility=True)
    cmds.connectAttr(lf + ".outValue", b + ".bumpMap", force=True)
    cmds.setAttr(b + ".bumpHeight", height)
    cmds.connectAttr(b + ".outValue", "%s.%s" % (shader, resolve_attr(shader, "geometry_coat_normal")), force=True)
    return {"layer": lf, "noises": noises, "bump": b}


def user_mask(shapes, name, value=1, default=0):
    """Per-object mask without textures (ARVID 00:23:04): an int mtoa_constant_<name> on each
    shape, read by aiUserDataInt (default elsewhere). Returns the reader node."""
    cmds = _cmds()
    attr = "mtoa_constant_" + name
    for s in _shapes(shapes):
        if not cmds.attributeQuery(attr, node=s, exists=True):
            cmds.addAttr(s, longName=attr, attributeType="long", defaultValue=default)
        cmds.setAttr(s + "." + attr, value)
    r = _get_or_create("aiUserDataInt", name + "_UDATA", asUtility=True)
    cmds.setAttr(r + ".attribute", name, type="string")
    if cmds.attributeQuery("default", node=r, exists=True):
        cmds.setAttr(r + ".default", default)
    return r


def car_paint(name, base_color, flake_color=None, meshes=None, flake_scale=0.025, flake_roughness=0.2,
              waviness=True):
    """aiCarPaint built bottom-up (ARVID 00:36:52 to 00:47:46): base, specular up (flakes need it),
    flakes (scale about 0.025 at car scale, roughness 0.2), coat 1, coat-normal waviness. Colours
    are linear Rec.709 and converted to the rendering space. Render after each layer."""
    ensure_arnold()
    sh, sg = get_or_create_material(name, "aiCarPaint")
    vals = {"base_weight": 1.0, "base_color": base_color, "specular_weight": 1.0,
            "flake_scale": flake_scale, "flake_roughness": flake_roughness, "coat_weight": 1.0}
    if flake_color:
        vals["flake_color"] = flake_color
    rep = set_values(sh, vals)
    if waviness:
        rep["waviness"] = coat_waviness(sh)
    assign(sg, _shapes(meshes))
    rep.update(shader=sh, sg=sg)
    return rep


# --------------------------------------------------------------------------- lookdev scene
def _xform_and_shape(node):
    cmds = _cmds()
    if cmds.nodeType(node) == "transform":
        return node, (cmds.listRelatives(node, shapes=True, fullPath=True) or [node])[0]
    return (cmds.listRelatives(node, parent=True, fullPath=True) or [node])[0], node


def _transform(name, parent=None):
    cmds = _cmds()
    if not cmds.objExists(name):
        name = cmds.createNode("transform", name=name)
    if parent and (cmds.listRelatives(name, parent=True) or [None])[0] != parent.split("|")[-1]:
        name = cmds.parent(name, parent)[0]
    return name


def _hide_from_secondary_rays(shape):
    """Reference objects must not appear in the asset's reflections or cast on it [added]."""
    cmds = _cmds()
    done = []
    for a, v in (("castsShadows", 0), ("aiVisibleInDiffuseReflection", 0), ("aiVisibleInSpecularReflection", 0),
                 ("aiVisibleInDiffuseTransmission", 0), ("aiVisibleInSpecularTransmission", 0),
                 ("aiVisibleInVolume", 0), ("visibleInReflections", 0), ("visibleInRefractions", 0)):
        if cmds.attributeQuery(a, node=shape, exists=True):
            cmds.setAttr("%s.%s" % (shape, a), v)
            done.append(a)
    return done


def lookdev_scene(asset=None, hdri=None, frames=24, focal=85.0, aspect=16.0 / 9.0, elevation=10.0,
                  grey=0.18, refs=True, background=True, out_dir=None, resolution_cap=4096, margin=1.15,
                  hdri_rotate=0.0, shader_type="openPBRSurface", width=1280):
    """The lookdev contract (RAYC 00:04:02 to 00:08:54): camera with chrome ball, grey ball and a
    diffuse colour chart as children; asset spins on one locator, then the HDRI on another; HDRI
    tagged linear Rec.709 (not Raw) under ACEScg (CM); skydome resolution = HDRI width up to a
    cap (LGT Resolution). hdri=None writes the procedural studio HDR [added]. focal 85 mm is J
    Hill's portrait lens (JHILL 00:05:10); use longer for products [added]. Returns names."""
    cmds = _cmds()
    mxr = _mxr()
    ensure_arnold()
    notes = []
    out_dir = out_dir or os.path.join(cmds.workspace(q=True, rootDirectory=True), "sourceimages", "lookdev")
    os.makedirs(out_dir, exist_ok=True)
    roots = [a for a in ([asset] if isinstance(asset, str) else list(asset or []))]
    cmds.currentTime(1)
    if roots:
        bb = cmds.exactWorldBoundingBox(roots)
    else:
        bb = (-1.0, -1.0, -1.0, 1.0, 1.0, 1.0)
        notes.append("no asset: framing a unit sphere")
    center = ((bb[0] + bb[3]) / 2.0, (bb[1] + bb[4]) / 2.0, (bb[2] + bb[5]) / 2.0)
    radius = 0.5 * math.sqrt((bb[3] - bb[0]) ** 2 + (bb[4] - bb[1]) ** 2 + (bb[5] - bb[2]) ** 2) or 1.0
    up = cmds.upAxis(q=True, axis=True)
    root = _transform("lookdev_GRP")
    a_loc = _transform("asset_turntable_LOC", root)
    h_loc = _transform("hdri_turntable_LOC", root)
    cmds.setAttr(a_loc + ".translate", *center, type="double3")
    keys = turntable_keys(frames)
    spin = "rotateZ" if up == "z" else "rotateY"
    for loc, k in ((a_loc, keys["asset"]), (h_loc, keys["hdri"])):
        cmds.cutKey(loc, attribute=spin, clear=True)
        for t, v in k:
            cmds.setKeyframe(loc, attribute=spin, time=t, value=v)
        cmds.keyTangent(loc, attribute=spin, inTangentType="linear", outTangentType="linear")
    for r in roots:
        if (cmds.listRelatives(r, parent=True, fullPath=True) or [""])[0].split("|")[-1] != a_loc:
            cmds.parent(r, a_loc)
    # HDRI and dome
    if not hdri:
        hdri = write_rgbe_hdr(os.path.join(out_dir, "mx_studio.hdr"), 512, 256, studio_hdr_pixel(512, 256))
        notes.append("procedural studio HDR written (%s): replace with a real HDRI or Painter's" % hdri)
    hinfo = image_info(hdri)
    if cmds.objExists("lookdev_SKY"):
        sky_x, sky_s = _xform_and_shape("lookdev_SKY")
    else:
        sky_x, sky_s = _xform_and_shape(cmds.shadingNode("aiSkyDomeLight", asLight=True, name="lookdev_SKY"))
    try:                                      # lights illuminate through defaultLightSet [added guard, verify]
        if cmds.objExists("defaultLightSet") and not cmds.sets(sky_x, isMember="defaultLightSet"):
            cmds.sets(sky_x, add="defaultLightSet")
    except Exception as exc:
        notes.append("defaultLightSet check failed: %s" % exc)
    if (cmds.listRelatives(sky_x, parent=True) or [""])[0] != h_loc:
        sky_x = cmds.parent(sky_x, h_loc)[0]
        sky_x, sky_s = _xform_and_shape(sky_x)
    cmds.setAttr(sky_x + ".rotateY", hdri_rotate)
    hdr_tex = file_texture(hdri, "lookdev_HDRI_TEX", "linear_srgb")
    cmds.connectAttr(hdr_tex + ".outColor", sky_s + ".color", force=True)
    set_enum(sky_s + ".format", "latlong")
    if hinfo.get("width") and cmds.attributeQuery("resolution", node=sky_s, exists=True):
        cmds.setAttr(sky_s + ".resolution", min(int(hinfo["width"]), int(resolution_cap)))
    cam_vis = next((a for a in ("camera", "aiCamera") if cmds.attributeQuery(a, node=sky_s, exists=True)), None)
    if cam_vis:
        cmds.setAttr(sky_s + "." + cam_vis, 1.0 if background else 0.0)
    # camera
    if cmds.objExists("lookdev_CAM"):
        cam, cam_s = _xform_and_shape("lookdev_CAM")
    else:
        cam, cam_s = cmds.camera(name="lookdev_CAM")
        cam = cmds.rename(cam, "lookdev_CAM")
        cam, cam_s = _xform_and_shape(cam)
    if (cmds.listRelatives(cam, parent=True) or [""])[0] != "lookdev_GRP":
        cam = cmds.parent(cam, root)[0]
        cam, cam_s = _xform_and_shape(cam)
    cmds.setAttr(cam_s + ".focalLength", focal)
    cmds.setAttr(cam_s + ".horizontalFilmAperture", 36.0 / 25.4)
    cmds.setAttr(cam_s + ".verticalFilmAperture", 36.0 / 25.4 / aspect)
    set_enum(cam_s + ".filmFit", "horizontal")
    dist = frame_distance(radius, focal, 36.0, aspect, margin)
    el = math.radians(elevation)
    d = mxr.map_dir((0.0, math.sin(el), math.cos(el)), up)
    pos = tuple(center[i] + d[i] * dist for i in range(3))
    rot = mxr.aim_rotation(d, up)
    if cmds.currentUnit(q=True, angle=True) == "rad":
        rot = tuple(math.radians(x) for x in rot)
    cmds.setAttr(cam + ".rotateOrder", 0)
    cmds.setAttr(cam + ".translate", *pos, type="double3")
    cmds.setAttr(cam + ".rotate", *rot, type="double3")
    depth = max(0.35 * (dist - radius), 1e-3)
    cmds.setAttr(cam_s + ".nearClipPlane", depth * 0.2)
    cmds.setAttr(cam_s + ".farClipPlane", max(dist * 20.0, 1000.0))
    made = {"root": root, "camera": cam, "camera_shape": cam_s, "asset_loc": a_loc, "hdri_loc": h_loc,
            "sky": sky_x, "sky_shape": sky_s, "hdri": hdri, "hdri_info": hinfo, "hdri_texture": hdr_tex,
            "distance": dist, "frames": keys["range"], "notes": notes, "refs": {}}
    if refs:
        made["refs"] = _reference_strip(cam, depth, focal, aspect, grey, out_dir, shader_type)
    cmds.playbackOptions(minTime=keys["range"][0], maxTime=keys["range"][1],
                         animationStartTime=keys["range"][0], animationEndTime=keys["range"][1])
    cmds.setAttr("defaultResolution.width", int(width))
    cmds.setAttr("defaultResolution.height", int(round(width / aspect)))
    cmds.setAttr("defaultResolution.deviceAspectRatio", aspect)
    return made


def _reference_strip(cam, depth, focal, aspect, grey, out_dir, shader_type):
    cmds = _cmds()
    lay = ref_strip_layout(depth, focal, 36.0, aspect)
    grp = _transform("ref_GRP", cam)
    for a in ("translate", "rotate"):
        cmds.setAttr(grp + "." + a, 0, 0, 0, type="double3")
    out = {}
    for key, preset_name in (("chrome", "mirror_chrome_ball"), ("grey", "grey_ball")):
        x, y, z, r = lay[key]
        geo = "ref_%s_GEO" % key
        if not cmds.objExists(geo):
            geo = cmds.polySphere(name=geo, radius=1.0, subdivisionsAxis=48, subdivisionsHeight=32)[0]
            geo = cmds.parent(geo, grp, relative=True)[0]
        cmds.setAttr(geo + ".translate", x, y, z, type="double3")
        cmds.setAttr(geo + ".scale", r, r, r, type="double3")
        sh, sg = get_or_create_material("ref_" + key, shader_type)
        apply_preset(sh, preset_name, overrides={"base_color": (grey, grey, grey)} if key == "grey" else None)
        assign(sg, [geo])
        shape = cmds.listRelatives(geo, shapes=True, fullPath=True)[0]
        out[key] = {"geo": geo, "shader": sh, "hidden_from": _hide_from_secondary_rays(shape)}
    x, y, z, (w, h) = lay["chart"]
    geo = "ref_chart_GEO"
    if not cmds.objExists(geo):
        geo = cmds.polyPlane(name=geo, width=1.0, height=1.0, subdivisionsX=1, subdivisionsY=1, axis=(0, 0, 1))[0]
        geo = cmds.parent(geo, grp, relative=True)[0]
    cmds.setAttr(geo + ".translate", x, y, z, type="double3")
    cmds.setAttr(geo + ".scale", w, h, 1.0, type="double3")
    chart_png, _ = write_color_checker(os.path.join(out_dir, "mx_color_checker.png"))
    sh, sg = get_or_create_material("ref_chart", shader_type)
    apply_preset(sh, "chart_diffuse")
    tex = file_texture(chart_png, "ref_chart_TEX", "srgb")
    connect_map(tex, "%s.%s" % (sh, resolve_attr(sh, "base_color")))
    assign(sg, [geo])
    shape = cmds.listRelatives(geo, shapes=True, fullPath=True)[0]
    out["chart"] = {"geo": geo, "shader": sh, "texture": chart_png, "hidden_from": _hide_from_secondary_rays(shape)}
    return out


def render_frames(frames, out_dir, camera="lookdev_CAM", width=None, height=None, samples=None,
                  name="lookdev", sheet=True, columns=4, tile=320):
    """Render frames through `camera` to display-referred PNGs (output transform on, restored
    after) and a labelled contact sheet (mx_review.contact_sheet). Render settings it touches
    are restored; samples (dict of defaultArnoldRenderOptions attrs) are left as set."""
    cmds = _cmds()
    import maya.mel as mel
    mxr = _mxr()
    ensure_arnold()
    os.makedirs(out_dir, exist_ok=True)
    cam, cam_s = _xform_and_shape(camera)
    saved = []

    def put(plug, value, typ=None):
        saved.append((plug, cmds.getAttr(plug), typ))
        if typ:
            cmds.setAttr(plug, value, type=typ)
        else:
            cmds.setAttr(plug, value)
    notes = []
    cm_saved = None
    t0 = time.time()
    paths = []
    now = cmds.currentTime(q=True)
    try:
        put("defaultRenderGlobals.currentRenderer", "arnold", "string")
        put("defaultRenderGlobals.animation", 0)
        put("defaultRenderGlobals.imageFormat", 32)
        put("defaultRenderGlobals.imfPluginKey", "png", "string")
        put("defaultArnoldDriver.ai_translator", "png", "string")
        put("defaultRenderGlobals.imageFilePrefix", "", "string")
        if width:
            put("defaultResolution.width", int(width))
        if height:
            put("defaultResolution.height", int(height))
        for k, v in (samples or {}).items():
            cmds.setAttr("defaultArnoldRenderOptions." + k, v)
        for c in cmds.ls(type="camera", long=True) or []:
            put(c + ".renderable", 1 if c == cmds.ls(cam_s, long=True)[0] else 0)
        try:
            cm_saved = (cmds.colorManagementPrefs(q=True, outputTarget="renderer", outputTransformEnabled=True),
                        cmds.colorManagementPrefs(q=True, outputTarget="renderer", outputUseViewTransform=True))
            cmds.colorManagementPrefs(e=True, outputTarget="renderer", outputTransformEnabled=True)
            cmds.colorManagementPrefs(e=True, outputTarget="renderer", outputUseViewTransform=True)
        except Exception as exc:
            notes.append("output transform not set (%s): PNGs are scene-linear" % exc)
        for fr in frames:
            cmds.currentTime(fr)
            prefix = os.path.join(out_dir, "_raw", "%s_%04d" % (name, fr))
            os.makedirs(os.path.dirname(prefix), exist_ok=True)
            cmds.setAttr("defaultRenderGlobals.imageFilePrefix", prefix, type="string")
            t1 = time.time()
            mel.eval("arnoldRender -b;")                                    # [verify] as mx_review
            found = [p for p in glob.glob(prefix + "*.png") + glob.glob(os.path.join(
                cmds.workspace(q=True, rootDirectory=True), "images", "**", "%s_%04d*.png" % (name, fr)),
                recursive=True) if os.path.getmtime(p) >= t1 - 1]
            if not found:
                raise RuntimeError("Arnold wrote no PNG for frame %s" % fr)
            dst = os.path.join(out_dir, "%s.%04d.png" % (name, fr))
            shutil.copyfile(sorted(found, key=os.path.getmtime)[-1], dst)
            paths.append(dst)
    finally:
        for plug, val, typ in reversed(saved):
            try:
                if typ:
                    cmds.setAttr(plug, "" if val is None else val, type=typ)
                else:
                    cmds.setAttr(plug, val)
            except Exception as exc:
                notes.append("restore %s: %s" % (plug, exc))
        if cm_saved:
            cmds.colorManagementPrefs(e=True, outputTarget="renderer", outputTransformEnabled=cm_saved[0])
            cmds.colorManagementPrefs(e=True, outputTarget="renderer", outputUseViewTransform=cm_saved[1])
        cmds.currentTime(now)
    rep = {"frames": paths, "seconds": round(time.time() - t0, 2), "notes": notes, "sheet": None}
    if sheet and paths:
        cells = []
        tw = tile
        w0, h0, _ = mxr.read_rgba(paths[0])
        th = max(1, int(round(tile * h0 / float(w0))))
        for fr, pth in zip(frames, paths):
            w, h, d = mxr.read_rgba(pth)
            cells.append(("F%d" % fr, mxr.downsample(w, h, mxr.rgba_to_rgb(d), tw, th)))
        rep["sheet"], rep["sheet_size"] = mxr.contact_sheet(cells, columns, tw, th, os.path.join(
            out_dir, name + "_sheet.png"), title=name.upper())
    return rep


# --------------------------------------------------------------------------- extract + lint
PASS_THROUGH = {"colorCorrect", "aiColorCorrect", "aiRange", "multiplyDivide", "aiMultiply", "reverse",
                "remapValue", "clamp", "aiClamp", "luminance", "aiLayerRgba", "layeredTexture", "blendColors",
                "plusMinusAverage", "aiComposite", "aiLayerFloat", "aiComplement", "gammaCorrect", "aiAdd",
                "aiSubtract", "aiDivide", "setRange", "contrast", "aiRampFloat", "aiRampRgb", "aiColorConvert",
                "aiUvTransform", "aiMix", "aiMixRgba"}
DATA_SINKS = {"bump2d", "bump3d", "aiNormalMap", "aiBump2d", "aiBump3d", "displacementShader", "aiVectorMap"}
LIGHT_TYPES = {"aiSkyDomeLight", "aiAreaLight", "aiMeshLight", "aiPhotometricLight", "spotLight", "pointLight",
               "directionalLight", "areaLight"}
_REVERSE = {}
for _fam in ("openpbr", "standard", "hair", "carpaint"):
    for _k, _cands in _table(_fam).items():
        for _c in _cands:
            _REVERSE.setdefault((_fam, _c), _k)


def _canonical(node_type, attr):
    fam = family_of_type(node_type)
    return _REVERSE.get((fam, attr.split("[")[0].split(".")[0]))


def _sink_role(cmds, node, attr):
    t = cmds.nodeType(node)
    a = attr.split("[")[0].split(".")[0]
    if t in DATA_SINKS:
        return "data"
    if t in LIGHT_TYPES:
        return "env" if a == "color" else "data"
    key = _canonical(t, a)
    if key:
        return "color" if key in COLOR_KEYS or (family_of_type(t) == "hair" and key.endswith("tint")) else "data"
    if a in ("color", "outColor", "incandescence", "transparency", "ambientColor"):
        return "color" if a != "transparency" else "data"
    return "unknown"


def _file_sinks(cmds, f, max_depth=5):
    sinks, seen = [], set()
    stack = [(f, 0)]
    while stack:
        node, depth = stack.pop()
        pairs = cmds.listConnections(node, source=False, destination=True, plugs=True, connections=True) or []
        for i in range(0, len(pairs), 2):
            src, dst = pairs[i], pairs[i + 1]
            dn, da = dst.split(".", 1)
            if (src, dst) in seen:
                continue
            seen.add((src, dst))
            dt = cmds.nodeType(dn)
            if dt in PASS_THROUGH and depth < max_depth:
                stack.append((dn, depth + 1))
            elif dt not in ("place2dTexture", "shadingEngine", "materialInfo", "defaultTextureList",
                            "hyperShadePrimaryNodeEditorSavedTabsInfo", "nodeGraphEditorInfo"):
                sinks.append((node, src.split(".", 1)[1], dn, dt, da))
    return sinks


def _upstream_types(cmds, plug, max_depth=6):
    """Node types feeding a plug, walking sources up to max_depth (which texture drives roughness)."""
    types_, stack, seen = [], [(plug, 0)], set()
    while stack:
        p, d = stack.pop()
        for src in cmds.listConnections(p, source=True, destination=False) or []:
            if src in seen:
                continue
            seen.add(src)
            types_.append(cmds.nodeType(src))
            if d < max_depth:
                stack.append((src, d + 1))
    return sorted(set(types_))


def _safe_get(cmds, plug, default=None):
    try:
        v = cmds.getAttr(plug)
        if isinstance(v, list) and len(v) == 1 and isinstance(v[0], tuple):
            return tuple(v[0])
        return v
    except Exception:
        return default


def extract(roots=None, hero=None):
    """Plain data for lint(): files, shaders, shading groups, mesh shapes, colour management.
    roots limits shapes to those under the given transforms; hero lists shader names that must
    carry breakup (uniform-roughness rule)."""
    cmds = _cmds()
    info = cm_info()
    inputs = info.get("inputs") or []
    raw_names = [n for n in inputs if _norm(n) in ("raw", "utilityraw")] or ["Raw"]
    data = {"rendering_space": info.get("rendering_space"), "raw_names": raw_names, "files": [], "shaders": [],
            "sgs": [], "shapes": [], "cm": {k: info.get(k) for k in ("rendering_space", "view", "config")}}
    for f in cmds.ls(type="file") or []:
        path = cmds.getAttr(f + ".fileTextureName") or ""
        ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
        sinks = _file_sinks(cmds, f)
        roles = set(_sink_role(cmds, n, a) for _, _, n, _, a in sinks)
        roles.discard("unknown")
        sp = split_texture_name(path) if path else None
        name_ch = classify_stem(sp[0])[0] if sp else None
        name_role = CHANNELS[name_ch][1] if name_ch else None
        if "env" in roles:
            role = "env"
        elif name_role == "data" and roles:
            role = "data"          # J Hill's question 'what is this map': an AO multiplied into colour stays data
        elif {"color", "data"} <= roles:
            role = "mixed"
        else:
            role = roles.pop() if roles else "unknown"
        direct = cmds.listConnections(f, source=False, destination=True, plugs=True, connections=True) or []
        src_plugs = set()
        for i in range(0, len(direct), 2):
            dn, da = direct[i + 1].split(".", 1)
            plug = direct[i].split(".", 1)[1]
            if plug == "outAlpha" and cmds.nodeType(dn) == "bump2d" and da.startswith("bumpValue") and (
                    _safe_get(cmds, dn + ".bumpInterp", 0) or 0) != 0:
                continue           # tangent/object-space normal mode reads the file's colour, not its alpha
            src_plugs.add(plug)
        mode_idx = _safe_get(cmds, f + ".uvTilingMode", 0)
        udim_mode = bool(mode_idx) and _enum_index(f + ".uvTilingMode", "udim") == mode_idx
        first = path.replace("<UDIM>", "1001").replace("<udim>", "1001")
        normal_like = name_ch == "normal"
        direct_nrm = any(_canonical(cmds.nodeType(n), a) == "geometry_normal" for _, _, n, _, a in sinks
                         if cmds.nodeType(n) not in DATA_SINKS)
        bump_interp = None
        for _, _, n, t, _ in sinks:
            if t == "bump2d":
                bump_interp = _safe_get(cmds, n + ".bumpInterp")
        tx_sib = (first.rsplit(".", 1)[0] + ".tx") if path and ext != "tx" else None
        rec = {"node": f, "path": path, "ext": ext, "color_space": _safe_get(cmds, f + ".colorSpace"),
               "has_tx": os.path.isfile(tx_sib) if tx_sib else None,
               "ignore_rules": bool(_safe_get(cmds, f + ".ignoreColorSpaceFileRules", 0)),
               "alpha_is_luminance": bool(_safe_get(cmds, f + ".alphaIsLuminance", 0)),
               "uses_out_alpha": "outAlpha" in src_plugs, "role": role,
               "sinks_short": sorted(set("%s.%s" % (n.split("|")[-1], a) for _, _, n, _, a in sinks))[:6],
               "udim_mode": udim_mode, "name_has_udim": bool(re.search(r"[._](1\d{3}|<udim>)\.[^.]+$", path, re.I)),
               "exists": os.path.isfile(first) if path else False, "normal_like": normal_like,
               "direct_to_shader_normal": direct_nrm and normal_like, "bump_interp": bump_interp,
               "has_alpha": image_info(first).get("alpha") if os.path.isfile(first) else None}
        data["files"].append(rec)
    hero = set(hero or [])
    for sh in cmds.ls(materials=True) or []:
        t = cmds.nodeType(sh)
        fam = family_of_type(t)
        if fam == "other":
            continue
        vals, con = {}, []
        for key, cands in _table(fam).items():
            a = next((c for c in cands if cmds.attributeQuery(c, node=sh, exists=True)), None)
            if not a:
                continue
            if cmds.listConnections("%s.%s" % (sh, a), source=True, destination=False):
                con.append(key)
            v = _safe_get(cmds, "%s.%s" % (sh, a))
            if isinstance(v, (int, float, tuple, bool)):
                vals[key] = v
        sgs = sorted(set(cmds.listConnections(sh + ".outColor", type="shadingEngine") or []))
        meshes = []
        for sg in sgs:
            meshes += _shapes(cmds.sets(sg, q=True) or [])
        ra = next((c for c in _table(fam).get("specular_roughness", ()) if cmds.attributeQuery(c, node=sh, exists=True)), None)
        rough_up = _upstream_types(cmds, "%s.%s" % (sh, ra)) if ra and "specular_roughness" in con else []
        data["shaders"].append({"node": sh, "type": t, "family": fam, "values": vals, "connected": con, "sgs": sgs,
                                "rough_upstream": rough_up,
                                "meshes": list(dict.fromkeys(meshes)), "default_name": bool(DEFAULT_NAME_RE.match(sh)),
                                "hero": sh in hero})
    for sg in cmds.ls(type="shadingEngine") or []:
        disp = (cmds.listConnections(sg + ".displacementShader", source=True, destination=False) or [None])[0]
        zero_sh = 0.0
        if disp:
            for a in ("aiDisplacementZeroValue", "aiDispZeroValue"):
                if cmds.attributeQuery(a, node=disp, exists=True):
                    zero_sh = _safe_get(cmds, "%s.%s" % (disp, a), 0.0) or 0.0
        data["sgs"].append({"sg": sg, "displacement": disp, "disp_zero_shader": zero_sh,
                            "disp_scale": _safe_get(cmds, disp + ".scale") if disp else None,
                            "members": _shapes(cmds.sets(sg, q=True) or []),
                            "default_name": bool(DEFAULT_NAME_RE.match(sg))})
    shapes = cmds.ls(type="mesh", noIntermediate=True, long=True) or []
    if roots:
        under = set()
        for r in roots:
            under.update(cmds.listRelatives(r, allDescendents=True, fullPath=True, type="mesh") or [])
        shapes = [s for s in shapes if s in under]
    for s in shapes:
        xf = cmds.listRelatives(s, parent=True, fullPath=True)[0]
        bb = cmds.exactWorldBoundingBox(xf)
        sgs = sorted(set(cmds.listConnections(s, type="shadingEngine") or []))
        g = lambda a, d=None: _safe_get(cmds, "%s.%s" % (s, a), d)
        st = g("aiSubdivType", 0)
        data["shapes"].append({
            "shape": s, "faces": cmds.polyEvaluate(s, face=True), "iterations": g("aiSubdivIterations", 0),
            "subdiv_type": st, "smooth_preview": bool(g("displaySmoothMesh", 0)), "padding": g("aiDispPadding", 0.0),
            "zero": g("aiDispZeroValue", 0.0), "autobump": bool(g("aiDispAutobump", 0)),
            "smooth_derivs": bool(g("aiSubdivSmoothDerivs", 0)),
            "has_uvs": bool(cmds.polyEvaluate(s, uvcoord=True)), "bbox_size": [bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]],
            "bbox": list(bb),
            "sgs": sgs, "unassigned": sgs in ([], ["initialShadingGroup"])})
    return data


def lint_scene(roots=None, hero=None, max_polys=DEFAULT_MAX_POLYS):
    return lint(extract(roots, hero), max_polys=max_polys)


def handoff_report(path=None, roots=None, hero=None):
    """What scenario-maya-lighting-rendering receives: materials, assignments, textures with colour
    spaces and .tx status, displacement settings, the lint and its verdict. Writes JSON."""
    cmds = _cmds()
    data = extract(roots, hero)
    issues = lint(data)
    files_by_node = {f["node"]: f for f in data["files"]}
    mats = []
    for sh in data["shaders"]:
        textures = []
        for fnode in cmds.listHistory(sh["node"], pruneDagObjects=True) or []:
            if fnode in files_by_node:
                f = files_by_node[fnode]
                base = f["path"].rsplit(".", 1)[0]
                textures.append({"node": fnode, "path": f["path"], "space": f["color_space"], "role": f["role"],
                                 "tx": os.path.isfile(base.replace("<UDIM>", "1001") + ".tx")})
        mats.append({"shader": sh["node"], "type": sh["type"], "sgs": sh["sgs"], "meshes": sh["meshes"],
                     "textures": textures})
    rep = {"scene": cmds.file(q=True, sceneName=True), "maya": cmds.about(version=True),
           "mtoa": cmds.pluginInfo("mtoa", q=True, version=True) if cmds.pluginInfo("mtoa", q=True, loaded=True)
           else None, "color_management": data["cm"], "materials": mats,
           "displacement": [s for s in data["sgs"] if s["displacement"]], "lint": issues, "verdict": verdict(issues)}
    if path:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "w") as fh:
            json.dump(rep, fh, indent=1, default=str)
    return rep


# =========================================================================== CLI (mx_run job)
def main(argv):
    """mx_run job entry: --lint | --build DIR --name N [--meshes a,b] [--shader T] |
    --lookdev ASSET[,ASSET] [--hdri P] [--frames N] [--render OUT] | --handoff PATH; --json P."""
    args = list(argv or [])

    def opt(flag, default=None):
        return args[args.index(flag) + 1] if flag in args else default
    out = {}
    if "--build" in args:
        out["build"] = build_material(opt("--build"), opt("--name", "asset"),
                                      meshes=[m for m in (opt("--meshes") or "").split(",") if m],
                                      shader_type=opt("--shader", "openPBRSurface"), texture_set=opt("--set"))
    if "--lookdev" in args:
        out["lookdev"] = lookdev_scene([a for a in opt("--lookdev").split(",") if a], hdri=opt("--hdri"),
                                       frames=int(opt("--frames", 24)))
        if "--render" in args:
            n = int(opt("--frames", 24))
            out["render"] = render_frames(list(range(1, 2 * n + 1, max(1, n // 4))), opt("--render"))
    if "--lint" in args or not out:
        issues = lint_scene()
        out["lint"] = {"issues": issues, "verdict": verdict(issues)}
    if "--handoff" in args:
        out["handoff"] = handoff_report(opt("--handoff"))
    if opt("--json"):
        with open(opt("--json"), "w") as fh:
            json.dump(out, fh, indent=1, default=str)
    return out


if __name__ == "__main__":
    print(json.dumps(main(sys.argv[1:]), indent=1, default=str))
