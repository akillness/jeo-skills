# Solution Landscape: playwriter modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Playwriter | Chrome extension + local relay + Playwright API over CLI/MCP | Reuses running browser, cookies, extensions, and explicit tab consent; strong fit for authenticated local workflows | More setup friction than pure headless tools; depends on extension state and local browser availability | Best fit when the user explicitly needs an already-authenticated browser ([README](https://raw.githubusercontent.com/remorses/playwriter/main/README.md)) |
| Playwright `connectOverCDP` | Attach to existing Chromium instance | Official primitive for existing-browser attach | Lower fidelity than native Playwright protocol | Useful comparison baseline, not a full workflow by itself ([docs](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)) |
| Playwright persistent context | Launch browser with persistent profile | Keeps state across runs; official Playwright approach | Still usually Playwright-owned launch rather than true attach to the current user browser | Good fallback when exact live-session reuse is not required ([docs](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)) |
| agent-browser | Fresh-session browser automation with deterministic refs | Strong for isolated repeatable flows and verification | Does not reuse the user’s real authenticated browser | Best contrast skill inside this repo |
| Browserbase / Stagehand | Hosted browser/session infrastructure and higher-level browser automation | Better replayability, session hosting, and agent-facing ergonomics | Moves execution and auth/state into managed infrastructure | Good fresh-session / remote-browser alternative, not the same use case |
| browser-use / similar agent wrappers | Agent-first browser planning on top of browser control | Good for broader task execution and planning | Usually still controls its own browser runtime | Adjacent ecosystem, not the same runtime promise |
| MCP browser connectors | Tool-server integrations for Claude/Codex/Gemini/etc. | Portable agent integration surface | MCP standardizes transport, not browser semantics | Good platform-map input rather than a runtime answer by itself |

## Categories
- **Existing-browser reuse:** Playwriter, Playwright CDP attach.
- **Persistent-but-owned browser state:** Playwright persistent contexts.
- **Fresh-session isolated browser tools:** `agent-browser`, hosted/headless browser agents.
- **Cloud / managed browser infrastructure:** Browserbase, Stagehand, similar products.
- **Agent integration surfaces:** MCP browser servers and connectors.

## What People Actually Use
The recurring real-world patterns are: manual login then session reuse, persistent profiles, CDP attach, extension/relay bridges into the user’s real browser, or managed cloud sessions when locality does not matter. Manual fallback still persists for CAPTCHA, passkeys, unusual consent dialogs, and fragile SPA behavior.

## Frequency Ranking
1. Existing-browser reuse via CDP, persistent profile, or extension bridge.
2. Fresh isolated browsers for repeatable automation and CI-like tasks.
3. Managed browser platforms for long-running or remote agent workflows.
4. MCP/tool-server packaging as the integration layer above whichever browser runtime is chosen.

## Key Gaps
- Existing-browser reuse is still under-documented compared with fresh-session automation.
- Many tools flatten “browser automation” into one bucket instead of forcing a runtime decision: running browser vs fresh browser vs cloud browser.
- MCP integrations hide real tradeoffs unless a skill clearly separates runtime, auth mode, and artifact capture.
- Users still need a practical lane for observe → act → observe and explicit handoff points when auth or UI state gets weird.

## Contradictions
- Marketed browser-agent claims imply full autonomy, but real workflows still depend on human login and state reuse.
- Official Playwright attach primitives exist, but Playwright simultaneously warns that CDP attach is lower fidelity than the ideal path.
- Hosted/browser-cloud tools improve reproducibility, but that can be the wrong answer when the real requirement is “use the browser I already have open.”

## Key Insight
`playwriter` clears the bar as a reusable skill when it is treated as the **running-browser / authenticated-session decision router** rather than a long Playwright command catalog. The strongest upgrade path is not to mimic `agent-browser`, but to make the boundary explicit: choose Playwriter when the task depends on the user’s current Chrome session, extensions, or ongoing tab context; choose fresh-session tools when determinism, isolation, or CI portability matter more.

## Curated Sources
- Playwriter upstream README: https://raw.githubusercontent.com/remorses/playwriter/main/README.md
- Playwright auth docs: https://playwright.dev/docs/auth
- Playwright BrowserType docs (`connectOverCDP`, persistent context): https://playwright.dev/docs/api/class-browsertype
- Browserbase docs: https://docs.browserbase.com/
- Stagehand: https://github.com/browserbase/stagehand
- browser-use: https://github.com/browser-use/browser-use
- MCP intro: https://modelcontextprotocol.io/introduction
