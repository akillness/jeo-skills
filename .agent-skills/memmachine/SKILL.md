---
name: "memmachine"
description: "Operate MemMachine/MemMachine, the agent long-term memory server, Python/TypeScript clients and MCP integration. Use when a task names this exact repository, its server, memory APIs, deployment or MCP tools. For general memory architecture selection use agent-memory-architecture; for generic MCP design use mcp-builder."
allowed-tools: Bash Read Grep Glob
compatibility: "Exact-repository guidance pinned in references/source.json. Offline preflight checks selected source hashes and command presence on PATH only; it does not establish installation, service health, MCP readiness or provider authorization."
metadata:
  version: "1.0.0"
  source: "https://github.com/MemMachine/MemMachine"
  upstream_commit: "d5a39a8e774e977fb1e6c22efb03555c4e51e05e"
---

# MemMachine

Use for the named long-term memory service and its integrations, not as a generic memory framework. Read [pinned evidence](references/upstream.md) before making setup or capability claims.

## Instructions

1. Confirm the repo/commit against [`references/source.json`](references/source.json). For a checkout, from repo root run `python3 .agent-skills/memmachine/scripts/preflight.py --repo /absolute/nonsymlink/checkout --json`; `--repo` must be an explicit absolute nonsymlink directory. For installed skill-root inventory, from that skill directory run `python3 scripts/preflight.py --json`. This standalone stdlib helper requires Python 3.10+ on POSIX (macOS/Linux; use WSL2 on Windows because native Windows fails closed) and makes no subprocess/network calls, writes, or secret reads. It compares SHA-256 of selected pinned files and checks PATH command-name presence only (not versions); it never compares Git HEAD/the whole revision or verifies runtime. Exit 0 means valid input and selected-file checks pass (command presence is informational); 1 means a selected file is missing/mismatched; 2 means bad input. Without `--repo`, it reports unverified inventory.
2. Identify the chosen surface: client SDK, local server, HTTP/MCP, or hosted platform. Inspect actual deployment config and organization/project scope. The SDK requires a running server; an install is not a functioning memory service.
3. Read pinned MCP source for the actual operations. Treat `add`/write and `delete` as mutations. Resolve project/org/session target before any memory change.
4. Require explicit approval before install/download, multi-service startup, service exposure, MCP registration, external/hosted connection or provider calls, memory writes/deletes, schema migration, or persistent configuration changes. Verify exactly which data and destination are in scope.
5. Report what was merely inspected versus actually started/connected, whether a remote service/provider was involved, and whether any memory or database data changed. Do not claim success from source inspection.

## Examples

- “Inspect MemMachine’s stdio and HTTP MCP entrypoints without starting them.”
- “Add this memory to my hosted MemMachine project.” Stop for approval of data, endpoint, target scope and write.
- “Delete all memories for project X.” Resolve project identity and confirm destructive authorization before acting.

## Best practices

- Keep the SDK, server, transport and hosted service distinct.
- Treat tool names and upstream docs as leads; verify actual pinned code and config.
- Minimize memory exposure and never print API tokens or private memory payloads.
- The helper validates selected source bytes, not runtime connectivity, data correctness, authorization or security posture.

## References

- [Pinned runtime/transport facts and approval gates](references/upstream.md)
- [Source manifest and hashes](references/source.json)
- [Offline preflight contract](scripts/preflight.py) (added by repository maintainer)
- [Agent-memory architecture](../agent-memory-architecture/SKILL.md), [MCP server design](../mcp-builder/SKILL.md).

- [Authored routing and boundary scenarios](evals/evals.json), not executed model-quality results.
