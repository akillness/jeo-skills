#!/usr/bin/env python3
"""
zb_batch: run a recipe over a folder of meshes in ZBrush 2026, one file at a time, with a
timeout per step, restart of ZBrush after a hang, resume, and a JSON + CSV + contact-sheet
report. Agent side (system python3); ZBrush-side work is zb_ops (scenario-zbrush-expert) and
zb_plugin_ops (this skill).

    import sys; sys.path.insert(0, "<skills/scenario-zbrush-automation/scripts>")
    import zb_batch
    files = zb_batch.discover("/abs/in", ("*.obj",))
    print(zb_batch.plan(files, "/abs/out", {"dyn_res": 256, "zr_target_k": 5}))   # dry run
    rep = zb_batch.run_folder(files, "/abs/out", {"dyn_res": 256, "zr_target_k": 5})
    # open /abs/out/sheet.png, read /abs/out/report.json

    python3 zb_batch.py plan|run --in /abs/in --out /abs/out [--params p.json] [--mode script]

Two execution modes:
  bridge  one ZBrush with the agent bridge (zb_launch.start), each step a separate
          main-thread call with its own timeout. A timeout does not cancel the call; the
          runner pings for `grace_s`, and if ZBrush stays unresponsive (plugin that keeps
          control, modal note, dialog) it saves evidence, restarts ZBrush with zb_launch
          and goes on with the next file. A plugin step that hung is marked blocked and its
          fallback is used from then on (UV Master -> native Unwrap). It never kills a
          ZBrush it did not start.
  script  one ZBrush process per file: ZBrush -script zb_batch_job.py --job job.json
          (Maxon quickstart). Isolation by process; the job writes its result after each
          step; the runner kills the process on timeout. Quit-on-exit [verify live_a05].

Status: the runner, recipe, resume, reports, GoZ helpers and ZScript generators run offline
against fakes (tests/code/zbrush-automation). NOT YET RUN IN ZBRUSH as a batch.
"""

__version__ = "0.1"  # ZBrush Expert Skills v0.1 (2026-09-24)
import csv
import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
LEAD = os.path.abspath(os.path.join(HERE, "..", "..", "scenario-zbrush-expert", "scripts"))
for _d in (HERE, LEAD):
    if _d not in sys.path:
        sys.path.insert(0, _d)
import zb_launch  # noqa: E402  (lead toolkit: start, ping, stop, send, diagnose)
import zb_goz  # noqa: E402,F401  (re-exported for callers: zb_batch.zb_goz.read_goz)
from zb_batch_job import resolve_refs, write_json_atomic  # noqa: E402

JOB_PY = os.path.join(HERE, "zb_batch_job.py")
LEAD_MODULES = {"zb_ops", "zb_stroke", "zb_review", "zb_audit"}
OWN_MODULES = {"zb_plugin_ops", "zb_batch_job", "zb_goz"}


class BatchAbort(RuntimeError):
    """Stop the batch; the report stays resumable."""


# --------------------------------------------------------------------------------------------
# Files and names
# --------------------------------------------------------------------------------------------

def discover(folder, patterns=("*.obj",), recursive=False):
    """Sorted absolute paths whose names match the patterns, case-insensitively (rock.OBJ
    and rock.obj both match *.obj)."""
    import fnmatch
    folder = os.path.abspath(folder)
    pats = [p.lower() for p in patterns]
    out = []
    for root, dirs, files in os.walk(folder):
        dirs[:] = sorted(d for d in dirs if not d.startswith((".", "_")))
        out += [os.path.join(root, f) for f in files
                if any(fnmatch.fnmatch(f.lower(), p) for p in pats)]
        if not recursive:
            break
    return sorted(out)


def sanitize_name(s, max_len=40):
    """ASCII letters, digits and underscores, not starting with a digit: safe as a ZBrush
    tool name, a GoZ name (no spaces or symbols, GoZ docs) and a Decimation Master cache
    key [added]."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^A-Za-z0-9_]+", "_", s).strip("_") or "mesh"
    if s[0].isdigit():
        s = "m_" + s
    return s[:max_len]


def unique_stems(paths, max_len=40):
    """One unique sanitized stem per path, in order (case-insensitive: rock, Rock -> rock,
    Rock_2). Imported tools take the file name, and GoZ plus Decimation Master key on it."""
    seen, out = {}, []
    for p in paths:
        base = sanitize_name(os.path.splitext(os.path.basename(p))[0], max_len)
        stem, n = base, 1
        while stem.lower() in seen:
            n += 1
            stem = f"{base[:max_len - len(str(n)) - 1]}_{n}"
        seen[stem.lower()] = p
        out.append(stem)
    return out


def file_sha1(path, block=1 << 20):
    h = hashlib.sha1()
    with open(path, "rb") as fh:
        while True:
            b = fh.read(block)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def stage_input(src, stage_dir, stem):
    """Copy (never move) the input to <stage>/<stem><ext> so the ZBrush tool gets a unique,
    clean name. Reuses an identical earlier copy."""
    ext = os.path.splitext(src)[1].lower()
    os.makedirs(stage_dir, exist_ok=True)
    dst = os.path.join(stage_dir, stem + ext)
    if not (os.path.exists(dst) and os.path.getsize(dst) == os.path.getsize(src)
            and file_sha1(dst) == file_sha1(src)):
        shutil.copy2(src, dst)
    return dst


def read_json(path, default=None):
    try:
        with open(path) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


# --------------------------------------------------------------------------------------------
# Remote calls (both skills' script folders on sys.path only while importing)
# --------------------------------------------------------------------------------------------

def build_remote_code(code, modules=()):
    """Source sent to ZBrush: the lead's hygiene prelude (zb_launch.build_code) importing the
    named toolkit modules by path from scenario-zbrush-automation and scenario-zbrush-expert. After the call
    sys.path, sys.modules, stdout and the working directory are as they were and every
    toolkit module is popped, also when the call raised (the bridge server runs the same
    restore hook): Maxon Style Guide, shared interpreter."""
    for m in modules:
        if not m.isidentifier() or m not in LEAD_MODULES | OWN_MODULES:
            raise ValueError(f"unknown toolkit module {m!r}")
    return zb_launch.build_code(code, tuple(modules), dirs=[HERE, LEAD])


def remote_run(code, modules=(), port=zb_launch.DEFAULT_PORT, timeout=120):
    reply = zb_launch.send(build_remote_code(code, tuple(modules)), "main", port, timeout)
    return zb_launch.decode_reply(reply)


def remote_call(module, func, *args, port=zb_launch.DEFAULT_PORT, timeout=120, **kwargs):
    """module.func(*args, **kwargs) inside ZBrush on the main thread; JSON-able args."""
    code = (f"result = {module}.{func}(*_zb_json.loads({json.dumps(list(args))!r}), "
            f"**_zb_json.loads({json.dumps(kwargs)!r}))")
    mods = [module] + (["zb_ops"] if module != "zb_ops" else [])
    return remote_run(code, mods, port, timeout)


# --------------------------------------------------------------------------------------------
# Session: one ZBrush with the bridge, restarted after a hang
# --------------------------------------------------------------------------------------------

def screen_locked():
    return zb_launch.screen_locked()


def evidence(out_dir, tag):
    """What the agent looks at after a hang: zb_launch.diagnose(), a screenshot when the
    screen is unlocked (screencapture -x works here; under the lock it shows only the lock
    screen, README), and ZBrush's OS windows via System Events (ZBrush Notes are drawn
    inside the canvas and are NOT OS windows: only the screenshot shows them)."""
    os.makedirs(out_dir, exist_ok=True)
    ev = {"diagnose": zb_launch.diagnose(), "screen_locked": screen_locked()}
    if ev["screen_locked"] is False:
        shot = os.path.join(out_dir, f"hang_{tag}_{time.strftime('%H%M%S')}.png")
        r = subprocess.run(["screencapture", "-x", shot], capture_output=True, timeout=30)
        ev["screenshot"] = shot if r.returncode == 0 and os.path.exists(shot) else None
        ev["windows"] = os_windows()
    return ev


def os_windows():
    """Names of ZBrush's OS-level windows and their buttons (file dialogs, save prompts).
    Needs Accessibility (allowed on this Mac, README) and an unlocked session."""
    script = ('tell application "System Events"\n if exists process "ZBrush" then\n'
              '  tell process "ZBrush"\n   set out to ""\n   repeat with w in windows\n'
              '    set out to out & (name of w as text) & " | "\n    try\n'
              '     repeat with b in buttons of w\n'
              '      set out to out & "[" & (name of b as text) & "] "\n     end repeat\n'
              '    end try\n    set out to out & linefeed\n   end repeat\n   return out\n'
              '  end tell\n end if\nend tell\nreturn ""')
    try:
        r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=20)
        return [ln for ln in (r.stdout or "").splitlines() if ln.strip()]
    except (OSError, subprocess.TimeoutExpired):
        return None


class BridgeSession:
    """One ZBrush with the bridge. owned=True only when this session spawned it: a ZBrush
    that was already running (the user's session, maybe with unsaved work) is never
    restarted or quit by the batch."""

    def __init__(self, port=zb_launch.DEFAULT_PORT, start_timeout=180, max_restarts=3,
                 hang_abort=2):
        self.port = port
        self.start_timeout = start_timeout
        self.max_restarts = max_restarts
        self.hang_abort = hang_abort
        self.owned = False
        self.restarts = 0
        self.files_since_restart = 0
        self.blocked = {}          # step name -> file stem where it hung
        self.hangs = {}            # step name -> count
        self.version = None
        self.log = []

    def call(self, module, func, args, kwargs, timeout):
        return remote_call(module, func, *args, port=self.port, timeout=timeout, **kwargs)

    def alive(self, timeout=5):
        try:
            self.version = zb_launch.ping(self.port, timeout)["version"]
            return True
        except zb_launch.ZBError:
            return False

    def ensure(self):
        if zb_launch.port_open(self.port) and self.alive(10):
            return {"status": "alive", "owned": self.owned}
        if zb_launch.is_running():
            raise BatchAbort("ZBrush is running without the bridge on this port: save and quit "
                             "it, then rerun (ZBrush is single-instance)")
        try:
            r = zb_launch.start(self.port, timeout=self.start_timeout)
        except zb_launch.ZBError as e:
            raise BatchAbort(f"ZBrush did not start with the bridge: {e}")
        self.owned = r.get("status") == "started" or self.owned
        self.version = r.get("version")
        self.files_since_restart = 0
        self.log.append({"t": time.time(), "event": "start", "result": r})
        return r

    def wait_recovery(self, grace_s=60, every=5):
        """After a timeout: does the main thread come back (the call merely ran long)?"""
        end = time.time() + grace_s
        while time.time() < end:
            if self.alive(every):
                return True
            time.sleep(1)
        return False

    def restart(self, reason):
        if not self.owned:
            raise BatchAbort(f"{reason}; ZBrush was not started by this batch, so it is left "
                             "running for a human to inspect")
        if self.restarts >= self.max_restarts:
            raise BatchAbort(f"{reason}; {self.restarts} restarts already (max {self.max_restarts})")
        self.restarts += 1
        stop = zb_launch.stop(save_to=None, port=self.port, force=True)
        self.log.append({"t": time.time(), "event": "stop", "reason": reason, "result": stop})
        if stop.get("running_after"):
            raise BatchAbort(f"{reason}; ZBrush did not quit: {stop}")
        self.owned = False
        r = self.ensure()
        self.owned = True
        return {"reason": reason, "stop": stop, "start": r}

    def close(self):
        if self.owned and zb_launch.is_running():
            return zb_launch.stop(save_to=None, port=self.port, force=True)
        return None


# --------------------------------------------------------------------------------------------
# Recipe (Z7 by default): data, so bridge and -script modes run the same steps
# --------------------------------------------------------------------------------------------

DEFAULT_PARAMS = {
    "dyn_res": 256, "dyn_blur": None,                       # the brief decides; [added] defaults
    # cgside (MyhwQvkcnwI 00:08:38 to 00:09:42): Auto Groups, then ZRemesher Keep Groups, so
    # the low follows the parts. Set zr_auto_groups False when the input's groups matter.
    "zr_target_k": 5.0, "zr_adaptive": None, "zr_keep_groups": True, "zr_auto_groups": True,
    "uv_polygroups": None, "uv_symmetry": None,
    "divide_max": 6, "divide_max_faces": 8_000_000,
    "normal_map": True, "map_size": 2048, "map_flip_v": True, "map_flip_green": False,
    "preview_target_faces": 20000,                           # None: no decimated preview
    "snapshot": True, "save_ztl": True, "export_goz": False,
}

# Base timeouts in seconds per step [added]; the runner raises them to 4 x the slowest
# observed run, up to 10 x base.
TIMEOUTS = {"import": 180, "dynamesh": 300, "save": 120, "make_low": 900, "uv": 600,
            "export": 120, "project": 1800, "normal_map": 600, "snapshot": 120,
            "preview": 1500, "memory": 30}


def step(name, module, func, args=(), kwargs=None, timeout=None, critical=True, plugin=False,
         fallback=None, kind=None):
    return {"name": name, "module": module, "func": func, "args": list(args),
            "kwargs": dict(kwargs or {}), "timeout": timeout or TIMEOUTS.get(kind or name, 300),
            "critical": critical, "plugin": plugin, "fallback": fallback}


def default_recipe(params):
    """Import -> DynaMesh -> checkpoint -> Duplicate + Auto Groups + ZRemesher Keep Groups
    (cgside) -> UV Master (fallback: native Unwrap) -> low OBJ -> Divide + Project All (a
    versioned save right before the first Project All, which can crash: cgside; morph
    target, layer, Dist 0.1 through zb_ops.project_all) -> checkpoint -> tangent normal map
    -> canvas snapshot -> Decimation Master preview LAST (plugin that may keep control, after
    every valuable output is on disk). The pre-projection save is made even when save_ztl is
    False: Project All never runs without one."""
    p = params
    r = [step("memory", "zb_plugin_ops", "memory", critical=False),
         step("import", "zb_plugin_ops", "import_mesh", ["$c.staged"],
              {"expect_points": "$c.input_points", "expect_faces": "$c.input_faces"}),
         step("dynamesh", "zb_ops", "dynamesh", ["$p.dyn_res"], {"blur": "$p.dyn_blur"})]
    if p.get("save_ztl"):
        r.append(step("save_dyn", "zb_ops", "save_ztl", ["{out}/{stem}_dyn.ztl"], kind="save"))
    r.append(step("make_low", "zb_plugin_ops", "make_low", ["$p.zr_target_k"],
                  {"adaptive": "$p.zr_adaptive", "keep_groups": "$p.zr_keep_groups",
                   "auto_groups": "$p.zr_auto_groups"}))
    native = step("uv_native", "zb_plugin_ops", "uv_native", ["$c.low"],
                  {"symmetry": "$p.uv_symmetry"}, kind="uv")
    r.append(step("uv", "zb_plugin_ops", "uv_master", ["$c.low"],
                  {"polygroups": "$p.uv_polygroups", "symmetry": "$p.uv_symmetry"},
                  plugin=True, fallback=native))
    r.append(step("export_low", "zb_plugin_ops", "export_subtool", ["$c.low", "{out}/{stem}_low.obj"],
                  kind="export"))
    if p.get("export_goz"):
        r.append(step("export_goz", "zb_plugin_ops", "export_subtool",
                      ["$c.low", "{out}/{stem}_low.GoZ"], kind="export", critical=False))
    if p.get("normal_map"):
        r.append(step("project", "zb_plugin_ops", "divide_project", ["$c.low", "$c.source"],
                      {"max_levels": "$p.divide_max", "max_faces": "$p.divide_max_faces",
                       "checkpoint": "{out}/{stem}_preproject.ztl"}))
        if p.get("save_ztl"):
            r.append(step("save_proj", "zb_ops", "save_ztl", ["{out}/{stem}_proj.ztl"], kind="save"))
        r.append(step("normal_map", "zb_plugin_ops", "normal_map",
                      ["$c.low", "{out}/{stem}_normal_raw.png"], {"size": "$p.map_size"}))
    if p.get("snapshot"):
        r.append(step("snapshot", "zb_review", "snapshot", ["{out}/{stem}_view.png"],
                      {"matcap": "MatCap Gray"}, critical=False))
    if p.get("preview_target_faces"):
        r.append(step("preview", "zb_plugin_ops", "decimated_preview",
                      ["$c.source", "{out}/{stem}_preview.obj"],
                      {"target_faces": "$p.preview_target_faces"}, critical=False, plugin=True))
    return r


def recipe_hash(recipe, params):
    blob = json.dumps({"recipe": recipe, "params": params}, sort_keys=True, default=repr)
    return hashlib.sha1(blob.encode()).hexdigest()[:12]


# --------------------------------------------------------------------------------------------
# Agent-side checks and post-processing
# --------------------------------------------------------------------------------------------

def _exists(path):
    return bool(path) and os.path.exists(path) and os.path.getsize(path) > 0


def step_gates(value):
    """The zb_ops gate dicts in a step result: its own "gate" (dynamesh, project_all,
    divide_project's merged gate) and those of nested op results (make_low's zremesher,
    decimated_preview's decimate)."""
    v = value if isinstance(value, dict) else {}
    out = [v["gate"]] if isinstance(v.get("gate"), dict) else []
    for key in ("zremesher", "decimate", "dynamesh", "project"):
        sub = v.get(key)
        if isinstance(sub, dict) and isinstance(sub.get("gate"), dict):
            out.append(sub["gate"])
    return out


def check_step(name, value, params):
    """Problems (the file is not done) and warnings (look at it) for one step result. The
    zb_ops gates (volume and watertightness, projection spikes) feed both lists."""
    probs, warns = [], []
    v = value if isinstance(value, dict) else {}
    for g in step_gates(v):
        probs += list(g.get("problems", []))
        warns += list(g.get("warnings", []))
    if v.get("repair") and (probs or warns):
        warns.append(f"{name}: {v['repair']}")
    if name == "import":
        warns += v.get("warnings", [])
        if not (v.get("stats") or {}).get("faces"):
            probs.append("imported tool has no faces")
    elif name == "dynamesh" and not v.get("remeshed"):
        probs.append("DynaMesh did not change the mesh")
    elif name == "make_low":
        zr = v.get("zremesher") or {}
        rt = zr.get("ratio_to_target")
        if rt is None:
            probs.append("ZRemesher returned no face count")
        elif not 0.5 <= rt <= 1.5:
            warns.append(f"ZRemesher gave {zr.get('faces_after')} faces for target "
                         f"{zr.get('target')} (ratio {rt:.2f}); Adapt off hits counts closer")
    elif name in ("uv", "uv_native"):
        bb = v.get("uv_bbox")
        if not bb:
            probs.append("no UVs after unwrap")
        elif min(bb) < -1e-4 or max(bb) > 1 + 1e-4:
            warns.append(f"UV bbox {bb} outside 0..1")
    elif name == "project":
        for i, lv in enumerate(v.get("per_level", [])):
            if lv.get("ratio") and not 3.5 <= lv["ratio"] <= 4.5:
                warns.append(f"level {i + 1}: Divide ratio {lv['ratio']:.2f}, expected 4")
        if v.get("top_faces") and v.get("source_faces") and v["top_faces"] < 0.5 * v["source_faces"]:
            warns.append(f"top level {v['top_faces']} faces < half the source "
                         f"{v['source_faces']}: detail will be lost (raise divide_max)")
    elif name == "preview":
        d = (v.get("decimate") or {})
        if d.get("faces_after") and params.get("preview_target_faces"):
            r = d["faces_after"] / params["preview_target_faces"]
            if not 0.5 <= r <= 2.0:
                warns.append(f"preview has {d['faces_after']} faces for target "
                             f"{params['preview_target_faces']}")
    for key in ("path", "file"):
        if isinstance(v.get(key), str) and v.get(key).lower().endswith((".obj", ".png", ".ztl", ".goz")):
            if not _exists(v[key]):
                probs.append(f"{name}: {v[key]} missing or empty")
    ex = v.get("export")
    if isinstance(ex, dict) and ex.get("path") and not _exists(ex["path"]):
        probs.append(f"{name}: {ex['path']} missing or empty")
    return probs, warns


def png_size(path):
    with open(path, "rb") as fh:
        head = fh.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"not a PNG: {path}")
    import struct
    return list(struct.unpack(">II", head[16:24]))


def image_stats(path):
    """Mean and spread per channel, and the share of pixels with blue >= 128 (a tangent
    normal map points mostly out of the surface: blue high) [added thresholds]."""
    from PIL import Image
    import numpy as np
    with Image.open(path) as im:
        a = np.asarray(im.convert("RGB")).astype(np.float32)
    mean = a.reshape(-1, 3).mean(axis=0)
    std = a.reshape(-1, 3).std(axis=0)
    return {"size": [int(a.shape[1]), int(a.shape[0])], "mean": [round(float(x), 2) for x in mean],
            "std": [round(float(x), 2) for x in std],
            "blue_ge_128": round(float((a[:, :, 2] >= 128).mean()), 4),
            "uniform": bool(std.max() < 1.0)}


def fix_normal_map(raw, out, flip_v=True, flip_green=False):
    """Agent-side orientation fix, where it can be checked: flip V (ZBrush maps are upside
    down for other apps: MME's Flip V switch, NORMAL_MAP_FLIP_VERT in Maya's GoZ_Info
    [verify on the first file]) and invert green for DirectX engines such as Unreal
    [added]. The raw file stays."""
    from PIL import Image, ImageOps
    with Image.open(raw) as im:
        im = im.convert("RGB")
        if flip_v:
            im = ImageOps.flip(im)
        if flip_green:
            r, g, b = im.split()
            im = Image.merge("RGB", (r, ImageOps.invert(g), b))
        os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
        im.save(out)
    return {"raw": raw, "path": out, "flip_v": flip_v, "flip_green": flip_green}


def _audit(path, profile, **kw):
    try:
        import zb_audit
    except ImportError as e:            # numpy missing
        return {"error": f"zb_audit unavailable: {e}"}
    rep = zb_audit.audit(path)
    keep = ("points", "faces", "triangles", "quads", "ngons", "quads_pct", "tris_equiv",
            "boundary_loops", "non_manifold_edges", "shells", "size", "center", "has_uvs",
            "uv_bbox", "poles_6plus", "volume")
    out = {k: rep.get(k) for k in keep}
    out["boundary_loops"] = len(rep.get("boundary_loops") or [])
    out["verdict"] = zb_audit.verdict(rep, profile, **kw)
    return out


def post_process(rec, params):
    """Audits and map fixes on the agent side, after the ZBrush steps."""
    outs = rec["outputs"]
    probs, warns = rec["problems"], rec["warnings"]
    inp = rec.get("input_audit") or {}
    if "export_low" in outs:
        a = _audit(outs["export_low"], "game", expected_holes=inp.get("boundary_loops", 0))
        rec["low_audit"] = a
        if "error" not in a:
            if not a.get("has_uvs"):
                probs.append("low OBJ has no UVs")
            if inp.get("size") and a.get("size"):
                d = max(abs(x - y) / max(abs(x), 1e-9) for x, y in zip(inp["size"], a["size"]))
                if d > 0.02:
                    warns.append(f"low bbox size {a['size']} differs from input {inp['size']} by "
                                 f"{d:.1%}: Export Scale or offsets changed [added 2% tolerance]")
            warns += [f"low: {w}" for w in a["verdict"]["warnings"]]
    if "preview" in outs:
        a = _audit(outs["preview"], "sculpt")
        rec["preview_audit"] = a
    if "normal_map" in outs and params.get("normal_map"):
        raw = outs["normal_map"]
        fin = raw.replace("_normal_raw.png", "_normal.png")
        try:
            rec["normal_fix"] = fix_normal_map(raw, fin, params.get("map_flip_v", True),
                                               params.get("map_flip_green", False))
            st = image_stats(fin)
            rec["normal_stats"] = st
            outs["normal_final"] = fin
            if st["uniform"]:
                probs.append("normal map is one flat colour: nothing was baked")
            elif st["blue_ge_128"] < 0.9:
                warns.append(f"only {st['blue_ge_128']:.0%} of normal-map pixels have blue >= 128: "
                             "world-space map or wrong channels? [added threshold]")
            want = params.get("map_size")
            if want and st["size"] != [want, want]:
                probs.append(f"normal map is {st['size']}, expected {want}")
        except Exception as e:  # PIL missing, unreadable file
            warns.append(f"normal map post-process failed: {e}")


# --------------------------------------------------------------------------------------------
# Per-file processing
# --------------------------------------------------------------------------------------------

def _file_ctx(src, stem, out_dir, stage_dir, audit):
    fout = os.path.join(out_dir, stem)
    os.makedirs(fout, exist_ok=True)
    staged = stage_input(src, stage_dir, stem)
    ctx = {"stem": stem, "input": src, "staged": staged, "out": fout,
           "input_points": None, "input_faces": None}
    inp = None
    if audit and staged.lower().endswith(".obj"):
        inp = _audit(staged, "sculpt")
        if "error" not in inp:
            ctx["input_points"], ctx["input_faces"] = inp["points"], inp["faces"]
    return ctx, inp


def _new_record(src, stem, sha, rhash, inp):
    return {"stem": stem, "input": src, "sha1": sha, "recipe": rhash, "status": "running",
            "started": time.strftime("%Y-%m-%dT%H:%M:%S"), "steps": [], "outputs": {},
            "problems": [], "warnings": [], "input_audit": inp, "attempt": 1}


def _collect_output(rec, name, value):
    if not isinstance(value, dict):
        return
    for key in ("path", "file"):
        p = value.get(key)
        if isinstance(p, str) and os.path.isabs(p) and p.lower().endswith(
                (".obj", ".png", ".ztl", ".goz", ".tif", ".exr")):
            rec["outputs"][name] = p
    ex = value.get("export")
    if isinstance(ex, dict) and ex.get("path"):
        rec["outputs"][name] = ex["path"]
    for sub in ("views",):                       # zb_review.snapshot with a view
        if isinstance(value.get(sub), list) and value[sub] and value[sub][0].get("path"):
            rec["outputs"][name] = value[sub][0]["path"]


def _finish(rec, crit_failed, params):
    """failed: a critical step failed or a check found a problem; partial: only non-critical
    steps failed or were skipped; ok otherwise. Warnings never change the status."""
    if not crit_failed:
        post_process(rec, params)
    if crit_failed or rec["problems"]:
        rec["status"] = "failed"
    elif any(not s.get("ok") for s in rec["steps"]):
        rec["status"] = "partial"
    else:
        rec["status"] = "ok"
    rec["ended"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    return rec


def process_file_bridge(session, src, stem, recipe, params, out_dir, stage_dir, rhash,
                        observed, grace_s=60, audit=True):
    """One file, one step per bridge call. Returns (record, hung_step_or_None)."""
    ctx, inp = _file_ctx(src, stem, out_dir, stage_dir, audit)
    rec = _new_record(src, stem, file_sha1(src), rhash, inp)
    hung, crit_failed = None, False
    for st in recipe:
        use = st
        if st["name"] in session.blocked:
            if st.get("fallback"):
                use = st["fallback"]
            elif not st["critical"]:
                rec["steps"].append({"step": st["name"], "ok": False, "skipped": True,
                                     "error": f"blocked after a hang on {session.blocked[st['name']]}"})
                continue
        base = use["timeout"]
        tmo = int(max(base, min(4 * observed.get(use["name"], 0), 10 * base)))
        r = {"step": use["name"], "ok": False, "seconds": None, "timeout": tmo, "value": None,
             "error": None, "outcome": None}
        t = time.time()
        try:
            args = resolve_refs(use["args"], ctx, params)
            kwargs = resolve_refs(use["kwargs"], ctx, params)
            r["value"] = session.call(use["module"], use["func"], args, kwargs, tmo)
            r["ok"], r["outcome"] = True, "ok"
        except zb_launch.ZBRemoteError as e:
            r["error"], r["outcome"] = str(e), "error"
            r["remote_trace"] = (e.traceback or "")[-1500:]
        except zb_launch.ZBTimeout as e:
            r["error"] = str(e)[:500]
            if session.wait_recovery(grace_s):
                r["outcome"] = "timeout_recovered"      # it ran long; state is uncertain
            else:
                r["outcome"] = "hang"
                hung = use["name"]
        except zb_launch.ZBError as e:                  # bridge gone (crash, quit)
            r["error"], r["outcome"] = str(e)[:500], "bridge_down"
            hung = use["name"]
        except (KeyError, ValueError) as e:             # recipe reference problem
            r["error"], r["outcome"] = f"recipe: {e!r}", "error"
        r["seconds"] = round(time.time() - t, 3)
        if r["ok"]:
            observed[use["name"]] = max(observed.get(use["name"], 0), r["seconds"])
            if isinstance(r["value"], dict) and isinstance(r["value"].get("ctx"), dict):
                ctx.update(r["value"]["ctx"])
            _collect_output(rec, st["name"], r["value"])
            p, w = check_step(use["name"], r["value"], params)
            rec["problems"] += p
            rec["warnings"] += w
        rec["steps"].append(r)
        if hung:
            rec["hang"] = {"step": hung, "evidence": evidence(ctx["out"], hung)}
            crit_failed = crit_failed or st["critical"]
            break
        if not r["ok"] and st["critical"]:
            crit_failed = True
            break
    rec["ctx"] = ctx
    return _finish(rec, crit_failed, params), hung


def process_file_script(src, stem, recipe, params, out_dir, stage_dir, rhash, audit=True,
                        timeout=None, runner=None):
    """One file in its own ZBrush process (-script). runner is run_script_job (injectable)."""
    ctx, inp = _file_ctx(src, stem, out_dir, stage_dir, audit)
    rec = _new_record(src, stem, file_sha1(src), rhash, inp)
    res_path = os.path.join(ctx["out"], "job_result.json")
    job_path = os.path.join(ctx["out"], "job.json")
    write_json_atomic(job_path, {"recipe": recipe, "params": params, "ctx": ctx, "result": res_path})
    tmo = timeout or sum(s["timeout"] for s in recipe) + 180
    run = (runner or run_script_job)(job_path, res_path, timeout=tmo, log_dir=ctx["out"])
    rec["process"] = {k: run.get(k) for k in ("state", "exit_code", "seconds", "ended", "cmd")}
    res = run.get("result") or {}
    by_name = {s["name"]: s for s in recipe}
    for s in res.get("steps", []):
        s = dict(s, outcome="ok" if s.get("ok") else "error")
        rec["steps"].append(s)
        if s.get("ok"):
            _collect_output(rec, s["step"], s.get("value"))
            p, w = check_step(s["step"], s.get("value"), params)
            rec["problems"] += p
            rec["warnings"] += w
    done = res.get("steps", [])
    crit_failed = any(not s.get("ok") and by_name.get(s.get("step"), {}).get("critical", True)
                      for s in done)
    hung = None
    if run.get("state") in ("timeout", "startup_stall"):
        hung = recipe[len(done)]["name"] if len(done) < len(recipe) else "exit"
        rec["hang"] = {"step": hung, "state": run["state"]}
        crit_failed = crit_failed or by_name.get(hung, {}).get("critical", True)
    elif not res.get("finished"):
        rec["problems"].append(f"ZBrush process {run.get('state')} before the job finished "
                               f"(exit code {run.get('exit_code')})")
        crit_failed = True
    rec["ctx"] = res.get("ctx", ctx)
    return _finish(rec, crit_failed, params), hung


# --------------------------------------------------------------------------------------------
# The folder runner
# --------------------------------------------------------------------------------------------

def plan(inputs, out_dir, params=None, recipe=None):
    """Dry run: every file's resolved steps, without ZBrush."""
    params = {**DEFAULT_PARAMS, **(params or {})}
    recipe = recipe or default_recipe(params)
    out_dir = os.path.abspath(out_dir)
    rows = []
    for src, stem in zip(inputs, unique_stems(inputs)):
        ctx = {"stem": stem, "input": src, "out": os.path.join(out_dir, stem),
               "staged": os.path.join(out_dir, "_staged", stem + os.path.splitext(src)[1].lower()),
               "input_points": None, "input_faces": None, "source": "<source>", "low": "<low>"}
        rows.append({"stem": stem, "input": src, "steps": [
            {"name": s["name"], "call": f"{s['module']}.{s['func']}",
             "args": resolve_refs(s["args"], ctx, params),
             "kwargs": resolve_refs(s["kwargs"], ctx, params), "timeout": s["timeout"],
             "critical": s["critical"], "plugin": s["plugin"],
             "fallback": s["fallback"]["func"] if s.get("fallback") else None}
            for s in recipe]})
    return {"params": params, "recipe_hash": recipe_hash(recipe, params), "files": rows}


def write_csv(report, path):
    cols = ["stem", "status", "failed_step", "seconds", "input_faces", "low_faces", "low_quads_pct",
            "uv", "top_faces", "normal_map", "preview_faces", "problems", "warnings"]
    with open(path, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        for stem, r in sorted(report["files"].items()):
            steps = {s["step"]: s for s in r.get("steps", [])}
            bad = next((s["step"] for s in r.get("steps", []) if not s.get("ok")), "")
            proj = (steps.get("project") or {}).get("value") or {}
            la, pa = r.get("low_audit") or {}, r.get("preview_audit") or {}
            w.writerow([stem, r.get("status"), bad,
                        round(sum(s.get("seconds") or 0 for s in r.get("steps", [])), 1),
                        (r.get("input_audit") or {}).get("faces"), la.get("faces"),
                        la.get("quads_pct"), la.get("uv_bbox"), proj.get("top_faces"),
                        r.get("outputs", {}).get("normal_final"), pa.get("faces"),
                        len(r.get("problems", [])), len(r.get("warnings", []))])
    return path


def write_manifest(report, path, target="maya"):
    """Handoff manifest for the next app's agent: per ok or partial file, the outputs, counts,
    Export Scale and the conventions used (map flips, axes, units). The receiving agent
    imports from this, not from guesses."""
    p = report["batch"].get("params", {})
    files = []
    for stem, r in sorted(report["files"].items()):
        if r.get("status") not in ("ok", "partial"):
            continue
        imp = next((s.get("value") for s in r.get("steps", []) if s.get("step") == "import"
                    and s.get("ok")), None) or {}
        files.append({"name": stem, "source": r.get("input"), "status": r.get("status"),
                      "outputs": r.get("outputs", {}), "low_faces": (r.get("low_audit") or {}).get("faces"),
                      "low_size": (r.get("low_audit") or {}).get("size"),
                      "export_settings": imp.get("export"), "warnings": r.get("warnings", [])})
    man = {"target": target, "from": "ZBrush " + str(report["batch"].get("zbrush")),
           "conventions": {"obj_axes": "Y up, +Z toward the front view camera (v03 OBJ analysis)",
                           "units": "ZBrush units x Export Scale; an OBJ import sets Export Scale "
                                    "to the file's size (Outgang)",
                           "normal_map": {"space": "tangent", "flip_v": p.get("map_flip_v"),
                                          "green": "DirectX (-Y)" if p.get("map_flip_green")
                                          else "OpenGL (+Y)"},
                           "preview": "Decimation Master triangles"},
           "files": files}
    write_json_atomic(path, man)
    return path


def write_sheet(report, path):
    """Contact sheet of every file's canvas snapshot, labelled stem | status | low faces
    (zb_review.contact_sheet). The agent opens it: numbers alone do not show a melted
    DynaMesh or projection spikes."""
    shots, labels = [], []
    for stem, r in sorted(report["files"].items()):
        p = r.get("outputs", {}).get("snapshot")
        if p and os.path.exists(p):
            shots.append(p)
            labels.append(f"{stem} | {r.get('status')} | low {(r.get('low_audit') or {}).get('faces')}")
    if not shots:
        return None
    import zb_review
    return zb_review.contact_sheet(shots, labels, path, title="batch " + report["batch"]["started"])


def summarize(report):
    files = report["files"].values()
    by = {}
    for r in files:
        by[r.get("status")] = by.get(r.get("status"), 0) + 1
    report["batch"]["counts"] = by
    report["batch"]["problems"] = sum(len(r.get("problems", [])) for r in files)
    return by


def run_folder(inputs, out_dir, params=None, recipe=None, mode="bridge", session=None,
               resume=True, restart_every=10, retry_fallback=True, grace_s=60, audit=True,
               sheet=True, quit_at_end=True, stop_file="STOP", script_runner=None):
    """Run the recipe on every input. Writes <out>/report.json after every file (atomic),
    then report.csv and sheet.png. Resume skips files whose sha1 and recipe hash match an
    ok record. A file named STOP in <out> ends the batch between files."""
    params = {**DEFAULT_PARAMS, **(params or {})}
    recipe = recipe or default_recipe(params)
    rhash = recipe_hash(recipe, params)
    out_dir = os.path.abspath(out_dir)
    stage_dir = os.path.join(out_dir, "_staged")
    os.makedirs(out_dir, exist_ok=True)
    rp = os.path.join(out_dir, "report.json")
    report = read_json(rp) if resume else None
    if not report or "files" not in report:
        report = {"batch": {}, "files": {}}
    report["batch"].update(started=time.strftime("%Y-%m-%dT%H:%M:%S"), mode=mode,
                           recipe_hash=rhash, params=params, out=out_dir, inputs=len(inputs),
                           aborted=None, restarts=0, blocked={}, notes=[])
    stems = unique_stems(inputs)
    observed = {}
    if mode == "bridge":
        session = session or BridgeSession()
    try:
        if mode == "bridge":
            session.ensure()
            report["batch"]["zbrush"] = session.version
        for src, stem in zip(inputs, stems):
            if stop_file and os.path.exists(os.path.join(out_dir, stop_file)):
                report["batch"]["notes"].append(f"{stop_file} file found before {stem}")
                break
            prev = report["files"].get(stem)
            if resume and prev and prev.get("status") == "ok" and prev.get("recipe") == rhash \
                    and prev.get("sha1") == file_sha1(src):
                continue
            if mode == "bridge":
                if session.owned and session.files_since_restart >= restart_every:
                    session.restart("scheduled restart (tool list and memory growth)")
                rec, hung = process_file_bridge(session, src, stem, recipe, params, out_dir,
                                                stage_dir, rhash, observed, grace_s, audit)
                session.files_since_restart += 1
                if hung:
                    session.hangs[hung] = session.hangs.get(hung, 0) + 1
                    by_name = {s["name"]: s for s in recipe}
                    if by_name.get(hung, {}).get("plugin") or by_name.get(hung, {}).get("fallback"):
                        session.blocked[hung] = stem
                    report["files"][stem] = rec
                    write_json_atomic(rp, report)
                    if session.hangs[hung] >= session.hang_abort and hung not in session.blocked:
                        raise BatchAbort(f"step {hung} hung on {session.hangs[hung]} files")
                    session.restart(f"hang in {hung} on {stem}")
                    if retry_fallback and by_name.get(hung, {}).get("fallback"):
                        rec2, _ = process_file_bridge(session, src, stem, recipe, params, out_dir,
                                                      stage_dir, rhash, observed, grace_s, audit)
                        rec2["attempt"] = 2
                        rec2["first_attempt"] = {"hang": rec.get("hang"), "steps": rec["steps"]}
                        rec = rec2
                        session.files_since_restart += 1
            else:
                rec, hung = process_file_script(src, stem, recipe, params, out_dir, stage_dir,
                                                rhash, audit, runner=script_runner)
                if hung and rec.get("hang", {}).get("state") == "startup_stall":
                    report["files"][stem] = rec
                    write_json_atomic(rp, report)
                    raise BatchAbort(f"ZBrush -script launch stalled on {stem}")
            report["files"][stem] = rec
            write_json_atomic(rp, report)
    except BatchAbort as e:
        report["batch"]["aborted"] = str(e)
    finally:
        if mode == "bridge" and session is not None:
            report["batch"]["restarts"] = session.restarts
            report["batch"]["blocked"] = dict(session.blocked)
            report["batch"]["session_log"] = session.log[-20:]
            if quit_at_end and not report["batch"]["aborted"]:
                try:
                    report["batch"]["quit"] = session.close()
                except Exception as e:  # never lose the report over a quit problem
                    report["batch"]["quit_error"] = repr(e)
        report["batch"]["ended"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        summarize(report)
        write_json_atomic(rp, report)
        try:
            report["batch"]["csv"] = write_csv(report, os.path.join(out_dir, "report.csv"))
            report["batch"]["manifest"] = write_manifest(report, os.path.join(out_dir, "manifest.json"))
            if sheet:
                report["batch"]["sheet"] = write_sheet(report, os.path.join(out_dir, "sheet.png"))
        except Exception as e:
            report["batch"]["report_error"] = repr(e)
        write_json_atomic(rp, report)
    return report


# --------------------------------------------------------------------------------------------
# -script mode
# --------------------------------------------------------------------------------------------

def script_command(job_path, scene=None, zbrush_bin=None, job_py=JOB_PY):
    """ZBrush -script <job_py> --job <job.json> [scene]: scene LAST (Maxon quickstart)."""
    cmd = [zbrush_bin or zb_launch.ZBRUSH_BIN, "-script", job_py, "--job", os.path.abspath(job_path)]
    if scene:
        cmd.append(os.path.abspath(scene))
    return cmd


def run_script_job(job_path, result_path, timeout=1800, scene=None, startup_timeout=180,
                   quit_grace=20, log_dir=None, popen=None, is_running=None, quit_fn=None,
                   poll=1.0):
    """Spawn one ZBrush for one job and watch its result file. States: finished (the job
    wrote finished=True), exited (process ended first), timeout, startup_stall (no result
    file within startup_timeout: the 05:30 kind of stall, README). A process still alive
    after `finished` + quit_grace is asked to quit (zb_launch.stop, which also answers the
    save prompt when the screen is unlocked); on timeout it is terminated."""
    is_running = is_running or zb_launch.is_running
    if is_running():
        raise BatchAbort("ZBrush is already running: -script needs a fresh process (single "
                         "instance; a second launch may hand the script to the running one "
                         "[verify])")
    popen = popen or subprocess.Popen
    env = os.environ.copy()
    env.pop("ZB_BRIDGE_AUTOSERVE", None)
    cmd = script_command(job_path, scene)
    log_path = os.path.join(log_dir or os.path.dirname(os.path.abspath(result_path)), "zbrush_script.log")
    t0 = time.time()
    with open(log_path, "a") as log:
        log.write(f"\n--- {time.strftime('%Y-%m-%d %H:%M:%S')} {cmd}\n")
        log.flush()
        proc = popen(cmd, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                     start_new_session=True, env=env)
        while True:
            res = read_json(result_path)
            if res and res.get("finished"):
                state = "finished"
                break
            if proc.poll() is not None:
                state = "exited"
                break
            el = time.time() - t0
            if res is None and el > startup_timeout:
                state = "startup_stall"
                break
            if el > timeout:
                state = "timeout"
                break
            time.sleep(poll)
        ended = "self" if proc.poll() is not None else None
        if ended is None and state == "finished":
            end = time.time() + quit_grace
            while time.time() < end and proc.poll() is None:
                time.sleep(poll)
            if proc.poll() is None:
                (quit_fn or (lambda: zb_launch.stop(save_to=None, force=True)))()
                ended = "asked_to_quit"
            else:
                ended = "self_after_finish"
        if ended is None:
            proc.terminate()
            try:
                proc.wait(15)
                ended = "terminated"
            except subprocess.TimeoutExpired:
                proc.kill()
                ended = "killed"
    return {"state": state, "exit_code": proc.poll(), "result": read_json(result_path),
            "seconds": round(time.time() - t0, 1), "ended": ended, "cmd": cmd, "log": log_path}


# --------------------------------------------------------------------------------------------
# Learning paths: the Activity log oracle
# --------------------------------------------------------------------------------------------

_ACT = re.compile(r'^(IPress|IUnPress|ISet|IToggle|IModSet|IKeyPress|IClick),\s*"([^"]+)"(?:,\s*(.*))?$')


def canonical(path):
    """Item paths ignore case and spaces (SDK Item Paths): compare them this way."""
    return re.sub(r"\s+", "", path).lower()


def parse_activity(text):
    """ZBrush's Activity log (<Asset Directory>/Logs/Activity/Activity <date>.txt) writes one
    line per press or set with the canonical path, e.g. 'IPress, "Tool:Geometry:DynaMesh"'
    (the 05:20 session log). Strokes are not logged ('Click in Canvas' only)."""
    rows = []
    for line in text.splitlines():
        m = _ACT.match(line.strip())
        if m:
            val = m.group(3)
            try:
                val = float(val) if val is not None else None
            except ValueError:
                pass
            rows.append({"verb": m.group(1), "path": m.group(2), "value": val,
                         "canonical": canonical(m.group(2))})
        elif line.strip():
            rows.append({"verb": "other", "text": line.strip()})
    return rows


class ActivityWatch:
    """mark() before a human, a computer-use agent or a macro presses buttons; entries()
    afterwards returns what was pressed, with canonical paths. The path oracle that needs no
    macro recording and no save dialog."""

    def __init__(self, path=None):
        logs = zb_launch.activity_logs()
        self.path = path or (logs[-1] if logs else None)
        self.offset = 0

    def mark(self):
        self.offset = os.path.getsize(self.path) if self.path and os.path.exists(self.path) else 0
        return self.offset

    def entries(self):
        if not self.path or not os.path.exists(self.path):
            return []
        with open(self.path, errors="ignore") as fh:
            fh.seek(self.offset)
            text = fh.read()
            self.offset = fh.tell()
        return parse_activity(text)


# --------------------------------------------------------------------------------------------
# ZScript helpers: key-answer macros and the file-drop channel
# --------------------------------------------------------------------------------------------

def keypress_macro_text(key, press_path, info="agent helper: press with a key held"):
    """A macro that presses an item while holding a key, the way Maxon's shipped Delete All
    macro answers its confirmation: [IKeyPress,'2',[IPress,Tool:SubTool:Del All]]. Python's
    press_key is 'Does not work' (2026.1 stub), so Python presses this macro instead
    (pocacola, Maxon forum 2026-04) [verify]."""
    if '"' in press_path or "'" in key:
        raise ValueError("quotes are not allowed in the key or the path")
    return (f'// generated by zb_batch.keypress_macro_text\n[IButton,???,"{info}",\n'
            f'  [IShowActions,0]\n  [IKeyPress,\'{key}\',[IPress,"{press_path}"]]\n]\n')


def install_macro(text, name, folder="AgentHelpers", asset_dir=None):
    """Write <Asset Directory>/ZStartup/Macros/<folder>/<name>.txt. Rules (interfaces doc):
    subfolder required, file name of 8+ characters, a new folder appears after a restart.
    Never overwrites. This adds a visible Macro palette entry: ask the user first."""
    if len(name) < 8:
        raise ValueError("macro file names need 8 or more characters or ZBrush skips them")
    if not asset_dir:
        dirs = glob.glob(os.path.expanduser("~/Library/Preferences/Maxon/ZBrush_*"))
        if not dirs:
            raise FileNotFoundError("no ZBrush Asset Directory found")
        asset_dir = dirs[0]
    d = os.path.join(asset_dir, "ZStartup", "Macros", folder)
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, name + ".txt")
    if os.path.exists(p):
        raise FileExistsError(f"{p} exists: pick a new name (never overwrite)")
    with open(p, "w") as fh:
        fh.write(text)
    return {"path": p, "restart_needed": True, "press": f"Macro:{folder}:{name} [verify]"}


def filedrop_job_text(body, signal_path):
    """A ZScript that runs on load (wrapped in [If,1,...], marcus_civis) and signals the end
    with VarSave to an absolute path (usd-portal's completion signal; ZBrush 2026 redirects
    bare names into a temp sandbox). For a ZBrush without the bridge."""
    if not os.path.isabs(signal_path):
        raise ValueError("signal path must be absolute")
    return (f'[VarDef,agentDone,0]\n[If,1,\n  [IFreeze,\n{body}\n  ]\n'
            f'  [VarSet,agentDone,1]\n  [VarSave,agentDone,"{signal_path}"]\n]\n')


def run_filedrop(job_txt, signal_path, timeout=180, poll=0.5):
    """Hand a ZScript to the running ZBrush with open -a (GoB's macOS pattern) and wait for
    its signal [verify on 2026.2.1]. It ends any active ZScript and steals focus; no return
    value or error beyond the files it writes."""
    app = zb_launch.ZBRUSH_APP
    subprocess.run(["open", "-a", app, os.path.abspath(job_txt)], capture_output=True, timeout=30)
    t0 = time.time()
    base = os.path.basename(signal_path)
    while time.time() - t0 < timeout:
        if os.path.exists(signal_path):
            return {"done": True, "signal": signal_path, "seconds": round(time.time() - t0, 1)}
        hits = glob.glob(f"/private/var/folders/*/*/T/ZBrushData2026*/**/{base}", recursive=True)
        if hits:
            return {"done": True, "signal": hits[0], "sandboxed": True,
                    "seconds": round(time.time() - t0, 1)}
        time.sleep(poll)
    return {"done": False, "seconds": timeout}


# --------------------------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------------------------

def _cli(argv=None):
    import argparse
    ap = argparse.ArgumentParser(description="Batch ZBrush jobs over a folder")
    ap.add_argument("cmd", choices=("plan", "run", "activity"))
    ap.add_argument("--in", dest="src")
    ap.add_argument("--out")
    ap.add_argument("--params")
    ap.add_argument("--pattern", default="*.obj")
    ap.add_argument("--mode", default="bridge", choices=("bridge", "script"))
    ap.add_argument("--no-resume", action="store_true")
    ns = ap.parse_args(argv)
    if ns.cmd == "activity":
        w = ActivityWatch()
        print(json.dumps({"file": w.path, "entries": w.entries()[-40:]}, indent=1))
        return 0
    params = read_json(ns.params, {}) if ns.params else {}
    files = discover(ns.src, (ns.pattern,))
    if ns.cmd == "plan":
        print(json.dumps(plan(files, ns.out, params), indent=1))
        return 0
    rep = run_folder(files, ns.out, params, mode=ns.mode, resume=not ns.no_resume)
    print(json.dumps({"counts": rep["batch"].get("counts"), "aborted": rep["batch"].get("aborted"),
                      "report": os.path.join(os.path.abspath(ns.out), "report.json")}, indent=1))
    return 0 if not rep["batch"].get("aborted") else 3


if __name__ == "__main__":
    sys.exit(_cli())
