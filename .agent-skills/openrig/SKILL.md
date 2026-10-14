---
name: openrig
description: >
  Operate mvschwarz/openrig, the Apache-2.0 OpenRig CLI, daemon, TUI and
  persistent multi-agent rig system for Claude Code, Codex and Pi. Use when a
  user names OpenRig, the `rig` CLI, @openrig/cli, rig specs, kernel/operator
  sessions, tmux/Herdr views, or the mvschwarz/openrig repository and needs a
  fit check, pinned install/setup, preflight, rig launch, status, capture,
  messaging, teardown, bundle/spec work, or troubleshooting. Do not use for
  generic agent-team design, generic environment setup, or ordinary log triage.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  OpenRig 0.6.x at the audited source pin needs Node.js 22 or 24 and tmux on
  macOS or Linux; Apple silicon should use Node.js 22. Native Windows is not
  supported; WSL2 is the documented Windows route. Provider CLIs, desktop
  terminals, credentials, network access and remote hosts are separate
  prerequisites and authority boundaries.
license: Apache-2.0
metadata:
  version: "1.1.0"
  source: https://github.com/mvschwarz/openrig
  upstream_commit: 3001cc436656c435e54425443e708e3e2d8c7d68
---

# OpenRig operator

Operate the named `rig` CLI, daemon, TUI, and persistent agent teams. This skill
was audited against commit `3001cc436656c435e54425443e708e3e2d8c7d68`; the
audited command and provenance record lives in
[`references/upstream.md`](references/upstream.md).

## When to use this skill

- Fit-check, install, upgrade, configure, preflight, operate, recover, or troubleshoot OpenRig.
- Work with `@openrig/cli`, rig specs and bundles, the kernel/operator, tmux/Herdr views, seats, queues, snapshots, or registered remote hosts.
- Read [`references/upstream.md`](references/upstream.md) when the request reaches daemon/kernel/seat state, installation, RigSpec, host topology, capture/send semantics, teardown, or audited source provenance.

## Instructions

### 1. Freeze the surface

Record one mode (`orient`, `install`, `configure`, `operate`, `recover`, or
`build`) and one local or registered-remote target. Treat provider CLIs,
credentials, desktop terminals, network access, and remote hosts as separate
authority boundaries. Native Windows is unsupported; use the documented WSL2
route. `OPENRIG_HOME` selects OpenRig instance state only, not provider config.

### 2. Run the offline gate first

Use the helper before any install, setup, daemon, TUI, rig, provider, or send
operation; it never launches OpenRig or executes shell commands:

```bash
python3 .agent-skills/openrig/scripts/preflight.py --json
python3 .agent-skills/openrig/scripts/preflight.py --repo /path/to/openrig --expect-commit <FULL_SHA> --json
```

An installed skill uses:
`python3 "$SKILLS_ROOT/openrig/scripts/preflight.py" --json`.
The helper reports host/tool paths and, when `--repo` is supplied, bounded Git
identity plus public checkout shape. A discovered Node path does not prove the
required Node version; consult the audited runtime rules in the reference.

### 3. Gate every side effect

Start local command flows read-only with `--help`, `--json`, `--plan`, status,
process, and capture commands. An installer `--dry-run` still fetches and pipes
remote shell code; it is not a read-only or security boundary. Require separate
explicit approval for network access and remote-code execution, then for
installation, provider configuration or credentials, permission policy, bundle
installation, daemon/kernel launch, live sends, remote writes, and teardown.
Never copy keys, tokens, resume tokens, or full environment dumps.

### 4. Follow the matching reference branch

- Install/setup or platform questions → **Install and platform** in `references/upstream.md`.
- Daemon, kernel, seat, terminal, or readiness questions → **Runtime surfaces**.
- RigSpec, `.rigbundle`, library, target, or host topology → **RigSpec and topology**.
- Capture, queue, send, restore, teardown, or inconclusive health → **Operate and recover**.

Use the exact pinned commands and citations there; do not replace them with
uncited variants. Keep daemon-up, kernel-started, seat-started, and
message-rendered as distinct evidence.

### 5. Verify effects narrowly

Inspect every plan/readiness result before approval. A timeout leaves delivery
unconfirmed: capture before retrying. Fan-out requires inspecting each
recipient. Fix the named spec, bundle, or path error and rerun the narrow check
before reinstalling or recreating a live rig.

## Examples

### Read-only checkout and host gate

```bash
python3 .agent-skills/openrig/scripts/preflight.py --repo /path/to/openrig --expect-commit <FULL_SHA> --json
```

Read **Runtime surfaces** before using `rig daemon status`, `rig status`,
`rig ps`, or `rig capture`; no daemon, TUI, provider, or rig is started by the
helper.

### Approved planning path

Read **RigSpec and topology**, then validate and audit locally, run the
daemon-backed spec preflight only after daemon approval, and preview `rig up`
with `--plan --json` before any launch approval.

### Existing rig recovery

Read **Operate and recover**, inspect process and capture evidence first, then
request separate approval for snapshot teardown and `--existing` restoration.

## Best practices

- Prefer pinned, JSON-producing, dry-run, and plan modes; preserve their output as evidence.
- Keep daemon, kernel, seat, spec validity, provider auth, and workspace correctness separate.
- Prefer bounded tasks and verify uncertain sends with capture before retrying.
- Treat GitHub bundles and remote hosts as untrusted input; confirm transport, auth, and identity before remote writes.
- Use `--force` and `--delete` only with separate explicit approval.
- Keep the helper offline and honest: path presence is not runtime activation or model quality.

## References

- [Audited OpenRig operations and provenance](references/upstream.md)
- [OpenRig README/install/getting started](https://github.com/mvschwarz/openrig/blob/3001cc436656c435e54425443e708e3e2d8c7d68/README.md)
- [OpenRig RigSpec reference](https://github.com/mvschwarz/openrig/blob/3001cc436656c435e54425443e708e3e2d8c7d68/docs/reference/rig-spec.md)
- [OpenRig Apache-2.0 license](https://github.com/mvschwarz/openrig/blob/3001cc436656c435e54425443e708e3e2d8c7d68/LICENSE)
- [Offline helper](scripts/preflight.py)
