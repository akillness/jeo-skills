#!/usr/bin/env python3
"""Synchronize jeo-skills to Aside user accounts and host agent directories.

Enforces the 3-tier skill hierarchy documented in jeo-skills-authoring.md:
  1. Canonical repo:  <repo>/.agent-skills/<name>/
  2. Host agents:     ~/.agents/skills/<name>/
  3. Aside accounts:  ~/.aside/u/<acct>/skills/user/<name>/

Usage:
  python3 scripts/sync-aside-skills.py [skill-name ...]
  python3 scripts/sync-aside-skills.py --skill stagehand
  python3 scripts/sync-aside-skills.py --all
  python3 scripts/sync-aside-skills.py --check
"""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sys
from pathlib import Path


def resolve_user_home() -> Path:
    """Resolve the real user home directory, even inside an Aside runtime sandbox."""
    if sys.platform == "win32":
        return Path(os.environ.get("USERPROFILE", Path.home()))
    # On macOS, dscl gives the real user home even if HOME is pointed to Aside runtime
    if sys.platform == "darwin":
        import subprocess
        try:
            user = subprocess.check_output(["id", "-un"], text=True).strip()
            out = subprocess.check_output(["dscl", ".", "-read", f"/Users/{user}", "NFSHomeDirectory"], text=True)
            for line in out.splitlines():
                parts = line.split()
                if len(parts) >= 2 and parts[0] == "NFSHomeDirectory:":
                    p = Path(parts[1])
                    if p.is_dir():
                        return p
        except Exception:
            pass
    try:
        import pwd
        return Path(pwd.getpwuid(os.getuid()).pw_dir)
    except Exception:
        return Path.home()


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def dir_manifest(root: Path) -> dict[str, str]:
    """Compute relative-path -> sha256 for all non-hidden files in directory."""
    result = {}
    if not root.is_dir():
        return result
    for p in root.rglob("*"):
        # Ignore dotfiles (.DS_Store, .skill_id, etc.) and __pycache__ / .pyc
        parts = p.relative_to(root).parts
        if any(part.startswith(".") or part == "__pycache__" for part in parts):
            continue
        if p.is_file() and not p.name.endswith(".pyc"):
            rel = str(p.relative_to(root))
            result[rel] = file_sha256(p)
    return result


def copy_tree(src: Path, dst: Path) -> int:
    """Recursively copy src directory to dst directory, creating dirs as needed."""
    copied = 0
    dst.mkdir(parents=True, exist_ok=True)
    for p in src.rglob("*"):
        if p.name.startswith(".DS_Store"):
            continue
        rel = p.relative_to(src)
        target = dst / rel
        if p.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        elif p.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, target)
            copied += 1
    return copied


def main() -> int:
    parser = argparse.ArgumentParser(description="Synchronize jeo-skills to Aside accounts and host agents.")
    parser.add_argument("names", nargs="*", help="Skill names to synchronize")
    parser.add_argument("--skill", dest="skill_opt", help="Single skill name to sync")
    parser.add_argument("--all", action="store_true", help="Sync all canonical skills from .agent-skills/")
    parser.add_argument("--check", action="store_true", help="Check status without modifying anything")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    agent_skills_root = repo_root / ".agent-skills"
    if not agent_skills_root.is_dir():
        print(f"Error: {agent_skills_root} not found", file=sys.stderr)
        return 1

    user_home = resolve_user_home()
    aside_root = user_home / ".aside"
    host_agents_root = user_home / ".agents" / "skills"
    proj_agents_root = repo_root / ".agents" / "skills"

    aside_accounts = []
    if aside_root.is_dir():
        u_dir = aside_root / "u"
        if u_dir.is_dir():
            for entry in u_dir.iterdir():
                if entry.is_dir() and (entry / "skills").is_dir():
                    aside_accounts.append(entry / "skills" / "user")

    # Resolve target skill names
    requested = list(args.names)
    if args.skill_opt:
        requested.append(args.skill_opt)

    if args.all:
        target_skills = sorted(
            d.name for d in agent_skills_root.iterdir()
            if d.is_dir() and (d / "SKILL.md").is_file()
        )
    elif requested:
        target_skills = requested
    else:
        # Default: if no names provided, list missing skills in Aside
        args.check = True
        target_skills = sorted(
            d.name for d in agent_skills_root.iterdir()
            if d.is_dir() and (d / "SKILL.md").is_file()
        )

    print(f"jeo-skills sync target: {len(target_skills)} skill(s)")
    print(f"  User home:   {user_home}")
    print(f"  Host agents: {host_agents_root}")
    print(f"  Aside user:  {[str(p) for p in aside_accounts] or 'Not detected'}")
    print()

    missing_aside = []
    missing_host = []
    synced_count = 0

    for name in target_skills:
        src = agent_skills_root / name
        if not (src / "SKILL.md").is_file():
            print(f"Warning: skill '{name}' has no SKILL.md in {src}", file=sys.stderr)
            continue

        src_manifest = dir_manifest(src)

        # Check / sync host agents
        host_dst = host_agents_root / name
        host_manifest = dir_manifest(host_dst)
        host_ok = (src_manifest == host_manifest)
        if not host_ok:
            missing_host.append(name)
            if not args.check:
                copy_tree(src, host_dst)
                print(f"  [HOST AGENTS] Synced {name} -> {host_dst}")

        # Check / sync Aside accounts
        for aside_dest in aside_accounts:
            aside_skill_dst = aside_dest / name
            aside_manifest = dir_manifest(aside_skill_dst)
            aside_ok = (src_manifest == aside_manifest)
            if not aside_ok:
                missing_aside.append((name, aside_dest))
                if not args.check:
                    copy_tree(src, aside_skill_dst)
                    print(f"  [ASIDE]       Synced {name} -> {aside_skill_dst}")

        # Sync project .agents/skills if the folder exists
        if proj_agents_root.is_dir() and not args.check:
            proj_dst = proj_agents_root / name
            copy_tree(src, proj_dst)

        synced_count += 1

    if args.check:
        print("Status Report:")
        print(f"  Total checked: {len(target_skills)}")
        print(f"  Missing or drifted in Host agents: {len(missing_host)}")
        if missing_host:
            print(f"    -> {', '.join(missing_host)}")
        print(f"  Missing or drifted in Aside accounts: {len(missing_aside)}")
        if missing_aside:
            for n, d in missing_aside:
                print(f"    -> {n} in {d}")
        if not missing_host and not missing_aside:
            print("  All requested skills are perfectly in sync across targets!")
        return 1 if (missing_host or missing_aside) else 0

    print(f"\nCompleted sync for {synced_count} skill(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
