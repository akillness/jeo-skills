---
name: fastnoise2
description: >
  Operate Auburn/FastNoise2 for pinned C++ or C API integration, FastSIMD node graphs, encoded tree loading, deterministic batch noise, or the optional FastNoise2 Node Editor. Use when the request names FastNoise2, its FastNoise:: APIs, FASTNOISE2 build options or Node Editor serialization. Route FastNoise Lite, shader noise and general terrain generation without this library to their own tools; this is not a terrain engine or GPU noise framework.
allowed-tools: Read Bash Write Edit
compatibility: Core C++17 CPU SIMD library and optional C++20 editor; offline selected-file checks are not build, runtime, platform or performance verification.
metadata:
  version: "1.0.0"
  source: "https://github.com/Auburn/FastNoise2"
  upstream_commit: "721400f9560831be2fc9790be9b72c44bee7d33f"
---

# fastnoise2

## When to use this skill

- Inspect, integrate or troubleshoot the named Auburn/FastNoise2 library, its C API or pinned FastSIMD dependency.
- Build and evaluate FastNoise2 node trees, load encoded configurations or diagnose SIMD/determinism/threading behavior.
- Plan the optional FastNoise2 Node Editor build, serialization workflow or shared-memory IPC integration.
- Route FastNoise Lite, standalone GLSL noise, generic terrain meshing and unrelated noise libraries elsewhere. An external C#/Rust/Unreal binding has its own repository/version/license contract; listing it in upstream README does not prove it matches the selected core ABI.

## Instructions

### 1. Choose one mode and establish the source boundary

Select one primary mode: **inspect-source**, **core-integration**, **node-graph**, **determinism-or-threading**, **c-api-or-binding**, or **node-editor**. Record the project's existing FastNoise2 revision, compiler, target CPU/SIMD, build type, requested side effects and measurable acceptance criteria. Preserve existing locks and versions until an explicit upgrade decision.

Read this installed skill's `references/source.json` for selected-file hashes and `references/upstream.md` for primary links, dependency pins, license conditions and documented drift. Resolve both references and `scripts/preflight.py` relative to the directory containing this SKILL.md, not an assumed repository root.

**Helper host prerequisite:** Before running the helper, use a POSIX Python environment with `os.O_NOFOLLOW` and `os.open` support for `dir_fd`. Native Windows may fail closed with `secure_posix_traversal_unavailable`; preserve these safety guards. Windows users can retry in a WSL environment that supports these features or manually compare the original manifest-listed source files against the pinned evidence. Neither this guidance nor a manual comparison verifies helper execution or runtime behavior; report those as unverified.

If offline helper execution is authorized, from the installed skill directory use:

```sh
python3 -B scripts/preflight.py --json
python3 -B scripts/preflight.py --json --repo /absolute/nonsymlink/upstream-checkout
```

The helper never fetches dependencies or executes upstream code. Without `--repo` it checks no source files. A selected-file match does not attest Git HEAD or unlisted files; `whole_revision_verified=false`, `runtime_verified=false` and `tool_versions_verified=false` remain limitations. Tool presence is informational, not a compiler-version or runtime test. Report a mismatched pin before proceeding.

### 2. Freeze version, dependencies and license

The audited master commit is `721400f9560831be2fc9790be9b72c44bee7d33f`; CMake still declares 1.1.1, but this is not release v1.1.1 (`903c1f2d2f9d53ddce94cd223f32727d9ab3aeaa`). The master commit fixes C API reference lifetime/null/failed-create bugs after that release. Never use the version string alone to infer the fix is present.

Core uses C++17/CMake 3.10+ and CPU SIMD, not a GPU compute backend. Current Node Editor adds C++20 and substantial dependencies. Core's CPM fetch pins FastSIMD at `f7e9ce6fca475731c0a3c115ec29dcfd36886b2a`; even a CMake configure can download code. Preview network/cache/output scope and obtain approval before acquisition, configuration, compilation or editor launch.

Read the complete pinned MIT license, retain copyright/permission/disclaimer when distributing substantial portions, and inspect FastSIMD/CPM notices. Node Editor adds MIT/zlib-style dependencies, FreeType FTL-or-GPL and an embedded font whose item-level license was not established in this audit. Route redistribution through that unresolved boundary rather than calling the whole editor MIT-only.

### 3. Execute only the selected workflow

**core-integration**

1. Inspect target toolchain/ABI, compiler, static/shared choice and existing package. Configure a disposable, approved output directory, not the source tree. Disable tools explicitly for a core-only standalone build: `FASTNOISE2_TOOLS=OFF`.
2. Integrate source using `add_subdirectory` and `target_link_libraries(... FastNoise)`; use `#include <FastNoise/FastNoise.h>`. CMake supplies include/linked dependencies and the static define. Manual static consumers must define `FASTNOISE_STATIC_LIB`.
3. For installed packages inspect the exported config/targets. Current source installs package FastNoise2 and namespace `FastNoise2::`; the old wiki's `find_package(FastNoise ...)` and `FASTNOISE2_NOISETOOL` examples are stale. The source-derived `FastNoise2::FastNoise` recipe needs testing against the actual installed artifacts.
4. On Windows discuss upstream's MSVC SIMD correctness warning and ClangCL recommendation. Do not change the compiler or claim ABI compatibility was locally tested without approval/evidence.
5. After authorized build, verify one batch fixture, allocation capacity and static/shared deployment. Compiler success, generated-noise correctness and speed are separate checks.

**node-graph**

1. Read selected-pin headers and the architecture guide. Construct nodes with `FastNoise::New<T>()`; required generator inputs such as `SetSource` must be connected before generation. Missing required sources can null-dereference.
2. Distinguish generator-source connections, optional hybrid constant/generator inputs and scalar variables. Example: Simplex source into FractalFBm using `SetSource`, then `SetOctaveCount`. Keep nodes in a compatible SIMD feature set.
3. Use `SetScale` for feature scale; generation step controls sampling resolution, not feature scale. Do not transplant old frequency-signature examples across versions.
4. Allocate the complete output grid, check dimensions/overflow and inspect the exact `GenUniformGrid2D/3D/4D`, `GenPositionArray*` or `GenTileable2D` signature at the pin. Generate from the outermost root, not an inner source. Prefer batches; do not put `GenSingle` in dense loops.
5. For encoded trees call `FastNoise::NewFromEncodedNodeTree` and test the returned node before generating. Treat externally supplied strings as data, bound input/output sizes and reject failed loads. Do not claim cross-version encoded-tree compatibility without evidence.
6. Compare known-seed fixtures for expected dimensions, finite output and algorithm-specific range assumptions; do not assert every node stays in [-1,1]. Tiling checks compare the correct wrapped sampling contract, not arbitrary adjacent values.

**determinism-or-threading**

1. Define exact byte equality versus numerical tolerance, target architectures and supported feature sets before selecting flags. Runtime SIMD dispatch can produce small floating differences by default.
2. Consider `FASTNOISE2_STRICT_FP=ON` and a consistent supported feature-set ceiling on node creation. `FastSIMD::FeatureSet::SSE2` is an x86 example, not a portable instruction set for ARM/WASM. Never force instructions unavailable on the target.
3. Sharing a tree for concurrent const generation is supported. Freeze node parameters first; do not call setters while another thread generates. Give workers separate output buffers and preserve node lifetime until all finish.
4. Test identical fixtures across the actual feature sets, builds and machines in scope. Report max error or byte equality and seed/tree revision; a flag or source claim alone does not verify cross-machine reproducibility.
5. Profile batches on the actual hardware; for 3D/4D 2D slices avoid xCount=1 where possible. Upstream benchmark figures are not a measured local speedup.

**c-api-or-binding**

1. Inspect `FastNoise_C.h`, the binding's ownership contract and the precise core commit. Distinguish opaque C handles from C++ SmartNode lifetime management.
2. Check creation failure before every dependent call; release each owned handle once after workers finish. Prefer the inspected post-release fixed commit when explicitly approved, rather than assuming all packages labeled 1.1.1 include its fixes.
3. Design bounded create/generate/delete and failed-create/null tests. Execute leak/sanitizer tests only after an approved build plan; do not mark them passing based on the commit message.
4. Inspect binding API/ABI compatibility independently and report a missing test/artifact as a blocker, not generic FastNoise2 failure.

**node-editor**

1. Separate core library readiness from editor readiness. Preview C++20, OpenGL/GLFW desktop requirements, optional shared-memory IPC and all configure downloads. WASM editor uses Emscripten SIMD/pthreads and is a distinct deployment target.
2. Obtain approval before downloads/builds, editor launch, IPC connection or writing exported configurations. For desktop IPC name the target application and data exchanged; do not connect to arbitrary running applications.
3. Design the tree, select its root, then use Copy Encoded Node Tree. Load the exact string with a compatible core version and check null before generation. Record editor/core revisions and compare an equivalent fixed-seed grid.
4. Treat desktop preview mesh/heightmaps as tools, not an automatic production terrain pipeline. Before redistributing editor binaries resolve the font and dependency-license closure in the upstream reference.

### 4. Verify and report the actual boundary

Return the selected mode, commit/release, compiler/build flags, dependency acquisition performed or skipped, fixture dimensions/seed/tree, checks actually run with exit status and remaining limits. A workflow matrix proves configured coverage, not successful runtime tests. Keep installations, configure downloads, builds, cross-app IPC and publishing behind separate scoped approvals.

## Examples

- **Core-only build plan, not executed:** pinned master `721400f9560831be2fc9790be9b72c44bee7d33f`, project version 1.1.1, official Compiling FastNoise2 wiki and root CMake: `cmake -S . -B build -DFASTNOISE2_TOOLS=OFF` then `cmake --build build --config Release`. Warn that configure can acquire FastSIMD through CPM before requesting approval; do not describe this as offline.
- **Node graph design:** against the same pinned source, create `FastNoise::Simplex`, connect it through `FastNoise::FractalFBm::SetSource`, set five octaves and batch-generate from the fractal. Source: Node Graph Architecture wiki plus selected-pin headers. Inspect the current grid signature before implementing; the wiki Home sample references an undeclared noiseOutput variable and must not be copied unchanged.
- **Exact-output request:** “FastNoise2 differs between AVX2 and SSE2.” Read the FAQ, define the equality target, propose strict FP and a supported consistent feature set, then test the real fixtures when approved. No local cross-machine equivalence was established by this skill.
- **Near miss:** “Use FastNoise Lite's single-header API” routes to FastNoise Lite, not this repository or FastNoise2 CMake options.

## Best practices

- Separate core C++17, optional C++20 editor, C API and external bindings; preserve each version contract.
- Prefer bounded batch generation, explicit source connections, successful decoded-tree checks and immutable shared trees.
- Keep hardware-specific instruction sets conditional and distinguish feature-set selection from verified deterministic output.
- The CMake version can remain unchanged across bug fixes; bind claims to the exact commit.
- Keep original encoded strings and fixtures before editing and never claim general serialization compatibility from one successful example.
- Evaluation scenarios in `evals/evals.json` are authored-not-executed, not benchmark or safety-test results.

## References

- [Pinned primary evidence, licenses and command caveats](references/upstream.md)
- [Selected-file hashes and discovery tools](references/source.json)
- [Offline preflight helper](scripts/preflight.py)
- [Authored evaluation scenarios](evals/evals.json)
- [Official repository](https://github.com/Auburn/FastNoise2)
