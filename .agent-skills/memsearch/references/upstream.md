# memsearch: pinned upstream evidence

Observed 2026-10-15. Repository: [zilliztech/memsearch](https://github.com/zilliztech/memsearch/tree/09e07d86b31ff81938b4f44a57099b6a9fc8723f), commit `09e07d86b31ff81938b4f44a57099b6a9fc8723f`. GitHub API metadata and the full root `LICENSE` indicate MIT. This independent guide contains no copied upstream implementation.

## Data model and operations

README describes cross-platform agent memory backed by Markdown and Milvus. Markdown files are the source of truth and Milvus is a derived, rebuildable search index. The CLI docs list `index`, `search`, `expand`, `transcript`, `watch`, `compact`, `stats`, `config` and `reset`; `reset` drops indexed data from the Milvus collection, not the canonical Markdown files. Confirm the actual collection and state path before indexing or reset. A plugin install can enable conversation capture and background memory maintenance, so it changes privacy/data-flow behavior rather than just adding a command.

The config source sets an OpenAI embedding provider default, while source code supports multiple remote and local embedding options. Global TOML may contain model endpoints/credentials. Project `.memsearch.toml` is deliberately allowlisted to low-risk local indexing parameters; it cannot redirect endpoint, credentials, LLM routing, prompt files, plugin automation or model downloads. New wizard files may add `.gitignore` discovery, but existing config is not rewritten during upgrade. Never assume an existing project config has these defaults. Provider calls, local model downloads and LLM-driven `compact` may disclose content or incur compute/provider cost.

## Safe route

Use when the request names the zilliztech/memsearch CLI, plugin, Markdown memory layout or Milvus index. Route a general agent memory-backend choice to `agent-memory-architecture`; route a different memory product to its own operator. Inspect storage/config roots and capture hooks before enabling. Require explicit approval before plugin/CLI installation, downloads, capture hooks, indexing/watch service, provider/model calls, `compact`, or `reset`. For reset/delete, confirm collection, preserve Markdown and make a backup when appropriate.

The source map captures README, complete MIT license, package metadata, CLI/config docs and implementation of CLI, config and storage. See [`source.json`](source.json) for pinned URLs and per-file raw-byte hashes.
