"""Recommend a shipped-kit pipeline per blueprint from host tools and declared proof status.

The rules are data, printed with the reason that produced them: a hero gets the host ceiling
capped by the delivery target (or reuse of a proved shipped GLB), mid ground gets T2,
and an instanced background gets T1. A tier a record calls missing or not-proved is never recommended - the
brief steps down and names the status it stepped over, so nothing here can claim a quality the
record does not have. These defaults do not constrain custom construction, sourced assets,
art direction or factual fidelity.
"""
import json
from pathlib import Path
import sys

PROBE = 'python3 scripts/host-probe.py --out host.json'
TIER_ORDER = ('T0', 'T1', 'T2', 'T3', 'T4')
# A tier the record says is missing or not-proved is never recommended; the brief steps down and
# names the status it stepped over, so the departure is visible rather than silent.
UNAVAILABLE = frozenset({'missing', 'not-proved'})
DEFAULT_DELIVERY = 'web-desktop'
# `cap` is the highest tier the target can carry; `background` overrides the role rule below it.
DELIVERY = {'web-desktop': {'cap': 'T3'},
            'web-mobile': {'cap': 'T2', 'background': 'T0'},
            'offline-still': {'cap': None},      # no cap: the host ceiling is the limit
            'presentation': {'cap': 'T2'}}
ROLE_RULES = {'hero': 'host bake ceiling or proved shipped GLB reuse, capped by the delivery target',
              'mid': 'T2 (procedural surface, no shipped bytes)',
              'background': 'T1 (instanced repeat, flat material)'}
DRAW_CALL_NOTE = (
    'Background and repeated objects stay one InstancedMesh at T1 and are never wrapped in a LOD. '
    'Eval run 3 measured 4,773 draw calls at 5 fps with every object built as a separate mesh - '
    'that measurement is the concrete reason this note exists. An instanced field is one draw '
    'call whatever the count; a LOD per repeat adds a per-frame update and removes no draws.')
BRIEF_NOTE = ('Shipped-kit pipeline recommendations, not limits on artistic quality or construction. '
              'Choose kit, adapted kit, custom geometry or sourced assets by object fit. '
              'Blender availability does not grade the result; inspect identity, structure, surface '
              'and factual fidelity at the intended viewing scale. T0 is an optional layout proxy. '
              'Keep the declared proof status when reporting a kit tier.')


def tier_view(record):
    """The record's tiers, read through the shared validator when it is reachable.

    In this repository `scripts/blueprint_validation.py` owns the T1 synthesis, so the brief
    reads the same view the validator enforces. A packaged skill ships no validator; there the
    same synthesis is done here, and nothing else about the tiers is invented.
    """
    repo_scripts = Path(__file__).resolve().parents[3] / 'scripts'
    if str(repo_scripts) not in sys.path:
        sys.path.append(str(repo_scripts))
    try:
        from blueprint_validation import blueprint_tiers
        return blueprint_tiers(record)
    except ImportError:
        tiers = dict(record.get('tiers') or {})
        tiers['T1'] = {'mode': 'module', 'status': 'proved', 'asset': record.get('asset'),
                       'proof': record.get('proof'), 'poly_budget': record.get('poly_budget')}
        return tiers


def lower_of(first, second):
    return first if TIER_ORDER.index(first) <= TIER_ORDER.index(second) else second


def role_for(record, heroes):
    """`instanced` is authored on exactly the blueprints meant to repeat in the background."""
    if record['id'] in heroes:
        return 'hero'
    return 'background' if 'instanced' in record.get('tags', []) else 'mid'


def wanted_tier(role, ceiling, delivery):
    """What the role rule asks for, before the record gets a say. Returns (tier, reason)."""
    rules = DELIVERY[delivery]
    cap = rules['cap'] or ceiling
    if role == 'background':
        floor = rules.get('background', 'T1')
        return floor, (f'instanced repeat: flat material, one draw call'
                       if floor == 'T1' else f'instanced repeat, and {delivery} caps it at {floor}')
    if role == 'hero':
        target = lower_of(ceiling, cap)
        return target, (f'hero at the host ceiling {ceiling}' if target == ceiling
                        else f'hero wanted the host ceiling {ceiling}, {delivery} caps it at {target}')
    target = lower_of('T2', cap)
    return target, (f'mid ground: procedural surface, no shipped bytes' if target == 'T2'
                    else f'mid ground, capped by {delivery} at {target}')


def declares(tiers, name):
    entry = tiers.get(name)
    return f'declares {name} {entry["status"]}' if entry else f'declares no {name} yet'


def recommend(record, role, ceiling, delivery):
    """Step down from the wanted tier until the record actually offers one. Never invents a tier."""
    target, reason = wanted_tier(role, ceiling, delivery)
    tiers = tier_view(record)
    # Existing proved GLBs can be loaded without the Blender installation needed to rebake them.
    baked = tiers.get('T3', {})
    asset = baked.get('asset', {}).get('path')
    root = Path(__file__).resolve().parents[1]
    path = (root / asset).resolve() if asset else None
    reusable = (baked.get('mode') == 'gltf' and baked.get('status') == 'proved'
                and path is not None and path.is_relative_to(root) and path.is_file())
    if role == 'hero' and reusable and TIER_ORDER.index(target) < 3:
        reuse_target = lower_of('T3', DELIVERY[delivery]['cap'] or 'T3')
        if TIER_ORDER.index(reuse_target) > TIER_ORDER.index(target):
            target = reuse_target
            reason = ('hero reuses a proved shipped T3 GLB; local Blender is only needed to rebake; '
                      f'host bake ceiling {ceiling}, delivery {delivery}')
    tier = target
    while tier is not None and (tier not in tiers or tiers[tier]['status'] in UNAVAILABLE):
        index = TIER_ORDER.index(tier)
        tier = TIER_ORDER[index - 1] if index else None
    if tier is None:
        return None, f'{reason}; the record {declares(tiers, target)} and offers no lower tier'
    if tier != target:
        return tier, f'{reason}; the record {declares(tiers, target)}, so {tier}'
    return tier, f'{reason}; the record {declares(tiers, tier)}'


def build_brief(rows, records, host, delivery, heroes):
    """A tier and a one-line reason per listed blueprint, from the probe and the records."""
    by_id = {record['id']: record for record in records}
    ceiling = host['quality_ceiling']
    per_blueprint = {}
    for row in rows:
        record = by_id[row['id']]
        role = role_for(record, heroes)
        tier, reason = recommend(record, role, ceiling, delivery)
        per_blueprint[row['id']] = {'role': role, 'tier': tier, 'reason': reason}
    return {'scope': 'shipped-kit-pipelines', 'delivery': delivery, 'ceiling': ceiling,
            'ceiling_reason': host.get('quality_ceiling_reason'),
            'capture_mode_expected': host.get('capture_mode_expected'),
            'role_rules': ROLE_RULES, 'per_blueprint': per_blueprint,
            'draw_call_note': DRAW_CALL_NOTE, 'note': BRIEF_NOTE}


def load_host(path):
    """The probe's report, or a usage error naming the command that writes one."""
    try:
        host = json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        raise ValueError(f'--host {path}: {error}. Write one with: {PROBE}')
    if not isinstance(host, dict) or host.get('quality_ceiling') not in TIER_ORDER:
        raise ValueError(f'--host {path}: no quality_ceiling in it. Write one with: {PROBE}')
    return host


def check_heroes(rows, heroes):
    listed = {row['id'] for row in rows}
    unknown = sorted(set(heroes) - listed)
    if unknown:
        raise ValueError('--hero names records that are not listed blueprints here: '
                         + ', '.join(unknown))
