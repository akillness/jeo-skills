# Client memory, assets, rigs and crowds

What each client holds, what the art costs, what characters, NPCs and pets cost, and why a crowded
hub defeats streaming. This skill owns the measurement and the budget; scenario-roblox-environment
places models and sets `LevelOfDetail`, scenario-roblox-assets imports meshes and textures,
scenario-roblox-animation owns the rigs. Citations point to [sources.md](sources.md); "not yet run
(needs Studio)" marks code that has only passed the type check.

## M1. Client memory composition

Every client downloads ReplicatedFirst, ReplicatedStorage, Workspace (streamed when StreamingEnabled
is on), Lighting, SoundService, MaterialService and a copy of the Starter containers. ServerStorage
and ServerScriptService never leave the server.

| Lever             | Rule                                                                                                                                                                                                                                          | Source                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| ReplicatedFirst   | The loading screen only: it loads before anything else                                                                                                                                                                                        | Docs, Improve performance (load times); BrawlDev NIstQ3krceg [00:11:02] for the preload anti-pattern |
| ReplicatedStorage | Only what clients need; maps, unused levels and heavy assets wait in ServerStorage and are cloned in when needed                                                                                                                              | Docs, Improve performance; Crusherfire YWyJHwynM1M [00:11:39]                                        |
| Parts             | About 1 KB of client memory each; bake many parts into a few meshes when mesh collision is acceptable                                                                                                                                         | McNeill cWDNVvOh4o0 [00:30:30]; rwLEnBtXr30 [00:16:34], [00:33:09]                                   |
| Textures          | Memory is pixel count, 4 times per size step; most at 512 px or below, small ones at 256; one size per PBR set                                                                                                                                | OCUZKJJR-TE [00:02:46], [00:03:19], [00:04:59]                                                       |
| Meshes            | Fewer vertices for the same look; trim sheets shared across meshes                                                                                                                                                                            | OCUZKJJR-TE [00:05:32], [00:05:57]                                                                   |
| Far models        | `Model.LevelOfDetail`: Automatic drops the model outside the radius; StreamingMesh shows a crude stand-in and needs `StreamingTargetRadius` of 1,000 studs or more; SLIM is the sweet spot in many cases and still works on Persistent models | Wwj8EkMWFhI [00:02:23], [00:03:24], [00:03:51], [00:04:27]                                           |
| Audio             | `AudioPlayer.AutoLoad` false for audio not needed at spawn; Sounds created at play time, not parked in SoundService                                                                                                                           | OCUZKJJR-TE [00:08:08]; YWyJHwynM1M [00:09:04]                                                       |
| Budget            | About 1.3 GB on a low-end device; about 600 MB usable in the Grow a Garden analysis                                                                                                                                                           | OCUZKJJR-TE [00:10:09]; rwLEnBtXr30 [00:04:22]                                                       |

Static, offline or in Edit: `PerfAudit.assets` returns the composition per container (instances,
parts, the 1 KB per part estimate, client or server side), plus everything M2 and M3 use.

```python
import rbx_perf
a = rbx_perf.audit_place("game.rbxl", assets=True)   # Lune, no Studio; from the CLI: lune_perf_audit.luau <place> assets
print(a["composition"]["ReplicatedStorage"], a["composition"]["clientParts"], a["byRule"])
```

```lua
local a = PerfAudit.assets(game, 10)
return { composition = a.composition, lod = a.lod, audio = a.audio, rigs = a.rigs, byRule = a.byRule }
```

Rules it raises: `replicated-first-heavy` (parts, or more than 500 instances [added]),
`lod-streamingmesh-radius` (StreamingMesh with a target radius under 1,000 studs, when the radius is
readable: Lune reads it from the file, Studio's `execute_luau` does not), `audio-autoload`, plus the
M2 and M3 rules.

Result (O1, O2): run offline in Lune on 2026-10-19: pass. Unit tests on a planted place
(composition, groups, images, LOD, audio, rigs), and the audit read Studio-saved MeshContent and
TextureContent ids from two test places.

At run time, the Client's memory by Developer Console tag. Studio totals include Studio itself (S1),
so compare two playtests that differ in one change and leave phone numbers to P9.

```lua
-- not yet run (needs Studio): playtest Client, memory by tag, largest first.
local S = game:GetService("Stats")
local rows = {}
for _, tag in Enum.DeveloperMemoryTag:GetEnumItems() do
	local mb = S:GetMemoryUsageMbForTag(tag :: any)
	if mb >= 0.1 then
		table.insert(rows, { tag = tag.Name, mb = math.round(mb * 10) / 10 })
	end
end
table.sort(rows, function(a, b)
	return a.mb > b.mb
end)
return { totalMb = math.round(S:GetTotalMemoryUsageMb()), tags = rows }
```

Read `GraphicsTexture`, `GraphicsMeshParts`, `BaseParts`, `Instances`, `Sounds` and `Animation`
against the levers above.

## M2. Asset memory and batching audit

A draw is one mesh and material pair; a different MeshId or material starts a new one; primitives
batch in their own groups; Decals and Textures add draws (McNeill cWDNVvOh4o0 [00:10:31],
[00:13:18], [00:13:52], [00:15:00]). Instancing also needs the same SurfaceAppearance or
TextureContent (docs). The batching tier list is in [expert-notes.md](expert-notes.md) ([00:18:50]).

`PerfAudit.assets` groups Workspace MeshParts by mesh id, material, MaterialVariant and image set,
and other parts by class, shape and material:

- `drawGroups.top`: the largest groups. Repeated props should sit in a few large groups.
- `singletonGroups` and the `mesh-singletons` warn (20 groups or more, over half with one part
  [added]): imported copies of one rock each with its own MeshId multiply draws; copying the one
  rock does not (VDO_amtWfDw [00:01:04]; YWyJHwynM1M [00:21:31]).
- `meshesWithSeveralLooks` and `mesh-several-looks`: one mesh under several materials or image sets
  draws once per set.
- `images`: distinct image ids, references, `topObjects` (images held per object; a full PBR set
  is 4) and `mostShared`. MaterialVariant maps count once, under MaterialService.

Groups are static: an upper bound before streaming, LOD and the camera. The render proof is the P7
probe in [procedures.md](procedures.md) (live run pending).

Pixel sizes are not stored in the place. Two ways to read them:

- Source images kept in the project, offline (ImageMagick; ran on 2026-10-19):

```bash
magick identify -format "%w %h %f\n" textures/*.png | awk '{m = ($1 > $2 ? $1 : $2); n++; if (m <= 512) s++; if (m > 512) print "over 512:", $0} END {printf "%d of %d images at 512 px or below\n", s, n}'
```

- Uploaded ids, in Studio, from `images.mostShared` or the full list. `CreateEditableImageAsync`
  reads only images the experience owner owns or that were made in the experience, and returns nil
  when the editable memory budget is spent; destroy each image after reading.

```lua
-- not yet run (needs Studio): Edit, through execute_luau. Pixel size per image id.
local AssetService = game:GetService("AssetService")
local ids = { "rbxassetid://0" } -- images.mostShared ids from the asset audit
local out = {}
for _, id in ids do
	local ok, img = pcall(function()
		return AssetService:CreateEditableImageAsync(Content.fromUri(id))
	end)
	if ok and img then
		table.insert(out, { id = id, width = img.Size.X, height = img.Size.Y })
		img:Destroy()
	else
		table.insert(out, { id = id, failed = if ok then "no image (memory budget)" else tostring(img) })
	end
end
return out
```

Gate: most images at 512 px or below, unless the surface fills the screen; one size per PBR set; a
1024 PBR set holds about 2.8 MB (McNeill [00:29:57]). By hand on a device: Developer Console >
Memory > graphicsTexture (OCUZKJJR-TE [00:02:46]).

## M3. Character, NPC and pet cost

Measure first. The MicroProfiler timers (docs, MicroProfiler tag table):

- `Prepare/UpdatePrepare/updateInvalidatedFastClusters`: rebuilds the render geometry of Humanoid
  models and skinned MeshParts. Over 4 ms often means avatars or rigs are created or changed too
  often (docs, Improve performance). Watch it as player and NPC density grows (VDO_amtWfDw
  [00:02:44], [00:06:07]).
- `Simulation/gameStepped/stepHumanoid`: Humanoid states and movement.
- `Simulation/gameStepped/stepAnimation`: Humanoid and Animator animation.

```lua
-- not yet run (needs Studio): playtest Client, or Edit for a scene of rigs. Rig timers per frame.
local r = MicroProf.capture(3, {
	mask = "*updateInvalidatedFastClusters*|*stepHumanoid*|*stepAnimation*",
	frames = 128,
	tries = 4,
	minFrames = 5,
})
local timers = {}
for _, timer in r.timers do
	timers[timer.name] = { msPerFrame = timer.msPerFrame, worstFrameMs = timer.worstFrameMs }
end
return { frames = r.frames, timers = timers }
```

Budget: `updateInvalidatedFastClusters` worst frame under 4 ms, and near 0 ms per frame while
nothing spawns or changes [added]. `stepHumanoid` and `stepAnimation` are compared per frame, one
change per playtest (P2). Static counts from `PerfAudit.assets(game).rigs`: Humanoids, anchored rigs
that still carry one (`humanoid-static`), AnimationControllers, Animators, and models with skinned
MeshParts and no Humanoid (`skinned-no-humanoid`).

Fixes, each measured alone; the rig work itself goes to scenario-roblox-animation:

- Out of range: anchor the rig and stop its Animator. Dead Rails halved server CPU this way
  (rwLEnBtXr30 [00:09:24]).
- Static NPCs: an AnimationController and an Animator, no Humanoid (OCUZKJJR-TE [00:07:29]; docs).
  Where a Humanoid stays: `EvaluateStateMachine` off on static ones (YWyJHwynM1M [00:26:38]), unused
  states off with `SetStateEnabled` (docs).
- Many NPCs or pets: create the Animator on the client and play animations there, only near the
  player (docs).
- Respawns: pool NPC models instead of destroying them; avoid size, scale and other property changes
  on rigs during play, since they rebuild FastClusters (docs).
- Moving skinned models without a Humanoid (pets, creatures): their MeshParts sit in spatial
  FastClusters that rebuild as they move. A Humanoid inside the model forces one cluster for the
  model; it costs memory, so keep it to models that move and keep it only if
  `updateInvalidatedFastClusters` drops (docs). This is the one case where adding a Humanoid can be
  the fix.

## M4. Crowds: when streaming saves nothing

Streaming drops what is far from each player. When every player stands in one hub, nothing is far:
each client renders every avatar, and streaming saves nothing (rwLEnBtXr30 [00:37:31]; VDO_amtWfDw
[00:06:07]). 200 players in a tight space can challenge any device (OCUZKJJR-TE [00:07:29]).

- Spread players: several spawn points, separate plazas and queue pads, instanced areas (VDO_amtWfDw
  [00:06:07]; OCUZKJJR-TE [00:07:29]).
- Or lower max players per server (VDO_amtWfDw [00:06:07]).
- Large events of several hundred players: custom replication that fits inside 40 to 50 KB/s, and
  lighter player models on clients (rwLEnBtXr30 [00:37:31], [00:38:04]).

Test the worst case: the place's max player count packed at the hub, then the same count spread over
the map. Stand-ins come from `CreateHumanoidModelFromDescriptionAsync` and carry no Animate script,
so they measure rendering, FastCluster and Humanoid cost, not animation.

```lua
-- not yet run (needs Studio): playtest Server. spread = 0 packs the stand-ins at the hub; 400 spreads them.
local Players = game:GetService("Players")
local count, spread = 60, 0 -- count: the place's max players
local hub = Vector3.new(0, 5, 0) -- the spawn hub
local folder = Instance.new("Folder")
folder.Name = "CrowdProbe"
folder.Parent = workspace
local template = Players:CreateHumanoidModelFromDescriptionAsync(Instance.new("HumanoidDescription"), Enum.HumanoidRigType.R15)
for i = 1, count do
	local rig = template:Clone()
	local angle = i * 2.4
	local radius = if spread > 0 then spread * math.sqrt(i / count) else 3 + (i % 6) * 2
	rig:PivotTo(CFrame.new(hub + Vector3.new(math.cos(angle) * radius, 0, math.sin(angle) * radius)))
	rig.Parent = folder
end
template:Destroy()
return #folder:GetChildren()
```

```python
# not yet run (needs Studio): one playtest per layout, Client numbers. CROWD is the chunk above; s and Playtest as in P2.
for spread in (0, 400):
    with Playtest(s, settle=2, timeout=150) as pt:
        rbx_perf.run(s, CROWD.replace("spread = 0", f"spread = {spread}"), "Server", timeout=60)
        print(spread, rbx_perf.measure(pt, seconds=6),
              rbx_perf.micro(s, "Client", 3, mask="*updateInvalidatedFastClusters*|*stepHumanoid*", tries=4, min_frames=5))
```

Gate: packed at the hub, the Client meets the frame gate and `updateInvalidatedFastClusters` stays
under 4 ms. If not, spread players or lower max players before tuning streaming. Studio gives the
delta between the two layouts; the verdict comes from a phone or a live server at max players (P9).
By hand, Studio's Test tab > Clients and Servers starts several local players, one window each.
