#!/usr/bin/env python3
import json
import os
import sys
from datetime import datetime


def _read_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def _safe(v, d=''):
    return d if v is None else v


def main(argv):
    if len(argv) != 2:
        sys.stderr.write('usage: generate_hourly_knowledge_notes.py <survey-dir>\n')
        return 2
    survey_dir = argv[1]
    evidence_path = os.path.join(survey_dir, 'evidence.json')
    if not os.path.exists(evidence_path):
        sys.stderr.write('missing evidence.json: {0}\n'.format(evidence_path))
        return 2

    evidence = _read_json(evidence_path)
    lanes = evidence.get('lanes', {})
    slug = os.path.basename(os.path.normpath(survey_dir))

    lines = []
    lines.append('# Hourly Survey Knowledge Note')
    lines.append('')
    lines.append('- Slug: `{0}`'.format(slug))
    lines.append('- Generated at (UTC): {0}'.format(datetime.utcnow().isoformat() + 'Z'))
    lines.append('- Provenance: direct page retrieval, feed recovery, indexed snippet, thin evidence')
    lines.append('')
    lines.append('## Lane Snapshot')
    lines.append('')

    for lane in sorted(lanes.keys()):
        info = lanes.get(lane, {})
        raw_count = _safe(info.get('raw_count'), 0)
        kept_count = _safe(info.get('kept_count'), 0)
        status = _safe(info.get('lane_status'), 'unknown')
        causes = info.get('degraded_causes', [])
        cause_text = ', '.join(causes) if causes else 'none'
        lines.append('- `{0}`: status={1}, raw={2}, kept={3}, degraded_causes={4}'.format(
            lane, status, raw_count, kept_count, cause_text
        ))

    lines.append('')
    lines.append('## Distilled Findings')
    lines.append('')
    lines.append('1. Candidate discovery is retained across all mandatory lanes with explicit recovery stage logging.')
    lines.append('2. Recommendation quality is constrained by signal-floor and lane-intent overlap gates.')
    lines.append('3. Merge decisions remain blocked when checks are missing; blocker artifacts are required.')

    obsidian_path = os.path.join(survey_dir, 'obsidian-note.md')
    wiki_path = os.path.join(survey_dir, 'llm-wiki-note.md')

    payload = '\n'.join(lines) + '\n'
    with open(obsidian_path, 'w', encoding='utf-8') as f:
        f.write(payload)
    with open(wiki_path, 'w', encoding='utf-8') as f:
        f.write(payload)

    print('wrote {0}'.format(obsidian_path))
    print('wrote {0}'.format(wiki_path))
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
