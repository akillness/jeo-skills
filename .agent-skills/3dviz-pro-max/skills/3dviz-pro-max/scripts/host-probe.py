"""Discover host tools and recommend available shipped-kit pipelines, without grading art.

Read-only and stdlib only: it runs a fixed allow-list of version commands with no shell and a
5 s timeout each, installs nothing, downloads nothing and writes exactly one file (--out).
Every probe that fails - missing command, non-zero exit, timeout - becomes `found: false` with
the command named as its source. Absence is data, so the exit status is always 0.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import platform
import re
import subprocess
import sys

from blender_locate import find_blender

SCHEMA_VERSION = 1
TIMEOUT_S = 5
BROWSER_DIRS = {'Darwin': '~/Library/Caches/ms-playwright',
                'Linux': '~/.cache/ms-playwright',
                'Windows': '~/AppData/Local/ms-playwright'}


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def run(command, timeout_s=TIMEOUT_S):
    """stdout of a fixed command, or None when it is missing, slow or unhappy. Never raises."""
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout_s,
                                check=False, shell=False)
    except (OSError, subprocess.SubprocessError):
        return None
    return result.stdout.strip() if result.returncode == 0 else None


def first_line(text):
    return text.splitlines()[0].strip() if text else None


def os_info(system):
    return {'system': system, 'release': platform.release(),
            'product_version': first_line(run(['sw_vers', '-productVersion']))
                               if system == 'Darwin' else None,
            'arch': platform.machine()}


def cpu_info(system):
    """Brand string where the platform offers one; logical cores always."""
    brand = None
    if system == 'Darwin':
        brand = first_line(run(['sysctl', '-n', 'machdep.cpu.brand_string']))
    elif system == 'Linux':
        match = re.search(r'model name\s*:\s*(.+)', run(['cat', '/proc/cpuinfo']) or '')
        brand = match.group(1).strip() if match else None
    elif system == 'Windows':
        brand = first_line(run(['wmic', 'cpu', 'get', 'name', '/value']))
    return {'brand': brand, 'logical_cores': os.cpu_count()}


def memory_gb(system):
    """Installed RAM in GB, or None when the platform does not answer."""
    raw = None
    if system == 'Darwin':
        raw = run(['sysctl', '-n', 'hw.memsize'])
    elif system == 'Linux':
        match = re.search(r'MemTotal:\s+(\d+) kB', run(['cat', '/proc/meminfo']) or '')
        return round(int(match.group(1)) / 1024 ** 2, 1) if match else None
    elif system == 'Windows':
        raw = re.sub(r'\D', '', run(['wmic', 'computersystem', 'get',
                                     'TotalPhysicalMemory', '/value']) or '') or None
    try:
        return round(int(raw) / 1024 ** 3, 1)
    except (TypeError, ValueError):
        return None


def gpu_darwin():
    text = run(['system_profiler', 'SPDisplaysDataType', '-json'])
    source = 'system_profiler SPDisplaysDataType -json'
    try:
        cards = json.loads(text)['SPDisplaysDataType']
    except (TypeError, ValueError, KeyError):
        return {'found': False, 'source': f'{source} unavailable'}
    if not cards:
        return {'found': False, 'source': f'{source} listed no display device'}
    card = cards[0]
    cores = card.get('sppci_cores')
    return {'found': True, 'name': card.get('sppci_model') or card.get('_name'),
            'vendor': card.get('spdisplays_vendor'),
            'cores': int(cores) if str(cores).isdigit() else None, 'source': source}


def gpu_linux():
    name = first_line(run(['nvidia-smi', '--query-gpu=name', '--format=csv,noheader']))
    if name:
        return {'found': True, 'name': name, 'vendor': 'NVIDIA', 'cores': None,
                'source': 'nvidia-smi --query-gpu=name'}
    lines = [line for line in (run(['lspci']) or '').splitlines() if 'VGA' in line.upper()]
    if lines:
        return {'found': True, 'name': lines[0].split(': ', 1)[-1].strip(), 'vendor': None,
                'cores': None, 'source': 'lspci (VGA lines)'}
    return {'found': False, 'source': 'nvidia-smi and lspci unavailable'}


def gpu_windows():
    text = run(['wmic', 'path', 'win32_VideoController', 'get', 'name'])
    names = [line.strip() for line in (text or '').splitlines()[1:] if line.strip()]
    if names:
        return {'found': True, 'name': names[0], 'vendor': None, 'cores': None,
                'source': 'wmic path win32_VideoController get name'}
    return {'found': False, 'source': 'wmic path win32_VideoController unavailable'}


def gpu_info(system):
    probes = {'Darwin': gpu_darwin, 'Linux': gpu_linux, 'Windows': gpu_windows}
    return probes.get(system, lambda: {'found': False, 'source': f'no GPU probe for {system}'})()


def playwright_version():
    try:
        from importlib.metadata import version
        return version('playwright')
    except Exception:
        return None


def chromium_installed(system):
    """True when a Playwright chromium build exists for the current user. The path is not
    reported: it contains the home directory and the probe publishes no home paths."""
    root = os.environ.get('PLAYWRIGHT_BROWSERS_PATH') or BROWSER_DIRS.get(system)
    if not root or root == '0':
        return None
    directory = Path(root).expanduser()
    return bool(directory.is_dir() and list(directory.glob('chromium*')))


def runtimes(system):
    node = first_line(run(['node', '--version']))
    return {'node': node.lstrip('v') if node else None,
            'pnpm': first_line(run(['pnpm', '--version'])),
            'python': platform.python_version(),
            'playwright': playwright_version(),
            'playwright_source': 'importlib.metadata in the interpreter running this probe',
            'chromium_installed': chromium_installed(system)}


def ceiling(blender):
    """Legacy kit-pipeline recommendation, not a limit on custom or external asset quality."""
    if blender['found'] and blender['meets_minimum']:
        return 'T3', f'Blender {blender["version"]} >= 4.2 found via {blender["source"]}'
    if blender['found']:
        return 'T2', (f'Blender {blender["version"]} is older than 4.2 LTS, '
                      'so the T3 bake pipeline is not supported')
    return 'T2', f'no runnable Blender ({blender["source"]}), so no T3 bake'


def capture_mode(system, has_chromium):
    """--use-angle=metal is measured on darwin; other platforms report their unverified flag."""
    if system != 'Darwin':
        return 'swiftshader', (f'{system}: the ANGLE backend flag is unverified here, so the '
                               'expected capture mode stays the software renderer')
    if not has_chromium:
        return 'swiftshader', 'darwin, but no Playwright chromium build was found to run with ANGLE'
    return 'gpu', 'darwin + chromium available: --use-angle=metal is supported'


def probe(system=None):
    system = system or platform.system()
    blender = find_blender(system)
    quality, quality_reason = ceiling(blender)
    runtime = runtimes(system)
    mode, mode_reason = capture_mode(system, runtime['chromium_installed'])
    return {'schema_version': SCHEMA_VERSION, 'probed_at': now(), 'os': os_info(system),
            'cpu': cpu_info(system), 'memory_gb': memory_gb(system), 'gpu': gpu_info(system),
            'blender': blender, 'runtimes': runtime,
            'quality_ceiling': quality, 'quality_ceiling_reason': quality_reason,
            'quality_ceiling_scope': 'shipped-kit-pipelines',
            'quality_note': ('Tool discovery does not grade art, constrain custom/sourced geometry, '
                             'or prove that a bake, render or scientific model was executed.'),
            'capture_mode_expected': mode, 'capture_mode_reason': mode_reason}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', help='write host.json here as well as printing it')
    args = parser.parse_args(argv)
    report = json.dumps(probe(), indent=2)
    if args.out:
        path = Path(args.out)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(report + '\n', encoding='utf-8')
    print(report)
    return 0


if __name__ == '__main__':
    sys.exit(main())
