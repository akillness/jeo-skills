"""Optional knowledge boundaries: retrieval, relationships, provenance and packaging."""
import copy
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
sys.path.insert(0, str(ROOT / 'skills/3dviz-pro-max/scripts'))
from catalog import load_catalog as installed_catalog
from catalog_validation import ContractError, load_catalog, validate_knowledge
from evidence_validation import CANONICAL, content_hash, validate_event
from manifest_contract import KNOWLEDGE_KINDS
from search import search


class KnowledgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.skill = self.root / 'skills/3dviz-pro-max'
        shutil.copytree(ROOT / 'skills/3dviz-pro-max', self.skill,
                        ignore=shutil.ignore_patterns('__pycache__'))
        self.data = self.skill / 'data'
        manifest = json.loads((self.data / 'manifest.json').read_text())
        # A catalog without optional knowledge must not retain recipes that reference it.
        seed = next(row for row in installed_catalog(self.skill, 'recipes')[1]
                    if row['id'] == 'recipe.linear-transformation-3d')
        seed.pop('_path', None)
        # These fixtures exercise supported legacy catalogs with array shards.
        manifest.pop('layout_version', None)
        self.recipe_path = self.data / 'recipes/test-recipes.json'
        self.recipe_path.write_text(json.dumps([seed]))
        manifest['collections']['recipes'] = 'recipes/test-recipes.json'
        manifest['collections'].pop('knowledge', None)
        (self.data / 'manifest.json').write_text(json.dumps(manifest))
        self.recipes, self.sources, self.directions = load_catalog(self.root)
        self.record = copy.deepcopy(self.recipes['recipe.linear-transformation-3d'])
        self.record.update(id='knowledge.test-material', knowledge_kind='material-profile',
                           title={'en': 'Sentinel material'}, aliases={'en': ['uniqueknowledgefixtureterm']},
                           content={key: ['An observable statement.'] for key in
                                    ('principles', 'implementation', 'observable_checks')},
                           related_ids=['recipe.linear-transformation-3d'])
        for index, claim in enumerate(self.record['claims']):
            claim['id'] = f'claim.knowledge-sentinel-{index}'

    def install_knowledge(self):
        path = self.data / 'knowledge'
        if path.exists():
            shutil.rmtree(path)
        path.mkdir()
        (path / 'test.json').write_text(json.dumps([self.record]))
        manifest = json.loads((self.data / 'manifest.json').read_text())
        manifest['collections']['knowledge'] = 'knowledge/*.json'
        (self.data / 'manifest.json').write_text(json.dumps(manifest))

    def test_optional_collection_preserves_recipe_callers(self):
        self.assertEqual(installed_catalog(self.skill, 'knowledge')[1], [])
        self.assertEqual(load_catalog(self.root, 'knowledge')[0], {})
        self.install_knowledge()
        self.assertEqual(set(load_catalog(self.root)[0]), set(self.recipes))
        self.assertEqual(len(installed_catalog(self.skill)[1]), len(self.recipes))
        self.assertEqual(len(installed_catalog(self.skill, 'all')[1]), len(self.recipes) + 1)
        linked_recipe = copy.deepcopy(self.recipes['recipe.linear-transformation-3d'])
        linked_recipe['related_ids'] = [self.record['id']]
        self.recipe_path.write_text(json.dumps([linked_recipe]))
        self.assertEqual(set(load_catalog(self.root)[0]), set(self.recipes))
        manifest = json.loads((self.data / 'manifest.json').read_text())
        manifest['collections'].pop('knowledge')
        (self.data / 'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ContractError, 'unknown related record'):
            load_catalog(self.root)

    def test_family_content_and_source_boundaries(self):
        for kind in KNOWLEDGE_KINDS:
            self.record['knowledge_kind'] = kind
            self.record.update(applies_when=['The relevant model is selected.'],
                               constraint_level='advisory', check_method='state')
            validate_knowledge(self.record, self.sources, self.directions)
        for field, value, message in [('knowledge_kind', 'unknown', 'knowledge_kind'),
                                      ('content', {'principles': []}, 'nonempty')]:
            changed = {**self.record, field: value}
            with self.assertRaisesRegex(ContractError, message):
                validate_knowledge(changed, self.sources, self.directions)
        self.record['claims'][0]['source_refs'][0]['source_id'] = 'source.missing'
        with self.assertRaisesRegex(ContractError, 'unknown source'):
            validate_knowledge(self.record, self.sources, self.directions)

    def test_reasoning_and_domain_checks_need_applicability_and_method(self):
        for kind, field, value in [('reasoning-rule', 'constraint_level', 'advisory'),
                                   ('domain-validation', 'check_method', 'analytic')]:
            row = {**self.record, 'knowledge_kind': kind, 'applies_when': ['A bounded model is used.']}
            with self.assertRaisesRegex(ContractError, field):
                validate_knowledge(row, self.sources, self.directions)
            row[field] = value
            validate_knowledge(row, self.sources, self.directions)
            row['applies_when'] = []
            with self.assertRaisesRegex(ContractError, 'nonempty'):
                validate_knowledge(row, self.sources, self.directions)

    def test_dangling_relationship_and_global_claim_collision(self):
        self.record['related_ids'] = ['knowledge.missing']
        self.install_knowledge()
        with self.assertRaisesRegex(ContractError, 'unknown related record'):
            load_catalog(self.root)
        self.record['related_ids'] = []
        self.record['claims'][0]['id'] = self.recipes['recipe.linear-transformation-3d']['claims'][0]['id']
        self.install_knowledge()
        with self.assertRaisesRegex(ContractError, 'duplicate global claim'):
            load_catalog(self.root)

    def test_search_filter_hash_source_lookup_and_installed_cli(self):
        self.install_knowledge()
        manifest, records, sources = installed_catalog(self.skill, 'all')
        self.assertEqual(search('uniqueknowledgefixtureterm', manifest, records)['results'], [])
        result = search('uniqueknowledgefixtureterm', manifest, records, collection='knowledge', kind='material-profile')
        found = result['results'][0]
        self.assertEqual((found['id'], found['collection'], found['kind']),
                         (self.record['id'], 'knowledge', 'material-profile'))
        self.assertEqual(search('uniqueknowledgefixtureterm', manifest, records, collection='all',
                                kind='tool-adapter')['results'], [])
        source_ids = {s['id'] for s in sources}
        self.assertTrue(all(ref['source_id'] in source_ids for c in self.record['claims']
                            for ref in c['source_refs']))
        changed = copy.deepcopy(records)
        changed[-1]['content']['principles'].append('Changed guidance.')
        self.assertNotEqual(result['catalog_hash'], search('uniqueknowledgefixtureterm', manifest, changed,
                                                           collection='knowledge')['catalog_hash'])
        output = subprocess.check_output([sys.executable, str(self.skill / 'scripts/search.py'),
                                          'uniqueknowledgefixtureterm', '--collection', 'knowledge',
                                          '--kind', 'material-profile'], cwd=self.root, text=True)
        self.assertEqual(json.loads(output)['results'][0]['id'], self.record['id'])

    def test_knowledge_evidence_hash_claim_and_collection(self):
        records = {**self.recipes, self.record['id']: self.record}
        event = {'schema_version': 1, 'event_id': 'test-knowledge', 'change_id': 'test',
                 'timestamp': '2026-09-07T00:00:00Z', 'summary': 'Curate reusable knowledge.',
                 'actor': {'kind': 'agent', 'name': 'test'}, 'event_type': 'change-proposed',
                 'record_refs': [{'collection': 'knowledge', 'record_id': self.record['id'],
                                  'revision': self.record['revision']}],
                 'payload': {'before_hash': None, 'after_hash': content_hash(self.record),
                             'hash_algorithm': 'sha256', 'canonicalization': CANONICAL}}
        validate_event(event, records, self.sources, self.root, 'test')
        event['payload']['after_hash'] = '0' * 64
        with self.assertRaisesRegex(ContractError, 'content mismatch'):
            validate_event(event, records, self.sources, self.root, 'test')
        claim = self.record['claims'][0]
        event.update(event_type='source-read', payload={
            'source_id': claim['source_refs'][0]['source_id'], 'locator': 'Selected section',
            'source_version': 'Accessed source', 'accessed_at': '2026-09-07',
            'supported_claim_ids': [claim['id']]})
        validate_event(event, records, self.sources, self.root, 'test')
        event['record_refs'][0]['collection'] = 'recipes'
        with self.assertRaisesRegex(ContractError, 'collection does not match'):
            validate_event(event, records, self.sources, self.root, 'test')


if __name__ == '__main__':
    unittest.main()
