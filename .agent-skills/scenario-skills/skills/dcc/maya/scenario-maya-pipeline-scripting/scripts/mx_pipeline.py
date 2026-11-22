"""
mx_pipeline: the pipeline TD layer on top of scenario-maya-expert's toolkit (Maya 2027).

STATUS: not yet run in Maya (written 2026-09-24, Maya 2027 not installed). The parent side
(batch runner driven through a fake mayapy, FBX command lists, Alembic job strings, USD
flag sets, weight capping math, matrix and naming checks, diffs, reports) ran offline with
python3: tests/code/maya-pipeline-scripting/test_offline_*.py. Every call into maya.cmds,
maya.mel, OpenMaya or pxr is unverified and marked [verify] where a flag is uncertain.

Builds on scenario-maya-expert/scripts and never duplicates it:
  mx_run       one mayapy child per job, MX_RESULT protocol, open/save, plug-in aliases
  mx_validate  scene validation profiles and SAFE_FIXES (called, not copied)
  mx_audit     per-mesh numbers;  mx_review  renders;  mx_bridge  live GUI session
This module adds the batch-over-many-files layer, engine export checks, FBX presets for
Unreal and Unity, Alembic and GPU cache helpers, USD export and verification, USD shot
layers, references and namespaces, publish diffs and a performance census.

PARENT SIDE (any python3, no Maya needed)
  import sys; sys.path.insert(0, "<skills>/scenario-maya-pipeline-scripting/scripts")
  import mx_pipeline as P
  scenes = P.find_scenes("/abs/assets")                        # *.ma, *.mb, skips archive/, versions/
  s = P.batch(scenes, "/abs/job.py", "/abs/out", plugins=("fbx",), timeout=900, workers=2)
  s = P.batch(scenes, P.BUILTIN_EXPORT, "/abs/out", plugins=("fbx",),
              job_args=["--preset", "unreal_skeletal", "--profile", "rig"])
  P.fbx_commands("unreal_skeletal")        # the exact MEL lines an export will run
  P.publish_diff(old_manifest, new_manifest)   # added / modified / removed (Borderlands)
  P.preflight("/abs/out", scenes)          # mayapy, localhost and hostname resolution, disk, scenes
  P.parse_fbx_log(text); P.find_fbx_log(name, since)   # the FBX exporter's own log, per child
  P.compare_stats(before, after)           # counts, per-mesh bbox, normal directions, units, up axis
  P.time_unit_issues("ntsc", 30, "anim"); P.reference_issues(P.references_report())   # pure checks
Shell:
  python3 mx_pipeline.py batch  --files DIR --job JOB.py --out OUT [--plugins fbx] [-- job args]
  python3 mx_pipeline.py export --files DIR --out OUT --preset unreal_skeletal [--workers 2]
  python3 mx_pipeline.py diff OLD_summary.json NEW_summary.json
  python3 mx_pipeline.py fbx-commands unreal_anim --bake 1 48
  python3 mx_pipeline.py preflight --out OUT [--files DIR]

CHILD SIDE (inside mayapy after maya.standalone.initialize, or the GUI through mx_bridge)
  P.check_engine_export(roots, engine="unreal", kind="skeletal")   # issues, read-only
  P.fbx_export(path, roots, "unreal_skeletal")                      # push/reset/set/query/pop
  P.fbx_takes(path); P.scene_stats(roots); P.reimport_stats(path)   # verification
  P.read_fbx_log(since=t0); P.mesh_normals(shape)                   # log and normals signature
  P.abc_export(path, roots, 1, 48); P.abc_verify(path, samples)
  P.gpu_cache_export(roots, dir, name); P.gpu_cache_load(path)
  P.usd_export(path, roots, frame_range=(1, 48)); P.usd_verify(path, expect)
  P.usd_shot_layers(dir, "sh010", sequence_layer=...); P.mute_own_and_stronger(stage, layer)
  P.reference(path, "char01"); P.references_report(); P.swap_reference(ref, path)
  P.breakdown(manifest); P.perf_census(); P.eval_timing(1, 48, ["body_geo"])

Batch contract: the job runs in a fresh mayapy per scene (mx_run.run_subprocess) with the
scene opened, script nodes off. Env vars MX_PIPELINE_OUT, MX_PIPELINE_STEM, MX_PIPELINE_SOURCE
tell it where to write. It returns a dict; recognised keys: status (pass|fixed|warn|fail),
issues [{id, severity error|warning|info, msg, node}], fixes [...], exports [{path, kind,
sha1}]. The runner never lets a job save over its source (mx_run refuses), records the source
sha1 before and after, and writes reports/<stem>.json, logs/<stem>.log, summary.json/.csv.
"""

__version__ = "0.1"  # Maya Expert Skills v0.1 (2026-09-24)
import csv
import fnmatch
import glob
import hashlib
import json
import math
import os
import re
import shutil
import socket
import sys
import tempfile
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
EXPERT_SCRIPTS = os.path.normpath(os.path.join(HERE, "..", "..", "scenario-maya-expert", "scripts"))
for _p in (EXPERT_SCRIPTS, HERE):
    if os.path.isdir(_p) and _p not in sys.path:
        sys.path.insert(0, _p)

import mx_run  # noqa: E402  (scenario-maya-expert toolkit; pure Python at import time)

THIS_FILE = os.path.abspath(__file__)
BUILTIN_EXPORT = "builtin:export"
SCENE_PATTERNS = ("*.ma", "*.mb")
SKIP_DIRS = ("archive", "versions", "incrementalSave", "__pycache__", "autosave")
FAILED_STATUSES = ("fail", "error", "timeout", "crash", "maya_init_failed", "no_mayapy")
TRANSIENT_STATUSES = ("error", "timeout", "crash", "maya_init_failed", "no_mayapy")


# =============================================================================== helpers
def _safe(s):
    return re.sub(r"[^A-Za-z0-9_.\-]+", "_", s).strip("_") or "scene"


def _leaf(n):
    return n.rsplit("|", 1)[-1]


def strip_ns(name):
    """'|a:grp|a:b:geo' -> 'geo' (leaf, namespaces removed)."""
    return _leaf(name).rsplit(":", 1)[-1]


def mel_str(s):
    """Quote a Python string as a MEL string literal (paths with spaces, quotes, backslashes)."""
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'


def file_sha1(path, block=1 << 20):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(block), b""):
            h.update(chunk)
    return h.hexdigest()


def _json_default(o):
    try:
        return list(o)
    except TypeError:
        return repr(o)


def write_json(path, data):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=1, default=_json_default)
    os.replace(tmp, path)
    return path


def read_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


# =============================================================================== discovery
def find_scenes(root, patterns=SCENE_PATTERNS, recursive=True, skip_dirs=SKIP_DIRS):
    """Scene files under root (or root itself if it is a file), sorted. Skips hidden folders,
    archive/, versions/, incrementalSave/ and autosave/ [added: the places old copies live]."""
    root = os.path.abspath(root)
    if os.path.isfile(root):
        return [root]
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in skip_dirs and not d.startswith("."))
        for fn in sorted(filenames):
            if not fn.startswith(".") and any(fnmatch.fnmatch(fn, p) for p in patterns):
                out.append(os.path.join(dirpath, fn))
        if not recursive:
            break
    return out


def unique_stems(paths):
    """{path: report stem}. Same file name in two folders gets the relative folder in its stem."""
    paths = [os.path.abspath(p) for p in paths]
    by_base = {}
    for p in paths:
        by_base.setdefault(os.path.splitext(os.path.basename(p))[0], []).append(p)
    common = os.path.commonpath([os.path.dirname(p) for p in paths]) if paths else ""
    out, used = {}, set()
    for p in paths:
        base = os.path.splitext(os.path.basename(p))[0]
        if len(by_base[base]) == 1:
            stem = _safe(base)
        else:
            rel = os.path.relpath(os.path.splitext(p)[0], common)
            stem = _safe(rel.replace(os.sep, "__"))
        s, i = stem, 2
        while s in used:
            s = "%s_%d" % (stem, i)
            i += 1
        used.add(s)
        out[p] = s
    return out


# =============================================================================== batch runner
def classify(res):
    """Status of one mx_run child result."""
    code = res.get("exit_code")
    if code == 5:
        return "no_mayapy"
    if code == 4:
        return "timeout"
    if res.get("init_failed") or code == 3:
        return "maya_init_failed"
    if not res.get("ok"):
        return "error" if res.get("traceback") else "crash"
    r = res.get("result")
    if isinstance(r, dict):
        st = r.get("status")
        if st in ("pass", "fixed", "warn", "fail"):
            return st
        if r.get("passed") is False:
            return "fail"
    return "pass"


def issue_counts(result):
    iss = result.get("issues") if isinstance(result, dict) else None
    iss = iss or []
    c = {"errors": 0, "warnings": 0, "infos": 0}
    for i in iss:
        sev = (i or {}).get("severity", "error")
        c["errors" if sev in ("error", "fail") else "warnings" if sev in ("warning", "warn") else "infos"] += 1
    c["fixes"] = len(result.get("fixes") or []) if isinstance(result, dict) else 0
    c["exports"] = len(result.get("exports") or []) if isinstance(result, dict) else 0
    return c


def _job_signature(job, job_args, plugins):
    h = hashlib.sha1()
    for part in [job] + list(job_args) + list(plugins):
        h.update(str(part).encode("utf-8"))
        h.update(b"\0")
    if os.path.isfile(job):
        h.update(file_sha1(job).encode())
    return h.hexdigest()[:16]


def _resolve_job(job, job_args):
    if job == BUILTIN_EXPORT:
        return THIS_FILE, ["job-export"] + list(job_args)
    return os.path.abspath(job), list(job_args)


def _child_env(out_dir, stem, scene, env):
    e = dict(env or {})
    pp = [HERE, EXPERT_SCRIPTS] + ([os.environ["PYTHONPATH"]] if os.environ.get("PYTHONPATH") else [])
    e.setdefault("PYTHONPATH", os.pathsep.join(pp))
    e.update({"MX_PIPELINE_OUT": out_dir, "MX_PIPELINE_STEM": stem, "MX_PIPELINE_SOURCE": scene,
              # parallel sessions collide on the FBX log name (What's New in Maya 2025): one per child
              "MAYA_FBX_LOG_FILENAME": "mx_fbx_%s" % stem, "MAYA_FBX_LOG_DATETIME_ISO": "1"})
    return e


def _save_as_path(pattern, out_dir, stem, scene):
    if not pattern:
        return None
    ext = os.path.splitext(scene)[1] or ".ma"
    return os.path.abspath(pattern.format(out=out_dir, stem=stem, ext=ext))


def _finish_record(rec, res, status, out_dir, stem, scene, keep_log_tail):
    rec.update(status=status, exit_code=res.get("exit_code"), seconds=res.get("seconds_wall", res.get("seconds")),
               error=res.get("error"), result=res.get("result"), maya=(res.get("maya") or {}).get("maya_version"),
               plugins=res.get("plugins"), saved=res.get("saved"))
    if res.get("teardown_warning"):
        rec["teardown_warning"] = res["teardown_warning"]
    if keep_log_tail or status in FAILED_STATUSES:
        rec["log_tail"] = res.get("log_tail")
        if res.get("traceback"):
            rec["traceback"] = res["traceback"]
    partial = os.path.join(out_dir, "reports", stem + ".partial.json")
    if status in ("crash", "timeout") and os.path.isfile(partial):
        rec["partial"] = read_json(partial)            # e.g. exported before the verify step died
    rec.update(issue_counts(rec.get("result")))
    try:
        rec["sha1_after"] = file_sha1(scene)
        rec["source_untouched"] = rec["sha1_after"] == rec.get("sha1_before")
    except OSError as exc:
        rec["source_untouched"] = False
        rec["error"] = (rec.get("error") or "") + " | source unreadable after job: %s" % exc
    return rec


def _run_process(scene, stem, job_path, args, out_dir, plugins, timeout, save_as, retries, env,
                 mayapy, script_nodes, require_plugins, sig, keep_log_tail, maya_log=None):
    rec = {"scene": scene, "stem": stem, "isolation": "process", "job_signature": sig,
           "started": time.strftime("%Y-%m-%d %H:%M:%S")}
    try:
        rec["sha1_before"] = file_sha1(scene)
    except OSError as exc:
        rec.update(status="error", error="cannot read scene: %s" % exc)
        return rec
    log = os.path.join(out_dir, "logs", stem + ".log")
    attempt = 0
    while True:
        res = mx_run.run_subprocess(job_path, args, scene=scene, plugins=plugins, timeout=timeout,
                                    save_as=save_as, require_plugins=require_plugins,
                                    script_nodes=script_nodes, mayapy=mayapy,
                                    env=_child_env(out_dir, stem, scene, env), log_path=log, maya_log=maya_log)
        status = classify(res)
        if status in ("crash", "timeout") and attempt < retries:
            attempt += 1
            continue
        break
    rec["attempts"] = attempt + 1
    rec["log"] = log
    return _finish_record(rec, res, status, out_dir, stem, scene, keep_log_tail)


def batch(scenes, job, out_dir, job_args=(), plugins=(), timeout=900, workers=1, save_as=None,
          isolation="process", chunk=20, resume=True, retries=0, env=None, mayapy=None,
          script_nodes=False, require_plugins=True, keep_log_tail=False, echo=True, maya_log=None):
    """Run `job` over every scene and write the reports. Returns the summary dict.

    isolation="process" (default): one mayapy per scene: a crash, a hang or a leak costs one
      file, and every file starts from factory state (FBX settings, optionVars, plug-ins).
    isolation="session": one mayapy per `chunk` scenes with a new scene between files (faster
      start-up, shared global state). Files a crash or a chunk timeout took down are re-run
      in process mode automatically.
    save_as: None, or a pattern like "{out}/fixed/{stem}_fixed{ext}"; mx_run saves after the
      job returns and refuses the source path. Prefer jobs that save only when they fixed
      something (save_version()).
    resume: reuse reports whose source sha1 and job signature match and whose status was not
      transient (error, timeout, crash).
    workers: parallel mayapy children. Each takes a licence and RAM [verify licence use of
      concurrent mayapy on the installed licence]; measure on 5 files before raising it.
    maya_log: Maya's stderr level in the children (mx_run sets MAYA_DISABLE_ADP=1 and
      "warning" by default; "all" to debug a file that fails without a message)."""
    if job == BUILTIN_EXPORT and save_as:
        raise ValueError("the builtin export job saves its own fixed version and re-imports the FBX into a "
                         "new scene; save_as would save that scene: leave save_as None")
    if isolation not in ("process", "session"):
        raise ValueError("isolation must be 'process' or 'session'")
    out_dir = os.path.abspath(out_dir)
    for d in ("reports", "logs"):
        os.makedirs(os.path.join(out_dir, d), exist_ok=True)
    scenes = [os.path.abspath(s) for s in scenes]
    stems = unique_stems(scenes)
    job_path, args = _resolve_job(job, job_args)
    mayapy = mayapy or mx_run.find_mayapy()
    sig = _job_signature(job_path, args, plugins)
    t0 = time.time()
    records, todo = {}, []
    for s in scenes:
        rp = os.path.join(out_dir, "reports", stems[s] + ".json")
        old = read_json(rp) if resume else None
        if old and old.get("job_signature") == sig and old.get("status") not in TRANSIENT_STATUSES:
            try:
                same = old.get("sha1_before") == file_sha1(s)
            except OSError:
                same = False
            if same:
                old["resumed"] = True
                records[s] = old
                continue
        todo.append(s)
    lock = threading.Lock()

    def _done(rec):
        write_json(os.path.join(out_dir, "reports", rec["stem"] + ".json"), rec)
        with lock:
            records[rec["scene"]] = rec
            if echo:
                print("%-9s %6.1fs  %s" % (rec.get("status"), rec.get("seconds") or 0, rec["scene"]), flush=True)

    def _proc(s):
        _done(_run_process(s, stems[s], job_path, args, out_dir, plugins, timeout,
                           _save_as_path(save_as, out_dir, stems[s], s), retries, env, mayapy,
                           script_nodes, require_plugins, sig, keep_log_tail, maya_log))

    if isolation == "session" and todo:
        leftovers = []
        groups = [todo[i:i + max(1, chunk)] for i in range(0, len(todo), max(1, chunk))]

        def _chunk(gi_group):
            gi, group = gi_group
            leftovers.extend(_run_session_chunk(gi, group, stems, job_path, args, out_dir, plugins,
                                                timeout, save_as, env, mayapy, script_nodes,
                                                require_plugins, sig, _done, maya_log))

        with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
            list(ex.map(_chunk, enumerate(groups)))
        todo = leftovers
    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        list(ex.map(_proc, todo))
    ordered = [records[s] for s in scenes if s in records]
    meta = {"job": job, "job_path": job_path, "job_args": args, "plugins": list(plugins),
            "isolation": isolation, "workers": workers, "timeout": timeout, "mayapy": mayapy, "maya_log": maya_log,
            "seconds": round(time.time() - t0, 1), "finished": time.strftime("%Y-%m-%d %H:%M:%S")}
    return write_summary(ordered, out_dir, meta)


def _run_session_chunk(gi, group, stems, job_path, args, out_dir, plugins, timeout, save_as, env,
                       mayapy, script_nodes, require_plugins, sig, done, maya_log=None):
    """One mayapy for several scenes. Returns the scenes to re-run in process mode."""
    items = []
    for s in group:
        try:
            sha = file_sha1(s)
        except OSError:
            sha = None
        items.append({"scene": s, "stem": stems[s], "sha1_before": sha,
                      "save_as": _save_as_path(save_as, out_dir, stems[s], s)})
    list_path = write_json(os.path.join(out_dir, "sessions", "chunk_%03d.json" % gi), items)
    log = os.path.join(out_dir, "logs", "session_chunk_%03d.log" % gi)
    cargs = ["session", list_path, job_path, out_dir, "1" if script_nodes else "0", "--"] + list(args)
    res = mx_run.run_subprocess(THIS_FILE, cargs, plugins=plugins,
                                timeout=(timeout * len(group)) if timeout else None,
                                require_plugins=require_plugins, mayapy=mayapy,
                                env=_child_env(out_dir, "session_%03d" % gi, "", env), log_path=log,
                                maya_log=maya_log)
    leftovers = []
    for it in items:
        sp = os.path.join(out_dir, "reports", it["stem"] + ".session.json")
        srec = read_json(sp)
        if not srec:
            leftovers.append(it["scene"])       # never reached, or the chunk died on it
            continue
        fake = {"ok": srec.get("ok"), "exit_code": 0 if srec.get("ok") else 1, "result": srec.get("result"),
                "error": srec.get("error"), "traceback": srec.get("traceback"), "seconds": srec.get("seconds"),
                "maya": srec.get("maya"), "saved": srec.get("saved")}
        rec = {"scene": it["scene"], "stem": it["stem"], "isolation": "session", "job_signature": sig,
               "sha1_before": it["sha1_before"], "log": log, "chunk_exit_code": res.get("exit_code")}
        done(_finish_record(rec, fake, classify(fake), out_dir, it["stem"], it["scene"], False))
    return leftovers


def _session_main(argv):
    """Child side of isolation='session' (runs inside mayapy through mx_run)."""
    list_path, job, out_dir, script_nodes = argv[0], argv[1], argv[2], argv[3] == "1"
    job_args = argv[5:] if len(argv) > 4 and argv[4] == "--" else argv[4:]
    import maya.cmds as cmds
    items = read_json(list_path, [])
    info = mx_run.session_info()
    done = []
    for it in items:
        t0 = time.time()
        os.environ.update({"MX_PIPELINE_OUT": out_dir, "MX_PIPELINE_STEM": it["stem"],
                           "MX_PIPELINE_SOURCE": it["scene"]})
        rec = {"scene": it["scene"], "stem": it["stem"], "ok": False, "maya": info}
        try:
            cmds.file(new=True, force=True)          # state not reset: FBX settings, optionVars, plug-ins
            mx_run.open_scene(it["scene"], script_nodes=script_nodes)
            rec["result"] = mx_run._exec_job(job, job_args)
            rec["ok"] = True
            if it.get("save_as"):
                rec["saved"] = mx_run.save_scene(it["save_as"], source=it["scene"])
        except BaseException as exc:                  # noqa: B902 (a job's sys.exit must not end the chunk)
            rec["error"] = "%s: %s" % (type(exc).__name__, exc)
            rec["traceback"] = traceback.format_exc()
        rec["seconds"] = round(time.time() - t0, 2)
        write_json(os.path.join(out_dir, "reports", it["stem"] + ".session.json"), rec)
        done.append(it["stem"])
    return {"done": done}


def write_summary(records, out_dir, meta=None):
    totals = {}
    for r in records:
        totals[r.get("status", "?")] = totals.get(r.get("status", "?"), 0) + 1
    untouched = all(r.get("source_untouched", True) for r in records)
    summary = {"meta": meta or {}, "totals": totals, "files": len(records),
               "failed": sum(1 for r in records if r.get("status") in FAILED_STATUSES),
               "sources_untouched": untouched, "records": records}
    write_json(os.path.join(out_dir, "summary.json"), summary)
    with open(os.path.join(out_dir, "summary.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["scene", "status", "errors", "warnings", "fixes", "exports", "seconds", "source_untouched",
                    "error", "log"])
        for r in records:
            w.writerow([r.get("scene"), r.get("status"), r.get("errors", 0), r.get("warnings", 0),
                        r.get("fixes", 0), r.get("exports", 0), r.get("seconds"), r.get("source_untouched"),
                        (r.get("error") or "")[:200], r.get("log")])
    return summary


def export_manifest(summary):
    """{name: {path, sha1, kind, scene}} of every export listed in a batch summary."""
    man = {}
    for r in summary.get("records", []):
        res = r.get("result") if isinstance(r.get("result"), dict) else {}
        for e in res.get("exports") or []:
            name = os.path.basename(e.get("path", ""))
            man[name] = {"path": e.get("path"), "sha1": e.get("sha1"), "kind": e.get("kind"), "scene": r.get("scene")}
    return man


def publish_diff(old, new, hash_key="sha1"):
    """Borderlands publish diff: added (green), modified (blue), removed (red). Accepts
    manifests ({name: {sha1...}}) or batch summaries."""
    o = export_manifest(old) if "records" in (old or {}) else (old or {})
    n = export_manifest(new) if "records" in (new or {}) else (new or {})
    both = set(o) & set(n)
    return {"added": sorted(set(n) - set(o)), "removed": sorted(set(o) - set(n)),
            "modified": sorted(k for k in both if (o[k] or {}).get(hash_key) != (n[k] or {}).get(hash_key)),
            "unchanged": sorted(k for k in both if (o[k] or {}).get(hash_key) == (n[k] or {}).get(hash_key))}


# =============================================================================== FBX presets (pure)
FBX_VERSION = "FBX202000"   # Unreal's pipeline uses FBX 2020.2 (Epic); token [verify] with FBXExportFileVersion -q
_FBX_NO_V = {"FBXExportUpAxis", "FBXExportConvertUnitString", "FBXExportScaleFactor", "FBXExportAxisConversionMethod"}

# Every option is set explicitly after FBXResetExport: settings are global state shared by
# every export in the session (Maya 2027 Help, FBX MEL commands).
FBX_BASE = [
    ("FBXExportFileVersion", FBX_VERSION),
    ("FBXExportUpAxis", "y"),                        # Maya's axis; the engine importer converts [verify per engine]
    ("FBXExportAxisConversionMethod", "convertAnimation"),   # only matters if the up axis changes [verify default]
    ("FBXExportConvertUnitString", "cm"),            # Unreal 1 uu = 1 cm; Unity import scale 1 (doc) [verify in Unity]
    ("FBXExportScaleFactor", 1.0),
    ("FBXExportSmoothingGroups", True),              # on at export AND import, or soft edges reimport wrong
    ("FBXExportHardEdges", False),                   # Split per-vertex Normals: MotionBuilder 2010 only
    ("FBXExportSmoothMesh", False),                  # ship the cage, never the preview
    ("FBXExportTriangulate", False),                 # triangulate in Maya with controlled edges (Epic)
    ("FBXExportTangents", True),                     # only on all-triangle meshes (FBX Limitations)
    ("FBXExportInstances", False),                   # instances would all get the original's material anyway
    ("FBXExportSkins", False),
    ("FBXExportShapes", False),
    ("FBXExportConstraints", False),                 # bake instead; engines do not read Maya constraints
    ("FBXExportSkeletonDefinitions", False),         # HumanIK definitions: MotionBuilder round trips only
    ("FBXExportCameras", False),
    ("FBXExportLights", False),
    ("FBXExportInputConnections", False),            # keep the rig out of the file
    ("FBXExportIncludeChildren", True),
    ("FBXExportEmbeddedTextures", False),            # embed only when the receiver cannot reach texture paths
    ("FBXExportCacheFile", False),
    ("FBXExportAnimationOnly", False),
    ("FBXExportApplyConstantKeyReducer", False),     # silently inert unless "Auto tangents only" is off
    ("FBXExportBakeComplexAnimation", False),
    ("FBXExportUseSceneName", False),
    ("FBXExportInAscii", False),
    ("FBXExportGenerateLog", True),                  # the only feedback on problem files in batch
]

FBX_PRESETS = {
    "unreal_static": {"FBXExportSkins": False, "FBXExportShapes": False},
    "unreal_skeletal": {"FBXExportSkins": True, "FBXExportShapes": True},
    "unreal_anim": {"FBXExportSkins": True, "FBXExportShapes": True, "FBXExportTangents": False,
                    "FBXExportBakeComplexAnimation": True},
    "unity_static": {"FBXExportSkins": False, "FBXExportShapes": False},
    "unity_skeletal": {"FBXExportSkins": True, "FBXExportShapes": True},
    "unity_anim": {"FBXExportSkins": True, "FBXExportShapes": True, "FBXExportTangents": False,
                   "FBXExportBakeComplexAnimation": True},
}
PRESET_META = {
    "unreal_static": {"engine": "unreal", "kind": "static"},
    "unreal_skeletal": {"engine": "unreal", "kind": "skeletal"},
    "unreal_anim": {"engine": "unreal", "kind": "anim", "clips_per_file": 1},   # Epic: one animation per file
    "unity_static": {"engine": "unity", "kind": "static"},
    "unity_skeletal": {"engine": "unity", "kind": "skeletal"},
    "unity_anim": {"engine": "unity", "kind": "anim"},
}


def fbx_options(preset="unreal_skeletal", overrides=None, version=None):
    """Ordered [(command, value)] for a preset, overrides applied (unknown keys appended)."""
    if preset not in FBX_PRESETS:
        raise ValueError("preset must be one of %s" % sorted(FBX_PRESETS))
    opts = list(FBX_BASE)
    for src in (FBX_PRESETS[preset], overrides or {}):
        for k, v in src.items():
            for i, (name, _) in enumerate(opts):
                if name == k:
                    opts[i] = (k, v)
                    break
            else:
                opts.append((k, v))
    if version:
        opts[0] = ("FBXExportFileVersion", version)
    return opts


def _fbx_line(name, value):
    if isinstance(value, bool):
        return "%s -v %s" % (name, "true" if value else "false")
    if name in _FBX_NO_V:
        return "%s %s" % (name, value)
    return "%s -v %s" % (name, value)


def fbx_commands(preset="unreal_skeletal", overrides=None, bake=None, takes=None, version=None):
    """The MEL lines fbx_export() runs, in order (pure). bake=(start, end[, step]).
    Bake Start/End/Step are never stored in presets, so animation presets demand them."""
    opts = fbx_options(preset, overrides, version)
    baking = dict(opts).get("FBXExportBakeComplexAnimation")
    if baking and not bake:
        raise ValueError("%s bakes animation: pass bake=(start, end); Bake Start/End/Step come from the "
                         "timeline, never from presets (Maya 2027 Help, FBX Limitations)" % preset)
    lines = ["FBXResetExport"]
    lines += [_fbx_line(n, v) for n, v in opts]
    if bake:
        s, e = int(round(bake[0])), int(round(bake[1]))
        step = int(bake[2]) if len(bake) > 2 else 1
        if e < s:
            raise ValueError("bake end %s before start %s" % (e, s))
        if not baking:
            lines.append("FBXExportBakeComplexAnimation -v true")
        lines += ["FBXExportBakeComplexStart -v %d" % s, "FBXExportBakeComplexEnd -v %d" % e,
                  "FBXExportBakeComplexStep -v %d" % step]
    lines.append("FBXExportSplitAnimationIntoTakes -c")      # the take accumulator is sticky: clear it
    for t in takes or ():
        name, s, e = t[0], int(round(t[1])), int(round(t[2]))
        if e < s:
            raise ValueError("take %s ends before it starts" % name)
        lines.append("FBXExportSplitAnimationIntoTakes -v %s %d %d" % (mel_str(name), s, e))
    return lines


# =============================================================================== pure checks
def is_orthogonal(m, tol=1e-4):
    """World matrix (16 floats, row-major as cmds.xform returns it) with orthogonal, non-zero
    axes. FBX drops non-orthogonal matrices: shear, or non-uniform scale inherited through a
    rotated child (Maya 2027 Help, FBX Limitations)."""
    axes = [m[0:3], m[4:7], m[8:11]]
    lens = [math.sqrt(sum(c * c for c in a)) for a in axes]
    if min(lens) < 1e-12:
        return False
    for i, j in ((0, 1), (0, 2), (1, 2)):
        d = sum(a * b for a, b in zip(axes[i], axes[j])) / (lens[i] * lens[j])
        if abs(d) > tol:
            return False
    return True


def determinant3(m):
    a, b, c = m[0:3], m[4:7], m[8:11]
    return (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0])
            + a[2] * (b[0] * c[1] - b[1] * c[0]))


_COLL_RE = re.compile(r"^(UCX|UBX|USP|UCP)_(.+)$")


def collision_issues(mesh_names):
    """Unreal custom collision naming (Epic, FBX Static Mesh Pipeline): prefix + exact render
    mesh name, optional _00, _01... Only the first mesh's collision is imported per file."""
    names = [strip_ns(n) for n in mesh_names]
    render = set(n for n in names if not _COLL_RE.match(n) and not n.startswith("SOCKET_"))
    issues, bases = [], set()
    for n in names:
        m = _COLL_RE.match(n)
        if not m:
            continue
        rest = m.group(2)
        base = rest if rest in render else re.sub(r"_\d+$", "", rest)
        if base not in render:
            issues.append({"id": "E17", "check": "collision_naming", "severity": "error", "node": n,
                           "msg": "collision %s matches no render mesh (expected %s_<render mesh>[_NN])"
                                  % (n, m.group(1)), "source": "Epic, FBX Static Mesh Pipeline"})
        else:
            bases.add(base)
    if len(bases) > 1:
        issues.append({"id": "E17", "check": "collision_naming", "severity": "warning", "node": sorted(bases),
                       "msg": "custom collision for %d meshes in one file: Unreal imports only the first "
                              "mesh's collision; one mesh per file" % len(bases),
                       "source": "Epic, FBX Static Mesh Pipeline"})
    return issues


def socket_issues(socket_names, render_mesh_count):
    if socket_names and render_mesh_count > 1:
        return [{"id": "E18", "check": "sockets", "severity": "warning", "node": list(socket_names),
                 "msg": "SOCKET_ locators in a file with %d render meshes: sockets need one mesh per FBX"
                        % render_mesh_count, "source": "Epic, FBX Static Mesh Pipeline"}]
    return []


def influence_stats(weights, n_inf, threshold=1e-6):
    """weights: flat per-vertex rows (n_inf per vertex). Histogram of non-zero influences,
    worst vertex, unnormalized vertex count."""
    nv = len(weights) // n_inf if n_inf else 0
    hist, worst, unnorm = {}, 0, 0
    for v in range(nv):
        row = weights[v * n_inf:(v + 1) * n_inf]
        k = sum(1 for w in row if w > threshold)
        hist[k] = hist.get(k, 0) + 1
        worst = max(worst, k)
        if abs(sum(row) - 1.0) > 1e-3:
            unnorm += 1
    return {"vertices": nv, "influences": n_inf, "histogram": dict(sorted(hist.items())),
            "max_per_vertex": worst, "unnormalized": unnorm}


def cap_weights(weights, n_inf, max_inf, prune=0.0):
    """Keep the max_inf largest weights per vertex (dropping those below prune), renormalize.
    Returns (new flat list, {changed_vertices, max_delta}). Pure; the Maya write is separate."""
    out = list(weights)
    changed, max_delta = 0, 0.0
    nv = len(weights) // n_inf if n_inf else 0
    for v in range(nv):
        row = weights[v * n_inf:(v + 1) * n_inf]
        keep = sorted(((w, i) for i, w in enumerate(row) if w > prune), reverse=True)[:max_inf]
        total = sum(w for w, _ in keep)
        if not keep or total <= 0:
            continue
        new = [0.0] * n_inf
        for w, i in keep:
            new[i] = w / total
        d = max(abs(a - b) for a, b in zip(row, new))
        if d > 1e-9:
            changed += 1
            max_delta = max(max_delta, d)
            out[v * n_inf:(v + 1) * n_inf] = new
    return out, {"changed_vertices": changed, "max_delta": round(max_delta, 6)}


NORMAL_BINS = 8        # [added] quantization steps per unit on each axis of the normal histogram
NORMALS_TOL = 0.02     # [added] largest fraction of normals allowed to change direction bin


def normal_signature(normals, bins=NORMAL_BINS):
    """Order-independent summary of face-vertex normals: {count, bins, hist {bin: fraction}}.
    FBX can split and reorder vertices, so a round trip compares distributions of normal
    directions, not lists. A hard edge that came back soft (or the reverse), flipped faces or
    an axis conversion all move normals to other bins. Pure."""
    hist, n = {}, 0
    for v in normals:
        ln = math.sqrt(sum(c * c for c in v))
        if ln < 1e-12:
            continue
        key = ",".join(str(int(round(c / ln * bins))) for c in v)
        hist[key] = hist.get(key, 0) + 1
        n += 1
    return {"count": n, "bins": bins,
            "hist": {k: round(c / float(n), 6) for k, c in sorted(hist.items())} if n else {}}


def normals_mismatch(a, b):
    """Fraction of normals whose direction bin differs between two normal_signature()s:
    0 = same distribution, 1 = nothing in common. Pure."""
    ha, hb = (a or {}).get("hist") or {}, (b or {}).get("hist") or {}
    if not ha and not hb:
        return 0.0
    if not ha or not hb:
        return 1.0
    return min(1.0, round(sum(abs(ha.get(k, 0.0) - hb.get(k, 0.0)) for k in set(ha) | set(hb)) / 2.0, 6))


def _bbox_err(ba, bb):
    diag = math.sqrt(sum((ba[i + 3] - ba[i]) ** 2 for i in range(3))) or 1.0
    return max(abs(x - y) for x, y in zip(ba, bb)), diag


def compare_stats(a, b, bbox_tol=1e-3, check_verts=True, normals_tol=NORMALS_TOL, check_range=False):
    """Differences between two scene_stats() dicts (source vs reimport): the round trip must
    give back the same normals, scale, axis and length (Maya 2027 Help: the expert's FBX
    check), not only the same counts. Compared: per mesh faces, triangles, UV set count,
    bounding box and normal directions; joint names; the overall bounding box; linear unit
    and up axis; the animation range (a diff with check_range=True, else a note).
    bbox_tol is relative to the bounding-box diagonal. Vertex counts can legitimately differ
    where the format splits vertices [verify for FBX], so check_verts=False turns them into
    notes. Keys missing on either side are skipped (older stats). Returns {ok, diffs, notes,
    normals {mesh: mismatch fraction}}."""
    diffs, notes, nrm = [], [], {}
    am, bm = a.get("meshes", {}), b.get("meshes", {})
    for n in sorted(set(am) | set(bm)):
        if n not in bm:
            diffs.append("mesh %s missing after round trip" % n)
            continue
        if n not in am:
            diffs.append("mesh %s appeared after round trip" % n)
            continue
        for k in ("tris", "faces"):
            if am[n].get(k) != bm[n].get(k):
                diffs.append("mesh %s %s %s -> %s" % (n, k, am[n].get(k), bm[n].get(k)))
        if am[n].get("verts") != bm[n].get("verts"):
            (diffs if check_verts else notes).append("mesh %s verts %s -> %s" % (n, am[n].get("verts"), bm[n].get("verts")))
        if len(am[n].get("uv_sets") or []) != len(bm[n].get("uv_sets") or []):
            diffs.append("mesh %s UV sets %s -> %s" % (n, am[n].get("uv_sets"), bm[n].get("uv_sets")))
        ma, mb = am[n].get("bbox"), bm[n].get("bbox")
        if ma and mb:
            err, diag = _bbox_err(ma, mb)
            if err > bbox_tol * diag:
                diffs.append("mesh %s bounding box moved or scaled by %.4g (tolerance %.4g): %s -> %s"
                             % (n, err, bbox_tol * diag, ma, mb))
        sa, sb = am[n].get("normals"), bm[n].get("normals")
        if sa and sb:
            mm = normals_mismatch(sa, sb)
            nrm[n] = mm
            if mm > normals_tol:
                diffs.append("mesh %s normals differ: %.1f%% of normals changed direction (tolerance %.1f%%): "
                             "smoothing groups, hard edges, flipped faces or axis conversion" % (n, 100 * mm, 100 * normals_tol))
        if not am[n].get("locked_normals") and bm[n].get("locked_normals"):
            notes.append("mesh %s comes back with locked normals (FBX import locks them): unlock before rigging "
                         "(FBXImportUnlockNormals -v true, or Mesh Display > Unlock Normals)" % n)
    if sorted(a.get("joints", [])) != sorted(b.get("joints", [])):
        sa, sb = set(a.get("joints", [])), set(b.get("joints", []))
        diffs.append("joints differ: missing %s, extra %s" % (sorted(sa - sb)[:10], sorted(sb - sa)[:10]))
    ba, bb = a.get("bbox"), b.get("bbox")
    if ba and bb:
        err, diag = _bbox_err(ba, bb)
        if err > bbox_tol * diag:
            diffs.append("bounding box moved by %.4g (tolerance %.4g): %s -> %s" % (err, bbox_tol * diag, ba, bb))
    for key, label in (("units", "linear unit"), ("up", "up axis")):
        if a.get(key) and b.get(key) and a[key] != b[key]:
            diffs.append("%s %s -> %s after round trip" % (label, a[key], b[key]))
    ra, rb = a.get("range"), b.get("range")
    if ra and rb and [float(x) for x in ra] != [float(x) for x in rb]:
        (diffs if check_range else notes).append("animation range %s -> %s" % (ra, rb))
    return {"ok": not diffs, "diffs": diffs, "notes": notes, "normals": nrm}


# =============================================================================== FBX log, time unit, references, preflight (pure)
_LOG_WORD = re.compile(r"\b(error|warning)s?\b", re.I)
_LOG_ZERO = re.compile(r"\b(no|0)\s+(errors?|warnings?)\b|\b(errors?|warnings?)\s*[:=]\s*0\b", re.I)


def parse_fbx_log(text, max_items=50):
    """Warnings and errors from an FBX plug-in log, the only feedback on problem files in a
    batch (Maya 2027 Help, FBX Export options: keep Generate log data on). The format is not
    in the saved pages [verify on a real 2027 log]: a line counts when it names error(s) or
    warning(s); a short header ending in ':' ("Warnings:") classes the indented lines under
    it; "0 errors" / "no warnings" lines are ignored. Returns {errors, warnings (first
    max_items lines), error_count, warning_count, lines}. Pure."""
    out = {"errors": [], "warnings": [], "error_count": 0, "warning_count": 0, "lines": 0}
    current = None
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line:
            current = None
            continue
        out["lines"] += 1
        if _LOG_ZERO.search(line):
            continue
        m = _LOG_WORD.search(line)
        if m and line.endswith(":") and len(line) <= 40:
            current = "error" if m.group(1).lower() == "error" else "warning"
            continue
        if m:
            kind = "error" if m.group(1).lower() == "error" else "warning"
        elif current and raw[:1] in (" ", "\t", "-", "*"):
            kind = current
        else:
            continue
        out[kind + "_count"] += 1
        if len(out[kind + "s"]) < max_items:
            out[kind + "s"].append(line[:300])
    return out


def fbx_log_dirs():
    """Folders the FBX plug-in may write logs to. The doc names only Windows (My Documents\\
    Maya\\FBX\\Logs, next to the FBX presets) [verify the macOS folder on the first export]:
    $MX_FBX_LOG_DIRS (os.pathsep list) first, then $MAYA_APP_DIR/FBX/Logs and the usual
    macOS and Documents folders."""
    home = os.path.expanduser("~")
    dirs = [d for d in os.environ.get("MX_FBX_LOG_DIRS", "").split(os.pathsep) if d]
    if os.environ.get("MAYA_APP_DIR"):
        dirs.append(os.path.join(os.environ["MAYA_APP_DIR"], "FBX", "Logs"))
    prefs = os.path.join(home, "Library", "Preferences", "Autodesk", "maya")
    dirs += [os.path.join(prefs, "FBX", "Logs"), os.path.join(home, "Documents", "maya", "FBX", "Logs"),
             os.path.join(home, "Documents", "Maya", "FBX", "Logs")]
    dirs += sorted(glob.glob(os.path.join(prefs, "*", "FBX", "Logs")))
    return list(dict.fromkeys(dirs))


def find_fbx_log(name=None, since=0.0, dirs=None):
    """Newest FBX log modified at or after `since` (epoch seconds) whose file name starts
    with `name` (MAYA_FBX_LOG_FILENAME; with MAYA_FBX_LOG_DATETIME_ISO=1 a time stamp is
    appended, What's New in Maya 2025). No name: the newest log at all. None when none."""
    best = None
    for d in dirs if dirs is not None else fbx_log_dirs():
        for p in glob.glob(os.path.join(d, "*")):
            base = os.path.basename(p)
            if not os.path.isfile(p) or (name and not base.startswith(name)):
                continue
            mt = os.path.getmtime(p)
            if mt >= since - 1 and (best is None or mt > best[0]):
                best = (mt, p)
    return best[1] if best else None


def fbx_log_issues(parsed, path=None, strict=False):
    """X05 issues from parse_fbx_log(): errors are warnings by default (the heuristic parse is
    [verify]) and errors with strict=True; a missing log is itself a warning (batch exports
    without a log give no feedback on problem files). Pure."""
    if parsed is None:
        return [{"id": "X05", "check": "fbx_log", "severity": "warning", "node": path,
                 "msg": "FBX log not found: set the log folder in MX_FBX_LOG_DIRS once it is known, keep "
                        "FBXExportGenerateLog on", "source": "Maya 2027 Help, FBX Export options"}]
    issues = []
    if parsed.get("error_count"):
        issues.append({"id": "X05", "check": "fbx_log", "severity": "error" if strict else "warning", "node": path,
                       "msg": "FBX log reports %d error lines" % parsed["error_count"], "lines": parsed["errors"][:10],
                       "source": "Maya 2027 Help, FBX Export options"})
    if parsed.get("warning_count"):
        issues.append({"id": "X05", "check": "fbx_log", "severity": "info", "node": path,
                       "msg": "FBX log reports %d warning lines" % parsed["warning_count"],
                       "lines": parsed["warnings"][:10]})
    return issues


def time_unit_issues(time_unit, expected_fps=None, kind="anim"):
    """E27: the scene time unit against the target rate (Unreal sequence rate for Live Link;
    project rate: pipeline digest scene checklist). Mismatch: error for animation exports,
    warning otherwise. No target given: info for animation (state it), nothing otherwise. Pure."""
    here = EXPERT_SCRIPTS
    if here not in sys.path:
        sys.path.insert(0, here)
    import mx_validate
    fps = mx_validate.fps_of(time_unit)
    if expected_fps:
        if fps is None or abs(fps - float(expected_fps)) > 1e-3:
            return [{"id": "E27", "check": "time_unit", "severity": "error" if kind == "anim" else "warning",
                     "node": None, "msg": "time unit %s = %s fps, target %s fps: keys land on other frames in the "
                                          "engine; set the rate in the source, never resample silently"
                                          % (time_unit, fps, expected_fps),
                     "source": "Maya Live Link and ShotGrid to Unreal (Kw3PzotnLrE), pre-stream checks"}]
        return []
    if kind == "anim":
        return [{"id": "E27", "check": "time_unit", "severity": "info", "node": None,
                 "msg": "time unit %s = %s fps; pass the engine rate (--fps) to check it" % (time_unit, fps)}]
    return []


def reference_issues(refs):
    """Reference health from references_report(), checked before any fix or export (pipeline
    digest scene checklist; reference edits replay by name and DAG path): R01 unloaded (it
    validates and exports nothing), R02 file missing, R03 failed edits, R04 foster parents,
    R05 unreadable reference node. Pure."""
    issues = []
    for r in refs or []:
        if "foster_parents" in r:
            if r["foster_parents"]:
                issues.append({"id": "R04", "check": "references", "severity": "warning", "node": r["foster_parents"][:10],
                               "msg": "foster parent nodes: scene nodes parented under unloaded references"})
            continue
        ref = r.get("ref")
        if r.get("error"):
            issues.append({"id": "R05", "check": "references", "severity": "error", "node": ref,
                           "msg": "reference cannot be queried: %s" % r["error"]})
            continue
        if not r.get("loaded", True):
            issues.append({"id": "R01", "check": "references", "severity": "error", "node": ref,
                           "msg": "reference %s is unloaded: nothing of it validates or exports" % r.get("file")})
        if r.get("exists") is False:
            issues.append({"id": "R02", "check": "references", "severity": "error", "node": ref,
                           "msg": "reference file missing: %s" % r.get("file")})
        if r.get("failed_edits"):
            issues.append({"id": "R03", "check": "references", "severity": "error", "node": ref,
                           "msg": "%d failed reference edits (renamed or restructured child file?)" % r["failed_edits"]})
    return issues


def _resolves(host, timeout):
    box = {}

    def _go():
        try:
            box["ip"] = socket.gethostbyname(host)
        except Exception as exc:
            box["error"] = str(exc)
    t = threading.Thread(target=_go, daemon=True)
    t0 = time.time()
    t.start()
    t.join(timeout)
    return box.get("ip"), box.get("error") or (None if box.get("ip") else "no answer in %.0fs" % timeout), \
        round(time.time() - t0, 3)


def preflight(out_dir, scenes=(), min_free_gb=2.0, mayapy=None, resolve_timeout=5.0):
    """Parent-side checks before a batch (any python3, no Maya): mayapy found; localhost and
    this machine's host name resolve quickly (macOS batch renders hang on localhost
    resolution: add `127.0.0.1 localhost <hostname>` to /etc/hosts, Python in Maya 2027,
    Troubleshoot Maya hangs); the output folder is writable with min_free_gb free [added];
    every scene is readable; the FBX log folders that exist. Returns {ok, checks}."""
    checks = []

    def add(cid, ok, detail, severity="error"):
        checks.append({"id": cid, "ok": bool(ok), "severity": severity if not ok else "info", "detail": detail})

    exe = mayapy or mx_run.find_mayapy()
    add("mayapy", bool(exe), exe or "not found: set MX_MAYAPY or MAYA_LOCATION")
    ip, err, dt = _resolves("localhost", resolve_timeout)
    add("localhost", ip is not None and ip.startswith("127."), {"ip": ip, "error": err, "seconds": dt,
                                                              "fix": "127.0.0.1 localhost <hostname> in /etc/hosts"})
    host = socket.gethostname()
    ip, err, dt = _resolves(host, resolve_timeout)
    add("hostname", ip is not None and dt < resolve_timeout, {"host": host, "ip": ip, "error": err, "seconds": dt,
                                                             "fix": "add the host name to the 127.0.0.1 line of /etc/hosts"},
        severity="warning")
    try:
        os.makedirs(out_dir, exist_ok=True)
        add("out_writable", os.access(out_dir, os.W_OK | os.X_OK), out_dir)
    except OSError as exc:
        add("out_writable", False, "%s: %s" % (out_dir, exc))
    try:
        free = shutil.disk_usage(out_dir).free / 1e9
        add("disk_space", free >= min_free_gb, {"free_gb": round(free, 1), "min_gb": min_free_gb}, severity="warning")
    except OSError as exc:
        add("disk_space", False, str(exc), severity="warning")
    unreadable = [s for s in scenes if not os.access(s, os.R_OK)]
    add("scenes_readable", not unreadable, unreadable[:20] or len(list(scenes)))
    existing = [d for d in fbx_log_dirs() if os.path.isdir(d)]
    add("fbx_log_dirs", True, existing or "none yet (they appear after the first FBX export) [verify]", "info")
    return {"ok": all(c["ok"] or c["severity"] != "error" for c in checks), "checks": checks}


# =============================================================================== Alembic / USD flags (pure)
def _num(x):
    return ("%d" % x) if float(x).is_integer() else repr(float(x))


def abc_job(roots, path, start, end, step=1.0, uv_write=True, face_sets=True, world_space=True,
            visibility=True, euler_filter=True, strip_namespaces=False, creases=False, uv_sets=False,
            attrs=(), extra=()):
    """AbcExport -j string. Only -frameRange, -root and -file are in the saved 2027 docs; the
    other flags are [verify] with AbcExport -h. uvWrite + writeFaceSets let the cache pick the
    shading back up (Maya 2027 Help, Create Alembic cache files). Ogawa is the only format."""
    if not roots:
        raise ValueError("abc_job needs at least one root")
    if re.search(r"\s", path):
        raise ValueError("whitespace in Alembic path %r: the -j string is split on spaces [verify]; "
                         "abc_export() writes to a temp path and moves the file" % path)
    parts = ["-frameRange %s %s" % (_num(start), _num(end))]
    if float(step) != 1.0:
        parts.append("-step %s" % _num(step))
    for flag, on in (("-uvWrite", uv_write), ("-writeFaceSets", face_sets), ("-worldSpace", world_space),
                     ("-writeVisibility", visibility), ("-eulerFilter", euler_filter),
                     ("-stripNamespaces", strip_namespaces), ("-writeCreases", creases), ("-writeUVSets", uv_sets)):
        if on:
            parts.append(flag)
    parts.append("-dataFormat ogawa")
    for a in attrs:
        parts.append("-attr %s" % a)
    parts += list(extra)
    for r in roots:
        if re.search(r"\s", r):
            raise ValueError("whitespace in root %r" % r)
        parts.append("-root %s" % r)
    parts.append("-file %s" % path)
    return " ".join(parts)


USD_EXPORT_DEFAULTS = {
    # every trap in the maya-usd readme set explicitly (defaults in comments)
    "defaultMeshScheme": "none",          # default catmullClark: every poly mesh becomes a subdiv, no normals
    "exportSkels": "auto",                # default none
    "exportSkin": "auto",                 # default none
    "exportBlendShapes": True,            # default false
    "stripNamespaces": True,              # default false: namespaces become ns_name prims
    "eulerFilter": True,
    "staticSingleSample": True,           # single time samples written static
    "upAxis": "y", "unit": "cm",          # default mayaPrefs; -unit is the favored unit control
    "shadingMode": "useRegistry",
    "convertMaterialsTo": ["UsdPreviewSurface"],   # readme says UsdPreviewSurface, 0.34+ installs MaterialX: be explicit
    "materialsScopeName": "mtl",          # readme contradicts itself (Looks vs mtl); env vars can override [verify]
    "exportUVs": True, "preserveUVSetNames": False,   # map1 -> st, others st1... (USD convention)
    "exportColorSets": True, "exportVisibility": True, "exportInstances": True,
    "mergeTransformAndShape": True, "defaultUSDFormat": "usdc", "worldspace": False, "frameStride": 1.0,
}


def usd_export_kwargs(path, roots, frame_range=None, static_time=1.0, default_prim=None, subdiv=False,
                      overrides=None):
    """cmds.mayaUSDExport keyword arguments (pure). frame_range=None exports one static sample
    at static_time: frameRange defaults to [1, 1] whatever the current frame."""
    if not roots:
        raise ValueError("usd_export needs roots")
    kw = dict(USD_EXPORT_DEFAULTS)
    kw["file"] = path
    kw["exportRoots"] = list(roots)
    if frame_range is None:
        kw["frameRange"] = (float(static_time), float(static_time))
    else:
        kw["frameRange"] = (float(frame_range[0]), float(frame_range[1]))
    if subdiv:
        kw["defaultMeshScheme"] = "catmullClark"
    leaf = strip_ns(roots[0]) if kw.get("stripNamespaces") else _leaf(roots[0]).replace(":", "_")
    kw["defaultPrim"] = default_prim or leaf
    kw.update(overrides or {})
    return kw


# =============================================================================== Maya-side basics
def _cmds():
    import maya.cmds as cmds
    return cmds


def load_plugins(*names):
    """mx_run aliases: fbx, abc, usd, gpucache, game... Raises if one does not load."""
    return mx_run.load_plugins(names, required=True)


def resolve(nodes):
    """Long names; raises on missing or ambiguous names."""
    cmds = _cmds()
    out = []
    for n in ([nodes] if isinstance(nodes, str) else nodes or []):
        hits = cmds.ls(n, long=True) or []
        if not hits:
            raise ValueError("node %s does not exist" % n)
        if len(hits) > 1:
            raise ValueError("%s is ambiguous: %s (use a long name)" % (n, hits))
        out.append(hits[0])
    return out


def auto_roots(kind="skeletal"):
    """Top DAG nodes holding meshes or joints (startup cameras excluded)."""
    cmds = _cmds()
    out = []
    for a in cmds.ls(assemblies=True, long=True) or []:
        shapes = cmds.listRelatives(a, shapes=True, type="camera") or []
        if shapes and cmds.camera(shapes[0], q=True, startupCamera=True):
            continue
        below = (cmds.listRelatives(a, allDescendents=True, type="mesh", fullPath=True) or []) + \
                (cmds.listRelatives(a, allDescendents=True, type="joint", fullPath=True) or [])
        if below or cmds.nodeType(a) == "joint":
            out.append(a)
    return out


def export_set_members(set_name):
    """Members of an object set as long names (the Game Exporter's Export Object Set idea:
    one set per character when several share a scene)."""
    cmds = _cmds()
    return cmds.ls(cmds.sets(set_name, q=True) or [], long=True) or []


def _meshes_under(roots):
    cmds = _cmds()
    if roots:
        shapes = cmds.listRelatives(roots, allDescendents=True, type="mesh", fullPath=True) or []
        shapes += [r for r in roots if cmds.nodeType(r) == "mesh"]
    else:
        shapes = cmds.ls(type="mesh", long=True) or []
    return [s for s in dict.fromkeys(shapes) if not cmds.getAttr(s + ".intermediateObject")]


def _transforms_under(roots, skip_constraints=True):
    """DAG transforms (joints included) under roots, roots first. Constraint nodes are DAG
    transforms too; they are skipped because FBXExportConstraints is off."""
    cmds = _cmds()
    xf = list(roots) + (cmds.listRelatives(roots, allDescendents=True, fullPath=True) or [])
    out = []
    for x in dict.fromkeys(xf):
        if not cmds.objectType(x, isAType="transform"):
            continue
        if skip_constraints and cmds.objectType(x, isAType="constraint"):
            continue
        out.append(x)
    return out


def uuids(nodes):
    """UUIDs survive renames and namespace merges; long names do not."""
    return _cmds().ls(nodes, uuid=True) or []


def from_uuids(ids):
    cmds = _cmds()
    out = []
    for u in ids:
        out += cmds.ls(u, long=True) or []
    return out


def _parent(n):
    p = _cmds().listRelatives(n, parent=True, fullPath=True) or []
    return p[0] if p else None


def _history_of(shape, node_type):
    cmds = _cmds()
    return cmds.ls(cmds.listHistory(shape, pruneDagObjects=True) or [], type=node_type) or []


def _toolkit(name):
    """scenario-maya-expert modules (mx_audit, mx_validate); pure Python at import time."""
    if EXPERT_SCRIPTS not in sys.path:
        sys.path.insert(0, EXPERT_SCRIPTS)
    import importlib
    return importlib.import_module(name)


def mesh_normals(shape):
    """normal_signature() of a mesh's face-vertex normals in world space, or None for an
    empty mesh (MFnMesh raises on one since 2022.1: guarded by mx_audit.mfn_mesh)."""
    import maya.api.OpenMaya as om
    fn = _toolkit("mx_audit").mfn_mesh(shape)
    if fn is None:
        return None
    nrm = fn.getNormals(om.MSpace.kWorld)            # [verify] MFloatVectorArray on 2027
    _counts, ids = fn.getNormalIds()                 # [verify] (normals per face, normal id per face-vertex)
    return normal_signature([(nrm[i].x, nrm[i].y, nrm[i].z) for i in ids])


def scene_stats(roots=None, normals=True):
    """What a round trip must give back: per mesh (by leaf name without namespace) verts,
    faces, tris, UV and color sets, skinned, blend shapes, world bounding box, normal
    direction signature and locked normal count; joints; overall bounding box (UI units);
    animation range; linear unit, up axis and time unit. Empty meshes are reported with
    empty=True instead of crashing MFnMesh."""
    cmds = _cmds()
    A, V = _toolkit("mx_audit"), _toolkit("mx_validate")
    roots = resolve(roots) if roots else None
    meshes, xforms = {}, []
    for s in _meshes_under(roots):
        x = _parent(s)
        xforms.append(x)
        key = strip_ns(x)
        if key in meshes:
            key = "%s#%d" % (key, len(meshes))
        c = A.mesh_counts(s)
        m = {"verts": c["verts"], "faces": c["faces"], "tris": A._count(cmds, s, triangle=True),
             "uv_sets": cmds.polyUVSet(s, q=True, allUVSets=True) or [],
             "color_sets": cmds.polyColorSet(s, q=True, allColorSets=True) or [],
             "skinned": bool(_history_of(s, "skinCluster")),
             "blendshapes": len(_history_of(s, "blendShape"))}
        if A.is_empty_mesh(s):
            m["empty"] = True
        else:
            m["bbox"] = [round(v, 5) for v in cmds.exactWorldBoundingBox(x)]
            m["locked_normals"] = V.locked_normal_count(s)
            if normals:
                m["normals"] = mesh_normals(s)
        meshes[key] = m
    if roots:
        joints = [j for j in _transforms_under(roots) if cmds.nodeType(j) == "joint"]
    else:
        joints = cmds.ls(type="joint", long=True) or []
    bbox = cmds.exactWorldBoundingBox(xforms) if xforms else None
    return {"meshes": meshes, "joints": sorted(strip_ns(j) for j in joints),
            "bbox": [round(v, 5) for v in bbox] if bbox else None,
            "range": [cmds.playbackOptions(q=True, minTime=True), cmds.playbackOptions(q=True, maxTime=True)],
            "units": cmds.currentUnit(q=True, linear=True), "up": cmds.upAxis(q=True, axis=True),
            "time_unit": cmds.currentUnit(q=True, time=True)}


def _new_scene(allow_discard):
    cmds = _cmds()
    if cmds.file(q=True, modified=True) and not allow_discard:
        raise RuntimeError("the open scene has unsaved changes: save a version first or pass allow_discard=True")
    cmds.file(new=True, force=True)


def save_version(out_dir=None, stem=None, suffix="_fixed", source=None, ext=None):
    """Save the current scene as <out>/fixed/<stem><suffix>.ma (never over the source)."""
    cmds = _cmds()
    source = source or cmds.file(q=True, sceneName=True) or os.environ.get("MX_PIPELINE_SOURCE")
    out_dir = out_dir or os.environ.get("MX_PIPELINE_OUT") or os.path.dirname(source)
    stem = stem or os.environ.get("MX_PIPELINE_STEM") or os.path.splitext(os.path.basename(source))[0]
    ext = ext or (os.path.splitext(source)[1] if source else ".ma") or ".ma"
    return mx_run.save_scene(os.path.join(out_dir, "fixed", stem + suffix + ext), source=source)


# =============================================================================== engine checks
ENGINE_RULES = {
    "unreal": {"max_influences": None,    # no number in the sources: studio rule, reported as a histogram
               "color_sets": 1, "units": "cm", "up": "y", "one_root": True, "pivot_origin": True,
               "height_range": None, "joint_aim_axis": None,
               "fps": None},              # the project or Unreal sequence rate, e.g. 30: checked by E27
    "unity": {"max_influences": 4,        # Unity default (Unity manual, Skinning)
              "color_sets": 1, "units": "cm", "up": "y", "one_root": True, "pivot_origin": True,
              "height_range": None, "joint_aim_axis": None, "fps": None},
}


def skin_weights(skin, shape):
    """(flat weights, influence count, influence names) through OpenMaya 2.0 in one call."""
    import maya.api.OpenMaya as om
    import maya.api.OpenMayaAnim as oma
    sl = om.MSelectionList()
    sl.add(skin)
    sl.add(shape)
    fn = oma.MFnSkinCluster(sl.getDependNode(0))
    dag = sl.getDagPath(1)
    mesh_fn = _toolkit("mx_audit").mfn_mesh(shape)                 # None on an empty mesh (2022.1 raise)
    if mesh_fn is None:
        return [], 0, []
    comp_fn = om.MFnSingleIndexedComponent()
    comp = comp_fn.create(om.MFn.kMeshVertComponent)
    comp_fn.setCompleteData(mesh_fn.numVertices)
    weights, n_inf = fn.getWeights(dag, comp)                       # [verify] returns (MDoubleArray, int)
    names = [p.partialPathName() for p in fn.influenceObjects()]
    return list(weights), int(n_inf), names


def _skin_tools_layers(skin):
    """Best-effort: connections that look like Skin Tools (ngSkinTools-based) layer data [verify
    node types in 2027]. Classic weight tools are blocked while layers exist (Maya 2027 Help)."""
    cmds = _cmds()
    out = []
    for n in cmds.listConnections(skin, source=True, destination=True) or []:
        t = cmds.nodeType(n).lower()
        if "ngst" in t or "skinlayer" in t or "ngskin" in t:
            out.append(n)
    return sorted(set(out))


def check_engine_export(roots, engine="unreal", kind="skeletal", rules=None, tangents=True):
    """Read-only checks for what the engine and the FBX format do with the export roots.
    Returns issues [{id, check, severity, node, msg, source}]. kind: static|skeletal|anim."""
    cmds = _cmds()
    R = dict(ENGINE_RULES[engine])
    R.update(rules or {})
    issues = []

    def add(cid, check, sev, msg, node=None, src=None, **extra):
        d = {"id": cid, "check": check, "severity": sev, "msg": msg, "node": node}
        if src:
            d["source"] = src
        d.update(extra)
        issues.append(d)

    roots = resolve(roots)
    xforms = _transforms_under(roots)
    shapes = _meshes_under(roots)
    joints = [x for x in xforms if cmds.nodeType(x) == "joint"]
    if cmds.currentUnit(q=True, linear=True) != R["units"]:
        add("E01", "units", "error", "linear unit %s, expected %s: never rescale silently, export with an explicit "
            "conversion" % (cmds.currentUnit(q=True, linear=True), R["units"]), src="Maya 2027 Help, scale")
    if cmds.upAxis(q=True, axis=True) != R["up"]:
        add("E01", "units", "warning", "up axis %s, expected %s" % (cmds.upAxis(q=True, axis=True), R["up"]))
    short = {}
    for n in xforms:
        short.setdefault(strip_ns(n), []).append(n)
    for k, v in sorted(short.items()):
        if len(v) > 1:
            add("E03", "unique_names", "error", "%d exported nodes share the name %s" % (len(v), k), v[:6],
                "FlippedNormals ToWRH4IXF7A [00:18:16]; engines key bones and meshes by name")
    ns = [n for n in xforms if ":" in _leaf(n)]
    if ns:
        add("E04", "namespaces", "warning", "%d exported nodes carry namespaces (strip or merge before export)"
            % len(ns), ns[:6])
    for n in xforms:
        m = cmds.xform(n, q=True, ws=True, matrix=True)
        if not is_orthogonal(m):
            add("E05", "non_orthogonal", "error", "world matrix not orthogonal (shear or non-uniform parent scale): "
                "FBX drops it", n, "Maya 2027 Help, FBX Limitations")
        elif determinant3(m) < 0:
            add("E06", "negative_scale", "warning", "negative scale (mirrored): winding and normals flip", n)
    A, V = _toolkit("mx_audit"), _toolkit("mx_validate")
    for i in time_unit_issues(cmds.currentUnit(q=True, time=True), R.get("fps"), kind):
        issues.append(i)
    render_names, sockets = [], []
    for s in shapes:
        x = _parent(s)
        render_names.append(strip_ns(x))
        if A.is_empty_mesh(s):             # polyEvaluate returns a string on nothing; MFnMesh would raise
            add("E24", "empty_mesh", "error", "empty mesh (no vertices or no faces): delete it or fill it", s,
                "devkit What's New 2022.1: MFnMesh raises on an empty mesh")
            continue
        locked = V.locked_normal_count(s)
        if locked:
            deforms = kind in ("skeletal", "anim") or bool(_history_of(s, "geometryFilter"))
            add("E11", "locked_normals", "warning" if deforms else "info",
                ("%d locked normal entries on a mesh that deforms or will be skinned: locked normals do not follow "
                 "skinning or blend shapes (typical after an FBX or OBJ import); unlock (mx_validate fix "
                 "unlock_normals, FBXImportUnlockNormals -v true on import), then check the hard edges" % locked)
                if deforms else
                ("%d locked normal entries on a static mesh: fine for deliberate custom normals (weighted "
                 "normals), otherwise unlock" % locked), s, "Maya 2027 Help, FBX Troubleshooting")
        faces, tris = cmds.polyEvaluate(s, face=True), cmds.polyEvaluate(s, triangle=True)
        if tangents and faces != tris and not _COLL_RE.match(strip_ns(x)):
            add("E07", "triangulated", "error", "%d faces, %d triangles: tangents and binormals only export on "
                "all-triangle meshes; triangulate in Maya with controlled edges, or export without tangents"
                % (faces, tris), x, "Maya 2027 Help, FBX Limitations; Epic, Triangulation")
        if cmds.attributeQuery("displaySmoothMesh", node=s, exists=True) and cmds.getAttr(s + ".displaySmoothMesh"):
            add("E08", "smooth_preview", "warning", "Smooth Mesh Preview on: turn it off so the cage ships", s,
                "FlippedNormals ToWRH4IXF7A [00:24:00]")
        uvs = cmds.polyUVSet(s, q=True, allUVSets=True) or []
        if not uvs:
            add("E09", "uv_sets", "error", "no UV set", x)
        cs = cmds.polyColorSet(s, q=True, allColorSets=True) or []
        if R.get("color_sets") is not None and len(cs) > R["color_sets"]:
            add("E10", "color_sets", "warning", "%d color sets, the engine reads %d" % (len(cs), R["color_sets"]), x,
                "Epic, Vertex Colors")
        if len(cmds.listRelatives(s, allParents=True) or []) > 1:
            add("E19", "instances", "warning", "instanced shape: FBX gives every instance the original's material", s,
                "Maya 2027 Help, FBX Limitations")
        user = cmds.listAttr(s, userDefined=True) or []
        if user:
            add("E20", "shape_attributes", "info", "custom attributes on the shape do not export (only from "
                "transforms): %s" % user[:6], s, "Maya 2027 Help, FBX Limitations")
        skins = _history_of(s, "skinCluster")
        if kind in ("skeletal", "anim") and not skins:
            add("E25", "unskinned", "warning", "mesh not skinned: it exports as a rigid part only if parented to a "
                "joint", x)
        for sk in skins:
            layers = _skin_tools_layers(sk)
            if layers:
                add("E26", "skin_tools_layers", "warning", "Skin Tools layers present: route to scenario-maya-deformation to "
                    "Delete Skin Layers before handoff (it keeps the evaluated weights; the classic weight tools and "
                    "cap_influences refuse while layers exist); the batch never deletes them", sk,
                    "Maya 2027 Help, Skin Tools", layers=layers[:4])
            try:
                w, n_inf, names = skin_weights(sk, s)
                st = influence_stats(w, n_inf)
            except Exception as exc:
                add("E14", "influences", "warning", "could not read weights: %s" % exc, sk)
                continue
            if st["unnormalized"]:
                add("E15", "normalized", "error", "%d vertices whose weights do not sum to 1" % st["unnormalized"], sk)
            mx = R.get("max_influences")
            if mx and st["max_per_vertex"] > mx:
                over = sum(c for k, c in st["histogram"].items() if k > mx)
                add("E14", "influences", "error", "%d vertices above %d influences (max %d)" % (over, mx,
                    st["max_per_vertex"]), sk, "Unity manual, Skinning", stats=st)
            else:
                add("E14", "influences", "info", "influences per vertex histogram %s" % st["histogram"], sk, stats=st)
    for n in xforms:
        if strip_ns(n).startswith("SOCKET_"):
            sockets.append(strip_ns(n))
    for i in collision_issues(render_names) + socket_issues(sockets, len([r for r in render_names
                                                                          if not _COLL_RE.match(r)])):
        issues.append(i)
    bbox = cmds.exactWorldBoundingBox([_parent(s) for s in shapes]) if shapes else None
    if kind == "static" and R.get("pivot_origin") and bbox:
        inside = (bbox[0] - 1e-3 <= 0 <= bbox[3] + 1e-3) and (bbox[2] - 1e-3 <= 0 <= bbox[5] + 1e-3)
        if not inside or bbox[1] > 1e-3 * max(1.0, bbox[4] - bbox[1]) + 1e-3:
            add("E12", "pivot_origin", "warning", "the exported origin is the engine pivot: the asset sits away "
                "from it (bbox %s)" % [round(v, 3) for v in bbox], roots, "Epic, Pivot Point")
    if kind in ("skeletal", "anim"):
        top = []
        for j in joints:
            par = _parent(j)
            if par and cmds.nodeType(par) == "joint":
                continue
            anc = par
            while anc and cmds.nodeType(anc) != "joint":
                anc = _parent(anc)
            if anc:
                add("E16", "joint_parent", "warning", "non-joint %s between joints %s and %s: it exports as an "
                    "extra node in the skeleton" % (strip_ns(par), strip_ns(anc), strip_ns(j)), j)
            else:
                top.append(j)
        if R.get("one_root") and len(top) != 1:
            add("E02", "one_root", "error", "%d root joints (one root joint: it is the skeletal mesh pivot)" % len(top),
                top[:6], "Epic, FBX Skeletal Mesh Pipeline")
        for j in top:
            p = _parent(j)
            if p and any(p == r or p.startswith(r + "|") for r in roots):
                add("E16", "joint_parent", "warning", "root joint %s sits under a transform %s that exports as an "
                    "extra node" % (strip_ns(j), strip_ns(p)), j)
            pos = cmds.xform(j, q=True, ws=True, translation=True)
            if max(abs(v) for v in pos) > 1e-3:
                add("E13", "root_origin", "warning", "root joint not at the origin: %s" % [round(v, 3) for v in pos], j,
                    "Epic, Pivot Point; Unity, Modeling (feet on the local origin)")
        for j in joints:
            s = cmds.getAttr(j + ".scale")[0]
            if any(abs(v - 1) > 1e-4 for v in s):
                add("E13", "joint_scale", "warning", "joint scale %s" % [round(v, 4) for v in s], j)
            if kind == "skeletal":
                r = cmds.getAttr(j + ".rotate")[0]
                if any(abs(v) > 1e-3 for v in r):
                    add("E13", "joint_rotate", "warning", "rotate %s at bind: orientation belongs in jointOrient"
                        % [round(v, 3) for v in r], j, "AdvancedSkeleton mTB9Yh_sWKc [00:10:06]")
        cons = cmds.ls(cmds.listRelatives(roots, allDescendents=True, fullPath=True) or [], type="constraint") or []
        if cons:
            add("E16", "constraints", "info", "%d constraints under the export roots: bake onto the joints "
                "(constraint animation does not transfer)" % len(cons), cons[:6], "Maya 2027 Help, Game Exporter")
        axis = R.get("joint_aim_axis")
        if axis:
            idx = "xyz".index(axis[-1].lower())
            sign = -1.0 if axis.startswith("-") else 1.0
            for j in joints:
                kids = cmds.listRelatives(j, children=True, type="joint", fullPath=True) or []
                if len(kids) != 1:
                    continue
                m = cmds.xform(j, q=True, ws=True, matrix=True)
                a = [sign * c for c in m[idx * 4: idx * 4 + 3]]
                p0 = cmds.xform(j, q=True, ws=True, translation=True)
                p1 = cmds.xform(kids[0], q=True, ws=True, translation=True)
                d = [b - c for b, c in zip(p1, p0)]
                la, ld = math.sqrt(sum(c * c for c in a)), math.sqrt(sum(c * c for c in d))
                if la > 0 and ld > 1e-4 and sum(x * y for x, y in zip(a, d)) / (la * ld) < 0.999:
                    add("E13", "joint_aim", "warning", "%s does not aim at its child (studio rule %s)" % (axis, axis), j)
    if R.get("height_range") and bbox:
        h = bbox[4] - bbox[1]
        lo, hi = R["height_range"]
        if not lo <= h <= hi:
            add("E21", "scale", "error", "height %.2f outside %s (units %s)" % (h, R["height_range"],
                cmds.currentUnit(q=True, linear=True)), roots)
    return issues


# =============================================================================== fixes (engine layer)
def cap_influences(skin, shape, max_influences, prune=0.0, max_delta=0.1, apply=False):
    """Cap influences per vertex, renormalized, only if no weight moves by more than max_delta
    [added threshold]. OpenMaya write: headless only (not undoable in a GUI session; there
    use skinPercent inside an undo chunk). Refuses while Skin Tools layers exist."""
    import maya.api.OpenMaya as om
    import maya.api.OpenMayaAnim as oma
    cmds = _cmds()
    layers = _skin_tools_layers(skin)
    if layers:
        return {"applied": False, "reason": "Skin Tools layers present %s: delete layers first" % layers}
    w, n, names = skin_weights(skin, shape)
    new, st = cap_weights(w, n, max_influences, prune)
    st.update(influence_stats(w, n))
    if not st["changed_vertices"]:
        return dict(st, applied=False, reason="nothing above the cap")
    if st["max_delta"] > max_delta:
        return dict(st, applied=False, reason="max weight change %.4f above %.4f: review with scenario-maya-deformation"
                    % (st["max_delta"], max_delta))
    if apply:
        sl = om.MSelectionList()
        sl.add(skin)
        sl.add(shape)
        fn = oma.MFnSkinCluster(sl.getDependNode(0))
        dag = sl.getDagPath(1)
        cfn = om.MFnSingleIndexedComponent()
        comp = cfn.create(om.MFn.kMeshVertComponent)
        cfn.setCompleteData(len(w) // n if n else 0)              # vertex count from the weights just read
        fn.setWeights(dag, comp, om.MIntArray(list(range(n))), om.MDoubleArray(new), False)   # [verify] signature
        cmds.setAttr(skin + ".maxInfluences", max_influences)
        cmds.setAttr(skin + ".maintainMaxInfluences", True)
    return dict(st, applied=bool(apply))


def triangulate_for_export(roots):
    """Export-time only (the fixed version is saved before this): triangulate unskinned meshes
    that are not all triangles. Skinned meshes are reported, not touched: triangulate before
    binding so the bake and the engine share one triangulation (Polycount; Epic)."""
    cmds = _cmds()
    done, skipped = [], []
    for s in _meshes_under(resolve(roots)):
        if cmds.polyEvaluate(s, face=True) == cmds.polyEvaluate(s, triangle=True):
            continue
        x = _parent(s)
        if _history_of(s, "geometryFilter"):
            skipped.append(x)
            continue
        cmds.polyTriangulate(x, constructionHistory=False)     # [verify] flag on 2027
        done.append(x)
    return {"triangulated": done, "skipped_deformed": skipped}


# =============================================================================== FBX export and verify
def fbx_query(names):
    import maya.mel as mel
    out = {}
    for n in names:
        try:
            out[n] = mel.eval("%s -q" % n)
        except Exception as exc:
            out[n] = "query failed: %s" % str(exc).strip()[:120]
    return out


def fbx_export(path, roots, preset="unreal_skeletal", overrides=None, bake=None, takes=None, version=None,
               check=True, force=False, engine_rules=None):
    """Select-free for the caller: saves and restores the selection and the user's FBX settings
    (FBXPushSettings / FBXPopSettings), resets, sets every option, clears the take accumulator,
    queries every option back, exports, writes <path>.settings.json next to the file, then
    finds the exporter's own log (FBXExportGenerateLog is on in every preset; the batch names
    it per child with MAYA_FBX_LOG_FILENAME) and parses it into rep["fbx_log"].
    With check=True, engine errors stop the export unless force=True."""
    import maya.mel as mel
    cmds = _cmds()
    load_plugins("fbx")
    meta = PRESET_META[preset]
    roots = resolve(roots)
    opts = dict(fbx_options(preset, overrides, version))
    rep = {"path": os.path.abspath(path), "kind": "fbx", "preset": preset, "roots": roots, "issues": [],
           "warnings": [], "exported": False}
    if meta.get("clips_per_file") and takes and len(takes) > meta["clips_per_file"]:
        rep["warnings"].append("%s: %d takes in one file; Unreal expects one animation per file" % (preset, len(takes)))
    if check:
        rep["issues"] = check_engine_export(roots, meta["engine"], meta["kind"], engine_rules,
                                            tangents=bool(opts.get("FBXExportTangents")))
        if any(i["severity"] == "error" for i in rep["issues"]) and not force:
            rep["reason"] = "engine check errors (pass force=True to export anyway)"
            return rep
    lines = fbx_commands(preset, overrides, bake, takes, version)
    os.makedirs(os.path.dirname(rep["path"]), exist_ok=True)
    sel = cmds.ls(sl=True, long=True) or []
    mel.eval("FBXPushSettings")
    try:
        for line in lines:
            try:
                mel.eval(line)
            except RuntimeError:
                if line.endswith("-c"):
                    mel.eval("FBXExportSplitAnimationIntoTakes -clear")    # the doc spells it -c and -clear
                else:
                    raise
        rep["commands"] = lines
        rep["settings"] = fbx_query([n for n, _ in fbx_options(preset, overrides, version)] +
                                    ["FBXExportBakeComplexStart", "FBXExportBakeComplexEnd",
                                     "FBXExportSplitAnimationIntoTakes"])
        cmds.select(roots, replace=True)                   # FBXExport -s exports the selection
        t_export = time.time()
        mel.eval("FBXExport -f %s -s" % mel_str(rep["path"].replace("\\", "/")))
    finally:
        mel.eval("FBXPopSettings")
        if sel:
            cmds.select(sel, replace=True)
        else:
            cmds.select(clear=True)
    rep["exported"] = os.path.isfile(rep["path"])
    if rep["exported"]:
        rep["sha1"] = file_sha1(rep["path"])
        rep["bytes"] = os.path.getsize(rep["path"])
    rep["fbx_log"] = read_fbx_log(since=t_export)
    write_json(rep["path"] + ".settings.json", {k: rep.get(k) for k in ("preset", "commands", "settings", "roots",
                                                                       "fbx_log")})
    return rep


def read_fbx_log(name=None, since=0.0, dirs=None):
    """{path, name, parsed} for the newest FBX log written since `since` (None parsed when no
    log was found). name defaults to $MAYA_FBX_LOG_FILENAME."""
    name = name or os.environ.get("MAYA_FBX_LOG_FILENAME")
    path = find_fbx_log(name, since, dirs)
    out = {"path": path, "name": name, "parsed": None, "searched": dirs if dirs is not None else fbx_log_dirs()}
    if path:
        try:
            with open(path, errors="replace") as f:
                out["parsed"] = parse_fbx_log(f.read())
        except OSError as exc:
            out["error"] = str(exc)
    return out


def fbx_takes(path):
    """Take names and spans without importing (FBXRead, FBXGetTake*, FBXClose). Take001 always
    exists; a stale accumulator shows up here as extra takes."""
    import maya.mel as mel
    load_plugins("fbx")
    mel.eval("FBXRead -f %s" % mel_str(os.path.abspath(path).replace("\\", "/")))
    try:
        n = int(mel.eval("FBXGetTakeCount") or 0)
        takes = []
        for i in range(1, n + 1):
            t = {"name": mel.eval("FBXGetTakeName %d" % i)}
            try:
                t["span"] = mel.eval("FBXGetTakeLocalTimeSpan %d" % i)
            except Exception:
                pass
            takes.append(t)
        return {"count": n, "takes": takes}
    finally:
        mel.eval("FBXClose")                              # releases the file lock


def reimport_stats(path, kind=None, allow_discard=False, frames=None):
    """Open a new scene, import the file with explicit import settings, return scene_stats().
    Refuses to discard unsaved changes unless allow_discard=True."""
    import maya.mel as mel
    cmds = _cmds()
    kind = (kind or os.path.splitext(path)[1].lstrip(".")).lower()
    _new_scene(allow_discard)
    p = os.path.abspath(path).replace("\\", "/")
    if kind == "fbx":
        load_plugins("fbx")
        mel.eval("FBXResetImport")
        mel.eval("FBXImportMode -v add")
        if _mel_cmd_exists("FBXImportGenerateLog"):
            mel.eval("FBXImportGenerateLog -v true")         # the import side of the log, same folder
        if _mel_cmd_exists("FBXImportSmoothingGroups"):      # UI option; command not in the saved docs [verify]
            mel.eval("FBXImportSmoothingGroups -v true")
        mel.eval("FBXImport -f %s" % mel_str(p))
    elif kind == "abc":
        load_plugins("abc")
        cmds.AbcImport(p, mode="import")                  # [verify] flags
    elif kind in ("usd", "usda", "usdc", "usdz"):
        load_plugins("usd")
        cmds.mayaUSDImport(file=p, primPath="/", readAnimData=True)
    else:
        cmds.file(p, i=True, force=True)
    st = scene_stats(None)
    if frames:
        st["frames"] = sample_frames(None, frames)
    return st


def _mel_cmd_exists(name):
    import maya.mel as mel
    try:
        return bool(mel.eval('exists "%s"' % name))
    except Exception:
        return False


def sample_frames(roots, frames):
    """{frame: {mesh leaf: [verts, bbox]}}: topology and position over time."""
    cmds = _cmds()
    out = {}
    shapes = _meshes_under(resolve(roots) if roots else None)
    now = cmds.currentTime(q=True)
    try:
        for f in frames:
            cmds.currentTime(f, update=True)
            row = {}
            for s in shapes:
                x = _parent(s)
                row[strip_ns(x)] = [cmds.polyEvaluate(s, vertex=True),
                                    [round(v, 4) for v in cmds.exactWorldBoundingBox(x)]]
            out[str(f)] = row
    finally:
        cmds.currentTime(now, update=True)
    return out


# =============================================================================== Alembic and GPU cache
def abc_export(path, roots, start, end, frames=None, **flags):
    """AbcExport with source samples for abc_verify. Paths with spaces go through a temp file
    [added]. Export from the composed shot state, never from pre-layout sources (RISE)."""
    cmds = _cmds()
    load_plugins("abc")
    roots = resolve(roots)
    frames = frames or sorted(set([start, int((start + end) / 2), end]))
    samples = sample_frames(roots, frames)
    target = os.path.abspath(path)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    tmp_dir = None
    write_to = target
    if re.search(r"\s", target):
        tmp_dir = tempfile.mkdtemp(prefix="mx_abc_")
        write_to = os.path.join(tmp_dir, _safe(os.path.basename(target)))
    job = abc_job(roots, write_to.replace("\\", "/"), start, end, **flags)
    try:
        cmds.AbcExport(j=job)
        if tmp_dir:
            shutil.move(write_to, target)
    finally:
        if tmp_dir and os.path.isdir(tmp_dir) and not os.listdir(tmp_dir):
            os.rmdir(tmp_dir)
    return {"path": target, "kind": "abc", "job": job, "frames": frames, "samples": samples,
            "sha1": file_sha1(target) if os.path.isfile(target) else None, "exported": os.path.isfile(target)}


def abc_verify(path, samples, allow_discard=False, tol=1e-3):
    """Re-import in a new scene; per sampled frame, vertex counts must match (topology constant)
    and bounding boxes stay within tol (relative to their size)."""
    frames = [float(f) for f in samples]
    after = reimport_stats(path, "abc", allow_discard=allow_discard, frames=frames)["frames"]
    diffs = []
    for f, row in samples.items():
        got = after.get(str(float(f))) or after.get(str(f)) or {}
        for mesh, (nv, bb) in row.items():
            if mesh not in got:
                diffs.append("frame %s: %s missing" % (f, mesh))
                continue
            gnv, gbb = got[mesh]
            if gnv != nv:
                diffs.append("frame %s: %s verts %s -> %s" % (f, mesh, nv, gnv))
            size = max(1e-6, max(bb[i + 3] - bb[i] for i in range(3)))
            if max(abs(a - b) for a, b in zip(bb, gbb)) > tol * size:
                diffs.append("frame %s: %s bbox %s -> %s" % (f, mesh, bb, gbb))
    return {"ok": not diffs, "diffs": diffs}


def gpu_cache_export(roots, directory, name, start=None, end=None):
    """gpuCache -directory -fileName -saveMultipleFiles false (Maya 2027 Help); time flags [verify]."""
    cmds = _cmds()
    load_plugins("gpucache")
    kw = {"directory": directory, "fileName": name, "saveMultipleFiles": False}
    if start is not None:
        kw.update(startTime=start, endTime=end if end is not None else start)
    os.makedirs(directory, exist_ok=True)
    return cmds.gpuCache(resolve(roots), **kw)


def gpu_cache_load(path, name="mxGpuCache#", geom_path="|"):
    """No import command exists: create the gpuCache node and set its attributes."""
    cmds = _cmds()
    load_plugins("gpucache")
    shape = cmds.createNode("gpuCache", name=name)          # creates a parent transform too [verify naming]
    cmds.setAttr(shape + ".cacheFileName", path, type="string")
    cmds.setAttr(shape + ".cacheGeomPath", geom_path, type="string")
    return shape


# =============================================================================== USD
def usd_export(path, roots, frame_range=None, default_prim=None, subdiv=False, overrides=None, verify=True):
    """mayaUSDExport with every default trap set explicitly, then usd_verify()."""
    cmds = _cmds()
    load_plugins("usd")
    roots = resolve(roots)
    kw = usd_export_kwargs(os.path.abspath(path), roots, frame_range,
                           static_time=cmds.currentTime(q=True), default_prim=default_prim,
                           subdiv=subdiv, overrides=overrides)
    os.makedirs(os.path.dirname(kw["file"]), exist_ok=True)
    cmds.mayaUSDExport(**kw)
    rep = {"path": kw["file"], "kind": "usd", "kwargs": kw, "exported": os.path.isfile(kw["file"])}
    if rep["exported"]:
        rep["sha1"] = file_sha1(kw["file"])
    if verify and rep["exported"]:
        skinned = any(_history_of(s, "skinCluster") for s in _meshes_under(roots))
        rep["verify"] = usd_verify(kw["file"], {"default_prim": kw["defaultPrim"],
                                                "frame_range": frame_range, "mesh_scheme": kw["defaultMeshScheme"],
                                                "up_axis": kw["upAxis"], "meters_per_unit": 0.01 if kw["unit"] == "cm" else None,
                                                "skel_root": skinned and kw["exportSkin"] != "none"})
    return rep


def usd_verify(path, expect=None):
    """Re-read with pxr: default prim, time range, subdivision scheme and normals per mesh, UV
    primvar names, SkelRoot, up axis and meters per unit, material scope, unresolved assets."""
    from pxr import Usd, UsdGeom
    expect = expect or {}
    stage = Usd.Stage.Open(path)
    probs, info = [], {}
    dp = stage.GetDefaultPrim()
    info["default_prim"] = dp.GetName() if dp and dp.IsValid() else None
    if expect.get("default_prim") and info["default_prim"] != expect["default_prim"]:
        probs.append("default prim %s, expected %s" % (info["default_prim"], expect["default_prim"]))
    info["time"] = [stage.GetStartTimeCode(), stage.GetEndTimeCode()] if stage.HasAuthoredTimeCodeRange() else None
    fr = expect.get("frame_range")
    if fr and (not info["time"] or abs(info["time"][0] - fr[0]) > 1e-6 or abs(info["time"][1] - fr[1]) > 1e-6):
        probs.append("time range %s, expected %s (frameRange defaults to [1, 1])" % (info["time"], list(fr)))
    info["up_axis"] = UsdGeom.GetStageUpAxis(stage)
    info["meters_per_unit"] = UsdGeom.GetStageMetersPerUnit(stage)
    if expect.get("up_axis") and str(info["up_axis"]).lower() != expect["up_axis"].lower():
        probs.append("up axis %s" % info["up_axis"])
    mpu = expect.get("meters_per_unit")
    if mpu and abs(info["meters_per_unit"] - mpu) > 1e-9:
        probs.append("metersPerUnit %s, expected %s" % (info["meters_per_unit"], mpu))
    meshes, skel_roots, scopes = [], 0, set()
    for prim in stage.Traverse():
        tn = prim.GetTypeName()
        if tn == "SkelRoot":
            skel_roots += 1
        if tn == "Scope":
            scopes.add(prim.GetName())
        if tn != "Mesh":
            continue
        m = UsdGeom.Mesh(prim)
        pv = UsdGeom.PrimvarsAPI(prim)
        names = [p.GetPrimvarName() for p in pv.GetPrimvars()]
        normals = m.GetNormalsAttr().HasAuthoredValue() or pv.HasPrimvar("normals")
        scheme = m.GetSubdivisionSchemeAttr().Get()
        pts = m.GetPointsAttr()
        meshes.append({"path": str(prim.GetPath()), "scheme": scheme, "normals": bool(normals),
                       "primvars": [str(n) for n in names], "point_samples": pts.GetNumTimeSamples()})
        if expect.get("mesh_scheme") and scheme != expect["mesh_scheme"]:
            probs.append("%s scheme %s (catmullClark is the export default)" % (prim.GetPath(), scheme))
        if scheme == "none" and not normals:
            probs.append("%s has no normals" % prim.GetPath())
    info.update(meshes=meshes, skel_roots=skel_roots, scopes=sorted(scopes))
    if expect.get("skel_root") and not skel_roots:
        probs.append("no SkelRoot although skinned meshes were exported (exportSkels/exportSkin)")
    try:
        from pxr import UsdUtils
        layers, assets, unresolved = UsdUtils.ComputeAllDependencies(path)       # [verify] return shape
        info["unresolved"] = [str(u) for u in unresolved]
        info["absolute_assets"] = [str(a) for a in assets if os.path.isabs(str(a))]
        if unresolved:
            probs.append("unresolved asset paths: %s" % info["unresolved"][:5])
    except Exception as exc:
        info["dependencies_error"] = str(exc)
    return {"ok": not probs, "problems": probs, "info": info}


def usd_shot_layers(shot_dir, shot, departments=("lighting", "fx", "anim", "layout"), sequence_layer=None,
                    ext="usda"):
    """Shot root layer whose sublayers are the department layers (strongest first) and then
    the sequence layer: the shot sublayers the sequence, never the reverse (Autodesk USD
    Workflow Ep.5 [00:00:55]). Returns {root, sublayers}. pxr only; runs in mayapy."""
    from pxr import Sdf
    os.makedirs(shot_dir, exist_ok=True)
    subs = []
    for d in departments:
        p = os.path.join(shot_dir, "%s_%s.%s" % (shot, d, ext))
        lay = Sdf.Layer.FindOrOpen(p) or Sdf.Layer.CreateNew(p)
        lay.Save()
        subs.append("./" + os.path.basename(p))
    if sequence_layer:
        subs.append(os.path.relpath(os.path.abspath(sequence_layer), shot_dir).replace(os.sep, "/"))
    root_path = os.path.join(shot_dir, "%s.%s" % (shot, ext))
    root = Sdf.Layer.FindOrOpen(root_path) or Sdf.Layer.CreateNew(root_path)
    try:
        root.subLayerPaths = subs                         # [verify] property assignment
    except Exception:
        for s in list(root.subLayerPaths):
            root.subLayerPaths.remove(s)
        for s in subs:
            root.subLayerPaths.append(s)
    root.Save()
    return {"root": root_path, "sublayers": subs}


def mute_own_and_stronger(stage, own_layer):
    """RISE: mute the artist's own layer and every stronger one by default, or published work
    comes back through composition (8UIW-g1_heg [00:26:19]). own_layer: identifier or path."""
    from pxr import Sdf
    root = stage.GetRootLayer()
    ids = [Sdf.ComputeAssetPathRelativeToLayer(root, s) for s in root.subLayerPaths]
    own = own_layer if isinstance(own_layer, str) else own_layer.identifier
    own_abs = os.path.abspath(own) if os.path.exists(own) else own
    idx = next((i for i, x in enumerate(ids) if x == own or os.path.abspath(x) == own_abs), None)
    if idx is None:
        raise ValueError("%s is not a sublayer of the root layer %s" % (own, root.identifier))
    muted = ids[:idx + 1]
    for i in muted:
        stage.MuteLayer(i)
    return muted


def layer_specs(layer_or_path):
    """Audit a shot layer: prim specs that override (over) vs define (def), with properties."""
    from pxr import Sdf
    layer = layer_or_path if not isinstance(layer_or_path, str) else Sdf.Layer.FindOrOpen(layer_or_path)
    overs, defs = [], []

    def walk(spec):
        entry = {"path": str(spec.path), "properties": [p.name for p in spec.properties]}
        (overs if spec.specifier == Sdf.SpecifierOver else defs).append(entry)
        for c in spec.nameChildren:
            walk(c)
    for p in layer.rootPrims:
        walk(p)
    return {"overs": overs, "defs": defs}


def usd_stage(path, name="mxStage"):
    """Proxy shape on a USD file: USD stays USD (no conversion). Attribute names [verify]."""
    cmds = _cmds()
    load_plugins("usd")
    xf = cmds.createNode("transform", name=name)
    shape = cmds.createNode("mayaUsdProxyShape", name=name + "Shape", parent=xf)
    cmds.setAttr(shape + ".filePath", os.path.abspath(path), type="string")
    cmds.connectAttr("time1.outTime", shape + ".time", force=True)
    return cmds.ls(shape, long=True)[0]


def get_stage(proxy_shape):
    import mayaUsd.ufe                                     # [verify] module path in 0.35 to 0.37
    return mayaUsd.ufe.getStage(proxy_shape)


# =============================================================================== references and namespaces
def reference(path, namespace, allow_suffix=False):
    """Reference with a generated namespace. Maya appends a number to a clashing namespace,
    which silently breaks name-based tools downstream, so a clash raises [added]."""
    cmds = _cmds()
    if cmds.namespace(exists=":" + namespace) and not allow_suffix:
        raise ValueError("namespace %s already exists" % namespace)
    nodes = cmds.file(path, reference=True, namespace=namespace, returnNewNodes=True) or []
    ref = cmds.referenceQuery(nodes[0], referenceNode=True) if nodes else None
    got = cmds.referenceQuery(ref, namespace=True).lstrip(":") if ref else None
    return {"ref": ref, "namespace": got, "nodes": len(nodes), "path": path}


def references_report():
    """Every reference: file, loaded, file exists, namespace, parent reference, edit counts."""
    cmds = _cmds()
    out = []
    for ref in cmds.ls(type="reference") or []:
        if ref in ("sharedReferenceNode", "_UNKNOWN_REF_NODE_") or ref.endswith("sharedReferenceNode"):
            continue
        d = {"ref": ref}
        try:
            d["file"] = cmds.referenceQuery(ref, filename=True, withoutCopyNumber=True)
            d["file_with_copy"] = cmds.referenceQuery(ref, filename=True)
            d["loaded"] = cmds.referenceQuery(ref, isLoaded=True)
            d["exists"] = os.path.isfile(os.path.expandvars(d["file"]))
            d["namespace"] = cmds.referenceQuery(ref, namespace=True).lstrip(":")
            d["parent"] = cmds.referenceQuery(ref, referenceNode=True, parent=True)
            d["edits"] = len(cmds.referenceQuery(ref, editStrings=True) or [])
            d["failed_edits"] = len(cmds.referenceQuery(ref, editStrings=True, failedEdits=True,
                                                        successfulEdits=False) or [])
        except Exception as exc:
            d["error"] = str(exc)
        out.append(d)
    out.append({"foster_parents": cmds.ls(type="fosterParent") or []})
    return out


def swap_reference(ref, new_path):
    """Load a new version into the same reference node (edits replay by name and DAG path:
    never rename or restructure a published child file), then count failed edits."""
    cmds = _cmds()
    cmds.file(new_path, loadReference=ref)
    failed = cmds.referenceQuery(ref, editStrings=True, failedEdits=True, successfulEdits=False) or []
    return {"ref": ref, "file": cmds.referenceQuery(ref, filename=True, withoutCopyNumber=True),
            "failed_edits": failed[:50], "failed_count": len(failed)}


def remove_failed_edits(ref):
    """Unload, remove failed edits, reload [verify: removeEdits needs the reference unloaded]."""
    cmds = _cmds()
    before = cmds.referenceQuery(ref, editStrings=True, failedEdits=True, successfulEdits=False) or []
    cmds.file(unloadReference=ref)
    try:
        cmds.referenceEdit(ref, failedEdits=True, successfulEdits=False, removeEdits=True)
    finally:
        cmds.file(loadReference=ref)
    after = cmds.referenceQuery(ref, editStrings=True, failedEdits=True, successfulEdits=False) or []
    return {"removed": len(before) - len(after), "remaining": len(after)}


def breakdown(manifest):
    """Scene breakdown against a manifest [{namespace, path}] (Borderlands [00:23:16]):
    missing, extra, stale (other file), unloaded."""
    rep = {r["namespace"]: r for r in references_report() if "namespace" in r}
    want = {m["namespace"]: m for m in manifest}
    norm = lambda p: os.path.normpath(os.path.expandvars(p or ""))  # noqa: E731
    return {"missing": sorted(set(want) - set(rep)), "extra": sorted(set(rep) - set(want)),
            "stale": sorted(ns for ns in set(want) & set(rep) if norm(want[ns]["path"]) != norm(rep[ns].get("file"))),
            "unloaded": sorted(ns for ns in rep if not rep[ns].get("loaded")),
            "failed_edits": {ns: rep[ns]["failed_edits"] for ns in rep if rep[ns].get("failed_edits")}}


# =============================================================================== performance
_IMPURE = ("getAttr", "setAttr", "ls ", "ls(", "select", "listConnections", "eval", "python", "xform")
_HEAVY_PER_FRAME = ("transferAttributes", "polySmoothFace", "pointOnPolyConstraint", "polyUnite")
_LEGACY_DYN = ("particle", "fluidShape", "rigidBody", "rigidSolver", "spring")


def perf_census():
    """What makes a scene slow or serial, read-only (Parallel Maya 2027; Fragapane; Campos)."""
    cmds = _cmds()
    rep = {}
    try:
        rep["evaluation_mode"] = cmds.evaluationManager(q=True, mode=True)
        rep["evaluators_enabled"] = cmds.evaluator(q=True, enable=True)
    except Exception as exc:
        rep["evaluation_error"] = str(exc)
    exprs = []
    for e in cmds.ls(type="expression") or []:
        body = cmds.expression(e, q=True, string=True) or ""
        bad = [t.strip("( ") for t in _IMPURE if t in body]
        exprs.append({"node": e, "impure": sorted(set(bad)), "animated": cmds.getAttr(e + ".animated")})
    rep["expressions"] = exprs
    py_nodes = {}
    for p in cmds.pluginInfo(q=True, listPlugins=True) or []:
        path = cmds.pluginInfo(p, q=True, path=True) or ""
        if path.endswith(".py"):
            for t in cmds.pluginInfo(p, q=True, dependNode=True) or []:
                n = len(cmds.ls(type=t) or [])
                if n:
                    py_nodes[t] = n
    rep["python_plugin_nodes"] = py_nodes              # Globally Serial by default (Parallel Maya 2027)
    driven = []
    for attr in ("frozen", "nodeState"):
        for plug in cmds.ls("*.%s" % attr, recursive=True) or []:
            src = cmds.listConnections(plug, source=True, destination=False) or []
            if src:
                driven.append({"plug": plug, "from": src[:2]})
    rep["driven_frozen_or_nodestate"] = driven[:100]
    rep["heavy_per_frame_nodes"] = {t: len(cmds.ls(type=t) or []) for t in _HEAVY_PER_FRAME if cmds.ls(type=t)}
    rep["legacy_dynamics"] = {t: len(cmds.ls(type=t) or []) for t in _LEGACY_DYN if cmds.ls(type=t)}
    rep["script_nodes"] = cmds.ls(type="script") or []
    thr = int(os.environ.get("MAYA_OPENCL_DEFORMER_MIN_VERTS", "2000"))
    gpu = []
    for s in cmds.ls(type="mesh", noIntermediate=True, long=True) or []:
        defs = _history_of(s, "geometryFilter")
        if defs:
            nv = cmds.polyEvaluate(s, vertex=True)
            gpu.append({"mesh": s, "verts": nv, "deformers": sorted(set(cmds.nodeType(d) for d in defs)),
                        "above_threshold": nv > thr})
    rep["deformed_meshes"] = gpu[:200]
    rep["gpu_threshold_verts"] = thr
    try:
        rep["gpu_deformers_supported"] = sorted(cmds.deformerEvaluator(q=True, deformers=True) or [])
    except Exception as exc:
        rep["gpu_deformers_supported"] = "error: %s" % exc
    return rep


def eval_timing(start, end, probes, modes=("parallel", "serial", "off"), max_points=200000):
    """Evaluation-only timing per evaluation mode, plus correctness: world points of the probe
    meshes must match across modes (make it right, then fast). Headless has no drawing: the
    numbers are evaluation-bound only, say so in the report. EM behaviour in mayapy [verify]."""
    import maya.api.OpenMaya as om
    cmds = _cmds()
    probes = resolve(probes)
    prev = cmds.evaluationManager(q=True, mode=True)
    prev = prev[0] if isinstance(prev, (list, tuple)) and prev else prev
    dags = []
    for p in probes:
        if cmds.nodeType(p) != "mesh":        # the visible shape: a skinned transform also holds an Orig shape
            shapes = cmds.listRelatives(p, shapes=True, noIntermediate=True, type="mesh", fullPath=True) or []
            if not shapes:
                raise ValueError("%s has no visible mesh shape" % p)
            p = shapes[0]
        if _toolkit("mx_audit").is_empty_mesh(p):   # MFnMesh raises on an empty mesh (2022.1)
            raise ValueError("probe %s is an empty mesh" % p)
        sl = om.MSelectionList()
        sl.add(p)
        dags.append(sl.getDagPath(0))
    out, ref = {}, None
    try:
        for mode in modes:
            cmds.evaluationManager(mode=mode)
            cmds.currentTime(start, update=True)
            t0 = time.perf_counter()
            pts = []
            for f in range(int(start), int(end) + 1):
                cmds.currentTime(f, update=True)
                for d in dags:
                    arr = om.MFnMesh(d).getPoints(om.MSpace.kWorld)
                    room = max(0, max_points - len(pts))
                    for i in range(min(len(arr), room)):
                        pts.append((arr[i].x, arr[i].y, arr[i].z))
            dt = time.perf_counter() - t0
            n = int(end) - int(start) + 1
            out[mode] = {"seconds": round(dt, 4), "fps_eval": round(n / dt, 2) if dt else None}
            if ref is None:
                ref = pts
                out[mode]["max_delta_vs_first"] = 0.0
            else:
                out[mode]["max_delta_vs_first"] = max((max(abs(a - b) for a, b in zip(p, q))
                                                       for p, q in zip(pts, ref)), default=0.0)
    finally:
        if prev:
            cmds.evaluationManager(mode=prev)
    out["consistent"] = all(v.get("max_delta_vs_first", 0) < 1e-4 for k, v in out.items() if isinstance(v, dict))
    out["note"] = "evaluation only (no drawing); draw-bound problems need a GUI playback"
    return out


# =============================================================================== builtin job
def export_job(argv):
    """The builtin batch job (BUILTIN_EXPORT): reference health, validate, safe fixes, save a
    fixed version, engine checks, FBX export, the FBX log, a partial report, re-import in a
    new scene and compare counts, bounding boxes, normals, units and axis."""
    import argparse
    ap = argparse.ArgumentParser(prog="mx_pipeline job-export")
    ap.add_argument("--preset", default="unreal_skeletal", choices=sorted(FBX_PRESETS))
    ap.add_argument("--profile", default="rig", choices=("model", "rig", "shot"))
    ap.add_argument("--roots", default="", help="comma list; default: --export-set or top nodes with meshes/joints")
    ap.add_argument("--export-set", default="")
    ap.add_argument("--fix", default="history,smooth_preview,unknown_dead,namespaces",
                    help="mx_validate fix ids, comma list, or 'none'")
    ap.add_argument("--cap-influences", type=int, default=0, help="opt-in: cap to N if the change is small")
    ap.add_argument("--cap-max-delta", type=float, default=0.1)
    ap.add_argument("--triangulate", action="store_true", help="export-time triangulation of unskinned meshes")
    ap.add_argument("--tangents", default="preset", choices=("preset", "on", "off"))
    ap.add_argument("--bake", nargs=2, type=float, default=None)
    ap.add_argument("--take", nargs=3, action="append", default=[], metavar=("NAME", "START", "END"))
    ap.add_argument("--rules", default="", help="JSON for mx_validate rules")
    ap.add_argument("--engine-rules", default="", help="JSON overriding ENGINE_RULES")
    ap.add_argument("--downgrade", default="", help="issue ids to report as warnings, e.g. V:file_paths,E12")
    ap.add_argument("--export-on-fail", action="store_true")
    ap.add_argument("--no-verify", action="store_true")
    ap.add_argument("--fps", type=float, default=None, help="target rate (project or Unreal sequence): E27")
    ap.add_argument("--fbx-log-strict", action="store_true", help="FBX log error lines are errors (X05)")
    ap.add_argument("--normals-tol", type=float, default=NORMALS_TOL, help="round-trip normals mismatch fraction")
    ap.add_argument("--out", default=os.environ.get("MX_PIPELINE_OUT", ""))
    ap.add_argument("--stem", default=os.environ.get("MX_PIPELINE_STEM", ""))
    a = ap.parse_args(argv)
    cmds = _cmds()
    import mx_validate
    src = cmds.file(q=True, sceneName=True) or os.environ.get("MX_PIPELINE_SOURCE", "")
    out = os.path.abspath(a.out or os.path.join(os.path.dirname(src) or ".", "mx_export"))
    stem = a.stem or _safe(os.path.splitext(os.path.basename(src))[0])
    meta = PRESET_META[a.preset]
    rules = json.loads(a.rules) if a.rules else None
    erules = json.loads(a.engine_rules) if a.engine_rules else {}
    if a.fps:
        erules["fps"] = a.fps
    down = set(x for x in a.downgrade.split(",") if x)
    rep = {"status": None, "scene": src, "stem": stem, "preset": a.preset, "profile": a.profile,
           "issues": [], "fixes": [], "exports": [], "maya": mx_run.session_info()}
    roots = [r for r in a.roots.split(",") if r] or (export_set_members(a.export_set) if a.export_set else auto_roots())
    roots = resolve(roots)
    rep["roots"] = roots
    if not roots:
        rep["issues"].append({"id": "E00", "severity": "error", "msg": "nothing to export (no roots found)"})
        rep["status"] = "fail"
        return rep
    rep["batch_env"] = (rep["maya"] or {}).get("batch_env")
    refs = references_report()                      # reference health before any fix or export
    rep["references"] = refs
    rep["issues"] += reference_issues(refs)
    if any(i["severity"] == "error" for i in rep["issues"]) and not a.export_on_fail:
        rep["status"] = "fail"
        return rep
    rep["stats_source"] = scene_stats(roots)
    ids = uuids(roots)
    fixes = tuple(f for f in a.fix.split(",") if f and f != "none")
    # mx_validate holds the roots by UUID across its fixes (namespace merge included) since
    # the 2026-09-24 toolkit refactor; roots_after gives the renamed roots back
    v = mx_validate.validate(profile=a.profile, roots=roots, rules=rules, fix=fixes)
    fix_log = list(v.get("fixes") or [])
    roots = v.get("roots_after") or from_uuids(ids)
    rep["roots"] = roots
    changed = False
    for entry in fix_log:
        if entry.get("done"):
            changed = True
            rep["fixes"].append({"fix": entry["fix"], "done": entry["done"][:20], "count": len(entry["done"])})
        if entry.get("skipped"):
            rep["issues"].append({"id": "F:" + entry["fix"], "severity": "info", "msg": "fix skipped",
                                  "node": entry["skipped"][:10]})
    if a.cap_influences:
        for s in _meshes_under(roots):
            for sk in _history_of(s, "skinCluster"):
                r = cap_influences(sk, s, a.cap_influences, max_delta=a.cap_max_delta, apply=True)
                if r.get("applied"):
                    changed = True
                    rep["fixes"].append({"fix": "cap_influences", "done": [sk], "stats": r})
                elif r.get("changed_vertices"):
                    rep["issues"].append({"id": "F:cap_influences", "severity": "warning", "node": sk,
                                          "msg": r.get("reason")})
    for c in v["checks"]:
        if c["status"] not in ("fail", "warn"):
            continue
        items = c["items"]
        rep["issues"].append({"id": "V:" + c["id"], "severity": "error" if c["status"] == "fail" else "warning",
                              "msg": c["message"], "count": len(items), "node": items[:10]})
    rep["validate_summary"] = v["summary"]
    if changed:
        rep["fixed_scene"] = save_version(out, stem, source=src)
    tangents = {"preset": dict(fbx_options(a.preset)).get("FBXExportTangents"), "on": True, "off": False}[a.tangents]
    overrides = {"FBXExportTangents": tangents}
    if a.triangulate:
        rep["export_time"] = triangulate_for_export(roots)        # never saved: the fixed version is on disk
    rep["issues"] += check_engine_export(roots, meta["engine"], meta["kind"], erules, tangents=bool(tangents))
    for i in rep["issues"]:
        if i.get("id") in down and i.get("severity") == "error":
            i["severity"] = "warning"
            i["downgraded"] = True
    errors = [i for i in rep["issues"] if i.get("severity") == "error"]
    if errors and not a.export_on_fail:
        rep["status"] = "fail"
        return rep
    bake = tuple(a.bake) if a.bake else None
    if meta["kind"] == "anim" and not bake:
        bake = (cmds.playbackOptions(q=True, minTime=True), cmds.playbackOptions(q=True, maxTime=True))
    takes = [(t[0], float(t[1]), float(t[2])) for t in a.take]
    rep["stats_export"] = scene_stats(roots)
    fbx_path = os.path.join(out, "fbx", stem + ".fbx")
    ex = fbx_export(fbx_path, roots, a.preset, overrides=overrides, bake=bake, takes=takes, check=False)
    rep["exports"].append({"path": ex["path"], "kind": "fbx", "sha1": ex.get("sha1"), "preset": a.preset,
                           "exported": ex["exported"], "warnings": ex["warnings"]})
    rep["fbx_settings"] = ex.get("settings")
    rep["fbx_log"] = ex.get("fbx_log")
    if not ex["exported"]:
        rep["issues"].append({"id": "X01", "severity": "error", "msg": "FBXExport wrote no file"})
    else:
        rep["issues"] += fbx_log_issues((ex.get("fbx_log") or {}).get("parsed"), (ex.get("fbx_log") or {}).get("path"),
                                        strict=a.fbx_log_strict)
    write_json(os.path.join(out, "reports", stem + ".partial.json"), rep)   # survives a crash in verify
    if ex["exported"] and not a.no_verify:
        try:
            rep["takes"] = fbx_takes(ex["path"])
            after = reimport_stats(ex["path"], "fbx", allow_discard=True)
            # the range stays a note: a new scene's timeline need not follow the FBX take [verify];
            # clip length is checked through fbx_takes spans (X03)
            rep["verify"] = compare_stats(rep["stats_export"], after, check_verts=False, normals_tol=a.normals_tol)
            rep["stats_reimport"] = after
            if not rep["verify"]["ok"]:
                rep["issues"].append({"id": "X02", "severity": "error", "msg": "round trip differs",
                                      "node": rep["verify"]["diffs"][:10]})
            if rep["verify"]["notes"]:
                rep["issues"].append({"id": "X06", "severity": "info", "msg": "round-trip notes",
                                      "node": rep["verify"]["notes"][:10]})
            want_takes = len(takes) + 1 if takes else None     # Take001 always exists [verify with a bake]
            if want_takes and rep["takes"]["count"] != want_takes:
                rep["issues"].append({"id": "X03", "severity": "warning",
                                      "msg": "%d takes in the file, expected %d" % (rep["takes"]["count"], want_takes)})
        except Exception as exc:
            rep["issues"].append({"id": "X04", "severity": "error", "msg": "verify failed: %s" % exc,
                                  "traceback": traceback.format_exc()[-2000:]})
    errors = [i for i in rep["issues"] if i.get("severity") == "error"]
    warns = [i for i in rep["issues"] if i.get("severity") == "warning"]
    rep["status"] = "fail" if errors else ("fixed" if rep["fixes"] else ("warn" if warns else "pass"))
    return rep


def reimport_job(argv):
    """Child: `reimport PATH [KIND]` -> scene_stats of the file in a new scene."""
    return reimport_stats(argv[0], argv[1] if len(argv) > 1 else None, allow_discard=True)


def main(argv):
    """Entry point when mx_run runs this file as a job (child side)."""
    if not argv:
        raise ValueError("mx_pipeline child commands: session | job-export | reimport | stats")
    cmd, rest = argv[0], list(argv[1:])
    if cmd == "session":
        return _session_main(rest)
    if cmd == "job-export":
        return export_job(rest)
    if cmd == "reimport":
        return reimport_job(rest)
    if cmd == "stats":
        return scene_stats([r for r in (rest[0].split(",") if rest else []) if r] or None)
    raise ValueError("unknown child command %s" % cmd)


# =============================================================================== parent CLI
def cli(argv):
    import argparse
    if "--" in argv:
        i = argv.index("--")
        argv, extra = argv[:i], argv[i + 1:]
    else:
        extra = []
    ap = argparse.ArgumentParser(prog="mx_pipeline")
    sub = ap.add_subparsers(dest="cmd")

    def common(p):
        p.add_argument("--files", action="append", required=True, help="scene file or folder (repeatable)")
        p.add_argument("--out", required=True)
        p.add_argument("--plugins", default="fbx")
        p.add_argument("--timeout", type=float, default=900)
        p.add_argument("--workers", type=int, default=1)
        p.add_argument("--isolation", default="process", choices=("process", "session"))
        p.add_argument("--chunk", type=int, default=20)
        p.add_argument("--retries", type=int, default=0)
        p.add_argument("--no-resume", action="store_true")
        p.add_argument("--save-as", default=None)
    b = sub.add_parser("batch")
    common(b)
    b.add_argument("--job", required=True)
    e = sub.add_parser("export")
    common(e)
    e.add_argument("--preset", default="unreal_skeletal")
    d = sub.add_parser("diff")
    d.add_argument("old")
    d.add_argument("new")
    f = sub.add_parser("fbx-commands")
    f.add_argument("preset")
    f.add_argument("--bake", nargs=2, type=float)
    pf = sub.add_parser("preflight")
    pf.add_argument("--out", required=True)
    pf.add_argument("--files", action="append", default=[])
    a = ap.parse_args(argv)
    if a.cmd == "preflight":
        scenes = []
        for x in a.files:
            scenes += find_scenes(x)
        rep = preflight(a.out, scenes)
        print(json.dumps(rep, indent=1, default=str))
        return 0 if rep["ok"] else 1
    if a.cmd in ("batch", "export"):
        scenes = []
        for x in a.files:
            scenes += find_scenes(x)
        job = a.job if a.cmd == "batch" else BUILTIN_EXPORT
        jargs = extra if a.cmd == "batch" else ["--preset", a.preset] + extra
        s = batch(scenes, job, a.out, job_args=jargs, plugins=[p for p in a.plugins.split(",") if p],
                  timeout=a.timeout, workers=a.workers, isolation=a.isolation, chunk=a.chunk,
                  retries=a.retries, resume=not a.no_resume, save_as=a.save_as)
        print(json.dumps({"totals": s["totals"], "failed": s["failed"], "sources_untouched": s["sources_untouched"],
                          "summary": os.path.join(os.path.abspath(a.out), "summary.json")}, indent=1))
        return 0 if not s["failed"] else 1
    if a.cmd == "diff":
        print(json.dumps(publish_diff(read_json(a.old, {}), read_json(a.new, {})), indent=1))
        return 0
    if a.cmd == "fbx-commands":
        print("\n".join(fbx_commands(a.preset, bake=tuple(a.bake) if a.bake else None)))
        return 0
    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(cli(sys.argv[1:]))
