# @mrnote/pdf

> **For the full experience, install the MR Office desktop app (free): https://github.com/XinaTian/MROffice/releases** (or https://mroffice.ai) — it adds opening and saving Word, Excel and PowerPoint files, formulas with functions, charts, SmartArt editing, and saving PDF edits back into the file.

On npm as [`mroffice-pdf`](https://www.npmjs.com/package/mroffice-pdf): compiled, with its types and stylesheet, no build setup needed (`npm i mroffice-pdf mroffice-core`; built from this tree by `npm run pack:npm`, scripts/npm/).

The PDF editor of [MR Office](https://mroffice.ai), running in the browser on a local file: MR Office's PDF window (pdf.js rendering, MR Office's ribbon and tools) in its browser-only mode, where the file and everything done to it stay in the page.

This package is generated from MR Office's own source (see the repository README).

## What works in the open-source build

| Feature | Status |
|---|---|
| Open a PDF from this computer and read it: pages, zoom, single / two-page and continuous views, rotation, thumbnails, read mode | Available, verified |
| Search the document's text and copy it | Available |
| Present (full screen) and Print (the browser's print) | Available |
| Comments while the file is open (the comments panel, text comments from Insert) | Available, kept in the page |
| Save / Download | The file as it was opened |
| Saving PDF edits back into the file | With the MR Office desktop app (free, [download](https://github.com/XinaTian/MROffice/releases)) or MR Office on the web |
