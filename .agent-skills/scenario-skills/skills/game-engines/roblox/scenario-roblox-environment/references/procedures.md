# Procedures

Every Luau block below runs in the Edit data model through
`rbx_environment.run(studio, code, kit=[...])` unless it says Client or Server. Kit modules
(`Graybox`, `TerrainKit`, `MaterialKit`, `Looks`, `EnvAudit`, `Scatter`, `WorldCheck`) are inlined
as locals; the lead's `Stats` comes in with `lead_kit=["Stats"]`. The blocks marked
`<!-- test: NAME -->` are the exact code `tests/code/scenario-roblox-environment/run_live.py`
executes, so the doc is what runs. L14 and L15 also execute the blocks marked in `foliage.md` and
`verification.md`.

Python setup for every procedure:

```python
import sys; sys.path.insert(0, "<skills>/scenario-roblox-environment/scripts")
import rbx_environment as E          # finds the lead toolkit next to it (or RBX_TOOLKIT)
import rbx_env
with rbx_env.place_slot():
    s = rbx_env.open_place("place.rbxl")   # binds when already open; never close the window
    r = E.run(s, code, kit=["Graybox"])    # {ok, result, error, output}
```

## P1. Readiness: what scripts can and cannot set

Run first. It tells which settings must go in the place file (or the Properties panel) because
scripts cannot touch them.

<!-- test: L1 -->

```lua
local L = game:GetService("Lighting")
local MS = game:GetService("MaterialService")
local function try(f)
	local ok, err = pcall(f)
	return if ok then "ok" else tostring(err):sub(1, 80)
end
local terrains = 0
for _, c in workspace:GetChildren() do
	if c:IsA("Terrain") then
		terrains += 1
	end
end
return {
	lightingStyle = L.LightingStyle.Name,
	prioritizeQuality = L.PrioritizeLightingQuality,
	streamingEnabled = workspace.StreamingEnabled,
	terrains = terrains,
	technologyRead = try(function()
		return (L :: any).Technology
	end),
	targetRadiusRead = try(function()
		return (workspace :: any).StreamingTargetRadius
	end),
	decorationRead = try(function()
		return (workspace.Terrain :: any).Decoration
	end),
	grassNameRead = try(function()
		return (MS :: any).GrassName
	end),
	grassOverride = MS:GetBaseMaterialOverride(Enum.Material.Grass),
}
```

- Expect `lightingStyle` Realistic only when the file was saved with it (the lead's template writes
  `Technology = Future` too).
- `technologyRead`, `targetRadiusRead`, `decorationRead` and `grassNameRead` fail: put those values
  in the place file (Rojo `$properties`) or set them by hand.
- `GetBaseMaterialOverride` reads the override the file set (here `FileGrass`), so the file route
  works for overrides.
- Run in Studio 0.743 on 2026-10-19: pass, `Technology` refused ("lacking capability RobloxScript");
  `StreamingTargetRadius`, `Terrain.Decoration` and `MaterialService.GrassName` "not a valid
  member"; LightingStyle Realistic; the file override read FileGrass.

## P2. Terrain base from a height function

Replaces the Generate, Draw and Sculpt brushes. One `WriteVoxels` call per chunk, material by
height, slope and depth.

<!-- test: L2 -->

```lua
local bp = workspace:FindFirstChild("Baseplate")
if bp then
	bp:Destroy()
end
workspace.Terrain:Clear()
local function smoothstep(a, b, x)
	local t = math.clamp((x - a) / (b - a), 0, 1)
	return t * t * (3 - 2 * t)
end
local function height(x: number, z: number): number
	local dx, dz = x / 200, (z - 60) / 210
	local ring = smoothstep(0.62, 1.1, math.sqrt(dx * dx + dz * dz))
	local hills = ring * 46 + ring * math.noise(x / 70, z / 70, 0.37) * 14
	local pd = (Vector2.new(x, z) - Vector2.new(-110, 70)).Magnitude
	return hills - 7 * math.max(0, 1 - (pd / 26) ^ 2) -- pond basin
end
local hf = TerrainKit.heightfield({ min = { -256, -196 }, size = { 512, 512 }, bottom = -16, top = 64, height = height })
local water = TerrainKit.water({ -140, -12, 40 }, { -80, 0, 100 }, -1)
task.wait()
local spawnY, spawnMat = TerrainKit.groundY(0, 0)
local pondY, pondMat = TerrainKit.groundY(-110, 70)
-- FillBlock off the map with its top face at y 0: where does the walkable surface land?
workspace.Terrain:FillBlock(CFrame.new(2000, -4, 0), Vector3.new(16, 8, 16), Enum.Material.Rock)
task.wait()
local blockY = TerrainKit.groundY(2000, 0, 50)
workspace.Terrain:FillBlock(CFrame.new(2000, 0, 0), Vector3.new(20, 24, 20), Enum.Material.Air)
return {
	heightfield = hf,
	water = water,
	spawnGround = { spawnY, spawnMat and spawnMat.Name },
	pondBed = { pondY, pondMat and pondMat.Name },
	fillBlockTop0Ground = blockY,
	stats = TerrainKit.stats(),
}
```

- Gate: `spawnGround` within 0.1 stud of the designed height; `pondBed` Sand under the water level;
  `fillBlockTop0Ground` about 2.
- Run in Studio 0.743 on 2026-10-19: pass, 327,680 voxels in one `WriteVoxels` chunk in 61 to 63 ms;
  spawn ground 0.00 (Grass); pond bed -6.83 (Sand); 322 water voxels; a `FillBlock` with its top at
  0 gave ground at 1.87 (Rock).
- `TerrainKit.occupancy` puts the surface where the height function says. A plain `FillBlock` whose
  top is at y 0 gives ground at y 2 (measured), so check spawn heights with `TerrainKit.groundY`
  after any fill.
- `ReadVoxelChannels` returns `Size` on the result table; `ReadVoxels` returns it on the materials
  array.
- Raycast terrain after a `task.wait()` when the voxels were just written.

## P3. Graybox: plain parts, clearances, walk times

<!-- test: L3 -->

```lua
local old = workspace:FindFirstChild("map_geo")
if old then
	old:Destroy()
end
Graybox.gridVariant()
local village = Graybox.folder(workspace, "map_geo/village")
local ground = Graybox.folder(village, "ground")
Graybox.block(ground, "Plaza", Vector3.new(70, 1, 70), CFrame.new(0, 0.5, 80), "path")
Graybox.block(ground, "PathSpawn", Vector3.new(12, 1, 36), CFrame.new(0, 0.5, 27), "path")
local houses = Graybox.folder(village, "houses")
local plaza = Vector3.new(0, 0, 80)
Graybox.house(houses, "House_West", CFrame.lookAt(Vector3.new(-48, 0, 80), plaza), {})
Graybox.house(houses, "House_East", CFrame.lookAt(Vector3.new(48, 0, 80), plaza), {})
Graybox.house(houses, "House_North", CFrame.lookAt(Vector3.new(0, 0, 132), plaza), {})
local landmarks = Graybox.folder(village, "landmarks")
local tower = Graybox.block(landmarks, "Tower", Vector3.new(12, 60, 12), CFrame.new(0, 30, 182), "landmark")
local lights = Graybox.folder(village, "lights")
for i, z in { 12, 30, 48 } do
	Graybox.lantern(lights, "LanternPath_L" .. i, Vector3.new(-8, 0, z), {})
	Graybox.lantern(lights, "LanternPath_R" .. i, Vector3.new(8, 0, z), {})
end
for i, p in { Vector3.new(-30, 0, 52), Vector3.new(30, 0, 52), Vector3.new(-30, 0, 108), Vector3.new(30, 0, 108) } do
	Graybox.lantern(lights, "LanternPlaza_" .. i, p, {})
end
Graybox.lantern(lights, "Beacon", tower.Position + Vector3.new(0, 30, 0), {
	height = 1,
	range = 60,
	brightness = 3,
	color = Color3.fromRGB(255, 170, 90),
})
-- the spawn faces the village: the default camera looks where the character faces
local spawn = workspace:FindFirstChildWhichIsA("SpawnLocation")
if spawn then
	spawn.CFrame = CFrame.lookAt(spawn.Position, spawn.Position + Vector3.new(0, 0, 1))
	spawn:SetAttribute("GrayboxRole", "path")
end
local from = spawn and spawn.Position or Vector3.zero
local walk = {}
for _, target in { tower, houses.House_North, houses.House_West } do
	local pos = if target:IsA("Model") then target:GetPivot().Position else (target :: BasePart).Position
	local seconds, studs = Graybox.walkSeconds(Vector3.new(from.X, 0, from.Z), Vector3.new(pos.X, 0, pos.Z))
	walk[target.Name] = { seconds = math.floor(seconds * 10) / 10, studs = math.floor(studs) }
end
-- a deliberately small door, to prove the check fires
local probe = Graybox.wall(village, "ProbeSmallDoor", CFrame.new(0, 0, -120), {
	width = 16,
	height = 8,
	opening = { kind = "door", width = 4, height = 7 },
})
local findings = Graybox.clearance(village).findings
probe:Destroy()
local parts = 0
for _, d in village:GetDescendants() do
	if d:IsA("BasePart") then
		parts += 1
	end
end
return { parts = parts, walk = walk, clearance = Graybox.clearance(village), probeFindings = findings }
```

- Gate: `clearance.findings` empty; `probeFindings` holds `door-too-small` and `wall-too-low` for
  the probe wall.
- Run in Studio 0.743 on 2026-10-19: pass, 67 parts, 0 clearance findings on 3 openings; the probe
  wall raised `wall-too-low` and `door-too-small`; straight walks 5.8 s to House_West, 8.2 s to
  House_North, 11.3 s to the tower.
- Walk seconds are straight lines at WalkSpeed 16; the playtest walk (P11) checks the real path
  through a door.
- Landmark placeholders stay loud pink until the art pass (RoBuilder); the ground keeps its own
  color.

## P4. Keep grass decoration out of floors

Grass decoration grows through parts that sit on Grass terrain (seen in the first graybox capture).
Repaint the terrain under floors and paths with LeafyGrass, which has no blades (SmartyRBX).

<!-- test: L4 -->

```lua
local village = workspace:WaitForChild("map_geo"):WaitForChild("village")
local terrain = workspace.Terrain
-- the top filled voxel of the 4-stud column at (x, z), read from the grid rather than a raycast
local function topVoxel(x: number, z: number): string?
	local mats, occ = terrain:ReadVoxels(TerrainKit.region({ x, -16, z }, { x + 4, 16, z + 4 }), 4)
	local top = nil
	for y = 1, mats.Size.Y do
		if occ[1][y][1] > 0 then
			top = mats[1][y][1].Name
		end
	end
	return top
end
local plazaBefore = topVoxel(0, 80)
-- Terrain:ReplaceMaterial on one plaza column, recorded for comparison
terrain:ReplaceMaterial(TerrainKit.region({ 0, -8, 80 }, { 4, 4, 84 }), 4, Enum.Material.Grass, Enum.Material.LeafyGrass)
local replaceTop = topVoxel(0, 80)
local r = TerrainKit.paintUnder(village)
local s = TerrainKit.paintUnder(workspace, { roles = { path = true } }) -- the spawn pad
task.wait()
local _, rayFrame = TerrainKit.groundY(0, 80)
task.wait(1)
local _, raySecond = TerrainKit.groundY(0, 80)
return {
	painted = r.parts + s.parts,
	voxelsChanged = r.voxels + s.voxels,
	plazaBefore = plazaBefore,
	replaceMaterialTop = replaceTop,
	plazaTop = topVoxel(0, 80),
	spawnTop = topVoxel(0, 0),
	outsideTop = topVoxel(0, -60),
	rayAfterFrame = rayFrame and rayFrame.Name,
	rayAfterSecond = raySecond and raySecond.Name,
}
```

- Gate: `plazaTop` and `spawnTop` are LeafyGrass, `outsideTop` stays Grass; the spawn and interior
  captures show no blades on the floors.
- Run in Studio 0.743 on 2026-10-19: pass, 8 parts, 1,198 voxels repainted; plaza and spawn tops
  LeafyGrass, outside Grass; rays one frame and one second later read LeafyGrass; the one-column
  `ReplaceMaterial` also gave LeafyGrass. Blades gone from the spawn pad, path and floors in the
  captures.
- Check terrain edits with `ReadVoxels`: in the first live run a terrain raycast still returned
  Grass right after the repaint.

## P5. Door openings: parts versus CSG, and collision fidelity

Measures whether a character-sized box and a ray pass through a doorway cut with
`GeometryService:SubtractAsync` at each fidelity, next to a door built from parts.

<!-- test: L5 -->

```lua
local GS = game:GetService("GeometryService")
local folder = Instance.new("Folder")
folder.Name = "ProbeDoors"
folder.Parent = workspace
local function csgDoor(x: number, fid: Enum.CollisionFidelity): BasePart
	local wall = Instance.new("Part")
	wall.Anchored = true
	wall.Size = Vector3.new(16, 12, 1)
	wall.CFrame = CFrame.new(x, 6, -300)
	local hole = Instance.new("Part")
	hole.Size = Vector3.new(10, 10, 3)
	hole.CFrame = CFrame.new(x, 5, -300)
	local t0 = os.clock()
	local u = GS:SubtractAsync(wall, { hole }, { CollisionFidelity = fid, SplitApart = false })[1]
	u:SetAttribute("BuildMs", math.floor((os.clock() - t0) * 1000))
	u.CFrame = wall.CFrame
	u.Anchored = true
	u.Name = "Door_" .. fid.Name
	u:SetAttribute("Opening", true)
	u.Parent = folder
	return u
end
local function pass(target: Instance, x: number)
	local rp = RaycastParams.new()
	rp.FilterType = Enum.RaycastFilterType.Include
	rp.FilterDescendantsInstances = { target }
	local hit = workspace:Raycast(Vector3.new(x, 4, -310), Vector3.new(0, 0, 20), rp)
	local op = OverlapParams.new()
	op.FilterType = Enum.RaycastFilterType.Include
	op.FilterDescendantsInstances = { target }
	-- a character-sized probe; GetPartBoundsInBox would only compare bounding boxes
	local body = Instance.new("Part")
	body.Size = Vector3.new(4, 5, 3)
	body.CFrame = CFrame.new(x, 3.5, -300)
	local touching = workspace:GetPartsInPart(body, op)
	local bounds = workspace:GetPartBoundsInBox(body.CFrame, body.Size, op)
	return { rayBlocked = hit ~= nil, bodyOverlaps = #touching, boundsOverlaps = #bounds }
end
local out = {}
for i, fid in { Enum.CollisionFidelity.Default, Enum.CollisionFidelity.PreciseConvexDecomposition, Enum.CollisionFidelity.Hull, Enum.CollisionFidelity.Box } do
	local x = i * 30
	local u = csgDoor(x, fid)
	task.wait()
	out[fid.Name] = pass(u, x)
	out[fid.Name].triangles = u.TriangleCount
	out[fid.Name].buildMs = u:GetAttribute("BuildMs")
end
local partsDoor = Graybox.wall(folder, "Door_Parts", CFrame.new(150, 0, -300), {
	width = 16,
	height = 12,
	opening = { kind = "door", width = 10, height = 10 },
})
out.Parts = pass(partsDoor, 150)
out.openingFilled = 0
for _, f in EnvAudit.all(game).findings do
	if f.rule == "opening-filled" then
		out.openingFilled += 1
	end
end
-- a fidelity write lands after a yield
local d = folder.Door_Default :: BasePart
d.CollisionFidelity = Enum.CollisionFidelity.Box
local immediate = d.CollisionFidelity.Name
task.wait(1)
out.writeImmediate = immediate
out.writeAfterWait = d.CollisionFidelity.Name
folder:Destroy()
return out
```

- Gate: Default, PreciseConvexDecomposition and Parts leave the doorway open (`rayBlocked` false,
  `bodyOverlaps` 0); Hull and Box fill it.
- Run in Studio 0.743 on 2026-10-19: pass, Default, Precise and parts open (ray clear, 0 body
  overlaps); Hull and Box blocked; `GetPartBoundsInBox` reported every union blocked; each
  `SubtractAsync` 12 to 16 ms and 28 triangles; fidelity read Default right after the write, Box
  after a yield; `opening-filled` 2.
- `GetPartBoundsInBox` compares bounding boxes, so it reports every union door as blocked
  (`boundsOverlaps` 1); test passability with `GetPartsInPart` or a raycast.
- `EnvAudit` reports `opening-filled` for the Hull and Box unions tagged with the `Opening`
  attribute (`openingFilled` 2).
- A `CollisionFidelity` write reads back the old value until the next yield.

## P6. Material kit, terrain overrides, broken links

<!-- test: L6 -->

```lua
local MS = game:GetService("MaterialService")
-- start clean so the run is repeatable: no Basalt override, no kit variants, default Basalt color
MS:SetBaseMaterialOverride(Enum.Material.Basalt, "")
MS:SetBaseMaterialOverride(Enum.Material.LeafyGrass, "")
for _, v in MS:GetChildren() do
	if v:IsA("MaterialVariant") and v.Name ~= "FileGrass" and v.Name ~= Graybox.GRID_NAME then
		v:Destroy()
	end
end
workspace.Terrain:SetMaterialColor(Enum.Material.Basalt, Color3.fromRGB(30, 30, 37))
local names = MaterialKit.kit({
	{ name = "CobblestoneVillage", base = "Cobblestone", maps = "Cobblestone", studsPerTile = 12 },
	{ name = "ConcretePlaster", base = "Concrete", maps = "Concrete", studsPerTile = 16 },
	{ name = "WoodPlanksFloor", base = "WoodPlanks", maps = "WoodPlanks", studsPerTile = 8 },
	{ name = "SlateRoof", base = "Slate", maps = "Slate", studsPerTile = 10 },
	{ name = "BasaltHill", base = "Basalt", maps = "Rock", studsPerTile = 20, pattern = "Organic" },
	{ name = "LeafyGrassMeadow", base = "LeafyGrass", maps = "Grass", studsPerTile = 10, pattern = "Organic" },
})
local village = workspace:WaitForChild("map_geo"):WaitForChild("village")
local dressed = MaterialKit.dress(village, {
	path = { material = Enum.Material.Cobblestone, variant = "CobblestoneVillage", color = Color3.fromRGB(150, 140, 125) },
	wall = { material = Enum.Material.Concrete, variant = "ConcretePlaster", color = Color3.fromRGB(226, 214, 190) },
	floor = { material = Enum.Material.WoodPlanks, variant = "WoodPlanksFloor", color = Color3.fromRGB(150, 110, 80) },
	roof = { material = Enum.Material.Slate, variant = "SlateRoof", color = Color3.fromRGB(140, 70, 55) },
	landmark = { material = Enum.Material.Slate, variant = "SlateRoof", color = Color3.fromRGB(205, 195, 175) },
	prop = { material = Enum.Material.WoodPlanks, variant = "", color = Color3.fromRGB(60, 45, 35) },
})
-- a variant with BaseMaterial Basalt changes nothing until the override is set
local basaltBefore = MS:GetBaseMaterialOverride(Enum.Material.Basalt)
local overrides = {
	Basalt = MaterialKit.override("Basalt", "BasaltHill"),
	LeafyGrass = MaterialKit.override("LeafyGrass", "LeafyGrassMeadow"),
	Grass = MS:GetBaseMaterialOverride(Enum.Material.Grass),
}
-- the terrain material color multiplies the variant: Basalt's default is near black
local basaltColor = workspace.Terrain:GetMaterialColor(Enum.Material.Basalt)
workspace.Terrain:SetMaterialColor(Enum.Material.Basalt, Color3.fromRGB(128, 120, 110))
local slate = MS:FindFirstChild("SlateRoof") :: MaterialVariant
slate.Name = "SlateRoofRenamed"
local broken = MaterialKit.links(village)
local auditMissing = 0
for _, f in EnvAudit.all(game).findings do
	if f.rule == "variant-missing" then
		auditMissing += 1
	end
end
slate.Name = "SlateRoof"
return {
	variants = names,
	dressed = dressed,
	basaltOverrideBeforeSet = basaltBefore,
	overrides = overrides,
	basaltDefaultColor = { math.floor(basaltColor.R * 255), math.floor(basaltColor.G * 255), math.floor(basaltColor.B * 255) },
	brokenAfterRename = #broken.broken,
	auditMissing = auditMissing,
	brokenAfterRestore = #MaterialKit.links(village).broken,
}
```

- Gate: `basaltOverrideBeforeSet` is not "BasaltHill" (the variant exists but no override yet), each
  override reads back its variant name, the rename breaks every SlateRoof part (`brokenAfterRename`
  10, the audit reports `variant-missing`), the restore brings it to 0.
- Run in Studio 0.743 on 2026-10-19: pass, 6 variants; Basalt default color 30, 30, 37; overrides
  read back BasaltHill and LeafyGrassMeadow; the rename broke 10 SlateRoof parts (audit
  `variant-missing` 10), the restore 0.
- Visual check (captured in P7): the BasaltHill override alone kept the hills near black; the
  lighter terrain material color fixed it.

## P7. Looks from fixed cameras, before and after

Python drives this one: snapshot, then for each look restore, apply, capture the same cameras,
measure.

<!-- test: L7_APPLY -->

```lua
-- LOOK is replaced by the runner; AIM is "none" or "day" or "low".
local look = "LOOK"
local aim = "AIM"
local report = Looks.apply(look)
local toward = Vector3.new(-0.5, 0, -0.866) -- behind the spawn camera, which looks along +Z
if aim == "day" then
	report.sun = Looks.aimSun(toward * math.cos(math.rad(35)) + Vector3.new(0, math.sin(math.rad(35)), 0))
elseif aim == "low" then
	report.sun = Looks.aimSun(toward * math.cos(math.rad(20)) + Vector3.new(0, math.sin(math.rad(20)), 0), { clockMin = 15, clockMax = 19 })
end
return report
```

```python
CAMERAS = {"spawn": ([0, 7, -18], [0, 14, 120]), "over": ([150, 110, -90], [0, 0, 90]),
           "pond": ([-60, 18, 20], [-110, 0, 75])}
snap = E.run(s, "return Looks.snapshot()", kit=["Looks"])["result"]       # save it to JSON
for look in ["day_fantasy", "sunset_warm", "night_outdoor", "night_horror"]:
    E.run(s, restore_code(snap) + apply_code(look), kit=["Looks"])        # Looks.restore(HttpService:JSONDecode(json))
    paths = E.capture_set(s, CAMERAS, out_dir, look)
    metrics = {n: E.look_metrics(p, skip_top=0.45) for n, p in paths.items()}
E.sheet(all_paths, out_dir / "looks_sheet.png", cols=3)                   # open it and judge with critique.md
```

- Gates (measured, lower half of the frame): the day looks keep `crushed` under 0.05;
  `night_outdoor` keeps `crushed` under 0.5 in every view (silhouettes readable); `night_horror`
  crushes the far views on purpose (corridor recipe).
- Run in Studio 0.743 on 2026-10-19: pass, sun aimed for day (ClockTime 14.35, latitude -21.5, error
  0.27 degrees) and sunset (15.6, -31, 0.05 degrees); `crushed` 0 in every day view, at most 0.025
  for `night_outdoor`, 0.43, 0.96 and 1.00 for `night_horror` (spawn, overview, pond); day spawn
  `spread` 0.57 against 0.40 neutral.
- Aim the sun before tuning colors: with the default latitude the spawn camera looked into the sun
  and saw only shadow sides.

## P8. Sun placement without a plugin

<!-- test: L8 -->

```lua
local L = game:GetService("Lighting")
local c, g = L.ClockTime, L.GeographicLatitude
local t0 = os.clock()
local want = Vector3.new(0, math.sin(math.rad(45)), -math.cos(math.rad(45)))
local r = Looks.aimSun(want)
r.ms = math.floor((os.clock() - t0) * 1000)
local sun = Looks.sun()
L.ClockTime, L.GeographicLatitude = c, g
return { aim = r, elevation = sun.elevation, heading = sun.heading }
```

- Gate: `errorDegrees` under 1. About 9,000 ClockTime and GeographicLatitude pairs are tried in
  roughly 12 ms.
- Run in Studio 0.743 on 2026-10-19: pass, the sun placed 45 degrees up toward -Z at ClockTime 12
  and latitude -21.5, error 0 degrees, in 14 ms.

## P9. Interior: sun shaft, glass, fake bounce light

<!-- test: L9_APPLY -->

```lua
-- The runner replaces the two placeholder strings with "true" or "false".
local flags = { glass = "GLASS_SHADOW", gi = "FAKE_GI" }
local glassShadow, fakeGI = flags.glass == "true", flags.gi == "true"
local house = workspace:WaitForChild("map_geo"):WaitForChild("village"):WaitForChild("houses"):WaitForChild("House_East")
local old = house:FindFirstChild("FakeGI")
if old then
	old:Destroy()
end
local report = Looks.apply("interior_sun")
report.sun = Looks.aimSun(Vector3.new(0, math.sin(math.rad(45)), -math.cos(math.rad(45))))
local glass = house:WaitForChild("WallRight"):WaitForChild("Glass") :: BasePart
glass.CastShadow = glassShadow
if fakeGI then
	local p = Instance.new("Part")
	p.Name = "FakeGI"
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.Transparency = 1
	p.Size = Vector3.one
	p.Position = glass.Position + Vector3.new(0, 1, 5)
	local light = Instance.new("PointLight")
	light.Name = "FakeGI_Light"
	light.Color = Color3.fromRGB(234, 255, 254)
	light.Range = 50
	light.Brightness = 1.5
	light.Shadows = true
	light.Parent = p
	p.Parent = house
end
return report
```

- Capture camera: `[52, 7, 88]` looking at `[40, 5, 69]` (inside House_East, toward the window).
- Gates: with the glass not casting shadows the floor patch is clipped white (`clipped` above 0.05);
  with `CastShadow` on the patch disappears (`clipped` drops); the fake GI light lifts `mean_luma`
  while the patch stays.
- Run in Studio 0.743 on 2026-10-19: pass, `clipped` 0.098 with glass CastShadow off, 0.061 with it
  on; the fake GI light took mean luma from 0.22 to 0.61 and `crushed` from 0.73 to 0.006.

## P10. Do post effects show in captures?

<!-- test: L10_APPLY -->

```lua
-- MODE is replaced by the runner: "none", "gray" or "bloom".
local mode = "MODE"
local look = table.clone(Looks.PRESETS.day_fantasy)
look.colorCorrection = if mode == "gray" then { Saturation = -1, Enabled = true } else false
look.bloom = if mode == "bloom" then { Threshold = 0, Intensity = 3, Size = 56, Enabled = true } else false
return Looks.apply(look)
```

- Result shape: ColorCorrection shows in the Edit capture (saturation falls to 0); Bloom at
  Intensity 3 changes it no more than two plain captures differ, so judge bloom in a playtest or on
  a device.
- Run in Studio 0.743 on 2026-10-19: pass, gray saturation 0.42 to 0; Bloom against no Bloom 0.0117
  mean luma difference and 4.2 % of pixels changed; two plain captures 0.0127 and 4.5 % (wind on the
  grass).

## P11. Playtest: draw calls, memory, streaming, walking

Apply `night_outdoor`, start a playtest with `rbx_play.Playtest`, then run on the Client:

<!-- test: L11_STATS -->

```lua
return { snap = Stats.snapshot(), frames = Stats.frames(2) }
```

<!-- test: L11_STREAM -->

```lua
local f = workspace:FindFirstChild("streaming_test")
local r = {}
for _, n in { "Far_Persistent", "Far_Default", "Far_Atomic" } do
	local m = f and f:FindFirstChild(n)
	r[n] = if m then #m:GetChildren() else -1
end
return r
```

Before the playtest, in Edit:

<!-- test: L11_SETUP -->

```lua
local old = workspace:FindFirstChild("streaming_test")
if old then
	old:Destroy()
end
local far = Instance.new("Folder")
far.Name = "streaming_test"
for i, mode in { "Persistent", "Default", "Atomic" } do
	local m = Instance.new("Model")
	m.Name = "Far_" .. mode
	m.ModelStreamingMode = (Enum.ModelStreamingMode :: any)[mode]
	for k = 1, 3 do
		Graybox.block(m, "Block" .. k, Vector3.new(6, 6, 6), CFrame.new(600 + i * 30, 3, k * 12), "prop")
	end
	m.Parent = far
end
far.Parent = workspace
return #far:GetChildren()
```

Then on the Client
`game:GetService("Players").LocalPlayer:RequestStreamAroundAsync(Vector3.new(660, 3, 24), 10)` and
`L11_STREAM` again; read `Lighting.ClockTime` twice on the Server 2 s apart;
`pt.walk_to([-48, 3, 80])` walks through the House_West door.

- Gates: 60 fps; draw calls and triangles under the performance owner's per-view budget; the
  Persistent model present at join, Default and Atomic absent at 600 studs with TargetRadius 256,
  all three present after `RequestStreamAroundAsync`; ClockTime unchanged; the character ends inside
  the house.
- Run in Studio 0.743 on 2026-10-19: pass, 60 fps, p95 17.4 ms in both styles; Realistic 134 draw
  calls and 243,644 triangles, Soft 146 and 236,496 (126 to 146 draw calls across three runs); 0
  shadow draw calls; GraphicsTerrain 44 to 46 MB, TerrainVoxels 8.4 to 8.8 MB, GraphicsTexture 47
  MB; Persistent present at join, Default and Atomic absent; all present 0.066 s after
  `RequestStreamAroundAsync`; ClockTime 0 then 0; the walk arrived inside House_West in 7.3 s.

## P12. Environment audit

<!-- test: L12 -->

```lua
local fx = Instance.new("Folder")
fx.Name = "AuditFixtures"
local function part(name: string): Part
	local p = Instance.new("Part")
	p.Name = name
	p.Anchored = true
	p.Parent = fx
	return p
end
local light = Instance.new("PointLight")
light.Parent = part("FixtureUnnamedLight")
local glass = part("FixtureGlass")
glass.Material = Enum.Material.Glass
glass.Transparency = 0.5
glass.CastShadow = true
local missing = part("FixtureMissingVariant")
missing.Material = Enum.Material.Slate
missing.MaterialVariant = "NoSuchVariant"
local farPart = part("FixtureFarPart")
farPart.Position = Vector3.new(20000, 0, 0)
local atomic = Instance.new("Model")
atomic.Name = "FixtureAtomic"
atomic.ModelStreamingMode = Enum.ModelStreamingMode.Atomic
local inner = Instance.new("Model")
inner.Name = "FixturePersistent"
inner.ModelStreamingMode = Enum.ModelStreamingMode.Persistent
inner.Parent = atomic
atomic.Parent = fx
local extraSky = Instance.new("Sky")
extraSky.Name = "FixtureSky1"
extraSky.Parent = game:GetService("Lighting")
local extraSky2 = Instance.new("Sky")
extraSky2.Name = "FixtureSky2"
extraSky2.Parent = game:GetService("Lighting")
fx.Parent = workspace
local withFixtures = EnvAudit.all(game)
fx:Destroy()
extraSky:Destroy()
extraSky2:Destroy()
local clean = EnvAudit.all(game)
local rules = {}
for _, f in withFixtures.findings do
	rules[f.rule] = (rules[f.rule] or 0) + 1
end
-- the lead's Audit on the same scene: physics counts, lighting summary, scripts
local lead = Audit.all(game)
local leadRules = {}
for _, f in lead.findings do
	leadRules[f.rule] = (leadRules[f.rule] or 0) + 1
end
return {
	rules = rules,
	tally = withFixtures.tally,
	clean = clean.tally,
	cleanFindings = clean.findings,
	counts = clean.counts,
	lead = { tally = lead.tally, rules = leadRules, physics = lead.physics.counts, instances = lead.counts.instances },
}
```

- Gate: the fixture run reports `light-unnamed`, `glass-casts-shadow`, `variant-missing`,
  `far-from-origin`, `persistent-model`, `persistent-in-atomic` and `multiple-sky`; the clean scene
  reports no error or warn in `EnvAudit` or in the lead's `Audit` (run with `lead_kit=["Audit"]`).
- Run in Studio 0.743 on 2026-10-19: pass, all 7 fixture rules fired (1 error, 4 warn, 2 info); the
  clean scene had 0 `EnvAudit` findings; the lead `Audit` gave 0 error, 0 warn and 1 info
  (`no-atmosphere`, the neutral look); 69 parts, 11 lights, 0 unions, 0 unanchored, 1,880 instances.
- Offline, on a saved file: `python3 scripts/rbx_environment.py audit place.rbxl` (Lune also reads
  the streaming settings that scripts cannot).

## P13. Part to Terrain and smoothing

Blockout terrain with parts (BONES), convert, then smooth (the substitute for the Smooth brush).

<!-- test: L13 -->

```lua
-- a flat plate of its own at x 400 to 520, outside the village terrain, rebuilt each run so the test repeats
local X0 = 400
local function flat(_x: number, _z: number): number
	return 0
end
TerrainKit.heightfield({ min = { X0 + 28, -68 }, size = { 104, 80 }, bottom = -16, top = 48, height = flat })
local folder = Instance.new("Folder")
folder.Name = "terrain_blockout"
local function make(cls: string, name: string, size: Vector3, cf: CFrame, shape: Enum.PartType?)
	local p = Instance.new(cls) :: BasePart
	p.Name = name
	p.Anchored = true
	p.Size = size
	p.CFrame = cf
	if shape then
		(p :: Part).Shape = shape
	end
	p.Parent = folder
	return p
end
make("WedgePart", "Ramp", Vector3.new(30, 16, 30), CFrame.new(X0 + 80, 8, -18))
make("Part", "Shelf", Vector3.new(30, 16, 24), CFrame.new(X0 + 80, 8, -45))
make("Part", "Log", Vector3.new(24, 8, 8), CFrame.new(X0 + 50, 4, -20), Enum.PartType.Cylinder)
make("Part", "Boulder", Vector3.new(14, 14, 14), CFrame.new(X0 + 110, 6, -10), Enum.PartType.Ball)
folder.Parent = workspace
local before = workspace.Terrain:CountCells()
local kinds = TerrainKit.fromParts(folder, Enum.Material.Rock)
-- the cylinder lies along X like the Part: on the log 8 studs from its center, then beside it (voxels)
local logEndY = TerrainKit.surfaceY(X0 + 58, -22)
local logSideY = TerrainKit.surfaceY(X0 + 50, -32)
-- the same point by raycast, for comparison: once with no retry, then retried for up to 30 frames
local rayEndY = TerrainKit.groundY(X0 + 58, -22, 60, 0)
local rayEndRetried = TerrainKit.groundY(X0 + 58, -22, 60)
local smooth = TerrainKit.smooth({ X0 + 30, -4, -65 }, { X0 + 125, 30, 5 }, 1)
folder:Destroy()
return {
	kinds = kinds,
	cellsAdded = workspace.Terrain:CountCells() - before,
	logEndY = logEndY,
	logSideY = logSideY,
	rayEndFirst = rayEndY or "miss",
	rayEndRetried = rayEndRetried or "miss",
	smoothed = smooth.changed,
}
```

- Gate: four kinds converted, cells added, `logEndY` at least 3 studs above `logSideY` (the log runs
  along X; a Y-axis cylinder would stand up as a post and leave that point at ground level).
- Run in Studio 0.743 on 2026-10-19: pass, 4 kinds converted, 308 cells added, 1,647 voxels
  smoothed; log top 4 and ground beside it 0 by voxels; the ray with no retry missed, the retried
  ray hit at 2.7. The plate capture showed only sky (see the run record).
- The 8-stud log came out about 4 studs high on the 4-stud voxel grid: block out terrain shapes
  several voxels thick.
- Read heights after a fill from the voxels (`TerrainKit.surfaceY`): a terrain raycast right after
  the fills, and one frame later, returned nothing; retried, it hit.
- Keep the plate away from other terrain: a first version reset a patch inside the village basin and
  cut a crack into the hills.
- Capture camera: `[440, 30, -100]` looking at `[480, 5, -30]`.

## P14. Foliage scatter on the village terrain

The scatter recipe of [`foliage.md`](foliage.md) runs on the village: the block marked there is the
code this test executes. A setup block builds the template library; a check block measures what was
planted. Captures from the fixed cameras come before and after, in the day look.

<!-- test: L14_SETUP -->

```lua
-- The library the foliage block reads: one template per variant, each pivot at its base.
local ss = game:GetService("ServerStorage")
local oldLib = ss:FindFirstChild("Foliage")
if oldLib then
	oldLib:Destroy()
end
local oldDressing = workspace:FindFirstChild("map_dressing")
if oldDressing then
	oldDressing:Destroy()
end
local lib = Instance.new("Folder")
lib.Name = "Foliage"
local function piece(parent: Instance, name: string, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material, shape: Enum.PartType?): Part
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.CFrame = cf
	p.Color = color
	p.Material = material
	if shape then
		p.Shape = shape
	end
	p.Anchored = true
	p.Parent = parent
	return p
end
local rock = Color3.fromRGB(128, 122, 112)
local leaf = Color3.fromRGB(74, 128, 58)
piece(lib, "RockL1", Vector3.new(10, 7, 9), CFrame.new(), rock, Enum.Material.Slate)
piece(lib, "RockL2", Vector3.new(12, 6, 10), CFrame.new(), rock, Enum.Material.Slate)
piece(lib, "RockS1", Vector3.new(3, 2, 3), CFrame.new(), rock, Enum.Material.Slate)
piece(lib, "Bush1", Vector3.new(5, 5, 5), CFrame.new(), leaf, Enum.Material.Grass, Enum.PartType.Ball)
piece(lib, "Bush2", Vector3.new(4, 4, 4), CFrame.new(), leaf, Enum.Material.Grass, Enum.PartType.Ball)
-- A tree as a Model, so the Model path (ScaleTo, PivotTo) runs too.
local tree = Instance.new("Model")
tree.Name = "Tree1"
piece(tree, "Trunk", Vector3.new(10, 2, 2), CFrame.new(0, 5, 0) * CFrame.Angles(0, 0, math.rad(90)), Color3.fromRGB(110, 80, 52), Enum.Material.Wood, Enum.PartType.Cylinder)
piece(tree, "Crown", Vector3.new(10, 10, 10), CFrame.new(0, 13, 0), leaf, Enum.Material.Grass, Enum.PartType.Ball)
tree.WorldPivot = CFrame.new(0, 0, 0)
tree.Parent = lib
lib.Parent = ss
return #lib:GetChildren()
```

Then the block marked in [`foliage.md`](foliage.md) runs with
`kit=["Graybox", "TerrainKit", "Scatter"]`, then this check:

<!-- test: L14_CHECK -->

```lua
-- Measure every planted clone: ground contact by an independent ray, flags per variant, cells and their LOD.
local foliage = workspace:WaitForChild("map_dressing"):WaitForChild("foliage")
local sink = { RockS1 = 0.5 }
local include: { Instance } = { workspace.Terrain }
local blockout = workspace:FindFirstChild("map_geo")
if blockout then
	table.insert(include, blockout)
end
local rp = RaycastParams.new()
rp.FilterType = Enum.RaycastFilterType.Include
rp.FilterDescendantsInstances = include
rp.IgnoreWater = false
local out = {
	cells = 0,
	slimCells = 0,
	clones = 0,
	measured = 0,
	worstGround = 0,
	wrongCell = 0,
	byName = {},
	flagErrors = 0,
	unanchored = 0,
	treeModels = 0,
	treeScaleMin = math.huge,
	treeScaleMax = 0,
}
local function partsOf(c: Instance): { BasePart }
	if c:IsA("BasePart") then
		return { c }
	end
	local list = {}
	for _, d in c:GetDescendants() do
		if d:IsA("BasePart") then
			table.insert(list, d)
		end
	end
	return list
end
for _, cell in foliage:GetChildren() do
	if not cell:IsA("Model") then
		continue
	end
	out.cells += 1
	if cell.LevelOfDetail == Enum.ModelLevelOfDetail.SLIM then
		out.slimCells += 1
	end
	for _, c in cell:GetChildren() do
		out.clones += 1
		out.byName[c.Name] = (out.byName[c.Name] or 0) + 1
		local base: Vector3
		if c:IsA("BasePart") then
			base = (c.CFrame * CFrame.new(0, -c.Size.Y / 2, 0)).Position
		else
			local m = c :: Model
			base = m:GetPivot().Position
			out.treeModels += 1
			out.treeScaleMin = math.min(out.treeScaleMin, m:GetScale())
			out.treeScaleMax = math.max(out.treeScaleMax, m:GetScale())
		end
		if cell.Name ~= "cell_" .. Scatter.cellKey(base.X, base.Z) then
			out.wrongCell += 1
		end
		local hit = workspace:Raycast(base + Vector3.new(0, 60, 0), Vector3.new(0, -120, 0), rp)
		if hit then
			out.measured += 1
			out.worstGround = math.max(out.worstGround, math.abs(base.Y + (sink[c.Name] or 0) - hit.Position.Y))
		end
		for _, p in partsOf(c) do
			if not p.Anchored then
				out.unanchored += 1
			end
			local name = c.Name
			local bush = name == "Bush1" or name == "Bush2"
			if bush and (p.CanCollide or p.CanQuery or p.CastShadow) then
				out.flagErrors += 1
			elseif name == "RockS1" and (p.CanCollide or p.CastShadow) then
				out.flagErrors += 1
			elseif (name == "RockL1" or name == "RockL2" or name == "Tree1") and not p.CanCollide then
				out.flagErrors += 1
			end
		end
	end
end
out.worstGround = math.floor(out.worstGround * 1000 + 0.5) / 1000
if out.treeModels == 0 then
	out.treeScaleMin = 0
end
return out
```

<!-- test: L14_CLEAN -->

```lua
for _, inst in { workspace:FindFirstChild("map_dressing"), game:GetService("ServerStorage"):FindFirstChild("Foliage") } do
	if inst then
		inst:Destroy()
	end
end
return true
```

- Gates:
  - more than 100 clones planted, none missed;
  - floors, paths and water skipped at least once each, no missing template, every layer placed;
  - the check counts every clone; every cell SLIM and named after its clones' position;
  - every clone base within 0.25 stud of an independent ray's ground, minus its sink;
  - flags as declared per variant; all anchored; Tree1 Models scaled inside 0.9 to 1.3;
  - the overview capture changed against the one before the scatter, and no capture is blank or
    stalled.
- Review: open `L14_scatter_sheet.png` (before on the top row, after below) and judge it with the
  Judge list in [`foliage.md`](foliage.md).
- Run in Studio: pending (queued, 2026-10-19).

## P15. Debug views, invisible blockers and overlay boxes

Fixtures float at x 280 to 344, z -300, y 38 to 52, against the sky: a visible floor, an invisible
blocker, an invisible wall tagged `Barrier`, and a union doorway with Hull fidelity (Hull fills the
opening, P5). The block marked in [`verification.md`](verification.md) turns the views on and boxes
the blockers; this test captures two cameras before, twice, and after.

<!-- test: L15_SETUP -->

```lua
local old = workspace:FindFirstChild("check_test")
if old then
	old:Destroy()
end
local folder = Instance.new("Folder")
folder.Name = "check_test"
folder.Parent = workspace
local function part(name: string, size: Vector3, cf: CFrame, transparency: number): Part
	local p = Instance.new("Part")
	p.Name = name
	p.Anchored = true
	p.Size = size
	p.CFrame = cf
	p.Transparency = transparency
	p.Color = Color3.fromRGB(200, 200, 200)
	p.Parent = folder
	return p
end
part("FixtureFloor", Vector3.new(64, 2, 24), CFrame.new(312, 39, -300), 0)
part("FixtureBlocker", Vector3.new(10, 10, 1), CFrame.new(290, 45, -300), 1)
part("FixtureBarrier", Vector3.new(10, 10, 1), CFrame.new(310, 45, -300), 1):AddTag("Barrier")
local wall = Instance.new("Part")
wall.Size = Vector3.new(16, 12, 1)
wall.CFrame = CFrame.new(335, 46, -300)
local hole = Instance.new("Part")
hole.Size = Vector3.new(10, 10, 3)
hole.CFrame = CFrame.new(335, 45, -300)
local door = game:GetService("GeometryService"):SubtractAsync(wall, { hole }, {
	CollisionFidelity = Enum.CollisionFidelity.Hull,
	SplitApart = false,
})[1] :: BasePart
door.CFrame = wall.CFrame
door.Anchored = true
door.Color = Color3.fromRGB(150, 150, 160)
door.Name = "FixtureDoorHull"
door.Parent = folder
task.wait()
return { fixtures = #folder:GetChildren(), doorFidelity = door.CollisionFidelity.Name }
```

<!-- test: L15_OFF -->

```lua
local views = WorldCheck.debugViews(false)
local cleared = WorldCheck.clear()
local readBack = {}
local ok, v = pcall(function()
	return settings().Physics.ShowDecompositionGeometry
end)
readBack.decomposition = if ok then v else tostring(v)
ok, v = pcall(function()
	return settings().Rendering.RenderCSGTrianglesDebug
end)
readBack.csgWireframe = if ok then v else tostring(v)
return { views = views, cleared = cleared, readBack = readBack }
```

- Cameras: `blocker` from `[290, 47, -330]` toward `[290, 45, -300]`; `door` from `[335, 47, -330]`
  toward `[335, 45, -300]`.
- Gates:
  - both debug views accept the write (`true`) and read back `false` after the reset;
  - `invisibleColliders` lists `FixtureBlocker`, not the tagged barrier or the visible floor, and
    counts the barrier as tagged;
  - per camera, the capture with views and boxes differs from the plain one by more than three times
    the difference between two plain captures (at least 0.5 % of pixels);
  - after `clear` and the reset, each camera is back within that noise.
- Run in Studio: pending (queued, 2026-10-19).

## P16. Streaming route: stream-in, stream-out, revisit

The traversal test of [`verification.md`](verification.md), run in this place at its own radii
(MinRadius 64, TargetRadius 256, StreamOutBehavior Opportunistic, read back by O5). Three landmarks
stand on platforms 650 to 955 studs apart, so each stop is beyond the target radius of the others.

<!-- test: L16_SETUP -->

```lua
local old = workspace:FindFirstChild("route_test")
if old then
	old:Destroy()
end
local folder = Instance.new("Folder")
folder.Name = "route_test"
local stops = {
	Route_Home = Vector3.new(0, 48, -450),
	Route_East = Vector3.new(650, 48, -450),
	Route_North = Vector3.new(650, 48, 250),
}
local out = {}
for name, at in stops do
	local m = Instance.new("Model")
	m.Name = name
	Graybox.block(m, "Platform", Vector3.new(40, 2, 40), CFrame.new(at), "floor")
	Graybox.block(m, "Pillar", Vector3.new(4, 30, 4), CFrame.new(at + Vector3.new(12, 16, 12)), "landmark")
	m.Parent = folder
	out[name] = { at.X, at.Y, at.Z }
end
folder.Parent = workspace
return out
```

<!-- test: L16_MOVE -->

```lua
-- Server. The runner replaces the target. No RequestStreamAroundAsync here: the test shows what a client sees
-- when content is absent; shipped teleports request the area first.
local target = Vector3.new(0, 54, -450)
local player = game:GetService("Players"):GetPlayers()[1]
local character = player.Character or player.CharacterAdded:Wait()
character:PivotTo(CFrame.new(target))
return true
```

<!-- test: L16_HERE -->

```lua
-- Client: which landmarks have parts here, and where the character stands.
local r = WorldCheck.presence(workspace, { "Route_Home", "Route_East", "Route_North" })
local character = game:GetService("Players").LocalPlayer.Character
local root = character and character:FindFirstChild("HumanoidRootPart")
r.at = if root and root:IsA("BasePart") then { root.Position.X, root.Position.Y, root.Position.Z } else false
return r
```

<!-- test: L16_WHERE -->

```lua
-- Server: the landmarks as built.
return WorldCheck.positions(workspace, { "Route_Home", "Route_East", "Route_North" })
```

- Route: Home, East, North, then Home again. At each stop the runner waits up to 30 s for the stop's
  landmark on the client, then up to 45 s for the previous landmark to leave.
- Gates:
  - server positions equal the built ones;
  - at every stop the landmark is present and the character stands within 20 studs of it;
  - at least one earlier landmark unloads past the target radius (all three moves are recorded);
  - Home is present again on the return;
  - no new console line with `attempt to index nil` or `Infinite yield possible`, CoreGui lines
    aside.
- Run in Studio: pending (queued, 2026-10-19).

## Run record

- Live: `python3 tests/code/scenario-roblox-environment/run_live.py` in Studio 0.743, place
  `tests/places/scenario-roblox-environment/`. Results:
  `tests/live_evidence/scenario-roblox-environment/results.json`.
- Offline: `tests/code/scenario-roblox-environment/run_offline.sh`.
- Record: the full run of 2026-10-19 01:14 passed 14 of 14 (L0 to L13), exit 0, after two earlier
  full runs that found the L13 bugs fixed above. The run lines in each procedure quote it.
- A later full run (01:44) passed 11 of 14: every Edit capture came back as an empty dark viewport,
  so L7, L9 and L10 failed on their image gates while the code gates passed. Another agent saw the
  same stall from about 01:22 with five place windows open; a covered window likely stops drawing.
  Its results are kept as `results_run4_viewport_stalled.json`.
- When an Edit capture is a flat dark frame with only the view cube, the window is not drawing:
  rerun the capture tests once it draws again, and do not judge looks from it.
