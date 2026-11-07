#!/usr/bin/env python3
"""Reconcile host skill roots with the shared root via per-skill symlinks.

Policy (matches the 2026-11 host symlink conversion):

- The shared install root is ``~/.agents/skills`` (respects
  ``JEO_SKILLS_SHARED_ROOT``). Every catalog skill installed there should be
  visible to enabled hosts through a per-skill symlink, never a copy.
- Host entry for a catalog skill:
    * missing            -> create symlink to the shared root
    * symlink (healthy)  -> leave untouched
    * symlink (dangling) -> remove (it points into the shared root or stale path)
    * real dir/file      -> host-local legacy copy; replace only when
                            ``--replace-copies`` is given (quarantined first)
- Non-catalog entries (anything whose name is not in the catalog) are always
  preserved. The shared root itself is never mutated by this script.
- A host root that is itself a symlink to the shared root is skipped with a
  warning (re-running copy-based installers on such a root is dangerous).

Usage:
  python3 refresh-host-links.py            # dry-run plan
  python3 refresh-host-links.py --apply    # reconcile for real
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True

SHARED_ROOT_ENV = "JEO_SKILLS_SHARED_ROOT"
CATALOG_JSON_ENV = "JEO_SKILLS_CATALOG_JSON"

DEFAULT_HOSTS: dict[str, Path] = {
    "claude": Path("~/.claude/skills"),
    "pi": Path("~/.pi/agent/skills"),
    "gjc": Path("~/.gjc/agent/skills"),
    "antigravity": Path("~/.gemini/antigravity-cli/skills"),
    "cursor": Path("~/.cursor/skills"),
    "aside-user": Path("~/.aside/u/0/skills/user"),
    "opencode-config": Path("~/.config/opencode/skills"),
}

SUPPORTED_HOSTS = dict(DEFAULT_HOSTS)


def shared_root() -> Path:
    configured = os.environ.get(SHARED_ROOT_ENV)
    if configured:
        return Path(configured).expanduser().absolute()
    return (Path.home() / ".agents" / "skills").absolute()


def catalog_names() -> set[str]:
    here = Path(__file__).resolve().parent
    configured = os.environ.get(CATALOG_JSON_ENV)
    path = Path(configured).expanduser() if configured else here.parent / ".agent-skills" / "skills.json"
    with path.open(encoding="utf-8") as fh:
        data = json.load(fh)
    skills = data["skills"] if isinstance(data, dict) and "skills" in data else data
    if isinstance(skills, dict):
        return set(skills.keys())
    names: set[str] = set()
    for item in skills:
        if isinstance(item, dict):
            names.add(item["name"])
        else:
            names.add(str(item))
    return names


def is_inside_shared(candidate: Path, shared: Path) -> bool:
    try:
        candidate.absolute().relative_to(shared)
        return True
    except ValueError:
        return False


def _host_is_symlinked_or_missing(root: Path, shared: Path) -> str | None:
    """Return a skip action name when the host root must not be touched."""
    real_root = str(os.path.realpath(root))
    if real_root == str(shared):
        return "skip-symlinked-root"
    if os.path.islink(root):
        return "skip-symlinked-root"
    if not root.is_dir():
        return "skip-missing-root"
    return None


def plan_host(host: str, root: Path, shared: Path, catalog: set[str], replace_copies: bool) -> list[dict]:
    """Compute reconciliation actions for one host root (read-only)."""
    skip = _host_is_symlinked_or_missing(root, shared)
    if skip:
        return [{"host": host, "name": "<root>", "action": skip, "detail": str(root)}]

    shared_slots = {n: (shared / n) for n in catalog if (shared / n).is_dir()}
    expected = [n for n in catalog if n in shared_slots]

    entries: dict[str, Path] = {}
    for entry in sorted(root.iterdir()):
        if entry.name in catalog:
            entries[entry.name] = entry

    actions: list[dict] = []
    for name in expected:
        entry = entries.get(name)
        target = shared_slots[name]
        if entry is None:
            actions.append(_action(host, name, "create-link", target))
            continue
        if os.path.islink(entry):
            raw = Path(os.readlink(entry))
            resolved = raw if raw.is_absolute() else (root / raw).absolute()
            if resolved.exists() and resolved.samefile(target):
                continue  # healthy link, nothing to do
            if not resolved.exists() or is_inside_shared(resolved, shared):
                actions.append(_action(host, name, "relink", target, detail=f"current={resolved}"))
            else:
                actions.append(_action(host, name, "keep-external-link", detail=f"current={resolved}"))
        else:
            # Real dir/file legacy copy for a catalog skill.
            choice = "replace-copy" if replace_copies else "keep-copy"
            actions.append(_action(host, name, choice, target, detail=str(entry)))

    # Catalog names missing from the shared root: their links are stale.
    for name, entry in entries.items():
        if name in shared_slots or not os.path.islink(entry):
            continue
        raw = Path(os.readlink(entry))
        resolved = raw if raw.is_absolute() else (root / raw).absolute()
        if not resolved.exists() or is_inside_shared(resolved, shared):
            actions.append(_action(host, name, "remove-stale-link", detail=f"target={resolved}"))

    return actions


def _quarantine_root() -> Path:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    configured = os.environ.get("JEO_SKILLS_STATE_DIR", "~/.local/state/jeo-skill")
    return Path(configured).expanduser() / "quarantine" / f"upgrade-{ts}"


def apply_action(item: dict, host_roots: dict[str, Path]) -> str:
    action = item["action"]
    if action in ("skip-symlinked-root", "skip-missing-root", "keep-copy", "keep-external-link"):
        return "noop"
    root = host_roots[item["host"]]
    entry = root / item["name"]
    if action == "remove-stale-link":
        entry.unlink()
        return "removed-stale-link"
    if action in ("create-link", "relink", "replace-copy"):
        if action == "replace-copy":
            quarantined = _quarantine_root() / f"{item['host']}__{item['name']}"
            quarantined.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            try:
                os.chmod(quarantined.parent, 0o700)
            except OSError:
                pass
            shutil.move(str(entry), str(quarantined))
        elif entry.exists() or os.path.islink(entry):
            if not os.path.islink(entry):
                shutil.rmtree(entry)
            else:
                entry.unlink()
        os.symlink(item["target"], entry)
        return {"create-link": "created", "relink": "relinked", "replace-copy": "replaced"}[action]
    return "noop"


def _action(host: str, name: str, action: str, target: Path | None = None, detail: str | None = None) -> dict:
    item = {"host": host, "name": name, "action": action}
    if target is not None:
        item["target"] = str(target)
    if detail:
        item["detail"] = detail
    return item


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--hosts",
        default=",".join(DEFAULT_HOSTS),
        help="comma-separated host ids (default: %s)" % ",".join(DEFAULT_HOSTS),
    )
    parser.add_argument("--apply", action="store_true", help="write changes; without it this is a dry-run report")
    parser.add_argument(
        "--replace-copies",
        action="store_true",
        help="also convert host-local legacy copies of catalog skills into links (quarantined first)",
    )
    args = parser.parse_args()

    host_ids = [h.strip() for h in args.hosts.split(",") if h.strip()]
    unknown = [h for h in host_ids if h not in SUPPORTED_HOSTS]
    if unknown:
        print("unknown hosts: %s (supported: %s)" % (", ".join(unknown), ", ".join(SUPPORTED_HOSTS)), file=sys.stderr)
        return 2

    shared = shared_root()
    if not shared.is_dir():
        print(f"shared root missing: {shared}", file=sys.stderr)
        return 3
    catalog = catalog_names()
    host_roots = {h: SUPPORTED_HOSTS[h].expanduser() for h in host_ids}

    plan: list[dict] = []
    for host, root in host_roots.items():
        plan.extend(plan_host(host, root, shared, catalog, args.replace_copies))

    tally: dict[str, int] = {}
    for item in plan:
        tally[item["action"]] = tally.get(item["action"], 0) + 1
    report = {"shared_root": str(shared), "dry_run": not args.apply, "tally": tally, "actions": plan}
    if args.apply:
        results = []
        for item in plan:
            outcome = apply_action(item, host_roots)
            results.append({"host": item["host"], "name": item["name"], "action": item["action"], "outcome": outcome})
        report["results"] = results
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
