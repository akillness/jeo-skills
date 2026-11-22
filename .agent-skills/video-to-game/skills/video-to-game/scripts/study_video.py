#!/usr/bin/env python3
"""Turn a gameplay video into things an agent can look at.

Saves a frame every --every seconds, a contact sheet, the dominant palette (hex), the cut times, and a
study.json summary. Open the sheet first, then the frames, then write the game spec.

Usage:
  python3 study_video.py gameplay.mp4 -o study/
  python3 study_video.py gameplay.mp4 -o study/ --every 0.5 --colors 12

Needs ffmpeg and ffprobe on PATH. Standard library only.
"""
import argparse
import json
import os
import re
import subprocess
from collections import Counter


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                          'stream=width,height,r_frame_rate:format=duration', '-of', 'json', path],
                         capture_output=True, text=True, check=True).stdout
    d = json.loads(out)
    s = d['streams'][0]
    num, den = s['r_frame_rate'].split('/')
    return {'width': s['width'], 'height': s['height'], 'fps': round(int(num) / int(den), 3),
            'duration': round(float(d['format']['duration']), 3)}


def frames(path, out, every):
    os.makedirs(out, exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-vf', f'fps=1/{every},scale=960:-2',
                    '-q:v', '3', os.path.join(out, 'f_%03d.jpg')], check=True)
    names = sorted(f for f in os.listdir(out) if f.startswith('f_'))
    return [(round(i * every, 2), n) for i, n in enumerate(names)]


def sheet(path, out, n):
    cols = 6
    rows = max(1, -(-n // cols))
    every = probe(path)['duration'] / max(1, cols * rows)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-vf',
                    f'fps=1/{every:.4f},scale=480:-2,tile={cols}x{rows}:padding=6:color=white',
                    '-frames:v', '1', os.path.join(out, 'sheet.jpg')], check=True)


def palette(path, k):
    """Dominant colors from 16 small frames, quantized to 4 bits per channel."""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', 'fps=16/10,scale=64:36', '-frames:v', '16',
                          '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True).stdout
    bins = Counter()
    sums = {}
    for i in range(0, len(raw) - 2, 3):
        r, g, b = raw[i], raw[i + 1], raw[i + 2]
        key = (r >> 4, g >> 4, b >> 4)
        bins[key] += 1
        s = sums.setdefault(key, [0, 0, 0])
        s[0] += r; s[1] += g; s[2] += b
    total = sum(bins.values())
    out = []
    for key, n in bins.most_common(k):
        s = sums[key]
        out.append({'hex': '#%02x%02x%02x' % (s[0] // n, s[1] // n, s[2] // n), 'share': round(n / total, 3)})
    return out


def cuts(path, threshold):
    err = subprocess.run(['ffmpeg', '-v', 'info', '-i', path, '-vf', f"select='gt(scene,{threshold})',showinfo",
                          '-f', 'null', '-'], capture_output=True, text=True).stderr
    return [round(float(t), 2) for t in re.findall(r'pts_time:([\d.]+)', err)]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('video')
    ap.add_argument('-o', '--out', default='study')
    ap.add_argument('--every', type=float, default=0.25, help='seconds between saved frames (default 0.25)')
    ap.add_argument('--colors', type=int, default=10)
    ap.add_argument('--cut-threshold', type=float, default=0.35)
    a = ap.parse_args()

    info = probe(a.video)
    fr = frames(a.video, a.out, a.every)
    sheet(a.video, a.out, 24)
    info.update(palette=palette(a.video, a.colors), cuts=cuts(a.video, a.cut_threshold),
                frames=[{'t': t, 'file': n} for t, n in fr], sheet='sheet.jpg')
    with open(os.path.join(a.out, 'study.json'), 'w') as f:
        json.dump(info, f, indent=1)
    print(f"{info['width']}x{info['height']} {info['fps']} fps {info['duration']} s, {len(fr)} frames, "
          f"{len(info['cuts'])} cuts, palette {' '.join(c['hex'] for c in info['palette'])}")
    print(f'open {os.path.join(a.out, "sheet.jpg")} first')


if __name__ == '__main__':
    main()
