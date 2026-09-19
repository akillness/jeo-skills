# 한국 쇼핑 쇼츠 수익 경로 조사 계약

기준 스냅샷: **2026-09-01 KST**. 이 문서는 가입 자격을 보장하는 목록이 아니라, 매 run에서 다시 확인할 조사 기준선이다. 요율·캠페인·초대 상태·계정 자격은 바뀔 수 있으므로 현재 공식 문서와 로그인된 계정 UI를 우선한다.

## 1. 먼저 세 층을 분리한다

하나의 플랫폼 이름으로 세 층을 뭉뚱그리지 않는다.

1. **게시 표면**: YouTube Shorts, Instagram Reels, TikTok video, X video post, 네이버 클립 등 영상이 공개되는 곳.
2. **수익 레일**: YPP 광고, YouTube Shopping, 쿠팡 파트너스, 지그재그 공유리워드, 네이버 쇼핑 커넥트 등.
3. **상품·자산 출처**: 판매 상품 URL, 직접 촬영한 제품, 판매자가 제공한 자산, 캠페인 전용 자산 등.

예: `YouTube Shorts + 쿠팡 파트너스 + 직접 촬영 자산`은 한 경로다. YouTube에 게시한다고 YouTube Shopping 자격이 자동으로 생기지 않고, 쿠팡 상품 페이지를 찾았다고 이미지 재편집 권리가 자동으로 생기지 않는다.

## 2. 필수 조사 프로그램

`research/commerce-platforms.json`은 `commerce-program-catalog.kr.json`의 20개 `program_id`를 항상 포함한다.

| Provider | Required program IDs |
|---|---|
| YouTube | `youtube-ypp`, `youtube-shopping-affiliate` |
| 한국 커머스 | `coupang-partners`, `zigzag-sharing-reward`, `zigzag-creator-lounge`, `naver-clip-ad-incentive`, `naver-shopping-connect` |
| Instagram | `instagram-gifts`, `instagram-subscriptions`, `instagram-bonuses`, `instagram-creator-marketplace`, `instagram-shopping-tags` |
| TikTok | `tiktok-creator-rewards`, `tiktok-video-gifts`, `tiktok-one-marketplace`, `tiktok-shop-affiliate` |
| X | `x-creator-revenue-sharing`, `x-original-content-rewards`, `x-creator-subscriptions`, `x-paid-partnerships` |

ID·provider·route role·게시 표면 호환성은 `commerce-program-catalog.kr.json`이 진실원이다. Instagram·TikTok·X의 공식 조건과 2026년 전환일은 `social-platform-research.md`를 함께 읽는다. 지그재그의 YouTube Shopping 연동은 `youtube-shopping-affiliate`의 판매처 후보와 `zigzag-sharing-reward`를 혼동하지 않고 별도 메모로 기록한다.

## 3. 조사 축

각 프로그램은 최소 다음 축을 채운다.

- 프로그램 상태: `active|invite-only|limited|announced|enrollment-closed|retiring|ended|not-available|unknown`
- 계정 상태: `eligible|registered|approved|pending|not-eligible|unknown|not-applicable`
- 가입·심사 요건과 각 요건의 실제 충족 여부
- 매체·채널 사전 등록 여부
- 직접·간접 기여와 귀속 시간
- 수수료·광고수익의 산정 기준과 관측 시각
- 확정·지급 일정과 최소 지급 조건
- 영상·설명·댓글·플랫폼 UI의 표시 의무
- 금지 상품·금지 CTA·양산형·AI 콘텐츠 제한
- 링크 생성·리포트·업로드의 공식 자동화 표면
- 상품 이미지·로고·데이터의 저장·변형·재사용 권리
- 공식 문서로 확인하지 못한 항목

공식 소스는 주장마다 URL과 `retrieved_at_kst`를 기록한다. 요율은 숫자만 저장하지 말고 `status`, `value`, `observed_at_kst`, `source_ids`를 함께 저장한다.

## 4. 공식 기준선

### 4.1 YouTube YPP와 Shopping

YPP는 **YouTube Partner Program**이다. 채널이 YouTube의 수익화 기능과 크리에이터 지원에 접근하고, 별도 기준을 충족하면 광고수익을 배분받는 프로그램이다.

현재 한국 기준은 두 단계로 분리한다.

- Expanded YPP: 구독자 500명 + 최근 90일 공개 업로드 3개 + 최근 12개월 유효 시청시간 3,000시간 또는 최근 90일 유효 Shorts 조회수 300만 회. 팬 펀딩·Shopping 조기 접근 단계다.
- 광고수익 단계: 구독자 1,000명 + 최근 12개월 유효 시청시간 4,000시간 또는 최근 90일 유효 Shorts 조회수 1,000만 회. Shorts 피드 시청시간은 4,000시간에 포함되지 않는다.

기준을 넘겨도 자동 승인되지 않는다. 정책·활성 경고·2단계 인증·고급 기능·AdSense 연결 등 공통 요건과 채널 심사를 거친다. 500명 단계에 도달했다고 광고수익을 받는 것은 아니다.

YouTube Shopping 제휴는 한국이 지원 국가지만, 숫자만으로 `commerce-ready`를 주지 않는다. YPP 가입, 현재 구독자 기준, Made for Kids 여부, 음악 채널 여부, 실제 Studio `수익 창출` 탭의 초대·가입 표면을 함께 확인한다. 2027-02-01 시행 예정 변경은 시행 전 run에 적용하지 않는다.

공식 소스:

- https://support.google.com/youtube/answer/72851?hl=ko
- https://support.google.com/youtube/answer/13429240?hl=ko
- https://support.google.com/youtube/answer/13376398?hl=ko
- https://blog.youtube/creator-and-artist-stories/youtube-shopping-expansion-500-subscribers
- https://support.google.com/youtube/answer/12504220?hl=ko

### 4.2 쿠팡 파트너스

- 쿠팡 회원 가입과 파트너스 **최종승인**은 다르다. 공식 가이드는 누적 판매금액 15만 원 이상 발생 후 활동 채널 검토를 거쳐야 정산과 API 이용이 가능하다고 설명한다.
- 링크·배너를 게시하는 **모든 페이지와 채널을 활동 페이지로 등록**한다. 미등록 매체는 `commerce-ready`가 아니다.
- 모든 파트너스 게시물에 경제적 이해관계를 쉽게 보이게 표시한다. 공식 권장 문구는 `이 게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.`다.
- 일반 쿠팡 URL이 아니라 파트너스에서 생성한 링크를 사용한다. 현재 공식 가이드는 접속 후 24시간 내 구매를 집계하고, 별도 요율이 없는 상품의 기본 지급률을 결제금액 3%로 설명하지만 상품·카테고리별로 바뀔 수 있다.
- `링크를 클릭하세요`, 자동 클릭·노출, 본인 구매, 무관한 댓글 삽입, 허위·과장 표현을 금지한다. 노출수·클릭수·CTR 등 일부 리포트 지표의 외부 공개도 금지된다.
- Product·Deep Link·Reporting API는 최종승인 후 계정 키로 쓸 수 있다. 키를 파일에 기록하지 않고, API 데이터의 저장·변형·재전송 허용 범위를 endpoint별 약관에서 다시 확인한다.
- 쿠팡 상품 이미지·로고·데이터를 내려받아 변형 영상 자산으로 쓸 포괄적 권리는 확인되지 않았다. 별도 권리가 없으면 G2에서 차단한다.

공식 소스:

- https://partners.coupang.com/
- https://partners.coupangcdn.com/partners-guide/partners-guide-20260611145240.pdf
- https://partners.coupang.com/#help/operating-policy
- https://partners.coupang.com/#help/terms

### 4.3 지그재그

공식 소비자·크리에이터 경로를 섞지 않는다.

- **공유리워드**: 앱에서 본인 계정으로 상품 공유 링크를 발급하고 SNS에 소개한다. 일반 카카오 공유 링크는 성과 링크가 아니다. 앱 약관 동의와 SNS 정보가 필요하며 요율·부스트 여부는 상품·스토어·시점에 따라 변한다.
- **크리에이터 라운지**: 광고·상품 협찬·콜라보·라이브·쿠폰 등의 승인형 캠페인 공간이다. 공식 명칭이 `직잭 크리에이터`라고 가정하지 않는다. 대표 채널, 자체 제작 콘텐츠, 공유리워드 활동 등을 내부 기준으로 심사하며 공개된 단일 팔로워 기준은 없다.
- **YouTube Shopping의 지그재그 상품 태그**: 일정 자격을 충족한 YouTube 크리에이터용 별도 경로다. 공유리워드 링크나 크리에이터 라운지 승인과 동일하지 않다.

모든 경로에서 현재 앱·캠페인 상세의 요율, 선정, 2차 활용권, 필수 해시태그, 콘텐츠 유지 기간을 확인한다. 지그재그의 판매자용 Open API를 크리에이터 링크 발급·캠페인 신청 API로 오인하지 않는다.

공식 소스:

- https://zigzagkr.zendesk.com/hc/ko/sections/6332936710031
- https://zigzagkr.zendesk.com/hc/ko/articles/5397020982287
- https://zigzagkr.zendesk.com/hc/ko/sections/4772543339806
- https://partnerlounge.kakaostyle.com/press/zigzag-youtube-shopping
- https://partnerlounge.kakaostyle.com/knowhow/creator-lounge-open

### 4.4 네이버 클립·쇼핑 커넥트

네이버에는 서로 다른 프로그램이 있다.

- **클립 크리에이터**: 상시 모집형 공식 창작자 프로그램. 2026년 공지는 만 14세 이상 대한민국 국적 지원자, 월 1회 심사, 2026-12-31 활동 종료를 명시한다. 선발 활동비와 광고수익 자격은 같은 것이 아니다.
- **클립 광고 인센티브**: 현재 공식 도움말 기준 클립 프로필 구독자 1,000명 이상 + 최근 90일 동영상 클립 유효 조회수 300만 회 이상을 모두 충족하고 별도 심사를 거친다. 수익 기준액의 45%를 창작자에게 배분한다.
- **쇼핑 커넥트**: 브랜드 커넥트의 제휴 경로다. 블로그·클립·Instagram·YouTube 중 하나 이상의 채널을 운영하면 구독자 수 제한 없이 이용 가능하지만, 브랜드 커넥트 가입, 쇼핑 커넥트 약관 동의, 클립 에디터와 동일한 네이버 ID가 필요하다. 클립 상품 태그는 판매자가 등록한 상품만 검색된다.

네이버 클립은 AI 활용 설정을 별도로 요구한다. AI 생성 영상·음성·자막을 거의 그대로 게시하거나, 동일 템플릿을 단기간 대량 생산하거나, 타인의 얼굴·음성을 무단 합성한 콘텐츠는 수익화에서 제외될 수 있다. 공식 공개 API 목록에서 클립 업로드·쇼핑 커넥트 링크 발급·태그 삽입 API는 확인되지 않았으므로 자동 게시를 가정하지 않는다.

공식 소스:

- https://mkt.naver.com/clip-creators
- https://help.naver.com/service/30048/contents/24456?lang=ko
- https://help.naver.com/service/30048/contents/24424?lang=ko
- https://help.naver.com/service/30048/contents/25229?lang=ko
- https://help.naver.com/service/30027/contents/24394?lang=ko&osType=COMMONOS
- https://brandconnect.naver.com/about/creator

### 4.5 Instagram·TikTok·X

- Instagram Gifts·Subscriptions와 Creator Marketplace의 한국 연령 만 19세·계정 자격을 분리한다. Bonuses도 한국 만 19세지만 invite-only이며, Reels 3개월 500만과 photo/carousel 한국 월 100만×3개월 조건을 한 수치로 합치지 않는다. branded·promotional·paid partnership 등은 bonus 제외이므로 1차 커머스 레일이 아니다.
- Instagram Content Publishing API는 shopping tags를 지원하지 않는다. Reels 자동 게시와 제품 태그를 같은 capability로 기록하지 않는다.
- TikTok Creator Rewards는 1분 이상 원본 영상이며 광고·유료 프로모션·협찬 콘텐츠가 부적격이다. 15~60초 쇼핑 쇼츠 수익 레일로 선택하지 않는다.
- TikTok Shop 한국 출시를 확정한 공식 근거와 계정 UI가 없으면 `unknown`이다. Content Posting API는 audited app·scope·creator consent·commercial/AI toggles를 모두 확인하고, 한국 industry-entry 카테고리 표는 공식 source·`allowed` 판정·KST 시각·검수자·화면 이미지 SHA-256의 `compliance_evidence`로 봉인한다.
- X Creator Revenue Sharing은 2026-09-07 은퇴하고 Original Content Rewards는 2026-09-08 rollout 예정이다. 후자는 automated means로 생성·게시된 콘텐츠가 부적격이므로 이 하네스에서 `research-only`다.
- X affiliate link·할인코드는 Paid Partnership disclosure 대상이다. 영상 프리롤·sponsorship graphic은 `not-present|consent-confirmed` 판정과 공식 source·KST 시각·검수자·화면 이미지 SHA-256의 별도 evidence가 필요하다. X API 게시 가능성과 X 보상 적격성은 별개다.

세부 근거: `social-platform-research.md`.

## 5. Freshness and truth sources

- `live` 조사 소스는 기본 7일 이내여야 한다.
- 캠페인·상품별 요율·재고·가격은 24시간 이내 또는 공개 직전에 다시 본다.
- 계정 자격·매체 등록·초대 여부는 매 run의 로그인된 현재 UI에서 확인한다. 과거 메모리·브라우징 이력·스크린샷만으로 승인 상태를 올리지 않는다.
- 로그인 벽 때문에 확인하지 못하면 `unknown`으로 남기고 선택 경로를 `creative-only`로 낮춘다.
- 공식 문서끼리 숫자가 다르면 더 최근 문서와 현재 계정 UI를 병기하고 자동 선택하지 않는다.

## 6. G0 판정

1. `platform-revenue-researcher`가 공식 소스 기반 20개 프로그램 매트릭스를 작성한다.
2. `commerce-eligibility-auditor`가 매트릭스의 SHA-256을 고정하고 한 경로를 선택한다.
3. 계정 자격, 매체 등록, 상품 자산 권리, 표시 방법이 모두 확인되면 `commerce-ready`.
4. 가입·승인·매체 등록·현재 요율·자산 권리 중 하나라도 미확인이면 `creative-only`.
5. 금지 상품, 허위 관계, 자동 클릭·어뷰징, 사용할 수 없는 자산을 전제로 하면 `blocked`.
6. `validation/commerce.json`이 매트릭스와 선택 경로의 현재 해시를 확인해야 G0를 PASS로 기록한다.

어떤 조사도 계정 가입, 약관 동의, 캠페인 신청, 채널 등록, 링크 게시, 업로드를 자동 승인하지 않는다.
