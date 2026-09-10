#!/usr/bin/env python3
"""Unit tests for agent-reach-check.py. Synthetic temp dirs only; no network, no binaries."""
from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import ntpath
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
CHECKER_PATH = os.path.join(HERE, "agent-reach-check.py")

_spec = importlib.util.spec_from_file_location("agent_reach_check", CHECKER_PATH)
assert _spec is not None and _spec.loader is not None
arc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(arc)

COMMIT = "a" * 40


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def manifest_for(files: dict, commit: str = COMMIT) -> dict:
    return {"upstream_commit": commit, "files": files}


def make_tempdir(prefix: str) -> str:
    """Realpath the fixture root so the macOS /var symlink is not the thing under test."""
    return os.path.realpath(tempfile.mkdtemp(prefix=prefix))


class RecordingFile:
    """Minimal binary file stand-in that records how many bytes were requested."""

    def __init__(self, data: bytes) -> None:
        self.data = data
        self.pos = 0
        self.requests: list = []

    def read(self, size: int = -1) -> bytes:
        self.requests.append(size)
        chunk = self.data[self.pos : self.pos + size] if size >= 0 else self.data[self.pos :]
        self.pos += len(chunk)
        return chunk

    def __enter__(self) -> "RecordingFile":
        return self

    def __exit__(self, *exc: object) -> bool:
        return False


def recording_open(records: list):
    """Delegate to the real open while recording every (path, mode) pair."""
    real_open = open

    def opener(path, mode="r", *args, **kwargs):
        records.append((str(path), mode))
        return real_open(path, mode, *args, **kwargs)

    return opener


def snapshot(root: str) -> list:
    entries = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        for name in sorted(filenames):
            path = os.path.join(dirpath, name)
            stat = os.lstat(path)
            entries.append((os.path.relpath(path, root), stat.st_size, stat.st_mtime_ns))
    return sorted(entries)


class TempTree(unittest.TestCase):
    def setUp(self) -> None:
        self.root = make_tempdir("agent-reach-test-")
        self.addCleanup(shutil.rmtree, self.root, True)

    def outside_dir(self) -> str:
        path = make_tempdir("agent-reach-outside-")
        self.addCleanup(shutil.rmtree, path, True)
        return path

    def write(self, rel: str, data: bytes) -> str:
        path = os.path.join(self.root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(data)
        return sha256_bytes(data)


class TestSourceFingerprint(TempTree):
    def test_match_reports_zero_errors_and_zero_mismatch(self) -> None:
        digest = self.write("pkg/main.py", b"print('hi')\n")
        report = arc.check_source(self.root, manifest_for({"pkg/main.py": digest}))
        self.assertEqual(report["matched"], 1)
        self.assertEqual(report["mismatched"], 0)
        self.assertEqual(report["errored"], 0)
        self.assertEqual(report["files"][0]["status"], "match")
        self.assertEqual(report["declared_files"], 1)

    def test_mismatch_is_detected_and_exits_one(self) -> None:
        self.write("pkg/main.py", b"changed\n")
        manifest_path = os.path.join(self.root, "manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as handle:
            json.dump(manifest_for({"pkg/main.py": "b" * 64}), handle)
        report, code = arc.build_report(self.root, manifest_path)
        self.assertEqual(code, 1)
        self.assertEqual(report["status"], "mismatch")
        self.assertEqual(report["source_check"]["mismatched"], 1)

    def test_missing_file_is_an_error(self) -> None:
        report = arc.check_source(self.root, manifest_for({"pkg/absent.py": "c" * 64}))
        self.assertEqual(report["files"][0]["status"], "missing")
        self.assertEqual(report["errored"], 1)

    def test_oversize_file_is_refused_without_reading(self) -> None:
        digest = self.write("big.bin", b"x" * (arc.MAX_FILE_BYTES + 1))
        report = arc.check_source(self.root, manifest_for({"big.bin": digest}))
        self.assertEqual(report["files"][0]["status"], "oversize")
        self.assertNotIn("actual_sha256", report["files"][0])
        self.assertEqual(report["errored"], 1)

    def test_root_symlink_is_rejected(self) -> None:
        real = os.path.join(self.root, "real")
        os.makedirs(real)
        link = os.path.join(self.root, "link")
        os.symlink(real, link)
        report = arc.check_source(link, manifest_for({"a.txt": "d" * 64}))
        self.assertEqual(report["manifest_errors"], ["source_root_symlink_rejected"])
        self.assertEqual(report["errored"], 1)

    def test_source_root_ancestor_symlink_is_rejected_without_reading(self) -> None:
        """The root itself is a real dir, but an ancestor above it is a link outside."""
        outside = self.outside_dir()
        os.makedirs(os.path.join(outside, "repo"))
        with open(os.path.join(outside, "repo", "a.txt"), "wb") as handle:
            handle.write(b"secret\n")
        os.symlink(outside, os.path.join(self.root, "link"))
        source = os.path.join(self.root, "link", "repo")
        self.assertFalse(os.path.islink(source))
        with mock.patch.object(arc, "sha256_file") as hasher:
            report = arc.check_source(source, manifest_for({"a.txt": "a" * 64}))
        hasher.assert_not_called()
        self.assertEqual(report["manifest_errors"], ["source_root_symlink_rejected"])
        self.assertEqual(report["errored"], 1)
        self.assertFalse(arc.path_symlink_free(source))

    def test_dotdot_cannot_erase_a_symlink_component(self) -> None:
        from unittest import mock
        real = os.path.join(self.root, "real")
        os.makedirs(real)
        os.symlink(real, os.path.join(self.root, "linked"))
        ambiguous = os.path.join(self.root, "linked", "..", "real")
        with mock.patch.object(arc, "sha256_file") as digest:
            report = arc.check_source(ambiguous, manifest_for({"a.txt": "b" * 64}))
        self.assertEqual(report["manifest_errors"], ["source_root_symlink_rejected"])
        digest.assert_not_called()

    def test_windows_alt_separator_dotdot_is_rejected_before_normalizing(self) -> None:
        with mock.patch.object(arc.os, "sep", "\\"), mock.patch.object(arc.os, "altsep", "/"):
            with mock.patch.object(arc.os.path, "abspath") as normalize:
                self.assertFalse(arc.path_symlink_free("C:/repo/link/../other"))
        normalize.assert_not_called()

    def test_windows_drive_and_unc_ancestor_paths_stay_absolute(self) -> None:
        cases = [
            ("C:/repo/linked", ["C:\\repo", "C:\\repo\\linked"]),
            ("//server/share/repo/linked", ["\\\\server\\share\\repo", "\\\\server\\share\\repo\\linked"]),
        ]
        for source, expected in cases:
            with self.subTest(source=source):
                with mock.patch.object(arc.os, "path", ntpath), mock.patch.object(arc.os, "sep", "\\"), mock.patch.object(arc.os, "altsep", "/"):
                    with mock.patch.object(ntpath, "islink", side_effect=lambda p: p == expected[-1]) as probe:
                        self.assertFalse(arc.path_symlink_free(source))
                self.assertEqual([call.args[0] for call in probe.call_args_list], expected)

    def test_intermediate_symlink_is_rejected(self) -> None:
        outside = self.outside_dir()
        with open(os.path.join(outside, "a.txt"), "wb") as handle:
            handle.write(b"secret\n")
        os.symlink(outside, os.path.join(self.root, "linked"))
        report = arc.check_source(self.root, manifest_for({"linked/a.txt": "e" * 64}))
        self.assertEqual(report["files"][0]["status"], "symlink_rejected")
        self.assertEqual(report["errored"], 1)

    def test_leaf_symlink_is_rejected(self) -> None:
        self.write("real.txt", b"data\n")
        os.symlink(os.path.join(self.root, "real.txt"), os.path.join(self.root, "leaf.txt"))
        report = arc.check_source(self.root, manifest_for({"leaf.txt": "f" * 64}))
        self.assertEqual(report["files"][0]["status"], "symlink_rejected")

    def test_symlinked_entries_are_never_opened_or_hashed(self) -> None:
        outside = self.outside_dir()
        with open(os.path.join(outside, "a.txt"), "wb") as handle:
            handle.write(b"secret\n")
        self.write("real.txt", b"data\n")
        os.symlink(os.path.join(self.root, "real.txt"), os.path.join(self.root, "leaf.txt"))
        os.symlink(outside, os.path.join(self.root, "linked"))
        manifest = manifest_for({"leaf.txt": "f" * 64, "linked/a.txt": "e" * 64})
        with mock.patch.object(arc, "sha256_file") as hasher:
            with mock.patch("builtins.open") as opener:
                report = arc.check_source(self.root, manifest)
        hasher.assert_not_called()
        opener.assert_not_called()
        self.assertEqual({item["status"] for item in report["files"]}, {"symlink_rejected"})

    def test_file_read_is_bounded_to_limit_plus_one_byte(self) -> None:
        recorder = RecordingFile(b"x" * 5000)
        with mock.patch("builtins.open", return_value=recorder):
            with self.assertRaises(arc.FileTooLarge):
                arc.sha256_file("ignored", limit=100)
        self.assertLessEqual(recorder.pos, 101)
        self.assertTrue(all(size <= 101 for size in recorder.requests))

    def test_file_that_grows_past_the_bound_is_reported_oversize(self) -> None:
        self.write("grown.bin", b"y" * 4096)
        with mock.patch.object(arc, "MAX_FILE_BYTES", 16):
            with mock.patch.object(arc.os.path, "getsize", return_value=8):
                report = arc.check_source(self.root, manifest_for({"grown.bin": "a" * 64}))
        self.assertEqual(report["files"][0]["status"], "oversize")
        self.assertNotIn("actual_sha256", report["files"][0])

    def test_path_escape_is_rejected(self) -> None:
        manifest = manifest_for({"../outside.txt": "a" * 64, "/etc/hosts": "b" * 64})
        report = arc.check_source(self.root, manifest)
        self.assertEqual({item["status"] for item in report["files"]}, {"unsafe_path"})
        self.assertEqual(report["errored"], 2)
        self.assertFalse(arc.safe_relpath("a/../../b"))
        self.assertFalse(arc.safe_relpath("a\\b"))
        self.assertTrue(arc.safe_relpath("a/b.py"))

    def test_invalid_hash_entry_is_an_error(self) -> None:
        self.write("pkg/main.py", b"ok\n")
        report = arc.check_source(self.root, manifest_for({"pkg/main.py": "nothex"}))
        self.assertEqual(report["files"][0]["status"], "invalid_hash")
        self.assertEqual(report["errored"], 1)


class TestManifestValidation(TempTree):
    def test_malformed_manifests_are_rejected(self) -> None:
        cases = [
            ([], ["manifest_not_an_object"]),
            ({"upstream_commit": COMMIT, "files": {}}, ["empty_or_invalid_files"]),
            ({"upstream_commit": "short", "files": {"a": "b" * 64}}, ["invalid_upstream_commit"]),
        ]
        for manifest, expected in cases:
            with self.subTest(manifest=manifest):
                validated, errors = arc.validate_manifest(manifest)
                self.assertIsNone(validated)
                self.assertEqual(errors, expected)

    def test_manifest_file_errors_map_to_exit_two(self) -> None:
        missing = os.path.join(self.root, "nope.json")
        report, code = arc.build_report(self.root, missing)
        self.assertEqual(code, 2)
        self.assertEqual(report["source_check"]["manifest_errors"], ["manifest_missing"])

        bad = os.path.join(self.root, "bad.json")
        with open(bad, "w", encoding="utf-8") as handle:
            handle.write("{not json")
        report, code = arc.build_report(self.root, bad)
        self.assertEqual(code, 2)
        self.assertEqual(report["source_check"]["manifest_errors"], ["manifest_invalid_json"])

    def test_manifest_symlink_is_rejected(self) -> None:
        real = os.path.join(self.root, "real.json")
        with open(real, "w", encoding="utf-8") as handle:
            json.dump(manifest_for({"a.txt": "a" * 64}), handle)
        link = os.path.join(self.root, "link.json")
        os.symlink(real, link)
        with mock.patch("builtins.open") as opener:
            manifest, error = arc.load_manifest(link)
        opener.assert_not_called()
        self.assertIsNone(manifest)
        self.assertEqual(error, "manifest_symlink_rejected")

    def test_manifest_ancestor_symlink_is_rejected_without_reading(self) -> None:
        """The manifest file itself is real, but a parent directory links outside."""
        outside = self.outside_dir()
        refs = os.path.join(outside, "references")
        os.makedirs(refs)
        target = os.path.join(refs, "upstream-evidence.json")
        with open(target, "w", encoding="utf-8") as handle:
            json.dump(manifest_for({"a.txt": "a" * 64}), handle)
        os.symlink(outside, os.path.join(self.root, "linked-skill"))
        path = os.path.join(self.root, "linked-skill", "references", "upstream-evidence.json")
        self.assertFalse(os.path.islink(path))
        with mock.patch("builtins.open") as opener:
            manifest, error = arc.load_manifest(path)
        opener.assert_not_called()
        self.assertIsNone(manifest)
        self.assertEqual(error, "manifest_symlink_rejected")

        report, code = arc.build_report(self.root, path)
        self.assertEqual(code, 2)
        self.assertEqual(
            report["source_check"]["manifest_errors"], ["manifest_symlink_rejected"]
        )


class TestHostAndCli(TempTree):
    def test_host_report_shape_is_booleans_only(self) -> None:
        host = arc.host_report()
        self.assertEqual(
            set(arc.COMMANDS),
            {
                "agent-reach",
                "uv",
                "gh",
                "mcporter",
                "node",
                "npm",
                "deno",
                "yt-dlp",
                "ffmpeg",
                "ffprobe",
                "twitter",
                "bili",
                "rdt",
                "opencli",
            },
        )
        self.assertEqual(set(host["command_presence"]), set(arc.COMMANDS))
        for value in host["command_presence"].values():
            self.assertIsInstance(value, bool)
        self.assertEqual(host["upstream_python_minimum"], "3.10")
        self.assertEqual(host["upstream_python_minimum_source"], "pinned-pyproject")
        self.assertNotIn("upstream_python_minimum_confidence", host)
        self.assertIsInstance(host["python_meets_upstream_minimum"], bool)
        self.assertEqual(
            host["python_meets_upstream_minimum"], sys.version_info[:2] >= (3, 10)
        )

    def test_cli_without_source_emits_json_and_exits_zero(self) -> None:
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            code = arc.main([])
        payload = json.loads(buffer.getvalue())
        self.assertEqual(code, 0)
        self.assertEqual(payload["exit_code"], 0)
        self.assertIsNone(payload["source_check"])
        self.assertFalse(payload["live_channels_tested"])
        self.assertTrue(any("not readiness" in note for note in payload["notes"]))
        self.assertTrue(any("manifest-listed" in note for note in payload["notes"]))
        self.assertFalse(any("provisional" in note for note in payload["notes"]))

    def test_cli_rejects_bad_arguments(self) -> None:
        with self.assertRaises(SystemExit) as ctx, redirect_stdout(io.StringIO()):
            with open(os.devnull, "w", encoding="utf-8") as devnull:
                stderr, sys.stderr = sys.stderr, devnull
                try:
                    arc.main(["--bogus"])
                finally:
                    sys.stderr = stderr
        self.assertEqual(ctx.exception.code, 2)

    def test_output_discloses_no_paths_or_credentials(self) -> None:
        secret = "s3cr3t-agent-reach-canary"
        os.environ["AGENT_REACH_TEST_TOKEN"] = secret
        self.addCleanup(os.environ.pop, "AGENT_REACH_TEST_TOKEN", None)
        buffer = io.StringIO()
        with redirect_stdout(buffer):
            arc.main([])
        text = buffer.getvalue()
        self.assertNotIn(secret, text)
        self.assertNotIn(os.environ.get("PATH", "\0never\0"), text)
        self.assertNotIn("/usr/bin", text)
        self.assertNotIn(os.path.expanduser("~"), text)

    def test_run_has_no_side_effects_on_the_tree(self) -> None:
        digest = self.write("pkg/main.py", b"stable\n")
        manifest_path = os.path.join(self.root, "manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as handle:
            json.dump(manifest_for({"pkg/main.py": digest}), handle)
        before = snapshot(self.root)
        with redirect_stdout(io.StringIO()):
            report, code = arc.build_report(self.root, manifest_path)
        self.assertEqual(code, 0)
        self.assertEqual(report["source_check"]["matched"], 1)
        self.assertEqual(snapshot(self.root), before)

    def test_checker_never_executes_binaries_or_opens_network(self) -> None:
        digest = self.write("pkg/main.py", b"stable\n")
        manifest_path = os.path.join(self.root, "manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as handle:
            json.dump(manifest_for({"pkg/main.py": digest}), handle)
        with mock.patch.object(subprocess, "Popen") as popen, mock.patch.object(
            subprocess, "run"
        ) as run, mock.patch.object(os, "system") as system, mock.patch.object(
            os, "popen"
        ) as os_popen, mock.patch.object(
            socket, "socket"
        ) as sock, mock.patch.object(
            os, "execv"
        ) as execv:
            with redirect_stdout(io.StringIO()):
                self.assertEqual(arc.main([]), 0)
            _, code = arc.build_report(self.root, manifest_path)
        self.assertEqual(code, 0)
        for patched in (popen, run, system, os_popen, sock, execv):
            patched.assert_not_called()
        self.assertNotIn("subprocess", arc.__dict__)
        with open(CHECKER_PATH, "r", encoding="utf-8") as handle:
            source = handle.read()
        for token in ("subprocess", "os.system", "popen", "socket", "urllib", "getenv"):
            with self.subTest(token=token):
                self.assertNotIn(token, source)

    def test_checker_only_opens_files_for_binary_reading(self) -> None:
        digest = self.write("pkg/main.py", b"stable\n")
        manifest_path = os.path.join(self.root, "manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as handle:
            json.dump(manifest_for({"pkg/main.py": digest}), handle)
        records: list = []
        with mock.patch("builtins.open", recording_open(records)):
            _, code = arc.build_report(self.root, manifest_path)
        self.assertEqual(code, 0)
        self.assertEqual(len(records), 2)
        for path, mode in records:
            with self.subTest(path=path):
                self.assertEqual(mode, "rb")


if __name__ == "__main__":
    unittest.main(verbosity=2)
