# Expert notes: principles and judgment by source

Load when a decision is not covered by SKILL.md. Timestamps point into the notes in
`notes/lighting/`, `notes/rendering/`, `notes/post-process/`. `[added]` marks this skill's own
inference. Versions matter: Faucher's night and path tracer videos are UE 4.27, Lumen Explained is
UE5 Early Access, Argyriou and Campbell shipped on 5.3; every 5.8 correction is from
`sources/unreal-version-deltas.md` or the 5.8 docs.

## Sean Gobey (Gameloft), physically based lighting and exposure (Unreal Fest 2024, UE 5.3/5.4)

- Unreal is "childproofed": auto exposure (histogram -10 to 20 EV100, Exposure Compensation 1)
  rescues any light value, so a 10 lux and a 100,000 lux sun look almost the same [00:02:38]
  [00:03:12]. Remove it first: Exposure Compensation 0, Min/Max EV100 clamped to the condition (noon
  10/14) [00:11:40] [00:12:14].
- Order: camera sensor, lights, tone mapper, grade [00:01:12]. "We're not simulating our eye, we're
  simulating a camera" [00:03:47].
- Min = Max EV100 fixes the camera (overcast demo 7/7) [00:22:33]; keep a narrow range only where
  the player walks between conditions.
- Read the HDR (Eye Adaptation) view as a meter: blue target vs the clamps; center illuminance in
  lux on a forced white surface, luminance in nits and EV100 [00:03:12] [00:12:47].
- A white surface reflects exactly the sun's lux: albedo is lighting; wrong base colors are why
  shadows look "incredibly dark" [00:06:35] [00:07:30].
- A dark interior under a correct exterior is a tone-mapper problem first: Toe 0.55 to 0.3, Local
  Exposure Shadow Contrast 0.8 to 0.6, no fill lights [00:14:58] [00:15:32] [00:27:31].
- Directional in lux, local lights in lumens [00:05:56]; the chart (slide [00:12:02]): sun 100,000 /
  cloudy 20,000 / low sun 5,000 / moon 0.5 / cloudy night 0.001 lux; EV100 sunlit 14, cloudy 10, low
  sun 7, interior 4, moonlit 1, moonless -2; candle 12, decorative 300, interior 1,000, exterior
  10,000 lm; candle 1,900 K to blue sky 15,000 K. Treat the EVs as look targets, not meter readings
  [added: `ev100_for_illuminance` puts noon at about 15].
- Viewport exposure must be on Game Settings or the PPV is bypassed [00:21:56].
- Q&A (speakers who appear to be Epic staff): do not light busy emissive scenes (a nightclub, a
  Tokyo street) with emissive; place tube lights [00:37:33]. Lumen PPV quality sliders are
  near-exponential; about 4 removes crawling, fine for film, expensive for games [00:39:12]
  [00:40:18].
- Direction slip to check on screen: he raised White Temp to 7,500 K "to make it cooler" [00:17:31];
  the 5.8 doc says a Temp above the scene light warms in White Balance mode.

## William Faucher (VFX and cinematic lighter, educator)

**Lighting Interiors (0GYyHDuaPcg, UE 5.3, HWRT, path tracer)**

- Lumen lacks samples for light entering through a small opening: raising sky light (20 to 1,000) or
  exposure gives splotches [00:04:41]; a rect light sized to the opening (360 x 403 cm, barn doors
  88 degrees, 20 cm, cool color) gets "60% of the way" [00:06:18] [00:07:22].
- The path tracer is ground truth: big differences mean setup problems; it showed the shadows should
  not be black [00:07:43] [00:08:06] (preview 200 spp).
- Shadow lift from honest to dishonest: direct light, then one light's Indirect Lighting Intensity
  (5 in his demo, not physical, absent from the path tracer), then Diffuse Color Boost 2, exposure
  last [00:08:14] [00:08:48] [00:13:42].
- Large soft sources need ray-traced shadows on that light; VSM stays hard [00:09:22]. In 5.8,
  MegaLights ray-traces local lights by default; VSM softness comes from SMRT and source size
  (deltas file).
- Keep a direct light on anything that must look wet or glossy: hiding the rect light took the
  pillar's wet highlights away, because Lumen indirect gives little specular (his understanding)
  [00:10:28]. Leaks along wall edges: blocker cubes around the shell [00:11:13]. Every artificial
  light needs a visible fixture; shape the light like it (Source Length on a tube) [00:15:14]
  [00:15:47]; `light_lint` checks both halves. Volumetric Scattering Intensity is the per-light
  shaft dial: 10 on the sun through a doorway, 50 to 100 extreme [00:12:51].

**Lumen Explained (1e6oOiKh91U, UE5 EA)**

- The Lumen Scene view is diagnostic number one; black = screen traces only, GI then looks
  screen-space [00:07:21] [00:07:55]. Split rooms into walls, floors, ceilings (a single-mesh room
  does not work, also in the 5.8 doc) [00:06:09] [00:06:42]. A black mesh can be a material problem
  (a transmission master) [00:14:40].
- Emissive large and dim plus a real light; small bright emissive is noisy and screen-space
  [00:12:30] [00:13:04]. Albedo never 1.0; snow 0.8 to 0.9 [00:13:35]. WPO breaks software Lumen
  [00:08:17]. MRQ warm-up 250 to 500 frames, "probably overkill" [00:09:56].
- Outdated for 5.8: no landscape, no translucency, detail tracing default, Reflection Quality 4 as
  the RT switch, Proxy Triangle Percent (now Fallback Relative Error).

**Night exterior (1LfiYtKDsac, UE 4.27)**

- Real moonlight (0.25 to 1 lux, about 4,000 K) is too dark for film; films use a brighter, cooler,
  directional source [00:01:37] [00:02:10]. The moon is a rim: silhouette first [00:09:23].
- Volumetric-only fog: Support Sky Atmosphere Affecting Height Fog, both inscattering colors black,
  volumetric fog on, directional scattering 3 [00:10:40] [00:11:12] [00:13:23]. God rays are
  composed with blockers [00:13:55] [00:15:00]; Scattering Distribution near 0 for side views, near
  0.9 looking into the light [00:16:06].
- Dim skylight 0.5 as the night shadow lift, Lower Hemisphere Is Solid Color off [00:17:35]; moon
  blue subtle (HSV 214, 0.34, 1.0) [00:18:17]; warm practicals against cool fog [00:19:33]; tight
  dim fills (0.2 to 2.5, 300 to 500 cm radius) and rims isolated with lighting channels: light
  Channel 0 off and 1 on, hero mesh Channel 1 on [00:21:24] [00:24:02]. 5.8: direct light and
  MegaLights honor channels; Lumen GI bounce probably does not [verify], so the cheat's Indirect
  Lighting Intensity goes to 0 [added]; the path tracer's behavior with channels is not in the notes
  [verify]. "It's all faked anyway" for a shot, not for a game [00:26:13] [00:25:40].

**Demystifying the Skylight (BGoaPyfZlYg, 4.26)**: chrome ball before any light [00:01:34]; hiding a
skylight in the Outliner does not stop it, Affects World does [00:04:46]; Sky Distance Threshold 1
captures the surroundings, Real Time Capture ignores it [00:05:19] [00:09:04]. Under Lumen, prefer
real-time capture; the low threshold risks double lighting [added, verify].

**Volumetric clouds (yolGEIrhu0s, 4.26)**: place clouds with BP_CloudMask_Object and
BP_CloudMask_Generator (still in the 5.8 doc); scale about 25, noise 1; Render Clouds refreshes
[00:04:15] [00:14:05].

**Path Tracer Explained (X5zVhc5ahl0, 4.27)**: low samples plus denoiser hides detail loss at web
resolution; judge at 100 percent [00:05:26] [00:06:39]; MRQ ignores the PPV sample count [00:23:06];
glass needs bounces (10) [00:16:47] and the solid recipe (IOR 1.5, Translucent, Surface
ForwardShading; frosted = more roughness) [00:14:36]; Thin Translucent for wrap and bubbles, not
colored glass (reads as plastic) [00:15:43]; albedo at most 0.8, "a double whammy": realism and
render time [00:22:24]; for finals, denoiser off and enough samples, denoise in comp [00:25:09].
Superseded: 16 x 16 sample mix, HDRI Backdrop, the non-temporal denoiser (NFOR since 5.5).

**2025 Guide to Rendering (fVg5ihB8Wdc, MRQ)**: no cvars unless you know why [00:03:00]; temporal
for motion blur, spatial for crisp frames, never both [00:04:58]; odd counts [00:06:01]; Motion Blur
Amount 0 for stills [00:06:46]; samples never fix noise [00:09:15]; AA None with 9 to 15 samples, 15
to 31 covers "95 or 98%" [00:10:58]; ghosting on particles: render at double frame rate with Motion
Blur Amount 1.0 [00:07:59].

## Alexis Argyriou (The Bureau Consulting), scaling lighting for performance (Unreal Fest 2025, UE 5.3)

- Targets first; baseline with fixed cameras and Insights, including a no-lights pass [00:06:09]
  [00:08:36]; fix the worst spot first [00:09:42].
- Physical values removed about 80 percent of Lumen flicker and made emissive controllable (1 flat,
  2 glows, 3 three times brighter) [00:14:41] [00:15:14]; street lamps 2,500 lm small to 10,000 big
  [00:13:36].
- About 1,000 wrongly Movable meshes cost 20 percent [00:11:54]; shadowed Niagara lights are hidden
  costs [00:12:28]; WPO off, decals instead of translucent geometry [00:16:19].
- Spotlights, fixtures thinking [00:19:37]; shadows only where they "dance on walls" [00:20:45]; one
  shadowed dynamic light per room (Rainbow Six Siege) [00:21:51]; smallest attenuation radius beats
  every other setting [00:26:32]; max draw distance on every light, shadows off on vista lights
  [00:22:23]; Static lights are ignored by Lumen [00:24:56].
- Indirect Lighting Intensity far above 1 spreads GI without overlap [00:26:00], but blows up
  volumetric fog [00:26:32]; Epic's Lumen doc: it makes GI view-dependent. Decider: small enclosed
  arenas tolerate it; open views and cinematics expose it.
- PvP parity: bright spots bright on every tier, no black hiding places [00:30:14]. In 5.8,
  MegaLights and Lumen Lite replace much of his baked low tier.

## Paul Oakley (Epic, Fortnite lighting art director), art and tech (Unreal Fest 2025)

- Light it before you grade it; keep post to exposure and histogram; grading an unbalanced base
  breaks the atmosphere and sun relationship [00:10:18] [00:18:44].
- The ambient is the hardest part: shape, form and color transitions in shadow [00:07:34]; depth
  from shadow value shifts [00:07:08]; limited hue range with the focal object across the wheel
  [00:09:19]; "the promise of more" [00:08:44].
- Readability hacks that ship: sun never below 15 degrees, one directional for sun and moon,
  skylight color from the dome desaturated 5 to 10 percent [00:19:16] [00:20:52]; per-platform looks
  as data (Day Sequence Collections with bias and platform tags) [00:22:46]; capsule or sphere
  modifier volumes, not boxes [00:29:20].

## Krzysztof Narkowicz and Tiago Costa (Epic), MegaLights (SIGGRAPH 2025)

- Constant cost, variable quality [00:48:40]; 80 percent of a pixel's energy usually comes from one
  light [00:03:16].
- Hidden lights take up to 20 percent of samples (50 after failed reprojection) [00:10:37]; the
  directional up to 50 percent [00:16:40]; area lights waste rays on occluded parts: fit Source
  Width and Height [00:17:36].
- Proxy mismatch shadows on tessellated walls, displaced floors, cloth, alpha foliage [00:26:09];
  culling rays does not fix it and costs 10 percent [00:27:01]; VSM per light is the sparing escape
  hatch [00:30:48].
- Hidden emissive meshes as area lights: GI cannot converge [00:04:06]. PS5 demo: 900+ lights at
  1080p, about 5.5 ms total [00:39:13].
- 5.8 changes: Production Ready, lighting channels, cloud shadows, IES for volumetrics, light finder
  and ray visualizer, early culling by power (`r.MegaLights.LightAttenuationFalloff 0` disables),
  samples per pixel 1/2/4.

## Matthew Campbell (Obsidian), Avowed GPU retrospective (Unreal Fest 2025, UE 5.3.2)

- Emissive boost only in the Lumen scene through a ray tracing material switch (visible about 1,
  Lumen 5 to 10) [00:14:09]; the path tracer ignores Ray Tracing Quality Switch, so the boost is
  absent there [added from the path tracer doc].
- VSM for the directional, ray-traced local shadows, contact shadows for small ground detail
  [00:23:17]. Why local lights leave VSM: every dynamic object moving through a local light
  invalidates its pages; the static/dynamic cache split fixes it but doubles VSM memory; ray tracing
  pays only for visible pixels, gives free penumbras and was already paid for by HW Lumen [00:26:25]
  [00:26:57]; the more characters inside local lights, the more RT wins [00:31:42]. Removing an
  object from the RT scene gives cheap partial shadowing [00:27:30]. Contact shadows are cheap
  [00:37:32]; start on HWRT Lumen, downgrading is easy [00:37:01].
- Surface cache waste from huge meshes barely touching the play space (a fifth of the cache)
  [00:17:18]; Single Layer Water is a perfect mirror by default [00:20:24].
- Profiling hygiene: dynamic resolution off, async off per pass, fixed hardware, old captures kept
  (FSR 3 cost 1 ms) [00:38:37] [00:39:10] [00:40:13]; Lumen cvars can waste memory or emit NaNs
  [00:18:53].

## Shaun Comly (Epic), render layers with MRG (8o2yaZzfHCA, UE 5.4) and Demystifying MRQ (article)

- Only chains with a Render Layer node render; right to left, last declaration wins; unique names
  [00:04:00] [00:07:33] [00:16:01]. Expose variables, one graph for many shots, subgraphs for
  one-offs [00:26:58] [00:30:14].
- Holdout keeps shadows, GI, reflections; hidden actors need Affect Indirect While Hidden and Lumen
  screen traces off [00:19:38] [00:21:56].
- Article: samples buy motion blur and anti-aliasing only; fix noise at the light or the PPV; odd
  counts; never mix on the deferred path; warm-up internals (engine vs render warm-up, the 0 to 1 to
  0 jump, camera-cut pre-roll); Game Overrides act invisibly in legacy configs (in MRG only while
  connected).

## Epic docs (5.8), what an agent keeps

- **Lumen**: High = 60 fps console, Epic = 30, Medium = Lumen Lite (5.8 Beta), Low = off; about 4 ms
  and 8 ms at 1080p internal; walls 10 cm or thicker; 12 cards per mesh; foliage in the surface
  cache only if Nanite; HWRT under 100,000 instances;
  `r.Lumen.Reflections.MaxRoughnessToTraceForFoliage 0`; hit lighting for cinematics; Emissive Light
  Source flag for small emissives.
- **MegaLights**: enable in Project Settings > Rendering > Direct Lighting (prompts for HWRT); Allow
  MegaLights and Shadow Method per light; directional excluded by default (keep the sun on
  deferred + VSM); front-layer translucency can double cost; alpha masks off in RT by default; Light
  Complexity view and dump.
- **VSM**: designed for Nanite; cost is invalidation; stats with `r.ShaderPrintEnable 1`; Source
  Radius or Angle before SMRT counts; Apple Silicon M2 or newer.
- **Sky and fog**: sun 120,000 lux at zenith, moon 0.26 lux; Mie is already a height fog; shadowed
  local lights cost about 3x in volumetric fog; fast lights trail; cinematic cvars for clouds and
  atmosphere.
- **Exposure and color**: EV100 = log2(N^2 / t x 100 / ISO); Exposure = 1 / 2^(EV100 + comp); B =
  Exposure x L; Min = Max disables auto exposure; Local Exposure always with Lumen GI; Film
  project-wide; no Gain for exposure; LUTs only as a quick look; 5.8: ACES 2.0 SDR path, OCIO 2.5.1,
  `r.EyeAdaptation.CachedLightingPreExposure` default 4 with an on-screen out-of-range warning.
- **Path tracer**: PPV samples ignored by MRG; stills all spatial, animation all temporal with
  Reference Motion Blur; NNE default denoiser, NFOR for sequences; HDRIBackdrop incompatible
  (replace with a Sky Light specified cubemap plus `r.PathTracing.VisibleLights 2`); Reference
  Atmosphere ignores any Sky Light, so that cvar does nothing there; an emissive fixture with its
  own light double counts: A/B `r.PathTracing.EnableEmissive 0`, turn off Indirect Emissive in
  Lighting Components; Ray Tracing Quality Switch ignored (Normal input), PathTracingQualitySwitch
  instead; glass recipe with IOR refraction (other methods fall back to transparency, no bounce, no
  roughness); albedo under 0.8; Max Path Intensity default and exposure-relative; height fog only
  with Volumetric Fog on the component; Mac support in 5.8 (macOS 26.4+).
- **MRG**: Production Ready in 5.8, Basic queue config by default, Light Modifier, layer warm-ups,
  DWAA/DWAB EXR, Quick Render; High Resolution tiling drops TAA and screen-space effects; Use
  LODZero can hit the foliage triangle cap and render no foliage; when a render differs from the
  viewport, disconnect Global Game Overrides first (it acts only while connected in MRG, invisibly
  in legacy configs).

## Disagreements and the deciding condition

| Topic                                | Position A                                                                                  | Position B                                                             | Decide by                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Physical vs art-directed values      | Gobey: real lux, lumens, EV                                                                 | Faucher: tuned by eye, graded after                                    | a game or shared pipeline (physical) vs one graded shot (art-directed, checked against the path tracer); U3-type briefs: physical base, cheats only for the still |
| Where to lift shadows                | camera side: toe, local exposure (Gobey)                                                    | light side: indirect intensity, Diffuse Color Boost (Faucher)          | path-tracer parity and camera freedom (camera side) vs a fixed art-directed view                                                                                  |
| Physical vs film moon                | 0.26 lux, local exposure for readability                                                    | brighter, cooler, directional (Faucher; readability: Argyriou, Oakley) | simulation vs storytelling or PvP readability                                                                                                                     |
| Sun elevation                        | physical time of day                                                                        | locked at 15 degrees or more (Oakley)                                  | stylized tactical readability vs realism                                                                                                                          |
| Indirect Lighting Intensity above 1  | free fill (Argyriou)                                                                        | view-dependent GI (Lumen doc)                                          | enclosed arenas with bounce surfaces on screen vs open views and cinematics                                                                                       |
| HWRT vs SWRT Lumen                   | HWRT default on consoles, required for mirror reflections, hit lighting, MegaLights sharing | SWRT global tracing for heavy overlap (kitbash)                        | overlap density, reflections needed, MegaLights, platform (Mac HWRT Experimental on M2+)                                                                          |
| Path tracer denoiser                 | off for finals, denoise in comp (Faucher)                                                   | NNE default, NFOR for animation (5.8 doc)                              | comp pipeline with render time vs direct delivery                                                                                                                 |
| AA at high sample counts             | None with 9 to 15 samples (Faucher)                                                         | keep TSR unless a visual reason (Comly)                                | thin bright geometry (neon, power lines) and more than about 8 samples favor None                                                                                 |
| Local-light shadows                  | ray-traced (MegaLights, Avowed)                                                             | VSM for hero lights                                                    | many moving objects and soft sources (RT) vs dense alpha foliage, animated instancing, the sun (VSM)                                                              |
| Emissive as light                    | Avowed: Lumen-only emissive boost                                                           | Epic and Faucher: real lights                                          | real-time with Lumen (the boost can replace fill) vs path-traced stills (real lights; the boost is invisible there)                                               |
| Contact shadows                      | Avowed: cheap, for small ground objects and dialogue close-ups [00:37:32]                   | VSM doc: not needed for sharp contact, less accurate than VSM          | VSM on Nanite content (skip them) vs grass that only takes contact shadows, or RT local lights missing small detail (add them)                                    |
| Indirect Emissive in the path tracer | keep: emissives without a light keep their bounce                                           | off: fixtures with a real light stop double counting (path tracer doc) | whether every visible emissive has a real light at it (`emissive_fixture_pairs`); it is one global switch                                                         |
