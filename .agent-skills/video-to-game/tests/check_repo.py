#!/usr/bin/env python3
"""Static checks for the repository: links, sizes, hygiene, script syntax.

Usage:
  python3 tests/check_repo.py
"""
import ast
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
errors = []


def files(exts):
    for d, dirs, fs in os.walk(ROOT):
        dirs[:] = [x for x in dirs if x not in ('.git', 'node_modules')]
        for f in fs:
            if f.endswith(exts):
                yield os.path.join(d, f)


for p in files(('.md',)):
    text = open(p, encoding='utf-8').read()
    for link in re.findall(r'\]\(([^)#]+)\)', text):
        if link.startswith(('http://', 'https://', 'mailto:')):
            continue
        if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(p), link))):
            errors.append(f'{os.path.relpath(p, ROOT)}: broken link {link}')

for p in files(('.py',)):
    try:
        ast.parse(open(p, encoding='utf-8').read())
    except SyntaxError as e:
        errors.append(f'{os.path.relpath(p, ROOT)}: {e}')
for p in files(('.mjs',)):
    if subprocess.run(['node', '--check', p], capture_output=True).returncode:
        errors.append(f'{os.path.relpath(p, ROOT)}: node --check failed')

secret = re.compile(r'(/Users/[a-z]|/home/[a-z]|FAL_KEY\s*=\s*["\'][0-9a-f-]{8}|sk-[A-Za-z0-9]{20})')
for p in files(('.md', '.py', '.mjs', '.js', '.html', '.json')):
    if secret.search(open(p, encoding='utf-8', errors='ignore').read()):
        errors.append(f'{os.path.relpath(p, ROOT)}: home path or secret')

for p in files(('.gif',)):
    if os.path.getsize(p) > 4_000_000:
        errors.append(f'{os.path.relpath(p, ROOT)}: {os.path.getsize(p) // 1024} KB')
total = sum(os.path.getsize(p) for p in files(('',)))
if total > 40_000_000:
    errors.append(f'repository is {total // 1_000_000} MB')

for g in sorted(os.listdir(os.path.join(ROOT, 'gallery'))):
    d = os.path.join(ROOT, 'gallery', g)
    if os.path.isdir(d):
        for need in ('poster.gif', 'README.md', 'game/index.html'):
            if not os.path.exists(os.path.join(d, need)):
                errors.append(f'gallery/{g}: missing {need}')

print('\n'.join(errors) or f'ok ({total // 1_000_000} MB)')
sys.exit(1 if errors else 0)
