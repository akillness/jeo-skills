---
name: agent-tool-routing
description: Tool registry, capability discovery, schema-first routing, router policies and fallbacks. Use when an agent has more than ~15 tools, multiple MCP servers, or needs dynamic tool selection based on context.
---

# Agent Tool Routing

## Overview

Past ~15 tools, the LLM's tool-selection accuracy collapses. The fix is a **router layer**: discover capabilities, narrow the tool set per turn, then hand a small focused set to the LLM. This skill builds that router.

## When to use

- Agent has 20+ tools and picks the wrong one
- Multiple MCP servers — too many overlapping tools
- Tools come and go at runtime (per-tenant, per-permission)
- Need fallback chains (preferred tool → cheaper tool → cached)
- Cost: every unused tool description wastes input tokens

## Architecture

```
Request → [Capability Discovery] → [Router] → [Top-K Tools] → LLM
                  ↑                    ↑
            registry index      semantic + policy
```

## Tool registry

```python
@dataclass
class ToolEntry:
    name: str
    description: str           # LLM-facing
    schema: dict               # JSON Schema
    embedding: list[float]     # for semantic match
    tags: set[str]             # billing, read, write, hitl
    cost_usd_per_call: float
    p95_latency_ms: int
    requires_scopes: set[str]
    fallback: str | None       # tool name to try if this fails
```

Sources: MCP server discovery, local `tools.yaml`, plugins.

## Router policies

| Policy | When |
|--------|------|
| **Semantic top-K** | Embed query, return K nearest tools | Default |
| **Tag-filtered** | Restrict to tags matching turn intent | High-stakes |
| **Scope-filtered** | Drop tools the caller lacks scopes for | Multi-tenant |
| **Cost-aware** | Prefer cheaper tool if quality equal | Bulk runs |
| **Sticky** | Reuse last turn's tool if still relevant | Conversational |

Compose: scope filter → tag filter → semantic top-K → cost re-rank.

## Quick start

```python
def route_tools(query, caller_scopes, k=8):
    candidates = registry.all()
    candidates = [t for t in candidates if t.requires_scopes <= caller_scopes]
    q_emb = embed(query)
    ranked = sorted(candidates, key=lambda t: cosine(q_emb, t.embedding), reverse=True)
    return ranked[:k]
```

Then expose only the top-K to the LLM in the tool list.

## Fallback chains

```python
def call_with_fallback(tool_name, args):
    cur = registry.get(tool_name)
    while cur:
        try:
            return cur.invoke(args)
        except (ToolTimeout, ToolUnavailable):
            cur = registry.get(cur.fallback) if cur.fallback else None
    raise AllFallbacksExhausted(tool_name)
```

## Tool description rules

LLM picks tools from descriptions. Each must answer:
1. **Verb** — what action it performs
2. **When** — what triggers using it
3. **Returns** — shape of output
4. **Side effects** — what state changes
5. **Cost/latency hint** — "fast", "slow", "expensive"

Bad: `"Look up customer."`
Good: `"Fetch customer by email or ID. Read-only, ~50ms. Returns {id, name, tier, status}. Use when you need account details before any billing action."`

## Discovery from MCP

```python
from mcp.client import Client
async with Client("http://billing-mcp:8080") as c:
    tools = await c.list_tools()
    for t in tools:
        registry.add(ToolEntry(
            name=t.name, description=t.description, schema=t.inputSchema,
            embedding=embed(t.description), tags=infer_tags(t),
            cost_usd_per_call=0.0, p95_latency_ms=200,
            requires_scopes=set(), fallback=None,
        ))
```

## Further reading

- Anthropic tool-use best practices
- BFCL / Tool-Bench — router benchmarks (2026)
- MCP capability discovery (`mcp-server-design`)
- Fallback patterns (resilience4j, polly)
