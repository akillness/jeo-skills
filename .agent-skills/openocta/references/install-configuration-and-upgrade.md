# Install, Configuration, and Upgrade

## Decide release install versus source build

Use a release when the goal is to operate OpenOcta. Use a source checkout when
the goal is to inspect, test, change, or package the project. Do not debug a
release by silently replacing it with an unpinned development build.

Release installation changes the machine and may register startup behavior or a
service. Review the selected asset, checksum, publisher/signing boundary,
installation destination, state directory, startup behavior, and rollback, then
obtain confirmation before downloading or executing it.

## Current release evidence

At the audited pin, GitHub Releases reports v1.0.8 with these classes of assets:

| OS | Architecture | Asset form |
|---|---|---|
| macOS | amd64 | `OpenOcta-1.0.8-darwin-amd64.dmg` |
| macOS | arm64 | `OpenOcta-1.0.8-darwin-arm64.dmg` |
| Windows | amd64 | `OpenOcta-amd64-installer.exe` |
| Linux | amd64, arm64 | DEB, RPM, or tar.gz |
| all | n/a | documentation archive and SHA-256 checksums |

Do not hardcode this table as the latest release. Save current release metadata
and select from that evidence:

```bash
curl -fsS https://api.github.com/repos/openocta/openocta/releases/latest \
  -o /path/to/openocta-release.json

python3 .agent-skills/openocta/scripts/audit-openocta.py release \
  --metadata /path/to/openocta-release.json \
  --os darwin \
  --arch arm64 \
  --format json
```

For Linux, pass `--package deb`, `--package rpm`, or `--package tar.gz` as
appropriate. Windows currently has only an amd64 installer in v1.0.8.

The planner does not download anything. It returns `READY` only when exactly one
asset and a checksums asset are present.

## Verify a downloaded asset

1. Download the selected package and checksums file from the same release.
2. Preserve the original filenames.
3. Inspect the checksums file before using it as a command input.
4. Verify the one selected file.
5. Confirm the calculated digest and expected filename both match.

Example on macOS or Linux after the files are present:

```bash
grep 'OpenOcta-1.0.8-darwin-arm64.dmg' openocta_1.0.8_checksums.txt \
  > openocta-selected.sha256
shasum -a 256 -c openocta-selected.sha256
```

If the checksum format uses a path or tool-specific syntax, calculate the digest
manually and compare it rather than weakening verification. A digest only proves
agreement with the release manifest, not independent publisher identity.

## Installation side effects by platform

### macOS

The documented desktop path is a DMG containing an application. Review whether
the app is signed and notarized on the actual asset, then copy it to the intended
Applications directory only after approval. First launch creates or resolves a
state directory and starts the local gateway.

### Windows

The NSIS source requests administrator execution, installs under Program Files,
creates Start Menu and desktop shortcuts, writes an install-directory registry
key, and registers the launcher in the current user's auto-start key. Review all
of those consequences before running the EXE. Uninstall removes program files,
shortcuts, registry entries, and auto-start; state outside the install directory
needs separate verification.

### Linux

The DEB/RPM post-install script reloads systemd, enables `openocta`, and starts it.
The packaged unit runs:

```text
/usr/bin/openocta gateway run --port 18900
```

The sample unit uses service mode and `/root/.openocta`. For a real deployment,
prefer a dedicated non-root account, a private state directory, explicit gateway
authentication, restricted network exposure, and a reviewed unit override.
Installing a package is therefore also service activation and needs one combined
review.

The tar archive avoids package-manager hooks but does not remove the need to
design service ownership, authentication, logs, restart, and upgrades.

## State and configuration paths

| Surface | Default or behavior |
|---|---|
| Unix-like state | `~/.openocta` |
| Windows state | OpenOcta under `%APPDATA%` unless launcher packaging overrides it |
| Config | `openocta.json` in the resolved state directory |
| Gateway port | 18900 from source |
| Desktop mode | local-machine gateway boundary |
| Service mode | network-facing service boundary; authenticate and firewall |

Resolution overrides:

- `OPENOCTA_STATE_DIR`
- `OPENOCTA_CONFIG_PATH`
- `OPENOCTA_GATEWAY_PORT`
- `OPENOCTA_RUN_MODE=desktop` or `service`
- `OPENOCTA_HOME`

Legacy fallback aliases remain active when OpenOcta names are empty:

- `CLAWDBOT_STATE_DIR`
- `CLAWDBOT_CONFIG_PATH`
- `CLAWDBOT_GATEWAY_PORT`

Other important switches:

- `OPENOCTA_SKIP_CRON`
- `OPENOCTA_SKIP_CHANNELS`
- `OPENOCTA_SKIP_PROVIDERS`
- `OPENOCTA_SKIP_SINGLETON_KILL`
- `OPENOCTA_ALLOW_UNINSTALL`
- `OPENOCTA_SITE_API_BASE_URL`
- `OPENCLAW_BUNDLED_SKILLS_DIR`

Do not use a compatibility variable merely because it exists. Record why it is
needed and the condition for removing it.

## Configuration precedence

Upstream documents this effective order for environment-backed settings:

1. operating-system environment already set before launch;
2. embedded `.env` defaults for missing keys;
3. `config.env.vars` for keys still missing;
4. runtime lookup through the resulting process environment.

This means an edited JSON value can appear ineffective when a same-name process
environment variable already wins. Diagnose the resolved key source without
printing the value.

Two v1.0.8 defaults require explicit configuration:

- add `"cozeloop": {"enabled": false}` unless outbound trace export is approved
  with an operator-owned workspace and credential;
- add `"localAgents": {"enabled": false}` unless delegation to installed local
  agent CLIs is intended, then supply an exact `allowed` list and a separate
  effective approval policy.

Omission is not a safe disable signal for either behavior at the audited pin.

## Model setup

A model provider is required for agent chat. Keep four facts separate:

- provider identifier;
- model identifier;
- base URL or local runtime boundary;
- credential source.

Public providers can incur charges and send operational context off-device.
Local providers reduce that egress but still need endpoint, model, memory, and
performance validation. Obtain confirmation before saving a key or performing a
metered test call. Never echo, screenshot, or commit the key.

The config auditor reports provider count and sensitive field names only:

```bash
python3 .agent-skills/openocta/scripts/audit-openocta.py config \
  --config ~/.openocta/openocta.json \
  --run-mode desktop \
  --format json
```

## Gateway checks

Read-only first steps:

```bash
openocta gateway status --json
openocta gateway health --json
```

Supply URL and authentication through protected channels if the gateway is not
the local default. Do not put the token directly into shell history when a safer
mechanism is available.

`openocta gateway call` is not inherently read-only. Inspect the method and
parameters before use. `gateway install`, `stop`, and `restart` change service or
process state and need review.

## Upgrade contract

1. Record installed version, package source, platform, architecture, state path,
   config path, run mode, gateway bind/auth, and service ownership.
2. Back up the config, Skills, Knowledge Vault source documents, indexes, session
   data, channel configuration, MCP configuration, and scheduled jobs according
   to their separate restore contracts.
3. Read current release notes and open issues; do not skip versions based only on
   README labels.
4. Download the exact asset and checksums file from one release.
5. Verify the checksum.
6. Stop or quiesce the current process through its supported path.
7. Install only after approval.
8. Verify version, gateway bind/auth/health, model, one read-only tool, Knowledge
   Vault availability, schedules, and each enabled integration.
9. Keep the previous package and restore steps until the acceptance checks pass.

## Uninstall contract

Uninstall is destructive and may leave or remove state depending on the package.
Before execution, enumerate:

- program binaries and launcher;
- service, startup item, scheduled jobs, and shortcuts;
- config, credentials, Skills, Knowledge Vault, sessions, logs, caches, and model
  files;
- external bot/webhook registrations and tokens;
- rollback or archival destination.

`OPENOCTA_ALLOW_UNINSTALL` expands API authority in non-desktop mode. Do not leave
it enabled on a service. Confirm the exact files and external registrations to
remove, then verify both the host and connected systems afterward.

## Primary sources

- Release list: https://github.com/openocta/openocta/releases
- v1.0.8 release: https://github.com/openocta/openocta/releases/tag/v1.0.8
- Environment variables: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/docs/environment-variables.md
- Configuration: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/docs/configuration.md
- Package scripts: https://github.com/openocta/openocta/tree/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/deploy
