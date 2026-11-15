---
name: fastmcp
description: >
  Build, inspect, deploy, and evaluate MCP (Model Context Protocol) servers, clients, and agent skills with FastMCP 4.2+ (Python/TypeScript). Use when authoring tools, resources, and prompts with @mcp.tool, @mcp.resource, and @mcp.prompt; declaring dependencies via Annotated[T, Depends(...)]; hosting or consuming agent skills through Skill, SkillCatalogProvider, and Client.read_skill() under SEP-2640; managing transports (stdio, SSE, streamable HTTP); configuring auth middleware and error masking; running local CLI discovery and testing with fastmcp run, dev, inspect, list, call, and install; or verifying in-process workflows with Client. Route generic API wrapping without FastMCP to mcp-builder, and format-only skill linting to skill-standardization.
allowed-tools: Bash Read Grep Glob Write Edit
metadata:
  version: 4.2.0
  source: https://github.com/PrefectHQ/fastmcp
  upstream_commit: 5e71792d8daf499325e3b747cc44cb04d4544119
---

# FastMCP

## When to use this skill

Use when designing, implementing, configuring, inspecting, or evaluating Model Context Protocol (MCP) applications using the official FastMCP framework (v4.2.0+ "Mad Skills"). FastMCP provides high-level Pythonic and TypeScript abstractions for:
- Authoring MCP servers with callable tools, addressable resources, and message prompts.
- Serving and consuming Agent Skills over MCP using the SEP-2640 Skills extension (`Skill`, `SkillCatalogProvider`, `SkillsDirectoryProvider`).
- Dependency injection with `Annotated[T, Depends(...)]` and `CallArgument`.
- Multi-transport hosting across stdio, Server-Sent Events (SSE), and streamable HTTP.
- Command-line tool inspection and execution with `fastmcp list`, `fastmcp call`, `fastmcp discover`, `fastmcp dev`, and `fastmcp run`.
- In-process integration testing with `Client(server)`.

### Route-outs
- For wrapping an external REST API without the FastMCP framework or building general Anthropic tool evaluations, use `mcp-builder`.
- For linting Agent Skills frontmatter, YAML boundaries, or directory layouts, use `skill-standardization`.
- For raw OpenTelemetry export or streaming telemetry pipelines without MCP server logic, use `agent-observability`.
- For evaluating LLM generation quality and RAG Triad scores, use `trulens`.

---

## Instructions

### 1. Offline environment preflight

Before running servers or invoking external commands, run the offline preflight helper:

```bash
python3 "$SKILL_DIR/scripts/preflight.py" --json
```

This checks for local `fastmcp` CLI availability, Python package imports (`fastmcp`, `fastmcp_slim`, `mcp`, `pydantic`), and local database/configuration presence without network requests or binary execution.

### 2. FastMCP server authoring

Create an MCP server exposing typed tools, resources, and prompts:

```python
from fastmcp import FastMCP, Context
from pydantic import Field
from typing import Literal

mcp = FastMCP("Service Assistant 🚀")

@mcp.tool
def calculate_vat(
    amount: float = Field(gt=0, description="Gross amount in currency"),
    rate: Literal["standard", "reduced", "zero"] = "standard"
) -> dict:
    """Calculate VAT rate and total amount."""
    rates = {"standard": 0.20, "reduced": 0.05, "zero": 0.0}
    tax = amount * rates[rate]
    return {"amount": amount, "tax": tax, "total": amount + tax}

@mcp.resource("system://metrics")
def get_metrics() -> str:
    """Return live system operational metrics."""
    return "status=healthy uptime=99.98%"

@mcp.prompt("triage-issue")
def triage_prompt(issue_id: str, severity: str = "medium") -> list[dict]:
    """Generate message template for triaging an issue."""
    return [
        {"role": "user", "content": f"Please triage issue {issue_id} marked as severity: {severity}."}
    ]

if __name__ == "__main__":
    mcp.run()
```

### 3. Dependency injection and context

Declare dependencies in parameter annotations with `Annotated[T, Depends(...)]` so types remain clean for schema generation:

```python
from typing import Annotated
from fastmcp import FastMCP, Depends, Context

mcp = FastMCP("Secure Service")

def get_db_session():
    # Yield or return managed resource
    return {"connection": "active"}

@mcp.tool
async def fetch_record(
    record_id: str,
    db: Annotated[dict, Depends(get_db_session)],
    ctx: Context
) -> dict:
    """Fetch record with database session and context logging."""
    await ctx.info(f"Looking up {record_id}")
    return {"id": record_id, "status": "found"}
```

### 4. Serving and consuming Agent Skills (v4.2 Mad Skills)

FastMCP 4.2 serves Agent Skills directly from the server next to the tools they describe, implementing the SEP-2640 Skills extension:

#### Server-side skill hosting:
```python
from fastmcp import FastMCP, Skill
from fastmcp.skills.provider import SkillCatalogProvider, SkillsDirectoryProvider

# Single skill from local directory
deploy_skill = Skill.from_directory("skills/deploy")

# Or serve an entire directory of skills
provider = SkillsDirectoryProvider("skills")

mcp = FastMCP("DevOps Skills")
mcp.add_provider(SkillCatalogProvider([deploy_skill]))
# or: mcp.add_provider(provider)
```

#### Client-side skill discovery and consumption:
```python
from fastmcp import Client

async with Client(mcp) as client:
    # 1. List available skills
    skills = await client.list_skills()
    for s in skills:
        print(f"Skill: {s.name} - {s.description}")
    
    # 2. Read full verified skill and verify digests
    skill = await client.read_skill("deploy")
    print(f"Verified files: {len(skill.files)}")
    
    # 3. Export skill to local directory for host use
    skill.to_directory("~/.agents/skills/deploy")
```

**Security Boundary**: Hash verification verifies file bytes against the server manifest; host approval remains authoritative before executing code or injecting instructions into context.

### 5. Transports and security

Choose the appropriate transport for your runtime environment:

```python
# 1. Standard I/O (default for local desktop clients like Claude Desktop)
mcp.run(transport="stdio")

# 2. Server-Sent Events (SSE) for legacy HTTP streaming
mcp.run(transport="sse", host="127.0.0.1", port=8000)

# 3. Streamable HTTP (modern production deployment)
mcp.run(transport="http", host="0.0.0.0", port=8000)
```

For sensitive operations:
- Use `ToolError("Friendly error message")` from `fastmcp.exceptions` to return safe client-facing errors.
- Enable `mask_error_details=True` to prevent internal stack traces and database details from leaking to the model.

### 6. FastMCP CLI toolchain

Use the `fastmcp` CLI for discovery, inspection, and execution:

```bash
# 1. Discover servers configured in editors and mcp.json
fastmcp discover --json

# 2. Inspect tools, resources, and prompts on any server target
fastmcp list server.py --input-schema --output-schema
fastmcp list http://localhost:8000/mcp --skills

# 3. Invoke a tool from the command line with auto type-coercion
fastmcp call server.py calculate_vat amount=100 rate=standard --json

# 4. Interactive developer UI / live reloading
fastmcp dev server.py

# 5. Install an MCP server into local client configs
fastmcp install server.py --name "my-service"
```

### 7. In-process verification

Always write deterministic tests using FastMCP's built-in in-process `Client`:

```python
import pytest
from fastmcp import Client
from my_server import mcp

@pytest.mark.asyncio
async def test_calculate_vat_in_process():
    async with Client(mcp) as client:
        result = await client.call_tool("calculate_vat", {"amount": 50.0, "rate": "reduced"})
        assert result.content[0].text is not None
```

---

## References

- [Upstream Sources & Pin](references/sources.md): FastMCP v4.2.0 commit `5e71792`, repository links, and licensing.
- [Server Authoring & Transports](references/server-authoring-and-transports.md): In-depth guide to tools, resources, prompts, dependency injection, and SSE/HTTP transports.
- [Skills Extension & Providers](references/skills-extension-and-providers.md): SEP-2640 Skills extension, `SkillCatalogProvider`, manifest digests, and client discovery.
- [Client & CLI Operations](references/client-and-cli-operations.md): Command reference for `fastmcp list`, `call`, `discover`, `dev`, and `ClientGroup`.
- [Evaluation Scenarios](evals/evals.json): Five representative scenarios for evaluating FastMCP operations.
