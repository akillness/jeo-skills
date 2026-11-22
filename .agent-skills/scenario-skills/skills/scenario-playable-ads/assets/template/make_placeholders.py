"""Write placeholder art so the template builds and passes QA before the real game's assets are ready.

Usage: python3 make_placeholders.py <project_dir> --font <OFL font, e.g. $SKILL/assets/fonts/fredoka/Fredoka-Bold.woff2>

Writes (only files that do not exist yet):
  intake/screenshot.png (placeholder HUD coin to crop), intake/logo.png (plain background, keyed by prep_assets)
  assets/raw/plate.png, assets/raw/sheet.png (3 sprites; the third crosses the 3x2 grid on purpose, and
      the sheet has opaque white cell borders, as a generated sheet once did)
  assets/raw/pop.wav, payoff.wav, win.wav (deliberately quiet: boosted by "boost_db"), fail.wav, music.mp3
  assets/raw/hud-font.ttf (a copy of --font; a variable font is instanced at wght 700 by prep_assets)
Replace each one with the real file (a file the user supplied, a recording frame crop, or a Scenario edit of a frame);
keep the names or update the manifest. Never ship a placeholder.
"""
import argparse
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument("project")
ap.add_argument("--font", required=True)
a = ap.parse_args()
root = Path(a.project)
(root / "intake").mkdir(parents=True, exist_ok=True)
raw = root / "assets" / "raw"
raw.mkdir(parents=True, exist_ok=True)


def new(path):
    return not path.exists()


def font(size):
    try:
        return ImageFont.truetype(a.font, size)
    except OSError:
        return ImageFont.load_default(size=size)


# background plate: bright sky gradient with soft hills
p = raw / "plate.png"
if new(p):
    im = Image.new("RGB", (1152, 2048))
    d = ImageDraw.Draw(im)
    for y in range(2048):
        k = y / 2047
        d.line([(0, y), (1152, y)], fill=(int(94 + 120 * k), int(200 - 10 * k), int(255 - 120 * k)))
    for i, (cx, cy, r, col) in enumerate([(200, 1700, 520, (120, 214, 110)), (950, 1800, 600, (96, 196, 96)),
                                          (560, 2100, 700, (140, 226, 120))]):
        d.ellipse((cx - r, cy - r * 0.6, cx + r, cy + r * 0.6), fill=col)
    im.save(p)

# placeholder screenshot: the plate plus a HUD coin that prep_assets crops with an ellipse mask
s = root / "intake" / "screenshot.png"
if new(s):
    im = Image.open(p).convert("RGB")
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 1152, 240), fill=(40, 90, 170))
    d.ellipse((50, 70, 150, 170), fill=(255, 200, 40), outline=(160, 100, 0), width=8)
    d.text((100, 120), "$", fill=(160, 100, 0), font=font(64), anchor="mm")
    im.save(s)

# placeholder logo on a plain teal background (the shape a logo on a flat background comes in)
lg = root / "intake" / "logo.png"
if new(lg):
    im = Image.new("RGB", (1536, 1024), (11, 82, 97))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((268, 312, 1268, 712), radius=120, fill=(255, 196, 40), outline=(19, 36, 77), width=24)
    d.text((768, 512), "GAME NAME", fill=(19, 36, 77), font=font(120), anchor="mm")
    im.save(lg)

# sprite sheet: piece, star, hero; the hero is wider than its cell to prove the blob slicer, and the sheet
# carries opaque white cell borders (a real sheet failure) that prep_assets must clear
sh = raw / "sheet.png"
if new(sh):
    im = Image.new("RGBA", (1536, 1024), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for x in (510, 1022):
        d.rectangle((x, 0, x + 4, 1023), fill=(255, 255, 255, 238))
    d.rectangle((0, 510, 1535, 514), fill=(255, 255, 255, 238))
    d.ellipse((120, 120, 392, 392), fill=(255, 90, 140, 255), outline=(19, 36, 77, 255), width=12)
    d.ellipse((170, 160, 250, 230), fill=(255, 255, 255, 200))
    star = [(768, 110), (812, 210), (920, 220), (838, 290), (866, 400), (768, 340), (670, 400), (698, 290),
            (616, 220), (724, 210)]
    d.polygon(star, fill=(255, 210, 50, 255), outline=(19, 36, 77, 255))
    d.rounded_rectangle((260, 560, 1290, 960), radius=180, fill=(80, 170, 255, 255), outline=(19, 36, 77, 255), width=14)
    d.ellipse((560, 660, 660, 760), fill=(255, 255, 255, 255)); d.ellipse((900, 660, 1000, 760), fill=(255, 255, 255, 255))
    d.ellipse((590, 690, 640, 740), fill=(19, 36, 77, 255)); d.ellipse((930, 690, 980, 740), fill=(19, 36, 77, 255))
    im.save(sh)


def tone(path, expr, dur, extra=""):
    if new(path):
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
                        f"aevalsrc='{expr}':s=44100:d={dur}", *(["-af", extra] if extra else []), str(path)], check=True)


tone(raw / "pop.wav", "0.8*sin(2*PI*(600+900*t)*t)*exp(-12*t)", 0.35)
tone(raw / "payoff.wav", "0.6*(sin(2*PI*523*t)+sin(2*PI*659*t)+sin(2*PI*784*t))/3*exp(-1.5*t)", 2.0)
tone(raw / "win.wav", "0.03*(sin(2*PI*784*t)+sin(2*PI*988*t))*exp(-1*t)", 2.0)   # quiet on purpose
tone(raw / "fail.wav", "0.5*sin(2*PI*(500-250*t)*t)*exp(-1.2*t)", 1.5)
mus = raw / "music.mp3"
if new(mus):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i",
                    "aevalsrc='0.25*sin(2*PI*(262+131*floor(mod(t*2,4)))*t)*(0.6+0.4*sin(2*PI*2*t))':s=44100:d=8",
                    "-b:a", "96k", str(mus)], check=True)

f = raw / "hud-font.ttf"
if new(f):
    shutil.copy(a.font, f)
    lic = Path(a.font).with_name("OFL.txt")   # the bundled fonts carry their license next to them
    if lic.exists():
        shutil.copy(lic, raw / "hud-font-OFL.txt")
print("placeholders ready in", root)
