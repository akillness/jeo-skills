#!/usr/bin/env python3
"""Black-box full-tool installer regressions using isolated command fixtures.

Run: python3 scripts/test_full_tools_independent.py -v
"""

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


INSTALLER = Path(__file__).resolve().parent / "install-full-tools.sh"


class FullToolsIndependent(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="full-tools-independent-")
        self.addCleanup(temporary.cleanup)
        self.work = Path(temporary.name).resolve()
        self.home = self.work / "home"
        self.project = self.work / "project"
        self.bin = self.work / "bin"
        for directory in (self.home, self.project, self.bin):
            directory.mkdir()
        self.log = self.work / "commands.log"
        self.env = {
            "HOME": str(self.home),
            "TMPDIR": str(self.work),
            "XDG_CONFIG_HOME": str(self.home / ".config"),
            "XDG_CACHE_HOME": str(self.home / ".cache"),
            "PATH": str(self.bin),
            "FIXTURE_LOG": str(self.log),
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        for name in ("head", "mktemp", "rm", "sed", "uname"):
            for base in ("/usr/bin", "/bin"):
                candidate = Path(base) / name
                if candidate.exists():
                    (self.bin / name).symlink_to(candidate)
                    break
            else:
                self.fail(f"required system utility missing: {name}")
        (self.bin / "python3").symlink_to(sys.executable)
        self.command("node", 'if [ "$1" = "-p" ]; then echo "22 20"; else echo "v22.20.0"; fi')
        self.command("npm", 'exit 0')
        self.command("mex", 'echo 0.8.4')
        self.command("zg", 'if [ "$1" = "version" ]; then echo 0.2.2; fi')
        self.command("cargo", 'exit 0')
        self.command("rtk", 'if [ "$1" = "--version" ]; then echo "rtk 1.1.0"; fi')
        self.command("semble", 'if [ "$1" = "--version" ]; then echo "0.7.0"; fi')
        self.command("uv", '''printf 'uv %s\\n' "$*" >> "$FIXTURE_LOG"
case "$*" in
  "tool install --force specify-cli --from "*|"tool install --force semble=="*|"tool install --force cli-anything-hub=="*) exit 0 ;;
  *) echo "fixture rejected package: $*" >&2; exit 41 ;;
esac''')
        self.command("specify", '''if [ "$1" = "--version" ]; then echo "specify 1.2.6.dev0"; exit 0; fi
if [ "$1" != "init" ]; then exit 42; fi
python3 - <<'PY'
from pathlib import Path
root = Path('.specify/nested')
root.mkdir(parents=True)
(root / 'existing.txt').write_bytes(b'generated replacement\\n')
(root / 'new.txt').write_bytes(b'generated new file\\n')
PY''')
        self.command("cli-hub", '''printf 'cli-hub %s\\n' "$*" >> "$FIXTURE_LOG"
if [ "${FAIL_CLI_HUB:-0}" = 1 ]; then echo 'fixture cli-hub execution failed' >&2; exit 43; fi
if [ "$1" = "--version" ]; then echo "cli-hub 0.4.1"; fi
exit 0''')
        # Reject the historical wrong executable, including if a host has it installed.
        self.command("clihub", 'echo "fixture rejected clihub executable" >&2; exit 44')

    def command(self, name, body):
        path = self.bin / name
        path.write_text("#!/bin/bash\n" + body + "\n", encoding="utf-8")
        path.chmod(0o700)

    def run_installer(self, **extra_env):
        return subprocess.run(
            ["/bin/bash", str(INSTALLER), str(self.project)],
            cwd=self.project,
            env={**self.env, **extra_env},
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=30,
        )

    def test_symlinked_project_directory_never_changes_external_tree(self):
        outside = self.work / "outside"
        nested = outside / "nested"
        nested.mkdir(parents=True)
        (nested / "existing.txt").write_bytes(b'external sentinel\x00\xff\n')
        (self.project / ".specify").symlink_to(outside, target_is_directory=True)
        result = self.run_installer()
        self.assertEqual((nested / "existing.txt").read_bytes(), b'external sentinel\x00\xff\n')
        self.assertEqual(sorted(path.name for path in nested.iterdir()), ["existing.txt"], result.stdout)
        self.assertTrue((self.project / ".specify").is_symlink())
        self.assertTrue("collision" in result.stdout.lower() or
                        (result.returncode != 0 and "spec-kit" in result.stdout), result.stdout)

    def test_existing_project_file_is_preserved_and_collision_reported(self):
        existing = self.project / ".specify/nested/existing.txt"
        existing.parent.mkdir(parents=True)
        existing.write_bytes(b"user content\x00\xff\n")
        result = self.run_installer()
        self.assertEqual(existing.read_bytes(), b"user content\x00\xff\n")
        self.assertEqual((existing.parent / "new.txt").read_bytes(), b"generated new file\n")
        self.assertIn("collision", result.stdout.lower())
        self.assertIn(".specify/nested/existing.txt", result.stdout)

    def test_type_conflicts_are_reported_as_spec_kit_failure(self):
        for conflict in ("directory_over_file", "file_over_directory"):
            with self.subTest(conflict=conflict):
                with tempfile.TemporaryDirectory(dir=self.work) as project:
                    self.project = Path(project)
                    root = self.project / ".specify"
                    root.mkdir()
                    if conflict == "directory_over_file":
                        protected = root / "nested"
                        protected.write_bytes(b"user file\n")
                    else:
                        protected = root / "nested" / "existing.txt"
                        protected.mkdir(parents=True)
                        (protected / "keep").write_bytes(b"user directory\n")
                    result = self.run_installer()
                    if conflict == "directory_over_file":
                        self.assertEqual(protected.read_bytes(), b"user file\n")
                    else:
                        self.assertEqual((protected / "keep").read_bytes(), b"user directory\n")
                    self.assertNotEqual(result.returncode, 0, result.stdout)
                    self.assertIn("PARTIAL SUCCESS - failed:", result.stdout)
                    self.assertIn("spec-kit", result.stdout.split("PARTIAL SUCCESS - failed:")[-1])

    def test_staging_walk_error_reports_spec_kit_failure(self):
        python = self.bin / "python3"
        python.unlink()
        python.write_text(f"#!{sys.executable}\n" + '''import os
import sys

if len(sys.argv) != 5 or sys.argv[1] != "-":
    os.execv(sys.executable, [sys.executable, *sys.argv[1:]])

real_scandir = os.scandir
def denied_scandir(path):
    if os.fspath(path).endswith("/.specify/nested"):
        raise PermissionError(13, "fixture staging traversal denied", os.fspath(path))
    return real_scandir(path)
os.scandir = denied_scandir
sys.argv = sys.argv[1:]
exec(compile(sys.stdin.read(), "<installer merge>", "exec"), {"__name__": "__main__"})
''', encoding="utf-8")
        python.chmod(0o700)
        sentinel = self.project / "user.txt"
        sentinel.write_bytes(b"user data\n")
        result = self.run_installer()
        self.assertEqual(sentinel.read_bytes(), b"user data\n")
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("fixture staging traversal denied", result.stdout)
        self.assertIn("Full-tool result: 5/6 succeeded.", result.stdout)
        self.assertIn("PARTIAL SUCCESS - failed: spec-kit", result.stdout)

    def test_failed_copy_or_chmod_leaves_no_partial_file_and_retry_succeeds(self):
        python = self.bin / "python3"
        python.unlink()
        python.write_text(f"#!{sys.executable}\n" + '''import os
import shutil
import sys

mode = os.environ.get("FAIL_FILE_OPERATION")
if not mode or len(sys.argv) != 5 or sys.argv[1] != "-":
    os.execv(sys.executable, [sys.executable, *sys.argv[1:]])
if mode == "copy":
    def fail_copy(src, dst, *args, **kwargs):
        dst.write(src.read(4))
        raise OSError("fixture copy interrupted")
    shutil.copyfileobj = fail_copy
elif mode == "chmod":
    def fail_chmod(fd, permissions):
        raise OSError("fixture chmod interrupted")
    os.fchmod = fail_chmod
sys.argv = sys.argv[1:]
exec(compile(sys.stdin.read(), "<installer merge>", "exec"), {"__name__": "__main__"})
''', encoding="utf-8")
        python.chmod(0o700)
        for mode in ("copy", "chmod"):
            with self.subTest(mode=mode):
                with tempfile.TemporaryDirectory(dir=self.work) as project:
                    self.project = Path(project)
                    sentinel = self.project / "user.txt"
                    sentinel.write_bytes(b"user data\n")
                    result = self.run_installer(FAIL_FILE_OPERATION=mode)
                    target = self.project / ".specify/nested/existing.txt"
                    self.assertNotEqual(result.returncode, 0, result.stdout)
                    self.assertIn(f"fixture {mode} interrupted", result.stdout)
                    self.assertIn("Full-tool result: 5/6 succeeded.", result.stdout)
                    self.assertIn("PARTIAL SUCCESS - failed: spec-kit", result.stdout)
                    self.assertFalse(target.exists(), result.stdout)
                    remaining_files = [path.relative_to(self.project) for path in self.project.rglob("*")
                                       if path.is_file() or path.is_symlink()]
                    self.assertEqual(remaining_files, [Path("user.txt")], result.stdout)
                    self.assertEqual(sentinel.read_bytes(), b"user data\n")
                    retry = self.run_installer()
                    self.assertEqual(retry.returncode, 0, retry.stdout)
                    self.assertEqual(target.read_bytes(), b"generated replacement\n")
                    self.assertEqual((target.parent / "new.txt").read_bytes(), b"generated new file\n")
                    self.assertEqual(sentinel.read_bytes(), b"user data\n")

    def test_official_cli_hub_install_and_executable_are_used(self):
        result = self.run_installer()
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("Full-tool result: 6/6 succeeded.", result.stdout)
        self.assertEqual((self.project / ".specify/nested/new.txt").read_bytes(), b"generated new file\n")
        commands = self.log.read_text(encoding="utf-8").splitlines()
        self.assertTrue(any(line.startswith("uv tool install --force cli-anything-hub==") for line in commands), commands)
        self.assertTrue(any(line.startswith("cli-hub ") for line in commands), commands)

    def test_cli_hub_execution_failure_is_partial_success(self):
        result = self.run_installer(FAIL_CLI_HUB="1")
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("Full-tool result: 5/6 succeeded.", result.stdout)
        self.assertIn("PARTIAL SUCCESS - failed: CLI-Hub", result.stdout)
        self.assertIn("cli-hub ", self.log.read_text(encoding="utf-8"))
        self.assertEqual((self.project / ".specify/nested/new.txt").read_bytes(), b"generated new file\n")


if __name__ == "__main__":
    unittest.main()
