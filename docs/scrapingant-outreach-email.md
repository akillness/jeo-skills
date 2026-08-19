# ScrapingAnt Partnership Outreach — Email Draft

> Companion to [`scrapingant-partnership.md`](scrapingant-partnership.md) / [한국어](scrapingant-partnership.ko.md).
> Use this to open the conversation with the ScrapingAnt team (CEO Oleg Kulyk / Growth·DevRel).
> Fill in the `{{ }}` placeholders before sending. Do not send until the sender name/role is real —
> this is a cold outreach draft, not a confirmed partnership announcement.

---

## English (send this)

**To:** partnerships@scrapingant.com (or the contact confirmed via the site's "Talk to sales")
**Subject:** Partnership proposal — ScrapingAnt as the default MCP web-fetch skill in jeo-skills

Hi {{ name / "ScrapingAnt team" }},

I'm {{ your name }}, maintainer of [jeo-skills](https://github.com/akillness/jeo-skills), an
open-source, cross-platform catalog of 208 Agent Skills for Claude Code, Cursor, Windsurf,
Copilot, and other MCP-capable coding agents. I'd like to propose adding ScrapingAnt's hosted
MCP server as a first-class skill in the catalog, and to explore a small sponsorship alongside it.

**What we'd build**

A `scrapingant-web-fetch` skill that wraps your hosted MCP endpoint
(`https://api.scrapingant.com/mcp`, `streamableHttp`, `x-api-key` auth) and exposes all three
tools (`get_web_page_markdown`, `get_web_page_html`, `get_web_page_text`), defaulting to the
Markdown mode for token efficiency. It would ship with setup docs, an MCP config snippet, and a
short benchmark showing JS-rendered / anti-bot-protected pages being fetched where a plain HTTP
client fails.

**What we're proposing**

1. Official MCP skill listing in jeo-skills, positioned as the default web-fetch driver whenever
   JS rendering or anti-bot bypass is needed (distinct from our existing local-scraping skills).
2. A developer-facing tutorial / technical article showing the skill in an agent workflow
   (e.g., live RAG against a Cloudflare-protected docs site).
3. In exchange, we'd appreciate: confirmation that hosted-MCP usage this way is welcome under your
   terms, and — if available — either a small promo code for skill users or a sponsorship-tier
   credit allotment for testing/benchmarking. We're also open to a "Supported by ScrapingAnt"
   placement in the skill doc and, if this becomes a maintained integration, the project README.

We haven't published anything ScrapingAnt-branded yet — we wanted to confirm interest and terms
with you first. Happy to share a draft of the skill/doc for review before anything goes live.

Would you or someone on your DevRel/Growth team have 20 minutes this or next week to discuss?

Best,
{{ your name }}
{{ role, e.g. "Maintainer, jeo-skills" }}
{{ contact email / GitHub handle }}

---

## 한국어 (내부 검토용 — 그대로 발송하지 말 것, 위 영문본을 발송)

**받는 사람:** partnerships@scrapingant.com (또는 사이트 "Talk to sales"로 확인한 담당자)
**제목:** 파트너십 제안 — jeo-skills 기본 MCP 웹 fetch 스킬로 ScrapingAnt 채택

{{ 이름 / "ScrapingAnt 팀" }}님, 안녕하세요.

저는 [jeo-skills](https://github.com/akillness/jeo-skills) 메인테이너 {{ 이름 }}입니다. jeo-skills는
Claude Code, Cursor, Windsurf, Copilot 등 MCP를 지원하는 코딩 에이전트를 위한 오픈소스 크로스플랫폼
Agent Skill 카탈로그(208개)입니다. ScrapingAnt의 호스팅 MCP 서버를 카탈로그의 1급 스킬로 추가하고,
더불어 소규모 스폰서십 가능성을 논의하고 싶어 연락드립니다.

**구현 계획**

호스팅 MCP 엔드포인트(`https://api.scrapingant.com/mcp`, `streamableHttp`, `x-api-key` 인증)를 감싸는
`scrapingant-web-fetch` 스킬을 만들어 3종 도구(`get_web_page_markdown`, `get_web_page_html`,
`get_web_page_text`)를 그대로 노출하고, 토큰 효율을 위해 기본값은 Markdown 모드로 지정합니다. 설정 가이드,
MCP 설정 스니펫, 그리고 일반 HTTP 클라이언트로는 실패하는 JS 렌더링/anti-bot 보호 페이지를 가져오는
간단한 벤치마크를 함께 제공할 예정입니다.

**제안 내용**

1. jeo-skills 내 공식 MCP 스킬 등록 — 기존 로컬 스크래핑 스킬과 구분해, JS 렌더링·anti-bot 우회가
   필요한 경우의 기본 web-fetch 드라이버로 포지셔닝.
2. 개발자 대상 튜토리얼/기술 아티클 작성(예: Cloudflare 보호 문서 사이트 대상 실시간 RAG 데모).
3. 대가로 바라는 것: 이러한 방식의 호스팅 MCP 사용이 귀사 약관상 허용되는지 확인, 가능하다면 스킬
   사용자용 프로모션 코드 또는 테스트/벤치마크용 스폰서십 티어 크레딧 지원. 스킬 문서 및 (유지되는
   연동으로 발전 시) 프로젝트 README에 "Supported by ScrapingAnt" 표기도 열려 있습니다.

아직 ScrapingAnt 브랜드가 들어간 어떤 것도 공개하지 않았습니다 — 먼저 관심 여부와 조건을 확인하고
싶었습니다. 공개 전에 스킬/문서 초안을 리뷰용으로 공유해 드릴 수 있습니다.

이번 주나 다음 주에 20분 정도 DevRel/Growth 팀과 논의할 시간이 있을까요?

감사합니다.
{{ 이름 }}
{{ 직함, 예: "jeo-skills 메인테이너" }}
{{ 연락처 이메일 / GitHub 계정 }}

---

## Notes

- The English version is the one to actually send — ScrapingAnt's public docs and site are
  English-first, so lead with that; the Korean version is kept for internal sign-off/review.
- Fill in `{{ your name }}`, `{{ role }}`, and `{{ contact email / GitHub handle }}` before sending.
- If a reply confirms partnership, the next step per `scrapingant-partnership.md` §3 Step 3 is:
  scaffold `scrapingant-web-fetch`, register in `skills.json`, then and only then draft the README
  sponsor section.
