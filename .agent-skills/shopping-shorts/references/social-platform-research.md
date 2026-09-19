# Social Platform Revenue and Commerce Research

관측 기준: **2026-09-01 KST**. 대상 시장: **대한민국**.

이 문서는 Instagram, TikTok, X의 게시 표면·수익 레일·커머스·고지·AI 표시·공식 API를 분리한 조사 기준선이다. 프로그램 수치와 상태는 빠르게 바뀌므로 `research/commerce-platforms.json`의 live 실행에서 7일 이내 공식 소스로 다시 확인한다.

## Shared interpretation rules

- 플랫폼에 프로그램이 존재하는 것과 현재 계정이 사용할 수 있는 것은 별개다.
- 방문 이력, 로그인 흔적, 일반 계정 사용은 수익화 가입·승인 증거가 아니다.
- 팔로워·조회수·요율·API 가격은 관측값이다. 코드 상수로 승격하지 않는다.
- Meta Help·Developer 문서는 자동 fetch에서 HTTP 400을 반환할 수 있다. 이를 페이지 부재로 단정하지 말고 canonical `/docs/` 경로와 로그인된 브라우저에서 재검증한다.
- 게시 API 존재는 제품 태그·제휴 링크·고지 토글까지 API로 지원한다는 뜻이 아니다.
- `account_status: unknown` 또는 지역 공식 근거 부재는 `creative-only`로 접는다.
- 종료 예정·신규 가입 중단·미래 시행 프로그램은 현재 활성 프로그램과 분리한다.

## Instagram

### Instagram Gifts

- Reels Gifts 수신 가능 국가에 **South Korea**가 포함된다.
- 한국 공식 eligibility 기준선은 professional account, **만 19세 이상**, Partner Monetization Policies 준수, 팔로워 500명 이상, payout account 설정이다.
- collaborative posts와 주로 아동 콘텐츠를 게시하는 계정은 Gifts 수익 대상에서 제외된다.
- 계정의 Professional dashboard와 payout onboarding을 확인하기 전에는 `account_status: unknown`이다.

공식 소스:

- `https://help.instagram.com/523408036294825/`
- `https://www.facebook.com/business/help/738469380549477`

### Instagram Subscriptions

- 한국 공식 기준선은 professional account, **만 19세 이상**, Partner/Content Monetization Policies 준수, 팔로워 10,000명 이상이다.
- 공식 가용 국가 목록에 **South Korea**가 포함된다.
- 자격 숫자를 충족해도 Professional dashboard에 `Set up subscriptions`가 보여야 실제 경로가 열린 것이다.

공식 소스:

- `https://help.instagram.com/478012211024479`

### Instagram Bonuses

- 2026-09-01 기준 일본·한국·미국 일부 크리에이터 대상 **invite-only** 프로그램이며 한국은 만 19세 이상이다.
- 공식 도움말의 Reels bonus 기준은 직전 3개월 동안 Reels 조회 500만 회다.
- photo/carousel bonus는 별도 표에서 월간 최저 조회를 3개월 연속 충족하도록 하고, 한국은 월 100만 회로 표시한다. 이를 Reels의 500만 기준과 합치지 않는다.
- branded, promotional, paid partnership, collaborative, crossposted content는 bonus earning에서 제외된다. 따라서 쇼핑·협찬 영상의 1차 수익 레일로 선택하지 않는다.
- 과거 Reels Play bonus 종료 사실과 현재 invite-only Bonuses를 섞지 않는다.

공식 소스:

- `https://help.instagram.com/708013994693013`

### Meta Creator Marketplace

- 한국 공식 Help 기준 **만 19세 이상**, 공개 professional account, 팔로워 1,000명 이상이 필요하다.
- Meta 광고가 운영되는 국가의 자격 있는 크리에이터에게 제공되지만 실제 계정 노출·승인은 Professional dashboard에서 확인한다.
- 브랜드 대가성 콘텐츠는 Instagram의 Paid partnership label과 현지 광고법 고지를 함께 적용한다.

공식 소스:

- `https://help.instagram.com/1389278101788752`
- `https://www.facebook.com/business/instagram/join-creator-marketplace`

두 번째 URL은 공식 가입·발견 표면이다. 자격·정책 근거로 source registry에 등록하지 말고 `help.instagram.com`의 현재 도움말을 사용한다.

### Instagram Shopping tags

- Shops·checkout 관련 일부 기능은 더 이상 지원되지 않고, 한국은 공식 국가 안내에서 **open beta**로 분류된다. 일부 판매자는 전체 기능을 쓰지 못할 수 있다.
- Commerce eligibility, shop/catalog, 도메인·신뢰성·정확한 사업정보 등 셀러 조건은 크리에이터 수익화 조건과 별개다.
- Content Publishing API 공식 한계에 **`Shopping tags are not supported`**가 명시된다. 제품 태그가 필요한 Instagram 경로는 수동 앱 handoff이며 자동 게시 adapter로 표시하지 않는다.

공식 소스:

- `https://help.instagram.com/549256849084694`
- `https://www.facebook.com/business/help/2347002662267537`
- `https://developers.facebook.com/docs/instagram-platform/content-publishing/`

### Instagram publishing, disclosure, AI

- 공식 Content Publishing API는 professional account의 Reels 게시를 지원한다.
- API 게시 상한은 Instagram account당 24시간 이동창 100건이며 `content_publishing_limit`로 현재 사용량을 확인할 수 있다.
- 공식 문서상 media container에서 `is_ai_generated=true`로 AI 사용을 자기고지할 수 있다.
- 포토리얼 영상 또는 실사형 음성을 디지털 생성·중대 변형한 콘텐츠는 AI label 대상이며 미표시에 제재가 생길 수 있다.
- Paid partnership label 적용 경로는 공식 Help에서 Instagram 앱을 기준으로 설명한다. 현재 하네스에는 해당 라벨을 안전하게 설정·검증하는 release adapter가 없다.
- 수동·자동을 불문한 초고빈도 게시, 중복 참여, engagement 구매·교환은 금지된다.

공식 소스:

- `https://developers.facebook.com/docs/instagram-platform/content-publishing/`
- `https://help.instagram.com/1123581461537025`
- `https://www.meta.com/help/artificial-intelligence/1783222608822690`
- `https://transparency.meta.com/policies/community-standards/spam/`

## TikTok

### Creator Rewards Program

- 한국은 공식 제공 국가이고 한국 크리에이터의 최소 연령은 **19세**다.
- Personal Account, 정상 상태, 진짜 계정정보, 팔로워 10,000명 이상, 최근 30일 조회 100,000회 이상이 필요하다.
- 보상 대상 영상은 **1분 이상**의 원본·고품질 영상이어야 한다.
- ads, paid promotions, sponsored content는 보상 대상이 아니다.
- 현재 쇼핑 쇼츠 계약은 기본 15~60초이고 상업 콘텐츠를 다루므로 `tiktok-creator-rewards`를 이 하네스의 1차 commerce route로 선택하지 않는다.

공식 소스:

- `https://support.tiktok.com/en/business-and-creator/creator-rewards-program/creator-rewards-program`
- `https://www.tiktok.com/creator-academy/article/creator-rewards-program`

### Video Gifts

- 한국 크리에이터는 19세 이상, 팔로워 10,000명 이상, 계정 개설 30일 이상이어야 한다.
- 최근 30일 공개 영상, Personal Account, 정상 상태 등 계정 조건을 앱에서 재확인한다.
- 브랜드·협찬 영상의 Gifts 적격 여부는 해당 콘텐츠와 계정 UI를 확인하기 전 추정하지 않는다.

공식 소스:

- `https://support.tiktok.com/en/business-and-creator/video-gifts-on-tiktok/video-gifts-on-tiktok`

### TikTok One

- 공식 기준선은 18세 이상, 정상 계정, 팔로워 10,000명 이상, 최근 30일 게시물 조회 1,000회 이상, 최근 30일 게시물 3개 이상이다. 지역별 차이가 있을 수 있다.
- 브랜드 협업·캠페인 경로이며 content disclosure와 Branded Content Policy를 함께 적용한다.

공식 소스:

- `https://support.tiktok.com/en/business-and-creator/tiktok-one`

### TikTok Shop Affiliate in Korea

- TikTok Shop Affiliate 자체와 Partner API는 공식 글로벌 문서에 존재한다.
- 그러나 2026-09-01 조사에서 **한국 로컬 TikTok Shop·creator affiliate 출시를 확정하는 TikTok 공식 발표 또는 한국 Seller Center 진입 경로를 찾지 못했다**.
- 검색 콘텐츠·보도·제3자 시장 목록은 공식 출시 증거가 아니다.
- 따라서 `tiktok-shop-affiliate`의 한국 `program_state`와 `account_status`는 공식 한국 출시 문서와 실제 계정 UI가 확인되기 전 `unknown`이며 `commerce-ready`로 승격하지 않는다.

공식 확인 좌표:

- `https://partner.tiktokshop.com/docv2/page/affiliate-creator-api-overview`
- `https://seller.tiktokshopglobalselling.com/`

### TikTok branded content

- 새 Branded Content Policy는 2026-08-04 게시, **2026-08-31 시행**이다.
- 선물, 현금·현물 대가, affiliate link·promotion code 수수료, brand ambassador 관계가 Branded Content에 포함된다.
- 상업 콘텐츠는 commercial content disclosure toggle을 켜야 하며 제3자 브랜드 콘텐츠는 자동 라벨된다.
- 제품·서비스는 프로필이나 링크를 열지 않아도 음성 또는 캡션에서 명확해야 한다.
- 허위·기만 주장과 금지 산업은 허용되지 않는다.
- commercial content disclosure가 카테고리 허용을 대신하지 않는다. 한국 상품은 게시 전 현재 industry-entry 표에서 `prohibited`, `restricted`, 필요한 certification·연령·타게팅 조건을 별도로 판정한다. 자동 경로의 `allowed` 판정은 공식 source·KST 시각·검수자·`research/screens/` 이미지 SHA-256과 결합한다.
- 2026-09-01 한국 표에는 alcohol, gambling, tobacco/nicotine, drugs·weapons·explosives, counterfeit goods, sexual services·products, live animals, many financial schemes 등이 금지로 표시됐다. financial services, healthcare/medical, food·beverage·supplements, cosmetics·beauty, dating apps, gambling facilitation, infant formula·related foods, OTC medicines·devices 등은 별도 제한과 증빙을 가질 수 있다. 이 요약은 allowlist가 아니며 상품마다 live 표를 다시 읽는다.

공식 소스:

- `https://www.tiktok.com/legal/page/global/bc-policy/en`
- `https://ads.tiktok.com/help/article/tiktok-ads-policy-industry-entry?lang=en`

### TikTok AI and Content Posting API

- 현실적인 AI 생성 이미지·음성·영상은 creator label 또는 자동 label 대상이다.
- Direct Post API는 `video.publish` scope와 사용자 명시 승인이 필요하다.
- unaudited client의 게시물은 private viewing mode로 제한된다. 공개 게시에는 app audit가 필요하다.
- `creator_info/query`의 최신 privacy options를 보여주고 사용자가 고른 값을 그대로 사용해야 한다.
- Direct Post의 `brand_content_toggle`, `brand_organic_toggle`은 필수 필드이고 `is_aigc=true`는 AI label을 적용한다.
- 사용자 access token당 init 요청은 분당 6회이며 일일 게시·active-user cap도 존재한다.
- `PULL_FROM_URL`은 URL prefix 또는 domain ownership verification이 필요하다.
- 이 하네스에는 audited TikTok app·scope·public read-back adapter가 없으므로 `production_supported: false`가 기본이다.

공식 소스:

- `https://support.tiktok.com/en/using-tiktok/creating-videos/ai-generated-content`
- `https://developers.tiktok.com/products/content-posting-api`
- `https://developers.tiktok.com/doc/content-posting-api-get-started`
- `https://developers.tiktok.com/doc/content-posting-api-reference-direct-post`

## X

### Creator Revenue Sharing transition

- **2026-08-07부터 신규 가입이 중단**됐다.
- 프로그램은 **2026-09-07 은퇴**한다.
- 조사 시점인 2026-09-01에는 기존 가입자만 9월 7일까지 earning 가능한 `retiring` 상태다.
- 한국은 지급 지원 국가 목록에 포함된다.

공식 소스:

- `https://help.x.com/en/using-x/creator-revenue-sharing`

### Original Content Rewards

- 기존 Revenue Sharing 회원 대상 신청 rollout은 **2026-09-08 시작 예정**이다. 조사 시점에는 미래이므로 `announced` 상태다.
- 공식 자격 기준은 18세 이상, Personal/Business Account, 정상 상태, Premium/Premium+/Premium Business, 최근 90일 verified 사용자 Home Timeline 노출 500,000회, verified 팔로워 500명 이상, 원본 콘텐츠 활동이다.
- paid·promoted·artificial impressions는 qualified impressions에서 제외된다.
- 복사·최소 수정·무기여 집계 콘텐츠는 원본으로 인정되지 않는다.
- 공식 부적격 목록에는 **automated means로 생성 또는 게시된 콘텐츠**가 포함된다. AI 생성·자동 조립을 핵심으로 하는 이 하네스에서는 1차 수익 레일로 선택하지 않는다.
- 2026-03-03부터 AI 생성 무장충돌 영상을 AI 고지 없이 게시하면 90일 수익화 정지, 재위반 시 영구 지급 정지 대상이다.
- 한국은 공식 가용 국가다.

공식 소스:

- `https://help.x.com/en/using-x/original-content-rewards`

### X Creator Subscriptions

- 18세 이상, 최근 30일 활동, verified 팔로워 2,000명 이상, 최근 3개월 유기적 노출 500만 회가 최소 application 기준이다.
- 한국은 가용 국가다.
- 공식 Help의 관측값은 gross revenue 최대 약 97%, 최소 지급 $50, 수익월 종료 약 60일 후 지급이다. 플랫폼 수수료·환불·chargeback 등에 따라 달라지므로 동적 관측값으로만 저장한다.

공식 소스:

- `https://help.x.com/en/using-x/subscriptions-creator`

### X paid partnerships and external affiliate links

- 선물, 금전·현물 대가, affiliate link·discount code 수수료, brand ambassador 관계가 Paid Partnership에 포함된다.
- organic Post에는 composer의 **Paid Partnership disclosure**를 켜야 한다.
- 제품·서비스·CTA는 추가 링크를 클릭하지 않아도 명확해야 한다.
- X Rules의 Third-party advertising in video content 조항은 프리롤 광고와 sponsorship graphic을 사전 동의 없이 넣는 것을 금지한다. Paid Partnership disclosure는 이 별도 동의를 대신하지 않는다. 자동 경로는 `not-present|consent-confirmed` 판정을 공식 source·KST 시각·검수자·화면 이미지 SHA-256과 묶는다.
- X의 creator-side native product-tag affiliate 프로그램은 조사한 공식 creator 문서에서 확인되지 않았다. 외부 제휴 레일과 X disclosure control을 분리한다.
- 현재 하네스에는 Paid Partnership control을 설정·라이브 재검증하는 X release adapter가 없다.

공식 소스:

- `https://help.x.com/en/rules-and-policies/paid-partnerships-policy`

### X API and automation

- X API는 2026-09-01 현재 pay-per-usage credits 모델이다. endpoint 가격은 Developer Console의 현재값이 진실원이다.
- 공식 관측값은 일반 Post Create와 URL 포함 Post Create의 가격이 다르며 `Prices are subject to change`를 명시한다. 제휴 링크 게시 비용을 코드 상수로 두지 않는다.
- API 기반 자동 게시 자체는 허용되는 사용 사례가 있지만 중복·대량·스팸·오해를 일으키는 링크는 금지된다.
- X 웹사이트 scripting 같은 비API 자동화는 영구 정지 사유가 될 수 있다.
- Original Content Rewards 적격성과 API 게시 가능성은 별개다. API로 게시할 수 있어도 보상 적격이라는 뜻이 아니다.

공식 소스:

- `https://docs.x.com/x-api/getting-started/pricing`
- `https://help.x.com/en/rules-and-policies/x-automation`

## Release adapter matrix

| Publication surface | Research | Creative plan | Public auto-release | Native product attachment |
|---|---:|---:|---:|---:|
| YouTube Shorts | yes | yes | `youtube-shorts-v1` only | adapter-supported after account checks |
| Instagram Reels | yes | yes | no | Content Publishing API says shopping tags unsupported |
| TikTok video | yes | yes | no | KR Shop availability not officially verified; API audit absent |
| X video post | yes | yes | no | no creator native product-tag program found |
| Naver Clip | yes | yes | no | public upload/tag API not found |

`production_supported: true`는 release adapter가 실제로 존재하고 계정·scope·고지 control·공개 read-back까지 검증될 때만 허용한다.

## Fail-closed rules

1. `announced`, `retiring`, `enrollment-closed`, `ended`, `not-available`, `unknown` 프로그램은 `commerce-ready`의 primary rail이 될 수 없다.
2. Instagram Bonuses, TikTok Creator Rewards, X Original Content Rewards는 이 AI 쇼핑 쇼츠 하네스에서 `research-only`다.
3. `x-paid-partnerships`는 disclosure route이므로 primary monetization program이 될 수 없다.
4. Instagram shopping tags는 수동 앱 handoff 없이 자동 태그됐다고 표시하지 않는다.
5. TikTok Shop 한국 공식 가용성과 계정 UI를 확인하지 못하면 affiliate route를 선택하지 않는다.
6. TikTok 상업 경로는 commercial toggle과 별개로 현재 한국 industry-entry category screen을 통과해야 한다.
7. TikTok public Direct Post는 audited client, `video.publish`, creator consent, 최신 creator info, commercial/AI toggles가 모두 확인돼야 한다.
8. X Revenue Sharing의 은퇴 날짜와 Original Content Rewards 시행 날짜를 한쪽으로 합치지 않는다.
9. X 영상의 프리롤 광고·sponsorship graphic은 사전 동의 검토 없이 허용하지 않는다.
10. 모든 플랫폼에서 affiliate·협찬 관계는 플랫폼 label/toggle과 한국 표시광고 의무를 함께 적용한다.
