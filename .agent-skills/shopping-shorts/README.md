# 쇼핑 쇼츠 스킬·하네스

영상 `g-BXdYXlH44`의 실용 구조와 Open-Generative-AI의 실제 코드 계약을 검증해 만든 카탈로그 스킬이다.

## 설치 위치

```bash
export SHOPPING_SHORTS_SKILL_ROOT="/absolute/path/to/shopping-shorts"
```

새 세션에서 `쇼핑 쇼츠`, `상품 추천 숏폼`, `YouTube·Instagram·TikTok·X·네이버 수익 경로 조사`, `Open-Generative-AI 제품 영상` 요청에 사용할 수 있다.

## What is included

- 카탈로그 스킬 `SKILL.md`와 상세 `REFERENCE.md`.
- 영상 분석, 20만 조회 상품추천 Shorts의 비무작위 benchmark, YouTube·Instagram·TikTok·X·쿠팡·지그재그·네이버 공식 수익 경로 조사, 플랫폼·공정위 표시 규칙, Open-Generative-AI 고정 SHA 감사 문서.
- 헤이홈 6×5초 기획의 장면별 채택·보류·기각 및 수정 내레이션.
- Higgsfield 공식 CLI의 HOLD admission 기록. 현재 pinned source guard는 해제하지 않음.
- 한국 기준 20개 프로그램 카탈로그와 게시 표면별 release adapter registry.
- supervisor + research fan-out/fan-in + route selector + producer-reviewer 하네스.
- 파일 기반 전문 에이전트 9개.
- 프로젝트용 오케스트레이터 스킬 2개.
- commerce platform/route/receipt, 자막 계획, 타임라인, 공개 read-back receipt를 포함한 JSON Schema 12개.
- 하네스 초기화, 구조·commerce·run 검증, provider packet, typewriter ASS 생성, ffmpeg 조립, ffprobe 검증 실행 스크립트 9개와 공용 계약 모듈 2개(총 MJS 11개).
- 네트워크·API 키가 필요 없는 pre-render fixture.
- 양방향 회귀 테스트와 실제 15초 1080×1920 H.264/AAC 조립 테스트.

## Architecture

```text
shopping-shorts-director
├─ platform-revenue-researcher ──┐
├─ product-evidence-researcher ──┴─ parallel research
├─ commerce-eligibility-auditor ─── route selection
├─ creative-strategist
├─ open-generative-ai-operator
├─ assembly-editor
├─ policy-qa-reviewer
└─ release-controller
```

## Initialize a project

먼저 읽기 전용 preview를 본다.

```bash
node "$SHOPPING_SHORTS_SKILL_ROOT/scripts/init-harness.mjs" \
  --target /absolute/project/path
```

충돌이 0개일 때만 적용한다.

```bash
node "$SHOPPING_SHORTS_SKILL_ROOT/scripts/init-harness.mjs" \
  --target /absolute/project/path --apply

node "$SHOPPING_SHORTS_SKILL_ROOT/scripts/validate-harness.mjs" \
  --root /absolute/project/path
```

초기화기는 기존의 다른 파일을 덮어쓰지 않는다.

## Run validation

```bash
node "$SHOPPING_SHORTS_SKILL_ROOT/scripts/validate-commerce-research.mjs" \
  --platforms /absolute/project/path/_workspace/current/research/commerce-platforms.json

node "$SHOPPING_SHORTS_SKILL_ROOT/scripts/validate-run.mjs" \
  --root /absolute/project/path/_workspace/current --stage intake

node "$SHOPPING_SHORTS_SKILL_ROOT/scripts/validate-run.mjs" \
  --root /absolute/project/path/_workspace/current --stage pre-render

node "$SHOPPING_SHORTS_SKILL_ROOT/scripts/build-typewriter-captions.mjs" \
  --input /absolute/project/path/_workspace/current/assembly/captions.json \
  --output /absolute/project/path/_workspace/current/assembly/captions.ass

node "$SHOPPING_SHORTS_SKILL_ROOT/scripts/validate-run.mjs" \
  --root /absolute/project/path/_workspace/current --stage final
```

## Open-Generative-AI reality check

기준 저장소:

```text
https://github.com/Anil-matcha/Open-Generative-AI
5482a777047c0df189eef989ff994d0d7a1d2874
```

이 저장소는 자체 헤드리스 생성 엔진이 아니다.

- 원격 생성: MuAPI 유료 SaaS (`api.muapi.ai`).
- 로컬 영상: 별도로 운영하는 Wan2GP Gradio 서버.
- GUI: 사람이 모델과 입력을 선택하는 manual-finish 경로.
- 클립 조립·자막·오디오·상업 고지 검수: 이 하네스가 소유.

`ClippingStudio`가 빈 좌표를 15초 간격과 가짜 점수로 채우는 fallback은 사용 금지다. Higgsfield 공식 CLI는 checksum·비대화형 인증·스키마·비용·취소·권리·watermark·입력 업로드·출력 계약 admission이 미충족이라 HOLD다.

## Safety gates

- 한 run 한 상품 한 콘셉트 한 영상.
- 한국 카탈로그의 YouTube·Instagram·TikTok·X·쿠팡·지그재그·네이버 필수 20개 프로그램을 공식 소스에서 먼저 조사.
- `announced`, `retiring`, `enrollment-closed`, `ended`, `not-available`, `unknown`은 commerce-ready로 승격 금지.
- Instagram 제품 태그 API 부재와 KR 만 19세·Bonuses 조건 분리, TikTok 공개 API audit와 KR category screen, X 수익 프로그램 전환·automated-content 부적격·third-party video ad 동의를 별도 경계로 유지. TikTok/X screen token은 공식 source·판정·시각·검수자·이미지 SHA-256이 묶인 `compliance_evidence` 없이는 무효.
- 계정 자격·매체 등록·자산 조건 미확인 시 `creative-only`.
- platform research와 route의 SHA-256 receipt 일치.
- 가짜 체험담 금지.
- 경쟁 영상 표현 복제 금지.
- 권리 근거 없는 자산 업로드 금지.
- 현실적인 AI 장면 공개.
- 제휴·협찬 화면+설명 고지.
- 가상인물 추천 시 등장 동안 인접 표시.
- 선택 콘셉트·render plan SHA와 storyboard 행의 샷·시간·claim·asset을 정확히 봉인.
- 생성 프롬프트·provider payload의 읽히는 글씨 필드를 차단하고, 생성 클립의 합성 글씨·자막·워터마크를 금지. 최종 영상·원본 클립·3개 프레임의 SHA-256 검수 증거를 요구하며 실제 MP4 스트림도 probe.
- 조립 자막은 typewriter·최대 2줄이며 caption plan에서 재생성한 ASS 전체 바이트, 실제 폰트·burn-in QA를 대조.
- 20만 조회 benchmark를 성과 보장이나 3개 리스티클 강제로 쓰지 않음.
- 수정 최대 2회.
- 유료 호출과 공개는 각각 exact confirmation 필요.

## Test

```bash
node "$SHOPPING_SHORTS_SKILL_ROOT/scripts/test-suite.mjs" --media
```

2026-09-18 재검증 기준:

- **79개** 양방향 `--media` 회귀 PASS(20개 프로그램 누락·stale/fixture 우회·catalog drift·UGC의 공식 출처 위장·해시 drift·미확인 계정·Instagram/TikTok/X 고지와 화면 증거·생성 글씨 prompt·storyboard digest/행·결정론 ASS·symlink·최종 QA 증거·adapter·공개 read-back receipt 경계 포함). `--media` 없이 final/release 단계가 조용히 생략되지 않도록 실행 자체를 차단한다.
- skill-standardization: 0 errors, 0 warnings.
- 하네스: 에이전트 9개, 스킬 2개, 0 errors, 0 warnings.
- pre-render fixture PASS.
- manual GUI packet은 `ready_to_submit=false`로 fail-closed.
- 실제 ffmpeg 조립: 1080×1920, 30fps, 15초, H.264/yuv420p + AAC PASS.
- 패키지 구성 수치와 ZIP SHA-256은 최종 `validation-report.json`·`MANIFEST.json` 기준.

현재 계정의 범용 `harness/scripts/validate-harness.sh`는 YAML description 추출에서 조기 종료하는 결함이 있어, 이 패키지는 `scripts/validate-harness.mjs`를 진실원으로 사용한다.

## Not performed

- 실제 상품·채널별 콘텐츠 조사.
- 실제 사용자의 제휴 계정 가입·승인·매체 등록 상태 확인(기본값 `unknown`).
- MuAPI 키 설정 또는 유료 모델 호출.
- YouTube·Instagram·TikTok·X·네이버 업로드·게시·제품 태그·제휴 링크 삽입.
- 계정 설정, 수익 프로그램 가입, API app 심사, 제휴·매체 등록.
