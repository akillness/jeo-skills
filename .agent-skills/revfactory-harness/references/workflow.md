# Factory, quality, migration, and evolution workflow

All upstream links below pin commit `92d9f1b29e7af81acebf51a9fcd1832e739a1414`.
This is an operational summary; load the linked template only for the selected job.

## Factory stages

| Stage | Concrete output and acceptance check |
|---|---|
| 0: audit | Inventory the target's `.claude/agents/`, `.claude/skills/`, `CLAUDE.md`, existing orchestrator, and `_workspace/`. Choose new build, extension, maintenance, or migration; preserve ownership and existing language. |
| 1: domain | State the task, inputs, outputs, source rights, success criterion, and whether items/loops are enumerable or experts must negotiate. Avoid duplicate roles/skills. |
| 2: architecture | Choose a supported execution mode and one pattern; record rationale, actual tool/model availability, budget, concurrency, and bounds. Small teams are the default. |
| 3: agents | Define reusable roles as `.claude/agents/<name>.md`, with name/description, actual tools, model rationale, input/output contract, errors, and communication or structured-return rules. Reviewers do not receive write tools. |
| 4: skills | Define methods at `.claude/skills/<name>/SKILL.md`. Use trigger-oriented descriptions, concrete output schemas, progressive references, and tested deterministic helpers. Keep each front door under 500 lines. |
| 5: integration | Connect roles through exactly one orchestrator skill, with producer/consumer paths, phase boundaries, partial-result policy, resume rules, and normal/error scenarios. Keep `CLAUDE.md` to trigger pointers and change history; do not generate legacy `.claude/commands/` as a substitute. |
| 6: verification | Validate frontmatter, names, cross-references, actual invocation, producer/consumer schemas, positive/near-miss triggers, and a scoped executed task. Distinguish structural checks, dry runs, and actual execution. |
| 7: maintenance | Audit drift and change one item at a time; use evolve for feedback on an existing team. Structural redesign returns to stages 0–6. |

The factory's [full skill](https://github.com/revfactory/harness/blob/92d9f1b29e7af81acebf51a9fcd1832e739a1414/skills/harness/SKILL.md)
is the authoritative source for these stages.

## Mode and pattern choice

The [execution-mode reference](https://github.com/revfactory/harness/blob/92d9f1b29e7af81acebf51a9fcd1832e739a1414/skills/harness/references/execution-modes.md)
chooses by **control flow**, not team size:

- **Workflow orchestration:** enumerable items, deterministic loops, structured returns.
  Confirm `Workflow` and its documented helpers exist. Use `pipeline()` for per-item
  multi-stage work; `parallel()` only when the next stage needs all results. Handle
  `null` failures explicitly, report missing counts, keep `meta` literal, and avoid
  nondeterministic timestamps/randomness in resumable scripts. Upstream documents
  `resumeFromRunId`; reuse a receipt only when it really exists.
- **Persistent collaboration:** repeated negotiation and context reuse. Confirm named
  agents, messages, and shared tasks exist. State sender/recipient paths and task
  dependencies. Freeze handoff artifacts so a late message cannot silently change
  the inputs of a completed phase.
- **Subagent delegation:** independent work needing only a one-shot return. Collect
  all results and identify failures; do not re-run delegated searches in parallel
  without a new reason. If delegation is unavailable, stop and report the blocker.

Patterns are pipeline, fan-out/fan-in, expert pool, producer-reviewer, supervisor,
and hierarchical delegation. Use the [team patterns](https://github.com/revfactory/harness/blob/92d9f1b29e7af81acebf51a9fcd1832e739a1414/skills/harness/references/team-patterns.md)
and [orchestrator templates](https://github.com/revfactory/harness/blob/92d9f1b29e7af81acebf51a9fcd1832e739a1414/skills/harness/references/orchestrator-template.md)
only after the selected mode passes the host-capability check. Do not copy a Workflow
recipe into a host that exposes no such tool.

## Quality and proof

Combine adversarial verification, independent judge panels, bounded loop-until-dry,
multiple-perspective sweeps, and a completeness critic only when the task needs them.
A majority of `confirmed` verdicts is different from counting `uncertain` as agreement.
Bound every repeat loop by iterations or budget; authentication, permission, and
quota failures do not benefit from blind retries. Preserve unresolved conflicts and
partial outputs rather than having a coordinator invent a missing agent's reasoning.

Use the [skill-writing guide](https://github.com/revfactory/harness/blob/92d9f1b29e7af81acebf51a9fcd1832e739a1414/skills/harness/references/skill-writing-guide.md)
for progressive disclosure, description triggers, reusable scripts, and schemas.
The [testing guide](https://github.com/revfactory/harness/blob/92d9f1b29e7af81acebf51a9fcd1832e739a1414/skills/harness/references/skill-testing-guide.md)
distinguishes with-skill/baseline runs from static checks. For generated skills,
include realistic normal/error cases and positive/near-miss trigger cases; the
upstream factory recommends ten of each for a full trigger audit.

For A/B runs, keep the same task, model, tools, permissions, and inputs. Preserve
both output directories before blind grading, use `text`/`passed`/`evidence` for
expectations, and record tokens/timing only when the runtime supplies them. Missing
runs are unscored, not zero-quality or a fabricated win. The
[QA guide](https://github.com/revfactory/harness/blob/92d9f1b29e7af81acebf51a9fcd1832e739a1414/skills/harness/references/qa-agent-guide.md)
requires comparing both sides of each boundary (API/client, schema/data, path/link,
state transition/implementation), not merely checking that files exist.

## v1 migration

Read the [migration guide](https://github.com/revfactory/harness/blob/92d9f1b29e7af81acebf51a9fcd1832e739a1414/docs/migration-v1-to-v2.md).
Detect references to `TeamCreate`, `TeamDelete`, `team_name`, broadcast-to-all, or
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` in the existing harness. The pinned upstream
calls these legacy constructs. Confirm the replacement APIs on the actual target
host before applying its migration; upstream claims do not override host contracts.

Preview the specific edits, remove obsolete constructs only where applicable,
replace blanket expensive-model selection with justified available models, preserve
`_workspace/` and the change history, then re-run mode-specific validation and a
small real task. Do not add an experimental flag or replace user permissions to
make an unavailable mode appear supported.

## Evolve an existing harness

The [evolve skill](https://github.com/revfactory/harness/blob/92d9f1b29e7af81acebf51a9fcd1832e739a1414/skills/evolve/SKILL.md)
is separate from new-team construction. Invoke plugin `/harness:evolve` or the
verified direct-copy skill `/harness-evolve`:

1. Collect the initial/current file delta, existing change history, and actual
   `_workspace/` artifacts. Use feedback already given; do not ask again unnecessarily.
2. Classify the cause: output method, role definition, ordering, trigger, mode, or cost.
3. Generalize the cause instead of adding an example-specific patch. Make one change
   and explain why; do not silently reverse an earlier user decision.
4. Revalidate the changed contracts and triggers, update `CLAUDE.md` history, and
   compare a fresh scoped result with the prior evidence.
5. Report adopted/unadopted changes and observed evidence. Role addition/removal or
   architecture redesign returns to the factory rather than masquerading as evolution.

Repeated correction, recurrent failure, or a user bypassing the orchestrator is a
signal to propose improvement, not blanket permission to rewrite the project.
