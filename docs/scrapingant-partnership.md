# ScrapingAnt MCP Skill Adoption & Sponsorship Plan

> Status: **Executed** · Last updated: 2026-08 · Shipped skill: [`scrapingant-web-fetch`](../.agent-skills/scrapingant-web-fetch/SKILL.md)
>
> Partnership accepted by email on 2026-08-19 (Oleg Kulyk, ScrapingAnt) and the
> open-source partner signup is complete, so the README sponsor sections are live.
> Referral link in use: `https://scrapingant.com?ref=ztewzmv&tm_source=readme` — regenerated 2026-08 via the Tapfiliate URL Wizard with SubID `source:readme` so README-driven clicks are distinguishable in the partner dashboard's Reporting/Conversions views. The `scrapingant-web-fetch` skill's SKILL.md, `scripts/scrapingant.sh` (`doctor`/`install`/error-path signup prompts), and `setup-all-skills-prompt.md` all carry the same `ref=ztewzmv` code so every signup — README, skill doc, or CLI helper — is credited; the script uses SubID `tm_source=skill` to keep that channel distinguishable from README clicks in Reporting/Conversions.

>
> Based on the official ScrapingAnt documentation ([docs.scrapingant.com/mcp-server](https://docs.scrapingant.com/mcp-server))
> and the MCP (Model Context Protocol) specification, this document records
> 1) the Skill module implementation shape, 2) sponsorship/partnership positioning decisions,
> and 3) the concrete execution steps.
> [한국어 버전](scrapingant-partnership.ko.md)

---

## 0. Verified Facts (Source of Truth)

Confirmed directly against the official ScrapingAnt docs, re-verified 2026-08. Re-verify this section first whenever the doc is updated.

| Item | Value | Source |
|---|---|---|
| Hosted MCP endpoint | `https://api.scrapingant.com/mcp` | docs.scrapingant.com/mcp-server |
| Transport | `streamableHttp` | ibid. |
| Auth | `x-api-key` header | ibid. |
| Tools (3) | `get_web_page_markdown` · `get_web_page_html` · `get_web_page_text` | ibid. |
| Free tier | 10,000 credits/month, no credit card | scrapingant.com |
| Documented clients | Claude Desktop, Claude Code (CLI), VS Code/Copilot, Cursor, Cline, Windsurf | docs.scrapingant.com/mcp-server |
| Tool parameters | `url` (required) · `browser` (default `true`) · `proxy_type` (`datacenter`\|`residential`) · `proxy_country` (ISO-3166) | docs.scrapingant.com/mcp-server |
| Credit cost | static 1 · JS rendering 10 · residential 25 · residential+JS 125 | docs.scrapingant.com/credits-cost |
| REST twins | `/v2/markdown`, `/v2/general`, `/v2/usage` (key as query param) | docs.scrapingant.com/api-basics · /llm-markdown |
| Referral link | `https://scrapingant.com?ref=ztewzmv&tm_source=readme` | partner program signup, 2026-08; SubID `source:readme` added 2026-08 via Tapfiliate URL Wizard |
| Affiliate terms | 50% first-month commission, $49 min payout, 45-day cookie, self-referral banned, no misrepresentation, README/OSS linking explicitly listed as an approved channel | [scrapingant.com/legal/affiliate](https://scrapingant.com/legal/affiliate/), verified 2026-08 |


## 1. Decision Matrix

| Area | Item under review | Decision / recommendation |
|---|---|---|
| **Delivery shape (Skill)** | Claude Code / Agent Skill spec | Wrap the ScrapingAnt hosted MCP endpoint (`https://api.scrapingant.com/mcp`) in a Skill. No local server to run or maintain; expose the three tools as-is (Raw HTML, LLM-optimized Markdown, Plain text). |
| **Token & performance** | LLM input format | Default call mode is `get_web_page_markdown` — roughly 9× fewer tokens than DOM/HTML parsing (per ScrapingAnt's benchmark). SKILL.md mandates HTML/text only on explicit request. |
| **Sponsorship fit** | Rationale & value proposition | ① Grow ScrapingAnt awareness in the agent ecosystem, ② lower the entry barrier via the 10,000 free monthly credits, ③ provide anti-bot/Cloudflare bypass test benchmarks. |
| **Exposure positioning** | Placement in repo & docs | Sponsor banner at the top of the jeo-skills README, "Powered by ScrapingAnt" in the individual Skill doc, credit/API signup link in example output. |

## 2. Skill Composition & Standard Guide (jeo-skills proposal)

Skill definition standard integrating ScrapingAnt MCP's three tools.

### Skill spec — `scrapingant-web-fetch` (working name)

- **Summary**: Real-time web scraping / markdown extraction with JavaScript rendering (Headless Chrome) and anti-bot bypass.
- **Required env var**: `SCRAPINGANT_API_KEY` — the skill fails fast without it and prints the signup link (free-credits note). Never write the key to the repo or logs.
- **Tool mapping**:
  | MCP tool | Purpose | Default? |
  |---|---|---|
  | `get_web_page_markdown` | LLM-optimized Markdown for RAG/summaries/doc reference | ✅ default |
  | `get_web_page_html` | Raw HTML for selector-based post-processing | on explicit request |
  | `get_web_page_text` | Minimal-token plain text | on explicit request |
- **Relation to existing skills**: distinct from `.agent-skills/scrapling` (local Python scraping) and `x-twitter-scraper` (platform-specific). Position `scrapingant-web-fetch` as the first-choice web-fetch driver whenever *hosted MCP, anti-bot bypass, or JS rendering* is needed; cross-reference via `skills.json` relationship metadata.

### MCP configuration snippet

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

## 3. Sponsorship / Partnership Action Plan

### Step 1. In-project "Powered by" & sponsorship exposure design

- **GitHub README banner / badge**
  - Add a *Sponsored by* / *Supported by ScrapingAnt* section to the main README (`README.md` / `README.ko.md`).
  - Place the ScrapingAnt logo and signup link (10k free monthly credits).
- **Skill runtime log / metadata**
  - One partnership line on first CLI load or in `--help` output only (no repeated nagging).
- **Benchmark & showcase article**
  - Include a live RAG/reference demo against dynamic web docs (SPA/Next.js docs sites, Cloudflare-protected sites).

### Step 2. Outreach pitching points

Key proposal when contacting the ScrapingAnt team (CEO Oleg Kulyk and Growth/DevRel):

- **Target project**: jeo-skills — a skill hub for LLM/agent engineers and researchers (208 skills, cross-platform).
- **Proposal**:
  1. Official MCP Skill listing and adoption as the first-choice web-fetch driver
  2. Developer-facing tutorials / technical use-case articles
  3. Promo codes for skill users or enterprise-tier credit support (Sponsorship API Tier)
Ready-to-send draft: [`scrapingant-outreach-email.md`](scrapingant-outreach-email.md).


### Step 3. Execution checklist

- [x] Scaffold the `scrapingant-web-fetch` skill (`SKILL.md` + `SKILL.toon` + `references/` + `scripts/scrapingant.sh` with `doctor`/`install`/`credits`/`probe`)
- [x] Register in the `skills.json` catalog (cli-tools / search-cli / `mcp`, 208 → 209) + `skills.toon` + `skills-lock.json`; `validate_skill.sh` reports 0 errors / 0 warnings and `scripts/validate-catalog-projections.py` passes
- [x] Merge the README sponsor section — partnership confirmed, so `README.md` / `README.ko.md` / `README.es-ES.md` all carry it below the install guide
- [x] Send outreach email and track replies (accepted 2026-08-19)
- [ ] Write the showcase benchmark (Cloudflare-protected site vs plain fetch) — needs a live API key
- [ ] Run the skill end-to-end against a real key (`scrapingant.sh credits` / `probe`); only the auth-failure path is verified so far
- [x] Cross-check current usage against [scrapingant.com/legal/affiliate](https://scrapingant.com/legal/affiliate/) (2026-08): README/OSS linking is an explicitly approved promotion channel, no self-referral, disclosure sentence present in all three READMEs — compliant. Added SubID `source:readme` in the Tapfiliate URL Wizard to separate README traffic in Reporting/Conversions.


## 4. Risks & Reservations

- **Exposure before a signed partnership**: resolved — the partnership was accepted on 2026-08-19 and the partner signup completed, which is what unblocked the "Sponsored by" sections. Any future sponsor claim needs the same evidence trail.
- **Referral disclosure**: every sponsor block states that the link is a referral/sponsor arrangement and that the API key stays with the user. Verified 2026-08 against [scrapingant.com/legal/affiliate](https://scrapingant.com/legal/affiliate/): the terms require affiliates to "never misrepresent themselves, ScrapingAnt, or their relationship with ScrapingAnt" — the disclosure sentence in all three READMEs satisfies this. Keep that disclosure whenever the link is copied elsewhere.

- **API/doc drift**: tool names, parameters, and credit costs follow the sources in §0 (re-verified 2026-08 against the live docs); re-verify before editing the skill.
- **Credit policy changes**: "10,000 free credits/month" is ScrapingAnt policy — always qualify it with "as of signup" in user-facing docs.
