"""rectify_screen.py: a screen filmed by a drifting handheld camera comes out flat and matches what it showed."""

import importlib.util
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

SKILL = Path(__file__).resolve().parents[2] / "skills" / "scenario-kinetic-music-video"
SCRIPT = SKILL / "scripts" / "rectify_screen.py"
W, H, SW, SH, FPS, N = 960, 540, 640, 360, 30, 30
# The screen's corners in the room (TL TR BR BL). At t=0 the camera drift is (0, +9) px, so the clip shows them 9 lower.
QUAD = np.float32([[250, 110], [710, 140], [700, 400], [240, 425]])
SHOWN = QUAD + np.float32([0, 9])
VX0, VX1 = 219, 421  # a pillarboxed screen shows a 9:16 video in these columns of its content, black around it


def run(cwd, *args):
    return subprocess.run([sys.executable, str(SCRIPT), *args], cwd=cwd, capture_output=True, text=True)


def load_module():
    spec = importlib.util.spec_from_file_location("rectify_screen", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def quad_text(q):
    return " ".join(f"{x:.0f},{y:.0f}" for x, y in q)


def encode(path, size):
    return subprocess.Popen(
        ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{size[0]}x{size[1]}",
         "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", str(path)],
        stdin=subprocess.PIPE,
    )


def make_phone_clip(out, textured=False, pillarbox=False):
    """A room of blurred noise and furniture-like blocks, a screen with a moving bar and a counter warped into QUAD,
    a handheld drift (zoom 3%, 14 x 9 px), a burnt-in caption band in rows 490-540, plus the screen's own content.
    textured: the screen shows fine detail, so any misregistration costs error, and the caption band is a detailed
    strip fixed to the phone's frame, which pulls an unmasked tracker toward the phone instead of the room.
    pillarbox: the screen is black but for a dim vertical video in columns VX0-VX1, as a laptop playing a vertical
    video, without a caption band; the truth clip is that video."""
    import cv2

    rng = np.random.default_rng(7)
    name = "_tex" if textured else "_pillar" if pillarbox else ""
    room = cv2.normalize(cv2.GaussianBlur(rng.integers(0, 255, (H, W), np.uint8), (0, 0), 3), None, 40, 140,
                         cv2.NORM_MINMAX)
    for _ in range(60):
        x, y = int(rng.integers(0, W - 60)), int(rng.integers(0, H - 60))
        cv2.rectangle(room, (x, y), (x + int(rng.integers(10, 60)), y + int(rng.integers(10, 60))),
                      int(rng.integers(0, 180)), -1)
    room = cv2.cvtColor(room, cv2.COLOR_GRAY2BGR)
    detail = cv2.normalize(cv2.GaussianBlur(rng.integers(0, 255, (SH, SW), np.uint8), (0, 0), 2.5), None, 150, 235,
                           cv2.NORM_MINMAX)
    strip = cv2.normalize(cv2.GaussianBlur(rng.integers(0, 255, (50, W), np.uint8), (0, 0), 1.5), None, 0, 255,
                          cv2.NORM_MINMAX)
    to_room = cv2.getPerspectiveTransform(np.float32([[0, 0], [SW, 0], [SW, SH], [0, SH]]), QUAD)
    inside = cv2.warpPerspective(np.full((SH, SW), 255, np.uint8), to_room, (W, H)) > 127
    phone = encode(out / f"phone{name}.mp4", (W, H))
    truth = encode(out / f"truth{name}.mp4", (VX1 - VX0, SH) if pillarbox else (SW, SH))
    for i in range(N):
        t = i / FPS
        c = cv2.cvtColor(detail, cv2.COLOR_GRAY2BGR) if textured else np.full((SH, SW, 3), 200, np.uint8)
        x = int((i * 9) % SW)
        cv2.rectangle(c, (x, 60), (x + 80, 300), (30, 30, 220), -1)
        cv2.putText(c, f"{i:03d}", (40, 330), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (20, 20, 20), 3)
        if pillarbox:
            video = np.full((SH, VX1 - VX0, 3), 50, np.uint8)
            cv2.rectangle(video, (20, (i * 7) % SH), (180, (i * 7) % SH + 40), (200, 60, 160), -1)
            cv2.putText(video, f"{i:03d}", (40, 330), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (220, 220, 220), 3)
            c = np.full((SH, SW, 3), 10, np.uint8)
            c[:, VX0:VX1] = video
        f = room.copy()
        f[inside] = cv2.warpPerspective(c, to_room, (W, H))[inside]
        s, dx, dy = 1 + 0.03 * np.sin(t * 1.3), 14 * np.sin(t * 2.1), 9 * np.cos(t * 1.7)
        drift = np.float32([[s, 0, (1 - s) * W / 2 + dx], [0, s, (1 - s) * H / 2 + dy]])
        f = cv2.warpAffine(f, drift, (W, H), borderMode=cv2.BORDER_REFLECT)
        if not pillarbox:
            f[H - 50 :] = cv2.cvtColor(strip, cv2.COLOR_GRAY2BGR) if textured else 0
            cv2.putText(f, f"caption {i % 7}", (30, H - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
        phone.stdin.write(f.tobytes())
        truth.stdin.write((video if pillarbox else c).tobytes())
    for p in (phone, truth):
        p.stdin.close()
        p.wait()


def letterbox(src, out, top, height):
    """The clip inside black bars, as a landscape recording posted as a vertical video: top rows above, the rest
    below, to the given height."""
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(src), "-vf", f"pad={W}:{height}:0:{top}",
                    "-c:v", "libx264", "-crf", "14", "-pix_fmt", "yuv420p", str(out)], check=True)


def gray_frames(path):
    """Every frame at 320x180 gray."""
    r = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(path), "-vf", "scale=320:180:flags=area",
                        "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.uint8).reshape(-1, 180, 320).astype(np.float32)


@unittest.skipUnless(shutil.which("ffmpeg"), "needs ffmpeg")
class RectifyScreenTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.dir = Path(cls.tmp.name)
        make_phone_clip(cls.dir)
        cls.truth = gray_frames(cls.dir / "truth.mp4")
        cls.auto = run(cls.dir, "phone.mp4", "auto.mp4", "--band", "490:540", "--check", "auto.jpg")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def error_against_truth(self, path, truth=None):
        truth = self.truth if truth is None else truth
        flat = gray_frames(path)
        self.assertEqual(len(flat), len(truth))
        return float(np.abs(flat - truth)[:, 6:-6, 6:-6].mean())

    def test_usage_without_arguments(self):
        r = run(self.dir)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("usage", r.stderr)

    def test_manual_quad_flattens_to_the_screen(self):
        quad = quad_text(SHOWN)
        r = run(self.dir, "phone.mp4", "manual.mp4", "--quad", quad, "--band", "490:540")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertLess(self.error_against_truth(self.dir / "manual.mp4"), 4.0)

    def test_band_keeps_a_fixed_strip_out_of_tracking(self):
        make_phone_clip(self.dir, textured=True)
        truth = gray_frames(self.dir / "truth_tex.mp4")
        quad = quad_text(SHOWN)
        r = run(self.dir, "phone_tex.mp4", "band.mp4", "--quad", quad, "--band", "490:540")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertLess(self.error_against_truth(self.dir / "band.mp4", truth), 4.0)
        r = run(self.dir, "phone_tex.mp4", "noband.mp4", "--quad", quad)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertGreater(self.error_against_truth(self.dir / "noband.mp4", truth), 6.0)

    def test_auto_quad_finds_the_screen(self):
        self.assertEqual(self.auto.returncode, 0, self.auto.stderr)
        corners = re.search(r"corners at --at \(TL TR BR BL\): (.+)", self.auto.stdout).group(1)
        found = np.float32([[float(v) for v in p.split(",")] for p in corners.split()])
        self.assertLess(float(np.abs(found - SHOWN).max()), 8.0, corners)
        self.assertLess(self.error_against_truth(self.dir / "auto.mp4"), 6.0)

    def test_tracked_share_reported(self):
        share = int(re.search(r"tracked (\d+)%", self.auto.stdout).group(1))
        self.assertGreaterEqual(share, 90)
        self.assertNotIn("WARN", self.auto.stdout)

    def test_check_image_and_force(self):
        import cv2

        self.assertEqual(self.auto.returncode, 0, self.auto.stderr)
        img = cv2.imread(str(self.dir / "auto.jpg"))
        self.assertEqual(img.shape[0], H)
        self.assertGreater(img.shape[1], W)  # the frame with its outline, then the flattened frame beside it
        again = run(self.dir, "phone.mp4", "auto.mp4", "--band", "490:540")
        self.assertNotEqual(again.returncode, 0)
        self.assertIn("--force", again.stderr)
        onto = run(self.dir, "phone.mp4", "phone.mp4", "--force")
        self.assertEqual(onto.returncode, 2)
        self.assertIn("source video", onto.stderr)
        sized = run(self.dir, "phone.mp4", "sized.mp4", "--size", "640x360", "--to", "0.5", "--fps", "10")
        self.assertEqual(sized.returncode, 0, sized.stderr)
        frames = int(re.search(r"(\d+) frames at 10 fps, 640x360", sized.stdout).group(1))
        self.assertIn(frames, (5, 6))  # ffmpeg versions round the last frame of a trimmed fps resample differently

    def test_check_image_folder_is_made_and_a_failed_write_exits_2(self):
        import cv2

        r = run(self.dir, "phone.mp4", "nested.mp4", "--band", "490:540", "--to", "0.3", "--check", "a/refs/quad.jpg")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIsNotNone(cv2.imread(str(self.dir / "a" / "refs" / "quad.jpg")))
        r = run(self.dir, "phone.mp4", "ext.mp4", "--check", "quad.xyz")
        self.assertEqual(r.returncode, 2)
        self.assertIn("--check quad.xyz", r.stderr)
        self.assertFalse((self.dir / "ext.mp4").exists())  # refused before flattening
        if hasattr(os, "geteuid") and os.geteuid() == 0:
            self.skipTest("root writes into a read-only folder")
        locked = self.dir / "locked"
        locked.mkdir()
        locked.chmod(0o500)
        self.addCleanup(locked.chmod, 0o700)
        r = run(self.dir, "phone.mp4", "locked.mp4", "--band", "490:540", "--to", "0.3", "--check", "locked/quad.jpg")
        self.assertEqual(r.returncode, 2)  # imwrite returns False rather than raising
        self.assertIn("could not write locked/quad.jpg", r.stderr)

    def test_outline_on_three_borders_is_the_room(self):
        rs = load_module()
        frame = np.float32([[0, 0], [W - 1, 0], [W - 1, H - 1], [0, H - 1]])
        above_captions = np.float32([[0, 0], [W - 1, 0], [W - 1, 428], [0, 428]])  # 79% of the frame
        two_borders = np.float32([[0, 20], [W - 1, 20], [W - 1, H - 21], [0, H - 21]])  # 92% of the frame
        corner = np.float32([[0, 0], [500, 0], [500, 300], [0, 300]])
        self.assertTrue(rs.fills_frame(frame, W, H))
        self.assertTrue(rs.fills_frame(above_captions, W, H))
        self.assertTrue(rs.fills_frame(two_borders, W, H))
        self.assertFalse(rs.fills_frame(corner, W, H))
        self.assertFalse(rs.fills_frame(SHOWN, W, H))

    def test_pillarboxed_screen_asks_for_the_video_quad(self):
        import cv2

        make_phone_clip(self.dir, pillarbox=True)
        r = run(self.dir, "phone_pillar.mp4", "pillar.mp4", "--check", "pillar.jpg")
        self.assertEqual(r.returncode, 2)
        self.assertIn("no screen found", r.stderr)  # the room outscores the dark screen and fills the frame
        self.assertIn("pillar.jpg", r.stderr)
        self.assertIn("--force", r.stderr)  # the rerun replaces the image this run left
        self.assertNotIn("texture", r.stderr)
        self.assertEqual(cv2.imread(str(self.dir / "pillar.jpg")).shape, (H, W, 3))  # the frame alone, to read off
        to_room = cv2.getPerspectiveTransform(np.float32([[0, 0], [SW, 0], [SW, SH], [0, SH]]), QUAD)
        video = np.float32([[[VX0, 0], [VX1, 0], [VX1, SH], [VX0, SH]]])
        r = run(self.dir, "phone_pillar.mp4", "pillar.mp4", "--check", "pillar.jpg", "--force", "--quad",
                quad_text(cv2.perspectiveTransform(video, to_room)[0] + np.float32([0, 9])))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertGreaterEqual(int(re.search(r"720x1280, tracked (\d+)%", r.stdout).group(1)), 90)
        self.assertLess(self.error_against_truth(self.dir / "pillar.mp4", gray_frames(self.dir / "truth_pillar.mp4")),
                        4.0)

    def test_recording_inside_black_bars_is_read_without_them(self):
        import cv2

        top, height = 230, 1000
        letterbox(self.dir / "phone.mp4", self.dir / "phone_lb.mp4", top, height)
        r = run(self.dir, "phone_lb.mp4", "lb.mp4", "--band", f"{top + 490}:{top + 540}")
        self.assertEqual(r.returncode, 0, r.stderr)
        corners = re.search(r"corners at --at \(TL TR BR BL\): (.+)", r.stdout).group(1)
        found = np.float32([[float(v) for v in p.split(",")] for p in corners.split()])
        self.assertLess(float(np.abs(found - SHOWN - np.float32([0, top])).max()), 8.0, corners)
        if not (self.dir / "phone_pillar.mp4").exists():
            make_phone_clip(self.dir, pillarbox=True)
        letterbox(self.dir / "phone_pillar.mp4", self.dir / "pillar_lb.mp4", top, height)
        r = run(self.dir, "pillar_lb.mp4", "pillar_lb_out.mp4", "--check", "pillar_lb.jpg")
        self.assertEqual(r.returncode, 2)
        self.assertIn("no screen found", r.stderr)  # as without the bars, never the whole recording
        self.assertNotIn("texture", r.stderr)
        self.assertEqual(cv2.imread(str(self.dir / "pillar_lb.jpg")).shape, (height, W, 3))

    def test_documented_rerun_replaces_the_check_image(self):
        doc = (SKILL / "references" / "dynamism.md").read_text()
        section = doc.split("## 6. ", 1)[1].split("\n## ", 1)[0]
        bullets = [" ".join(b.split()) for b in re.split(r"\n- ", section)]
        rerun = [b for b in bullets if "rerun with `--quad" in b]
        self.assertEqual(len(rerun), 1, bullets)
        self.assertIn("--force", rerun[0])

    def test_a_failed_run_still_writes_the_check_image(self):
        import cv2

        whole = quad_text([[0, 0], [W - 1, 0], [W - 1, H - 1], [0, H - 1]])
        r = run(self.dir, "phone.mp4", "full.mp4", "--quad", whole, "--check", "full/quad.jpg")
        self.assertEqual(r.returncode, 2)
        self.assertIn("too little texture", r.stderr)
        img = cv2.imread(str(self.dir / "full" / "quad.jpg"))
        self.assertIsNotNone(img)
        self.assertEqual(img.shape[0], H)
        self.assertGreater(img.shape[1], W)  # the outline, beside the frame flattened
        self.assertFalse((self.dir / "full.mp4").exists())

    def test_no_screen_exits_2(self):
        flat = encode(self.dir / "flat.mp4", (320, 180))
        for _ in range(10):
            flat.stdin.write(np.full((180, 320, 3), 90, np.uint8).tobytes())
        flat.stdin.close()
        flat.wait()
        r = run(self.dir, "flat.mp4", "none.mp4")
        self.assertEqual(r.returncode, 2)
        self.assertIn("no screen found", r.stderr)
        self.assertIn("--quad", r.stderr)


if __name__ == "__main__":
    unittest.main()
