---
name: meshoptimizer
description: >
  Operate zeux/meshoptimizer for source-pinned native or JavaScript/WASM integration, meshopt simplification, meshlets and codecs, or preservation-aware gltfpack conversion. Use when the request names meshoptimizer, meshopt APIs, gltfpack, MeshoptDecoder or EXT/KHR_meshopt_compression. Route generic mesh modeling, unrelated compressors and Three.js gameplay to their own tools; this is not a renderer or general game-development guide.
allowed-tools: Read Bash Write Edit
compatibility: Source-grounded operator guidance; offline preflight does not install dependencies or verify builds, runtime behavior, assets or performance.
metadata:
  version: "1.0.0"
  source: "https://github.com/zeux/meshoptimizer"
  upstream_commit: "f0a684f11ead064e176775c9b796f82a55910e92"
---

# meshoptimizer

## When to use this skill

- Inspect or integrate the named meshoptimizer C/C++ library, its meshopt APIs or JavaScript modules.
- Choose a meshopt optimization, simplification, codec or meshlet workflow against a known asset and renderer contract.
- Convert an asset with gltfpack while preserving approved scene semantics and loader compatibility.
- Diagnose a MeshoptDecoder or EXT/KHR_meshopt_compression integration using the actual encoded format and loader version.
- For Blender modeling, Draco-only work, generic engine rendering or Three.js gameplay without meshoptimizer, route to the owning tool instead. Rust meshopt and other external bindings require their own version/license inspection.

## Instructions

### 1. Select one bounded mode and freeze the evidence

Choose exactly one primary mode: **inspect-source**, **native-integration**, **js-decoder**, **optimize-or-simplify**, **meshlets-or-codecs**, or **gltfpack-conversion**. Record input artifact, upstream revision, existing toolchain/loader versions, permitted output directory and acceptance checks before proceeding. Do not silently upgrade a project or switch a release to master.

Read this installed skill's relative `references/source.json` for selected-file hashes and `references/upstream.md` for pinned sources, license scope, commands and release differences. Resolve these paths and `scripts/preflight.py` relative to the directory containing this SKILL.md, never relative to an assumed repository root.

**Helper host prerequisite:** Before running the helper, use a POSIX Python environment with `os.O_NOFOLLOW` and `os.open` support for `dir_fd`. Native Windows may fail closed with `secure_posix_traversal_unavailable`; preserve these safety guards. Windows users can retry in a WSL environment that supports these features or manually compare the original manifest-listed source files against the pinned evidence. Neither this guidance nor a manual comparison verifies helper execution or runtime behavior; report those as unverified.

When execution of the offline helper is authorized, from the installed skill directory use:

```sh
python3 -B scripts/preflight.py --json
python3 -B scripts/preflight.py --json --repo /absolute/nonsymlink/upstream-checkout
```

The helper performs no network access and never executes upstream code. Without `--repo`, no source was checked. With it, only listed file bytes are compared: `whole_revision_verified=false`, `runtime_verified=false` and `tool_versions_verified=false` remain true limitations. Missing discovered tools do not prove installation failure; exit 0 does not prove Git HEAD, a compiler or renderer works. Stop on mismatched evidence before using the pin as verified.

### 2. Inspect source and preserve the license boundary

The audited master pin is `f0a684f11ead064e176775c9b796f82a55910e92`; release v1.3 is a different commit. Read the actual source signatures for the chosen pin, not a current search snippet. Native code is C++11, with a C-compatible header; it runs mesh processing on the CPU, not GPU rendering. CMake requires 3.5+; the JS source package declares 1.3.0 but registry delivery was not verified.

Read the full pinned MIT license and retain its copyright/permission/warranty notice when distributing substantial portions. For gltfpack or bundled sources, include applicable cgltf/jsmn, fast_obj, micro_ply and sdefl notices. Optional Basis Universal and libwebp add Apache-2.0 and BSD conditions. Sample assets and dependency closure are not automatically cleared by root MIT. See the relative upstream reference before redistribution.

### 3. Follow only the selected mode

**native-integration**

1. Inspect the project's build and existing library revision. Choose CMake or explicit source-file integration; include `meshoptimizer.h` and compile only necessary C++ algorithm files where appropriate.
2. Preview build paths and flags. Approve dependency acquisition, configuration/build and project writes separately; run only the approved step. CMake defaults to a static library. Shared builds use `MESHOPT_BUILD_SHARED_LIBS`; `MESHOPT_STABLE_EXPORTS` excludes unstable exports.
3. For a representative fixture, record compiler/configuration, API call and output geometry checks. Compile/link success is distinct from rendered correctness and performance.

**js-decoder**

1. Confirm the asset extension, loader and installed meshoptimizer version. Inspect `js/README.md` and declarations for that exact revision.
2. Check `MeshoptDecoder.supported`; await `MeshoptDecoder.ready` before direct decoding. For Three.js glTF, supply it with `GLTFLoader.setMeshoptDecoder` before load. Do not confuse loader setup with direct codec initialization.
3. Validate count/stride and target capacity: target bytes are count multiplied by stride; vertex stride is divisible by four, index stride is two or four. Match any filter to the encoded stream.
4. Test one known encoded fixture and a malformed fixture with bounded buffers. Capture actual errors rather than asserting every glTF is supported. WASM/module/CSP/worker compatibility belongs to the real deployment environment.

**optimize-or-simplify**

1. Freeze material/draw subsets, vertex layout, attribute semantics, padding and topology. Zero padding for binary-equivalence remapping; weld appropriate duplicates without discarding required seams.
2. Apply the documented order: indexing/remap, vertex-cache optimization, optional overdraw, vertex-fetch optimization, quantization, index filtering, optional shadow indexing. Inspect corresponding `meshopt_generateVertexRemap`, remap-buffer and optimization signatures before composing calls.
3. Measure overdraw optimization on the target GPU: it may be unhelpful on tiled mobile renderers and trades vertex-cache efficiency against overdraw.
4. Choose `meshopt_simplify`, attribute-aware variants or permissive mode with explicit locks/weights; reserve `meshopt_simplifySloppy` for approved seam/border quality loss. A triangle target is not guaranteed. Material boundaries need independent subsets or protected attributes/seams.
5. Compare actual triangle counts, reported error, bounds, seams, winding, normals/UVs, material assignments and representative rendered views against baseline. Report quality changes before any overwrite.

**meshlets-or-codecs**

1. Freeze renderer meshlet limits, data layout and format versions. Inspect `meshopt_buildMeshlets` and related signatures/limits at the selected pin; do not transplant proprietary index constraints into a generic renderer.
2. Prepare cache/fetch-optimized and appropriately quantized input. Vertex codec alone is lossless, while quantization/filters are lossy. Triangle codec can rotate triangles and change the provoking vertex; exact index-order uses need the appropriate sequence codec.
3. Pin encoding versions when decoder compatibility matters. Release format guarantees do not cover the development branch. Experimental APIs can change signatures or behavior; even stable algorithms need not produce identical output bytes.
4. Verify round trips using the actual target decoder, expected attributes and corruption rejection. Track encoded size and decoded-memory footprint separately; upstream throughput figures are not your benchmark.

**gltfpack-conversion**

1. Inventory nodes, materials, animation, extras, custom attributes/extensions and all referenced assets. Record consumer support for quantization, meshopt compression and optional texture extensions.
2. Treat conversion as potentially destructive even if input bytes remain unchanged: gltfpack merges/prunes/reorders, quantizes and resamples; it discards unknown extensions/attributes and much extras data. Never use the input path as output. Obtain approval for semantic loss and the explicit output path.
3. Preview options: `-kn` retains named nodes, `-km` named materials, `-ke` supported extras, `-noq` disables quantization. These do not guarantee arbitrary custom-data retention. Draco and several interactive-scene extensions are unsupported.
4. Run only an approved conversion to a new file. `-c`/`-cc` require meshopt-capable loaders; `-tc`/`-tw` require texture extension support and native texture dependencies. Check actual help/version before applying newer master flags.
5. Validate output parsing, referenced files, loader behavior, preservation inventory and representative animation/rendered comparisons. Report omitted data explicitly. Keep the original and output separate until approved replacement.

### 4. Close with evidence, not an inferred success

Return the chosen mode, exact revision/version, commands actually run with exit status, source checks, preservation/compatibility findings and remaining blockers. For a benchmark include the dataset, hardware, compiler/build flags and baseline. Build success alone proves neither visual fidelity nor a speedup. Obtain separate approval for installs, builds, dependency downloads, asset overwrite, redistribution or publishing.

## Examples

- **Release acquisition, documentation only:** upstream README Installing documents `git clone -b v1.3 https://github.com/zeux/meshoptimizer.git`. Source: pinned README at `f0a684f11ead064e176775c9b796f82a55910e92`; v1.3 release commit is `9e1f07b159d3cb777f1c67ed31fc11fd117986f4`. This is a network/write operation and is not executed by loading this skill.
- **Preservation-aware conversion:** `gltfpack -i scene.gltf -o scene.optimized.glb -kn -km -ke` is a recipe using flags documented in pinned `gltf/README.md`, not a tested artifact. Source snapshot: master `f0a684f11ead064e176775c9b796f82a55910e92`, CMake 1.3. Explain discarded unknown extensions and quantization before approval; keep input untouched and compare the output inventory.
- **Decoder setup:** for an existing project using JS package source version 1.3.0, inspect the pinned `js/README.md`, await decoder readiness for direct calls and configure the actual glTF loader. A loader release mentioned by README is a historical minimum claim, not verification of the project's installed release.
- **Near miss:** “Make my Blender terrain prettier” without meshopt work routes to the modeling owner, not this library.

## Best practices

- Keep native library, JS module, gltfpack and external bindings distinct while using one exact-project entry point.
- Preserve source assets, output paths, material boundaries and the target renderer's compatibility contract.
- Allocators must throw/abort on OOM; returning null is unsupported. Allocator cache and setjmp/longjmp error handling cannot be combined.
- Separate selected-file hash matches, revision identity, build results, visual checks and measured performance.
- The evaluated master contains experimental Gaussian Splatting changes after v1.3; never attribute these to the release.
- Evaluation prompts in `evals/evals.json` are authored-not-executed test designs, not passing results.

## References

- [Pinned upstream evidence and command caveats](references/upstream.md)
- [Machine-readable selected-file source pin](references/source.json)
- [Offline preflight helper](scripts/preflight.py)
- [Authored evaluation scenarios](evals/evals.json)
- [Official repository](https://github.com/zeux/meshoptimizer)
