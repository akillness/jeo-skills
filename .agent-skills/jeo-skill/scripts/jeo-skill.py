#!/usr/bin/env python3
"""Lightweight category browser and selective installer for jeo-skills."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Iterable

DEFAULT_SOURCE = "https://github.com/akillness/jeo-skills"
DEFAULT_CATALOG_URL = (
    "https://raw.githubusercontent.com/akillness/jeo-skills/main/"
    ".agent-skills/skills.json"
)
CACHE_PATH = Path.home() / ".cache" / "jeo-skill" / "skills.json"
BIN_PATH = Path.home() / ".local" / "bin" / "jeo-skill"
TOKEN_RE = re.compile(r"[a-z0-9]+")


class JeoSkillError(RuntimeError):
    """User-facing CLI error."""


def local_catalog_candidates() -> Iterable[Path]:
    configured = os.environ.get("JEO_SKILLS_CATALOG")
    if configured:
        yield Path(configured).expanduser()

    # Source checkout: <repo>/.agent-skills/jeo-skill/scripts/jeo-skill.py.
    # Installed copy: ~/.agents/skills/jeo-skill/scripts/jeo-skill.py; its
    # parents[2] has no catalog, so fall through to the remote/cache path. Do
    # not walk up to ~/.agent-skills because that may be an unrelated legacy
    # installation.
    script_catalog = Path(__file__).resolve().parents[2] / "skills.json"
    yield script_catalog
    yield Path.cwd() / ".agent-skills" / "skills.json"


def validate_catalog(data: Any, source: str) -> dict[str, Any]:
    if not isinstance(data, dict) or not isinstance(data.get("skills"), list):
        raise JeoSkillError(f"Invalid catalog at {source}: missing skills array")
    if not isinstance(data.get("categories"), dict):
        raise JeoSkillError(f"Invalid catalog at {source}: missing categories object")

    names = [item.get("name") for item in data["skills"] if isinstance(item, dict)]
    if len(names) != len(data["skills"]) or any(not isinstance(name, str) for name in names):
        raise JeoSkillError(f"Invalid catalog at {source}: every skill needs a name")
    if len(names) != len(set(names)):
        raise JeoSkillError(f"Invalid catalog at {source}: duplicate skill names")
    return data


def read_json(path: Path) -> dict[str, Any]:
    try:
        return validate_catalog(json.loads(path.read_text(encoding="utf-8")), str(path))
    except (OSError, json.JSONDecodeError) as error:
        raise JeoSkillError(f"Cannot read catalog {path}: {error}") from error


def download_catalog() -> dict[str, Any]:
    request = urllib.request.Request(
        DEFAULT_CATALOG_URL,
        headers={"User-Agent": "jeo-skill/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = response.read().decode("utf-8")
        data = validate_catalog(json.loads(payload), DEFAULT_CATALOG_URL)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        if CACHE_PATH.is_file():
            return read_json(CACHE_PATH)
        raise JeoSkillError(
            "No local catalog or usable cache, and remote catalog download failed: "
            f"{error}"
        ) from error

    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return data


def load_catalog() -> tuple[dict[str, Any], str]:
    seen: set[Path] = set()
    for candidate in local_catalog_candidates():
        candidate = candidate.resolve()
        if candidate in seen:
            continue
        seen.add(candidate)
        if candidate.is_file():
            return read_json(candidate), str(candidate)
    return download_catalog(), DEFAULT_CATALOG_URL


def skill_index(catalog: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item["name"]: item for item in catalog["skills"]}


def filtered_skills(
    catalog: dict[str, Any],
    category: str | None = None,
    subcategory: str | None = None,
    interface: str | None = None,
) -> list[dict[str, Any]]:
    rows = catalog["skills"]
    if category:
        rows = [row for row in rows if row.get("category") == category]
    if subcategory:
        rows = [row for row in rows if row.get("subcategory") == subcategory]
    if interface:
        rows = [row for row in rows if row.get("interface") == interface]
    return sorted(rows, key=lambda row: (row.get("subcategory", ""), row["name"]))


def require_known_filter(
    catalog: dict[str, Any], category: str | None, subcategory: str | None
) -> None:
    if category and category not in catalog["categories"]:
        known = ", ".join(catalog["categories"])
        raise JeoSkillError(f"Unknown category '{category}'. Known: {known}")
    if subcategory:
        known_subcategories = {
            item.get("subcategory")
            for item in catalog["skills"]
            if not category or item.get("category") == category
        }
        if subcategory not in known_subcategories:
            known = ", ".join(sorted(value for value in known_subcategories if value))
            scope = f" in {category}" if category else ""
            raise JeoSkillError(
                f"Unknown subcategory '{subcategory}'{scope}. Known: {known}"
            )


def print_json(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2))


def command_categories(args: argparse.Namespace, catalog: dict[str, Any]) -> None:
    subcategories = catalog.get("subcategories", {})
    rows = []
    for category, names in catalog["categories"].items():
        children = subcategories.get(category, {})
        rows.append(
            {
                "category": category,
                "count": len(names),
                "subcategories": {
                    name: len(members) for name, members in children.items()
                },
            }
        )
    if args.json:
        print_json(rows)
        return
    for row in rows:
        children = ", ".join(
            f"{name}({count})" for name, count in row["subcategories"].items()
        )
        print(f"{row['category']} ({row['count']}): {children}")


def command_list(args: argparse.Namespace, catalog: dict[str, Any]) -> None:
    require_known_filter(catalog, args.category, args.subcategory)
    rows = filtered_skills(catalog, args.category, args.subcategory, args.interface)
    if args.json:
        print_json(rows)
        return
    if not rows:
        print("No matching skills.")
        return
    for row in rows:
        print(
            f"{row['name']}\t{row.get('category', '-')}/"
            f"{row.get('subcategory', '-')}\t{row.get('interface', '-')}"
        )


def tokenize(text: str) -> set[str]:
    return set(TOKEN_RE.findall(text.lower().replace("-", " ")))


def command_search(args: argparse.Namespace, catalog: dict[str, Any]) -> None:
    query_tokens = tokenize(args.query)
    scored: list[tuple[int, dict[str, Any]]] = []
    phrase = args.query.lower()
    for row in catalog["skills"]:
        haystack = " ".join(
            [
                row["name"],
                str(row.get("description", "")),
                " ".join(row.get("tags", [])),
                str(row.get("category", "")),
                str(row.get("subcategory", "")),
            ]
        ).lower()
        overlap = len(query_tokens & tokenize(haystack))
        score = overlap * 10 + (25 if phrase in haystack else 0)
        if score:
            scored.append((score, row))
    rows = [row for _score, row in sorted(scored, key=lambda pair: (-pair[0], pair[1]["name"]))[: args.limit]]
    if args.json:
        print_json(rows)
        return
    for row in rows:
        print(
            f"{row['name']}\t{row.get('category')}/{row.get('subcategory')}\n"
            f"  {row.get('description', '')}"
        )


def related_groups(catalog: dict[str, Any], name: str) -> list[dict[str, Any]]:
    result = []
    for group_name, group in catalog.get("relationship_groups", {}).items():
        members = group.get("members", [])
        if name in members:
            result.append({"group": group_name, **group})
    return result


def command_related(args: argparse.Namespace, catalog: dict[str, Any]) -> None:
    index = skill_index(catalog)
    if args.name not in index:
        retired = catalog.get("retired_skills", {}).get(args.name)
        if not retired:
            raise JeoSkillError(f"Unknown skill '{args.name}'")
        payload = {"retired_skill": args.name, **retired}
        if args.json:
            print_json(payload)
        else:
            suffix = f" ({retired['mode']})" if retired.get("mode") else ""
            print(f"{args.name} is retired -> {retired['replacement']}{suffix}")
            print(retired["reason"])
        return
    groups = related_groups(catalog, args.name)
    if args.json:
        print_json({"skill": index[args.name], "groups": groups})
        return
    print(
        f"{args.name}: {index[args.name].get('category')}/"
        f"{index[args.name].get('subcategory')}"
    )
    if not groups:
        print("No explicit relationship group; use category neighbors.")
        return
    for group in groups:
        canonical = f"; canonical={group['canonical']}" if group.get("canonical") else ""
        print(
            f"- {group['group']} [{group.get('mode', 'related')}{canonical}]: "
            + ", ".join(group["members"])
        )
        if group.get("note"):
            print(f"  {group['note']}")


def unique(values: Iterable[str]) -> list[str]:
    result = []
    seen = set()
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result


def resolve_install_selection(
    args: argparse.Namespace, catalog: dict[str, Any]
) -> list[str]:
    index = skill_index(catalog)
    selected = list(args.names)

    if args.bundle:
        bundles = catalog.get("bundles", {})
        if args.bundle not in bundles:
            raise JeoSkillError(
                f"Unknown bundle '{args.bundle}'. Known: {', '.join(bundles)}"
            )
        selected.extend(bundles[args.bundle])

    if args.category or args.subcategory or args.interface:
        require_known_filter(catalog, args.category, args.subcategory)
        selected.extend(
            row["name"]
            for row in filtered_skills(
                catalog, args.category, args.subcategory, args.interface
            )
        )

    selected = unique(selected)
    if not selected:
        raise JeoSkillError(
            "No skills selected. Pass names, --bundle, --category, or --subcategory."
        )
    unknown = [name for name in selected if name not in index]
    if unknown:
        retired = catalog.get("retired_skills", {})
        replacements = [
            f"{name}->{retired[name]['replacement']}"
            + (f" ({retired[name]['mode']})" if retired[name].get("mode") else "")
            for name in unknown
            if name in retired
        ]
        truly_unknown = [name for name in unknown if name not in retired]
        parts = []
        if replacements:
            parts.append("retired: " + ", ".join(replacements))
        if truly_unknown:
            parts.append("unknown: " + ", ".join(truly_unknown))
        raise JeoSkillError("; ".join(parts))
    return selected


def install_command(args: argparse.Namespace, selected: list[str]) -> list[str]:
    command = ["npx", "--yes", "skills", "add", args.source, "--skill", *selected]
    if args.global_install:
        command.append("--global")
    if args.agent:
        command.extend(["--agent", args.agent])
    if args.yes:
        command.append("--yes")
    return command


def command_install(args: argparse.Namespace, catalog: dict[str, Any]) -> None:
    selected = resolve_install_selection(args, catalog)
    command = install_command(args, selected)
    print(f"Selected {len(selected)} skill(s): {', '.join(selected)}")
    print("Command: " + " ".join(command))
    if args.dry_run:
        return
    if shutil.which("npx") is None:
        raise JeoSkillError("npx is required to install skills")
    if len(selected) > 12 and not args.yes:
        raise JeoSkillError(
            "Selection is larger than 12 skills. Review with --dry-run, then pass --yes."
        )
    completed = subprocess.run(command, check=False)
    if completed.returncode:
        raise JeoSkillError(f"skills installer exited with {completed.returncode}")


def command_link(args: argparse.Namespace) -> None:
    source = Path(__file__).resolve()
    BIN_PATH.parent.mkdir(parents=True, exist_ok=True)
    if os.path.lexists(BIN_PATH):
        if BIN_PATH.is_symlink() and BIN_PATH.resolve() == source:
            print(f"Already linked: {BIN_PATH} -> {source}")
            return
        if not args.force:
            raise JeoSkillError(
                f"{BIN_PATH} already exists; use --force to replace this CLI entry"
            )
        BIN_PATH.unlink()
    source.chmod(source.stat().st_mode | 0o111)
    BIN_PATH.symlink_to(source)
    print(f"Linked: {BIN_PATH} -> {source}")


def command_doctor(_args: argparse.Namespace, catalog: dict[str, Any], source: str) -> None:
    report = {
        "ok": True,
        "catalog": source,
        "catalog_version": catalog.get("version"),
        "skills": len(catalog["skills"]),
        "categories": len(catalog["categories"]),
        "python": sys.version.split()[0],
        "npx": shutil.which("npx"),
        "linked": BIN_PATH.is_symlink() and BIN_PATH.resolve() == Path(__file__).resolve(),
    }
    print_json(report)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="jeo-skill",
        description="Browse and selectively install the categorized jeo-skills catalog.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    categories = sub.add_parser("categories", help="Show categories and subcategory counts")
    categories.add_argument("--json", action="store_true")

    listing = sub.add_parser("list", help="List a category slice")
    listing.add_argument("-c", "--category")
    listing.add_argument("-s", "--subcategory")
    listing.add_argument("--interface")
    listing.add_argument("--json", action="store_true")

    search = sub.add_parser("search", help="Search names, descriptions, and taxonomy")
    search.add_argument("query")
    search.add_argument("--limit", type=int, default=10)
    search.add_argument("--json", action="store_true")

    related = sub.add_parser("related", help="Show explicit overlap/sequence groups")
    related.add_argument("name")
    related.add_argument("--json", action="store_true")

    install = sub.add_parser("install", help="Selectively install skills")
    install.add_argument("names", nargs="*")
    install.add_argument("-c", "--category")
    install.add_argument("-s", "--subcategory")
    install.add_argument("-b", "--bundle")
    install.add_argument("--interface")
    install.add_argument("--source", default=DEFAULT_SOURCE)
    install.add_argument("-g", "--global", dest="global_install", action="store_true")
    install.add_argument("-a", "--agent")
    install.add_argument("--dry-run", action="store_true")
    install.add_argument("-y", "--yes", action="store_true")

    link = sub.add_parser("link", help=f"Link the CLI at {BIN_PATH}")
    link.add_argument("--force", action="store_true")

    sub.add_parser("doctor", help="Verify catalog and installer prerequisites")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        if args.command == "link":
            command_link(args)
            return 0
        catalog, source = load_catalog()
        if args.command == "categories":
            command_categories(args, catalog)
        elif args.command == "list":
            command_list(args, catalog)
        elif args.command == "search":
            command_search(args, catalog)
        elif args.command == "related":
            command_related(args, catalog)
        elif args.command == "install":
            command_install(args, catalog)
        elif args.command == "doctor":
            command_doctor(args, catalog, source)
        return 0
    except JeoSkillError as error:
        print(f"jeo-skill: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
