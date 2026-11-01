# Jolt Physics: pinned upstream evidence

Observed 2026-11-01. Repository https://github.com/jrouwe/JoltPhysics . LinkedIn destination https://lnkd.in/gNCw26PW resolved to that exact owner/repository; original post prose was not inspected.

## Revision and scope

Inspected master HEAD: ea4599d5044d92ba91b18664ec1df96255d5eb31. Latest release observed: [v5.6.0](https://github.com/jrouwe/JoltPhysics/releases/tag/v5.6.0), published 2026-07-11. No tree-equality claim between HEAD and the tag. Source manifests hash README and root license only.

Pinned root: https://github.com/jrouwe/JoltPhysics/tree/ea4599d5044d92ba91b18664ec1df96255d5eb31 . [README](https://github.com/jrouwe/JoltPhysics/blob/ea4599d5044d92ba91b18664ec1df96255d5eb31/README.md#compiling), sections Design considerations, Features, Supported platforms, Required CPU features, Compiling and Folder structure: C++17 CPU rigid-body library; no RTTI/exceptions by default; standard-library-only core. Supported core claims include Windows, Linux, FreeBSD, Android, macOS, iOS, MinGW and NDA-dependent console support. WASM bindings are separate JoltPhysics.js. Samples/JoltViewer narrow to desktop. SSE2 minimum x86, ARM64 NEON; optimized defaults can require newer CPU features. GPU hair/ComputeSystem are additional paths, not a GPU rigid-body claim; hair environment collisions limited to ConvexHull/CompoundShapes.

## API and deterministic behavior

[HelloWorld.cpp](https://github.com/jrouwe/JoltPhysics/blob/ea4599d5044d92ba91b18664ec1df96255d5eb31/HelloWorld/HelloWorld.cpp), main and its comments: allocator/factory/type registration, temporary allocator/job system, persistent collision filters, PhysicsSystem.Init, BodyInterface creation/add/removal/destruction, Update and cleanup. Too-small contact limits drop contacts; larger time steps need additional collision steps. This example has a file-local CC0-1.0 declaration.

[Docs/Architecture.md](https://github.com/jrouwe/JoltPhysics/blob/ea4599d5044d92ba91b18664ec1df96255d5eb31/Docs/Architecture.md#creating-bodies), Creating Bodies and Deterministic Simulation: batch inserts; identical modifying API order/same binary; cross-platform mode requires same source/defines and floating-point care. Result/callback ordering is not automatically deterministic. Upstream approximately 8% cross-platform-mode slowdown is not independently measured here.

## Official commands, not executed

[Build/README.md](https://github.com/jrouwe/JoltPhysics/blob/ea4599d5044d92ba91b18664ec1df96255d5eb31/Build/README.md#building), Building/Includes/Defines/Errors:
~~~sh
# From upstream Build directory; after separate build approval
./cmake_linux_clang_gcc.sh
cd Linux_Debug
make -j$(nproc) && ./UnitTests
# macOS alternative from Build, with Xcode/CMake3.23+
./cmake_xcode_macos.sh
# Windows, CMake3.20+; generated solution is built separately
cmake_vs2026_cl.bat
~~~
README compiler minimums and the newer Windows script default differ intentionally; inspect installed tools. Shared build option: -DJPH_BUILD_SHARED_LIBS=ON. Match JPH defines, RTTI and LTO between library/application. Linux visualization/compute needs full Vulkan SDK including dxc; macOS needs dxc/spirv-cross or SDK. iOS documentation has a dotted script spelling but tree contains cmake_xcode_ios.sh: inspect actual pinned file before use. No install/build command was run during research or package authoring.

## License and component boundaries

[Full root LICENSE](https://github.com/jrouwe/JoltPhysics/blob/ea4599d5044d92ba91b18664ec1df96255d5eb31/LICENSE): MIT, copyright2021 Jorrit Rouwe. Permits use/copy/modification/merge/publication/distribution/sublicensing/sale. Include copyright and permission notices in copies/substantial portions. AS-IS, no warranties including merchantability, fitness/noninfringement; authors not liable for claims/damages.

[Assets/LICENSE](https://github.com/jrouwe/JoltPhysics/blob/ea4599d5044d92ba91b18664ec1df96255d5eb31/Assets/LICENSE) explicitly grants MIT treatment for named Guerrilla/Horizon assets. It only identifies external face/hair origins, without equivalent explicit rights clearance. [Hair source](https://www.cemyuksel.com/research/hairmodels/) was accessible but fetched text supplied no reuse terms; do not redistribute or download automatically.

[Race track README](https://github.com/jrouwe/JoltPhysics/blob/ea4599d5044d92ba91b18664ec1df96255d5eb31/Assets/Racetracks/README.md) identifies TUMFTM source; [full component LICENSE.txt](https://github.com/jrouwe/JoltPhysics/blob/ea4599d5044d92ba91b18664ec1df96255d5eb31/Assets/Racetracks/LICENSE.txt) is LGPLv3, incorporating GPLv3. Retain applicable notices/license, review source/conveyance obligations and modified/combined-work conditions for the actual redistribution. Root MIT is not blanket clearance. README requires contributor agreement for nontrivial contributions. Transitive tool/asset clearance is incomplete.

## Evidence limits

Only source/docs and selected hashes were inspected. No physics run, compiler invocation, benchmark, console SDK, signing, dependency installation or whole-tree attestation. preflight discovers executable presence, not versions, and reads selected local files only when --repo is supplied. Source mismatch must remain visible. Documentation support claims and demonstration claims are not verified performance.
