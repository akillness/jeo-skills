# @mrnote/code

> **For the full experience, install the MR Office desktop app (free): https://github.com/XinaTian/MROffice/releases** (or https://mroffice.ai) — it adds opening and saving Word, Excel and PowerPoint files, formulas with functions, charts, SmartArt editing, and saving PDF edits back into the file.

On npm as [`mroffice-code`](https://www.npmjs.com/package/mroffice-code): compiled, with its types and stylesheet, no build setup needed (`npm i mroffice-code mroffice-core`; built from this tree by `npm run pack:npm`, scripts/npm/).

The code editor of [MR Office](https://mroffice.ai): CodeMirror 6 with MR Office's Home ribbon, syntax highlighting for many languages, an outline, find, quick open, a file explorer and problems.

This package is generated from MR Office's own source (see the repository README, "How this repository is made").

## Use

```tsx
import { EditorHostProvider } from "@mrnote/core";
import codeEditor from "@mrnote/code";

const { Component: CodeEditor } = codeEditor;

<EditorHostProvider locale="en">
  <CodeEditor
    file={{ id: "1", name: "hello.py", bytes: new TextEncoder().encode('print("hi")') }}
    registerSave={(save) => { saver = save; return () => {}; }}
    onSaveRequest={() => download(saver())}
  />
</EditorHostProvider>
```

`registerSave` receives a function that returns the current text as a file (`{ name, type, bytes }`); `onSaveRequest` fires on the editor's own Save (ribbon, Ctrl/Cmd+S).

## What works in the open-source build

| Feature | Status |
|---|---|
| Open and edit text and source files (.js .ts .py .sql .lua .sh .rb .go .c .cpp .cs .java .rs .tex .json .yaml .html .css .md and more) | Available, verified |
| Syntax highlighting, folding, bracket matching, multiple cursors, outline, breadcrumbs | Available |
| Home: undo and redo, import and download, the file's language and name, the file explorer, quick open, find and problems | Available |
| Save | The host saves: the playground downloads the file |

## Size

About 100,000 lines of the editor's own code (packages/code/src/web), on top of the shared layer in @mrnote/core. In the playground's production build the code editor is a lazily loaded chunk.
