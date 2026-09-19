#!/usr/bin/env python3
"""Regenerate the manifest-derived catalog projections.

`.agent-skills/skills.toon` and the `## Skills List` tables in the three
READMEs are projections of `.agent-skills/skills.json`. AGENTS.md forbids
hand-editing them, but until now nothing in the repo could actually rebuild
them, so "fix the manifest instead" had no mechanical follow-through and
`scripts/validate-catalog-projections.py` could only report the drift.

This script closes that loop. It is the inverse of the validator: the
validator proves manifest == projections, this one makes it true.

Design constraints:
  * Surgical, not wholesale. Only the derived tokens are rewritten (heading
    counts, subcategory counts, table rows, the intro skill count, and the
    TOON records). Emoji, category titles, per-language labels, prose, and
    every byte outside the skills-list section are read from the existing
    file and written back unchanged, so a regeneration on an unchanged
    manifest is a byte-for-byte no-op. `--check` asserts exactly that.
  * Manifest order is authoritative. The validator requires README rows to
    match `manifest.categories[category]` order, so rows are emitted in that
    order and never sorted.

Usage:
  python3 scripts/generate-catalog-projections.py            # rewrite in place
  python3 scripts/generate-catalog-projections.py --check    # verify only
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HEADING_RE = re.compile(r"^###\s+(?P<prefix>.+?)\s+\((?P<count>\d+)(?P<suffix>개)?\)\s*$")
SKILL_ROW_RE = re.compile(r"^\|\s*`([^`]+)`\s*\|\s*$")

# section marker, intro-count pattern, subcategory-line label
READMES = {
    "README.md": ("## 📚 Skills List", re.compile(r"(·\s*)(\d+)(\s+skills\b)"), "Subcategories:"),
    "README.ko.md": ("## 📚 스킬 목록", re.compile(r"(·\s*)(\d+)(개\s*스킬\b)"), "하위 분류:"),
    "README.es-ES.md": ("## 📚 Lista de Habilidades", re.compile(r"(·\s*)(\d+)(\s+habilidades\b)"), "Subcategorías:"),
}

TOON_HEADER = [
    "# jeo-skills compact catalog v2",
    "# name|category|subcategory|interface|path|description",
]


class GenerationError(RuntimeError):
    pass


def load_manifest(repo_root: Path) -> dict:
    return json.loads((repo_root / ".agent-skills" / "skills.json").read_text(encoding="utf-8"))


def toon_field(value: str) -> str:
    """Collapse whitespace and neutralise the record separator.

    TOON records are pipe-delimited and the validator's record regex rejects a
    pipe anywhere in a field, so a description that legitimately contains one
    (an alternation like `claude|codex|opencode`) would silently drop out of
    the projection and be reported as a missing catalog record. The existing
    catalog already resolves this by writing ` / ` instead, so keep that
    substitution rather than inventing a second convention.
    """
    return " ".join(str(value).split()).replace("|", " / ")


def render_toon(manifest: dict) -> str:
    lines = list(TOON_HEADER)
    for skill in manifest["skills"]:
        fields = [
            toon_field(skill["name"]),
            toon_field(skill["category"]),
            toon_field(skill["subcategory"]),
            toon_field(skill["interface"]),
            toon_field(skill["path"]),
            toon_field(skill.get("description", "")),
        ]
        lines.append("|".join(fields))
    return "\n".join(lines) + "\n"


def render_readme(text: str, manifest: dict, marker: str, intro_re: re.Pattern, sub_label: str) -> str:
    lines = text.split("\n")
    try:
        start = lines.index(marker)
    except ValueError as error:
        raise GenerationError(f"skills-list marker not found: {marker!r}") from error
    end = next((i for i in range(start + 1, len(lines)) if lines[i] == "---"), len(lines))

    categories = manifest["categories"]
    subcategories = manifest["subcategories"]
    skill_count = len(manifest["skills"])

    out: list[str] = []
    index = start
    category_order = [c for c in categories]
    seen = 0

    while index < end:
        line = lines[index]

        intro = intro_re.search(line) if line.startswith(">") else None
        if intro:
            out.append(intro_re.sub(lambda m: f"{m.group(1)}{skill_count}{m.group(3)}", line))
            index += 1
            continue

        heading = HEADING_RE.match(line)
        if not heading:
            out.append(line)
            index += 1
            continue

        if seen >= len(category_order):
            raise GenerationError("README has more category headings than the manifest has categories")
        category = category_order[seen]
        seen += 1
        members = categories[category]
        suffix = heading.group("suffix") or ""
        out.append(f"### {heading.group('prefix')} ({len(members)}{suffix})")

        # Consume the old block for this category: subcategory line, table
        # header, and rows. Everything else in between is preserved verbatim.
        index += 1
        emitted_sub = emitted_table = False
        while index < end and not HEADING_RE.match(lines[index]):
            current = lines[index]
            if current.startswith(sub_label):
                groups = subcategories[category]
                rendered = ", ".join(f"`{name}` ({len(items)})" for name, items in groups.items())
                out.append(f"{sub_label} {rendered}")
                emitted_sub = True
                index += 1
                continue
            if current.strip() == "| Skill |":
                out.append(current)
                index += 1
                if index < end and lines[index].strip() == "|---|":
                    out.append(lines[index])
                    index += 1
                while index < end and SKILL_ROW_RE.match(lines[index]):
                    index += 1
                out.extend(f"| `{name}` |" for name in members)
                emitted_table = True
                continue
            out.append(current)
            index += 1

        if not (emitted_sub and emitted_table):
            raise GenerationError(f"category {category!r} block is missing its subcategory line or skill table")

    if seen != len(category_order):
        raise GenerationError(f"README has {seen} category headings, manifest has {len(category_order)} categories")

    return "\n".join(lines[:start] + out + lines[end:])


def main() -> int:
    parser = argparse.ArgumentParser(description="Regenerate manifest-derived catalog projections.")
    parser.add_argument("--check", action="store_true", help="verify projections match the manifest without writing")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()

    repo_root = args.repo_root
    manifest = load_manifest(repo_root)

    targets: list[tuple[Path, str, str]] = []

    toon_path = repo_root / ".agent-skills" / "skills.toon"
    targets.append((toon_path, toon_path.read_text(encoding="utf-8"), render_toon(manifest)))

    for filename, (marker, intro_re, sub_label) in READMES.items():
        path = repo_root / filename
        current = path.read_text(encoding="utf-8")
        targets.append((path, current, render_readme(current, manifest, marker, intro_re, sub_label)))

    drifted = [path for path, current, rendered in targets if current != rendered]

    if args.check:
        if drifted:
            for path in drifted:
                print(f"drift: {path.relative_to(repo_root)} does not match the manifest", file=sys.stderr)
            print("run: python3 scripts/generate-catalog-projections.py", file=sys.stderr)
            return 1
        print(f"projections already match the manifest: {len(manifest['skills'])} skills, {len(targets)} files")
        return 0

    for path, _current, rendered in targets:
        path.write_text(rendered, encoding="utf-8")
    if drifted:
        print(f"regenerated {len(drifted)} file(s): " + ", ".join(str(p.relative_to(repo_root)) for p in drifted))
    else:
        print("projections were already up to date; nothing changed")
    print(f"catalog: {len(manifest['skills'])} skills, {len(manifest['categories'])} categories")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except GenerationError as error:
        print(f"projection generation failed: {error}", file=sys.stderr)
        sys.exit(2)
