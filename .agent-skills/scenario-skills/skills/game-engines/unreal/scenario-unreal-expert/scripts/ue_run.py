"""
ue_run: run one Python job inside Unreal Engine (headless commandlet, one-shot editor, or a
ticking editor for latent work) and return one machine-readable result. The shared entry
point for every scenario-unreal-* skill; also the commandlet and UAT runner.

STATUS: not yet run in Unreal. Written 2026-09-24 before UE 5.8 was installed. The protocol,
command builders, log scanning and JSON conversion ran offline against a fake UnrealEditor-Cmd
(tests/code/unreal-expert/test_ue_run_offline.py); the v0.2 pass rule, strict mode, registry
wait, -ScriptErrorsAreFatal and write-lock check in test_ue_run_protocol_offline.py. Flags
marked [verify] are on the checklist in references/ue-5.8-traps.md. What each function wraps
in engine terms: references/toolkit-map.md.

Modes (parent side, system python3):
  run_python(uproject, script, args=None, map=None, timeout=1800, mode="commandlet",
             strict=False, lock_check="warn", script_errors_fatal=True)
  CLI: python3 ue_run.py --project <uproject or folder> [--mode M] [--map /Game/..]
       [--strict] [--lock-check warn|refuse|off] [--dry-run] <job.py> [-- job args]
       exit code 0 only when the job passed (1 failed, 4 timed out, 2 usage)
    commandlet  UnrealEditor-Cmd <uproject> -run=pythonscript -script=<boot.py>
                fast, no UI, NO LEVEL LOADED (map= is loaded by the boot with
                LevelEditorSubsystem.load_level), no rendering unless render=True
                (-AllowCommandletRendering), fewer modules than the full editor.
    editor      UnrealEditor <uproject> [map] -ExecutePythonScript=<boot.py>
                full editor, startup level loaded, shuts down right after the script,
                so no editor tick happens during the job (no screenshots).
    latent      UnrealEditor <uproject> [map] -EnablePython -ExecCmds="py <boot.py>"
                the boot waits for warm-up ticks, then drives the job on a ticker; a job
                whose main() is a generator gets one editor tick per `yield` (`yield 2.0`
                waits about 2 s). Needed for screenshots and renders without a running
                editor. The boot quits the editor when the job ends. [verify] -ExecCmds py
                timing and quit_editor on 5.8; Epic discourages -ExecCmds py for work that
                must run at startup, which is why the boot defers everything to the ticker.
  run_commandlet(uproject, name, args=(), timeout=3600)   e.g. "DataValidation",
                "ResavePackages", "WorldPartitionBuilderCommandlet", "cook"
  run_uat(args, timeout=...) and build_buildcookrun(...)   RunUAT.sh BuildCookRun
  launch_editor(uproject, map=None, mcp_port=8000) / stop_editor(handle)

Job protocol (inside Unreal):
  The job file runs with runpy under the name "__ue_job__". If it defines main(args),
  main(args) is called and its return value is the result; otherwise the value given to
  ue_run.result(obj), else the job's global `result`. ue_run.args() returns the args.
  Before the job, the boot waits for the Asset Registry scan
  (AssetRegistryHelpers.get_asset_registry().wait_for_completion(), the pattern of the 5.8
  batch-processor example), then loads map= in commandlet mode (LevelEditorSubsystem.
  load_level). The boot writes the envelope to <job_dir>/result.json and prints it as the
  job's LAST line:  UE_RESULT {"ok": ..., "job_id": ..., "result": ..., "error": ..., ...}
  In the log that line carries a prefix such as "[2026.09.24-10.00.00:000][  0]LogPython: ";
  parse_ue_result() finds the tag anywhere in the line.

Pass rule (v0.2): a job passes ONLY on the boot's envelope that carries this job's id
(result.json, else its UE_RESULT line), never on the process exit code. UE_RESULT lines a
job prints itself, or lines from another run, are counted as foreign_results and ignored,
so a job that printed an early "ok" and then crashed the engine is a failure. Exit code,
Fatal lines and LogPython errors after an ok envelope become `warnings`; strict=True turns
them into a failure (CI). Mode "editor" adds -ScriptErrorsAreFatal (5.5 release notes: a
failing -ExecutePythonScript then fails the process, as the commandlet already does).

Jobs are staged in a folder without spaces ($UE_JOB_DIR, else <tmp>/ue_expert_jobs/<id>/)
because -script= and -ExecCmds values are split on spaces [added]; the job file itself may
live anywhere. Never point a commandlet that SAVES assets at a project an open editor has
loaded: the editor keeps a write lock on loaded assets (Jamie Dale, 0guOMTiwmhk [01:17:18]).
run_python and run_commandlet look for UnrealEditor processes with this project on their
command line (`ps -axo pid=,command=`): lock_check="warn" (default) reports them in
`editor_open` and `warnings`, "refuse" returns ok False without starting Unreal (use it for
jobs that save), "off" skips the check. Whether an editor opened from the Launcher shows
the .uproject in its command line is [verify].

Parent return value: the envelope plus exit_code, seconds, timed_out, command, job_dir,
job_id, reported_by ("result.json", "UE_RESULT line" or None), foreign_results, warnings,
log_path, log (scan_log summary: errors, warnings, python_errors, fatal, summary line),
log_tail. ok is True only if this job's boot reported ok and the run did not time out.
"""

__version__ = "0.1"  # Unreal Engine Expert Skills v0.1 (2026-09-24); refactor pass: job-bound UE_RESULT,
#                      registry wait recorded, -ScriptErrorsAreFatal, write-lock check, strict

import inspect
import json
import math
import os
import re
import runpy
import signal
import subprocess
import sys
import tempfile
import threading
import time
import traceback
import uuid

RESULT_TAG = "UE_RESULT "
_HERE = os.path.dirname(os.path.abspath(__file__))
_UNSET = object()
_STATE = {"result": _UNSET, "args": None, "spec": None}
MAX_STDOUT_RESULT = 60000  # bytes of JSON printed on the UE_RESULT line; the file has all

BOOT_TEMPLATE = """# generated by ue_run.py: boot for one job, do not edit
import json, os, sys
_SPEC = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "job.json"),
                       encoding="utf-8"))
if _SPEC["scripts_dir"] not in sys.path:
    sys.path.insert(0, _SPEC["scripts_dir"])
import ue_run
ue_run._boot(_SPEC)
"""


# =========================================================================== pure helpers
def to_jsonable(obj, _depth=0):
    """Convert a job's return value to JSON-safe data.

    Handles plain Python, unreal.Array / Map / Set (iterables), structs with to_tuple()
    or x/y/z(/w) fields, enums (name), UObjects (get_path_name()), NaN and infinity
    (as strings). Anything else becomes str(obj). Depth is capped at 12."""
    if _depth > 12:
        return str(obj)
    if obj is None or isinstance(obj, (bool, str)):
        return obj
    if isinstance(obj, int):
        return obj
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else str(obj)
    if isinstance(obj, dict):
        return {str(k): to_jsonable(v, _depth + 1) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set, frozenset)):
        return [to_jsonable(v, _depth + 1) for v in obj]
    fn = getattr(obj, "get_path_name", None)
    if callable(fn):
        try:
            return fn()
        except Exception:
            pass
    fn = getattr(obj, "to_tuple", None)
    if callable(fn):
        try:
            return [to_jsonable(v, _depth + 1) for v in fn()]
        except Exception:
            pass
    fields = [f for f in ("x", "y", "z", "w") if isinstance(getattr(obj, f, None), (int, float))]
    if len(fields) >= 2:
        return {f: to_jsonable(getattr(obj, f), _depth + 1) for f in fields}
    rgba = [f for f in ("r", "g", "b", "a") if isinstance(getattr(obj, f, None), (int, float))]
    if len(rgba) >= 3:
        return {f: to_jsonable(getattr(obj, f), _depth + 1) for f in rgba}
    if hasattr(obj, "name") and hasattr(obj, "value") and isinstance(getattr(obj, "name"), str):
        return obj.name
    if hasattr(obj, "__iter__") and not isinstance(obj, (bytes, bytearray)):
        try:
            return [to_jsonable(v, _depth + 1) for v in obj]
        except Exception:
            pass
    return str(obj)


def all_ue_results(text):
    """Every parseable 'UE_RESULT {json}' dict in text, in log order."""
    out = []
    for line in (text or "").splitlines():
        i = line.find(RESULT_TAG)
        if i < 0:
            continue
        try:
            val = json.loads(line[i + len(RESULT_TAG):].strip())
        except ValueError:
            continue
        if isinstance(val, dict):
            out.append(val)
    return out


def parse_ue_result(text, job_id=None):
    """Return the dict of the LAST parseable 'UE_RESULT {json}' in text, or None.

    The tag may sit after a log prefix ('...LogPython: UE_RESULT {...}'). With job_id, only
    a line whose "job_id" equals it counts: that is the boot's envelope for this job, not a
    line the job printed itself."""
    for val in reversed(all_ue_results(text)):
        if job_id is None or val.get("job_id") == job_id:
            return val
    return None


_LOG_RE = re.compile(r"(?:^|\])\s*(Log[A-Za-z0-9_]+):\s*(?:(Fatal|Error|Warning|Display|Log|"
                     r"Verbose|VeryVerbose):\s*)?(.*)$")
_SUMMARY_RE = re.compile(r"\b(Success|Failure)\s*-\s*(\d+)\s+error\(s\),\s*(\d+)\s+warning\(s\)")


def scan_log(text, keep=50):
    """Summarize an Unreal log: error lines, warning count, LogPython errors, fatal flag and
    the commandlet summary ('Success - 0 error(s), 3 warning(s)' [verify wording on 5.8]).

    Lines follow '[stamp][frame]LogCategory: Severity: message'; Display and plain lines
    have no severity word."""
    errors, python_errors, warnings, fatal, categories = [], [], 0, False, {}
    summary = None
    for line in (text or "").splitlines():
        m = _LOG_RE.search(line)
        if m:
            cat, sev, msg = m.group(1), m.group(2), m.group(3)
            if sev in ("Error", "Fatal"):
                categories[cat] = categories.get(cat, 0) + 1
                if len(errors) < keep:
                    errors.append(line.strip())
                if cat == "LogPython" and len(python_errors) < keep:
                    python_errors.append(msg)
                if sev == "Fatal":
                    fatal = True
            elif sev == "Warning":
                warnings += 1
        if "Fatal error" in line or "Assertion failed" in line:
            fatal = True
        s = _SUMMARY_RE.search(line)
        if s:
            summary = {"status": s.group(1), "errors": int(s.group(2)), "warnings": int(s.group(3))}
    return {"errors": errors, "error_count": sum(categories.values()),
            "error_categories": categories, "warnings": warnings,
            "python_errors": python_errors, "fatal": fatal, "summary": summary}


def job_dir_root():
    """Folder for staged jobs: $UE_JOB_DIR, else <tmp>/ue_expert_jobs, never with spaces."""
    root = os.environ.get("UE_JOB_DIR") or os.path.join(tempfile.gettempdir(), "ue_expert_jobs")
    if " " in root:
        root = "/tmp/ue_expert_jobs"
    return root


def stage_job(script, args=None, map=None, mode="commandlet", wait_registry=True,
              warmup_ticks=60, latent_timeout=1800.0, quit_editor=True, job_dir=None):
    """Write boot.py and job.json for one job and return the job folder.

    `script` is a path to a .py file, or Python source (anything with a newline that is
    not an existing file), which is written as job_inline.py. Pure file work: tested
    offline."""
    root = job_dir or job_dir_root()
    jid = time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:8]
    d = os.path.join(root, jid)
    os.makedirs(d, exist_ok=True)
    if os.path.isfile(script):
        job = os.path.abspath(script)
    elif "\n" in script or not script.endswith(".py"):
        job = os.path.join(d, "job_inline.py")
        with open(job, "w", encoding="utf-8") as f:
            f.write(script)
    else:
        raise FileNotFoundError("job script not found: %s" % script)
    spec = {
        "job_id": jid, "job": job, "args": args if args is not None else [], "map": map,
        "mode": mode,
        "scripts_dir": _HERE, "result_path": os.path.join(d, "result.json"),
        "wait_registry": bool(wait_registry), "warmup_ticks": int(warmup_ticks),
        "latent_timeout": float(latent_timeout), "quit_editor": bool(quit_editor),
        "created": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    with open(os.path.join(d, "job.json"), "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=2)
    with open(os.path.join(d, "boot.py"), "w", encoding="utf-8") as f:
        f.write(BOOT_TEMPLATE)
    return d


COMMON_FLAGS = ("-unattended", "-nosplash", "-stdout", "-FullStdOutLogOutput")


def build_python_command(engine, uproject, boot_path, map=None, mode="commandlet",
                         render=False, extra=(), log_path=None, script_errors_fatal=True):
    """argv list for one Python job (no shell). Pure: tested offline.

    The .uproject path may contain spaces (separate argv element; UE's Mac launcher
    quotes such arguments when it rebuilds the command line [verify]); the boot path must
    not, which stage_job guarantees. Mode "editor" adds -ScriptErrorsAreFatal unless
    script_errors_fatal=False (5.5 release notes: -ExecutePythonScript failures are logged
    as errors "to match the commandlet behavior" and the flag makes them fatal)."""
    if " " in boot_path:
        raise ValueError("boot path must not contain spaces: %s" % boot_path)
    if mode == "commandlet":
        cmd = [engine["editor_cmd"], uproject, "-run=pythonscript", "-script=" + boot_path]
        if render:
            cmd.append("-AllowCommandletRendering")
    elif mode == "editor":
        cmd = [engine["editor"], uproject] + ([map] if map else [])
        cmd.append("-ExecutePythonScript=" + boot_path)
        if script_errors_fatal:
            cmd.append("-ScriptErrorsAreFatal")
    elif mode == "latent":
        cmd = [engine["editor"], uproject] + ([map] if map else [])
        cmd += ["-EnablePython", "-ExecCmds=py " + boot_path]
    else:
        raise ValueError("mode must be commandlet, editor or latent: %r" % mode)
    cmd += list(COMMON_FLAGS)
    if log_path:
        cmd.append("-abslog=" + log_path)  # [verify] flag name on 5.8 Mac
    cmd += list(extra)
    return cmd


def build_commandlet_command(engine, uproject, name, args=(), log_path=None, extra=()):
    """argv for `UnrealEditor-Cmd <uproject> -run=<name> <args>`. Pure: tested offline."""
    cmd = [engine["editor_cmd"], uproject, "-run=" + name] + list(args) + list(COMMON_FLAGS)
    if log_path:
        cmd.append("-abslog=" + log_path)
    return cmd + list(extra)


def build_buildcookrun(uat, uproject, platform="Mac", config="Development", archive_dir=None,
                       build=True, cook=True, stage=True, package=True, iostore=True,
                       cook_validation=True, extra=()):
    """argv for RunUAT.sh BuildCookRun. Pure: tested offline.

    Flags -project -platform -clientconfig -build -cook -stage -pak -package -archive come
    from the batch sources; -iostore, -archivedirectory, -additionalcookeroptions,
    -unattended, -utf8output are [added] [verify]. Cook-time validation
    (-RunAssetValidation -RunMapValidation -ValidationErrorsAreFatal, 5.4) is on by default:
    without the last flag errors are downgraded to warnings. Cook platform on Mac is
    'Mac' (MacNoEditor and WindowsNoEditor are UE4 names). Profile in Development or Test,
    never Shipping."""
    cmd = [uat, "BuildCookRun", "-project=" + uproject, "-platform=" + platform,
           "-clientconfig=" + config, "-unattended", "-utf8output"]
    if build:
        cmd.append("-build")
    if cook:
        cmd.append("-cook")
    if stage:
        cmd.append("-stage")
    if package:
        cmd += ["-pak", "-package"]
    if iostore:
        cmd.append("-iostore")
    if archive_dir:
        cmd += ["-archive", "-archivedirectory=" + archive_dir]
    if cook_validation and cook:
        cmd.append("-additionalcookeroptions=-RunAssetValidation -RunMapValidation "
                   "-ValidationErrorsAreFatal")
    return cmd + list(extra)


_EDITOR_RE = re.compile(r"UnrealEditor(?:-Cmd)?(?:\.exe)?(?=\s|$|\")", re.I)
LOCK_MESSAGE = ("an Unreal Editor process has this project open (pid %s): it keeps a write "
                "lock on the assets it loaded, so a second process may fail to save them "
                "(Jamie Dale, 0guOMTiwmhk [01:17:18]); run the job inside that editor (MCP or "
                "ue_remote.PythonRemote), close it, or run read-only")


def parse_ps(text, uproject):
    """Rows of `ps -axo pid=,command=` output that run UnrealEditor or UnrealEditor-Cmd on
    this project (its absolute .uproject path, or the .uproject file name). Pure: tested
    offline. Returns [{"pid", "command", "commandlet"}]."""
    target = os.path.abspath(uproject) if uproject else None
    name = os.path.basename(uproject) if uproject else None
    rows = []
    for line in (text or "").splitlines():
        m = re.match(r"\s*(\d+)\s+(.*)$", line)
        if not m:
            continue
        pid, cmd = int(m.group(1)), m.group(2)
        if not _EDITOR_RE.search(cmd):
            continue
        if target and target not in cmd and not (name and name in cmd):
            continue
        rows.append({"pid": pid, "command": cmd[:300], "commandlet": "-run=" in cmd.lower()})
    return rows


def _ps_text():
    """Process list with full command lines (macOS and Linux). Tests replace this."""
    try:
        return subprocess.run(["ps", "-axo", "pid=,command="], capture_output=True, text=True,
                              timeout=10).stdout
    except (OSError, subprocess.SubprocessError):
        return ""


def editor_processes(uproject):
    """Unreal Editor processes (GUI or commandlet) that have this project open, excluding
    this Python process. A running editor holds a write lock on what it loaded."""
    return [r for r in parse_ps(_ps_text(), uproject) if r["pid"] != os.getpid()]


def _lock_guard(uproject, lock_check):
    """(editors, warnings) for lock_check in "warn", "refuse", "off" (or None/False)."""
    if lock_check in (None, False, "off"):
        return [], []
    if lock_check not in ("warn", "refuse"):
        raise ValueError("lock_check must be 'warn', 'refuse' or 'off': %r" % (lock_check,))
    editors = editor_processes(uproject)
    if not editors:
        return [], []
    return editors, [LOCK_MESSAGE % ", ".join(str(e["pid"]) for e in editors)]


# =========================================================================== process layer
def _find_engine(engine):
    if engine:
        return engine
    import ue_env  # same folder
    eng = ue_env.find_engine()
    if not eng:
        raise RuntimeError("Unreal Engine not found: set UE_ROOT to the engine root "
                           "(the folder that holds Engine/)")
    return eng


def _spawn(cmd, log_file, timeout, env=None, echo=False, until_file=None, grace=60.0):
    """Run cmd in its own process group, tee output to log_file, enforce timeout.

    If until_file is given (latent mode), the run also ends `grace` seconds after that
    file appears (the editor should quit by itself; if not, the group we spawned is
    terminated). Returns (exit_code, seconds, timed_out)."""
    t0 = time.time()
    with open(log_file, "w", encoding="utf-8", errors="replace") as fh:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                env=env, start_new_session=True)

        def pump():
            for raw in iter(proc.stdout.readline, b""):
                line = raw.decode("utf-8", "replace")
                fh.write(line)
                if echo:
                    sys.stdout.write(line)
            fh.flush()

        th = threading.Thread(target=pump, daemon=True)
        th.start()
        timed_out, seen_at = False, None
        try:
            while proc.poll() is None:
                now = time.time()
                if timeout and now - t0 > timeout:
                    timed_out = True
                    break
                if until_file and os.path.isfile(until_file):
                    seen_at = seen_at or now
                    if now - seen_at > grace:
                        break
                time.sleep(0.2)
        finally:
            # Also on Ctrl-C: the editor's own session never sees it, and once fh closes
            # nothing drains its pipe, so a caller that survives would leave it blocked.
            if proc.poll() is None:
                _terminate_group(proc)
            th.join(timeout=10)
        return proc.returncode, round(time.time() - t0, 2), timed_out


def _terminate_group(proc, wait=20.0):
    """SIGTERM the process group this module spawned, SIGKILL only after `wait` seconds.
    Never used on a process we did not start."""
    try:
        pgid = os.getpgid(proc.pid)
    except OSError:
        return
    for sig, delay in ((signal.SIGTERM, wait), (signal.SIGKILL, 5.0)):
        try:
            os.killpg(pgid, sig)
        except OSError:
            return
        t = time.time()
        while proc.poll() is None and time.time() - t < delay:
            time.sleep(0.2)
        if proc.poll() is not None:
            return


def _read(path):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def _collect(job_dir, log_path, exit_code, seconds, timed_out, cmd, job_id=None, mode=None,
             strict=False, pre_warnings=None):
    """Build the parent's return value. The job passes only on the boot's envelope for
    job_id (result.json first, else its UE_RESULT line); the exit code never passes a job."""
    rec, reported_by = None, None
    rp = os.path.join(job_dir, "result.json")
    if os.path.isfile(rp):
        try:
            with open(rp, "r", encoding="utf-8") as f:
                data = json.load(f)
        except ValueError:
            data = None
        if isinstance(data, dict) and (job_id is None or data.get("job_id") == job_id):
            rec, reported_by = data, "result.json"
    text = _read(log_path)
    if len(text) < 200 and os.path.isfile(os.path.join(job_dir, "stdout.log")):
        text = _read(os.path.join(job_dir, "stdout.log"))
    if rec is None:
        rec = parse_ue_result(text, job_id=job_id)
        reported_by = "UE_RESULT line" if rec is not None else None
    foreign = 0
    if job_id is not None:
        foreign = sum(1 for v in all_ue_results(text) if v.get("job_id") != job_id)
    if rec is None:
        err = ("no UE_RESULT from this job's boot: the engine exited before the job reported "
               "(read log_tail)")
        if foreign:
            err += ("; %d UE_RESULT line(s) without this job's id were ignored (printed by the "
                    "job itself, or left from another run)" % foreign)
        rec = {"ok": False, "result": None, "error": err}
    out = dict(rec)
    log = scan_log(text)
    warnings = list(pre_warnings or [])
    ok = bool(rec.get("ok")) and not timed_out and reported_by is not None
    problems = []
    if ok:
        if log["fatal"]:
            problems.append("the engine logged a Fatal line after the job reported ok: check "
                            "that its saves landed")
        if mode != "latent" and exit_code not in (0, None):
            problems.append("exit code %s after an ok envelope" % exit_code)
        if log["python_errors"]:
            problems.append("%d LogPython error line(s) while the job reported ok"
                            % len(log["python_errors"]))
    warnings += problems
    if strict and problems:
        ok = False
        out["error"] = "strict: " + "; ".join(problems)
    out["ok"] = ok
    if timed_out:
        out["error"] = "timeout after %ss; process group terminated" % seconds
    out.update(exit_code=exit_code, seconds=seconds, timed_out=timed_out, command=cmd,
               job_dir=job_dir, job_id=job_id, reported_by=reported_by,
               foreign_results=foreign, warnings=warnings, strict=bool(strict),
               log_path=log_path, log=log, log_tail=text.splitlines()[-40:])
    return out


def run_python(uproject, script, args=None, map=None, timeout=1800, mode="commandlet",
               engine=None, render=False, extra=(), wait_registry=True, env=None,
               echo=False, warmup_ticks=60, job_dir=None, dry_run=False, strict=False,
               lock_check="warn", script_errors_fatal=True):
    """Run a Python job in Unreal and return the result envelope (see module doc).

    Headless by default (mode="commandlet"). Use mode="latent" for jobs that need editor
    ticks (screenshots, renders); mode="editor" for a full-editor job without ticks.
    dry_run=True returns {"command": [...], "job_dir": ..., "job_id": ...} without starting
    Unreal. strict=True also fails on a Fatal line, a non-zero exit code (not latent) or
    LogPython errors after an ok envelope. lock_check: "warn" (default), "refuse" (jobs
    that save), "off"; see the module doc. script_errors_fatal: -ScriptErrorsAreFatal in
    mode "editor"."""
    eng = engine if dry_run and engine else _find_engine(engine)
    editors, pre = ([], []) if dry_run else _lock_guard(uproject, lock_check)
    if editors and lock_check == "refuse":
        return {"ok": False, "result": None, "error": "refused: " + pre[0],
                "editor_open": editors, "warnings": pre, "exit_code": None,
                "timed_out": False, "reported_by": None, "command": None, "job_dir": None}
    d = stage_job(script, args=args, map=map, mode=mode, wait_registry=wait_registry,
                  warmup_ticks=warmup_ticks, latent_timeout=float(timeout or 1800),
                  job_dir=job_dir)
    job_id = os.path.basename(d)
    log_path = os.path.join(d, "ue.log")
    cmd = build_python_command(eng, uproject, os.path.join(d, "boot.py"), map=map, mode=mode,
                               render=render, extra=extra, log_path=log_path,
                               script_errors_fatal=script_errors_fatal)
    if dry_run:
        return {"ok": True, "dry_run": True, "command": cmd, "job_dir": d, "job_id": job_id}
    until = os.path.join(d, "result.json") if mode == "latent" else None
    code, secs, to = _spawn(cmd, os.path.join(d, "stdout.log"), timeout,
                            env=dict(os.environ, **(env or {})), echo=echo, until_file=until)
    out = _collect(d, log_path, code, secs, to, cmd, job_id=job_id, mode=mode, strict=strict,
                   pre_warnings=pre)
    if editors:
        out["editor_open"] = editors
    return out


def run_commandlet(uproject, name, args=(), timeout=3600, engine=None, extra=(), env=None,
                   echo=False, job_dir=None, dry_run=False, lock_check="warn"):
    """Run `-run=<name>` headless. ok = exit code 0, no fatal line, summary not Failure.

    Examples (flags from the batch sources, [verify] on 5.8 Mac):
      run_commandlet(p, "DataValidation")                  C++ rules; Python validators
                                                           only if registered at startup
      run_commandlet(p, "ResavePackages", ["-fixupredirects", "-autocheckout",
                                           "-projectonly"], lock_check="refuse")
                     (-autocheckout under Perforce: read-only files cannot be resaved)
      run_commandlet(p, "WorldPartitionBuilderCommandlet",
                     ["/Game/Maps/L_World", "-Builder=WorldPartitionHLODsBuilder",
                      "-AllowCommandletRendering"])
    lock_check as in run_python: commandlets that save should pass "refuse"."""
    eng = engine if dry_run and engine else _find_engine(engine)
    editors, pre = ([], []) if dry_run else _lock_guard(uproject, lock_check)
    if editors and lock_check == "refuse":
        return {"ok": False, "error": "refused: " + pre[0], "editor_open": editors,
                "warnings": pre, "exit_code": None, "timed_out": False, "command": None,
                "job_dir": None}
    root = job_dir or job_dir_root()
    d = os.path.join(root, time.strftime("%Y%m%d-%H%M%S-") + name + "-" + uuid.uuid4().hex[:6])
    os.makedirs(d, exist_ok=True)
    log_path = os.path.join(d, "ue.log")
    cmd = build_commandlet_command(eng, uproject, name, args, log_path=log_path, extra=extra)
    if dry_run:
        return {"ok": True, "dry_run": True, "command": cmd, "job_dir": d}
    code, secs, to = _spawn(cmd, os.path.join(d, "stdout.log"), timeout,
                            env=dict(os.environ, **(env or {})), echo=echo)
    text = _read(log_path) or _read(os.path.join(d, "stdout.log"))
    log = scan_log(text)
    ok = code == 0 and not to and not log["fatal"] and not (
        log["summary"] and log["summary"]["status"] == "Failure")
    out = {"ok": ok, "exit_code": code, "seconds": secs, "timed_out": to, "command": cmd,
           "job_dir": d, "log_path": log_path, "log": log, "warnings": pre,
           "log_tail": text.splitlines()[-40:]}
    if editors:
        out["editor_open"] = editors
    return out


def run_uat(args, timeout=7200, engine=None, env=None, echo=False, job_dir=None):
    """Run RunUAT.sh with args (for example build_buildcookrun(...)[1:])."""
    eng = _find_engine(engine)
    root = job_dir or job_dir_root()
    d = os.path.join(root, time.strftime("%Y%m%d-%H%M%S-uat-") + uuid.uuid4().hex[:6])
    os.makedirs(d, exist_ok=True)
    cmd = [eng["uat"]] + list(args)
    code, secs, to = _spawn(cmd, os.path.join(d, "stdout.log"), timeout,
                            env=dict(os.environ, **(env or {})), echo=echo)
    text = _read(os.path.join(d, "stdout.log"))
    return {"ok": code == 0 and not to, "exit_code": code, "seconds": secs, "timed_out": to,
            "command": cmd, "job_dir": d, "log": scan_log(text),
            "log_tail": text.splitlines()[-60:]}


def launch_editor(uproject, map=None, mcp_port=None, engine=None, extra=(), log_path=None):
    """Start a GUI editor this process owns (for MCP, Remote Control or PythonRemote).

    mcp_port adds -ModelContextProtocolStartServer -ModelContextProtocolPort=N (Unreal MCP
    doc), so no preference toggle is needed; the Unreal MCP and toolset plugins must be
    enabled in the .uproject (ue_env.enable_plugins). Returns a handle for stop_editor.
    Do not launch a second editor on a project that is already open."""
    eng = _find_engine(engine)
    cmd = [eng["editor"], uproject] + ([map] if map else [])
    if mcp_port:
        cmd += ["-ModelContextProtocolStartServer", "-ModelContextProtocolPort=%d" % int(mcp_port)]
    if log_path:
        cmd.append("-abslog=" + log_path)
    cmd += list(extra)
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            start_new_session=True)
    return {"pid": proc.pid, "command": cmd, "process": proc, "log_path": log_path,
            "started": time.time()}


def stop_editor(handle, timeout=60.0):
    """Stop an editor started by launch_editor: SIGTERM to its group (UE requests a normal
    exit on SIGTERM [verify]), SIGKILL only after `timeout`. Prefer quitting from inside
    first (PythonRemote: unreal.SystemLibrary.quit_editor()). Unsaved work is the caller's
    responsibility: save before stopping."""
    proc = handle.get("process")
    if proc is None or proc.poll() is not None:
        return {"stopped": True, "already_exited": True}
    _terminate_group(proc, wait=timeout)
    return {"stopped": proc.poll() is not None, "exit_code": proc.returncode}


# =========================================================================== job side
def result(obj):
    """Set the job's result (last call wins). The boot prints it as the UE_RESULT line.

    Outside a boot (a job run by hand in the editor), prints the line right away so the
    output still parses. Returns obj."""
    _STATE["result"] = obj
    if _STATE["spec"] is None:
        print(RESULT_TAG + json.dumps({"ok": True, "result": to_jsonable(obj)}))
    return obj


def args():
    """The job's args (any JSON value given to run_python)."""
    return _STATE["args"]


def in_commandlet():
    """True inside a -run= commandlet (no viewport, no rendering by default) [verify]."""
    try:
        import unreal
        cl = unreal.SystemLibrary.get_command_line()
    except Exception:
        cl = " ".join(sys.argv)
    return "-run=" in cl.lower() or "-run " in cl.lower()


def _run_job(spec):
    _STATE["result"] = _UNSET
    _STATE["args"] = spec.get("args")
    a = spec.get("args")
    old_argv = sys.argv
    sys.argv = [spec["job"]] + ([str(x) for x in a] if isinstance(a, list) else [])
    try:
        g = runpy.run_path(spec["job"], init_globals={"UE_ARGS": a}, run_name="__ue_job__")
        value = _UNSET
        if callable(g.get("main")):
            value = g["main"](a)
        if (value is _UNSET or value is None) and _STATE["result"] is not _UNSET:
            value = _STATE["result"]
        if value is _UNSET:
            value = g.get("result")
        return value
    finally:
        sys.argv = old_argv


def _emit(rec, spec):
    rp = spec.get("result_path")
    if rp:
        tmp = rp + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(rec, f, indent=2)
        os.replace(tmp, rp)
    line = json.dumps(rec)
    if len(line) > MAX_STDOUT_RESULT:
        line = json.dumps({"ok": rec.get("ok"), "job_id": rec.get("job_id"),
                           "error": rec.get("error"), "result_file": rp, "truncated": True})
    print(RESULT_TAG + line)


def _envelope(spec):
    rec = {"ok": False, "job_id": spec.get("job_id"), "result": None, "mode": spec.get("mode"),
           "job": spec.get("job"), "python": sys.version.split()[0]}
    try:
        import unreal
        rec["engine_version"] = unreal.SystemLibrary.get_engine_version()
    except Exception:
        pass
    return rec


def wait_for_registry():
    """In Unreal: block until the Asset Registry has finished scanning, before any registry
    query. Headless commandlets start while the scan is still running, so queries can
    silently miss assets; the 5.8 batch-processor example calls
    AssetRegistryHelpers.get_asset_registry().wait_for_completion() before get_assets.
    Falls back to search_all_assets(True) (synchronous scan) [added, verify]. The boot calls
    this before every job; call it yourself in code sent to a just-launched editor through
    MCP or PythonRemote. Returns {"method", "seconds"}."""
    import unreal
    t0 = time.time()
    reg = unreal.AssetRegistryHelpers.get_asset_registry()
    if hasattr(reg, "wait_for_completion"):
        reg.wait_for_completion()
        method = "AssetRegistry.wait_for_completion()"
    elif hasattr(reg, "search_all_assets"):
        reg.search_all_assets(True)
        method = "AssetRegistry.search_all_assets(True)"
    else:
        raise RuntimeError("the Asset Registry exposes neither wait_for_completion nor "
                           "search_all_assets on this build: registry queries may be incomplete")
    return {"method": method, "seconds": round(time.time() - t0, 3)}


def _prepare(spec, rec):
    import unreal
    if spec.get("wait_registry", True):
        rec["registry_wait"] = wait_for_registry()
    if spec.get("map") and spec.get("mode") == "commandlet":
        les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
        rec["map_loaded"] = bool(les.load_level(spec["map"]))
        if not rec["map_loaded"]:
            raise RuntimeError("load_level failed for %s" % spec["map"])


def _boot(spec):
    """Entry point of boot.py inside Unreal (all modes)."""
    _STATE["spec"] = spec
    if spec.get("mode") == "latent":
        return _boot_latent(spec)
    t0 = time.time()
    rec = _envelope(spec)
    try:
        _prepare(spec, rec)
        value = _run_job(spec)
        if inspect.isgenerator(value):
            raise RuntimeError("this job yields (latent); run it with mode='latent'")
        rec["result"] = to_jsonable(value)
        rec["ok"] = True
    except BaseException as e:  # SystemExit from a job is reported, not propagated
        rec["error"] = "%s: %s" % (type(e).__name__, e)
        rec["traceback"] = traceback.format_exc()
    rec["seconds"] = round(time.time() - t0, 3)
    _emit(rec, spec)


def _quit_editor():
    import unreal
    try:
        unreal.SystemLibrary.quit_editor()  # [verify]
    except Exception:
        unreal.SystemLibrary.execute_console_command(None, "QUIT_EDITOR")


def _boot_latent(spec):
    """Ticker-driven job: warm-up ticks, then main(); a generator gets one tick per yield
    (a number yielded = seconds to wait). Writes the result, then quits the editor."""
    import unreal
    st = {"phase": "warmup", "ticks": 0, "gen": None, "t0": time.time(), "wake": 0.0}
    rec = _envelope(spec)

    def finish(value=None, exc=None):
        st["phase"] = "done"
        if exc is None:
            rec["result"] = to_jsonable(value)
            rec["ok"] = True
        else:
            rec["error"] = "%s: %s" % (type(exc).__name__, exc)
            rec["traceback"] = "".join(traceback.format_exception(type(exc), exc,
                                                                  exc.__traceback__))
        rec["seconds"] = round(time.time() - st["t0"], 3)
        rec["ticks"] = st["ticks"]
        _emit(rec, spec)
        if spec.get("quit_editor", True):
            _quit_editor()

    def tick(dt):
        if st["phase"] == "done":
            return False
        st["ticks"] += 1
        try:
            if time.time() - st["t0"] > spec.get("latent_timeout", 1800.0):
                raise TimeoutError("latent job exceeded %ss" % spec.get("latent_timeout"))
            if st["phase"] == "warmup":
                if st["ticks"] < spec.get("warmup_ticks", 60):
                    return True
                _prepare(dict(spec, map=None), rec)
                value = _run_job(spec)
                if inspect.isgenerator(value):
                    st["gen"], st["phase"] = value, "running"
                    return True
                finish(value)
                return False
            if time.time() < st["wake"]:
                return True
            try:
                step = next(st["gen"])
            except StopIteration as stop:
                finish(stop.value if stop.value is not None else (
                    None if _STATE["result"] is _UNSET else _STATE["result"]))
                return False
            if isinstance(step, (int, float)) and step > 0:
                st["wake"] = time.time() + float(step)
            return True
        except BaseException as e:
            finish(exc=e)
            return False

    st["handle"] = unreal.register_ticker_callback(tick)


# =========================================================================== CLI
def _main(argv):
    if "--find" in argv:
        import ue_env
        eng = ue_env.find_engine()
        print(json.dumps(eng, indent=2))
        return 0 if eng else 5
    rest, job_args = argv, []
    if "--" in argv:
        i = argv.index("--")
        rest, job_args = argv[:i], argv[i + 1:]
    opts = {"--project": None, "--map": None, "--mode": "commandlet", "--timeout": "1800",
            "--commandlet": None, "--lock-check": "warn"}
    pos, i = [], 0
    while i < len(rest):
        if rest[i] in opts and i + 1 < len(rest):
            opts[rest[i]] = rest[i + 1]
            i += 2
        elif rest[i] in ("--dry-run", "--echo", "--strict"):
            opts[rest[i]] = True
            i += 1
        else:
            pos.append(rest[i])
            i += 1
    if not opts["--project"]:
        print(__doc__)
        return 2
    import ue_env
    prj = ue_env.find_project(opts["--project"])
    if not prj or "error" in prj:
        print(json.dumps({"ok": False, "error": "project not found", "project": prj}))
        return 2
    if opts["--commandlet"]:
        r = run_commandlet(prj["uproject"], opts["--commandlet"], job_args,
                           timeout=float(opts["--timeout"]), echo=bool(opts.get("--echo")),
                           dry_run=bool(opts.get("--dry-run")), lock_check=opts["--lock-check"])
    else:
        if not pos:
            print(__doc__)
            return 2
        r = run_python(prj["uproject"], pos[0], args=job_args, map=opts["--map"],
                       timeout=float(opts["--timeout"]), mode=opts["--mode"],
                       echo=bool(opts.get("--echo")), dry_run=bool(opts.get("--dry-run")),
                       strict=bool(opts.get("--strict")), lock_check=opts["--lock-check"])
    print(json.dumps(r, indent=2, default=str))
    # CI rule: the exit code of this CLI carries the job verdict (0 only when ok).
    return 0 if r.get("ok") else (4 if r.get("timed_out") else 1)


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
