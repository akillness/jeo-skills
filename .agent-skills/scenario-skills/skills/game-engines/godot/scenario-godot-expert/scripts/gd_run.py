#!/usr/bin/env python3
"""gd_run: run Godot 4.7.2 safely from an agent (headless jobs, imports, checks, tests, exports, captures).

System python3, standard library only. Every call:
- holds one of GD_MAX machine-wide slots (default 6; windowed runs also hold one of GD_MAX_WINDOWED,
  default 2) through lock files (flock; msvcrt.locking on Windows) in GD_LOCK_DIR (default
  ~/Library/Caches/godot-agentkit/locks; Windows %LOCALAPPDATA%\\godot-agentkit\\locks), so
  parallel agents never overload the machine; locks die with the process, no stale locks;
- holds a per-project lock, so two Godot processes never run on the same project;
- refuses a project that a GUI Godot (editor or game) has open (cwd or --path match), unless
  GD_ALLOW_EDITOR_OPEN=1;
- runs with stdin=/dev/null and a wall-clock timeout, and kills only the process it started;
- windowed runs (headless=False) use a tiny window (--resolution 160x90) and, on macOS, give focus
  back to the app that was frontmost (Godot activates itself on launch; verified 4.7.2 2026-10-02).

Public API (contract for the domain skills):
    run_script(project, script_path_or_method, args=None, timeout=600, headless=True, editor=False,
               out_dir=None, window=(160, 90), quit_after=None, extra_args=None, env=None) -> dict
    import_project(project, timeout=600) -> dict
    check_only(script, project=None, timeout=120) -> dict
    check_all(project, root="res://", exclude=("res://addons/",), timeout=600) -> dict
    run_tests(project, framework="gut", filter=None, dirs=("res://test",), timeout=900) -> dict
    export(project, preset, out, release=True, pack=False, timeout=1800) -> dict
    ensure_preset(project, name, platform, export_path="", options=None) -> dict
    verify_pack(pck, expect=(), load=(), timeout=300) -> dict
    capture_scene(project, scene=None, out="captures/shot.png", size=(1280, 720), camera=None,
                  frames=8, views=None, review=True, timeout=300, args=None, extra_args=None) -> dict
    capture_sequence(project, scene, out_dir="captures/seq", count=8, every=6, size=(640, 360),
                     camera=None, sheet=True, timeout=300, args=None, extra_args=None) -> dict
    profile_scene(project, scene=None, seconds=5.0, warmup=30, size=None, headless=False,
                  csv="profile/frames.csv", target_ms=16.67, timeout=600, args=None, driver=None, extra_args=None) -> dict
    audit(project, what="project", timeout=300, **kwargs) -> dict      what: project|scene|resources|scripts|imports|classdb
    running_godot() -> list[dict]
    gui_editor_pids(project) -> list[int]

run_script returns {ok, result, exit_code, timed_out, duration_s, error, parse_errors, script_errors,
shader_errors, engine_errors, warnings, leaks, log_path, cmd}. `result` is the AGENT_RESULT dict.
"""
from __future__ import annotations

__version__ = "0.1"

import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
import gd_stat  # noqa: E402

if sys.platform == "win32":
    import msvcrt

    def _lock_nb(fh) -> bool:
        fh.seek(0)
        try:
            msvcrt.locking(fh.fileno(), msvcrt.LK_NBLCK, 1)
        except PermissionError:
            return False
        return True

    def _unlock(fh) -> None:
        fh.seek(0)
        msvcrt.locking(fh.fileno(), msvcrt.LK_UNLCK, 1)
else:
    import fcntl

    def _lock_nb(fh) -> bool:
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return False
        return True

    def _unlock(fh) -> None:
        fcntl.flock(fh.fileno(), fcntl.LOCK_UN)

GD_MAX = int(os.environ.get("GD_MAX", "6"))
GD_MAX_WINDOWED = int(os.environ.get("GD_MAX_WINDOWED", "2"))
_CACHE = Path(os.environ["LOCALAPPDATA"]) if sys.platform == "win32" and os.environ.get("LOCALAPPDATA") else Path.home() / "Library" / "Caches"
LOCK_DIR = Path(os.environ.get("GD_LOCK_DIR", _CACHE / "godot-agentkit" / "locks"))
AGENTKIT_RES = "res://addons/agentkit"
LOG_KEEP = 200_000  # characters of log kept in the returned dict (full log is on disk)


class GodotBusy(RuntimeError):
    pass


def _godot() -> str:
    import gd_env
    return gd_env.find_godot()


# ---------------------------------------------------------------- processes and locks

def _godot_processes() -> list[tuple[int, str]]:
    """(pid, command line) of every process whose executable is a Godot binary."""
    if sys.platform == "win32":
        q = ("[Console]::OutputEncoding = [Text.Encoding]::UTF8; "
             "Get-CimInstance Win32_Process -Filter \"Name like 'godot%'\" "
             "| Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress")
        out = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", q],
                             capture_output=True, text=True, encoding="utf-8", timeout=60).stdout.strip()
        rows = json.loads(out) if out else []
        return [(r["ProcessId"], r["CommandLine"] or "") for r in ([rows] if isinstance(rows, dict) else rows)]
    out = subprocess.run(["ps", "-axo", "pid=,args="], capture_output=True, text=True).stdout
    procs = []
    for line in out.splitlines():
        pid_s, _, args = line.strip().partition(" ")
        exe = args.split(" -", 1)[0].strip()
        if pid_s and re.search(r"(^|/)(godot4?|Godot|Godot_v4[^/]*)$", exe):
            procs.append((int(pid_s), args))
    return procs


def _cwd(pid: int) -> str | None:
    if sys.platform == "win32":
        return None  # no lsof: on Windows only a --path argument ties a process to a project
    try:
        lo = subprocess.run(["lsof", "-a", "-p", str(pid), "-d", "cwd", "-Fn"], capture_output=True, text=True, timeout=10).stdout
        for ln in lo.splitlines():
            if ln.startswith("n"):
                return ln[1:]
    except (OSError, subprocess.SubprocessError, UnicodeError):
        pass  # best effort: no lsof, a timeout or odd output leaves cwd unknown
    return None


def running_godot() -> list[dict]:
    """Every running Godot process: pid, args, headless, editor, cwd. Read-only (ps + lsof; Windows:
    PowerShell Win32_Process, cwd None). Empty when the process table cannot be read."""
    try:
        rows = _godot_processes()
    except (OSError, subprocess.SubprocessError, ValueError):
        return []
    procs = []
    for pid, args in rows:
        if "gd_run" in args or "grep" in args:
            continue
        headless = "--headless" in args or "--display-driver headless" in args
        procs.append({"pid": pid, "args": args, "headless": headless,
                      "editor": bool(re.search(r"(\s-e(\s|$)|--editor)", args)), "cwd": _cwd(pid)})
    return procs


def _norm(path: str) -> str:
    # The project manager passes --path with forward slashes, and Windows paths ignore case.
    return path.replace("\\", "/").lower() if sys.platform == "win32" else path


def gui_editor_pids(project) -> list[int]:
    """PIDs of non-headless Godot processes (GUI editor or a running game) working on this project."""
    p = _norm(str(Path(project).resolve()))
    hits = []
    for pr in running_godot():
        if pr["headless"]:
            continue
        a = _norm(pr["args"])
        if (pr["cwd"] and _norm(str(Path(pr["cwd"]).resolve())) == p) or p in a or p.replace(" ", "%20") in a:
            hits.append(pr["pid"])
    return hits


def _flock_try(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    fh = open(path, "a+")  # noqa: SIM115 (returned: the caller holds the lock)
    try:
        if not _lock_nb(fh):
            fh.close()
            return None
        fh.seek(0)
        fh.truncate()
        fh.write(f"{os.getpid()} {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        fh.flush()
    except BaseException:
        fh.close()
        raise
    return fh


@contextmanager
def godot_slot(project=None, windowed: bool = False, wait: float = 1800.0):
    """Hold a machine-wide slot (and a per-project lock) while Godot runs. Blocks up to `wait` s."""
    held = []
    deadline = time.time() + wait
    try:
        if project is not None:
            key = hashlib.sha1(str(Path(project).resolve()).encode()).hexdigest()[:16]
            while True:
                fh = _flock_try(LOCK_DIR / f"project_{key}.lock")
                if fh:
                    held.append(fh)
                    break
                if time.time() > deadline:
                    raise GodotBusy(f"another Godot run holds project {project}")
                time.sleep(0.5)
        pools = [("slot", GD_MAX)] + ([("win", GD_MAX_WINDOWED)] if windowed else [])
        for prefix, n in pools:
            got = None
            while got is None:
                for i in range(max(1, n)):
                    got = _flock_try(LOCK_DIR / f"{prefix}_{i}.lock")
                    if got:
                        break
                if got is None:
                    if time.time() > deadline:
                        raise GodotBusy(f"all {n} {prefix} slots busy (GD_MAX)")
                    time.sleep(1.0)
            held.append(got)
        yield
    finally:
        for fh in held:
            try:
                _unlock(fh)
                fh.close()
            except Exception:
                pass


# ---------------------------------------------------------------- focus guard (macOS)

def _front_app() -> tuple[str | None, str | None]:
    """(pid, bundle path) of the frontmost app, via lsappinfo. (None, None) off macOS."""
    if sys.platform != "darwin":
        return None, None
    try:
        asn = subprocess.run(["lsappinfo", "front"], capture_output=True, text=True, timeout=5).stdout.strip()
        info = subprocess.run(["lsappinfo", "info", "-only", "pid", "-only", "bundlepath", asn],
                              capture_output=True, text=True, timeout=5).stdout
        pid = re.search(r'"pid"=(\d+)', info)
        bp = re.search(r'"LSBundlePath"="([^"]+)"', info)
        return (pid.group(1) if pid else None), (bp.group(1) if bp else None)
    except Exception:
        return None, None


class _FocusGuard(threading.Thread):
    """Give focus back when the Godot child activates itself (it does on every windowed launch)."""

    def __init__(self, child_pid: int, seconds: float = 6.0):
        super().__init__(daemon=True)
        self.child_pid = str(child_pid)
        self.seconds = seconds
        self.prev_pid, self.prev_bundle = _front_app()
        self.restores = 0
        self.stop = threading.Event()

    def run(self):
        if not self.prev_bundle or os.environ.get("GD_RESTORE_FOCUS", "1") == "0":
            return
        if self.prev_bundle.endswith("Godot.app"):
            return
        end = time.time() + self.seconds
        while time.time() < end and not self.stop.is_set() and self.restores < 6:
            pid, _ = _front_app()
            if pid == self.child_pid:
                subprocess.run(["open", "-a", self.prev_bundle], capture_output=True, timeout=10)
                self.restores += 1
            time.sleep(0.1)


# ---------------------------------------------------------------- core runner

def _res_path(project: Path, script: str) -> str:
    if script.startswith("res://") or script.startswith("uid://"):
        return script
    sp = Path(script)
    if not sp.is_absolute():
        return "res://" + script.lstrip("./")
    try:
        return "res://" + str(sp.resolve().relative_to(project)).replace(os.sep, "/")
    except ValueError:
        return str(sp)


def _ensure_out(project: Path, out_dir) -> Path:
    od = Path(out_dir) if out_dir else project / ".agent_out"
    od.mkdir(parents=True, exist_ok=True)
    if str(od.resolve()).startswith(str(project.resolve())) and not (od / ".gdignore").exists():
        (od / ".gdignore").write_text("")
    return od


def _summarise(proc_out: str, exit_code, timed_out: bool, extra: dict) -> dict:
    parsed = gd_stat.parse_godot_log(proc_out)
    r = {
        "exit_code": exit_code,
        "timed_out": timed_out,
        "parse_errors": parsed["parse_errors"],
        "script_errors": parsed["script_errors"],
        "shader_errors": parsed["shader_errors"],
        "engine_errors": parsed["engine_errors"],
        "warnings": parsed["warnings"],
        "leaks": parsed["leaks"],
        "prints": parsed["prints"][-200:],
        "result": parsed["agent_result"],
        "counts": parsed["counts"],
    }
    r.update(extra)
    return r


def _run(cmd: list[str], project: Path, timeout: float, windowed: bool, log_path: Path, env=None) -> tuple[str, int | None, bool, float, int]:
    """Run one Godot process under the slot locks. Returns (log, exit_code, timed_out, seconds, focus_restores)."""
    t0 = time.time()
    full_env = dict(os.environ)
    if env:
        full_env.update(env)
    with godot_slot(project, windowed=windowed):
        if os.environ.get("GD_ALLOW_EDITOR_OPEN") != "1":
            pids = gui_editor_pids(project)
            if pids:
                raise GodotBusy(f"a GUI Godot (pid {pids}) has {project} open: close it or set GD_ALLOW_EDITOR_OPEN=1")
        proc = subprocess.Popen(cmd, cwd=str(project), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", env=full_env)
        guard = None
        if windowed and sys.platform == "darwin":
            guard = _FocusGuard(proc.pid)
            guard.start()
        timed_out = False
        try:
            out, _ = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            proc.kill()  # only the process this call started
            out, _ = proc.communicate()
        if guard:
            guard.stop.set()
        code = proc.returncode
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(f"# {shlex.join(cmd)}\n" + (out or ""), encoding="utf-8")
    return out or "", code, timed_out, time.time() - t0, (guard.restores if guard else 0)


def run_script(project, script_path_or_method: str, args: dict | None = None, timeout: float = 600, headless: bool = True,
               editor: bool = False, out_dir=None, window=(160, 90), quit_after: int | None = None,
               extra_args: list[str] | None = None, env: dict | None = None) -> dict:
    """Run a SceneTree script (an AgentKit job) and return its AGENT_RESULT plus the log analysis.

    script_path_or_method:
      "res://tools/job.gd" or a path relative to the project: a script extending SceneTree, usually
          `extends "res://addons/agentkit/agent_job.gd"` with run() overridden;
      "res://addons/agentkit/agent_audit.gd:project" (or "agent_audit.gd:project"): a module method,
          dispatched by agent_job.gd (the method receives the job and returns a Dictionary).
    args: JSON-able dict, read in GDScript with job.arg("name", default).
    headless=False opens a tiny window (needed for any rendering: headless draws 0 frames).
    editor=True adds -e so EditorInterface works (EditorScript-like work, headless editor).
    """
    project = Path(project).resolve()
    if not (project / "project.godot").exists():
        raise FileNotFoundError(f"no project.godot in {project}")
    out = _ensure_out(project, out_dir)
    m = re.match(r"^(.*\.gd):([A-Za-z_]\w*)$", script_path_or_method)
    call = None
    if m:
        mod = m.group(1)
        if "/" not in mod:
            mod = f"{AGENTKIT_RES}/{mod}"
        call = _res_path(project, mod) + ":" + m.group(2)
        script = f"{AGENTKIT_RES}/agent_job.gd"
    else:
        script = _res_path(project, script_path_or_method)
    if script.startswith("res://addons/agentkit") and not (project / "addons" / "agentkit" / "agent_job.gd").exists():
        import gd_env
        gd_env.install_agentkit(project)
    job_id = time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    stem = (call or script).rsplit("/", 1)[-1].replace(".gd:", "_").replace(".gd", "")
    result_file = out / "results" / f"{stem}_{job_id}.json"
    log_path = out / "logs" / f"{stem}_{job_id}.log"
    cmd = [_godot()]
    if headless:
        cmd.append("--headless")
    else:
        cmd += ["--windowed", "--resolution", f"{int(window[0])}x{int(window[1])}", "--position", "40,40"]
    if editor:
        cmd.append("-e")
    cmd += ["--path", str(project), "--script", script]
    if quit_after:
        cmd += ["--quit-after", str(int(quit_after))]
    if extra_args:
        cmd += list(extra_args)
    cmd += ["--", "--agent-result", str(result_file), "--agent-out", str(out),
            "--agent-timeout", str(max(5, int(timeout) - 10)), "--agent-args", json.dumps(args or {})]
    if call:
        cmd += ["--agent-call", call]
    log, code, timed_out, secs, restores = _run(cmd, project, timeout, not headless, log_path, env)
    r = _summarise(log, code, timed_out, {"duration_s": round(secs, 2), "log_path": str(log_path), "cmd": shlex.join(cmd),
                                          "result_path": str(result_file), "focus_restores": restores})
    if result_file.exists():
        try:
            r["result"] = json.loads(result_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    res = r["result"]
    problems = []
    if timed_out:
        problems.append(f"wall timeout after {timeout} s (process killed)")
    if res is None:
        problems.append("no AGENT_RESULT line (crash, parse error in the job, or a script that never quits)")
    elif not res.get("ok", False):
        problems.append(str(res.get("error") or "job reported ok=false"))
    if r["parse_errors"]:
        e = r["parse_errors"][0]
        problems.append(f"parse error {e['file']}:{e['line']}: {e['message']}")
    # Belt and braces: a SCRIPT ERROR printed before the AGENT_RESULT line that the job did not
    # count (no Logger hit, or a job that ended through finish() early) fails the run unless the job
    # declared expect_errors. Errors printed after the result line (teardown at quit) are reported only.
    job_meta = (res or {}).get("job") or {}
    if res is not None and res.get("ok") and not job_meta.get("expect_errors") and not (res.get("captured_error_count") or 0):
        head = log.split(gd_stat.RESULT_TAG, 1)[0]
        pre = gd_stat.parse_godot_log(head)["script_errors"]
        if pre:
            problems.append(f"script error in the log before the result: {pre[0]['message']}")
    if code not in (0, None) and res is not None and res.get("ok"):
        problems.append(f"exit code {code}")
    r["ok"] = not problems
    r["error"] = "; ".join(problems)
    r["log"] = log[-LOG_KEEP:]
    return r


def import_project(project, timeout: float = 600) -> dict:
    """`godot --headless --path P --import`: imports assets, writes .uid files and the class_name cache."""
    project = Path(project).resolve()
    out = _ensure_out(project, None)
    log_path = out / "logs" / f"import_{time.strftime('%Y%m%d-%H%M%S')}_{uuid.uuid4().hex[:4]}.log"
    cmd = [_godot(), "--headless", "--path", str(project), "--import"]
    log, code, timed_out, secs, _ = _run(cmd, project, timeout, False, log_path)
    retried = None
    if not timed_out and code is not None and code < 0:
        # The first --import after adding a GDExtension or a big addon (LimboAI, Terrain3D, gdUnit4)
        # crashed with signal 11 at shutdown in several skills' runs; the second import was clean.
        retried = {"first_exit_code": code, "first_log_path": str(log_path)}
        log_path = log_path.with_name(log_path.stem + "_retry.log")
        log, code, timed_out, secs2, _ = _run(cmd, project, timeout, False, log_path)
        secs += secs2
    r = _summarise(log, code, timed_out, {"duration_s": round(secs, 2), "log_path": str(log_path), "cmd": shlex.join(cmd),
                                          "retried": retried})
    r["class_cache"] = (project / ".godot" / "global_script_class_cache.cfg").exists()
    r["ok"] = code == 0 and not timed_out and not r["parse_errors"]
    r["error"] = "" if r["ok"] else (f"exit {code}" if code else "") + (" parse errors" if r["parse_errors"] else "") + (" timeout" if timed_out else "")
    r["log"] = log[-LOG_KEEP:]
    return r


def _find_project(start: Path) -> Path | None:
    for p in [start, *start.parents]:
        if (p / "project.godot").exists():
            return p
    return None


def check_only(script, project=None, timeout: float = 120) -> dict:
    """Parse one script with `--check-only --script`. It exits 0 even on parse errors (verified 4.7.2),
    so the verdict comes from the log. Note it does not see Godot 3 member names on native-typed
    locals (ps.instance(), tween.interpolate_property()): run the code too. It also does not register
    autoloads, so a reference to one reads "Identifier not found"; those land in
    autoload_false_positives. For project code prefer check_all (one in-process run, autoloads loaded)."""
    sp = Path(script)
    # A relative OS path (tests/.../x.gd) used to become res://tests/.../x.gd, a file-not-found that
    # logged no parse error and returned ok true. Resolve it against the cwd when it exists there.
    if not str(script).startswith(("res://", "uid://")) and not sp.is_absolute() and sp.exists():
        sp = sp.resolve()
        script = str(sp)
    proj = Path(project).resolve() if project else _find_project(sp.resolve().parent if sp.is_absolute() else Path.cwd())
    if proj is None:
        raise FileNotFoundError("check_only needs the project that contains the script")
    res = _res_path(proj, str(script))
    out = _ensure_out(proj, None)
    log_path = out / "logs" / f"check_{Path(res).stem}_{uuid.uuid4().hex[:4]}.log"
    cmd = [_godot(), "--headless", "--path", str(proj), "--check-only", "--script", res]
    log, code, timed_out, secs, _ = _run(cmd, proj, timeout, False, log_path)
    r = _summarise(log, code, timed_out, {"duration_s": round(secs, 2), "log_path": str(log_path), "cmd": shlex.join(cmd), "script": res})
    # --check-only does not register autoloads: "Identifier not found: <Autoload>" is a false error
    # (verified 4.7.2, 2026-10-02). Those are moved to autoload_false_positives; check_all sees autoloads.
    try:
        import gd_env
        autoloads = {k.split("/", 1)[1] for k in gd_env.read_project(proj) if k.startswith("autoload/")}
    except Exception:
        autoloads = set()
    fp = [e for e in r["parse_errors"] + r["script_errors"] if any(e["message"].endswith("Identifier not found: " + a) for a in autoloads)]
    r["autoload_false_positives"] = fp
    r["parse_errors"] = [e for e in r["parse_errors"] if e not in fp]
    r["script_errors"] = [e for e in r["script_errors"] if e not in fp]
    # Godot exits 0 here whatever happens: a script it could not load (missing file, outside the
    # project) prints only engine errors, so those fail the check too.
    load_fail = [e for e in r["engine_errors"] if re.search(r"Can't load script|File not found|Failed loading resource", e["message"])]
    r["load_errors"] = load_fail
    r["ok"] = not r["parse_errors"] and not r["script_errors"] and not load_fail and not timed_out
    r["error"] = "" if r["ok"] else "; ".join([f"{e['file']}:{e['line']}: {e['message']}" for e in (r["parse_errors"] + r["script_errors"])[:5]]
                                              + [e["message"] for e in load_fail[:1]])
    r["log"] = log[-LOG_KEEP:]
    return r


def check_all(project, root: str = "res://", exclude=("res://addons/",), timeout: float = 600) -> dict:
    """Compile every .gd under root in ONE Godot run (agent_audit.gd:scripts) and report errors per file."""
    r = run_script(project, "agent_audit.gd:scripts", args={"root": root, "exclude": list(exclude)}, timeout=timeout)
    res = r.get("result") or {}
    by_file: dict[str, list] = {}
    for e in r["parse_errors"] + r["script_errors"]:
        by_file.setdefault(e.get("file") or "?", []).append(f"{e.get('line')}: {e['message']}")
    r["files_checked"] = res.get("checked", 0)
    r["failed_files"] = res.get("failed", [])
    r["errors_by_file"] = by_file
    r["ok"] = bool(res) and not res.get("failed") and not r["parse_errors"]
    return r


def run_tests(project, framework: str = "gut", filter: str | None = None, dirs=("res://test",), timeout: float = 900) -> dict:
    """Run GUT 9.x (addons/gut) or gdUnit4 (addons/gdUnit4) headless and parse JUnit XML.

    filter (GUT): substring of a test script name (-gselect); "script:test" also sets -gunit_test_name.
    Never pauses: GUT gets -gexit and -gignore_pause so pause_before_teardown cannot hang CI.
    """
    project = Path(project).resolve()
    out = _ensure_out(project, None)
    stamp = time.strftime("%Y%m%d-%H%M%S") + "_" + uuid.uuid4().hex[:4]
    junit = out / "tests" / f"junit_{framework}_{stamp}.xml"
    junit.parent.mkdir(parents=True, exist_ok=True)
    if framework == "gut":
        if not (project / "addons" / "gut" / "gut_cmdln.gd").exists():
            raise FileNotFoundError("GUT is not installed: gd_env.install_gut(project)")
        cmd = [_godot(), "--headless", "--path", str(project), "-s", "res://addons/gut/gut_cmdln.gd"]
        for d in dirs:
            cmd.append(f"-gdir={d}")
        cmd += ["-ginclude_subdirs", "-gexit", "-gignore_pause", "-gdisable_colors", f"-gjunit_xml_file={junit}"]
        if filter:
            sel, _, test = filter.partition(":")
            if sel:
                cmd.append(f"-gselect={sel}")
            if test:
                cmd.append(f"-gunit_test_name={test}")
    elif framework == "gdunit4":
        tool = project / "addons" / "gdUnit4" / "bin" / "GdUnitCmdTool.gd"
        if not tool.exists():
            raise FileNotFoundError("gdUnit4 is not installed in addons/gdUnit4")
        # -rd must be a res:// path: gdUnit4 6.2.1 joins an absolute OS path onto the project root
        # (reports landed in <project>/Users/.../results.xml; scenario-godot-pipeline-automation, verified again here).
        # --ignoreHeadlessMode is still required (exit 103 without it).
        rd = out / "tests" / f"gdunit_{stamp}"
        try:
            rd_arg = "res://" + rd.resolve().relative_to(project).as_posix()
        except ValueError:
            rd_arg = str(rd)
        cmd = [_godot(), "--headless", "--path", str(project), "-s", "res://addons/gdUnit4/bin/GdUnitCmdTool.gd",
               "--ignoreHeadlessMode", "-rd", rd_arg]
        for d in dirs:
            cmd += ["-a", d]
        cmd += ["-c"]
    else:
        raise ValueError("framework must be gut or gdunit4")
    log_path = out / "logs" / f"tests_{framework}_{stamp}.log"
    log, code, timed_out, secs, _ = _run(cmd, project, timeout, False, log_path)
    r = _summarise(log, code, timed_out, {"duration_s": round(secs, 2), "log_path": str(log_path), "cmd": shlex.join(cmd)})
    if framework == "gdunit4":
        cands = sorted((out / "tests").glob(f"gdunit_{stamp}/**/results.xml"))
        junit = cands[-1] if cands else junit
    r["junit_path"] = str(junit)
    r["junit"] = gd_stat.parse_junit(junit)
    r["summary"] = gd_stat.parse_gut_output(log) if framework == "gut" else {
        "exit_meaning": {0: "pass", 100: "failures or errors", 101: "orphans only", 103: "headless refused",
                         104: "Godot version not supported", 105: "script errors detected"}.get(code, "")}
    tests = r["junit"].get("tests", 0)
    r["ok"] = (not timed_out) and code == 0 and r["junit"].get("ok", False) and not r["parse_errors"]
    r["error"] = "" if r["ok"] else (f"exit {code}; " if code else "") + (f"{r['junit'].get('failures', 0)} failed, {r['junit'].get('errors', 0)} errors of {tests}" if tests else "no tests ran / no JUnit XML") + ("; parse errors" if r["parse_errors"] else "")
    r["log"] = log[-LOG_KEEP:]
    return r


# ---------------------------------------------------------------- export

def ensure_preset(project, name: str, platform: str, export_path: str = "", options: dict | None = None) -> dict:
    """Add or replace a preset in export_presets.cfg through Godot's ConfigFile (agent_build.gd:add_preset).

    platform: "macOS", "Linux", "Windows Desktop", "Web", "Android", "iOS".
    """
    return run_script(project, "agent_build.gd:add_preset",
                      args={"name": name, "platform": platform, "export_path": export_path, "options": options or {}}, timeout=120)


def _preset_names(project: Path) -> list[str]:
    cfg = project / "export_presets.cfg"
    if not cfg.exists():
        return []
    return re.findall(r'^name="([^"]*)"', cfg.read_text(), re.M)


def export(project, preset: str, out, release: bool = True, pack: bool = False, timeout: float = 1800) -> dict:
    """Export with --export-release / --export-debug / --export-pack (pack needs no templates).

    out: output file. Relative paths are resolved against the PROJECT folder by Godot, so this
    function always passes an absolute path. Output inside the project gets a .gdignore, or it
    would be imported and packed into the next export (verified 4.7.2).
    """
    project = Path(project).resolve()
    outp = Path(out)
    if not outp.is_absolute():
        outp = (Path.cwd() / outp).resolve()
    outp.parent.mkdir(parents=True, exist_ok=True)
    try:
        outp.parent.resolve().relative_to(project)
        inside = True
    except ValueError:
        inside = False
    if inside and outp.parent.resolve() != project and not (outp.parent / ".gdignore").exists():
        (outp.parent / ".gdignore").write_text("")
    names = _preset_names(project)
    if preset not in names:
        return {"ok": False, "error": f"preset {preset!r} not in export_presets.cfg (have {names}); use ensure_preset()", "presets": names}
    flag = "--export-pack" if pack else ("--export-release" if release else "--export-debug")
    if not pack:
        import gd_env
        cfg = (project / "export_presets.cfg").read_text()
        blk = cfg.split(f'name="{preset}"', 1)[1]
        plat = re.search(r'^platform="([^"]+)"', blk, re.M)
        platmap = {"macOS": "macos", "Linux": "linux", "Windows Desktop": "windows", "Web": "web", "Android": "android", "iOS": "ios"}
        pk = platmap.get(plat.group(1) if plat else "", None)
        if pk and not gd_env.templates_ok(platforms=(pk,)):
            return {"ok": False, "error": f"export templates missing for {pk}: gd_env.install_templates()", "templates_dir": str(gd_env.templates_dir())}
    out_dir = _ensure_out(project, None)
    log_path = out_dir / "logs" / f"export_{re.sub(r'[^A-Za-z0-9]+', '_', preset)}_{time.strftime('%Y%m%d-%H%M%S')}.log"
    cmd = [_godot(), "--headless", "--path", str(project), flag, preset, str(outp)]
    log, code, timed_out, secs, _ = _run(cmd, project, timeout, False, log_path)
    r = _summarise(log, code, timed_out, {"duration_s": round(secs, 2), "log_path": str(log_path), "cmd": shlex.join(cmd), "out": str(outp)})
    r["export"] = gd_stat.parse_export_log(log)
    def _size(p: Path) -> int:
        return p.stat().st_size if p.is_file() else sum(f.stat().st_size for f in p.rglob("*") if f.is_file())

    # Every file the export wrote next to `out` with the same stem (a web export writes index.html plus
    # index.js, .wasm, .pck, icons and a service worker; a Linux export can write Game.pck beside the
    # binary). `bytes` used to be the main file only: 5.6 KB for a 38 MB web export.
    sib_paths = sorted(p for p in outp.parent.glob(outp.stem + "*") if p.exists())
    siblings = [p.name for p in sib_paths]
    exists = outp.exists()
    main_bytes = _size(outp) if exists else 0
    artifact = str(outp) if exists else ""
    # iOS with application/export_project_only writes <stem>.xcodeproj and a <stem>/ folder, no .ipa:
    # that is a complete export (Xcode does the build), not a failure.
    xcp = outp.parent / (outp.stem + ".xcodeproj")
    if not exists and outp.suffix == ".ipa" and xcp.is_dir():
        exists, artifact = True, str(xcp)
    total = sum(_size(p) for p in sib_paths)
    r.update({"exists": exists, "artifact": artifact, "bytes": total, "main_bytes": main_bytes, "files": siblings})
    size = total
    r["ok"] = code == 0 and not timed_out and exists and size > 0
    details = [e["detail"] for e in r["engine_errors"] if e.get("detail")]
    r["error"] = "" if r["ok"] else f"exit {code}, exists={exists}, bytes={size}; " + "; ".join(r["export"]["errors"][:3] + details[:3])
    if "ETC2 ASTC" in log:
        r["fix"] = ("gd_env.set_project_setting(project, 'rendering/textures/vram_compression/import_etc2_astc', 'true'); "
                    "gd_run.import_project(project); then export again (macOS universal or arm64 needs ETC2/ASTC)")
    r["log"] = log[-LOG_KEEP:]
    return r


def verify_pack(pck, expect=(), load=(), timeout: float = 300) -> dict:
    """Mount an exported .pck/.zip in a scratch project and list it (agent_build.gd:verify_pack).

    expect: res:// paths that must be in the pack; load: res:// resources that must load from it.
    The scratch project lives next to the pack in _verify_pack/ (with .gdignore-free contents).
    """
    import gd_env
    pck = Path(pck).resolve()
    scratch = pck.parent / f"_verify_pack_{uuid.uuid4().hex[:6]}"
    scratch.mkdir(parents=True)
    (scratch / "project.godot").write_text('config_version=5\n\n[application]\nconfig/name="verify_pack"\nconfig/features=PackedStringArray("4.7")\n')
    gd_env.install_agentkit(scratch)
    gd_env.isolate_user_dir(scratch, "verify_pack")
    r = run_script(scratch, "agent_build.gd:verify_pack", args={"pck": str(pck), "expect": list(expect), "load": list(load)}, timeout=timeout)
    r["scratch_project"] = str(scratch)
    return r


# ---------------------------------------------------------------- capture, profile, audit wrappers

def capture_scene(project, scene: str | None = None, out: str = "captures/shot.png", size=(1280, 720), camera: str | None = None,
                  frames: int = 8, views=None, review: bool = True, timeout: float = 300, args: dict | None = None,
                  extra_args: list[str] | None = None) -> dict:
    """Render a scene through a SubViewport at `size` in a windowed run and save PNG(s).

    camera: NodePath inside the scene (default: the current camera, else an automatic framing).
    views: None (one image from the camera) or a list among front, back, left, right, top,
    three_quarter: bookmark views framed on the scene bounds (3D only).
    review=True runs gd_review.image_checks on each PNG and adds "checks".
    extra_args: engine flags, for example ["--debug-collisions"] or ["--debug-navigation"].
    """
    a = {"scene": scene or "", "out": out, "size": list(size), "camera": camera or "", "frames": frames, "views": list(views or [])}
    if args:
        a.update(args)
    r = run_script(project, "agent_capture.gd:capture", args=a, timeout=timeout, headless=False, extra_args=extra_args)
    if review and r.get("result") and r["result"].get("images"):
        import gd_review
        r["checks"] = {p: gd_review.image_checks(p) for p in r["result"]["images"] if Path(p).exists()}
    return r


def capture_sequence(project, scene: str, out_dir: str = "captures/seq", count: int = 8, every: int = 6, size=(640, 360),
                     camera: str | None = None, sheet: bool = True, timeout: float = 300, args: dict | None = None,
                     extra_args: list[str] | None = None) -> dict:
    """Capture `count` frames, one every `every` rendered frames (animation, particles), plus a contact sheet."""
    a = {"scene": scene, "out_dir": out_dir, "count": count, "every": every, "size": list(size), "camera": camera or ""}
    if args:
        a.update(args)
    r = run_script(project, "agent_capture.gd:sequence", args=a, timeout=timeout, headless=False, extra_args=extra_args)
    imgs = (r.get("result") or {}).get("images") or []
    if sheet and imgs:
        import gd_review
        sheet_path = str(Path(imgs[0]).parent / "contact_sheet.png")
        r["contact_sheet"] = gd_review.contact_sheet(imgs, sheet_path)
    return r


def profile_scene(project, scene: str | None = None, seconds: float = 5.0, warmup: int = 30, size=None, headless: bool = False,
                  csv: str = "profile/frames.csv", target_ms: float = 16.67, timeout: float = 600, args: dict | None = None,
                  driver: str | None = None, extra_args: list[str] | None = None) -> dict:
    """Record per-frame timings and Performance monitors to CSV (agent_profile.gd:profile), then budget_check.

    headless=True measures CPU only (render monitors read 0 and no frame is drawn). For GPU numbers
    use a windowed run; size=(1920, 1080) renders through a SubViewport at that size.
    driver="vulkan" on macOS: the Metal driver reports gpu_ms = 0 in 4.7.2, Vulkan (MoltenVK) reports
    real GPU time (observed 2026-10-02). frame_ms stays capped at the display refresh on macOS.
    """
    a = {"scene": scene or "", "seconds": seconds, "warmup": warmup, "csv": csv, "size": list(size) if size else []}
    if args:
        a.update(args)
    xa = list(extra_args or [])
    if driver and not headless:
        xa += ["--rendering-driver", driver]
    r = run_script(project, "agent_profile.gd:profile", args=a, timeout=timeout, headless=headless, extra_args=xa or None)
    res = r.get("result") or {}
    if res.get("csv") and Path(res["csv"]).exists():
        cols = gd_stat.read_monitor_csv(res["csv"])
        r["budget"] = gd_stat.budget_check(cols.get("frame_ms", []), target_ms)
        if cols.get("gpu_ms") and any(v > 0 for v in cols["gpu_ms"]):
            r["gpu_budget"] = gd_stat.budget_check(cols["gpu_ms"], target_ms)
    return r


def audit(project, what: str = "project", timeout: float = 300, **kwargs) -> dict:
    """agent_audit.gd: project | scene (scene=res://...) | resources (root=) | scripts (root=, exclude=) | imports | classdb (checks=[...])."""
    return run_script(project, f"agent_audit.gd:{what}", args=kwargs, timeout=timeout)


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Run an AgentKit job and print its result JSON")
    ap.add_argument("project")
    ap.add_argument("script")
    ap.add_argument("--args", default="{}")
    ap.add_argument("--windowed", action="store_true")
    ap.add_argument("--editor", action="store_true")
    ap.add_argument("--timeout", type=float, default=600)
    ns = ap.parse_args()
    res = run_script(ns.project, ns.script, json.loads(ns.args), timeout=ns.timeout, headless=not ns.windowed, editor=ns.editor)
    res.pop("log", None)
    print(json.dumps(res, indent=2, default=str))
    sys.exit(0 if res["ok"] else 1)
