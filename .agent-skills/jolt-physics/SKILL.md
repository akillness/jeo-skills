---
name: jolt-physics
description: >
  Operate jrouwe/JoltPhysics for native C++ physics integration, pinned builds, body lifecycle, collision queries, determinism checks, or Jolt-specific failures. Use when the request names Jolt Physics, its JPH API, or this repository. Route ordinary Godot physics settings, unrelated physics engines, and JavaScript binding work to their own owners; this skill does not install or build anything by activation.
allowed-tools: Read Write Edit Bash
compatibility: Source-pinned operator guidance; offline preflight is not runtime or whole-revision verification.
metadata:
  version: "1.0.0"
  source: "https://github.com/jrouwe/JoltPhysics"
  upstream_commit: "ea4599d5044d92ba91b18664ec1df96255d5eb31"
---

# jolt-physics

## When to use this skill

Use for the named Jolt native library, JPH symbols, its sample integration, or an existing Jolt build/runtime issue. Select exactly one mode: **source-fit**, **build-plan**, **native-integration**, **determinism-audit**, or **failure-triage**. Generic Godot physics belongs to the engine workflow, not this native-library operator. JoltPhysics.js is a separate repository and requires its own source/version review.

## Instructions

### 1. Freeze one mode and evidence boundary
Read [references/upstream.md](references/upstream.md) for version, architecture, asset-license, and platform limits. Read [references/source.json](references/source.json) for selected-file provenance. Record existing project/compiler/architecture/build type, linked Jolt version, requested output, and permission scope. Preserve existing pins; HEAD evidence is not release equivalence.

**Helper host prerequisite:** Before running the helper, use a POSIX Python environment with `os.O_NOFOLLOW` and `os.open` support for `dir_fd`. Native Windows may fail closed with `secure_posix_traversal_unavailable`; preserve these safety guards. Windows users can retry in a WSL environment that supports these features or manually compare the original manifest-listed source files against the pinned evidence. Neither this guidance nor a manual comparison verifies helper execution or runtime behavior; report those as unverified.

From the **installed skill directory**, run only the offline helper when authorized:
~~~sh
python3 scripts/preflight.py --json
python3 scripts/preflight.py --json --repo <approved-absolute-source-root>
~~~
The helper is local at `scripts/preflight.py` and loads `references/source.json` relative to itself. It checks selected bytes, rejects symlink traversal and sensitive paths, and does not run upstream code. Without --repo, source_checked remains false. Tool presence is not version/readiness proof; whole_revision_verified and runtime_verified remain false. Stop source-fit on mismatched selected hashes; do not rewrite the manifest to force a match.

### 2. Execute only the selected mode
- **source-fit:** distinguish core CPU library, desktop visualization, GPU ComputeSystem/hair, and third-party language bindings. Check CPU instruction support and required toolchain before proposing a build. Done: pinned compatibility/unknowns packet, no installation.
- **build-plan:** consult Build/README.md and exact checked-out scripts. C++17; README baseline VS2022+, Clang16+, GCC12+. Current Windows guide defaults to VS2026. Quote commands from the reference; do not upgrade the project. Done: reproducible commands, prerequisites, output locations, and explicit approval boundary.
- **native-integration:** include Jolt/Jolt.h first; use the pinned HelloWorld lifecycle. RegisterDefaultAllocator before any Jolt call, install callbacks, create Factory, RegisterTypes, temp allocator and job system, persistent layer filters, PhysicsSystem.Init. Allocate bodies through BodyInterface; AddBody/CreateAndAddBody; update with an explicit fixed step; RemoveBody then DestroyBody; UnregisterTypes and clear factory after world resources are finished. ShapeSettings.Create results require error inspection. Keep referenced filters/listeners alive. Size body/pair/contact limits for the actual workload; sample limits are not production defaults. Done: scoped integration diff and acceptance checks, not an unexecuted success claim.
- **determinism-audit:** verify identical modifying API order; same binary unless cross-platform mode is deliberately configured. CROSS_PLATFORM_DETERMINISTIC still needs identical source/defines and compatible application floating-point settings. Broadphase queries, callbacks, narrowphase result ordering and active-body ordering need explicit filtering/sorting where application logic depends on order. Done: deterministic comparison contract and exact tested configuration, or an unexecuted test plan.
- **failure-triage:** collect first error, compile/link command, defines, RTTI/LTO settings, CPU flags and exact artifact. RegisterTypes abort can signal define mismatch; typeinfo errors can indicate RTTI mismatch; illegal instructions can indicate optimized CPU features. Test one minimal reproduction rather than changing all flags. Done: evidence-backed cause or smallest remaining probe.

### 3. Gate side effects and asset use
Source downloads, dependencies, compiler/build/test execution, project edits and signing each need explicit matching approval. Never infer publishing or git permission. Root MIT does not clear all assets: race tracks have LGPLv3 terms; external hair/head-model rights remain unresolved. Use self-owned synthetic test geometry unless component rights are separately verified. GPU hair does not mean GPU rigid-body simulation. Console support can require NDA-controlled files unavailable here.

### 4. Verify the actual requested outcome
Before approved execution, freeze commit, command, compiler, flags, test input, expected result, and output path. Afterwards preserve exit code/raw output and inspect the requested artifact. For integration, verify body cleanup, collision filters, fixed-step stability, buffer saturation, and thread-safe callbacks. For determinism, compare replay results across the exact declared configurations. Never substitute preflight success, README claims, or a green build for runtime/collision/performance proof. If execution is not authorized, return the plan and mark tests not executed.

## Examples

- “Integrate JoltPhysics into our pinned CMake C++ project.” → native-integration; preserve pin/defines, inspect lifecycle, propose a tiny falling-body test, execute only after approval.
- “Jolt aborts in RegisterTypes after enabling doubles.” → failure-triage; compare JPH defines on both sides before rebuilding.
- “Can I replay Jolt inputs across ARM and x86?” → determinism-audit with ordering and floating-point caveats, not a blanket yes.
- “Fix Godot CharacterBody3D movement.” → route to the Godot owner unless an actual native Jolt integration issue is identified.

## Best practices

Keep core/sample/GPU dependencies separate. Batch body insertion; OptimizeBroadPhase is expensive and not a per-frame default. Keep listener work thread safe. Record approximate upstream performance statements as claims, never local measurements. Preserve root and component notices when distributing copied software/assets. Copy no unresolved asset and publish no upstream contribution without separately checking the contributor agreement and authorization.

## References

- [references/upstream.md](references/upstream.md): pinned primary links, commands, version and license exceptions.
- [references/source.json](references/source.json): two selected-file hashes, not whole-tree attestation.
- [scripts/preflight.py](scripts/preflight.py): offline helper, byte-identical to the local awesome-gamedev-agent-skills helper.
