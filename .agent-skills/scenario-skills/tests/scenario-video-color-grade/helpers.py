"""Load the shipped scripts by path, the way the other suites in this repo do.

The scripts import each other by bare name (`import grade`), so the scripts directory
goes on sys.path and each loaded module is registered under its bare name.
"""

import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parents[2] / "skills/scenario-video-color-grade"
SCRIPTS = SKILL / "scripts"
HAS_FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))

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


def run(script, *args, cwd):
    """Run a shipped script as the agent would, returning the completed process."""
    return subprocess.run([sys.executable, str(SCRIPTS / script), *map(str, args)], cwd=cwd,
                          capture_output=True, text=True)


def make_clip(path, size="96x54", seconds=1, audio=True):
    """A small test-pattern clip at 24 fps, with a tone when audio is set."""
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
           f"testsrc2=size={size}:rate=24:duration={seconds}"]
    if audio:
        cmd += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}", "-c:a", "aac", "-shortest"]
    subprocess.run(cmd + ["-c:v", "libx264", "-pix_fmt", "yuv420p", str(path)], check=True)


def make_mask(path, size="96x54", seconds=1, box="x=30:y=10:w=30:h=30"):
    """A black clip with one white box: a stand-in for a segmentation model's mask video."""
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                    f"color=black:size={size}:rate=24:duration={seconds},drawbox={box}:color=white:t=fill",
                    "-pix_fmt", "yuv420p", str(path)], check=True)


def frame_count(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v",
                          "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return int(out.strip())
