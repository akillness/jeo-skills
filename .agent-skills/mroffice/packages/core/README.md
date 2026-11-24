# @mrnote/core

> **For the full experience, install the MR Office desktop app (free): https://github.com/XinaTian/MROffice/releases** (or https://mroffice.ai) — it adds opening and saving Word, Excel and PowerPoint files, formulas with functions, charts, SmartArt editing, and saving PDF edits back into the file.

On npm as [`mroffice-core`](https://www.npmjs.com/package/mroffice-core): compiled, with its types and stylesheet, no build setup needed (`npm i mroffice-core`; built from this tree by `npm run pack:npm`, scripts/npm/).

The shared layer of the [MR Office](https://mroffice.ai) editors: the Office-style ribbon and its icons, fonts and text measurement, themes, charts, SmartArt, equations, the interface text in 20 languages, and the **host adapter** through which an application embeds the editors.

## The host adapter

MR Office's editors were written for MR Office: they save to its notebooks, share and co-edit through its servers, and offer its AI. None of that is part of the open-source editors. Where an editor would reach it, it reaches the host instead:

- `EditorHostProvider` wraps the editors with a host (`saveFile`, `notify`) and the interface language.
- Every editor package's default export is an `EditorDefinition`: the extensions it opens, a new empty file, and a component taking `{ file, registerSave, onSaveRequest }`.
- `src/web/__stubs__/` and the modules marked "is part of MR Office, not of the open-source editors" stand in for the parts that stay in MR Office (workspace, accounts, collaboration, AI, the service's API). They do nothing; a feature that needs one is absent.

`src/web/` is generated from MR Office's source by its export script and is replaced on every sync: change it upstream, not here. `src/host/` and `src/index.ts` are this repository's own.
