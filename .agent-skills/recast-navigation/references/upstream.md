# Recast Navigation upstream evidence

Observed 2026-11-01; source/doc inspection only, not a compiled-library or navigation-quality report.

## Identity and revision

https://lnkd.in/gk82xC47 resolved to https://github.com/recastnavigation/recastnavigation, owner recastnavigation. Original post text uninspected. Research main: 9f4ce64458dfae86e1239c525ddc219c4e9e06f1, committed 2026-02-27T07:16:52Z. Latest observed [v1.6.0](https://github.com/recastnavigation/recastnavigation/releases/tag/v1.6.0), published 2023-05-21. Release commit was not established. Main's LIB_VERSION=1.6.0 is not evidence that main matches release source.

## Architecture and integration anchors

- [README / modules / How it Works](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/README.md): Recast triangle rasterization to voxels, filtering, regions and polygon navmesh. Detour runtime queries, DetourTileCache obstacle/rebuild/streaming-related support, DetourCrowd local movement/avoidance, DebugUtils and demo/tests. Automatic/fast/industry-standard are claims, not measured guarantees.
- [Building & Integrating / Source Integration](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/Docs/_2_BuildingAndIntegrating.md): add only needed source directories. A level tool may include Recast/Detour/DebugUtils; runtime can include Detour only. No stable official C/DLL API; third-party bindings are not upstream support.
- [FAQ / coordinate system](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/Docs/_3_FAQ.md): clockwise triangles, right-handed Y-up; core documented C++98, no STL/exceptions/RTTI.
- [DetourCrowd header class documentation](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/DetourCrowd/Include/DetourCrowd.h): crowd must own agent position and velocity; local targets no more than 256 polygons away; use intermediate targets for long distance. This is not a benchmark or hard universal population capacity.
- [Sample_SoloMesh.cpp](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/RecastDemo/Source/Sample_SoloMesh.cpp) and [Sample_TileMesh.cpp](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/RecastDemo/Source/Sample_TileMesh.cpp) are API-workflow anchors. Current CMake lists Tool_NavMeshTester.cpp; older guide's NavMeshTesterTool.cpp name should not be blindly copied.

## Core versus demo/tests build dependencies

[Root CMakeLists](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/CMakeLists.txt): minimum 3.15, policy compatibility through 4.1, library version 1.6.0. RECASTNAVIGATION_DEMO and RECASTNAVIGATION_TESTS default ON. RECASTNAVIGATION_DT_POLYREF64 and RECASTNAVIGATION_DT_VIRTUAL_QUERYFILTER default OFF; align these with consumers. Exports RecastNavigation:: CMake targets. Default all-target build is NOT dependency-free core-only.

[Demo CMakeLists](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/RecastDemo/CMakeLists.txt) explicitly requires C++20 and SDL2/OpenGL/GLU; [Tests CMakeLists](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/Tests/CMakeLists.txt) explicitly requires C++20 with bundled Catch2. Core's C++98/no-external-dependency claim must not be broadened to demo/tests. Supported documented demo build procedures cover Windows/macOS/Linux, not an exercised universal target matrix.

[Build guide / Building RecastDemo / Integration](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/Docs/_2_BuildingAndIntegrating.md), commands not executed:

- Windows: place SDL2 dev libraries in RecastDemo/Contrib/SDL so lib/x86 exists; from RecastDemo run premake5 vs2022, open Build/vs2022/recastnavigation.sln and build demo.
- macOS: put SDL2.framework in RecastDemo/Bin; run premake5 xcode4; open Build/xcode4/recastnavigation.xcworkspace.
- Linux: obtain system SDL2 separately; from RecastDemo run premake5 gmake; cd Build/gmake; make; run RecastDemo/Bin/./RecastDemo from the corresponding directory.
- Optional dependency-manager installation: vcpkg install recast. This downloads/builds/installs and requires explicit approval, not offline preflight.
- CMake supports choosing core-only by disabling RECASTNAVIGATION_DEMO and RECASTNAVIGATION_TESTS; any configure/build invocation must be constructed for the approved revision/toolchain and marked planned until executed. No exact invented command is claimed to be verbatim documentation.
- Tests target is registered with CTest as Tests; test execution remains unperformed.

## Licensing and redistribution obligations

[License.txt](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/License.txt): zlib, Copyright 2009 Mikko Mononen. Any purpose including commercial use, alteration and redistribution allowed subject to ALL three conditions: (1) do not misrepresent origin or claim authorship of original; acknowledgment in product documentation appreciated but NOT required, (2) mark altered source versions plainly and do not present them as original, (3) do not remove or alter the notice in source distributions. AS-IS/no express or implied warranty; authors not liable for damages.

Components inspected separately:
- [imgui LICENSE](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/RecastDemo/Contrib/imgui/LICENSE.txt) and [implot LICENSE](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/RecastDemo/Contrib/implot/LICENSE): MIT. Retain copyright and permission notice with copies/substantial portions; warranty/liability disclaimer.
- [fastlz.h header](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/RecastDemo/Contrib/fastlz/fastlz.h): MIT, version 0.1.0.
- [stb_truetype.h header](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/RecastDemo/Contrib/stb_truetype.h): v1.09 declares public domain.
- [Catch2 header](https://github.com/recastnavigation/recastnavigation/blob/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/Tests/Contrib/catch2/catch_amalgamated.hpp): version 3.12.0, Boost Software License 1.0. [Full BSL](https://www.boost.org/LICENSE_1_0.txt) permits use/copy/execute/distribute/derivatives; retain copyright/full statement in copies and derivatives except solely machine-executable object code; AS-IS/liability disclaimer.
- Docs/doxygen-awesome-css/LICENSE was hashed but full terms were not reviewed; do not infer its license from the hash.
- SDL is external/not included. Fonts including DroidSans.ttf are copied by current demo CMake; asset-specific terms were not cleared. Attempted RecastDemo/Contrib/imgui/misc/fonts/README.txt returned 404. Do not invent font reuse permission or treat all demo assets as root zlib.

Complete demo/font/external dependency redistribution clearance remains blocked pending item-level review. Core zlib conditions are established; generic root-license metadata does not replace them.

## Installed helper, hashes and verification scope

[source.json](source.json) gives exact selected-file SHA-256; raw prefix https://raw.githubusercontent.com/recastnavigation/recastnavigation/9f4ce64458dfae86e1239c525ddc219c4e9e06f1/ . From installed skill root run scripts/preflight.py; from this reference it is ../scripts/preflight.py. Helper discovers tools without version execution and compares selected public bytes only when an explicit source root is supplied. No Git HEAD/whole-tree/ABI/runtime proof. No dependencies installed, library/demo/tests built, geometry baked, path query/crowd run or performance benchmark performed. Evals are authored-not-executed.
