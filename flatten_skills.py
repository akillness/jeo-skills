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
        if d.is_dir()
        and d.name not in ["templates", "scripts", "__pycache__"]
        # A folder that already contains SKILL.md is itself a flattened skill,
        # not a category. Treating it as a category would wrongly merge its
        # internal references/evals folders as skills and cause collisions.
        and not (d / "SKILL.md").exists()
    ]

    if dry_run:
        for category in categories:

            for skill_folder in [d for d in category.iterdir() if d.is_dir()]:
                new_name = (
                    f"{category.name}--{skill_folder.name}"
                    if mode == "namespace"
                    else skill_folder.name
                )
                print(f"  {skill_folder.relative_to(skills_dir)} -> {new_name}")
        print(
            "\n✅ Done! Now run: python3 .agent-skills/scripts/generate_compact_skills.py"
        )
        return

    def overwrite(path: Path):
        """Remove an existing destination so a move never nests inside it."""
        if not path.exists() and not path.is_symlink():
            return
        if path.is_dir() and not path.is_symlink():
            shutil.rmtree(path)
        else:
            path.unlink()

    # Phase 1: stage every skill folder into a scratch directory. Staging first
    # avoids shutil.move nesting a source inside an existing destination (which
    # raises shutil.Error) when the target name collides with a category folder
    # (e.g. category "evals" containing skill "evals") or a prior skill.
    staging = skills_dir / ".flatten_staging"
    overwrite(staging)
    staging.mkdir()

    planned = []  # (staged_path, final_path)
    for category in categories:
        for skill_folder in [d for d in category.iterdir() if d.is_dir()]:
            new_name = (
                f"{category.name}--{skill_folder.name}"
                if mode == "namespace"
                else skill_folder.name
            )
            staged_path = staging / new_name
            overwrite(staged_path)
            print(f"Staging {skill_folder.name} -> {new_name}")
            shutil.move(str(skill_folder), str(staged_path))
            planned.append((staged_path, skills_dir / new_name))

    # Remove empty category folders before moving skills back to the top level.
    for category in categories:
        try:
            if category.exists() and not list(category.iterdir()):
                print(f"Removing empty category: {category.name}")
                category.rmdir()
        except OSError:
            pass  # Already removed or not empty

    # Phase 2: move staged skills to their final top-level destinations,
    # overwriting any leftover directory that shares the same name.
    for staged_path, final_path in planned:
        overwrite(final_path)
        print(f"Moving {staged_path.name} -> {final_path.name}")
        shutil.move(str(staged_path), str(final_path))

    overwrite(staging)


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
