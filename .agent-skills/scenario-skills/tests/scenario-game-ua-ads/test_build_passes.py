"""build_passes.py: picture and sound payloads, music splits, the layer cap, and the local sum."""

import io
import json
import math
import shutil
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

import numpy as np
from PIL import Image

import helpers

bp = helpers.load("build_passes")
rt = helpers.load("render_tracks")
SR = helpers.SR

TRACKS = {"fps": 30, "canvas": [1080, 1920], "layers": {
    "hand": {"file": "hand.mov", "frames": [3, 28], "layer": {
        "type": "video", "source": "hand.mov", "x": "720", "y": "680", "width": "360", "height": "460", "fit": "fill",
        "mute": True, "startTime": 0.1, "endTime": 0.933}},
    "pop": {"file": "pop.mov", "frames": [333, 338], "layer": {}, "still": {
        "type": "image", "source": "icon.png", "x": "287", "y": "271", "width": "506", "height": "506", "fit": "fill",
        "startTime": 11.266, "endTime": 15.0}}}}


class Case(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dir)
        bp._audio.clear()

    def plan(self, **raw):
        data = {"fps": 30, "canvas": [1080, 1920], "duration": 15.0, **raw}
        helpers.write_json(self.dir / "plan.json", data)
        return bp.Plan(self.dir / "plan.json")


class TimeTests(unittest.TestCase):
    def test_times_round_down_to_the_millisecond(self):
        self.assertEqual(bp.frame_ms(185, 30), 6.166)
        self.assertEqual(bp.floor_ms(6.1667), 6.166)
        self.assertEqual(bp.floor_ms(0.3), 0.3)

    def test_layers_end_half_a_frame_before_their_end_frame(self):
        self.assertEqual(bp.frame_end(156, 30), 5.183)  # 5.2 s exactly: compose would draw frame 156 too
        self.assertEqual(bp.frame_end(24, 24), 0.979)
        self.assertEqual(bp.early_end(5.2, 30), 5.183)
        self.assertEqual(bp.early_end(6.166, 30), 6.149)  # a floored frame time is pulled back the same way
        self.assertEqual(bp.early_end(5.183, 30), 5.183)  # already early: unchanged
        self.assertEqual(bp.early_end(1.25, 30), 1.25)  # between frames: unchanged

    def test_volume_is_linear_with_three_decimals_and_capped(self):
        self.assertEqual(bp.volume(-6), 0.501)
        self.assertEqual(bp.volume(-10), 0.316)
        self.assertEqual(bp.volume(0), 1.0)
        self.assertEqual(bp.volume(10), 2.0)


class PictureTests(Case):
    def setUp(self):
        super().setUp()
        helpers.write_json(self.dir / "layers.json", TRACKS)
        helpers.rect_png(self.dir / "fail.png", (591, 355), (0, 0, 591, 355))
        helpers.rect_png(self.dir / "small.png", (750, 107), (0, 0, 750, 107))

    def test_picture_payload_maps_uploads_and_mutes_every_video(self):
        plan = self.plan(tracks="layers.json", assets={"fail.mp4": "A1", "hand.mov": "A2", "fail.png": "A3", "icon.png": "A4",
                                                         "small.pad.png": "A5"},
                         picture=[{"file": "clips/fail.mp4", "type": "video", "start": 0, "end": 185, "trimEnd": 2.8},
                                  {"track": "hand", "zIndex": 20},
                                  {"file": "fail.png", "type": "image", "x": 244, "y": 400, "start": 72, "end": 108,
                                   "transitionIn": "zoomin", "transitionDuration": 0.2},
                                  {"still": "pop"},
                                  {"file": "small.png", "type": "image", "x": 165, "y": 659, "start": 339, "end": 450}])
        payload, notes = bp.picture_payload(plan)
        clip, hand, word, still, small = payload["layers"]
        self.assertEqual(clip, {"source": "A1", "startTime": 0.0, "endTime": 6.158, "x": "0", "y": "0", "width": "1080",
                                "height": "1920", "fit": "cover", "type": "video", "trimEnd": 2.8, "mute": True, "zIndex": 0})
        # An end from layers.json that sits on a frame time, a track's or a still's, is pulled back half a frame.
        self.assertEqual((hand["source"], hand["zIndex"], hand["startTime"], hand["endTime"], hand["mute"]),
                         ("A2", 20, 0.1, 0.916, True))
        self.assertEqual([word[k] for k in ("source", "x", "y", "width", "height", "fit", "startTime", "endTime")],
                         ["A3", "244", "400", "591", "355", "fill", 2.4, 3.583])
        self.assertEqual((still["source"], still["startTime"], still["endTime"], still["zIndex"]), ("A4", 11.266, 14.983, 3))
        # 107 px tall: padded to 304 with 98 px above, so the word stays at y 659.
        self.assertEqual([small[k] for k in ("source", "x", "y", "width", "height")], ["A5", "165", "561", "750", "304"])
        self.assertTrue(any("padded to 750x304" in n for n in notes), notes)
        self.assertFalse(any("under 304 px" in n for n in notes), notes)
        self.assertEqual((payload["compressionLevel"], payload["duration"], payload["canvasHeight"]), (15, 15.0, 1920))
        self.assertFalse(any(lay["type"] == "audio" for lay in payload["layers"]))

    def test_a_video_layer_gets_the_times_that_show_its_frames(self):
        plan = self.plan(assets={"fail.mp4": "A1"},
                         picture=[{"file": "clips/fail.mp4", "type": "video", "start": 170, "end": 240}])
        (lay,) = bp.picture_payload(plan)[0]["layers"]
        self.assertEqual((lay["startTime"], lay["endTime"]), (5.65, 7.991))
        for fps in (24, 25, 30, 60):
            for first in range(120):
                self.assertEqual(bp.video_times(first, first + 45, fps), rt.video_times(first, first + 45, fps))
        # Running to the ad's last frame, it still ends inside the ad.
        plan = self.plan(assets={"fail.mp4": "A1"},
                         picture=[{"file": "clips/fail.mp4", "type": "video", "start": 336, "end": 450}])
        payload, notes = bp.picture_payload(plan)
        self.assertLess(payload["layers"][0]["endTime"], 15.0)
        self.assertFalse(any("past the" in n for n in notes), notes)

    @unittest.skipUnless(helpers.HAS_FFMPEG, "needs ffmpeg")
    def test_a_clip_shorter_than_its_window_is_noted(self):
        (self.dir / "clips").mkdir()
        helpers.encode(self.dir / "clips/short.mp4", [np.full((32, 32, 3), 90, np.uint8)] * 30)
        plan = self.plan(assets={"short.mp4": "S"},
                         picture=[{"file": "clips/short.mp4", "type": "video", "start": 10, "end": 55, "trimStart": 0.2}])
        notes = bp.picture_payload(plan)[1]
        self.assertTrue(any("has 0.800 s after its trims for a 1.500 s window" in n for n in notes), notes)
        plan = self.plan(assets={"short.mp4": "S"},
                         picture=[{"file": "clips/short.mp4", "type": "video", "start": 10, "end": 34, "trimStart": 0.2}])
        self.assertFalse(any("window" in n for n in bp.picture_payload(plan)[1]))
        plan = self.plan(assets={"short.mp4": "S"}, picture=[{"file": "clips/short.mp4", "type": "video", "start": 10,
                                                               "end": 34, "trimStart": 0.2, "trimEnd": 0.3}])
        notes = bp.picture_payload(plan)[1]
        self.assertTrue(any("has 0.500 s after its trims for a 0.800 s window" in n for n in notes), notes)

    def test_a_small_image_is_padded_beside_its_file_with_its_pixels_in_place(self):
        helpers.rect_png(self.dir / "tag.png", (100, 40), (0, 0, 100, 40), (200, 30, 30, 255))
        plan = self.plan(assets={"tag.pad.png": "P"},
                         picture=[{"file": "tag.png", "type": "image", "x": 10, "y": 900, "start": 0, "end": 30}])
        (lay,) = bp.picture_payload(plan)[0]["layers"]
        # Near the left edge the margin goes right, keeping the padded image inside the canvas.
        self.assertEqual([lay[k] for k in ("x", "y", "width", "height")], ["0", "768", "304", "304"])
        padded = np.asarray(Image.open(self.dir / "tag.pad.png"))
        self.assertEqual(padded.shape, (304, 304, 4))
        self.assertTrue((padded[132:172, 10:110] == (200, 30, 30, 255)).all())
        self.assertEqual(int((padded[..., 3] > 0).sum()), 100 * 40)

    def test_an_explicitly_sized_small_image_is_left_alone_with_a_note(self):
        helpers.rect_png(self.dir / "tag.png", (100, 40), (0, 0, 100, 40))
        plan = self.plan(assets={"tag.png": "T"}, picture=[{"file": "tag.png", "type": "image", "x": 10, "y": 900,
                                                              "width": 100, "height": 40, "start": 0, "end": 30}])
        payload, notes = bp.picture_payload(plan)
        (lay,) = payload["layers"]
        self.assertEqual((lay["source"], lay["height"]), ("T", "40"))
        self.assertTrue(any("under 304 px" in n for n in notes), notes)
        self.assertFalse((self.dir / "tag.pad.png").exists())

    def test_a_twin_track_takes_the_asset_id_of_the_file_it_matches(self):
        tracks = json.loads((self.dir / "layers.json").read_text())
        tracks["layers"]["hand2"] = {**tracks["layers"]["hand"], "file": "hand2.mov", "same_as": "hand.mov"}
        helpers.write_json(self.dir / "layers.json", tracks)
        plan = self.plan(tracks="layers.json", assets={"hand.mov": "A2"}, picture=[{"track": "hand"}, {"track": "hand2"}])
        self.assertEqual([lay["source"] for lay in bp.picture_payload(plan)[0]["layers"]], ["A2", "A2"])
        plan = self.plan(tracks="layers.json", assets={"hand.mov": "A2", "hand2.mov": "B2"}, picture=[{"track": "hand2"}])
        self.assertEqual(bp.picture_payload(plan)[0]["layers"][0]["source"], "B2")
        plan = self.plan(tracks="layers.json", assets={}, picture=[{"track": "hand2"}])
        self.assertRaisesRegex(bp.PlanError, "no asset id for hand.mov", bp.picture_payload, plan)

    def test_missing_uploads_are_listed_together(self):
        helpers.write_json(self.dir / "plan.json", {"duration": 15, "tracks": "layers.json", "assets": {},
                                                    "picture": [{"track": "hand"},
                                                                {"file": "small.png", "type": "image", "x": 165, "y": 659,
                                                                 "start": 0, "end": 30}]})
        result = helpers.run("build_passes.py", "picture", self.dir / "plan.json")
        self.assertEqual(result.returncode, 2)
        self.assertIn("no asset id for hand.mov, small.pad.png", result.stderr)

    def test_a_layer_with_no_upload_fails_with_its_name(self):
        helpers.write_json(self.dir / "plan.json", {"duration": 15, "tracks": "layers.json", "assets": {},
                                                    "picture": [{"track": "hand"}]})
        result = helpers.run("build_passes.py", "picture", self.dir / "plan.json")
        self.assertEqual(result.returncode, 2)
        self.assertIn("no asset id for hand.mov", result.stderr)


@unittest.skipUnless(helpers.HAS_FFMPEG, "needs ffmpeg")
class SoundTests(Case):
    def setUp(self):
        super().setUp()
        helpers.write_wav(self.dir / "music.wav", helpers.tone(4.0, amp=0.1))
        helpers.write_wav(self.dir / "bed.wav", helpers.tone(2.0, amp=0.05, freq=200))
        helpers.write_wav(self.dir / "hit.wav", helpers.burst(0.2, amp=0.5))
        self.assets = {"music.wav": "M", "bed.wav": "B", "hit.wav": "H"}

    def test_music_splits_at_each_gain_step_with_offsets_and_10_ms_fades(self):
        plan = self.plan(assets=self.assets, sound={"master_db": -2, "music": [
            {"file": "music.wav", "offset": 0.5, "end": 3.0, "gains": [[0, -4], [1.0, -8], [2.0, -10]], "fade_out_s": 0.6}],
            "hits": []})
        rows, _ = bp.sound_rows(plan)
        layers = [lay for _, _, _, lay in rows]
        self.assertEqual([(lay["startTime"], lay["endTime"], lay["trimStart"]) for lay in layers],
                         [(0.0, 1.0, 0.5), (1.0, 2.0, 1.5), (2.0, 3.0, 2.5)])
        self.assertEqual([lay["volume"] for lay in layers], [0.501, 0.316, 0.251])
        self.assertEqual([(lay["audioFadeIn"], lay["audioFadeOut"]) for lay in layers], [(0.01, 0.01), (0.01, 0.01), (0.01, 0.6)])
        self.assertEqual({lay["source"] for lay in layers}, {"M"})

    def test_hits_take_frame_times_trims_and_their_own_length(self):
        plan = self.plan(assets=self.assets, sound={"master_db": -4, "hits": [
            {"label": "tap", "file": "hit.wav", "frame": 185, "gain_db": -2, "trim_db": -1, "trimStart": 0.06}]})
        (_, label, _, lay), = bp.sound_rows(plan)[0]
        self.assertEqual(label, "tap")
        self.assertEqual(lay, {"source": "H", "type": "audio", "startTime": 6.166, "endTime": 6.306, "volume": 0.447,
                               "trimStart": 0.06})

    def test_past_49_audio_layers_the_bed_is_dropped_first(self):
        hits = [{"file": "hit.wav", "t": 0.25 * k} for k in range(48)]
        plan = self.plan(assets=self.assets, sound={"music": [{"file": "music.wav", "gains": [[0, -10]]}],
                                                    "beds": [{"file": "bed.wav", "t": 1.0}], "hits": hits})
        rows, notes = bp.sound_rows(plan)
        self.assertEqual(len(rows), 49)
        self.assertNotIn("bed", [role for role, _, _, _ in rows])
        self.assertTrue(any("bed" in n for n in notes))
        payload, cues, _ = bp.sound_payload(plan, "SILENT")
        self.assertEqual(len(payload["layers"]), 50)
        self.assertEqual(payload["layers"][0]["source"], "SILENT")

    def test_more_hits_than_the_cap_fail(self):
        plan = self.plan(assets=self.assets, sound={"hits": [{"file": "hit.wav", "t": 0.2 * k} for k in range(50)]})
        with self.assertRaises(bp.PlanError):
            bp.sound_rows(plan)

    def test_hit_margin_honors_the_per_hit_trim(self):
        def margin(**hit):
            plan = self.plan(sound={"master_db": -3, "music": [{"file": "music.wav", "gains": [[0, 0]]}],
                                    "hits": [{"label": "hit", "file": "hit.wav", "t": 1.0, **hit}]})
            with redirect_stdout(io.StringIO()):
                return bp.simulate(plan, self.dir / "sim.wav")["hits"][0]["margin_db"]

        plain = margin()
        self.assertAlmostEqual(plain, 20 * math.log10(0.5 / 0.1), delta=0.3)
        self.assertAlmostEqual(margin(trim_db=-3), plain - 3, delta=0.05)
        self.assertAlmostEqual(margin(gain_db=-2, trim_db=-1.5), plain - 3.5, delta=0.05)

    def test_simulate_sums_with_no_limiter(self):
        plan = self.plan(duration=2.0, sound={"hits": [{"label": "a", "file": "hit.wav", "t": 0.5, "gain_db": 1.584},
                                                       {"label": "b", "file": "hit.wav", "t": 0.5, "gain_db": 1.584}]})
        out = io.StringIO()
        with redirect_stdout(out):
            report = bp.simulate(plan, self.dir / "sim.wav")
        peak = float(np.abs(bp.load_audio(self.dir / "sim.wav")).max())
        self.assertAlmostEqual(peak, 1.2, delta=0.01)
        self.assertGreater(report["true_peak"], 1.0)
        self.assertIn("over the -1.8 dBTP target", out.getvalue())
        self.assertRegex(out.getvalue(), r"\+\d\.\d dBTP at   0\.50 s: a, b")

    def test_windows_are_listed_when_only_the_true_peak_is_over(self):
        t = np.arange(round(0.3 * SR)) / SR  # 12 kHz at 45 degrees: samples at 0.707 of the waveform's peak
        helpers.write_wav(self.dir / "zing.wav", 0.9 * np.sin(2 * np.pi * 12000 * t + np.pi / 4))
        plan = self.plan(duration=2.0, sound={"hits": [{"label": "zing", "file": "zing.wav", "t": 1.0}]})
        out = io.StringIO()
        with redirect_stdout(out):
            report = bp.simulate(plan, self.dir / "sim.wav")
        self.assertLess(report["sample_peak"], -1.8)
        self.assertGreater(report["true_peak"], -1.8)
        self.assertRegex(out.getvalue(), r"dBTP at   1\.(00|05|10|15|20|25) s: zing")
        quiet = io.StringIO()
        with redirect_stdout(quiet):
            bp.simulate(plan, self.dir / "sim.wav", tp_target=1.0)
        self.assertNotIn("dBTP at", quiet.getvalue())

    def test_a_hit_under_another_hit_reads_masked(self):
        helpers.write_wav(self.dir / "chime.wav", helpers.burst(0.2, amp=0.5, seed=7))
        plan = self.plan(duration=2.0, sound={"music": [{"file": "music.wav", "gains": [[0, -20]]}], "hits": [
            {"label": "boom", "file": "hit.wav", "t": 1.0},
            {"label": "chime", "file": "chime.wav", "t": 1.0, "gain_db": -9}]})
        out = io.StringIO()
        with redirect_stdout(out):
            boom, chime = bp.simulate(plan, self.dir / "sim.wav")["hits"]
        self.assertGreater(chime["margin_db"], 4)  # well over the music alone
        self.assertLess(chime["margin_all_db"], 0)
        self.assertEqual(chime["masked_by"], ["boom"])
        self.assertGreater(boom["margin_all_db"], 4)
        lines = {line.split()[2]: line for line in out.getvalue().splitlines() if line.startswith("    1.000 s")}
        self.assertIn("MASKED by boom", lines["chime"])
        self.assertNotIn("MASKED", lines["boom"])

    def test_a_premixed_stem_is_checked_at_every_attack_with_its_trim(self):
        stem = np.zeros(round(0.8 * SR))
        stem[:round(0.2 * SR)] += helpers.burst(0.2, amp=0.5, seed=1)
        stem[round(0.5 * SR):round(0.7 * SR)] += helpers.burst(0.2, amp=0.2, seed=2)  # 8 dB under the first
        helpers.write_wav(self.dir / "stem.wav", stem)
        plan = self.plan(duration=2.0, sound={"music": [{"file": "music.wav", "gains": [[0, 0]]}], "hits": [
            {"label": "stem", "file": "stem.wav", "t": 0.5, "trim_db": -3}]})
        out = io.StringIO()
        with redirect_stdout(out):
            (hit,) = bp.simulate(plan, self.dir / "sim.wav")["hits"]
        # The second attack, 0.5 s in, sits 2x over the 0.1 tone, minus the 3 dB trim.
        self.assertAlmostEqual(hit["margin_db"], 20 * math.log10(0.2 / 0.1) - 3, delta=0.3)
        self.assertIn("LOW", out.getvalue())

    def test_onsets_pass_a_soft_lead_in_and_flag_silence_or_a_late_attack(self):
        lead = 0.003 * helpers.burst(0.012, amp=1.0, seed=4)  # about -50 dB under the hit, like a kit fade-in
        helpers.write_wav(self.dir / "kit.wav", np.concatenate([lead, helpers.burst(0.2, amp=0.5)]))
        helpers.write_wav(self.dir / "gap.wav", np.concatenate([np.zeros(round(0.03 * SR)), helpers.burst(0.2, amp=0.5)]))
        swell = helpers.tone(0.06, amp=0.01, freq=200)  # 34 dB under the hit: sound, but no attack yet
        helpers.write_wav(self.dir / "swell.wav", np.concatenate([swell, helpers.burst(0.2, amp=0.5)]))
        plan = self.plan(duration=2.0, sound={"hits": [{"label": "kit", "file": "kit.wav", "t": 0.2},
                                                       {"label": "gap", "file": "gap.wav", "t": 0.8},
                                                       {"label": "swell", "file": "swell.wav", "t": 1.4},
                                                       {"label": "trimmed", "file": "gap.wav", "t": 1.7,
                                                        "trimStart": 0.03}]})
        out = io.StringIO()
        with redirect_stdout(out):
            kit, gap, swell, trimmed = bp.simulate(plan, self.dir / "sim.wav")["hits"]
        self.assertLess(kit["onset_ms"], 10)
        self.assertAlmostEqual(kit["attack_ms"], 12, delta=1.5)
        self.assertAlmostEqual(gap["onset_ms"], 30, delta=1)
        self.assertGreater(swell["attack_ms"] - swell["onset_ms"], 50)
        # A generated hit placed by its asset id: trimStart at its onset measures from the trim point.
        self.assertLess(trimmed["onset_ms"], 1)
        lines = {line.split()[2]: line for line in out.getvalue().splitlines() if line.startswith("  ") and " s  " in line}
        self.assertNotIn("ms in", lines["kit"])
        self.assertIn("sound starts 30 ms in: raise its trimStart by that much", lines["gap"])
        self.assertIn("attack 60 ms in", lines["swell"])
        self.assertNotIn("ms in", lines["trimmed"])

    def test_a_hit_mostly_above_16_khz_is_low_passed_and_warned(self):
        helpers.write_wav(self.dir / "sparkle.wav", helpers.tone(0.3, amp=0.5, freq=18000))
        plan = self.plan(duration=1.0, sound={"hits": [{"label": "sparkle", "file": "sparkle.wav", "t": 0.2}]})
        out = io.StringIO()
        with redirect_stdout(out):
            report = bp.simulate(plan, self.dir / "sim.wav")
        self.assertGreater(report["hits"][0]["high_share"], 0.99)
        self.assertLess(report["sample_peak"], -40)
        self.assertIn("above 16 kHz", out.getvalue())

    def test_music_start_key_and_the_first_gains_time(self):
        def layers(**music):
            plan = self.plan(assets=self.assets, sound={"music": [{"file": "music.wav", "offset": 0.5, "end": 3.0, **music}]})
            return [(lay["startTime"], lay["endTime"], lay["trimStart"], lay["volume"]) for _, _, _, lay in bp.sound_rows(plan)[0]]

        self.assertEqual(layers(gains=[[1.0, -6]]), [(1.0, 3.0, 1.5, 0.501)])  # no start: the first gains time
        self.assertEqual(layers(start=1.5, gains=[[0, -6], [1.0, -12], [2.0, 0]]),
                         [(1.5, 2.0, 2.0, 0.251), (2.0, 3.0, 2.5, 1.0)])
        with self.assertRaises(bp.PlanError):
            layers(start=0.5, gains=[[1.0, -6]])

    def test_sound_command_writes_the_payload_and_cues(self):
        helpers.write_json(self.dir / "plan.json", {"duration": 5, "sections": [0, 2], "assets": self.assets, "sound": {
            "hits": [{"label": "tap", "file": "hit.wav", "frame": 30, "trimStart": 0.02}]}})
        result = helpers.run("build_passes.py", "sound", self.dir / "plan.json", "SILENT")
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads((self.dir / "payload_sound.json").read_text())
        cues = json.loads((self.dir / "cues.json").read_text())
        self.assertEqual([lay["type"] for lay in payload["layers"]], ["video", "audio"])
        self.assertEqual(payload["compressionLevel"], 18)
        self.assertEqual(cues["sections"], [0, 2])
        (cue,) = cues["cues"]
        self.assertEqual((cue["t"], cue["trimStart"], cue["role"]), (1.0, 0.02, "hit"))
        self.assertTrue(Path(cue["file"]).is_absolute())


if __name__ == "__main__":
    unittest.main()
