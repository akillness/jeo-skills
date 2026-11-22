"""rectify_screen.py's input checks and edge cases: malformed --quad, --band and --size, frames out of range, outputs
that cannot be written, shapes that are no screen, and the warning when the camera is lost."""

import contextlib
import importlib.util
import io
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

from test_rectify_screen import SHOWN, make_phone_clip, quad_text

SCRIPT = Path(__file__).resolve().parents[2] / "skills" / "scenario-kinetic-music-video" / "scripts" / "rectify_screen.py"
FFMPEG = bool(shutil.which("ffmpeg"))


def load_module():
    spec = importlib.util.spec_from_file_location("rectify_screen_gaps", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


rs = load_module()


def stack_with(shape_fn, n=6, w=320, h=180):
    """Frames of a plain room, lit above the black-bar level, where only the region shape_fn draws changes."""
    out = []
    for i in range(n):
        f = np.full((h, w, 3), 60, np.uint8)
        shape_fn(f, 120 + 20 * (i % 2))
        out.append(f)
    return out


class PureTest(unittest.TestCase):
    def test_quad_needs_four_numeric_corners_inside_the_frame(self):
        for text in ("1,2 3,4 5,6", "1,2 3,4 5,6 7", "a,b 1,1 2,2 3,3"):
            with self.assertRaisesRegex(rs.BadInput, "expected four corners"):
                rs.parse_quad(text, 100, 100)
        with self.assertRaisesRegex(rs.BadInput, "outside the 100x80 frame"):
            rs.parse_quad("0,0 100,0 100,81 0,80", 100, 80)
        q = rs.parse_quad("90,70 10,10 90,10 10,70", 100, 80)
        self.assertEqual(q.tolist(), [[10, 10], [90, 10], [90, 70], [10, 70]])

    def test_pairs_need_two_integers(self):
        self.assertEqual(rs.parse_pair("490:540", ":", "--band"), (490, 540))
        for text in ("490", "a:b", "1:2:3"):
            with self.assertRaisesRegex(rs.BadInput, "--band .*expected two integers separated by ':'"):
                rs.parse_pair(text, ":", "--band")

    def test_an_all_black_stack_is_read_as_the_whole_frame(self):
        self.assertEqual(rs.picture(np.zeros((3, 40, 64), np.float32)), (0, 0, 64, 40))

    def test_a_changing_region_under_5_percent_is_no_screen(self):
        self.assertIsNone(rs.find_screen(stack_with(lambda f, v: cv2.rectangle(f, (10, 10), (40, 30), (v,) * 3, -1)),
                                         320, 180))

    def test_a_changing_region_that_is_no_quadrilateral_is_no_screen(self):
        a = 2 * np.pi * np.arange(5) / 5 + 0.3
        pentagon = np.int32(np.stack([160 + 70 * np.cos(a), 90 + 70 * np.sin(a)], 1))
        self.assertIsNone(rs.find_screen(stack_with(lambda f, v: cv2.fillPoly(f, [pentagon], (v,) * 3)), 320, 180))

    def test_a_diamond_keeps_four_distinct_corners(self):
        q = rs.order([[50, 0], [100, 50], [50, 100], [0, 50]])
        self.assertEqual(len({tuple(p) for p in q.tolist()}), 4)
        self.assertEqual(q.tolist(), [[50, 0], [100, 50], [50, 100], [0, 50]])  # clockwise from the top

    def test_a_check_image_under_a_file_is_bad_input(self):
        with tempfile.TemporaryDirectory() as tmp:
            blocker = Path(tmp) / "blocker"
            blocker.write_text("x", encoding="utf-8")
            with self.assertRaisesRegex(rs.BadInput, "blocker"):
                rs.check_image(str(blocker / "check.jpg"), np.zeros((20, 30, 3), np.uint8), None, None)


@unittest.skipUnless(FFMPEG, "needs ffmpeg")
class CliTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.dir = Path(cls.tmp.name)
        make_phone_clip(cls.dir)
        cls.quad = quad_text(SHOWN)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def main(self, *args):
        err, out = io.StringIO(), io.StringIO()
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
            code = rs.main([str(a) for a in args])
        return code, out.getvalue(), err.getvalue()

    def test_a_file_without_video_has_no_frames(self):
        text = self.dir / "notes.txt"
        text.write_text("not a video", encoding="utf-8")
        with self.assertRaisesRegex(rs.BadInput, "no video frames"):
            rs.frame_size(str(text))

    def test_bad_input_exits_2_with_its_reason(self):
        phone = self.dir / "phone.mp4"
        blocker = self.dir / "blocker"
        blocker.write_text("x", encoding="utf-8")
        cases = [
            ((self.dir / "missing.mp4", self.dir / "o1.mp4"), "no such file"),
            ((phone, self.dir / "o2.mp4", "--size", "641x360"), "sides must be even and at least 2"),
            ((phone, self.dir / "o3.mp4", "--size", "0x2"), "sides must be even and at least 2"),
            ((phone, self.dir / "o4.mp4", "--quad", self.quad, "--at", "5"), "no frames at --at 5"),
            ((phone, self.dir / "o5.mp4", "--quad", self.quad, "--from", "5"), "no frames from --from 5"),
            ((phone, blocker / "o6.mp4", "--quad", self.quad), "blocker"),
        ]
        for args, reason in cases:
            code, _, err = self.main(*args)
            self.assertEqual(code, 2, args)
            self.assertIn(reason, err)

    def test_losing_the_camera_warns(self):
        # The room is textured for 0.2 s, then a flat gray card fills the frame: nothing left to track.
        src = self.dir / "lost.mp4"
        subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(self.dir / "phone.mp4"), "-f", "lavfi", "-i",
             "color=c=gray:size=960x540:rate=30:duration=0.8", "-filter_complex",
             "[0:v]trim=0:0.2,setpts=PTS-STARTPTS,format=yuv420p[a];[1:v]format=yuv420p[b];[a][b]concat=n=2:v=1",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", str(src)],
            check=True,
        )
        code, out, err = self.main(src, self.dir / "lost_flat.mp4", "--quad", self.quad, "--size", "320x180")
        self.assertEqual(code, 0, err)
        self.assertRegex(out, r"wrote .*lost_flat\.mp4: 30 frames at 30 fps, 320x180, tracked [0-3]\d%")
        self.assertIn("WARN tracked under 80%", out)


if __name__ == "__main__":
    unittest.main()
