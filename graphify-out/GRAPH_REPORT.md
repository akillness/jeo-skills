# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, cross-skill mentions, and documentation indexing
- Total skills: 90
- Manifest skills in `.agent-skills/skills.json`: 90
- Skills with references/: 68
- Skills with evals/: 67
- Skills with scripts/: 23
- Graph nodes: 251
- Graph edges: 703

## Strongest structural findings
1. `ohmg` is now a stronger platform-specific anchor because it owns the Gemini / Antigravity entry path for the portable `oh-my-agent` harness instead of pretending to be a stale Gemini-only framework wrapper.
2. The platform-runtime boundary is cleaner when `ohmg` teaches `.agents` as the portable source of truth, then routes Claude-first runtime depth to `omc` and Codex-first runtime depth to `omx`.
3. Discovery docs (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`) remain high-degree nodes, so changing a platform skill's positioning still requires top-level wording updates in the same run.
4. `ohmg` now has support coverage (references, evals), which reduces drift risk in a fast-moving upstream project where naming, layout, and workflow surfaces have already changed materially.
5. The orchestration lane benefits more from sharper platform boundaries and support files than from adding another overlapping wrapper skill.

## Highest-degree nodes
- README.ko.md: degree 89
- README.md: degree 89
- setup-all-skills-prompt.md: degree 88
- debugging: degree 35
- performance-optimization: degree 22
- code-review: degree 21
- jeo: degree 19
- plannotator: degree 19
- web-accessibility: degree 19
- monitoring-observability: degree 18

## Duplicate / consolidation notes
- `ohmg` should stay the Gemini / Antigravity-facing portable-harness anchor while `omc` remains the Claude-first runtime overlay.
- `ohmg` should stay the Gemini / Antigravity-facing portable-harness anchor while `omx` remains the Codex-first runtime overlay.
- `ohmg` should explain `.agents` and generated vendor views rather than duplicating the full mode catalogs from `omc` or `omx`.

## Recommended maintenance direction
- Keep upgrading high-visibility platform anchors whose upstream products are evolving quickly.
- Re-check top-level discovery docs whenever `ohmg`, `omc`, or `omx` changes materially.
- Prefer support-file ratchets (`references/`, `evals/`) for fast-moving orchestration skills so boundary drift gets caught earlier.
