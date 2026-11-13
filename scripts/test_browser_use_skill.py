import importlib.util
import json
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / '.agent-skills/browser-use/scripts/preflight.py'
spec = importlib.util.spec_from_file_location('browser_use_preflight', SCRIPT)
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class PreflightTests(unittest.TestCase):
    def run_preflight(self):
        out = StringIO()
        with redirect_stdout(out):
            preflight.main()
        return json.loads(out.getvalue())

    def test_missing_package_and_tools(self):
        with patch.object(preflight.importlib.metadata, 'version', side_effect=preflight.importlib.metadata.PackageNotFoundError), patch.object(preflight.shutil, 'which', return_value=None):
            result = self.run_preflight()
        self.assertIsNone(result['browser_use_package_version'])
        self.assertIsNone(result['browser_use_cli'])
        self.assertIsNone(result['uv'])
        self.assertIn('not checked', result['note'])

    def test_installed_metadata_and_distinct_tools(self):
        with patch.object(preflight.importlib.metadata, 'version', return_value='1.0.3'), patch.object(preflight.shutil, 'which', side_effect=lambda name: '/bin/' + name):
            result = self.run_preflight()
        self.assertEqual(result['browser_use_package_version'], '1.0.3')
        self.assertEqual(result['browser_use_cli'], '/bin/browser-use')
        self.assertEqual(result['uv'], '/bin/uv')


if __name__ == '__main__':
    unittest.main()
