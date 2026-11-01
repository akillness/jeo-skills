# Voxel Tools upstream evidence

Observed 2026-11-01; read-only research and package authoring, no game/runtime verification.

## Identity, version and editions

https://lnkd.in/gUaMbGBd resolved directly to https://github.com/Zylann/godot_voxel, owner Zylann. Original post body uninspected. Research master: 045ff9326a32fd10ac6fdac6357b5a098aaf2093, committed 2026-10-01T17:20:25Z. [voxel_version.py](https://github.com/Zylann/godot_voxel/blob/045ff9326a32fd10ac6fdac6357b5a098aaf2093/voxel_version.py) says 1.7.1-dev. Latest observed [v1.7 release](https://github.com/Zylann/godot_voxel/releases/tag/v1.7), published 2026-08-20, title Godot 4.7.2.stable.custom_build [ed1daf0bf] + Voxel Tools 1.7. Release commit not resolved; do not substitute research master for release. Releases are convenient continuous-development snapshots, not a promise of all editor/template platforms.

## Architecture and API anchors

- [README](https://github.com/Zylann/godot_voxel/blob/045ff9326a32fd10ac6fdac6357b5a098aaf2093/README.md): C++ module/extension for Godot 4; polygon chunks, blocky meshing, smooth Transvoxel LOD, generators/streams, physics and instancing. Infinite means paged chunks, not unbounded resources.
- [Development / Layers / Folders / Threads](https://github.com/Zylann/godot_voxel/blob/045ff9326a32fd10ac6fdac6357b5a098aaf2093/doc/source/development.md): Voxel engine namespace zylann::voxel, generic Util namespace zylann, Thirdparty. Storage, generators, meshers, streams and terrain nodes are distinct; standalone mesher/generator/stream use is possible. Priority task pool with serial I/O tasks; tasks are not synchronized to frames.
- [Quick start / Short recipes](https://github.com/Zylann/godot_voxel/blob/045ff9326a32fd10ac6fdac6357b5a098aaf2093/doc/source/quick_start.md): blocky VoxelTerrain + VoxelGeneratorNoise2D TYPE + VoxelMesherBlocky + empty/cube VoxelBlockyLibrary; smooth VoxelLodTerrain + VoxelGeneratorNoise SDF + VoxelMesherTransvoxel. Runtime needs VoxelViewer, normally child of Camera3D, and real scene lights/environment.
- [Quick start / Is Voxel tools for you?](https://github.com/Zylann/godot_voxel/blob/045ff9326a32fd10ac6fdac6357b5a098aaf2093/doc/source/quick_start.md): not full Minecraft, not Teardown/John Lin-style ray tracing; heightmaps/static meshes may fit noneditable terrain better. Marketing similarity does not establish identical architecture/performance.

## Module versus GDExtension and exports

[Getting Voxel Tools / Module / Exporting / GDExtension / C# support](https://github.com/Zylann/godot_voxel/blob/045ff9326a32fd10ac6fdac6357b5a098aaf2093/doc/source/getting_the_module.md): module needs custom Godot editor AND custom export templates. Vanilla templates lack module classes. Set the actual target's Export > Custom Template; editor success alone is insufficient. Platforms need threads. SIMD FastNoise2 0.10 benefits x86 and falls back scalar elsewhere; GPU compute needs Forward+.

Extension uses regular Godot/export templates; recent and less-tested, development guide says not production-ready and may crash. FastNoise2 is not included. Never activate module and extension together (class conflicts). [release manifest](https://github.com/Zylann/godot_voxel/blob/045ff9326a32fd10ac6fdac6357b5a098aaf2093/project/addons/zylann.voxel/voxel.gdextension-release) minimum 4.4.1; configured paths Windows x86_64, Linux x86_64/arm64, macOS universal, iOS arm64, Android x86_64/arm64. The prose list omits Linux arm64. Configured paths do not establish included binaries or tested targets. [SConstruct](https://github.com/Zylann/godot_voxel/blob/045ff9326a32fd10ac6fdac6357b5a098aaf2093/SConstruct) asks godot-cpp API 4.5; distinguish from manifest minimum.

Module C# needs generated custom SDK/local NuGet. Extension C# uses reflection Call/Get/Set/ClassDB.Instantiate; strongly typed bindings not established. The example is pseudocode/untested and has overhead. Reference-count ownership checks may false-positive in C#; documented voxel/ownership_checks change needs explicit approval and tradeoff explanation.

## Actual build commands and drift (not executed)

[Development / Building](https://github.com/Zylann/godot_voxel/blob/045ff9326a32fd10ac6fdac6357b5a098aaf2093/doc/source/development.md): first compile matching Godot; put module exactly in godot/modules/voxel; rebuild and verify VoxelTerrain in a new scene. Master normally follows latest stable Godot branch; snapshot branches stop receiving updates. Godot3 branch is unmaintained. Preserve known-good builds before updates of independently changing repositories.

Extension: obtain godot-cpp, set GODOT_CPP_PATH, run SCons in voxel root. Documented Windows example scons platform=windows target=debug -j4 is not verified: actual SConstruct uses target==editor, so inspect chosen godot-cpp targets before adopting it. Output project/addons/zylann.voxel/bin; release packaging substitutes voxel.gdextension-release. Avoid developer-specific default path in SConstruct.

Internal tests: build with voxel_tests=yes, launch Godot --run_voxel_tests. These are build/runtime actions requiring approval. Web recipe scons platform=web requires Emscripten matching export template. Guide lists guesses 4.0.11/4.0.20 and says 5.0.0 failed as of 2026-02-14; not a verified matrix. Ordinary template compatibility and thread support remain target-specific.

[Performance / Threads / Rendering](https://github.com/Zylann/godot_voxel/blob/045ff9326a32fd10ac6fdac6357b5a098aaf2093/doc/source/performance.md): zero threads unsupported; count settings need restart; VoxelEngine.get_stats() exposes metrics. Main-thread budget voxel/threads/main/time_budget_ms trades latency/work across frames. View/LOD distance and mesh block size trade draw calls against edit latency. No benchmark was executed.

## Licenses and boundaries

[LICENSE.md](https://github.com/Zylann/godot_voxel/blob/045ff9326a32fd10ac6fdac6357b5a098aaf2093/LICENSE.md): MIT, Marc Gilleron 2016-2024. Commercial copying/modification/redistribution/sale permitted; keep copyright/permission notices with copies/substantial portions; AS-IS and liability disclaimer.

- [FastNoiseLite.h header](https://github.com/Zylann/godot_voxel/blob/045ff9326a32fd10ac6fdac6357b5a098aaf2093/thirdparty/fast_noise/FastNoiseLite.h): MIT, header version 1.1.1, Jordan Peck/contributors.
- [FastNoise2 LICENSE](https://github.com/Zylann/godot_voxel/blob/045ff9326a32fd10ac6fdac6357b5a098aaf2093/thirdparty/fast_noise_2/LICENSE): MIT, Jordan Peck.
- [meshoptimizer LICENSE](https://github.com/Zylann/godot_voxel/blob/045ff9326a32fd10ac6fdac6357b5a098aaf2093/thirdparty/meshoptimizer/LICENSE.md): MIT, Arseny Kapoulkine.
- [LZ4 LICENSE](https://github.com/Zylann/godot_voxel/blob/045ff9326a32fd10ac6fdac6357b5a098aaf2093/thirdparty/lz4/LICENSE): BSD-2; preserve source copyright/conditions/disclaimer and reproduce them in binary documentation/materials; AS-IS liability disclaimer.
- [SQLite header](https://github.com/Zylann/godot_voxel/blob/045ff9326a32fd10ac6fdac6357b5a098aaf2093/thirdparty/sqlite/sqlite3.h): explicit copyright disclaimer/public-domain dedication, not a proprietary license grant invented from the blessing.

Godot/godot-cpp, copied utility/algorithm file notices and their full bundled dependencies were not exhaustively cleared. Root MIT is not redistribution clearance for an entire custom Godot binary or demo assets.

## Installed helper and unexecuted scope

[source.json](source.json) records exact README/license SHA-256. Raw URL prefix: https://raw.githubusercontent.com/Zylann/godot_voxel/045ff9326a32fd10ac6fdac6357b5a098aaf2093/ . Installed helper scripts/preflight.py (../scripts/preflight.py from this reference) is byte-identical to the shared offline helper, not upstream build code. It never installs or runs Godot/SCons. No source build, extension load, export, gameplay, terrain edit/persistence or performance validation was performed. Evals are authored-not-executed.
