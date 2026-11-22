"""
ut_live: drive a Unity editor that is ALREADY RUNNING (the user's GUI editor, or a resident
headless editor), the only way to work on a project an editor holds: batch mode refuses it.

Two transports, same AgentKit job protocol:
  1. AgentKit bridge (default, no package, no socket): request files in
     <project>/Library/AgentKit/bridge/inbox, AgentJob envelopes back. Works in any editor that
     has compiled Assets/Editor/AgentKit (ut_env.install_agentkit). call() runs any AgentKit or
     domain job live; eval() compiles a C# snippet (a script recompile: seconds, not ms).
  2. Unity CLI + com.unity.pipeline (official, beta/experimental): `unity command <name>`,
     `unity command eval '<C#>'` (200 to 600 ms, no recompile, per Unity's unity-cli skill).
     Needs the `unity` binary and the package in the project; blocked by C# compile errors (Safe
     Mode) and, on macOS, possibly by an agent sandbox that blocks loopback connections.
Community MCP servers are notes only (MCP_NOTES): Unity's own AI Assistant MCP server is
deprecated in favour of the CLI.

Shared toolkit of the scenario-unity-* skills (lead: scenario-unity-expert). System python3 3.9+, stdlib only.
Run in Unity 6000.3.21f1 on 2026-09-24 against a resident headless editor:
tests/code/unity-expert/test_live_bridge.py (bridge) and the CLI checks in the same file.

    import ut_live
    ut_live.channel(P)                          # {"channel": "batch"|"bridge"|"pipeline"|"blocked", ...}
    h = ut_live.start_headless(P)               # resident batch editor (no -quit), bridge ready
    ut_live.call(P, "AgentKit.AgentBridge.Ping")
    ut_live.call(P, "AgentKit.AgentCapture.CaptureViews", {"width": 960, "height": 540})
    ut_live.eval(P, 'return UnityEngine.Application.unityVersion;')
    ut_live.stop_headless(P)                    # bridge Quit, then SIGTERM by PID if needed
"""

__version__ = "0.1"  # Unity Expert Skills v0.1 (2026-09-24)

import json
import os
import random
import re
import shutil
import signal
import subprocess
import time

import ut_env

CLI_ENV = {"UNITY_NO_CONSENT_PROMPT": "1", "UNITY_NO_UPDATE_CHECK": "1", "UNITY_NO_CRASH_REPORT": "1",
           "UNITY_NO_PAGER": "1", "UNITY_NO_BANNER": "1"}
PORTABLE_CLI = os.path.join(ut_env.PROJECT_ROOT, "archive", "tests", "scenario-unity-expert", "unity-cli", "bin", "unity")

MCP_NOTES = {
    "official": "Unity AI Assistant MCP server (com.unity.ai.assistant 2.18): deprecated, 'Use the Unity CLI "
                "instead'. Relay in ~/.unity/relay/, approvals in Edit > Project Settings > AI > Unity MCP Server.",
    "cli_mcp": "`unity mcp --project-path P` (CLI 0.1.0-beta.8+): stdio MCP server exposing the connected editor's "
               "Pipeline commands as tools; capture_game_view/capture_scene_view fall back to a whole-desktop "
               "screenshot when the main thread is blocked (a modal): reject such frames. Claude Code wiring "
               "would be `claude mcp add unity -- unity mcp --project-path \"<P>\"` [verify].",
    "community": [
        {"repo": "CoplayDev/unity-mcp", "stars": 14461, "license": "MIT", "note": "most starred; Git URL "
         "https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#main, needs Python 3.10+ via uv [unverified]"},
        {"repo": "IvanMurzak/Unity-MCP", "stars": 4332, "license": "Apache-2.0", "note": "also targets runtime"},
        {"repo": "CoderGamester/mcp-unity", "stars": 1910, "license": "MIT", "note": ""},
    ],
    "rule": "Prefer the AgentKit bridge or `unity mcp`; add a community server only for a missing tool, after a "
            "stars and last-push check (GitHub snapshot 2026-09-24).",
}


# ============================================================================ bridge
def bridge_dir(project):
    return os.path.join(ut_env.find_project(project)["root"], "Library", "AgentKit", "bridge")


def heartbeat(project):
    """The bridge heartbeat written every second by AgentKit.AgentBridge, or None."""
    p = os.path.join(bridge_dir(project), "heartbeat.json")
    for _ in range(3):
        try:
            with open(p) as f:
                return json.load(f)
        except FileNotFoundError:
            return None
        except ValueError:
            time.sleep(0.05)
    return None


_PROCS = {}  # pid -> Popen of editors started by this process (reaped here, so they do not linger as zombies)


def _pid_alive(pid):
    try:
        pid = int(pid)
    except (TypeError, ValueError):
        return False
    p = _PROCS.get(pid)
    if p is not None and p.poll() is not None:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    try:  # an exited child that nobody reaped is a zombie: dead for our purposes
        st = subprocess.run(["ps", "-o", "stat=", "-p", str(pid)], capture_output=True, text=True, timeout=5).stdout.strip()
        return bool(st) and not st.startswith("Z")
    except Exception:
        return True


def bridge_alive(project, max_age=5.0):
    """True when a running editor serves the bridge for this project (fresh heartbeat, live pid)."""
    hb = heartbeat(project)
    if not hb or hb.get("stopped"):
        return False
    return (time.time() - float(hb.get("time", 0))) <= max_age and _pid_alive(hb.get("pid"))


def wait_idle(project, timeout=300, since=None):
    """Wait until the editor is not compiling or importing (and, with since=t, has finished a
    compilation after t or reloaded its domain after t). Returns the heartbeat or raises."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        hb = heartbeat(project)
        if hb and not hb.get("stopped") and _pid_alive(hb.get("pid")):
            fresh = time.time() - float(hb.get("time", 0)) <= 5.0
            done = since is None or float(hb.get("last_compile_finished") or 0) > since or float(hb.get("epoch") or 0) > since
            if fresh and done and not hb.get("compiling") and not hb.get("updating"):
                return hb
        time.sleep(0.25)
    raise TimeoutError("editor not idle after %ss (compiling, importing, or no bridge)" % timeout)


def call(project, method, args=None, timeout=120, poll=0.1):
    """Run a static AgentKit-style job (AgentJob.Run inside) in the running editor and return its
    envelope, plus "seconds" and "channel": "bridge". Main thread, one request at a time, never
    while the editor compiles. Raises RuntimeError when no bridge serves the project."""
    if not bridge_alive(project):
        raise RuntimeError("no AgentKit bridge for %s: install AgentKit (ut_env.install_agentkit) and let the "
                           "editor compile it (GUI: focus Unity once), or start_headless()" % project)
    bd = bridge_dir(project)
    rid = "%s-%04x" % (time.strftime("%Y%m%d-%H%M%S"), random.randint(0, 0xFFFF))
    inbox = os.path.join(bd, "inbox")
    os.makedirs(inbox, exist_ok=True)
    tmp = os.path.join(inbox, rid + ".json.tmp")
    with open(tmp, "w") as f:
        json.dump({"id": rid, "method": method, "args": args or {}}, f, default=str)
    os.rename(tmp, os.path.join(inbox, rid + ".json"))  # atomic: the bridge never reads half a request
    rf = os.path.join(bd, "jobs", rid, "result.json")
    t0 = time.time()
    while time.time() - t0 < timeout:
        if os.path.isfile(rf):
            try:
                with open(rf) as f:
                    env = json.load(f)
                env.update({"seconds": round(time.time() - t0, 3), "channel": "bridge", "job_dir": os.path.dirname(rf)})
                return env
            except ValueError:
                pass
        time.sleep(poll)
    return {"ok": False, "job": rid, "method": method, "error": "bridge timeout after %ss (editor busy, modal "
            "dialog, or an async job still running)" % timeout, "channel": "bridge"}


def eval(project, code, timeout=300, usings=None, keep=False, via="auto"):
    """Run a C# method body in the running editor and return {"ok", "result", "error", "channel", ...}.
    via="auto": the Pipeline's Roslyn eval when the Unity CLI reaches the editor (in memory, no domain
    reload: 40 to 70 ms per call measured here), else the AgentKit bridge (a script compile and
    domain reload: seconds). via="pipeline" or "bridge" forces one. Both see AgentKit, so `code`
    may call helpers such as AgentKit.AgentCapture.RenderCamera directly.
    Bridge path: `code` is the body of a method that returns an object (a `return null;` is
    appended when there is no return). Writes
    Assets/Editor/AgentEval/AgentEval_<id>.cs, asks the bridge to refresh, waits for the
    compile, then calls it. Compile errors come back as ok=False with "compile_errors"; the
    snippet is then moved to Library/AgentKit/eval_archive (never deleted) and the editor
    refreshed so a broken snippet cannot block later compiles. Costs one script compile and
    domain reload (seconds); the Unity CLI eval avoids that when com.unity.pipeline is present."""
    if via in ("auto", "pipeline") and find_cli():
        t0 = time.time()
        r = cli_eval(code, project=project, timeout=min(timeout, 300))
        if r.get("success"):
            inner = (r.get("data") or {}).get("result") or {}
            return {"ok": bool(inner.get("success", True)), "result": inner.get("result"), "output": inner.get("output"),
                    "diagnostics": inner.get("diagnostics"), "error": None, "channel": "pipeline-eval",
                    "seconds": round(time.time() - t0, 3)}
        err = (r.get("errors") or [{}])[0]
        if err.get("code") == "COMMAND_FAILED" or via == "pipeline":
            # the editor answered: a compile or runtime error in the snippet, not a missing channel
            return {"ok": False, "result": None, "error": err.get("message"), "error_code": err.get("code"),
                    "channel": "pipeline-eval", "seconds": round(time.time() - t0, 3)}
    root = ut_env.find_project(project)["root"]
    sid = "%s_%04x" % (time.strftime("%H%M%S"), random.randint(0, 0xFFFF))
    body = code if re.search(r"\breturn\b", code) else code.rstrip() + "\nreturn null;"
    uses = ["System", "System.Collections.Generic", "System.Linq", "UnityEngine", "UnityEditor",
            "UnityEditor.SceneManagement", "AgentKit"] + list(usings or [])
    src = "// generated by ut_live.eval, %s\n%s\nnamespace AgentKit.Eval\n{\n    public static class E_%s\n    {\n" \
          "        public static void Run()\n        {\n            AgentJob.Run(() =>\n            {\n%s\n            });\n" \
          "        }\n    }\n}\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), "\n".join("using %s;" % u for u in uses), sid,
                                   "\n".join("                " + line for line in body.splitlines()))
    rel = "Assets/Editor/AgentEval/AgentEval_%s.cs" % sid
    path = os.path.join(root, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    t_write = time.time()
    with open(path, "w") as f:
        f.write(src)
    t0 = time.time()
    r = call(project, "AgentKit.AgentBridge.Refresh", timeout=timeout)
    if not r.get("ok"):
        _archive_snippet(root, rel)
        return dict(r, error="refresh failed: %s" % r.get("error"))
    hb = wait_idle(project, timeout=timeout, since=t_write)
    errs = [e for e in (hb.get("compile_errors") or []) if os.path.basename(str(e.get("file", ""))) == os.path.basename(rel)]
    if errs or hb.get("compile_failed"):
        _archive_snippet(root, rel)
        try:
            call(project, "AgentKit.AgentBridge.Refresh", timeout=timeout)
            wait_idle(project, timeout=timeout, since=time.time() - 0.5)
        except Exception:
            pass
        return {"ok": False, "error": "eval snippet did not compile", "compile_errors": errs or hb.get("compile_errors"),
                "source": rel, "channel": "bridge-eval", "seconds": round(time.time() - t0, 2)}
    compile_s = round(time.time() - t0, 2)
    res = call(project, "AgentKit.Eval.E_%s.Run" % sid, timeout=timeout)
    res["compile_seconds"] = compile_s
    res["channel"] = "bridge-eval"
    res["source"] = rel
    if not keep:
        _archive_snippet(root, rel)
    return res


def _archive_snippet(root, rel):
    dst = os.path.join(root, "Library", "AgentKit", "eval_archive")
    os.makedirs(dst, exist_ok=True)
    for suffix in ("", ".meta"):
        src = os.path.join(root, rel + suffix)
        if os.path.exists(src):
            shutil.move(src, os.path.join(dst, os.path.basename(src)))


# ============================================================================ resident headless editor
def start_headless(project, graphics=True, wait=True, timeout=300, version=None):
    """Launch a resident batch editor (no -quit, no -executeMethod): it stays up, holds the project
    (and a license seat) and serves the AgentKit bridge, so each call costs a request, not an
    editor boot. Refuses a locked project. Returns {"pid", "log", "cmd", "heartbeat"}."""
    info = ut_env.find_project(project)
    root = info["root"]
    ut_env.assert_unlocked(root)
    ut_env.install_agentkit(root)
    ed = ut_env.find_editor(version or info["version"] or ut_env.DEFAULT_VERSION)
    bd = bridge_dir(root)
    os.makedirs(bd, exist_ok=True)
    log = os.path.join(bd, "headless.log")
    cmd = [ed["binary"], "-batchmode"] + ([] if graphics else ["-nographics"]) + ["-projectPath", root, "-logFile", log]
    t0 = time.time()
    p = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    _PROCS[p.pid] = p
    handle = {"pid": p.pid, "log": log, "cmd": cmd, "started": t0, "project": root}
    with open(os.path.join(bd, "headless.json"), "w") as f:
        json.dump(handle, f, indent=1)
    if wait:
        while time.time() - t0 < timeout:
            hb = heartbeat(root)
            if hb and hb.get("pid") == p.pid and not hb.get("compiling") and not hb.get("updating") \
                    and time.time() - float(hb.get("time", 0)) < 5:
                handle["heartbeat"] = hb
                handle["boot_seconds"] = round(time.time() - t0, 2)
                return handle
            if p.poll() is not None:
                raise RuntimeError("headless editor exited with %s during boot, see %s" % (p.returncode, log))
            time.sleep(0.5)
        raise TimeoutError("headless editor did not serve the bridge within %ss (log %s)" % (timeout, log))
    return handle


def stop_headless(project, timeout=60):
    """Stop the resident editor this toolkit started: bridge Quit (EditorApplication.Exit), then
    SIGTERM to that PID only (never pkill by name: other agents' editors would die)."""
    bd = bridge_dir(project)
    hf = os.path.join(bd, "headless.json")
    if not os.path.isfile(hf):
        return {"stopped": False, "reason": "no headless.json: not started by ut_live"}
    with open(hf) as f:
        h = json.load(f)
    pid = h.get("pid")
    how = None
    if bridge_alive(project):
        r = call(project, "AgentKit.AgentBridge.Quit", timeout=30)
        how = "bridge Quit" if r.get("ok") else "bridge Quit failed: %s" % r.get("error")
    t0 = time.time()
    while _pid_alive(pid) and time.time() - t0 < timeout:
        time.sleep(0.25)
    if _pid_alive(pid):
        cmdline = subprocess.run(["ps", "-o", "command=", "-p", str(pid)], capture_output=True, text=True).stdout
        if h["project"] in cmdline:
            os.kill(pid, signal.SIGTERM)
            how = (how or "") + "; SIGTERM"
            t1 = time.time()
            while _pid_alive(pid) and time.time() - t1 < 20:
                time.sleep(0.25)
    os.rename(hf, hf + ".stopped-%d" % int(time.time()))
    return {"stopped": not _pid_alive(pid), "pid": pid, "how": how, "seconds": round(time.time() - t0, 2)}


# ============================================================================ Unity CLI + com.unity.pipeline
def find_cli():
    """The `unity` CLI binary: $UNITY_CLI, PATH, ~/.unity/bin/unity, or the portable copy in
    archive/tests/unity-expert/unity-cli/bin (downloaded and checksum-verified on 2026-09-24,
    1.0.0-beta.11, without the installer's shell-config edits). None when absent."""
    for c in (os.environ.get("UNITY_CLI"), shutil.which("unity"), os.path.expanduser("~/.unity/bin/unity"), PORTABLE_CLI):
        if c and os.path.isfile(c) and os.access(c, os.X_OK):
            return c
    return None


def cli(args, timeout=120, fmt="json", project=None):
    """Run `unity <args> --format json` and return its envelope (branch on "success" and the
    exit code, never on "data"; exit 8 = tests failed, 6 = no verdict, 4 = precondition)."""
    exe = find_cli()
    if not exe:
        return {"success": False, "errors": [{"code": "CLI_NOT_INSTALLED", "message": "unity CLI not found"}], "exit_code": None}
    cmd = [exe] + list(args)
    if project and "--project-path" not in cmd:
        cmd += ["--project-path", ut_env.find_project(project)["root"]]
    if fmt and "--format" not in cmd:
        cmd += ["--format", fmt]
    env = dict(os.environ, **CLI_ENV)
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        return {"success": False, "errors": [{"code": "TIMEOUT", "message": "unity %s timed out" % " ".join(args)}],
                "exit_code": None, "cmd": cmd}
    out = p.stdout.strip()
    env_out = None
    if out:
        try:
            env_out = json.loads(out)
        except ValueError:
            # ndjson or progress frames: last JSON object line wins
            for line in reversed(out.splitlines()):
                line = line.strip()
                if line.startswith("{"):
                    try:
                        env_out = json.loads(line)
                        break
                    except ValueError:
                        continue
    if env_out is None:
        env_out = {"success": p.returncode == 0, "raw": out[-2000:], "errors": []}
    env_out["exit_code"] = p.returncode
    env_out["stderr"] = p.stderr[-2000:]
    env_out["cmd"] = cmd
    return env_out


def cli_status(project=None):
    """`unity status`: GUI editors with a Pipeline server register here ("ready"); a batch editor
    launched without -quit serves commands but is NOT listed (unity-cli skill, verified caveat)."""
    return cli(["status"], project=project)


def pipeline_list():
    """`unity pipeline list`: reachable editors, package version, Safe Mode
    (data.summary.instancesInSafeMode, data.instances[].safeMode.detected, data.instances[].pid)."""
    return cli(["pipeline", "list"])


def pipeline_install(project, package_version=None):
    """Add com.unity.pipeline (experimental) to Packages/manifest.json from the Unity registry.
    The flag is --package-version, not --version (collides with the global -V)."""
    args = ["pipeline", "install", "--project-path", ut_env.find_project(project)["root"], "--non-interactive"]
    if package_version:
        args += ["--package-version", package_version]
    return cli(args, timeout=300)


def cli_command(name=None, params=None, project=None, timeout=60):
    """`unity command [name] [--param value ...]`. No name lists the editor's commands."""
    args = ["command"] + ([name] if name else [])
    for k, v in (params or {}).items():
        args += ["--" + k, str(v).lower() if isinstance(v, bool) else str(v)]
    if timeout:
        args += ["--timeout", str(int(timeout))]
    return cli(args, project=project, timeout=timeout + 30)


def cli_eval(code, project=None, timeout=60):
    """`unity command eval '<C#>'` when the editor exposes eval (discover with cli_command())."""
    return cli(["command", "eval", code, "--timeout", str(int(timeout))], project=project, timeout=timeout + 30)


# ============================================================================ channel choice
def channel(project):
    """Pick the channel for this project now.
      batch     no editor holds it: ut_run (one editor per job) or start_headless() for many calls
      bridge    an editor holds it and serves the AgentKit bridge: call()/eval()
      pipeline  an editor holds it, no bridge, but the Unity CLI reaches its Pipeline server
      blocked   an editor holds it and neither channel answers: install AgentKit and let it compile
                (GUI: the user focuses Unity once), fix compile errors (Safe Mode), or ask the user
    Never fall back to hand-editing .unity/.prefab/.asset YAML while an editor is reachable."""
    lock = ut_env.project_lock(project)
    info = ut_env.find_project(project)
    out = {"lock": lock, "has_agentkit": info["has_agentkit"], "cli": find_cli()}
    if not lock["locked"]:
        out.update(channel="batch", reason="no editor holds the project")
        return out
    if bridge_alive(project):
        hb = heartbeat(project)
        out.update(channel="bridge", reason="editor pid %s serves the AgentKit bridge (%s)" % (
            hb.get("pid"), "batch" if hb.get("batch") else "GUI"), heartbeat=hb)
        if hb.get("compile_failed"):
            out["warning"] = "the editor reports script compile errors: new code will not load until they are fixed"
        return out
    if out["cli"]:
        st = cli_command(project=project, timeout=15)
        if st.get("success"):
            out.update(channel="pipeline", reason="Unity CLI reaches the editor's Pipeline server")
            return out
        out["cli_error"] = (st.get("errors") or [{}])[0]
    out.update(channel="blocked", reason="an editor holds the project and no live channel answers: "
               "AgentKit not compiled in it (GUI: focus Unity once after install_agentkit), Safe Mode "
               "(compile errors), or a sandbox hiding the editor; ask the user before anything else")
    return out


if __name__ == "__main__":
    import sys
    print(json.dumps(channel(sys.argv[1]), indent=2, default=str))
