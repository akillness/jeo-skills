"""
ue_world.py: toolkit of the scenario-unreal-world-building skill (UE 5.8, macOS Apple Silicon).

Two layers in one file.

1. OFFLINE layer (system python3, stdlib only; numpy is optional and only used by the
   heightmap generator). Landscape sizing from Epic's valid-size rules, Z scale math,
   16-bit PNG and r16 heightmap writers, a blockout valley generator, World Partition grid
   and streaming checks, Data Layer and HLOD planning, PCG planning (hierarchical grids,
   grass rings, instance budgets, generation lead, CPU/GPU transfer detection, component
   audit, assembly tags, shape grammar strings), Nanite and tessellation rules, placement
   tiers, modular kit checks, region tiling for batch edits, a whole-world spec validator
   (check_world_spec), the budget and lighting handoff sheets, and argument builders for the
   World Partition builder commandlets (landscape, PCG, HLOD, conversion).
   v0.2 (2026-09-24 refactor after the U1 blind grade): heightmap Z scale and actor Z fitted
   from the real height range plus a 0-clipped-pixel gate (fit_heightmap_z,
   heightmap_clip_gate), terrain material contract (specular, cliff projection, anti-tiling),
   per-layer tessellation and feet error, Nanite construction audit from an OBJ export,
   PCG Data Layer / HLOD Layer inheritance, teleport generation sources, PCG graph lint,
   runtime grass input checks, recursive village path planning, world rules for validators,
   changelist and project-setting checks.
   Tested by tests/code/unreal-world-building/test_world_offline.py (passed offline).

2. IN-EDITOR layer (Editor Python inside UnrealEditor 5.8, `import unreal`).
   Map creation, world and landscape fact dumps, actor streaming properties, Data Layer and
   HLOD Layer assets, Nanite batch edits, PCG volume spawn and parameters, assembly tags,
   region-by-region batch edits, viewpoint tours, console helpers, an API probe, a PCG graph
   dump, a world census and a world-rules EditorValidatorBase.
   STATUS: NOT YET RUN IN UNREAL (the engine is not installed on 2026-09-24). Every name
   marked [verify] is resolved at run time by trying candidates; misses are recorded in
   MISSING and returned by probe(). The plumbing ran offline against a fake `unreal` module.

Shared toolkit (<skills>/scenario-unreal-expert/scripts, lead agent): ue_run.run_python / result /
run_commandlet for jobs and builders, ue_review.screenshot / image_checks for captures,
ue_audit for generic asset rules, ue_stat for stat, CSV and TraceQuery parsing. This module
does not reimplement them.

Source keys used in findings (full list in references/sources.md):
  WPdoc   World Partition, OFPA, Data Layers, Level Instancing, HLOD docs (UE 5.8)
  LANDdoc Landscape technical guide, materials, edit layers docs (UE 5.8)
  NANdoc  Nanite overview doc (UE 5.8); PCGdoc / PCGnodes: PCG overview and node reference
  EEf07   Sam Deiter, Building Open Worlds in UE5 (Epic, 2022)
  ic      Max (CDPR) and Hugh (Epic), Runtime PCG in The Witcher 4 tech demo (2025)
  Tb      Matt Oztalay (Epic), PCG introduction and production best practices (2025)
  j3      Epic PCG team, PCG advanced topics 5.5 (2024)
  6ig     Epic senior technical artist, Artist's guide to Nanite Tessellation (2024)
  aZr     Quixel team (Epic), Future of Nanite Foliage (2025)
  5ju     Unreal Sensei, UE5 landscape material (2023)
  QJw     Epic Mesh Terrain team (2026)
  QBA     Joel Burgess and Nate Purkeypile (Bethesda), Fallout 4 modular level design (2016)
  Aal     Sam Dark (Unknown Worlds), Subnautica 2 open-world lessons (2026)
  rn5x    UE 5.x release notes (sources/docs/versions__ue-5.x-release-notes.md)
  [added] this skill's own judgment or arithmetic, not stated by a source

No em dashes in this file (project rule).
"""
from __future__ import annotations

import json
import math
import os
import struct
import zlib
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

__version__ = "0.1"  # Unreal Engine Expert Skills v0.1 (2026-09-24; includes the refactor pass)

# =============================================================================================
# 0. Findings helper
# =============================================================================================

SEVERITIES = ("error", "warn", "info")


def finding(severity: str, rule: str, detail: str, source: str = "[added]", fix: str = "") -> Dict[str, str]:
    """One check result. severity: error (breaks, or contradicts a doc rule), warn (expert
    advice ignored or a risk), info (a decision to record or a measurement still owed)."""
    if severity not in SEVERITIES:
        raise ValueError("severity must be one of %s" % (SEVERITIES,))
    out = {"severity": severity, "rule": rule, "detail": detail, "source": source}
    if fix:
        out["fix"] = fix
    return out


def summarize(findings: Sequence[Dict[str, str]]) -> Dict[str, Any]:
    counts = {s: 0 for s in SEVERITIES}
    for f in findings:
        counts[f["severity"]] += 1
    return {"ok": counts["error"] == 0, "counts": counts, "findings": list(findings)}


# =============================================================================================
# 1. Landscape sizing, Z scale, heightmaps
# =============================================================================================

# Epic's recommended sizes (LANDdoc, Recommended Landscape Sizes):
# (overall vertices per side, quads per section, sections per component axis, total components)
LANDSCAPE_RECOMMENDED = (
    (8129, 127, 2, 1024), (4033, 63, 2, 1024), (2017, 63, 2, 256),
    (1009, 63, 2, 64), (1009, 63, 1, 256), (505, 63, 2, 16), (505, 63, 1, 64),
    (253, 63, 2, 4), (253, 63, 1, 16), (127, 63, 2, 1), (127, 63, 1, 4),
)
LANDSCAPE_MAX_COMPONENTS = 1024          # LANDdoc, Performance Considerations
# Section vertices are powers of two up to 256 (LANDdoc, Component Sections) -> quads 2^n - 1.
QUADS_PER_SECTION = (7, 15, 31, 63, 127, 255)
DEFAULT_MAX_EDIT_LAYERS = 8              # LANDdoc, Adding Layers (Project Settings > Landscape)
MOBILE_LANDSCAPE_LAYERS = 3              # LANDdoc / landscape materials doc, Mobile
LAYERS_PER_WEIGHTMAP = 4                 # one RGBA8 weightmap per 4 target layers (landscape materials doc)
LANDSCAPE_ACTOR_PRACTICAL_MAX = 8192     # "works well up to about 8K by 8K" (QJw [00:03:21])


def is_recommended_size(vertices: int, quads_per_section: int, sections: int) -> bool:
    return any(v == vertices and q == quads_per_section and s == sections
               for v, q, s, _ in LANDSCAPE_RECOMMENDED)


def landscape_layout(quads_per_section: int, sections: int, components_per_axis: int,
                     quad_m: float = 1.0) -> Dict[str, Any]:
    """Facts for one layout. sections is per component axis (1 or 2, i.e. 1x1 or 2x2)."""
    if quads_per_section not in QUADS_PER_SECTION:
        raise ValueError("quads per section must be one of %s (LANDdoc)" % (QUADS_PER_SECTION,))
    if sections not in (1, 2):
        raise ValueError("sections per component axis must be 1 or 2 (1x1 or 2x2)")
    qpc = quads_per_section * sections
    quads = components_per_axis * qpc
    comps = components_per_axis * components_per_axis
    return {
        "vertices": quads + 1,
        "quads": quads,
        "quads_per_section": quads_per_section,
        "sections_per_component": "%dx%d" % (sections, sections),
        "sections": sections,
        "quads_per_component": qpc,
        "components_per_axis": components_per_axis,
        "components": comps,
        "section_draws": comps * sections * sections,   # each section is a draw call (LANDdoc)
        "xy_scale_cm": quad_m * 100.0,
        "extent_m": quads * quad_m,
        "recommended": is_recommended_size(quads + 1, quads_per_section, sections),
        "within_component_budget": comps <= LANDSCAPE_MAX_COMPONENTS,
    }


def landscape_candidates(size_m: float, quad_m: float = 1.0,
                         max_components: int = LANDSCAPE_MAX_COMPONENTS) -> List[Dict[str, Any]]:
    """All layouts that cover size_m at quad_m per quad, within max_components, ranked.

    Rank: smallest overshoot of the wanted quad count, then fewest components (LANDdoc:
    "using fewer Landscape Components gives better performance"), then 2x2 sections, then
    Epic's recommended table. This reproduces the table: 2 km at 1 m -> 2017 x 2017,
    63 quads, 2x2, 256 components [added ranking, checked against LANDdoc]."""
    if size_m <= 0 or quad_m <= 0:
        raise ValueError("size_m and quad_m must be positive")
    target = int(math.ceil(size_m / quad_m - 1e-9))
    out = []
    for qps in QUADS_PER_SECTION:
        for sec in (2, 1):
            qpc = qps * sec
            n = int(math.ceil(target / float(qpc)))
            if n < 1 or n * n > max_components:
                continue
            lay = landscape_layout(qps, sec, n, quad_m)
            lay["overshoot_quads"] = lay["quads"] - target
            out.append(lay)
    out.sort(key=lambda d: (d["overshoot_quads"], d["components"], -d["sections"],
                            not d["recommended"]))
    return out


def z_scale_for_range(total_range_m: float) -> float:
    """Landscape Z scale that stores total_range_m of height (LANDdoc, Z Scale):
    16-bit heights span -256..255.992 x Z/100 m, so Z = range_cm / 512.
    Mauna Kea 4,207 m -> 821.68."""
    if total_range_m <= 0:
        raise ValueError("range must be positive")
    return total_range_m * 100.0 / 512.0


def height_range_m(z_scale: float) -> Tuple[float, float]:
    """(min, max) height in metres relative to the landscape actor for a Z scale (LANDdoc)."""
    return (-256.0 * z_scale / 100.0, 255.9921875 * z_scale / 100.0)


def vertical_step_cm(z_scale: float) -> float:
    """Height precision of one 16-bit step: 512 m x Z/100 over 65536 steps [added arithmetic]."""
    return 51200.0 * (z_scale / 100.0) / 65536.0


def fit_heightmap_z(min_m: float, max_m: float, headroom: float = 0.02, mode: str = "tight") -> Dict[str, Any]:
    """Z scale and landscape actor Z derived from the REAL height range of the terrain
    (metres, world space), so the 16-bit import cannot clip (LANDdoc Calculating Heightmap
    Z Scale: Z = range_cm / 512, heights stored relative to the actor Z).

    Always call this on the heights you are about to export (valley_heightmap min_m/max_m,
    or the DCC's export range), never on a declared relief: the U1 GREEN run sized Z from
    relief 250 m, the blockout reached 314 m and 123,356 pixels clipped at Z 100.
    mode "tight": Z = span / 512 x (1 + headroom), the finest vertical step (doc formula;
    2% headroom [added], raise it if the Sculpt Details layer will add height later).
    mode "keep100": Z 100 whenever the span fits in 512 m with the headroom, only the actor
    moves (coarser 0.78 cm step, more room for later sculpting) [added].
    For a DCC PNG already normalized to 0..65535 over [min, max], use headroom=0.
    The actor sits at the midpoint of the span in both modes; export heights minus actor_z_m."""
    lo, hi = float(min_m), float(max_m)
    if hi < lo:
        raise ValueError("max_m below min_m")
    span = max(hi - lo, 0.01)
    mid = (hi + lo) / 2.0
    if mode == "keep100" and span * (1.0 + headroom) <= 511.99:
        z = 100.0
    elif mode in ("tight", "keep100"):
        z = z_scale_for_range(span) * (1.0 + headroom)
    else:
        raise ValueError("mode must be tight or keep100")
    rlo, rhi = height_range_m(z)
    return {"z_scale": round(z, 4), "actor_z_m": round(mid, 3), "actor_z_cm": round(mid * 100.0, 1),
            "span_m": round(span, 3), "relative_range_m": (round(lo - mid, 3), round(hi - mid, 3)),
            "storable_range_m": (round(rlo, 3), round(rhi, 3)),
            "vertical_step_cm": round(vertical_step_cm(z), 4), "mode": mode,
            "source": "LANDdoc Calculating Heightmap Z Scale; midpoint actor [added]"}


def heightmap_clip_gate(export_result: Dict[str, Any], values: Optional[Sequence[int]] = None) -> List[Dict[str, str]]:
    """GATE before any landscape import: 0 clipped pixels, valid size. export_result is the
    dict from export_heightmap. values (optional, uint16 samples read back from a DCC file)
    adds a saturation count: pixels at 0 or 65535 usually mean the DCC clipped too [added]."""
    out = []
    n = int(export_result.get("clipped", 0) or 0)
    if n:
        out.append(finding("error", "landscape.heightmap_clipped",
                           "%d pixels clipped at Z scale %s (actor Z %s cm): flat plateaus and pits after import"
                           % (n, export_result.get("z_scale"), export_result.get("actor_z_cm", 0)),
                           "LANDdoc Calculating Heightmap Z Scale; U1 GREEN run 2026-09-24",
                           "fit_heightmap_z(min_m, max_m) on the real heights, then export with its z_scale and actor_z_m"))
    if export_result.get("valid_size") is False:
        out.append(finding("error", "landscape.invalid_size", "heightmap %sx%s is not a valid landscape size"
                           % (export_result.get("width"), export_result.get("height")),
                           "LANDdoc Calculating Heightmap Dimensions"))
    if values is not None:
        sat = sum(1 for v in values if v <= 0 or v >= 65535)
        if sat:
            out.append(finding("warn", "landscape.heightmap_saturated",
                               "%d samples at 0 or 65535: the source may already be clipped" % sat, "[added]",
                               "re-export from the DCC with a wider height range"))
    return out


def plan_landscape(size_m: float, quad_m: float = 1.0, relief_m: Optional[float] = None,
                   below_zero_m: float = 0.0, mobile: bool = False,
                   material_layers: int = 0, height_min_m: Optional[float] = None,
                   height_max_m: Optional[float] = None) -> Dict[str, Any]:
    """Pick the landscape layout and Z scale for a world, with findings.

    Preferred: height_min_m / height_max_m, the real range of the heights to import; Z scale
    and actor Z then come from fit_heightmap_z. relief_m (declared highest point above the
    actor Z) and below_zero_m are a planning estimate only: Z scale stays 100 (+/-256 m)
    when they fit [added], and the heightmap must still pass heightmap_clip_gate."""
    cands = landscape_candidates(size_m, quad_m)
    findings = []
    if not cands:
        findings.append(finding(
            "error", "landscape.too_many_components",
            "no single-landscape layout covers %.0f m at %.2f m per quad within %d components"
            % (size_m, quad_m, LANDSCAPE_MAX_COMPONENTS), "LANDdoc Performance Considerations",
            "coarser quad size, several landscapes, or Mesh Terrain (Experimental in 5.8, QJw)"))
        return {"ok": False, "best": None, "alternatives": [], "findings": findings}
    best = dict(cands[0])
    z = 100.0
    best["actor_z_cm"] = 0.0
    if height_min_m is not None and height_max_m is not None:
        fit = fit_heightmap_z(height_min_m, height_max_m)
        z = fit["z_scale"]
        best["actor_z_cm"] = fit["actor_z_cm"]
        best["z_fit"] = fit
    elif relief_m is not None:
        lo, hi = height_range_m(100.0)
        findings.append(finding(
            "info", "landscape.relief_declared",
            "Z scale from a declared relief is an estimate: derive Z and actor Z from the exported heights"
            " (fit_heightmap_z) and pass heightmap_clip_gate before import",
            "U1 GREEN run 2026-09-24 (relief 250 m declared, terrain reached 314 m)"))
        if relief_m > hi or below_zero_m > -lo:
            span = max(relief_m, 0.0) + max(below_zero_m, 0.0)
            z = z_scale_for_range(span) * 1.02
            best["actor_z_cm"] = round((max(relief_m, 0.0) - max(below_zero_m, 0.0)) * 50.0, 1)
            findings.append(finding(
                "info", "landscape.z_scale",
                "height span %.0f m exceeds +/-256 m at Z 100; Z scale %.2f (2%% headroom [added]);"
                " place the actor Z at the middle of the span" % (span, z),
                "LANDdoc Calculating Heightmap Z Scale"))
    best["z_scale"] = round(z, 4)
    best["height_range_m"] = tuple(round(v, 3) for v in height_range_m(z))
    best["vertical_step_cm"] = round(vertical_step_cm(z), 4)
    best["heightmap_pixels"] = (best["vertices"], best["vertices"])
    if best["vertices"] - 1 > LANDSCAPE_ACTOR_PRACTICAL_MAX:
        findings.append(finding(
            "warn", "landscape.beyond_8k",
            "above about 8K x 8K one landscape actor becomes painful", "QJw [00:03:21]"))
    if not best["recommended"]:
        findings.append(finding(
            "info", "landscape.not_in_table",
            "layout %d vertices / %d quads / %s is valid but not in Epic's recommended table"
            % (best["vertices"], best["quads_per_section"], best["sections_per_component"]),
            "LANDdoc Recommended Landscape Sizes"))
    if mobile and material_layers > MOBILE_LANDSCAPE_LAYERS:
        findings.append(finding(
            "warn", "landscape.mobile_layers",
            "%d material layers on a mobile target; Epic recommends 3 and ES3.1 has 16 samplers"
            % material_layers, "LANDdoc Mobile Landscape Materials",
            "Feature Level Switch mobile branch with 3 layers"))
    if material_layers:
        best["weightmaps_per_component_max"] = int(math.ceil(material_layers / float(LAYERS_PER_WEIGHTMAP)))
    return {"ok": True, "best": best, "alternatives": cands[1:4], "findings": findings}


def valid_heightmap_size(pixels: int) -> bool:
    """True if a square heightmap of this many pixels matches some valid layout (any
    component count up to 32 per axis). 2048 is not valid; 2017 and 4033 are (LANDdoc)."""
    for qps in QUADS_PER_SECTION:
        for sec in (1, 2):
            qpc = qps * sec
            if (pixels - 1) % qpc == 0 and 1 <= (pixels - 1) // qpc <= 32:
                return True
    return False


def heights_to_u16(heights_m: Iterable[float], z_scale: float = 100.0) -> Tuple[List[int], int]:
    """Metres relative to the actor Z -> uint16 samples (32768 = actor Z). One step is
    z_scale / 12800 m [added arithmetic from LANDdoc]. Returns (values, clipped_count)."""
    k = 12800.0 / float(z_scale)
    vals, clipped = [], 0
    for h in heights_m:
        v = int(round(32768.0 + float(h) * k))
        if v < 0 or v > 65535:
            clipped += 1
            v = 0 if v < 0 else 65535
        vals.append(v)
    return vals, clipped


def u16_to_height_m(value: int, z_scale: float = 100.0) -> float:
    return (int(value) - 32768) * float(z_scale) / 12800.0


def _png_chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png16(path: str, values: Sequence[int], width: int, height: int) -> str:
    """16-bit grayscale PNG (the landscape import format, LANDdoc), stdlib only.
    values: row-major uint16, len = width * height. Returns path."""
    if len(values) != width * height:
        raise ValueError("expected %d values, got %d" % (width * height, len(values)))
    raw = bytearray()
    row_bytes = struct.Struct(">%dH" % width)
    for y in range(height):
        raw.append(0)  # filter type None
        raw += row_bytes.pack(*values[y * width:(y + 1) * width])
    ihdr = struct.pack(">IIBBBBB", width, height, 16, 0, 0, 0, 0)
    data = (b"\x89PNG\r\n\x1a\n" + _png_chunk(b"IHDR", ihdr)
            + _png_chunk(b"IDAT", zlib.compress(bytes(raw), 6)) + _png_chunk(b"IEND", b""))
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    return path


def read_png16(path: str) -> Tuple[int, int, List[int]]:
    """Read back a 16-bit grayscale PNG written with filter 0 (our writer). For tests and
    for checking a DCC export before import. Returns (width, height, values)."""
    with open(path, "rb") as f:
        data = f.read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    pos, idat = 8, bytearray()
    w = h = 0
    while pos < len(data):
        n = struct.unpack(">I", data[pos:pos + 4])[0]
        tag = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + n]
        pos += 12 + n
        if tag == b"IHDR":
            w, h, depth, ctype = struct.unpack(">IIBB", body[:10])
            if depth != 16 or ctype != 0:
                raise ValueError("not 16-bit grayscale (depth %d, color type %d)" % (depth, ctype))
        elif tag == b"IDAT":
            idat += body
    raw = zlib.decompress(bytes(idat))
    stride = 1 + 2 * w
    vals: List[int] = []
    for y in range(h):
        row = raw[y * stride:(y + 1) * stride]
        if row[0] != 0:
            raise ValueError("unsupported PNG filter %d (only filter 0)" % row[0])
        vals.extend(struct.unpack(">%dH" % w, row[1:]))
    return w, h, vals


def write_r16(path: str, values: Sequence[int], width: int, height: int, sidecar: bool = True) -> Dict[str, str]:
    """Little-endian 16-bit raw heightmap, plus the same-named JSON with width, height and
    bbp that the importer reads for .raw files (LANDdoc, Importing RAW; key name bbp as the
    doc prints it [verify]). The file is written as .r16 when path has no .raw extension."""
    if len(values) != width * height:
        raise ValueError("expected %d values" % (width * height))
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "wb") as f:
        f.write(struct.pack("<%dH" % len(values), *values))
    out = {"heightmap": path}
    if sidecar:
        js = os.path.splitext(path)[0] + ".json"
        with open(js, "w", encoding="utf-8") as f:
            json.dump({"width": width, "height": height, "bbp": 16}, f)
        out["sidecar"] = js
    return out


def valley_heightmap(vertices: int, size_m: float, relief_m: float = 250.0,
                     river_width_m: float = 14.0, river_depth_m: float = 2.5,
                     meander_m: float = 120.0, meanders: float = 1.5, noise_m: float = 12.0,
                     seed: int = 7, pads: Sequence[Dict[str, float]] = ()) -> Dict[str, Any]:
    """Blockout heightfield for a river valley: U-shaped cross profile, a meandering river
    along Y carved into the floor, value-noise breakup, and flat pads (village plots).
    Needs numpy. Heights are metres relative to the landscape actor. All shape values are
    [added] blockout defaults, to be replaced by the art direction or a DCC heightmap
    (World Machine, Gaea). This is the substitute for sculpting without a mouse.

    pads: [{"x_m":..., "y_m":..., "radius_m":..., "falloff_m":...}] flattened to the local
    mean. Returns heights (2D numpy array, rows = Y), river centreline points (x_m, y_m,
    z_m) every ~25 m for a river spline or Water Body River, and a river mask 0..1.

    relief_m is the valley-side height at the half-width, NOT the maximum: the profile keeps
    rising toward the corners (up to 1.2^1.8 x relief) and noise adds more; relief 250 m
    reached 314 m on the 2017 blockout. Size Z from the returned min_m / max_m with
    fit_heightmap_z, never from relief_m."""
    import numpy as np  # optional dependency, agent side only
    rng = np.random.default_rng(seed)
    n = int(vertices)
    xs = np.linspace(0.0, size_m, n)
    X, Y = np.meshgrid(xs, xs)                      # rows = Y
    cx = size_m * 0.5 + meander_m * np.sin(2.0 * math.pi * meanders * Y / size_m)
    d = np.abs(X - cx) / (size_m * 0.5)             # 0 at the river, ~1 at the edges
    profile = relief_m * np.clip(d, 0, 1.2) ** 1.8  # U-shaped valley
    # value noise, three octaves, bilinear from coarse random grids
    noise = np.zeros_like(X)
    amp, total = 1.0, 0.0
    for cells in (6, 16, 40):
        g = rng.standard_normal((cells + 1, cells + 1))
        u = X / size_m * cells
        v = Y / size_m * cells
        i0 = np.clip(np.floor(u).astype(int), 0, cells - 1)
        j0 = np.clip(np.floor(v).astype(int), 0, cells - 1)
        fu, fv = u - i0, v - j0
        fu, fv = fu * fu * (3 - 2 * fu), fv * fv * (3 - 2 * fv)
        a = g[j0, i0] * (1 - fu) + g[j0, i0 + 1] * fu
        b = g[j0 + 1, i0] * (1 - fu) + g[j0 + 1, i0 + 1] * fu
        noise += amp * (a * (1 - fv) + b * fv)
        total += amp
        amp *= 0.5
    noise = noise / total * noise_m
    floor_mask = np.clip(1.0 - d * 4.0, 0, 1)       # calmer noise on the valley floor
    h = profile + noise * (1.0 - 0.7 * floor_mask)
    # river channel
    dist_m = np.abs(X - cx)
    half = river_width_m * 0.5
    bank = half * 2.5
    t = np.clip((dist_m - half) / max(bank - half, 1e-6), 0, 1)
    carve = river_depth_m * (1.0 - t * t * (3 - 2 * t))
    river_mask = (dist_m <= half).astype(float) + ((dist_m > half) & (dist_m < bank)) * (1 - t)
    h = h - carve
    for p in pads:
        r = np.hypot(X - p["x_m"], Y - p["y_m"])
        inside = r <= p["radius_m"]
        if not inside.any():
            continue
        level = float(h[inside].mean())
        f = np.clip((r - p["radius_m"]) / max(p.get("falloff_m", 20.0), 1e-6), 0, 1)
        w = 1.0 - f * f * (3 - 2 * f)
        h = h * (1 - w) + level * w
    step = max(1, int(round(25.0 / (size_m / (n - 1)))))
    pts = []
    for j in range(0, n, step):
        i = int(round(cx[j, 0] / size_m * (n - 1)))
        i = min(max(i, 0), n - 1)
        pts.append((float(cx[j, 0]), float(xs[j]), float(h[j, i])))
    return {"heights": h, "river_points_m": pts, "river_mask": np.clip(river_mask, 0, 1),
            "min_m": float(h.min()), "max_m": float(h.max()), "size_m": size_m, "vertices": n}


def export_heightmap(path: str, heights_2d, z_scale: Any = "fit", raw: bool = False,
                     actor_z_m: Optional[float] = None, headroom: float = 0.02) -> Dict[str, Any]:
    """Write a 2D height array (metres, world space) as PNG16 (default) or r16 + JSON.

    z_scale "fit" (default) derives Z scale and actor Z from the array's own min and max
    (fit_heightmap_z); a number keeps that Z scale, with actor_z_m (default 0) subtracted
    from the heights. The result carries z_scale, actor_z_cm and clipped: feed it to
    heightmap_clip_gate and create the landscape at Location Z = actor_z_cm, Scale Z =
    z_scale. Accepts a numpy array (fast path) or a list of rows."""
    is_np = hasattr(heights_2d, "shape") and hasattr(heights_2d, "astype")
    if is_np:
        lo, hi = float(heights_2d.min()), float(heights_2d.max())
    else:
        rows = [list(map(float, r)) for r in heights_2d]
        lo, hi = min(min(r) for r in rows), max(max(r) for r in rows)
    fit = None
    if isinstance(z_scale, str):
        if z_scale != "fit":
            raise ValueError("z_scale must be a number or 'fit'")
        fit = fit_heightmap_z(lo, hi, headroom=headroom)
        z_scale, actor_z_m = fit["z_scale"], fit["actor_z_m"]
    z_scale = float(z_scale)
    off = float(actor_z_m or 0.0)
    if is_np:
        import numpy as np
        hgt, wid = int(heights_2d.shape[0]), int(heights_2d.shape[1])
        v = np.rint(32768.0 + (heights_2d.astype("float64") - off) * (12800.0 / z_scale))
        clipped = int(((v < 0) | (v > 65535)).sum())
        vals = np.clip(v, 0, 65535).astype("uint16").ravel().tolist()
    else:
        hgt, wid = len(rows), len(rows[0])
        flat = [x - off for r in rows for x in r]
        vals, clipped = heights_to_u16(flat, z_scale)
    if raw:
        out = write_r16(path, vals, wid, hgt)
    else:
        out = {"heightmap": write_png16(path, vals, wid, hgt)}
    out.update({"width": wid, "height": hgt, "clipped": clipped, "z_scale": z_scale,
                "actor_z_cm": round(off * 100.0, 1), "height_min_m": round(lo, 3), "height_max_m": round(hi, 3),
                "valid_size": valid_heightmap_size(wid) and wid == hgt, "fit": fit})
    return out


def landscape_material_check(layers: Sequence[Dict[str, Any]], layer_infos: Sequence[str] = (),
                             blend_mode: str = "Opaque", opacity_mask_wired: Optional[bool] = None,
                             uses_holes: bool = False, mobile: bool = False,
                             specular: Optional[float] = None,
                             specular_from_cavity: bool = False) -> List[Dict[str, str]]:
    """Landscape-side checks of the material contract received from scenario-unreal-materials.

    layers: [{"name": "Soil", "blend": "Alpha"|"Height"|"Weight", "steep": bool (cliff layer),
    "projection": "auto"|"xy"|"triplanar"|"xz_yz", "large_area": bool,
    "anti_tiling": None|"distance_blend"|"cell_bombing"|"macro_variation"}] in Layer Blend order.
    specular: the constant terrain specular, or None when unknown; specular_from_cavity: the
    input is driven by a cavity map (Cloward's use)."""
    out = []
    steep = [l for l in layers if l.get("steep")]
    for l in steep:
        proj = str(l.get("projection") or "auto").lower()
        if proj in ("auto", "xy", "top", "topdown"):
            out.append(finding("warn", "landmat.cliff_stretch",
                               "steep layer %r is projected top-down: textures stretch on cliffs" % l["name"],
                               "5ju [00:15:36]; LANDdoc Landscape Layer Coords Node",
                               "triplanar on the steep layer only, or Landscape Layer Coords XZ / YZ side projection"))
    for l in layers:
        proj = str(l.get("projection") or "").lower()
        if proj == "triplanar" and not l.get("steep") and steep:
            out.append(finding("info", "landmat.triplanar_everywhere",
                               "%r is triplanar but not steep: triplanar costs, keep it on the steep layer" % l["name"],
                               "5ju [00:15:36]"))
        if l.get("large_area") and not l.get("anti_tiling"):
            out.append(finding("warn", "landmat.tiling",
                               "%r covers large areas with no anti-tiling: visible repeats at mid distance are the"
                               " main immersion breaker" % l["name"], "5ju [00:11:46]-[00:14:30] [00:12:18]",
                               "Distance Blend (near and far size of the same texture) or Cell Bombing (costlier);"
                               " judge with the mannequin at 10 and 100 m"))
    bombed = [l for l in layers if str(l.get("anti_tiling") or "").lower() == "cell_bombing"]
    if len(layers) > 2 and len(bombed) == len(layers):
        out.append(finding("info", "landmat.cell_bombing_everywhere",
                           "cell bombing on every layer: it hides tiling best but costs shader time",
                           "5ju [00:14:30]", "keep it on the layers that show repeats"))
    if specular is not None:
        sp = float(specular)
        if sp > 0.5:
            out.append(finding("warn", "landmat.specular_high",
                               "specular %.2f: above 0.5 means more than about 4%% reflectance, which few non-metals"
                               " have" % sp, "Cloward 0L5Azq6ugyo [00:01:19] [00:02:27]", "0.5 at most"))
        elif sp < 0.005:
            out.append(finding("info", "landmat.specular_zero",
                               "specular 0 removes sky reflections and darkens the ground",
                               "Cloward 0L5Azq6ugyo [00:01:53]"))
        elif sp >= 0.3 and not specular_from_cavity:
            out.append(finding("info", "landmat.specular_plastic",
                               "terrain specular %.2f: Sensei sets 0.02 on all layers because 0.5 gives plastic-looking"
                               " grass under sun; Cloward keeps 0.5 only as a ceiling driven by a cavity map" % sp,
                               "5ju [00:11:12]; Cloward 0L5Azq6ugyo [00:01:19]",
                               "decide on the sun capture of grass: sheen means lower it toward 0.02 (materials owner)"))
    infos = {n.lower() for n in layer_infos}
    names = [l["name"] for l in layers]
    if len({n.lower() for n in names}) != len(names):
        out.append(finding("error", "landmat.duplicate_names", "layer names must be unique (case-insensitive)",
                           "LANDdoc Layer Weights and Ordering"))
    for l in layers:
        if infos and l["name"].lower() not in infos:
            out.append(finding("error", "landmat.no_layer_info",
                               "material layer %r has no target layer / Layer Info: weight is 0 forever"
                               % l["name"], "LANDdoc Layer Weights and Ordering",
                               "create the Layer Info asset with the same name (Paint tab)"))
    blends = [l.get("blend", "Weight").lower() for l in layers]
    if blends and all(b == "height" for b in blends):
        out.append(finding("error", "landmat.all_height_blend",
                           "every layer is LB Height Blend: black spots and invalid normals where heights are 0",
                           "LANDdoc Landscape Layer Blend Issues; Ben Cloward 0L5Azq6ugyo [00:15:20]",
                           "make the base (first) layer LB Alpha Blend"))
    if blend_mode.lower() != "opaque":
        out.append(finding("warn", "landmat.masked_global",
                           "landscape material is %s; masked everywhere costs, holes only need Opacity Mask wired"
                           % blend_mode, "LANDdoc Landscape Visibility Mask Node",
                           "Blend Mode Opaque, wire Landscape Visibility Mask into Opacity Mask"))
    if uses_holes and opacity_mask_wired is False:
        out.append(finding("error", "landmat.holes_unwired",
                           "holes painted but Opacity Mask not connected", "LANDdoc Landscape Visibility Mask Node"))
    if mobile and len(layers) > MOBILE_LANDSCAPE_LAYERS:
        out.append(finding("warn", "landmat.mobile_layers", "more than 3 layers on mobile",
                           "LANDdoc Mobile Landscape Materials"))
    return out


# =============================================================================================
# 2. World Partition: grids, streaming, Data Layers, HLOD
# =============================================================================================

TEMPLATE_CELL_CM = 25600.0      # Open World template runtime grid (EEf07 [00:15:32]; WPdoc example)
TEMPLATE_RANGE_CM = 76800.0


def wp_grid_check(grids: Sequence[Dict[str, float]], world_extent_m: float,
                  max_speed_mps: Optional[float] = None,
                  measured_cell_load_s: Optional[float] = None) -> List[Dict[str, str]]:
    """grids: [{"name", "cell_size_cm", "loading_range_cm"}]. Values are centimetres."""
    out = []
    if len(grids) == 0:
        out.append(finding("error", "wp.no_grid", "no runtime grid", "WPdoc Runtime Grid Settings"))
        return out
    if len(grids) > 1:
        out.append(finding("warn", "wp.multiple_grids",
                           "%d runtime grids: 'Using more than one grid can negatively impact performance'"
                           % len(grids), "WPdoc Runtime Grid Settings", "one grid unless a need is proven"))
    for g in grids:
        cell, rng = float(g["cell_size_cm"]), float(g["loading_range_cm"])
        if cell < 1000.0:
            out.append(finding("error", "wp.units",
                               "cell size %.0f looks like metres; grid values are centimetres (25600 = 256 m)"
                               % cell, "EEf07 [00:14:57]"))
        if rng < cell:
            out.append(finding("warn", "wp.range_below_cell",
                               "loading range %.0f cm is below the cell size %.0f cm" % (rng, cell)))
        world_area = (world_extent_m * 100.0) ** 2
        frac = min(1.0, math.pi * rng * rng / world_area) if world_area > 0 else 1.0
        if frac >= 0.4:
            out.append(finding("info", "wp.range_covers_world",
                               "grid %s loading range covers about %.0f%% of the world area around the player;"
                               " start from the template and profile before changing; reduce the range only if"
                               " memory is tight and let HLOD cover distance" % (g.get("name", "?"), frac * 100),
                               "EEf07 [00:15:32]; digest U1 [added]"))
        if max_speed_mps:
            lead_s = rng / 100.0 / max_speed_mps
            if measured_cell_load_s is None:
                out.append(finding("info", "wp.streaming_margin_unmeasured",
                                   "%.0f s from range edge at %.1f m/s; measure cell load times (World Streaming"
                                   " Insights, -trace=WorldStreaming) before trusting it" % (lead_s, max_speed_mps),
                                   "rn58 World Streaming Insights [added margin logic]"))
            elif lead_s < 2.0 * measured_cell_load_s:
                out.append(finding("warn", "wp.streaming_margin",
                                   "only %.1f s of lead for %.1f s cell loads (less than 2x [added])"
                                   % (lead_s, measured_cell_load_s), "[added]",
                                   "streaming source ahead of teleports, raise range, or lighten cells"))
    return out


def wp_facts_check(facts: Dict[str, Any]) -> List[Dict[str, str]]:
    """Checks on a world fact dump (world_facts() in the editor, or hand-written).

    Keys used: enable_streaming, is_partitioned, runtime_hash_class, grids (list),
    level_blueprint_actor_refs (int or list), non_spatial_actors ([{"name","class"}]),
    ofpa (bool)."""
    out = []
    if facts.get("is_partitioned") is False:
        out.append(finding("error", "wp.not_partitioned", "map is not World Partition",
                           "WPdoc; Aal [00:19:20]", "WorldPartitionConvertCommandlet -ReportOnly first"))
    if facts.get("enable_streaming") is False:
        out.append(finding("error", "wp.streaming_off",
                           "Enable Streaming is off (game templates ship it off)",
                           "WPdoc Creating Your Project using a Games Template"))
    if facts.get("ofpa") is False:
        out.append(finding("warn", "wp.no_ofpa", "One File Per Actor off: contention on a shared map",
                           "WPdoc One File Per Actor; Aal [00:19:20]"))
    refs = facts.get("level_blueprint_actor_refs")
    n = len(refs) if isinstance(refs, (list, tuple)) else (refs or 0)
    if n:
        out.append(finding("warn", "wp.level_blueprint_refs",
                           "%d actors referenced by the Level Blueprint are forced Always Loaded" % n,
                           "WPdoc Using World Partition with Blueprint", "move the logic into Blueprint classes"))
    allowed = ("WorldSettings", "SkyAtmosphere", "SkyLight", "DirectionalLight", "ExponentialHeightFog",
               "VolumetricCloud", "WaterZone", "PCGWorldActor", "GameMode", "WorldDataLayers",
               "WorldPartitionMiniMap", "PostProcessVolume", "LevelInstance", "Landscape")
    for a in facts.get("non_spatial_actors", []) or []:
        cls = str(a.get("class", ""))
        if not any(k.lower() in cls.lower() for k in allowed):
            out.append(finding("info", "wp.non_spatial",
                               "%s (%s) is not spatially loaded: loads whenever its Data Layers allow"
                               % (a.get("name"), cls), "WPdoc Actors in World Partition",
                               "Is Spatially Loaded on for world content"))
    grids = facts.get("grids") or []
    if len(grids) > 1:
        out.append(finding("warn", "wp.multiple_grids", "%d runtime grids or partitions" % len(grids),
                           "WPdoc Runtime Grid Settings"))
    if facts.get("runtime_hash_class") and "SpatialHash" not in str(facts["runtime_hash_class"]):
        out.append(finding("info", "wp.runtime_hash",
                           "runtime hash %s: since 5.4 new maps use the runtime hash with partitions"
                           " (loose hierarchical grid); grid properties live on the partition objects [verify]"
                           % facts["runtime_hash_class"], "rn54 World Partition Runtime Hash with 3D Grid"))
    return out


def data_layer_check(layers: Sequence[Dict[str, Any]], max_runtime: int = 8) -> List[Dict[str, str]]:
    """layers: [{"name", "type": "Editor"|"Runtime", "purpose", "actor_count"}].
    max_runtime is a project threshold [added], not an Epic number."""
    out = []
    runtime = [l for l in layers if str(l.get("type", "")).lower() == "runtime"]
    for l in runtime:
        purpose = str(l.get("purpose", "")).lower()
        if purpose in ("", "organization", "organisation", "art", "layout"):
            out.append(finding("warn", "dl.runtime_for_organization",
                               "%s is a Runtime Data Layer without gameplay state; runtime layers cost streaming"
                               % l["name"], "WPdoc Performance Concerns; Data Layer Type",
                               "make it an Editor Data Layer"))
    if len(runtime) > max_runtime:
        out.append(finding("warn", "dl.many_runtime",
                           "%d Runtime Data Layers (project threshold %d [added]); widely used assets in many runtime"
                           " layers degrade streaming, loading many at once hitches" % (len(runtime), max_runtime),
                           "WPdoc Performance Concerns"))
    names = [l["name"] for l in layers]
    if len(set(names)) != len(names):
        out.append(finding("error", "dl.duplicate", "duplicate Data Layer names"))
    return out


HLOD_FAMILY_TYPES = {
    # family -> (layer type, reason, source)
    "trees": ("Instancing", "ISM of the lowest LOD, ideal for foliage", "WPdoc Choosing a Layer Type; EEf07 [00:40:40]"),
    "foliage": ("Instancing", "ISM of the lowest LOD, ideal for foliage", "WPdoc Choosing a Layer Type"),
    "rocks": ("Instancing", "scattered instanced content", "WPdoc; digest U1"),
    "buildings": ("MergedMesh", "general static dressing, a building from identical parts", "WPdoc; EEf07 [00:41:13]"),
    "props": ("MergedMesh", "static dressing", "WPdoc Choosing a Layer Type"),
    "far": ("SimplifiedMesh", "one simplified proxy when merged is still heavy at distance", "WPdoc; EEf07 [00:41:46]"),
}


def hlod_plan(families: Sequence[str], far_parent: bool = True) -> List[Dict[str, Any]]:
    """One HLOD Layer per content family, chained through Parent Layer. Cell size and
    loading range stay at the asset defaults: the sources give no values to copy (the
    conversion ini example uses a 30,000 uu loading range for MeshMerge, WPdoc)."""
    layers: Dict[str, Dict[str, Any]] = {}
    for fam in families:
        key = fam.lower()
        ltype, why, src = HLOD_FAMILY_TYPES.get(key, ("MergedMesh", "default for static dressing", "WPdoc"))
        name = "HLOD_%s" % fam.capitalize()
        spec = {"name": name, "layer_type": ltype, "families": [fam], "reason": why, "source": src,
                "parent": None, "notes": []}
        if ltype == "MergedMesh":
            spec["notes"].append("Use Landscape Culling drops triangles buried under the landscape (WPdoc Mesh Merge)")
            spec["notes"].append("avoid Merge Equivalent Materials when color uses world or actor position (WPdoc)")
        if ltype == "SimplifiedMesh":
            spec["notes"].append("Merge Distance closes doors and windows; check the silhouette (WPdoc Proxy Settings)")
        # merge families with the same type into one layer
        existing = next((l for l in layers.values() if l["layer_type"] == ltype and ltype == "Instancing"), None)
        if existing:
            existing["families"].append(fam)
            continue
        layers[name] = spec
    out = list(layers.values())
    if far_parent and any(l["layer_type"] == "MergedMesh" for l in out):
        far = {"name": "HLOD_Far", "layer_type": "SimplifiedMesh", "families": [], "parent": None,
               "reason": "coarser parent for merged layers", "source": "WPdoc Adding Actors (Parent Layer)",
               "notes": ["build and compare; drop it if Merged Mesh is light enough at distance [added]",
                         "far-only proxy: Allow Distance Fields off saves memory, after the lighter confirms Lumen"
                         " far field does not need it (WPdoc Mesh Merge and Proxy Settings)",
                         "Merge Distance closes doors and windows; Unresolved Geometry Color shows what closed"
                         " (WPdoc Proxy Settings)"]}
        for l in out:
            if l["layer_type"] == "MergedMesh":
                l["parent"] = "HLOD_Far"
        out.append(far)
    for l in out:
        l["notes"].append("5.8: bForceRayTracingFarField and editor loading behavior per layer (rn58 World Partition HLOD)")
        l["notes"].append("review in View Mode > Level of Detail Coloration > Hierarchical LOD Coloration: sources green,"
                          " proxies blue as the camera leaves (WPdoc Visualizing HLODs)")
    return out


def hlod_actor_check(actors: Sequence[Dict[str, Any]]) -> List[Dict[str, str]]:
    """actors: [{"name", "mobility", "hlod_layer", "eligible": bool}] from a census."""
    out = []
    for a in actors:
        if not a.get("eligible", True):
            continue
        if str(a.get("mobility", "Static")).lower() != "static":
            out.append(finding("warn", "hlod.not_static", "%s is %s: HLOD needs Static mobility"
                               % (a["name"], a.get("mobility")), "WPdoc Using HLOD Layers"))
        if not a.get("hlod_layer"):
            out.append(finding("info", "hlod.unassigned", "%s has no HLOD layer (actor, Data Layer default or"
                               " World Settings default)" % a["name"], "WPdoc Using HLOD Layers"))
    return out


def changelist_check(entries: Sequence[Dict[str, Any]], builders_own_generation: bool = True,
                     submitted_from_editor: bool = True) -> List[Dict[str, str]]:
    """entries: [{"path", "actor_class"}] of a pending changelist (OFPA external actor files map
    to actor descriptors in the editor's View Changelists). PCG partition actor class name
    (APCGPartitionActor) is [verify]."""
    out = []
    gen = [e for e in entries if "pcgpartitionactor" in str(e.get("actor_class", "")).lower()]
    if builders_own_generation and gen:
        out.append(finding("warn", "scc.generated_pcg",
                           "%d generated PCG partition actors in the changelist while builders own generation:"
                           " source-control contention" % len(gen), "Tb [00:26:23]",
                           "revert them; the build machine regenerates, artists preview locally"))
    ofpa = [e for e in entries if "__externalactors__" in str(e.get("path", "")).lower()]
    if ofpa and not submitted_from_editor:
        out.append(finding("warn", "scc.ofpa_outside_editor",
                           "%d OFPA actor files submitted outside the editor: partial submits leave dangling"
                           " references" % len(ofpa), "WPdoc Using OFPA With Source Control; SCC doc",
                           "validate and submit from the editor (View Changelists)"))
    return out


def project_settings_check(settings: Dict[str, Any]) -> List[Dict[str, str]]:
    """settings: {"virtual_texture_support", "minimap", "rvt_blend"} (Project Settings > Rendering)."""
    out = []
    if settings.get("virtual_texture_support") is False:
        if settings.get("minimap"):
            out.append(finding("warn", "project.minimap_no_vt", "World Partition minimap planned without virtual"
                               " texture support: it builds but does not display", "WPdoc Generating a Minimap",
                               "Project Settings > Rendering > Enable virtual texture support"))
        if settings.get("rvt_blend"):
            out.append(finding("warn", "project.rvt_no_vt", "RVT blending planned without virtual texture support",
                               "5ju [00:47:11]", "Project Settings > Rendering > Enable virtual texture support"))
    return out


# =============================================================================================
# 3. PCG planning and audits
# =============================================================================================

PCG_DEFAULT_FRAME_MS = 5.0          # pcg.FrameTime since 5.6 (rn56)
PCG_DEFAULT_EDITOR_FRAME_MS = 15.0  # pcg.EditorFrameTime since 5.6 (rn56)
PCG_PARTITION_GRID_M = 256.0        # PCG World Actor Partition Grid Size on screen (Tb frame 00:23:16)
WITCHER_INSTANCES_PER_32M = (10000, 20000)   # per 32 m tile, fine on base PS5 (ic [00:30:26])
NANITE_INSTANCE_CEILING = 16_000_000         # hard limit, all streamed instances (NANdoc Geometry)

PCG_BUDGET_FACTS = (
    {"fact": "pcg.FrameTime default 5 ms, pcg.EditorFrameTime 15 ms", "source": "rn56"},
    {"fact": "Witcher 4 demo: 2 ms runtime budget on base PS5 at 60 fps, lowered to a minimum in the village,"
             " paused during the marketplace sequence", "source": "ic [00:26:24] [00:28:51]"},
    {"fact": "cap concurrent runtime generation with pcg.RuntimeGeneration.NumGeneratingComponents", "source": "rn56"},
    {"fact": "PCG subsystem game thread over the run: 180 us average, 130 us of it fixed scheduler overhead",
     "source": "ic [00:29:27]"},
    {"fact": "Test and Shipping builds generate much faster than Development: judge latency there",
     "source": "ic [00:27:44]"},
)


def expected_points(area_m2: float, points_per_m2: float) -> float:
    """Surface Sampler expected count: area x Points Per Square Meter (PCGnodes Sampler)."""
    return float(area_m2) * float(points_per_m2)


def surface_sampler_cell_cm(point_extents_cm: float, looseness: float) -> float:
    """Cell size = Point Extents x (1 + Looseness), as the node reference words it
    (PCGnodes Surface Sampler). Whether extents are half-sizes here is [verify]."""
    return float(point_extents_cm) * (1.0 + float(looseness))


def mesh_probabilities(weights: Dict[str, float]) -> Dict[str, float]:
    """Static Mesh Spawner weights normalize over the sum (PCGnodes Spawner; the overview
    page states the formula inverted, see version deltas PCG 'Doc warning')."""
    total = float(sum(weights.values()))
    if total <= 0:
        raise ValueError("weights must sum to a positive number")
    return {k: v / total for k, v in weights.items()}


def instances_per_cell(points_per_m2: float, cell_m: float) -> float:
    return float(points_per_m2) * cell_m * cell_m


def check_hier_grids(grids: Sequence[Any], landscape_read_grid: Any = None) -> List[Dict[str, str]]:
    """grids: e.g. ["unbounded", 128, 32] in metres. Grid enum values are powers of two in the
    editor [verify]; the Witcher 4 split is unbounded (params, CPU, one-off), 128 m (landscape
    reads, overhead), 32 m (scatter) (ic [00:08:04]-[00:11:17])."""
    out = []
    nums = [g for g in grids if not (isinstance(g, str) and g.lower() == "unbounded")]
    for g in nums:
        if g <= 0 or (int(g) & (int(g) - 1)) != 0 or int(g) != g:
            out.append(finding("warn", "pcg.grid_not_pow2", "grid %s m is not a power of two [verify enum]" % g))
    if sorted(nums, reverse=True) != list(nums):
        out.append(finding("info", "pcg.grid_order", "list grids coarse to fine"))
    if not any(isinstance(g, str) and g.lower() == "unbounded" for g in grids):
        out.append(finding("info", "pcg.no_unbounded",
                           "no unbounded level: graph parameter uploads and one-time CPU work repeat per cell",
                           "ic [00:08:39] [00:23:16]", "do shared work once on the unbounded grid"))
    if landscape_read_grid is not None:
        if isinstance(landscape_read_grid, str) and landscape_read_grid.lower() == "unbounded":
            out.append(finding("warn", "pcg.landscape_on_unbounded", "reading the landscape on the unbounded cell"
                               " loads the whole landscape (memory)", "ic [00:10:43]", "read at the mid grid (128 m)"))
        elif nums and landscape_read_grid == min(nums) and len(nums) > 1:
            out.append(finding("warn", "pcg.landscape_on_finest", "reading the landscape on the finest grid pays"
                               " repeated overhead", "ic [00:11:17]", "read at the mid grid (128 m)"))
    return out


def grass_rings(dense_radius_m: float = 128.0, sparse_radius_m: float = 256.0,
                dense_grid_m: float = 32.0, sparse_grid_m: float = 128.0,
                dense_ppm2: Optional[float] = None, sparse_ppm2: Optional[float] = None,
                nanite: bool = False) -> Dict[str, Any]:
    """Two-ring runtime grass (ic [00:14:44]-[00:16:36]): dense scatter on the 32 m grid to
    128 m, a sparse pass on the 128 m grid to 256 m with fewer, slightly larger instances;
    recolor far instances toward the ground color. The talk hands over with min and max draw
    distances; those do not apply to Nanite instances (NANdoc Rendering: no distance culling;
    Looman), so with nanite=True the ring edges are the generation radii of each grid and the
    handover must be checked on the first run [verify]. Densities are the project's."""
    out: Dict[str, Any] = {"rings": [], "findings": []}
    if nanite:
        out["findings"].append(finding(
            "info", "grass.nanite_handover",
            "Nanite grass: min/max draw distance and cull distance do not apply; ring edges come from each"
            " grid's generation radius [verify handover on the first run]", "NANdoc Rendering; Looman; ic [00:15:30]"))
    if not (dense_radius_m < sparse_radius_m and dense_grid_m < sparse_grid_m):
        out["findings"].append(finding("error", "grass.ring_order", "dense ring must be inside the sparse ring and on the finer grid"))
    rings = [
        {"name": "dense", "grid_m": dense_grid_m, "draw_min_m": 0.0, "draw_max_m": dense_radius_m,
         "generation_radius_m": dense_radius_m, "ppm2": dense_ppm2,
         "area_m2": math.pi * dense_radius_m ** 2},
        {"name": "sparse", "grid_m": sparse_grid_m, "draw_min_m": dense_radius_m, "draw_max_m": sparse_radius_m,
         "generation_radius_m": sparse_radius_m, "ppm2": sparse_ppm2,
         "area_m2": math.pi * (sparse_radius_m ** 2 - dense_radius_m ** 2),
         "notes": ["fewer, slightly larger instances", "recolor toward ground color at the far edge (shadows still show)"]},
    ]
    for r in rings:
        if r["ppm2"] is not None:
            r["instances_estimate"] = int(r["area_m2"] * r["ppm2"])
            r["instances_per_cell"] = int(instances_per_cell(r["ppm2"], r["grid_m"]))
            if r["grid_m"] == 32.0 and r["instances_per_cell"] > WITCHER_INSTANCES_PER_32M[1]:
                out["findings"].append(finding(
                    "warn", "grass.cell_count", "%d instances per 32 m cell, above the 10k to 20k the Witcher 4 demo"
                    " ran on base PS5; measure on the target" % r["instances_per_cell"], "ic [00:30:26]"))
    if dense_ppm2 and sparse_ppm2 and sparse_ppm2 >= dense_ppm2:
        out["findings"].append(finding("warn", "grass.sparse_not_sparser", "sparse ring must be sparser", "ic [00:15:18]"))
    out["rings"] = rings
    out["why"] = "raising one radius alone cannot hide the edge and instance counts explode (ic [00:14:44])"
    return out


def generation_lead_check(camera_speed_mps: float, generation_radius_m: float, cull_distance_m: float,
                          measured_latency_s: Optional[float] = None, build: str = "Test") -> List[Dict[str, str]]:
    """Pop-in happens when a cell finishes generating after it enters the cull distance
    (ic [00:27:10]). Margin = (generation radius - cull distance) / speed [added formula].
    cull_distance_m is where new instances become visible: the draw distance for non-Nanite
    instances; Nanite ignores distance culling (NANdoc), so there pass the distance at which
    a newly generated cell is noticeable (inside the recolored far edge) [added]."""
    out = []
    margin_m = generation_radius_m - cull_distance_m
    if margin_m <= 0:
        out.append(finding("error", "pcg.radius_inside_cull", "generation radius %.0f m does not exceed cull distance"
                           " %.0f m: every new cell pops" % (generation_radius_m, cull_distance_m), "ic [00:27:10]"))
        return out
    margin_s = margin_m / max(camera_speed_mps, 1e-6)
    if measured_latency_s is None:
        out.append(finding("info", "pcg.latency_unmeasured", "%.1f s margin at %.1f m/s; measure generation latency in a"
                           " %s build with debug draw and frame-by-frame video" % (margin_s, camera_speed_mps, build),
                           "ic [00:27:44] [00:28:16]"))
    elif measured_latency_s > margin_s:
        out.append(finding("warn", "pcg.pop_in", "latency %.2f s > margin %.2f s: visible pop-in" % (measured_latency_s, margin_s),
                           "ic [00:27:10]", "raise budget, generation radius, or lower camera speed / cull distance"))
    if build.lower() == "development":
        out.append(finding("info", "pcg.dev_build", "Development generates slower than Test and Shipping", "ic [00:27:44]"))
    return out


GPU_FIX_HINTS = {
    "static mesh spawner": "enable its GPU backend so it consumes GPU output (ic [00:21:37])",
    "surface sampler": "no GPU backend yet in the talk: sample in a custom HLSL Point Generator (ic [00:22:10]) [verify 5.8]",
    "get texture data": "Skip Readback to CPU when no CPU node reads it (ic [00:22:43])",
    "generate grass maps": "Skip Readback to CPU when no CPU node reads it (ic [00:22:43])",
    "graph parameters": "upload once on the unbounded grid (Attribute Set Processor, 5.7) (ic [00:23:16])",
    "get landscape data": "Get Height Only, layer weights off (not on GPU); or Generate Landscape Textures (5.7) (ic [00:24:12])",
}


def find_gpu_transfers(nodes: Dict[str, Dict[str, Any]], edges: Sequence[Tuple[str, str]]) -> List[Dict[str, Any]]:
    """nodes: {id: {"title", "gpu": bool, "grid": "unbounded"|metres, "skip_readback": bool}}
    edges: [(from_id, to_id)]. Every CPU->GPU edge is an upload and every GPU->CPU edge a
    readback: measurable costs even for small data (ic [00:21:03]-[00:23:50]). Returns one
    record per transfer with a fix hint."""
    out = []
    for a, b in edges:
        na, nb = nodes[a], nodes[b]
        ga, gb = bool(na.get("gpu")), bool(nb.get("gpu"))
        if ga == gb:
            continue
        kind = "upload" if (not ga and gb) else "readback"
        if kind == "readback" and na.get("skip_readback"):
            continue
        culprit = na if kind == "upload" else nb
        title = str(culprit.get("title", "")).lower()
        hint = next((v for k, v in GPU_FIX_HINTS.items() if k in title), "keep the chain on GPU end to end (j3 [00:42:49])")
        rec = {"kind": kind, "from": a, "to": b, "hint": hint}
        grid = na.get("grid")
        if kind == "upload" and grid not in (None, "unbounded"):
            rec["per_cell"] = True
            rec["hint"] += "; this upload repeats per %s m cell: hoist it to the unbounded grid" % grid
        out.append(rec)
    return out


def pcg_component_check(components: Sequence[Dict[str, Any]], world_actor: Optional[Dict[str, Any]] = None,
                        partition_grid_m: float = PCG_PARTITION_GRID_M,
                        gpu_only_max_bounds_m: Optional[float] = None,
                        teleports: bool = False) -> List[Dict[str, str]]:
    """components: [{"name", "bounds_m": (x, y), "is_partitioned", "trigger": OnLoad|OnDemand|AtRuntime,
    "uses_graph_instance", "gpu_only_roles": [...], "gpu_only_bounds_m": float, "collision_on_clutter",
    "gameplay", "reads_landscape_cpu", "editor_only", "hlod_layer", "data_layer",
    "generation_source_at_teleports"}]
    world_actor: {"treat_editor_viewport_as_generation_source", "landscape_cache"}
    teleports: the game teleports the player (spawn points, fast travel)."""
    out = []
    wa = world_actor or {}
    small_roles = ("grass", "pebble", "pebbles", "clutter", "twig", "twigs", "flower", "flowers", "small")
    for c in components:
        name = c.get("name", "?")
        bx, by = c.get("bounds_m", (0, 0))
        trig = str(c.get("trigger", "OnLoad")).lower()
        if max(bx, by) > partition_grid_m and not c.get("is_partitioned"):
            out.append(finding("warn", "pcg.not_partitioned",
                               "%s spans %.0f m (> %.0f m partition cell) without Is Partitioned: every instance lands"
                               " on the volume's components" % (name, max(bx, by), partition_grid_m),
                               "Tb [00:22:34]", "tick Is Partitioned"))
        if trig == "atruntime":
            if not wa.get("treat_editor_viewport_as_generation_source"):
                out.append(finding("warn", "pcg.runtime_invisible_in_editor",
                                   "%s generates at runtime but the PCG World Actor does not treat the editor viewport"
                                   " as a generation source: nothing shows in the editor" % name,
                                   "Tb [00:23:40]; Aal [00:07:56]"))
            if c.get("reads_landscape_cpu") and not wa.get("landscape_cache"):
                out.append(finding("error", "pcg.landscape_cache_off",
                                   "%s reads the landscape on CPU at runtime with the PCG landscape cache off:"
                                   " generation fails in PIE and cooked builds" % name, "rn56 Upgrade Notes Procedural",
                                   "enable the landscape cache on the PCG World Actor"))
            if c.get("gameplay"):
                out.append(finding("warn", "pcg.runtime_gameplay",
                                   "%s is gameplay-relevant but generated at runtime: designers cannot see it next to"
                                   " dressed art; bake it" % name, "Aal [00:07:56]; digest pcg_open_world_visual"))
            if teleports and not c.get("generation_source_at_teleports"):
                out.append(finding("warn", "pcg.teleport_latency",
                                   "%s generates at runtime and the game teleports: latency is worse than on continuous"
                                   " paths" % name, "ic [00:36:44]; rn56",
                                   "PCG Generation Source component at the target before arrival; cap concurrency with"
                                   " pcg.RuntimeGeneration.NumGeneratingComponents"))
        else:
            if not c.get("editor_only") and not c.get("hlod_layer"):
                out.append(finding("warn", "pcg.no_hlod_layer",
                                   "%s has no HLOD Layer: spawned actors inherit the PCG actor's HLOD Layer and Data"
                                   " Layer, so its baked instances miss the HLOD plan" % name,
                                   "PCGdoc World Partition Support",
                                   "assign the volume to the family's HLOD layer (Instancing for trees and rocks) and"
                                   " Data Layer before generating"))
            if not c.get("editor_only") and not c.get("data_layer"):
                out.append(finding("info", "pcg.no_data_layer", "%s has no Data Layer; its output inherits none" % name,
                                   "PCGdoc World Partition Support"))
        if trig == "onload":
            out.append(finding("info", "pcg.onload_means_cook", "%s: Generate On Load means at cook, not level load" % name,
                               "Tb [00:25:17]"))
        if c.get("uses_graph_instance") is False:
            out.append(finding("info", "pcg.no_instance", "%s points at a raw graph; use a Graph Instance with"
                               " parameter overrides" % name, "Tb [00:12:18]; PCGdoc Graph Instances"))
        for role in c.get("gpu_only_roles", []) or []:
            if str(role).lower() not in small_roles:
                out.append(finding("warn", "pcg.gpu_only_big", "%s spawns %r GPU-only: GPU-only instances are absent from"
                                   " the Lumen scene, keep them for small things" % (name, role), "Tb [00:24:45]"))
        if gpu_only_max_bounds_m is not None and c.get("gpu_only_bounds_m", 0) > gpu_only_max_bounds_m:
            out.append(finding("warn", "pcg.gpu_only_bounds", "%s GPU-only mesh bounds %.1f m above the project limit"
                               " %.1f m [added]" % (name, c["gpu_only_bounds_m"], gpu_only_max_bounds_m), "Tb [00:24:45]"))
        if c.get("collision_on_clutter"):
            out.append(finding("warn", "pcg.clutter_collision", "%s spawns clutter with collision on (170,000 physics bodies"
                               " and a 7-minute map open in Epic's example)" % name, "Tb [00:30:49]",
                               "collision off in the spawner descriptor for clutter"))
    return out


def parse_assembly_tags(tags: Sequence[str], vocabulary: Optional[Sequence[str]] = None) -> Dict[str, Any]:
    """Assembly actor tags become PCG point attributes: plain tag = boolean, name:number =
    value (Tb [00:16:40]). Tags must come from a fixed vocabulary, never typed by hand
    (Tb [00:29:42]). Returns {"attributes": {...}, "unknown": [...], "bad": [...]}."""
    vocab = {v.lower() for v in (vocabulary or [])}
    attrs: Dict[str, Any] = {}
    unknown, bad = [], []
    for t in tags:
        t = str(t).strip()
        if not t:
            continue
        if ":" in t:
            k, _, v = t.partition(":")
            try:
                attrs[k] = float(v)
            except ValueError:
                bad.append(t)
                continue
        else:
            k = t
            attrs[k] = True
        if vocab and k.lower() not in vocab:
            unknown.append(k)
    return {"attributes": attrs, "unknown": unknown, "bad": bad, "ok": not unknown and not bad}


def grammar_string(start: str, modules: Dict[str, float], end: str, repeat: str = "*") -> str:
    """Shape grammar for Subdivide Spline or Segment (j3 [00:10:31]-[00:15:14]):
    [ ] sequences, { } stochastic choice with optional :weight, * or + repetition.
    grammar_string("NA", {"Straight": 3, "DoorLeft": 1}, "NB") -> "NA [{Straight:3, DoorLeft:1}]* NB"
    Exact weight syntax [verify] in 5.8."""
    if repeat not in ("*", "+"):
        raise ValueError("repeat must be * or +")
    parts = []
    for k, w in modules.items():
        parts.append(k if w in (None, 1, 1.0) and len(modules) == 1 else "%s:%g" % (k, w))
    body = parts[0] if len(parts) == 1 else "{%s}" % ", ".join(parts)
    return "%s [%s]%s %s" % (start, body, repeat, end)


def grammar_check(s: str, symbols: Sequence[str] = ()) -> List[str]:
    """Bracket balance and unknown module symbols (symbols = module table names)."""
    errs = []
    stack = []
    pairs = {"]": "[", "}": "{", ")": "("}
    for ch in s:
        if ch in "[{(":
            stack.append(ch)
        elif ch in "]})":
            if not stack or stack[-1] != pairs[ch]:
                errs.append("unbalanced %r" % ch)
                return errs
            stack.pop()
    if stack:
        errs.append("unclosed %r" % stack[-1])
    if symbols:
        known = set(symbols)
        tokens = [t for t in
                  s.replace("[", " ").replace("]", " ").replace("{", " ").replace("}", " ")
                   .replace("(", " ").replace(")", " ").replace(",", " ").replace("*", " ").replace("+", " ").split()]
        for t in tokens:
            name = t.split(":")[0]
            if name and name not in known:
                errs.append("unknown module %r" % name)
    return errs


CLUTTER_ROLES = ("clutter", "grass", "pebble", "pebbles", "twig", "twigs", "flower", "flowers", "debris", "small")
SOLID_ROLES = ("tree", "trees", "trunk", "trunks", "boulder", "boulders", "rock_large", "cliff")


def pcg_graph_lint(nodes: Dict[str, Dict[str, Any]], role: str = "") -> List[Dict[str, str]]:
    """Lint a dumped PCG graph (dump_pcg_graph in the editor, or written from a screenshot).
    nodes: {id: {"title", "gpu": bool, "settings": {...}}}; settings keys used:
    target_attribute, warn_on_missing, layer_weights, height_only, collision, spawn_role,
    differences. role: "forest" enables the forest recipe checks."""
    out = []
    titles = {k: str(v.get("title", "")).lower() for k, v in nodes.items()}
    has_gpu = any(v.get("gpu") for v in nodes.values())
    for k, n in nodes.items():
        t, st = titles[k], n.get("settings", {}) or {}
        if ("attribute filter" in t or "filter attribute" in t) and not str(st.get("target_attribute", "$")).startswith("$"):
            if st.get("warn_on_missing") is False:
                out.append(finding("warn", "pcg.filter_silent",
                                   "%s filters on %r with Warn on Data Missing Attribute off: a renamed or missing layer"
                                   " filters everything out silently" % (k, st.get("target_attribute")),
                                   "Tb frame 00:10:47 [00:32:26]", "tick Warn on Data Missing Attribute"))
        if t == "select" or t.startswith("select ("):
            out.append(finding("info", "pcg.select_no_cull", "%s: Select still executes every input" % k,
                               "PCGnodes Control Flow", "Branch or Switch culls the unused path"))
        if "distance to density" in t:
            out.append(finding("info", "pcg.superseded_node", "%s: Distance to Density is superseded" % k,
                               "PCGnodes Density", "Distance node (significantly more efficient)"))
        if "mesh sampler" in t or "volume sampler" in t:
            out.append(finding("info", "pcg.costly_sampler", "%s is a costly sampler" % k, "PCGnodes Sampler",
                               "run it on a coarse hierarchical grid or offline [added]"))
        if "get landscape data" in t and (n.get("gpu") or has_gpu) and st.get("layer_weights"):
            out.append(finding("error", "pcg.layer_weights_gpu",
                               "%s asks for layer weights in a GPU graph: layer weights are not available on GPU" % k,
                               "ic [00:24:12] [00:13:36]",
                               "Get Height Only; paint the mask with landscape grass types (no meshes) read by"
                               " Generate Grass Maps"))
        if "static mesh spawner" in t:
            srole = str(st.get("spawn_role", "")).lower()
            if st.get("collision") and srole in CLUTTER_ROLES:
                out.append(finding("warn", "pcg.clutter_collision", "%s spawns %s with collision on" % (k, srole),
                                   "Tb [00:30:49]", "collision off in the template descriptor"))
            if st.get("collision") is False and srole in SOLID_ROLES:
                out.append(finding("warn", "pcg.solid_no_collision",
                                   "%s spawns %s with collision off (the spawner default)" % (k, srole),
                                   "j3 [00:17:30]; 5ju [00:54:16]", "collision on in the template descriptor"))
    if role.lower() in ("forest", "trees", "woodland"):
        if not any((t.strip() == "distance" or t.startswith("distance ")) and "to density" not in t
                   for t in titles.values()):
            out.append(finding("info", "pcg.no_bank_thinning",
                               "forest graph without a Distance node: tree scale and density ignore river banks and"
                               " forest edges", "PCGnodes Distance; PCGnodes U1 recipe",
                               "Distance to river points to thin or scale down trees near banks"))
        under = [k for k, n in nodes.items() if "spawner" in titles[k]
                 and str((n.get("settings") or {}).get("spawn_role", "")).lower() in ("understory", "shrub", "shrubs", "bush")]
        diff_trees = [k for k, n in nodes.items() if "difference" in titles[k]
                      and str((n.get("settings") or {}).get("differences", "")).lower() in ("trees", "tree_locations", "tree locations")]
        if under and not diff_trees:
            out.append(finding("info", "pcg.understory_on_trunks",
                               "understory spawned without a Difference against tree locations: shrubs inside trunks",
                               "Tb frame 00:14:55", "Difference with Differences = tree points (Extents Modifier)"))
    return out


def runtime_grass_check(setup: Dict[str, Any]) -> List[Dict[str, str]]:
    """Runtime GPU grass inputs (ic [00:09:35]-[00:14:11], [00:24:12]). setup keys:
    mask_source ("grass_maps" | "layer_weights" | ...), grass_types_have_meshes (bool),
    asset_arrays {name: [items]}, placeholder_entries (bool), params_upload_grid
    ("unbounded" | metres), landscape_read ("height_only" | "full" | "height_rvt" |
    "landscape_textures"), nanite_instances (bool), ring_handover ("draw_distance" |
    "generation_radius")."""
    out = []
    if str(setup.get("mask_source", "")).lower() == "layer_weights":
        out.append(finding("error", "grass.mask_layer_weights", "grass mask from layer weights: not available on GPU",
                           "ic [00:24:12]", "landscape grass types with no meshes + Generate Grass Maps (ic [00:13:36])"))
    if setup.get("grass_types_have_meshes"):
        out.append(finding("warn", "grass.types_spawn_too", "landscape grass types still carry meshes: grass spawns twice",
                           "ic [00:13:36]", "keep grass types only as the painting mask, no meshes"))
    arrays = setup.get("asset_arrays") or {}
    empty = [k for k, v in arrays.items() if not v]
    if arrays and (empty or setup.get("placeholder_entries") is False):
        out.append(finding("warn", "grass.stream_placeholder",
                           "asset arrays %s can be empty: order-keyed streams collapse and break the grass-map keys"
                           % (empty or list(arrays)), "ic [00:12:42]", "one placeholder item in every asset array"))
    grid = setup.get("params_upload_grid")
    if grid is not None and str(grid).lower() != "unbounded":
        out.append(finding("warn", "grass.params_per_cell", "graph parameters uploaded on the %s m grid: once per cell" % grid,
                           "ic [00:23:16]", "upload on the unbounded grid (Attribute Set Processor, 5.7)"))
    lr = str(setup.get("landscape_read", "")).lower()
    if lr == "full":
        out.append(finding("warn", "grass.landscape_full_read", "full landscape read for GPU scatter",
                           "ic [00:24:12]", "Get Height Only (about 0.5 ms game thread per 32 m cell on base PS5),"
                           " a warmed-up height RVT, or Generate Landscape Textures (5.7)"))
    if setup.get("nanite_instances") and str(setup.get("ring_handover", "")).lower() == "draw_distance":
        out.append(finding("warn", "grass.nanite_draw_distance",
                           "ring handover by draw distance on Nanite instances: distance culling and min/max draw"
                           " distance do not apply to Nanite", "NANdoc Rendering; Looman",
                           "ring edges by generation radius per grid, or a non-Nanite far ring [verify on first run]"))
    return out


def village_paths(heights_m, cell_m: float, doors_m: Sequence[Sequence[float]], network_m: Sequence[Sequence[float]],
                  max_slope_deg: float = 25.0, slope_weight: float = 8.0, point_every_m: float = 8.0) -> Dict[str, Any]:
    """Offline substitute for the recursive pathfinding subgraph (Tb [00:20:01]-[00:21:09]):
    each door gets the cheapest path to the existing network (roads), and every found path
    joins the network, so the next house connects to the nearest path already built.
    heights_m: 2D grid (rows = Y) sampled every cell_m metres, origin at (0, 0), e.g. the
    blockout heightmap downsampled; doors_m and network_m: (x_m, y_m) points. Cost per step
    = length x (1 + slope_weight x grade); steps steeper than max_slope_deg are refused.
    Doors are served nearest-first [added order]; weights and slope limit are [added]
    defaults. Returns paths as (x_m, y_m, z_m) points every ~point_every_m for landscape
    splines on the Splines edit layer, plus unreachable doors."""
    import heapq
    rows = [list(map(float, r)) for r in heights_m]
    ny, nx = len(rows), len(rows[0])

    def cell(p):
        return (min(max(int(round(p[1] / cell_m)), 0), ny - 1), min(max(int(round(p[0] / cell_m)), 0), nx - 1))

    goals = {cell(p) for p in network_m}
    if not goals:
        raise ValueError("network_m needs at least one point (the road)")
    max_grade = math.tan(math.radians(max_slope_deg))
    steps = [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)]

    def near_net(c):
        return min(math.hypot(c[0] - g[0], c[1] - g[1]) for g in goals)

    pending = [cell(d) for d in doors_m]
    paths, unreachable = [], []
    while pending:
        pending.sort(key=near_net)
        start = pending.pop(0)
        dist = {start: 0.0}
        prev: Dict[Tuple[int, int], Tuple[int, int]] = {}
        heap = [(0.0, start)]
        end = None
        while heap:
            d, c = heapq.heappop(heap)
            if d > dist.get(c, 1e30):
                continue
            if c in goals:
                end = c
                break
            for dy, dx in steps:
                q = (c[0] + dy, c[1] + dx)
                if not (0 <= q[0] < ny and 0 <= q[1] < nx):
                    continue
                run = cell_m * (1.4142135623730951 if dy and dx else 1.0)
                grade = abs(rows[q[0]][q[1]] - rows[c[0]][c[1]]) / run
                if grade > max_grade:
                    continue
                nd = d + run * (1.0 + slope_weight * grade)
                if nd < dist.get(q, 1e30):
                    dist[q] = nd
                    prev[q] = c
                    heapq.heappush(heap, (nd, q))
        if end is None:
            unreachable.append((start[1] * cell_m, start[0] * cell_m))
            continue
        chain = [end]
        while chain[-1] != start:
            chain.append(prev[chain[-1]])
        chain.reverse()
        goals.update(chain)                      # the recursion: this path joins the network
        every = max(1, int(round(point_every_m / cell_m)))
        keep = chain[::every] + ([chain[-1]] if (len(chain) - 1) % every else [])
        pts = [(c[1] * cell_m, c[0] * cell_m, rows[c[0]][c[1]]) for c in keep]
        length = sum(math.hypot(a[0] - b[0], a[1] - b[1]) for a, b in zip(pts, pts[1:]))
        paths.append({"door_m": (start[1] * cell_m, start[0] * cell_m), "points_m": pts,
                      "length_m": round(length, 1), "joins_at_m": (end[1] * cell_m, end[0] * cell_m)})
    return {"paths": paths, "unreachable": unreachable,
            "source": "Tb [00:20:01]-[00:21:09] recursive pathfinding; grid search [added]"}


# =============================================================================================
# 4. Nanite, tessellation, foliage, placement tiers
# =============================================================================================

def nanite_decision(mesh: Dict[str, Any]) -> Dict[str, Any]:
    """mesh: {"name", "platform_nanite": bool, "blend_modes": [...], "is_foliage", "masked",
    "morph_targets", "lightmap_uvs", "lumen", "wpo", "accept_experimental"}.
    Rule: Nanite wherever the platform supports it (NANdoc); exceptions are unsupported
    materials and deformation."""
    reasons, actions = [], []
    if mesh.get("platform_nanite") is False:
        return {"nanite": False, "reasons": ["platform without Nanite: keep LODs and cards (NANdoc Supported Platforms)"],
                "actions": ["classic LODs; masked cards with care"]}
    modes = [str(m).lower() for m in mesh.get("blend_modes", ["opaque"])]
    if any(m not in ("opaque", "masked") for m in modes):
        return {"nanite": False, "reasons": ["translucent or other blend mode: Nanite supports Opaque and Masked only;"
                                             " falls back to a default material with a log warning (NANdoc Materials)"],
                "actions": ["split translucent parts to a non-Nanite mesh [added]"]}
    if mesh.get("morph_targets"):
        return {"nanite": False, "reasons": ["morph targets unsupported (NANdoc Mesh Deformation)"], "actions": []}
    reasons.append("Nanite should generally be enabled wherever possible (NANdoc)")
    reasons.append("even low-poly meshes: the non-Nanite VSM pass costs more (VSM doc via version deltas)")
    if mesh.get("lightmap_uvs") and mesh.get("lumen", True):
        actions.append("turn off Generate Lightmap UVs (Lumen project, NANdoc Importing a Mesh)")
    if mesh.get("is_foliage"):
        if mesh.get("masked"):
            actions.append("prefer opaque modeled leaves: Nanite runs better without masked materials (aZr [00:01:46])")
        if mesh.get("accept_experimental"):
            actions.append("Nanite Foliage (Experimental): Nanite Assemblies of instanced branch parts cut asset size to"
                           " about 5 to 10% (aZr [00:07:13]); wind on a skeleton of a few hundred to 1,000 bones with"
                           " Dynamic Wind instead of WPO, tighter bounds (aZr [00:09:17] [00:09:51]); Shape Preservation"
                           " Voxelize: voxels keep volume from every side where impostors do not (aZr [00:11:14]"
                           " [00:12:16]); more branch variants per zone, since instances store only transforms"
                           " (aZr [00:05:35])")
        else:
            actions.append("non-voxel foliage: hidden blockers inside canopies three or four trees deep (6ig [00:35:17])")
    if mesh.get("wpo"):
        actions.append("clamp WPO displacement; set WPO Disable Distance (NANdoc Mesh Deformation; Looman)")
    return {"nanite": True, "reasons": reasons, "actions": actions}


def displacement_feet_error_cm(magnitude_cm: float, center: float = 0.5) -> Dict[str, float]:
    """Tessellation has no collision (6ig [00:20:46]): the displaced surface spans
    (h - center) x magnitude around the collision surface, h in 0..1. Feet standing on the
    collision sink into raised parts by up to (1 - center) x magnitude and float over lowered
    parts by up to center x magnitude [added arithmetic from the talk's remap]."""
    m, c = float(magnitude_cm), float(center)
    sink, flt = max(0.0, (1.0 - c) * m), max(0.0, c * m)
    return {"sink_cm": round(sink, 2), "float_cm": round(flt, 2), "max_cm": round(max(sink, flt), 2)}


def tessellation_check(settings: Dict[str, Any]) -> List[Dict[str, str]]:
    """settings: {"enable_tessellation", "dicing_rate", "surface": ground|vertical_rock,
    "center", "height_texture_compression", "animated", "feet_tolerance_cm",
    "layers": [{"name", "surface", "center", "magnitude_cm"}]}. Landscape displacement is
    set per layer (magnitude and center), so give "layers" for a landscape."""
    out = []
    layers = settings.get("layers") or []
    tol = settings.get("feet_tolerance_cm")
    for l in layers:
        surf = str(l.get("surface", "ground")).lower()
        want = 1.0 if surf.startswith("vert") else 0.5
        if l.get("center") is not None and abs(float(l["center"]) - want) > 1e-6:
            out.append(finding("warn", "tess.layer_center", "layer %s center %.2f on %s: use %.1f (0.5 on ground,"
                               " 1 on vertical rock faces)" % (l.get("name"), float(l["center"]), surf, want),
                               "6ig [00:22:58] [00:23:33]"))
        if tol is not None and l.get("magnitude_cm") is not None and not surf.startswith("vert"):
            e = displacement_feet_error_cm(l["magnitude_cm"], l.get("center", want))
            if e["max_cm"] > float(tol):
                out.append(finding("warn", "tess.feet", "layer %s: feet sink up to %.1f cm or float %.1f cm (tolerance"
                                   " %.1f cm): tessellation has no collision" % (l.get("name"), e["sink_cm"], e["float_cm"],
                                                                                 float(tol)),
                                   "6ig [00:20:46] [00:21:19]", "smaller magnitude on walkable layers, centered"))
    mags = [float(l["magnitude_cm"]) for l in layers if l.get("magnitude_cm") is not None]
    if len(mags) > 1 and len(set(mags)) == 1:
        out.append(finding("warn", "tess.same_magnitude", "every layer displaces by %.1f cm: rocks everywhere" % mags[0],
                           "6ig [00:24:37] [00:25:09]", "per-layer magnitude: grass small, rock large"))
    if settings.get("enable_tessellation") is False:
        out.append(finding("error", "tess.flag_off", "displacement wired but Enable Tessellation off (5.4+ explicit flag)",
                           "rn54, rn55 Nanite; version deltas Nanite"))
    rate = settings.get("dicing_rate")
    if rate is not None and (rate < 2 or rate > 5):
        out.append(finding("warn", "tess.dicing_rate", "dicing rate %s: below 2 is slower, above about 5 or 6 is also"
                           " slower; leave 2" % rate, "6ig [00:29:53] [00:30:26]"))
    surf = str(settings.get("surface", "ground")).lower()
    center = settings.get("center")
    if center is not None:
        want = 1.0 if surf.startswith("vert") else 0.5
        if abs(float(center) - want) > 1e-6:
            out.append(finding("warn", "tess.center", "displacement center %.2f on %s; tessellation has no collision, use"
                               " %.1f so feet neither sink nor float" % (center, surf, want), "6ig [00:20:46] [00:22:58]"))
    comp = settings.get("height_texture_compression")
    if comp and "hdr" not in str(comp).lower():
        out.append(finding("warn", "tess.height_compression", "height texture %s gives jagged displacement" % comp,
                           "5ju [00:31:32]", "HDR Compressed"))
    if settings.get("animated") and settings.get("via_rvt"):
        out.append(finding("warn", "tess.animated_rvt", "animated displacement through an RVT updates poorly", "6ig [00:28:49]"))
    return out


def displacement_layer_value(h: float, magnitude: float, center: float = 0.5) -> float:
    """Per-layer remap of a normalized 0..1 height: h x magnitude - magnitude / 2 + center,
    so the layer midpoint stays on the collision surface (6ig [00:24:04]-[00:26:52]).
    Clamped to 0..1 [added]."""
    v = h * magnitude - magnitude * 0.5 + center
    return min(1.0, max(0.0, v))


def obj_construction_stats(obj_text: str, tol: float = 1e-4) -> Dict[str, Any]:
    """Construction facts of a mesh exported from the DCC as OBJ (text), before import:
    triangle count, disconnected islands (by shared positions), positions split by more than
    one normal (hard edges) or UV (seams), and vertex-color noise (share of edges whose end
    colors differ by more than 0.25 [added]). These are the splits that stop Nanite from
    simplifying (6ig [00:03:53] [00:07:29] [00:08:04]). Stdlib only."""
    pos, uvs, nrm, cols = [], [], [], []
    faces = []
    for line in obj_text.splitlines():
        p = line.split()
        if not p:
            continue
        if p[0] == "v":
            pos.append(tuple(float(x) for x in p[1:4]))
            cols.append(tuple(float(x) for x in p[4:7]) if len(p) >= 7 else None)
        elif p[0] == "vt":
            uvs.append(tuple(float(x) for x in p[1:3]))
        elif p[0] == "vn":
            nrm.append(tuple(float(x) for x in p[1:4]))
        elif p[0] == "f":
            corners = []
            for c in p[1:]:
                ids = (c.split("/") + ["", ""])[:3]

                def ix(v, n):
                    if not v:
                        return None
                    i = int(v)
                    return i - 1 if i > 0 else n + i
                corners.append((ix(ids[0], len(pos)), ix(ids[1], len(uvs)), ix(ids[2], len(nrm))))
            faces.append(corners)
    parent = list(range(len(pos)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    tris = 0
    by_pos_n: Dict[int, set] = {}
    by_pos_uv: Dict[int, set] = {}
    edges = set()
    q = lambda t: tuple(int(round(x / tol)) for x in t)  # noqa: E731
    for f in faces:
        tris += max(0, len(f) - 2)
        for i, (vi, ti, ni) in enumerate(f):
            ra, rb = find(vi), find(f[0][0])
            if ra != rb:
                parent[ra] = rb
            if ni is not None:
                by_pos_n.setdefault(vi, set()).add(q(nrm[ni]))
            if ti is not None:
                by_pos_uv.setdefault(vi, set()).add(q(uvs[ti]))
            a, b = vi, f[(i + 1) % len(f)][0]
            edges.add((min(a, b), max(a, b)))
    used = {c[0] for f in faces for c in f}
    islands = len({find(v) for v in used})
    n_used = max(len(used), 1)
    noisy = None
    if cols and all(c is not None for c in cols) and edges:
        diff = sum(1 for a, b in edges if max(abs(x - y) for x, y in zip(cols[a], cols[b])) > 0.25)
        noisy = round(diff / float(len(edges)), 4)
    return {"positions": len(used), "triangles": tris, "islands": islands,
            "normal_split_ratio": round(sum(1 for s in by_pos_n.values() if len(s) > 1) / float(n_used), 4),
            "uv_split_ratio": round(sum(1 for s in by_pos_uv.values() if len(s) > 1) / float(n_used), 4),
            "vertex_colors": any(c is not None for c in cols), "vertex_color_noise": noisy}


def nanite_construction_check(stats: Dict[str, Any], role: str = "rock", max_islands: int = 8,
                              max_split_ratio: float = 0.3, disk_mb: Optional[float] = None,
                              reference_disk_mb: Optional[float] = None) -> List[Dict[str, str]]:
    """Nanite construction rules (6ig [00:02:46]-[00:10:06]) on obj_construction_stats (or
    the same keys from an in-editor audit). Thresholds are project defaults [added]; the
    talk gives the principle and the 250 MB vs 12 MB example, not limits. Foliage skips the
    island rule (leaves are islands; use Nanite Assemblies, aZr [00:07:13])."""
    out = []
    r = role.lower()
    if r not in ("foliage", "tree", "leaves") and stats.get("islands", 1) > max_islands:
        out.append(finding("warn", "nanite.porous",
                           "%d disconnected triangle groups (kitbash or tile soup): Nanite cannot merge across them,"
                           " holes at low detail and hidden interiors add overdraw" % stats["islands"],
                           "6ig [00:03:19]-[00:05:32] [00:09:34]",
                           "rebuild as one connected base with a tiling texture, or bake repeats to a height map"))
    if stats.get("normal_split_ratio", 0) > max_split_ratio:
        out.append(finding("warn", "nanite.hard_edge_splits",
                           "%.0f%% of positions split by hard edges: splits stop simplification"
                           % (100 * stats["normal_split_ratio"]), "6ig [00:07:29]",
                           "consistent smoothing, support loops instead of hard edges"))
    if stats.get("uv_split_ratio", 0) > max_split_ratio:
        out.append(finding("warn", "nanite.uv_seams", "%.0f%% of positions on UV seams" % (100 * stats["uv_split_ratio"]),
                           "6ig [00:07:29]", "fewer, longer UV islands"))
    if (stats.get("vertex_color_noise") or 0) > 0.2:
        out.append(finding("warn", "nanite.vertex_color_noise",
                           "high-frequency vertex color noise acts like geometry splits", "6ig [00:08:04]",
                           "remove or smooth vertex colors the material does not need"))
    if disk_mb and reference_disk_mb and disk_mb >= 5.0 * reference_disk_mb:
        out.append(finding("warn", "nanite.disk_size",
                           "%.0f MB vs %.0f MB for a comparable asset: construction, not triangle count (Epic's example:"
                           " 250 MB vs 12 MB for the same look)" % (disk_mb, reference_disk_mb), "6ig [00:02:46]"))
    return out


def instance_ceiling_check(total_instances: int, warn_fraction: float = 0.5) -> List[Dict[str, str]]:
    """16 million streamed instances is a hard lock, Nanite or not (NANdoc Geometry).
    warn_fraction is a project margin [added]."""
    if total_instances >= NANITE_INSTANCE_CEILING:
        return [finding("error", "nanite.instance_ceiling", "%d instances reach the 16 million hard limit" % total_instances,
                        "NANdoc Geometry")]
    if total_instances >= warn_fraction * NANITE_INSTANCE_CEILING:
        return [finding("warn", "nanite.instance_margin", "%d instances, over %.0f%% of the 16 million limit [added margin]"
                        % (total_instances, warn_fraction * 100), "NANdoc Geometry")]
    return []


def placement_tier(asset: Dict[str, Any]) -> Dict[str, Any]:
    """Tiered placement by importance (ic [00:04:23]-[00:07:05]):
    hand = hero assets, landmarks, key quest or visual areas;
    baked = medium assets (shrubs to trees, rocks): editor-generated PCG or a builder, persistent;
    runtime_gpu = grass-class detail: dense, collisionless, purely visual.
    Collision and far visibility force persistent placement (5ju [00:54:16]); gameplay or
    unperceived variation forces baking (Aal [00:07:56])."""
    role = str(asset.get("role", "")).lower()
    why = []
    if role in ("hero", "landmark", "quest", "village", "house", "road", "river"):
        return {"tier": "hand", "why": ["hero and key areas are hand-placed (ic [00:04:23]); decide what stays manual"
                                        " (Tb [00:32:26]; Aal [00:11:13])"]}
    if asset.get("gameplay"):
        return {"tier": "baked", "why": ["gameplay-relevant: must be visible in the editor and stable (Aal [00:07:56])"]}
    if asset.get("collision") or asset.get("far_visible"):
        why.append("collision or far visibility needs persistent placement (5ju [00:54:16])")
        return {"tier": "baked", "why": why}
    if role in ("grass", "pebble", "pebbles", "twig", "twigs", "flower", "flowers", "small_clutter", "ground_cover"):
        return {"tier": "runtime_gpu", "why": ["dense, collisionless, visual: runtime generation saves disk and memory"
                                               " (Tb [00:24:13]; ic [00:05:30])", "keep GPU-only instances small (Tb [00:24:45])"]}
    return {"tier": "baked", "why": ["medium assets are pre-baked (ic [00:05:30])"]}


# =============================================================================================
# 5. Modular kits
# =============================================================================================

def kit_piece_check(name: str, bounds_min: Sequence[float], bounds_max: Sequence[float],
                    footprint_cm: Sequence[float], tiling_edges: Iterable[str] = ("+x", "-x"),
                    pivot: str = "bottom_center", tol_cm: float = 0.5,
                    min_inset_cm: float = 0.0) -> List[Dict[str, str]]:
    """Fallout 4 kit rules (QBA [00:06:14]-[00:07:51]): the footprint is the maximum extent;
    build to the edge only on tiling edges, inset non-tiling edges; pivots fixed early
    (bottom centre most common). Bounds in cm relative to the pivot. min_inset_cm is the
    project's buffer; the talk gives no number [added]."""
    out = []
    fx, fy, fz = [float(v) for v in footprint_cm]
    half = {"x": fx / 2.0, "y": fy / 2.0}
    mn = dict(zip("xyz", [float(v) for v in bounds_min]))
    mx = dict(zip("xyz", [float(v) for v in bounds_max]))
    tiling = {e.lower() for e in tiling_edges}
    if pivot == "bottom_center":
        if abs(mn["z"]) > tol_cm:
            out.append(finding("error", "kit.pivot_z", "%s min Z %.2f cm: pivot must sit at the base" % (name, mn["z"]), "QBA [00:06:46]"))
        cxy = ((mn["x"] + mx["x"]) / 2.0, (mn["y"] + mx["y"]) / 2.0)
        if not tiling and (abs(cxy[0]) > tol_cm or abs(cxy[1]) > tol_cm):
            out.append(finding("warn", "kit.pivot_xy", "%s is off-centre (%.1f, %.1f) cm" % (name, cxy[0], cxy[1]), "QBA [00:06:46]"))
    if mx["z"] > fz + tol_cm:
        out.append(finding("error", "kit.height", "%s is %.1f cm tall, footprint %.1f" % (name, mx["z"], fz), "QBA [00:06:14]"))
    for axis in ("x", "y"):
        for sign, val in (("+", mx[axis]), ("-", -mn[axis])):
            edge = sign + axis
            limit = half[axis]
            if val > limit + tol_cm:
                out.append(finding("error", "kit.beyond_footprint", "%s edge %s at %.1f cm exceeds the footprint %.1f cm"
                                   " (footprint = maximum extent)" % (name, edge, val, limit), "QBA [00:06:14]"))
            elif edge in tiling and abs(val - limit) > tol_cm:
                out.append(finding("warn", "kit.tiling_gap", "%s tiling edge %s at %.1f cm does not reach %.1f cm"
                                   % (name, edge, val, limit), "QBA [00:06:14]"))
            elif edge not in tiling and val > limit - min_inset_cm - tol_cm and min_inset_cm > 0:
                out.append(finding("warn", "kit.no_inset", "%s non-tiling edge %s is not inset by %.1f cm: coplanar walls"
                                   " and z-fighting with neighbours" % (name, edge, min_inset_cm), "QBA [00:06:14]"))
    return out


def door_width_check(openings_cm: Dict[str, float], standards_cm: Sequence[float], tol_cm: float = 0.5) -> List[Dict[str, str]]:
    """One single-wide and one double-wide standard across all kits (QBA [00:07:51]); the
    values are the project's."""
    out = []
    for n, w in openings_cm.items():
        if not any(abs(w - s) <= tol_cm for s in standards_cm):
            out.append(finding("warn", "kit.door_width", "%s opening %.1f cm matches no standard %s" % (n, w, list(standards_cm)),
                               "QBA [00:07:51]", "plug and socket: standard hole sizes (QBA [00:44:37])"))
    return out


# =============================================================================================
# 6. Regions for batch edits
# =============================================================================================

def region_tiles(bounds_min_m: Sequence[float], bounds_max_m: Sequence[float], tile_m: float,
                 overlap_m: float = 0.0, serpentine: bool = True) -> List[Dict[str, Any]]:
    """Split world bounds (x, y in metres) into tiles for region-by-region jobs: load,
    process, save, unload, next (Aal [00:20:55]). Serpentine order keeps neighbours
    consecutive so shared actors stay warm [added]."""
    x0, y0 = float(bounds_min_m[0]), float(bounds_min_m[1])
    x1, y1 = float(bounds_max_m[0]), float(bounds_max_m[1])
    if tile_m <= 0 or x1 <= x0 or y1 <= y0:
        raise ValueError("bad bounds or tile size")
    nx = int(math.ceil((x1 - x0) / tile_m - 1e-9))
    ny = int(math.ceil((y1 - y0) / tile_m - 1e-9))
    tiles = []
    for j in range(ny):
        cols = range(nx) if (not serpentine or j % 2 == 0) else range(nx - 1, -1, -1)
        for i in cols:
            ax, ay = x0 + i * tile_m, y0 + j * tile_m
            bx, by = min(ax + tile_m, x1), min(ay + tile_m, y1)
            tiles.append({"index": len(tiles), "ij": (i, j),
                          "min_m": (ax - overlap_m, ay - overlap_m), "max_m": (bx + overlap_m, by + overlap_m),
                          "center_m": ((ax + bx) / 2.0, (ay + by) / 2.0)})
    return tiles


def tour_viewpoints(bounds_min_m: Sequence[float], bounds_max_m: Sequence[float], ground_z_m: float = 0.0,
                    eye_height_m: float = 1.7, named: Optional[Dict[str, Sequence[float]]] = None) -> List[Dict[str, Any]]:
    """Fixed viewpoints for the daily screenshot and stat tour (Aal [00:23:36]): named
    places first (village square, river bank, forest edge, ridge overlook), then the four
    quadrant centres at eye height looking at the centre, then one overview. Locations in
    metres; convert to cm for Unreal. Eye height is [added]."""
    x0, y0 = bounds_min_m[0], bounds_min_m[1]
    x1, y1 = bounds_max_m[0], bounds_max_m[1]
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    vps = []
    for k, v in (named or {}).items():
        loc = list(v[:3]) if len(v) >= 3 else [v[0], v[1], ground_z_m + eye_height_m]
        rot = list(v[3:6]) if len(v) >= 6 else [0.0, 0.0, 0.0]
        vps.append({"name": k, "location_m": loc, "rotation": rot})
    for name, fx, fy in (("q_sw", 0.25, 0.25), ("q_se", 0.75, 0.25), ("q_ne", 0.75, 0.75), ("q_nw", 0.25, 0.75)):
        px, py = x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy
        yaw = math.degrees(math.atan2(cy - py, cx - px))
        vps.append({"name": name, "location_m": [px, py, ground_z_m + eye_height_m], "rotation": [0.0, -2.0, yaw]})
    span = max(x1 - x0, y1 - y0)
    vps.append({"name": "overview", "location_m": [x0 - 0.1 * span, y0 - 0.1 * span, ground_z_m + 0.35 * span],
                "rotation": [0.0, -28.0, 45.0]})
    return vps


# =============================================================================================
# 7. Whole-world spec validator, handoff sheets
# =============================================================================================

TICK_AGGREGATE_ABOVE = 15   # "more than 10 or 15 instances" of a ticking type: aggregate (Aal [00:23:04])


def world_rules_check(census: Sequence[Dict[str, Any]], vocabulary: Sequence[str] = (),
                      tick_limit: int = TICK_AGGREGATE_ABOVE) -> List[Dict[str, str]]:
    """World rules that documents only request, enforced as checks (Aal [00:23:04]: "a
    validator makes sure that actually happens"). census: [{"name", "class", "is_blueprint",
    "tags": [...], "role", "collision": bool, "ticks": bool, "construction_spawns": bool,
    "data_only": bool (Blueprint that only carries data on a static mesh)}], from
    world_census() in the editor. Per-actor rules also run inside register_world_validator."""
    out = []
    vocab = [v for v in vocabulary]
    for a in census:
        if vocab:
            chk = parse_assembly_tags([t for t in (a.get("tags") or []) if t], vocab)
            if chk["unknown"] or chk["bad"]:
                out.append(finding("error", "world.tag_vocabulary", "%s tags %s outside the vocabulary"
                                   % (a.get("name"), chk["unknown"] + chk["bad"]), "Tb [00:29:42]",
                                   "retag with the fixed vocabulary (tag_actors refuses typos)"))
        role = str(a.get("role", "")).lower()
        tags = [str(t).lower() for t in (a.get("tags") or [])]
        if a.get("collision") and (role in CLUTTER_ROLES or any(t.startswith("clutter") for t in tags)):
            out.append(finding("warn", "world.clutter_collision", "%s is clutter with collision on" % a.get("name"),
                               "Tb [00:30:49]", "collision off for clutter"))
        if a.get("construction_spawns"):
            out.append(finding("warn", "world.construction_scatter",
                               "%s spawns components or instances in its construction script: re-runs on load (Epic's"
                               " example: 170,000 physics bodies, 7-minute map open)" % a.get("name"), "Tb [00:30:49]",
                               "move the scatter to a PCG graph, whose output persists"))
    by_class: Dict[str, Dict[str, int]] = {}
    for a in census:
        if not a.get("is_blueprint"):
            continue
        d = by_class.setdefault(str(a.get("class")), {"n": 0, "ticks": 0, "data_only": 0})
        d["n"] += 1
        d["ticks"] += 1 if a.get("ticks") else 0
        d["data_only"] += 1 if a.get("data_only") else 0
    for cls, d in sorted(by_class.items()):
        if d["ticks"] > tick_limit:
            out.append(finding("warn", "world.tick_aggregate", "%d placed %s tick individually" % (d["ticks"], cls),
                               "Aal [00:23:04] (aggregate above 10 to 15 instances)",
                               "one manager ticks them, or event-driven updates (hand to scenario-unreal-gameplay)"))
        if d["data_only"] > tick_limit:
            out.append(finding("info", "world.asset_user_data",
                               "%d placed %s Blueprints only carry data: 100,000 actors 'can't all be blueprints'"
                               % (d["data_only"], cls), "Aal [00:27:49] [00:28:22]; threshold [added]",
                               "static meshes with Asset User Data, read component > root > mesh"))
    return out


def check_world_spec(spec: Dict[str, Any]) -> Dict[str, Any]:
    """Validate a world plan (see U1_EXAMPLE_SPEC for the schema) against the rules above.
    Returns summarize(findings) plus derived numbers."""
    f: List[Dict[str, str]] = []
    derived: Dict[str, Any] = {}
    size = float(spec.get("world_size_m", 0))
    terrain = spec.get("terrain", {}) or {}
    if terrain.get("type", "landscape") == "mesh_terrain":
        f.append(finding("warn", "terrain.mesh_terrain_experimental",
                         "Mesh Terrain is Experimental in 5.8 (production target late 2027, no RVT, APIs may break in 5.9)",
                         "QJw [00:43:54] [00:45:46]; rn58", "ship on Landscape unless overhangs, tunnels or 3D terrain are required"))
    elif terrain.get("needs_overhangs"):
        f.append(finding("info", "terrain.overhangs", "overhangs or tunnels are not possible on a heightfield; Mesh Terrain"
                         " (Experimental) or meshes", "QJw [00:01:43]"))
    if terrain.get("type", "landscape") == "landscape":
        v = terrain.get("vertices")
        if v:
            if not valid_heightmap_size(int(v)):
                f.append(finding("error", "landscape.invalid_size", "%s vertices is not a valid landscape size (2017, 4033...)" % v,
                                 "LANDdoc Calculating Heightmap Dimensions"))
            qps, sec, cpa = terrain.get("quads_per_section"), terrain.get("sections_per_component"), terrain.get("components_per_axis")
            if qps and sec and cpa:
                lay = landscape_layout(int(qps), int(sec), int(cpa), float(terrain.get("xy_scale_cm", 100)) / 100.0)
                derived["landscape"] = lay
                if lay["vertices"] != int(v):
                    f.append(finding("error", "landscape.layout_mismatch", "layout gives %d vertices, spec says %s" % (lay["vertices"], v)))
                if not lay["within_component_budget"]:
                    f.append(finding("error", "landscape.components", "%d components > 1024" % lay["components"],
                                     "LANDdoc Performance Considerations"))
                if sec == 1 and lay["components"] > 64:
                    f.append(finding("info", "landscape.sections_1x1", "1x1 sections: 2x2 gives the same heightmap with fewer"
                                     " components", "LANDdoc Component Sections"))
                if size and lay["extent_m"] + 1e-6 < size:
                    f.append(finding("error", "landscape.too_small", "landscape %.0f m smaller than the world %.0f m" % (lay["extent_m"], size)))
        z = float(terrain.get("z_scale", 100))
        relief = terrain.get("relief_m")
        hmin, hmax = terrain.get("height_min_m"), terrain.get("height_max_m")
        if hmin is not None and hmax is not None:
            az = float(terrain.get("actor_z_cm", 0.0)) / 100.0
            lo, hi = height_range_m(z)
            if hmax - az > hi or hmin - az < lo:
                fit = fit_heightmap_z(hmin, hmax)
                f.append(finding("error", "landscape.heightmap_clips",
                                 "heights %.1f..%.1f m with actor Z %.1f m do not fit %.1f..%.1f m at Z scale %.2f"
                                 % (hmin, hmax, az, lo + az, hi + az, z), "LANDdoc Calculating Heightmap Z Scale",
                                 "Z scale %.2f, actor Z %.0f cm (fit_heightmap_z)" % (fit["z_scale"], fit["actor_z_cm"])))
            derived["heightmap_fit"] = fit_heightmap_z(hmin, hmax)
        elif relief is not None:
            lo, hi = height_range_m(z)
            if relief > hi:
                f.append(finding("error", "landscape.z_range", "relief %.0f m exceeds %.0f m at Z scale %.0f" % (relief, hi, z),
                                 "LANDdoc Z Scale"))
            f.append(finding("info", "landscape.relief_declared", "declared relief only: give height_min_m and"
                             " height_max_m of the exported heightmap", "U1 GREEN run 2026-09-24"))
        layers = terrain.get("edit_layers") or []
        if len(layers) > int(terrain.get("max_edit_layers", DEFAULT_MAX_EDIT_LAYERS)):
            f.append(finding("warn", "landscape.edit_layers", "%d edit layers > project max" % len(layers), "LANDdoc Adding Layers"))
        if layers and not any("spline" in l.lower() for l in layers):
            f.append(finding("info", "landscape.no_spline_layer", "no Splines edit layer for roads and banks", "LANDdoc Special Edit Layers"))
        mats = terrain.get("material_layers") or []
        if mats:
            f += landscape_material_check(mats, terrain.get("layer_infos") or [], terrain.get("blend_mode", "Opaque"),
                                          terrain.get("opacity_mask_wired"), terrain.get("uses_holes", False),
                                          spec.get("platform") == "mobile", terrain.get("specular"),
                                          bool(terrain.get("specular_from_cavity")))
        if terrain.get("nanite") is False and spec.get("nanite_platform", True):
            f.append(finding("info", "landscape.nanite_off", "Nanite landscape off on a Nanite platform (holes then cost masked"
                             " raster; displacement needs it)", "LANDdoc Visibility Mask; 6ig [00:20:12]"))
        if terrain.get("tessellation"):
            f += tessellation_check(terrain["tessellation"])
    wp = spec.get("world_partition", {}) or {}
    if wp:
        f += wp_grid_check(wp.get("grids", []), size, wp.get("max_speed_mps"), wp.get("measured_cell_load_s"))
        if wp.get("teleports") and not wp.get("streaming_source_at_teleports"):
            f.append(finding("warn", "wp.teleport_streaming", "the game teleports but no World Partition Streaming Source"
                             " loads the target first", "WPdoc Streaming Sources; EEf07 [00:16:39]",
                             "Streaming Source component at the target, wait for Is Streaming Completed, then move"))
        if not wp.get("max_speed_mps"):
            f.append(finding("info", "wp.speed_unknown", "fastest traversal speed (sprint, vehicle, teleport) not given:"
                             " the streaming margin cannot be sized", "EEf07 [00:16:39] [added]",
                             "ask gameplay; add a World Partition Streaming Source before teleports (WPdoc)"))
        f += wp_facts_check({k: wp.get(k) for k in ("enable_streaming", "is_partitioned", "ofpa",
                                                     "level_blueprint_actor_refs", "runtime_hash_class")
                             if k in wp})
    f += data_layer_check(spec.get("data_layers", []) or [])
    hl = spec.get("hlod_layers", []) or []
    if spec.get("hlod_families") and not hl:
        derived["hlod_plan"] = hlod_plan(spec["hlod_families"])
    for l in hl:
        t = str(l.get("layer_type", "")).lower()
        if t in ("approximatemesh", "approximatedmesh", "meshapproximate"):
            f.append(finding("info", "hlod.approximate", "%s uses Approximate Mesh: not listed in the saved 5.8 HLOD doc"
                             " (Instancing, Merged, Simplified) [verify]" % l.get("name"), "WPdoc; EEf07 [00:41:46]"))
        if "tree" in str(l.get("families", l.get("name", ""))).lower() and t != "instancing":
            f.append(finding("warn", "hlod.trees_not_instancing", "%s holds trees but is %s" % (l.get("name"), l.get("layer_type")),
                             "WPdoc Choosing a Layer Type"))
    if len(hl) == 1:
        f.append(finding("info", "hlod.single_layer", "one HLOD layer for everything: set up one per content family",
                         "EEf07 [00:41:13]"))
    pcg = spec.get("pcg", {}) or {}
    if pcg:
        f += pcg_component_check(pcg.get("components", []), pcg.get("world_actor"),
                                 float(pcg.get("partition_grid_m", PCG_PARTITION_GRID_M)),
                                 teleports=bool(wp.get("teleports")))
        hl_types = {l.get("name"): str(l.get("layer_type", "")).lower() for l in hl}
        for c in pcg.get("components", []):
            lay = c.get("hlod_layer")
            if lay and hl and lay not in hl_types:
                f.append(finding("error", "pcg.hlod_layer_unknown", "%s names HLOD layer %s, not in the plan"
                                 % (c.get("name"), lay)))
            elif lay and hl_types.get(lay) not in (None, "instancing"):
                f.append(finding("warn", "pcg.hlod_layer_type", "%s (scattered instances) inherits %s, a %s layer"
                                 % (c.get("name"), lay, hl_types[lay]), "WPdoc Choosing a Layer Type; PCGdoc",
                                 "an Instancing layer for scattered trees and rocks"))
        if pcg.get("grass_setup"):
            f += runtime_grass_check(pcg["grass_setup"])
        if pcg.get("hier_grids_m"):
            f += check_hier_grids(pcg["hier_grids_m"], pcg.get("landscape_read_grid_m"))
        if pcg.get("frame_time_ms") is None:
            f.append(finding("info", "pcg.frame_time_unset", "pcg.FrameTime not decided (default 5 ms since 5.6; the Witcher 4"
                             " demo used 2 ms on base PS5)", "rn56; ic [00:26:24]", "set it per project and per area"))
        g = pcg.get("grass")
        if g:
            gr = grass_rings(g.get("dense_radius_m", 128), g.get("sparse_radius_m", 256), g.get("dense_grid_m", 32),
                             g.get("sparse_grid_m", 128), g.get("dense_ppm2"), g.get("sparse_ppm2"),
                             nanite=bool((pcg.get("grass_setup") or {}).get("nanite_instances")))
            derived["grass_rings"] = gr["rings"]
            f += gr["findings"]
            if g.get("camera_speed_mps") and g.get("cull_distance_m"):
                f += generation_lead_check(g["camera_speed_mps"], g.get("sparse_radius_m", 256), g["cull_distance_m"],
                                           g.get("measured_latency_s"), g.get("build", "Test"))
        if pcg.get("uses_landscape_grass_types") and pcg.get("grass"):
            f.append(finding("info", "pcg.grass_twice", "landscape grass types and PCG grass both configured; keep landscape grass"
                             " types only as a painting mask with no meshes", "ic [00:13:36]"))
    for a in spec.get("assets", []) or []:
        tier = placement_tier(a)
        want = a.get("tier")
        if want and want != tier["tier"]:
            sev = "warn"
            if want == "runtime_gpu" and (a.get("collision") or a.get("gameplay") or a.get("far_visible")):
                sev = "error"
            f.append(finding(sev, "placement.tier", "%s planned as %s, rules say %s: %s"
                             % (a.get("name"), want, tier["tier"], "; ".join(tier["why"])), "ic [00:04:23]; 5ju [00:54:16]"))
        if a.get("nanite") is not None or a.get("blend_modes"):
            dec = nanite_decision(dict(a, platform_nanite=spec.get("nanite_platform", True)))
            if a.get("nanite") is not None and bool(a["nanite"]) != dec["nanite"]:
                f.append(finding("warn", "nanite.choice", "%s nanite=%s, rules say %s: %s"
                                 % (a.get("name"), a["nanite"], dec["nanite"], "; ".join(dec["reasons"])), "NANdoc"))
    total = spec.get("instances_total_estimate")
    if total:
        f += instance_ceiling_check(int(total))
    if spec.get("project"):
        f += project_settings_check(spec["project"])
    out = summarize(f)
    out["derived"] = derived
    return out


def budget_sheet(spec: Dict[str, Any], measured: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Handoff to scenario-unreal-performance: the world-building budgets as numbers with their
    source, plus what still has to be measured. measured: {"pcg_gt_ms", "gen_latency_s",
    "cell_load_s", "frame_ms_by_viewpoint": {...}} from Insights, stat unit or ue_stat."""
    fps = float(spec.get("target_fps", 60))
    terrain = spec.get("terrain", {}) or {}
    lay = None
    if terrain.get("quads_per_section"):
        lay = landscape_layout(int(terrain["quads_per_section"]), int(terrain["sections_per_component"]),
                               int(terrain["components_per_axis"]))
    pcg = spec.get("pcg", {}) or {}
    g = pcg.get("grass") or {}
    sheet = {
        "world": spec.get("name"), "frame_budget_ms": round(1000.0 / fps, 2), "platform": spec.get("platform"),
        "landscape": {"components": lay["components"] if lay else None, "max_components": LANDSCAPE_MAX_COMPONENTS,
                      "section_draws": lay["section_draws"] if lay else None, "source": "LANDdoc Performance Considerations"},
        "world_partition": {"grids": (spec.get("world_partition") or {}).get("grids"),
                            "one_grid_rule": "WPdoc Runtime Grid Settings",
                            "runtime_data_layers": [l["name"] for l in spec.get("data_layers", []) if str(l.get("type")).lower() == "runtime"]},
        "pcg": {"frame_time_ms": pcg.get("frame_time_ms", PCG_DEFAULT_FRAME_MS),
                "editor_frame_time_ms": pcg.get("editor_frame_time_ms", PCG_DEFAULT_EDITOR_FRAME_MS),
                "instances_per_32m_cell_reference": WITCHER_INSTANCES_PER_32M,
                "grass_rings_m": (g.get("dense_radius_m", 128), g.get("sparse_radius_m", 256)) if g else None,
                "facts": list(PCG_BUDGET_FACTS)},
        "instances": {"estimate": spec.get("instances_total_estimate"), "hard_limit": NANITE_INSTANCE_CEILING,
                      "source": "NANdoc Geometry"},
        "hlod_layers": [l.get("name") for l in spec.get("hlod_layers", [])],
        "measure": ["PCG subsystem game thread over a full traversal (Insights, Test build) (ic [00:26:24])",
                    "GPU time on frames with PCG work (ic [00:30:26])",
                    "cell load times along the main paths (-trace=WorldStreaming, rn58)",
                    "wp.Runtime.HLOD 0/1 A/B frame time at the overview (WPdoc)",
                    "frame time per tour viewpoint, compared with the previous run (Aal [00:23:36])"],
        "measured": measured or {},
    }
    return sheet


def lighting_handoff(spec: Dict[str, Any], map_path: str, viewpoints: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """Handoff to scenario-unreal-lighting-rendering: the level and the facts that change lighting."""
    pcg = spec.get("pcg", {}) or {}
    gpu_only = sorted({r for c in pcg.get("components", []) for r in (c.get("gpu_only_roles") or [])})
    return {
        "map": map_path,
        "viewpoints": list(viewpoints),
        "template_lighting": "Open World template: sky atmosphere, skylight, directional light, height fog, volumetric"
                             " clouds (WPdoc Using the Open World Default Map)",
        "gpu_only_instances": gpu_only,
        "gpu_only_note": "GPU-only PCG instances are absent from the Lumen scene (Tb [00:24:45])",
        "foliage": "opaque modeled foliage lets more light through than cards (aZr [00:14:19])",
        "hlod": "check Allow Distance Fields and bForceRayTracingFarField per HLOD layer with the lighter (WPdoc; rn58)",
        "landscape_specular_note": "specular is the materials owner's call: Sensei sets 0.02 against plastic grass"
                                   " (5ju [00:11:12]); Ben Cloward keeps 0.5 and uses it only for cavity occlusion"
                                   " (0L5Azq6ugyo [00:01:19]); judge under the final lighting",
        "data_layers_state": [l["name"] for l in spec.get("data_layers", [])],
    }


# =============================================================================================
# 8. Commandlet arguments (feed ue_run.run_commandlet(uproject, name, args))
# =============================================================================================

WP_BUILDER = "WorldPartitionBuilderCommandlet"


def convert_args(map_path: str, report_only: bool = True, extra: Sequence[str] = ()) -> Tuple[str, List[str]]:
    """World Partition conversion (WPdoc Converting Existing Levels). Dry run first
    (-ReportOnly); the real run uses -ConversionSuffix, which writes a _WP copy and keeps the
    source. -DeleteSourceLevels is refused (never-delete rule). The doc form puts
    <Map>.umap after -run=."""
    if any("deletesourcelevels" in e.lower() for e in extra):
        raise ValueError("-DeleteSourceLevels is refused: keep the source level")
    args = [map_path, "-AllowCommandletRendering"]
    args += ["-ReportOnly"] if report_only else ["-ConversionSuffix"]
    return "WorldPartitionConvertCommandlet", args + list(extra)


def hlod_builder_args(map_path: str, step: Optional[str] = None, allow_delete: bool = False) -> Tuple[str, List[str]]:
    """HLOD builder (WPdoc Generating HLODs Using the Commandlet). step: None (setup and
    build), "setup", "build", "delete" (needs allow_delete: it removes generated HLOD actors)."""
    args = [map_path, "-Builder=WorldPartitionHLODsBuilder", "-AllowCommandletRendering"]
    if step == "setup":
        args.append("-SetupHLODs")
    elif step == "build":
        args.append("-BuildHLODs")
    elif step == "delete":
        if not allow_delete:
            raise ValueError("-DeleteHLODs removes generated HLOD actors: pass allow_delete=True on purpose")
        args.append("-DeleteHLODs")
    elif step is not None:
        raise ValueError("step must be None, setup, build or delete")
    return WP_BUILDER, args


def landscape_builder_args(map_path: str, scc: Optional[str] = None, iterative_cell_size: Optional[int] = None) -> Tuple[str, List[str]]:
    """Landscape builder (5.7): grass maps, physical materials, Nanite components
    (rn57; example line '-Builder=WorldPartitionLandscapeBuilder -AllowCommandletRendering
    (-IterativeCellSize=Value)')."""
    args = [map_path, "-Builder=WorldPartitionLandscapeBuilder", "-AllowCommandletRendering"]
    if scc:
        args.append("-SCCProvider=%s" % scc)
    if iterative_cell_size:
        args.append("-IterativeCellSize=%d" % int(iterative_cell_size))
    return WP_BUILDER, args


def pcg_builder_args(map_path: str, graph_names: Sequence[str] = (), settings_asset: Optional[str] = None) -> Tuple[str, List[str]]:
    """PCG offline builder (rn54 PCG Offline Builder; -PCGBuilderSettings= from rn55). 5.8
    adds a PCG Builder commandlet and PCG Builder Volume (rn58); its name and arguments are
    [verify], so this keeps the documented 5.4 form."""
    args = [map_path, "-Unattended", "-AllowCommandletRendering", "-Builder=PCGWorldPartitionBuilder"]
    if graph_names:
        args.append("-IncludeGraphNames=%s" % ";".join(graph_names))
    if settings_asset:
        args.append("-PCGBuilderSettings=%s" % settings_asset)
    return WP_BUILDER, args


def minimap_builder_args(map_path: str) -> Tuple[str, List[str]]:
    """Minimap builder; class name [verify] (WPdoc names the Minimap Builder commandlet;
    minimap display needs virtual texture support)."""
    return WP_BUILDER, [map_path, "-Builder=WorldPartitionMiniMapBuilder", "-AllowCommandletRendering"]


def build_pipeline(map_path: str, pcg_graphs: Sequence[str] = (), minimap: bool = False,
                   scc: Optional[str] = None) -> List[Tuple[str, List[str]]]:
    """Headless build order: landscape (grass maps, physical materials, Nanite) -> PCG ->
    HLOD (HLODs after generated content, Tb [00:29:07]) -> minimap. Landscape first is
    [added] ordering: PCG reads the landscape and its grass maps."""
    steps = [landscape_builder_args(map_path, scc=scc)]
    if pcg_graphs is not None:
        steps.append(pcg_builder_args(map_path, pcg_graphs))
    steps.append(hlod_builder_args(map_path))
    if minimap:
        steps.append(minimap_builder_args(map_path))
    return steps


REVIEW_CONSOLE = {
    # name: (commands, what to look for, source)
    "streaming": (["wp.Runtime.ToggleDrawRuntimeHash2D"], "cells loaded before the player arrives; no failed-to-load",
                  "WPdoc Debugging; EEf07 [00:46:37]"),
    "streaming_vertical": (["wp.Runtime.ToggleDrawRuntimeHash3D"], "vertical worlds", "EEf07 [00:22:51]"),
    "hlod_off": (["wp.Runtime.HLOD 0"], "A/B against HLOD on: frame time and silhouettes", "WPdoc Debugging"),
    "hlod_on": (["wp.Runtime.HLOD 1"], "proxies at distance", "WPdoc Debugging"),
    "hlod_coloration": (["viewmode hlodcoloration"], "sources green, proxies blue as the camera leaves [verify command;"
                        " GUI: View Mode > Level of Detail Coloration > Hierarchical LOD Coloration]",
                        "WPdoc Visualizing HLODs"),
    "data_layers": (["wp.DumpDatalayers", "wp.Runtime.ToggleDrawDataLayers"], "runtime states as expected", "WPdoc Data Layers"),
    "nanite_overdraw": (["r.Nanite.Visualize Overdraw"], "canopy line: 'the nuclear explosion' is failure [verify mode name]",
                        "6ig [00:32:00]; NANdoc"),
    "nanite_triangles": (["r.Nanite.Visualize Triangles"], "density responds to distance [verify mode name]", "6ig [00:05:52]"),
    "frame": (["stat unit", "stat gpu"], "game, render, GPU against the budget", "ic; profiling doc"),
    "landscape_merge": (["landscape.ForceLayersFullUpdate"], "one full edit layer merge (5.7+); ForceLayersUpdate is deprecated",
                        "rn57; rn58"),
}


# =============================================================================================
# 9. IN-EDITOR LAYER (Editor Python in UnrealEditor 5.8). NOT YET RUN IN UNREAL.
# =============================================================================================

MISSING: Dict[str, str] = {}      # name -> where it was needed; returned by probe()

API_CANDIDATES = {
    # what we need: candidate names in order (first that exists wins). All [verify].
    "LevelEditorSubsystem.new_level": "doc (py-ref)",
    "LevelEditorSubsystem.new_level_from_template": "doc (py-ref)",
    "EditorActorSubsystem.spawn_actor_from_class": "doc (py-ref)",
    "UnrealEditorSubsystem.get_editor_world": "doc (py-ref)",
    "UnrealEditorSubsystem.set_level_viewport_camera_info": "[verify]",
    "WorldPartitionBlueprintLibrary.get_editor_world_bounds": "[verify]",
    "WorldPartitionBlueprintLibrary.get_intersecting_actor_descs": "[verify]",
    "WorldPartitionBlueprintLibrary.load_actors": "[verify]",
    "WorldPartitionBlueprintLibrary.unload_actors": "[verify]",
    "DataLayerEditorSubsystem.create_data_layer_instance": "[verify]",
    "DataLayerEditorSubsystem.add_actors_to_data_layer": "[verify]",
    "DataLayerFactory": "[verify]",
    "HLODLayerFactory": "[verify]",
    "HLODLayer": "[verify]",
    "PCGVolume": "[verify]",
    "PCGComponent": "[verify]",
    "PCGGraphInstance": "[verify]",
    "PCGGraphInstanceFactory": "[verify]",
    "PCGGraphParametersHelpers": "[verify]",
    "PCGWorldActor": "[verify]",
    "LandscapeProxy": "[verify]",
    "LandscapeComponent": "[verify]",
    "LevelInstanceSubsystem": "[verify]",
    "SystemLibrary.execute_console_command": "[added] deltas helpers",
    "AutomationLibrary.take_high_res_screenshot": "[verify]",
    "ScopedEditorTransaction": "doc (py-ed)",
    "PCGGraph.get_nodes": "[verify]",
    "EditorValidatorBase": "doc (py-ref, k2_* overrides in 5.8)",
    "EditorValidatorSubsystem.add_validator": "[verify]",
    "PCGGenerationSourceComponent": "[verify] (rn54 names PCG Generation Source components)",
}


def _ue():
    import unreal  # noqa: F401  (only inside the editor)
    return unreal


def _has(path: str) -> bool:
    """'Class.method' or 'Class' exists on the unreal module."""
    try:
        u = _ue()
    except ImportError:
        return False
    obj = u
    for part in path.split("."):
        obj = getattr(obj, part, None)
        if obj is None:
            return False
    return True


def probe() -> Dict[str, Any]:
    """Run first on a new install: which API names exist. Returns {name: bool} plus MISSING."""
    res = {name: _has(name) for name in API_CANDIDATES}
    try:
        res["engine_version"] = str(_ue().SystemLibrary.get_engine_version())
    except Exception as e:  # pragma: no cover - editor only
        res["engine_version"] = "unknown (%s)" % e
    res["missing_during_run"] = dict(MISSING)
    return res


def _sub(name: str):
    u = _ue()
    cls = getattr(u, name, None)
    if cls is None:
        MISSING[name] = "subsystem"
        raise RuntimeError("unreal.%s missing [verify]" % name)
    return u.get_editor_subsystem(cls)


def _try_set(obj, names: Sequence[str], value) -> Optional[str]:
    """Set the first property (set_editor_property) or setter method that works. Returns the
    name used, or None (recorded in MISSING)."""
    for n in names:
        setter = getattr(obj, n, None) if n.startswith("set_") else None
        try:
            if setter is not None and callable(setter):
                setter(value)
                return n
            if not n.startswith("set_"):
                obj.set_editor_property(n, value)
                return n
        except Exception:
            continue
    MISSING["/".join(names)] = type(obj).__name__
    return None


def _try_get(obj, names: Sequence[str], default=None):
    for n in names:
        try:
            if n.startswith("get_") or n.startswith("is_"):
                fn = getattr(obj, n, None)
                if callable(fn):
                    return fn()
            else:
                return obj.get_editor_property(n)
        except Exception:
            continue
    return default


def _world():
    return _sub("UnrealEditorSubsystem").get_editor_world()


def console(cmd: str) -> None:
    """Console command in the editor world (SystemLibrary.execute_console_command [added])."""
    u = _ue()
    u.SystemLibrary.execute_console_command(_world(), cmd)


def template_candidates(root: str = "/Engine/Maps/Templates") -> List[str]:
    """List template maps; the Open World template path is [verify], so list, then pick."""
    u = _ue()
    try:
        return [p for p in u.EditorAssetLibrary.list_assets(root, recursive=True) if "open" in p.lower()]
    except Exception:
        MISSING["EditorAssetLibrary.list_assets(%s)" % root] = "template_candidates"
        return []


def new_open_world_map(asset_path: str, template: Optional[str] = None) -> Dict[str, Any]:
    """New map from the Open World template (WP, OFPA, Data Layers, HLOD, 2 km landscape,
    outdoor lighting: 'use the template', EEf07 [00:20:40]); else a partitioned empty map.
    LevelEditorSubsystem.new_level_from_template / new_level(is_partitioned_world) are doc."""
    les = _sub("LevelEditorSubsystem")
    tpl = template
    if tpl is None:
        cands = template_candidates()
        tpl = next((c for c in cands if "openworld" in c.replace("_", "").lower()), None)
    if tpl:
        ok = bool(les.new_level_from_template(asset_path, tpl))
        how = "template %s" % tpl
    else:
        ok = bool(les.new_level(asset_path, is_partitioned_world=True))
        how = "new_level(is_partitioned_world=True): add sky, lights, landscape yourself; check Enable Streaming"
    if ok:
        les.save_current_level()
    return {"ok": ok, "how": how, "map": asset_path}


def world_facts() -> Dict[str, Any]:
    """Dump what wp_facts_check needs. Property names are candidates [verify]."""
    _ue()
    world = _world()
    facts: Dict[str, Any] = {"world": world.get_name() if world else None}
    ws = None
    for getter in ("get_world_settings",):
        fn = getattr(world, getter, None)
        if callable(fn):
            try:
                ws = fn()
            except Exception:
                ws = None
    wp = _try_get(ws, ["world_partition"]) if ws else None
    facts["is_partitioned"] = wp is not None if ws else None
    facts["enable_streaming"] = _try_get(wp, ["enable_streaming", "b_enable_streaming"]) if wp else None
    rh = _try_get(wp, ["runtime_hash"]) if wp else None
    facts["runtime_hash_class"] = type(rh).__name__ if rh is not None else None
    grids = _try_get(rh, ["grids", "runtime_partitions"], []) if rh is not None else []
    facts["grids"] = []
    for g in grids or []:
        facts["grids"].append({"name": str(_try_get(g, ["grid_name", "name"], "?")),
                               "cell_size_cm": _try_get(g, ["cell_size"]),
                               "loading_range_cm": _try_get(g, ["loading_range"])})
    actors = _sub("EditorActorSubsystem").get_all_level_actors()  # loaded actors only in a WP map
    facts["loaded_actor_count"] = len(actors)
    ns = []
    for a in actors:
        sl = _try_get(a, ["is_spatially_loaded", "b_is_spatially_loaded"])
        if sl is False:
            ns.append({"name": a.get_name(), "class": type(a).__name__})
    facts["non_spatial_actors"] = ns
    facts["note"] = "get_all_level_actors sees loaded actors only; load regions first (WPdoc Loading Regions)"
    return facts


def landscape_facts() -> List[Dict[str, Any]]:
    """Per landscape: components, section layout, material, Nanite flag. [verify] names."""
    u = _ue()
    out = []
    for a in _sub("EditorActorSubsystem").get_all_level_actors():
        if not isinstance(a, getattr(u, "LandscapeProxy", ())):
            continue
        comps = a.get_components_by_class(u.LandscapeComponent) if hasattr(u, "LandscapeComponent") else []
        c0 = comps[0] if comps else None
        out.append({
            "name": a.get_name(), "class": type(a).__name__, "components": len(comps),
            "component_size_quads": _try_get(c0, ["component_size_quads"]) if c0 else None,
            "subsection_size_quads": _try_get(c0, ["subsection_size_quads"]) if c0 else None,
            "num_subsections": _try_get(c0, ["num_subsections"]) if c0 else None,
            "material": str(_try_get(a, ["landscape_material"])),
            "nanite": _try_get(a, ["enable_nanite", "b_enable_nanite"]),
            "scale": [a.get_actor_scale3d().x, a.get_actor_scale3d().y, a.get_actor_scale3d().z],
            "location_z_cm": a.get_actor_location().z,   # must equal the plan's actor_z_cm (fit_heightmap_z)
        })
    return out


def set_streaming(actor, spatially_loaded: Optional[bool] = None, runtime_grid: Optional[str] = None,
                  hlod_layer=None) -> Dict[str, Optional[str]]:
    """Actor-level World Partition properties. Names are candidates [verify]."""
    used = {}
    if spatially_loaded is not None:
        used["spatially_loaded"] = _try_set(actor, ["set_is_spatially_loaded", "is_spatially_loaded",
                                                    "b_is_spatially_loaded"], bool(spatially_loaded))
    if runtime_grid is not None:
        used["runtime_grid"] = _try_set(actor, ["runtime_grid", "set_runtime_grid"], runtime_grid)
    if hlod_layer is not None:
        used["hlod_layer"] = _try_set(actor, ["hlod_layer", "set_hlod_layer"], hlod_layer)
    return used


def _asset_tools():
    return _ue().AssetToolsHelpers.get_asset_tools()


def create_hlod_layer(name: str, folder: str, layer_type: str = "Instancing", parent=None) -> Dict[str, Any]:
    """HLOD Layer asset. Enum member names [verify]: INSTANCING, MESH_MERGE, MESH_SIMPLIFY
    (Merged Mesh, Simplified Mesh in the UI)."""
    u = _ue()
    fac = getattr(u, "HLODLayerFactory", None)
    cls = getattr(u, "HLODLayer", None)
    if fac is None or cls is None:
        MISSING["HLODLayerFactory/HLODLayer"] = "create_hlod_layer"
        return {"ok": False, "why": "factory missing: duplicate a template HLOD layer asset or use the GUI"}
    asset = _asset_tools().create_asset(name, folder, cls, fac())
    enum = getattr(u, "HLODLayerType", None) or getattr(u, "WorldPartitionHLODLayerType", None)
    member = {"instancing": "INSTANCING", "mergedmesh": "MESH_MERGE", "simplifiedmesh": "MESH_SIMPLIFY"}.get(
        layer_type.lower().replace(" ", ""), layer_type.upper())
    used = _try_set(asset, ["layer_type"], getattr(enum, member)) if enum and hasattr(enum, member) else None
    if parent is not None:
        _try_set(asset, ["parent_layer"], parent)
    u.EditorAssetLibrary.save_loaded_asset(asset)
    return {"ok": True, "asset": asset.get_path_name(), "layer_type_set": used}


def create_data_layer_asset(name: str, folder: str, runtime: bool = False) -> Dict[str, Any]:
    """Data Layer Asset (Editor or Runtime). Factory and enum names [verify]."""
    u = _ue()
    fac, cls = getattr(u, "DataLayerFactory", None), getattr(u, "DataLayerAsset", None)
    if fac is None or cls is None:
        MISSING["DataLayerFactory/DataLayerAsset"] = "create_data_layer_asset"
        return {"ok": False, "why": "factory missing: Content Browser > Miscellaneous > Data Layer (GUI)"}
    asset = _asset_tools().create_asset(name, folder, cls, fac())
    dlt = getattr(u, "DataLayerType", None)
    if dlt is not None:
        _try_set(asset, ["data_layer_type", "type"], getattr(dlt, "RUNTIME" if runtime else "EDITOR"))
    u.EditorAssetLibrary.save_loaded_asset(asset)
    return {"ok": True, "asset": asset.get_path_name()}


def assign_data_layer(actors, data_layer_asset) -> Dict[str, Any]:
    """Create (or reuse) the instance of a Data Layer Asset in the world and add actors."""
    u = _ue()
    dles = _sub("DataLayerEditorSubsystem")
    inst = None
    for getter in ("get_data_layer_instance", "get_data_layer_instance_from_asset"):
        fn = getattr(dles, getter, None)
        if callable(fn):
            try:
                inst = fn(data_layer_asset)
                if inst:
                    break
            except Exception:
                pass
    if inst is None:
        params_cls = getattr(u, "DataLayerCreationParameters", None)
        if params_cls is None:
            MISSING["DataLayerCreationParameters"] = "assign_data_layer"
            return {"ok": False, "why": "no creation params class [verify]"}
        p = params_cls()
        _try_set(p, ["data_layer_asset"], data_layer_asset)
        inst = dles.create_data_layer_instance(p)
    ok = dles.add_actors_to_data_layer(list(actors), inst)
    return {"ok": bool(ok), "instance": str(inst)}


def batch_nanite(paths: Sequence[str], enable: bool = True, dry_run: bool = True,
                 voxelize_foliage: bool = False, foliage_hint: str = "foliage") -> Dict[str, Any]:
    """Nanite on for static meshes under paths, skipping translucent materials (NANdoc).
    dry_run lists the plan. voxelize_foliage sets Shape Preservation to Voxelize on meshes
    whose path contains foliage_hint (Nanite Foliage, Experimental; enum [verify])."""
    u = _ue()
    lib = u.EditorAssetLibrary
    changed, skipped, errors = [], [], []
    for root in paths:
        for p in lib.list_assets(root, recursive=True):
            try:
                asset = lib.load_asset(p)
            except Exception as e:
                errors.append((p, str(e)))
                continue
            if not isinstance(asset, u.StaticMesh):
                continue
            modes = []
            for sm in asset.get_editor_property("static_materials") or []:
                mi = sm.get_editor_property("material_interface")
                if mi is None:
                    continue
                try:
                    base = mi.get_base_material()
                    modes.append(str(base.get_editor_property("blend_mode")).split(".")[-1].lower())
                except Exception:
                    modes.append("unknown")
            if any(("translucent" in m) or ("additive" in m) or ("modulate" in m) for m in modes):
                skipped.append((p, "translucent: Nanite supports Opaque and Masked only (NANdoc)"))
                continue
            ns = asset.get_editor_property("nanite_settings")
            if bool(ns.get_editor_property("enabled")) == enable and not voxelize_foliage:
                continue
            plan = {"asset": p, "enabled": enable}
            if voxelize_foliage and foliage_hint in p.lower():
                enum = getattr(u, "NaniteShapePreservation", None)
                plan["shape_preservation"] = "VOXELIZE" if enum and hasattr(enum, "VOXELIZE") else "missing [verify]"
            if not dry_run:
                ns.set_editor_property("enabled", enable)
                if plan.get("shape_preservation") == "VOXELIZE":
                    ns.set_editor_property("shape_preservation", u.NaniteShapePreservation.VOXELIZE)
                asset.set_editor_property("nanite_settings", ns)
                lib.save_loaded_asset(asset)
            changed.append(plan)
    return {"dry_run": dry_run, "changed": changed, "skipped": skipped, "errors": errors}


def spawn_pcg_volume(graph, location_cm, size_cm, partitioned: bool = True, trigger: str = "OnDemand",
                     seed: Optional[int] = None, generate: bool = True, label: Optional[str] = None,
                     hlod_layer=None, data_layer=None) -> Dict[str, Any]:
    """PCG Volume with a graph or Graph Instance. The volume is a unit box scaled to size
    (the forest tutorial scales it 8 x 8 x 8, PCGdoc); unit size 100 cm is [verify].
    trigger: OnLoad (means cook, Tb [00:25:17]) | OnDemand | AtRuntime.
    hlod_layer / data_layer (loaded assets) are set BEFORE generation: spawned output inherits
    the PCG actor's HLOD Layer and Data Layer (PCGdoc World Partition Support)."""
    u = _ue()
    eas = _sub("EditorActorSubsystem")
    vol = eas.spawn_actor_from_class(u.PCGVolume, u.Vector(*location_cm))
    if label:
        vol.set_actor_label(label)
    layers = {}
    if hlod_layer is not None:
        layers["hlod_layer"] = set_streaming(vol, hlod_layer=hlod_layer).get("hlod_layer")
    if data_layer is not None:
        try:
            layers["data_layer"] = assign_data_layer([vol], data_layer).get("ok")
        except RuntimeError as e:
            MISSING["DataLayerEditorSubsystem"] = "spawn_pcg_volume"
            layers["data_layer"] = "failed: %s" % e
    vol.set_actor_scale3d(u.Vector(size_cm[0] / 100.0, size_cm[1] / 100.0, size_cm[2] / 100.0))
    comp = vol.get_component_by_class(u.PCGComponent)
    used = {"set_graph": _try_set(comp, ["set_graph", "graph_instance"], graph)}
    used["partitioned"] = _try_set(comp, ["set_is_partitioned", "is_partitioned", "b_is_partitioned"], bool(partitioned))
    enum = getattr(u, "PCGComponentGenerationTrigger", None)
    member = {"onload": "GENERATE_ON_LOAD", "ondemand": "GENERATE_ON_DEMAND", "atruntime": "GENERATE_AT_RUNTIME"}[trigger.lower()]
    if enum is not None and hasattr(enum, member):
        used["trigger"] = _try_set(comp, ["generation_trigger"], getattr(enum, member))
    else:
        MISSING["PCGComponentGenerationTrigger.%s" % member] = "spawn_pcg_volume"
    if seed is not None:
        used["seed"] = _try_set(comp, ["seed"], int(seed))
    if generate and trigger.lower() != "atruntime":
        for fn in ("generate", "generate_local"):
            if callable(getattr(comp, fn, None)):
                getattr(comp, fn)(True)
                used["generate"] = fn
                break
        else:
            MISSING["PCGComponent.generate"] = "spawn_pcg_volume"
    used.update(layers)
    return {"actor": vol.get_name(), "used": used, "missing": dict(MISSING)}


def set_graph_params(target, params: Dict[str, Any]) -> Dict[str, Any]:
    """Override graph parameters on a Graph Instance or a component's instance through
    PCGGraphParametersHelpers set_<type>_parameter [verify]. Types by Python value:
    bool, int, float, str (as name or string), unreal objects (as object parameter)."""
    u = _ue()
    helpers = getattr(u, "PCGGraphParametersHelpers", None)
    if helpers is None:
        MISSING["PCGGraphParametersHelpers"] = "set_graph_params"
        return {"ok": False, "why": "helpers missing: set overrides in the GUI (component Details > Graph parameters)"}
    iface = _try_get(target, ["get_graph_instance"], target)
    done, failed = [], []
    for k, v in params.items():
        if isinstance(v, bool):
            fns = ["set_bool_parameter"]
        elif isinstance(v, int):
            fns = ["set_int32_parameter", "set_int64_parameter", "set_int_parameter"]
        elif isinstance(v, float):
            fns = ["set_double_parameter", "set_float_parameter"]
        elif isinstance(v, str):
            fns = ["set_name_parameter", "set_string_parameter"]
        else:
            fns = ["set_soft_object_parameter", "set_object_parameter"]
        for fn in fns:
            f = getattr(helpers, fn, None)
            if callable(f):
                try:
                    f(iface, k, v)
                    done.append((k, fn))
                    break
                except Exception:
                    continue
        else:
            failed.append(k)
    return {"ok": not failed, "set": done, "failed": failed}


def tag_actors(actors, tags: Sequence[str], vocabulary: Sequence[str]) -> Dict[str, Any]:
    """Assembly tags from a fixed vocabulary (Tb [00:29:42]); refuses unknown tags."""
    chk = parse_assembly_tags(tags, vocabulary)
    if not chk["ok"]:
        return {"ok": False, "unknown": chk["unknown"], "bad": chk["bad"]}
    u = _ue()
    for a in actors:
        cur = [str(t) for t in a.tags]
        new = cur + [t for t in tags if t not in cur]
        a.set_editor_property("tags", [u.Name(t) for t in new])
    return {"ok": True, "count": len(list(actors))}


def region_batch(process, tile_m: float = 256.0, bounds_m=None, save: bool = True,
                 overlap_m: float = 0.0, dry_run: bool = False) -> Dict[str, Any]:
    """Region-by-region edit of a World Partition map (Aal [00:20:55]): per tile, load the
    actors whose descriptors intersect it, call process(actors, tile) -> list of changed
    actor names, save dirty packages, unload, next. Never select-all in the Outliner for
    world-scale edits (Aal [00:20:23]). WorldPartitionBlueprintLibrary names [verify];
    for whole-map jobs that need C++ use a UWorldPartitionBuilder subclass (WPdoc)."""
    u = _ue()
    lib = getattr(u, "WorldPartitionBlueprintLibrary", None)
    if lib is None:
        MISSING["WorldPartitionBlueprintLibrary"] = "region_batch"
        return {"ok": False, "why": "no WorldPartitionBlueprintLibrary: use a builder commandlet"}
    if bounds_m is None:
        box = lib.get_editor_world_bounds()
        bounds_m = ((box.min.x / 100.0, box.min.y / 100.0), (box.max.x / 100.0, box.max.y / 100.0))
    tiles = region_tiles(bounds_m[0], bounds_m[1], tile_m, overlap_m)
    log = []
    for t in tiles:
        mn, mx = t["min_m"], t["max_m"]
        box = u.Box(u.Vector(mn[0] * 100, mn[1] * 100, -1e7), u.Vector(mx[0] * 100, mx[1] * 100, 1e7))
        res = lib.get_intersecting_actor_descs(box)
        descs = res[1] if isinstance(res, tuple) else res
        guids = [d.guid for d in descs]
        if dry_run:
            log.append({"tile": t["index"], "actors": len(guids)})
            continue
        lib.load_actors(guids)
        loaded = [a for a in _sub("EditorActorSubsystem").get_all_level_actors()]
        changed = process(loaded, t) or []
        if save and changed:
            _sub("LevelEditorSubsystem").save_all_dirty_levels()
        lib.unload_actors(guids)
        try:
            u.collect_garbage()
        except Exception:
            pass
        log.append({"tile": t["index"], "actors": len(guids), "changed": list(changed)})
    return {"ok": True, "tiles": len(tiles), "log": log}


def set_viewpoint(location_cm, rotation) -> bool:
    """Move the level viewport camera (UnrealEditorSubsystem.set_level_viewport_camera_info
    [verify])."""
    u = _ue()
    ues = _sub("UnrealEditorSubsystem")
    fn = getattr(ues, "set_level_viewport_camera_info", None)
    if not callable(fn):
        MISSING["UnrealEditorSubsystem.set_level_viewport_camera_info"] = "set_viewpoint"
        return False
    fn(u.Vector(*location_cm), u.Rotator(*rotation))
    return True


def tour(viewpoints: Sequence[Dict[str, Any]], out_dir: str, width: int = 1920, height: int = 1080,
         console_per_view: Sequence[str] = ()):
    """Generator job for ue_run latent mode: one screenshot per viewpoint (daily tour, Aal
    [00:23:36]). Uses ue_review.screenshot when importable, else
    AutomationLibrary.take_high_res_screenshot [verify]. yield gives the editor ticks."""
    os.makedirs(out_dir, exist_ok=True)
    try:
        import ue_review  # lead toolkit
        shot = lambda p: ue_review.screenshot(p, width, height)  # noqa: E731
    except Exception:
        u = _ue()
        shot = lambda p: u.AutomationLibrary.take_high_res_screenshot(width, height, p)  # noqa: E731
    results = []
    for vp in viewpoints:
        loc = [c * 100.0 for c in vp["location_m"]]
        set_viewpoint(loc, vp.get("rotation", [0, 0, 0]))
        for c in console_per_view:
            console(c)
        yield 1.0                                # let streaming and TSR settle [added]
        path = os.path.join(out_dir, "%s.png" % vp["name"])
        shot(path)
        yield 1.0
        results.append({"name": vp["name"], "path": path})
    return results


def assign_landscape_material(landscape, material_path: str) -> bool:
    """Assign a Material Instance of the landscape master (received from scenario-unreal-materials)."""
    u = _ue()
    mi = u.EditorAssetLibrary.load_asset(material_path)
    return _try_set(landscape, ["landscape_material"], mi) is not None


def _prop(obj, names: Sequence[str]):
    """First readable editor property among names (UE Python drops the b prefix of bools, so
    bGetLayerWeights reads as get_layer_weights: property first, attribute second)."""
    for n in names:
        try:
            return obj.get_editor_property(n)
        except Exception:
            v = getattr(obj, n, None)
            if v is not None and not callable(v):
                return v
    return None


def dump_pcg_graph(graph) -> Dict[str, Any]:
    """Dump a PCG graph's nodes for pcg_graph_lint and find_gpu_transfers:
    {id: {"title", "gpu", "settings": {...}}}. Node and settings accessors are candidates
    [verify]; misses land in MISSING and the dump says what it could not read. The fallback
    is a graph editor screenshot read by eye."""
    nodes_out: Dict[str, Dict[str, Any]] = {}
    nodes = _try_get(graph, ["get_nodes", "nodes"], None)
    if nodes is None:
        MISSING["PCGGraph.get_nodes"] = "dump_pcg_graph"
        return {"ok": False, "nodes": {}, "why": "no node accessor: lint from a graph screenshot"}
    keys = {"target_attribute": ["target_attribute"], "warn_on_missing": ["warn_if_attribute_is_missing",
            "b_warn_on_data_missing_attribute", "warn_on_data_missing_attribute"],
            "layer_weights": ["get_layer_weights", "b_get_layer_weights"], "height_only": ["get_height_only",
            "b_get_height_only"], "collision": ["collision_enabled"], "gpu": ["execute_on_gpu", "b_execute_on_gpu"]}
    for i, n in enumerate(nodes):
        st = _try_get(n, ["get_settings", "settings"], None)
        title = _try_get(n, ["get_node_title", "node_title"], None) or (type(st).__name__ if st is not None else "?")
        rec = {"title": str(title).replace("PCG", "").replace("Settings", "").strip(), "settings": {}}
        if st is not None:
            for k, names in keys.items():
                v = _prop(st, names)
                if v is not None:
                    rec["settings"][k] = v if isinstance(v, (bool, int, float)) else str(v)
        rec["gpu"] = bool(rec["settings"].pop("gpu", False))
        nodes_out["n%d" % i] = rec
    return {"ok": True, "nodes": nodes_out, "missing": dict(MISSING)}


def world_census(tags_vocabulary: Sequence[str] = ()) -> List[Dict[str, Any]]:
    """Facts per loaded actor for world_rules_check (load a region first in WP maps).
    Tick and collision getters are candidates [verify]; construction-script spawning cannot
    be read from Python, so it stays None unless a component count grows after a rerun
    [added]."""
    out = []
    for a in _sub("EditorActorSubsystem").get_all_level_actors():
        cls = type(a).__name__
        gen = str(_try_get(a, ["get_class"], "") or "")
        tags = [str(t) for t in getattr(a, "tags", [])]
        out.append({"name": a.get_name(), "class": cls, "is_blueprint": cls.endswith("_C") or "_C'" in gen,
                    "tags": tags, "role": "clutter" if any(t.lower().startswith("clutter") for t in tags) else "",
                    "collision": _try_get(a, ["get_actor_enable_collision"], None),
                    "ticks": _try_get(a, ["is_actor_tick_enabled"], None), "construction_spawns": None})
    return out


_WORLD_VALIDATORS: List[Any] = []


def register_world_validator(vocabulary: Sequence[str], tick_limit: int = TICK_AGGREGATE_ABOVE) -> List[str]:
    """IN-EDITOR, NOT YET RUN IN UNREAL. Register a Python EditorValidatorBase subclass that
    runs the per-actor world rules (tag vocabulary, clutter collision) on actors being saved
    or validated. Same pattern as scenario-unreal-pipeline-automation (ue_pipeline.register_validators,
    k2_* overrides in 5.8; Python validators self-register every session). Whether OFPA actor
    packages reach asset validators on save is [verify]; the census path (world_census +
    world_rules_check) covers the class-level rules in any case. Idempotent."""
    u = _ue()
    if _WORLD_VALIDATORS:
        return [type(v).__name__ for v in _WORLD_VALIDATORS]
    vocab = list(vocabulary)

    @u.uclass()
    class WorldRulesValidator(u.EditorValidatorBase):
        @u.ufunction(override=True)
        def k2_can_validate_asset(self, asset):
            return isinstance(asset, u.Actor)

        @u.ufunction(override=True)
        def k2_validate_loaded_asset(self, asset):
            tags = [str(t) for t in getattr(asset, "tags", [])]
            facts = {"name": asset.get_name(), "class": type(asset).__name__, "tags": tags,
                     "collision": _try_get(asset, ["get_actor_enable_collision"], None)}
            issues = world_rules_check([facts], vocab, tick_limit)
            for i in issues:
                msg = u.Text("[%s] %s" % (i["rule"], i["detail"]))
                if i["severity"] == "error":
                    self.asset_fails(asset, msg)
                else:
                    self.asset_warning(asset, msg)
            if not any(i["severity"] == "error" for i in issues):
                self.asset_passes(asset)
            return self.get_validation_result()

    vs = u.get_editor_subsystem(u.EditorValidatorSubsystem)
    v = WorldRulesValidator()
    vs.add_validator(v)
    _WORLD_VALIDATORS.append(v)
    return [type(v).__name__]


# =============================================================================================
# 10. Example world spec (scenario U1) and CLI
# =============================================================================================

U1_EXAMPLE_SPEC: Dict[str, Any] = {
    "name": "Valley",
    "platform": "pc_console",
    "nanite_platform": True,
    "target_fps": 60,
    "world_size_m": 2000,
    "terrain": {
        "type": "landscape", "needs_overhangs": False,
        "vertices": 2017, "quads_per_section": 63, "sections_per_component": 2, "components_per_axis": 16,
        # Z scale and actor Z from the real blockout range (valley_heightmap as in procedures P3:
        # -5.4 m to 314.3 m), not from the declared 250 m relief that clipped 123,356 pixels at Z 100.
        "xy_scale_cm": 100, "z_scale": 63.6815, "actor_z_cm": 15442.7,
        "height_min_m": -5.4, "height_max_m": 314.3,
        "edit_layers": ["Base", "Sculpt Details", "Paint", "Splines", "Patches"],
        "nanite": True,
        "material_layers": [{"name": "Soil", "blend": "Alpha", "large_area": True, "anti_tiling": "distance_blend"},
                            {"name": "Grass", "blend": "Height", "large_area": True, "anti_tiling": "distance_blend"},
                            {"name": "ForestGround", "blend": "Height", "large_area": True, "anti_tiling": "distance_blend"},
                            {"name": "Rock", "blend": "Height", "steep": True, "projection": "triplanar"},
                            {"name": "Riverbed", "blend": "Height"}, {"name": "Path", "blend": "Height"}],
        "layer_infos": ["Soil", "Grass", "ForestGround", "Rock", "Riverbed", "Path"],
        "blend_mode": "Opaque", "opacity_mask_wired": True, "uses_holes": False,
        "specular": 0.02,          # Sensei's value; the materials owner decides under final lighting
        "tessellation": {"enable_tessellation": True, "dicing_rate": 2,
                         "height_texture_compression": "TC_HDR_Compressed",
                         # per-layer magnitudes are example values [added]; centers from 6ig [00:22:58]
                         "layers": [{"name": "Grass", "surface": "ground", "center": 0.5, "magnitude_cm": 3},
                                    {"name": "Path", "surface": "ground", "center": 0.5, "magnitude_cm": 2},
                                    {"name": "Rock", "surface": "vertical_rock", "center": 1.0, "magnitude_cm": 25}]},
    },
    "world_partition": {
        "grids": [{"name": "MainGrid", "cell_size_cm": 25600, "loading_range_cm": 76800}],
        "enable_streaming": True, "is_partitioned": True, "ofpa": True, "level_blueprint_actor_refs": 0,
        "max_speed_mps": None, "teleports": True, "streaming_source_at_teleports": True,
    },
    "project": {"virtual_texture_support": True, "minimap": False, "rvt_blend": True},
    "data_layers": [
        {"name": "DL_Forest", "type": "Editor"}, {"name": "DL_Rocks", "type": "Editor"},
        {"name": "DL_Village", "type": "Editor"}, {"name": "DL_River", "type": "Editor"},
        {"name": "DL_Gameplay", "type": "Editor"},
    ],
    "hlod_layers": [
        {"name": "HLOD_Foliage", "layer_type": "Instancing", "families": ["trees", "rocks"]},
        {"name": "HLOD_Village", "layer_type": "MergedMesh", "families": ["buildings"], "parent": "HLOD_Far"},
        {"name": "HLOD_Far", "layer_type": "SimplifiedMesh", "families": []},
    ],
    "pcg": {
        "frame_time_ms": 5.0,
        "partition_grid_m": 256,
        "world_actor": {"treat_editor_viewport_as_generation_source": True, "landscape_cache": True},
        "components": [
            {"name": "PCG_Forest", "bounds_m": (2000, 2000), "is_partitioned": True, "trigger": "OnDemand",
             "uses_graph_instance": True, "collision_on_clutter": False,
             "hlod_layer": "HLOD_Foliage", "data_layer": "DL_Forest"},      # outputs inherit both (PCGdoc)
            {"name": "PCG_Rocks", "bounds_m": (2000, 2000), "is_partitioned": True, "trigger": "OnDemand",
             "uses_graph_instance": True, "hlod_layer": "HLOD_Foliage", "data_layer": "DL_Rocks"},
            {"name": "PCG_Grass", "bounds_m": (2000, 2000), "is_partitioned": True, "trigger": "AtRuntime",
             "uses_graph_instance": True, "gpu_only_roles": ["grass", "pebbles"], "reads_landscape_cpu": False,
             "generation_source_at_teleports": True},
        ],
        "hier_grids_m": ["unbounded", 128, 32],
        "landscape_read_grid_m": 128,
        "grass": {"dense_radius_m": 128, "sparse_radius_m": 256, "dense_grid_m": 32, "sparse_grid_m": 128},
        "grass_setup": {"mask_source": "grass_maps", "grass_types_have_meshes": False,
                        "asset_arrays": {"grass": ["SM_Grass_A", "SM_Placeholder"], "rocks": ["SM_Placeholder"]},
                        "placeholder_entries": True, "params_upload_grid": "unbounded",
                        "landscape_read": "height_only", "nanite_instances": True, "ring_handover": "generation_radius"},
    },
    "assets": [
        {"name": "hero_oak", "role": "hero", "tier": "hand"},
        {"name": "pine_a", "role": "tree", "collision": True, "far_visible": True, "tier": "baked", "nanite": True,
         "is_foliage": True, "masked": False},
        {"name": "boulder_mid", "role": "rock", "collision": True, "tier": "baked", "nanite": True},
        {"name": "grass_meadow", "role": "grass", "collision": False, "tier": "runtime_gpu"},
        {"name": "house_kit", "role": "village", "tier": "hand", "nanite": True},
        {"name": "window_glass", "role": "village", "tier": "hand", "nanite": False, "blend_modes": ["Translucent"]},
    ],
    "instances_total_estimate": 2_500_000,
}


def _cli(argv: Sequence[str]) -> int:
    import argparse
    ap = argparse.ArgumentParser(prog="ue_world.py", description="offline world-building helpers")
    sub = ap.add_subparsers(dest="cmd")
    p1 = sub.add_parser("plan-landscape")
    p1.add_argument("--size-m", type=float, required=True)
    p1.add_argument("--quad-m", type=float, default=1.0)
    p1.add_argument("--relief-m", type=float)
    p2 = sub.add_parser("check-spec")
    p2.add_argument("spec", help="JSON file, or 'u1' for the built-in example")
    p3 = sub.add_parser("tiles")
    p3.add_argument("--size-m", type=float, required=True)
    p3.add_argument("--tile-m", type=float, default=256.0)
    p4 = sub.add_parser("heightmap")
    p4.add_argument("out")
    p4.add_argument("--size-m", type=float, default=2016.0)
    p4.add_argument("--vertices", type=int, default=2017)
    p4.add_argument("--relief-m", type=float, default=250.0)
    p4.add_argument("--z-scale", default="fit", help="'fit' (derive from the heights) or a number")
    p5 = sub.add_parser("builds")
    p5.add_argument("map")
    p5.add_argument("--graphs", default="")
    a = ap.parse_args(list(argv))
    if a.cmd == "plan-landscape":
        print(json.dumps(plan_landscape(a.size_m, a.quad_m, a.relief_m), indent=1, default=str))
    elif a.cmd == "check-spec":
        spec = U1_EXAMPLE_SPEC if a.spec == "u1" else json.loads(Path(a.spec).read_text(encoding="utf-8"))
        res = check_world_spec(spec)
        print(json.dumps(res, indent=1, default=str))
        return 0 if res["ok"] else 1
    elif a.cmd == "tiles":
        print(json.dumps(region_tiles((0, 0), (a.size_m, a.size_m), a.tile_m), indent=1))
    elif a.cmd == "heightmap":
        v = valley_heightmap(a.vertices, a.size_m, a.relief_m)
        z = a.z_scale if a.z_scale == "fit" else float(a.z_scale)
        res = export_heightmap(a.out, v["heights"], z)
        res["gate"] = heightmap_clip_gate(res)
        print(json.dumps(res, indent=1, default=str))
        return 1 if res["gate"] else 0
    elif a.cmd == "builds":
        graphs = [g for g in a.graphs.split(";") if g]
        print(json.dumps(build_pipeline(a.map, graphs), indent=1))
    else:
        ap.print_help()
    return 0


if __name__ == "__main__":
    import sys
    raise SystemExit(_cli(sys.argv[1:]))
