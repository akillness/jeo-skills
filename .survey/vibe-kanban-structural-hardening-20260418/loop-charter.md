# Loop Charter

## Goal
Improve `vibe-kanban` as a smaller, more transferable coding-board front door without weakening trigger precision or route-out clarity.

## Current Baseline
- `vibe-kanban/SKILL.md` is 277 lines and still carries command, troubleshooting, and example bulk that can live in support files.
- The skill already has references/evals/compact coverage, so this run should improve front-door sharpness rather than add another overlapping skill.
- `graphify-out/GRAPH_REPORT.md` lists `vibe-kanban` among the highest-degree nodes, making concise routing more valuable than more surface area.

## Mutable Artifact
Primary file: `.agent-skills/vibe-kanban/SKILL.md`

Supporting files allowed when they directly improve the primary artifact's clarity:
- `.agent-skills/vibe-kanban/references/board-packets-and-surface-selection.md`
- `.agent-skills/vibe-kanban/evals/evals.json`
- discovery docs if wording changes materially (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`)
- survey/wiki/graph artifacts for this run

## Fixed Evaluation Harness
- Agent Skills spec / repo validation via `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Trigger quality must preserve these cases:
  1. coding board for parallel bugfixes → use `vibe-kanban`
  2. compare two coding agents on one bounded task → use `vibe-kanban`
  3. planning-only request → route away
  4. marketing/content board → route away
  5. generic tracker-sync request with coding workspaces → still use `vibe-kanban` only when coding board control is explicit
- Quality rubric:
  - smaller front door than baseline
  - explicit route-outs across PM, browser review, marketing, and non-code game workflows
  - support/docs/compact surfaces stay in sync
  - no duplicate skill added

## Constraints
- Bounded run: one skill family only
- Prefer moving detail into one focused reference rather than expanding the main file
- No new wrapper skill unless evidence clearly demands it
- Keep survey artifacts source-backed with explicit evidence-retrieval notes

## Tried Already
- Keep: 2026-04-15 modernization into the coding-board/workspace control-plane anchor
- Revert: adding another board/orchestration wrapper instead of modernizing `vibe-kanban`
- Why: structural graph + wiki evidence still favor tightening the existing anchor over adding noise
