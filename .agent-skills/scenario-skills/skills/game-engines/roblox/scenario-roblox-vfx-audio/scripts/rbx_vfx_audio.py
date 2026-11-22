#!/usr/bin/env python3
"""Runner-side helpers for scenario-roblox-vfx-audio (VFX and the Roblox Audio API).

    kit_source(names) -> str                       this skill's AgentKit modules as Luau locals
    run(studio, code, dm="Edit", kit=(), lead_kit=())   rbx_run.run with both kits inlined
    sync_runtime(studio) -> dict                   copy runtime/*.luau into the open place as ModuleScripts
    timeline(studio, build, times, out_dir, cam, at, dm="Edit")  freeze-frame captures
    make_flipbook(frames, out, cols=4, size=1024) -> dict  frames to a 1024 px Grid NxN sheet (Pillow)
    check_flipbook(png, layout="Grid4x4") -> dict  size, multiple of the grid, transparent gutters
    check_audio(path) -> dict                      ffprobe against the Roblox import limits
    prepare_audio(src, out, kind="sfx") -> dict    ffmpeg: 48 kHz, trimmed, leveled, then check_audio

Import from a sibling script:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1].parent / "scenario-roblox-vfx-audio" / "scripts"))
The lead's toolkit (rbx_run, rbx_review, rbx_mcp) is found the same way and imported here.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
LEAD = HERE.parents[1] / "scenario-roblox-expert" / "scripts"
sys.path.insert(0, str(LEAD))
import rbx_run  # noqa: E402

KIT = HERE / "agentkit" / "vfx-audio"
RUNTIME = KIT / "runtime"

# Roblox audio import limits (audio/assets.md, version deltas): under 20 MB, under 7 minutes, 48 kHz max,
# mp3 ogg wav flac, mono or stereo 2.0, 3.0, 5.1.
AUDIO_MAX_BYTES = 20 * 1024 * 1024
AUDIO_MAX_SECONDS = 7 * 60
AUDIO_MAX_RATE = 48000
AUDIO_FORMATS = {"mp3", "ogg", "wav", "flac"}
AUDIO_CHANNELS = {1, 2, 3, 6}
GRIDS = {"Grid2x2": 2, "Grid4x4": 4, "Grid8x8": 8}


# ----------------------------------------------------------------------------------------- Luau side

def kit_source(names: list[str] | tuple[str, ...] = ()) -> str:
    parts = []
    for n in names:
        src = (KIT / f"{n}.luau").read_text()
        parts.append(f"local {n} = (function()\n{src}\nend)()")
    return "\n".join(parts) + ("\n" if parts else "")


def run(studio, code: str, dm: str = "Edit", kit: list[str] | tuple[str, ...] = (),
        lead_kit: list[str] | tuple[str, ...] = (), timeout: float | None = None) -> dict:
    """rbx_run.run with this skill's kit inlined before `code`; error lines are shifted back to `code`."""
    head = kit_source(kit)
    r = rbx_run.run(studio, head + code, dm=dm, timeout=timeout, kit=list(lead_kit))
    n = head.count("\n")
    if n and r.get("error"):
        r["error"] = re.sub(r"AssistantCommand:(\d+)",
                            lambda m: f"AssistantCommand:{int(m[1]) - n}" if int(m[1]) > n
                            else f"AssistantCommand:kit{m[1]}", r["error"])
    return r


def _long_string(text: str) -> str:
    level = 1
    while f"]{'=' * level}]" in text:
        level += 1
    eq = "=" * level
    return f"[{eq}[\n{text}]{eq}]"


def sync_runtime(studio, folder: str = "ReplicatedStorage.VfxAudio") -> dict:
    """Write VfxKit, AudioKit and runtime/*.luau into the open place as ModuleScripts under `folder`.

    Each module is a NEW instance (the old one is destroyed): the Edit data model caches require()
    results per ModuleScript across execute_luau calls, so rewriting Source would keep serving the old
    code. Script.Source is writable at the plugin level that execute_luau runs at."""
    lines = [f'local root = game:GetService("{folder.split(".")[0]}")']
    for part in folder.split(".")[1:]:
        lines.append(f'root = root:FindFirstChild("{part}") or (function() local f = Instance.new("Folder") '
                     f'f.Name = "{part}" f.Parent = root return f end)()')
    lines.append("local names = {}")
    for f in [KIT / "VfxKit.luau", KIT / "AudioKit.luau", *sorted(RUNTIME.glob("*.luau"))]:
        lines.append(f'do local old = root:FindFirstChild("{f.stem}") if old then old:Destroy() end '
                     f'local m = Instance.new("ModuleScript") '
                     f'm.Name = "{f.stem}" m.Source = {_long_string(f.read_text())} m.Parent = root '
                     f'table.insert(names, m.Name) end')
    lines.append("return names")
    return rbx_run.run(studio, "\n".join(lines), "Edit")


def timeline(studio, build: str, times: list[float], out_dir: str | Path, cam: list[float], at: list[float],
             dm: str = "Edit", prefix: str = "t") -> dict:
    """Freeze-frame capture of a particle effect at effect times `times` (seconds).

    `build` is Luau that returns the effect root (a Model or Folder). For each t: clear every emitter,
    set TimeScale 1, run VfxKit.emit, wait t, freeze with TimeScale 0, capture, then release. Captures take
    about a second each, so freezing is what makes the time exact; beams and trails are not frozen."""
    from rbx_review import contact_sheet, image_checks
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    shots, checks = [], []
    for t in times:
        code = (f"local root = (function()\n{build}\nend)()\n"
                f"VfxKit.clear(root) VfxKit.setTimeScale(root, 1) VfxKit.emit(root)\n"
                f"task.wait({t}) VfxKit.setTimeScale(root, 0)\n"
                f"return {{alive = VfxKit.count(root)}}")
        r = run(studio, code, dm, kit=["VfxKit"])
        if not r["ok"]:
            return {"ok": False, "error": r["error"], "t": t}
        p = out / f"{prefix}_{int(round(t * 1000)):04d}ms.png"
        studio.capture(p, {"camera_position": cam, "look_at_position": at})
        shots.append(p)
        checks.append({"t": t, **{k: v for k, v in image_checks(p).items() if k in ("ok", "flags", "mean_luma")}})
    run(studio, f"local root = (function()\n{build}\nend)()\nVfxKit.setTimeScale(root, 1) VfxKit.clear(root) return true",
        dm, kit=["VfxKit"])
    sheet = contact_sheet([str(p) for p in shots], str(out / f"{prefix}_sheet.png"), cols=min(4, len(shots)), thumb=390)
    return {"ok": all(c["ok"] for c in checks), "shots": [str(p) for p in shots], "checks": checks, "sheet": sheet}


# ---------------------------------------------------------------------------------------- flipbooks

def make_flipbook(frames: list[str | Path], out: str | Path, cols: int = 4, size: int = 1024,
                  gutter: int = 2) -> dict:
    """Pack frames left to right, top to bottom into a `size` x `size` sheet of cols x cols cells.

    1024 x 1024 is the sheet size the docs and the engine's FlipbookIncompatible text name, for every
    grid (8x8 gives 128 px cells). Each frame is fitted inside its cell minus a transparent `gutter` so
    neighbors never bleed (docs: leave transparent spacing). Unused cells stay transparent. Needs Pillow."""
    from PIL import Image
    if len(frames) > cols * cols:
        raise ValueError(f"{len(frames)} frames do not fit a {cols}x{cols} grid")
    if size % cols:
        raise ValueError(f"{size} px is not a multiple of {cols} cells")
    cell = size // cols
    sheet = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = cell - 2 * gutter
    for i, f in enumerate(frames):
        im = Image.open(f).convert("RGBA")
        im.thumbnail((inner, inner))
        x = (i % cols) * cell + gutter + (inner - im.width) // 2
        y = (i // cols) * cell + gutter + (inner - im.height) // 2
        sheet.alpha_composite(im, (x, y))
    out = Path(out)
    sheet.save(out)
    return {"path": str(out), "size": sheet.size, "frames": len(frames), "cells": cols * cols,
            "layout": {2: "Grid2x2", 4: "Grid4x4", 8: "Grid8x8"}.get(cols, "Custom")}


def check_flipbook(png: str | Path, layout: str = "Grid4x4", frames: int | None = None) -> dict:
    """Checks a sheet before upload: exact multiple of the grid (else the emitter reports
    FlipbookIncompatible), square cells, at most 1024 px per side (docs: 8x8 in 1024 x 1024), alpha,
    transparent gutters, and how many cells hold a frame. Needs Pillow."""
    from PIL import Image
    im = Image.open(png).convert("RGBA")
    w, h = im.size
    n = GRIDS.get(layout)
    flags = []
    if n is None:
        return {"ok": False, "flags": [f"unknown layout {layout}"]}
    if w % n or h % n:
        flags.append("not-a-multiple")
    if w != h:
        flags.append("not-square")
    if max(w, h) > 1024:
        flags.append("over-1024")
    a = im.getchannel("A")
    if a.getextrema()[0] == 255:
        flags.append("no-alpha")
    cw, ch = w // n, h // n
    used, bleed = 0, 0
    for r in range(n):
        for c in range(n):
            box = (c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)
            cell = a.crop(box)
            if cell.getbbox():
                used += 1
                edge = [cell.crop((0, 0, cw, 1)), cell.crop((0, ch - 1, cw, ch)),
                        cell.crop((0, 0, 1, ch)), cell.crop((cw - 1, 0, cw, ch))]
                if any(e.getbbox() for e in edge):
                    bleed += 1
    if bleed:
        flags.append("touches-cell-edge")
    if frames is not None and used != frames:
        flags.append("frame-count-mismatch")
    return {"ok": not flags, "size": [w, h], "cell": [cw, ch], "cells_used": used, "bleeding_cells": bleed,
            "flags": flags}


# -------------------------------------------------------------------------------------------- audio

def _ffprobe(path: Path) -> dict:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                        "format=format_name,duration,size:stream=codec_type,codec_name,sample_rate,channels",
                        "-of", "json", str(path)], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or "ffprobe failed")
    return json.loads(r.stdout)


def _levels(path: Path) -> dict:
    """Integrated loudness (LUFS) and true peak (dBTP) from ffmpeg's ebur128 filter."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true",
                        "-f", "null", "-"], capture_output=True, text=True)
    tail = r.stderr[r.stderr.rfind("Summary:"):]
    lufs = re.search(r"I:\s+(-?[\d.]+|-inf) LUFS", tail)
    peak = re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", tail)
    return {"lufs": float(lufs[1]) if lufs and lufs[1] != "-inf" else None,
            "true_peak_db": float(peak[1]) if peak and peak[1] != "-inf" else None}


def check_audio(path: str | Path) -> dict:
    """Roblox import limits plus loudness, read with ffprobe and ffmpeg (no upload)."""
    p = Path(path)
    info = _ffprobe(p)
    fmt = info.get("format", {})
    audio = [s for s in info.get("streams", []) if s.get("codec_type") == "audio"]
    flags = []
    size = int(fmt.get("size", p.stat().st_size))
    dur = float(fmt.get("duration", 0) or 0)
    ext = p.suffix.lower().lstrip(".")
    if ext not in AUDIO_FORMATS:
        flags.append(f"format-{ext}")
    if len(audio) != 1:
        flags.append(f"audio-streams-{len(audio)}")
    rate = int(audio[0].get("sample_rate", 0)) if audio else 0
    ch = int(audio[0].get("channels", 0)) if audio else 0
    if size >= AUDIO_MAX_BYTES:
        flags.append("over-20MB")
    if dur >= AUDIO_MAX_SECONDS:
        flags.append("over-7min")
    if rate > AUDIO_MAX_RATE:
        flags.append("over-48kHz")
    if ch not in AUDIO_CHANNELS:
        flags.append(f"channels-{ch}")
    lv = _levels(p)
    if lv["true_peak_db"] is not None and lv["true_peak_db"] > -1.0:
        flags.append("peak-over-minus1dB")
    return {"ok": not [f for f in flags if f != "peak-over-minus1dB"], "flags": flags, "bytes": size,
            "seconds": round(dur, 3), "sample_rate": rate, "channels": ch, "codec": audio[0].get("codec_name") if audio else None,
            **lv}


def prepare_audio(src: str | Path, out: str | Path, kind: str = "sfx") -> dict:
    """Condition a generated file for import: trim leading and trailing silence, resample to 48 kHz,
    then level it. Music and ambience: two-pass loudnorm to -16 LUFS, true peak -1.5 dB. SFX: peak
    normalize to -1.5 dBFS, which keeps the true peak under -1 dB after lossy encoding (loudnorm is
    unreliable on clips under a few seconds). Targets are [added]
    defaults; the mix is set later with Volume and faders."""
    src, out = Path(src), Path(out)
    trim = ("silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.02,"
            "areverse,silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.05,areverse")
    if kind in ("music", "ambience", "voice"):
        first = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(src), "-af",
                                f"{trim},loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
                               capture_output=True, text=True).stderr
        m = json.loads(first[first.rfind("{"):first.rfind("}") + 1])
        af = (f"{trim},loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
              f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    else:
        vol = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(src), "-af", f"{trim},volumedetect",
                              "-f", "null", "-"], capture_output=True, text=True).stderr
        mx = re.search(r"max_volume:\s+(-?[\d.]+) dB", vol)
        gain = -1.5 - float(mx[1]) if mx else 0.0
        af = f"{trim},volume={gain:.2f}dB"
    args = ["ffmpeg", "-hide_banner", "-y", "-i", str(src), "-af", af, "-ar", "48000"]
    ext = out.suffix.lower()
    if ext == ".ogg":
        enc = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
        if "libvorbis" not in enc:
            raise RuntimeError("this ffmpeg has no libvorbis encoder: write .mp3 or .flac instead")
        args += ["-c:a", "libvorbis", "-q:a", "6"]
    elif ext == ".mp3":
        args += ["-c:a", "libmp3lame", "-q:a", "2"]
    elif ext == ".flac":
        args += ["-c:a", "flac"]
    elif ext != ".wav":
        raise ValueError(f"Roblox imports mp3, ogg, wav and flac, not {ext}")
    r = subprocess.run(args + [str(out)], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-800:])
    return check_audio(out)


def main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[0] == "check-audio":
        r = check_audio(argv[1])
    elif len(argv) >= 3 and argv[0] == "prepare-audio":
        r = prepare_audio(argv[1], argv[2], argv[3] if len(argv) > 3 else "sfx")
    elif len(argv) >= 2 and argv[0] == "check-flipbook":
        r = check_flipbook(argv[1], argv[2] if len(argv) > 2 else "Grid4x4")
    else:
        print(__doc__)
        return 2
    print(json.dumps(r, indent=1))
    return 0 if r.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
