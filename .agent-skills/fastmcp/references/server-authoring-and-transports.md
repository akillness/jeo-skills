# FastMCP Server Authoring and Transports

## Core Interface Architecture

FastMCP provides decorators that turn standard Python functions into Model Context Protocol interfaces with automated JSON Schema generation:

### 1. Tools (`@mcp.tool`)

Tools represent callable functions that an LLM can invoke to affect state or query services:

```python
from fastmcp import FastMCP
from pydantic import BaseModel, Field
from typing import Literal

mcp = FastMCP("Tool Server")

class SearchFilter(BaseModel):
    category: str = Field(description="Filter category")
    max_results: int = Field(default=10, ge=1, le=100)

@mcp.tool
def search_items(query: str, filter_opt: SearchFilter | None = None) -> list[dict]:
    """Search catalog items matching query with optional category filtering."""
    # Implementation returns JSON-serializable list of dictionaries
    return [{"id": "item-1", "title": f"Result for {query}"}]
```

Key rules:
- Use type annotations for every parameter and return type.
- Use `Field(description="...")` to guide the model on parameter purpose.
- Use `Literal["a", "b"]` or standard `Enum` for finite choices.
- Preserve docstrings: the first line is the summary, and subsequent lines become description text.

### 2. Resources (`@mcp.resource`)

Resources provide addressable URI content that the model or host can read:

```python
@mcp.resource("config://app/settings")
def get_app_settings() -> str:
    """Return application global settings in YAML format."""
    return "theme: dark\nmax_connections: 50"

@mcp.resource("users://{user_id}/profile")
def get_user_profile(user_id: str) -> dict:
    """Dynamic resource template parameterized by user_id."""
    return {"id": user_id, "role": "admin"}
```

### 3. Prompts (`@mcp.prompt`)

Prompts provide structured, reusable conversation starters and message templates:

```python
@mcp.prompt("code-review")
def code_review_prompt(pr_url: str, focus: str = "security") -> list[dict]:
    """Generate prompt messages for reviewing a pull request."""
    return [
        {
            "role": "user",
            "content": f"Please review PR at {pr_url} focusing strictly on {focus} concerns."
        }
    ]
```

---

## Dependency Injection and Execution Context

FastMCP 4.2 supports parameter annotations with `Annotated[T, Depends(...)]`:

```python
from typing import Annotated
from fastmcp import FastMCP, Depends, Context

mcp = FastMCP("DI Server")

def get_current_user(ctx: Context) -> dict:
    # Read user session or header information
    return {"user_id": "usr_123", "role": "engineer"}

@mcp.tool
async def update_status(
    new_status: str,
    user: Annotated[dict, Depends(get_current_user)],
    ctx: Context
) -> str:
    """Update system status with user audit logging."""
    await ctx.info(f"User {user['user_id']} updated status to {new_status}")
    return f"Updated by {user['user_id']}"
```

---

## Transports and Hosting

FastMCP supports three native transports:

| Transport | Description | Best For | Invocation |
|---|---|---|---|
| `stdio` | Standard input/output communication | Local CLI tools, Claude Desktop, Cursor, local agents | `mcp.run(transport="stdio")` |
| `sse` | HTTP with Server-Sent Events | Long-polling HTTP endpoints, legacy web proxies | `mcp.run(transport="sse", port=8000)` |
| `http` | Streamable HTTP transport | Modern cloud microservices, Docker, Kubernetes | `mcp.run(transport="http", port=8000)` |

### Security Best Practices

1. **Client-Facing Errors vs Internal Crashes**:
   - Raise `ToolError("User actionable message")` for intended failures.
   - Set `mask_error_details=True` on `FastMCP(...)` so unexpected exceptions (e.g. `psycopg2.OperationalError`) do not leak database credentials, IP addresses, or internal file paths to the model.

2. **Mounts and Composition**:
   - Mount child servers with `mcp.mount(child_server, prefix="subsystem")`.
   - Namespacing prevents tool collision across microservices.
