---
name: playwriter
description: "Reuse a running Chrome session for browser automation via Playwriter CLI + MCP. Use when the task depends on the browser the user already has open — existing logins, cookies, extensions, passkey-friendly flows, or live-tab continuity. Route repeatable fresh-browser or CI-style checks to `browser-harness` instead."
license: MIT
compatibility: Requires Chrome/Chromium plus the Playwriter extension and CLI (`npm install -g playwriter` or `npx playwriter@latest`). Works best for local headed browser workflows where reusing the current browser session matters more than CI-grade determinism.
metadata:
  version: 1.1.0
  source: remorses/playwriter
  tags: playwriter, playwright, browser-automation, chrome-extension, mcp, authenticated, stateful, session-reuse
allowed-tools: Read Write Bash Grep Glob
---

# playwriter

Playwriter is the **running-browser** browser-automation skill. It connects an agent to Chrome/Chromium that is already part of the user’s real workflow instead of spawning a clean disposable browser. That makes it useful for authenticated flows, extension-dependent pages, and long-lived tab context — but less reproducible than a fresh-session browser tool.

## When to use this skill

Use `playwriter` when the task needs one or more of these:

- the browser the user already has open
- existing logins, cookies, or trusted-device state
- extension-dependent workflows
- passkey / SSO / MFA-heavy flows where manual login handoff is realistic
- live-tab continuity with a human and agent sharing the same browser
- MCP-based browser control for Claude / Codex / Gemini using the running browser

Do **not** use `playwriter` by default for:

- CI-style repeatable browser checks
- fresh-session verification that should not touch the user’s real browser profile
- simple scraping or deterministic form checks that fit `browser-harness`
- tasks that need the strongest isolation or the least user-state coupling

## Quick routing rule

| If the job needs... | Use |
|---|---|
| The browser the user already has open | `playwriter` |
| Existing logins / cookies / extensions | `playwriter` |
| A clean, reproducible, disposable session | `browser-harness` |
| Headless verification / screenshot diffs / isolated checks | `browser-harness` |
| Hosted or cloud browser infrastructure | a provider-specific or cloud-browser skill |

## Instructions

### Step 1: Pick the right browser runtime

Use `playwriter` only when running-browser reuse is the requirement. If the task is really about a clean disposable browser or CI-style reproducibility, route to `browser-harness` instead.

### Step 2: Follow the core workflow

Always follow the same loop:

1. **Prepare the running-browser bridge**
2. **Create or select a session**
3. **Observe first** with `snapshot({ page })`
4. **Act once**
5. **Observe again** before the next action

### Step 1: Install the extension and CLI

```bash
# install the CLI
npm install -g playwriter
# or use it without global install
npx playwriter@latest --help
```

Install the **Playwriter** Chrome extension, then click the extension icon on the tab you want to control. The tab should show the connected/green state before you assume automation is available.

### Step 2: Start browser support and create a session

Use the upstream browser/session flow, not a vague “extension auto-starts everything” assumption:

```bash
# start the managed browser/runtime if needed
playwriter browser start

# create a stateful sandbox session
playwriter session new

# inspect current sessions
playwriter session list
```

Notes:
- `playwriter browser start` can launch Chrome for Testing / Chromium with the Playwriter extension available.
- `playwriter session new` creates a **stateful sandbox** and returns a session id.
- Browser tabs are shared, but session state is isolated.

### Step 3: Observe → act → observe

```bash
# navigate
playwriter -s 1 -e 'await page.goto("https://example.com")'

# observe current page state
playwriter -s 1 -e 'console.log(await snapshot({ page }))'

# act using a fresh aria-ref from the snapshot
playwriter -s 1 -e 'await page.locator("aria-ref=e5").click()'

# observe again after the action
playwriter -s 1 -e 'console.log(await snapshot({ page }))'
```

Rules:
- Never keep using old `aria-ref` values after navigation or major DOM changes.
- Prefer `snapshot({ page })` over screenshots when text structure is enough.
- Use screenshots or recordings only when visual evidence matters.

## High-value command patterns

### Navigation and state

```bash
playwriter browser start
playwriter session new
playwriter session list
playwriter session reset 1
playwriter session delete 1
```

### Execute Playwright code in a session

```bash
# basic navigation
playwriter -s 1 -e 'await page.goto("https://github.com")'

# fill + submit
playwriter -s 1 -e 'await page.fill("#search", "playwriter"); await page.keyboard.press("Enter")'

# save reusable state between calls
playwriter -s 1 -e 'state.lastUrl = page.url(); state.heading = await page.textContent("h1")'
playwriter -s 1 -e 'console.log(state.lastUrl, state.heading)'
```

### Multiline code safely

```bash
playwriter -s 1 -e "$(cat <<'EOF'
const title = await page.title();
state.title = title;
console.log(await snapshot({ page }));
EOF
)"
```

Use heredocs when the JavaScript would become fragile with quoting.

## MCP integration

Use Playwriter when a model client needs browser tooling **for the running browser**, not when it simply needs any browser tool.

### Example MCP config

```json
{
  "mcpServers": {
    "playwriter": {
      "command": "npx",
      "args": ["-y", "playwriter@latest"]
    }
  }
}
```

Common uses:
- Claude / Codex / Gemini can call into Playwriter through MCP.
- MCP gives the agent a transport layer; Playwriter still owns the browser/session behavior.
- Session reuse, browser visibility, and tab consent remain Playwriter concerns, not MCP concerns.

## Safety and expectations

- `playwriter` is **privileged mode** because it can touch the user’s real browser session.
- Prefer it only when session reuse is genuinely required.
- Expect lower reproducibility than a clean isolated browser because tabs, extensions, and humans can mutate state.
- Manual login / MFA / CAPTCHA handoff is normal in this lane; don’t pretend full autonomy is guaranteed.
- Detach or reset cleanly; do not assume it is safe to kill the user’s browser.

## Troubleshooting

| Issue | What to check |
|---|---|
| Nothing responds | Confirm the extension is installed and enabled on the target tab |
| Wrong tab/page state | Re-run `snapshot({ page })` and confirm you are on the expected tab before clicking |
| Stale / broken session | `playwriter session reset <id>` |
| Quoting breaks JavaScript | Use a heredoc for `-e` input |
| Need repeatable isolated automation | Route to `browser-harness` instead |
| Browser state is too messy / human interference | Start a fresh session or use a fresh-session browser tool |

## Examples

### Example 1: Logged-in SaaS workflow
- Prompt: "Use my already logged-in Chrome to update a Jira ticket without re-authenticating."
- Expected skill behavior: choose `playwriter`, mention running-browser reuse, create a session, observe first, then act.

### Example 2: Clean browser verification
- Prompt: "Run a repeatable headless checkout test in CI and compare screenshots."
- Expected skill behavior: route away from `playwriter` to `browser-harness` or another fresh-session tool because isolation matters more than session reuse.

### Example 3: MCP browser bridge
- Prompt: "Connect Codex or Claude to the browser I already have open so it can use my current tabs and cookies."
- Expected skill behavior: choose `playwriter`, explain MCP config, and make the running-browser assumption explicit.

## Best practices

1. Choose `playwriter` because the browser state matters, not because the word “browser” appears.
2. Start with `snapshot({ page })` before any action that could hit the wrong tab or stale UI state.
3. Re-snapshot after each meaningful action; live browser state drifts faster than isolated automation state.
4. Use heredocs for non-trivial JavaScript to avoid shell-quoting bugs.
5. Treat manual login / MFA / CAPTCHA handoff as normal in this lane.
6. Report why a running browser was necessary and when a fresh-session tool would have been safer.

## References

Deep-dive docs in this skill:
- [modes-and-routing](./references/modes-and-routing.md)
- [session-workflow](./references/session-workflow.md)
- [mcp-integration](./references/mcp-integration.md)

Primary sources:
- https://raw.githubusercontent.com/remorses/playwriter/main/README.md
- https://playwright.dev/docs/auth
- https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp
- https://modelcontextprotocol.io/introduction

## Output expectations

When using this skill, report:
- why `playwriter` was chosen instead of a fresh-session browser tool
- session/runtime assumptions
- key actions taken
- evidence captured (`snapshot`, screenshot, recording, logs)
- any manual handoff or auth-related limitation encountered
