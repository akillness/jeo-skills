# Effekseer upstream evidence

Observed 2026-11-01; read-only source research, not an installation or runtime report.

## Identity and pins

LinkedIn shortlink https://lnkd.in/gd8aJfYe resolved to https://github.com/effekseer/Effekseer (owner effekseer). Original post body was not inspected.

Research master commit: b5700082b49bc5f919610880dafddc90211a9a4e, committed 2026-10-30T11:30:16Z. Latest release observed: [1.80.8/tag 1808](https://github.com/effekseer/Effekseer/releases/tag/1808), published 2026-10-30. Release commit resolution was not established. Master is development and README explicitly forbids production use. Resolve a release commit separately before operational use; the manifest verifies only selected files at the research pin.

## Architecture and evidence anchors

- [README / Supported platforms / Development](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/README.md): particle authoring tool plus runtimes; Unity/UE/Godot/WebGL claims are ecosystem listings, not version compatibility evidence. Console support requires contacting project; no public console SDK was verified.
- [CodeOverview / C++ / C#](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/docs/Development/CodeOverview.md): device-independent Effekseer core, RendererCommon, backend renderers, sound modules, C++ viewer/material compiler, C# editor. Its Metal planned wording is stale relative to actual targets.
- [CMakeLists options/platform branches](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/CMakeLists.txt): DX9/11/12 default ON on Windows; Metal ON on Apple, GL ON, Vulkan/WebGPU OFF. WebGPU source/test flags do not prove production parity. Apple deployment target 12.0. CMake code minimum 3.15 differs from build-guide minimum 3.23.
- [DX11 main.cpp](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/Examples/DirectX11/main.cpp): Manager::Create(8000), Effect::Create(...Laser01.efkefc), Play, Update, Draw; use complete backend setup and lifecycle, not these calls in isolation.
- README's Godot link is [EffekseerForGodot3](https://github.com/effekseer/EffekseerForGodot3). Godot 4 integration was not established. Treat this as an unknown, not a confirmed absence or compatibility grant.

## Build guide and commands (not executed)

[HowToBuild / Requirements / Get code / Editor / Build with script](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/docs/Development/HowToBuild.md) requests Git, .NET 9 SDK, CMake 3.23+, Python 3.12+, Windows VS2022/Git LFS, macOS Xcode, Linux g++ plus listed native GUI/audio/GL packages.

Documented sequence: git clone https://github.com/effekseer/Effekseer; cd Effekseer; git submodule update --init; git lfs install; git lfs pull. This defaults to development master and is evidence only, NOT a production recipe: approve and resolve a stable release first.

Windows: Script/GenerateProjects.bat then build/Effekseer.sln, or mkdir build; cd build; cmake -DBUILD_VIEWER=ON -DBUILD_EDITOR=ON ..

macOS documented generator: cmake -G Xcode -DBUILD_VIEWER=ON ..; root scripted build: python3 build.py; C++ runtime packaging: python3 release_cpp.py. The guide's Visual Studio for Mac/msbuild and mono Effekseer.exe steps are stale-risk and were not verified. These commands create/download/build content and need separate approval; preflight runs none of them.

Release assets observed include Windows/Linux editors, macOS arm64/x64, C++, Unity, UE, DXLib and WebGL packages. Asset existence is not platform playback proof.

## Licensing and incomplete closure

- [LICENSE](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/LICENSE): MIT, Copyright 2011 Effekseer Project. Permits commercial use, copying, modification, distribution, sublicensing and sale; keep copyright and permission notice in copies/substantial portions. AS-IS and liability disclaimer.
- [LICENSE_RUNTIME_DIRECTX](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/LICENSE_RUNTIME_DIRECTX): MIT plus DirectX Tool Kit identified as Ms-PL. [Full Ms-PL](https://opensource.org/license/ms-pl), sections 2-3: copyright/patent grants; retain copyright/patent/trademark/attribution notices; source redistribution under Ms-PL with license copy; object terms must comply; no trademark grant, patent-claim termination, AS-IS limitations. The historical CodePlex link is not a current dependency audit.
- [LICENSE_RUNTIME_VULKAN](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/LICENSE_RUNTIME_VULKAN): aggregated glslang terms include BSD-2, BSD-3, MIT, Apache-2.0, GPLv3-or-later WITH Bison skeleton exception, and NVIDIA preprocessor notice. It explicitly says Bison was removed and distinguishes optional/external pieces. Do not label all Vulkan output GPL or all notices currently linked code. BSD requires source retention and binary documentation notices; BSD-3/NVIDIA prohibit unauthorized endorsement. NVIDIA requires notice/disclaimer retention and grants no implied patent/hardware rights. Apache requires license, change notices, applicable source notices and NOTICE attribution; patent termination and no broad trademark grant apply. Bison exception permits qualifying larger works under chosen terms, not unrestricted relicensing of the skeleton itself.
- [LICENSE_TOOL](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/LICENSE_TOOL): MIT components Lumix/imgui/Boxer/imgui-node-editor/implot/spdlog/tinyobjloader/ufbx; PicoJSON BSD-2-style terms; Native File Dialog zlib-style terms; GD requires credit/notice in user-accessible supporting documentation. Font 源真ゴシック uses SIL OFL 1.1: no standalone sale, preserve copyright/license, reserved-name and endorsement restrictions, derivatives remain OFL; generated documents not forced under OFL; violation terminates rights.
- Additional inspected actual licenses: [flatbuffers Apache-2.0](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/Dev/Cpp/3rdParty/flatbuffers/LICENSE.txt), [imgui_markdown zlib](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/Dev/Cpp/3rdParty/imgui_markdown/License.txt), [ipc Unlicense](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/Dev/Cpp/3rdParty/ipc/LICENSE), [tinygltf MIT](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/Tool/EffekseerResourceConverter/external/tinygltf/LICENSE), [ufbx MIT or Unlicense choice](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/Tool/EffekseerResourceConverter/external/ufbx/LICENSE).
- [.gitmodules](https://github.com/effekseer/Effekseer/blob/b5700082b49bc5f919610880dafddc90211a9a4e/.gitmodules) includes GLFW, LLGI, OpenSoundMixer, stb, glslang, spdlog, easy_profiler, nativefiledialog, imgui, imgui-node-editor, ImGradientHDR, libpng, zlib, libgd, TestData and ResourceData. Every nested component/dataset/font was NOT cleared. No blanket full-editor or asset redistribution conclusion is made.

## Verification limits and installed paths

Selected README/license raw response bytes were hashed successfully. [source.json](source.json) supplies canonical pinned blob URLs and SHA-256; raw form is https://raw.githubusercontent.com/effekseer/Effekseer/b5700082b49bc5f919610880dafddc90211a9a4e/ followed by path. Helper: ../scripts/preflight.py relative to this reference, or scripts/preflight.py from installed skill root. It checks selected public files only; no Git HEAD proof or full-tree audit. No editor/runtime/plugin was installed, compiled or exercised; no performance or security claim. Evaluation scenarios are authored-not-executed.
