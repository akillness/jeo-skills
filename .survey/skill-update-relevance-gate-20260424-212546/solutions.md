# Solution Landscape: survey skill update relevance gate

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| bytedance/deer-flow | 대형 agentic OSS를 기준점으로 채택 | 활발한 업데이트, 명확한 설명, MIT | 범용성이 커서 스킬 단위 적용 시 과범위 위험 | https://github.com/bytedance/deer-flow |
| github/awesome-copilot | 큐레이션 저장소를 후보 소스로 사용 | 커뮤니티 검증, 문서화 우수 | 직접 실행 가능한 스킬이 아닌 큐레이션 중심 | https://github.com/github/awesome-copilot |
| jeremylongshore/claude-code-plugins-plus-skills | CLI/스킬 마켓 사례를 CLI 스포트라이트로 활용 | 오픈소스/규모/명시적 도메인 | 생태계 편향 가능성 | https://github.com/jeremylongshore/claude-code-plugins-plus-skills |
| andreasbm/web-skills | 웹 역량 맵핑 참고 | 구조화된 분류 | 최근 업데이트 약함(2024), NOASSERTION 라이선스 | https://github.com/andreasbm/web-skills |
| Sfedfcv/redesigned-pancake | 키워드 매칭 노이즈 사례 | 노이즈 위험을 명확히 보여줌 | 설명/내용 무관, 오래됨 | https://github.com/Sfedfcv/redesigned-pancake |

## Categories
- 고신뢰 후보: 최근 업데이트 + 명확한 설명 + OSI 라이선스
- 조건부 후보: 도메인은 맞지만 유지보수/라이선스 정보가 약함
- 제외 후보: 키워드만 매칭되고 실제 도메인이 무관하거나 스팸성

## What People Actually Use
- 정기 조사 루프에서는 결국 `스타 수 + 최근 업데이트 + 라이선스 + 사람 리뷰` 조합을 쓴다.
- 자동화만으로는 무관 후보 제거가 완전하지 않아 수동 필터가 남는다.

## Frequency Ranking
1. 스타 기반 1차 후보 추출
2. 라이선스/최근 업데이트/아카이브 상태 재검증
3. 무관 후보 수동 제거

## Key Gaps
- `survey` 본문에 검색결과 관련성 점수화/탈락 기준이 명시적으로 약함
- 무관 후보 예시와 즉시 제외 규칙(negative signals) 템플릿이 없음
- 메타데이터(license/pushed_at/archived) 기준이 스킬에 명시적으로 고정되지 않음

## Contradictions
- "검색 기반"을 요구하지만, 실제로는 수동 선별 없이는 품질이 유지되지 않음
- 별점이 높아도 스킬 개선과 직접 관련이 낮은 저장소가 존재함

## Key Insight
`survey` 스킬에 **검색 결과 관련성 게이트(negative signals + 메타데이터 임계치 + 탈락 규칙)**를 명시하면, 같은 검색 기반이라도 제안 품질이 안정화된다.