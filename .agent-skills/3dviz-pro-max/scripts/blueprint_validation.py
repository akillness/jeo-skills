"""Structure, packaging and proof linkage of a blueprint record.

A blueprint is a record plus a module plus a proof. This module checks that the three
agree: the declared asset exists inside the skill and exports what the record names, the
declared looks resolve to authored look records, and every declared capture exists with
the digest its proof log states. It never judges how the blueprint looks; it only refuses
to let a record claim an artifact or a capture that is not there.
"""
import hashlib
import math
import re
from pathlib import PurePosixPath

from catalog_validation import (ContractError, integer, objects, parse_json, require,
                                portable_path, strings, text)

BLUEPRINT_SUFFIXES = {'.js': 'procedural-js', '.glb': 'gltf-asset'}
ASSET_MAX_BYTES = 2 * 1024 * 1024
LOOK_KINDS = {'style-profile', 'lighting-profile', 'theme-profile'}
SKILL = 'skills/3dviz-pro-max'
DETAIL_BANDS = ('silhouette', 'medium', 'fine')

# Quality tiers. T1 is what every record already ships (its module plus its proof) and is never
# written into `tiers`; the others are declared per record and refused unless they hold together.
TIERS = ('T0', 'T1', 'T2', 'T3', 'T4')
TIER_MODES = {'T0': 'proxy', 'T1': 'module', 'T2': 'runtime', 'T3': 'gltf', 'T4': 'external'}
TIER_ASSET_MAX_BYTES = {'T3': ASSET_MAX_BYTES}
TIER_STATUSES = {'generated', 'declared', 'proved', 'not-proved', 'missing'}
SURFACE_FAMILIES = {'wood', 'plaster', 'stone', 'roof-tile', 'metal', 'fabric', 'fur'}
TIER_KEYS = {'mode', 'status', 'note', 'poly_budget'}
TIER_MODE_KEYS = {'proxy': {'size_m'}, 'module': {'asset', 'proof'},
                  'runtime': {'families', 'texture_budget', 'ao', 'proof'},
                  'gltf': {'asset', 'proof', 'texture_budget', 'built_by', 'blender', 'params_hash'},
                  'external': set()}
COLOUR = re.compile(r'#[0-9a-fA-F]{6}')


def finite_number(value):
    """JSON numbers exclude booleans, and floats must be finite."""
    return type(value) is int or (type(value) is float and math.isfinite(value))


def asset_ref(record):
    """The one repository-relative artifact path every evidence event must cite.

    `asset.path` is skill-relative; `evidence_validation.safe_path` resolves against the
    repository root. Both `record-curated.artifact_ref` and `check-run.artifact_ref` are
    built from this helper so the pair can never disagree.
    """
    return f'{SKILL}/{record["asset"]["path"]}'


def asset_path(asset, label):
    """The one path rule every asset obeys: inside the kit tree, no traversal out of it."""
    path = asset.get('path')
    portable_path(path, f'{label}.path')
    require(path.startswith('templates/kits/') and '..' not in PurePosixPath(path).parts,
            f'{label}.path: must live under templates/kits/ without traversal')


def validate_asset(record, root, cap=ASSET_MAX_BYTES):
    """The declared module or glTF file exists, fits the package and exports its factory."""
    rid, asset = record['id'], record['asset']
    path = asset['path']
    suffix = PurePosixPath(path).suffix
    require(BLUEPRINT_SUFFIXES.get(suffix) == asset['kind'],
            f'{rid}.asset: {suffix} does not match kind {asset["kind"]}')
    if root is None:
        return  # Installed-package mode: repository paths are not present.
    asset_file = portable_path(path, f'{rid}.asset.path', root / SKILL)
    require(asset_file.is_file(), f'{rid}.asset.path: missing {path}')
    require(asset_file.stat().st_size <= cap, f'{rid}.asset.path: over {cap} bytes')
    if asset['kind'] == 'procedural-js':
        factory = asset.get('factory', 'create')
        body = asset_file.read_text(encoding='utf-8')
        require(f'export function {factory}(' in body or f'export const {factory} =' in body,
                f'{rid}.asset: module does not export {factory}')


def validate_params(record):
    rid = record['id']
    params = objects(record.get('params'), f'{rid}.params')
    require(params, f'{rid}.params: nonempty array required')
    seen = set()
    for param in params:
        name = param.get('name')
        text(name, f'{rid}.params.name')
        require(name not in seen, f'{rid}.params: duplicate parameter {name}')
        seen.add(name)
        param_type = param.get('type')
        require(param_type in {'number', 'integer', 'boolean', 'string', 'color', 'enum'},
                f'{rid}.params.{name}: invalid type')
        require('default' in param, f'{rid}.params.{name}: default required')
        default = param['default']
        if param_type == 'number':
            valid_default = finite_number(default)
        elif param_type == 'integer':
            valid_default = type(default) is int
        elif param_type == 'boolean':
            valid_default = type(default) is bool
        else:
            valid_default = isinstance(default, str)
        require(valid_default, f'{rid}.params.{name}: default must match type {param_type}')
        if param_type == 'color':
            require(COLOUR.fullmatch(default),
                    f'{rid}.params.{name}: color default must be #rrggbb hex')

        if 'range' not in param:
            continue
        require(param_type in {'number', 'integer'},
                f'{rid}.params.{name}.range: only numeric parameters may declare a range')
        value_range = param['range']
        require(isinstance(value_range, list) and len(value_range) == 2
                and all(finite_number(value) for value in value_range),
                f'{rid}.params.{name}.range: two finite numbers required')
        lower, upper = value_range
        require(lower <= upper, f'{rid}.params.{name}.range: lower bound must not exceed upper bound')
        require(lower <= default <= upper,
                f'{rid}.params.{name}: default must be within declared range')


def validate_sockets(record):
    rid = record['id']
    for socket in objects(record.get('sockets'), f'{rid}.sockets'):
        text(socket.get('name'), f'{rid}.sockets.name')
        for field in ('position_m', 'normal'):
            vector = socket.get(field)
            require(isinstance(vector, list) and len(vector) == 3
                    and all(finite_number(v) for v in vector),
                    f'{rid}.sockets.{socket.get("name")}.{field}: three numbers required')


def validate_ladder(record):
    rid = record['id']
    ladder = record.get('detail_ladder')
    require(isinstance(ladder, dict), f'{rid}.detail_ladder: object required')
    for band in DETAIL_BANDS:
        strings(ladder.get(band), f'{rid}.detail_ladder.{band}', True)
        require(len(ladder[band]) >= 2, f'{rid}.detail_ladder.{band}: at least two features')


def validate_looks(record, records):
    rid = record['id']
    strings(record.get('fits_looks'), f'{rid}.fits_looks', True)
    for look in record['fits_looks']:
        require(look in records and records[look].get('knowledge_kind') in LOOK_KINDS,
                f'{rid}.fits_looks: {look} is not a style, theme or lighting profile')


def proof_captures(record, root):
    """Every declared capture exists and its SHA-256 matches the proof log."""
    rid, proof = record['id'], record.get('proof')
    require(isinstance(proof, dict), f'{rid}.proof: object required')
    portable_path(proof.get('harness'), f'{rid}.proof.harness', root / SKILL if root else None)
    portable_path(proof.get('log'), f'{rid}.proof.log', root)
    strings(proof.get('captures'), f'{rid}.proof.captures', True)
    require(len(proof['captures']) >= 3, f'{rid}.proof.captures: at least three captures')
    for capture in proof['captures']:
        portable_path(capture, f'{rid}.proof.capture', root)
        require(capture.startswith(f'evidence/kits/{rid}/'), f'{rid}.proof: capture outside record directory')
    if root is None:
        return
    require((root / SKILL / proof['harness']).is_file(),
            f'{rid}.proof.harness: missing {proof["harness"]}')
    log_path = root / proof['log']
    require(log_path.is_file(), f'{rid}.proof.log: missing {proof["log"]}')
    log = parse_json(log_path.read_text(encoding='utf-8'), proof['log'])
    digests = log.get('captures') if isinstance(log, dict) else None
    require(isinstance(digests, dict), f'{rid}.proof.log: captures object required')
    for capture in proof['captures']:
        file = root / capture
        require(file.is_file(), f'{rid}.proof: missing capture {capture}')
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        require(digests.get(PurePosixPath(capture).name) == digest,
                f'{rid}.proof: sha256 mismatch for {capture}')


def blueprint_tiers(record):
    """The uniform tier view. T1 is the record's own asset and proof; it is never stored twice."""
    rid = record['id']
    declared = record.get('tiers') or {}
    require(isinstance(declared, dict), f'{rid}.tiers: object required')
    require('T1' not in declared, f'{rid}.tiers: T1 is the record asset, do not declare it')
    tiers = dict(declared)
    tiers['T1'] = {'mode': 'module', 'asset': record.get('asset'), 'proof': record.get('proof'),
                   'poly_budget': record.get('poly_budget'), 'status': 'proved'}
    return tiers


def tier_proxy(tier, label):
    """T0 is a generated blockout: three box sizes, nothing shipped, nothing proved."""
    size = tier.get('size_m')
    require(isinstance(size, list) and len(size) == 3
            and all(finite_number(v) and v > 0
                    for v in size),
            f'{label}.size_m: three positive numbers required')


def tier_runtime(tier, label):
    """T2 draws its own textures at build time, so it ships no file and needs a colour map."""
    require('asset' not in tier, f'{label}: a runtime tier ships no file')
    families = tier.get('families')
    require(isinstance(families, dict) and families,
            f'{label}.families: a nonempty colour-to-family map is required')
    for colour, family in families.items():
        require(isinstance(colour, str) and COLOUR.fullmatch(colour),
                f'{label}.families: {colour} is not a #rrggbb colour')
        require(family in SURFACE_FAMILIES,
                f'{label}.families.{colour}: unknown material family {family}')
    integer(tier.get('poly_budget'), f'{label}.poly_budget')
    require(tier['status'] != 'proved' or isinstance(tier.get('proof'), dict),
            f'{label}.proof: a proved tier needs a proof')


def tier_gltf(rid, name, tier, label, root):
    """T3 ships a baked GLB, or it says plainly that nothing is shipped yet."""
    if tier['status'] == 'missing':
        text(tier.get('note'), f'{label}.note')
        require('asset' not in tier, f'{label}: a missing tier ships no file')
        return
    asset = tier.get('asset')
    require(isinstance(asset, dict), f'{label}.asset: object required')
    require(asset.get('kind') == 'gltf-asset', f'{label}.asset.kind: gltf-asset required')
    asset_path(asset, label)
    validate_asset({'id': rid, 'asset': asset}, root,
                   cap=TIER_ASSET_MAX_BYTES.get(name, ASSET_MAX_BYTES))
    require(tier['status'] != 'proved' or isinstance(tier.get('proof'), dict),
            f'{label}.proof: a proved tier needs a proof')


def tier_proof(rid, name, tier, root):
    """A tier's captures live in its own directory and verify against its own proof log."""
    label = f'{rid}.tiers.{name}'
    proof = tier['proof']
    require(isinstance(proof, dict), f'{label}.proof: object required')
    strings(proof.get('captures'), f'{label}.proof.captures', True)
    prefix = f'evidence/kits/{rid}/{name}/'
    for capture in proof['captures']:
        require(capture.startswith(prefix), f'{label}.proof: capture outside {prefix}')
    proof_captures({'id': rid, 'proof': proof}, root)


def validate_tiers(record, root):
    """Every declared tier is a shape the skill can build, or the record does not declare it."""
    rid = record['id']
    for name, tier in blueprint_tiers(record).items():
        require(name in TIERS, f'{rid}.tiers: unknown tier {name}')
        label = f'{rid}.tiers.{name}'
        require(isinstance(tier, dict), f'{label}: object required')
        require(tier.get('mode') == TIER_MODES[name],
                f'{label}.mode: {name} is mode {TIER_MODES[name]}')
        require(tier.get('status') in TIER_STATUSES,
                f'{label}.status: one of {sorted(TIER_STATUSES)} required')
        if name == 'T1':
            continue  # The record's own asset and proof; validate_blueprint checked both already.
        if tier['mode'] == 'proxy':
            tier_proxy(tier, label)
        elif tier['mode'] == 'runtime':
            tier_runtime(tier, label)
        elif tier['mode'] == 'gltf':
            tier_gltf(rid, name, tier, label, root)
        else:
            require(tier['status'] in {'missing', 'declared'},
                    f'{label}.status: an external tier is only missing or declared')
        unknown = sorted(set(tier) - TIER_KEYS - TIER_MODE_KEYS[tier['mode']])
        require(not unknown, f'{label}: unknown key {", ".join(unknown)}')
        if 'proof' in tier:
            tier_proof(rid, name, tier, root)


def validate_blueprint(record, records, root):
    """Never judges how a blueprint looks; only that record, module and proof agree."""
    rid = record['id']
    asset = record.get('asset')
    require(isinstance(asset, dict), f'{rid}.asset: object required')
    require(asset.get('kind') in set(BLUEPRINT_SUFFIXES.values()), f'{rid}.asset.kind: invalid')
    asset_path(asset, f'{rid}.asset')
    validate_params(record)
    validate_sockets(record)
    validate_ladder(record)
    integer(record.get('poly_budget'), f'{rid}.poly_budget')
    footprint = record.get('footprint_m')
    require(isinstance(footprint, list) and 2 <= len(footprint) <= 3
            and all(finite_number(v) and v > 0
                    for v in footprint),
            f'{rid}.footprint_m: two or three positive numbers required')
    validate_looks(record, records)
    validate_asset(record, root)
    proof_captures(record, root)
    validate_tiers(record, root)
    return record


__all__ = ['ASSET_MAX_BYTES', 'BLUEPRINT_SUFFIXES', 'ContractError', 'LOOK_KINDS', 'SKILL',
           'SURFACE_FAMILIES', 'TIERS', 'TIER_ASSET_MAX_BYTES', 'TIER_MODES', 'TIER_STATUSES',
           'asset_ref', 'blueprint_tiers', 'proof_captures', 'validate_asset',
           'validate_blueprint', 'validate_tiers']
