"""
mx_bridge_server: runs INSIDE a live GUI Maya session. Opens a loopback-only Python
commandPort and executes agent code exchanged through files, on Maya's main thread,
inside one undo chunk per call. The client is mx_bridge.py (runs outside Maya).

STATUS: not yet run in Maya (written 2026-09-24, Maya 2027 not installed yet).

Install, pick one:
  a) paste once in the Script Editor, Python tab (Ctrl+Enter):
       import sys; sys.path.insert(0, "<skill>/scripts")
       import mx_bridge_server; mx_bridge_server.start()
  b) userSetup.py in ~/Library/Preferences/Autodesk/maya/2027/scripts/ (runs before the UI
     exists, so defer the start until Maya is idle):
       import maya.utils
       def _mx_bridge_boot():
           import sys; sys.path.insert(0, "<skill>/scripts")
           import mx_bridge_server; mx_bridge_server.start()
       maya.utils.executeDeferred(_mx_bridge_boot)
Stop when done: mx_bridge_server.stop()

Protocol (why files): the commandPort buffer defaults to 4096 characters (longer commands
close the connection, longer results are replaced by an error) and Python sent to Maya
returns the result of a single statement only (Maya 2027 Help: commandPort command;
Python in Maya, current limitations). So:
  1. the client writes <root>/<id>.py (UTF-8) and optionally <id>.opts.json
  2. the client sends ONE short line:  _mx_bridge_run("<id>")
  3. that call queues handle(<id>) with maya.utils.executeDeferred and returns at once;
     handle() writes <id>.running, execs the code in a persistent namespace (cmds, mel,
     om pre-imported) inside the undo chunk "mx:<id>", captures stdout/stderr, reads the
     variable `result`, and writes <id>.json atomically
  4. the client polls <id>.json (timeout, error path with traceback)
What comes back (every record, success or not): ok, result, stdout, stderr, maya_messages
(Maya's own warnings, errors and stack traces from commands, e.g. cmds.warning or a MEL
error, caught with OpenMaya MCommandMessage.addCommandOutputCallback [verify callback
arguments on 2027]), error, traceback, seconds, scene, scene_modified. While a job runs,
<id>.out receives stdout and stderr as they are written, so a client that times out can
still read what the job printed. An agent that cannot read Maya's output is blind
(chadrik, maya-mcp-server README).
Exchange root: $MX_BRIDGE_DIR, else /tmp/mx_bridge_<uid> (same path for Maya and the agent,
whatever TMPDIR each process has), mode 0700, refused if owned by another user.

Security stance (read before starting it):
  - The port binds 127.0.0.1 (name "127.0.0.1:<port>") [verify with
    lsof -nP -iTCP:<port> -sTCP:LISTEN that it is not listening on *].
  - There is NO authentication. Maya's own help: INET command ports need no user
    identification and run every command, including system(), with the Maya user's
    permissions. Any local process can send Python to it. Use only on a personal machine,
    never forward the port, and stop() it when the session ends.
  - start(unix_socket="/Users/<me>/.mx_bridge.sock") uses a UNIX socket instead, which
    file permissions can restrict to the user [verify the permissions Maya sets].
  - Agent code must never open modal UI (confirmDialog, promptDialog, fileDialog2,
    input(), pdb): it blocks Maya's main thread and the bridge. The client refuses it.
"""

__version__ = "0.1"  # Maya Expert Skills v0.1 (2026-09-24)
import builtins
import contextlib
import functools
import io
import json
import linecache
import os
import re
import sys
import threading
import time
import traceback

DEFAULT_PORT = 7001
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
_ID_RE = re.compile(r"^[A-Za-z0-9_\-]{1,80}$")
_STATE = {"name": None, "root": None, "ns": None, "started": None, "jobs": 0}
MAX_CAPTURE = 200000   # characters of stdout/stderr kept per job
MAX_MESSAGES = 500     # Maya warnings/errors kept per job
CAPTURED_KINDS = ("warning", "error", "stacktrace")   # prints already come through stdout


def default_root():
    env = os.environ.get("MX_BRIDGE_DIR")
    if env:
        return env
    uid = str(os.getuid()) if hasattr(os, "getuid") else os.environ.get("USERNAME", "user")
    base = "/tmp" if os.name != "nt" else os.environ.get("TEMP", ".")
    return os.path.join(base, "mx_bridge_%s" % uid)


def prepare_root(root):
    os.makedirs(root, mode=0o700, exist_ok=True)
    if hasattr(os, "getuid") and os.stat(root).st_uid != os.getuid():
        raise RuntimeError("bridge dir %s is owned by another user; refusing" % root)
    try:
        os.chmod(root, 0o700)
    except OSError:
        pass
    return root


def _write_json_atomic(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, default=_jsonable_default)
    os.replace(tmp, path)


def _jsonable_default(obj):
    try:
        return list(obj)          # MMatrix, MVector, MPoint, OpenMaya arrays, sets, tuples
    except TypeError:
        return repr(obj)


def _jsonable(value):
    try:
        json.dumps(value)
        return value
    except (TypeError, ValueError):
        return json.loads(json.dumps(value, default=_jsonable_default))


class _Tee(io.TextIOBase):
    """Capture a stream and still echo it to Maya's Script Editor, so the user sees
    what the agent does in their session. `live` (an open text file) also gets every
    write at once, for clients that time out before the record exists."""

    def __init__(self, original, live=None):
        super().__init__()
        self.original = original
        self.buf = io.StringIO()
        self.live = live

    def write(self, s):
        self.buf.write(s)
        if self.live is not None:
            try:
                self.live.write(s)
                self.live.flush()
            except Exception:
                self.live = None
        if self.original is not None:
            try:
                self.original.write(s)
            except Exception:
                pass
        return len(s)

    def flush(self):
        if self.original is not None:
            try:
                self.original.flush()
            except Exception:
                pass


def _message_kinds(om):
    kinds = {}
    for attr in ("kHistory", "kDisplay", "kInfo", "kWarning", "kError", "kResult", "kStackTrace"):
        val = getattr(om.MCommandMessage, attr, None)
        if val is not None:
            kinds[val] = attr[1:].lower()
    return kinds


def start_message_capture(sink, kinds=CAPTURED_KINDS, limit=MAX_MESSAGES):
    """Append Maya's command output of the given kinds to `sink` as {"type", "text"} and
    return the callback id (None when OpenMaya or the callback is unavailable, e.g. in a
    fake or very old session). Remove it with stop_message_capture(id)."""
    try:
        import maya.api.OpenMaya as om
        names = _message_kinds(om)
    except Exception:
        return None

    def _cb(*args):                      # (message, messageType, clientData) [verify order]
        if len(sink) >= limit:
            return
        kind = names.get(args[1], str(args[1])) if len(args) > 1 else "unknown"
        if kind in kinds:
            sink.append({"type": kind, "text": str(args[0]).rstrip()})

    try:
        return om.MCommandMessage.addCommandOutputCallback(_cb)
    except Exception:
        return None


def stop_message_capture(cb_id):
    if cb_id is None:
        return
    try:
        import maya.api.OpenMaya as om
        om.MMessage.removeCallback(cb_id)
    except Exception:
        pass


def _namespace():
    if _STATE["ns"] is None:
        ns = {"__name__": "__mx_agent__", "__builtins__": builtins}
        try:
            import maya.cmds as cmds
            import maya.mel as mel
            import maya.api.OpenMaya as om
            ns.update(cmds=cmds, mel=mel, om=om)
        except ImportError:
            pass
        _STATE["ns"] = ns
    return _STATE["ns"]


def reset_namespace():
    """Forget every name the agent defined in earlier calls."""
    _STATE["ns"] = None


def handle(job_id, root=None, undo=None, echo=True):
    """Execute <root>/<job_id>.py and write <root>/<job_id>.json. Must run on the main
    thread; callable directly (tests use it under mayapy without a commandPort).
    Returns the record written."""
    if not _ID_RE.match(job_id or ""):
        raise ValueError("bad job id %r" % (job_id,))
    if threading.current_thread() is not threading.main_thread():
        import maya.utils
        return maya.utils.executeInMainThreadWithResult(handle, job_id, root, undo, echo)
    root = root or _STATE["root"] or default_root()
    code_path = os.path.join(root, job_id + ".py")
    out_path = os.path.join(root, job_id + ".json")
    opts = {}
    opts_path = os.path.join(root, job_id + ".opts.json")
    if os.path.isfile(opts_path):
        with open(opts_path) as f:
            opts = json.load(f)
    if undo is None:
        undo = bool(opts.get("undo", True))
    with open(os.path.join(root, job_id + ".running"), "w") as f:
        f.write(str(time.time()))
    t0 = time.time()
    rec = {"id": job_id, "ok": False, "result": None, "stdout": "", "stderr": "", "maya_messages": []}
    try:
        with open(code_path, encoding="utf-8") as f:
            code = f.read()
    except OSError as exc:
        rec.update(error="cannot read job file: %s" % exc)
        _write_json_atomic(out_path, rec)
        return rec
    filename = "<mx:%s>" % job_id
    linecache.cache[filename] = (len(code), None, code.splitlines(True), filename)  # tracebacks show source
    ns = _namespace()
    ns["result"] = None
    ns["MX_JOB_ID"] = job_id
    try:
        live = open(os.path.join(root, job_id + ".out"), "w", encoding="utf-8")  # noqa: SIM115 (optional, closed in the finally below)
    except OSError:
        live = None
    out = _Tee(sys.stdout if echo else None, live)
    err = _Tee(sys.stderr if echo else None, live)
    messages = []
    cb_id = start_message_capture(messages)
    cmds = ns.get("cmds")
    chunk = False
    try:
        if undo and cmds is not None:
            cmds.undoInfo(openChunk=True, chunkName="mx:%s" % job_id)
            chunk = True
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            exec(compile(code, filename, "exec"), ns)
        rec["ok"] = True
        rec["result"] = _jsonable(ns.get("result"))
    except BaseException as exc:   # SystemExit included: never let agent code exit Maya
        rec["error"] = "%s: %s" % (type(exc).__name__, exc)
        rec["traceback"] = traceback.format_exc()
    finally:
        if chunk:
            try:
                cmds.undoInfo(closeChunk=True)   # always close, an open chunk corrupts undo
            except Exception:
                pass
        stop_message_capture(cb_id)
        if live is not None:
            try:
                live.close()
            except Exception:
                pass
    rec["stdout"] = out.buf.getvalue()[-MAX_CAPTURE:]
    rec["stderr"] = err.buf.getvalue()[-MAX_CAPTURE:]
    # the stderr echo into the Script Editor can come back through the callback as an error:
    # keep only messages that are not already in the captured stderr
    rec["maya_messages"] = [m for m in messages if m["text"] and m["text"] not in rec["stderr"]]
    rec["seconds"] = round(time.time() - t0, 3)
    if cmds is not None:
        try:
            rec["scene"] = cmds.file(q=True, sceneName=True)
            rec["scene_modified"] = cmds.file(q=True, modified=True)
        except Exception:
            pass
    _write_json_atomic(out_path, rec)
    _STATE["jobs"] += 1
    try:
        with open(os.path.join(root, "bridge.log"), "a") as f:
            f.write("%s\t%s\t%s\t%.3fs\t%d maya messages\n" % (
                time.strftime("%Y-%m-%d %H:%M:%S"), job_id, "ok" if rec["ok"] else "ERROR", rec["seconds"],
                len(rec["maya_messages"])))
    except OSError:
        pass
    return rec


def _mx_bridge_run(job_id, deferred=True, root=None):
    """The one-line entry point the client sends. Returns a short status string."""
    if not _ID_RE.match(job_id or ""):
        return "error:bad-id"
    if deferred:
        import maya.utils
        maya.utils.executeDeferred(functools.partial(handle, job_id, root))
        return "queued:%s" % job_id
    rec = handle(job_id, root)
    return ("done:" if rec.get("ok") else "error:") + job_id


def _mx_bridge_ping():
    return "pong"


def _mx_bridge_info():
    return json.dumps(info())


def info():
    d = {"name": _STATE["name"], "root": _STATE["root"], "started": _STATE["started"],
         "jobs": _STATE["jobs"], "pid": os.getpid(), "scripts": SCRIPTS_DIR}
    try:
        import maya.cmds as cmds
        d["maya_version"] = cmds.about(version=True)
        d["batch"] = cmds.about(batch=True)
        d["scene"] = cmds.file(q=True, sceneName=True)
    except Exception:
        pass
    return d


def _install_entry_points():
    import __main__
    for fn in (_mx_bridge_run, _mx_bridge_ping, _mx_bridge_info):
        setattr(builtins, fn.__name__, fn)     # resolves whatever namespace the port uses
        setattr(__main__, fn.__name__, fn)


def start(port=DEFAULT_PORT, root=None, host="127.0.0.1", unix_socket=None,
          buffer_size=16384, echo_output=False):
    """Open the command port and install the entry points. Returns info()."""
    import maya.cmds as cmds
    root = prepare_root(root or default_root())
    if SCRIPTS_DIR not in sys.path:
        sys.path.insert(0, SCRIPTS_DIR)     # so jobs can `import mx_review` etc.
    name = unix_socket or "%s:%d" % (host, port)
    open_ports = cmds.commandPort(q=True, listPorts=True) or []
    if name in open_ports:
        cmds.commandPort(name=name, close=True)          # stale port from an earlier start
    cmds.commandPort(name=name, sourceType="python", noreturn=False,
                     echoOutput=echo_output, bufferSize=buffer_size)
    _install_entry_points()
    _STATE.update(name=name, root=root, started=time.strftime("%Y-%m-%d %H:%M:%S"))
    d = info()
    _write_json_atomic(os.path.join(root, "server.json"), d)
    print("mx_bridge_server: listening on %s, exchange dir %s (no auth: stop() when done)"
          % (name, root))
    return d


def stop():
    """Close the command port opened by start()."""
    import maya.cmds as cmds
    name = _STATE.get("name")
    if name and name in (cmds.commandPort(q=True, listPorts=True) or []):
        cmds.commandPort(name=name, close=True)
    if _STATE.get("root"):
        d = info()
        d["stopped"] = time.strftime("%Y-%m-%d %H:%M:%S")
        _write_json_atomic(os.path.join(_STATE["root"], "server.json"), d)
    _STATE["name"] = None
    print("mx_bridge_server: stopped")


def status():
    import maya.cmds as cmds
    d = info()
    d["open_ports"] = cmds.commandPort(q=True, listPorts=True) or []
    return d
