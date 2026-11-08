# Craft Anything Troubleshooting & Recovery Reference

This guide covers common connection failures, agent registration issues, engine errors, and rollback procedures.

## Quick Diagnostic Matrix

| Symptom | Probable Cause | Action |
|---|---|---|
| `craft-anything` tools missing in coding agent | Client configuration missing or stale | Run `craft-anything-cli doctor`. If client missing, run `craft-anything-cli setup --client <id> --dry-run` and review plan before applying. |
| Agent config has tools, but agent fails to call them | Process started before config write | Fully restart or reconnect the coding agent application so it reloads its configuration. |
| Tool set is small (only 12 core tools) | Client config launched without `--all-tools` | Check the client configuration file (e.g. `~/.claude/settings.json`, `~/.cursor/mcp.json`). Ensure `args` includes `--all-tools`. |
| `setup --yes` stripped `--all-tools` | Default `setup` rewrote entry without flag | Restore `--all-tools` by editing the client config or restoring from `.craft-anything.backup`. |
| `craft-anything-cli` command not found in shell | Binary not on system `PATH` | Run via `~/.local/bin/craft-anything-cli` or add `~/.local/bin` to your environment `PATH`. |
| Tool call fails with `details.reason: clean_room` | Tool attempted to inspect internal code while in Clean room | If examining internal code is authorized, rerun with `--deep` flag or call `settings_set deep_mode true`. |
| Tool call fails with `engine_missing` | Required decompiler or engine not installed | Check the error remediation. For Ghidra, install Ghidra and ensure `GHIDRA_INSTALL_DIR` is set. |
| Rebuild stalls during dependency install | Agent waiting for command approval | Check the terminal or `inbox/` for pending approval requests (`<id>.request.json` from `core_action_approve`). Approve or reject deliberately. |
| Apple blocks `craft-anything-cli` on macOS | Lone command-line tool lacks attached ticket | Run `xattr -d com.apple.quarantine ~/.local/bin/craft-anything-cli` or approve in System Settings → Privacy & Security. |

## Verification and Diagnostics

### 1. Doctor Command
The built-in doctor command checks registrations, engine dependencies, and MCP server health:

```bash
craft-anything-cli doctor
craft-anything-cli doctor --client claude_code
```

Doctor reports:
- Installed binary status and version
- Coding agent registrations (Claude Code, Cursor, Codex, OpenCode)
- Decompilation engines (built-in, Ghidra)
- Platform permissions and sandbox boundaries

### 2. Capabilities Check
To verify which toolsets and formats are available on the current host:

```bash
craft-anything-cli capabilities --json
```

## Setup Backup & Rollback Protocol

When `craft-anything-cli setup` modifies client configuration files:
1. **Single-file backup:** It creates a `.craft-anything.backup` copy of the target configuration before making changes.
2. **Atomic write:** New configurations are written via private atomic temporary files.
3. **No overwriting older backups:** If a `.craft-anything.backup` already exists from an earlier run, it is preserved.
4. **Clean uninstallation:** Running `craft-anything-cli uninstall` removes only the entries and skills created by Craft Anything, leaving user customizations and other MCP servers untouched.
