---
name: browser-harness
description: >
  Self-healing browser automation framework that connects LLMs directly to Chrome via CDP.
  Use when the user needs an AI agent to autonomously complete web browser tasks, write adaptive
  helper code during execution, contribute domain skills (site-specific playbooks), or integrate
  with Browser Use Cloud. Triggers on:
  browser-harness, self-healing browser, llm browser automation, cdp agent, chrome devtools agent,
  agent browser task, browser-use harness, browser automation agent, domain skills browser.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: Requires Python 3.10+, Chrome with remote debugging enabled. Setup via Claude Code prompt. Optional Browser Use Cloud tier (free: 3 concurrent browsers, proxies, captcha solving).
license: MIT
metadata:
  tags: browser-harness, browser-automation, self-healing, cdp, chrome-devtools-protocol, llm-browser, agent-browser, domain-skills, claude-code
  version: "1.0.1"
  source: https://github.com/browser-use/browser-harness
  platforms: Claude, Codex, OpenCode
---

# browser-harness — self-healing LLM browser automation

> **Keyword**: `browser-harness` · `self-healing browser` · `llm browser automation` · `cdp agent`
>
> Direct WebSocket connection between your LLM agent and Chrome via Chrome DevTools Protocol — no intermediary layers, no fragile selectors. The agent writes and improves its own helper code on every run.

Browser Harness is most useful when you choose the **smallest automation mode that fits the job**:
- start with existing domain skills before writing new helper code
- let the agent discover and document selectors before hardcoding them
- use Browser Use Cloud only when local Chrome or proxies are insufficient
- prefer `agent_helpers.py` edits over rewriting core package code

## When to use this skill

- The user needs an LLM agent to autonomously complete multi-step browser tasks (login, form fill, scrape, navigate)
- The user wants self-healing automation where the agent writes missing helper functions during execution
- The user wants to contribute or consume community domain skills (site-specific playbooks in `agent-workspace/domain-skills/`)
- The user needs direct CDP access to Chrome without Playwright/Selenium overhead
- The user wants to integrate with Browser Use Cloud for concurrent browsers, proxies, or captcha solving
- The user wants to route complex browser workflows to an agent that can adapt when the DOM changes

## Do not use this skill when

- The task is simple HTML extraction without JS rendering → route to `scrapling`
- The task is browser-based UI verification or screenshot capture → route to `agent-browser`
- The task is web scraping with selector drift recovery → route to `scrapling`
- The task is UI annotation or rendered-UI feedback → route to `agentation`
- The task is Playwright/Puppeteer script authoring without agent autonomy → use those tools directly

## Instructions

### Step 1: Install browser-harness

Browser Harness is designed to be set up by an AI agent. Paste the following prompt into Claude Code:

```
Set up https://github.com/browser-use/browser-harness for me
```

The agent will:
1. Clone the repository and read `install.md`
2. Guide you to enable Chrome remote debugging at `chrome://inspect/#remote-debugging`
3. Grant WebSocket connection permissions when prompted
4. Verify the CDP connection is live

**Manual clone (if preferred):**
```bash
git clone https://github.com/browser-use/browser-harness.git
cd browser-harness
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
```

**Requirements:**
- Python 3.10+
- Chrome / Chromium with `--remote-debugging-port=9222`

### Step 2: Enable Chrome remote debugging

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug

# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 --user-data-dir=%TEMP%\chrome-debug
```

Verify: open `http://localhost:9222/json` — you should see a JSON list of open tabs.

### Step 3: Run browser tasks

Give your agent a natural-language browser task:

```
"Log into example.com with credentials X and download the monthly report"
"Navigate to GitHub, open the first open issue, and summarize it"
"Fill in the contact form at example.com with the following data: ..."
```

The agent will:
1. Connect to Chrome via CDP WebSocket
2. Look up existing helpers in `agent-workspace/agent_helpers.py`
3. Write new helper functions for missing actions
4. Execute the task and verify completion

### Step 4: Extend with domain skills

Domain skills are site-specific playbooks contributed by the community. They live in:

```
agent-workspace/domain-skills/
├── github.py          # GitHub-specific helpers
├── linkedin.py        # LinkedIn navigation patterns
└── your-site.py       # Add your own
```

**Add a domain skill:**
```python
# agent-workspace/domain-skills/mysite.py

def login(page, username: str, password: str):
    """Log into mysite.com."""
    page.goto("https://mysite.com/login")
    page.fill("#username", username)
    page.fill("#password", password)
    page.click("button[type=submit]")
    page.wait_for_url("**/dashboard")
```

The agent discovers and uses domain skills automatically — no registration needed.

### Step 5: Browser Use Cloud (optional)

For concurrent browsers, residential proxies, or captcha solving:

```python
from browser_harness import BrowserUseCloud

client = BrowserUseCloud(api_key="YOUR_API_KEY")
result = client.run("Log into example.com and extract the dashboard data")
print(result)
```

Free tier includes:
- 3 concurrent browsers
- Residential proxies
- Captcha solving

Sign up at [browser-use.com](https://browser-use.com).

### Step 6: Customize agent_helpers.py

The agent writes and edits `agent-workspace/agent_helpers.py` during execution. You can also edit it manually:

```python
# agent-workspace/agent_helpers.py

def click_accept_cookies(page):
    """Dismiss cookie banners on common sites."""
    selectors = [
        "#accept-cookies", ".cookie-accept", "[data-testid=accept-btn]"
    ]
    for sel in selectors:
        try:
            page.click(sel, timeout=2000)
            return True
        except:
            continue
    return False
```

**Core package** (`src/browser_harness/`) is protected — do not edit it directly. All customization goes through `agent_helpers.py` and `domain-skills/`.

## Examples

### Example 1: Autonomous login and data extraction
```
Prompt to agent: "Go to https://dashboard.example.com, log in with user@example.com / pass123,
navigate to Reports > Monthly, and download the CSV for April 2026"
```

### Example 2: Form automation
```
Prompt to agent: "Fill out the contact form at https://example.com/contact with:
Name: John Doe, Email: john@example.com, Message: 'Request for proposal'"
```

### Example 3: Add a domain skill via agent
```
Prompt to agent: "Create a domain skill for https://github.com that can:
1. Open a repository by name
2. Create a new issue with a title and body
3. Add a label to an existing issue
Save it to agent-workspace/domain-skills/github.py"
```

### Example 4: Browser Use Cloud
```python
from browser_harness import BrowserUseCloud
client = BrowserUseCloud(api_key="bu_...")
result = client.run("Search for 'browser automation python' on Google and return the top 5 links")
```

## Best practices

1. Let the agent write helper code — avoid manual `agent_helpers.py` edits that conflict with agent-generated code.
2. Enable Chrome remote debugging before starting any browser task; verify with `http://localhost:9222/json`.
3. Prefer existing domain skills over blank-slate prompts for well-known sites.
4. Use Browser Use Cloud for tasks that need proxies or captcha bypass — do not attempt to bypass anti-bot measures on sites that prohibit it.
5. Keep `agent_helpers.py` lean — split large helpers into domain-skill files once they become site-specific.
6. For stateless HTML-only scraping, route to `scrapling` instead — CDP overhead is unnecessary.
7. Verify task completion explicitly in your prompt ("confirm the form was submitted successfully") to trigger the agent's self-check.

## Local patches

The following fixes are applied to `src/browser_harness/helpers.py` in local installations to prevent image-handling errors with Claude's vision API:

- **Added `io` import** — required for `io.BytesIO` usage in screenshot pipeline.
- **`click_at_xy` debug overlay** — use `with Image.open(path) as src: img = src.copy()` to avoid holding a file lock on the PNG after opening.
- **`capture_screenshot`** — decode CDP data to `bytes` first, resize in-memory via `io.BytesIO` (never write then re-read the file), then write once with `with open(path, "wb")`. Prevents double-write and avoids unclosed file handle errors that trigger Claude tool errors.

Apply with:
```bash
cd ~/browser-harness && git apply <patch-file>
# or edit src/browser_harness/helpers.py directly per the diff above
```

## References

- [browser-use/browser-harness GitHub](https://github.com/browser-use/browser-harness)
- [scrapling](../scrapling/SKILL.md) — for stateless HTML/JS scraping without agent autonomy
- [agent-browser](../agent-browser/SKILL.md) — for clean disposable browser verification sessions
- [agentation](../agentation/SKILL.md) — for rendered-UI feedback and UI annotation
