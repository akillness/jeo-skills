import importlib.metadata
import importlib.util
import json
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch


path = Path(__file__).resolve().parents[1] / '.agent-skills/flide/scripts/preflight.py'
spec = importlib.util.spec_from_file_location('flide_preflight', path)
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class PreflightTests(unittest.TestCase):
    def report(self):
        output = StringIO()
        with redirect_stdout(output):
            preflight.main()
        return json.loads(output.getvalue())

    def test_missing_package_tools_and_old_python(self):
        with patch.object(preflight.importlib.metadata, 'version', side_effect=importlib.metadata.PackageNotFoundError), patch.object(preflight.shutil, 'which', return_value=None), patch.object(preflight.sys, 'version_info', (3, 9)), patch.object(preflight.platform, 'system', return_value='Darwin'):
            report = self.report()
        self.assertIsNone(report['flide_package_version'])
        self.assertIsNone(report['nvidia_smi'])
        self.assertFalse(report['python_supported'])
        self.assertEqual(report['system'], 'Darwin')
        self.assertIn('not checked', report['note'])

    def test_installed_metadata_does_not_claim_readiness(self):
        with patch.object(preflight.importlib.metadata, 'version', return_value='0.1.15'), patch.object(preflight.shutil, 'which', side_effect=lambda name: '/bin/' + name), patch.object(preflight.sys, 'version_info', (3, 10)):
            report = self.report()
        self.assertEqual(report['flide_package_version'], '0.1.15')
        self.assertEqual(report['flide_cli'], '/bin/flide')
        self.assertEqual(report['nvidia_smi'], '/bin/nvidia-smi')
        self.assertTrue(report['python_supported'])
        self.assertIn('runtime readiness', report['note'])


if __name__ == '__main__':
    unittest.main()
