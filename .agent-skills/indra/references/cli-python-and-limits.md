# Indra OCR CLI, Python API, and Limitations Reference

## CLI Reference (`indra-ocr` & `indra-ocr-viewer`)

```bash
indra-ocr paper.pdf --format md|text|json --mode auto|ocr|text
indra-ocr *.pdf --out results/ --cores 8 --dpi 200
indra-ocr paper.pdf --math --keep-furniture --timings --model-dir /path/to/models
indra-ocr-viewer --port 8765
```

- `--out DIR`: emits `.md`, `.txt`, or `.jsonl`
- `--mode`: `auto` (text layer when valid, else OCR), `ocr` (ignore text layer), `text` (force text layer)
- `--no-image-ocr`: skip OCR for images embedded on text-layer pages
- `--max-pages N`, `--password PASS`
- Exit code `1` if any input file fails (continues past unreadable files)

## Python API (`indra_ocr` v1.1.2)

- `conv = indra_ocr.load(path=None, threads=..., dpi=200, mode="auto", image_ocr=True, furniture=False, math=False)`
- `conv.convert(path, max_pages=None, password=None)` → yields `(page_index, Page)`
- `conv.ocr(gray_uint8_ndarray)` → returns `Page` directly from in-memory grayscale image
- `indra_ocr.convert_many(paths, cores=None, ...)` → yields `(path, result_or_InputError)` in input order; **must** be inside `if __name__ == "__main__":` on macOS/Windows

### `Page` Object Fields
- `markdown`, `text`
- `lines`: `[Line(box, text, conf)]` (`x0, y0, x1, y1` in pixels)
- `blocks`: `[{"label", "bbox", "text"}]` (`Text`, `Section-Header`, `Page-Header`, `Page-Footer`, `List-Group`, `Table`, `Caption`, `Footnote`, `Table-Of-Contents`, `Form`)
- `source`: `text | ocr | hybrid | error`
- `rotation`, `skew`, `vertical` (vertical CJK columns), `timings`, `note`

## Recognizer Architecture (~76 MB default)
- `rec.onnx` (~1.25M params): Latin (~50 languages), Cyrillic, Greek, Latin handwriting
- `rec_cjk.onnx`: Chinese (Simplified/Traditional), Japanese, Korean
- `rec_rtl.onnx`: Arabic, Persian, Urdu, Pashto, Kurdish, Hebrew (logical order)
- `rec_world.onnx`: Devanagari, Bengali, Tamil, Telugu, Kannada, Malayalam, Gujarati, Gurmukhi, Odia, Thai, Lao, Khmer, Myanmar, Sinhala, Georgian, Armenian, Ethiopic

## Known Limitations
- Complex merged-cell, nested-header, or unruled tables
- Cursive handwriting and faint/degraded old scans
- Diacritic-heavy Latin scripts (`Kurmanji`, `Czech`, `Lithuanian`, `Icelandic`, `Turkish`, `Slovak`) and written Cantonese (`嘅 咗 冇`)
- Very wide banner-shaped pages or >100 MP pages at 200 dpi (downscaled automatically)
