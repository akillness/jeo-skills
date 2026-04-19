# Solution Landscape: scrapling structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Scrapling | Adaptive Python scraping framework spanning parser, fetchers, stealth, CLI, MCP, and spiders | One package spans parser-first extraction, browser escalation, adaptive selector recovery, and crawl workflows ([GitHub](https://github.com/D4Vinci/Scrapling), [PyPI](https://pypi.org/project/scrapling/)) | Broad scope blurs mode choice and route boundaries; “all-in-one” wording makes it easy to over-escalate | Best bounded improvement is a smaller routing-first front door, not another wrapper |
| lxml / Parsel / selectolax | Parser-first HTML extraction | Fast, simple, and ideal when HTML is already present ([lxml](https://lxml.de/), [Parsel](https://github.com/scrapy/parsel), [selectolax](https://github.com/rushter/selectolax)) | No rendering, anti-bot help, or crawl/state orchestration | Represents the lightest lane Scrapling should route into first |
| Playwright / Selenium | Browser automation and rendering | Handles JS apps, interaction, and browser-state workflows ([Playwright Python](https://github.com/microsoft/playwright-python), [Selenium](https://github.com/SeleniumHQ/selenium)) | Heavier install/runtime cost; often needs separate stealth/proxy help | Closest substitute for Scrapling dynamic/stealth escalation |
| Scrapy / Crawlee / Crawl4AI | Crawl orchestration and multi-page pipelines | Better queueing, retries, traversal, and large crawl structure ([Scrapy](https://github.com/scrapy/scrapy), [Crawlee](https://github.com/apify/crawlee), [Crawl4AI](https://github.com/unclecode/crawl4ai)) | More setup and abstraction overhead than one-page extraction tools | These own the “site-scale crawl” lane better than one-off fetchers |
| Browserbase / Oxylabs / Zyte / Scrapfly / ScrapingBee / Camoufox | Stealth, proxy, or managed unblocker layer | Useful when reliability against protected targets matters more than local simplicity ([Browserbase pricing](https://www.browserbase.com/pricing), [Oxylabs pricing](https://oxylabs.io/pricing), [Zyte pricing](https://www.zyte.com/pricing/), [Scrapfly pricing](https://scrapfly.io/pricing), [ScrapingBee pricing](https://www.scrapingbee.com/pricing), [Camoufox](https://github.com/daijro/camoufox)) | Cost, lock-in, and still no replacement for extraction logic | This is the honest route-out when Scrapling’s built-in stealth is not enough |
| Firecrawl / Jina Reader | Agent-facing scrape/search-to-markdown layer | Fast path for LLM-ready output and agent integrations ([Firecrawl](https://github.com/firecrawl/firecrawl), [Jina Reader](https://github.com/jina-ai/reader)) | Less deterministic/custom than hand-authored extraction; pricing/rate limits vary | Strongest indirect competitor to Scrapling’s MCP/server story |

## Categories
- **Parser-first / extract-only** — lightest lane; start here when HTML is already available.
- **Browser automation / rendering** — escalate only for JS-heavy or interaction-heavy targets.
- **Crawler frameworks** — use when queueing, retries, traversal, checkpointing, or crawl state is the actual job.
- **Stealth / proxy / unblocker layer** — use when target protection is the bottleneck.
- **Agent-facing web extraction** — use when the job is “get normalized content into an agent fast,” not “author a custom scraper stack.”

## What People Actually Use
In practice, users still operate a tiered stack rather than a single magic interface: parser or HTTP first, browser only when rendering is required, stealth/proxies when protection wins, and crawler frameworks when the job becomes multi-page orchestration. Users keep asking for direct JSON/API interception, targeted HTML extraction, and compatibility with existing Scrapy/browser stacks instead of replacing everything with one tool ([Scrapling discussion #158](https://github.com/D4Vinci/Scrapling/discussions/158), [discussion #162](https://github.com/D4Vinci/Scrapling/discussions/162), [Playwright issue #39718](https://github.com/microsoft/playwright/issues/39718), [Playwright issue #5999](https://github.com/microsoft/playwright/issues/5999)).

## Frequency Ranking
1. Browser automation + managed browser infrastructure (`Playwright`, `Selenium`, Browserbase-style services)
2. Crawl frameworks (`Scrapy`, `Crawlee`, `Crawl4AI`)
3. Agent-facing extraction servers (`Firecrawl`, `Jina Reader`, Crawl4AI cloud positioning)
4. Stealth / proxy / unblocker stacks (Camoufox, Oxylabs, Zyte, Scrapfly, ScrapingBee)
5. Parser-first HTML extraction libraries (`lxml`, `Parsel`, `selectolax`)

Popularity signals used during this run also show Scrapling already sits in a well-known OSS tier rather than an awareness gap: Firecrawl ~110k stars, Crawl4AI ~64k, Scrapy ~61k, Scrapling ~37k, Selenium ~34k, Crawlee ~22k, Playwright Python ~14k, Jina Reader ~10k (GitHub API retrieval via `gh api` and lane research).

## Key Gaps
- The market has many solutions, but few tools explain **mode selection** clearly enough: when to stay parser-only, when to choose HTTP fetch, when to pay browser cost, when to escalate to stealth, and when to stop hand-rolling and switch to a crawler.
- Scrapling’s current broad positioning leaves **agent-facing MCP** and **full spider orchestration** too close to the default path even though real usage usually starts smaller.
- Users still need explicit **route-outs** for direct API interception, external unblockers, and larger crawler frameworks.

## Contradictions
- Marketed claim: a modern scraping framework can cover parser, browser, stealth, and agent flows in one surface.
- User reality: production users still fall back to direct HTTP, site-specific request interception, external anti-bot services, and existing crawl stacks when the target gets weird or scale matters ([discussion #162](https://github.com/D4Vinci/Scrapling/discussions/162), [discussion #189](https://github.com/D4Vinci/Scrapling/discussions/189), [issue #248](https://github.com/D4Vinci/Scrapling/issues/248)).

## Key Insight
The best move is not to add another scraping wrapper. The structural gap is a truthful front door that asks one small intake packet first — target type, rendering need, protection level, desired output, and crawl scope — then routes to the lightest workable Scrapling mode or an honest external route-out. Scrapling already has support files and evals; what it lacks is a smaller contract that matches how people actually scrape.

## JTBD Alternatives
- If the real job is **parse HTML I already have**, use a parser-first lane.
- If the real job is **drive a web app or collect rendered state**, use browser automation.
- If the real job is **run a resilient site crawl with queues and retries**, use a crawler framework.
- If the real job is **get one page into an LLM fast**, use an agent-facing extraction service.
- If the real job is **beat strong bot protection reliably**, plan for a managed unblocker or proxy layer instead of pretending local stealth is always enough.

## Curated Sources
- Scrapling: [GitHub](https://github.com/D4Vinci/Scrapling), [PyPI](https://pypi.org/project/scrapling/)
- Parser-first tools: [lxml](https://lxml.de/), [Parsel](https://github.com/scrapy/parsel), [selectolax](https://github.com/rushter/selectolax)
- Browser automation: [Playwright Python](https://github.com/microsoft/playwright-python), [Selenium](https://github.com/SeleniumHQ/selenium)
- Crawler frameworks: [Scrapy](https://github.com/scrapy/scrapy), [Crawlee](https://github.com/apify/crawlee), [Crawl4AI](https://github.com/unclecode/crawl4ai)
- Managed / stealth services: [Browserbase](https://www.browserbase.com/pricing), [Oxylabs](https://oxylabs.io/pricing), [Zyte](https://www.zyte.com/pricing/), [Scrapfly](https://scrapfly.io/pricing), [ScrapingBee](https://www.scrapingbee.com/pricing), [Camoufox](https://github.com/daijro/camoufox)
- Agent-facing extraction: [Firecrawl](https://github.com/firecrawl/firecrawl), [Jina Reader](https://github.com/jina-ai/reader)
