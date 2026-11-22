#!/usr/bin/env python3
"""Render every moving UI element of an ad into one transparent ProRes 4444 track each.

Usage: python3 render_tracks.py spec.json OUTDIR [--only NAME ...]

Each element becomes OUTDIR/<name>.mov, cropped to the box it moves in, and gets an entry in
OUTDIR/layers.json: a compose layer with string x, y, width, height, fit "fill", mute true, and
the times that make compose show exactly its frames (video_times: half a frame early in, a quarter
frame early out). An icon_pop still is an image layer: it starts on its frame time rounded down
and ends half a frame before its end frame. Its "source" is the
file name until the upload: build_passes.py maps it to the asset id. --only re-renders the named
elements, keeps the entries of the other elements in the spec, and drops entries of elements no
longer in it. An element whose file is byte-identical to an earlier one (taps with the same
relative timing can be) gets "same_as" that file in its entry: upload only the earlier file, and
build_passes.py reuses its asset id.

Spec (paths relative to the spec file; every time is a frame number at "fps", "_s" keys are seconds):
{
  "fps": 30, "canvas": [1080, 1920],
  "safe_zone": {"top": 270, "bottom": 1248, "left": 65, "right": 1015, "text_right": 940},
  "elements": [{"type": "counter", "name": "counter", ...}, ...]
}
safe_zone defaults to the 9:16 social zone above on a 1080x1920 canvas and to none elsewhere;
null turns the check off. Any element takes "safe": "text", "meaning" or "none" to override its
check, and "qscale" (ProRes -qscale:v, higher is smaller) to shrink a large track.

Element types, required keys first, defaults in parentheses:
  hand_tap     png, tip [x, y] (fingertip on the PNG), at [x, y], in, press, out; height (220),
               hold (7 frames on the target after the press), approach ([80, 100]), retreat
               ([60, 70]), ring (true), fade ([3, out - press - hold]: it fades over the retreat)
  hand_drag    png, tip, keys [[frame, x, y], ...] (fingertip path, linear; a 4th item "out" eases
               into that key), press (list: a frame for a 0.15 s tap, or [from, to] held); height
               (220), ring (true), fade ([3, 6]: frames fading in from the first key and out at the
               end), linger (6: frames the hand stays on the last key while it fades; 0 fades it
               before the last key)
               Every press: the hand shrinks to 92% while pressed, and a white ring grows from the
               fingertip for 0.3 s unless ring is false. Each press falls between the first and
               last key. The glove may leave the safe zone, but a press is warned where it touches
               down outside the text zone (clear of the right rail), and a held press where it
               lifts, unless safe is "none".
  counter      values [PNG per value, null for an empty state], steps [frame of each value after
               the first], start, end; at ([0, 0], top-left of every PNG), bump (1.12), bump_s
               (0.15), glow ("#FFFFFF", null for none), bumps (a bumped PNG per value, drawn as given
               instead of scaling). A pop that would leave the safe zone is shifted inside it;
               layers.json then gives "bump_shift", and the note gives where the counter must sit
               for a centered pop
  progress     box [x, y, w, h], fractions [one per value], steps [frame of each fraction after the
               first], start, end; colors {rim, track, fill_top, fill_bottom}, fill_s (0.27)
  floater      png, events [[frame, cx, cy], ...]; rise (120), dur_s (0.6). Two floaters that meet
               on screen, in one element or across elements, are warned
  fly_to_hud   icon, frame, from [x, y], to [x, y]; count (3), icon_px (120), flight_s (0.4),
               stagger_s (0.045), spread (130), outline (7), seed (3). layers.json gives "land",
               the first frame with the first icon gone into the HUD, frame + ceil(flight_s * fps):
               step the counter on it
  burst        center [x, y], frame; scale (1.0), dur_s (0.42), colors, spikes (12), seed (1)
  stars        centers [[x, y], ...], size or sizes, fills [frame per star], end; show (frame the
               empty slots appear, for win stars; omit for stars that pop in), glint_s (null, 0.42
               on an end card), fill, stroke
  icon_pop     png (tight), x, y, frame; curve ([0.4, 0.82, 1.1, 1.05, 1.0]), until (frame: adds
               the still PNG layer from the pop's end, with no overlap frame) or exit (frame: holds
               the icon, then plays the curve backward to nothing, ending on that frame). A still
               under 304 px a side is written padded into OUTDIR/<name>_still.png, placed so its
               pixels stay put: upload that file. Compose shows an image layer one or two frames
               after its startTime, so the still can blink in late
  bounce_in    png, center [x, y], height, start, end; rise (260), dur_s (0.42), angle (0),
               hop_every_s (1.2), hop (22)
  label_pulse  png (tight), x, y, start, end; period_s (0.9), amp (0.035), sweeps [frames],
               sweep_s (0.5). It pops in from 60% over 4 frames, unless it starts on frame 0, the
               ad's first impression: then it shows at full size
  flash        frames [frame, ...]: a flash at alpha on each frame, fading out over dur_s; color
               ("#FFFFFF"), box ([x, y, w, h], the canvas), alpha (0.7), dur_s (0.25), or png with
               x, y: the PNG flashes instead of a box (an edge glow; spaced frames pulse a label)
  ring         center [x, y], radius (or [rx, ry] for an ellipse), start, end; width (10), color
               ("#FFFFFF"), alpha (1.0), timer (false: true empties the ring clockwise from 12
               o'clock between start and end, a patience timer), pulse (0.04, scale amplitude of a
               0.9 s breathing; 0 for none)
  rays         background (plain PNG), center [x, y], start, end; speed (7 deg/s), ray_deg (9),
               alpha (0.12). An opaque full-canvas H.264 .mp4, not a ProRes track
  group        elements [...]: children drawn into one track, to save compose layers. Their
               "land", "still" and "bump_shift" go under "parts" in layers.json
"""

import argparse
import hashlib
import json
import math
import random
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SOCIAL_9X16 = {"top": 270, "bottom": 1248, "left": 65, "right": 1015, "text_right": 940}
VISIBLE = 8  # alpha above this counts for the safe zone: a soft glow tail below it is invisible
MIN_IMAGE = 304  # compose draws an image under about 300 px on a side at the wrong scale
PRORES = ["-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", "-alpha_bits", "16",
          "-vendor", "apl0"]


class SpecError(Exception):
    pass


def floor_ms(frame, fps):
    """Compose time of a frame. Rounded up (185 / 30 as 6.167), a layer starts one frame late."""
    return frame * 1000 // fps / 1000


def end_ms(frame, fps):
    """endTime of an image layer that stops before frame: half a frame early, as compose draws an image on its endTime."""
    return (frame * 1000 // fps - round(500 / fps)) / 1000


def video_times(first, end, fps):
    """startTime and endTime of a video layer showing frames first to end - 1.

    Compose can drop the last frame of a video layer whose start falls just before a frame, as a
    frame time rounded down to the millisecond does (185 / 30 as 6.166): a black frame at a hard
    cut. Half a frame early in and a quarter frame early out shows exactly these frames whichever
    way compose rounds, and frame 0 starts on 0.
    """
    start = 0.0 if first == 0 else math.floor((first - 0.5) * 1000 / fps) / 1000
    return start, math.floor((end - 0.25) * 1000 / fps) / 1000


def ease_out(u):
    u = min(1.0, max(0.0, u))
    return 1 - (1 - u) ** 3


def ease_in_out(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def back_out(u, s=1.70158):
    u = min(1.0, max(0.0, u)) - 1
    return u * u * ((s + 1) * u + s) + 1


def hexrgb(h, a=255):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def scaled(im, s):
    if abs(s - 1) < 1e-3:
        return im
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def faded(im, a):
    if a >= 1:
        return im
    out = im.copy()
    out.putalpha(im.getchannel("A").point(lambda v: int(v * max(0.0, a))))
    return out


def paste(canvas, im, x, y):
    x, y = round(x), round(y)
    sx, sy = max(0, -x), max(0, -y)
    ex, ey = min(im.width, canvas.width - x), min(im.height, canvas.height - y)
    if ex > sx and ey > sy:
        canvas.alpha_composite(im, (x + sx, y + sy), (sx, sy, ex, ey))


def paste_center(canvas, im, cx, cy):
    paste(canvas, im, cx - im.width / 2, cy - im.height / 2)


def visible_bbox(im, alpha=0):
    a = im.getchannel("A")
    return a.point([0] * (alpha + 1) + [255] * (255 - alpha)).getbbox() if alpha else a.getbbox()


def ring(canvas, cx, cy, r, width, color, alpha):
    if alpha <= 0 or r <= 0:
        return
    S = 2
    size = int(2 * (r + width) + 4)
    c = size * S / 2
    big = Image.new("RGBA", (size * S, size * S), (0, 0, 0, 0))
    ImageDraw.Draw(big).ellipse([c - r * S, c - r * S, c + r * S, c + r * S],
                                outline=tuple(color[:3]) + (int(255 * alpha),), width=max(1, int(width * S)))
    paste_center(canvas, big.resize((size, size), Image.LANCZOS), cx, cy)


_sparkles = {}


def sparkle(size, color=(255, 255, 255), angle=0.0, alpha=1.0):
    key = (max(4, int(size)), tuple(color[:3]))
    if key not in _sparkles:
        S, R = 4, key[0] * 2
        D = int(key[0] * 1.6)
        c, w = D * S / 2, R * 0.16
        big = Image.new("RGBA", (D * S, D * S), (0, 0, 0, 0))
        glow = Image.new("RGBA", big.size, (0, 0, 0, 0))
        ImageDraw.Draw(glow).ellipse([c - R * .55, c - R * .55, c + R * .55, c + R * .55], fill=key[1] + (150,))
        big.alpha_composite(glow.filter(ImageFilter.GaussianBlur(R * 0.25)))
        ImageDraw.Draw(big).polygon([(c, c - R), (c + w, c - w), (c + R, c), (c + w, c + w), (c, c + R),
                                     (c - w, c + w), (c - R, c), (c - w, c - w)], fill=key[1] + (255,))
        _sparkles[key] = big.resize((D, D), Image.LANCZOS)
    im = _sparkles[key]
    if angle:
        im = im.rotate(angle, resample=Image.BICUBIC, expand=True)
    return faded(im, alpha)


def star(size, fill="#FFD93B", stroke="#6A3A00", empty=False):
    S = 4
    sw, dy = (max(4, size // 26), 0) if empty else (max(4, size // 22), max(4, size // 25))
    D = size + 2 * (sw + dy + 4)
    big = Image.new("RGBA", (D * S, D * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    c, R = D * S / 2, size * S / 2

    def points(cx, cy, r_out, r_in):
        return [(cx + (r_out if k % 2 == 0 else r_in) * math.sin(k * math.pi / 5),
                 cy - (r_out if k % 2 == 0 else r_in) * math.cos(k * math.pi / 5) + r_out * 0.06) for k in range(10)]

    p = points(c, c, R, R / 2)
    if empty:
        d.line(p + [p[0]], fill=(255, 255, 255, 235), width=sw * S * 2, joint="curve")
        d.polygon(p, fill=(10, 20, 60, 150))
    else:
        shadow = [(x, y + dy * S) for x, y in p]
        d.line(shadow + [shadow[0]], fill=hexrgb(stroke), width=sw * S * 2, joint="curve")
        d.polygon(shadow, fill=hexrgb(stroke))
        d.line(p + [p[0]], fill=hexrgb(stroke), width=sw * S * 2, joint="curve")
        d.polygon(p, fill=hexrgb(fill))
        # ImageDraw replaces pixels instead of blending, so the gloss needs its own layer
        gloss = Image.new("RGBA", big.size, (0, 0, 0, 0))
        ImageDraw.Draw(gloss).polygon(points(c - R * 0.08, c - R * 0.12, R * 0.55, R * 0.275), fill=(255, 255, 255, 80))
        big.alpha_composite(gloss)
    return big.resize((D, D), Image.LANCZOS)


def shine_band(size, pos, width, alpha, angle=24):
    w, h = size
    S = 2
    big = Image.new("L", (w * S, h * S), 0)
    d = ImageDraw.Draw(big)
    off = math.tan(math.radians(angle)) * h
    for k, a in ((1.0, alpha * 0.45), (0.45, alpha)):
        half = width * k / 2
        d.polygon([((pos - half) * S, h * S), ((pos + half) * S, h * S), ((pos + half + off) * S, 0),
                   ((pos - half + off) * S, 0)], fill=int(255 * a))
    return big.resize((w, h), Image.LANCZOS)


class Ctx:
    def __init__(self, spec, base):
        self.fps = spec.get("fps", 30)
        self.size = tuple(spec.get("canvas", (1080, 1920)))
        self.base = base
        self.safe = spec["safe_zone"] if "safe_zone" in spec else (SOCIAL_9X16 if self.size == (1080, 1920) else None)
        self._png = {}

    def png(self, path):
        if path not in self._png:
            self._png[path] = Image.open(self.base / path).convert("RGBA")
        return self._png[path]

    def frames(self, seconds):
        return max(1, int(seconds * self.fps + 0.5))

    def zone(self, el, default):
        kind = el.get("safe", default)
        if not self.safe or kind == "none":
            return None
        s = self.safe
        return s["left"], s["top"], s["text_right"] if kind == "text" else s["right"], s["bottom"]


# Each renderer returns (first frame, end frame exclusive, draw(canvas, frame), meta).

def r_hand_tap(el, ctx):
    x, y = el["at"]
    ax, ay = el.get("approach", (80, 100))
    rx, ry = el.get("retreat", (60, 70))
    press, out = el["press"], el["out"]
    release = press + el.get("hold", 7)
    keys = [[el["in"], x + ax, y + ay], [press - 1, x, y, "out"], [release, x, y], [out, x + rx, y + ry, "out"]]
    return r_hand_drag({**el, "keys": keys, "press": [press], "fade": el.get("fade", [3, out - release]), "linger": 0}, ctx)


def r_hand_drag(el, ctx):
    src = ctx.png(el["png"])
    k = el.get("height", 220) / src.height
    hand, (tip_x, tip_y) = scaled(src, k), (el["tip"][0] * k, el["tip"][1] * k)
    keys = el["keys"]
    first, last = keys[0][0], keys[-1][0]
    if any(b[0] <= a[0] for a, b in zip(keys, keys[1:])):
        raise SpecError(f"{el['name']}: keys need strictly increasing frames")
    tap = ctx.frames(0.15)
    presses = [(p, p + tap) if isinstance(p, (int, float)) else tuple(p) for p in el.get("press", [])]
    if any(not first <= p0 <= last for p0, _ in presses):
        raise SpecError(f"{el['name']}: every press must fall between the first and last key")
    fade_in, fade_out = el.get("fade", [3, 6])
    end = last + el.get("linger", fade_out)

    def pos(n):
        for a, b in zip(keys, keys[1:]):
            if a[0] <= n <= b[0]:
                u = (n - a[0]) / (b[0] - a[0])
                if len(b) > 3 and b[3] == "out":
                    u = ease_out(u)
                return a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u
        return keys[-1][1], keys[-1][2]

    def draw(canvas, n):
        if el.get("ring", True):
            for p0, _ in presses:
                u = (n - p0) / (0.3 * ctx.fps)
                if 0 <= u <= 1:
                    ring(canvas, *pos(p0), 18 + 77 * ease_out(u), 9, (255, 255, 255), (1 - u) ** 1.3)
        s = 0.92 if any(p0 <= n < p1 for p0, p1 in presses) else 1.0
        # Squared: a plain ramp leaves a ghost glove on screen for the last frames of the retreat.
        a = min(1.0, (n - first + 1) / fade_in if fade_in else 1.0, ((end - n) / fade_out) ** 3 if fade_out else 1.0) ** 2
        x, y = pos(n)
        paste(canvas, faded(scaled(hand, s), a), x - tip_x * s, y - tip_y * s)

    # The tap target, not the glove: a target under the platform UI cannot read as tapped.
    zone = None if el.get("safe") == "none" else ctx.zone({}, "text")
    points = {}  # a quick tap lands where it touches down, a held press also where it lifts
    for f in (f for p in el.get("press", []) for f in ((p,) if isinstance(p, (int, float)) else (p[0], p[1] - 1))):
        points.setdefault(tuple(round(v) for v in pos(f)), f)
    warnings = [w for (x, y), f in points.items()
                for w in safe_warnings(f"{el['name']} press on frame {f}", (x, y, x, y), zone)]
    return first, end + 1, draw, {"warnings": warnings} if warnings else {}


def clamp_into(im, x, y, zone):
    """Shift a placed image so its visible pixels stay inside zone (left, top, right, bottom)."""
    bb = visible_bbox(im, VISIBLE)
    if not bb or not zone:
        return x, y
    left, top, right, bottom = zone
    x += max(0, left - (x + bb[0])) - max(0, x + bb[2] - right)
    y += max(0, top - (y + bb[1])) - max(0, y + bb[3] - bottom)
    return x, y


def bump_image(im, ox, oy, scale, glow, zone):
    """The popped image, where it goes, and the shift that keeps it in zone; (None, ...) for an empty state."""
    bb = im.getbbox() if im is not None else None
    if not bb:
        return None, (ox, oy), (0, 0)
    big = scaled(im.crop(bb), scale)
    pad = 40 if glow else 0
    out = Image.new("RGBA", (big.width + 2 * pad, big.height + 2 * pad), (0, 0, 0, 0))
    if glow:
        mask = Image.new("L", out.size, 0)
        mask.paste(big.getchannel("A"), (pad, pad))
        halo = Image.new("RGBA", out.size, hexrgb(glow))
        halo.putalpha(mask.filter(ImageFilter.GaussianBlur(12)).point(lambda v: min(255, 2 * v) * 3 // 4))
        out.alpha_composite(halo)
    out.alpha_composite(big, (pad, pad))
    x = round(ox + (bb[0] + bb[2]) / 2 - out.width / 2)
    y = round(oy + (bb[1] + bb[3]) / 2 - out.height / 2)
    cx, cy = clamp_into(out, x, y, zone)
    return out, (cx, cy), (cx - x, cy - y)


def centered_pop_needs(rest, ox, oy, shift):
    """Where the counter's visible pixels must sit for its pop to stay centered in the safe zone."""
    bb = visible_bbox(rest, VISIBLE) if rest is not None else None
    if not bb:
        return []
    (dx, dy), (x0, y0, x1, y1) = shift, (ox + bb[0], oy + bb[1], ox + bb[2], oy + bb[3])
    return ([f"top at y {y0 + dy} or more"] if dy > 0 else [f"bottom at y {y1 + dy} or less"] if dy < 0 else []) + \
        ([f"left at x {x0 + dx} or more"] if dx > 0 else [f"right at x {x1 + dx} or less"] if dx < 0 else [])


def r_counter(el, ctx):
    ox, oy = el.get("at", (0, 0))
    rest = [ctx.png(p) if p else None for p in el["values"]]
    rest = [im if im is not None and im.getbbox() else None for im in rest]
    steps, bumps = el.get("steps", []), el.get("bumps")
    if len(steps) != len(rest) - 1 or (bumps and len(bumps) != len(rest)):
        raise SpecError(f"{el['name']}: give one step frame per value after the first, and one bump PNG per value")
    zone = ctx.zone(el, "text")
    if bumps:
        bumped = [bump_image(ctx.png(p) if p else None, ox, oy, 1.0, None, zone) for p in bumps]
    else:
        bumped = [bump_image(im, ox, oy, el.get("bump", 1.12), el.get("glow", "#FFFFFF"), zone) for im in rest]
    hold = ctx.frames(el.get("bump_s", 0.15))

    def draw(canvas, n):
        v = sum(n >= s for s in steps)
        im, (x, y), _ = bumped[v] if v and n - steps[v - 1] < hold else (rest[v], (ox, oy), None)
        if im is not None:
            paste(canvas, im, x, y)

    worst = max(range(len(bumped)), key=lambda v: abs(bumped[v][2][0]) + abs(bumped[v][2][1]))
    shift = bumped[worst][2]
    if not any(shift):
        return el["start"], el["end"], draw, {}
    return el["start"], el["end"], draw, {"bump_shift": list(shift),
                                          "bump_needs": centered_pop_needs(rest[worst], ox, oy, shift)}


def bar_image(w, h, frac, colors, flash):
    S, pad = 3, 8
    im = Image.new("RGBA", ((w + 2 * pad) * S, (h + 2 * pad) * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    def box(x0, y0, x1, y1):
        return x0 * S, y0 * S, x1 * S, y1 * S

    d.rounded_rectangle(box(pad, pad + 5, pad + w, pad + h + 5), h * S // 2, fill=(0, 0, 0, 90))
    d.rounded_rectangle(box(pad, pad, pad + w, pad + h), h * S // 2, fill=hexrgb(colors["rim"]))
    rim = max(2, h // 6)
    inner_h, x0, y0, x1 = h - 2 * rim, pad + rim, pad + rim, pad + w - rim
    d.rounded_rectangle(box(x0, y0, x1, y0 + inner_h), inner_h * S // 2, fill=hexrgb(colors["track"]))
    if frac > 0:
        mask = Image.new("L", im.size, 0)
        fill_w = max(inner_h, (x1 - x0) * min(1.0, frac))
        ImageDraw.Draw(mask).rounded_rectangle(box(x0, y0, x0 + fill_w, y0 + inner_h), inner_h * S // 2, fill=255)
        top, bottom = (np.array(hexrgb(colors[k])[:3], np.float32) for k in ("fill_top", "fill_bottom"))
        k = np.clip((np.arange(im.height) / S - y0) / inner_h, 0, 1)[:, None]
        rows = top + (bottom - top) * k
        rows[(k[:, 0] > 0.12) & (k[:, 0] < 0.32)] += 50
        rows += (255 - rows) * flash
        fill = np.repeat(np.clip(rows, 0, 255).astype(np.uint8)[:, None, :], im.width, 1)
        im.paste(Image.fromarray(fill, "RGB"), (0, 0), mask)
    return im.resize((w + 2 * pad, h + 2 * pad), Image.LANCZOS)


def r_progress(el, ctx):
    x, y, w, h = el["box"]
    fractions, steps = el["fractions"], el.get("steps", [])
    if len(steps) != len(fractions) - 1:
        raise SpecError(f"{el['name']}: give one step frame per fraction after the first")
    colors = {"rim": "#FFFFFF", "track": "#1B2450", "fill_top": "#C6FF5E", "fill_bottom": "#4CB817",
              **el.get("colors", {})}
    grow = ctx.frames(el.get("fill_s", 0.27))

    def draw(canvas, n):
        v = sum(n >= s for s in steps)
        since = n - steps[v - 1] if v else 10 ** 6
        frac = fractions[v - 1] + (fractions[v] - fractions[v - 1]) * ease_out(since / grow) if since < grow else fractions[v]
        flash = (0.7, 0.45, 0.2)[since] if since < 3 else 0.0
        pop = (1.14, 1.09, 1.05, 1.02)[since] if since < 4 else 1.0
        paste_center(canvas, scaled(bar_image(w, h, frac, colors, flash), pop), x + w / 2, y + h / 2)

    return el["start"], el["end"], draw, {}


def r_floater(el, ctx):
    im, events = ctx.png(el["png"]), el["events"]
    dur, rise, pop = ctx.frames(el.get("dur_s", 0.6)), el.get("rise", 120), (0.7, 1.08, 1.0)

    def draw(canvas, n):
        for f0, cx, cy in events:
            k = n - f0
            if 0 <= k < dur:
                u = k / dur
                a = 1.0 if u < 2 / 3 else 3 * (1 - u)
                paste_center(canvas, faded(scaled(im, pop[k] if k < len(pop) else 1.0), a), cx, cy - rise * ease_out(u))

    return min(e[0] for e in events), max(e[0] for e in events) + dur, draw, {}


def floater_boxes(el, ctx):
    """Per event, its first frame and the visible box it covers on each frame while mostly opaque."""
    im = ctx.png(el["png"])
    bb = visible_bbox(im, VISIBLE) or (0, 0, im.width, im.height)
    dur, rise, pop = ctx.frames(el.get("dur_s", 0.6)), el.get("rise", 120), (0.7, 1.08, 1.0)
    out = []
    for f0, cx, cy in el["events"]:
        boxes = {}
        for k in range(dur):
            u, s = k / dur, pop[k] if k < len(pop) else 1.0
            if u < 0.9:  # the last tenth fades under 30%: a touch there reads as a hand-off, not a collision
                x0, y0 = cx - im.width * s / 2, cy - rise * ease_out(u) - im.height * s / 2
                boxes[f0 + k] = (x0 + bb[0] * s, y0 + bb[1] * s, x0 + bb[2] * s, y0 + bb[3] * s)
        out.append((f0, boxes))
    return out


def floater_overlaps(elements, ctx):
    """(top-level names, warning) for every two floater events whose boxes meet on a frame."""
    items = []

    def walk(els, top=None, prefix=""):
        for el in els:
            name = prefix + str(el.get("name", el.get("type")))
            if el.get("type") == "group":
                walk(el.get("elements", []), top or name, name + "/")
            elif el.get("type") == "floater":
                try:
                    items.extend((top or name, name, f0, boxes) for f0, boxes in floater_boxes(el, ctx))
                except (KeyError, OSError, ValueError, TypeError):
                    pass  # render() reports a broken element with its name

    walk(elements)
    found = []
    for i, (ta, na, fa, ba) in enumerate(items):
        for tb, nb, fb, bb in items[i + 1:]:
            hit = next((n for n in sorted(set(ba) & set(bb)) if ba[n][0] < bb[n][2] and bb[n][0] < ba[n][2]
                        and ba[n][1] < bb[n][3] and bb[n][1] < ba[n][3]), None)
            if hit is not None:
                found.append(({ta, tb}, f"floaters {na} (frame {fa}) and {nb} (frame {fb}) overlap on frame {hit}: "
                                        "space them in time or on screen"))
    return found


def outlined(icon, width):
    """White rim around an icon, so a small one reads over any board."""
    pad = Image.new("RGBA", (icon.width + 4 * width, icon.height + 4 * width), (0, 0, 0, 0))
    pad.paste(icon, (2 * width, 2 * width))
    rim = pad.getchannel("A").filter(ImageFilter.MaxFilter(2 * width + 1)).filter(ImageFilter.GaussianBlur(1))
    out = Image.new("RGBA", pad.size, (255, 255, 255, 0))
    out.putalpha(rim)
    out.alpha_composite(pad)
    return out


def r_fly_to_hud(el, ctx):
    icon = ctx.png(el["icon"])
    icon = icon.crop(icon.getbbox())
    icon = scaled(icon, el.get("icon_px", 120) / max(icon.size))
    if el.get("outline", 7):
        icon = outlined(icon, el.get("outline", 7))
    (sx, sy), (tx, ty) = el["from"], el["to"]
    count, flight, stagger = el.get("count", 3), el.get("flight_s", 0.4), el.get("stagger_s", 0.045)
    spread, color = el.get("spread", 130), hexrgb(el.get("sparkle", "#FFE95C"))[:3]
    rnd = random.Random(el.get("seed", 3))
    dx, dy = tx - sx, ty - sy
    length = math.hypot(dx, dy) or 1.0
    paths = []
    for k in range(count):
        side = (-1) ** k * (0.6 + 0.4 * rnd.random())
        ctrl = ((sx + tx) / 2 - dy / length * spread * side, (sy + ty) / 2 + dx / length * spread * side)
        jitter = (rnd.uniform(-30, 30), rnd.uniform(-10, 20))
        paths.append(((sx + jitter[0], sy + jitter[1]), ctrl, k * stagger, rnd.uniform(-25, 25)))
    f0 = el["frame"]

    def bezier(p0, pc, q):
        return ((1 - q) ** 2 * p0[0] + 2 * (1 - q) * q * pc[0] + q ** 2 * tx,
                (1 - q) ** 2 * p0[1] + 2 * (1 - q) * q * pc[1] + q ** 2 * ty)

    def draw(canvas, n):
        t = (n - f0) / ctx.fps + 1e-6
        u0 = t / 0.25
        if u0 <= 1:
            ring(canvas, sx, sy, 20 + 70 * ease_out(u0), 8 * (1 - u0) + 2, (255, 255, 255), 1 - u0)
            for m in range(5):
                ag, rr = -math.pi / 2 + (m - 2) * 0.55, 30 + 80 * ease_out(u0)
                paste_center(canvas, sparkle(26 * (1 - .5 * u0), color, 40 * m, 1 - u0),
                             sx + math.cos(ag) * rr, sy + math.sin(ag) * rr)
        for p0, pc, delay, rot in paths:
            p = (t - delay) / flight
            if 0 <= p <= 1:
                for lag, alpha in ((0.10, .7), (0.20, .45), (0.30, .25)):
                    if p > lag:
                        paste_center(canvas, sparkle(20, color, 0, alpha), *bezier(p0, pc, ease_in_out(p - lag)))
                q = ease_in_out(p)
                s = 0.6 + 0.55 * min(1, p * 4) if p < 0.25 else 1.15 - 0.65 * (p - .25) / .75
                paste_center(canvas, scaled(icon, s).rotate(rot * (1 - q), resample=Image.BICUBIC, expand=True),
                             *bezier(p0, pc, q))
            elif 1 < p <= 1 + 0.2 / flight:
                v = (p - 1) * flight / 0.2
                ring(canvas, tx, ty, 30 + 40 * v, 6 * (1 - v) + 1, (255, 255, 255), 1 - v)
                paste_center(canvas, sparkle(44 * (1 - v) + 8, color, 90 * v, 1 - v), tx + 26, ty - 26)

    end = f0 + ctx.frames((count - 1) * stagger + flight + 0.24)
    # The first frame where draw() has the first icon past p = 1: ceil, so 12.3 frames lands on 13.
    return f0, end, draw, {"land": f0 + math.ceil(round(flight * ctx.fps, 6))}


def r_burst(el, ctx):
    (cx, cy), scale = el["center"], el.get("scale", 1.0)
    colors = [hexrgb(c) for c in el.get("colors", ("#FFFFFF", "#FFE55C", "#FF9A2E"))]
    spikes, f0 = el.get("spikes", 12), el["frame"]
    n = ctx.frames(el.get("dur_s", 0.42)) + 1
    rnd = random.Random(el.get("seed", 1))
    angles = [k * 2 * math.pi / spikes + rnd.uniform(-.18, .18) for k in range(spikes)]
    lengths = [rnd.uniform(.75, 1.15) for _ in range(spikes)]
    sparks = [(rnd.uniform(0, 2 * math.pi), rnd.uniform(.7, 1.1), rnd.uniform(26, 40) * scale, rnd.uniform(0, 90))
              for _ in range(9)]
    R, S = int(400 * scale), 2

    def draw(canvas, frame):
        i = frame - f0
        u = i / (n - 1)
        local = Image.new("RGBA", (2 * R, 2 * R), (0, 0, 0, 0))
        big = Image.new("RGBA", (4 * R, 4 * R), (0, 0, 0, 0))
        d = ImageDraw.Draw(big)
        a = 1.0 if u < 0.45 else max(0.0, 1 - (u - 0.45) / 0.55)
        for k, (ag, ln) in enumerate(zip(angles, lengths)):
            r_in = (30 + 150 * ease_out(u)) * scale * ln
            r_out = (80 + 250 * ease_out(min(1, u * 1.7))) * scale * ln
            if r_out <= r_in:
                continue
            w = (30 * (1 - u) + 4) * scale
            px, py = -math.sin(ag), math.cos(ag)
            base = (R + math.cos(ag) * r_in, R + math.sin(ag) * r_in)
            d.polygon([((base[0] + px * w) * S, (base[1] + py * w) * S), ((base[0] - px * w) * S, (base[1] - py * w) * S),
                       ((R + math.cos(ag) * r_out) * S, (R + math.sin(ag) * r_out) * S)],
                      fill=colors[k % 2][:3] + (int(255 * a),))
        local.alpha_composite(big.resize(local.size, Image.LANCZOS))
        if i <= 2:  # the flash core stays small and translucent, so the contact point stays readable
            core = Image.new("RGBA", local.size, (0, 0, 0, 0))
            rr = 60 * scale * (1 - i / 3)
            ImageDraw.Draw(core).ellipse([R - rr, R - rr, R + rr, R + rr], fill=(255, 255, 255, int(150 * (1 - i / 3))))
            local.alpha_composite(core.filter(ImageFilter.GaussianBlur(6)))
        if u < .75:
            k = u / .75
            ring(local, R, R, (40 + 220 * ease_out(k)) * scale, (20 * (1 - k) + 3) * scale, colors[0], 1 - k)
        for ag, speed, size, rot in sparks:
            rr = (60 + 230 * ease_out(u) * speed) * scale
            alpha = 1.0 if u < .55 else max(0.0, 1 - (u - .55) / .45)
            paste_center(local, sparkle(size * (1 - .5 * u), colors[1], rot + 200 * u, alpha),
                         R + math.cos(ag) * rr, R + math.sin(ag) * rr)
        paste(canvas, local, cx - R, cy - R)

    return f0, f0 + n, draw, {}


def r_stars(el, ctx):
    centers, fills, show = el["centers"], el["fills"], el.get("show")
    sizes = el.get("sizes") or [el["size"]] * len(centers)
    if not len(centers) == len(fills) == len(sizes):
        raise SpecError(f"{el['name']}: centers, fills and sizes need one entry per star")
    fill, stroke = el.get("fill", "#FFD93B"), el.get("stroke", "#6A3A00")
    full = [star(s, fill, stroke) for s in sizes]
    empty = [star(s, empty=True) for s in sizes] if show is not None else None
    curve = (1.55, 1.25, 0.92, 1.04) if show is not None else (0.3, 0.8, 1.22, 1.08)
    burst = el.get("burst", show is not None)
    glint = el.get("glint_s")
    g0 = max(fills) + ctx.frames(0.3)
    order = list(range(len(centers)))
    random.Random(el.get("seed", 5)).shuffle(order)

    def draw(canvas, n):
        g = gu = None
        if glint and n >= g0:
            t = (n - g0) / ctx.fps
            g, gu = order[int(t // glint) % len(centers)], (t % glint) / 0.34
        for k, ((cx, cy), f, size) in enumerate(zip(centers, fills, sizes)):
            if n < f:
                j = n - show - 2 * k if show is not None else -1
                if j >= 0:
                    paste_center(canvas, scaled(empty[k], (0.3, 0.75, 1.1)[j] if j < 3 else 1.0), cx, cy)
                continue
            j = n - f
            s = curve[j] if j < len(curve) else 1.0
            if g == k and gu <= 1:
                s *= 1 + 0.08 * math.sin(math.pi * gu)
            u = j / (0.32 * ctx.fps)
            if burst and u <= 1:
                ring(canvas, cx, cy, size * (0.35 + 0.55 * ease_out(u)), 10 * (1 - u) + 2, (255, 255, 255), 1 - u)
            paste_center(canvas, scaled(full[k], s), cx, cy)
            if burst and u <= 1:
                for m in range(6):
                    ag, rr = m * math.pi / 3 + 0.3, size * (0.3 + 0.55 * ease_out(u))
                    paste_center(canvas, sparkle(30 * (1 - .6 * u), (255, 240, 150), 60 * u, 1 - u ** 2),
                                 cx + math.cos(ag) * rr, cy + math.sin(ag) * rr)
            if g == k and gu <= 1:
                paste_center(canvas, sparkle(size * 0.62 * math.sin(math.pi * gu) + 4, (255, 255, 255), 90 * gu),
                             cx + size * 0.28, cy - size * 0.3)

    return show if show is not None else min(fills), el["end"], draw, {}


def r_icon_pop(el, ctx):
    im, x, y, f0 = ctx.png(el["png"]), el["x"], el["y"], el["frame"]
    curve = el.get("curve", [0.4, 0.82, 1.1, 1.05, 1.0])
    cx, cy = x + im.width / 2, y + im.height / 2
    if "until" in el and "exit" in el:
        raise SpecError(f"{el['name']}: give until (a still after the pop) or exit, not both")
    leave = list(reversed(curve[:-1]))
    end, meta = f0 + len(curve), {}
    if "exit" in el:
        if el["exit"] < end + len(leave):
            raise SpecError(f"{el['name']}: exit must be frame {end + len(leave)} or later")
        end = el["exit"]

    def draw(canvas, n):
        k, back = n - f0, n - (end - len(leave))
        s = curve[k] if k < len(curve) else leave[back] if "exit" in el and back >= 0 else 1.0
        if abs(s - 1) < 1e-3:  # the last frame matches the still layer pixel for pixel
            paste(canvas, im, x, y)
        else:
            paste_center(canvas, scaled(im, s), cx, cy)

    if "until" in el:
        if abs(curve[-1] - 1) > 1e-3:
            raise SpecError(f"{el['name']}: a pop that hands over to the still must end on scale 1.0")
        meta["still"] = {"type": "image", "source": Path(el["png"]).name, "x": str(x), "y": str(y),
                         "width": str(im.width), "height": str(im.height), "fit": "fill",
                         "startTime": floor_ms(end, ctx.fps), "endTime": end_ms(el["until"], ctx.fps), "_png": el["png"]}
    return f0, end, draw, meta


def pad_span(pos, size, limit):
    """Margin before and after a span shorter than MIN_IMAGE, kept inside 0..limit when it fits."""
    need = max(0, MIN_IMAGE - size)
    lo = max(0, min(pos - need // 2, limit - size - need))
    before = min(max(pos - lo, 0), need)
    return before, need - before


def pad_stills(meta, ctx, outdir, name):
    """Write every still under MIN_IMAGE a side padded into outdir, and point its layer at the copy."""
    for child, sub in meta.get("parts", {}).items():
        pad_stills(sub, ctx, outdir, f"{name}/{child}")
    still = meta.get("still")
    if not still or "_png" not in still:
        return
    im = ctx.png(still.pop("_png"))
    if min(im.size) >= MIN_IMAGE:
        return
    x, y = int(still["x"]), int(still["y"])
    (left, right), (top, bottom) = pad_span(x, im.width, ctx.size[0]), pad_span(y, im.height, ctx.size[1])
    out = Image.new("RGBA", (im.width + left + right, im.height + top + bottom), (0, 0, 0, 0))
    out.paste(im, (left, top))
    file = f"{name.replace('/', '_')}_still.png"
    out.save(outdir / file)
    still.update({"source": file, "x": str(x - left), "y": str(y - top), "width": str(out.width),
                  "height": str(out.height)})


def r_flash(el, ctx):
    frames, peak = sorted(el["frames"]), el.get("alpha", 0.7)
    dur = ctx.frames(el.get("dur_s", 0.25))
    if "png" in el:
        im, x, y = ctx.png(el["png"]), el["x"], el["y"]
    else:
        x, y, w, h = el.get("box", [0, 0, *ctx.size])
        im = Image.new("RGBA", (w, h), hexrgb(el.get("color", "#FFFFFF")))

    def draw(canvas, n):
        a = max([peak * (1 - (n - f) / dur) ** 2 for f in frames if 0 <= n - f < dur], default=0.0)
        if a > 0:
            paste(canvas, faded(im, a), x, y)

    return frames[0], frames[-1] + dur, draw, {}


def r_ring(el, ctx):
    (cx, cy), r, f0, f1 = el["center"], el["radius"], el["start"], el["end"]
    rx, ry = (r, r) if isinstance(r, (int, float)) else r
    width, pulse = el.get("width", 10), el.get("pulse", 0.04)
    color = hexrgb(el.get("color", "#FFFFFF"))[:3] + (int(255 * el.get("alpha", 1.0)),)
    S = 2

    def draw(canvas, n):
        s = 1 + pulse * math.sin(2 * math.pi * (n - f0) / ctx.fps / 0.9)
        a, b = rx * s, ry * s
        w, h = int(2 * (a + width) + 4), int(2 * (b + width) + 4)
        big = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
        box = [(w / 2 - a) * S, (h / 2 - b) * S, (w / 2 + a) * S, (h / 2 + b) * S]
        if el.get("timer"):
            done = (n - f0) / max(1, f1 - 1 - f0)  # 0 on the first frame, 1 (empty) on the last
            if done < 1:  # PIL angles run clockwise from 3 o'clock: -90 is 12 o'clock
                ImageDraw.Draw(big).arc(box, -90 + 360 * done, 270, fill=color, width=int(width * S))
        else:
            ImageDraw.Draw(big).ellipse(box, outline=color, width=int(width * S))
        paste_center(canvas, big.resize((w, h), Image.LANCZOS), cx, cy)

    return f0, f1, draw, {}


def r_bounce_in(el, ctx):
    im = ctx.png(el["png"])
    im = im.crop(im.getbbox())
    h = el["height"]
    im = im.resize((max(1, round(im.width * h / im.height)), h), Image.LANCZOS)
    if el.get("angle"):
        im = im.rotate(el["angle"], resample=Image.BICUBIC, expand=True)
    (cx, cy), f0 = el["center"], el["start"]
    rise, dur, hop_every, hop = el.get("rise", 260), el.get("dur_s", 0.42), el.get("hop_every_s", 1.2), el.get("hop", 22)

    def draw(canvas, n):
        t = (n - f0) / ctx.fps + 1e-6
        sx = sy = a = 1.0
        dy = 0.0
        if t < dur:
            u = t / dur
            dy, a = rise * (1 - back_out(u, 2.2)), min(1.0, u * 4)
            sx, sy = 1 - 0.06 * (1 - u), 1 + 0.10 * (1 - u)
        elif t - dur < 0.16:
            v = math.sin(math.pi * (t - dur) / 0.16)
            sx, sy = 1 + 0.12 * v, 1 - 0.10 * v
        else:
            j = t - dur
            phase = (j - 0.16) % hop_every
            if j > 0.6 and phase < 0.3:
                v = phase / 0.3
                dy = -hop * math.sin(math.pi * v)
                if v > .8:
                    sx, sy = 1.06, 0.94
        frame = im.resize((max(1, round(im.width * sx)), max(1, round(im.height * sy))), Image.LANCZOS)
        paste_center(canvas, faded(frame, a), cx, cy + dy + im.height * (1 - sy) / 2)

    return f0, el["end"], draw, {}


def r_label_pulse(el, ctx):
    im, x, y, f0 = ctx.png(el["png"]), el["x"], el["y"], el["start"]
    cx, cy = x + im.width / 2, y + im.height / 2
    period, amp = el.get("period_s", 0.9), el.get("amp", 0.035)
    sweep, sweeps = ctx.frames(el.get("sweep_s", 0.5)), el.get("sweeps", [])
    rgba = np.asarray(im, np.float32)
    alpha = rgba[..., 3] / 255
    slant = math.tan(math.radians(24)) * im.height
    pop = (0.6, 0.92, 1.08, 1.0) if f0 else ()

    def draw(canvas, n):
        base = im
        for s0 in sweeps:
            u = (n - s0) / sweep
            if 0 <= u <= 1:
                band = np.asarray(shine_band(im.size, -140 - slant + (im.width + 280 + slant) * ease_in_out(u), 140, 0.55),
                                  np.float32) / 255 * alpha
                arr = rgba.copy()
                arr[..., :3] += (255 - arr[..., :3]) * band[..., None]
                base = Image.fromarray(arr.astype(np.uint8), "RGBA")
        i = n - f0
        k = len(pop)
        s = pop[i] if i < k else 1 + amp * (0.5 - 0.5 * math.cos(2 * math.pi * (i - k) / ctx.fps / period))
        paste_center(canvas, scaled(base, s), cx, cy)

    return f0, el["end"], draw, {}


RENDERERS = {
    "hand_tap": (r_hand_tap, "none"), "hand_drag": (r_hand_drag, "none"), "counter": (r_counter, "text"),
    "progress": (r_progress, "meaning"), "floater": (r_floater, "text"), "fly_to_hud": (r_fly_to_hud, "none"),
    "burst": (r_burst, "none"), "stars": (r_stars, "meaning"), "icon_pop": (r_icon_pop, "meaning"),
    "bounce_in": (r_bounce_in, "meaning"), "label_pulse": (r_label_pulse, "text"), "flash": (r_flash, "none"),
    "ring": (r_ring, "none"),
}


def capture(ctx, first, end, draw):
    """Draw each frame on a full canvas and keep only its visible crop and offset."""
    frames = []
    for n in range(first, end):
        canvas = Image.new("RGBA", ctx.size, (0, 0, 0, 0))
        draw(canvas, n)
        bb = canvas.getbbox()
        frames.append((canvas.crop(bb), bb[:2]) if bb else (None, (0, 0)))
    return frames


def union(frames, alpha=0):
    boxes = []
    for im, (x, y) in frames:
        bb = visible_bbox(im, alpha) if im is not None else None
        if bb:
            boxes.append((x + bb[0], y + bb[1], x + bb[2], y + bb[3]))
    if not boxes:
        return None
    return min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)


def safe_warnings(name, bb, zone):
    if not bb or not zone:
        return []
    left, top, right, bottom = zone
    checks = [(bb[1] < top, f"reaches y {bb[1]}, above the safe top {top}"),
              (bb[3] > bottom, f"reaches y {bb[3]}, below the safe bottom {bottom}"),
              (bb[0] < left, f"reaches x {bb[0]}, left of the safe edge {left}"),
              (bb[2] > right, f"reaches x {bb[2]}, right of the safe edge {right}")]
    return [f"{name}: {text}" for hit, text in checks if hit]


def render(el, ctx):
    """Frames of one element: (first, crops with offsets, meta, warnings)."""
    name, kind = el.get("name", el.get("type")), el.get("type")
    try:
        if kind == "group":
            children = [(c.get("name", c.get("type")), c) for c in el["elements"]]
            parts = [(child, render({**c, "name": f"{name}/{child}"}, ctx)) for child, c in children]
            first = min(p[0] for _, p in parts)
            end = max(p[0] + len(p[1]) for _, p in parts)

            def draw(canvas, n):
                for _, (start, frames, _, _) in parts:
                    if start <= n < start + len(frames) and frames[n - start][0] is not None:
                        im, (x, y) = frames[n - start]
                        canvas.alpha_composite(im, (x, y))

            meta = {child: p[2] for child, p in parts if p[2]}
            warnings = [w for _, p in parts for w in p[3]]
            return first, capture(ctx, first, end, draw), {"parts": meta} if meta else {}, warnings
        if kind not in RENDERERS:
            raise SpecError(f"{name}: unknown type {kind!r}")
        renderer, default_safe = RENDERERS[kind]
        first, end, draw, meta = renderer({**el, "name": name}, ctx)
        if end <= first:
            raise SpecError(f"{name}: ends before it starts")
        frames = capture(ctx, first, end, draw)
        own = meta.pop("warnings", [])
        return first, frames, meta, own + safe_warnings(name, union(frames, VISIBLE), ctx.zone(el, default_safe))
    except KeyError as e:
        raise SpecError(f"{name}: missing key {e}") from None


def even_box(bb, size):
    x0, y0 = bb[0] // 2 * 2, bb[1] // 2 * 2
    x1, y1 = min(size[0], -(-bb[2] // 2) * 2), min(size[1], -(-bb[3] // 2) * 2)
    return x0, y0, x1 - x0, y1 - y0


def encode_track(name, first, frames, ctx, outdir, qscale=None):
    bb = union(frames)
    if not bb:
        raise SpecError(f"{name}: nothing visible on any frame")
    x0, y0, w, h = even_box(bb, ctx.size)
    # A fresh directory per render: frames left over from a longer earlier build would be encoded too.
    with tempfile.TemporaryDirectory(prefix=f"{name}-") as tmp:
        tmp = Path(tmp)
        for i, (im, (x, y)) in enumerate(frames):
            frame = Image.new("RGBA", (w, h), (0, 0, 0, 0))
            if im is not None:
                frame.paste(im, (x - x0, y - y0))
            frame.save(tmp / f"{i:05d}.png", compress_level=1)
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(ctx.fps), "-i", str(tmp / "%05d.png"), *PRORES]
        if qscale:
            cmd += ["-qscale:v", str(qscale)]
        subprocess.run(cmd + [str(tmp / "out.mov")], check=True)
        shutil.move(tmp / "out.mov", outdir / f"{name}.mov")
    start, end = video_times(first, first + len(frames), ctx.fps)
    return {"type": "video", "source": f"{name}.mov", "x": str(x0), "y": str(y0), "width": str(w), "height": str(h),
            "fit": "fill", "mute": True, "startTime": start, "endTime": end}


def render_rays(el, ctx, outdir):
    name, (W, H) = el["name"], ctx.size
    bg = np.asarray(ctx.png(el["background"]).convert("RGB").resize((W, H)), np.float32)
    cx, cy = el["center"]
    speed, ray, alpha = el.get("speed", 7.0), el.get("ray_deg", 9.0), el.get("alpha", 0.12)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    theta = np.degrees(np.arctan2(yy - cy, xx - cx))
    px_per_deg = (np.hypot(xx - cx, yy - cy) + 1) * math.pi / 180
    with tempfile.TemporaryDirectory(prefix=f"{name}-") as tmp:
        out = Path(tmp) / "out.mp4"
        enc = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                                "-s", f"{W}x{H}", "-r", str(ctx.fps), "-i", "-", "-c:v", "libx264", "-crf", "14",
                                "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)],
                               stdin=subprocess.PIPE)
        for i in range(el["end"] - el["start"]):
            dist = np.abs(((theta + speed * i / ctx.fps) % (2 * ray)) - ray / 2)
            cover = np.clip((ray / 2 - dist) * px_per_deg + 0.5, 0, 1)  # a 1 px soft edge
            enc.stdin.write((bg + (255 - bg) * (alpha * cover)[..., None]).astype(np.uint8).tobytes())
        enc.stdin.close()
        if enc.wait():
            raise SpecError(f"{name}: ffmpeg failed")
        shutil.move(out, outdir / f"{name}.mp4")
    start, end = video_times(el["start"], el["end"], ctx.fps)
    return {"file": f"{name}.mp4", "frames": [el["start"], el["end"]],
            "layer": {"type": "video", "source": f"{name}.mp4", "x": "0", "y": "0", "width": str(W),
                      "height": str(H), "fit": "cover", "mute": True, "startTime": start, "endTime": end}}


def build(el, ctx, outdir):
    if el.get("type") == "rays":
        try:
            return render_rays(el, ctx, outdir)
        except KeyError as e:
            raise SpecError(f"{el['name']}: missing key {e}") from None
    first, frames, meta, warnings = render(el, ctx)
    layer = encode_track(el["name"], first, frames, ctx, outdir, el.get("qscale"))
    pad_stills(meta, ctx, outdir, el["name"])
    entry = {"file": f"{el['name']}.mov", "frames": [first, first + len(frames)], "layer": layer, **meta}
    if warnings:
        entry["warnings"] = warnings
    return entry


def bump_notes(meta):
    notes = [f"{child}: {n}" for child, sub in meta.get("parts", {}).items() for n in bump_notes(sub)]
    if "bump_shift" in meta:
        needs = " and ".join(meta.get("bump_needs", [])) or "the counter further inside"
        notes.append(f"the pop moves {meta['bump_shift']} px to stay in the safe zone; a centered pop needs its {needs}")
    return notes


def mark_twins(layers, outdir):
    """Give each entry whose file is byte-identical to an earlier entry's "same_as" that file."""
    seen = {}
    for name, entry in layers.items():
        entry.pop("same_as", None)
        path = outdir / entry["file"]
        if not path.exists():
            continue
        with path.open("rb") as f:
            digest = hashlib.file_digest(f, "sha256").hexdigest()
        if digest in seen:
            entry["same_as"] = seen[digest]
            print(f"NOTE {name}: {entry['file']} is the same file as {seen[digest]}: upload that one only",
                  file=sys.stderr)
        else:
            seen[digest] = entry["file"]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("spec", type=Path)
    ap.add_argument("outdir", type=Path)
    ap.add_argument("--only", nargs="+", metavar="NAME", help="render only these elements")
    args = ap.parse_args(argv)
    spec = json.loads(args.spec.read_text())
    ctx = Ctx(spec, args.spec.parent)
    elements = spec.get("elements", [])
    names = [el.get("name") for el in elements]
    if None in names or len(set(names)) != len(names):
        print("every element needs a unique name", file=sys.stderr)
        return 2
    unknown = sorted(set(args.only or []) - set(names))
    if unknown:
        print(f"--only names no element in the spec: {', '.join(unknown)}", file=sys.stderr)
        return 2
    args.outdir.mkdir(parents=True, exist_ok=True)
    index_path = args.outdir / "layers.json"
    index = {"fps": ctx.fps, "canvas": list(ctx.size), "layers": {}}
    if args.only and index_path.exists():
        kept = json.loads(index_path.read_text()).get("layers", {})
        for gone in sorted(set(kept) - set(names)):
            print(f"NOTE dropped {gone} from layers.json: no element of that name in the spec", file=sys.stderr)
        index["layers"] = {k: v for k, v in kept.items() if k in names}
    overlaps = [(tops, w) for tops, w in floater_overlaps(elements, ctx) if not args.only or tops & set(args.only)]
    try:
        for el in elements:
            if args.only and el["name"] not in args.only:
                continue
            entry = build(el, ctx, args.outdir)
            entry["warnings"] = entry.get("warnings", []) + [w for tops, w in overlaps if el["name"] in tops]
            if not entry["warnings"]:
                del entry["warnings"]
            index["layers"][el["name"]] = entry
            lay = entry["layer"]
            extra = "".join(f", {k} {entry[k]}" for k in ("land", "bump_shift") if k in entry)
            print(f"{el['name']}: frames {entry['frames'][0]}-{entry['frames'][1] - 1}, box {lay['x']},{lay['y']} "
                  f"{lay['width']}x{lay['height']}, {lay['startTime']}-{lay['endTime']} s{extra}")
            for w in entry.get("warnings", []):
                print(f"WARN {w}", file=sys.stderr)
            for n in bump_notes(entry):
                print(f"NOTE {el['name']}: {n}", file=sys.stderr)
            still = entry.get("still", {}).get("source", "")
            if still.endswith("_still.png"):
                print(f"NOTE {el['name']}: the still is padded to {MIN_IMAGE} px a side in {args.outdir / still}: "
                      "upload that file", file=sys.stderr)
    except SpecError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    mark_twins(index["layers"], args.outdir)
    index_path.write_text(json.dumps(index, indent=1) + "\n")
    print(f"wrote {index_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
