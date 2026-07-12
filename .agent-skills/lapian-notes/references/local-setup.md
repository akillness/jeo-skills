# Lapian Notes — Local Setup

## Path A: non-developer / end user (recommended for most users)

1. On the repo's GitHub page, click the green **Code** button → **Download
   ZIP**.
2. Unzip the downloaded archive.
3. Launch:
   - **Windows**: double-click `run.bat` in the unzipped folder.
   - **macOS**: double-click `run.command`. On first launch macOS may refuse
     to open it ("cannot be opened") — **Control-click the file → Open →
     Open** once; after that, plain double-click works.
4. First launch auto-provisions the runtime (a portable Node.js is
   downloaded automatically if none is installed — a few minutes); every
   subsequent launch is near-instant. When ready, the default browser opens
   the tool automatically.
5. A black console/terminal window stays open while the tool runs — keep it
   open during use; closing it exits the app.

No Node.js install, no `npm`, no terminal commands required for this path.

## Path B: developer

Requirements:
- Node.js 18+
- A Chromium-based browser (Chrome or Edge) — the app relies on browser APIs
  (File System Access, IndexedDB) that are most reliable there.
- `ffmpeg` (optional) — install only if you need auto-transcode for
  RMVB/AVI/HEVC-style inputs; plain H.264 MP4 works without it.

```bash
git clone https://github.com/bkingfilm/lapian-notes.git
cd lapian-notes
npm install
npm run dev
```

Open the URL the terminal prints (default `http://localhost:5173`).

**Important**: auto-transcode and online subtitle search are served by the
two local Vite dev-server plugins (`transcode-server-plugin.ts`,
`subtitle-server-plugin.ts`), which are only active under `npm run dev` (or
the `run.bat`/`run.command` scripts, which also run `vite dev` under the
hood). A static `npm run build` + `npm run preview`/static-host deployment
loses those two features — everything else in the app still works, just
with manual transcode/subtitle steps instead of automatic ones.

## Available npm scripts

| Script | Effect |
| --- | --- |
| `npm run dev` | Start Vite dev server with the transcode/subtitle plugins active |
| `npm run build` | `tsc -b && vite build` — type-check then produce a static build |
| `npm run lint` | `eslint .` |
| `npm run preview` | Serve the static build locally (dev-server-only features degraded) |

There is no `test` script defined in `package.json` — don't invent one when
giving pre-PR check commands; see `references/contributing-focus.md`.

## Project data: save, restore, move between machines

- Notes and screenshots persist automatically in the browser
  (`localStorage` + `IndexedDB`) — no explicit save step is required for
  normal use within the same browser profile.
- Use **"保存项目" (Save Project)** in the UI to export a self-contained ZIP
  (notes + frame screenshots + a generated Markdown doc). This is the
  supported mechanism to:
  - back up a project outside the browser
  - move a project to a different browser or machine
  - restore after clearing browser storage
- After a page refresh, the browser drops the live video file handle (a
  browser security restriction) — the user must re-select the original film
  file to resume frame extraction; already-captured notes/screenshots are
  unaffected because they're already persisted separately.

## Export formats

- Full notebook → Markdown (via `src/lib/markdown.ts`)
- Screenplay/script text export
- Swimlane timeline → a single shareable long image (via `html-to-image`)

## Uninstall / reset

Since everything is local-first with no installer, uninstalling is just
deleting the unzipped folder; clearing the associated browser
`localStorage`/`IndexedDB` origin data removes any in-browser project state
that wasn't exported to a ZIP.
