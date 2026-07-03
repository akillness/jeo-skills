# upskill — Building Pipeline & Ralph Loop

## Data flow (session to stored skill)

```
Session fails
    │
    ▼
after-session hook → saves prompt + session log → sets pending flag
    │
    ▼
User runs /upskill-build (or confirms the notification)
    │
    ▼
upskill-build.sh
    ├─ Phase 0: Create git worktree (isolated environment)
    ├─ Phase 1: Load failure trajectory
    ├─ Phase 2: Teacher solves the task
    ├─ Phase 3: Teacher analyzes failure → generates skill
    ├─ Phase 4: Parse skill files
    └─ Phase 5: Ralph validation (Student + skill retry, up to 3 rounds)
         │
         ├─ PASS → stored in upskill-store/<category>/
         │         → upskill-store.sh sync → update global index + skills
         │
         └─ FAIL → discarded
```

## The five build phases (detail)

```
Phase 0: Setup
  ├─ Create git worktree (isolated environment)
  ├─ Copy HEAD + modified tracked files + untracked files
  └─ Non-git projects: rsync excluding large dirs (node_modules, .venv, etc.)

Phase 1: Load failure trajectory
  └─ Read last 500 lines of session.log

Phase 2: Teacher solves the task
  └─ Teacher model completes the task independently in the worktree

Phase 3: Skill generation
  └─ Teacher analyzes the Student's failure trajectory
     Generates three files (using ===BEGIN_FILE=== / ===END_FILE=== markers):
       • CLAUDE.md            — common pitfalls + correct approach + verification checklist
       • solve-task.md        — step-by-step skill
       • feedback_lessons.md  — persistent memory (1-2 line rules)

Phase 4: Parse
  └─ parse-skill.py extracts marked files → writes to skill output directory

Phase 5: Ralph validation (up to 3 rounds)
  ├─ Create a fresh worktree
  ├─ Deploy the draft skill (CLAUDE.md + skills + memory)
  ├─ Student model retries the task with the skill applied
  ├─ Check output for the ===BUILD_RESULT: PASS=== marker
  ├─ PASS → store in upskill-store → sync global index → done
  └─ FAIL → Teacher revises the skill → retry (max 3 rounds) → discard if still failing
```

Validation passes only when, after the Student model completes the task in
the worktree, the output literally contains `===BUILD_RESULT: PASS===`.

## Why validation is the hard part (the Ralph Loop)

Most distillation approaches stop too early: a strong model writes advice,
saves it, and hopes it transfers. The problem is that Teacher-model advice is
not calibrated to Student-model behavior — the weak model may not know *how*
or *when* to apply generic guidance.

The Ralph Loop closes this gap by making the Student retry with the draft
skill in hand:

- **Round 1** — Student fails. Teacher analyzes the failure and drafts an
  initial skill.
- **Round 2** — Student retries **with the skill applied**. If it still
  fails, the Teacher gets a richer signal than before: "what went wrong even
  with my guidance?" — and revises accordingly.
- Loop continues until the skill demonstrably works, or discards after 3
  rounds.

This produces skills that are:

- **Calibrated to the Student model** — instructions it has proven it can
  follow, not generic best practices from a stronger model's perspective.
- **Progressively sharper** — each failed round with guidance reveals
  precisely where the advice broke down, which the Teacher folds into the
  next revision.
- **Quality-gated by construction** — skills that never survive validation
  are discarded; every stored entry is battle-tested against the exact model
  it will serve.

## Skill file format (on disk)

```
~/.claude/upskill-store/<category>/<skill_id>/
├── SKILL.md           # Complete skill (single file, all 3 sections)
└── description.txt    # One-paragraph summary
```

`SKILL.md` structure:

```markdown
---
name: skill_20260605_001
description: For Python CSV data-processing tools...
metadata:
  category: data-analysis
  base_model: deepseek-v4-flash
  created: 2026-06-05T12:34:56
  trigger_keywords: [csv, encoding, json, database, query]
---

# Domain Knowledge
Common pitfalls, correct approach, and verification checklist.
(At serve time: injected into the agent's CLAUDE.md)

# Step-by-Step
Ordered checklist with concrete commands and code snippets.
(At serve time: loaded as a solve-task skill on demand)

# Feedback / Lessons
Rule: <concise rule>
Why: <why it matters>
How to apply: <how to follow it>
(At serve time: loaded together with the full SKILL.md)
```

All three sections are delivered through **two channels**: the CLAUDE.md
index (always in context, ~5 lines/skill) and the full `SKILL.md` (loaded on
demand, via `/upskill-run` or auto-match) — one validated file, two delivery
paths. A third channel, **memory**, syncs a 1–2 line feedback rule into
`~/.claude/projects/<slug>/memory/` every session, auto-loaded with no
manual trigger.

## When building does and doesn't trigger

| Scenario | Triggers? | Notes |
|----------|:--:|--------|
| `verify.sh` exists at project root, agent command fails | Yes | Task-oriented scenarios |
| No `verify.sh` at project root | No | Non-task scenario, stays out of the way |
| Same task already skilled | No | Deduplication via skill tags |
| Daily limit exceeded | No | Cost control |
| Normal conversation / code review | No | No `verify.sh`, no trigger |

**Key property**: when building does not trigger, the user experience is
identical to not having UpSkill installed — zero added latency.

## Compatibility with existing Claude Code config

| UpSkill writes | Used by the agent? | Compatibility |
|---------------|:--:|---------|
| `settings.local.json` | Yes (native) | **Merged**, not overwritten — preserves existing config |
| `skills/upskill-*.md` | Yes (read by agent) | Different filenames, coexists with user skills |
| `projects/<slug>/memory/` | Yes (read by agent) | Appends skill memory, never deletes user memory |
| `hooks/` | No | UpSkill-specific directory |
| `upskill-store/` | No | UpSkill-specific directory |
| `upskill.conf` | No | UpSkill-specific config file |

## Porting to other agent harnesses

The methodology is harness-agnostic. Porting to Codex, OpenClaw, Cursor, or
another harness needs:

1. **Session hooks** — equivalents of `before-session` and `after-session` to
   capture failure context.
2. **Skill loading** — a mechanism for the agent to load external files into
   its context (a CLAUDE.md equivalent).
3. **Slash commands** — user-invocable commands to trigger building and
   manage the skill library.
4. **Isolated execution** — a worktree or sandbox mechanism for safe
   Teacher/Student runs.

The core pipeline (`upskill-build.sh`, the Ralph Loop, skill-store
management) is harness-agnostic; only the hook-integration layer and context
loading mechanism need adaptation per target harness.
