---
name: awesome-gamedev-agent-skills
description: >
  Inspect, selectively install, and maintain gamedev-skills/awesome-gamedev-agent-skills, its cross-engine Agent Skills collection and engine/task router. Use when users name this project, its plugin bundles, or need its pinned inventory, collision-aware selection, or Godot, Unity, Unreal, Ebitengine, web-engine, Bevy, pygame, LOVE, Defold and Roblox guidance. Preserve existing skills and engine versions; route generic Unity pack curation to unity-gamedev-skill-pack and Three.js gameplay to web-game-development. Installing this guide does not install upstream skills, plugins, engines, assets, or providers.
allowed-tools: Bash Read Write Edit Grep Glob
compatibility: >
  Best for source-audited, collision-aware curation of this pinned game skill collection. The guide does not install upstream skills or claim engine/runtime readiness.
metadata:
  version: "1.0.0"
  source: "https://github.com/gamedev-skills/awesome-gamedev-agent-skills"
  upstream_commit: "7eb1b53305fab881f4758e2eff2e371cd7869221"
---

# awesome-gamedev-agent-skills

Use this operator for the named `gamedev-skills/awesome-gamedev-agent-skills` project. It is a **single operator for source inspection and selective adoption**, not a vendored copy of the upstream collection and not a replacement for the local game skills.

## When to use this skill

- The user names this repository, its router, its Claude plugin bundles, or its cross-engine catalog.
- A maintainer needs the pinned inventory, source/license evidence, or a collision-aware selection plan.
- A project needs guidance for one detected engine, task, genre, or shipping workflow from the upstream catalog.
- A maintainer needs to compare a selected upstream skill with an existing local skill before any install or adaptation.

## When not to use

- Do not use this as a generic gameplay router when the task belongs to `web-game-development` or an existing local game skill.
- Route generic Unity pack discovery and adoption to `unity-gamedev-skill-pack`.
- Do not claim that installing this guide installs upstream skills, a plugin, an engine, dependencies, assets, providers, or a game project.

## Instructions

### 1. Freeze and inspect the source

1. Confirm the exact repository and pin: `gamedev-skills/awesome-gamedev-agent-skills` at commit `7eb1b53305fab881f4758e2eff2e371cd7869221`.
2. Fetch or receive the pinned public tree into a private, absolute, non-symlink source directory. Do not run upstream code, installers, engines, compilers, providers, or asset generators.
3. Run the bundled helper with no source first, then against the pinned source:

   ```bash
   python3 .agent-skills/awesome-gamedev-agent-skills/scripts/preflight.py --json
   python3 .agent-skills/awesome-gamedev-agent-skills/scripts/preflight.py --json \
     --repo /absolute/path/to/gamedev-skills-7eb1b53305fab881f4758e2eff2e371cd7869221
   ```

   The report is offline selected-file evidence only. `runtime_verified=false` and `whole_revision_verified=false` are expected; a matching selected-file hash is not a Git HEAD, dependency, security, or engine-readiness claim.
4. Inspect `LICENSE` in full and retain the readable `NOTICE` attribution/trademark text when distributing derivative guidance. The pinned root license is Apache-2.0. Original leaf references are not proof that every upstream leaf license or safety property was audited.
5. Derive inventory from the pinned tree, not the README badge: the audited tree contains 77 `SKILL.md` files (76 leaf skills plus one router). The pinned category counts are Godot 16, disciplines 15, other-engines 11, genres 9, Unity 8, Unreal 6, web-engines 6, workflows 4, Ebitengine 1, and router 1.

### 2. Detect one engine and preserve versions

- Follow the upstream router's exclusive precedence: Godot, Unreal, Unity, Ebitengine, Bevy, Phaser, PixiJS, three.js, Defold, LÖVE, pygame, then Roblox. For monorepos, route by the file/subdirectory or ask one targeted question when still ambiguous.
- Read the project's manifest, lockfile, engine metadata, or pinned toolchain before selecting APIs. Preserve an existing version and package lock. Baselines are for new projects only: Godot 4.7/.NET 8, Unity 6.3 LTS/6000.3, Unreal 5.8, Ebitengine 2.10.5 with Go 1.25+, Phaser 4.2, PixiJS 8.21, three.js r186, Bevy 0.20, pygame-ce 2.5.8, LÖVE 11.5, Defold 1.14.0, and rolling Roblox APIs.
- State binding gaps instead of fabricating a skill. Defold has one `defold-core` skill and no dedicated GUI, tilemap, or physics skill; pair it with the relevant portable discipline and state the gap. The collection also has no dedicated tilemap skill for web, Bevy, pygame, Roblox, LÖVE, or Defold, and no dedicated Unity 2D-movement or Unity 3D-essentials skill.

### 3. Select, compare, and install only what was approved

1. For source-backed routing, start with the upstream router only while the original pinned tree/layout remains available. For a flattened install, select by installed skill name and sibling path from the preloaded descriptions instead. Read each selected leaf body before adopting it; open references only when the task needs them. If a selected leaf is absent, fail closed rather than claiming the router is ready.
2. List the source before writing. With audited `skills` CLI **1.7.0**, the local source directory is the positional package argument (the installed help has no `--source` flag):

   ```bash
   npx -y skills@1.7.0 add /absolute/path/to/gamedev-skills-7eb1b53305fab881f4758e2eff2e371cd7869221 --list
   npx -y skills@1.7.0 add /absolute/path/to/gamedev-skills-7eb1b53305fab881f4758e2eff2e371cd7869221 \
     --skill godot-2d-movement --agent codex --copy --yes
   ```

   `--skill`, `--agent`, `--copy`, `--yes`, and `--list` are the audited 1.7.0 selectors. Keep the source path pinned; do not silently substitute a moving branch or latest release. The default flattened CLI delivery is leaf-only: dispatch by installed skill name/sibling path, not by the upstream router's literal `skills/<category>/<name>/SKILL.md` paths.
3. Name the destination explicitly (`.agents/skills`, `.claude/skills`, `.cursor/skills`, or the harness's native path), preview the exact selected names, compare each against the destination, and obtain approval before writing. Never overwrite or silently merge local skills.
4. This catalog has known generic-name collisions with local skills: `game-feel`, `game-ui-ux`, and `performance-optimization`. Keep the upstream copy isolated or adapt it under a distinct approved name; do not replace local copies. Preserve the local owner and route to it when it already covers the request.
5. Choose exactly one delivery path per harness: universal `skills@1.7.0` leaf-only copy/symlink **or** the upstream Claude plugin/source-backed path that preserves the original tree/layout. Do not install both. The plugin manifest groups `router`, `gamedev`, engines, `disciplines`, `genres`, and `workflows`; a plugin listing is not proof that its leaves were installed or that router activation works.

### 4. Gate side effects separately

- **Skill/plugin writes:** preview and approve the destination and collision plan first.
- **Dependencies and engine/editor/build actions:** obtain a separate approval; this operator never runs them.
- **Asset generation or provider calls:** obtain a separate approval, with provider, cost, and output path stated.
- **Game/store uploads or publishing:** obtain a separate approval and verify the exact target; this operator never uploads.

## Examples

- “Audit `gamedev-skills/awesome-gamedev-agent-skills` at the pinned commit and tell me what is actually present.” → run the offline helper, inspect the selected source evidence, and report 77 tree skills versus the README's 76-plus-router claim.
- “Use the upstream router for my existing Defold project.” → keep the original pinned tree/layout available, read `game.project` and the project toolchain, select `defold-core` plus only needed portable disciplines, and state the missing dedicated GUI/tilemap/physics coverage without upgrading Defold. If the selected leaf is absent, fail closed.
- “Install the Godot movement leaf from this pinned checkout.” → preview the local source with `skills@1.7.0 --list`, compare the explicit destination and collisions, then ask for approval before the leaf-only CLI path writes files; dispatch by the installed skill name/sibling path, not the upstream router's source-layout path.

## Best practices

1. Prefer source-derived facts and selected-file hashes over README counts or marketplace names.
2. Keep one engine API owner, one portable-concept owner, and one approved install path; do not combine examples from different engine majors.
3. Treat a clean helper report as provenance evidence only. It does not prove runtime behavior, leaf quality, complete-revision integrity, or engine readiness.
4. Keep the upstream Apache-2.0 license and NOTICE attribution visible in any distributed derivative material.
5. Record skipped leaves, collisions, version assumptions, binding gaps, approvals, and unverified runtime steps so a later maintainer can reproduce the decision.

## References

- [`references/upstream.md`](references/upstream.md) — pinned source inventory, license, router, installer, version-policy, collision, and side-effect notes.
- [`references/source.json`](references/source.json) — selected pinned public-file SHA256 values; this is not a whole-revision attestation.
- [Pinned upstream tree](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/tree/7eb1b53305fab881f4758e2eff2e371cd7869221)
