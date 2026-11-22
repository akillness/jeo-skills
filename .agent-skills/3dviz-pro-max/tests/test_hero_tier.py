"""The T3 driver's contract: hashing, caching, absence, the time box and the out-path rule.

Blender is mocked everywhere. CI has no Blender and must not need one: these tests prove the
decisions the driver makes around the bake, never the bake itself.
"""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / 'skills/3dviz-pro-max'
RECORD = 'knowledge.blueprint-timber-cottage'


def load_driver():
    spec = importlib.util.spec_from_file_location('hero_tier', SKILL / 'scripts/hero-tier.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


hero = load_driver()


class FakeProcess:
    """Just enough of Popen for the time box: it never finishes until it is killed."""

    def __init__(self, target=None):
        self.pid, self.returncode, self.killed, self.target = 4242, None, False, target

    def communicate(self, timeout=None):
        if timeout is not None and not self.killed:
            if self.target is not None:                 # a half-written GLB on disk
                Path(self.target).write_bytes(b'partial')
            raise subprocess.TimeoutExpired('blender', timeout)
        self.returncode = -9
        return '', ''


class HashTests(unittest.TestCase):
    def test_the_key_changes_with_the_module_the_params_and_the_bake_settings(self):
        bake = {'bake_size': 1024, 'ao_samples': 64}
        base = hero.params_hash(b'module', {'seed': 1}, bake)
        self.assertEqual(len(base), 12)
        self.assertEqual(base, hero.params_hash(b'module', {'seed': 1}, dict(bake)))
        self.assertNotEqual(base, hero.params_hash(b'module edited', {'seed': 1}, bake))
        self.assertNotEqual(base, hero.params_hash(b'module', {'seed': 2}, bake))
        self.assertNotEqual(base, hero.params_hash(b'module', {'seed': 1},
                                                   {**bake, 'bake_size': 2048}))

    def test_the_key_ignores_key_order_in_params_and_settings(self):
        left = hero.params_hash(b'm', {'a': 1, 'b': 2}, {'x': 1, 'y': 2})
        right = hero.params_hash(b'm', {'b': 2, 'a': 1}, {'y': 2, 'x': 1})
        self.assertEqual(left, right)

    def test_the_pipeline_digest_covers_both_scripts_that_shape_the_bake(self):
        self.assertEqual(len(hero.pipeline_hash()), 12)
        self.assertTrue(all(path.is_file() for path in hero.PIPELINE))


class DriverTests(unittest.TestCase):
    """Every run goes through main(); only the two subprocess boundaries are replaced."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.cache = Path(self.tmp.name) / 'hero-tier'
        self.out = self.cache / 'hero.glb'
        self.launches = []
        self.original = (hero.export_t1, hero.run_blender, hero.find_blender)

        def restore():
            hero.export_t1, hero.run_blender, hero.find_blender = self.original
        self.addCleanup(restore)
        hero.export_t1 = lambda repo, rid, params, target, timeout: (
            Path(target).write_bytes(b'glTF fixture'), target)[1]
        hero.find_blender = lambda: {'found': True, 'path': '/fake/blender', 'version': '4.2.9',
                                     'on_path': False, 'meets_minimum': True, 'source': 'fixture'}

    def bake(self, status='produced', bytes_written=b'baked hero'):
        def fake(binary, source, target, settings, families, timeout_s):
            self.launches.append(binary)
            if status == 'produced':
                Path(target).write_bytes(bytes_written)
            return status, {'fixture': True}, 1.0
        return fake

    def invoke(self, *extra):
        argv = ['--record', RECORD, '--out', str(self.out), '--root', str(ROOT),
                '--skill', str(SKILL), '--cache-dir', str(self.cache), *extra]
        stream = io.StringIO()
        with contextlib.redirect_stdout(stream):
            code = hero.main(argv)
        text = stream.getvalue().strip()
        return code, (json.loads(text) if text.startswith('{') else {})

    def test_a_first_run_bakes_and_a_second_identical_run_is_a_cache_hit(self):
        hero.run_blender = self.bake()
        code, first = self.invoke()
        self.assertEqual((code, first['status'], first['cache']), (0, 'produced', 'miss'))
        self.assertEqual(first['bytes'], len(b'baked hero'))
        self.assertTrue((self.cache / f'{first["params_hash"]}.glb').is_file())

        def refuse(*args, **kwargs):
            raise AssertionError('a cache hit must never launch Blender')
        hero.run_blender = refuse
        code, second = self.invoke()
        self.assertEqual((code, second['status'], second['cache']), (0, 'cached', 'hit'))
        self.assertEqual(second['params_hash'], first['params_hash'])
        self.assertEqual(len(self.launches), 1)

    def test_changed_bake_settings_miss_the_cache(self):
        hero.run_blender = self.bake()
        _, first = self.invoke()
        _, second = self.invoke('--bake-size', '512')
        self.assertNotEqual(first['params_hash'], second['params_hash'])
        self.assertEqual(second['cache'], 'miss')

    def test_a_missing_blender_reports_unavailable_and_still_exits_zero(self):
        hero.find_blender = lambda: {'found': False, 'path': None, 'version': None,
                                     'on_path': False, 'meets_minimum': False,
                                     'source': 'no runnable candidate'}
        hero.run_blender = self.bake()
        code, summary = self.invoke()
        self.assertEqual((code, summary['status']), (0, 'unavailable'))
        self.assertIsNone(summary['blender'])
        self.assertFalse(self.out.exists())
        self.assertEqual(self.launches, [])

    def test_a_host_probe_that_found_no_blender_wins_over_a_live_search(self):
        host = Path(self.tmp.name) / 'host.json'
        host.write_text(json.dumps({'blender': {'found': False, 'path': None, 'version': None}}))
        hero.run_blender = self.bake()
        code, summary = self.invoke('--host', str(host))
        self.assertEqual((code, summary['status']), (0, 'unavailable'))
        self.assertEqual(self.launches, [])

    def test_a_timed_out_bake_is_reported_at_exit_zero_and_caches_nothing(self):
        hero.run_blender = self.bake(status='timeout')
        code, summary = self.invoke()
        self.assertEqual((code, summary['status']), (0, 'timeout'))
        self.assertFalse(any(self.cache.glob('*.glb')))

    def test_a_failed_bake_exits_one(self):
        hero.run_blender = self.bake(status='failed')
        code, summary = self.invoke()
        self.assertEqual((code, summary['status']), (1, 'failed'))

    def test_opting_out_reports_and_never_touches_blender(self):
        hero.run_blender = self.bake()
        code, summary = self.invoke('--no-hero-tier')
        self.assertEqual((code, summary['status']), (0, 'skipped'))
        self.assertEqual(self.launches, [])

    def test_an_out_path_outside_the_repository_and_the_cache_is_refused(self):
        hero.run_blender = self.bake()
        outside = Path(tempfile.gettempdir()) / 'somewhere-else' / 'hero.glb'
        argv = ['--record', RECORD, '--out', str(outside), '--root', str(ROOT),
                '--skill', str(SKILL), '--cache-dir', str(self.cache)]
        self.assertEqual(hero.main(argv), 2)

    def test_an_unknown_record_is_a_usage_error(self):
        argv = ['--record', 'knowledge.blueprint-not-here', '--out', str(self.out),
                '--root', str(ROOT), '--skill', str(SKILL), '--cache-dir', str(self.cache)]
        self.assertEqual(hero.main(argv), 2)


class TimeBoxTests(unittest.TestCase):
    """run_blender itself: the box expires, the process group dies, the partial file goes."""

    def test_the_process_group_is_killed_and_the_partial_output_removed(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'partial.glb'
            killed = []
            original = (subprocess.Popen, hero.os.getpgid, hero.os.killpg)
            subprocess.Popen = lambda *a, **k: FakeProcess(target)
            hero.os.getpgid = lambda pid: pid
            hero.os.killpg = lambda pgid, sig: killed.append((pgid, sig))
            try:
                status, detail, seconds = hero.run_blender(
                    '/fake/blender', Path(folder) / 'in.glb', target,
                    {'bake_size': 1024, 'ao_samples': 64, 'ao_strength': 0.8, 'bevel_m': 0.02,
                     'seed': 1, 'quality': 85}, {}, 1)
            finally:
                subprocess.Popen, hero.os.getpgid, hero.os.killpg = original
        self.assertEqual(status, 'timeout')
        self.assertEqual(detail, {})
        self.assertEqual(killed, [(4242, 9)])
        self.assertFalse(target.exists())
        self.assertGreaterEqual(seconds, 0.0)

    def test_the_command_is_niced_thread_capped_and_never_shelled_out(self):
        seen = {}
        original = subprocess.Popen
        subprocess.Popen = lambda command, **kwargs: seen.update(
            command=command, kwargs=kwargs) or FakeProcess()
        try:
            with tempfile.TemporaryDirectory() as folder:
                hero.run_blender('/fake/blender', Path(folder) / 'in.glb',
                                 Path(folder) / 'out.glb',
                                 {'bake_size': 1024, 'ao_samples': 64, 'ao_strength': 0.8,
                                  'bevel_m': 0.02, 'seed': 1, 'quality': 85}, {}, None)
        finally:
            subprocess.Popen = original
        self.assertEqual(seen['command'][:3], ['nice', '-n', '10'])
        self.assertIn('--threads', seen['command'])
        self.assertEqual(seen['command'][seen['command'].index('--threads') + 1], '4')
        self.assertIn('--factory-startup', seen['command'])
        self.assertNotIn('shell', seen['kwargs'])
        self.assertTrue(seen['kwargs']['start_new_session'])


if __name__ == '__main__':
    unittest.main()
