---
name: "memori"
description: "Operate MemoriLabs/Memori, its agent-memory SDKs, cloud/BYODB modes, runtime configuration and SQL storage integration. Use when the task names this exact project or its code. For product-neutral memory architecture decisions use agent-memory-architecture; route framework-specific agent work to its owner."
allowed-tools: Bash Read Grep Glob
compatibility: "Exact-repository guidance pinned in references/source.json. Offline preflight verifies selected files and PATH command presence only; it does not establish SDK installation, cloud/local mode, database readiness, or runtime behavior."
metadata:
  version: "1.0.0"
  source: "https://github.com/MemoriLabs/Memori"
  upstream_commit: "574b1ea3e876f100ef82c37817d603eb7e258e59"
---

# Memori

Use this operator for MemoriLabs/Memori specifically. Read [pinned source findings](references/upstream.md) before recommending cloud, local or database setup.

## Instructions

1. Confirm the repo/commit against [`references/source.json`](references/source.json). For a checkout, from repo root run `python3 .agent-skills/memori/scripts/preflight.py --repo /absolute/nonsymlink/checkout --json`; `--repo` must be an explicit absolute nonsymlink directory. For installed skill-root inventory, from that skill directory run `python3 scripts/preflight.py --json`. This standalone stdlib helper requires Python 3.10+ on POSIX (macOS/Linux; use WSL2 on Windows because native Windows fails closed) and makes no subprocess/network calls, writes, or secret reads. It compares SHA-256 of selected pinned files and checks PATH command-name presence only (not versions); it never compares Git HEAD/the whole revision or verifies runtime. Exit 0 means valid input and selected-file checks pass (command presence is informational); 1 means a selected file is missing/mismatched; 2 means bad input. Without `--repo`, it reports unverified inventory.
2. Establish language package and actual mode from current config/code: cloud, local/BYODB, selected database and endpoint. Do not infer a default service or database from README.
3. Follow the specific package/runtime path. Distinguish SDK instrumentation from a separate managed cloud account and from storage provisioning. Inspect the exact database dialect and migration path before any persistence operation.
4. Require explicit approval before package installation, cloud/provider connection, conversation upload, paid request, memory/database write or delete, storage initialization/migration, and client/provider configuration. Approval must cover the data, exact endpoint/database and operation.
5. Report file-level license findings carefully: GitHub API says `NOASSERTION`, while the root license file is Apache 2.0. State the discrepancy rather than treating metadata as the license. Separate source inspection from live runtime verification.

## Examples

- “Trace how Memori handles cloud versus local memory, without sending requests.”
- “Connect this agent to Memori Cloud using my conversations.” Stop for approval of account, data transfer, provider and cost.
- “Migrate our PostgreSQL storage to the new schema.” Inspect migration plan first; obtain approval before database mutation.

## Best practices

- Read configuration and implementation before setting `cloud`, BYODB or storage values.
- A local writer/database backend is not proof that the target database exists or is ready.
- Keep tokens and conversation payloads private; log only safe metadata.
- Preflight hashes selected pinned files only; it is not an SDK, cloud or database test.

## References

- [Pinned architecture, mode and licensing evidence](references/upstream.md)
- [Source pin manifest and hashes](references/source.json)
- [Offline preflight contract](scripts/preflight.py) (added by repository maintainer)
- [Agent-memory architecture](../agent-memory-architecture/SKILL.md) for neutral backend selection.

- [Authored routing and boundary scenarios](evals/evals.json), not executed model-quality results.
