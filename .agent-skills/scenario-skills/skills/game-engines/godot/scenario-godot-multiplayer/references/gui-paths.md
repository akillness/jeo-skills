# scenario-godot-multiplayer GUI paths (Godot 4.7 editor)

For a computer-use agent or a human. Each line gives the code substitute the headless agent uses.
Paths come from the official docs and the source videos; they were not clicked in this session (the
agent works headless), so check labels on screen.

## Replication (MultiplayerSynchronizer)

- Select the MultiplayerSynchronizer node; the **Replication** panel opens in the bottom dock. **Add
  property to sync**, pick the node and property; per row: **Spawn** checkbox, **Replicate** column
  (Always, On Change, Never) (Hunter, tK2ACXUGcrY; docs).
- Inspector: Root Path, Replication Interval, Delta Interval, Public Visibility, Visibility Update
  Mode.
- Substitute: `net_build.gd` `make_sync()` (`SceneReplicationConfig.add_property`,
  `property_set_spawn`, `property_set_replication_mode`), saved as `.tscn` (procedures P1).

## Spawner (MultiplayerSpawner)

- Inspector: **Auto Spawn List** (add scenes), **Spawn Path** (the parent that receives the nodes),
  **Spawn Limit** (0 = unlimited).
- Substitute: `make_spawner()`; `add_spawnable_scene(path)`.

## Running several instances

- **Debug > Customize Run Instances...**: enable multiple instances, set the count; per row (4.3+)
  **Launch Arguments** and **Feature Tags** (Di Staso, nyKBuM9Y_-Q [00:08:33]). Whether a row tagged
  `dedicated_server` also runs headless, as the exported build does, was not checked here [added].
- Embedded game window (4.4+): for several instances, turn embedding off so each instance gets its
  own window: Game tab > three-dots menu > uncheck "Embed Game on Next Play" (Hunter, tK2ACXUGcrY
  [00:07:16]), or set the game embedding mode to disabled in Editor Settings (AndrooDev, wgIqB6JNcro
  [00:02:14]). A "tile instances" add-on places the windows side by side (tK2ACXUGcrY [00:07:49]).
- Substitute: `gd_net.session()` with one process per role, user args after `--`.

## Debugging

- **Debugger** bottom panel > **Network Profiler** tab: incoming and outgoing bandwidth per node and
  RPC counts (Di Staso, nyKBuM9Y_-Q [00:14:29]; Hunter [01:15:22]).
- Scene dock > **Remote** while running: the live tree of one instance, with a session selector when
  several run; check node names (peer ids) and authority (Hunter [00:52:03]).
- Substitute: `bandwidth` (ENet counters), `authority`, `enter_checks`, `auto_named` in each
  AGENT_RESULT.

## Export

- **Project > Export...**, select the server preset > **Resources** tab > **Export Mode: Export as
  dedicated server**; the resource tree then offers **Strip Visuals**, **Keep**, **Remove** per file
  or folder (docs, Exporting for dedicated servers; BatteryAcidDev, jgJuX04cq7k [00:04:47]).
- **Features** tab: custom features; writing `dedicated_server` there also forces headless (docs).
- Android preset > **Permissions > Internet**: required for any networking on Android (docs).
- Linux server binary: `chmod +x` after copying it to the host (jgJuX04cq7k [00:16:15]).
- Substitute: `gd_net.server_preset()` writes `dedicated_server=true`, `export_filter="customized"`,
  `customized_files={"res://": "strip"}`; `gd_run.export(..., pack=True)` plus
  `gd_net.pack_report()`.

## Project settings worth checking

- `application/run/flush_stdout_on_print` true for servers whose logs go to systemd or journald
  (docs).
- `rendering/textures/vram_compression/import_etc2_astc` true before a macOS export
  (scenario-godot-expert).
- `network/limits/*` and `debug/settings/*` rarely matter for the high-level API; leave defaults
  unless a measurement says otherwise [added].
