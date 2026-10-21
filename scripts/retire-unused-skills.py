#!/usr/bin/env python3
"""Propose and, with explicit approval, retire unused catalog skills.

The default mode is read-only.  ``--apply`` requires a comma-separated
``--approve`` list containing only candidate names from the supplied usage
report.  Mutating mode backs up the manifest, candidate directories, and
manifest-derived projections; a generator or validator failure restores all
of them byte-for-byte.
"""

from __future__ import annotations

import argparse
import copy
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / ".agent-skills/jeo-skill/scripts"))
from skill_usage import PROTECTED_BUNDLES, ROUTER_SKILL  # type: ignore  # noqa: E402
PROJECTION_FILES = (
    Path(".agent-skills/skills.json"),
    Path(".agent-skills/skills.toon"),
    Path("README.md"),
    Path("README.ko.md"),
    Path("README.es-ES.md"),
)


class RetirementError(RuntimeError):
    """Raised when a retirement cannot be proven safe."""


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RetirementError(f"cannot read JSON: {path}: {error}") from error
    if not isinstance(value, dict):
        raise RetirementError(f"JSON root must be an object: {path}")
    return value


def load_manifest(repo_root: Path) -> dict[str, Any]:
    """Load the catalog manifest below ``repo_root``."""
    return _read_json(repo_root / ".agent-skills" / "skills.json")


def load_usage_report(path: Path) -> dict[str, Any]:
    """Load a build_report-shaped usage report."""
    return _read_json(path)


def _skills_by_name(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    skills = manifest.get("skills")
    if not isinstance(skills, list):
        raise RetirementError("manifest.skills must be a list")
    result: dict[str, dict[str, Any]] = {}
    for entry in skills:
        if isinstance(entry, dict) and isinstance(entry.get("name"), str):
            result[entry["name"]] = entry
    return result
def _usage_rows(report: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Validate and index the list-shaped ``build_report()['skills']`` rows."""
    rows = report.get("skills")
    if not isinstance(rows, list):
        raise RetirementError("usage report skills must be a list of rows")
    indexed: dict[str, dict[str, Any]] = {}
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict) or not isinstance(row.get("name"), str) or not row["name"]:
            raise RetirementError(f"usage report skills[{index}] must have a non-empty name")
        name = row["name"]
        if name in indexed:
            raise RetirementError(f"usage report contains duplicate skill row: {name}")
        indexed[name] = row
    return indexed
def _safe_skill_name(name: str) -> bool:
    """Catalog names are single path segments, never traversal paths."""
    return bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", name))


def protected_reasons(manifest: dict[str, Any]) -> dict[str, str]:
    """Return protection reasons that are independent of usage-report claims."""
    reasons: dict[str, str] = {ROUTER_SKILL: "router"}
    bundles = manifest.get("bundles", {})
    if isinstance(bundles, dict):
        for bundle in PROTECTED_BUNDLES:
            members = bundles.get(bundle, [])
            if isinstance(members, list):
                for name in members:
                    if isinstance(name, str):
                        reasons.setdefault(name, f"bundle:{bundle}")
    return reasons


def _head_commit(repo_root: Path) -> str:
    try:
        completed = subprocess.run(
            ["git", "-C", str(repo_root), "rev-parse", "--verify", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return "unavailable"
    commit = completed.stdout.strip()
    return commit or "unavailable"


def _source_window(report: dict[str, Any]) -> tuple[int, str]:
    sources = report.get("sources")
    source_count = len(sources) if isinstance(sources, dict) else 0
    start = report.get("tracking_started_at") or "unknown"
    end = report.get("generated_at") or "unknown"
    return source_count, f"{start}..{end}"


def _reason(report: dict[str, Any]) -> str:
    source_count, window = _source_window(report)
    grace = report.get("grace_days", 30)
    return (
        f"zero observed invocations across {source_count} sources over {window}; "
        f"{grace}-day grace elapsed"
    )


# One pass per reference form over each SKILL.md (forms are scanned independently so a
# backtick span cannot swallow a following link): a backtick span (the lookahead leaves
# the closing backtick free to open the next span), a `skill://name` URI, or a Markdown
# link to `[../|.agent-skills/]name/SKILL.md`. Captured text equal to a name is a reference.
_REFERENCES = (
    re.compile(r"`([^`]+)(?=`)"),
    re.compile(r"skill://([A-Za-z0-9_-]+)"),
    re.compile(r"\]\(\s*(?:\.\./|\.agent-skills/)?([^/()\s]+)/SKILL\.md(?:[#?][^)]*)?\s*\)"),
)


def _reference_index(repo_root: Path) -> dict[str, set[str]]:
    """Map each referenced name to the catalog skills whose SKILL.md references it."""
    root = repo_root / ".agent-skills"
    index: dict[str, set[str]] = {}
    if not root.is_dir():
        return index
    for skill_md in sorted(root.glob("*/SKILL.md")):
        try:
            text = skill_md.read_text(encoding="utf-8")
        except OSError as error:
            raise RetirementError(f"cannot inspect catalog reference file: {skill_md}") from error
        for pattern in _REFERENCES:
            for referenced in pattern.findall(text):
                index.setdefault(referenced, set()).add(skill_md.parent.name)
    return index


def find_live_references(
    repo_root: Path, name: str, index: dict[str, set[str]] | None = None
) -> list[dict[str, str]]:
    """Find references to ``name`` in other catalog SKILL.md files."""
    referencing = (_reference_index(repo_root) if index is None else index).get(name, set())
    return [{"skill": skill, "path": Path(".agent-skills", skill, "SKILL.md").as_posix()}
            for skill in sorted(referencing - {name})]


def _groups_for(manifest: dict[str, Any], name: str) -> list[tuple[str, dict[str, Any]]]:
    groups = manifest.get("relationship_groups", {})
    if not isinstance(groups, dict):
        return []
    found: list[tuple[str, dict[str, Any]]] = []
    for group_name, group in groups.items():
        if not isinstance(group_name, str) or not isinstance(group, dict):
            continue
        members = group.get("members")
        if isinstance(members, list) and name in members:
            found.append((group_name, group))
    return found


def _replacement(
    manifest: dict[str, Any],
    name: str,
    head_commit: str,
    *,
    skills: dict[str, dict[str, Any]],
    report_skills: dict[str, dict[str, Any]],
) -> tuple[str, str, list[str]]:
    groups: list[str] = []
    siblings: list[str] = []
    for group_name, group in _groups_for(manifest, name):
        groups.append(group_name)
        members = group.get("members", [])
        if isinstance(members, list):
            siblings.extend(
                member for member in members if isinstance(member, str) and member != name and member in skills
            )
    if siblings:
        def usage_count(sibling: str) -> int:
            data = report_skills.get(sibling, {})
            return int(data.get("count", 0)) if isinstance(data, dict) else 0

        replacement = sorted(set(siblings), key=lambda item: (-usage_count(item), item))[0]
        return replacement, "skill", sorted(set(groups))
    return f"restore from git history at current HEAD commit {head_commit}", "workflow", sorted(set(groups))


def build_proposals(repo_root: Path, manifest: dict[str, Any], report: dict[str, Any]) -> list[dict[str, Any]]:
    """Build deterministic proposal packets for eligible usage-report candidates."""
    skills = _skills_by_name(manifest)
    report_skills = _usage_rows(report)
    protected = protected_reasons(manifest)
    reason = _reason(report)
    head_commit = _head_commit(repo_root)
    reference_index = _reference_index(repo_root)
    bundles = manifest.get("bundles", {})
    if not isinstance(bundles, dict):
        bundles = {}
    proposals: list[dict[str, Any]] = []
    for name in sorted(report_skills):
        usage = report_skills[name]
        if not isinstance(usage, dict) or usage.get("status") != "candidate" or name not in skills:
            continue
        if name in protected:
            continue
        entry = skills[name]
        replacement, replacement_type, relationship_groups = _replacement(
            manifest,
            name,
            head_commit,
            skills=skills,
            report_skills=report_skills,
        )
        bundle_names = sorted(
            bundle for bundle, members in bundles.items() if isinstance(members, list) and name in members
        )
        references = find_live_references(repo_root, name, reference_index)
        retirement = {
            "replacement": replacement,
            "replacement_type": replacement_type,
            "reason": reason,
        }
        proposals.append(
            {
                "name": name,
                "category": entry.get("category"),
                "subcategory": entry.get("subcategory"),
                "bundles": bundle_names,
                "relationship_groups": relationship_groups,
                "live_references": references,
                "proposed_retirement": retirement,
            }
        )
    return proposals


def _approved_names(raw: str | None) -> list[str]:
    if raw is None:
        return []
    values = [item.strip() for item in raw.split(",") if item.strip()]
    return sorted(set(values))


def _validate_apply_safety(
    manifest: dict[str, Any], proposals: list[dict[str, Any]], approved: list[str]
) -> None:
    by_name = {item["name"]: item for item in proposals}
    missing = sorted(set(approved) - set(by_name))
    if missing:
        raise RetirementError("--approve contains non-eligible candidate(s): " + ", ".join(missing))
    approved_set = set(approved)
    skills = _skills_by_name(manifest)
    for name in approved:
        if not _safe_skill_name(name):
            raise RetirementError(f"cannot retire unsafe skill name: {name!r}")
        if skills[name].get("path") != f"{name}/SKILL.md":
            raise RetirementError(f"manifest path for {name!r} is not catalog-shaped")
    for name in approved:
        item = by_name[name]
        if item["live_references"]:
            paths = ", ".join(ref["path"] for ref in item["live_references"])
            raise RetirementError(f"cannot retire {name!r}; live references found: {paths}")
        retirement = item["proposed_retirement"]
        if retirement.get("replacement_type") == "skill" and retirement.get("replacement") in approved_set:
            raise RetirementError(
                f"cannot retire approved batch; replacement for {name!r} is also approved: {retirement['replacement']!r}"
            )
    bundles = manifest.get("bundles", {})
    if isinstance(bundles, dict):
        for bundle, members in bundles.items():
            if not isinstance(members, list):
                continue
            remaining = [member for member in members if member not in approved_set]
            emptied = [name for name in approved if name in members] and not remaining
            if emptied:
                raise RetirementError(f"cannot retire approved skills; bundle {bundle!r} would be empty")


def _remove_from_manifest(manifest: dict[str, Any], approved: set[str]) -> list[str]:
    manifest["skills"] = [entry for entry in manifest.get("skills", []) if entry.get("name") not in approved]
    manifest["skill_count"] = len(manifest["skills"])
    for key in ("categories", "subcategories", "bundles"):
        value = manifest.get(key)
        if not isinstance(value, dict):
            continue
        for parent, members in list(value.items()):
            if key == "subcategories" and isinstance(members, dict):
                for subcategory, names in members.items():
                    if isinstance(names, list):
                        members[subcategory] = [name for name in names if name not in approved]
            elif isinstance(members, list):
                value[parent] = [name for name in members if name not in approved]
    dropped_groups: list[str] = []
    groups = manifest.get("relationship_groups")
    if isinstance(groups, dict):
        for group_name in list(groups):
            group = groups[group_name]
            if not isinstance(group, dict):
                continue
            members = group.get("members")
            if isinstance(members, list):
                remaining = [name for name in members if name not in approved]
                if len(remaining) < 2:
                    dropped_groups.append(group_name)
                    del groups[group_name]
                else:
                    group["members"] = remaining
    return sorted(dropped_groups)


def _atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    payload = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    temporary = path.with_name(path.name + ".retire-tmp")
    try:
        temporary.write_bytes(payload)
        shutil.copymode(path, temporary)
        temporary.replace(path)
    finally:
        if temporary.exists():
            temporary.unlink()


def _run_projection(repo_root: Path, script: str, *extra: str) -> subprocess.CompletedProcess[str]:
    path = repo_root / "scripts" / script
    return subprocess.run(
        [sys.executable, str(path), "--repo-root", str(repo_root), *extra],
        cwd=repo_root,
        capture_output=True,
        text=True,
        timeout=120,
    )


def _review_evidence(report: dict[str, Any], approved: list[str]) -> dict[str, Any]:
    tracking = report.get("tracking_started_at")
    if not isinstance(tracking, str) and tracking is not None:
        tracking = None
    grace_days = report.get("grace_days", 30)
    if not isinstance(grace_days, int) or isinstance(grace_days, bool):
        grace_days = 30
    source_data = report.get("sources")
    sources: dict[str, dict[str, Any]] = {}
    if isinstance(source_data, dict):
        for source_name in sorted(source_data):
            if not isinstance(source_name, str):
                continue
            info = source_data[source_name]
            info = info if isinstance(info, dict) else {}
            available = info.get("available")
            records = info.get("records")
            window = info.get("window")
            if not isinstance(available, bool):
                available = False
            if not isinstance(records, int) or isinstance(records, bool):
                records = 0
            if not isinstance(window, (list, tuple)) or len(window) != 2:
                window = [None, None]
            else:
                window = [item if isinstance(item, str) or item is None else None for item in window]
            sources[source_name] = {
                "available": available,
                "records": records,
                "window": window,
            }
    rows = _usage_rows(report)
    skills: list[dict[str, Any]] = []
    for name in approved:
        row = rows.get(name, {})
        count = row.get("count") if isinstance(row, dict) else 0
        if not isinstance(count, int) or isinstance(count, bool):
            count = 0
        last_used_at = row.get("last_used_at") if isinstance(row, dict) else None
        grace_ends_at = row.get("grace_ends_at") if isinstance(row, dict) else None
        skills.append(
            {
                "name": name,
                "count": count,
                "last_used_at": last_used_at if isinstance(last_used_at, str) or last_used_at is None else None,
                "grace_ends_at": grace_ends_at if isinstance(grace_ends_at, str) or grace_ends_at is None else None,
            }
        )
    return {
        "tracking_started_at": tracking,
        "grace_days": grace_days,
        "sources": sources,
        "skills": skills,
    }


def apply_retirements(
    repo_root: Path,
    manifest: dict[str, Any],
    proposals: list[dict[str, Any]],
    approved: list[str],
    *,
    report: dict[str, Any],
    jev_profile: str | None,
    allow_remote: bool,
    skip_jev_review: bool,
) -> dict[str, Any]:
    """Review and apply approved retirements, rolling back on projection failure."""
    _validate_apply_safety(manifest, proposals, approved)
    by_name = {item["name"]: item for item in proposals}

    jev_scripts = repo_root / ".agent-skills" / "jeo-skill" / "scripts"
    try:
        if not jev_scripts.is_dir():
            raise ImportError("Jev script directory is missing")
        sys.path.insert(0, str(jev_scripts))
        from skill_jev import review_gate
    except ImportError as error:
        raise RetirementError("skill_jev.review_gate is unavailable") from error

    review_payload = {
        "skills": approved,
        "scope": "catalog",
        "evidence": _review_evidence(report, approved),
    }
    try:
        review = review_gate(
            review_payload,
            profile=jev_profile,
            allow_remote=allow_remote,
            skip=skip_jev_review,
        )
    except Exception as error:
        raise RetirementError(f"Jev review failed: {error}") from error
    reviews = [dict(review) for _ in approved]

    manifest_path = repo_root / ".agent-skills" / "skills.json"
    temporary_root = Path(tempfile.mkdtemp(prefix="jeo-skill-retire-"))
    projection_backups: dict[Path, Path] = {}
    skills_backup_root = Path(tempfile.mkdtemp(prefix="skills-", dir=temporary_root))
    projection_backup_root = Path(tempfile.mkdtemp(prefix="projections-", dir=temporary_root))
    dir_backups: dict[str, Path] = {}
    cleanup_backup = True
    try:
        for index, relative in enumerate(PROJECTION_FILES):
            path = repo_root / relative
            if not path.is_file():
                raise RetirementError(f"required projection is missing: {relative}")
            backup_file = projection_backup_root / f"{index:02d}-{path.name}"
            shutil.copy2(path, backup_file)
            projection_backups[path] = backup_file
        for name in approved:
            skill_dir = repo_root / ".agent-skills" / name
            if skill_dir.is_symlink() or not skill_dir.is_dir() or not (skill_dir / "SKILL.md").is_file():
                raise RetirementError(f"catalog skill directory is not a safe removable copy: {skill_dir}")
            try:
                if skill_dir.resolve().parent != (repo_root / ".agent-skills").resolve():
                    raise RetirementError(f"catalog skill path escapes manifest root: {skill_dir}")
            except OSError as error:
                raise RetirementError(f"cannot resolve catalog skill path: {skill_dir}") from error
            backup_dir = skills_backup_root / name
            shutil.copytree(skill_dir, backup_dir, symlinks=True)
            dir_backups[name] = backup_dir

        updated = copy.deepcopy(manifest)
        dropped_groups = _remove_from_manifest(updated, set(approved))
        retired = updated.setdefault("retired_skills", {})
        if not isinstance(retired, dict):
            raise RetirementError("manifest.retired_skills must be an object")
        for name, review in zip(approved, reviews):
            retirement = copy.deepcopy(by_name[name]["proposed_retirement"])
            retirement["review"] = review
            retired[name] = retirement
        _atomic_write_json(manifest_path, updated)
        for name in approved:
            shutil.rmtree(repo_root / ".agent-skills" / name)

        generated = _run_projection(repo_root, "generate-catalog-projections.py")
        if generated.returncode != 0:
            raise RetirementError(f"projection generation failed (exit {generated.returncode})")
        validated = _run_projection(repo_root, "validate-catalog-projections.py")
        if validated.returncode != 0:
            raise RetirementError(f"catalog validation failed (exit {validated.returncode})")
        return {
            "retired": approved,
            "dropped_relationship_groups": dropped_groups,
            "reviews": reviews,
            "validated": True,
        }
    except BaseException as original_error:
        restore_errors: list[str] = []
        for path, backup_file in projection_backups.items():
            try:
                shutil.copy2(backup_file, path)
            except BaseException as error:
                restore_errors.append(f"{path}: {error}")
        for name, backup_dir in dir_backups.items():
            destination = repo_root / ".agent-skills" / name
            try:
                if destination.exists() or destination.is_symlink():
                    if destination.is_dir() and not destination.is_symlink():
                        shutil.rmtree(destination)
                    else:
                        destination.unlink()
                shutil.copytree(backup_dir, destination, symlinks=True)
            except BaseException as error:
                restore_errors.append(f"{destination}: {error}")
        if restore_errors:
            cleanup_backup = False
            details = "; ".join(restore_errors)
            raise RetirementError(
                f"rollback incomplete; backup retained at {temporary_root}: {details}"
            ) from original_error
        raise
    finally:
        if cleanup_backup:
            shutil.rmtree(temporary_root, ignore_errors=True)


def _print_readable(proposals: list[dict[str, Any]]) -> None:
    if not proposals:
        print("No eligible candidate skills.")
        return
    for item in proposals:
        retirement = item["proposed_retirement"]
        references = ", ".join(ref["path"] for ref in item["live_references"]) or "none"
        bundles = ", ".join(item["bundles"]) or "none"
        groups = ", ".join(item["relationship_groups"]) or "none"
        print(f"{item['name']} ({item['category']}/{item['subcategory']})")
        print(f"  bundles: {bundles}")
        print(f"  relationship groups: {groups}")
        print(f"  live references: {references}")
        print(
            f"  retirement: {retirement['replacement_type']} -> {retirement['replacement']} "
            f"({retirement['reason']})"
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--usage-report", required=True, type=Path)
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--approve", help="comma-separated candidate names for --apply")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--jev-profile")
    parser.add_argument("--allow-remote", action="store_true",
                        help="Required with --jev-profile: approve sending the proposal to the profile's Jev backend")
    parser.add_argument("--skip-jev-review", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    repo_root = args.repo_root.resolve()
    try:
        manifest = load_manifest(repo_root)
        report = load_usage_report(args.usage_report.resolve())
        proposals = build_proposals(repo_root, manifest, report)
        if not args.apply:
            payload = {"repo_root": str(repo_root), "proposals": proposals, "dry_run": True}
            if args.json:
                print(json.dumps(payload, ensure_ascii=False, indent=2))
            else:
                _print_readable(proposals)
            return 0
        approved = _approved_names(args.approve)
        if not approved:
            raise RetirementError("--apply requires --approve name,...")
        result = apply_retirements(
            repo_root,
            manifest,
            proposals,
            approved,
            report=report,
            jev_profile=args.jev_profile,
            allow_remote=args.allow_remote,
            skip_jev_review=args.skip_jev_review,
        )
        payload = {"repo_root": str(repo_root), "dry_run": False, **result}
        if args.json:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            print("Retirement review records:")
            for review in result["reviews"]:
                print("  " + json.dumps(review, ensure_ascii=False, sort_keys=True))
            print("Retired: " + ", ".join(result["retired"]))
            if result["dropped_relationship_groups"]:
                print("Dropped relationship groups: " + ", ".join(result["dropped_relationship_groups"]))
        return 0
    except RetirementError as error:
        print(f"retirement refused: {error}", file=sys.stderr)
        return 2
    except (OSError, subprocess.SubprocessError) as error:
        print(f"retirement failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
