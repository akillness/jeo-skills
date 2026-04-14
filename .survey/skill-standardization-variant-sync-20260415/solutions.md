# Solution Landscape: skill-standardization variant sync

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Agent Skills specification | Canonical spec for frontmatter, naming, and progressive disclosure | Strong grounding for `name`/`description`/directory rules | Does not prescribe repo-specific `SKILL.toon` maintenance | Primary source: https://agentskills.io/specification |
| Agent Skills description optimization guide | Trigger-quality optimization and should-trigger / should-not-trigger eval design | Strong guidance for frontmatter trigger wording and evaluation discipline | Focuses on trigger quality, not repo-specific derivative artifacts | Primary source: https://agentskills.io/skill-creation/optimizing-descriptions |
| Agent Skills eval guidance | Structured quality measurement and baseline-vs-skill comparison | Good for ratcheting changes instead of anecdotal edits | Does not automatically cover compact variant sync unless the evals ask for it | Primary source: https://agentskills.io/skill-creation/evaluating-skills |
| oh-my-skills `validate_catalog_sync.py` | Repo-local drift checker for manifest + README/setup counts | Catches catalog membership and count drift quickly | Does not inspect `SKILL.toon` / `SKILL.compact.md` freshness | Repo source: `.agent-skills/skill-standardization/scripts/validate_catalog_sync.py` |
| oh-my-skills manual `SKILL.toon` refresh pattern | Human/agent remembers to update compact file in each modernization PR | Flexible and already used in practice | Easy to forget; knowledge is scattered across survey artifacts and logs | Repo evidence: `.agent-skills-wiki/log.md`, multiple `.survey/*/loop-results.md` |

## Categories
- **Spec layer:** Agent Skills spec and description/eval docs
- **Repo automation layer:** `validate_skill.sh`, `validate_catalog_sync.py`
- **Human workaround layer:** ad hoc checklist memory, survey-charter reminders, PR discipline

## What People Actually Use
In this repo, maintainers already behave as if compact variants matter: multiple modernization runs explicitly refreshed `SKILL.toon`, and runtime files (`skill-query-handler.py`, `skill_loader.py`) load or fall back through those compact variants. The real gap is not absence of a compact format; it is that the reusable standardization skill and its checklist/evals under-specify variant-sync duties.

## Frequency Ranking
1. `SKILL.md` validation and description fixes
2. `skills.json` + README/setup sync checks
3. Manual `SKILL.toon` refreshes during individual modernization runs
4. No automated compact-variant drift verification

## Key Gaps
- No explicit standardization step requiring `SKILL.toon` / `SKILL.compact.md` refresh after material trigger-surface changes
- No checklist item that distinguishes manifest/docs sync from compact-runtime sync
- No eval asserting that token-optimized discovery artifacts must be reviewed as part of standardization

## Contradictions
- Marketed/current workflow claim: catalog-sync validation plus `SKILL.md` linting are enough to keep discovery surfaces aligned.
- User/runtime reality: the repo also ships compact skill variants, so a skill can pass current validation while still exposing stale trigger intent in compact mode.

## Key Insight
The highest-value improvement is not a new skill: it is tightening `skill-standardization` so it treats compact discovery variants as first-class derived artifacts alongside `skills.json` and README/setup surfaces. That change transfers across nearly every future modernization run and reduces a subtle class of drift that the current scripts do not catch.
