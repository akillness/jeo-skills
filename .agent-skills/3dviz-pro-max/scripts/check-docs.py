"""Check repository-owned Markdown links and JSON examples, excluding private plans."""
import argparse
import json
from pathlib import Path
import re
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
SKIP = {'plans', 'node_modules', 'dist', '.git', '.local', '__pycache__'}
PRESERVED_STALE_LINKS = {
    (Path('evidence/artifacts/legacy-early-slice/validation-report.md'), '.local/first-frame.py'),
    (Path('evidence/artifacts/legacy-early-slice/validation-report.md'),
     '../../evals/skill-behavior/village-application/README.md'),
}


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    errors = []
    for path in sorted(ROOT.rglob('*.md')):
        if SKIP.intersection(path.relative_to(ROOT).parts):
            continue
        content = path.read_text()
        # Code examples may intentionally show paths to be created by users.
        prose = re.sub(r'```.*?```', '', content, flags=re.S)
        # This report is an evidence output whose bytes must remain unchanged. Its archive README
        # supplies current navigation; two original relative links intentionally retain old context.
        relative_path = path.relative_to(ROOT)
        for raw in re.findall(r'\]\(([^)]+)\)', prose):
            link = raw.strip('<>').split('#')[0]
            if not link or re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', link):
                continue
            target = path.parent / unquote(link)
            if not target.exists() and (relative_path, link) not in PRESERVED_STALE_LINKS:
                errors.append(f'{relative_path}: missing {link}')
        for block in re.findall(r'```json\n(.*?)\n```', content, re.S):
            try:
                json.loads(block)
            except ValueError as error:
                errors.append(f'{path.relative_to(ROOT)}: invalid JSON example: {error}')
    if errors:
        raise SystemExit('\n'.join(errors))
    print('Public Markdown file links and JSON examples verified.')


if __name__ == '__main__':
    main()
