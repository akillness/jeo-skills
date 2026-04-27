# Solution Landscape: hourly candidate quality ratchet

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Open-license allowlist gate | Require recommendation-grade keeps to have SPDX in maintained allowlist (or explicit exception note) | Reduces legal/reuse ambiguity; deterministic | May reduce candidate count in sparse lanes | provenance: direct page retrieval |
| Keep `license` degraded-cause explicit | Mark lane as degraded when recommendations rely on non-allowlist licenses | Surfaces review risk clearly | Needs concise taxonomy discipline | provenance: direct page retrieval |
| Preserve discovery but demote uncertain licenses | Keep raw evidence, but do not promote uncertain-license repos to TOP keeps | Maintains recall and traceability | More reviewer text needed | provenance: indexed snippet |

## Categories
- Recommendation-grade quality gate hardening
- License provenance hygiene
- Cron-review observability

## What People Actually Use
This run observed recommendation candidates with non-allowlist license identifiers despite otherwise strong stars/freshness. A practical compromise is to keep them in discovery evidence but demote from recommendation-grade keeps unless an exception rationale is documented.

## Frequency Ranking
1. Open-license allowlist gate + explicit exceptions
2. License degraded-cause reporting in lane status
3. Discovery-retention with recommendation demotion

## Key Gaps
- Current guidance can be hardened preemptively by codifying SPDX allowlist+exception language even when this run has no failing examples.
- Lane status can pass without exposing license ambiguity risk.

## Contradictions
- Broader keep criteria improve recommendation volume, but can reduce legal/reuse clarity.

## Key Insight
Low-risk merge candidate: harden survey repo-maintenance guidance so recommendation-grade keeps require allowlisted open SPDX (or explicit exception note), while preserving raw discovery evidence for recall.

## Curated Sources
- https://github.com/akillness/oh-my-skills/blob/main/.agent-skills/survey/SKILL.md (direct page retrieval)
- https://github.com/akillness/oh-my-skills/blob/main/.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md (direct page retrieval)
- https://docs.github.com/en/rest/licenses/licenses#get-the-license-for-a-repository (direct page retrieval)
- https://docs.github.com/en/rest/repos/repos#get-a-repository (direct page retrieval)
- https://spdx.org/licenses/ (indexed snippet)

## Non-Allowlist Kept Examples
- none in this run (allowlist satisfied)
