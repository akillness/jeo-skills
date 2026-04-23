# Solution Landscape: oh-my-skills hourly candidate scan

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Aider-AI/aider | Agentic AI CLI pair-programming workflow | 43k+ stars, Apache-2.0, non-archived | 도구 옵션 변화가 빨라 문서 drift 위험 | 신규안 `aider-cli-workflow` 후보 (direct page retrieval) |
| honojs/hono | Web backend(Edge/API) implementation workflow | 30k+ stars, MIT, 최근 활동 활발 | 기존 `backend-testing`/`api-design`과 경계 설계 필요 | 신규안 `hono-backend-workflow` 후보 (direct page retrieval) |
| godotengine/godot | OSS game development production loop | 109k+ stars, MIT, 멀티플랫폼 | 범위 과대 시 스킬 비대화 위험 | 신규안 `godot-dev-workflow` 후보 (direct page retrieval) |
| storybookjs/storybook | Frontend component docs/testing workflow | 89k+ stars, MIT, 업계 표준 | 프레임워크별 세부가 커서 스킬 경량화 필요 | 개선안 `design-system`/`frontend-design-system` 근거 (direct page retrieval) |
| shadcn-ui/ui | Accessible UI composition references | 112k+ stars, MIT, 구현 예시 풍부 | React 중심 편향 | 개선안 `design-system` 계열 근거 (direct page retrieval) |
| addyosmani/agent-skills | Agentic skill structuring reference set | 21k+ stars, MIT, 유지 활발 | 메타 카탈로그 직접 이식 시 중복 위험 | 개선안 `skill-standardization`/`agentation` 근거 (direct page retrieval) |
| googleworkspace/cli | CLI OSS productivity automation | 25k+ stars, Apache-2.0, agent skill 친화 | 도메인 범위가 넓어 스킬 초점 유지 필요 | CLI 스포트라이트 후보 (direct page retrieval) |
| charmbracelet/gum | Shell UX-focused CLI toolkit | 23k+ stars, MIT, 범용 CLI UX 개선 | 에이전트 특화는 아님 | CLI 스포트라이트 후보 (direct page retrieval) |
| junegunn/fzf | Fuzzy finder CLI foundation | 79k+ stars, MIT, 생태계 성숙 | 스킬화 시 과범용화 위험 | CLI 스포트라이트 후보 (direct page retrieval) |
| duthaho/claudekit | Claude Code-focused CLI toolkit | MIT, 최근 활동 존재 | 87 stars로 신호 약함(실험적) | 개선안 참고 후보, risk 표기 (direct page retrieval) |

## Categories
- Agentic AI skill
- Web frontend skill
- Web backend skill
- CLI open-source skill
- Game development skill

## What People Actually Use
- 키워드 검색 결과는 노이즈가 크며, 실무 채택 가능한 후보는 `명시 라이선스 + 최근 push + non-archived` 필터를 동시에 통과한다. (direct page retrieval)
- frontend/backend/game 키워드는 일반 튜토리얼/저신뢰 저장소 비중이 커서 seed repo 기반 정제 단계가 사실상 필요하다. (browser-rendered retrieval + direct page retrieval)
- CLI OSS는 매 실행 3개 이상 채우는 것은 가능하나, 에이전트-특화 vs 범용-CLI를 구분해 제안해야 중복/충돌 리스크가 낮다. (direct page retrieval)

## Frequency Ranking
1. Agentic/CLI 운영형 후보
2. Frontend component/design-system 보강 후보
3. Backend workflow 보강 후보
4. Game development workflow 후보

## Key Gaps
- Aider 중심 실무 CLI pair-programming runbook 부재
- Hono 기반 웹 백엔드 워크플로우 스킬 부재
- Godot 개발 루프(프로토타입→디버깅→빌드/배포) 스킬 부재

## Contradictions
- 검색 상위권이라도 라이선스 불명/활동성 낮은 저장소가 포함된다.
- 대형 메타 카탈로그는 참고 가치가 높지만, 기존 스킬 구조에 무비판 이식 시 충돌이 발생한다.

## Key Insight
`키워드 적합성`보다 `라이선스 명확성 + 활동성 + 기존 스킬 공백 매칭`의 3요건 동시 충족이 시간당 자동화에서 가장 재현 가능한 품질 게이트다.

## Curated Sources
- GitHub search (agentic): https://github.com/search?q=agentic+ai+skill&type=repositories (browser-rendered retrieval)
- GitHub search (frontend): https://github.com/search?q=web+frontend+skill&type=repositories (browser-rendered retrieval)
- GitHub search (backend): https://github.com/search?q=web+backend+skill&type=repositories (browser-rendered retrieval)
- GitHub search (cli): https://github.com/search?q=cli+open+source+skill&type=repositories (browser-rendered retrieval)
- GitHub search (game): https://github.com/search?q=game+development+skill&type=repositories (browser-rendered retrieval)
- Aider: https://github.com/Aider-AI/aider (direct page retrieval)
- Hono: https://github.com/honojs/hono (direct page retrieval)
- Godot: https://github.com/godotengine/godot (direct page retrieval)
- Storybook: https://github.com/storybookjs/storybook (direct page retrieval)
- shadcn/ui: https://github.com/shadcn-ui/ui (direct page retrieval)
- addyosmani/agent-skills: https://github.com/addyosmani/agent-skills (direct page retrieval)
- googleworkspace/cli: https://github.com/googleworkspace/cli (direct page retrieval)
- charmbracelet/gum: https://github.com/charmbracelet/gum (direct page retrieval)
- junegunn/fzf: https://github.com/junegunn/fzf (direct page retrieval)
- duthaho/claudekit: https://github.com/duthaho/claudekit (direct page retrieval, thin evidence)
