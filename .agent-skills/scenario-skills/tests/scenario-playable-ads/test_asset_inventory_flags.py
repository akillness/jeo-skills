"""asset_inventory.py's per-kind measurements and flags, called in-process on files made for each case."""

import contextlib
import importlib.util
import io
import json
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
import unittest.mock as mock

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import playable  # noqa: E402
from test_asset_inventory import patch_glb, write_wav  # noqa: E402
from test_pack_glb import box_glb  # noqa: E402


def load_inventory():
    spec = importlib.util.spec_from_file_location("playable_asset_inventory", playable.SCRIPTS / "asset_inventory.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


inv = load_inventory()


def psd(path, w=160, h=140):
    """A minimal flattened RGB Photoshop file: header, empty sections, raw planes."""
    head = b"8BPS" + struct.pack(">H6xHIIHH", 1, 3, h, w, 8, 3) + struct.pack(">III", 0, 0, 0)
    planes = b"".join(bytes([v]) * (w * h) for v in (200, 120, 40))
    path.write_bytes(head + struct.pack(">H", 0) + planes)


def no_embedding_font(path):
    """The bundled OFL face with its OS/2 fsType set to restricted license embedding."""
    from fontTools.ttLib import TTFont

    font = TTFont(str(playable.FONT))
    font["OS/2"].fsType = 0x0002
    font.flavor = None
    font.save(str(path))


def flags(row):
    return " | ".join(row["flags"])


class ImageRowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)

    def row(self, name):
        r = {"flags": []}
        inv.image_row(self.tmp / name, r)
        return r

    def test_an_animated_gif_asks_for_frames_or_a_sheet(self):
        frames = [Image.new("RGB", (200, 200), c) for c in ((255, 0, 0), (0, 255, 0), (0, 0, 255))]
        frames[0].save(self.tmp / "anim.gif", save_all=True, append_images=frames[1:], duration=100)
        r = self.row("anim.gif")
        self.assertEqual(r["frames"], 3)
        self.assertIn("3 frames in one file", flags(r))

    def test_size_extremes_are_flagged(self):
        Image.new("RGB", (4200, 16), (10, 10, 10)).save(self.tmp / "wide.png")
        Image.new("RGB", (64, 64), (10, 10, 10)).save(self.tmp / "icon.png")
        self.assertIn("over 4096 px", flags(self.row("wide.png")))
        icon = self.row("icon.png")
        self.assertIn("under 128 px", flags(icon))
        self.assertNotIn("over 4096", flags(icon))

    def test_a_psd_is_read_flattened(self):
        psd(self.tmp / "layers.psd")
        r = self.row("layers.psd")
        self.assertEqual((r["width"], r["height"], r["alpha"]), (160, 140, False))
        self.assertEqual(r["colors"][0], "#c87828")
        self.assertIn("PSD read flattened", flags(r))
        self.assertGreater(r["web_bytes"], 0)

    def test_a_single_sprite_is_not_flagged_as_a_sheet(self):
        a = np.zeros((300, 300, 4), np.uint8)
        a[50:250, 50:250] = (20, 200, 90, 255)
        Image.fromarray(a, "RGBA").save(self.tmp / "one.png")
        r = self.row("one.png")
        self.assertEqual((r["alpha"], r["sprites"]), (True, 1))
        self.assertAlmostEqual(r["transparent_share"], 1 - (200 * 200) / (300 * 300), places=3)
        self.assertEqual(r["flags"], [])


class VideoRowTests(unittest.TestCase):
    def row(self, info):
        r = {"flags": []}
        inv.video_row(Path("clip.mp4"), r, info)
        return r

    def test_reads_size_rate_and_sound_from_the_probe(self):
        info = {"streams": [{"codec_type": "video", "width": 1080, "height": 1920, "r_frame_rate": "30000/1001"},
                            {"codec_type": "audio"}], "format": {"duration": "12.345"}}
        r = self.row(info)
        self.assertEqual((r["width"], r["height"], r["fps"], r["duration_s"], r["sound"]),
                         (1080, 1920, 29.97, 12.35, True))
        self.assertIn("never inlined", flags(r))

    def test_a_silent_clip_and_an_unknown_rate(self):
        r = self.row({"streams": [{"codec_type": "video", "r_frame_rate": "0/0"}], "format": {}})
        self.assertEqual((r["fps"], r["duration_s"], r["sound"], r["width"]), (None, 0, False, None))
        self.assertEqual(self.row({})["fps"], 0)


class GlbRowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        self.glb = self.tmp / "pod.glb"
        box_glb(self.glb)

    def row(self):
        r = {"flags": []}
        inv.glb_row(self.glb, r)
        return r

    def test_draco_parts_and_heavy_meshes_are_flagged(self):
        patch_glb(self.glb, extensionsUsed=["KHR_draco_mesh_compression"],
                  accessors=[{"bufferView": 0, "componentType": 5126, "count": 70_000, "type": "VEC3"},
                             {"bufferView": 1, "componentType": 5126, "count": 8, "type": "VEC2"},
                             {"bufferView": 2, "componentType": 5123, "count": 36, "type": "SCALAR"}],
                  meshes=[{"primitives": [{"attributes": {"POSITION": 0}}, {"attributes": {"POSITION": 0}}]}])
        r = self.row()
        self.assertEqual((r["draco"], r["vertices"]), (True, 140_000))
        self.assertEqual(r["web_bytes"], 140_000 * 22 + 40_000)
        f = flags(r)
        self.assertIn("Draco-compressed", f)
        self.assertIn("2 mesh parts", f)
        self.assertIn("140000 vertices", f)

    def test_node_animation_without_a_skin_plays_as_rigid_parts(self):
        patch_glb(self.glb, animations=[{"channels": [{"target": {"node": 0, "path": "rotation"}}]}])
        r = self.row()
        self.assertEqual((r["skinned"], r["clips"]), (False, ["clip 0"]))
        self.assertIn("node animation only", flags(r))

    def test_morph_weights_alone_are_not_rigid_part_animation(self):
        patch_glb(self.glb, animations=[{"name": "blink", "channels": [{"target": {"path": "weights"}}]}])
        self.assertEqual(self.row()["flags"], [])

    def test_a_file_that_is_not_binary_gltf(self):
        self.glb.write_bytes(b"glTF")
        self.assertEqual(self.row()["flags"], ["not a binary glTF"])
        self.glb.write_bytes(b"PK\x03\x04" + b"\0" * 40)
        self.assertEqual(self.row()["flags"], ["not a binary glTF"])


class FontRowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)

    def test_a_font_that_forbids_embedding(self):
        no_embedding_font(self.tmp / "Locked.ttf")
        r = {"flags": []}
        inv.font_row(self.tmp / "Locked.ttf", r)
        self.assertFalse(r["embeddable"])
        self.assertIn("forbids embedding", flags(r))
        self.assertEqual(r["web_bytes"], 20_000)

    def test_an_unreadable_font_is_a_flag(self):
        (self.tmp / "Broken.otf").write_bytes(b"\0\1\0\0garbage")
        r = {"flags": []}
        inv.font_row(self.tmp / "Broken.otf", r)
        self.assertTrue(r["flags"][0].startswith("unreadable font ("), r["flags"])


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)
        self.src = self.tmp / "intake" / "assets"
        self.src.mkdir(parents=True)

    def rows(self):
        return {Path(r["file"]).name: r for r in inv.catalog(self.tmp, self.src)}

    def test_files_that_cannot_go_in_as_they_are(self):
        (self.src / "scene.gltf").write_text("{}", encoding="utf-8")
        (self.src / "hero.fbx").write_bytes(b"FBX binary")
        (self.src / "logo.svg").write_text("<svg/>", encoding="utf-8")
        (self.src / "broken.png").write_bytes(b"\x89PNG not really")
        (self.src / ".DS_Store").write_bytes(b"\0")
        rows = self.rows()
        self.assertEqual(sorted(rows), ["broken.png", "hero.fbx", "logo.svg", "scene.gltf"])
        self.assertEqual((rows["scene.gltf"]["kind"], rows["scene.gltf"]["usable"]), ("3d", True))
        self.assertIn("export one .glb", flags(rows["scene.gltf"]))
        self.assertEqual(rows["hero.fbx"]["kind"], "3d")
        self.assertIn(".fbx cannot be packed", flags(rows["hero.fbx"]))
        self.assertEqual(rows["logo.svg"]["kind"], "image")
        self.assertIn("vector or print file", flags(rows["logo.svg"]))
        broken = rows["broken.png"]
        self.assertEqual(broken["kind"], "image")
        self.assertTrue(broken["flags"][0].startswith("could not read (UnidentifiedImageError"), broken["flags"])
        self.assertFalse(broken["usable"])

    @unittest.skipUnless(playable.HAS_FFMPEG, "ffmpeg is required")
    def test_audio_flags_from_ffmpeg_measurements(self):
        write_wav(self.src / "tick.wav", 1.0, peak=0.005)
        write_wav(self.src / "ambience.wav", 61.0, peak=0.3, rate=8000)
        (self.src / "noise.wav").write_bytes(b"RIFF\0\0\0\0WAVEjunk")
        rows = self.rows()
        tick = rows["tick.wav"]
        self.assertLess(tick["mean_db"], -35)
        self.assertIn("quiet effect", flags(tick))
        self.assertNotIn("loop_seam", tick)
        amb = rows["ambience.wav"]
        self.assertIn("61 s long", flags(amb))
        self.assertEqual(amb["web_bytes"], int(61.0 * 64 * 1000 / 8))
        self.assertIn(amb["loop_seam"], ("clean", "audible"))
        self.assertEqual(rows["noise.wav"]["flags"], ["unreadable by ffmpeg"])
        self.assertFalse(rows["noise.wav"]["usable"])

    @unittest.skipUnless(playable.HAS_FFMPEG, "ffmpeg is required")
    def test_a_video_is_reference_footage(self):
        subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=96x64:rate=12:duration=1",
                        "-pix_fmt", "yuv420p", str(self.src / "gameplay.mp4")], check=True)
        r = self.rows()["gameplay.mp4"]
        self.assertEqual((r["kind"], r["width"], r["height"], r["fps"], r["sound"]), ("video", 96, 64, 12.0, False))
        self.assertAlmostEqual(r["duration_s"], 1.0, delta=0.1)
        self.assertTrue(r["usable"])

    def test_main_writes_both_reports_for_a_mixed_folder(self):
        Image.new("RGB", (64, 64), (0, 0, 0)).save(self.src / "tiny.png")
        (self.src / "scene.gltf").write_text("{}", encoding="utf-8")
        with (mock.patch.object(sys, "argv", ["asset_inventory.py", str(self.tmp)]),
              contextlib.redirect_stdout(io.StringIO()) as out):
            inv.main()
        data = json.loads((self.tmp / "analysis" / "assets_inventory.json").read_text(encoding="utf-8"))
        self.assertEqual(data["by_kind"], {"image": 1, "3d": 1})
        md = (self.tmp / "analysis" / "assets_inventory.md").read_text(encoding="utf-8")
        self.assertIn(f"| `{Path('intake/assets/tiny.png')}` | image | width 64, height 64", md)
        self.assertIn("under 128 px", out.getvalue())


if __name__ == "__main__":
    unittest.main()
