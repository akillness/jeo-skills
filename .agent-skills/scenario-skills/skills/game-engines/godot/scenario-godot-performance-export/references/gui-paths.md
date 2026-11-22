# GUI paths: performance and release

For a computer-use agent or a human in the Godot 4.7.2 editor. Each line maps to the scripted
procedure in `procedures.md`. Menu names follow the 4.7 editor; paths not opened during this skill's
tests are marked [not checked in the GUI].

## Profiling (procedures 3 to 6)

- **Profiler:** bottom panel Debugger > Profiler > Start, play the scene, Stop; switch "Inclusive" /
  "Self" in the time column (profiler doc). Scripted substitute: `gd_perf.profile_variant` CSV.
- **Visual Profiler:** Debugger > Visual Profiler > Start: CPU and GPU time per render step [not
  checked in the GUI].
- **Monitors:** Debugger > Monitors: tick Time > Process, Physics; Object > Nodes; Raster > Draw
  calls, Objects, Primitives; Video > Video Mem; Pipeline > compilations. Remember: Process and
  Physics update about once per second.
- **Video RAM:** Debugger > Video RAM: largest textures and meshes [not checked in the GUI].
- **Remote scene tree:** Scene dock > Remote while the game runs: node counts in the live tree.
- **Custom monitors:** appear under Debugger > Monitors after `Performance.add_custom_monitor`.

## Rendering levers (procedures 3, 7)

- **Material sharing:** select MeshInstance3D > Inspector > Surface Material Override or Material
  Override > drop the same `.tres` on all; Resource > Make Unique is the trap.
- **MultiMesh:** add MultiMeshInstance3D > Inspector > Multimesh > New MultiMesh; toolbar
  MultiMesh > Populate Surface for scattering [not checked in the GUI]; per-instance data needs
  code.
- **Shadows:** OmniLight3D or SpotLight3D > Inspector > Shadow > Enabled; Distance Fade > Enabled,
  Begin, Shadow, Length; Light3D > Bake Mode: Static or Dynamic.
- **Occlusion:** Project > Project Settings > Rendering > Occlusion Culling > Use Occlusion Culling
  (Advanced Settings on). Add OccluderInstance3D > Occluder > New BoxOccluder3D and size it, or Bake
  Occluders from the toolbar (Zenva prefers boxes). Viewport perspective menu > Display Advanced >
  Occlusion Culling Buffer to see occluders.
- **Visibility range:** GeometryInstance3D > Inspector > Visibility Range > Begin, End, Margins,
  Fade Mode.
- **Resolution scale:** Project Settings > Rendering > Scaling 3D > Mode and Scale.
- **Renderer:** Project Settings > Rendering > Renderer > Rendering Method (and .mobile, .web
  overrides); top-right renderer selector in the editor.

## Exports (procedures 9 to 12)

- **Templates:** Editor > Manage Export Templates > Download and Install (exact version).
- **Presets:** Project > Export > Add... > platform. Resources tab: Export Mode (all, selected
  scenes, selected resources, exclude), Filters to export non-resource files, Filters to exclude.
  Features tab: Custom (for `demo`). Options tab: platform fields below.
- **Pack only:** Project > Export > Export PCK/ZIP... for DLC packs.
- **Texture formats:** Project Settings > Rendering > Textures > VRAM Compression > Import ETC2 ASTC
  (needed for macOS, Android, iOS), Import S3TC BPTC.
- **macOS preset:** Application > Bundle Identifier, Short Version, Version; Binary Format >
  Architecture (universal); Codesign > Codesign (Built-in, Xcode codesign, Disabled), Identity;
  Entitlements > Debugging off for notarization; Notarization > Notarization (Disabled for this
  skill). Keychain Access app for Developer ID certificates.
- **Web preset:** Variant > Thread Support, Extensions Support; VRAM Texture Compression > For
  Desktop, For Mobile; HTML > Custom HTML Shell, Head Include; Progressive Web App > Enabled, Ensure
  Cross Origin Isolation Headers.
- **Android preset:** Gradle Build > Use Gradle Build, Export Format (APK or AAB), Min SDK, Target
  SDK; Architectures; Keystore > Debug, Release (leave empty, use env vars); Package > Unique Name;
  Version > Code, Name; Permissions. Editor > Editor Settings > Export > Android > Java SDK Path,
  Android SDK Path, Debug Keystore. Project > Install Android Build Template for Gradle builds.
- **iOS preset:** Application > App Store Team ID, Bundle Identifier, Short Version, Version, Export
  Project Only; Xcode then: Signing and Capabilities, Product > Archive, Organizer > Distribute App.

## Outside Godot (documented, not run here)

- **Apple:** developer.apple.com > Certificates, Identifiers and Profiles; appleid.apple.com >
  App-Specific Passwords; App Store Connect > My Apps > + New App; TestFlight tab.
- **Google Play Console:** Create app > Release > Testing > Internal testing > Create new release >
  upload AAB; Play App Signing holds the app key, the upload key signs uploads.
- **Steamworks:** App Admin > SteamPipe > Depots, Builds; set a build live on a beta branch first.
- **itch.io:** Edit game > Kind of project: HTML > upload zip with `index.html` at the root > Embed
  options > SharedArrayBuffer support (only for threaded builds).
- **Arm Performance Studio:** Streamline > select device and app > Capture with the Arm GPU profile
  (Ian Bolton, WrjaUNAXYqk).
- **Xcode components:** Xcode > Settings > Components > iOS platform (needed for `xcodebuild` device
  builds; missing on this Mac).
