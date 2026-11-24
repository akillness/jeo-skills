# @mrnote/docs

> **For the full experience, install the MR Office desktop app (free): https://github.com/XinaTian/MROffice/releases** (or https://mroffice.ai) — it adds opening and saving Word, Excel and PowerPoint files, formulas with functions, charts, SmartArt editing, and saving PDF edits back into the file.

On npm as [`mroffice-docs`](https://www.npmjs.com/package/mroffice-docs): compiled, with its types and stylesheet, no build setup needed (`npm i mroffice-docs mroffice-core`; built from this tree by `npm run pack:npm`, scripts/npm/).

The document editor of [MR Office](https://mroffice.ai): a paged word processor (MR Office's NoteEditor on Tiptap/ProseMirror) with the Office-style Home and Insert ribbon, running in the browser on a local file.

## What works in the open-source build

| Feature | Status |
|---|---|
| New document; open `.mrdoc` (MR Office's document JSON), `.html`, Markdown and plain text | Available, verified |
| Home: undo and redo, clipboard, fonts, paragraph formatting, lists and styles | Available, verified (bold applied to a selection) |
| Insert: cover and blank pages, page breaks, tables, pictures, shapes, SmartArt, charts, links, bookmarks, comments, headers, footers and page numbers, equations, symbols, text boxes and WordArt | Available, verified (a 3 × 3 table inserted) |
| Save | Available: writes `.mrdoc` (the editor's own JSON, reopened as it was) |
| Word (.docx) files | Open and save them with the MR Office desktop app (free, [download](https://github.com/XinaTian/MROffice/releases)) |
