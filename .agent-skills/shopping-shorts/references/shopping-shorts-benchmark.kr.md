# Korean Shopping Shorts Benchmark

관측 기준: **2026-09-01 KST**. 공개 YouTube 메타데이터를 직접 읽어 대한민국 상품 추천·시연 Shorts 중 조회수 200,000 이상, 길이 90초 이하인 표본을 확인했다.

## Scope and limits

- 이 표본은 **성공 원인 연구가 아니라 구조 후보 탐색**이다. 조회수와 편집 요소의 상관만 관찰할 수 있고 인과를 증명하지 못한다.
- 표본 11개 중 7개가 한 채널에 몰려 있어 채널 규모, 기존 시청자, 게시 시점, 제품 선택이라는 교란요인을 분리할 수 없다.
- 2025-03-31부터 Shorts 공개 조회수는 재생 또는 재재생이 시작되면 최소 시청 시간 없이 집계된다. 수익화와 실제 체류 판단에는 Studio의 `engaged views`, 시청 지속시간, 평균 시청률을 사용한다.
- 2024-10-15 이후 세로·정사각형 영상은 최대 3분까지 Shorts로 분류될 수 있다. 이 하네스의 15~60초는 플랫폼 상한이 아니라 의도적인 제작 범위다.
- YouTube 공식 도움말도 한 바이럴 영상과의 비교를 피하고, 같은 형식의 잘된 영상과 덜 된 영상을 함께 비교하라고 안내한다.
- 공개 영상의 대사·샷·폰트·음원·화면 구성을 복제하지 않는다. 자동 자막은 고유명과 수치를 훼손할 수 있어 구조 확인 보조로만 사용한다.

공식 기준:

- `https://support.google.com/youtube/thread/333869549/a-change-to-how-we-count-views-on-shorts`
- `https://support.google.com/youtube/answer/15424877`
- `https://support.google.com/youtube/answer/12942217?co=YOUTUBE._YTVideoType%3Dshorts&hl=ko`

## Verified sample

조회수는 관측 시점 값이며 계속 변한다.

| Video ID | Channel | Public views | Duration | Published | Title |
|---|---|---:|---:|---|---|
| `f0HM746a6B4` | 야무진 | 3,549,699 | 60s | 2025-06-16 | 살까말까 했는데 매일 쓰는 주방템 3가지 |
| `-p18DiOZmRk` | 야무진 | 3,283,395 | 53s | 2025-02-11 | 1년 넘게 사용한 다이소 주방꿀템 3가지 |
| `nzfy4A190Jo` | 야무진 | 1,344,261 | 49s | 2026-01-04 | 아니 이건 다이소가 더 좋은데? |
| `643CJO2IStQ` | 야무진 | 1,223,173 | 55s | 2025-02-23 | 아직도 품절되는 다이소 인기템 3가지 |
| `VIh35O_Hh4k` | 야무진 | 763,814 | 62s | 2026-01-21 | 우와 이거 다이소 맞아? |
| `exL7Y_LVuig` | 야무진 | 565,005 | 68s | 2026-04-30 | 안쓰면 나만 고생인 주방 꿀템 3가지 |
| `2vjl5nWknzY` | 야무진 | 523,806 | 59s | 2025-03-09 | 1년 넘게 잘 쓰고 있는 다이소 수납 꿀템 3가지 |
| `Qn9ILnu_fFI` | 청소신 | 285,764 | 58s | 2020-09-25 | 청소신 칼슘파우더 |
| `4wKzEXHIxxg` | 커먼하우스 | 269,751 | 45s | 2023-03-15 | 만능 풋브러쉬 |
| `vAjDoQfLR2U` | 커먼하우스 | 262,077 | 52s | 2020-06-16 | 커먼하우스 만능곰팡이제거젤 |
| `S1mo8ULvXAg` | 청소신 | 207,101 | 57s | 2020-06-16 | 청소신 자동차클리너 |

Canonical URLs use `https://www.youtube.com/shorts/<Video ID>`.

## Observed structures

1. **Two different formats coexist.** Multi-product listicles and single-product demonstration videos both cross the threshold. Do not force one product into a three-item list.
2. **Result and utility appear early.** The opening quickly shows a problem, surprising comparison, finished result, or concrete use rather than a channel introduction.
3. **The proof is visible.** Installation, operation, before/after, fit, cleanup, or price comparison occupies more time than abstract praise.
4. **Narration is benefit-dense.** Multi-item samples move directly through numbered products; single-product samples rely on demonstration and short claims.
5. **Curiosity, price, retailer, and scarcity language appears often**, but the sample does not prove it caused views. Scarcity and social proof must not be used unless current evidence supports them.
6. **All 11 samples are 45~68 seconds**, but this is an observed sample band, not a mandatory duration. A 30-second concept should not be padded to match it.

## Workflow decisions

### Adopt

- Show a verifiable result or product action in the first 1~2 seconds.
- For one product, use a flexible sequence: payoff preview → problem → real operation proof → result/detail → caveat and disclosed CTA → loopable ending.
- Keep shot lengths variable. Equal 5-second blocks are allowed only when they fit the evidence and rhythm.
- Put every material product claim on an evidence id and show at least one proof shot.
- Treat the 200,000-view filter as candidate discovery only. After publication, use the channel's own engaged views, retention, swipe/choice-to-view, and drop-off points.

### Hold for experiments

- A 30-second cut is a reasonable first variant, not the universal optimum. Compare it with one meaningfully different duration only after both versions keep the same product, hook, claim set, and disclosure.
- Typewriter captions with at most two lines are the current preferred overlay treatment. Confirm readability, safe area, font rendering, and pace in full-playback QA.

### Reject

- Do not convert `200,000 views` into a quality gate, forecast, or guaranteed formula.
- Do not copy titles, dialogue, shot order, timing, typography, music, or product presentation from the sample.
- Do not fabricate `품절`, celebrity use, long-term personal use, low price, or retailer superiority.
- Do not add three products merely because listicles are common in this sample.
