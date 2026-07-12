# ax Patterns for AI Agents

Real-world patterns for integrating ax into agentic workflows. These patterns show how to leverage ax for common scraping, extraction, and data-gathering tasks.

---

## Pattern 1: Discovery-First Workflow

**Use case:** Agent encounters an unknown page and must decide how to extract data.

**Flow:**
1. Outline the page structure
2. Agent observes structure
3. Agent formulates targeted extraction query
4. Extract with precise selectors

**Example:**

```bash
# Step 1: Agent discovers structure
ax https://news.example.com --outline
# Agent reads output:
# html
#   body
#     main
#       .news-container (×1)
#         article.news-item (×15)
#           h2.headline
#           p.summary
#           a.read-more

# Step 2: Agent decides extraction strategy
ax https://news.example.com 'article.news-item' \
  --row 'headline=h2.headline, link=a.read-more@href' \
  --json > headlines.json

# Agent processes JSON
jq '.[] | select(.link | contains("/world"))' headlines.json
```

**Why it works:**
- `--outline` is cheap (cached after first fetch)
- Agent learns structure before committing to selectors
- Reduces parse errors and retries

---

## Pattern 2: Parallel Multi-URL Extraction

**Use case:** Agent needs data from multiple pages concurrently.

**Tool:** Use `xargs`, GNU Parallel, or background jobs.

**Example:**

```bash
#!/bin/bash
# Script: scrape-multiple.sh

urls=(
  "https://shop.example.com/products?page=1"
  "https://shop.example.com/products?page=2"
  "https://shop.example.com/products?page=3"
)

# Run in parallel
for url in "${urls[@]}"; do
  ax "$url" '.product' \
    --row 'name=h2, price=.cost, rating=.stars' \
    --json > "data_$(echo "$url" | md5sum | cut -c1-8).json" &
done

# Wait for all to complete
wait

# Merge results
jq -s 'add' data_*.json > all_products.json
```

**Alternative: xargs for parallelism**

```bash
cat urls.txt | xargs -P 4 -I {} \
  ax {} '.item' --row 'title=h2' --json > items.json
```

**Why it works:**
- Concurrent requests improve throughput
- `-P 4` limits parallelism (respect rate limits)
- Merge results afterward

---

## Pattern 3: Incremental Extraction with Filtering

**Use case:** Extract only rows matching agent-defined criteria.

**Flow:**
1. Fetch all candidate rows
2. Filter with `--where` (client-side, no extra requests)
3. Pass filtered results to downstream task

**Example:**

```bash
# Extract only items within budget
ax https://shop.example.com '.product' \
  --row 'name=h2, price=.price, rating=.stars, inStock=.stock' \
  --where 'price >= 20 && price <= 100 && inStock > 0 && rating >= 4' \
  --json | jq '.[] | {name, price, rating}'

# Output (to agent's next task)
# [
#   { "name": "Widget Pro", "price": "49.99", "rating": 4.5 },
#   { "name": "Gadget XL", "price": "79.99", "rating": 4.2 }
# ]
```

**Why it works:**
- `--where` filters at source, no wasted tokens
- Reduces downstream processing
- Deterministic filtering (not regex-based)

---

## Pattern 4: Document Extraction & Markdown Conversion

**Use case:** Agent needs to read documentation or long-form content.

**Example:**

```bash
# Fetch docs as markdown (human-readable, token-efficient)
ax https://docs.example.com/guides/installation --md --budget 1500 > install_guide.md

# Agent reads markdown
cat install_guide.md

# Agent can now follow instructions or extract specific sections
```

**Why it works:**
- `--md` preserves structure (headers, lists, links)
- Tokens are ~40% cheaper than raw HTML
- Agent can operate on familiar markdown format

---

## Pattern 5: Live Monitoring & Alerting

**Use case:** Agent periodically checks API endpoint or status page.

**Example:**

```bash
#!/bin/bash
# Script: monitor-status.sh

ENDPOINT="https://api.example.com/status"
ALERT_EMAIL="ops@example.com"

# Fetch live (no cache)
RESULT=$(ax "$ENDPOINT" --no-cache --body)

# Check status field
STATUS=$(echo "$RESULT" | jq -r '.status')

if [ "$STATUS" != "ok" ]; then
  echo "Alert: Service down at $(date)" | mail -s "Status Alert" "$ALERT_EMAIL"
  echo "$RESULT" | jq '.'
fi
```

**Variant: Recurring check (cron)**

```bash
# /etc/cron.d/ax-monitor
0 */5 * * * /home/agent/monitor-status.sh
```

**Why it works:**
- `--no-cache` ensures always-live data
- `--body` pipes JSON directly to `jq`
- Alerts only on state changes

---

## Pattern 6: Table Extraction & Transform

**Use case:** Extract HTML table, transform, and output as CSV.

**Example:**

```bash
# Extract table to JSON
ax https://data.example.com 'table.report' \
  --table \
  --json | 
  # Transform: uppercase headers, add computed column
  jq '.[] | 
    {
      Name: .name,
      Price: .price,
      Quantity: .quantity,
      Total: (.price * .quantity | round)
    }' |
  # Output as CSV
  jq -r '[.Name, .Price, .Quantity, .Total] | @csv' > report.csv
```

**Why it works:**
- `--table` auto-detects table structure
- `jq` transforms data
- Flexible multi-format pipeline

---

## Pattern 7: Fault Recovery & Retry

**Use case:** Agent retries failed extraction after timeout or markup change.

**Example:**

```bash
#!/bin/bash
# Script: robust-extract.sh

MAX_RETRIES=3
ATTEMPT=1

while [ $ATTEMPT -le $MAX_RETRIES ]; do
  echo "Attempt $ATTEMPT..."
  
  if ax "$1" '.item' --row 'name=h2, price=.cost' --json > data.json 2>/dev/null; then
    if [ -s data.json ] && [ "$(jq '. | length' data.json)" -gt 0 ]; then
      echo "Success: $(jq '. | length' data.json) items extracted"
      exit 0
    fi
  fi
  
  ATTEMPT=$((ATTEMPT + 1))
  [ $ATTEMPT -le $MAX_RETRIES ] && sleep $((ATTEMPT * 5))
done

echo "Failed after $MAX_RETRIES attempts"
exit 1
```

**Why it works:**
- Retry with exponential backoff
- Validates output (not empty, has rows)
- Handles transient failures

---

## Pattern 8: Dynamic Selector Finding

**Use case:** Agent doesn't know the right selector; use `--locate` to find it.

**Example:**

```bash
# Agent wants to find "Add to Cart" button
ax https://shop.example.com --locate "Add to Cart"
# Output:
# Selectors for "Add to Cart":
#  - a.product-add
#  - button[data-action="add"]

# Agent uses first result
ax https://shop.example.com '.product' \
  --row 'name=h2, addLink=a.product-add@href' \
  --json
```

**Variant: Find container**

```bash
# Find which section contains "Reviews"
ax https://product.example.com --locate "Reviews"
# Agent can then extract within that section
ax https://product.example.com '.reviews' \
  --row 'author=.reviewer, rating=.stars, text=.comment' \
  --json
```

**Why it works:**
- No hardcoded selectors
- Handles markup drift automatically
- Locates both exact text and containers

---

## Pattern 9: Cost-Optimized Streaming

**Use case:** Extract large datasets token-efficiently for LLM processing.

**Example:**

```bash
# Fetch with strict token budget
ax https://catalog.example.com '.product' \
  --row 'sku=@data-sku, name=h2, price=.cost' \
  --budget 500 \
  --json > batch.json

# stderr output:
# "Truncated to 38 of 2,456 rows (token budget: 500)"

# Agent processes batch
jq '.[] | {sku, name, price}' batch.json

# Loop for next batch (with caching)
OFFSET=38
ax "https://catalog.example.com?offset=$OFFSET" ... --budget 500
```

**Why it works:**
- `--budget` prevents context overflow
- Truncation note on stderr alerts agent
- Agent paginates or refines query

---

## Pattern 10: Error Detection & Debugging

**Use case:** Agent detects parsing failure and uses `--debug` for diagnostics.

**Example:**

```bash
#!/bin/bash
# Script: extract-with-debug.sh

ax "$1" '.item' --row 'name=h2, price=.cost' --json > data.json 2> err.log

if [ ! -s data.json ] || [ "$(jq '. | length' data.json)" -eq 0 ]; then
  echo "Extraction failed, running debug..."
  ax "$1" '.item' --debug 2>&1 | tail -20
  
  # Fallback: use outline
  echo "Falling back to outline discovery..."
  ax "$1" --outline
fi
```

**Why it works:**
- Checks for empty results
- `--debug` shows what went wrong
- `--outline` helps agent recover

---

## Integration with Agent Skills

### With `deep-agents-core`

Register ax as a custom tool:

```python
from deep_agents import tool

@tool("fetch_and_extract")
async def fetch_page(
    url: str,
    selector: str = None,
    mode: str = "outline"
):
    """Fetch web page and extract structured data with ax."""
    import subprocess
    import json
    
    cmd = ["ax", url]
    
    if mode == "outline":
        cmd.append("--outline")
    elif mode == "extract" and selector:
        cmd.extend([selector, "--row", "content=*", "--json"])
    elif mode == "markdown":
        cmd.extend(["--md", "--budget", "1000"])
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        try:
            return json.loads(result.stdout)
        except:
            return result.stdout
    else:
        return {"error": result.stderr, "code": result.returncode}
```

Usage in agent task:

```python
result = await fetch_page(
    url="https://example.com",
    selector=".item",
    mode="extract"
)
```

### With `research` Skill

Parallelize ax calls across multiple sites:

```bash
#!/bin/bash
# Script: parallel-research.sh

sites=(
  "https://news1.example.com"
  "https://news2.example.com"
  "https://news3.example.com"
)

for site in "${sites[@]}"; do
  ax "$site" '.article' \
    --row 'title=h2, link=a@href, date=.posted' \
    --json &
done | wait

# Aggregate and deduplicate
jq -s '[.[] | unique_by(.link)]' *.json > all_articles.json
```

### With `react-grab`

Use ax to discover structure, then capture React components:

```bash
# Step 1: Outline structure
ax https://app.example.com --outline
# Agent sees: .user-card, .product-details, etc.

# Step 2: Capture React element
react-grab --selector '.user-card' --file component.tsx
```

---

## Best Practices for Agents

### 1. Always Start with `--outline`

```bash
# Right: Learn structure first
ax https://example.com --outline
# Then formulate extraction query

# Avoid: Guessing selectors
ax https://example.com '.unknown' --row 'field=selector'
```

### 2. Validate Results Before Processing

```bash
# Check row count and truncation
ax https://example.com '.item' --budget 500 --json > data.json 2> warnings.log

if grep -q "Truncated" warnings.log; then
  echo "Data was truncated; consider pagination"
fi
```

### 3. Cache When Possible

```bash
# First call: fetches and caches
ax https://example.com --outline

# Second call: uses cache (50ms vs 500ms)
ax https://example.com '.item' --row 'name=h2'
```

### 4. Use `--where` for Filtering

```bash
# Efficient: filter at source
ax https://example.com '.item' \
  --row 'price=.cost' \
  --where 'price > 50'

# Inefficient: extract all, filter in code
ax https://example.com '.item' --row 'price=.cost'
# Agent: if row.price > 50: ...
```

### 5. Handle Rate Limits

```bash
# Respect robots.txt and rate limits
for url in $(cat urls.txt); do
  ax "$url" --delay 500  # 500ms between requests
done
```

### 6. Log & Monitor Errors

```bash
ax "$url" --debug 2>&1 | tee -a scraper.log

# Periodically check log
tail -100 scraper.log | grep ERROR
```

---

## Common Troubleshooting for Agents

| Problem | Diagnosis | Fix |
| --- | --- | --- |
| "Selector found 0 matches" | Wrong CSS selector | Run `ax <url> --outline` to verify structure |
| Empty results on repeat | Content may be JS-rendered | Try `--fresh` to bypass cache; if still empty, content is client-side |
| "Truncated to N rows" | Results hit token budget | Increase `--budget` or narrow `--where` filter |
| Slow first run | Network latency + parsing | Subsequent calls use cache (~50ms) |
| Rate limited | Too many requests | Add `--delay <ms>` or use cache |
| SSL errors | Certificate issue | `--no-check` (dev only) or update CA certs |

---

## Real-World Examples

### Example 1: News Aggregator

```bash
#!/bin/bash
# Fetch latest headlines from multiple sources

for site in news1.example.com news2.example.com news3.example.com; do
  ax "https://$site" '.headline' \
    --row 'title=h1, link=a@href, time=.posted' \
    --json &
done | wait

# Merge and deduplicate
jq -s 'add | unique_by(.link) | sort_by(.time) | reverse | .[0:10]' *.json
```

### Example 2: Price Monitor

```bash
#!/bin/bash
# Track product prices daily

PRODUCT_URL="https://shop.example.com/item/12345"
DATE=$(date +%Y-%m-%d)

ax "$PRODUCT_URL" '.price' --row 'current=.now, original=.was' --json | \
  jq --arg date "$DATE" '. + {date: $date}' >> prices.jsonl

# Later: analyze trends
jq '.current | tonumber' prices.jsonl | 
  awk '{ sum += $1; count++ } END { print sum/count }'
```

### Example 3: Content Indexing

```bash
#!/bin/bash
# Index documentation site

for path in $(ax https://docs.example.com --locate "." | grep href); do
  ax "https://docs.example.com$path" --md >> docs.md &
done | wait

# Build searchable index
grep -n "^#" docs.md | cut -d: -f1,2 > docs_index.txt
```

---

For more details, see [cli-flags.md](./cli-flags.md) or run `ax --help`.
