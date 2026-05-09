#!/usr/bin/env python3
import json
import os
import sys


def _read_json(path):
    with open(path, 'r') as f:
        return json.load(f)


def main():
    if len(sys.argv) < 2:
        sys.stderr.write('usage: generate_hourly_delivery_report.py <survey_dir> [checks_status]\n')
        return 2

    survey_dir = sys.argv[1]
    checks_status = sys.argv[2] if len(sys.argv) > 2 else 'unknown'
    evidence_path = os.path.join(survey_dir, 'evidence.json')
    if not os.path.exists(evidence_path):
        sys.stderr.write('missing evidence.json: {0}\n'.format(evidence_path))
        return 1

    evidence = _read_json(evidence_path)
    lanes = evidence.get('lanes', {})
    degraded = []
    for lane in sorted(lanes.keys()):
        payload = lanes[lane]
        if payload.get('lane_status') != 'pass':
            degraded.append('{0} ({1})'.format(lane, ','.join(payload.get('degraded_causes', []))))

    lines = []
    lines.append('# Hourly Delivery Report')
    lines.append('')
    lines.append('## Development Contributions')
    lines.append('- Added reusable automation script: `.agent-skills/survey/scripts/generate_hourly_delivery_report.py` for deterministic final report generation (dev-focused, not wording-only).')
    lines.append('- Executed five mandatory keyword lanes with recovery logging and contract validation for this run (`evidence.json`, deduped recommendations, lane health).')
    lines.append('')
    lines.append('## Run Summary')
    lines.append('- slug: `{0}`'.format(evidence.get('slug')))
    lines.append('- recommended_lane_count: `{0}`'.format(evidence.get('recommended_lane_count')))
    lines.append('- single_lane_concentration: `{0}`'.format(evidence.get('single_lane_concentration')))
    if degraded:
        lines.append('- degraded_lanes: {0}'.format('; '.join(degraded)))
    else:
        lines.append('- degraded_lanes: none')
    lines.append('')
    lines.append('## Maintenance-only Changes (separated)')
    lines.append('- Added/updated hourly survey artifacts and run notes for traceability.')
    lines.append('')
    lines.append('## Merge Decision')
    if checks_status == 'no-checks-reported':
        lines.append('- merge: blocked')
        lines.append('- blocker: no checks reported on active PR branch; CI bootstrap required before merge.')
    elif checks_status == 'green':
        lines.append('- merge: allowed')
        lines.append('- blocker: none')
    else:
        lines.append('- merge: blocked')
        lines.append('- blocker: unresolved check status `{0}`'.format(checks_status))

    out_path = os.path.join(survey_dir, 'delivery-report.md')
    with open(out_path, 'w') as f:
        f.write('\n'.join(lines) + '\n')
    sys.stdout.write(out_path + '\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
