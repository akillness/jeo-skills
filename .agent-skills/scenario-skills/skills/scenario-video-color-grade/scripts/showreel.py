#!/usr/bin/env python3
"""Showreel: every look on the clip, a typed "menu" overlay, wipes, a final grid and an optional end card.

  python3 showreel.py --renders DIR --looks looks.json --source 00_ungraded --out reel.mp4
                      [--order k1,k2,...] [--music track.mp3] [--logo logo.png] [--credit "Made by Studio"]
                      [--header "COLOR GRADE"] [--size 1920x1080]
                      [--intro 3] [--seg 3] [--grid 7] [--end 4]

The clip keeps playing underneath (global time is shared by every look, so a wipe between
two looks is frame-accurate). Looping clips work best: when the reel is longer than the clip,
every look wraps around together. The panel types each look's "name" and "settings" (from
looks.json) then "presses enter" and the new grade wipes in.
"""
import argparse
import math
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

import grade
import media

ACCENT = (255, 196, 92)
TYPE_NAME, TYPE_SET, ENTER, WIPE = 16, 14, 32, 12   # frames (at 24 fps; scaled for other rates)


def load_font(paths, size):
    for p, idx in paths:
        try:
            return ImageFont.truetype(p, size, index=idx)
        except OSError:
            continue
    return ImageFont.load_default()


MONO = [("/System/Library/Fonts/SFNSMono.ttf", 0), ("/System/Library/Fonts/Menlo.ttc", 0),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 0)]
SANS_B = [("/System/Library/Fonts/HelveticaNeue.ttc", 1), ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 0)]
SANS = [("/System/Library/Fonts/HelveticaNeue.ttc", 0), ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 0)]


def ease(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


class Reader:
    """Decodes one render endlessly from frame `start` (mod its length), filled to (w, h)."""

    def __init__(self, path, start, loop, fps, w, h):
        self.w, self.h = w, h
        self.p = subprocess.Popen(
            ["ffmpeg", "-loglevel", "error", "-stream_loop", "-1", "-ss", f"{(start % loop) / fps:.5f}", "-i", str(path),
             "-an", "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}",
             "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL)  # close() kills the endless decode, which ffmpeg reports as a broken pipe

    def read(self):
        return np.frombuffer(self.p.stdout.read(self.w * self.h * 3), np.uint8).reshape(self.h, self.w, 3)

    def close(self):
        self.p.kill()
        self.p.wait()


class Panel:
    """Typed menu panel (bottom-right): header, counter, typed name, typed settings, dots."""

    def __init__(self, W, H, header):
        s = min(W, H) / 1080
        self.s, self.header = s, header
        self.PW, self.PH = int(640 * s), int(196 * s)
        self.PX, self.PY = W - self.PW - int(48 * s), H - self.PH - int(48 * s)
        self.f_head = load_font(SANS_B, int(17 * s))
        self.f_set = load_font(MONO, int(19 * s))
        self._names = {}

    def name_font(self, name):
        if name not in self._names:
            size = int(34 * self.s)
            while size > 14 and load_font(MONO, size).getlength(name) > self.PW - 96 * self.s:
                size -= 1
            self._names[name] = load_font(MONO, size)
        return self._names[name]

    def draw(self, name, settings, idx, total, f, appear=1.0, applied=False, typing=True):
        s, PW, PH, a = self.s, self.PW, self.PH, appear
        img = Image.new("RGBA", (PW, PH), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        fn = self.name_font(name)
        d.rounded_rectangle((0, 0, PW - 1, PH - 1), radius=int(16 * s), fill=(12, 12, 16, int(178 * a)),
                            outline=(255, 255, 255, int(38 * a)), width=1)
        d.text((24 * s, 18 * s), self.header, font=self.f_head, fill=(255, 255, 255, int(150 * a)))
        if idx is not None:
            d.text((PW - 24 * s, 18 * s), f"{idx:02d} / {total:02d}", font=self.f_head,
                   fill=(255, 255, 255, int(150 * a)), anchor="ra")
        d.line((24 * s, 48 * s, PW - 24 * s, 48 * s), fill=(255, 255, 255, int(28 * a)), width=1)
        n_name = len(name) if not typing else min(len(name), math.ceil(len(name) * f / TYPE_NAME))
        t2 = f - TYPE_NAME
        n_set = len(settings) if not typing else (0 if t2 < 0 else min(len(settings), math.ceil(len(settings) * t2 / TYPE_SET)))
        y1, y2 = 68 * s + (34 * s - fn.size) / 2, 120 * s
        d.text((24 * s, y1), "›", font=fn, fill=ACCENT + (int(255 * a),))
        d.text((56 * s, y1), name[:n_name], font=fn, fill=(255, 255, 255, int(245 * a)))
        d.text((56 * s, y2), settings[:n_set], font=self.f_set, fill=(255, 255, 255, int(150 * a)))
        cur = None
        if typing and n_name < len(name):
            cur = (56 * s + d.textlength(name[:n_name], font=fn), y1, fn.size)
        elif typing and n_set < len(settings):
            cur = (56 * s + d.textlength(settings[:n_set], font=self.f_set), y2, self.f_set.size)
        elif not applied and (f // 9) % 2 == 0:
            cur = (56 * s + d.textlength(name, font=fn), y1, fn.size)
        if cur:
            cx, cy, sz = cur
            d.rectangle((cx + 3, cy + 4, cx + 3 + sz // 2, cy + 6 + sz), fill=ACCENT + (int(230 * a),))
        yb = PH - 30 * s
        if applied:
            d.text((24 * s, yb - 9 * s), "✓ applied", font=self.f_set, fill=ACCENT + (int(220 * a),))
        if idx is not None and total <= 30:
            r, gap = 4 * s, 15 * s
            x0 = PW - 24 * s - (total - 1) * gap
            for i in range(total):
                d.ellipse((x0 + i * gap - r, yb - r, x0 + i * gap + r, yb + r),
                          fill=(255, 255, 255, int((220 if i == idx - 1 else 110 if i < idx else 40) * a)))
        return img


def paste(frame, img, x, y):
    a = np.asarray(img).astype(np.float32)
    a = a[:max(0, frame.shape[0] - y), :max(0, frame.shape[1] - x)]  # clip to the frame
    h, w = a.shape[:2]
    region = frame[y:y + h, x:x + w].astype(np.float32)
    al = a[..., 3:4] / 255.0
    frame[y:y + h, x:x + w] = (region * (1 - al) + a[..., :3] * al).astype(np.uint8)


def wipe(old, new, t, W):
    if t <= 0:
        return old
    if t >= 1:
        return new
    edge = -80 + ease(t) * (W + 160)
    xs = np.arange(W, dtype=np.float32)
    m = np.clip((edge - xs) / 60.0 + 0.5, 0, 1)[None, :, None]
    out = old * (1 - m) + new * m
    out = out + (255 - out) * (np.exp(-((xs - edge) / 3.0) ** 2)[None, :, None] * 0.55)
    return out.astype(np.uint8)


def grid_layout(n, W, H, gap):
    """Columns/rows and cell size that fit n tiles of the frame's aspect as large as possible."""
    best = None
    for cols in range(1, n + 1):
        rows = math.ceil(n / cols)
        cw = min((W * 0.96 - gap * (cols - 1)) / cols, ((H * 0.96 - gap * (rows - 1)) / rows) * W / H)
        if best is None or cw > best[2]:
            best = (cols, rows, cw)
    cols, rows, cw = best
    cw = int(cw) // 2 * 2
    ch = int(cw * H / W) // 2 * 2
    return cols, rows, cw, ch


def endcard(W, H, n, logo_path, credit):
    bg = (8, 8, 12)
    logo = bloom = None
    if logo_path:
        logo = Image.open(logo_path).convert("RGBA")
        lw = int(min(W, H * 16 / 9) / 3)
        logo = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
        bloom = logo.filter(ImageFilter.GaussianBlur(18))
    cf = load_font(SANS, int(46 * min(W, H) / 1080))
    cx = W // 2
    if logo:   # icon + wordmark logos: halfway between the logo's center and the wordmark's center reads as centered
        cols = np.where((np.asarray(logo.getchannel("A")) > 20).any(0))[0]
        if len(cols) > 1:
            k = int(np.argmax(np.diff(cols)))
            if cols[k + 1] - cols[k] > 0.03 * logo.width:
                cx = (W - logo.width) // 2 + (logo.width // 2 + (cols[k + 1] + cols[-1]) // 2) // 2
    for i in range(n):
        t = ease(i / 30)
        card = Image.new("RGBA", (W, H), bg + (255,))
        ly = H // 2 - 30
        if logo:
            lx, ly = (W - logo.width) // 2, H // 2 - logo.height // 2 - 30
            b = bloom.copy()
            b.putalpha(b.getchannel("A").point(lambda v: int(v * 0.55 * t * (1 - 0.6 * ease((i - 30) / 40)))))
            card.alpha_composite(b, (lx, ly))
            l = logo.copy()
            l.putalpha(l.getchannel("A").point(lambda v: int(v * t)))
            card.alpha_composite(l, (lx, ly))
            ly += logo.height
        if credit:   # credit ABOVE the logo
            top = (H // 2 - logo.height // 2 - 30) if logo else H // 2
            # Text drawn straight onto the card writes its fill RGB and drops the fade with the alpha
            # channel; a layer of the fill color composited over the card keeps the fade visible.
            text = Image.new("RGBA", (W, H), (170, 170, 178, 0))
            ImageDraw.Draw(text).text((cx, top - int(44 * min(W, H) / 1080)), credit, font=cf,
                                      fill=(170, 170, 178, int(255 * ease((i - 6) / 24))), anchor="ms")
            card.alpha_composite(text)
        out = np.asarray(card.convert("RGB")).astype(np.float32)
        fo = ease((i - (n - 14)) / 14)
        yield (out * (1 - fo) + np.array(bg) * fo).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--renders", required=True)
    ap.add_argument("--looks", required=True)
    ap.add_argument("--source", default="00_ungraded", help="render key (or video path) of the ungraded clip")
    ap.add_argument("--out", required=True)
    ap.add_argument("--order", default="")
    ap.add_argument("--music", default=None)
    ap.add_argument("--logo", default=None, help="white logo PNG for the end card")
    ap.add_argument("--credit", default="", help="end card text; the reel has an end card only with --credit or --logo")
    ap.add_argument("--header", default="COLOR GRADE")
    ap.add_argument("--source-label", default="Ungraded source")
    ap.add_argument("--source-settings", default="original footage")
    ap.add_argument("--size", default=None)
    ap.add_argument("--intro", type=float, default=3)
    ap.add_argument("--seg", type=float, default=3)
    ap.add_argument("--grid", type=float, default=7)
    ap.add_argument("--end", type=float, default=4)
    ap.add_argument("--force", action="store_true", help="overwrite an existing --out file")
    a = ap.parse_args()
    if Path(a.out).exists() and not a.force:
        ap.error(f"refusing to overwrite {a.out} (pass --force)")
    if a.logo and not Path(a.logo).exists():
        ap.error(f"logo not found: {a.logo}")
    logo = a.logo
    endcard_on = bool(logo or a.credit)

    renders = Path(a.renders)
    looks = grade.load_looks(a.looks)
    src = renders / f"{a.source}.mp4" if (renders / f"{a.source}.mp4").exists() else Path(a.source)
    keys = a.order.split(",") if a.order else [k for k in looks if k != a.source]
    keys = [k for k in keys if (renders / f"{k}.mp4").exists()]
    plan = [(renders / f"{k}.mp4", looks.get(k, {}).get("name", k), looks.get(k, {}).get("settings", "")) for k in keys]
    info = media.probe(src)
    fps, loop = info["fps"], info["frames"]
    if a.size:
        W, H = map(int, a.size.lower().split("x"))
    else:
        W, H = (1920, 1080) if info["w"] >= info["h"] else (1080, 1920)
    sc = fps / 24.0
    global TYPE_NAME, TYPE_SET, ENTER, WIPE
    TYPE_NAME, TYPE_SET, ENTER, WIPE = (int(round(v * sc)) for v in (TYPE_NAME, TYPE_SET, ENTER, WIPE))
    SEG, INTRO, GRID, END = (int(round(v * fps)) for v in (a.seg, a.intro, a.grid, a.end))
    P = Panel(W, H, a.header)
    total = len(plan)

    silent = Path(a.out).with_suffix(".silent.mp4")
    enc = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                            "-r", info["fps_str"], "-i", "-", "-c:v", "libx264", "-crf", "16", "-preset", "slow",
                            "-pix_fmt", "yuv420p", str(silent)], stdin=subprocess.PIPE)
    out = lambda fr: enc.stdin.write(np.ascontiguousarray(fr).tobytes())
    g = 0
    rd = lambda path, w=W, h=H: Reader(path, g, loop, fps, w, h)

    cur = rd(src)
    for f in range(INTRO):
        fr = cur.read().copy()
        ap_ = ease((f - 4) / 10)
        tf = f - 14
        if ap_ > 0:
            paste(fr, P.draw(a.source_label, a.source_settings, None, total, max(tf, 0), ap_,
                             typing=tf < TYPE_NAME + TYPE_SET + 40), P.PX, P.PY + int(24 * P.s * (1 - ap_)))
        out(fr)
        g += 1

    for i, (path, name, settings) in enumerate(plan):
        nxt = rd(path)
        for f in range(SEG):
            old = cur.read() if cur else None
            new = nxt.read()
            fr = wipe(old, new, (f - ENTER) / WIPE, W).copy() if f < ENTER + WIPE else new.copy()
            if f == ENTER + WIPE and cur:
                cur.close()
                cur = None
            paste(fr, P.draw(name, settings, i + 1, total, f, applied=f >= ENTER + 4), P.PX, P.PY)
            out(fr)
            g += 1
        cur = nxt
        print(f"look {i + 1}/{total} {name}", flush=True)

    if GRID and total:
        gap = int(6 * min(W, H) / 1080)
        cols, rows, cw, ch = grid_layout(total, W, H, gap)
        gx0 = (W - (cols * cw + (cols - 1) * gap)) // 2
        gy0 = (H - (rows * ch + (rows - 1) * gap)) // 2
        cells = [rd(p, cw, ch) for p, _, _ in plan]
        lf = load_font(SANS_B, max(11, int(15 * cw / 470)))
        bg = np.array((8, 8, 12), np.float32)
        for f in range(GRID):
            full = cur.read().astype(np.float32)
            tiles = [c.read() for c in cells]
            fr = full * (1 - ease((f - 20) / 14)) + bg * ease((f - 20) / 14)
            for j, tile in enumerate(tiles):
                r, c = divmod(j, cols)
                tt = ease((f - 22 - 2 * j) / 10)
                if tt <= 0:
                    continue
                img = Image.fromarray(tile)
                if tt < 1:
                    img = img.resize((max(1, int(cw * (0.9 + 0.1 * tt))), max(1, int(ch * (0.9 + 0.1 * tt)))), Image.BILINEAR)
                tw, th = img.size
                ox, oy = gx0 + c * (cw + gap) + (cw - tw) // 2, gy0 + r * (ch + gap) + (ch - th) // 2
                fr[oy:oy + th, ox:ox + tw] = fr[oy:oy + th, ox:ox + tw] * (1 - tt) + np.asarray(img, np.float32) * tt
            fr = fr.astype(np.uint8)
            for j, (_, name, _) in enumerate(plan):
                la = ease((f - 40 - 2 * j) / 10)
                if la > 0:
                    r, c = divmod(j, cols)
                    lab = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
                    d = ImageDraw.Draw(lab)
                    bw = d.textlength(name, font=lf)
                    d.rounded_rectangle((8, ch - lf.size - 22, 8 + bw + 20, ch - 8), radius=6, fill=(0, 0, 0, int(150 * la)))
                    d.text((18, ch - lf.size - 16), name, font=lf, fill=(255, 255, 255, int(235 * la)))
                    paste(fr, lab, gx0 + c * (cw + gap), gy0 + r * (ch + gap))
            pa = 1 - ease((f - 22) / 12)
            if pa > 0:
                paste(fr, P.draw("compare all looks", f"{total} grades · same clip · same frame", total, total, f,
                                 appear=pa, applied=f >= 20), P.PX, P.PY)
            fo = ease((f - (GRID - 14)) / 14) if endcard_on else 0
            if fo > 0:
                fr = (fr * (1 - fo) + bg * fo).astype(np.uint8)
            out(fr)
            g += 1
        for c in cells:
            c.close()
    if cur:
        cur.close()

    if endcard_on:
        for fr in endcard(W, H, END, logo, a.credit):
            out(fr)
            g += 1
    enc.stdin.close()
    enc.wait()

    dur = g / fps
    if a.music:
        # No -shortest: audio a hair shorter than the video makes it drop the last frame. The music is
        # trimmed after loudnorm, padded and rounded up, so it always covers every video frame.
        end = math.ceil(dur * 1000) / 1000
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(silent), "-stream_loop", "-1", "-i", a.music,
                        "-filter_complex", f"[1:a]atrim=0:{end:.3f},afade=t=in:d=0.6,afade=t=out:st={max(dur - 3, 0):.3f}:d=3,"
                                           f"loudnorm=I=-18:TP=-1.5:LRA=11,aresample=48000,apad,atrim=0:{end:.3f}[a]",
                        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-ar", "48000",
                        "-movflags", "+faststart", a.out], check=True)
        silent.unlink()
    else:
        silent.rename(a.out)
    print(f"done: {a.out} ({dur:.2f} s, {g} frames)")


if __name__ == "__main__":
    main()
