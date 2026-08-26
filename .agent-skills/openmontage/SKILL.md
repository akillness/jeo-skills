---
name: openmontage
description: >
  Operate calesthio/OpenMontage, the AGPL-3.0 agent-orchestrated video
  production repository where a coding agent reads YAML pipelines and
  Markdown directors, invokes Python tools, checkpoints JSON artifacts, and
  exposes runs in the Backlot board. Route one request to one mode: assess and
  bootstrap a checkout; select a live pipeline from `pipeline_defs` and run
  `provider_menu_summary()` preflight; analyze a reference video; start or
  resume a checkpointed production with cost and human gates; inspect
  Backlot/project state; or extend and verify a provider, pipeline, renderer,
  or contract. Use when the user names OpenMontage or is operating its
  repository. Triggers on: OpenMontage, calesthio/OpenMontage, AGENT_GUIDE.md,
  pipeline_defs, provider_menu_summary, decision_log, Backlot, video_compose,
  Remotion vs HyperFrames, checkpoint_<stage>.json, agentic video production.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  OpenMontage needs Python 3.10+, FFmpeg, Node.js 18+, and a filesystem-capable
  coding agent. HyperFrames needs Node.js 22+; Remotion needs the repository's
  `remotion-composer` dependencies. Provider keys and a local GPU are optional,
  but generation APIs can spend money and GPU installs are large. The upstream
  source is AGPL-3.0 and has no tagged release at this skill's pinned revision.
license: AGPL-3.0
metadata:
  category: creative-media
  subcategory: video
  interface: workflow
  tags: openmontage, agentic-video, video-production, pipeline, backlot, remotion, hyperframes, ffmpeg, provider-routing, checkpoints
  platforms: Claude Code, Cursor, Copilot, Windsurf, Codex
  version: "1.0"
  source: https://github.com/calesthio/OpenMontage
---

# OpenMontage agentic video production

OpenMontage is not a one-command video generator. The coding agent is the control
plane: it reads a pipeline manifest, reads the director for the current stage,
discovers tools from the Python registry, writes schema-checked artifacts and
checkpoints, and pauses at manifest-defined approval gates. Backlot is a read-only
view over those files.

This skill was audited against upstream commit
`cd9f3c1f03368be87b140af494914b8ee4e3c7a4` (2026-08-22). The repository had no
Git tags or GitHub releases when audited on 2026-08-26. Pin the commit for a durable
production and re-audit current `main` before claiming newer behavior.

## When to use this skill

- Install, inspect, update, or troubleshoot a `calesthio/OpenMontage` checkout
- Match an OpenMontage brief to a live manifest in `pipeline_defs/`
- Run the mandatory capability and provider preflight without exposing key values
- Analyze a reference video before proposing differentiated concepts
- Start, resume, inspect, or recover a project under `projects/<project-id>/`
- Apply the decision log, budget, render-runtime, music, review, and human-gate contracts
- Use or troubleshoot the Backlot living storyboard
- Add or audit an OpenMontage tool, provider, selector, pipeline, renderer, schema, or test

Do not use this skill for:

- Generic programmable-video planning without an OpenMontage checkout: use
  `video-production`
- A narrow Remotion implementation independent of OpenMontage: use
  `video-production` or `remotion-video-production`
- Manual timeline editing: use `opencut` or `palmier-pro`
- Reconstructing a reference video's design as a prompt only: use
  `video-to-superprompt`; use this skill when OpenMontage will analyze and produce it
- Vox-style paper collage only: use `vox-director`
- The OpenStory Cloudflare codebase: use `openstory`

## Instructions

### Step 0: Enforce the repository contract

These rules apply in every mode:

1. Read the checkout's `AGENT_GUIDE.md` and `PROJECT_CONTEXT.md` before acting. For a
   production, also read the selected manifest, the current stage director under
   `skills/pipelines/`, and every Layer 3 skill named by a tool's `agent_skills` field.
2. Route every production through a manifest. Do not replace the agent protocol with an
   ad hoc Python script or a direct provider call.
3. Run capability preflight before creative work. Treat the live registry and selected
   manifest as authoritative when static documentation disagrees.
4. Before a paid or consequential call, announce the exact tool, provider, model or
   variant, why it was selected, whether it is a sample or batch, and the approved cost
   ceiling. Never print secret values.
5. Do not silently switch provider, model family, still-led versus motion-led treatment,
   composition runtime, narration, music, or another approved production choice. Surface
   the blocker, recommend options, wait for approval, and append the revised decision.
6. A manifest approval gate is binding. Write `awaiting_human`, present the artifact,
   review, and cost snapshot, then end the turn. Continue only after a later user reply.
7. Keep generated outputs under `projects/<project-id>/`. Root files and temporary paths
   are invisible to Backlot and violate the workspace contract.
8. OpenMontage source is AGPL-3.0. Preserve notices and source obligations when copying,
   modifying, serving, or distributing upstream code. Do not paste upstream source into
   a differently licensed project without an explicit licensing decision.

Read `references/production-contract.md` before any real production and
`references/upstream-and-setup.md` before installation or upstream code reuse.

### Step 1: Pick exactly one operating mode

| Mode | Choose it when | First action |
|---|---|---|
| `fit-bootstrap` | The checkout or host may not be ready | Run the bundled read-only doctor |
| `route-preflight` | A brief needs a pipeline and real capability plan | Inventory manifests, then run registry summary |
| `reference-analysis` | A URL or local video is inspiration | Read `skills/meta/video-reference-analyst.md` |
| `produce-resume` | A production must start or continue | Read `project.json` and compute the next stage |
| `inspect-backlot` | The board or project state looks stale or incomplete | Inspect its disk sources before restarting anything |
| `extend-verify` | A tool, provider, pipeline, renderer, schema, or contract changes | Identify the owning layer and freeze a narrow test |

Do not combine installation, paid generation, full production, and repository changes in
one opaque shell block.

### Step 2: Inspect the checkout without changing it

Use the bundled helpers from this skill repository:

```bash
bash .agent-skills/openmontage/scripts/openmontage.sh doctor /path/to/OpenMontage
bash .agent-skills/openmontage/scripts/openmontage.sh pipelines \
  /path/to/OpenMontage --strict
```

`doctor` checks repository identity, Git state, prerequisite versions, `.env` tracking,
and local runtime folders without installing or printing credentials. `pipelines` parses
the checked-out YAML with the Python standard library, so it works before `make setup`.
The strict form verifies stage-director and orchestrator paths.

For a reproducible checkout:

```bash
git clone https://github.com/calesthio/OpenMontage.git
cd OpenMontage
git checkout cd9f3c1f03368be87b140af494914b8ee4e3c7a4
```

Do not clone or run `make setup` during blanket skill installation. `make setup` creates a
virtual environment, installs Python and Node dependencies plus Piper TTS, and copies
`.env.example` to `.env` when needed. Run it only when the user chooses this project.

### Step 3: Route the brief and run mandatory preflight

1. If the first request is vague, read `skills/meta/onboarding.md`. If it is concrete,
   proceed directly to pipeline selection.
2. If the user supplied inspiration footage, read
   `skills/meta/video-reference-analyst.md` and produce a grounded analysis before normal
   selection. If the user wants their footage edited, use `source_media_review` instead.
3. List the checked-out manifests rather than relying on a remembered pipeline list:

   ```bash
   bash .agent-skills/openmontage/scripts/openmontage.sh pipelines /path/to/OpenMontage
   ```

4. Pick one candidate, then read `pipeline_defs/<name>.yaml`. The manifest's order,
   directors, tools, checkpoint policy, and approval defaults are binding.
5. Run the human-sized registry summary:

   ```bash
   bash .agent-skills/openmontage/scripts/openmontage.sh preflight /path/to/OpenMontage
   ```

   Do not begin with the raw multi-megabyte `support_envelope()` output. Use
   `provider_menu()` or `support_envelope()` only for a focused debugging question.
6. Present configured/total ratios by capability, available local paths, quick setup
   offers grouped by dependency, and runtime warnings. Never show credential values.
7. Check required and fallback tools for the selected manifest and report exactly one of
   `passed`, `degraded`, or `blocked` with the consequence of each missing capability.

Read `references/pipeline-routing.md` for the audited manifest inventory and routing
boundaries. The checked-out manifests still win if they changed after the pin.

### Step 4: Freeze the proposal decisions before generation

Before assets are generated, present:

1. concept directions when the brief is still open;
2. the recommended pipeline and style or taste direction;
3. the exact provider/tool path and available alternatives;
4. cost estimate, approved ceiling, and quality tradeoffs;
5. a music plan: library, licensed search, generation provider and cost, supplied track,
   or explicit no-music choice;
6. the stage plan and approval gates;
7. composition runtime and composition mode as separate decisions.

If Remotion and HyperFrames are both available, present both with a brief-specific benefit
and drawback, recommend one, and wait for explicit approval. Include FFmpeg when it is a
viable third option. If one runtime is unavailable, name it and record why. Never silently
swap a locked runtime.

Separately choose:

- `templated` for stock scene types, repeatable batches, quick drafts, or localization;
- `atelier` for one-off hero work, after reading `skills/meta/taste-direction.md` and
  `skills/meta/bespoke-composition.md`.

Record each choice in the append-only `decision_log`. A revised choice appends a new entry
with the same `(category, subject)` pair. It never rewrites history or changes the subject
to evade supersession.

### Step 5: Initialize or resume the canonical project

Create a kebab-case project id only after the pipeline is selected:

```bash
cd /path/to/OpenMontage
.venv/bin/python -c "from lib.checkpoint import init_project; init_project('my-project', title='My Project', pipeline_type='cinematic')"
.venv/bin/python -m backlot open my-project
```

Backlot is an observer. If it fails to open, continue the production and diagnose it
separately. Before doing a stage, compute the real resume point:

```bash
.venv/bin/python -c "from pathlib import Path; from lib.checkpoint import get_next_stage; print(get_next_stage(Path('projects'), 'my-project', 'cinematic'))"
```

Then:

1. Read prior checkpoints, canonical artifacts, `decision_log.json`, and partial progress.
2. If a stage is `awaiting_human`, present it and wait. Do not recompute or advance it.
3. If it is `in_progress`, resume from `metadata.partial_progress` and completed item ids;
   never repeat a paid or completed unit blindly.
4. Before each stage, read that stage's director skill and write an `in_progress`
   checkpoint.
5. Pass explicit output paths under the project directory to every tool. Refresh partial
   progress after each expensive scene, clip, or render unit.
6. Self-review against the manifest's `review_focus`, with at most two rounds, then write
   the canonical artifact and checkpoint.
7. At a gated stage, write `awaiting_human`, show the Backlot/artifact review surface,
   findings, spend, and next cost, then end the turn. After approval, write `completed`
   with `human_approved=True` and only then advance.

### Step 6: Compose, inspect, and prove the deliverable

- Treat motion-required briefs as motion-required. A still animatic or FFmpeg-only
  downgrade is a new creative decision, not a fallback.
- Run the selected compose director's pre-compose checks before spending render time.
- Do not render a full draft to satisfy the assets gate. Review asset filmstrips or
  per-scene atelier stills first; compose starts only after that gate is approved.
- After render, follow the compose director's final review: inspect metadata with ffprobe,
  sample frames across the timeline, analyze audio, verify subtitles and the delivery
  promise, and watch the final video.
- A file existing at `renders/final.mp4` is not proof that the production succeeded.
- Backlot derives state from `project.json`, manifests, checkpoints/history, artifacts,
  `events.jsonl`, cost snapshots, and renders. Inspect those sources when its display
  appears wrong; do not make the board a second source of truth.

Use the project inspector for a compact, credential-free disk report:

```bash
bash .agent-skills/openmontage/scripts/openmontage.sh project \
  /path/to/OpenMontage my-project
```

### Step 7: Extend the owning layer and verify narrowly

- **Provider/tool:** subclass `BaseTool`, use PascalCase without a `Tool` suffix, declare
  dependency/capability/provider/runtime/status/contracts, return `ToolResult`, and let
  registry discovery expose it. A correctly classified image/video/TTS provider should
  flow into its selector without hardcoded selector edits.
- **Layer 2 behavior:** update `skills/` when OpenMontage-specific workflow or quality
  guidance changes.
- **Layer 3 technique:** update `.agents/skills/` when vendor or technology knowledge
  changes; keep the tool's `agent_skills` pointer accurate.
- **Pipeline:** add a YAML manifest plus every referenced director, valid produces/tools
  declarations, review criteria, success criteria, and approval defaults. Add or change a
  schema only when the artifact contract truly changes.
- **Backlot:** preserve read-only derivation from canonical project files. Do not make UI
  state necessary for pipeline correctness.

Run the smallest proof first, then the full suite:

```bash
bash .agent-skills/openmontage/scripts/openmontage.sh pipelines . --strict
bash .agent-skills/openmontage/scripts/openmontage.sh test-contracts .
make lint
make test
```

`test-contracts` and the Make targets can write normal test caches but must not make paid
provider calls. Read `references/extension-and-verification.md` for layer ownership,
contract tests, render checks, and AGPL contribution boundaries.

## Examples

### Example 1: Check a fresh clone before setup

```bash
bash .agent-skills/openmontage/scripts/openmontage.sh doctor ~/src/OpenMontage
bash .agent-skills/openmontage/scripts/openmontage.sh pipelines \
  ~/src/OpenMontage --strict
```

Resolve Python, FFmpeg, or Node blockers deliberately. Do not install GPU packages or
provider SDKs just because they exist.

### Example 2: Start from a reference Short

Read `skills/meta/video-reference-analyst.md`, analyze transcript, pacing, scenes,
keyframes, and style, then run preflight and present two or three differentiated concepts.
Do not offer a carbon copy or skip directly to prompt generation.

### Example 3: Resume an assets stage

```bash
bash .agent-skills/openmontage/scripts/openmontage.sh project . my-project
```

If `checkpoint_assets.json` is `in_progress`, load its partial scene ids and continue at
the first missing unit. If it is `awaiting_human`, show the existing filmstrip and wait.

### Example 4: Add a video provider

Create one concrete `BaseTool` implementation, declare
`capability="video_generation"`, add its Layer 3 guidance, and prove discovery plus the
selector and contract tests. Do not put the provider into a static selection order.

## Best practices

1. Pin the upstream commit for durable productions; describe moving `main` as moving.
2. Run `provider_menu_summary()` first and translate it instead of pasting registry dumps.
3. Let the selected manifest, not a generic stage diagram, define stage order and gates.
4. Keep cost estimates, approvals, and substitutions explicit and append-only.
5. Present every available composition runtime and keep runtime separate from authoring mode.
6. Resume checkpoints and provider tasks rather than repeating paid work.
7. Keep every artifact and output under the canonical project workspace.
8. Treat Backlot as a read-only view, not orchestration state.
9. Validate the final media visually and audibly, not by exit code or file existence.
10. Preserve AGPL obligations when modifying or redistributing upstream code.

## References

- `references/upstream-and-setup.md` - pinned source, prerequisites, install side effects, providers, licensing
- `references/pipeline-routing.md` - audited manifests, stage gates, reference and source-footage boundaries
- `references/production-contract.md` - preflight, decisions, costs, checkpoints, Backlot, render governance
- `references/extension-and-verification.md` - tool and pipeline ownership, tests, render proof, contribution rules
- `scripts/openmontage.sh` - safe doctor, pipeline inventory, provider preflight, project report, contract test wrapper
- `scripts/pipeline_inventory.py` - dependency-free manifest and director-path validator
- [OpenMontage repository](https://github.com/calesthio/OpenMontage)
- [Pinned upstream source](https://github.com/calesthio/OpenMontage/tree/cd9f3c1f03368be87b140af494914b8ee4e3c7a4)
