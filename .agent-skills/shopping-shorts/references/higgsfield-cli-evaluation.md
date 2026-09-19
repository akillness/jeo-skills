# Higgsfield CLI Provider Evaluation

판정 기준: **2026-09-01 KST**.

## Decision

**HOLD. 현재 `shopping-shorts`의 production execution surface로 등록하지 않는다.**

Higgsfield의 공식 CLI·MCP 존재와 9:16 영상 모델 지원은 확인됐다. 그러나 현재 하네스의 비용·권리·자격증명·재현성 게이트를 충족하는 typed adapter를 만들기에는 공개 계약이 부족하다. Windows 실행에서 `validate-run.mjs`의 `source_sha` 검사를 느슨하게 고친 것은 승인된 provider 등록이 아니며 정본에 반영하지 않는다.

## Audited coordinates

- 공식 CLI 문서 저장소: `https://github.com/higgsfield-ai/cli`
- 감사 SHA: `8827135df7601667f66cd36ce84cf72106d690c4`
- 관측된 최신 release: `v1.1.24` (2026-08-29)
- 공식 npm package: `@higgsfield/cli`
- 공식 MCP endpoint: `https://mcp.higgsfield.ai/mcp`
- 공식 API 문서: `https://docs.higgsfield.ai/docs`

PyPI의 `higgsfield-cli`는 공식 패키지가 아니므로 사용 금지다.

## Verified capability

- 브라우저 OAuth/device flow로 로그인하고 workspace를 선택한다.
- 모든 명령에 `--json`을 제공한다고 문서화한다.
- account, workspace, model, workflow, generate create/get/wait/list, upload 표면이 있다.
- Kling 3.0, Seedance 2.0, Veo 3.1, Gemini Omni, Wan 2.7 등 여러 모델이 9:16을 지원한다.
- 모델 결과는 job id와 `result_url`로 조회한다.
- 모델·해상도에 따라 같은 Higgsfield credit balance를 차감한다.

## Blocking gaps

1. 공개 저장소는 문서와 installer뿐이고 실제 Go binary 소스는 비공개다. 배포 번들에서 Sentry telemetry 표면이 관측되지만 수집 범위·opt-out 계약을 소스 수준에서 감사할 수 없다.
2. npm·shell installer가 release checksum을 자동 검증하지 않으며 release checksum 자체도 서명되지 않았다.
3. 인증은 짧은 수명의 로컬 account session이고 headless/CI 계약이 없다. subcommand별 credential 해석 불일치 이슈도 열려 있다.
4. `model get --json`, account, cost, job JSON의 정식 스키마가 공개되지 않았다.
5. model-level cost preflight의 명령 계약이 충분히 문서화되지 않았고 일부 workflow는 비용 추정을 지원하지 않는다.
6. job cancel 명령이 확인되지 않았다.
7. `result_url` 만료, watermark, C2PA, 생성물 상업 이용 권리 근거가 CLI 문서에 없다.
8. 로컬 제품 사진은 서버로 업로드되므로 G2 권리·개인정보 확인이 먼저 필요하다.
9. 대부분의 모델은 1080×1920·30fps를 직접 고정하지 않는다. 로컬 transcode와 ffprobe 검증이 필요하다.
10. 현재 하네스의 Open-Generative-AI 고정 SHA 계약과 account-session 기반 Higgsfield 계약은 다른 provider adapter여야 한다.

## Admission criteria

향후 `higgsfield-cli-v1`을 추가하려면 아래를 모두 충족한다.

- 사용자가 설치한 공식 binary의 version, build SHA, release asset SHA-256을 기록하고 수동 checksum 검증.
- `auth login`과 workspace 선택은 사용자 주도 단계로 분리하고 토큰 값을 출력·복사하지 않음.
- 실행 직전 `model get --json`으로 모델 schema를 동기화하고 알 수 없는 필드·enum은 차단.
- live cost probe가 숫자를 반환하고 account balance보다 작으며 사용자가 exact cost를 확인한 경우에만 생성.
- source asset 권리와 서버 업로드 허용이 G2에서 확인됨.
- job id, model, exact arguments, input SHA-256, result URL, downloaded output SHA-256을 provenance에 기록.
- 결과를 로컬 1080×1920 H.264/AAC로 변환하고 full-playback QA.
- 생성물 상업 이용 약관·watermark·AI disclosure 근거를 별도 공식 문서에서 확인.
- 기존 `source_repo`/`source_sha` 가드를 해제하지 않고 별도 discriminated adapter contract와 양·음성 테스트를 추가.

이 조건이 하나라도 미충족이면 Higgsfield 출력은 외부에서 받은 **수동 입력 자산**으로만 인수하고 자동 provider 실행 완료로 보고하지 않는다.
