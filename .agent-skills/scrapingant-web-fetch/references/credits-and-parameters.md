# ScrapingAnt — parameters, credits, and the escalation ladder

Verified against [docs.scrapingant.com/mcp-server](https://docs.scrapingant.com/mcp-server),
[/credits-cost](https://docs.scrapingant.com/credits-cost),
[/api-basics](https://docs.scrapingant.com/api-basics), and
[/llm-markdown](https://docs.scrapingant.com/llm-markdown) (2026-08).
Vendor policy can change — re-check this page before trusting the numbers in a
cost estimate.

## Tools

| Tool | Returns |
|---|---|
| `get_web_page_markdown` | page content converted to Markdown (LLM-ready) |
| `get_web_page_html` | raw HTML |
| `get_web_page_text` | plain text |

All three accept the same parameters, so cost depends on the parameters, not on
which of the three you call.

## Parameters

| Parameter | Type | Required | Default | Meaning |
|---|---|---|---|---|
| `url` | string | yes | — | page to fetch |
| `browser` | boolean | no | `true` | headless-Chrome rendering; `false` for static HTML |
| `proxy_type` | string | no | `datacenter` | `datacenter` (fast, cheap) or `residential` (anti-bot) |
| `proxy_country` | string | no | random | ISO-3166 country code, e.g. `DE`, `KR`, `US` |

- `browser=true` is what makes SPAs, hydration-dependent docs, and JS-gated
  content return real text. It is also 10× the cost of a static fetch.
- `residential` proxies exist for targets that block datacenter IP ranges.
  They are the most expensive axis — do not use them speculatively.
- `proxy_country` matters for geo-fenced pricing/content and for locale checks.

## Credit cost

| Request shape | Credits |
|---|---|
| Simple request (no browser) + datacenter proxy | 1 |
| Headless browser, no JS rendering (`return_page_source=true`) + datacenter | 2 |
| Headless browser with JS rendering + datacenter proxy | 10 |
| Simple request (no browser) + residential proxy | 25 |
| Headless browser, `return_page_source=false` + datacenter | 50 |
| Headless browser with JS rendering + residential proxy | 125 |
| Any request to a Google domain + datacenter proxy | 10 |

AI-extractor requests add `ceil((markdown_chars + output_chars) / 30)` credits on
top of the scraping cost — every 30 characters is 1 credit.

Free tier at signup: **10,000 credits/month, no credit card, no rollover.**
That is roughly:

| Strategy | Fetches on the free tier |
|---|---|
| static + datacenter (1 credit) | ~10,000 |
| JS rendering + datacenter (10) | ~1,000 |
| static + residential (25) | ~400 |
| JS rendering + residential (125) | ~80 |

## Escalation ladder

Start cheap. Escalate only on evidence, one axis at a time:

1. **Plain `curl` / `WebFetch`** — 0 credits. If the content is there, stop.
2. **`browser=false`, datacenter** — 1 credit. Static HTML, blogs, docs that
   server-render.
3. **`browser=true`, datacenter** — 10 credits. Body was empty, or the page is a
   React/Vue/Next SPA shell.
4. **`proxy_type=residential`** — 25/125 credits. Only after a datacenter attempt
   returned 403/429 or a challenge page.
5. **`proxy_country=<ISO>`** — same cost as the tier it is added to; use when the
   content is geo-fenced or you must verify a locale.

Record the shape that worked for a given domain so the next run starts there
instead of walking the ladder again.

## REST twins (no MCP client required)

Useful in CI, in a non-MCP runtime, or when validating a key.

```bash
# Markdown (same output family as get_web_page_markdown)
curl --get 'https://api.scrapingant.com/v2/markdown' \
  --data-urlencode "url=https://example.com" \
  --data-urlencode "x-api-key=$SCRAPINGANT_API_KEY"

# General endpoint (HTML)
curl --get 'https://api.scrapingant.com/v2/general' \
  --data-urlencode "url=https://example.com" \
  --data-urlencode "browser=false" \
  --data-urlencode "x-api-key=$SCRAPINGANT_API_KEY"

# Remaining credits
curl --get 'https://api.scrapingant.com/v2/usage' \
  --data-urlencode "x-api-key=$SCRAPINGANT_API_KEY"
```

`/v2/usage` responds with `plan_name`, `start_date`, `end_date`,
`plan_total_credits`, and `remained_credits`.

`scripts/scrapingant.sh probe|credits` wraps these calls and keeps the key out of
the printed command line.

## Cost hygiene

- Check `credits` before a batch and after a failed escalation loop.
- Prefer Markdown output: fewer tokens downstream for the same credits.
- Cache what you fetch inside a task; refetching the same URL costs again.
- The free tier resets monthly and does not accumulate — an unused month is gone.
