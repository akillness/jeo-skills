# Shopping Shorts Reference

확인 기준일: 2026-09-01 KST

## 1. Design goal

이 하네스는 `상품 링크 → 영상 여러 편` 자동 공장이 아니다. 한 실행에서 한 상품과 한 콘셉트를 근거·권리·비용·표시 의무에 묶어 **검수 가능한 쇼핑 쇼츠 한 편**으로 만드는 운영 계약이다.

핵심 판단 순서:

```text
플랫폼 수익 프로그램 조사 → 현재 계정·매체 경로 선택 → 상품 사실 → 자산 권리
→ 시청자 문제 → 독창적 콘셉트 → 렌더 비용 승인 → 짧은 클립 생성
→ 로컬 조립 → 독립 QA → 공개 승인
```

영상 `g-BXdYXlH44`에서 채택한 것은 생성 전 조사, 근거 링크, 사람 승인, 짧은 대사다. 추천 링크, 참여 유도, “100% 자동화”, 가짜 체험담, 대량 생성은 제외한다.

검증된 기획 근거는 두 문서로 분리한다.

- `references/shopping-shorts-benchmark.kr.md`: 한국 상품추천 Shorts 20만 조회 이상 표본 11개. 검색 기반 비무작위 표본이므로 후보 탐색에만 쓰고 성과 게이트로 쓰지 않는다. 15~60초는 플랫폼 상한이 아니라 이 하네스의 제작 범위다.
- `references/hejhome-plan-validation.kr.md`: 6×5초 헤이홈 기획의 장면별 채택·보류·기각, 공식 상품 근거, 수정 내레이션, Hermes 현장 변경 판정.
- `references/higgsfield-cli-evaluation.md`: Higgsfield 공식 CLI를 **HOLD**로 판정한 admission 기록. 이를 근거로 pinned `source_repo`/`source_sha` 가드를 해제하거나 `higgsfield-cli` execution surface를 추가하지 않는다.

## 2. Workspace contract

```text
_workspace/
├── current/
│   ├── run.json
│   ├── intake/
│   │   └── product.json
│   ├── research/
│   │   ├── commerce-platforms.json
│   │   ├── evidence.json
│   │   ├── rights.json
│   │   └── screens/          # selected screen-control evidence
│   ├── strategy/
│   │   ├── commerce-route.json
│   │   ├── concepts.json
│   │   └── selected-concept.json
│   ├── production/
│   │   ├── storyboard.md
│   │   ├── render-plan.json
│   │   ├── provider-requests.json
│   │   ├── jobs.json
│   │   └── clips/
│   ├── assembly/
│   │   ├── timeline.json
│   │   ├── captions.json
│   │   ├── captions.ass
│   │   └── final.mp4
│   ├── validation/
│   │   ├── commerce.json
│   │   ├── qa.json
│   │   └── frames/           # start, middle, end review evidence
│   ├── release/
│   │   ├── package.json
│   │   └── receipt.json
│   └── run-summary.md
└── archive/
    └── <run-id>/
```

원본 사진, 중간 렌더, API 응답 전문, 비밀값은 공개 패키지와 분리한다. 아카이브는 삭제하지 않고 다음 실행 전에 해시 봉인한다.

## 3. State machine

허용 상태:

```text
intake
→ researching
→ awaiting_concept_approval
→ approved_for_render
→ rendering
→ assembling
→ reviewing
→ ready_for_release
→ released
```

어느 단계에서든 `blocked` 또는 `rejected`로 종료할 수 있다.

- `blocked`: 필요한 권리·자격·근거·도구·비용 승인이 없어 진행 불가.
- `rejected`: 후보를 검토했지만 시청자 가치나 독창성이 부족해 의도적으로 제작하지 않음.
- `ready_for_release`: 파일과 게시 패킷이 준비됐을 뿐 업로드되지 않음.
- `released`: 확인받은 채널·파일·문구가 실제 공개되고 URL을 다시 읽어 검증함.

## 4. Gate map

| Gate | Owner | Pass condition |
|---|---|---|
| G0a Platform research | platform-revenue-researcher | 한국 카탈로그 필수 20개 프로그램, 공식 소스, 7일 freshness, unknowns 완성 |
| G0b Commerce route | commerce-eligibility-auditor | research/route 해시 일치; `commerce-ready` 또는 명시적 `creative-only`; 금지 상품 아님 |
| G1 Evidence | product-evidence-researcher | 모든 material claim이 `verified` 또는 삭제됨 |
| G2 Rights | product-evidence-researcher | 입력 자산마다 상업 사용 근거, 원본 URL, 해시 있음 |
| G3 Originality | creative-strategist | 레퍼런스 표현 복제 없음, 고유한 viewer promise 있음 |
| G4 Experience | policy-qa-reviewer | 사용하지 않은 제품의 1인칭 체험 주장 0건 |
| G5 Disclosure | policy-qa-reviewer | AI·제휴·협찬·가상인물 표시 계획이 적용 규칙과 일치 |
| G6 Cost | open-generative-ai-operator | 모델 계약, 9:16, 샷 수, 견적, 잔액, 유료 실행 승인 일치 |
| G7 Provenance | open-generative-ai-operator | 각 job에 모델, endpoint, request id, prompt hash, output hash 기록 |
| G8 Media QA | assembly-editor + policy-qa-reviewer | 9:16, 길이, 오디오, 자막, 제품 정확성, 전체 재생 검수 |
| G9 Release | release-controller | exact package digest와 외부 행동 확인 일치 |

G0-G5가 통과하기 전에 G6 유료 호출을 시작하지 않는다.

## 5. Core JSON examples

### `run.json`

```json
{
  "schema_version": 1,
  "run_id": "20260901-0900-product-slug",
  "status": "intake",
  "created_at_kst": "2026-09-01T09:00:00+09:00",
  "product_id": null,
  "commerce_mode": "unknown",
  "experience_mode": "sourced-only",
  "max_outputs": 1,
  "revision_loops": 0,
  "gates": {},
  "output_paths": []
}
```

### `intake/product.json`

```json
{
  "product_id": "brand-model",
  "name": "공식 상품명",
  "canonical_url": "https://example.com/product",
  "seller": "판매자",
  "manufacturer": "제조사",
  "category": "home-appliance",
  "market": "KR",
  "channel": {
    "platform": "youtube-shorts",
    "channel_id": null,
    "account_type": "unknown",
    "program_enrollment": "unknown",
    "commerce_attachment": "unknown",
    "publication_adapter": "youtube-shorts-v1"
  },
  "commercial_relationship": {
    "affiliate": true,
    "gifted": false,
    "sponsored": false,
    "self_owned_brand": false
  },
  "visual_effect_score": 0,
  "review_evidence_count": 0,
  "notes": []
}
```

점수는 판매 예측이 아니다. `visual_effect_score`와 `review_evidence_count`는 후보 비교를 위한 운영 신호다.

### `research/commerce-platforms.json`

아래는 source registry와 필수 ID만 보이는 축약 예시다. 실제 파일은 `references/commerce-program-catalog.kr.json`의 20개 program object를 모두 포함한다.

```json
{
  "schema_version": 1,
  "run_id": "20260901-0900-product-slug",
  "market": "KR",
  "research_status": "complete",
  "freshness_mode": "live",
  "researched_at_kst": "2026-09-01T11:30:00+09:00",
  "required_program_ids": [
    "youtube-ypp",
    "youtube-shopping-affiliate",
    "coupang-partners",
    "zigzag-sharing-reward",
    "zigzag-creator-lounge",
    "naver-clip-ad-incentive",
    "naver-shopping-connect",
    "instagram-gifts",
    "instagram-subscriptions",
    "instagram-bonuses",
    "instagram-creator-marketplace",
    "instagram-shopping-tags",
    "tiktok-creator-rewards",
    "tiktok-video-gifts",
    "tiktok-one-marketplace",
    "tiktok-shop-affiliate",
    "x-creator-revenue-sharing",
    "x-original-content-rewards",
    "x-creator-subscriptions",
    "x-paid-partnerships"
  ],
  "sources": [{
    "source_id": "cp-guide",
    "provider": "coupang",
    "url": "https://partners.coupangcdn.com/partners-guide/partners-guide-20260611145240.pdf",
    "title": "쿠팡 파트너스 이용 가이드",
    "source_kind": "official-help",
    "retrieved_at_kst": "2026-09-01T11:30:00+09:00"
  }],
  "programs": [],
  "unknowns": []
}
```

각 program object는 자격, 계정 상태, 매체 등록, attribution, 요율·지급 관측 시각, 고지, 콘텐츠 제한, 공식 API, 데이터 보존, 자산 조건을 가진다. `fixture` freshness는 `YYYYMMDD-HHMM-fixture-*` 형식의 테스트 run과 환경변수 `SHOPPING_SHORTS_ALLOW_FIXTURE=1`이 동시에 있을 때만 허용한다.

### `strategy/commerce-route.json`

```json
{
  "schema_version": 1,
  "run_id": "20260901-0900-product-slug",
  "selected_at_kst": "2026-09-01T11:40:00+09:00",
  "platform_research_sha256": "<64 hex>",
  "route_status": "creative-only",
  "publication_surface": "youtube-shorts",
  "monetization_program": "none",
  "product_source": "owned-product",
  "program_ids": [],
  "production_supported": true,
  "account_checks": [{
    "check": "Current affiliate account status",
    "status": "unknown",
    "evidence": "No current account UI was available."
  }],
  "media_registration": "not-required",
  "asset_terms_status": "verified",
  "required_disclosures": [],
  "cta_constraints": [],
  "automation_constraints": [],
  "compliance_evidence": [],
  "blocking_unknowns": ["Affiliate enrollment is unknown."],
  "selection_reason": "Plan a non-monetized draft without tags or affiliate links."
}
```

`commerce-ready`에는 계정 체크의 `unknown|failed`가 없어야 한다. 카탈로그의 `research-only|supporting-only`와 비선택 상태는 primary rail이 될 수 없다. 쿠팡 경로는 매체 등록 `verified`, CTA token `no-click-inducement`, automation token `api-data-retention-restricted`가 필요하다. Instagram 상업 경로는 disclosure token `instagram-paid-partnership-label`이 필요하다. TikTok 상업 경로는 automation token `tiktok-commercial-content-toggle`과 `tiktok-kr-category-screen`이 모두 필요하다. X 상업 경로는 supporting program `x-paid-partnerships`, disclosure token `x-paid-partnership-label`, automation token `x-third-party-video-ad-screen`을 기록한다. screen token은 자체 증거가 아니다. `compliance_evidence`에 control id, 상품·영상 subject, 허용·동의 판정, 공식 source id, KST 관측시각, 검수자, `research/screens/` 아래 이미지와 SHA-256을 함께 기록해야 한다. TikTok은 `allowed`, X는 `not-present|consent-confirmed`만 통과한다. Instagram·TikTok·X는 현재 public release adapter가 없으므로 `--stage research`와 creative plan까지만 허용하며 pre-render에는 진입하지 않는다.

소셜 경로의 관측 기준:

- Instagram의 Gifts, Subscriptions, Creator Marketplace는 한국에서 **만 19세 이상**으로 기록한다. Bonuses는 이를 재사용하지 않고 별도 관측값으로 관리한다. 2026-09-01 공식 도움말 관측상 Reels bonus는 직전 3개월 500만 Reels 조회, photo/carousel bonus는 시장별 월간 최저 조회를 3개월 연속 충족하며 한국 표는 월 100만으로 분리돼 있었다. 실제 자격은 초대와 앱 내 offer가 진실원이다.
- TikTok 상업 콘텐츠 토글은 카테고리 허용을 뜻하지 않는다. 한국의 현재 prohibited/restricted industry 표를 상품 단위로 먼저 대조한다. 공식 근거 호스트로 `ads.tiktok.com/help/article/`와 `ads.tiktok.com/resources/help/article/`만 추가 허용한다.
- X의 기존 Creator Revenue Sharing은 2026-09-07 종료 예정이고 Original Content Rewards는 2026-09-08 시작 예정이다. freshness window가 그 경계를 넘으면 과거 상태를 재사용하지 않는다. 영상 프리롤 광고와 sponsorship graphic은 별도 사전 동의가 필요하므로 paid-partnership label만으로 통과시키지 않는다.

### `validation/commerce.json`

```json
{
  "schema_version": 1,
  "run_id": "20260901-0900-product-slug",
  "verdict": "PASS",
  "commerce_mode": "creative-only",
  "platform_research_sha256": "<64 hex>",
  "route_sha256": "<64 hex>",
  "checked_at_kst": "2026-09-01T11:41:00+09:00",
  "blocking_unknowns": ["Affiliate enrollment is unknown."],
  "notes": []
}
```

해시가 현재 파일과 다르면 G0는 FAIL이다.

### `research/evidence.json`

```json
{
  "claims": [
    {
      "claim_id": "c01",
      "claim": "제품의 검증할 기능",
      "status": "verified",
      "source_url": "https://example.com/manual",
      "publisher": "Manufacturer",
      "retrieved_at": "2026-09-01T09:10:00+09:00",
      "quote_or_coordinate": "manual p.4",
      "freshness": "stable-spec",
      "caveat": null,
      "used_in": ["voiceover:line-2", "shot:s03"]
    }
  ],
  "coverage": 1.0
}
```

리뷰는 체험담의 존재를 보여줄 수 있지만 제품 성능의 보편적 증거는 아니다. 리뷰 원문 표현을 대사로 복제하지 않는다.

### `research/rights.json`

```json
{
  "assets": [
    {
      "asset_id": "a01",
      "local_path": "_workspace/current/intake/assets/front.png",
      "source_url": "https://example.com/original",
      "creator_or_owner": "Owner",
      "rights_basis": "owned",
      "license_url": null,
      "permission_evidence": "Creator supplied and confirmed ownership",
      "commercial_use": true,
      "transformation_allowed": true,
      "sha256": "<64 hex>",
      "contains_person": false,
      "contains_third_party_mark": false
    }
  ]
}
```

허용 `rights_basis`:

- `owned`
- `written-permission`
- `licensed-commercial`
- `public-domain`
- `cc-by`
- `cc-by-sa`
- `platform-affiliate-asset-with-verified-terms`

`unknown`, 단순 페이지 캡처, 워터마크 제거본은 금지다.

### `strategy/concepts.json`

```json
{
  "concepts": [
    {
      "concept_id": "k01",
      "viewer": "고층 창문을 안전하게 관리하려는 세입자",
      "problem": "외창 청소가 어렵고 위험함",
      "hook": "손이 닿지 않는 바깥 유리를 화면에서 먼저 보여준다",
      "proof": ["c01"],
      "caveat": "모서리·프레임 적합 여부는 모델별 확인 필요",
      "cta": "설명란의 제휴 고지를 확인한 뒤 상세 사양을 비교하세요",
      "reference_abstraction": "problem-first visual transformation",
      "copied_expression": false,
      "score": {
        "viewer_fit": 2,
        "visible_proof": 2,
        "evidence_strength": 2,
        "originality": 2,
        "production_feasibility": 1
      }
    }
  ]
}
```

추천 기준은 7/10 이상이지만 알고리즘 임계값이나 성과 보장이 아니다. 최고점도 권리·표시·비용 게이트를 우회하지 못한다.

### `production/storyboard.md`

스토리보드는 자유 산문이 아니라 hash-bound 계약이다.

```markdown
- Contract: `generated_text_policy: forbid-generated-typography`
- Selected concept SHA-256: `<strategy/selected-concept.json의 실제 SHA-256>`
- Render plan SHA-256: `<production/render-plan.json의 실제 SHA-256>`

| Shot | Time | Visual proof | Voiceover | Overlay text | Claim IDs | Asset IDs |
|---|---|---|---|---|---|---|
| s01 | 0-5s | 검증할 시각 증거 | 대사 또는 none | 후반 자막 또는 none | c01 | a01 |
```

행 수와 순서는 render plan과 같고, 시간은 샷 길이의 누적값과 일치해야 한다. Claim IDs와 Asset IDs도 해당 샷 배열과 정확히 같아야 한다. digest가 낡았거나 decoy 행이 있으면 pre-render가 실패한다.

### `production/render-plan.json`

```json
{
  "source_repo": "https://github.com/Anil-matcha/Open-Generative-AI",
  "source_sha": "5482a777047c0df189eef989ff994d0d7a1d2874",
  "execution_surface": "muapi-api",
  "currency": "credits",
  "estimated_cost": null,
  "balance_verified": false,
  "paid_execution_approved": false,
  "generated_text_policy": "forbid-generated-typography",
  "output": {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "duration_seconds": 30
  },
  "shots": [
    {
      "shot_id": "s01",
      "mode": "i2v",
      "endpoint": "<verified-model-endpoint>",
      "duration_seconds": 5,
      "aspect_ratio": "9:16",
      "resolution": "720p",
      "prompt": "Temporal change only; product identity must remain unchanged.",
      "source_asset_ids": ["a01"],
      "claim_ids": [],
      "output_path": "_workspace/current/production/clips/s01.mp4"
    }
  ]
}
```

`prepare-render-plan.mjs`는 모델을 선택하거나 네트워크를 호출하지 않는다. 계획을 provider request로 정규화하고 위험한 누락을 차단한다. `generated_text_policy` 문자열만 믿지 않고, shot prompt와 provider payload에 읽히는 글씨·자막·로고·워터마크 생성을 요구하는 긍정형 지시가 있으면 실패한다.

### `assembly/timeline.json`

```json
{
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "clips": [
    {"path": "../production/clips/s01.mp4", "duration_seconds": 5}
  ],
  "voiceover": "voiceover.wav",
  "music": null,
  "caption_plan": "captions.json",
  "captions": "captions.ass",
  "music_gain_db": -18,
  "output_duration_seconds": 30
}
```

생성 클립의 프롬프트에는 합성 글씨·자막·워터마크 금지를 넣고, 화면 글씨는 조립 단계가 소유한다. `captions.json`은 `typewriter`와 `max_lines: 2`를 고정하며 `build-typewriter-captions.mjs`가 ASS를 새 파일로만 만든다. ASS에는 generator id와 caption plan SHA-256이 봉인된다. 조립·최종 검증은 주석 존재만 보지 않고 공용 계약 모듈로 ASS를 다시 만들어 **전체 바이트가 정확히 같은지** 대조한다. `.ass`가 아니거나 cue 시간·줄바꿈·typing/hold 계약이 틀리면 실패한다. 실제 폰트 렌더, 세이프 에어리어, 자막 속도, burn-in은 전체 재생 QA로 확인한다. 제품에 원래 인쇄된 실제 표시는 제거 대상이 아니다.

조립기는 모든 클립 오디오를 버리고 명시한 voiceover/BGM만 사용한다. 제품 시연음이 중요하면 별도 소유 음원을 voiceover 트랙에 믹싱하거나 타임라인 확장 전에 계획을 수정한다.

### `validation/qa.json`

```json
{
  "reviewer_independent": true,
  "claim_coverage": 1.0,
  "unverified_claims": 0,
  "fabricated_experience": false,
  "asset_rights_complete": true,
  "product_identity_preserved": true,
  "product_behavior_supported": true,
  "generated_footage_text_free": true,
  "reference_expression_copied": false,
  "batch_count": 1,
  "realistic_synthetic_content": true,
  "youtube_ai_disclosure": "yes",
  "paid_promotion_toggle": "required",
  "commercial_disclosure": {
    "required": true,
    "onscreen": true,
    "description": true,
    "text": "선택한 제휴 경로의 현재 공식 고지 문구"
  },
  "virtual_person": {
    "present": false,
    "label_visible_while_present": false
  },
  "visual_review": {
    "start_frame": true,
    "middle_frame": true,
    "end_frame": true,
    "full_playback": true
  },
  "generated_text_review": {
    "reviewer_id": "independent-reviewer",
    "reviewed_at_kst": "2026-09-01T12:00:00+09:00",
    "final_media_path": "assembly/final.mp4",
    "final_media_sha256": "<64 hex>",
    "source_clips": [{
      "path": "production/clips/s01.mp4",
      "sha256": "<64 hex>",
      "unexpected_generated_typography_found": false,
      "unexpected_watermark_found": false
    }],
    "frame_checks": [{
      "position": "start",
      "path": "validation/frames/start.png",
      "sha256": "<64 hex>",
      "source_media_sha256": "<64 hex>",
      "timestamp_seconds": 0.1,
      "unexpected_generated_typography_found": false,
      "unexpected_watermark_found": false
    }, {
      "position": "middle",
      "path": "validation/frames/middle.png",
      "sha256": "<64 hex>",
      "source_media_sha256": "<64 hex>",
      "timestamp_seconds": 15,
      "unexpected_generated_typography_found": false,
      "unexpected_watermark_found": false
    }, {
      "position": "end",
      "path": "validation/frames/end.png",
      "sha256": "<64 hex>",
      "source_media_sha256": "<64 hex>",
      "timestamp_seconds": 29.9,
      "unexpected_generated_typography_found": false,
      "unexpected_watermark_found": false
    }],
    "full_playback_reviewed": true
  },
  "caption_overlay": {
    "source": "assembly-generated",
    "animation": "typewriter",
    "max_lines": 2,
    "font_verified": true,
    "safe_area_verified": true,
    "burn_in_verified": true
  },
  "technical": {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "duration_seconds": 30,
    "video_codec": "h264",
    "audio_peak_dbfs": -3,
    "captions_safe": true
  },
  "verdict": "PASS",
  "findings": []
}
```

가상인물이 등장하면 `present=true`와 `label_visible_while_present=true`가 모두 필요하다. `generated_footage_text_free=true` 불리언만으로는 통과하지 않는다. `generated_text_review`가 최종 MP4와 타임라인의 모든 고유 원본 클립, 시작·중간·끝 프레임의 실제 SHA-256을 묶고 전체 재생을 기록해야 한다. 프레임은 최종 미디어 SHA와 예상 시각에 묶인다. 최종 검증은 `.mp4` 이름과 해시만 보지 않고 `verify-media.mjs`로 실제 스트림을 probe해 해상도·fps·길이·codec을 `technical` 값과 대조한다. 후반 오버레이 자막은 `caption_overlay`에서 따로 검증한다.

### `release/package.json`

```json
{
  "platform": "youtube-shorts",
  "channel_id": "<exact channel>",
  "video_path": "assembly/final.mp4",
  "video_sha256": "<64 hex>",
  "title": "검증 가능한 제목",
  "description": "고지와 출처가 포함된 설명",
  "tags": [],
  "product_tag_ids": [],
  "youtube_ai_disclosure": "yes",
  "paid_promotion_toggle": true,
  "commercial_disclosure_text": "선택한 제휴 경로의 현재 공식 고지 문구",
  "publication_approved": false,
  "published_url": null
}
```

`publication_approved=true`는 사용자의 실제 확인 없이 파일에 적어 넣을 수 없다.

### `release/receipt.json`

공개 후에는 업로드 응답이 아니라 실제 공개 URL을 다시 읽은 결과를 별도 receipt에 남긴다. `platform`, catalog의 `release_adapter_id`, video SHA-256, URL, 공개 시각, live 제목·설명·라벨·제품 태그가 package와 일치하고 `verification=PASS`여야 `--stage release`가 통과한다.

## 6. Open-Generative-AI execution lanes

### Lane A: MuAPI remote

- 자동화에 가장 적합하지만 유료 크레딧과 API 키가 필요하다.
- `x-api-key` 인증, `POST /api/v1/<endpoint>`, `request_id` 폴링.
- 모델별 입력 필드, 길이, 해상도, 9:16 지원을 고정 SHA의 카탈로그에서 확인한다.
- 비용 추정이 제공되지 않는 모델은 비용 미확정으로 차단한다.

### Lane B: Open-Generative-AI GUI

- 사람이 앱에서 모델과 입력을 선택하는 manual-finish 경로다.
- 하네스는 render plan과 입력 자산을 제공하고 결과 파일을 다시 인수한다.
- GUI에서 성공으로 보인다는 사실은 제품 정확성이나 정책 통과의 증거가 아니다.

### Lane C: Wan2GP bridge

- 별도 CUDA 머신과 사용자가 직접 운영하는 Gradio 서버가 필요하다.
- 저장소는 Python과 weights를 번들하지 않는다.
- 사용 가능한 API name은 서버 `/info` 결과에 따라 바뀔 수 있다.

## 7. Technical QA

`ffprobe`로 확인할 항목:

- 정확한 `1080x1920` 또는 승인된 9:16 해상도.
- 24~60fps의 안정된 프레임률. 기본 30fps.
- 목표 길이 15~60초.
- H.264 + AAC, `yuv420p`, faststart.
- 오디오 clipping 없음, 음성 명료성, BGM이 음성을 가리지 않음.
- 자막이 우측 버튼 영역과 하단 설명 영역에 가려지지 않음.

사람이 확인할 항목:

- 첫 1초에 제품 문제 또는 변화가 이해됨.
- 제품 모양, 로고, 구성품, 안전장치가 샷 사이에서 바뀌지 않음.
- 없는 기능, 비현실적 속도, 과장된 전후 비교가 없음.
- 생성된 손, 텍스트, 유리 반사, 케이블, 안전로프에 결함이 없음.
- CTA가 시청자에게 광고·제휴 사실을 숨기지 않음.

## 8. Validation commands

카탈로그 스킬 자체(jeo-skills 저장소 루트에서):

```bash
bash .agent-skills/skill-standardization/scripts/validate_skill.sh \
  .agent-skills/shopping-shorts
```

하네스 미리보기와 설치:

```bash
node scripts/init-harness.mjs --target /absolute/project
node scripts/init-harness.mjs --target /absolute/project --apply
node scripts/validate-harness.mjs --root /absolute/project
```

실행 패킷:

```bash
node scripts/validate-commerce-research.mjs \
  --platforms /absolute/project/_workspace/current/research/commerce-platforms.json
node scripts/validate-commerce-research.mjs \
  --platforms /absolute/project/_workspace/current/research/commerce-platforms.json \
  --route /absolute/project/_workspace/current/strategy/commerce-route.json \
  --receipt /absolute/project/_workspace/current/validation/commerce.json \
  --require-route
node scripts/validate-run.mjs --root /absolute/project/_workspace/current --stage research
node scripts/validate-run.mjs --root /absolute/project/_workspace/current --stage pre-render
node scripts/validate-run.mjs --root /absolute/project/_workspace/current --stage final
node scripts/verify-media.mjs --file /absolute/project/_workspace/current/assembly/final.mp4
```

## 9. Failure recovery

| Failure | Safe response |
|---|---|
| YPP/Shopping 자격 미확인 | `creative-only`; 제품 태그·수익 주장·유료 렌더 금지 |
| 카탈로그의 20개 필수 프로그램 또는 공식 source 누락 | G0a FAIL; 다른 단계로 진행하지 않음 |
| live 플랫폼 조사 7일 초과 | 현재 공식 문서·계정 UI로 다시 조사 |
| 공식 문서끼리 기준 불일치 | 둘 다 기록하고 현재 계정 UI 확인 전 `creative-only` |
| 쿠팡 매체 등록 미확인 | 제휴 링크 제거, `creative-only` |
| Instagram Reels·TikTok·X·네이버 경로 선택 | 현재 public release adapter 미구현으로 production 차단 |
| 제품 이미지 권리 불명 | 소유자가 제공한 사진 또는 서면 허가 자산으로 교체 |
| 모델이 9:16 미지원 | 다른 모델을 고르거나 승인받은 9:16 후처리 계획 작성 |
| 단일 모델 길이 부족 | 샷을 나누고 로컬 ffmpeg로 조립 |
| 비용 추정 실패 | 호출하지 않고 `blocked: cost unknown` |
| API 401/403 | 키를 요청하지 말고 인증 설정 화면 또는 환경변수 경로 안내 |
| 생성 성공, 제품 왜곡 | 실패 자산 보존, 프롬프트/참조를 한 번만 수정해 재검토 |
| 두 번 수정 후 결함 지속 | `blocked`; 더 많은 유료 재시도 금지 |
| ffmpeg 없음 | 명령만 보존하고 설치·패키지 변경 전에 확인 |
| 공개 후 URL/표시 불일치 | 완료로 보고하지 말고 수정안을 준비한 뒤 다시 확인 |

## 10. Measurement after release

성과 측정은 영상 제작과 분리한다. 공개 승인이 있는 경우에만 실제 업로드 후 D1, D7, D28을 기록한다.

- 조회수보다 먼저 첫 1~3초 이탈, 평균 시청 지속, 반복 재생, 제품 태그 클릭 가능 여부를 본다.
- 판매·수익은 반품·귀속·정산 지연을 포함한 플랫폼 1차 데이터로만 기록한다.
- 한 편의 이상치를 성공 공식으로 일반화하지 않는다.
- 다음 영상은 하나의 가설만 바꾼다.
