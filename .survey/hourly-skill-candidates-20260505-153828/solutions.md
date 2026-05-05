# Solution Landscape: hourly skill candidate sweep

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| AbdelhakRazi/flutter-bloc-clean-architecture-skill | Agentic AI lane 후보 | stars=16 | freshness/license gate 필요 | https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill (indexed snippet) |
| iwe-org/skills | Agentic AI lane 후보 | stars=7 | freshness/license gate 필요 | https://github.com/iwe-org/skills (indexed snippet) |
| amrrs/cinematic-webscroll-frontend-skill | Web Frontend lane 후보 | stars=12 | freshness/license gate 필요 | https://github.com/amrrs/cinematic-webscroll-frontend-skill (indexed snippet) |
| (없음:Web Backend) | recovery 필요 | raw=1 | degraded=low-fit | lane evidence 참조 (feed recovery) |
| nexu-io/open-design | CLI OSS lane 후보 | stars=26698 | freshness/license gate 필요 | https://github.com/nexu-io/open-design (indexed snippet) |
| rohithnafeel/My-CS-Projects | Game Dev lane 후보 | stars=20 | freshness/license gate 필요 | https://github.com/rohithnafeel/My-CS-Projects (indexed snippet) |
| inchussa/Virtual-Pet-Simulator | Game Dev lane 후보 | stars=25 | freshness/license gate 필요 | https://github.com/inchussa/Virtual-Pet-Simulator (indexed snippet) |

## Categories
- 추천-grade keeps
- raw discovery only
- degraded lane recovery 대상

## What People Actually Use
주로 GitHub 검색 기반 후보 수집 후 metadata gate(license/freshness/signal)를 적용한다. (provenance: indexed snippet)

## Frequency Ranking
1. Agentic AI (4)
2. Game Dev (4)
3. Web Frontend (1)
4. CLI OSS (1)
5. Web Backend (0)

## Key Gaps
- Web Backend: low-fit (provenance: feed recovery)

## Contradictions
- raw 결과 수는 충분하지만 keep가 0인 lane가 발생한다. (provenance: indexed snippet)

## Key Insight
lane별 상태를 pass/degraded로 명시하고 degraded_causes를 정형화하면, 다음 런에서 복구 전략이 자동화 가능해진다. (provenance: direct page retrieval)
