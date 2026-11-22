#!/usr/bin/env python3
"""Write the hero posters: `site/public/media/hero/<look>.{jpg,webp}` plus their manifest.

Two modes, both ending in the same files and the same manifest rows:

* `--from-frame <image>` re-encodes a 1920x1080 frame that is already on disk (the shipped hero
  is a showcase capture of the village kit) with Pillow alone — no browser, no GPU, nothing to
  serve. This is the mode the site ships with.
* `--url http://127.0.0.1:4191/` shoots the site's own `?poster=<look>` route through the skill's
  GPU chromium and waits for `window.__heroReady`; it needs a live look (see HERO_LIVE_LOOK in
  site/src/hero/hero-looks.ts) and is dormant while the hero is a baked frame.

Each poster walks a quality ladder until it fits the byte cap. Only the hero media directory and
`site/public/media/hero-manifest.json` are written; the phase-1 media manifest is never touched.

Nothing here belongs in site-media.py: that script is phase 1's, and this capture needs the site
build rather than the examples build.

    site/scripts/hero-posters.py --from-frame docs/demos/showcase/village-overcast-morning.jpg \
        --look overcast-morning
    site/scripts/hero-posters.py --url http://127.0.0.1:4191/ --python /path/to/python
"""
import argparse
import hashlib
import io
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

import hero_poster_capture as hero

JPEG_LADDER = (84, 78, 72, 66)
WEBP_LADDER = (80, 72, 64)
BYTE_CAP = 250 * 1024
# The baked mode also writes a phone-sized pair: on a throttled 4G phone the 1920-wide poster is
# the LCP and the small file is what `(max-width: 640px)` fetches. Its own ladder goes lower,
# because 80 KiB at 960x540 is a tighter ask than 250 KiB at 1920x1080.
SMALL_WIDTH = 960
SMALL_SUFFIX = f'-{SMALL_WIDTH}'
SMALL_BYTE_CAP = 80 * 1024
SMALL_JPEG_LADDER = (78, 72, 66, 60, 54)
SMALL_WEBP_LADDER = (78, 72, 64, 58)


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--url', help='a served site build, e.g. http://127.0.0.1:4191/')
    parser.add_argument('--from-frame', type=Path,
                        help='encode this image instead of rendering; repo-relative or absolute')
    parser.add_argument('--look', action='append', default=[], help='one look id; repeatable')
    parser.add_argument('--python', help='interpreter that has Playwright; this script re-execs on it')
    parser.add_argument('--allow-software', action='store_true',
                        help='keep frames a software renderer drew instead of failing')
    args = parser.parse_args(argv)
    if bool(args.url) == bool(args.from_frame):
        parser.error('pass exactly one of --url (render a look) or --from-frame (encode a file)')
    return args


def digest(data):
    return hashlib.sha256(data).hexdigest()


def entry(path, extra):
    """One manifest row: repo-relative path, bytes and digest, plus the encoder settings used."""
    data = path.read_bytes()
    return {'path': str(path.relative_to(hero.ROOT)), 'bytes': len(data),
            'sha256': digest(data), **extra}


def encode(frame, dst, fmt, ladder, cap=BYTE_CAP, **options):
    """Save `frame` down a quality ladder until the file fits the cap; return the quality used."""
    for quality in ladder:
        frame.save(dst, fmt, quality=quality, **options)
        if dst.stat().st_size <= cap:
            return quality
    raise hero.HeroError(f'{dst.name} is {dst.stat().st_size} bytes at q{ladder[-1]}, '
                         f'over the {cap} byte cap', 6)


def bake(source, looks):
    """Encode one frame already on disk into both posters of each look. No browser involved."""
    path = source if source.is_absolute() else hero.ROOT / source
    if not path.is_file():
        raise hero.HeroError(f'{source}: no such frame', 2)
    frame = Image.open(path).convert('RGB')
    if frame.size != (hero.FRAME['width'], hero.FRAME['height']):
        raise hero.HeroError(f'{source} is {frame.size[0]}x{frame.size[1]}, not '
                             f'{hero.FRAME["width"]}x{hero.FRAME["height"]}', 5)
    shared = {'source': str(path.relative_to(hero.ROOT)),
              'source_sha256': digest(path.read_bytes())}
    small = frame.resize((SMALL_WIDTH, SMALL_WIDTH * frame.height // frame.width), Image.LANCZOS)
    hero.MEDIA.mkdir(parents=True, exist_ok=True)
    items = []
    for look in looks:
        items += bake_pair(frame, look, '', JPEG_LADDER, WEBP_LADDER, BYTE_CAP, shared)
        items += bake_pair(small, look, SMALL_SUFFIX, SMALL_JPEG_LADDER, SMALL_WEBP_LADDER,
                           SMALL_BYTE_CAP, shared)
    return items


def bake_pair(frame, look, suffix, jpeg_ladder, webp_ladder, cap, shared):
    """The two shipped encodings of one size: `<look><suffix>.jpg` and its webp sibling."""
    size = {'width': frame.width, 'height': frame.height}
    jpg, webp = hero.MEDIA / f'{look}{suffix}.jpg', hero.MEDIA / f'{look}{suffix}.webp'
    quality = encode(frame, jpg, 'JPEG', jpeg_ladder, cap, optimize=True, progressive=True,
                     subsampling=1)
    quality_webp = encode(frame, webp, 'WEBP', webp_ladder, cap, method=6)
    return [entry(jpg, {'look': look, 'encoder': 'pillow-jpeg', 'quality': quality,
                        **size, **shared}),
            entry(webp, {'look': look, 'encoder': 'pillow-webp', 'quality': quality_webp,
                         **size, **shared})]


def write_jpeg(page, dst):
    """Playwright's own JPEG encoder, down the ladder until the frame fits the cap."""
    for quality in JPEG_LADDER:
        page.screenshot(path=str(dst), type='jpeg', quality=quality)
        if dst.stat().st_size <= BYTE_CAP:
            return quality
    raise hero.HeroError(f'{dst.name} is {dst.stat().st_size} bytes at q{JPEG_LADDER[-1]}, '
                         f'over the {BYTE_CAP} byte cap', 6)


def write_webp(png_bytes, dst):
    """Pillow, not ffmpeg: the installed ffmpeg 8.1.2 is built without libwebp."""
    frame = Image.open(io.BytesIO(png_bytes)).convert('RGB')
    return encode(frame, dst, 'WEBP', WEBP_LADDER, method=6)


def shoot(page, url, looks):
    """Render each look once and encode both posters from that same frame."""
    hero.MEDIA.mkdir(parents=True, exist_ok=True)
    items = []
    for look in looks:
        png = hero.render_look(page, url, look)
        source = f'site ?poster={look} at {hero.FRAME["width"]}x{hero.FRAME["height"]}'
        jpg = hero.MEDIA / f'{look}.jpg'
        webp = hero.MEDIA / f'{look}.webp'
        items.append(entry(jpg, {'look': look, 'source': source, 'encoder': 'playwright-jpeg',
                                 'quality': write_jpeg(page, jpg)}))
        items.append(entry(webp, {'look': look, 'source': source, 'encoder': 'pillow-webp',
                                  'quality': write_webp(png, webp)}))
    return items


def write_manifest(manifest, items):
    manifest['items'] = sorted(items, key=lambda item: item['path'])
    hero.MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n',
                             encoding='utf-8')
    for item in manifest['items']:
        print(f'{item["path"]}  {item["bytes"] / 1024:6.1f} KiB  q{item["quality"]}')
    total = sum(item['bytes'] for item in manifest['items'])
    print(f'{len(manifest["items"])} posters, {total / 1024:.1f} KiB, capture_mode '
          f'{manifest["capture_mode"]} ({manifest["renderer"] or "not probed"})')


def main(argv=None):
    args = parse_args(argv)
    hero.reexec_on(args.python, Path(__file__).resolve(),
                   list(sys.argv[1:] if argv is None else argv))
    manifest = {'generated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                'frame': hero.FRAME, 'byte_cap': BYTE_CAP, 'renderer': None,
                'capture_mode': 'unknown', 'playwright_version': hero.capture.playwright_version(),
                'source_url': args.url, 'items': []}
    try:
        looks = hero.wanted_looks(args.look)
        if args.from_frame:
            manifest.update(capture_mode='baked-frame', playwright_version=None)
            items = bake(args.from_frame, looks)
        else:
            with hero.poster_page(args.url, args.allow_software) as (page, renderer, mode):
                manifest.update(renderer=renderer, capture_mode=mode)
                items = shoot(page, args.url, looks)
    except hero.HeroError as error:
        print(str(error), file=sys.stderr)
        return error.code
    write_manifest(manifest, items)
    return 0


if __name__ == '__main__':
    sys.exit(main())
