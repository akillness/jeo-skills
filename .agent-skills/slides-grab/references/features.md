# slides-grab feature + command reference

Upstream: <https://github.com/NomaDamas/slides-grab> · Showcase: <https://nomadamas.github.io/slides-grab/>

slides-grab is the open-source **Claude Design alternative** — a harness +
visual editor + linter for generating presentation decks with coding agents.
Each slide is a self-contained `slide-XX.html` of plain HTML & CSS. License:
MIT. Built on [ppt_team_agent](https://github.com/uxjoseph/ppt_team_agent) by
Builder Josh.

## Lifecycle

| Stage | What happens |
|-------|--------------|
| Plan | Agent creates a structured slide outline from your topic/files |
| Design | Agent generates each slide as a self-contained `slide-XX.html` |
| Edit | Browser editor: drag a bbox region + agent rewrite, or hand-edit text/size/bold |
| Export | One command → PDF, plus experimental/unstable PPTX or Figma-import PPTX |

## CLI commands

All workflow commands accept `--slides-dir <path>` (default: `slides`). On a
fresh install, discovery commands work with no deck; the rest need an existing
workspace with `slide-*.html`.

| Command | Purpose |
|---------|---------|
| `slides-grab edit` | Launch the visual slide editor (bbox selection + agent rewrite) |
| `slides-grab build-viewer` | Build a single-file `viewer.html` |
| `slides-grab validate` | Validate slide HTML (Playwright) — missing assets, bad paths |
| `slides-grab convert` | Export to **experimental/unstable** PPTX (`--resolution 2160p` for higher-res raster) |
| `slides-grab figma` | Export an **experimental/unstable** Figma-Slides-importable PPTX |
| `slides-grab pdf` | Export PDF — `--mode capture` (default, rasterized) or `--mode print` (searchable text) |
| `slides-grab png` | Render one PNG per slide (default 2160p); `--slide-mode card-news` for square 1:1 |
| `slides-grab image --prompt "…"` | Generate a local slide image (default god-tibo-imagen, uses local Codex login) |
| `slides-grab fetch-video --url <url>` | Download a web video into deck assets via `yt-dlp` |
| `slides-grab tldraw` | Render a `.tldr` diagram into a slide-sized local SVG asset |
| `slides-grab list-templates` | Show available slide templates |
| `slides-grab list-styles` | Show the 35 bundled design styles |
| `slides-grab preview-styles` | Open the 35-style visual gallery in the browser |

Discovery commands that work with no deck: `--help`, `list-templates`,
`list-styles`, `preview-styles`. Require a deck: `edit`, `build-viewer`,
`validate`, `convert`, `pdf`.

## Resolutions

`slides-grab pdf` and `slides-grab convert` default to `2160p` / `4k`. Override
with `--resolution`: `720p`, `1080p`, `1440p`, `2160p`, `4k`.

## Design styles

35 bundled: 30 derived from
[corazzon/pptx-design-styles](https://github.com/corazzon/pptx-design-styles)
plus 5 slides-grab originals. Agents can also author fully custom designs — no
config files; just tell the agent which style (or describe a custom one).

## Asset contract

Store local images/videos in `<slides-dir>/assets/` and reference as
`./assets/<file>`.

| Form | Status |
|------|--------|
| `<img src="./assets/x.png" alt="…">` | Preferred |
| `<video src="./assets/demo.mp4" poster="./assets/demo-poster.png">` | Preferred for video |
| `data:` URLs | Allowed (fully self-contained slides) |
| Remote `http(s)://` image URLs | Disallowed in saved slides |
| Absolute paths (`/Users/…`, `C:\…`) | Unsupported |
| Remote video URLs | Unsupported — `fetch-video` into `assets/` first |

Run `slides-grab validate` before export to catch missing assets and
discouraged path forms. For `<video>` slides, set `poster="./assets/<file>"` so
PDF export uses a stable still instead of a live autoplay frame.

## Image generation providers

`slides-grab image` saves into `<slides-dir>/assets/` and prints the portable
`./assets/<file>` reference.

| Provider | Flag | Requirements |
|----------|------|--------------|
| god-tibo-imagen (default) | (default) | Local Codex ChatGPT login (`~/.codex/auth.json`), image-entitled account. **Unsupported private Codex backend — may break without notice** |
| Codex / OpenAI `gpt-image-2` | `--provider codex` (alias `openai`) | `OPENAI_API_KEY`; maps `--aspect-ratio` to nearest OpenAI size (`16:9`→`1536x1024`) |
| Google `gemini-3-pro-image-preview` | `--provider nano-banana` (alias `gemini`) | `GOOGLE_API_KEY` / `GEMINI_API_KEY`; `--image-size 2K\|4K` |

If the default god-tibo-imagen call fails, slides-grab falls back to any
provider with credentials, otherwise asks you to use web search + local
download into `assets/`.

## Card News (square 1:1) workflow

Instagram-style card news uses a 720pt × 720pt frame end-to-end. Pass
`--mode card-news` (editor/validate) and `--slide-mode card-news` (pdf/png) at
every stage; prefer `slides-grab png` as the primary export.

```bash
slides-grab edit     --slides-dir decks/my-cards --mode card-news
slides-grab validate --slides-dir decks/my-cards --mode card-news
slides-grab png      --slides-dir decks/my-cards --slide-mode card-news --resolution 2160p
```

## Multi-deck workflow

Keep each deck under `decks/<name>/` and pass `--slides-dir` everywhere:

```bash
slides-grab edit     --slides-dir decks/my-deck
slides-grab validate --slides-dir decks/my-deck
slides-grab pdf      --slides-dir decks/my-deck --output decks/my-deck.pdf
slides-grab pdf      --slides-dir decks/my-deck --mode print --output decks/my-deck-searchable.pdf
slides-grab png      --slides-dir decks/my-deck --output-dir decks/my-deck/out-png
slides-grab convert  --slides-dir decks/my-deck --output decks/my-deck.pptx
slides-grab figma    --slides-dir decks/my-deck --output decks/my-deck-figma.pptx
```

> `convert` and `figma` are **experimental / unstable** — best-effort output,
> layout shifts, and manual cleanup in PowerPoint or Figma.

## Installation

```bash
# Recommended: npm package (CLI + shared skills)
npm install slides-grab
npx playwright install chromium
npx skills add ./node_modules/slides-grab -g -a codex -a claude-code --yes --copy

# Or let the agent follow the upstream guide
#   Claude: docs/installation/claude.md   ·   Codex: docs/installation/codex.md

# Or clone to develop slides-grab itself
git clone https://github.com/NomaDamas/slides-grab.git && cd slides-grab
npm ci && npx playwright install chromium
```

Requires **Node.js >= 20**.

## Project structure (upstream)

```
bin/              CLI entry point
src/editor/       Visual editor (HTML + JS client modules)
scripts/          Build, validate, convert, editor server
templates/        Slide HTML templates (cover, content, chart, …)
src/              Design styles data, style config, path resolution
skills/           Shared Vercel-installable agent skills + references
docs/             Installation & usage guides
showcase/         Static gallery → https://nomadamas.github.io/slides-grab/
```

## Notes

- Slides are HTML & CSS — the language agents outperform humans at — so decks
  are beautiful, agent-editable, and convert cleanly to PDF.
- The editor is a pure JavaScript file: easy to extend (new coding agents,
  designs, features).
- PPTX (`convert`) and Figma (`figma`) paths are experimental/unstable and emit
  best-effort `.pptx` for manual import; they do not upload to Figma directly.
