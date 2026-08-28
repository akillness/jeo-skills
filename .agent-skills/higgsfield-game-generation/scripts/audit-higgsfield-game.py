#!/usr/bin/env python3
"""Read-only auditor for the Higgsfield browser-game skill owner.

Python 3.9+, standard library only. The normal audit reads files and may run
read-only `git rev-parse`. It never installs, authenticates, creates, generates,
deploys, publishes, or modifies the audited checkout.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

EXACT_SKILL = Path("higgsfield-game-generation/SKILL.md")
WEBSITE_SKILL = Path("higgsfield-websites/SKILL.md")
GAME_FLOW = Path("higgsfield-websites/references/game-flow.md")
INSTALL_DOC = Path("INSTALL.md")
EXACT_NAME = "higgsfield-game-generation"
GAME_MARKERS = ("--type game", "website create")


def read_text(path: Path) -> Tuple[Optional[str], Optional[str]]:
    try:
        return path.read_text(encoding="utf-8"), None
    except FileNotFoundError:
        return None, None
    except (OSError, UnicodeError) as exc:
        return None, str(exc)


def git_commit(repo: Path) -> Tuple[Optional[str], Optional[str]]:
    try:
        proc = subprocess.run(
            ["git", "-C", str(repo), "rev-parse", "HEAD"],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return None, str(exc)
    if proc.returncode != 0:
        message = proc.stderr.strip() or "git rev-parse failed"
        return None, message
    value = proc.stdout.strip()
    return (value or None), None


def decide_owner(record: Dict[str, Any]) -> Tuple[str, List[str], List[str]]:
    evidence: List[str] = []
    warnings: List[str] = []

    if record.get("exact_skill_present"):
        evidence.append("exact higgsfield-game-generation/SKILL.md exists")
        if record.get("website_game_markers_present"):
            warnings.append("both the exact skill and higgsfield-websites advertise game ownership; compare their current instructions")
        return "higgsfield-game-generation", evidence, warnings

    if (
        record.get("website_skill_present")
        and record.get("game_flow_present")
        and record.get("website_game_markers_present")
    ):
        evidence.extend(
            [
                "exact higgsfield-game-generation/SKILL.md is absent",
                "higgsfield-websites/SKILL.md contains the game command markers",
                "higgsfield-websites/references/game-flow.md exists",
            ]
        )
        if record.get("install_claims_exact_skill"):
            warnings.append("INSTALL.md names higgsfield-game-generation although the exact skill folder is absent")
        return "higgsfield-websites", evidence, warnings

    if record.get("install_claims_exact_skill"):
        warnings.append("INSTALL.md names higgsfield-game-generation, but no checked-in owner was resolved")
    return "unresolved", evidence, warnings


def audit(repo: Path, expected_commit: Optional[str]) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "repo": str(repo),
        "valid": False,
        "decision": "unresolved",
        "commit": None,
        "expected_commit": expected_commit,
        "pin_matches": None,
        "root_skill_count": 0,
        "checks": {},
        "evidence": [],
        "warnings": [],
        "errors": [],
    }

    if not repo.exists():
        result["errors"].append("repository path does not exist")
        return result
    if not repo.is_dir():
        result["errors"].append("repository path is not a directory")
        return result

    commit, commit_error = git_commit(repo)
    result["commit"] = commit
    if commit_error:
        result["warnings"].append("could not resolve Git commit: " + commit_error)
    if expected_commit is not None:
        result["pin_matches"] = commit == expected_commit
        if commit != expected_commit:
            result["errors"].append("checked-out commit does not match --expect-commit")

    exact_text, exact_error = read_text(repo / EXACT_SKILL)
    website_text, website_error = read_text(repo / WEBSITE_SKILL)
    flow_text, flow_error = read_text(repo / GAME_FLOW)
    install_text, install_error = read_text(repo / INSTALL_DOC)
    for label, error in (
        (str(EXACT_SKILL), exact_error),
        (str(WEBSITE_SKILL), website_error),
        (str(GAME_FLOW), flow_error),
        (str(INSTALL_DOC), install_error),
    ):
        if error:
            result["errors"].append("could not read %s: %s" % (label, error))

    website_lower = (website_text or "").lower()
    record: Dict[str, Any] = {
        "exact_skill_present": exact_text is not None,
        "website_skill_present": website_text is not None,
        "game_flow_present": flow_text is not None,
        "website_game_markers_present": all(marker in website_lower for marker in GAME_MARKERS),
        "install_claims_exact_skill": EXACT_NAME in (install_text or ""),
    }
    result["checks"] = record

    try:
        result["root_skill_count"] = sum(1 for path in repo.glob("*/SKILL.md") if path.is_file())
    except OSError as exc:
        result["warnings"].append("could not count root skill folders: " + str(exc))

    decision, evidence, warnings = decide_owner(record)
    result["decision"] = decision
    result["evidence"] = evidence
    result["warnings"].extend(warnings)
    result["valid"] = decision != "unresolved" and not result["errors"]
    return result


def run_self_test() -> int:
    cases = [
        (
            "exact owner wins",
            {
                "exact_skill_present": True,
                "website_skill_present": True,
                "game_flow_present": True,
                "website_game_markers_present": True,
                "install_claims_exact_skill": True,
            },
            "higgsfield-game-generation",
        ),
        (
            "website owner resolves documented drift",
            {
                "exact_skill_present": False,
                "website_skill_present": True,
                "game_flow_present": True,
                "website_game_markers_present": True,
                "install_claims_exact_skill": True,
            },
            "higgsfield-websites",
        ),
        (
            "prose alone is unresolved",
            {
                "exact_skill_present": False,
                "website_skill_present": False,
                "game_flow_present": False,
                "website_game_markers_present": False,
                "install_claims_exact_skill": True,
            },
            "unresolved",
        ),
    ]
    failed = 0
    for name, record, expected in cases:
        actual, _, _ = decide_owner(record)
        ok = actual == expected
        print(("PASS" if ok else "FAIL") + ": " + name)
        if not ok:
            failed += 1
    return 1 if failed else 0


def print_text(result: Dict[str, Any]) -> None:
    print("Higgsfield game owner audit")
    print("repo: %s" % result["repo"])
    print("commit: %s" % (result["commit"] or "unresolved"))
    print("decision: %s" % result["decision"])
    print("valid: %s" % str(result["valid"]).lower())
    print("root skill count: %s" % result["root_skill_count"])
    for item in result["evidence"]:
        print("evidence: " + item)
    for item in result["warnings"]:
        print("warning: " + item)
    for item in result["errors"]:
        print("error: " + item)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, help="Path to a checked-out higgsfield-ai/skills repository")
    parser.add_argument("--expect-commit", help="Require the checkout to match this commit")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        return run_self_test()
    if args.repo is None:
        parser.error("--repo is required unless --self-test is used")

    result = audit(args.repo.expanduser().resolve(), args.expect_commit)
    if args.format == "json":
        print(json.dumps(result, indent=2, sort_keys=True, ensure_ascii=False))
    else:
        print_text(result)
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    sys.exit(main())
