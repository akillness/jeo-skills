# @mrnote/slides

> **For the full experience, install the MR Office desktop app (free): https://github.com/XinaTian/MROffice/releases** (or https://mroffice.ai) — it adds opening and saving Word, Excel and PowerPoint files, formulas with functions, charts, SmartArt editing, and saving PDF edits back into the file.

On npm as [`mroffice-slides`](https://www.npmjs.com/package/mroffice-slides): compiled, with its types and stylesheet, no build setup needed (`npm i mroffice-slides mroffice-core`; built from this tree by `npm run pack:npm`, scripts/npm/).

The presentation editor of [MR Office](https://mroffice.ai) (its PresentationWindow with the Home and Insert ribbon: layouts and sections, text, shapes and their arrangement, tables, pictures, icons, SmartArt, charts, WordArt, equations and video), in its browser-only mode over a local file.

| Feature | Status |
|---|---|
| New presentation; open and save `.mrslides` (the editor's JSON) | Available, verified (new deck opens with the ribbon; save writes the deck) |
| Editing slides | Available: the slide canvas with its placeholders, the slide rail, notes, comments, zoom and presenting |
| PowerPoint (.pptx) files | Open and save them with the MR Office desktop app (free, [download](https://github.com/XinaTian/MROffice/releases)) |
