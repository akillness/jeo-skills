"""put_parts.py: ordered PUTs to a local server standing in for presigned part URLs."""

import hashlib
import io
import json
import shutil
import tempfile
import threading
import unittest
from contextlib import redirect_stderr
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import helpers

pp = helpers.load("put_parts")


class Bucket(BaseHTTPRequestHandler):
    """Stores each PUT body by path and answers with its MD5 as the ETag, or with a queued failure."""

    def do_PUT(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        server = self.server
        with server.lock:
            server.requests.append((self.path, dict(self.headers.items()), body))
            status = server.failures.pop(0) if server.failures else 200
        self.send_response(status)
        if status == 200:
            self.send_header("ETag", f'"{hashlib.md5(body).hexdigest()}"')
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *args):
        pass


class PutPartsTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Bucket)
        self.server.requests, self.server.failures, self.server.lock = [], [], threading.Lock()
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.data = bytes(range(256)) * 40  # 10,240 bytes
        (self.dir / "clip.mp4").write_bytes(self.data)

    def url(self, n):
        return f"http://127.0.0.1:{self.server.server_port}/up/clip.mp4?partNumber={n}&X-Amz-Signature=s{n}"

    def response(self, size, count, **extra):
        parts = [{"part_number": n, "upload_url": self.url(n),
                  "content_length": min(size, len(self.data) - (n - 1) * size)} for n in range(1, count + 1)]
        return {"upload_id": "up-1", "part_size": size, "total_parts": count, "parts": parts[::-1], **extra}

    def run_cli(self, parts, *args):
        helpers.write_json(self.dir / "parts.json", parts)
        return helpers.run("put_parts.py", self.dir / "clip.mp4", self.dir / "parts.json", *args)

    def test_the_saved_response_puts_every_part_in_order_with_bare_headers(self):
        result = self.run_cli(self.response(4096, 3), "-o", self.dir / "etags.json")
        self.assertEqual(result.returncode, 0, result.stderr)
        sent = self.server.requests
        self.assertEqual([path for path, _, _ in sent], [self.url(n).split(str(self.server.server_port), 1)[1] for n in (1, 2, 3)])
        self.assertEqual(b"".join(body for _, _, body in sent), self.data)
        self.assertEqual([len(body) for _, _, body in sent], [4096, 4096, 2048])
        for _, headers, body in sent:
            names = {k.lower() for k in headers}
            self.assertEqual(headers["Content-Length"], str(len(body)))
            self.assertNotIn("content-type", names)
            self.assertFalse(any(k.startswith("x-amz-") for k in names), names)
        out = json.loads(result.stdout)
        self.assertEqual(out["upload_id"], "up-1")
        self.assertEqual(out["parts"], [{"part_number": n, "etag": f'"{hashlib.md5(body).hexdigest()}"'}
                                        for n, (_, _, body) in enumerate(sent, 1)])
        self.assertEqual(json.loads((self.dir / "etags.json").read_text()), out)
        self.assertIn("upload_asset_complete with upload_id up-1", result.stderr)

    def test_a_plain_url_list_uses_the_part_size_flag(self):
        result = self.run_cli([self.url(1), self.url(2)], "--part-size", "6000")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([len(body) for _, _, body in self.server.requests], [6000, 4240])
        self.assertIsNone(json.loads(result.stdout)["upload_id"])

    def test_the_default_part_size_is_six_million_bytes(self):
        big = self.dir / "big.bin"
        with big.open("wb") as f:
            f.truncate(6_000_001)
        _, size, parts = pp.read_parts([self.url(1), self.url(2)])
        with redirect_stderr(io.StringIO()):
            self.assertIsNotNone(pp.upload(big, None, int(size or pp.PART_SIZE), parts))
        self.assertEqual([len(body) for _, _, body in self.server.requests], [6_000_000, 1])

    def test_urls_that_do_not_fit_the_file_stop_before_any_put(self):
        result = self.run_cli(self.response(4096, 2))
        self.assertEqual(result.returncode, 2)
        self.assertIn("3 parts of 4096 bytes, but PARTS.json lists 2", result.stderr)
        bad = self.response(4096, 3)
        bad["parts"][0]["content_length"] = 9  # the last part, listed first
        result = self.run_cli(bad)
        self.assertEqual(result.returncode, 2)
        self.assertIn("part 3: 2048 bytes, but the response expects 9", result.stderr)
        self.assertEqual(self.run_cli({"upload_id": "up-1"}).returncode, 2)
        self.assertEqual(self.server.requests, [])

    def test_a_server_error_is_retried(self):
        self.server.failures = [503]
        _, size, parts = pp.read_parts(self.response(4096, 3))
        with redirect_stderr(io.StringIO()):
            result = pp.upload(self.dir / "clip.mp4", "up-1", size, parts, wait=0)
        self.assertEqual(len(result["parts"]), 3)
        self.assertEqual([path[-2:] for path, _, _ in self.server.requests], ["s1", "s1", "s2", "s3"])

    def test_an_expired_url_fails_with_the_fix(self):
        self.server.failures = [200, 403]
        result = self.run_cli(self.response(4096, 3))
        self.assertEqual(result.returncode, 1)
        self.assertIn("part 2/3: 403", result.stderr)
        self.assertIn("call upload_asset again", result.stderr)
        self.assertEqual(len(self.server.requests), 2)  # no retry on a 4xx, and nothing after the failed part
        self.assertEqual(result.stdout, "")

    def test_only_signed_s3_part_urls_are_accepted_before_any_put(self):
        s3 = "https://bucket.s3-accelerate.amazonaws.com/uploads/clip.mp4?partNumber=1&X-Amz-Signature=s1"
        self.assertEqual(len(pp.read_parts([s3])[2]), 1)
        refused = {
            "http://bucket.s3-accelerate.amazonaws.com/up?X-Amz-Signature=s1": "not an https URL",
            "https://collector.example.com/up?X-Amz-Signature=s1": "not an S3 upload host",
            "https://bucket.s3.amazonaws.com.example.com/up?X-Amz-Signature=s1": "not an S3 upload host",
            "https://bucket.s3-accelerate.amazonaws.com/up?partNumber=1": "carries no X-Amz-Signature",
        }
        for url, message in refused.items():
            with self.subTest(url=url):
                with self.assertRaises(pp.PartsError) as caught:
                    pp.read_parts([url])
                self.assertIn(message, str(caught.exception))
        with self.assertRaises(pp.PartsError) as caught:
            pp.read_parts([s3, "https://other.s3.amazonaws.com/up?X-Amz-Signature=s2"])
        self.assertIn("2 hosts", str(caught.exception))
        result = self.run_cli(["https://collector.example.com/up?X-Amz-Signature=s1",
                               "https://collector.example.com/up?X-Amz-Signature=s2"], "--part-size", "6000")
        self.assertEqual(result.returncode, 2)
        self.assertIn("pass --allow-host", result.stderr)
        self.assertEqual(self.server.requests, [])

    def test_allow_host_accepts_a_moved_upload_host(self):
        url = "https://uploads.example.com/up?X-Amz-Signature=s1"
        self.assertEqual(pp.read_parts([url], {"uploads.example.com"})[2][0][1], url)


if __name__ == "__main__":
    unittest.main()
