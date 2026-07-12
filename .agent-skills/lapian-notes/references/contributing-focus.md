# Lapian Notes — Contributing Focus

## Current state of contribution docs

As of this writing, the repo root does **not** contain a `CONTRIBUTING.md`
(root listing: `.gitattributes`, `.gitignore`, `LICENSE`, `README.md`,
`README.en.md`, `docs/`, config files, `src/`, dev-server plugins, run
scripts, `package.json`). Before telling a user "there is no formal
contributing guide", re-check with `scripts/fetch-docs.sh contributing` —
this is a small, actively developed hobby project and a `CONTRIBUTING.md`
could be added at any time. In its absence, follow the general norms below
plus whatever the README/issue templates say.

## Pre-PR checks

There is no test script in `package.json`. The two checks that exist:

```bash
npm run lint    # eslint .
npm run build   # tsc -b && vite build — this both type-checks and builds
```

Run both before proposing a change. `npm run build` failing on the `tsc -b`
step is a type error, not a bundler error — read the TypeScript diagnostic,
don't just retry the build.

## Where feature work naturally clusters

- **Frame/subtitle/transcode pipeline** — `src/lib/videoFrames.ts`,
  `frameStore.ts`, `transcode.ts`, `videoSubtitles.ts`, `autoSubtitle.ts`,
  `srt.ts`, plus the two root-level `*-server-plugin.ts` files. Changes here
  touch both the Vite dev-server middleware and the browser-side caller —
  check both sides of the plugin/client contract before editing one.
- **AI-package round trip** — `framePackage.ts` (ZIP construction, prompt
  text) and `aiImport.ts` (JSON validation/merge). If the JSON schema the app
  expects back from an AI changes, both the prompt text embedded in
  `framePackage.ts` and the parser in `aiImport.ts` must change together, or
  previously-exported AI results become unparseable.
- **Story-structure / emotion-curve / diagnostics** —
  `storyStructure.ts`, `storyLines.ts`, `segmentQuality.ts`,
  `segmentCoverage.ts`, `segmentProgress.ts`, `macroProgress.ts`. These are
  pure-logic modules (no framework dependency); prefer adding/adjusting
  logic here over embedding scoring rules inside components.
- **UI/components** — `Toolbar.tsx`, `FrameTimeline.tsx`,
  `InspectorPanel.tsx`, `ProjectLibrary.tsx`, `WorkflowGuide.tsx`,
  `BeginnerGuide.tsx`. `WorkflowGuide.tsx` and `BeginnerGuide.tsx` are
  explicitly aimed at non-developer end users following the 4-step wizard —
  keep changes there in plain, guided language, not developer jargon.
- **Export** — `markdown.ts` for Markdown/script export; `html-to-image` is
  used for the swimlane long-image export.

## Things to protect by design, not just by convention

- **No direct AI API integration.** The README explicitly frames this as a
  "bring your own AI, no API key" tool. A PR that adds a hardcoded call to
  an AI provider's API would contradict the stated design and privacy
  posture (film/notes data never leaves the user's machine except via the
  manually-initiated ZIP hand-off) — flag this rather than implementing it
  silently.
- **Local-first persistence.** Don't introduce a required server-side
  datastore for notes/projects; `localStorage`/`IndexedDB` + exportable ZIP
  is the supported model. A cloud-sync feature, if ever proposed, would need
  to be opt-in and clearly separated from the default local-only path.
- **Dev-server-only features must degrade gracefully.** Any new feature
  added to `transcode-server-plugin.ts` or `subtitle-server-plugin.ts` needs
  a documented manual fallback for static `npm run build` deployments,
  matching the existing pattern for transcode/subtitle search.
- **Subtitle sourcing legality.** Online subtitle search pulls from public
  subtitle sites; don't propose bundling or redistributing third-party
  subtitle content — the existing disclaimer already flags this as
  copyright-sensitive and non-commercial-use-only.

## PR hygiene (general, absent a formal doc)

- Keep PRs scoped to one of the clusters above; cross-cutting AI-schema +
  UI + pipeline changes in one PR make review hard.
- Include before/after screenshots for UI-visible changes (the maintainer's
  own README relies heavily on screenshots to explain UI state).
- Since the primary audience/README is Chinese-first with an English
  mirror (`README.en.md`), keep both in sync if a change alters
  user-facing setup steps or claims.
