#!/usr/bin/env python3
"""rbx_gameplay: put the gameplay AgentKit into an open place, build test fixtures, run audits.

Library (with a Studio session from rbx_env.open_place inside rbx_env.place_slot):
    install(studio)              Edit: GameplayKit modules, boot scripts, Input Action System instances
    build_fixtures(studio)       Edit: Map walls, NPC template, three dummies, one car
    hook(pt, "stats")            playtest Server: ServerStorage.GameplayHook:Invoke(cmd, a, b)
    key_actions(pt, [("press", "F"), ("wait", 0.35), ...])   user_keyboard_input actions from the schema
    unit_tests()                 Lune unit tests of the pure modules (no Studio)
    audit_place(path)            GameplayAudit on a place or model file (Lune, no Studio)

CLI:
    python3 rbx_gameplay.py unit
    python3 rbx_gameplay.py audit <place.rbxl|model.rbxm>
    python3 rbx_gameplay.py install <place.rbxl>    opens YOUR place once (rbx_env), installs, builds fixtures
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
LEAD = HERE.parents[1] / "scenario-roblox-expert" / "scripts"
sys.path.insert(0, str(LEAD))

KIT = HERE / "agentkit" / "gameplay"
SERVER_MODULES = ["StateMachine", "NpcBrain", "Combo", "Hitbox", "Projectile", "NpcService", "Car",
                  "PathGuard", "DebugDraw", "GameplayInputs", "CarSafety", "NpcPool"]
SHARED_MODULES = ["Car"]


def _long_string(text: str) -> str:
    level = 1
    while f"]{'=' * level}]" in text:
        level += 1
    eq = "=" * level
    return f"[{eq}[\n{text}]{eq}]"  # Luau drops a newline right after the opening bracket


class V3(tuple):
    """A Vector3 literal for hook() arguments: V3((x, y, z))."""


def lua(v) -> str:
    """Python value to a Luau literal (dict, list, str, number, bool, None, V3)."""
    if v is None:
        return "nil"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, V3):
        return "Vector3.new(%s)" % ", ".join(repr(float(c)) for c in v)
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, str):
        return json.dumps(v)
    if isinstance(v, dict):
        return "{" + ", ".join(f"[{json.dumps(str(k))}] = {lua(x)}" for k, x in v.items()) + "}"
    if isinstance(v, (list, tuple)):
        return "{" + ", ".join(lua(x) for x in v) + "}"
    raise TypeError(f"no Luau literal for {type(v).__name__}")


# ------------------------------------------------------------------ install
INSTALL_LUAU = r'''
local changed, made = {}, {}
local function at(path: { string }): Instance
	local inst: Instance = game:GetService(path[1])
	for i = 2, #path do
		local c = inst:FindFirstChild(path[i])
		if not c then
			c = Instance.new("Folder")
			c.Name = path[i]
			c.Parent = inst
			table.insert(made, c:GetFullName())
		end
		inst = c
	end
	return inst
end
for _, it in ITEMS do
	local parent = at(it.parent)
	local inst = parent:FindFirstChild(it.name)
	if inst and inst.ClassName ~= it.class then
		inst.Name = it.name .. "_old" -- replaced in memory only; nothing is saved
		inst.Parent = nil
		inst = nil
	end
	if not inst then
		inst = Instance.new(it.class)
		inst.Name = it.name
		if it.context then
			(inst :: any).RunContext = Enum.RunContext[it.context]
		end
		inst.Parent = parent
		table.insert(made, inst:GetFullName())
	end
	if (inst :: any).Source ~= it.src then
		if inst:IsA("ModuleScript") then
			-- Edit-side require caches a ModuleScript across Source edits; a fresh instance reloads.
			local fresh = inst:Clone()
			inst.Parent = nil
			inst = fresh
		end
		(inst :: any).Source = it.src
		inst.Parent = parent
		table.insert(changed, inst:GetFullName())
	end
end
-- Input Action System: ReplicatedStorage.GameplayInputs.Combat (InputContext) > Attack (InputAction)
-- with Key, Mouse, Pad and Touch bindings; the touch button lives in StarterGui.GameplayTouch.
local inputs = at({ "ReplicatedStorage", "GameplayInputs" })
local ias = {}
local ok, err = pcall(function()
	local kit = game:GetService("ServerScriptService"):WaitForChild("GameplayKit")
	local GameplayInputs = require(kit:WaitForChild("GameplayInputs")) :: any
	ias = GameplayInputs.build(inputs, game:GetService("StarterGui"))
end)
return { changed = changed, made = made, ias = ias, iasError = if ok then nil else tostring(err) }
'''


def install_items() -> list[dict]:
    items = []
    for n in SERVER_MODULES:
        items.append({"parent": ["ServerScriptService", "GameplayKit"], "name": n, "class": "ModuleScript",
                      "src": (KIT / f"{n}.luau").read_text()})
    for n in SHARED_MODULES:
        items.append({"parent": ["ReplicatedStorage", "GameplayShared"], "name": n, "class": "ModuleScript",
                      "src": (KIT / f"{n}.luau").read_text()})
    items.append({"parent": ["ServerScriptService"], "name": "GameplayServer", "class": "Script",
                  "src": (KIT / "boot" / "GameplayServer.server.luau").read_text()})
    # A Client RunContext Script in ReplicatedStorage runs once per client (in StarterPlayerScripts it
    # would be copied and run twice; a LocalScript in ReplicatedStorage never runs).
    items.append({"parent": ["ReplicatedStorage"], "name": "GameplayClient", "class": "Script",
                  "context": "Client", "src": (KIT / "boot" / "GameplayClient.client.luau").read_text()})
    return items


def install(studio) -> dict:
    """Write the kit into the open place's Edit data model (idempotent; nothing is saved)."""
    from rbx_run import run
    rows = []
    for it in install_items():
        ctx = f", context = {json.dumps(it['context'])}" if it.get("context") else ""
        rows.append(f"{{ parent = {lua(it['parent'])}, name = {json.dumps(it['name'])}, "
                    f"class = {json.dumps(it['class'])}{ctx}, src = {_long_string(it['src'])} }}")
    r = run(studio, "local ITEMS = {\n" + ",\n".join(rows) + "\n}\n" + INSTALL_LUAU, dm="Edit", timeout=60)
    if not r["ok"]:
        raise RuntimeError(f"install failed: {r['error']}")
    return r["result"]


# ------------------------------------------------------------------ fixtures
FIXTURES_LUAU = r'''
local ServerStorage = game:GetService("ServerStorage")
local Players = game:GetService("Players")
local out = {}

-- Map: static geometry for line of sight and pathfinding (NpcService IncludeInstances {Map}).
local map = workspace:FindFirstChild("Map") or Instance.new("Folder")
map.Name = "Map"
map.Parent = workspace
local function block(name: string, cf: CFrame, size: Vector3, color: Color3)
	local p = map:FindFirstChild(name) or Instance.new("Part")
	p.Name = name
	p.Anchored = true
	p.Size = size
	p.CFrame = cf
	p.Color = color
	p.Parent = map
	return p
end
for _, w in WALLS do
	block(w.name, CFrame.new(w.pos), w.size, Color3.fromRGB(120, 125, 135))
end

-- NPC template: an R15 rig from the default HumanoidDescription, else a hand-built R6 rig.
local template = ServerStorage:FindFirstChild("NpcTemplate") :: Model?
if not template then
	local ok, rig = pcall(function()
		return Players:CreateHumanoidModelFromDescriptionAsync(Instance.new("HumanoidDescription"), Enum.HumanoidRigType.R15)
	end)
	if ok and rig then
		template = rig
		out.rig = "R15"
	else
		out.r15Error = tostring(rig)
		local m = Instance.new("Model")
		local function part(name: string, size: Vector3, cf: CFrame): Part
			local p = Instance.new("Part")
			p.Name = name
			p.Size = size
			p.CFrame = cf
			p.Parent = m
			return p
		end
		local root = part("HumanoidRootPart", Vector3.new(2, 2, 1), CFrame.new(0, 3, 0))
		root.Transparency = 1
		local torso = part("Torso", Vector3.new(2, 2, 1), CFrame.new(0, 3, 0))
		local head = part("Head", Vector3.new(2, 1, 1), CFrame.new(0, 4.5, 0))
		local la = part("Left Arm", Vector3.new(1, 2, 1), CFrame.new(-1.5, 3, 0))
		local ra = part("Right Arm", Vector3.new(1, 2, 1), CFrame.new(1.5, 3, 0))
		local ll = part("Left Leg", Vector3.new(1, 2, 1), CFrame.new(-0.5, 1, 0))
		local rl = part("Right Leg", Vector3.new(1, 2, 1), CFrame.new(0.5, 1, 0))
		local function motor(name: string, p0: BasePart, p1: BasePart)
			local j = Instance.new("Motor6D")
			j.Name = name
			j.Part0, j.Part1 = p0, p1
			j.C0 = p0.CFrame:Inverse() * p1.CFrame
			j.Parent = p0
		end
		motor("RootJoint", root, torso)
		motor("Neck", torso, head)
		motor("Left Shoulder", torso, la)
		motor("Right Shoulder", torso, ra)
		motor("Left Hip", torso, ll)
		motor("Right Hip", torso, rl)
		local hum = Instance.new("Humanoid")
		hum.RigType = Enum.HumanoidRigType.R6
		hum.Parent = m
		m.PrimaryPart = root
		template = m
		out.rig = "R6"
	end
	local t = template :: Model
	t.Name = "NpcTemplate"
	for _, d in t:GetDescendants() do
		if d:IsA("BasePart") and d.Name ~= "HumanoidRootPart" then
			d.Color = Color3.fromRGB(170, 70, 60)
		end
		if d:IsA("Script") or d:IsA("LocalScript") then
			d.Parent = nil -- no Animate or Health scripts: the bench measures the AI, not animation
		end
	end
	t.Parent = ServerStorage
else
	out.rig = "kept"
end
out.templateParts = 0
for _, d in (template :: Model):GetDescendants() do
	if d:IsA("BasePart") then
		out.templateParts += 1
	end
end

-- Dummies: copies of the template, not NPCs (no brain), for the combo test.
local dummies = workspace:FindFirstChild("Dummies") or Instance.new("Folder")
dummies.Name = "Dummies"
dummies.Parent = workspace
for _, d in DUMMIES do
	local m = dummies:FindFirstChild(d.name) :: Model?
	if not m then
		m = (template :: Model):Clone()
		local mm = m :: Model
		mm.Name = d.name
		for _, p in mm:GetDescendants() do
			if p:IsA("BasePart") and p.Name ~= "HumanoidRootPart" then
				p.Color = Color3.fromRGB(230, 200, 90)
			end
		end
		mm.Parent = dummies
	end
	(m :: Model):PivotTo(CFrame.lookAt(d.pos, d.pos + Vector3.new(0, 0, 1)))
end

-- Car: built by the Car module (constraints, groups, tag).
local Car = require(game:GetService("ServerScriptService"):WaitForChild("GameplayKit"):WaitForChild("Car")) :: any
local car = workspace:FindFirstChild("TestCar")
if not car then
	car = Car.build(CFrame.lookAt(CAR_POS, CAR_POS + Vector3.new(0, 0, -1)), { name = "TestCar" })
	out.carBuilt = true
else
	(car :: Model):PivotTo(CFrame.lookAt(CAR_POS, CAR_POS + Vector3.new(0, 0, -1)))
end
out.carParts = #(car :: Model):GetDescendants()
return out
'''

LAYOUT = {  # inside the 512 by 512 baseplate of rbx_env.new_place
    "bench_center": (0, 3, -150),
    "hunt_home": (150, 3, 0),
    "walls": [  # name, center, size
        {"name": "HuntWall", "pos": (150, 6, 40), "size": (40, 12, 2)},
    ],
    "combat_player": (-150, 3, 0),  # faces -Z
    "dummies": [
        {"name": "DummyLeft", "pos": (-151.5, 3, -3.5)},
        {"name": "DummyRight", "pos": (-148.5, 3, -3.5)},
        {"name": "DummyBehind", "pos": (-150, 3, 5)},
    ],
    "car": (-200, 3.4, 230),  # faces -Z, 480 studs of road ahead
}


def build_fixtures(studio, layout: dict = LAYOUT) -> dict:
    from rbx_run import run
    walls = "{" + ", ".join(
        f"{{ name = {json.dumps(w['name'])}, pos = {lua(V3(w['pos']))}, size = {lua(V3(w['size']))} }}"
        for w in layout["walls"]) + "}"
    dummies = "{" + ", ".join(f"{{ name = {json.dumps(d['name'])}, pos = {lua(V3(d['pos']))} }}"
                              for d in layout["dummies"]) + "}"
    head = f"local WALLS = {walls}\nlocal DUMMIES = {dummies}\nlocal CAR_POS = {lua(V3(layout['car']))}\n"
    r = run(studio, head + FIXTURES_LUAU, dm="Edit", timeout=90)
    if not r["ok"]:
        raise RuntimeError(f"fixtures failed: {r['error']}")
    return r["result"]


# ------------------------------------------------------------------ playtest helpers
def hook(pt, cmd: str, a=None, b=None, timeout: float | None = None) -> dict:
    """Invoke ServerStorage.GameplayHook in the playtest Server (the boot script's module cache)."""
    code = ("local H = game:GetService('ServerStorage'):WaitForChild('GameplayHook', 15) "
            f"return H:Invoke({json.dumps(cmd)}, {lua(a)}, {lua(b)})")
    return pt.server(code, timeout=timeout)


def key_actions(pt, steps: list[tuple]) -> str:
    """Send one user_keyboard_input call: ("press", "F"), ("down", "W"), ("up", "W"), ("wait", seconds).

    One call keeps the timing between keys inside the client (separate calls add ~70 ms or more each)."""
    from rbx_play import _action_fields, _pick, tool_schema
    f = _action_fields(tool_schema(pt.s, "user_keyboard_input"))
    acts = []
    for step in steps:
        kind, arg = step[0], step[1]
        if kind == "wait":
            ms = f["wait"].lower().endswith("ms")
            acts.append({f["kind"]: _pick(f["kinds"], "wait"), f["wait"]: round(arg * 1000) if ms else arg})
        else:
            acts.append({f["kind"]: _pick(f["kinds"], {"press": "keypress", "down": "keydown", "up": "keyup"}[kind]),
                         f["key"]: arg})
    return pt.keys(acts)


# ------------------------------------------------------------------ offline
def _lune(args: list[str], cwd: Path) -> tuple[int, str]:
    p = subprocess.run(["lune", "run", *args], cwd=cwd, capture_output=True, text=True, timeout=300)
    return p.returncode, p.stdout + p.stderr


def _last_json(text: str):
    i = text.rfind("\n{")
    i = 0 if i < 0 and text.lstrip().startswith("{") else i
    return json.loads(text[i:]) if i >= 0 else None


def unit_tests() -> dict:
    code, out = _lune(["lune_unit.luau"], KIT)
    report = _last_json(out) or {}
    m = re.search(r"brain think: ([\d.]+) us", out)
    return {"exit": code, "passed": report.get("passed"), "failed": report.get("failed"),
            "total": report.get("total"), "brain_think_us": float(m[1]) if m else None,
            "failures": [t for t in report.get("results", []) if not t.get("ok", t.get("passed", True))]}


def audit_place(path: str | Path) -> dict:
    code, out = _lune(["lune_gameplay_audit.luau", str(Path(path).resolve())], KIT)
    if code != 0:
        raise RuntimeError(out[-2000:])
    return _last_json(out)


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    if argv[0] == "unit":
        r = unit_tests()
        print(json.dumps(r, indent=1))
        return 0 if r["exit"] == 0 else 1
    if argv[0] == "audit":
        print(json.dumps(audit_place(argv[1]), indent=1))
        return 0
    if argv[0] == "install":
        import rbx_env
        with rbx_env.place_slot():
            s = rbx_env.open_place(argv[1])
            try:
                print(json.dumps({"install": install(s), "fixtures": build_fixtures(s)}, indent=1))
            finally:
                s.close()  # the proxy only; the place window stays open
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
