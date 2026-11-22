#!/usr/bin/env python3
"""Produce every image and clip the landing page shows, plus a sha256 manifest of the lot.

Stages: --stills --clips --keyart --origin (default: all four). --hero delegates to
hero-posters.py, which shoots the site's own ?poster= route from a served site build.
--clips records one hover loop per study (a study that does not animate is orbit-dragged).
Stills and clips drive the built examples in headless Chromium on the platform's ANGLE backend
(see site_media_capture.py), so a software-rendered run cannot pass unnoticed. Pass --python (or
set PLAYWRIGHT_PYTHON) to re-exec on an interpreter that has Playwright. No network: the examples
build is served on loopback only.

Exit codes: 0 ok · 2 usage · 3 Playwright missing · 4 a scene never became ready ·
5 a still was flagged unusable · 6 a byte budget or a count was missed ·
7 the frames were drawn in software (--allow-software accepts them anyway).
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import site_media_capture as cap  # noqa: E402  (sibling imports, valid once sys.path is set)
import site_media_encode as enc   # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
MEDIA, SHOWCASE, DEMOS = ROOT / 'site/public/media', ROOT / 'docs/demos/showcase', ROOT / 'docs/demos'
ORIGIN_GIF, ORIGIN_PREVIEW = DEMOS / 'harness-village.gif', DEMOS / 'harness-village-preview.jpg'
ORIGIN_PROVENANCE = {'note': 'author-supplied recording predating the skill; not a benchmark; '
                             'see docs/demos/README.md',
                     'rights': 'redistribution to confirm with the license'}
STAGES = ('stills', 'clips', 'keyart', 'origin')


def repo_relative(part):
    """One argv token with any path inside the checkout rewritten repo-relative, so a committed
    manifest records the command without the machine's home or checkout directory."""
    text = str(part)
    if not text.startswith('/'):
        return text
    try:
        return Path(text).resolve().relative_to(ROOT).as_posix()
    except ValueError:                      # a tool or input outside the checkout: keep as given
        return text


def item(record, **extra):
    """One manifest entry: what it is, what made it, and what it hashes to."""
    path = Path(record['path'])
    data = path.read_bytes()
    known = {'path', 'source', 'argv', 'bytes'}   # recomputed above from the file on disk
    return {'path': str(path.resolve().relative_to(ROOT)), 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest(), 'source': str(record['source']),
            'argv': [repo_relative(part) for part in record['argv']],
            **{key: value for key, value in record.items() if key not in known}, **extra}


def relative_source(record):
    """ffmpeg stages carry an absolute input path; the manifest records it repo-relative."""
    return {**record, 'source': Path(record['source']).relative_to(ROOT)}


def planned_commands(wanted):
    """Every ffmpeg argv the requested stages would run, with a placeholder clip recording."""
    plans = []
    if 'clips' in wanted:
        plans += [enc.clip_pair(Path('<recording>.webm'), MEDIA / 'clips', clip_id, True)
                  for clip_id in cap.CLIP_IDS]
    if 'keyart' in wanted:
        plans.append(enc.keyart_stage(SHOWCASE, MEDIA / 'keyart', True))
    if 'origin' in wanted:
        plans.append(enc.origin_stage(ORIGIN_GIF, ORIGIN_PREVIEW, MEDIA / 'origin', True))
    return [[repo_relative(part) for part in entry['argv']] for plan in plans for entry in plan]


def ffmpeg_stages(wanted):
    """The stages that need no browser, in manifest order."""
    entries = []
    if 'keyart' in wanted:
        entries += [item(relative_source(record))
                    for record in enc.keyart_stage(SHOWCASE, MEDIA / 'keyart')]
    if 'origin' in wanted:
        entries += [item(relative_source(record), **ORIGIN_PROVENANCE)
                    for record in enc.origin_stage(ORIGIN_GIF, ORIGIN_PREVIEW, MEDIA / 'origin')]
    return entries


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    for stage in STAGES:
        parser.add_argument(f'--{stage}', action='store_true')
    parser.add_argument('--hero', action='store_true',
                        help='shoot the three hero posters; runs hero-posters.py against the '
                             '--url site build (not the examples build the other stages serve)')
    parser.add_argument('--url', help='already running preview, e.g. http://127.0.0.1:4180/')
    parser.add_argument('--examples-out', default=str(ROOT / 'examples' / 'dist'),
                        help='built examples directory to serve')
    parser.add_argument('--python', default=os.environ.get('PLAYWRIGHT_PYTHON'),
                        help='interpreter that has Playwright; this script re-execs on it')
    parser.add_argument('--print-commands', action='store_true',
                        help='print the planned ffmpeg argv lists and exit without running')
    parser.add_argument('--allow-software', action='store_true',
                        help='keep frames a software renderer drew instead of failing')
    return parser.parse_args(argv)


def without_python_flag(raw):
    """The original argv minus --python and its value, so the re-exec cannot loop."""
    kept, drop_next = [], False
    for arg in raw:
        drop, drop_next = drop_next or arg.startswith('--python'), arg == '--python'
        if not drop:
            kept.append(arg)
    return kept


STAGE_DIRS = {'examples': 'stills', 'clips': 'clips', 'keyart': 'keyart', 'origin': 'origin'}


def previous_manifest():
    try:
        return json.loads((MEDIA / 'media-manifest.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {'items': []}


def carried_over(wanted):
    """Items from a previous run whose stage this run did not rebuild; a partial run must not
    truncate the manifest into a claim that the other artifacts do not exist."""
    kept = [entry for entry in previous_manifest().get('items', [])
            if STAGE_DIRS.get(Path(entry['path']).parent.name) not in wanted
            and (ROOT / entry['path']).is_file()]
    return kept


def write_manifest(manifest, entries, wanted):
    kept = carried_over(wanted)
    if kept and manifest['capture_mode'] == 'unknown':
        # The carried stills and clips were drawn by the renderer the earlier run observed.
        previous = previous_manifest()
        manifest.update(renderer=previous.get('renderer'),
                        capture_mode=previous.get('capture_mode', 'unknown'))
    manifest['carried_over'] = sorted(entry['path'] for entry in kept)
    manifest['items'] = sorted(entries + kept, key=lambda entry: entry['path'])
    MEDIA.mkdir(parents=True, exist_ok=True)
    (MEDIA / 'media-manifest.json').write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    total = sum(entry['bytes'] for entry in manifest['items'])
    print(f'{len(manifest["items"])} artifacts, {total / 1048576:.2f} MiB, capture_mode '
          f'{manifest["capture_mode"]} ({manifest["renderer"] or "not probed"})')


def run_hero(args, other_stages):
    """Posters come from the site's own ?poster= route, so this stage is a different browser job
    against a different server: hero-posters.py owns it and this flag only forwards to it. The
    interpreter is already the one --python selected, because main() re-execs before we get here."""
    if other_stages:
        print('--hero runs on its own: it needs a served site build, while the other stages serve '
              'the examples build', file=sys.stderr)
        return 2
    if not args.url:
        print('--hero needs --url pointing at a served site build, e.g. '
              'http://127.0.0.1:4190/ after `pnpm --dir site preview`', file=sys.stderr)
        return 2
    argv = [sys.executable, str(Path(__file__).resolve().parent / 'hero-posters.py'), '--url', args.url]
    if args.allow_software:
        argv.append('--allow-software')
    return subprocess.call(argv)


def main(argv=None):
    args = parse_args(argv)
    raw = list(sys.argv[1:] if argv is None else argv)
    if args.python and Path(args.python).resolve() != Path(sys.executable).resolve():
        os.execv(args.python, [args.python, str(Path(__file__).resolve()), *without_python_flag(raw)])
    wanted = {stage for stage in STAGES if getattr(args, stage)}
    if args.hero:
        return run_hero(args, wanted)
    wanted = wanted or set(STAGES)
    manifest = {'generated_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                'ffmpeg_version': 'unknown', 'renderer': None, 'capture_mode': 'unknown',
                'stages': sorted(wanted), 'playwright_version': cap.capture.playwright_version(),
                'items': []}
    try:
        manifest['ffmpeg_version'] = enc.version()
        if args.print_commands:
            print(json.dumps(planned_commands(wanted), indent=2))
            return 0
        entries = ffmpeg_stages(wanted)
        if wanted & {'stills', 'clips'}:
            result = cap.run_stages(args, wanted, MEDIA)
            manifest.update(renderer=result['renderer'], capture_mode=result['capture_mode'])
            entries += [item(record) for record in result['records']]
    except (cap.StageError, enc.EncodeError) as error:
        print(str(error), file=sys.stderr)
        return error.code if isinstance(error, cap.StageError) else 6
    shot = len([entry for entry in entries if '/media/examples/' in entry['path']])
    if 'stills' in wanted and shot != len(cap.example_ids()):
        print(f'{shot} stills for {len(cap.example_ids())} example directories', file=sys.stderr)
        return 6
    write_manifest(manifest, entries, wanted)
    return 0


if __name__ == '__main__':
    sys.exit(main())
