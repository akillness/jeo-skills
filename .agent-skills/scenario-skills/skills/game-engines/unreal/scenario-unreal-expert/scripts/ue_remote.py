"""
ue_remote: talk to a RUNNING Unreal Editor from the agent side (system python3).

STATUS: not yet run in Unreal. Written 2026-09-24 before UE 5.8 was installed. Request
builders, error hints, path helpers, the SSE parser and the lsof parser ran offline, and each
client ran against a local fake server (tests/code/unreal-expert/test_ue_remote_offline.py).

Channels, in order of preference for live work (see SKILL.md, capability matrix):
  1. Epic's Unreal MCP server (5.8, Experimental): the agent's MCP client talks to it
     directly through .mcp.json (ModelContextProtocol.GenerateClientConfig ClaudeCode).
     Tool calls run serially on the game thread: never overlap them. McpHttp below is only
     for scripted health checks and tests, not a replacement for the agent's MCP client.
  2. PythonRemote: Editor Python in the running editor through Python Remote Execution
     (Project Settings > Plugins > Python > Enable Remote Execution, off by default). Full
     `unreal` API, no third-party plugin; the editor ticks between calls, so screenshots
     requested in one call exist a moment later.
  3. RemoteControl: HTTP on 127.0.0.1:30010 (plugin Remote Control API, Beta; server off
     until `WebControl.StartServer`). Best for batched property writes and live presets.
     5.8: remote UFUNCTION calls are DISABLED by default with an allow list (5.8 release
     notes, Motion Design and Virtual Production); property access is not described as
     affected [verify].

Library:
  import ue_remote as R
  rc = R.RemoteControl()                 # 127.0.0.1:30010
  rc.info(); rc.describe(path); rc.get_property(path, "Intensity")
  rc.set_property(path, "Intensity", 6.0)          # WRITE_TRANSACTION_ACCESS: undoable
  rc.call(path, "SetRelativeRotation", {"NewRotation": {"Pitch": 90, "Yaw": 0, "Roll": 0}})
  rc.batch([R.property_request(path, "Intensity", 5.0), ...])
  py = R.PythonRemote(); py.open(); py.exec("import unreal; print(unreal.SystemLibrary"
       ".get_engine_version())"); py.call("ue_audit", "audit_assets", ["/Game/Props"]); py.close()
  m = R.McpHttp(); m.health()           # reachable, server name, tools, tool search on
  R.loopback_only(8000)                  # True if every listener on the port is loopback

Security: every channel here is unauthenticated. Keep them on 127.0.0.1. The Remote Control
docs tell users to set [HTTPServer.Listeners] DefaultBindAddress=0.0.0.0 for LAN access;
Epic's MCP listener reads the same key, so that change likely exposes MCP too [added
inference, verify with loopback_only(8000) after any change].
"""

__version__ = "0.1"  # Unreal Engine Expert Skills v0.1 (2026-09-24)

import json
import os
import re
import socket
import struct
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid

_HERE = os.path.dirname(os.path.abspath(__file__))
RESULT_TAG = "UE_RESULT "


# =========================================================================== paths
def cdo_path(module, cls):
    """Object path of a C++ class default object: /Script/<Module>.Default__<Class>.
    Static library functions are called on the CDO (Remote Control doc)."""
    return "/Script/%s.Default__%s" % (module, cls)


def python_cdo_path(cls):
    """CDO of a Python-defined @unreal.uclass: /Engine/PythonTypes.Default__<Class>."""
    return "/Engine/PythonTypes.Default__%s" % cls


def pie_path(object_path, instance=0):
    """Editor object path to its PIE copy: the map name gets a UEDPIE_<N>_ prefix.

    /Game/Maps/Main.Main:PersistentLevel.Light_0 ->
    /Game/Maps/UEDPIE_0_Main.UEDPIE_0_Main:PersistentLevel.Light_0 (Remote Control doc
    shows the package and object parts both prefixed)."""
    m = re.match(r"^(?P<dir>/[^.:]*/)(?P<pkg>[^/.:]+)\.(?P<obj>[^:]+)(?P<rest>:.*)?$", object_path)
    if not m:
        raise ValueError("not an object path: %s" % object_path)
    pre = "UEDPIE_%d_" % int(instance)
    rest = m.group("rest") or ""
    obj = m.group("obj")
    obj = pre + obj if obj == m.group("pkg") else obj
    return "%s%s%s.%s%s" % (m.group("dir"), pre, m.group("pkg"), obj, rest)


# =========================================================================== Remote Control
class RemoteControlError(RuntimeError):
    def __init__(self, message, status=None, body=None, hint=None, route=None):
        RuntimeError.__init__(self, message + ((" | hint: " + hint) if hint else ""))
        self.status, self.body, self.hint, self.route = status, body, hint, route


HINTS = {
    "offline": ("server not reachable: enable the Remote Control API plugin, then run "
                "`WebControl.StartServer` in the editor console (or set "
                "WebControl.EnableServerOnStartup); packaged or -game builds need "
                "-RCWebControlEnable -RCWebInterfaceEnable"),
    "call": ("UE 5.8 disables remote UFUNCTION calls by default: allow them in Project "
             "Settings > Plugins > Remote Control or add this function to the allow list "
             "[verify setting names]; function and parameter names are C++ names (bSweep, "
             "not Sweep); static functions are called on the CDO (cdo_path)"),
    "property": ("property access rules: editor needs public EditAnywhere (not EditConst) "
                 "and no BlueprintGetter/Setter; PIE and -game need BlueprintVisible (not "
                 "BlueprintReadOnly to write). Otherwise call the setter with call(); use "
                 "describe() to read real names"),
    "path": ("object paths look like /Game/Dir/Map.Map:PersistentLevel.Actor_0.Component; in "
             "PIE the map gets a UEDPIE_0_ prefix (pie_path)"),
}


def call_body(object_path, function, params=None, transaction=True):
    """Body of PUT /remote/object/call. generateTransaction makes it undoable (Undo History
    entry 'Remote Call Transaction Wrap')."""
    body = {"objectPath": object_path, "functionName": function,
            "generateTransaction": bool(transaction)}
    if params:
        body["parameters"] = params
    return body


def property_body(object_path, name=None, value=None, write=False, transaction=True):
    """Body of PUT /remote/object/property. Omit name to list readable properties.
    Writes use WRITE_TRANSACTION_ACCESS (Details-panel behavior, pre and post edit change)
    unless transaction=False (WRITE_ACCESS)."""
    body = {"objectPath": object_path}
    if name:
        body["propertyName"] = name
    if write:
        body["access"] = "WRITE_TRANSACTION_ACCESS" if transaction else "WRITE_ACCESS"
        body["propertyValue"] = {name: value}
    else:
        body["access"] = "READ_ACCESS"
    return body


def property_request(object_path, name, value, transaction=True):
    """One batch entry that writes a property: (url, verb, body)."""
    return ("/remote/object/property", "PUT",
            property_body(object_path, name, value, write=True, transaction=transaction))


def call_request(object_path, function, params=None, transaction=True):
    return ("/remote/object/call", "PUT", call_body(object_path, function, params, transaction))


def batch_body(requests):
    """Body of PUT /remote/batch from (url, verb, body) tuples; RequestId = index."""
    return {"Requests": [{"RequestId": i, "URL": u, "Verb": v, "Body": b}
                         for i, (u, v, b) in enumerate(requests)]}


def search_body(query="", classes=(), paths=(), packages=(), recursive_paths=True,
                recursive_classes=False):
    """Body of PUT /remote/search/assets. Class filters may need class paths such as
    /Script/Engine.StaticMesh on UE5 (5.1 moved the registry to class paths) [verify]."""
    return {"Query": query, "Filter": {
        "PackageNames": list(packages), "ClassNames": list(classes),
        "PackagePaths": list(paths), "RecursiveClassesExclusionSet": [],
        "RecursivePaths": bool(recursive_paths), "RecursiveClasses": bool(recursive_classes)}}


class RemoteControl(object):
    """Minimal Remote Control API client (HTTP, JSON only). Not yet run in Unreal."""

    def __init__(self, host="127.0.0.1", port=30010, timeout=10.0):
        self.base = "http://%s:%d" % (host, int(port))
        self.timeout = timeout

    def request(self, route, verb="PUT", body=None, hint=None):
        data = None if body is None else json.dumps(body).encode("utf-8")
        req = urllib.request.Request(self.base + route, data=data, method=verb,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                raw = r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "replace") if e.fp else ""
            raise RemoteControlError("%s %s -> HTTP %d: %s" % (verb, route, e.code, raw[:300]),
                                     status=e.code, body=raw, hint=HINTS.get(hint), route=route)
        except (urllib.error.URLError, socket.timeout, ConnectionError) as e:
            raise RemoteControlError("%s %s failed: %s" % (verb, route, e),
                                     hint=HINTS["offline"], route=route)
        if not raw.strip():
            return {}
        try:
            return json.loads(raw)
        except ValueError:
            return {"raw": raw}

    def is_up(self):
        try:
            self.info()
            return True
        except RemoteControlError:
            return False

    def info(self):
        return self.request("/remote/info", "GET")

    def describe(self, object_path):
        return self.request("/remote/object/describe", "PUT", {"objectPath": object_path},
                            hint="path")

    def get_property(self, object_path, name=None):
        return self.request("/remote/object/property", "PUT",
                            property_body(object_path, name), hint="property")

    def set_property(self, object_path, name, value, transaction=True):
        return self.request("/remote/object/property", "PUT",
                            property_body(object_path, name, value, write=True,
                                          transaction=transaction), hint="property")

    def call(self, object_path, function, params=None, transaction=True):
        return self.request("/remote/object/call", "PUT",
                            call_body(object_path, function, params, transaction), hint="call")

    def search_assets(self, query="", classes=(), paths=(), **kw):
        return self.request("/remote/search/assets", "PUT",
                            search_body(query, classes, paths, **kw))

    def batch(self, requests):
        """Ordered writes in one HTTP request; returns the Responses list. Raises if any
        response code is >= 400 (the error carries all responses in .body)."""
        out = self.request("/remote/batch", "PUT", batch_body(requests))
        resp = out.get("Responses", []) if isinstance(out, dict) else []
        bad = [r for r in resp if int(r.get("ResponseCode", 200)) >= 400]
        if bad:
            raise RemoteControlError("%d of %d batch requests failed" % (len(bad), len(resp)),
                                     body=resp, hint=HINTS["property"], route="/remote/batch")
        return resp

    def console(self, command, world_context=None):
        """Run a console command through KismetSystemLibrary.ExecuteConsoleCommand on the
        CDO. Needs the 5.8 remote-call permission; whether RC fills WorldContextObject by
        itself is [verify]. Alternative: a Python uclass in init_unreal.py with a static
        ufunction that runs the command, called at python_cdo_path(<Class>)."""
        params = {"Command": command}
        if world_context:
            params["WorldContextObject"] = world_context
        return self.call(cdo_path("Engine", "KismetSystemLibrary"), "ExecuteConsoleCommand",
                         params, transaction=False)


# =========================================================================== Python Remote Execution
PROTOCOL_VERSION = 1
PROTOCOL_MAGIC = "ue_py"
DEFAULT_GROUP = ("239.0.0.1", 6766)      # multicast discovery  [verify defaults on 5.8]
DEFAULT_COMMAND = ("127.0.0.1", 6776)    # our TCP listener the editor connects back to
DEFAULT_BIND = "127.0.0.1"
EXEC_FILE, EXEC_STATEMENT, EVAL_STATEMENT = "ExecuteFile", "ExecuteStatement", "EvaluateStatement"


def rx_message(type_, source, dest=None, data=None):
    """Encode one remote-execution message (JSON bytes). Protocol as in Epic's
    remote_execution.py shipped with the Python plugin [added from memory, verify]."""
    msg = {"version": PROTOCOL_VERSION, "magic": PROTOCOL_MAGIC, "type": type_, "source": source}
    if dest:
        msg["dest"] = dest
    if data is not None:
        msg["data"] = data
    return json.dumps(msg).encode("utf-8")


def rx_parse(raw):
    """Decode a message; None if it is not ours (wrong magic or version) or not JSON."""
    try:
        msg = json.loads(raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else raw)
    except ValueError:
        return None
    if not isinstance(msg, dict) or msg.get("magic") != PROTOCOL_MAGIC:
        return None
    if msg.get("version") != PROTOCOL_VERSION:
        return None
    return msg


def command_output(result):
    """Split a command_result's data into stdout text, error lines and a UE_RESULT dict."""
    data = result.get("data", result) if isinstance(result, dict) else {}
    lines, errors = [], []
    for item in data.get("output", []) or []:
        text = item.get("output", "") if isinstance(item, dict) else str(item)
        kind = item.get("type", "Info") if isinstance(item, dict) else "Info"
        lines.append(text)
        if kind in ("Error", "Fatal"):
            errors.append(text)
    stdout = "\n".join(lines)
    parsed = None
    for line in reversed(stdout.splitlines()):
        i = line.find(RESULT_TAG)
        if i >= 0:
            try:
                parsed = json.loads(line[i + len(RESULT_TAG):])
                break
            except ValueError:
                continue
    return {"success": bool(data.get("success")), "result": data.get("result"),
            "stdout": stdout, "errors": errors, "ue_result": parsed}


def call_code(module, function, args=(), kwargs=None, scripts_dir=_HERE, reload=True):
    """Python source that imports a toolkit module in the editor, calls it, and prints
    UE_RESULT. sys.path is restored afterwards; modules stay loaded (reloaded each call)
    so long-lived objects such as a render executor stay referenced."""
    payload = json.dumps({"args": list(args), "kwargs": kwargs or {}})
    return "\n".join([
        "import sys, json, importlib, traceback",
        "_p = %r" % scripts_dir,
        "_added = _p not in sys.path",
        "if _added: sys.path.insert(0, _p)",
        "try:",
        "    import ue_run",
        "    _m = importlib.import_module(%r)" % module,
        "    if %r: _m = importlib.reload(_m)" % bool(reload),
        "    _a = json.loads(%r)" % payload,
        "    try:",
        "        _r = {'ok': True, 'result': ue_run.to_jsonable(getattr(_m, %r)(*_a['args'], "
        "**_a['kwargs']))}" % function,
        "    except Exception as _e:",
        "        _r = {'ok': False, 'error': '%s: %s' % (type(_e).__name__, _e), "
        "'traceback': traceback.format_exc()}",
        "    print(%r + json.dumps(_r))" % RESULT_TAG,
        "finally:",
        "    if _added and _p in sys.path: sys.path.remove(_p)",
    ])


class PythonRemote(object):
    """Run Python in a running editor through Python Remote Execution. Not yet run.

    Prefers Epic's own remote_execution.py from the engine (found through ue_env) and
    falls back to the minimal client below. Discovery: UDP multicast ping on 239.0.0.1:6766
    with TTL 0 (loopback); the editor answers pong with its project; open_connection asks
    it to connect back to our TCP listener; commands and results travel over that TCP
    connection; pings continue every second while connected."""

    def __init__(self, project=None, group=DEFAULT_GROUP, command=DEFAULT_COMMAND,
                 bind=DEFAULT_BIND, timeout=30.0, prefer_epic=True):
        self.project, self.group, self.command_ep, self.bind = project, group, command, bind
        self.timeout, self.prefer_epic = timeout, prefer_epic
        self.node_id = str(uuid.uuid4())
        self.remote = None
        self._udp = self._listener = self._conn = None
        self._epic = None
        self._pinging = False

    # ----- Epic's module
    def _try_epic(self):
        if not self.prefer_epic:
            return None
        try:
            import ue_env
            eng = ue_env.find_engine()
        except Exception:
            eng = None
        if not eng:
            return None
        path = os.path.join(eng["python_plugin"], "Content", "Python")
        if not os.path.isfile(os.path.join(path, "remote_execution.py")):
            return None
        if path not in sys.path:
            sys.path.append(path)
        try:
            import remote_execution
            return remote_execution
        except Exception:
            return None

    # ----- discovery
    def _udp_socket(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if hasattr(socket, "SO_REUSEPORT"):
            try:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            except OSError:
                pass
        s.bind(("", self.group[1]))
        mreq = struct.pack("4s4s", socket.inet_aton(self.group[0]), socket.inet_aton(self.bind))
        s.setsockopt(socket.IPPROTO_IP, socket.IP_ADD_MEMBERSHIP, mreq)
        s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(self.bind))
        s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 0)
        s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_LOOP, 1)
        s.settimeout(0.2)
        return s

    def _send_udp(self, payload):
        self._udp.sendto(payload, self.group)

    def discover(self, wait=2.0):
        """Ping and collect pongs for `wait` seconds. Returns [{"node_id", "data"}]; filtered
        by project name (data['project_name']) when self.project is set."""
        if self._epic is None:
            self._epic = self._try_epic() or False
        if self._epic:
            rx = self._epic.RemoteExecution()
            rx.start()
            t = time.time()
            while time.time() - t < wait:
                time.sleep(0.2)
            nodes = [{"node_id": n.get("node_id"), "data": n} for n in rx.remote_nodes]
            rx.stop()
            return self._filter(nodes)
        own = self._udp is None
        if own:
            self._udp = self._udp_socket()
        nodes, t = {}, time.time()
        try:
            while time.time() - t < wait:
                self._send_udp(rx_message("ping", self.node_id))
                end = time.time() + 0.5
                while time.time() < end:
                    try:
                        raw, _ = self._udp.recvfrom(65536)
                    except socket.timeout:
                        continue
                    msg = rx_parse(raw)
                    if msg and msg.get("type") == "pong" and msg.get("dest") == self.node_id:
                        nodes[msg["source"]] = {"node_id": msg["source"], "data": msg.get("data", {})}
        finally:
            if own:
                self._udp.close()
                self._udp = None
        return self._filter(list(nodes.values()))

    def _filter(self, nodes):
        if not self.project:
            return nodes
        return [n for n in nodes if str(n["data"].get("project_name", "")).lower()
                == str(self.project).lower()]

    # ----- connection
    def open(self, node=None, wait=2.0):
        """Connect to one editor (the first discovered, or `node`). Raises with a hint."""
        if self._epic is None:
            self._epic = self._try_epic() or False
        if self._epic:
            self._rx = self._epic.RemoteExecution()
            self._rx.start()
            t = time.time()
            while not self._rx.remote_nodes and time.time() - t < max(wait, 5.0):
                time.sleep(0.2)
            nodes = self._filter([{"node_id": n.get("node_id"), "data": n}
                                  for n in self._rx.remote_nodes])
            if not nodes:
                self._rx.stop()
                raise RuntimeError(self._no_node_hint())
            self.remote = node or nodes[0]
            self._rx.open_command_connection(self.remote["node_id"])
            return self.remote
        if node is None:
            found = self.discover(wait)
            if not found:
                raise RuntimeError(self._no_node_hint())
            node = found[0]
        self.remote = node
        self._listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._listener.bind(self.command_ep)
        self._listener.listen(1)
        self._listener.settimeout(self.timeout)
        self._udp = self._udp_socket()
        self._send_udp(rx_message("open_connection", self.node_id, node["node_id"],
                                  {"command_ip": self.command_ep[0],
                                   "command_port": self.command_ep[1]}))
        self._conn, _ = self._listener.accept()
        self._conn.settimeout(self.timeout)
        self._pinging = True
        threading.Thread(target=self._ping_loop, daemon=True).start()
        return node

    def attach_socket(self, conn, remote_node_id):
        """Use an already connected TCP socket (tests, or a custom discovery path)."""
        self._conn, self.remote = conn, {"node_id": remote_node_id, "data": {}}
        self._conn.settimeout(self.timeout)

    def _ping_loop(self):
        while self._pinging:
            try:
                self._send_udp(rx_message("ping", self.node_id))
            except OSError:
                return
            time.sleep(1.0)

    def _no_node_hint(self):
        return ("no Unreal Editor answered on %s:%d: enable Project Settings > Plugins > Python >"
                " Enable Remote Execution (restart not required [verify]); keep the multicast"
                " bind address on 127.0.0.1; the editor must be open%s" % (
                    self.group[0], self.group[1],
                    (" on project '%s'" % self.project) if self.project else ""))

    def _recv_json(self):
        buf, t = b"", time.time()
        while time.time() - t < self.timeout:
            try:
                chunk = self._conn.recv(1 << 20)
            except socket.timeout:
                break
            if not chunk:
                break
            buf += chunk
            msg = rx_parse(buf)
            if msg is not None:
                return msg
        raise RuntimeError("no complete reply from the editor within %ss" % self.timeout)

    def exec(self, code, mode=EXEC_FILE, unattended=True):
        """Run code in the editor. ExecuteFile accepts multi-statement source. Returns
        command_output(): success, result, stdout, errors, ue_result."""
        if self._epic and getattr(self, "_rx", None):
            res = self._rx.run_command(code, unattended=unattended, exec_mode=mode)
            return command_output({"data": res})
        if self._conn is None:
            raise RuntimeError("not connected: call open() first")
        self._conn.sendall(rx_message("command", self.node_id, self.remote["node_id"],
                                      {"command": code, "unattended": bool(unattended),
                                       "exec_mode": mode}))
        msg = self._recv_json()
        if msg.get("type") != "command_result":
            raise RuntimeError("unexpected reply type %r" % msg.get("type"))
        return command_output(msg)

    def call(self, module, function, *args, **kwargs):
        """Call scripts/<module>.<function>(*args, **kwargs) in the editor; returns the
        UE_RESULT dict ({"ok", "result"} or {"ok": False, "error", "traceback"})."""
        reload = kwargs.pop("_reload", True)
        out = self.exec(call_code(module, function, args, kwargs, reload=reload))
        if out["ue_result"] is None:
            return {"ok": False, "error": "no UE_RESULT in output", "stdout": out["stdout"],
                    "errors": out["errors"]}
        return out["ue_result"]

    def close(self):
        self._pinging = False
        if self._epic and getattr(self, "_rx", None):
            try:
                self._rx.close_command_connection()
            finally:
                self._rx.stop()
                self._rx = None
            return
        if self._udp is not None and self.remote:
            try:
                self._send_udp(rx_message("close_connection", self.node_id,
                                          self.remote["node_id"]))
            except OSError:
                pass
        for s in (self._conn, self._listener, self._udp):
            if s is not None:
                try:
                    s.close()
                except OSError:
                    pass
        self._conn = self._listener = self._udp = None

    def __enter__(self):
        self.open()
        return self

    def __exit__(self, *exc):
        self.close()


# =========================================================================== MCP (health checks)
MCP_URL = "http://127.0.0.1:8000/mcp"
MCP_PROTOCOL = "2025-06-18"


def parse_sse(text):
    """Parse a text/event-stream body into a list of decoded JSON payloads (data: lines
    joined per event). Non-JSON data is returned as a string."""
    events, data = [], []
    for line in (text or "").splitlines() + [""]:
        if line.startswith("data:"):
            data.append(line[5:].lstrip(" "))
        elif line == "":
            if data:
                payload = "\n".join(data)
                try:
                    events.append(json.loads(payload))
                except ValueError:
                    events.append(payload)
                data = []
    return events


def jsonrpc(method, params=None, id_=None):
    msg = {"jsonrpc": "2.0", "method": method}
    if params is not None:
        msg["params"] = params
    if id_ is not None:
        msg["id"] = id_
    return msg


class McpHttp(object):
    """Minimal Streamable HTTP MCP client for health checks and tests. Not yet run
    against Unreal. The agent's own MCP client (from .mcp.json) is the working channel."""

    def __init__(self, url=MCP_URL, timeout=30.0):
        self.url, self.timeout = url, timeout
        self.session = None
        self._id = 0
        self.server_info = None

    def _post(self, msg):
        headers = {"Content-Type": "application/json",
                   "Accept": "application/json, text/event-stream",
                   "MCP-Protocol-Version": MCP_PROTOCOL}
        if self.session:
            headers["Mcp-Session-Id"] = self.session
        req = urllib.request.Request(self.url, data=json.dumps(msg).encode("utf-8"),
                                     headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            sid = r.headers.get("Mcp-Session-Id")
            if sid:
                self.session = sid
            ctype = r.headers.get("Content-Type", "")
            body = r.read().decode("utf-8", "replace")
        if "id" not in msg:
            return None
        if "text/event-stream" in ctype:
            for ev in parse_sse(body):
                if isinstance(ev, dict) and ev.get("id") == msg["id"]:
                    return ev
            raise RuntimeError("no response for id %s in the event stream" % msg["id"])
        return json.loads(body) if body.strip() else None

    def rpc(self, method, params=None):
        self._id += 1
        resp = self._post(jsonrpc(method, params, self._id))
        if resp is None:
            raise RuntimeError("empty response to %s" % method)
        if "error" in resp:
            raise RuntimeError("%s -> %s" % (method, resp["error"]))
        return resp.get("result")

    def initialize(self):
        res = self.rpc("initialize", {"protocolVersion": MCP_PROTOCOL, "capabilities": {},
                                      "clientInfo": {"name": "unreal-expert-toolkit",
                                                     "version": __version__}})
        self.server_info = (res or {}).get("serverInfo")
        self._post(jsonrpc("notifications/initialized"))
        return res

    def list_tools(self):
        return (self.rpc("tools/list", {}) or {}).get("tools", [])

    def call_tool(self, name, arguments=None):
        return self.rpc("tools/call", {"name": name, "arguments": arguments or {}})

    def health(self):
        """{"reachable", "server", "tools", "tool_search"}. tool_search is True when
        tools/list returns Epic's meta-tools list_toolsets, describe_toolset, call_tool
        (Enable Tool Search, on by default). Their argument schemas are in the returned
        tool list: read them before calling (the call_tool meta-tool's schema is
        [verify])."""
        out = {"reachable": False, "url": self.url}
        try:
            self.initialize()
            tools = self.list_tools()
        except Exception as e:
            out["error"] = "%s: %s" % (type(e).__name__, e)
            out["hint"] = ("editor running? plugins Unreal MCP + All Toolsets (+ Editor Toolset per"
                           " Epic's webinar) enabled? server started (Auto Start Server, "
                           "ModelContextProtocol.StartServer or -ModelContextProtocolStartServer)?")
            return out
        names = [t.get("name") for t in tools]
        out.update(reachable=True, server=self.server_info, tools=names,
                   tool_search={"list_toolsets", "describe_toolset", "call_tool"} <= set(names))
        return out


# =========================================================================== listeners
def parse_lsof(text):
    """Parse `lsof -nP -iTCP:<port> -sTCP:LISTEN` output -> [{command, pid, address, port}]."""
    rows = []
    for line in (text or "").splitlines()[1:]:
        parts = line.split()
        if len(parts) < 9:
            continue
        name = parts[8] if parts[-1] != "(LISTEN)" else parts[-2]
        m = re.match(r"^(\[[^\]]+\]|[^:]+|\*):(\d+)$", name)
        if not m:
            continue
        rows.append({"command": parts[0], "pid": int(parts[1]) if parts[1].isdigit() else parts[1],
                     "address": m.group(1).strip("[]"), "port": int(m.group(2))})
    return rows


def listeners(port):
    try:
        out = subprocess.run(["lsof", "-nP", "-iTCP:%d" % int(port), "-sTCP:LISTEN"],
                             capture_output=True, text=True, timeout=10).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    return parse_lsof(out)


def loopback_only(port, rows=None):
    """True if every listener on port binds 127.0.0.1 or ::1, False if any binds * or a
    LAN address, None if nothing listens (or lsof is unavailable)."""
    rows = listeners(port) if rows is None else rows
    if not rows:
        return None
    return all(r["address"] in ("127.0.0.1", "::1", "localhost") for r in rows)
