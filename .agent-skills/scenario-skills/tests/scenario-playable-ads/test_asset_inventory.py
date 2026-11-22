import hashlib
import json
import shutil
import struct
import sys
import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import playable  # noqa: E402
from test_pack_glb import box_glb  # noqa: E402

INVENTORY = playable.SCRIPTS / "asset_inventory.py"


def write_wav(path, seconds, peak=0.5, lead_silence=0.0, rate=22050):
    """A mono 440 Hz tone, optionally after a stretch of silence."""
    t = np.arange(int(seconds * rate)) / rate
    x = peak * np.sin(2 * np.pi * 440 * t)
    x[t < lead_silence] = 0
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


def patch_glb(path, **extra):
    """Merge keys into a GLB's JSON chunk, keeping its binary chunk."""
    b = path.read_bytes()
    n = struct.unpack_from("<I", b, 12)[0]
    gltf = json.loads(b[20:20 + n])
    gltf.update(extra)
    rest = b[20 + n:]
    js = json.dumps(gltf).encode()
    js += b" " * (-len(js) % 4)
    body = struct.pack("<II", len(js), 0x4E4F534A) + js + rest
    path.write_bytes(struct.pack("<III", 0x46546C67, 2, 12 + len(body)) + body)


def sheet(path):
    """Two opaque discs on a transparent sheet, as a sprite sheet comes."""
    a = np.zeros((200, 400), bool)
    yy, xx = np.mgrid[:200, :400]
    for cx in (100, 300):
        a |= (xx - cx) ** 2 + (yy - 100) ** 2 < 70 ** 2
    px = np.zeros((200, 400, 4), np.uint8)
    px[a] = (230, 60, 40, 255)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(px, "RGBA").save(path)


def digest(folder):
    return {str(p.relative_to(folder)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted(folder.rglob("*")) if p.is_file()}


class AssetInventoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        cls.project = cls.tmp / "demo"
        src = cls.project / "intake" / "assets"
        sheet(src / "art" / "sheet.png")
        Image.new("RGB", (900, 1600), (40, 90, 160)).save(src / "art" / "key_art.jpg", quality=85)
        box_glb(src / "3d" / "pod.glb")
        box_glb(src / "3d" / "hero.glb")
        patch_glb(src / "3d" / "hero.glb", skins=[{"joints": [0]}], animations=[{"name": "run", "channels": []}])
        (src / "fonts").mkdir()
        shutil.copy(playable.FONT, src / "fonts" / "Title.woff2")
        (src / "notes.xyz").write_text("not an asset")
        if playable.HAS_FFMPEG:
            write_wav(src / "audio" / "hit.wav", 0.6, peak=1.0, lead_silence=0.2)
            write_wav(src / "audio" / "theme.wav", 9.0, peak=0.4)
        cls.before = digest(src)
        cls.out = playable.run(INVENTORY, cls.project)
        cls.inv = json.loads((cls.project / "analysis" / "assets_inventory.json").read_text())
        cls.rows = {r["file"].split("intake/assets/")[1]: r for r in cls.inv["rows"]}

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)

    def test_never_writes_in_the_supplied_folder(self):
        self.assertEqual(digest(self.project / "intake" / "assets"), self.before)
        self.assertTrue((self.project / "analysis" / "assets_inventory.md").is_file())

    def test_a_sheet_is_counted_and_flagged_for_blob_cuts(self):
        r = self.rows["art/sheet.png"]
        self.assertEqual((r["kind"], r["width"], r["height"], r["alpha"], r["sprites"]), ("image", 400, 200, True, 2))
        self.assertTrue(any('"blob"' in f for f in r["flags"]))
        self.assertEqual(len(r["colors"]), len(set(r["colors"])))

    def test_a_jpeg_is_flagged_as_a_plate_or_reference(self):
        r = self.rows["art/key_art.jpg"]
        self.assertFalse(r["alpha"])
        self.assertTrue(any(f.startswith("JPEG") for f in r["flags"]))

    def test_glb_counts_and_the_static_packer_limit(self):
        pod, hero = self.rows["3d/pod.glb"], self.rows["3d/hero.glb"]
        self.assertEqual((pod["kind"], pod["vertices"], pod["textures"], pod["skinned"]), ("3d", 8, 1, False))
        self.assertEqual(pod["flags"], [])
        self.assertEqual((hero["skinned"], hero["joints"], hero["clips"]), (True, 1, ["run"]))
        self.assertTrue(any("static mesh only" in f for f in hero["flags"]))

    def test_an_embeddable_font_has_its_family(self):
        r = self.rows["fonts/Title.woff2"]
        self.assertEqual((r["kind"], r["embeddable"]), ("font", True))
        self.assertTrue(r["family"].startswith("Fredoka"))  # a variable font names its default instance

    def test_an_unknown_file_is_unusable_and_does_not_stop_the_catalog(self):
        r = self.rows["notes.xyz"]
        self.assertFalse(r["usable"])
        self.assertEqual(self.inv["unusable"], 1)
        self.assertEqual(self.inv["files"], len(self.inv["rows"]))

    def test_summary_fields_wait_for_the_agent(self):
        self.assertEqual(self.inv["rights"], "not confirmed")
        self.assertEqual(self.inv["mode"], {})
        self.assertTrue(all(r["use"] == "" for r in self.inv["rows"]))
        self.assertIn(self.inv["budget"], ("fits", "tight", "over"))
        self.assertIn("estimated inlined", self.out.stdout)

    @unittest.skipUnless(playable.HAS_FFMPEG, "ffmpeg is required")
    def test_audio_levels_silence_and_length(self):
        hit, theme = self.rows["audio/hit.wav"], self.rows["audio/theme.wav"]
        self.assertAlmostEqual(hit["duration_s"], 0.6, delta=0.05)
        self.assertTrue(hit["silent_start"])
        self.assertTrue(any("boost_db" in f for f in hit["flags"]))
        self.assertTrue(any('"trim"' in f for f in hit["flags"]))
        self.assertIn(theme["loop_seam"], ("clean", "audible"))
        self.assertLess(theme["peak_db"], -6)

    def test_a_low_cap_reports_over_budget(self):
        playable.run(INVENTORY, self.project, "--max-mb", "0.01")
        inv = json.loads((self.project / "analysis" / "assets_inventory.json").read_text())
        self.assertEqual(inv["budget"], "over")
        playable.run(INVENTORY, self.project)

    def test_refuses_a_missing_folder(self):
        out = playable.run(INVENTORY, self.project, "--src", "intake/none", check=False)
        self.assertNotEqual(out.returncode, 0)
        self.assertIn("never edit them in place", out.stderr)


if __name__ == "__main__":
    unittest.main()
