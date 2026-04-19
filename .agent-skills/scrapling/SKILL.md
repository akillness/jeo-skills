---
name: scrapling
description: >
  Route web-scraping work into the lightest workable Scrapling mode instead of defaulting to a browser.
  Use when the user needs HTML extraction, JS-rendered page retrieval, protected-target escalation,
  quick CLI scraping, agent-facing MCP access, or a larger crawl with Scrapling spiders. Triggers on:
  scrapling, scrape website, crawl site, adaptive scraping, selector drift, stealthy fetch, browser scraping,
  scrape to markdown, scrapling mcp, scrapling spider.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: Requires Python 3.10+ and works best in a virtual environment. Browser-backed fetchers, CLI shell, MCP, and spiders require extras plus `scrapling install` for browser dependencies.
license: BSD-3-Clause
metadata:
  tags: scrapling, web-scraping, crawling, adaptive-scraping, mcp, cli, playwright, cloudflare, spiders, python
  version: "1.1"
  source: https://github.com/D4Vinci/Scrapling
---

# scrapling - routing-first adaptive web scraping

> **Keyword**: `scrapling` · `adaptive scraping` · `stealthy fetch` · `scrapling spider`
>
> Respect each target site's terms, robots, rate limits, authorization boundaries, and anti-abuse policies.

Scrapling is most useful when you choose the **smallest scraping mode that fits the job**:
- parse known HTML before reaching for a browser
- start with plain HTTP before rendering JavaScript
- escalate to stealth only when simpler paths fail
- switch to spiders only when crawl state and multi-page orchestration become the real problem

## When to use this skill

- The user needs one page or a few pages extracted and you must decide between parser-only, HTTP fetch, browser rendering, or stealth
- The user wants to prototype with `scrapling extract`, `scrapling shell`, or wrapper scripts instead of writing Python first
- The user wants adaptive selector recovery because the target DOM changes over time
- The user wants Scrapling exposed to an agent via MCP
- The user is about to turn repeated fetches into a site crawl and needs to know when Scrapling spiders are justified
- The user keeps drifting toward Playwright/Crawlee-style orchestration, direct API interception, or managed unblockers and needs an honest route-out

## Instructions

### Step 1: Capture one intake packet before choosing tools

Collect the minimum packet:

- **Target class**: raw HTML, normal web page, JS-rendered app, protected site, or many-page crawl
- **Desired output**: CSS/XPath extraction, Markdown/text file, structured records, or long-running crawl output
- **Operational need**: quick probe, repeated session reuse, agent/MCP access, or resumable crawling
- **Constraint**: install budget, browser availability, auth/proxy limits, and whether direct API/JSON access may be better than DOM scraping

Use this rule set:

1. If HTML is already available, start with `Selector`
2. If a live page is needed, start with `Fetcher`
3. If the content is rendered client-side, move to `DynamicFetcher`
4. If the rendered path is still blocked or empty, move to `StealthyFetcher`
5. If the job is now queueing, link following, retries, or checkpoints, move to spiders
6. If the real need is browser automation, pre-navigation request interception, or a managed unblocker, route out instead of over-promising Scrapling

Detailed packet examples and route-outs live in [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md).

### Step 2: Install only the profile you need

Use a virtual environment unless the user explicitly wants a system install.

```bash
bash scripts/install.sh --profile parser
bash scripts/install.sh --profile fetchers
bash scripts/install.sh --profile shell
bash scripts/install.sh --profile ai
bash scripts/install.sh --profile all
```

Installation guidance:

- `parser` — local HTML parsing only
- `fetchers` — HTTP + browser-backed fetchers
- `shell` — interactive CLI shell workflows
- `ai` — MCP server workflows
- `all` — only when the user truly needs the full surface

Browser-backed flows require `scrapling install`. Parser-only workflows do not.

### Step 3: Choose the lightest extraction path that fits

#### A. Parser-only path
Use this when HTML is already available or the user mainly needs selector logic.

```python
from scrapling import Selector

page = Selector(html_doc, url="https://example.com")
items = page.css("article h2::text").getall()
```

Use this path for:
- local HTML fixtures
- saved responses
- quick selector authoring
- low-cost extraction without network/browser concerns

#### B. HTTP fetch path
Use `Fetcher` or `FetcherSession` when plain HTTP is likely enough.

```python
from scrapling.fetchers import Fetcher

page = Fetcher.get("https://example.com", impersonate="chrome")
title = page.css("title::text").get()
```

Prefer this path for:
- docs, blogs, many marketing pages, search results, simple product pages
- cheap repeated requests with session reuse
- cases where the user only needs rendered HTML if evidence proves HTTP is insufficient

#### C. Dynamic browser path
Use `DynamicFetcher` or `DynamicSession` when the target is JS-rendered.

```python
from scrapling.fetchers import DynamicFetcher

page = DynamicFetcher.fetch(
    "https://example.com/app",
    network_idle=True,
    wait_selector=".content"
)
```

Reach for this when:
- the page is a SPA/dashboard
- content appears only after client-side rendering
- small interaction or wait controls are enough

#### D. Stealth path
Use `StealthyFetcher` or `StealthySession` only when the lighter paths fail because of protection.

```python
from scrapling.fetchers import StealthyFetcher

page = StealthyFetcher.fetch(
    "https://example.com/protected",
    headless=True,
    solve_cloudflare=True
)
```

Important:
- Treat anti-bot handling as a documented capability, not a guarantee
- If a target still fails or requires stronger infra, route honestly to proxies or managed unblockers instead of pretending one more flag will always fix it

Fetcher/session details live in [references/fetchers-and-sessions.md](references/fetchers-and-sessions.md).

### Step 4: Use adaptive scraping only when selector drift is the problem

Adaptive scraping is valuable when the DOM changes but the semantic target is still the same.

```python
from scrapling.fetchers import Fetcher

Fetcher.configure(adaptive=True)
page = Fetcher.get("https://example.com")
saved = page.css(".product", auto_save=True)
relocated = page.css(".product", adaptive=True)
```

Remember:
- `adaptive=True` is opt-in
- `auto_save=True` stores fingerprints for later reuse
- manual `save()`, `retrieve()`, and `relocate()` flows are available
- this helps brittle selectors, not auth failures or full site redesign strategy

Parser/adaptive details live in [references/parser-and-adaptive.md](references/parser-and-adaptive.md).

### Step 5: Choose the right operator surface

#### CLI / shell
Use CLI when the user wants quick output files or a terminal-first probe.

```bash
bash scripts/run-extract.sh get "https://example.com" article.md --css-selector "article"
bash scripts/run-extract.sh fetch "https://app.example.com" content.md --network-idle
bash scripts/run-extract.sh stealth "https://protected.example.com" content.md --solve-cloudflare
```

Use `scrapling shell` when the user wants an interactive REPL rather than a standalone script.

#### MCP
Use MCP when the goal is agent-facing access instead of a bespoke scraper script.

```bash
bash scripts/run-mcp.sh
bash scripts/run-mcp.sh --http --host 127.0.0.1 --port 8000
```

Start with stdio for local agent integration; use HTTP only when the environment already expects streamable HTTP.

CLI/MCP details live in [references/cli-and-mcp.md](references/cli-and-mcp.md).

### Step 6: Switch to spiders only when crawl state matters

Use spiders when the task needs:
- multiple pages and link following
- retries and blocked-response handling
- concurrency and session routing
- pause/resume checkpoints via `crawldir`

For one or two isolated pages, fetchers remain simpler.

```python
from scrapling.spiders import Spider, Response

class QuotesSpider(Spider):
    name = "quotes"
    start_urls = ["https://quotes.toscrape.com/"]

    async def parse(self, response: Response):
        for quote in response.css(".quote"):
            yield {"text": quote.css(".text::text").get()}
```

Spider details live in [references/spiders.md](references/spiders.md).

## Examples

### Example 1: I already have HTML and just need selectors
Use `Selector`, not a browser.

### Example 2: A marketing page loads over plain HTTP
Start with `Fetcher` or `scrapling extract get`, then escalate only if evidence says the content is missing.

### Example 3: A React dashboard is empty until JS runs
Move to `DynamicFetcher` and use `network_idle` or `wait_selector`.

### Example 4: A protected target returns a challenge page
Try `StealthyFetcher`, but make it explicit that stronger proxy/unblocker infrastructure may still be required.

### Example 5: An agent needs bounded web extraction
Expose Scrapling through MCP instead of forcing a handwritten scraper first.

### Example 6: The task has become a real crawl
Route from repeated fetches into spiders with checkpointing and session control.

## Best practices

1. Start with the smallest viable mode and escalate only on evidence.
2. Prefer direct API/JSON access when that is the real source of truth; do not force DOM scraping for browser-heavy apps.
3. Reuse sessions for repeated requests instead of relaunching browsers on every page.
4. Use adaptive scraping for selector drift, not as a blanket fix for every failure mode.
5. Prefer CSS selectors plus `.md` or `.txt` outputs to keep model context smaller.
6. Treat CLI, MCP, and spiders as operator surfaces layered on top of the same routing logic, not three unrelated features.
7. Route honestly to Playwright/Crawlee-style automation, external unblockers, or another extraction service when Scrapling is no longer the best fit.

## References

- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/fetchers-and-sessions.md](references/fetchers-and-sessions.md)
- [references/parser-and-adaptive.md](references/parser-and-adaptive.md)
- [references/cli-and-mcp.md](references/cli-and-mcp.md)
- [references/spiders.md](references/spiders.md)
- [scripts/install.sh](scripts/install.sh)
- [scripts/run-extract.sh](scripts/run-extract.sh)
- [scripts/run-mcp.sh](scripts/run-mcp.sh)
- [Scrapling GitHub Repository](https://github.com/D4Vinci/Scrapling)
- [Scrapling Documentation](https://scrapling.readthedocs.io/en/latest/)
