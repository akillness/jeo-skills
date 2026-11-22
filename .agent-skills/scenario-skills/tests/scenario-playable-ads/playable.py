"""Shared fixtures: a project made from the skill's own template and its placeholder art.

No test uses a real game: make_placeholders.py draws the plate, sheet, logo and HUD, and ffmpeg
synthesizes the sounds.
"""

import shutil
import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parents[2] / "skills" / "scenario-playable-ads"
SCRIPTS = SKILL / "scripts"
TEMPLATE = SKILL / "assets" / "template"
RUNTIME = SKILL / "assets" / "runtime" / "runtime.js"
FONT = SKILL / "assets" / "fonts" / "fredoka" / "Fredoka-Bold.woff2"
HAS_FFMPEG = shutil.which("ffmpeg") is not None
NETWORKS = ["meta", "google", "applovin", "unity", "mraid", "moloco", "mintegral", "liftoff", "pangle", "web"]
ZIPPED = ["meta", "google", "liftoff", "pangle"]
EXITAPI = "https://tpc.googlesyndication.com/pagead/gadgets/html5/api/exitapi.js"
PANGLE_SDK = "https://sf16-muse-va.ibytedtos.com/obj/union-fe-nc-i18n/playable/sdk/playable-sdk.js"


def run(script, *args, check=True):
    """Run one of the skill's scripts as an agent would, with this interpreter."""
    out = subprocess.run([sys.executable, "-B", str(script), *map(str, args)], capture_output=True, text=True)
    if check and out.returncode != 0:
        raise AssertionError(f"{Path(script).name} failed ({out.returncode}):\n{out.stdout}\n{out.stderr}")
    return out


def image_size(path):
    """Width and height of an image file, closing it afterward."""
    from PIL import Image

    with Image.open(path) as im:
        return im.size


def rgba(path):
    """An image file as an RGBA numpy array, closing it afterward."""
    import numpy as np
    from PIL import Image

    with Image.open(path) as im:
        return np.asarray(im.convert("RGBA"))


def new_project(parent, name="demo"):
    """The skill's Setup: copy the template and the runtime, draw placeholders, prepare the assets."""
    project = Path(parent) / name
    shutil.copytree(TEMPLATE, project)
    (project / "runtime").mkdir()
    shutil.copy(RUNTIME, project / "runtime" / "runtime.js")
    run(project / "make_placeholders.py", project, "--font", FONT)
    run(SCRIPTS / "prep_assets.py", project)
    return project
