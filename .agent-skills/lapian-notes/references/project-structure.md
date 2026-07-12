# Lapian Notes — Project Structure

## Stack

| Layer | Technology |
| --- | --- |
| UI | React 19 + TypeScript |
| Build/dev server | Vite 8 |
| Styling | plain CSS (`App.css`, `index.css`) |
| Local persistence | `localStorage` (note text) + `IndexedDB` (frame screenshots) |
| Image export | `html-to-image` (long-image export of the swimlane timeline) |
| Optional native dep | `ffmpeg` (only for RMVB/AVI/HEVC-style auto-transcode; not required for H.264 MP4) |
| Lint | ESLint 10 + typescript-eslint |

No backend/server framework and no database — the two `*-server-plugin.ts`
files at the repo root are Vite dev-server middleware, not a standalone
server.

## Repo layout (root)

```
lapian-notes/
├── src/
│   ├── App.tsx / App.css / main.tsx / index.css   — app shell
│   ├── types.ts                                   — shared TS types
│   ├── components/                                — UI surfaces
│   │   ├── Toolbar.tsx
│   │   ├── FrameTimeline.tsx        — the story-line swimlane timeline
│   │   ├── InspectorPanel.tsx       — per-segment edit panel
│   │   ├── ProjectLibrary.tsx       — saved-project list / open-save-ZIP
│   │   ├── WorkflowGuide.tsx        — the persistent 4-step wizard header
│   │   └── BeginnerGuide.tsx        — non-developer onboarding copy
│   ├── lib/                                        — core logic, framework-free
│   │   ├── videoFrames.ts / frameStore.ts / frameFileName.ts  — 1s-interval
│   │   │   frame extraction + local frame cache
│   │   ├── transcode.ts             — talks to transcode-server-plugin.ts
│   │   ├── videoSubtitles.ts / autoSubtitle.ts / srt.ts        — embedded
│   │   │   subtitle read + online subtitle search/parse (via subtitle-
│   │   │   server-plugin.ts) + SRT parsing
│   │   ├── framePackage.ts          — builds the AI-analysis ZIP (screenshots
│   │   │   + subtitles + prompt + film metadata)
│   │   ├── aiImport.ts              — parses/validates the AI's returned JSON
│   │   │   and merges it into project state
│   │   ├── aiTime.ts / timecode.ts / timelineBlock.ts          — time/segment
│   │   │   geometry helpers
│   │   ├── storyLines.ts            — multi-swimlane story-line model
│   │   ├── storyStructure.ts        — structure-tree grouping (main/side/
│   │   │   emotional/informational lines)
│   │   ├── segmentQuality.ts / segmentCoverage.ts / segmentProgress.ts /
│   │   │   macroProgress.ts          — completion/diagnostic scoring shown
│   │   │   in the player panel and inspector
│   │   ├── screenplayResearch.ts    — screenplay-section reconstruction for
│   │   │   segment deep-dive packages
│   │   ├── markdown.ts              — Markdown/script export
│   │   ├── project.ts / projectStore.ts / autosave.ts          — project
│   │   │   model, localStorage/IndexedDB persistence, autosave
│   │   └── glossary.ts              — in-app terminology strings
│   └── assets/
├── public/
├── docs/                            — screenshots used in README only
├── transcode-server-plugin.ts       — Vite dev-server plugin: local HTTP
│                                       endpoint for ffmpeg-based transcode
├── subtitle-server-plugin.ts        — Vite dev-server plugin: local HTTP
│                                       endpoint for embedded/online subtitle
│                                       fetch
├── run.bat / run.command / setup.ps1 — end-user bootstrap scripts (portable
│                                        Node.js + npm install + npm run dev)
├── vite.config.ts / tsconfig*.json / eslint.config.js
├── package.json
├── README.md (Chinese, primary) / README.en.md (English)
└── LICENSE (MIT)
```

## Local-first data model

- **Note text** → `localStorage`, keyed per project.
- **Frame screenshots** → `IndexedDB`, cached per project/timecode.
- **"保存项目" (Save Project)** → exports a single self-contained ZIP
  containing notes + screenshots + a generated Markdown doc. This is the
  supported way to move a project between browsers or back it up; there is
  no cloud sync.
- Browser security sandboxing means a page refresh loses the live video file
  handle — the user must re-select the film file to re-enable frame
  extraction after a refresh, but existing notes/screenshots are unaffected
  (they're already persisted).

## AI-analysis-package round trip (the core workflow)

This is the tool's central design idea — no AI vendor lock-in, no API key:

1. **Import film** → local transcode if needed (ffmpeg via
   `transcode-server-plugin.ts`) → 1-second-interval frame extraction
   (`videoFrames.ts`/`frameStore.ts`) → read embedded subtitles or fall back
   to online subtitle search (`autoSubtitle.ts` via
   `subtitle-server-plugin.ts`) → `framePackage.ts` bundles frames +
   subtitles + film metadata + a pre-written analysis prompt into a ZIP
   (prompt text is also auto-copied to the clipboard).
2. **User manually** sends the ZIP + prompt to any AI chat tool (ChatGPT,
   etc.) — the app never calls an AI API itself.
3. **Import AI result** → `aiImport.ts` validates/parses the AI's returned
   JSON (story lines, segment groupings, key beats) and merges it into
   project state, which drives:
   - the swimlane timeline (`FrameTimeline.tsx` + `storyLines.ts`)
   - the structure tree + audience-emotion curve
     (`storyStructure.ts` + `segmentQuality.ts`/`macroProgress.ts`)
4. **Deep-dive**: any single segment can be re-packaged (smaller ZIP, via the
   same `framePackage.ts` path scoped to one segment) and sent back to the AI
   for scene/shot-level breakdown (`screenplayResearch.ts`), then re-imported.
5. **Player sync**: any timeline point (segment, script beat, subtitle line)
   jumps the video player to that timecode; "play this segment" auto-pauses
   at the segment's end.

## Dev-server-only features

`transcode-server-plugin.ts` and `subtitle-server-plugin.ts` register HTTP
endpoints only under `vite dev` (`npm run dev`). In a static `npm run build`
deployment, auto-transcode and online-subtitle-search degrade to manual
steps; everything else (frame extraction of already-compatible video, the
AI-package round trip, timeline/structure/emotion-curve UI, export) still
works.
