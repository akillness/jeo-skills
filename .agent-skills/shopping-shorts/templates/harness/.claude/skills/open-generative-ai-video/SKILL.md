---
name: open-generative-ai-video
description: >
  Adapts the pinned Open-Generative-AI model catalog to a safe shopping-shorts render plan, choosing MuAPI, GUI handoff, or Wan2GP while enforcing 9:16 support, product identity, provenance, cost review, and no-secret logging.
---

# Open Generative AI Video

## When to use this skill

승인된 쇼핑 쇼츠 storyboard를 Open-Generative-AI의 MuAPI, GUI, 또는 Wan2GP 표면으로 짧은 9:16 클립들로 만들 때 사용한다.

## Instructions

1. 고정 SHA `5482a777047c0df189eef989ff994d0d7a1d2874`의 모델 계약만 기준으로 삼는다.
2. 상품 정체성 보존이 필요하면 image-to-video를 우선한다.
3. 모델별 `aspect_ratio`, duration, resolution, image 입력을 직접 확인한다.
4. Open-Generative-AI가 자체 생성 엔진이라고 말하지 않는다. 원격은 MuAPI, 로컬 영상은 별도 Wan2GP 서버다.
5. 한 샷은 최대 30초이며 전체 쇼츠는 여러 샷과 ffmpeg 조립으로 만든다.
6. 생성 프롬프트와 provider request에 합성 글씨·자막·워터마크 금지를 넣고 실제 제품 표시는 보존한다.
7. `MUAPI_API_KEY`는 환경변수에서만 읽고 값·header·signed URL을 로그에 남기지 않는다.
8. 먼저 `render-plan.json`과 `provider-requests.json`을 만든다.
9. 비용·잔액·정확한 샷 수와 endpoint를 보여준 뒤 유료 실행 확인을 받는다.
10. 각 job의 request id, endpoint, prompt hash, source asset ids, output hash를 기록한다.
11. 모델 합성 글씨·자막·워터마크 또는 제품 라벨·구성품·형태·기능이 변한 결과는 폐기한다.

`ClippingStudio`의 빈 coordinate fallback은 분석이 아니라 합성값이므로 사용하지 않는다. Higgsfield 공식 CLI는 별도 HOLD admission을 모두 통과하기 전 execution surface가 아니며, PyPI 동명 쿠키 스크래퍼는 사용하지 않는다.

## Examples

- “승인된 5개 샷을 MuAPI request packet으로 만들어.”
- “Wan2GP 서버에 맞는 9:16 handoff를 준비해.”
- “이 clip의 제품 정체성이 reference와 같은지 검수해.”

## Best practices

- 프롬프트는 제품 모양보다 시간적 변화와 카메라를 기술하고, 읽히는 글씨·자막·로고·워터마크 생성 요구를 넣지 않는다.
- 먼저 저비용 prototype을 고려하되 모델별 실제 비용을 확인한다.
- 두 번 실패하면 무제한 재시도하지 말고 BLOCK한다.
- output URL을 로컬에 저장하고 SHA-256으로 봉인한다.
