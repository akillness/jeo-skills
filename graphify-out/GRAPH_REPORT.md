# GRAPH_REPORT

## Scope
- Path analyzed: `.agent-skills/` plus repository discovery docs
- Method: custom graphify-style structural graph over skill metadata, support-file presence, compact-variant coverage, and documentation indexing
- Total skills: 89
- Manifest skills in `.agent-skills/skills.json`: 89
- Skills with references/: 84
- Skills with evals/: 85
- Skills with scripts/: 24
- Skills with compact variants (`SKILL.toon` or `SKILL.compact.md`): 89
- Skills missing compact variants: 0
- Graph nodes: 376
- Graph edges: 1075

## Strongest structural findings
1. The graph remains docs-first: `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `skills.json`, and `skills.toon` still index every live skill and remain the highest-degree maintenance nodes.
2. `langsmith` is no longer just a support-gap holdout: it now has eval coverage and a workflow-mode reference that aligns the skill body with repo-modernized anchors.
3. The useful boundary for `langsmith` is no longer “all LangSmith features in one place”; it is deciding between debugging traces, offline evals, online review, prompt-registry work, and multi-service propagation, then routing generic observability and deployment elsewhere.
4. Support-coverage leverage still comes from upgrading indexed legacy anchors instead of adding overlapping AI-ops wrappers.

## Highest-degree nodes
- README.md: degree 89
- README.ko.md: degree 89
- setup-all-skills-prompt.md: degree 89
- .agent-skills/skills.json: degree 89
- .agent-skills/skills.toon: degree 89
- debugging: degree 41
- performance-optimization: degree 27
- bmad: degree 25
- code-review: degree 25
- task-planning: degree 24
- plannotator: degree 23
- vibe-kanban: degree 23

## Duplicate / consolidation notes
- `langsmith` should remain the single LangSmith-specific trace/eval/review skill instead of spawning separate tracing-only, eval-only, or Prompt Hub wrapper skills.
- The stronger route is workflow-and-boundary hardening: mode selection, route-outs, and eval coverage.
- README / setup surfaces now reflect the sharper routing boundary, so discovery copy is aligned with the skill body again.

## Recommended maintenance direction
- Keep upgrading the remaining support-gap skills that still lack `references/` or `evals/` before adding overlapping wrappers.
- Re-run catalog/runtime sync validation whenever discovery copy or manifest descriptions change materially.
- Treat LangSmith work as workflow-sensitive: preserve the split between LLM-specific tracing/evals and broader telemetry/rollout policy.
