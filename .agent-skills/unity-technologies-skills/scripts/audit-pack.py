#!/usr/bin/env python3
"""Read-only audit and install-plan helper for Unity-Technologies/skills."""
from __future__ import annotations

import re

PACK_ID = "unity-technologies-skills"
EXPECTED_REMOTE = "https://github.com/unity-technologies/skills"
LICENSE_MARKER = "Unity Companion License"
README_COUNT_MODE = "table"
README_COUNT_PATTERN = r""
RISK_PATTERNS = {
    "cloud_or_service_deployment": re.compile(r"(?i)\bdeploy(?:ment|s|ed|ing)?\b|cloud resource"),
    "credential_names": re.compile(r"(?i)(?:api[_ -]?key|client secret|service account|token|password)"),
    "editor_or_module_mutation": re.compile(r"(?i)unity (?:install|uninstall|install-modules|self-uninstall|upgrade)\b"),
    "live_csharp_or_editor_control": re.compile(r"(?i)unity command eval|arbitrary C#|\[CliCommand\]"),
    "monetization_or_ads": re.compile(r"(?i)\bIAP\b|LevelPlay|real-money|ad unit"),
    "pipe_to_shell_install": re.compile(r"(?i)curl[^\n]+\|[^\n]+bash|irm[^\n]+\|[^\n]+iex"),
}


import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from typing import Optional

NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
CODE_SUFFIXES = {".cs", ".hlsl", ".html", ".js", ".mjs", ".py", ".sh", ".ts"}
MAX_TEXT_BYTES = 2 * 1024 * 1024


def read_text(path: Path) -> str:
    data = path.read_bytes()
    if len(data) > MAX_TEXT_BYTES:
        data = data[:MAX_TEXT_BYTES]
    return data.decode("utf-8", errors="replace")


def git_read(root: Path, *args: str) -> Optional[str]:
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    try:
        result = subprocess.run(
            ["git", "-C", str(root), *args],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=5,
            env=env,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def safe_remote(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    value = value.strip()
    if value.startswith("git@github.com:"):
        path = value.split(":", 1)[1].split("?", 1)[0].split("#", 1)[0]
        return "https://github.com/" + path
    try:
        parts = urlsplit(value)
    except ValueError:
        return "unparseable"
    if not parts.scheme or not parts.netloc:
        return value.split("?", 1)[0].split("#", 1)[0]
    host = parts.hostname or ""
    if parts.port:
        host += f":{parts.port}"
    return urlunsplit((parts.scheme, host, parts.path, "", ""))


def canonical_remote(value: Optional[str]) -> Optional[str]:
    safe = safe_remote(value)
    if not safe:
        return None
    lowered = safe.lower().rstrip("/")
    if lowered.endswith(".git"):
        lowered = lowered[:-4]
    if lowered.startswith("git@github.com:"):
        lowered = "https://github.com/" + lowered.split(":", 1)[1]
    return lowered


def parse_frontmatter(skill_path: Path) -> dict[str, object]:
    text = read_text(skill_path)
    lines = text.splitlines()
    issues: list[str] = []
    if not lines or lines[0].strip() != "---":
        return {"name": None, "valid": False, "issues": ["missing_frontmatter"]}
    end = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), None)
    if end is None:
        return {"name": None, "valid": False, "issues": ["unterminated_frontmatter"]}
    front = lines[1:end]
    name = None
    description = None
    for index, line in enumerate(front):
        if re.match(r"^name\s*:", line):
            raw = line.split(":", 1)[1].strip()
            name = raw.strip('"\'')
        if re.match(r"^description\s*:", line):
            raw = line.split(":", 1)[1].strip()
            if raw in {">", ">-", ">+", "|", "|-", "|+"}:
                block: list[str] = []
                for following in front[index + 1 :]:
                    if following and not following[0].isspace():
                        break
                    if following.strip():
                        block.append(following.strip())
                description = " ".join(block)
            elif raw.startswith(('"', "'")):
                quote = raw[0]
                if len(raw) < 2 or not raw.endswith(quote):
                    issues.append("unterminated_description_quote")
                description = raw[1:-1] if len(raw) >= 2 else ""
            else:
                description = raw
                if ": " in raw:
                    issues.append("unquoted_colon_in_description")
    if not name:
        issues.append("missing_name")
    elif not NAME_RE.fullmatch(name):
        issues.append("invalid_name")
    if not description:
        issues.append("missing_description")
    directory = skill_path.parent.name
    if name and name != directory:
        issues.append("name_directory_mismatch")
    return {"name": name, "valid": not issues, "issues": sorted(set(issues))}


def skill_records(root: Path) -> list[dict[str, object]]:
    skills_root = root / "skills"
    if not skills_root.is_dir() or skills_root.is_symlink():
        return []
    records: list[dict[str, object]] = []
    for directory in sorted(skills_root.iterdir(), key=lambda p: p.name):
        if not directory.is_dir() or directory.is_symlink():
            continue
        skill_path = directory / "SKILL.md"
        if not skill_path.is_file() or skill_path.is_symlink():
            continue
        parsed = parse_frontmatter(skill_path)
        support_files = 0
        code_like_files = 0
        for item in directory.rglob("*"):
            if not item.is_file() or item.is_symlink() or item == skill_path:
                continue
            support_files += 1
            if item.suffix.lower() in CODE_SUFFIXES:
                code_like_files += 1
        records.append(
            {
                "directory": directory.name,
                "name": parsed["name"],
                "valid": parsed["valid"],
                "issues": parsed["issues"],
                "support_files": support_files,
                "code_like_files": code_like_files,
            }
        )
    return records


def declared_readme_count(root: Path) -> int | None:
    readme = root / "README.md"
    if not readme.is_file() or readme.is_symlink():
        return None
    text = read_text(readme)
    if README_COUNT_MODE == "table":
        return len(set(re.findall(r"^\| `([a-z0-9-]+)` \|", text, flags=re.MULTILINE)))
    match = re.search(README_COUNT_PATTERN, text)
    return int(match.group(1)) if match else None


def license_status(root: Path) -> tuple[Optional[str], bool]:
    for name in ("LICENSE", "LICENSE.md", "LICENSE.txt"):
        path = root / name
        if path.is_file() and not path.is_symlink():
            text = read_text(path)
            return name, LICENSE_MARKER in text
    return None, False


def risk_counts(root: Path) -> dict[str, int]:
    counts = {label: 0 for label in RISK_PATTERNS}
    for item in root.rglob("*"):
        if not item.is_file() or item.is_symlink() or ".git" in item.parts:
            continue
        try:
            text = read_text(item)
        except OSError:
            continue
        for label, pattern in RISK_PATTERNS.items():
            counts[label] += len(pattern.findall(text))
    return counts


def inspect_repo(root_value: str, expected_commit: Optional[str]) -> tuple[dict[str, object], int]:
    raw_root = Path(root_value).expanduser()
    if raw_root.is_symlink():
        return {"pack": PACK_ID, "status": "BLOCKED", "issues": ["repo_path_is_symlink"]}, 1
    root = raw_root.resolve()
    if not root.is_dir():
        return {"pack": PACK_ID, "status": "BLOCKED", "issues": ["repo_not_found"]}, 1

    records = skill_records(root)
    remote_raw = git_read(root, "config", "--get", "remote.origin.url")
    remote = safe_remote(remote_raw)
    commit = git_read(root, "rev-parse", "HEAD")
    license_file, license_ok = license_status(root)
    readme_count = declared_readme_count(root)
    symlink_entries = sum(
        1 for item in root.rglob("*") if ".git" not in item.parts and item.is_symlink()
    )
    invalid = [str(r["directory"]) for r in records if not r["valid"]]
    mismatches = [
        str(r["directory"])
        for r in records
        if "name_directory_mismatch" in r["issues"]
    ]
    issues: list[str] = []
    warnings: list[str] = []
    if not records:
        issues.append("no_skills_found")
    if not remote_raw:
        issues.append("origin_missing")
    elif canonical_remote(remote_raw) != EXPECTED_REMOTE:
        issues.append("unexpected_origin")
    if not commit:
        issues.append("commit_unavailable")
    if not license_ok:
        issues.append("license_marker_missing")
    if expected_commit and commit != expected_commit:
        issues.append("commit_mismatch")
    if symlink_entries:
        issues.append("symlink_entries_present")
    if invalid:
        warnings.append("invalid_frontmatter")
    if mismatches:
        warnings.append("name_directory_mismatch")
    if readme_count is not None and readme_count != len(records):
        warnings.append("readme_inventory_drift")
    status = "BLOCKED" if issues else ("WARN" if warnings else "PASS")
    report = {
        "pack": PACK_ID,
        "status": status,
        "commit": commit or "not_available",
        "origin": remote or "not_available",
        "license_file": license_file or "not_found",
        "license_marker_ok": license_ok,
        "skill_directories": len(records),
        "valid_frontmatter": len(records) - len(invalid),
        "invalid_frontmatter": invalid,
        "name_directory_mismatches": mismatches,
        "readme_declared_or_listed": readme_count,
        "support_files": sum(int(r["support_files"]) for r in records),
        "code_like_files": sum(int(r["code_like_files"]) for r in records),
        "symlink_entries": symlink_entries,
        "risk_signal_counts": risk_counts(root),
        "warnings": warnings,
        "issues": issues,
        "records": records,
    }
    return report, 1 if issues else 0


def render(report: dict[str, object], mode: str) -> None:
    if mode == "json":
        print(json.dumps(report, ensure_ascii=True, sort_keys=True, indent=2))
        return
    keys = [
        "pack",
        "status",
        "commit",
        "origin",
        "license_file",
        "license_marker_ok",
        "skill_directories",
        "valid_frontmatter",
        "invalid_frontmatter",
        "name_directory_mismatches",
        "readme_declared_or_listed",
        "support_files",
        "code_like_files",
        "symlink_entries",
        "warnings",
        "issues",
    ]
    for key in keys:
        if key in report:
            value = report[key]
            if isinstance(value, list):
                value = ",".join(str(item) for item in value) or "none"
            print(f"{key}={value}")
    if "risk_signal_counts" in report:
        for label, count in sorted(report["risk_signal_counts"].items()):
            print(f"risk.{label}={count}")
    if "selected" in report:
        print("selected=" + ",".join(report["selected"]))
        print("collisions=" + (",".join(report["collisions"]) or "none"))
        print("invalid_selected=" + (",".join(report["invalid_selected"]) or "none"))


def plan(report: dict[str, object], args: argparse.Namespace) -> tuple[dict[str, object], int]:
    if report.get("status") == "BLOCKED":
        return report, 1
    records = {str(r["directory"]): r for r in report["records"]}
    if args.all and args.skill:
        result = {"pack": PACK_ID, "status": "BLOCKED", "issues": ["all_and_skill_conflict"]}
        return result, 2
    selected = sorted(records) if args.all else sorted(set(args.skill or []))
    if not selected:
        result = {"pack": PACK_ID, "status": "BLOCKED", "issues": ["selection_required"]}
        return result, 2
    unknown = [name for name in selected if name not in records]
    if unknown:
        result = {"pack": PACK_ID, "status": "BLOCKED", "issues": ["unknown_skill"], "unknown": unknown}
        return result, 2

    raw_target = Path(args.target).expanduser()
    if raw_target.is_symlink():
        result = {"pack": PACK_ID, "status": "BLOCKED", "issues": ["target_path_is_symlink"]}
        return result, 2
    if raw_target.exists() and not raw_target.is_dir():
        result = {"pack": PACK_ID, "status": "BLOCKED", "issues": ["target_not_directory"]}
        return result, 2
    target = raw_target.resolve()
    collisions = [name for name in selected if (target / name).exists() or (target / name).is_symlink()]
    invalid_selected = [name for name in selected if not records[name]["valid"]]
    blocked = bool(collisions or invalid_selected)
    result = {
        "pack": PACK_ID,
        "status": "BLOCKED" if blocked else "READY",
        "selected": selected,
        "target_exists": target.exists(),
        "collisions": collisions,
        "invalid_selected": invalid_selected,
        "issues": (["existing_destination"] if collisions else [])
        + (["invalid_selected_frontmatter"] if invalid_selected else []),
    }
    return result, 2 if blocked else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=f"Read-only audit helper for {PACK_ID}")
    sub = parser.add_subparsers(dest="command", required=True)
    for command in ("doctor", "inventory"):
        item = sub.add_parser(command)
        item.add_argument("--repo", required=True)
        item.add_argument("--expect-commit")
        item.add_argument("--format", choices=("text", "json"), default="text")
    item = sub.add_parser("plan")
    item.add_argument("--repo", required=True)
    item.add_argument("--target", required=True)
    item.add_argument("--expect-commit")
    item.add_argument("--skill", action="append", default=[])
    item.add_argument("--all", action="store_true")
    item.add_argument("--format", choices=("text", "json"), default="text")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    report, code = inspect_repo(args.repo, args.expect_commit)
    if args.command == "inventory" and "records" in report:
        report = {
            "pack": report["pack"],
            "status": report["status"],
            "commit": report["commit"],
            "records": report["records"],
            "warnings": report["warnings"],
            "issues": report["issues"],
        }
    elif args.command == "doctor" and "records" in report:
        report = {key: value for key, value in report.items() if key != "records"}
    elif args.command == "plan":
        report, code = plan(report, args)
    render(report, args.format)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
