---
name: typesense
description: >
  Stand up a self-hostable, typo-tolerant search environment with Typesense —
  the open-source Algolia / ElasticSearch alternative (single C++ binary,
  <50ms instant search, no runtime deps). One routing-first skill: pick a
  server mode (binary download, official Docker image, or managed Typesense
  Cloud), install an API client (Python/JS/PHP/Ruby official; Go/Dart/C#
  community), design a collection schema, index documents, and run searches
  with typo tolerance, faceting/filtering, geo-search, sorting, grouping,
  synonyms, curation, scoped API keys, and federated multi-search — then wire
  an InstantSearch.js UI and a Raft-based HA cluster for production. Use when
  the user wants to build or operate an installable search backend, add
  site/app/product search, or migrate off Algolia/Elasticsearch. Triggers on:
  typesense, search engine, typo-tolerant search, algolia alternative,
  elasticsearch alternative, instantsearch, faceted search, geo search,
  vector search, self-hosted search, site search, product search.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Cross-platform search-backend wrapper usable from Claude Code, Codex, Gemini
  CLI, and OpenCode. Wraps the upstream Typesense server (binary / Docker /
  Cloud) and official API clients. Routes LLM-trace/eval observability to
  `opik`/`langsmith`, agent-facing code search to `semble`, and broad service
  telemetry to `monitoring-observability`.
metadata:
  tags: typesense, search-engine, typo-tolerant, algolia-alternative, elasticsearch-alternative, instantsearch, faceted-search, geo-search, self-hosted, plugin
  platforms: Claude, Gemini, Codex, OpenCode, All
  keyword: typesense
  version: "1.0.0"
  upstream: https://github.com/typesense/typesense
  installer: docker run -p 8108:8108 -v /tmp/typesense-data:/data typesense/typesense --data-dir /data --api-key=xyz
  source: akillness/jeo-skills
---

# typesense — Installable Typo-Tolerant Search Environment

[Typesense](https://github.com/typesense/typesense) is a fast, typo-tolerant
open-source search engine — an Algolia alternative and an easier-to-use
ElasticSearch alternative. It is a **single C++ binary with no runtime
dependencies**, architected for low-latency (<50ms) instant search. This skill
is the routing-first wrapper: choose how to run the server, wire a client,
model the data, and drive search + UI + production hardening.

## When to use this skill

- The user wants to **stand up a search backend** for a site, app, catalog,
  docs, or product browsing experience
- The user asks to install/run Typesense (binary, Docker, or Typesense Cloud)
- The user wants **typo tolerance, faceting/filtering, geo-search, sorting,
  grouping, synonyms, curation, scoped API keys, or federated multi-search**
- The user wants to **migrate off Algolia or Elasticsearch** to a self-hosted
  or managed open-source engine
- The user wants an **InstantSearch.js UI** or a **Raft HA cluster** in front
  of / around Typesense

## When not to use this skill

- The user wants **LLM trace/eval observability** (hallucination, prompt
  scoring) → use `opik` / `langsmith`
- The user wants **token-efficient code search for agents** over a repo →
  use `semble`
- The user wants **generic service dashboards / uptime alerts** (non-search
  telemetry) → use `monitoring-observability`
- The user wants a **vector database** purpose-built for embeddings only —
  Typesense does vector + hybrid search, but a dedicated store may fit better
  for pure ANN at extreme scale; confirm the workload first

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Docker (recommended) | Simplest local + prod path via the official image |
| or a binary host | Linux (x86-64) / macOS binary packages from typesense.org/downloads |
| or Typesense Cloud | Zero-ops managed cluster (fixed hourly + bandwidth, not per-record) |
| An API client | Python / JS / PHP / Ruby official; Go / Dart / C# community |
| An API key | Set at server start (`--api-key`); generate scoped keys per tenant |

## Instructions

### Step 1 — Choose the server mode

| Mode | When | Entry point |
|------|------|-------------|
| **Docker** (recommended) | Local dev → prod, single command | `docker run typesense/typesense …` |
| **Binary** | Bare-metal / no Docker | Download from <https://typesense.org/downloads> |
| **Typesense Cloud** | Zero-ops managed, HA | <https://cloud.typesense.org> |

Local Docker server (pin a real version tag, set a strong key):

```bash
docker run -p 8108:8108 -v /tmp/typesense-data:/data \
  typesense/typesense:27.1 --data-dir /data --api-key=CHANGE_ME_STRONG_KEY
```

The skill ships [`scripts/install.sh`](scripts/install.sh) to start a local
Docker server and install the Python client in one shot.

### Step 2 — Install an API client

```bash
pip install typesense        # Python (official)
npm install typesense        # JS/TS (official)
# PHP: composer require typesense/typesense-php   Ruby: gem install typesense
```

Prefer an official client over raw CURL — they ship a smart retry strategy
for HA setups. See [`references/commands.md`](references/commands.md) for the
full client + integration matrix.

### Step 3 — Design the collection schema

A collection is an index with a typed schema. Mark fields `facet: true` to
filter/drill-down, and set `default_sorting_field` for ranking:

```python
import typesense
client = typesense.Client({
    "api_key": "CHANGE_ME_STRONG_KEY",
    "nodes": [{"host": "localhost", "port": "8108", "protocol": "http"}],
    "connection_timeout_seconds": 2,
})
client.collections.create({
    "name": "companies",
    "fields": [
        {"name": "company_name", "type": "string"},
        {"name": "num_employees", "type": "int32"},
        {"name": "country", "type": "string", "facet": True},
    ],
    "default_sorting_field": "num_employees",
})
```

Unlike Algolia, most settings (searchable fields, facets, ranking) are set at
**query time**, so one collection serves many sort orders — less memory, more
flexibility.

### Step 4 — Index documents

```python
client.collections["companies"].documents.create({
    "id": "124", "company_name": "Stark Industries",
    "num_employees": 5215, "country": "USA",
})
# Bulk import (JSONL) for large datasets:
# client.collections["companies"].documents.import_(jsonl_lines, {"action": "upsert"})
```

### Step 5 — Search (typo tolerance + facets + filters + geo)

```python
client.collections["companies"].documents.search({
    "q": "stork",                       # typo of "stark" — handled out of the box
    "query_by": "company_name",
    "filter_by": "num_employees:>100",
    "sort_by": "num_employees:desc",
    "facet_by": "country",
})
```

Capabilities to reach for: faceting/filtering, geo-search (sort by distance),
grouping & distinct, synonyms, curation/merchandizing (pin records),
federated **multi-search** across collections in one request, and vector /
hybrid search. Details in [`references/commands.md`](references/commands.md).

### Step 6 — Search UI + production

- **UI**: the [InstantSearch.js adapter](https://github.com/typesense/typesense-instantsearch-adapter)
  gives filtering, sorting, pagination, and as-you-type UI fast.
- **Multi-tenant**: generate **scoped API keys** that restrict access to
  certain records — never ship the admin key to the client.
- **HA**: run a **Raft-based cluster** (typically 3 nodes) for high
  availability; upgrades are a binary swap + restart.

### Step 7 — Plugin-style installation alongside jeo-skills

This skill folder is plugin-installable through the standard jeo-skills
flow so the wrapper, references, and installer land on disk for any supported
agent runtime:

```bash
# Project install (writes into .agents/skills/typesense/)
npx skills add https://github.com/akillness/jeo-skills --skill typesense

# Global install for every detected agent
npx skills add -g https://github.com/akillness/jeo-skills --skill typesense

# Target specific agents
npx skills add -g https://github.com/akillness/jeo-skills --skill typesense -a claude-code -a codex -y
```

## Output format

When the user asks `typesense` for help, return a compact brief:

```markdown
# typesense Routing Brief

## Scope
- Server mode: docker | binary | cloud | undecided
- Client: python | js | php | ruby | community
- Stage: install-server | install-client | schema-design | index | search | ui | production-ha

## Recommended next move
- start-docker-server | install-client | create-collection | import-docs | run-search | wire-instantsearch | scoped-keys | cluster

## Why
- 2-3 bullets grounded in the user's packet

## Route-outs
- `opik` / `langsmith` for LLM trace/eval observability
- `semble` for agent-facing code search over a repo
- `monitoring-observability` for non-search service telemetry
```

## Best practices

1. **Pin a version tag, never `latest`** — `typesense/typesense:27.1`, and
   keep the data dir on a real volume so restarts don't lose the index.
2. **Set settings at query time** — searchable fields, facets, sort, and
   ranking are per-query; you rarely need multiple collections for sort orders.
3. **Mark facets in the schema** — `facet: true` is required for filtering /
   drill-down on a field.
4. **Use scoped API keys for clients** — the admin key stays server-side;
   scoped keys enforce per-tenant record access.
5. **Bulk import as JSONL with `upsert`** — far faster than per-document
   creates for large datasets; size RAM to the index (memory-resident).
6. **License awareness** — the **server is GPL**, the **client libraries are
   Apache-2.0**; run the server as a separate daemon (the intended use).

## References

- Upstream repo: <https://github.com/typesense/typesense>
- API docs: <https://typesense.org/api>
- Guide / walk-through: <https://typesense.org/guide>
- Downloads (binary): <https://typesense.org/downloads>
- Docker image: <https://hub.docker.com/r/typesense/typesense>
- Typesense Cloud: <https://cloud.typesense.org>
- InstantSearch adapter: <https://github.com/typesense/typesense-instantsearch-adapter>
- Installer script: [`scripts/install.sh`](scripts/install.sh)
- Client + integration matrix: [`references/commands.md`](references/commands.md)
- Adjacent skills: `../opik/SKILL.md`, `../semble/SKILL.md`,
  `../monitoring-observability/SKILL.md`
- License: GPL-3.0 (server); API clients Apache-2.0
