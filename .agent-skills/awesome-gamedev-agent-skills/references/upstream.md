# awesome-gamedev-agent-skills pinned source notes

Observed 2026-10-24 (UTC). The exact public source is [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/tree/7eb1b53305fab881f4758e2eff2e371cd7869221) at full commit `7eb1b53305fab881f4758e2eff2e371cd7869221`. The pinned archive was fetched into the private temporary source root `/private/tmp/gamedev-skills-src-7eb1b53305fab881f4758e2eff2e371cd7869221` for audit; a later verification should use this absolute, non-symlink source path. The path is operational evidence, not a required install location.

The twelve selected public files were hashed from that tree. Their SHA256 values and commit-pinned URLs are in [`source.json`](source.json). This is selected-file evidence only: it is not a Git HEAD, complete-revision, dependency, runtime, engine-readiness, leaf-quality, or security attestation. The local helper intentionally has no `--expect-commit` option and never invokes Git or upstream code.

## Source-verified inventory

- The tree contains **77 `SKILL.md` files**: 76 leaf skills and one `router/SKILL.md`. The README and plugin descriptions say **76 skills + router**; that wording is consistent once the router is counted separately, but the tree count is the authoritative observed count.
- Category counts from the pinned tree: Godot 16; disciplines 15; other-engines 11; genres 9; Unity 8; Unreal 6; web-engines 6; workflows 4; Ebitengine 1; router 1.
- The root README lists Godot, Unity, Unreal, Ebitengine, Phaser, PixiJS, three.js, Bevy, pygame, LÖVE, Defold and Roblox. It presents the universal `skills` CLI and Claude plugin marketplace as alternatives, not a requirement that both be installed.
- The source tree's `scripts/validate-skills.py` is an upstream validator. It was inspected for scope and link rules but is not copied into this operator; no upstream validation script is executed by the helper.

## License and attribution

The full pinned root [`LICENSE`](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/7eb1b53305fab881f4758e2eff2e371cd7869221/LICENSE) is Apache License 2.0. The pinned [`NOTICE`](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/7eb1b53305fab881f4758e2eff2e371cd7869221/NOTICE) attributes Abhishek Barali and contributors, says the skills were authored from primary documentation, and records descriptive trademark use. Preserve a readable copy of those attribution/trademark notices when distributing derivative material. The upstream NOTICE's statement that its skills are original works is source-reported, not an audit of every leaf's licensing or safety.

## Router and version policy

The pinned [`router/SKILL.md`](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/7eb1b53305fab881f4758e2eff2e371cd7869221/router/SKILL.md), [`engine-detection.md`](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/7eb1b53305fab881f4758e2eff2e371cd7869221/router/references/engine-detection.md), and [`routing-table.md`](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/7eb1b53305fab881f4758e2eff2e371cd7869221/router/references/routing-table.md) require an exclusive engine choice, then additive task/genre/workflow selection and progressive disclosure. The router says to read each chosen leaf body before acting and open references only on demand.

The pinned [`docs/VERSION-SUPPORT.md`](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/7eb1b53305fab881f4758e2eff2e371cd7869221/docs/VERSION-SUPPORT.md) lists new-project authoring baselines: Godot 4.7 and .NET 8; Unity 6.3 LTS / 6000.3; Unreal 5.8; Ebitengine v2.10.5 with Go 1.25+; Phaser 4.2; PixiJS 8.21; three.js r186; Bevy 0.20; pygame-ce 2.5.8; LÖVE 11.5; Defold 1.14.0; and rolling Roblox APIs. It explicitly says existing projects keep the version in their manifest, lockfile, or engine metadata unless migration is requested. Do not propose an arbitrary engine upgrade.

Defold has one core leaf, `defold-core`, and the pinned leaf says there is no dedicated GUI, sprite/tilemap, or collision skill; use its official-manual pointers plus portable `game-ui-ux`, `level-design`, or `physics-tuning` and state the gap. The routing table also calls out missing tilemap skills for web, Bevy, pygame, Roblox, LÖVE and Defold, and missing dedicated Unity 2D-movement and 3D-essentials skills.

## Installer and plugin evidence

The pinned [`docs/INSTALLATION.md`](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/7eb1b53305fab881f4758e2eff2e371cd7869221/docs/INSTALLATION.md) documents `skills add ... --list`, `--skill`, agent targeting and native destinations. The installed local `skills` CLI reports version **1.7.0**. Its help confirms `--list`, `--skill`, `--agent`, `--copy`, and `--yes`; it does **not** expose a `--source` option, so a local pinned checkout is the positional package argument:

```bash
npx -y skills@1.7.0 add /absolute/path/to/gamedev-skills-7eb1b53305fab881f4758e2eff2e371cd7869221 --list
npx -y skills@1.7.0 add /absolute/path/to/gamedev-skills-7eb1b53305fab881f4758e2eff2e371cd7869221 \
  --skill godot-2d-movement --agent codex --copy --yes
```

The default flattened delivery is **leaf-only**: dispatch by the installed skill name and sibling path. The upstream router contains literal `skills/<category>/<name>/SKILL.md` source-layout paths, so do not claim that a flattened router-only copy is ready. Use source-backed router routing only while the original pinned tree/layout remains available; if a selected leaf is absent, fail closed. This source review proves no router runtime activation.

The CLI source was inspected to confirm `--skill` is a name selector and that local paths are supported. The upstream [`marketplace.json`](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/7eb1b53305fab881f4758e2eff2e371cd7869221/.claude-plugin/marketplace.json) exposes `gamedev` (router plus all 76 leaves), `router`, engine groups, `disciplines`, `genres`, and `workflows`. Use either the universal leaf-only CLI path or the native Claude plugin/source-backed path for a harness, never both. A plugin listing is not proof that its selected leaves were installed or that router activation works.

Before any write, name the destination, preview the exact selected names, compare each destination folder, and get approval. The local catalog already owns `game-feel`, `game-ui-ux`, and `performance-optimization`; those are the only audited upstream/local folder-name collisions. Keep upstream copies isolated or adapt them under a distinct approved name. Never overwrite or silently merge the local owners.

## Workflow-script boundary

The selected [`package_macos_app.py`](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/7eb1b53305fab881f4758e2eff2e371cd7869221/skills/ebitengine/ebitengine-game/scripts/package_macos_app.py) was inspected as a source workflow. It validates Mach-O inputs, stages an app in a temporary directory, refuses an existing output unless `--force` is supplied, and says signing/notarization are separate next steps. This operator does not run it, sign/notarize, build an engine, generate assets, invoke a provider, or upload a game/store artifact.

## Verification boundary

`python3 .../scripts/preflight.py --json --repo <absolute-pinned-source-root>` compares only the listed public files through no-symlink, bounded reads and reports `runtime_verified=false`. A no-source run reports tool discovery without inspecting upstream bytes. A clean selected-file report does not prove the unlisted 65 leaves, plugin installation, engine runtime, dependencies, asset licenses, or project behavior. Authored routing/boundary scenarios live in the owning eval artifact; they are references, not executed model-quality tests.
