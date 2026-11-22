#!/usr/bin/env python3
"""Network security harness for Roblox places: audits, exploit tests, latency, payload probes.

Built on the scenario-roblox-expert toolkit (rbx_mcp, rbx_run, rbx_play). Studio only for the
live helpers; `audit_place`, `kit_tree` and `vendor_kit` run offline.

    import sys; sys.path[:0] = ["<skills>/scenario-roblox-expert/scripts", "<skills>/scenario-roblox-networking/scripts"]
    import rbx_net
    rbx_net.audit_place("arena.rbxl")                       # offline, Lune: findings + Server Authority settings
    src = {"ServerScriptService": {"NetKit": rbx_net.kit_tree(project_dir)}}   # for rbx_env.new_place(src=...)
    tree = rbx_net.vendor_kit(user_repo, "src/server/NetKit")  # a user's repository: copies, in-repo paths (default dest src/NetKit)
    r = rbx_net.run(studio, "return NetAudit.run(game, Audit)", kit=["NetAudit"], lead_kit=["Audit"])
    with Playtest(studio) as pt:
        rbx_net.fuzz(pt, "ReplicatedStorage.Remotes.Buy")    # every hostile payload, from the Client
        rbx_net.net_log(pt)                                  # ServerStorage.NetLog counters and scores

Pure modules (Guard, RateLimit, Suspicion, HitCheck, MoveGuard, Exploit, NetAudit) can be inlined as
locals into an rbx_run chunk with `kit=[...]`; Net.luau needs sibling ModuleScripts in the place.

CLI:
  rbx_net.py audit <place.rbxl> [--warn]     offline audit (Lune)
  rbx_net.py tree <project_dir>              Rojo fragment for the NetKit folder
  rbx_net.py vendor <project_dir> [--dest D] copy NetKit into the project (default src/NetKit), print its fragment
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
KIT_DIR = HERE / "agentkit" / "networking"
LEAD = HERE.parents[1] / "scenario-roblox-expert" / "scripts"
sys.path.insert(0, str(LEAD))
import rbx_run  # noqa: E402

__version__ = "0.1.0"

PURE = ("Guard", "RateLimit", "Suspicion", "HitCheck", "MoveGuard", "Exploit", "NetAudit")
PLACE_KIT = ("Guard", "RateLimit", "Suspicion", "Net", "HitCheck", "MoveGuard")


def kit_source(names) -> str:
    parts = []
    for n in names:
        if n not in PURE:
            raise ValueError(f"{n} cannot be inlined (needs sibling ModuleScripts): put it in the place")
        parts.append(f"local {n} = (function()\n{(KIT_DIR / f'{n}.luau').read_text()}\nend)()")
    return "\n".join(parts) + "\n" if parts else ""


def run(studio, code: str, dm: str = "Edit", kit=(), lead_kit=(), timeout: float | None = None) -> dict:
    """rbx_run.run with this skill's pure modules inlined before `code`. Same result dict."""
    head = kit_source(kit)
    r = rbx_run.run(studio, head + code, dm, timeout=timeout, kit=list(lead_kit))
    if r.get("error") and head:
        r["error"] = rbx_run._fix_lines(r["error"], head.count("\n"))
    return r


def kit_tree(project_dir: str | Path, modules=PLACE_KIT) -> dict:
    """Rojo tree fragment {Name: {"$path": ...}} for a NetKit Folder, paths relative to project_dir."""
    rel = os.path.relpath(KIT_DIR, Path(project_dir).resolve())
    return {"$className": "Folder", **{m: {"$path": f"{rel}/{m}.luau"} for m in modules}}


def vendor_kit(project_dir: str | Path, dest: str = "src/NetKit", modules=PLACE_KIT) -> dict:
    """Copy NetKit into <project_dir>/<dest> and return its Rojo fragment, paths inside the project.

    kit_tree points into the installed skills folder: fine for a test place, broken in a user's repository."""
    out = Path(project_dir).resolve() / dest
    out.mkdir(parents=True, exist_ok=True)
    for m in modules:
        shutil.copyfile(KIT_DIR / f"{m}.luau", out / f"{m}.luau")
    return {"$className": "Folder", **{m: {"$path": f"{Path(dest).as_posix()}/{m}.luau"} for m in modules}}


def audit_place(place: str | Path, warn_only: bool = False) -> dict:
    """Offline audit of a .rbxl/.rbxlx with Lune: NetAudit + lead Audit.remotes + Server Authority settings."""
    cmd = ["lune", "run", str(KIT_DIR / "lune_net_audit.luau"), str(Path(place).resolve())]
    if warn_only:
        cmd.append("--warn")
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        raise RuntimeError(f"lune_net_audit failed: {r.stderr or r.stdout}")
    return json.loads(r.stdout)


# ---------------------------------------------------------------- live helpers (Studio)

def set_latency(studio, inbound_ms: float, outbound_ms: float, jitter_ms: float = 0.0,
                loss_pct: float = 0.0) -> dict:
    """Network Simulator values through NetworkSettings (PluginSecurity), before starting a playtest.

    Loss is a percent capped at 0.5 by the engine. Returns the values read back, or the error."""
    code = f"""
local n = settings().Network
n.InboundNetworkMinDelayMs = {inbound_ms}
n.OutboundNetworkMinDelayMs = {outbound_ms}
n.InboundNetworkJitterMs = {jitter_ms}
n.OutboundNetworkJitterMs = {jitter_ms}
n.InboundNetworkLossPercent = {loss_pct}
n.OutboundNetworkLossPercent = {loss_pct}
return {{inbound = n.InboundNetworkMinDelayMs, outbound = n.OutboundNetworkMinDelayMs,
  jitter = n.InboundNetworkJitterMs, loss = n.InboundNetworkLossPercent}}"""
    return rbx_run.run(studio, code, "Edit")


def net_log(pt) -> dict:
    """Counters and per-player suspicion from ServerStorage.NetLog (written by Net.luau)."""
    r = pt.server("""
local log = game:GetService("ServerStorage"):FindFirstChild("NetLog")
if not log then return {missing = true} end
local players = {}
for _, f in log.Players:GetChildren() do players[f.Name] = f:GetAttributes() end
return {counters = log:GetAttributes(), players = players}""")
    return r.get("result") or {"error": r.get("error")}


def counter(log: dict, name: str) -> float:
    return float((log.get("counters") or {}).get(name, 0) or 0)


def fuzz(pt, remote_path: str, prefix_lua: str = "nil", instance_lua: str = "workspace.Baseplate",
         valid_lua: str = "nil", gap: float = 0.0) -> dict:
    """Fire every Exploit payload at a remote from the Client data model.

    remote_path: dotted path from game, e.g. "ReplicatedStorage.Remotes.Buy".
    prefix_lua: Lua table literal of leading arguments kept fixed (e.g. '{"Sword"}').
    gap: seconds between calls; set it above 1 / refill rate so cases reach validation, not the limiter."""
    code = f"""
local remote = game
for part in string.gmatch("{remote_path}", "[^%.]+") do remote = remote:WaitForChild(part, 5) end
local cases = Exploit.payloads({{instance = {instance_lua}, valid = {valid_lua}}})
local n, refused = Exploit.fire(remote, cases, {prefix_lua or "nil"}, {gap})
local names = {{}}
for _, c in cases do table.insert(names, c.name) end
return {{sent = n, refused = refused, cases = names}}"""
    return run(pt.s, code, "Client", kit=["Exploit"], timeout=60 + gap * 30)


def exploit_case(pt, name: str, client_lua: str, server_lua: str, settle: float = 1.0) -> dict:
    """Run `client_lua` in the Client data model, wait, then `server_lua` in the Server data model.

    Both chunks can use the Exploit module; return values come back as rbx_run results."""
    c = run(pt.s, client_lua, "Client", kit=["Exploit"])
    time.sleep(settle)
    s = pt.server(server_lua)
    return {"name": name, "client": c, "server": s}


def payload_probe(pt, random_sizes=(200, 900, 1000, 1100, 2000), zero_sizes=(1100, 4000),
                  remote: str = "PayloadProbe", repeats: int = 3, gap: float = 0.1) -> dict:
    """Send buffers through ReplicatedStorage.Remotes.<remote>; return arrivals per size and series.

    Random bytes (first byte 1 to 255) do not compress; zero-filled buffers do. The server side counts
    `<remote>_r<len>` and `<remote>_z<len>` in ServerStorage.NetLog (see the test arena place).
    Returns {arrived: {"r900": 3, ...}, refused: [...], sent_each}."""
    def lua_list(xs):
        return "{" + ", ".join(str(int(x)) for x in xs) + "}"
    code = f"""
local r = game:GetService("ReplicatedStorage"):WaitForChild("Remotes"):WaitForChild("{remote}")
local refused = {{}}
local function send(b, label)
  for _ = 1, {repeats} do
    local ok, err = pcall(function() r:FireServer(b) end)
    if not ok then table.insert(refused, label .. ": " .. tostring(err)) end
    task.wait({gap})
  end
end
for _, size in {lua_list(random_sizes)} do
  local b = buffer.create(size)
  for i = 0, size - 1 do buffer.writeu8(b, i, math.random(1, 255)) end
  send(b, "r" .. size)
end
for _, size in {lua_list(zero_sizes)} do send(buffer.create(size), "z" .. size) end
return refused"""
    c = run(pt.s, code, "Client", timeout=120)
    time.sleep(1.0)
    log = net_log(pt)
    arrived = {f"r{int(s)}": int(counter(log, f"{remote}_r{int(s)}")) for s in random_sizes}
    arrived.update({f"z{int(s)}": int(counter(log, f"{remote}_z{int(s)}")) for s in zero_sizes})
    return {"client_ok": c.get("ok"), "refused": c.get("result") or [], "error": c.get("error"),
            "arrived": arrived, "sent_each": repeats}


def _main(argv: list[str]) -> int:
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["audit", "tree", "vendor"])
    ap.add_argument("path")
    ap.add_argument("--warn", action="store_true")
    ap.add_argument("--dest", default="src/NetKit")
    a = ap.parse_args(argv)
    if a.cmd == "audit":
        r = audit_place(a.path, a.warn)
        print(json.dumps(r, indent=1))
        return 1 if r["tally"].get("error", 0) else 0
    tree = vendor_kit(a.path, a.dest) if a.cmd == "vendor" else kit_tree(a.path)
    print(json.dumps(tree, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
