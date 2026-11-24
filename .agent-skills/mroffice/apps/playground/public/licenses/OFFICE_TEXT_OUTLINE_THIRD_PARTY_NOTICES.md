# MRAI WordArt text outline third-party notices

MRAI draws a WordArt text outline as Office does: one centred, round-joined
stroke along each glyph's contours merged into one outline. Where a glyph's
contours overlap, the browser merges them with Skia's PathOps through
PathKit, adopted through its public package API. No upstream source is copied
into MRAI.

## pathkit-wasm 1.0.0

- Project: <https://github.com/google/skia/tree/main/modules/pathkit>
- Package: `pathkit-wasm@1.0.0`, pinned exactly in `apps/web/package.json`
  and `apps/web/package-lock.json`
- Copyright: 2011 Google Inc. (Skia)
- Licence: BSD-3-Clause; see `pathkit-wasm-BSD-3-Clause.txt`
- Files shipped: `bin/pathkit.js` and `bin/pathkit.wasm`, unmodified, as
  hashed static files loaded only by the text outline worker
  (`lib/office-text-outline/office-text-outline.worker.ts`) the first time a
  glyph with overlapping contours is outlined
- Use: `Path.simplify` with the non-zero fill rule (the union of a glyph's
  own contours); nothing else of PathKit is called

The server's PDFs merge glyph outlines the same way with skia-pathops
(`apps/api/THIRD_PARTY_NOTICES/skia-pathops-0.9.2-LICENSE-NOTICE.txt`).
