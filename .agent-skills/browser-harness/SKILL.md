---
name: browser-harness
description: >
  Self-healing browser automation framework that connects LLM agents directly to Chrome via CDP.
  Use when the user needs autonomous browser tasks, clean browser verification, Codex or Antigravity
  browser control, Claude-safe screenshots, adaptive helper code in `agent_helpers.py`, domain skills,
  or Browser Use Cloud escalation. Triggers on:
  browser-harness, self-healing browser, llm browser automation, cdp agent, chrome devtools agent,
  codex browser automation, antigravity browser automation, claude screenshot error, claude image error,
  agent browser task, browser-use harness, domain skills browser.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: Requires Python 3.10+ and Chrome/Chromium with remote debugging enabled. Works from Claude Code, Codex CLI, Antigravity (`agy`), Gemini CLI, and OpenCode when the agent can edit/run the local Python workspace. Includes a Claude-safe screenshot patch for PIL file-handle and image-size issues.
license: MIT
metadata:
  tags: browser-harness, browser-automation, self-healing, cdp, chrome-devtools-protocol, llm-browser, codex, antigravity, claude-code, claude-vision-safe, screenshot, domain-skills
  version: "1.1.0"
  source: https://github.com/browser-use/browser-harness
  platforms: Claude Code, Codex, Antigravity, Gemini CLI, OpenCode
---

# browser-harness - self-healing LLM browser automation

> **Keyword**: `browser-harness` · `self-healing browser` · `llm browser automation` · `cdp agent`
>
> Direct WebSocket connection between an LLM agent and Chrome via Chrome DevTools Protocol. The agent can inspect the page, write helper code, reuse domain skills, and verify the task without an extra browser abstraction layer.

Browser Harness is the canonical replacement for the removed `agent-browser` skill in this catalog. Use it for clean browser verification, autonomous browser tasks, and platform-portable CDP control across Claude Code, Codex, Antigravity, Gemini CLI, and OpenCode.

## When to use this skill

- The user needs an LLM agent to complete a multi-step browser workflow: login, navigation, form fill, data extraction, download, or verification.
- The workflow needs a clean browser profile or repeatable CDP verification instead of the user's already-open browser state.
- The user is running from Codex CLI or Antigravity and needs a local browser harness the agent can operate with shell/Python commands.
- Claude reports image/screenshot/tool errors when browser screenshots are written, resized, or re-opened.
- The target DOM changes and the agent should add or repair helpers in `agent-workspace/agent_helpers.py`.
- The task benefits from site-specific domain skills in `agent-workspace/domain-skills/`.
- Browser Use Cloud is justified for concurrent browsers, proxies, or captcha solving on allowed targets.

## Do not use this skill when

- The task is simple HTML extraction without browser state or JS interaction -> route to `scrapling`.
- The task is exact human UI annotation or pointing at a rendered issue -> route to `agentation`.
- The task must reuse the user's already-open authenticated Chrome profile -> route to `playwriter`.
- The task is React component source capture -> route to `react-grab`.
- The task is ordinary Playwright/Puppeteer script authoring without agent autonomy -> use that stack directly.

## Instructions

### Step 1: Choose the execution packet

Pick one primary packet before writing commands:

- **local-cdp**: local Chrome/Chromium with `--remote-debugging-port=9222`.
- **codex-cdp**: Codex CLI controls the same local checkout and CDP endpoint.
- **antigravity-cdp**: Antigravity (`agy`) uses the same workspace and Chrome debugging endpoint.
- **claude-vision-safe**: screenshot capture must use the safe image pipeline below.
- **domain-skill**: add or repair a site-specific helper in `agent-workspace/domain-skills/`.
- **cloud-browser**: Browser Use Cloud is needed and allowed.

### Step 2: Install browser-harness

Browser Harness can be set up by an agent from any platform that can run shell commands:

```bash
git clone https://github.com/browser-use/browser-harness.git
cd browser-harness
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

Claude Code can also use the project-native setup prompt:

```text
Set up https://github.com/browser-use/browser-harness for me
```

Requirements:

- Python 3.10+
- Chrome or Chromium
- `http://localhost:9222/json` reachable from the agent runtime

### Step 3: Enable Chrome remote debugging

Use a separate profile so the harness can safely create clean sessions:

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug

# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug

# Windows PowerShell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 --user-data-dir="$env:TEMP\chrome-debug"
```

Verify:

```bash
curl -s http://localhost:9222/json
```

### Step 4: Platform-specific notes

| Platform | Use browser-harness when | Setup note |
|----------|--------------------------|------------|
| Claude Code | You need autonomous browser work or Claude-safe screenshots | Apply the screenshot patch before image-heavy work |
| Codex CLI | You need local CDP automation from a repo task | Keep `.venv` inside the checkout and run commands from that shell |
| Antigravity (`agy`) | You need the same browser harness from Antigravity workflows | Ensure `agy` can see the checkout and `localhost:9222` |
| Gemini CLI / OpenCode | You need portable browser automation without platform-specific MCP wiring | Use the same local CDP and Python workspace |

For Codex and Antigravity, do not assume Claude Code plugin commands exist. Prefer explicit local commands:

```bash
cd ~/browser-harness
source .venv/bin/activate
python -c "import browser_harness; print('browser-harness OK')"
curl -s http://localhost:9222/json
```

### Step 5: Apply the Claude-safe screenshot patch

If Claude throws image recognition, image upload, PNG read, or tool errors around screenshots, patch `src/browser_harness/helpers.py` so screenshots are decoded and resized in memory, and PIL file handles are closed before saving overlays.

Required changes:

```diff
diff --git a/src/browser_harness/helpers.py b/src/browser_harness/helpers.py
--- a/src/browser_harness/helpers.py
+++ b/src/browser_harness/helpers.py
@@
-import base64, importlib.util, json, math, os, sys, time, urllib.request
+import base64, importlib.util, io, json, math, os, sys, time, urllib.request
@@
-            img = Image.open(path)
+            with Image.open(path) as src:
+                img = src.copy()
@@
-    open(path, "wb").write(base64.b64decode(r["data"]))
+    data = base64.b64decode(r["data"])
     if max_dim:
         from PIL import Image
-        img = Image.open(path)
+        img = Image.open(io.BytesIO(data))
         if max(img.size) > max_dim:
             img.thumbnail((max_dim, max_dim))
-            img.save(path)
+            buf = io.BytesIO()
+            img.save(buf, format="PNG")
+            data = buf.getvalue()
+    with open(path, "wb") as f:
+        f.write(data)
```

Why this matters:

- `Image.open(path)` keeps a lazy file handle unless copied or closed.
- Claude image/tool pipelines are more likely to fail when a PNG is opened, rewritten, then reopened by the agent in quick succession.
- In-memory resize via `io.BytesIO` avoids the write-read-write cycle.
- Writing once with `with open(path, "wb")` produces a stable file for Claude vision upload.

Recommended screenshot call for Claude:

```python
path = capture_screenshot(max_dim=1800)
```

Use `max_dim=1800` on high-DPI displays to stay under common 2000px-per-side image limits.

### Step 6: Run browser tasks

Give the agent a natural-language task:

```text
Open the local app, complete the signup form, and verify that the dashboard appears.
Navigate to GitHub, open the first open issue, and summarize the acceptance criteria.
Fill in the contact form at example.com and confirm the success message.
```

The agent should:

1. Connect to Chrome via CDP.
2. Inspect tabs and page state.
3. Reuse existing helpers in `agent-workspace/agent_helpers.py`.
4. Add missing helpers in `agent-workspace/agent_helpers.py` or `agent-workspace/domain-skills/`.
5. Verify completion with text, URL, DOM state, screenshot, or downloaded artifact evidence.

### Step 7: Extend with domain skills

Domain skills are site-specific playbooks. Keep them small and reusable:

```text
agent-workspace/domain-skills/
├── github.py
├── linkedin.py
└── your-site.py
```

Example:

```python
def login(page, username: str, password: str):
    """Log into mysite.com."""
    page.goto("https://mysite.com/login")
    page.fill("#username", username)
    page.fill("#password", password)
    page.click("button[type=submit]")
    page.wait_for_url("**/dashboard")
```

### Step 8: Browser Use Cloud escalation

Use Browser Use Cloud only when local Chrome is insufficient and the target permits automation:

```python
from browser_harness import BrowserUseCloud

client = BrowserUseCloud(api_key="YOUR_API_KEY")
result = client.run("Extract the dashboard data and return a CSV summary")
print(result)
```

## Best practices

1. Start with `local-cdp`; escalate only when the local CDP endpoint cannot satisfy the job.
2. Keep core package edits minimal. Put ordinary workflow logic in `agent_helpers.py` or domain skills.
3. Apply the Claude-safe screenshot patch before image-heavy Claude Code runs.
4. For Codex and Antigravity, prefer explicit shell/Python commands over Claude-only plugin instructions.
5. Treat every browser task as incomplete until the agent records final evidence.
6. Use `scrapling` for stateless scraping and `playwriter` for already-open authenticated browser reuse.
7. Do not bypass site terms, robots, rate limits, or authorization boundaries.

## Quick verification

```bash
cd ~/browser-harness
source .venv/bin/activate
python -c "import browser_harness; print('browser-harness OK')"
curl -s http://localhost:9222/json
```

## References

- [browser-use/browser-harness GitHub](https://github.com/browser-use/browser-harness)
- [scrapling](../scrapling/SKILL.md) — stateless HTML/JS scraping without agent-owned browser state
- [playwriter](../playwriter/SKILL.md) — running-browser reuse when existing login/session state matters
- [agentation](../agentation/SKILL.md) — rendered-UI feedback and human annotation packets
