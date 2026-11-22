#!/usr/bin/env python3
"""
zb_launch: start, ping and stop ZBrush 2026 with the agent bridge, and run toolkit code in it.

Runs on the agent side (system python3), never inside ZBrush.

    import sys; sys.path.insert(0, "<skills/scenario-zbrush-expert/scripts>")
    import zb_launch as zl
    zl.start()                                    # spawn ZBrush with the bridge, wait for ping
    zl.run("result = zbc.get_active_tool_path()") # any code, main thread, `result` returned
    zl.call("zb_ops", "dynamesh", 256)            # a toolkit function, JSON result
    zl.hygiene()                                  # {"modules": [], "path": []} between calls
    zl.stop(save_to="/abs/out/head.ztl")          # versioned save, stop loop, quit

Shared-interpreter hygiene (every run/call): sys.path, sys.modules, stdout, stderr and the
working directory are left as found, toolkit modules are popped after use, and a stale copy of
a requested module is set aside so the call runs the file on disk (Maxon Style Guide). Not yet
run in ZBrush; offline tests exec the generated code in-process and check the state after.

    python3 zb_launch.py start|ping|status|stop [--save /abs/x.ztl]|run -c "result = 1"

Proven (2026-09-24, README "Agent bridge"): the launch line (ZBRUSH_PLUGIN_PATH plus
ZB_BRIDGE_AUTOSERVE=1 on the ZBrush binary), main-mode calls, `stop` ending the serve loop,
quitting ZHomePage with AppleScript, System Events answering "No" in the save dialog.
Not yet run in ZBrush as a module: start(), stop(), call(), the stall detector.

Startup stall seen at 05:30 on 2026-09-24. The screen had been locked since 04:29:09
(CGSSessionScreenLockedTime). The 05:20 launch ran under that lock and worked: v01 to v03
passed, and its screencapture shows only the lock-screen wallpaper. The 05:30 launch, under
the same lock, stalled: the ZBrush Activity log (Asset Directory/Logs/Activity/Activity
2026-09-24-05-30-32.txt) ends with the last default startup line, IPress "Zplugin:Misc
Utilities: Home Page", at 05:30:36; ~/Library/Logs/zb_bridge.log stayed empty (the plugin
never wrote "plugin loaded"); port 7788 never answered. So the lock alone does not explain
it, and the cause is unknown [verify]. start() therefore watches the startup stages. If
"plugin loaded" does not appear within `stall_timeout`, it raises ZBStall with a diagnosis
and, by default, terminates the process it spawned, because a hung ZBrush instance blocks
the next launch (ZBrush is single-instance).
"""

__version__ = "0.1"  # ZBrush Expert Skills v0.1 (2026-09-24)
import ast
import ctypes
import ctypes.util
import glob
import json
import os
import signal
import socket
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import zb_bridge  # noqa: E402  (proven client, same folder)

ZBRUSH_APP = "/Applications/Maxon ZBrush 2026/ZBrush.app"
ZBRUSH_BIN = ZBRUSH_APP + "/Contents/MacOS/ZBrush"
BUNDLE_ID = "net.maxon.zbrush"
PLUGIN_DIR = os.path.join(HERE, "zb_plugins")
LOGS = os.path.expanduser("~/Library/Logs")
BRIDGE_LOG = os.path.join(LOGS, "zb_bridge.log")
STDOUT_LOG = os.path.join(LOGS, "zbrush_stdout.log")
ASSET_GLOB = os.path.expanduser("~/Library/Preferences/Maxon/ZBrush_*")
DEFAULT_PORT = 7788


class ZBError(RuntimeError):
    pass


class ZBTimeout(ZBError):
    pass


class ZBStall(ZBError):
    pass


class ZBRemoteError(ZBError):
    def __init__(self, msg, traceback_text="", out=""):
        super().__init__(msg)
        self.traceback = traceback_text
        self.out = out


# --------------------------------------------------------------------------------------------
# Machine state
# --------------------------------------------------------------------------------------------

def screen_locked():
    """True / False from CGSessionCopyCurrentDictionary (CGSSessionScreenIsLocked), None if
    unknown. Verified on this Mac 2026-09-24 (returned True while locked)."""
    try:
        cg = ctypes.cdll.LoadLibrary(ctypes.util.find_library("CoreGraphics"))
        cf = ctypes.cdll.LoadLibrary(ctypes.util.find_library("CoreFoundation"))
        cg.CGSessionCopyCurrentDictionary.restype = ctypes.c_void_p
        cf.CFDictionaryGetValue.restype = ctypes.c_void_p
        cf.CFDictionaryGetValue.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        cf.CFStringCreateWithCString.restype = ctypes.c_void_p
        cf.CFStringCreateWithCString.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_uint32]
        cf.CFBooleanGetValue.argtypes = [ctypes.c_void_p]
        cf.CFBooleanGetValue.restype = ctypes.c_bool
        d = cg.CGSessionCopyCurrentDictionary()
        if not d:
            return None
        key = cf.CFStringCreateWithCString(None, b"CGSSessionScreenIsLocked", 0x08000100)
        v = cf.CFDictionaryGetValue(d, key)
        return bool(cf.CFBooleanGetValue(v)) if v else False
    except Exception:
        return None


def pids(pattern="ZBrush.app/Contents/MacOS/ZBrush"):
    r = subprocess.run(["pgrep", "-f", pattern], capture_output=True, text=True)
    return [int(x) for x in r.stdout.split() if x.strip().isdigit() and int(x) != os.getpid()]


def is_running():
    """True when a ZBrush process exists (with or without the bridge)."""
    return bool(pids())


def homepage_running():
    return bool(pids("ZHomePage.app/Contents/MacOS/ZHomePage"))


def port_open(port=DEFAULT_PORT, timeout=0.5):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout):
            return True
    except OSError:
        return False


def _tail(path, n=8):
    try:
        with open(path, "r", errors="ignore") as fh:
            return [ln.rstrip("\n") for ln in fh.readlines()[-n:]]
    except OSError:
        return None


def activity_logs():
    files = []
    for d in glob.glob(ASSET_GLOB):
        files += glob.glob(os.path.join(d, "Logs", "Activity", "Activity *.txt"))
    return sorted(files, key=os.path.getmtime)


def diagnose(port=DEFAULT_PORT):
    """Everything useful when the bridge does not answer."""
    act = activity_logs()
    return {
        "zbrush_pids": pids(), "port_open": port_open(port), "screen_locked": screen_locked(),
        "homepage_running": homepage_running(), "bridge_log_tail": _tail(BRIDGE_LOG),
        "stdout_tail": _tail(STDOUT_LOG), "activity_file": act[-1] if act else None,
        "activity_tail": _tail(act[-1], 6) if act else None,
    }


# --------------------------------------------------------------------------------------------
# Talking to the bridge
# --------------------------------------------------------------------------------------------

def send(code, mode="main", port=DEFAULT_PORT, timeout=120):
    """Raw bridge call (zb_bridge.send) with readable errors."""
    try:
        reply = zb_bridge.send(code, mode, port, timeout)
    except ConnectionRefusedError:
        raise ZBError(f"bridge not answering on port {port}: start ZBrush with zb_launch.start() "
                      f"({json.dumps(diagnose(port))[:400]})")
    except socket.timeout:
        raise ZBTimeout(f"no reply within {timeout + 5} s. The main thread is busy (long "
                        "operation or a modal dialog). The queued code still runs when the "
                        "main thread frees: ping before sending anything else")
    if not reply.get("ok") and "timeout: is the main-thread Serve loop running" in reply.get("error", ""):
        raise ZBTimeout(f"bridge queued the code but the main thread did not pick it up within "
                        f"{timeout} s (serve loop stopped, modal dialog, or long operation). "
                        "The code may still run later")
    return reply


SKILLS_ROOT = os.path.dirname(os.path.dirname(HERE))


def toolkit_dirs():
    """This skill's scripts folder and every other scenario-zbrush-* skill's scripts folder: the
    modules the bridge prelude owns (imports, pops, reports). Plugin subfolders such as
    zb_plugins (the bridge server) are not included."""
    found = sorted(glob.glob(os.path.join(SKILLS_ROOT, "scenario-zbrush-*", "scripts")))
    return list(dict.fromkeys(os.path.abspath(d) for d in [HERE] + found))


# Shared-interpreter hygiene (Maxon Style Guide: leave sys.path, sys.modules, stdout and the
# working directory as found; pop helper modules after use, ex_mod_curve_lightning). ZBrush
# has ONE embedded interpreter for the whole session, so anything a call leaves behind stays
# until restart. The prelude snapshots the state, _zb_restore() puts it back and pops every
# toolkit module the call imported (also lazy imports inside functions). The epilogue calls
# it; the bridge server calls it again after an error (idempotent). Names _zb_sys, _zb_json
# and _zb_il stay bound: other skills' preludes use them.
_HYGIENE = r'''import sys as _zb_sys, json as _zb_json, importlib as _zb_il, os as _zb_os
_zb_own = set(__OWN__)
def _zb_owned(_k, _m, _own=_zb_own, _os=_zb_os):
    _f = getattr(_m, "__file__", None) or ""
    return bool(_f) and _os.path.dirname(_os.path.abspath(_f)) in _own
_zb_state = {"path": list(_zb_sys.path), "modules": set(_zb_sys.modules),
             "cwd": _zb_os.getcwd(), "stdout": _zb_sys.stdout, "stderr": _zb_sys.stderr,
             "evicted": {}, "done": None}
def _zb_restore(_st=_zb_state, _sys=_zb_sys, _os=_zb_os, _owned=_zb_owned):
    if _st["done"] is not None:
        return _st["done"]
    _sys.path[:] = _st["path"]
    for _k in [k for k in list(_sys.modules) if k not in _st["modules"]]:
        _m = _sys.modules.get(_k)
        if (_k.startswith("zb_") and not _k.startswith("zb_bridge_server")) or _owned(_k, _m):
            _sys.modules.pop(_k, None)
    _sys.modules.update(_st["evicted"])
    if _sys.stdout is not _st["stdout"]:
        _sys.stdout = _st["stdout"]
    if _sys.stderr is not _st["stderr"]:
        _sys.stderr = _st["stderr"]
    try:
        if _os.getcwd() != _st["cwd"]:
            _os.chdir(_st["cwd"])
    except OSError:
        pass
    _st["done"] = {"reloaded": sorted(_st["evicted"])} if _st["evicted"] else {}
    return _st["done"]
'''


def _prelude(modules, dirs=None):
    """Hygiene definitions, then (when modules are named) the import block: a stale copy of
    a named module already in sys.modules is set aside so the call runs the file on disk
    (restored afterwards), the folders go on sys.path only for the import, and the modules
    the import added are popped again before `code` runs (as before 2026-09-24)."""
    dirs = [os.path.abspath(d) for d in (dirs or [HERE])]
    lines = [_HYGIENE.replace("__OWN__", repr(sorted(set(toolkit_dirs()) | set(dirs)))).rstrip()]
    if modules:
        lines += [f"for _zb_k in {list(modules)!r}:",
                  "    if _zb_k in _zb_sys.modules:",
                  "        _zb_state['evicted'][_zb_k] = _zb_sys.modules.pop(_zb_k)",
                  f"_zb_dirs = {dirs!r}", "_zb_before = set(_zb_sys.modules)",
                  "_zb_sys.path[0:0] = _zb_dirs", "try:"]
        lines += [f"    {m} = _zb_il.import_module({m!r})" for m in modules]
        lines += ["finally:", "    _zb_sys.path[:] = _zb_state['path']",
                  "    for _zb_k in set(_zb_sys.modules) - _zb_before:",
                  "        if _zb_k.startswith('zb_') or _zb_owned(_zb_k, _zb_sys.modules.get(_zb_k)):",
                  "            _zb_sys.modules.pop(_zb_k, None)"]
    return "\n".join(lines) + "\n"


_EPILOGUE = ("\n_zb_hyg = _zb_restore()\n"
             "result = _zb_json.dumps(dict({'value': globals().get('result')}, "
             "**({'hygiene': _zb_hyg} if _zb_hyg else {})), default=repr)\n")


def build_code(code, modules=(), dirs=None):
    """The exact source sent to ZBrush: the hygiene prelude, toolkit modules imported by path
    (from `dirs`, default this skill's scripts folder) without leaving them on sys.path or in
    sys.modules, then `code`, then _zb_restore() and the `result` value JSON-encoded."""
    for m in modules:
        if not m.isidentifier():
            raise ValueError(f"bad module name {m!r}")
    return _prelude(tuple(modules), dirs) + code + _EPILOGUE


def _decode(reply):
    if not reply.get("ok"):
        err = reply.get("error", "")
        last = err.strip().splitlines()[-1] if err.strip() else "remote error"
        raise ZBRemoteError(last, err, reply.get("out", ""))
    raw = reply.get("result")
    try:
        obj = json.loads(ast.literal_eval(raw))
    except (ValueError, SyntaxError, TypeError):
        return raw, None
    if isinstance(obj, dict) and "value" in obj:
        return obj["value"], obj.get("hygiene") or None
    return raw, None


def decode_reply(reply):
    return _decode(reply)[0]


def run(code, modules=(), port=DEFAULT_PORT, timeout=120, full=False, dirs=None):
    """Run `code` on ZBrush's main thread; it sees `zbc` and the named toolkit modules and
    returns whatever it assigns to `result` (JSON-able, else repr). full=True returns
    {"value", "out"} plus "hygiene" when a stale toolkit module had to be set aside."""
    reply = send(build_code(code, modules, dirs), "main", port, timeout)
    value, hyg = _decode(reply)
    if not full:
        return value
    res = {"value": value, "out": reply.get("out", "")}
    if hyg:
        res["hygiene"] = hyg
    return res


_PROBE = r'''import sys as _s, os as _o
_d = set(__DIRS__)
def _own(m):
    f = getattr(m, "__file__", None) or ""
    return bool(f) and _o.path.dirname(_o.path.abspath(f)) in _d
result = {"modules": sorted(k for k, m in list(_s.modules.items()) if _own(m)),
          "path": [p for p in _s.path if _o.path.abspath(p) in _d]}
'''


def hygiene(port=DEFAULT_PORT, timeout=15):
    """What ZBrush's shared interpreter holds of the toolkit right now: toolkit modules in
    sys.modules and toolkit folders on sys.path. Both lists must be empty between calls;
    anything listed leaked from code sent outside zb_launch.run (fix: purge())."""
    return run(_PROBE.replace("__DIRS__", repr(toolkit_dirs())), port=port, timeout=timeout)


def purge(port=DEFAULT_PORT, timeout=15):
    """Remove leaked toolkit modules and folders from ZBrush's interpreter. Sent raw (no
    prelude), because the prelude would restore the leak it snapshotted."""
    code = (_PROBE.replace("__DIRS__", repr(toolkit_dirs())) +
            "for _k in result['modules']:\n    _s.modules.pop(_k, None)\n"
            "_s.path[:] = [p for p in _s.path if _o.path.abspath(p) not in _d]\n")
    reply = send(code, "main", port, timeout)
    if not reply.get("ok"):
        raise ZBRemoteError("purge failed", reply.get("error", ""), reply.get("out", ""))
    try:
        return {"removed": ast.literal_eval(reply.get("result"))}
    except (ValueError, SyntaxError):
        return {"removed": reply.get("result")}


def call(module, func, *args, port=DEFAULT_PORT, timeout=120, **kwargs):
    """module.func(*args, **kwargs) inside ZBrush; args must be JSON-able."""
    code = (f"result = {module}.{func}(*_zb_json.loads({json.dumps(list(args))!r}), "
            f"**_zb_json.loads({json.dumps(kwargs)!r}))")
    return run(code, (module,), port, timeout)


def ping(port=DEFAULT_PORT, timeout=10):
    t = time.time()
    v = run("result = zbc.zbrush_info(0)", port=port, timeout=timeout)
    return {"ok": True, "version": v, "latency_s": round(time.time() - t, 3)}


# --------------------------------------------------------------------------------------------
# Start and stop
# --------------------------------------------------------------------------------------------

def build_env(port=DEFAULT_PORT, plugin_dir=PLUGIN_DIR, extra_env=None):
    env = os.environ.copy()
    prev = env.get("ZBRUSH_PLUGIN_PATH")
    env["ZBRUSH_PLUGIN_PATH"] = plugin_dir if not prev else plugin_dir + os.pathsep + prev
    env["ZB_BRIDGE_AUTOSERVE"] = "1"
    env["ZB_BRIDGE_PORT"] = str(port)
    env.update(extra_env or {})
    return env


def quit_homepage():
    """The Home Page runs as a separate ZHomePage process over the canvas (README)."""
    if not homepage_running():
        return False
    subprocess.run(["osascript", "-e", 'tell application "ZHomePage" to quit'],
                   capture_output=True, timeout=15)
    return True


def _bridge_log_size():
    try:
        return os.path.getsize(BRIDGE_LOG)
    except OSError:
        return 0


def _bridge_log_since(offset):
    try:
        with open(BRIDGE_LOG, "r", errors="ignore") as fh:
            fh.seek(offset)
            return fh.read()
    except OSError:
        return ""


def start(port=DEFAULT_PORT, plugin_dir=PLUGIN_DIR, timeout=120, stall_timeout=60,
          kill_on_stall=True, quit_home=True, extra_env=None):
    """Spawn ZBrush with the bridge, wait for "plugin loaded", the port and a ping, then quit
    the ZHomePage helper. Returns a dict. Refuses to start a second instance: if ZBrush is
    already running it pings it and returns, or raises when it runs without the bridge."""
    t0 = time.time()
    if is_running():
        if port_open(port):
            p = ping(port)
            return {"status": "already running", "pids": pids(), **p}
        raise ZBError("ZBrush is running without the bridge on this port. ZBrush is "
                      "single-instance: quit it (save first) before zb_launch.start()")
    if not os.path.exists(ZBRUSH_BIN):
        raise ZBError(f"ZBrush binary not found: {ZBRUSH_BIN}")
    locked = screen_locked()
    offset = _bridge_log_size()
    os.makedirs(LOGS, exist_ok=True)
    with open(STDOUT_LOG, "a") as out:   # ZBrush keeps its own copy of the descriptor
        out.write(f"\n--- zb_launch.start {time.strftime('%Y-%m-%d %H:%M:%S')} locked={locked}\n")
        out.flush()
        proc = subprocess.Popen([ZBRUSH_BIN], env=build_env(port, plugin_dir, extra_env),
                                stdout=out, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                                start_new_session=True)
    stages = {"spawned": 0.0}
    try:
        while True:
            el = time.time() - t0
            if proc.poll() is not None:
                raise ZBError(f"ZBrush exited with code {proc.returncode} during startup "
                              f"({json.dumps(diagnose(port))[:600]})")
            if "loaded" not in stages and "plugin loaded" in _bridge_log_since(offset):
                stages["loaded"] = round(el, 1)
            if "loaded" in stages and port_open(port):
                try:
                    p = ping(port, timeout=10)
                    stages["ping"] = round(time.time() - t0, 1)
                    break
                except ZBError:
                    pass
            if "loaded" not in stages and el > stall_timeout:
                raise ZBStall(f"no 'plugin loaded' in {BRIDGE_LOG} after {stall_timeout} s: "
                              "startup stalled (see the 05:30 case in this module's docstring)")
            if el > timeout:
                raise ZBTimeout(f"bridge not answering after {timeout} s")
            time.sleep(1.0)
    except ZBError as e:
        diag = diagnose(port)
        if kill_on_stall and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(15)
            except subprocess.TimeoutExpired:
                proc.kill()
            diag["terminated_spawned_pid"] = proc.pid
        e.args = (f"{e.args[0]} | stages {stages} | diagnosis {json.dumps(diag)}",)
        raise
    homepage = False
    if quit_home:
        for _ in range(10):  # the helper can appear a little after the ping
            if quit_homepage():
                homepage = True
                break
            time.sleep(0.5)
    return {"status": "started", "pid": proc.pid, "port": port, "version": p["version"],
            "screen_locked": locked, "stages_s": stages, "homepage_quit": homepage,
            "seconds": round(time.time() - t0, 1)}


_DIALOG_NO = '''
tell application "System Events"
  if exists process "ZBrush" then
    tell process "ZBrush"
      repeat with w in windows
        try
          if exists button "No" of w then
            click button "No" of w
            return "clicked No"
          end if
        end try
      end repeat
    end tell
  end if
end tell
return "no dialog found"
'''


def _wait_exit(seconds):
    end = time.time() + seconds
    while time.time() < end:
        if not is_running():
            return True
        time.sleep(0.5)
    return not is_running()


def stop(save_to=None, port=DEFAULT_PORT, timeout=60, force=True):
    """Save (optional), stop the serve loop, quit ZBrush.

    save_to: a .ZTL path; saved with zb_ops.save_ztl (versioned: never overwrites). If the
    save fails, ZBrush is left running (no work is thrown away) and the error is returned.
    Quit: AppleScript quit, then System Events clicks "No" in the save-changes dialog when
    the screen is unlocked (UI scripting needs an unlocked session [added]); when locked or
    still running, SIGTERM, then SIGKILL if force (only after the save succeeded)."""
    rep = {"was_running": is_running(), "screen_locked": screen_locked()}
    if not rep["was_running"]:
        return rep
    if save_to:
        try:
            rep["saved"] = call("zb_ops", "save_ztl", save_to, port=port, timeout=timeout)
        except ZBError as e:
            rep["save_error"] = str(e)
            rep["action"] = "left running because the save failed"
            return rep
    try:
        rep["loop"] = send("stop", "main", port, timeout=15).get("out")
    except ZBError as e:
        rep["loop_error"] = str(e)
    subprocess.run(["osascript", "-e", "ignoring application responses", "-e",
                    f'tell application id "{BUNDLE_ID}" to quit', "-e", "end ignoring"],
                   capture_output=True, timeout=15)
    rep["quit_sent"] = True
    if _wait_exit(5):
        rep["exit"] = "clean"
    elif not rep["screen_locked"]:
        r = subprocess.run(["osascript", "-e", _DIALOG_NO], capture_output=True, text=True,
                           timeout=20)
        rep["dialog"] = (r.stdout or r.stderr).strip()
        if _wait_exit(15):
            rep["exit"] = "clean after dialog"
    if is_running():
        for pid in pids():
            os.kill(pid, signal.SIGTERM)
        rep["sigterm"] = True
        if not _wait_exit(15) and force:
            for pid in pids():
                os.kill(pid, signal.SIGKILL)
            rep["sigkill"] = True
            _wait_exit(5)
        rep.setdefault("exit", "terminated")
    if homepage_running():
        quit_homepage()
    rep["running_after"] = is_running()
    return rep


def status(port=DEFAULT_PORT):
    d = diagnose(port)
    if d["port_open"]:
        try:
            d["ping"] = ping(port)
        except ZBError as e:
            d["ping_error"] = str(e)
    return d


def _cli(argv=None):
    import argparse
    ap = argparse.ArgumentParser(description="ZBrush bridge session control")
    ap.add_argument("cmd", choices=("start", "ping", "status", "stop", "run"))
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--timeout", type=int, default=120)
    ap.add_argument("--save")
    ap.add_argument("-c", "--code")
    ap.add_argument("--json")
    ns = ap.parse_args(argv)
    try:
        if ns.cmd == "start":
            res = start(ns.port, timeout=ns.timeout)
        elif ns.cmd == "ping":
            res = ping(ns.port)
        elif ns.cmd == "status":
            res = status(ns.port)
        elif ns.cmd == "stop":
            res = stop(ns.save, ns.port)
        else:
            res = run(ns.code, port=ns.port, timeout=ns.timeout, full=True)
        ok = True
    except ZBError as e:
        res, ok = {"error": type(e).__name__, "message": str(e)}, False
    text = json.dumps(res, indent=1, default=repr)
    if ns.json:
        os.makedirs(os.path.dirname(os.path.abspath(ns.json)), exist_ok=True)
        with open(ns.json, "w") as fh:
            fh.write(text)
    print(text)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(_cli())
