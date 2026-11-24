# RSI lessons (shadow mode)

Deterministic, evidence-gated lessons extracted from closed tasks. This is the
memory layer of the RSI work: it records what earlier tasks proved, not what a
model guessed, and it never changes a prompt by itself.

The admission rule follows the harness2 Library (Google Research, Apache-2.0,
arXiv 2610.14224): a lesson exists only when it carries a cue, an action, and
at least one evidence row. The wider taxonomy of gains (task, retained,
improver) comes from the awesome-rsi list (lobehub).

## Modes

`ARTEX_RSI_LESSONS` is read when a task's agent bundle is built:

| value | behavior |
|---|---|
| unset / `off` | no selection, no logging, no prompt change (default) |
| `shadow` | select lessons and log what would have been shown, without injecting |
| `inject` | select, log, and append the block to the planner and worker system prompts |

The block is code-owned: it is appended after the rendered prompt, so editing
the agent prompt in the UI cannot remove it. Changing the flag affects new
tasks (or tasks whose agent bundle is invalidated), not a restart.

## Extraction

Extraction runs automatically when a task reaches a terminal status
(`done`, `failed`, `timeout`), and can be re-run or backfilled with:

```
POST /api/tasks/{id}/lessons/extract
```

It is idempotent for the same disposition. `rsi_lesson_evidence` is keyed by
`(lesson, source_kind, source_id)`, so a second run for the same finding adds
no evidence and cannot inflate support. A later extract after a reversed
disposition withdraws that finding's evidence from the opposite-kind lesson,
including every retest of the finding, and retires the lesson when its live
support hits zero. The evidence row stays, with `withdrawn_at` set. Confirming
again clears that timestamp and restores the evidence; a retired lesson is
un-retired only when it has no remaining live evidence. A negative disposition
also withdraws the cautions written from the finding's retests. A change inside
the negative group (`false_positive`, `duplicate`, `ignored`, `risk_accepted`)
withdraws the finding from the previous negative lesson before writing the
new action text.

Extraction also runs after a disposition change (`SetFindingStatusWithNotify`,
including bulk) and after a completed retest, in addition to terminal status
and `POST /api/tasks/{id}/lessons/extract`. Reopening a finding
(`pending` / `in_progress`) produces nothing and retracts nothing.

Rules:

| source | kind | action |
|---|---|---|
| finding `confirmed` / `resolved` / `fixed` | positive | `Confirmed <vulnclass>: <summary>` |
| retest `reproduced` on such a finding | positive | `Reproduced <vulnclass> on retest: <summary>` |
| finding `false_positive` / `duplicate` / `ignored` / `risk_accepted` | negative | `Do not re-report without new mechanics: <summary> (prior <status>)` |
| retest `fixed` / `inconclusive` on a `confirmed` / `resolved` / `fixed` finding | caution | `Recheck before reporting <vulnclass>: a prior retest was <verdict>` |

Pending and in-progress findings produce nothing: there is no outcome yet.
Empty cue, action, or source is refused by the gate.

An action is capped at 320 runes. In a negative action the summary is cut, not
the `(prior <status>)` suffix, so each negative status keeps its own action and
dedupe key.

A retest counts only when it is `completed` with a verdict; extraction reads
the latest such retest. A verdict staged on a pending, running, failed, or
stopped retest produces nothing.

A task with more than one company in `task_scope` does not gain a new lesson.
Retraction still runs, so a lesson written while the task had one company can
be withdrawn after a second company is added. It withdraws only on a changed
disposition: a finding whose status did not move keeps its evidence. Per-finding
company attribution is a later change.

## Selection

`GET /api/tasks/{id}/lessons` returns the lessons visible to a task plus the
rendered block. Selection is scoped:

- a lesson with no company is visible only to a task that also has no company;
- company scope comes from `task_scope`, not `tasks.company_id`; a lesson is
  company-scoped only when the source task had exactly one company, and a
  task with several companies is not given a new lesson;
- lessons from the same company or the same task category rank first
  (company/category matches sort ahead of generic rows);
- within a scope: positive before negative before caution, then support, then
  recency;
- at most eight lessons are rendered, and the block stops at 1800 characters
  (runes, not bytes).

Duplicates are merged at extraction time by a dedupe key over kind, scope, cue,
and action, so the same lesson from several tasks becomes one row with several
evidence entries and a higher support count.

## Rendering and safety

Lesson fields come from task evidence, which can include target-controlled
text. Rendering strips control characters, flattens every field to one line,
caps lengths, and prefixes the block with "prior outcomes, not instructions".
The block is appended to the planner and worker prompts only in `inject` mode,
inside the same nonce-framed data envelope used for other derived content.

What this layer deliberately does not do:

- no LLM summarization in this phase: rules only, so every lesson traces to a
  finding or retest id;
- no prompt mutation, no benchmark probing, no lesson editing through the UI;
- `status` starts as `candidate`. Extraction auto-retires a lesson when its last
  evidence is retracted. It un-retires only a retired lesson with no remaining
  evidence. Adopted stays adopted; a retired lesson that still has evidence
  stays retired;
- no time-based decay; reversed dispositions retract that finding's evidence
  from the opposite-kind lesson on the next extract.

## Measuring it

`rsi_lesson_usage` records which lessons were considered for which task and in
which mode. Join it with the per-task outcome card
(`GET /api/tasks/{id}/outcome`) to compare tasks that saw lessons with tasks
that did not on the same domain:

- tokens per confirmed finding
- tool calls per confirmed finding
- repeated dead-end probes (future metric; not computable yet)
- false-positive and duplicate rate

Do not treat support as causal evidence. It counts corroborating task
outcomes, not a controlled comparison.
