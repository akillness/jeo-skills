# Solution Landscape: Hourly skill candidate maintenance

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| agentic ai skill | Keyword lane + relevance gates | deterministic audit trail | may degrade on sparse data | top candidate: AbdelhakRazi/flutter-bloc-clean-architecture-skill (indexed snippet) |
| web frontend skill | Keyword lane + relevance gates | deterministic audit trail | may degrade on sparse data | top candidate: none (indexed snippet) |
| web backend skill | Keyword lane + relevance gates | deterministic audit trail | may degrade on sparse data | top candidate: none (indexed snippet) |
| cli open source skill | Keyword lane + relevance gates | deterministic audit trail | may degrade on sparse data | top candidate: none (indexed snippet) |
| game development skill | Keyword lane + relevance gates | deterministic audit trail | may degrade on sparse data | top candidate: tjboudreaux/cc-plugin-unity-gamedev (indexed snippet) |

## Categories
- Discovery: five mandatory keyword lanes (indexed snippet)
- Quality gates: signal floor, freshness, license, archived, lane-intent overlap (indexed snippet)

## What People Actually Use
Maintainers rely on GitHub search lane evidence and validator-backed markdown artifacts for merge decisions. provenance: direct page retrieval

## Frequency Ranking
1. GitHub search lane evidence generation
2. Validator + diff checks
3. PR checks gate and blocker comment posting

## Key Gaps
- Some lanes may have low-fit or stale candidates requiring recovery queries. provenance: indexed snippet
- CI checks can be absent, blocking merge despite valid artifacts. provenance: direct page retrieval

## Contradictions
- High-star repos may still be low-fit to lane intent.
- Token overlap can pass while freshness/license fails.

## Key Insight
A reusable lane-health report script improves consistency between evidence.json metrics and reviewer-facing summaries, reducing manual interpretation error. provenance: indexed snippet
