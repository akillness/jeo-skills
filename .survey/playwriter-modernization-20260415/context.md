# Context: playwriter modernization

## Workflow Context
Stateful authenticated browser automation appears when a clean disposable browser is the wrong runtime: SSO and MFA-heavy internal tools, admin consoles, support/revops back offices, and agent workflows that depend on existing cookies, extensions, and already-open tabs. Playwright’s auth guide explicitly recommends authenticating once and reusing state because repeated login is slow and brittle ([Playwright auth docs](https://playwright.dev/docs/auth)). Playwright also documents `connectOverCDP` for attaching to an existing Chromium instance, while warning that CDP is lower fidelity than the native Playwright protocol ([BrowserType docs](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)).

Upstream `playwriter` positions itself around this exact gap: “Let your agents control your own Chrome, via CLI or MCP. Your logins, extensions, cookies — already there,” and “Playwriter connects to **your running browser** instead” ([GitHub raw primary-source retrieval](https://raw.githubusercontent.com/remorses/playwriter/main/README.md)).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Agent builders | Need browser control inside authenticated real-user sessions | Intermediate–advanced |
| Developers / QA | Need to automate login-heavy or extension-dependent web flows | Intermediate–advanced |
| Ops / support / back-office users | Need repetitive SaaS/admin-panel automation without re-auth | Intermediate |
| AI-tooling users in Claude/Codex/Gemini ecosystems | Need browser tooling that can reuse a live browser rather than spawn a fresh one | Intermediate |

## Current Workarounds
1. Save and reuse Playwright storage state after a one-time manual login ([Playwright auth docs](https://playwright.dev/docs/auth)). Limitation: not every site’s auth survives storage-state replay.
2. Attach via CDP to an existing browser with remote debugging enabled ([BrowserType docs](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)). Limitation: Playwright explicitly calls CDP lower fidelity than its native protocol.
3. Use a persistent user-data-dir or persistent Playwright context instead of a fresh browser every run ([BrowserType docs](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)). Limitation: still not the same as attaching to the exact browser the user already has open.
4. Use extension/relay bridges so the agent operates in the user’s real browser tab instead of a fresh automation browser. Upstream `playwriter` uses a Chrome extension plus local WebSocket relay on `localhost:19988` with explicit tab opt-in and extension-origin validation ([GitHub raw primary-source retrieval](https://raw.githubusercontent.com/remorses/playwriter/main/README.md)).
5. Fall back to manual login / CAPTCHA / MFA handoff, then resume automation. Limitation: still needs human intervention in real-world flows.

## Adjacent Problems
- Bot detection, CAPTCHA, passkeys, WebAuthn, device trust, and corporate-browser policies often make fresh headless sessions fail first.
- Existing-browser reuse improves access but reduces determinism and isolation.
- Agent workflows still need explicit observe → act → observe loops to avoid stale selectors and invisible state changes.
- Extension/relay setups add their own failure modes: extension not enabled, server not running, wrong tab, stale session, or remote-access confusion.
- Saved auth state is sensitive and should be treated as secret material ([Playwright auth docs](https://playwright.dev/docs/auth)).

## User Voices
> “Let your agents control your own Chrome, via CLI or MCP. Your logins, extensions, cookies — already there.” — `playwriter` README ([GitHub raw primary-source retrieval](https://raw.githubusercontent.com/remorses/playwriter/main/README.md))

> “Other browser MCPs spawn a fresh Chrome — no logins, no extensions… Playwriter connects to **your running browser** instead.” — `playwriter` README ([GitHub raw primary-source retrieval](https://raw.githubusercontent.com/remorses/playwriter/main/README.md))

> Playwright’s auth docs normalize the practical workflow of authenticating once and reusing saved state because repeated login is expensive and brittle ([Playwright auth docs](https://playwright.dev/docs/auth)).

## Actual Behavior Notes
People usually do one of four things in practice: reuse storage state, attach to a manually logged-in browser, use persistent profiles, or bridge into a real user browser with an extension/relay. Even when DOM control exists, modern agent/browser stacks still fall back to repeated observation plus screenshots or human intervention for CAPTCHA/MFA and dynamic UI glitches.

## Sources
- https://raw.githubusercontent.com/remorses/playwriter/main/README.md
- https://playwright.dev/docs/auth
- https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp
- https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context
