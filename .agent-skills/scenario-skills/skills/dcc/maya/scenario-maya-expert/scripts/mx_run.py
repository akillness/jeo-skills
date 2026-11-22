"""
mx_run: run one Python job inside headless Maya (mayapy + maya.standalone) and print
one machine-readable result line. The shared entry point for every scenario-maya-* skill.

Shell:
  mayapy  mx_run.py [options] job.py [-- job args...]
  python3 mx_run.py [options] job.py [-- job args...]   # finds mayapy and re-runs itself
  python3 mx_run.py --find                              # print the mayapy path, exit 5 if none

Options:
  --scene PATH        open this scene first (script nodes NOT executed unless --script-nodes)
  --plugins LIST      comma list: mtoa, fbx, abc, usd, obj, gpucache, bifrost, mash, xgen,
                      game, or any exact plug-in name
  --require-plugins   fail if a requested plug-in does not load
  --script-nodes      execute the scene's script nodes on open (off: they can run any code)
  --save-as PATH      save to PATH after a successful job (refuses the source path)
  --usersetup         let userSetup.py run (skipped by default so runs are reproducible)
  --timeout SEC       parent mode only: kill the child after SEC seconds (exit code 4)
  --json PATH         also write the result JSON to PATH
  --soft-exit         return normally instead of os._exit() after uninitialize
  --maya-log LEVEL    what Maya prints to stderr in batch: all, info, result, warning (the
                      default here), error, none. Use "all" when a job fails silently.

Child environment (set by the parent before mayapy starts, so Maya sees it at start-up):
  MAYA_DISABLE_ADP=1                        analytics off in batch (Maya 2027 Help, Start Maya
                                            from the command line; devkit What's New 2022)
  MAYA_BATCH_STDOUT_LOGGING_LEVEL=none      the documented default, written explicitly so a
                                            shell setting cannot flood the MX_RESULT channel
  MAYA_BATCH_STDERR_LOGGING_LEVEL=warning   Maya's warnings and errors reach log_tail without
                                            the info and result chatter (documented default: all)
  MAYA_SKIP_USERSETUP_PY=1, ARNOLD_FORCE_ABORT_ON_LICENSE_FAIL=0, PYTHONUNBUFFERED=1
  A variable already set in the caller's environment wins; env= and maya_log= win over both.
  [verify] that "warning" also passes errors, and that Python print() is unaffected by the
  stdout level (devkit 2022 lists the values, not their order). record["maya"]["batch_env"]
  shows what the child actually had.

Job protocol:
  The job file runs with runpy under the name "__mx_job__" (its `if __name__ == "__main__"`
  block does not fire). If it defines main(argv), main(job_args) is called and its return
  value is the result; otherwise the job's global `result` is. The global MX_ARGS holds the
  job args. The LAST stdout line is always:  MX_RESULT {"ok": ..., "result": ..., ...}

Library:
  import mx_run
  mx_run.find_mayapy()                                  # path or None
  mx_run.run_subprocess("job.py", ["--x", "1"], scene=..., plugins=["fbx"], timeout=600,
                        maya_log="all")
      # parent side: one mayapy child per call (crash isolation), returns the parsed dict
  mx_run.run("job.py", args)                            # inside mayapy: returns the dict,
      # keeps Maya initialized (call mx_run.shutdown() at the very end of your process)

Exit codes: 0 ok, 1 job raised, 2 usage error, 3 Maya failed to initialize, 4 timeout,
5 mayapy not found.
"""

__version__ = "0.1"  # Maya Expert Skills v0.1 (2026-09-24)
import glob
import json
import os
import platform
import re
import runpy
import subprocess
import sys
import threading
import time
import traceback

RESULT_TAG = "MX_RESULT "

PLUGIN_ALIASES = {
    "mtoa": ["mtoa"], "arnold": ["mtoa"],
    "fbx": ["fbxmaya"],
    "abc": ["AbcExport", "AbcImport"], "alembic": ["AbcExport", "AbcImport"],
    "usd": ["mayaUsdPlugin"],
    "obj": ["objExport"],
    "gpucache": ["gpuCache"],
    "bifrost": ["bifrostGraph"],
    "mash": ["MASH"],
    "xgen": ["xgenToolkit"],
    "game": ["gameFbxExporter"],
}

# Environment for reproducible batch runs. MAYA_DISABLE_ADP: analytics off in batch
# (Maya 2027 Help, Start Maya from the command line). MAYA_SKIP_USERSETUP_PY: skip startup
# scripts (Theodore 2014, re-verify on 2027). ARNOLD_FORCE_ABORT_ON_LICENSE_FAIL=0: since
# Arnold 7.3 batch renders ABORT on a licence failure by default; 0 renders with a
# watermark instead (What's New in Maya 2025, Arnold for Maya 5.4.0).
# MAYA_BATCH_*_LOGGING_LEVEL: what scripts, commands and API calls print in batch, values
# all, info, result, warning, error, none; defaults stdout none, stderr all (devkit What's
# New 2022, Output stream variables). stderr lowered to warning [added].
BATCH_ENV = {
    "MAYA_DISABLE_ADP": "1",
    "MAYA_SKIP_USERSETUP_PY": "1",
    "ARNOLD_FORCE_ABORT_ON_LICENSE_FAIL": "0",
    "PYTHONUNBUFFERED": "1",
    "MAYA_BATCH_STDOUT_LOGGING_LEVEL": "none",
    "MAYA_BATCH_STDERR_LOGGING_LEVEL": "warning",
}
MAYA_LOG_LEVELS = ("all", "info", "result", "warning", "error", "none")
STDERR_LEVEL_VAR = "MAYA_BATCH_STDERR_LOGGING_LEVEL"


def child_environment(base=None, usersetup=False, maya_log=None, env=None):
    """The environment a mayapy child gets: `base` (default os.environ), BATCH_ENV for every
    key the base does not set, then maya_log (stderr level), then `env`. Pure; tested offline."""
    if maya_log is not None and maya_log not in MAYA_LOG_LEVELS:
        raise ValueError("maya_log must be one of %s" % (MAYA_LOG_LEVELS,))
    out = dict(os.environ if base is None else base)
    for k, v in BATCH_ENV.items():
        if k == "MAYA_SKIP_USERSETUP_PY" and usersetup:
            continue
        out.setdefault(k, v)
    if maya_log is not None:
        out[STDERR_LEVEL_VAR] = maya_log
    out.update(env or {})
    return out

_STATE = {"initialized_here": False}


# --------------------------------------------------------------------------- discovery
def _version_key(path):
    m = re.search(r"[Mm]aya(\d{4})(?:\.(\d+))?", path)
    return (int(m.group(1)), int(m.group(2) or 0)) if m else (0, 0)


def find_mayapy(version=None):
    """Return the mayapy path or None.

    Order: $MX_MAYAPY, $MAYA_LOCATION/bin/mayapy (on macOS MAYA_LOCATION is
    .../Maya.app/Contents), then the newest /Applications/Autodesk/maya20*/ install
    (Linux /usr/autodesk/maya20*/, Windows C:/Program Files/Autodesk/Maya20*/).
    `version` ("2027") restricts the glob search to that release."""
    cands = []
    if os.environ.get("MX_MAYAPY"):
        cands.append(os.environ["MX_MAYAPY"])
    loc = os.environ.get("MAYA_LOCATION")
    if loc:
        cands += [os.path.join(loc, "bin", "mayapy"),
                  os.path.join(loc, "Contents", "bin", "mayapy"),
                  os.path.join(loc, "bin", "mayapy.exe")]
    found = []
    for pat in ("/Applications/Autodesk/maya20*/Maya.app/Contents/bin/mayapy",
                "/usr/autodesk/maya20*/bin/mayapy",
                "C:/Program Files/Autodesk/Maya20*/bin/mayapy.exe"):
        found += glob.glob(pat)
    if version:
        found = [p for p in found if str(version) in p]
    found.sort(key=_version_key, reverse=True)
    for p in cands + found:
        if p and os.path.isfile(p) and os.access(p, os.X_OK):
            return p
    return None


def _in_mayapy():
    try:
        import maya.standalone  # noqa: F401  (only importable in Maya's interpreter)
        return True
    except ImportError:
        return False


# --------------------------------------------------------------------------- parent side
def parse_result(text):
    """Return the dict of the last MX_RESULT line in `text`, or None."""
    for line in reversed(text.splitlines()):
        if line.startswith(RESULT_TAG):
            try:
                return json.loads(line[len(RESULT_TAG):])
            except ValueError:
                return None
    return None


def run_subprocess(job, args=(), scene=None, plugins=(), timeout=None, save_as=None,
                   require_plugins=False, script_nodes=False, usersetup=False,
                   mayapy=None, env=None, echo=False, log_path=None, maya_log=None):
    """Run `job` in a fresh mayapy child and return the parsed result dict.

    One child per call gives crash isolation, fresh memory and a hard timeout: a scene
    that hangs or segfaults costs one job, not the batch. The dict always has keys ok,
    exit_code, seconds, log_tail; plus whatever the child reported (result, error...).
    The child environment comes from child_environment() (analytics off, logging levels);
    maya_log sets Maya's stderr level ("all" to debug a silent failure)."""
    mayapy = mayapy or find_mayapy()
    if not mayapy:
        return {"ok": False, "exit_code": 5, "error": "mayapy not found (set MX_MAYAPY or MAYA_LOCATION)"}
    cmd = [mayapy, os.path.abspath(__file__)]
    if scene:
        cmd += ["--scene", os.path.abspath(scene)]
    if plugins:
        cmd += ["--plugins", ",".join(plugins)]
    if require_plugins:
        cmd.append("--require-plugins")
    if script_nodes:
        cmd.append("--script-nodes")
    if save_as:
        cmd += ["--save-as", os.path.abspath(save_as)]
    if usersetup:
        cmd.append("--usersetup")
    cmd.append(os.path.abspath(job) if os.path.isfile(job) else job)
    if args:
        cmd += ["--"] + [str(a) for a in args]
    child_env = child_environment(usersetup=usersetup, maya_log=maya_log, env=env)
    t0 = time.time()
    lines = []
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            env=child_env, text=True, bufsize=1, errors="replace")

    def _pump():
        for line in proc.stdout:
            lines.append(line)
            if echo:
                sys.stdout.write(line)
                sys.stdout.flush()

    reader = threading.Thread(target=_pump, daemon=True)
    reader.start()
    timed_out = False
    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        proc.kill()
        proc.wait()
    reader.join(timeout=5)
    text = "".join(lines)
    if log_path:
        os.makedirs(os.path.dirname(os.path.abspath(log_path)), exist_ok=True)
        with open(log_path, "w") as f:
            f.write(text)
    res = parse_result(text) or {}
    res.setdefault("ok", False)
    res["exit_code"] = 4 if timed_out else proc.returncode
    if timed_out:
        res["ok"] = False
        res["error"] = "timeout after %ss" % timeout
    elif proc.returncode != 0 and res.get("ok"):
        # the job reported success but the process died afterwards (teardown crash)
        res["teardown_warning"] = "child exited with %s after reporting ok" % proc.returncode
    if not res.get("ok") and "error" not in res:
        res["error"] = "child exited with %s and no MX_RESULT line" % proc.returncode
    res["seconds_wall"] = round(time.time() - t0, 2)
    res["log_tail"] = text.splitlines()[-40:]
    res["cmd"] = cmd
    return res


# --------------------------------------------------------------------------- child side
def _maya_ready():
    try:
        import maya.cmds as cmds
        return bool(cmds.about(version=True))
    except Exception:
        return False


def ensure_maya():
    """Initialize maya.standalone unless Maya is already up (GUI, or initialized before).
    Returns True when this call initialized it. initialize() raises inside a GUI session,
    hence the check (Maya 2027 Help, Initializing and uninitializing in Python)."""
    if _maya_ready():
        return False
    import maya.standalone
    try:
        maya.standalone.initialize(name="python")
    except TypeError:  # [verify] the name kwarg on 2027
        maya.standalone.initialize()
    _STATE["initialized_here"] = True
    return True


def shutdown():
    """Uninitialize maya.standalone if this module initialized it."""
    if _STATE.get("initialized_here"):
        _STATE["initialized_here"] = False
        try:
            import maya.standalone
            maya.standalone.uninitialize()
        except Exception:
            pass


def session_info():
    import maya.cmds as cmds
    info = {"python": sys.version.split()[0], "machine": platform.machine(),
            "mayapy": sys.executable}
    for key, flag in (("maya_version", "version"), ("api_version", "apiVersion"),
                      ("cut", "cutIdentifier"), ("batch", "batch"), ("os", "operatingSystem")):
        try:
            info[key] = cmds.about(**{flag: True})
        except Exception as exc:
            info[key] = "error: %s" % exc
    info["batch_env"] = {k: os.environ.get(k) for k in BATCH_ENV}
    return info


def load_plugins(names, required=False):
    """Load plug-ins by alias or exact name. Returns {name: {"loaded", "version"|"error"}}."""
    import maya.cmds as cmds
    report = {}
    for alias in names or ():
        alias = alias.strip()
        if not alias:
            continue
        for name in PLUGIN_ALIASES.get(alias.lower(), [alias]):
            if name == "mtoa":
                os.environ.setdefault("ARNOLD_FORCE_ABORT_ON_LICENSE_FAIL", "0")
            entry = {}
            try:
                if not cmds.pluginInfo(name, q=True, loaded=True):
                    cmds.loadPlugin(name, quiet=True)
                entry["loaded"] = bool(cmds.pluginInfo(name, q=True, loaded=True))
                entry["version"] = cmds.pluginInfo(name, q=True, version=True)
            except Exception as exc:
                entry = {"loaded": False, "error": "%s: %s" % (type(exc).__name__, exc)}
            report[name] = entry
            if required and not entry.get("loaded"):
                raise RuntimeError("required plug-in %s did not load: %s" % (name, entry.get("error")))
    return report


def open_scene(path, script_nodes=False):
    """Open a scene without prompts and, by default, without running its script nodes."""
    import maya.cmds as cmds
    if not os.path.isfile(path):
        raise IOError("scene not found: %s" % path)
    try:
        cmds.file(path, open=True, force=True, prompt=False, ignoreVersion=True,
                  executeScriptNodes=script_nodes)
    except TypeError:  # [verify] flag names on 2027; fall back to the minimal call
        cmds.file(path, open=True, force=True)
    return cmds.file(q=True, sceneName=True)


def save_scene(path, source=None, overwrite=False):
    """Save the current scene as `path` (.ma or .mb). Never overwrites the opened source."""
    import maya.cmds as cmds
    path = os.path.abspath(path)
    if source and os.path.abspath(source) == path and not overwrite:
        raise RuntimeError("refusing to overwrite the source scene %s; save a new version" % path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    kind = "mayaBinary" if path.lower().endswith(".mb") else "mayaAscii"
    cmds.file(rename=path)
    cmds.file(save=True, type=kind, force=True)
    return path


def _json_default(obj):
    try:
        return list(obj)          # OpenMaya arrays, MMatrix, MVector, tuples, sets
    except TypeError:
        return repr(obj)


def emit(record, json_path=None):
    text = json.dumps(record, default=_json_default)
    sys.stdout.flush()
    sys.stdout.write("\n" + RESULT_TAG + text + "\n")
    sys.stdout.flush()
    if json_path:
        os.makedirs(os.path.dirname(os.path.abspath(json_path)), exist_ok=True)
        with open(json_path, "w") as f:
            json.dump(record, f, indent=1, default=_json_default)


def _exec_job(job, args):
    args = list(args or [])
    if os.path.isfile(job):
        job = os.path.abspath(job)
        job_dir = os.path.dirname(job)
        old_argv, old_path = sys.argv[:], sys.path[:]
        sys.argv = [job] + args
        if job_dir not in sys.path:
            sys.path.insert(0, job_dir)
        here = os.path.dirname(os.path.abspath(__file__))
        if here not in sys.path:
            sys.path.insert(0, here)
        try:
            ns = runpy.run_path(job, init_globals={"MX_ARGS": args}, run_name="__mx_job__")
            if callable(ns.get("main")):
                return ns["main"](args)
            return ns.get("result")
        finally:
            sys.argv, sys.path[:] = old_argv, old_path
    if ":" in job:  # "package.module:function"
        import importlib
        mod_name, fn_name = job.split(":", 1)
        return getattr(importlib.import_module(mod_name), fn_name)(args)
    raise IOError("job not found: %s" % job)


def run(job, args=None, scene=None, plugins=(), require_plugins=False, script_nodes=False,
        save_as=None, json_path=None, new_scene=True, print_result=True):
    """Inside mayapy: initialize Maya if needed, load plug-ins, open the scene, run the job,
    print the MX_RESULT line and return the record. Maya stays initialized (see shutdown)."""
    t0 = time.time()
    rec = {"ok": False, "job": job, "args": list(args or [])}
    try:
        ensure_maya()
    except Exception as exc:
        rec.update(error="maya.standalone.initialize failed: %s: %s" % (type(exc).__name__, exc),
                   traceback=traceback.format_exc(), init_failed=True)
        if print_result:
            emit(rec, json_path)
        return rec
    try:
        import maya.cmds as cmds
        rec["maya"] = session_info()
        rec["plugins"] = load_plugins(plugins, required=require_plugins)
        if scene:
            rec["scene"] = open_scene(scene, script_nodes=script_nodes)
        elif new_scene:
            cmds.file(new=True, force=True)
        rec["result"] = _exec_job(job, args)
        rec["ok"] = True
        if save_as:
            rec["saved"] = save_scene(save_as, source=scene)
    except SystemExit as exc:
        rec["ok"] = exc.code in (0, None)
        if not rec["ok"]:
            rec["error"] = "job called sys.exit(%r)" % (exc.code,)
    except BaseException as exc:
        rec["ok"] = False                     # also when the job passed but the save failed
        rec["error"] = "%s: %s" % (type(exc).__name__, exc)
        rec["traceback"] = traceback.format_exc()
    rec["seconds"] = round(time.time() - t0, 3)
    if print_result:
        emit(rec, json_path)
    return rec


# --------------------------------------------------------------------------- CLI
def _parse_cli(argv):
    opts = {"plugins": [], "scene": None, "require_plugins": False, "script_nodes": False,
            "save_as": None, "usersetup": False, "timeout": None, "json": None,
            "soft_exit": False, "find": False, "job": None, "args": [], "maya_log": None}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--":
            opts["args"] = argv[i + 1:]
            break
        if opts["job"] is not None:
            opts["args"].append(a)          # args after the job without "--"
        elif a == "--find":
            opts["find"] = True
        elif a in ("--scene", "--plugins", "--save-as", "--timeout", "--json", "--maya-log"):
            if i + 1 >= len(argv):
                raise ValueError("%s needs a value" % a)
            v = argv[i + 1]
            i += 1
            if a == "--plugins":
                opts["plugins"] += [p for p in v.split(",") if p]
            elif a == "--timeout":
                opts["timeout"] = float(v)
            elif a == "--maya-log":
                if v not in MAYA_LOG_LEVELS:
                    raise ValueError("--maya-log must be one of %s" % (MAYA_LOG_LEVELS,))
                opts["maya_log"] = v
            else:
                opts[a[2:].replace("-", "_")] = v
        elif a in ("--require-plugins", "--script-nodes", "--usersetup", "--soft-exit"):
            opts[a[2:].replace("-", "_")] = True
        elif a.startswith("--"):
            raise ValueError("unknown option %s" % a)
        else:
            opts["job"] = a
        i += 1
    return opts


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    try:
        o = _parse_cli(argv)
    except ValueError as exc:
        sys.stderr.write("mx_run: %s\n%s" % (exc, __doc__))
        return 2
    if o["find"]:
        p = find_mayapy()
        print(p or "")
        return 0 if p else 5
    if not o["job"]:
        sys.stderr.write(__doc__)
        return 2
    if not _in_mayapy():
        res = run_subprocess(o["job"], o["args"], scene=o["scene"], plugins=o["plugins"],
                             timeout=o["timeout"], save_as=o["save_as"],
                             require_plugins=o["require_plugins"], script_nodes=o["script_nodes"],
                             usersetup=o["usersetup"], echo=True, maya_log=o["maya_log"])
        if res.get("exit_code") in (4, 5):
            emit(res, o["json"])     # the child could not report: report for it
        elif o["json"]:
            with open(o["json"], "w") as f:
                json.dump(res, f, indent=1, default=_json_default)
        return res.get("exit_code", 1)
    # started as `mayapy mx_run.py ...`: Maya is not initialized yet, so the variables still
    # reach it; setting them this late inside an already running Maya would not [verify]
    os.environ.update(child_environment(usersetup=o["usersetup"], maya_log=o["maya_log"]))
    rec = run(o["job"], o["args"], scene=o["scene"], plugins=o["plugins"],
              require_plugins=o["require_plugins"], script_nodes=o["script_nodes"],
              save_as=o["save_as"], json_path=o["json"])
    code = 0 if rec.get("ok") else (3 if rec.get("init_failed") else 1)
    shutdown()
    if not o["soft_exit"]:
        # [added] hard exit keeps the exit code even if Maya's own teardown misbehaves
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(code)
    return code


if __name__ == "__main__":
    sys.exit(main())
