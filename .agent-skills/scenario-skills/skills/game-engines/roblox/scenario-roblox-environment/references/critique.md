# Critique: judging an environment and its light

Use this page after every capture set. Open the contact sheet, answer the questions in order, then
read the numbers. A capture you did not open has not been reviewed.

## How to judge a capture set

Capture the same fixed cameras before and after each change (`E.capture_set`), build one sheet
(`E.sheet`), and open it. This skill's cameras: spawn eye height looking at the first landmark, an
overview from a hill, and a low view across the pond. Add an interior camera when a room matters.

Ask, in this order:

1. **Route.** From the spawn view, can you name where to go? The first landmark is in frame, the
   path reads against the ground, and nothing blocks the way.
2. **Value structure.** Squint or desaturate. Do light ground, mid walls and dark accents separate?
   A flat gray sheet means the light is wrong, not the colors.
3. **Light direction.** From spawn, do you see lit faces or only shadow sides? Shadow sides
   everywhere means the sun is behind the scene.
4. **Color story.** One warm and one cool family, light warm and shadow cool for day (DatBoiEle). No
   surface tinted by an accident such as a blue Ambient on every wall.
5. **Materials.** No plastic sheen on matte surfaces, no near-black terrain, no visible tiling at
   walking distance, no grass through floors.
6. **Depth.** Far hills lighter and hazier than near ones, with silhouettes kept. Fog that erases
   the skyline is a choice, not a default.
7. **Night.** A focal light near spawn, silhouettes against the sky, the route still readable
   (RingWorld).
8. **Interior.** A sun patch where the window is, a soft bounce that shows the walls, no blown-out
   room.
9. **Defects.** Z-fighting, seams, floating props, gaps between terrain and parts, sky banding.

Then read the numbers from `E.look_metrics(path, skip_top=0.45)` on the lower part of the frame, so
the sky does not dominate:

| Metric       | Meaning                    | Bands this skill uses                                                       |
| ------------ | -------------------------- | --------------------------------------------------------------------------- |
| `crushed`    | share of pixels near black | day under 0.05; outdoor night under 0.5; above 0.9 means a black frame      |
| `clipped`    | share of pixels near white | a sun patch inside clips above 0.05; a whole exterior clipping is a blowout |
| `spread`     | p95 minus p05 luma         | wider after a look than in the neutral capture                              |
| `mean_luma`  | average brightness         | compare before and after, not across scenes                                 |
| `warm_cool`  | warm minus cool balance    | positive for warm looks, negative for blue nights                           |
| `saturation` | mean saturation            | near 0 means gray; a jump means color correction went too far               |

The numbers catch black frames, blowouts and no-ops. They do not judge mood: that stays your call
against the mood sentence.

## Findings from this skill's own captures

Each row was seen on a contact sheet during the live runs, then fixed and re-captured.

| Finding                                                 | Where it showed                                      | Cause                                                                                                                                                   | Fix in the kit                                                                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Grass blades through the spawn pad, paths and floors    | first graybox spawn capture                          | terrain Decoration grows on Grass under parts                                                                                                           | `TerrainKit.paintUnder` repaints LeafyGrass under floors and paths (SmartyRBX)                                                                         |
| First view was a hillside                               | first spawn capture                                  | the place template's SpawnLocation faced -Z, away from the village                                                                                      | turn the spawn with `CFrame.lookAt` toward the first landmark (P3)                                                                                     |
| Every wall a flat blue                                  | day look, spawn view                                 | at latitude 41.7 and ClockTime 14 the sun sat behind the village; the camera saw shadow sides tinted by Ambient                                         | `Looks.aimSun` before any color; GeographicLatitude 0 put the sun behind the spawn                                                                     |
| A near-black ring of hills                              | dressed overview after the Basalt override           | the terrain material color (Basalt 30, 30, 37) multiplies the variant's map                                                                             | `Terrain:SetMaterialColor` per overridden material (P6)                                                                                                |
| The foreground and the pond in black shadow at sunset   | sunset spawn and pond views                          | a low sun behind a ring of hills shades the whole basin                                                                                                 | aim the low sun through an open side, or keep the elevation higher (`aimSun` with a direction, `low` in P7)                                            |
| Far views 96 to 100 % black                             | BONES' dark recipe outdoors                          | black Atmosphere with Haze 5 removes the sky behind silhouettes                                                                                         | `night_outdoor`: blue ambients, Haze 1.5, Exposure 0.4; keep the black recipe for corridors                                                            |
| The pond view dark and empty at night                   | outdoor night tries, pond view                       | every light sat in the village; the pond view had nothing for the eye                                                                                   | a light near every viewpoint players reach, near and far (RingWorld); `Looks.nightLights(true)` turns the tagged ones on                               |
| The room black except a white patch                     | window-lit interior                                  | Brightness 44 with black ambients, as BONES sets it                                                                                                     | a fake GI PointLight [234, 255, 254], Range 50, near the window: mean luma 0.22 to 0.61                                                                |
| The view through the windows and the door clipped white | window-lit interior                                  | Brightness 44 lights the exterior as much as the patch                                                                                                  | acceptable for a room seen from inside; where the player must read the route outside, lower Brightness and lift the room with the bounce light instead |
| No sun patch on the floor                               | interior with glass CastShadow on                    | the glass blocks the sun (clipped 0.061 against 0.098 with it off)                                                                                      | glass CastShadow off (DatBoiEle); `EnvAudit` flags `glass-casts-shadow`                                                                                |
| The dressed tower lost its pull                         | dressed overview                                     | a beige concrete tower against beige-gray rock once the pink placeholder went                                                                           | keep a value or hue contrast with the background behind the landmark, seen from spawn                                                                  |
| Bloom had no visible effect                             | Edit captures with Bloom at Intensity 3, Threshold 0 | the change (0.012 mean luma) matched two captures with no change (0.013, wind on the grass); the docs say a low Editor Quality Level hides some effects | judge Bloom in a playtest capture or on a device                                                                                                       |
| Lantern light pools missing                             | playtest captures, night look                        | unexplained: the lights read enabled on the client; graphics quality was Automatic                                                                      | check light pools on a device; do not sign off night lighting from a Studio playtest capture alone                                                     |

## What the G4 and G5 baselines got wrong or left out

The baselines were written without this skill (`tests/baseline/answers_G4-G6.md`).

- **Doors.** G4 planned 4 by 8 doors. The graybox standard is 10 by 10 at least, and the default
  JumpHeight is 7.2.
- **Fidelity on kit walls.** G4 set `CollisionFidelity = Box` on walls. Live, Box filled a 10 by 10
  doorway in a union, so a door wall must be parts or keep Default.
- **Settings scripts refuse.** G4 set streaming radii, integrity and `Terrain.Decoration` from Edit;
  G5 set `Lighting.Technology = Future`. Live, all of these fail from scripts. Only
  `StreamingEnabled` works; the rest go in the place file.
- **Terrain materials.** G4 relied on MaterialVariants "selected in MaterialService" and missed the
  override step, the per-material variants (Grass and LeafyGrass) and the terrain material color.
- **Grass through floors.** Neither baseline checked decoration under parts.
- **Sun direction.** Neither baseline aimed the sun; both set ClockTime alone.
- **Night readability.** G5's horror night (Ambient 10, 12, 16, Brightness 0.4) had no focal light
  rule and checked only mean luminance (0.05 to 0.15). A frame can pass that band with its far half
  black; `crushed` per view catches it.
- **Right in the baselines:** a seeded terrain script, a Lune audit of the saved file, fixed camera
  bookmarks with a montage, and a device check before sign-off.

## Limits of this skill

- **One scene.** Every number comes from one village of 67 parts, a 512 by 512 terrain and one
  machine (Apple Silicon, Studio 0.743). Draw calls and memory will differ on a real map.
- **Edit captures.** Captures come from the Studio viewport at its current Editor Quality Level.
  `settings().Rendering.EditQualityLevel` may raise it from `execute_luau` (PluginSecurity), not yet
  run. Bloom did not show; night light pools did not show in playtest captures.
- **Viewport stalls.** A covered or background Studio window can stop drawing. Captures then come
  back as a dark frame with only the view cube; rerun rather than judge them.
- **Terrain plate capture.** The P13 blockout capture showed only sky in one run. A second capture 3
  s later is in the runner, not yet confirmed.
- **Metric bands.** The `crushed` and `clipped` bands are this skill's own thresholds [added], tuned
  on these captures.
- **Mood.** No metric judges whether a look matches its sentence; the review is by eye.
- **No assets uploaded.** MaterialVariants use Roblox's published 2022 material maps. Scenario
  textures, meshes and skyboxes were not uploaded, so their import is described, not tested.
- **Foliage.** The scatter recipe ([`foliage.md`](foliage.md)) passed offline tests only; no foliage
  was placed or captured in Studio, and SLIM needs a published build to show.
- **Streaming.** Tested with three far models and one playtest client, not on a device. The
  radius-64 traversal test ([`verification.md`](verification.md)) is not yet run (needs Studio); the
  same route at this place's radius 256 is queued (live test L16).
