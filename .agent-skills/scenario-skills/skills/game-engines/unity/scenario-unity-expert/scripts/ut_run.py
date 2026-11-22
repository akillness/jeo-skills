"""
ut_run: the batch-mode channel. One Unity process per call, one project per process, a job
protocol with a result line, and log scanning that turns silent failures into errors.

Shared toolkit of the scenario-unity-* skills (lead: scenario-unity-expert). System python3, 3.9+, stdlib only.
Run in Unity 6000.3.21f1 on macOS (Apple Silicon) on 2026-09-24: tests/code/unity-expert/.

    import sys; sys.path.insert(0, "<scenario-unity-expert skill>/scripts")
    import ut_run
    r = ut_run.run_method(P, "AgentKit.AgentJob.Echo", {"hello": 1})       # -quit, -nographics
    r["ok"], r["result"], r["compile_errors"], r["exceptions"], r["log"]
    r = ut_run.run_method(P, "AgentKit.AgentCapture.CaptureViews", {...}, graphics=True)
    r = ut_run.run_method(P, "AgentKit.AgentProfile.PlayModeTimings", {...}, quit=False, graphics=True)
    t = ut_run.run_tests(P, "EditMode")      # never -quit with -runTests; NUnit XML parsed
    b = ut_run.build(P, "macos", out="Builds/mac/Game.app")   # BuildReport summary dict

Every call refuses a project that a running editor holds (ut_env.project_lock): batch mode
cannot open a project the GUI editor has open. Use ut_live for an open editor.

Grace timeout (v0.2): a batch editor that printed this job's AGENT_RESULT and a shutdown marker,
then went silent for `grace` seconds (default 10), is ended by PID (SIGTERM, SIGKILL 15 s later);
one that printed its AGENT_RESULT but no shutdown marker is ended after `result_grace` seconds of
silence (default 120). The envelope stays the result; out["grace_kill"] says what happened.
Observed once (scenario-unity-rendering-lighting, 2026-09-24): an editor hung 9 minutes after its result.
"""

__version__ = "0.1"  # Unity Expert Skills v0.1 (2026-09-24: grace timeout, scan_log fix)

import datetime
import json
import os
import random
import re
import signal
import subprocess
import time
import xml.etree.ElementTree as ET

import ut_env

RESULT_PREFIX = "AGENT_RESULT "
AGENTKIT_PREFIX = "[AgentKit] "   # AgentJob.Log/Warn lines: job output, never compiler output

# Grace timeout after a job's result (seconds of log silence). Env overrides: UT_GRACE_S,
# UT_RESULT_GRACE_S; pass grace=0 / result_grace=0 to run_method to disable either one.
GRACE_S = float(os.environ.get("UT_GRACE_S", "10"))
RESULT_GRACE_S = float(os.environ.get("UT_RESULT_GRACE_S", "120"))
# Lines a batch editor writes while shutting down (observed 2026-09-24 on 6000.3.21f1): -quit
# prints the first and the last; EditorApplication.Exit prints the Physics and mono cleanup lines.
EXIT_MARKERS = ("Batchmode quit successfully invoked", "Exiting batchmode successfully now!",
                "[Physics::Module] Cleanup current backend", "Cleanup mono",
                "Application will terminate with return code")

# friendly name -> (value for -buildTarget, BuildTarget enum name used by AgentBuild)
TARGETS = {
    "macos": ("StandaloneOSX", "StandaloneOSX"),
    "osx": ("StandaloneOSX", "StandaloneOSX"),
    "standaloneosx": ("StandaloneOSX", "StandaloneOSX"),
    "web": ("WebGL", "WebGL"),
    "webgl": ("WebGL", "WebGL"),
    "android": ("Android", "Android"),
    "ios": ("iOS", "iOS"),
    "windows": ("StandaloneWindows64", "StandaloneWindows64"),
    "win64": ("StandaloneWindows64", "StandaloneWindows64"),
    "linux": ("StandaloneLinux64", "StandaloneLinux64"),
}

_CS_ERR = re.compile(r"^(?P<file>[^\s(:][^(\n]*?)\((?P<line>\d+),(?P<col>\d+)\): (?P<sev>error|warning) (?P<code>CS\d{4}): (?P<msg>.*)$", re.M)
# compile failures that carry no "error CS####" (asmdef problems, duplicate references, missing
# references): observed 2026-09-24, "Assembly has duplicate references: UnityEngine.TestRunner
# (Assets/Tests/PlayMode/X.asmdef)" then "Scripts have compiler errors." and batch abort.
_ASM_ERR = re.compile(r"^(Assembly has duplicate references: .*|Assembly '.*' has reference to '.*' which is not found.*|"
                      r".*\.asmdef.*(?:error|invalid|duplicate).*|error: .*)$", re.M)
_EXC = re.compile(r"^((?:[A-Za-z_][\w]*\.)*[A-Za-z_]\w*Exception)(?::\s*(.*))?$", re.M)
_LOG_FLAGS = [
    ("compile_failed", r"Scripts have compiler errors|compilation errors? (?:was|were) found|Compilation failed"),
    ("license", r"No valid Unity Editor license found|LicenseGroupOfflineValidityPeriodIsExpired"),
    # note: "[Licensing::Module] Error: Access token is unavailable; failed to update" appears in
    # every successful offline run (observed 2026-09-24) and is NOT a license failure
    ("project_open_elsewhere", r"another Unity instance is running with this project open|Multiple Unity instances cannot open the same project"),
    ("method_not_found", r"executeMethod (?:class|method) .* could not be found|executeMethod method .* does not exist"),
    ("method_threw", r"executeMethod method .* threw exception"),
    ("aborted", r"Aborting batchmode due to failure"),
    ("safe_mode", r"Safe Mode"),
    ("crash", r"Received signal SIG(?:SEGV|ABRT|BUS)|Native Crash Reporting|Obtained \d+ stack frames"),
    ("api_updater", r"API Updater|APIUpdater"),
    ("batch_quit_ok", r"Exiting batchmode successfully now!"),
]


# ============================================================================ helpers
def _job_id(method):
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    short = re.sub(r"[^A-Za-z0-9]+", "", (method or "job").split(".")[-1])[:24]
    return "%s-%s-%04x" % (stamp, short, random.randint(0, 0xFFFF))


def _job_dir(root, job_id, job_dir=None):
    d = job_dir or os.path.join(root, "Library", "AgentKit", "jobs", job_id)
    os.makedirs(d, exist_ok=True)
    return d


MAX_UNITY = int(os.environ.get("UT_MAX_UNITY", "6"))  # machine-wide cap on concurrent editors


def _wait_for_slot(max_wait=1800, poll=3.0):
    """Several agents share this Mac (48 GB, other sessions run Blender): wait until fewer than
    UT_MAX_UNITY Unity editors are running before starting another. Returns seconds waited."""
    t0 = time.time()
    while len(ut_env.editor_processes()) >= MAX_UNITY and time.time() - t0 < max_wait:
        time.sleep(poll + random.random())
    return round(time.time() - t0, 1)


class _GraceWatch:
    """Follows a job's log while the editor runs. Fires when the job's AGENT_RESULT line and then a
    shutdown marker were written and the log stayed silent for `grace` seconds, or when only the
    AGENT_RESULT was written and the log stayed silent for `result_grace` seconds."""

    def __init__(self, log, job_id=None, grace=GRACE_S, result_grace=RESULT_GRACE_S):
        self.log, self.job_id = log, job_id
        self.grace, self.result_grace = grace, result_grace
        self.pos, self.partial = 0, ""
        self.result_seen = self.marker_seen = False
        self.last_growth = time.time()

    def _result_line(self, line):
        if RESULT_PREFIX not in line:
            return False
        return not self.job_id or ('"job":"%s"' % self.job_id) in line

    def feed(self, chunk, now=None):
        """Consume new log text (also used by the offline tests)."""
        self.last_growth = time.time() if now is None else now
        lines = (self.partial + chunk).split("\n")
        self.partial = lines.pop()
        for line in lines:
            if not self.result_seen:
                self.result_seen = self._result_line(line)
            elif not self.marker_seen and any(mk in line for mk in EXIT_MARKERS):
                self.marker_seen = True

    def poll(self, now=None):
        """Read what the editor appended since the last poll. Returns None or a reason string."""
        now = time.time() if now is None else now
        try:
            size = os.path.getsize(self.log)
        except OSError:
            size = -1
        if size >= 0 and size < self.pos:
            self.pos, self.partial = 0, ""
        if size > self.pos:
            with open(self.log, "r", errors="replace") as f:
                f.seek(self.pos)
                chunk = f.read()
                self.pos = f.tell()
            self.feed(chunk, now)
        return self.verdict(now)

    def verdict(self, now=None):
        now = time.time() if now is None else now
        idle = now - self.last_growth
        if self.result_seen and self.marker_seen and self.grace and idle >= self.grace:
            return "AGENT_RESULT and shutdown marker written, then %.0f s without log output" % idle
        if self.result_seen and not self.marker_seen and self.result_grace and idle >= self.result_grace:
            return "AGENT_RESULT written, no shutdown marker, then %.0f s without log output" % idle
        return None


def _terminate(p, wait=15):
    """SIGTERM to this PID only, SIGKILL `wait` seconds later. Never by name."""
    try:
        p.send_signal(signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        return p.wait(timeout=wait)
    except subprocess.TimeoutExpired:
        p.kill()
        return p.wait()


def _launch(cmd, timeout, stdout_path, env=None, watch=None, poll=1.0):
    """Run the editor and wait. On timeout: SIGTERM to this PID only, SIGKILL 15 s later.
    Never pkill by name: that would kill other agents' editors. Waits for a free slot first
    (UT_MAX_UNITY, default 6 concurrent editors).
    watch: optional dict {"log", "job", "grace", "result_grace"}: ends the editor by PID once its
    job result is final and it stops logging (see _GraceWatch). On a grace kill the dict gets
    "killed": True, "reason", "after_s". Returns (exit code, seconds, timed_out, pid)."""
    _wait_for_slot()
    t0 = time.time()
    watcher = None
    if watch and watch.get("log") and (watch.get("grace") or watch.get("result_grace")):
        watcher = _GraceWatch(watch["log"], watch.get("job"), watch.get("grace"), watch.get("result_grace"))
    with open(stdout_path, "w") as out:
        p = subprocess.Popen(cmd, stdout=out, stderr=subprocess.STDOUT, env=env)
        timed_out = False
        while True:
            left = timeout - (time.time() - t0)
            if left <= 0:
                timed_out = True
                code = _terminate(p)
                break
            try:
                code = p.wait(timeout=min(poll, left) if watcher else left)
                break
            except subprocess.TimeoutExpired:
                pass
            if watcher:
                reason = watcher.poll()
                if reason:
                    watch.update({"killed": True, "reason": reason, "pid": p.pid,
                                  "after_s": round(time.time() - t0, 2)})
                    code = _terminate(p)
                    break
    return code, round(time.time() - t0, 2), timed_out, p.pid


def read_text(path):
    if not path or not os.path.isfile(path):
        return ""
    with open(path, "r", errors="replace") as f:
        return f.read()


def parse_agent_result(text, job_id=None):
    """Last `AGENT_RESULT {json}` line (for job_id when given). Returns the dict or None."""
    found = None
    for line in text.splitlines():
        i = line.find(RESULT_PREFIX)
        if i < 0:
            continue
        payload = line[i + len(RESULT_PREFIX):].strip()
        try:
            env = json.loads(payload)
        except ValueError:
            continue
        if job_id and env.get("job") not in (job_id, None):
            continue
        found = env
    return found


def _is_job_output(line):
    """True for lines AgentKit itself printed (the result envelope, AgentJob.Log/Warn)."""
    return RESULT_PREFIX in line or line.lstrip().startswith(AGENTKIT_PREFIX)


def scan_log(text):
    """Turn an Editor log into facts: compile errors and warnings (deduplicated), exceptions,
    and flags (license, project open elsewhere, method not found, crash, clean batch exit)."""
    errors, warnings, seen = [], [], set()
    for m in _CS_ERR.finditer(text):
        key = (m.group("file"), m.group("line"), m.group("col"), m.group("code"), m.group("msg"))
        if key in seen:
            continue
        seen.add(key)
        item = {"file": m.group("file"), "line": int(m.group("line")), "col": int(m.group("col")),
                "code": m.group("code"), "message": m.group("msg").strip()}
        (errors if m.group("sev") == "error" else warnings).append(item)
    for m in _ASM_ERR.finditer(text):
        msg = m.group(1).strip()
        if _is_job_output(msg):
            # an AGENT_RESULT envelope that mentions ".asmdef" next to '"error":' is job output,
            # not a compiler message (false positive reported by scenario-unity-architecture, 2026-09-24)
            continue
        key = ("asm", msg)
        if key in seen:
            continue
        seen.add(key)
        am = re.search(r"\(([^()]+\.asmdef)\)", msg)
        errors.append({"file": am.group(1) if am else None, "line": 0, "col": 0, "code": "ASMDEF", "message": msg})
    exceptions, eseen = [], set()
    for m in _EXC.finditer(text):
        line_start = text.rfind("\n", 0, m.start()) + 1
        line_end = text.find("\n", m.start())
        if RESULT_PREFIX in text[line_start:line_end if line_end >= 0 else len(text)]:
            continue
        k = (m.group(1), (m.group(2) or "")[:200])
        if k in eseen:
            continue
        eseen.add(k)
        exceptions.append({"type": m.group(1), "message": (m.group(2) or "").strip()[:500]})
    flags = {name: bool(re.search(rx, text)) for name, rx in _LOG_FLAGS}
    warning_codes = {}
    for w in warnings:
        warning_codes[w["code"]] = warning_codes.get(w["code"], 0) + 1
    return {"compile_errors": errors, "compile_warnings": warnings[:50],
            "compile_warning_codes": warning_codes, "exceptions": exceptions[:50], "flags": flags}


def _base_cmd(editor, root, log, graphics, quit_, build_target=None, accept_apiupdate=False):
    cmd = [editor["binary"], "-batchmode"]
    if not graphics:
        cmd.append("-nographics")
    if quit_:
        cmd.append("-quit")
    cmd += ["-projectPath", root, "-logFile", log]
    if build_target:
        cmd += ["-buildTarget", build_target]
    if accept_apiupdate:
        cmd.append("-accept-apiupdate")
    return cmd


# ============================================================================ run_method
def run_method(project, method, args=None, timeout=1800, graphics=False, quit=True,
               build_target=None, extra_args=None, job_dir=None, accept_apiupdate=False,
               lock_check=True, strict=False, version=None, env=None, grace=None,
               result_grace=None):
    """Run a static C# method in a fresh batch editor and return its AGENT_RESULT envelope.

    Command: Unity -batchmode [-nographics] [-quit] -projectPath P -logFile <job>/unity.log
             [-buildTarget T] -executeMethod <method> -agentJob <job dir>   (args in <job>/args.json)
    graphics=False adds -nographics (faster; nothing renders, GI cannot bake): pass
    graphics=True for captures, bakes and profiling. quit=False for AgentJob.BeginAsync jobs
    (the method exits the editor itself). build_target switches the platform at launch, the
    only switch that works in batch mode.

    Returns the envelope {"ok", "job", "method", "result", "error", "exception", "stack",
    "warnings", "unity", "graphics", ...} plus "compile_errors", "compile_warning_codes",
    "exceptions", "flags", "exit_code", "seconds", "timed_out", "log", "job_dir", "cmd".
    Without an envelope: ok=False and "error" names the likely cause. strict=True also fails on
    a non-zero exit code or any compile error.
    grace / result_grace (seconds, default GRACE_S=10 / RESULT_GRACE_S=120, 0 disables): end an
    editor that hangs after its result (see _GraceWatch); out["grace_kill"] is then
    {"killed": True, "reason", "pid", "after_s"} and the envelope is kept as the result."""
    info = ut_env.find_project(project)
    root = info["root"]
    if lock_check:
        ut_env.assert_unlocked(root)
    editor = ut_env.find_editor(version or info["version"] or ut_env.DEFAULT_VERSION)
    jid = _job_id(method)
    jd = _job_dir(root, jid, job_dir)
    jid = os.path.basename(jd.rstrip("/"))
    with open(os.path.join(jd, "args.json"), "w") as f:
        json.dump(args or {}, f, indent=2, default=str)
    log = os.path.join(jd, "unity.log")
    cmd = _base_cmd(editor, root, log, graphics, quit, build_target, accept_apiupdate)
    cmd += ["-executeMethod", method, "-agentJob", jd]
    cmd += list(extra_args or [])
    watch = {"log": log, "job": jid,
             "grace": GRACE_S if grace is None else grace,
             "result_grace": RESULT_GRACE_S if result_grace is None else result_grace}
    code, secs, timed_out, pid = _launch(cmd, timeout, os.path.join(jd, "stdout.txt"), env, watch=watch)
    text = read_text(log)
    # the batch abort reason ("Aborting batchmode due to failure: ...") goes to stdout, not the log
    scan = scan_log(text + "\n" + read_text(os.path.join(jd, "stdout.txt")))
    envl = parse_agent_result(text, jid)
    rf = os.path.join(jd, "result.json")
    if (envl is None or envl.get("result_truncated")) and os.path.isfile(rf):
        try:
            with open(rf) as f:
                full = json.load(f)
            if full.get("job") in (jid, None):
                envl = full
        except ValueError:
            pass
    out = dict(envl) if envl else {"ok": False, "job": jid, "method": method, "result": None}
    if envl is None:
        out["error"] = _no_envelope_reason(scan, code, timed_out)
    out.update({
        "compile_errors": scan["compile_errors"],
        "compile_warning_codes": scan["compile_warning_codes"],
        "exceptions": scan["exceptions"],
        "flags": scan["flags"],
        "exit_code": code,
        "seconds": secs,
        "timed_out": timed_out,
        "pid": pid,
        "log": log,
        "job_dir": jd,
        "cmd": cmd,
        "grace_kill": {k: watch[k] for k in ("killed", "reason", "pid", "after_s")} if watch.get("killed") else None,
    })
    if strict and out.get("ok") and ((code != 0 and not watch.get("killed")) or scan["compile_errors"]):
        out["ok"] = False
        out["error"] = "strict: exit code %s, %d compile errors" % (code, len(scan["compile_errors"]))
    return out


def _no_envelope_reason(scan, code, timed_out):
    f = scan["flags"]
    if timed_out:
        return "timed out before AGENT_RESULT (async job without quit=False finishing? play mode stuck?)"
    if scan["compile_errors"]:
        e = scan["compile_errors"][0]
        return ("compile errors (%d) abort EVERY batch job of the project, first: %s(%d,%d): %s %s" % (
            len(scan["compile_errors"]), e["file"], e["line"], e["col"], e["code"], e["message"]))
    if f.get("compile_failed"):
        return "Scripts have compiler errors (no error CS line: check asmdef references in the log)"
    if f.get("license"):
        return "license refused: sign in to Unity Hub (Personal licenses expire offline after 30 days)"
    if f.get("project_open_elsewhere"):
        return "project is open in another editor: use ut_live, or close it"
    if f.get("method_not_found"):
        return "executeMethod target not found: wrong Namespace.Class.Method, or its script did not compile"
    if f.get("method_threw"):
        return "the method threw before writing a result (not wrapped in AgentJob.Run?)"
    if f.get("crash"):
        return "the editor crashed (see log)"
    return "no AGENT_RESULT line (exit code %s): the method did not call AgentJob.Run/Succeed/Fail" % code


# ============================================================================ tests
def parse_nunit(path):
    """NUnit3 XML written by -testResults -> {"summary": {...}, "cases": [...], "failures": [...]}."""
    tree = ET.parse(path)
    run = tree.getroot()
    if run.tag != "test-run":
        run = run.find(".//test-run") or run
    def num(k):
        try:
            return int(run.get(k, "0"))
        except ValueError:
            return 0
    summary = {"result": run.get("result"), "total": num("total"), "passed": num("passed"),
               "failed": num("failed"), "skipped": num("skipped"), "inconclusive": num("inconclusive"),
               "duration": float(run.get("duration", "0") or 0), "start": run.get("start-time"),
               "engine": run.get("engine-version")}
    cases, failures = [], []
    for tc in run.iter("test-case"):
        c = {"name": tc.get("name"), "fullname": tc.get("fullname"), "result": tc.get("result"),
             "duration": float(tc.get("duration", "0") or 0)}
        fail = tc.find("failure")
        if fail is not None:
            msg = fail.find("message")
            st = fail.find("stack-trace")
            c["message"] = (msg.text or "").strip() if msg is not None else ""
            c["stack"] = (st.text or "").strip()[:2000] if st is not None else ""
        out = tc.find("output")
        if out is not None and out.text:
            c["output"] = out.text.strip()[:2000]
        cases.append(c)
        if c["result"] not in ("Passed", "Skipped", "Inconclusive"):
            failures.append(c)
    return {"summary": summary, "cases": cases, "failures": failures}


def run_tests(project, platform="EditMode", filter=None, timeout=1800, graphics=False,
              results=None, categories=None, assemblies=None, extra_args=None, lock_check=True,
              version=None):
    """Unity Test Framework from the command line, never with -quit ("The Editor's regular -quit
    command-line argument is not supported while tests are running", 6.3 Manual):
      Unity -batchmode [-nographics] -projectPath P -runTests -testPlatform EditMode|PlayMode
            -testResults <abs xml> -logFile <log> [-testFilter F] [-testCategory C] [-assemblyNames A]
    Returns {"ok", "exit_code", "summary", "cases", "failures", "results", "log", "compile_errors",
    "exceptions", "seconds", "timed_out", "cmd"}; ok = XML written, total > 0, failed == 0."""
    info = ut_env.find_project(project)
    root = info["root"]
    if lock_check:
        ut_env.assert_unlocked(root)
    editor = ut_env.find_editor(version or info["version"] or ut_env.DEFAULT_VERSION)
    jd = _job_dir(root, _job_id("tests-" + platform))
    results = os.path.abspath(results or os.path.join(jd, "results-%s.xml" % platform))
    log = os.path.join(jd, "unity.log")
    cmd = _base_cmd(editor, root, log, graphics, False)
    cmd += ["-runTests", "-testPlatform", platform, "-testResults", results]
    if filter:
        cmd += ["-testFilter", filter]
    if categories:
        cmd += ["-testCategory", categories]
    if assemblies:
        cmd += ["-assemblyNames", assemblies]
    cmd += list(extra_args or [])
    code, secs, timed_out, pid = _launch(cmd, timeout, os.path.join(jd, "stdout.txt"))
    text = read_text(log)
    scan = scan_log(text + "\n" + read_text(os.path.join(jd, "stdout.txt")))
    out = {"ok": False, "exit_code": code, "seconds": secs, "timed_out": timed_out, "results": results,
           "log": log, "job_dir": jd, "cmd": cmd, "compile_errors": scan["compile_errors"],
           "exceptions": scan["exceptions"], "flags": scan["flags"], "summary": None, "cases": [],
           "failures": []}
    if os.path.isfile(results):
        parsed = parse_nunit(results)
        out.update(parsed)
        s = parsed["summary"]
        out["ok"] = s["total"] > 0 and s["failed"] == 0 and not timed_out
        if s["total"] == 0:
            out["error"] = "no tests ran: wrong -testPlatform, a filter that matches nothing, or no test assembly"
    else:
        out["error"] = _no_envelope_reason(scan, code, timed_out).replace(
            "no AGENT_RESULT line", "no NUnit XML written")
    return out


# ============================================================================ build
def build(project, target, profile=None, out=None, options=None, timeout=3600, development=False,
          scenes=None, detailed=False, graphics=False, lock_check=True, extra_args=None, version=None):
    """Player build through AgentKit.AgentBuild.Build in a process launched on the right platform:
      Unity -batchmode -nographics -quit -projectPath P -buildTarget <T> -executeMethod
            AgentKit.AgentBuild.Build -agentJob <job>   (profile builds also get -activeBuildProfile)
    target: "macos", "web", "android", "ios", "windows", or a BuildTarget name. profile: path of a
    Build Profile asset (BuildPlayerWithProfileOptions). out: player path (relative to the project).
    Returns the job envelope; envelope["result"] is the BuildReport summary (result, total_size_mb,
    total_time_s, errors, warnings, steps, largest files, output folder size)."""
    key = str(target).lower()
    cli_target, enum_name = TARGETS.get(key, (target, target))
    args = {"target": enum_name, "out": out, "options": list(options or []),
            "development": development, "detailed": detailed}
    if profile:
        args["profile"] = profile
    if scenes:
        args["scenes"] = list(scenes)
    extra = list(extra_args or [])
    if profile:
        extra += ["-activeBuildProfile", profile]
    return run_method(project, "AgentKit.AgentBuild.Build", args, timeout=timeout, graphics=graphics,
                      quit=True, build_target=cli_target, extra_args=extra, lock_check=lock_check,
                      version=version)


def jobs(project, limit=20):
    """Recent job folders of a project, newest first: [{"job", "dir", "ok", "method"}]."""
    root = ut_env.find_project(project)["root"]
    base = os.path.join(root, "Library", "AgentKit", "jobs")
    if not os.path.isdir(base):
        return []
    res = []
    for name in sorted(os.listdir(base), reverse=True)[:limit]:
        rf = os.path.join(base, name, "result.json")
        ok = method = None
        if os.path.isfile(rf):
            try:
                with open(rf) as f:
                    d = json.load(f)
                ok, method = d.get("ok"), d.get("method")
            except ValueError:
                pass
        res.append({"job": name, "dir": os.path.join(base, name), "ok": ok, "method": method})
    return res


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Run a static C# method in batch mode (AgentKit job protocol)")
    ap.add_argument("project")
    ap.add_argument("method")
    ap.add_argument("--args", default="{}", help="JSON object")
    ap.add_argument("--graphics", action="store_true")
    ap.add_argument("--no-quit", action="store_true")
    ap.add_argument("--timeout", type=int, default=1800)
    a = ap.parse_args()
    r = run_method(a.project, a.method, json.loads(a.args), timeout=a.timeout, graphics=a.graphics,
                   quit=not a.no_quit)
    print(json.dumps({k: r.get(k) for k in ("ok", "error", "result", "exit_code", "seconds", "log",
                                            "compile_errors", "exceptions")}, indent=2, default=str))
    raise SystemExit(0 if r.get("ok") else 1)
