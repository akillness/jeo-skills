#!/usr/bin/env python3
"""Deterministically decide hourly PR mode from open-PR and checks artifacts.

Usage:
  python3 decide_hourly_pr_mode.py <open_prs.json> <checks_summary.json> <output.json>
"""

import json
import os
import sys


def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def main(argv):
    if len(argv) != 4:
        sys.stderr.write(
            "usage: python3 decide_hourly_pr_mode.py <open_prs.json> <checks_summary.json> <output.json>\n"
        )
        return 2

    open_prs_path = argv[1]
    checks_summary_path = argv[2]
    out_path = argv[3]

    open_prs = load_json(open_prs_path)
    checks_summary = load_json(checks_summary_path)

    open_pr_count = len(open_prs)
    checks_status = str(checks_summary.get('status', 'unknown'))
    merge_blocked_reason = checks_summary.get('merge_blocked_reason')

    mode = 'new-pr-eligible'
    rationale = []

    if open_pr_count >= 1:
        mode = 'carry-forward-open-pr'
        rationale.append('open-pr-gate-active')

    if checks_status in ('no-checks-reported', 'error'):
        if mode == 'carry-forward-open-pr':
            mode = 'carry-forward-blocked-no-checks'
        else:
            mode = 'checks-degraded-no-new-pr'
        rationale.append('checks-not-green')

    if merge_blocked_reason:
        rationale.append('merge-blocked:{0}'.format(merge_blocked_reason))

    result = {
        'open_pr_count': open_pr_count,
        'checks_status': checks_status,
        'merge_blocked_reason': merge_blocked_reason,
        'mode': mode,
        'rationale': rationale,
        'open_pr_numbers': [pr.get('number') for pr in open_prs],
    }

    out_dir = os.path.dirname(out_path)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write('\n')

    sys.stdout.write(out_path + '\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
