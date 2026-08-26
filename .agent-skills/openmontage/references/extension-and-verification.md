# Extension and verification

## Choose the owning layer first

| Change | Owner | Do not put it in |
|---|---|---|
| Executable provider, renderer, analyzer, or media operation | `tools/` plus tests | a prose skill alone |
| Registry discovery, status, dependency, capability contract | `tools/base_tool.py` or `tools/tool_registry.py` only when the shared contract truly changes | a provider-specific hardcoded list |
| OpenMontage workflow or quality rule | Layer 2 `skills/` | Python orchestration logic |
| Vendor or technology technique | Layer 3 `.agents/skills/` | a pipeline manifest |
| Stage order, tools, gates, review, success criteria | `pipeline_defs/<name>.yaml` | a generic diagram in README |
| Artifact shape | `schemas/artifacts/` and validators | an unchecked JSON example |
| Persistent project/checkpoint behavior | `lib/` plus contract tests | Backlot UI state |
| Read-only visualization | `backlot/` | the production control plane |
| React composition scene/runtime | `remotion-composer/` and compose adapter | FFmpeg fallback code |
| HTML/GSAP composition integration | HyperFrames adapter and Layer 2/3 guidance | silent runtime switching |

OpenMontage intentionally keeps creative orchestration in instructions. Do not solve every
workflow request by adding Python state-machine logic.

## Adding a tool or provider

Concrete tools inherit from `BaseTool` and use PascalCase names without a `Tool` suffix.
They implement `execute(inputs: dict) -> ToolResult`.

Declare the real contract:

- `name` and `version`;
- `tier` and `stability`;
- `runtime`: local, local GPU, API, or hybrid;
- `execution_mode` and determinism;
- dependencies such as `cmd:ffmpeg`, `env:PROVIDER_KEY`, or `python:module`;
- actionable `install_instructions` that never contain a secret;
- `capability` and `provider`;
- input/output/artifact/progress schemas;
- supported and unsupported task shapes;
- resource profile;
- retry policy;
- resume support and idempotency fields;
- side effects and fallbacks;
- Layer 3 `agent_skills` pointers;
- user-visible verification.

Return a `ToolResult` with success, data, artifacts, error, cost, duration, seed, and model
where applicable. Do not return an unstructured provider response as the only contract.

### Paid provider rules

1. Separate estimate, reserve, execution, polling, reconciliation, and download.
2. Validate all paid-request constraints before submission.
3. Preserve the provider task id and bounded polling state.
4. Distinguish failed, timed out, unknown, and still-running.
5. Never treat unknown price as free.
6. Keep credential values out of errors, result data, events, and fixtures.
7. Add mocked tests for auth headers, request schema, status mapping, cost accounting,
   idempotency/resume behavior, and download validation.
8. A selector fallback cannot silently change a user-approved provider/model choice.

### Selector integration

The TTS, image, and video selectors discover concrete tools by capability. A correctly
classified provider should appear through registry discovery without a static provider
list in the selector. Add selector code only when the shared input adaptation or scoring
contract actually changes.

Verify:

```bash
.venv/bin/python -c "
from tools.tool_registry import registry
registry.discover()
print([t.name for t in registry.get_by_capability('video_generation')])
"
```

Then inspect provider-menu summary, per-tool info, and the relevant selector tests. A tool
that imports successfully but reports the wrong capability, provider, dependency, status,
or setup instruction is not integrated.

## Adding or changing a pipeline

A pipeline requires:

1. one YAML manifest under `pipeline_defs/`;
2. a stable unique name matching the filename;
3. ordered stages;
4. an existing director for every `stage.skill` path;
5. produces/tools declarations matching actual contracts;
6. review focus and success criteria;
7. explicit checkpoint and approval defaults;
8. a valid orchestrator skill when declared;
9. artifact schemas for genuinely new canonical artifact types;
10. contract tests for ordering, paths, tools, gates, and validation;
11. Backlot verification that the new rail and artifacts degrade gracefully.

Run the dependency-free structural gate first:

```bash
python3 .agent-skills/openmontage/scripts/pipeline_inventory.py . --strict
```

Then load the manifest through OpenMontage's own loader and run its catalog/manifest
contract tests. Do not update a generic stage diagram instead of the manifest.

For an existing production, changing a pipeline's stage order or gate semantics is a data
migration concern. Test old project markers and checkpoints before declaring compatibility.

## Layer 2 and Layer 3 integrity

Every generation tool's `agent_skills` pointers must resolve. Layer 2 should say when and
why to use a technique in OpenMontage; Layer 3 should contain the vendor/runtime method.

When implementation and instruction disagree:

1. reproduce the mismatch;
2. treat the registry/tool result as runtime evidence;
3. decide whether code or documentation violates the intended contract;
4. fix the owning layer;
5. add a regression that prevents the mismatch;
6. update linked guidance so the next agent does not need the same source dive.

Do not paper over a broken tool by changing the skill to promise less unless that is the
explicit product decision.

## Checkpoint and decision regressions

Changes to `lib/checkpoint.py`, manifests, or decision-log behavior need both positive and
negative tests:

- valid `in_progress`, `awaiting_human`, and `completed` lifecycle;
- gated completion without `human_approved=True` is rejected;
- missing or unapproved predecessors block advancement;
- an unknown pipeline type fails closed;
- specialized stage names load from the manifest;
- canonical artifacts are required for completed/awaiting canonical stages;
- incomplete drafts remain valid in partial metadata;
- superseded checkpoints are archived;
- next-stage order is deterministic and pipeline-specific;
- a revised decision appends with the same category and subject;
- Backlot renders the latest revision without erasing history.

Never weaken a failing gate to make a fixture pass until the intended invariant is clear.

## Composition and renderer changes

Verify each runtime independently and verify governance around selection:

- machine availability is detected accurately;
- both Remotion and HyperFrames are presented when available;
- unavailable runtimes include a machine reason;
- selected runtime is locked from proposal through edit;
- a runtime failure raises a structured blocker;
- no silent fallback changes the delivery promise;
- templated and atelier paths remain separate decisions;
- motion-required briefs cannot pass as still-led output;
- output and review artifacts stay under the project workspace.

For Remotion scene changes, test schema, render, representative frames, text contrast,
transitions, and caption timing. For HyperFrames, run its doctor and a deterministic local
fixture before a production render. For FFmpeg, validate stream mapping, timing, subtitle,
and audio behavior on a tiny fixture.

## Backlot changes

Backlot is read-only and derives state from disk. Preserve these boundaries:

- it can observe malformed or partial projects without crashing the production;
- its watcher/SSE failure does not block checkpoint writes;
- it never becomes required for stage advancement;
- project identity comes from `project.json` and manifests;
- stage state comes from checkpoints/history;
- activity comes from `events.jsonl` instrumentation;
- decisions and cost come from canonical logs/snapshots;
- a missing thumbnail or render degrades visibly rather than inventing completion.

Test library view, project view, live update, history/replay, asset joins, missing files,
and malformed JSON. A UI fix should not add duplicate orchestration state.

## Test ladder

Run the smallest meaningful evidence first:

```bash
# 1. Skill-side manifest/path validation, no OpenMontage imports
python3 .agent-skills/openmontage/scripts/pipeline_inventory.py . --strict

# 2. Focused pytest file or node
.venv/bin/python -m pytest tests/contracts/test_pipeline_catalog.py -q

# 3. Full contract layer
make test-contracts

# 4. Syntax smoke
make lint

# 5. Full repository suite
make test
```

At the audited pin, `tests/contracts/` contains 32 files covering agent-instruction
integrity, skill pointers, pipeline catalog/categories, Backlot, runtime presentation,
taste/theme contracts, provider adapters, environment examples, and phase contracts.
Inspect current files rather than hardcoding this count into automation.

The upstream CI uses Python 3.11 on Ubuntu, installs FFmpeg, runs `make install-dev`, then
`make lint` and `make test`. Local success on a different Python, platform, or cached
runtime does not replace that matrix.

### External and paid tests

Default unit/contract runs must not:

- call a paid provider;
- require real secret values;
- upload user media;
- start a long-lived server;
- download GPU weights;
- refresh npm caches from the network.

Mark and gate integration tests explicitly. Use mocked HTTP and tiny local fixtures for the
normal suite. When a real provider smoke test is necessary, obtain approval for provider,
model, exact request count, maximum cost, input media, and retention risk.

## Media proof ladder

For changes that affect final output:

1. structural contract or schema test;
2. tiny deterministic render fixture;
3. ffprobe metadata and stream validation;
4. frame samples across the timeline;
5. audio loudness/silence/sync checks;
6. subtitle and safe-area checks;
7. full playback review;
8. Backlot artifact/render visibility;
9. one narrowly approved real-provider sample only if the local fixture cannot prove the
   changed boundary.

Keep before/after evidence and the exact command. A green pytest suite does not prove a
video looks or sounds correct.

## Contribution and license gate

Before an upstream contribution:

1. read current contribution instructions, issue templates, CI, and license;
2. reproduce against current `main` and record the commit;
3. keep the patch in one owning layer where possible;
4. add a regression before or with the fix;
5. run the test ladder;
6. inspect the diff for `.env`, projects, media, model artifacts, caches, and credentials;
7. explain behavior, tests, cost/network effects, and compatibility honestly.

Because OpenMontage is AGPL-3.0, preserve headers/notices and submit upstream-derived code
under compatible terms. Review source-offer obligations before distributing or hosting a
modified version. This is operational guidance, not legal advice.
