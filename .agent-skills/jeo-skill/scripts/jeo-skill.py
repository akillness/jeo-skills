#!/usr/bin/env python3
"""Lightweight category browser and selective installer for jeo-skills."""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Iterable

sys.dont_write_bytecode = True
from install_support import copy_tree, require_safe_path, require_safe_tree, resolve_aside_user

DEFAULT_SOURCE = "https://github.com/akillness/jeo-skills"
DEFAULT_CATALOG_URL = (
    "https://raw.githubusercontent.com/akillness/jeo-skills/main/"
    ".agent-skills/skills.json"
)
CACHE_PATH = Path.home() / ".cache" / "jeo-skill" / "skills.json"
BIN_PATH = Path.home() / ".local" / "bin" / "jeo-skill"
TOKEN_RE = re.compile(r"[a-z0-9]+")
SKILLS_PACKAGE = "skills@1.7.0"
AGENT_ALIASES = {"jeopi": "universal", "jeo": "universal", "omp": "universal", "gjc": "universal", "aside": "universal", "agy": "antigravity-cli"}


class JeoSkillError(RuntimeError):
    """User-facing CLI error."""


def local_catalog_candidates() -> Iterable[Path]:
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


def download_catalog(cache: bool = True) -> dict[str, Any]:
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

    if cache:
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CACHE_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return data


def load_catalog(cache: bool = True) -> tuple[dict[str, Any], str]:
    configured = os.environ.get("JEO_SKILLS_CATALOG")
    if configured:
        path = Path(configured).expanduser().resolve()
        return read_json(path), str(path)
    seen: set[Path] = set()
    for candidate in local_catalog_candidates():
        candidate = candidate.resolve()
        if candidate in seen:
            continue
        seen.add(candidate)
        if candidate.is_file():
            return read_json(candidate), str(candidate)
    return download_catalog(cache=cache), DEFAULT_CATALOG_URL


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
    if args.limit < 0:
        raise JeoSkillError("--limit must be non-negative")
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
    if args.all:
        selected.extend(index)

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
    command = ["npx", "--yes", SKILLS_PACKAGE, "add", args.source, "--skill", *selected,
               "--agent", AGENT_ALIASES.get(args.agent, args.agent), "--copy", "--full-depth"]
    if args.global_install:
        command.append("--global")
    if args.yes:
        command.append("--yes")
    return command


def install_root(args: argparse.Namespace) -> Path | None:
    agent = AGENT_ALIASES.get(args.agent, args.agent)
    home = Path.home()
    base = home if args.global_install else Path.cwd()
    shared = {"universal", "cline", "codex", "cursor", "gemini-cli", "opencode", "antigravity", "antigravity-cli"}
    if not args.global_install:
        relative = ".agents/skills" if agent in shared else {
            "claude-code": ".claude/skills", "pi": ".pi/skills", "crush": ".crush/skills"
        }.get(agent)
        return base / relative if relative else None
    if agent in shared:
        return home / ".agents/skills"
    roots = {
        "claude-code": Path(os.environ.get("CLAUDE_CONFIG_DIR", "").strip() or str(home / ".claude")) / "skills",
        "pi": home / ".pi/agent/skills", "crush": home / ".config/crush/skills",
    }
    return roots.get(agent)


def projection_root(args: argparse.Namespace) -> Path | None:
    if args.agent == "aside":
        if not args.global_install:
            raise JeoSkillError("Aside is account-scoped; pass --global")
        return resolve_aside_user(Path(args.aside_home), args.aside_account)
    if args.aside_account or args.aside_home != str(Path.home() / ".aside"):
        raise JeoSkillError("Aside options require --agent aside")
    if args.agent == "gjc":
        if not args.global_install:
            return Path.cwd() / ".gjc/skills"
        return Path.home() / gjc_config_name().lstrip("/") / "agent/skills"
    if args.global_install:
        agent = AGENT_ALIASES.get(args.agent, args.agent)
        if agent == "antigravity-cli":
            return Path.home() / ".gemini/antigravity-cli/skills"
        if agent == "antigravity":
            return Path.home() / ".gemini/config/skills"
    return None


def gjc_config_name() -> str:
    # Match GJC's native scanner, including its project-dotenv trust guard.
    local_values = {}
    try:
        for line in (Path.cwd() / ".env").read_text(encoding="utf-8").splitlines():
            key, separator, value = line.strip().partition("=")
            if separator and key.strip() in {"GJC_CONFIG_DIR", "PI_CONFIG_DIR"}:
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                    value = value[1:-1]
                local_values[key.strip()] = value
    except (OSError, UnicodeError):
        pass
    for key in ("GJC_CONFIG_DIR", "PI_CONFIG_DIR"):
        raw = os.environ.get(key)
        value = (raw or "").strip()
        if value and local_values.get(key) != raw and ".." not in re.split(r"[/\\]", os.path.normpath(value)):
            return value
    return ".gjc"


def preflight_destination(root: Path, selected: list[str]) -> None:
    # Ignore OS aliases above the explicit HOME/cwd boundary (e.g. macOS /var),
    # but never follow a linked installation root or selected skill tree.
    boundary = root
    for scope in (Path.home(), Path.cwd()):
        if scope == root or scope in root.parents:
            boundary = scope
            break
    require_safe_path(root, boundary)
    for name in selected:
        if not re.fullmatch(r"[a-z0-9][a-z0-9._-]*", name):
            raise JeoSkillError(f"Unsafe skill name: {name}")
        require_safe_tree(root / name)


def verify_installed(root: Path, selected: list[str]) -> None:
    missing = [str(root / name / "SKILL.md") for name in selected if not (root / name / "SKILL.md").is_file()]
    if "jeo-skill" in selected:
        missing.extend(str(root / "jeo-skill/scripts" / filename) for filename in ("jeo-skill.py", "install_support.py")
                       if not (root / "jeo-skill/scripts" / filename).is_file())
    if missing:
        raise JeoSkillError("Installation verification failed; missing: " + ", ".join(missing))
    preflight_destination(root, selected)
    print(f"Verified {len(selected)} skill(s) at {root}")


def finish_install(args: argparse.Namespace, selected: list[str]) -> None:
    root = install_root(args)
    projection = projection_root(args)
    if root is None:
        print(f"Upstream installer completed for {args.agent}; destination verification unavailable for this runtime.")
        return
    verify_installed(root, selected)
    if projection:
        preflight_destination(projection, selected)
        for name in selected:
            copy_tree(root / name, projection / name)
        verify_installed(projection, selected)


def installer_prerequisite_errors() -> list[str]:
    errors = []
    if shutil.which("npx") is None:
        errors.append("npx is required to install skills")
    try:
        version = subprocess.run(["node", "--version"], capture_output=True,
                                 text=True, check=False, timeout=10)
    except (OSError, subprocess.TimeoutExpired) as error:
        errors.append(f"Cannot check Node.js 22.20+ prerequisite: {error}")
    else:
        match = re.fullmatch(r"v(\d+)\.(\d+)\.(\d+)\s*", version.stdout)
        if version.returncode or not match or tuple(map(int, match.groups())) < (22, 20, 0):
            errors.append(f"Node.js 22.20+ is required by {SKILLS_PACKAGE}")
    return errors


def command_install(args: argparse.Namespace, catalog: dict[str, Any]) -> None:
    selected = resolve_install_selection(args, catalog)
    root = install_root(args)
    projection = projection_root(args)
    for destination in (root, projection):
        if destination:
            preflight_destination(destination, selected)
            print(f"Destination: {destination}")
    if root is None:
        print(f"Unverified passthrough target: {args.agent}; npx validates runtime support during installation, not during dry-run.")
    command = install_command(args, selected)
    print(f"Selected {len(selected)} skill(s): {', '.join(selected)}")
    print("Command: " + shlex.join(command))
    if projection:
        print(f"Copy selected skills: {root} -> {projection}")
    if args.dry_run:
        return
    if len(selected) > 12 and not args.yes:
        raise JeoSkillError("Selection is larger than 12 skills. Review with --dry-run, then pass --yes.")
    errors = installer_prerequisite_errors()
    if errors:
        raise JeoSkillError("; ".join(errors))
    completed = subprocess.run(command, check=False)
    if completed.returncode:
        raise JeoSkillError(f"skills installer exited with {completed.returncode}")
    finish_install(args, selected)


def command_bootstrap(args: argparse.Namespace) -> None:
    shared = (Path.home() if args.global_install else Path.cwd()) / ".agents/skills"
    verify_installed(shared, ["jeo-skill"])
    if AGENT_ALIASES.get(args.agent, args.agent) == "universal":
        finish_install(args, ["jeo-skill"])
    else:
        command_install(args, {"skills": [{"name": "jeo-skill"}]})
    if not args.global_install:
        return
    source = shared / "jeo-skill/scripts/jeo-skill.py"
    result = subprocess.run([sys.executable, str(source), "link"], check=False)
    if result.returncode:
        raise JeoSkillError("Router installed, but CLI link failed")


def command_link(args: argparse.Namespace) -> None:
    source = Path(__file__).resolve()
    require_safe_path(BIN_PATH.parent, Path.home())
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


def command_doctor(_args: argparse.Namespace, catalog: dict[str, Any], source: str) -> bool:
    errors = installer_prerequisite_errors()
    report = {
        "ok": not errors,
        "catalog": source,
        "catalog_version": catalog.get("version"),
        "skills": len(catalog["skills"]),
        "categories": len(catalog["categories"]),
        "python": sys.version.split()[0],
        "npx": shutil.which("npx"),
        "linked": BIN_PATH.is_symlink() and BIN_PATH.resolve() == Path(__file__).resolve(),
        "errors": errors,
    }
    print_json(report)
    return not errors


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
    install.add_argument("-a", "--agent", default="universal")
    install.add_argument("--dry-run", action="store_true")
    install.add_argument("-y", "--yes", action="store_true")
    install.add_argument("--all", action="store_true")
    install.add_argument("--aside-home", default=str(Path.home() / ".aside"))
    install.add_argument("--aside-account")

    bootstrap = sub.add_parser("bootstrap", help="Finish a shared-router bootstrap")
    bootstrap.add_argument("--source", default=DEFAULT_SOURCE)
    bootstrap.add_argument("-g", "--global", dest="global_install", action="store_true")
    bootstrap.add_argument("-a", "--agent", default="universal")
    bootstrap.add_argument("--aside-home", default=str(Path.home() / ".aside"))
    bootstrap.add_argument("--aside-account")
    bootstrap.set_defaults(names=["jeo-skill"], all=False, bundle=None, category=None,
                           subcategory=None, interface=None, yes=True, dry_run=False)

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
        if args.command == "bootstrap":
            command_bootstrap(args)
            return 0
        source_catalog = Path(getattr(args, "source", "")).expanduser() / ".agent-skills/skills.json"
        configured_catalog = os.environ.get("JEO_SKILLS_CATALOG")
        if configured_catalog:
            catalog, source = load_catalog(cache=not getattr(args, "dry_run", False))
        elif args.command == "install" and source_catalog.is_file():
            catalog, source = read_json(source_catalog), str(source_catalog)
        elif args.command == "install" and args.all and args.source != DEFAULT_SOURCE:
            raise JeoSkillError("Custom-source --all requires a source-matched JEO_SKILLS_CATALOG or a local source .agent-skills/skills.json; the default catalog cannot establish every skill in that source.")
        else:
            catalog, source = load_catalog(cache=not getattr(args, "dry_run", False))
            if args.command == "install" and args.source != DEFAULT_SOURCE:
                print(f"Warning: selection uses catalog {source}, not a catalog verified for {args.source}; set JEO_SKILLS_CATALOG to a source-matched catalog if it differs.", file=sys.stderr)
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
            return 0 if command_doctor(args, catalog, source) else 1
        return 0
    except (JeoSkillError, ValueError, OSError) as error:
        print(f"jeo-skill: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
