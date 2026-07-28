#!/usr/bin/env python3
"""Repair SKILL.md frontmatter that agent runtimes cannot load.

Two failure modes shipped in this repository and both make a skill useless at
runtime even though it is present in the manifest:

1. Unloadable frontmatter — no `---` block at all, or YAML that fails to parse
   because the description was written as a plain scalar containing ": "
   (`description: Use this skill when >` followed by indented prose, or a single
   long line with an inline colon). Skill CLIs skip these silently, so
   `skills add --skill <name>` reports "No matching skills found".
2. Placeholder description — `description: ">"`, a literal greater-than string
   left behind by a generator. The skill loads but every agent that matches on
   the description sees ">" and can never choose it.

Descriptions are recovered from the curated projections in this order:
`.agent-skills/skills.toon` -> manifest description -> the keyword table in
setup-all-skills-prompt.md -> the first prose paragraph of SKILL.md itself.

The frontmatter edit is surgical: only the broken entries are rewritten, every
other key, comment and the document body are preserved byte for byte.

Usage:
    python3 scripts/repair-skill-frontmatter.py --check   # fail-closed audit
    python3 scripts/repair-skill-frontmatter.py           # repair in place
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import textwrap
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:  # pragma: no cover - environment guard
    print("❌ PyYAML is required: pip install pyyaml", file=sys.stderr)
    raise SystemExit(2)

# Anthropic's SKILL.md contract and opencode's loader both cap the description
# at 1024 characters; a longer value is dropped or truncated by the consumer.
MAX_DESCRIPTION = 1024
MIN_DESCRIPTION = 25
STRAY_SCALARS = {">", "|", ">-", "|-", ">+", "|+", "-", ""}
# A description that was cut mid-sentence by an earlier generator (…/... tail) is as
# unusable for skill matching as a missing one, and must never be reused as a source.
TRUNCATED_RE = re.compile(r"(\.{3}|…)\s*$")
ENTRY_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_-]*):(.*)$")
TOON_RE = re.compile(r"^N:(.+)\nD:(.*)$", re.M)
KEYWORD_ROW_RE = re.compile(r"^\|\s*`([a-z0-9][a-z0-9-]*)`\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$", re.M)


def is_stray(value: str) -> bool:
    return value.strip().strip("\"'").strip() in STRAY_SCALARS


def clean(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    if len(text) <= MAX_DESCRIPTION:
        return text
    cut = text[:MAX_DESCRIPTION]
    # prefer a sentence boundary so a truncated description still reads complete
    sentence = max(cut.rfind(". "), cut.rfind("; "), cut.rfind(" — "))
    if sentence > MAX_DESCRIPTION // 2:
        return cut[: sentence + 1].rstrip(" —;")
    return cut[: cut.rfind(" ")].rstrip(" ,;:-—") if " " in cut else cut


def truncated(text: str | None) -> bool:
    return bool(text) and bool(TRUNCATED_RE.search(text.strip()))


def salvage(text: str | None) -> str:
    """Drop a truncated tail at the last complete sentence.

    The text before an earlier generator's cut is authored and accurate, so keeping
    it beats swapping in an unrelated paragraph. Only when nothing complete survives
    does the caller fall through to the next source.
    """
    if not text:
        return ""
    body = TRUNCATED_RE.sub("", text.strip()).strip()
    end = max(body.rfind(". "), body.rfind("! "), body.rfind("? "))
    if body.endswith((".", "!", "?")):
        return body
    return body[: end + 1].strip() if end > 0 else ""


def usable(text: str | None) -> bool:
    if not text or len(text.strip()) < MIN_DESCRIPTION or is_stray(text):
        return False
    return not truncated(text)


def split_frontmatter(text: str) -> tuple[str, str] | None:
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    if end < 0:
        return None
    body_start = text.find("\n", end + 1)
    # text[3] is the newline that closes the opening `---`; keeping it would emit a
    # blank first frontmatter line on rewrite.
    return text[3:end].lstrip("\n"), text[body_start + 1 :] if body_start >= 0 else ""


def split_entries(front: str) -> list[list[str]]:
    entries: list[list[str]] = []
    for line in front.splitlines():
        if ENTRY_RE.match(line) or not entries:
            entries.append([line])
        else:
            entries[-1].append(line)
    return entries


def entry_key(entry: list[str]) -> str | None:
    m = ENTRY_RE.match(entry[0])
    return m.group(1) if m else None


def render_folded(key: str, value: str) -> list[str]:
    lines = textwrap.wrap(value, width=96, break_long_words=False, break_on_hyphens=False)
    return [f"{key}: >-"] + [f"  {line}" for line in lines]


def recover(name: str, entry_text: str, body: str, sources: dict[str, dict[str, str]]) -> str | None:
    inline = entry_text.split(":", 1)[1] if ":" in entry_text else ""
    candidates = [
        sources["toon"].get(name),
        sources["manifest"].get(name),
        sources["keyword"].get(name),
        # the prose already sitting in the broken entry, minus the stray marker
        re.sub(r"\s*>\s*$", "", inline.strip()) + " " + " ".join(entry_text.splitlines()[1:]),
    ]
    for candidate in candidates:
        if usable(candidate):
            return clean(candidate or "")
    # A cut-off candidate still holds correct authored text before the cut.
    for candidate in candidates:
        if truncated(candidate):
            kept = salvage(candidate)
            if usable(kept):
                return clean(kept)
    for paragraph in re.split(r"\n\s*\n", body):
        paragraph = paragraph.strip()
        if paragraph.startswith(("#", "```", "|", "-", ">")) or not paragraph:
            continue
        # Route-out sections state what the skill is NOT for; using one as the
        # description makes every agent match on the negation.
        if re.match(r"(?i)^(do\s*\*{0,2}\s*not|don't|never|avoid)\b", paragraph):
            continue
        if usable(paragraph):
            return clean(paragraph)
    return None


def load_sources(root: Path) -> dict[str, dict[str, str]]:
    toon: dict[str, str] = {}
    toon_path = root / ".agent-skills" / "skills.toon"
    if toon_path.is_file():
        for match in TOON_RE.finditer(toon_path.read_text(encoding="utf-8")):
            toon[match.group(1).strip()] = match.group(2).strip()

    manifest = json.loads((root / ".agent-skills" / "skills.json").read_text(encoding="utf-8"))
    manifest_desc = {s["name"]: str(s.get("description", "")) for s in manifest["skills"]}

    keyword: dict[str, str] = {}
    setup_path = root / "setup-all-skills-prompt.md"
    if setup_path.is_file():
        for match in KEYWORD_ROW_RE.finditer(setup_path.read_text(encoding="utf-8")):
            keyword.setdefault(match.group(1), match.group(3))

    return {"toon": toon, "manifest": manifest_desc, "keyword": keyword, "_manifest": manifest}


def repair_document(path: Path, name: str, sources: dict[str, Any]) -> tuple[str | None, list[str]]:
    """Return (new_text or None when already healthy, list of applied notes)."""
    text = path.read_text(encoding="utf-8")
    notes: list[str] = []
    parts = split_frontmatter(text)

    if parts is None:
        description = recover(name, "", text, sources)
        if description is None:
            return None, [f"{name}: no frontmatter and no recoverable description"]
        block = ["---", f"name: {name}"] + render_folded("description", description) + ["---", ""]
        notes.append(f"{name}: added missing frontmatter")
        return "\n".join(block) + text, notes

    front, body = parts
    entries = split_entries(front)
    parses = True
    try:
        data = yaml.safe_load(front)
        parses = isinstance(data, dict)
    except yaml.YAMLError:
        parses = False
        data = None

    description = data.get("description") if isinstance(data, dict) else None
    description_text = str(description).strip() if description is not None else ""
    # Anthropic's SKILL.md contract and opencode both cap the description at 1024
    # characters, so an over-long value is as broken as a missing one.
    # `---\n\n` means a previous rewrite left a blank first frontmatter line
    normalized = not text.startswith("---\n\n")
    healthy = (parses and usable(description_text)
               and len(description_text) <= MAX_DESCRIPTION and normalized)
    if healthy:
        return None, notes

    rebuilt: list[list[str]] = []
    replaced = False
    for entry in entries:
        key = entry_key(entry)
        entry_text = "\n".join(entry)
        if key == "description":
            value = recover(name, entry_text, body, sources)
            if value is None:
                return None, [f"{name}: description is unrecoverable"]
            rebuilt.append(render_folded("description", value))
            notes.append(f"{name}: description rebuilt ({len(value)} chars)")
            replaced = True
            continue
        if key and len(entry) == 1 and is_stray(entry[0].split(":", 1)[1]):
            notes.append(f"{name}: dropped placeholder key {key!r}")
            continue
        if key and not parses and len(entry) > 1:
            # another multi-line plain scalar that cannot parse — fold it too
            head = entry[0].split(":", 1)[1]
            merged = clean(re.sub(r"\s*>\s*$", "", head) + " " + " ".join(entry[1:]))
            try:
                yaml.safe_load("\n".join(entry))
            except yaml.YAMLError:
                rebuilt.append(render_folded(key, merged))
                notes.append(f"{name}: folded unparseable key {key!r}")
                continue
        rebuilt.append(entry)

    if not replaced:
        value = recover(name, "", body, sources)
        if value is None:
            return None, [f"{name}: description missing and unrecoverable"]
        rebuilt.insert(1, render_folded("description", value))
        notes.append(f"{name}: description added ({len(value)} chars)")

    new_front = "\n".join(line for entry in rebuilt for line in entry)
    try:
        check = yaml.safe_load(new_front)
        if not isinstance(check, dict) or not usable(str(check.get("description", ""))):
            return None, [f"{name}: repair did not produce a loadable description"]
    except yaml.YAMLError as error:
        return None, [f"{name}: repair still fails to parse: {str(error).splitlines()[0]}"]

    return f"---\n{new_front}\n---\n{body}", notes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="report problems and exit non-zero without writing")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()

    root = args.repo_root
    sources = load_sources(root)
    manifest = sources["_manifest"]

    repaired, failures, synced = [], [], []
    for skill in manifest["skills"]:
        name = skill["name"]
        path = root / ".agent-skills" / skill["path"]
        if not path.is_file():
            failures.append(f"{name}: missing {skill['path']}")
            continue
        new_text, notes = repair_document(path, name, sources)
        for note in notes:
            (repaired if new_text else failures).append(note)
        if new_text is None:
            continue
        repaired_description = yaml.safe_load(split_frontmatter(new_text)[0])["description"]
        if not args.check:
            path.write_text(new_text, encoding="utf-8")
            skill["description"] = repaired_description

    # SKILL.md is the single source of truth: it is what every agent runtime loads.
    # skills.json feeds README/TOON and external consumers, so a manifest description
    # that drifts from it publishes text no agent will ever see — including the
    # "Use this skill when >" fragments an earlier line-based generator cached.
    for skill in manifest["skills"]:
        path = root / ".agent-skills" / skill["path"]
        if not path.is_file():
            continue
        parts = split_frontmatter(path.read_text(encoding="utf-8"))
        if parts is None:
            continue
        try:
            data = yaml.safe_load(parts[0])
        except yaml.YAMLError:
            continue
        if not isinstance(data, dict):
            continue
        source = " ".join(str(data.get("description", "")).split())
        if not source or " ".join(str(skill.get("description", "")).split()) == source:
            continue
        synced.append(f"{skill['name']}: manifest description synced from SKILL.md")
        if not args.check:
            skill["description"] = source

    if (repaired or synced) and not args.check:
        manifest_path = root / ".agent-skills" / "skills.json"
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    for line in repaired + synced:
        print(("would fix: " if args.check else "fixed: ") + line)
    for line in failures:
        print(f"❌ {line}", file=sys.stderr)

    if failures:
        return 1
    if args.check and (repaired or synced):
        print(f"\n{len(repaired)} SKILL.md documents need repair, {len(synced)} manifest"
              " descriptions drifted — run without --check", file=sys.stderr)
        return 1
    print(f"\n✅ {len(manifest['skills'])} SKILL.md documents load cleanly and match the manifest"
          if not (repaired or synced)
          else f"\n✅ repaired {len(repaired)} documents, synced {len(synced)} manifest"
               f" descriptions across {len(manifest['skills'])} skills")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
