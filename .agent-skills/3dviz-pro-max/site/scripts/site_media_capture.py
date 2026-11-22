"""Playwright stages of the landing-page media pipeline: the browser, the stills, the studies.

Imported by `site-media.py` (whose own name has a dash). Everything browser-shaped lives here or
in `site_media_clips.py` (the hover-clip stage); `site_media_encode.py` owns ffmpeg. The GPU
launch, the observed renderer and the frame-usability measurement are the skill's own helpers,
loaded by path so the flags can never drift apart.
Stages return plain records ({path, source, argv, ...}); the driver turns them into manifest items.
"""
import importlib.util
import shutil
import subprocess
from pathlib import Path

import site_media_encode as enc

ROOT = Path(__file__).resolve().parents[2]
SKILLS = ROOT / 'skills/3dviz-pro-max/scripts'
# examples/vite.config.js owns this list; the two must agree or the site would link an unbuilt page.
NOT_EXAMPLES = {'art-science-lab', 'dist', 'early-slice', 'node_modules', 'public', 'shared'}
SLOW_IDS = {'heart', 'brain', 'muscle-atlas', 'knee'}   # the 169 MB STL studies need longer
STILL_QUALITY, STILL_CAP = (82, 76, 70), 120 * 1024
FRAME = {'width': 1280, 'height': 720}
SETTLE_MS, MOTION_MS, RECORD_MS = 1000, 900, 5000
INSTALL_HINT = 'Install: pip install playwright && playwright install chromium'


class StageError(RuntimeError):
    """A stage failed; `code` is the process exit code this message belongs to."""

    def __init__(self, message, code):
        super().__init__(message)
        self.code = code


def load_skill(name):
    """Load a capture helper by path: the skill scripts are not an importable package."""
    spec = importlib.util.spec_from_file_location(f'site_media_{name}', SKILLS / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


capture, quality = load_skill('capture'), load_skill('capture_view_quality')


def example_ids(root=ROOT):
    """Every standalone study, from the filesystem: phase 1 cannot depend on phase 2's data."""
    return sorted(entry.name for entry in (root / 'examples').iterdir()
                  if entry.is_dir() and entry.name not in NOT_EXAMPLES
                  and (entry / 'index.html').is_file())


# Every study gets a hover clip; the ids are the directories, never a hand-kept list.
CLIP_IDS = tuple(example_ids())


def timeout_for(example_id):
    return 120 if example_id in SLOW_IDS else 60


def build_examples(out_dir):
    """Build the examples package unless its output is already on disk."""
    pnpm = shutil.which('pnpm')
    if (out_dir / 'index.html').is_file():
        return out_dir
    if pnpm is None:
        raise StageError(f'pnpm is not on PATH; cannot build {ROOT / "examples"}', 6)
    done = subprocess.run([pnpm, 'build'], cwd=ROOT / 'examples', capture_output=True, text=True)
    if done.returncode != 0 or not (out_dir / 'index.html').is_file():
        raise StageError(f'pnpm build failed: {done.stderr.strip()[-300:]}', 6)
    return out_dir


def open_study(page, base, example_id):
    """Load one study in plate mode and settle it on its overview view."""
    timeout_s = timeout_for(example_id)
    page.goto(f'{base}{example_id}/?plate=1', timeout=timeout_s * 1000)
    try:
        page.wait_for_function('window.__sceneReady === true', timeout=timeout_s * 1000)
    except Exception:
        raise StageError(f'{example_id} never reported __sceneReady within {timeout_s}s', 4)
    page.evaluate("window.__viewer && window.__viewer.setView('overview')")
    page.wait_for_timeout(SETTLE_MS)


def shoot_still(page, dst, region):
    """JPEG down the quality ladder until it fits; measured at the quality that shipped."""
    for setting in STILL_QUALITY:
        page.screenshot(path=str(dst), type='jpeg', quality=setting)
        if dst.stat().st_size <= STILL_CAP:
            return setting, quality.measure_png(page, page.screenshot(type='png'), region=region)
    raise StageError(f'{dst.name} is {dst.stat().st_size} bytes at q{STILL_QUALITY[-1]}, '
                     f'over the {STILL_CAP} byte cap', 6)


def stills(browser, base, out_dir):
    """One still per study: plate mode, overview view, settled, measured for usability."""
    out_dir.mkdir(parents=True, exist_ok=True)
    page, records = browser.new_page(viewport=FRAME), []
    try:
        for example_id in example_ids():
            open_study(page, base, example_id)
            dst = out_dir / f'{example_id}.jpg'
            setting, measured = shoot_still(page, dst, quality.canvas_region(page))
            if measured.get('usable') is False:
                raise StageError(f'{example_id}.jpg is {measured["reason"]}', 5)
            records.append({'path': dst, 'source': f'examples/{example_id}/?plate=1',
                            'argv': ['playwright', 'screenshot', 'jpeg', f'q{setting}'],
                            'view': 'overview', 'jpeg_quality': setting, 'view_quality': measured})
    finally:
        page.close()
    return records


def run_stages(args, wanted, media_dir):
    """Probe the renderer, then run the requested browser stages on a loopback server."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise StageError(f'Playwright is not available. {INSTALL_HINT}\n'
                         'Re-run with --python /path/to/interpreter.', 3)
    result, server = {'renderer': None, 'capture_mode': 'unknown', 'records': []}, None
    base = args.url.rstrip('/') + '/' if args.url else None
    try:
        if base is None:
            base, server = capture.serve(build_examples(Path(args.examples_out).resolve()))
        with sync_playwright() as driver:
            browser = capture.launch_chromium(driver, gpu=True)
            try:
                probe = browser.new_page()
                # A real study page, not the build's root: that root is a meta-refresh redirect,
                # and a page mid-navigation has no WebGL2 context to read a renderer from.
                probe.goto(f'{base}{example_ids()[0]}/?plate=1')
                result['renderer'] = capture.read_renderer(probe)
                result['capture_mode'] = capture.capture_mode(result['renderer'])
                probe.close()
                if result['capture_mode'] != 'gpu' and not args.allow_software:
                    raise StageError(f'frames would be drawn by {result["renderer"]}', 7)
                if 'stills' in wanted:
                    result['records'] += stills(browser, base, media_dir / 'examples')
                if 'clips' in wanted:
                    import site_media_clips as clip_stage   # imports this module; keep it here
                    result['records'] += clip_stage.clips(browser, base, media_dir / 'clips')
            finally:
                browser.close()
    finally:
        if server is not None:
            server.shutdown()
            server.server_close()
    return result
