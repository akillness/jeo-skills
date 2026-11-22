import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    'scene_capture', ROOT / 'skills/3dviz-pro-max/scripts/capture.py')
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)

PAGE = b'<!doctype html><title>fixture</title><p>fixture</p>\n'
# Two fixtures for the liveness check: one repaints every frame, one never repaints.
MOVING_PAGE = b"""<!doctype html><title>moving</title>
<div id="t" style="font:48px monospace">0</div>
<script>let n = 0;
function tick() { document.getElementById('t').textContent = String(n++); requestAnimationFrame(tick); }
requestAnimationFrame(tick); window.__sceneReady = true;</script>
"""
STILL_PAGE = b"""<!doctype html><title>still</title>
<div id="t" style="font:48px monospace">still</div>
<script>window.__sceneReady = true;</script>
"""
# Three synthetic frames for the view-quality measurement: one the camera could be inside of,
# one with a wall standing across the near plane, one ordinary frame. Each publishes the viewer
# contract with a single named view, so --expect-usable has a named view to charge.
VIEWER = (b'<script>window.__viewer = {views: [\'only\'], setView: () => true};'
          b'window.__sceneReady = true;</script>')
BLACK_PAGE = b'<!doctype html><title>black</title><body style="margin:0;background:#000">' + VIEWER
WALL_PAGE = (b'''<!doctype html><title>wall</title><body style="margin:0;background:#000">
<div style="position:absolute;inset:0;background:linear-gradient(to bottom,#101828 0%,#2c3c58 55%,#5a4530 56%,#241a10 100%)"></div>
<div style="position:absolute;left:8%;top:30%;width:14%;height:45%;background:#6b5535"></div>
<div style="position:absolute;left:34%;top:18%;width:12%;height:30%;background:#8a7a5a"></div>
<div style="position:absolute;right:0;top:0;width:40%;height:100%;background:#e8e0c8"></div>''' + VIEWER)
NORMAL_PAGE = (b'''<!doctype html><title>normal</title><body style="margin:0;background:#000">
<div style="position:absolute;inset:0;background:linear-gradient(to bottom,#2b3550 0%,#46506a 50%,#6b5a3e 52%,#3a2f1e 100%)"></div>
<div style="position:absolute;left:10%;top:40%;width:16%;height:35%;background:#7d6a48"></div>
<div style="position:absolute;left:45%;top:25%;width:18%;height:50%;background:#59636f"></div>
<div style="position:absolute;left:72%;top:45%;width:14%;height:30%;background:#8b7f66"></div>''' + VIEWER)
HAS_PLAYWRIGHT = importlib.util.find_spec('playwright') is not None


class ParseArgsTests(unittest.TestCase):
    def test_defaults(self):
        args = capture.parse_args(['--dir', 'x'])
        self.assertEqual(args.directory, 'x')
        self.assertIsNone(args.url)
        self.assertEqual(args.path, '')
        self.assertEqual(args.out, 'captures')
        self.assertEqual((args.width, args.height), (1280, 720))
        self.assertEqual(args.ready_flag, '__sceneReady')
        self.assertEqual(args.settle_ms, 300)
        self.assertEqual(args.timeout_s, 30)
        self.assertEqual(args.motion_check, 0)
        self.assertFalse(args.expect_motion)
        self.assertFalse(args.expect_usable)
        self.assertEqual((args.view, args.click), ([], []))
        self.assertFalse(args.all_views or args.allow_console_errors or args.full_page)

    def test_render_flags_default_to_the_old_behaviour(self):
        args = capture.parse_args(['--dir', 'x'])
        self.assertFalse(args.gpu)
        self.assertEqual(args.image_format, 'png')
        self.assertIsNone(args.quality)

    def test_gpu_and_encoding_flags_are_read(self):
        args = capture.parse_args(['--dir', 'x', '--gpu', '--format', 'jpeg', '--quality', '70'])
        self.assertTrue(args.gpu)
        self.assertEqual((args.image_format, args.quality), ('jpeg', 70))

    def test_expect_usable_is_read(self):
        self.assertTrue(capture.parse_args(['--dir', 'x', '--expect-usable']).expect_usable)

    def test_motion_check_flags(self):
        args = capture.parse_args(['--dir', 'x', '--motion-check', '2000', '--expect-motion'])
        self.assertEqual(args.motion_check, 2000)
        self.assertTrue(args.expect_motion)

    def test_repeatable_views_and_clicks(self):
        args = capture.parse_args(['--url', 'http://127.0.0.1:4173/', '--view', 'a', '--view', 'b',
                                   '--click', '#one', '--ready-flag', 'none'])
        self.assertEqual(args.view, ['a', 'b'])
        self.assertEqual(args.click, ['#one'])
        self.assertEqual(args.ready_flag, 'none')


class LaunchTests(unittest.TestCase):
    """The one launcher both capture.py and kit-proof.py use."""

    def launch(self, system, **kwargs):
        driver = mock.Mock()
        with mock.patch.object(capture.platform, 'system', return_value=system):
            capture.launch_chromium(driver, **kwargs)
        return driver.chromium.launch.call_args.kwargs

    def test_without_gpu_no_flags_are_added(self):
        self.assertEqual(self.launch('Darwin'), {'headless': True, 'args': []})

    def test_gpu_selects_the_platform_angle_backend(self):
        for system, expected in capture.ANGLE_ARGS.items():
            self.assertEqual(self.launch(system, gpu=True)['args'], expected)

    def test_an_unknown_platform_falls_back_to_the_software_renderer(self):
        self.assertEqual(self.launch('Haiku', gpu=True)['args'], [])

    def test_no_sandbox_or_security_flags_are_ever_passed(self):
        for args in capture.ANGLE_ARGS.values():
            self.assertTrue(all(flag.startswith('--use-angle') or flag == '--ignore-gpu-blocklist'
                                for flag in args), args)

    def test_headless_is_the_default_and_can_be_turned_off(self):
        self.assertTrue(self.launch('Darwin')['headless'])
        self.assertFalse(self.launch('Darwin', headless=False)['headless'])


class CaptureModeTests(unittest.TestCase):
    def test_the_observed_renderer_names_the_mode(self):
        swift = ('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) '
                 '(0x0000C0DE)), SwiftShader driver)')
        metal = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version)'
        self.assertEqual(capture.capture_mode(swift), 'swiftshader')
        self.assertEqual(capture.capture_mode(metal), 'gpu')
        self.assertEqual(capture.capture_mode(None), 'unknown')
        self.assertEqual(capture.capture_mode(''), 'unknown')

    def test_a_page_without_webgl2_is_not_an_error(self):
        page = mock.Mock()
        page.evaluate.side_effect = RuntimeError('no context')
        self.assertIsNone(capture.read_renderer(page))


class ShootTests(unittest.TestCase):
    """shoot() writes what --format asked for; the JPEG quality only reaches a JPEG."""

    class FakePage:
        def __init__(self):
            self.options = None

        def screenshot(self, **options):
            self.options = options
            Path(options['path']).write_bytes(b'fixture-bytes')

    def shoot(self, **kwargs):
        page = self.FakePage()
        with tempfile.TemporaryDirectory() as tmp:
            entry = capture.shoot(page, Path(tmp), 'default', False, **kwargs)
        return page.options, entry

    def test_png_is_the_default_and_carries_no_quality(self):
        options, entry = self.shoot()
        self.assertEqual(entry['file'], 'default.png')
        self.assertEqual(options['type'], 'png')
        self.assertNotIn('quality', options)

    def test_jpeg_changes_the_extension_and_passes_quality_through(self):
        options, entry = self.shoot(image_format='jpeg', quality=70)
        self.assertEqual(entry['file'], 'default.jpg')
        self.assertEqual((options['type'], options['quality']), ('jpeg', 70))

    def test_a_png_never_receives_a_quality(self):
        options, _ = self.shoot(image_format='png', quality=70)
        self.assertNotIn('quality', options)


class ServeTests(unittest.TestCase):
    def test_loopback_server_returns_written_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'index.html').write_bytes(PAGE)
            url, server = capture.serve(tmp)
            try:
                self.assertEqual(url, f'http://127.0.0.1:{server.server_port}/')
                with urllib.request.urlopen(url + 'index.html', timeout=5) as response:
                    self.assertEqual(response.read(), PAGE)
            finally:
                server.shutdown()
                server.server_close()


class ResolveTargetTests(unittest.TestCase):
    def test_url_needs_no_directory(self):
        self.assertIsNone(capture.resolve_target(capture.parse_args(['--url', 'http://127.0.0.1:1/'])))

    def test_both_or_neither_rejected(self):
        for argv in ([], ['--dir', 'x', '--url', 'http://127.0.0.1:1/']):
            with self.assertRaisesRegex(ValueError, 'exactly one'):
                capture.resolve_target(capture.parse_args(argv))

    def test_relative_page_below_served_directory_is_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            page = Path(tmp) / 'heart/index.html'
            page.parent.mkdir()
            page.write_bytes(PAGE)
            args = capture.parse_args(['--dir', tmp, '--path', 'heart/'])
            self.assertEqual(capture.resolve_target(args), Path(tmp))

    def test_missing_or_unsafe_relative_page_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'index.html').write_bytes(PAGE)
            for relative in ('missing/', '../outside/', '/absolute/', 'heart/?mode=bad',
                             'heart/#fragment', 'heart\\index.html'):
                with self.subTest(path=relative), self.assertRaises(ValueError):
                    capture.resolve_target(capture.parse_args(['--dir', tmp, '--path', relative]))

    def test_path_is_refused_with_an_existing_url(self):
        args = capture.parse_args(['--url', 'http://127.0.0.1:1/', '--path', 'heart/'])
        with self.assertRaisesRegex(ValueError, 'only valid with --dir'):
            capture.resolve_target(args)

    def test_served_url_quotes_path_and_appends_query(self):
        self.assertEqual(capture.served_url('http://127.0.0.1:1/', 'a study/', 'plate=1'),
                         'http://127.0.0.1:1/a%20study/?plate=1')


class MainExitCodeTests(unittest.TestCase):
    def test_missing_index_html_is_a_usage_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(capture.main(['--dir', tmp, '--out', tmp]), 2)

    def test_missing_playwright_reports_install_hint(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as out:
            (Path(tmp) / 'index.html').write_bytes(PAGE)
            saved = {name: sys.modules.get(name) for name in ('playwright', 'playwright.sync_api')}
            sys.modules['playwright'] = None
            sys.modules['playwright.sync_api'] = None
            try:
                self.assertEqual(capture.main(['--dir', tmp, '--out', out]), 3)
            finally:
                for name, module in saved.items():
                    if module is None:
                        sys.modules.pop(name, None)
                    else:
                        sys.modules[name] = module
            self.assertFalse((Path(out) / 'capture-log.json').exists())

    def test_install_hint_names_both_steps(self):
        self.assertIn('pip install playwright', capture.INSTALL_HINT)
        self.assertIn('playwright install chromium', capture.INSTALL_HINT)


@unittest.skipUnless(HAS_PLAYWRIGHT, 'Playwright is optional and not installed')
class MotionCheckTests(unittest.TestCase):
    """Two frames 400 ms apart: they must differ for a repainting page and match for a still one."""

    def capture(self, page_bytes):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as out:
            (Path(tmp) / 'index.html').write_bytes(page_bytes)
            status = capture.main(['--dir', tmp, '--out', out, '--motion-check', '400',
                                   '--expect-motion', '--settle-ms', '100'])
            log = json.loads((Path(out) / 'capture-log.json').read_text())
            return status, log, sorted(f.name for f in Path(out).glob('*.png'))

    def test_repainting_page_passes_and_logs_two_hashes(self):
        status, log, pngs = self.capture(MOVING_PAGE)
        self.assertEqual(status, 0)
        self.assertEqual(pngs, ['default-motion.png', 'default.png'])
        self.assertEqual(log['motion']['interval_ms'], 400)
        self.assertTrue(log['motion']['differs'])
        self.assertNotEqual(log['motion']['sha_before'], log['motion']['sha_after'])

    def test_still_page_exits_five(self):
        status, log, _ = self.capture(STILL_PAGE)
        self.assertEqual(status, 5)
        self.assertFalse(log['motion']['differs'])
        self.assertEqual(log['motion']['sha_before'], log['motion']['sha_after'])

    def test_every_run_records_the_renderer_it_actually_used(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as out:
            (Path(tmp) / 'index.html').write_bytes(STILL_PAGE)
            self.assertEqual(capture.main(['--dir', tmp, '--out', out, '--settle-ms', '100']), 0)
            log = json.loads((Path(out) / 'capture-log.json').read_text())
        self.assertFalse(log['gpu_requested'])
        self.assertIn(log['capture_mode'], ('swiftshader', 'gpu'))
        self.assertEqual(log['capture_mode'], capture.capture_mode(log['webgl_renderer']))
        self.assertEqual(log['image_format'], 'png')

    def test_motion_check_off_by_default(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as out:
            (Path(tmp) / 'index.html').write_bytes(STILL_PAGE)
            self.assertEqual(capture.main(['--dir', tmp, '--out', out, '--settle-ms', '100']), 0)
            log = json.loads((Path(out) / 'capture-log.json').read_text())
            self.assertIsNone(log['motion'])


class ViewQualityClassifyTests(unittest.TestCase):
    """The verdict half of the measurement: numbers in, one reason out."""

    quality = capture.view_quality

    def stats(self, **over):
        base = {'luma_mean': 0.30, 'luma_std': 0.12, 'dark_fraction': 0.05,
                'flat_fraction': 0.05, 'flat_luma': 0.50, 'rest_luma': 0.29,
                'wall_fraction': 0.0, 'wall_luma': None, 'wall_rest_luma': None}
        base.update(over)
        return base

    def verdict(self, **over):
        return self.quality.classify(self.stats(**over))

    def test_an_ordinary_frame_is_usable(self):
        self.assertEqual(self.verdict(), (True, 'usable'))

    def test_an_all_black_frame_is_near_black(self):
        self.assertEqual(self.verdict(luma_mean=0.004, luma_std=0.002, dark_fraction=1.0),
                         (False, 'near-black'))

    def test_a_frame_the_camera_is_inside_is_near_black(self):
        # eval run 4's `lane`, measured on its canvas region.
        self.assertEqual(self.verdict(luma_mean=0.025, luma_std=0.029, dark_fraction=0.918),
                         (False, 'near-black'))

    def test_a_dark_but_legible_night_village_stays_usable(self):
        # eval run 2's `overview`: darker than most defects and perfectly readable.
        self.assertEqual(self.verdict(luma_mean=0.047, luma_std=0.086, dark_fraction=0.813),
                         (True, 'usable'))

    def test_a_bright_block_over_a_third_of_the_frame_is_an_occluder(self):
        # eval run 4's `cottage`: a lit wall filling the frame.
        self.assertEqual(self.verdict(luma_mean=0.454, luma_std=0.326, flat_fraction=0.349,
                                      flat_luma=0.821, rest_luma=0.257),
                         (False, 'flat-occluder'))

    def test_a_flat_column_band_is_an_occluder(self):
        # eval run 4's `square`: a wall standing across the near plane.
        self.assertEqual(self.verdict(luma_mean=0.415, luma_std=0.258, flat_fraction=0.193,
                                      wall_fraction=0.219, wall_luma=0.682, wall_rest_luma=0.348),
                         (False, 'flat-occluder'))

    def test_a_large_block_at_the_frame_value_is_not_an_occluder(self):
        self.assertEqual(self.verdict(flat_fraction=0.55, flat_luma=0.31, rest_luma=0.29),
                         (True, 'usable'))

    def test_a_wide_column_band_at_the_frame_value_is_not_an_occluder(self):
        self.assertEqual(self.verdict(wall_fraction=0.44, wall_luma=0.31, wall_rest_luma=0.30),
                         (True, 'usable'))

    def test_a_frame_with_no_contrast_is_low_contrast(self):
        self.assertEqual(self.verdict(luma_std=0.02), (False, 'low-contrast'))

    def test_a_missing_region_never_raises(self):
        self.assertEqual(self.verdict(flat_fraction=0.9, flat_luma=None, rest_luma=None),
                         (True, 'usable'))

    def test_unusable_lists_flagged_views_in_capture_order(self):
        views = [{'name': 'default', 'view_quality': {'usable': True}},
                 {'name': 'lane', 'view_quality': {'usable': False, 'reason': 'near-black'}},
                 {'name': 'square', 'view_quality': {'usable': False, 'reason': 'flat-occluder'}},
                 {'name': 'nothing-measured', 'view_quality': {'usable': None}},
                 {'name': 'no-key'}]
        self.assertEqual(self.quality.unusable(views), ['lane', 'square'])

    def test_the_thresholds_live_in_one_dict(self):
        for key in ('dark_luma', 'near_black_luma_mean', 'near_black_dark_fraction',
                    'flat_min_fraction', 'flat_luma_gap', 'wall_min_fraction',
                    'wall_column_std', 'low_contrast_luma_std', 'grid_cols', 'grid_rows'):
            self.assertIn(key, self.quality.THRESHOLDS)


@unittest.skipUnless(HAS_PLAYWRIGHT, 'Playwright is optional and not installed')
class ViewQualityFrameTests(unittest.TestCase):
    """The measurement half: real frames through the real browser path."""

    def capture(self, page_bytes, *extra):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as out:
            (Path(tmp) / 'index.html').write_bytes(page_bytes)
            status = capture.main(['--dir', tmp, '--out', out, '--settle-ms', '100',
                                   '--view', 'only', *extra])
            return status, json.loads((Path(out) / 'capture-log.json').read_text())

    def quality_of(self, log, name):
        return next(view['view_quality'] for view in log['views'] if view['name'] == name)

    def test_every_view_carries_the_measured_keys(self):
        status, log = self.capture(NORMAL_PAGE)
        self.assertEqual(status, 0)
        self.assertEqual([view['name'] for view in log['views']], ['default', 'only'])
        for view in log['views']:
            measured = view['view_quality']
            self.assertTrue(measured['measured'])
            for key in ('luma_mean', 'luma_std', 'dark_fraction', 'flat_fraction',
                        'wall_fraction', 'usable', 'reason'):
                self.assertIn(key, measured)
            self.assertTrue(0.0 <= measured['luma_mean'] <= 1.0)
        self.assertEqual(log['unusable_views'], [])
        self.assertEqual(log['view_quality_thresholds'], capture.view_quality.THRESHOLDS)

    def test_an_all_black_frame_is_flagged_near_black(self):
        status, log = self.capture(BLACK_PAGE)
        self.assertEqual(status, 0)  # measured and logged, but not charged without the flag
        self.assertEqual(self.quality_of(log, 'only')['reason'], 'near-black')
        self.assertEqual(log['unusable_views'], ['default', 'only'])

    def test_expect_usable_exits_six_on_a_flagged_named_view(self):
        status, log = self.capture(BLACK_PAGE, '--expect-usable')
        self.assertEqual(status, 6)
        self.assertFalse(self.quality_of(log, 'only')['usable'])

    def test_a_wall_across_the_near_plane_is_flagged(self):
        status, log = self.capture(WALL_PAGE, '--expect-usable')
        self.assertEqual(status, 6)
        measured = self.quality_of(log, 'only')
        self.assertEqual(measured['reason'], 'flat-occluder')
        self.assertGreater(measured['wall_fraction'],
                           capture.view_quality.THRESHOLDS['wall_min_fraction'])

    def test_an_ordinary_frame_passes_expect_usable(self):
        status, log = self.capture(NORMAL_PAGE, '--expect-usable')
        self.assertEqual(status, 0)
        self.assertTrue(self.quality_of(log, 'only')['usable'])

    def test_a_jpeg_run_is_measured_on_a_png_re_shot_for_the_purpose(self):
        status, log = self.capture(NORMAL_PAGE, '--format', 'jpeg', '--quality', '70')
        self.assertEqual(status, 0)
        self.assertEqual(log['image_format'], 'jpeg')
        self.assertTrue(self.quality_of(log, 'only')['measured'])

    def test_a_page_without_a_canvas_is_measured_whole(self):
        _, log = self.capture(NORMAL_PAGE)
        self.assertIsNone(log['measured_region'])
        self.assertEqual(self.quality_of(log, 'only')['region'],
                         {'x': 0, 'y': 0, 'width': 1280, 'height': 720})


class SlugTests(unittest.TestCase):
    def test_selectors_become_file_safe_names(self):
        self.assertEqual(capture.slug('#toggle-day .btn'), 'toggle-day-btn')
        self.assertEqual(capture.slug('***'), 'target')


if __name__ == '__main__':
    unittest.main()
