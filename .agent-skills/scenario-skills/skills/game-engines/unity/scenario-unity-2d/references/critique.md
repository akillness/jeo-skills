# Critique rubric (scenario-unity-2d)

Score every 2D deliverable before calling it done. Each line has a measurable test (job, test or
check) and, where the eye decides, what to look at in the capture. A deliverable passes when every
"must" line passes; "should" lines need a written reason when they fail. Numbers come from the
sources or from this skill's live runs (see `procedures.md`); [added] marks this skill's own
thresholds.

## A. Import and assets

| #   | Must / should | Check                                  | Pass                                                                                                                              |
| --- | ------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| A1  | must          | `SpriteJobs.AuditSprites` (mode pixel) | 0 errors: one PPU for the set, Point, Compression None, Max Size >= largest side                                                  |
| A2  | must          | pivots of pixel sprites                | whole pixels (`pivots_whole_pixels` true); characters at the feet (8, 0 on a 16 px frame)                                         |
| A3  | must          | normal maps                            | referenced as `_NormalMap` secondary texture on the sprite asset, imported Normal map (plain PNG) or Sprite sRGB off (PSD layers) |
| A4  | should        | HD art PPU                             | = target height / (2 x smallest ortho size); sprites above 2x that PPU flagged as wasted memory [added]                           |
| A5  | must          | package manifest                       | no `com.unity.2d.pixel-perfect` in a URP project                                                                                  |

## B. Atlases

| #   | Must / should | Check                                 | Pass                                                                                                                                      |
| --- | ------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | must          | `AtlasJobs.BuildAtlas`/`AuditAtlases` | 1 page per atlas, 0 errors (no compressed sources), no single-sprite atlas                                                                |
| B2  | must          | secondary textures                    | one set per atlas (all `_NormalMap` or none)                                                                                              |
| B3  | must          | grouping (judgment)                   | each atlas = what is on screen or loaded together; state the grouping rule in the report                                                  |
| B4  | should        | usage and waste                       | wasted bytes < 400 KB (Analyzer threshold); report usage %                                                                                |
| B5  | must          | the claim you make                    | atlas benefit stated as used / bound textures and memory; under the SRP Batcher neither Batches nor SetPass change (measured 21/21, 2/2)  |
| B6  | must          | pixel-art atlas pages                 | Compression None (or High Quality after a side-by-side check): compression shifts pixel colors                                            |
| B7  | should        | Analyzer parity                       | `AuditAtlases` findings resolved or justified (same reports as Window > Analysis > Sprite Atlas Analyzer, plus Read/Write off on sources) |

## C. Tilemaps and collision

| #   | Must / should | Check                              | Pass                                                                                                                                                                  |
| --- | ------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | must          | `TilemapJobs.BuildLevel` read-back | `rule_mismatches == 0` (every cell shows the sprite its neighbors call for)                                                                                           |
| C2  | must          | drop test                          | a dynamic probe rests on the surface within 0.05 units; composite body Static                                                                                         |
| C3  | must          | collision type                     | Composite Merge for static levels; per-tile colliders only when tiles change at runtime (say which)                                                                   |
| C4  | should        | rules                              | ordered by frequency; directional art (grass on top) uses Fixed, not Rotated                                                                                          |
| C5  | look          | capture                            | no seams, no default-sprite holes, borders correct on corners, pits and floating platforms                                                                            |
| C6  | must          | reskins                            | a Rule Override Tile (shared rules) or a Rule Tile Template (independent copy), chosen with the reason; override read-back 0 mismatches; never a duplicated Rule Tile |
| C7  | should        | per-tile colliders on shaped tiles | Use Delaunay Mesh on, custom physics outlines set (16 px sprites generate a rectangle); shape count reported                                                          |
| C8  | should        | AutoTile vs Rule Tile              | stated: AutoTile for a standard floor-layout sheet painted by a human; Rule Tile when scripted, directional, or per-rule colliders/outputs are needed                 |

## D. Lights

| #   | Must / should | Check                 | Pass                                                                                                                                                            |
| --- | ------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | must          | `Audit2D.Scene`       | 0 errors: exactly one Global light per blend style per sorting layer, Global intensity > 0                                                                      |
| D2  | must          | normal maps           | Point/Freeform lights over normal-mapped sprites have Normal Maps Fast/Accurate (read back `normalMapQuality`)                                                  |
| D3  | must          | shadows               | shadow-casting lights counted and within the platform budget (2 on mobile [added]); lights added by script start with shadows ON                                |
| D4  | must          | captures              | `CameraJobs.WarmLights2D` ran before a batch capture (else only the Global light shows)                                                                         |
| D5  | look          | capture pair          | normals on vs off (or light moved) changes the lit surfaces; player readable in dark and lit zones; no pitch-black area; fill light not overexposing the player |
| D6  | must          | `LightJobs.LightCost` | replica light batches = URP's count (engine_check); every batch break named and justified (a light that skips a layer redraws the others per batch)             |
| D7  | should        | fill                  | no light over half the view without a reason (`2d.light_large`); light_fill_screens compared before and after a change                                          |
| D8  | must          | tier                  | Normal Map Quality Fast (not Accurate) and 1 to 2 shadow lights on mobile or low tiers; `LightFillBench` or a device capture for the claim                      |

## E. Camera and pixel perfect

| #   | Must / should | Check                                                                         | Pass                                                                                                                                                                                 |
| --- | ------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E1  | must          | `CameraJobs.SetupPixelPerfect`                                                | URP `PixelPerfectCamera`, Assets PPU = sprite PPU, orthographic                                                                                                                      |
| E2  | must          | `ut_2d.pixel_block_check` on 1080p and 720p captures (Upscale Render Texture) | uniform_block_fraction >= 0.999 at scale 6 and 4                                                                                                                                     |
| E3  | must          | Grid Snapping choice                                                          | stated with its reason: Pixel Snapping leaves lights, bloom, particles at screen resolution (measured 71% uniform blocks), Upscale Render Texture pixelates everything               |
| E4  | must          | `ut_2d.void_columns` at 21:9                                                  | 0 art columns of void, or a confiner / wider bounds fixes it                                                                                                                         |
| E5  | should        | Filter Mode                                                                   | Point unless Crop Frame is Stretch Fill and shimmer is worse than softness (Retro AA only acts there)                                                                                |
| E6  | look          | contact sheet                                                                 | uniform square pixels, no smooth diagonals where the style wants upright pixels, bars only where Crop Frame puts them                                                                |
| E7  | must          | motion                                                                        | a sub-pixel pan (`ut_2d.pan_shots`) scored by `shimmer_check`: min rigid >= 0.99 on the shipped setup; Stretch Fill states Point (shimmer) vs Retro AA (blur) with the measured pair |
| E8  | should        | follow camera                                                                 | vertical damping loose rising, tight past a fall-speed threshold, released at 0 (hysteresis, lerped); a drop test shows space below the player                                       |
| E9  | must          | room cameras                                                                  | swap on trigger exit by exit direction; one live camera at start; a turn-back test keeps the old room                                                                                |
| E10 | must          | secrets                                                                       | `ut_2d.bounds_hide_secrets` ok: no confiner rect overlaps a secret room                                                                                                              |

## F. Controller feel (PlayMode tests with simulated input)

| #   | Must / should | Check                        | Pass                                                                                                                                                                                                          |
| --- | ------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | must          | apex height                  | measured = 50 Hz prediction from the stats within 0.12 units (Tarodev defaults: 5.536)                                                                                                                        |
| F2  | must          | coyote                       | max accepted delay within one step below the setting, next step refused (0.14 / 0.16 for 0.15)                                                                                                                |
| F3  | must          | buffer                       | a press one step inside the window before landing jumps on landing (0.18 for 0.2); one step outside is dropped (0.22); the exact boundary (0.20) is a float coin toss with Tarodev's strict `<`, never a gate |
| F4  | must          | latching                     | one press = one jump at 30, 60 and 144 fps with 50 Hz physics                                                                                                                                                 |
| F5  | must          | variable height              | tap apex < half the full apex                                                                                                                                                                                 |
| F6  | should        | apex hang, corner correction | airtime gain measured; head clipping a ceiling corner by 0.1 units passes with the nudge, bonks without                                                                                                       |
| F7  | should        | profile vs reference         | jump height in body heights (Celeste about 3, Mario 4, Meat Boy 6), frames to top speed (Celeste about 6) stated and justified for the level's tile size                                                      |
| F8  | must          | honesty                      | "feels good" is a human verdict: deliver toggles and numbers; never claim feel from tests alone (Nijman, Tarodev)                                                                                             |
| F9  | must          | toggles                      | coyote, buffer, variable jump, fall clamp, apex, corner correction each have a toggle and an on/off test                                                                                                      |
| F10 | must          | variable-height method       | GravityMultiplier, VelocityCut or Sustain chosen with the reason (smooth, precise, long rise); tap/full ratio reported; Sustain retuned (JumpPower)                                                           |
| F11 | must          | air friction                 | AirDeceleration chosen for the level; drift after release reported in body widths (Tarodev 30: 5.7; precision 240: 0.5)                                                                                       |
| F12 | must          | hazards                      | hitbox-to-art ratio below 1 on both axes; a graze test survives, a real overlap hits                                                                                                                          |
| F13 | should        | one-way platforms            | jump up through without a head bonk, land on top, Down + Jump drops through; casts ignore triggers                                                                                                            |

## G. Animation and juice

| #   | Must / should | Check                   | Pass                                                                                                                                     |
| --- | ------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | must          | `AnimJobs.LintAnimator` | 0 errors: sprite-to-sprite transitions exit time off and duration 0, Any State self-transition off, parameter names exist                |
| G2  | must          | parameters              | driven from controller outcome (grounded, velocity), not input; PlayMode: Jump state holds > 1 frame, Idle after landing                 |
| G3  | should        | clip rates              | 4 to 24 samples/s [added range]; 12 for sprite cycles                                                                                    |
| G4  | must          | hit stop                | restores the previous time scale, overlapping requests extend (measured 0.080 s for 0.05 then 0.06 at +0.02), a 0 multiplier disables it |
| G5  | must          | shake                   | a 0 multiplier gives zero offset (accessibility option); kick opposite to the shot; whole art pixels under Pixel Perfect                 |

## H. Report

- Every step names its Unity call (job name and API), then **Verified** (job ids, counts, measured
  numbers, contact sheets looked at) and **Assumed** (anything not run, GUI steps, feel verdicts
  left to a human).
- Performance: `AgentProfile.PlayModeTimings` + `ut_stat.summarize_csv` budget verdict, light
  batches and fill from `LightCost`; Editor numbers labeled as iteration numbers, device numbers
  handed to scenario-unity-performance.
