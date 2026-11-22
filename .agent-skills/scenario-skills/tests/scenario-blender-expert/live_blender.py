"""Finds the Blender the live suites run and checks it against the family's version floor.

The family targets Blender 5.2 LTS, and its scripts use APIs older releases lack:
`ImageFormatSettings.media_type` (5.0) and the glTF exporter's meshopt options (5.2). Below
the floor a live suite skips with a reason naming the version, instead of failing inside Blender.
Set BLENDER to a 5.2 build when another Blender comes first.
"""

import os
import re
import shutil
import subprocess
from pathlib import Path

FLOOR = (5, 2)


def find_blender():
    for path in (os.environ.get("BLENDER"), shutil.which("blender"),
                 "/Applications/Blender.app/Contents/MacOS/Blender"):
        if path and Path(path).is_file():
            return path
    return None


def blender_version(blender):
    run = subprocess.run([blender, "-b", "--factory-startup", "--version"],
                         capture_output=True, text=True, timeout=120)
    found = re.search(r"Blender (\d+)\.(\d+)(?:\.(\d+))?", run.stdout)
    return tuple(int(part or 0) for part in found.groups()) if found else None


def skip_reason(blender):
    """Why a live suite cannot run on this Blender, or None when it can."""
    if not blender:
        return "Blender is not installed"
    version = blender_version(blender)
    if version is not None and version[:2] < FLOOR:
        return (f"Blender {'.'.join(map(str, version))} ({blender}) is below the family floor, "
                f"{'.'.join(map(str, FLOOR))}; set BLENDER to a 5.2 build")
    return None


BLENDER = find_blender()
SKIP = skip_reason(BLENDER)
