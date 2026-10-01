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
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / ".agent-skills/jeo-skill/scripts"))
from install_support import copy_tree, dir_manifest, require_safe_path, require_safe_tree, resolve_aside_user




def main() -> int:
    parser = argparse.ArgumentParser(description="Synchronize jeo-skills to Aside accounts and host agents.")
    parser.add_argument("names", nargs="*", help="Skill names to synchronize")
    parser.add_argument("--skill", dest="skill_opt", help="Single skill name to sync")
    parser.add_argument("--all", action="store_true", help="Sync all canonical skills from .agent-skills/")
    parser.add_argument("--check", action="store_true", help="Check status without modifying anything")
    parser.add_argument("--home", type=Path, default=Path.home(), help="Host home (defaults to HOME; never inferred from OS account records)")
    parser.add_argument("--aside-home", type=Path)
    parser.add_argument("--aside-account", help="Required when more than one Aside account exists")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    agent_skills_root = repo_root / ".agent-skills"
    if not agent_skills_root.is_dir():
        print(f"Error: {agent_skills_root} not found", file=sys.stderr)
        return 1

    user_home = args.home.expanduser().absolute()
    aside_root = args.aside_home or user_home / ".aside"
    host_agents_root = user_home / ".agents" / "skills"
    proj_agents_root = repo_root / ".agents" / "skills"

    aside_accounts = [resolve_aside_user(aside_root, args.aside_account)]

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

    # Validate every selected tree before the first copy. Never replace symlinks
    # or route writes outside the explicitly chosen host/account roots.
    for root, boundary in ((host_agents_root, user_home), (proj_agents_root, repo_root)):
        require_safe_path(root, boundary)
    for name in target_skills:
        if not name or name in {".", ".."} or any(c in name for c in "/\\"):
            raise ValueError(f"Unsafe skill name: {name}")
        source = agent_skills_root / name
        require_safe_tree(source)
        if not (source / "SKILL.md").is_file():
            raise ValueError(f"Missing skill: {name}")
        for root in (host_agents_root, proj_agents_root, *aside_accounts):
            require_safe_tree(root / name)
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
    try:
        sys.exit(main())
    except (ValueError, OSError) as error:
        print(f"sync-aside-skills: {error}", file=sys.stderr)
        sys.exit(1)
