#!/usr/bin/env python3
"""Fix SKILL.md frontmatter to comply with AgentSkills.io specification."""

import os
import re
import sys
from pathlib import Path


def resolve_skills_dir() -> Path:
    env_dir = os.environ.get("SKILLS_DIR")
    if env_dir:
        return Path(env_dir).expanduser()
    return Path(__file__).resolve().parent / ".agent-skills"


SKILLS_DIR = resolve_skills_dir()


def parse_frontmatter(content: str):
    """Return (frontmatter_str, body) or (None, content)."""
    if not content.startswith('---'):
        return None, content
    end = content.find('\n---', 3)
    if end == -1:
        return None, content
    fm_str = content[3:end].strip()
    body = content[end + 4:]
    if body.startswith('\n'):
        body = body[1:]
    return fm_str, body


def unquote(val: str) -> str:
    """Strip surrounding double then single quotes from a scalar."""
    return val.strip('"').strip("'")


def yaml_list_to_delimited(val: str, sep: str) -> str:
    """Convert a YAML flow-array string to a sep-joined string.

    Plain (non-array) strings are returned unquoted.
    """
    v = val.strip()
    if v.startswith('[') and v.endswith(']'):
        inner = v[1:-1].strip()
        if not inner:
            return ''
        items = [unquote(x.strip()) for x in inner.split(',')]
        return sep.join(x for x in items if x)
    return unquote(v)


def extract_mapping_block(fm_str: str, key: str):
    """Pull a multi-line YAML mapping `key:` block out of the frontmatter.

    Returns (sub_keys_dict, full_block_text_or_None, remaining_fm_str).
    """
    pattern = re.compile(
        rf'^{key}:[ \t]*\n((?:[ \t]+[^\n]*\n?)+)',
        re.MULTILINE
    )
    m = pattern.search(fm_str + '\n')
    if not m:
        return {}, None, fm_str
    sub = {}
    for line in m.group(1).split('\n'):
        sm = re.match(r'\s+(\w[\w-]*)\s*:\s*(.*)', line)
        if sm:
            sub[sm.group(1)] = unquote(sm.group(2).strip())
    remaining = pattern.sub('', fm_str + '\n').strip()
    return sub, m.group(0).rstrip(), remaining


def truncate_desc(desc: str, max_len: int = 1024) -> str:
    if len(desc) <= max_len:
        return desc
    cut = desc[:max_len - 3]
    sp = cut.rfind(' ')
    if sp > max_len * 0.8:
        return cut[:sp] + '...'
    return cut + '...'


def quote_yaml(v: str) -> str:
    """Quote a YAML scalar value if needed."""
    special = set(':#{}&*?|<>=!%@`\'"\\')
    if any(c in special for c in v) or v.startswith('-') or not v:
        escaped = v.replace('\\', '\\\\').replace('"', '\\"')
        return f'"{escaped}"'
    return v


def fix_skill(skill_dir: Path) -> dict:
    skill_file = skill_dir / 'SKILL.md'
    if not skill_file.exists():
        return {'status': 'no_file'}

    content = skill_file.read_text(encoding='utf-8')
    fm_str, body = parse_frontmatter(content)
    if fm_str is None:
        return {'status': 'no_frontmatter'}

    dir_name = skill_dir.name
    changes = []

    # ── Special pre-extraction: auto-apply block (multi-line YAML mapping) ──
    auto_apply_val = None
    sub, block, fm_str = extract_mapping_block(fm_str, 'auto-apply')
    if block is not None:
        # Build a single-line summary for metadata
        models = sub.get('models', '')
        if not models:
            # models might be a list below
            models_match = re.search(r'models:\n((?:\s+-[^\n]+\n?)+)', block)
            if models_match:
                models = ', '.join(
                    re.findall(r'-\s+(.+)', models_match.group(1))
                )
        trigger = sub.get('trigger', '')
        reps = sub.get('default_repetitions', '')
        ratio = sub.get('max_context_ratio', '')
        parts = []
        if models:
            parts.append(f"models: {models}")
        if trigger:
            parts.append(f"trigger: {trigger}")
        if reps:
            parts.append(f"default_repetitions: {reps}")
        if ratio:
            parts.append(f"max_context_ratio: {ratio}")
        auto_apply_val = '; '.join(parts) if parts else block

    # ── Special pre-extraction: metadata block ──
    existing_metadata, _, fm_str = extract_mapping_block(fm_str, 'metadata')

    # ── Parse remaining top-level keys ──
    top = {}
    for line in fm_str.split('\n'):
        m = re.match(r'^(\w[\w-]*)\s*:\s*(.*)', line)
        if m:
            top[m.group(1)] = m.group(2).strip()

    # ── Build new frontmatter ──
    new_fm = {}
    new_meta = dict(existing_metadata)

    # name
    raw_name = unquote(top.get('name', dir_name))
    if raw_name != dir_name:
        changes.append(f"name: {raw_name!r} → {dir_name!r}")
        raw_name = dir_name
    new_fm['name'] = raw_name

    # description
    raw_desc = unquote(top.get('description', ''))
    # Handle description that was quoted with surrounding quotes
    if raw_desc.startswith('"') and raw_desc.endswith('"'):
        raw_desc = raw_desc[1:-1]
    trunc = truncate_desc(raw_desc)
    if trunc != raw_desc:
        changes.append(f"description truncated ({len(raw_desc)}→{len(trunc)})")
    new_fm['description'] = trunc

    # license
    if 'license' in top:
        new_fm['license'] = unquote(top['license'])

    # compatibility
    if 'compatibility' in top:
        v = unquote(top['compatibility'])
        if len(v) > 500:
            v = v[:497] + '...'
            changes.append("compatibility truncated")
        new_fm['compatibility'] = v

    # allowed-tools
    if 'allowed-tools' in top:
        space = yaml_list_to_delimited(top['allowed-tools'], ' ')
        if space:
            orig = top['allowed-tools']
            if orig != space:
                changes.append("allowed-tools: array → space-delimited")
            new_fm['allowed-tools'] = space
        else:
            changes.append("allowed-tools: empty → removed")

    # Non-standard fields → metadata
    moves = {
        'tags': 'tags',
        'platforms': 'platforms',
        'keyword': 'keyword',
        'version': 'version',
        'source': 'source',
        'verified': 'verified',
        'verified-with': 'verified-with',
        'author': 'author',
    }
    for field, meta_key in moves.items():
        if field in top:
            raw = top[field]
            if field in ('tags', 'platforms'):
                val = yaml_list_to_delimited(raw, ', ')
            else:
                val = unquote(raw)
            if val:
                new_meta[meta_key] = val
                changes.append(f"{field} → metadata.{meta_key}")

    if auto_apply_val:
        new_meta['auto-apply'] = auto_apply_val
        changes.append("auto-apply → metadata.auto-apply")

    if new_meta:
        new_fm['metadata'] = new_meta

    # ── Render new frontmatter ──
    out_lines = ['---']
    order = ['name', 'description', 'license', 'compatibility', 'allowed-tools', 'metadata']
    for field in order:
        if field not in new_fm:
            continue
        val = new_fm[field]
        if field == 'metadata':
            out_lines.append('metadata:')
            for mk, mv in val.items():
                out_lines.append(f'  {mk}: {quote_yaml(str(mv))}')
        elif field == 'description':
            out_lines.append(f'description: {quote_yaml(str(val))}')
        else:
            out_lines.append(f'{field}: {quote_yaml(str(val))}')
    out_lines.append('---')

    new_content = '\n'.join(out_lines) + '\n\n' + body

    if new_content != content:
        skill_file.write_text(new_content, encoding='utf-8')
        return {'status': 'fixed', 'changes': changes}
    return {'status': 'ok', 'changes': []}


def main():
    if not SKILLS_DIR.exists():
        print(f"ERROR: {SKILLS_DIR} not found", file=sys.stderr)
        sys.exit(1)

    skill_dirs = sorted(
        d for d in SKILLS_DIR.iterdir()
        if d.is_dir() and not d.name.startswith('.') and not d.name.startswith('__')
    )

    print(f"Processing {len(skill_dirs)} skills in {SKILLS_DIR}\n")

    counts = {'fixed': 0, 'ok': 0, 'no_file': 0, 'no_frontmatter': 0, 'error': 0}
    errors = []

    for skill_dir in skill_dirs:
        try:
            r = fix_skill(skill_dir)
            status = r.get('status', 'error')
            counts[status] = counts.get(status, 0) + 1
            if status == 'fixed':
                print(f"✅ FIXED  {skill_dir.name}")
                for c in r.get('changes', []):
                    print(f"         - {c}")
            elif status == 'ok':
                print(f"✓  OK     {skill_dir.name}")
            elif status == 'no_file':
                print(f"⚠  NOFILE {skill_dir.name}")
            else:
                print(f"⚠  NOFM   {skill_dir.name}")
        except Exception as e:
            counts['error'] += 1
            errors.append((skill_dir.name, str(e)))
            import traceback
            print(f"❌ ERROR  {skill_dir.name}: {e}")
            traceback.print_exc()

    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"  Fixed:          {counts['fixed']}")
    print(f"  Already OK:     {counts['ok']}")
    print(f"  No SKILL.md:    {counts['no_file']}")
    print(f"  No frontmatter: {counts['no_frontmatter']}")
    print(f"  Errors:         {counts['error']}")
    if errors:
        print("\nErrors:")
        for name, err in errors:
            print(f"  {name}: {err}")
        sys.exit(1)


if __name__ == '__main__':
    main()
