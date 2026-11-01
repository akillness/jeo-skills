# Terrain3D: pinned upstream evidence

Observed2026-11-01. Canonical https://github.com/TokisanGames/Terrain3D . https://lnkd.in/g2MCk8_F resolved there; full LinkedIn post not inspected.

## Source versus release

Inspected main HEAD cdcd382cd639f0b043444d7d161f1a6c00d30977. Latest [v1.1.0-stable](https://github.com/TokisanGames/Terrain3D/releases/tag/v1.1.0-stable), published2026-10-30, explicitly supports Godot4.5-4.8+. The [HEAD SConstruct](https://github.com/TokisanGames/Terrain3D/blob/cdcd382cd639f0b043444d7d161f1a6c00d30977/SConstruct) defaults api_version=4.6. Inspected godot-cpp gitlink:507ed9d840c01a3c5b2a39af8bb4000bfac30bf5. Do not equate released-binary support with HEAD compilation API. Tag equality was not verified; preserve both coordinates.

## Architecture and limits

[README Features](https://github.com/TokisanGames/Terrain3D/blob/cdcd382cd639f0b043444d7d161f1a6c00d30977/README.md#features): C++ GDExtension, official Godot builds, GDScript/C#/Godot-supported API access, heightmaps, foliage, holes, up to32 textures and10 terrain LODs. These are upstream feature/design claims, not benchmark results.

[Introduction](https://github.com/TokisanGames/Terrain3D/blob/cdcd382cd639f0b043444d7d161f1a6c00d30977/doc/docs/introduction.md), Clipmap Terrain/Regions/Vertex Painting: camera-centered clipmap; default256m regions, configurable64-2048;1024 regions/32x32 gives maximum65,536m per side at largest region size. One .res file per region; only allocated regions consume their data memory. No collision outside regions, even when shader background looks like terrain. Vertex painting is not pixel-perfect painting.

[System architecture](https://github.com/TokisanGames/Terrain3D/blob/cdcd382cd639f0b043444d7d161f1a6c00d30977/doc/docs/system_architecture.md), Geometry Clipmap Terrain/Architectural Design Principles: prebuilt mesh components, GPU heightmap displacement,1 pixel per LOD0 vertex; global_position API inputs remain absolute after vertex_spacing changes. [Terrain3DData API](https://github.com/TokisanGames/Terrain3D/blob/cdcd382cd639f0b043444d7d161f1a6c00d30977/doc/api/class_terrain3ddata.rst) should be consulted for the exact installed signature; it is linked as follow-up reference, not an independently executed API.

[Platforms](https://github.com/TokisanGames/Terrain3D/blob/cdcd382cd639f0b043444d7d161f1a6c00d30977/doc/docs/platforms.md): Windows/Linux/macOS supported; iOS/Android conditional/experimental, web very experimental; Forward+ Vulkan and Mobile Vulkan supported, D3D12 since Godot4.6; Compatibility/OpenGLES3 since Terrain3D1.0/Godot4.4. Full Metal support unclear. Mobile guidance reduces max_regions, uses imported PNG/TGA rather than DDS, enables ETC2/ASTC. macOS release binaries may need trust/signing handling; published quarantine-removal commands are not permission to weaken security.

## Installation and approved source-build recipe

[Installation](https://github.com/TokisanGames/Terrain3D/blob/cdcd382cd639f0b043444d7d161f1a6c00d30977/doc/docs/installation.md), From The Asset Library/From Github/In Your Own Scene: choose TokisanGames entry or official ZIP, copy addons/terrain_3d, enable plugin, demo/Demo.tscn F6. Assign empty data directory per map; intentionally shared scenes can share data/resources.

[Building](https://github.com/TokisanGames/Terrain3D/blob/cdcd382cd639f0b043444d7d161f1a6c00d30977/doc/docs/building_from_source.md): Python/SCons/compiler required; full engine source not necessary. Commands below were read, not run:
~~~sh
git clone git@github.com:TokisanGames/Terrain3D.git
cd Terrain3D
git submodule init
git submodule update
scons
scons target=template_release
# Optional explicit platform, only after target compatibility review
scons platform=linux
~~~
A reproducible plan must additionally check out the approved source pin before initializing its pinned submodule; never replace it with moving godot-cpp master by default. Default debug is for editor/debug exports; release library for release exports. Output project/addons/terrain_3d/bin. Close Godot before rebuild. Inspect engine/API compatibility rather than trusting generic GDExtension build options.

## Non-destructive upgrade contract

Installation Upgrading Terrain3D/Upgrade Path says close Godot, remove old addon and replace entirely, not overlay. Older versions may require staged conversions:0.9.2 needs0.9.3;0.9.3 can proceed to1.0-1.1;0.9.3 changed storage from one .res to per-region directory. Protect actual data, resources and scenes with a separate verified backup and disposable working copy before any conversion. Keep original and restore instructions until test-copy verification and explicit production promotion. Do not interpret upstream removal instructions as authorization to delete the user's only copy.

## Licenses and provenance

[Full LICENSE.txt](https://github.com/TokisanGames/Terrain3D/blob/cdcd382cd639f0b043444d7d161f1a6c00d30977/LICENSE.txt): MIT,2023-2026 Cory Petkovsek/Roope Palmroos/contributors. Use/copy/modify/merge/publish/distribute/sublicense/sell allowed; retain copyright/permission notices in copies/substantial portions; AS-IS/no warranty including fitness, merchantability/noninfringement; no author liability.

[Exact godot-cpp LICENSE.md](https://raw.githubusercontent.com/godotengine/godot-cpp/507ed9d840c01a3c5b2a39af8bb4000bfac30bf5/LICENSE.md): MIT, Godot contributors, same obligations. [Demo texture notice](https://github.com/TokisanGames/Terrain3D/blob/cdcd382cd639f0b043444d7d161f1a6c00d30977/project/demo/assets/textures/asset_licenses.txt): ambientCG Ground037/Rock030/Rock023 CC0-1.0. CC0 does not itself clear third-party patent/trademark/privacy rights. Architecture states earlier Mike Savage code MIT per email; correspondence not independently inspected. Entire transitive asset/binary clearance is not established.

## Verification limits

No addon installation, SCons, Godot process, conversion, runtime demo, export or benchmark performed. Preflight hashes only listed README/license bytes; no HEAD/submodule/ABI assertion. Platform reports and frame-rate anecdotes remain upstream claims. Installed helper is scripts/preflight.py; references are relative to the installed skill root and need no author's workstation paths.
