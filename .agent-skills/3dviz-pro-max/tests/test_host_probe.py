"""The probe reports what is there and stays silent about what is not - it never fails.

Nothing here touches the real machine: subprocess, shutil.which and the filesystem are mocked,
so the same assertions hold on a laptop with Blender and on a CI runner with neither Blender
nor a GPU.
"""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

SCRIPTS = Path(__file__).resolve().parents[1] / 'skills/3dviz-pro-max/scripts'
sys.path.insert(0, str(SCRIPTS))
import blender_locate  # noqa: E402

spec = importlib.util.spec_from_file_location('host_probe', SCRIPTS / 'host-probe.py')
host_probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host_probe)

NO_BLENDER = {'found': False, 'path': None, 'version': None, 'on_path': False,
              'meets_minimum': False,
              'source': 'no runnable candidate on PATH or standard paths'}
DISPLAYS = json.dumps({'SPDisplaysDataType': [{'_name': 'card', 'sppci_model': 'Apple M4 Max',
                                               'spdisplays_vendor': 'sppci_vendor_Apple',
                                               'sppci_cores': '40'}]})


def blender(found=True, on_path=False, version='5.2.1', meets=True):
    return {'found': found, 'path': '/Applications/Blender.app/Contents/MacOS/Blender',
            'version': version, 'on_path': on_path, 'meets_minimum': meets,
            'source': ('PATH' if on_path else 'standard install path') + ' + --version'}


def completed(stdout='', returncode=0):
    return subprocess.CompletedProcess(args=['probe'], returncode=returncode, stdout=stdout,
                                       stderr='')


class CeilingTests(unittest.TestCase):
    def test_no_blender_caps_at_t2_and_names_the_absence(self):
        tier, reason = host_probe.ceiling(NO_BLENDER)
        self.assertEqual(tier, 'T2')
        self.assertIn('no runnable Blender', reason)

    def test_blender_off_path_still_raises_the_ceiling_to_t3(self):
        tier, reason = host_probe.ceiling(blender(on_path=False))
        self.assertEqual(tier, 'T3')
        self.assertIn('standard install path', reason)

    def test_blender_on_path_reaches_t3_too(self):
        tier, reason = host_probe.ceiling(blender(on_path=True))
        self.assertEqual(tier, 'T3')
        self.assertIn('PATH', reason)

    def test_a_blender_older_than_the_minimum_is_reported_not_used(self):
        tier, reason = host_probe.ceiling(blender(version='3.6.0', meets=False))
        self.assertEqual(tier, 'T2')
        self.assertIn('3.6.0', reason)
        self.assertIn('4.2', reason)

    def test_no_host_ever_reaches_t4(self):
        for row in (NO_BLENDER, blender(), blender(version='9.0.0')):
            self.assertIn(host_probe.ceiling(row)[0], ('T2', 'T3'))


class CaptureModeTests(unittest.TestCase):
    def test_darwin_with_chromium_expects_gpu(self):
        mode, reason = host_probe.capture_mode('Darwin', True)
        self.assertEqual(mode, 'gpu')
        self.assertIn('metal', reason)

    def test_darwin_without_chromium_falls_back(self):
        self.assertEqual(host_probe.capture_mode('Darwin', False)[0], 'swiftshader')

    def test_other_platforms_expect_swiftshader_because_their_flags_are_unverified(self):
        for system in ('Linux', 'Windows'):
            mode, reason = host_probe.capture_mode(system, True)
            self.assertEqual(mode, 'swiftshader')
            self.assertIn('unverified', reason)


class ProbeFailureTests(unittest.TestCase):
    """A missing command, a non-zero exit and a timeout are all data, never exceptions."""

    def test_missing_command_returns_none(self):
        with mock.patch.object(host_probe.subprocess, 'run', side_effect=FileNotFoundError):
            self.assertIsNone(host_probe.run(['nope']))

    def test_timeout_returns_none(self):
        error = subprocess.TimeoutExpired(cmd=['slow'], timeout=host_probe.TIMEOUT_S)
        with mock.patch.object(host_probe.subprocess, 'run', side_effect=error):
            self.assertIsNone(host_probe.run(['slow']))

    def test_nonzero_exit_returns_none(self):
        with mock.patch.object(host_probe.subprocess, 'run', return_value=completed('x', 1)):
            self.assertIsNone(host_probe.run(['unhappy']))

    def test_system_profiler_missing_leaves_the_gpu_unknown(self):
        with mock.patch.object(host_probe.subprocess, 'run', side_effect=FileNotFoundError):
            gpu = host_probe.gpu_info('Darwin')
        self.assertFalse(gpu['found'])
        self.assertIn('system_profiler', gpu['source'])

    def test_system_profiler_timeout_leaves_the_gpu_unknown(self):
        error = subprocess.TimeoutExpired(cmd=['system_profiler'], timeout=5)
        with mock.patch.object(host_probe.subprocess, 'run', side_effect=error):
            self.assertFalse(host_probe.gpu_info('Darwin')['found'])

    def test_a_readable_display_list_is_reported_with_its_source(self):
        with mock.patch.object(host_probe.subprocess, 'run', return_value=completed(DISPLAYS)):
            gpu = host_probe.gpu_info('Darwin')
        self.assertEqual((gpu['name'], gpu['cores']), ('Apple M4 Max', 40))
        self.assertIn('SPDisplaysDataType', gpu['source'])

    def test_an_unknown_platform_says_so_instead_of_guessing(self):
        gpu = host_probe.gpu_info('Haiku')
        self.assertFalse(gpu['found'])
        self.assertIn('Haiku', gpu['source'])


class BlenderLocateTests(unittest.TestCase):
    """The shared locator, exercised through the shapes the probe depends on."""

    def test_windows_glob_prefers_the_highest_version(self):
        found = ['C:\\Program Files\\Blender Foundation\\Blender 4.2\\blender.exe',
                 'C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe']
        with mock.patch.object(blender_locate.shutil, 'which', return_value=None), \
             mock.patch.object(blender_locate.glob, 'glob', return_value=found), \
             mock.patch.object(Path, 'is_file', return_value=True):
            paths = blender_locate.candidates('Windows')
        self.assertEqual([path for path, _ in paths], sorted(found, reverse=True))
        self.assertTrue(all(on_path is False for _, on_path in paths))

    def test_path_is_tried_before_the_standard_locations(self):
        with mock.patch.object(blender_locate.shutil, 'which', return_value='/usr/bin/blender'), \
             mock.patch.object(Path, 'is_file', return_value=False):
            paths = blender_locate.candidates('Linux')
        self.assertEqual(paths, [('/usr/bin/blender', True)])

    def test_an_install_that_cannot_run_is_not_found(self):
        with mock.patch.object(blender_locate, 'candidates',
                               return_value=[('/broken/blender', False)]), \
             mock.patch.object(blender_locate, 'blender_version', return_value=None):
            self.assertEqual(blender_locate.find_blender('Darwin'), NO_BLENDER)


class ReportTests(unittest.TestCase):
    def probe(self, system, blender_row):
        with mock.patch.object(host_probe, 'find_blender', return_value=blender_row), \
             mock.patch.object(host_probe.subprocess, 'run', side_effect=FileNotFoundError), \
             mock.patch.object(host_probe, 'chromium_installed', return_value=True):
            return host_probe.probe(system)

    def test_a_bare_host_still_produces_a_complete_report(self):
        report = self.probe('Linux', NO_BLENDER)
        self.assertEqual(report['schema_version'], host_probe.SCHEMA_VERSION)
        for key in ('os', 'cpu', 'memory_gb', 'gpu', 'blender', 'runtimes', 'quality_ceiling',
                    'quality_ceiling_reason', 'capture_mode_expected', 'capture_mode_reason'):
            self.assertIn(key, report)
        self.assertEqual(report['quality_ceiling'], 'T2')
        self.assertEqual(report['quality_ceiling_scope'], 'shipped-kit-pipelines')
        self.assertEqual(report['capture_mode_expected'], 'swiftshader')
        self.assertIsNone(report['runtimes']['node'])
        self.assertIsNone(report['memory_gb'])

    def test_blender_off_path_on_darwin_reads_t3_and_gpu(self):
        report = self.probe('Darwin', blender(on_path=False))
        self.assertEqual(report['quality_ceiling'], 'T3')
        self.assertFalse(report['blender']['on_path'])
        self.assertEqual(report['capture_mode_expected'], 'gpu')

    def test_main_writes_exactly_one_file_and_exits_zero(self):
        with tempfile.TemporaryDirectory() as tmp, \
             mock.patch.object(host_probe, 'find_blender', return_value=NO_BLENDER), \
             mock.patch.object(host_probe.subprocess, 'run', side_effect=FileNotFoundError):
            out = Path(tmp) / 'nested' / 'host.json'
            with contextlib.redirect_stdout(io.StringIO()) as printed:
                self.assertEqual(host_probe.main(['--out', str(out)]), 0)
            self.assertEqual(printed.getvalue().strip(), out.read_text().strip())
            self.assertEqual(json.loads(out.read_text())['quality_ceiling'], 'T2')
            self.assertEqual([p.name for p in out.parent.iterdir()], ['host.json'])

    def test_the_report_publishes_no_home_paths_beyond_blender(self):
        report = self.probe('Darwin', blender())
        text = json.dumps({k: v for k, v in report.items() if k != 'blender'})
        self.assertNotIn(str(Path.home()), text)


if __name__ == '__main__':
    unittest.main()
