"""ffmpeg encode ladders and byte budgets for the landing-page media pipeline.

Imported by `site-media.py` (whose own name has a dash and is therefore not importable). Every
encode goes through ladder(), so an artifact that will not fit its budget fails loudly instead
of shipping fat. Nothing here touches the network or anything outside the given output paths.
"""
import json
import shutil
import subprocess
from pathlib import Path

FFMPEG, FFPROBE = shutil.which('ffmpeg'), shutil.which('ffprobe')
INSTALL_HINT = 'Install ffmpeg (brew install ffmpeg) and re-run.'
# ffmpeg's mjpeg encoder takes -q:v 2..31 (lower is better); 4 lands near libjpeg q80 and 5 near
# q78, which is what the phase budget was written against.
KEYART_STEPS = (('', '1600:-2', 250 * 1024, (4, 6, 8)), ('-thumb', '480:-2', 60 * 1024, (5, 7, 9)))
CLIP_SCALE, CLIP_FALLBACK_SCALE = '640:360', '512:288'
CLIP_CAP, CLIP_SECONDS = 600 * 1024, 4.0
VP9_LADDER, H264_LADDER = (36, 40, 44), (28, 32, 36)
ORIGIN_SCALE, ORIGIN_CAP = '800:446', 700 * 1024
ORIGIN_VP9_LADDER, ORIGIN_H264_LADDER = (34, 38, 42), (26, 30, 34)


class EncodeError(RuntimeError):
    """A budget miss or an ffmpeg failure; the message names the artifact."""


def require_ffmpeg():
    if not FFMPEG:
        raise EncodeError(f'ffmpeg is not on PATH. {INSTALL_HINT}')


def version():
    """First line of `ffmpeg -version`, recorded in the manifest."""
    require_ffmpeg()
    out = subprocess.run([FFMPEG, '-version'], capture_output=True, text=True).stdout
    return out.splitlines()[0] if out else 'unknown'


def duration_s(path):
    """Container duration in seconds, or None when ffprobe cannot read it."""
    if not FFPROBE:
        return None
    probe = subprocess.run([FFPROBE, '-v', 'error', '-show_entries', 'format=duration',
                            '-of', 'json', str(path)], capture_output=True, text=True)
    try:
        return float(json.loads(probe.stdout)['format']['duration'])
    except (ValueError, KeyError, TypeError):
        return None


def psnr_db(first, second):
    """Average PSNR between two images in dB, or None when ffmpeg reports none.

    Used as a motion measure by the clip stage: two frames a second apart at 40+ dB are the same
    picture to the eye. Identical frames give ffmpeg's `inf`, which float() parses.
    """
    require_ffmpeg()
    done = subprocess.run([FFMPEG, '-i', str(first), '-i', str(second), '-lavfi', 'psnr',
                           '-f', 'null', '-'], capture_output=True, text=True)
    for line in reversed(done.stderr.splitlines()):
        if 'average:' in line:
            try:
                return float(line.split('average:')[1].split()[0])
            except ValueError:
                return None
    return None


def _trim(source, start, seconds):
    return ['-ss', f'{start:.2f}', '-t', f'{seconds:.2f}', '-i', str(source)]


def vp9_argv(source, dst, scale, start, seconds, crf):
    return [FFMPEG or 'ffmpeg', '-y', *_trim(source, start, seconds), '-vf', f'scale={scale}',
            # libvpx-vp9 refuses the bgra frames a GIF decodes to; yuv420p is what browsers want.
            '-c:v', 'libvpx-vp9', '-crf', str(crf), '-b:v', '0', '-row-mt', '1',
            '-pix_fmt', 'yuv420p', '-an', str(dst)]


def h264_argv(source, dst, scale, start, seconds, crf):
    return [FFMPEG or 'ffmpeg', '-y', *_trim(source, start, seconds), '-vf', f'scale={scale}',
            '-c:v', 'libx264', '-crf', str(crf), '-preset', 'slow', '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart', '-an', str(dst)]


def jpeg_argv(source, dst, scale, quality):
    return [FFMPEG or 'ffmpeg', '-y', '-i', str(source), '-vf', f'scale={scale}',
            '-q:v', str(quality), str(dst)]


def encode(argv):
    require_ffmpeg()
    result = subprocess.run(argv, capture_output=True, text=True)
    if result.returncode != 0:
        raise EncodeError(f'ffmpeg exit {result.returncode}: {result.stderr.strip()[-400:]}')


def ladder(build, settings, dst, cap, label, print_only=False):
    """Encode `dst` down `settings` until it fits `cap` bytes; the last miss raises EncodeError."""
    dst = Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    attempts = []
    for setting in settings:
        argv = build(setting)
        if print_only:
            return {'path': dst, 'argv': argv, 'setting': setting, 'bytes': None, 'attempts': []}
        encode(argv)
        attempts.append({'setting': setting, 'bytes': dst.stat().st_size})
        if attempts[-1]['bytes'] <= cap:
            return {'path': dst, 'argv': argv, 'setting': setting,
                    'bytes': attempts[-1]['bytes'], 'attempts': attempts}
    raise EncodeError(f'{label} is {attempts[-1]["bytes"]} bytes at setting '
                      f'{attempts[-1]["setting"]}, over the {cap} byte cap')


def clip_start(source, seconds=CLIP_SECONDS):
    """Trim from the tail: a Playwright recording starts at page load, so its first second is the
    loading overlay, not the scene. Falls back to 0.5 s in when the duration is unreadable."""
    total = duration_s(source)
    return max(0.0, total - seconds - 0.25) if total else 0.5


def clip_pair(source, out_dir, clip_id, print_only=False):
    """webm + mp4 for one hover clip. A clip that misses its budget at 640x360 is retried once at
    512x288 (recorded in the manifest as its scale) before the run fails."""
    start = clip_start(source)
    for scale in (CLIP_SCALE, CLIP_FALLBACK_SCALE):
        webm, mp4 = Path(out_dir) / f'{clip_id}.webm', Path(out_dir) / f'{clip_id}.mp4'
        try:
            entries = [
                ladder(lambda crf, s=scale: vp9_argv(source, webm, s, start, CLIP_SECONDS, crf),
                       VP9_LADDER, webm, CLIP_CAP, f'clips/{clip_id}.webm', print_only),
                ladder(lambda crf, s=scale: h264_argv(source, mp4, s, start, CLIP_SECONDS, crf),
                       H264_LADDER, mp4, CLIP_CAP, f'clips/{clip_id}.mp4', print_only)]
        except EncodeError:
            if scale == CLIP_FALLBACK_SCALE:
                raise
            continue
        for entry in entries:
            entry['scale'] = scale
        return entries
    raise EncodeError(f'clips/{clip_id} could not be encoded')


def keyart_pair(source, out_dir, shot_id, print_only=False):
    """Full-width and thumbnail derivative of one showcase frame."""
    entries = []
    for suffix, scale, cap, steps in KEYART_STEPS:
        dst = Path(out_dir) / f'{shot_id}{suffix}.jpg'
        entry = ladder(lambda q, s=scale, d=dst: jpeg_argv(source, d, s, q), steps, dst, cap,
                       f'keyart/{dst.name}', print_only)
        entry['scale'] = scale
        entries.append(entry)
    return entries


def keyart_stage(showcase_dir, out_dir, print_only=False):
    """Every frame listed in the committed gallery, in its two site sizes."""
    showcase_dir = Path(showcase_dir)
    shots = json.loads((showcase_dir / 'showcase.json').read_text(encoding='utf-8'))['shots']
    entries = []
    for shot in shots:
        source = showcase_dir / f'{shot["id"]}.jpg'
        if not source.is_file():
            raise EncodeError(f'showcase frame {source} is missing')
        for entry in keyart_pair(source, out_dir, shot['id'], print_only):
            entries.append({**entry, 'source': source})
    return entries


def origin_stage(gif, preview, out_dir, print_only=False):
    """The Harness Village recording as webm + mp4, plus its poster from the still preview."""
    for source in (gif, preview):
        if not Path(source).is_file():
            raise EncodeError(f'origin media {source} is missing')
    out_dir = Path(out_dir)
    webm, mp4, poster = (out_dir / 'harness-village.webm', out_dir / 'harness-village.mp4',
                         out_dir / 'harness-village.jpg')
    seconds = duration_s(gif) or 8.0
    entries = [
        ladder(lambda crf: vp9_argv(gif, webm, ORIGIN_SCALE, 0.0, seconds, crf),
               ORIGIN_VP9_LADDER, webm, ORIGIN_CAP, 'origin/harness-village.webm', print_only),
        ladder(lambda crf: h264_argv(gif, mp4, ORIGIN_SCALE, 0.0, seconds, crf),
               ORIGIN_H264_LADDER, mp4, ORIGIN_CAP, 'origin/harness-village.mp4', print_only),
        ladder(lambda q: jpeg_argv(preview, poster, ORIGIN_SCALE, q), (4, 6, 8), poster,
               ORIGIN_CAP, 'origin/harness-village.jpg', print_only)]
    return [{**entry, 'scale': ORIGIN_SCALE, 'source': gif} for entry in entries]
