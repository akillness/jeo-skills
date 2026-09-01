# Headroom integration and recovery

## Source of truth

- Upstream repository: <https://github.com/headroomlabs-ai/headroom>
- Installation guide: <https://headroom-docs.vercel.app/docs/installation>
- Persistent installs: <https://headroom-docs.vercel.app/docs/persistent-installs>
- MCP guide: <https://headroom-docs.vercel.app/docs/mcp>
- Graphify integration: `../../graphify/SKILL.md`
- Ponytail ladder: `../../ponytail/SKILL.md`

Headroom's Python package is `headroom-ai`; its command is `headroom`. The
Node package is an SDK and does not install the CLI.

## Install and prove the runtime

```bash
uv tool install --python 3.13 'headroom-ai[proxy,mcp,code]'
headroom --version
headroom deploy
headroom install status
headroom doctor
```

`deploy` selects a local persistent path and configures detected supported
clients. It is a configuration mutation. Run it only in full installation mode
or when the user requests Headroom routing. It may use a background service,
watchdog, Docker, or detached runtime. Reuse a healthy deployment; do not also
start `headroom wrap` for that client.

On Apple Silicon, Python 3.13 has documented wheels. On Windows, the documented
path requires MSVC and Rust because no prebuilt wheel is available. Do not claim
that a failed Windows source build configured Headroom.

## What the code-policy hook guarantees

The hook is intentionally narrow:

- only Claude Code `PreToolUse` operations named `Edit` or `Write`;
- only a documented source-extension allowlist;
- at most one Graphify/Headroom retry prompt per session;
- at most one Ponytail retry prompt after a supplied, numeric
  `context_usage_percent >= 60`;
- all state outside the target repository;
- `graphify scope <cwd>`, then `graphify check-update <cwd>` only if the graph
  already exists, plus `headroom doctor`.

It never runs `graphify update`, parses a transcript, writes a graph, estimates a
context percentage, modifies unrelated source files, or starts a Headroom proxy.

`context_usage_percent` is not a portable Claude Code, Codex, Gemini, or OpenCode
hook field. A host that does not provide the field cannot activate the 60% rule
truthfully. Proxy token-savings statistics are compression measurements, not the
agent's active-context occupancy.

## Configure the Claude Code adapter

```bash
# Preview the exact target before a human decides to apply the hook.
bash ./scripts/setup-claude-code-policy-hook.sh --dry-run

# After that review, merge the owned hook idempotently.
bash ./scripts/setup-claude-code-policy-hook.sh
```

The adapter targets `~/.claude/settings.json` by default. It rejects symlinks and
invalid JSON, preserves unrelated entries and the existing permission mode, creates a
new settings file with private `0600` permissions, creates a timestamped backup for an
existing regular file, and recognizes its exact owned command on re-run.

The generated hook causes a first source-mutation retry. That retry is the
model-visible enforcement point; it is not a user-facing failure and it does not
apply to Markdown or non-source outputs.

## Recovery

| Symptom | Read first | Recovery |
| --- | --- | --- |
| `headroom` unavailable | `command -v headroom` | Reinstall the CLI with the documented `uv tool install` command, then `uv tool update-shell` if needed. |
| Proxy unhealthy | `headroom doctor`, `headroom install status` | Recover the recorded deployment with `headroom install restart`; inspect status before replacing the profile. |
| Agent not routed | provider config and `headroom doctor` | Run `headroom deploy` for the intended supported client; an MCP registration is not a proxy route. |
| Graphify hook preflight unavailable | `command -v graphify` | Install `graphifyy`; do not replace the hook with an automatic graph build. |
| 60% rule did not fire | captured hook input | Confirm the host actually supplied numeric `context_usage_percent`; never derive it from token counts. |
| Adapter refuses config | file type and JSON validity | Restore from its `.headroom-policy-backup-*` file or repair valid JSON manually; do not follow symlinks. |

## Verification

```bash
python3 scripts/jeo-code-policy-hook.py --self-test
python3 tests/test_jeo_code_policy_hook.py
headroom doctor
```

The first two commands prove the local policy behavior; `headroom doctor` proves
its own runtime diagnostics. None by itself proves a different client's traffic
is routed—use that client's documented provider configuration and a healthy
Headroom deployment as the combined evidence.
