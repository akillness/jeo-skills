# FastMCP Client and CLI Operations

## Command-Line Toolchain

The `fastmcp` CLI provides direct inspection, testing, and invocation for any MCP server without requiring a full desktop AI client:

### 1. `fastmcp discover`

Locates MCP servers declared across known agent and editor configurations:

```bash
# Scan all local configurations
fastmcp discover

# Filter by configuration source
fastmcp discover --source claude-code
fastmcp discover --source cursor
fastmcp discover --source claude-desktop

# Structured output for automation
fastmcp discover --json
```

Sources scanned:
- Claude Desktop (`claude_desktop_config.json`)
- Claude Code (`config.json` / project roots)
- Cursor (`~/.cursor/mcp.json`)
- Gemini CLI
- Goose
- Project-level `./mcp.json`

### 2. `fastmcp list`

Queries the tools, resources, prompts, and skills offered by a server:

```bash
# Local Python script
fastmcp list server.py

# Remote HTTP endpoint
fastmcp list http://localhost:8000/mcp

# With detailed input and output schemas
fastmcp list server.py --input-schema --output-schema

# Include resources, prompts, and skills
fastmcp list server.py --resources --prompts --skills

# Stdio command
fastmcp list --command "uvx mcp-server-sqlite==2025.4.25 --db test.db"
```

### 3. `fastmcp call`

Invokes a specific tool on a server target from the command line:

```bash
# Key-value arguments with automated type coercion (strings, ints, booleans)
fastmcp call server.py calculate_vat amount=150.0 rate=standard

# JSON argument object for complex/nested schemas
fastmcp call server.py process_batch '{"items": [1, 2, 3], "notify": true}'

# Combining --input-json with explicit overrides
fastmcp call server.py search --input-json '{"query": "mcp", "limit": 5}' limit=20

# Machine-readable JSON output for CLI scripting
fastmcp call server.py get_status --json
```

### 4. `fastmcp dev` and `fastmcp run`

Run and test servers during local development:

```bash
# Production execution with auto-restart on changes
fastmcp run server.py --port 8000 --transport http

# Developer mode with interactive browser Inspector
fastmcp dev server.py
```

### 5. `fastmcp install`

Installs and registers a server target directly into editor configurations:

```bash
# Install into Claude Desktop
fastmcp install server.py --name "FinanceTools"

# Install into specific client environment
fastmcp install server.py --client cursor --name "DevHelper"
```

---

## Programmatic Client & Testing Patterns

### In-Process Client Testing

FastMCP's `Client` can connect directly to an in-memory `FastMCP` instance without opening sockets or starting subprocesses:

```python
import pytest
from fastmcp import FastMCP, Client

server = FastMCP("TestServer")

@server.tool
def ping() -> str:
    return "pong"

@pytest.mark.asyncio
async def test_server_in_process():
    async with Client(server) as client:
        # Check tool listing
        tools = await client.list_tools()
        assert any(t.name == "ping" for t in tools)

        # Call tool
        result = await client.call_tool("ping")
        assert result.content[0].text == "pong"
```

### ClientGroup for Multi-Server Composition

Manage connections to multiple servers simultaneously:

```python
from fastmcp import ClientGroup

async with ClientGroup() as group:
    await group.add_client("finance", "http://localhost:8001/mcp")
    await group.add_client("devops", "http://localhost:8002/mcp")

    # Call tools across namespaced servers
    res1 = await group.call_tool("finance:get_balance", {"account": "main"})
    res2 = await group.call_tool("devops:check_status", {})
```
