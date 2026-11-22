# Expert notes (scenario-godot-rendering-lighting 0.1)

How to read this file:

- Each entry gives the judgment and its source as video ID plus mm:ss or hh:mm:ss, or a doc page.
  Credentials are in sources.md.
- "Frames" means the value was read on screen from the contact sheets of the video. Any other number
  comes from the transcript.
- [added] marks this skill's own additions. "Observed" means measured in Godot 4.7.2 on 2026-10-02
  (procedures.md).

## Brackeys (aRdiiWpA0AA, Godot 4.4.1)

- **Lookdev aids**: judge light without materials. Use Display > Lighting and Unshaded, plus guide
  spheres: dark, white and mirror (7:19, 28:53).
- **Emissive surfaces**: emission alone does not light the scene. Glow makes it read as bright, and
  a real light makes it cast (13:56).
- **Glow blend mode**: Brackeys switches it from Soft Light to Screen or Additive (13:23). Not
  verifiable on the frames: his Glow panel stays collapsed ("7 changes").
- **Lightmap quality**, in this order (34:34):
  1. Supersampling (frames: On, factor 2);
  2. Lightmap Texel Size;
  3. Quality: leave it on Medium or High. Turn on Directional when normal maps matter.
- **Hybrid bake** (35:25): keep the sun Dynamic so moving objects keep sun shadows, and bake the
  other lights Static. Bake a soft omni light for a fire, then add an unbaked flickering spot on
  top.
- **Probes**: reflection probes are cheap. Use Interior for rooms with shadows on, and add them with
  lightmaps (23:21). Frames show Gen Probes Subdiv 8 on the village LightmapGI and 4 on the room.
- **Window light** (37:18): a SpotLight3D with a projector texture gives cast silhouettes. Height
  fog plus volumetric fog add night mood.
- **Per-light fog energy**: raise Volumetric Fog Energy on one hero light to feature it (19:52).
- **SDFGI panel** seen on screen at 38:14, all defaults: Use Occlusion on, Bounce Feedback 0.5,
  Cascades 4, Min Cell 0.2, Max Distance 204.8, Y Scale 75%.

## SeasonalAsh (X112OrjzWKQ, Godot 4.6, RTX 4060 laptop)

- **Measured GI costs** (13:07, 17:48): SDFGI roughly halves fps (from 100+ down to 60 to 70),
  VoxelGI runs at 60 to 80 fps, lightmaps are best. His rule is lightmaps "9 out of 10 times" unless
  the world is destructible. Frames show overlays from 85 to 188 fps across the GI modes, but which
  overlay belongs to which mode is unclear on screen.
- **Directional shadow** (3:32 to 5:20):
  - confirmed on frames: Bias 0.05 (4:13), Blur 3.0 (5:13), Blend Splits on, Max Distance 100;
  - said in the transcript but not visible in any frame: atlas 4096 to 8192, soft filter High.
- **Bake scope**: exclude non-playable geometry from the bake (GI mode Disabled) for faster, better
  lightmaps (13:39).
- **Sky**: panorama energy 0.5 and radiance size 512 (frames 5:54, 5:57).
- **Tonemap**: ACES, exposure 1.2, white 1.0 (frames 6:36).
- **SDFGI**: Cascades 8 and Y Scale 50% (frames 10:09) for a large map.
- **VoxelGI**: Subdiv 128 shows visibly blocky GI on his map (10:49). He used 256 to 512 for a 112 m
  volume.
- **Screen-space effects**:
  - SSR: max steps 64 (frames 7:42).
  - SSAO: intensity 2.0 in normal use; the 16.0 on screen was a demo exaggeration (7:47, 7:54).
  - SSIL: radius 5 m (8:10).
  - AA: SMAA (12:33).
- **Volumetric fog**: density 0.015, albedo a warm gray (9:08). For the night pass, he used a blue
  sun at energy 0.4 with fog energy 6.3 and teal practical omni lights.

## Picster (3EMG2jGKkdw, Godot 4.0.3)

- **Blockout first**: block out with primitives and one directional light, design the silhouettes
  and leading lines, and keep the blockout for later lighting retests (2:05, 1:15:35).
- **Color grading**: cool shadows and warm lights through the Adjustments color-correction gradient
  (45:07).
- **Fog and exposure**: volumetric fog darkens the scene, so compensate with exposure and GI inject.
  Keep the camera out of direct sun inside fog (42:29, 44:42).
- **Day cycle**: animate the light's parent, which keeps a free second rotation, together with the
  color, energy, sky energy and fog density (1:01:52 to 1:04:50).
- **Outdoor sun**, frames 54:08: shadow max distance 400, sun energy 10, indirect 0.5, bias 0.008,
  blur 4. The "fog energy 2" in the notes is the light's Volumetric Fog Energy; the Environment's
  emission energy is 1 or 0.74.
- **Unverified**:
  - Volume size 256 and depth 64 come from the transcript only; no Project Settings view of them
    appears on screen.
  - SDFGI Bounce Feedback 0.7 appears at 1:16 [uncertain frame].

## Four Games (CjhLcpfltXs)

- **God rays**: anisotropy of about 0.7, and a smaller Length when the camera is in direct sun.
  Length is shared with the normal fog (0:32 to 2:09).
- **Volume size** (2:44 to 3:52): the Project Setting volume size is the main quality and cost
  lever. 64 is too low, 256 is a good compromise, 512 is best. The filter costs about 10 fps on his
  machine.
- Observed: the cost is real (P9). In the lookdev room, anisotropy 0.7 lifted p95 by only 0.025, and
  no shafts formed because the sun did not pass through the window in view (P10).

## Spannule (1JvPYUl1nfo)

- **Dark indoor bakes**: Godot lightmaps ignore the Environment ambient, so indoor bakes come out
  too dark. His hack (4:00, 5:47):
  - multiply the EXR by about 1.1 and add the ambient color at about 8 percent;
  - light dynamic objects with big, layer-masked realtime lights.
- **Texel size**: he says the default lightmap texel size is 0.1; the docs say 0.2 [doc].
- Observed: `LightmapGI.environment_mode` defaults to Scene (1) in 4.7.2, so the sky does contribute
  to the bake. The baked room was still darker than realtime (p50 0.31 against 0.37), partly because
  realtime sky ambient leaks into the sealed room. The fix depends on the intent: fill lights or
  bounces first, and the EXR hack last [added].

## LegionGames (ENhYj_VDDcg)

- **Horror recipe**:
  - sun off and a darkened procedural sky;
  - ACES with brightness 1.3;
  - volumetric fog density 0.05 with a dark red emission at 0.1;
  - flashlight spot: energy 4, angle 45, attenuation 3, fog energy 0.1 to avoid artifacts (2:08).

## Omogonix (nEiz9h4Ns0I)

- **SDFGI**: Use Occlusion fixes leaks. Bounce feedback above 0.5 can run away, so raise it
  carefully and compensate with Energy (26:30, 28:10).
- **Glow blend**: Soft Light versus Additive depends on the art style. Additive needs low emission
  (30:17).
- **SSR with SDFGI**: with SDFGI active, SSR is optional. Use SSAO for small-object detail and baked
  AO for large static forms (42:56).

## GDQuest (oehdIc8NGXE, 4.0 beta era)

- SDFGI is plug-and-play for large scenes. After enabling it, revisit the tonemap and exposure.
- Observed: the frame was darker right after enabling (P8).

## Wild Ox Studios (k9LQTLWVwmM 4.6.1, QoNuG_tuT78 4.6)

- **4.6 changes**: 4.6 reportedly cleaned up SDFGI and VoxelGI leaking, SSR and bloom, so retest old
  workarounds such as encapsulating boxes (2:23).
- **Anti-aliasing**: 2x MSAA plus SMAA with debanding, which avoids TAA smear (9:25).
- **VoxelGI Interior**: he says not to tick it and to encapsulate instead. Picster, SeasonalAsh and
  Gwizz tick it for sealed rooms. The deciding condition is whether the sky should contribute.

## Gamefromscratch (xmykSGbq7AE)

- Do not use SDFGI and VoxelGI together.
- He prefers SDFGI for huge open worlds and VoxelGI otherwise.
- glTF imported from other engines can carry stray emission: audit it and zero it per surface
  (5:25).
- His claim that 4.3 renamed SDFGI to "dynamic GI" is not in the docs [unverified].

## Acerola (fiyf4XPanf4) and DevPoodle (zSb-InQvMAw)

- **Insertion points**: a CompositorEffect has four (pre-opaque, pre-sky, pre-transparent,
  post-transparent).
- **Buffers**: raw depth and normals need conversion helpers, only color is writable, and the normal
  buffer must be requested (`needs_normal_roughness`) (DevPoodle 6:25, 9:40; Acerola 6:19).
- **Shaders**: GLSL compute, not `.gdshader`. Compilation is manual and resource lifetime is manual
  (free on PREDELETE). Reloads in C# may need an editor restart (Acerola 9:39, 14:58).
- Observed: the effect works on Forward+. On Mobile the color buffer is not a storage image, so the
  docs pattern errors every frame. Compatibility ignores it (P12).

## Lukky (gqe0InyIk4U)

- For single-pass 2D-style post effects with UI above, a CanvasLayer with a ColorRect and a
  `hint_screen_texture` shader works on every renderer.

## Official docs (docs.godotengine.org/en/stable, retrieved 2026-10-02)

- **Renderers**:
  - Forward+ has every feature.
  - Mobile has no SDFGI, VoxelGI, SSR, SSIL or volumetric fog, and allows 8 omni plus 8 spot lights
    per mesh.
  - Compatibility uses OpenGL 3, with a per-object light limit in project settings and SSAO since
    4.6.
- **Lights and shadows**:
  - the default positional atlas has 88 shadow slots across its quadrants;
  - spot shadows fail above 89°;
  - a hidden light is still baked unless its bake mode is Disabled;
  - omni attenuation 2.0 is the physically accurate value; the default is 1.0.
- **Environment**: quality settings live in Project Settings (Advanced). Tonemappers are Linear,
  Reinhard, Filmic, ACES and AgX (AgX since 4.4).
- **SDFGI**: Forward+ only. Use occlusion and keep bounce feedback moderate. Convergence and light
  update frames are project settings.
- **LightmapGI**: needs UV2 (unwrap on import or `add_uv2`). Texel size is set per mesh. Lightmaps
  give no specular reflections, so add ReflectionProbes.
- **Volumetric fog**: volume size and depth are project settings, and FogVolume nodes take
  FogMaterial.

## Observed in 4.7.2 (corrections to notes and to baseline answers)

| Claim                                                 | Observed                                                                                                       | Procedure |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------- |
| SDFGI bounce feedback default 0.0 (doc note)          | 0.5 on a new Environment                                                                                       | P1        |
| frames_to_converge default 25 (doc note)              | index 5 = 30 frames; the setting stores an enum index                                                          | P1, P0    |
| unsupported features fail silently                    | Mobile and Compatibility print one WARNING per feature at load; only the Compositor is silent on Compatibility | P4, P12   |
| Mobile keeps FSR1 (baseline G3)                       | FSR1 is Forward+ only: warning, image identical to bilinear; MetalFX spatial works on Mobile with Metal        | P13       |
| LightmapGI needs one human click (baseline G3)        | the editor job presses Bake Lightmaps; Low bake 3.6 to 15 s, editor run 12 to 20 s                             | P7        |
| VoxelGI.bake works headless                           | needs a RenderingDevice; headless saves empty data                                                             | P6        |
| `lightmap_scale` on meshes                            | property is `gi_lightmap_texel_scale`                                                                          | P1        |
| docs CompositorEffect runs on Mobile                  | color layer lacks the storage bit: 172 errors; guard and skip                                                  | P12       |
| GPU time from `viewport_get_measured_render_time_gpu` | 0 on Metal; use `--rendering-driver vulkan`                                                                    | P9        |
| a new Environment is tonemapped                       | Linear by default                                                                                              | P1        |
| HDR Clamp Exposure removes HDRI sparkles (doc)        | only compresses luminance above about 4096: 100000 became 14988, 50 unchanged                                  | P15       |
| CompositorEffect "Forward+ and Mobile" (doc)          | docs pattern fails on Mobile (no storage bit); treat Mobile as unsupported unless a guarded path is tested     | P12       |
| glow defaults                                         | 4.6 values: Screen, 0.3, levels 0/0.8/0.4/0.1/0; retune pre-4.6 scenes                                         | P15       |
| meshes are excluded from bakes by default             | `gi_mode` defaults to Static: every mesh bakes unless set Disabled                                             | P15       |
