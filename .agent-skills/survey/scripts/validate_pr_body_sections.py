#!/usr/bin/env python3
import json
import os
import sys

REQUIRED = [
    '## Summary',
    '## Evidence',
    '## Risk',
    '## Rollback',
    '## Validation',
]

def main():
    if len(sys.argv) != 3:
        sys.stderr.write('usage: validate_pr_body_sections.py <pr-body.md> <output.json>\n')
        return 2
    body_path = sys.argv[1]
    out_path = sys.argv[2]
    if not os.path.exists(body_path):
        sys.stderr.write('missing file: {}\n'.format(body_path))
        return 2
    text = open(body_path, 'r', encoding='utf-8').read()
    missing = [h for h in REQUIRED if h not in text]
    data = {
        'ok': len(missing) == 0,
        'required_sections': REQUIRED,
        'missing_sections': missing,
        'body_path': body_path,
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    if missing:
        sys.stderr.write('missing sections: {}\n'.format(', '.join(missing)))
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
