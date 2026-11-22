"""Subject matte from a keyed video: a background-removal run that returned the subject on a solid color.
usage: python tools/matte_keyed.py <clip> <keyed.mp4|mkv|mov> [--key magenta|green|blue] [--force]
Writes assets/video/<clip>/m_#####.png (white = subject) on the clip's own frame grid and sets meta.mask.
Keying a solid color works whether or not the container kept an alpha channel, which a transparent request
does not guarantee. Refuses to replace existing mattes unless --force is given."""
import sys, glob, json, subprocess, tempfile, numpy as np, cv2

KEYS = {'magenta': (255, 0, 255), 'green': (0, 255, 0), 'blue': (0, 0, 255)}  # RGB


def key_matte(rgb, key):
    """1 = subject, 0 = key color. Distance in RGB to the key, with a soft ramp for compressed edges."""
    d = np.linalg.norm(rgb.astype(np.float32) / 255 - np.array(key, np.float32) / 255, axis=2) / np.sqrt(3)
    return np.clip((d - 0.12) / 0.18, 0, 1)


def main(argv):
    force = '--force' in argv; argv = [a for a in argv if a != '--force']
    key = 'magenta'
    if '--key' in argv:
        i = argv.index('--key'); key = argv[i + 1]; del argv[i:i + 2]
    if len(argv) < 2 or key not in KEYS: sys.exit(__doc__)
    clip, keyed = argv[0], argv[1]
    d = f'assets/video/{clip}'
    with open(f'{d}/meta.json') as fh: meta = json.load(fh)
    if glob.glob(f'{d}/m_*.png') and not force: sys.exit(f'{d} already has mattes; pass --force to replace them')
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', keyed, '-vf',
                        f"fps={meta['fps']},scale={meta['w']}:{meta['h']}:flags=lanczos", f'{tmp}/k_%05d.png'], check=True)
        ks = sorted(glob.glob(f'{tmp}/k_*.png'))
        if not ks: sys.exit(f'no frames decoded from {keyed}')
        for i in range(1, meta['n'] + 1):  # the keyed render can be a frame short or long: clamp to its last frame
            k = cv2.cvtColor(cv2.imread(ks[min(i, len(ks)) - 1]), cv2.COLOR_BGR2RGB)
            m = cv2.GaussianBlur(key_matte(k, KEYS[key]), (0, 0), 0.8)
            cv2.imwrite(f'{d}/m_{i:05d}.png', (m * 255).astype(np.uint8))
    meta['mask'] = True
    with open(f'{d}/meta.json', 'w') as fh: json.dump(meta, fh, indent=1)
    print(clip, 'mattes', meta['n'], 'from', len(ks), 'keyed frames', f'key={key}')


if __name__ == '__main__':
    main(sys.argv[1:])
