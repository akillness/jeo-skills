"""Capture screenshots of a locally served scene; records observations, never judges them.

Exit codes: 0 ok · 1 console or page errors · 2 usage · 3 Playwright missing · 4 ready-flag
timeout · 5 --expect-motion on two identical frames · 6 --expect-usable on a view the frame
measurement flagged (near-black, a near-plane wall, or no contrast). Every capture carries its
`view_quality` numbers in capture-log.json whether or not --expect-usable is passed.
"""
import argparse
from datetime import datetime, timezone
from functools import partial
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import os
from pathlib import Path
from pathlib import PurePosixPath
import platform
import re
import sys
from threading import Thread
from urllib.parse import quote

# Loaded by path, the way kit-proof.py loads this module: capture.py is run as a script from
# anywhere, so a plain import of the sibling would not resolve.
_QUALITY_SPEC = importlib.util.spec_from_file_location(
    'scene_capture_view_quality', Path(__file__).resolve().with_name('capture_view_quality.py'))
view_quality = importlib.util.module_from_spec(_QUALITY_SPEC)
_QUALITY_SPEC.loader.exec_module(view_quality)

INSTALL_HINT = 'Install: pip install playwright && playwright install chromium'
VIEWER_VIEWS = 'window.__viewer?.views ?? []'
# One ANGLE backend per platform. Measured on darwin (phase 9B): headless chromium with
# --use-angle=metal reports the real Metal renderer, so --gpu needs no headed browser. The
# Linux and Windows flags are unverified, which is why the observed renderer is always logged:
# a wrong flag shows up as capture_mode 'swiftshader' instead of silently claiming a GPU.
ANGLE_ARGS = {'Darwin': ['--use-angle=metal'],
              'Linux': ['--use-angle=gl', '--ignore-gpu-blocklist'],
              'Windows': ['--use-angle=d3d11']}
# WEBGL_debug_renderer_info is the only way to read the driver string the page actually got.
RENDERER_JS = """() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null;
}"""


def launch_chromium(driver, gpu=False, headless=True):
    """One launcher for capture.py and kit-proof.py, so the two can never drift apart.

    Only ANGLE backend flags are added: no --no-sandbox, no --disable-web-security, no
    remote debugging port."""
    args = ANGLE_ARGS.get(platform.system(), []) if gpu else []
    return driver.chromium.launch(headless=headless, args=args)


def read_renderer(page):
    """The observed WebGL renderer string, or None when the page has no WebGL2 context."""
    try:
        return page.evaluate(RENDERER_JS)
    except Exception:
        return None


def capture_mode(renderer):
    """What actually drew the frame. Software rendering names itself in the renderer string."""
    if not renderer:
        return 'unknown'
    return 'swiftshader' if 'swiftshader' in renderer.lower() else 'gpu'


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dir', dest='directory', help='directory containing index.html to serve on loopback')
    parser.add_argument('--url', help='already running local URL; the only way to reach a non-served page')
    parser.add_argument('--path', default='', metavar='RELATIVE/PAGE/',
                        help='relative URL path below --dir (for multi-page builds)')
    parser.add_argument('--out', default='captures', help='output directory for PNGs and capture-log.json')
    parser.add_argument('--view', action='append', default=[], metavar='NAME',
                        help='named view from the viewer contract; repeatable')
    parser.add_argument('--all-views', action='store_true', help='capture every name in window.__viewer.views')
    parser.add_argument('--click', action='append', default=[], metavar='CSS',
                        help='CSS selector to click and capture after; repeatable')
    parser.add_argument('--width', type=int, default=1280)
    parser.add_argument('--height', type=int, default=720)
    parser.add_argument('--ready-flag', default='__sceneReady',
                        help="window flag awaited before capture, or 'none' for scenes without the contract")
    parser.add_argument('--settle-ms', type=int, default=300, help='wait after each state change')
    parser.add_argument('--motion-check', type=int, default=0, metavar='MS',
                        help='after default.png, wait MS and capture default-motion.png; '
                             'logs whether the two frames differ (0 = off)')
    parser.add_argument('--expect-motion', action='store_true',
                        help='with --motion-check, exit 5 when the two frames are identical')
    parser.add_argument('--expect-usable', action='store_true',
                        help='exit 6 when the default frame or a named view is flagged unusable '
                             '(near-black, a near-plane wall, or no contrast); the view_quality '
                             'numbers are logged either way')
    parser.add_argument('--timeout-s', type=int, default=30)
    parser.add_argument('--allow-console-errors', action='store_true',
                        help='report console errors in the log without failing')
    parser.add_argument('--full-page', action='store_true')
    parser.add_argument('--query', default='', metavar='K=V&K2=V2',
                        help='query string appended to the served --dir URL (e.g. plate=1)')
    parser.add_argument('--gpu', action='store_true',
                        help="launch chromium on the platform's ANGLE backend instead of the "
                             'software renderer; the renderer that actually drew is logged either way')
    parser.add_argument('--format', dest='image_format', choices=('png', 'jpeg'), default='png',
                        help='screenshot encoding (default png; jpeg for large galleries)')
    parser.add_argument('--quality', type=int, default=None, metavar='N',
                        help='JPEG quality 1-100; ignored by --format png')
    return parser.parse_args(argv)


def serve(directory):
    """Serve `directory` on loopback only. Returns (url, server); caller shuts the server down."""
    handler = partial(SimpleHTTPRequestHandler, directory=str(directory))
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    Thread(target=server.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{server.server_port}/', server


def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-') or 'target'


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def playwright_version():
    try:
        from importlib.metadata import version
        return version('playwright')
    except Exception:
        return 'unknown'


def resolve_target(args):
    """Return the URL to open, or raise ValueError describing the usage problem."""
    if bool(args.directory) == bool(args.url):
        raise ValueError('Pass exactly one of --dir or --url')
    if args.url and args.path:
        raise ValueError('--path is only valid with --dir')
    if args.url:
        return None
    directory = Path(args.directory)
    relative = PurePosixPath(args.path)
    if (relative.is_absolute() or '\\' in args.path or '..' in relative.parts
            or '?' in args.path or '#' in args.path):
        raise ValueError('--path must be a relative URL path without traversal, query or fragment')
    page = directory.joinpath(*relative.parts)
    if args.path.endswith('/') or not page.suffix:
        page /= 'index.html'
    if not page.is_file():
        raise ValueError(f'No page for --path {args.path or "/"} in {directory}')
    return directory


def served_url(base, relative='', query=''):
    """Append a validated local page path and query to the loopback server URL."""
    path = quote(relative.lstrip('/'), safe='/')
    url = base + path
    return f'{url}?{query.lstrip("?")}' if query else url


def shoot(page, out, name, full_page, image_format='png', quality=None):
    """Write one image and return its log entry. JPEG takes the optional quality, PNG cannot."""
    path = out / f'{name}.{"jpg" if image_format == "jpeg" else "png"}'
    options = {'path': str(path), 'full_page': full_page, 'type': image_format}
    if image_format == 'jpeg' and quality is not None:
        options['quality'] = quality
    page.screenshot(**options)
    return {'name': name, 'file': path.name,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def shooter(page, args, out):
    """shoot() bound to this run's encoding options, so every call site agrees on them."""
    return partial(shoot, page, out, full_page=args.full_page, image_format=args.image_format,
                   quality=args.quality)


def motion_check(page, args, out, log, before, measure):
    """Re-shoot the default view after --motion-check ms and record whether the frame changed."""
    page.wait_for_timeout(args.motion_check)
    after = shooter(page, args, out)('default-motion')
    after['view_quality'] = measure(after)
    log['views'].append(after)
    log['motion'] = {'interval_ms': args.motion_check,
                     'differs': before['sha256'] != after['sha256'],
                     'sha_before': before['sha256'], 'sha_after': after['sha256']}


def run(page, args, out, log):
    """Drive the page through default, named views and clicks. Returns 0 or 4."""
    page.goto(log['url'], timeout=args.timeout_s * 1000)
    # Read the driver string before the ready wait, so even a scene that never becomes ready
    # says which renderer it failed on.
    log['webgl_renderer'] = read_renderer(page)
    log['capture_mode'] = capture_mode(log['webgl_renderer'])
    if args.ready_flag != 'none':
        try:
            page.wait_for_function(f'window.{args.ready_flag} === true',
                                   timeout=args.timeout_s * 1000)
        except Exception:
            log['ready_timeout'] = True
            return 4
    page.wait_for_timeout(args.settle_ms)
    snap = shooter(page, args, out)
    # One region for the whole run: the scene canvas when the page has exactly one, so the
    # app's side panel is not charged as part of the frame.
    log['measured_region'] = view_quality.canvas_region(page)
    measure = partial(view_quality.for_entry, page, out, args.image_format, args.full_page,
                      region=log['measured_region'])
    default = snap('default')
    default['view_quality'] = measure(default)
    log['views'].append(default)
    if args.motion_check:
        motion_check(page, args, out, log, default, measure)
    names = list(args.view)
    if args.all_views:
        names += [n for n in page.evaluate(VIEWER_VIEWS) if n not in names]
    for name in names:
        applied = page.evaluate('n => Boolean(window.__viewer && window.__viewer.setView(n))', name)
        page.wait_for_timeout(args.settle_ms)
        entry = snap(slug(name))
        entry['requested'] = name
        entry['applied'] = applied
        entry['view_quality'] = measure(entry)
        log['views'].append(entry)
    for index, selector in enumerate(args.click):
        page.click(selector, timeout=args.timeout_s * 1000)
        page.wait_for_timeout(args.settle_ms)
        entry = snap(f'click-{index}-{slug(selector)}')
        log['clicks'].append({'selector': selector, 'file': entry['file'], 'sha256': entry['sha256']})
    return 0


def logged_dir(directory):
    """The served directory as written to the log: relative to the working directory, never an
    absolute machine path, so a committed capture log carries no user or home directory."""
    if directory is None:
        return None
    path = Path(directory).resolve()
    try:
        return PurePosixPath(os.path.relpath(path, Path.cwd().resolve())).as_posix()
    except ValueError:                      # different drive on Windows: keep the name only
        return path.name


def main(argv=None):
    args = parse_args(argv)
    try:
        directory = resolve_target(args)
    except ValueError as error:
        print(f'Usage: {error}', file=sys.stderr)
        return 2
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print(f'Playwright is not available. {INSTALL_HINT}', file=sys.stderr)
        return 3
    server = None
    url = args.url
    if directory is not None:
        url, server = serve(directory)
        url = served_url(url, args.path, args.query)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    log = {'url': url, 'dir': logged_dir(directory),
           'viewport': {'width': args.width, 'height': args.height},
           'ready_flag': args.ready_flag, 'ready_timeout': False, 'motion': None,
           'gpu_requested': args.gpu, 'capture_mode': 'unknown', 'webgl_renderer': None,
           'image_format': args.image_format, 'views': [], 'clicks': [], 'unusable_views': [],
           'view_quality_thresholds': view_quality.THRESHOLDS, 'measured_region': None,
           'console_errors': [], 'page_errors': [], 'started': now(), 'finished': None,
           'playwright_version': playwright_version()}
    try:
        with sync_playwright() as driver:
            browser = launch_chromium(driver, gpu=args.gpu)
            page = browser.new_page(viewport={'width': args.width, 'height': args.height})
            page.on('console', lambda message: message.type == 'error'
                    and log['console_errors'].append(message.text))
            page.on('pageerror', lambda error: log['page_errors'].append(str(error)))
            try:
                status = run(page, args, out, log)
            finally:
                browser.close()
    finally:
        if server is not None:
            server.shutdown()
            server.server_close()
    log['finished'] = now()
    # default-motion is the default view again; gating it would charge the same frame twice.
    log['unusable_views'] = view_quality.unusable(
        [view for view in log['views'] if view['name'] != 'default-motion'])
    (out / 'capture-log.json').write_text(json.dumps(log, indent=2) + '\n')
    errors = log['console_errors'] + log['page_errors']
    if status == 4:
        print(f'Ready flag window.{args.ready_flag} never became true', file=sys.stderr)
        return 4
    if errors and not args.allow_console_errors:
        print(f'{len(errors)} console or page errors; see {out / "capture-log.json"}', file=sys.stderr)
        return 1
    motion = log['motion']
    if motion:
        print(f'motion: {json.dumps(motion)}')
    if motion and args.expect_motion and not motion['differs']:
        print(f'Frames {motion["interval_ms"]} ms apart are identical; the scene is frozen',
              file=sys.stderr)
        return 5
    if log['unusable_views']:
        print('unusable views: ' + json.dumps(
            {view['name']: view['view_quality']['reason'] for view in log['views']
             if view['name'] in log['unusable_views']}), file=sys.stderr)
        if args.expect_usable:
            return 6
    print(f'{len(log["views"])} view captures, {len(log["clicks"])} click captures in {out}; '
          f'capture_mode {log["capture_mode"]} ({log["webgl_renderer"] or "no WebGL2 context"})')
    return status


if __name__ == '__main__':
    sys.exit(main())
