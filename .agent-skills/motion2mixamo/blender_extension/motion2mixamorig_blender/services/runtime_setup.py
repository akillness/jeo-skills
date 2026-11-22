"""Paths and command line for the one-click runtime setup. No Blender imports.

The heavy lifting is in `runtime_bootstrap.py`, which runs as a child process
with Blender's own Python so the user needs no Python installed.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ADDON_DIR = HERE.parent
BOOTSTRAP = HERE / "runtime_bootstrap.py"


def default_home() -> Path:
    return Path.home() / "Motion2MixamoRig"


def app_dir(home: Path) -> Path:
    return home / "app"


def venv_python(home: Path) -> Path:
    if sys.platform == "win32":
        return home / "venv" / "Scripts" / "python.exe"
    return home / "venv" / "bin" / "python"


def setup_log_dir(home: Path) -> Path:
    return home / "logs"


def bundled_backend() -> Path | None:
    """Motion2MixamoRig code shipped inside the add-on zip, or the repo when run from source."""
    packaged = ADDON_DIR / "backend"
    if (packaged / "motion2mixamorig").is_dir():
        return packaged
    repo = ADDON_DIR.parents[1]  # <repo>/blender_extension/motion2mixamorig_blender
    if (repo / "motion2mixamorig").is_dir() and (repo / "pyproject.toml").is_file():
        return repo
    return None


def build_setup_argv(home: Path, backend: Path, progress: Path) -> list[str]:
    return [
        sys.executable,  # Blender's bundled Python
        os.fspath(BOOTSTRAP),
        "--home",
        os.fspath(home),
        "--backend",
        os.fspath(backend),
        "--progress",
        os.fspath(progress),
    ]


def bootstrap_env() -> dict[str, str]:
    """Blender's Python finds its own stdlib; just keep Blender's extra paths out."""
    env = {key: value for key, value in os.environ.items() if key not in {"PYTHONPATH", "PYTHONHOME"}}
    env["PYTHONUNBUFFERED"] = "1"
    return env


def installed_python(home: Path) -> Path | None:
    """Python recorded by a finished setup, if it still exists."""
    marker = home / "runtime.json"
    try:
        python = Path(json.loads(marker.read_text(encoding="utf-8"))["python"])
    except (OSError, ValueError, KeyError):
        return None
    return python if python.is_file() else None
