import io
import json
import pathlib
import re
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout

SCRIPTS = (
    pathlib.Path(__file__).resolve().parents[2] / "skills" / "scenario-comic-creator" / "scripts"
)
sys.path.insert(0, str(SCRIPTS))

import build_book  # noqa: E402

from PIL import Image  # noqa: E402


def make_book(root, sizes=((200, 300), (200, 300), (220, 320)), alpha_on=None):
    pages_dir = root / "pages"
    pages_dir.mkdir()
    entries = []
    for index, size in enumerate(sizes, start=1):
        mode = "RGBA" if alpha_on == index else "RGB"
        color = (index * 60, 80, 120) + ((128,) if mode == "RGBA" else ())
        path = pages_dir / f"{index:03d}.png"
        Image.new(mode, size, color).save(path)
        entries.append(
            {
                "page": index,
                "file": f"pages/{index:03d}.png",
                "asset_id": f"asset_{index}",
                "sha256": build_book.file_sha256(path),
            }
        )
    manifest = {"title": "Test Book", "trim_mm": [170, 240], "pages": entries}
    manifest_path = root / "manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    return manifest_path


def run(argv):
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        code = build_book.main(argv)
    return code, out.getvalue(), err.getvalue()


class CheckTests(unittest.TestCase):
    def test_sound_manifest_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest = make_book(pathlib.Path(tmp))
            code, out, _ = run(["check", str(manifest)])
            self.assertEqual(code, 0)
            self.assertIn("ok: 3 pages", out)

    def test_changed_file_fails_the_hash(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            manifest = make_book(root)
            Image.new("RGB", (200, 300), (1, 2, 3)).save(root / "pages" / "002.png")
            code, _, err = run(["check", str(manifest)])
            self.assertEqual(code, 1)
            self.assertIn("page 2", err)
            self.assertIn("sha256", err)

    def test_missing_file_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            manifest = make_book(root)
            (root / "pages" / "003.png").unlink()
            code, _, err = run(["check", str(manifest)])
            self.assertEqual(code, 1)
            self.assertIn("page 3", err)
            self.assertIn("missing", err)

    def test_pages_out_of_order_fail(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            manifest_path = make_book(root)
            data = json.loads(manifest_path.read_text())
            data["pages"].reverse()
            manifest_path.write_text(json.dumps(data))
            code, _, err = run(["check", str(manifest_path)])
            self.assertEqual(code, 1)
            self.assertIn("ascending", err)

    def test_empty_manifest_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "manifest.json"
            path.write_text(json.dumps({"pages": []}))
            code, _, err = run(["check", str(path)])
            self.assertEqual(code, 2)
            self.assertIn("non-empty", err)


class BuildTests(unittest.TestCase):
    def test_pdf_has_one_page_per_entry_and_no_lossy_recompression(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            manifest = make_book(root)
            pdf = root / "book.pdf"
            code, out, _ = run(["build", str(manifest), "--pdf", str(pdf)])
            self.assertEqual(code, 0, out)
            data = pdf.read_bytes()
            self.assertEqual(len(re.findall(rb"/Type\s*/Page\b", data)), 3)
            self.assertNotIn(b"/DCTDecode", data)

    def test_trim_sets_the_page_size(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            manifest = make_book(root)
            pdf = root / "book.pdf"
            run(["build", str(manifest), "--pdf", str(pdf)])
            boxes = re.findall(rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]", pdf.read_bytes())
            self.assertTrue(boxes)
            width, height = (float(v) for v in boxes[0])
            self.assertAlmostEqual(width, 170 / 25.4 * 72, delta=0.5)
            self.assertAlmostEqual(height, 240 / 25.4 * 72, delta=0.5)

    def test_build_refuses_a_tampered_page(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            manifest = make_book(root)
            Image.new("RGB", (200, 300), (9, 9, 9)).save(root / "pages" / "001.png")
            pdf = root / "book.pdf"
            code, _, err = run(["build", str(manifest), "--pdf", str(pdf)])
            self.assertEqual(code, 1)
            self.assertFalse(pdf.exists())
            self.assertIn("sha256", err)

    def test_transparency_is_flattened_and_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            manifest = make_book(root, alpha_on=2)
            pdf = root / "book.pdf"
            code, out, _ = run(["build", str(manifest), "--pdf", str(pdf)])
            self.assertEqual(code, 0)
            self.assertIn("flattened transparency", out)
            self.assertIn("[2]", out)

    def test_contact_sheet_is_written_within_width(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            manifest = make_book(root)
            sheet = root / "sheet.png"
            code, _, _ = run(
                ["build", str(manifest), "--pdf", str(root / "b.pdf"), "--contact-sheet", str(sheet)]
            )
            self.assertEqual(code, 0)
            with Image.open(sheet) as image:
                self.assertLessEqual(image.width, build_book.CONTACT_SHEET_MAX_WIDTH)
                self.assertGreater(image.height, 0)


class HashTests(unittest.TestCase):
    def test_hash_prints_one_line_per_page(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest = make_book(pathlib.Path(tmp))
            code, out, _ = run(["hash", str(manifest)])
            self.assertEqual(code, 0)
            lines = out.strip().splitlines()
            self.assertEqual(len(lines), 3)
            self.assertTrue(lines[0].startswith("1\t"))


class LightPdfTests(unittest.TestCase):
    def _noisy_book(self, root):
        import random

        random.seed(7)
        pages = root / "pages"
        pages.mkdir()
        entries = []
        for index in (1, 2):
            image = Image.effect_noise((1200, 1600), 80).convert("RGB")
            path = pages / f"{index:03d}.png"
            image.save(path)
            entries.append({"page": index, "file": f"pages/{index:03d}.png"})
        manifest = root / "manifest.json"
        manifest.write_text(json.dumps({"title": "Noisy", "trim_mm": [170, 240], "pages": entries}))
        return manifest

    def test_light_pdf_is_smaller_and_has_the_same_page_count(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            manifest = self._noisy_book(root)
            full, light = root / "full.pdf", root / "light.pdf"
            code, out, _ = run(
                ["build", str(manifest), "--pdf", str(full), "--light-pdf", str(light),
                 "--light-max-edge", "600"]
            )
            self.assertEqual(code, 0, out)
            self.assertLess(light.stat().st_size, full.stat().st_size / 2)
            self.assertEqual(len(re.findall(rb"/Type\s*/Page\b", light.read_bytes())), 2)
            self.assertIn("re-encoded proof copy", out)


    def test_light_and_lossless_pdfs_share_page_sizes_without_a_trim(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            manifest = self._noisy_book(root)
            data = json.loads(manifest.read_text())
            data.pop("trim_mm")
            manifest.write_text(json.dumps(data))
            full, light = root / "full.pdf", root / "light.pdf"
            code, out, _ = run(
                ["build", str(manifest), "--pdf", str(full), "--light-pdf", str(light),
                 "--light-max-edge", "600"]
            )
            self.assertEqual(code, 0, out)
            pattern = rb"/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]"
            full_boxes = re.findall(pattern, full.read_bytes())
            light_boxes = re.findall(pattern, light.read_bytes())
            self.assertEqual(len(full_boxes), 2)
            self.assertEqual(len(light_boxes), 2)
            for a, b in zip(full_boxes, light_boxes):
                self.assertAlmostEqual(float(a[0]), float(b[0]), delta=0.5)
                self.assertAlmostEqual(float(a[1]), float(b[1]), delta=0.5)
            self.assertAlmostEqual(float(full_boxes[0][0]), 1200 / 300 * 72, delta=0.5)


class SheetAndColumnsTests(unittest.TestCase):
    def test_sheet_command_labels_any_images_without_a_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            paths = []
            for name, size in (("dir_a", (300, 400)), ("dir_b", (300, 400)), ("dir_c", (300, 400))):
                path = root / f"{name}.png"
                Image.new("RGB", size, (200, 100, 50)).save(path)
                paths.append(str(path))
            out_file = root / "sheet.png"
            code, out, _ = run(["sheet", "--out", str(out_file), "--columns", "3", *paths])
            self.assertEqual(code, 0)
            with Image.open(out_file) as image:
                self.assertEqual(image.width, build_book.CONTACT_SHEET_MAX_WIDTH)
                self.assertLess(image.height, 900)

    def test_sheet_reports_missing_files(self):
        code, _, err = run(["sheet", "--out", "/tmp/never.png", "/no/such/file.png"])
        self.assertEqual(code, 1)
        self.assertIn("missing files", err)

    def test_columns_changes_the_grid(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            manifest = make_book(root, sizes=((200, 300),) * 4)
            wide, tall = root / "wide.png", root / "tall.png"
            run(["build", str(manifest), "--pdf", str(root / "a.pdf"), "--contact-sheet", str(wide), "--columns", "4"])
            run(["build", str(manifest), "--pdf", str(root / "b.pdf"), "--contact-sheet", str(tall), "--columns", "1"])
            with Image.open(wide) as a, Image.open(tall) as b:
                self.assertGreater(b.height, a.height * 2)


class HashWriteTests(unittest.TestCase):
    def test_write_fills_only_missing_hashes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            manifest = make_book(root)
            data = json.loads(manifest.read_text())
            original = data["pages"][0]["sha256"]
            data["pages"][0]["sha256"] = "kept-as-is"
            del data["pages"][1]["sha256"]
            manifest.write_text(json.dumps(data))
            code, out, _ = run(["hash", str(manifest), "--write"])
            self.assertEqual(code, 0)
            self.assertIn("filled 1 missing", out)
            after = json.loads(manifest.read_text())
            self.assertEqual(after["pages"][0]["sha256"], "kept-as-is")
            self.assertEqual(
                after["pages"][1]["sha256"], build_book.file_sha256(root / "pages" / "002.png")
            )
            self.assertNotEqual(after["pages"][0]["sha256"], original)


class GrayscaleTests(unittest.TestCase):
    def test_grayscale_shrinks_a_black_and_white_book_and_embeds_one_channel(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            pages = root / "pages"
            pages.mkdir()
            entries = []
            for index in (0, 1):
                gray = Image.effect_noise((800, 1100), 60)
                path = pages / f"{index:03d}.png"
                gray.convert("RGB").save(path)
                entries.append({"page": index, "file": f"pages/{index:03d}.png"})
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps({"title": "BW", "pages": entries}))
            color_pdf, gray_pdf = root / "c.pdf", root / "g.pdf"
            self.assertEqual(run(["build", str(manifest), "--pdf", str(color_pdf)])[0], 0)
            code, out, _ = run(["build", str(manifest), "--pdf", str(gray_pdf), "--grayscale"])
            self.assertEqual(code, 0, out)
            self.assertLess(gray_pdf.stat().st_size, color_pdf.stat().st_size * 0.6)
            self.assertIn(b"/DeviceGray", gray_pdf.read_bytes())

    def test_page_zero_is_a_valid_cover_number(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            manifest = make_book(root)
            data = json.loads(manifest.read_text())
            for entry in data["pages"]:
                entry["page"] -= 1
                entry.pop("sha256")
            manifest.write_text(json.dumps(data))
            code, out, _ = run(["check", str(manifest)])
            self.assertEqual(code, 0, out)


if __name__ == "__main__":
    unittest.main()
