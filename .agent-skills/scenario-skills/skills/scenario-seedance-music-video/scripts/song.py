#!/usr/bin/env python3
"""Read a music master so you can cut to it: hash, loudness, sections, onsets, tempo.

    python3 scripts/song.py master.mp3 -o song.json

The master is opened read only and never written. Use the reported sections as
your shot boundaries and the onsets as your cut points, then check them against
what you can actually hear.
"""
# MIT. Ported from https://github.com/edemaistre/scenario-seedance-2-5-music-video,
# Copyright (c) 2026 Emmanuel de Maistre.

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

SAMPLE_RATE = 22050
HOP = 512
WINDOW = 2048


class SongError(RuntimeError):
    """Anything that should stop the analysis with a readable message."""


def run(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True)


def probe(path: Path) -> dict:
    proc = run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)])
    if proc.returncode != 0:
        raise SongError(f"ffprobe failed: {proc.stderr.decode('utf-8', 'replace').strip()[-500:]}")
    info = json.loads(proc.stdout)
    audio = [s for s in info.get("streams", []) if s.get("codec_type") == "audio"]
    if not audio:
        raise SongError("no audio stream found")
    return {"format": info["format"], "audio": audio[0]}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def decode_mono(path: Path) -> np.ndarray:
    proc = run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "-"]
    )
    if proc.returncode != 0:
        raise SongError(f"ffmpeg decode failed: {proc.stderr.decode('utf-8', 'replace').strip()[-500:]}")
    samples = np.frombuffer(proc.stdout, dtype="<f4")
    if samples.size == 0:
        raise SongError("decoded no audio")
    return samples.astype(np.float32)


def loudness(path: Path) -> dict:
    """EBU R128 via ffmpeg loudnorm, which prints a JSON block on stderr."""
    proc = run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "loudnorm=print_format=json", "-f", "null", "-"]
    )
    text = proc.stderr.decode("utf-8", "replace")
    blocks = re.findall(r"\{[^{}]*\"input_i\"[^{}]*\}", text, re.S)
    if not blocks:
        return {"status": "unavailable"}
    parsed = json.loads(blocks[-1])
    return {
        "status": "measured",
        "integrated_lufs": float(parsed["input_i"]),
        "true_peak_dbtp": float(parsed["input_tp"]),
        "range_lu": float(parsed["input_lra"]),
    }


def frame_signal(samples: np.ndarray) -> np.ndarray:
    count = 1 + max(0, (len(samples) - WINDOW) // HOP)
    if count < 2:
        raise SongError("master is too short to analyse")
    indices = np.arange(WINDOW)[None, :] + HOP * np.arange(count)[:, None]
    return samples[indices] * np.hanning(WINDOW).astype(np.float32)


def envelopes(frames: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    rms = np.sqrt((frames**2).mean(axis=1) + 1e-12)
    spectrum = np.abs(np.fft.rfft(frames, axis=1))
    flux = np.diff(spectrum, axis=0, prepend=spectrum[:1])
    onset = np.maximum(flux, 0).sum(axis=1)
    peak = onset.max()
    return rms, onset / peak if peak > 0 else onset


def pick_onsets(onset: np.ndarray, times: np.ndarray, limit: int = 200) -> list[dict]:
    if len(onset) < 3:
        return []
    local_max = (onset[1:-1] > onset[:-2]) & (onset[1:-1] >= onset[2:])
    candidates = np.flatnonzero(local_max) + 1
    floor = float(onset.mean() + onset.std())
    candidates = [i for i in candidates if onset[i] > floor]
    candidates.sort(key=lambda i: -onset[i])
    chosen = sorted(candidates[:limit])
    return [{"t": round(float(times[i]), 3), "strength": round(float(onset[i]), 4)} for i in chosen]


def tempo_candidates(onset: np.ndarray, hop_seconds: float) -> list[float]:
    """Autocorrelate the onset envelope, weighted toward the range people actually hear.

    Without the weighting a steady track reports its half time or third time just as
    strongly as its real pulse, which is useless for cutting.
    """
    signal = onset - onset.mean()
    correlation = np.correlate(signal, signal, mode="full")[len(signal) - 1 :]
    low = max(1, int(round(60.0 / 200.0 / hop_seconds)))
    high = min(len(correlation) - 1, int(round(60.0 / 50.0 / hop_seconds)))
    if high <= low:
        return []
    lags = np.arange(low, high)
    bpms = 60.0 / (lags * hop_seconds)
    prior = np.exp(-0.5 * (np.log2(bpms / 120.0) / 0.9) ** 2)
    score = correlation[low:high] * prior

    order = np.argsort(score)[::-1]
    found: list[float] = []
    for offset in order:
        bpm = float(bpms[offset])
        if all(abs(bpm - seen) > 4.0 for seen in found):
            found.append(round(bpm, 2))
        if len(found) == 3:
            break
    return found


def cut_candidates(onsets: list[dict], minimum_gap: float = 2.0, limit: int = 16) -> list[dict]:
    """The strongest onsets, thinned out, as a starting shot list."""
    chosen: list[dict] = []
    for onset in sorted(onsets, key=lambda o: -o["strength"]):
        if all(abs(onset["t"] - kept["t"]) >= minimum_gap for kept in chosen):
            chosen.append(onset)
        if len(chosen) == limit:
            break
    return sorted(chosen, key=lambda o: o["t"])


def find_sections(rms: np.ndarray, times: np.ndarray, min_seconds: float = 1.5, threshold_db: float = 2.0) -> list[dict]:
    """Split where the smoothed level shifts and holds. These are your shot boundaries."""
    level = 20 * np.log10(rms + 1e-9)
    span = max(3, int(round(0.5 / (times[1] - times[0]))))
    kernel = np.ones(span) / span
    smooth = np.convolve(level, kernel, mode="same")

    hop_seconds = float(times[1] - times[0])
    min_frames = max(1, int(round(min_seconds / hop_seconds)))
    bounds, last = [0], 0
    for index in range(1, len(smooth)):
        if index - last < min_frames:
            continue
        before = smooth[max(0, index - min_frames) : index].mean()
        after = smooth[index : index + min_frames].mean()
        if abs(after - before) >= threshold_db:
            bounds.append(index)
            last = index
    bounds.append(len(smooth))

    sections = []
    for start, end in zip(bounds, bounds[1:]):
        if end - start < 1:
            continue
        mean_db = float(smooth[start:end].mean())
        sections.append(
            {
                "start": round(float(times[start]), 3),
                "end": round(float(times[min(end, len(times) - 1)]), 3),
                "level_db": round(mean_db, 1),
            }
        )
    quiet = min((s["level_db"] for s in sections), default=0.0)
    loud = max((s["level_db"] for s in sections), default=0.0)
    for section in sections:
        share = 0.0 if loud == quiet else (section["level_db"] - quiet) / (loud - quiet)
        section["energy"] = "low" if share < 0.34 else ("medium" if share < 0.67 else "high")
    return sections


def analyse(path: Path) -> dict:
    path = Path(path)
    if not path.is_file():
        raise SongError(f"file not found: {path}")
    info = probe(path)
    samples = decode_mono(path)
    frames = frame_signal(samples)
    times = np.arange(len(frames)) * (HOP / SAMPLE_RATE)
    rms, onset = envelopes(frames)
    onsets = pick_onsets(onset, times)

    return {
        "file": {
            "path": str(path),
            "sha256": sha256_file(path),
            "duration_seconds": round(float(info["format"]["duration"]), 6),
            "codec": info["audio"]["codec_name"],
            "sample_rate": int(info["audio"]["sample_rate"]),
            "channels": int(info["audio"]["channels"]),
        },
        "loudness": loudness(path),
        "tempo_bpm_candidates": tempo_candidates(onset, HOP / SAMPLE_RATE),
        "sections": find_sections(rms, times),
        "cut_candidates": cut_candidates(onsets),
        "onsets": onsets,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read a music master before cutting to it.")
    parser.add_argument("master", type=Path)
    parser.add_argument("-o", "--output", type=Path, default=None, help="write JSON here instead of stdout")
    args = parser.parse_args(argv)

    try:
        result = analyse(args.master)
    except SongError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    text = json.dumps(result, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + "\n")
        print(f"wrote {args.output}", file=sys.stderr)
    else:
        print(text)

    sections = result["sections"]
    print(
        f"\n{result['file']['duration_seconds']:.2f}s  "
        f"{result['loudness'].get('integrated_lufs', 'n/a')} LUFS  "
        f"{len(sections)} sections  {len(result['cut_candidates'])} cut candidates  "
        f"tempo {result['tempo_bpm_candidates']}",
        file=sys.stderr,
    )
    for section in sections:
        print(f"  {section['start']:7.2f} to {section['end']:7.2f}  {section['energy']:<6} {section['level_db']:6.1f} dB", file=sys.stderr)
    print("  cut candidates: " + ", ".join(f"{c['t']:.2f}" for c in result["cut_candidates"]), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
