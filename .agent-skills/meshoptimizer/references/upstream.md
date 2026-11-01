# meshoptimizer: pinned upstream evidence

Observed 2026-11-01. This is an authored operator reference, not an executed build or performance report. Network reads and SHA-256 calculation were performed in the preceding research; no upstream executable was run. This package vendors no upstream implementation. The offline helper checks only the files listed in [source.json](source.json).

## Identity and revision

- LinkedIn shortlink https://lnkd.in/gUwa-rvV resolved to the canonical https://github.com/zeux/meshoptimizer (owner zeux; author Arseny Kapoulkine).
- Audited master: `f0a684f11ead064e176775c9b796f82a55910e92`, commit time 2026-10-14T17:27:14Z.
- Latest release observed: [v1.3](https://github.com/zeux/meshoptimizer/releases/tag/v1.3), published 2026-09-25T15:36:13Z, release-page commit `9e1f07b159d3cb777f1c67ed31fc11fd117986f4`.
- CMake declares 1.3; js/package.json declares 1.3.0. These do not prove registry availability or identical master/release behavior.
- The master commit adds experimental Gaussian Splatting support to gltfpack after v1.3. Do not attribute that feature to the release.

## Selected bytes and primary links

- [README pinned raw](https://raw.githubusercontent.com/zeux/meshoptimizer/f0a684f11ead064e176775c9b796f82a55910e92/README.md): 107230 bytes, SHA-256 `69dee313d6982ef86199c0e8cb0f5ad9aca683bf2250418a872fcbbcc00d514b`.
- [LICENSE.md pinned raw](https://raw.githubusercontent.com/zeux/meshoptimizer/f0a684f11ead064e176775c9b796f82a55910e92/LICENSE.md): 1079 bytes, SHA-256 `f03037ca7bad1e3eb7f4a63fa6084a8baabd5ba30d3c239a9a7f35705d873e26`.
- Hashes were calculated from HTTP 200 raw response bytes without newline normalization. They are selected-file provenance, not a whole-revision attestation.
- [README file](https://github.com/zeux/meshoptimizer/blob/f0a684f11ead064e176775c9b796f82a55910e92/README.md): Purpose, Installing, Building, Core pipeline, Versioning and compatibility, Simplification, Memory management, Experimental APIs, License.
- [CMakeLists.txt](https://github.com/zeux/meshoptimizer/blob/f0a684f11ead064e176775c9b796f82a55910e92/CMakeLists.txt): `project`, SOURCES, CXX_STANDARD, shared/stable-export options, optional texture components, installed meshoptimizer:: namespace.
- [Public API header](https://github.com/zeux/meshoptimizer/blob/f0a684f11ead064e176775c9b796f82a55910e92/src/meshoptimizer.h): inspect the exact selected API signature and parameter contract before generating calls.
- [JS README](https://github.com/zeux/meshoptimizer/blob/f0a684f11ead064e176775c9b796f82a55910e92/js/README.md): Structure, Decoder, Encoder, Simplifier, Clusterizer, Tangents.
- [JS package](https://github.com/zeux/meshoptimizer/blob/f0a684f11ead064e176775c9b796f82a55910e92/js/package.json): package source version and exports.
- [gltfpack README](https://github.com/zeux/meshoptimizer/blob/f0a684f11ead064e176775c9b796f82a55910e92/gltf/README.md): Usage, Decompression, Options, Extensions, Custom data, Gaussian Splatting, Building.

## Architecture and platform evidence

The library is CPU-side C++ code with a C-compatible header, not a renderer. CMake sets C++11 and requires CMake 3.5+. Selected algorithm source files can be compiled directly. The JS/WASM modules expose only parts of the native functionality; check supported and await ready. The decoder has scalar/SIMD implementations and a CommonJS alternative; these are deployment-specific choices.

[Configured build workflow](https://github.com/zeux/meshoptimizer/blob/f0a684f11ead064e176775c9b796f82a55910e92/.github/workflows/build.yml) includes Ubuntu, Ubuntu ARM, Clang, macOS, Windows Win32/x64/ARM64; JS job Node 16, gltfpack JS Node 18 and WASI SDK 32. This is configured coverage, not an observed green run, minimum-version guarantee or local readiness check. README's all-major-compilers language and throughput figures remain upstream claims.

## Commands, none executed by package authoring

Upstream Installing documents:

```sh
git clone -b v1.3 https://github.com/zeux/meshoptimizer.git
```

Source-derived core build recipe, to execute only after approval in the selected checkout:

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
```

Options inspected: MESHOPT_BUILD_DEMO=OFF, MESHOPT_BUILD_GLTFPACK=OFF, MESHOPT_BUILD_SHARED_LIBS=OFF, MESHOPT_STABLE_EXPORTS=OFF, MESHOPT_INSTALL=ON. An install step changes the chosen prefix and needs separate permission. Installed CMake target namespace is meshoptimizer::.

Pinned gltfpack README Usage/Options documents:

```sh
gltfpack -i scene.gltf -o scene.optimized.glb
gltfpack -h
```

Full native texture build from the pinned Building section:

```sh
git clone -b gltfpack https://github.com/zeux/basis_universal
git clone https://github.com/webmproject/libwebp
cmake . -DMESHOPT_BUILD_GLTFPACK=ON -DMESHOPT_GLTFPACK_BASISU_PATH=basis_universal -DMESHOPT_GLTFPACK_LIBWEBP_PATH=libwebp -DCMAKE_BUILD_TYPE=Release
cmake --build . --target gltfpack --config Release
```

Those documented dependency clones use moving refs and create files; pin and approve them before a reproducible build. Native binaries support texture compression and larger input files compared with npm gltfpack, per upstream. No package download or native build was tested here.

## API constraints and verification anchors

- README Core pipeline, L36 onward: remap/index first, cache optimization, optional overdraw, fetch optimization, quantization, filtering, optional shadow indexing. Freeze draw subsets before reordering.
- Indexing, L64: remap compares binary vertices including padding. Zero padding; attribute tolerance needs deliberate quantization or custom remap comparison.
- Overdraw, around L100-110: target-dependent benefit; tiled mobile renderers may not benefit. Measure the vertex-cache tradeoff.
- Compression, L417/L447: vertex codec itself is lossless, quantization/filters are not; triangle codec can rotate triangles. Check provoking-vertex requirements before selecting index-buffer versus sequence encoding.
- Versioning, L533: release compatibility guarantees explicitly exclude development branch. Vertex format v1 needs v0.23+; index v1 needs v0.14+. Pin encoding versions where required; round-trip with the actual target decoder.
- Simplification, L567 onward: seams/topology may prevent reaching target count; sloppy mode loses seams/borders; materials need separate handling. Verify actual counts, attributes, material IDs, boundaries and rendered quality instead of equating target with result.
- Memory management, L971: custom allocators must throw/abort on OOM; null returns are unsupported. Allocator cache does not support setjmp/longjmp recovery. Decoders use caller buffers without allocation.
- Experimental APIs, L999 onward: stable API/ABI does not imply byte-identical outputs; experimental interfaces/semantics may change or disappear.
- JS Structure/Decoder: supported and ready checks, target byte capacity, stride/filter agreement and malformed-data rejection are separate from glTF-loader setup.
- gltfpack Extensions/Custom data: unsupported vendor/custom extensions and unknown attributes are discarded; extras normally removed except documented retained data. -kn/-km/-ke help specific preservation cases, not arbitrary custom semantics.
- gltfpack changes geometry, nodes and animation through merging/pruning/quantization/resampling. Keep input immutable and output distinct; compare semantic inventory before approved replacement. Draco and several interactive extensions are unsupported.
- Loader docs mention quantization support in Three.js r111+/Babylon.js 4.1+ and EXT_meshopt compression in Three.js r122+ with setMeshoptDecoder/Babylon.js 5.0+. These are upstream historical support claims, not tests of current installed consumers.

## License conditions and unresolved closure

[Full root MIT](https://github.com/zeux/meshoptimizer/blob/f0a684f11ead064e176775c9b796f82a55910e92/LICENSE.md), copyright 2016-2026 Arseny Kapoulkine, was read in full. It grants free use, copy, modify, merge, publish, distribute, sublicense and sell rights including commercial use; copies/substantial portions must include the copyright and permission notice. Software is AS IS without express/implied warranty including merchantability, fitness and noninfringement; authors disclaim claims/damages/liability arising from use. No noncommercial or source-disclosure condition appears in the root text. README License additionally requests user-facing docs/credits attribution; a short credit alone is not the complete notice.

Bundled notices inspected:

- [cgltf.h](https://github.com/zeux/meshoptimizer/blob/f0a684f11ead064e176775c9b796f82a55910e92/extern/cgltf.h#L7219): Johannes Kuhlmann MIT; embedded jsmn MIT, Serge A. Zaitsev around L6879, also needs its notice.
- [fast_obj.h](https://github.com/zeux/meshoptimizer/blob/f0a684f11ead064e176775c9b796f82a55910e92/extern/fast_obj.h#L1): Richard Knight MIT; source version 1.3.
- [micro_ply.h](https://github.com/zeux/meshoptimizer/blob/f0a684f11ead064e176775c9b796f82a55910e92/extern/micro_ply.h#L515): choose MIT (Nick Klingensmith) OR Unlicense/public-domain dedication with warranty disclaimer.
- [sdefl.h](https://github.com/zeux/meshoptimizer/blob/f0a684f11ead064e176775c9b796f82a55910e92/extern/sdefl.h#L72): choose MIT (Micha Mettke) OR Unlicense/public-domain dedication with disclaimer.
- [Optional Basis Universal LICENSE](https://raw.githubusercontent.com/zeux/basis_universal/gltfpack/LICENSE): full Apache-2.0 read. Redistribution requires the license, notices, modified-file notices and applicable NOTICE attribution; includes limited patent grant and patent-litigation termination, no trademark grant, warranty/liability disclaimers. The branch URL is moving, not a hashed dependency pin.
- [Optional libwebp 1.6.0 COPYING](https://raw.githubusercontent.com/webmproject/libwebp/1.6.0/COPYING): BSD-3-Clause. Retain notices/conditions/disclaimer in source and binary distribution materials; no Google/contributor endorsement without permission; warranty/liability disclaimers.

Optional dependency internal third-party closure and sample assets were not exhaustively audited. This is not legal clearance of a full binary bundle. No source code or sample asset was copied into this operator package.

## Scope of completion

Evidence-backed documentation and two selected raw hashes only. No install, compilation, runtime, GPU, codec round-trip, rendering, asset conversion or benchmark was executed. Future runs must bind commands and results to their actual revision, input and environment. GitHub API later returned 403 during research; meshoptimizer release SHA was recovered from its primary release page, not guessed.
