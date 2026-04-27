# Context: oh-my-skills hourly survey loop

## Workflow Context
매 시간 실행되는 자동화 루프에서 5개 lane(agentic ai/web frontend/web backend/cli/game) 검색을 수행하고,
근거 링크와 메트릭을 아티팩트로 남긴 뒤 PR 기반 업데이트를 진행한다.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Maintainer | 스킬 품질 유지, 릴리즈 관리 | 고급 |
| Agent Operator | 자동 실행 루프 모니터링 | 중급 |
| Contributor | 신규 스킬 작성/개선 PR 제출 | 중급 |

## Current Workarounds
1. 수동 GitHub 검색 후 메모 정리 (재현성 낮음)
2. 단일 키워드 기반 임시 판단 (편향 위험)
3. PR 체크리스트를 사람 기억에 의존 (누락 가능)

## Adjacent Problems
- lane별 결과 편중(single-lane concentration) 시 추천 품질 저하
- low-fit 저장소가 추천으로 섞이는 문제
- provenance 레이블 누락 시 검증 실패

## User Voices
- "GitHub’s official command line tool" — https://github.com/cli/cli (indexed snippet)
- "Payload is the open-source, fullstack Next.js framework, giving you instant backend superpowers. Get a full TypeScript backend and admin panel instantly. Use Payload as a headless CMS or for building powerful applications." — https://github.com/payloadcms/payload (indexed snippet)
- "A cloud-native Go microservices framework with cli tool for productivity." — https://github.com/zeromicro/go-zero (indexed snippet)
- "🛠️ webpack-based tooling for Vue.js Development" — https://github.com/vuejs/vue-cli (indexed snippet)
- "CLI tool for Angular" — https://github.com/angular/angular-cli (indexed snippet)
