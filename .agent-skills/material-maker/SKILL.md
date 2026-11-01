---
name: material-maker
description: >
  Operate RodZill4/material-maker for procedural PBR node graphs, 3D texture painting, profile-aware CLI exports, version-fit source packaging, and Material Maker failures. Use when the request names Material Maker, its .ptex workflow, or this repository. Route generic Godot shaders, other material editors, and Terrain3D work elsewhere. Respect upstream prohibition on AI/LLM or agentic pull requests; activation does not install or launch the app.
allowed-tools: Read Write Edit Bash
compatibility: Source-pinned operator guidance; offline preflight is not runtime or whole-revision verification.
metadata:
  version: "1.0.0"
  source: "https://github.com/RodZill4/material-maker"
  upstream_commit: "7d6daae3c74c09720afe4138ce09699ab3591ce1"
---

# material-maker

## When to use this skill

Use for named Material Maker, its .ptex projects and app-specific node/paint/export workflows. Choose one mode: **version-fit**, **material-graph**, **texture-paint**, **cli-export**, **source-package**, or **failure-triage**. Generic shader design, other editors and terrain addons belong to their own owners. This is a Godot-based standalone authoring app, not a generic Godot addon installer.

## Instructions

### 1. Establish a local, pinned job
Read [references/upstream.md](references/upstream.md) and [references/source.json](references/source.json). Record app/source version, Godot version if relevant, OS/GPU, .ptex/model input rights, export profile/resolution/destination and write/execute permissions. Preserve project versions and originals. HEAD was inspected independently of release1.8; source project features4.7 and desktop workflow4.7.2 are distinct evidence.

**Helper host prerequisite:** Before running the helper, use a POSIX Python environment with `os.O_NOFOLLOW` and `os.open` support for `dir_fd`. Native Windows may fail closed with `secure_posix_traversal_unavailable`; preserve these safety guards. Windows users can retry in a WSL environment that supports these features or manually compare the original manifest-listed source files against the pinned evidence. Neither this guidance nor a manual comparison verifies helper execution or runtime behavior; report those as unverified.

From the **installed skill directory**:
~~~sh
python3 scripts/preflight.py --json
python3 scripts/preflight.py --json --repo <approved-absolute-source-root>
~~~
Installed scripts/preflight.py loads references/source.json relative to itself, discovers tools and optionally hashes only listed local files. No upstream execution/network occurs. With no --repo, source_checked=false. runtime_verified and whole_revision_verified remain false. Mismatches stop provenance acceptance; tool presence does not establish engine version, GPU readiness or rendering success.

### 2. Complete one mode, not every workflow
- **version-fit:** compare actual app release, project.godot and workflow before changing anything. Official release1.8 provides desktop binaries; Android/Web preset existence is not supported-release proof. Done: version/platform/output matrix and unresolved conditions.
- **material-graph:** on an approved copy, begin with Material output node, add a named library generator such as Pattern/Bricks, connect its output to Albedo and inspect2D/3D previews. Configure PBR channels separately: albedo, metallic, roughness, emission, normal/depth. A single input accepts one connection; reconnecting replaces it. Save a distinct .ptex and verify reload/export channel inventory. Done: approved graph plus observed previews/outputs, or a concrete node recipe when app execution is not authorized.
- **texture-paint:** confirm owned/approved model and texture resolution, create File/New Paint Project, choose model, create/select layer and brush, then paint only in an approved working copy. Brushes are node graphs affecting channels; preserve the source model and baseline textures. Done: saved project, correct layer/channel changes and reload comparison, not a claim inferred from UI controls alone.
- **cli-export:** read installed parse_args.gd/profile definitions before constructing command. Choose exact profile, explicit output directory and input .ptex files; current default is Godot/Godot 4 Standard, not the manual's stale SpatialMaterial wording. Unknown profile may silently fall back to a similarity-selected profile, so compare log-selected target and generated files to requested target. Preview overwrite collisions and resolution first. Done: exact command/exit, selected profile, output names/channels and target import validation, or an unexecuted export plan.
- **source-package:** use matching Godot4.7.2 workflow evidence and export templates, not a guessed latest engine. Disable editor Game Embed Mode when necessary. Preserve packaging data directories; an exported executable alone is incomplete. Separate normal/Steam presets and app execution from export-build approval. Done: reproducible package recipe or inspected actual artifact after approval; never publish a Steam build implicitly.
- **failure-triage:** collect first console error, app version, GPU, graph/input and selected output profile. Complex generated shaders can stall; consider a Buffer node only after identifying the problematic graph, trading shader complexity for intermediate rendering. Disabled rendering makes previews stale. Done: minimum reproduction and one targeted change with before/after observations, or explicit unknowns.

### 3. Respect contribution, network and execution boundaries
Upstream CONTRIBUTING.md forbids AI/LLM or any agentic coding for pull requests. Do not prepare or submit AI-authored upstream PRs; explain the policy and keep allowed assistance to local user workflows/source inspection. Local MIT use and upstream contribution acceptance are separate questions.

Downloads, package managers, app/editor launches, rendering, source export, file changes and generated UE Python execution need matching approval. Do not use website: inputs, sharing/upload dialogs or remote materials without separate network/content-rights approval. No Steam purchase/login/upload is required for local material authoring. Community materials and bundled Steam SDK binaries are not cleared solely by root MIT. Back up inputs and preview every output collision.

### 4. Verify target-specific exports
Blender output still needs material assembly. Unity profile must match the actual target. UE4 needs manual shader setup; UE5 generates a Python script that must be reviewed and approved before execution. Inspect current export implementation because manual terminology can lag. Do not assume CLI export is GPU-free or works with Godot --headless: workflow --headless source packaging is not rendered-material CLI proof. Verify actual texture dimensions/channels, normal convention, companion files and target import; bind measurements to exact source/app/GPU/command. Report unavailable execution honestly.

## Examples

- “Export my Material Maker .ptex to Godot4 materials.” → cli-export; inspect exact profile and fallback log, preview overwrites, validate generated files after approval.
- “Paint roughness on my model in Material Maker.” → texture-paint; preserve originals, select layer/brush/channels and verify reload.
- “Fix generic Godot spatial shader lighting.” → route to the shader/Godot owner unless the failure is specifically exported Material Maker output.
- “Use AI to patch Material Maker and open an upstream PR.” → explain upstream prohibition; do not create or submit the AI-authored PR.

## Best practices

Prefer owned local .ptex and model inputs. Distinguish material authoring, rendering and source-app packaging. Avoid profile approximation by requesting exact installed profile strings. Treat snapshots as use-at-own-risk. Preserve font/component licenses if redistributing an app bundle; do not attach app-source licensing to user materials automatically. Never present source review or offline preflight as rendering/performance validation.

## References

- [references/upstream.md](references/upstream.md): pinned API/docs/workflow/license/policy evidence.
- [references/source.json](references/source.json): exact README/root-license hashes and tool inventory.
- [scripts/preflight.py](scripts/preflight.py): offline installed helper; no application execution.
