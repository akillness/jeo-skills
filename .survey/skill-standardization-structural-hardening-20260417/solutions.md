# Solution Landscape: skill-standardization structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Agent Skills specification | Canonical spec for frontmatter, naming, progressive disclosure, and size guidance | Strong grounding for required fields and trigger quality | Does not solve repo-local pathing or derived-surface sync by itself | Primary source: https://agentskills.io/specification |
| Agent Skills description/eval guidance | Improves trigger phrasing and test discipline | Strong fit for repeatable ratcheting | Does not define repo-specific discovery sync | Primary sources: optimizing-descriptions, evaluating-skills |
| Repo validator scripts | `validate_skill.sh` + `validate_catalog_sync.py` | Fast, repeatable, already embedded in maintenance loops | Current skill examples are path-ambiguous; catalog validator does not enforce compact freshness | `.agent-skills/skill-standardization/scripts/` |
| Checklist + manual review | Review aliases, docs, runtime, and compact variants | Catches nuance beyond scripts | Easy to forget without a sharper router | `references/catalog-sync-checklist.md` |
| Structural hardening in place | Shrink the front door, move detail to references, refresh derived surfaces | Transfers across future maintenance runs without adding another skill | Requires disciplined sync of `SKILL.md`, `SKILL.toon`, and manifest metadata | Matches current repo maintenance direction |

## Categories
- **Spec layer:** Agent Skills spec, description optimization, eval guidance, script guidance
- **Repo automation layer:** `validate_skill.sh`, `validate_catalog_sync.py`, filesystem-first runtime/query behavior
- **Support-packet layer:** `references/`, `evals/evals.json`, `SKILL.toon`
- **Discovery-sync layer:** `skills.json`, README/setup, repo-level compact surfaces, runtime query/load tooling
- **Structural-hardening layer:** shrink oversized front doors, clarify mode routing, move slower-changing detail into references

## What People Actually Use
In practice, maintainers use a mixed workflow: run the nested validator scripts from the repo root, inspect discovery surfaces manually, and refresh `SKILL.toon` when the trigger surface changes. The durable opportunity is not another helper skill; it is making `skill-standardization` itself reflect the actual repo-root workflow and the derived-surface review that maintainers already perform.

## Frequency Ranking
1. `SKILL.md` validation and description fixes
2. Catalog/discovery sync checks after structural changes
3. Manual `SKILL.toon` refreshes during modernization runs
4. Front-door shrinking + reference extraction for dense anchor skills
5. New meta-skill creation (low-value for this problem)

## Key Gaps
- The main skill still shows repo-root-broken `scripts/...` examples even though the repo uses nested paths.
- Manifest metadata for `skill-standardization` still contains stale legacy commands/source paths.
- The standardization workflow describes compact-surface duties, but the front door does not make execution modes and validator coverage boundaries especially clear.
- The current skill is still larger than it needs to be for a high-frequency router.

## Contradictions
- Marketed/current story: `SKILL.md` linting plus catalog-sync checks are enough.
- Actual repo behavior: maintainers also need path-aware command usage, compact-surface review, and runtime/discovery sanity checks.

## Key Insight
The highest-value bounded improvement is a structural hardening pass on `skill-standardization` itself: make the real execution modes explicit, fix repo-root command truthfulness, keep derived discovery surfaces in sync, and remove stale manifest residue. That compounds across future maintenance runs better than adding another validation-adjacent wrapper.
