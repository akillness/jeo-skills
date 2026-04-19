# Intake Packets and Route-outs

Use this note when the front door needs to stay small.

## 1. Intake packet

Ask for the smallest packet that decides the mode:

| Field | What to capture | Why it matters |
|---|---|---|
| Target class | raw HTML, normal page, JS app, protected site, or crawl | Decides parser vs fetcher vs stealth vs spider |
| Desired output | selector result, Markdown/text file, structured records, or crawl dataset | Decides CLI vs Python vs spider export surface |
| Scope | one page, a few pages, or many-page traversal | Prevents over-jumping into spiders |
| Constraints | browser availability, proxy budget, auth, rate limits, agent integration | Keeps install and route choices honest |
| Source of truth | DOM, direct API/JSON, downloadable document, or site search | Prevents unnecessary browser scraping |

## 2. Quick routing table

| Situation | Default move | Why |
|---|---|---|
| HTML already exists | `Selector` | Cheapest selector path |
| Plain server-rendered page | `Fetcher` / `FetcherSession` | Avoid browser overhead |
| Client-rendered page | `DynamicFetcher` / `DynamicSession` | Browser rendering is justified |
| Protected target returns blocks/challenge/empty state | `StealthyFetcher` / `StealthySession` | Escalate only after lighter paths fail |
| Repeated page traversal / queueing / checkpoints | Spiders | Crawl state matters now |
| Agent needs a bounded web tool | MCP | Expose a tool surface instead of bespoke code |

## 3. Honest route-outs

Route out instead of stretching Scrapling when the user actually needs:

- **Direct API interception or request hooks before navigation** → consider Playwright/Crawlee-style browser automation or direct HTTP requests if the real data source is JSON/API, not the rendered DOM.
- **Reliable managed anti-bot infrastructure** → consider external proxy/unblocker providers rather than implying `StealthyFetcher` will always succeed.
- **Large-scale distributed crawling and queue orchestration** → consider a crawler framework or existing crawl stack if Scrapling spiders are no longer the smallest practical abstraction.
- **Fast LLM-ready page ingestion without custom extraction logic** → consider an agent-facing extraction service when deterministic custom scraping is not required.

## 4. Failure-language guidance

Say this explicitly when needed:

- "Start with the lightest mode that proves the data is reachable."
- "Stealth is a later escalation, not the default."
- "Adaptive scraping helps with selector drift, not auth or anti-bot guarantees."
- "If the real source of truth is an API response, route to direct request interception instead of forcing DOM scraping."
- "If the site still fails after honest stealth attempts, escalate to a managed unblocker or different stack rather than promising more flags will fix it."
