# Solution Landscape: oh-my-skills hourly survey run hourly-skill-candidates-20260425-112704

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| guarinogabriel/Mac-CLI | GitHub-native discovery + metadata gate | license/freshness/signal explicit | keyword-noise risk remains | lane=cli open source skill; license=MIT License; pushed_at=2026-02-28T02:21:48Z (direct page retrieval) |
| openakita/openakita | GitHub-native discovery + metadata gate | license/freshness/signal explicit | keyword-noise risk remains | lane=agentic ai skill; license=Apache License 2.0; pushed_at=2026-04-24T16:16:47Z (direct page retrieval) |
| sangrokjung/claude-forge | GitHub-native discovery + metadata gate | license/freshness/signal explicit | keyword-noise risk remains | lane=agentic ai skill; license=MIT License; pushed_at=2026-04-24T15:13:54Z (direct page retrieval) |
| tjboudreaux/cc-plugin-unity-gamedev | GitHub-native discovery + metadata gate | license/freshness/signal explicit | keyword-noise risk remains | lane=game development skill; license=MIT License; pushed_at=2026-02-06T04:09:12Z (direct page retrieval) |

## Categories
- 신규안 후보(미포함 스킬): metadata gate 통과 + 기존 `.agent-skills` 중복 없음 (direct page retrieval)
- 개선안 후보(기존 스킬 보강): 중복/근접 주제 존재하여 참조/가드레일 강화 가치가 높은 항목 (direct page retrieval)

## What People Actually Use
- GitHub-native retrieval (`gh search repos` + metadata fields) to collect structured candidate signals.
- Rule-based keep/drop gate for license, freshness (<24 months), archived status, and signal floor (stars>=3).
- Lane recovery query templates when raw count is sparse or noisy.

## Frequency Ranking
1. agentic ai skill — kept 6, status=pass (direct page retrieval)
2. game development skill — kept 1, status=pass (direct page retrieval)
3. cli open source skill — kept 1, status=degraded (direct page retrieval)
4. web frontend skill — kept 0, status=degraded (direct page retrieval)
5. web backend skill — kept 0, status=degraded (direct page retrieval)

## Key Gaps
- web frontend skill: degraded by license:3, stale:1, low-signal:3 (direct page retrieval)
- web backend skill: degraded by unknown (direct page retrieval)
- cli open source skill: degraded by unknown (direct page retrieval)

## Contradictions
- Broad discovery wants high recall, while recommendation-grade shortlist needs strict signal filtering; both must be kept simultaneously.
- Some high-star repos match "agentic" wording but are framework-scale products, requiring careful scope fit notes.

## Key Insight
A stable hourly loop benefits from preserving broad discovery evidence while promoting only recommendation-grade candidates with explicit metadata/risk context. This reduces churn and makes PR review deterministic.

## 신규 스킬 제안 TOP 3
1. guarinogabriel/Mac-CLI — stars=9062, license=MIT License, pushed_at=2026-02-28T02:21:48Z, expected_path=.agent-skills/mac-cli/SKILL.md (link: https://github.com/guarinogabriel/Mac-CLI, provenance: direct page retrieval)
2. openakita/openakita — stars=1668, license=Apache License 2.0, pushed_at=2026-04-24T16:16:47Z, expected_path=.agent-skills/openakita/SKILL.md (link: https://github.com/openakita/openakita, provenance: direct page retrieval)
3. sangrokjung/claude-forge — stars=661, license=MIT License, pushed_at=2026-04-24T15:13:54Z, expected_path=.agent-skills/claude-forge/SKILL.md (link: https://github.com/sangrokjung/claude-forge, provenance: direct page retrieval)

## 기존 스킬 개선 제안 TOP 3
1. iwe-org/skills — stars=7, license=MIT License, pushed_at=2026-04-06T01:48:47Z, expected_path=.agent-skills/skills/SKILL.md (link: https://github.com/iwe-org/skills, provenance: direct page retrieval)

## CLI 오픈소스 스포트라이트 (>=3)
- guarinogabriel/Mac-CLI | https://github.com/guarinogabriel/Mac-CLI | license=MIT License | idea: cli workflow references + guardrails (direct page retrieval)
