"""Render the site's favicons and its social share image from two committed sources.

Sources: `site/public/favicon.svg` (the header's logo mark on a cream tile) and the showcase frame
`docs/demos/showcase/village-overcast-morning.jpg` (the same frame the hero uses). Outputs are
committed, so this script is not part of the build — run it when the mark or the frame changes:

    python3 site/scripts/social-assets.py            # everything
    python3 site/scripts/social-assets.py --icons    # favicons + apple touch icon only
    python3 site/scripts/social-assets.py --og       # the 1200x630 share image only

Needs Pillow and cairosvg (`pip install pillow cairosvg`). The wordmark is set in Outfit, the
site's display face; only a woff2 subset is committed, so the variable TTF is downloaded once into
`--font-cache` (default: the system temp) and Arial Bold is the offline fallback.
"""
import argparse
import io
import os
from pathlib import Path
import tempfile
import urllib.request

import cairosvg
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / 'site' / 'public'
MARK_SVG = PUBLIC / 'favicon.svg'
HERO_FRAME = ROOT / 'docs' / 'demos' / 'showcase' / 'village-overcast-morning.jpg'
OG_FILE = PUBLIC / 'og' / '3dviz-pro-max.jpg'

CREAM, INK, GREEN = '#fffaf2', '#1c2a23', '#0b7553'
WORDMARK, TAGLINE = '3Dviz Pro Max', 'Turn an idea into a 3D scene worth exploring.'
OG_SIZE = (1200, 630)
# The frame is 16:9, so 1200-wide leaves 675 rows for a 630-tall crop: this offset keeps the
# bridge and the market stall and drops the empty sky band at the top.
OG_CROP_TOP = 40
SCRIM_SOLID, SCRIM_CLEAR, SCRIM_ALPHA = 0.42, 0.60, 0.9

OUTFIT_URL = 'https://github.com/google/fonts/raw/main/ofl/outfit/Outfit%5Bwght%5D.ttf'
FALLBACK_FONTS = ('/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/Library/Fonts/Arial Bold.ttf')


def resolve_font_file(cache_dir: Path) -> tuple[Path, bool]:
    """The Outfit variable TTF (downloaded once), or a system bold face. True when it is Outfit."""
    cached = cache_dir / 'outfit-variable.ttf'
    if not cached.exists():
        try:
            cache_dir.mkdir(parents=True, exist_ok=True)
            with urllib.request.urlopen(OUTFIT_URL, timeout=30) as response:
                data = response.read()
            if not data.startswith(b'\x00\x01\x00\x00') and not data.startswith(b'true'):
                raise ValueError('not a TrueType payload')
            cached.write_bytes(data)
        except Exception as error:  # offline, or the font moved: fall back and say so
            print(f'! Outfit unavailable ({error}); falling back to a system bold face')
            for candidate in FALLBACK_FONTS:
                if Path(candidate).exists():
                    return Path(candidate), False
            raise SystemExit('social-assets: no usable font; pass --font-cache with Outfit in it')
    return cached, True


def load_font(font_file: Path, is_outfit: bool, size: int, weight: int) -> ImageFont.FreeTypeFont:
    font = ImageFont.truetype(str(font_file), size)
    if is_outfit:
        font.set_variation_by_axes([weight])
    return font


def render_mark(size: int) -> Image.Image:
    """The favicon tile (cream, rounded, the green mark) at any pixel size."""
    png = cairosvg.svg2png(url=str(MARK_SVG), output_width=size, output_height=size)
    return Image.open(io.BytesIO(png)).convert('RGBA')


def write_icons() -> None:
    for size in (16, 32, 512):
        render_mark(size).save(PUBLIC / f'favicon-{size}.png')
    # Apple homescreen icons are masked by iOS and never transparent: full-bleed cream, mark at 70%.
    touch = Image.new('RGB', (180, 180), CREAM)
    inner = render_mark(126)
    touch.paste(inner, (27, 27), inner)
    touch.save(PUBLIC / 'apple-touch-icon.png')
    render_mark(32).save(PUBLIC / 'favicon.ico', sizes=[(16, 16), (32, 32)])
    print(f'icons: favicon-16/32/512.png, apple-touch-icon.png, favicon.ico -> {PUBLIC}')


def scrim_mask(width: int, height: int) -> Image.Image:
    """A left-to-right alpha ramp: flat over the copy, gone before the market stall."""
    solid, clear = int(width * SCRIM_SOLID), int(width * SCRIM_CLEAR)
    peak = int(255 * SCRIM_ALPHA)
    row = []
    for x in range(width):
        if x <= solid:
            row.append(peak)
        elif x >= clear:
            row.append(0)
        else:
            # Smoothstep, so the fade has no visible edge where it meets the picture.
            t = (x - solid) / (clear - solid)
            row.append(int(peak * (1 - t * t * (3 - 2 * t))))
    line = Image.new('L', (width, 1))
    line.putdata(row)
    return line.resize((width, height))


def wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, limit: int) -> list[str]:
    lines, current = [], ''
    for word in text.split():
        probe = f'{current} {word}'.strip()
        if draw.textlength(probe, font=font) <= limit or not current:
            current = probe
        else:
            lines.append(current)
            current = word
    return lines + [current] if current else lines


def write_og(font_file: Path, is_outfit: bool) -> None:
    width, height = OG_SIZE
    frame = Image.open(HERO_FRAME).convert('RGB')
    scaled = frame.resize((width, round(frame.height * width / frame.width)), Image.LANCZOS)
    card = scaled.crop((0, OG_CROP_TOP, width, OG_CROP_TOP + height))

    card.paste(Image.new('RGB', OG_SIZE, CREAM), (0, 0), scrim_mask(width, height))
    draw = ImageDraw.Draw(card)

    mark = render_mark(64)
    card.paste(mark, (76, 96), mark)
    kicker = load_font(font_file, is_outfit, 22, 600)
    draw.text((156, 116), 'AGENT SKILL', font=kicker, fill=GREEN)

    word = load_font(font_file, is_outfit, 78, 800)
    draw.text((74, 224), WORDMARK, font=word, fill=INK)
    draw.line((78, 340, 78 + 96, 340), fill=GREEN, width=5)

    body = load_font(font_file, is_outfit, 34, 500)
    y = 382
    for line in wrap(draw, TAGLINE, body, 430):
        draw.text((76, y), line, font=body, fill=INK)
        y += 46

    OG_FILE.parent.mkdir(parents=True, exist_ok=True)
    card.save(OG_FILE, quality=82, optimize=True, progressive=True, subsampling=1)
    kib = OG_FILE.stat().st_size / 1024
    print(f'og: {OG_FILE.relative_to(ROOT)} {card.width}x{card.height} {kib:.1f} KiB')
    if kib > 200:
        raise SystemExit('social-assets: the share image is over its 200 KiB budget')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--icons', action='store_true', help='render the icons only')
    parser.add_argument('--og', action='store_true', help='render the share image only')
    parser.add_argument('--font-cache', type=Path, default=Path(tempfile.gettempdir()) / '3dviz-fonts',
                        help='where the Outfit TTF is cached (default: the system temp)')
    args = parser.parse_args()
    everything = not (args.icons or args.og)
    if args.icons or everything:
        write_icons()
    if args.og or everything:
        write_og(*resolve_font_file(args.font_cache))


if __name__ == '__main__':
    os.umask(0o022)
    main()
