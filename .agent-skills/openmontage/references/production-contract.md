# Production contract

## Required reading order

For a production run:

1. `AGENT_GUIDE.md`
2. `PROJECT_CONTEXT.md`
3. `pipeline_defs/<selected>.yaml`
4. the current stage director in `skills/pipelines/`
5. the relevant Layer 2 creative/core/meta guidance in `skills/`
6. every Layer 3 file named by the selected tool's `agent_skills` field
7. source code only when debugging a mismatch or auditing the contract

This preserves OpenMontage's three layers:

- Layer 1: `tools/` and manifests describe what exists and its machine contract;
- Layer 2: `skills/` describes how OpenMontage uses it;
- Layer 3: `.agents/skills/` describes provider or technology technique.

Do not skip directly from a user prompt to a tool call.

## Mandatory provider preflight

Run the current human-sized summary first:

```bash
.venv/bin/python -c "
from tools.tool_registry import registry
import json
registry.discover()
print(json.dumps(registry.provider_menu_summary(), indent=2))
"
```

Translate these fields:

- `composition_runtimes`: FFmpeg, Remotion, and HyperFrames availability;
- `capabilities`: configured/total counts and usable providers by family;
- `setup_offers`: unavailable tools with actionable dependency fixes;
- `runtime_warnings`: silent failures or degraded runtime facts.

Present what works first. Then group quick setup offers by shared dependency and explain
what each unlocks. Never print the raw value of an environment variable.

Use these only when the summary is insufficient:

```bash
# Per-tool detail grouped by capability
.venv/bin/python -c "from tools.tool_registry import registry; import json; registry.discover(); print(json.dumps(registry.provider_menu(), indent=2))"

# Full machine contract, potentially very large
.venv/bin/python -c "from tools.tool_registry import registry; import json; registry.discover(); print(json.dumps(registry.support_envelope(), indent=2))"
```

After reading the selected manifest, classify readiness:

- `passed`: the approved path and required tools are available;
- `degraded`: a transparent lower-quality or narrower path exists and the user accepts its
  effect;
- `blocked`: the delivery promise cannot be met without setup, a new provider, or a changed
  brief.

A degraded path is not permission to execute a substitution.

## Proposal packet

Before asset generation, present:

1. four or five concepts if the direction is genuinely open, otherwise a focused
   interpretation;
2. selected pipeline and why it fits;
3. style playbook or taste direction;
4. exact tool/provider/model path and available alternatives;
5. sample/batch scope;
6. cost estimate, remaining budget, and approved ceiling;
7. music plan;
8. composition runtime;
9. composition authoring mode;
10. stage plan and manifest gates;
11. delivery promise and verification plan.

Do not hide provider choice behind a generic phrase such as "AI video model."

## Decision communication and history

Before each consequential action, state:

- tool;
- provider;
- model or provider variant;
- why it fits the approved brief;
- sample or batch;
- expected cost and budget impact.

The project decision log is append-only. A decision is identified by its
`(category, subject)` pair. If a voice, provider, runtime, model, music source, or other
choice changes, append a new decision with the same category and subject. Move the prior
option into considered/rejected history and explain the change. Do not edit the old entry
or reword the subject to create a second apparently current decision.

If an approved path fails, report:

1. what was attempted;
2. what failed;
3. whether it is authentication, provider access, tool defect, runtime, or creative
   quality;
4. available next options;
5. the recommended option and why.

Wait for approval before a material substitute.

## Composition runtime decision

`video_compose` can expose three parallel engines:

| Runtime | Strong fit | Requirements | Honest tradeoff |
|---|---|---|---|
| FFmpeg | footage cuts, concat, trim, subtitles, audio, simple post | FFmpeg | not a replacement for a motion-graphics runtime |
| Remotion | React scenes, charts, cards, captions, avatar composition, spring motion | Node 18+, npx, installed `remotion-composer` deps | stock scene types can look templated |
| HyperFrames | HTML/CSS/GSAP, kinetic type, product promos, SVG characters, Three.js worlds | Node 22+, npx, FFmpeg, resolvable HyperFrames | different authoring and runtime surface |

When Remotion and HyperFrames are both available:

1. describe what each would do for this brief;
2. give one drawback for each;
3. recommend one tied to the delivery promise;
4. wait for explicit approval;
5. log both, plus FFmpeg when applicable, in `options_considered`.

When one is unavailable, say so and log its machine reason. Once
`proposal_packet.production_plan.render_runtime` is approved, carry it unchanged into
`edit_decisions`. If it later breaks, stop and re-decide. Never silently swap runtimes.

A motion-required request cannot become a still animatic, Ken Burns edit, or FFmpeg-only
substitute without explicit approval of a changed promise.

## Composition authoring mode

Runtime and authoring mode are orthogonal:

- `templated`: stock `cut.type` components, fast and repeatable, appropriate for batches,
  localization, quick drafts, and low-stakes internal pieces;
- `atelier`: bespoke scenes, theme, and motion for one hero deliverable. Read
  `skills/meta/taste-direction.md` and `skills/meta/bespoke-composition.md`; reuse engine
  knowledge but not finished creative components.

Log authoring mode under its own decision category. Explain that atelier costs more agent
time and iteration before asking the user to choose.

## Music plan

Every pipeline with audio needs a music decision at proposal or idea time. Check in order:

1. tracks under `music_library/` and the registry's music-library capability;
2. configured royalty-free search/download tools and their licensing terms;
3. configured music-generation tools, quota, model, and cost;
4. a user-supplied track;
5. explicit no music.

Present actual available choices. If none exists, say so before the asset stage. Record the
decision in the proposal/brief and append it to the decision history.

Do not describe stock or generated music as royalty-free unless the provider/source terms
and intended use support that statement.

## Cost governance

Before a paid operation:

1. ask the tool for an estimate or compute from its current documented contract;
2. include operation count, model, duration/resolution when relevant, currency, and
   uncertainty;
3. reserve against the project budget using the upstream cost tracker;
4. obtain approval when the action, new paid tool, or total plan crosses the configured
   gate;
5. reconcile actual spend after success or failure;
6. persist the cost snapshot and provider evidence.

A provider failure can still incur cost. Do not automatically repeat it. Inspect the
result, provider task id, cost log, events, and partial checkpoint first.

## Checkpoint lifecycle

Use the manifest's stage order and gate flags, not a static list.

### Enter

Write an `in_progress` checkpoint immediately. During long asset or compose loops, refresh
`metadata.partial_progress` after each meaningful item. Incomplete canonical artifacts
belong in metadata unless they already validate against the schema.

### Review

Read the manifest's `review_focus` and selected playbook rules. Run the reviewer before
checkpointing. Critical findings are fixed and re-reviewed; suggestions can be recorded.
The upstream protocol limits self-review to two rounds before proceeding with visible
warnings.

### Gate

If `human_approval_default` is true:

1. write `awaiting_human` with canonical artifact, review, and cost snapshot;
2. show the artifact or Backlot review surface;
3. state concerns and next spend;
4. ask approve, revise, or abort;
5. end the turn;
6. after a later approval, write `completed` with `human_approved=True`.

The writer fails closed for a gated completion without approval. Predecessor checkpoints
must also exist, be valid, be completed, and contain required approval evidence.

### Resume

Use `get_next_stage(Path('projects'), project_id, pipeline_type)`. Then read current and
prior checkpoints. Resume `in_progress` items from their completion markers, present an
`awaiting_human` artifact, and do not throw away `history/` when rerunning a stage.

Checkpoint supersession is archived automatically. Do not manually flatten history.

## Backlot

Commands:

```bash
.venv/bin/python -m backlot open
.venv/bin/python -m backlot open <project-id>
.venv/bin/python -m backlot serve --port 4750
```

Backlot is a local read-only board. It derives:

| View | Disk source |
|---|---|
| project identity and rail | `project.json` plus selected manifest |
| stage states and versions | `checkpoint_<stage>.json` plus `history/` |
| script | `artifacts/script.json` |
| storyboard filmstrip | script, scene plan, and asset manifest join |
| live activity | `events.jsonl` |
| decisions | `decision_log.json` |
| spend | checkpoint cost snapshots |
| deliverables | `renders/*.mp4` and documented fallback heuristics |

Opening the board is non-fatal. If it is stale, inspect the canonical files and watcher
before restarting the production. Do not add writes to Backlot merely to patch a display
problem.

A simulated Backlot run writes a demo project and launches a timed process:

```bash
.venv/bin/python scripts/backlot_simulate_run.py
```

Run that only on explicit request, never as blanket verification.

## Assets gate versus compose

The assets gate is the per-scene contact sheet or filmstrip. It happens before a full
render. For bespoke scenes without a file thumbnail, write one review still per scene to
`projects/<id>/snapshots/<scene-id>.png` using the selected composition workflow.

Do not render a full draft in the assets stage. After assets approval, the compose stage
owns the actual draft/final render and its report.

## Final verification

Follow the selected compose director and current tools. At minimum:

1. pre-compose validate scene timing, delivery promise, required motion, assets, paths,
   renderer, audio, and subtitle inputs;
2. render with the approved runtime and authoring mode;
3. inspect codec, resolution, frame rate, duration, streams, and errors with ffprobe;
4. sample frames near the beginning, transitions, middle, and end;
5. inspect for blank frames, repeated stills, broken overlays, safe-area issues, and
   typography or asset defects;
6. analyze loudness, silence, clipping, narration/music balance, and sync;
7. verify captions, pronunciation, and timing;
8. watch the complete output at least once;
9. write the final review and render report;
10. report the exact deliverable path, spend, limitations, and verification evidence.

A successful render command or nonzero-size file is only an intermediate gate.
