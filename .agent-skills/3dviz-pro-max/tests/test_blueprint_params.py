"""Focused checks for blueprint parameter authoring boundaries."""
import math
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))

from blueprint_validation import asset_path, proof_captures, validate_params, validate_sockets
from catalog_validation import ContractError


class BlueprintParamTests(unittest.TestCase):
    def record(self, *params):
        return {'id': 'knowledge.blueprint-fixture', 'params': list(params)}

    def assert_invalid(self, param, message):
        with self.assertRaisesRegex(ContractError, message):
            validate_params(self.record(param))

    def test_numeric_defaults_must_match_the_declared_type(self):
        self.assert_invalid({'name': 'scale', 'type': 'number', 'default': True},
                            'default must match type number')
        self.assert_invalid({'name': 'segments', 'type': 'integer', 'default': 4.0},
                            'default must match type integer')
        self.assert_invalid({'name': 'enabled', 'type': 'boolean', 'default': 1},
                            'default must match type boolean')
        self.assert_invalid({'name': 'scale', 'type': 'number', 'default': math.inf},
                            'default must match type number')

    def test_string_like_defaults_keep_their_declared_shape(self):
        validate_params(self.record(
            {'name': 'label', 'type': 'string', 'default': 'roof'},
            {'name': 'variant', 'type': 'enum', 'default': 'open'},
            {'name': 'tint', 'type': 'color', 'default': '#A0b1C2'},
        ))
        self.assert_invalid({'name': 'variant', 'type': 'enum', 'default': 2},
                            'default must match type enum')
        self.assert_invalid({'name': 'tint', 'type': 'color', 'default': 'A0B1C2'},
                            '#rrggbb hex')

    def test_range_requires_two_finite_ordered_numeric_bounds(self):
        invalid_ranges = ([0], [0, 1, 2], [False, 1], [0, math.nan])
        for value_range in invalid_ranges:
            with self.subTest(value_range=value_range):
                self.assert_invalid(
                    {'name': 'scale', 'type': 'number', 'range': value_range, 'default': 0.5},
                    'two finite numbers required')
        self.assert_invalid(
            {'name': 'scale', 'type': 'number', 'range': [2, 1], 'default': 1.5},
            'lower bound must not exceed upper bound')
        self.assert_invalid(
            {'name': 'enabled', 'type': 'boolean', 'range': [0, 1], 'default': True},
            'only numeric parameters')

    def test_default_must_be_inside_the_advisory_range_inclusively(self):
        validate_params(self.record(
            {'name': 'low', 'type': 'number', 'range': [0, 1], 'default': 0},
            {'name': 'high', 'type': 'number', 'range': [0, 1], 'default': 1},
            {'name': 'segments', 'type': 'integer', 'range': [2, 8], 'default': 4},
        ))
        self.assert_invalid(
            {'name': 'scale', 'type': 'number', 'range': [0, 1], 'default': 1.01},
            'default must be within declared range')

    def test_serialized_asset_and_proof_paths_are_portable_even_without_files(self):
        for path in ('templates/kits/bad\\name.js', 'templates/kits/../bad.js'):
            with self.subTest(path=path), self.assertRaises(ContractError):
                asset_path({'path': path}, 'asset')
        proof = {'harness': 'templates/kits/harness.html', 'log': 'evidence/log.json',
                 'captures': [f'evidence/kits/knowledge.blueprint-fixture/{n}.png' for n in range(3)]}
        proof_captures({'id': 'knowledge.blueprint-fixture', 'proof': proof}, None)
        for field, value in [('harness', '/tmp/harness.html'), ('log', 'C:/tmp/log.json'),
                             ('captures', ['evidence/kits/knowledge.blueprint-fixture/bad\\name.png'] * 3)]:
            with self.subTest(field=field), self.assertRaises(ContractError):
                proof_captures({'id': 'knowledge.blueprint-fixture', 'proof': {**proof, field: value}}, None)

    def test_socket_coordinates_reject_nonfinite_values(self):
        with self.assertRaises(ContractError):
            validate_sockets({'id': 'knowledge.fixture', 'sockets': [
                {'name': 'anchor', 'position_m': [0, math.inf, 0], 'normal': [0, 1, 0]}]})


if __name__ == '__main__':
    unittest.main()
