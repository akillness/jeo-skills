## Solution List
- Survey-first hourly loop with 5 mandatory keyword lanes.
- Metadata gates: license, archived, pushed_at freshness, traction signal.
- Recovery-query escalation for sparse/noisy lanes.

## Categories
- 신규 스킬 추가 후보
- 기존 스킬 개선 후보
- 검색/근거 파이프라인 개선 후보

## What People Actually Use
- agentic_ai_skill: [mukul975/Anthropic-Cybersecurity-Skills](https://github.com/mukul975/Anthropic-Cybersecurity-Skills), [deanpeters/Product-Manager-Skills](https://github.com/deanpeters/Product-Manager-Skills), [BAAI-Agents/Cradle](https://github.com/BAAI-Agents/Cradle)
- web_frontend_skill: [NG-ZORRO/ng-zorro-antd](https://github.com/NG-ZORRO/ng-zorro-antd), [opentiny/tiny-vue](https://github.com/opentiny/tiny-vue), [lawnstarter/react-native-picker-select](https://github.com/lawnstarter/react-native-picker-select)
- web_backend_skill: [encoredev/encore](https://github.com/encoredev/encore), [Ovi/DummyJSON](https://github.com/Ovi/DummyJSON), [ishtms/learn-nodejs-hard-way](https://github.com/ishtms/learn-nodejs-hard-way)
- cli_open_source_skill: [alexellis/arkade](https://github.com/alexellis/arkade)
- game_development_skill: [tjboudreaux/cc-plugin-unity-gamedev](https://github.com/tjboudreaux/cc-plugin-unity-gamedev)

## Frequency Ranking
- encoredev/encore | lane=web_backend_skill | stars=11865 | license=mpl-2.0 | provenance=indexed snippet+direct page retrieval
- NG-ZORRO/ng-zorro-antd | lane=web_frontend_skill | stars=9146 | license=mit | provenance=indexed snippet+direct page retrieval
- mukul975/Anthropic-Cybersecurity-Skills | lane=agentic_ai_skill | stars=5729 | license=apache-2.0 | provenance=indexed snippet+direct page retrieval
- alexellis/arkade | lane=cli_open_source_skill | stars=4573 | license=mit | provenance=indexed snippet+direct page retrieval
- deanpeters/Product-Manager-Skills | lane=agentic_ai_skill | stars=3763 | license=other | provenance=indexed snippet+direct page retrieval
- Ovi/DummyJSON | lane=web_backend_skill | stars=2769 | license=other | provenance=indexed snippet+direct page retrieval
- BAAI-Agents/Cradle | lane=agentic_ai_skill | stars=2502 | license=mit | provenance=indexed snippet+direct page retrieval
- opentiny/tiny-vue | lane=web_frontend_skill | stars=2218 | license=mit | provenance=indexed snippet+direct page retrieval
- lawnstarter/react-native-picker-select | lane=web_frontend_skill | stars=1851 | license=mit | provenance=indexed snippet+direct page retrieval
- DevCloudFE/ng-devui | lane=web_frontend_skill | stars=1816 | license=mit | provenance=indexed snippet+direct page retrieval

## Key Gaps
- 추천 lane 수: 5 (single_lane_concentration=false)
- 일부 lane은 noisy/raw 부족으로 degraded 상태가 남아 추가 rescue template 정교화가 필요.

## Contradictions
- 별점은 높지만 최신 푸시가 오래된 저장소는 인기 대비 유지보수 리스크가 있어 제외될 수 있다.
- 틈새 도구는 stars<3 이어도 실사용 가치가 있을 수 있으나 기본 signal-floor 정책과 충돌한다.

## Key Insight
- 이번 런의 안전한 저위험 개선점은 **survey 품질 게이트 문서/룰 보강**이며, 코드 기능 추가보다 반복 루프의 결정 일관성 강화가 PR 성공률을 높인다.

Provenance: indexed snippet, direct page retrieval
