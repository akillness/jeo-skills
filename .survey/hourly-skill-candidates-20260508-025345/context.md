# Context: Oh-My-Skills Hourly Survey

## Workflow Context
Hourly automation runs lane-based GitHub discovery, validates artifacts, and packages PR-ready evidence with strict guardrails.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | Review survey artifacts and merges | Advanced |
| Contributor | Improve survey references and gates | Intermediate |

## Current Workarounds
1. Manually inspect noisy search results and infer fit.
2. Re-run queries when a lane is sparse.

## Adjacent Problems
- CI/check pipelines missing on carry-forward branches can block merge.
- License/freshness metadata shape drift can misclassify candidates.

## User Voices
- "Need survey-first evidence with links every run." — direct page retrieval
- "Do not open extra PR while an existing one is still open." — indexed snippet
