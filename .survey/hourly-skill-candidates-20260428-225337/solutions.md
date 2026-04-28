# Solutions
## Solution List
1. carry-forward 대상 PR 선정 전에 mergeability를 재조회(짧은 폴링)해 `UNKNOWN`을 그대로 신뢰하지 않는다.
2. 일정 횟수 이후에도 UNKNOWN이면 해당 PR은 보류하고 다음 PR 후보로 넘어간다.
3. 최종 보류 사유를 아티팩트에 기록해 감사 가능성을 유지한다.

## Categories
- reliability hardening
- unattended cron safety

## What People Actually Use
- indexed snippet: GitHub API/CLI 실무에서는 mergeability 계산 완료까지 재조회 패턴을 사용한다.

## Frequency Ranking
1) mergeability polling guard
2) deterministic fallback-to-next-PR

## Key Gaps
- 현재 규칙은 DIRTY 처리 분기는 명시적이지만, UNKNOWN 장기 지속 분기 기준이 약하다.

## Contradictions
- 빠른 머지 시도는 처리량을 높이지만, UNKNOWN 오판으로 실패/재시도를 유발한다.

## Key Insight
- 백로그가 높은 unattended 루프에서는 "UNKNOWN 안정화 폴링 + 다음 후보로 전환"이 가장 저위험/고효율 개선이다.
