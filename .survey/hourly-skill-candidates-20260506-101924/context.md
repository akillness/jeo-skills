# Context: Oh-My-Skills Hourly Survey

## Workflow Context
매 1시간 실행에서 5개 lane을 고정 조사하고, artifact/PR/merge 의사결정까지 연결한다. 품질 기준은 provenance, freshness, license, signal-floor, intent overlap이다. (direct page retrieval + indexed snippet)

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | 품질 게이트/머지 판단 | advanced |
| Automation Operator | 실패 복구/재실행 | intermediate |

## Current Workarounds
1. 제안-only 리포트로 종료
2. lane 편중 상태를 수동 확인
3. checks 부재 시 근거 없이 보류

## Adjacent Problems
- 키워드 노이즈로 low-fit 후보 과다 유입
- stale 저장소 추천 오탐
- license 메타데이터 형태 차이

## User Voices
- "제안-only로 끝내지 말고 실제 반영까지" — run policy
- "근거 링크를 모두 남겨라" — run policy

Provenance: indexed snippet
