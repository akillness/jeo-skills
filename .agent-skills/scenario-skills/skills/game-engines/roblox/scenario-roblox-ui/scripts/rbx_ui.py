#!/usr/bin/env python3
"""Runner-side helpers for scenario-roblox-ui (system python3; Studio reached through the lead's toolkit).

    kit_source(names) -> str                  this skill's AgentKit modules (UIKit, UIStyle, UIInput,
                                              UILayout, UIAudit) as Luau locals of the same name
    run(studio, code, dm="Edit", kit=(), lead_kit=(), timeout=None)   rbx_run.run with both kits inlined
    install_scripts(studio) -> dict           Catalog, Kit modules, MenuController (RunContext Client) and
                                              ShopServer into the open place (Edit), like Rojo serve
    build(studio) -> dict                     install_scripts, then templates/BuildMenuHud.luau (Edit)
    audit(studio, dm="Edit") -> dict          UIAudit.all plus the lead's Audit.ui
    devices(studio, dm="Edit") -> list        every Device Simulator preset id with its GetDeviceInfoAsync table
    simulate(studio, device, orientation=None, dm="Client") -> dict   set a device, return the UI environment
    stop_simulation(studio, dm="Client")      always call it when done (the simulation persists in the window)
    layout_matrix(pt, devices, scenes, out_dir) -> list   per device and scene: UILayout.check plus a capture
    contrast(hex_a, hex_b) -> float           WCAG contrast ratio, for palettes before they reach Studio

CLI:
  rbx_ui.py build | audit | devices        against the open place named by --place (default: first bound)
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "scenario-roblox-expert" / "scripts"))
import rbx_run  # noqa: E402

KIT = HERE / "agentkit" / "ui"
TEMPLATES = KIT / "templates"

# A spread of the 42 presets in Studio 0.743: smallest phone, phone portrait, low-end Android, tablet,
# laptop, desktop, console, handheld. (id, orientation or None). Set the orientation of phones and tablets
# explicitly: with StarterGui.ScreenOrientation Sensor the simulator opened iphone_7 in portrait (observed).
DEVICES = [
    ("iphone_7", "LandscapeRight"), ("iphone_14", "LandscapeRight"), ("iphone_14", "Portrait"),
    ("samsung_galaxy_a06", "LandscapeRight"), ("ipad_10th_generation", "LandscapeRight"), ("average_laptop", None),
    ("hd_1080", None), ("xbox", None), ("generic_handheld_720", None),
]


def kit_source(names) -> str:
    parts = []
    for n in names:
        src = (KIT / f"{n}.luau").read_text()
        parts.append(f"local {n} = (function()\n{src}\nend)()")
    return "\n".join(parts) + ("\n" if parts else "")


def run(studio, code: str, dm: str = "Edit", kit=(), lead_kit=(), timeout: float | None = None) -> dict:
    """rbx_run.run with this skill's kit inlined before `code` (error line numbers then include the kit)."""
    return rbx_run.run(studio, kit_source(kit) + code, dm=dm, timeout=timeout, kit=list(lead_kit))


def _long(text: str) -> str:
    level = 1
    while f"]{'=' * level}]" in text:
        level += 1
    eq = "=" * level
    return f"[{eq}[\n{text}]{eq}]"


INSTALL_LUAU = '''
local function ensure(parent, name, class)
	local x = parent:FindFirstChild(name)
	if x and x.ClassName ~= class then x:Destroy() x = nil end
	if not x then x = Instance.new(class) x.Name = name x.Parent = parent end
	return x
end
local out = {}
for _, it in ITEMS do
	local parent = game:GetService(it.service)
	for _, n in it.path do parent = ensure(parent, n, "Folder") end
	local s = ensure(parent, it.name, it.class)
	if it.runContext then s.RunContext = Enum.RunContext[it.runContext] end
	s.Source = it.src
	table.insert(out, s:GetFullName())
end
return out
'''


def install_scripts(studio) -> dict:
    """Write the templates and kit modules into the open place (Edit). Nothing is saved to disk."""
    items = [
        ("ReplicatedStorage", ["UI"], "Catalog", "ModuleScript", None, TEMPLATES / "Catalog.luau"),
        ("ReplicatedStorage", ["UI", "Kit"], "UIInput", "ModuleScript", None, KIT / "UIInput.luau"),
        ("ReplicatedStorage", ["UI", "Kit"], "UIStyle", "ModuleScript", None, KIT / "UIStyle.luau"),
        ("ReplicatedStorage", ["UIClient"], "MenuController", "Script", "Client", TEMPLATES / "MenuController.luau"),
        ("ServerScriptService", [], "ShopServer", "Script", "Server", TEMPLATES / "ShopServer.luau"),
    ]
    rows = []
    for service, path, name, cls, ctx, f in items:
        rows.append("{ service = %s, path = { %s }, name = %s, class = %s, runContext = %s, src = %s }" % (
            json.dumps(service), ", ".join(json.dumps(p) for p in path), json.dumps(name), json.dumps(cls),
            json.dumps(ctx) if ctx else "nil", _long(f.read_text())))
    r = rbx_run.run(studio, "local ITEMS = {\n" + ",\n".join(rows) + "\n}\n" + INSTALL_LUAU, dm="Edit", timeout=60)
    if not r["ok"]:
        raise RuntimeError(f"install failed: {r['error']}")
    return {"installed": r["result"]}


def build(studio) -> dict:
    inst = install_scripts(studio)
    r = run(studio, (TEMPLATES / "BuildMenuHud.luau").read_text(), "Edit", kit=["UIKit", "UIStyle", "UIInput"], timeout=60)
    if not r["ok"]:
        raise RuntimeError(f"build failed: {r['error']}")
    return {**inst, **r["result"]}


def audit(studio, dm: str = "Edit", root: str = "game") -> dict:
    r = run(studio, f"return {{ ui = UIAudit.all({root}), lead = Audit.ui({root}) }}", dm, kit=["UIAudit"], lead_kit=["Audit"])
    if not r["ok"]:
        raise RuntimeError(f"audit failed: {r['error']}")
    return r["result"]


def devices(studio, dm: str = "Edit") -> list:
    r = rbx_run.run(studio, 'local sim = game:GetService("StudioDeviceSimulatorService") local out = {} '
                            'for _, id in sim:GetDeviceListAsync() do table.insert(out, { id = id, info = sim:GetDeviceInfoAsync(id) }) end '
                            'return out', dm=dm, timeout=60)
    if not r["ok"]:
        raise RuntimeError(r["error"])
    return r["result"]


SIM_LUAU = '''
local sim = game:GetService("StudioDeviceSimulatorService")
sim:SetDeviceAsync(%s)
%s
task.wait(%s)
return UILayout.env(%s)
'''


def simulate(studio, device: str, orientation: str | None = None, dm: str = "Client", settle: float = 1.0) -> dict:
    """Simulate a device preset in the bound window (Edit or a playtest Client), return the UI environment."""
    orient = f"sim:SetOrientationAsync(Enum.ScreenOrientation.{orientation})" if orientation else ""
    parent = 'game:GetService("Players").LocalPlayer:FindFirstChildOfClass("PlayerGui")' if dm == "Client" \
        else 'game:GetService("StarterGui")'
    r = run(studio, SIM_LUAU % (json.dumps(device), orient, settle, parent), dm, kit=["UILayout"])
    if not r["ok"]:
        raise RuntimeError(f"simulate {device} failed: {r['error']}")
    return r["result"]


def stop_simulation(studio, dm: str = "Client") -> dict:
    r = rbx_run.run(studio, 'local sim = game:GetService("StudioDeviceSimulatorService") sim:StopSimulationAsync() '
                            'task.wait(0.5) return { device = sim:GetDeviceAsync(), viewport = workspace.CurrentCamera.ViewportSize }', dm=dm)
    return r.get("result") or {"error": r.get("error")}


CHECK_LUAU = '''
local pg = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")
local guis = {}
for _, n in %s do table.insert(guis, pg:WaitForChild(n)) end
return UILayout.check(guis, { track = %s })
'''


def layout_matrix(pt, device_list, scenes, out_dir, track=()) -> list:
    """For each (device, orientation): simulate it, then for each scene (name, setup_luau, gui_names[, teardown_luau])
    run the client setup, UILayout.check, a capture and the teardown. Stops the simulation at the end, even on errors.
    Drive scenes with Scriptable bindings: a keyboard or mouse event switches PreferredInput away from Touch."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = []
    luau_track = "{ " + ", ".join(json.dumps(t) for t in track) + " }"
    try:
        for device, orientation in device_list:
            env = simulate(pt.s, device, orientation)
            tag = device + ("_portrait" if orientation == "Portrait" else "")
            for scene in scenes:
                name, setup, guis = scene[:3]
                teardown = scene[3] if len(scene) > 3 else None
                if setup:
                    s = pt.client(setup)
                    if not s["ok"]:
                        raise RuntimeError(f"scene {name} setup on {tag}: {s['error']}")
                time.sleep(0.6)
                r = run(pt.s, CHECK_LUAU % ("{ " + ", ".join(json.dumps(g) for g in guis) + " }", luau_track),
                        "Client", kit=["UILayout"])
                if not r["ok"]:
                    raise RuntimeError(f"check {name} on {tag}: {r['error']}")
                png = pt.capture(out_dir / f"{tag}_{name}.png")
                rows.append({"device": tag, "scene": name, "env": env, "capture": str(png), **r["result"]})
                if teardown:
                    pt.client(teardown)
    finally:
        stop_simulation(pt.s)
    return rows


def contrast(a: str, b: str) -> float:
    def ch(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    def lum(h: str) -> float:
        r, g, bl = (int(h.lstrip("#")[i:i + 2], 16) / 255 for i in (0, 2, 4))
        return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(bl)
    hi, lo = sorted((lum(a), lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def main(argv: list[str]) -> int:
    import argparse
    from rbx_mcp import Studio
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["build", "audit", "devices"])
    ap.add_argument("--place")
    a = ap.parse_args(argv)
    with Studio(place=a.place) as s:
        s.bind()
        res = build(s) if a.cmd == "build" else audit(s) if a.cmd == "audit" else devices(s)
    print(json.dumps(res, indent=1, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
