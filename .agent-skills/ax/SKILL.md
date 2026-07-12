# ax — The AI-Era Curl for Web Scraping & Extraction

**Version 1.0.0**  
Yusuke Bebé & Contributors  
AI-driven fetch, discover, extract framework

---

## Summary

**ax** is a command-line tool purpose-built for AI agents to fetch web pages, discover their structure, and extract structured data — replacing the classic `curl → parse → regex` loop with one deterministic, token-efficient command.

### When to Use ax

- You need an agent to fetch a page and extract structured data
- You want page discovery (`--outline`) without dumping raw HTML
- You're extracting multi-field rows with CSS selectors (`--row`, `--table`)
- You need token-shaped output (capped, with budget control)
- You're building a repeatable web-scraping agent task
- You're tired of `curl | grep | awk` pipeline in agent code

### When NOT to Use ax

- The target site requires client-side JavaScript rendering (use `Playwright` or `Puppeteer` instead)
- You need real-time browser automation or multi-step interactions
- The content is behind authentication not solvable with headers (use direct API instead)
- You need headless browser for visual testing

---

## Quick Start

### Install ax

```bash
# System-wide install (via shell script)
curl -fsSL https://ax.yusuke.run/install | sh

# Or via Homebrew (macOS/Linux)
brew install yusukebe/tap/ax

# Or via npm (if Node.js available)
npm install -g ax-cli
```

### Basic Usage

```bash
# Fetch and show full response
ax https://api.example.com/users

# Discover page structure
ax https://example.com --outline

# Extract rows with custom selectors
ax https://example.com '.item' --row 'title=a, href=a@href'

# Read docs as markdown
ax https://docs.example.com --md --budget 800

# Extract table to JSON
ax https://example.com 'table' --table --json
```

### Integrate into Agent Workflow

```bash
# Run with agent context (shows optimized flags for LLMs)
ax agent-context

# Use in agentic script
ITEMS=$(ax https://shop.example.com '.product' \
  --row 'name=h2, price=.price' \
  --where 'price < 100' \
  --json)
```

---

## Core Concepts

### 1. Fetch Mode — Live Data with Full Context

**Command:** `ax <url>`

Returns JSON-structured response: `{ status, ok, ms, headers, body }`. Never silent.

- Every request is **live** (no cache by default)
- Empty bodies still produce full report
- JSON responses are automatically parsed
- Use `--body` for classic `curl`-like stdout pipe
- 100ms+ latency typical; use `--no-check` to skip SSL verification (development only)

```bash
ax https://api.github.com/repos/yusukebe/ax
# Output:
# {
#   "status": 200,
#   "ok": true,
#   "ms": 142,
#   "headers": { "content-type": "application/json", ... },
#   "body": { "name": "ax", "stars": 450, ... }
# }
```

### 2. Parse Mode — Cached HTML Discovery

**Flags:** `--outline`, `--locate`, `--md`

When you fetch a URL, the HTML is cached locally (~2 minutes) for fast subsequent probes.

- `--outline`: Shows repeating DOM structures (no raw markup in output)
- `--locate 'text'`: Finds the CSS selector holding a given text
- `--md`: Renders HTML as readable markdown
- Each cache hit is announced on stderr
- `--fresh` forces refetch; `--no-cache` disables disk cache entirely

```bash
ax https://news.example.com --outline
# Output:
# main
#   article (×12)
#     h2.headline (×1)
#     p.summary (×1)
#     a.read-more (×1)
```

### 3. Extract Mode — Structured Data Rows

**Flags:** `--row`, `--table`, `--where`

Pulls multi-field rows in a single command; filters with safe expression language.

```bash
# Custom row format
ax https://shop.example.com '.item' \
  --row 'name=h2, price=.price, rating=.stars' \
  --where 'price > 50'

# Table extraction (auto-detects <table>)
ax https://data.example.com --table --json

# Output format: TSV by default (header once), --json for JSON array
```

- `--row 'field1=selector, field2=selector@attr'`: Define fields and CSS selectors
- `@attr`: Extract attribute (e.g., `a@href`); default is `.textContent`
- `--where 'expr'`: Filter rows; safe expression language (no code execution)
- `--json`: JSON output instead of TSV
- `--limit 50`: Cap result rows (default 50)

### 4. Token Budgeting — AI Context Optimization

**Flag:** `--budget <tokens>`

Results are shaped for LLM context windows:

- Output capped at ~50 rows by default (announced on stderr)
- `--budget 800` limits output to ~800 estimated tokens
- Results always include row count / truncation note
- TSV format is token-efficient; JSON is more flexible for structured parsing

```bash
ax https://catalog.example.com '.product' \
  --row 'name=h2, price=.price' \
  --budget 500
# If 200 rows match, shows first ~40 to fit token budget
# stderr: "Truncated to 40 of 200 rows (token budget: 500)"
```

---

## Usage Patterns for Agents

### Pattern 1: Page Discovery (Zero Code, All Questions)

Agent doesn't know the page structure → use `--outline` to let agent ask:

```bash
ax https://docs.example.com --outline
# Agent reads structure, asks targeted follow-up
# ax https://docs.example.com 'h2' --md --budget 300
```

### Pattern 2: Batch Row Extraction

Agent needs tabular data from a repeating structure:

```bash
ax https://items.example.com '.item' \
  --row 'title=h2, url=a@href, price=.price' \
  --json

# Output: JSON array of objects, agent iterates
# Use in script: `jq '.[] | select(.price < 50)' | ...`
```

### Pattern 3: Markdown Documentation Extraction

Agent needs human-readable docs:

```bash
ax https://guide.example.com/intro --md --budget 2000
# Returns markdown-formatted text, preserves headers, links, structure
```

### Pattern 4: Live API Monitoring

Agent checks JSON API endpoint repeatedly:

```bash
# No cache (live every time)
ax https://api.status.example.com/incident-count
```

### Pattern 5: Filter & Transform

Agent extracts rows, filters, and passes to downstream:

```bash
ax https://store.example.com '.sale-item' \
  --row 'name=h2, old_price=.old-price, discount=.discount' \
  --where 'discount > 30' \
  --json | jq '.[] | {name, savings: (.old_price * .discount / 100)}'
```

---

## Integration with Agent Skills

### With `deep-agents-core`

Use ax in custom agent tool:

```python
from deep_agents import tool

@tool("scrape_page")
async def scrape_page(url: str, selector: str = None, extract_mode: str = "outline"):
    """Fetch and parse web pages with ax."""
    cmd = f"ax {url}"
    if extract_mode == "outline":
        cmd += " --outline"
    elif extract_mode == "rows" and selector:
        cmd += f" '{selector}' --row 'content=*' --json"
    
    result = await run_shell(cmd)
    return result
```

### With `react-grab`

Use ax to extract HTML structure before targeting React elements:

```bash
# Get page outline to understand React component tree
ax https://app.example.com --outline

# Then use react-grab to capture specific component
react-grab --selector '.user-card'
```

### With `research` (parallel discovery)

Run ax on multiple URLs concurrently:

```bash
# Wrapper script: parallel-discover.sh
for url in $(cat urls.txt); do
  ax "$url" --outline --budget 300 &
done | wait
```

---

## Common Tasks

### Task: Extract all links from a page

```bash
ax https://example.com --row 'text=a, href=a@href' --json
```

### Task: Find a specific section

```bash
ax https://docs.example.com --locate 'Installation' --md
```

### Task: Monitor API endpoint

```bash
ax https://api.example.com/status | jq '.body | select(.status == "ok")'
```

### Task: Extract table and convert to CSV

```bash
ax https://data.example.com 'table.report' --table --json | \
  jq -r '.[] | [.col1, .col2, .col3] | @csv'
```

### Task: Agent-driven discovery flow

```bash
# Step 1: Outline (cheap, informs next step)
ax https://site.example.com --outline

# Step 2: Extract (targeted, uses agent's observations)
ax https://site.example.com '.observed-selector' --row 'field=selector' --json
```

---

## Best Practices

### 1. Always Start with `--outline`

Before writing selectors, use `--outline` to understand the page structure. It costs tokens but saves countless parse iterations.

```bash
# Right: Agent learns structure first
ax https://example.com --outline

# Then: Targeted extraction
ax https://example.com '.item' --row 'name=h2'

# Wrong: Guessing selectors and failing
ax https://example.com 'div.product-card' --row 'price=.cost'  # Oops, wrong selector
```

### 2. Use `--where` for Client-Side Filtering

Don't extract all rows and filter in agent code — filter at the source:

```bash
# Right: Server-side filter
ax https://shop.example.com '.item' \
  --row 'name=h2, price=.price' \
  --where 'price > 50 && price < 200'

# Wasteful: Extract all, filter in agent
ax https://shop.example.com '.item' --row 'name=h2, price=.price' --json
# Agent: "if row.price > 50 and row.price < 200: ..."
```

### 3. Respect Rate Limits & Robots.txt

- Check `robots.txt` before automating scrapes
- Use reasonable delays between requests (`--delay <ms>` if available)
- Identify your agent in User-Agent headers when possible
- Start with `--no-cache` sparingly; use cache hits to reduce load

### 4. Token Budget for Large Datasets

Always cap results when the dataset is unknown:

```bash
# Right: Safe upper bound
ax https://catalog.example.com '.item' --budget 500

# Risky: No limit, may blow context window
ax https://catalog.example.com '.item' --json
```

### 5. Handle Empty/Error Responses

ax never fails silently — always outputs response metadata:

```bash
ax https://down.example.com
# Output:
# {
#   "status": 503,
#   "ok": false,
#   "ms": 1200,
#   "headers": { "retry-after": "60" },
#   "body": ""
# }
```

Agent should check `ok` flag and `status` before parsing body.

---

## Performance & Benchmarks

### Cost Savings (Real Opus 4.8 Sessions)

| Task | Without ax | With ax | Savings |
| --- | --- | --- | --- |
| Two-page markup drift | $0.458 | $0.150 | −67% |
| 60-item catalog extraction | $0.296 (24s) | $0.104 (14s) | −65% |
| Live website with decoys | $0.248 | $0.191 | −23% |
| Markup drift (first use) | $0.664 | $0.282 | −58% |

See [bench/RESULTS.md](https://github.com/yusukebe/ax/blob/main/bench/RESULTS.md) in ax repo for full methodology.

### Why Faster & Cheaper?

1. **Token efficiency:** Structured output + budget capping = fewer tokens per request
2. **No raw HTML:** `--outline` costs far fewer tokens than dumping full markup
3. **Fewer retries:** Deterministic extraction means no "that didn't work, try again"
4. **Native CLI:** No agent writing & debugging shell scripts mid-task

---

## Troubleshooting

### Issue: "Empty body" or "selector found 0 matches"

**Cause:** Selector doesn't match the page structure, or content is client-rendered.

**Fix:**
1. Run `ax <url> --outline` to verify structure
2. Use `ax <url> --locate 'visible text'` to find the right selector
3. If empty after outline, content may be JS-rendered → try `Playwright` instead

### Issue: Rate limited or blocked

**Cause:** Too many requests or missing User-Agent.

**Fix:**
1. Enable cache: `ax <url>` (default is cached in fetch mode)
2. Use `--delay <ms>` between requests in scripts
3. Check `robots.txt` and respect crawl-delay
4. Add User-Agent header: `ax <url> -H 'User-Agent: MyAgent/1.0'`

### Issue: "Truncated to N of M rows"

**Cause:** Results exceeded token budget.

**Fix:**
1. Increase `--budget` if critical data is being cut
2. Or narrow `--where` filter to return fewer rows
3. Or split into multiple smaller queries

---

## Routing to Other Skills

| Need | Skill | Why |
| --- | --- | --- |
| Complex page interactions, multi-step flows | `deep-agents-core` with Playwright | Browser automation needed |
| React component inspection after extraction | `react-grab` | Combines ax discovery with element capture |
| Parallel scraping of many sites | `research` (multi-agent) | Orchestrate concurrent ax calls |
| Token budget optimization | `react-best-practices` | Structure output to fit LLM context |
| Accessibility validation of extracted markup | `accessible-markup` | Validate scraped content against WCAG |

---

## Comparison: ax vs Alternatives

| Feature | curl | htmlq | Firecrawl | ax |
| --- | --- | --- | --- | --- |
| Fetch URL | ✓ | ✗ | ✓ | ✓ |
| Discover structure (`--outline`) | ✗ | ✗ | △ | ✓ |
| Multi-field extraction | ✗ | △ (N runs) | ✓ | ✓ |
| Markdown extraction (`--md`) | ✗ | ✗ | ✓ | ✓ |
| Token-budget output | ✗ | ✗ | ✗ | ✓ |
| Zero code per task | ✗ | △ (pipe pain) | ✓ | ✓ |
| Cached parse (free probes) | ✗ | ✗ | ✗ | ✓ |
| Safe filtering (`--where`) | ✗ | ✗ | △ | ✓ |

---

## References

- **Official site:** https://ax.yusuke.run
- **GitHub:** https://github.com/yusukebe/ax
- **Agent context & flags:** `ax agent-context` (also https://ax.yusuke.run/llms.txt)
- **Benchmarks:** https://github.com/yusukebe/ax/blob/main/bench/RESULTS.md
- **Built with:** Bun (single-file binary) + linkedom (DOM parsing)

---

## Routing Brief (for agent responses)

Use this when invoking ax from an agent task:

> **ax** (fetch, discover, extract) → when an agent needs web data without headless browser. Use `ax <url> --outline` for free structure discovery, then `ax <url> 'selector' --row` for extraction. Token budget & safe filtering built-in. Route to `Playwright` if interaction needed; route to `research` skill for parallel multi-URL orchestration.

---

## License

ax is open-source (check repo for license). Available under multiple install paths (shell script, Homebrew, npm).

---

**Last updated:** July 2026 — reflects ax v1.1+ features
