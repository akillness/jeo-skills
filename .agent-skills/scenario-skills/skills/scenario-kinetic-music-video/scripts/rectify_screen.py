"""Flatten a screen filmed by a handheld phone into a straight-on video, so its motion can be measured.
usage: python tools/rectify_screen.py <phone.mp4> <out.mp4> [--quad auto|"x,y x,y x,y x,y"] [--at S] [--from S]
                                      [--to S] [--band y0:y1] [--size WxH] [--fps 30] [--check FILE.jpg] [--force]
The camera is tracked on the static room around the screen (feature matches outside the screen), and the screen's
quadrilateral at --at follows it into every frame. --quad auto finds the screen as the brightest changing
quadrilateral over the 0.2 s after --at, inside any black bars around the recording; otherwise give its corners at
--at, top left, top right, bottom right, bottom left, in pixels of the decoded frame (read them off the --check
image). --band rows (a burnt-in caption) are kept out of the tracking. The output is 1280x720, or 720x1280 for a
tall screen, at --fps, without audio. The --check image is written before tracking, so a failed run leaves it too.
Exit 0: written; 2: bad input, no screen found or no frames."""
import argparse, os, subprocess, sys
import numpy as np

STACK_S = 0.2        # auto detection reads this much after --at: longer, and handheld drift smears the outline
MIN_AREA = 0.05      # the screen covers at least 5% of the frame
MAX_AREA = 0.9       # an auto outline over 90% of the frame, or on three borders, is the room around the screen
BORDER = 0.01        # an outline this close to a border, as a share of that side, touches it
BAR_LEVEL = 24       # edge rows or columns under this gray level in every frame read are black bars around the
                     # recording (a landscape clip posted as a vertical video): auto detection looks inside them
GROW = 1.08          # tracking ignores the screen and a margin around it: its content moves, the room does not
SCALE = 0.5          # features are found at half resolution
MIN_MATCHES, MIN_INLIERS = 25, 20
TRACKED_WARN = 0.8


class BadInput(Exception):
    pass


def frame_size(src):
    """The decoded frame size, rotation applied, from one frame's PPM header (phone clips carry a rotation tag)."""
    r = subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-i', src, '-frames:v', '1', '-f', 'image2pipe',
                        '-c:v', 'ppm', '-'], capture_output=True)
    head = r.stdout[:64].split()
    if r.returncode != 0 or len(head) < 3 or head[0] != b'P6':
        raise BadInput(f'{src}: no video frames')
    return int(head[1]), int(head[2])


def frames(src, w, h, fps, t0=0.0, t1=None):
    cmd = ['ffmpeg', '-nostdin', '-v', 'error', '-ss', f'{t0:.3f}', '-i', src]
    if t1 is not None:
        cmd += ['-t', f'{t1 - t0:.3f}']
    p = subprocess.Popen(cmd + ['-vf', f'fps={fps}', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], stdout=subprocess.PIPE)
    n = w * h * 3
    try:
        while True:
            b = p.stdout.read(n)
            if len(b) < n:
                break
            yield np.frombuffer(b, np.uint8).reshape(h, w, 3)
    finally:
        p.kill()
        p.wait()
        p.stdout.close()


def order(q):
    """Corners as top left, top right, bottom right, bottom left: clockwise around their centroid, from the one with
    the smallest x + y. Picking each corner by its own extreme coordinate gave one point twice on a quad turned 45
    degrees."""
    q = np.float32(q)
    c = q.mean(0)
    q = q[np.argsort(np.arctan2(q[:, 1] - c[1], q[:, 0] - c[0]), kind='stable')]  # y points down: clockwise
    return np.roll(q, -int(np.argmin(q.sum(1))), axis=0)


def fills_frame(q, w, h):
    """Whether an outline is the room rather than a screen. Three borders, not four: a burnt-in caption band along the
    fourth keeps the room's outline off it."""
    import cv2
    (x0, y0), (x1, y1) = q.min(0), q.max(0)
    touches = [x0 <= BORDER * w, y0 <= BORDER * h, x1 >= (1 - BORDER) * w - 1, y1 >= (1 - BORDER) * h - 1]
    return sum(map(bool, touches)) >= 3 or cv2.contourArea(q) > MAX_AREA * w * h


def picture(g):
    """The recording inside black bars along the decoded frame's edges, as x0, y0, x1, y1 (end exclusive)."""
    lit = g.max(0) > BAR_LEVEL
    rows, cols = np.flatnonzero(lit.any(1)), np.flatnonzero(lit.any(0))
    if not len(rows):
        return 0, 0, g.shape[2], g.shape[1]
    return int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1


def find_screen(stack, w, h):
    """The brightest changing region of the recording, reduced to four corners, or None. A bright, textured room
    drifting around a dark screen (black bars around a vertical video) outscores the screen, and its outline fills the
    recording: None too. Black bars around the recording itself are cropped first: the recording outscores them."""
    import cv2
    g = np.stack([cv2.cvtColor(f, cv2.COLOR_BGR2GRAY).astype(np.float32) for f in stack])
    x0, y0, x1, y1 = picture(g)
    g, w, h = g[:, y0:y1, x0:x1], x1 - x0, y1 - y0
    score = cv2.normalize(g.std(0), None, 0, 1, cv2.NORM_MINMAX) + cv2.normalize(g.mean(0), None, 0, 1, cv2.NORM_MINMAX)
    u8 = cv2.normalize(cv2.GaussianBlur(score, (0, 0), 5), None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    _, m = cv2.threshold(u8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cs:
        return None
    c = max(cs, key=cv2.contourArea)
    if cv2.contourArea(c) < MIN_AREA * w * h:
        return None
    hull = cv2.convexHull(c)
    per = cv2.arcLength(hull, True)
    for eps in np.linspace(0.01, 0.08, 15):
        p = cv2.approxPolyDP(hull, eps * per, True)
        if len(p) == 4:
            q = order(p[:, 0])
            return None if fills_frame(q, w, h) else q + np.float32([x0, y0])
    return None


def parse_quad(text, w, h):
    try:
        pts = [[float(v) for v in p.split(',')] for p in text.split()]
        if len(pts) != 4 or any(len(p) != 2 for p in pts):
            raise ValueError
    except ValueError:
        raise BadInput(f'--quad {text!r}: expected four corners "x,y x,y x,y x,y"')
    if any(not (0 <= x <= w and 0 <= y <= h) for x, y in pts):
        raise BadInput(f'--quad {text!r}: a corner is outside the {w}x{h} frame')
    return order(pts)


def parse_pair(text, sep, what):
    try:
        a, b = (int(v) for v in text.split(sep))
    except ValueError:
        raise BadInput(f'{what} {text!r}: expected two integers separated by {sep!r}')
    return a, b


def mask_for(q, band, w, h):
    import cv2
    m = np.full((int(h * SCALE), int(w * SCALE)), 255, np.uint8)
    c = q.mean(0)
    cv2.fillPoly(m, [np.int32(((q - c) * GROW + c) * SCALE)], 0)
    if band:
        m[int(band[0] * SCALE):int(band[1] * SCALE), :] = 0
    return m


def corners_to(size):
    return np.float32([[0, 0], [size[0], 0], [size[0], size[1]], [0, size[1]]])


def check_image(path, ref, q, size):
    """The --at frame with the screen's outline, beside that frame flattened; without a screen, the frame alone."""
    import cv2
    img = ref.copy()
    if q is not None:
        cv2.polylines(img, [np.int32(q)], True, (0, 255, 0), 2)
        for (x, y), name in zip(q, ('TL', 'TR', 'BR', 'BL')):
            cv2.circle(img, (int(x), int(y)), 6, (0, 0, 255), -1)
            cv2.putText(img, f'{name} {int(x)},{int(y)}', (int(x) + 8, int(y) - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                        (0, 0, 255), 2)
        flat = cv2.warpPerspective(ref, cv2.getPerspectiveTransform(q, corners_to(size)), size, flags=cv2.INTER_CUBIC)
        side = cv2.resize(flat, (max(2, round(size[0] * img.shape[0] / size[1])), img.shape[0]))
        img = np.hstack([img, side])
    try:
        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    except OSError as e:
        raise BadInput(f'{path}: {e.strerror or e}')
    if not cv2.imwrite(path, img):
        raise BadInput(f'could not write {path}')


def run(a):
    import cv2
    for path in (a.out, a.check):
        if path and os.path.abspath(path) == os.path.abspath(a.src):
            raise BadInput(f'{path} is the source video; pick another output path')
        if path and os.path.exists(path) and not a.force:
            raise BadInput(f'{path} exists; pass --force to replace it')
    if a.check and not cv2.haveImageWriter(a.check):
        raise BadInput(f'--check {a.check}: no image writer for that extension (use .jpg or .png)')
    if not os.path.isfile(a.src):
        raise BadInput(f'{a.src}: no such file')
    w, h = frame_size(a.src)
    band = parse_pair(a.band, ':', '--band') if a.band else None
    size = parse_pair(a.size, 'x', '--size') if a.size else None
    if size and (min(size) < 2 or size[0] % 2 or size[1] % 2):
        raise BadInput(f'--size {size[0]}x{size[1]}: sides must be even and at least 2')
    q = None if a.quad == 'auto' else parse_quad(a.quad, w, h)
    stack = [f for _, f in zip(range(max(2, round(STACK_S * a.fps))), frames(a.src, w, h, a.fps, a.at))]
    if not stack:
        raise BadInput(f'{a.src}: no frames at --at {a.at:g}')
    if q is None:
        q = find_screen(stack, w, h)
    if q is not None and not size:
        wide = np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])
        tall = np.linalg.norm(q[3] - q[0]) + np.linalg.norm(q[2] - q[1])
        size = (1280, 720) if wide >= tall else (720, 1280)
    if a.check:
        check_image(a.check, stack[0], q, size)  # first, so the image the corners are read off survives a failure
    rerun = (f'read the corners off {a.check or "a --check FILE.jpg image"} and rerun with --quad "x,y x,y x,y x,y"'
             + (' and --force, which replaces that image' if a.check else ''))
    if q is None:
        raise BadInput(f"no screen found: {rerun} (TL TR BR BL at --at; a video inside black bars: the video's own "
                       'corners)')
    print('corners at --at (TL TR BR BL): ' + ' '.join(f'{x:.0f},{y:.0f}' for x, y in q))
    ow, oh = size
    sift, bf = cv2.SIFT_create(4000), cv2.BFMatcher()

    def small(f):
        return cv2.cvtColor(cv2.resize(f, (int(w * SCALE), int(h * SCALE))), cv2.COLOR_BGR2GRAY)

    kr, dr = sift.detectAndCompute(small(stack[0]), mask_for(q, band, w, h))
    if dr is None or len(kr) < MIN_MATCHES:
        raise BadInput('too little texture around the screen to track the camera (fill less of the frame with it)'
                       + (f'; when the outline is not the screen, {rerun}' if a.quad == 'auto' else ''))
    try:
        os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
    except OSError as e:
        raise BadInput(f'{a.out}: {e.strerror or e}')
    enc = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s',
                            f'{ow}x{oh}', '-r', f'{a.fps:g}', '-i', '-', '-c:v', 'libx264', '-crf', '14', '-pix_fmt',
                            'yuv420p', '-an', a.out], stdin=subprocess.PIPE)
    dst = corners_to(size)
    hm, n, tracked = np.eye(3), 0, 0
    for fr in frames(a.src, w, h, a.fps, a.start, a.end):
        k, d = sift.detectAndCompute(small(fr), mask_for(cv2.perspectiveTransform(q[None], hm)[0], band, w, h))
        if d is not None and len(k) > MIN_MATCHES:
            good = [m for m, o in (x for x in bf.knnMatch(dr, d, k=2) if len(x) == 2) if m.distance < 0.7 * o.distance]
            if len(good) > MIN_MATCHES:
                p0 = np.float32([kr[m.queryIdx].pt for m in good]) / SCALE
                p1 = np.float32([k[m.trainIdx].pt for m in good]) / SCALE
                hn, inl = cv2.findHomography(p0, p1, cv2.RANSAC, 3.0)
                if hn is not None and int(inl.sum()) > MIN_INLIERS:
                    hm, tracked = hn, tracked + 1  # otherwise the last good camera estimate holds
        cur = cv2.perspectiveTransform(q[None], hm)[0]
        flat = cv2.warpPerspective(fr, cv2.getPerspectiveTransform(cur, dst), (ow, oh), flags=cv2.INTER_CUBIC)
        enc.stdin.write(flat.tobytes())
        n += 1
    enc.stdin.close()
    if enc.wait() != 0 or not n:
        raise BadInput(f'{a.src}: no frames from --from {a.start:g}' + (f' to --to {a.end:g}' if a.end else '')
                       if not n else f'ffmpeg could not write {a.out}')
    share = tracked / n
    print(f'wrote {a.out}: {n} frames at {a.fps:g} fps, {ow}x{oh}, tracked {share:.0%}')
    if share < TRACKED_WARN:
        print(f'WARN tracked under {TRACKED_WARN:.0%}: too little static texture, or the screen fills the frame; '
              'flatten a steadier stretch (--from, --to)')
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog='rectify_screen.py', usage=__doc__.split('usage: ', 1)[1].split('\nThe ')[0])
    ap.add_argument('src', nargs='?')
    ap.add_argument('out', nargs='?')
    ap.add_argument('--quad', default='auto')
    ap.add_argument('--at', type=float, default=0.0)
    ap.add_argument('--from', dest='start', type=float, default=0.0)
    ap.add_argument('--to', dest='end', type=float)
    ap.add_argument('--band')
    ap.add_argument('--size')
    ap.add_argument('--fps', type=float, default=30.0)
    ap.add_argument('--check')
    ap.add_argument('--force', action='store_true')
    a = ap.parse_args(argv)
    if not a.src or not a.out:
        ap.print_usage(sys.stderr)
        return 2
    try:
        return run(a)
    except BadInput as e:
        print(f'error: {e}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
