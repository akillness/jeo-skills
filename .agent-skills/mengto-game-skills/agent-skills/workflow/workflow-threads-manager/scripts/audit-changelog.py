#!/usr/bin/env python3
"""Check every commit on origin/main since a revision against an in-app changelog of per-change versions.

Expects entries shaped v('0.1.N', 'YYYY-MM-DD', '<id>', '<title>', '<note>', <big: true|false>, <commit|null>) (the
format of the build-game-changelog pattern). For each commit it prints the version(s) the commit added, whether the
version is big (three pictures: <id>, <id>-2, <id>-3) or small (one: <id>), how many of its pictures are shipped, and
flags commits with no version. Commits that touch only tests, docs, AGENTS.md or scripts are marked exempt.

  audit-changelog.py <since-rev> [--repo PATH] [--changelog src/changelog.js] [--pictures <dir>/]

--pictures defaults to the folder on origin/main that holds the most files under a */changelog/ path.

Run it with run_in_background on a busy machine; each commit costs a few git calls.
"""
import argparse, re, subprocess as sp

ENTRY = re.compile(r"v\('([\d.]+)', '([\d-]+)', '([^']*)', '((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)', (true|false), (null|'[0-9a-f]+')\)")
EXEMPT = re.compile(r"^(tests/|docs/|AGENTS\.md$|CLAUDE\.md$|README\.md$|scripts/|\.github/|qa/)")


def picture_dir(listing):
    counts = {}
    for path in listing.split():
        if '/changelog/' in path and re.search(r'\.(webp|jpe?g|png)$', path):
            d = path.rsplit('/', 1)[0] + '/'
            counts[d] = counts.get(d, 0) + 1
    return max(counts, key=counts.get) if counts else 'public/changelog/'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('since')
    ap.add_argument('--repo', default='.')
    ap.add_argument('--changelog', default='src/changelog.js')
    ap.add_argument('--pictures', default=None)
    a = ap.parse_args()
    g = lambda *args: sp.run(['git', '-C', a.repo, *args], capture_output=True, text=True).stdout
    g('fetch', '-q', 'origin')
    CHANGELOG = a.changelog
    PICTURES = a.pictures or picture_dir(g('ls-tree', '-r', '--name-only', 'origin/main'))
    head = g('show', f'origin/main:{CHANGELOG}')
    entries = ENTRY.findall(head)
    pics = {p.rsplit('/', 1)[-1].rsplit('.', 1)[0] for p in g('ls-tree', '--name-only', 'origin/main', PICTURES).split()}
    pkg = re.search(r'"version":\s*"([^"]+)"', g('show', 'origin/main:package.json'))
    print(f"changelog: {len(entries)} versions, newest v{entries[0][0]} ({entries[0][2]}), package.json {pkg.group(1) if pkg else '?'}")
    missing = 0
    for c in g('log', '--no-merges', '--format=%h', f'{a.since}..origin/main').split():
        subject = g('log', '-1', '--format=%s', c).strip()[:72]
        files = [f for f in g('show', '--name-only', '--format=', c).split() if f]
        before = {e[0] for e in ENTRY.findall(g('show', f'{c}^:{CHANGELOG}'))}
        after = ENTRY.findall(g('show', f'{c}:{CHANGELOG}'))
        added = [e for e in after if e[0] not in before]
        full = g('rev-parse', c).strip()
        named = [e for e in entries if e[6] != 'null' and full.startswith(e[6].strip("'")) and e not in added]
        rows = added or named
        if not rows:
            if files and all(EXEMPT.match(f) for f in files):
                print(f"{c}  exempt      (only {', '.join(sorted({f.split('/')[0] for f in files}))})  {subject}")
            else:
                missing += 1
                print(f"{c}  NO VERSION  ({len(files)} files: {', '.join(files[:4])}{' …' if len(files) > 4 else ''})  {subject}")
            continue
        for e in rows:
            need = [e[2]] + ([f'{e[2]}-2', f'{e[2]}-3'] if e[5] == 'true' else [])
            have = sum(n in pics for n in need)
            flag = '' if have == len(need) else '  <-- MISSING PICTURES'
            print(f"{c}  v{e[0]:<8} {e[2]:<22} {'big  ' if e[5] == 'true' else 'small'} pictures {have}/{len(need)}{flag}  {subject}")
    print(f"\n{missing} commit(s) with no version" if missing else "\nevery player-facing commit has a version")


if __name__ == '__main__':
    main()
