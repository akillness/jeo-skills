# ax Installation & Environment Setup

## System Requirements

- **OS:** Linux, macOS, or WSL2 (Windows)
- **Node.js:** Optional (only for npm install)
- **Bun:** Pre-compiled binary (recommended) — no runtime dependencies

## Install Methods

### Method 1: Official Shell Script (Recommended)

```bash
curl -fsSL https://ax.yusuke.run/install | sh
```

This installs a pre-compiled single-file binary. No runtime dependencies; ready immediately.

**Verify installation:**

```bash
ax --version
# Output: ax 1.1.2
```

**Platform detection:** Script automatically detects your OS and CPU arch (x86_64, arm64).

**Install location:** `~/.local/bin/ax` (added to PATH during install).

### Method 2: Homebrew (macOS & Linux)

```bash
brew install yusukebe/tap/ax
```

Update existing install:

```bash
brew upgrade ax
```

### Method 3: npm (Node.js Required)

```bash
npm install -g ax-cli
```

Requires Node.js 18+. Faster for CI/CD environments with Node already present.

### Method 4: Manual Binary Download

Visit https://ax.yusuke.run/downloads and download the binary for your OS/arch.

```bash
wget https://ax.yusuke.run/download/ax-linux-x64
chmod +x ax-linux-x64
sudo mv ax-linux-x64 /usr/local/bin/ax
```

## Verification

After install, verify the tool works:

```bash
# Version check
ax --version

# Help
ax --help

# Agent-oriented playbook
ax agent-context
```

Expected output: JSON response with tool metadata and available flags.

## Environment Variables

ax respects these environment variables:

| Variable | Effect | Default |
| --- | --- | --- |
| `AX_CACHE_DIR` | Cache directory for fetched pages | `~/.cache/ax` |
| `AX_NO_CACHE` | Disable local caching | unset (caching enabled) |
| `AX_TIMEOUT` | Request timeout (ms) | `30000` |
| `AX_USER_AGENT` | Custom User-Agent header | `ax/<version>` |
| `AX_DEBUG` | Enable verbose logging | unset |

**Example: Custom cache directory**

```bash
export AX_CACHE_DIR=/mnt/scraper-cache
ax https://example.com --outline
```

**Example: Disable cache for all requests**

```bash
export AX_NO_CACHE=1
ax https://example.com  # Always live fetch
```

## Configuration File

Create `~/.ax/config.json` for persistent settings:

```json
{
  "cache_dir": "~/.cache/ax",
  "timeout_ms": 30000,
  "user_agent": "MyAgent/1.0",
  "default_budget": 500,
  "rate_limit_ms": 100
}
```

Flags on the command line override config file settings.

## Integration with CI/CD

### GitHub Actions

```yaml
name: Scrape & Parse

on: [schedule]

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - name: Install ax
        run: curl -fsSL https://ax.yusuke.run/install | sh
      
      - name: Scrape & extract
        run: |
          ax https://example.com '.item' \
            --row 'title=h2, link=a@href' \
            --json > data.json
      
      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: scraped-data
          path: data.json
```

### Docker

```dockerfile
FROM ubuntu:22.04

RUN curl -fsSL https://ax.yusuke.run/install | sh

ENTRYPOINT ["ax"]
CMD ["--help"]
```

**Usage:**

```bash
docker build -t ax-scraper .
docker run ax-scraper https://example.com --outline
```

### Kubernetes

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: ax-scraper
spec:
  schedule: "0 * * * *"  # Hourly
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: ax
            image: ubuntu:22.04
            command:
              - /bin/sh
              - -c
              - |
                curl -fsSL https://ax.yusuke.run/install | sh
                ~/.local/bin/ax https://data.example.com --outline
          restartPolicy: OnFailure
```

## Uninstall

### If installed via shell script:

```bash
rm ~/.local/bin/ax
# Remove cache (optional)
rm -rf ~/.cache/ax
```

### If installed via Homebrew:

```bash
brew uninstall ax
```

### If installed via npm:

```bash
npm uninstall -g ax-cli
```

## Troubleshooting

### Error: "command not found: ax"

**Cause:** Binary not in PATH.

**Fix:**
```bash
# Find where ax was installed
which ax
# Or reinstall
curl -fsSL https://ax.yusuke.run/install | sh
```

### Error: "Permission denied"

**Cause:** Binary not executable.

**Fix:**
```bash
chmod +x ~/.local/bin/ax
```

### Error: "SSL certificate problem"

**Cause:** SSL verification failed (corporate proxy, etc.).

**Fix (development only):**
```bash
ax https://example.com --no-check
```

**Fix (recommended):** Update CA certificates:
```bash
# macOS
brew install ca-certificates
# Linux
sudo apt-get install ca-certificates
```

### Slow first run / cache warming

**First fetch takes ~500ms–2s** (network latency + parsing). Subsequent parse-mode calls on the same URL use cache (~50ms).

Enable `--debug` to see cache hit/miss:

```bash
ax https://example.com --debug
# stderr: [AX] Cache MISS: https://example.com
# (next call)
ax https://example.com --debug
# stderr: [AX] Cache HIT: https://example.com (age: 23s)
```

---

## Next: Try Common Commands

```bash
# Discover a page
ax https://github.com/yusukebe/ax --outline

# Extract rows
ax https://news.ycombinator.com '.athing' --row 'title=.titleline' --limit 5

# Read markdown
ax https://docs.example.com --md --budget 800
```

For complete flag reference, see [cli-flags.md](./cli-flags.md) or run `ax --help`.
