---
name: "agentic-graphrag-blueprint"
description: "Operate the sebastianbrzustowicz/Agentic-GraphRAG-Blueprint repository: inspect its FastAPI/React GraphRAG implementation, local Compose stack, ingestion, graph/vector stores and Azure Terraform reference. Use when a task names this exact project or its code. For general memory architecture choices use agent-memory-architecture; for symbol lookup use codebase-search."
allowed-tools: Bash Read Grep Glob
compatibility: "Exact-repository operator guidance, source-pinned to the upstream commit in references/source.json. A read-only preflight checks selected file bytes and local PATH command presence only; it does not establish runtime readiness."
metadata:
  version: "1.0.0"
  source: "https://github.com/sebastianbrzustowicz/Agentic-GraphRAG-Blueprint"
  upstream_commit: "e33f5f690e3b22efbf4f89d5c273a575699dd6ec"
---

# Agentic GraphRAG Blueprint

Use this skill for the named repository, not as a generic GraphRAG implementation guide. Its pinned source evidence and limitations are in [references/upstream.md](references/upstream.md).

## Instructions

1. Confirm the repo/commit against [`references/source.json`](references/source.json). For a checkout, from repo root run `python3 .agent-skills/agentic-graphrag-blueprint/scripts/preflight.py --repo /absolute/nonsymlink/checkout --json`; `--repo` must be an explicit absolute nonsymlink directory. For installed skill-root inventory, from that skill directory run `python3 scripts/preflight.py --json`. This standalone stdlib helper requires Python 3.10+ on POSIX (macOS/Linux; use WSL2 on Windows because native Windows fails closed) and makes no subprocess/network calls, writes, or secret reads. It compares SHA-256 of selected pinned files and checks PATH command-name presence only (not versions); it never compares Git HEAD/the whole revision or verifies runtime. Exit 0 means valid input and selected-file checks pass (command presence is informational); 1 means a selected file is missing/mismatched; 2 means bad input. Without `--repo`, it reports unverified inventory.
2. Route the request: inspect retrieval/ingestion or local Compose; inspect Azure/Terraform only when the user asks about cloud deployment; otherwise route general memory system selection to `agent-memory-architecture`. Read the exact commit-pinned source before stating capability.
3. Keep local and cloud lanes separate. Compose uses `.env`, exposes 8000/5173 and mounts document/index paths. The README's Azure architecture is not proof that local Compose creates Azure resources or that the current checkout is deployment-ready.
4. Before installing/downloading, starting services, uploading documents, using a model provider or incurring cost, provisioning cloud infrastructure, or mutating/resetting graph/vector/session data, require approval for that exact action and destination. Inspect `FORCE_RESET` and target paths first; do not print secret values.
5. Report the exact revision, files inspected, actions actually run, whether data stayed local, any provider/cost exposure, and what was not runtime-verified.

## Examples

- “Inspect this checkout’s GraphRAG ingestion flow without running it.”
- “Would this repository’s Compose file start the Azure deployment?” Distinguish local containers from the Terraform/Azure reference.
- “Run ingestion on my documents.” Pause for approval of the document set, provider, cost, and write destination.

## Best practices

- Treat graph/vector store abstractions as extension seams, not evidence every backend is implemented.
- Start with read-only code/config inspection; do not invoke ingestion as a diagnostic.
- Keep provider endpoints, keys, document contents and `.env` values out of logs and reports.
- The preflight verifies selected source-file hashes only; never call it a runtime test.

## References

- [Pinned upstream findings and operational limits](references/upstream.md)
- [Pinned source manifest and SHA-256 evidence](references/source.json)
- [Offline preflight contract](scripts/preflight.py) (added by the repository maintainer)
- [Agent-memory architecture](../agent-memory-architecture/SKILL.md) and [codebase search](../codebase-search/SKILL.md) for adjacent jobs.

- [Authored routing and boundary scenarios](evals/evals.json), not executed model-quality results.
