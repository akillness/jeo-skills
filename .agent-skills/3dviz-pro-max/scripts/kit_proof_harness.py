"""Assemble the offline blueprint proof harness: no bundler, no network, no install.

The harness is served, not built. Chromium resolves `three` through an import map, every kit
module is already plain ESM, and `capture.serve` already ships a loopback static server — so a
proof run is a directory copy plus four screenshots. This module owns the copying and the
`node --check` pass; `scripts/kit-proof.py` owns the browser and the evidence.
"""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

SKILL = 'skills/3dviz-pro-max'
KITS = f'{SKILL}/templates/kits'
INJECT = '<!-- kit-proof:inject -->'
HARNESS_SRC = 'src="./main.js"'
HARNESS_DST = 'src="./kits/_harness/main.js"'
# Export mode swaps the viewer module for the exporter one; the generated <head> is identical.
EXPORT_DST = 'src="./kits/_harness/export-glb.js"'
IMPORT_MAP = ('<script type="importmap">\n'
              '{"imports": {"three": "./vendor/three/build/three.module.js",\n'
              '             "three/addons/": "./vendor/three/examples/jsm/"}}\n'
              '</script>')
VENDOR_FILES = ('examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/utils/BufferGeometryUtils.js',
                'examples/jsm/exporters/GLTFExporter.js')
INSTALL_HINT = 'Install: (cd examples && pnpm install)'


def find_three(root, explicit=None):
    """Locate Three.js from the shared examples package, or from an explicit package tree."""
    if explicit is not None:
        return Path(explicit) if (Path(explicit) / 'build/three.module.js').is_file() else None
    candidate = root / 'examples/node_modules/three'
    return candidate if (candidate / 'build/three.module.js').is_file() else None


def three_version(three_dir):
    try:
        return json.loads((three_dir / 'package.json').read_text(encoding='utf-8'))['version']
    except (OSError, ValueError, KeyError):
        return 'unknown'


def kit_modules(root):
    """Every JavaScript file shipped under templates/kits, in a stable order."""
    return sorted((root / KITS).rglob('*.js'))


def node_check(root):
    """Parse every kit module with node. Returns (ok, report); ok is None when node is absent."""
    node = shutil.which('node')
    if node is None:
        return None, 'node is not on PATH; syntax check skipped'
    failures = []
    for path in kit_modules(root):
        result = subprocess.run([node, '--check', str(path)], capture_output=True, text=True)
        if result.returncode != 0:
            failures.append(f'{path.relative_to(root)}: {result.stderr.strip().splitlines()[0]}')
    if failures:
        return False, '\n'.join(failures)
    return True, f'{len(kit_modules(root))} kit modules parse'


def tier_asset(record, tier):
    """The asset one tier builds from, and the path the harness loads it through.

    T0/T1/T2 build the record's own module. A tier that ships its own glTF file (T3) is served
    as the `.glb` itself: the harness loads a file asset through GLTFLoader, while `buildKit` -
    the module branch - calls its factory synchronously and a glTF wrapper's `create()` returns
    a Promise. A project still imports the sibling `.js` wrapper, which is the path `resolve.py`
    puts in the call snippet; the two agree because the wrapper only loads this same file.
    """
    asset = ((record.get('tiers') or {}).get(tier) or {}).get('asset') or record['asset']
    return asset, '../' + asset['path'].split('templates/kits/', 1)[1]


def surface_settings(record):
    """The T2 build settings a proof runs with: the record's colour map, seed and AO numbers."""
    tier = (record.get('tiers') or {}).get('T2') or {}
    ao = tier.get('ao') or {}
    seed = next((p['default'] for p in record.get('params') or []
                 if p.get('name') == 'seed'), 1)
    return {'families': tier.get('families') or {}, 'seed': seed,
            'size': (tier.get('texture_budget') or {}).get('resolution', 1024),
            'ao': {'samples': ao.get('samples', 13), 'radius_m': ao.get('radius_m', 0.45),
                   'ground_dirt_m': ao.get('ground_dirt_m', 0.6)}}


def harness_page(root, record, params, tier='T1', surface=None):
    """The served index.html: the template with its import map and the record's meta tags."""
    source = (root / KITS / '_harness/index.html').read_text(encoding='utf-8')
    if INJECT not in source or HARNESS_SRC not in source:
        raise ValueError('harness index.html lost its injection marker or module script')
    asset, module = tier_asset(record, tier)
    proof = record.get('proof') or {}
    head = [IMPORT_MAP,
            f'<meta name="blueprint" content="{record["id"]}">',
            f'<meta name="module" content="{module}">',
            f'<meta name="factory" content="{asset.get("factory", "create")}">',
            f'<meta name="tier" content="{tier}">',
            f'<meta name="params" content=\'{params}\'>',
            f'<meta name="footprint" content="{record["footprint_m"]}">',
            # capture=1 stops the page advancing animate(dt) on the wall clock, so every named
            # capture is reproducible; the proof advances motion itself through __kitAdvance.
            '<meta name="capture" content="1">']
    if surface is not None:
        # buildKit reads exactly these two names; a tier with no surface settings injects neither.
        head.append(f'<meta name="surface" content=\'{json.dumps(surface, separators=(",", ":"))}\'>')
    if proof.get('detail_socket'):
        head.append(f'<meta name="detail-socket" content="{proof["detail_socket"]}">')
    if proof.get('max_close_m'):
        head.append(f'<meta name="max-close-m" content="{proof["max_close_m"]}">')
    return source.replace(INJECT, '\n    '.join(head)).replace(HARNESS_SRC, HARNESS_DST)


def export_page(root, record, params, tier='T1', surface=None):
    """The same generated page with the exporter module in place of the viewer module."""
    return harness_page(root, record, params, tier, surface).replace(HARNESS_DST, EXPORT_DST)


def build_scratch(root, scratch, record, params, three_dir, tier='T1', surface=None,
                  export_glb=False):
    """Copy the kit tree, vendor three beside it and write the generated page. Returns the dir."""
    scratch = Path(scratch)
    if (scratch / 'kits').exists():
        shutil.rmtree(scratch / 'kits')
    scratch.mkdir(parents=True, exist_ok=True)
    shutil.copytree(root / KITS, scratch / 'kits')
    vendor = scratch / 'vendor/three'
    (vendor / 'build').mkdir(parents=True, exist_ok=True)
    for build_file in sorted((three_dir / 'build').glob('three*.js')):
        shutil.copy2(build_file, vendor / 'build' / build_file.name)
    for relative in VENDOR_FILES:
        target = vendor / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(three_dir / relative, target)
    if not (vendor / 'build/three.module.js').stat().st_size:
        raise ValueError('vendored three build is empty')
    page = (export_page if export_glb else harness_page)(root, record, params, tier, surface)
    (scratch / 'index.html').write_text(page, encoding='utf-8')
    return scratch


def load_record(root, record_id):
    """One blueprint record, read through the installed-catalog loader like kit-proof.py does."""
    sys.path.insert(0, str(root / SKILL / 'scripts'))
    from catalog import load_catalog
    _, records, _ = load_catalog(root / SKILL, collection='knowledge')
    record = next((row for row in records if row['id'] == record_id), None)
    if record is None or record.get('knowledge_kind') != 'blueprint':
        raise ValueError(f'{record_id}: unknown blueprint record')
    return record


def export_glb(root, record, params, out, three_dir, timeout_s=120, tier='T1'):
    """Build the record's module in headless Chromium and write its GLTFExporter output.

    The geometry the Blender hero tier bakes is the geometry the shipped module draws - this is
    the single step that keeps the two from drifting. Returns the page's `__kitExport` summary.
    """
    import base64
    import tempfile
    from playwright.sync_api import sync_playwright
    sys.path.insert(0, str(root / SKILL / 'scripts'))
    import importlib.util
    spec = importlib.util.spec_from_file_location('scene_capture',
                                                  root / SKILL / 'scripts/capture.py')
    capture = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(capture)
    errors = []
    with tempfile.TemporaryDirectory() as holder:
        scratch = build_scratch(root, holder, record, json.dumps(params, separators=(',', ':')),
                                three_dir, tier, None, export_glb=True)
        url, server = capture.serve(scratch)
        try:
            with sync_playwright() as driver:
                browser = driver.chromium.launch(headless=True)
                page = browser.new_page(viewport={'width': 640, 'height': 400})
                page.on('pageerror', lambda e: errors.append(str(e)))
                try:
                    page.goto(url, timeout=timeout_s * 1000)
                    page.wait_for_function('window.__kitExportReady === true',
                                           timeout=timeout_s * 1000)
                    failure = page.evaluate('window.__kitExportError ?? null')
                    if failure:
                        raise ValueError(f'export page failed: {failure}')
                    summary = page.evaluate('window.__kitExport')
                    payload = base64.b64decode(page.evaluate('window.__kitGlb'))
                finally:
                    browser.close()
        finally:
            server.shutdown()
            server.server_close()
    if not payload:
        raise ValueError('the export page produced an empty GLB')
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(payload)
    summary['path'] = str(out)
    summary['page_errors'] = errors
    return summary


def main(argv=None):
    """No arguments: the node syntax pass. `--export-glb PATH --record ID`: the GLB export."""
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--export-glb', metavar='PATH',
                        help='write the record module\'s GLTFExporter output to PATH')
    parser.add_argument('--record', help='blueprint record id (required with --export-glb)')
    parser.add_argument('--params', default=None, help='JSON parameter object')
    parser.add_argument('--tier', default='T1')
    parser.add_argument('--three-dir', default=None)
    parser.add_argument('--timeout-s', type=int, default=120)
    args = parser.parse_args(argv)
    if not args.export_glb:
        ok, report = node_check(root)
        print(report)
        return 0 if ok is not False else 1
    if not args.record:
        print('Usage: --export-glb needs --record', file=sys.stderr)
        return 2
    three_dir = find_three(root, args.three_dir)
    if three_dir is None:
        print(f'No installed three tree to vendor from. {INSTALL_HINT}', file=sys.stderr)
        return 3
    try:
        record = load_record(root, args.record)
        params = (json.loads(args.params) if args.params
                  else {p['name']: p['default'] for p in record['params']})
        summary = export_glb(root, record, params, args.export_glb, three_dir, args.timeout_s,
                             args.tier)
    except ImportError:
        print('Playwright is not available for --export-glb', file=sys.stderr)
        return 3
    except (OSError, ValueError, KeyError) as error:
        print(f'{error}', file=sys.stderr)
        return 1
    print(json.dumps(summary, separators=(',', ':')))
    return 0


if __name__ == '__main__':
    sys.exit(main())
