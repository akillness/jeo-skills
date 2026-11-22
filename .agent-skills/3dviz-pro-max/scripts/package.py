"""Build deterministic portable skill and Codex plugin ZIPs, never install or publish."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[1]
NAME = '3dviz-pro-max'
SKILL = ROOT / 'skills' / NAME
ALLOWED_SUFFIXES = {'.md', '.json', '.yaml', '.py'}
ALLOWED_SUFFIXES |= {'.js', '.html', '.css'}
# Blueprint kits may ship one baked glTF binary each; the 2 MB cap on an asset is a data
# rule enforced by scripts/validate.py, so an oversize asset fails before it is ever zipped.
ALLOWED_SUFFIXES |= {'.glb'}
# Build artifacts and installed dependency trees are never part of the canonical skill.
EXCLUDED_PARTS = {'dist', 'node_' + 'modules'}


def skill_files(root=SKILL):
    files = []
    for path in sorted(root.rglob('*')):
        if path.is_symlink():
            raise ValueError(f'Symlink cannot be packaged: {path}')
        relative = path.relative_to(root)
        if '__pycache__' in relative.parts:
            continue
        if any(part.startswith('.') for part in relative.parts):
            raise ValueError(f'Private or hidden path cannot be packaged: {relative}')
        if EXCLUDED_PARTS.intersection(relative.parts):
            raise ValueError(f'Build output or installed dependency cannot be packaged: {relative}')
        if path.is_file():
            if relative.parts[0] not in {'SKILL.md', 'agents', 'references', 'scripts', 'data',
                                         'assets', 'templates'}:
                raise ValueError(f'Unexpected skill root entry: {relative}')
            if path.suffix not in ALLOWED_SUFFIXES:
                raise ValueError(f'Unexpected file in skill: {path}')
            files.append(path)
    if not (root / 'SKILL.md').is_file():
        raise ValueError('Missing SKILL.md')
    return files


def write_zip(target, entries):
    with ZipFile(target, 'w', compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for name, content in sorted(entries.items()):
            info = ZipInfo(name, (2020, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, content)


# Host plugin manifests that ride along in the plugin ZIP. Both hosts expect the same layout:
# a root folder holding the manifest directory and skills/<name>/SKILL.md.
PLUGIN_MANIFESTS = ('.codex-plugin/plugin.json', '.claude-plugin/plugin.json')


def build(output):
    versions = {m: json.loads((ROOT / m).read_text())['version'] for m in PLUGIN_MANIFESTS}
    versions['skills/3dviz-pro-max/data/manifest.json'] = json.loads(
        (SKILL / 'data/manifest.json').read_text())['version']
    if len(set(versions.values())) != 1:
        raise ValueError(f'Plugin and skill versions differ: {versions}')
    version = versions[PLUGIN_MANIFESTS[0]]
    output.mkdir(parents=True, exist_ok=True)
    portable = {f'{NAME}/{p.relative_to(SKILL).as_posix()}': p.read_bytes()
                for p in skill_files()}
    plugin = {f'{NAME}/skills/{NAME}/{p.relative_to(SKILL).as_posix()}': p.read_bytes()
              for p in skill_files()}
    for manifest in PLUGIN_MANIFESTS:
        plugin[f'{NAME}/{manifest}'] = (ROOT / manifest).read_bytes()
    # Both archives carry the repository license so a distributed copy states its terms.
    license_text = (ROOT / 'LICENSE').read_bytes()
    portable[f'{NAME}/LICENSE'] = license_text
    plugin[f'{NAME}/LICENSE'] = license_text
    assets = []
    for kind, entries in [('skill', portable), ('plugin', plugin)]:
        path = output / f'{NAME}-{version}-{kind}.zip'
        write_zip(path, entries)
        assets.append(path)
    content = {'version': version,
               'plugin_layout': 'root folder containing .codex-plugin, .claude-plugin and skills',
               'host_install_status': {
                   'codex': 'not-tested',
                   'claude-code': 'loaded with --plugin-dir on Claude Code 2.1.265 (macOS, 2026-09-09); '
                                  'marketplace install not-tested'},
               'files': {name: hashlib.sha256(value).hexdigest() for name, value in sorted(plugin.items())}}
    path = output / 'content-manifest.json'
    path.write_text(json.dumps(content, indent=2)+'\n')
    assets.append(path)
    summary = output / 'catalog-summary.json'
    summary.write_bytes((SKILL / 'data/catalog-summary.json').read_bytes())
    assets.append(summary)
    (output / 'SHA256SUMS').write_text(''.join(
        f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in assets))
    return assets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    args = parser.parse_args()
    subprocess.run([sys.executable, str(ROOT/'scripts/validate.py')], check=True, cwd=ROOT)
    subprocess.run([sys.executable, str(ROOT/'scripts/build-index.py'), '--check'], check=True, cwd=ROOT)
    for path in build(args.output):
        print(path.relative_to(ROOT) if path.is_relative_to(ROOT) else path)


if __name__ == '__main__':
    main()
