# Platform Map
## Settings
- GitHub 검색: `gh search repos` + 지원 JSON 필드(`fullName`, `license`, `stargazersCount`)만 사용
- 검증: `python3 .agent-skills/survey/scripts/validate_survey_artifacts.py .survey/{slug} --platform-topic --require-provenance`

## Rules
- 추천 후보는 license/freshness/signal floor 통과 시만 keep
- recovery 수행 후 lane metric 재계산 및 무결성 검사(`kept_count <= raw_count`) 필수
- provenance 라벨은 validator 허용 라벨만 사용

## Hooks
- lane sparse/noisy trigger 시 stage recovery 1회
- Graphify query 실패 시 fallback graph artifact 생성

## Platform Gaps
- 일부 키워드 lane은 여전히 저신호/noisy 가능성 존재
- GitHub checks 미구성 저장소의 자동 merge gate는 운영 정책 명시 필요
