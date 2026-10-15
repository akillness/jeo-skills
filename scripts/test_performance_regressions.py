#!/usr/bin/env python3
"""High-signal resource and boundary regressions for finalized Python fixes.

Run: python3 scripts/test_performance_regressions.py -v

The tests use real child processes and loopback sockets.  They never download a
model, contact a provider, or write below the repository's temporary fixtures.
"""

from __future__ import annotations

import errno
import io
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import struct
import socket
import subprocess
import sys
import tempfile
import threading
import tracemalloc
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
RENDERER_PATH = ROOT / ".agent-skills/browser-video-recording/scripts/render_browser_demo.py"
INSTALL_SUPPORT_PATH = ROOT / ".agent-skills/jeo-skill/scripts/install_support.py"
LOCAL_SERVER_PATH = ROOT / "jev/jev_local_server.py"
REPAIR_PATH = ROOT / "scripts/repair-skill-frontmatter.py"
BOUNDARY_PATH = ROOT / "scripts/frontmatter_boundary.py"
AUDIT_CONFIG_PATH = ROOT / ".agent-skills/openexecutive/scripts/audit-config.py"
VALIDATOR_PATH = ROOT / "scripts/validate-catalog-projections.py"
LEDGER_PATH = ROOT / "scripts/build_exception_ledger.py"
SUPPORT_SNAPSHOT = Path("/var/folders/ln/_tgvj8cx53g_zzgqkk2w_vvm0000gn/T/jeo-support-audit-xh_8k5kr")
ORIGINAL_INSPECT_PATH = SUPPORT_SNAPSHOT / "glb_inspect.py.original.py"
ORIGINAL_MERGE_PATH = SUPPORT_SNAPSHOT / "glb_merge_anims.py.original.py"
ORIGINAL_WATERMARK_WRAPPER = SUPPORT_SNAPSHOT / "watermarks-remover.sh.original"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot import {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def reap_pid(pid: int) -> None:
    """Best-effort cleanup for a child if an assertion interrupts its test."""
    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        return
    try:
        os.waitpid(pid, 0)
    except ChildProcessError:
        pass


def assert_reaped(test: unittest.TestCase, pid: int) -> None:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return
    except OSError as exc:
        if exc.errno == errno.ESRCH:
            return
        raise
    test.fail(f"renderer child PID {pid} is still alive or unreaped")


class RendererLifecycleRegressions(unittest.TestCase):
    """The renderer must own, terminate, and reap every ffmpeg child."""

    @classmethod
    def setUpClass(cls) -> None:
        try:
            cls.renderer = load_module(RENDERER_PATH, "render_browser_demo_regressions")
            from PIL import Image  # noqa: PLC0415
        except ImportError as exc:
            raise unittest.SkipTest(f"renderer dependency unavailable: {exc}") from exc
        cls.Image = Image

    def setUp(self) -> None:
        self.work = tempfile.TemporaryDirectory(prefix="renderer-regression-")
        self.addCleanup(self.work.cleanup)
        self.root = Path(self.work.name)
        self.pid_file = self.root / "child.pid"
        self.ffmpeg = self.root / "ffmpeg"
        self.ffmpeg.write_text(
            """#!/usr/bin/env python3
import os
import signal
import sys
from pathlib import Path

Path(os.environ['PID_FILE']).write_text(str(os.getpid()), encoding='ascii')
mode = os.environ['FAKE_FFMPEG_MODE']
if mode == 'success':
    data = sys.stdin.buffer.read()
    Path(sys.argv[-1]).write_bytes(b'encoded:' + str(len(data)).encode('ascii'))
    raise SystemExit(0)
if mode == 'nonzero':
    sys.stdin.buffer.read()
    raise SystemExit(23)
if mode in ('broken-pipe', 'resistant'):
    os.close(0)
    if mode == 'resistant':
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        while True:
            signal.pause()
    raise SystemExit(17)
raise SystemExit(99)
""",
            encoding="utf-8",
        )
        self.ffmpeg.chmod(0o755)
        self._pids: list[int] = []
        self.addCleanup(self._cleanup_children)

    def _cleanup_children(self) -> None:
        for pid in self._pids:
            reap_pid(pid)

    def _config(self) -> tuple[dict, Path]:
        shot = self.root / "shot.png"
        cursor = self.root / "cursor.png"
        self.Image.new("RGB", (8, 8), (40, 80, 120)).save(shot)
        self.Image.new("RGBA", (1, 1), (255, 255, 255, 255)).save(cursor)
        output = self.root / "output.mp4"
        return (
            {
                "source_size": [8, 8],
                "output_size": [128, 128],
                "fps": 30,
                "duration": 1.0,
                "shots": {"intro": str(shot)},
                "scene_starts": [[0, "intro"]],
                "cursor_keys": [[0, 4, 4]],
                "camera_keys": [[0, 4, 4, 1]],
                "cursor_asset": str(cursor),
                "cursor_hotspot": [0, 0],
            },
            output,
        )

    def _render(self, mode: str) -> Path:
        config, output = self._config()
        env = {
            "PATH": f"{self.root}{os.pathsep}{os.environ['PATH']}",
            "PID_FILE": str(self.pid_file),
            "FAKE_FFMPEG_MODE": mode,
        }
        with mock.patch.dict(os.environ, env, clear=False):
            self.renderer.render(config, output)
        pid = int(self.pid_file.read_text(encoding="ascii"))
        self._pids.append(pid)
        return output

    def _render_expect_error(self, mode: str, error_type: type[BaseException], text: str) -> int:
        config, output = self._config()
        env = {
            "PATH": f"{self.root}{os.pathsep}{os.environ['PATH']}",
            "PID_FILE": str(self.pid_file),
            "FAKE_FFMPEG_MODE": mode,
        }
        with mock.patch.dict(os.environ, env, clear=False):
            with self.assertRaises(error_type) as caught:
                self.renderer.render(config, output)
        if text:
            self.assertIn(text, str(caught.exception))
        else:
            self.assertTrue(str(caught.exception))
        pid = int(self.pid_file.read_text(encoding="ascii"))
        self._pids.append(pid)
        return pid

    def test_successful_child_path_writes_output_and_reaps_child(self) -> None:
        output = self._render("success")
        pid = int(self.pid_file.read_text(encoding="ascii"))
        self.assertRegex(output.read_text(encoding="ascii"), r"^encoded:[0-9]+$")
        assert_reaped(self, pid)

    def test_broken_pipe_preserves_original_error_and_reaps_child(self) -> None:
        pid = self._render_expect_error("broken-pipe", BrokenPipeError, "")
        assert_reaped(self, pid)

    def test_nonzero_encoder_error_is_preserved_and_child_is_reaped(self) -> None:
        pid = self._render_expect_error("nonzero", RuntimeError, "ffmpeg failed with exit code 23")
        assert_reaped(self, pid)

    def test_sigterm_resistant_child_is_escalated_and_reaped(self) -> None:
        pid = self._render_expect_error("resistant", BrokenPipeError, "")
        assert_reaped(self, pid)
    def test_final_wait_interrupt_still_terminates_owned_process(self) -> None:
        config, output = self._config()

        class InterruptingProcess:
            def __init__(self) -> None:
                self.stdin = io.BytesIO()
                self.terminated = False
                self.wait_calls = 0

            def poll(self):
                return None if not self.terminated else -15

            def terminate(self) -> None:
                self.terminated = True

            def kill(self) -> None:
                self.terminated = True

            def wait(self, timeout=None):
                self.wait_calls += 1
                if self.wait_calls == 1:
                    raise KeyboardInterrupt()
                return -15

        process = InterruptingProcess()
        with mock.patch.object(self.renderer.subprocess, "Popen", return_value=process):
            with self.assertRaises(KeyboardInterrupt):
                self.renderer.render({**config, "duration": 0.0}, output)
        self.assertTrue(process.terminated)

    def test_close_failure_does_not_mask_frame_write_error(self) -> None:
        config, output = self._config()

        class FailingStdin:
            def write(self, data) -> None:
                raise BrokenPipeError("frame write failed")

            def close(self) -> None:
                raise OSError("stdin close failed")

        class FailingProcess:
            def __init__(self) -> None:
                self.stdin = FailingStdin()
                self.terminated = False

            def poll(self):
                return None if not self.terminated else -15

            def terminate(self) -> None:
                self.terminated = True

            def kill(self) -> None:
                self.terminated = True

            def wait(self, timeout=None):
                return -15

        process = FailingProcess()
        with mock.patch.object(self.renderer.subprocess, "Popen", return_value=process):
            with self.assertRaises(BrokenPipeError) as caught:
                self.renderer.render(config, output)
        self.assertEqual(str(caught.exception), "frame write failed")
        self.assertTrue(process.terminated)


class LocalServerBoundaryRegressions(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.home = tempfile.TemporaryDirectory(prefix="jev-local-home-")
        old_home = os.environ.get("HOME")
        os.environ["HOME"] = cls.home.name
        try:
            cls.server_module = load_module(LOCAL_SERVER_PATH, "jev_local_server_regressions")
        finally:
            if old_home is None:
                os.environ.pop("HOME", None)
            else:
                os.environ["HOME"] = old_home

    @classmethod
    def tearDownClass(cls) -> None:
        cls.home.cleanup()

    def setUp(self) -> None:
        self.server = self.server_module.ThreadingHTTPServer(("127.0.0.1", 0), self.server_module.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()
        self.addCleanup(self._stop_server)

    def _stop_server(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.assertFalse(self.thread.is_alive())

    def _request(self, headers: str, body: bytes = b"") -> bytes:
        sock = socket.create_connection(self.server.server_address, timeout=2)
        self.addCleanup(sock.close)
        sock.sendall(headers.encode("ascii") + b"\r\n\r\n" + body)
        chunks: list[bytes] = []
        while b"\r\n\r\n" not in b"".join(chunks):
            chunks.append(sock.recv(4096))
        head_and_body = b"".join(chunks)
        head, _, remainder = head_and_body.partition(b"\r\n\r\n")
        length = int(next(line.split(b":", 1)[1] for line in head.splitlines() if line.lower().startswith(b"content-length:")))
        while len(remainder) < length:
            remainder += sock.recv(4096)
        return head + b"\r\n\r\n" + remainder[:length]

    @staticmethod
    def _json_body(response: bytes) -> dict:
        return json.loads(response.split(b"\r\n\r\n", 1)[1])

    def test_negative_length_is_rejected_before_body_read(self) -> None:
        response = self._request(
            "POST /v1/systemone HTTP/1.0\r\nHost: localhost\r\nContent-Length: -1"
        )
        self.assertTrue(response.startswith(b"HTTP/1.0 400"))
        self.assertEqual(self._json_body(response), {"error": "'Content-Length' must be non-negative"})

    def test_oversized_length_is_rejected_at_one_mib_before_body_read(self) -> None:
        response = self._request(
            "POST /v1/systemone HTTP/1.0\r\nHost: localhost\r\nContent-Length: 1048577"
        )
        self.assertTrue(response.startswith(b"HTTP/1.0 400"))
        self.assertEqual(self._json_body(response), {"error": "request body exceeds 1048576 bytes"})
    def test_exact_maximum_length_is_accepted_by_size_gate(self) -> None:
        body = b"{}" + b" " * (self.server_module.MAX_REQUEST_BYTES - 2)
        response = self._request(
            f"POST /v1/systemone HTTP/1.0\r\nHost: localhost\r\nContent-Length: {len(body)}",
            body,
        )
        self.assertTrue(response.startswith(b"HTTP/1.0 400"))
        self.assertNotIn("exceeds", self._json_body(response)["error"])


    def test_partial_body_timeout_returns_error_and_server_closes_cleanly(self) -> None:
        old_timeout = self.server_module.REQUEST_TIMEOUT_SECONDS
        self.server_module.REQUEST_TIMEOUT_SECONDS = 0.05
        self.addCleanup(setattr, self.server_module, "REQUEST_TIMEOUT_SECONDS", old_timeout)
        response = self._request(
            "POST /v1/systemone HTTP/1.0\r\nHost: localhost\r\nContent-Length: 8",
            b"{",
        )
        self.assertTrue(response.startswith(b"HTTP/1.0 400"))
        self.assertIn("timed out", self._json_body(response)["error"])


class InstallerDigestRegressions(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.support = load_module(INSTALL_SUPPORT_PATH, "install_support_regressions")

    def test_chunked_digest_matches_sha256_and_stays_bounded(self) -> None:
        with tempfile.TemporaryDirectory(prefix="digest-regression-") as raw:
            path = Path(raw) / "payload.bin"
            path.write_bytes((b"0123456789abcdef" * 524288))  # exactly 8 MiB
            expected = hashlib.sha256(path.read_bytes()).hexdigest()
            tracemalloc.start()
            try:
                actual = self.support._sha256_file(path)
                _, peak = tracemalloc.get_traced_memory()
            finally:
                tracemalloc.stop()
            self.assertEqual(actual, expected)
            self.assertLess(peak, 3 * 1024 * 1024)

    def test_copy_tree_manifest_preserves_digest_parity_at_chunk_boundary(self) -> None:
        with tempfile.TemporaryDirectory(prefix="copy-regression-") as raw:
            root = Path(raw)
            source = root / "source"
            target = root / "target"
            source.mkdir()
            (source / "boundary.bin").write_bytes(b"x" * (1024 * 1024 + 1))
            (source / "nested").mkdir()
            (source / "nested/data.txt").write_text("한글\n", encoding="utf-8")
            copied = self.support.copy_tree(source, target)
            self.assertEqual(copied, 2)
            self.assertEqual(self.support.dir_manifest(source), self.support.dir_manifest(target))
    def test_copy_tree_rejects_symlinked_source_and_destination(self) -> None:
        with tempfile.TemporaryDirectory(prefix="copy-symlink-regression-") as raw:
            root = Path(raw)
            source = root / "source"
            target = root / "target"
            source.mkdir()
            target.mkdir()

            source_link = source / "linked.txt"
            source_link.symlink_to(root / "outside.txt")
            with self.assertRaisesRegex(ValueError, "symlink"):
                self.support.copy_tree(source, target)
            source_link.unlink()

            target_link = target / "linked.txt"
            target_link.symlink_to(root / "outside.txt")
            (source / "payload.txt").write_text("payload", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "symlink"):
                self.support.copy_tree(source, target)


LINK_TARGETS_PATH = ROOT / "scripts/link_targets.py"

QUERY_HANDLER_PATH = ROOT / ".agent-skills/skill-query-handler.py"


class QueryOverlayRegressions(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.current = load_module(QUERY_HANDLER_PATH, "skill_query_handler_current")
        return

    def setUp(self) -> None:
        self.work = tempfile.TemporaryDirectory(prefix="query-overlay-")
        self.addCleanup(self.work.cleanup)
        self.root = Path(self.work.name)
        for name, description in (
            ("foo", "Schema design and query planning for services"),
            ("foo-bar", "Browser animation and interaction tooling"),
        ):
            skill = self.root / name
            skill.mkdir()
            (skill / "SKILL.md").write_text(
                f"---\nname: {name}\ndescription: {description}\n---\n\nBody\n",
                encoding="utf-8",
            )
        (self.root / "skills.json").write_text(
            json.dumps(
                {
                    "skills": [
                        {
                            "name": "foo",
                            "description": "Schema design and query planning for services",
                            "tags": ["duplicate-term", "Unicode Δ"],
                            "keywords": ["overlay keyword"],
                            "commands": [{"name": "overlay-command", "description": "overlay docs"}],
                        },
                        {
                            "name": "foo-bar",
                            "description": "Replaced description with unique overlay phrase",
                            "tags": ["metadata-flag"],
                            "keywords": ["new catalog term"],
                        },
                        {"name": "foo", "tags": ["duplicate-term"]},
                    ]
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

    def _handlers(self):
        isolated_home = self.root / "home"
        isolated_home.mkdir(exist_ok=True)
        with mock.patch.dict(os.environ, {"HOME": str(isolated_home)}, clear=False):
            return self.current.SkillQueryHandler(str(self.root))

    def test_overlay_match_outputs_remain_byte_equivalent_to_captured_original(self) -> None:
        current = self._handlers()
        queries = ["schema query", "duplicate-term", "overlay keyword", "new catalog term", "foo-bar"]
        current_output = [(query, current.match_query_to_skills(query)) for query in queries]
        expected_names = ["foo", "foo", "foo", "foo-bar", "foo-bar"]
        for (_, matches), expected in zip(current_output, expected_names):
            self.assertTrue(matches)
            self.assertEqual(matches[0][0], expected)
        self.assertIn("metadata-flag", current.skill_catalog["foo-bar"]["tags"])

    def test_per_instance_metadata_cache_does_not_change_new_catalog_entry_matching(self) -> None:
        current = self._handlers()
        current.match_query_to_skills("schema query")
        current.skill_catalog["new-entry"] = {
            "name": "new-entry",
            "description": "A newly added Unicode Δ catalog skill",
            "tags": [],
            "search_terms": ["late unique term"],
            "description_tokens": {"newly", "added", "unicode", "catalog", "skill"},
        }
        self.assertEqual(current.get_best_skill("late unique term"), "new-entry")

    def test_warmed_cache_scores_in_place_mutations_like_captured_original(self) -> None:
        current = self._handlers()
        current.match_query_to_skills("schema query")
        current_skill = current.skill_catalog["foo"]
        current_skill["name"] = "mutated-entry"
        current_skill["search_terms"].append("fresh mutation phrase")
        query = "mutated entry fresh mutation phrase"
        query_tokens = {token for token in self.current.tokenize(query) if token not in self.current.STOPWORDS}
        actual = current._score_skill(query, query_tokens, current_skill)
        self.assertEqual(actual, 151)

    def test_warmed_cache_scores_replaced_record_like_captured_original(self) -> None:
        current = self._handlers()
        current.match_query_to_skills("schema query")
        old_current = current.skill_catalog["foo"]
        replacement_current = {**old_current, "name": "replacement-entry", "search_terms": ["replacement phrase"], "description_tokens": set()}
        current.skill_catalog["foo"] = replacement_current
        query = "replacement entry replacement phrase"
        query_tokens = {token for token in self.current.tokenize(query) if token not in self.current.STOPWORDS}
        actual = current._score_skill(query, query_tokens, replacement_current)
        self.assertEqual(actual, 150)
        self.assertIsNot(old_current, replacement_current)



    def test_transient_scoring_records_do_not_grow_metadata_cache(self) -> None:
        current = self._handlers()
        current.match_query_to_skills("schema query")
        baseline_size = len(current._search_metadata)
        transient_records = []
        query = "unrelated query"
        query_tokens = {token for token in self.current.tokenize(query) if token not in self.current.STOPWORDS}
        for index in range(256):
            record = {
                "name": f"transient-{index}",
                "search_terms": [f"ephemeral-{index}"],
                "description_tokens": set(),
            }
            transient_records.append(record)
            current._score_skill(query, query_tokens, record)
        self.assertEqual(len(current._search_metadata), baseline_size)

class LinkScannerRegressions(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.scanner = load_module(LINK_TARGETS_PATH, "link_targets_regressions")

    def test_scan_ignores_comments_and_strict_fences_while_reporting_real_links(self) -> None:
        with tempfile.TemporaryDirectory(prefix="link-scanner-") as raw:
            root = Path(raw)
            skill = root / "demo"
            skill.mkdir()
            (skill / "docs.md").write_text("docs\n", encoding="utf-8")
            (skill / "SKILL.md").write_text(
                "---\nname: demo\ndescription: demo\n---\n"
                "[ok](docs.md)\n"
                "[missing](missing.md)\n"
                "```python\n"
                "[ignored](missing-code.md)\n"
                "```\n"
                "<!-- [ignored](missing-comment.md) -->\n"
                "````markdown\n"
                "[ignored-long](missing-long.md)\n"
                "```\n"
                "still inside\n"
                "````\n",
                encoding="utf-8",
            )
            artifact_dir = root / ".frontmatter"
            findings = self.scanner.scan(root, artifact_dir)
            self.assertEqual(
                [(item["target"], item["status"], item["line"]) for item in findings],
                [("docs.md", "ok", 5), ("missing.md", "broken", 6)],
            )
            self.assertEqual(self.scanner.validate_link_targets(root, artifact_dir), [findings[1]])

INSPECT_PATH = ROOT / ".agent-skills/higgsfield-websites/scripts/glb_inspect.py"
MERGE_PATH = ROOT / ".agent-skills/higgsfield-websites/scripts/glb_merge_anims.py"
WATERMARK_WRAPPER = ROOT / ".agent-skills/watermarks-remover/scripts/watermarks-remover.sh"


def make_glb(gltf: dict, bin_payload: bytes = b"", extra_chunks: list[tuple[int, bytes]] | None = None, declared_length: int | None = None, trailing: bytes = b"") -> bytes:
    json_payload = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_payload += b" " * ((4 - len(json_payload) % 4) % 4)
    chunks = [(0x4E4F534A, json_payload)]
    chunks.extend(extra_chunks or [])
    chunks.append((0x004E4942, bin_payload + b"\0" * ((4 - len(bin_payload) % 4) % 4)))
    body = b"".join(struct.pack("<II", len(payload), kind) + payload for kind, payload in chunks)
    total = 12 + len(body)
    return struct.pack("<III", 0x46546C67, 2, total if declared_length is None else declared_length) + body + trailing


class AuditConfigRegressions(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.audit = load_module(AUDIT_CONFIG_PATH, "audit_config_regressions")

    def test_late_duplicate_unicode_and_long_lines_are_parsed_exactly(self) -> None:
        with tempfile.TemporaryDirectory(prefix="audit-env-") as raw:
            path = Path(raw) / ".env"
            path.write_bytes(("EARLY=" + ("x" * (2 * 1024 * 1024)) + "\n").encode() + b"LATE=\xe2\x9c\x93\nDUP=one\nDUP=two\nBAD=\xff\n")
            values = self.audit.parse_env_file(path)
            self.assertEqual(values["LATE"], "✓")
            self.assertEqual(values["DUP"], "two")
            self.assertEqual(values["BAD"], "�")
            self.assertEqual(len(values["EARLY"]), 2 * 1024 * 1024)
    def test_all_dotenv_line_separators_preserve_late_unicode_keys(self) -> None:
        content = (
            "VT=uno\x0bFF=dos\x0cFS=tres\x1cGS=cuatro\x1dRS=cinco\x1eNEL=seis\x85"
            "LS=siete\u2028PS=ocho\u2029CR=nueve\rCRLF=diez\r\n"
            "# ignored comment\u2028LATE=✓\u2029# ignored again\n"
            "DUP=one\rDUP=two\r\n"
            "export FINAL=終\n"
        )
        with tempfile.TemporaryDirectory(prefix="audit-separators-") as raw:
            path = Path(raw) / ".env"
            path.write_text(content, encoding="utf-8")
            self.assertEqual(
                self.audit.parse_env_file(path),
                {
                    "VT": "uno",
                    "FF": "dos",
                    "FS": "tres",
                    "GS": "cuatro",
                    "RS": "cinco",
                    "NEL": "seis",
                    "LS": "siete",
                    "PS": "ocho",
                    "CR": "nueve",
                    "CRLF": "diez",
                    "LATE": "✓",
                    "DUP": "two",
                    "FINAL": "終",
                },
            )



class GLBStreamingRegressions(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.inspect = load_module(INSPECT_PATH, "glb_inspect_regressions")
        cls.merge = load_module(MERGE_PATH, "glb_merge_regressions")
        cls.original_inspect = load_module(ORIGINAL_INSPECT_PATH, "glb_inspect_original") if ORIGINAL_INSPECT_PATH.is_file() else None
        cls.original_merge = load_module(ORIGINAL_MERGE_PATH, "glb_merge_original") if ORIGINAL_MERGE_PATH.is_file() else None

    def test_write_glb_preserves_exact_bytes_and_handles_buffer_subclasses(self) -> None:
        class ReinterpretedBytes(bytes):
            def __bytes__(self):
                return b"XYZ"

            def __len__(self):
                return 6

        cases = (
            (b"ABCD", b"ABCD", 4),
            (bytearray(b"ABCD"), b"ABCD", 4),
            (ReinterpretedBytes(b"ABCD"), b"XYZ", 6),
        )
        for source, emitted, declared_length in cases:
            with self.subTest(source_type=type(source).__name__):
                gltf = {"asset": {"version": "2.0"}, "buffers": [{"byteLength": 0}]}
                json_payload = json.dumps(
                    {"asset": {"version": "2.0"}, "buffers": [{"byteLength": declared_length}]},
                    separators=(",", ":"),
                ).encode("utf-8")
                json_payload += b" " * ((4 - len(json_payload) % 4) % 4)
                bin_padding = b"\0" * ((4 - declared_length % 4) % 4)
                bin_chunk = struct.pack("<II", len(emitted) + len(bin_padding), 0x004E4942) + emitted + bin_padding
                expected_body = struct.pack("<II", len(json_payload), 0x4E4F534A) + json_payload + bin_chunk
                expected = struct.pack("<III", 0x46546C67, 2, 12 + len(expected_body)) + expected_body
                with tempfile.NamedTemporaryFile(suffix=".glb") as output:
                    self.merge.write_glb(output.name, gltf, source)
                    output.flush()
                    self.assertEqual(output.read(), expected)
                self.assertEqual(gltf["buffers"][0]["byteLength"], declared_length)

    def test_valid_unknown_order_and_trailing_bytes_preserve_parser_output(self) -> None:
        gltf = {"asset": {"version": "2.0"}, "buffers": [{"byteLength": 4}], "nodes": [{"name": "Root"}]}
        payload = make_glb(gltf, b"ABCD", [(0x12345678, b"ignored")], trailing=b"trailing")
        with tempfile.NamedTemporaryFile(suffix=".glb") as fixture:
            fixture.write(payload)
            fixture.flush()
            inspect_gltf, inspect_bin = self.inspect.read_glb(fixture.name)
            self.assertEqual((inspect_gltf, inspect_bin), (gltf, b"ABCD"))
            self.assertIs(type(inspect_bin), bytes)
            merge_gltf, merge_bin = self.merge.read_glb(fixture.name)
            self.assertEqual((merge_gltf, merge_bin), (gltf, bytearray(b"ABCD")))
            self.assertIs(type(merge_bin), bytearray)
            if self.original_inspect is not None:
                self.assertEqual(self.original_inspect.read_glb(fixture.name), (gltf, b"ABCD"))
            if self.original_merge is not None:
                self.assertEqual(self.original_merge.read_glb(fixture.name), (gltf, bytearray(b"ABCD")))

    def test_forged_chunk_lengths_are_bounded_for_both_parsers(self) -> None:
        gltf = {"asset": {"version": "2.0"}}
        json_payload = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
        json_payload += b" " * ((4 - len(json_payload) % 4) % 4)
        json_chunk = struct.pack("<II", len(json_payload), 0x4E4F534A) + json_payload
        forged_bin_chunk = struct.pack("<II", 64 * 1024 * 1024, 0x004E4942) + b"tiny"
        body = json_chunk + forged_bin_chunk
        payload = struct.pack("<III", 0x46546C67, 2, 12 + len(body)) + body
        with tempfile.NamedTemporaryFile(suffix=".glb") as fixture:
            fixture.write(payload)
            fixture.flush()
            cases = ((self.inspect, bytes), (self.merge, bytearray))
            for parser, expected_type in cases:
                with self.subTest(parser=parser.__name__):
                    tracemalloc.start()
                    try:
                        parsed = parser.read_glb(fixture.name)
                        _, peak = tracemalloc.get_traced_memory()
                    finally:
                        tracemalloc.stop()
                    self.assertEqual(parsed[0], gltf)
                    self.assertEqual(parsed[1], expected_type(b"tiny"))
                    self.assertIs(type(parsed[1]), expected_type)
                    self.assertLess(peak, 1024 * 1024)

    def test_malformed_headers_and_chunks_fail_without_unbounded_read(self) -> None:
        valid_header = struct.pack("<III", 0x46546C67, 2, 0xFFFFFFFF)
        malformed = [b"", b"\0" * 4, valid_header + b"\x00", valid_header + struct.pack("<II", 32, 0x4E4F534A) + b"{"]
        for index, payload in enumerate(malformed):
            with self.subTest(case=index):
                with tempfile.NamedTemporaryFile(suffix=".glb") as fixture:
                    fixture.write(payload)
                    fixture.flush()
                    with self.assertRaises((struct.error, json.JSONDecodeError, UnicodeDecodeError, SystemExit)):
                        self.inspect.read_glb(fixture.name)
                    with self.assertRaises((struct.error, json.JSONDecodeError, UnicodeDecodeError, SystemExit)):
                        self.merge.read_glb(fixture.name)

    def test_merge_cli_writes_valid_animation_output(self) -> None:
        with tempfile.TemporaryDirectory(prefix="glb-merge-") as raw:
            root = Path(raw)
            base = root / "base.glb"
            donor = root / "donor.glb"
            output = root / "merged.glb"
            base_json = {"asset": {"version": "2.0"}, "buffers": [{"byteLength": 0}], "nodes": [{"name": "Root"}], "skins": [{"joints": [0]}]}
            donor_bin = struct.pack("<f3f", 0.0, 1.0, 2.0, 3.0)
            donor_json = {"asset": {"version": "2.0"}, "buffers": [{"byteLength": len(donor_bin)}], "nodes": [{"name": "Root"}], "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": 4}, {"buffer": 0, "byteOffset": 4, "byteLength": 12}], "accessors": [{"bufferView": 0, "componentType": 5126, "count": 1, "type": "SCALAR"}, {"bufferView": 1, "componentType": 5126, "count": 1, "type": "VEC3"}], "animations": [{"name": "walk", "samplers": [{"input": 0, "output": 1}], "channels": [{"sampler": 0, "target": {"node": 0, "path": "translation"}}]}]}
            base.write_bytes(make_glb(base_json))
            donor.write_bytes(make_glb(donor_json, donor_bin))
            result = subprocess.run([sys.executable, str(MERGE_PATH), str(base), f"{donor}:walk", str(output)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            merged, _ = self.merge.read_glb(str(output))
            self.assertEqual([a["name"] for a in merged["animations"]], ["walk"])
            self.assertEqual(merged["animations"][0]["channels"][0]["target"]["node"], 0)
            if self.original_merge is not None:
                original_output = root / "merged-original.glb"
                original_result = subprocess.run([sys.executable, str(ORIGINAL_MERGE_PATH), str(base), f"{donor}:walk", str(original_output)], capture_output=True, text=True)
                self.assertEqual(original_result.returncode, 0, original_result.stderr)
                self.assertEqual(output.read_bytes(), original_output.read_bytes())


class WatermarkWrapperRegressions(unittest.TestCase):
    def test_exec_preserves_argv_status_and_pid_for_each_action(self) -> None:
        with tempfile.TemporaryDirectory(prefix="watermark-wrapper-") as raw:
            root = Path(raw)
            scripts = root / "skills/remove-ai-marks/scripts"
            scripts.mkdir(parents=True)
            for name in ("inspect_file.py", "clean_file.py", "audit_dir.py"):
                (scripts / name).write_text("# fixture\n", encoding="utf-8")
            fake_bin = root / "bin"
            fake_bin.mkdir()
            record = root / "record.json"
            fake_python = fake_bin / "python3"
            fake_python.write_text(f"#!{sys.executable}\nimport json, os, sys\nfrom pathlib import Path\nPath(os.environ['RECORD']).write_text(json.dumps({{'pid': os.getpid(), 'argv': sys.argv[1:]}}))\nraise SystemExit(17)\n", encoding="utf-8")
            fake_python.chmod(0o755)
            env = {**os.environ, "PATH": f"{fake_bin}{os.pathsep}{os.environ['PATH']}", "RECORD": str(record)}
            cases = [("inspect", ["input.txt", "--json"], ["input.txt", "--json"]), ("clean", ["input.txt", "output.txt", "--force"], ["input.txt", "-o", "output.txt", "--force"]), ("audit", ["fixtures", "--deep"], ["fixtures", "--deep"])]
            for command, args, expected_args in cases:
                with self.subTest(command=command):
                    record.unlink(missing_ok=True)
                    proc = subprocess.Popen(["bash", str(WATERMARK_WRAPPER), command, str(root), *args], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                    proc.communicate(timeout=5)
                    self.assertEqual(proc.returncode, 17)
                    observed = json.loads(record.read_text(encoding="utf-8"))
                    self.assertEqual(observed["pid"], proc.pid)
                    self.assertEqual(observed["argv"][1:], expected_args)

class CatalogLoaderRegressions(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        try:
            import yaml  # noqa: PLC0415
        except ImportError as exc:
            raise unittest.SkipTest(f"PyYAML unavailable: {exc}") from exc
        cls.yaml = yaml
        cls.repair = load_module(REPAIR_PATH, "repair_frontmatter_regressions")
        cls.boundary = load_module(BOUNDARY_PATH, "frontmatter_boundary_regressions")
        cls.validator = load_module(VALIDATOR_PATH, "catalog_validator_regressions")
        cls.ledger = load_module(LEDGER_PATH, "exception_ledger_regressions")

    def test_safe_loader_preserves_alias_folded_and_multiline_values(self) -> None:
        text = """name: demo\nbase: &base [one, two]\ncopy: *base\ndescription: >-\n  first line\n  second line\nmultiline: |\n  alpha\n  beta\n"""
        expected = self.yaml.safe_load(text)
        loaders = [self.repair._safe_load, self.boundary._yaml_load, lambda value: self.validator._safe_yaml_load(self.yaml, value), self.ledger._safe_load]
        for loader in loaders:
            with self.subTest(loader=loader):
                self.assertEqual(loader(text), expected)

    def test_safe_loader_rejects_python_object_tags(self) -> None:
        unsafe = "value: !!python/object/apply:os.system ['echo unsafe']\n"
        loaders = [self.repair._safe_load, self.boundary._yaml_load, lambda value: self.validator._safe_yaml_load(self.yaml, value), self.ledger._safe_load]
        for loader in loaders:
            with self.subTest(loader=loader):
                with self.assertRaises(self.yaml.YAMLError):
                    loader(unsafe)

    def test_loader_fallback_uses_safe_loader_when_csafe_loader_is_absent(self) -> None:
        text = "aliases: &x [one]\ncopy: *x\n"
        expected = self.yaml.safe_load(text)
        had_fast_loader = hasattr(self.yaml, "CSafeLoader")
        fast_loader = getattr(self.yaml, "CSafeLoader", None)
        try:
            if had_fast_loader:
                delattr(self.yaml, "CSafeLoader")
            loaders = [self.repair._safe_load, self.boundary._yaml_load, lambda value: self.validator._safe_yaml_load(self.yaml, value), self.ledger._safe_load]
            for loader in loaders:
                with self.subTest(loader=loader):
                    self.assertEqual(loader(text), expected)
        finally:
            if had_fast_loader:
                setattr(self.yaml, "CSafeLoader", fast_loader)

    def test_repair_cache_updates_manifest_only_after_bare_write(self) -> None:
        with tempfile.TemporaryDirectory(prefix="repair-cache-") as raw:
            root = Path(raw)
            skill_dir = root / ".agent-skills" / "demo"
            skill_dir.mkdir(parents=True)
            description = "A durable description recovered from the manifest source."
            (root / ".agent-skills" / "skills.json").write_text(
                json.dumps({"skills": [{"name": "demo", "path": "demo/SKILL.md", "description": description}]}),
                encoding="utf-8",
            )
            skill = skill_dir / "SKILL.md"
            skill.write_text("---\nname: demo\ndescription: >\n---\n\nBody\n", encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(REPAIR_PATH), "--repo-root", str(root)],
                check=True,
                capture_output=True,
                text=True,
                env={**os.environ, "HOME": str(root / "home")},
            )
            self.assertIn("fixed: demo: description rebuilt", result.stdout)
            self.assertNotIn("manifest description synced", result.stdout)
            manifest = json.loads((root / ".agent-skills" / "skills.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["skills"][0]["description"], description)


if __name__ == "__main__":
    program = unittest.main(verbosity=2, exit=False)
    result = program.result
    if result.skipped and "CI" in os.environ:
        skipped = ", ".join(f"{test}: {reason}" for test, reason in result.skipped)
        print(f"CI mode forbids skipped tests ({len(result.skipped)}): {skipped}", file=sys.stderr)
        raise SystemExit(1)
    raise SystemExit(0 if result.wasSuccessful() else 1)
