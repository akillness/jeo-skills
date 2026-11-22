"""
ue_cine: Sequencer, camera, shot-plan and Movie Render Graph toolkit for scenario-unreal-cinematics.

STATUS: NOT YET RUN IN UNREAL (UE 5.8 not installed on 2026-09-24). The offline layer ran
with system python3 + numpy (+ ffmpeg, PIL for EXR pixels and sheets):
tests/code/unreal-cinematics/test_ue_cine_offline.py. The in-editor layer ran only against a
fake `unreal` module (test_ue_cine_fakeunreal.py): that proves the Python logic and call
order, NOT the Unreal API names. Run tests/code/unreal-cinematics/job_00_probe_cine.py first
in the installed engine and fix names from its report. Calls marked [verify] in comments are
not confirmed by the saved 5.8 docs.

The plan is data (JSON): shots, sizes, lenses, planned camera and subject positions (cm,
Z up, X forward, like Unreal), flags (cloth, particles, hair, dof_centric...). Everything is
checked OFFLINE before anything is built, then built in one transaction.

OFFLINE LAYER (agent side, python3; no Unreal needed)
  plan       default_trailer_plan(), load_plan(path), validate_plan(plan), layout(plan)
  time       to_frames(sec, fps), frames_to_tc(f, fps), tc_to_frames(tc, fps)
  camera     look_at(cam, target), right_vector(yaw), framed_height_m(...), classify_size(h),
             dof_limits(focal, fstop, focus_cm, coc_mm), coc_for(filmback), ev100(...),
             iso_to_hold(ev, fstop, shutter)
  checks     check_plan(plan) -> findings (runs all below), check_production, check_lengths,
             check_lenses, check_framing, check_180, check_screen_direction, check_jump_cuts,
             check_dof, check_preroll, check_exposure, check_characters, check_music_sync,
             check_lighting; summarize(findings)
  gates      ready_to_animate(plan) (timing locked against the music), lighting_masters(plan),
             ready_for_final_lighting(plan) (every scenario's master approved), cut_frames
  render     render_policy(shot, plan), render_jobs(plan, only=), audit_render_settings(s),
             normalize_graph_snapshot(snapshot), mrq_command_line(...),
             render_orchestration(specs, unattended, farm)
  output     parse_exr_header(path), exr_pixels(path), exr_stats(path), expected_frames(...),
             scan_frames(dir), check_render_output(plan, root, pattern), shots_to_render(...),
             latest_manifests(dir), check_manifest(plan, manifests), first_frame_pop(...),
             cut_flash(...), luminance_continuity(...), tonemap_preview(rgb), exr_to_png(...),
             contact_sheet(items, out), review_movie_cmd(...), edl(plan)
  delivery   color_mode(s), color_handoff(s) (Resolve ACES Transform per render mode, viewport
             OCIO display), delivery_note(plan, s)
COMPANION  cine_render_callbacks.py: Execute Script node class (CineWrittenFiles) writing the
           written-file manifest; copy to <project>/Content/Python/, import in init_unreal.py
IN-EDITOR LAYER (inside Unreal's Python: MCP python tool, PythonRemote, ue_run jobs)
  editor_tool(name, steps) (undo entry + progress dialog for any tool), probe(),
  build_from_plan(plan), audit_sequence(master, plan), empty_level_test(...),
  board_generator(master, plan, out_dir, preroll=) + run_on_ticker(gen), graph_snapshot(graph),
  queue_render_jobs(plan, specs), render_generator(), retime_shot(...), new_take(...)

Findings everywhere: {"check", "status" (fail|warn|info|pass), "shot", "message", "source"}.
Sources: SI = S4Iyzbl-oaE (Epic, CAT), SPI = moQTQzAOFVA, BLUR = AAAhD5tEUBs,
GLITCH = uzTo5vQchkk, SW = Sir Wade (yOcgYMcxr3Q, ywtvn1uncZo, E7C1xbpEA_Q),
JT = mAMp6qCt7kc (Toonen), WF = 2Q3CybANHKE / fVg5ihB8Wdc (Faucher), VP = 5SJA1FfRPWs
(Mayeda, 5.8), docs: tips, shots, bind, seq-py, mrq-cli, mrg, dmrq (Comly), cam.
[added] marks values that no source states (conventions of this toolkit; calibrate).
"""

__version__ = "0.1"  # Unreal Engine Expert Skills v0.1 (2026-09-24; includes the refactor after blind grade U6)

import contextlib
import glob
import json
import math
import os
import re
import struct
import subprocess

# =========================================================================== constants
DEFAULT_FILMBACK = {"name": "16:9 Digital Film", "sensor_width": 23.76, "sensor_height": 13.365}
# [added, verify]: UE's default Cine Camera filmback preset and its mm values.

# Lens and aperture by shot size. Ranges are [added] general cinematography (digest table),
# except the 24 mm establishing lens (JT [00:10:29]) and "a longer lens feels tighter"
# (JT [00:13:38]). They WARN, never fail: the lens is a creative choice.
SHOT_SIZES = {
    "EWS": {"focal": (14, 24), "fstop": (5.6, 11), "label": "establishing / extreme wide"},
    "WS": {"focal": (18, 35), "fstop": (4, 8), "label": "wide"},
    "FS": {"focal": (24, 35), "fstop": (4, 5.6), "label": "full body"},
    "MFS": {"focal": (35, 50), "fstop": (2.8, 4), "label": "cowboy / medium full"},
    "MS": {"focal": (35, 50), "fstop": (2.8, 4), "label": "medium"},
    "MCU": {"focal": (50, 85), "fstop": (2, 2.8), "label": "medium close-up"},
    "CU": {"focal": (85, 135), "fstop": (1.4, 2.8), "label": "close-up"},
    "ECU": {"focal": (85, 135), "fstop": (1.4, 2.8), "label": "extreme close-up"},
    "INSERT": {"focal": (90, 110), "fstop": (2.8, 5.6), "label": "insert (prop, hand)"},
}
SIZE_ORDER = ["ECU", "CU", "MCU", "MS", "MFS", "FS", "WS", "EWS"]
# Framed height (m) at the subject for a 175 cm adult [added]; scaled by subject height.
FRAMED_HEIGHT_M = [("ECU", 0.0, 0.2), ("CU", 0.2, 0.45), ("MCU", 0.45, 0.75),
                   ("MS", 0.75, 1.3), ("MFS", 1.3, 1.7), ("FS", 1.7, 2.8),
                   ("WS", 2.8, 8.0), ("EWS", 8.0, float("inf"))]
SIM_FLAGS = ("cloth", "hair", "particles", "physics", "trail")
DOF_FLAGS = ("dof_centric", "foreground_occluder", "fence", "hair")
MOTION_CLASSES = ("static", "slow", "normal", "fast", "very_fast")
# Temporal samples by motion. Even column: BLUR [00:39:32] [00:40:05] (24 base with Frame
# Close, 48 fast, 64 very fast, 95% of shots at 24). Odd column: the Frame Center rule (one
# sample on the keyframe; BLUR "23 or 25 if centered"; WF fVg5ihB8Wdc [00:06:01]); 15 for
# static and slow shots is Faucher's 9 to 15 start [00:10:58].
TEMPORAL_SAMPLES = {
    "frame_center": {"static": 15, "slow": 15, "normal": 25, "fast": 49, "very_fast": 65},
    "frame_close": {"static": 16, "slow": 16, "normal": 24, "fast": 48, "very_fast": 64},
    "frame_open": {"static": 16, "slow": 16, "normal": 24, "fast": 48, "very_fast": 64},
}
# Names of the exposed variables of the template graph (procedures P8 spec). A graph that
# uses other names must be mapped with render_jobs(..., var_names={...}).
TEMPLATE_VARIABLES = ("TemporalSamples", "WarmUpFrames", "UseCameraCutWarmUp",
                      "AccumulationDOF")
PREROLL_MIN = 24  # frames; digest "24 to 48 frames" for cloth or particles, tips doc
ENGINE_WARMUP_IDLE_SIM = 30  # tips doc "No Starting Motion": more than 30
LONG_LENS_MM = 85  # [added] start of the CU lens range above; "long lens" for the LOD reminder
MAX_JOINTS = 200  # GLITCH [00:05:33]: Epic's advice, "keep characters under 200 joints each"
# How DaVinci Resolve reads each render mode: ACES Transform node, first on the Color page
# (WF 2Q3CybANHKE [00:08:30] [00:09:05]). Both linear modes look about one stop darker than
# the default viewport (WF [00:09:39]); that is expected, not an error.
RESOLVE_INTERPRETATION = {
    "tone_curve_on": {"input": "sRGB (Linear)", "output": "sRGB Texture"},
    "linear_srgb": {"input": "Linear sRGB", "output": "sRGB"},
    "acescg": {"input": "ACEScg", "output": "sRGB"},
}
EXR_COMPRESSION = {0: "NONE", 1: "RLE", 2: "ZIPS", 3: "ZIP", 4: "PIZ", 5: "PXR24", 6: "B44",
                   7: "B44A", 8: "DWAA", 9: "DWAB", 10: "HTJ2K256", 11: "HTJ2K32"}
EXR_PIXEL = {0: "uint", 1: "half", 2: "float"}


def _f(status, check, message, shot=None, source=""):
    return {"check": check, "status": status, "shot": shot, "message": message,
            "source": source}


def summarize(findings):
    """Counts per status and a verdict: fail if any fail, else warn if any warn, else pass."""
    out = {"fail": 0, "warn": 0, "info": 0, "pass": 0}
    for f in findings:
        out[f["status"]] = out.get(f["status"], 0) + 1
    out["verdict"] = "fail" if out["fail"] else ("warn" if out["warn"] else "pass")
    return out


# =========================================================================== time
def _fps(fps):
    """fps as float from 24, 23.976, [24000, 1001] or {"numerator":..,"denominator":..}."""
    if isinstance(fps, dict):
        return fps["numerator"] / float(fps["denominator"])
    if isinstance(fps, (list, tuple)):
        return fps[0] / float(fps[1])
    return float(fps)


def _fps_pair(fps):
    if isinstance(fps, dict):
        return int(fps["numerator"]), int(fps["denominator"])
    if isinstance(fps, (list, tuple)):
        return int(fps[0]), int(fps[1])
    f = float(fps)
    if abs(f - round(f)) < 1e-6:
        return int(round(f)), 1
    for n, d in ((24000, 1001), (30000, 1001), (60000, 1001)):
        if abs(f - n / d) < 1e-3:
            return n, d
    return int(round(f * 1000)), 1000


def to_frames(seconds, fps):
    return int(round(seconds * _fps(fps)))


def frames_to_tc(frame, fps):
    """Non-drop timecode HH:MM:SS:FF at the nominal (rounded) rate."""
    nominal = int(round(_fps(fps)))
    sign = "-" if frame < 0 else ""
    frame = abs(int(frame))
    ff = frame % nominal
    s = frame // nominal
    return "%s%02d:%02d:%02d:%02d" % (sign, s // 3600, (s // 60) % 60, s % 60, ff)


def tc_to_frames(tc, fps):
    nominal = int(round(_fps(fps)))
    sign = -1 if tc.startswith("-") else 1
    hh, mm, ss, ff = [int(x) for x in re.split(r"[:;]", tc.lstrip("-"))]
    return sign * (((hh * 60 + mm) * 60 + ss) * nominal + ff)


# =========================================================================== plan
def default_trailer_plan():
    """The U6 example: 30 s, 7 shots, 24 fps, 720 frames (digest "Shot planning" section).

    Subjects: hero at the origin, rival 8 m down +X; every camera of the duel stays on the
    -Y side of the hero-rival line. Lenses and apertures from the digest table [added].
    "production" mirrors the project's versioned defaults (check_production); stingers are
    master frames of music hits meant to land on cuts (check_music_sync); after the board
    review the agent sets "timing_locked" (ready_to_animate) and, after the director's
    approval, "lighting_approved" (ready_for_final_lighting)."""
    return {
        "name": "TRL", "fps": 24, "target_frames": 720, "start_frame": 0,
        "production": {"fps": 24, "start_frame": 0, "bias": "bottom_up",
                       "shot_name": r"^sh\d{2}0$"},
        "shot_count": [6, 8], "root": "/Game/Cinematics/Trailer",
        "map": "/Game/Maps/L_Trailer",
        "filmback": dict(DEFAULT_FILMBACK, crop=2.39),
        "exposure": {"physical": True, "iso": 100, "shutter": 1.0 / 48, "hold": "iso"},
        "subjects": {
            "hero": {"position": [0, 0, 0], "yaw": 0, "height": 180, "eye_height": 160,
                     "class": "/Game/Characters/Hero/BP_Hero.BP_Hero_C"},
            "rival": {"position": [800, 0, 0], "yaw": 180, "height": 185, "eye_height": 165,
                      "class": "/Game/Characters/Rival/BP_Rival.BP_Rival_C"},
        },
        "scenes": [{"name": "duel", "line": ["hero", "rival"]}],
        "audio": [{"sound": "/Game/Audio/MUS_Trailer", "start": 0,
                   "stingers": [120, 288, 456, {"frame": 660, "on_cut": False}]}],
        "render": {"delivery": "graded", "shutter_timing": "frame_center",
                   "resolution": [3840, 1608],
                   "graph": "/Game/Cinematics/Trailer/Render/MRG_TRL_EXR",
                   "review_graph": "/Game/Cinematics/Trailer/Render/MRG_TRL_Review"},
        "shots": [
            {"name": "sh010", "frames": 120, "size": "EWS", "focal": 21, "fstop": 8,
             "lighting": "duel",
             "camera": {"start": [-2500, -3000, 800], "end": [-2300, -2900, 700],
                        "target": [400, 0, 100]},
             "focus": {"target": [400, 0, 100]}, "motion": "slow", "temp_light": False,
             "performers": [{"subject": "hero", "anim": "/Game/Anims/Hero_Idle"},
                            {"subject": "rival", "anim": "/Game/Anims/Rival_Idle"}],
             "flags": ["cloth"], "preroll": 24},
            {"name": "sh020", "frames": 96, "size": "FS", "focal": 35, "fstop": 4,
             "scene": "duel", "lighting_master": True,
             "camera": {"start": [-200, -670, 120], "target": "hero"},
             "focus": {"target": "hero"}, "motion": "normal",
             "performers": [{"subject": "hero", "anim": "/Game/Anims/Hero_Reveal"}],
             "flags": ["cloth"], "preroll": 24},
            {"name": "sh030", "frames": 72, "size": "CU", "focal": 85, "fstop": 2,
             "scene": "duel", "camera": {"start": [150, -210, 160], "target": "hero"},
             "focus": {"target": "hero"}, "motion": "slow",
             "performers": [{"subject": "hero", "anim": "/Game/Anims/Hero_Glare"}]},
            {"name": "sh040", "frames": 120, "size": "WS", "focal": 28, "fstop": 5.6,
             "scene": "duel", "camera": {"start": [400, -1130, 200], "target": [400, 0, 100]},
             "focus": {"target": [400, 0, 120]}, "motion": "fast",
             "performers": [{"subject": "hero", "anim": "/Game/Anims/Hero_Charge"},
                            {"subject": "rival", "anim": "/Game/Anims/Rival_Charge"}],
             "flags": ["cloth", "particles"], "preroll": 48},
            {"name": "sh050", "frames": 48, "size": "INSERT", "focal": 100, "fstop": 4,
             "scene": "duel", "camera": {"start": [70, -80, 110], "target": [30, -20, 100]},
             "focus": {"target": [30, -20, 100]}, "motion": "normal",
             "performers": [{"subject": "hero", "anim": "/Game/Anims/Hero_Grip"}]},
            {"name": "sh060", "frames": 144, "size": "MS", "focal": 50, "fstop": 2.8,
             "scene": "duel",
             "camera": {"start": [650, -480, 150], "end": [950, -480, 150], "target": "rival"},
             "focus": {"target": "rival"}, "motion": "fast",
             "performers": [{"subject": "rival", "anim": "/Game/Anims/Rival_Run",
                             "velocity": [250, 0, 0]}],
             "flags": ["cloth"], "preroll": 24},
            {"name": "sh070", "frames": 120, "size": "CU", "focal": 85, "fstop": 1.8,
             "scene": "duel", "camera": {"start": [120, -230, 165], "target": "hero"},
             "focus": {"target": "hero"}, "motion": "slow",
             "performers": [{"subject": "hero", "anim": "/Game/Anims/Hero_Resolve"}],
             "flags": ["hair", "dof_centric"], "preroll": 24, "accumulation_dof": True},
        ],
    }


def load_plan(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def validate_plan(plan):
    """Structural checks; returns findings (fail on anything the builder cannot use)."""
    out = []
    for key in ("name", "fps", "shots"):
        if key not in plan:
            out.append(_f("fail", "plan.schema", "plan has no '%s'" % key))
    names = set()
    for i, s in enumerate(plan.get("shots", [])):
        n = s.get("name")
        if not n:
            out.append(_f("fail", "plan.schema", "shot %d has no name" % i))
            continue
        if n in names:
            out.append(_f("fail", "plan.schema", "duplicate shot name", n))
        names.add(n)
        if int(s.get("frames", 0)) < 1:
            out.append(_f("fail", "plan.schema", "frames must be >= 1", n))
        if s.get("size") and s["size"] not in SHOT_SIZES:
            out.append(_f("fail", "plan.schema", "unknown size %r (use %s)" % (
                s["size"], ", ".join(SHOT_SIZES)), n))
        if s.get("motion") and s["motion"] not in MOTION_CLASSES:
            out.append(_f("fail", "plan.schema", "unknown motion %r" % s["motion"], n))
        for p in s.get("performers", []):
            if p.get("subject") not in plan.get("subjects", {}):
                out.append(_f("fail", "plan.schema", "performer subject %r not in subjects"
                              % p.get("subject"), n))
    return out


def layout(plan):
    """Master and local ranges per shot. End frames are EXCLUSIVE (tips doc: a 0 to 50 range
    renders 0 to 49). The camera cut starts `preroll` frames before the shot for camera-cut
    warm-up (tips doc, "Starting Motion"; dmrq WARMUPS [-75, 50) example)."""
    start = int(plan.get("start_frame", 0))
    t = int(plan.get("master_start", 0))
    rows = []
    for s in plan["shots"]:
        n = int(s["frames"])
        pre = int(s.get("preroll", 0))
        rows.append({"name": s["name"], "frames": n, "master_start": t, "master_end": t + n,
                     "local_start": start, "local_end": start + n, "preroll": pre,
                     "cut_start": start - pre})
        t += n
    return rows


# =========================================================================== camera math
def _sub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def _len(v):
    return math.sqrt(sum(x * x for x in v))


def look_at(cam, target):
    """(pitch, yaw) in degrees for a camera at `cam` looking at `target` (UE: X forward,
    Y right, Z up; positive pitch looks up; yaw 0 looks down +X)."""
    d = _sub(target, cam)
    yaw = math.degrees(math.atan2(d[1], d[0]))
    pitch = math.degrees(math.atan2(d[2], math.hypot(d[0], d[1])))
    return pitch, yaw


def unwrap_deg(prev, angle):
    """angle moved by 360s to lie within 180 degrees of prev (no spinning camera keys)."""
    while angle - prev > 180.0:
        angle -= 360.0
    while angle - prev < -180.0:
        angle += 360.0
    return angle


def right_vector(yaw_deg):
    """Screen-right in the XY plane for a camera with this yaw (UE: yaw 0 -> +Y)."""
    y = math.radians(yaw_deg)
    return [-math.sin(y), math.cos(y), 0.0]


def _filmback(plan):
    fb = dict(DEFAULT_FILMBACK)
    fb.update(plan.get("filmback") or {})
    return fb


def visible_sensor_height(filmback):
    """Height (mm) of the frame actually seen: the crop (for example 2.39) narrows it."""
    h = float(filmback["sensor_height"])
    crop = filmback.get("crop")
    if crop:
        h = min(h, float(filmback["sensor_width"]) / float(crop))
    return h


def framed_height_m(focal_mm, distance_cm, filmback):
    """Height of the frame (m) at the subject distance: d * visible sensor height / focal."""
    return (distance_cm / 100.0) * visible_sensor_height(filmback) / float(focal_mm)


def classify_size(framed_h_m, subject_height_cm=175.0):
    """Shot size code for a framed height, scaled for the subject's height [added]."""
    k = float(subject_height_cm) / 175.0
    for code, lo, hi in FRAMED_HEIGHT_M:
        if lo * k <= framed_h_m < hi * k:
            return code
    return "EWS"


def coc_for(filmback):
    """Circle of confusion (mm) = sensor diagonal / 1500 [added convention]."""
    return math.hypot(filmback["sensor_width"], filmback["sensor_height"]) / 1500.0


def dof_limits(focal_mm, fstop, focus_cm, coc_mm):
    """Thin-lens depth of field [added standard optics]. Returns cm: near, far (inf possible),
    depth, hyperfocal."""
    f = float(focal_mm)
    s = float(focus_cm) * 10.0
    H = f * f / (float(fstop) * coc_mm) + f
    near = s * (H - f) / (H + s - 2 * f)
    far = float("inf") if s >= H else s * (H - f) / (H - s)
    return {"near": near / 10.0, "far": far / 10.0, "depth": (far - near) / 10.0,
            "hyperfocal": H / 10.0}


def ev100(iso, shutter_s, fstop):
    """EV100 = log2(N^2 / t * 100 / ISO) (exposure doc, Manual Algorithm). Higher = darker."""
    return math.log2(fstop * fstop / shutter_s * 100.0 / iso)


def iso_to_hold(ev, fstop, shutter_s):
    """ISO that keeps EV100 `ev` at this aperture and shutter."""
    return 100.0 * fstop * fstop / shutter_s / (2.0 ** ev)


# =========================================================================== plan geometry
def _subject_point(plan, name, eye=True):
    subj = plan["subjects"][name]
    p = list(subj.get("position", [0, 0, 0]))
    if eye:
        p[2] += float(subj.get("eye_height", 0.0))
    return p


def _resolve_target(plan, target, eye=True):
    if target is None:
        return None
    if isinstance(target, str):
        return _subject_point(plan, target, eye)
    return [float(x) for x in target]


def shot_geometry(plan, shot):
    """Camera start/end, target point, (pitch, yaw) at start/end and focus distance (cm)."""
    cam = shot.get("camera") or {}
    if "start" not in cam:
        return None
    start = [float(x) for x in cam["start"]]
    end = [float(x) for x in cam.get("end") or cam["start"]]
    tgt = _resolve_target(plan, cam.get("target"))
    if tgt is None:
        tgt = [start[0] + 100.0, start[1], start[2]]
    p0, y0 = look_at(start, tgt)
    p1, y1 = look_at(end, tgt)
    y1 = unwrap_deg(y0, y1)
    focus = shot.get("focus") or {}
    fpt = _resolve_target(plan, focus.get("target"))
    fdist0 = float(focus["distance"]) if "distance" in focus else (
        _len(_sub(fpt, start)) if fpt else None)
    fdist1 = float(focus.get("distance_end", fdist0)) if "distance" in focus else (
        _len(_sub(fpt, end)) if fpt else None)
    return {"start": start, "end": end, "target": tgt, "rot_start": (p0, y0),
            "rot_end": (p1, y1), "subject_distance": _len(_sub(tgt, start)),
            "focus_start": fdist0, "focus_end": fdist1}


# =========================================================================== checks
def check_lengths(plan):
    out = []
    fps = _fps(plan["fps"])
    total = sum(int(s["frames"]) for s in plan["shots"])
    tgt = plan.get("target_frames")
    if tgt is not None:
        st = "pass" if total == int(tgt) else "fail"
        out.append(_f(st, "lengths.total", "shots sum to %d frames, target %d (%.2f s at %g fps)"
                      % (total, int(tgt), total / fps, fps), source="plan"))
    rng = plan.get("shot_count")
    if rng and not (rng[0] <= len(plan["shots"]) <= rng[1]):
        out.append(_f("fail", "lengths.count", "%d shots, brief asks %d to %d"
                      % (len(plan["shots"]), rng[0], rng[1])))
    min_f = int(plan.get("min_shot_frames", round(0.5 * fps)))   # [added]
    max_f = int(plan.get("max_shot_frames", round(8 * fps)))     # [added] trailer pacing
    for s in plan["shots"]:
        n = int(s["frames"])
        if n < min_f:
            out.append(_f("warn", "lengths.short", "%d frames (%.2f s): flash cut, confirm intent"
                          % (n, n / fps), s["name"], "[added]"))
        if n > max_f:
            out.append(_f("warn", "lengths.long", "%d frames (%.1f s): long for a trailer"
                          % (n, n / fps), s["name"], "[added]"))
        if not re.match(r"^[A-Za-z]*\d*0$", s["name"]):
            out.append(_f("info", "lengths.naming", "shot numbers in steps of 10 leave room to "
                          "insert shots (sh010, sh020)", s["name"], "SI [00:33:32]"))
    return out


def check_lenses(plan):
    out = []
    for s in plan["shots"]:
        size = s.get("size")
        if not size or "focal" not in s:
            continue
        r = SHOT_SIZES[size]
        lo, hi = r["focal"]
        if not lo <= float(s["focal"]) <= hi:
            out.append(_f("warn", "lens.focal", "%s at %g mm; the usual range is %g to %g mm "
                          "(a longer lens feels tighter, a wide lens on a face distorts)"
                          % (size, s["focal"], lo, hi), s["name"], "digest table [added]; JT [00:13:38]"))
        if "fstop" in s:
            flo, fhi = r["fstop"]
            if not flo <= float(s["fstop"]) <= fhi:
                out.append(_f("info", "lens.fstop", "%s at f/%g; usual f/%g to f/%g"
                              % (size, s["fstop"], flo, fhi), s["name"], "digest table [added]"))
    for s in plan["shots"]:
        if float(s.get("focal", 0)) >= LONG_LENS_MM or float(s.get("focal_end", 0)) >= LONG_LENS_MM:
            out.append(_f("info", "lens.lod", "long lens (%g mm): keep Use Field of View for LOD "
                          "on the camera so zoomed-in distant meshes get correct LODs (the "
                          "builder sets it)" % max(float(s.get("focal", 0)),
                                                   float(s.get("focal_end", 0))),
                          s["name"], "cam doc (Camera Options)"))
    return out


def check_framing(plan):
    """Does the labelled shot size match what the lens frames at the planned distance?"""
    out = []
    fb = _filmback(plan)
    for s in plan["shots"]:
        size = s.get("size")
        g = shot_geometry(plan, s)
        if not size or size == "INSERT" or g is None or "focal" not in s:
            continue
        tgt = (s.get("camera") or {}).get("target")
        subj_h = plan["subjects"][tgt].get("height", 175) if isinstance(tgt, str) else 175
        h = framed_height_m(s["focal"], g["subject_distance"], fb)
        got = classify_size(h, subj_h)
        gap = abs(SIZE_ORDER.index(got) - SIZE_ORDER.index(size))
        msg = "labelled %s, frames %.2f m at %.1f m with %g mm (reads as %s)" % (
            size, h, g["subject_distance"] / 100.0, s["focal"], got)
        out.append(_f("warn" if gap > 1 else ("info" if gap == 1 else "pass"),
                      "framing.size", msg, s["name"], "[added] framed-height table"))
    return out


def _scene(plan, name):
    for sc in plan.get("scenes", []):
        if sc["name"] == name:
            return sc
    return None


def _screen_order(plan, shot, a_pt, b_pt, which="start"):
    """+1 if B appears right of A on screen, -1 if left, 0 if the camera is on the line."""
    g = shot_geometry(plan, shot)
    if g is None:
        return None
    cam = g["start"] if which == "start" else g["end"]
    _, yaw = g["rot_start"] if which == "start" else g["rot_end"]
    ab = _sub(b_pt, a_pt)
    r = right_vector(yaw)
    s = ab[0] * r[0] + ab[1] * r[1]
    lab = math.hypot(ab[0], ab[1]) or 1.0
    # on the line when the camera sits within 10% of the A-B distance of the line's axis
    ac = _sub(cam, a_pt)
    cross = abs(ab[0] * ac[1] - ab[1] * ac[0]) / lab
    if cross < 0.1 * lab:  # [added] deadband
        return 0
    return 1 if s > 0 else -1


def check_180(plan):
    """180-degree rule per scene: every shot that shows the A-B pair keeps A and B on the same
    screen sides. A shot on the line (neutral) or a camera move that crosses the line in shot
    re-establishes the side; a cut across it fails unless the shot states "crosses_line"
    [added: standard continuity grammar]. Shots without both subjects (inserts) are skipped."""
    out = []
    for sc in plan.get("scenes", []):
        a, b = sc["line"]
        a_pt, b_pt = _subject_point(plan, a, False), _subject_point(plan, b, False)
        established, after_neutral = None, False
        for s in plan["shots"]:
            if s.get("scene") != sc["name"] or s.get("size") == "INSERT":
                continue
            o0 = _screen_order(plan, s, a_pt, b_pt, "start")
            o1 = _screen_order(plan, s, a_pt, b_pt, "end")
            if o0 is None:
                out.append(_f("warn", "continuity.180", "no planned camera position", s["name"]))
                continue
            if o0 == 0:
                out.append(_f("info", "continuity.180", "camera on the %s-%s line: neutral shot, "
                              "the next shot may establish either side" % (a, b), s["name"]))
                established, after_neutral = None, True
                continue
            left, right = (a, b) if o0 > 0 else (b, a)
            if established is None:
                status, msg = "pass", "side established: %s left of %s%s" % (
                    left, right, " (after a neutral shot)" if after_neutral else "")
            elif o0 == established:
                status, msg = "pass", "%s left of %s preserved" % (left, right)
            else:
                reason = s.get("crosses_line")
                status = "warn" if reason else "fail"
                msg = "camera crosses the %s-%s line on the cut: they swap screen sides%s" % (
                    a, b, (" (stated: %s)" % reason) if reason else
                    "; move the camera back across, or cut through a neutral shot on the line "
                    "or an in-shot camera move across it")
            out.append(_f(status, "continuity.180", msg, s["name"], "[added] continuity grammar"))
            established, after_neutral = o0, False
            if o1 == 0:
                out.append(_f("info", "continuity.180", "camera move ends on the line: the next "
                              "shot may establish either side", s["name"]))
                established, after_neutral = None, True
            elif o1 is not None and o1 != o0:
                out.append(_f("info", "continuity.180", "camera move crosses the line in shot "
                              "(the audience sees it happen); new side from here", s["name"]))
                established = o1
    return out


def check_screen_direction(plan):
    """A subject moving across shots keeps its screen direction (left to right stays left to
    right) unless a shot states "crosses_line" [added: continuity grammar]."""
    out = []
    last = {}
    for s in plan["shots"]:
        g = shot_geometry(plan, s)
        if g is None:
            continue
        r = right_vector(g["rot_start"][1])
        for p in s.get("performers", []):
            v = p.get("velocity")
            if not v or math.hypot(v[0], v[1]) < 1e-6:
                continue
            sx = v[0] * r[0] + v[1] * r[1]
            if abs(sx) < 0.2 * math.hypot(v[0], v[1]):  # [added] towards or away from lens
                out.append(_f("info", "continuity.direction", "%s moves towards or away from "
                              "camera: neutral direction" % p["subject"], s["name"]))
                last.pop(p["subject"], None)
                continue
            d = 1 if sx > 0 else -1
            prev = last.get(p["subject"])
            if prev and prev[0] != d and not s.get("crosses_line"):
                out.append(_f("warn", "continuity.direction", "%s moved %s in %s, now %s"
                              % (p["subject"], "right" if prev[0] > 0 else "left", prev[1],
                                 "right" if d > 0 else "left"), s["name"]))
            last[p["subject"]] = (d, s["name"])
    return out


def check_jump_cuts(plan):
    """Consecutive shots of the same size on the same target need at least 30 degrees of
    camera-direction change, or they read as a jump cut [added: the 30-degree rule]."""
    out = []
    prev = None
    for s in plan["shots"]:
        g = shot_geometry(plan, s)
        tgt = (s.get("camera") or {}).get("target")
        if g is None:
            prev = None
            continue
        if prev and prev[0] == s.get("size") and isinstance(tgt, str) and tgt == prev[1]:
            dyaw = abs(unwrap_deg(prev[2], g["rot_start"][1]) - prev[2])
            if dyaw < 30.0:
                out.append(_f("warn", "continuity.jump_cut", "same size (%s) and target as the "
                              "previous shot with %.0f degrees of change" % (s.get("size"), dyaw),
                              s["name"], "[added] 30-degree rule"))
        prev = (s.get("size"), tgt, g["rot_start"][1]) if g else None
    return out


def check_dof(plan):
    out = []
    fb = _filmback(plan)
    coc = coc_for(fb)
    for s in plan["shots"]:
        if "fstop" not in s or "focal" not in s:
            continue
        g = shot_geometry(plan, s)
        focus = s.get("focus")
        if not focus:
            if float(s["fstop"]) < 5.6:
                out.append(_f("fail", "dof.no_focus", "f/%g with no focus plan: set a keyed Manual "
                              "Focus Distance or Tracking focus, never the default distance"
                              % s["fstop"], s["name"], "[added]; cam doc (Focus Method)"))
            continue
        if g is None or g["focus_start"] is None:
            continue
        d = dof_limits(s["focal"], s["fstop"], g["focus_start"], coc)
        depth = d["depth"]
        msg = "focus %.0f cm, sharp %.0f to %s cm (depth %s)" % (
            g["focus_start"], d["near"], "inf" if math.isinf(d["far"]) else "%.0f" % d["far"],
            "inf" if math.isinf(depth) else "%.1f cm" % depth)
        if s.get("size") in ("CU", "ECU", "MCU") and depth < 4.0:
            out.append(_f("warn", "dof.thin", msg + ": only one eye can be sharp; focus the near "
                          "eye (tracking offset or keyed distance)", s["name"], "[added] optics"))
        else:
            out.append(_f("info", "dof.depth", msg, s["name"], "[added] optics"))
        dof_shot = any(fl in s.get("flags", []) for fl in DOF_FLAGS)
        if s.get("accumulation_dof") and not dof_shot:
            out.append(_f("warn", "dof.accumulation", "Accumulation DOF on a shot that is not "
                          "DOF-centric: render cost grows linearly with its samples", s["name"],
                          "VP [00:36:56]; 5.8 notes"))
        elif dof_shot and float(s["fstop"]) <= 2.8 and not s.get("accumulation_dof"):
            out.append(_f("info", "dof.accumulation", "DOF-centric shot (%s) at f/%g: real-time "
                          "DOF breaks on hair, fences and foreground occluders; consider "
                          "Accumulation DOF (5.8, experimental)" % (
                              ",".join(f for f in s.get("flags", []) if f in DOF_FLAGS), s["fstop"]),
                          s["name"], "VP [00:36:19]; BLUR [00:30:04]"))
    return out


def check_preroll(plan):
    out = []
    for s in plan["shots"]:
        flags = [f for f in s.get("flags", []) if f in SIM_FLAGS]
        if not flags:
            continue
        pre = int(s.get("preroll", 0))
        moving = s.get("motion", "normal") not in ("static",)
        if moving and pre < PREROLL_MIN:
            out.append(_f("fail", "warmup.preroll", "%s with motion at shot start needs animation "
                          "and camera cut extended >= %d frames before the start (camera-cut "
                          "warm-up); Engine Warm Up only holds frame one" % ("/".join(flags),
                                                                               PREROLL_MIN),
                          s["name"], "tips doc (Starting Motion); dmrq WARMUPS"))
        elif not moving and pre == 0:
            out.append(_f("info", "warmup.engine", "idle %s: Engine Warm Up Count > %d frames "
                          "is enough" % ("/".join(flags), ENGINE_WARMUP_IDLE_SIM), s["name"],
                          "tips doc (No Starting Motion)"))
        else:
            out.append(_f("pass", "warmup.preroll", "%d frames of pre-roll for %s" % (
                pre, "/".join(flags)), s["name"]))
        if "particles" in flags:
            out.append(_f("info", "warmup.gpu", "GPU particles also need Render Warm Up Frames "
                          "(render during engine warm-up)", s["name"], "tips doc (Particles)"))
    return out


def _exposure_ref(plan, shot):
    """(EV100, shot name, fstop) of the first shot with an aperture in the same scene."""
    exp = plan.get("exposure") or {}
    iso, sh = float(exp.get("iso", 100)), float(exp.get("shutter", 1.0 / 48))
    key = shot.get("scene") or "_all"
    for s in plan["shots"]:
        if (s.get("scene") or "_all") == key and "fstop" in s:
            return ev100(iso, sh, float(s["fstop"])), s["name"], float(s["fstop"])
    return None


def exposure_iso(plan, shot):
    """ISO that holds the scene's EV100 for this shot's aperture, when the plan holds exposure
    with ISO under physical camera exposure; else None."""
    exp = plan.get("exposure") or {}
    if not exp.get("physical") or exp.get("hold") != "iso" or "fstop" not in shot:
        return None
    ref = _exposure_ref(plan, shot)
    return iso_to_hold(ref[0], float(shot["fstop"]), float(exp.get("shutter", 1.0 / 48)))


def check_exposure(plan):
    """Physical camera exposure: the aperture chosen for DOF also changes exposure. Report the
    ISO that holds each scene's EV, or warn when nothing compensates."""
    exp = plan.get("exposure") or {}
    if not exp.get("physical"):
        return []
    out = []
    iso, sh = float(exp.get("iso", 100)), float(exp.get("shutter", 1.0 / 48))
    ref = {}
    for s in plan["shots"]:
        if "fstop" not in s:
            continue
        key = s.get("scene") or "_all"
        ev = ev100(iso, sh, float(s["fstop"]))
        if key not in ref:
            ref[key] = _exposure_ref(plan, s)
            continue
        d = ev - ref[key][0]
        if abs(d) <= 1.0 / 3.0:
            continue
        need = iso_to_hold(ref[key][0], float(s["fstop"]), sh)
        if exp.get("hold") == "iso":
            out.append(_f("info", "exposure.hold", "f/%g vs f/%g in %s: ISO %.0f holds EV100 "
                          "%.2f" % (s["fstop"], ref[key][2], ref[key][1], need, ref[key][0]),
                          s["name"], "exposure doc (Manual Algorithm)"))
        elif exp.get("hold") == "no_simulation":
            out.append(_f("info", "exposure.hold", "CineCamera exposure simulation off (5.7 "
                          "ExposureMethod): aperture only drives DOF", s["name"], "5.7 notes"))
        else:
            out.append(_f("warn", "exposure.jump", "f/%g vs f/%g in %s: %+.1f stops brighter "
                          "under Apply Physical Camera Exposure; set ISO %.0f, or disable the "
                          "camera's exposure simulation (5.7+)" % (
                              s["fstop"], ref[key][2], ref[key][1], -d, need), s["name"],
                          "exposure doc (Manual Algorithm); 5.7 notes"))
    return out


# =========================================================================== production, cast, timing, lighting
def check_production(plan):
    """Production defaults are set ONCE per project and versioned (SI [00:15:22] [00:21:52]):
    display rate, start frame, hierarchical bias, asset naming, folder template, written to
    Config/DefaultEngine.ini (CAT Production Setup, or Project Settings) under revision
    control. plan["production"] mirrors that record ({"fps", "start_frame", "bias",
    "shot_name" regex}); a plan that disagrees with it fails."""
    out = []
    prod = plan.get("production")
    if not prod:
        return [_f("info", "production.record", "no production record: set display rate, start "
                   "frame, hierarchical bias, naming and folder template once for the project "
                   "(DefaultEngine.ini under revision control) and copy them into "
                   "plan['production']", source="SI [00:15:22] [00:21:52]")]
    if "fps" in prod and _fps_pair(prod["fps"]) != _fps_pair(plan["fps"]):
        out.append(_f("fail", "production.rate", "plan at %s fps, the production is %s fps: one "
                      "rate per show" % (plan["fps"], prod["fps"]), source="SI [00:21:52]"))
    if "start_frame" in prod and int(prod["start_frame"]) != int(plan.get("start_frame", 0)):
        out.append(_f("fail", "production.start", "plan starts shots at %d, the production at "
                      "%d" % (int(plan.get("start_frame", 0)), int(prod["start_frame"])),
                      source="SI [00:15:22]; SPI [00:05:52]"))
    bias = prod.get("bias", "bottom_up")
    if bias not in ("bottom_up", "top_down"):
        out.append(_f("fail", "production.bias", "bias %r: use bottom_up (default, the child "
                      "wins) or top_down" % bias, source="SI [00:17:30]"))
    elif bias == "top_down":
        out.append(_f("info", "production.bias", "top-down production: audit with "
                      "audit_sequence(..., bias_policy='top_down')", source="SI [00:17:30]"))
    rx = prod.get("shot_name")
    if rx:
        bad = [s["name"] for s in plan["shots"] if not re.match(rx, s["name"])]
        if bad:
            out.append(_f("warn", "production.naming", "%s do not match %r: CAT names are only "
                          "guidelines, so enforce them in the plan" % (", ".join(bad), rx),
                          source="SI [00:19:42]"))
    if not out:
        out.append(_f("pass", "production.record", "plan matches the production record"))
    return out


def check_characters(plan):
    """Cast cost and wiring, from the subjects the shots use: joints under 200 (GLITCH
    [00:05:33]); several skeletal meshes need Set Leader Pose Component in the construction
    script so one animation track on the main mesh drives them all (GLITCH [00:18:46])."""
    out = []
    used = []
    for s in plan["shots"]:
        for p in s.get("performers", []):
            if p["subject"] not in used:
                used.append(p["subject"])
    for name in used:
        subj = plan.get("subjects", {}).get(name, {})
        j = subj.get("joints")
        if j is not None and int(j) >= MAX_JOINTS:
            out.append(_f("warn", "character.joints", "%s has %d joints: keep characters under "
                          "%d (faces through materials, blend shapes, lattices)" % (
                              name, int(j), MAX_JOINTS), None, "GLITCH [00:05:33] [00:09:17]"))
        n = int(subj.get("skeletal_meshes", 1))
        if n > 1 and not subj.get("leader_pose"):
            out.append(_f("warn", "character.leader_pose", "%s has %d skeletal meshes and no "
                          "leader pose: Set Leader Pose Component in the Blueprint construction "
                          "script, or the meshes the animation track is not bound to do not "
                          "follow it [added consequence]" % (name, n), None,
                          "GLITCH [00:18:46]"))
    return out


def cut_frames(plan):
    """Master frames where a cut happens (first frame of every shot after the first)."""
    return [r["master_start"] for r in layout(plan)][1:]


def check_music_sync(plan):
    """Stingers land on cuts: "try moving them to start exactly on the cut" (JT [00:04:55]).
    plan["audio"][i]["stingers"]: master frames of the hits, or {"frame": f, "on_cut": False}
    for a hit meant to land inside a shot."""
    out = []
    cuts = cut_frames(plan)
    if not cuts:
        return out
    for a in plan.get("audio", []):
        for st in a.get("stingers", []):
            fr, on_cut = (st, True) if isinstance(st, (int, float)) else (
                st["frame"], st.get("on_cut", True))
            if not on_cut:
                continue
            fr = int(fr)
            near = min(cuts, key=lambda c: abs(c - fr))
            if fr == near:
                out.append(_f("pass", "timing.stinger", "stinger on the cut at %d" % fr))
            else:
                shot = [r["name"] for r in layout(plan) if r["master_start"] == near][0]
                out.append(_f("warn", "timing.stinger", "stinger at %d is %+d frames from the cut "
                              "at %d: move the stinger or the cut so they coincide" % (
                                  fr, fr - near, near), shot, "JT [00:04:55]"))
    return out


def ready_to_animate(plan):
    """Gate before performance and camera polish: the board is cut against the music and the
    shot lengths are locked (plan["timing_locked"]), because "you don't want to spend time
    working on frames that will never make it into the final film" (JT [00:15:36])."""
    out = []
    if not plan.get("audio"):
        out.append(_f("fail", "timing.no_audio", "no music or temp track: timing cannot be "
                      "locked without audio (\"You don't really have a first draft of your film "
                      "until you have video and audio together.\")", source="JT [00:15:36]"))
    if not plan.get("timing_locked"):
        out.append(_f("fail", "timing.unlocked", "board with constant keys against the music, "
                      "retime, then set plan['timing_locked'] = true before animating",
                      source="JT [00:15:04] [00:15:36]"))
    out += [f for f in check_music_sync(plan) if f["status"] != "pass"]
    out += [f for f in check_lengths(plan) if f["status"] == "fail"]
    if not out:
        out.append(_f("pass", "timing.locked", "timing locked against the music"))
    return out


def lighting_masters(plan):
    """Glitch's master lighting method (GLITCH [00:28:51] [00:29:23]): group shots by lighting
    scenario (shot "lighting", else its scene), light ONE signature shot per scenario (the
    shot marked "lighting_master", else the longest [added]), get it approved by the director
    (plan["lighting_approved"]), then derive every other shot from its master."""
    groups, order = {}, []
    for s in plan["shots"]:
        key = s.get("lighting") or s.get("scene") or "_all"
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(s)
    approved = set(plan.get("lighting_approved", []))
    out = []
    for key in order:
        shots = groups[key]
        marked = [s for s in shots if s.get("lighting_master")]
        m = marked[0] if marked else max(shots, key=lambda s: int(s["frames"]))
        out.append({"scenario": key, "master": m["name"], "proposed": not marked,
                    "shots": [s["name"] for s in shots], "approved": m["name"] in approved})
    return out


def check_lighting(plan):
    out = []
    ms = lighting_masters(plan)
    out.append(_f("info", "lighting.masters", "%d lighting scenario(s): %s. Budget reference: "
                  "10 to 13 masters per 400-shot episode, 1 to 2 days each" % (len(ms), "; ".join(
                      "%s master %s%s" % (m["scenario"], m["master"],
                                          " (proposed: longest shot)" if m["proposed"] else "")
                      for m in ms)), source="GLITCH [00:28:51]"))
    if len(ms) == len(plan["shots"]) and len(ms) > 2:
        out.append(_f("warn", "lighting.scope", "every shot is its own lighting scenario: no "
                      "master can lock decisions; group shots by look (map, time of day, key "
                      "direction) [added]", source="GLITCH [00:28:51] (\"70 different lighting "
                      "scenarios, this is definitely out of scope\")"))
    return out


def ready_for_final_lighting(plan):
    """Gate before per-shot lighting: every scenario's master is approved. Approval locks the
    creative decision; lighting shot by shot without masters brings late creative changes
    with "massive repercussions" (GLITCH [00:29:23])."""
    out = []
    for m in lighting_masters(plan):
        if not m["approved"]:
            out.append(_f("fail", "lighting.unapproved", "light and render master %s for '%s' "
                          "first (render_jobs(plan, only=[%r])), get the director's approval, "
                          "record it in plan['lighting_approved']" % (
                              m["master"], m["scenario"], m["master"]), m["master"],
                          "GLITCH [00:29:23]"))
    if not out:
        out.append(_f("pass", "lighting.approved", "every lighting scenario has an approved "
                      "master"))
    return out


def check_plan(plan):
    """All offline checks. Run before building anything; fix every fail."""
    out = validate_plan(plan)
    if any(f["status"] == "fail" for f in out):
        return out
    for fn in (check_production, check_lengths, check_lenses, check_framing, check_180,
               check_screen_direction, check_jump_cuts, check_dof, check_preroll, check_exposure,
               check_characters, check_music_sync, check_lighting):
        out.extend(fn(plan))
    return out


# =========================================================================== render policy
def render_policy(shot, plan):
    """Per-shot values for the template graph's exposed variables."""
    r = plan.get("render") or {}
    timing = r.get("shutter_timing", "frame_center")
    motion = shot.get("motion", "normal")
    ts = TEMPORAL_SAMPLES[timing][motion]
    ts = int(shot.get("temporal_samples", ts))
    pre = int(shot.get("preroll", 0))
    return {"TemporalSamples": ts,
            "WarmUpFrames": pre if pre > 0 else None,   # None: keep the graph default
            "UseCameraCutWarmUp": pre > 0,
            "AccumulationDOF": bool(shot.get("accumulation_dof"))}


def render_jobs(plan, graph=None, per_shot=True, var_names=None, sequences=None, only=None):
    """Job specs for queue_render_jobs(). One job per shot sequence: the shot is the smallest
    distributable unit (mrq-cli, "Using Command Line Rendering"). Fades and master-level
    tracks do not render this way: fades belong to the edit [added]. sequences: {shot: asset
    path} of the ACTIVE takes, from active_shot_paths(master, plan) in the editor; without it
    the plan's naming convention is assumed (wrong after a new take). only: shot names to
    render (lighting masters for approval, shots_to_render() after a crash)."""
    r = plan.get("render") or {}
    graph = graph or r.get("graph")
    names = dict(zip(TEMPLATE_VARIABLES, TEMPLATE_VARIABLES))
    names.update(var_names or {})
    root = plan.get("root", "/Game/Cinematics/%s" % plan["name"])
    jobs = []
    if not per_shot:
        return [{"job_name": "%s_master" % plan["name"], "graph": graph,
                 "sequence": "%s/%s_Master" % (root, plan["name"]), "map": plan.get("map"),
                 "variables": {}}]
    for s in plan["shots"]:
        if only is not None and s["name"] not in only:
            continue
        pol = render_policy(s, plan)
        variables = {names[k]: v for k, v in pol.items() if v is not None and k in names}
        seq = (sequences or {}).get(s["name"]) or shot_asset_path(plan, s["name"])
        jobs.append({"job_name": "%s_%s" % (plan["name"], s["name"]), "graph": graph,
                     "sequence": seq, "map": plan.get("map"), "shot": s["name"],
                     "sequence_name": seq.rsplit("/", 1)[-1].split(".")[0],
                     "variables": variables})
    return jobs


def shot_asset_path(plan, shot_name):
    root = plan.get("root", "/Game/Cinematics/%s" % plan["name"])
    return "%s/Shots/%s/%s_%s" % (root, shot_name, plan["name"], shot_name)


def audit_render_settings(s):
    """Rules for a sequence render, from a settings dict (declared, or from
    normalize_graph_snapshot). Keys: renderer ('deferred'|'path_traced'), temporal_samples,
    spatial_samples, shutter_timing, aa_method ('tsr'|'taa'|'none'|...), aa_reason,
    delivery ('graded'|'direct'), tone_curve_disabled, ocio (None or target space),
    ocio_required, output_format, bit_depth, compression, warmup_frames,
    camera_cut_warmup, preroll_frames, game_overrides_connected, use_lod_zero,
    foliage_heavy, cvars ({name: reason}), motion_blur_amount, reference_motion_blur."""
    out = []
    ts = int(s.get("temporal_samples", 1))
    ss = int(s.get("spatial_samples", 1))
    rend = s.get("renderer", "deferred")
    timing = s.get("shutter_timing", "frame_center")
    if rend == "deferred":
        if ts > 1 and ss > 1:
            out.append(_f("fail", "samples.mixed", "temporal %d x spatial %d on the deferred "
                          "path: use all temporal (motion blur) or all spatial (none)" % (ts, ss),
                          source="dmrq (Temporal Sample Count); WF fVg5ihB8Wdc [00:04:58]"))
        n = max(ts, ss)
        if n > 1:
            want_odd = timing == "frame_center"
            if (n % 2 == 1) != want_odd:
                out.append(_f("warn", "samples.parity", "%d samples with %s shutter timing: %s"
                              % (n, timing, "odd counts put one sample on the keyframe" if want_odd
                                 else "Blur renders 24 (even) with Frame Close"),
                              source="dmrq; WF [00:06:01]; BLUR [00:39:32]"))
        total = ts * ss
        aa = (s.get("aa_method") or "tsr").lower()
        if total > 8 and aa != "none" and not s.get("aa_reason"):
            out.append(_f("warn", "aa.method", "%d total samples with %s: set Anti-Aliasing "
                          "None above 8 samples, or write why %s stays (features that need "
                          "history)" % (total, aa.upper(), aa.upper()),
                          source="mrg doc (Anti-Aliasing); WF [00:10:58]; dmrq"))
    else:
        if ts > 1 and ss > 1:
            out.append(_f("warn", "pt.samples", "path-traced animation: 1 spatial and many "
                          "temporal with Reference Motion Blur", source="path tracer doc (MRQ)"))
        if ts > 1 and not s.get("reference_motion_blur"):
            out.append(_f("warn", "pt.refmb", "path-traced sequence without Reference Motion "
                          "Blur", source="path tracer doc (MRQ)"))
    delivery = s.get("delivery", "graded")
    fmt = (s.get("output_format") or "exr").lower()
    if delivery == "graded":
        if fmt != "exr":
            out.append(_f("fail", "output.format", "graded delivery rendered to %s: render EXR"
                          % fmt, source="WF 2Q3CybANHKE [00:01:21]"))
        if not s.get("tone_curve_disabled") and not s.get("ocio"):
            out.append(_f("fail", "color.tone_curve", "graded delivery with the tone curve on: "
                          "the EXR is neither linear nor ACES; Disable Tone Curve",
                          source="WF 2Q3CybANHKE [00:04:31]"))
        if s.get("ocio") and not s.get("ocio_required"):
            out.append(_f("info", "color.ocio", "OCIO to %s at render time: only needed when a "
                          "vendor requires ACEScg EXRs; linear sRGB converts identically in the "
                          "grade" % s["ocio"], source="WF 2Q3CybANHKE [00:02:27] [00:09:05]"))
        if fmt == "exr" and int(s.get("bit_depth", 16)) < 16:
            out.append(_f("fail", "output.depth", "EXR below 16 bit", source="WF [00:01:37]"))
    if s.get("camera_cut_warmup") and int(s.get("preroll_frames", 0)) <= 0:
        out.append(_f("fail", "warmup.cut", "camera-cut warm-up on but the camera cut does not "
                      "start before the shot: nothing to evaluate", source="dmrq WARMUPS"))
    if ts > 1 and int(s.get("preroll_frames", 0)) < 1 and not s.get("anim_extended"):
        out.append(_f("warn", "warmup.section", "temporal samples evaluate one frame before the "
                      "start: extend animation and audio sections by hand (they do not "
                      "auto-expand)", source="mrg doc (Anti-Aliasing)"))
    if s.get("use_lod_zero") and s.get("foliage_heavy"):
        out.append(_f("warn", "overrides.lod0", "Use LODZero in a foliage-heavy shot: when "
                      "foliage.MaxTrianglesToRender (100,000,000) is hit NO foliage renders; "
                      "raise foliage.LODDistanceScale instead", source="mrg doc (Game Overrides)"))
    if s.get("game_overrides_connected") is False:
        out.append(_f("info", "overrides.node", "Global Game Overrides disconnected: its "
                      "cinematic quality no longer applies (MRG acts only while connected)",
                      source="mrq-cli (Game Overrides)"))
    for name, reason in sorted((s.get("cvars") or {}).items()):
        if not reason:
            out.append(_f("warn", "cvars.reason", "%s has no written reason: start from zero "
                          "cvars, add one per named shot problem" % name,
                          source="WF fVg5ihB8Wdc [00:03:00]; dmrq CVARS"))
    mba = s.get("motion_blur_amount")
    if mba is not None and float(mba) == 0.0 and ts > 1:
        out.append(_f("warn", "blur.off", "Motion Blur Amount 0 with temporal samples: use "
                      "spatial samples for no-blur frames", source="WF fVg5ihB8Wdc [00:08:32]"))
    if not out:
        out.append(_f("pass", "render.settings", "no rule broken"))
    return out


def normalize_graph_snapshot(snapshot):
    """Map graph_snapshot() output (nodes with class names and editor properties) to the
    settings dict of audit_render_settings. Heuristic on property names [verify each name in
    5.8; extend the tables when the probe lists the real ones]."""
    s = {"cvars": {}, "renderer": None}
    for node in snapshot.get("nodes", []):
        cls = node.get("class", "")
        p = node.get("properties", {})
        low = {k.lower(): v for k, v in p.items()}
        if "PathTrac" in cls:
            s["renderer"] = "path_traced"
        elif "Deferred" in cls and s["renderer"] is None:
            s["renderer"] = "deferred"
        if "GameOverride" in cls:
            s["game_overrides_connected"] = True
        if "EXR" in cls or "Exr" in cls:
            s["output_format"] = "exr"
        elif re.search(r"PNG|JPG|BMP", cls):
            s.setdefault("output_format", "png")
        for k, v in low.items():
            if "temporal_sample" in k:
                s["temporal_samples"] = int(v)
            elif "spatial_sample" in k:
                s["spatial_samples"] = int(v)
            elif k.endswith("anti_aliasing_method"):
                s["aa_method"] = str(v).split(".")[-1].replace("AAM_", "").lower()
            elif "disable_tone_curve" in k:
                s["tone_curve_disabled"] = bool(v)
            elif "shutter_timing" in k:
                s["shutter_timing"] = str(v).split(".")[-1].lower()
            elif "compression" in k:
                s["compression"] = str(v).split(".")[-1].lower()
            elif "use_lod_zero" in k:
                s["use_lod_zero"] = bool(v)
            elif "warm_up" in k and "frame" in k and isinstance(v, (int, float)):
                s["warmup_frames"] = int(v)
            elif "camera_cut" in k and "warm" in k:
                s["camera_cut_warmup"] = bool(v)
            elif "ocio" in k and isinstance(v, bool):
                if v:
                    s["ocio"] = s.get("ocio") or "enabled"
            elif k.endswith("half") or "16_bit" in k or "half_float" in k:
                s["bit_depth"] = 16 if v else 32
        if "CVar" in cls or "ConsoleVariable" in cls:
            name = p.get("name") or p.get("console_variable") or p.get("cvar")
            if name:
                s["cvars"][str(name)] = p.get("reason", "")
    if s["renderer"] is None:
        s["renderer"] = "deferred"
    if s.get("shutter_timing"):
        t = s["shutter_timing"]
        s["shutter_timing"] = ("frame_center" if "center" in t else "frame_close" if "close" in t
                               else "frame_open" if "open" in t else t)
    return s


def _object_path(p):
    """'/Game/A/B' -> '/Game/A/B.B' (soft object path form used on command lines)."""
    if "." in p.rsplit("/", 1)[-1]:
        return p
    return "%s.%s" % (p, p.rsplit("/", 1)[-1])


def mrq_command_line(editor_cmd, uproject, map_path, queue=None, level_sequence=None,
                     config=None, resx=1280, resy=720, extra=()):
    """argv for a command-line render (mrq-cli). Either a saved queue asset (each job on its
    own map and config), or one sequence plus a Primary Config preset. It runs the project in
    -game mode on a real GPU: not -run=pythonscript, never -nullrhi [added]. -resx/-resy set
    the window, the config sets the output resolution [added interpretation].
    -notexturestreaming is always added: every doc example carries it, so first frames do
    not render with low-resolution mips still streaming in (mrq-cli; reason [added])."""
    if bool(queue) == bool(level_sequence):
        raise ValueError("give either queue= or level_sequence= (+ config=)")
    if level_sequence and not config:
        raise ValueError("level_sequence= needs config= (a Primary Config preset)")
    if any("nullrhi" in str(x).lower() for x in extra):
        raise ValueError("-nullrhi disables rendering")
    cmd = [editor_cmd, uproject, map_path, "-game"]  # map as a package path: /Game/Maps/L_X
    if queue:
        cmd.append("-MoviePipelineConfig=%s" % _object_path(queue))
    else:
        cmd += ["-LevelSequence=%s" % _object_path(level_sequence),
                "-MoviePipelineConfig=%s" % _object_path(config)]
    cmd += ["-windowed", "-resx=%d" % resx, "-resy=%d" % resy, "-log", "-notexturestreaming"]
    cmd += list(extra)
    return cmd


def render_orchestration(specs, unattended=False, farm=None):
    """Findings on how a set of render jobs will run. Plain MRQ needs babysitting and a crash
    loses the shots (GLITCH); an unattended multi-shot render needs a farm manager (Deadline for
    Unreal at Glitch, GLITCH [00:40:14] [verify 5.8 support]) or one command-line process
    per shot plus shots_to_render() to resume. Farm submissions: one job per shot, and
    job.set_consumed(True) on submitted jobs so a second submission skips them (mrq-cli)."""
    out = []
    shots = [sp.get("shot") or sp.get("job_name") for sp in specs]
    dup = sorted({x for x in shots if shots.count(x) > 1})
    if dup:
        out.append(_f("fail", "render.duplicate", "several jobs for %s: one job per shot"
                      % ", ".join(map(str, dup)), source="mrq-cli"))
    if unattended and len(specs) > 1 and not farm:
        out.append(_f("warn", "render.unattended", "%d shots in one unattended local queue: a "
                      "crash loses the rest of the queue. Use a farm manager, or one "
                      "command-line process per shot (mrq_command_line) and shots_to_render() "
                      "to resume" % len(specs), source="GLITCH [00:40:14]; mrq-cli"))
    if farm:
        out.append(_f("info", "render.farm", "%s: one job per shot (never frame ranges inside a "
                      "shot); mark submitted jobs with job.set_consumed(True)" % farm,
                      source="mrq-cli (Using Command Line Rendering; API digest)"))
    if not out:
        out.append(_f("pass", "render.orchestration", "%d job(s), one per shot" % len(specs)))
    return out


# =========================================================================== EXR and output
def parse_exr_header(path):
    """Pure-Python OpenEXR header reader (scanline, tiled, multipart). Returns dict with
    version flags, and per part: channels [(name, type)], compression, data_window,
    display_window, width, height, and every other attribute (strings decoded)."""
    with open(path, "rb") as fh:
        data = fh.read(1 << 20)
    if len(data) < 8 or struct.unpack("<i", data[:4])[0] != 20000630:
        raise ValueError("not an OpenEXR file: %s" % path)
    ver = struct.unpack("<i", data[4:8])[0]
    flags = {"version": ver & 0xFF, "tiled": bool(ver & 0x200), "long_names": bool(ver & 0x400),
             "deep": bool(ver & 0x800), "multipart": bool(ver & 0x1000)}
    pos = 8
    parts = []

    def cstr(p):
        e = data.index(b"\x00", p)
        return data[p:e].decode("latin-1"), e + 1

    while True:
        attrs = {}
        if data[pos:pos + 1] == b"\x00":
            pos += 1
            break
        while True:
            name, pos = cstr(pos)
            if not name:
                break
            typ, pos = cstr(pos)
            size = struct.unpack("<i", data[pos:pos + 4])[0]
            pos += 4
            raw = data[pos:pos + size]
            pos += size
            attrs[name] = _exr_attr(typ, raw)
        parts.append(attrs)
        if not flags["multipart"]:
            break
    out = {"path": path, "flags": flags, "parts": []}
    for a in parts:
        dw = a.get("dataWindow")
        part = {"attributes": a, "channels": a.get("channels", []),
                "compression": a.get("compression"), "data_window": dw,
                "display_window": a.get("displayWindow")}
        if dw:
            part["width"], part["height"] = dw[2] - dw[0] + 1, dw[3] - dw[1] + 1
        out["parts"].append(part)
    first = out["parts"][0] if out["parts"] else {}
    out.update({k: first.get(k) for k in ("channels", "compression", "data_window",
                                          "display_window", "width", "height")})
    return out


def _exr_attr(typ, raw):
    if typ == "chlist":
        chans, p = [], 0
        while p < len(raw) and raw[p:p + 1] != b"\x00":
            e = raw.index(b"\x00", p)
            nm = raw[p:e].decode("latin-1")
            pt = struct.unpack("<i", raw[e + 1:e + 5])[0]
            chans.append((nm, EXR_PIXEL.get(pt, pt)))
            p = e + 1 + 16
        return chans
    if typ == "compression":
        return EXR_COMPRESSION.get(raw[0], raw[0])
    if typ == "box2i":
        return list(struct.unpack("<4i", raw))
    if typ == "box2f":
        return list(struct.unpack("<4f", raw))
    if typ == "v2i":
        return list(struct.unpack("<2i", raw))
    if typ == "v2f":
        return list(struct.unpack("<2f", raw))
    if typ in ("int",):
        return struct.unpack("<i", raw)[0]
    if typ == "float":
        return struct.unpack("<f", raw)[0]
    if typ == "double":
        return struct.unpack("<d", raw)[0]
    if typ == "lineOrder":
        return {0: "INCREASING_Y", 1: "DECREASING_Y", 2: "RANDOM_Y"}.get(raw[0], raw[0])
    if typ == "string":
        return raw.decode("utf-8", "replace")
    if typ == "rational":
        n, d = struct.unpack("<iI", raw)
        return [n, d]
    if typ == "timecode":
        return list(struct.unpack("<II", raw))
    if typ == "stringvector":
        vals, p = [], 0
        while p + 4 <= len(raw):
            n = struct.unpack("<i", raw[p:p + 4])[0]
            vals.append(raw[p + 4:p + 4 + n].decode("utf-8", "replace"))
            p += 4 + n
        return vals
    return {"type": typ, "size": len(raw)}


_NATIVE_FMT = {"gbrpf16le": ("<f2", 3), "gbrapf16le": ("<f2", 4),
               "gbrpf32le": ("<f4", 3), "gbrapf32le": ("<f4", 4)}


def exr_pixels(path, ffmpeg="ffmpeg", layer=None):
    """RGB float32 array (h, w, 3) decoded by ffmpeg's EXR decoder (PIZ, ZIP, DWA...) in its
    NATIVE float format. Never let ffmpeg convert the pixel format: its scaler clamps floats
    to 0..1 and hides values above 1.0 (found by the offline test with ffmpeg 8.0.1). Needs
    numpy, ffmpeg and ffprobe on PATH. layer= picks a layer of a multilayer EXR."""
    import numpy as np
    hdr = parse_exr_header(path)
    w, h = hdr["width"], hdr["height"]
    pre = ["-layer", layer] if layer else []
    probe_ = subprocess.run([ffmpeg.replace("ffmpeg", "ffprobe"), "-v", "error"] + pre +
                            ["-show_entries", "stream=pix_fmt", "-of", "csv=p=0", path],
                            capture_output=True, text=True, check=True).stdout.strip()
    if probe_ not in _NATIVE_FMT:
        raise ValueError("unsupported EXR decode format %r (uint EXR?)" % probe_)
    dt, planes = _NATIVE_FMT[probe_]
    cmd = [ffmpeg, "-v", "error"] + pre + ["-i", path, "-f", "rawvideo", "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype=dt).astype(np.float32)
    if a.size != planes * w * h:
        raise ValueError("ffmpeg returned %d values for %dx%d x %d" % (a.size, w, h, planes))
    a = a.reshape(planes, h, w)
    return np.stack([a[2], a[0], a[1]], axis=-1)  # planes are G, B, R(, A)


def exr_stats(path, rgb=None, ffmpeg="ffmpeg"):
    """Header facts plus pixel statistics: nan, inf, min, max, frac_above_1, frac_black,
    mean_luma, log2_mean (stops, geometric mean luminance), all_black."""
    import numpy as np
    hdr = parse_exr_header(path)
    if rgb is None:
        rgb = exr_pixels(path, ffmpeg)
    finite = np.isfinite(rgb)
    lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    lf = lum[np.isfinite(lum)]
    pos = lf[lf > 0]
    return {"path": path, "width": hdr["width"], "height": hdr["height"],
            "compression": hdr["compression"],
            "pixel_types": sorted(set(t for _, t in hdr["channels"] or [])),
            "channels": [c for c, _ in hdr["channels"] or []],
            "nan": int(np.isnan(rgb).sum()), "inf": int(np.isinf(rgb).sum()),
            "min": float(np.nanmin(np.where(finite, rgb, np.nan))) if finite.any() else None,
            "max": float(np.nanmax(np.where(finite, rgb, np.nan))) if finite.any() else None,
            "frac_above_1": float((lf > 1.0).mean()) if lf.size else 0.0,
            "frac_black": float((lf <= 0.0).mean()) if lf.size else 1.0,
            "mean_luma": float(lf.mean()) if lf.size else 0.0,
            "log2_mean": float(np.log2(pos).mean()) if pos.size else None,
            "all_black": bool(lf.size == 0 or float(lf.max()) <= 0.0)}


def exr_checks(stats, header=None, expect=None):
    """Findings for one EXR against expectations: resolution, half, compression, metadata
    keys, no NaN/Inf, not all black, linear highlights present when tone curve is off."""
    e = dict(expect or {})
    out = []
    name = os.path.basename(stats["path"])
    if e.get("resolution") and [stats["width"], stats["height"]] != list(e["resolution"]):
        out.append(_f("fail", "exr.resolution", "%dx%d, expected %dx%d" % (
            stats["width"], stats["height"], e["resolution"][0], e["resolution"][1]), name))
    if e.get("half", True) and stats["pixel_types"] and stats["pixel_types"] != ["half"]:
        out.append(_f("warn", "exr.depth", "pixel types %s, expected half" % stats["pixel_types"],
                      name, "WF [00:01:37] (16-bit EXR)"))
    if e.get("compression") and stats["compression"] not in e["compression"]:
        out.append(_f("warn", "exr.compression", "%s, expected one of %s" % (
            stats["compression"], e["compression"]), name))
    if stats["nan"] or stats["inf"]:
        out.append(_f("fail", "exr.nan", "%d NaN and %d Inf values" % (stats["nan"], stats["inf"]),
                      name))
    if stats["all_black"]:
        out.append(_f("fail", "exr.black", "all-black frame", name))
    if e.get("linear") and (stats["max"] or 0.0) <= 1.0:
        out.append(_f("warn", "exr.linear", "no value above 1.0: the tone curve may still be on, "
                      "or the shot has no highlights", name, "WF 2Q3CybANHKE [00:04:31]"))
    if header and e.get("metadata"):
        attrs = header["parts"][0]["attributes"] if header.get("parts") else {}
        missing = [k for k in e["metadata"] if not any(k in a for a in attrs)]
        if missing:
            out.append(_f("warn", "exr.metadata", "missing metadata keys %s (Set Metadata "
                          "Attributes node)" % missing, name, "mrg doc"))
    return out


FRAME_RE = re.compile(r"^(?P<base>.*?)[._](?P<frame>-?\d+)\.(?P<ext>exr|png|jpe?g|bmp)$", re.I)


def scan_frames(directory, ext="exr"):
    """{base: {frame: path}} for files like base.0101.exr or base_0101.exr."""
    found = {}
    for p in sorted(glob.glob(os.path.join(directory, "*." + ext))):
        m = FRAME_RE.match(os.path.basename(p))
        if m:
            found.setdefault(m.group("base"), {})[int(m.group("frame"))] = p
    return found


def expected_frames(row, space="local"):
    """Frames a shot render writes (exclusive end): local (shot sequence renders, tokens
    like {frame_number}) or master (master renders)."""
    if space == "master":
        return list(range(row["master_start"], row["master_end"]))
    return list(range(row["local_start"], row["local_end"]))


def check_render_output(plan, root_dir, pattern="{seq}/{seq}.{frame:04d}.exr",
                        space="local", layers=("",), sequences=None):
    """File-level checks per shot: missing, zero-byte and unexpected extra frames. The pattern
    mirrors the graph's output folder and File Name Format (P8 spec: `{sequence_name}/
    {sequence_name}.{frame_number}`, 4-digit padding); fields: {seq} (active sequence name,
    from `sequences` {shot: name or path}, else <prefix>_<shot>), {shot}, {prefix}, {frame},
    {layer} (from `layers`)."""
    out = []
    for row in layout(plan):
        exp = expected_frames(row, space)
        seq = ((sequences or {}).get(row["name"]) or "%s_%s" % (plan["name"], row["name"]))
        seq = seq.rsplit("/", 1)[-1].split(".")[0]
        for layer in layers:
            missing, empty = [], []
            for fr in exp:
                p = os.path.join(root_dir, pattern.format(shot=row["name"], prefix=plan["name"],
                                                          seq=seq, frame=fr, layer=layer))
                if not os.path.isfile(p):
                    missing.append(fr)
                elif os.path.getsize(p) == 0:
                    empty.append(fr)
            sample = os.path.join(root_dir, pattern.format(
                shot=row["name"], prefix=plan["name"], seq=seq, frame=exp[0] if exp else 0,
                layer=layer))
            m = FRAME_RE.match(os.path.basename(sample))
            want_base = m.group("base") if m else None
            ext = os.path.splitext(sample)[1].lstrip(".") or "exr"
            extra = []
            for base, frames in scan_frames(os.path.dirname(sample), ext).items():
                if base == want_base:
                    extra += [f for f in frames if f not in exp]
            tag = row["name"] + ((":" + layer) if layer else "")
            if missing:
                last_only = missing == [exp[-1]] if exp else False
                out.append(_f("fail", "output.missing", "%d missing frames%s: %s" % (
                    len(missing), " (only the last: a render range written as inclusive?)"
                    if last_only else "", _ranges(missing)), tag, "tips doc (exclusive end)"))
            if empty:
                out.append(_f("fail", "output.empty", "zero-byte frames %s" % _ranges(empty), tag))
            if extra:
                out.append(_f("warn", "output.extra", "frames outside the shot range %s (stale "
                              "files from an older version, or pre-roll written as output)"
                              % _ranges(sorted(set(extra))), tag))
            if not (missing or empty):
                out.append(_f("pass", "output.frames", "%d frames" % len(exp), tag))
    return out


def shots_to_render(plan, root_dir, pattern="{seq}/{seq}.{frame:04d}.exr", layers=("",),
                    sequences=None):
    """Shots whose frames are missing or empty, in plan order: the resume list after a crash
    or a killed process. Re-render the WHOLE shot (the shot is the render unit, mrq-cli),
    e.g. render_jobs(plan, only=shots_to_render(...)) into a new version folder."""
    f = check_render_output(plan, root_dir, pattern, "local", layers, sequences)
    bad = {x["shot"].split(":")[0] for x in f if x["check"] in ("output.missing", "output.empty")}
    return [s["name"] for s in plan["shots"] if s["name"] in bad]


def latest_manifests(manifest_dir):
    """Newest manifest per job from cine_render_callbacks (<job>__<YYYYmmdd-HHMMSS>[_n].json):
    check only the render you just made, older lists can hide a missing frame."""
    best = {}
    for p in sorted(glob.glob(os.path.join(manifest_dir, "*.json"))):
        best[os.path.basename(p).rsplit("__", 1)[0]] = p
    return [best[k] for k in sorted(best)]


def check_manifest(plan, manifests, sequences=None):
    """Compare the written-file lists of the graph's Execute Script callback
    (scripts/cine_render_callbacks.py, one JSON per job: {"sequence_name", "files": {layer:
    [paths]}}) with the frames each shot must have (exclusive end), and with the disk: a file
    the render reports but the disk lacks means a sync, disk or overwrite problem."""
    by_seq = {}
    for m in manifests:
        if isinstance(m, str):
            with open(m, "r", encoding="utf-8") as fh:
                m = json.load(fh)
        by_seq.setdefault(m.get("sequence_name"), []).append(m)
    out = []
    for row in layout(plan):
        seq = ((sequences or {}).get(row["name"]) or "%s_%s" % (plan["name"], row["name"]))
        seq = seq.rsplit("/", 1)[-1].split(".")[0]
        ms = by_seq.get(seq)
        if not ms:
            out.append(_f("info", "manifest.none", "no written-file list for %s (not rendered, "
                          "or no Execute Script callback in the graph)" % seq, row["name"]))
            continue
        frames, gone = set(), []
        for m in ms:
            for paths in (m.get("files") or {}).values():
                for p in paths:
                    mm = FRAME_RE.match(os.path.basename(p))
                    if mm:
                        frames.add(int(mm.group("frame")))
                    if not os.path.isfile(p) or os.path.getsize(p) == 0:
                        gone.append(p)
        missing = [fr for fr in expected_frames(row) if fr not in frames]
        if missing:
            out.append(_f("fail", "manifest.missing", "the render did not report frames %s"
                          % _ranges(missing), row["name"], "mrq-cli (Callback Scripts)"))
        if gone:
            out.append(_f("fail", "manifest.gone", "%d file(s) reported written but missing or "
                          "empty on disk, first: %s" % (len(gone), gone[0]), row["name"]))
        if not (missing or gone):
            out.append(_f("pass", "manifest.frames", "%d frames reported and on disk"
                          % len(expected_frames(row)), row["name"]))
    return out


def _ranges(nums):
    nums = sorted(nums)
    if not nums:
        return ""
    parts, a, b = [], nums[0], nums[0]
    for n in nums[1:]:
        if n == b + 1:
            b = n
            continue
        parts.append("%d-%d" % (a, b) if a != b else str(a))
        a = b = n
    parts.append("%d-%d" % (a, b) if a != b else str(a))
    return ",".join(parts)


def small_luma(rgb, size=64):
    """Downsampled log2 luminance (for temporal comparisons that ignore exposure level)."""
    import numpy as np
    lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    lum = np.nan_to_num(lum, nan=0.0, posinf=0.0, neginf=0.0)
    h, w = lum.shape
    sy, sx = max(1, h // size), max(1, w // size)
    lum = lum[:h - h % sy, :w - w % sx].reshape(h // sy, sy, w // sx, sx).mean(axis=(1, 3))
    return np.log2(np.maximum(lum, 1e-4))


def _mad(a, b):
    import numpy as np
    return float(np.abs(a - b).mean())


def first_frame_pop(lumas, ratio=3.0):
    """Warm-up failure detector [added]: the change from frame 0 to 1 is `ratio` times larger
    than the following frame-to-frame changes (particles popping on, cloth settling, TSR
    history). lumas: small_luma() of frames 0..3 of one shot."""
    if len(lumas) < 3:
        return {"pop": False, "reason": "need 3 frames"}
    d01 = _mad(lumas[0], lumas[1])
    later = [_mad(lumas[i], lumas[i + 1]) for i in range(1, len(lumas) - 1)]
    base = max(max(later), 1e-3)
    return {"pop": d01 > ratio * base, "d01": d01, "later": later, "ratio": d01 / base}


def cut_flash(last2, first_next, ratio=0.5):
    """One-frame flash detector at a cut [added]: the last frame of a shot looks more like the
    next shot than like its own previous frame. last2 = [luma(n-2), luma(n-1)]."""
    d_prev = _mad(last2[1], last2[0])
    d_next = _mad(last2[1], first_next)
    return {"flash": d_next < ratio * d_prev and d_prev > 0.05, "d_prev": d_prev,
            "d_next": d_next}


def luminance_continuity(per_shot, max_jump=1.0, intended=()):
    """per_shot: [(shot, log2_mean)]; warn on jumps above max_jump stops between neighbours
    unless the shot is listed as intended [added threshold; lighting continuity is judged
    against the approved master shots, GLITCH [00:32:05]]."""
    out = []
    for (a, la), (b, lb) in zip(per_shot, per_shot[1:]):
        if la is None or lb is None:
            continue
        d = lb - la
        st = "info" if b in intended or abs(d) <= max_jump else "warn"
        out.append(_f(st, "continuity.luma", "%+.2f stops from %s" % (d, a), b,
                      "[added]; GLITCH [00:32:05]"))
    return out


def tonemap_preview(rgb, exposure_stops=0.0):
    """uint8 sRGB review image from linear RGB with an ACES-like filmic fit (Narkowicz)
    [added]. An approximation for composition and exposure review only: the colour decision
    is made through the same OCIO view as the grade (WF 2Q3CybANHKE [00:10:28])."""
    import numpy as np
    x = np.nan_to_num(rgb.astype("float32"), nan=0.0, posinf=64.0) * (2.0 ** exposure_stops)
    x = np.maximum(x * 0.6, 0.0)
    y = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)
    y = np.clip(y, 0.0, 1.0)
    srgb = np.where(y <= 0.0031308, 12.92 * y, 1.055 * np.power(y, 1 / 2.4) - 0.055)
    return (np.clip(srgb, 0, 1) * 255.0 + 0.5).astype("uint8")


def exr_to_png(exr_path, png_path, exposure_stops=0.0, width=None, label=None, ffmpeg="ffmpeg"):
    """Review PNG from a linear EXR (tonemap_preview), optional resize and burned-in label."""
    from PIL import Image, ImageDraw
    img = Image.fromarray(tonemap_preview(exr_pixels(exr_path, ffmpeg), exposure_stops))
    if width and img.width != width:
        img = img.resize((width, max(1, round(img.height * width / img.width))))
    if label:
        d = ImageDraw.Draw(img)
        d.rectangle([0, 0, 8 + 7 * len(label), 16], fill=(0, 0, 0))
        d.text((4, 3), label, fill=(255, 255, 255))
    os.makedirs(os.path.dirname(os.path.abspath(png_path)), exist_ok=True)
    img.save(png_path)
    return png_path


def contact_sheet(items, out_png, cols=3, thumb_w=480):
    """Grid of (image_path, label) thumbnails. Delegates to scenario-unreal-expert's
    ue_review.contact_sheet when it is importable (the shared toolkit); the PIL fallback
    below keeps this module usable on its own. Returns out_png."""
    try:
        import ue_review
        ue_review.contact_sheet([p for p, _ in items], out_png, cols=cols, tile=thumb_w,
                                labels=[lab for _, lab in items])
        return out_png
    except (ImportError, AttributeError):
        pass
    from PIL import Image, ImageDraw
    thumbs = []
    for path, label in items:
        im = Image.open(path).convert("RGB")
        im = im.resize((thumb_w, max(1, round(im.height * thumb_w / im.width))))
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, 8 + 7 * len(label), 16], fill=(0, 0, 0))
        d.text((4, 3), label, fill=(255, 255, 255))
        thumbs.append(im)
    if not thumbs:
        raise ValueError("no images")
    th = max(t.height for t in thumbs)
    rows = (len(thumbs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * thumb_w, rows * th), (32, 32, 32))
    for i, t in enumerate(thumbs):
        sheet.paste(t, ((i % cols) * thumb_w, (i // cols) * th))
    os.makedirs(os.path.dirname(os.path.abspath(out_png)), exist_ok=True)
    sheet.save(out_png)
    return out_png


def review_movie_cmd(png_pattern, fps, out_mp4, start_number=0, audio=None, audio_offset_s=0.0,
                     bitrate_kbps=None, ffmpeg="ffmpeg"):
    """ffmpeg argv: PNG sequence (burned-in labels from exr_to_png) to H.264 MP4 with the
    music muxed. Bitrate default fps x 2 x 1000 kb/s (WF 2Q3CybANHKE [00:22:54]). On macOS
    the MRG H.264 node is Windows only (5.6 notes), so the review movie is encoded here."""
    kbps = int(bitrate_kbps or round(_fps(fps) * 2 * 1000))
    n, d = _fps_pair(fps)
    cmd = [ffmpeg, "-y", "-framerate", "%d/%d" % (n, d), "-start_number", str(start_number),
           "-i", png_pattern]
    if audio:
        if audio_offset_s:
            cmd += ["-itsoffset", "%.3f" % audio_offset_s]
        cmd += ["-i", audio, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-shortest"]
    cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-b:v", "%dk" % kbps,
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", out_mp4]
    return cmd


def edl(plan, record_start="01:00:00:00", clip="{prefix}_{shot}", title=None):
    """CMX 3600 EDL of the cut, one video event per shot [added]. Source in/out are the shot's
    local frames (the EXR frame numbers of shot renders), record in/out the master timeline
    offset by record_start. Out points are exclusive, like Sequencer's end frames."""
    fps = plan["fps"]
    rec0 = tc_to_frames(record_start, fps)
    lines = ["TITLE: %s" % (title or "%s_Master" % plan["name"]), "FCM: NON-DROP FRAME", ""]
    for i, row in enumerate(layout(plan), 1):
        reel = re.sub(r"[^A-Z0-9]", "", row["name"].upper())[:8] or "AX"
        lines.append("%03d  %-8s V     C        %s %s %s %s" % (
            i, reel, frames_to_tc(row["local_start"], fps), frames_to_tc(row["local_end"], fps),
            frames_to_tc(rec0 + row["master_start"], fps),
            frames_to_tc(rec0 + row["master_end"], fps)))
        lines.append("* FROM CLIP NAME: %s" % clip.format(prefix=plan["name"], shot=row["name"]))
    return "\n".join(lines) + "\n"


def color_mode(settings):
    """'tone_curve_on', 'linear_srgb', 'acescg' or 'ocio_other' from render settings (the
    audit_render_settings dict or normalize_graph_snapshot output)."""
    ocio = settings.get("ocio")
    if ocio:
        return "acescg" if "acescg" in str(ocio).lower().replace(" ", "") else "ocio_other"
    return "linear_srgb" if settings.get("tone_curve_disabled") else "tone_curve_on"


def color_handoff(settings):
    """How the colorist must read the EXRs, per render mode (WF 2Q3CybANHKE [00:08:30]
    [00:09:05]), and the viewport setting that shows the same look while lighting (WF
    [00:10:28] [00:11:00]). Without this note a linear EXR read in Resolve looks dark with odd
    colours (WF [00:07:24])."""
    mode = color_mode(settings)
    if mode == "ocio_other":
        rt = {"input": "the destination colour space set on the EXR node's OCIO (read it from "
                       "the graph)", "output": "sRGB"}
    else:
        rt = dict(RESOLVE_INTERPRETATION[mode])
    return {
        "mode": mode, "resolve_aces_transform": rt,
        "expect": ("matches the default viewport; display-referred, UE's tone curve is "
                   "'ACES flavored, but not a true ACES'" if mode == "tone_curve_on" else
                   "about one stop darker than the default viewport: expected, do not "
                   "brighten in Unreal"),
        "log_option": "set the ACES Transform output to a log space to use LUTs (WF [00:11:33])",
        "viewport": ("author the look with the viewport's Lit > OCIO Display: same config, "
                     "source Linear sRGB, the ACES SDR video display view [verify 5.8 view "
                     "name, OCIO 2.5.1 with ACES 2.0]"),
        "source": "WF 2Q3CybANHKE [00:08:30] [00:09:05] [00:09:39] [00:10:28]"}


def delivery_note(plan, settings, sequences=None, record_start="01:00:00:00"):
    """Plain-text note for the editor and colorist: rate, frame ranges (end exclusive), file
    layout, the EDL, and the Resolve interpretation of the render mode (color_handoff)."""
    ch = color_handoff(settings)
    rt = ch["resolve_aces_transform"]
    lines = ["%s delivery note" % plan["name"], "",
             "Frame rate: %s fps. Edit: %s.edl (CMX 3600, record start %s)." % (
                 plan["fps"], plan["name"], record_start),
             "Colour: %s. Resolve, Color page: ACES Transform as the first node, input %s, "
             "output %s." % (ch["mode"], rt["input"], rt["output"]),
             "Expect: %s." % ch["expect"], "", "Shots (local frames, last frame = end - 1):"]
    for row in layout(plan):
        seq = ((sequences or {}).get(row["name"]) or "%s_%s" % (plan["name"], row["name"]))
        seq = seq.rsplit("/", 1)[-1].split(".")[0]
        lines.append("  %s  %s/%s.####.exr  frames %d-%d (%d)" % (
            row["name"], seq, seq, row["local_start"], row["local_end"] - 1, row["frames"]))
    return "\n".join(lines) + "\n"


# =========================================================================== in-editor layer
def _u():
    import unreal  # only inside Unreal (or the test fake)
    return unreal


def _ls():
    u = _u()
    return u.get_editor_subsystem(u.LevelSequenceEditorSubsystem)


@contextlib.contextmanager
def editor_tool(name, steps):
    """ONE undo entry plus a progress dialog around any Sequencer tool: "long running Python
    codes, they look really similar to a frozen engine" (SPI [00:16:16]). Call
    task.enter_progress_frame(1, label) once per item; stop early if task.should_cancel().
        with C.editor_tool("Offset keys", len(bindings)) as task: ..."""
    u = _u()
    with u.ScopedEditorTransaction(name):
        with u.ScopedSlowTask(steps, name) as task:
            task.make_dialog(True)
            yield task


def probe():
    """Which of the names this module uses exist in the running engine. Run first; every
    False is a name to fix before trusting build_from_plan or audit_sequence."""
    u = _u()
    names = ["LevelSequence", "LevelSequenceFactoryNew", "LevelSequenceEditorSubsystem",
             "LevelSequenceEditorBlueprintLibrary", "MovieSceneCinematicShotTrack",
             "MovieSceneSubTrack", "MovieSceneCameraCutTrack", "MovieScene3DTransformTrack",
             "MovieSceneSkeletalAnimationTrack", "MovieSceneFloatTrack", "MovieSceneAudioTrack",
             "MovieSceneFadeTrack", "MovieSceneKeyInterpolation", "MovieSceneTimeUnit",
             "CineCameraActor", "CameraFocusMethod", "SpotLight", "RectLight",
             "ScopedEditorTransaction", "ScopedSlowTask", "MovieSceneSequencePlaybackParams",
             "MoviePipelineQueueSubsystem", "MoviePipelineExecutorJob", "MoviePipelinePIEExecutor",
             "MovieGraphConfig", "MovieGraphScriptBase", "MoviePipelinePrimaryConfig",
             "MoviePipelineQueue", "register_ticker_callback", "register_slate_post_tick_callback",
             "uclass", "ufunction", "Paths"]  # the last three: cine_render_callbacks.py
    rep = {"classes": {n: hasattr(u, n) for n in names}}
    ls = _ls()
    rep["subsystem"] = {m: hasattr(ls, m) for m in (
        "add_spawnable_from_class", "add_spawnable_from_instance", "create_camera",
        "convert_to_spawnable", "save_default_spawnable_state", "get_custom_binding_objects")}
    lsb = u.LevelSequenceEditorBlueprintLibrary
    rep["editor_library"] = {m: hasattr(lsb, m) for m in (
        "open_level_sequence", "set_global_position", "force_update",
        "set_lock_camera_cut_to_viewport", "refresh_current_level_sequence")}
    rep["graph_classes"] = sorted(n for n in dir(u) if n.startswith("MovieGraph"))[:400]
    rep["accumulation_dof"] = sorted(n for n in dir(u) if "Accumulat" in n)
    rep["cat"] = sorted(n for n in dir(u) if "CineAssembly" in n or "NamingToken" in n)
    return rep


def _fr(u, fps):
    n, d = _fps_pair(fps)
    return u.FrameRate(n, d)


def new_sequence(name, package_path, fps, start=None, end=None):
    """Create a Level Sequence at the production rate and range (end exclusive). Refuses to
    overwrite an existing asset: version the root instead (v002)."""
    u = _u()
    full = "%s/%s" % (package_path, name)
    if u.EditorAssetLibrary.does_asset_exist(full):
        raise RuntimeError("%s exists: build into a new version folder, never overwrite" % full)
    tools = u.AssetToolsHelpers.get_asset_tools()
    seq = tools.create_asset(name, package_path, u.LevelSequence, u.LevelSequenceFactoryNew())
    if seq is None:
        raise RuntimeError("create_asset returned None for %s" % full)
    seq.set_display_rate(_fr(u, fps))
    if start is not None:
        seq.set_playback_start(int(start))
        seq.set_playback_end(int(end))
    return seq


def _channels(section):
    """{name: channel} for a section, with index names as fallback."""
    chans = list(section.get_all_channels())  # [verify] 5.8 name
    out = {}
    for i, ch in enumerate(chans):
        try:
            nm = str(ch.get_name())
        except Exception:
            nm = str(i)
        out[nm] = ch
        out.setdefault(str(i), ch)
    return out


TRANSFORM_CHANNELS = ("Location.X", "Location.Y", "Location.Z", "Rotation.X", "Rotation.Y",
                      "Rotation.Z", "Scale.X", "Scale.Y", "Scale.Z")


def key(channel, frame, value, interp="auto"):
    """One key at a display-rate frame. interp: auto | constant | linear."""
    u = _u()
    mode = {"auto": "AUTO", "constant": "CONSTANT", "linear": "LINEAR"}[interp]
    return channel.add_key(u.FrameNumber(int(frame)), value, 0.0,
                           u.MovieSceneTimeUnit.DISPLAY_RATE,
                           getattr(u.MovieSceneKeyInterpolation, mode))  # [verify] signature


def key_transform(binding, keys, section_range):
    """keys: [(frame, (x, y, z), (pitch, yaw, roll))]. Adds a transform track and keys
    location and rotation (Rotation.X roll, .Y pitch, .Z yaw)."""
    u = _u()
    tr = binding.add_track(u.MovieScene3DTransformTrack)
    sec = tr.add_section()
    sec.set_range(int(section_range[0]), int(section_range[1]))
    ch = _channels(sec)
    for frame, loc, rot in keys:
        pitch, yaw, roll = rot
        vals = [loc[0], loc[1], loc[2], roll, pitch, yaw]
        for i, v in enumerate(vals):
            c = ch.get(TRANSFORM_CHANNELS[i]) or ch.get(str(i))
            key(c, frame, float(v))
    return sec


def key_property(binding, prop_name, prop_path, keys, section_range, interp="constant"):
    """Float property track on a component binding (CurrentFocalLength, CurrentAperture,
    FocusSettings.ManualFocusDistance): keys [(frame, value)]."""
    u = _u()
    tr = binding.add_track(u.MovieSceneFloatTrack)
    tr.set_property_name_and_path(prop_name, prop_path)  # [verify]
    sec = tr.add_section()
    sec.set_range(int(section_range[0]), int(section_range[1]))
    ch = list(sec.get_all_channels())[0]
    for frame, v in keys:
        key(ch, frame, float(v), interp)
    return tr


def _load_class(u, path):
    """'/Game/X/BP_Hero.BP_Hero_C' or '/Game/X/BP_Hero' -> Blueprint class; 'SkeletalMeshActor'
    -> unreal.SkeletalMeshActor."""
    if "/" not in path:
        return getattr(u, path)
    asset = path.split(".", 1)[0]
    cls = u.EditorAssetLibrary.load_blueprint_class(asset)
    if cls is None:
        raise RuntimeError("no Blueprint class at %s" % asset)
    return cls


def _folder(seq, name, cache):
    if name in cache:
        return cache[name]
    try:
        cache[name] = seq.add_root_folder_to_sequence(name)
    except Exception:
        cache[name] = None
    return cache[name]


def _in_folder(folder, binding, report):
    if folder is None:
        return
    try:
        folder.add_child_object_binding(binding)  # [verify]
    except Exception as e:
        report["soft"].append("folder: %s" % e)


def add_cine_camera(shot_seq, plan, shot, row, report):
    """Spawnable Cine Camera for one shot (Epic's add_spawnable_from_instance pattern): a
    temporary level camera is configured (filmback, crop, lens, focus), captured as the
    spawnable template, then destroyed; lens values are ALSO keyed on the camera component
    tracks so the shot owns them; transform keyed at first and last frame; a camera cut
    covers pre-roll plus the shot. The UI equivalent, create_camera(spawnable=True), acts on
    the sequence focused in Sequencer and adds the same default tracks (seq-py)."""
    u = _u()
    ls = _ls()
    actors = u.get_editor_subsystem(u.EditorActorSubsystem)
    g = shot_geometry(plan, shot)
    fb = _filmback(plan)
    tmp = actors.spawn_actor_from_class(u.CineCameraActor, u.Vector(*g["start"]),
                                        u.Rotator(pitch=g["rot_start"][0], yaw=g["rot_start"][1],
                                                  roll=0.0))
    cc = tmp.get_cine_camera_component()
    fbs = cc.get_editor_property("filmback")
    fbs.set_editor_property("sensor_width", float(fb["sensor_width"]))
    fbs.set_editor_property("sensor_height", float(fb["sensor_height"]))
    cc.set_editor_property("filmback", fbs)
    cc.set_editor_property("current_focal_length", float(shot["focal"]))
    cc.set_editor_property("current_aperture", float(shot["fstop"]))
    fs = cc.get_editor_property("focus_settings")
    fs.set_editor_property("focus_method", u.CameraFocusMethod.MANUAL)
    if g["focus_start"]:
        fs.set_editor_property("manual_focus_distance", float(g["focus_start"]))
    cc.set_editor_property("focus_settings", fs)
    try:  # zoomed-in far cameras get correct LODs (cam doc, Camera Options) [verify name]
        cc.set_editor_property("use_field_of_view_for_lod", True)
    except Exception as e:
        report["soft"].append("fov lod: %s" % e)
    if fb.get("crop"):
        try:
            crop = cc.get_editor_property("crop_settings")  # [verify] 5.x name
            crop.set_editor_property("aspect_ratio", float(fb["crop"]))
            cc.set_editor_property("crop_settings", crop)
        except Exception as e:
            report["soft"].append("crop: %s" % e)
    iso = exposure_iso(plan, shot)
    if iso is not None:
        try:
            pps = cc.get_editor_property("post_process_settings")
            pps.set_editor_property("override_camera_iso", True)  # [verify]
            pps.set_editor_property("camera_iso", float(iso))
            cc.set_editor_property("post_process_settings", pps)
        except Exception as e:
            report["soft"].append("iso: %s" % e)
    cam_b = ls.add_spawnable_from_instance(shot_seq, tmp)
    cam_b.set_display_name("CAM_%s" % shot["name"])
    comp_b = shot_seq.add_possessable(cc)
    comp_b.set_parent(cam_b)
    actors.destroy_actor(tmp)
    rng = (row["cut_start"], row["local_end"])
    key_property(comp_b, "CurrentFocalLength", "CurrentFocalLength",
                 [(row["local_start"], shot["focal"])] + (
                     [(row["local_end"] - 1, shot["focal_end"])] if shot.get("focal_end") else []),
                 rng, "constant" if not shot.get("focal_end") else "auto")
    key_property(comp_b, "CurrentAperture", "CurrentAperture",
                 [(row["local_start"], shot["fstop"])], rng)
    if g["focus_start"]:
        fk = [(row["local_start"], g["focus_start"])]
        if g["focus_end"] and abs(g["focus_end"] - g["focus_start"]) > 1.0:
            fk.append((row["local_end"] - 1, g["focus_end"]))
        key_property(comp_b, "ManualFocusDistance", "FocusSettings.ManualFocusDistance", fk, rng,
                     "auto" if len(fk) > 1 else "constant")
    p1, y1 = g["rot_end"]
    key_transform(cam_b, [(row["local_start"], g["start"], (g["rot_start"][0], g["rot_start"][1], 0)),
                          (row["local_end"] - 1, g["end"], (p1, y1, 0))], rng)
    cut_tr = shot_seq.add_track(u.MovieSceneCameraCutTrack)
    cut = cut_tr.add_section()
    cut.set_range(int(row["cut_start"]), int(row["local_end"]))
    cut.set_camera_binding_id(shot_seq.get_binding_id(cam_b))  # [verify]
    return cam_b, comp_b, g


def add_performer(shot_seq, plan, shot, row, perf, report):
    """Spawnable character with its animation. The section starts before the shot (pre-roll,
    and at least 1 frame because temporal samples evaluate before the start, mrg doc); the
    animation offset keeps the planned pose on the shot's first frame."""
    u = _u()
    ls = _ls()
    subj = plan["subjects"][perf["subject"]]
    cls = _load_class(u, subj["class"])
    b = ls.add_spawnable_from_class(shot_seq, cls)
    b.set_display_name(perf["subject"])
    pos = perf.get("position") or subj.get("position", [0, 0, 0])
    yaw = float(perf.get("yaw", subj.get("yaw", 0.0)))
    pre_wanted = max(int(row["preroll"]), 1)
    anim_start = int(perf.get("anim_start_frame", pre_wanted))  # planned frame of the pose
    pre = min(pre_wanted, anim_start)
    if pre < pre_wanted:
        report["findings"].append(_f("warn", "build.preroll", "%s: animation has only %d "
                                     "frames before its planned start; pre-roll holds a pose"
                                     % (perf["subject"], anim_start), shot["name"]))
    start = row["local_start"] - pre
    key_transform(b, [(row["local_start"], pos, (0.0, yaw, 0.0))], (start, row["local_end"]))
    if perf.get("anim"):
        tr = b.add_track(u.MovieSceneSkeletalAnimationTrack)
        sec = tr.add_section()
        sec.set_range(int(start), int(row["local_end"]))
        params = sec.get_editor_property("params")
        params.set_editor_property("animation", u.load_asset(perf["anim"]))
        # offset in TICK resolution, not display frames [added, verify property name]
        tick = shot_seq.get_tick_resolution()
        disp = shot_seq.get_display_rate()
        ticks_per_frame = (tick.numerator / float(tick.denominator)) / (
            disp.numerator / float(disp.denominator))
        params.set_editor_property("first_loop_start_frame_offset",
                                   u.FrameNumber(int(round((anim_start - pre) * ticks_per_frame))))
        sec.set_editor_property("params", params)
    return b


def add_lighting_subsequence(shot_seq, plan, shot, row, cam_keys=None):
    """<prefix>_<shot>_LGT subsequence on the shot, holding spawnable shot lights, so a light
    fix never touches the shot's content (GLITCH [00:36:59]). With cam_keys, adds the temp
    light: a spot light keyed on the camera's transform, the shot-level equivalent of
    Glitch's camera-parented spotlight (GLITCH [00:27:18]) [added: keys instead of an attach
    track, which is scripted only with [verify] calls]."""
    u = _u()
    ls = _ls()
    pkg = shot_asset_path(plan, shot["name"]).rsplit("/", 1)[0]
    lgt = new_sequence("%s_%s_LGT" % (plan["name"], shot["name"]), pkg, plan["fps"],
                       row["local_start"], row["local_end"])
    st = shot_seq.add_track(u.MovieSceneSubTrack)
    sec = st.add_section()
    sec.set_sequence(lgt)
    sec.set_range(int(row["cut_start"]), int(row["local_end"]))
    made = []
    if cam_keys:
        b = ls.add_spawnable_from_class(lgt, u.SpotLight)
        b.set_display_name("TEMP_camlight")
        key_transform(b, [(f, [p[0], p[1], p[2] + 20.0], r) for f, p, r in cam_keys],
                      (row["cut_start"], row["local_end"]))
        made.append("TEMP_camlight")
    for i, L in enumerate(shot.get("lights", [])):
        cls = getattr(u, L.get("class", "RectLight"))
        b = ls.add_spawnable_from_class(lgt, cls)
        b.set_display_name(L.get("role", "light%d" % i))
        tgt = _resolve_target(plan, L.get("target"))
        pitch, yaw = look_at(L["position"], tgt) if tgt else (0.0, 0.0)
        key_transform(b, [(row["local_start"], L["position"], (pitch, yaw, 0.0))],
                      (row["cut_start"], row["local_end"]))
        made.append(L.get("role", "light%d" % i))
    return lgt, made


def build_from_plan(plan, check=True):
    """Build master + shots from a plan, in ONE undo transaction with a progress dialog
    (SPI [00:16:16]). Refuses when check_plan has a fail. Returns a report: assets, soft
    failures (calls that raised, names to fix after the probe) and findings."""
    u = _u()
    report = {"assets": [], "soft": [], "findings": []}
    if check:
        f = check_plan(plan)
        if summarize(f)["fail"]:
            report["findings"] = f
            report["refused"] = True
            return report
    rows = layout(plan)
    root = plan.get("root", "/Game/Cinematics/%s" % plan["name"])
    with u.ScopedEditorTransaction("Build %s from plan" % plan["name"]):
        with u.ScopedSlowTask(len(rows) + 1, "Building %s" % plan["name"]) as task:
            task.make_dialog(True)
            total = rows[-1]["master_end"] if rows else 0
            master = new_sequence("%s_Master" % plan["name"], root, plan["fps"],
                                  rows[0]["master_start"] if rows else 0, total)
            report["assets"].append(master.get_path_name())
            shot_track = master.add_track(u.MovieSceneCinematicShotTrack)
            for s, row in zip(plan["shots"], rows):
                task.enter_progress_frame(1, "Shot %s" % s["name"])
                pkg = shot_asset_path(plan, s["name"]).rsplit("/", 1)[0]
                shot_seq = new_sequence("%s_%s" % (plan["name"], s["name"]), pkg, plan["fps"],
                                        row["local_start"], row["local_end"])
                folders = {}
                cam_b, comp_b, g = add_cine_camera(shot_seq, plan, s, row, report)
                _in_folder(_folder(shot_seq, "Cameras", folders), cam_b, report)
                for p in s.get("performers", []):
                    try:
                        b = add_performer(shot_seq, plan, s, row, p, report)
                        _in_folder(_folder(shot_seq, "Characters", folders), b, report)
                    except Exception as e:
                        report["soft"].append("%s performer %s: %s" % (s["name"], p["subject"], e))
                cam_keys = [(row["local_start"], g["start"], (g["rot_start"][0], g["rot_start"][1], 0.0)),
                            (row["local_end"] - 1, g["end"], (g["rot_end"][0], g["rot_end"][1], 0.0))]
                # every shot gets its LGT subsequence (empty until the lighter fills it)
                lgt, made = add_lighting_subsequence(
                    shot_seq, plan, s, row, cam_keys if s.get("temp_light", True) else None)
                report["assets"].append(lgt.get_path_name())
                sec = shot_track.add_section()
                sec.set_sequence(shot_seq)
                sec.set_range(int(row["master_start"]), int(row["master_end"]))
                report["assets"].append(shot_seq.get_path_name())
            for a in plan.get("audio", []):
                try:
                    tr = master.add_track(u.MovieSceneAudioTrack)
                    sec = tr.add_section()
                    sec.set_sound(u.load_asset(a["sound"]))  # [verify]
                    sec.set_range(int(a.get("start", 0)), int(total))
                except Exception as e:
                    report["soft"].append("audio: %s" % e)
            task.enter_progress_frame(1, "Saving")
    for p in report["assets"]:
        u.EditorAssetLibrary.save_asset(p.split(".")[0])
    report["master"] = master.get_path_name()
    return report


def _sections(seq, track_cls):
    out = []
    for tr in seq.find_tracks_by_type(track_cls):
        out.extend(tr.get_sections())
    return out


def audit_sequence(master, plan=None, world=None, bias_policy="bottom_up"):
    """In-editor audit of a built hierarchy (digest "Measurable in code"): production rate
    and start frame, contiguous shot sections, each shot's length equals its section,
    camera cut covering the shot (and the pre-roll), camera binding spawnable, possessables
    resolving in the world, hierarchical bias default, animation sections covering start-1,
    lens tracks present. Returns {"findings", "summary", "shots"}."""
    u = _u()
    out = []
    rate = plan["fps"] if plan else None
    want = _fps_pair(rate) if rate else None
    mr = master.get_display_rate()
    if want and (mr.numerator, mr.denominator) != want:
        out.append(_f("fail", "seq.rate", "master at %d/%d fps, production %d/%d" % (
            mr.numerator, mr.denominator, want[0], want[1]), source="SI [00:21:52]"))
    shots = []
    secs = _sections(master, u.MovieSceneCinematicShotTrack)
    secs.sort(key=lambda s: s.get_start_frame())
    prev_end = None
    pre_by_name = {s["name"]: int(s.get("preroll", 0)) for s in (plan or {}).get("shots", [])}
    flags_by_name = {s["name"]: s.get("flags", []) for s in (plan or {}).get("shots", [])}
    for sec in secs:
        seq = sec.get_sequence()
        name = seq.get_name()
        short = name[len(plan["name"]) + 1:] if plan and name.startswith(plan["name"] + "_") \
            else name
        short = re.sub(r"_take\d+$", "", short)
        a, b = sec.get_start_frame(), sec.get_end_frame()
        if prev_end is not None and a != prev_end:
            out.append(_f("fail" if a < prev_end else "warn", "edit.contiguous",
                          "%s at %d, previous shot ends %d (%s)" % (
                              name, a, prev_end, "overlap" if a < prev_end else "gap"), short))
        prev_end = b
        r = seq.get_display_rate()
        if (r.numerator, r.denominator) != (mr.numerator, mr.denominator):
            out.append(_f("fail", "seq.rate", "shot at %d/%d fps, master %d/%d" % (
                r.numerator, r.denominator, mr.numerator, mr.denominator), short,
                "SI [00:21:52]"))
        ps, pe = seq.get_playback_start(), seq.get_playback_end()
        if plan and ps != int(plan.get("start_frame", 0)):
            out.append(_f("warn", "seq.start", "starts at %d, production start %d" % (
                ps, int(plan.get("start_frame", 0))), short, "SI [00:21:52]"))
        if pe - ps != b - a:
            out.append(_f("fail", "edit.length", "shot plays %d frames, section is %d (Auto "
                          "Size, or retime)" % (pe - ps, b - a), short, "tips doc (Auto Size)"))
        try:
            bias = sec.get_editor_property("parameters").get_editor_property("hierarchical_bias")
            if bias_policy == "bottom_up" and int(bias) != 100:
                out.append(_f("warn", "seq.bias", "hierarchical bias %s (default 100)" % bias,
                              short, "shots doc (Hierarchical Bias)"))
        except Exception:
            pass
        cuts = _sections(seq, u.MovieSceneCameraCutTrack)
        spawn_ids = {str(x.get_id()) for x in seq.get_spawnables()}
        if not cuts:
            out.append(_f("fail", "cam.cut", "no camera cut", short))
        else:
            cs = min(c.get_start_frame() for c in cuts)
            ce = max(c.get_end_frame() for c in cuts)
            if cs > ps or ce < pe:
                out.append(_f("fail", "cam.cut", "camera cut %d-%d does not cover %d-%d" % (
                    cs, ce, ps, pe), short))
            need = pre_by_name.get(short, 0)
            if need and cs > ps - need:
                out.append(_f("fail", "warmup.preroll", "camera cut starts %d, needs %d for "
                              "camera-cut warm-up" % (cs, ps - need), short, "tips doc"))
            for c in cuts:
                try:
                    bid = c.get_camera_binding_id()
                    bp = seq.resolve_binding_id(bid)  # [verify]
                    if str(bp.get_id()) not in spawn_ids:
                        out.append(_f("warn", "cam.spawnable", "camera is not a spawnable of this "
                                      "shot (possessable or cross-sequence)", short,
                                      "cam doc; SW yOcgYMcxr3Q [00:07:53]"))
                except Exception as e:
                    out.append(_f("warn", "cam.resolve", "cannot resolve camera binding: %s" % e,
                                  short))
        if world is not None:
            for p in seq.get_possessables():
                try:
                    if p.get_parent() is not None and p.get_parent().is_valid():
                        continue  # component bindings resolve through their spawnable parent
                except Exception:
                    pass
                objs = seq.locate_bound_objects(p, world)
                if not objs:
                    out.append(_f("fail", "bind.unresolved", "possessable %s does not resolve in "
                                  "this map (world dependency)" % p.get_display_name(), short,
                                  "SW yOcgYMcxr3Q [00:13:50]"))
        for p in seq.get_possessables():
            try:
                if p.get_parent() is not None and p.get_parent().is_valid():
                    continue
            except Exception:
                pass
            if p.get_tracks():
                out.append(_f("info", "bind.override", "possessable %s is animated here: it "
                              "snaps back to its level state after this shot; key it in every "
                              "shot that needs the change, change the level for a permanent "
                              "one, or make a one-shot object spawnable" % p.get_display_name(),
                              short, "SW yOcgYMcxr3Q [00:10:34] [00:11:46]"))
        anim_secs = []
        for bnd in seq.get_bindings():
            for tr in bnd.find_tracks_by_type(u.MovieSceneSkeletalAnimationTrack):
                anim_secs.extend(tr.get_sections())
        late = [s_.get_start_frame() for s_ in anim_secs if s_.get_start_frame() > ps - 1]
        if late:
            out.append(_f("warn", "warmup.section", "%d animation section(s) start at the shot "
                          "start: temporal samples evaluate one frame before it" % len(late),
                          short, "mrg doc (Anti-Aliasing)"))
        if any(f in SIM_FLAGS for f in flags_by_name.get(short, [])):
            need_from = ps - pre_by_name.get(short, 0)
            short_secs = [s_ for s_ in anim_secs if s_.get_start_frame() > need_from]
            if short_secs:
                out.append(_f("fail", "warmup.anim", "%d animation section(s) start after %d: "
                              "the pre-roll must animate every simulated character"
                              % (len(short_secs), need_from), short, "tips doc (Starting Motion)"))
        shots.append({"shot": short, "sequence": name, "asset": seq.get_path_name(),
                      "master": [a, b],
                      "local": [ps, pe], "camera_cuts": len(cuts),
                      "spawnables": len(spawn_ids)})
    if not secs:
        out.append(_f("fail", "edit.shots", "master has no shot sections"))
    if plan and secs and len(secs) != len(plan["shots"]):
        out.append(_f("fail", "edit.shots", "%d shot sections, plan has %d" % (
            len(secs), len(plan["shots"]))))
    return {"findings": out, "summary": summarize(out), "shots": shots}


def _shot_sequences(master, plan):
    """{shot: sequence object} the master's shot track plays (takes included)."""
    u = _u()
    out = {}
    for sec in _sections(master, u.MovieSceneCinematicShotTrack):
        seq = sec.get_sequence()
        name = seq.get_name()
        short = name[len(plan["name"]) + 1:] if name.startswith(plan["name"] + "_") else name
        out[re.sub(r"_take\d+$", "", short)] = seq
    return out


def active_shot_paths(master, plan):
    """{shot: asset path} of the sequences the master's shot track actually plays (takes
    included), for render_jobs(..., sequences=) and check_render_output(..., sequences=)."""
    return {k: v.get_path_name().split(".")[0] for k, v in _shot_sequences(master, plan).items()}


def empty_level_test(master, temp_level="/Game/_Temp/L_EmptyTest", return_level=None):
    """Sir Wade's test (yOcgYMcxr3Q [00:13:50]): in an empty level, every possessable that no
    longer resolves is a world dependency of the cinematic. Returns the list per shot and
    reopens return_level. The temp level is left in /Game/_Temp (never deleted)."""
    u = _u()
    les = u.get_editor_subsystem(u.LevelEditorSubsystem)
    les.new_level(temp_level)
    world = u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
    deps = {}
    for sec in _sections(master, u.MovieSceneCinematicShotTrack):
        seq = sec.get_sequence()
        for p in seq.get_possessables():
            try:
                if p.get_parent() is not None and p.get_parent().is_valid():
                    continue
            except Exception:
                pass
            if not seq.locate_bound_objects(p, world):
                deps.setdefault(seq.get_name(), []).append(str(p.get_display_name()))
    if return_level:
        les.load_level(return_level)
    return deps


def board_frames(plan):
    """[(shot, master_frame, label)] first, middle and last frame per shot (exclusive end)."""
    out = []
    for row in layout(plan):
        a, b = row["master_start"], row["master_end"]
        for tag, f in (("first", a), ("mid", (a + b) // 2), ("last", b - 1)):
            out.append((row["name"], f, "%s %s %04d" % (row["name"], tag, f)))
    return out


def _playback_params(u, frame):
    p = u.MovieSceneSequencePlaybackParams()
    try:
        p.set_editor_property("frame", u.FrameTime(u.FrameNumber(int(frame))))  # [verify]
    except Exception:
        p.frame = u.FrameTime(u.FrameNumber(int(frame)))
    return p


def board_generator(master, plan, out_dir, width=1280, height=536, settle=3, screenshot=None,
                    preroll=False):
    """Generator (one editor tick per yield) that screenshots first, middle and last frame of
    every shot through the camera cuts. Needs a ticking editor: ue_run mode="latent", or
    run_on_ticker() in a live editor (MCP, PythonRemote). screenshot defaults to
    ue_review.screenshot(path, width, height). preroll=True also boards the first pre-roll
    frame of every pre-rolled shot from the shot sequence itself: in the master, negative
    time shows the PREVIOUS shot, which is why the GUI has Evaluate Sub Sequences In
    Isolation (tips doc, Starting Motion). Returns the manifest [(shot, frame, path)]."""
    u = _u()
    lsb = u.LevelSequenceEditorBlueprintLibrary
    if screenshot is None:
        from ue_review import screenshot  # scenario-unreal-expert toolkit
    lsb.open_level_sequence(master)
    lsb.set_lock_camera_cut_to_viewport(True)
    os.makedirs(out_dir, exist_ok=True)
    manifest = []
    for shot, frame, label in board_frames(plan):
        lsb.set_global_position(_playback_params(u, frame))
        lsb.force_update()
        for _ in range(settle):
            yield  # let spawnables, streaming and TSR settle [added]
        path = os.path.join(out_dir, "%s_%04d.png" % (shot, frame))
        screenshot(path, width, height)
        for _ in range(240):  # screenshots land a few ticks later (ue_review); cap ~4 s
            if os.path.isfile(path):
                break
            yield
        manifest.append({"shot": shot, "frame": frame, "label": label, "path": path,
                         "written": os.path.isfile(path)})
    if preroll:
        seqs = _shot_sequences(master, plan)
        for row in layout(plan):
            if row["preroll"] <= 0 or row["name"] not in seqs:
                continue
            lsb.open_level_sequence(seqs[row["name"]])  # the shot alone = isolation
            lsb.set_lock_camera_cut_to_viewport(True)
            lsb.set_global_position(_playback_params(u, row["cut_start"]))
            lsb.force_update()
            for _ in range(settle):
                yield
            path = os.path.join(out_dir, "%s_preroll_%04d.png" % (row["name"], row["cut_start"]))
            screenshot(path, width, height)
            for _ in range(240):
                if os.path.isfile(path):
                    break
                yield
            manifest.append({"shot": row["name"], "frame": row["cut_start"], "isolated": True,
                             "label": "%s preroll %04d" % (row["name"], row["cut_start"]),
                             "path": path, "written": os.path.isfile(path)})
        lsb.open_level_sequence(master)
    with open(os.path.join(out_dir, "board.json"), "w") as fh:
        json.dump(manifest, fh, indent=1)
    return manifest


_TICKERS = {}


def run_on_ticker(gen, on_done=None, name="ue_cine"):
    """Drive a generator one step per editor tick in a live editor (ue_run's latent boot does
    the same for headless-launched editors). Keeps a global handle (never garbage collected
    mid-run). on_done(result or exception) is called at the end."""
    u = _u()
    state = {"gen": gen, "wake": 0.0}

    def tick(dt):
        import time as _t
        if _t.time() < state["wake"]:
            return True
        try:
            step = next(state["gen"])
            if isinstance(step, (int, float)) and step > 0:
                state["wake"] = _t.time() + float(step)
            return True
        except StopIteration as stop:
            _TICKERS.pop(name, None)
            if on_done:
                on_done(stop.value)
            return False
        except Exception as e:  # reported, never raised into the editor tick
            _TICKERS.pop(name, None)
            if on_done:
                on_done(e)
            return False

    _TICKERS[name] = u.register_ticker_callback(tick)
    return _TICKERS[name]


def _editor_property_names(obj):
    """Editor property names parsed from the class docstring ("- ``name`` (type): ...")
    [added: Unreal Python has no property listing; verify the docstring format in 5.8]."""
    doc = (obj if isinstance(obj, type) else type(obj)).__doc__ or ""
    names = re.findall(r"^\s*-\s+``?([a-z_][a-z0-9_]*)``?\s+\(", doc, re.M)
    return list(dict.fromkeys(names))


def graph_snapshot(graph):
    """Read-only depth-first walk of a Movie Graph from its Output node (pin names from the
    scripting doc: Globals/Input, True/False, Default, ""), recording node classes and
    simple-valued editor properties. Does not dirty the graph (no set calls)."""
    u = _u()
    nodes, seen = [], set()

    def visit(node):
        key_ = node.get_name()
        if key_ in seen:
            return
        seen.add(key_)
        props = {}
        for n in _editor_property_names(node):
            try:
                v = node.get_editor_property(n)
            except Exception:
                continue
            if isinstance(v, (bool, int, float, str)):
                props[n] = v
            elif hasattr(v, "name") and isinstance(getattr(v, "name"), str):
                props[n] = v.name
        nodes.append({"name": key_, "class": type(node).__name__, "properties": props})
        if isinstance(node, (u.MovieGraphSubgraphNode, u.MovieGraphOutputNode)):
            pins = [node.get_input_pin("Globals"), node.get_input_pin("Input")]
        elif isinstance(node, u.MovieGraphBranchNode):
            pins = [node.get_input_pin("True"), node.get_input_pin("False")]
        elif isinstance(node, u.MovieGraphSelectNode):
            pins = [node.get_input_pin("Default")]
        else:
            pins = [node.get_input_pin("")]
        for pin in pins:
            if pin:
                for nb in pin.get_connected_nodes():
                    visit(nb)

    visit(graph.get_output_node())
    variables = []
    try:
        variables = [str(v.get_member_name()) for v in graph.get_variables()]
    except Exception:
        pass
    return {"graph": graph.get_path_name(), "nodes": nodes, "variables": variables}


_EXECUTOR = {"executor": None, "done": None}


def queue_render_jobs(specs, clear=True, author="scenario-unreal-cinematics"):
    """Fill the editor's render queue from render_jobs() specs: one job per spec with its
    graph preset and exposed-variable overrides (never edit node defaults of the shared graph:
    mrq-cli, Modifying Default Parameters). Returns [(job_name, [variables not found])]."""
    u = _u()
    sub = u.get_editor_subsystem(u.MoviePipelineQueueSubsystem)
    queue = sub.get_queue()
    if clear:
        queue.delete_all_jobs()
    out = []
    for spec in specs:
        job = queue.allocate_new_job(u.MoviePipelineExecutorJob)
        job.set_editor_property("sequence", u.SoftObjectPath(_object_path(spec["sequence"])))
        job.set_editor_property("map", u.SoftObjectPath(_object_path(spec["map"])))
        job.set_editor_property("job_name", spec["job_name"])
        job.set_editor_property("author", author)
        graph = u.load_asset(spec["graph"])
        job.set_graph_preset(graph)
        va = job.get_or_create_variable_overrides(graph)
        wanted = dict(spec.get("variables", {}))
        for var in graph.get_variables():
            nm = str(var.get_member_name())
            if nm in wanted:
                v = wanted.pop(nm)
                va.set_value_serialized_string(var, str(v) if not isinstance(v, bool)
                                               else ("True" if v else "False"))  # [verify format]
                va.set_variable_assignment_enable_state(var, True)
        out.append((spec["job_name"], sorted(wanted)))
    return out


def start_render(on_done=None):
    """Render the current queue in-process (PIE executor). Returns immediately: poll
    render_status() or yield from render_generator(). The executor is kept in a module
    global so it is not garbage collected mid-render (mrq-cli examples)."""
    u = _u()
    sub = u.get_editor_subsystem(u.MoviePipelineQueueSubsystem)
    ex = u.MoviePipelinePIEExecutor(sub)
    _EXECUTOR["executor"], _EXECUTOR["done"] = ex, None

    def finished(executor, success):
        _EXECUTOR["done"] = bool(success)
        if on_done:
            on_done(success)

    ex.on_executor_finished_delegate.add_callable_unique(finished)
    sub.render_queue_with_executor_instance(ex)
    return ex


def render_status():
    u = _u()
    sub = u.get_editor_subsystem(u.MoviePipelineQueueSubsystem)
    jobs = []
    for j in sub.get_queue().get_jobs():
        jobs.append({"job": j.get_editor_property("job_name"),
                     "progress": j.get_status_progress(), "status": j.get_status_message()})
    return {"rendering": sub.is_rendering(), "success": _EXECUTOR["done"], "jobs": jobs}


def render_generator(poll_seconds=2.0, timeout=6 * 3600):
    """Start the queue and yield until it finishes (for ue_run latent jobs or run_on_ticker).
    Returns render_status() at the end."""
    import time as _t
    start_render()
    t0 = _t.time()
    yield 1.0
    while render_status()["rendering"]:
        if _t.time() - t0 > timeout:
            raise TimeoutError("render exceeded %ss" % timeout)
        yield poll_seconds
    return render_status()


def retime_shot(master, shot_seq_name, new_frames):
    """Change one shot's length in the edit: the shot's playback end, its section, and every
    later shot section shift by the difference, in one transaction. Master-level keys after
    the edit point are reported, not moved (the music drives the cut). Spanning subsequences
    must be chopped per shot (SPI [00:19:36]); this tool refuses when it finds one."""
    u = _u()
    with editor_tool("Retime %s" % shot_seq_name, 3) as task:
        task.enter_progress_frame(1, "Reading the edit")
        secs = sorted(_sections(master, u.MovieSceneCinematicShotTrack),
                      key=lambda s: s.get_start_frame())
        target = [s for s in secs if s.get_sequence().get_name() == shot_seq_name]
        if not target:
            raise ValueError("no shot %s" % shot_seq_name)
        sec = target[0]
        a, b = sec.get_start_frame(), sec.get_end_frame()
        delta = int(new_frames) - (b - a)
        spanning = []
        for tr in master.find_tracks_by_exact_type(u.MovieSceneSubTrack):  # not the shot track
            spanning += [s for s in tr.get_sections() if s.get_end_frame() > b]
        if spanning:
            raise RuntimeError("a master-level subsequence covers frames after the edit point "
                               "(it would not move with the shots): chop it per shot first "
                               "(SPI chop and split)")
        task.enter_progress_frame(1, "Shifting later shots")
        seq = sec.get_sequence()
        seq.set_playback_end(seq.get_playback_start() + int(new_frames))
        later = [s for s in secs if s.get_start_frame() >= b]
        for s in sorted(later, key=lambda s: -s.get_start_frame() if delta > 0
                        else s.get_start_frame()):
            s.set_range(s.get_start_frame() + delta, s.get_end_frame() + delta)
        sec.set_range(a, a + int(new_frames))
        master.set_playback_end(master.get_playback_end() + delta)
        task.enter_progress_frame(1, "Done")
    return {"shot": shot_seq_name, "delta": delta, "shifted": len(later)}


def new_take(master, shot_seq_name, take_suffix):
    """New Take equivalent: duplicate the shot asset and point the section at the duplicate
    (shots doc "Takes"; SPI split). Duplicating the MASTER shares every shot (SI [00:41:34]),
    which is why experiments inside a shot use a take. The Takes menu metadata may not be
    set this way [verify]."""
    u = _u()
    for sec in _sections(master, u.MovieSceneCinematicShotTrack):
        seq = sec.get_sequence()
        if seq.get_name() != shot_seq_name:
            continue
        src = seq.get_path_name().split(".")[0]
        dst = src + take_suffix
        if u.EditorAssetLibrary.does_asset_exist(dst):
            raise RuntimeError("%s exists" % dst)
        with u.ScopedEditorTransaction("New take %s" % dst):
            dup = u.EditorAssetLibrary.duplicate_asset(src, dst)
            sec.set_sequence(dup)
        return dst
    raise ValueError("no shot %s" % shot_seq_name)


# =========================================================================== CLI
def _main(argv):
    """python3 ue_cine.py check PLAN.json | layout PLAN.json | edl PLAN.json |
    jobs PLAN.json | output PLAN.json ROOT [PATTERN] | exr FILE.exr [...] |
    sheet OUT.png FILE.exr [...] | default-plan"""
    if not argv:
        print(_main.__doc__)
        return 2
    cmd, rest = argv[0], argv[1:]
    if cmd == "default-plan":
        print(json.dumps(default_trailer_plan(), indent=1))
        return 0
    if cmd in ("check", "layout", "edl", "jobs", "output"):
        plan = load_plan(rest[0])
        if cmd == "check":
            f = check_plan(plan)
            print(json.dumps({"summary": summarize(f), "findings": f}, indent=1))
            return 1 if summarize(f)["fail"] else 0
        if cmd == "layout":
            print(json.dumps(layout(plan), indent=1))
        elif cmd == "edl":
            print(edl(plan), end="")
        elif cmd == "jobs":
            print(json.dumps(render_jobs(plan), indent=1))
        else:
            args = [rest[1]] + ([rest[2]] if len(rest) > 2 else [])
            f = check_render_output(plan, *args)
            print(json.dumps({"summary": summarize(f), "findings": f}, indent=1))
            return 1 if summarize(f)["fail"] else 0
        return 0
    if cmd == "exr":
        rows = []
        for p in rest:
            st = exr_stats(p)
            rows.append({"stats": st, "findings": exr_checks(st, parse_exr_header(p),
                                                              {"linear": True})})
        print(json.dumps(rows, indent=1))
        return 0
    if cmd == "sheet":
        out, items = rest[0], []
        tmp = os.path.join(os.path.dirname(os.path.abspath(out)), "_sheet_frames")
        for p in rest[1:]:
            png = os.path.join(tmp, os.path.splitext(os.path.basename(p))[0] + ".png")
            items.append((exr_to_png(p, png), os.path.basename(p)))
        print(contact_sheet(items, out))
        return 0
    print(_main.__doc__)
    return 2


if __name__ == "__main__":
    import sys
    sys.exit(_main(sys.argv[1:]))
