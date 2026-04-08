#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path


WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]")
IGNORE_DIRS = {".git", ".obsidian", ".trash"}
REQUIRED_PATHS = [
    "AGENTS.md",
    "index.md",
    "log.md",
    "raw/sources",
    "raw/assets",
    "wiki/sources",
    "wiki/entities",
    "wiki/concepts",
    "wiki/queries",
    "wiki/reports",
]


def collect_pages(vault_root: Path) -> dict[str, Path]:
    pages: dict[str, Path] = {}
    for path in vault_root.rglob("*.md"):
        if any(part in IGNORE_DIRS for part in path.parts):
            continue
        rel = path.relative_to(vault_root)
        if rel.name in {"AGENTS.md", "CLAUDE.md"}:
            continue
        if rel.parts and rel.parts[0] == "raw":
            continue
        key = rel.with_suffix("").as_posix()
        pages[key] = path
    return pages


def build_basename_index(pages: dict[str, Path]) -> dict[str, list[str]]:
    index: dict[str, list[str]] = defaultdict(list)
    for rel in pages:
        index[Path(rel).name].append(rel)
    return index


def resolve_target(target: str, basename_index: dict[str, list[str]], pages: dict[str, Path]) -> str | None:
    normalized = target.strip().strip("/")
    if not normalized:
        return None
    normalized = normalized.removesuffix(".md")
    if normalized in pages:
        return normalized
    matches = basename_index.get(Path(normalized).name, [])
    if len(matches) == 1:
        return matches[0]
    return None


def lint(vault_root: Path) -> dict[str, object]:
    missing = [item for item in REQUIRED_PATHS if not (vault_root / item).exists()]
    pages = collect_pages(vault_root)
    basename_index = build_basename_index(pages)
    inbound: dict[str, int] = {key: 0 for key in pages}
    broken_links: list[dict[str, str]] = []

    for rel, path in pages.items():
        text = path.read_text(encoding="utf-8")
        for raw_target in WIKILINK_RE.findall(text):
            resolved = resolve_target(raw_target, basename_index, pages)
            if resolved is None:
                broken_links.append({"page": rel, "target": raw_target})
                continue
            if resolved != rel:
                inbound[resolved] += 1

    orphan_pages = sorted(
        rel
        for rel, count in inbound.items()
        if rel not in {"index", "log"} and count == 0
    )

    return {
        "vault_root": str(vault_root),
        "missing_paths": missing,
        "page_count": len(pages),
        "broken_links": broken_links,
        "orphan_pages": orphan_pages,
    }


def render_text(report: dict[str, object]) -> str:
    lines = [
        f"Vault: {report['vault_root']}",
        f"Pages: {report['page_count']}",
        "",
    ]

    missing = report["missing_paths"]
    broken = report["broken_links"]
    orphan = report["orphan_pages"]

    if missing:
        lines.append("Missing required paths:")
        lines.extend(f"- {item}" for item in missing)
        lines.append("")

    if broken:
        lines.append("Broken wiki links:")
        lines.extend(f"- {item['page']} -> [[{item['target']}]]" for item in broken)
        lines.append("")

    if orphan:
        lines.append("Orphan pages:")
        lines.extend(f"- {item}" for item in orphan)
        lines.append("")

    if not missing and not broken and not orphan:
        lines.append("No structural issues found.")

    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Lint an llm-wiki vault for structural issues.")
    parser.add_argument("vault_root", help="Path to the vault root")
    parser.add_argument(
        "--format",
        choices=("text", "json"),
        default="text",
        help="Output format",
    )
    args = parser.parse_args()

    vault_root = Path(args.vault_root).expanduser().resolve()
    if not vault_root.exists():
        print(f"Vault root not found: {vault_root}", file=sys.stderr)
        return 1

    report = lint(vault_root)
    if args.format == "json":
        print(json.dumps(report, indent=2))
    else:
        sys.stdout.write(render_text(report))

    has_issues = bool(report["missing_paths"] or report["broken_links"] or report["orphan_pages"])
    return 1 if has_issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
