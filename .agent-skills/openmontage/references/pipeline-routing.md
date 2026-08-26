# Pipeline routing and project contracts

## Source of truth

For a real run, the selected `pipeline_defs/<name>.yaml` is authoritative for:

- stage order;
- director skill paths;
- produced artifact names;
- allowed, required, and fallback tools;
- review focus and success criteria;
- checkpoint requirements;
- human approval defaults;
- orchestration mode and budget default.

Static tables are discovery aids only. Run the dependency-free inventory against the
actual checkout:

```bash
python3 .agent-skills/openmontage/scripts/pipeline_inventory.py \
  /path/to/OpenMontage --strict
```

Use `--format json` for machine-readable output or `--pipeline cinematic` to narrow it.
Strict mode verifies names, duplicate stages, booleans, and referenced Layer 2 director
files without importing OpenMontage or installing PyYAML.

## Audited manifests at the pin

The following table comes from the 13 YAML files at commit
`cd9f3c1f03368be87b140af494914b8ee4e3c7a4`. `Gates` lists stages whose
`human_approval_default` is true.

| Pipeline | Version | Category | Ordered stages | Gates | Guide stability |
|---|---:|---|---|---|---|
| `animated-explainer` | 2.0 | generated | research, proposal, script, scene_plan, assets, edit, compose, publish | proposal, script, scene_plan, assets, publish | production |
| `animation` | 2.0 | animation | research, proposal, script, scene_plan, assets, edit, compose, publish | proposal, script, scene_plan, assets, publish | production |
| `avatar-spokesperson` | 2.0 | custom | idea, script, scene_plan, assets, edit, compose, publish | idea, script, scene_plan, assets, publish | production |
| `character-animation` | 0.1 | animation | research, proposal, script, character_design, rig_plan, scene_plan, assets, edit, compose, publish | proposal, script, character_design, scene_plan, assets, publish | beta |
| `cinematic` | 2.0 | cinematic | research, proposal, script, scene_plan, assets, edit, compose, publish | proposal, script, scene_plan, assets, publish | production |
| `clip-factory` | 2.0 | custom | idea, script, scene_plan, assets, edit, compose, publish | idea, script, scene_plan, assets, publish | beta |
| `documentary-montage` | 1.0 | documentary | idea, scene_plan, assets, edit, compose | idea, scene_plan, assets, edit | not listed in the guide stability table |
| `framework-smoke` | 1.0 | custom | research, script | research, script | test |
| `hybrid` | 2.0 | hybrid | idea, script, scene_plan, assets, edit, compose, publish | idea, script, scene_plan, assets, publish | production |
| `localization-dub` | 2.0 | custom | idea, script, scene_plan, assets, edit, compose, publish | idea, script, scene_plan, assets, publish | beta |
| `podcast-repurpose` | 2.0 | custom | idea, script, scene_plan, assets, edit, compose, publish | idea, script, scene_plan, assets, publish | beta |
| `screen-demo` | 2.1 | screen_recording | idea, script, scene_plan, assets, edit, compose, publish | idea, script, scene_plan, assets, publish | production |
| `talking-head` | 2.0 | talking_head | idea, script, scene_plan, assets, edit, compose, publish | idea, script, scene_plan, assets, publish | beta |

The guide's generic diagrams omit or reorder stages for some pipelines. Never infer the
next stage from `research -> proposal -> ...`; ask `get_next_stage()` with the actual
pipeline type. `documentary-montage` exists as a manifest but was absent from the guide's
stability table at the pin. Surface that documentation gap instead of inventing a label.

## Selection guide

| User intent | Primary candidate | Important boundary |
|---|---|---|
| Topic to researched narrated explainer | `animated-explainer` | Research and proposal precede paid assets |
| Kinetic type, diagrams, math, motion graphics | `animation` | Choose renderer and authoring mode at proposal |
| Digital presenter anchored piece | `avatar-spokesperson` | Confirm avatar/lip-sync provider and presenter quality |
| Reusable local cartoon acting and rigs | `character-animation` | Beta, extra character/rig stages, deterministic local motion |
| Trailer, brand film, mood-led dramatic edit | `cinematic` | Motion-required promise forbids silent still fallback |
| Many social clips from one long source | `clip-factory` | Beta; one source yields multiple independent outputs |
| Retrieval-first real-footage tone poem | `documentary-montage` | Check source rights/provenance; edit itself is gated |
| Framework contract exercise | `framework-smoke` | Test-only, not a user deliverable pipeline |
| Existing footage plus designed/generated support | `hybrid` | Preserve source/support balance and provenance |
| Translate, subtitle, dub, optional lip sync | `localization-dub` | Beta; locale timing and translation quality are central |
| Podcast highlights, audiograms, derivatives | `podcast-repurpose` | Beta; preserve audio and multi-output consistency |
| App or browser walkthrough | `screen-demo` | Choose real capture for unpredictable UI, synthetic terminal for deterministic CLI flows |
| Recorded speaker footage | `talking-head` | Beta; footage-led editing, transcription, subtitles, audio polish |

If two candidates fit, explain the consequence of the choice and recommend one. Do not
silently construct a hybrid pipeline that does not exist.

## Reference video versus source footage

These are different entry points:

### Reference-driven

The user likes a video and wants an original production inspired by it.

1. Read `skills/meta/video-reference-analyst.md`.
2. Analyze transcript, pacing, structure, scenes, keyframes, style, and why it works.
3. Produce the reference analysis artifact specified by the checkout.
4. Run capability preflight and pipeline selection.
5. Present two or three differentiated concepts that preserve useful grammar without
   copying distinctive content or identity.
6. Use the reference sample gate if the selected upstream protocol requires it.

Do not downgrade this to web search plus a guessed prompt.

### Source-footage

The user wants the supplied media edited, clipped, localized, or enhanced.

1. Run the `source_media_review` path required by the checkout.
2. Establish rights, duration, codecs, audio, transcript, scene boundaries, defects, and
   what must be preserved.
3. Route to `talking-head`, `clip-factory`, `podcast-repurpose`, `localization-dub`,
   `screen-demo`, `hybrid`, or another manifest based on the actual transformation.
4. Keep source identifiers and provenance in canonical artifacts.

Do not run reference analysis when the source itself is the footage to edit.

## Vague first interaction

When the user says only "make a video" or asks what OpenMontage can do, read
`skills/meta/onboarding.md`. Run the current `provider_menu_summary()` first even if an
older onboarding snippet shows raw `support_envelope()` and `provider_menu()` calls. The
main guide's mandatory summary contract is the smaller, user-facing surface.

When the request already includes a concrete topic, duration, audience, format, or source,
skip onboarding and route directly.

## Project workspace

Initialize only after selecting the pipeline:

```bash
.venv/bin/python -c "
from lib.checkpoint import init_project
init_project(
    'rain-city',
    title='City at 4 AM',
    pipeline_type='documentary-montage',
)
"
```

Canonical layout:

```text
projects/<project-id>/
├── project.json
├── checkpoint_<stage>.json
├── history/
├── decision_log.json
├── events.jsonl
├── artifacts/
├── assets/
│   ├── images/
│   ├── video/
│   ├── audio/
│   └── music/
├── snapshots/
└── renders/
```

Some directories appear only when used. Tools must receive explicit output paths under
this tree.

## Canonical stage artifacts

The shared mapping in `lib/checkpoint.py` at the pin is:

| Stage | Canonical artifact |
|---|---|
| research | `research_brief` |
| proposal | `proposal_packet` |
| idea | `brief` |
| script | `script` |
| scene_plan | `scene_plan` |
| assets | `asset_manifest` |
| edit | `edit_decisions` |
| compose | `render_report` |
| publish | `publish_log` |

Additional artifacts include `source_media_review`, `final_review`, and
`video_analysis_brief`. Specialized stages such as `character_design` or `rig_plan` may
have manifest-specific outputs and do not inherit a canonical artifact merely because
they are stages. Read their manifest and director.

A completed or awaiting-human checkpoint for a canonical stage must contain its valid
artifact. Put an incomplete draft under `metadata.partial_progress` unless it already
passes the artifact schema.

## Gate behavior

The manifest's `human_approval_default` is binding:

1. enter the stage with an `in_progress` checkpoint;
2. execute and self-review;
3. write `awaiting_human` with canonical artifact, review, and cost snapshot;
4. present it to the user and end the turn;
5. after a later explicit approval, rewrite as `completed` with
   `human_approved=True`;
6. then compute the next stage.

Approval is per gate. A broad early "go ahead" counts for future gates only if the current
upstream protocol records explicit full-run pre-authorization in the decision log.
Never infer it.

The assets gate reviews the filmstrip or per-scene atelier stills before full compose.
Do not render a complete draft merely to earn assets approval.

## Resume behavior

```bash
.venv/bin/python -c "
from pathlib import Path
from lib.checkpoint import get_next_stage
print(get_next_stage(Path('projects'), 'rain-city', 'documentary-montage'))
"
```

Then inspect the checkpoint for that stage:

- `awaiting_human`: present and wait;
- `in_progress`: load `artifacts` or `metadata.partial_progress`, skip completed unit ids,
  and continue;
- `failed`: classify the failing layer and preserve provider/task evidence;
- missing: start the stage normally after reading its director.

Do not restart a pipeline just because the chat context was lost. The project files are
the durable state.
