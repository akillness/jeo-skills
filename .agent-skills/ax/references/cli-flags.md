# ax CLI Flags Reference

Complete flag reference for the ax command-line tool. Use `ax --help` or `ax agent-context` for quick lookup.

## Global Flags

### `-h, --help`

Display help text and flag summary.

```bash
ax --help
```

### `--version`

Show ax version.

```bash
ax --version
# Output: ax 1.1.2
```

### `--debug`

Enable verbose logging to stderr. Shows cache hits/misses, parsing steps, and timing.

```bash
ax https://example.com --debug
# stderr: [AX] Fetch (200 OK, 142ms)
# stderr: [AX] Parse: linkedom DOM ready
# stderr: [AX] Cache WRITE: ~/.cache/ax/...
```

---

## Fetch Mode Flags

Use these to control HTTP requests and response handling.

### `-H, --header <key:value>`

Add custom HTTP header (repeatable).

```bash
ax https://api.example.com/private \
  -H 'Authorization: Bearer token123' \
  -H 'X-Custom: value'
```

### `-X, --method <METHOD>`

Override HTTP method (default: GET).

```bash
ax https://api.example.com/search -X POST
```

### `--no-check`

Skip SSL certificate verification (insecure, development only).

```bash
ax https://self-signed.example.com --no-check
```

### `--timeout <ms>`

Request timeout in milliseconds (default: 30000).

```bash
ax https://slow.example.com --timeout 60000
```

### `--body`

Output body only (classic `curl`-like behavior). Suppresses JSON wrapper; just returns body text or JSON.

```bash
# Full response
ax https://api.example.com/data
# { "status": 200, "ok": true, "body": [...] }

# Body only
ax https://api.example.com/data --body
# [...]
```

### `--fresh`

Bypass cache and fetch live (even if cached).

```bash
ax https://example.com --fresh
```

### `--no-cache`

Never touch disk cache; always fetch live.

```bash
ax https://example.com --no-cache
```

---

## Parse Mode Flags

Use these to discover page structure and extract data.

### `--outline`

Show repeating DOM structures without raw HTML (token-efficient discovery).

```bash
ax https://example.com --outline
# Output:
# html
#   head
#   body
#     header
#       nav
#         a (×5)
#     main
#       article (×10)
#         h2 (×1)
#         p.summary (×1)
#         a.link (×1)
#       aside
```

### `--locate <text>`

Find the CSS selector(s) holding the given text.

```bash
ax https://docs.example.com --locate 'Getting Started'
# Output:
# Selectors for "Getting Started":
#  - h2.section-title
#  - nav a.current
```

### `--md`

Render page as markdown (preserves headers, links, structure).

```bash
ax https://docs.example.com --md
# Output: # Introduction
# This is an intro paragraph.
# ## Getting Started
# 1. Install the tool
# 2. Run it
```

---

## Extraction Flags

Use these to extract structured data rows.

### `--row <field-defs>`

Define fields to extract using CSS selectors. Comma-separated list of `field=selector` pairs.

```bash
# Simple extraction
ax https://example.com '.item' --row 'name=h2, price=.cost'

# Extract attributes
ax https://example.com 'a.link' --row 'text=*, url=@href'

# All text content (default attribute)
ax https://example.com '.card' --row 'title=.title, content=.body'
```

**Selector syntax:**

- `.class` → element with class
- `#id` → element with ID
- `tag` or `*` → any element
- `@attr` → extract attribute value (e.g., `a@href`, `img@src`, `li@data-id`)
- Default attribute is `.textContent` (full text)

### `--table`

Auto-detect and extract `<table>` elements as rows (keyed by headers).

```bash
ax https://data.example.com --table
# Converts <table> to rows with headers as keys

# Output (TSV by default):
# col1    col2    col3
# val1    val2    val3
# ...
```

With `--json`, outputs array of objects:

```bash
ax https://data.example.com --table --json
# [
#   { "col1": "val1", "col2": "val2", "col3": "val3" },
#   ...
# ]
```

### `--where <expression>`

Filter rows using a safe expression language (no code execution).

```bash
# Numeric comparison
ax https://shop.example.com '.item' \
  --row 'name=h2, price=.cost' \
  --where 'price > 50'

# String matching
ax https://shop.example.com '.item' \
  --row 'name=h2, category=.tag' \
  --where 'category == "electronics"'

# Compound logic
ax https://example.com '.item' \
  --row 'name=h2, price=.cost, rating=.stars' \
  --where 'price > 20 && rating >= 4'
```

**Expression operators:**

- `==`, `!=`, `>`, `<`, `>=`, `<=` → comparison
- `&&`, `||` → logical AND / OR
- `!` → negation
- String literals: `"text"` or `'text'`
- Numeric literals: `123`, `45.67`
- Field references: bare field name (e.g., `price`, `name`)

### `--limit <n>`

Cap result rows (default: 50).

```bash
ax https://catalog.example.com '.item' --limit 100
```

### `--json`

Output as JSON (array of objects) instead of TSV.

```bash
ax https://example.com '.item' --row 'name=h2, price=.cost' --json
# [
#   { "name": "Widget", "price": "19.99" },
#   { "name": "Gadget", "price": "29.99" }
# ]
```

### `--csv`

Output as CSV (Comma-Separated Values).

```bash
ax https://example.com '.item' --row 'name=h2, price=.cost' --csv
# name,price
# Widget,19.99
# Gadget,29.99
```

### `--tsv`

Output as TSV (Tab-Separated Values, default for `--row`).

```bash
ax https://example.com '.item' --row 'name=h2, price=.cost' --tsv
# name	price
# Widget	19.99
# Gadget	29.99
```

---

## Output & Context Flags

### `--budget <tokens>`

Cap output to approximately N tokens (for LLM context).

```bash
ax https://catalog.example.com '.item' \
  --row 'name=h2, price=.cost' \
  --budget 500

# stderr: "Truncated to 40 of 200 rows (token budget: 500)"
```

Rows are truncated proportionally if total output exceeds budget. Always includes truncation note on stderr.

### `--format <format>`

Override output format (json, tsv, csv, md, text).

```bash
ax https://example.com --md --format json
# Renders to JSON with markdown as string
```

### `--indent <n>`

Indent JSON output (default: 0, no indentation).

```bash
ax https://api.example.com --json --indent 2
```

### `--raw`

Output raw response body without parsing (useful for debugging).

```bash
ax https://example.com --raw
```

---

## Caching & Performance Flags

### `--cache-dir <path>`

Override cache directory (default: `~/.cache/ax`).

```bash
ax https://example.com --cache-dir /mnt/scraper-cache
```

### `--cache-ttl <seconds>`

Cache time-to-live (default: 120 seconds).

```bash
ax https://example.com --cache-ttl 3600  # Cache for 1 hour
```

### `--delay <ms>`

Delay before making request (useful in loops to respect rate limits).

```bash
for url in $(cat urls.txt); do
  ax "$url" --delay 500  # 500ms between requests
done
```

---

## Agent-Specific Flags

### `agent-context`

Display optimized playbook for LLM agents (also available at https://ax.yusuke.run/llms.txt).

```bash
ax agent-context
# Shows:
# - Recommended flag combinations
# - Token-efficient patterns
# - Common error recovery
# - Integration with other tools
```

### `--agent-mode`

Enable agent-friendly defaults:
- No cache by default (always live)
- Truncation warnings on stderr
- JSON output by default
- Structured error messages

```bash
ax https://example.com --agent-mode --row 'title=h2'
```

---

## Common Flag Combinations

### Discovery (Zero Code)

```bash
# 1. Page structure
ax https://example.com --outline

# 2. Find specific section
ax https://example.com --locate 'Section Title'

# 3. Markdown view
ax https://example.com --md --budget 500
```

### Batch Extraction

```bash
# JSON for downstream processing
ax https://example.com '.item' \
  --row 'name=h2, url=a@href, price=.cost' \
  --where 'price > 50' \
  --json > data.json
```

### Filtered Export

```bash
# TSV (spreadsheet-friendly)
ax https://example.com '.product' \
  --row 'sku=@data-sku, name=h2, price=.price, stock=.qty' \
  --where 'stock > 0' \
  --csv > products.csv
```

### Live Monitoring

```bash
# Always fresh, never cached
ax https://api.status.example.com --no-cache --body
```

### Markdown Documentation

```bash
# Extract docs as readable markdown
ax https://guide.example.com/intro \
  --md \
  --budget 2000 \
  --fresh > guide.md
```

---

## Environment Variable Overrides

Command-line flags override environment variables:

```bash
# Environment sets default
export AX_TIMEOUT=60000

# Flag overrides
ax https://example.com --timeout 120000
```

---

## Help & Debugging

### Full help

```bash
ax --help
# Shows all flags with brief descriptions
```

### Agent playbook

```bash
ax agent-context
# Shows LLM-optimized patterns and examples
```

### Verbose debugging

```bash
ax https://example.com --debug
# stderr logs: fetch, parse, cache, timing, errors
```

### Check version

```bash
ax --version
```

---

## Error Codes

ax returns these exit codes:

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | General error (fetch failed, selector found nothing, etc.) |
| 2 | Invalid flag or usage |
| 3 | Timeout |
| 4 | SSL verification failed |
| 5 | Empty response |

Check exit code in scripts:

```bash
ax https://example.com
if [ $? -eq 0 ]; then
  echo "Success"
else
  echo "Failed with code $?"
fi
```

---

For examples and patterns, see [agent-patterns.md](./agent-patterns.md) or run `ax agent-context`.
