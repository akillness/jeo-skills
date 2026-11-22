#!/usr/bin/env python3
"""Bake one blueprint's T3 hero: kit module -> harness GLB -> Blender -> cached hero GLB.

Absence is data. Blender missing, or a host probe that says so, prints `{"status":"unavailable"}`
and exits 0 - the quality ceiling is then T2 and nothing is faked. A bake that runs past its
time box is killed with its whole process group, its partial output is deleted, and the run
reports `{"status":"timeout"}`, also at exit 0: a time box is a decision, not a crash.

    python3 scripts/hero-tier.py --record knowledge.blueprint-timber-cottage \\
      --params '{"seed":1}' --out /tmp/t3.glb [--timeout-s 120] [--no-hero-tier] [--host host.json]

The cache key is `sha256(module bytes + params + bake settings)[:12]`, so re-running after a
kit edit rebakes and re-running after nothing rebuilds nothing: a second identical run prints
`"cache": "hit"` and never launches Blender.
exit codes: 0 produced, cached, unavailable or timed out · 1 Blender ran and failed · 2 usage
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
ROOT = SKILL.parents[1]                       # repository root; None of it is required to exist
BLENDER_SCRIPT = SKILL / 'templates/kits/blender/export-hero-tier.py'
# The two files that decide what the bake looks like; editing either must invalidate the cache.
PIPELINE = (BLENDER_SCRIPT, SKILL / 'templates/kits/_harness/export-glb.js')
CACHE = '.cache/hero-tier'
NICE = ['nice', '-n', '10']                   # one Blender at a time, always de-prioritised
sys.path.insert(0, str(HERE))
from blender_locate import find_blender      # noqa: E402  (shared with host-probe.py)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'))


def params_hash(module_bytes, params, bake):
    """The cache key: the module that draws it, the parameters, and how it was baked."""
    digest = hashlib.sha256(module_bytes)
    digest.update(canonical(params).encode('utf-8'))
    digest.update(canonical(bake).encode('utf-8'))
    return digest.hexdigest()[:12]


def pipeline_hash():
    """A digest of the scripts that shape the bake, so tuning one rebakes instead of caching."""
    digest = hashlib.sha256()
    for path in PIPELINE:
        digest.update(path.read_bytes() if path.is_file() else path.name.encode('utf-8'))
    return digest.hexdigest()[:12]


def load_record(root, record_id):
    """One blueprint record through the skill's own catalog loader (works installed too)."""
    from catalog import load_catalog
    _, records, _ = load_catalog(root, collection='knowledge')
    record = next((row for row in records if row['id'] == record_id), None)
    if record is None or record.get('knowledge_kind') != 'blueprint':
        raise ValueError(f'{record_id}: unknown blueprint record')
    return record


def check_out_path(out, repo, cache_dir):
    """An output either lands in this repository or in the project's own hero-tier cache."""
    out, roots = Path(out).resolve(), (repo.resolve(), cache_dir.resolve())
    if not any(out == root or root in out.parents for root in roots):
        raise ValueError(f'--out must stay inside {repo} or {cache_dir}, not {out}')
    return out


def blender_from(host_file):
    """The host probe's Blender block when one is given, otherwise a live search."""
    if host_file is None:
        return find_blender()
    found = json.loads(Path(host_file).read_text(encoding='utf-8')).get('blender') or {}
    return {'found': bool(found.get('found')), 'path': found.get('path'),
            'version': found.get('version'), 'source': 'host probe file'}


def export_t1(repo, record_id, params, target, timeout_s):
    """Drive the proof harness to write the module's own geometry as a GLB."""
    harness = repo / 'scripts/kit_proof_harness.py'
    if not harness.is_file():
        raise FileNotFoundError(f'{harness} is not available; pass --t1-glb instead')
    result = subprocess.run([sys.executable, str(harness), '--export-glb', str(target),
                             '--record', record_id, '--params', canonical(params)],
                            cwd=repo, capture_output=True, text=True, timeout=timeout_s,
                            check=False)
    if result.returncode != 0 or not target.is_file():
        raise ValueError(f'harness export failed: {result.stderr.strip().splitlines()[-1:]}')
    return target


def run_blender(binary, source, target, bake, families, timeout_s):
    """One Blender, niced, four threads, killed with its process group when the box expires."""
    command = NICE + [binary, '-b', '--factory-startup', '--python-exit-code', '1',
                      '--threads', '4', '--python', str(BLENDER_SCRIPT), '--',
                      '--in', str(source), '--out', str(target),
                      '--families', canonical(families), '--seed', str(bake['seed']),
                      '--bake-size', str(bake['bake_size']), '--quality', str(bake['quality']),
                      '--ao-samples', str(bake['ao_samples']),
                      '--ao-strength', str(bake['ao_strength']), '--bevel', str(bake['bevel_m'])]
    started = time.time()
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               text=True, start_new_session=True)
    try:
        output, _ = process.communicate(timeout=timeout_s)
    except subprocess.TimeoutExpired:
        os.killpg(os.getpgid(process.pid), signal.SIGKILL)
        process.communicate()
        Path(target).unlink(missing_ok=True)
        return 'timeout', {}, round(time.time() - started, 2)
    seconds = round(time.time() - started, 2)
    if process.returncode != 0 or not Path(target).is_file():
        Path(target).unlink(missing_ok=True)
        return 'failed', {'stderr': output.strip().splitlines()[-6:]}, seconds
    return 'produced', next((json.loads(line[5:]) for line in output.splitlines()
                             if line.startswith('HERO ')), {}), seconds


def parse_args(argv):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--record', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--params', default=None, help='JSON object; record defaults otherwise')
    parser.add_argument('--root', type=Path, default=ROOT, help='repository root')
    parser.add_argument('--skill', type=Path, default=SKILL)
    parser.add_argument('--cache-dir', type=Path, default=None)
    parser.add_argument('--t1-glb', default=None, help='skip the harness and bake this GLB')
    parser.add_argument('--host', default=None, help='host-probe JSON; its blender block wins')
    parser.add_argument('--timeout-s', type=int, default=120)
    parser.add_argument('--bake-size', type=int, default=1024)
    parser.add_argument('--ao-samples', type=int, default=64)
    parser.add_argument('--ao-strength', type=float, default=0.8)
    parser.add_argument('--quality', type=int, default=85)
    parser.add_argument('--bevel', type=float, default=None, help='metres; record default else')
    parser.add_argument('--no-hero-tier', action='store_true', help='opt out; report and stop')
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    repo, skill = Path(args.root), Path(args.skill)
    cache_dir = args.cache_dir or (repo / CACHE)
    sys.path.insert(0, str(skill / 'scripts'))
    try:
        record = load_record(skill, args.record)
        out = check_out_path(args.out, repo, cache_dir)
        params = (json.loads(args.params) if args.params
                  else {p['name']: p['default'] for p in record['params']})
    except (OSError, ValueError, KeyError) as error:
        print(f'Usage: {error}', file=sys.stderr)
        return 2
    summary = {'record': args.record, 'out': str(out), 'cache': 'miss'}
    if args.no_hero_tier:
        print(json.dumps({**summary, 'status': 'skipped',
                          'note': '--no-hero-tier: the ceiling stays at the highest runtime tier'}))
        return 0
    defaults = (record.get('defaults') or {}).get('values') or {}   # bevel width comes from here
    bake = {'bake_size': args.bake_size, 'ao_samples': args.ao_samples,
            'ao_strength': args.ao_strength, 'quality': args.quality,
            'bevel_m': args.bevel if args.bevel is not None else defaults.get('bevel_m', 0.012),
            'seed': int(params.get('seed', 1)), 'pipeline': pipeline_hash()}
    module = skill / record['asset']['path']
    digest = params_hash(module.read_bytes(), params, bake)
    summary.update({'params_hash': digest, 'params': params, 'bake': bake})
    cached = cache_dir / f'{digest}.glb'
    if cached.is_file():
        out.parent.mkdir(parents=True, exist_ok=True)
        if cached.resolve() != out:
            shutil.copy2(cached, out)
        print(json.dumps({**summary, 'status': 'cached', 'cache': 'hit',
                          'bytes': out.stat().st_size, 'seconds': 0.0}))
        return 0
    blender = blender_from(args.host)
    if not blender['found']:
        print(json.dumps({**summary, 'status': 'unavailable', 'blender': None,
                          'note': f'no Blender: {blender["source"]}; the ceiling stays at T2'}))
        return 0
    families = ((record.get('tiers') or {}).get('T2') or {}).get('families') or {}
    with tempfile.TemporaryDirectory() as folder:
        source = Path(args.t1_glb) if args.t1_glb else Path(folder) / 'kit-t1.glb'
        target = Path(folder) / 'hero-t3.glb'
        try:
            if not args.t1_glb:
                export_t1(repo, args.record, params, source, args.timeout_s)
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            print(json.dumps({**summary, 'status': 'unavailable', 'note': str(error)}))
            return 0
        status, detail, seconds = run_blender(blender['path'], source, target, bake, families,
                                              args.timeout_s)
        if status == 'produced':
            cache_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, cached)
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, out)
    summary.update({'status': status, 'seconds': seconds, 'blender': blender['version'],
                    'detail': detail,
                    **({'bytes': out.stat().st_size} if status == 'produced' else {})})
    print(json.dumps(summary))
    return 1 if status == 'failed' else 0


if __name__ == '__main__':
    sys.exit(main())
