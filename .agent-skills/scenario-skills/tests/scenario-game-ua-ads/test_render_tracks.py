"""render_tracks.py: frame timing, crop boxes, alpha, fresh renders, safe zone, and element geometry."""

import json
import math
import shutil
import tempfile
import unittest
from fractions import Fraction
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import helpers

rt = helpers.load("render_tracks")

CANVAS = [240, 400]
ZONE = {"top": 40, "bottom": 360, "left": 10, "right": 230, "text_right": 200}


def red_tip_hand(path):
    """A 100 px glove stand-in: white disc with a red marker at its fingertip (30, 20)."""
    im = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([10, 10, 90, 90], fill=(255, 255, 255, 255))
    d.rectangle([29, 19, 31, 21], fill=(255, 0, 0, 255))
    im.save(path)


class Case(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)

    def ctx(self, **spec):
        return rt.Ctx({"canvas": CANVAS, "safe_zone": ZONE, **spec}, self.dir)

    def render_cli(self, elements, **spec):
        helpers.write_json(self.dir / "spec.json", {"fps": 30, "canvas": CANVAS, "safe_zone": ZONE, "elements": elements, **spec})
        result = helpers.run("render_tracks.py", self.dir / "spec.json", self.dir / "out")
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads((self.dir / "out/layers.json").read_text())["layers"], result


def drawn(start, end, fps):
    """Frames compose shows for a video layer, as measured: ceil((end - start) * fps) of them from the
    frame holding start, less any before start."""
    start, end = Fraction(str(start)), Fraction(str(end))
    first = math.floor(start * fps)
    return [n for n in range(first, first + math.ceil((end - start) * fps)) if Fraction(n, fps) >= start]


def drawn_on_time(start, end, fps):
    """The same layer where compose shows every frame whose time lies within [start, end], as a newer
    build of its video stack did locally: video_times must hold under both."""
    start, end = Fraction(str(start)), Fraction(str(end))
    return [n for n in range(math.floor(end * fps) + 1) if start <= Fraction(n, fps) <= end]


class TimingTests(unittest.TestCase):
    def test_video_times_match_the_times_compose_showed_frame_exact(self):
        self.assertEqual(rt.video_times(0, 40, 30), (0.0, 1.325))
        self.assertEqual(rt.video_times(30, 70, 30), (0.983, 2.325))
        self.assertEqual(rt.video_times(31, 71, 30), (1.016, 2.358))
        self.assertEqual(rt.video_times(170, 240, 30), (5.65, 7.991))

    def test_video_times_show_every_planned_frame_and_no_other(self):
        for fps in (24, 25, 30, 60):
            for first in range(200):
                for end in (first + 1, first + 2, first + 37, first + 90):
                    times = rt.video_times(first, end, fps)
                    for model in (drawn, drawn_on_time):
                        self.assertEqual(model(*times, fps), list(range(first, end)), (model.__name__, fps, first, end))
        # The times used before: a start rounded down to the millisecond lost the last frame.
        self.assertEqual(drawn(rt.floor_ms(170, 30), rt.end_ms(240, 30), 30), list(range(170, 239)))

    def test_frame_times_floor_to_the_millisecond(self):
        self.assertEqual(rt.floor_ms(185, 30), 6.166)
        self.assertEqual(rt.floor_ms(3, 30), 0.1)
        self.assertEqual(rt.floor_ms(333, 30), 11.1)
        self.assertEqual(rt.floor_ms(450, 30), 15.0)

    def test_ends_sit_half_a_frame_before_the_end_frame(self):
        self.assertEqual(rt.end_ms(156, 30), 5.183)  # 5.2 s exactly would draw the layer on frame 156 too
        self.assertEqual(rt.end_ms(298, 30), 9.916)
        self.assertEqual(rt.end_ms(60, 60), 0.992)


class GeometryTests(Case):
    def test_counter_bump_stays_inside_the_safe_top(self):
        for i in range(2):
            helpers.rect_png(self.dir / f"c{i}.png", CANVAS, (60, 42, 160 + 10 * i, 72), (30, 60, 180, 255))
        el = {"type": "counter", "name": "counter", "values": ["c0.png", "c1.png"], "steps": [3], "start": 0, "end": 10}
        first, frames, meta, warnings = rt.render(el, self.ctx())
        rest_box = rt.union(frames[:3], rt.VISIBLE)
        bump_box = rt.union(frames[3:8], rt.VISIBLE)
        self.assertEqual(warnings, [])
        self.assertEqual(meta["bump_shift"][0], 0)
        self.assertGreater(meta["bump_shift"][1], 0)
        self.assertEqual(meta["bump_needs"], [f"top at y {42 + meta['bump_shift'][1]} or more"])
        self.assertGreaterEqual(bump_box[1], ZONE["top"])
        self.assertGreater(bump_box[2] - bump_box[0], rest_box[2] - rest_box[0])
        self.assertEqual(rt.union(frames[8:], rt.VISIBLE)[1], 42)  # back at rest after 0.15 s
        _, free, _, _ = rt.render({**el, "safe": "none"}, self.ctx())
        self.assertLess(rt.union(free[3:8], rt.VISIBLE)[1], ZONE["top"])

    def test_counter_holds_each_bump_for_0_15_s(self):
        for i in range(2):
            helpers.rect_png(self.dir / f"c{i}.png", CANVAS, (60, 100, 120, 130))
        el = {"type": "counter", "name": "counter", "values": ["c0.png", "c1.png"], "steps": [4], "start": 0, "end": 14}
        _, frames, _, _ = rt.render(el, self.ctx())
        widths = [f[0].width for f in frames]
        self.assertEqual([w > widths[0] for w in widths], [False] * 4 + [True] * 5 + [False] * 5)

    def test_counter_draws_supplied_bump_pngs_as_given(self):
        for i in range(2):
            helpers.rect_png(self.dir / f"c{i}.png", CANVAS, (60, 100, 120, 130), (30, 60, 180, 255))
            helpers.rect_png(self.dir / f"b{i}.png", CANVAS, (56, 97, 124, 133), (255, 255, 255, 255))
        el = {"type": "counter", "name": "counter", "values": ["c0.png", "c1.png"], "bumps": ["b0.png", "b1.png"],
              "steps": [2], "start": 0, "end": 8}
        _, frames, meta, _ = rt.render(el, self.ctx())
        im, offset = frames[2]
        self.assertEqual((offset, im.size), ((56, 97), (68, 36)))
        self.assertEqual(im.getpixel((10, 10)), (255, 255, 255, 255))
        self.assertEqual(meta, {})

    def test_hand_fingertip_lands_on_the_target_while_pressed(self):
        red_tip_hand(self.dir / "hand.png")
        el = {"type": "hand_tap", "name": "tap", "png": "hand.png", "tip": [30, 20], "height": 100, "at": [150, 250],
              "in": 0, "press": 8, "out": 20}
        first, frames, _, _ = rt.render(el, self.ctx())
        for n in (8, 12):  # pressed at 92%, then released on the target
            im, (x, y) = frames[n - first]
            a = np.asarray(im).astype(int)
            ys, xs = np.nonzero((a[..., 0] > 200) & (a[..., 1] < 80) & (a[..., 3] > 200))
            self.assertAlmostEqual(x + xs.mean(), 150, delta=1.5)
            self.assertAlmostEqual(y + ys.mean(), 250, delta=1.5)
        self.assertLess(frames[8][0].width, frames[12][0].width)
        # Squared ramps: 1/3 in on the first frame, (3/5)^3 out two frames into the 5-frame retreat, after the ring.
        self.assertAlmostEqual(np.asarray(frames[0][0])[..., 3].max(), 255 / 9, delta=1)
        self.assertAlmostEqual(np.asarray(frames[17][0])[..., 3].max(), 255 * 0.6 ** 6, delta=1)

    def test_a_press_outside_the_safe_zone_warns_but_the_glove_may_leave_it(self):
        red_tip_hand(self.dir / "hand.png")
        el = {"type": "hand_tap", "name": "tap", "png": "hand.png", "tip": [30, 20], "height": 100, "in": 0, "press": 8,
              "out": 20}
        # Inside the text zone; the glove itself runs past the safe bottom (360) on its approach.
        self.assertEqual(rt.render({**el, "at": [150, 300]}, self.ctx())[3], [])
        # Inside the safe right edge (230) but past the text edge (200), under the right rail.
        _, _, _, warnings = rt.render({**el, "at": [215, 300]}, self.ctx())
        self.assertEqual(warnings, ["tap press on frame 8: reaches x 215, right of the safe edge 200"])
        self.assertEqual(rt.render({**el, "at": [5, 250], "safe": "none"}, self.ctx())[3], [])
        drag = {"type": "hand_drag", "name": "drag", "png": "hand.png", "tip": [30, 20], "height": 100,
                "keys": [[0, 100, 200], [10, 100, 380]], "press": [2, 9]}
        _, _, _, warnings = rt.render(drag, self.ctx())
        self.assertEqual(warnings, ["drag press on frame 9: reaches y 362, below the safe bottom 360"])
        # A held press is checked where it lifts too: dragged from y 200 down to y 362 by frame 9.
        _, _, _, warnings = rt.render({**drag, "press": [[1, 10]]}, self.ctx())
        self.assertEqual(warnings, ["drag press on frame 9: reaches y 362, below the safe bottom 360"])

    def test_label_pulse_pops_in_unless_it_starts_on_frame_0(self):
        helpers.rect_png(self.dir / "hook.png", (100, 40), (0, 0, 100, 40))
        el = {"type": "label_pulse", "name": "hook", "png": "hook.png", "x": 60, "y": 100, "end": 30}
        _, frames, _, _ = rt.render({**el, "start": 0}, self.ctx())
        self.assertEqual(frames[0][0].size, (100, 40))
        _, frames, _, _ = rt.render({**el, "start": 5}, self.ctx())
        self.assertEqual(frames[0][0].size, (60, 24))

    def test_icon_pop_ends_on_the_still_with_no_overlap(self):
        helpers.rect_png(self.dir / "icon.png", (40, 30), (0, 0, 40, 30), (250, 200, 0, 255))
        layers, _ = self.render_cli([{"type": "icon_pop", "name": "pop", "png": "icon.png", "x": 100, "y": 150,
                                      "frame": 10, "until": 40}])
        pop = layers["pop"]
        self.assertEqual(pop["frames"], [10, 15])
        # The pop shows frames 10 to 14 and the still (an image, on its frame time) starts on 15: no frame
        # shows both or neither.
        self.assertEqual(drawn(pop["layer"]["startTime"], pop["layer"]["endTime"], 30), list(range(10, 15)))
        self.assertEqual((pop["still"]["startTime"], pop["still"]["endTime"]), (0.5, 1.316))
        # 40x30 is padded to 304 a side, kept inside the 240x400 canvas where it can be, the icon still at 100,150.
        self.assertEqual([pop["still"][k] for k in ("source", "x", "y", "width", "height")],
                         ["pop_still.png", "0", "13", "304", "304"])
        padded = np.asarray(Image.open(self.dir / "out/pop_still.png"))
        self.assertTrue((padded[137:167, 100:140] == (250, 200, 0, 255)).all())
        self.assertEqual(int((padded[..., 3] > 0).sum()), 40 * 30)
        _, frames, _, _ = rt.render({"type": "icon_pop", "name": "pop", "png": "icon.png", "x": 100, "y": 150, "frame": 0},
                                    self.ctx())
        last, offset = frames[-1]
        self.assertEqual(offset, (100, 150))
        self.assertEqual(np.asarray(last).tolist(), np.asarray(Image.open(self.dir / "icon.png")).tolist())

    def test_fly_to_hud_reports_the_first_landing(self):
        helpers.rect_png(self.dir / "coin.png", (20, 20), (2, 2, 18, 18), (250, 200, 0, 255))
        el = {"type": "fly_to_hud", "name": "fly", "icon": "coin.png", "frame": 30, "from": [120, 330], "to": [60, 60],
              "icon_px": 20}
        first, frames, meta, _ = rt.render(el, self.ctx())
        self.assertEqual(meta["land"], 42)  # 0.4 s flight at 30 fps
        self.assertEqual(len(frames), round((2 * 0.045 + 0.4 + 0.24) * 30))
        box = rt.union(frames)
        self.assertTrue(box[0] <= 60 and box[1] <= 60 and box[2] >= 120 and box[3] >= 330)

    def test_progress_bar_fills_after_a_step(self):
        el = {"type": "progress", "name": "bar", "box": [40, 100, 160, 24], "fractions": [0.1, 0.9], "steps": [5],
              "start": 0, "end": 20}
        first, frames, _, _ = rt.render(el, self.ctx())

        def fill(n):
            a = np.asarray(frames[n][0]).astype(int)
            return int(((a[..., 1] > 150) & (a[..., 0] < 230) & (a[..., 2] < 120)).sum())

        self.assertGreater(fill(19), 4 * fill(4))
        self.assertGreater(fill(19), fill(7))

    def test_floater_out_of_the_zone_warns(self):
        helpers.rect_png(self.dir / "plus.png", (30, 20), (0, 0, 30, 20))
        el = {"type": "floater", "name": "plus", "png": "plus.png", "events": [[0, 220, 120]]}
        _, _, _, warnings = rt.render(el, self.ctx())
        self.assertTrue(any("right of the safe edge 200" in w for w in warnings), warnings)
        self.assertTrue(any("above the safe top 40" in w for w in warnings), warnings)

    def test_counter_takes_an_empty_first_state_and_a_transparent_png(self):
        Image.new("RGBA", CANVAS, (0, 0, 0, 0)).save(self.dir / "clear.png")
        helpers.rect_png(self.dir / "x2.png", CANVAS, (60, 100, 120, 130))
        el = {"type": "counter", "name": "combo", "values": [None, "clear.png", "x2.png"], "steps": [3, 6], "start": 0,
              "end": 14}
        _, frames, meta, _ = rt.render(el, self.ctx())
        self.assertTrue(all(f[0] is None for f in frames[:6]))  # empty, then the all-transparent value
        self.assertIsNotNone(frames[6][0])
        self.assertEqual(meta, {})

    def test_floaters_that_meet_on_screen_are_warned(self):
        helpers.rect_png(self.dir / "bonk.png", (60, 24), (0, 0, 60, 24))
        close = {"type": "floater", "name": "bonk", "png": "bonk.png", "events": [[0, 120, 300], [4, 130, 290]]}
        apart = {"type": "floater", "name": "plus", "png": "bonk.png", "events": [[0, 40, 200], [30, 40, 200]]}
        other = {"type": "floater", "name": "late", "png": "bonk.png", "events": [[2, 125, 295]]}
        found = rt.floater_overlaps([close, apart], self.ctx())
        self.assertEqual([tops for tops, _ in found], [{"bonk"}])
        # The first has risen clear by frame 4; the second rises faster early on and catches it.
        self.assertIn("bonk (frame 0) and bonk (frame 4) overlap on frame 9", found[0][1])
        across = rt.floater_overlaps([{"type": "group", "name": "grp", "elements": [apart, other]}, close], self.ctx())
        self.assertIn({"grp", "bonk"}, [tops for tops, _ in across])

    def test_fly_to_hud_lands_on_the_first_frame_without_the_icon(self):
        helpers.rect_png(self.dir / "coin.png", (20, 20), (2, 2, 18, 18), (250, 200, 0, 255))
        for flight, land in ((0.41, 43), (12.5 / 30, 43), (0.4, 42)):  # 12.3 and 12.5 frames: both land on 13
            el = {"type": "fly_to_hud", "name": "fly", "icon": "coin.png", "frame": 30, "from": [120, 330], "to": [60, 60],
                  "icon_px": 20, "count": 1, "outline": 0, "flight_s": flight}
            first, frames, meta, _ = rt.render(el, self.ctx())
            self.assertEqual(meta["land"], land, flight)

            def coin(n):
                im, _ = frames[n - first]
                a = np.asarray(im).astype(int)
                return int(((a[..., 0] > 240) & (a[..., 1] > 150) & (a[..., 1] < 215) & (a[..., 2] < 40)).sum())

            self.assertGreater(coin(land - 1), 50, flight)
            self.assertEqual(coin(land), 0, flight)

    def test_hand_drag_stays_visible_on_its_last_key_by_default(self):
        red_tip_hand(self.dir / "hand.png")
        el = {"type": "hand_drag", "name": "drag", "png": "hand.png", "tip": [30, 20], "height": 100,
              "keys": [[0, 60, 250], [12, 180, 250]], "press": [[2, 12]]}
        first, frames, _, _ = rt.render(el, self.ctx())
        self.assertEqual(first + len(frames), 12 + 6 + 1)  # lingers 6 frames on the last key
        im, (x, y) = frames[12]
        a = np.asarray(im).astype(int)
        self.assertEqual(a[..., 3].max(), 255)
        ys, xs = np.nonzero((a[..., 0] > 200) & (a[..., 1] < 80) & (a[..., 3] > 200))
        self.assertAlmostEqual(x + xs.mean(), 180, delta=1.5)
        self.assertIsNone(frames[17][0])  # gone before the track ends
        _, early, _, _ = rt.render({**el, "linger": 0}, self.ctx())
        self.assertEqual(len(early), 13)
        self.assertIsNone(early[12][0])  # faded out by the last key, as before

    def test_flash_fades_from_its_alpha(self):
        el = {"type": "flash", "name": "flash", "frames": [5], "color": "#FF0000", "box": [20, 40, 100, 50]}
        first, frames, _, warnings = rt.render(el, self.ctx())
        self.assertEqual((first, len(frames)), (5, 8))  # 0.25 s at 30 fps
        im, offset = frames[0]
        self.assertEqual((offset, im.size), ((20, 40), (100, 50)))
        self.assertEqual(im.getpixel((50, 25))[:3], (255, 0, 0))
        self.assertAlmostEqual(im.getpixel((50, 25))[3], 0.7 * 255, delta=1)
        self.assertAlmostEqual(frames[4][0].getpixel((50, 25))[3], 0.7 * 0.25 * 255, delta=1)
        self.assertEqual(warnings, [])

    def test_ring_draws_an_ellipse_and_a_timer_that_empties(self):
        el = {"type": "ring", "name": "ring", "center": [120, 200], "radius": [60, 30], "start": 0, "end": 9, "pulse": 0}
        first, frames, _, _ = rt.render(el, self.ctx())

        def alpha(n, x, y):
            im, (ox, oy) = frames[n]
            if im is None or not (0 <= x - ox < im.width and 0 <= y - oy < im.height):
                return 0
            return im.getpixel((x - ox, y - oy))[3]

        self.assertGreater(alpha(0, 120 + 57, 200), 200)  # on the ring, 3 o'clock
        self.assertGreater(alpha(0, 120, 200 - 27), 200)  # 12 o'clock: the ellipse is half as tall
        self.assertEqual(alpha(0, 120, 200), 0)
        self.assertEqual(alpha(0, 120, 200 - 57), 0)
        first, frames, _, _ = rt.render({**el, "timer": True}, self.ctx())
        self.assertGreater(alpha(0, 120 + 57, 200), 200)
        self.assertEqual(alpha(4, 120 + 57, 200), 0)  # halfway: the right half is spent
        self.assertGreater(alpha(4, 120 - 57, 200), 200)
        self.assertIsNone(frames[8][0])

    def test_icon_pop_exit_plays_the_curve_backward(self):
        helpers.rect_png(self.dir / "icon.png", (40, 30), (0, 0, 40, 30), (250, 200, 0, 255))
        el = {"type": "icon_pop", "name": "pop", "png": "icon.png", "x": 100, "y": 150, "frame": 10, "exit": 30}
        first, frames, meta, _ = rt.render(el, self.ctx())
        self.assertEqual((first, first + len(frames), meta), (10, 30, {}))
        self.assertEqual(frames[20 - first][1], (100, 150))  # held at scale 1
        self.assertEqual([frames[n - first][0].width for n in (26, 27, 28, 29)], [42, 44, 33, 16])  # 1.05, 1.1, 0.82, 0.4
        with self.assertRaises(rt.SpecError):
            rt.render({**el, "exit": 18}, self.ctx())
        with self.assertRaises(rt.SpecError):
            rt.render({**el, "until": 40}, self.ctx())

    def test_group_draws_its_children_into_one_track(self):
        helpers.rect_png(self.dir / "plus.png", (20, 20), (0, 0, 20, 20))
        els = [{"type": "group", "name": "grp", "elements": [
            {"type": "floater", "name": "a", "png": "plus.png", "events": [[0, 40, 300]], "rise": 10},
            {"type": "floater", "name": "b", "png": "plus.png", "events": [[6, 200, 300]], "rise": 10}]}]
        layers, _ = self.render_cli(els)
        lay = layers["grp"]["layer"]
        self.assertEqual(layers["grp"]["frames"], [0, 24])
        self.assertLessEqual(int(lay["x"]), 30)
        self.assertGreaterEqual(int(lay["x"]) + int(lay["width"]), 210)


@unittest.skipUnless(helpers.HAS_FFMPEG, "needs ffmpeg and ffprobe")
class EncodeTests(Case):
    def counter(self, start, end):
        helpers.rect_png(self.dir / "c.png", CANVAS, (41, 51, 61, 63))
        return [{"type": "counter", "name": "counter", "values": ["c.png"], "steps": [], "start": start, "end": end}]

    def test_layer_times_show_its_frames_and_it_is_cropped_to_the_even_box(self):
        layers, _ = self.render_cli(self.counter(185, 298))
        lay = layers["counter"]["layer"]
        self.assertEqual((lay["startTime"], lay["endTime"]), rt.video_times(185, 298, 30))
        self.assertEqual([lay[k] for k in ("x", "y", "width", "height")], ["40", "50", "22", "14"])
        self.assertEqual((lay["type"], lay["fit"], lay["mute"], lay["source"]), ("video", "fill", True, "counter.mov"))

    def test_track_is_prores_4444_with_alpha(self):
        self.render_cli(self.counter(0, 6))
        stream = helpers.video_stream(self.dir / "out/counter.mov")
        self.assertEqual(stream["codec_name"], "prores")
        self.assertTrue(stream["pix_fmt"].startswith("yuva"), stream["pix_fmt"])
        self.assertEqual((stream["width"], stream["height"], int(stream["nb_read_frames"])), (22, 14, 6))

    def test_a_shorter_rerender_keeps_no_stale_frames(self):
        self.render_cli(self.counter(0, 12))
        layers, _ = self.render_cli(self.counter(0, 4))
        self.assertEqual(int(helpers.video_stream(self.dir / "out/counter.mov")["nb_read_frames"]), 4)
        self.assertEqual(layers["counter"]["frames"], [0, 4])
        self.assertEqual(sorted(p.name for p in (self.dir / "out").iterdir()), ["counter.mov", "layers.json"])

    def test_only_rerenders_the_named_element_and_keeps_the_rest(self):
        helpers.rect_png(self.dir / "plus.png", (20, 20), (0, 0, 20, 20))
        els = self.counter(0, 6) + [{"type": "floater", "name": "plus", "png": "plus.png", "events": [[0, 100, 300]]}]
        self.render_cli(els)
        helpers.write_json(self.dir / "spec.json", {"canvas": CANVAS, "safe_zone": ZONE, "elements": els})
        result = helpers.run("render_tracks.py", self.dir / "spec.json", self.dir / "out", "--only", "plus")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("counter:", result.stdout)
        layers = json.loads((self.dir / "out/layers.json").read_text())["layers"]
        self.assertEqual(sorted(layers), ["counter", "plus"])

    def test_only_drops_entries_no_longer_in_the_spec(self):
        helpers.rect_png(self.dir / "plus.png", (20, 20), (0, 0, 20, 20))
        plus = {"type": "floater", "name": "plus", "png": "plus.png", "events": [[0, 100, 300]]}
        self.render_cli(self.counter(0, 6) + [plus])
        helpers.write_json(self.dir / "spec.json", {"canvas": CANVAS, "safe_zone": ZONE, "elements": [plus]})
        result = helpers.run("render_tracks.py", self.dir / "spec.json", self.dir / "out", "--only", "plus")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("dropped counter", result.stderr)
        self.assertEqual(sorted(json.loads((self.dir / "out/layers.json").read_text())["layers"]), ["plus"])
        result = helpers.run("render_tracks.py", self.dir / "spec.json", self.dir / "out", "--only", "plsu")
        self.assertEqual(result.returncode, 2)
        self.assertIn("plsu", result.stderr)

    def test_overlapping_floaters_warn_in_layers_json(self):
        helpers.rect_png(self.dir / "bonk.png", (60, 24), (0, 0, 60, 24))
        layers, result = self.render_cli([{"type": "floater", "name": "bonk", "png": "bonk.png",
                                           "events": [[0, 120, 300], [4, 130, 290]]}])
        self.assertTrue(any("overlap on frame 9" in w for w in layers["bonk"]["warnings"]), layers["bonk"])
        self.assertIn("WARN floaters bonk", result.stderr)

    def test_identical_tracks_are_marked_for_one_upload(self):
        red_tip_hand(self.dir / "hand.png")
        # Without the ring, each tap's motion stays clear of the small canvas's edges, so nothing crops it.
        tap = {"type": "hand_tap", "png": "hand.png", "tip": [30, 20], "height": 100, "in": 0, "press": 8, "out": 20,
               "ring": False}
        els = [{**tap, "name": "tap1", "at": [40, 60]}, {**tap, "name": "tap2", "at": [80, 200]},
               {**tap, "name": "tap3", "at": [80, 200], "press": 9}]
        layers, result = self.render_cli(els)
        self.assertEqual([layers[n].get("same_as") for n in ("tap1", "tap2", "tap3")], [None, "tap1.mov", None])
        self.assertNotEqual(layers["tap1"]["layer"]["x"], layers["tap2"]["layer"]["x"])
        self.assertIn("NOTE tap2: tap2.mov is the same file as tap1.mov", result.stderr)

    def test_rays_background_is_opaque_h264(self):
        Image.new("RGB", CANVAS, (20, 60, 200)).save(self.dir / "bg.png")
        layers, _ = self.render_cli([{"type": "rays", "name": "rays", "background": "bg.png", "center": [120, 150],
                                      "start": 30, "end": 36}])
        stream = helpers.video_stream(self.dir / "out/rays.mp4")
        self.assertEqual((stream["codec_name"], stream["pix_fmt"], int(stream["nb_read_frames"])), ("h264", "yuv420p", 6))
        lay = layers["rays"]["layer"]
        self.assertEqual((lay["fit"], lay["width"], lay["height"]), ("cover", "240", "400"))
        self.assertEqual((lay["startTime"], lay["endTime"]), rt.video_times(30, 36, 30))

    def test_missing_key_fails_with_the_element_name(self):
        helpers.write_json(self.dir / "spec.json", {"canvas": CANVAS, "elements": [{"type": "burst", "name": "boom", "frame": 3}]})
        result = helpers.run("render_tracks.py", self.dir / "spec.json", self.dir / "out")
        self.assertEqual(result.returncode, 2)
        self.assertIn("boom: missing key 'center'", result.stderr)


class HelpTests(unittest.TestCase):
    def test_every_script_has_help(self):
        for script in ("render_tracks.py", "build_passes.py", "check_master.py", "make_patch.py", "check_take.py",
                       "put_parts.py"):
            result = helpers.run(script, "--help")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("usage:", result.stdout)

    def test_render_help_lists_the_press_options(self):
        out = helpers.run("render_tracks.py", "--help").stdout
        for word in ("press", "hold", "ring", "fade", "linger", "92%"):
            self.assertIn(word, out)

    def test_every_script_is_executable(self):
        for path in helpers.SCRIPTS.glob("*.py"):
            self.assertTrue(path.stat().st_mode & 0o111, path.name)


if __name__ == "__main__":
    unittest.main()
