---
name: godogen
description: >
  Drive Godogen (htdt/godogen), the MIT-licensed publish-time generator that
  turns a game description into an autonomous Claude Code or Codex build for
  Godot 4 C#, Bevy Rust, or Babylon.js TypeScript. Route one request to one
  mode: preflight the toolchain and API keys; publish a fresh game repository
  or safely refresh a matching existing runtime with `./publish.sh --engine
  ...`; run the build and prove it from the live
  game or a 15-20s recording; budget paid Gemini, Grok, and Tripo3D asset
  generation; apply engine-specific build and capture rules; troubleshoot
  rendering and capture failures; or contribute through the issue-first
  upstream process. Use when the user wants an agent to build a playable game
  end to end with Godogen. Triggers on: godogen, htdt/godogen, publish.sh
  --engine, autonomous game development, Godot C# agent build, Bevy agent
  build, Babylon.js agent game, asset-gen, Tripo3D rig, proof video.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Godogen publishes for Claude Code or Codex on Ubuntu, Debian, or macOS.
  Shared tooling needs Bash, rsync, and Python 3.10+; Git is recommended for
  the initialized game repo. Engine lanes need
  Godot 4 .NET plus .NET 9, current Rust and Cargo, or Node 22.12+ plus Chrome
  with WebGL2. Asset generation optionally needs paid provider keys. The
  bundled helper is read-only and the cost estimator is offline.
metadata:
  tags: godogen, autonomous-game-development, godot, bevy, babylonjs, claude-code, codex, asset-generation, tripo3d, proof-video
  platforms: Claude Code, Codex
  version: "1.0"
  source: https://github.com/htdt/godogen
---

# Godogen autonomous game generation

Godogen is a source repository that publishes a thin agent runtime into a fresh
game repository. It is not the generated game and it is not a globally
installed CLI:

```text
godogen source -> published game repo -> game built by Claude Code or Codex
```

This skill tracks the docs-only runtime at upstream commit
`05cebffc8b10c5817e8a3db495b82e7b6004ab84` (2026-07-02). That version publishes
one runtime manifest, one engine guide, and one `asset-gen` skill. Older posts
that describe planner, decomposer, scaffold, lookup, capture, or Telegram-hook
skills are stale.

## When to use this skill

- Decide whether Godogen fits a game brief and choose Godot, Bevy, or Babylon.js
- Check the host toolchain, rendering path, browser, and provider-key presence
- Publish Godogen into a new game repository or refresh a recognized same-lane runtime
- Run or steer an autonomous build under Godogen's live-game and proof-video contract
- Plan or troubleshoot paid image, video, GLB, rigging, retargeting, or sprite work
- Apply the engine-specific rules that compile successfully but fail visibly at runtime
- Diagnose a stalled Tripo3D task, black capture, missing Godot assembly, Bevy API drift,
  or Babylon software-renderer fallback
- Contribute to `htdt/godogen` after an upstream issue has been approved

Do not use this skill for:

- Unity or Unreal builds: use `unity-cli`, `unity-gamedev-skill-pack`, or
  `game-build-log-triage`
- Generic Three.js browser games: use `web-game-development` and the `threejs-*` family
- Standalone sprite generation: use `perfectpixel`
- Standalone auto-rigging: use `unirig`
- SFX, VFX, playtesting, or store launch: use `rfxgen`, `game-vfx`, `wai-play`, or
  `steam-store-launch-ops`
- A multi-role studio process independent of Godogen: use `game-studio-harness`

## Instructions

### Step 0: Enforce the safety contract

These rules apply before choosing a mode:

1. **Use a fresh, empty target by default.** A nonempty target is eligible only when
   the bundled `plan` helper recognizes the selected agent manifest, selected engine
   guide, and an agent skills directory containing only `asset-gen`:

   ```bash
   bash .agent-skills/godogen/scripts/godogen.sh plan \
     --engine godot --agent claude --out /path/to/game
   ```

   A recognized refresh must use normal publish after the game repo is committed or
   backed up. Never add `--force` to a refresh.

2. **Treat `--force` as destructive.** Upstream runs `rm -rf` on the resolved target.
   Never use it on a path with valuable contents. Show the exact target and obtain the
   user's explicit approval before any forced publish.
3. **A normal publish can still delete sibling skills.** Upstream uses `rsync --delete`
   on the entire `.claude/skills/` or `.agents/skills/` directory, not just
   `asset-gen/`. An existing repo with unrelated skills is not a safe target.
4. **Confirm spend before the first paid call.** Estimate the full plan, show provider,
   operation counts, and maximum cost, then get explicit approval. Do not treat a
   general request to build a game as approval for an unknown API bill.
5. **Resume timed-out Tripo jobs. Never resubmit them.** The task id is in
   `<output>.tripo.json`; `asset_gen.py resume -o <output>` polls the existing task for
   no extra cost. A second `glb`, `rig`, or `retarget` submission can double-charge.
6. **Never print secrets.** Report `GOOGLE_API_KEY`, `XAI_API_KEY`, and
   `TRIPO3D_API_KEY` as `SET` or `MISSING` only.
7. **Prove the running game.** A clean compile is a gate, not completion.

Read `references/upstream-and-publish.md` before a publish and
`references/asset-generation.md` before any provider call.

### Step 1: Pick exactly one operating mode

| Mode | Choose it when | First action |
|---|---|---|
| `preflight` | Engine or host readiness is uncertain | Run `godogen.sh doctor <engine>` |
| `publish` | A new repo or recognized same-lane runtime must be rendered | Run the read-only `plan` helper |
| `run-delivery` | The published repo exists and the game must be built | Read its manifest and engine guide |
| `asset-spend` | Images, video, GLB, rigging, or retargeting are needed | Build and approve a cost plan |
| `engine-capture` | Engine-specific implementation or proof is failing | Read `references/engine-guides.md` |
| `troubleshoot` | A concrete failure or stalled task exists | Identify the failing layer before retrying |
| `contribute` | The user wants to change upstream Godogen | Open or confirm an approved issue first |

Do not blend setup, publication, paid generation, and engine execution into one
unreviewable shell block.

### Step 2: Preflight the selected lane

Run the read-only helper:

```bash
bash .agent-skills/godogen/scripts/godogen.sh doctor all
bash .agent-skills/godogen/scripts/godogen.sh doctor godot
bash .agent-skills/godogen/scripts/godogen.sh doctor bevy
bash .agent-skills/godogen/scripts/godogen.sh doctor babylon
```

The helper checks command presence and versions without installing anything or
printing key values. Interpret missing tools by lane; for example, Rust is not a
Godot blocker and Godot is not a Babylon blocker. Use
`references/setup-and-delivery.md` for the exact prerequisites and manual verify
commands.

### Step 3: Publish or refresh a game repository

1. Inspect or clone the upstream source. Pin a commit for reproducibility when a
   durable build matters.
2. Run the `plan` helper against the intended target. If it blocks, choose a new empty
   directory and do not weaken the check. If it recognizes a same-lane runtime, commit
   or back up the game repo and use normal publish without `--force`.
3. Choose one engine and one host agent:

   ```bash
   ./publish.sh --engine godot   --agent claude --out /path/to/new-game
   ./publish.sh --engine bevy    --agent codex  --out /path/to/new-game
   ./publish.sh --engine babylon --agent claude --out /path/to/new-game
   ```

4. Inspect the rendered manifest, engine guide, `asset-gen` folder, `.gitignore`, and
   Git status. On refresh, review the diff and verify gameplay files were preserved.
   Upstream runs `git init` when Git is available and writes `.gitignore` only when one
   does not already exist.
5. Do not add `--force` merely because publication failed. Diagnose the target first.

The exact Claude/Codex layouts and template values are in
`references/upstream-and-publish.md`.

### Step 4: Run under the delivery contract

Inside the published game repository:

1. Read `CLAUDE.md` or `AGENTS.md`, then the rendered engine guide.
2. Keep durable status in the game's `README.md`: built, remaining, and an asset table
   with in-game size, path, and cost.
3. Match the execution style to the brief:
   - open-ended or collaborative direction: expose the live game early and checkpoint
     taste, scope, and cost decisions;
   - finished brief: make reasonable calls, run steadily, and avoid unnecessary
     blocking questions.
4. Run the engine's compile/import gates, then inspect the running game.
5. If the user has not seen it live, finish with a 15-20 second proof video and watch
   it back before reporting completion.

A full run may take hours. On a remote GPU host, keep it inside `tmux` or `screen` and
use the official Claude Code or Codex remote-control surface rather than an ad hoc
background process.

### Step 5: Budget and run asset generation

Before any paid call, estimate the frozen upstream rates offline:

```bash
python3 .agent-skills/godogen/scripts/cost-estimate.py \
  --grok-images 4 --gemini-1k 2 --video-seconds 6 \
  --glb 2 --rig 1 --retarget 3
```

Show the estimate, state that provider prices can change, and obtain approval for the
specific plan. Then use the published repo's `asset-gen` tools. Claude publishes them
under `.claude/skills/asset-gen/`; Codex uses `.agents/skills/asset-gen/`.

For sprite, GLB, rigging, retargeting, background-removal, logging, and retry recipes,
read `references/asset-generation.md`. Review each reference image before paying for a
downstream GLB or rig.

### Step 6: Apply the engine guide, then verify visibly

- **Godot:** .NET/Mono only; C# classes are `partial`; generated scenes need correct
  owner chains and pack validation; use primitive colliders for imported GLBs.
- **Bevy:** resolve and pin the current stable version; keep all `bevy_*` crates on one
  minor; verify APIs against installed source; capture from a dedicated offscreen
  binary, not the windowed app.
- **Babylon.js:** use Vite + TypeScript; bind the dev server to a shareable fixed port;
  register required side-effect imports; reject SwiftShader/llvmpipe/lavapipe as proof
  of a correctly configured GPU path.

Read `references/engine-guides.md` for the silent-failure checks and capture commands.
Do not copy an old engine recipe without matching it to the installed version.

### Step 7: Troubleshoot before retrying

Classify the first failed layer:

1. `publish`: target safety, Bash, Python, rsync, or template rendering
2. `toolchain`: Godot/.NET, Rust/Bevy, Node/npm, browser, Vulkan, Xvfb, ffmpeg
3. `build`: compile/import/package errors
4. `runtime`: missing assets, side-effect imports, scene serialization, physics
5. `capture`: camera timing, offscreen target, WebGL renderer, load readiness
6. `provider`: key, quota, generation error, or pending Tripo sidecar

Do not repeat a paid call or long build until the layer is known. For a pending Tripo
sidecar, resume. For contribution work, upstream requires an approved issue before a PR
and favors narrow, evidence-backed changes.

## Examples

### Example 1: Check whether a Godot build host is ready

```bash
bash .agent-skills/godogen/scripts/godogen.sh doctor godot
```

Resolve only Godot blockers, then verify `dotnet --version`, a `.mono` Godot build, and
`godot --headless --quit`.

### Example 2: Preview a Codex Babylon publication

```bash
bash .agent-skills/godogen/scripts/godogen.sh plan \
  --engine babylon --agent codex --out "$HOME/new-babylon-game"
```

Proceed only if the helper reports a new/empty target or a recognized same-lane refresh.
Expect `AGENTS.md`,
`babylon.md`, `.agents/skills/asset-gen/`, an engine `.gitignore`, and a Git repository.

### Example 3: Recover a timed-out Tripo3D model

```bash
python3 .agents/skills/asset-gen/tools/asset_gen.py resume -o assets/model.glb
```

Do not submit `glb` again while `assets/model.glb.tripo.json` records the task.

### Example 4: Price a rigged character with three clips

```bash
python3 .agent-skills/godogen/scripts/cost-estimate.py \
  --gemini-1k 1 --rig 1 --retarget 3 --json
```

At the pinned rates this is 92 cents: 7 + 55 + 30.

## Best practices

1. Prefer a new target; refresh only a helper-recognized same-lane runtime and never use `--force`.
2. Pin the upstream commit for reproducible publication; re-read current upstream before
   claiming a latest-version behavior.
3. Keep the published runtime thin; do not resurrect the pre-2026-07-02 skill pipeline.
4. Separate compile gates from running-game proof.
5. Show a cost ceiling and asset count before spending.
6. Resume Tripo sidecars instead of resubmitting.
7. Keep generation references and captures outside runtime asset directories.
8. Record each generated asset's in-game size and cost in the game README.
9. Trust installed engine/package sources over model memory when APIs differ.
10. Watch every final proof video; file existence alone is not visual verification.

## References

- `references/upstream-and-publish.md` - pinned architecture, payload, flags, deletion hazards
- `references/setup-and-delivery.md` - prerequisites, key handling, and delivery modes
- `references/asset-generation.md` - paid models, costs, commands, sprite and Tripo recovery
- `references/engine-guides.md` - Godot, Bevy, Babylon build and capture rules
- `scripts/godogen.sh` - read-only host doctor, publication plan, and pinned URLs
- `scripts/cost-estimate.py` - offline cost estimate at pinned upstream rates
- [Godogen repository](https://github.com/htdt/godogen)
- [Pinned upstream source](https://github.com/htdt/godogen/tree/05cebffc8b10c5817e8a3db495b82e7b6004ab84)
