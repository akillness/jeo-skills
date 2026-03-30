# Context

## Workflow Context

- 현재 `README.md` / `README.ko.md` 에는 Harness OSS 추천 섹션만 있다.
- `docs/harness/README.md` / `README.ko.md` 는 외부 OSS 비교 문서다.
- 실제 `.agent-skills/harness/` 디렉터리는 아직 없다.

## Affected Users

- 하네스 기반으로 에이전트 팀과 스킬을 설계하려는 사용자
- 여러 플랫폼 간 하네스 개념을 번역해야 하는 유지보수자
- 신규 스킬 카탈로그를 보고 바로 설치/사용하려는 사용자

## Current Workarounds

- upstream `revfactory/harness` README와 `skills/harness/SKILL.md` 를 직접 읽는다
- local `docs/harness` 를 참고해 수동으로 개념만 가져간다
- 실제 설치 가능한 skill로는 연결되지 않는다

## Adjacent Problems

- README의 skill count 표기가 실제 디렉터리 수와 강하게 연결된다
- `.agent-skills/skills.json` 카탈로그와 문서가 함께 갱신돼야 한다
- `playwriter` 기반 브라우저 검토를 요구받았지만 현재 환경에는 CLI가 없다

## User Voices

- 요청: `$ralph $survey ... revfactory/harness ... $playwriter ... $skill-standardization 참고해서 reference, script를 이용해서 스킬로 작성하고 추가`
- 운영 판단: playwriter CLI unavailable 이므로 GitHub raw/API 원문 조회로 대체
