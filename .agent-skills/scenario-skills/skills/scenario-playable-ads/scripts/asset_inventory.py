"""Catalog the assets a studio supplied, before any of them goes into a playable.

Usage: python3 asset_inventory.py <project_dir> [--src intake/assets] [--max-mb 2]

Reads every file under <project_dir>/<src> (default intake/assets/), never writes there, and writes
<project_dir>/analysis/assets_inventory.json and analysis/assets_inventory.md: one row per file with
its kind, size, format and what was measured, a "flags" list (problems to solve before use) and an
estimate of what it adds to the playable once prepared. The "use" field starts empty: the agent fills
it per file (as-is, edit, reference, skip) after the mode question (references/existing-assets.md).

Measured per kind:
  image  width, height, alpha, transparent share, sprite count (separate opaque regions), main colors,
         the WebP size at the playable's resolution
  audio  duration, channels, sample rate, peak and mean level, silence at the ends, loop seam
  video  duration, size, frame rate, sound track (reference footage, never inlined)
  3d     GLB: meshes, vertices, materials, textures, skin and joints, animation clips and their names
         (pack_glb.py packs a static mesh: a skin and its clips are not carried over)
  font   family name and whether the file allows embedding
Requirements: Pillow, numpy, scipy, fontTools (all in the skill's list) and ffprobe/ffmpeg.
"""
import argparse
import io
import json
import struct
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

IMG = {".png", ".webp", ".jpg", ".jpeg", ".gif", ".bmp", ".tga", ".tif", ".tiff", ".psd"}
AUD = {".wav", ".mp3", ".ogg", ".m4a", ".aac", ".flac", ".aif", ".aiff"}
VID = {".mp4", ".mov", ".webm", ".m4v", ".avi"}
FONT = {".ttf", ".otf", ".woff", ".woff2"}
CONVERT_3D = {".fbx", ".obj", ".blend", ".max", ".ma", ".mb", ".dae", ".usdz", ".usd", ".3ds"}
VECTOR = {".svg", ".ai", ".eps", ".pdf"}
WEB_SIDE = 1280      # longest side a plate keeps in a portrait playable (720 x 1280)
AUDIO_KBPS = 64      # prep_assets.py encodes at 64 kbit/s unless "bitrate" says otherwise (48k suits effects)
BASE64 = 4 / 3       # every asset is inlined as base64 in the single HTML file


def ffprobe(p):
    out = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(p)],
                         capture_output=True, text=True)
    return json.loads(out.stdout or "{}")


def pcm(p, rate=8000):
    """Mono float samples at a low rate, enough for levels and a loop seam."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-ac", "1", "-ar", str(rate), "-f", "f32le", "-"],
                         capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32), rate


def db(x):
    return round(20 * float(np.log10(max(float(x), 1e-9))), 1)


def image_row(p, row):
    im = Image.open(p)
    row.update(width=im.width, height=im.height, mode=im.mode, frames=getattr(im, "n_frames", 1))
    rgba = im.convert("RGBA")
    a = np.asarray(rgba)[:, :, 3]
    clear = float((a < 16).mean())
    row["alpha"] = bool(clear > 0.001)
    row["transparent_share"] = round(clear, 3)
    if row["alpha"]:
        from scipy import ndimage
        small = rgba.copy()
        small.thumbnail((512, 512))
        mask = np.asarray(small)[:, :, 3] > 64
        labels, n = ndimage.label(ndimage.binary_closing(mask, iterations=2))
        sizes = ndimage.sum(mask, labels, range(1, n + 1)) if n else []
        row["sprites"] = int(sum(1 for s in sizes if s > mask.size * 0.002))
    q = rgba.convert("RGB").resize((64, 64)).quantize(5)
    pal = q.getpalette()[:15]
    counts = sorted(q.getcolors(), reverse=True)
    row["colors"] = ["#%02x%02x%02x" % tuple(pal[i * 3:i * 3 + 3]) for _, i in counts[:5]]
    web = rgba.copy()
    web.thumbnail((WEB_SIDE, WEB_SIDE))
    buf = io.BytesIO()
    web.save(buf, "WEBP", quality=80, method=4)
    row["web_bytes"] = buf.tell()
    f = row["flags"]
    if row["frames"] > 1:
        f.append(f"{row['frames']} frames in one file: export the frames or a sheet")
    if max(im.width, im.height) > 4096:
        f.append("over 4096 px: fine as a source (prep_assets.py sizes each cut); send a 2048 px copy as a reference")
    if max(im.width, im.height) < 128:
        f.append("under 128 px: too small for anything but an icon")
    if not row["alpha"] and p.suffix.lower() in {".jpg", ".jpeg"}:
        f.append("JPEG, no transparency: a plate or a reference; a sprite needs a cut-out (an edit, or \"key\")")
    if row.get("sprites", 0) > 1:
        f.append(f"{row['sprites']} separate shapes: a sheet or an atlas, cut with \"blob\" (prep_assets.py --blobs)")
    if p.suffix.lower() == ".psd":
        f.append("PSD read flattened: export the layers you need as PNG")


def audio_row(p, row, info):
    s = next((x for x in info.get("streams", []) if x.get("codec_type") == "audio"), {})
    dur = float(info.get("format", {}).get("duration") or 0)
    row.update(duration_s=round(dur, 2), channels=s.get("channels"), sample_rate=int(s.get("sample_rate") or 0),
               codec=s.get("codec_name"))
    x, rate = pcm(p)
    f = row["flags"]
    if not len(x):
        f.append("unreadable by ffmpeg")
        return
    row["peak_db"], row["mean_db"] = db(np.abs(x).max()), db(np.sqrt((x ** 2).mean()))
    w = max(1, int(rate * 0.05))
    head, tail = x[:w], x[-w:]
    row["silent_start"] = bool(np.abs(head).max() < 0.003)
    row["silent_end"] = bool(np.abs(tail).max() < 0.003)
    if dur >= 8:
        # a loop seam: the level and the sample value on both sides of the wrap point are close
        jump = abs(float(x[-1]) - float(x[0]))
        lvl = abs(db(np.sqrt((head ** 2).mean())) - db(np.sqrt((tail ** 2).mean())))
        row["loop_seam"] = "clean" if (jump < 0.05 and lvl < 6) else "audible"
    row["web_bytes"] = int(dur * AUDIO_KBPS * 1000 / 8)
    if row["peak_db"] >= -0.1:
        f.append("peaks at 0 dBFS: may clip; prep with a limiter (\"boost_db\": 0)")
    if row["mean_db"] < -35 and dur < 3:
        f.append("quiet effect: \"boost_db\" in the manifest")
    if dur > 60:
        f.append(f"{round(dur)} s long: a playable plays 35 to 45 s; trim or loop a section (\"max_s\")")
    if row.get("loop_seam") == "audible":
        f.append("music with an audible seam at the wrap: cut at a bar line or crossfade before looping")
    if dur < 3 and row["silent_start"]:
        f.append("starts with silence: trim it (\"trim\": true) so the sound lands on the event")


def video_row(p, row, info):
    v = next((x for x in info.get("streams", []) if x.get("codec_type") == "video"), {})
    a = any(x.get("codec_type") == "audio" for x in info.get("streams", []))
    num, _, den = (v.get("r_frame_rate") or "0/1").partition("/")
    row.update(duration_s=round(float(info.get("format", {}).get("duration") or 0), 2), width=v.get("width"),
               height=v.get("height"), fps=round(float(num) / float(den or 1), 2) if float(den or 1) else None,
               sound=a)
    row["flags"].append("video: reference footage, read it like the recording (contact sheet, key frames); never inlined")


def glb_row(p, row):
    b = p.read_bytes()
    f = row["flags"]
    if len(b) < 20 or b[:4] != b"glTF":
        f.append("not a binary glTF")
        return
    n = struct.unpack_from("<I", b, 12)[0]
    g = json.loads(b[20:20 + n])
    acc = g.get("accessors", [])
    verts = sum(acc[pr["attributes"]["POSITION"]]["count"] for m in g.get("meshes", []) for pr in m.get("primitives", [])
                if "POSITION" in pr.get("attributes", {}))
    skins = g.get("skins", [])
    anims = g.get("animations", [])
    views = g.get("bufferViews", [])
    tex_bytes = sum(views[i["bufferView"]]["byteLength"] for i in g.get("images", []) if "bufferView" in i)
    row.update(meshes=len(g.get("meshes", [])), vertices=verts, materials=len(g.get("materials", [])),
               textures=len(g.get("images", [])), texture_bytes=tex_bytes, skinned=bool(skins),
               joints=max((len(s.get("joints", [])) for s in skins), default=0),
               clips=[a.get("name") or f"clip {i}" for i, a in enumerate(anims)],
               draco="KHR_draco_mesh_compression" in g.get("extensionsUsed", []))
    prims = sum(len(m.get("primitives", [])) for m in g.get("meshes", []))
    # packed size, roughly: quantized positions, UVs and indices plus one texture at 256 to 512 px; the raw
    # file size says little about it
    row["web_bytes"] = verts * 22 + min(len(g.get("images", [])), 1) * 40_000
    if row["draco"]:
        f.append("Draco-compressed: pack_glb.py reads plain glTF buffers; export it without Draco")
    if prims > 1:
        f.append(f"{prims} mesh parts: pack_glb.py packs the first one only; join them first, or pack each part")
    if verts > 60_000:
        f.append(f"{verts} vertices: heavy for a phone ad, decimate to about 10k to 30k")
    if skins:
        f.append(f"rigged ({row['joints']} joints, {len(anims)} clips): pack_glb.py packs the static mesh only; "
                 "for motion, render the clips to frames in a 3D tool and use them as a sheet")
    if anims and not skins and any(ch.get("target", {}).get("path") in ("rotation", "translation")
                                   for a in anims for ch in a.get("channels", [])):
        f.append("node animation only (no skin): plays as rigid parts")


def font_row(p, row):
    try:
        from fontTools.ttLib import TTFont
        t = TTFont(str(p), lazy=True)
        row["family"] = t["name"].getDebugName(1)
        fs = t["OS/2"].fsType if "OS/2" in t else 0
        row["embeddable"] = not (fs & 0x0002)
        if not row["embeddable"]:
            row["flags"].append("the font forbids embedding (fsType): use an OFL face from the skill")
    except Exception as e:  # noqa: BLE001 (any unreadable font is a flag, not a crash)
        row["flags"].append(f"unreadable font ({type(e).__name__})")
    row["web_bytes"] = 20_000  # prep_assets.py subsets it to the text the game draws


def catalog(root, src):
    rows = []
    for p in sorted(x for x in src.rglob("*") if x.is_file() and not x.name.startswith(".")):
        ext = p.suffix.lower()
        row = {"file": str(p.relative_to(root)), "bytes": p.stat().st_size, "kind": "other",
               "flags": [], "use": ""}
        try:
            if ext in IMG:
                row["kind"] = "image"
                image_row(p, row)
            elif ext in AUD:
                row["kind"] = "audio"
                audio_row(p, row, ffprobe(p))
            elif ext in VID:
                row["kind"] = "video"
                video_row(p, row, ffprobe(p))
            elif ext == ".glb":
                row["kind"] = "3d"
                glb_row(p, row)
            elif ext == ".gltf":
                row["kind"] = "3d"
                row["flags"].append("glTF with side files: export one .glb")
            elif ext in CONVERT_3D:
                row["kind"] = "3d"
                row["flags"].append(f"{ext} cannot be packed: convert to .glb first (Blender, or the studio's tool)")
            elif ext in FONT:
                row["kind"] = "font"
                font_row(p, row)
            elif ext in VECTOR:
                row["kind"] = "image"
                row["flags"].append("vector or print file: export PNG at the size it will show")
            else:
                row["flags"].append("unknown type: ask what it is, or skip it")
        except Exception as e:  # noqa: BLE001 (one broken file must not stop the catalog)
            row["flags"].append(f"could not read ({type(e).__name__}: {e})")
        row["usable"] = not any(s.startswith(("unreadable", "could not read", "not a binary", "unknown type"))
                                for s in row["flags"])
        rows.append(row)
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("project")
    ap.add_argument("--src", default="intake/assets", help="folder of supplied files, relative to the project")
    ap.add_argument("--max-mb", type=float, default=2.0, help="the strictest network cap for the single HTML (Meta)")
    a = ap.parse_args()
    root = Path(a.project)
    src = root / a.src
    if not src.is_dir():
        raise SystemExit(f"no folder {src}: put the studio's files there first (never edit them in place)")
    rows = catalog(root, src)
    inlined = sum(r.get("web_bytes", 0) for r in rows if r["kind"] in ("image", "audio", "3d", "font") and r["usable"])
    est = int(inlined * BASE64)
    cap = int(a.max_mb * 1_000_000)
    by = {}
    for r in rows:
        by[r["kind"]] = by.get(r["kind"], 0) + 1
    out = {"source": a.src, "files": len(rows), "by_kind": by, "unusable": sum(not r["usable"] for r in rows),
           "estimate_inlined_bytes": est, "cap_bytes": cap,
           "budget": "fits" if est < cap * 0.7 else ("tight" if est < cap else "over"),
           "rights": "not confirmed", "mode": {}, "rows": rows}
    (root / "analysis").mkdir(exist_ok=True)
    (root / "analysis" / "assets_inventory.json").write_text(json.dumps(out, indent=1))
    md = [f"# Supplied assets ({len(rows)} files in `{a.src}`)", "",
          f"Estimated inlined size if every usable file goes in as is: {est / 1e6:.2f} MB of a {a.max_mb:g} MB cap "
          f"({out['budget']}). Rights: {out['rights']}. Mode per asset type: fill in after the mode question.", "",
          "| File | Kind | Measured | Flags | Use |", "| --- | --- | --- | --- | --- |"]
    skip = {"file", "kind", "flags", "use", "usable", "bytes", "web_bytes", "colors"}
    for r in rows:
        meas = ", ".join(f"{k} {', '.join(map(str, v)) if isinstance(v, list) else v}" for k, v in r.items() if k not in skip and v is not None and not (isinstance(v, (list, str)) and not v))
        md.append(f"| `{r['file']}` | {r['kind']} | {meas} | {'; '.join(r['flags']) or 'none'} | {r['use']} |")
    (root / "analysis" / "assets_inventory.md").write_text("\n".join(md) + "\n")
    print(f"{len(rows)} files: " + ", ".join(f"{v} {k}" for k, v in sorted(by.items())) +
          f"; {out['unusable']} unusable; estimated inlined {est / 1e6:.2f} MB of {a.max_mb:g} MB ({out['budget']})")
    for r in rows:
        if r["flags"]:
            print(f"  {r['file']}: " + "; ".join(r["flags"]))
    print("wrote analysis/assets_inventory.json and analysis/assets_inventory.md")


if __name__ == "__main__":
    main()
