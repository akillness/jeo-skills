import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1] / 'skills/3dviz-pro-max/scripts'
sys.path.insert(0, str(SCRIPTS))
from catalog import load_catalog
from resolve import resolve

spec = importlib.util.spec_from_file_location('design_context', SCRIPTS / 'design-context.py')
context = importlib.util.module_from_spec(spec)
spec.loader.exec_module(context)
import quality_brief  # noqa: E402  (imported through the same scripts path)

HOST = {'quality_ceiling': 'T3', 'quality_ceiling_reason': 'Blender 5.2.1 >= 4.2 found',
        'capture_mode_expected': 'gpu'}
HOST_T2 = {'quality_ceiling': 'T2', 'quality_ceiling_reason': 'no runnable Blender',
           'capture_mode_expected': 'swiftshader'}
WATERMILL = 'knowledge.blueprint-watermill'
TREE = 'knowledge.blueprint-tree-round'
LOOKS = ['knowledge.style-ghibli-painterly-pastoral']


class ContextTests(unittest.TestCase):
    def setUp(self):
        self.manifest, self.records, self.sources = load_catalog(collection='all')
        self.by_id = {record['id']: record for record in self.records}

    def test_resolve_exact_selection_and_only_cited_sources(self):
        rid = 'recipe.linear-transformation-3d'
        result = resolve([rid, rid], self.manifest, self.records, self.sources)
        self.assertEqual([r['id'] for r in result['records']], [rid])
        expected = {ref['source_id'] for claim in result['records'][0]['claims']
                    for ref in claim['source_refs']}
        self.assertEqual({s['id'] for s in result['sources']}, expected)
        changed = copy.deepcopy(self.sources)
        for source in changed:
            if source['id'] in expected:
                source['scope'] += ' Clarified scope.'
        updated = resolve([rid], self.manifest, self.records, changed)
        self.assertNotEqual(result['bundle_hash'], updated['bundle_hash'])
        with self.assertRaisesRegex(ValueError, 'Unknown record'):
            resolve(['recipe.missing'], self.manifest, self.records, self.sources)
        with self.assertRaises(ValueError) as caught:
            resolve(['recipe.fantasy-village'], self.manifest, self.records, self.sources)
        self.assertRegex(str(caught.exception), 'did you mean')

    def test_related_traversal_is_one_hop_and_detects_dangling_links(self):
        records = copy.deepcopy(self.records[:3])
        first, second, third = [r['id'] for r in records]
        records[0]['related_ids'] = [second]
        records[1]['related_ids'] = [third]
        result = resolve([first], self.manifest, records, self.sources, related=True)
        self.assertEqual([r['id'] for r in result['records']], [first, second])
        records[0]['related_ids'] = ['recipe.missing']
        with self.assertRaisesRegex(ValueError, 'Dangling relationship'):
            resolve([first], self.manifest, records, self.sources, related=True)

    def test_context_honors_family_and_exclusions_without_claiming_design(self):
        result = context.gather('gravity contact', self.manifest, self.records, self.sources,
                                kinds=['physical-behavior'],
                                exclude_ids=['knowledge.gravity-contact'])
        knowledge = result['candidate_groups']['physical-behavior']['results']
        self.assertTrue(all(r['kind'] == 'physical-behavior' for r in knowledge))
        self.assertNotIn('knowledge.gravity-contact', result['context']['selected_ids'])
        self.assertEqual(context.gather('zebrasentinel', self.manifest, self.records,
                                      self.sources)['status'], 'no-match')
        with self.assertRaises(ValueError):
            context.gather(' ', self.manifest, self.records, self.sources)

    def test_blueprints_filter_by_look_without_ranking(self):
        looks = ['knowledge.style-ghibli-painterly-pastoral']
        result = context.gather('cosy riverside village at dusk', self.manifest, self.records,
                                self.sources, blueprints=True, looks=looks)
        rows = result['blueprints']
        self.assertGreaterEqual(len(rows), 5)
        self.assertEqual([r['id'] for r in rows], sorted(r['id'] for r in rows))
        for row in rows:
            self.assertTrue(row['asset'].startswith('templates/kits/'))
            self.assertEqual(len(row['footprint_m']), 2)
            self.assertTrue(row['sockets'])
            self.assertEqual(set(row['detail_ladder']), {'silhouette', 'medium', 'fine'})
            self.assertIn(looks[0], self.by_id[row['id']]['fits_looks'])
        self.assertIn('Reuse, adapt, reject or combine', result['next_step'])
        # No score, no top-k: a filter must not present itself as a judgement.
        self.assertNotIn('score', rows[0])

    def test_blueprints_edges_empty_unfiltered_and_unknown_look(self):
        unmatched = context.gather('village', self.manifest, self.records, self.sources,
                                   blueprints=True, looks=['knowledge.style-neon-noir-rain'])
        self.assertEqual(unmatched['blueprints'], [])
        self.assertEqual(unmatched['status'],
                         context.gather('village', self.manifest, self.records,
                                        self.sources)['status'])
        every = context.gather('village', self.manifest, self.records, self.sources,
                               blueprints=True)
        self.assertEqual(len(every['blueprints']),
                         len([r for r in self.records
                              if r.get('knowledge_kind') == 'blueprint' and r['status'] == 'active']))
        plain = context.gather('village', self.manifest, self.records, self.sources)
        self.assertNotIn('blueprints', plain)
        self.assertNotIn('Assemble from', plain['next_step'])
        with self.assertRaisesRegex(ValueError, 'Unknown record IDs'):
            context.gather('village', self.manifest, self.records, self.sources,
                           blueprints=True, looks=['knowledge.style-does-not-exist'])
        with self.assertRaisesRegex(ValueError, 'style, theme or lighting'):
            context.gather('village', self.manifest, self.records, self.sources,
                           blueprints=True, looks=['knowledge.blueprint-watermill'])
        with self.assertRaisesRegex(ValueError, 'only applies with'):
            context.gather('village', self.manifest, self.records, self.sources,
                           looks=['knowledge.style-ghibli-painterly-pastoral'])

    def brief(self, host=HOST, delivery='web-desktop', heroes=(WATERMILL,)):
        result = context.gather('cosy riverside village at dusk', self.manifest, self.records,
                                self.sources, blueprints=True, looks=LOOKS, host=host,
                                delivery=delivery, heroes=list(heroes))
        return result['quality_brief']

    def test_the_brief_names_a_tier_and_a_reason_for_every_listed_blueprint(self):
        brief = self.brief()
        listed = {row['id'] for row in context.gather(
            'cosy riverside village at dusk', self.manifest, self.records, self.sources,
            blueprints=True, looks=LOOKS)['blueprints']}
        self.assertEqual(set(brief['per_blueprint']), listed)
        for rid, row in brief['per_blueprint'].items():
            self.assertIn(row['role'], ('hero', 'mid', 'background'))
            self.assertIn(row['tier'], ('T0', 'T1', 'T2', 'T3'))
            self.assertTrue(row['reason'].strip(), rid)
        self.assertEqual((brief['ceiling'], brief['delivery'], brief['capture_mode_expected']),
                         ('T3', 'web-desktop', 'gpu'))
        self.assertIn('4,773 draw calls', brief['draw_call_note'])
        self.assertIn('InstancedMesh', brief['draw_call_note'])
        self.assertIn('not limits', brief['note'])
        self.assertEqual(set(brief['role_rules']), {'hero', 'mid', 'background'})

    def test_a_tier_the_record_calls_missing_is_never_recommended(self):
        row = self.brief()['per_blueprint'][WATERMILL]
        # The watermill declares a shipped T3 since phase 9C, so the hero gets the ceiling; the
        # barrel below still declares T3 missing and must drop to its highest proved tier.
        # tier and the reason says which status it stepped over.
        self.assertEqual((row['role'], row['tier']), ('hero', 'T3'))
        self.assertIn('T3', row['reason'])
        for rid, entry in self.brief()['per_blueprint'].items():
            tiers = quality_brief.tier_view(self.by_id[rid])
            declared = tiers.get(entry['tier'])
            self.assertIsNotNone(declared, rid)
            self.assertNotIn(declared['status'], quality_brief.UNAVAILABLE, rid)

    def test_a_record_with_no_tiers_block_is_recommended_at_t1(self):
        # Since phase 9D every shipped blueprint declares tiers, so the legacy shape is
        # synthesised here rather than borrowed from the catalog: strip one record's tiers
        # and the brief must fall back to T1 with the reason that says why.
        records = copy.deepcopy(self.records)
        stripped = None
        for record in records:
            if (record.get('knowledge_kind') == 'blueprint' and record.get('tiers')
                    and set(LOOKS).intersection(record.get('fits_looks', []))):
                record.pop('tiers')
                stripped = record['id']
                break
        self.assertIsNotNone(stripped, 'the catalog needs at least one blueprint with tiers')
        brief = context.gather('cosy riverside village at dusk', self.manifest, records,
                               self.sources, blueprints=True, looks=LOOKS, host=HOST,
                               delivery='web-desktop',
                               heroes=[WATERMILL])['quality_brief']
        row = brief['per_blueprint'][stripped]
        self.assertEqual(row['tier'], 'T1', stripped)
        self.assertIn('declares no T2 yet', row['reason'])

    def test_instanced_repeats_are_background_and_web_mobile_drops_them_to_t0(self):
        self.assertEqual(self.brief()['scope'], 'shipped-kit-pipelines')
        desktop = self.brief()['per_blueprint'][TREE]
        self.assertEqual((desktop['role'], desktop['tier']), ('background', 'T1'))
        self.assertIn('one draw call', desktop['reason'])
        mobile = self.brief(delivery='web-mobile')['per_blueprint'][TREE]
        self.assertEqual(mobile['tier'], 'T0')
        self.assertIn('web-mobile', mobile['reason'])

    def test_the_delivery_target_caps_the_hero_and_the_ceiling_lowers_it(self):
        self.assertEqual(self.brief(delivery='presentation')['per_blueprint'][WATERMILL]['tier'],
                         'T2')
        capped = self.brief(delivery='presentation')['per_blueprint'][WATERMILL]['reason']
        self.assertIn('presentation caps it at T2', capped)
        lower = self.brief(host=HOST_T2)['per_blueprint'][WATERMILL]
        self.assertEqual((lower['tier'], self.brief(host=HOST_T2)['ceiling']), ('T3', 'T2'))
        self.assertIn('proved shipped T3 GLB', lower['reason'])
        self.assertIn('host bake ceiling T2', lower['reason'])

    def test_shipped_glb_reuse_requires_proof_and_an_existing_asset(self):
        record = copy.deepcopy(self.by_id[WATERMILL])
        for status, path in [('not-proved', record['tiers']['T3']['asset']['path']),
                             ('proved', 'templates/kits/gltf/absent.glb')]:
            record['tiers']['T3']['status'] = status
            record['tiers']['T3']['asset']['path'] = path
            tier, _ = quality_brief.recommend(record, 'hero', 'T2', 'web-desktop')
            self.assertEqual(tier, 'T2')
        self.assertNotIn('custom geometry only', context.ASSEMBLY_STEP)

    def test_a_plain_run_still_has_no_quality_brief(self):
        result = context.gather('village', self.manifest, self.records, self.sources,
                                blueprints=True, looks=LOOKS)
        self.assertNotIn('quality_brief', result)

    def test_the_brief_flags_refuse_the_combinations_that_cannot_mean_anything(self):
        with self.assertRaisesRegex(ValueError, 'only apply with'):
            context.gather('village', self.manifest, self.records, self.sources, host=HOST)
        with self.assertRaisesRegex(ValueError, 'only apply with'):
            context.gather('village', self.manifest, self.records, self.sources,
                           heroes=[WATERMILL])
        with self.assertRaisesRegex(ValueError, 'host-probe.py'):
            context.gather('village', self.manifest, self.records, self.sources,
                           blueprints=True, heroes=[WATERMILL])
        with self.assertRaisesRegex(ValueError, 'Unknown delivery target'):
            context.gather('village', self.manifest, self.records, self.sources,
                           blueprints=True, host=HOST, delivery='billboard')
        with self.assertRaisesRegex(ValueError, 'not listed blueprints'):
            context.gather('village', self.manifest, self.records, self.sources, blueprints=True,
                           looks=LOOKS, host=HOST, heroes=['knowledge.blueprint-nope'])

    def test_an_unreadable_host_file_names_the_probe_command(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / 'host.json'
            with self.assertRaisesRegex(ValueError, 'host-probe.py'):
                quality_brief.load_host(missing)
            missing.write_text('not json')
            with self.assertRaisesRegex(ValueError, 'host-probe.py'):
                quality_brief.load_host(missing)
            missing.write_text(json.dumps({'os': {}}))
            with self.assertRaisesRegex(ValueError, 'no quality_ceiling'):
                quality_brief.load_host(missing)
            missing.write_text(json.dumps(HOST))
            self.assertEqual(quality_brief.load_host(missing)['quality_ceiling'], 'T3')

    def test_the_tier_view_matches_the_validator(self):
        from blueprint_validation import blueprint_tiers
        for rid in (WATERMILL, TREE):
            self.assertEqual(quality_brief.tier_view(self.by_id[rid]),
                             blueprint_tiers(self.by_id[rid]))

    def test_resolve_prints_a_runnable_snippet_for_every_blueprint(self):
        ids = [r['id'] for r in self.records if r.get('knowledge_kind') == 'blueprint']
        self.assertEqual(len(ids), 22)
        result = resolve(ids, self.manifest, self.records, self.sources)
        for rid in ids:
            usage = result['blueprints'][rid]
            record = self.by_id[rid]
            self.assertEqual(usage['asset'], record['asset']['path'])
            self.assertEqual(usage['sockets'], [s['name'] for s in record['sockets']])
            self.assertEqual(usage['params'], {p['name']: p['default'] for p in record['params']})
            self.assertIn(f"import {{ {usage['factory']} }} from './", usage['snippet'])
            self.assertIn('scene.add(group);', usage['snippet'])
            # The import path is the callable module relative to templates/kits/, so a copied-out
            # kit folder resolves it unchanged. A .glb record imports its loader wrapper and awaits.
            imported = usage['snippet'].split("from './")[1].split("';")[0]
            self.assertTrue(usage['module'].endswith(imported))
            self.assertTrue(usage['module'].endswith('.js'))
            self.assertEqual(usage['awaits'], record['asset']['kind'] == 'gltf-asset')
            self.assertEqual(f'await {usage["factory"]}(' in usage['snippet'], usage['awaits'])
            self.assertTrue((SCRIPTS.parents[0] / usage['module']).is_file())


if __name__ == '__main__':
    unittest.main()
