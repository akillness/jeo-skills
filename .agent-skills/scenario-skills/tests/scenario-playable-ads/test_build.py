import json
import os
import re
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import playable  # noqa: E402

BUILD = playable.SCRIPTS / "build.py"


@unittest.skipUnless(playable.HAS_FFMPEG, "ffmpeg is required")
class BuildAllNetworksTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.project = playable.new_project(cls.tmp)
        cls.out = playable.run(BUILD, cls.project, "--networks", "all").stdout
        cls.dist = cls.project / "dist"

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)

    def html(self, net):
        return (self.dist / net / "index.html").read_text(encoding="utf-8")

    def test_every_network_gets_its_file_and_its_name(self):
        for net in playable.NETWORKS:
            self.assertIn(f'window.NETWORK="{net}"', self.html(net), net)

    def test_every_asset_token_is_inlined(self):
        for net in playable.NETWORKS:
            html = self.html(net)
            self.assertNotIn("{{", html, net)
            self.assertNotIn("<!-- network:", html, net)
            self.assertIn("data:image/webp;base64,", html)
            self.assertIn("data:audio/mpeg;base64,", html)
            self.assertIn("data:font/woff2;base64,", html)

    def test_only_google_and_pangle_reference_one_external_file(self):
        for net in playable.NETWORKS:
            urls = re.findall(r'(?:src|href)=["\']((?:https?:)?//[^"\']+)', self.html(net))
            want = {"google": [playable.EXITAPI], "pangle": [playable.PANGLE_SDK]}.get(net, [])
            self.assertEqual(urls, want, net)

    def test_google_head_declares_portrait(self):
        self.assertIn('<meta name="ad.orientation" content="portrait">', self.html("google"))

    def test_pangle_sdk_sits_in_body_before_the_game_code(self):
        html = self.html("pangle")
        sdk = html.index(playable.PANGLE_SDK)
        self.assertGreater(sdk, html.index("<body"))
        self.assertLess(sdk, html.index("window.GAME_CFG"))
        self.assertLess(sdk, html.index("window.PA"))

    def test_zip_networks_hold_index_html_at_the_root(self):
        for net in playable.ZIPPED:
            with zipfile.ZipFile(self.dist / net / f"demo-{net}.zip") as z:
                self.assertIn("index.html", z.namelist(), net)
                self.assertEqual(z.read("index.html").decode("utf-8"), self.html(net))

    def test_pangle_zip_declares_portrait_only(self):
        with zipfile.ZipFile(self.dist / "pangle" / "demo-pangle.zip") as z:
            self.assertEqual(sorted(z.namelist()), ["config.json", "index.html"])
            self.assertEqual(json.loads(z.read("config.json")), {"playable_orientation": 1})

    def test_bundle_holds_one_file_per_network_without_the_preview(self):
        with zipfile.ZipFile(self.dist / "demo-networks.zip") as z:
            names = sorted(z.namelist())
        want = sorted(f"demo-{n}.zip" if n in playable.ZIPPED else f"demo-{n}.html" for n in playable.NETWORKS[:-1])
        self.assertEqual(names, want)

    def test_sizes_stay_under_every_cap(self):
        self.assertLess((self.dist / "meta" / "index.html").stat().st_size, 2 * 1024 * 1024)
        self.assertNotIn("OVER LIMIT", self.out)

    def test_hint_hand_falls_back_to_the_vector_hand(self):
        self.assertRegex(self.html("web"), r"""HAND = \{\s*src:\s*(""|'')""")


@unittest.skipUnless(playable.HAS_FFMPEG, "ffmpeg is required")
class BuildGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.base = playable.new_project(cls.tmp, "base")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)

    def copy(self, name):
        project = Path(self.tmp) / name
        shutil.copytree(self.base, project)
        return project

    def edit(self, path, old, new):
        text = path.read_text(encoding="utf-8")
        self.assertIn(old, text)
        path.write_text(text.replace(old, new, 1), encoding="utf-8")

    def refused(self, project, needle, *args):
        out = playable.run(BUILD, project, *args, check=False)
        self.assertNotEqual(out.returncode, 0)
        self.assertIn(needle, out.stdout + out.stderr)

    def test_refuses_emoji(self):
        p = self.copy("emoji")
        self.edit(p / "src" / "index.src.html", "<title>GAME NAME</title>", "<title>GAME NAME \U0001F525</title>")
        self.refused(p, "emoji in the source")

    def test_refuses_an_external_script(self):
        p = self.copy("external")
        self.edit(p / "src" / "index.src.html", "</head>", '<script src="https://cdn.example.com/lib.js"></script>\n</head>')
        self.refused(p, "external resource reference", "--networks", "meta")

    def test_refuses_network_calls_in_the_game_code(self):
        p = self.copy("fetch")
        (p / "src" / "game.js").write_text((p / "src" / "game.js").read_text() + "\nfetch('/config');\n")
        self.refused(p, "storage or network API")

    def test_allows_loader_code_in_a_vendored_bundle(self):
        p = self.copy("vendor")
        (p / "vendor").mkdir()
        (p / "vendor" / "lib.min.js").write_text("window.LIB={load:function(u){return fetch(u)}};\n")
        self.edit(p / "src" / "index.src.html", "<!-- include: src/game.js -->",
                  "<!-- include: vendor/lib.min.js -->\n<!-- include: src/game.js -->")
        out = playable.run(BUILD, p, "--networks", "web")
        self.assertIn("third-party", out.stdout)

    def test_refuses_an_unknown_network(self):
        self.refused(self.copy("unknown"), "unknown network", "--networks", "meta,myspace")

    def test_flags_a_build_over_the_meta_html_cap(self):
        p = self.copy("big")
        (p / "assets" / "web" / "big.bin").write_bytes(os.urandom(1_700_000))  # about 2.3 MB as base64
        self.edit(p / "src" / "index.src.html", "</body>", "<script>window.BIG='{{big.bin}}';</script>\n</body>")
        out = playable.run(BUILD, p, "--networks", "meta,applovin", check=False)
        self.assertEqual(out.returncode, 1)
        self.assertIn("HTML OVER LIMIT", out.stdout)
        self.assertNotIn("OVER LIMIT", out.stdout.split("applovin", 1)[1])  # 5 MB cap

    def test_a_project_hand_image_is_inlined(self):
        p = self.copy("hand")
        shutil.copy(p / "assets" / "web" / "piece.webp", p / "assets" / "web" / "hand.webp")
        playable.run(BUILD, p, "--networks", "web")
        html = (p / "dist" / "web" / "index.html").read_text(encoding="utf-8")
        self.assertRegex(html, r"""HAND = \{\s*src:\s*["']data:image/webp;base64,""")


if __name__ == "__main__":
    unittest.main()
