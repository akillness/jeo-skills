"""
ut_vfx: runner-side helpers of the scenario-unity-vfx skill (real-time VFX artist persona).

Imports the shared toolkit of scenario-unity-expert (ut_env, ut_run, ut_review, ut_stat); never copies it.
System python3 (3.9+), stdlib only (numpy used when present by ut_review).

    import sys; sys.path.insert(0, "<skills>/scenario-unity-vfx/scripts")
    import ut_vfx
    P = ut_vfx.project("<repo>/tests/projects/unity-vfx")     # APFS clone of Base3D_URP + VFX Graph 17.3.0 + AgentKits
    r = ut_vfx.run(P, "AgentKit.Vfx.VfxFireballKit.Build", {"mobile": True})
    s = ut_vfx.run(P, "AgentKit.Vfx.VfxSequence.CaptureFireball", {}, graphics=True)
    v = ut_vfx.sequence_verdict(s["result"], ut_vfx.BUDGETS["mobile"])
    ut_vfx.effect_mask_stats(png, background_png)   # screen extent and brightness of the effect alone
    ut_vfx.vfx_yaml_facts("<project>/Assets/VFX/X.vfx")  # capacity, boundsMode, sort per system (text read)
    ut_vfx.write_pcache(path, points, colors=None)       # ASCII .pCache (open spec, float/uchar only)
  v0.2 (craft checks, all pure Python on the jobs' output):
    ut_vfx.effect_verdict(capture_effect_result, BUDGETS["mobile"])   # VfxSequence.CaptureEffect: fill, particles,
                                                                       # radius, tail after the gameplay stop, texels
    ut_vfx.effect_energy(png, bg)            # light the effect adds to the frame (brightness x extent)
    ut_vfx.importance_ladder(rows)           # Keyser: brighter only as importance rises; frequent effects subdued
    ut_vfx.crowd_readability(png, bg, n)     # N copies still read as N shapes, not a white blob
    ut_vfx.texel_verdict(texel_rows, tier)   # Truempler: import size follows the closest screen coverage
    ut_vfx.motion_gaps(pngs, bg)             # Nordeus: something always moving
    ut_vfx.graph_hygiene(vfx_yaml_facts, alive)   # VFX Graph PC tier: bounds, capacity, sorting, exposed surface

Run in Unity 6000.3.21f1 on 2026-09-24 through tests/code/unity-vfx/ (see references/procedures.md).
"""

__version__ = "0.1"

import json
import math
import os
import re
import shutil
import sys
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
SKILLS = os.path.dirname(SKILL)
EXPERT_SCRIPTS = os.path.join(SKILLS, "scenario-unity-expert", "scripts")
if EXPERT_SCRIPTS not in sys.path:
    sys.path.insert(0, EXPERT_SCRIPTS)

import ut_env  # noqa: E402
import ut_run  # noqa: E402
import ut_review  # noqa: E402
import ut_stat  # noqa: E402

AGENTKIT_VFX = os.path.join(HERE, "AgentKit")          # editor jobs -> Assets/Editor/AgentKit/Vfx/
SHADERS_VFX = os.path.join(HERE, "Shaders")            # -> Assets/AgentKitVfx/Shaders/
RUNTIME_VFX = os.path.join(HERE, "Runtime")            # runtime components + asmdef -> Assets/AgentKitVfx/Runtime/
GRAPH_VFX = os.path.join(HERE, "EditorGraph")          # friend-assembly graph authoring -> Assets/AgentKitVfx/EditorGraph/

VFX_PACKAGE = ("com.unity.visualeffectgraph", "17.3.0")   # core package pinned to the 6000.3.21f1 editor

# Budgets. Numbers marked [src] come from the sources (references/expert-notes.md); the others are
# this skill's defaults [added]: change them per project, and re-measure on the target device.
BUDGETS = {
    "mobile": {
        "max_particles_per_emitter": 100,     # [src] Nordeus hard limit (YZWK [00:35:33])
        # draw calls per SPELL by its gameplay level (Nordeus), not per device tier: "high_tier" = a high-level
        # spell, "low_tier" = a low-level spell (key names kept for compatibility)
        "draw_calls_high_tier": 10,           # [src] Nordeus: 8 to 10 high-level spell (YZWK [00:25:08])
        "draw_calls_low_tier": 6,             # [src] 5 to 6 low-level spell
        "draw_calls_multi_target": 3,         # [src] 2 to 3 per instance of a multi-target spell
        "texture_max": 512,                   # [src] 256 typical, 512 max, 1K rarely (YZWK [00:46:03])
        "peak_fse_single": 1.5,               # [added] full-screen equivalents of fill for one effect at gameplay distance
        "p95_layers": 8,                      # [added] 95% of covered pixels under 8 transparent layers
        "peak_alive_single": 100,             # [added] live particles for one fireball beat
        "radius_ratio": (0.85, 1.2),          # [added] visual radius / gameplay radius (Keyser: visual = damage boundary)
        "frame_ms": ut_stat.fps_to_ms(30, mobile=True),   # 30 fps at 65% (scenario-unity-expert)
        "max_tail_s": 0.5,                    # [added] last particle gone within 0.5 s of the gameplay stop (Keyser: no lingering)
        "texel_ratio": (0.5, 4.0),            # [added] texels across a particle / its largest screen size in pixels
    },
    "pc": {
        "max_particles_per_emitter": 1000,    # [added] Shuriken default maxParticles
        "draw_calls_high_tier": 20,           # [added]
        "draw_calls_low_tier": 10,            # [added]
        "draw_calls_multi_target": 6,         # [added]
        "texture_max": 2048,                  # [added] (author at 2048: Truempler KaN [00:18:38])
        "peak_fse_single": 4.0,               # [added]
        "p95_layers": 16,                     # [added]
        "peak_alive_single": 400,             # [added]
        "radius_ratio": (0.85, 1.2),          # [added]
        "frame_ms": ut_stat.fps_to_ms(60),
        "max_tail_s": 0.5,                    # [added]
        "texel_ratio": (0.5, 8.0),            # [added] PC can afford more texels than it shows
    },
}


# ============================================================================ project setup
def _copy_tree(src, dst, exts):
    written = []
    for dirpath, _dirs, files in os.walk(src):
        rel = os.path.relpath(dirpath, src)
        for fn in files:
            if not fn.endswith(exts):
                continue
            s = os.path.join(dirpath, fn)
            d = os.path.normpath(os.path.join(dst, rel, fn))
            if os.path.isfile(d) and Path(s).read_bytes() == Path(d).read_bytes():
                continue
            os.makedirs(os.path.dirname(d), exist_ok=True)
            shutil.copyfile(s, d)
            written.append(d)
    return written


def has_vfx_graph(project):
    root = ut_env.find_project(project)["root"]
    with open(os.path.join(root, "Packages", "manifest.json")) as f:
        return VFX_PACKAGE[0] in json.load(f).get("dependencies", {})


def add_vfx_graph(project):
    """Add com.unity.visualeffectgraph 17.3.0 to Packages/manifest.json (core package, bundled with the
    editor: no download; the next editor start imports it, about 50 s here). Returns True if changed."""
    root = ut_env.find_project(project)["root"]
    p = os.path.join(root, "Packages", "manifest.json")
    with open(p) as f:
        m = json.load(f)
    deps = m.setdefault("dependencies", {})
    if deps.get(VFX_PACKAGE[0]) == VFX_PACKAGE[1]:
        return False
    deps[VFX_PACKAGE[0]] = VFX_PACKAGE[1]
    m["dependencies"] = dict(sorted(deps.items()))
    with open(p, "w") as f:
        json.dump(m, f, indent=2)
    return True


def install(project, graph=None):
    """Copy the core AgentKit, this skill's editor jobs (Assets/Editor/AgentKit/Vfx), the overdraw shader
    (Assets/AgentKitVfx/Shaders) and the runtime components (Assets/AgentKitVfx/Runtime). graph=True
    (default: when VFX Graph is in the manifest) also copies the friend-assembly graph authoring code
    (Assets/AgentKitVfx/EditorGraph), which only compiles with VFX Graph 17.3 present. Returns files written."""
    root = ut_env.find_project(project)["root"]
    written = list(ut_env.install_agentkit(root))
    written += ut_env.install_agentkit(root, src=AGENTKIT_VFX)
    base = os.path.join(root, "Assets", "AgentKitVfx")
    written += _copy_tree(SHADERS_VFX, os.path.join(base, "Shaders"), (".shader", ".hlsl"))
    written += _copy_tree(RUNTIME_VFX, os.path.join(base, "Runtime"), (".cs", ".asmdef"))
    if graph is None:
        graph = has_vfx_graph(root)
    if graph and os.path.isdir(GRAPH_VFX):
        written += _copy_tree(GRAPH_VFX, os.path.join(base, "EditorGraph"), (".cs", ".asmdef"))
    return [os.path.relpath(w, root) if os.path.isabs(w) else w for w in written]


def project(dest, vfx_graph=True):
    """ut_env.base_project("3d", dest) (APFS clone of tests/projects/Base3D_URP) + VFX Graph + install()."""
    root = ut_env.base_project("3d", dest)
    if vfx_graph:
        add_vfx_graph(root)
    install(root, graph=vfx_graph)
    return root


def run(project, method, args=None, graphics=False, quit=True, timeout=1800):
    """ut_run.run_method with the skill's defaults; raises nothing, returns the envelope."""
    return ut_run.run_method(project, method, args or {}, graphics=graphics, quit=quit, timeout=timeout)


# ============================================================================ verdicts (pure python)
def sequence_verdict(result, budget):
    """Judge a VfxSequence.CaptureFireball result against a budget dict (BUDGETS['mobile'] ...).
    Returns {"verdict": pass|warn|fail, "lines": [...], "numbers": {...}}."""
    lines, worst = [], "pass"

    def mark(level, msg):
        nonlocal worst
        order = {"pass": 0, "warn": 1, "fail": 2}
        if order[level] > order[worst]:
            worst = level
        lines.append("%s: %s" % (level.upper(), msg))

    frames = result.get("frames", [])
    peak_fse = max((f["overdraw"]["fse"] for f in frames), default=0.0)
    p95 = max((f["overdraw"]["p95_layers"] for f in frames), default=0)
    max_layers = max((f["overdraw"]["max_layers"] for f in frames), default=0)
    peak_alive = max((f["counts"]["total_alive"] for f in frames), default=0)
    saturated = sorted({s for f in frames for s in f["counts"].get("saturated", [])})
    ratio = result.get("radius_ratio")
    end_alive = result.get("end_counts", {}).get("total_alive")
    (mark("pass", "peak fill %.3f FSE <= %.2f" % (peak_fse, budget["peak_fse_single"])) if peak_fse <= budget["peak_fse_single"]
     else mark("fail", "peak fill %.3f FSE > %.2f" % (peak_fse, budget["peak_fse_single"])))
    (mark("pass", "p95 layers %s <= %s (max %s)" % (p95, budget["p95_layers"], max_layers)) if p95 <= budget["p95_layers"]
     else mark("warn", "p95 layers %s > %s (max %s)" % (p95, budget["p95_layers"], max_layers)))
    (mark("pass", "peak live particles %d <= %d" % (peak_alive, budget["peak_alive_single"])) if peak_alive <= budget["peak_alive_single"]
     else mark("fail", "peak live particles %d > %d" % (peak_alive, budget["peak_alive_single"])))
    if saturated:
        mark("warn", "systems at maxParticles (capped, may pop): %s" % ", ".join(saturated))
    if ratio is not None:
        lo, hi = budget["radius_ratio"]
        (mark("pass", "visual radius / gameplay radius %.2f in [%.2f, %.2f]" % (ratio, lo, hi)) if lo <= ratio <= hi
         else mark("fail", "visual radius / gameplay radius %.2f outside [%.2f, %.2f] (Keyser: visual = damage boundary)" % (ratio, lo, hi)))
    if end_alive is not None:
        (mark("pass", "effect over at t=%ss (0 particles)" % result.get("end_t")) if end_alive == 0
         else mark("warn", "%d particles still alive at t=%ss: lingering reads as still active (Keyser)" % (end_alive, result.get("end_t"))))
    return {"verdict": worst, "lines": lines,
            "numbers": {"peak_fse": peak_fse, "p95_layers": p95, "max_layers": max_layers, "peak_alive": peak_alive,
                        "radius_ratio": ratio, "end_alive": end_alive}}


def effect_mask_stats(png, background_png, threshold=12):
    """Screen extent and brightness of the effect alone: pixels whose max channel differs from the
    background capture by more than threshold (0..255). Returns coverage share, bounding box (x0, y0,
    x1, y1 in pixels, y down), mean luma of the effect pixels (0..255) and of the whole frame."""
    w, h, a, _al, _m = ut_review.load_image(png)
    w2, h2, b, _al2, _m2 = ut_review.load_image(background_png)
    if (w, h) != (w2, h2):
        raise ValueError("size mismatch %s vs %s" % ((w, h), (w2, h2)))
    n = w * h
    cov, luma_sum, luma_all = 0, 0.0, 0.0
    x0, y0, x1, y1 = w, h, -1, -1
    for i in range(n):
        r, g, bb = a[3 * i], a[3 * i + 1], a[3 * i + 2]
        l = 0.2126 * r + 0.7152 * g + 0.0722 * bb
        luma_all += l
        d = max(abs(r - b[3 * i]), abs(g - b[3 * i + 1]), abs(bb - b[3 * i + 2]))
        if d > threshold:
            cov += 1
            luma_sum += l
            x, y = i % w, i // w
            x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x), max(y1, y)
    return {"coverage": round(cov / n, 4), "bbox": [x0, y0, x1, y1] if cov else None,
            "mean_luma_effect": round(luma_sum / cov, 2) if cov else 0.0, "mean_luma_frame": round(luma_all / n, 2)}


def overdraw_summary(frames):
    """Peak numbers over VfxSequence frames (or any list of VfxBudget.Overdraw dicts under 'overdraw')."""
    ods = [f["overdraw"] if "overdraw" in f else f for f in frames]
    if not ods:
        return {}
    top = max(ods, key=lambda o: o["fse"])
    return {"peak_fse": top["fse"], "peak_max_layers": top["max_layers"], "peak_p95": top["p95_layers"],
            "peak_coverage": top["coverage"], "heatmap": top.get("heatmap")}


# ============================================================================ VFX Graph asset text
_SYS_RE = re.compile(r"^\s{2}title: (.*)$", re.M)


def vfx_yaml_facts(path):
    """Read capacity, boundsMode (0 Recorded, 1 Manual, 2 Automatic), stripCapacity and sort per data or
    output block (sort: 0 Auto, 1 Off, 2 On: VFXAbstractParticleOutput.SortActivationMode in 17.3) from a .vfx
    file as TEXT (no editor). Read-only: editing .vfx YAML by hand is fragile."""
    with open(path, encoding="utf-8", errors="replace") as f:
        text = f.read()
    blocks = re.split(r"^--- !u!", text, flags=re.M)
    systems, outputs = [], []
    for b in blocks:
        cap = re.search(r"^\s{2}capacity: (\d+)", b, re.M)
        if cap:
            bm = re.search(r"^\s{2}boundsMode: (\d+)", b, re.M)
            title = re.search(r"^\s{2}title: ?(.*)$", b, re.M)
            sc = re.search(r"^\s{2}stripCapacity: (\d+)", b, re.M)
            systems.append({"title": (title.group(1).strip() if title else ""), "capacity": int(cap.group(1)),
                            "bounds_mode": {0: "Recorded", 1: "Manual", 2: "Automatic"}.get(int(bm.group(1)) if bm else -1, "unknown"),
                            "strip_capacity": int(sc.group(1)) if sc else None})
        so = re.search(r"^\s{2}sort: (\d+)", b, re.M)
        if so:
            outputs.append({"sort": int(so.group(1)), "sort_mode": {0: "Auto", 1: "Off", 2: "On"}.get(int(so.group(1)), "unknown")})
    return {"path": path, "systems": systems, "outputs": outputs,
            "automatic_bounds": [s["title"] for s in systems if s["bounds_mode"] == "Automatic"],
            "exposed_count": len(re.findall(r"m_Exposed: 1", text))}


# ============================================================================ point cache
def write_pcache(path, points, colors=None, normals=None):
    """Write an ASCII .pCache (open spec, github.com/peeweek/pcache). Only float and uchar properties are
    importable (VFX Graph 17.3 manual). points: [(x, y, z)], colors: [(r, g, b, a)] floats 0..1."""
    n = len(points)
    props = ["property float position.x", "property float position.y", "property float position.z"]
    if normals:
        props += ["property float normal.x", "property float normal.y", "property float normal.z"]
    if colors:
        props += ["property float color.r", "property float color.g", "property float color.b", "property float color.a"]
    lines = ["pcache", "comment written by ut_vfx.write_pcache", "format ascii 1.0", "elements %d" % n] + props + ["end_header"]
    for i in range(n):
        row = ["%.6f" % v for v in points[i]]
        if normals:
            row += ["%.6f" % v for v in normals[i]]
        if colors:
            row += ["%.6f" % v for v in colors[i]]
        lines.append(" ".join(row))
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")
    return path


def sphere_points(n, radius=1.0):
    """Evenly spread points on a sphere (Fibonacci), for point cache tests."""
    pts = []
    golden = math.pi * (3 - math.sqrt(5))
    for i in range(n):
        y = 1 - (i / float(max(1, n - 1))) * 2
        r = math.sqrt(max(0.0, 1 - y * y))
        th = golden * i
        pts.append((radius * r * math.cos(th), radius * y, radius * r * math.sin(th)))
    return pts


# ============================================================================ v0.2 craft checks (pure python)
def _luma(r, g, b):
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def effect_energy(png, background_png, threshold=12):
    """Light the effect adds to the frame: mean over ALL pixels of max(0, luma(frame) - luma(background)), 0..255.
    Combines brightness and screen extent (Keyser's brightness budget covers brightness, opacity, scale). Also returns
    coverage (share of pixels that differ by more than threshold) and the mean added luma inside that mask."""
    w, h, a, _al, _m = ut_review.load_image(png)
    w2, h2, b, _al2, _m2 = ut_review.load_image(background_png)
    if (w, h) != (w2, h2):
        raise ValueError("size mismatch %s vs %s" % ((w, h), (w2, h2)))
    n = w * h
    added, cov, added_in = 0.0, 0, 0.0
    for i in range(n):
        la = _luma(a[3 * i], a[3 * i + 1], a[3 * i + 2])
        lb = _luma(b[3 * i], b[3 * i + 1], b[3 * i + 2])
        d = la - lb
        if d > 0:
            added += d
        if max(abs(a[3 * i] - b[3 * i]), abs(a[3 * i + 1] - b[3 * i + 1]), abs(a[3 * i + 2] - b[3 * i + 2])) > threshold:
            cov += 1
            added_in += max(0.0, d)
    return {"energy": round(added / n, 4), "coverage": round(cov / n, 4), "mean_added_in_mask": round(added_in / cov, 2) if cov else 0.0}


IMPORTANCE = ["Idle", "Basic", "Defensive", "Damaging", "GameChanger", "Ultimate"]   # VfxTier.importance (Keyser)


def importance_ladder(rows, tolerance=0.1):
    """Keyser's brightness budget as a check. rows: [{"name", "tier_rank" (0 Idle .. 5 Ultimate), "energy", "frequent"}],
    energy = peak effect_energy of each effect captured with the same camera and scale. Pass when no effect is brighter
    than one of a HIGHER tier (beyond tolerance), and every frequent effect is dimmer than every rare damaging-or-above
    effect. Returns {"verdict", "lines", "order"}."""
    lines, worst = [], "pass"
    rows = sorted(rows, key=lambda r: (r["tier_rank"], r["energy"]))
    for i, lo in enumerate(rows):
        for hi in rows[i + 1:]:
            if hi["tier_rank"] > lo["tier_rank"] and lo["energy"] > hi["energy"] * (1 + tolerance):
                worst = "fail"
                lines.append("FAIL: %s (%s, energy %.3f) outshines %s (%s, energy %.3f): brightness must follow importance (Keyser)"
                             % (lo["name"], IMPORTANCE[lo["tier_rank"]], lo["energy"], hi["name"], IMPORTANCE[hi["tier_rank"]], hi["energy"]))
    rare_high = [r for r in rows if not r.get("frequent") and r["tier_rank"] >= 3]
    for r in rows:
        if r.get("frequent"):
            for h in rare_high:
                if r["energy"] >= h["energy"]:
                    worst = "fail"
                    lines.append("FAIL: frequent %s (energy %.3f) as bright as rare %s (%.3f)" % (r["name"], r["energy"], h["name"], h["energy"]))
    if worst == "pass":
        lines.append("PASS: energy rises with importance: " + " < ".join("%s %.3f" % (r["name"], r["energy"]) for r in rows))
    return {"verdict": worst, "lines": lines, "order": [(r["name"], IMPORTANCE[r["tier_rank"]], r["energy"]) for r in rows]}


def mask_blobs(png, background_png, threshold=12, step=2, min_px=20):
    """Connected shapes of the effect: pixels differing from the background by more than threshold, sampled every
    `step` pixels, 4-connected; components under min_px samples are ignored. Returns sizes, largest first."""
    w, h, a, _al, _m = ut_review.load_image(png)
    w2, h2, b, _al2, _m2 = ut_review.load_image(background_png)
    if (w, h) != (w2, h2):
        raise ValueError("size mismatch")
    gw, gh = (w + step - 1) // step, (h + step - 1) // step
    mask = bytearray(gw * gh)
    for gy in range(gh):
        for gx in range(gw):
            i = (gy * step) * w + gx * step
            if max(abs(a[3 * i] - b[3 * i]), abs(a[3 * i + 1] - b[3 * i + 1]), abs(a[3 * i + 2] - b[3 * i + 2])) > threshold:
                mask[gy * gw + gx] = 1
    sizes, seen = [], bytearray(gw * gh)
    for start in range(gw * gh):
        if not mask[start] or seen[start]:
            continue
        stack, n = [start], 0
        seen[start] = 1
        while stack:
            k = stack.pop()
            n += 1
            x, y = k % gw, k // gw
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < gw and 0 <= ny < gh:
                    q = ny * gw + nx
                    if mask[q] and not seen[q]:
                        seen[q] = 1
                        stack.append(q)
        if n >= min_px:
            sizes.append(n)
    return sorted(sizes, reverse=True)


def crowd_readability(png, background_png, n_copies, min_share=0.8, max_clipped=0.25, threshold="auto"):
    """Keyser: an effect must still read with the real number of copies on screen. Shapes are the effect's CORES:
    pixels differing from the background by more than half of the 90th percentile of the effect's differences
    (threshold="auto", at least 12), so soft glow halos and faint smoke do not bridge neighbours; a fixed number (0..255)
    can be passed instead. Pass when at least min_share x N separate shapes are found and under max_clipped of the
    effect pixels are clipped white (luma >= 250) [added thresholds; calibrated on 20 explosions: gameplay spacing
    20/20 shapes, packed 2.2 m apart 6/20]. Returns {"verdict", "blobs", "n", "clipped_share", "threshold", "lines"}."""
    w, h, a, _al, _m = ut_review.load_image(png)
    w2, h2, b, _al2, _m2 = ut_review.load_image(background_png)
    diffs = [max(abs(a[3 * i] - b[3 * i]), abs(a[3 * i + 1] - b[3 * i + 1]), abs(a[3 * i + 2] - b[3 * i + 2])) for i in range(w * h)]
    if threshold == "auto":
        eff = sorted(d for d in diffs if d > 12)
        threshold = max(12.0, 0.5 * eff[int(0.9 * (len(eff) - 1))]) if eff else 12.0
    blobs = mask_blobs(png, background_png, threshold)
    cov = clipped = 0
    for i in range(w * h):
        if diffs[i] > 12:
            cov += 1
            if _luma(a[3 * i], a[3 * i + 1], a[3 * i + 2]) >= 250:
                clipped += 1
    share = clipped / cov if cov else 0.0
    lines = []
    ok_blobs = len(blobs) >= min_share * n_copies
    lines.append(("PASS" if ok_blobs else "WARN") + ": %d separate shapes for %d copies" % (len(blobs), n_copies))
    ok_clip = share <= max_clipped
    lines.append(("PASS" if ok_clip else "WARN") + ": %.1f%% of effect pixels clipped white" % (100 * share))
    return {"verdict": "pass" if ok_blobs and ok_clip else "warn", "blobs": len(blobs), "n": n_copies,
            "clipped_share": round(share, 4), "largest_blobs": blobs[:5], "threshold": round(float(threshold), 1), "lines": lines}


SMOOTH_DETAIL = 0.005   # [added] VfxBudget.TextureDetail below this = soft texture (calibrated here: glow 0.003, flame
                        # and smoke sheets 0.007 to 0.012): magnifying it on screen loses nothing


def texel_verdict(texel_rows, budget):
    """Per layer (VfxBudget.ScreenTexel rows, or CaptureEffect 'texel_max'): ratio = texels across a particle / its
    largest on-screen size in pixels. Below budget['texel_ratio'][0] with a detailed texture: magnified, soft or blurry
    up close (Truempler: a 32 x 32 speck that reaches the camera is a blob; author big, import at the closest
    coverage); a smooth texture (glow, detail < SMOOTH_DETAIL) may be magnified. Above [1]: memory for texels the
    screen never shows (lower the import size). Returns {"verdict", "lines"}."""
    lo, hi = budget.get("texel_ratio", (0.5, 4.0))
    lines, worst = [], "pass"
    for r in texel_rows:
        ratio = r.get("ratio", 0) or 0
        if not r.get("max_screen_px"):
            continue
        tag = "%s/%s %.0f px on screen, %.0f texels across (x%.2f)" % (r.get("effect"), r.get("system"), r["max_screen_px"], r.get("texels_across", 0), ratio)
        detail = r.get("detail", -1)
        if ratio < lo and detail is not None and 0 <= detail < SMOOTH_DETAIL:
            lines.append("PASS: magnified but smooth (detail %.4f): %s" % (detail, tag))
        elif ratio < lo:
            worst = "warn"
            lines.append("WARN: magnified (detail %.4f): %s" % (detail if detail is not None else -1, tag))
        elif ratio > hi:
            lines.append("INFO: more texels than shown (lower the import size unless the texture tiles or scrolls): " + tag)
        else:
            lines.append("PASS: " + tag)
    return {"verdict": worst, "lines": lines}


def motion_gaps(pngs, background_png, threshold=0.6, diff_threshold=12):
    """Nordeus: something should always be moving. For consecutive, EVENLY spaced captures, the mean absolute luma
    change inside the effect mask; a pair whose change is under threshold (0..255) while the effect is visible is a
    frozen moment [added threshold]. Returns {"verdict", "pairs": [(i, change)], "frozen": [i]}."""
    imgs = [ut_review.load_image(p) for p in pngs]
    _w, _h, b, _al, _m = ut_review.load_image(background_png)
    pairs, frozen = [], []
    for k in range(len(imgs) - 1):
        w, h, a1 = imgs[k][0], imgs[k][1], imgs[k][2]
        a2 = imgs[k + 1][2]
        tot, n = 0.0, 0
        for i in range(w * h):
            vis = max(abs(a1[3 * i] - b[3 * i]), abs(a1[3 * i + 1] - b[3 * i + 1]), abs(a1[3 * i + 2] - b[3 * i + 2])) > diff_threshold
            if vis:
                n += 1
                tot += abs(_luma(a1[3 * i], a1[3 * i + 1], a1[3 * i + 2]) - _luma(a2[3 * i], a2[3 * i + 1], a2[3 * i + 2]))
        change = tot / n if n else 0.0
        pairs.append((k, round(change, 3)))
        if n and change < threshold:
            frozen.append(k)
    return {"verdict": "warn" if frozen else "pass", "pairs": pairs, "frozen": frozen}


def effect_verdict(result, budget, primary_ratio=True):
    """Judge a VfxSequence.CaptureEffect result: peak fill (FSE) and live particles for one effect, visual radius vs
    the VfxTier gameplay radius (when primary systems were named), the tail after the gameplay stop (stop_t: loops must
    be gone within budget['max_tail_s']), 0 particles at the end, and screen texels. Returns {"verdict", "lines", "numbers"}."""
    lines, worst = [], "pass"
    order = {"pass": 0, "warn": 1, "fail": 2}

    def mark(level, msg):
        nonlocal worst
        if order[level] > order[worst]:
            worst = level
        lines.append("%s: %s" % (level.upper(), msg))

    per_copy = max(1, result.get("copies", 1))
    fse = result.get("peak_fse", 0.0) / per_copy
    (mark("pass", "peak fill %.3f FSE per copy <= %.2f" % (fse, budget["peak_fse_single"])) if fse <= budget["peak_fse_single"]
     else mark("fail", "peak fill %.3f FSE per copy > %.2f" % (fse, budget["peak_fse_single"])))
    alive = result.get("peak_alive", 0) / per_copy
    (mark("pass", "peak live particles %.0f per copy <= %d" % (alive, budget["peak_alive_single"])) if alive <= budget["peak_alive_single"]
     else mark("fail", "peak live particles %.0f per copy > %d" % (alive, budget["peak_alive_single"])))
    ratio = result.get("radius_ratio")
    if ratio is not None and primary_ratio:
        lo, hi = budget["radius_ratio"]
        (mark("pass", "visual / gameplay radius %.2f in [%.2f, %.2f]" % (ratio, lo, hi)) if lo <= ratio <= hi
         else mark("fail", "visual / gameplay radius %.2f outside [%.2f, %.2f] (Keyser)" % (ratio, lo, hi)))
    tail = result.get("tail_seconds")
    if result.get("stop_t"):
        if tail is None:
            mark("fail", "still alive %.1f s after the gameplay stop" % budget.get("max_tail_s", 0.5))
        else:
            (mark("pass", "gone %.2f s after the gameplay stop (<= %.2f)" % (tail, budget["max_tail_s"])) if tail <= budget["max_tail_s"]
             else mark("warn", "tail %.2f s after the gameplay stop > %.2f: reads as still active (Keyser)" % (tail, budget["max_tail_s"])))
    elif result.get("life_seconds") is None:
        mark("warn", "never reached 0 particles within the window (loop without a stop_t?)")
    dur = result.get("gameplay_duration") or 0
    life = result.get("life_seconds")
    if dur and life is not None:
        (mark("pass", "life %.2f s within gameplay duration %.2f s + tail" % (life, dur)) if life <= dur + budget["max_tail_s"]
         else mark("warn", "life %.2f s exceeds gameplay duration %.2f s + %.2f" % (life, dur, budget["max_tail_s"])))
    tv = texel_verdict(result.get("texel_max", []), budget)
    for l in tv["lines"]:
        if not l.startswith("PASS"):
            lines.append(l)
    if tv["verdict"] == "warn" and worst == "pass":
        worst = "warn"
    return {"verdict": worst, "lines": lines,
            "numbers": {"peak_fse_per_copy": round(fse, 4), "peak_alive_per_copy": alive, "radius_ratio": ratio, "tail_seconds": tail,
                        "life_seconds": life, "draw_call_estimate": result.get("draw_call_estimate")}}


def graph_hygiene(facts, alive=None, over_alloc=4.0):
    """VFX Graph PC-tier hygiene on vfx_yaml_facts (Orson Favrel, Unite 2024 20WjQIFl85o [00:31:43] to [00:35:40]):
    Automatic bounds (always recomputed and simulated), capacity far above the measured alive count (memory =
    capacity x stored attributes), sorting on (costs a dispatch; turn it off where order does not matter), no exposed
    property (not a black box gameplay can drive). alive: {system title: peak alive} or one int for all systems.
    Returns {"verdict", "lines"}. over_alloc is an [added] threshold."""
    lines, worst = [], "pass"
    for s_ in facts.get("systems", []):
        if s_["bounds_mode"] == "Automatic":
            worst = "warn"
            lines.append("WARN: %s: Automatic bounds (always recomputed and simulated): record and apply bounds" % (s_["title"] or "system"))
        a = alive.get(s_["title"]) if isinstance(alive, dict) else alive
        if a:
            if a > s_["capacity"]:
                worst = "warn"
                lines.append("WARN: %s: alive %d above capacity %d (capped spawns)" % (s_["title"] or "system", a, s_["capacity"]))
            elif s_["capacity"] > over_alloc * a:
                worst = "warn"
                lines.append("WARN: %s: capacity %d > %.0fx the peak alive %d (memory = capacity x attributes)" % (s_["title"] or "system", s_["capacity"], over_alloc, a))
    sorted_outputs = sum(1 for o in facts.get("outputs", []) if o.get("sort") in (0, 2))
    if sorted_outputs:
        lines.append("INFO: %d output(s) with sorting Auto or On (sorts when the blend mode needs it): set Off where draw order "
                     "does not matter, e.g. dense dark smoke (a dispatch saved)" % sorted_outputs)
    if facts.get("exposed_count", 0) == 0:
        lines.append("INFO: no exposed property: gameplay can only Play/Stop it; expose the few values it drives")
    if worst == "pass" and not lines:
        lines.append("PASS: bounds, capacity and sorting look sane")
    return {"verdict": worst, "lines": lines}
