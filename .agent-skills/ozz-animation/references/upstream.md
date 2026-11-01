# ozz-animation: pinned upstream evidence

Observed 2026-11-01. Research was read-only. This package is operating guidance, not a library/tool/SDK install or a runtime qualification.

## Identity and release boundary

- LinkedIn shortlink https://lnkd.in/gK4ppdqr resolved to https://github.com/guillaumeblanc/ozz-animation (owner guillaumeblanc; Guillaume Blanc copyright).
- Audited master revision: 744eb9d99f606eda849acb0b1204f7a3dc20bca1; commit timestamp 2026-08-01T21:18:57Z.
- Latest release API reported tag 0.17.0, published 2026-08-01T21:35:03Z: [release](https://github.com/guillaumeblanc/ozz-animation/releases/tag/0.17.0). The master observation and release metadata are separate evidence; no moving-branch checkout is silently accepted as the release.
- [Pinned README](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/README.md); SHA-256 d232578af20d80e38c74d2bcec5641f058f8be343a87b35c1c6ad6180a5a887a.
- [Actual root LICENSE.md](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/LICENSE.md); SHA-256 3ddd93e9888fe70b9d61675ceb1c4278a579dc67171678f015de114efe815852.
- [Machine-readable selected-file manifest](source.json). Hashes bind selected file bytes, not Git HEAD, an archive, or all dependencies. No local upstream checkout is bundled.

## Architecture and versioned APIs

[Runtime documentation](https://guillaumeblanc.github.io/ozz-animation/documentation/animation_runtime/) describes immutable runtime Skeleton/Animation data; raw editable offline structures are converted by builders, or runtime structures are deserialized from streams. Caller-owned jobs process supplied inputs/outputs: SamplingJob plus SamplingJob::Context produces local SoA transforms, BlendingJob combines compatible poses, LocalToModelJob creates model-space AoS matrices. Rendering, skinning-buffer upload and worker synchronization remain the integrator's responsibility.

- Runtime libraries: ozz_base, ozz_animation, ozz_geometry. Offline libraries supply builders/optimizers and custom-importer support; optional tools use extra dependencies.
- [Skeleton declaration](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/include/ozz/animation/runtime/skeleton.h#L71): kMaxJoints=1024, kMaxSoAJoints=(kMaxJoints+3)/4. Do not promise unlimited rigs.
- [Pinned changelog](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/CHANGES.md): 0.15 changed serialized animations and requires rebuilding them; 0.16 changed importer JSON; 0.17 fixes IK/math issues and updates TinyGLTF 2.9. Do not mix tool/runtime generations.
- [Features](https://guillaumeblanc.github.io/ozz-animation/documentation/features/): retargeting and dual-quaternion skinning are planned, not implemented promises. Backward/seek optimization arrived in 0.15; older paragraphs about unoptimized backward sampling are historical context, not current blanket limitations.
- [glTF importer source](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/src/animation/offline/gltf/gltf2ozz.cc) defines TINYGLTF_NO_STB_IMAGE, TINYGLTF_NO_STB_IMAGE_WRITE and TINYGLTF_NO_EXTERNAL_IMAGE. Animation/skeleton import is not general textured-scene import.
- [Schema](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/src/animation/offline/tools/reference.json) owns exact importer option nesting. Website snippets include older schema/naming; prefer this revision.

## Supported scope, not runtime proof

README reports testing on Windows, Linux, macOS and WebAssembly for x86/x86-64/ARM. Runtime depends on C++17 and C/C++ standard libraries, without OS-specific runtime code. [OS support page](https://guillaumeblanc.github.io/ozz-animation/documentation/features/#os-support) labels Android, iOS and Nintendo Switch unofficial. Do not promote portability claims to tested support on an unobserved target.

Pinned build configuration and workflows are evidence of intended coverage, not successful runs performed here:
- [CMakeLists](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/CMakeLists.txt#L1): CMake 3.30, version 0.17.0; tool/sample/howto/test defaults ON, BUILD_SHARED_LIBS OFF.
- [Compiler settings](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/build-utils/cmake/compiler_settings.cmake): C++17 default and required standard.
- [Linux CI](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/.github/workflows/linux.yml), [macOS CI](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/.github/workflows/macos.yml), [Windows CI](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/.github/workflows/windows.yml), [Wasm CI](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/.github/workflows/wasm.yml). Linux matrix includes GCC 12/13/14 and Clang 16/17/18; Windows covers Win32/x64; Wasm calls em-build.sh. None was run for this package.

## Commands and integration, not executed here

[Official build guide](https://guillaumeblanc.github.io/ozz-animation/documentation/build/) documents:

```sh
git clone https://github.com/guillaumeblanc/ozz-animation.git
mkdir build
cd build
cmake ..
cmake --build ./
ctest --build-config Release
cmake --build ./ --target BUILD_FUSE_ALL
```

Cloning, builds and generated fused sources require approved network/output actions. Prefer an approved pinned source directory. Website prose says tests default OFF, but pinned root CMake L23 sets ON. Explicitly choose options rather than copying that stale default.

Derived runtime-only configuration, to be reviewed and approved rather than auto-run:

```sh
cmake -S . -B build -Dozz_build_tools=OFF -Dozz_build_samples=OFF -Dozz_build_howtos=OFF -Dozz_build_tests=OFF
cmake --build build --config Release
```

Official CMake subproject integration:

```cmake
add_subdirectory("path/to/ozz" "ozz-animation")
target_link_libraries(app PRIVATE ozz_animation)
```

Manual prebuilt use requires include/ and dependent libraries, such as ozz_animation and ozz_base. Shared builds and MSVC runtime options must match the application. [glTF CMake target](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/src/animation/offline/gltf/CMakeLists.txt) links gltf2ozz to ozz_animation_tools; do not copy outdated library target names from website prose.

[Toolset guide](https://guillaumeblanc.github.io/ozz-animation/documentation/toolset/) documents fbx2ozz --file="source.fbx" --config_file="config.json" and equivalent gltf2ozz --file="source.gltf" --config_file="config.json". Configuration can select clips, skeleton reuse, optimization and root-motion extraction. Conversion writes files, so freeze destination/overwrite scope first. OBJ/Collada/3DS/DXF support is mediated by optional FBX SDK, not independent native runtime loaders.

Root CMake L54-74 uses find_package(Fbx 2020), and disables FBX tools if the SDK is absent. [Autodesk official SDK page](https://aps.autodesk.com/developer/overview/fbx-sdk) says the free SDK is subject to its accompanying EULA. Exact accompanying EULA was not obtained; full SDK redistribution rights remain unresolved. Existing CI contains SDK download/install actions: they are not permission to execute them or accept terms.

## Full-license review and component boundaries

Root MIT was read in full: grants use, copy, modification, merge, publication, distribution, sublicensing and selling; requires the copyright and permission notice in copies/substantial portions; provides AS-IS/no-warranty and author-liability disclaimer. No extra root-use restriction was found. It does not relicense third-party code/assets.

- [GLFW license](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/extern/glfw/LICENSE.md): zlib-style, no origin misrepresentation, mark altered source and retain notice; acknowledgment appreciated, not mandatory.
- [gtest COPYING](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/extern/gtest/COPYING): BSD-3-Clause; retain source notices/disclaimer, reproduce in binary materials, no Google/contributor-name endorsement without permission.
- [JsonCpp license](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/extern/jsoncpp/LICENSE): public-domain dedication where recognized, MIT fallback/choice elsewhere. Preserve MIT notices when using that branch.
- [TinyGLTF header](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/src/animation/offline/gltf/extern/tiny_gltf.h): MIT at header; embedded base64 at approximately L2273 uses zlib-style origin/change/notice terms; URI-decoding DLIB fragment around L2416 uses Boost-1.0, requiring full notices except solely machine-executable object forms.
- [nlohmann JSON 3.11.3 header](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/src/animation/offline/gltf/extern/json.hpp): MIT SPDX notices and an explicitly Apache-2.0-attributed Abseil fragment. Keep embedded notices; not all importer lines have a single sole MIT origin.
- Optional Autodesk FBX SDK has separate terms, not the root MIT grant. No SDK was installed, accepted or cleared here.

Sample-media evidence is asset-specific:
- [Quaternius README](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/media/fbx/quaternius/README.md): original CC0; author granted project-license redistribution for the standard free-package data.
- [ProAnimationBank README](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/media/fbx/pab/README.md): creator granted project-license redistribution.
- [FBX Ruby README](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/media/fbx/sketchfab/README.md) and [glTF Ruby README](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/media/gltf/sketchfab/ruby/README.md): Christoph Schoch model under CC BY 4.0, not automatically MIT.
- [Khronos media README](https://github.com/guillaumeblanc/ozz-animation/blob/744eb9d99f606eda849acb0b1204f7a3dc20bca1/media/gltf/khronos/README.md): box_animated, cesium_man and rigged_simple CC BY 4.0; interpolation_test and triangle CC0. Preserve creator/source/license attribution and indicate adaptations for CC BY material; do not infer a blanket right from root MIT.

## Local helper and evidence limitations

scripts/preflight.py is a byte-identical copy of the repository's awesome-gamedev-agent-skills helper. It validates schema, canonical GitHub pinned file URLs, safe public paths and bounded regular-file hashes if an approved source is supplied. It performs no fetch, install, Git command, compiler, importer or runtime execution. Without --repo it does not inspect upstream bytes. With --repo it still does not verify Git HEAD or unlisted files. tools are discovery-only, not version gates.

Only package structure and offline helper behavior may be checked during this authoring task. No upstream build/import, SDK install, benchmark, sample execution, asset rendering, optimization-error comparison or target-device run was performed. evals/evals.json is authored-not-executed, not empirical quality evidence.
