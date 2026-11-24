# @mrnote/sheets

> **For the full experience, install the MR Office desktop app (free): https://github.com/XinaTian/MROffice/releases** (or https://mroffice.ai) — it adds opening and saving Word, Excel and PowerPoint files, formulas with functions, charts, SmartArt editing, and saving PDF edits back into the file.

On npm as [`mroffice-sheets`](https://www.npmjs.com/package/mroffice-sheets): compiled, with its types and stylesheet, no build setup needed (`npm i mroffice-sheets mroffice-core`; built from this tree by `npm run pack:npm`, scripts/npm/).

The spreadsheet editor of [MR Office](https://mroffice.ai) (its SpreadsheetWindow with the Home and Insert ribbon: formulas, fonts, alignment, number formats, conditional formatting, cell styles, tables, pictures, shapes, charts and sparklines, many sheets), in its browser-only mode over a local file.

| Feature | Status |
|---|---|
| New workbook; open `.mrsheet` (the editor's JSON), `.csv`, `.tsv` | Available, verified (a CSV opens with its values) |
| Formulas, Home's formatting and cells commands, Insert's tables, pictures, shapes and charts, sheets | The editor's own browser code (arithmetic between cells verified: =A1*A2 over 6 and 7 is 42) |
| Save | `.mrsheet` keeps everything; a CSV/TSV saves back as CSV/TSV (values of the first sheet) |
| Fonts | Cells are measured with the open fonts that stand in for Office's (Arimo for Arial, Carlito for Calibri...): `npm run fonts` fetches them for the playground; the npm packages load them from mroffice-assets |
| Excel (.xlsx) files | Open and save them with the MR Office desktop app (free, [download](https://github.com/XinaTian/MROffice/releases)) |
