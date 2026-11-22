"""prep_assets.py manifest keys the template's own manifest does not use, each on an image drawn for it."""

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import playable  # noqa: E402
from test_asset_inventory import write_wav  # noqa: E402
from test_prep_assets import peak  # noqa: E402

PREP = playable.SCRIPTS / "prep_assets.py"
TEAL = (11, 82, 97)


def save_rgba(path, px):
    Image.fromarray(px, "RGBA").save(path)


def grid_sheet(path):
    """A 2 x 1 sheet. Cell 1 holds a disc (the sprite), an island beside it worth keeping, a speck too
    small to keep, and a neighbor's sliver on the cell's left edge."""
    px = np.zeros((200, 400, 4), np.uint8)
    yy, xx = np.mgrid[:200, :200]
    cell = np.zeros((200, 200, 4), np.uint8)
    cell[(xx - 100) ** 2 + (yy - 100) ** 2 <= 50 ** 2] = (230, 60, 40, 255)
    cell[20:45, 160:185] = (40, 60, 230, 255)
    cell[100:105, 160:165] = (40, 230, 60, 255)
    cell[90:111, 0:4] = (230, 230, 40, 255)
    px[:, 200:] = cell
    px[20:80, 20:80] = (90, 90, 90, 255)  # cell 0, read by the RGBA crop entry
    save_rgba(path, px)


def variable_font(path):
    """A two-glyph TrueType font with a wght axis: A widens by 200 units from 400 to 900."""
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.ttLib.tables.TupleVariation import TupleVariation

    def box(w):
        pen = TTGlyphPen(None)
        pen.moveTo((50, 0))
        pen.lineTo((50, 700))
        pen.lineTo((50 + w, 700))
        pen.lineTo((50 + w, 0))
        pen.closePath()
        return pen.glyph()

    order = [".notdef", "space", "A", "B"]
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({32: "space", 65: "A", 66: "B"})
    fb.setupGlyf({".notdef": box(400), "space": TTGlyphPen(None).glyph(), "A": box(400), "B": box(400)})
    fb.setupHorizontalMetrics({g: (500, 0 if g == "space" else 50) for g in order})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": "Test Variable", "styleName": "Regular"})
    fb.setupOS2()
    fb.setupPost()
    fb.setupFvar(axes=[("wght", 100, 400, 900, "Weight")], instances=[])
    # four outline points, then the four phantom points; the third phantom carries the advance width
    deltas = [(0, 0), (0, 0), (200, 0), (200, 0), (0, 0), (200, 0), (0, 0), (0, 0)]
    fb.setupGvar({"A": [TupleVariation({"wght": (0, 1.0, 1.0)}, deltas)]})
    fb.save(str(path))


class ImageAndFontKeysTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        cls.project = Path(cls.tmp) / "demo"
        raw = cls.project / "assets" / "raw"
        raw.mkdir(parents=True)
        grid_sheet(raw / "cells.png")
        logo = np.zeros((80, 120, 3), np.uint8)
        logo[:] = TEAL
        logo[20:60, 30:90] = (255, 196, 40)
        Image.fromarray(logo, "RGB").save(raw / "badge.png")
        Image.new("RGB", (200, 200), (30, 140, 220)).save(raw / "hud.png")
        halo = np.zeros((100, 100, 4), np.uint8)
        halo[30:70, 30:70] = (250, 250, 120, 100)
        halo[40:60, 40:60] = (250, 250, 120, 255)
        save_rgba(raw / "glow.png", halo)
        variable_font(raw / "Variable.ttf")
        png = {"format": "png"}
        manifest = {"images": [
            {"name": "cell", "src": "assets/raw/cells.png", "grid": [2, 1], "cell": 1, **png},
            {"name": "badge", "src": "assets/raw/badge.png", "key": "#0b5261", **png},
            {"name": "unkeyed", "src": "assets/raw/badge.png", "key": "#ffffff", **png},
            {"name": "pill", "src": "assets/raw/hud.png", "crop": [20, 20, 120, 100], "mask": "rrect:10", **png},
            {"name": "corner", "src": "assets/raw/cells.png", "crop": [0, 0, 100, 100], **png},
            {"name": "glow", "src": "assets/raw/glow.png", "alpha_floor": 120, **png},
        ], "fonts": [{"name": "hud", "src": "assets/raw/Variable.ttf", "wght": 700, "text": "AB"}]}
        (cls.project / "assets" / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        cls.out = playable.run(PREP, cls.project).stdout
        cls.web = cls.project / "assets" / "web"

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)

    def alpha(self, name):
        return playable.rgba(self.web / name)[:, :, 3]

    def test_grid_cell_keeps_the_sprite_and_its_inner_island_only(self):
        a = self.alpha("cell.png")
        # disc x 50..150 and y 50..150, island x 160..184 and y 20..44: the edge sliver is gone
        self.assertEqual(a.shape, (131, 135))
        self.assertEqual(a[10, 120], 255)  # the island
        self.assertEqual(a[80, 50], 255)  # the disc
        self.assertTrue((a[80:85, 110:115] == 0).all())  # the speck under 5% of the sprite

    def test_a_hex_key_removes_that_color_only(self):
        badge = self.alpha("badge.png")
        self.assertEqual(badge.shape, (40, 60))
        self.assertTrue((badge == 255).all())
        unkeyed = self.alpha("unkeyed.png")
        self.assertEqual(unkeyed.shape, (80, 120))
        self.assertTrue((unkeyed == 255).all())

    def test_rounded_rect_mask_on_an_opaque_crop(self):
        a = self.alpha("pill.png")
        self.assertEqual(a.shape, (80, 100))
        self.assertEqual((a[0, 0], a[79, 99]), (0, 0))
        self.assertEqual((a[40, 50], a[0, 50], a[40, 0]), (255, 255, 255))

    def test_an_rgba_crop_keeps_its_box_untrimmed(self):
        a = self.alpha("corner.png")
        self.assertEqual(a.shape, (100, 100))
        self.assertEqual((a[5, 5], a[50, 50]), (0, 255))

    def test_alpha_floor_on_a_whole_image_drops_the_halo_and_trims(self):
        a = self.alpha("glow.png")
        self.assertEqual(a.shape, (20, 20))
        self.assertTrue((a == 255).all())

    def test_a_variable_font_is_instanced_at_wght_then_subset(self):
        from fontTools.ttLib import TTFont

        font = TTFont(str(self.web / "hud.woff2"))
        self.assertEqual(font.flavor, "woff2")
        self.assertNotIn("fvar", font)
        self.assertNotIn("gvar", font)
        # wght 700 is 60% of the way from 400 to 900: A is 400 + 120 units wide
        self.assertEqual(font["hmtx"]["A"][0], 620)
        font["glyf"]["A"].recalcBounds(font["glyf"])
        self.assertEqual(font["glyf"]["A"].xMax, 570)
        self.assertEqual(set(font.getBestCmap()), {65, 66})
        self.assertIn("hud.woff2", self.out)


@unittest.skipUnless(playable.HAS_FFMPEG, "ffmpeg is required")
class AudioGainTests(unittest.TestCase):
    def test_gain_db_scales_the_take(self):
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp)
        write_wav(tmp / "assets" / "raw" / "hit.wav", 1.0, peak=0.5)
        manifest = {"audio": [{"name": "hit", "src": "assets/raw/hit.wav", "gain_db": -12}]}
        (tmp / "assets" / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        playable.run(PREP, tmp)
        self.assertAlmostEqual(peak(tmp / "assets" / "web" / "hit.mp3"), 0.5 * 10 ** (-12 / 20), delta=0.03)


if __name__ == "__main__":
    unittest.main()
