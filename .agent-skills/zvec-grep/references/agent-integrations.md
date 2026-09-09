# zvec-grep agent integrations

`zg install` manages a local MCP connection and selected agent guidance. This
reference is pinned to upstream commit `6fa85a8e28c0b5a0f651c27f09f0247627c5d5c3`.

## Supported targets

| Target | Managed surface | Expected search tool |
| --- | --- | --- |
| `codex` | `~/.codex/config.toml`, `~/.codex/AGENTS.md` | `zvec_grep_search` |
| `claude` | `~/.claude.json`, `~/.claude/settings.json`, `~/.claude/CLAUDE.md` | `zvec_grep_search` |
| `qwen` | `~/.qwen/settings.json`, `~/.qwen/QWEN.md` | `mcp__zvec_grep__zvec_grep_search` |
| `qoder` | Qoder CLI config and user-level IDE `mcp.json` | `mcp__zvec_grep__zvec_grep_search` or IDE-displayed tool |
| `opencode` | `~/.config/opencode/opencode.json`, adjacent `AGENTS.md` | `zvec_grep_zvec_grep_search` |
| `cursor` | `~/.cursor/mcp.json` | client-specific MCP label |

The current installer accepts `all` and `auto` in addition to these target ids.
Environment overrides include `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `QWEN_HOME`,
`QODER_CONFIG_DIR`, `QODER_IDE_MCP_PATH`, `QODER_IDE_EXECUTABLE`,
`OPENCODE_CONFIG`, and `CURSOR_CONFIG_DIR`.

## Safe installation sequence

1. Confirm `zg version` and `zg help` first.
2. Inspect the target's current MCP entry and settings if an existing
   `zvec_grep` name is present.
3. Install only the requested target with the current long-option syntax.
4. Check the local server and the managed files.
5. Restart the client or open a new session.
6. Verify that the expected search tool is visible.

```bash
zg install --target claude --yes
zg server status --check-ready
```

The installer uses `ZVEC_GREP_START` and `ZVEC_GREP_END` markers for managed
blocks and preserves unrelated settings. `--force` is for a conflicting
unmanaged entry, not a general repair flag. Inspect the entry first and record
what will be replaced.

## Toolset boundary

The default `agent` toolset exposes only indexed `zvec_grep_search`. The optional
`full` toolset also exposes managed ripgrep, index, drop, index status, and server
status tools. A full toolset does not make those tools harmless:

- An agent must not silently create, rebuild, or drop an index.
- `zvec_grep_index_drop` is destructive.
- Managed rg is the exhaustive exact route; it is not a semantic substitute.
- MCP approval authorizes calls to the local server, not remote data transfer.

## Remove an integration

```bash
zg uninstall --target claude --yes
zg uninstall --target qoder --yes
zg uninstall --target all --yes
```

Uninstall removes only zvec-grep-managed blocks and does not remove the npm
package or `.zvec-grep/` workspace indexes. Restart the selected agent after
uninstalling.

## Failure boundaries

- Missing tool: check Node.js, package install, and `zg help`.
- Tool absent after config: restart the agent or start a new session.
- Conflicting unmanaged entry: inspect before `--force`.
- Server not ready: run `zg server status --check-ready` and inspect the
  daemon log only if status points there.
- Remote embedding prompt unsupported: stop for explicit user choice; do not
  grant authorization in a headless session.
