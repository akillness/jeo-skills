# 헤이홈 스마트 라인 LED 30초 기획 검증

검증일: **2026-09-01 KST**
상품: `헤이홈 스마트 라인 LED`
공식 판매 페이지: `https://brand.naver.com/hejhome/products/4700857343`

## Bottom line

기존 6×5초 구조는 **수정 후 채택**한다. 그대로 렌더하거나 공개하지 않는다.

- **채택**: 30초, 6개 장면, 문제→조작→시각 변화→마무리 구조.
- **수정 후 채택**: 야광별은 제품 기능이 아니라 회상용 비유임을 분명히 하고, 앱 제어·밝기·색상 변화만 제품 기능으로 말한다.
- **보류**: 실제 상품 사진·앱 화면·음원·폰트의 상업적 권리와 현재 계정 commerce route가 확인되기 전 유료 렌더.
- **기각**: 가짜 1인칭 추억, 수면·위로 효능, 제품이 별무늬를 투사한다는 인상, 최저가·품절·연예인 사용·장기 체험담.

이 문서는 제작 승인이나 공개 승인이 아니다. 현재 정본 계약상 `creative-only`에서 비용이 드는 렌더와 제휴 링크·제품 태그를 사용하지 않는다.

## Official product evidence

공식 상품 상세 이미지에서 직접 확인한 범위:

| Claim | Status | Exact coordinate |
|---|---|---|
| 헤이홈 앱으로 원격 제어 | verified | 상세 이미지 `02_08_원격제어.png`: “언제 어디서든 원격으로 제어”, Wi-Fi 2.4GHz 안내 |
| 밝기 조절 | verified | `02_03_스마트라인LED는요.png`: 1%~100% 조절 안내 |
| 색상 변경 | verified | `02_11_섬세한색상.png`: 색상 wheel과 “1600만 가지 색상 표현” 안내 |
| 간접조명 설치 예시 | verified | `02_01_메인.png`, `02_03_스마트라인LED는요.png`, `02_05_설치예시.png` |
| 스마트폰 조작 뒤 조명 변화 | verified function, synthetic demonstration | 실제 앱 화면을 그대로 재사용할 권리는 별도 확인 필요. 생성 영상에서는 읽을 수 있는 가짜 UI를 만들지 않음 |
| 야광별처럼 별무늬를 투사 | unsupported | 제품 설명에서 확인되지 않음. 야광별은 비유와 독립 소품으로만 사용 |
| 수면 개선·정서적 위로 | unsupported | 제품 효능으로 말하지 않음 |

2026-09-01 관측 시 판매 페이지에는 49,900원에서 10% 할인된 44,900원, 평점 4.79와 리뷰 263건, 배송비 3,000원, `[방송통신기자재]잠정인증`이 표시됐다. 모두 변하는 관측값이며 `잠정인증`을 최종 인증으로 바꾸어 말하지 않는다.

## Scene-by-scene verdict

| Shot | Original intent | Verdict | Required revision |
|---|---|---|---|
| s01 | 빛바랜 야광별 스티커 극근접 | ADOPT WITH GUARD | 실제 스티커 또는 권리 확인된 독립 소품으로만 표현. 헤이홈 제품이 별무늬를 만든다는 연결 금지 |
| s02 | 어두운 방에 들어오는 지친 성인 | ADOPT WITH GUARD | 보편적 상황으로 유지. 우울·불면·치료 효능 암시 금지 |
| s03 | 스마트폰 앱에서 전원 버튼 누름 | ADOPT WITH GUARD | 앱 원격 제어는 verified. 생성된 가짜 UI 글씨 금지. 화면을 읽히지 않게 하거나 소유한 실제 screen recording 사용 |
| s04 | 침대 뒤 라인 조명이 켜짐 | ADOPT | line LED의 간접조명 설치 형태와 제품 외형을 유지. 제품이 방 전체에 별무늬를 투사하지 않게 함 |
| s05 | 웜화이트에서 오렌지로 색 변화 | ADOPT WITH GUARD | 색상 변경은 verified. 실제 앱 조작과 strip 반응을 대조하고 전후 색을 과장하지 않음 |
| s06 | 성인 실루엣이 쉬는 마무리 | ADOPT WITH GUARD | 감성 결론만 허용. 수면 개선·피로 회복·정서 치료 주장 금지 |

## Revised narration

기존 내레이션은 “위로였던 밤이 있었습니다”라는 화자의 체험과 “어른의 밤은…”이라는 보편 단정을 섞는다. `sourced-only` 계약에 맞춘 대체안:

> 어릴 적 천장에 붙여둔 야광별을 기억하시나요? 어두운 방과 밝은 천장등 사이, 필요한 건 조절 가능한 간접조명일 수 있습니다. 앱으로 켜고 밝기와 색을 조절하는 헤이홈 스마트 라인 LED. 오늘 밤, 원하는 빛을 골라보세요.

`별빛`은 감성 비유일 뿐 기능 주장으로 claim ledger에 넣지 않는다.

## Caption and generated-text decision

사용자 요청 “영상 내 글씨 배제 + 타이핑 애니메이션 + 최대 2줄”은 두 계층으로 분리해 **채택**한다.

1. 생성 클립: 모델 합성 글씨·자막·워터마크 금지. 제품에 실제로 인쇄된 표시는 보존.
2. 조립 오버레이: `assembly/captions.json`에서 typewriter·최대 2줄로 설계하고 ASS로 burn-in.
3. 전체 재생 QA: 실제 폰트 렌더, 타이핑 속도, 최소 hold, 우측 버튼·하단 설명 UI와의 충돌을 눈으로 확인.

## Benchmark decision

`shopping-shorts-benchmark.kr.md`의 20만 조회 이상 11개 표본은 **후보 탐색에만 채택**한다.

- 결과 또는 효용을 초반에 보여주고, 화면으로 증명하는 밀도를 높이는 데 참고한다.
- 11개 중 7개가 한 채널이며 검색 기반 비무작위 표본이다.
- 공개 조회수 집계 방식도 시점에 따라 달라졌다.
- 따라서 `200,000 views`를 품질 게이트·성과 예측·인과 주장으로 사용하지 않는다.
- 리스티클과 단일 제품 시연이 모두 성공 표본에 있으므로 3개 목록을 강제하지 않는다.

## Hermes changes verdict

| Change observed in the parallel Windows run | Verdict | Reason |
|---|---|---|
| `source_sha` pinned guard를 `sed`로 우회 | REJECT | provenance와 재현성을 깨며 검토 승인 없음 |
| `execution_surface: higgsfield-cli` 즉시 등록 | HOLD | `higgsfield-cli-evaluation.md`의 9개 admission 미충족 |
| PyPI 동명 CLI 사용 | REJECT | 공식 Higgsfield CLI가 아닌 쿠키 기반 비공식 경로 |
| 공개 업로드 완료 보고 | REJECT AS EVIDENCE | 후속 read-back에서 콘텐츠 목록에 영상이 없었고 실제 URL이 없음 |
| 12:29 자막·benchmark 지시 | ADOPT WITH CONTRACT | 생성 텍스트와 후반 자막을 분리하고 비무작위 benchmark 한계를 명시한 형태로 반영 |
| Git push | NOT AUTHORIZED HERE | 병렬 Windows 작업 지시를 이 계정 스킬 저장소의 push 승인으로 이월하지 않음 |

## Next production gate

실제 제작 전에 다음이 모두 필요하다.

1. 권리 확인된 제품 기준 이미지 또는 소유한 실물 촬영.
2. 앱 제어 장면을 위한 소유 screen recording 또는 읽히지 않는 UI 없는 연출.
3. `evidence.json`과 `rights.json`의 verified IDs.
4. 현재 게시 계정·수익 경로를 재확인한 G0 receipt.
5. 선택 콘셉트와 exact cost에 대한 별도 승인.
6. Selected/render plan SHA와 storyboard 행 봉인, 생성 글씨 prompt 차단, 결정론 ASS 전체 바이트 대조, 최종 영상·원본 클립·3개 프레임 SHA에 묶인 전체 재생 QA.
7. 공개 전 exact release package 확인과 공개 후 URL read-back receipt.
