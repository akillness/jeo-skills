# Critique rubric: judge your own world before calling it done

Use after every stage, on numbers first (the envelope and the audits), then on the two contact
sheets (fog off for layout, fog on for look) opened and looked at. Score each line pass, warn or
fail; a fail blocks the next stage. Sources in brackets; [added] = this skill's rule.

## 1. Structure (before content)

| Check                         | Pass                                                                                                                       | How                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| resolutions fixed at creation | `order` starts with `heightmapResolution`, then `size`; heightmap 2^n+1; 1025+ with erosion                                | BuildIsland result, AuditTerrain [6.3 Terrain manual]                                           |
| detail patch                  | 16, or a written reason (sparse grass, long Detail Distance)                                                               | `world.detail_patch` finding [6.3 manual]                                                       |
| metrics from the character    | door >= 2r + 0.4 m and >= h + 0.4 m; story and grid written down                                                           | BuildVillage `doors` [e-book Metrics; added numbers]                                            |
| kit grid                      | every architecture piece on the 2.5 m grid, Y = 3 n, yaw multiple of 90                                                    | AuditKit [0o-QnNs-stc 00:07:35]                                                                 |
| determinism                   | same seed, same `height_hash`; generation steps can be re-run from clean; the generated scene flagged `skip-worktree`      | EditMode `SameSeedSameIsland...`; rerun BuildIsland; `mark_generated` [Alba 00:10:56, 00:09:52] |
| gym current                   | `gym_is_stale(P, metrics)` False for today's controller and camera rig                                                     | `build_gym` [e-book gym/zoo]                                                                    |
| doors from the camera too     | door passes the NavMesh lane AND its camera clip fraction is written down (interiors get their own camera when it is high) | gym table [e-book: "doorways for camera height and side clearance"; numbers observed]           |
| slopes and steps              | walkable slopes stay at least 5 degrees under the limit (45 failed at limit 45); steps under the step offset               | gym ramp and step lanes [observed]                                                              |

## 2. Terrain look (capture B_Beach, C_Road, F_Forest, G_Hilltop, Z_TopDown)

- Material logic follows nature: sand only in the beach band, rock on steep faces and bare tops,
  dirt on the road and paths, grass elsewhere [smnLYvF40s4 00:06:32]. Fail: one layer everywhere
  (splat lost, check `world.splat_lost`).
- No staircasing on slopes under a low sun; no spikes or pits after erosion (deep pits counted, not
  exploding) [eaXk97ujbPQ 00:02:12].
- Tiling repetition not obvious from altitude; tile sizes match material scale [smnLYvF40s4 frame
  00:05:30].
- Road: grade <= 10% [added], cut depth small (A* route: 2.6 m here vs 9.1 m with straight knots),
  no canyon walls, texture not stretched (distance U) [Alba 00:07:45; ZiHH_BvjoGk 00:14:16].
- Trees: silhouettes vary (height and width scale), density near 6 to 8 per 1,000 m² in forest
  [smnLYvF40s4 00:07:36 ?], clusters not spray, none on the road, beach or clearings. Tall trees (20
  to 30 m) carry detail only on the lower branches the player reaches; the rest is judged as a
  distant silhouette [Firewatch 00:19:18].
- Popping: `capture_pops` pairs at the detail distance, the tree LOD switch and the tree cull, fog
  off and on; the changed fraction is recorded and the pair looked at. Fog only hides a pop where
  its visibility is low at that distance (0.0015 leaves 98.6 % at 80 m) [6.3 Terrain manual, Needs a
  render; observed].
- Light probe ringing on trees (light on the dark side) after a bake: Remove Light Probe Ringing
  trades contrast for no leak [6.3 Terrain Settings reference; not run here].
- Top-down orthographic captures cull LOD trees (screen height under the cull): judge forest layout
  from the aerial bookmark [observed].
- Grass breaks up trunks and hill shapes without carpeting everything; no grass through building
  floors [smnLYvF40s4 00:09:36]. Current placeholder tufts read spiky and uniform at eye level:
  replace with authored grass meshes before art review [observed 2026-09-24].

## 3. Blockout and kit (captures D_Plaza, E_KitTown; audits)

- Every building reachable: NavMesh `PathComplete` from the plaza into each interior [YsBniZ5ya7k
  00:15:24].
- Color legend readable (walls, floors, doors, roofs, landmark) [YsBniZ5ya7k 00:08:07]; names carry
  purpose and size [e-book].
- UV2 on every ProBuilder piece; quick bake shows no black or spotty faces (when lighting is in
  scope) [ProBuilder Troubleshooting].
- Kit: doors and windows by replacement, not hand placement; variants for material variety; clutter
  touches the surface (hover 0), no overlaps, rooms keep hiding spots and quick exits [0o-QnNs-stc
  00:18:20].
- Nothing floats, nothing clips into the terrain (origin Y = highest ground under the footprint)
  [added].
- Placement integrity: no two pieces on one slot, every perimeter cell of every story walled
  (`world.kit_stacked`, `world.kit_missing_wall`); a clean grid audit alone missed 30 misplaced
  walls [observed].
- NavMesh gate: door leaves ignored by the bake (NavMeshModifier), every ground floor >= 90 %
  reachable on a 0.5 m sample grid (clutter inflated by the agent radius split two rooms to 25 % and
  46 %), roofs Not Walkable, upper floors reached by stairs or links, one surface per area
  [0o-QnNs-stc 00:17:12, 00:18:53, 00:19:27; observed].
- Detail budget as language: generic rocks and trees shape-only, narrative props detailed; modular
  rocks read from 360 degrees; no fourth rock if three suffice (`scene_report` dressing variety)
  [Firewatch 00:22:10, 00:24:27, 00:25:50].

## 4. Guidance and composition

- Every anchor sees a landmark or stands on the main path; the spawn sees one and faces it (dot >=
  0.7) [A Short Hike 00:18:37; e-book Spawn points]. When blocked, the job reports the extra height
  needed: raise it, move it to high ground, or open the view corridor.
- The world's edge holds content: `audit_guidance` longest empty coast arc under the limit (300 m
  default [added]), every POI walks back to the spawn, water-only pockets explained; players go to
  the edge first [A Short Hike 00:16:54, 00:17:58].
- Guidance ladder beyond one landmark: breadcrumbs on detours, paths that lead back, inclines toward
  the goal, natural gates, signs last; false peaks (prominence >= 8 m) each have a reason or a view
  to the goal [A Short Hike 00:18:37, 00:19:10, 00:19:47].
- The layout funnels toward the goal with natural shapes [Firewatch 00:18:10].
- Detail budget reads as language: generic terrain and rocks simple, story props detailed [Firewatch
  00:25:50].

## 5. Atmosphere

- Fog on: far views wash toward the horizon color, the sea horizon band disappears; eye-level views
  change little (saturation delta under 0.05) [observed: aerial saturation 0.46 → 0.18, plaza 0.434
  → 0.430].
- Fog color equals the sky's ground color; visibility at 500 m and 1 km recorded (0.57, 0.105 at
  density 0.0015).
- Layered graphic depth (Firewatch) needs the gradient-strip fullscreen pass: hand to
  scenario-unity-shaders; single-color RenderSettings fog is the baseline only [ZYnS3kKTcGg
  00:12:40].

## 6. Streaming

- PlayMode 3/3: two chunks load by path with timings, core stays active, Instantiate lands in the
  core, unload + `UnloadUnusedAssets` returns meshes to baseline; held activation stalls the queue
  (so it appears only in a loading-screen flow); WorldStreamer loads and unloads by distance and
  sweeps [6.3 Scripting API; observed].
- No light in chunk scenes; unique scene names in the build list; chunk centers and radii recorded;
  hysteresis (unload > load radius).
- Stream at all? `scene_report` world memory against the lowest device budget first; this island (11
  MB estimated) stays resident [Alba 00:12:43].
- Double-load guard: the streamer scans open scenes in `Start` (PlayMode test: 1 copy with it, 2
  without) [zObWVOv1GlE 00:11:21].
- A visible chunk has a proxy: `build_proxies`, and far captures of the core with proxies match the
  full island better than without [videos digest checklist: pop-in].
- Player verdict: `stream_probe` Integrate marker within the priority budget (Low 2 ms per frame;
  observed 1.13 ms), the marker actually sampled (a silent recorder is "no-marker-data", not a
  pass), hitches counted, memory back near baseline after the sweep (observed +1.2 %), Memory
  Profiler snapshots compared; Editor counters read 0 and the priority does nothing there [6.3
  Scripting API; doc-multi-scene-streaming checklist].
- Lighting across scenes: one APV Baking Set holding the core and every chunk, baked with all
  loaded; occlusion baked with all scenes open (scenario-unity-rendering-lighting) [docs digest P2
  step 3; deltas section 5].

## 7. Performance

- Tour: every anchor's p95 under the budget, worst heading reported; batches and triangles per
  anchor compared before and after a change [Alba 00:29:46].
- Distance levers: LOD Group for LOD trees (not `treeDistance`); detail distance; fog to hide the
  cut [observed]. Every performance change gets a capture: cull 0.08 cut batches 61% and made the
  hills bald (fail on look), 0.045 kept forests with 36% fewer max batches (pass).
- Mobile: no alpha-tested foliage (`AuditTerrain mobile=True` 0 errors), budget 30 fps x 0.65;
  verdict from a device build, not the Editor [Alba 00:20:14].
- Editor CPU ms move with other processes on the machine (hilltop p95 13.7 vs 19.4 ms on two runs):
  judge by counts (batches, triangles) in the Editor, by ms on the device.
- Before and after: `compare_runs` over about 200 frames per side, a change counted only when p <
  0.01 and the median moved; per-system cost by toggling the system (trees and foliage off) and
  diffing, never read from `FrameTimingManager` (whole frame) [Alba 00:17:00; added].

## Verdict format

List each section with pass, warn or fail and the number or frame behind it; then Verified (what
ran, job ids, sheets opened) and Assumed (device numbers, bake results, anything not run).
