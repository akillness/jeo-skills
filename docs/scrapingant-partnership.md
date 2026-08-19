# ScrapingAnt MCP Skill Adoption & Sponsorship Plan

> Status: **Reviewed — pending execution** · Last updated: 2026-02 · Planned skill: `scrapingant-web-fetch`
>
> Based on the official ScrapingAnt documentation ([docs.scrapingant.com/mcp-server](https://docs.scrapingant.com/mcp-server))
> and the MCP (Model Context Protocol) specification, this document records
> 1) the Skill module implementation shape, 2) sponsorship/partnership positioning decisions,
> and 3) the concrete execution steps.
> [한국어 버전](scrapingant-partnership.ko.md)

---

## 0. Verified Facts (Source of Truth)

Confirmed directly against the official ScrapingAnt docs as of 2026-02. Re-verify this section first whenever the doc is updated.

| Item | Value | Source |
|---|---|---|
| Hosted MCP endpoint | `https://api.scrapingant.com/mcp` | docs.scrapingant.com/mcp-server |
| Transport | `streamableHttp` | ibid. |
| Auth | `x-api-key` header | ibid. |
| Tools (3) | `get_web_page_markdown` · `get_web_page_html` · `get_web_page_text` | ibid. |
| Free tier | 10,000 credits/month, no credit card | scrapingant.com |
| Documented clients | Claude Desktop, Claude Code (CLI), VS Code/Copilot, Cursor, Cline, Windsurf | docs.scrapingant.com/mcp-server |

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

### Step 3. Execution checklist

- [ ] Scaffold the `scrapingant-web-fetch` skill (`SKILL.md` + MCP config snippet + missing-key guidance)
- [ ] Register in the `skills.json` catalog; pass `validate_skill.sh` / `validate_catalog_sync.py`
- [ ] Draft the README sponsor section (merge only after the partnership is confirmed)
- [ ] Send outreach email and track replies
- [ ] Write the showcase benchmark (Cloudflare-protected site vs plain fetch)

## 4. Risks & Reservations

- **Exposure before a signed partnership**: do not merge the README banner or "Sponsored by" wording before the deal is confirmed (only neutral "integrates with ScrapingAnt MCP" phrasing until then).
- **API/doc drift**: tool names and endpoint follow the sources in §0; re-verify before the skill ships.
- **Credit policy changes**: "10,000 free credits/month" is ScrapingAnt policy — always qualify it with "as of signup" in user-facing docs.
