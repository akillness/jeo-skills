# Solution Landscape: hourly transport-error path portability ratchet

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Repo-relative error_log contract | Require `transport_status.web_search.error_log` to be `.survey/<slug>/web-search-error.log` (relative) | Deterministic, portable across hosts, cleaner diffs | Requires wording update in guidance docs | provenance: direct page retrieval |
| Allow absolute paths but warn | Permit both relative/absolute with caution note | Backward compatible with legacy artifacts | Keeps portability noise alive | provenance: indexed snippet |
| Strip host prefix post-hoc | Rewrite paths during review tooling | No behavior change in collectors | Extra processing surface and complexity | provenance: indexed snippet |

## Categories
- Recommendation-grade artifact contract hardening
- Transport fallback observability
- Cross-run portability

## What People Actually Use
In unattended cron runs, maintainers prefer deterministic artifact paths that can be copied directly between evidence, Graphify output, and wiki notes. Relative `.survey/<slug>/...` paths are easier to diff and replay than machine-specific absolute paths.

## Frequency Ranking
1. Repo-relative error_log contract
2. Allow absolute paths but warn
3. Strip host prefix post-hoc

## Key Gaps
- Existing guidance standardizes filename, but does not explicitly forbid host-absolute path storage in `transport_status.error_log`.
- Review automation can still pass while portability quality regresses.

## Contradictions
- Strict relative-only contracts reduce ambiguity, but may require migration note for historical artifacts containing absolute paths.

## Key Insight
Low-risk merge candidate: codify repo-relative `.survey/<slug>/web-search-error.log` in survey guidance and explicitly disallow absolute host paths for new hourly artifacts.

## Curated Sources
- https://github.com/akillness/oh-my-skills/blob/main/.agent-skills/survey/SKILL.md (direct page retrieval)
- https://github.com/akillness/oh-my-skills/blob/main/.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md (direct page retrieval)
- https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#setting-an-output-parameter (direct page retrieval)
- https://www.gnu.org/software/coreutils/manual/html_node/Realpath-usage-examples.html (indexed snippet)
