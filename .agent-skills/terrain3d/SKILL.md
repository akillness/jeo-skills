---
name: terrain3d
description: >
  Operate TokisanGames/Terrain3D for Godot version compatibility, addon installation or source builds, region and heightmap integration, terrain API work, upgrades, and Terrain3D-specific failures. Use when the request names Terrain3D, Terrain3DData, or this repository. Route generic Godot terrain choices, voxel worlds, and other terrain plugins to their own owners; activation never installs or upgrades the addon.
allowed-tools: Read Write Edit Bash
compatibility: Source-pinned operator guidance; offline preflight is not runtime or whole-revision verification.
metadata:
  version: "1.0.0"
  source: "https://github.com/TokisanGames/Terrain3D"
  upstream_commit: "cdcd382cd639f0b043444d7d161f1a6c00d30977"
---

# terrain3d

## When to use this skill

Use only for TokisanGames/Terrain3D and its Terrain3D/Terrain3DData APIs. Pick one mode: **version-fit**, **addon-install**, **source-build**, **terrain-integration**, **upgrade**, or **failure-triage**. Generic Godot design belongs to the Godot owner; voxel/cave/volumetric terrain is not established by this heightmap clipmap addon.

## Instructions

### 1. Pin source, engine and renderer separately
Read [references/upstream.md](references/upstream.md) and [references/source.json](references/source.json). Record exact Godot binary version, renderer/platform, Terrain3D version, data format, source commit/submodule if building, and authorized outputs. Release1.1 claims Godot4.5-4.8+; inspected main SConstruct defaults api_version=4.6. A release requirement is not proof that a HEAD source build targets the same minimum. Preserve the existing engine and godot-cpp pin.

**Helper host prerequisite:** Before running the helper, use a POSIX Python environment with `os.O_NOFOLLOW` and `os.open` support for `dir_fd`. Native Windows may fail closed with `secure_posix_traversal_unavailable`; preserve these safety guards. Windows users can retry in a WSL environment that supports these features or manually compare the original manifest-listed source files against the pinned evidence. Neither this guidance nor a manual comparison verifies helper execution or runtime behavior; report those as unverified.

From the **installed skill directory**:
~~~sh
python3 scripts/preflight.py --json
python3 scripts/preflight.py --json --repo <approved-absolute-source-root>
~~~
The bundled scripts/preflight.py loads references/source.json relative to itself; it is offline, bounded and rejects symlinks/sensitive paths. Without --repo it does not inspect upstream files. A match concerns only README/LICENSE, not HEAD, submodules, binary ABI, engine/runtime or security readiness. Stop on mismatch instead of changing hashes.

### 2. Work one mode to a concrete boundary
- **version-fit:** compare release notes, actual source SConstruct and .gdextension with the project's engine/renderer/platform. Windows/Linux/macOS are supported; mobile/web experimental, Metal support unclear. Done: compatible/blocked/unknown matrix without upgrade.
- **addon-install:** preview official AssetLib/release selection and destination. After approval copy addons/terrain_3d, enable Project Settings/Plugins, open demo/Demo.tscn and run F6 only with engine-execution approval. Done: accepted plugin state and observed demo, or an unexecuted plan.
- **source-build:** pin main source and godot-cpp submodule, inventory Python/SCons/compiler. Read exact api_version and debug/release configuration. Approve downloads/build separately, then use reference commands. Verify binaries in project/addons/terrain_3d/bin and both needed export configurations. Close Godot before rebuild. Done: exact build command/exit/artifact report, never binary-ABI inference from file presence.
- **terrain-integration:** add Terrain3D node; assign an empty dedicated Data Directory. Share it only when scenes intentionally use the same map. Save Material/Assets .tres when sharing resources. Check region_size and vertex_spacing before coordinate conversion. APIs accepting global_position require absolute global positions; use Terrain3DData.get_region_location() rather than duplicating assumptions. Use region-location Vector2i keys. Inspect target method signature in the installed version before mutation. Done: tiny approved-region/heightmap test with documented import units/origin, persistence after reload, visible terrain and collision checks.
- **upgrade:** first inventory all scenes/data/resources and current version. Require a verified separate backup or disposable copy, including data directory, Material/Assets resources and old addon; record restore procedure before conversion. Compare documented upgrade path and API/data changes. Close Godot, remove old addon only in the approved copy, then install complete replacement; never overlay or delete source data. Reopen/convert only after approval and retain old backup until load/save/collision/foliage checks pass. Done: test-copy results plus explicit production-promotion decision, not an automatic replacement.
- **failure-triage:** record console output, engine/addon version and renderer. Distinguish missing godot-cpp, API/ABI mismatch, absent release binary, bad data path, unsupported renderer and macOS trust failures. First isolate in untouched demo/test copy. Done: supported cause or smallest diagnostic; no security override by default.

### 3. Preserve architectural and permission limits
Clipmap GPU vertex displacement does not allocate collisions outside regions. Region grid limit1024/32x32, region sizes64-2048 and current32 texture limit are design constraints, not measured speed. This is vertex painting, not pixel-perfect painting. Preview overwrite/import extent before heightmap changes. Downloads, project edits, conversion, build/editor execution, signing and quarantine changes each need matching permission. Prefer signed/self-built binaries over automatically disabling security controls. Publishing is separate.

### 4. Verify evidence, not labels
Report commit, release, engine build/API, submodule, platform/renderer, command/exit and artifact separately. After approved integration verify save/reload, material references, region coordinates, LOD/camera motion, collision inside regions and no assumption of collision outside them. For export verify release library and target-device behavior. A bundled web binary is not stable web support. Missing runtime approval means checks remain not executed; preflight pass is selected-file provenance only.

## Examples

- “Install Terrain3D1.1 in my Godot4.5 project.” → version-fit before addon-install; distinguish released binary compatibility from main's4.6 build API.
- “Upgrade an old Terrain3D data directory.” → upgrade; backup and test copy first, documented staged conversion, no destructive overlay.
- “Terrain3DData lookup lands in the wrong region after vertex_spacing changed.” → terrain-integration; absolute global coordinates and installed API signatures.
- “Build a volumetric cave world in Godot.” → route to an appropriate voxel/volumetric owner; do not advertise Terrain3D holes as arbitrary volume editing.

## Best practices

Keep engine, addon, source API and data-format versions distinct. Treat shared data directories as shared mutable state. Preserve old data until explicit promotion. Use version-matching docs and small test regions. Prefer evidence from the actual target renderer/device; FPS reports on another user's Steam Deck are not your benchmark. Keep MIT notices and separately identified demo-asset provenance.

## References

- [references/upstream.md](references/upstream.md): primary pin/release/platform/build/data/license evidence.
- [references/source.json](references/source.json): selected README/license hashes and tool inventory.
- [scripts/preflight.py](scripts/preflight.py): installed offline helper; no Godot execution.
