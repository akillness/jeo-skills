# MRAI PDF editor third-party notices

This directory records the code licences used by the MRAI PDF editor's
public-API integrations. It is a distribution notice, not a change to the
licence of MRAI's own code.

## PDF.js / pdfjs-dist

- Project: <https://github.com/mozilla/pdf.js>
- Adopted package version: `5.7.284`
- Audited source commit: `7e5b36c2d572ba82e1e3adeb1c266f0052746c73`
- Copyright: 2012 Mozilla Foundation and PDF.js contributors
- Licence: Apache License 2.0; see `Apache-2.0.txt`
- Upstream root NOTICE: none at the audited commit

The shipped `pdf.worker.min.mjs` retains its own Mozilla copyright and
Apache-2.0 header. The unmodified runtime assets keep their adjacent terms:

- `../pdfjs-cmaps/LICENSE` — Adobe CMap BSD-style terms
- `../pdfjs-standard-fonts/LICENSE_FOXIT` — PDFium/Foxit BSD-style terms
- `../pdfjs-standard-fonts/LICENSE_LIBERATION` — SIL Open Font License 1.1

## pdf-lib

- Project: <https://github.com/Hopding/pdf-lib>
- Adopted package version: `1.17.1`
- Audited source commit: `4beebbef7a261ed0be089bb1d63a5b6e28cc488a`
- Copyright: 2019 Andrew Dillon
- Licence: MIT; see `pdf-lib-MIT.txt`
- Upstream root NOTICE: none at the audited commit

Both integrations use published public APIs. No PDF.js or pdf-lib source file
was copied into MRAI for the PDF editor slices recorded on 2026-07-27.
