---
name: headroom-code-policy-install
description: Install or repair the Headroom, Graphify, and Ponytail code-context layer without creating repository graph state or overstating host-hook coverage.
triggers:
  - "headroom setup"
  - "context policy"
  - "Graphify preflight"
  - "Ponytail 60%"
  - "Claude Code source-mutation hook"
edges:
  - target: "context/setup.md"
    condition: "when selecting full delegated setup versus a task-specific install"
  - target: "patterns/catalog-metadata-changes.md"
    condition: "when changing the Headroom catalog entry or its projections"
grounds_to: []
last_updated: 2026-09-01
---

# Headroom Code-Policy Installation

## Scope

`.agent-skills/headroom/` packages the context layer. Its full-mode setup entry is
`setup-all-skills-prompt.md`; its Claude Code adapter is
`headroom/scripts/setup-claude-code-policy-hook.sh`.

The contract is deliberately split:

- Graphify supplies bounded, read-only project evidence.
- Headroom supplies persistent transport compression and health diagnostics.
- Ponytail runs only after a host sends an explicit numeric
  `context_usage_percent >= 60`.

## Safe Flow

1. Install the `graphifyy` CLI and `headroom-ai[proxy,mcp,code]` separately with
   `uv tool install`; do not treat skill documents as installed executables.
2. Run `headroom install status` first. Reuse a configured deployment; only run
   `headroom deploy` when status is absent or unconfigured, then prove it with
   `headroom install status` and `headroom doctor`.
3. Never run `graphify update` in shared setup. The code hook may use only
   `graphify scope <cwd>` and `graphify check-update <cwd>` when `.graphify/`
   already exists.
4. In full delegated setup, apply the Claude Code adapter directly because full mode
   is the explicit configuration decision. For a manual invocation, inspect its
   `--dry-run` output before applying it. The adapter writes a single owned
   `PreToolUse` command, preserves unrelated settings and existing permission mode,
   creates a new settings file as `0600`, and refuses symlinks or invalid JSON.
5. State the host boundary plainly. The automatic source-mutation hook is
   Claude Code-only. Other clients can use persistent Headroom routing and the
   installed skills, but do not receive a claimed equivalent hook without a
   documented matching payload.

## Verification

```bash
python3 .agent-skills/headroom/scripts/jeo-code-policy-hook.py --self-test
python3 .agent-skills/headroom/tests/test_jeo_code_policy_hook.py
headroom install status
headroom doctor
```

The first two checks establish policy behavior and installer filesystem safety.
The last two establish Headroom's local runtime state; they do not independently
prove a different client has proxy routing.

## Update Scaffold

- [ ] Refresh `setup-all-skills-prompt.md` only when upstream Headroom commands or
      supported host behavior changes.
- [ ] Keep the Headroom manifest entry, `skills.toon`, and all three README category
      tables synchronized through the manifest-derived projection workflow.
- [ ] Update `.mex/ROUTER.md` and `context/setup.md` after changing this contract.
