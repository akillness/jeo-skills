# Solution Landscape: oh-my-skills hourly candidate scan

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Aider-AI/aider | Agentic AI CLI pair-programming workflow | 43.8k stars, Apache-2.0, 비아카이브 | 자동 편집 범위 확장 리스크 | 신규안 `aider-cli-workflow` 반영 (direct page retrieval) |
| honojs/hono | Web backend(Edge/API) workflow | 30.1k stars, MIT, 최근 push 활발 | 기존 `api-design`/`backend-testing`과 경계 조정 필요 | 신규안 `hono-backend-workflow` 후보 (direct page retrieval) |
| godotengine/godot | OSS game dev production loop | 109.8k stars, MIT | 범위 과대 시 기존 game 스킬과 중복 위험 | 신규안 `godot-dev-workflow` 후보 (direct page retrieval) |
| storybookjs/storybook | Frontend component docs/testing | 89.7k stars, MIT | 프레임워크별 분기 과다 | `frontend-design-system` 개선안 근거 (direct page retrieval) |
| shadcn-ui/ui | Accessible UI composition references | 112.8k stars, MIT | React 중심 편향 | `design-system` 개선안 근거 (direct page retrieval) |
| addyosmani/agent-skills | Agentic skill 카탈로그 레퍼런스 | 21.7k stars, MIT | 무비판 이식 시 중복/충돌 | `skill-standardization` 개선안 근거 (direct page retrieval) |
| cli/cli | 범용 CLI OSS 표준 | 43.9k stars, MIT | GitHub 도메인 편향 | CLI 스포트라이트 (direct page retrieval) |
| charmbracelet/gum | Shell UX 중심 CLI toolkit | 23.4k stars, MIT | 에이전트 특화 아님 | CLI 스포트라이트 (direct page retrieval) |
| junegunn/fzf | Fuzzy finder CLI foundation | 79.7k stars, MIT | 과범용화 가능성 | CLI 스포트라이트 (direct page retrieval) |

## Categories
- Agentic AI skill
- Web frontend skill
- Web backend skill
- CLI open-source skill
- Game development skill

## What People Actually Use
- 검색 URL은 discovery 단계로 충분하지만, 채택 결정은 repo 메타데이터 재검증이 없으면 품질이 급락한다. (browser-rendered retrieval + direct page retrieval)
- frontend/backend/game 키워드는 노이즈가 높아 seed repo 중심의 수동 필터링이 사실상 필수다. (browser-rendered retrieval)
- CLI 후보는 에이전트 특화형(Aider)과 범용 기반형(cli/cli, gum, fzf)을 분리해 제안할 때 중복 리스크가 낮다. (direct page retrieval)

## Frequency Ranking
1. Agentic + CLI 운영형
2. Frontend design-system 강화형
3. Backend workflow 강화형
4. Game development workflow

## Key Gaps
- Aider 중심 실전 runbook 부재(이번 PR에서 신규 스킬로 보강)
- Hono 기반 backend workflow 부재
- Godot 중심 dev loop 부재

## Contradictions
- 검색 결과 상위 노출과 실제 운영 신뢰도(라이선스/활동성)는 일치하지 않는다.
- 대형 스킬 카탈로그는 참고 가치가 높지만 그대로 가져오면 기존 스킬 경계가 무너진다.

## Key Insight
시간당 자동화에서는 `키워드 적합성`보다 `라이선스 + 최근 활동 + 기존 스킬 경계 충돌 여부`를 동시에 통과시키는 필터가 재현성을 가장 잘 보장한다.

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
- cli/cli: https://github.com/cli/cli (direct page retrieval)
- gum: https://github.com/charmbracelet/gum (direct page retrieval)
- fzf: https://github.com/junegunn/fzf (direct page retrieval)
