"""Generated catalog removal must not leave retired records in install packages."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('catalog_index', ROOT/'scripts/build-index.py')
index = importlib.util.module_from_spec(spec)
spec.loader.exec_module(index)


class IndexTests(unittest.TestCase):
    def test_obsolete_owned_pages_are_flagged_then_removed_without_touching_manual_files(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(index, 'SKILL', Path(tmp)):
            folder = Path(tmp)/'references/catalog-knowledge'
            folder.mkdir(parents=True)
            obsolete, current = folder/'old.md', folder/'current.md'
            obsolete.write_text(index.record_page('Retired family', []))
            current.write_text(index.record_page('Current family', []))
            self.assertEqual(index.reconcile_pages({current: ''}, check=True), [obsolete])
            self.assertTrue(obsolete.exists(), 'Check mode is read-only')
            index.reconcile_pages({current: ''})
            self.assertFalse(obsolete.exists())
            self.assertTrue(current.exists())
            manual = folder/'manual.md'
            manual.write_text('A human-authored note')
            with self.assertRaisesRegex(ValueError, 'unrecognized'):
                index.reconcile_pages({current: ''})
            self.assertTrue(manual.exists())


if __name__ == '__main__':
    unittest.main()
