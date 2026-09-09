# zvec-grep command map

This reference is pinned to the published npm package `@zvec/zvec-grep@0.2.2`.
Use `zg help` on the installed binary before copying a command. GitHub `main`
currently documents a different unreleased command shape, so it is not the syntax
source for this pinned package.

## Install and inspect

```bash
node --version
npm install -g @zvec/zvec-grep@0.2.2
zg version
zg help
zg help query
zg help models
zg help file-types
zg help environment
```

The published package uses subcommands:

| Job | Command | Notes |
| --- | --- | --- |
| Search | `zg query <query>` | Hybrid indexed search; an absent index may be created locally |
| Exact or regex search | `zg query --rg <rg-options> <pattern> [path...]` | No index required; managed output is intentionally compact |
| Build or update index | `zg index [root] [options]` | Persistent state under `<root>/.zvec-grep/` |
| Inspect status | `zg status [root]` | Add `--check-ready` for a script-friendly readiness exit |
| Configure model | `zg config model set <model> ...` | Global config under `~/.zvec-grep/config.json` |
| Configure provider | `zg config provider set <provider> --api-key <key>` | Keep the key in an environment variable |
| Manage data grant | `zg auth grant/status/revoke ...` | Separate from provider credentials |
| Manage daemon | `zg server on/off/status/run ...` | Loopback server, default port 7999 |
| Install integration | `zg install --target <agent> --yes` | Writes managed config blocks and may start the server |
| Remove integration | `zg uninstall --target <agent> --yes` | Removes only zvec-grep-managed blocks |

Use the published 0.2.2 subcommands. Do not copy long action flags such as
`zg --index` or `zg --install` from moving GitHub `main` documentation into this
pinned package workflow.

## Search routes

```bash
zg query "where theme preferences are restored"
zg query --fts "loadTheme" -g 'src/**' -t ts
zg query --vector "where credentials are validated" --limit 5
zg query --hybrid "authentication flow" --fts "ForbiddenError" --fuse
zg query --rg -n -F "AuthService" src
```

Use `--limit` to cap each indexed query group. `--preview short|full`,
`--compact`, `--debug`, `--trace`, `--refresh background|wait|off`, and
`--mode auto|server|direct` control output, diagnostics, refresh, and transport.
For exact or exhaustive lookup use native `rg` or `zg query --rg`, not `--fts` alone.

## Indexing and scope

```bash
zg index \
  --embedding local/potion-code-16m-v2 \
  -g 'src/**' -g 'docs/**' -g '!dist/**' -t ts
zg status --check-ready
zg index
zg index --rebuild --embedding local/jina-embeddings-v2-base-code
zg index --drop --yes
```

Useful file controls are `--glob`, `--iglob`, `--type`, `--type-not`, `--hidden`,
`--no-ignore`, `--ignore-file`, `--max-depth`, `--max-filesize`, and `--follow`.
Changing the model or remote endpoint requires an explicit rebuild. `--drop`
permanently removes the workspace index and is never an implicit repair step.

## Agent integration targets

The current target ids are `codex`, `claude`, `qwen`, `qoder`, `opencode`, and
`cursor`; `all` and `auto` are also accepted. `qoder` covers Qoder CLI and Qoder
IDE. The default MCP toolset is `agent`; use `--mcp-toolset full` only when the
optional rg and administrative tools are needed.

```bash
zg install --target claude --yes
zg install --target codex --yes
zg install --target qoder --yes
zg install --target all --yes
zg uninstall --target claude --yes
```

Inspect an unmanaged existing `zvec_grep` entry before adding `--force`. Restart
the selected agent or open a new session after installation.

## Server and environment

```bash
zg server on
zg server status --check-ready
zg server off
zg server run --listen 127.0.0.1:7999
```

Important variables:

- `ZVEC_GREP_HOME` - daemon and runtime state directory.
- `ZVEC_GREP_MODE` - default `direct`, `server`, or `auto` mode.
- `ZVEC_GREP_SERVER_URL` - MCP URL override.
- `ZVEC_GREP_SERVER_TOKEN` or `ZVEC_GREP_SERVER_TOKEN_FILE` - optional Bearer auth.
- `ZVEC_GREP_MCP_TOOLSET` - `agent` or `full` MCP surface.
- `ZVEC_GREP_EMBEDDING` - model default for new indexes.
- `ZVEC_GREP_API_KEY`, `ZVEC_GREP_ENDPOINT`, `ZVEC_GREP_DEVICE` - embedding runtime settings.
- `ZVEC_GREP_MODEL_CACHE` - local model cache.

Never print the values of token, key, endpoint, query, or authorization variables.
