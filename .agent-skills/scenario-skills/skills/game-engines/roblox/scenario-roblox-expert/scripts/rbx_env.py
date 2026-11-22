#!/usr/bin/env python3
"""Environment, places and concurrency for agents working in Roblox Studio (macOS).

    doctor() -> dict                      what is installed and whether Studio answers over MCP
    new_place(dir, name=None, template="baseplate", src=None) -> Path   build a .rbxl with Rojo
    open_place(path, timeout=180) -> Studio                             open it, wait, bind rbx_mcp
    open_places() -> list[dict]                                         places the MCP server sees (read-only)
    machine_load() -> dict                                              {gpu_util, gpu_mem, ram} in percent
    wait_for_gpu(limit=85, ram_limit=75, timeout=1800) -> dict          block until there is headroom
    close_place(path) -> bool                                           ORCHESTRATOR ONLY (refuses by default)
    place_slot(timeout=3600)                                            context manager, RBX_MAX slots

Agents open their place ONCE and keep it open for the whole run; they never close a place and never
signal a Studio process (a SIGTERM hung the window and hid every Studio from the MCP server).

Templates: "baseplate" (512-stud grass baseplate, SpawnLocation, Lighting LightingStyle Realistic
with PrioritizeLightingQuality, written with Technology Future because Studio derives the first two
from Technology when it loads a file; StreamingEnabled off),
"empty" (services only). Both set TextChatService.ChatVersion to TextChatService. `src` maps a Rojo tree fragment, for example
{"ServerScriptService": {"Main": {"$path": "src/Main.server.luau"}}}, merged into the template.
A `"Position": [x, y, z]` in `src` is written as an axis-aligned `CFrame` (Rojo 7.7.1 silently drops
Position and leaves the part at the origin); give a full 12-number `CFrame` for rotated parts.
Places are local files: nothing is published.
"""
from __future__ import annotations

import contextlib
import fcntl
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rbx_mcp import BINARY, MCPError, Studio  # noqa: E402

__version__ = "0.1.0"

APP = Path(os.environ.get("RBX_STUDIO_APP", "/Applications/RobloxStudio.app"))
CACHE = Path(os.environ.get("RBX_SKILLS_CACHE", Path.home() / ".cache" / "rbx-skills"))
RBX_MAX = int(os.environ.get("RBX_MAX", "3"))
RBX_GPU_MAX = float(os.environ.get("RBX_GPU_MAX", "85"))  # percent; no new place window opens above it
RBX_MAX_PLACES = int(os.environ.get("RBX_MAX_PLACES", "4"))  # place windows open at once, machine-wide

_I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]  # identity rotation for 12-number CFrames

BASEPLATE = {
    "Workspace": {
        "$properties": {"StreamingEnabled": False},
        "Baseplate": {"$className": "Part", "$properties": {
            "Anchored": True, "Locked": True, "Size": [512, 20, 512], "CFrame": [0, -10, 0, *_I3],
            "Material": "Grass", "Color": [0.388, 0.584, 0.302], "TopSurface": "Smooth"}},
        "SpawnLocation": {"$className": "SpawnLocation", "$properties": {
            "Anchored": True, "Size": [12, 1, 12], "CFrame": [0, 0.5, 0, *_I3], "Neutral": True}},
    },
    # Scripts cannot read or write Lighting.Technology (RobloxScriptSecurity), but Studio derives LightingStyle
    # and PrioritizeLightingQuality from the file's Technology at load: with only the new pair, the place
    # opened as Soft + false (Technology defaulted to Voxel). Future = Realistic + true.
    "Lighting": {"$properties": {"Technology": "Future", "LightingStyle": "Realistic",
                                 "PrioritizeLightingQuality": True}},
}
SERVICES = ["ReplicatedStorage", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPack",
            "StarterPlayer", "SoundService", "Teams"]


def _positions_to_cframes(node: dict) -> dict:
    """Rojo 7.7.1 builds `"Position": [x, y, z]` with exit 0 and leaves the part at the origin
    (Position is not a serialized property). Rewrite it as an axis-aligned CFrame (12 numbers)."""
    props = node.get("$properties")
    if isinstance(props, dict) and "CFrame" not in props:
        pos = props.get("Position")
        if isinstance(pos, list) and len(pos) == 3:
            props = dict(props)
            props["CFrame"] = [*pos, *_I3]
            del props["Position"]
            node = {**node, "$properties": props}
    return {k: (_positions_to_cframes(v) if isinstance(v, dict) and not k.startswith("$") else v)
            for k, v in node.items()}


def _merge(a: dict, b: dict) -> dict:
    out = json.loads(json.dumps(a))
    for k, v in b.items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def doctor() -> dict:
    """Versions and readiness. `studios` lists Studio windows the MCP server can see."""
    info: dict = {"studio_app": APP.exists(), "studio_mcp_binary": Path(BINARY).exists()}
    plist = APP / "Contents" / "Info.plist"
    if plist.exists():
        r = subprocess.run(["defaults", "read", str(plist), "CFBundleShortVersionString"], capture_output=True,
                           text=True)
        info["studio_version"] = r.stdout.strip() or None
    for tool, args in {"rojo": ["--version"], "luau": None, "lune": ["--version"], "selene": ["--version"],
                       "stylua": ["--version"], "luau-lsp": ["--version"]}.items():
        exe = shutil.which(tool)
        if exe and args:
            r = subprocess.run([exe, *args], capture_output=True, text=True)
            info[tool] = (r.stdout or r.stderr).strip().splitlines()[0] if (r.stdout or r.stderr) else exe
        else:
            info[tool] = exe
    info["studio_running"] = subprocess.run(["pgrep", "-x", "RobloxStudio"], capture_output=True).returncode == 0
    try:
        with Studio(timeout=30) as s:
            for _ in range(8):  # a fresh proxy can list nothing for a few seconds
                info["studios"] = s.studios()
                if info["studios"] or not info["studio_running"]:
                    break
                time.sleep(1.5)
            info["mcp_tools"] = len(s.tools())  # 0 until a Studio with the server enabled connects
    except Exception as e:  # MCP disabled, Studio closed
        info["studios"] = []
        info["mcp_error"] = str(e)
    if info["studio_running"] and not info["studios"]:
        info["hint"] = ("Studio runs but the MCP server sees no place: open a place, then Assistant > ... > "
                        "Manage MCP Servers > 'Enable Studio as MCP server'.")
    return info


def new_place(dir: str | Path, name: str | None = None, template: str = "baseplate",
              src: dict | None = None) -> Path:
    """Write <dir>/default.project.json and build <dir>/<name>.rbxl with Rojo. Returns the .rbxl path."""
    d = Path(dir).resolve()
    d.mkdir(parents=True, exist_ok=True)
    name = name or d.name
    tree: dict = {"$className": "DataModel"}
    for svc in SERVICES:
        tree[svc] = {}
    # A Rojo-built place without this entry loads with the legacy chat (no chat window to test), and
    # scripts cannot change ChatVersion (ui L13, 2026-10-19). New places made in Studio use TextChatService.
    tree["TextChatService"] = {"$properties": {"ChatVersion": "TextChatService"}}
    if template == "baseplate":
        tree = _merge(tree, BASEPLATE)
    elif template != "empty":
        raise ValueError(f"unknown template {template!r}")
    if src:
        tree = _merge(tree, src)
    tree = _positions_to_cframes(tree)
    (d / "default.project.json").write_text(json.dumps({"name": name, "tree": tree}, indent=2))
    out = d / f"{name}.rbxl"
    r = subprocess.run(["rojo", "build", str(d), "-o", str(out)], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"rojo build failed: {r.stderr or r.stdout}")
    return out


def machine_load() -> dict:
    """GPU utilization, GPU memory and RAM in use, in percent (macOS). GPU memory is IOAccelerator
    "Alloc system memory" against 75 % of RAM; RAM in use is active + wired + compressed."""
    out: dict = {"gpu_util": None, "gpu_mem": None, "ram": None}
    r = subprocess.run(["ioreg", "-r", "-d", "1", "-c", "IOAccelerator"], capture_output=True, text=True).stdout
    util = [float(x) for x in re.findall(r'"Device Utilization %"=(\d+)', r)]
    alloc = [int(x) for x in re.findall(r'"Alloc system memory"=(\d+)', r)]
    total = int(subprocess.run(["sysctl", "-n", "hw.memsize"], capture_output=True, text=True).stdout or 0)
    vm = subprocess.run(["vm_stat"], capture_output=True, text=True).stdout
    page = int((re.search(r"page size of (\d+)", vm) or [0, 16384])[1])
    pages = {k: int(v) for k, v in re.findall(r'^"?([^":]+)"?:\s+(\d+)\.', vm, re.M)}
    used = sum(pages.get(k, 0) for k in ("Pages active", "Pages wired down", "Pages occupied by compressor")) * page
    if util:
        out["gpu_util"] = max(util)
    if alloc and total:
        out["gpu_mem"] = round(100 * max(alloc) / (0.75 * total), 1)
    if total:
        out["ram"] = round(100 * used / total, 1)
    return out


def place_windows() -> int:
    """Number of place windows open in Studio (one child process per local place)."""
    # Anchored on the executable path: an unanchored pattern also matched agents' shells quoting it.
    # Built from APP, the app open_place launches, so an RBX_STUDIO_APP override is counted too.
    exe = re.sub(r"([.^$*+?()\[\]{}|\\])", r"\\\1", str(APP / "Contents" / "MacOS" / "RobloxStudio"))
    r = subprocess.run(["pgrep", "-f", f"^{exe} -localPlaceFile"], capture_output=True, text=True)
    return len(r.stdout.split())


def wait_for_gpu(limit: float = RBX_GPU_MAX, ram_limit: float = 75, max_places: int = RBX_MAX_PLACES,
                 timeout: float = 3600) -> dict:
    """Block while GPU utilization or GPU memory is above `limit` %, RAM in use above `ram_limit` %,
    or `max_places` place windows are already open.

    Every open Studio window renders all the time, so each new place adds GPU load."""
    deadline = time.time() + timeout
    while True:
        m = machine_load()
        m["places"] = place_windows()
        busy = m["places"] >= max_places or any(
            v is not None and v > lim for v, lim in
            ((m["gpu_util"], limit), (m["gpu_mem"], limit), (m["ram"], ram_limit)))
        if not busy or time.time() > deadline:
            return m
        time.sleep(10)


def open_place(path: str | Path, timeout: float = 180) -> Studio:
    """Open a local place in Studio and return an open Studio session bound to it.

    Matches the window by file name. The caller closes the session (`with` block or .close())."""
    p = Path(path).resolve()
    s = Studio(place=p.name).open()
    try:
        s.bind()
        return s  # already open
    except MCPError:
        pass
    wait_for_gpu()  # a new window adds a full viewport render
    subprocess.run(["open", "-g", "-a", str(APP), str(p)], check=True)
    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(3)
        try:
            s.studio_id = None
            s.bind()
            return s
        except MCPError:
            continue
    s.close()
    raise MCPError(f"{p.name} did not appear in list_roblox_studios within {timeout:.0f}s "
                   "(is the MCP server enabled in Studio?)")


def open_places() -> list[dict]:
    """Places the Studio MCP server sees now ({id, name} rows of list_roblox_studios). Changes nothing.

    A fresh proxy can list nothing for a few seconds while Studio connects to it: retries for about 12 s."""
    with Studio(timeout=30) as s:
        rows: list[dict] = []
        for _ in range(8):
            rows = s.studios()
            if rows:
                break
            time.sleep(1.5)
        return rows


def close_place(path: str | Path) -> bool:
    """ORCHESTRATOR ONLY. Close the Studio window of this place without saving; True when one was closed.

    Agents never close places: it returns False unless RBX_ALLOW_CLOSE=1 is set by the person or the
    orchestrator running the session, with the user's agreement. Uses macOS UI scripting (Accessibility
    permission for the terminal). Never quits Studio and never signals a process."""
    if os.environ.get("RBX_ALLOW_CLOSE") != "1":
        print("rbx_env.close_place: refused (agents keep their place open; set RBX_ALLOW_CLOSE=1 only as "
              "the orchestrator, with the user's agreement)", file=sys.stderr)
        return False
    name = Path(path).name
    stem = Path(path).stem
    # The title may carry the file name or only the stem ("arena - Roblox Studio").
    script = f'''
tell application "System Events" to tell process "RobloxStudio"
  set ws to (every window whose name contains "{name}")
  if (count of ws) is 0 then set ws to (every window whose name is "{stem}" or name starts with "{stem} " or name starts with "{stem}.")
  if (count of ws) is 0 then return "none"
  set w to item 1 of ws
  perform action "AXRaise" of w
  click (first button of w whose subrole is "AXCloseButton")
  delay 1.5
  repeat with b in {{"Don't Save", "Don’t Save", "Discard", "No"}}
    try
      click button (b as text) of (first window whose name is not (name of w))
      exit repeat
    end try
    try
      click button (b as text) of sheet 1 of w
      exit repeat
    end try
  end repeat
  return "closed"
end tell'''
    r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=60)
    return r.stdout.strip() == "closed"


@contextlib.contextmanager
def place_slot(timeout: float = 3600):
    """Hold one of RBX_MAX machine-wide slots while an agent keeps a place open in Studio."""
    lock_dir = CACHE / "slots"
    lock_dir.mkdir(parents=True, exist_ok=True)
    deadline = time.time() + timeout
    while True:
        for i in range(RBX_MAX):
            with open(lock_dir / f"slot{i}.lock", "w") as f:
                try:
                    fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    continue
                f.write(f"{os.getpid()}\n")
                f.flush()
                try:
                    yield i
                finally:
                    fcntl.flock(f, fcntl.LOCK_UN)
            return
        if time.time() > deadline:
            raise TimeoutError(f"no free Studio slot in {timeout:.0f}s (RBX_MAX={RBX_MAX})")
        time.sleep(5)


if __name__ == "__main__":
    print(json.dumps(doctor(), indent=1))
