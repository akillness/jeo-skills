import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'skills/3dviz-pro-max/scripts'))
from catalog import load_catalog
from search import build_parser, search, tokens


class SearchTests(unittest.TestCase):
    def setUp(self):
        self.manifest, self.records, _ = load_catalog()

    def test_field_selection_excludes_negative_and_source_prose(self):
        records = copy.deepcopy(self.records)
        records[0]['not_for'] = 'zebrasentinel'
        records[0]['source_ids'] = ['zebrasentinel']
        self.assertEqual(search('zebrasentinel', self.manifest, records)['status'], 'no-match')

    def test_matrix_query_and_structured_exclusion(self):
        result = search('basis matrix shear', self.manifest, self.records)
        self.assertEqual(result['results'][0]['id'], 'recipe.linear-transformation-3d')
        result = search('basis matrix shear', self.manifest, self.records,
                        exclude_ids=['recipe.linear-transformation-3d'])
        self.assertFalse(any(r['id'] == 'recipe.linear-transformation-3d' for r in result['results']))

    def test_subject_terms_are_retrievable_without_matching_title(self):
        records = copy.deepcopy(self.records)
        records[0]['subject_terms'] = ['specializeddomainterm']
        result = search('specializeddomainterm', self.manifest, records)
        self.assertEqual(result['results'][0]['id'], records[0]['id'])
        self.assertIn('subject_terms', result['results'][0]['matched_fields'])

    def test_empty_unknown_and_notation(self):
        self.assertEqual(search('', self.manifest, self.records)['status'], 'no-match')
        self.assertEqual(search('zebrasentinel', self.manifest, self.records)['status'], 'no-match')
        self.assertEqual(tokens("3×3 R’"), ['3×3', "r'"])

    def test_applicability_conditions_are_searchable_candidates(self):
        manifest, records, _ = load_catalog(collection='knowledge')
        records = copy.deepcopy(records)
        records[0]['applies_when'] = ['When the user requests applicabilitysentinel']
        result = search('applicabilitysentinel', manifest, records, collection='knowledge')
        self.assertEqual(result['results'][0]['id'], records[0]['id'])
        self.assertIn('applies_when', result['results'][0]['matched_fields'])
        self.assertEqual(result['status'], 'candidates')

    def test_alias_collision_is_not_silently_resolved(self):
        records = copy.deepcopy(self.records)
        for r in records[:2]:
            r['aliases']['en'] = ['shared alias']
        self.assertEqual(search('shared alias', self.manifest, records)['status'], 'ambiguous')

    def test_hash_changes_after_data_edit(self):
        before = search('cube', self.manifest, self.records)['catalog_hash']
        records = copy.deepcopy(self.records)
        records[0]['summary'] += ' A newly curated idea.'
        self.assertNotEqual(before, search('cube', self.manifest, records)['catalog_hash'])

    def test_alias_expansion_reaches_knowledge_records(self):
        manifest, records, _ = load_catalog(collection='all')
        manifest = copy.deepcopy(manifest)
        manifest['search']['query_aliases'] = {'zebrapainterly': ['painterly']}
        result = search('zebrapainterly', manifest, records, collection='all')
        self.assertIn('painterly', result['expanded_terms'])
        self.assertIn('knowledge.style-painterly', [r['id'] for r in result['results'][:3]])
        # A phrase alias must not fire inside a longer word.
        self.assertEqual(search('zebrapainterlyish', manifest, records,
                                collection='all')['expanded_terms'], [])

    def test_default_collection_is_all_in_cli(self):
        args = build_parser().parse_args(['golden hour'])
        self.assertEqual(args.collection, 'all')
        self.assertIsNone(args.kind)

    def test_raw_negation_is_only_candidate_not_intent(self):
        result = search('no cube', self.manifest, self.records)
        self.assertNotEqual(result['status'], 'matched')
        self.assertIn('negation', result['notice'])


if __name__ == '__main__':
    unittest.main()
