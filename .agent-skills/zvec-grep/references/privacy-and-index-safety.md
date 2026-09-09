# zvec-grep privacy and index safety

## State locations

- Workspace index: `<workspace>/.zvec-grep/`.
- Global config and model cache: `~/.zvec-grep/` by default.
- Daemon log: `~/.zvec-grep/daemon/logs/server.log` by default.
- Optional authorization record: `<workspace>/.zvec-grep/authorization.json`.

Treat index files, manifests, logs, cache files, and authorization records as
local generated state. Do not commit, upload, copy, or attach them unless the
user explicitly asks for an audit of that state.

## Local versus remote embedding

| Mode | Data boundary | Approval rule |
| --- | --- | --- |
| Local embedding | Workspace text and query stay on the machine; model artifacts download to the local cache | Still disclose the model download and cache path when relevant |
| Remote embedding | Query or workspace content may be sent to the configured provider and endpoint | Explicit per-command `--allow-remote` or persistent workspace grant after user approval |
| MCP tool approval | Allows calls to the local zvec-grep server | Never treat it as remote data consent |

Provider credentials configure access only. They do not authorize data transfer.
Do not put API keys, Bearer tokens, or raw query text into logs, tickets, skill
evals, or completion reports.

## Persistent operations

The following operations can create or change persistent state and need an
explicit user-visible decision:

- `zg index` creates or updates a workspace index.
- `zg index --rebuild` replaces the vector index and can download a model.
- `zg index --drop --yes` permanently deletes the index.
- `zg server on` starts a background daemon.
- `zg install` edits agent configuration and can start the daemon.
- `zg auth grant --scope workspace` persists remote-embedding authorization.

Read-only checks include `zg help`, `zg version`, `zg status`,
`zg server status`, and `zg query --rg`.

## Evidence discipline

Semantic results are ranked samples. They do not prove absence, every
occurrence, or an exact count. For a claim that needs exact evidence:

1. Use the smallest semantic probe only to find candidate files or concepts.
2. Follow with native `rg`, `zg query --rg`, or a direct file read.
3. Record the root, route, scope, freshness, and model class.
4. Report truncation, skipped files, stale status, or remote routing when they
   affect the conclusion.
