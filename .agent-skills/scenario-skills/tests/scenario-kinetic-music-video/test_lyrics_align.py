"""lyrics_align.py: supplied lyrics that cover only part of the song keep their own timing, a chant stays inside its
section, and each transcription pass keeps its own copy."""

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import types
import unittest
from unittest import mock
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "skills" / "scenario-kinetic-music-video" / "scripts" / "lyrics_align.py"


def word(w, s, e):
    return {"w": w, "s": s, "e": e}


class PartialLyricsTest(unittest.TestCase):
    def test_last_word_does_not_absorb_the_rest_of_the_transcript(self):
        with tempfile.TemporaryDirectory() as tmp:
            cwd = Path(tmp)
            (cwd / "engine" / "data").mkdir(parents=True)
            (cwd / "analysis").mkdir()
            (cwd / "engine" / "data" / "audio.json").write_text(json.dumps({"vocal_onsets": [], "env": {}, "env_fps": 60}))
            # The transcript runs on for the whole song; the supplied lyrics stop after one line, and the sung name
            # was transcribed phonetically, so the last lyric word does not match.
            raw = [
                {"start": 1.0, "end": 2.4, "text": "", "words": [
                    word("Send", 1.0, 1.3), word("it", 1.3, 1.5), word("to", 1.5, 1.7), word("AirVay", 1.8, 2.4)]},
                {"start": 10.0, "end": 120.0, "text": "", "words": [
                    word("chief", 10.0, 10.4), word("of", 10.5, 10.6), word("the", 10.7, 10.8),
                    word("leftovers", 11.0, 12.0), word("rest", 119.0, 120.0)]},
            ]
            (cwd / "analysis" / "lyrics_raw.json").write_text(json.dumps(raw))
            (cwd / "lyrics.txt").write_text("# section: chorus\nSend it to Hervé\n")
            r = subprocess.run([sys.executable, str(SCRIPT), "align", "lyrics.txt"], cwd=cwd, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            words = json.loads((cwd / "engine" / "data" / "lyrics.json").read_text())["lines"][0]["words"]
            last = words[-1]
            self.assertEqual(last["w"], "Hervé")
            self.assertLess(last["e"], 5.0)
            self.assertLessEqual(last["e"] - last["s"], 2.0)


def chant_project(cwd, lyrics, peaks):
    """Two transcribed lines (1-2 s and 10-11 s) and a vocal envelope with one short bump per peak time."""
    (cwd / "engine" / "data").mkdir(parents=True)
    (cwd / "analysis").mkdir()
    fps, env = 60, [0.0] * 60 * 30
    for p in peaks:
        for k in range(-3, 4):
            env[round(p * fps) + k] = max(0.0, 1.0 - abs(k) / 4)
    (cwd / "engine" / "data" / "audio.json").write_text(
        json.dumps({"vocal_onsets": [], "env": {"vocal": env}, "env_fps": fps}))
    raw = [{"start": 1.0, "end": 2.0, "text": "", "words": [word("one", 1.0, 1.5), word("two", 1.5, 2.0)]},
           {"start": 10.0, "end": 11.0, "text": "", "words": [word("three", 10.0, 10.5), word("four", 10.5, 11.0)]}]
    (cwd / "analysis" / "lyrics_raw.json").write_text(json.dumps(raw))
    (cwd / "lyrics.txt").write_text(lyrics)


class ChantTest(unittest.TestCase):
    def align(self, lyrics, peaks, chant):
        with tempfile.TemporaryDirectory() as tmp:
            cwd = Path(tmp)
            chant_project(cwd, lyrics, peaks)
            r = subprocess.run([sys.executable, str(SCRIPT), "align", "lyrics.txt", "--chant", chant],
                               cwd=cwd, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            return json.loads((cwd / "engine" / "data" / "lyrics.json").read_text())["lines"]

    def test_mid_song_chant_stays_between_its_neighbors(self):
        lines = self.align("# section: verse\none two\n# section: hook\nGO GO\n# section: verse2\nthree four\n",
                           [4.0, 5.0, 12.0, 20.0], "hook:GO")
        self.assertEqual([l["section"] for l in lines], ["verse", "hook", "verse2"])
        starts = [w["s"] for w in lines[1]["words"]]
        self.assertEqual(len(starts), 2)
        self.assertTrue(all(2.0 < s < 10.0 for s in starts), starts)

    def test_closing_chant_takes_no_more_words_than_its_lines_hold(self):
        lines = self.align("# section: verse\none two\nthree four\n# section: outro\nGO GO\n",
                           [12.0, 13.0, 20.0], "outro:GO")
        self.assertEqual(lines[-1]["section"], "outro")
        self.assertEqual(len(lines[-1]["words"]), 2)
        self.assertLess(lines[-1]["words"][-1]["s"], 14.0)


class RawPathsTest(unittest.TestCase):
    def test_each_pass_keeps_its_own_copy(self):
        spec = importlib.util.spec_from_file_location("lyrics_align", SCRIPT)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        self.assertEqual(mod.raw_paths(""), ["analysis/lyrics_raw.json", "analysis/lyrics_raw_plain.json"])
        self.assertEqual(mod.raw_paths("names"), ["analysis/lyrics_raw.json", "analysis/lyrics_raw_hints.json"])


class TranscribeModelTest(unittest.TestCase):
    def test_whisper_model_is_pinned_to_a_commit(self):
        spec = importlib.util.spec_from_file_location("lyrics_align", SCRIPT)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        loaded = []

        class WhisperModel:
            def __init__(self, *args, **kwargs):
                loaded.append((args, kwargs))

            def transcribe(self, *args, **kwargs):
                return [], None

        mod.stem = lambda: "vocals.wav"
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(sys.modules, {"faster_whisper": types.SimpleNamespace(WhisperModel=WhisperModel)}):
            cwd = os.getcwd()
            os.chdir(tmp)
            try:
                mod.transcribe("")
            finally:
                os.chdir(cwd)
        (args, kwargs), = loaded
        self.assertEqual(args, ("large-v3",))
        self.assertRegex(kwargs["revision"], r"^[0-9a-f]{40}$")


if __name__ == "__main__":
    unittest.main()
