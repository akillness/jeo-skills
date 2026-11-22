"""Runs specialist helpers that need no Maya, with system Python.

- mx_anim.audio_envelope reads real WAV files written with the wave module.
- mx_retopology_uv.main runs retopo-report with retopo_report stubbed, so only the CLI's spec
  loading and report writing run.

Needs nothing beyond the standard library. Every file goes to a temporary folder.
The non-ASCII spec tests need a UTF-8 default encoding, since the CLI opens the spec without one.
"""

import gc
import json
import locale
import pathlib
import struct
import sys
import tempfile
import unittest
import unittest.mock as mock
import warnings
import wave

FAMILY = pathlib.Path(__file__).resolve().parents[2] / "skills/dcc/maya"
_saved_path = list(sys.path)
sys.path[:0] = [
    str(FAMILY / "scenario-maya-animation/scripts"),
    str(FAMILY / "scenario-maya-retopology-uv/scripts"),
]
try:
    import mx_anim
    import mx_retopology_uv
finally:
    # mx_retopology_uv appends the lead's scripts/ at import; keep the runner's path as it was.
    sys.path[:] = _saved_path

UTF8_DEFAULT = locale.getpreferredencoding(False).lower().replace("-", "") == "utf8"


def write_wav(path, frames, channels=1, sample_width=2, rate=240):
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(sample_width)
        w.setframerate(rate)
        if sample_width == 2:
            w.writeframes(struct.pack("<%dh" % len(frames), *frames))
        else:
            w.writeframes(bytes(frames))


def resource_warnings(fn, *args):
    """Call fn, collect garbage, and return the ResourceWarning texts it caused, with the error type raised."""
    raised = None
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always", ResourceWarning)
        try:
            fn(*args)
        except Exception as exc:
            # Keep only the type: a kept traceback holds the leaked file alive past gc.collect().
            raised = type(exc)
        gc.collect()
    return [str(w.message) for w in caught if issubclass(w.category, ResourceWarning)], raised


class AudioEnvelope(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = pathlib.Path(tmp.name)

    def test_mono_16bit_levels_per_frame(self):
        # 240 Hz at 24 fps: 10 samples per frame, and the 25 samples leave a half frame.
        path = self.dir / "mono.wav"
        write_wav(path, [16384] * 10 + [-8192] * 10 + [0] * 5)
        self.assertEqual(mx_anim.audio_envelope(str(path), fps=24.0, start_frame=1),
                         [(1, 1.0), (2, 0.5), (3, 0.0)])

    def test_stereo_16bit_mixes_both_channels(self):
        # Normalizing by the peak cancels any uniform scale, so summing the channels instead of
        # averaging them gives the same output. This pins the mix and the channel stride only.
        path = self.dir / "stereo.wav"
        write_wav(path, [16000, 0] * 10 + [4000, 4000] * 10, channels=2)
        self.assertEqual(mx_anim.audio_envelope(str(path), fps=24.0, start_frame=101),
                         [(101, 1.0), (102, 0.5)])

    def test_silence_does_not_divide_by_zero(self):
        path = self.dir / "silent.wav"
        write_wav(path, [0] * 20)
        self.assertEqual(mx_anim.audio_envelope(str(path)), [(1, 0.0), (2, 0.0)])

    def test_8bit_raises_value_error(self):
        path = self.dir / "mono8.wav"
        write_wav(path, [128] * 20, sample_width=1)
        with self.assertRaisesRegex(ValueError, "16-bit PCM expected, got 1 bytes per sample"):
            mx_anim.audio_envelope(str(path))

    def test_empty_wav_raises_value_error(self):
        # Pins current behavior: zero frames leave nothing for the peak, and max() raises.
        path = self.dir / "empty.wav"
        write_wav(path, [])
        with self.assertRaises(ValueError):
            mx_anim.audio_envelope(str(path))

    def test_missing_file_raises(self):
        with self.assertRaises(FileNotFoundError):
            mx_anim.audio_envelope(str(self.dir / "nope.wav"))

    def test_wav_handle_is_closed(self):
        valid = self.dir / "valid.wav"
        write_wav(valid, [1000] * 20)
        junk = self.dir / "junk.wav"
        junk.write_bytes(b"RIFF\x00\x00\x00\x00JUNK")
        for label, path, error in (("valid", valid, None), ("junk", junk, wave.Error)):
            with self.subTest(wav=label):
                leaks, raised = resource_warnings(mx_anim.audio_envelope, str(path))
                self.assertIs(raised, error)
                self.assertEqual([m for m in leaks if str(path) in m], [])


class RetopoReportCli(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.dir = pathlib.Path(tmp.name)
        self.out = self.dir / "report.json"
        self.calls = []

        def fake_report(mesh, source, openings, joints, cavities, regions, profile=None):
            self.calls.append({"mesh": mesh, "source": source, "openings": openings, "joints": joints,
                               "cavities": cavities, "regions": regions, "profile": profile})
            return {"mesh": mesh, "ok": True}

        patcher = mock.patch.object(mx_retopology_uv, "retopo_report", fake_report)
        patcher.start()
        self.addCleanup(patcher.stop)

    def run_main(self, *extra):
        argv = ["retopo-report", "--mesh", "body_geo", "--source", "scan_high", "--profile", "game",
                "--json", str(self.out), *extra]
        return mx_retopology_uv.main(argv)

    def write_spec(self, text):
        spec = self.dir / "spec.json"
        spec.write_text(text, encoding="utf-8")
        return spec

    def test_spec_fields_reach_the_report(self):
        spec = self.write_spec(json.dumps({"openings": {"eye_L": {"point": [3.1, 162, 8]}}, "joints": ["knee"],
                                           "cavities": None, "regions": {"face": [1, 2]}}))
        rep = self.run_main("--spec", str(spec))
        self.assertEqual(rep, {"mesh": "body_geo", "ok": True})
        self.assertEqual(self.calls, [{"mesh": "body_geo", "source": "scan_high",
                                       "openings": {"eye_L": {"point": [3.1, 162, 8]}}, "joints": ["knee"],
                                       "cavities": None, "regions": {"face": [1, 2]}, "profile": "game"}])
        self.assertEqual(json.loads(self.out.read_text(encoding="utf-8")), rep)

    def test_absent_spec_keys_are_none(self):
        spec = self.write_spec('{"joints": ["elbow"]}')
        self.run_main("--spec", str(spec))
        call = self.calls[0]
        self.assertEqual(call["joints"], ["elbow"])
        self.assertEqual((call["openings"], call["cavities"], call["regions"]), (None, None, None))

    def test_without_spec_passes_none(self):
        rep = self.run_main()
        self.assertEqual(rep, {"mesh": "body_geo", "ok": True})
        self.assertEqual(len(self.calls), 1)
        call = self.calls[0]
        self.assertEqual((call["openings"], call["joints"], call["cavities"], call["regions"]),
                         (None, None, None, None))
        self.assertTrue(self.out.exists())

    def test_malformed_json_raises_before_the_report(self):
        spec = self.write_spec("{nope")
        with self.assertRaises(json.JSONDecodeError):
            self.run_main("--spec", str(spec))
        self.assertEqual(self.calls, [])
        self.assertFalse(self.out.exists())

    def test_missing_spec_raises(self):
        with self.assertRaises(FileNotFoundError):
            self.run_main("--spec", str(self.dir / "missing.json"))
        self.assertEqual(self.calls, [])

    @unittest.skipUnless(UTF8_DEFAULT, "the CLI decodes the spec with the locale encoding")
    def test_non_ascii_spec_decodes_as_utf8(self):
        spec = self.write_spec(json.dumps({"regions": {"fa\u00e7ade": [1]}}, ensure_ascii=False))
        self.run_main("--spec", str(spec))
        self.assertEqual(self.calls[0]["regions"], {"fa\u00e7ade": [1]})

    @unittest.skipUnless(UTF8_DEFAULT, "the CLI decodes the spec with the locale encoding")
    def test_invalid_utf8_spec_raises(self):
        spec = self.dir / "spec.json"
        spec.write_bytes(b'{"regions": {"\xff": [1]}}')
        with self.assertRaises(UnicodeDecodeError):
            self.run_main("--spec", str(spec))
        self.assertEqual(self.calls, [])

    def test_spec_handle_is_closed(self):
        for label, text, error in (("valid", '{"joints": ["knee"]}', None),
                                   ("malformed", "{nope", json.JSONDecodeError)):
            with self.subTest(spec=label):
                spec = self.write_spec(text)
                leaks, raised = resource_warnings(self.run_main, "--spec", str(spec))
                self.assertIs(raised, error)
                self.assertEqual([m for m in leaks if str(spec) in m], [])


if __name__ == "__main__":
    unittest.main()
