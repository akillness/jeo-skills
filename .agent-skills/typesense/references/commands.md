# typesense command + client reference

Upstream: <https://github.com/typesense/typesense> · API docs: <https://typesense.org/api>

## Server (run modes)

| Command | Purpose |
|---------|---------|
| `docker run -p 8108:8108 -v /tmp/typesense-data:/data typesense/typesense:27.1 --data-dir /data --api-key=KEY` | Local/prod Docker server (pin a tag; mount a real volume) |
| binary from <https://typesense.org/downloads> | Bare-metal (Linux x86-64 / macOS), single self-contained binary |
| <https://cloud.typesense.org> | Managed HA cluster (fixed hourly + bandwidth, not per-record) |
| `curl http://localhost:8108/health` | Liveness check |
| `curl -H "X-TYPESENSE-API-KEY: KEY" http://localhost:8108/debug` | Version / node debug |

Build from source (Docker): `TYPESENSE_VERSION=nightly ./docker-build.sh --build-deploy-image --create-binary`.

## API clients

| Language | Install | Status |
|----------|---------|--------|
| Python | `pip install typesense` | official |
| JS / TS | `npm install typesense` | official |
| PHP | `composer require typesense/typesense-php` | official |
| Ruby | `gem install typesense` | official |
| Go | `github.com/typesense/typesense-go` | community |
| Dart | `typesense` (pub) | community |
| C# / .NET | `DAXGRID/typesense-dotnet` | community |
| Laravel Scout | `devloopsnet/laravel-scout-typesense-engine` | community |
| Symfony | `acseo/TypesenseBundle` | community |

Official clients ship a smart retry strategy for HA; prefer them over raw CURL.

## Core API surface

| Operation | Python example |
|-----------|----------------|
| Create collection | `client.collections.create({"name": "...", "fields": [...], "default_sorting_field": "..."})` |
| Index one doc | `client.collections["c"].documents.create(doc)` |
| Bulk import (JSONL) | `client.collections["c"].documents.import_(lines, {"action": "upsert"})` |
| Search | `client.collections["c"].documents.search({"q": "...", "query_by": "...", ...})` |
| Multi-search (federated) | `client.multi_search.perform({"searches": [...]}, common_params)` |
| Scoped API key | `client.keys.generate_scoped_search_key(parent_key, {"filter_by": "tenant:acme"})` |
| Delete by filter | `client.collections["c"].documents.delete({"filter_by": "num:<100"})` |

## Search parameters (selected)

| Param | Purpose |
|-------|---------|
| `q`, `query_by` | Query text + fields to search (typo tolerance is automatic) |
| `filter_by` | `num_employees:>100 && country:USA` |
| `sort_by` | `num_employees:desc`, `_text_match:desc`, geo `location(lat,lng):asc` |
| `facet_by` | Fields to return facet counts for (must be `facet: true` in schema) |
| `group_by` / `group_limit` | Group + distinct results |
| `num_typos` | Tune typo tolerance per query |
| `vector_query` | Vector / hybrid (kNN) search on a `float[]` field |
| `query_by_weights` | Per-field ranking weights |

## Feature map

Typo tolerance · faceting & filtering · sorting (query-time) · grouping &
distinct · federated multi-search · geo search · vector + hybrid search ·
scoped API keys (multi-tenant) · synonyms · curation / merchandizing (pinned
hits) · Raft-based clustering (HA) · seamless version upgrades (binary swap) ·
no runtime dependencies.

## Search UI

InstantSearch.js adapter: <https://github.com/typesense/typesense-instantsearch-adapter>
— filtering, sorting, pagination, as-you-type UI on top of Typesense.

## Operations notes

- **Memory-resident index**: size RAM to the dataset (rough: 1M HN titles ≈
  165 MB). A fresh server ≈ 30 MB.
- **HA**: 3-node Raft cluster typical; upgrades swap the binary + restart.
- **Licensing**: server is GPL-3.0; client libraries are Apache-2.0 — run the
  server as a standalone daemon (intended use).
