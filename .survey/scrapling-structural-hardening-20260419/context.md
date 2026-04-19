# Context: scrapling structural hardening

## Workflow Context
Scrapling sits across a wide scraping spectrum: parser-only extraction, live HTTP fetching, JavaScript-rendered pages, stealth escalation, CLI/MCP operator flows, and full spiders. Its upstream docs explicitly position it as handling everything from a single request to a full-scale crawl, with parser/fetcher/spider layers rather than one default workflow ([Scrapling docs](https://scrapling.readthedocs.io/en/latest/), [fetcher selection](https://scrapling.readthedocs.io/en/latest/fetching/choosing.html), [spider architecture](https://scrapling.readthedocs.io/en/latest/spiders/architecture.html)). The distinctive promise is adaptive relocation after DOM drift, which matters for production scrapers that silently break after site redesigns ([Scrapling README](https://github.com/D4Vinci/Scrapling#readme)).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Developer / automation engineer | Build extraction flows for internal tooling, ops, or product data | Intermediate |
| Fullstack / browser automation engineer | Pull data from JS-rendered or authenticated web apps | Intermediate–advanced |
| Research / ops / marketing operator | Collect structured content without writing a full crawler stack | Intermediate |
| AI-agent / MCP integrator | Expose web extraction to agents and MCP clients | Intermediate |
| Production scraper maintainer | Keep existing scrapers resilient through DOM drift and anti-bot changes | Advanced |

## Current Workarounds
1. Start parser-first when HTML already exists, then escalate only if the target demands live fetching ([fetcher selection](https://scrapling.readthedocs.io/en/latest/fetching/choosing.html)).
2. Switch from `Fetcher` to `DynamicFetcher` only when the content is actually rendered client-side; escalate to `StealthyFetcher` only when protection blocks the lighter paths ([Scrapling overview](https://scrapling.readthedocs.io/en/latest/overview.html)).
3. Use the CLI or MCP server as low-code shortcuts for quick extraction or agent integration instead of writing Python first ([CLI overview](https://scrapling.readthedocs.io/en/latest/cli/overview.html), [MCP guide](https://scrapling.readthedocs.io/en/latest/ai/mcp-server.html)).
4. Move from one-off fetches to spiders when crawl state, concurrency, pause/resume, or multi-page traversal becomes the real problem ([spider architecture](https://scrapling.readthedocs.io/en/latest/spiders/architecture.html)).
5. Escalate beyond built-in stealth to external anti-bot or proxy services when protected targets still fail ([Scrapling README](https://github.com/D4Vinci/Scrapling#readme)).

## Adjacent Problems
- DOM-drift observability: users want confidence and reporting around adaptive relocation instead of silent fallback behavior ([issue #209](https://github.com/D4Vinci/Scrapling/issues/209)).
- Browser/runtime setup: valid scraping workflows still fail on environment and browser-binary friction ([issue #202](https://github.com/D4Vinci/Scrapling/issues/202)).
- Concurrency/resource scaling: multi-session stealth runs hit operational limits rather than selector issues ([issue #126](https://github.com/D4Vinci/Scrapling/issues/126)).
- Agent/server reliability: MCP and CLI abstractions still leak protocol and argument mismatches into user workflows ([issue #50](https://github.com/D4Vinci/Scrapling/issues/50), [issue #77](https://github.com/D4Vinci/Scrapling/issues/77), [issue #248](https://github.com/D4Vinci/Scrapling/issues/248)).
- Browser-framework boundary: some users need pre-navigation hooks, websocket listeners, or API interception that look more like Crawlee/Playwright orchestration than simple HTML extraction ([issue #237](https://github.com/D4Vinci/Scrapling/issues/237)).

## User Voices
- “most production scrapers break silently” — a user proposing periodic drift checks because selectors stop matching after site changes ([issue #209](https://github.com/D4Vinci/Scrapling/issues/209)).
- “I’ve spent hours troubleshooting based on the docs” — a user struggling with `StealthyFetcher` API/docs mismatch ([issue #161](https://github.com/D4Vinci/Scrapling/issues/161)).
- “this currently can’t be achieved by `page_action` since it runs AFTER the navigation” — a request for pre-navigation browser hooks ([issue #237](https://github.com/D4Vinci/Scrapling/issues/237)).
- “I have a problem when I use `AsyncStealthySession` to scrape many products at the same time” — concurrency/scale pain, not selector syntax pain ([issue #126](https://github.com/D4Vinci/Scrapling/issues/126)).
- “the response is the challenge page” — a protected-site failure even after using the library’s stealth layer ([issue #212](https://github.com/D4Vinci/Scrapling/issues/212)).
