#!/bin/bash
# Scaffold ax Integration for Agent Projects
#
# Generates agent-ready scripts, tools, and configuration for using ax
#
# Usage:
#   ./scaffold-integration.sh <project-name>
#   ./scaffold-integration.sh <project-name> --python    # For Python agents
#   ./scaffold-integration.sh <project-name> --bash      # For shell scripts
#   ./scaffold-integration.sh <project-name> --node      # For Node.js agents

set -euo pipefail

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $*"; }
log_success() { echo -e "${GREEN}✓${NC} $*"; }

PROJECT_NAME="${1:-}"
LANG="${2:---bash}"

if [ -z "$PROJECT_NAME" ]; then
  echo "Usage: $0 <project-name> [--python|--bash|--node]"
  exit 1
fi

# Ensure project directory exists
mkdir -p "./$PROJECT_NAME/tools"
mkdir -p "./$PROJECT_NAME/config"
mkdir -p "./$PROJECT_NAME/scripts"

log_info "Scaffolding ax integration for project: $PROJECT_NAME"

# ====== Common Files (all agents) ======

# config/ax.config.json
cat > "./$PROJECT_NAME/config/ax.config.json" << 'EOF'
{
  "cache_dir": "~/.cache/ax",
  "timeout_ms": 30000,
  "default_budget": 500,
  "agent_mode": true,
  "rate_limit_ms": 100,
  "default_format": "json"
}
EOF
log_success "Created config/ax.config.json"

# scripts/ax-wrapper.sh - unified wrapper
cat > "./$PROJECT_NAME/scripts/ax-wrapper.sh" << 'EOF'
#!/bin/bash
# ax Wrapper — Unified interface for agent tasks
#
# Usage:
#   ax-wrapper discover <url>                       # Page structure
#   ax-wrapper extract <url> <selector> [--json]   # Extract rows
#   ax-wrapper monitor <url> [--interval 60]       # Monitor endpoint
#   ax-wrapper markdown <url>                      # Extract as markdown

set -euo pipefail

if ! command -v ax &> /dev/null; then
  echo "Error: ax is not installed. Run: curl -fsSL https://ax.yusuke.run/install | sh"
  exit 1
fi

COMMAND="${1:-}"

case "$COMMAND" in
  discover)
    URL="${2:-}"
    [ -z "$URL" ] && { echo "Usage: ax-wrapper discover <url>"; exit 1; }
    echo "[ax] Discovering page structure..."
    ax "$URL" --outline
    ;;
  
  extract)
    URL="${2:-}"
    SELECTOR="${3:-.item}"
    shift 3 2>/dev/null || true
    [ -z "$URL" ] && { echo "Usage: ax-wrapper extract <url> <selector> [flags...]"; exit 1; }
    echo "[ax] Extracting from selector: $SELECTOR"
    ax "$URL" "$SELECTOR" --row 'content=*' --json "$@"
    ;;
  
  monitor)
    URL="${2:-}"
    INTERVAL="${3:-60}"
    [ -z "$URL" ] && { echo "Usage: ax-wrapper monitor <url> [interval-sec]"; exit 1; }
    echo "[ax] Monitoring (interval: ${INTERVAL}s)..."
    while true; do
      echo "[$(date +'%Y-%m-%d %H:%M:%S')] Checking..."
      ax "$URL" --no-cache --body || echo "  Error: request failed"
      sleep "$INTERVAL"
    done
    ;;
  
  markdown)
    URL="${2:-}"
    [ -z "$URL" ] && { echo "Usage: ax-wrapper markdown <url>"; exit 1; }
    echo "[ax] Extracting as markdown..."
    ax "$URL" --md --budget 1500
    ;;
  
  *)
    echo "Usage: ax-wrapper <command> [args...]"
    echo ""
    echo "Commands:"
    echo "  discover <url>           Page structure discovery"
    echo "  extract <url> <sel>      Extract rows with CSS selector"
    echo "  monitor <url> [sec]      Monitor endpoint repeatedly"
    echo "  markdown <url>           Extract as markdown"
    echo ""
    echo "For advanced usage: ax --help or ax agent-context"
    exit 1
    ;;
esac
EOF
chmod +x "./$PROJECT_NAME/scripts/ax-wrapper.sh"
log_success "Created scripts/ax-wrapper.sh"

# ====== Language-Specific Files ======

case "$LANG" in
  --python)
    log_info "Scaffolding Python integration..."
    
    # tools/ax_tool.py
    cat > "./$PROJECT_NAME/tools/ax_tool.py" << 'EOF'
"""
ax Tool for Python Agents

Use with deep-agents-core or any agentic framework.
"""

import subprocess
import json
import os
from typing import Optional, Dict, Any
from dataclasses import dataclass


@dataclass
class AxConfig:
    """Configuration for ax tool."""
    cache_enabled: bool = True
    timeout_ms: int = 30000
    budget_tokens: int = 500
    format_output: str = "json"


class AxTool:
    """Wrapper for ax CLI — fetch, discover, and extract web data."""
    
    def __init__(self, config: Optional[AxConfig] = None):
        self.config = config or AxConfig()
        self._verify_ax()
    
    def _verify_ax(self):
        """Check if ax is installed."""
        try:
            subprocess.run(["ax", "--version"], capture_output=True, check=True)
        except (FileNotFoundError, subprocess.CalledProcessError):
            raise RuntimeError("ax is not installed. Install: curl -fsSL https://ax.yusuke.run/install | sh")
    
    def discover(self, url: str) -> str:
        """Get page structure without raw HTML."""
        cmd = ["ax", url, "--outline"]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        return result.stdout if result.returncode == 0 else result.stderr
    
    def locate(self, url: str, text: str) -> str:
        """Find CSS selector(s) for a given text."""
        cmd = ["ax", url, "--locate", text]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        return result.stdout if result.returncode == 0 else result.stderr
    
    def extract(
        self,
        url: str,
        selector: str,
        fields: Optional[Dict[str, str]] = None,
        where: Optional[str] = None,
        format: str = "json"
    ) -> Any:
        """Extract structured rows from page."""
        cmd = ["ax", url, selector]
        
        if fields:
            row_spec = ", ".join([f"{k}={v}" for k, v in fields.items()])
            cmd.extend(["--row", row_spec])
        
        if where:
            cmd.extend(["--where", where])
        
        if format == "json":
            cmd.append("--json")
        elif format == "csv":
            cmd.append("--csv")
        
        cmd.extend(["--budget", str(self.config.budget_tokens)])
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        
        if result.returncode != 0:
            return {"error": result.stderr, "code": result.returncode}
        
        if format == "json":
            try:
                return json.loads(result.stdout)
            except json.JSONDecodeError:
                return {"raw": result.stdout}
        
        return result.stdout
    
    def fetch(self, url: str, fresh: bool = False) -> Dict[str, Any]:
        """Fetch URL and return full response."""
        cmd = ["ax", url]
        if fresh:
            cmd.append("--fresh")
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        
        if result.returncode == 0:
            try:
                return json.loads(result.stdout)
            except json.JSONDecodeError:
                return {"body": result.stdout}
        else:
            return {"error": result.stderr, "code": result.returncode}
    
    def markdown(self, url: str) -> str:
        """Extract page as markdown."""
        cmd = ["ax", url, "--md", "--budget", str(self.config.budget_tokens)]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        return result.stdout if result.returncode == 0 else result.stderr
    
    def table(self, url: str, selector: Optional[str] = None) -> Any:
        """Extract table as structured data."""
        cmd = ["ax", url]
        if selector:
            cmd.append(selector)
        cmd.extend(["--table", "--json"])
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        
        if result.returncode == 0:
            try:
                return json.loads(result.stdout)
            except json.JSONDecodeError:
                return {"raw": result.stdout}
        else:
            return {"error": result.stderr}


# Example usage with deep-agents-core
def create_agent_tools():
    """Register ax with agent framework."""
    from deep_agents import tool
    
    ax = AxTool()
    
    @tool("ax_discover")
    async def discover_page(url: str):
        """Discover page structure with ax."""
        return ax.discover(url)
    
    @tool("ax_extract")
    async def extract_data(url: str, selector: str):
        """Extract rows from page."""
        return ax.extract(url, selector)
    
    @tool("ax_markdown")
    async def get_markdown(url: str):
        """Get page as markdown."""
        return ax.markdown(url)
    
    return {
        "discover": discover_page,
        "extract": extract_data,
        "markdown": get_markdown
    }


if __name__ == "__main__":
    # Test
    ax = AxTool()
    print(ax.discover("https://github.com/yusukebe/ax"))
EOF
    log_success "Created tools/ax_tool.py"
    
    # example_agent.py
    cat > "./$PROJECT_NAME/example_agent.py" << 'EOF'
#!/usr/bin/env python3
"""
Example Python agent using ax for web data extraction.
"""

from tools.ax_tool import AxTool

def main():
    ax = AxTool()
    
    # Step 1: Discover
    print("Discovering page structure...")
    structure = ax.discover("https://news.example.com")
    print(structure)
    
    # Step 2: Extract
    print("\nExtracting articles...")
    articles = ax.extract(
        url="https://news.example.com",
        selector=".article",
        fields={"title": "h2", "link": "a@href"},
        format="json"
    )
    
    for article in articles[:5]:
        print(f"  - {article['title']} ({article['link']})")
    
    # Step 3: Markdown
    print("\nExtracting as markdown...")
    docs = ax.markdown("https://docs.example.com")
    print(docs[:500])

if __name__ == "__main__":
    main()
EOF
chmod +x "./$PROJECT_NAME/example_agent.py"
    log_success "Created example_agent.py"
    ;;
  
  --node)
    log_info "Scaffolding Node.js integration..."
    
    # tools/ax-tool.js
    cat > "./$PROJECT_NAME/tools/ax-tool.js" << 'EOF'
/**
 * ax Tool for Node.js Agents
 * 
 * Usage with deep-agents-core or other frameworks.
 */

const { spawn } = require("child_process");
const util = require("util");
const exec = util.promisify(require("child_process").exec);

class AxTool {
  constructor(config = {}) {
    this.cache_enabled = config.cache_enabled !== false;
    this.timeout_ms = config.timeout_ms || 30000;
    this.budget = config.budget || 500;
  }

  async discover(url) {
    return this._run(["ax", url, "--outline"]);
  }

  async locate(url, text) {
    return this._run(["ax", url, "--locate", text]);
  }

  async extract(url, selector, options = {}) {
    const cmd = ["ax", url, selector];

    if (options.fields) {
      const row_spec = Object.entries(options.fields)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      cmd.push("--row", row_spec);
    }

    if (options.where) {
      cmd.push("--where", options.where);
    }

    if (options.format === "csv") {
      cmd.push("--csv");
    } else {
      cmd.push("--json");
    }

    cmd.push("--budget", String(this.budget));

    const output = await this._run(cmd);
    
    if (options.format === "json") {
      try {
        return JSON.parse(output);
      } catch {
        return { raw: output };
      }
    }
    return output;
  }

  async fetch(url, options = {}) {
    const cmd = ["ax", url];
    if (options.fresh) cmd.push("--fresh");
    
    const output = await this._run(cmd);
    
    try {
      return JSON.parse(output);
    } catch {
      return { body: output };
    }
  }

  async markdown(url) {
    return this._run(["ax", url, "--md", "--budget", String(this.budget)]);
  }

  async table(url, selector) {
    const cmd = ["ax", url];
    if (selector) cmd.push(selector);
    cmd.push("--table", "--json");
    
    const output = await this._run(cmd);
    
    try {
      return JSON.parse(output);
    } catch {
      return { raw: output };
    }
  }

  async _run(args) {
    try {
      const { stdout } = await exec(args.join(" "));
      return stdout;
    } catch (error) {
      throw new Error(`ax failed: ${error.message}`);
    }
  }
}

module.exports = { AxTool };
EOF
    log_success "Created tools/ax-tool.js"
    
    # example_agent.js
    cat > "./$PROJECT_NAME/example_agent.js" << 'EOF'
#!/usr/bin/env node
/**
 * Example Node.js agent using ax
 */

const { AxTool } = require("./tools/ax-tool");

async function main() {
  const ax = new AxTool();

  try {
    // Step 1: Discover
    console.log("Discovering page structure...");
    const structure = await ax.discover("https://news.example.com");
    console.log(structure);

    // Step 2: Extract
    console.log("\nExtracting articles...");
    const articles = await ax.extract(
      "https://news.example.com",
      ".article",
      {
        fields: { title: "h2", link: "a@href" },
        format: "json"
      }
    );

    articles.slice(0, 5).forEach(article => {
      console.log(`  - ${article.title} (${article.link})`);
    });

    // Step 3: Markdown
    console.log("\nExtracting as markdown...");
    const docs = await ax.markdown("https://docs.example.com");
    console.log(docs.substring(0, 500));
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
EOF
chmod +x "./$PROJECT_NAME/example_agent.js"
    log_success "Created example_agent.js"
    
    # package.json
    cat > "./$PROJECT_NAME/package.json" << 'EOF'
{
  "name": "ax-agent",
  "version": "1.0.0",
  "description": "Agent using ax for web scraping",
  "main": "example_agent.js",
  "scripts": {
    "start": "node example_agent.js",
    "discover": "node -e \"const {AxTool} = require('./tools/ax-tool'); new AxTool().discover(process.argv[1]).then(console.log)\" --"
  },
  "keywords": ["ax", "scraping", "agent"],
  "license": "MIT"
}
EOF
    log_success "Created package.json"
    ;;
  
  --bash|*)
    log_info "Scaffolding Bash integration..."
    
    # example_script.sh
    cat > "./$PROJECT_NAME/scripts/example.sh" << 'EOF'
#!/bin/bash
# Example Bash agent script using ax

set -euo pipefail

if ! command -v ax &> /dev/null; then
  echo "Error: ax is not installed"
  exit 1
fi

# Discovery
echo "=== Page Discovery ==="
ax https://news.example.com --outline

# Extraction
echo ""
echo "=== Article Extraction ==="
ax https://news.example.com '.article' \
  --row 'title=h2, link=a@href, date=.posted' \
  --json > articles.json

# Filter and display
echo "Top 5 articles:"
jq '.[] | {title, link} | select(.title != null)' articles.json | head -10

# Markdown
echo ""
echo "=== Docs as Markdown ==="
ax https://docs.example.com --md | head -50
EOF
chmod +x "./$PROJECT_NAME/scripts/example.sh"
    log_success "Created scripts/example.sh"
    ;;
esac

# Common documentation
cat > "./$PROJECT_NAME/README.md" << 'EOF'
# ax Integration

This project is scaffolded to use **ax** for web scraping and data extraction.

## Quick Start

### Install ax

```bash
# System-wide
curl -fsSL https://ax.yusuke.run/install | sh

# Or verify existing
ax --version
```

### Run Examples

**Bash:**
```bash
./scripts/example.sh
./scripts/ax-wrapper.sh discover https://example.com
```

**Python:**
```bash
python3 example_agent.py
```

**Node.js:**
```bash
node example_agent.js
# Or: npm start
```

## Project Structure

- `config/ax.config.json` — ax configuration
- `scripts/` — Utility scripts
  - `ax-wrapper.sh` — Unified ax interface (discover, extract, monitor, markdown)
  - `example.sh` — Example bash agent
- `tools/` — Language-specific ax wrappers
  - `ax_tool.py` (Python) — Class-based wrapper with type hints
  - `ax-tool.js` (Node.js) — Promise-based wrapper

## Usage Patterns

### 1. Discover Page Structure
```bash
ax https://example.com --outline
```

### 2. Extract Rows
```bash
ax https://example.com '.item' \
  --row 'title=h2, link=a@href, price=.cost' \
  --json
```

### 3. Filter Results
```bash
ax https://shop.example.com '.product' \
  --row 'name=h2, price=.cost' \
  --where 'price > 50 && price < 200'
```

### 4. Extract as Markdown
```bash
ax https://docs.example.com --md --budget 1000
```

## Integration with Agents

### Python (with deep-agents-core)

```python
from tools.ax_tool import AxTool

ax = AxTool()
structure = ax.discover("https://example.com")
data = ax.extract("https://example.com", ".item", fields={...})
```

### Node.js

```javascript
const { AxTool } = require("./tools/ax-tool");

const ax = new AxTool();
const structure = await ax.discover("https://example.com");
const data = await ax.extract("https://example.com", ".item", {...});
```

### Bash

```bash
source scripts/ax-wrapper.sh
ax-wrapper discover https://example.com
ax-wrapper extract https://example.com '.item'
```

## Documentation

- `ax --help` — CLI reference
- `ax agent-context` — Agent playbook
- https://ax.yusuke.run — Official site
- https://github.com/yusukebe/ax — Repository

## Tips

- Always start with `--outline` to understand page structure
- Use `--budget` to control token usage
- Use `--where` for client-side filtering
- Cache is enabled by default (~2 min TTL); use `--fresh` to bypass
- Respect `robots.txt` and rate limits
EOF
log_success "Created README.md"

echo ""
log_success "✓ Scaffolding complete for: $PROJECT_NAME"
echo ""
echo "Next steps:"
echo "  1. cd $PROJECT_NAME"
echo "  2. Read README.md"
echo "  3. Run examples (bash, python, or node)"
echo ""
echo "For more info:"
echo "  ax --help"
echo "  ax agent-context"
