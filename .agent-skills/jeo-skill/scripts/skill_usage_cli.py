"""`jeo-skill` subcommands for skill usage tracking and unused-skill quarantine.

The router (`jeo-skill.py`) registers these parsers and dispatches here so the
tracking, quarantine and Jev-gate logic stays in `skill_usage`, `skill_quarantine`
and `skill_jev`. Previews never touch install roots or the quarantine store; only
`--apply` moves, restores or purges files.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Callable, Iterable

sys.dont_write_bytecode = True

import skill_jev
import skill_quarantine
import skill_usage

COMMANDS = ("usage", "prune-unused", "restore", "purge-quarantine")
# Commands that never read the catalog (keep/unkeep validate names against it).
NO_CATALOG_COMMANDS = ("restore", "purge-quarantine")

RootsFn = Callable[[bool], Iterable[Path]]


def read_only(args: argparse.Namespace) -> bool:
    """True for previews/reports that must not write anything, including the catalog cache."""
    if args.command == "prune-unused":
        return not args.apply
    return args.command == "usage" and args.usage_command == "report"


def add_parsers(sub: argparse._SubParsersAction) -> None:
    usage = sub.add_parser("usage", help="Track which installed skills agents actually invoke or load")
    actions = usage.add_subparsers(dest="usage_command", required=True)

    scan = actions.add_parser("scan", help="Aggregate invocation/load evidence from local runtime records")
    scan.add_argument("--json", action="store_true")

    report = actions.add_parser("report", help="Show used, protected, in-grace and candidate skills")
    report.add_argument("--status", choices=("used", "protected", "in-grace", "candidate"))
    report.add_argument("--json", action="store_true")

    keep = actions.add_parser("keep", help="Pin skills so they are never removal candidates")
    keep.add_argument("names", nargs="+")
    unkeep = actions.add_parser("unkeep", help="Remove keep pins")
    unkeep.add_argument("names", nargs="+")

    relevance = actions.add_parser("relevance", help="Protect unused skills Jev routes for your repositories")
    relevance.add_argument("--repos", nargs="+", required=True, help="Repository directories to summarize")
    relevance.add_argument("--jev-profile", required=True)
    relevance.add_argument("--allow-remote", action="store_true",
                           help="Required for any Jev call: approve sending bounded README/AGENTS.md summaries to the profile's backend")
    relevance.add_argument("--top-k", type=int, default=3)
    relevance.add_argument("--dry-run", action="store_true")
    relevance.add_argument("--json", action="store_true")

    prune = sub.add_parser("prune-unused", help="Quarantine never-used catalog skills (preview unless --apply)")
    prune.add_argument("-g", "--global", dest="global_install", action="store_true")
    prune.add_argument("--apply", action="store_true", help="Move candidates into the restorable quarantine")
    prune.add_argument("--jev-profile", help="Jev profile that reviews the removal proposal")
    prune.add_argument("--allow-remote", action="store_true",
                       help="Required with --jev-profile: approve sending the removal proposal to the profile's backend")
    prune.add_argument("--skip-jev-review", action="store_true", help="Apply without a Jev review (recorded)")
    prune.add_argument("--json", action="store_true")

    restore = sub.add_parser("restore", help="Restore quarantined skills (preview unless --apply)")
    target = restore.add_mutually_exclusive_group(required=True)
    target.add_argument("--list", action="store_true", help="List quarantine batches")
    target.add_argument("--batch")
    target.add_argument("--skill")
    restore.add_argument("--apply", action="store_true")
    restore.add_argument("--json", action="store_true")

    purge = sub.add_parser("purge-quarantine", help="Permanently delete old quarantine batches (preview unless --apply)")
    purge.add_argument("--older-than", type=int, required=True, metavar="DAYS")
    purge.add_argument("--apply", action="store_true")
    purge.add_argument("--json", action="store_true")


def tracked_roots(roots_fn: RootsFn, global_install: bool) -> list[Path]:
    roots = list(roots_fn(global_install))
    if global_install:
        # Antigravity IDE's global root is populated by the setup guide but is not a
        # retired-skill sweep root.
        roots.append(Path.home() / ".gemini" / "antigravity" / "skills")
    return roots


def _emit(data: Any) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2))


def _label_path(path: str) -> str:
    home = str(Path.home())
    return "~" + path[len(home):] if path == home or path.startswith(home + os.sep) else path


def _require_catalog_names(catalog: dict[str, Any], names: Iterable[str]) -> None:
    known = {item["name"] for item in catalog["skills"]}
    unknown = sorted(set(names) - known)
    if unknown:
        raise ValueError("unknown catalog skills: " + ", ".join(unknown))


def _scan(catalog: dict[str, Any], roots_fn: RootsFn) -> dict[str, Any]:
    # Usage evidence is account-wide; record installs from global and current-project roots.
    return skill_usage.scan(catalog, tracked_roots(roots_fn, True) + list(roots_fn(False)))


def command_usage(args: argparse.Namespace, catalog: dict[str, Any], roots_fn: RootsFn) -> int:
    action = args.usage_command
    if action == "scan":
        usage = _scan(catalog, roots_fn)
        report = skill_usage.build_report(catalog, usage)
        if args.json:
            _emit({"scanned_at": usage.get("scanned_at"), "sources": usage.get("sources", {}),
                   "summary": report["summary"]})
            return 0
        for source, info in sorted(usage.get("sources", {}).items()):
            window = info.get("window") or [None, None]
            state = "ok" if info.get("available") else "absent"
            if info.get("error") and info.get("error") != "store not found":
                state = f"error: {info['error']}"
            print(f"{source:<18} {state:<10} records={info.get('records', 0):<8} "
                  f"window={window[0] or '-'}..{window[1] or '-'}")
        print("summary: " + ", ".join(f"{key}={value}" for key, value in report["summary"].items()))
        return 0
    if action == "report":
        report = skill_usage.build_report(catalog)
        rows = [row for row in report["skills"] if not args.status or row["status"] == args.status]
        if args.json:
            _emit({**report, "skills": rows})
            return 0
        if report["tracking_started_at"] is None:
            print("Tracking has not started; run `jeo-skill usage scan` first. No skill is a candidate yet.")
        print(f"tracking_started_at={report['tracking_started_at']} grace_days={report['grace_days']}")
        print("summary: " + ", ".join(f"{key}={value}" for key, value in report["summary"].items()))
        for row in rows:
            detail = row["protected_reason"] or (f"grace ends {row['grace_ends_at']}" if row["status"] == "in-grace"
                                                 else f"last used {row['last_used_at']}" if row["count"] else "")
            print(f"{row['status']:<10} {row['count']:>6}  {row['name']:<40} {detail}")
        return 0
    if action in ("keep", "unkeep"):
        _require_catalog_names(catalog, args.names)
        policy = skill_usage.set_keep(args.names, action == "keep")
        print(f"keep pins: {', '.join(policy['keep']) or '(none)'}")
        return 0
    if action == "relevance":
        report = skill_usage.build_report(catalog)
        # relevance() replaces the whole protect map, so previously relevance-protected zero-use
        # skills are re-scored too; router/bundle/keep pins never depend on relevance.
        unused = [row["name"] for row in report["skills"]
                  if row["status"] in ("candidate", "in-grace")
                  or (row["status"] == "protected" and str(row["protected_reason"]).startswith("relevance:"))]
        if not unused:
            print("No unused skills to score.")
            return 0
        result = skill_jev.relevance(unused, catalog, [Path(repo) for repo in args.repos],
                                     profile=args.jev_profile, allow_remote=args.allow_remote,
                                     top_k=args.top_k, dry_run=args.dry_run)
        if args.json:
            _emit(result)
        else:
            protect = result.get("protect", {}) if isinstance(result, dict) else {}
            verb = "would score" if args.dry_run else "protected"
            print(f"relevance {verb}: {len(protect) if not args.dry_run else len(unused)} skill(s)")
            for name, info in sorted(protect.items()):
                print(f"  {name:<40} score={info.get('score')} repo={_label_path(str(info.get('repo')))}")
        return 0
    raise ValueError(f"unknown usage action {action!r}")


def command_prune_unused(args: argparse.Namespace, catalog: dict[str, Any], source: str, roots_fn: RootsFn) -> int:
    # Previews must change zero bytes, so they read the last scan. --apply rescans first so a
    # skill used or newly installed since that scan is never quarantined on stale evidence.
    usage = _scan(catalog, roots_fn) if args.apply else skill_usage.read_state("usage.json", None)
    if not isinstance(usage, dict) or not usage.get("scanned_at"):
        raise ValueError("no usage scan recorded; run `jeo-skill usage scan` first")
    if not args.apply:
        print(f"usage scanned_at={usage['scanned_at']} (run `jeo-skill usage scan` to refresh)", file=sys.stderr)
    report = skill_usage.build_report(catalog, usage)
    names = skill_usage.candidate_names(report)
    roots = tracked_roots(roots_fn, args.global_install)
    headings = skill_quarantine.reference_headings(catalog, source, names)
    plan = skill_quarantine.plan_quarantine(names, roots, headings)
    selected = [item for item in plan if item.get("action") == "would-quarantine"]
    reason = (f"zero invocation/load events since tracking began {report['tracking_started_at']} "
              f"and {report['grace_days']}-day grace elapsed")

    if not args.apply or not selected:
        preview = skill_quarantine.quarantine(plan, review={"status": "not-requested"}, apply=False, reason=reason)
        if args.json:
            _emit({"candidates": names, "summary": report["summary"], **preview})
            return 0
        print(f"candidates={len(names)} quarantinable copies={len(selected)} kept={len(preview['kept'])}")
        for item in selected:
            print(f"  would-quarantine {item['skill']:<36} {_label_path(item['path'])}")
        for item in preview["kept"]:
            print(f"  kept             {item['skill']:<36} {_label_path(item['path'])} ({item['reason']})")
        if args.apply:
            print("Nothing to quarantine.")
        else:
            print("Preview only; rerun with --apply and --jev-profile P (or --skip-jev-review) to quarantine.")
        return 0

    by_skill: dict[str, list[str]] = {}
    for item in selected:
        by_skill.setdefault(item["skill"], []).append(_label_path(item["path"]))
    rows = {row["name"]: row for row in report["skills"]}
    proposal = {
        "operation": "quarantine-unused-skills",
        "scope": "local-install",
        "skills": sorted(by_skill),
        "items": [{"skill": name, "roots": paths, "count": rows[name]["count"],
                   "grace_ends_at": rows[name]["grace_ends_at"]} for name, paths in sorted(by_skill.items())],
        "evidence": {
            "tracking_started_at": report["tracking_started_at"],
            "grace_days": report["grace_days"],
            "sources": {name: {"available": info.get("available"), "window": info.get("window")}
                        for name, info in report["sources"].items()},
        },
        "reversible": True,
    }
    review = skill_jev.review_gate(proposal, profile=args.jev_profile, allow_remote=args.allow_remote,
                                   skip=args.skip_jev_review)
    manifest = skill_quarantine.quarantine(plan, review=review, apply=True, reason=reason)
    errors = list(manifest.get("errors") or [])
    if manifest.get("error"):
        errors.insert(0, {"skill": "*", "path": "", "error": manifest["error"]})
    if args.json:
        _emit(manifest)
    else:
        moved = [item for item in manifest.get("items", []) if item.get("state") == "quarantined"]
        print(f"Quarantined {len(moved)} copy(ies) in batch {manifest.get('batch')} "
              f"(review: {review.get('status')}).")
        for problem in errors:
            print(f"  error {problem.get('skill', '')}: {_label_path(str(problem.get('path', '')))} "
                  f"{problem.get('error', '')}", file=sys.stderr)
        if moved or any(item.get("state") not in (None, "pending", "not-moved")
                        for item in manifest.get("items", [])):
            print(f"Restore with: jeo-skill restore --batch {manifest.get('batch')} --apply")
    return 1 if errors else 0


def command_restore(args: argparse.Namespace) -> int:
    if args.list:
        batches = skill_quarantine.list_batches()
        if args.json:
            _emit(batches)
        else:
            for batch in batches:
                items = batch.get("items", [])
                print(f"{batch.get('batch')}  {batch.get('created_at')}  items={len(items)}  "
                      f"review={batch.get('review', {}).get('status')}")
        return 0
    results = skill_quarantine.restore(batch=args.batch, skill=args.skill, apply=args.apply)
    if args.json:
        _emit(results)
    else:
        for item in results:
            print(f"{item.get('action', item.get('state', '?')):<16} {item.get('skill', ''):<36} "
                  f"{_label_path(str(item.get('original', item.get('path', ''))))} {item.get('reason', '')}")
        if not args.apply:
            print("Preview only; rerun with --apply to restore.")
    if not results:
        raise ValueError("no quarantined item matches the requested batch/skill")
    benign = {"already restored", "not-moved"}
    failed = [item for item in results if item.get("action") == "kept" and item.get("reason") not in benign]
    return 1 if failed and args.apply else 0


def command_purge(args: argparse.Namespace) -> int:
    results = skill_quarantine.purge(older_than_days=args.older_than, apply=args.apply)
    if args.json:
        _emit(results)
    else:
        for item in results:
            print(f"{item.get('action', '?'):<14} {item.get('batch', '')}  {item.get('created_at', '')}")
        if not args.apply:
            print("Preview only; rerun with --apply to delete permanently.")
    return 0


def run(args: argparse.Namespace, catalog: dict[str, Any] | None, source: str | None, roots_fn: RootsFn) -> int:
    try:
        if args.command == "restore":
            return command_restore(args)
        if args.command == "purge-quarantine":
            return command_purge(args)
        if catalog is None or source is None:
            raise ValueError(f"{args.command} requires a catalog")
        if args.command == "usage":
            return command_usage(args, catalog, roots_fn)
        if args.command == "prune-unused":
            return command_prune_unused(args, catalog, source, roots_fn)
    except skill_jev.JevGateError as error:
        print(f"jeo-skill: Jev review gate refused: {error}", file=sys.stderr)
        return 2
    raise ValueError(f"unknown command {args.command!r}")
