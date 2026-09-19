---
name: shopping-shorts-orchestrator
description: >
  Orchestrates one evidence-backed shopping Short from current Korean platform revenue research through route eligibility, product evidence, rights, concept approval, Open-Generative-AI rendering, ffmpeg assembly, independent QA, and confirmation-gated release.
---

# Shopping Shorts Orchestrator

## When to use this skill

상품 링크, 제품 사진, 쇼핑 제휴 후보를 YouTube Shorts용 한 편으로 만들거나 기존 쇼핑 쇼츠 패킷을 재개할 때 사용한다.

## Instructions

1. `_workspace/current/run.json`을 읽고 닫히지 않은 실행을 재개한다.
2. 새 실행이면 `max_outputs: 1`, `experience_mode: sourced-only`, `revision_loops: 0`으로 만든다.
3. `platform-revenue-researcher`와 `product-evidence-researcher`를 병렬 호출한다.
4. 플랫폼 매트릭스가 완성되면 `commerce-eligibility-auditor`가 현재 계정 UI를 대조해 한 경로를 선택하고 G0 receipt를 만든다. TikTok/X screen control은 공식 source·판정·화면 SHA-256 evidence를 함께 봉인한다.
5. G0-G2가 PASS면 `creative-strategist`에게 최대 세 콘셉트를 요청한다.
6. 한 콘셉트가 선택·승인되면 `open-generative-ai-operator`가 금지 글씨 prompt 검사를 거친 draft render plan과 견적을 준비한다. 그 뒤 `creative-strategist`가 selected-concept/render-plan SHA와 샷 행 계약을 storyboard에 봉인하고 pre-render를 검증한다.
7. 유료 호출 확인 뒤만 render를 실행한다.
8. clip이 완성되면 `assembly-editor`가 typewriter·최대 2줄 후반 자막을 만들고 9:16 final.mp4에 burn-in한다. ASS는 caption plan에서 재생성한 전체 바이트와 대조한다.
9. `policy-qa-reviewer`가 최종 MP4·원본 클립·시작/중간/끝 프레임 SHA 증거를 묶어 독립적으로 PASS/FIX/BLOCK을 반환한다.
10. FIX는 최대 두 번만 허용한다.
11. PASS면 `release-controller`가 exact release package를 만들고, 외부 확인 뒤만 업로드·게시한다.

각 단계는 파일 경로, gate 판정, blocking finding, 다음 행동을 handoff JSON으로 남긴다. Director만 run 상태를 바꾼다.

## Examples

- “이 상품 링크로 쇼핑 쇼츠 한 편 만들어줘.”
- “현재 쇼핑 쇼츠 run을 QA부터 재개해.”
- “렌더 전 비용과 콘셉트 패킷까지만 준비해.”

## Best practices

- 성과보다 제품 사실과 권리를 먼저 확인한다.
- 한국 카탈로그의 20개 YouTube·커머스·Instagram·TikTok·X 프로그램 매트릭스와 제품 리서치가 모두 없으면 영상을 생성하지 않는다.
- 20만 조회 표본은 후보 탐색용으로만 사용하고 성과 게이트나 3개 리스티클 강제로 쓰지 않는다.
- 계정 자격·매체 등록을 브라우징 이력이나 과거 메모리로 추정하지 않는다.
- 한 실행을 닫기 전에 다음 상품을 시작하지 않는다.
- API 성공과 실제 제품 정확성을 분리한다.
- 업로드·제휴 링크·제품 태그는 exact confirmation 없이는 실행하지 않는다.
