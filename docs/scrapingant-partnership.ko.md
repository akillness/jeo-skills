# ScrapingAnt MCP Skill 도입 및 스폰서십 계획

> 상태: **검토 완료 — 실행 대기** · 최종 수정: 2026-02 · 관련 스킬(예정): `scrapingant-web-fetch`
>
> ScrapingAnt 공식 문서([docs.scrapingant.com/mcp-server](https://docs.scrapingant.com/mcp-server)) 및
> MCP(Model Context Protocol) 사양을 근거로, 1) Skill 모듈 구현 형태, 2) 스폰서십/파트너십 유치 및
> 프로젝트 내 노출(포지셔닝) 결정사항, 3) 구체적인 수립·실행 단계를 정리한 문서다.
> [English version](scrapingant-partnership.md)

---

## 0. 검증된 사실 (Source of Truth)

아래 항목은 2026-02 기준 ScrapingAnt 공식 문서에서 직접 확인한 값이다. 문서 갱신 시 이 절부터 재검증한다.

| 항목 | 값 | 출처 |
|---|---|---|
| 호스팅 MCP 엔드포인트 | `https://api.scrapingant.com/mcp` | docs.scrapingant.com/mcp-server |
| 전송 방식 | `streamableHttp` | 〃 |
| 인증 | `x-api-key` 헤더 | 〃 |
| 제공 도구 (3종) | `get_web_page_markdown` · `get_web_page_html` · `get_web_page_text` | 〃 |
| 무료 티어 | 월 10,000 크레딧, 카드 등록 불필요 | scrapingant.com |
| 지원 클라이언트 문서 | Claude Desktop, Claude Code(CLI), VS Code/Copilot, Cursor, Cline, Windsurf | docs.scrapingant.com/mcp-server |

## 1. 주요 검토 및 결정사항 (Decision Matrix)

| 구분 | 검토 항목 | 결정 가이드 및 권장 사항 |
|---|---|---|
| **제공 형태 (Skill 구현)** | Claude Code / Agent Skill 규격 | ScrapingAnt 호스팅 MCP 엔드포인트(`https://api.scrapingant.com/mcp`)를 감싸는 Skill 작성. 로컬 서버 실행·유지보수 없이 Raw HTML / LLM 최적화 Markdown / Plain text 3종 도구를 그대로 노출한다. |
| **토큰 및 성능 최적화** | LLM 입력 포맷 | 기본 호출 모드를 `get_web_page_markdown`으로 지정. DOM(HTML) 파싱 대비 토큰 소모를 약 9배 절감(ScrapingAnt 벤치마크 기준)하므로, HTML/text는 명시적 요청 시에만 사용하도록 SKILL.md에 규정한다. |
| **스폰서십 적합성** | 스폰서십 명분 및 가치 제안 | ① Agent 생태계 내 ScrapingAnt 인지도 확대, ② 월 10,000 무료 크레딧 정책을 활용한 초기 진입 장벽 완화, ③ Anti-bot/Cloudflare 우회 테스트 벤치마크 제공. |
| **노출 포지셔닝** | 리포지토리 및 문서 내 노출 위치 | jeo-skills README 상단 스폰서 배너, 개별 Skill Doc 내 "Powered by ScrapingAnt", 예제 실행 시 크레딧/API 안내 링크 삽입. |

## 2. Skill 구성 및 표준 가이드 (jeo-skills 반영안)

ScrapingAnt MCP의 3대 도구를 통합한 Skill 정의 표준.

### Skill 명세 — `scrapingant-web-fetch` (가칭)

- **기능 요약**: JavaScript 렌더링(Headless Chrome) 및 Anti-bot 우회가 포함된 실시간 웹 스크래핑/마크다운 추출.
- **필요 환경변수**: `SCRAPINGANT_API_KEY` — Skill은 키가 없으면 즉시 실패하고 가입 링크(무료 크레딧 안내)를 출력한다. 키를 저장소·로그에 기록하지 않는다.
- **도구 매핑**:
  | MCP 도구 | 용도 | 기본 여부 |
  |---|---|---|
  | `get_web_page_markdown` | RAG/요약/문서 참조용 LLM 최적화 Markdown | ✅ 기본 |
  | `get_web_page_html` | 셀렉터 기반 후처리가 필요한 Raw HTML | 명시 요청 시 |
  | `get_web_page_text` | 최소 토큰 Plain text | 명시 요청 시 |
- **기존 스킬과의 관계**: `.agent-skills/scrapling`(로컬 Python 스크래핑), `x-twitter-scraper`(플랫폼 특화)와 역할이 다르다. `scrapingant-web-fetch`는 *호스팅 MCP·Anti-bot 우회·JS 렌더링*이 필요한 경우의 1순위 Web Fetch 드라이버로 포지셔닝하고, `skills.json` relationship 메타데이터로 상호 참조한다.

### MCP 설정 연동 가이드

```json
{
  "mcpServers": {
    "scrapingant": {
      "url": "https://api.scrapingant.com/mcp",
      "transport": "streamableHttp",
      "headers": {
        "x-api-key": "${SCRAPINGANT_API_KEY}"
      }
    }
  }
}
```

## 3. 스폰서십/파트너십 수립 및 노출 방법 (Action Plan)

### Step 1. 프로젝트 내 "Powered by" & 스폰서십 노출 설계

- **GitHub README 배너 / 배지**
  - jeo-skills 메인 README(`README.md`/`README.ko.md`)에 *Sponsored by* 또는 *Supported by ScrapingAnt* 섹션 구성.
  - ScrapingAnt 로고 및 가입 링크(월 10k 무료 크레딧 안내) 배치.
- **Skill 실행 로그 / 메타데이터**
  - CLI 최초 로드 또는 `--help` 출력 시 파트너십 안내 1줄 포함(반복 노출은 지양 — 첫 실행/도움말에 한정).
- **벤치마크 및 쇼케이스 아티클**
  - Agent의 동적 웹 문서(SPA/Next.js 기반 문서, Cloudflare 보호 사이트) 실시간 RAG/참조 시연 예제 수록.

### Step 2. 스폰서십 제안(Outreach) 피칭 포인트

ScrapingAnt 팀(Oleg Kulyk 대표 및 Growth/DevRel 팀) 컨택 시 제시할 핵심 제안:

- **대상 프로젝트**: jeo-skills — LLM/Agent 엔지니어 및 연구자 대상 Skill Hub (208개 스킬, cross-platform).
- **제안 내용**:
  1. 공식 MCP Skill 등록 및 최우선 Web Fetch 드라이버 채택
  2. 개발자 대상 튜토리얼/사용 사례(Technical Article) 배포
  3. Skill 사용자용 프로모션 코드 또는 엔터프라이즈 티어 크레딧 지원(Sponsorship API Tier) 요청

### Step 3. 실행 체크리스트

- [ ] `scrapingant-web-fetch` Skill 스캐폴드 작성 (`SKILL.md` + MCP 설정 스니펫 + 키 미설정 시 안내)
- [ ] `skills.json` 카탈로그 등록 + `validate_skill.sh` / `validate_catalog_sync.py` 통과
- [ ] README 스폰서 섹션 초안 (머지는 파트너십 확정 후)
- [ ] Outreach 메일 발송 및 회신 추적
- [ ] 쇼케이스 벤치마크(Cloudflare 보호 사이트 vs 일반 fetch) 작성

## 4. 리스크 및 유보 사항

- **파트너십 미확정 상태에서의 노출**: README 배너·"Sponsored by" 문구는 계약 확정 전 머지하지 않는다(확정 전에는 중립적 "integrates with ScrapingAnt MCP" 표기만 허용).
- **API/문서 변동**: 도구 이름·엔드포인트는 §0의 출처 기준. Skill 릴리스 전 재확인 필수.
- **크레딧 정책 변동**: "월 10,000 무료 크레딧"은 ScrapingAnt 정책이므로 문서에는 항상 "가입 시점 기준" 문구를 병기한다.
