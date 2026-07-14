#!/usr/bin/env python3
"""Fail-closed validation for manifest-derived catalog projections."""

from __future__ import annotations

import argparse
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


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate manifest-derived TOON and README skill catalog projections.")
    parser.add_argument("--repo-root", default=".", type=Path, help="repository root containing .agent-skills (default: current directory)")
    args = parser.parse_args()
    repo_root = args.repo_root.resolve()

    try:
        skill_names, categories = validate_manifest(repo_root)
        toon_records = validate_toon(repo_root, skill_names)
        validate_readme(repo_root / "README.md", "## 📚 Skills List", ENGLISH_HEADINGS, categories, len(skill_names))
        validate_readme(repo_root / "README.ko.md", "## 📚 스킬 목록", KOREAN_HEADINGS, categories, len(skill_names))
    except ValidationError as error:
        print(f"catalog projection validation failed: {error}", file=sys.stderr)
        return 1

    print(f"catalog projections valid: {len(skill_names)} skills, {len(categories)} categories, {toon_records} TOON records, 2 README tables")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
