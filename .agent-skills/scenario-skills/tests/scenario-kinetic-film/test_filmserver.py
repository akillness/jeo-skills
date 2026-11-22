"""filmserver.py: the local server, and reading the film's metadata without a traceback on failure."""

import io
import json
import os
import socket
import subprocess
import sys
import tempfile
import unittest
import unittest.mock
import urllib.error
import urllib.request
from contextlib import redirect_stderr
from pathlib import Path

import fakes
import media

sys.path.insert(0, str(media.SCRIPTS))
import filmserver  # noqa: E402


class ServeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        (root / "secret.txt").write_text("outside")
        self.folder = root / "film"
        self.folder.mkdir()
        (self.folder / "index.html").write_bytes(b"<!doctype html><p>film")

    def test_serves_the_folder_on_a_local_port(self):
        url, server = filmserver.serve(self.folder)
        self.addCleanup(filmserver.stop, server)
        self.assertRegex(url, r"^http://127\.0\.0\.1:\d+/$")
        with urllib.request.urlopen(url + "index.html") as r:
            self.assertEqual(r.read(), b"<!doctype html><p>film")

    def test_listens_with_a_backlog_for_parallel_workers(self):
        url, server = filmserver.serve(self.folder)
        self.addCleanup(filmserver.stop, server)
        self.assertGreaterEqual(server.request_queue_size, 128)
        self.assertTrue(server.daemon_threads)

    def test_answers_a_burst_of_parallel_requests(self):
        url, server = filmserver.serve(self.folder)
        self.addCleanup(filmserver.stop, server)
        (self.folder / "big.bin").write_bytes(os.urandom(1 << 20))
        from concurrent.futures import ThreadPoolExecutor

        def get(i):
            with urllib.request.urlopen(url + ("big.bin" if i % 2 else "index.html"), timeout=30) as r:
                return r.status

        with ThreadPoolExecutor(64) as pool:
            self.assertEqual(set(pool.map(get, range(256))), {200})

    def test_stays_inside_the_folder(self):
        url, server = filmserver.serve(self.folder)
        self.addCleanup(filmserver.stop, server)
        for path in ("../secret.txt", "%2e%2e/secret.txt", "..%2fsecret.txt"):
            with self.subTest(path=path), self.assertRaises(urllib.error.HTTPError) as e:
                urllib.request.urlopen(url + path)
            self.assertEqual(e.exception.code, 404)
            e.exception.close()

    def test_shutdown_closes_the_port(self):
        url, server = filmserver.serve(self.folder)
        port = int(url.rsplit(":", 1)[1].strip("/"))
        filmserver.stop(server)
        with socket.socket() as s:
            self.assertNotEqual(s.connect_ex(("127.0.0.1", port)), 0)


class UsageTest(unittest.TestCase):
    def test_run_on_its_own(self):
        r = subprocess.run([sys.executable, "-I", str(media.SCRIPTS / "filmserver.py")], capture_output=True, text=True)
        self.assertEqual(r.returncode, 1)
        self.assertIn("usage: filmserver.py is imported by render.py", r.stderr)


class FilmInfoTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.dir = Path(self.tmp.name)
        self.env = fakes.install(self.dir / "bin")

    def test_reads_an_info_file(self):
        path = self.dir / "info.json"
        path.write_text(json.dumps({"dur": 3}))
        self.assertEqual(filmserver.film_info(self.dir, str(path)), {"dur": 3})

    def test_asks_the_film_and_passes_warnings_on(self):
        self.env["FAKE_NODE_INFO"] = json.dumps({"dur": 2, "fps": 60})
        err = io.StringIO()
        with unittest.mock.patch.dict(os.environ, self.env, clear=True), redirect_stderr(err):
            self.assertEqual(filmserver.film_info(self.dir), {"dur": 2, "fps": 60})
        self.assertIn("warning: a test warning", err.getvalue())

    def test_a_failed_film_exits_with_its_reasons(self):
        self.env["FAKE_NODE_ERROR"] = "error: fonts missing"
        err = io.StringIO()
        with unittest.mock.patch.dict(os.environ, self.env, clear=True), redirect_stderr(err):
            with self.assertRaises(SystemExit) as e:
                filmserver.film_info(self.dir)
        self.assertIn("did not load", str(e.exception.code))
        self.assertIn("error: fonts missing", err.getvalue())

    def test_no_metadata_exits_with_a_message(self):
        for printed in ("", "not json"):
            self.env["FAKE_NODE_INFO"] = printed
            with self.subTest(printed=printed), unittest.mock.patch.dict(os.environ, self.env, clear=True), redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as e:
                    filmserver.film_info(self.dir)
                self.assertIn("printed no film metadata", str(e.exception.code))

    def test_no_node(self):
        with unittest.mock.patch.dict(os.environ, {"PATH": str(self.dir / "empty")}, clear=True):
            with self.assertRaises(SystemExit) as e:
                filmserver.film_info(self.dir)
        self.assertIn("node was not found", str(e.exception.code))


if __name__ == "__main__":
    unittest.main()
