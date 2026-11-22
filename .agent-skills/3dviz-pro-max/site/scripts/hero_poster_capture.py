"""Shared browser plumbing for the two hero poster scripts (whose own names have dashes).

`hero-posters.py` writes the shipped posters and `hero-poster-diff.py` proves a freshly rendered
frame still matches them; both shoot the *site's own* `?poster=<look>` route through the skill's
GPU chromium launcher, so poster and live frame come from one renderer on one machine. The launch
flags, the observed renderer string and the software-renderer check are the skill's helpers loaded
by path — they must never drift from `skills/3dviz-pro-max/scripts/capture.py`.
"""
import importlib.util
import os
import sys
from contextlib import contextmanager
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKILLS = ROOT / 'skills/3dviz-pro-max/scripts'
MEDIA = ROOT / 'site/public/media/hero'
MANIFEST = ROOT / 'site/public/media/hero-manifest.json'
# Mirrors HERO_LOOK in site/src/hero/hero-looks.ts: the hero has one look, the village kit under
# the overcast mood. It ships as a baked frame (`hero-posters.py --from-frame`); the route helpers
# below are for when a live look is re-enabled (HERO_LIVE_LOOK in hero-looks.ts).
LOOKS = ('overcast-morning',)
FRAME = {'width': 1920, 'height': 1080}
READY_TIMEOUT_MS = 60_000
SETTLE_MS = 250
INSTALL_HINT = ('Playwright is not available. Install it (pip install playwright && playwright '
                'install chromium) or re-run with --python /path/to/interpreter.')


class HeroError(RuntimeError):
    """A stage failed; `code` is the process exit code this message belongs to."""

    def __init__(self, message, code=1):
        super().__init__(message)
        self.code = code


def load_skill(name):
    """Load a capture helper by path: the skill scripts are not an importable package."""
    spec = importlib.util.spec_from_file_location(f'hero_{name}', SKILLS / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


capture = load_skill('capture')


def wanted_looks(selected):
    """Validate the requested look ids against LOOKS; empty means every look."""
    unknown = [look for look in selected if look not in LOOKS]
    if unknown:
        raise HeroError(f'unknown look(s) {", ".join(unknown)}; known: {", ".join(LOOKS)}', 2)
    return tuple(selected) or LOOKS


def reexec_on(python, script, argv):
    """Re-run this script on an interpreter that has Playwright, dropping --python so it cannot loop."""
    if not python or Path(python).resolve() == Path(sys.executable).resolve():
        return
    kept, drop_next = [], False
    for arg in argv:
        drop, drop_next = drop_next or arg.startswith('--python'), arg == '--python'
        if not drop:
            kept.append(arg)
    os.execv(python, [python, str(script), *kept])


@contextmanager
def poster_page(url, allow_software=False):
    """Yield (page, renderer, capture_mode) on one GPU chromium at the poster frame size."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise HeroError(INSTALL_HINT, 3)
    base = url.rstrip('/') + '/'
    with sync_playwright() as driver:
        browser = capture.launch_chromium(driver, gpu=True)
        try:
            page = browser.new_page(viewport=FRAME)
            page.goto(f'{base}?poster={LOOKS[0]}', timeout=READY_TIMEOUT_MS)
            renderer = capture.read_renderer(page)
            mode = capture.capture_mode(renderer)
            if mode != 'gpu' and not allow_software:
                raise HeroError(f'posters would be drawn by {renderer}; pass --allow-software '
                                'only if you mean to ship software-rendered frames', 7)
            yield page, renderer, mode
        finally:
            browser.close()


def render_look(page, url, look):
    """Load one look on the poster route and return the settled frame as PNG bytes."""
    page.goto(f'{url.rstrip("/")}/?poster={look}', timeout=READY_TIMEOUT_MS)
    try:
        page.wait_for_function('window.__heroReady === true', timeout=READY_TIMEOUT_MS)
    except Exception:
        raise HeroError(f'{look} never reported __heroReady within '
                        f'{READY_TIMEOUT_MS // 1000}s', 4)
    page.wait_for_timeout(SETTLE_MS)
    return page.screenshot(type='png')
