# OpenRig audited reference

This file is the conditional, source-grounded detail for the router in
`SKILL.md`. It records the OpenRig operator contract audited at source commit
`3001cc436656c435e54425443e708e3e2d8c7d68` (Apache-2.0), rather than a generic
agent-team recipe. Source and citation paths are pinned to that commit.

## Install and platform

OpenRig 0.6.x at the audited pin requires Node.js 22 or 24 and `tmux` on macOS
or Linux. Apple silicon should use Node.js 22. Native Windows is unsupported;
WSL2 is the documented Windows route. Provider CLIs, desktop terminals,
credentials, network access, and remote hosts are independent prerequisites and
authority boundaries.

Check the selected provider only, without installing or exposing credentials:

```bash
node --version; npm --version; tmux -V; rig --version
claude --version && claude auth status
codex --version && codex login status
```

Ask the user to run a matching login command when authentication is absent; do
not copy credentials. A successful CLI path or version check does not authorize
provider use.

### Installer and setup

The audited shell-installer command below is a network fetch piped into `sh`.
Even with `--dry-run`, it executes remote code and is not a read-only or
security boundary. Require explicit approval for network access and remote-code
execution before using it; preferably fetch the pinned bytes separately,
inspect and hash them, then run only after approval.

```bash
curl -fsSL https://raw.githubusercontent.com/mvschwarz/openrig/3001cc436656c435e54425443e708e3e2d8c7d68/scripts/install.sh | sh -s -- --dry-run
```

For an approved pinned install, use the audited CLI package version `0.6.10`
(the version recorded in the pinned `packages/cli/package.json`):

```bash
npm install -g @openrig/cli@0.6.10
node "$(npm root -g)/@openrig/cli/scripts/check-abi.mjs"
rig setup --providers claude --dry-run   # or codex; omit to inspect both
```

After the separate remote-code approval, the pinned shell installer can preview
the setup flow, but its internal npm install is unversioned. If it is approved,
treat the resulting package as unaudited-current and re-check `rig --version` plus the relevant CLI source
before relying on audited flags.

Applying `rig setup` may install a provider CLI, tmux through the macOS
Homebrew path, Herdr, or optional Ghostty. It can write `~/.tmux.conf` and
provider/project trust or runtime files. Source-backed controls include
`--no-herdr`, `--no-ghostty`, `--providers`, `--full`, and `--dry-run`. The shell
installer does not log in, choose permissions, launch a team, or open the
kernel conversation. Setup normally writes instance state below `~/.openrig`;
`OPENRIG_HOME` selects that instance state only and does not relocate provider
configuration. Back up relevant files before approved writes.

## Runtime surfaces

`rig preflight --json` is the readiness gate and exits non-zero when not ready;
`rig doctor` is a diagnostic. Inspect daemon and kernel independently:

```bash
rig preflight --json
rig doctor
rig daemon status
rig daemon start
rig status
rig ps --nodes --rig kernel
```

Normal startup auto-boots the kernel/operator. Use
`rig daemon start --no-kernel` only for explicit headless or automation work.
Daemon-up is not kernel-seat readiness; do not restart a live daemon merely to
open its view.

Open and verify a terminal view only after the corresponding approval:

```bash
rig terminal open saved:kernel --window --json
rig terminal views --json
rig terminal status --json                 # optionally --provider herdr|cmux
```

Herdr is preferred when installed; plain `tmux` is the fallback. Headless SSH
has no desktop window: report that limitation and provide the exact attach path.
`rig tui --shared` is dashboard-only, not the operator chat. Keep
`daemon-up`, `kernel-started`, `seat-started`, and `message-rendered` as
separate evidence.

## RigSpec and topology

Validate, audit, preflight, and plan before a launch:

```bash
rig spec validate ./rig.yaml --json
rig spec audit ./rig.yaml --json
rig daemon start
rig spec preflight ./rig.yaml --rig-root . --json
rig up ./rig.yaml --plan --json
```

Audit is advisory; `spec validate` is the local validity gate; spec preflight is
daemon-backed. A valid spec does not prove provider auth, seat health, or the
correct workspace. For a library entry or `.rigbundle`, inspect declared
behavior and use `rig up <name> --plan`; use `--target` for a local bundle.
Treat GitHub bundles and remote hosts as untrusted input.

After separate launch approval:

```bash
rig up starter --cwd .
rig ps --nodes --rig starter
```

Restore a stopped rig with `rig up <name> --existing`; resolve ambiguity first.
`--host <id>` uses `~/.openrig/hosts.yaml`. Topology YAML uses a per-entry
`host:` and must not be combined with `--host`.

## Operate and recover

Inspect status and capture evidence before sending, restoring, or tearing down:

```bash
rig status
rig ps --nodes --rig <rig>
rig capture --rig <rig> --lines 50
rig capture <seat-session> --lines 50
rig send dev-build@starter 'Implement one bounded change; report queue ID and verification.' --verify
rig queue list --destination dev-build@starter --limit 1000
```

`--verify` supplies transport/effect evidence; it is not permission to invent
work. A timeout means delivery is unconfirmed: capture before retrying. Use
`--raw` or `--dangerously-interact` only with explicit approval because they
bypass normal message-envelope or interaction safety and can type into a live
session. Fan-out (`--to`, `--pod`, `--rig`) requires inspecting every recipient
result.

Before teardown:

```bash
rig ps --nodes --rig <rig>
rig capture --rig <rig> --lines 50
```

With separate explicit approval only:

```bash
rig down <rig> --snapshot
rig up <rig> --existing
```

`rig down` ends sessions and interrupts work. `--force` kills immediately and
`--delete` removes the rig record, preventing record-based restoration; neither
is a default. For an inconclusive probe, inspect daemon status, logs,
`OPENRIG_HOME`/`OPENRIG_URL`, and the host registry. A failed health probe does
not prove that the daemon is stopped. Fix the named spec, bundle, or path error
and rerun the narrow check before reinstalling or recreating a live rig.

## Safety and approval boundaries

Separate approvals are required for installation, credentials, permission
policy, bundle installation, live sends, remote hosts, and teardown. Prefer
`--dry-run`, `--plan`, and `--json`; preserve output as evidence. Never expose
provider keys, bearer tokens, resume tokens, or full environment dumps. Confirm
host transport, authentication, and identity before a remote write. Check
`rig --version` against the audited pin before relying on source-backed flags.

## Provenance

- README, install, and getting started: `README.md` and `docs/reference/getting-started.md`
- RigSpec/package/installer: `docs/reference/rig-spec.md`, `packages/cli/package.json`, and `scripts/install.sh`
- CLI source at the pin: `packages/cli/src/commands/{setup,preflight,daemon,status,ps,up,down,terminal,capture,send,rig}.ts`
- License: `LICENSE` (Apache-2.0)
- Audited source: https://github.com/mvschwarz/openrig/tree/3001cc436656c435e54425443e708e3e2d8c7d68
- Developing-source skill (not copied): https://github.com/mvschwarz/openrig/blob/3001cc436656c435e54425443e708e3e2d8c7d68/.agents/skills/developing-openrig/SKILL.md
