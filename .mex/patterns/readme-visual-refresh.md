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
last_updated: 2026-10-14
---

# README visual refresh

## Steps
1. Separate authored prose from projections: catalog tables/counts come from `skills.json`; English/Korean `WHATS-NEW` windows come from monthly changelogs. Adopt README-only releases into the monthly source below its title before syncing, so content survives regeneration. Spanish releases are maintained manually.
2. Assign one writer per locale and a separate asset writer with agreed filenames. Keep source behavior, host activation, model selection and permission claims distinct; verify commands from a consumer project rather than only the source checkout.
3. Generate the cover through Codex and SVGs through actual Codex execution. Save the prompt/requested and returned formats/dimensions in `assets/readme-visuals.json`: the private image backend returned WebP at a different size than requested. Verify actual bytes instead of trusting output filenames.
4. Render SVGs and cover at README width; check text/card/viewBox bounds and inspect screenshots. Static SVGs need accessible titles/descriptions and self-contained resources. Keep optional integration branches visually distinct from catalog installation.
5. Migrate all live references before deleting the exact superseded assets. Preserve unrelated partner branding and historical tool captures. Confirm retired files and references are absent.
6. Sync once locale sources are stable. Run catalog validation, catalog generator `--check`, and changelog `check`; additionally require exactly one START/END marker pair and footer per locale. The changelog regex only checks the first pair, so duplicate tails can pass its standard check.
7. For an independent release-window check, reuse `scripts/changelog.py` with **all monthly files**, not only the latest month. Run documented preview commands with staged router copies, isolated HOME/project roots and transport traps; preserve the observed result, then correct defects and rerun.

## Current boundary
The root MIT badge still targets a missing `LICENSE`. Report it as an existing open item; a visual/documentation refresh does not authorize granting a license or changing the project's stated licensing.

## Verification
- `python3 scripts/validate-catalog-projections.py`
- `python3 scripts/generate-catalog-projections.py --check`
- `python3 scripts/changelog.py check`

Use a Tester-authored focused artifact/command verifier for marker counts, new media, retired references and project/global preview behavior. The 2026-10-14 run passed eight groups and fourteen isolated commands; browser checks found no SVG text overflow at 850px.
