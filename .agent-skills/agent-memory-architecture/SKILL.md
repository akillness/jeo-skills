---
name: agent-memory-architecture
description: Design tiered agent memory — core / recall / archival — with backend selection (mem0, Letta, Zep/Graphiti, LangMem) and temporal vs snapshot tradeoffs. Use when an agent needs persistent context across sessions, personalization, or temporal knowledge graphs.
---

# Agent Memory Architecture

## Overview

Conversation history ≠ memory. Production agents need tiered stores: hot in-context, warm vector recall, cold archival, plus temporal knowledge graphs for facts that change over time. This skill picks the backend and tier layout.

## When to use

- Agent needs to remember user preferences across sessions
- Multi-session task continuity (Ralph, long-running research)
- Personalization that survives restarts
- Multi-tenant agents with strict isolation
- Facts change over time (price, status, relationships) → temporal KG needed

## Backend selection

| Backend | Strength | Pick when |
|---------|----------|-----------|
| **mem0** | Self-improving, fact extraction, OSS | Personalization, conversational memory |
| **Letta** (MemGPT) | OS-style tiered memory, persistence | Agent-as-process, long-lived agents |
| **Zep / Graphiti** | Temporal knowledge graph, bi-temporal | Facts change over time, need history |
| **LangMem** | LangGraph-native, simple | Already on LangGraph, no extra service |
| **Postgres + pgvector** | Roll your own, full control | Compliance / on-prem requirements |

## Tier design

```
┌─────────────────────────────────────────────┐
│  Core (in context)      — identity, rules   │  <2k tokens
├─────────────────────────────────────────────┤
│  Recall (vector search) — last N sessions   │  100k+ items
├─────────────────────────────────────────────┤
│  Archival (cold store)  — full history      │  unbounded
└─────────────────────────────────────────────┘
```

**Promotion rule**: archival → recall on retrieval; recall → core on repeated use.
**Eviction rule**: core → recall on token pressure; recall → archival on staleness.

## Temporal vs snapshot

- **Snapshot**: latest value wins (mem0 default). Simple, loses history.
- **Temporal (bi-temporal)**: every fact has `valid_from`, `valid_to`, `recorded_at`. Required when "what did the agent believe yesterday?" matters.

Graphiti / Zep give you bi-temporal out of the box. Hand-rolled needs `(entity, relation, value, t_valid_start, t_valid_end, t_recorded)` tuples.

## Privacy patterns

- Per-tenant memory namespace, never share embeddings across users
- PII detection (Presidio) before embedding
- TTL on recall tier (e.g. 90 days), explicit retention for archival
- User-initiated forget: hard-delete from all tiers + reindex

## Quick start — mem0

```python
from mem0 import Memory
m = Memory()
m.add("User prefers concise answers in Korean.", user_id="jeo")
results = m.search("language preference", user_id="jeo")
```

## Quick start — Graphiti (temporal)

```python
from graphiti_core import Graphiti
g = Graphiti(neo4j_uri, neo4j_user, neo4j_pwd)
await g.add_episode(name="session_1", episode_body="User joined Acme Corp 2026-03-01", reference_time=datetime.now())
nodes = await g.search("where does the user work?")
```

## Further reading

- mem0 — fact extraction, semantic search
- Letta (MemGPT) — OS-style memory blocks
- Graphiti / Zep — bi-temporal knowledge graph
- LangMem — LangGraph-native memory primitives
