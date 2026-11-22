"""lyrics_align.py beyond the partial-lyrics and chant cases: what a transcribe pass writes, onset snapping, lyric
words the transcript lacks, and the fix for a short first word pulled early by a held note."""

import contextlib
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
import unittest.mock as mock

SCRIPTS = Path(__file__).resolve().parents[2] / "skills" / "scenario-kinetic-music-video" / "scripts"
SCRIPT = SCRIPTS / "lyrics_align.py"


def word(w, s, e):
    return {"w": w, "s": s, "e": e}


class TranscribeTest(unittest.TestCase):
    def test_writes_rounded_words_from_the_approved_stem_to_both_copies(self):
        spec = importlib.util.spec_from_file_location("lyrics_align_gaps", SCRIPT)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        calls = []

        def w(text, s, e):
            return types.SimpleNamespace(word=text, start=s, end=e)

        class WhisperModel:
            def __init__(self, *args, **kwargs):
                pass

            def transcribe(self, path, **kwargs):
                calls.append((path, kwargs["initial_prompt"]))
                seg = types.SimpleNamespace(
                    start=1.0, end=2.5, text="  Hello world ", words=[w(" Hello", 1.00049, 1.4), w(" world", 1.6, 2.5)]
                )
                return iter([seg]), None

        fake = types.SimpleNamespace(WhisperModel=WhisperModel)
        with tempfile.TemporaryDirectory() as tmp:
            cwd = Path(tmp)
            (cwd / "engine" / "data").mkdir(parents=True)
            (cwd / "engine" / "data" / "audio.json").write_text(json.dumps({"master": "audio/song.mp3"}), encoding="utf-8")
            (cwd / "stems" / "htdemucs" / "song").mkdir(parents=True)
            (cwd / "stems" / "htdemucs" / "song" / "vocals.wav").write_bytes(b"")
            out = io.StringIO()
            here = os.getcwd()
            os.chdir(cwd)
            try:
                with mock.patch.dict(sys.modules, {"faster_whisper": fake}), \
                        mock.patch.object(sys, "path", [str(SCRIPTS), *sys.path]), contextlib.redirect_stdout(out):
                    mod.transcribe("")
                    mod.transcribe("Hervé")
            finally:
                os.chdir(here)
            stem = str(Path("stems/htdemucs/song/vocals.wav"))
            self.assertEqual(calls, [(stem, None), (stem, "Hervé")])
            expected = [{"start": 1.0, "end": 2.5, "text": "Hello world",
                         "words": [word("Hello", 1.0, 1.4), word("world", 1.6, 2.5)]}]
            for name in ("lyrics_raw.json", "lyrics_raw_plain.json", "lyrics_raw_hints.json"):
                self.assertEqual(json.loads((cwd / "analysis" / name).read_text(encoding="utf-8")), expected)
            self.assertEqual(out.getvalue().splitlines(), ["[   1.00-   2.50] Hello world"] * 2)


class AlignTest(unittest.TestCase):
    def align(self, lyrics, words, onsets, *args):
        with tempfile.TemporaryDirectory() as tmp:
            cwd = Path(tmp)
            (cwd / "engine" / "data").mkdir(parents=True)
            (cwd / "analysis").mkdir()
            (cwd / "engine" / "data" / "audio.json").write_text(
                json.dumps({"vocal_onsets": onsets, "env": {}, "env_fps": 60}), encoding="utf-8")
            (cwd / "analysis" / "lyrics_raw.json").write_text(
                json.dumps([{"start": 0, "end": 0, "text": "", "words": words}]), encoding="utf-8")
            (cwd / "lyrics.txt").write_text(lyrics, encoding="utf-8")
            r = subprocess.run([sys.executable, str(SCRIPT), "align", "lyrics.txt", *args], cwd=cwd,
                               capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.stderr = r.stderr
            return json.loads((cwd / "engine" / "data" / "lyrics.json").read_text(encoding="utf-8"))["lines"]

    def test_starts_snap_to_a_vocal_onset_within_80_ms_only(self):
        words = [word("one", 1.0, 1.4), word("two", 1.5, 1.9)]
        (line,) = self.align("# section: verse\none two\n", words, [1.05, 1.62])
        self.assertEqual([(w["w"], w["s"]) for w in line["words"]], [("one", 1.05), ("two", 1.5)])

    def test_a_lyric_word_missing_from_the_transcript_follows_the_previous_word(self):
        (line,) = self.align("# section: verse\none extra two\n", [word("one", 1.0, 1.3), word("two", 2.0, 2.4)], [])
        self.assertEqual(line["words"], [word("one", 1.0, 1.3), word("extra", 1.3, 1.55), word("two", 2.0, 2.4)])

    def test_a_word_placed_without_a_transcript_match_is_reported_on_stderr(self):
        (line,) = self.align("# section: verse\none extra two\n", [word("one", 1.0, 1.3), word("two", 2.0, 2.4)], [])
        self.assertIn('1.300 s  line 2  "extra"', self.stderr)
        self.assertEqual(set(line), {"section", "text", "words", "s", "e"})
        self.assertNotIn('"one"', self.stderr)
        self.assertNotIn('"two"', self.stderr)

    def test_a_respelled_word_is_reported_with_the_onset_it_was_given(self):
        self.align("# section: verse\nsend it to Herve\n",
                   [word("send", 1.0, 1.3), word("it", 1.3, 1.5), word("to", 1.5, 1.7), word("AirVay", 1.8, 2.4)], [])
        self.assertIn('1.800 s  line 2  "Herve"', self.stderr)

    def test_a_moved_short_first_word_is_reported_at_its_final_onset(self):
        self.align("# section: verse\nuh baby\n", [word("ah", 1.0, 1.2), word("baby", 3.0, 3.5)], [2.6])
        self.assertIn('2.600 s  line 2  "uh"', self.stderr)

    def test_a_fully_matched_line_prints_no_warning(self):
        self.align("# section: verse\none two\n", [word("one", 1.0, 1.4), word("two", 1.5, 1.9)], [])
        self.assertEqual(self.stderr, "")

    def test_short_first_word_moves_to_the_onset_before_the_next_word(self):
        words = [word("oh", 1.0, 1.2), word("baby", 3.0, 3.5)]
        (line,) = self.align("# section: verse\noh baby\n", words, [2.6])
        self.assertEqual(line["words"][0]["s"], 2.6)
        self.assertEqual(line["s"], 2.6)

    def test_short_first_word_without_an_onset_sits_280_ms_early(self):
        (line,) = self.align("# section: verse\noh baby\n", [word("oh", 1.0, 1.2), word("baby", 3.0, 3.5)], [5.0])
        self.assertEqual(line["words"][0]["s"], 2.72)

    def test_lines_before_any_section_header_are_aligned(self):
        (line,) = self.align("one two\n", [word("one", 1.0, 1.4), word("two", 1.5, 1.9)], [])
        self.assertEqual([w["w"] for w in line["words"]], ["one", "two"])

    def test_a_line_before_the_first_header_keeps_no_section_beside_a_headed_one(self):
        words = [word("one", 1.0, 1.4), word("two", 1.5, 1.9), word("three", 3.0, 3.4), word("four", 3.5, 3.9)]
        lines = self.align("one two\n# section: verse\nthree four\n", words, [])
        self.assertEqual([(l["section"], l["text"]) for l in lines], [(None, "one two"), ("verse", "three four")])

    def test_no_fix_keeps_a_listed_short_word_where_it_was_sung(self):
        words = [word("oh", 1.0, 1.2), word("baby", 3.0, 3.5)]
        (line,) = self.align("# section: verse\noh baby\n", words, [2.6], "--no-fix", "oh")
        self.assertEqual(line["words"][0], word("oh", 1.0, 1.2))


if __name__ == "__main__":
    unittest.main()
