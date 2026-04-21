# Loop Charter

## Goal
Improve `vibe-kanban` so it activates for the right board/workspace/review workflows, routes non-board requests away cleanly, and has a reusable validation harness for future ratcheting.

## Current Baseline
- `vibe-kanban/SKILL.md` is high-visibility but behaves like a long setup + command catalog.
- It lacks `evals/evals.json`.
- Existing references focus on low-level setup (`environment-variables`, `mcp-api`) more than operator decisions, review flow, and route-outs.
- Discovery docs describe it narrowly as a visual kanban board with worktree isolation, but not the decision boundary versus trackers/planning/non-code workflows.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/vibe-kanban/SKILL.md`

Supporting artifacts allowed if the primary rewrite requires them:
- `.agent-skills/vibe-kanban/SKILL.toon`
- `.agent-skills/vibe-kanban/references/*`
- `.agent-skills/vibe-kanban/evals/evals.json`
- README / README.ko / setup-all-skills-prompt / `.agent-skills/skills.json` / `.agent-skills/skills.toon`
- survey / wiki / graph outputs required by this repo's maintenance loop

## Fixed Evaluation Harness
- Survey evidence in `.survey/vibe-kanban-modernization-20260415/{context,solutions,platform-map}.md`
- Agent Skills spec via `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/vibe-kanban`
- Catalog sync via `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- JSON validity for any new `evals/evals.json` and updated manifests/graph artifacts
- Dry-run quality checklist:
  - description says what the skill does and when to trigger
  - route-outs distinguish coding-board workflows from PM-only / marketing-only / non-code coordination
  - instructions are operator-oriented (board/workspace/review/cleanup), not just install notes
  - discovery docs reflect the new positioning

## Constraints
- Max one bounded modernization target this run
- Do not add a duplicate orchestration skill
- Keep the improvement transferable across developer workflow, web/fullstack, PM/ops, marketing/content, and game-production routing
- Preserve truthful setup details without letting setup dominate the skill
- Keep changes reviewable in one PR

## Tried Already
- Keep: modernize adjacent orchestration/browser/planning anchors (`ohmg`, `playwriter`, `agentation`, `agent-browser`, `presentation-builder`) with route-outs, support files, and synced discovery surfaces
- Revert: adding overlapping wrapper skills instead of upgrading high-visibility legacy anchors
- Why: the repo has repeatedly improved more by sharpening boundaries and support files than by increasing skill count
