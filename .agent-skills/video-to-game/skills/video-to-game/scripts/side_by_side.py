#!/usr/bin/env python3
"""Put the source video and the game next to each other, so "it looks like the video" becomes a picture.

Writes one image per time: source on the left, game on the right, same height. Use it on a recorded take
(record_play.mjs) or on screenshots of the game at fixed spots.

Usage:
  python3 side_by_side.py gameplay.mp4 take.mp4 -o pairs/ --times 1,3,5,8
  python3 side_by_side.py gameplay.mp4 shot.png -o pairs/ --times 4        # a still of the game
  python3 side_by_side.py gameplay.mp4 take.mp4 -o pairs/ --every 1 --game-offset 2.5

Needs ffmpeg on PATH. Standard library only.
"""
import argparse
import os
import subprocess


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('source')
    ap.add_argument('game', help='a recorded take (.mp4) or a still (.png/.jpg)')
    ap.add_argument('-o', '--out', default='pairs')
    ap.add_argument('--times', help='comma separated times in the source, in seconds')
    ap.add_argument('--every', type=float, help='or one pair every N seconds')
    ap.add_argument('--game-offset', type=float, default=0, help='game time = source time + offset')
    ap.add_argument('--height', type=int, default=540)
    a = ap.parse_args()

    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', a.source],
                               capture_output=True, text=True, check=True).stdout)
    if a.times:
        times = [float(t) for t in a.times.split(',')]
    else:
        step = a.every or 1.0
        times = [round(i * step, 2) for i in range(int(dur / step))]
    still = a.game.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))
    os.makedirs(a.out, exist_ok=True)
    for t in times:
        dest = os.path.join(a.out, f'pair_{t:06.2f}.jpg')
        game_in = ['-i', a.game] if still else ['-ss', str(max(0, t + a.game_offset)), '-i', a.game]
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-i', a.source, *game_in, '-filter_complex',
                        f'[0:v]scale=-2:{a.height},setsar=1[s];[1:v]scale=-2:{a.height},setsar=1[g];[s][g]hstack=2',
                        '-frames:v', '1', '-q:v', '3', dest], check=True)
        print(dest)


if __name__ == '__main__':
    main()
