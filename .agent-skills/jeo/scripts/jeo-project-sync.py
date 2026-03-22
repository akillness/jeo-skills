#!/usr/bin/env python3
"""Manage the project-local .jeo planning ledger for the JEO workflow.

Usage:
  python3 scripts/jeo-project-sync.py init "<task>"
  python3 scripts/jeo-project-sync.py queue <slug> "<title>"
  python3 scripts/jeo-project-sync.py start <slug>
  python3 scripts/jeo-project-sync.py start-next
  python3 scripts/jeo-project-sync.py stage <planning|development|qa|done>
  python3 scripts/jeo-project-sync.py progress "<message>"
  python3 scripts/jeo-project-sync.py complete <slug> "<summary>"
  python3 scripts/jeo-project-sync.py status
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
from pathlib import Path


def now_iso() -> str:
    return dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def project_root() -> Path:
    try:
        return Path(
            subprocess.check_output(
                ["git", "rev-parse", "--show-toplevel"], stderr=subprocess.DEVNULL
            )
            .decode()
            .strip()
        )
    except Exception:
        return Path.cwd()


ROOT = project_root()
JEO_DIR = ROOT / ".jeo"
TASKS_DIR = JEO_DIR / "tasks"
QUEUED_DIR = TASKS_DIR / "queued"
ACTIVE_DIR = TASKS_DIR / "active"
LONG_TERM = JEO_DIR / "long-term.md"
SHORT_TERM = JEO_DIR / "short-term.md"
PLANNED = JEO_DIR / "planned.md"
PROGRESS = JEO_DIR / "progress.md"
HISTORY = JEO_DIR / "history.md"
README = JEO_DIR / "README.md"
STATE_FILE = ROOT / ".omc" / "state" / "jeo-state.json"


def read_text(path: Path) -> str:
    return path.read_text() if path.exists() else ""


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def ensure_file(path: Path, content: str) -> None:
    if not path.exists():
        write_text(path, content)


def sync_state(*, stage: str | None = None, active_task: str | None | object = ...):
    if not STATE_FILE.exists():
        return
    try:
        state = json.loads(STATE_FILE.read_text())
    except Exception:
        return
    jeo = state.setdefault("jeo", {})
    jeo["root"] = ".jeo"
    jeo["last_sync_at"] = now_iso()
    if stage is not None:
      state["delivery_stage"] = stage
    if active_task is not ...:
      jeo["active_task"] = active_task
    state["updated_at"] = now_iso()
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2))


def heading(title: str) -> str:
    return title.strip().replace("\n", " ")


def long_term_template(task: str) -> str:
    return f"""# JEO Long-Term Plan

Project: `{ROOT.name}`
Initial task: {heading(task)}
Last updated: {now_iso()}

## Product and planning intent
- Problem statement:
- User value:
- Long-lived constraints:

## Standing rules
- Keep the PLAN gate before any development work.
- Do not move to development until plan approval is recorded.
- Keep development aligned with the active short-term scope and queued task.
- Treat QA as required: unit tests, flow tests, and browser verification when UI exists.

## Validation contract
- Planning exit: scope, risks, and completion criteria are explicit.
- Development exit: code, docs, and test intent are updated in `.jeo`.
- QA exit: unit, flow, and annotation/browser checks are recorded with outcomes.

## Persistent references
- External dependencies:
- Architecture references:
- Historical decisions worth preserving:
"""


def short_term_template(task: str) -> str:
    return f"""# JEO Short-Term Plan

Current objective: {heading(task)}
Last updated: {now_iso()}

## System slice for this iteration
- Components or files expected to change:
- Interfaces or contracts to preserve:

## Unit test plan
- Existing tests to keep green:
- New unit tests to add:

## Flow and integration test plan
- End-to-end or flow checks:
- Browser or manual verification targets:

## Exit criteria
- Plan approved
- Code implemented
- Unit tests updated
- Flow / browser verification recorded
"""


def planned_template() -> str:
    return """# JEO Planned Work

## Queue

## Parking Lot
- Add new work with `python3 scripts/jeo-project-sync.py queue <slug> "<title>"`.
"""


def progress_template() -> str:
    return f"""# JEO Progress

## Current delivery stage
- planning <!-- jeo-stage -->

## Active task
- none <!-- jeo-active -->

## Latest updates
- {now_iso()} Initialized `.jeo` workspace.
"""


def history_template() -> str:
    return """# JEO History

Completed task files are removed after their summary is written here.
Keep this file append-only so future JEO runs can recover prior decisions quickly.
"""


def readme_template() -> str:
    return """# .jeo Workspace

This folder is the project-local planning ledger for the JEO workflow.

## Files
- `long-term.md`: durable planning intent, rules, and validation contract
- `short-term.md`: current iteration scope, system slice, unit-test plan, and flow-test plan
- `planned.md`: queued work and future additions
- `progress.md`: current stage and recent updates
- `history.md`: append-only completion summaries
- `tasks/queued/*.md`: queued work-item files
- `tasks/active/*.md`: the single active work-item file

## Lifecycle
1. `init` creates the `.jeo` workspace and seeds the primary task.
2. `queue` adds new follow-up work.
3. `start` or `start-next` makes one queued task active.
4. `stage` records whether JEO is in planning, development, QA, or done.
5. `progress` appends notable updates.
6. `complete` checks the task off in `planned.md`, appends to `history.md`, and removes the task file.
"""


def task_template(slug: str, title: str) -> str:
    return f"""# Task: {heading(title)}

- id: `{slug}`
- created_at: {now_iso()}

## Planning checklist
- [ ] Scope captured in `plan.md`
- [ ] Long-term and short-term docs reviewed
- [ ] Risks and completion criteria written

## Development checklist
- [ ] System changes implemented
- [ ] Docs updated
- [ ] Unit tests added or updated

## QA checklist
- [ ] Flow or integration checks recorded
- [ ] Browser / annotation verification recorded when applicable
- [ ] Follow-up work queued if needed

## Notes
- Summary:
- Evidence:
"""


def ensure_workspace(task: str) -> None:
    for directory in (JEO_DIR, TASKS_DIR, QUEUED_DIR, ACTIVE_DIR):
        directory.mkdir(parents=True, exist_ok=True)
    ensure_file(README, readme_template())
    ensure_file(LONG_TERM, long_term_template(task))
    ensure_file(SHORT_TERM, short_term_template(task))
    ensure_file(PLANNED, planned_template())
    ensure_file(PROGRESS, progress_template())
    ensure_file(HISTORY, history_template())


def task_entry(slug: str, title: str, checked: bool = False) -> str:
    box = "x" if checked else " "
    return f"- [{box}] `{slug}` - {heading(title)} <!-- jeo-task:{slug} -->"


def add_planned_task(slug: str, title: str) -> None:
    text = read_text(PLANNED)
    marker = f"<!-- jeo-task:{slug} -->"
    if marker in text:
        return
    anchor = "## Queue\n"
    entry = task_entry(slug, title) + "\n"
    if anchor in text:
        text = text.replace(anchor, anchor + entry, 1)
    else:
        text += "\n## Queue\n" + entry
    write_text(PLANNED, text)


def mark_planned_complete(slug: str, title: str) -> None:
    text = read_text(PLANNED)
    pattern = re.compile(rf"- \[[ x]\] `({re.escape(slug)})` - .* <!-- jeo-task:{re.escape(slug)} -->")
    if pattern.search(text):
        text = pattern.sub(task_entry(slug, title, checked=True), text)
    else:
        text += "\n" + task_entry(slug, title, checked=True)
    write_text(PLANNED, text)


def set_stage(stage: str) -> None:
    text = read_text(PROGRESS)
    pattern = re.compile(r"- .+ <!-- jeo-stage -->")
    replacement = f"- {stage} <!-- jeo-stage -->"
    if pattern.search(text):
        text = pattern.sub(replacement, text, count=1)
    else:
        text += "\n## Current delivery stage\n" + replacement + "\n"
    write_text(PROGRESS, text)
    sync_state(stage=stage)


def set_active_task(slug: str | None) -> None:
    label = slug or "none"
    text = read_text(PROGRESS)
    pattern = re.compile(r"- .+ <!-- jeo-active -->")
    replacement = f"- {label} <!-- jeo-active -->"
    if pattern.search(text):
        text = pattern.sub(replacement, text, count=1)
    else:
        text += "\n## Active task\n" + replacement + "\n"
    write_text(PROGRESS, text)
    sync_state(active_task=slug)


def append_progress(message: str) -> None:
    text = read_text(PROGRESS).rstrip() + f"\n- {now_iso()} {message}\n"
    write_text(PROGRESS, text)


def append_history(slug: str, title: str, summary: str) -> None:
    text = read_text(HISTORY).rstrip()
    text += (
        f"\n\n## {now_iso()} - `{slug}`\n"
        f"- Title: {heading(title)}\n"
        f"- Summary: {heading(summary)}\n"
    )
    write_text(HISTORY, text + "\n")


def slug_file(directory: Path, slug: str) -> Path:
    for path in directory.glob(f"{slug}*.md"):
        return path
    return directory / f"{slug}.md"


def load_task_title(path: Path, fallback: str) -> str:
    if not path.exists():
        return fallback
    for line in path.read_text().splitlines():
        if line.startswith("# Task:"):
            return line.split(":", 1)[1].strip()
    return fallback


def queue_task(slug: str, title: str) -> None:
    ensure_workspace(title)
    path = slug_file(QUEUED_DIR, slug)
    if not path.exists():
        write_text(path, task_template(slug, title))
    add_planned_task(slug, title)
    append_progress(f"Queued `{slug}` - {heading(title)}.")


def start_task(slug: str) -> None:
    active = sorted(ACTIVE_DIR.glob("*.md"))
    if active and active[0].stem != slug:
        raise SystemExit(f"Active task already exists: {active[0].name}")
    queued = slug_file(QUEUED_DIR, slug)
    target = slug_file(ACTIVE_DIR, slug)
    if queued.exists() and not target.exists():
        queued.rename(target)
    elif not target.exists():
        raise SystemExit(f"No queued task found for slug '{slug}'")
    set_active_task(slug)
    append_progress(f"Started `{slug}`.")


def start_next() -> None:
    queued = sorted(QUEUED_DIR.glob("*.md"))
    if not queued:
        raise SystemExit("No queued tasks available.")
    start_task(queued[0].stem)


def complete_task(slug: str, summary: str) -> None:
    active_path = slug_file(ACTIVE_DIR, slug)
    queued_path = slug_file(QUEUED_DIR, slug)
    path = active_path if active_path.exists() else queued_path
    title = load_task_title(path, slug)
    mark_planned_complete(slug, title)
    append_history(slug, title, summary)
    if path.exists():
        path.unlink()
    active_line = re.search(r"- (.+) <!-- jeo-active -->", read_text(PROGRESS))
    if active_line and active_line.group(1) == slug:
        set_active_task(None)
    append_progress(f"Completed `{slug}` and removed its task file.")


def status() -> None:
    progress = read_text(PROGRESS)
    stage_match = re.search(r"- (.+) <!-- jeo-stage -->", progress)
    active_match = re.search(r"- (.+) <!-- jeo-active -->", progress)
    queued = sorted(p.name for p in QUEUED_DIR.glob("*.md"))
    print(f"root={ROOT}")
    print(f"jeo_dir={JEO_DIR}")
    print(f"stage={stage_match.group(1) if stage_match else 'unknown'}")
    print(f"active={active_match.group(1) if active_match else 'none'}")
    print("queued=" + (", ".join(queued) if queued else "none"))


def init(task: str) -> None:
    ensure_workspace(task)
    if not any("<!-- jeo-task:" in line for line in read_text(PLANNED).splitlines()):
        queue_task("000-primary", task)
    append_progress(f"Initialized JEO ledger for `{heading(task)}`.")
    sync_state(stage="planning", active_task=None)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Manage .jeo workflow docs.")
    sub = parser.add_subparsers(dest="command", required=True)

    p_init = sub.add_parser("init")
    p_init.add_argument("task", nargs="+")

    p_queue = sub.add_parser("queue")
    p_queue.add_argument("slug")
    p_queue.add_argument("title", nargs="+")

    p_start = sub.add_parser("start")
    p_start.add_argument("slug")

    sub.add_parser("start-next")

    p_stage = sub.add_parser("stage")
    p_stage.add_argument("stage", choices=["planning", "development", "qa", "done"])

    p_progress = sub.add_parser("progress")
    p_progress.add_argument("message", nargs="+")

    p_complete = sub.add_parser("complete")
    p_complete.add_argument("slug")
    p_complete.add_argument("summary", nargs="+")

    sub.add_parser("status")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.command == "init":
        init(" ".join(args.task))
    elif args.command == "queue":
        queue_task(args.slug, " ".join(args.title))
    elif args.command == "start":
        start_task(args.slug)
    elif args.command == "start-next":
        start_next()
    elif args.command == "stage":
        set_stage(args.stage)
        append_progress(f"Stage changed to `{args.stage}`.")
    elif args.command == "progress":
        append_progress(" ".join(args.message))
    elif args.command == "complete":
        complete_task(args.slug, " ".join(args.summary))
    elif args.command == "status":
        status()


if __name__ == "__main__":
    main()
