# Moli command reference

Run `moli --help`, `moli fetch --help`, or `moli serve --help` for the
authoritative, version-specific flag list. This is a curated summary.

## Contents

- [`moli fetch` — output selection](#moli-fetch--output-selection)
- [`moli fetch` — readiness](#moli-fetch--readiness)
- [`moli fetch` — dynamic content and frames](#moli-fetch--dynamic-content-and-frames)
- [`moli fetch` — screenshots and PDFs](#moli-fetch--screenshots-and-pdfs)
- [`moli fetch` — request state and policy](#moli-fetch--request-state-and-policy)
- [Multi-page retrieval](#multi-page-retrieval)
- [Failure diagnosis](#failure-diagnosis)
- [`moli serve` — CDP/WebDriver server](#moli-serve--cdpwebdriver-server)
- [Cost-control flags (shared)](#cost-control-flags-shared)

## `moli fetch` — output selection

| Need | Command shape | Notes |
| --- | --- | --- |
| Read page content | `--dump markdown` | Default for research and summarization |
| Inspect semantic structure | `--dump semantic_tree_text` | Compact roles, labels, text, backend node IDs |
| Process semantic structure | `--dump semantic_tree` | Structured accessibility-oriented payload |
| Process stable fields | `--dump json` | Returns `final_url`, `status`, `html` |
| Inspect exact DOM | `--dump html` | Useful when Markdown loses structure |
| Diagnose requests | `--dump json --trace-network` | Adds the `network` object |
| Capture the viewport | `--layout --dump screenshot` | Writes PNG bytes to stdout |
| Capture a paginated document | `--layout --dump pdf` | Writes PDF bytes to stdout |
| Run repository WPT workflows | `--dump wpt` | Emits Moli's WPT-oriented report |

Raw non-HTML responses support only `html` and `json`.

## `moli fetch` — readiness

Start with `--wait-until done`; change only when the page exposes a better
completion signal:

- `--wait-until domcontentloaded` / `load` — stop at that lifecycle event
- `--wait-until networkidle` — wait for network activity to quiet; avoid on
  long-polling/streaming pages
- `--wait-until domstable` — wait for DOM mutations to settle; avoid on
  pages with continuous timers/counters/animations
- `--wait-selector '<css>'` — wait for a stable content element (preferred
  for client-rendered lists/articles/results)
- `--wait-script '<expr>'` / `--wait-script-file <path>` — wait for a JS
  expression to become truthy (mutually exclusive)
- `--wait-response-url <substring>` / `--wait-response-body <substring>` /
  `--wait-response-json <path=value>` — wait for a matching application
  response; all supplied criteria must match one response
- `--delay-ms <ms>` — only when the site has no observable readiness signal
- `--timeout <ms>` — bounds navigation and explicit waits (default 30000)

```bash
moli fetch --dump semantic_tree_text \
  --wait-selector "[data-testid='results']" \
  "https://example.com/search?q=moli"

moli fetch --dump json --trace-network \
  --wait-response-url "/api/search" \
  --wait-response-json "data.ready=true" \
  "https://example.com/search"
```

## `moli fetch` — dynamic content and frames

JavaScript runs by default. `--noscript` strips JavaScript from serialized
output — it does not skip JavaScript during navigation.

If expected text is absent:

1. Confirm HTTP status/final URL with `--dump json`.
2. Wait for the specific content selector or application response.
3. Try `--dump semantic_tree_text` to separate content from noisy markup.
4. Add `--with-frames` if the content is inside an iframe.
5. Enable only the optional resource family the page actually needs.

Other flags: `--with-base` (base metadata in serialized HTML),
`--disable-subframes` (block frame loads), `--strip-mode js|ui|css|full`
(omit parts of the output — only when the task wants that).

## `moli fetch` — screenshots and PDFs

```bash
moli fetch --layout --dump screenshot "https://example.com" > page.png
moli fetch --layout --dump pdf "https://example.com" > page.pdf
```

Use `--image --font` when appearance depends on external images/fonts. Use
`--resource` only when every optional resource family is needed. Keep
stderr separate from the output file; validate file signature and size
before trusting it.

## `moli fetch` — request state and policy

- `-H 'Name: Value'` (repeatable) — initial navigation headers only, not
  every subresource
- `--cookie-file <path>` (repeatable) — import cookies
- `--profile-dir <path>` — persist state across invocations; also the
  default HTTP cache location unless `--http-cache-dir` is set
- `--http-proxy`, `--http-no-proxy`, `--http-host-resolve HOST:PORT:ADDR`
- `--user-agent` or `--user-agent-suffix` (not both)
- `--document-start-script` / `--document-start-script-file` — pre-navigation
  instrumentation, only when the task explicitly requires it
- `--block-private-networks` + `--block-cidrs` — explicit network
  boundaries for untrusted URL workloads
- `--insecure-disable-tls-host-verification` — only after the user
  explicitly accepts that risk

## Multi-page retrieval

`moli fetch` retrieves one top-level URL per invocation; manage the queue
outside Moli:

1. Start from user-provided seed URLs.
2. Stay on the same origin unless the task requires external sources.
3. Ignore fragments, duplicate URLs, non-HTTP schemes, logout links,
   irrelevant downloads.
4. Use a small declared limit when the user gives none (start at 10 pages,
   depth 2).
5. Fetch sequentially by default; add `--obey-robots` for crawl workloads.
6. Stop once the evidence answers the question — do not mirror the site.

## Failure diagnosis

| Symptom | First move |
| --- | --- |
| Empty or shell-only output | Add a content-selector wait; try `semantic_tree_text`; check `--with-frames` |
| Timeout | Replace a broad wait with the narrowest observable signal before raising `--timeout` |
| 401/403/login page | Report the access boundary; use only authorized cookies/profile state |
| Unexpected redirect | Inspect `final_url`/`status` via `--dump json` |
| Missing API data | Add response waits; use `--trace-network` (JSON only) for request diagnostics |
| TLS failure | Fix trust/hostname config; only bypass with explicit user consent |
| Private-network target | Keep `--block-private-networks` on unless the task is clearly authorized |

## `moli serve` — CDP/WebDriver server

```bash
moli serve
moli serve --layout
moli serve --layout --resource
moli serve --host 127.0.0.1 --port 9333 --layout
```

Defaults: host `127.0.0.1`, port `9222`, server timeout 10s, 16 active CDP
connections, 128 pending. Tune with `--cdp-max-connections` /
`--cdp-max-pending-connections`.

| Surface | Endpoint |
| --- | --- |
| CDP discovery | `http://127.0.0.1:9222/json/version` |
| CDP targets | `http://127.0.0.1:9222/json/list` |
| CDP protocol | `http://127.0.0.1:9222/json/protocol` |

Prefer discovery over hard-coding a `/devtools/...` path. Use Playwright's
`connectOverCDP`/`connect_over_cdp` or Puppeteer's `connect` against the
returned browser WebSocket URL; reach for raw CDP only when a client
library cannot express the required command/event.

Troubleshooting: confirm the process is running → probe `/json/version`
with the exact host/port → make sure the client attaches instead of
launching a bundled browser → remove Chrome-only launch flags/
`executablePath` → enable `--layout` for geometry/visual failures → check
`serve --help` on the installed version → treat an explicit unsupported
protocol error as a capability boundary, not something to mask.

## Cost-control flags (shared)

| Mode or option | Behavior |
| --- | --- |
| Default | `LayoutPolicy::Mock` — deterministic geometry, no real layout/paint |
| `--layout` | `LayoutPolicy::OnDemand` — real layout, geometry, hit-testing, coordinate input, screenshots, screencast |
| `--resource` | Fetch all optional visual/media resource families |
| `--image`, `--font`, `--audio`, `--video`, `--media`, `--text-track` | Enable one specific optional resource family |
| `--profile-dir`, `--http-cache-dir`, `--cookie-file` | Selectively enable persistence for the workload |

Layout is an on-demand snapshot, not continuously maintained state: the
first geometry request builds one complete layout and retains only the
latest pass output; screenshots/screencasts always rebuild fresh and
discard results after use.
