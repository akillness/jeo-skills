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
  version: "1.0"
  source: https://github.com/mvschwarz/openrig
  upstream_commit: 3001cc436656c435e54425443e708e3e2d8c7d68
---

# OpenRig operator

Operate the named `rig` CLI, daemon, TUI and persistent agent teams. This skill
was audited against commit `3001cc436656c435e54425443e708e3e2d8c7d68`.
The upstream tree also ships [developing-openrig](https://github.com/mvschwarz/openrig/blob/3001cc436656c435e54425443e708e3e2d8c7d68/.agents/skills/developing-openrig/SKILL.md),
which was audited but not copied; use it only when changing OpenRig's own source.

## When to use this skill

- Fit-check, install, upgrade, configure, preflight, operate, recover, or troubleshoot OpenRig.
- Work with `@openrig/cli`, rig specs/bundles, the kernel/operator, tmux/Herdr views, seats, queues, snapshots, or registered remote hosts.


## Instructions

### 1. Freeze scope and prerequisites

1. Record one mode (`orient`, `install`, `configure`, `operate`, `recover`, or `build`) and local versus registered remote target.
2. Check without installing:

   ```bash
   node --version; npm --version; tmux -V; rig --version
   ```

   Require Node 22 or 24; Apple silicon should use Node 22. Native Windows is
   unsupported; WSL2 is the documented route. Check only the selected provider:

   ```bash
   claude --version && claude auth status
   codex --version && codex login status
   ```

   Ask the user to run the matching login command if needed; never copy credentials.
3. Explain that setup normally writes instance state under `~/.openrig`, tmux
   sessions, provider trust/configuration and project files. `OPENRIG_HOME`
   selects instance state only, not provider config. Back up relevant files.

### 2. Install only after preview and approval

Preview the opt-in installer:

```bash
curl -fsSL https://raw.githubusercontent.com/mvschwarz/openrig/3001cc436656c435e54425443e708e3e2d8c7d68/scripts/install.sh | sh -s -- --dry-run
```

For an approved **pinned** install, use the audited CLI version `0.6.10` (the
version in the pinned `packages/cli/package.json`):

```bash
npm install -g @openrig/cli@0.6.10
node "$(npm root -g)/@openrig/cli/scripts/check-abi.mjs"
rig setup --providers claude --dry-run   # or codex; omit to inspect both
```

The pinned shell installer is useful for previewing the setup flow, but its
internal npm install is unversioned; if it is approved, treat the installed
package as unaudited-current and re-check `rig --version` and the relevant CLI
source before relying on audited flags. Applying `rig setup` may install a
provider CLI, tmux (macOS Homebrew path), Herdr, or optional Ghostty; write
`~/.tmux.conf` and provider/project trust or runtime files. `--no-herdr`,
`--no-ghostty`, `--providers`, `--full`, and `--dry-run` are source-backed
controls. The shell installer does not log in, choose permissions, launch a
team, or open the kernel conversation.

### 3. Preflight and start deliberately

```bash
rig preflight --json
rig doctor
rig daemon status
```

`rig preflight --json` exits non-zero when not ready. After approval, inspect
daemon and kernel separately:

```bash
rig daemon start
rig status
rig ps --nodes --rig kernel
```

Normal startup auto-boots the kernel/operator. Use `rig daemon start --no-kernel`
only for explicit headless/automation work. Daemon-up is not kernel-seat readiness;
do not restart a live daemon merely to open its view.

### 4. Open and verify the view

```bash
rig terminal open saved:kernel --window --json
rig terminal views --json
rig terminal status --json                 # optionally --provider herdr|cmux
```

Herdr is preferred when installed; plain tmux is the fallback. Headless SSH has
no desktop window: report that limitation and give the exact attach path. If the
window cannot open, `rig tui --shared` is dashboard-only, not the operator chat.

### 5. Validate, preview and launch

```bash
rig spec validate ./rig.yaml --json
rig spec audit ./rig.yaml --json
rig daemon start
rig spec preflight ./rig.yaml --rig-root . --json
rig up ./rig.yaml --plan --json
```

Audit is advisory; validate is the local validity gate; spec preflight is
daemon-backed. A valid spec does not prove provider auth, seat health, or the
correct workspace. For a library entry or `.rigbundle`, inspect declared
behavior and use `rig up <name> --plan`; use `--target` for a local bundle.
Treat GitHub bundles and remote hosts as untrusted input. After approval:

```bash
rig up starter --cwd .
rig ps --nodes --rig starter
```

Restore a stopped rig with `rig up <name> --existing`; resolve ambiguity first.
`--host <id>` uses `~/.openrig/hosts.yaml`; topology YAML uses per-entry `host:`
and must not be combined with `--host`.

### 6. Operate and verify effects

```bash
rig status
rig ps --nodes --rig <rig>
rig capture --rig <rig> --lines 50
rig capture <seat-session> --lines 50
rig send dev-build@starter 'Implement one bounded change; report queue ID and verification.' --verify
rig queue list --destination dev-build@starter --limit 1000
```

`--verify` is transport/effect evidence, not permission to invent work. A
timeout means delivery is unconfirmed; capture before retrying. Use `--raw` or
`--dangerously-interact` only with explicit approval: they bypass normal message
envelope/interaction safety and can type into a live session. Fan-out (`--to`,
`--pod`, `--rig`) requires inspecting every recipient result.

### 7. Stop, restore and troubleshoot

Before teardown, inspect work:

```bash
rig ps --nodes --rig <rig>
rig capture --rig <rig> --lines 50
```

With explicit approval:

```bash
rig down <rig> --snapshot
rig up <rig> --existing
```

`rig down` ends sessions and interrupts work; `--force` kills immediately and
`--delete` removes the rig record, preventing record-based restoration. Never
default to either. For an inconclusive probe, inspect daemon status, logs,
`OPENRIG_HOME`/`OPENRIG_URL`, and the host registry; a failed health probe does
not prove the daemon is stopped. Fix the named spec/bundle/path error and rerun
the narrow check before reinstalling or recreating a live rig.

## Examples

### Preview, launch, operate, then restore

```bash
node --version; npm --version; tmux -V; rig --version
curl -fsSL https://raw.githubusercontent.com/mvschwarz/openrig/3001cc436656c435e54425443e708e3e2d8c7d68/scripts/install.sh | sh -s -- --dry-run
rig setup --providers claude --dry-run
rig preflight --json
rig daemon start
rig spec validate ./rig.yaml --json
rig spec preflight ./rig.yaml --rig-root . --json
rig up ./rig.yaml --plan --json
rig up starter --cwd .
rig ps --nodes --rig starter
rig send dev-build@starter 'Implement one bounded change; report queue ID and verification.' --verify
rig capture --rig starter --lines 50
rig down starter --snapshot
rig up starter --existing
```

Review each plan/readiness result before side effects. Treat daemon, spec, seat,
send, capture, snapshot, and restore as separate evidence. Use `--force` or
`--delete` only after separate explicit approval.

## Best practices

- Separate approvals for install, credentials, permission policy, bundle install, live sends, remote hosts, and teardown.
- Prefer `--dry-run`, `--plan`, and `--json`; preserve output as evidence.
- Treat daemon-up, kernel-started, seat-started, and message-rendered as distinct facts.
- Keep tasks bounded; verify uncertain sends by `rig capture` before retrying.
- Never expose provider keys, bearer tokens, resume tokens, or full env dumps.
- Confirm host transport/auth/identity before any remote write; check `rig --version` against the pin.

## References

- README/install/getting started: https://github.com/mvschwarz/openrig/blob/3001cc436656c435e54425443e708e3e2d8c7d68/README.md and https://github.com/mvschwarz/openrig/blob/3001cc436656c435e54425443e708e3e2d8c7d68/docs/reference/getting-started.md
- RigSpec/package/installer: https://github.com/mvschwarz/openrig/blob/3001cc436656c435e54425443e708e3e2d8c7d68/docs/reference/rig-spec.md; https://github.com/mvschwarz/openrig/blob/3001cc436656c435e54425443e708e3e2d8c7d68/packages/cli/package.json; https://github.com/mvschwarz/openrig/blob/3001cc436656c435e54425443e708e3e2d8c7d68/scripts/install.sh
- CLI source at the pin: `packages/cli/src/commands/{setup,preflight,daemon,status,ps,up,down,terminal,capture,send,rig}.ts`; license: https://github.com/mvschwarz/openrig/blob/3001cc436656c435e54425443e708e3d8c7d68/LICENSE (Apache-2.0)

