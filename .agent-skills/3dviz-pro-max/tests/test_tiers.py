"""Quality-tier contract: a record may declare T0/T2/T3/T4, and each declaration must hold.

The fixtures are the real timber-cottage record copied into a temporary repository, so a test
that passes here passes against the shipped module and the shipped T1 captures, not a stand-in.
T1 is never written by a record: it is the record's own asset and proof, synthesised on read.
"""
import copy
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from blueprint_validation import (ContractError, SKILL, SURFACE_FAMILIES, TIER_ASSET_MAX_BYTES,
                                  blueprint_tiers, validate_blueprint)
from kit_proof_harness import harness_page, surface_settings

RECORD_ID = 'knowledge.blueprint-timber-cottage'
SOURCE = ROOT / SKILL / 'data/knowledge/blueprint/blueprint-timber-cottage.json'
CAPTURES = ('far.png', 'mid.png', 'close.png', 'detail.png')
T2 = {'mode': 'runtime', 'poly_budget': 3468, 'status': 'declared',
      'families': {'#e5dccb': 'plaster', '#6b4f34': 'wood', '#8d5a4a': 'roof-tile'},
      'ao': {'samples': 24, 'radius_m': 0.45, 'ground_dirt_m': 0.6}}
T0 = {'mode': 'proxy', 'size_m': [4.54, 4.73, 4.13], 'poly_budget': 12, 'status': 'generated',
      'note': 'Bevelled box from the proof log bounds_m.'}
T3_MISSING = {'mode': 'gltf', 'status': 'missing', 'note': 'Nothing is baked yet.'}
T4_MISSING = {'mode': 'external', 'status': 'missing', 'note': 'No external asset ships.'}


def shipped_record():
    row = json.loads(SOURCE.read_text(encoding='utf-8'))
    assert row['id'] == RECORD_ID
    return row


def source_record():
    """The legacy shape: the shipped cottage with its tiers stripped, so every test starts from
    a record that declares nothing and adds exactly the tier it is testing."""
    row = copy.deepcopy(shipped_record())
    row.pop('tiers', None)
    return row


class TierContractTests(unittest.TestCase):
    """One real blueprint in a temporary repository; every defective tier must be refused."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = source_record()
        self.assertNotIn('tiers', self.source, 'source_record() strips tiers')
        for relative in (self.source['asset']['path'], 'templates/kits/_harness/index.html'):
            target = self.root / SKILL / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / SKILL / relative, target)
        shutil.copytree(ROOT / 'evidence/kits' / RECORD_ID, self.root / 'evidence/kits' / RECORD_ID)
        self.looks = {look: {'id': look, 'knowledge_kind': 'style-profile'}
                      for look in self.source['fits_looks']}

    def record(self, tiers=None, **overrides):
        row = copy.deepcopy(self.source)
        if tiers is not None:
            row['tiers'] = copy.deepcopy(tiers)
        row.update(overrides)
        return row

    def validate(self, tiers=None, **overrides):
        row = self.record(tiers, **overrides)
        return validate_blueprint(row, {**self.looks, RECORD_ID: row}, self.root)

    def write_tier_proof(self, tier='T2', directory=None, corrupt=False):
        """Four captures and their own proof log, the way `kit-proof.py --tier` writes them."""
        out = self.root / 'evidence/kits' / RECORD_ID / (directory or tier)
        out.mkdir(parents=True, exist_ok=True)
        digests = {}
        for index, name in enumerate(CAPTURES):
            data = f'{tier} capture {index}'.encode()
            (out / name).write_bytes(data)
            digests[name] = hashlib.sha256(b'edited' if corrupt else data).hexdigest()
        (out / 'proof-log.json').write_text(json.dumps({'tier': tier, 'captures': digests}))
        base = f'evidence/kits/{RECORD_ID}/{directory or tier}'
        return {'harness': 'templates/kits/_harness/index.html',
                'detail_socket': 'door', 'log': f'{base}/proof-log.json',
                'captures': [f'{base}/{name}' for name in CAPTURES]}

    def test_the_shipped_cottage_declares_a_proved_t2_and_no_t1(self):
        shipped = shipped_record()
        tiers = shipped['tiers']
        self.assertNotIn('T1', tiers)
        self.assertEqual(tiers['T2']['status'], 'proved')
        # 9C shipped the baked hero and 9D captured it at --tier T3 after the 16 px margin rebake.
        self.assertEqual(tiers['T3']['status'], 'proved')
        self.assertTrue(tiers['T3']['proof']['captures'][0]
                        .startswith(f'evidence/kits/{RECORD_ID}/T3/'))
        self.assertEqual(blueprint_tiers(shipped)['T1']['asset'], shipped['asset'])

    def test_a_legacy_record_without_tiers_stays_valid(self):
        self.validate()

    def test_blueprint_tiers_synthesises_t1_from_the_record_itself(self):
        tiers = blueprint_tiers(self.record({'T0': T0}))
        self.assertEqual(sorted(tiers), ['T0', 'T1'])
        self.assertEqual(tiers['T1']['mode'], 'module')
        self.assertEqual(tiers['T1']['status'], 'proved')
        self.assertEqual(tiers['T1']['asset'], self.source['asset'])
        self.assertEqual(tiers['T1']['proof'], self.source['proof'])
        self.assertEqual(tiers['T1']['poly_budget'], self.source['poly_budget'])
        self.assertNotIn('tiers', self.source, 'the view must not write back into the record')

    def test_a_full_tier_block_passes(self):
        self.validate({'T0': T0, 'T2': {**T2, 'status': 'proved',
                                        'proof': self.write_tier_proof()},
                       'T3': T3_MISSING, 'T4': T4_MISSING})

    def test_a_declared_t1_is_refused(self):
        with self.assertRaisesRegex(ContractError, 'T1 is the record asset'):
            self.validate({'T1': {'mode': 'module', 'status': 'proved'}})

    def test_an_unknown_tier_name_is_refused(self):
        with self.assertRaisesRegex(ContractError, 'unknown tier T5'):
            self.validate({'T5': {'mode': 'runtime', 'status': 'declared'}})

    def test_an_unknown_key_inside_a_tier_is_refused(self):
        with self.assertRaisesRegex(ContractError, 'unknown key shininess'):
            self.validate({'T0': {**T0, 'shininess': 3}})

    def test_a_wrong_mode_for_a_tier_is_refused(self):
        with self.assertRaisesRegex(ContractError, 'T2 is mode runtime'):
            self.validate({'T2': {**T2, 'mode': 'gltf'}})

    def test_an_invalid_status_is_refused(self):
        with self.assertRaisesRegex(ContractError, 'status'):
            self.validate({'T0': {**T0, 'status': 'shipped'}})

    def test_a_runtime_tier_that_names_an_asset_is_refused(self):
        asset = {'kind': 'gltf-asset', 'path': 'templates/kits/gltf/cottage.glb'}
        with self.assertRaisesRegex(ContractError, 'a runtime tier ships no file'):
            self.validate({'T2': {**T2, 'asset': asset}})

    def test_a_runtime_tier_with_an_unknown_material_family_is_refused(self):
        with self.assertRaisesRegex(ContractError, 'unknown material family velvet'):
            self.validate({'T2': {**T2, 'families': {'#6b4f34': 'velvet'}}})

    def test_a_runtime_tier_with_a_malformed_colour_key_is_refused(self):
        with self.assertRaisesRegex(ContractError, 'not a #rrggbb colour'):
            self.validate({'T2': {**T2, 'families': {'6B4F34': 'wood'}}})

    def test_a_proved_runtime_tier_without_a_proof_is_refused(self):
        with self.assertRaisesRegex(ContractError, 'a proved tier needs a proof'):
            self.validate({'T2': {**T2, 'status': 'proved'}})

    def test_a_proxy_tier_without_size_m_is_refused(self):
        proxy = {key: value for key, value in T0.items() if key != 'size_m'}
        with self.assertRaisesRegex(ContractError, 'three positive numbers'):
            self.validate({'T0': proxy})

    def test_a_proxy_tier_with_a_negative_size_is_refused(self):
        with self.assertRaisesRegex(ContractError, 'three positive numbers'):
            self.validate({'T0': {**T0, 'size_m': [4.54, -1, 4.13]}})

    def test_a_gltf_tier_whose_file_is_absent_is_refused(self):
        tier = {'mode': 'gltf', 'status': 'proved',
                'asset': {'kind': 'gltf-asset', 'path': 'templates/kits/gltf/cottage-hero.glb'}}
        with self.assertRaisesRegex(ContractError, 'missing templates/kits/gltf/cottage-hero.glb'):
            self.validate({'T3': tier})

    def test_a_gltf_tier_over_the_tier_cap_is_refused(self):
        hero = self.root / SKILL / 'templates/kits/gltf/cottage-hero.glb'
        hero.parent.mkdir(parents=True, exist_ok=True)
        hero.write_bytes(b'g' * (TIER_ASSET_MAX_BYTES['T3'] + 1))
        tier = {'mode': 'gltf', 'status': 'proved',
                'asset': {'kind': 'gltf-asset', 'path': 'templates/kits/gltf/cottage-hero.glb'}}
        with self.assertRaisesRegex(ContractError, f'over {TIER_ASSET_MAX_BYTES["T3"]} bytes'):
            self.validate({'T3': tier})

    def test_a_missing_gltf_tier_may_not_name_a_file_and_must_say_why(self):
        with self.assertRaisesRegex(ContractError, 'note'):
            self.validate({'T3': {'mode': 'gltf', 'status': 'missing'}})
        asset = {'kind': 'gltf-asset', 'path': 'templates/kits/gltf/cottage-hero.glb'}
        with self.assertRaisesRegex(ContractError, 'a missing tier ships no file'):
            self.validate({'T3': {**T3_MISSING, 'asset': asset}})

    def test_an_external_tier_may_only_be_missing_or_declared(self):
        with self.assertRaisesRegex(ContractError, 'only missing or declared'):
            self.validate({'T4': {**T4_MISSING, 'status': 'proved'}})

    def test_a_tier_capture_that_does_not_match_its_own_proof_log_is_refused(self):
        proof = self.write_tier_proof(corrupt=True)
        with self.assertRaisesRegex(ContractError, 'sha256 mismatch'):
            self.validate({'T2': {**T2, 'status': 'proved', 'proof': proof}})

    def test_tier_captures_outside_the_tier_directory_are_refused(self):
        proof = self.write_tier_proof(directory='shots')
        with self.assertRaisesRegex(ContractError, f'capture outside evidence/kits/{RECORD_ID}/T2/'):
            self.validate({'T2': {**T2, 'status': 'proved', 'proof': proof}})

    def test_the_t1_captures_are_not_a_valid_t2_proof(self):
        """The T1 proof verifies at T1 and nowhere else: same basenames, different directory."""
        with self.assertRaisesRegex(ContractError, 'capture outside'):
            self.validate({'T2': {**T2, 'status': 'proved',
                                  'proof': copy.deepcopy(self.source['proof'])}})


class SurfaceFamilyTests(unittest.TestCase):
    """One family list in four places: the validator, the JSON schema, the kit's FAMILIES export
    and the drawn generators. A family missing from any of them cannot honestly be authored into
    a record - the validator would accept a name that draws nothing, or refuse one that draws."""

    def kit(self, name):
        return (ROOT / SKILL / 'templates/kits' / name).read_text(encoding='utf-8')

    def keys(self, text, marker):
        """The literal keys of the object that opens at `marker` (one-line object literals)."""
        body = text.split(marker, 1)[1].split('}', 1)[0]
        return {entry.split(':')[0].strip().strip("'") for entry in body.split(',') if entry.strip()}

    def test_the_validator_and_the_schema_declare_the_same_families(self):
        schema = json.loads((ROOT / 'schemas/knowledge.schema.json').read_text(encoding='utf-8'))
        enum = (schema['properties']['tiers']['additionalProperties']['properties']['families']
                ['additionalProperties']['enum'])
        self.assertEqual(set(enum), SURFACE_FAMILIES)
        self.assertEqual(len(enum), len(set(enum)), 'the schema enum lists each family once')

    def test_every_declarable_family_is_exported_styled_and_drawn(self):
        listed = re.search(r'export const FAMILIES = \[(.*?)\];', self.kit('kit-surface.js'),
                           re.S)
        self.assertIsNotNone(listed, 'kit-surface.js still exports FAMILIES')
        self.assertEqual(set(re.findall(r"'([a-z-]+)'", listed.group(1))), SURFACE_FAMILIES)
        draw = self.kit('kit-surface-draw.js')
        styled = set(re.findall(r"^  '?([a-z-]+)'?: \{ tile_m", draw, re.M))
        self.assertEqual(styled, SURFACE_FAMILIES, 'every family needs a STYLE row')
        drawn = (self.keys(draw, 'const GENERATORS = {')
                 | self.keys(self.kit('kit-surface-draw-organic.js'), 'export const ORGANIC = {'))
        self.assertEqual(drawn, SURFACE_FAMILIES, 'every family needs a generator')


class TierHarnessTests(unittest.TestCase):
    """What `kit-proof.py --tier` hands the browser: two meta names and one module path."""

    def setUp(self):
        self.record = source_record()

    def page(self, tier, surface=None, record=None):
        return harness_page(ROOT, record or self.record, '{}', tier, surface)

    def test_t1_is_unchanged_apart_from_the_tier_name(self):
        page = self.page('T1')
        self.assertIn('<meta name="tier" content="T1">', page)
        self.assertNotIn('name="surface"', page)
        self.assertIn('<meta name="module" content="../buildings/timber-cottage.js">', page)

    def test_a_t2_page_carries_the_surface_settings_it_was_built_with(self):
        record = copy.deepcopy(self.record)
        record['tiers'] = {'T2': copy.deepcopy(T2)}
        surface = surface_settings(record)
        self.assertEqual(surface['families'], T2['families'])
        self.assertEqual(surface['seed'], 1)
        self.assertEqual(sorted(surface['ao']), ['ground_dirt_m', 'radius_m', 'samples'])
        page = self.page('T2', surface, record)
        self.assertIn('<meta name="tier" content="T2">', page)
        self.assertIn(f'<meta name="surface" content=\'{json.dumps(surface, separators=(",", ":"))}\'>',
                      page)

    def test_a_t3_page_loads_the_baked_glb_itself(self):
        record = copy.deepcopy(self.record)
        record['tiers'] = {'T3': {'mode': 'gltf', 'status': 'proved',
                                  'asset': {'kind': 'gltf-asset',
                                            'path': 'templates/kits/gltf/cottage-hero.glb'}}}
        # The harness loads a file asset through GLTFLoader: `buildKit` calls its factory
        # synchronously and a wrapper's create() returns a Promise. A project still imports the
        # sibling .js wrapper, which loads this same file (see kit_proof_harness.tier_asset).
        self.assertIn('<meta name="module" content="../gltf/cottage-hero.glb">',
                      self.page('T3', None, record))

    def test_surface_settings_fall_back_to_the_authored_defaults(self):
        surface = surface_settings(self.record)
        self.assertEqual(surface, {'families': {}, 'seed': 1, 'size': 1024,
                                   'ao': {'samples': 13, 'radius_m': 0.45, 'ground_dirt_m': 0.6}})

    def test_kit_proof_exposes_the_tier_flag(self):
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/kit-proof.py'), '--help'],
                                capture_output=True, text=True, cwd=ROOT)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('--tier {T0,T1,T2,T3}', result.stdout)


if __name__ == '__main__':
    unittest.main()
