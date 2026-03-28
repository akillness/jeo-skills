---
name: scrapling
description: >
  Install, configure, and operate Scrapling for adaptive web scraping with parser-first HTML
  extraction, fast HTTP fetchers, browser rendering, stealth anti-bot options, CLI extraction,
  and optional MCP or spider workflows. Use when you need to scrape or crawl websites, choose
  between static, JavaScript-rendered, or protected targets, parse HTML with CSS or XPath,
  write Python scrapers, or run Scrapling from the terminal. Triggers on: scrapling, scrape
  website, crawl site, adaptive scraping, stealthy fetch, cloudflare scraping, mcp scraping
  server, browser scraping cli, scrapling spider.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: Requires Python 3.10+ and works best in a virtual environment. Browser-backed fetchers, shell, and MCP flows require extras plus `scrapling install` to download browser dependencies. Docker is optional for CLI-only workflows.
license: BSD-3-Clause
metadata:
  tags: scrapling, web-scraping, crawling, adaptive-scraping, mcp, cli, playwright, cloudflare, spiders, python
  version: "1.0"
  source: https://github.com/D4Vinci/Scrapling
---

# scrapling - Adaptive Web Scraping Framework

> **Keyword**: `scrapling` · `adaptive scraping` · `stealthy fetch` · `scrapling spider`
>
> Respect each target site's terms, robots, rate limits, and authorization boundaries.

Scrapling is a Python scraping framework for parser-first HTML extraction, browser-backed fetching, stealth anti-bot handling, CLI prototyping, and optional larger crawl workflows. Its distinctive feature is adaptive scraping: you can save element fingerprints and later relocate equivalent elements after a site redesign.

## When to use this skill

- Install Scrapling with the right extras for parser-only, fetchers, shell, AI, or full usage
- Parse known HTML with `Selector` before escalating to browser-backed fetchers
- Choose between `Fetcher`, `DynamicFetcher`, and `StealthyFetcher`
- Reuse `FetcherSession`, `DynamicSession`, or `StealthySession` for multiple requests
- Parse HTML with CSS, XPath, `::text`, `::attr(...)`, text matching, regex, and similar-element lookup
- Enable adaptive scraping with `adaptive=True`, `auto_save=True`, `retrieve()`, and `relocate()`
- Use the `scrapling` CLI for terminal-first extraction or shell work
- Understand MCP and spiders as second-tier workflows once core scraping is working
- Decide when Docker-only CLI usage is enough versus when Python code is required

## Instructions

### Step 1: Install and verify the environment

Use a virtual environment unless the user explicitly wants a system install.

```bash
bash scripts/install.sh
```

Supported install profiles:

- `parser`: `pip install scrapling`
- `fetchers`: `pip install "scrapling[fetchers]"`
- `shell`: `pip install "scrapling[shell]"`
- `ai`: `pip install "scrapling[ai]"`
- `all`: `pip install "scrapling[all]"`

Examples:

```bash
bash scripts/install.sh --profile parser
bash scripts/install.sh --profile fetchers
bash scripts/install.sh --profile all --force
```

Browser-backed flows require `scrapling install`. Parser-only workflows do not.

If the user only wants terminal extraction and prefers containers, Docker images are available. That path is CLI-oriented and does not replace Python coding workflows.

### Step 2: Start parser-first, then choose the right fetcher

If the user already has HTML or only needs DOM parsing, start with `Selector`:

```python
from scrapling import Selector

page = Selector(html_doc, url="https://example.com")
titles = page.css("h1::text").getall()
links = page.css("a::attr(href)").getall()
```

Important parser notes:

- Scrapling currently targets HTML, not XML feeds
- `Selector` is the current user-facing parser API
- Legacy `Adaptor` compatibility exists in code, but teach `Selector`

If the user needs live fetching, pick the narrowest fetcher that solves the job:

- **`Fetcher`**: static HTML or plain HTTP targets
- **`DynamicFetcher`**: JavaScript-rendered pages
- **`StealthyFetcher`**: harder protected targets, including documented Cloudflare handling

Escalation rule:

1. Start with `Selector` if you already have HTML
2. Otherwise start with `Fetcher`
3. If content is rendered client-side, switch to `DynamicFetcher`
4. If protection blocks or empties the result, switch to `StealthyFetcher`

Do not present anti-bot bypass as guaranteed. Phrase it as a documented capability whose success depends on the target and environment.

### Step 3: Parse the response and reuse sessions

All fetchers return a `Response` object that extends Scrapling's `Selector` engine.

Core parsing options:

- CSS selectors: `page.css(".product")`
- XPath selectors: `page.xpath("//article")`
- Text and attributes: `::text`, `::attr(href)`
- Text search: `find_by_text(...)`
- Regex search: `find_by_regex(...)`
- Similar elements: `element.find_similar(...)`

Use session classes for repeated requests, cookies, or state reuse:

```python
from scrapling.fetchers import FetcherSession

with FetcherSession(impersonate="chrome") as session:
    page1 = session.get("https://example.com")
    page2 = session.get("https://example.com/account")
```

Use adaptive scraping when the target DOM is brittle:

```python
from scrapling.fetchers import Fetcher

Fetcher.configure(adaptive=True)
page = Fetcher.get("https://example.com")

saved = page.css(".product", auto_save=True)
relocated = page.css(".product", adaptive=True)
```

Important adaptive notes:

- `adaptive=True` is off by default
- `auto_save=True` stores element fingerprints keyed by selector or identifier
- `adaptive_domain` helps when the same site moved domains or archived copies are involved
- Manual flows are available with `save()`, `retrieve()`, and `relocate()`

Move the deeper parser details into [references/parser-and-adaptive.md](references/parser-and-adaptive.md).

### Step 4: Use the CLI for quick extraction or shell work

CLI overview:

- `scrapling install`
- `scrapling shell`
- `scrapling extract get|post|put|delete|fetch|stealthy-fetch`

Wrapper scripts in this skill:

- `bash scripts/run-extract.sh get "https://example.com" article.md`
- `bash scripts/run-extract.sh fetch "https://app.example.com" content.md --network-idle`
- `bash scripts/run-extract.sh stealth "https://protected.example.com" content.md --solve-cloudflare`

Use the CLI when:

- The user needs quick output files in `.md`, `.html`, or `.txt`
- CSS selectors are enough to trim output
- A shell should be started without writing Python first

CLI and optional MCP details live in [references/cli-and-mcp.md](references/cli-and-mcp.md).

### Step 5: Treat MCP and spiders as second-tier workflows

Use MCP when the user explicitly wants Scrapling exposed to an agent client:

```bash
bash scripts/run-mcp.sh
bash scripts/run-mcp.sh --http --host 127.0.0.1 --port 8000
```

Use spiders when the task is no longer a few page fetches and becomes a crawl with link following, concurrency, or checkpoint resume.

These are important capabilities, but they should not replace the core parser-plus-fetcher workflow in normal end-user guidance.

## Examples

### Example 1: Install Scrapling with all extras

```bash
bash scripts/install.sh
```

### Example 2: Parser-only install

```bash
bash scripts/install.sh --profile parser
```

### Example 3: Parse local HTML with `Selector`

```python
from scrapling import Selector

page = Selector(html_doc, url="https://example.com")
titles = page.css("h1::text").getall()
links = page.css("a::attr(href)").getall()
```

### Example 4: Fast static scrape from the terminal

```bash
bash scripts/run-extract.sh get "https://example.com" content.md --css-selector "article"
```

### Example 5: Python `Fetcher`

```python
from scrapling.fetchers import Fetcher

page = Fetcher.get("https://example.com", impersonate="chrome")
title = page.css("title::text").get()
```

### Example 6: Python `DynamicFetcher`

```python
from scrapling.fetchers import DynamicFetcher

page = DynamicFetcher.fetch(
    "https://example.com",
    network_idle=True,
    wait_selector=".content"
)
```

### Example 7: Python `StealthyFetcher`

```python
from scrapling.fetchers import StealthyFetcher

page = StealthyFetcher.fetch(
    "https://example.com",
    headless=True,
    solve_cloudflare=True
)
```

### Example 8: Async HTTP

```python
from scrapling.fetchers import AsyncFetcher

page = await AsyncFetcher.get("https://example.com")
```

### Example 9: Session reuse

```python
from scrapling.fetchers import FetcherSession

with FetcherSession(impersonate="chrome") as session:
    page1 = session.get("https://example.com")
    page2 = session.get("https://example.com/account")
```

### Example 10: Adaptive selector recovery

```python
from scrapling.fetchers import Fetcher

Fetcher.configure(adaptive=True, adaptive_domain="example.com")
page = Fetcher.get("https://example.com")
saved = page.css(".product", auto_save=True)
relocated = page.css(".product", adaptive=True)
```

### Example 11: Minimal spider reference

```python
from scrapling.spiders import Spider, Response

class QuotesSpider(Spider):
    name = "quotes"
    start_urls = ["https://quotes.toscrape.com/"]

    async def parse(self, response: Response):
        for quote in response.css(".quote"):
            yield {"text": quote.css(".text::text").get()}

result = QuotesSpider().start()
print(result.items.to_json())
```

### Example 12: Start the MCP server over stdio

```bash
bash scripts/run-mcp.sh
```

## Best practices

1. Start with `Selector` or the lightest fetcher that works and escalate only when the site actually needs rendering or stealth.
2. Reuse session classes for repeated requests so browser startup and connection overhead stay low.
3. Prefer `.md` or `.txt` CLI output and CSS selectors over dumping full HTML into the model context.
4. Enable adaptive scraping only where selector brittleness is a real maintenance problem.
5. Use `page_action`, `wait_selector`, and `network_idle` deliberately instead of adding blind sleeps.
6. Treat Cloudflare solving, proxies, and browser impersonation as opt-in tools for authorized, policy-compliant work, not guaranteed bypasses.
7. Remember that XML feeds are not the current target surface; Scrapling is documented around HTML parsing.
8. Move from CLI to Python or spiders when retry logic, structured output, or crawl control becomes important.
9. For MCP usage, make the client/server transport explicit: stdio for local agent integration, `--http` for streamable HTTP deployments.

## References

- [references/fetchers-and-sessions.md](references/fetchers-and-sessions.md)
- [references/parser-and-adaptive.md](references/parser-and-adaptive.md)
- [references/cli-and-mcp.md](references/cli-and-mcp.md)
- [references/spiders.md](references/spiders.md)
- [scripts/install.sh](scripts/install.sh)
- [scripts/run-extract.sh](scripts/run-extract.sh)
- [scripts/run-mcp.sh](scripts/run-mcp.sh)
- [Scrapling GitHub Repository](https://github.com/D4Vinci/Scrapling)
- [Scrapling Documentation](https://scrapling.readthedocs.io/en/latest/)
