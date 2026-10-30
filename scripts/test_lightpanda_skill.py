#!/usr/bin/env python3
"""Offline black-box tests for the Lightpanda doctor."""
import errno
import os
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


DOCTOR = Path(__file__).resolve().parents[1] / ".agent-skills/lightpanda/scripts/doctor.py"


class LightpandaDoctorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="lightpanda-doctor-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.home = self.root / "home"
        self.home.mkdir()
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.guard = self.root / "guard"
        self.guard.mkdir()
        # Deny network access and subprocess creation in the doctor interpreter.
        (self.guard / "sitecustomize.py").write_text(
            "import socket, subprocess\n"
            "def denied(*args, **kwargs):\n"
            "    raise AssertionError('offline preflight attempted network or subprocess')\n"
            "socket.socket = denied\n"
            "socket.create_connection = denied\n"
            "subprocess.Popen = denied\n"
            "import json, os, platform, sys\n"
            "if 'TEST_PLATFORM' in os.environ:\n"
            "    data = json.loads(os.environ['TEST_PLATFORM'])\n"
            "    platform.system = lambda: data['system']\n"
            "    platform.machine = lambda: data['machine']\n"
            "    platform.libc_ver = lambda: (data['libc'], data['version'])\n"
            "    if data['android']:\n"
            "        sys.getandroidapilevel = lambda: 34\n"
            "if 'TEST_STAT_ERROR' in os.environ:\n"
            "    fault = json.loads(os.environ['TEST_STAT_ERROR'])\n"
            "    original_stat = os.stat\n"
            "    def guarded_stat(path, *args, **kwargs):\n"
            "        if os.fspath(path) == fault['path']:\n"
            "            raise OSError(fault['errno'], 'synthetic stat failure', path)\n"
            "        return original_stat(path, *args, **kwargs)\n"
            "    os.stat = guarded_stat\n",
            encoding="utf-8",
        )
        self.config = self.home / "settings.json"
        self.config.write_text('{"sentinel": "unchanged"}\n', encoding="utf-8")
        self.marker = self.root / "executed"

    def fixture_binary(self, name="lightpanda", mode=0o700):
        path = self.bin / name
        path.write_text(
            "#!" + sys.executable + "\n"
            "from pathlib import Path\n"
            "Path(" + repr(str(self.marker)) + ").write_text('executed')\n",
            encoding="utf-8",
        )
        path.chmod(mode)
        return path

    def invoke(self, *args, telemetry=None, platform_fixture=None, stat_error=None, search_path=None):
        env = {
            "HOME": str(self.home),
            "PATH": str(self.bin) if search_path is None else search_path,
            "PYTHONPATH": str(self.guard),
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        if telemetry is not None:
            env["LIGHTPANDA_DISABLE_TELEMETRY"] = telemetry
        if platform_fixture is not None:
            env["TEST_PLATFORM"] = json.dumps(platform_fixture)
        if stat_error is not None:
            env["TEST_STAT_ERROR"] = json.dumps(stat_error)
        before = {p.relative_to(self.home): p.read_bytes() for p in self.home.rglob('*') if p.is_file()}
        result = subprocess.run(
            [sys.executable, str(DOCTOR), *map(str, args)],
            env=env, cwd=self.root, stdin=subprocess.DEVNULL,
            capture_output=True, text=True, timeout=10, check=False,
        )
        after = {p.relative_to(self.home): p.read_bytes() for p in self.home.rglob('*') if p.is_file()}
        self.assertEqual(before, after, "doctor modified user settings")
        self.assertFalse(self.marker.exists(), "doctor executed the fixture binary")
        return result

    def report(self, *args, telemetry=None, platform_fixture=None):
        result = self.invoke(*args, telemetry=telemetry, platform_fixture=platform_fixture)
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertFalse(report["network_accessed"])
        self.assertFalse(report["binary_executed"])
        self.assertTrue(report["platform"])
        self.assertTrue(report["architecture"])
        self.assertIsInstance(report["platform_supported"], bool)
        return report

    def test_path_lookup_inspects_without_running_or_installing(self):
        binary = self.fixture_binary()
        report = self.report(telemetry="true")
        self.assertEqual(Path(report["binary"]["path"]), binary)
        self.assertTrue(report["binary"]["found"])
        self.assertTrue(report["binary"]["regular_file"])
        self.assertTrue(report["binary"]["executable"])
        self.assertEqual(report["telemetry_env"], "set")
        self.assertEqual(list(self.bin.iterdir()), [binary])

    def test_path_lookup_skips_non_executable_candidate(self):
        self.fixture_binary(mode=0o600)
        second = self.root / "second-bin"
        second.mkdir()
        binary = second / "lightpanda"
        binary.write_text("synthetic executable", encoding="utf-8")
        binary.chmod(0o700)
        result = self.invoke(search_path=os.pathsep.join(map(str, (self.bin, second))))
        self.assertEqual(result.returncode, 0, result.stderr)
        info = json.loads(result.stdout)["binary"]
        self.assertEqual(Path(info["path"]), binary)
        self.assertTrue(info["executable"])

    def test_stat_failures_distinguish_missing_from_inspection_error(self):
        candidate = str(self.bin / "candidate")
        for code in (errno.ENOENT, errno.ENOTDIR, errno.EACCES, errno.EIO, errno.ELOOP):
            with self.subTest(errno=code):
                result = self.invoke("--binary", candidate,
                                     stat_error={"path": candidate, "errno": code})
                info = json.loads(result.stdout)["binary"]
                if code in (errno.ENOENT, errno.ENOTDIR):
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertIs(info["found"], False)
                    self.assertIsNone(info["error"])
                else:
                    self.assertEqual(result.returncode, 1, result.stderr)
                    self.assertIsNone(info["found"])
                    self.assertIsNone(info["regular_file"])
                    self.assertIsNone(info["executable"])
                    self.assertEqual(info["error"]["errno"], code)
                    self.assertTrue(info["error"]["message"])

    def test_explicit_binary_overrides_path(self):
        self.fixture_binary()
        explicit = self.fixture_binary("custom")
        report = self.report("--binary", explicit)
        self.assertEqual(Path(report["binary"]["path"]), explicit)
        self.assertTrue(report["binary"]["found"])

    def test_missing_binary_is_reported_without_installation(self):
        report = self.report()
        self.assertFalse(report["binary"]["found"])
        self.assertEqual(list(self.bin.iterdir()), [])

    def test_explicit_nonexecutable_file_is_not_runnable(self):
        binary = self.fixture_binary(mode=0o600)
        info = self.report("--binary", binary)["binary"]
        self.assertTrue(info["found"])
        self.assertTrue(info["regular_file"])
        self.assertFalse(info["executable"])

    def test_explicit_directory_is_not_a_regular_file(self):
        info = self.report("--binary", self.bin)["binary"]
        self.assertFalse(info["regular_file"])

    def test_telemetry_environment_is_reported_without_changing_it(self):
        for value, expected in ((None, "unset"), ("false", "other"), ("true", "set")):
            with self.subTest(value=value):
                self.assertEqual(self.report(telemetry=value)["telemetry_env"], expected)

    def test_platform_and_libc_support_boundaries(self):
        cases = (
            ("Linux", "x86_64", "glibc", "2.35", False, True, "glibc"),
            ("Linux", "aarch64", "glibc", "2.36", False, True, "glibc"),
            ("Linux", "x86_64", "musl", "1.2", False, False, "musl"),
            ("Linux", "arm64", "bionic", "", False, False, "bionic"),
            ("Linux", "x86_64", "", "", False, False, "unknown"),
            ("Linux", "x86_64", "glibc", "2.35", True, False, "bionic"),
            ("Android", "aarch64", "", "", False, False, "bionic"),
            ("Linux", "riscv64", "glibc", "2.35", False, False, "glibc"),
            ("Darwin", "arm64", "", "", False, True, "not_applicable"),
            ("Darwin", "x86_64", "", "", False, True, "not_applicable"),
            ("Darwin", "riscv64", "", "", False, False, "not_applicable"),
            ("Windows", "x86_64", "", "", False, False, "not_applicable"),
        )
        for system, machine, libc, version, android, supported, name in cases:
            with self.subTest(system=system, machine=machine, libc=libc, android=android):
                fixture = dict(system=system, machine=machine, libc=libc,
                               version=version, android=android)
                report = self.report(platform_fixture=fixture)
                self.assertIs(report["platform_supported"], supported)
                self.assertEqual(report["libc"]["name"], name)

    def test_stable_release_asset_selection_and_aliases(self):
        cases = (
            ("Linux", "aarch64", "glibc", False, "lightpanda-aarch64-linux"),
            ("Linux", "arm64", "glibc", False, "lightpanda-aarch64-linux"),
            ("Linux", "x86_64", "glibc", False, "lightpanda-x86_64-linux"),
            ("Linux", "amd64", "glibc", False, "lightpanda-x86_64-linux"),
            ("Darwin", "arm64", "", False, "lightpanda-aarch64-macos"),
            ("Darwin", "aarch64", "", False, "lightpanda-aarch64-macos"),
            ("Darwin", "x86_64", "", False, "lightpanda-x86_64-macos"),
            ("Darwin", "amd64", "", False, "lightpanda-x86_64-macos"),
            ("Linux", "x86_64", "musl", False, None),
            ("Linux", "x86_64", "", False, None),
            ("Linux", "x86_64", "glibc", True, None),
            ("Android", "aarch64", "", False, None),
            ("Linux", "riscv64", "glibc", False, None),
            ("Windows", "x86_64", "", False, None),
        )
        for system, machine, libc, android, asset in cases:
            with self.subTest(system=system, machine=machine, libc=libc, android=android):
                fixture = dict(system=system, machine=machine, libc=libc,
                               version="", android=android)
                report = self.report(platform_fixture=fixture)
                self.assertEqual(report["stable_release"]["version"], "1.0.2")
                self.assertEqual(report["stable_release"]["asset"], asset)
                self.assertEqual(report["platform_supported"], asset is not None)

    def test_stable_release_metadata_survives_binary_inspection_error(self):
        candidate = str(self.bin / "unreadable")
        fixture = dict(system="Linux", machine="x86_64", libc="glibc",
                       version="2.35", android=False)
        result = self.invoke("--binary", candidate, platform_fixture=fixture,
                             stat_error={"path": candidate, "errno": errno.EACCES})
        self.assertEqual(result.returncode, 1)
        report = json.loads(result.stdout)
        self.assertEqual(report["stable_release"]["version"], "1.0.2")
        self.assertEqual(report["stable_release"]["asset"], "lightpanda-x86_64-linux")
        self.assertEqual(report["binary"]["error"]["errno"], errno.EACCES)
        self.assertFalse(report["network_accessed"])
        self.assertFalse(report["binary_executed"])

    def test_invalid_cli_arguments_fail_without_side_effects(self):
        result = self.invoke("--binary")
        self.assertEqual(result.returncode, 2)
        self.assertIn("--binary", result.stderr)
        self.assertEqual(list(self.bin.iterdir()), [])


class LightpandaDocumentationTests(unittest.TestCase):
    def test_runtime_sources_and_stable_feature_contract(self):
        runtime = (DOCTOR.parents[1] / "references/runtime.md").read_text(encoding="utf-8")
        stable = "c5f7bb29b127040c899d4e181b5709f76fc71a6f"
        main = "8f2c8185c97e3cc98de07f164e7eb3d9e2dd9020"
        self.assertIn(f"/blob/{stable}/README.md", runtime)
        self.assertIn(f"/blob/{stable}/src/Config.zig", runtime)
        self.assertIn(f"/blob/{main}/README.md", runtime)
        for option in ("--wait-selector", "--wait-until", "--dump structured_data",
                       "--dump-selector", "--dump-max-bytes", "--json",
                       "--fail-on-http-error", "--block-private-networks",
                       "--block-cidrs", "--block-urls"):
            with self.subTest(option=option):
                self.assertIn(option, runtime)
        self.assertIn("Mcp-Session-Id", runtime)
        self.assertIn("stdio", runtime)
        self.assertIn("HTTP MCP", runtime)
        self.assertIn("Source review is not binary execution", runtime)
        self.assertIn("not a firewall", runtime)
        self.assertIn("not client authentication", runtime)

    def test_install_guidance_preserves_approval_and_verification_boundaries(self):
        install = (DOCTOR.parents[1] / "references/install.md").read_text(encoding="utf-8")
        self.assertIn("/releases/tag/1.0.2", install)
        self.assertIn("c5f7bb29b127040c899d4e181b5709f76fc71a6f", install)
        self.assertIn("explicit approval", install)
        self.assertIn("SHA-256", install)
        self.assertIn("not independent proof of authenticity", install)
        self.assertIn("does not download anything", install)
        self.assertIn("No runtime was tested", install)
        self.assertIn("version --check", install)


if __name__ == "__main__":
    unittest.main()
