"""
ut_lighting: runner-side helpers of the scenario-unity-rendering-lighting skill (lighter / graphics TA).

Imports the shared toolkit (scenario-unity-expert/scripts: ut_env, ut_run, ut_review, ut_stat); never
copies it. System python3 3.9+, stdlib only (Pillow optional for annotated PNGs).
Run on real Unity 6000.3.21f1 captures on 2026-09-24: tests/code/unity-rendering-lighting/.

    import sys; sys.path.insert(0, "<skills>/scenario-unity-rendering-lighting/scripts")
    import ut_lighting as L
    P = L.project("<project>/tests/projects/<skill>")     # clone + core and Lighting AgentKit
    L.shadow_density(2048, 40) , L.shadow_density(1024, 10)  # texels per metre: distance before resolution
    L.atlas_plan(spots=4, points=1, atlas=512, tier_px=256)   # additional-light shadow atlas fit
    cap = ut_run.run_method(P, "AgentKit.Lighting.LightingCapture.CaptureStage", {...}, graphics=True)
    L.stage_review(cap)            # image_checks per shot + grey-card EV + contact sheet to LOOK at
    L.shadow_contrast(cap, [("Patch_Lit_Far", "Patch_Shadow_Far")])   # is a shadow there, in stops
    L.pass_summary(ut_run.run_method(P, "AgentKit.Lighting.LightingCapture.PassAudit", {...}, graphics=True))
    L.raw_command(P, "AgentKit.Lighting.LightingPipeline.ReportPipeline")   # the plain Unity command line
"""

__version__ = "0.1"  # scenario-unity-rendering-lighting v0.1 (2026-09-24, refactor after blind grade Y3)

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL_DIR = os.path.dirname(HERE)
EXPERT_SCRIPTS = os.path.join(os.path.dirname(SKILL_DIR), "scenario-unity-expert", "scripts")
if EXPERT_SCRIPTS not in sys.path:
    sys.path.insert(0, EXPERT_SCRIPTS)

import ut_env  # noqa: E402
import ut_review  # noqa: E402

AGENTKIT_LIGHTING = os.path.join(HERE, "AgentKit")
_LIN = ut_review._LIN  # sRGB byte -> linear
MIDDLE_GREY = 0.18


def project(dest, kind="3d"):
    """Clone the base project if needed and install the core AgentKit plus AgentKit/Lighting."""
    p = ut_env.base_project(kind, dest)
    ut_env.install_agentkit(p)
    ut_env.install_agentkit(p, src=AGENTKIT_LIGHTING)
    return p


RUNTIME_CAPTURE = os.path.join(HERE, "Runtime", "AgentPlayerCapture.cs")


def install_player_capture(project, dest="Assets/AgentKitRuntime/AgentPlayerCapture.cs"):
    """Copy the runtime capture helper into a project for a VERIFICATION build (remove it, or keep
    it out of the shipping build profile, before shipping). It does nothing unless the player is
    started with -agentOut."""
    import shutil
    root = ut_env.find_project(project)["root"]
    d = os.path.join(root, dest)
    os.makedirs(os.path.dirname(d), exist_ok=True)
    shutil.copyfile(RUNTIME_CAPTURE, d)
    return d


def player_capture(app, out_png, view="A_Wide", quality=None, timeout=300, log=None):
    """Run a built macOS player headless (-batchmode keeps the graphics device) so the helper
    renders the AgentView_<view> bookmark to out_png, then parse its AGENT_PLAYER_CAPTURE line
    (quality level in use, levels present, whether Forward+ ran: cluster_light_loop). A player
    only contains the quality levels enabled for its platform."""
    import glob
    import subprocess
    exe = app
    if app.endswith(".app"):
        exe = glob.glob(os.path.join(app, "Contents", "MacOS", "*"))[0]
    log = log or os.path.splitext(out_png)[0] + ".player.log"
    os.makedirs(os.path.dirname(os.path.abspath(out_png)), exist_ok=True)
    cmd = [exe, "-batchmode", "-agentOut", out_png, "-agentView", view, "-logFile", log]
    if quality:
        cmd += ["-agentQuality", quality]
    subprocess.run(cmd, timeout=timeout)
    line = ""
    if os.path.isfile(log):
        with open(log, errors="replace") as f:
            line = next((ln.strip() for ln in f if "AGENT_PLAYER_CAPTURE" in ln), "")
    facts = dict(kv.split("=", 1) for kv in line.split() if "=" in kv)
    return {"png": out_png, "written": os.path.isfile(out_png), "log": log, "line": line,
            "quality": facts.get("quality"), "levels": facts.get("levels", "").split("|") if facts.get("levels") else [],
            "cluster_light_loop": facts.get("cluster_light_loop") == "True"}


# ============================================================================ shadow maths
def shadow_density(resolution, max_distance, cascades=1, split1=None):
    """First-order texels per metre of the main-light shadow map near the camera [added proxy].

    One cascade spreads `resolution` texels over Max Distance ("the higher the value, the lower the
    pixel density", 6.3 Manual). With 2 to 4 cascades URP packs tiles of resolution/2 and the first
    cascade covers split1 x Max Distance. The absolute value depends on FOV and view direction;
    compare configurations with it, do not budget with it. The Manual's example: 2048 over 40 m
    (51/m) loses to 1024 over 10 m (102/m) near the camera."""
    if cascades <= 1:
        return round(resolution / float(max_distance), 2)
    tile = resolution / 2.0
    s1 = split1 if split1 is not None else {2: 0.25, 3: 0.1, 4: 0.067}.get(cascades, 0.1)
    return round(tile / (s1 * float(max_distance)), 2)


def atlas_plan(spots, points, atlas, tier_px):
    """Additional-light shadow atlas (6.3 Manual, URP e-book): spot = 1 map, point = 6 cube faces;
    at most 16 maps; 1 map fills the atlas, 2 to 4 tile 2x2, 5 to 16 tile 4x4. Overflow shrinks
    every map and logs a console warning. Manual example: 4 spots + 1 point = 10 maps at 256 need
    a 1024 atlas (512 holds only 4)."""
    maps = spots + 6 * points
    grid = 1 if maps <= 1 else (2 if maps <= 4 else 4)
    per = atlas // grid
    need = tier_px * grid
    return {"maps": maps, "grid": "%dx%d" % (grid, grid), "per_map_px": per if maps <= 16 else atlas // 4,
            "requested_px": tier_px, "fits": maps <= 16 and per >= tier_px,
            "min_atlas_px": need if maps <= 16 else None}


# ============================================================================ image regions
def _load(path):
    w, h, rgb, _a, _m = ut_review.load_image(path)
    return w, h, rgb


def region_stats(png, rect):
    """Mean colour and exposure of a pixel rectangle [x0, y0, x1, y1] (top-left origin) of a
    display-referred capture: mean sRGB, mean linear luminance (Rec. 709), EV relative to 18% grey
    (display EV, after tonemapping and grading), clipped share, saturation, blue minus red (a
    sky-tint indicator on chrome or interiors)."""
    w, h, rgb = _load(png)
    x0, y0, x1, y1 = [int(v) for v in rect]
    x0, x1 = max(0, min(x0, x1)), min(w - 1, max(x0, x1))
    y0, y1 = max(0, min(y0, y1)), min(h - 1, max(y0, y1))
    n = 0
    sr = sg = sb = 0.0
    lin = 0.0
    clipped = 0
    sat = 0.0
    for y in range(y0, y1 + 1):
        row = 3 * y * w
        for x in range(x0, x1 + 1):
            o = row + 3 * x
            r, g, b = rgb[o], rgb[o + 1], rgb[o + 2]
            sr += r
            sg += g
            sb += b
            lin += 0.2126 * _LIN[r] + 0.7152 * _LIN[g] + 0.0722 * _LIN[b]
            mx, mn = max(r, g, b), min(r, g, b)
            sat += 0 if mx == 0 else (mx - mn) / float(mx)
            if max(r, g, b) >= 250:
                clipped += 1
            n += 1
    if n == 0:
        return {"pixels": 0}
    ml = lin / n
    return {"pixels": n, "mean_srgb": [round(sr / n / 255, 4), round(sg / n / 255, 4), round(sb / n / 255, 4)],
            "mean_linear": round(ml, 5), "ev_vs_grey": round(math.log(max(ml, 1e-6) / MIDDLE_GREY, 2), 3),
            "clipped_fraction": round(clipped / float(n), 4), "saturation": round(sat / n, 4),
            "blue_minus_red": round((sb - sr) / n / 255.0, 4)}


def probe_stats(capture_envelope):
    """region_stats for every visible probe rectangle of a LightingCapture.CaptureStage envelope.
    Returns {shot_name: {probe_name: stats}}."""
    out = {}
    for shot in (capture_envelope.get("result") or {}).get("shots", []):
        per = {}
        for name, pr in (shot.get("probes") or {}).items():
            if pr.get("visible") and pr.get("pixels", 0) >= 16:
                per[name] = region_stats(shot["path"], pr["rect_px"])
                per[name]["distance_m"] = pr.get("distance")
        out[shot.get("name")] = per
    return out


def best_probes(probes):
    """{probe: stats} keeping, for each probe, the shot where it covers the most pixels."""
    best = {}
    for _shot, ps in probes.items():
        for name, st in ps.items():
            if st.get("pixels", 0) > best.get(name, {}).get("pixels", 0):
                best[name] = dict(st, shot=_shot)
    return best


def annotate(png, rects, out, color=(255, 0, 255)):
    """Draw probe rectangles on a copy of a capture (Pillow) so the agent can LOOK at what was
    measured. Returns out, or None without Pillow."""
    try:
        from PIL import Image, ImageDraw
    except Exception:
        return None
    im = Image.open(png).convert("RGB")
    d = ImageDraw.Draw(im)
    for label, r in rects.items():
        d.rectangle([r[0], r[1], r[2], r[3]], outline=color, width=2)
        d.text((r[0] + 2, max(0, r[1] - 12)), label, fill=color)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    im.save(out)
    return out


# ============================================================================ stage review
# [added] start values for a stylized, display-referred review; tune per art direction.
TARGETS = {
    "grey_card_sun_ev": (-0.5, 0.5),    # sunlit 18% card after tonemapping reads middle grey, +-half a stop
    "clipped_max": 0.05,                # share of pixels at 250+ (sky and emissives allowed via expect="bright")
    "crushed_max": 0.30,
    "sun_to_shade_stops_max": 4.0,      # value structure: shade keeps detail
}


def stage_review(capture_envelope, sheet=None, expect="any", previous=None):
    """image_checks and verdict per shot (ut_review), probe stats, a contact sheet to LOOK at, and
    lighting-specific flags: sunlit grey card exposure, sun-to-shade ratio, and against the
    previous stage (pass the previous stage_review result): saturation lost (the grey-after-bake
    symptom, Kyle Banks 1agSNKuAfTM [00:04:58]) and grey cards that moved more than 1 EV (a
    tonemapper switch moves middle grey: ACES darkens, Unite 2025 K3-wPnhmDi4 [00:54:50]).
    Metrics are keyed by bookmark name, so stages compare view for view."""
    rev = ut_review.review_capture(capture_envelope, sheet=sheet, expect=expect)
    probes = probe_stats(capture_envelope)
    shots = [s for s in (capture_envelope.get("result") or {}).get("shots", []) if s.get("path")]
    flags = []
    by_name = {}
    for shot, fr in zip(shots, rev["frames"]):
        c = fr["checks"]
        by_name[shot.get("name")] = {"mean_luma": c["mean_luma"], "log_avg_ev": c["log_avg_ev"], "std_luma": c["std_luma"],
                                     "clipped": c["clipped_fraction"], "crushed": c["crushed_fraction"],
                                     "saturation": c["mean_saturation"], "p01": c["p01_luma"], "p99": c["p99_luma"]}
    best = best_probes(probes)
    sun, shade = best.get("GreyCard_Sun"), best.get("GreyCard_Shade")
    if sun:
        lo, hi = TARGETS["grey_card_sun_ev"]
        if not lo <= sun["ev_vs_grey"] <= hi:
            flags.append("warn: sunlit grey card at %+.2f EV from middle grey (band %+.2f..%+.2f): "
                         "fix exposure once, then light intensities" % (sun["ev_vs_grey"], lo, hi))
    if sun and shade:
        ratio = sun["ev_vs_grey"] - shade["ev_vs_grey"]
        if ratio > TARGETS["sun_to_shade_stops_max"]:
            flags.append("warn: shade card %.1f stops under the sunlit card (limit %.1f): shadows lose detail "
                         "(check the grade's contrast and ACES first, then sky/bounce; shadow strength last)"
                         % (ratio, TARGETS["sun_to_shade_stops_max"]))
    for name, st in best.items():
        if not name.startswith("GreyCard") and st.get("mean_linear", 1) < 0.002:
            flags.append("warn: %s is black in this Editor capture: baked reflection probes on metals came out "
                         "black in Editor batch captures (always on the Forward path, sometimes on Forward+) while "
                         "players rendered them (observed): verify in a player (procedure P12) before fixing" % name)
    if previous:
        pm = previous.get("metrics", previous)
        pb = previous.get("best_probes", {})
        for name, cur in by_name.items():
            prev = pm.get(name)
            if prev and prev["saturation"] > 0 and cur["saturation"] < 0.8 * prev["saturation"]:
                flags.append("warn: %s saturation fell %.0f%% versus the previous stage (washed out: "
                             "tonemap and grade, do not re-light)" % (name, 100 * (1 - cur["saturation"] / prev["saturation"])))
        for name, cur in best.items():
            if not name.startswith("GreyCard") or name not in pb:
                continue
            drift = cur["ev_vs_grey"] - pb[name]["ev_vs_grey"]
            if abs(drift) > 1.0:
                flags.append("warn: %s moved %+.2f EV versus the previous stage: if only post changed, re-set "
                             "exposure under the final tonemapper (the exposure owner: global or zone volume)" % (name, drift))
    return {"ok": rev["ok"], "errors": rev["errors"], "warnings": rev["warnings"], "sheet": rev["sheet"],
            "verdicts": {os.path.basename(fr["path"]): fr["verdict"] for fr in rev["frames"]},
            "metrics": by_name, "probes": probes, "best_probes": best, "flags": flags}


def next_exposure(target_ev, samples, first_slope=1.0):
    """Next Post Exposure for a zone from [(post_exposure, measured_card_ev), ...] (display EV of a
    grey card under the FINAL tonemapper). One sample: assume slope first_slope. Two or more:
    secant through the last two. Tonemappers are not linear around middle grey: observed
    2026-09-24 under ACES + grade, the wall card moved 2.62 EV for a 1.49 EV exposure change
    (slope 1.76), so a one-step solve overshoots; iterate until within 0.25 EV."""
    if not samples:
        raise ValueError("need at least one (exposure, measured) sample")
    e1, m1 = samples[-1]
    if len(samples) == 1:
        return round(e1 + (target_ev - m1) / float(first_slope), 3)
    e0, m0 = samples[-2]
    slope = (m1 - m0) / (e1 - e0) if e1 != e0 else first_slope
    if abs(slope) < 1e-3:
        slope = first_slope
    return round(e1 + (target_ev - m1) / slope, 3)


def stops(a_linear, b_linear):
    """Ratio of two linear values in photographic stops (EV)."""
    return round(math.log(max(a_linear, 1e-6) / max(b_linear, 1e-6), 2), 3)


# ============================================================================ tier readback
def tier_check(report, expected):
    """Compare a LightingPipeline.ReportPipeline result (run in a fresh process) with the
    expected per-level values: {"PC": {"asset": {m_...: v}, "renderer": {"rendering_path": ...}}}.
    Returns {"ok", "mismatches": [...], "checked": n}."""
    levels = {lv["name"]: lv for lv in report.get("levels", [])}
    mism, n = [], 0
    for q, exp in expected.items():
        lv = levels.get(q)
        if lv is None:
            mism.append("%s: no such quality level" % q)
            continue
        urp = lv.get("urp") or {}
        fields = urp.get("fields", {})
        for k, v in (exp.get("asset") or {}).items():
            n += 1
            got = fields.get(k)
            if not _same(got, v):
                mism.append("%s.%s: expected %r, got %r" % (q, k, v, got))
        r0 = (urp.get("renderers") or [{}])[0]
        for k, v in (exp.get("renderer") or {}).items():
            n += 1
            got = r0.get(k) if k in r0 else (r0.get("fields") or {}).get(k)
            if not _same(got, v):
                mism.append("%s.renderer.%s: expected %r, got %r" % (q, k, v, got))
        if exp.get("asset_path"):
            n += 1
            if lv.get("asset") != exp["asset_path"]:
                mism.append("%s: renders with %r, expected %r" % (q, lv.get("asset"), exp["asset_path"]))
    return {"ok": not mism, "mismatches": mism, "checked": n}


def _same(a, b):
    if isinstance(b, float) or isinstance(a, float):
        try:
            return abs(float(a) - float(b)) < 1e-3
        except (TypeError, ValueError):
            return False
    if isinstance(b, bool) or isinstance(a, bool):
        return bool(a) == bool(b)
    return a == b or str(a) == str(b)


# ============================================================================ v0.2 helpers
def shadow_contrast(capture_envelope, pairs):
    """Stops between a lit patch and a patch that should sit in shadow, per (lit, shadow) probe
    pair, from the shot where each probe is largest: >= 1 stop means the shadow is there, about 0
    means it is gone (for example beyond Max Distance without a shadowmask). Used by the Lighting
    Mode check (procedure P13) and any shadow-presence gate."""
    best = best_probes(probe_stats(capture_envelope))
    out = {}
    for lit, shade in pairs:
        a, b = best.get(lit), best.get(shade)
        out["%s/%s" % (lit, shade)] = None if not (a and b) else round(a["ev_vs_grey"] - b["ev_vs_grey"], 3)
    return out


def pass_summary(envelope_or_result):
    """Compact view of a LightingCapture.PassAudit result: per graph the native pass count, the
    passes merged in each native pass and why the merge broke. Flags whether the opaque, skybox and
    transparent draws share one native pass (the tile-friendly case, Unite 2025 K3-wPnhmDi4
    [00:30:26] to [00:32:30])."""
    r = envelope_or_result.get("result", envelope_or_result) if isinstance(envelope_or_result, dict) else {}
    rg = r.get("render_graph") or {}
    out = {"available": rg.get("available", False), "error": rg.get("error"), "graphs": []}
    for g in rg.get("graphs", []):
        natives = g.get("native_passes", [])
        def _find(words):
            for i, n in enumerate(natives):
                if any(all(w in p.lower() for w in words) for p in n.get("passes", [])):
                    return i
            return None
        o, sky, t = _find(["opaque"]), _find(["sky"]), _find(["transparent"])
        out["graphs"].append({
            "name": g.get("name"), "native_pass_count": g.get("native_pass_count"), "graph_passes": g.get("graph_passes"),
            "culled": g.get("culled"), "largest_merge": g.get("largest_merge"),
            "opaque_sky_transparent_one_pass": o is not None and o == sky == t,
            "natives": [(len(n.get("passes", [])), n.get("break_reason"), n.get("passes", [])[:6]) for n in natives],
        })
    return out


def raw_command(project, method, args=None, graphics=False, job_dir=None, editor=None):
    """The plain batch-mode command line ut_run.run_method issues, for a shell, CI or another
    agent: writes <job_dir>/args.json and returns {"cmd": [...], "shell": "...", "job_dir", "log"}.
    Result: the log line "AGENT_RESULT {json}" and <job_dir>/result.json. graphics=False adds
    -nographics (fine for reports, tiers, volumes, audits; a -nographics editor cannot bake GI or
    render captures)."""
    import json
    import shlex
    import time
    info = ut_env.find_project(project)
    root = info["root"]
    editor = editor or ut_env.find_editor(info.get("version") or ut_env.DEFAULT_VERSION)["binary"]
    if job_dir is None:
        job_dir = os.path.join(root, "Library", "AgentKit", "jobs", "raw-" + time.strftime("%Y%m%d-%H%M%S"))
    os.makedirs(job_dir, exist_ok=True)
    with open(os.path.join(job_dir, "args.json"), "w") as f:
        json.dump(args or {}, f, indent=2)
    log = os.path.join(job_dir, "unity.log")
    cmd = [editor, "-batchmode"] + ([] if graphics else ["-nographics"]) + [
        "-quit", "-projectPath", root, "-logFile", log, "-executeMethod", method, "-agentJob", job_dir]
    return {"cmd": cmd, "shell": " ".join(shlex.quote(c) for c in cmd), "job_dir": job_dir, "log": log}


PSO_WARMUP = os.path.join(HERE, "Runtime", "AgentPSOWarmup.cs")


def install_pso_warmup(project, dest="Assets/AgentKitRuntime/AgentPSOWarmup.cs"):
    """Copy the PSO trace and warm-up runtime helper into a project (development or verification
    builds; it does nothing unless the player gets -agentPSOTrace or -agentPSOWarm)."""
    import shutil
    root = ut_env.find_project(project)["root"]
    d = os.path.join(root, dest)
    os.makedirs(os.path.dirname(d), exist_ok=True)
    shutil.copyfile(PSO_WARMUP, d)
    return d


def pso_run(app, mode, state_file, frames=120, per_frame=3, timeout=600, log=None):
    """Run a built macOS player headless in trace or warm mode and parse its AGENT_PSO line:
    {"mode", "device", "dev", "variants", "states", "warmed", "frames", "ms", "file_exists"}.
    Tracing needs a development build."""
    import glob
    import subprocess
    exe = glob.glob(os.path.join(app, "Contents", "MacOS", "*"))[0] if app.endswith(".app") else app
    log = log or os.path.splitext(state_file)[0] + "." + mode + ".player.log"
    flag = "-agentPSOTrace" if mode == "trace" else "-agentPSOWarm"
    cmd = [exe, "-batchmode", flag, state_file, "-agentFrames", str(frames), "-agentPerFrame", str(per_frame), "-logFile", log]
    subprocess.run(cmd, timeout=timeout)
    line = ""
    if os.path.isfile(log):
        with open(log, errors="replace") as f:
            line = next((ln.strip() for ln in f if "AGENT_PSO " in ln), "")
    facts = dict(kv.split("=", 1) for kv in line.split() if "=" in kv)
    for k in ("variants", "states", "warmed", "frames", "ms"):
        if k in facts:
            facts[k] = int(facts[k])
    facts["log"] = log
    facts["line"] = line
    return facts
