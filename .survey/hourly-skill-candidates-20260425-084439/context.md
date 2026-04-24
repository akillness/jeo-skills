# Context: oh-my-skills hourly survey

## Workflow Context
- 본 런은 `repo-maintenance` 모드로 5개 키워드 패밀리를 강제 실행했다.
- 각 lane에 대해 메타데이터 게이트(license/pushed_at/archived/fit)를 적용했다.
- 근거 수집 방식은 `direct page retrieval`(GitHub search API)로 통일했다.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | 후보 채택/우선순위 결정, PR merge | advanced |
| Reviewer | 근거 링크/리스크 검토, 품질 게이트 확인 | advanced |
| Automation Operator | 크론 런 안정성 모니터링 | intermediate |

## Current Workarounds
1. 키워드 검색 결과를 수동으로 훑어보며 후보를 선별.
2. 라이선스/최근 업데이트 여부를 PR 단계에서 뒤늦게 확인.
3. lane별 결과 품질 편차를 사람이 사후 보정.

## Adjacent Problems
- 동일/유사 후보가 반복 제안되어 중복 검토 비용 발생.
- 노이즈가 많은 lane에서 근거 신뢰도 저하.
- CLI lane 3개 이상 확보 실패 시 제안 품질이 떨어짐.

## User Voices
- "시간마다 돌아도 링크 근거와 검증 결과가 일관돼야 한다." — 운영 요구사항 (direct page retrieval)
- "검증 실패면 머지하지 말고 원인/대응안을 남겨야 한다." — 운영 규칙 (direct page retrieval)

## Lane Status
- agentic ai skill → lane_status: pass (discovery=25) | [AbdelhakRazi/flutter-bloc-clean-architecture-skill](https://github.com/AbdelhakRazi/flutter-bloc-clean-architecture-skill); [VoDaiLocz/Enhance-Prompt](https://github.com/VoDaiLocz/Enhance-Prompt) | provenance: direct page retrieval
- web frontend skill → lane_status: degraded (discovery=4) | 유의미 keep 없음 | provenance: direct page retrieval
- web backend skill → lane_status: degraded (discovery=0) | 유의미 keep 없음 | provenance: direct page retrieval
- cli open source skill → lane_status: pass (discovery=5) | [guarinogabriel/Mac-CLI](https://github.com/guarinogabriel/Mac-CLI); [abhixdd/ghgrab](https://github.com/abhixdd/ghgrab) | provenance: direct page retrieval
- game development skill → lane_status: pass (discovery=25) | [tjboudreaux/cc-plugin-unity-gamedev](https://github.com/tjboudreaux/cc-plugin-unity-gamedev); [sparkade-labs/sparkade-skills](https://github.com/sparkade-labs/sparkade-skills) | provenance: direct page retrieval
