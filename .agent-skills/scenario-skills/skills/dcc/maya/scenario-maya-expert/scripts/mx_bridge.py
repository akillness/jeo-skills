"""
mx_bridge: client for mx_bridge_server (which runs inside a live GUI Maya). Runs in any
Python 3 outside Maya (the agent's shell), no dependencies.

STATUS: not yet run against Maya (written 2026-09-24). The protocol logic is exercised
offline by tests/code/maya-expert/test_mx_bridge_offline.py with a fake command port.

  import sys; sys.path.insert(0, "<skill>/scripts"); import mx_bridge
  b = mx_bridge.Bridge()                        # 127.0.0.1:7001, /tmp/mx_bridge_<uid>
  b.ping()                                      # full round trip, returns Maya version + scene
  r = b.run('''
  cube = cmds.polyCube(name="agentCube#")[0]    # multi-statement code, any length
  print("made", cube)
  result = {"cube": cube, "faces": cmds.polyEvaluate(cube, face=True)}
  ''')
  r["ok"], r["result"], r["stdout"], r["stderr"], r["maya_messages"], r.get("traceback")
  print(mx_bridge.format_record(r))             # the same, as text an agent reads at a glance
  b.call("mx_review", "playblast", path="/abs/out/shot", start=1, end=48)   # module function
  b.call("mx_audit", "audit", "agentCube1", reload=True)                    # reload edited module

Every record returned by run(), call(), ping() and wait() has the keys ok, result, stdout,
stderr and maya_messages (Maya's warnings, errors and stack traces from commands), also
when the call was refused, could not connect or timed out; on a timeout, stdout holds what
the job printed so far (read from <id>.out) and partial_output is True. Read them after
every call: a Maya warning with ok=True is still a finding.

Shell:
  python3 mx_bridge.py ping | info | run FILE.py | exec "CODE"   [--port N] [--timeout S] [--text]

Guards (from the MCP bridge designs in notes/scripting): code that opens modal UI or waits
for stdin is refused (it blocks Maya's main thread); code that replaces the scene with
force=True is refused unless allow_scene_replace=True (check cmds.file(q=True,
modified=True) first, as GG_MayaMCP does). One undo chunk per call, so the user can undo
an agent step with one Ctrl+Z.
"""

__version__ = "0.1"  # Maya Expert Skills v0.1 (2026-09-24)
import json
import os
import re
import socket
import sys
import time
import uuid

DEFAULT_PORT = 7001

_MODAL_PATTERNS = [
    (r"\binput\s*\(", "input() opens a modal dialog in GUI Maya"),
    (r"\braw_input\s*\(", "raw_input is Python 2 and modal"),
    (r"\bpdb\b|\bbreakpoint\s*\(", "pdb opens input dialogs in GUI Maya"),
    (r"\bconfirmDialog\b", "confirmDialog waits for a click"),
    (r"\bpromptDialog\b", "promptDialog waits for typing"),
    (r"\blayoutDialog\b", "layoutDialog is modal"),
    (r"\bfileDialog2?\b", "file dialogs wait for a click"),
    (r"\bshowWindow\b.*modal|\bmodal\s*=\s*True", "modal windows block the main thread"),
]
# Long or short flags (new/n, open/o, force/f), in cmds.file, its MEL form
# inside mel.eval (the server's namespace provides mel), or PyMEL's
# newFile/openFile.
_TRUE = r"\s*=\s*(?:True|1)\b"
_SCENE_REPLACE = re.compile(
    r"\bfile\s*\((?=[^)]*\b(?:new|n|open|o)" + _TRUE + r")(?=[^)]*\b(?:force|f)" + _TRUE + r")"
    r"|\bfile\b(?=[^;\n]*?\s-(?:force|f)\b)(?=[^;\n]*?\s-(?:new|n|open|o)\b)"
    r"|\b(?:newFile|openFile)\s*\((?=[^)]*\b(?:force|f)" + _TRUE + r")",
    re.S,
)


class BridgeError(RuntimeError):
    pass


OUTPUT_KEYS = {"result": None, "stdout": "", "stderr": "", "maya_messages": []}


def complete(rec, partial_text=None):
    """Give a record every output key (stdout, stderr, maya_messages, result, ok), so callers
    never branch on missing keys. partial_text: output a timed-out job wrote so far."""
    rec = dict(rec or {})
    rec.setdefault("ok", False)
    for k, v in OUTPUT_KEYS.items():
        if rec.get(k) is None:
            rec[k] = list(v) if isinstance(v, list) else v
    if partial_text:
        rec["stdout"] = partial_text
        rec["partial_output"] = True
    return rec


def format_record(rec, tail=60):
    """Readable text of a bridge record: status, result, the last `tail` lines of stdout and
    stderr, Maya's warnings and errors, and the traceback."""
    rec = complete(rec)
    lines = ["ok: %s%s" % (rec["ok"], "  (partial output, job still running)" if rec.get("partial_output") else "")]
    if rec.get("error"):
        lines.append("error: %s" % rec["error"])
    if rec.get("result") is not None:
        lines.append("result: %s" % json.dumps(rec["result"], default=str)[:2000])
    for key in ("stdout", "stderr"):
        text = rec[key].rstrip("\n")
        if text:
            body = text.splitlines()
            cut = "  [%d earlier lines cut]" % (len(body) - tail) if len(body) > tail else ""
            lines.append("%s:%s" % (key, cut))
            lines += ["  " + l for l in body[-tail:]]
    if rec["maya_messages"]:
        lines.append("maya messages:")
        lines += ["  %s: %s" % (m.get("type"), m.get("text")) for m in rec["maya_messages"][:tail]]
    if rec.get("traceback"):
        lines.append("traceback:")
        lines += ["  " + l for l in rec["traceback"].rstrip().splitlines()[-tail:]]
    return "\n".join(lines)


def default_root():
    env = os.environ.get("MX_BRIDGE_DIR")
    if env:
        return env
    uid = str(os.getuid()) if hasattr(os, "getuid") else os.environ.get("USERNAME", "user")
    base = "/tmp" if os.name != "nt" else os.environ.get("TEMP", ".")
    return os.path.join(base, "mx_bridge_%s" % uid)


def lint(code, allow_modal=False, allow_scene_replace=False):
    """Return a list of reasons this code must not run over the bridge."""
    problems = []
    if not allow_modal:
        for pat, why in _MODAL_PATTERNS:
            if re.search(pat, code):
                problems.append(why)
    if not allow_scene_replace and _SCENE_REPLACE.search(code):
        problems.append("replaces the user's scene with force=True: check "
                        "cmds.file(q=True, modified=True) first, or pass allow_scene_replace=True")
    return problems


class Bridge(object):
    def __init__(self, port=DEFAULT_PORT, host="127.0.0.1", root=None, unix_socket=None,
                 timeout=300.0, start_timeout=30.0, connect_timeout=5.0):
        self.port, self.host, self.unix_socket = port, host, unix_socket
        self.root = root or default_root()
        self.timeout, self.start_timeout, self.connect_timeout = timeout, start_timeout, connect_timeout

    # ----------------------------------------------------------------- socket layer
    def _connect(self):
        if self.unix_socket:
            s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            s.settimeout(self.connect_timeout)
            s.connect(self.unix_socket)
            return s
        return socket.create_connection((self.host, self.port), timeout=self.connect_timeout)

    def send_line(self, line, read_reply=True, reply_timeout=5.0):
        """Send one statement to the command port; return Maya's reply text or None.
        The reply framing is not documented [verify]: read until newline, NUL, close or
        timeout, and strip."""
        if len(line) > 3900:
            raise BridgeError("line too long for the default 4096-character port buffer")
        try:
            s = self._connect()
        except OSError as exc:
            raise BridgeError("cannot connect to Maya on %s: %s (is mx_bridge_server.start() "
                              "running in the GUI session?)" % (self.unix_socket or
                                                                "%s:%s" % (self.host, self.port), exc))
        try:
            s.sendall((line + "\n").encode("utf-8"))
            if not read_reply:
                return None
            s.settimeout(reply_timeout)
            buf = b""
            try:
                while True:
                    chunk = s.recv(65536)
                    if not chunk:
                        break
                    buf += chunk
                    if b"\n" in chunk or b"\x00" in chunk:
                        break
            except socket.timeout:
                pass
            return buf.replace(b"\x00", b"").decode("utf-8", "replace").strip()
        finally:
            s.close()

    # ----------------------------------------------------------------- file layer
    def _paths(self, job_id):
        base = os.path.join(self.root, job_id)
        return base + ".py", base + ".json", base + ".running", base + ".opts.json"

    def partial_output(self, job_id):
        """What a running (or timed-out) job has printed so far, from <id>.out, or ''."""
        try:
            with open(os.path.join(self.root, job_id + ".out"), encoding="utf-8", errors="replace") as f:
                return f.read()
        except OSError:
            return ""

    def write_job(self, code, undo=True, name=None):
        """Write a job file and return its id (used by run(); tests call it directly)."""
        if not os.path.isdir(self.root):
            os.makedirs(self.root, mode=0o700, exist_ok=True)
        job_id = "%s_%s" % (time.strftime("%Y%m%d_%H%M%S"), uuid.uuid4().hex[:8])
        if name:
            job_id += "_" + re.sub(r"[^A-Za-z0-9_\-]", "", name)[:24]
        code_path, _, _, opts_path = self._paths(job_id)
        tmp = code_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(code)
        os.replace(tmp, code_path)
        with open(opts_path, "w") as f:
            json.dump({"undo": bool(undo)}, f)
        return job_id

    def fetch(self, job_id):
        """Return the result record of a job, or None if not written yet."""
        _, out_path, _, _ = self._paths(job_id)
        if not os.path.isfile(out_path):
            return None
        for _ in range(5):
            try:
                with open(out_path) as f:
                    return json.load(f)
            except ValueError:
                time.sleep(0.05)
        return None

    def wait(self, job_id, timeout=None, reply=None):
        timeout = self.timeout if timeout is None else timeout
        _, _, running_path, _ = self._paths(job_id)
        t0 = time.time()
        delay = 0.02
        while True:
            rec = self.fetch(job_id)
            if rec is not None:
                rec["elapsed"] = round(time.time() - t0, 3)
                rec["reply"] = reply
                return complete(rec)
            elapsed = time.time() - t0
            if not os.path.exists(running_path) and elapsed > self.start_timeout:
                return complete({"id": job_id, "ok": False, "reply": reply,
                                 "error": "Maya did not start the job within %.0fs: it is busy, a modal "
                                          "dialog is open, or the reply (%r) shows the entry point is "
                                          "missing (restart mx_bridge_server)" % (self.start_timeout, reply)})
            if elapsed > timeout:
                return complete({"id": job_id, "ok": False, "reply": reply, "running": True,
                                 "error": "timeout after %.0fs; the job may still be running on Maya's "
                                          "main thread; fetch(%r) later" % (timeout, job_id)},
                                partial_text=self.partial_output(job_id))
            time.sleep(delay)
            delay = min(delay * 1.5, 0.25)

    # ----------------------------------------------------------------- public API
    def run(self, code, timeout=None, undo=True, allow_modal=False, allow_scene_replace=False,
            name=None, deferred=True):
        """Run Python in the GUI session; `result` in the code becomes rec["result"]."""
        problems = lint(code, allow_modal, allow_scene_replace)
        if problems:
            return complete({"ok": False, "error": "refused by lint: " + "; ".join(problems)})
        job_id = self.write_job(code, undo=undo, name=name)
        line = '_mx_bridge_run("%s", deferred=%s)' % (job_id, "True" if deferred else "False")
        try:
            reply = self.send_line(line, reply_timeout=5.0 if deferred else (timeout or self.timeout))
        except BridgeError as exc:
            return complete({"id": job_id, "ok": False, "error": str(exc)})
        return self.wait(job_id, timeout=timeout, reply=reply)

    def run_file(self, path, **kw):
        with open(path, encoding="utf-8") as f:
            return self.run(f.read(), name=os.path.splitext(os.path.basename(path))[0], **kw)

    def call(self, module, function, *args, **kwargs):
        """Import `module` inside Maya (the server puts the skill scripts on sys.path) and
        return function(*args, **kwargs). reload=True re-imports an edited module."""
        reload_mod = kwargs.pop("reload", False)
        timeout = kwargs.pop("timeout", None)
        undo = kwargs.pop("undo", True)
        payload = json.dumps({"args": args, "kwargs": kwargs})
        code = ("import importlib, json\n"
                "import {m} as _m\n"
                "{r}"
                "_p = json.loads({p!r})\n"
                "result = _m.{f}(*_p['args'], **_p['kwargs'])\n").format(
            m=module, f=function, p=payload, r="_m = importlib.reload(_m)\n" if reload_mod else "")
        return self.run(code, timeout=timeout, undo=undo, name="%s.%s" % (module, function))

    def ping(self, timeout=30.0):
        """Full round trip through the file protocol."""
        code = ("import sys\n"
                "result = {'maya': cmds.about(version=True), 'batch': cmds.about(batch=True),\n"
                "          'scene': cmds.file(q=True, sceneName=True),\n"
                "          'modified': cmds.file(q=True, modified=True),\n"
                "          'python': sys.version.split()[0]}\n")
        return self.run(code, timeout=timeout, undo=False, name="ping")

    def info(self):
        """Server info through the port reply only (no files)."""
        text = self.send_line("_mx_bridge_info()")
        try:
            return json.loads(text.strip("'\""))
        except (ValueError, AttributeError):
            return {"raw_reply": text}


_DEFAULT = {}


def default_bridge(**kw):
    key = tuple(sorted(kw.items()))
    if key not in _DEFAULT:
        _DEFAULT[key] = Bridge(**kw)
    return _DEFAULT[key]


def run(code, **kw):
    return default_bridge().run(code, **kw)


def ping(**kw):
    return default_bridge(**kw).ping()


def _cli(argv):
    port, timeout, rest, as_text = DEFAULT_PORT, 300.0, [], False
    i = 0
    while i < len(argv):
        if argv[i] == "--port":
            port = int(argv[i + 1]); i += 2
        elif argv[i] == "--timeout":
            timeout = float(argv[i + 1]); i += 2
        elif argv[i] == "--text":
            as_text = True; i += 1
        else:
            rest.append(argv[i]); i += 1
    if not rest:
        print(__doc__)
        return 2
    b = Bridge(port=port, timeout=timeout)
    cmd = rest[0]
    if cmd == "ping":
        rec = b.ping()
    elif cmd == "info":
        rec = b.info()
        rec.setdefault("ok", True)
    elif cmd == "run" and len(rest) > 1:
        rec = b.run_file(rest[1])
    elif cmd == "exec" and len(rest) > 1:
        rec = b.run(rest[1])
    else:
        print(__doc__)
        return 2
    print(format_record(rec) if as_text else json.dumps(rec, indent=1))
    return 0 if rec.get("ok") else 1


if __name__ == "__main__":
    sys.exit(_cli(sys.argv[1:]))
