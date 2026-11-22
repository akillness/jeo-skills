"""Load the shipped scripts by path, the way the other suites in this repo do.

The scripts import each other by bare name (`from common import ...`), so the scripts
directory goes on sys.path and each loaded module is registered under its bare name.
"""

import importlib.util
import json
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[2] / "skills/scenario-patina-retexture/scripts"

if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))


def load(name):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def shot(name, start_width=4.0, end_width=3.5):
    return {
        "name": name,
        "start": [[0, 0, 1], [0, -1, 0.3], start_width],
        "end": [[0, 0, 1], [0.3, -1, 0.2], end_width],
    }


def write_config(folder, **overrides):
    """A valid film config in `folder` with existing before/after placeholder files."""
    folder = Path(folder)
    for name in ("Before.blend", "PATINA.blend"):
        path = folder / name
        if not path.exists():
            path.write_bytes(name.encode())
    config = {
        "project_root": ".",
        "before": "Before.blend",
        "after": "PATINA.blend",
        "shots": [shot("Wide"), shot("Detail", 1.5, 1.2)],
    }
    config.update(overrides)
    path = folder / "film.json"
    path.write_text(json.dumps(config))
    return path
