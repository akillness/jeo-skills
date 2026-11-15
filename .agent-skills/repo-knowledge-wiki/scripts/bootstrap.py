#!/usr/bin/env python3
"""Idempotent bootstrap for repository-local knowledge/ and .mex/ pairing bridge."""
from __future__ import annotations

import argparse
import json
import os
import tempfile
from datetime import date
from pathlib import Path

INDEX_TEMPLATE = """# Knowledge Index

> Repository-local LLM wiki, query history, and work-progress memory.
> Code stays in source directories; durable knowledge lives here and pairs to code symbols via `.mex/context/knowledge-pairings.md`.

## Retrieval Gate

1. **Code change / impact check** -> `mex-agent wiki for-code <nodeId>` or `mex-agent impact <symbol|file>` first; load only paired `knowledge/` sections.
2. **Semantic / past-query search** -> `zg query "<query>" -g 'knowledge/**' -g '!knowledge/raw/**' -g '!knowledge/work/archive/**' --preview none --limit 5`, then read matched line ranges only.
3. **Code search** -> `semble search "<query>" <path>` or `zg query "<query>" -g '!knowledge/**' --preview none --limit 8`.

## Active Work (`work/active/`)

_No active work notes yet._

## Queries & Decisions (`queries/`)

_No filed query notes yet._

## Concepts (`concepts/`)

_No concept notes yet._
"""

LOG_TEMPLATE = """# Knowledge Log

"""

PAIRINGS_TEMPLATE = """---
name: knowledge-pairings
description: Bridge entities pairing root knowledge/ documents (queries, work checks, concepts) with grounded code symbols.
type: component
status: promoted
grounds_to: []
last_updated: {today}
---

# Knowledge Pairings

Add `<!-- mex:entity ... -->` entries via `pair_sync.py --sync` or `mex-agent wiki apply` to bind code symbols (`grounds_to`) to `knowledge/` documents.
"""

DIRS = (
    "knowledge/raw",
    "knowledge/queries",
    "knowledge/work/active",
    "knowledge/work/archive",
    "knowledge/concepts",
)


def atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".rkw-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def ensure_gitignore_allowlist(project: Path, dry_run: bool) -> str:
    gitignore = project / ".gitignore"
    if not gitignore.is_file():
        return "unchanged (no .gitignore)"
    lines = gitignore.read_text(encoding="utf-8").splitlines()
    if "/*" not in [line.strip() for line in lines]:
        return "unchanged (not a root allowlist .gitignore)"
    if "!/knowledge/" in [line.strip() for line in lines]:
        return "unchanged (!/knowledge/ present)"
    new_lines: list[str] = []
    inserted = False
    for line in lines:
        new_lines.append(line)
        if not inserted and line.strip() == "!/docs/":
            new_lines.append("!/knowledge/")
            inserted = True
    if not inserted:
        idx = next((i for i, l in enumerate(new_lines) if l.strip() == "/*"), len(new_lines) - 1)
        new_lines.insert(idx + 1, "!/knowledge/")
    if not dry_run:
        atomic_write(gitignore, "\n".join(new_lines) + "\n")
    return "planned" if dry_run else "updated"


def ensure_mex_router_edge(project: Path, dry_run: bool) -> str:
    router = project / ".mex/ROUTER.md"
    if not router.is_file():
        return "unchanged (no .mex/ROUTER.md)"
    text = router.read_text(encoding="utf-8")
    if "context/knowledge-pairings.md" in text:
        return "unchanged (edge present)"
    lines = text.splitlines()
    edge_block = [
        "  - target: context/knowledge-pairings.md",
        "    condition: when checking code-to-knowledge pairings, query history links, or active work memory",
    ]
    out: list[str] = []
    inserted = False
    in_edges = False
    for line in lines:
        if line.strip() == "edges:":
            in_edges = True
            out.append(line)
            continue
        if in_edges and not inserted and (line.startswith("last_updated:") or line == "---"):
            out.extend(edge_block)
            inserted = True
            in_edges = False
        out.append(line)
    if not inserted:
        return "unchanged (no edges block)"
    if not dry_run:
        atomic_write(router, "\n".join(out) + ("\n" if text.endswith("\n") else ""))
    return "planned" if dry_run else "updated"


def bootstrap(project: Path, dry_run: bool = False) -> dict:
    created: list[str] = []
    unchanged: list[str] = []

    for rel in DIRS:
        d = project / rel
        if not d.is_dir():
            if not dry_run:
                d.mkdir(parents=True, exist_ok=True)
            created.append(rel + "/")
        keep = d / ".gitkeep"
        is_empty_dir = (not d.is_dir()) or (not any(d.iterdir()))
        if rel in ("knowledge/raw", "knowledge/work/archive") and is_empty_dir:
            if not keep.exists():
                if not dry_run:
                    atomic_write(keep, "")
                created.append(f"{rel}/.gitkeep")

    today = date.today().isoformat()
    files = {
        "knowledge/index.md": INDEX_TEMPLATE,
        "knowledge/log.md": LOG_TEMPLATE,
    }
    if (project / ".mex").is_dir():
        files[".mex/context/knowledge-pairings.md"] = PAIRINGS_TEMPLATE.format(today=today)

    for rel, content in files.items():
        target = project / rel
        if target.exists():
            unchanged.append(rel)
        else:
            if not dry_run:
                atomic_write(target, content)
            created.append(rel)

    gitignore_status = ensure_gitignore_allowlist(project, dry_run)
    router_status = ensure_mex_router_edge(project, dry_run)
    return {
        "project": str(project),
        "dry_run": dry_run,
        "created": created,
        "unchanged": unchanged,
        "gitignore": gitignore_status,
        "router": router_status,
        "ok": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default=os.getcwd(), help="Target repository root")
    parser.add_argument("--dry-run", action="store_true", help="Report plan without writing files")
    parser.add_argument("--json", action="store_true", help="Emit JSON output")
    args = parser.parse_args()

    project = Path(args.project).expanduser().resolve()
    if not project.is_dir():
        raise SystemExit(f"Project directory not found: {project}")

    res = bootstrap(project, dry_run=args.dry_run)
    if args.json:
        print(json.dumps(res, indent=2))
    else:
        print(f"repo-knowledge-wiki bootstrap ({'dry-run' if args.dry_run else 'applied'}): "
              f"{len(res['created'])} created, {len(res['unchanged'])} unchanged, "
              f"gitignore={res['gitignore']}, router={res['router']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
