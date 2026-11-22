"""Small synthetic inputs shared by the suites: magenta stills, clips, environment renders."""
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

SCRIPTS = Path(__file__).resolve().parents[2] / "skills" / "scenario-side-view-game-kit" / "scripts"
MAGENTA = (255, 0, 255)
HAS_FFMPEG = bool(shutil.which("ffmpeg") and shutil.which("ffprobe"))


def run(script, *args, scripts=SCRIPTS):
    return subprocess.run([sys.executable, "-B", str(Path(scripts) / script), *map(str, args)],
                          capture_output=True, text=True)


def load(path):
    """Open an image fully and close the file."""
    with Image.open(path) as im:
        im.load()
        return im.copy()


def size(path):
    with Image.open(path) as im:
        return im.size


def two_pose(path, size=(400, 200)):
    """Rest pose on the left half, a shorter and wider action pose on the right."""
    im = Image.new("RGB", size, MAGENTA)
    d = ImageDraw.Draw(im)
    d.rectangle((60, 40, 99, 159), fill=(40, 90, 200))
    d.rectangle((70, 30, 89, 45), fill=(230, 200, 160))
    d.rectangle((250, 70, 329, 149), fill=(40, 90, 200))
    im.save(path)


def pose_sheet(path):
    """Two figures whose column spans overlap but which do not touch."""
    im = Image.new("RGB", (160, 140), MAGENTA)
    d = ImageDraw.Draw(im)
    d.rectangle((20, 10, 79, 49), fill=(40, 160, 60))     # wide, left
    d.rectangle((60, 80, 99, 129), fill=(200, 120, 40))   # starts inside the first one's columns
    im.save(path)


def _figure(d, size, dx=0, arm=0):
    feet = int(size * 0.82)
    mid = size // 2
    d.rectangle((mid - 10, feet - 40, mid + 9, feet - 1), fill=(40, 90, 200))
    d.rectangle((mid - 4 + dx, feet - 16, mid + 3 + dx, feet - 1), fill=(220, 180, 60))
    if arm:
        d.rectangle((mid + 10, feet - 32, mid + 10 + arm, feet - 26), fill=(230, 230, 230))


def clip(path, kind, size=96, frames=40, fps=24, width=None):
    """A loop (a leg swinging with a 10-frame period) or an attack (rest, arm out, rest); `width` makes it non-square."""
    tmp = Path(tempfile.mkdtemp())
    for i in range(frames):
        im = Image.new("RGB", (width or size, size), MAGENTA)
        d = ImageDraw.Draw(im)
        if kind == "loop":
            _figure(d, size, dx=round(8 * math.sin(2 * math.pi * i / 10)))
        else:
            arm = 0 if i < 8 or i > 20 else round(24 * math.sin(math.pi * (i - 8) / 12))
            _figure(d, size, arm=arm)
        im.save(tmp / f"f_{i:03d}.png")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-framerate", str(fps), "-i", str(tmp / "f_%03d.png"),
                    "-c:v", "mpeg4", "-q:v", "2", "-pix_fmt", "yuv420p", str(path)], check=True)
    shutil.rmtree(tmp)


def env_level(folder, level):
    """bg, mid, tex, ledge and props renders for one level."""
    folder.mkdir(parents=True, exist_ok=True)
    bg = Image.new("RGB", (160, 90))
    bg.putdata([(x * 255 // 160, y * 255 // 90, 120) for y in range(90) for x in range(160)])
    bg.save(folder / f"bg{level}.png")
    mid = Image.new("RGBA", (160, 90), (0, 0, 0, 0))
    ImageDraw.Draw(mid).rectangle((20, 40, 140, 89), fill=(60, 80, 60, 255))
    mid.save(folder / f"mid{level}.png")
    tex = Image.new("RGB", (100, 100))
    tex.putdata([(x, y, 80) for y in range(100) for x in range(100)])
    tex.save(folder / f"tex{level}.png")
    ledge = Image.new("RGBA", (300, 200), (0, 0, 0, 0))
    ImageDraw.Draw(ledge).rectangle((50, 80, 249, 119), fill=(120, 100, 80, 255))
    ledge.save(folder / f"ledge{level}.png")
    props_sheet(folder / f"props{level}.png")


def props_sheet(path):
    """Three separate props of different sizes."""
    im = Image.new("RGBA", (240, 120), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((10, 20, 59, 109), fill=(200, 60, 60, 255))
    d.rectangle((90, 60, 129, 109), fill=(60, 200, 60, 255))
    d.rectangle((170, 40, 229, 109), fill=(60, 60, 200, 255))
    im.save(path)
