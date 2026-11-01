# The Forge: canonical-source and safety evidence

Observed 2026-11-01. Public upstream research only; no project/SDK/asset/server was installed, built or run.

## Identity, pin and migration

- LinkedIn https://lnkd.in/gACrbdqw resolves to https://github.com/ConfettiFX/The-Forge. Its README says release 1.64 continues on Codeberg.
- Current canonical repository: https://codeberg.org/The-Forge/The-Forge; host codeberg.org, repository The-Forge/The-Forge; copyright The Forge Interactive Inc.
- Audited master commit 5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc, timestamp 2026-08-28T00:53:15+02:00. [Pinned README](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/README.md) declares release 1.64 dated August 12th, 2026. Codeberg tags API returned an empty list and release API a not-found response: this is a README-declared version, not a verified release/tag object.
- README.md SHA-256 c13b70fcedb9a56f194efe8e49d979018f2e5dc10e9528d4fa433cb541a9c1fa.
- [Actual root LICENSE.txt](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/LICENSE.txt); SHA-256 3485d677a6944ccd842b74d80abb90399728944d7dce78ee41d82ea50686cabe. The filename is LICENSE.txt, not legacy LICENSE.
- [Manifest](source.json) freezes this Codeberg revision and the two selected files; no local upstream tree is bundled.

Historical contrast, not the current build contract:
- GitHub owner ConfettiFX, observed master cd5046893faba2dc7869243873bf01f02a6f0df9, timestamp 2026-08-27T22:50:14Z.
- GitHub latest release API: v1.63, published 2025-03-21T09:51:10Z: https://github.com/ConfettiFX/The-Forge/releases/tag/v1.63.
- [Legacy README](https://github.com/ConfettiFX/The-Forge/blob/cd5046893faba2dc7869243873bf01f02a6f0df9/README.md), SHA-256 f877e6d21aef70fca24e2384df7f019f4c1d11062e3f94f5c2d6e7de38b3cf81.
- [Legacy LICENSE](https://github.com/ConfettiFX/The-Forge/blob/cd5046893faba2dc7869243873bf01f02a6f0df9/LICENSE), SHA-256 3485d677a6944ccd842b74d80abb90399728944d7dce78ee41d82ea50686cabe.
- The legacy README advertised several non-console platforms under Apache-2.0. Current Codeberg README L24 says the public repo holds only PC/DirectX 12 runtime, L36 offers a PC Apache license, and L38 offers commercial licenses for all other platforms. Keep both observations and their timestamps distinct. This is not a legal conclusion that older grants were revoked.

## Real source architecture versus product claims

[README](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/README.md#L24) advertises the overall product on Windows 10/11; Steam Deck Vulkan 1.1; Android 10+; iOS/iPadOS 14.1/17.0; macOS 11/14 Intel/Apple silicon; Quest 3; consoles/Switch 1/2; HoloLens2. Consoles require accreditation and a separate license. That list is not public-source availability evidence.

The complete paginated tree inspection covered 1,885 entries. Its Common_3/Graphics backend directory was Direct3D12, beside FSL, Interfaces and ThirdParty. Cross-platform macros, old Android/Xcode props and default compiler paths do not prove complete public backends. README L812 describes internal development with synchronized public releases, not a public rolling-development guarantee.

- [IApp.h](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Common_3/Application/Interfaces/IApp.h): Init/Exit, Load/Unload(TFReloadDesc*), Update/Draw, GetName and DEFINE_APPLICATION_MAIN lifecycle. Current resource types/names must be read at this pin.
- [IGraphics.h](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Common_3/Graphics/Interfaces/IGraphics.h) and [Direct3D12 source](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Common_3/Graphics/Direct3D12/Direct3D12.c): graphics ownership and backend integration, not a turnkey renderer/editor.
- README overview supplies app, resource loading, graphics/OS/utilities, Lua, Flecs, animation wrappers and current Nuklear UI. Scene system/resource streaming are not provided; physics/networking/sound are not provided. High-end effects/product screenshots are claims, not proof each separate middleware product is included here.
- [Vendored ozz changelog](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Common_3/Resources/AnimationSystem/ThirdParty/OpenSource/ozz-animation/CHANGES.md) begins at 0.14.0, unlike standalone upstream 0.17.0. It is a vendored snapshot with potential local modifications, not a verified pristine upstream tag.

## Requirements, commands and side effects

[README L96-132](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/README.md#L96): Windows 10 1809+/11, latest GPU drivers, Visual Studio 2019, Windows SDK 10.0.17763.0. [01_Transformations.vcxproj](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Examples_3/Unit_Tests/PC_VS2019/01_Transformations.vcxproj) selects v142 and SDK 10.0 with Debug/Release x64. [Unit_Tests.sln](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Examples_3/Unit_Tests/PC_VS2019/Unit_Tests.sln) is an example entry point. No project was compiled here. README writing policy says C++11, but preserve the actual consuming project's checked settings.

Official bootstrap is PRE_BUILD.bat. [Actual script](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/PRE_BUILD.bat) performs:

```bat
Tools/wget -O Art.zip http://www.conffx.com/Art.zip
Tools/7z x Art.zip -y
```

It first deletes a pre-existing Art.zip and deletes the archive afterward. This is plain-HTTP network acquisition, extraction with overwrite, and deletion. These are source excerpts, not commands executed here. README claims extension install and also says none are installed; actual script only downloads/extracts assets. Art.zip content/license and bundled wget/7z distribution terms were not fully inspected. Do not infer current source/asset integrity or reuse rights from script presence.

**A normal example build may start/kill a server:**
- [Examples.x64.props](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Examples_3/Build_Props/VS/Examples.x64.props) copies SDK DLLs/assets, then uses PowerShell start-process on ReloadServer.bat with Hidden window style.
- [ReloadServer.bat](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Common_3/Tools/ReloadServer/ReloadServer.bat) calls --kill before restarting and references a Python 3.6.0 embedded directory. Its referenced interpreter path is not proof that interpreter is present/compatible.
- [ReloadServer.py](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Common_3/Tools/ReloadServer/ReloadServer.py#L459): DEFAULT_PORT=6543 and bind(('0.0.0.0', port)). Require approval for network listener exposure and any existing-service termination before a build; never commandeer another process or port.

[FSL CLI](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Common_3/Tools/ForgeShadingLanguage/fsl.py) defines -d/--destination, -b/--binaryDestination and positional fsl_input as required; -l/--language, --compile, --incremental and --debug are optional. FSL_COMPILER_FXC defaults into Windows SDK 10.0.17763.0, FSL_COMPILER_DXC into bundled compiler files. Inspect actual available generator/compiler before a reviewed compilation plan. Source-level CLI knowledge is not a successfully executed command.

## Root Apache-2.0 terms, read in full

[LICENSE.txt](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/LICENSE.txt) contains Apache-2.0 without an appended custom root restriction. Section 1 defines scope/contributions. Sections 2-3 grant copyright/derivative/distribution/sublicense and contributor patent rights, with specified patent-litigation termination. Section 4 requires a license copy, prominent modified-file notices, retained applicable source attribution/patent/trademark notices and relevant NOTICE attributions where included. Section 5 submits intentional contributions under Apache absent explicit/separate terms. Section 6 excludes trademark grants beyond customary origin/NOTICE use. Sections 7-8 disclaim warranties and liability subject to law. Section 9 allows own-account support/warranty obligations with contributor indemnification. This grant does not override separately licensed vendor components.

## Restricted and copyleft component boundaries

### FluidStudios is not unrestricted OSS

[mmgr.c L17-24](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Common_3/Utilities/ThirdParty/OpenSource/FluidStudios/MemoryManager/mmgr.c#L17) and [mmgr.h](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Common_3/Utilities/ThirdParty/OpenSource/FluidStudios/MemoryManager/mmgr.h) say: software free; author credit required; modified redistribution must clearly document obtaining original work; no use that directly or indirectly harms others; AS-IS/no warranty. The use restriction matters regardless of ThirdParty/OpenSource directory naming. Do not present the complete framework distribution as uniformly unrestricted OSS.

### NVIDIA NVAPI is proprietary and hardware-restricted

[Bundled NVAPI license PDF](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Common_3/Graphics/ThirdParty/OpenSource/nvapi/docs/NVAPI_SDKs_Samples_and_Tools_License_Agreement(Public).pdf) is a five-page V.07.08.2016 agreement, read in full; [nvapi.h](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Common_3/Graphics/ThirdParty/OpenSource/nvapi/nvapi.h) also marks proprietary ownership. Section 1 permits defined product development/testing/service only on supported NVIDIA GPUs and controlled product-incorporated distribution with protective downstream agreements. Section 2 restricts standalone/hosting uses, competition, unauthorized reverse engineering/modification and benchmark/competitive-analysis disclosure without NVIDIA prior written permission, and imposes defined open-source interaction restrictions. Other terms include confidentiality, NVIDIA modification/feedback rights, no warranty, liability limits, termination/destruction, three-year records/audit, export, indemnity, trademarks and jurisdiction. Do not substitute newer upstream NVAPI terms or publish benchmarks without the required authority.

### DirectX SDK runtime versus MIT code

[Agility LICENSE.txt](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Common_3/Graphics/ThirdParty/OpenSource/Direct3d12Agility/LICENSE.txt) and [Preview LICENSE.txt](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Common_3/Graphics/ThirdParty/OpenSource/Direct3d12AgilityPreview/LICENSE.txt) were read in full: Windows-only use; separate components/notices; telemetry and update clauses; limited distributable object-code rights requiring significant app functionality, protective downstream terms and indemnification; no standalone sharing, technical-limit bypass, prohibited reverse engineering, notice removal or incompatible source-disclosure licensing; export/support/regional clauses; AS-IS with generally USD5 direct-damage cap and statutory exceptions. Adjacent [LICENSE-CODE.txt](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Common_3/Graphics/ThirdParty/OpenSource/Direct3d12Agility/LICENSE-CODE.txt) is MIT but does not relicense the runtime SDK.

### TinyTIFF is LGPL-3.0-or-later and actually compiled

[Full LGPLv3 text](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Common_3/Tools/ThirdParty/OpenSource/TinyTIFF/LICENSE) plus [tinytiffreader.h](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Common_3/Tools/ThirdParty/OpenSource/TinyTIFF/src/tinytiffreader.h) permit LGPLv3 or later. [AssetPipelineCmd.vcxproj](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Common_3/Tools/AssetPipeline/Win64/AssetPipelineCmd.vcxproj) compiles tinytiffreader.c and tinytiff_ctools_internal.c. LGPL is OSS but not permissive Apache. Distribution needs the applicable GNU/LGPL notices and licenses, allowance for library modification/debugging reverse engineering and compliant relinking/source or suitable shared-library mechanism, plus installation information when required. Review actual linkage/package before distributing the asset tool.

### PIX and unresolved distribution terms

[WinPixEventRuntime.nuspec](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Common_3/Graphics/ThirdParty/OpenSource/winpixeventruntime/WinPixEventRuntime.nuspec) identifies 1.0.200127001 and a Microsoft EULA URL that currently returns unrelated web-development content. [ThirdPartyNotices.txt](https://codeberg.org/The-Forge/The-Forge/src/commit/5abcdd969d0d883e9bf91f6926a8ea0935a0b3bc/Common_3/Graphics/ThirdParty/OpenSource/winpixeventruntime/ThirdPartyNotices.txt) says notices are informational and Microsoft distributes under PIX terms. Applicable full EULA remains unresolved; bundled notices are not permissive clearance. HIDAPI header offers GPLv3/BSD-style/original choices but referenced full license files were not in the inspected bundled folder. Resolve selected terms before redistribution. Art.zip and every standalone tool/compiler binary's complete terms were not fully cleared.

## Other inspected notices to preserve

- MIT: cr, Flecs, Lua5.3.5, ozz, cgltf, meshoptimizer, ISPCTextureCompressor, AMD AGS, D3D12MemoryAllocator, TressFX, RenderDoc API header, tinydds/tinyktx. MIT requires copyright/permission retention and carries AS-IS/liability disclaimers; do not drop embedded notices.
- Nuklear offers MIT or Unlicense; Fontstash is zlib-style; Boost.Context uses Boost1.0; bstrlib/zstd BSD3; lz4/mcpp BSD2. BSD requires source and binary notices/disclaimers, and BSD3 adds no endorsement; zlib requires truthful origin, marking alterations and notice retention; Boost exempts solely executable object distributions from notice-copying requirements.
- cpu_features Apache2 plus BSD2 ndk_compat clauses; DirectXShaderCompiler HLSL headers Apache2 with LLVM exceptions for compiled embedded portions and specified GPLv2 interactions. Root and component licenses are separate layers.
- The manifest intentionally hashes only README.md and LICENSE.txt, not this inventory. These observations are not a complete binary-distribution legal clearance or an independent legal opinion.

## Helper adaptation and unexecuted boundaries

scripts/preflight.py minimally adapts the existing awesome-gamedev-agent-skills helper: exact host codeberg.org, repository The-Forge/The-Forge, fixed commit, two public paths, canonical src/commit URLs and actual root-license record. Existing non-symlink traversal, sensitive-file denial, size/regular-file bounds, no-subprocess/no-network behavior and path-free JSON diagnostics remain. The helper never verifies Git HEAD, unlisted files, tool versions or runtime. A no-source --json report means no upstream bytes were checked.

No PRE_BUILD, external download/extraction, vendor EULA acceptance, install, compiler, sample/asset pipeline, graphics frame, benchmark, ReloadServer or target-device run was performed. Example assets have not been visually verified. Package validators do not change this. Evals are authored-not-executed and must not be presented as passed scenarios.
