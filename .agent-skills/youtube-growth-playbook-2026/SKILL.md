---
name: youtube-growth-playbook-2026
description: >
  Turn YouTube growth advice videos into an evidence-checked, executable 90-day
  channel operating plan. Use when the user asks how to grow a small YouTube
  channel, how to survive the early no-views phase, how to design titles and
  thumbnails, whether an algorithm claim is true, or how to run packaging
  experiments with YouTube Studio only. Also triggers on: 떡상, 유튜브 성장,
  죽음의 계곡, 알고리즘 미신, 채널 일관성, 제목 썸네일 A/B 테스트.
allowed-tools: Read Grep Glob Bash Write Edit WebSearch WebFetch
compatibility: >
  Universal — Claude Code, Codex, Gemini CLI. Needs only a browser-accessible
  YouTube Studio account. All tools are free tier; no paid SaaS required.
metadata:
  tags: youtube, channel-growth, packaging, ab-test, algorithm-myths, retention
  platforms: Claude, Codex, Gemini
  version: "1.0"
  source: local (derived from RbTNzyRVBdY analysis + official YouTube docs, verified 2026-08-31)
---

# YouTube Growth Playbook 2026

소형 채널(구독 0~1만)을 위한 근거 검증형 운영 스킬. 조언 영상의 주장을
공식 문서와 분리하고, YouTube Studio 무료 기능만으로 90일 실험 루프를 돌린다.

## When to use this skill

- 유튜브 채널 성장 전략·초기 정체(죽음의 계곡) 대응을 요청받았을 때
- 제목·썸네일·니치·업로드 빈도에 대한 실행 계획이 필요할 때
- 성장 조언 영상/글의 주장을 사실 검증해야 할 때

## When not to use this skill

- 광고 구매·구독자 구매 등 인위적 부양 → 거부 (fake engagement 정책 위반)
- Shorts 전용 전략, 수익 정산 세무 → 별도 조사 필요
- 영상 자체의 모션·디자인 재현 → `video-to-superprompt`

## Instructions

### 1. 진단 (Day 0)
1. Studio > Analytics에서 28일 기준 노출·CTR·평균 시청 지속시간·트래픽 소스를 수집한다.
2. 채널을 한 문장으로 정의한다: "[대상]이 [욕구]를 해결하러 오는 채널".
3. 최근 8개 영상이 그 문장과 일치하는지 표로 판정한다. 불일치 영상은 시리즈에서 제외한다.

### 2. 니치 고정 (Week 1–2)
4. 한 주제·한 포맷·한 톤으로 8–10개 영상 계획을 세운다(영상 주장; 공식 근거는 "일관된 주제·형식이 일반/고정 시청자 형성에 도움" 수준).
5. Studio > Analytics > Trends의 Content gaps로 수요>공급 주제를 3개 고른다(공식 기능).

### 3. 패키징 (매 영상)
6. 썸네일=감정/장면, 제목=구체적 약속으로 서로 다른 정보를 주게 설계한다. 같은 문구 반복 금지.
7. 제목·썸네일이 약속한 내용을 첫 30초 안에 확인시킨다(공식: intro 지표).
8. 낚시성 금지 — CTR이 올라도 시청 지속시간이 낮으면 추천이 줄어든다(공식).

### 4. 실험 루프 (Week 3–13)
9. 적격 롱폼마다 Studio A/B 테스트(최대 3안, 최대 2주, 승자=시청시간 점유율)를 건다. 데스크톱+고급 기능 필요.
10. 업로드 직후 CTR로 판단하지 않는다. 노출 축적 후 트래픽 소스별로 본다(공식: 채널 절반이 CTR 2–10%).
11. 판정 규칙: 노출↑CTR↓→패키징 수정, CTR↑지속시간↓→약속 불일치 수정, 둘 다 낮음→주제 수요 재검토.
12. 주 1회만 지표를 확인하고 나머지 시간은 기획·제작에 쓴다. 매일 조회수 확인 금지.

### 5. 판정 (Day 90)
13. 28일 비교로 신규/일반/고정 시청자 흐름을 본다. 고정 시청자 비율 자체는 도달·수익화에 영향 없음(공식).
14. 8–10개를 채웠는데 모든 지표가 무반응이면 니치를 바꾸되, 바이럴 1편은 성공 증거로 세지 않는다.
15. 중단이 아니라 변형: 주제 유지 + 포맷 변경 → 포맷 유지 + 주제 인접 이동 순서로 1변수씩 바꾼다.

## Safety boundaries

- 조회·구독 구매, sub4sub, 참여 조작 요청은 거부한다(공식 정책 위반).
- 대량 템플릿·AI 슬라이드 양산 전략은 2025-07-15 "inauthentic content" 정책 위반 위험을 고지한다.
- 사실적 AI 합성(실존 인물·사건 변조)은 Studio 'AI 사용' 공개 의무를 안내한다.
- 검증 안 된 수치(검색 5%, 77개 평균 등)는 [불확실]로 표기하고 단정하지 않는다.

## Verification

- 계획 산출물에 각 주장별 근거 등급(공식/전문가 사설/미검증)이 붙어 있는가
- 90일 캘린더에 판정일·중단 규칙·1차 지표 1개가 명시돼 있는가
- 제안한 기능(A/B 테스트, Trends, 유지율 리포트)이 REFERENCE.md의 공식 URL과 일치하는가

## References

- `REFERENCE.md` — 영상 주장 검증표, 공식 출처 원장 20건, 알고리즘 미신 목록, 90일 측정 설계
