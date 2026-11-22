#!/usr/bin/env python3
"""gd_live: the live channels (a running game, a running editor, community MCP servers).

System python3, standard library only. Nothing here edits ~/.claude, installs globally, or closes a
process it did not start.

Channels, most reliable first (see SKILL.md "Execution channels"):
  1. headless jobs (gd_run.run_script)          ground truth for errors, data, tests, exports
  2. windowed jobs (gd_run.capture_scene, ...)  anything that must be rendered: screenshots, GPU timing
  3. headless editor (run_script(editor=True))  EditorInterface work: open, edit, save scenes, reimport
  4. GUI editor + MCP bridge                    live scene tree and selection in the user's open editor

    channels(project=None) -> dict
    screenshot_game(project, scene=None, out="captures/live.png", size=(1280, 720), **kw) -> dict
    open_editor(project, wait=False) -> dict            only on the user's request (it takes focus)
    mcp_servers() -> dict                               what each community server needs and does
    mcp_config(server, project=None) -> dict            project-local .mcp.json entry (not written)
    write_mcp_config(project, server) -> Path           writes <project>/.mcp.json only
    mcp_probe(server="hybridindie", timeout=120) -> dict  start the server over stdio, list its tools
"""
from __future__ import annotations

__version__ = "0.1"

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

MCP_SERVERS = {
    "hybridindie": {
        "repo": "https://github.com/hybridindie/godot-mcp",
        "kind": "live editor bridge (Python server, PyPI godot-editor-mcp, plus addons/godot_mcp in the project)",
        "needs": "GUI editor open with the addon enabled; the addon connects to ws://127.0.0.1:9080",
        "tools": "193 tools in 29 toolsets; only core + inspection on by default; mutating tools take dry_run, destructive ones confirm",
        "run": ["uvx", "--from", "godot-editor-mcp", "godot-editor-mcp"],
        "addon_zip": "https://github.com/hybridindie/godot-mcp/releases/latest/download/godot_mcp_addon.zip",
        "best_for": "reading the user's open scene, selection and editor state; undoable edits in the open editor",
    },
    "tugcantopaloglu": {
        "repo": "https://github.com/tugcantopaloglu/godot-mcp",
        "kind": "Node server (fork of Coding-Solo/godot-mcp): headless scene operations plus a TCP autoload for a running game",
        "needs": "git clone + npm install + npm run build; GODOT_PATH; runtime tools need build/scripts/mcp_interaction_server.gd as an autoload (port 9090)",
        "tools": "157 tools: headless read_scene/modify_scene_node/validate_script, game_* runtime tools (eval, input, properties)",
        "run": ["node", "<clone>/build/index.js"],
        "best_for": "driving a RUNNING game (input, eval, property reads) when a test must interact live",
    },
}


def channels(project=None) -> dict:
    """What can run on this machine right now, and whether a GUI Godot holds the project."""
    import gd_env
    import gd_run
    info: dict = {}
    try:
        g = gd_env.find_godot()
        info["godot"] = g
        info["version"] = gd_env.version(g)
        info["templates_ok"] = gd_env.templates_ok()
    except Exception as exc:  # pragma: no cover
        info["godot_error"] = str(exc)
    info["windowed_possible"] = sys.platform in ("darwin", "win32") and not os.environ.get("SSH_CONNECTION")
    info["running_godot"] = gd_run.running_godot()
    if project:
        info["gui_on_project"] = gd_run.gui_editor_pids(project)
        info["mcp_json"] = (Path(project) / ".mcp.json").exists()
        info["gut_installed"] = (Path(project) / "addons" / "gut").exists()
        info["agentkit_installed"] = (Path(project) / "addons" / "agentkit" / "agent_job.gd").exists()
    info["uvx"] = shutil.which("uvx")
    info["node"] = shutil.which("node")
    info["gd_max"] = gd_run.GD_MAX
    info["gd_max_windowed"] = gd_run.GD_MAX_WINDOWED
    return info


def screenshot_game(project, scene: str | None = None, out: str = "captures/live.png", size=(1280, 720), **kw) -> dict:
    """Screenshot of the game as it renders: a windowed AgentKit capture (tiny window, focus given back)."""
    import gd_run
    return gd_run.capture_scene(project, scene, out=out, size=size, **kw)


def open_editor(project, wait: bool = False) -> dict:
    """Open the GUI editor on a project. It takes focus and then gd_run refuses that project, so do it
    only when the user asks for the editor. Uses `open -n -a Godot.app --args --path P -e`."""
    import gd_env
    p = str(Path(project).resolve())
    g = gd_env.find_godot()
    app = g.split("/Contents/MacOS/")[0] if ".app/Contents/MacOS/" in g else None
    if sys.platform == "darwin" and app:
        cmd = ["open", "-n", "-a", app, "--args", "--path", p, "-e"]
        subprocess.run(cmd, check=True)
    else:
        cmd = [g, "--path", p, "-e"]
        subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    pids: list[int] = []
    if wait:
        import gd_run
        for _ in range(40):
            time.sleep(0.5)
            pids = gd_run.gui_editor_pids(p)
            if pids:
                break
    return {"cmd": cmd, "pids": pids}


def mcp_servers() -> dict:
    return MCP_SERVERS


def mcp_config(server: str, project=None, clone: str | None = None) -> dict:
    """The mcpServers entry for a project-local .mcp.json (Claude Code reads it per project)."""
    import gd_env
    if server == "hybridindie":
        entry = {"command": "uvx", "args": ["--from", "godot-editor-mcp", "godot-editor-mcp"], "env": {}}
    elif server == "tugcantopaloglu":
        if not clone:
            raise ValueError("pass clone=<path of the built tugcantopaloglu/godot-mcp checkout>")
        entry = {"command": "node", "args": [str(Path(clone) / "build" / "index.js")], "env": {"GODOT_PATH": gd_env.find_godot()}}
    else:
        raise ValueError(f"unknown server {server}; known: {list(MCP_SERVERS)}")
    return {"mcpServers": {f"godot-{server}": entry}}


def write_mcp_config(project, server: str, clone: str | None = None) -> Path:
    """Write <project>/.mcp.json (merging other servers). Project-local only; never touches ~/.claude."""
    p = Path(project) / ".mcp.json"
    data = json.loads(p.read_text()) if p.exists() else {}
    data.setdefault("mcpServers", {}).update(mcp_config(server, project, clone)["mcpServers"])
    p.write_text(json.dumps(data, indent=2) + "\n")
    return p


def _rpc(proc, msg: dict) -> None:
    proc.stdin.write(json.dumps(msg) + "\n")
    proc.stdin.flush()


def _read_until(proc, want_id: int, timeout: float) -> dict | None:
    end = time.time() + timeout
    while time.time() < end:
        line = proc.stdout.readline()
        if not line:
            time.sleep(0.05)
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        if msg.get("id") == want_id:
            return msg
    return None


def mcp_probe(server: str = "hybridindie", timeout: float = 120, clone: str | None = None, call: tuple[str, dict] | None = None) -> dict:
    """Start an MCP server over stdio (uvx or node, nothing installed globally), initialize, list its
    tools, optionally call one tool, then stop the server this function started."""
    cfg = mcp_config(server, None, clone)["mcpServers"][f"godot-{server}"]
    env = dict(os.environ)
    env.update(cfg.get("env", {}))
    t0 = time.time()
    proc = subprocess.Popen([cfg["command"], *cfg["args"]], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, text=True, env=env)
    out: dict = {"server": server, "cmd": [cfg["command"], *cfg["args"]]}
    try:
        _rpc(proc, {"jsonrpc": "2.0", "id": 1, "method": "initialize",
                    "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "gd_live", "version": "0.1"}}})
        init = _read_until(proc, 1, timeout)
        out["initialized"] = init is not None and "result" in init
        out["server_info"] = (init or {}).get("result", {}).get("serverInfo")
        _rpc(proc, {"jsonrpc": "2.0", "method": "notifications/initialized"})
        _rpc(proc, {"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
        tl = _read_until(proc, 2, 60)
        tools = [t["name"] for t in (tl or {}).get("result", {}).get("tools", [])]
        out["tool_count"] = len(tools)
        out["tools_sample"] = tools[:25]
        if call:
            _rpc(proc, {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": call[0], "arguments": call[1]}})
            cr = _read_until(proc, 3, 120)
            out["call"] = {"name": call[0], "response": (cr or {}).get("result") or (cr or {}).get("error")}
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
    out["seconds"] = round(time.time() - t0, 1)
    out["ok"] = bool(out.get("initialized")) and out.get("tool_count", 0) > 0
    return out


if __name__ == "__main__":
    print(json.dumps(channels(sys.argv[1] if len(sys.argv) > 1 else None), indent=2, default=str))
