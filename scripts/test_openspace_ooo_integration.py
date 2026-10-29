#!/usr/bin/env python3
"""Isolated OpenSpace-before-ooo integration tests; no real installs or network."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


INSTALLER = Path(__file__).resolve().parents[1] / '.agent-skills/ooo/scripts/install.sh'


class OpenSpaceOooIntegration(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix='openspace-ooo-test-')
        self.addCleanup(tmp.cleanup)
        self.work = Path(tmp.name).resolve()
        self.home = self.work / 'home'
        self.bin = self.work / 'bin'
        self.modules = self.work / 'modules'
        self.catalog = self.work / 'catalog'
        for path in (self.home, self.bin, self.modules, self.catalog):
            path.mkdir()
        self.log = self.work / 'events.jsonl'
        self.file('sitecustomize.py', '''import socket\ndef denied(*args, **kwargs):\n    raise RuntimeError("fixture blocked network")\nsocket.socket.connect = denied\nsocket.create_connection = denied\n''')
        self.file('rank_bm25.py', '')
        self.file('yaml.py', '''def safe_load(text):\n    return dict(line.split(": ", 1) for line in text.strip().splitlines())\n''')
        for name in ('openspace/__init__.py', 'openspace/utils/__init__.py', 'openspace/skill_engine/__init__.py'):
            self.file(name, '')
        self.file('openspace/utils/logging.py', '''class Logger:\n    @staticmethod\n    def configure(**kwargs):\n        assert kwargs == {"log_to_console": False, "log_to_file": None}\n''')
        self.file('openspace/skill_engine/skill_ranker.py', '''import json, os\ndef record(event):\n    with open(os.environ["FIXTURE_LOG"], "a") as f:\n        f.write(json.dumps(event) + "\\n")\nclass SkillCandidate:\n    def __init__(self, **kwargs):\n        self.__dict__.update(kwargs)\nclass SkillRanker:\n    def __init__(self, enable_cache=True):\n        assert enable_cache is False\n        record({"event": "ready"})\n    def bm25_only(self, query, candidates, top_k):\n        record({"event": "bm25", "query": query, "top_k": top_k, "candidates": [vars(c).copy() for c in candidates]})\n        if os.environ.get("FIXTURE_ERROR"):\n            raise RuntimeError("fixture ranking failed")\n        for candidate in candidates:\n            candidate.bm25_score = 0 if os.environ.get("FIXTURE_EMPTY") else (2 if candidate.name == "alpha" else 0)\n        return candidates\n''')
        for name in ('alpha', 'beta'):
            target = self.catalog / name / 'SKILL.md'
            target.parent.mkdir()
            target.write_text(f'---\nname: {name}\ndescription: {name} synthetic description\n---\n{name} synthetic body\n')
        (self.bin / 'python3').symlink_to(sys.executable)
        for utility in ('dirname', 'mkdir', 'mktemp', 'rm'):
            (self.bin / utility).symlink_to(Path('/usr/bin') / utility if (Path('/usr/bin') / utility).exists() else Path('/bin') / utility)
        for cmd in ('npx', 'pip3', 'ouroboros', 'git', 'curl', 'openspace-mcp'):
            self.command(cmd, f'''import json, os, sys\nwith open(os.environ['FIXTURE_LOG'], 'a') as f:\n    f.write(json.dumps({{'event': {cmd!r}, 'argv': sys.argv[1:]}}) + "\\n")\n''')
        self.command('target', '''import json, os, sys\nwith open(os.environ['FIXTURE_LOG'], 'a') as f:\n    f.write(json.dumps({'event': 'target', 'argv': sys.argv[1:], 'skill': os.environ.get('OOO_SKILL_PATH'), 'request': os.environ.get('OOO_REQUEST'), 'stdin': sys.stdin.read()}) + "\\n")\n''')
        self.command('python with spaces', '''import json, os, sys
with open(os.environ['FIXTURE_LOG'], 'a') as f:
    f.write(json.dumps({'event': 'selected-python', 'argv': sys.argv[1:]}) + "\\n")
if sys.argv[1:2] == ['-c']:
    print('1' if os.environ.get('FIXTURE_MANAGED') else '0')
    sys.exit(0)
if os.environ.get('FAIL_SELECTED_PYTHON'):
    sys.exit(41)
''')
        self.env = {'HOME': str(self.home), 'PATH': str(self.bin), 'TMPDIR': str(self.work),
                    'XDG_CONFIG_HOME': str(self.home / '.config'), 'XDG_CACHE_HOME': str(self.home / '.cache'),
                    'PYTHONPATH': str(self.modules), 'PYTHONDONTWRITEBYTECODE': '1',
                    'OPENSPACE_PYTHON': str(self.bin / 'python3'), 'FIXTURE_LOG': str(self.log),
                    'PYTHON_BIN': str(self.bin / 'python with spaces'),
                    'OOO_GIT_INTERVIEW': '0', 'OOO_SPEC_KIT': '0', 'OOO_CLI_ANYTHING': '0'}
        sentinel = self.home / '.claude.json'
        sentinel.write_bytes(b'{"mcpServers":{"user":"unchanged"}}\n')

    def file(self, name, contents):
        path = self.modules / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(contents)

    def command(self, name, body):
        path = self.bin / name
        path.write_text(f'#!{sys.executable}\n' + body)
        path.chmod(0o700)

    def run_script(self, *args, stdin='', **env):
        return subprocess.run(['/bin/bash', str(INSTALLER), *map(str, args)], cwd=self.work,
                              env={**self.env, **env}, input=stdin, text=True,
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20)

    def events(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def home_snapshot(self):
        return {str(p.relative_to(self.home)): p.read_bytes() for p in self.home.rglob('*') if p.is_file()}

    def test_install_checks_openspace_before_ooo_and_never_registers_mcp(self):
        before = self.home_snapshot()
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stdout)
        events = self.events()
        names = [e['event'] for e in events]
        self.assertEqual(names[:5], ['ready', 'bm25', 'selected-python', 'selected-python', 'npx'])
        self.assertNotIn('pip3', names)
        invocations = [e['argv'] for e in events if e['event'] == 'selected-python']
        self.assertEqual(invocations[0][0], '-c')
        self.assertEqual(invocations[1], ['-m', 'pip', '--version'])
        self.assertEqual(invocations[2][:3], ['-m', 'pip', 'install'])
        self.assertEqual(events[1]['query'], 'probe')
        self.assertNotIn('openspace-mcp', names)
        self.assertNotIn('git', names)
        self.assertNotIn('curl', names)
        self.assertEqual(before, self.home_snapshot())

    def test_missing_pip_in_selected_python_fails_without_path_fallback(self):
        result = self.run_script(FAIL_SELECTED_PYTHON='1')
        self.assertNotEqual(result.returncode, 0, result.stdout)
        names = [e['event'] for e in self.events()]
        self.assertIn('selected-python', names)
        self.assertNotIn('pip3', names)
        self.assertNotIn('npx', names)

    def test_managed_python_is_rejected_before_changes_unless_package_skipped(self):
        before = self.home_snapshot()
        result = self.run_script(FIXTURE_MANAGED='1')
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn('externally managed', result.stdout.lower())
        self.assertNotIn('npx', [e['event'] for e in self.events()])
        self.assertEqual(before, self.home_snapshot())
        self.log.unlink()
        result = self.run_script(FIXTURE_MANAGED='1', SKIP_PACKAGE='1')
        self.assertEqual(result.returncode, 0, result.stdout)
        names = [e['event'] for e in self.events()]
        self.assertNotIn('selected-python', names)
        self.assertIn('npx', names)

    def test_missing_dependency_or_interpreter_blocks_all_ooo_installation(self):
        for missing in ('dependency', 'interpreter'):
            with self.subTest(missing=missing):
                if self.log.exists():
                    self.log.unlink()
                options = {}
                if missing == 'dependency':
                    (self.modules / 'rank_bm25.py').rename(self.modules / 'rank_bm25.disabled')
                else:
                    options['OPENSPACE_PYTHON'] = str(self.work / 'missing-python')
                result = self.run_script(**options)
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertNotIn('npx', [e['event'] for e in self.events()])
                self.assertNotIn('pip3', [e['event'] for e in self.events()])
                if missing == 'dependency':
                    (self.modules / 'rank_bm25.disabled').rename(self.modules / 'rank_bm25.py')

    def test_install_without_approval_never_attempts_download_or_mcp_registration(self):
        before = self.home_snapshot()
        result = self.run_script(OPENSPACE_PYTHON=str(self.work / 'absent'))
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn('approv', result.stdout.lower())
        self.assertEqual(self.events(), [])
        self.assertEqual(before, self.home_snapshot())

    def test_approved_install_transport_failure_blocks_ooo(self):
        self.command('git', '''import json, os, sys
with open(os.environ['FIXTURE_LOG'], 'a') as f:
    f.write(json.dumps({'event': 'git', 'argv': sys.argv[1:]}) + "\\n")
sys.exit(43)
''')
        target = self.home / 'isolated-openspace'
        result = self.run_script(OPENSPACE_PYTHON=str(target / 'venv/bin/python'),
                                 OPENSPACE_OOO_HOME=str(target), OPENSPACE_INSTALL_APPROVED='1')
        self.assertNotEqual(result.returncode, 0, result.stdout)
        names = [e['event'] for e in self.events()]
        self.assertIn('git', names)
        self.assertNotIn('npx', names)
        self.assertNotIn('pip3', names)
        self.assertNotIn('openspace-mcp', names)

    def test_staged_install_failures_are_retryable(self):
        self.command('git', '''import json, os, sys
from pathlib import Path
with open(os.environ['FIXTURE_LOG'], 'a') as f:
    f.write(json.dumps({'event': 'git', 'argv': sys.argv[1:]}) + "\\n")
if sys.argv[1] == 'clone':
    if os.environ.get('FAIL_STAGE') == 'clone':
        sys.exit(43)
    Path(sys.argv[-1]).mkdir()
''')
        self.command('fixture-python', '''import json, os, shutil, sys
from pathlib import Path
args = sys.argv[1:]
if args[:1] == ['-c'] and 'EXTERNALLY-MANAGED' in args[1]:
    print('0')
    sys.exit(0)
if args[:2] in (['-m', 'venv'], ['-m', 'pip']):
    stage = 'venv' if args[1] == 'venv' else 'pip'
    with open(os.environ['FIXTURE_LOG'], 'a') as f:
        f.write(json.dumps({'event': stage, 'argv': args}) + "\\n")
    if os.environ.get('FAIL_STAGE') == stage:
        sys.exit(44)
    if stage == 'venv':
        dest = Path(args[2]) / 'bin/python'
        dest.parent.mkdir(parents=True)
        shutil.copyfile(sys.argv[0], dest)
        dest.chmod(0o700)
    sys.exit(0)
os.execv(sys.executable, [sys.executable, *args])
''')
        sentinel = self.home / 'user-data'
        sentinel.mkdir()
        (sentinel / 'keep').write_bytes(b'untouched')
        for stage in ('clone', 'venv', 'pip'):
            with self.subTest(stage=stage):
                target = self.home / ('install-' + stage)
                options = {'OPENSPACE_OOO_HOME': str(target), 'OPENSPACE_PYTHON': str(target / 'venv/bin/python'),
                           'OPENSPACE_INSTALL_APPROVED': '1', 'PYTHON_BIN': str(self.bin / 'fixture-python')}
                if self.log.exists():
                    self.log.unlink()
                existing_stages = set(self.home.glob('.openspace-ooo.*'))
                failed = self.run_script(FAIL_STAGE=stage, **options)
                self.assertNotEqual(failed.returncode, 0, failed.stdout)
                self.assertFalse(target.exists())
                self.assertFalse(target.is_symlink())
                self.assertEqual(set(self.home.glob('.openspace-ooo.*')), existing_stages)
                self.assertNotIn('npx', [e['event'] for e in self.events()])
                self.assertEqual((sentinel / 'keep').read_bytes(), b'untouched')
                retry = self.run_script(**options)
                self.assertEqual(retry.returncode, 0, retry.stdout)
                self.assertTrue((target / 'venv/bin/python').is_file())
                self.assertEqual((sentinel / 'keep').read_bytes(), b'untouched')
                self.assertNotIn('openspace-mcp', [e['event'] for e in self.events()])

    def test_existing_install_target_is_never_overwritten(self):
        target = self.home / 'existing'
        target.mkdir()
        (target / 'keep').write_bytes(b'user content')
        result = self.run_script(OPENSPACE_OOO_HOME=str(target),
                                 OPENSPACE_PYTHON=str(target / 'venv/bin/python'), OPENSPACE_INSTALL_APPROVED='1')
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertEqual((target / 'keep').read_bytes(), b'user content')
        self.assertEqual(self.events(), [])

    def test_guide_mcp_block_requires_approval_and_preparation(self):
        guide = (INSTALLER.parents[3] / 'setup-all-skills-prompt.md').read_text()
        block = guide.split('### Ouroboros (`ooo`) MCP server', 1)[1].split('```bash\n', 1)[1].split('\n```', 1)[0]
        skills = self.work / 'guide-skills'
        script = skills / 'ooo/scripts/install.sh'
        script.parent.mkdir(parents=True)
        script.write_text('#!/bin/bash\nprintf "prepare %s\\n" "$*" >> "$GUIDE_LOG"\nexit "${PREPARE_STATUS:-0}"\n')
        (self.bin / 'bash').symlink_to('/bin/bash')
        (self.bin / 'ouroboros').unlink()
        for name in ('uv', 'uvx', 'claude', 'codex'):
            self.command(name, f'''import os, sys
with open(os.environ['GUIDE_LOG'], 'a') as f:
    f.write({name!r} + ' ' + ' '.join(sys.argv[1:]) + "\\n")
if sys.argv[1:3] == ['mcp', 'get']:
    sys.exit(1)
if os.environ.get('FAIL_GUIDE') == {name!r} and ({name!r} in ('uv', 'uvx') or sys.argv[1:3] == ['mcp', 'add']):
    sys.exit(45)
''')
        log = self.work / 'guide.log'
        base = {**self.env, 'SKILLS_ROOT': str(skills), 'USER_HOME': str(self.home), 'GUIDE_LOG': str(log)}
        for approval, status in (('false', '0'), ('true', '1'), ('true', '0')):
            if log.exists():
                log.unlink()
            result = subprocess.run(['/bin/bash'], input=block, text=True, cwd=self.work,
                                    env={**base, 'JEO_SKILLS_APPROVE_OOO_MCP': approval, 'PREPARE_STATUS': status},
                                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20)
            events = log.read_text().splitlines() if log.exists() else []
            if approval == 'false':
                self.assertEqual(result.returncode, 0, result.stdout)
                self.assertEqual(events, [])
            elif status == '1':
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertEqual(events, ['prepare --ensure-openspace'])
            else:
                self.assertEqual(result.returncode, 0, result.stdout)
                self.assertEqual(events[0], 'prepare --ensure-openspace')
                self.assertTrue(any(e.startswith('uv tool install ') for e in events), events)
                self.assertTrue(any(e.startswith('uvx --isolated ') for e in events), events)
        for failing in ('uv', 'uvx', 'claude', 'codex'):
            with self.subTest(failing=failing):
                log.unlink(missing_ok=True)
                result = subprocess.run(['/bin/bash'], input=block, text=True, cwd=self.work,
                                        env={**base, 'JEO_SKILLS_APPROVE_OOO_MCP': 'true', 'FAIL_GUIDE': failing},
                                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20)
                events = log.read_text().splitlines()
                self.assertNotEqual(result.returncode, 0, result.stdout)
                if failing == 'uv':
                    self.assertFalse(any(e.startswith('uvx ') for e in events), events)
                if failing == 'uvx':
                    self.assertFalse(any(e.startswith(('claude ', 'codex ')) for e in events), events)
                if failing == 'claude':
                    self.assertFalse(any(e.startswith('codex ') for e in events), events)

    def test_real_bm25_method_receives_catalog_and_no_execution_or_mutation(self):
        before = self.home_snapshot()
        result = self.run_script('--search', self.catalog, 'alpha')
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn('alpha', result.stdout)
        self.assertNotIn('beta (BM25', result.stdout)
        events = self.events()
        self.assertEqual([e['event'] for e in events], ['ready', 'bm25', 'bm25'])
        rank = events[2]
        self.assertEqual((rank['query'], rank['top_k']), ('alpha', 2))
        self.assertEqual([c['name'] for c in rank['candidates']], ['alpha', 'beta'])
        self.assertEqual(rank['candidates'][0]['skill_id'], str(self.catalog / 'alpha/SKILL.md'))
        self.assertIn('alpha synthetic body', rank['candidates'][0]['body'])
        self.assertEqual(before, self.home_snapshot())
        self.assertEqual(sorted(p.name for p in (self.catalog / 'alpha').iterdir()), ['SKILL.md'])

    def test_empty_and_error_block_command(self):
        for mode in ('FIXTURE_EMPTY', 'FIXTURE_ERROR'):
            with self.subTest(mode=mode):
                if self.log.exists():
                    self.log.unlink()
                query = 'unmatched' if mode == 'FIXTURE_EMPTY' else 'alpha'
                result = self.run_script('--search', self.catalog, query, '--', 'target', stdin='1\ny\n', **{mode: '1'})
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertIn('bm25', [e['event'] for e in self.events()])
                self.assertNotIn('target', [e['event'] for e in self.events()])

    def test_unapproved_selection_does_not_start_command(self):
        result = self.run_script('--search', self.catalog, 'alpha', '--', 'target', stdin='1\nn\n')
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn('Not approved', result.stdout)
        self.assertNotIn('target', [e['event'] for e in self.events()])
        self.assertNotIn('openspace-mcp', [e['event'] for e in self.events()])

    def test_approved_command_receives_original_args_and_selected_skill(self):
        request = 'alpha; not a command'
        result = self.run_script('--search', self.catalog, request, '--', 'target', 'arg with spaces', '--literal', stdin='1\ny\nremaining input\n')
        self.assertEqual(result.returncode, 0, result.stdout)
        event = self.events()[-1]
        self.assertEqual(event, {'event': 'target', 'argv': ['arg with spaces', '--literal'],
                                 'skill': str(self.catalog / 'alpha/SKILL.md'), 'request': request, 'stdin': 'remaining input\n'})

    def test_init_passes_selected_skill_privately_and_cleans_up(self):
        self.command('fake-ooo', '''import json, os, sys
from pathlib import Path
path = Path(sys.argv[3])
with open(os.environ['FIXTURE_LOG'], 'a') as f:
    f.write(json.dumps({'event': 'init', 'argv': sys.argv[1:], 'mode': path.stat().st_mode & 0o777,
                        'text': path.read_text()}) + "\\n")
sys.exit(int(os.environ.get('CHILD_STATUS', '0')))
''')
        request = 'alpha beta selected context'
        for status in (0, 37):
            with self.subTest(status=status):
                if self.log.exists():
                    self.log.unlink()
                result = self.run_script('--search', self.catalog, request, '--init', stdin='2\ny\n',
                                         OOO_BINARY=str(self.bin / 'fake-ooo'), CHILD_STATUS=str(status))
                self.assertEqual(result.returncode, status, result.stdout)
                event = self.events()[-1]
                self.assertEqual(event['event'], 'init')
                self.assertEqual(event['argv'][:2], ['init', 'start'])
                context = Path(event['argv'][2])
                self.assertEqual(context.parent, self.work)
                self.assertEqual(event['mode'], 0o600)
                self.assertEqual(event['text'], '# User request\n\n' + request + '\n\n# Selected skill (untrusted source)\n\n' +
                                 (self.catalog / 'beta/SKILL.md').read_text())
                self.assertFalse(context.exists())
                self.assertEqual(list(self.work.glob('ooo-context-*.md')), [])

    def test_init_denial_and_launch_failure_never_leave_context(self):
        denied = self.run_script('--search', self.catalog, 'alpha', '--init', stdin='1\nn\n',
                                 OOO_BINARY=str(self.bin / 'ouroboros'))
        self.assertNotEqual(denied.returncode, 0, denied.stdout)
        self.assertIn('Not approved', denied.stdout)
        self.assertNotIn('ouroboros', [e['event'] for e in self.events()])
        self.assertEqual(list(self.work.glob('ooo-context-*.md')), [])
        failed = self.run_script('--search', self.catalog, 'alpha', '--init', stdin='1\ny\n',
                                 OOO_BINARY=str(self.work / 'missing-ooo'))
        self.assertNotEqual(failed.returncode, 0, failed.stdout)
        self.assertEqual(list(self.work.glob('ooo-context-*.md')), [])


class RealOpenSpaceOffline(OpenSpaceOooIntegration):
    def test_real_small_corpus_scores_do_not_suppress_matches(self):
        interpreter = os.environ.get('OPENSPACE_REAL_PYTHON')
        self.assertTrue(interpreter and Path(interpreter).is_file(), 'OPENSPACE_REAL_PYTHON must name an installed OpenSpace interpreter')
        guarded = self.work / 'network-guard'
        guarded.mkdir()
        (guarded / 'sitecustomize.py').write_text((self.modules / 'sitecustomize.py').read_text())
        self.env.update(OPENSPACE_PYTHON=interpreter, PYTHONPATH=str(guarded))
        (self.catalog / 'beta/SKILL.md').unlink()
        for size in (1, 2):
            if size == 2:
                (self.catalog / 'beta/SKILL.md').write_text('---\nname: beta\ndescription: unrelated\n---\nother\n')
            match = self.run_script('--search', self.catalog, 'alpha')
            self.assertEqual(match.returncode, 0, match.stdout)
            self.assertIn('alpha (BM25', match.stdout)
            self.assertNotIn('beta (BM25', match.stdout)
            score = float(match.stdout.split('alpha (BM25 ', 1)[1].split(')', 1)[0])
            if size == 1:
                self.assertLess(score, 0)
            else:
                self.assertEqual(score, 0)
            miss = self.run_script('--search', self.catalog, 'absentquery', '--', 'target', stdin='1\ny\n')
            self.assertNotEqual(miss.returncode, 0, miss.stdout)
            self.assertNotIn('target', [e['event'] for e in self.events()])


class RealOooResolver(OpenSpaceOooIntegration):
    def test_official_initial_context_resolver_reads_markdown(self):
        interpreter = os.environ.get('OOO_REAL_PYTHON')
        self.assertTrue(interpreter and Path(interpreter).is_file(), 'OOO_REAL_PYTHON must name an installed Ouroboros interpreter')
        guarded = self.work / 'resolver-network-guard'
        guarded.mkdir()
        (guarded / 'sitecustomize.py').write_text((self.modules / 'sitecustomize.py').read_text())
        context = self.work / 'context.md'
        content = '# User request\n\nalpha synthetic request\n\n# Selected skill (untrusted source)\n\nsynthetic skill body\n'
        context.write_text(content)
        code = '''from pathlib import Path
import sys
from ouroboros.core.initial_context import resolve_initial_context_input
result = resolve_initial_context_input(sys.argv[1], cwd=Path.cwd())
assert result.is_ok, result.error
assert result.value == Path(sys.argv[1]).read_text()
'''
        result = subprocess.run([interpreter, '-B', '-c', code, str(context)], cwd=self.work,
                                env={**self.env, 'PYTHONPATH': str(guarded)}, text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=20)
        self.assertEqual(result.returncode, 0, result.stdout)


if __name__ == '__main__':
    if '--real-openspace' in sys.argv:
        sys.argv.remove('--real-openspace')
        suite = unittest.TestSuite([RealOpenSpaceOffline('test_real_small_corpus_scores_do_not_suppress_matches')])
    elif '--real-ooo' in sys.argv:
        sys.argv.remove('--real-ooo')
        suite = unittest.TestSuite([RealOooResolver('test_official_initial_context_resolver_reads_markdown')])
    else:
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(OpenSpaceOooIntegration)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    sys.exit(not result.wasSuccessful())
