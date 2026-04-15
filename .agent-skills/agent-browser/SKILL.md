---
name: agent-browser
description: "Run fresh-session browser automation and deterministic website verification for AI agents. Use when the job needs a clean disposable browser, stable snapshot refs, and explicit before/after evidence across forms, page state, screenshots, and accessibility-tree checks. Not for reusing the user's already-open browser (`playwriter`), exact rendered-UI feedback packets (`agentation`), or plan/diff approval (`plannotator`)."
allowed-tools: Read Write Bash Grep Glob
metadata:
  tags: browser-automation, verification, headless-browser, ai-agent, web-testing, snapshot-refs, fresh-session
  platforms: Claude, Gemini, Codex, ChatGPT
  version: 1.2.0
  source: vercel-labs/agent-browser
---

# agent-browser

`agent-browser` is the **fresh-session deterministic browser verification** skill in this repo.

Use it when the real need is: open a clean disposable browser, inspect the current page state, perform one concrete action, and prove what changed with explicit evidence. The key behaviors are isolation, stable refs from snapshots, and an observe → act → observe verification loop.

## When to use this skill

Use `agent-browser` when the task needs one or more of these:

- a clean reproducible browser session instead of the user's real browser profile
- deterministic form checks, navigation checks, and page-state verification
- structured snapshot refs (`@e1`, `@e2`, …) before interacting with the page
- explicit before/after evidence such as snapshot diffs, screenshots, or extracted text
- CI-style or automation-friendly browser checks where reproducibility matters more than session continuity
- isolated parallel browser tasks with named sessions

Do **not** use `agent-browser` by default for:

- reusing the browser the user already has open, with live cookies, extensions, or trusted-device state → `playwriter`
- exact rendered-UI review packets or annotation handoff from a human reviewer → `agentation`
- plan review, diff approval, or artifact sign-off workflows → `plannotator`
- vague broad web-task autonomy when the real need is a stateful authenticated browser lane

## Quick routing rule

| If the job needs... | Use |
|---|---|
| A clean disposable browser and repeatable verification | `agent-browser` |
| Existing logins, cookies, extensions, or a browser already open | `playwriter` |
| Exact rendered-UI feedback with selectors / annotation packets | `agentation` |
| Plan or diff review in a browser | `plannotator` |

## Instructions

### Step 1: Confirm the browser lane

Choose `agent-browser` only when a **fresh session** is the correct default. If the task depends on the user's existing browser state, route out before doing setup work.

### Step 2: Follow the core loop

Always use the same loop:

1. **Open a clean browser session**
2. **Wait for a stable page state**
3. **Observe first** with `snapshot -i`
4. **Act once** using fresh refs
5. **Observe again** before the next action
6. **Verify with explicit evidence**

This is the repo's browser-verification contract. If you skip the observe steps, you lose the deterministic part of the workflow.

### Step 3: Start from the smallest useful command set

```bash
agent-browser open https://example.com/form
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser fill @e1 "user@example.com"
agent-browser click @e2
agent-browser snapshot -i
```

Rules:
- Never keep using old `@eN` refs after navigation or meaningful DOM change.
- Prefer `wait --load networkidle` or a targeted wait over fixed sleeps.
- Keep one browser action between observations when debugging or verifying.

### Step 4: Choose one verification mode

| Mode | Use when | Evidence |
|---|---|---|
| **Snapshot diff** | Semantic page structure or accessible content changed | `diff snapshot` |
| **Screenshot diff** | Rendered layout or visual state matters | `diff screenshot --baseline ...` |
| **Targeted extraction** | You need exact text, URL, or field value | `get text`, `get url`, or narrowed `snapshot` |
| **PDF / capture** | The deliverable is a captured artifact | `pdf`, `screenshot` |

Prefer the lightest mode that proves the change. Use screenshots when visual truth matters; do not use them as the only default.

### Step 5: Use named sessions for isolation

```bash
agent-browser --session signup-check open https://example.com/signup
agent-browser --session settings-check open https://example.com/settings
agent-browser session list
```

Use one named session per autonomous worker or test lane. Close sessions when finished.

### Step 6: Keep authentication bounded

A clean-session skill can still save or load auth state, but that should stay **explicit**:

```bash
agent-browser open https://app.example.com/login
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser fill @e1 "$USERNAME"
agent-browser fill @e2 "$PASSWORD"
agent-browser click @e3
agent-browser wait --url "**/dashboard"
agent-browser state save auth.json
```

Then later:

```bash
agent-browser state load auth.json
agent-browser open https://app.example.com/dashboard
agent-browser snapshot -i
```

Use this for bounded reproducible reuse. If the real workflow depends on a long-lived personal browser, passkeys, SSO handoff, extensions, or active human browsing, route to `playwriter` instead.

### Step 7: Use complex evaluation payloads safely

For multi-line JavaScript or extraction logic, prefer stdin so shell quoting does not destroy the payload:

```bash
agent-browser eval --stdin <<'EVALEOF'
JSON.stringify({
  title: document.title,
  links: document.links.length,
  buttons: document.querySelectorAll('button').length
})
EVALEOF
```

## High-value command patterns

### Clean browser check

```bash
agent-browser open https://example.com
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser get url
```

### Form submission with verification

```bash
agent-browser open https://example.com/form
agent-browser wait --load networkidle
agent-browser snapshot -i
agent-browser fill @e1 "hello@example.com"
agent-browser click @e2
agent-browser diff snapshot
```

### Visual regression slice

```bash
agent-browser open https://example.com/pricing
agent-browser wait --load networkidle
agent-browser screenshot baseline.png
agent-browser click @e5
agent-browser diff screenshot --baseline baseline.png
```

### Session cleanup

```bash
agent-browser --session signup-check close
agent-browser close
```

## Safety and reliability

- Fresh refs only: re-run `snapshot -i` after navigation or major DOM updates.
- Prefer deterministic waits over fixed sleeps.
- Keep authentication files out of version control.
- Use allowed-domain and action-policy guards in sensitive runs.
- Prefer one small verified step over a giant multi-action leap.
- Route out aggressively when the task is really about running-browser reuse or exact visual review.

## Troubleshooting

| Issue | What to check |
|---|---|
| Wrong element clicked | Refresh `snapshot -i` and use fresh refs |
| Dynamic content missing | Wait for `networkidle` or a targeted selector/url |
| Output too large | Narrow the snapshot or use targeted extraction |
| Auth is too stateful or MFA-heavy | Route to `playwriter` instead of forcing clean-session automation |
| Need exact rendered-page feedback | Use `agentation` after the browser step |
| Parallel tasks are colliding | Assign unique session names and close them cleanly |

## Examples

### Example 1: Repeatable checkout verification
- Prompt: "Run a clean browser check that fills the checkout form and proves the confirmation state appears."
- Expected behavior: choose `agent-browser`, use a fresh session, observe before/after, and verify with an explicit diff or extracted state.

### Example 2: Logged-in personal browser flow
- Prompt: "Use my existing signed-in browser tabs to change a billing setting."
- Expected behavior: route to `playwriter`, because session continuity is the real requirement.

### Example 3: Human leaves exact UI feedback
- Prompt: "I need to click the broken UI and send the exact selector/path to the agent."
- Expected behavior: route to `agentation`, because rendered-UI annotation is the real deliverable.

## Best practices

1. Choose `agent-browser` because a clean browser matters, not because the word "browser" appears.
2. Follow observe → act → observe every time the page meaningfully changes.
3. Prefer semantic evidence (snapshot diff, extracted state) before visual evidence when it proves the point.
4. Keep auth reuse explicit and bounded; do not slide into a stateful personal-browser workflow by accident.
5. Use named sessions for concurrency and close them when done.
6. Report what was verified, not just what was clicked.

## References

Deep-dive docs in this skill:
- [modes-and-routing](./references/modes-and-routing.md)
- [commands](./references/commands.md)
- [snapshot-refs](./references/snapshot-refs.md)
- [session-management](./references/session-management.md)
- [authentication](./references/authentication.md)

Primary sources:
- https://github.com/vercel-labs/agent-browser
- https://agent-browser.dev
- https://playwright.dev/docs/locators
- https://playwright.dev/docs/aria-snapshots

Ready templates:
- `./templates/form-automation.sh`
- `./templates/capture-workflow.sh`
