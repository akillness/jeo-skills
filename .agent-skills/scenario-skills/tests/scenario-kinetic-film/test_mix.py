"""mix.py with a synthetic kit and a cue list from --info: placement, levels, ducking, stop and loudness."""

import copy
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np

import media

sys.path.insert(0, str(media.SCRIPTS))
import mix  # noqa: E402

SR = mix.SR
INFO = {
    "title": "Mix Test",
    "dur": 4.0,
    "fps": 60,
    "bpm": 120,
    "music": {"file": "audio/music.wav", "offset": 0, "stopBeat": 6, "gain": -3.5},
    "sounds": {"stomp": -1},
    "cues": [
        {"t": 0.5, "name": "impact", "gain": 1},
        {"t": 1.0, "name": "key", "gain": 1},
        {"t": 1.25, "name": "key", "gain": 1},
        {"t": 1.6, "name": "whoosh", "gain": 1},
        {"t": 2.0, "name": "stomp", "gain": 1},
        {"t": 2.5, "name": "riser", "gain": 1, "end": 2.5},
        {"t": 3.0, "name": "logo_hit", "gain": 1},
    ],
}


def hit(seconds, seed, decay, lead=0.05):
    """A decaying noise hit after lead seconds of silence, as generated one-shots often start."""
    rng = np.random.default_rng(seed)
    t = np.arange(int(seconds * SR)) / SR
    x = rng.standard_normal(len(t)) * np.exp(-t / decay)
    x = np.concatenate([np.zeros(int(lead * SR)), x])
    return np.stack([x, x], 1) / np.abs(x).max() * 0.8


def swell(seconds):
    t = np.arange(int(seconds * SR)) / SR
    x = np.random.default_rng(5).standard_normal(len(t)) * np.sin(np.pi * t / seconds) ** 4
    return np.stack([x, x], 1) / np.abs(x).max() * 0.8


def click(freq):
    t = np.arange(int(0.08 * SR)) / SR
    x = np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.02)
    return np.stack([x, x], 1) * 0.8


def level_db(x):
    return 20 * np.log10(np.sqrt((np.asarray(x, np.float64) ** 2).mean()) + 1e-12)


def dominant_hz(x):
    spectrum = np.abs(np.fft.rfft(x[:, 0]))
    return np.fft.rfftfreq(len(x), 1 / SR)[int(np.argmax(spectrum))]


class MixTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.film = Path(cls.tmp.name) / "film"
        sfx = cls.film / "audio" / "sfx"
        sfx.mkdir(parents=True)
        media.write_wav(sfx / "impact.wav", hit(0.6, 1, 0.08), SR)
        media.write_wav(sfx / "logo_hit.wav", hit(1.0, 2, 0.2), SR)
        media.write_wav(sfx / "stomp.wav", hit(0.4, 3, 0.05), SR)
        media.write_wav(sfx / "whoosh.wav", swell(0.6), SR)
        media.write_wav(sfx / "key_1.wav", click(1000), SR)
        media.write_wav(sfx / "key_2.wav", click(2500), SR)
        (sfx / "key_notes.txt").write_text("not a sound")  # ignored: not a key_N variant
        # ignored too: a key_N variant, but not an audio file type
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=3000:duration=0.1", str(sfx / "key_3.mp4")], check=True)
        media.write_wav(cls.film / "audio" / "music.wav", media.noise_bed(6.0, SR), SR)
        cls.kit = str(sfx)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def info(self, **changes):
        info = copy.deepcopy(INFO)
        for k, v in changes.items():
            if k == "music" and v is not None:
                info["music"].update(v)
            else:
                info[k] = v
        return info

    def build(self, info=None, music=False):
        return mix.build_mix(info or self.info(), str(self.film), self.kit, music)

    def window(self, x, t0, t1):
        return x[int(t0 * SR) : int(t1 * SR)]

    def test_cues_land_on_their_times(self):
        x, report = self.build()
        envelope = np.abs(x).max(1)
        # onset-aligned: the impact starts on its cue
        first = np.argmax(envelope > 0.2 * envelope[: int(0.9 * SR)].max()) / SR
        self.assertAlmostEqual(first, 0.5, delta=0.005)
        # peak-aligned with a 0.12 s offset: the whoosh is loudest 0.12 s after its cue
        w = self.window(envelope, 1.45, 2.0)
        self.assertAlmostEqual(1.45 + np.argmax(w) / SR, 1.72, delta=0.04)
        self.assertEqual(report["cues"], 7)
        self.assertEqual(report["count"]["key"], 2)

    def test_only_audio_files_named_for_the_kit(self):
        kit = mix.Kit(self.kit)
        self.assertEqual(len(kit.sounds("key")), 2)
        self.assertEqual(kit.pick("thock|pop|impact"), "impact")
        self.assertIsNone(kit.pick("riser"))

    def test_key_variants_alternate(self):
        x, _ = self.build()
        self.assertAlmostEqual(dominant_hz(self.window(x, 1.0, 1.08)), 1000, delta=30)
        self.assertAlmostEqual(dominant_hz(self.window(x, 1.25, 1.33)), 2500, delta=30)

    def test_spec_sounds_sets_a_custom_level(self):
        loud, _ = self.build(self.info(sounds={"stomp": -1}))
        quiet, _ = self.build(self.info(sounds={"stomp": -21}))
        diff = level_db(self.window(loud, 2.0, 2.2)) - level_db(self.window(quiet, 2.0, 2.2))
        self.assertAlmostEqual(diff, 20, delta=0.5)

    def test_missing_sounds_are_reported(self):
        _, report = self.build()
        self.assertEqual(report["missing"], ["riser"])

    def test_no_music_leaves_silence_between_hits(self):
        x, _ = self.build(music=False)
        self.assertLess(level_db(self.window(x, 0.2, 0.45)), -100)
        y, _ = self.build(music=True)
        self.assertGreater(level_db(self.window(y, 0.2, 0.45)), -40)

    def test_music_stops_dead_on_stop_beat(self):
        x, _ = self.build(self.info(cues=[]), music=True)
        self.assertGreater(level_db(self.window(x, 2.5, 2.95)), -40)
        self.assertLess(level_db(self.window(x, 3.02, 4.0)), -60)

    def test_music_ducks_under_hits(self):
        duck = mix.duck_curve(self.info(), int(4.6 * SR))
        self.assertAlmostEqual(float(duck[int(3.03 * SR)]), 0.5, delta=0.01)  # logo_hit
        self.assertAlmostEqual(float(duck[int(0.53 * SR)]), 0.62, delta=0.01)  # impact
        self.assertAlmostEqual(float(duck[int(2.03 * SR)]), 0.62, delta=0.01)  # a custom sound with a level
        self.assertEqual(float(duck[int(1.4 * SR)]), 1.0)

    def test_the_mix_carries_the_ducked_bed(self):
        # a cue with a level but no file plays nothing, and still ducks the music to 0.62
        x, _ = self.build(self.info(cues=[{"t": 1.0, "name": "boom"}], sounds={"boom": 0}), music=True)
        dip = level_db(self.window(x, 1.03, 1.06)) - level_db(self.window(x, 0.5, 0.53))
        self.assertAlmostEqual(dip, 20 * np.log10(0.62), delta=1.0)

    def test_a_loud_bed_reports_weak_hits(self):
        _, report = self.build(self.info(music={"gain": 20}), music=True)
        self.assertTrue(any(w.startswith("impact@0.50s") for w in report["weak"]), report["weak"])
        _, quiet = self.build(self.info(music={"gain": -30}), music=True)
        self.assertEqual(quiet["weak"], [])

    def test_a_missing_track_is_reported(self):
        _, report = self.build(self.info(music={"file": "audio/none.mp3"}), music=True)
        self.assertIn("no music:", report["music"])

    def run_cli(self, info, *args):
        path = Path(self.tmp.name) / "info.json"
        path.write_text(json.dumps(info))
        env = {**os.environ, "PATH": "/usr/bin:/bin:" + os.path.dirname(subprocess.check_output(["which", "ffmpeg"], text=True).strip())}
        cmd = [sys.executable, "-I", str(media.SCRIPTS / "mix.py"), str(self.film), "--info", str(path), *map(str, args)]
        return subprocess.run(cmd, env=env, capture_output=True, text=True)

    def test_cli_writes_a_normalized_mix(self):
        out = Path(self.tmp.name) / "mix.wav"
        r = self.run_cli(self.info(), "--out", out)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("7 cues, loudness target -14 LUFS", r.stdout)
        self.assertIn("no file for these sounds (their cues are silent): riser", r.stdout)
        with wave.open(str(out)) as w:
            self.assertEqual(w.getframerate(), SR)
            self.assertAlmostEqual(w.getnframes(), round(4.0 * SR), delta=1)
        err = subprocess.run(["ffmpeg", "-i", str(out), "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
        self.assertAlmostEqual(float(re.findall(r"I:\s+(-?[\d.]+) LUFS", err)[-1]), -14, delta=1)
        self.assertFalse(Path(str(out) + ".raw.wav").exists())
        r = self.run_cli(self.info(), "--out", out, "--lufs", -12)
        self.assertEqual(r.returncode, 0, r.stderr)  # a re-run replaces the mix

    def test_cli_nothing_to_mix(self):
        r = self.run_cli(self.info(cues=[], music=None))
        self.assertEqual(r.returncode, 1)
        self.assertIn("nothing to mix", r.stderr)
        self.assertNotIn("Traceback", r.stderr)


def burst(at, total, seconds=0.03):
    """Silence of total seconds with one flat block of signal starting at at: one clean edge, no ripple."""
    x = np.zeros((int(total * SR), 2))
    s = int(at * SR)
    x[s : s + int(seconds * SR)] = 0.8
    return x


def bursts(x):
    """Start times (s) of the separate bursts in a mix."""
    envelope = np.abs(x).max(1)
    on = envelope > 0.5 * envelope.max()
    return list((np.flatnonzero(on[1:] & ~on[:-1]) + 1) / SR)


class MixAlignmentTest(unittest.TestCase):
    """Music offset, end-aligned risers, looped ticks and onset sounds cut to a cue's dur."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.film = Path(self.tmp.name) / "film"
        (self.film / "audio").mkdir(parents=True)

    def kit(self, name, **sounds):
        folder = Path(self.tmp.name) / name
        folder.mkdir()
        for stem, x in sounds.items():
            media.write_wav(folder / f"{stem}.wav", x, SR)
        return str(folder)

    def info(self, cues, music=None):
        return {"title": "Align", "dur": 4.0, "fps": 60, "bpm": 120, "music": music, "cues": cues}

    def test_music_offset_moves_the_track(self):
        # a marker 2.0 s into the track: offset 0.75 plays it at 1.25 s of the film
        media.write_wav(self.film / "audio" / "marker.wav", burst(2.0, 6.0), SR)
        kit = self.kit("none")
        for offset, want in ((0, 2.0), (0.75, 1.25)):
            music = {"file": "audio/marker.wav", "offset": offset, "gain": 0}
            x, report = mix.build_mix(self.info([], music), str(self.film), kit, True)
            self.assertIsNone(report["music"])
            self.assertAlmostEqual(bursts(x)[0], want, delta=0.002, msg=f"offset {offset}")

    def test_a_riser_ends_on_its_end(self):
        riser = np.stack([np.linspace(0, 0.8, int(1.0 * SR))] * 2, 1)  # 1 s swell, cut off sharp
        kit = self.kit("risers", riser=riser)
        x, report = mix.build_mix(self.info([{"t": 1.0, "name": "riser", "gain": 1, "end": 2.5}]), str(self.film), kit, False)
        self.assertEqual(report["missing"], [])
        loud = np.flatnonzero(np.abs(x).max(1) > 1e-3) / SR
        self.assertAlmostEqual(loud[-1], 2.5, delta=0.002)
        self.assertAlmostEqual(loud[0], 1.5, delta=0.01)

    def test_a_tick_run_repeats_for_its_dur(self):
        # tick_run repeats at its own length (0.1 s here); 0.45 s of dur is 5 ticks
        kit = self.kit("ticks", tick_run=burst(0, 0.1, 0.02))
        x, _ = mix.build_mix(self.info([{"t": 1.0, "name": "tick_run", "gain": 1, "dur": 0.45}]), str(self.film), kit, False)
        found = bursts(x)
        self.assertEqual(len(found), 5, found)
        np.testing.assert_allclose(np.diff(found), 0.1, atol=0.002)
        # without a tick_run file, the tick plays every 0.075 s: 0.4 s is 6 ticks
        kit = self.kit("tick_only", tick=burst(0, 0.25, 0.02))
        x, _ = mix.build_mix(self.info([{"t": 1.0, "name": "tick_run", "gain": 1, "dur": 0.4}]), str(self.film), kit, False)
        found = bursts(x)
        self.assertEqual(len(found), 6, found)
        np.testing.assert_allclose(np.diff(found), 0.075, atol=0.002)

    def test_an_onset_sound_stops_after_its_dur(self):
        # a 2 s sustained sound on a cue of 0.5 s: it fades out by 0.5 s, silent after
        long = np.full((int(2.0 * SR), 2), 0.5)
        kit = self.kit("long", scroll=long)
        x, _ = mix.build_mix(self.info([{"t": 1.0, "name": "scroll", "gain": 1, "dur": 0.5}]), str(self.film), kit, False)
        loud = np.flatnonzero(np.abs(x).max(1) > 1e-4) / SR
        self.assertAlmostEqual(loud[0], 1.0, delta=0.002)
        self.assertAlmostEqual(loud[-1], 1.5, delta=0.002)
        self.assertGreater(level_db(x[int(1.05 * SR) : int(1.2 * SR)]), -40)


CORE_KIT = {"whoosh", "whoosh_big", "impact", "impact_big", "hit", "slash", "key", "pop", "tick", "riser", "glitch", "logo_hit"}


class CoreKitTest(unittest.TestCase):
    """sound.md's 12 core sounds play every cue the engine registers."""

    def test_sound_md_lists_the_core_kit(self):
        text = (media.SKILL / "references" / "sound.md").read_text()
        kit = text[text.index("The core kit") : text.index("Those 12 cover every cue")]
        files = re.findall(r"`(\w+?)(?:_\d)?\.wav`", kit)
        self.assertEqual(set(files), CORE_KIT)

    def test_every_engine_cue_has_a_core_sound(self):
        engine = media.SKILL / "assets" / "engine"
        names = set()
        for js in engine.glob("*.js"):
            names |= set(re.findall(r"\bcue\([^,]+,\s*'(\w+)'", js.read_text()))
        self.assertGreater(len(names), 20)
        self.assertIn("scroll", names)
        for name in sorted(names | set(mix.MAP)):
            with self.subTest(cue=name):
                self.assertIn(name, mix.MAP, "a cue with no MAP entry plays only a file of its own name")
                for names_, *_ in mix.MAP[name]:
                    self.assertTrue(set(names_.split("|")) & CORE_KIT, f"{name}: {names_} has no core sound")

    def test_a_core_kit_mix_misses_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            for stem in CORE_KIT:
                media.write_wav(Path(tmp) / f"{stem}.wav", click(1000), SR)
            cues = [{"t": 0.1 + 0.05 * i, "name": n, "gain": 1, "dur": 0.2, "end": 1.0} for i, n in enumerate(mix.MAP)]
            _, report = mix.build_mix({"dur": 3.0, "bpm": 120, "cues": cues}, tmp, tmp, False)
        self.assertEqual(report["missing"], [])


if __name__ == "__main__":
    unittest.main()
