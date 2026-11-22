# Assembly and delivery

## Manifest first

One ordered file names the accepted asset of every page: page number, asset ID, local file, sha256.
Number the cover 0 and the back cover one past the last page. Download each accepted page with
`asset_download` (format `png`) and `curl -L`, and name the files by page number. Every export
derives from it: the reading PDF, the print file, the page folder, the collection. Rejected attempts
stay filed and are excluded from the manifest.

## Pages around the story

- **Cover**: generate it as its own page after the style and cast are approved. Title text follows
  the lettering mode: integrated if the test passed, otherwise an overlay card.
- **Front matter**: title page, dedication, a cast page if the story has many characters.
- **Back cover**: a short blurb and a quiet image.
- **Page count**: printers have rules. Many need an even count, and stapled booklets need multiples
  of 4. Ask for the printer's spec before fixing the total.

## Trim, margins and spreads

- Keep lettering inside the safe margin written into the prompts.
- For bleed, extend art past the trim with `scenario-image-editing` (expand) or crop with margin to
  spare.
- A two-page spread is generated as one wide image and split at assembly. Keep faces and lettering
  away from the center fold.
- Folio numbers are typeset at assembly, never drawn by the model.

## Reading PDF

- Keep a lossless PDF as the archive. Re-encoding a page into JPEG inside it changes pixels the
  review accepted. At 3,500 px a page, six pages weighed 120 MB.
- Send the light PDF (`--light-pdf`): downsized JPEG pages, labeled as a proof copy.
- A black-and-white book embeds as gray (`--grayscale`), a third of the size.
- Set the PDF page size to the trim size. With no trim, both PDFs use the art's own proportions at
  `--dpi` (default 300), so the archive and the light copy have the same page size.
- Right-to-left books: files stay in reading order. Tell the printer the binding is on the right.
- [scripts/build_book.py](../scripts/build_book.py) builds the PDFs from a manifest, writes a
  contact sheet, fills and checks page hashes, and builds a labeled contact sheet from any images
  (the style round). An agent runs it:
  `uv run --with img2pdf --with pillow python3 scripts/build_book.py --help`.
- The manifest is a JSON file. `trim_mm` is optional, `sha256` is filled by
  `build_book.py hash --write`, and page numbers run in order (0 is allowed for a cover):

  ```json
  {
    "title": "The Shortcut",
    "trim_mm": [170, 240],
    "pages": [{ "page": 1, "file": "pages/001.png", "asset_id": "asset_...", "sha256": "..." }]
  }
  ```

- Open the finished PDF page by page, or read a contact sheet, in order. A complete manifest is not
  proof the PDF is right.

## Several languages

- Use overlay mode. Art stays fixed, and each language is a lettering pass.
- Text in many languages runs longer than English. Leave balloon room, and check accents and line
  breaks in each language.
- Integrated mode needs a fresh generation per language, and the layout drifts. Re-review every
  page's lettering and anatomy.
- A reader fluent in the language proofreads every balloon.

## Web delivery

- A vertical-scroll comic is one panel per generation, stacked at assembly. Cut long images at
  gutters, not through faces.
- Export slices at the width the platform asks for.

## Filing in Scenario

- Quick lane: one collection for the book is enough.
- Album and Book: one collection per chapter for accepted pages, one for the reference sheets, one
  for the full history of attempts.
- Name assets `Page 007 - asset_ID`. Tag by chapter, character, place and status.
- Use `collection_create`, `collection_add_assets` and `asset_add_tags` through the tool catalog
  (`scenario_tools_search` finds their schemas).
- Read the collection membership back after adding. Search can lag new uploads.

## Delivery check

1. Every exported page's asset ID and hash match the manifest.
2. The PDF page count matches.
3. The user opens the PDF and reads a few pages at full size.
4. Report where each deliverable is: the PDF, the page folder, the collection. State which pages
   carry known residual findings, and add the clock log with the elapsed time at each gate.
