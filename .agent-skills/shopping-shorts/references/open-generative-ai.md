# Open-Generative-AI Adapter Contract

검증 기준:

- 저장소: https://github.com/Anil-matcha/Open-Generative-AI
- 기본 브랜치: `main`
- 고정 SHA: `5482a777047c0df189eef989ff994d0d7a1d2874`
- 확인일: 2026-09-01 KST
- 루트 라이선스: MIT 전문 확인

## What the repository actually is

Open-Generative-AI는 생성 모델을 직접 실행하는 완결된 헤드리스 엔진이 아니다.

- 브라우저·Electron 기반 GUI다.
- 원격 생성은 `https://api.muapi.ai`에 요청한다.
- 로컬 이미지는 Electron에 번들된 sd.cpp 계열을 사용할 수 있다.
- 로컬 영상은 사용자가 별도로 띄운 Wan2GP Gradio 서버에 연결한다. Python과 모델 weights는 번들하지 않는다.

따라서 자동화 하네스는 이 저장소를 **모델 카탈로그와 API 계약의 고정 사양서**로 사용하고, 실행은 MuAPI API 또는 사용자 운영 Wan2GP 중 하나로 명시해야 한다.

## Verified code coordinates

| Contract | Pinned coordinate |
|---|---|
| `/api/v1/*`를 MuAPI로 rewrite | `middleware.js:23-41` |
| API base와 proxy 분기 | `packages/studio/src/muapi.js:12-19` |
| `x-api-key`, POST, request id 폴링 | `packages/studio/src/muapi.js:43-81` |
| video payload와 최대 900회 폴링 | `packages/studio/src/muapi.js:151-173` |
| image-to-video payload | `packages/studio/src/muapi.js:175-193` |
| marketing reference endpoint | `packages/studio/src/muapi.js:196-205` |
| account balance | `packages/studio/src/muapi.js:367-379` |
| Wan2GP를 별도 운영한다는 선언 | `electron/lib/wan2gpProvider.js:1-5` |
| Wan2GP 9:16 video catalog | `electron/lib/wan2gpProvider.js:55-109` |
| 빈 clipping 좌표의 가짜 fallback | `packages/studio/src/components/ClippingStudio.jsx:524-533` |

## Capability snapshot

고정 SHA의 `models.js`를 실측한 카탈로그:

- text-to-image 72
- text-to-video 90
- image-to-image 74
- image-to-video 131
- video-to-video 36
- lipsync 15
- recast 3
- audio 17
- 합계 438

README나 GitHub 설명의 `400+`, `500+` 표기는 서로 다르다. 하네스는 고정 SHA에서 읽은 실제 카탈로그만 사용하고 모델 수를 마케팅 문구로 재사용하지 않는다.

9:16 지원 관측치:

- text-to-video 79/90
- image-to-video 93/131
- text-to-image 50/72

지원 여부는 모델별 입력 스키마로 다시 확인한다. `aspect_ratio`가 없는 제품 특화 모델을 9:16이라고 가정하지 않는다.

영상 모델의 단일 클립 길이는 대체로 짧다. 관측된 최대 duration 값은 4, 8, 10, 12, 15, 16, 20, 30초 범위다. 한 편의 쇼츠는 여러 클립과 로컬 조립을 전제로 한다.

## Lane A: MuAPI remote execution

계약:

```text
POST https://api.muapi.ai/api/v1/<verified-endpoint>
Content-Type: application/json
x-api-key: $MUAPI_API_KEY
body: model-specific payload
→ request_id
→ prediction status polling
→ output URL
```

규칙:

1. `MUAPI_API_KEY`는 환경변수로만 읽는다.
2. 모델 endpoint와 입력 스키마를 고정 SHA 카탈로그에서 확인한다.
3. 먼저 비용을 추정하고 계정 잔액을 확인한다.
4. 정확한 endpoint, 샷 수, 예상 비용, 출력 경로를 사람에게 보여준다.
5. 유료 호출 확인 전에는 request payload만 생성한다.
6. 출력 URL은 만료될 수 있으므로 승인된 작업공간으로 내려받고 SHA-256을 기록한다.
7. 성공 응답은 시각 품질, 제품 정확성, 상업적 사용 가능성을 보장하지 않는다.

인증 방식 혼동 주의:

- 스튜디오/API: `x-api-key`
- MCP 표면: `Authorization: Bearer`

두 방식을 섞지 않는다.

## Lane B: GUI handoff

API 자동 호출 대신 Open-Generative-AI 앱을 사용할 수 있다.

하네스가 준비할 것:

- 선택 모델과 선택 이유.
- 9:16, duration, resolution.
- 권리 확인된 참조 이미지.
- 시간적 변화만 기술한 shot prompt.
- 예상 비용과 최대 재시도 수.
- 결과 파일을 저장할 exact path.

사람이 GUI에서 생성한 뒤 결과 파일과 request/job 정보를 하네스에 돌려준다. 앱 화면의 “완료” 표시는 G7-G8을 통과한 것이 아니다.

## Lane C: Wan2GP bridge

조건:

- 사용자가 Wan2GP를 별도 설치·실행.
- CUDA가 있는 머신 또는 원격 GPU.
- Gradio 서버 URL.
- `/info`에서 실제 API name을 탐색.

고정 카탈로그의 video 후보는 Wan 2.2 t2v/i2v, Hunyuan Video, LTX Video이며 모두 9:16을 선언한다. 실제 서버 build에 endpoint가 없으면 자동 fuzzy match 결과를 맹신하지 말고 중단한다.

## Model selection rules

상품 영상은 제품 정체성 보존이 중요하므로 기본적으로 image-to-video를 우선한다.

1. 제품 사진을 임의의 다른 제품으로 재렌더하지 않는다.
2. 모델이 참조 이미지 보존을 지원하는지 확인한다.
3. prompt는 `제품 모양`이 아니라 `시간적 변화, 카메라, 조명, 배경 움직임`을 기술한다.
4. 제품 라벨·버튼·구성품이 변하면 해당 샷을 폐기한다.
5. 720p는 비용 절약용 프로토타입일 수 있지만, 비용 배수를 상수로 가정하지 않는다.
6. 최종 출력 해상도는 승인된 플랫폼 패킷과 일치해야 한다.

## Forbidden paths

### Fake clipping coordinates

`ClippingStudio.jsx`는 coordinate-only 응답이 비어 있으면 15초 균등 구간과 0.95부터 감소하는 점수를 합성한다. 이 값은 분석 결과가 아니다.

- 이 코드 경로를 사용하지 않는다.
- 빈 highlight 응답은 `no result`로 처리한다.
- 가짜 구간, 가짜 virality score, 가짜 confidence를 생성하지 않는다.

### Unqualified marketing claims

다음 표현을 이식하지 않는다.

- unrestricted / uncensored / no guardrails
- free 또는 완전 self-hosted
- 모델 수 400+/500+
- 한 번에 완성되는 60초 쇼츠

### Full setup with unresolved dependencies

루트 `npm run setup`은 세 서브모듈을 가져온다. 확인 당시 `Open-Poe-AI` 서브모듈에는 라이선스 파일이 없었다. 루트 MIT 문구가 서브모듈에 자동 적용된다고 가정하지 않는다. 필요한 스튜디오 코드만 참고하고 제3자 코드를 벤더링하기 전 각 라이선스를 다시 확인한다.

### Generated typography

생성 모델에는 합성 글씨·자막·워터마크 금지를 명시한다. `generated_text_policy` 메타데이터만 믿지 않고 shot prompt와 provider payload의 읽히는 글씨·자막·로고·워터마크 생성 지시를 기계적으로 차단한다. 실제 제품에 인쇄된 표시는 정체성 증거이므로 보존한다. 모델 출력의 글씨는 product claim이나 자막으로 사용하지 않고, 후반 오버레이는 caption plan에서 결정론적으로 재생성한 전체 바이트와 일치하는 ASS만 사용한다.

### Higgsfield CLI admission

공식 CLI가 존재한다는 사실만으로 현재 adapter가 되지 않는다. `references/higgsfield-cli-evaluation.md`의 판정은 HOLD이며, checksum·비대화형 인증·고정 출력 스키마·비용 조회·취소·result URL 권리·워터마크·상업 이용·입력 업로드·픽셀/fps 계약을 모두 충족하기 전에는 `execution_surface`에 추가하지 않는다. PyPI의 동명 비공식 쿠키 스크래퍼는 사용 금지다.

## Missing production layers

저장소에는 다음이 없다.

- 안정된 헤드리스 쇼츠 CLI.
- ffmpeg 기반 다중 클립 조립.
- 자막 번인.
- voiceover와 BGM 믹싱.
- 쇼핑 제휴 표시 검증.
- 제품 기능 claim 검증.
- 업로드 전 exact release approval.

이 책임은 shopping-shorts 하네스가 소유한다.

## Related skill sources

참고 저장소:

- https://github.com/SamurAIGPT/Generative-Media-Skills
- 고정 SHA: `74df8cb76bb454532e9462d56b5b0053ba0b52fa`
- 라이선스: MIT

참고할 파일:

- `library/social/youtube-shorts/SKILL.md`: 장문 영상에서 세로 하이라이트를 추출하는 플랫폼 preset. 상품 생성이 아니라 clipping용이다.
- `library/motion/product-video-ad-maker/SKILL.md`: 제품 이미지 승인 후 image-to-video로 넘기는 2단계 구조.
- `library/social/ugc-ads-workflow/SKILL.md`: UGC 광고 오케스트레이션 참고.

재사용 원칙:

- 9:16 preset, 결과가 부족하면 억지로 채우지 않는 실패 규칙, 이미지 승인 후 영상화 구조는 채택.
- virality score를 사실처럼 신뢰하거나 같은 제품을 여러 템플릿으로 양산하는 패턴은 채택하지 않음.
- companion CLI의 라이선스가 확인되지 않은 경우 코드를 복제·벤더링하지 않음.

## Security

- API 키는 localStorage가 아니라 환경변수에 둔다.
- 로그에는 키 값, 인증 헤더, signed URL query를 기록하지 않는다.
- 업로드 대상 URL은 https와 허용 호스트 목록으로 제한한다.
- SVG/HTML/스크립트 파일을 제품 이미지로 업로드하지 않는다.
- 외부 URL을 가져오기 전에 크기·형식·redirect host를 확인한다.
- 프롬프트와 참조 자산이 바뀌면 기존 비용·실행 승인은 무효다.
