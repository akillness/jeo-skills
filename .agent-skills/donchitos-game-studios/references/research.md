# 검수 재해석과 개선 결론

## 결론

**점수 올리기 위한 78개 일괄 개작은 하지 않는다.** 이 저장소는 독립적인 스킬
모음이 아니라 설정·훅·스크립트·레퍼런스가 결합된 게임 프로젝트 템플릿이다.
`jeo-skills`에는 원본을 복제한 78개 전역 스킬 대신, 이름이 명확한 운영 스킬
하나와 소스 핀·오프라인 점검·검증 경계·작업별 라우팅을 추가한다.

이번 변경은 운영 패키지의 구현이다. 업스트림 78개 파일 수정이나 실제 게임 제작,
보안 인증 또는 모델 실행 성능 향상을 주장하지 않는다. 조사는 이 세션에서 직접
수행했다. 서브에이전트 토론이나 유료 모델 평가는 수행하지 않았다.

## 조사 방법과 근거의 범위

- 대상 원본: `donchitos/claude-code-game-studios`, 커밋
  `abc0de79d6ceb0b5d7aa693945849b3937afbe6a`에 고정한 로컬 클론.
- 평가기: NVIDIA/SkillEvaluator 0.8.0, 커밋
  `12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2`에서 설치한 패키지.
- 기존 `quality-check` JSON 78개와 실행 기록을 다시 집계했다. 정적 결과 요약을
  `quality-baseline.json`으로 보존했다. 원본 보고서의 로컬 경로나 세션 내용은
  공개 요약에 넣지 않았다.
- Agent Skills 공식 specification, scripts 및 evaluating-skills 문서를 HTTPS로
  직접 조회하고 원본 구현·README·설정·별칭·테스트 설명과 대조했다.
- Claude Code 공식 skills/hooks 문서 조회는 이 환경에서 실패했다. 따라서
  Claude 전용 필드/훅의 의미는 이 스냅샷의 실제 파일 및 업스트림 설명을 근거로
  한정한다. 다른 호스트에서 동등하게 작동한다는 주장은 하지 않는다.
- 읽기 전용 조사에서 업스트림 스크립트·훅·에이전트를 실행하지 않았다.

## 새 패키지 이름에 적용한 실제 검증 피드백

첫 운영 패키지를 원본과 같은 `claude-code-game-studios`로 명명했을 때,
NVIDIA quality-check는 점수 80.5와 별개로 예약어 `claude`를 이름에 포함했다는
오류로 실패했다. 점수 임계값이나 검사 정책을 낮추지 않고, 로컬 패키지 이름을
`donchitos-game-studios`로 바꿨다. 원본 저장소 이름과 URL은 변경하지 않았다.
이 예약어 규칙은 조회한 Agent Skills specification의 이름 제약에는 없지만,
호스트/검증기 호환성을 위해 로컬 이름을 분리한 보수적인 선택이다.
스크립트 표에는 실제 Python CLI와 플래그를 문서화하고 존재하지 않는 실행 API를
만들지 않았다. 재검사 결과와 남은 휴리스틱 경고는 검증 기록에 별도로 남긴다.

## 1. 정적 검수 결과: 통과와 미완료를 함께 보존

| 지표 | 재집계 결과 |
| --- | --- |
| 검사한 SKILL.md | 78 |
| 기본 70점 기준 통과 | 78 |
| 평균 / 중앙값 | 86.54615384615384 / 87.2 |
| 최저 / 최고 | 75.2 / 89.8 |
| publication | 전부 `incomplete` |
| 실제 보안 스캔 / 중복 분석 / paired Skill Lift | 수행하지 않음 |

최저는 `help` 75.2, `changelog`·`settings` 각 77.8이다. 이어
`map-systems`·`team-release`·`team-ui`가 각 83.2다. 이 순위만으로
실제 수정 우선순위를 정하면 잘못된 결론을 낸다.

**반례:** 세 최저점 파일은 실제로 `/next-step`, `/write-changelog`,
`/project-settings`에 인수를 그대로 전달하는 의도적인 호환 별칭이다.
`disable-model-invocation: true`와 제한된 `Skill(...)` 도구가 있다.
짧다고 절차·예시·문제 해결을 중복 추가하면 단일 원본 원칙을 깨고, 별칭이
실행하지 않아야 할 일을 실행하도록 유도할 수 있다. README도 75개 스킬과
이전 이름 3개를 구분한다. [S4–S7]

## 2. 표준과 평가기 휴리스틱은 다르다

Agent Skills specification에서 필수 frontmatter는 `name`, `description`이다.
`license`, `compatibility`, `metadata`, `allowed-tools`는 선택 필드이며,
`metadata` 값은 문자열 맵이다. `author`·`version`은 metadata 예시이지 필수
요건이 아니다. 본문에 강제된 `## Purpose` 등의 제목 형식도 없다. [S1]

반면 평가기의 `_check_spec_fields`는 최상위 `version`, `metadata.author`,
`metadata.tags` 부재를 각각 감점한다. `_check_discoverability`는 본문에
정확한 `## Purpose` 문자열이 없으면 감점하고, 짧은 이름에도 감점한다.
영어 `use/when/for/helps/allows` 키워드는 사용 시점 판단에 사용된다. [S8]

따라서 78개 모두에 발생한 위 세 메타데이터 경고와 전제조건·제약·문제 해결
경고는 **수동 검토 후보**이며 표준 위반 판정이 아니다. `## Purpose` 부재
76건도 고정 제목 탐지 결과다. 사용 시점 경고 43건과 예시 부재 24건 역시
실제 레퍼런스와 워크플로우를 읽고 분류해야 한다.

`jeo-skills`의 분류·태그·관계는 `.agent-skills/skills.json` 한 곳에만 둔다.
`SKILL.md`에 `metadata.tags`를 중복 추가하거나 표준 밖의 최상위 `version`을
추가해 점수를 맞추지 않는다. 패키지 버전은 문자열 `metadata.version`으로
기록한다. 레퍼런스 JSON도 기존 저장소의 소스 매니페스트 관례를 유지하며,
평가기의 디렉터리 선호를 맞추려고 근거를 숨기거나 삭제하지 않는다.

## 3. 실제로 우선할 개선

| 우선순위 | 결정 | 근거 / 검증 방법 | 이번 범위 |
| --- | --- | --- | --- |
| P0 | 78개 전역 설치 대신 명명된 프로젝트 운영 라우터 하나 | 상대 경로 훅·scripts·references·project.yaml 의존성이 보존되는지 검토 | 구현 |
| P0 | 설정 활성화와 소스 검사 분리 | `.claude/settings.json`의 hooks/permissions를 열기 전에 검토, 헬퍼는 subprocess/네트워크 불사용 | 구현 및 오프라인 회귀 검사 |
| P0 | 버전·출처·한계 명시 | 12개 선택 공개 파일 SHA-256과 핀, 선택 파일 일치와 전체 HEAD 검증 구별 | 구현 |
| P1 | 별칭을 정규 워크플로우와 분리 | 기존 세 wrapper와 인수 전달 보존, 정규 이름으로 라우팅 | 구현; 업스트림 수정 없음 |
| P1 | 사용 시점·near-miss·실패 경로를 구체화 | Unity brownfield / prototype / generic team / 미완료 점수 등 관찰 가능한 시나리오 | 가이드·평가 케이스 작성 |
| P1 | 공통 요구사항을 한 곳에 정리하고 필요한 레퍼런스로 연결 | Python/Bash/브라우저/Node/엔진별 의존성과 NOT ASSESSED 상태 | 구현 |
| P1 | 기존 upstream 테스트 체계 재사용 | `/skill-test` 4모드, `studio-tests/catalog.yaml`·루브릭·spec 보존 | 운영 지침; 모델 평가 미실행 |
| P2 | 43건 설명·24건 예시 경고의 실제 오류만 수정 | 정규 스킬별 old/new paired 평가, 성공률·오라우팅·비용·위반 비교 | 후속 업스트림 작업 |
| P2 | 원본 전체 보안·중복·효과 평가 | Tier 1/2/3별 승인·환경·송신 범위·샌드박스·비용 고정 | 별도 승인 후 |

새 가이드는 일반적인 게임 제작 계획을 위한 `bmad-gds`나
`awesome-gamedev-agent-skills`의 크로스엔진 컬렉션 선택을 대체하지 않는다.
이번 패키지 설치는 원본 템플릿 설치, 모델 접근, 훅 실행을 포함하지 않는다.

## 4. 원본이 이미 해결한 것을 다시 만들지 않는다

- `/prototype`은 질문 → 승인할 brief → 브라우저 빌드 → self-check → 사람의
  플레이/PROCEED·PIVOT·KILL을 구분하고, `NOT ASSESSED` 경로를 이미 가진다.
  브라우저 smoke만으로 사람이 플레이했다고 보고해서는 안 된다. [S9]
- `modes.rigor=minimal`이 기본이며 standard/full은 요구에 따라 높인다.
  모든 작업에 49개 에이전트나 full gate를 강제하는 것은 개선이 아니다. [S4]
- `studio-tests/`는 템플릿 일부이며 75개 정규 스킬과 49개 에이전트의
  행동 spec/루브릭/카탈로그를 제공한다. 제거하면 spec/category 모드가
  깨진다. `skill-lint.sh`는 관측 TSV만 내고 최종 판정은 하지 않는다. [S10–S11]
- 원본 README는 엔진 경로의 실제 효과가 아직 입증되지 않았다고 명시한다.
  프레임워크 자체 점검 통과를 게임 제작 성과나 런타임 엔진 검증으로 확대하지
  않는다. [S4]

## 5. 후속 효과 평가의 채택 기준

정적 패키지 검증과 모델 기반 행동 개선은 다른 증거다. 정적 검사 통과만으로
Harness² method의 행동 개선 후보를 채택했다고 주장하지 않는다.

1. 기존 정규 스킬을 고정한 baseline과 변경 후보를 분리한다. 모델·도구·권한·
   네트워크·엔진 버전·입력·시드를 동일하게 두고, 매 실행은 새 컨텍스트로 한다.
2. 실제 요청, near-miss, 잘못된/누락된 파일, 사용할 수 없는 브라우저,
   brownfield 충돌, 별칭 인수 전달을 포함한다. 비공개 자료 송신과 유료 모델은
   사전 승인한 범위에서만 수행한다.
3. 산출물 존재·브리프 승인·실행 증거·기존 파일 보존·미평가 표시를 검사한다.
   오라우팅/의도치 않은 쓰기와 토큰/시간을 성공률과 함께 기록한다.
4. 사람의 플레이와 블라인드 산출물 비교를 포함하고, 성공한 예시만 고르지
   않는다. 두 arm 중 하나라도 실행되지 않으면 lift는 미측정이다. [S3]
5. 유의미한 개선이 관찰된 후보만 별도 업스트림 패치로 제안한다. 지금 작성한
   `evals/evals.json`은 실행 결과가 아니라 향후 검증을 위한 케이스다.

## 1차 자료

- **S1** — [Agent Skills specification](https://agentskills.io/specification),
  [조회한 Markdown 표면](https://agentskills.io/specification.md): required fields,
  optional metadata, progressive disclosure와 상대 파일 경로.
- **S2** — [Using scripts](https://agentskills.io/skill-creation/using-scripts.md):
  의존성 명시, 고정 버전, 실행 경로와 에이전트용 스크립트 인터페이스.
- **S3** — [Evaluating skills](https://agentskills.io/skill-creation/evaluating-skills.md):
  with/without 또는 old/new 비교, 새 컨텍스트, assertions와 사람 검토.
- **S4** — [고정 README](https://github.com/donchitos/claude-code-game-studios/blob/abc0de79d6ceb0b5d7aa693945849b3937afbe6a/README.md).
- **S5** — [help 별칭](https://github.com/donchitos/claude-code-game-studios/blob/abc0de79d6ceb0b5d7aa693945849b3937afbe6a/.claude/skills/help/SKILL.md).
- **S6** — [settings 별칭](https://github.com/donchitos/claude-code-game-studios/blob/abc0de79d6ceb0b5d7aa693945849b3937afbe6a/.claude/skills/settings/SKILL.md).
- **S7** — [changelog 별칭](https://github.com/donchitos/claude-code-game-studios/blob/abc0de79d6ceb0b5d7aa693945849b3937afbe6a/.claude/skills/changelog/SKILL.md).
- **S8** — [평가기 quality_score.py](https://github.com/NVIDIA/SkillEvaluator/blob/12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2/src/skillevaluator/validators/quality_score.py),
  설치본의 `_check_spec_fields`, `_check_discoverability`와 대조.
- **S9** — [prototype](https://github.com/donchitos/claude-code-game-studios/blob/abc0de79d6ceb0b5d7aa693945849b3937afbe6a/.claude/skills/prototype/SKILL.md).
- **S10** — [studio-tests README](https://github.com/donchitos/claude-code-game-studios/blob/abc0de79d6ceb0b5d7aa693945849b3937afbe6a/studio-tests/README.md).
- **S11** — [skill-lint.sh](https://github.com/donchitos/claude-code-game-studios/blob/abc0de79d6ceb0b5d7aa693945849b3937afbe6a/.claude/scripts/skill-lint.sh).
- **S12** — [설정/훅 활성화 표면](https://github.com/donchitos/claude-code-game-studios/blob/abc0de79d6ceb0b5d7aa693945849b3937afbe6a/.claude/settings.json).

소스 문서는 이 연구 시점의 관측이며 움직이는 최신 브랜치의 보증이 아니다.
선택 파일의 원본 URL과 바이트 해시는 `source.json`에, 공식 문서 조회 URL·SHA-256은
`documentation-sources.json`에 보존한다. 내용 해시만으로 미래 문서 URL의 동일성을
보증하지 않는다.
