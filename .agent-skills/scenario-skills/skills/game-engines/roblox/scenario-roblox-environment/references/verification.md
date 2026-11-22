# Verification beyond the capture: streaming, overlays, asset memory

A contact sheet shows mood and composition. It cannot show what streams out, what blocks a player
without being drawn, or what a texture costs. This page covers three checks that can fail, with the
Studio path for a human and the code an agent runs. The kit module is
[`WorldCheck`](../scripts/agentkit/environment/WorldCheck.luau).

**Test status:**

- `WorldCheck` (invisible blockers, overlay boxes, landmark positions and presence) passed 2 Lune
  tests offline (O1, 2026-10-19).
- The streaming test place build passed O8: Rojo wrote the radius-64 copy and Lune read it back.
- `E.texture_check` passed O9 on synthetic maps.
- The route at this place's radius 256 (live test L16) and the debug views (L15) are queued
  (2026-10-19), results pending. The radius-64 copy and the Studio audit runs are not yet run (needs
  Studio).

## 1. A streaming test that can fail

Per-model streaming modes belong to scenario-roblox-architecture (`references/project-setup.md`): an
Atomic map root, Persistent only for spawns and what a client test reads from afar. This section
tests the result on the map.

**From the docs (Streaming techniques):**

- Test at `StreamingTargetRadius` 64.
- Walk and teleport across the whole map, then revisit areas.
- Watch Output for `attempt to index nil with ...`: it signals a missing `WaitForChild`.
- "Streaming bugs often only manifest at the edges of the streamed area or during transitions."
- `StreamOutBehavior` Opportunistic lets the engine unload content past the target radius without
  memory pressure (Instance streaming doc).

**Live, P11:** at the place's own radius, a Persistent far model was on the client at join. An
Atomic one and a Default one were absent until `RequestStreamAroundAsync` (0.066 s). A Studio
playtest streams, so this test can run without a device.

**Steps:**

1. **Build a test copy.** `E.streaming_project(project, radius=64)` writes
   `streaming64.project.json` next to the project. It sets StreamingEnabled, TargetRadius 64,
   MinRadius at most 64 and StreamOutBehavior Opportunistic.
   - These settings are file-only for scripts (P1).
   - Build it with `rojo build streaming64.project.json -o <place>.rbxl` and open that place with
     `rbx_env.open_place` for its own run.
2. **Pick landmarks and a route.** Name 4 to 8 models spread to the map's edges. The route visits
   each edge, then returns to the first stop.
3. **At each stop:**
   - The server moves the character without `RequestStreamAroundAsync`, to expose client code that
     assumes presence. Shipped teleports should request the area first (architecture skill).
   - Wait, then read landmark positions on the server and presence on the client.
4. **Read the console** once at the end.

**GATE (each line can fail):**

- No console line contains `attempt to index nil` or `Infinite yield possible`.
- At every stop, each landmark within StreamingMinRadius of the character is present.
- At least one landmark that was present earlier is absent at a stop beyond the target radius. If
  none unloads, a model or an ancestor is Persistent, or StreamOutBehavior did not apply.
- Back at the first stop, its landmarks are present again.

```python
# Not yet run at radius 64 (needs Studio): the place is built from streaming64.project.json and open in Studio.
import json
import math
import time

import rbx_environment as E
from rbx_play import Playtest

LANDMARKS = ["Tower", "Well", "Bridge", "Gate"]  # model names in Workspace
STOPS = [(0, 5, 0), (300, 5, 0), (300, 5, 300), (0, 5, 300), (0, 5, 0)]  # map edges, then back to the start
names = "{" + ", ".join(json.dumps(n) for n in LANDMARKS) + "}"
log = []
with Playtest(studio) as pt:
    for x, y, z in STOPS:
        pt.server("local c = game:GetService('Players'):GetPlayers()[1].Character "
                  f"c:PivotTo(CFrame.new({x}, {y}, {z})) return true")
        time.sleep(4)
        where = E.run(studio, f"return WorldCheck.positions(workspace, {names})", dm="Server", kit=["WorldCheck"])
        here = E.run(studio, f"return WorldCheck.presence(workspace, {names})", dm="Client", kit=["WorldCheck"])
        dist = {n: math.dist((x, y, z), p) for n, p in where["result"].items() if p}
        log.append({"stop": (x, y, z), "dist": dist, "present": here["result"]["present"]})
    console = pt.console()
bad = [ln for ln in console.splitlines() if "attempt to index nil" in ln or "Infinite yield possible" in ln]
near_missing = [(e["stop"], n) for e in log for n, d in e["dist"].items() if d < 64 and not e["present"][n]]
unloaded = {n for i, e in enumerate(log) for n, d in e["dist"].items()
            if d > 64 and not e["present"][n] and any(f["present"][n] for f in log[:i])}
back = all(log[-1]["present"][n] for n, d in log[-1]["dist"].items() if d < 64)
passed = not bad and not near_missing and bool(unloaded) and back
```

**Human path:** in a playtest, press Shift+Cmd+F3 on a Mac (Shift+Ctrl+F3 on Windows) for the
Network Stats overlay. Then press Shift+1 until the fourth panel, Streaming, shows (Instance
streaming doc, Runtime debugging).

- Viewport colors: red inside MinRadius, yellow between the radii, blue at the target radius, green
  beyond.
- Raise `StarterPlayer.CameraMaxZoomDistance` (the docs use 1000) to watch pop-in from above.
- The overlay is keyboard-only, so an agent uses the presence log above instead.

## 2. Overlays for what the eye cannot see

| What                                                       | Studio path (human)                                                                          | Code (agent)                                                                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Collision shapes of unions and meshes: filled openings     | Visualization Options (upper right of the 3D viewport) > **Collision fidelity** (Meshes doc) | `WorldCheck.debugViews(true)`, which sets `settings().Physics.ShowDecompositionGeometry`; capture, then `debugViews(false)` |
| Junk triangles on unions (Kaiwala, Ahn2P_4TDrU [00:05:19]) | wireframe view                                                                               | `settings().Rendering.RenderCSGTrianglesDebug`, set by the same call                                                        |
| Invisible blockers                                         | none built in; select parts with Transparency 1 in the Explorer                              | `WorldCheck.invisibleColliders(workspace)`, then `WorldCheck.mark(parts)` for a capture, `WorldCheck.clear()` after         |
| SLIM level of detail and streaming state                   | Visualization Options > SLIM tint mode; in Edit only TranscoderStatus (SLIM doc)             | none tested; read `LevelOfDetail` per model (`PerfAudit.assets` lists the counts)                                           |
| Post effects at full quality                               | Studio Settings > Rendering > Editor Quality Level                                           | `settings().Rendering.EditQualityLevel` (applies when `EnableFRM` is false)                                                 |

- The `settings()` properties are PluginSecurity (API reference). Siblings measured `execute_luau`
  reaching PluginSecurity services in Edit (scenario-roblox-ui) and in playtests
  (scenario-roblox-performance).
- These writes are queued as live test L15 (2026-10-19), result pending. `debugViews` returns `true`
  per view that accepted the write, or the error text.
- Tag intended invisible walls `Barrier` so the audit skips them [added].
- The collision overlay is the visual form of the P5 probes. Live, those probes found Hull and Box
  filling a 10 by 10 union doorway.

<!-- test: L15 -->

```lua
-- Edit. Capture between the two calls with E.capture_set; WorldCheck.clear() afterwards.
local views = WorldCheck.debugViews(true)
local blockers, barriers = WorldCheck.invisibleColliders(workspace)
WorldCheck.mark(blockers)
local names = {}
for _, p in blockers do
	table.insert(names, p:GetFullName())
end
return { views = views, blockers = names, taggedBarriers = barriers }
```

## 3. Asset memory and batching

**From the sources:**

- Texture memory is pixel count, not file size: 1024 by 1024 costs four times 512 by 512 (Improve
  performance doc).
- Most images need at most 512 by 512 unless they fill much of the screen. Minor images should be
  under 256 (same doc).
- Export a PBR set's maps at one size. Roblox packs them and upscales smaller maps to the largest,
  so mixed sizes save nothing (Roblox Learn, OCUZKJJR-TE [00:04:59]).
- Built-in materials use no texture memory of your own (same video [00:02:46]).
- Per-view budget on 2 GB phones: about 500 draw calls and 500,000 triangles, client memory under
  1.3 GB (McNeill, cWDNVvOh4o0 [00:36:05]). Budgets and device runs belong to
  scenario-roblox-performance.

**Steps:**

1. **Before upload,** run `E.texture_check([folder], large=(...))` on the texture files from
   scenario-textures. It reads pixel sizes, groups maps into sets by suffix (`_color`, `_normal`,
   `_roughness`, `_metalness` and kin) and flags:
   - `over-max` (info): above 512, unless the file is in `large`;
   - `pbr-sizes-differ` (warn): one set with maps of mixed sizes.
2. **In Studio, group meshes by mesh and material** with `PerfAudit.assets(game)` from
   scenario-roblox-performance. Read:
   - `drawGroups`: `meshGroups`, `singletonGroups`, `meshesWithSeveralLooks`, `partGroups`,
     `unions`, `decalsTextures`;
   - `images`: distinct ids, and the objects that hold the most images.
3. **In a playtest,** read client `GraphicsTexture` memory with the lead's `Stats.snapshot` (live,
   P11: 47 MB on the test village).

**GATE:**

- No `pbr-sizes-differ`. Every `over-max` file is named in `large` with a reason.
- Scattered and repeated props add about one mesh group per variant and look (tier A).
- `singletonGroups` stays under half of `meshGroups`; `PerfAudit` warns above that from 20 groups.
- No transparency, decals or adornments added for looks alone (tiers D and F).

```python
# Offline, before upload.
import rbx_environment as E
r = E.texture_check(["textures/village"], large=("Cliff_albedo.png",))  # a cliff face that fills the screen
print(r["tally"], [f["rule"] + " " + f["file"] for f in r["findings"]])
```

- O9 on 2026-10-19: pass. Seven synthetic maps made four sets:
  - two 1024 Bark maps flagged `over-max`;
  - the Moss set (512, 512, 256) flagged `pbr-sizes-differ`;
  - the 1024 Cliff map listed in `large` passed.
