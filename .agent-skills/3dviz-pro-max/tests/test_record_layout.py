"""Portable record placement and content identity across storage layouts."""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'skills/3dviz-pro-max/scripts'))
sys.path.insert(0, str(ROOT / 'scripts'))
from catalog import catalog_hashes, load_catalog, record_content_hash
from evidence_validation import content_hash
from record_layout import record_file
from manifest_contract import validate_manifest

spec = importlib.util.spec_from_file_location('migration', ROOT / 'scripts/migrate-catalog.py')
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class RecordLayoutTests(unittest.TestCase):
    def test_layout_contract_and_legacy_arrays(self):
        row = {'id': 'knowledge.test-metal', 'knowledge_kind': 'material-profile'}
        path = 'knowledge/material-profile/test-metal.json'
        self.assertEqual(record_file(row, path, 'knowledge', 2), [row])
        self.assertEqual(record_file([row], 'knowledge/legacy.json', 'knowledge', 1), [row])
        for value, location in [([row], path), (row, 'knowledge/test-metal.json'),
                                ({**row, 'id': 'knowledge.test.metal'}, path),
                                (row, 'knowledge/lighting-profile/test-metal.json')]:
            with self.subTest(location=location, value=value), self.assertRaises(ValueError):
                record_file(value, location, 'knowledge', 2)

    def test_content_hash_matches_evidence_and_survives_relocation(self):
        rows = [{'id': 'recipe.a', 'revision': 1, 'summary': 'A', '_path': 'data/recipes/a.json'},
                {'id': 'knowledge.b', 'revision': 2, '_path': 'data/knowledge/material-profile/b.json'}]
        self.assertEqual(record_content_hash(rows[0]), content_hash(
            {k: v for k, v in rows[0].items() if k != '_path'}))
        moved = copy.deepcopy(list(reversed(rows)))
        moved[0]['_path'] = 'data/knowledge/other.json'
        self.assertEqual(catalog_hashes(rows)['content_catalog_hash'],
                         catalog_hashes(moved)['content_catalog_hash'])
        self.assertNotEqual(catalog_hashes(rows)['layout_hash'], catalog_hashes(moved)['layout_hash'])
        moved[1]['summary'] = 'New guidance'
        self.assertNotEqual(catalog_hashes(rows)['content_catalog_hash'],
                            catalog_hashes(moved)['content_catalog_hash'])

    def test_loaded_paths_use_named_relative_base(self):
        _, rows, _ = load_catalog(collection='all')
        self.assertTrue(rows)
        for row in rows:
            self.assertTrue(row['_path'].startswith('data/'))
            self.assertNotIn('\\', row['_path'])
            self.assertNotIn('..', row['_path'].split('/'))

    def fixture(self, root):
        data = root / 'skills/3dviz-pro-max/data'
        (data / 'recipes').mkdir(parents=True)
        (root / 'evals/retrieval').mkdir(parents=True)
        manifest, rows, sources = load_catalog(collection='all')
        seed = next(r for r in rows if r['id'] == 'recipe.linear-transformation-3d')
        seed = {k: v for k, v in seed.items() if k != '_path'}
        seed.pop('related_ids', None)
        manifest.pop('layout_version', None)
        manifest['collections'] = {'recipes': 'recipes/*.json', 'sources': 'sources.json',
                                   'directions': 'directions.json'}
        (data / 'manifest.json').write_text(json.dumps(manifest))
        (data / 'recipes/legacy.json').write_text(json.dumps([seed]))
        (data / 'sources.json').write_text(json.dumps(sources))
        (data / 'directions.json').write_bytes((ROOT / 'skills/3dviz-pro-max/data/directions.json').read_bytes())
        (root / 'evals/retrieval/pilot-cases.json').write_text(json.dumps({'cases': [
            {'query': 'linear transformation', 'within_top': 3}]}))
        return data

    def test_migration_preserves_identity_and_is_repeatable(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = self.fixture(root)
            report = root / 'plans/result.json'
            before = migration.inventory(load_catalog(data.parent, 'all')[1])
            result = migration.migrate(root, report, True)
            self.assertEqual(result['status'], 'migrated')
            self.assertEqual(before, migration.inventory(load_catalog(data.parent, 'all')[1]))
            self.assertTrue(report.with_suffix('.backup.zip').is_file())
            self.assertFalse((data / 'recipes/legacy.json').exists())
            self.assertEqual(migration.migrate(root, report, True)['status'], 'already-current')

    def test_failed_equivalence_restores_original_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data = self.fixture(root)
            before = {p.relative_to(data): p.read_bytes() for p in data.rglob('*.json')}
            with patch.object(migration, 'retrieval', side_effect=[[], [['changed']]]):
                with self.assertRaisesRegex(ValueError, 'Retrieval'):
                    migration.migrate(root, root / 'plans/result.json', True)
            self.assertEqual(before, {p.relative_to(data): p.read_bytes() for p in data.rglob('*.json')})

    def test_manifest_rejects_windows_absolute_or_backslash_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = self.fixture(Path(tmp))
            manifest = json.loads((data / 'manifest.json').read_text())
            for value in ('C:/data/*.json', 'recipes\\*.json', '../recipes/*.json'):
                manifest['collections']['recipes'] = value
                with self.subTest(value=value), self.assertRaisesRegex(ValueError, 'Unsafe'):
                    validate_manifest(manifest, data)


if __name__ == '__main__':
    unittest.main()
