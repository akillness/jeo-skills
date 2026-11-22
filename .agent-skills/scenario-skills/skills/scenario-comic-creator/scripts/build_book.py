#!/usr/bin/env python3
"""Build a reading PDF and a contact sheet from a page manifest, and check page hashes.

The manifest is a JSON file naming the accepted file of every page, in
reading order:

  {
    "title": "My Comic",
    "trim_mm": [170, 240],
    "pages": [
      {"page": 1, "file": "pages/001.png", "asset_id": "asset_x", "sha256": "..."}
    ]
  }

`file` is relative to the manifest. Number the cover 0 and the back cover one
past the last page. `sha256` is optional; when present it must match. `trim_mm` is optional; without it each PDF page takes the image's
size at --dpi. Images are embedded without re-encoding, so the PDF carries the
pixels the review accepted. An image with transparency is flattened onto
white first and reported.

--grayscale converts every page to 8-bit gray before embedding, which cuts a
black-and-white book to a third of its size; use it only for such books.

A light PDF (--light-pdf) re-encodes the pages as downsized JPEG so the file
is small enough to send. It is a proof copy: the lossless PDF stays the
archive.

Usage:
  build_book.py hash   manifest.json [--write]   # print sha256 per page; --write fills missing ones
  build_book.py check  manifest.json             # verify files, order, hashes
  build_book.py build  manifest.json --pdf book.pdf [--light-pdf light.pdf]
                       [--contact-sheet sheet.png] [--columns 4] [--grayscale]
  build_book.py sheet  --out sheet.png [--columns 4] image [image ...]

Requires img2pdf and Pillow (build, sheet).
"""

import argparse
import hashlib
import json
import sys
import tempfile
from pathlib import Path

CONTACT_SHEET_MAX_WIDTH = 1600
MM_PER_INCH = 25.4
POINTS_PER_INCH = 72


class ManifestError(Exception):
    pass


def load_manifest(path):
    path = Path(path)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ManifestError(f"cannot read manifest {path}: {error}") from error
    pages = data.get("pages")
    if not isinstance(pages, list) or not pages:
        raise ManifestError("manifest needs a non-empty 'pages' list")
    for entry in pages:
        if not isinstance(entry, dict) or "page" not in entry or "file" not in entry:
            raise ManifestError("each page entry needs 'page' and 'file'")
    data["_base"] = path.parent
    return data


def page_path(manifest, entry):
    return (manifest["_base"] / entry["file"]).resolve()


def file_sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def check_manifest(manifest):
    """Return a list of problems; an empty list means the manifest is sound."""
    problems = []
    numbers = [entry["page"] for entry in manifest["pages"]]
    if any(not isinstance(number, int) for number in numbers):
        problems.append("page numbers must be integers")
    else:
        if numbers != sorted(numbers):
            problems.append("pages are not in ascending order")
        if len(set(numbers)) != len(numbers):
            problems.append("a page number appears twice")
    for entry in manifest["pages"]:
        path = page_path(manifest, entry)
        label = f"page {entry['page']} ({entry['file']})"
        if not path.is_file():
            problems.append(f"{label}: file is missing")
            continue
        recorded = entry.get("sha256")
        if recorded and file_sha256(path) != recorded:
            problems.append(f"{label}: sha256 does not match the manifest")
    return problems


def _flatten_if_transparent(path, scratch, grayscale=False):
    """Return (path_to_embed, flattened), alpha flattened onto white, gray if asked."""
    from PIL import Image

    with Image.open(path) as image:
        has_alpha = image.mode in ("RGBA", "LA") or (
            image.mode == "P" and "transparency" in image.info
        )
        if not has_alpha and not grayscale:
            return path, False
        rgba = image.convert("RGBA")
        canvas = Image.new("RGB", rgba.size, (255, 255, 255))
        canvas.paste(rgba, mask=rgba.getchannel("A"))
        if grayscale:
            canvas = canvas.convert("L")
        converted = Path(scratch) / f"{path.stem}-flat.png"
        canvas.save(converted)
        return converted, has_alpha


def build_pdf(manifest, pdf_path, dpi=300, grayscale=False):
    import img2pdf

    trim = manifest.get("trim_mm")
    if trim:
        page_points = tuple(float(v) / MM_PER_INCH * POINTS_PER_INCH for v in trim)
        layout = img2pdf.get_layout_fun(
            page_points, fit=img2pdf.FitMode.into, auto_orient=False
        )
    else:
        layout = img2pdf.get_layout_fun(
            None, fit=img2pdf.FitMode.into, auto_orient=False
        )
    flattened = []
    with tempfile.TemporaryDirectory() as scratch:
        sources = []
        for entry in manifest["pages"]:
            source, was_flat = _flatten_if_transparent(
                page_path(manifest, entry), scratch, grayscale
            )
            if was_flat:
                flattened.append(entry["page"])
            sources.append(str(source))
        kwargs = {"layout_fun": layout}
        if not trim:
            kwargs["layout_fun"] = img2pdf.get_fixed_dpi_layout_fun((dpi, dpi))
        pdf_bytes = img2pdf.convert(
            sources,
            title=manifest.get("title"),
            **kwargs,
        )
    Path(pdf_path).write_bytes(pdf_bytes)
    return flattened


def contact_sheet(items, out_path, columns=4):
    """items: list of (label, image path). One labeled grid, 1600 px wide at most."""
    from PIL import Image, ImageDraw

    columns = max(1, min(columns, len(items)))
    gap = 12
    thumb_w = (CONTACT_SHEET_MAX_WIDTH - gap * (columns + 1)) // columns
    thumbs = []
    for label, path in items:
        with Image.open(path) as image:
            image = image.convert("RGB")
            ratio = thumb_w / image.width
            thumbs.append(
                (label, image.resize((thumb_w, max(1, round(image.height * ratio))), Image.LANCZOS))
            )
    rows = [thumbs[i : i + columns] for i in range(0, len(thumbs), columns)]
    row_heights = [max(t.height for _, t in row) + 24 for row in rows]
    sheet = Image.new(
        "RGB",
        (CONTACT_SHEET_MAX_WIDTH, gap + sum(h + gap for h in row_heights)),
        (245, 245, 245),
    )
    draw = ImageDraw.Draw(sheet)
    y = gap
    for row, height in zip(rows, row_heights):
        x = gap
        for label, thumb in row:
            sheet.paste(thumb, (x, y + 18))
            draw.text((x, y + 2), label, fill=(40, 40, 40))
            x += thumb_w + gap
        y += height + gap
    sheet.save(out_path)


def manifest_items(manifest):
    return [(f"p. {entry['page']}", page_path(manifest, entry)) for entry in manifest["pages"]]


def _original_size_layout(original_points):
    """img2pdf layout that gives page n the size recorded for the original image n."""
    calls = iter(range(10**9))

    def layout(imgwidthpx, imgheightpx, ndpi):
        width, height = original_points[next(calls)]
        return width, height, width, height

    return layout


def build_light_pdf(manifest, pdf_path, max_edge, quality, grayscale=False, dpi=300):
    """Downsized JPEG proof copy. Returns the output size in bytes.

    Page size matches the lossless PDF: the trim size when the manifest has one,
    otherwise each original image's pixel size at dpi.
    """
    import img2pdf
    from PIL import Image

    trim = manifest.get("trim_mm")
    if trim:
        page_points = tuple(float(v) / MM_PER_INCH * POINTS_PER_INCH for v in trim)
        layout = img2pdf.get_layout_fun(
            page_points, fit=img2pdf.FitMode.into, auto_orient=False
        )
    else:
        original_points = []
        layout = _original_size_layout(original_points)
    with tempfile.TemporaryDirectory() as scratch:
        sources = []
        for index, entry in enumerate(manifest["pages"]):
            with Image.open(page_path(manifest, entry)) as image:
                if not trim:
                    original_points.append(
                        (image.width / dpi * POINTS_PER_INCH, image.height / dpi * POINTS_PER_INCH)
                    )
                rgba = image.convert("RGBA")
                canvas = Image.new("RGB", rgba.size, (255, 255, 255))
                canvas.paste(rgba, mask=rgba.getchannel("A"))
                if grayscale:
                    canvas = canvas.convert("L")
                canvas.thumbnail((max_edge, max_edge), Image.LANCZOS)
                target = Path(scratch) / f"{index:04d}.jpg"
                canvas.save(target, "JPEG", quality=quality)
                sources.append(str(target))
        data = img2pdf.convert(sources, layout_fun=layout, title=manifest.get("title"))
    Path(pdf_path).write_bytes(data)
    return len(data)


def write_missing_hashes(manifest_path):
    """Fill `sha256` for pages that have none. Existing values are never changed."""
    raw = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    base = Path(manifest_path).parent
    filled = 0
    for entry in raw["pages"]:
        if not entry.get("sha256"):
            path = (base / entry["file"]).resolve()
            if path.is_file():
                entry["sha256"] = file_sha256(path)
                filled += 1
    Path(manifest_path).write_text(json.dumps(raw, indent=2) + "\n", encoding="utf-8")
    return filled


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)

    hash_cmd = sub.add_parser("hash")
    hash_cmd.add_argument("manifest")
    hash_cmd.add_argument("--write", action="store_true", help="fill missing sha256 values in the manifest")

    check_cmd = sub.add_parser("check")
    check_cmd.add_argument("manifest")

    build_cmd = sub.add_parser("build")
    build_cmd.add_argument("manifest")
    build_cmd.add_argument("--pdf", required=True)
    build_cmd.add_argument("--light-pdf")
    build_cmd.add_argument("--light-max-edge", type=int, default=2000)
    build_cmd.add_argument("--light-quality", type=int, default=88)
    build_cmd.add_argument("--contact-sheet")
    build_cmd.add_argument("--columns", type=int, default=4)
    build_cmd.add_argument("--dpi", type=int, default=300)
    build_cmd.add_argument("--no-verify", action="store_true", help="skip the hash check")
    build_cmd.add_argument(
        "--grayscale", action="store_true", help="embed pages as 8-bit gray (black-and-white books only)"
    )

    sheet_cmd = sub.add_parser("sheet")
    sheet_cmd.add_argument("--out", required=True)
    sheet_cmd.add_argument("--columns", type=int, default=4)
    sheet_cmd.add_argument("images", nargs="+")

    args = parser.parse_args(argv)

    if args.command == "sheet":
        missing = [name for name in args.images if not Path(name).is_file()]
        if missing:
            print(f"error: missing files: {', '.join(missing)}", file=sys.stderr)
            return 1
        contact_sheet([(Path(n).stem, n) for n in args.images], args.out, args.columns)
        print(f"contact sheet: {args.out}")
        return 0

    try:
        manifest = load_manifest(args.manifest)
    except ManifestError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2

    if args.command == "hash":
        for entry in manifest["pages"]:
            path = page_path(manifest, entry)
            if not path.is_file():
                print(f"error: page {entry['page']}: file is missing", file=sys.stderr)
                return 1
            print(f"{entry['page']}\t{file_sha256(path)}\t{entry['file']}")
        if args.write:
            print(f"filled {write_missing_hashes(args.manifest)} missing sha256 values")
        return 0

    if args.command == "check" or not args.no_verify:
        problems = check_manifest(manifest)
        if problems:
            for problem in problems:
                print(f"error: {problem}", file=sys.stderr)
            return 1
        if args.command == "check":
            print(f"ok: {len(manifest['pages'])} pages")
            return 0

    flattened = build_pdf(manifest, args.pdf, dpi=args.dpi, grayscale=args.grayscale)
    size_mb = Path(args.pdf).stat().st_size / 1e6
    print(f"pdf: {args.pdf} ({len(manifest['pages'])} pages, {size_mb:.1f} MB, lossless)")
    if flattened:
        print(f"note: flattened transparency onto white on pages {flattened}")
    if args.light_pdf:
        size = build_light_pdf(
            manifest,
            args.light_pdf,
            args.light_max_edge,
            args.light_quality,
            args.grayscale,
            dpi=args.dpi,
        )
        print(f"light pdf: {args.light_pdf} ({size / 1e6:.1f} MB, re-encoded proof copy, not the archive)")
    if args.contact_sheet:
        contact_sheet(manifest_items(manifest), args.contact_sheet, args.columns)
        print(f"contact sheet: {args.contact_sheet}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
