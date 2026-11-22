"""Find a Blender binary without asking the user to fix PATH.

Shared by host-probe.py (reports the quality ceiling) and hero-tier.py (bakes T3 heroes) so the
two can never disagree about where Blender is. PATH is checked first, then the standard install
locations per platform; `--version` is executed on the first candidate that exists, so a broken
install reports `found: False` rather than a path that cannot run. Stdlib only, never installs.
"""
import glob
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess

MIN_VERSION = (4, 2)   # oldest LTS the T3 pipeline was written against

STANDARD_PATHS = {
    'Darwin': ['/Applications/Blender.app/Contents/MacOS/Blender',
               '~/Applications/Blender.app/Contents/MacOS/Blender'],
    'Linux': ['/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender',
              '/var/lib/flatpak/exports/bin/org.blender.Blender'],
    'Windows': [r'C:\Program Files\Blender Foundation\Blender *\blender.exe'],
}


def candidates(system=None):
    """Executable paths to try, PATH first, highest Windows version first."""
    found = []
    on_path = shutil.which('blender')
    if on_path:
        found.append((on_path, True))
    for pattern in STANDARD_PATHS.get(system or platform.system(), []):
        expanded = os.path.expanduser(pattern)
        matches = sorted(glob.glob(expanded), reverse=True) if '*' in expanded else [expanded]
        found.extend((path, False) for path in matches if Path(path).is_file())
    return found


def blender_version(path, timeout_s=5):
    """'5.2.1' from `blender --version`, or None when it cannot run."""
    try:
        result = subprocess.run([path, '--version'], capture_output=True, text=True,
                                timeout=timeout_s, check=False)
    except (OSError, subprocess.SubprocessError):
        return None
    match = re.search(r'Blender\s+(\d+)\.(\d+)(?:\.(\d+))?', result.stdout or '')
    return '.'.join(g for g in match.groups() if g is not None) if match else None


def find_blender(system=None):
    """{'found', 'path', 'version', 'on_path', 'meets_minimum', 'source'}; found is False when
    nothing runs. Absence is data, not an error."""
    for path, on_path in candidates(system):
        version = blender_version(path)
        if version:
            parts = tuple(int(v) for v in version.split('.')[:2])
            return {'found': True, 'path': path, 'version': version, 'on_path': on_path,
                    'meets_minimum': parts >= MIN_VERSION,
                    'source': ('PATH' if on_path else 'standard install path') + ' + --version'}
    return {'found': False, 'path': None, 'version': None, 'on_path': False,
            'meets_minimum': False, 'source': 'no runnable candidate on PATH or standard paths'}


if __name__ == '__main__':
    import json
    print(json.dumps(find_blender(), indent=2))
