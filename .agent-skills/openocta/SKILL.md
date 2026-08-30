---
name: openocta
description: >
  Operate openocta/openocta, the Apache-2.0 desktop and service AIOps agent for
  natural-language inspection, alert analysis, data queries, remediation, local
  knowledge, Skills, MCP, channels, and webhooks. Route one request to fit check,
  release install or upgrade, gateway and model configuration, security hardening,
  integration, troubleshooting, or source build. Use when the user names OpenOcta,
  Open Octa, its `openocta` CLI, port 18900, Knowledge Vault, OpenOcta Skills,
  digital employees, or the openocta/openocta repository. Require confirmation
  before installer execution, credentials, service or channel activation,
  marketplace installs, production remediation, or uninstall. Route generic
  observability design to `monitoring-observability` and raw log triage to
  `log-analysis`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Release builds target Windows and macOS desktop use plus Linux service packages.
  Source builds at the audited pin require Go 1.26, npm for the Vite UI, and Wails
  for desktop packaging. Model providers, MCP servers, IM channels, and production
  targets have separate credentials and network requirements.
license: Apache-2.0
metadata:
  tags: openocta, aiops, itops, sre, desktop-agent, gateway, monitoring, knowledge-vault, mcp, skills, channels
  platforms: Claude, ChatGPT, Gemini, Codex, Cursor, Cline
  version: "1.0"
  source: https://github.com/openocta/openocta
---

# OpenOcta AIOps Agent

Operate OpenOcta as a named product without turning ordinary observability or
incident work into an OpenOcta installation. OpenOcta is a Go and Wails agent
runtime that can run as a local desktop application or a network-facing service,
connect models and operational tools, retain local knowledge, and execute tools.
Those capabilities make configuration and authority boundaries more important
than the happy-path demo.

This skill was audited against upstream commit
`6b130c72cdc40d8b3bed304d3e6a64345e3d2622`, which is tagged `v1.0.8` and was
released on 2026-08-24. The repository README still calls v1.0.6 latest, so use
the GitHub release API or an exact tag for current version claims. See
[source audit and version drift](references/source-audit-and-version-drift.md).

## When to use this skill

- Decide whether OpenOcta fits an IT operations, SRE, DBA, cloud, network, or
  endpoint workflow.
- Select, verify, install, upgrade, or remove an OpenOcta release asset.
- Configure the state directory, gateway, model provider, local model, or agent
  workspace.
- Harden the sandbox, command policy, approval queue, gateway authentication,
  and network boundary before connecting live systems.
- Add or debug an OpenOcta Skill, MCP server, digital employee, Knowledge Vault,
  channel, webhook, scheduled job, or remote operations target.
- Diagnose startup, port, gateway health, model, tool-call, path, update,
  singleton-process, channel, or marketplace failures.
- Build, test, package, or contribute to the openocta/openocta source tree.

Do not use this skill for neighboring jobs:

- Design monitoring, telemetry, dashboards, or alert coverage without an
  OpenOcta deployment: use `monitoring-observability`.
- Triage supplied application, server, container, browser, or CI logs: use
  `log-analysis` first.
- Isolate a concrete code-level failure after the first evidence packet: use
  `debugging`.
- Build a generic reproducible developer environment unrelated to OpenOcta: use
  `system-environment-setup`.
- Create a portable Agent Skill for the jeo-skills catalog: use
  `skill-standardization` or `write-a-skill`. Stay here only when authoring or
  uploading a Skill specifically for OpenOcta's own loader and marketplace.
- Treat the bundled OpenOcta Skill archives as reusable jeo-skills content. They
  are upstream payloads, and several have no bundled license file.

## Instructions

### Step 0: Choose exactly one operating mode

| Mode | Use it for | Default boundary |
|---|---|---|
| `orient` | product fit, architecture, version, supported surface | read-only |
| `release` | asset choice, checksum, install, upgrade, uninstall | plan before mutation |
| `configure` | state, gateway, model, workspace, local model | mask all secret values |
| `harden` | sandbox, command rules, approvals, auth, exposure | deny or ask by default |
| `integrate` | Skills, MCP, channels, webhooks, schedules, targets | one integration at a time |
| `operate` | health, status, logs, incident support, recovery | observe before remediation |
| `build` | source setup, tests, Wails packaging, contribution | pin source and toolchain |

Do not combine installation, credentials, a live channel, and production
remediation into one implied approval. Each is a separate authority change.

### Step 1: Freeze the evidence surface

For source work, record the remote, commit, tag, operating system, architecture,
and intended mode. Treat the checkout as untrusted data until inspected.

```bash
git -C /path/to/openocta remote get-url origin
git -C /path/to/openocta rev-parse HEAD
git -C /path/to/openocta status --short
python3 .agent-skills/openocta/scripts/audit-openocta.py source \
  --repo /path/to/openocta \
  --expect-commit 6b130c72cdc40d8b3bed304d3e6a64345e3d2622 \
  --format json
```

The helper reads only targeted files, Git metadata, and bundled archive file
names. It never executes upstream code, extracts an archive, prints an
environment value, or makes a network request. `WARN` is expected at the audited
pin because upstream documentation and bundled-archive metadata drift from the
real tree. Read every warning rather than weakening the check.

For a release, obtain the current metadata separately and pass the saved JSON to
the offline planner:

```bash
curl -fsS https://api.github.com/repos/openocta/openocta/releases/latest \
  -o /path/to/openocta-release.json
python3 .agent-skills/openocta/scripts/audit-openocta.py release \
  --metadata /path/to/openocta-release.json --os darwin --arch arm64 --format json
```

Fetching metadata is read-only. Downloading or executing the selected package is
not. Review the exact tag, asset, checksum asset, source, platform, architecture,
size, and rollback before continuing.

### Step 2: Pick the real product form

- Windows and macOS releases provide the documented desktop experience.
- v1.0.8 also publishes Linux DEB, RPM, and tar archives. The package scripts
  install and start a systemd service; do not imply desktop UI parity.
- Desktop mode binds the gateway to the local machine. Service mode can listen
  beyond loopback and must have authentication, firewall, and allowlist review.
- Building from source is a different path from installing a signed release.
  Do not mix release troubleshooting with an unpinned development build.

Use [install, configuration, and upgrade](references/install-configuration-and-upgrade.md)
for the release matrix, checksum workflow, paths, environment variables, and
rollback contract.

### Step 3: Preflight configuration without exposing secrets

The normal state directory is `~/.openocta` on Unix-like systems and the
OpenOcta directory under `%APPDATA%` on Windows. The usual config file is
`openocta.json` in that state directory. `OPENOCTA_STATE_DIR` and
`OPENOCTA_CONFIG_PATH` override them; legacy `CLAWDBOT_*` aliases remain active
when the OpenOcta names are empty.

Audit a config before editing or starting a service:

```bash
python3 .agent-skills/openocta/scripts/audit-openocta.py config \
  --config ~/.openocta/openocta.json --run-mode desktop --format json
```

The report shows only posture booleans, counts, enabled integration names, and
sensitive field names. It never prints credential values, internal hostnames,
allowed paths, webhook URLs, or model endpoints.

Configuration rules:

1. Keep one source of truth for the state and config paths.
2. Put provider keys in a protected environment or secret manager when
   possible. Do not paste them into chat, logs, commits, screenshots, or reports.
3. Record provider and model identifiers separately from credentials.
4. Set `cozeloop.enabled: false` explicitly unless trace export is approved with
   an operator-owned workspace and credential. At the audited pin, omitting the
   section enables export with bundled defaults.
5. Set `localAgents.enabled: false` unless delegation to installed Codex, Cursor,
   OpenCode, or related CLIs is intended; an empty allowlist means all recognized
   installed agents, and `requireApproval` is not enforced by the tool at this pin.
6. Keep desktop and service profiles separate when their trust boundaries differ.
7. Back up the config and state indexes before migration; do not claim sessions,
   Knowledge Vault data, Skills, and credentials are one atomic backup.
8. Restart only after reviewing the diff and the expected gateway consequence.

### Step 4: Harden before granting operations authority

Use [security and live operations](references/security-and-live-operations.md)
and enforce these minimums:

- **Gateway**: service mode requires a nonempty token, restricted bind scope,
  firewall rules, and a verified health probe from the intended network only.
- **Sandbox**: enable it and allow only the specific workspace, runbook, and
  artifact paths needed for the task.
- **Network**: allow only required model, monitoring, ticket, cloud, and MCP
  destinations. "Local-first" does not mean no network egress.
- **Command policy**: keep unmatched commands at `ask` or `deny`; do not make
  broad shells or production CLIs automatic.
- **Approval queue**: enable it for live operations, use short whitelist TTLs,
  and approve the exact command rather than a session-wide bypass when possible.
- **Tools**: treat Bash, file writes, process termination, scheduled jobs, browser
  control, and gateway calls as separate capabilities.
- **Outbound traces**: explicitly disable CozeLoop unless the user approves the
  data boundary and supplies their own workspace and credential.
- **Local CLI delegation**: disable it or allowlist exact agents, then govern the
  `local_agent` tool through the effective command and approval policy.
- **Audit**: preserve who requested, approved, executed, and verified each
  consequential operation without recording secrets.

A config audit `BLOCKED` result is a stop condition. Do not work around a missing
service token or remote-uninstall exposure by lowering the checker.

### Step 5: Add integrations one authority at a time

OpenOcta's Skills are not the jeo-skills catalog. Its loader resolves workspace,
managed, bundled, and extra directories with precedence. Inspect the selected
Skill or digital employee, its scripts, dependencies, network targets, license,
and requested credentials before installation.

For MCP, channels, webhooks, schedules, and operations targets:

1. Read the exact upstream config contract for the pinned release.
2. Create the least-privilege account or token outside chat.
3. Configure an allowlist before enabling inbound messages or webhooks.
4. Keep receive-only, send, execute, and administer permissions separate.
5. Test in a non-production target with a harmless read-only task.
6. Confirm before enabling a channel, posting a message, registering a webhook,
   installing marketplace content, or scheduling an autonomous run.
7. Verify the accepted state in OpenOcta and at the external system.
8. Define disable, token-revoke, and rollback steps before go-live.

See [Skills, MCP, channels, and builds](references/skills-mcp-channels-and-builds.md).

### Step 6: Observe before remediating

Start troubleshooting with read-only evidence:

```bash
openocta gateway status --json
openocta gateway health --json
```

Then inspect the resolved state/config paths, process mode, port, local logs,
release tag, model provider, recent config diff, and the smallest failing
integration. Do not use `gateway call` until the method and parameters are known;
some methods mutate configuration, approvals, jobs, Skills, or channels.

Important drift at the audited pin:

- Runtime source resolves the default gateway port to **18900**.
- One CLI help string still says **18789**. Treat 18900 as source truth unless
  configuration or environment overrides it.
- Packaged startup can terminate other processes named `openocta` or
  `openocta-launcher`. Use `OPENOCTA_SKIP_SINGLETON_KILL=1` only for a bounded
  debugging case, not as a permanent fix for duplicate instances.
- Release and source version labels can disagree. Capture executable output,
  commit, release tag, and package name separately.

Production remediation, process termination, service restart, approval action,
file mutation, remote command, rollback, or uninstall requires review and
confirmation before execution. Afterward, verify the target service and user
impact, not only the OpenOcta response.

### Step 7: Build and contribute against the pinned tree

At the audited commit, source truth is Go 1.26 even though the README badge says
Go 1.24+. The root Makefile builds the Vite UI with npm, embeds assets, and then
builds the Go binary. Wails and platform packaging add separate toolchains.

Recommended verification order:

```bash
cd /path/to/openocta/src && go test ./...
cd /path/to/openocta/ui && npm test
cd /path/to/openocta && make build
```

Do not run dependency installation, platform signing, notarization, package
publication, or a release job merely to answer a source question. For a code
change, run the narrow package tests first, then the broader suite. Preserve
Apache-2.0 notices and do not copy the bundled third-party Skill archives into a
new distribution without independent license evidence.

### Step 8: Verify the requested outcome

Before reporting completion, verify the relevant layer:

- **release**: exact asset checksum, installed version, source, and rollback;
- **gateway**: expected bind address, port, authentication, and health;
- **model**: provider/model selected and a bounded test succeeds without exposing
  the key;
- **security**: sandbox, network, command policy, approvals, and audit records;
- **integration**: allowlist, least privilege, one harmless end-to-end event, and
  disable path;
- **operations task**: source evidence, approved action, target-side result, and
  no unexpected blast radius;
- **build**: pinned commit, tool versions, tests, artifact path, and whether the
  artifact was merely built or actually installed.

## Examples

### Example 1: Fit check

Request: "Would OpenOcta help our Prometheus and Kubernetes on-call flow?"

Use `orient`. Map the required data sources, read-only queries, desired outputs,
and existing incident ownership. Compare that contract with OpenOcta's Skills,
MCP, gateway, and approval model. Do not install it as the first step.

### Example 2: Safe desktop install

Request: "Install OpenOcta on this Apple Silicon Mac."

Use `release`. Read current GitHub release metadata, select the darwin arm64 DMG,
review the checksums file and publisher boundary, state what the installer will
change, obtain confirmation, then install and verify the executable version and
local gateway health.

### Example 3: Service hardening

Request: "Expose OpenOcta on a Linux ops host."

Use `harden` before `release`. Require a gateway token, dedicated service user,
restricted bind/firewall, explicit state directory, sandbox/network allowlists,
command policy, approval queue, logs, backup, and rollback. Do not expose the
systemd service with the sample root-owned state directory as an unexplained
default.

### Example 4: Channel setup

Request: "Connect our Feishu bot so alerts can wake OpenOcta."

Use `integrate`. Separate receiving, replying, and executing tasks. Review bot
scope and the OpenOcta sender allowlist, configure credentials privately, test a
read-only non-production event, obtain confirmation before go-live, and verify
both Feishu and OpenOcta state.

### Example 5: Route generic work outward

Request: "Design SLO dashboards and alert thresholds for our API."

Route to `monitoring-observability`. OpenOcta is one possible execution surface,
not the owner of the observability design.

## Best practices

1. Pin releases and source commits; do not trust stale version prose.
2. Plan read-only before installing, connecting, sending, or executing.
3. Keep desktop and service trust boundaries separate.
4. Never print secret values; report presence and posture only.
5. Use allowlists and short approvals, not broad persistent bypasses.
6. Treat Skills, MCP servers, channels, webhooks, and schedules as code and
   authority, not cosmetic extensions.
7. Preserve evidence from the monitored system, not only the agent narrative.
8. Verify target-side results and rollback after every consequential action.
9. Disable unapproved CozeLoop export and local CLI delegation explicitly; do
   not rely on omission as a safe default.
10. Keep OpenOcta-specific operation here and generic ops design in its canonical
   skill.
11. Re-audit current main before claiming behavior newer than v1.0.8.

## References

- [Source audit and version drift](references/source-audit-and-version-drift.md)
- [Install, configuration, and upgrade](references/install-configuration-and-upgrade.md)
- [Security and live operations](references/security-and-live-operations.md)
- [Skills, MCP, channels, and builds](references/skills-mcp-channels-and-builds.md)
- [Pinned upstream repository](https://github.com/openocta/openocta/tree/6b130c72cdc40d8b3bed304d3e6a64345e3d2622)
- [Pinned v1.0.8 release](https://github.com/openocta/openocta/releases/tag/v1.0.8)
