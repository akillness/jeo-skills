# FastNoise2: pinned upstream evidence

Observed 2026-11-01. Authored guidance only, not a build/runtime or performance result. Primary-source reads and raw-byte hashing were performed during preceding research; no upstream executable was run. The package vendors no upstream library, editor, font or dependency. The copied offline preflight checks only [source.json](source.json) entries.

## Identity, master and release

- https://lnkd.in/gW8MJtXj resolved to https://github.com/Auburn/FastNoise2 (owner Auburn; author Jordan Peck).
- Audited master `721400f9560831be2fc9790be9b72c44bee7d33f`, commit date 2026-10-22T20:03:59Z.
- Latest observed [v1.1.1 release](https://github.com/Auburn/FastNoise2/releases/tag/v1.1.1), published 2026-02-24T23:27:00Z, release commit `903c1f2d2f9d53ddce94cd223f32727d9ab3aeaa`.
- Root CMake still declares 1.1.1 on audited master. [Master commit](https://github.com/Auburn/FastNoise2/commit/721400f9560831be2fc9790be9b72c44bee7d33f) fixes C API node leaks and null/failed-create crashes after the release. Do not infer patch presence from version text alone. The commit message/source is not a locally executed leak test.

## Selected raw bytes

- [README pinned raw](https://raw.githubusercontent.com/Auburn/FastNoise2/721400f9560831be2fc9790be9b72c44bee7d33f/README.md): 6339 bytes, SHA-256 `4fb442486b116974947b56bee05b658a03e337edf8b6d361fc4bc7cacdccee53`.
- [LICENSE pinned raw](https://raw.githubusercontent.com/Auburn/FastNoise2/721400f9560831be2fc9790be9b72c44bee7d33f/LICENSE): 1068 bytes, SHA-256 `6a772f6fa13928b07693cc8643dac0284910ea031b82cba1b49e51a36616cddf`.
- Hashes are exact HTTP 200 bytes, not normalized text. Selected-file hashes do not attest Git HEAD, the whole tree, all dependencies or a release binary.

## Primary architecture/build references

- [Pinned README](https://github.com/Auburn/FastNoise2/blob/721400f9560831be2fc9790be9b72c44bee7d33f/README.md): Why Nodes, Platform Support, Performance, Node Editor, Getting Started.
- [Root CMakeLists.txt](https://github.com/Auburn/FastNoise2/blob/721400f9560831be2fc9790be9b72c44bee7d33f/CMakeLists.txt): CMake 3.10+, C++17, version 1.1.1, build options and package install/export names.
- [src/CMakeLists.txt](https://github.com/Auburn/FastNoise2/blob/721400f9560831be2fc9790be9b72c44bee7d33f/src/CMakeLists.txt): CPM acquisition of FastSIMD at `f7e9ce6fca475731c0a3c115ec29dcfd36886b2a`, FastNoise/FastNoise2 alias targets, static define, relaxed/strict floating build flags.
- [C API implementation](https://github.com/Auburn/FastNoise2/blob/721400f9560831be2fc9790be9b72c44bee7d33f/src/FastNoise/FastNoise_C.cpp) and [C API header](https://github.com/Auburn/FastNoise2/blob/721400f9560831be2fc9790be9b72c44bee7d33f/include/FastNoise/FastNoise_C.h): inspect exact ownership/null/generation signatures for the chosen binding.
- [Generator header](https://github.com/Auburn/FastNoise2/blob/721400f9560831be2fc9790be9b72c44bee7d33f/include/FastNoise/Generators/Generator.h): inspect generation API signatures at the chosen commit, not an older frequency-style example.
- [Node Editor CMake](https://github.com/Auburn/FastNoise2/blob/721400f9560831be2fc9790be9b72c44bee7d33f/tools/NodeEditor/CMakeLists.txt): C++20, dependencies, GL/GLFW or Emscripten application, FreeType and font integration, SIMD/pthreads WASM flags.
- [NodeEditorIpc CMake](https://github.com/Auburn/FastNoise2/blob/721400f9560831be2fc9790be9b72c44bee7d33f/tools/NodeEditorIpc/CMakeLists.txt): optional shared-memory IPC component; rt linkage on Linux.

This is a CPU SIMD noise library: node generators/operators/modifiers are evaluated in a fused SIMD pipeline, not a GPU shader engine. Supports basic and cellular coherent noise, fractals, domain warping, encoded node graphs, 2D/3D/4D generation and 2D tiling. It does not itself provide a production terrain renderer or guarantee mesh quality.

## Wiki guides: observed but not revision-pinned

These first-party wiki URLs were read on the observation date; wiki text can drift independently of the pinned source.

- [Compiling FastNoise2](https://github.com/Auburn/FastNoise2/wiki/Compiling-FastNoise2): CMake options, ClangCL recommendation, build commands.
- [Including the library](https://github.com/Auburn/FastNoise2/wiki/Including-the-library-in-your-project): source-tree/manual Visual Studio integration; some stale identifiers listed below.
- [Node Graph Architecture](https://github.com/Auburn/FastNoise2/wiki/Node-Graph-Architecture): required/hybrid/scalar inputs, root evaluation, feature sets, metadata and serialization.
- [FAQ](https://github.com/Auburn/FastNoise2/wiki/FAQ): static define, strict FP, feature scale versus frequency, thread-safety and batch APIs.
- [Wiki Home](https://github.com/Auburn/FastNoise2/wiki): quick start declares noise but later accesses noiseOutput; adapt rather than copy this typo.
- [Web Node Editor](https://auburn.github.io/FastNoise2/): release page identifies this as the current release-updating URL. Older wiki alternative fastnoise2nodeeditor URL is not a verified equivalent in this audit.

## Commands and integration, not executed

Official compiling wiki recipe, with core-only tools setting:

```sh
cmake -S . -B build -DFASTNOISE2_TOOLS=OFF
cmake --build build --config Release
```

Windows ClangCL recipe:

```sh
cmake -S . -B build -T ClangCL
```

Configure can acquire dependencies through CPM even without building. Obtain approval for network/cache/output paths first; core-only does not mean dependency-free. In a single-config build, preview CMAKE_BUILD_TYPE=Release explicitly where needed rather than assuming --config changes it.

Root options: FASTNOISE2_TOOLS defaults ON standalone/OFF subproject; FASTNOISE2_TESTS and FASTNOISE2_UTILITY default OFF; FASTNOISE2_STRICT_FP defaults OFF. Shared libraries use BUILD_SHARED_LIBS; the project does not enable it by default.

Source-tree integration:

```cmake
set(FASTNOISE2_TOOLS OFF CACHE BOOL "" FORCE)
add_subdirectory(deps/FastNoise2)
target_link_libraries(your_project PRIVATE FastNoise)
```

Include `<FastNoise/FastNoise.h>`. Manual static consumers require FASTNOISE_STATIC_LIB; current CMake propagates it automatically. Wiki examples using FASTNOISE2_NOISETOOL and installed find_package(FastNoise CONFIG REQUIRED) conflict with current source. Root CMake installs a FastNoise2 package and FastNoise2:: namespace, so the source-derived installed recipe is:

```cmake
find_package(FastNoise2 CONFIG REQUIRED)
target_link_libraries(your_project PRIVATE FastNoise2::FastNoise)
```

That installed recipe was not build-tested; inspect the actual installed config and target exports before claiming it works. Never present stale wiki text as the source contract.

## Platforms, determinism and operational limits

- README claims scalar, SSE2, SSE4.1, AVX2, AVX512, NEON and WASM SIMD with runtime selection; 32/64-bit Windows/Linux/Android/macOS Intel and ARM/iOS, MSVC/Clang/GCC/Emscripten.
- [Configured CI](https://github.com/Auburn/FastNoise2/blob/721400f9560831be2fc9790be9b72c44bee7d33f/.github/workflows/main.yml) covers Windows Win32/x64 MSVC, x64 ClangCL, Linux GCC/Clang, Intel/ARM macOS, Emscripten 4.0.21. Android/iOS support was not independently tested or exercised in this inspected workflow. Configured coverage is not observed build success.
- Upstream explicitly warns MSVC SIMD compiler bugs may yield incorrect generation and recommends ClangCL. ABI compatibility/performance claims were not locally measured.
- Default floating output can differ slightly by SIMD level. Define tolerance/exact-equality contract; consider strict FP and a common supported feature set, then test actual cross-machine fixtures. An SSE2 example is not valid instruction-set selection for ARM/WASM.
- Required SetSource inputs must be connected; missing ones may null-dereference. Check NewFromEncodedNodeTree result before generation. Call generation on the outermost/root node.
- Const generation is documented as thread-safe on shared trees; setters during generation are unsafe. Use separate output buffers and keep nodes alive through worker completion.
- Feature scale (SetScale) is inverse frequency and separate from sampling step. GenSingle underuses SIMD; use batch generation. In 3D/4D slices, avoid xCount=1 where practical.
- Upstream performance comparison used Intel 7820X at 4.9GHz, Windows 10 x64, clang-cl 10 /O2. Treat its numbers as upstream benchmark claims, not a promised speedup on another CPU.
- Desktop Node Editor adds OpenGL/GLFW and C++20. Emscripten editor uses SIMD/pthreads and separate browser deployment constraints. IPC is an external application data exchange requiring explicit scope.

## Full root license and component conditions

[Pinned root LICENSE](https://github.com/Auburn/FastNoise2/blob/721400f9560831be2fc9790be9b72c44bee7d33f/LICENSE), copyright 2020 Jordan Peck, was read in full: MIT permits use, copy, modification, merge, publication, distribution, sublicense and sale including commercial use. Copies/substantial portions retain copyright and permission notice. Software is AS IS, with no express/implied merchantability, fitness or noninfringement warranty; authors disclaim use-related claims/damages/liability. No noncommercial or source-disclosure restriction occurs in that text.

Core/build components:

- [FastSIMD LICENSE at exact dependency commit](https://raw.githubusercontent.com/Auburn/FastSIMD/f7e9ce6fca475731c0a3c115ec29dcfd36886b2a/LICENSE): MIT, Jordan Peck, same notice-retention/disclaimer conditions.
- [Embedded CPM.cmake notice](https://github.com/Auburn/FastNoise2/blob/721400f9560831be2fc9790be9b72c44bee7d33f/cmake/CPM.cmake#L5): MIT, Lars Melchior and contributors.

Editor dependencies were read from the pinned Node Editor CMake and corresponding root license files:

- [Corrade e716388 COPYING](https://raw.githubusercontent.com/mosra/corrade/e716388dd792d90d08b0936d460f6ccdb34150de/COPYING), [Magnum 179a682 COPYING](https://raw.githubusercontent.com/mosra/magnum/179a68229f57bd0f833dad30647f2988fd8d8966/COPYING), [Magnum Integration 354f129 COPYING](https://raw.githubusercontent.com/mosra/magnum-integration/354f1295b91b14f86edd18b1574567d83cad5704/COPYING): MIT, Vladimír Vondruš and contributors.
- [ImGui v1.90.1-docking LICENSE.txt](https://raw.githubusercontent.com/ocornut/imgui/v1.90.1-docking/LICENSE.txt): MIT, Omar Cornut.
- [Auburn/imnodes db2ef11 LICENSE.md](https://raw.githubusercontent.com/Auburn/imnodes/db2ef1192a4ddff32a838094de7127142a731ef0/LICENSE.md): MIT, Johann Muszynski.
- [robin-hood-hashing 3.11.5 LICENSE](https://raw.githubusercontent.com/martinus/robin-hood-hashing/3.11.5/LICENSE): MIT, Martin Ankerl.
- [GLFW 3.4 LICENSE.md](https://raw.githubusercontent.com/glfw/glfw/3.4/LICENSE.md): zlib-style. Preserve notice in source distributions; do not misrepresent original authorship; plainly mark altered sources. Product acknowledgment is appreciated, not required. AS IS warranty/liability disclaimer applies.
- FreeType VER-2-14-1: [LICENSE.TXT](https://raw.githubusercontent.com/freetype/freetype/VER-2-14-1/LICENSE.TXT) and [complete FTL.TXT](https://raw.githubusercontent.com/freetype/freetype/VER-2-14-1/docs/FTL.TXT) were read from the project GitHub mirror after GitLab returned an Anubis challenge. Choose FTL OR GPLv2-or-later; this audit read the FTL route in full, not a separate full GPL analysis. FTL source redistribution retains FTL and copyright and documents modifications; binary documentation acknowledges FreeType; promotional use of the other party's name needs prior written permission; warranty/liability disclaimers apply. LICENSE identifies additional BDF/PCF X-style, bundled gzip zlib and HarfBuzz-derived Old MIT files; their complete transitive closure was not audited.
- [resources.conf](https://github.com/Auburn/FastNoise2/blob/721400f9560831be2fc9790be9b72c44bee7d33f/tools/NodeEditor/resources/resources.conf) embeds ImGui's misc/fonts/DroidSans.ttf. Attempted DroidSans.txt and README.txt in that pinned font directory returned 404. Exact item-level font terms remain unresolved here. Do not claim complete editor redistribution clearance or MIT-only licensing.

## Completion limits

No dependency install, configure/build, editor/IPC launch, C API leak test, batch-generation run, cross-machine determinism check or benchmark was performed. Evaluation scenarios are authored-not-executed. Offline preflight execution, if later permitted, remains selected-file/provenance evidence only; it cannot close the build, font-license, transitive-distribution or runtime gaps.
