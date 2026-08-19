---
name: scrapingant-web-fetch
description: >
  Fetch live web pages for agents through ScrapingAnt's hosted MCP server
  (`https://api.scrapingant.com/mcp`) with headless-Chrome rendering, rotating
  datacenter/residential proxies, Cloudflare and anti-bot handling, and
  LLM-ready Markdown output. Use when a plain fetch/WebFetch is blocked
  (403/429, Cloudflare challenge), when a JavaScript/SPA page returns an empty
  shell, when geo-specific content is needed, or when standing up a local
  browser scraper costs more than the task is worth. Triggers on: scrapingant,
  MCP web scraping, fetch blocked page, Cloudflare bypass, anti-bot scraping,
  JS rendered page, scrape to markdown, residential proxy fetch, geo-targeted
  scrape, live web access for agents.
allowed-tools: Bash Read Write Edit WebFetch
compatibility: >
  Hosted MCP over streamableHttp — no local server, runtime, or browser to
  install. Needs a ScrapingAnt API key (free tier: 10,000 credits/month at
  signup, no card) exported as SCRAPINGANT_API_KEY. Vendor-documented clients:
  Claude Code (CLI), Claude Desktop, VS Code / GitHub Copilot, Cursor, Cline,
  Windsurf. Helper scripts need bash + curl only.
metadata:
  tags: scrapingant, mcp, web-scraping, markdown, anti-bot, cloudflare, headless-chrome, residential-proxy, js-rendering, rag, live-web-access, sponsor
  platforms: Claude, Claude Code, Claude Desktop, Cursor, Windsurf, VS Code Copilot, Cline, jeo, gjc, jeopi, OpenCode
  version: "1.0"
  source: https://docs.scrapingant.com/mcp-server
---

# ScrapingAnt Web Fetch — hosted MCP for live, unblocked web content

ScrapingAnt exposes a hosted MCP server at `https://api.scrapingant.com/mcp`.
An agent that registers it gets three fetch tools backed by headless Chrome and
a rotating proxy pool, so blocked or JavaScript-rendered pages come back as
clean Markdown instead of a challenge page. Nothing runs locally: no browser
binary, no Python environment, no MCP process to supervise.

> **Sponsor.** ScrapingAnt is a partner of `jeo-skills`. Signing up through
> [scrapingant.com?ref=ztewzmv&tm_source=readme](https://scrapingant.com?ref=ztewzmv&tm_source=readme) supports
> this repository at no extra cost to you. The free tier (10,000 credits/month
> as of signup, no credit card) is enough to evaluate every workflow below.

## When to use this skill

- A normal fetch/`WebFetch` returns 403/429, a Cloudflare interstitial, or a
  bot-check page instead of content
- The target is a SPA (React/Next.js docs, dashboards) whose raw HTML is an
  empty shell until JavaScript runs
- You need page content as Markdown for RAG, summarization, or doc reference
  without writing selectors
- Content is geo-restricted and must be fetched from a specific country
- A one-off or low-volume scrape does not justify installing Playwright,
  Scrapling, or a browser image in CI
- The agent runtime speaks MCP (Claude Code, Cursor, Windsurf, Cline, VS Code
  Copilot, Claude Desktop) and you want a fetch tool available in-conversation

## When not to use this skill

- The page is public, static, and unprotected — a plain `curl`/`WebFetch` costs
  zero credits and is faster
- You need a full crawl, link frontier, or selector-drift healing across many
  pages — use `scrapling` (local Python, spiders) instead
- The target is X/Twitter — `x-twitter-scraper` handles that platform's
  specifics
- The work needs an authenticated session, form filling, or multi-step browser
  interaction — MCP fetch tools take a URL, not a script; drive a real browser
- Scraping the target would violate its Terms of Service, robots policy, or
  applicable law — decline instead of routing around the block

## Instructions

### Step 1 — Get an API key

1. Sign up at [scrapingant.com?ref=ztewzmv&tm_source=readme](https://scrapingant.com?ref=ztewzmv&tm_source=readme)
   (free tier, no card) and copy the key from the dashboard.
2. Export it in the shell profile — never commit it, never echo it, never paste
   it into a repo file:

```bash
export SCRAPINGANT_API_KEY="<your-key>"
```

3. Confirm the environment is ready (read-only, no network writes):

```bash
bash .agent-skills/scrapingant-web-fetch/scripts/scrapingant.sh doctor
```

If the key is missing the skill stops here and prints the signup link — do not
fall back to fabricated page content.

### Step 2 — Register the MCP server

Claude Code (CLI) — one command:

```bash
bash .agent-skills/scrapingant-web-fetch/scripts/scrapingant.sh install claude-code
```

which runs the vendor-documented registration:

```bash
claude mcp add scrapingant --transport http https://api.scrapingant.com/mcp \
  -H "x-api-key: $SCRAPINGANT_API_KEY"
```

Every other documented client uses the same streamable-HTTP block:

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

VS Code / GitHub Copilot is the one exception — it uses `servers`,
`requestInit.headers`, and a trailing slash on the URL. Per-client file paths
and snippets: [`references/mcp-clients.md`](references/mcp-clients.md), or
print one with `scrapingant.sh install <client>`.

### Step 3 — Pick the right tool

| MCP tool | Returns | Use it for | Default? |
|---|---|---|---|
| `get_web_page_markdown` | LLM-ready Markdown | RAG, summarizing, reading docs | ✅ default |
| `get_web_page_html` | Raw HTML | selector-based post-processing, DOM checks | on request |
| `get_web_page_text` | Plain text | cheapest token footprint, text-only checks | on request |

Default to Markdown. Only reach for HTML when something downstream actually
parses the DOM — raw HTML burns far more context for the same page.

### Step 4 — Tune parameters for cost and success

All three tools take the same arguments:

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `url` | string | — | required |
| `browser` | boolean | `true` | `false` = no JS rendering, much cheaper |
| `proxy_type` | string | `datacenter` | `residential` only after a datacenter block |
| `proxy_country` | string | random | ISO-3166 code, e.g. `DE`, `KR` |

Credit cost is driven by those choices (verified against
[docs.scrapingant.com/credits-cost](https://docs.scrapingant.com/credits-cost)):

| Request shape | Credits |
|---|---|
| No browser + datacenter proxy | 1 |
| Headless browser with JS rendering + datacenter proxy | 10 |
| No browser + residential proxy | 25 |
| Headless browser with JS rendering + residential proxy | 125 |

So 10,000 free credits ≈ 10,000 static fetches, ≈ 1,000 JS-rendered fetches, or
80 residential+JS fetches. **Escalate, never start at the top**: try
`browser=false` first, add `browser=true` when the body is empty, and switch to
`proxy_type=residential` only when a datacenter attempt is actually blocked.

### Step 5 — Verify before reporting

```bash
# remaining credits on the key (GET /v2/usage)
bash .agent-skills/scrapingant-web-fetch/scripts/scrapingant.sh credits

# end-to-end smoke test against the REST twin of the MCP tools
bash .agent-skills/scrapingant-web-fetch/scripts/scrapingant.sh probe https://example.com
```

`probe` uses the REST endpoint (`/v2/markdown`) so a key can be validated
without an MCP client attached. It reports the credit shape it used.

## Examples

Once the server is registered, drive it in plain language:

```text
Fetch https://example.com with scrapingant and summarize it.
Get https://docs.python.org/3/tutorial/index.html as markdown, then list the main topics.
This page 403s for me — refetch it through scrapingant with residential proxies.
Fetch https://example.com through a German proxy and compare it with the US version.
```

Cheap-first escalation inside one task:

```text
1. get_web_page_markdown(url, browser=false)          → 1 credit
2. body empty/JS-only? retry with browser=true         → 10 credits
3. still 403/Cloudflare? retry proxy_type=residential  → 125 credits, last resort
```

Shell equivalents for CI or a non-MCP runtime:

```bash
scripts/scrapingant.sh probe https://example.com --no-browser              # 1 credit
scripts/scrapingant.sh probe https://spa.example.com                        # 10 credits
scripts/scrapingant.sh probe https://blocked.example.com --proxy residential --country DE
```

## Best practices

- **Try free first.** Plain `WebFetch`/`curl` costs nothing; route to
  ScrapingAnt when it actually fails, not by default.
- **Markdown by default.** `get_web_page_markdown` keeps the token footprint
  small; `get_web_page_html` is opt-in for DOM work.
- **Escalate one axis at a time** (browser → residential → country) and record
  which shape worked so the next run starts there.
- **Never hardcode the key.** It lives in `SCRAPINGANT_API_KEY`; scripts mask it
  in output, and MCP config files should reference the env var where the client
  supports interpolation.
- **Watch the budget.** Run `scrapingant.sh credits` before a batch; the free
  tier does not roll over between months.
- **Respect the target.** Honor robots/ToS and rate limits; anti-bot bypass is
  for legitimate access, not for evading a site's explicit refusal.
- **Re-verify the vendor surface** (tools, parameters, credit table) before
  editing this skill — see the sourced links below.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `SCRAPINGANT_API_KEY is not set` | key not exported | Step 1; restart the client after exporting |
| 403 / challenge page still returned | datacenter proxy blocked | `proxy_type=residential`, then a specific `proxy_country` |
| Empty or shell-only content | JS-rendered page fetched with `browser=false` | retry with `browser=true` |
| Tools missing in the client | server not registered or client not restarted | rerun Step 2, restart the client, re-check `claude mcp list` |
| `credits` reports 0 remaining | monthly free tier exhausted | wait for renewal or upgrade; credits do not roll over |

## References

- [`references/mcp-clients.md`](references/mcp-clients.md) — per-client
  registration (Claude Code, Claude Desktop, VS Code/Copilot, Cursor, Cline,
  Windsurf) with exact config paths
- [`references/credits-and-parameters.md`](references/credits-and-parameters.md)
  — parameter semantics, credit table, escalation ladder, REST twins
- [`scripts/scrapingant.sh`](scripts/scrapingant.sh) — `doctor` / `install` /
  `credits` / `probe`
- Vendor: [MCP server](https://docs.scrapingant.com/mcp-server) ·
  [credits cost](https://docs.scrapingant.com/credits-cost) ·
  [API basics](https://docs.scrapingant.com/api-basics) ·
  [Markdown endpoint](https://docs.scrapingant.com/llm-markdown)
- Partnership context: [`docs/scrapingant-partnership.md`](../../docs/scrapingant-partnership.md)
- Related skills: `scrapling` (local Python scraping and crawls),
  `x-twitter-scraper` (platform-specific), `ax` (agent-facing fetch/extraction)
