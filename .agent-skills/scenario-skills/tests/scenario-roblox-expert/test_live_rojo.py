"""Rojo and Lune facts the Roblox skills state, checked against the real tools (no Studio needed).

Each test builds a small project with Rojo and reads the place back with Lune. They skip where either
tool is missing; .github/workflows/roblox.yml installs the pinned versions and fails if they skip.
"""

import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

FAMILY = pathlib.Path(__file__).parents[2] / "skills/game-engines/roblox"
sys.path.insert(0, str(FAMILY / "scenario-roblox-expert/scripts"))
sys.path.insert(0, str(FAMILY / "scenario-roblox-luau/scripts"))
sys.path.insert(0, str(FAMILY / "scenario-roblox-tooling/scripts"))

import rbx_luau  # noqa: E402
import rbx_tooling  # noqa: E402

PART = {
    "Shape": "Cylinder",
    "Material": "SmoothPlastic",
    "Color": [1, 0.78, 0.15],
    "Anchored": True,
    "CFrame": [24, 7.5, -36, 1, 0, 0, 0, 1, 0, 0, 0, 1],
    "Tags": ["Coin"],
}

READ_PARTS = """
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local game = roblox.deserializePlace(fs.readFile(process.args[1]))
local out = {}
for _, p in game:GetDescendants() do
	if p:IsA("BasePart") then
		out[p.Name] = { shape = tostring(p.Shape), material = tostring(p.Material), color = p.Color:ToHex(),
			x = p.CFrame.Position.X, tags = p:GetTags(), value = p:GetAttribute("Value") }
	elseif p:IsA("Script") then
		out[p.Name] = { script = true }
	end
end
print(require("@lune/serde").encode("json", out))
"""


def sh(cmd, cwd):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        raise AssertionError(f"{cmd[0]} exited {r.returncode}: {r.stderr or r.stdout}")
    return r.stdout


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(data if isinstance(data, str) else json.dumps(data))


@unittest.skipUnless(shutil.which("rojo") and shutil.which("lune"), "needs rojo and lune")
class RojoLune(unittest.TestCase):
    def setUp(self):
        self.dir = pathlib.Path(tempfile.mkdtemp())
        write(self.dir / "read.luau", READ_PARTS)

    def tearDown(self):
        shutil.rmtree(self.dir)

    def parts(self, place):
        return json.loads(sh(["lune", "run", str(self.dir / "read.luau"), str(place)], self.dir))

    def test_property_forms_apply_in_project_and_model_files(self):
        """traps.md section 4: enum names, Color arrays, Tags and attributes."""
        p = self.dir / "forms"
        write(p / "src/Coins.model.json", {"className": "Folder", "children": [
            {"name": "ModelCoin", "className": "Part", "properties": PART, "attributes": {"Value": 7}}]})
        write(p / "default.project.json", {"name": "forms", "tree": {"$className": "DataModel", "Workspace": {
            "ProjectCoin": {"$className": "Part", "$properties": PART, "$attributes": {"Value": 5}},
            "Coins": {"$path": "src/Coins.model.json"}}}})
        sh(["rojo", "build", "default.project.json", "-o", "forms.rbxl"], p)
        got = self.parts(p / "forms.rbxl")
        for name, value in (("ProjectCoin", 5), ("ModelCoin", 7)):
            part = got[name]
            self.assertEqual(part["shape"], "Enum.PartType.Cylinder", name)
            self.assertEqual(part["material"], "Enum.Material.SmoothPlastic", name)
            self.assertEqual(part["color"].lower(), "ffc726", name)
            self.assertEqual(part["tags"], ["Coin"], name)
            self.assertEqual(part["value"], value, name)
        self.assertEqual(got["ProjectCoin"]["x"], 24)

    def test_position_is_dropped_and_cframe_applies(self):
        """traps.md section 4: Rojo drops Position with exit 0."""
        p = self.dir / "pos"
        write(p / "default.project.json", {"name": "pos", "tree": {"$className": "DataModel", "Workspace": {
            "ByPosition": {"$className": "Part", "$properties": {"Position": [10, 5, 0]}},
            "ByCFrame": {"$className": "Part", "$properties": {"CFrame": [10, 5, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]}}}}})
        sh(["rojo", "build", "default.project.json", "-o", "pos.rbxl"], p)
        got = self.parts(p / "pos.rbxl")
        self.assertEqual(got["ByPosition"]["x"], 0)
        self.assertEqual(got["ByCFrame"]["x"], 10)

    def test_luau_sourcemap_lists_folders_and_remotes(self):
        p = self.dir / "sm"
        write(p / "src/M.luau", "return {}\n")
        write(p / "default.project.json", {"name": "sm", "tree": {"$className": "DataModel", "ReplicatedStorage": {
            "Remotes": {"$className": "Folder", "Buy": {"$className": "RemoteEvent"}},
            "M": {"$path": "src/M.luau"}}}})
        self.assertIn('"Remotes"', pathlib.Path(rbx_luau.sourcemap(p)).read_text())

    def test_merge_place_in_an_unscaffolded_repository(self):
        """tooling P15: the base place's map and the repository's script both reach the merge."""
        base = self.dir / "base"
        write(base / "default.project.json", {"name": "base", "tree": {"$className": "DataModel", "Workspace": {
            "Map": {"$className": "Model", "Floor": {"$className": "Part", "$properties": {"Anchored": True}}}}}})
        sh(["rojo", "build", "default.project.json", "-o", str(self.dir / "base.rbxl")], base)
        repo = self.dir / "repo"
        write(repo / "src/server/Coins.server.luau", 'print("coins")\n')
        write(repo / "default.project.json", {"name": "obby", "tree": {"$className": "DataModel",
              "ServerScriptService": {"Coins": {"$path": "src/server/Coins.server.luau"}}}})
        sh(["rojo", "build", "default.project.json", "-o", str(self.dir / "code.rbxl")], repo)
        self.assertFalse((repo / "tools").exists())
        r = rbx_tooling.merge_place(repo, base=str(self.dir / "base.rbxl"), code=str(self.dir / "code.rbxl"),
                                    out=str(self.dir / "out.rbxl"), project="default.project.json")
        self.assertEqual(r["exit"], 0, r)
        got = self.parts(self.dir / "out.rbxl")
        self.assertIn("Floor", got)
        self.assertTrue(got["Coins"]["script"])


if __name__ == "__main__":
    unittest.main()
