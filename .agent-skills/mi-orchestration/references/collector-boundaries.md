# Collector permission and cost boundaries

공식 문서 조회: **2026-10-12**. 원본 MI 코드, 계정 Order Form, API key, 좌석 권한,
실제 quota, 수집 실행에는 접근하지 않았다. 공개 제품 설명과 실제 사용 권한은 별개다.

## Sensor Tower

[Connect](https://sensortower.com/product/connect)는 API, Scheduled Data Feed, Snowflake,
알림을 데이터 전달 수단으로 소개한다. 이는 현재 계정의 모든 데이터 접근을 보장하지 않는다.
[Data Access Service Supplement](https://sensortower.com/tos-data-access-service-supplement)는
API/MCP 제공 여부를 Order Form과 연결하고 Call Credit/Call Limit, 기간 만료, 초과금·추가 크레딧,
과도한 호출의 제한/스로틀, 승인된 인터페이스와 문서·계약의 한도 준수를 규정한다.

현재 [Terms of Service](https://sensortower.com/tos) PDF를 직접 읽었다. 첫 페이지는 과거
Playliner OY 등의 Service 계약이 이 Terms로 superseded된다고 명시한다. §3(M), p4는
bots/spiders/web crawlers/indexing agents/browser extensions 등 자동 수단으로 Service를
access/use/scrape/copy/index하는 것을 금지한다. 이를 DAS의 승인된 API/MCP 권한과 혼동하지 않는다.
§2(C)(i–iii), p3는 internal use·제3자 공유 범위와 AI Supplement 준수를 요구한다.

실행 전 최소 확인:

1. 계정·seat·product/dataset·country/platform 범위의 entitlement;
2. 허용 API/MCP/전달 수단과 현재 문서 revision;
3. 기간별 Call Limit, endpoint별 credits 계산, 만료·초과금·스로틀;
4. 사용자의 이번 회차 scope·예산 승인, credential handoff 방식;
5. 원본/파생 데이터 보존·사용·재배포/리포트 공유 권한;
6. AI Tool의 아래 부록 준수와 종료 후 data/embedding/AI 환경 삭제 정책.

`requests`, `credits`, 돈은 서로 다른 단위다. credits 계산을 모르면 1 call=1 credit로
가정하지 않는다. 한도·비용이 unknown이면 수집하지 않는다. `limit=0`을 무제한으로 읽지 않는다.
첨부의 **6 req/s, 39/51 calls, 112 endpoints, quota limit 0**은 계정·기간별 근거를 확보하지
못했으므로 기본값이나 실측으로 사용하지 않는다. 별도 VGI API의 숫자도 이 상품의 근거가 아니다.

[Responsibly Sourced Data](https://sensortower.com/responsibly-sourced-data) 및
[App Performance Insights](https://sensortower.com/product/mobile-app/app-performance-insights)는
모델링된 estimates와 커버리지 한계를 설명한다. 다운로드/매출을 실제 정산값으로 표현하지 않고
모델·상품·지역·기간·업데이트 시각을 보존한다. 모델 revision이 달라진 비교도 표시한다.

## Playliner

[Live Ops 제품 페이지](https://sensortower.com/product/live-ops)는 상위 게임을 플레이해
이벤트·업데이트·오퍼를 문서화하는 표본 범위를 설명한다. 모든 게임/지역/기간의 완전한
population이 아니다. 공개 API나 자동화 export entitlement는 확인하지 못했다.

검색에 남은 [옛 Playliner Terms of Use](https://playliner.com/policies/terms_of_use)의
2022-10-24 문안 §6.6은 자동 다운로드를 금지했다. **이것은 역사 자료**다. 2026-10-12
직접 열면 Live Ops marketing으로 연결되며 현행 Terms가 과거 Playliner 계약의 supersession을
명시하므로 옛 약관을 현재 정본으로 인용하지 않는다. 현재 UI 자동화 차단 근거는 위 Sensor
Tower §3(M)이다. 정확한 계정 Order Form·허용된 programmatic data 범위는 미확인이다.

**기본 collector 상태는 disabled/unknown**이다. 웹 UI 스크래핑, export 버튼 자동 클릭,
브라우저 네트워크에서 얻은 비공개 endpoint 재사용은 approved API의 대체 경로가 아니다.
정확한 계정·방식에 대한 현행 서면 허가나 계약이 확인될 때만 별도 fit check를 한다.
사용자에게 허용된 수동 export가 있더라도 에이전트 자동 export 승인이라고 읽지 않는다.

## AI use is a separate mandatory gate

[AI Supplement](https://sensortower.com/tos-ai-supplement) **v1.4, 2쪽 PDF**를 직접 읽었다.
Service Data를 모델로 해석·요약하거나 prompts/outputs/embedding으로 사용할 때도 적용된다.
API 수집 permission이나 로컬 저장 권한만으로 이 게이트를 통과했다고 보지 않는다.

- §1–2: **Permitted AI Tool**만 허용. provider가 input/prompts/outputs를 use/retain/distill/train하지
  않는 서면 계약, retention/deletion/access 관리 통제가 필요하며 consumer/free-tier/publicly shared
  offering은 해당하지 않는다. on-premise/open-source라는 이름도 자동 면제되지 않는다.
- §2(A–D): pre-trained model inference만; Service Data·Outputs·파생물의 training/fine-tuning 및
  distillation 금지. RAG embeddings는 permitted inference와 부록 제한 내에서만 가능하다.
- §2(F): 외부 reports는 raw Service Data 없이, output은 보충적 내용으로만, Sensor Tower 귀속,
  판매/라이선스·subscription 대체 금지, 알려진 경쟁사 제공 금지 등 조건을 모두 확인해야 한다.
  internal analysis라도 별도 third-party sharing 권한을 확인한다.
- §2(F–G): 종료 후 새 Output 생성 금지와 AI Tool environments의 Output/embedding 영구삭제·서면
  인증 의무를 구분한다. allowed continuing-use와 environment deletion은 같은 규칙이 아니다.
- source rights·AI 계약을 확인하기 전 실제 licensed raw나 outputs를 chat/subagent/memory/vector store에
  넣지 않는다. 번들 fixture는 합성 데이터이며 실서비스 데이터가 없다.

계정/AI provider의 계약은 검사하지 않았으므로 compliant environment를 인증하지 않는다.

## Stop rules

- 인증/권한 거부, 금지 경로, 명확한 한도 소진, 예상 밖 과금: 즉시 stop.
- transient failure만 project config의 bounded retry 내에서 검토; 회차 추가 수집은 최대 1회.
- 다른 계정/seat/product/vendor, unofficial endpoint, 웹세션으로 fallback하지 않는다.
- credits 추가 구매·플랜 변경·알림 설정·Slack 채널 연결은 독립 쓰기/비용 승인 대상이다.
- expiry rules가 있어도 현재 계정 만료 알림 기능·설정이 있다는 증거는 아니다.

## API-zero is not permission-zero

`api_calls=0`은 해당 회차 API request를 실행하지 않았다는 기록일 뿐이다. 라이선스·구독비·seat,
로그인·UI 접근, 저장/export, 데이터 이용권한이 없어졌다는 뜻이 아니다. 새 paid/API calls 없이
이미 허용받아 저장한 local artifact를 감사하는 것이 번들 CLI의 기본 범위다.

## Evidence limitations

Sensor Tower TOS 14쪽, DAS v1.2 2쪽, AI v1.4 2쪽의 실제 PDF embedded text를 직접 확인했다.
옛 Playliner terms는 역사 검색 발췌이고 live URL은 현재 제품 페이지로 연결된다. 계정별 entitlement,
Order Form, AI provider 서면 계약·retention 설정은 확인하지 않았다. 공개 문서와 운영 계약이
충돌하면 수집·AI 처리를 멈추고 확인한다.
