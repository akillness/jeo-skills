---
name: artcraft
description: >
  Operate storytold/artcraft, the dual-licensed Rust/Tauri ArtCraft creator IDE for 2D and 3D scene blocking, hosted AI image, video, audio, mesh, and world generation, release/source-build handoff, exports, and troubleshooting. Use when a user asks to fit-check ArtCraft, inspect its pinned source, install a desktop release, build the app, block a scene, generate media, account for providers or credits, or hand off downloaded assets. Keep remote generation, credentials, downloads, installers, ports, source builds, publishing, and destructive reset actions approval-gated. Route hosted multi-provider generative studio work to `open-generative-ai`, script-to-video storyboard work to `openstory`, Blender scene control to `blender-mcp`, and code-first video assembly to `video-production`.
allowed-tools: Bash Read
compatibility: Requires a supported ArtCraft desktop release or source checkout; source builds need Rust, Node.js 20+, npm, and the Tauri CLI.
license: MIT OR Apache-2.0
metadata:
  version: "1.0.0"
  source: https://github.com/storytold/artcraft
  upstream_commit: 40e04793b504147de97ba1f0659d3975167524e5
---

## When to use this skill

Use this skill for source-grounded ArtCraft desktop operation: fit checks, offline preflight, release-versus-source decisions, 2D/3D scene blocking, provider and credit disclosure, approved AI generation, export/download handoff, and troubleshooting. It covers the repository at the pinned commit, not an unverified moving checkout.

## Instructions

1. **Run the offline gate first.** From the repository root run `python3 .agent-skills/artcraft/scripts/preflight.py --json`; from an installed skill root run `python3 "$SKILLS_ROOT/artcraft/scripts/preflight.py" --json`. Add `--repo PATH --expect-commit 40e04793b504147de97ba1f0659d3975167524e5` only for a supplied checkout. The helper is read-only and never starts ArtCraft, Tauri, Node, providers, servers, or network work.
2. **Fit-check the path.** Read [references/upstream.md](references/upstream.md), then distinguish a signed desktop release for Windows/macOS from a source build that can include Linux. Treat a missing checksum or signature as an unresolved verification gap, not as proof of authenticity.
3. **Install a release only after approval.** Confirm target OS, release URL, license/NOTICE obligations, and whether the upstream release provides a checksum or signature. Never run an installer, download an artifact, or bypass OS trust prompts without explicit approval.
4. **Build from source only after approval.** Use the pinned source and the documented Rust, Node.js 20+, npm, and Tauri CLI toolchain. Do not run `npm ci`, `cargo tauri`, `cargo check`, or any build command until approved; source builds use the normal ArtCraft data and Cargo target locations.
5. **Block scenes deliberately.** In the app, choose a 2D canvas or 3D stage, place image layers, props, meshes, or kitbashed assets, establish camera and depth, then preserve the blocking state before generation. Route Blender-owned scene inspection or manipulation to `blender-mcp`.
6. **Gate every AI generation.** Before image, video, audio, mesh, or world generation, disclose the selected provider/model and the estimated credit or USD cost when the UI reports it. Require separate approval for login, API keys or cookies, remote calls, uploads, and paid credits; ArtCraft's hosted services are not local inference.
7. **Export and hand off explicitly.** Use the app's download/export controls and record the destination, media type, model, and job result. Treat downloaded media and remote CDN links as user data; do not publish, share, or upload them without approval.
8. **Troubleshoot without widening scope.** Capture app version, OS, source pin, exact failing mode, and sanitized logs. Check the pinned platform and data-directory notes before resetting state; clearing credentials, tasks, settings, or downloads is destructive and requires approval.
9. **Report evidence.** Separate source facts, observed local checks, estimates, and runtime results. State when no generation or build was run, and do not claim a model, release, checksum, or provider is available beyond the pinned evidence.

## Examples

```text
Run the ArtCraft offline preflight against this checkout, compare release versus source-build options for macOS, then outline a 3D blocking workflow. Do not install, build, sign in, call a provider, or spend credits.
```

## Best practices

- Keep scene blocking and generation as separate checkpoints so a failed remote job cannot erase composition work.
- Display provider, model, credit estimate, and approval state before any enqueue or upload action.
- Preserve the pinned commit, app version, selected model, and export path in the handoff record.
- Treat credentials, local task databases, settings, downloads, and telemetry as sensitive operational data.
- Prefer `open-generative-ai` for a hosted multi-provider studio, `openstory` for script-to-video storyboards, `blender-mcp` for Blender control, and `video-production` for code-first assembly.

## References

- [Pinned ArtCraft operator reference](references/upstream.md)
- [Upstream repository at the audited commit](https://github.com/storytold/artcraft/tree/40e04793b504147de97ba1f0659d3975167524e5)
