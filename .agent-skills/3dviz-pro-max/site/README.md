# site

Landing page for `3dviz-pro-max`. React 19 · Vite 7 · Tailwind v4 · three 0.180.0 (same pin as `examples/`).

| Command | Does |
| --- | --- |
| `pnpm build-data` | Reads `skills/` (including every recipe and knowledge record), `docs/`, `evals/`, `evidence/`, `examples/README.md` and `examples/shared/catalog.js` → `src/generated/{stats,examples,catalog,showcase,palette,install,compatibility}.json` + `theme.css`. Runs automatically before `dev` and `build`. |
| `pnpm dev` | Dev server on <http://127.0.0.1:4173>. `?poster=<look>` renders the bare hero poster route. |
| `pnpm build` / `pnpm preview` | Production build / local preview. |
| `pnpm test` | Regenerates the data, then runs the `node --test` cases in `tests/` over it. |
| `pnpm bundle-examples` | `scripts/bundle-examples.sh`: builds `examples/` and copies the 37 studies into `public/examples/` (git-ignored, ~1 MiB), which the page links as `/examples/<id>/`. It exports `VITE_ASSET_BASE` from the `base` field of `examples/assets-manifest.json`, so the studies fetch their anatomy STL from that bucket and no geometry enters the bundle. |
| `pnpm check:budgets` | `scripts/check-budgets.mjs`: byte budgets over the build output (text at gzip -9, media at file size). Run after a build. |

Generated data and the build output are git-ignored; the build must run from a full repository checkout because the data script reads `../skills`, `../docs`, `../evals`, `../evidence` and `../examples`.

## The page

`SiteNav` → `HeroCinematic` → `DemoGallery` (`#gallery`) → `CatalogTabs` (`#numbers`) →
`LoopSection` (`#loop`) → `InstallPanel` (`#install`) → `SiteFooter`, after the maintainer's
Daylight design (`Landing D - Daylight.dc.html`, phase 8).

**Cards come from `examples/README.md`.** Its `## ` headings are the gallery's chapters, and each
bullet — a title linked to the study's folder, then ` — blurb` — is one card's title and blurb; `examples/shared/catalog.js` adds the
id and the accent. A study the README forgets, a line the catalog does not know, or a heading that
is not in `CHAPTERS` (`scripts/build-data-content.mjs`) fails `build-data`. The one-line chapter
subtitles are page copy and live in `src/lib/chapter-subtitles.ts`, keyed by the same headings.

A card claims a **hover clip** exactly when `public/media/clips/<id>.webm` and `.mp4` are both on
disk — never from a list. The clip plays on pointer-enter or focus, rewinds on leave, and is not
mounted at all under `prefers-reduced-motion`. **Show 3D** opens the study in a `<dialog>` modal
(`src/components/study-modal.tsx`): the `<iframe src="/examples/<id>/">` is mounted only while
open, Escape / the backdrop / the close button all close it, and focus returns to the pill. The
studies must be bundled first (`pnpm bundle-examples`); in `vite dev` the iframe 404s.

**The catalog section** (`src/sections/catalog-tabs.tsx`, id `#numbers`, nav label "Catalog") is
four stat cards — recipes, knowledge records, kit blueprints, runnable studies, all from
`stats.json`, counting up once in view — over one white panel: pill tabs (Recipes · Knowledge ·
Kits · Demos, each with its total), a scrolling list of one row per group, and a footer sentence
with a "BROWSE THE DATA ↗" link to the folder those rows were read from. A row is the group's own
id in the mono face, its one-line summary, and its figure on the right: a record count for a
direction or a kind, the proved tier (`T2`, `T3`, `—`) for a kit, the chapter for a demo. Clicking
a demo row opens the same `<dialog>` a gallery card opens — the modal belongs to `App.tsx`, which
both sections call. The list scrolls at 640 px; the row cut off at that edge is the cue.

`src/generated/catalog.json` (`scripts/build-data-catalog.mjs`) holds those rows: the 24 directions
of `data/directions.json` with the recipes whose `direction_ids` **include** them (a recipe serves
several, which is what "across 24 directions" means), the 18 `knowledge_kind` directories with
their file counts, and the 22 blueprints with the highest tier their record calls `proved`. Every
figure is checked against `catalog-summary.json` inside the build — a stale summary fails it — and
summaries are cut to 100 characters at a word boundary. The store describes its records but never
its kinds, so the kinds' one-liners are page copy in `src/lib/knowledge-kind-summaries.ts`, keyed by
kind id; a kind without a line throws, and `tests/catalog-data.test.mjs` holds the two in step. The
file is ~9 KB, so it ships in the entry bundle.

**The loop section moves once.** `#loop` (`src/sections/loop-section.tsx` + `loop-cards.tsx`)
reveals block by block the first time each block is scrolled to: the prompt types itself in a word
at a time, the dashed connectors draw downwards, the route chips pop and lift under the pointer,
the host probe draws itself as a small flow chart (`loop-probe-diagram.tsx`: the probe node, a
bus forking into the renderer and capture lanes, each branch a tool mark, its condition and the
outcome it forces — lines drawn by `stroke-dashoffset`, nodes popping in behind them; the lanes
stack and the bus becomes a drop line when the card is under 26 rem, and an `sr-only` list carries
the four condition → outcome pairs), the loop badge's `↺`
turns (again on hover) while the box's dashed edge — an inset SVG rect, so it can march — drifts
one slow cycle while it is on screen, and the report chips pop with a single nudge on "Still
limited". Every animation is opacity or transform only, so layout shift stays 0. The rules live in
`src/styles/loop-motion.css`, all scoped under `.loop-motion`, a class `useLoopArmed`
(`loop-motion.tsx`) adds from JavaScript and never under `prefers-reduced-motion`: unarmed, the
section renders as the finished design, never as a blank one.

Fonts are self-hosted in `public/fonts/` (Outfit, variable `wght` 100–900, for display and body —
800 for the H1, 700 for section titles, 600 for buttons and card titles; JetBrains Mono for every
kicker, caption and mono row — latin subsets, OFL, see `public/fonts/OFL.txt`). Only the display
face is preloaded from `index.html`. The colour and type tokens in `src/generated/theme.css` are
the maintainer's Daylight design, authored in `scripts/build-data.mjs`; the skill's own
lantern-festival palette rides along as `--color-look-*` and colours the hero's dusk sky.

`install.json` and `showcase.json` are still generated and still covered by `tests/`, but no
section renders them: the install card states the docs' own words and the key-art strip was cut in
phase 8. They stay in the build so the data and its tests keep proving the sources parse.

The hero is the design's baked frame (phase 8, decision 1): the live upgrade is off, so no hero
scene chunk ships and `scripts/check-budgets.mjs` treats that budget as "absent or within limit".
The poster route (`?poster=<look>`), `scripts/hero-posters.py` and `scripts/hero-poster-diff.py`
stay in the tree for the day the live scene is switched back on.

## Icons and the share card

`public/favicon.svg` is the header's logo mark (`src/components/site-nav.tsx`) on a rounded cream
tile, and it is the source of every raster: `python3 scripts/social-assets.py --icons` renders
`favicon-16.png`, `favicon-32.png`, `favicon-512.png`, `favicon.ico` and the 180 px
`apple-touch-icon.png` from it, all listed in `index.html` alongside `public/site.webmanifest`.
`python3 scripts/social-assets.py --og` builds `public/og/3dviz-pro-max.jpg` (1200 × 630, ≤ 200 KiB,
its own budget in `check-budgets.mjs`) from the hero's showcase frame with a cream scrim and the
wordmark over its left half; `index.html` points `og:image` and `twitter:image` at it by **absolute**
URL (`SITE_URL` in `src/lib/site-links.ts`), because a crawler has no page to resolve a relative one
against. Both need Pillow and cairosvg; the outputs are committed, so the script is not part of the
build. Change the mark, the tagline or the frame → re-run the script and commit what it wrote.

Deployment, media regeneration commands, measured sizes and the publishing caveats are in
[docs/site.md](../docs/site.md).

TypeScript: app code under `src/` is `.ts/.tsx` (strict); `pnpm typecheck` runs `tsc --noEmit` and is part of `prebuild`. Node build scripts under `scripts/` stay `.mjs`.
