"""Renders the fast-anything logo, wordmark and social card (Pillow, 4x supersampled).

The mark is a profiler flame graph that is also a flame: the cool blue base is your
original code, the hot path's stack is the part fast-anything forged into Rust.

    python scripts/logo.py
"""

import os
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parent.parent / "docs" / "assets"
SS = 4  # supersampling

# (left, right, kind) per row, bottom to top, on a 1024 grid. kind: cool | hot
ROWS = [
    [(170, 854, "cool")],
    [(170, 686, "cool"), (700, 854, "cool")],
    [(214, 676, "cool"), (714, 834, "cool")],
    [(262, 662, "hot")],
    [(296, 618, "hot")],
    [(332, 580, "hot")],
    [(372, 530, "hot")],
    [(404, 478, "hot")],
]
BAR_H, GAP, BASE_Y = 78, 12, 846


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def vertical_gradient(size, stops):
    w, h = size
    img = Image.new("RGBA", size)
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        for i in range(len(stops) - 1):
            (t0, c0), (t1, c1) = stops[i], stops[i + 1]
            if t0 <= t <= t1:
                c = lerp(c0, c1, (t - t0) / max(1e-9, t1 - t0))
                break
        for x in range(w):
            px[x, y] = c
    return img


def rounded_mask(size, box, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle(box, radius=radius, fill=255)
    return m


def mark(size=1024, background=True):
    S = size * SS
    k = S / 1024
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    if background:
        bg = vertical_gradient((S, S), [(0, (24, 29, 38, 255)), (1, (8, 10, 14, 255))])
        glow = Image.new("L", (S, S), 0)
        ImageDraw.Draw(glow).ellipse([S * 0.18, S * 0.42, S * 0.82, S * 1.02], fill=150)
        glow = glow.filter(ImageFilter.GaussianBlur(S * 0.09))
        warm = Image.new("RGBA", (S, S), (255, 110, 20, 255))
        bg = Image.composite(Image.blend(bg, warm, 0.22), bg, glow)
        mask = rounded_mask((S, S), [0, 0, S - 1, S - 1], int(S * 0.22))
        canvas.paste(bg, (0, 0), mask)
        rim = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(rim).rounded_rectangle([2 * k, 2 * k, S - 2 * k, S - 2 * k], radius=int(S * 0.22), outline=(255, 255, 255, 28), width=int(3 * k))
        canvas = Image.alpha_composite(canvas, rim)

    hot_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    cool_layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    hot_top = BASE_Y - (len(ROWS) - 1) * (BAR_H + GAP) - BAR_H
    hot_bottom = BASE_Y - 3 * (BAR_H + GAP)
    hot_fill = vertical_gradient((S, S), [
        (0.0, (255, 246, 196, 255)), (hot_top / 1024, (255, 236, 150, 255)),
        ((hot_top + hot_bottom) / 2048, (255, 168, 40, 255)), (hot_bottom / 1024, (247, 90, 10, 255)), (1.0, (200, 50, 0, 255)),
    ])
    cool_fill = vertical_gradient((S, S), [(0.0, (120, 180, 255, 255)), (0.62, (70, 130, 240, 255)), (1.0, (28, 70, 170, 255))])

    hot_mask = Image.new("L", (S, S), 0)
    cool_mask = Image.new("L", (S, S), 0)
    shine = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ds = ImageDraw.Draw(shine)
    for r, row in enumerate(ROWS):
        y1 = BASE_Y - r * (BAR_H + GAP)
        y0 = y1 - BAR_H
        for x0, x1, kind in row:
            box = [x0 * k, y0 * k, x1 * k, y1 * k]
            target = hot_mask if kind == "hot" else cool_mask
            ImageDraw.Draw(target).rounded_rectangle(box, radius=int(16 * k), fill=255)
            ds.rounded_rectangle([box[0] + 10 * k, box[1] + 7 * k, box[2] - 10 * k, box[1] + 15 * k], radius=int(4 * k), fill=(255, 255, 255, 70 if kind == "hot" else 45))

    # glow behind the hot stack
    halo = hot_mask.filter(ImageFilter.GaussianBlur(38 * k))
    halo_rgba = Image.new("RGBA", (S, S), (255, 120, 20, 0))
    halo_rgba.putalpha(halo.point(lambda v: int(v * 0.9)))
    canvas = Image.alpha_composite(canvas, halo_rgba)
    cool_halo = cool_mask.filter(ImageFilter.GaussianBlur(30 * k))
    cool_rgba = Image.new("RGBA", (S, S), (40, 110, 255, 0))
    cool_rgba.putalpha(cool_halo.point(lambda v: int(v * 0.45)))
    canvas = Image.alpha_composite(canvas, cool_rgba)

    hot_layer.paste(hot_fill, (0, 0), hot_mask)
    cool_layer.paste(cool_fill, (0, 0), cool_mask)
    canvas = Image.alpha_composite(canvas, cool_layer)
    canvas = Image.alpha_composite(canvas, hot_layer)
    shine_mask = ImageChops.add(hot_mask, cool_mask)
    shine_clip = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    shine_clip.paste(shine, (0, 0), shine_mask)
    canvas = Image.alpha_composite(canvas, shine_clip)

    # sparks rising off the tip
    sparks = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    dsp = ImageDraw.Draw(sparks)
    for (x, y, r, a) in [(520, 150, 9, 230), (472, 112, 6, 190), (560, 104, 5, 150), (498, 70, 4, 120)]:
        dsp.ellipse([(x - r) * k, (y - r) * k, (x + r) * k, (y + r) * k], fill=(255, 214, 120, a))
    canvas = Image.alpha_composite(canvas, sparks.filter(ImageFilter.GaussianBlur(1.5 * k)))
    canvas = Image.alpha_composite(canvas, sparks)
    return canvas.resize((size, size), Image.LANCZOS)


def font(names, size):
    for n in names:
        p = Path("C:/Windows/Fonts") / n
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default(size)


def wordmark(width, height, logo_size, title_size, tagline=None, bg=True):
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    if bg:
        img = vertical_gradient((width, height), [(0, (17, 21, 28, 255)), (1, (8, 10, 14, 255))])
    logo = mark(logo_size)
    title = font(["segoeuib.ttf", "seguisb.ttf", "arialbd.ttf"], title_size)
    small = font(["segoeui.ttf", "arial.ttf"], int(title_size * 0.36))
    d = ImageDraw.Draw(img)
    w_fast = d.textlength("fast", font=title)
    w_any = d.textlength("-anything", font=title)
    text_w = w_fast + w_any
    total = logo_size + title_size * 0.45 + text_w
    x = (width - total) / 2
    y = (height - logo_size) / 2 - (title_size * 0.32 if tagline else 0)
    img.alpha_composite(logo, (int(x), int(y)))
    tx = x + logo_size + title_size * 0.45
    ty = y + logo_size / 2
    d.text((tx, ty), "fast", font=title, fill=(240, 246, 252), anchor="lm")
    d.text((tx + w_fast, ty), "-anything", font=title, fill=(255, 128, 32), anchor="lm")
    if tagline:
        d.text((width / 2, y + logo_size + title_size * 0.62), tagline, font=small, fill=(139, 148, 158), anchor="mm")
    return img


def badge(d, x, y, label, value, color, f):
    """A shields.io-style badge; returns its width."""
    pad, h = 10, 30
    lw = d.textlength(label, font=f) + pad * 2
    vw = d.textlength(value, font=f) + pad * 2
    d.rounded_rectangle([x, y, x + lw + vw, y + h], radius=5, fill=(85, 85, 85))
    d.rounded_rectangle([x + lw, y, x + lw + vw, y + h], radius=5, fill=color)
    d.rectangle([x + lw, y, x + lw + 6, y + h], fill=color)
    d.text((x + pad, y + h / 2), label, font=f, fill=(255, 255, 255), anchor="lm")
    d.text((x + lw + pad, y + h / 2), value, font=f, fill=(255, 255, 255), anchor="lm")
    return lw + vw


def post_card(width=1200, height=720):
    img = Image.new("RGBA", (width, height), (13, 17, 23, 255))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([24, 24, width - 24, height - 24], radius=28, fill=(22, 27, 34), outline=(48, 54, 61), width=2)
    logo = mark(150)
    img.alpha_composite(logo, ((width - 150) // 2, 64))
    title = font(["segoeuib.ttf", "arialbd.ttf"], 82)
    italic = font(["segoeuii.ttf", "ariali.ttf"], 30)
    body = font(["segoeui.ttf", "arial.ttf"], 22)
    small = font(["segoeui.ttf", "arial.ttf"], 18)
    bold = font(["segoeuib.ttf", "arialbd.ttf"], 24)
    w_fast = d.textlength("fast", font=title)
    w_any = d.textlength("-anything", font=title)
    x = (width - w_fast - w_any) / 2
    d.text((x, 278), "fast", font=title, fill=(240, 246, 252), anchor="lm")
    d.text((x + w_fast, 278), "-anything", font=title, fill=(255, 128, 32), anchor="lm")
    d.line([(150, 340), (width - 150, 340)], fill=(48, 54, 61), width=2)
    d.text((width / 2, 382), "Don't rewrite it in Rust. Rewrite the 5% that's slow.", font=italic, fill=(230, 237, 243), anchor="mm")
    d.text((width / 2, 422), "Python, Node, TypeScript and Ruby · only the hot loop · checked against real calls", font=body, fill=(139, 148, 158), anchor="mm")
    badges = [("version", "0.1.0", (247, 114, 0)), ("languages", "4", (247, 114, 0)), ("works with", "any agent", (247, 114, 0)),
              ("tests", "passing", (46, 160, 67)), ("license", "MIT", (247, 114, 0))]
    widths = [d.textlength(l, font=small) + d.textlength(v, font=small) + 40 for l, v, _ in badges]
    x = (width - sum(widths) - 12 * (len(badges) - 1)) / 2
    for (label, value, color), w in zip(badges, widths):
        badge(d, x, 462, label, value, color, small)
        x += w + 12
    stats = [("up to ", False), ("116× faster", True), (" · ", False), ("27/27", True), (" calls replayed · ", False),
             ("0", True), (" mismatches · one command", False)]
    total = sum(d.textlength(t, font=bold if b else body) for t, b in stats)
    x = (width - total) / 2
    for text, is_bold in stats:
        f = bold if is_bold else body
        d.text((x, 545), text, font=f, fill=(240, 246, 252), anchor="lm")
        x += d.textlength(text, font=f)
    link = "github.com/EL4CTEO/fast-anything"
    rest = "  ·  Python · Node · TypeScript · Ruby  ·  npm i -g @el4cteo/fast-anything"
    total = d.textlength(link + rest, font=small)
    x = (width - total) / 2
    d.text((x, 600), link, font=small, fill=(88, 166, 255), anchor="lm")
    d.line([(x, 612), (x + d.textlength(link, font=small), 612)], fill=(88, 166, 255), width=1)
    d.text((x + d.textlength(link, font=small), 600), rest, font=small, fill=(139, 148, 158), anchor="lm")
    return img.convert("RGB")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    mark(1024).save(OUT / "logo.png")
    mark(256).save(OUT / "logo-256.png")
    mark(1024, background=False).resize((512, 512), Image.LANCZOS).save(OUT / "mark.png")
    wordmark(1600, 400, 260, 150, bg=False).save(OUT / "wordmark.png")
    wordmark(1280, 640, 250, 128, tagline="Don't rewrite it in Rust. Rewrite the 5% that's slow.").convert("RGB").save(OUT / "social.png")
    post_card().save(OUT / "post-card.png")
    print("ok")
