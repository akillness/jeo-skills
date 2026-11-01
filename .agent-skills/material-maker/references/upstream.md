# Material Maker: pinned upstream evidence

Observed2026-11-01. Canonical https://github.com/RodZill4/material-maker . https://lnkd.in/gwqnqKJG resolved to that exact destination; full post claims not inspected.

## Revision and real runtime

Inspected master7d6daae3c74c09720afe4138ce09699ab3591ce1; latest [release1.8](https://github.com/RodZill4/material-maker/releases/tag/1.8),2026-10-25. HEAD/tag equality unverified. [project.godot](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/project.godot), application/autoload/rendering: actual_release1.8, features4.7; GDScript singleton-based Godot app. [Desktop workflow](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/.github/workflows/dev-desktop-builds.yml) pins Godot4.7.2 stable and matching templates. Official release assets WindowsZIP/Linux tar.gz/macOSDMG. [export_presets.cfg](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/export_presets.cfg): Windows/Linux x86_64, macOS universal; Android/Web presets do not independently prove supported current releases. Non-Steam/Steam presets differ.

[README](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/README.md), [Introduction](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/material_maker/doc/intro.rst): standalone GraphEdit-based PBR texture/material and brush graph editor,3D model painter. [renderer.gd](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/addons/material_maker/engine/renderer.gd) uses SubViewport/RenderingServer.frame_post_draw. Do not infer CPU-only or functioning headless rendered-material export.

## API/workflow and command evidence

[First steps](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/material_maker/doc/user_interface_first_steps.rst): Material output, library nodes via drag/Space, connect generator to Albedo, automatically updated previews; one connection per input. File/New Paint Project chooses model/resolution and creates brush/layer workflow.

[Command line manual](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/material_maker/doc/command_line.rst) and [parse_args.gd](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/parse_args.gd), _ready/export_files:
~~~sh
# Read-only recipe here; execution writes output and renders
material_maker --export-material --target "Godot/Godot 4 Standard" -o OUTPUT INPUT.ptex
~~~
Current code supports -t/--target, -o/--output-dir, --output-file, --size. Default2048 and Godot/Godot4 Standard; verify actual installed implementation. Unknown profiles can select most-similar name instead of failing. website: inputs fetch remote materials and must not be used automatically. Wildcard handling is application regex transformation, not a full shell-glob guarantee.

[Export manual](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/material_maker/doc/export.rst): BlenderPNG/EXR requires material assembly; Unity.mat depends on profile; UE4 images/.mm2ue manual workflow; UE5 Python/script+textures+shader requires Unreal Python path setup and generated-code execution. The manual's Godot SpatialMaterial terminology is stale relative to current Godot4 default; check real profile code/output, do not claim current class from that wording.

[Performance tools](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/material_maker/doc/user_interface_performance.rst): complex shaders affect render latency; Buffer trades complexity for intermediate textures; disabling render leaves stale previews. No benchmark here.

README package alternatives, not run: scoop bucket add extras; scoop install material-maker; choco install material-maker or material-maker.portable; brew install material-maker. Dependencies/network and install approval required. Official workflow source-package commands, after matching engine/templates and approval:
~~~sh
Godot_v4.7.2-stable_linux.x86_64 --headless -v --export-release "Windows" OUTPUT.exe
Godot_v4.7.2-stable_linux.x86_64 --headless -v --export-release "Linux/X11" OUTPUT.x86_64
~~~
Workflow copies nodes, environments, examples, library, meshes, export support and optional docs beside executable; preserve dependency closure. Source export --headless does not prove CLI material rendering headless.

## Contribution policy

[CONTRIBUTING.md](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/CONTRIBUTING.md#contributing-pull-requests): “Using AI/LLM or any form of agentic coding for your pull request is not allowed.” Respect it: no AI-authored upstream PR creation/submission. This does not rewrite MIT local-use permissions. Using Godot Engine section requires appropriate project version and disabling Run/Window Placement/Game Embed Mode when opening the project if launch fails.

## Licenses: not a uniformly MIT bundle

[Full LICENSE.md](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/LICENSE.md): MIT2018-present Rodolphe Suescun/contributors. Use/copy/modify/merge/publish/distribute/sublicense/sell permitted; copyright/permission notices retained in copies/substantial portions; AS-IS, no merchantability/fitness/noninfringement warranty, no author liability. README says unless otherwise specified.

At this exact pin, component notice paths and inspected conditions:
- [addons/godotsteam/license.md](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/addons/godotsteam/license.md): MIT. Bundled libsteam_api/.dylib/DLL files are Valve SDK binaries; GodotSteam MIT does not establish Valve redistribution rights. Steamworks agreement not audited. Non-Steam presets exclude the extension; do not infer exact archive contents without inspecting an actual package.
- [addons/gut/LICENSE.md](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/addons/gut/LICENSE.md): MIT, Tom Wesley.
- [DroidSans notice](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/material_maker/fonts/LICENSE.DroidSans.txt): Apache2.0, Android Open Source Project. Retain applicable notices/license, modification notices when relevant; full incorporated Apache text not fetched.
- [Hack license](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/material_maker/fonts/LICENSE_Hack.md): MIT+public-domain DejaVu+BitstreamVera. Retain copyright/trademark/license; rename modified fonts excluding Bitstream/Vera; no standalone font sale; promotional name-use restriction; AS-IS/no-liability.
- [Vegur license](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/material_maker/fonts/LICENSE_Vegur.txt): full CC0-1.0 waiver/fallback. No patent/trademark grant or automatic third-party rights clearance; AS-IS.
- [Rubik OFL](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/material_maker/theme/font_rubik/OFL.txt) and [GUT font OFL](https://github.com/RodZill4/material-maker/blob/7d6daae3c74c09720afe4138ce09699ab3591ce1/addons/gut/fonts/OFL.txt): SILOFL1.1. No standalone sale; retain notice/license; respect reserved font names/endorsement restrictions; font derivatives stay OFL, documents made using fonts need not. GUT notice names AnonymousPro; other GUT font provenance was not fully cleared.

Community materials, source archives, engine dependencies and commercial binary distribution require their own item-specific review. No blanket license conclusion for all output material or bundled binaries.

## Unexecuted and unavailable proof

No application launch, texture render, source build, package installation, export/import, GPU test, upload, Steam action or performance measurement. Helper reports only selected source hashes/tool presence and stays runtime_verified=false. Transitive license audit and HEAD/tag equality remain incomplete. Relative installed helper: scripts/preflight.py; relative manifests: references/source.json and references/upstream.md.
