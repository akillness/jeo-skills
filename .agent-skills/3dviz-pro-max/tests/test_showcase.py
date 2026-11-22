"""showcase.py drives capture.py; these tests never launch a browser.

`showcase.capture` is replaced by a stub that writes a file of a chosen size, so the schema, the
resume rule, the budget stop, the quality ladder, the lock and the output-path refusal are all
exercised without a GPU, without Playwright and without touching docs/demos/showcase/.
"""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('showcase', ROOT / 'scripts/showcase.py')
showcase = importlib.util.module_from_spec(spec)
spec.loader.exec_module(showcase)

SHOT = {'id': 'a-shot', 'source': 'example:village', 'view': 'overview', 'look': 'knowledge.style-painterly',
        'caption': 'a caption'}
MANIFEST = {'schema_version': 1, 'defaults': {'width': 1920, 'height': 1080, 'format': 'jpeg',
                                              'max_bytes': 1000, 'settle_ms': 1400},
            'shots': [SHOT]}
CAPTURE_LOG = {'capture_mode': 'gpu', 'webgl_renderer': 'ANGLE (Apple, ANGLE Metal Renderer)',
               'views': [{'name': 'overview', 'file': 'overview.jpg', 'requested': 'overview',
                          'applied': True}]}


def write_manifest(directory, data=MANIFEST):
    path = Path(directory) / 'showcase.json'
    path.write_text(json.dumps(data), encoding='utf-8')
    return path


def fake_capture(sizes):
    """A capture stub: `sizes` maps jpeg quality to the byte count that quality would produce."""
    def capture(python, built, cfg, quality, staging):
        staging = Path(staging)
        staging.mkdir(parents=True, exist_ok=True)
        frame = staging / 'overview.jpg'
        frame.write_bytes(b'\xff' * sizes[quality])
        return frame, dict(CAPTURE_LOG)
    return capture


class ManifestTests(unittest.TestCase):
    def test_shipped_manifest_is_valid_and_complete(self):
        data = json.loads(showcase.HISTORICAL_MANIFEST.read_text(encoding='utf-8'))
        ids = [shot['id'] for shot in data['shots']]
        self.assertEqual(len(ids), 21)   # 20 authored, heart dropped, cargo yard swapped for three village looks
        self.assertEqual(len(set(ids)), 21)
        for shot in data['shots']:
            self.assertTrue(shot['caption'].strip(), shot['id'])
            self.assertIn('look_applied', shot, shot['id'])
            self.assertTrue(shot['source'], shot['id'])

    def test_no_shot_claims_a_tier_the_manifest_did_not_name(self):
        data = json.loads(showcase.HISTORICAL_MANIFEST.read_text(encoding='utf-8'))
        for shot in data['shots']:
            for role, tier in (shot.get('tiers') or {}).items():
                self.assertIn(tier, ('T0', 'T1', 'T2', 'T3', 'T4'), f'{shot["id"]}.{role}')

    def test_schema_version_must_be_one(self):
        with tempfile.TemporaryDirectory() as directory:
            path = write_manifest(directory, {**MANIFEST, 'schema_version': 2})
            with self.assertRaisesRegex(ValueError, 'schema_version 1'):
                showcase.load_manifest(path)

    def test_missing_required_key_is_named(self):
        with tempfile.TemporaryDirectory() as directory:
            broken = {**MANIFEST, 'shots': [{k: v for k, v in SHOT.items() if k != 'look'}]}
            with self.assertRaisesRegex(ValueError, 'missing look'):
                showcase.load_manifest(write_manifest(directory, broken))

    def test_duplicate_id_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            broken = {**MANIFEST, 'shots': [SHOT, SHOT]}
            with self.assertRaisesRegex(ValueError, 'duplicate shot id'):
                showcase.load_manifest(write_manifest(directory, broken))

    def test_unknown_source_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            broken = {**MANIFEST, 'shots': [{**SHOT, 'source': 'somewhere-else'}]}
            with self.assertRaisesRegex(ValueError, 'unknown source'):
                showcase.load_manifest(write_manifest(directory, broken))

    def test_standalone_example_id_requires_kebab_case(self):
        for source in ('example:', 'example:Heart', 'example:heart/detail', 'example:heart_space'):
            with self.subTest(source=source), self.assertRaisesRegex(ValueError, 'invalid'):
                showcase.example_id(source)
        self.assertEqual(showcase.example_id('example:muscle-atlas'), 'muscle-atlas')

    def test_shot_id_cannot_escape_the_output_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            broken = {**MANIFEST, 'shots': [{**SHOT, 'id': '../historical-frame'}]}
            with self.assertRaisesRegex(ValueError, 'invalid shot id'):
                showcase.load_manifest(write_manifest(directory, broken))

    def test_harness_source_restricts_record_and_tier(self):
        self.assertEqual(showcase.harness_parts('harness:knowledge.blueprint-well@T2'),
                         ('knowledge.blueprint-well', 'T2'))
        for source in ('harness:knowledge.blueprint-well@../../escape',
                       'harness:recipe.well@T2', 'harness:knowledge.blueprint-well@T4',
                       'harness:knowledge.blueprint-well@T9'):
            with self.subTest(source=source), self.assertRaisesRegex(ValueError, 'invalid'):
                showcase.harness_parts(source)

    def test_malformed_shot_types_are_usage_errors(self):
        with tempfile.TemporaryDirectory() as directory:
            for shot in ('not-an-object', {**SHOT, 'source': 42}):
                with self.subTest(shot=shot), self.assertRaises(ValueError):
                    showcase.load_manifest(write_manifest(directory, {**MANIFEST, 'shots': [shot]}))

    def test_settings_layer_shot_over_defaults(self):
        cfg = showcase.settings(MANIFEST, {**SHOT, 'settle_ms': 50, 'motion_ms': 900})
        self.assertEqual(cfg['settle_ms'], 50)
        self.assertEqual(cfg['motion_ms'], 900)
        self.assertEqual(cfg['width'], 1920)
        self.assertNotIn('caption', cfg)


class ResumeTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.out = Path(self.directory.name)
        self.addCleanup(self.directory.cleanup)
        self.log = {'shots': [{'id': 'a-shot',
                               'config_sha256': showcase.shot_fingerprint(MANIFEST, SHOT)}]}

    def test_image_and_log_entry_together_mean_done(self):
        (self.out / 'a-shot.jpg').write_bytes(b'x')
        self.assertEqual(showcase.pending(MANIFEST, self.log, self.out), [])

    def test_log_entry_without_image_is_still_pending(self):
        self.assertEqual(len(showcase.pending(MANIFEST, self.log, self.out)), 1)

    def test_image_without_log_entry_is_still_pending(self):
        (self.out / 'a-shot.jpg').write_bytes(b'x')
        self.assertEqual(len(showcase.pending(MANIFEST, {'shots': []}, self.out)), 1)

    def test_force_re_renders_a_finished_shot(self):
        (self.out / 'a-shot.jpg').write_bytes(b'x')
        self.assertEqual(len(showcase.pending(MANIFEST, self.log, self.out, force=True)), 1)

    def test_changed_shot_configuration_is_not_reused(self):
        (self.out / 'a-shot.jpg').write_bytes(b'x')
        changed = {**MANIFEST, 'shots': [{**SHOT, 'look': 'knowledge.style-clay'}]}
        self.assertEqual(len(showcase.pending(changed, self.log, self.out)), 1)

    def test_only_selects_one_shot(self):
        many = {**MANIFEST, 'shots': [SHOT, {**SHOT, 'id': 'b-shot'}]}
        todo = showcase.pending(many, {'shots': []}, self.out, only='b-shot')
        self.assertEqual([shot['id'] for shot in todo], ['b-shot'])


class QualityLadderTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.out = Path(self.directory.name)
        self.addCleanup(self.directory.cleanup)
        self.cfg = showcase.settings(MANIFEST, SHOT)

    def render(self, sizes):
        with mock.patch.object(showcase, 'capture', fake_capture(sizes)):
            return showcase.render('python3', SHOT, self.cfg, Path('built'), self.out,
                                   self.out / 'staging')

    def test_first_quality_wins_when_it_fits(self):
        entry = self.render({88: 900, 80: 500, 72: 300})
        self.assertEqual(entry['quality'], 88)
        self.assertEqual(entry['bytes'], 900)
        self.assertEqual([attempt['quality'] for attempt in entry['attempts']], [88])
        self.assertTrue((self.out / 'a-shot.jpg').is_file())

    def test_ladder_steps_down_until_the_frame_fits(self):
        entry = self.render({88: 1400, 80: 1100, 72: 700})
        self.assertEqual(entry['quality'], 72)
        self.assertEqual([attempt['quality'] for attempt in entry['attempts']], [88, 80, 72])

    def test_a_frame_over_the_cap_at_the_last_step_fails_loudly(self):
        with self.assertRaisesRegex(RuntimeError, 'over the 1000 byte cap'):
            self.render({88: 3000, 80: 2000, 72: 1500})
        self.assertFalse((self.out / 'a-shot.jpg').exists())

    def test_png_does_not_walk_a_jpeg_ladder(self):
        self.cfg = showcase.settings(MANIFEST, {**SHOT, 'format': 'png'})
        with self.assertRaises(RuntimeError):
            self.render({88: 3000, 80: 100, 72: 100})

    def test_entry_records_the_evidence_fields(self):
        entry = self.render({88: 500})
        self.assertEqual(entry['capture_mode'], 'gpu')
        self.assertEqual(entry['webgl_renderer'], CAPTURE_LOG['webgl_renderer'])
        self.assertEqual(entry['look'], SHOT['look'])
        self.assertEqual(entry['view'], 'overview')
        self.assertEqual(len(entry['sha256']), 64)
        self.assertIn('1920x1080', entry['renderer'])
        self.assertIn('q88', entry['renderer'])
        self.assertIsInstance(entry['seconds'], float)


class LockTests(unittest.TestCase):
    def test_lock_is_written_and_removed(self):
        with tempfile.TemporaryDirectory() as directory:
            lock = Path(directory) / '.run.lock'
            with showcase.run_lock(lock):
                self.assertTrue(lock.is_file())
                self.assertTrue(lock.read_text(encoding='utf-8').strip().isdigit())
            self.assertFalse(lock.exists())

    def test_a_second_run_is_refused_while_the_lock_is_held(self):
        with tempfile.TemporaryDirectory() as directory:
            lock = Path(directory) / '.run.lock'
            with showcase.run_lock(lock):
                with self.assertRaisesRegex(RuntimeError, 'holds the machine'):
                    with showcase.run_lock(lock):
                        pass
            self.assertFalse(lock.exists())

    def test_the_lock_is_released_when_the_body_raises(self):
        with tempfile.TemporaryDirectory() as directory:
            lock = Path(directory) / '.run.lock'
            with contextlib.suppress(KeyError), showcase.run_lock(lock):
                raise KeyError('a shot blew up')
            self.assertFalse(lock.exists())


class OutPathTests(unittest.TestCase):
    def test_the_historical_showcase_directory_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'gallery root is historical'):
            showcase.resolve_out(str(showcase.OUT))

    def test_a_subdirectory_is_accepted(self):
        self.assertEqual(showcase.resolve_out(str(showcase.OUT / 'draft')), showcase.OUT / 'draft')

    def test_the_retired_breadth_directory_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'reserved for historical artifacts'):
            showcase.resolve_out(str(showcase.OUT / 'breadth'))

    def test_a_populated_non_run_directory_is_refused(self):
        with tempfile.TemporaryDirectory(dir=showcase.OUT) as directory:
            (Path(directory) / 'existing.jpg').write_bytes(b'historical')
            with self.assertRaisesRegex(ValueError, 'populated but is not a resumable'):
                showcase.resolve_out(directory)

    def test_anywhere_else_is_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, 'is outside'):
                showcase.resolve_out(directory)

    def test_main_refuses_an_outside_out_and_writes_nothing(self):
        with tempfile.TemporaryDirectory() as directory:
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                status = showcase.main(['--manifest', str(showcase.HISTORICAL_MANIFEST),
                                        '--out', directory])
            self.assertEqual(status, 2)
            self.assertEqual(list(Path(directory).iterdir()), [])


class RunTests(unittest.TestCase):
    """main() end to end with the capture subprocess and the source build stubbed out."""

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.base = Path(self.directory.name).resolve()
        self.out = self.base / 'new-run'
        self.addCleanup(self.directory.cleanup)
        self.manifest = {**MANIFEST, 'shots': [SHOT, {**SHOT, 'id': 'b-shot'}]}
        self.path = write_manifest(self.base, self.manifest)

    @contextlib.contextmanager
    def stubbed(self, capture=None):
        with mock.patch.object(showcase, 'OUT', self.base), \
             mock.patch.object(showcase, 'SCRATCH', self.out / 'scratch'), \
             mock.patch.object(showcase, 'capture', capture or fake_capture({88: 400})), \
             mock.patch.object(showcase, 'source_dir', lambda source, cache: Path('built')), \
             mock.patch.object(showcase, 'environment', lambda python: ({'os': 'test'},
                                                                       {'three': '0.180.0'})):
            yield

    def run_main(self, argv, capture=None):
        stdout, stderr = io.StringIO(), io.StringIO()
        with self.stubbed(capture), contextlib.redirect_stdout(stdout), \
             contextlib.redirect_stderr(stderr):
            status = showcase.main(['--manifest', str(self.path), '--out', str(self.out)] + argv)
        return status, stdout.getvalue() + stderr.getvalue()

    def test_a_full_run_writes_images_a_log_and_no_lock(self):
        status, output = self.run_main([])
        self.assertEqual(status, 0, output)
        log = json.loads((self.out / 'showcase-log.json').read_text(encoding='utf-8'))
        self.assertEqual([shot['id'] for shot in log['shots']], ['a-shot', 'b-shot'])
        self.assertEqual(log['host'], {'os': 'test'})
        self.assertEqual(log['versions'], {'three': '0.180.0'})
        self.assertTrue(log['generated'])
        self.assertTrue((self.out / 'a-shot.jpg').is_file())
        self.assertFalse((self.out / 'scratch/.run.lock').exists())

    def test_standalone_source_selects_its_multi_page_build_path(self):
        seen = []
        delegate = fake_capture({88: 400})
        def capture(python, built, cfg, quality, staging):
            seen.append(cfg.get('page_path'))
            return delegate(python, built, cfg, quality, staging)
        status, output = self.run_main(['--only', 'a-shot'], capture=capture)
        self.assertEqual(status, 0, output)
        self.assertEqual(seen, ['village/'])

    def test_re_running_a_complete_showcase_does_no_work(self):
        self.run_main([])
        status, output = self.run_main([])
        self.assertEqual(status, 0)
        self.assertIn('nothing to do', output)

    def test_an_interrupted_run_resumes_the_rest(self):
        self.run_main(['--only', 'a-shot'])
        status, output = self.run_main([])
        self.assertEqual(status, 0, output)
        self.assertIn('b-shot', output)
        self.assertNotIn('a-shot:', output)

    def test_the_budget_stops_before_a_shot_it_cannot_afford(self):
        status, output = self.run_main(['--budget-s', '0'])
        self.assertEqual(status, 0, output)
        self.assertIn('budget 0 s reached', output)
        self.assertIn('2 shot(s) left', output)
        self.assertFalse((self.out / 'a-shot.jpg').exists())

    def test_a_failing_shot_is_reported_and_the_run_continues(self):
        def explode(python, built, cfg, quality, staging):
            if cfg.get('view') == 'overview' and quality == 88:
                raise RuntimeError('the built page has no view named overview')
            raise RuntimeError('unreachable')
        status, output = self.run_main([], capture=explode)
        self.assertEqual(status, 1, output)
        self.assertIn('FAIL a-shot', output)
        self.assertIn('FAIL b-shot', output)

    def test_dry_run_lists_the_plan_the_builds_and_an_estimate(self):
        stdout = io.StringIO()
        with self.stubbed(), contextlib.redirect_stdout(stdout):
            status = showcase.main(['--manifest', str(self.path), '--out', str(self.out),
                                    '--dry-run'])
        output = stdout.getvalue()
        self.assertEqual(status, 0)
        self.assertIn('2 shot(s) pending of 2', output)
        self.assertIn('builds needed (1): example:village', output)
        self.assertIn('estimate', output)
        self.assertFalse((self.out / 'showcase-log.json').exists())

    def test_dry_run_counts_the_shared_examples_build_once(self):
        second_source = {**SHOT, 'id': 'b-shot', 'source': 'example:heart'}
        manifest = {**MANIFEST, 'shots': [SHOT, second_source]}
        path = write_manifest(self.base, manifest)
        stdout = io.StringIO()
        with self.stubbed(), mock.patch.object(showcase, 'EXAMPLES', self.base / 'examples'), \
             contextlib.redirect_stdout(stdout):
            status = showcase.main(['--manifest', str(path), '--out', str(self.out), '--dry-run'])
        self.assertEqual(status, 0)
        self.assertIn('estimate 105 s', stdout.getvalue())


if __name__ == '__main__':
    unittest.main()
