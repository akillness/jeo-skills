# Fetchers and Sessions

Scrapling has three main fetching tiers. Treat them as an escalation ladder, not interchangeable defaults.

## 1. `Fetcher`

Use `Fetcher` or `FetcherSession` when plain HTTP is enough.

- Engine: `curl_cffi`
- Strengths: speed, low memory, browser fingerprint impersonation, stealthy headers, HTTP/3 support
- Best for: blogs, docs, APIs, mostly static HTML, lightweight paginated sites

Example:

```python
from scrapling.fetchers import FetcherSession

with FetcherSession(impersonate="chrome") as session:
    page = session.get("https://quotes.toscrape.com/", stealthy_headers=True)
    quotes = page.css(".quote .text::text").getall()
```

Useful knobs:

- `impersonate`
- `stealthy_headers`
- `proxy`
- `timeout`
- `selector_config`

## 2. `DynamicFetcher`

Use `DynamicFetcher` or `DynamicSession` when a browser is required but the target is not especially hostile.

- Engine: Playwright-backed Chromium or local Chrome
- Strengths: JavaScript rendering, waiting controls, `page_action`, real browser option
- Best for: SPAs, dashboards, lazy-loaded lists, small automation steps

Common options:

- `headless`
- `disable_resources`
- `network_idle`
- `wait`
- `wait_selector`
- `real_chrome`
- `page_action`
- `proxy`

`page_action` assumes some familiarity with Playwright's page API. Do not present it as a no-knowledge shortcut.

Example:

```python
from scrapling.fetchers import DynamicSession

with DynamicSession(headless=True, network_idle=True) as session:
    page = session.fetch("https://example.com/app")
    data = page.css(".row .name::text").getall()
```

## 3. `StealthyFetcher`

Use `StealthyFetcher` or `StealthySession` when anti-bot systems interfere with normal rendering.

- Engine: patchright-backed browser stack
- Strengths: harder fingerprint evasion, Cloudflare Turnstile or interstitial solving, browser hardening toggles
- Best for: protected commerce, travel, ticketing, and sites that return blocks or empty states to simpler fetchers

Common options beyond `DynamicFetcher`:

- `solve_cloudflare`
- `block_webrtc`
- `allow_webgl`
- `hide_canvas`
- `max_pages`

Treat anti-bot handling as a documented capability, not a guarantee.

Example:

```python
from scrapling.fetchers import StealthySession

with StealthySession(headless=True, solve_cloudflare=True) as session:
    page = session.fetch("https://nopecha.com/demo/cloudflare")
    links = page.css("#padded_content a::attr(href)").getall()
```

## Session guidance

Prefer session classes when:

- You need repeated requests with the same config
- You want connection, cookie, or browser reuse
- You want a rotating pool of browser tabs
- You are building a spider or multi-step workflow

Use one-off class methods only for short probes or tiny scripts.

## Quick decision rule

1. Start with `Fetcher`
2. If the page needs JavaScript, move to `DynamicFetcher`
3. If the rendered result is still blocked, move to `StealthyFetcher`

Do not jump straight to stealth unless there is evidence that simpler paths fail.
