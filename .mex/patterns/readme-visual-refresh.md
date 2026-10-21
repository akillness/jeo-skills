---
name: readme-visual-refresh
description: Refresh localized README prose and Codex visuals without breaking generated catalog or release sections.
triggers:
  - "README refresh"
  - "replace README visuals"
edges:
  - target: context/catalog-pipeline.md
    condition: when changing generated catalog regions or diagnosing projection drift
grounds_to: []
last_updated: 2026-10-21
---

# README visual refresh

## Steps
1. Separate authored prose from projections: catalog tables/counts come from `skills.json`; English/Korean `WHATS-NEW` windows come from monthly changelogs. Adopt README-only releases into the monthly source below its title before syncing, so content survives regeneration. Spanish releases are maintained manually.
2. Write one shared brief (facts, exact asset filenames, numbered edits) before spawning one writer per locale and a separate asset writer. Writers must not run `changelog.py sync`: it rewrites README.md and README.ko.md together, so Main syncs once. Correct the brief and broadcast to every writer the moment a fact is wrong. Keep source behavior, host activation, model selection and permission claims distinct; verify commands from a consumer project rather than only the source checkout.
3. Generate the cover through Codex (`gti --provider private-codex`) and SVGs through actual `codex exec --sandbox workspace-write --ephemeral` runs that may write only the named SVGs (`--sandbox` cannot be combined with `--approve-for-me`; one prompt for three SVGs can exceed a 300 s timeout after writing). Save the prompt/requested and returned formats/dimensions in `assets/readme-visuals.json`: the private image backend returned WebP at a different size than requested. Verify actual bytes instead of trusting output filenames. Fix diagram defects with a further Codex correction run, recorded as `post_edit`.
4. Render SVGs and cover at README width; check text/card/viewBox bounds and inspect screenshots. Use transform-aware geometry (`getBoundingClientRect` plus `isPointInStroke` via each element's screen CTM): plain `getBBox` ignores group transforms and gave both false overlaps and missed a connector through text. Give root `<svg>` explicit width/height equal to the viewBox (without them the intrinsic size defaults to 150px high). Static SVGs need accessible titles/descriptions and self-contained resources. Keep optional integration branches visually distinct from catalog installation.
5. Migrate all live references before deleting the exact superseded assets. Preserve partner branding that is still referenced and historical tool captures; an unreferenced asset (for example the 2026-10-21 orphan `assets/scrapingant/` logo) is legacy and goes when the user asks for legacy removal. Confirm retired files and live references are absent; history prose may still name old files.
6. Ground host loader claims in code: `jeo-skill.py` `install_root()` treats `claude-code`, `pi`, `crush` as native roots. Claude Code loads `~/.claude/skills`, not the shared `~/.agents/skills`; earlier READMEs and the setup guide claimed otherwise.
7. Sync once locale sources are stable. Run catalog validation, catalog generator `--check`, and changelog `check`; additionally require exactly one START/END marker pair and footer per locale and balanced code fences (an unclosed Structure fence once swallowed the footer). The changelog regex only checks the first pair, so duplicate tails can pass its standard check.
8. For an independent release-window check, reuse `scripts/changelog.py` with **all monthly files**, not only the latest month. Run documented preview commands with staged router copies, isolated HOME/project roots and transport traps; preserve the observed result, then correct defects and rerun.

## Current boundary
The root MIT badge still targets a missing `LICENSE`. Report it as an existing open item; a visual/documentation refresh does not authorize granting a license or changing the project's stated licensing.

## Verification
- `python3 scripts/validate-catalog-projections.py`
- `python3 scripts/generate-catalog-projections.py --check`
- `python3 scripts/changelog.py check`

Use a Tester-authored focused artifact/command verifier for marker counts, new media, retired references and project/global preview behavior. The 2026-10-14 run passed eight groups and fourteen isolated commands; browser checks found no SVG text overflow at 850px.
