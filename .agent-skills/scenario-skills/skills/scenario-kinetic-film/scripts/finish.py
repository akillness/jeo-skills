"""Make the deliverables and check every one.

usage: finish.py <film folder> --video out/video_4k.mp4 [--audio out/mix.wav] [--name NAME] [--dest DIR]
                 [--no-vertical] [--info FILE]

Writes the master (4K or 1080p, video stream copied, never re-encoded), a 1080p version of a 4K master,
and a 9:16 version (the 16:9 film centered on black) into out/final, replacing earlier ones. Every file
is checked for frame count, size (under 1 GB), H.264 level (5.2 or lower, or Macs and phones refuse it),
a full decode on the macOS hardware decoder (what QuickTime uses; SKIP on other systems) and loudness.
Then the film's dynamism, up to the end card: still frames, holds and motion. Prints ALL CHECKS PASS or
SOME CHECKS FAILED, and exits 1 on a failure.
"""

import argparse
import json
import os
import platform
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dyn  # noqa: E402
import holds  # noqa: E402
from filmserver import film_info  # noqa: E402

PASS, FAIL, SKIP = "PASS", "FAIL", "SKIP"
END_CARD_S = 4.5  # the longest end card the gates leave out when the film has no Logo block


def gate_frames(n, expected):
    return (PASS if n == expected else FAIL), f"{n} of {expected}"


def gate_size(nbytes):
    return (PASS if nbytes < 1e9 else FAIL), f"{nbytes / 1e9:.2f} GB"


def gate_level(level):
    return (PASS if 0 < level <= 52 else FAIL), f"{level / 10:.1f}"


def gate_loudness(lufs):
    if lufs is None:
        return FAIL, "? LUFS"
    return (PASS if -16 <= lufs <= -12 else FAIL), f"{lufs} LUFS"


def gate_still_share(share):
    return (PASS if share <= 0.4 else FAIL), f"{share * 100:.0f}% (target 40% or less)"


def gate_holds(found, end_card, bpm):
    """FAIL on any still stretch over 0.6 s before the end card; the part inside the card is free."""
    beat = 60 / bpm
    long = [h for h in found if min(h[1], end_card - h[0]) > 0.6]
    lines = [f"{s:.2f}s (beat {s / beat:.1f})  {d:.2f}s  mean change {m * 100:.2f}%" for s, d, m in long[:4]]
    return (FAIL if long else PASS), ("; ".join(lines) if long else "none")


def gate_motion(median_flow):
    return (PASS if median_flow >= 2.5 else FAIL), f"{median_flow} px/frame (target 2.5 or more)"


def hw_decode(path, system=None, ffmpeg="ffmpeg"):
    """A full decode on VideoToolbox, the decoder QuickTime and Safari use; SKIP where there is none."""
    system = system or platform.system()
    if system != "Darwin":
        return SKIP, f"the hardware decoder check runs on macOS only (this is {system})"
    accels = subprocess.run([ffmpeg, "-hide_banner", "-hwaccels"], capture_output=True, text=True).stdout.split()
    if "videotoolbox" not in accels:
        return SKIP, "this ffmpeg was built without videotoolbox"
    cmd = [ffmpeg, "-v", "error", "-hwaccel", "videotoolbox", "-hwaccel_output_format", "videotoolbox_vld", "-i", path, "-f", "null", "-"]
    errors = [line for line in subprocess.run(cmd, capture_output=True, text=True).stderr.splitlines() if line.strip()]
    return (FAIL, errors[0][:90]) if errors else (PASS, "clean")


def end_card_time(info):
    """Where the dynamism gates stop: the Logo block's start or 4.5 s before the end, whichever is earlier."""
    fallback = info["dur"] - END_CARD_S
    card = info.get("endCard")
    return fallback if card is None else min(card, fallback)


def probe(path, entry):
    cmd = ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", entry, "-of", "csv=p=0", path]
    return subprocess.run(cmd, capture_output=True, text=True).stdout.strip()


def count_frames(path):
    cmd = ["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", path]
    return int(subprocess.run(cmd, capture_output=True, text=True).stdout.strip() or 0)


def loudness(path):
    err = subprocess.run(["ffmpeg", "-i", path, "-vn", "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    found = re.findall(r"I:\s+(-?[\d.]+) LUFS", err)
    return float(found[-1]) if found else None


def make_deliverables(video, audio, dest, name, title, fps, vertical=True):
    """The master, a 1080p version of a larger master, and the 9:16 version.

    Returns (every path, the 1080p one the dynamism gates measure: the version, or the master itself).
    """
    h = int(probe(video, "stream=height") or 0)
    if not h:
        sys.exit(f"could not read {video} as a video")
    mux = ["-i", audio, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "320k"] if audio else []
    color = ["-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"]
    x264 = ["-c:v", "libx264", "-crf", "15", "-preset", "slow", "-level", "4.2", *color]
    master = os.path.join(dest, f"{name}_{'4k' if h > 1440 else str(h) + 'p'}{fps}.mp4")
    run = ["ffmpeg", "-v", "error", "-y", "-i", video, *mux]
    subprocess.run([*run, "-c:v", "copy", "-movflags", "+faststart", "-metadata", f"title={title}", master], check=True)
    outs, check = [master], master
    if h > 1080:
        check = os.path.join(dest, f"{name}_1080p{fps}.mp4")
        subprocess.run([*run, "-vf", "scale=1920:1080:flags=lanczos", *x264, "-movflags", "+faststart", check], check=True)
        outs.append(check)
    if vertical:
        p = os.path.join(dest, f"{name}_9x16.mp4")
        pad = "scale=1080:-2:flags=lanczos,pad=1080:1920:0:(1920-ih)/2:black"
        subprocess.run([*run, "-vf", pad, *x264, "-movflags", "+faststart", p], check=True)
        outs.append(p)
    return outs, check


class Report:
    def __init__(self):
        self.ok = True

    def line(self, label, result):
        status, detail = result
        self.ok &= status != FAIL
        print(f"  {status}  {label}: {detail}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("film")
    ap.add_argument("--video", required=True, help="the render: out/video_1080.mp4 or out/video_4k.mp4")
    ap.add_argument("--audio", help="the mix: out/mix.wav")
    ap.add_argument("--name", help="file name stem (default: the film's title)")
    ap.add_argument("--dest", help="default: <film>/out/final")
    ap.add_argument("--no-vertical", action="store_true", help="skip the 9:16 version")
    ap.add_argument("--info", help="film metadata JSON from info.mjs, instead of asking the film")
    a = ap.parse_args(argv)
    info = film_info(a.film, a.info)
    name = a.name or re.sub(r"[^a-z0-9]+", "-", (info.get("title") or "film").lower()).strip("-")
    dest = a.dest or os.path.join(a.film, "out", "final")
    os.makedirs(dest, exist_ok=True)
    fps = info["fps"]
    expected = round(info["dur"] * fps)
    outs, src = make_deliverables(a.video, a.audio, dest, name, info.get("title", ""), fps, not a.no_vertical)
    report = Report()
    for f in outs:
        print(os.path.basename(f))
        report.line("frames", gate_frames(count_frames(f), expected))
        report.line("size", gate_size(os.path.getsize(f)))
        report.line("H.264 level", gate_level(int(probe(f, "stream=level") or 0)))
        report.line("plays on the Mac hardware decoder", hw_decode(f))
        if a.audio:
            report.line("loudness", gate_loudness(loudness(f)))
    # dynamism of the film itself, measured on the 1080p file: the motion threshold is in 1080p pixels
    end = end_card_time(info)
    measured = dyn.measure(src, 0, max(1, end))
    print("dynamism")
    if measured is None:
        report.line("dynamism", (FAIL, f"no frames decoded from {src}"))
    else:
        summary, per_second = measured
        with open(os.path.join(dest, "dynamism.json"), "w") as fh:
            json.dump({"summary": summary, "per_second": per_second}, fh, indent=1)
        report.line("still frames before the end card (under 1.5% of the frame changing)", gate_still_share(summary["still_share"]))
        found = holds.find_holds(holds.changed_area(src), 0.5)
        report.line("holds longer than 0.6 s (end card excluded)", gate_holds(found, end, info["bpm"]))
        report.line("median motion", gate_motion(summary["median_flow"]))
        print(f"cuts per 10 s: {summary['cuts_per_10s']}, full-frame color flips: {summary['flips']}")
    print("ALL CHECKS PASS" if report.ok else "SOME CHECKS FAILED: fix before handing the film over")
    sys.exit(0 if report.ok else 1)


if __name__ == "__main__":
    main()
