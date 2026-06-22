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

    if dry_run:
        print("DRY RUN - Would move:")

    for category in categories:
        for skill_folder in [d for d in category.iterdir() if d.is_dir()]:
            new_name = f"{category.name}--{skill_folder.name}" if mode == "namespace" else skill_folder.name
            new_path = skills_dir / new_name
            
            if dry_run:
                print(f"  {skill_folder.relative_to(skills_dir)} -> {new_path.name}")
            else:
                print(f"Moving {skill_folder.name} -> {new_path.name}")
                shutil.move(str(skill_folder), str(new_path))

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
