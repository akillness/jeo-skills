# Solution Landscape: agent-browser modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Playwright | Deterministic browser automation with locators, assertions, auth state, traces, and screenshots | Strong repeatability, rich assertion model, broad ecosystem | Lower-level than goal-driven agent browsing; selector work still matters | Best baseline for the clean-session verification lane |
| browser-use | Agent-native browser control for open-ended web tasks | Semantic task execution, strong agent mindshare | Flakier trajectories, higher latency/token cost, harder replay/debug | Good contrast case, not the desired default lane |
| Browserbase | Remote browser/session infrastructure | Cloud sessions, recordings, infra support | Commercial dependency, needs logic layer above it | Infra, not the core skill boundary |
| Stagehand | Higher-level browser automation for AI workflows | Separates act / extract / observe, good conceptual fit | Smaller ecosystem than Playwright, still model-dependent | Useful pattern source for mode separation |
| MCP browser server pattern | Tool/server transport exposing browser actions to agents | Cross-agent integration, composable tool surface | Capability schemas and lifecycle hooks vary by client | Good architecture note, not a user-facing browser lane |
| Selenium / Puppeteer / Cypress | Adjacent browser testing stacks | Familiarity, legacy adoption | Weaker fit for current agent workflows and cross-browser LLM tooling | Comparison only |

## Categories
- Deterministic browser automation: Playwright
- Agent-native browser control: browser-use, Stagehand
- Browser infrastructure/session backends: Browserbase
- Tool/server protocol layer: MCP browser servers
- Adjacent testing stacks: Selenium, Puppeteer, Cypress

## What People Actually Use
In practice, teams pair repo-local instruction files and config with a Playwright-style clean browser for reproducible checks, then separately maintain auth snapshots, persistent profiles, or running-browser bridges when determinism breaks down. Visual confirmation still happens via screenshots or traces even when DOM-based checks exist.

## Frequency Ranking
1. Playwright
2. browser-use
3. Browserbase
4. Stagehand
5. Playwright/MCP browser-server patterns
6. Selenium / Puppeteer / Cypress

## Key Gaps
- Many browser-agent tools optimize for broad autonomous browsing, not narrow reproducible verification.
- Auth/session reuse is routinely conflated with deterministic verification even though they need different defaults and evals.
- Cross-platform agent clients differ on lifecycle hooks, so rules and support files must carry more of the invariant behavior.

## Contradictions
- Marketed promise: one browser tool handles everything from login-heavy workflows to CI-grade verification.
- User reality: operators split responsibilities between clean-session checks, running-browser reuse, and exact visual review because a single mode is too flaky or too stateful.

## Key Insight
The best non-duplicative modernization path is to make `agent-browser` explicitly own fresh-session deterministic verification: clean browser first, observe before/after each action, prefer semantic or structured state checks over ad hoc screenshots, and route stateful or exact rendered-review work outward rather than swallowing the whole browser stack.

## Curated Sources
- https://playwright.dev/
- https://playwright.dev/docs/locators
- https://playwright.dev/docs/auth
- https://playwright.dev/docs/codegen
- https://github.com/browser-use/browser-use
- https://docs.browser-use.com/
- https://www.browserbase.com/
- https://github.com/browserbase/stagehand
- https://modelcontextprotocol.io/
