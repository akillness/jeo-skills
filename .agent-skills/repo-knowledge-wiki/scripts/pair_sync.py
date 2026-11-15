#!/usr/bin/env python3
"""Audit pairings between knowledge/ documents and .mex/context/knowledge-pairings.md."""
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path

FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n", re.DOTALL)
DOC_REF_RE = re.compile(r"knowledge/[A-Za-z0-9_./-]+\.md")


def parse_simple_frontmatter(text: str) -> dict[str, object]:
    m = FRONTMATTER_RE.match(text)
    if not m:
        return {}
    data: dict[str, object] = {}
    current_list_key: str | None = None
    for raw in m.group(1).splitlines():
        line = raw.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue
        if current_list_key and line.startswith("  - "):
            data[current_list_key].append(line[4:].strip())  # type: ignore[union-attr]
            continue
        current_list_key = None
        if ":" in line and not line.startswith(" "):
            key, val = line.split(":", 1)
            key = key.strip()
            val = val.strip()
            if val == "":
                data[key] = []
                current_list_key = key
            else:
                data[key] = val.strip("'\"")
    return data


def audit_pairings(project: Path) -> dict:
    knowledge_dir = project / "knowledge"
    pairings_file = project / ".mex/context/knowledge-pairings.md"

    paired_in_mex: set[str] = set()
    if pairings_file.is_file():
        paired_in_mex.update(DOC_REF_RE.findall(pairings_file.read_text(encoding="utf-8")))

    docs: list[dict] = []
    unpaired_with_symbols: list[str] = []
    missing_refs_in_mex: list[str] = []

    if knowledge_dir.is_dir():
        for md in sorted(knowledge_dir.rglob("*.md")):
            rel = md.relative_to(project).as_posix()
            if rel in ("knowledge/index.md", "knowledge/log.md") or rel.startswith("knowledge/raw/"):
                continue
            fm = parse_simple_frontmatter(md.read_text(encoding="utf-8"))
            symbols = fm.get("paired_symbols", [])
            if not isinstance(symbols, list):
                symbols = []
            status = str(fm.get("status", "unknown"))
            in_mex = rel in paired_in_mex
            if symbols and not in_mex and status != "archived":
                unpaired_with_symbols.append(rel)
            docs.append({
                "path": rel,
                "status": status,
                "paired_symbols": symbols,
                "bridged_in_mex": in_mex,
            })

    for ref in sorted(paired_in_mex):
        if not (project / ref).is_file():
            missing_refs_in_mex.append(ref)

    return {
        "project": str(project),
        "pairings_file": str(pairings_file),
        "pairings_file_exists": pairings_file.is_file(),
        "docs": docs,
        "unpaired_with_symbols": unpaired_with_symbols,
        "missing_refs_in_mex": missing_refs_in_mex,
        "ok": not unpaired_with_symbols and not missing_refs_in_mex,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default=os.getcwd(), help="Target repository root")
    parser.add_argument("--json", action="store_true", help="Emit JSON output")
    args = parser.parse_args()

    project = Path(args.project).expanduser().resolve()
    res = audit_pairings(project)
    if args.json:
        print(json.dumps(res, indent=2))
    else:
        print(f"Docs audited: {len(res['docs'])}, unpaired: {len(res['unpaired_with_symbols'])}, "
              f"dangling mex refs: {len(res['missing_refs_in_mex'])}")
        for p in res["unpaired_with_symbols"]:
            print(f"  UNPAIRED: {p}")
        for p in res["missing_refs_in_mex"]:
            print(f"  MISSING:  {p}")
    return 0 if res["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
