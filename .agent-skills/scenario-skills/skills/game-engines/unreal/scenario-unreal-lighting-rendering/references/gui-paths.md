# GUI paths (for a computer-use agent or a human)

The same procedures as `procedures.md`, through menus. UE 5.8 on macOS: the 5.6 viewport toolbar
redesign moved the view mode, exposure and show menus (`ToolMenusViewportToolbars 0` restores the
old toolbars); Ctrl shortcuts in Epic's docs usually map to Cmd on Mac [verify]. Paths come from the
5.8 docs quoted in the notes; wording may differ slightly in the installed editor [verify].

## Project settings (P1)

- Edit > Project Settings > Engine > Rendering:
  - Global Illumination: Dynamic Global Illumination Method = Lumen; Reflection Method = Lumen.
  - Lumen: Use Hardware Ray Tracing when available; Ray Lighting Mode (Surface Cache or Hit Lighting
    for Reflections); Software Ray Tracing Mode (Global Tracing is the 5.7+ default).
  - Hardware Ray Tracing: Support Hardware Ray Tracing (restart); Path Tracing (shader permutations;
    off if never used).
  - Direct Lighting > MegaLights (accept the prompt to enable Support Hardware Ray Tracing).
  - Shadows: Shadow Map Method = Virtual Shadow Maps.
  - Software Ray Tracing: Generate Mesh Distance Fields.
  - Default Settings: Extend default luminance range in Auto Exposure settings (at project start
    only); Alpha Output; Support Primitive Alpha Holdout (Deferred); default light units.
  - Optimizations: Support Compute Skin Cache (path tracer prompt).
  - Fog: Support Sky Atmosphere Affecting Height Fog (restart).
  - Materials: Energy Conservation (off by default).
- Device profiles: Platforms menu > Device Profiles, or edit
  `Config/<Platform>/<Platform>DeviceProfiles.ini` (`+CVars=sg.GlobalIlluminationQuality=2`).

## Exposure and look (P2, P10)

- Place Actors (Window > Place Actors, or the toolbar Quick Add) > Visual Effects > Post Process
  Volume; Details > Infinite Extent (Unbound), Priority.
- PPV Details > Lens > Exposure: Metering Mode, Exposure Compensation, Min EV100, Max EV100, Speed
  Up, Speed Down, Low/High Percent, Histogram Min/Max EV100, Apply Physical Camera Exposure. Tick
  the checkbox beside a field to override it.
- PPV Details > Lens > Local Exposure: Method, Highlight Contrast, Shadow Contrast, Detail Strength,
  Blurred Luminance Blend.
- PPV Details > Color Grading > Temperature (White Balance), Global / Shadows / Midtones /
  Highlights; Misc: Color Grading LUT. Film (Slope, Toe, Shoulder, Black Clip, White Clip) only in
  the project-wide PPV. 5.5+: Window > Color Grading panel.
- Viewport: view mode menu > Exposure > Game Settings (otherwise the PPV is bypassed); the EV100
  override ignores Exposure Compensation.
- Show > Visualize > HDR (Eye Adaptation): histogram, target line, lux and nits meter at screen
  center. Show > Visualize > Local Exposure.
- CineCamera Actor Details > Current Camera Settings (Filmback, Focal Length, Current Aperture);
  Post Process > Lens > Exposure for the still's Manual metering with physical camera; 5.7+ Exposure
  Method on the camera.

## Lights (P3 to P6)

- Window > Env. Light Mixer: create Sky Light, Atmospheric Light, Sky Atmosphere, Height Fog,
  Volumetric Cloud in one panel.
- Place Actors > Lights: Directional, Point, Spot, Rect, Sky Light. Details:
  - Light: Intensity, Intensity Units, Light Color, Use Temperature and Temperature, Attenuation
    Radius, Source Radius / Soft Source Radius / Source Length, Source Width / Height and Barn Door
    Angle / Length (rect), Inner/Outer Cone Angle (spot), IES Texture.
  - Advanced: Indirect Lighting Intensity, Volumetric Scattering Intensity, Cast Volumetric Shadow,
    Lighting Channels, Max Draw Distance, Affects World, Cast Shadows, Cast Ray Traced Shadows.
  - MegaLights: Allow MegaLights, MegaLights Shadow Method (Ray Tracing or Virtual Shadow Map).
  - Directional: Atmosphere Sun Light, Atmosphere Sun Light Index (0 sun, 1 moon), Source Angle,
    Cast Cloud Shadows; drag the sun with Right Ctrl + L, the moon with Right Ctrl + Shift + L.
  - Sky Light: Real Time Capture, Source Type, Cubemap Resolution, Sky Distance Threshold, Lower
    Hemisphere Is Solid Color, Recapture.
- Exponential Height Fog: Fog Density, Height Falloff, Fog Inscattering Color, Directional
  Inscattering Color, Volumetric Fog (Scattering Distribution: near 0.9 when the key camera looks
  into the light, near 0 for side views; Albedo, Extinction Scale, View Distance); 5.8 Fog Screen
  Space Scattering (Experimental).
- Lighting channels: light Details > Advanced > Lighting Channels (Channel 0 off, Channel 1 on for a
  still-only cheat); the hero mesh's Details > Lighting > Lighting Channels (Channel 0 and 1 on).
- Stationary light overlap: viewport view mode > Optimization Viewmodes > Stationary Light Overlap;
  Light Complexity in the same menu.
- Niagara light renderer (from scenario-unreal-vfx): emitter stack > Light Renderer > Allow Mega
  Lights, Mega Lights Cast Shadows, shadow casting.

## Representation views (P7 to P9)

- View Modes > Lumen > Overview, Lumen Scene, Surface Cache (pink = no cards), Performance Overview;
  Show > Lumen > Screen Traces toggle.
- Show > Visualize > Mesh Distance Fields, Global Distance Field.
- View Modes > MegaLights > Light Complexity (hover a pixel: lines to the lights and a weight list),
  Overview, Shadow Caster, Shadow Caster Mismatch; 5.8 light finder and ray visualizer tools.
- View Modes > Virtual Shadow Map > Cached Page (green cached, red invalidated, blue static), Shadow
  Casters.
- Show > Visualize > Sky Atmosphere; 5.8 Show > Visualize > Color Grading (ColorParade, VectorScope,
  ColorHistogram); Post Process Stack with `r.PostProcessing.Debug.Property`.
- Static Mesh Editor > Build Settings > Max Lumen Mesh Cards, Distance Field Resolution Scale,
  Two-Sided Distance Field Generation; Nanite Settings > Fallback Target = Relative Error, Fallback
  Relative Error, Apply Changes.
- Component Details: Emissive Light Source (small emissive meshes in the Lumen Scene), Visible in
  Ray Tracing, Affect Distance Field Lighting, Shadow Cache Invalidation Behavior, World Position
  Offset Disable Distance.
- Albedo: viewport view mode > Buffer Visualization > Base Color (read it next to the chart of the
  calibrator); material instance Details > Base Color parameters.
- Chrome ball and chart: hold backslash in the viewport for the calibration chart [verify in 5.8],
  or place `/Engine/EditorMeshes/ColorCalibrator/SM_ColorCalibrator`.

## Path tracer and Movie Render Graph (P13)

- Viewport view mode > Path Tracing; PPV Details > Path Tracing: Max Bounces, Samples Per Pixel
  (viewport only), Max Path Intensity, Emissive Materials (the double-count A/B), Reference Depth of
  Field, Reference Atmosphere, Denoiser, Lighting Components (untick Indirect Emissive when fixtures
  carry real lights).
- Glass master (Material Editor, Details of the material node): Blend Mode Translucent, Lighting
  Mode Surface ForwardShading, Refraction Method Index of Refraction; Shading Model Thin Translucent
  only for thin films.
- Sky Atmosphere Details > Transform Mode = Planet Top at Component Transform (Reference
  Atmosphere).
- Window > Cinematics > Movie Render Queue (or Sequencer toolbar > Render). 5.8 opens the Basic
  configuration: name, resolution, location, renderer (deferred or path tracer), output type.
  Settings dropdown > Movie Render Graph to use a graph; Content Browser > Cinematics > Movie Render
  Graph to create one.
- Graph editor: Tab or right-click for nodes; Members panel for Outputs and Variables; right-click a
  node property > expose as pin, right-click the pin > Promote to Variable; right-click a node >
  Disable; Evaluate Graph under Active Render Settings; the collection details arrow selects matched
  actors in the Outliner.
- Render differs from the viewport: right-click Global Game Overrides > Disable (or disconnect it)
  and render again, before any other change.
- Nodes: Global Output Settings (resolution, Flush Disk Writes Per Shot), Warm Up Settings, Sampling
  Method (temporal samples), Global Game Overrides, Set CVar / Apply CVar Preset / Start and End
  Console Commands, Render Layer, Deferred Renderer or Path Traced Renderer (spatial samples, AA
  method, Disable Tone Curve, denoiser, Lighting Components), Collection, Modifier (Holdout, Is
  Hidden, Cast Shadows While Hidden, Affect Indirect While Hidden), 5.8 Light Modifier, EXR and EXR
  Multilayer (DWAA/DWAB in 5.8), Execute Script (Editor Only mode for Python), Debug Settings (Write
  All Samples, Insights trace).
- Render (Local) renders in-process from unsaved state; Render (Remote) reads saved assets and
  prints its command line to the Output Log (a template for farm scripts). Quick Render: main
  toolbar, three-dots menu.

## Profiling (P12, handed to scenario-unreal-performance)

- Console (backquote): `stat unit`, `stat gpu`, `ProfileGPU` (opens the GPU Visualizer; 5.8 adds
  pipe waits and `r.ProfileGPU.TableFormatting 0`), `stat SceneRendering`.
- Status bar Trace widget > Unreal Insights; `trace.enable counters,vsm`; CSV
  `CsvCategory VSM enable` then `csvprofile start` / `stop`.
- Viewport > Scalability menu (Performance and Scalability) for quick level switches; device
  profiles for the real contract.
