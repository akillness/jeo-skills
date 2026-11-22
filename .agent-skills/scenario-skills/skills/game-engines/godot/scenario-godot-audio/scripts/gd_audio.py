#!/usr/bin/env python3
"""gd_audio: the runner side of scenario-godot-audio (Godot 4.7.2, macOS). System python3, standard library;
ffmpeg/ffprobe on PATH for analysis (numpy used when present, never required).

    install(project)                          copy scripts/agentkit/audio/*.gd to res://addons/agentkit/audio/
    read_import(path) / set_import_params(path, params)       .import [params] of one asset
    audit_imports(project, music_dirs=("music",), sfx_max_s=5.0)   import rules for every audio asset
    analyze(path)                             ffprobe + astats + ebur128 + silencedetect -> dict
    read_wav(path) -> (rate, channels, [mono floats])           16-bit PCM WAV (stdlib wave)
    tone_track(path, freqs, win=0.05)         per-window Goertzel level (dB) of each frequency
    dominant(track, floor_db=-40)             per-window name of the loudest tracked frequency
    first_time(track, name, floor_db=-30)     first window time where `name` is present
    estimate_pitch(path)                      fundamental from zero crossings (pure tones and decays)
    loop_seam(path)                           sample jump across the end -> start boundary
    loudness_offset_db(path, target_lufs)     volume_db that levels a file without re-encoding
    bars_for(seconds, bpm)                    beat_count for the .import, on-grid check
    prepare_ai_audio(src, dst, kind, ...)     trim, loudness-normalise and convert a generated file
    movie_audio(avi, wav)                     extract the PCM track of a --write-movie AVI
    waveform_png(path, out) / spectrogram_png(path, out)   pictures to open and look at
"""
from __future__ import annotations

__version__ = "0.1"

import json
import math
import os
import re
import shutil
import struct
import time
import subprocess
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
AGENTKIT_AUDIO = HERE / "agentkit" / "audio"
AUDIO_EXT = (".wav", ".ogg", ".mp3")


# ------------------------------------------------------------------ project side

def install(project) -> Path:
    """Copy the audio AgentKit modules into <project>/addons/agentkit/audio/ (overwrites)."""
    dst = Path(project) / "addons" / "agentkit" / "audio"
    dst.mkdir(parents=True, exist_ok=True)
    for f in sorted(AGENTKIT_AUDIO.glob("*.gd")):
        shutil.copy2(f, dst / f.name)
    return dst


def read_import(path) -> dict:
    """[params] of `<asset>.import` (pass the asset or the .import path) as raw Godot literals."""
    p = Path(path)
    if p.suffix != ".import":
        p = p.with_name(p.name + ".import")
    params, section = {}, None
    for line in p.read_text().splitlines():
        line = line.strip()
        if line.startswith("[") and line.endswith("]"):
            section = line[1:-1]
            continue
        if section == "params" and "=" in line:
            k, v = line.split("=", 1)
            params[k] = v
        elif section == "remap" and line.startswith("importer="):
            params["_importer"] = line.split("=", 1)[1].strip('"')
    return params


def _lit(v) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def set_import_params(path, params: dict) -> dict:
    """Edit keys in the [params] section of the .import file in place. Run gd_run.import_project()
    afterwards: --import reimports assets whose .import changed (verified 4.7.2). Once in testing an
    edited .import was not picked up (loop stayed false); touching the file fixed it, so the mtime is
    now pushed at least 2 s past its previous value. Confirm on the loaded resource, never on the
    .import text [added]. Returns the old values."""
    p = Path(path)
    if p.suffix != ".import":
        p = p.with_name(p.name + ".import")
    lines = p.read_text().splitlines()
    old, section, seen = {}, None, set()
    for i, line in enumerate(lines):
        s = line.strip()
        if s.startswith("[") and s.endswith("]"):
            section = s[1:-1]
            continue
        if section == "params" and "=" in s:
            k = s.split("=", 1)[0]
            if k in params:
                old[k] = s.split("=", 1)[1]
                lines[i] = f"{k}={_lit(params[k])}"
                seen.add(k)
    missing = [k for k in params if k not in seen]
    if missing:
        j = next(i for i, l in enumerate(lines) if l.strip() == "[params]")
        for k in missing:
            j += 1
            lines.insert(j, f"{k}={_lit(params[k])}")
    prev = p.stat().st_mtime
    p.write_text("\n".join(lines) + "\n")
    t = max(time.time(), prev + 2.0)
    os.utime(p, (t, t))
    return old


def _duration(path: Path) -> float:
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                             capture_output=True, text=True, timeout=60).stdout.strip()
        return float(out)
    except Exception:
        return -1.0


def audit_imports(project, music_dirs=("music",), sfx_max_s: float = 5.0) -> dict:
    """Import rules for every .wav/.ogg/.mp3 under the project (skips addons/ and .godot/).
    Music = files under a folder named in music_dirs. Rules (importing doc + experts):
      music not looping; music without bpm/beat_count; long WAV (> sfx_max_s) that should be Ogg/MP3;
      stereo WAV SFX (Force > Mono halves size, positional players fold to mono anyway [added]);
      WAV stored as PCM when QOA (default) would do; 8-bit forcing; .import missing (not imported)."""
    root = Path(project)
    rows, flags = [], []
    for f in sorted(root.rglob("*")):
        if f.suffix.lower() not in AUDIO_EXT or "addons" in f.parts or ".godot" in f.parts or ".agent_out" in f.parts:
            continue
        rel = str(f.relative_to(root))
        imp = f.with_name(f.name + ".import")
        if not imp.exists():
            flags.append(f"{rel}: not imported (run gd_run.import_project)")
            continue
        prm = read_import(f)
        dur = _duration(f)
        is_music = any(part in music_dirs for part in f.relative_to(root).parts[:-1])
        row = {"file": rel, "importer": prm.get("_importer"), "seconds": round(dur, 3), "music": is_music, "params": prm}
        rows.append(row)
        if f.suffix.lower() == ".wav":
            ch = _channels(f)
            row["channels"] = ch
            if dur > sfx_max_s:
                flags.append(f"{rel}: {dur:.1f} s WAV; long sounds and music belong in Ogg Vorbis or MP3")
            if not is_music and ch == 2 and prm.get("force/mono") != "true":
                flags.append(f"{rel}: stereo SFX; set force/mono=true unless it is a non-positional stereo sound")
            if prm.get("compress/mode") == "0":
                flags.append(f"{rel}: PCM (uncompressed); Quite OK Audio (mode 2) is the default and near-transparent")
            if prm.get("force/8_bit") == "true":
                flags.append(f"{rel}: force/8_bit loses quality (importing doc)")
        if is_music:
            if prm.get("loop", prm.get("edit/loop_mode")) in ("false", "0", None):
                flags.append(f"{rel}: music that does not loop (fine only for stingers and one-shot cues)")
            if prm.get("bpm", "0") in ("0", "0.0"):
                flags.append(f"{rel}: bpm 0; AudioStreamInteractive beat/bar exits and fades need BPM")
            elif prm.get("beat_count", "0") == "0":
                flags.append(f"{rel}: beat_count 0; set it to the musical length (trims a silent tail)")
    return {"ok": not flags, "flags": flags, "files": rows}


def _channels(path: Path) -> int:
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=channels", "-of", "csv=p=0", str(path)],
                             capture_output=True, text=True, timeout=60).stdout.strip()
        return int(out.splitlines()[0])
    except Exception:
        return -1


# ------------------------------------------------------------------ offline analysis (ffmpeg)

def analyze(path, silence_db: float = -60.0, silence_min_s: float = 0.05) -> dict:
    """Numbers an agent can judge without ears. Keys: seconds, rate, channels, codec, peak_db,
    rms_db, dc_offset, clipped_samples (|x| >= 0.999, from astats), lufs_i, lra, true_peak_dbtp,
    lead_silence_s, tail_silence_s, silences [[start, end]]."""
    p = str(path)
    info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                                      "stream=sample_rate,channels,codec_name:format=duration", "-of", "json", p],
                                     capture_output=True, text=True, timeout=60).stdout or "{}")
    st = (info.get("streams") or [{}])[0]
    dur = float(info.get("format", {}).get("duration", 0) or 0)
    r = {"file": p, "seconds": round(dur, 4), "rate": int(st.get("sample_rate", 0) or 0),
         "channels": int(st.get("channels", 0) or 0), "codec": st.get("codec_name")}
    log = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", p, "-af",
                          f"astats=measure_overall=Peak_level+RMS_level+DC_offset+Number_of_samples:measure_perchannel=none,"
                          f"silencedetect=noise={silence_db}dB:d={silence_min_s},ebur128=peak=true",
                          "-f", "null", "-"], capture_output=True, text=True, timeout=600).stderr

    def last(rx, cast=float):
        m = re.findall(rx, log)
        if not m:
            return None
        v = m[-1]
        try:
            return cast(v)
        except ValueError:
            return v

    r["peak_db"] = last(r"Peak level dB:\s*(-?[\d.]+|-inf)")
    r["rms_db"] = last(r"RMS level dB:\s*(-?[\d.]+|-inf)")
    r["dc_offset"] = last(r"DC offset:\s*(-?[\d.]+)")
    summ = log[log.rfind("Summary:"):] if "Summary:" in log else ""
    m = re.search(r"I:\s*(-?[\d.]+|-inf) LUFS", summ)
    r["lufs_i"] = float(m.group(1)) if m and m.group(1) != "-inf" else None
    m = re.search(r"LRA:\s*(-?[\d.]+) LU", summ)
    r["lra"] = float(m.group(1)) if m else None
    m = re.search(r"Peak:\s*(-?[\d.]+|-inf) dBFS", summ)
    r["true_peak_dbtp"] = float(m.group(1)) if m and m.group(1) != "-inf" else None
    starts = [float(x) for x in re.findall(r"silence_start:\s*(-?[\d.]+)", log)]
    ends = [float(x) for x in re.findall(r"silence_end:\s*(-?[\d.]+)", log)]
    sil = []
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else dur
        sil.append([round(max(0.0, s), 4), round(e, 4)])
    r["silences"] = sil
    r["lead_silence_s"] = round(sil[0][1], 4) if sil and sil[0][0] <= 0.001 else 0.0
    r["tail_silence_s"] = round(dur - sil[-1][0], 4) if sil and abs(sil[-1][1] - dur) < 0.01 else 0.0
    if r["peak_db"] is not None and isinstance(r["peak_db"], float):
        r["clipped"] = r["peak_db"] >= -0.01
    return r


def read_wav(path):
    """(rate, channels, mono float samples) of a 16-bit PCM WAV, mono = mean of channels."""
    with wave.open(str(path), "rb") as w:
        rate, ch, sw, n = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
        raw = w.readframes(n)
    if sw != 2:
        raise ValueError(f"{path}: {sw * 8}-bit WAV; convert with ffmpeg -c:a pcm_s16le")
    vals = struct.unpack("<%dh" % (len(raw) // 2), raw)
    if ch == 1:
        mono = [v / 32768.0 for v in vals]
    else:
        mono = [sum(vals[i:i + ch]) / (ch * 32768.0) for i in range(0, len(vals), ch)]
    return rate, ch, mono


def read_wav_channels(path):
    """(rate, [channel float lists]) of a 16-bit PCM WAV."""
    with wave.open(str(path), "rb") as w:
        rate, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        raw = w.readframes(n)
    vals = struct.unpack("<%dh" % (len(raw) // 2), raw)
    return rate, [[v / 32768.0 for v in vals[c::ch]] for c in range(ch)]


def _goertzel_db(x, freq, rate) -> float:
    n = len(x)
    if n == 0:
        return -200.0
    k = 2.0 * math.cos(2.0 * math.pi * freq / rate)
    s1 = s2 = 0.0
    for v in x:
        s0 = v + k * s1 - s2
        s2, s1 = s1, s0
    pw = s1 * s1 + s2 * s2 - k * s1 * s2
    amp = 2.0 * math.sqrt(max(pw, 0.0)) / n
    return 20.0 * math.log10(amp) if amp > 1e-10 else -200.0


def tone_track(path, freqs: dict, win: float = 0.05) -> dict:
    """{"t": [window starts], name: [dB per window]} for each name->frequency in `freqs`.
    Synthetic test clips use one pure tone per clip, so the track shows which clip is audible when."""
    rate, _, x = read_wav(path)
    n = max(1, int(win * rate))
    out = {"t": [], "win": win}
    for name in freqs:
        out[name] = []
    for i in range(0, len(x) - n + 1, n):
        seg = x[i:i + n]
        out["t"].append(round(i / rate, 4))
        for name, f in freqs.items():
            out[name].append(round(_goertzel_db(seg, f, rate), 2))
    return out


def dominant(track: dict, floor_db: float = -40.0) -> list:
    names = [k for k in track if k not in ("t", "win")]
    res = []
    for i in range(len(track["t"])):
        best, bv = None, floor_db
        for nme in names:
            if track[nme][i] > bv:
                best, bv = nme, track[nme][i]
        res.append(best)
    return res


def first_time(track: dict, name: str, floor_db: float = -30.0, after: float = 0.0):
    for t, v in zip(track["t"], track[name]):
        if t >= after and v > floor_db:
            return t
    return None


def estimate_pitch(path, start: float = 0.0, seconds: float = 0.1) -> float:
    """Fundamental (Hz) from positive-going zero crossings in a window; fine for tonal test sounds."""
    rate, _, x = read_wav(path)
    a, b = int(start * rate), int((start + seconds) * rate)
    seg = x[a:b]
    zc = [i for i in range(1, len(seg)) if seg[i - 1] < 0.0 <= seg[i]]
    if len(zc) < 3:
        return 0.0
    return (len(zc) - 1) * rate / (zc[-1] - zc[0])


def loop_seam(path, window: int = 64) -> dict:
    """How hard the end -> start jump of a loop is. `jump` is |last - first| sample (0..2);
    `ratio` compares it with the typical sample step inside the file (1 = as smooth as the body,
    >> 1 = an audible click). Encoded MP3/Ogg also add padding: check `lead_silence_s` in analyze()."""
    rate, chans = read_wav_channels(path)
    worst = {"jump": 0.0, "ratio": 0.0}
    for x in chans:
        if len(x) < 2 * window:
            continue
        steps = [abs(x[i] - x[i - 1]) for i in range(1, len(x))]
        steps_sorted = sorted(steps)
        typical = steps_sorted[int(0.95 * (len(steps_sorted) - 1))] or 1e-6
        jump = abs(x[0] - x[-1])
        if jump > worst["jump"]:
            worst = {"jump": round(jump, 5), "ratio": round(jump / typical, 2), "typical_step_p95": round(typical, 5)}
    worst["click"] = worst["ratio"] > 3.0
    return worst


# ------------------------------------------------------------------ generated audio intake

KIND_DEFAULTS = {
    # Loudness targets are a project choice: hold every file of a kind within about 1 LU of its
    # target, then mix with buses. Values below are starting points [added], not expert numbers.
    "sfx": {"lufs": -18.0, "mono": True, "rate": 44100, "fmt": "wav", "trim": True},
    "voice": {"lufs": -18.0, "mono": True, "rate": 44100, "fmt": "wav", "trim": True},
    "music": {"lufs": -18.0, "mono": False, "rate": 44100, "fmt": "keep", "trim": False},
    "ambience": {"lufs": -24.0, "mono": False, "rate": 44100, "fmt": "keep", "trim": False},
}


def prepare_ai_audio(src, dst, kind: str = "sfx", lufs: float | None = None, true_peak: float = -1.0,
                     trim: bool | None = None, mono: bool | None = None, rate: int | None = None,
                     trim_db: float = -50.0, short_peak_db: float = -3.0) -> dict:
    """Condition a generated file (Scenario / ElevenLabs MP3 or WAV) before it enters the project:
    optional silence trim at both ends, two-pass EBU R128 loudness normalisation (ffmpeg loudnorm,
    linear mode) for sounds of 3 s or more, sample-peak levelling (short_peak_db) below that, mono and sample rate for SFX and voice, PCM WAV for short sounds.
    Music keeps its codec (MP3 stays MP3: re-encoding adds a generation of loss and new padding).
    Returns {before, after, cmd}. Never overwrites src."""
    d = dict(KIND_DEFAULTS[kind])
    lufs = d["lufs"] if lufs is None else lufs
    trim = d["trim"] if trim is None else trim
    mono = d["mono"] if mono is None else mono
    rate = d["rate"] if rate is None else rate
    src, dst = Path(src), Path(dst)
    if src.resolve() == dst.resolve():
        raise ValueError("dst must differ from src (never overwrite the generated original)")
    dst.parent.mkdir(parents=True, exist_ok=True)
    before = analyze(src)
    filters = []
    if trim:
        filters.append(f"silenceremove=start_periods=1:start_threshold={trim_db}dB:start_silence=0.005,"
                       f"areverse,silenceremove=start_periods=1:start_threshold={trim_db}dB:start_silence=0.02,areverse")
    trimmed_s = before["seconds"] - (before["lead_silence_s"] + before["tail_silence_s"] if trim else 0.0)
    js = None
    if trimmed_s < 3.0:
        # EBU R128 integration needs seconds of signal: loudnorm missed -18 by 3 LU on a 0.5 s hit
        # (observed 2026-10-02). Short one-shots are levelled by sample peak instead [added].
        pk = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(src), "-af",
                             ",".join(filters + ["astats=measure_overall=Peak_level:measure_perchannel=none"]),
                             "-f", "null", "-"], capture_output=True, text=True, timeout=600).stderr
        peak = float(re.findall(r"Peak level dB:\s*(-?[\d.]+)", pk)[-1])
        filters.append(f"volume={short_peak_db - peak:.2f}dB")
        mode = f"peak {short_peak_db} dBFS (short sound)"
    else:
        meas = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(src), "-af",
                               ",".join(filters + [f"loudnorm=I={lufs}:TP={true_peak}:LRA=11:print_format=json"]),
                               "-f", "null", "-"], capture_output=True, text=True, timeout=600).stderr
        js = json.loads(meas[meas.rfind("{"):meas.rfind("}") + 1])
        filters.append(f"loudnorm=I={lufs}:TP={true_peak}:LRA=11:measured_I={js['input_i']}:measured_TP={js['input_tp']}:"
                       f"measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}:offset={js['target_offset']}:linear=true")
        mode = f"loudnorm {lufs} LUFS"
    if trim:
        filters.append("afade=t=in:d=0.005")   # 5 ms ramp so the trimmed start cannot click [added]
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(src), "-af", ",".join(filters),
           "-ar", str(rate)]
    if mono:
        cmd += ["-ac", "1"]
    ext = dst.suffix.lower()
    if ext == ".wav":
        cmd += ["-c:a", "pcm_s16le"]
    elif ext == ".mp3":
        cmd += ["-c:a", "libmp3lame", "-b:a", "192k"]
    elif ext == ".ogg":
        cmd += ["-c:a", "libvorbis" if _has_encoder("libvorbis") else "vorbis", "-strict", "-2", "-q:a", "6"]
    cmd.append(str(dst))
    subprocess.run(cmd, check=True, timeout=600)
    return {"before": before, "after": analyze(dst), "mode": mode, "loudnorm_first_pass": js, "cmd": cmd}


def loudness_offset_db(path, target_lufs: float = -18.0, true_peak_ceiling: float = -1.0) -> dict:
    """Gain (dB) that brings a file to target_lufs without re-encoding it: put it in the player's
    volume_db (or the stream's import, for WAV normalise). Capped so the true peak stays under the
    ceiling; `capped` tells you the file is too peaky to reach the target by gain alone [added]."""
    a = analyze(path)
    if a["lufs_i"] is None:
        return {"gain_db": 0.0, "error": "no loudness (silent?)", "analysis": a}
    gain = target_lufs - a["lufs_i"]
    capped = False
    if a["true_peak_dbtp"] is not None and a["true_peak_dbtp"] + gain > true_peak_ceiling:
        gain = true_peak_ceiling - a["true_peak_dbtp"]
        capped = True
    return {"gain_db": round(gain, 2), "capped": capped, "lufs_i": a["lufs_i"], "true_peak_dbtp": a["true_peak_dbtp"]}


def _has_encoder(name: str) -> bool:
    out = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
    return re.search(rf"\s{name}\s", out) is not None


def bars_for(seconds: float, bpm: float, bar_beats: int = 4) -> dict:
    """Beat and bar count of a clip at a known BPM. `beat_count` is what the .import needs; a
    non-integer `beats_exact` means the file is not cut on the beat grid (ask for a re-cut or trim)."""
    beats = seconds * bpm / 60.0
    return {"beats_exact": round(beats, 3), "beat_count": int(round(beats)), "bars": round(beats / bar_beats, 3),
            "on_grid": abs(beats - round(beats)) < 0.05}


# ------------------------------------------------------------------ renders and pictures

def movie_audio(avi, wav) -> dict:
    """Extract the PCM track that --write-movie <file>.avi stores next to the MJPEG frames."""
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(avi), "-vn", "-c:a", "pcm_s16le", str(wav)],
                   check=True, timeout=600)
    return analyze(wav)


def waveform_png(path, out, size=(1600, 300)) -> str:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(path), "-filter_complex",
                    f"showwavespic=s={size[0]}x{size[1]}:split_channels=1:colors=white|cyan", "-frames:v", "1", str(out)],
                   check=True, timeout=300)
    return str(out)


def spectrogram_png(path, out, size=(1600, 400)) -> str:
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(path), "-lavfi",
                    f"showspectrumpic=s={size[0]}x{size[1]}:legend=1:scale=log", str(out)], check=True, timeout=300)
    return str(out)


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        print(json.dumps(analyze(sys.argv[1]), indent=2))
