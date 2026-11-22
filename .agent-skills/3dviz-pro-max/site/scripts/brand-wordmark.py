"""Render the project wordmark — the cube mark plus "3Dviz Pro Max" — as one self-contained SVG.

The README needs a title image whose alignment survives any renderer, so the mark and the words
are baked into a single file instead of being aligned by HTML. Text is real Outfit outlines
(converted to paths), not a `<text>` element, so nothing depends on the reader having the font.

    python3 site/scripts/brand-wordmark.py            # all three files
    python3 site/scripts/brand-wordmark.py --no-png   # SVG only

Needs fontTools (`pip install fonttools`); the PNG fallback additionally needs cairosvg. Only a
woff2 subset of Outfit is committed, so the variable TTF is downloaded once into `--font-cache`
(default: the system temp), exactly as `site/scripts/social-assets.py` does. There is no font
fallback here: a wordmark set in the wrong face would be worse than no file at all.

Outputs (committed, so this script is not part of the build — run it when the mark or the
wordmark changes):

    docs/brand/wordmark.svg       ink text on transparency, for light backgrounds
    docs/brand/wordmark-dark.svg  cream text and a lighter mark, for dark backgrounds
    docs/brand/wordmark.png       2x raster of the light file, transparent, fallback only
"""
import argparse
from pathlib import Path
import tempfile
import urllib.request

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / 'docs' / 'brand'

TEXT = '3Dviz Pro Max'
WEIGHT = 800
OUTFIT_URL = 'https://github.com/google/fonts/raw/main/ofl/outfit/Outfit%5Bwght%5D.ttf'

INK, CREAM, GREEN, LIME, MINT = '#1c2a23', '#fffaf2', '#0b7553', '#c7ef7a', '#9be6c4'

# The mark's geometry, kept identical to docs/brand/logo-mark.svg and site-nav.tsx: an isometric
# cube outline with a dot at the centre, drawn in a 48x48 box.
MARK_PATHS = ('M24 5 41 14.5v19L24 43 7 33.5v-19Z', 'M7 14.5 24 24l17-9.5M24 24v19')
MARK_STROKE, DOT_R, DOT_STROKE = 2.6, 3.2, 1.6
# Ink extents of that drawing (outline corners plus half the stroke), not the 48x48 box.
MARK_BOX = (7 - MARK_STROKE / 2, 5 - MARK_STROKE / 2, 41 + MARK_STROKE / 2, 43 + MARK_STROKE / 2)

# Proportions, in cap heights. Verified by rendering the README header at 1x, 2x and in a dark
# scheme: the mark reads as the same weight as the capitals at 0.95, and 0.35 is the smallest gap
# that keeps the cube from crowding the "3".
MARK_HEIGHT_CAPS, GAP_CAPS, PADDING_RATIO = 0.95, 0.35, 0.04
PNG_HEIGHT = 112  # 2x the height the README asks the browser for


def resolve_font_file(cache_dir: Path) -> Path:
    """The Outfit variable TTF, downloaded once into the cache directory."""
    cached = cache_dir / 'outfit-variable.ttf'
    if cached.exists():
        return cached
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(OUTFIT_URL, timeout=30) as response:
            data = response.read()
        if not data.startswith(b'\x00\x01\x00\x00') and not data.startswith(b'true'):
            raise ValueError('not a TrueType payload')
        cached.write_bytes(data)
    except Exception as error:
        raise SystemExit(f'brand-wordmark: Outfit unavailable ({error}); '
                         f'place Outfit[wght].ttf at {cached} and re-run')
    return cached


def load_instance(font_file: Path) -> TTFont:
    """Outfit at one static weight; the wordmark is never rendered at another."""
    font = TTFont(str(font_file))
    if 'fvar' in font:
        instantiateVariableFont(font, {'wght': WEIGHT}, inplace=True, updateFontNames=False)
    return font


def draw_text(font: TTFont) -> tuple[str, tuple[float, float, float, float]]:
    """The whole string as one SVG path plus its ink bounds, laid out on advance widths."""
    glyphs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font['hmtx']
    svg_pen, bounds_pen = SVGPathPen(glyphs), BoundsPen(glyphs)
    cursor = 0.0
    for character in TEXT:
        name = cmap.get(ord(character))
        if name is None:
            raise SystemExit(f'brand-wordmark: Outfit has no glyph for {character!r}')
        shift = (1, 0, 0, 1, cursor, 0)
        glyphs[name].draw(TransformPen(svg_pen, shift))
        glyphs[name].draw(TransformPen(bounds_pen, shift))
        cursor += hmtx[name][0]
    if bounds_pen.bounds is None:
        raise SystemExit('brand-wordmark: the text produced no outlines')
    return svg_pen.getCommands(), bounds_pen.bounds


def cap_height(font: TTFont) -> float:
    """The cap height the layout is measured in: the OS/2 value, or the height of an "H"."""
    declared = getattr(font['OS/2'], 'sCapHeight', 0) or 0
    if declared:
        return float(declared)
    glyphs = font.getGlyphSet()
    pen = BoundsPen(glyphs)
    glyphs[font.getBestCmap()[ord('H')]].draw(pen)
    return float(pen.bounds[3])


def compose(text_path: str, text_bounds: tuple, caps: float, dark: bool) -> tuple[str, dict]:
    """One SVG: the mark scaled to the caps, then the text, both in a tight padded viewBox."""
    text_x0, text_y0, text_x1, text_y1 = text_bounds
    mark_x0, mark_y0, mark_x1, mark_y1 = MARK_BOX
    mark_height = MARK_HEIGHT_CAPS * caps
    scale = mark_height / (mark_y1 - mark_y0)
    mark_width = (mark_x1 - mark_x0) * scale
    gap = GAP_CAPS * caps

    # Output space is y-down: the baseline sits at y = 0 and the text is flipped into place.
    content_top = min(-caps / 2 - mark_height / 2, -text_y1)
    content_bottom = max(-caps / 2 + mark_height / 2, -text_y0)
    padding = PADDING_RATIO * (content_bottom - content_top)
    width = mark_width + gap + (text_x1 - text_x0) + 2 * padding
    height = (content_bottom - content_top) + 2 * padding
    origin_x, origin_y = padding, padding - content_top

    # The mark's ink centre lands on the middle of the cap band, which is where the eye puts it.
    mark_dx = origin_x - mark_x0 * scale
    mark_dy = origin_y - caps / 2 - mark_height / 2 - mark_y0 * scale
    text_dx = origin_x + mark_width + gap - text_x0
    stroke, dot_fill = (MINT if dark else GREEN), LIME
    fill = CREAM if dark else INK

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.1f} {height:.1f}" \
width="{width:.1f}" height="{height:.1f}" role="img" aria-label="{TEXT}">
  <!-- Generated by site/scripts/brand-wordmark.py: the logo mark plus "{TEXT}" set in Outfit \
{WEIGHT} and converted to outlines. Edit the script, not this file. -->
  <g transform="translate({mark_dx:.2f} {mark_dy:.2f}) scale({scale:.4f})">
    <g fill="none" stroke="{stroke}" stroke-width="{MARK_STROKE}" stroke-linejoin="round" \
stroke-linecap="round">
      <path d="{MARK_PATHS[0]}"/>
      <path d="{MARK_PATHS[1]}"/>
    </g>
    <circle cx="24" cy="24" r="{DOT_R}" fill="{dot_fill}" stroke="{stroke}" \
stroke-width="{DOT_STROKE}"/>
  </g>
  <g transform="translate({text_dx:.2f} {origin_y:.2f}) scale(1 -1)" fill="{fill}">
    <path d="{text_path}"/>
  </g>
</svg>
'''
    return svg, {'caps': caps, 'mark_height': mark_height, 'gap': gap,
                 'width': width, 'height': height}


def write_png(svg: str, path: Path) -> None:
    try:
        import cairosvg
    except ImportError:
        print('! cairosvg missing; skipping the PNG fallback (SVG files are written)')
        return
    cairosvg.svg2png(bytestring=svg.encode(), write_to=str(path), output_height=PNG_HEIGHT)
    print(f'  {path.relative_to(ROOT)}')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--font-cache', type=Path,
                        default=Path(tempfile.gettempdir()) / '3dviz-fonts',
                        help='where the Outfit TTF is cached (default: the system temp)')
    parser.add_argument('--no-png', action='store_true', help='write the two SVG files only')
    args = parser.parse_args()

    font = load_instance(resolve_font_file(args.font_cache))
    text_path, text_bounds = draw_text(font)
    caps = cap_height(font)
    BRAND.mkdir(parents=True, exist_ok=True)

    light, measures = compose(text_path, text_bounds, caps, dark=False)
    dark, _ = compose(text_path, text_bounds, caps, dark=True)
    for name, content in (('wordmark.svg', light), ('wordmark-dark.svg', dark)):
        (BRAND / name).write_text(content)
        print(f'  docs/brand/{name}')
    if not args.no_png:
        write_png(light, BRAND / 'wordmark.png')
    units = font['head'].unitsPerEm
    print(f'cap height {measures["caps"]:.0f}/{units} units · mark {measures["mark_height"]:.0f} '
          f'({MARK_HEIGHT_CAPS} caps) · gap {measures["gap"]:.0f} ({GAP_CAPS} caps) · '
          f'viewBox {measures["width"]:.0f}x{measures["height"]:.0f}')


if __name__ == '__main__':
    main()
