#!/usr/bin/env python3
"""Playtest a place from an agent: start, wait for Server and Client, act, observe, stop.

    from rbx_mcp import Studio
    from rbx_play import Playtest
    with Studio(place="arena") as s, Playtest(s) as pt:
        pt.server("return #game.Players:GetPlayers()")          # rbx_run result dict
        pt.client("return game.Players.LocalPlayer.Character ~= nil")
        pt.keys([{"action": "keyPress", "key_code": "Space"}])   # user_keyboard_input actions
        pt.navigate(x=0, y=3, z=20)                              # character_navigation
        pt.capture("evidence/jump.png")
        log = pt.console()
    # leaving the block stops the playtest, even after an exception

`wait_for(code, dm, timeout)` polls a chunk until it returns a truthy `result`.
`press("Space", hold=0.5)` and `walk_to([0, 3, 20])` build their arguments from the tool schemas;
`tool_schema(studio, name)` returns one tool's inputSchema.
Tool argument names come from the server's own schemas (tools/list), so the module follows
Studio updates instead of hard-coding them. tools/list is empty until a Studio connects.

CLI (smoke test): rbx_play.py [--studio NAME] [--seconds 5] [--capture out.png]
"""
from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rbx_mcp import MCPError, Studio  # noqa: E402
from rbx_run import run  # noqa: E402

__version__ = "0.1.0"


def _schemas(studio: Studio) -> dict:
    cache = getattr(studio, "_schemas", None)
    if not cache:  # tools/list is empty until a Studio connects: never cache that
        cache = {t["name"]: t.get("inputSchema", {}) for t in studio.tools()}
        if cache:
            studio._schemas = cache
    return cache


def tool_schema(studio: Studio, name: str) -> dict:
    """inputSchema of one StudioMCP tool ({} when the tool is not exposed)."""
    return _schemas(studio).get(name, {})


def play_args(studio: Studio, start: bool) -> dict:
    """Arguments for start_stop_play, read from its schema (bool flag or enum)."""
    props = _schemas(studio).get("start_stop_play", {}).get("properties", {})
    if not [n for n in props if n != "studio_id"] and "start_stop_play" in _schemas(studio):
        return {}  # a pure toggle
    for name, p in props.items():
        if name == "studio_id":
            continue
        if p.get("type") == "boolean":
            return {name: start}
        if "enum" in p:
            vals = [str(v) for v in p["enum"]]
            want = [v for v in vals if (v.lower().startswith(("start", "play", "run")) if start
                                        else v.lower().startswith(("stop", "end")))]
            if want:
                return {name: want[0]}
    raise MCPError(f"start_stop_play schema not understood: {props}")


class Playtest:
    """Context manager around one playtest session of the bound Studio."""

    def __init__(self, studio: Studio, settle: float = 2.0, timeout: float = 90.0, character: bool = True):
        self.s = studio
        self.settle = settle
        self.timeout = timeout
        self.character = character

    # -- lifecycle -------------------------------------------------------------
    def state(self) -> str:
        return self.s.text(self.s.call("get_studio_state"))

    def mode(self) -> str:
        """'Edit', 'Play' or '' from get_studio_state ("Current Studio Mode: ...")."""
        m = re.search(r"Current Studio Mode:\s*(\w+)", self.state())
        return m[1] if m else ""

    def _toggle(self, start: bool) -> None:
        want = "Play" if start else "Edit"
        for attempt in range(2):
            try:
                self.s.call("start_stop_play", play_args(self.s, start), timeout=min(self.timeout, 45))
                return
            except MCPError:
                # The reply can be lost (observed: no answer in 120 s while play had started), for example
                # when another agent's StudioMCP proxy, the one hosting the port, exits mid-call. Read the state.
                deadline = time.time() + 20
                while time.time() < deadline:
                    try:
                        if self.mode() == want:
                            return
                    except MCPError:
                        pass
                    time.sleep(2)
                if attempt:
                    raise

    def __enter__(self) -> "Playtest":
        try:
            self._toggle(True)
            deadline = time.time() + self.timeout
            last = None
            while time.time() < deadline:
                r = run(self.s, "return true", "Server")
                c = run(self.s, "return game:GetService('Players').LocalPlayer ~= nil", "Client")
                if r["ok"] and c["ok"] and c["result"]:
                    break
                last = (r.get("error"), c.get("error"))
                time.sleep(1)
            else:
                raise MCPError(f"playtest did not expose Server and Client data models in {self.timeout:.0f}s: {last}")
            if self.character:
                self.wait_for("local p = game:GetService('Players').LocalPlayer "
                              "return p.Character ~= nil and p.Character:FindFirstChildOfClass('Humanoid') ~= nil",
                              "Client", self.timeout)
            time.sleep(self.settle)
            return self
        except BaseException:
            self.__exit__(None, None, None)  # never leave the place in Play mode
            raise

    def __exit__(self, *exc) -> None:
        try:
            self._toggle(False)
        except MCPError:
            pass  # already stopped, or Studio unreachable: get_studio_state tells

    # -- code ------------------------------------------------------------------
    def server(self, code: str, timeout: float | None = None, kit: list[str] | tuple[str, ...] = ()) -> dict:
        return run(self.s, code, "Server", timeout, kit)

    def client(self, code: str, timeout: float | None = None, kit: list[str] | tuple[str, ...] = ()) -> dict:
        return run(self.s, code, "Client", timeout, kit)

    def wait_for(self, code: str, dm: str = "Server", timeout: float = 30.0, every: float = 0.5) -> dict:
        """Poll `code` until it returns a truthy result. Raises TimeoutError with the last result."""
        deadline = time.time() + timeout
        r: dict = {}
        while time.time() < deadline:
            r = run(self.s, code, dm)
            if r["ok"] and r["result"]:
                return r
            time.sleep(every)
        raise TimeoutError(f"wait_for timed out after {timeout:.0f}s: {r}")

    # -- input and observation ---------------------------------------------------
    def keys(self, actions: list[dict], **extra) -> str:
        return self.s.text(self.s.call("user_keyboard_input", {"actions": actions, "datamodel_type": "Client", **extra}))

    def mouse(self, actions: list[dict], **extra) -> str:
        return self.s.text(self.s.call("user_mouse_input", {"actions": actions, "datamodel_type": "Client", **extra}))

    def navigate(self, **args) -> str:
        """character_navigation: navigate(x=0, y=3, z=20) or navigate(instance_path="Workspace.Goal"),
        optional speed_multiplier (0.1 to 10)."""
        return self.s.text(self.s.call("character_navigation", {"datamodel_type": "Client", **args},
                                       timeout=self.timeout))

    def console(self) -> str:
        return self.s.text(self.s.call("get_console_output"))

    def capture(self, out: str | Path, **extra) -> Path:
        return self.s.capture(out, extra or None)

    # -- schema-built input (argument names read from tools/list, live run pending) --------
    def press(self, key: str, hold: float = 0.0) -> str:
        """Press one key (hold > 0: key down, wait, key up). Builds the action from the
        user_keyboard_input schema, so it follows whatever names Studio uses."""
        fields = _action_fields(tool_schema(self.s, "user_keyboard_input"))
        kind, keyf, wait_f, vals = fields["kind"], fields["key"], fields["wait"], fields["kinds"]

        def act(k: str, **more) -> dict:
            return {kind: _pick(vals, k), **more}
        if hold > 0:
            # Live schema (Studio 0.743): wait_time_ms, 0 to 10000.
            wait = round(hold * 1000) if wait_f.lower().endswith("ms") else hold
            seq = [act("down", **{keyf: key}), act("wait", **{wait_f: wait}), act("up", **{keyf: key})]
        else:
            seq = [act("press", **{keyf: key})]
        return self.keys(seq)

    def walk_to(self, position, speed: float | None = None) -> str:
        """character_navigation to a world position [x, y, z]; argument shape read from the schema."""
        props = tool_schema(self.s, "character_navigation").get("properties", {})
        if all(k in props for k in ("x", "y", "z")):  # live schema (Studio 0.743): separate x, y, z
            x, y, z = (float(c) for c in position)
            args: dict = {"x": x, "y": y, "z": z}
        else:
            name = next((n for n in props if "pos" in n.lower() or "target" in n.lower()), "position")
            args = {name: _vec(props.get(name, {}), position)}
        sp = next((n for n in props if "speed" in n.lower()), None)
        if speed is not None and sp:
            args[sp] = speed
        return self.navigate(**args)


def _pick(values: list[str], want: str) -> str:
    for v in values:
        if v.lower() == want or v.lower().replace("_", "") == want.replace("_", ""):
            return v
    for v in values:
        if want in v.lower():
            return v
    return want


def _vec(prop: dict, v) -> object:
    x, y, z = (float(c) for c in v)
    t = prop.get("type")
    if t == "object":
        keys = list(prop.get("properties", {})) or ["x", "y", "z"]
        low = {k.lower(): k for k in keys}
        return {low.get("x", "x"): x, low.get("y", "y"): y, low.get("z", "z"): z}
    if t == "string":
        return f"{x}, {y}, {z}"
    return [x, y, z]


def _action_fields(schema: dict) -> dict:
    """Field names of one input action: the enum field (kind), the key field and the wait field."""
    items = schema.get("properties", {}).get("actions", {}).get("items", {})
    props = items.get("properties", {})
    kind = next((n for n, p in props.items() if "enum" in p), "type")
    kinds = [str(v) for v in props.get(kind, {}).get("enum", [])]
    keyf = next((n for n in props if "key" in n.lower()), "key")
    wait_f = next((n for n in props if any(s in n.lower() for s in ("duration", "seconds", "time", "wait"))
                   and n != kind), "duration")
    return {"kind": kind, "kinds": kinds, "key": keyf, "wait": wait_f}


def main(argv: list[str]) -> int:
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--studio")
    ap.add_argument("--seconds", type=float, default=5.0)
    ap.add_argument("--capture")
    a = ap.parse_args(argv)
    with Studio(studio=a.studio) as s, Playtest(s) as pt:
        report = {
            "server": pt.server("return {players = #game:GetService('Players'):GetPlayers(), "
                                "time = workspace.DistributedGameTime}"),
            "client": pt.client("local c = game:GetService('Players').LocalPlayer.Character "
                                "return c and c:GetPivot().Position"),
        }
        time.sleep(a.seconds)
        if a.capture:
            report["capture"] = str(pt.capture(a.capture))
        report["console_tail"] = pt.console()[-2000:]
    print(json.dumps(report, indent=1))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except (MCPError, TimeoutError) as e:
        print(f"rbx_play: {e}", file=sys.stderr)
        sys.exit(2)
