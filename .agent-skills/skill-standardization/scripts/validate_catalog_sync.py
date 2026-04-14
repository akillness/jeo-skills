#!/usr/bin/env python3
"""Validate that shipped skill catalog surfaces stay in sync with the live filesystem."""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


COUNT_PATTERNS = {
    'README.md': [
        (r'(\d+) local skill folders', 'local skill folder count'),
        (r'← (\d+) skill folders', 'tree snippet skill folder count'),
    ],
    'README.ko.md': [
        (r'(\d+)개 로컬 스킬 폴더', 'local skill folder count'),
        (r'← (\d+) skill folders', 'tree snippet skill folder count'),
    ],
    'setup-all-skills-prompt.md': [
        (r'Install ALL (\d+) skills', 'install-all count'),
        (r'Skill Inventory \((\d+) skills\)', 'inventory count'),
    ],
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Validate skill catalog / docs sync against live skill folders.')
    parser.add_argument('--repo-root', default=Path(__file__).resolve().parents[3], type=Path)
    parser.add_argument('--json', action='store_true', help='Emit machine-readable JSON')
    return parser.parse_args()


def live_skills(skills_root: Path) -> list[str]:
    return sorted(p.parent.name for p in skills_root.glob('*/SKILL.md'))


def load_manifest(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding='utf-8'))


def manifest_names(data: dict) -> list[str]:
    return sorted(entry.get('name') for entry in data.get('skills', []) if isinstance(entry, dict) and entry.get('name'))


def check_counts(repo_root: Path, live_count: int) -> list[dict]:
    findings = []
    for rel, patterns in COUNT_PATTERNS.items():
        path = repo_root / rel
        if not path.exists():
            findings.append({'level': 'warn', 'surface': rel, 'message': 'file missing'})
            continue
        text = path.read_text(encoding='utf-8')
        for pattern, label in patterns:
            for match in re.finditer(pattern, text):
                value = int(match.group(1))
                if value != live_count:
                    findings.append({
                        'level': 'error',
                        'surface': rel,
                        'message': f'{label} = {value}, expected {live_count}',
                    })
    return findings


def main() -> int:
    args = parse_args()
    repo_root = args.repo_root.expanduser().resolve()
    skills_root = repo_root / '.agent-skills'
    manifest_path = skills_root / 'skills.json'

    live = live_skills(skills_root)
    live_set = set(live)
    data = load_manifest(manifest_path)
    manifest = manifest_names(data)
    manifest_set = set(manifest)

    findings = []
    missing = sorted(live_set - manifest_set)
    extras = sorted(manifest_set - live_set)
    if missing:
        findings.append({'level': 'error', 'surface': 'skills.json', 'message': f'missing live skills: {missing}'})
    if extras:
        findings.append({'level': 'error', 'surface': 'skills.json', 'message': f'stale manifest-only skills: {extras}'})

    declared_count = data.get('skill_count')
    if declared_count is not None and declared_count != len(live):
        findings.append({'level': 'error', 'surface': 'skills.json', 'message': f'skill_count={declared_count}, expected {len(live)}'})

    for entry in data.get('skills', []):
        if not isinstance(entry, dict) or not entry.get('name'):
            continue
        name = entry['name']
        path_value = entry.get('path')
        if path_value:
            target = skills_root / path_value
            if name in live_set and not target.exists():
                findings.append({'level': 'warn', 'surface': 'skills.json', 'message': f'path mismatch for {name}: {path_value}'})

    findings.extend(check_counts(repo_root, len(live)))

    summary = {
        'live_skill_count': len(live),
        'manifest_skill_count': len(manifest),
        'missing_from_manifest': missing,
        'manifest_only': extras,
        'findings': findings,
    }

    if args.json:
        print(json.dumps(summary, indent=2, ensure_ascii=False))
    else:
        print(f'Live skills: {len(live)}')
        print(f'Manifest skills: {len(manifest)}')
        if missing:
            print(f'Missing from manifest: {", ".join(missing)}')
        if extras:
            print(f'Manifest-only entries: {", ".join(extras)}')
        if findings:
            print('\nFindings:')
            for item in findings:
                print(f"- [{item['level']}] {item['surface']}: {item['message']}")
        else:
            print('\nNo drift detected.')

    return 1 if any(item['level'] == 'error' for item in findings) else 0


if __name__ == '__main__':
    raise SystemExit(main())
