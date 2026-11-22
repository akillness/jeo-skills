"""Blueprint contract: the record, the module and the proof must agree, or nothing ships."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import struct
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
sys.path.insert(0, str(ROOT / 'skills/3dviz-pro-max/scripts'))
from blueprint_validation import ASSET_MAX_BYTES, SKILL, asset_ref, validate_blueprint
from catalog_validation import ContractError, load_catalog
from evidence_log_events import check_run_event, curated_event
from evidence_validation import load_evidence
from manifest_contract import KNOWLEDGE_KINDS
from kit_proof_harness import find_three

KITS = ROOT / SKILL / 'templates/kits'
RECORD_ID = 'knowledge.blueprint-timber-cottage'
CAPTURES = ('far.png', 'mid.png', 'close.png', 'detail.png')
# Shared library files, not blueprints: they export helpers, so the one-create rule and the
# record pairing do not apply to them.
EXEMPT = ('kit-core.js', 'kit-walk.js', 'kit-surface.js', 'kit-surface-ao.js',
          'kit-surface-draw.js', 'kit-surface-draw-organic.js', 'kit-lod.js', '_harness',
          'layout')


class KitModuleTests(unittest.TestCase):
    def test_schema_enum_matches_the_shared_knowledge_kinds(self):
        schema = json.loads((ROOT / 'schemas/knowledge.schema.json').read_text())
        self.assertEqual(set(schema['properties']['knowledge_kind']['enum']), KNOWLEDGE_KINDS)
        self.assertIn('blueprint', KNOWLEDGE_KINDS)

    def test_every_kit_module_keeps_the_authoring_rules(self):
        modules = sorted(KITS.rglob('*.js'))
        self.assertTrue(modules, 'the kits folder must ship at least one module')
        for path in modules:
            relative = path.relative_to(KITS).as_posix()
            with self.subTest(module=relative):
                body = path.read_text(encoding='utf-8')
                self.assertLessEqual(len(body.splitlines()), 200, 'kit modules stay under 200 lines')
                self.assertTrue(body.startswith('//'), 'a kit module opens with a header comment')
                self.assertRegex(path.name, r'^[a-z0-9]+(-[a-z0-9]+)*\.js$', 'kebab-case only')
                if any(part in relative.split('/') or relative == part for part in EXEMPT):
                    continue
                self.assertEqual(body.count('export function create('), 1,
                                 'a blueprint module exports exactly one create factory')

    def test_three_discovery_uses_the_shared_examples_package(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            three = root / 'examples/node_modules/three'
            (three / 'build').mkdir(parents=True)
            (three / 'build/three.module.js').write_text('export {};\n')
            self.assertEqual(find_three(root), three)

    def test_three_discovery_rejects_an_incomplete_package(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'examples/node_modules/three').mkdir(parents=True)
            self.assertIsNone(find_three(root))

    def test_shipped_glbs_keep_their_container_uv_socket_and_extension_contracts(self):
        expected = {
            'stone-guildhall.glb': ({'banner', 'chimney', 'door', 'lantern'}, 4),
            'iron-lantern.glb': ({'base', 'hook', 'lamp'}, 3),
        }
        for name, (sockets, material_count) in expected.items():
            path = KITS / 'gltf' / name
            body = path.read_bytes()
            with self.subTest(asset=name):
                magic, version, length = struct.unpack_from('<4sII', body)
                self.assertEqual((magic, version, length), (b'glTF', 2, len(body)))
                json_length, json_kind = struct.unpack_from('<II', body, 12)
                self.assertEqual(json_kind, 0x4E4F534A)
                document = json.loads(body[20:20 + json_length].decode('utf-8'))
                self.assertEqual(document['asset']['version'], '2.0')
                self.assertEqual(len(document['materials']), material_count)
                self.assertTrue(all(material.get('name') for material in document['materials']))
                for primitive in document['meshes'][0]['primitives']:
                    self.assertTrue({'POSITION', 'NORMAL', 'TEXCOORD_0'}
                                    <= set(primitive['attributes']))
                actual = {node['extras']['socket'] for node in document.get('nodes', [])
                          if isinstance(node.get('extras', {}).get('socket'), str)}
                self.assertEqual(actual, sockets)
                self.assertTrue(all(len(node['extras']['normal']) == 3
                                    for node in document.get('nodes', [])
                                    if node.get('extras', {}).get('socket')))
                self.assertNotIn('KHR_draco_mesh_compression', document.get('extensionsUsed', []))

        lantern = (KITS / 'gltf/iron-lantern.glb').read_bytes()
        json_length, _ = struct.unpack_from('<II', lantern, 12)
        document = json.loads(lantern[20:20 + json_length].decode('utf-8'))
        glass = next(material for material in document['materials']
                     if material['name'] == 'LanternGlass')
        strength = glass['extensions']['KHR_materials_emissive_strength']['emissiveStrength']
        self.assertGreater(strength, 1)

    @unittest.skipUnless(shutil.which('node'), 'node is not installed')
    def test_kit_proof_syntax_check_parses_every_module(self):
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/kit-proof.py'), '--syntax-only'],
                                capture_output=True, text=True, cwd=ROOT)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('parse', result.stdout)


class BlueprintValidationTests(unittest.TestCase):
    """A synthetic blueprint in a synthetic repository: each defect must be refused."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.rid = 'knowledge.blueprint-fixture'
        module = self.root / SKILL / 'templates/kits/buildings/fixture.js'
        module.parent.mkdir(parents=True, exist_ok=True)
        module.write_text('// fixture.js\nexport function create() { return {}; }\n')
        harness = self.root / SKILL / 'templates/kits/_harness/index.html'
        harness.parent.mkdir(parents=True, exist_ok=True)
        harness.write_text('<!doctype html>')
        self.captures = self.root / 'evidence/kits' / self.rid
        self.captures.mkdir(parents=True)
        digests = {}
        for index, name in enumerate(CAPTURES[:3]):
            data = f'fixture capture {index}'.encode()
            (self.captures / name).write_bytes(data)
            digests[name] = hashlib.sha256(data).hexdigest()
        (self.captures / 'proof-log.json').write_text(json.dumps({'captures': digests}))
        self.records = {self.rid: self.record(),
                        'knowledge.look': {'id': 'knowledge.look', 'knowledge_kind': 'style-profile'}}

    def record(self, **overrides):
        row = {
            'id': self.rid, 'knowledge_kind': 'blueprint',
            'asset': {'kind': 'procedural-js', 'path': 'templates/kits/buildings/fixture.js',
                      'factory': 'create'},
            'params': [{'name': 'seed', 'type': 'integer', 'default': 1}],
            'sockets': [{'name': 'door', 'position_m': [0, 0, 1], 'normal': [0, 0, 1]}],
            'detail_ladder': {band: [f'{band} one', f'{band} two']
                              for band in ('silhouette', 'medium', 'fine')},
            'footprint_m': [2.0, 3.0], 'poly_budget': 100,
            'fits_looks': ['knowledge.look'],
            'proof': {'harness': 'templates/kits/_harness/index.html',
                      'log': f'evidence/kits/{self.rid}/proof-log.json',
                      'captures': [f'evidence/kits/{self.rid}/{name}' for name in CAPTURES[:3]]}}
        row.update(overrides)
        return row

    def test_a_well_formed_blueprint_passes(self):
        validate_blueprint(self.record(), self.records, self.root)
        # Installed-package mode skips every repository check but keeps the structural ones.
        validate_blueprint(self.record(), self.records, None)

    def test_a_missing_module_is_refused(self):
        row = self.record(asset={'kind': 'procedural-js', 'path': 'templates/kits/gone.js'})
        with self.assertRaisesRegex(ContractError, 'missing'):
            validate_blueprint(row, self.records, self.root)

    def test_an_oversize_asset_is_refused_before_it_can_be_packaged(self):
        (self.root / SKILL / 'templates/kits/buildings/fixture.js').write_bytes(
            b'// fixture.js\nexport function create() {}\n' + b'x' * (ASSET_MAX_BYTES + 1))
        with self.assertRaisesRegex(ContractError, 'over'):
            validate_blueprint(self.record(), self.records, self.root)

    def test_a_module_without_the_named_factory_is_refused(self):
        (self.root / SKILL / 'templates/kits/buildings/fixture.js').write_text(
            '// fixture.js\nexport function build() {}\n')
        with self.assertRaisesRegex(ContractError, 'does not export create'):
            validate_blueprint(self.record(), self.records, self.root)

    def test_a_capture_that_does_not_match_the_proof_log_is_refused(self):
        (self.captures / 'far.png').write_bytes(b'edited after the proof run')
        with self.assertRaisesRegex(ContractError, 'sha256 mismatch'):
            validate_blueprint(self.record(), self.records, self.root)

    def test_a_capture_outside_the_record_directory_is_refused(self):
        elsewhere = [f'evidence/kits/other/{name}' for name in CAPTURES[:3]]
        row = self.record(proof={**self.record()['proof'], 'captures': elsewhere})
        with self.assertRaisesRegex(ContractError, 'capture outside'):
            validate_blueprint(row, self.records, self.root)

    def test_a_look_that_is_not_a_look_record_is_refused(self):
        row = self.record(fits_looks=['knowledge.not-a-look'])
        with self.assertRaisesRegex(ContractError, 'is not a style, theme or lighting profile'):
            validate_blueprint(row, self.records, self.root)

    def test_a_traversing_asset_path_is_refused(self):
        row = self.record(asset={'kind': 'procedural-js', 'path': 'templates/kits/../../secrets.js'})
        with self.assertRaisesRegex(ContractError, 'without traversal'):
            validate_blueprint(row, self.records, self.root)


class RuntimePassPairingTests(unittest.TestCase):
    """The trap the phase called out: a curated runtime pass and its check-run must agree."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        # Materialize the live artifact/output references named by evidence without coupling the
        # fixture to any one historical example directory.
        for name in ('skills/3dviz-pro-max/data', 'skills/3dviz-pro-max/templates',
                     'evidence'):
            shutil.copytree(ROOT / name, self.root / name,
                            ignore=shutil.ignore_patterns('__pycache__', 'node_modules', 'dist'))
        self.copy_evidence_artifacts()
        self.records, self.sources, _ = load_catalog(self.root, collection='all')
        self.record = self.records[RECORD_ID]
        self.actor = {'kind': 'tool', 'name': 'test'}

    def copy_evidence_artifacts(self):
        for events in sorted((self.root / 'evidence/dataset-changes').glob('*/events.jsonl')):
            for line in events.read_text(encoding='utf-8').splitlines():
                payload = json.loads(line).get('payload') or {}
                for key in ('artifact_ref', 'output_ref'):
                    relative = payload.get(key)
                    source = ROOT / relative if isinstance(relative, str) else None
                    if source is not None and source.is_file():
                        target = self.root / relative
                        target.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(source, target)

    def write(self, change_id, events):
        path = self.root / 'evidence/dataset-changes' / change_id / 'events.jsonl'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(''.join(json.dumps(event) + '\n' for event in events), encoding='utf-8')

    def pair(self, change_id, curated_artifact, check_artifact):
        self.write(change_id, [
            curated_event(change_id, self.record, self.actor, 'active', 'fixture', 'passed',
                          'fixture', curated_artifact),
            check_run_event(change_id, self.record, self.actor, 'fixture.check-id', 'visual',
                            'passed', check_artifact,
                            f'evidence/kits/{RECORD_ID}/proof-log.json',
                            'fixture observer', 'fixture result', None, 'fixture')])
        return load_evidence(self.root, self.records, self.sources)

    def test_matching_artifact_paths_are_accepted(self):
        self.assertTrue(self.pair('fixture-match', asset_ref(self.record), asset_ref(self.record)))

    def test_a_curated_pass_on_an_unchecked_artifact_is_refused(self):
        # The curated event cites a real file that no passing check-run ever ran against.
        other = f'{SKILL}/templates/kits/kit-core.js'
        with self.assertRaisesRegex(ContractError, 'runtime curation pass lacks matching check-run'):
            self.pair('fixture-mismatch', other, asset_ref(self.record))

    def test_a_skill_relative_artifact_path_is_refused(self):
        with self.assertRaisesRegex(ContractError, 'artifact does not exist'):
            self.pair('fixture-relative', self.record['asset']['path'], asset_ref(self.record))


if __name__ == '__main__':
    unittest.main()
