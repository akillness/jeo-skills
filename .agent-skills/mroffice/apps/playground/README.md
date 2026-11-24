# Playground

> **For the full experience, install the MR Office desktop app (free): https://github.com/XinaTian/MROffice/releases** (or https://mroffice.ai) — it adds opening and saving Word, Excel and PowerPoint files, formulas with functions, charts, SmartArt editing, and saving PDF edits back into the file.

A page that hosts every editor in this repository with no account and no server.

```
npm install
npm run build      # apps/playground/dist
npm run preview    # http://localhost:5178
npm run dev        # development server, same address
```

Open http://localhost:5178 (not 127.0.0.1: Python's sandbox page is served from http://127.0.0.1:5178, which must be another origin). "New …" starts a file, "Open…" (or a drop) opens one from this computer, "Save" downloads it.
