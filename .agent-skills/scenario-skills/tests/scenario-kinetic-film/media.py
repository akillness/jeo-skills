"""Synthetic media for the kinetic-film suites: drum tracks as WAV, clips as lossless FFV1.

Everything is deterministic (seeded) and lossless, so a result holds on every ffmpeg version CI runs.
Audio is WAV only: ffmpeg versions disagree on an MP3's duration.
"""

import subprocess
import wave
from pathlib import Path

import numpy as np

SKILL = Path(__file__).resolve().parents[2] / "skills" / "scenario-kinetic-film"
SCRIPTS = SKILL / "scripts"


def write_wav(path, samples, sr=48000):
    """Write float samples in [-1, 1], shape (n,) or (n, channels), as 16-bit PCM."""
    x = np.asarray(samples, dtype=np.float64)
    if x.ndim == 1:
        x = x[:, None]
    pcm = (np.clip(x, -1, 1) * 32767).round().astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    return path


def _kick(kind, sr):
    if kind == "short":
        # a tight click kick: 70 Hz, 40 ms decay, a 2 ms click on top
        t = np.arange(int(0.12 * sr)) / sr
        body = np.sin(2 * np.pi * 70 * t) * np.exp(-t / 0.04)
        click = np.exp(-t / 0.002) * np.sign(np.sin(2 * np.pi * 1800 * t))
        return 0.9 * body + 0.25 * click
    # a long sub kick: pitch falls from 120 Hz to 45 Hz, 150 ms decay
    t = np.arange(int(0.3 * sr)) / sr
    freq = 45 + 75 * np.exp(-t / 0.03)
    phase = 2 * np.pi * np.cumsum(freq) / sr
    return np.sin(phase) * np.exp(-t / 0.15)


def _noise_hit(sr, length, decay, seed, highpass):
    rng = np.random.default_rng(seed)
    n = rng.standard_normal(int(length * sr))
    if highpass:
        n = np.diff(n, prepend=0)
    t = np.arange(len(n)) / sr
    return n * np.exp(-t / decay) / (np.abs(n).max() + 1e-9)


def _place(track, hit, t, sr, gain=1.0):
    s = int(round(t * sr))
    if s >= len(track):
        return
    e = min(len(track), s + len(hit))
    track[s:e] += gain * hit[: e - s]


def drum_track(
    bpm,
    seconds,
    sr=22050,
    kick="short",
    pattern="four",
    lead_in=0.0,
    drop_beat=None,
    tempo_after=None,
    change_at=None,
):
    """A mono drum loop. Beat 0 sits at lead_in seconds.

    pattern: 'four' (a kick on every beat, snare on 2 and 4, eighth-note hats),
    'twostep' (kick on 1 and the 'and' of 3, snare on 2 and 4, eighth-note hats),
    'offhats' (a kick on every beat and loud hats only on the off-beats).
    drop_beat: before it only quiet hats play; from it the full kit plays, louder.
    tempo_after and change_at (seconds): the tempo changes there.
    """
    track = np.zeros(int(seconds * sr))
    k = _kick(kick, sr)
    snare = _noise_hit(sr, 0.2, 0.05, 1, highpass=False)
    hat = _noise_hit(sr, 0.05, 0.012, 2, highpass=True)
    t, beat, b = lead_in, 0, 60 / bpm
    while t < seconds:
        full = drop_beat is None or beat >= drop_beat
        gain = 1.0 if drop_beat is None or full else 0.15
        if full:
            if pattern in ("four", "offhats") or beat % 4 == 0:
                _place(track, k, t, sr)
            if pattern == "twostep" and beat % 4 == 2:
                _place(track, k, t + b / 2, sr)
            if beat % 2 == 1 and pattern != "offhats":
                _place(track, snare, t, sr, 0.5)
        if pattern == "offhats":
            _place(track, hat, t + b / 2, sr, 0.6 * gain)
        else:
            _place(track, hat, t, sr, 0.25 * gain)
            _place(track, hat, t + b / 2, sr, 0.18 * gain)
        beat += 1
        t += b
        if tempo_after and change_at is not None and t >= change_at:
            b = 60 / tempo_after
    return 0.8 * track / (np.abs(track).max() + 1e-9)


def noise_bed(seconds, sr=48000, seed=3, rms=0.1):
    """Stereo noise with its highs rolled off, a stand-in for a music bed, at the given RMS."""
    rng = np.random.default_rng(seed)
    n = rng.standard_normal((int(seconds * sr), 2))
    k = np.ones(8) / 8
    n = np.stack([np.convolve(n[:, c], k, "same") for c in (0, 1)], axis=1)
    return rms * n / np.sqrt((n**2).mean())


def tone(seconds, freq=440.0, sr=48000, level=0.5, attack=0.0):
    t = np.arange(int(seconds * sr)) / sr
    env = np.minimum(1, t / attack) if attack else np.ones_like(t)
    x = level * np.sin(2 * np.pi * freq * t) * env * np.exp(-t / max(seconds, 1e-3))
    return np.stack([x, x], axis=1)


def write_video(path, frames, fps, codec="ffv1"):
    """Encode an iterable of HxWx3 uint8 BGR frames, losslessly by default (FFV1 in .mkv)."""
    frames = iter(frames)
    first = next(frames)
    h, w = first.shape[:2]
    enc = ["-c:v", "ffv1"] if codec == "ffv1" else codec
    p = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-", *enc, str(path)],
        stdin=subprocess.PIPE,
    )
    p.stdin.write(first.tobytes())
    for f in frames:
        p.stdin.write(np.ascontiguousarray(f).tobytes())
    p.stdin.close()
    if p.wait() != 0:
        raise RuntimeError(f"ffmpeg could not write {path}")
    return path


def texture(w, h, seed=0, blur=3):
    """A smooth random gray texture (uint8 BGR), with enough detail for optical flow."""
    rng = np.random.default_rng(seed)
    small = rng.integers(0, 256, (h // blur + 2, w // blur + 2)).astype(np.float32)
    big = np.kron(small, np.ones((blur, blur), np.float32))[:h, :w]
    k = np.ones(blur) / blur
    big = np.apply_along_axis(lambda r: np.convolve(r, k, "same"), 1, big)
    g = np.clip(big, 0, 255).astype(np.uint8)
    return np.stack([g, g, g], axis=2)


def pan(tex, n, w, h, dx):
    """n frames of a w x h window sliding dx px per frame across tex."""
    for i in range(n):
        x = int(round(i * dx))
        yield tex[:h, x : x + w].copy()


def ffprobe(path, entries, stream="v:0"):
    return subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", stream, "-show_entries", entries, "-of", "csv=p=0", str(path)],
        capture_output=True,
        text=True,
    ).stdout.strip()
