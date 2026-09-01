---
name: headroom
description: >
  Install, configure, and operate Headroom, the local-first context optimization
  layer for coding agents. Use when the user needs proxy-level compression,
  Headroom MCP tools, persistent Claude/Codex/OpenCode routing, or a code-work
  policy that combines Headroom health with Graphify preflight and context-aware
  Ponytail minimization. Triggers on: headroom, headroom proxy, headroom deploy,
  headroom wrap, headroom mcp, headroom doctor, context compression, token
  savings, context budget, or Headroom code policy.
allowed-tools: Bash Read Write Edit Grep Glob
compatibility: >
  Requires Python 3.10+ and the upstream `headroom-ai` CLI. The included policy
  hook is a Claude Code PreToolUse adapter; other hosts retain the portable
  skill/proxy workflow but do not receive a fabricated lifecycle guarantee.
---

# Headroom

Headroom is the transport layer: it compresses fresh tool output and new turns
before they reach the model. It is not a replacement for source navigation,
code review, or a model's actual context-meter.

## When to use this skill

- Install or update Headroom's CLI, proxy, persistent deployment, wrapper, or MCP server.
- Verify whether an agent is actually routed through a healthy Headroom proxy.
- Configure the code-work policy: Graphify preflight before source mutation and
  Ponytail minimization only once an authoritative host context percentage reaches 60.
- Diagnose provider routing, proxy health, token savings, or a failed deployment.

## When not to use this skill

- The task is source or symbol discovery without compression concerns → use `graphify` or `codebase-search`.
- The task needs a code-size reduction review without a context policy → use `ponytail`.
- The task is generic agent configuration ownership → use `agent-configuration`.

## Installation and persistent routing

Use the smallest upstream extra set that supports proxy, MCP, and code-aware
compression. On macOS Apple Silicon and Linux, isolate it with `uv`:

```bash
uv tool install --python 3.13 'headroom-ai[proxy,mcp,code]'
headroom --version
headroom deploy
headroom install status
headroom doctor
```

`headroom deploy` selects a durable local runtime, configures detected supported
clients, and starts the proxy on `127.0.0.1:8787`. `headroom install status` and
`headroom doctor` are the evidence gates. A binary on `PATH` alone is not proof
that a client is routed through the proxy.

On Windows, install the documented MSVC and Rust prerequisites before using the
Python CLI; no prebuilt Windows wheel exists at the documented release line.

## Code-work policy

The optional Claude Code hook at `scripts/jeo-code-policy-hook.py` applies only
to source-file `Edit` and `Write` operations. It uses a state directory outside
the worktree and never runs `graphify update` itself.

1. On the first source mutation per session, it runs the bounded read-only
   preflight `graphify scope <cwd>` and, only for an existing graph,
   `graphify check-update <cwd>`, plus `headroom doctor`.
2. It denies that one attempt with concise retry guidance. The agent retries after
   using the resulting Graphify/Headroom evidence. Markdown, data, and non-source
   paths are untouched.
3. If the host hook payload explicitly includes a valid
   `context_usage_percent >= 60`, the hook denies one additional source mutation
   and requires the Ponytail ladder before retrying. The ladder still preserves
   validation, data-loss handling, security, and accessibility.
4. If the host does not expose that exact percentage, the hook does **not** infer
   it from transcript size, proxy savings, model names, or a presumed context
   window. No invented threshold is enforcement.

Install the Claude Code adapter only after the CLI and skill are present:

```bash
bash ./scripts/setup-claude-code-policy-hook.sh --dry-run
bash ./scripts/setup-claude-code-policy-hook.sh
```

The adapter merges one owned `PreToolUse` entry into `~/.claude/settings.json`,
backs up an existing regular file before changing it, preserves its permission mode,
creates a new settings file with private `0600` permissions, and refuses symlinks or
invalid JSON. It is idempotent.

## Operating modes

| Need | Command | Evidence |
| --- | --- | --- |
| Durable automatic routing | `headroom deploy` | `headroom install status` |
| Health diagnosis | `headroom doctor` | reachable, configured result |
| One-session wrapped client | `headroom wrap claude` | wrapper launch output |
| On-demand MCP tools | `headroom mcp install` | client MCP listing |
| Manual local proxy | `headroom proxy --mode cache` | `/health` or `headroom doctor` |
| Code-policy preflight | hook-triggered `graphify scope` + `headroom doctor` | one retryable guard decision |

Use `headroom wrap <client>` only for an intentional one-session path. Do not
stack it on top of an already healthy persistent deployment.

## Instructions

1. Check `headroom --version` and `headroom doctor` before changing routing.
2. Choose exactly one runtime path: durable `deploy`, a documented persistent
   `install apply` preset, or a one-session `wrap`. Do not start duplicate proxies.
3. Keep Headroom credentials and provider configuration outside the project.
4. For a code-work policy, install Graphify separately and use only `scope` and
   `check-update` in pre-mutation hooks. Run `graphify update <scope>` only when
   graph freshness is actually required because it mutates `.graphify/`.
5. Invoke Ponytail only on the authoritative `context_usage_percent >= 60` signal;
   never estimate the percentage.
6. Verify the code-policy adapter with `python3 scripts/jeo-code-policy-hook.py
   --self-test` and the focused test suite before reporting it active.

## Examples

### Durable Claude/Codex routing

```bash
uv tool install --python 3.13 'headroom-ai[proxy,mcp,code]'
headroom deploy
headroom install status
headroom doctor
```

### Safe context-aware minimization

A Claude Code source edit triggers the policy hook. It runs a Graphify scope
preflight and Headroom diagnostic once. If the host later supplies
`context_usage_percent: 60`, the next source edit is retried after applying the
existing Ponytail ladder. It does not guess a percentage when the field is absent.

## Best practices

- Treat active proxy routing as a runtime property, not an install claim.
- Keep automatic hooks read-only with respect to the target repository.
- Cap command output and use argv lists; never interpolate hook input into shell.
- Make one retryable intervention per condition, then allow the agent to proceed.
- Never sacrifice trust-boundary validation, data-loss safety, security, or accessibility for shorter code.

## References

- [Integration and recovery](references/integration-and-recovery.md)
- [Code-policy hook](scripts/jeo-code-policy-hook.py)
- [Claude Code adapter](scripts/setup-claude-code-policy-hook.sh)
- [Headroom persistent installs](https://headroom-docs.vercel.app/docs/persistent-installs)
- [Headroom installation](https://headroom-docs.vercel.app/docs/installation)
- [Headroom MCP](https://headroom-docs.vercel.app/docs/mcp)
- [Graphify](../graphify/SKILL.md)
- [Ponytail](../ponytail/SKILL.md)
- [Skill standard](../skill-standardization/SKILL.md)
