## Solution List
1. Add an explicit lane-quality threshold rule to survey references: each lane should report `lane_status=pass|degraded` based on keep-candidate count after relevance gate.
2. Require degraded lanes to include cause taxonomy (`license`, `stale`, `low-fit`, `archived`) in markdown, not only JSON.
3. Keep recovery-query provenance inline so reviewers can trace why recovery was triggered.

## Categories
- Survey process hardening
- Evidence transparency
- Reviewer ergonomics

## What People Actually Use
- web-backend-skill: kept=6; top: [guy-hartstein/company-research-agent](https://github.com/guy-hartstein/company-research-agent), [dev-rashedin/servest](https://github.com/dev-rashedin/servest), [gowebly/gowebly](https://github.com/gowebly/gowebly)
- cli-open-source-skill: kept=6; top: [googleworkspace/cli](https://github.com/googleworkspace/cli), [philippta/flyscrape](https://github.com/philippta/flyscrape), [seo-skills/seo-audit-skill](https://github.com/seo-skills/seo-audit-skill)
- agentic-ai-skill: kept=5; top: [AbdelhakRazi/flutter-bloc-clean-architecture-skill](https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill), [iwe-org/skills](https://github.com/iwe-org/skills), [Ap6pack/malwar](https://github.com/Ap6pack/malwar)
- web-frontend-skill: kept=0; top: none
- game-development-skill: kept=0; top: none

## Frequency Ranking
1. web-backend-skill (6)
2. cli-open-source-skill (6)
3. agentic-ai-skill (5)
4. web-frontend-skill (0)
5. game-development-skill (0)

## Key Gaps
- Lane quality status is implicit; no single reference doc defines pass/degraded threshold language.
- Degraded-cause reporting is inconsistent across runs.

## Contradictions
- Broad recall from keyword sweeps can conflict with recommendation precision unless lane-level quality output is standardized.

## Key Insight
- The safest low-risk improvement this hour is to codify lane status/cause reporting in survey reference docs and skill text without changing validator behavior.

Provenance: browser-rendered retrieval; direct page retrieval.
