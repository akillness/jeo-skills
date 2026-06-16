# drawio — Command & Flag Reference

Companion reference for the `drawio` skill. The skill wraps
[Agents365-ai/drawio-skill](https://github.com/Agents365-ai/drawio-skill)
(MIT). The bundled scripts live under the upstream skill folder
(`skills/drawio-skill/scripts/`) once installed.

## 1. Install the draw.io desktop CLI

| Platform | Command |
|----------|---------|
| macOS | `brew install --cask drawio` |
| Windows | Installer from <https://github.com/jgraph/drawio-desktop/releases> |
| Linux | `.deb`/`.rpm` from releases; `sudo apt install xvfb` for headless export |

Verify: `drawio --version`. On **WSL2**, the CLI is the Windows desktop exe
reached via `/mnt/c` — auto-detected. Without the CLI you can still produce
`.drawio` XML, but not PNG/SVG/PDF/JPG exports.

## 2. Install the skill

```bash
# Upstream bundle — any agent
npx skills add Agents365-ai/365-skills -g

# Claude Code plugin marketplace (upstream)
/plugin marketplace add Agents365-ai/365-skills
/plugin install drawio

# Manual
git clone https://github.com/Agents365-ai/drawio-skill.git ~/.claude/skills/drawio-skill

# This jeo-skills wrapper (plugin-installable)
npx skills add https://github.com/akillness/jeo-skills --skill drawio
```

Updates: `/plugin update drawio` (Claude Code), `skills update drawio-skill`
(SkillsMP), or `git pull` for manual installs.

## 3. Codebase visualization pipeline

Extract a graph, auto-lay it out, validate, then open/export the `.drawio`.

| Script | Purpose |
|--------|---------|
| `pyimports.py <proj> --group -o graph.json` | Python import graph |
| `jsimports.py <src> --group -o graph.json` | JS/TS import graph |
| `goimports.py <module> --group -o graph.json` | Go import graph |
| `rustimports.py <crate> --group -o graph.json` | Rust import graph |
| `pyclasses.py <pkg> --group -o graph.json` | Python class-inheritance hierarchy |
| `autolayout.py graph.json -o diagram.drawio` | Graphviz placement + ortho routing → editable `.drawio` |
| `validate.py diagram.drawio` | Deterministic linter (dangling edges, dup ids, overlaps) |

Flags of note:
- `--group` — box nodes by sub-package into nested containers.
- Transitive reduction is applied automatically (drops edges implied by a
  longer path; e.g. asyncio 149 → 46 edges).
- Auto-layout needs Graphviz (`brew install graphviz` / `apt install graphviz`);
  everything else works without it.

## 4. Shape & logo resolution

```bash
# Official shape search (AWS/Azure/GCP/Cisco/K8s/UML/BPMN/ER/electrical/P&ID)
python3 scripts/shapesearch.py "aws lambda" --limit 5
# → style string: ...;shape=mxgraph.aws3.lambda;fillColor=#F58534;...

# AI/LLM brand logos (321 from lobe-icons, MIT)
python3 scripts/aiicons.py "claude" --json      # CDN-referenced (default; network at render)
python3 scripts/aiicons.py "openai" --embed     # self-contained data URI (offline)
```

Prefer resolved style strings over guessed `shape=mxgraph.*` names, which
render as blank boxes.

## 5. Workflow & quality loop

`check deps → plan layout → generate .drawio XML → export draft PNG →
self-check + auto-fix (≤2 rounds) → show user → 5-round feedback loop →
final export`.

Self-check reads the rendered PNG and fixes 6 issue types (overlaps, clipped
labels, stacked edges, etc.).

## 6. Style presets

Built-in: `default`, `corporate`, `handdrawn`. Learn a custom style from a
`.drawio` file or a flat image; the skill renders a preview and saves the
preset only after approval.

```text
Draw a microservices architecture using my "corporate" style
Learn my style from ~/diagrams/brand.drawio as "mybrand"
```

## 7. Diagram-type presets

ERD · UML class · UML sequence · Architecture · ML/Deep-Learning · Flowchart.
ML/DL diagrams add tensor-shape annotations and layer-type color coding;
flowcharts use semantic shapes (parallelogram I/O, diamond decisions).

## 8. Choosing draw.io vs siblings

| Need | Reach for |
|------|-----------|
| Polished, exportable, icon-rich diagrams; kept editable | **drawio** (this skill) |
| Diagrams-as-code in git, render in Markdown | `mermaid` |
| UML-as-code in CI | `plantuml` |
| Hand-drawn / whiteboard look | `excalidraw-skill`, `tldraw-skill` |
| Slide decks | `presentation-builder` |

## References

- Upstream: <https://github.com/Agents365-ai/drawio-skill>
- Online docs: <https://agents365-ai.github.io/drawio-skill/>
- `docs/USAGE.md`, `docs/INSTALL_CLI.md`, `docs/STYLE_PRESETS.md`, `docs/COMPARISON.md`
- `references/autolayout.md`, `references/shapes.md`, `references/troubleshooting.md`
