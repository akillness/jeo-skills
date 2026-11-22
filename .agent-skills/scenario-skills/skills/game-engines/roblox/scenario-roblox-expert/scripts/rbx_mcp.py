#!/usr/bin/env python3
"""Minimal stdio client for Roblox Studio's built-in MCP server (StudioMCP).

Lets any agent or script drive a running, signed-in Studio from the shell, without
registering the server in the agent's own MCP config. Standard library only.

Studio side: Assistant > ... > Manage MCP Servers > "Enable Studio as MCP server".
Every tool except list_roblox_studios needs a studio_id; this client resolves it from
--studio (id, or a substring of the place name) or picks the only open Studio.

CLI:
  rbx_mcp.py tools                         list tool names and their input schemas
  rbx_mcp.py studios                       list open Studio instances
  rbx_mcp.py call <tool> '<json args>'     call any tool (studio_id filled in)
  rbx_mcp.py luau [--dm Edit|Server|Client] (--file F | --code C)
  rbx_mcp.py state | console | play start|stop
  rbx_mcp.py capture <out.png> [--json '{"camera_position":...}']
Common flags: --studio <id or name>, --timeout <s> (default 120)

Python:
  from rbx_mcp import Studio
  with Studio(place="base") as s:
      print(s.luau("return workspace:GetChildren()", dm="Edit"))
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import select
import subprocess
import sys
import time
from pathlib import Path

__version__ = "0.1.0"

BINARY = os.environ.get("RBX_STUDIO_MCP", "/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP")


class MCPError(RuntimeError):
    pass


class Studio:
    """One StudioMCP proxy process, one MCP session, bound to one Studio instance."""

    def __init__(self, studio: str | None = None, place: str | None = None, timeout: float = 120.0):
        self.want = studio or place
        # place= matches whole names only: a substring would bind the agent's "Obby.rbxl" to the
        # user's open "MyObby" window. The substring fallback is for the hand-typed --studio flag.
        self.loose = place is None
        self.timeout = timeout
        self.proc: subprocess.Popen | None = None
        self.studio_id: str | None = None
        self._id = 0
        self._buf = b""

    # -- transport -------------------------------------------------------------
    def __enter__(self) -> "Studio":
        self.open()
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def open(self) -> "Studio":
        if not Path(BINARY).exists():
            raise MCPError(f"StudioMCP not found at {BINARY} (install Roblox Studio or set RBX_STUDIO_MCP)")
        self.proc = subprocess.Popen([BINARY], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL)
        r = self._request("initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                         "clientInfo": {"name": "rbx_mcp", "version": __version__}}, 30)
        if "result" not in r:
            raise MCPError(f"initialize failed: {r}")
        self._send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        return self

    def close(self) -> None:
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self.proc = None

    def _send(self, obj: dict) -> None:
        assert self.proc and self.proc.stdin
        self.proc.stdin.write((json.dumps(obj) + "\n").encode())
        self.proc.stdin.flush()

    def _readline(self, deadline: float) -> bytes | None:
        assert self.proc and self.proc.stdout
        fd = self.proc.stdout.fileno()
        while b"\n" not in self._buf:
            left = deadline - time.time()
            if left <= 0:
                return None
            r, _, _ = select.select([fd], [], [], min(left, 1.0))
            if r:
                chunk = os.read(fd, 1 << 20)
                if not chunk:
                    raise MCPError("StudioMCP closed the connection")
                self._buf += chunk
        line, self._buf = self._buf.split(b"\n", 1)
        return line

    def _request(self, method: str, params: dict | None = None, timeout: float | None = None) -> dict:
        self._id += 1
        rid = self._id
        msg = {"jsonrpc": "2.0", "id": rid, "method": method}
        if params is not None:
            msg["params"] = params
        self._send(msg)
        deadline = time.time() + (timeout or self.timeout)
        while True:
            line = self._readline(deadline)
            if line is None:
                raise MCPError(f"{method}: no answer in {timeout or self.timeout:.0f}s")
            if not line.strip():
                continue
            obj = json.loads(line)
            if obj.get("id") == rid:
                return obj
            # notifications (tools/list_changed, logs) are ignored

    # -- MCP -------------------------------------------------------------------
    def tools(self) -> list[dict]:
        return self._request("tools/list", {}).get("result", {}).get("tools", [])

    def raw_call(self, name: str, args: dict | None = None, timeout: float | None = None) -> dict:
        r = self._request("tools/call", {"name": name, "arguments": args or {}}, timeout)
        if "error" in r:
            raise MCPError(f"{name}: {r['error']}")
        return r["result"]

    def studios(self) -> list[dict]:
        res = self.raw_call("list_roblox_studios")
        txt = "".join(c.get("text", "") for c in res.get("content", []) if c.get("type") == "text")
        try:
            data = json.loads(txt)
        except json.JSONDecodeError:
            return []
        return data.get("studios", data if isinstance(data, list) else [])

    def bind(self) -> str:
        if self.studio_id:
            return self.studio_id
        # A fresh proxy can list no Studio for a few seconds while Studios reconnect: retry briefly.
        found: list[dict] = []
        for _ in range(8):
            found = self.studios()
            if found and (not self.want or self._match(found)):
                break
            time.sleep(1.5)
        if not found:
            raise MCPError("no Studio connected: open a place in Studio and enable Assistant > Manage MCP Servers > "
                           "'Enable Studio as MCP server'")
        pick = None
        if self.want:
            pick = self._match(found)
            if pick is None:
                raise MCPError(f"no Studio matches {self.want!r}: {found}")
        elif len(found) == 1:
            pick = found[0]
        else:
            raise MCPError(f"{len(found)} Studios open, pass --studio <id or place name>: {found}")
        self.studio_id = str(pick.get("studio_id") or pick.get("studioId") or pick.get("id"))
        return self.studio_id

    def _match(self, found: list[dict]) -> dict | None:
        w = str(self.want).lower()
        # A local place may be listed as "arena" or "arena.rbxl": accept the file stem too.
        stem = w.rsplit(".", 1)[0] if w.endswith((".rbxl", ".rbxlx")) else w
        rows = [(s, [str(v).lower() for v in s.values()]) for s in found]
        exact = [s for s, fields in rows if any(f in (w, stem) or f.rsplit(".", 1)[0] == stem for f in fields)]
        loose = [s for s, fields in rows if any(w in f or (stem != w and stem in f) for f in fields)] if self.loose else []
        return (exact or loose or [None])[0]

    def call(self, name: str, args: dict | None = None, timeout: float | None = None) -> dict:
        a = dict(args or {})
        a.setdefault("studio_id", self.bind())
        # Several proxies share one port: the first hosts, later ones relay through it. When the host
        # exits, Studio reconnects to a new host within seconds; until then calls report no Studio.
        deadline = time.time() + 45
        while True:
            res = self.raw_call(name, a, timeout)
            if not (res.get("isError") and "No Roblox Studio instances are connected" in self.text(res)):
                return res
            if time.time() > deadline:
                return res
            time.sleep(2)

    # -- helpers ---------------------------------------------------------------
    @staticmethod
    def text(res: dict) -> str:
        return "\n".join(c.get("text", "") for c in res.get("content", []) if c.get("type") == "text")

    def luau(self, code: str, dm: str = "Edit", timeout: float | None = None) -> str:
        """Run Luau in the Edit, Server or Client data model; return the tool's text output.

        Raises MCPError when the tool reports an error (isError)."""
        res = self.call("execute_luau", {"code": code, "datamodel_type": dm}, timeout)
        out = self.text(res)
        if res.get("isError"):
            raise MCPError(f"execute_luau ({dm}) failed: {out}")
        return out

    def capture(self, out: str | Path, extra: dict | None = None) -> Path:
        """Save the edit-time viewport as PNG. extra: camera_position and look_at_position ([x, y, z])."""
        self._cap = getattr(self, "_cap", 0) + 1
        res = self.call("screen_capture", {"capture_id": f"ScreenCapture_{self._cap}", **(extra or {})})
        for c in res.get("content", []):
            if c.get("type") == "image":
                p = Path(out)
                p.parent.mkdir(parents=True, exist_ok=True)
                data = base64.b64decode(c["data"])
                p.write_bytes(data)
                if p.suffix.lower() == ".png" and not data.startswith(b"\x89PNG"):
                    _to_png(p)  # the tool may send JPEG; rbx_review's fallback reader needs PNG
                return p
        raise MCPError(f"screen_capture returned no image: {self.text(res)[:400]}")


def _to_png(p: Path) -> None:
    """Re-encode an image file in place as PNG (Pillow, else macOS sips)."""
    try:
        from PIL import Image  # type: ignore
        with Image.open(p) as im:
            im.load()
            im.save(p, "PNG")
        return
    except ImportError:
        pass
    subprocess.run(["sips", "-s", "format", "png", str(p), "--out", str(p)], capture_output=True, check=True)


def _main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd")
    ap.add_argument("rest", nargs="*")
    ap.add_argument("--studio")
    ap.add_argument("--dm", default="Edit", choices=["Edit", "Server", "Client"])
    ap.add_argument("--file")
    ap.add_argument("--code")
    ap.add_argument("--json", default="{}")
    ap.add_argument("--timeout", type=float, default=120.0)
    a = ap.parse_args(argv)
    with Studio(studio=a.studio, timeout=a.timeout) as s:
        if a.cmd == "tools":
            tools = s.tools()
            if not tools:
                print("rbx_mcp: tools/list is empty: StudioMCP lists tools only while a Studio with the MCP "
                      "server enabled is connected", file=sys.stderr)
            for t in tools:
                print(json.dumps({"name": t["name"], "input": t.get("inputSchema", {}).get("properties", {})}))
        elif a.cmd == "studios":
            print(json.dumps(s.studios(), indent=1))
        elif a.cmd == "call":
            name, args = a.rest[0], json.loads(a.rest[1]) if len(a.rest) > 1 else {}
            res = s.call(name, args)
            print(json.dumps({k: v for k, v in res.items()}, indent=1)[:20000])
            return 1 if res.get("isError") else 0
        elif a.cmd == "luau":
            code = Path(a.file).read_text() if a.file else a.code
            if not code:
                ap.error("luau needs --file or --code")
            print(s.luau(code, a.dm))
        elif a.cmd == "state":
            print(s.text(s.call("get_studio_state")))
        elif a.cmd == "console":
            print(s.text(s.call("get_console_output")))
        elif a.cmd == "play":
            from rbx_play import play_args  # argument names come from the tool's own schema
            want = (a.rest[0] if a.rest else "start").lower()
            res = s.call("start_stop_play", {**play_args(s, want == "start"), **json.loads(a.json)})
            print(s.text(res))
        elif a.cmd == "capture":
            print(s.capture(a.rest[0] if a.rest else "capture.png", json.loads(a.json)))
        else:
            ap.error(f"unknown command {a.cmd}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(_main(sys.argv[1:]))
    except MCPError as e:
        print(f"rbx_mcp: {e}", file=sys.stderr)
        sys.exit(2)
