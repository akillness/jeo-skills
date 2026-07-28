#!/usr/bin/env python3
"""Fail-closed validation for manifest-derived catalog projections."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any


class ValidationError(Exception):
    """Raised when a catalog projection no longer matches the manifest."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def sorted_names(values: set[str]) -> str:
    return ", ".join(sorted(values))


def safe_manifest_path(value: str, skill_name: str) -> Path:
    path = Path(value)
    require(not path.is_absolute(), f"manifest skill {skill_name!r} has an absolute path: {value!r}")
    require(".." not in path.parts, f"manifest skill {skill_name!r} escapes .agent-skills: {value!r}")
    require(path.name == "SKILL.md", f"manifest skill {skill_name!r} path must end in SKILL.md: {value!r}")
    require(path.parent.name == skill_name, f"manifest skill {skill_name!r} path must live in its named folder: {value!r}")
    return path


def load_manifest(repo_root: Path) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, list[str]]]:
    manifest_path = repo_root / ".agent-skills" / "skills.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ValidationError(f"manifest not found: {manifest_path}") from error
    except json.JSONDecodeError as error:
        raise ValidationError(f"manifest is not valid JSON: {manifest_path}: {error}") from error

    require(isinstance(manifest, dict), "manifest root must be a JSON object")
    skills = manifest.get("skills")
    categories = manifest.get("categories")
    require(isinstance(skills, list), "manifest.skills must be a list")
    require(isinstance(categories, dict), "manifest.categories must be an object")
    require(isinstance(manifest.get("skill_count"), int), "manifest.skill_count must be an integer")
    return manifest, skills, categories


def manifest_descriptions(repo_root: Path) -> dict[str, str]:
    manifest = json.loads((repo_root / ".agent-skills" / "skills.json").read_text(encoding="utf-8"))
    return {s["name"]: str(s.get("description", "")) for s in manifest["skills"]}


def validate_manifest(repo_root: Path) -> tuple[list[str], dict[str, list[str]]]:
    manifest, skills, categories = load_manifest(repo_root)
    declared_count = manifest["skill_count"]
    require(declared_count == len(skills), f"manifest.skill_count is {declared_count}, but manifest.skills has {len(skills)} entries")

    names: list[str] = []
    paths: list[str] = []
    skill_categories: dict[str, str] = {}
    manifest_root = repo_root / ".agent-skills"

    for index, skill in enumerate(skills, start=1):
        require(isinstance(skill, dict), f"manifest.skills[{index}] must be an object")
        name = skill.get("name")
        category = skill.get("category")
        path_value = skill.get("path")
        require(isinstance(name, str) and name, f"manifest.skills[{index}].name must be a non-empty string")
        require(isinstance(category, str) and category, f"manifest skill {name!r} has no category")
        require(isinstance(path_value, str) and path_value, f"manifest skill {name!r} has no path")
        path = safe_manifest_path(path_value, name)
        require((manifest_root / path).is_file(), f"manifest skill {name!r} declares missing file: .agent-skills/{path.as_posix()}")
        names.append(name)
        paths.append(path.as_posix())
        skill_categories[name] = category

    duplicate_names = {name for name, count in Counter(names).items() if count > 1}
    require(not duplicate_names, f"manifest contains duplicate skill names: {sorted_names(duplicate_names)}")
    duplicate_paths = {path for path, count in Counter(paths).items() if count > 1}
    require(not duplicate_paths, f"manifest contains duplicate skill paths: {sorted_names(duplicate_paths)}")

    normalized_categories: dict[str, list[str]] = {}
    category_members: list[str] = []
    for category, members in categories.items():
        require(isinstance(category, str) and category, "manifest.categories has an invalid category name")
        require(isinstance(members, list), f"manifest category {category!r} must be a list")
        require(all(isinstance(member, str) and member for member in members), f"manifest category {category!r} contains an invalid skill name")
        normalized_categories[category] = members
        category_members.extend(members)

    duplicate_members = {name for name, count in Counter(category_members).items() if count > 1}
    require(not duplicate_members, f"manifest.categories lists skills more than once: {sorted_names(duplicate_members)}")
    name_set = set(names)
    category_set = set(category_members)
    require(category_set == name_set, "manifest category coverage differs from manifest.skills: " + _set_difference_message(name_set, category_set))

    for category, members in normalized_categories.items():
        for name in members:
            require(skill_categories[name] == category, f"manifest skill {name!r} declares category {skill_categories[name]!r}, but categories lists it under {category!r}")
    for name, category in skill_categories.items():
        require(category in normalized_categories, f"manifest skill {name!r} declares undeclared category {category!r}")

    live_paths = {
        (candidate / "SKILL.md").relative_to(manifest_root).as_posix()
        for candidate in manifest_root.iterdir()
        if candidate.is_dir() and (candidate / "SKILL.md").is_file()
    }
    declared_paths = set(paths)
    require(live_paths == declared_paths, "live .agent-skills SKILL.md coverage differs from manifest paths: " + _set_difference_message(declared_paths, live_paths))

    return names, normalized_categories


def _set_difference_message(expected: set[str], actual: set[str]) -> str:
    missing = expected - actual
    unexpected = actual - expected
    parts: list[str] = []
    if missing:
        parts.append(f"missing: {sorted_names(missing)}")
    if unexpected:
        parts.append(f"unexpected: {sorted_names(unexpected)}")
    return "; ".join(parts)


ENGLISH_HEADINGS = {
    "Core Orchestration": "core-orchestration",
    "Planning & Review": "planning-review",
    "Agent Development": "agent-development",
    "Backend": "backend",
    "Frontend": "frontend",
    "Code Quality": "code-quality",
    "Infrastructure": "infrastructure",
    "Documentation": "documentation",
    "Project Management": "project-management",
    r"Search \& Analysis": "search-analysis",
    "Creative Media": "creative-media",
    "Marketing": "marketing",
    "Game Development": "game-development",
    "Utilities": "utilities",
}

KOREAN_HEADINGS = {
    "핵심 오케스트레이션": "core-orchestration",
    "계획 및 검토": "planning-review",
    "에이전트 개발": "agent-development",
    "백엔드": "backend",
    "프론트엔드": "frontend",
    "코드 품질": "code-quality",
    "인프라": "infrastructure",
    "문서화": "documentation",
    "프로젝트 관리": "project-management",
    "검색 및 분석": "search-analysis",
    "창의 미디어": "creative-media",
    "마케팅": "marketing",
    "게임 개발": "game-development",
    "유틸리티": "utilities",
}

HEADING_RE = re.compile(r"^###\s+(.+?)\s+\((\d+)(개)?\)\s*$")
SKILL_ROW_RE = re.compile(r"^\|\s*`([^`]+)`\s*\|\s*$")
LEGACY_TOON_RECORD_RE = re.compile(r"^([a-z0-9][a-z0-9-]*)\|(?:[^|]*\|){3}[^|]*\|[^|]*$")


def parse_readme_categories(readme_path: Path, section_marker: str, heading_map: dict[str, str]) -> list[tuple[str, int, list[str]]]:
    try:
        lines = readme_path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError as error:
        raise ValidationError(f"README projection not found: {readme_path}") from error

    try:
        start = next(index for index, line in enumerate(lines) if line == section_marker)
    except StopIteration as error:
        raise ValidationError(f"{readme_path.name} is missing its skills-list section heading {section_marker!r}") from error

    end = next((index for index in range(start + 1, len(lines)) if lines[index] == "---"), len(lines))
    sections: list[tuple[str, int, list[str]]] = []
    current_category: str | None = None
    current_count: int | None = None
    current_rows: list[str] = []

    for line in lines[start + 1 : end]:
        match = HEADING_RE.match(line)
        if match:
            if current_category is not None:
                sections.append((current_category, current_count or 0, current_rows))
            title, count_text, _korean_suffix = match.groups()
            title = re.sub(r"^[^\w\\]+", "", title).strip()
            category = heading_map.get(title)
            require(category is not None, f"{readme_path.name} has an unknown skills-list heading: {title!r}")
            current_category = category
            current_count = int(count_text)
            current_rows = []
            continue
        row_match = SKILL_ROW_RE.match(line)
        if row_match and current_category is not None:
            current_rows.append(row_match.group(1))

    if current_category is not None:
        sections.append((current_category, current_count or 0, current_rows))
    require(sections, f"{readme_path.name} has no category tables in its skills-list section")
    return sections


def first_order_difference(expected: list[str], actual: list[str]) -> str:
    for index, (expected_name, actual_name) in enumerate(zip(expected, actual), start=1):
        if expected_name != actual_name:
            return f"row {index}: expected {expected_name!r}, found {actual_name!r}"
    if len(actual) < len(expected):
        return f"row {len(actual) + 1}: missing {expected[len(actual)]!r}"
    if len(actual) > len(expected):
        return f"row {len(expected) + 1}: unexpected {actual[len(expected)]!r}"
    return "values differ despite matching row count"


def validate_readme(readme_path: Path, section_marker: str, heading_map: dict[str, str], categories: dict[str, list[str]], skill_count: int) -> None:
    sections = parse_readme_categories(readme_path, section_marker, heading_map)
    table_categories = [category for category, _count, _rows in sections]
    duplicate_categories = {category for category, count in Counter(table_categories).items() if count > 1}
    require(not duplicate_categories, f"{readme_path.name} repeats category tables: {sorted_names(duplicate_categories)}")
    require(set(table_categories) == set(categories), f"{readme_path.name} category headings differ from manifest: " + _set_difference_message(set(categories), set(table_categories)))
    require(len(sections) == len(categories), f"{readme_path.name} has {len(sections)} category tables, expected {len(categories)}")

    table_rows: list[str] = []
    heading_total = 0
    for category, heading_count, rows in sections:
        expected_rows = categories[category]
        require(heading_count == len(expected_rows), f"{readme_path.name} heading count for {category!r} is {heading_count}, expected {len(expected_rows)}")
        require(rows == expected_rows, f"{readme_path.name} rows for {category!r} are not in manifest order: {first_order_difference(expected_rows, rows)}")
        table_rows.extend(rows)
        heading_total += heading_count

    duplicate_rows = {name for name, count in Counter(table_rows).items() if count > 1}
    require(not duplicate_rows, f"{readme_path.name} repeats skill rows: {sorted_names(duplicate_rows)}")
    require(len(table_rows) == skill_count, f"{readme_path.name} has {len(table_rows)} skill rows, expected {skill_count}")
    require(heading_total == skill_count, f"{readme_path.name} heading counts total {heading_total}, expected {skill_count}")
    require(set(table_rows) == {name for names in categories.values() for name in names}, f"{readme_path.name} skill row coverage differs from manifest: " + _set_difference_message({name for names in categories.values() for name in names}, set(table_rows)))


def validate_toon(repo_root: Path, skill_names: list[str]) -> int:
    toon_path = repo_root / ".agent-skills" / "skills.toon"
    try:
        lines = toon_path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError as error:
        raise ValidationError(f"root TOON projection not found: {toon_path}") from error

    expected = set(skill_names)
    records: list[str] = []
    for line in lines:
        if line.startswith("N:") and line[2:].strip():
            records.append(line[2:].split(maxsplit=1)[0])
            continue
        legacy_match = LEGACY_TOON_RECORD_RE.match(line)
        if legacy_match:
            records.append(legacy_match.group(1))

    counts = Counter(records)
    missing = expected - set(records)
    duplicates = {name for name, count in counts.items() if count != 1 and name in expected}
    unexpected = set(records) - expected
    messages: list[str] = []
    if missing:
        messages.append(f"missing catalog records: {sorted_names(missing)}")
    if duplicates:
        messages.append(f"non-unique catalog records: {sorted_names(duplicates)}")
    if unexpected:
        messages.append(f"unknown catalog records: {sorted_names(unexpected)}")
    require(not messages, "root skills.toon differs from manifest: " + "; ".join(messages))
    return len(records)


# Anthropic's SKILL.md contract and opencode's loader both cap the description at
# 1024 characters. A skill whose frontmatter does not parse is skipped silently by
# every skill CLI — that is how 8 skills shipped here while `skills add --skill
# <name>` answered "No matching skills found".
MAX_DESCRIPTION = 1024
MIN_DESCRIPTION = 25
STRAY_SCALARS = {">", "|", ">-", "|-", ">+", "|+", "-", ""}
# An earlier generator cut descriptions mid-sentence and cached the fragment in the
# manifest; both shapes pass a naive length check but publish text no agent can use.
TRUNCATION_SUFFIXES = ("...", "…")
# `description: Use this skill when >` + indented prose folds into valid YAML that
# carries the block indicator into the sentence, so it clears every length and
# placeholder check while shipping "Use this skill when > Conduct a …" to agents.
STRAY_INDICATOR_RE = re.compile(r"^\s*use\s+(?:this\s+)?skill\s+when\s*[>|][+-]?\s+", re.I)


def validate_skill_documents(repo_root: Path, skill_names: list[str], manifest_descriptions: dict[str, str]) -> int:
    try:
        import yaml
    except ImportError:
        raise ValidationError("PyYAML is required to validate SKILL.md frontmatter: pip install pyyaml")

    manifest_root = repo_root / ".agent-skills"
    checked = 0
    for name in skill_names:
        path = manifest_root / name / "SKILL.md"
        text = path.read_text(encoding="utf-8")
        require(text.startswith("---"), f"{name}: SKILL.md has no YAML frontmatter — skill CLIs cannot discover it")
        end = text.find("\n---", 3)
        require(end > 0, f"{name}: SKILL.md frontmatter is not terminated")
        try:
            data = yaml.safe_load(text[3:end])
        except yaml.YAMLError as error:
            raise ValidationError(f"{name}: SKILL.md frontmatter is not valid YAML ({str(error).splitlines()[0]}) — run scripts/repair-skill-frontmatter.py")
        require(isinstance(data, dict), f"{name}: SKILL.md frontmatter must be a mapping")
        require(data.get("name") == name, f"{name}: SKILL.md declares name {data.get('name')!r}")
        description = str(data.get("description", "")).strip()
        require(description not in STRAY_SCALARS, f"{name}: description is the placeholder {description!r} — run scripts/repair-skill-frontmatter.py")
        require(len(description) >= MIN_DESCRIPTION, f"{name}: description is {len(description)} chars; agents cannot match on it")
        require(len(description) <= MAX_DESCRIPTION, f"{name}: description is {len(description)} chars, over the 1024-character limit")
        require(not description.endswith(TRUNCATION_SUFFIXES), f"{name}: description is cut off mid-sentence ({description[-40:]!r}) — run scripts/repair-skill-frontmatter.py")
        require(not STRAY_INDICATOR_RE.match(description), f"{name}: description carries a stray YAML block indicator ({description[:45]!r}) — run scripts/repair-skill-frontmatter.py")
        # SKILL.md is what agent runtimes load; skills.json feeds README/TOON and
        # external consumers. Drift means the catalog advertises text no agent sees.
        manifest_description = " ".join(manifest_descriptions.get(name, "").split())
        require(manifest_description == " ".join(description.split()), f"{name}: skills.json description differs from SKILL.md — run scripts/repair-skill-frontmatter.py")
        checked += 1
    return checked


FRONTMATTER_DIR = "frontmatter"
BASELINE_FILE = "baseline.txt"
LEDGER_FILE = "exception-ledger.txt"
CI_FILE = ".github/workflows/ci.yml"
RECORDED_HASH_KEY = "A0-c__recorded_hash"


def _read_recorded_ledger_hash(repo_root: Path) -> str | None:
    """Read `A0-c'_recorded_hash` from ci.yml.

    The hash lives OUTSIDE the ledger file on purpose: a ledger that carries its
    own expected hash can be re-signed by whatever rewrote it, which defeats
    G11c. ci.yml is a review-required surface, so amending it is visible.
    """
    ci = repo_root / CI_FILE
    if not ci.is_file():
        return None
    match = re.search(rf"{RECORDED_HASH_KEY}:\s*([0-9a-f]{{64}})", ci.read_text(encoding="utf-8"))
    return match.group(1) if match else None


def _parse_ledger(path: Path) -> dict[str, dict[str, str]]:
    """Parse the frontmatter exception ledger.

    Records are `key: value` blocks separated by blank lines; every field in the
    schema is required, so a truncated record fails closed instead of silently
    widening the exception surface.
    """
    required = {
        "slug", "approval_ref", "reason", "key", "lines",
        "before_sha256", "after_sha256",
        "desc_len_before", "desc_len_after",
        "approved_removals", "projection_targets", "architect_signoff",
    }
    records: dict[str, dict[str, str]] = {}
    for chunk in re.split(r"\n\s*\n", path.read_text(encoding="utf-8")):
        fields = {}
        for line in chunk.splitlines():
            line = line.split("#", 1)[0].strip() if line.lstrip().startswith("#") else line
            if not line.strip() or ":" not in line:
                continue
            key, _, value = line.partition(":")
            fields[key.strip()] = value.strip()
        if not fields:
            continue
        missing = required - set(fields)
        require(not missing, f"ledger record {fields.get('slug', '<unnamed>')!r} is missing fields: {sorted(missing)}")
        records[fields["slug"]] = fields
    return records


def validate_frontmatter_frozen(repo_root: Path, require_applied: bool = False) -> str:
    """Rule F — every frontmatter block is byte-frozen unless the ledger pins it.

    The ledger is a RESULT byte pin, not a permission slip: a listed skill must
    land on exactly `after_sha256`, so both "changed something else" and "did not
    apply the intended edit" fail. `--update-baseline` is deliberately unused
    inside the program.

    Lifecycle: (1) skills outside the 174-entry baseline are not checked, so
    adding a skill is never blocked. (2) In-program changes pass only via ledger
    entry + after-hash match. (3) `--update-baseline` is out-of-program only and
    requires the `Frontmatter-Baseline-Update:` trailer, a recorded architect
    approval, and a before/after hash report. (4) Rule F and the exception ledger
    are program-scoped and are REMOVED FROM ci.yml AT D4.
    """
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from frontmatter_boundary import frontmatter_sha256, iter_skill_docs, slug_of

    art = repo_root / f".{FRONTMATTER_DIR}"
    baseline_path = art / BASELINE_FILE
    ledger_path = art / LEDGER_FILE
    recorded = _read_recorded_ledger_hash(repo_root)

    if not ledger_path.is_file() and recorded is None:
        return "rule F: skipped (no exception ledger and no recorded hash yet)"
    require(
        ledger_path.is_file() and recorded is not None,
        "rule F is half-configured: the exception ledger and the ci.yml "
        f"{RECORDED_HASH_KEY} constant must both exist or both be absent "
        f"(ledger={ledger_path.is_file()}, recorded_hash={recorded is not None})",
    )
    require(baseline_path.is_file(), f"rule F needs the A0-c baseline at {baseline_path}")

    actual = hashlib.sha256(ledger_path.read_bytes()).hexdigest()
    require(actual == recorded, f"exception ledger hash {actual} != recorded {recorded} (G11c)")

    baseline = {}
    for line in baseline_path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            slug, digest = line.split("\t")
            baseline[slug] = digest
    ledger = _parse_ledger(ledger_path)

    frozen = pending = applied = 0
    for doc in iter_skill_docs(repo_root / ".agent-skills"):
        slug = slug_of(doc)
        if slug not in baseline:
            continue  # lifecycle (1): new skills are not gated
        digest = frontmatter_sha256(doc)
        if slug not in ledger:
            require(
                digest == baseline[slug],
                f"frontmatter changed outside the exception ledger: {slug} ({baseline[slug]} -> {digest})",
            )
            frozen += 1
            continue
        record = ledger[slug]
        require(record["before_sha256"] == baseline[slug], f"ledger {slug}: before_sha256 does not match the A0-c baseline")
        # A ledger entry may sit on its before-hash (edit not applied yet) or on
        # its after-hash (applied). Any third value is still a hard failure, so
        # the result pin is not weakened — only the pre-L1x window is expressible.
        if digest == record["before_sha256"]:
            pending += 1
        elif digest == record["after_sha256"]:
            applied += 1
        else:
            require(
                False,
                f"ledger {slug}: frontmatter is {digest}; ledger pins "
                f"before={record['before_sha256']} after={record['after_sha256']}",
            )
    require(
        pending + applied == len(ledger),
        f"ledger has {len(ledger)} records but {pending + applied} skills matched a pinned hash",
    )
    if require_applied:
        require(pending == 0, f"gate 1 requires every ledger exception applied; {pending} are still at their before-hash")
    return (
        f"rule F: {frozen} frozen + {applied} applied + {pending} pending "
        f"= {frozen + applied + pending} frontmatter blocks"
    )


def validate_links(repo_root: Path) -> str:
    """Rule 7/8 — no dangling relative links (never reads frontmatter, B-1)."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import link_targets

    broken = link_targets.validate_link_targets(
        repo_root / ".agent-skills",
        repo_root / f".{FRONTMATTER_DIR}",
    )
    require(
        not broken,
        "dangling relative links: "
        + "; ".join(f"{b['file']}:{b['line']} -> {b['target']}" for b in broken[:8])
        + (f" (+{len(broken) - 8} more)" if len(broken) > 8 else ""),
    )
    return "rule 7/8: 0 dangling relative links"

def main() -> int:
    parser = argparse.ArgumentParser(description="Validate manifest-derived TOON and README skill catalog projections.")
    parser.add_argument("--repo-root", default=".", type=Path, help="repository root containing .agent-skills (default: current directory)")
    parser.add_argument("--strict-links", action="store_true", help="fail on dangling relative links (enable after L1 repairs)")
    parser.add_argument("--gate1", action="store_true", help="require every ledger exception applied (gate 1, after L1x)")
    args = parser.parse_args()
    repo_root = args.repo_root.resolve()

    strict_links = args.strict_links
    try:
        skill_names, categories = validate_manifest(repo_root)
        toon_records = validate_toon(repo_root, skill_names)
        loadable = validate_skill_documents(repo_root, skill_names, manifest_descriptions(repo_root))
        validate_readme(repo_root / "README.md", "## 📚 Skills List", ENGLISH_HEADINGS, categories, len(skill_names))
        validate_readme(repo_root / "README.ko.md", "## 📚 스킬 목록", KOREAN_HEADINGS, categories, len(skill_names))
        frozen_summary = validate_frontmatter_frozen(repo_root, require_applied=args.gate1)
        link_summary = validate_links(repo_root) if strict_links else None
    except ValidationError as error:
        print(f"catalog projection validation failed: {error}", file=sys.stderr)
        return 1

    print(f"catalog projections valid: {len(skill_names)} skills, {len(categories)} categories, {toon_records} TOON records, 2 README tables, {loadable} loadable SKILL.md documents")
    print(frozen_summary)
    print(link_summary if link_summary else "rule 7/8: not enforced yet (pass --strict-links after L1)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
