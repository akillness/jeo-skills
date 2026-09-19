---
name: a2a-protocol
description: Agent-to-Agent horizontal messaging — Linux Foundation AAIF 2026 standard. Use when multiple agents across systems/vendors need to exchange tasks, results, or capabilities without sharing a runtime.
---

# A2A Protocol

## Overview

MCP exposes *tools* to an agent. A2A connects *agents* to *agents*. The 2026 Linux Foundation AAIF specification standardizes capability cards, task envelopes, and the negotiation handshake — so a Claude agent can hand work to a Codex agent (or a third-party vendor agent) without bespoke glue.

## When to use

- Two agents need to collaborate across runtime/vendor boundaries
- You're tired of writing custom HTTP wrappers between agent systems
- Cross-org agent collaboration (your billing agent ↔ vendor support agent)
- Mesh / federated agent systems

## Don't use when

- Both agents share a runtime (just call a function or use orchestrator)
- One-direction tool call → use MCP (`mcp-server-design`)

## Core concepts

| Concept | What |
|---------|------|
| **Agent Card** | Public manifest — capabilities, endpoint, auth, SLAs |
| **Task Envelope** | Job description + inputs + budget + deadline |
| **Artifact** | Typed output a task produces |
| **Stream** | Long-running task progress channel (SSE) |
| **Negotiation** | Optional capability/SLA agreement before send |

## Agent Card example

```json
{
  "name": "acme-research-agent",
  "version": "0.4.1",
  "endpoint": "https://agents.acme.com/research/a2a",
  "auth": {"type": "oauth2", "scopes": ["a2a:invoke"]},
  "skills": [
    {
      "name": "summarize_url",
      "input_schema": {"type": "object", "properties": {"url": {"type": "string"}}},
      "output_schema": {"type": "object", "properties": {"summary": {"type": "string"}}},
      "max_cost_usd": 0.5,
      "max_latency_s": 30
    }
  ],
  "transports": ["streamable-http", "websocket"]
}
```

## Sending a task

```python
from a2a.client import A2AClient
client = A2AClient(card_url="https://agents.acme.com/research/.well-known/agent-card.json")

task = await client.send_task(
    skill="summarize_url",
    inputs={"url": "https://example.com/paper"},
    budget={"max_cost_usd": 0.3, "deadline_s": 20},
)
async for event in task.stream():
    if event.type == "artifact":
        print(event.artifact.summary)
    elif event.type == "status":
        print(event.status)
```

## Server side

```python
from a2a.server import A2AServer, skill

class ResearchAgent(A2AServer):
    @skill(name="summarize_url", max_cost_usd=0.5, max_latency_s=30)
    async def summarize(self, url: str) -> dict:
        page = await fetch(url)
        return {"summary": await llm.summarize(page)}

ResearchAgent().serve(port=8080)
```

## Negotiation handshake

Before sending heavy tasks, negotiate:

```
Client → Server: capability inquiry + budget
Server → Client: accept | counter | reject (with reason)
Client → Server: send task (if accepted)
```

Use when SLAs matter or pricing varies.

## Discovery

- Well-known path: `/.well-known/agent-card.json`
- Federated registry (2026 spec): `registry.a2aproject.io`
- Local mesh: mDNS service `_a2a._tcp`

## Security

- All transport over TLS, mutual auth recommended
- Per-skill scopes (don't grant blanket "invoke any skill")
- Verify Agent Card signature against publisher key
- Budget caps enforced server-side, not just client-claimed
- Treat received artifacts as untrusted input → run through `agent-guardrails`

## Common pitfalls

- Don't tunnel arbitrary MCP through A2A — they're different layers
- Don't share session/memory across A2A boundary; pass explicit context
- Don't skip the deadline — long-running needs streaming, not blocking

## Further reading

- Linux Foundation AAIF 2026 spec
- Google A2A Project reference implementation
- A2A vs MCP — `a2a` connects agents, `mcp` exposes tools
