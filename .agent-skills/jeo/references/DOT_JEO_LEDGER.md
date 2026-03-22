# JEO `.jeo` Project Ledger

## Overview

JEO now keeps a project-local `.jeo/` folder alongside `.omc/state/jeo-state.json`.

Use `.omc/state/jeo-state.json` for machine-readable phase state.
Use `.jeo/` for human-readable planning, development, QA, and history notes that should survive across sessions.

## Directory structure

```text
.jeo/
  README.md
  long-term.md
  short-term.md
  planned.md
  progress.md
  history.md
  tasks/
    queued/
      000-primary.md
    active/
```

## File responsibilities

| File | Purpose | Update cadence |
|------|---------|----------------|
| `long-term.md` | Stable planning intent, standing rules, and validation contract | Only when product direction or hard constraints change |
| `short-term.md` | Current system slice, unit-test plan, flow-test plan, and exit criteria | At the start of each JEO run and whenever scope changes |
| `planned.md` | Queue of planned work items plus parking-lot items | Whenever new work is added or completed |
| `progress.md` | Current delivery stage (`planning`, `development`, `qa`, `done`), active task, and timestamped notes | Every phase transition and meaningful checkpoint |
| `history.md` | Append-only record of completed work after the task file is removed | Every completion |
| `tasks/queued/*.md` | Planned work item file with planning/development/QA checklists | Created when work is queued |
| `tasks/active/*.md` | Single active work item file | Moved from queued when work begins, deleted on completion |

## Stage mapping

| JEO phase | Delivery stage | Required `.jeo` check |
|-----------|----------------|------------------------|
| `plan` | `planning` | Review `long-term.md`, update `short-term.md`, confirm queued/active task |
| `execute` | `development` | Update active task checklist, append implementation notes to `progress.md` |
| `verify` / `verify_ui` | `qa` | Record unit/flow/browser verification outcomes in `short-term.md` and `progress.md` |
| `cleanup` / `done` | `done` | Append history summary, check off `planned.md`, remove active task file |

## Task lifecycle

1. Initialize the ledger:
   ```bash
   python3 scripts/jeo-project-sync.py init "<task>"
   ```
2. Queue new work:
   ```bash
   python3 scripts/jeo-project-sync.py queue api-contract "Harden API contract validation"
   ```
3. Start the next queued task:
   ```bash
   python3 scripts/jeo-project-sync.py start-next
   ```
4. Move through delivery stages:
   ```bash
   python3 scripts/jeo-project-sync.py stage planning
   python3 scripts/jeo-project-sync.py stage development
   python3 scripts/jeo-project-sync.py stage qa
   ```
5. Record notable progress:
   ```bash
   python3 scripts/jeo-project-sync.py progress "Implemented API contract checks and updated unit tests."
   ```
6. Complete the task:
   ```bash
   python3 scripts/jeo-project-sync.py complete api-contract "Merged API checks, recorded QA evidence, queued no follow-up."
   ```

On completion, the task entry is checked in `planned.md`, a summary is appended to `history.md`, and the task file is deleted from `.jeo/tasks/active/`.

## Operating rules

- Keep `long-term.md` stable. Use it for durable intent, not daily notes.
- Keep `short-term.md` focused on the current execution window: system slice, unit tests, flow tests, and exit criteria.
- Allow only one file in `.jeo/tasks/active/` at a time.
- Never delete `history.md` entries. The task file is disposable; the history summary is the permanent record.
- If new follow-up work appears during QA, add it with `queue` before cleanup.
