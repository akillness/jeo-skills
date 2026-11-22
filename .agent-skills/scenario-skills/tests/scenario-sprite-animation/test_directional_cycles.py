import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

SCRIPTS = Path(__file__).resolve().parents[2] / "skills/scenario-sprite-animation/scripts"


def load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


frames = load("cycle_frames")
prompts = load("cycle_prompts")
sheets = load("cycle_sheets")

MAGENTA = (255, 0, 255)


def figure(w=20, h=40, color=(200, 200, 210)):
    """A tiny transparent 'character': body plus a darker head."""
    im = Image.new("RGBA", (w + 8, h + 8), (0, 0, 0, 0))
    a = np.array(im)
    a[4:4 + h, 4:4 + w] = (*color, 255)
    a[4:12, 8:8 + w - 8] = (90, 60, 40, 255)
    return Image.fromarray(a)


def write_walk(path, period, n=72, body=(180, 170, 150)):
    """A 480 px magenta clip of a figure bobbing with swinging legs, looping every period frames."""
    raw = bytearray()
    for i in range(n):
        a = np.zeros((480, 480, 3), np.uint8)
        a[:] = MAGENTA
        bob = int(6 * np.sin(2 * np.pi * i / period))
        a[150 + bob:390, 200:280] = body                                # body
        leg = int(25 * np.sin(2 * np.pi * i / period))
        a[330:394, 205 + leg:225 + leg] = (60, 50, 40)                  # legs swing
        a[330:394, 255 - leg:275 - leg] = (60, 50, 40)
        raw += a.tobytes()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "480x480",
                    "-r", "24", "-i", "-", "-pix_fmt", "yuv444p", "-crf", "8", str(path)],
                   input=bytes(raw), check=True)


class FirstFrameTests(unittest.TestCase):
    def test_small_pixel_art_scales_by_a_whole_number_onto_the_baseline(self):
        out, notes, hits = frames.first_frames(figure(), ["se"])
        a = np.array(out["se"])
        ys, xs = np.where((a != MAGENTA).any(-1))
        h = ys.max() - ys.min() + 1
        self.assertEqual(h % 40, 0)                       # 40 px art, integer scale
        self.assertIn("nearest", notes["se"])
        self.assertEqual(ys.max() + 1, int(960 * 0.82))   # feet on the baseline
        self.assertLessEqual(abs((xs.min() + xs.max()) / 2 - 480), 1)
        self.assertEqual(hits["magenta"], 0.0)

    def test_white_on_white_survives_and_trapped_backdrop_is_removed(self):
        # white backdrop, a figure with a white chest plate (enclosed by gray) and a
        # hole of pure backdrop between an arm and the body
        a = np.full((300, 200, 3), 255, np.uint8)
        a[40:260, 60:140] = (120, 120, 130)          # body
        a[80:140, 80:120] = (250, 250, 250)          # near-white plate, inside the body
        a[40:260, 140:170] = (120, 120, 130)         # arm
        a[100:200, 136:144] = 255                    # trapped backdrop gap (exact backdrop color)
        a[100:200, 140:150] = 255
        fg, near = frames.foreground(Image.fromarray(a))
        self.assertTrue(fg[110, 100])                # the plate stays in
        self.assertFalse(fg[150, 145])               # the gap is background
        self.assertFalse(fg[5, 5])

    def test_key_check_flags_a_character_that_contains_the_key_color(self):
        im = figure(color=(230, 30, 220))            # a pink-magenta body
        out, notes, hits = frames.first_frames(im, ["se"])
        self.assertGreater(hits["magenta"], 0.5)
        self.assertLess(hits["blue"], 0.01)

    def test_pose_sheet_splits_into_one_frame_per_facing(self):
        sheet = Image.new("RGB", (400, 200), MAGENTA)
        sheet.paste(figure().convert("RGB"), (60, 60), figure())
        sheet.paste(figure(color=(50, 90, 200)).convert("RGB"), (260, 60), figure())
        out, _, _ = frames.first_frames(sheet, ["se", "ne"], nearest=False)
        self.assertEqual(set(out), {"se", "ne"})
        se, ne = np.array(out["se"]), np.array(out["ne"])
        self.assertTrue(((se == [200, 200, 210]).all(-1)).any())
        self.assertTrue(((ne == [50, 90, 200]).all(-1)).any())


    def test_pose_sheet_splits_at_the_gaps_not_equal_columns(self):
        # five facings where the long side view crosses the equal-column borders, plus a loose spark
        sheet = np.zeros((200, 1000, 3), np.uint8)
        sheet[:] = MAGENTA
        spans = [(20, 120), (160, 250), (290, 590), (640, 740), (800, 900)]
        for i, (x0, x1) in enumerate(spans):
            sheet[40:180, x0:x1] = (40 + 40 * i, 90, 160)
        sheet[30:34, 596:600] = (250, 200, 60)                     # a spark just right of the long figure
        fg, _ = frames.foreground(Image.fromarray(sheet))
        got = frames.figure_spans(fg, 5)
        self.assertEqual(len(got), 5)
        for (x0, x1), (g0, g1) in zip(spans, got):
            self.assertLessEqual(g0, x0)
            self.assertGreaterEqual(g1, x1)
        self.assertGreaterEqual(got[2][1], 600)                    # the spark joined its figure

    def test_touching_figures_fall_back_to_equal_columns(self):
        fg = np.zeros((50, 100), bool)
        fg[10:40, 10:90] = True
        self.assertEqual(frames.figure_spans(fg, 2), [(0, 50), (50, 100)])


class PromptTests(unittest.TestCase):
    def cast(self, **kw):
        base = {"heroes": {"k": {"character": "a knight", "who": "knight", "pronoun": "He"}}}
        base.update(kw)
        return base

    def test_no_model_ids_or_schema_field_names(self):
        out = prompts.build(self.cast())
        for r in out["stills"] + out["clips"]:
            self.assertNotIn("model", r)
            for field in ("startImage", "endImage", "referenceImages", "numOutputs"):
                self.assertNotIn(field, r)

    def test_anchor_rules_per_cycle_and_facing(self):
        c = {x["id"]: x for x in prompts.build(self.cast())["clips"]}
        self.assertIsNone(c["k_se_walk"]["last_frame"])            # locomotion: free end
        self.assertIsNone(c["k_se_run"]["last_frame"])
        self.assertEqual(c["k_se_idle"]["last_frame"], c["k_se_idle"]["first_frame"])
        self.assertEqual(c["k_se_attack"]["last_frame"], c["k_se_attack"]["first_frame"])
        back = c["k_ne_run"]                                       # back view: pinned and longer
        self.assertEqual(back["last_frame"], back["first_frame"])
        self.assertEqual(back["duration_s"], 5)
        self.assertIn("runs away from the viewer", back["prompt"])

    def test_straight_front_and_back_locomotion_pins_the_end_on_a_long_clip(self):
        c = {x["id"]: x for x in prompts.build(self.cast(facings=["s", "se", "e", "ne", "n"]))["clips"]}
        for cid in ("k_s_walk", "k_s_run", "k_n_walk", "k_n_run"):
            self.assertEqual(c[cid]["last_frame"], c[cid]["first_frame"], cid)
            self.assertEqual(c[cid]["duration_s"], 5, cid)
        self.assertIn("never comes closer", c["k_s_walk"]["prompt"])
        self.assertIn("coming closer", c["k_s_run"]["negative_prompt"])
        for cid in ("k_se_walk", "k_e_run"):
            self.assertIsNone(c[cid]["last_frame"], cid)
            self.assertEqual(c[cid]["duration_s"], 3, cid)

    def test_gait_overrides_replace_the_two_legged_wording(self):
        cast = self.cast(facings=["se", "ne"])
        cast["heroes"]["k"].update(walk_motion="four legs in a diagonal gait, tail swaying",
                                   run_motion="a bounding gallop, wings tucked")
        c = {x["id"]: x for x in prompts.build(cast)["clips"]}
        self.assertIn("four legs in a diagonal gait", c["k_se_walk"]["prompt"])
        self.assertIn("a bounding gallop", c["k_ne_run"]["prompt"])
        for x in c.values():
            self.assertNotIn("arms pumping", x["prompt"])
            self.assertNotIn("arms swing", x["prompt"])

    def test_negative_prompt_never_bans_the_requested_angle(self):
        c = prompts.build(self.cast(facings=["e", "s"], camera="side"))["clips"]
        side = next(x for x in c if x["id"] == "k_e_walk")
        self.assertIn("flat side-on profile", side["prompt"])
        self.assertNotIn("profile view", side["negative_prompt"])
        front = next(x for x in c if x["id"] == "k_s_walk")
        self.assertIn("side view", front["negative_prompt"])

    def test_pose_sheet_for_text_heroes_turnarounds_for_own_art(self):
        out = prompts.build(self.cast())
        self.assertEqual([s["kind"] for s in out["stills"]], ["pose-sheet"])
        own = prompts.build({"facings": ["se", "sw", "ne", "nw"], "heroes": {"p": {
            "pronoun": "He", "notes": "He holds the sword in his right hand.", "first_frames": {"sw": "asset_A"}}}})
        turns = {s["facing"]: s for s in own["stills"]}
        self.assertEqual(set(turns), {"se", "ne", "nw"})
        self.assertEqual(turns["se"]["reference_images"], ["asset_A"])
        self.assertIn("right hand is on the left side", turns["se"]["prompt"])
        self.assertEqual(own["notes"], [])                         # nothing mirrored

    def test_right_hand_table_matches_the_geometry(self):
        # world x east, y south (screen-down is toward the viewer); the right hand points
        # 90 degrees clockwise from the facing seen from above
        facing = {"se": (1, 1), "sw": (-1, 1), "ne": (1, -1), "nw": (-1, -1),
                  "e": (1, 0), "w": (-1, 0), "s": (0, 1), "n": (0, -1)}
        for f, (x, y) in facing.items():
            rx, ry = -y, x
            text = prompts.RIGHT_SIDE[f]
            if rx:
                self.assertIn("left side" if rx < 0 else "right side", text, f)
            if ry:
                self.assertIn("nearer" if ry > 0 else "farther", text, f)

    def test_reference_art_that_is_not_a_facing(self):
        out = prompts.build({"facings": ["e"], "heroes": {"b": {"reference": "asset_R"}}})
        self.assertEqual(out["stills"][0]["facing"], "e")
        self.assertEqual(out["stills"][0]["reference_images"], ["asset_R"])

    def test_hd_heroes_are_not_asked_for_pixel_art(self):
        out = prompts.build(self.cast(key="blue", heroes={"b": {"who": "golem", "pixel": False, "reference": "asset_R"}}))
        for c in out["clips"]:
            self.assertNotIn("pixel art", c["prompt"].lower())
            self.assertIn("blue background", c["prompt"])


class SheetTests(unittest.TestCase):
    def test_key_removes_each_field_and_keeps_the_figure(self):
        for name, rgb in (("magenta", MAGENTA), ("green", (0, 255, 0)), ("blue", (0, 0, 255))):
            sheets.KEY = name
            f = np.zeros((10, 10, 3), np.uint8)
            f[:] = rgb
            f[3:7, 3:7] = (150, 140, 120)
            a = sheets.key(f)[..., 3]
            self.assertEqual(a[0, 0], 0, name)
            self.assertEqual(a[5, 5], 255, name)
        sheets.KEY = "magenta"

    def test_loop_window_finds_the_period_of_a_cycle(self):
        n, period = 72, 16
        seq = []
        for i in range(n):
            rgb = np.zeros((120, 120, 3), np.float32)
            # a circular path: every phase of the cycle is a distinct pose, as in a real walk
            x = int(45 + 25 * np.cos(2 * np.pi * i / period))
            y = int(40 + 20 * np.sin(2 * np.pi * i / period))
            rgb[y:y + 40, x:x + 20] = 200
            alpha = (rgb[..., 0] > 0).astype(np.float32)
            seq.append((rgb, alpha))
        score, s, P, seam, base = sheets.loop_window(seq, 8, 24)
        self.assertEqual(P % period, 0)
        self.assertLess(score, 0.2)

    def test_crop_past_the_frame_edge_pads_instead_of_wrapping(self):
        f = np.full((10, 10, 4), 255, np.uint8)
        out = sheets.crop_padded(f, (-3, -2, 5, 6))
        self.assertEqual(out.shape, (8, 8, 4))
        self.assertEqual(out[0, 0, 3], 0)
        self.assertEqual(out[4, 4, 3], 255)

    def test_a_figure_that_grows_during_a_walk_is_flagged(self):
        seq = []
        for i in range(60):
            a = np.zeros((240, 240, 3), np.uint8)
            a[:] = MAGENTA
            a[max(0, 110 - 2 * i):200, 100:140] = (180, 170, 150)   # walks toward the camera: grows
            leg = int(20 * np.cos(2 * np.pi * i / 16))
            a[200:230, 100 + leg:120 + leg] = (60, 50, 40)
            seq.append(a)
        _, info = sheets.pick("t_s_walk", "walk", seq)
        self.assertGreater(info["size_vs_first_frame"], 1.12)

    def test_a_backdrop_that_drifted_off_the_key_is_flagged(self):
        seq = []
        for i in range(60):
            a = np.zeros((240, 240, 3), np.uint8)
            a[:] = (230, 200, 170)                                  # beige: the model repainted the field
            a[60:200, 100:140] = (60, 60, 70)
            leg = int(20 * np.cos(2 * np.pi * i / 16))
            a[200:230, 100 + leg:120 + leg] = (40, 30, 30)
            seq.append(a)
        _, info = sheets.pick("t_e_walk", "walk", seq)
        self.assertGreater(info["opaque_border"], 0.9)
        good = [np.where(f == (230, 200, 170), 0, f) for f in seq]
        for f in good:
            f[(f == 0).all(-1)] = MAGENTA
        _, info = sheets.pick("t_e_walk", "walk", good)
        self.assertEqual(info["opaque_border"], 0.0)

    def test_attack_body_only_drops_a_detached_projectile(self):
        rgba = np.zeros((96, 96, 4), np.uint8)
        rgba[20:90, 20:50] = (40, 90, 160, 255)
        rgba[30:38, 80:88] = (200, 60, 60, 255)
        out = sheets.body_only(rgba)
        self.assertTrue((out[20:90, 20:50, 3] == 255).all())
        self.assertFalse(out[30:38, 80:88, 3].any())
        self.assertIs(sheets.body_only(out), out)

    def test_an_attack_that_never_leaves_rest_samples_the_whole_clip(self):
        still = (np.zeros((120, 120, 3), np.float32), np.ones((120, 120), np.float32))
        s, length, _ = sheets.attack_window([still] * 30)
        self.assertEqual((s, length), (0, 30))

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "needs ffmpeg")
    def test_each_facing_keeps_its_own_fps(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            (tmp / "clips").mkdir()
            write_walk(tmp / "clips/t_se_walk.mp4", 16)
            write_walk(tmp / "clips/t_ne_walk.mp4", 24, body=(90, 160, 90))
            cast = {"facings": ["se", "ne"], "cycles": ["walk"], "fig_frac": "auto",
                    "heroes": {"t": {"height": 48, "palette": 8}}}
            (tmp / "cast.json").write_text(json.dumps(cast))
            subprocess.run([sys.executable, str(SCRIPTS / "cycle_sheets.py"), str(tmp / "cast.json"),
                            "--clips", str(tmp / "clips"), "--out", str(tmp / "sheets")],
                           check=True, capture_output=True)
            meta = json.loads((tmp / "sheets/meta.json").read_text())["t"]
            self.assertEqual(meta["rows"], ["se", "sw", "ne", "nw"])
            walk = meta["cycles"]["walk"]
            self.assertEqual(walk["fps"], {"se": walk["se"]["fps"], "sw": walk["se"]["fps"],
                                           "ne": walk["ne"]["fps"], "nw": walk["ne"]["fps"]})
            self.assertNotEqual(walk["se"]["fps"], walk["ne"]["fps"])

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "needs ffmpeg")
    def test_end_to_end_walk_clip_to_sheet(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            (tmp / "clips").mkdir()
            period = 18
            write_walk(tmp / "clips/t_se_walk.mp4", period)
            cast = {"facings": ["se"], "cycles": ["walk"], "fig_frac": "auto",
                    "heroes": {"t": {"height": 48, "palette": 8}}}
            (tmp / "cast.json").write_text(json.dumps(cast))
            subprocess.run([sys.executable, str(SCRIPTS / "cycle_sheets.py"), str(tmp / "cast.json"),
                            "--clips", str(tmp / "clips"), "--out", str(tmp / "sheets"), "--gif"],
                           check=True, capture_output=True)
            meta = json.loads((tmp / "sheets/meta.json").read_text())["t"]
            self.assertEqual(meta["rows"], ["se", "sw"])
            loop = meta["cycles"]["walk"]["se"]
            self.assertEqual(loop["length"] % period, 0)
            self.assertLess(loop["seam_over_baseline"], 0.5)
            sheet = Image.open(tmp / "sheets/t_walk.png")
            cw, ch = meta["cell"]
            self.assertEqual(sheet.size, (cw * 8, ch * 2))
            self.assertTrue(48 <= ch <= 58, ch)                             # 48 px figure, bob range, padding
            a = np.array(sheet)
            np.testing.assert_array_equal(a[ch:, :cw], a[:ch, :cw][:, ::-1])  # SW is the SE mirror
            self.assertTrue((tmp / "sheets/t_walk_preview.gif").exists())


if __name__ == "__main__":
    unittest.main()
