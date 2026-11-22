"""get_fonts.sh: pinned sources, checksums, skipping good files, and failing fast on bad ones.

The offline tests run a copy of the script whose hashes are swapped for those of a stub curl's bytes.
KINETIC_FILM_NETWORK=1 also downloads the real files from the pinned commit and checks them.
"""

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import media

SCRIPT = media.SCRIPTS / "get_fonts.sh"
ENTRY = re.compile(r'"([^"|]+)\|([^"|]+)\|([0-9a-f]{64})"')

CURL = r'''#!{python}
import json, os, sys
args = sys.argv[1:]
url, out = args[-3], args[args.index("-o") + 1]
with open(os.environ["CURL_LOG"], "a") as log:
    log.write(json.dumps(url) + "\n")
if os.environ.get("FAKE_CURL_FAIL"):
    sys.exit(22)
data = ("wrong bytes" if os.environ.get("FAKE_CURL_BAD") else "data for " + url.rsplit("/ofl/", 1)[1]).encode()
open(out, "wb").write(data)
'''


def entries(text):
    return ENTRY.findall(text)


class GetFontsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        bin_dir = root / "bin"
        bin_dir.mkdir()
        curl = bin_dir / "curl"
        curl.write_text(CURL.format(python=sys.executable))
        curl.chmod(0o755)
        self.log = root / "curl.jsonl"
        self.env = {**os.environ, "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}", "CURL_LOG": str(self.log)}
        # the same script, expecting the stub's bytes
        text = SCRIPT.read_text()
        for src, _, digest in entries(text):
            text = text.replace(digest, hashlib.sha256(f"data for {src}".encode()).hexdigest())
        self.script = root / "get_fonts.sh"
        self.script.write_text(text)
        self.film = root / "film"

    def run_fonts(self, script=None, *args):
        cmd = ["bash", str(script or self.script), *(args or [str(self.film)])]
        return subprocess.run(cmd, env=self.env, capture_output=True, text=True)

    def urls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_pins_one_commit_and_six_files(self):
        text = SCRIPT.read_text()
        self.assertIn("COMMIT=a4c0b21f839d7ac65a7d8b49eb81bddd110774a3", text)
        self.assertIn("https://raw.githubusercontent.com/google/fonts/$COMMIT/ofl", text)
        names = [name for _, name, _ in entries(text)]
        self.assertEqual(names, ["Archivo.ttf", "JetBrainsMono.ttf", "InstrumentSans.ttf", "OFL-Archivo.txt", "OFL-JetBrainsMono.txt", "OFL-InstrumentSans.txt"])
        # index.html loads the three fonts by these names
        html = (media.SKILL / "assets" / "engine" / "index.html").read_text()
        for name in names[:3]:
            self.assertIn(f"url(fonts/{name})", html)

    def test_fetches_checks_and_skips_good_files(self):
        r = self.run_fonts()
        self.assertEqual(r.returncode, 0, r.stderr)
        fonts = self.film / "fonts"
        self.assertEqual(len(self.urls()), 6)
        self.assertTrue(all("/google/fonts/a4c0b21f839d7ac65a7d8b49eb81bddd110774a3/ofl/" in u for u in self.urls()))
        self.assertEqual((fonts / "Archivo.ttf").read_text(), "data for archivo/Archivo%5Bwdth,wght%5D.ttf")
        self.assertEqual(sorted(p.name for p in fonts.iterdir()), sorted(n for _, n, _ in entries(self.script.read_text())))
        self.log.unlink()
        self.assertEqual(self.run_fonts().returncode, 0)
        self.assertEqual(self.urls(), [])
        (fonts / "JetBrainsMono.ttf").write_text("damaged")
        self.assertEqual(self.run_fonts().returncode, 0)
        self.assertEqual(len(self.urls()), 1)
        self.assertIn("JetBrainsMono", self.urls()[0])

    def test_a_wrong_file_is_removed_and_fails(self):
        self.env["FAKE_CURL_BAD"] = "1"
        for script in (self.script, SCRIPT):  # the shipped hashes too
            with self.subTest(script=script.name):
                r = self.run_fonts(script)
                self.assertEqual(r.returncode, 1)
                self.assertIn("checksum mismatch for Archivo.ttf", r.stderr)
                self.assertEqual(list((self.film / "fonts").iterdir()), [])

    def test_a_failed_download(self):
        self.env["FAKE_CURL_FAIL"] = "1"
        r = self.run_fonts()
        self.assertEqual(r.returncode, 1)
        self.assertIn("could not download", r.stderr)
        self.assertEqual(list((self.film / "fonts").iterdir()), [])

    def test_usage(self):
        r = subprocess.run(["bash", str(SCRIPT)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 1)
        self.assertIn("usage: get_fonts.sh <film folder>", r.stderr)

    @unittest.skipUnless(os.environ.get("KINETIC_FILM_NETWORK") == "1", "set KINETIC_FILM_NETWORK=1 to download the real fonts")
    def test_real_download_matches_the_pins(self):
        r = subprocess.run(["bash", str(SCRIPT), str(self.film)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        for _, name, digest in entries(SCRIPT.read_text()):
            self.assertEqual(hashlib.sha256((self.film / "fonts" / name).read_bytes()).hexdigest(), digest, name)


if __name__ == "__main__":
    unittest.main()
