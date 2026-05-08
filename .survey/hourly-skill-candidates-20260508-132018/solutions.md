# Solutions
## Solution List
1. Add reusable intent-fit audit helper for lane keyword overlap, negation guard, and personal-repo exclusion evidence.
2. Generate hourly artifacts with lane metrics and provenance labels.
## Categories
- Survey quality gates
- Recommendation-grade filtering
## What People Actually Use
- Indexed snippet discovery from gh search outputs.
- Direct page retrieval for metadata enrichment and audit trails.
## Frequency Ranking
1. False-positive low-fit hits from keyword overlap
2. Sparse/noisy lanes requiring deterministic degradation
3. CI checks missing on long-lived PR branch
## Key Gaps
- Existing lane scoring lacked standalone auditor output focused on intent-fit false positives.
## Contradictions
- Broad recall needs permissive discovery, but recommendation-grade keeps need strict fit constraints.
## Key Insight
- Separate discovery retention from recommendation promotion using explicit intent-fit audit artifacts.
- provenance: indexed snippet, direct page retrieval
