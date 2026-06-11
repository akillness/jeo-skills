#!/usr/bin/env python3
"""
flatten_skills.py - Flatten .agent-skills structure
Options: --mode flat | namespace
"""

import argparse
import shutil
import sys
from pathlib import Path


def flatten_skills(skills_dir: Path, mode: str = "flat", dry_run: bool = False):
    """Flatten skill directory structure"""

    categories = [
        d
        for d in skills_dir.iterdir()
        if d.is_dir() and d.name not in ["templates", "scripts", "__pycache__"]
    ]

    moves = []

    for category in categories:
        skill_folders = [d for d in category.iterdir() if d.is_dir()]

        for skill_folder in skill_folders:
            skill_name = skill_folder.name

            if mode == "namespace":
                new_name = f"{category.name}--{skill_name}"
            else:  # flat
                new_name = skill_name

            new_path = skills_dir / new_name
            moves.append((skill_folder, new_path))

    if dry_run:
        print("DRY RUN - Would move:")
        for src, dst in moves:
            print(f"  {src.relative_to(skills_dir)} -> {dst.name}")
        return

    # Execute moves
    for src, dst in moves:
        print(f"Moving {src.name} -> {dst.name}")
        shutil.move(str(src), str(dst))

    # Remove empty category folders
    for category in categories:
        try:
            if category.exists() and not list(category.iterdir()):
                print(f"Removing empty category: {category.name}")
                category.rmdir()
        except OSError:
            pass  # Already removed or not empty

    print(
        "\n✅ Done! Now run: python3 .agent-skills/scripts/generate_compact_skills.py"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["flat", "namespace"], default="flat")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--dir", default=".agent-skills")

    args = parser.parse_args()

    skills_dir = Path(args.dir)
    if not skills_dir.exists():
        print(f"Error: {skills_dir} not found")
        sys.exit(1)

    flatten_skills(skills_dir, args.mode, args.dry_run)
