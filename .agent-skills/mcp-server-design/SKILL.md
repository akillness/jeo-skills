---
name: mcp-server-design
description: Build and publish production MCP servers — capability primitives, Streamable HTTP transport, Server Cards, registry compliance. Use when you're exposing tools/resources/prompts to multiple agent runtimes via Model Context Protocol.
---

# MCP Server Design

## Overview

The Model Context Protocol (MCP) is the 2026 standard for exposing tools, resources, and prompts to any agent runtime (Claude, Codex, Gemini, OpenCode, custom). This skill covers transport choice, capability schema, Server Cards, and registry publishing.

## When to use

- Need to expose internal APIs/databases as agent-callable tools
- Want one integration that works across Claude / Codex / OpenCode / etc.
- Building reusable, shareable capability packs
- Replacing brittle plugin systems with a standard protocol

## Capability primitives

| Primitive | Use for |
|-----------|---------|
| **Tools** | Side-effecting actions (write, call API, run code) |
| **Resources** | Read-only data (files, DB rows, search results) |
| **Prompts** | Reusable templates with parameters |
| **Sampling** | Server requests completion from client's LLM |
| **Roots** | Filesystem boundaries the server may touch |

Don't make every read a Tool — use Resources. Reserve Tools for things that change state or have cost.

## Transport selection

| Transport | Pick when |
|-----------|-----------|
| **stdio** | Local single-user (Claude Desktop, IDE plugin) |
| **Streamable HTTP** (2026 default) | Multi-user, remote, stateless, web-friendly |
| **SSE** (legacy) | Migrate to Streamable HTTP |

Stateless Streamable HTTP is the production default — works behind load balancers, no sticky sessions.

## Minimum server (Python, FastMCP)

```python
from mcp.server.fastmcp import FastMCP
mcp = FastMCP("acme-billing")

@mcp.tool()
def create_invoice(customer_id: str, amount_cents: int) -> dict:
    """Create a draft invoice. Returns {invoice_id, status}."""
    return billing_api.create(customer_id, amount_cents)

@mcp.resource("invoice://{invoice_id}")
def get_invoice(invoice_id: str) -> str:
    return billing_api.fetch(invoice_id).json()

if __name__ == "__main__":
    mcp.run(transport="streamable-http", port=8080)
```

## Server Card (required for registry)

```json
{
  "name": "acme-billing",
  "version": "1.2.0",
  "description": "Acme billing operations",
  "publisher": "acme",
  "homepage": "https://github.com/acme/mcp-billing",
  "transports": ["streamable-http", "stdio"],
  "capabilities": {
    "tools": ["create_invoice", "void_invoice"],
    "resources": ["invoice://{id}", "customer://{id}"]
  },
  "auth": {"type": "oauth2", "scopes": ["billing:write"]},
  "license": "MIT"
}
```

## Design rules

1. **Tool descriptions are the API contract** — write them for an LLM reader: action verb, when to call, what comes back, what side-effects occur
2. **Type strictly** — JSON Schema for every argument, no `Any`
3. **Idempotency** — accept an `idempotency_key` for state-changing tools
4. **Pagination** — every list resource returns `cursor`, not offsets
5. **Errors** — structured `{error: {code, message, retriable}}`, never raw stack traces
6. **Auth at the transport** — OAuth2/OIDC at HTTP, never in tool args
7. **Rate limit headers** — return `X-RateLimit-*` so agents can back off

## Publishing

```bash
mcp registry publish ./server-card.json
mcp registry verify acme/billing
```

Public registry: `registry.modelcontextprotocol.io` (2026).

## Further reading

- MCP 2026 spec — protocol, transports, lifecycle
- Server Card schema — `registry.modelcontextprotocol.io`
- FastMCP / TypeScript SDK — server patterns
- MCP security checklist — auth, sandboxing, audit
