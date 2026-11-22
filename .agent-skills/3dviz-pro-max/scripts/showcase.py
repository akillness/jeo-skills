"""Render the showcase stills: one Chromium at a time, resumable, inside a wall-clock budget.

No capture logic of its own: it builds each source once, hands one shot at a time to
`skills/3dviz-pro-max/scripts/capture.py` as a subprocess, checks the encoded size and
appends an evidence entry. New runs require an explicit subdirectory of
`docs/demos/showcase/`, so the historical gallery cannot be overwritten. The Playwright
interpreter is never baked in: pass `--python`, set `PLAYWRIGHT_PYTHON`, or run this script with
an interpreter that already has Playwright.
"""
import argparse, hashlib, json, os, re, shutil, subprocess, sys, time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/demos/showcase'
HISTORICAL_MANIFEST, LOG = OUT / 'showcase.json', OUT / 'showcase-log.json'
HISTORICAL_RUN_DIRS = {OUT / 'breadth'}
EXAMPLES = ROOT / 'examples'
SKILL_SCRIPTS, SCRATCH = ROOT / 'skills/3dviz-pro-max/scripts', ROOT / '.cache/showcase'
BUILT = 'dist'                    # vite output directory name, per project
QUALITY_LADDER = (88, 80, 72)     # a shot still over the byte cap at 72 fails, loudly
SHOT_ESTIMATE_S, BUILD_ESTIMATE_S, HARNESS_ESTIMATE_S = 30, 45, 5
REQUIRED = ('id', 'source', 'look', 'caption')
EMPTY_LOG = {'schema_version': 1, 'generated': None, 'host': None, 'versions': {}, 'shots': []}

def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')

def run(command, **kwargs):
    return subprocess.run(command, capture_output=True, text=True, **kwargs)

def example_id(source):
    """Return a validated standalone example ID, or None for a proof-harness source."""
    if not source.startswith('example:'):
        return None
    identifier = source.partition(':')[2]
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', identifier):
        raise ValueError(f'invalid standalone example source {source}')
    return identifier

def harness_parts(source):
    """Return a proof-harness record and supported tier from a fully validated source."""
    match = re.fullmatch(r'harness:(knowledge\.blueprint-[a-z0-9]+(?:-[a-z0-9]+)*)(?:@(T[0-3]))?',
                         source)
    if not match:
        raise ValueError(f'invalid proof-harness source {source}')
    return match.group(1), match.group(2) or 'T1'


def load_manifest(path):
    """Read and validate showcase.json; raises ValueError naming the first problem found."""
    data = json.loads(Path(path).read_text(encoding='utf-8'))
    if (not isinstance(data, dict) or data.get('schema_version') != 1
            or not isinstance(data.get('defaults'), dict)
            or not isinstance(data.get('shots'), list)):
        raise ValueError('showcase.json needs schema_version 1, a defaults object and a shots list')
    seen = set()
    for shot in data['shots']:
        if not isinstance(shot, dict):
            raise ValueError('every showcase shot must be an object')
        missing = [key for key in REQUIRED if not shot.get(key)]
        if missing:
            raise ValueError(f'shot {shot.get("id", "?")} is missing {", ".join(missing)}')
        invalid = [key for key in REQUIRED if not isinstance(shot[key], str)]
        if invalid:
            raise ValueError(f'shot {shot.get("id", "?")} needs string {", ".join(invalid)}')
        if shot['id'] in seen:
            raise ValueError(f'duplicate shot id {shot["id"]}')
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', shot['id']):
            raise ValueError(f'invalid shot id {shot["id"]}')
        seen.add(shot['id'])
        source = shot['source']
        if source.startswith('harness:'):
            harness_parts(source)
        elif example_id(source) is None:
            raise ValueError(f'shot {shot["id"]} has unknown source {shot["source"]}')
    return data

def settings(manifest, shot):
    """The manifest defaults with this shot's own keys on top."""
    merged = dict(manifest['defaults'])
    merged.update({k: v for k, v in shot.items() if k not in ('id', 'source', 'caption')})
    return merged

def environment(python):
    """(host-probe.py output verbatim, pinned versions): evidence names the machine that made it."""
    probe = run([python, str(SKILL_SCRIPTS / 'host-probe.py')])
    try:
        host = json.loads(probe.stdout)
    except ValueError:
        host = {'error': 'host-probe.py produced no JSON', 'stderr': probe.stderr[-300:]}
    try:
        pins = json.loads((EXAMPLES / 'package.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        pins = {}
    pinned = {**pins.get('dependencies', {}), **pins.get('devDependencies', {})}
    playwright = run([python, '-c', 'import importlib.metadata as m;'
                                    'print(m.version("playwright"))']).stdout.strip()
    return host, {'three': pinned.get('three', 'unknown'), 'playwright': playwright or 'unknown',
                  'postprocessing': pinned.get('postprocessing', 'unknown')}

@contextmanager
def run_lock(lock):
    """One showcase run per checkout. The pid file is hidden, so package.py would refuse it."""
    lock.parent.mkdir(parents=True, exist_ok=True)
    try:
        with lock.open('x', encoding='utf-8') as handle:
            handle.write(f'{os.getpid()}\n')
    except FileExistsError:
        try:
            owner = lock.read_text(encoding='utf-8').strip()
        except OSError:
            owner = 'unknown'
        raise RuntimeError(f'{lock} exists (pid {owner}); another showcase run holds the machine')
    try:
        yield
    finally:
        lock.unlink(missing_ok=True)

def node_build(example):
    """Build the multi-page examples package only when this entry's output is missing."""
    built = EXAMPLES / BUILT
    if (built / example / 'index.html').is_file():
        return built
    pnpm = shutil.which('pnpm')
    if pnpm is None:
        raise RuntimeError(f'pnpm is not on PATH; cannot build {EXAMPLES}')
    for step in ('install', 'build'):
        result = run([pnpm, step], cwd=EXAMPLES)
        if result.returncode != 0:
            raise RuntimeError(f'pnpm {step} failed in {EXAMPLES}: {result.stderr[-300:]}')
    if not (built / example / 'index.html').is_file():
        raise RuntimeError(f'{EXAMPLES} produced no {example}/index.html')
    return built

def build_harness(source):
    """`harness:<blueprint-id>[@TIER]` in the offline proof harness, via kit_proof_harness.
    The harness composes exactly one record, so a two-kit shot is a single-kit shot that says so."""
    record_id, tier = harness_parts(source)
    sys.path.insert(0, str(ROOT / 'scripts'))
    import kit_proof_harness as harness
    three = harness.find_three(ROOT)
    if three is None:
        raise RuntimeError(f'no installed three tree to vendor. {harness.INSTALL_HINT}')
    record = harness.load_record(ROOT, record_id)
    params = json.dumps({p['name']: p['default'] for p in record['params']}, separators=(',', ':'))
    surface = harness.surface_settings(record) if tier == 'T2' else None
    return harness.build_scratch(ROOT, SCRATCH / f'{record_id}.{tier.lower()}', record, params,
                                 three, tier, surface)

def source_dir(source, cache):
    """The served directory for a shot's source, built at most once per run."""
    if source not in cache:
        identifier = example_id(source)
        cache[source] = node_build(identifier) if identifier is not None else build_harness(source)
    return cache[source]

def capture(python, built, cfg, quality, staging):
    """One capture.py subprocess: one browser, one view, closed before this returns."""
    view, settle = cfg.get('view'), int(cfg.get('settle_ms', 1200)) + int(cfg.get('motion_ms') or 0)
    command = [python, str(SKILL_SCRIPTS / 'capture.py'), '--dir', str(built), '--gpu',
               '--out', str(staging), '--format', cfg.get('format', 'jpeg'),
               '--quality', str(quality), '--width', str(cfg.get('width', 1920)),
               '--height', str(cfg.get('height', 1080)), '--settle-ms', str(settle),
               '--timeout-s', str(cfg.get('timeout_s', 60)), '--allow-console-errors']
    if cfg.get('page_path'):
        command += ['--path', cfg['page_path']]
    if cfg.get('query'):
        command += ['--query', cfg['query']]
    result = run(command + (['--view', view] if view else []), cwd=ROOT)
    if result.returncode != 0:
        raise RuntimeError(f'capture.py exit {result.returncode}: '
                           f'{(result.stderr or result.stdout).strip()[-300:]}')
    log = json.loads((Path(staging) / 'capture-log.json').read_text(encoding='utf-8'))
    frame = next((v for v in log['views'] if v.get('requested') == view), None) if view else None
    if view and not (frame or {}).get('applied'):
        raise RuntimeError(f'the built page has no view named {view}')
    return Path(staging) / (frame or log['views'][0])['file'], log

def render(python, shot, cfg, built, out_dir, staging, config_sha256=None):
    """Capture one shot down the quality ladder until it fits max_bytes; returns its log entry."""
    started, cap, attempts = time.monotonic(), int(cfg.get('max_bytes', 1048576)), []
    for quality in QUALITY_LADDER:
        shutil.rmtree(staging, ignore_errors=True)
        frame, log = capture(python, built, cfg, quality, staging)
        attempts.append({'quality': quality, 'bytes': frame.stat().st_size})
        if attempts[-1]['bytes'] > cap:
            if cfg.get('format') == 'png':
                break      # PNG is lossless; the quality ladder has nothing to trade away
            continue
        target = (Path(out_dir) / f'{shot["id"]}{frame.suffix}').resolve()
        if target.parent != Path(out_dir).resolve():
            raise RuntimeError(f'shot {shot["id"]} escapes its output directory')
        shutil.copy2(frame, target)
        motion = f', {cfg["motion_ms"]} ms of motion' if cfg.get('motion_ms') else ''
        return {'id': shot['id'], 'file': target.name, 'source': shot['source'], 'attempts': attempts,
                'sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'quality': quality,
                'bytes': attempts[-1]['bytes'], 'seconds': round(time.monotonic() - started, 1),
                'capture_mode': log['capture_mode'], 'webgl_renderer': log['webgl_renderer'],
                'view': cfg.get('view'), 'tiers': shot.get('tiers'), 'look': shot['look'],
                'mood': shot.get('mood'), 'motion_ms': cfg.get('motion_ms'), 'captured': now(),
                'notes': {k: v for k, v in shot.items() if k.endswith('_note')},
                'caption': shot['caption'], 'config_sha256': config_sha256,
                'renderer': f'chromium headless + ANGLE, {cfg.get("width", 1920)}x'
                            f'{cfg.get("height", 1080)}, {cfg.get("format", "jpeg")} q{quality}, '
                            f'{cfg.get("settle_ms", 1200)} ms settle{motion}, page pixel ratio as '
                            f'authored, renderer {log["webgl_renderer"]}'}
    raise RuntimeError(f'{shot["id"]} is {attempts[-1]["bytes"]} bytes at quality '
                       f'{attempts[-1]["quality"]}, over the {cap} byte cap')

def pending(manifest, log, out_dir, only=None, force=False):
    """Shots left to render; a shot is done only when its image and its log entry both exist."""
    done, todo = {s['id']: s for s in log['shots']}, []
    for shot in manifest['shots']:
        suffix = 'png' if settings(manifest, shot).get('format') == 'png' else 'jpg'
        if only and shot['id'] != only:
            continue
        entry = done.get(shot['id'])
        stale = entry is None or entry.get('config_sha256') != shot_fingerprint(manifest, shot)
        if force or stale or not (Path(out_dir) / f'{shot["id"]}.{suffix}').is_file():
            todo.append(shot)
    return todo

def shot_fingerprint(manifest, shot):
    """Bind resumability to the complete authored shot and inherited defaults."""
    payload = {'shot': shot, 'settings': settings(manifest, shot)}
    raw = json.dumps(payload, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()

def read_log(out_dir=OUT):
    try:
        return json.loads((Path(out_dir) / LOG.name).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return json.loads(json.dumps(EMPTY_LOG))

def write_log(log, out_dir):
    log['generated'] = now()
    (Path(out_dir) / LOG.name).write_text(json.dumps(log, indent=2) + '\n', encoding='utf-8')

def resolve_out(raw):
    """`--out` must name a new run directory below the immutable historical gallery."""
    out, base = Path(raw).resolve(), OUT.resolve()   # resolve both: /var and /private/var differ
    if out == base:
        raise ValueError(f'--out must be a subdirectory of {base}; the gallery root is historical')
    if out in {path.resolve() for path in HISTORICAL_RUN_DIRS}:
        raise ValueError(f'--out {out} is reserved for historical artifacts')
    if base not in out.parents:
        raise ValueError(f'--out {out} is outside {base}')
    if out.is_dir() and any(out.iterdir()) and not (out / LOG.name).is_file():
        raise ValueError(f'--out {out} is populated but is not a resumable showcase run')
    return out

def build_cost(sources):
    """Estimate one shared examples build plus one copy for each proof harness source."""
    identifiers = [identifier for source in sources if (identifier := example_id(source)) is not None]
    shared_build = (BUILD_ESTIMATE_S if identifiers and
                    any(not (EXAMPLES / BUILT / identifier / 'index.html').is_file()
                        for identifier in identifiers) else 0)
    harness_copies = sum(example_id(source) is None for source in sources) * HARNESS_ESTIMATE_S
    return shared_build + harness_copies

def dry_run(manifest, todo):
    builds = sorted({shot['source'] for shot in todo})
    print(f'{len(todo)} shot(s) pending of {len(manifest["shots"])}')
    for shot in todo:
        view = settings(manifest, shot).get('view') or 'default'
        print(f'  {shot["id"]:<30} {shot["source"]:<42} view={view:<9} {shot["look"]}')
    estimate = len(todo) * SHOT_ESTIMATE_S + build_cost(builds)
    print(f'builds needed ({len(builds)}): {", ".join(builds) or "none"}\n'
          f'estimate {estimate} s ({estimate / 60:.1f} min) at {SHOT_ESTIMATE_S} s per shot, '
          f'{BUILD_ESTIMATE_S} s per unbuilt vite project, {HARNESS_ESTIMATE_S} s per harness copy')
    return 0

def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', help='manifest for a new standalone-example capture run')
    parser.add_argument('--out', help=f'required new run directory below {OUT}')
    parser.add_argument('--only', metavar='ID', help='render one shot id')
    parser.add_argument('--force', action='store_true', help='re-render shots already done')
    parser.add_argument('--budget-s', type=int, default=1800, help='wall budget; stops cleanly')
    parser.add_argument('--dry-run', action='store_true', help='print the plan and the estimate')
    parser.add_argument('--python', help='interpreter with Playwright; else $PLAYWRIGHT_PYTHON, '
                                         'else this interpreter')
    return parser.parse_args(argv)

def shoot_all(args, manifest, log, out_dir, todo):
    """The strictly sequential render loop, under the lock. Returns the failure messages."""
    python = args.python or os.environ.get('PLAYWRIGHT_PYTHON') or sys.executable
    staging, cache, failures, started = SCRATCH / 'staging', {}, [], time.monotonic()
    with run_lock(SCRATCH / '.run.lock'):
        try:
            log['host'], log['versions'] = environment(python)
            for index, shot in enumerate(todo):
                elapsed = time.monotonic() - started
                if elapsed + SHOT_ESTIMATE_S > args.budget_s:
                    print(f'budget {args.budget_s} s reached after {int(elapsed)} s; '
                          f'{len(todo) - index} shot(s) left. Re-run to resume.')
                    break
                try:
                    built = source_dir(shot['source'], cache)
                    cfg = settings(manifest, shot)
                    identifier = example_id(shot['source'])
                    if identifier is not None:
                        cfg['page_path'] = f'{identifier}/'
                    entry = render(python, shot, cfg, built, out_dir, staging,
                                   shot_fingerprint(manifest, shot))
                except (RuntimeError, OSError, ValueError, KeyError) as error:
                    failures.append(f'{shot["id"]}: {error}')
                    print(f'FAIL {shot["id"]}: {error}', file=sys.stderr)
                    continue
                log['shots'] = [s for s in log['shots'] if s['id'] != entry['id']] + [entry]
                write_log(log, out_dir)
                print(f'{entry["id"]}: {entry["bytes"]} bytes, q{entry["quality"]}, '
                      f'{entry["seconds"]} s, capture_mode {entry["capture_mode"]}')
        finally:
            shutil.rmtree(staging, ignore_errors=True)
    print(f'{len(log["shots"])}/{len(manifest["shots"])} shots logged in {out_dir}, '
          f'{int(time.monotonic() - started)} s this run')
    return failures

def main(argv=None):
    args = parse_args(argv)
    try:
        if not args.manifest or not args.out:
            raise ValueError('--manifest and --out are required for a new capture run')
        out_dir = resolve_out(args.out)
        manifest = load_manifest(args.manifest)
    except (ValueError, OSError) as error:
        print(f'Usage: {error}', file=sys.stderr)
        return 2
    log = read_log(out_dir)
    todo = pending(manifest, log, out_dir, args.only, args.force)
    if args.dry_run:
        return dry_run(manifest, todo)
    out_dir.mkdir(parents=True, exist_ok=True)
    if not todo:
        print(f'nothing to do: {args.only or "every shot"} already rendered and logged')
        return 0
    try:
        failures = shoot_all(args, manifest, log, out_dir, todo)
    except RuntimeError as error:
        print(f'{error}', file=sys.stderr)
        return 1
    write_log(log, out_dir)
    return 1 if failures else 0

if __name__ == '__main__':
    sys.exit(main())
