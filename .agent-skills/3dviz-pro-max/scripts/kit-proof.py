#!/usr/bin/env python3
"""Turn one blueprint record into four real captures, a proof log and a check-run event.

It records what headless Chromium drew. It never judges whether the blueprint looks good:
that judgement belongs to a person looking at the four PNGs it writes.
exit codes: 0 ok · 2 usage · 3 playwright or three tree missing · 4 ready-flag timeout
            5 two view captures are byte-identical (the framing collapsed, or with
              --motion-check the blueprint never moved)
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from blueprint_validation import SKILL, asset_ref, validate_blueprint  # noqa: E402
from kit_proof_harness import (INSTALL_HINT, build_scratch, find_three, node_check,  # noqa: E402
                               surface_settings, three_version)

VIEWS = ('far', 'mid', 'close', 'detail')
CHANGE_ID = 'kits-blueprints'
TIER_CHANGE_ID = 'kits-quality-tiers'
PROOF_TIERS = ('T0', 'T1', 'T2', 'T3')


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


capture = load_module(ROOT / SKILL / 'scripts/capture.py', 'scene_capture')


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--record', help='blueprint record ID')
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--three-dir', help='installed three tree to vendor from')
    parser.add_argument('--scratch', help='scratch directory; temporary by default')
    parser.add_argument('--tier', choices=PROOF_TIERS, default='T1',
                        help='quality tier to build and capture. T1 (default) is the record\'s own '
                             'module and keeps today\'s output directory, check id and change id; '
                             'any other tier writes evidence/kits/<id>/<tier>/ and its own log.')
    parser.add_argument('--change-id', default=None,
                        help=f'evidence change id (default: {CHANGE_ID} at T1, '
                             f'{TIER_CHANGE_ID} otherwise)')
    parser.add_argument('--actor', default='kit-proof')
    parser.add_argument('--width', type=int, default=1280)
    parser.add_argument('--height', type=int, default=720)
    parser.add_argument('--timeout-s', type=int, default=60)
    parser.add_argument('--settle-ms', type=int, default=350)
    parser.add_argument('--motion-check', type=int, default=0, metavar='MS',
                        help='for a blueprint exposing animate(dt): re-shoot the close view '
                             'after advancing MS of simulated time, writing close-motion.png '
                             '(0 = off). The advance is in fixed 1/60 s steps, so it is '
                             'reproducible; a frozen blueprint exits 5.')
    parser.add_argument('--gpu', action='store_true',
                        help="launch chromium on the platform's ANGLE backend (capture.py's "
                             'shared launcher); the observed renderer is logged either way')
    parser.add_argument('--check-tag', default='', metavar='TAG',
                        help='suffix for the check id (lowercase), so a re-proof of an unchanged '
                             'record after a kit fix gets its own event instead of a duplicate id')
    parser.add_argument('--no-evidence', action='store_true', help='skip the check-run event')
    parser.add_argument('--syntax-only', action='store_true', help='node --check the kits')
    return parser.parse_args(argv)


def pick_record(root, record_id):
    """Read the record through the installed-catalog loader, then check its blueprint shape.

    The contract loader would refuse the record until its captures exist, which is exactly the
    state a first proof run starts from; `root=None` runs every structural check but no
    filesystem check, so a malformed asset path still cannot reach the scratch directory.
    """
    sys.path.insert(0, str(root / SKILL / 'scripts'))
    from catalog import load_catalog
    _, records, _ = load_catalog(root / SKILL, collection='knowledge')
    by_id = {row['id']: row for row in records}
    if record_id not in by_id:
        raise ValueError(f'{record_id}: unknown knowledge record')
    record = by_id[record_id]
    if record.get('knowledge_kind') != 'blueprint':
        raise ValueError(f'{record_id}: not a blueprint record')
    validate_blueprint(record, by_id, None)
    return record


def show(page, name, settle_ms):
    applied = page.evaluate('n => Boolean(window.__viewer && window.__viewer.setView(n))', name)
    if not applied:
        raise ValueError(f'harness has no view named {name}')
    page.wait_for_timeout(settle_ms)


def shoot_views(page, out, settle_ms):
    """Drive the viewer contract through the four named views. Returns the capture entries."""
    entries = {}
    for name in VIEWS:
        show(page, name, settle_ms)
        entries[name] = capture.shoot(page, out, name, False)
    return entries


def shoot_motion(page, out, settle_ms, motion_ms, before):
    """Re-shoot the close view after `motion_ms` of simulated time, the way capture.py does.

    The advance runs through window.__kitAdvance in fixed 1/60 s steps rather than on the wall
    clock, so close-motion.png is as reproducible as the still it is compared against. Returns
    (entry, motion) or (None, None) when the blueprint exposes no animate(dt).
    """
    if not page.evaluate('window.__kitInfo?.animated === true'):
        return None, None
    show(page, 'close', settle_ms)
    moved = page.evaluate('s => Boolean(window.__kitAdvance(s))', motion_ms / 1000)
    page.wait_for_timeout(settle_ms)
    after = capture.shoot(page, out, 'close-motion', False)
    return after, {'interval_ms': motion_ms, 'simulated': True, 'animate_returned': moved,
                   'differs': before['sha256'] != after['sha256'],
                   'sha_before': before['sha256'], 'sha_after': after['sha256']}


def run_browser(args, url, out, log):
    """Open the served harness, wait for the ready flag and capture. Returns an exit code."""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as driver:
        # One launcher with capture.py: a private copy is how the two drifted apart before.
        browser = capture.launch_chromium(driver, gpu=args.gpu)
        page = browser.new_page(viewport={'width': args.width, 'height': args.height})
        page.on('console', lambda m: m.type == 'error' and log['console_errors'].append(m.text))
        page.on('pageerror', lambda e: log['page_errors'].append(str(e)))
        try:
            page.goto(url, timeout=args.timeout_s * 1000)
            log['webgl_renderer'] = capture.read_renderer(page)
            log['capture_mode'] = capture.capture_mode(log['webgl_renderer'])
            try:
                page.wait_for_function('window.__sceneReady === true',
                                       timeout=args.timeout_s * 1000)
            except Exception:
                return 4
            page.wait_for_timeout(args.settle_ms)
            log['kit'] = page.evaluate('window.__kitInfo ?? null')
            entries = shoot_views(page, out, args.settle_ms)
            if args.motion_check:
                moved, log['motion'] = shoot_motion(page, out, args.settle_ms,
                                                    args.motion_check, entries['close'])
                if moved is not None:
                    entries['close-motion'] = moved
            log['captures'] = {entry['file']: entry['sha256'] for entry in entries.values()}
        finally:
            browser.close()
    return 0


def append_check_run(args, record, log_path):
    """One helper builds both artifact strings, so the curated pass can never cite a different one."""
    slug = record['id'].split('.')[-1].replace('blueprint-', '')
    # A per-tier check id, or a second tier's run would silently replace the first tier's event.
    suffix = '' if args.tier == 'T1' else f'.{args.tier.lower()}'   # IDs are lowercase
    if args.check_tag:
        suffix += f'.{args.check_tag.lower()}'
    command = [sys.executable, str(ROOT / 'scripts/evidence-log.py'), 'check-run',
               '--root', str(args.root), '--change-id', args.change_id, '--record', record['id'],
               '--actor', args.actor, '--actor-kind', 'tool',
               '--check-id', f'kit-proof.{slug}{suffix}.r{record["revision"]}',
               '--method', 'visual',
               '--status', 'passed', '--artifact', asset_ref(record),
               '--output', log_path.relative_to(args.root).as_posix(),
               '--observed-by', 'headless chromium via scripts/kit-proof.py',
               '--observed-result', ', '.join(f'{name}.png' for name in VIEWS)
                                    + ' written at four distinct distances from the record footprint',
               '--summary', f'Captured {record["id"]} at four distances at tier {args.tier} '
                            'with the kit harness.']
    return subprocess.run(command, cwd=ROOT).returncode


def main(argv=None):
    args = parse_args(argv)
    args.change_id = args.change_id or (CHANGE_ID if args.tier == 'T1' else TIER_CHANGE_ID)
    root = args.root.resolve()
    if args.syntax_only:
        ok, report = node_check(root)
        print(report)
        return 0 if ok is not False else 1
    if not args.record:
        print('Usage: --record is required unless --syntax-only is given', file=sys.stderr)
        return 2
    try:
        record = pick_record(root, args.record)
    except (ValueError, OSError, KeyError) as error:
        print(f'Usage: {error}', file=sys.stderr)
        return 2
    three_dir = find_three(root, args.three_dir)
    if three_dir is None:
        print(f'No installed three tree to vendor from. {INSTALL_HINT}', file=sys.stderr)
        return 3
    try:
        from playwright.sync_api import sync_playwright  # noqa: F401
    except ImportError:
        print(f'Playwright is not available. {capture.INSTALL_HINT}', file=sys.stderr)
        return 3
    params = {p['name']: p['default'] for p in record['params']}
    # T1 keeps today's directory so no existing proof log or evidence event moves; every other
    # tier captures into its own, with its own proof-log.json beside its own PNGs.
    out = root / f'evidence/kits/{record["id"]}'
    if args.tier != 'T1':
        out = out / args.tier
    out.mkdir(parents=True, exist_ok=True)
    asset_file = root / SKILL / record['asset']['path']
    log = {'schema_version': 1, 'blueprint_id': record['id'], 'record_revision': record['revision'],
           'asset': record['asset']['path'],
           'asset_sha256': hashlib.sha256(asset_file.read_bytes()).hexdigest(),
           'params': params, 'tier': args.tier, 'kit': None, 'captures': {}, 'motion': None,
           'gpu_requested': args.gpu, 'capture_mode': 'unknown', 'webgl_renderer': None,
           'versions': {'three': three_version(three_dir), 'postprocessing': 'not used',
                        'playwright': capture.playwright_version()},
           'renderer': (f'headless chromium, {args.width}x{args.height}, sRGB output, '
                        'ACESFilmic tone mapping, exposure 1.0, PCF soft shadows, no post'),
           'console_errors': [], 'page_errors': [],
           'started': capture.now(), 'finished': None}
    # T2 draws its surface at build time, so the settings it drew with are part of the proof.
    surface = surface_settings(record) if args.tier == 'T2' else None
    if surface is not None:
        log['surface'] = surface
    holder = tempfile.TemporaryDirectory() if not args.scratch else None
    scratch = build_scratch(root, args.scratch or holder.name, record,
                            json.dumps(params, separators=(',', ':')), three_dir,
                            args.tier, surface)
    url, server = capture.serve(scratch)
    try:
        status = run_browser(args, url, out, log)
    finally:
        server.shutdown()
        server.server_close()
        if holder is not None:
            holder.cleanup()
    log['finished'] = capture.now()
    log_path = out / 'proof-log.json'
    log_path.write_text(json.dumps(log, indent=2) + '\n', encoding='utf-8')
    if status == 4:
        print('window.__sceneReady never became true; harness errors follow', file=sys.stderr)
        for line in log['console_errors'] + log['page_errors']:
            print(f'  {line}', file=sys.stderr)
        return 4
    if log['console_errors'] or log['page_errors']:
        print(f'{len(log["console_errors"] + log["page_errors"])} browser errors; see {log_path}',
              file=sys.stderr)
        return 1
    if log['motion'] and not log['motion']['differs']:
        print(f'close.png and close-motion.png are identical after {args.motion_check} ms of '
              'simulated time; the blueprint is frozen', file=sys.stderr)
        return 5
    digests = list(log['captures'].values())
    if len(set(digests)) != len(digests):
        print('Two view captures are byte-identical; the framing collapsed', file=sys.stderr)
        return 5
    print(f'{len(digests)} captures and proof-log.json in {out.relative_to(root)}; '
          f'capture_mode {log["capture_mode"]}, '
          f'{log["kit"]["triangles"]} triangles, distances '
          f'{json.dumps(log["kit"]["view_distances_m"])}'
          + (f', motion {json.dumps(log["motion"])}' if log['motion'] else ''))
    return 0 if args.no_evidence else append_check_run(args, record, log_path)


if __name__ == '__main__':
    sys.exit(main())
