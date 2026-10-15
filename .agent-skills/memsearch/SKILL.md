---
name: "memsearch"
description: "Operate zilliztech/memsearch, the Markdown-canonical agent memory tool with a Milvus search index: CLI, platform plugins, config, indexing, recall and reset. Use when a request names this exact project. For neutral memory-backend choices use agent-memory-architecture; for other memory products use their operator."
allowed-tools: Bash Read Grep Glob
compatibility: "Exact-repository guidance pinned in references/source.json. Offline preflight checks selected source hashes and PATH command names only; it does not verify versions, provider access, plugin activation, Milvus readiness or runtime behavior."
metadata:
  version: "1.0.0"
  source: "https://github.com/zilliztech/memsearch"
  upstream_commit: "09e07d86b31ff81938b4f44a57099b6a9fc8723f"
---

# memsearch

Use for the named Markdown-plus-Milvus memory project. Read [pinned source facts](references/upstream.md) before enabling capture, indexing or reset.

## Instructions

1. Confirm the repo/commit against [`references/source.json`](references/source.json). For a checkout, from repo root run `python3 .agent-skills/memsearch/scripts/preflight.py --repo /absolute/nonsymlink/checkout --json`; `--repo` must be an explicit absolute nonsymlink directory. For installed skill-root inventory, from that skill directory run `python3 scripts/preflight.py --json`. This standalone stdlib helper requires Python 3.10+ on POSIX (macOS/Linux; use WSL2 on Windows because native Windows fails closed) and makes no subprocess/network calls, writes, or secret reads. It compares SHA-256 of selected pinned files and checks PATH command-name presence only (not versions); it never compares Git HEAD/the whole revision or verifies runtime. Exit 0 means valid input and selected-file checks pass (command presence is informational); 1 means a selected file is missing/mismatched; 2 means bad input. Without `--repo`, it reports unverified inventory.
2. Inspect current Markdown root, Milvus URI/collection, config precedence and plugin capture state. Preserve Markdown as canonical data; treat Milvus as derived index.
3. Choose exactly one operation. `index`, `watch`, plugin capture, `compact`, local model fetch and `reset` have distinct data/provider effects. Do not run a destructive or background operation as a diagnostic.
4. Require explicit approval before installation/plugin hooks, network/model downloads, enabling capture/watch, indexing or writing memory, remote embedding/LLM calls, `compact`, or deleting/resetting indexed data. Confirm target files, provider, cost and collection. Protect private TOML and never print secrets.
5. Verify by inspecting resulting state only after authorized action. State separately whether Markdown changed, index changed, provider was contacted, and hooks/service were activated.

## Examples

- “Explain how memsearch separates Markdown memory from its Milvus index.”
- “Index this private notes folder with remote embeddings.” Pause for approval of data, provider and cost.
- “Reset the Milvus collection.” Confirm exact URI/collection and explicit destructive approval; leave Markdown intact.

## Best practices

- Keep canonical memory files and the derived vector index separate in reports and backups.
- Treat plugin capture and watchers as ongoing data collection, not a passive install.
- Project config is intentionally restricted; use the global config for endpoint/credentials only with care.
- Preflight proves file-pin integrity only, not index freshness or retrieval quality.

## References

- [Pinned data/config/operation facts](references/upstream.md)
- [Source manifest and hashes](references/source.json)
- [Offline preflight contract](scripts/preflight.py) (added by repository maintainer)
- [Agent-memory architecture](../agent-memory-architecture/SKILL.md) for vendor-neutral choices.

- [Authored routing and boundary scenarios](evals/evals.json), not executed model-quality results.
