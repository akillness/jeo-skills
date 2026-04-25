## Settings
- Survey artifact 생성은 `.survey/{slug}` 계약을 유지한다.
- Validator는 `--platform-topic --require-provenance`를 기본 게이트로 사용한다.

## Rules
- 5개 키워드 lane을 매 실행마다 모두 수행한다.
- kept 후보는 license/pushed_at/archived/fit_rationale 메타데이터를 필수 포함한다.
- lane_status는 정량(metric) 근거와 함께 문서화한다. (direct page retrieval)

## Hooks
- 실행 후 RTK 요약, Graphify 정제, Obsidian/LLM-Wiki 반영 단계를 후속 훅으로 수행한다.

## Platform Gaps
- 웹 검색 API 장애 시 GitHub-native 검색으로 대체해야 하며 품질 편차가 커질 수 있다.
- Obsidian CLI 미설치/URI 실패 환경에서는 파일 직접 쓰기 fallback 필요.
