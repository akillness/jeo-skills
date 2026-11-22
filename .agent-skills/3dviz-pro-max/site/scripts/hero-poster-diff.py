#!/usr/bin/env python3
"""Prove the live hero frame still matches the shipped posters.

Renders each look through the same `?poster=<look>` route the hero's own scene module drives,
then measures the mean absolute luma difference against the committed jpg and webp. Over
MAX_DIFF_PERCENT the script exits 1: the poster and the frame that crossfades over it have
drifted (usually toneMappingExposure, setPixelRatio or the camera fov/aspect).

Dormant while the hero ships a baked frame: the shipped poster is then a showcase capture, not a
render of `?poster=`, and there is nothing to compare. Kept for when a live look is re-enabled
(HERO_LIVE_LOOK in site/src/hero/hero-looks.ts) and its poster is re-shot from the route.

    site/scripts/hero-poster-diff.py --url http://127.0.0.1:4191/ --python /path/to/python
"""
import argparse
import io
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

import hero_poster_capture as hero

MAX_DIFF_PERCENT = 5.0


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--url', required=True, help='a served site build, e.g. http://127.0.0.1:4191/')
    parser.add_argument('--look', action='append', default=[], help='one look id; repeatable')
    parser.add_argument('--python', help='interpreter that has Playwright; this script re-execs on it')
    parser.add_argument('--max-percent', type=float, default=MAX_DIFF_PERCENT,
                        help=f'fail above this mean luma difference (default {MAX_DIFF_PERCENT})')
    parser.add_argument('--allow-software', action='store_true',
                        help='compare frames a software renderer drew instead of failing')
    return parser.parse_args(argv)


def luma_difference(live_png, poster_path):
    """Mean absolute greyscale difference between two frames, as a percentage of full scale."""
    if not poster_path.is_file():
        raise hero.HeroError(f'{poster_path} is missing; run site/scripts/hero-posters.py first', 2)
    live = Image.open(io.BytesIO(live_png)).convert('L')
    poster = Image.open(poster_path).convert('L')
    if live.size != poster.size:
        raise hero.HeroError(f'{poster_path.name} is {poster.size}, the live frame is {live.size}', 5)
    return ImageStat.Stat(ImageChops.difference(live, poster)).mean[0] / 255 * 100


def compare(page, url, looks, limit):
    """One row per shipped file; returns the rows and the worst percentage seen."""
    rows, worst = [], 0.0
    for look in looks:
        live = hero.render_look(page, url, look)
        for suffix in ('jpg', 'webp'):
            percent = luma_difference(live, hero.MEDIA / f'{look}.{suffix}')
            worst = max(worst, percent)
            rows.append((f'{look}.{suffix}', percent, percent <= limit))
    return rows, worst


def main(argv=None):
    args = parse_args(argv)
    hero.reexec_on(args.python, Path(__file__).resolve(),
                   list(sys.argv[1:] if argv is None else argv))
    try:
        looks = hero.wanted_looks(args.look)
        with hero.poster_page(args.url, args.allow_software) as (page, renderer, mode):
            rows, worst = compare(page, args.url, looks, args.max_percent)
    except hero.HeroError as error:
        print(str(error), file=sys.stderr)
        return error.code
    for name, percent, ok in rows:
        print(f'{name:22} {percent:6.3f} %  {"ok" if ok else "OVER"}')
    print(f'worst {worst:.3f} % against a {args.max_percent:.1f} % limit, capture_mode '
          f'{mode} ({renderer})')
    return 0 if worst <= args.max_percent else 1


if __name__ == '__main__':
    sys.exit(main())
