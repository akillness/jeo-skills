# Capability primitives, Server Card, and registry publishing

Merged into `mcp-builder` on 2026-09-19 from the former `mcp-server-design` skill
(akillness/oh-my-gods), now recorded in `skills.json` `retired_skills`. It complements
[design-and-implementation.md](design-and-implementation.md), which owns naming,
granularity, descriptions, pagination, errors, transport, annotations, and security.
Verify the registry commands against the current MCP registry docs before running them;
they are recorded as the wrapper documented them.

## Capability primitives — do not make every read a Tool

| Primitive | Use for |
|-----------|---------|
| **Tools** | Side-effecting actions (write, call API, run code) |
| **Resources** | Read-only data (files, DB rows, search results) |
| **Prompts** | Reusable templates with parameters |
| **Sampling** | Server asks the client's LLM for a completion |
| **Roots** | Filesystem boundaries the server may touch |

Reserve Tools for things that change state or cost money; expose read-only data as
Resources so clients can fetch it without a confirmation prompt.

## Transport defaults

| Transport | Pick when |
|-----------|-----------|
| **stdio** | Local single-user (Claude Desktop, IDE plugin) |
| **Streamable HTTP** | Multi-user, remote, stateless, web-friendly — the production default; works behind load balancers with no sticky sessions |
| **SSE** | Legacy only — migrate to Streamable HTTP |

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

## Design rules the evaluation will otherwise catch late

1. **Tool descriptions are the API contract** — action verb, when to call, what comes
   back, what side effects occur; written for an LLM reader.
2. **Type strictly** — JSON Schema for every argument, no `Any`.
3. **Idempotency** — accept an `idempotency_key` on state-changing tools.
4. **Cursors, not offsets** — every list resource returns `cursor`.
5. **Structured errors** — `{error: {code, message, retriable}}`, never raw stack traces.
6. **Auth at the transport** — OAuth2/OIDC on HTTP, never in tool arguments.
7. **Rate-limit headers** — return `X-RateLimit-*` so agents can back off.

## Server Card (registry metadata)

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

## Publishing

```bash
mcp registry publish ./server-card.json
mcp registry verify acme/billing
```

Public registry: `registry.modelcontextprotocol.io`. Publishing is a side effect — confirm
the target registry and the card's `auth` scopes with the user first.
