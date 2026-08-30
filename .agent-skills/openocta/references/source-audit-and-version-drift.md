# Source Audit and Version Drift

## Audited source

- Repository: `https://github.com/openocta/openocta`
- Owner type: GitHub user account, not an organization
- Branch: `main`
- Commit: `6b130c72cdc40d8b3bed304d3e6a64345e3d2622`
- Tag at that commit: `v1.0.8`
- Release published: 2026-08-24
- Audit date: 2026-08-30
- Tracked tree at the pin: 900 files, approximately 19.3 MB
- Implementation: Go gateway and agent runtime, embedded Vite control UI, Wails
  desktop packaging

Pin a release or commit before using line-level claims. The project moved from a
general desktop-agent description toward an ITOps and AIOps position during 2026,
so old articles and cached search results often describe a different product.

## License boundary

The root `LICENSE` is the standard Apache License 2.0 text. It contains the
unchanged appendix placeholder `Copyright [yyyy] [name of copyright owner]`, and
the repository has no `NOTICE` file at the audited pin. The wrapper in jeo-skills
is original operating guidance and links to the source rather than vendoring it.

Apache-2.0 allows use and modification under its conditions, but it does not
solve every asset boundary:

- product names and artwork remain separate trademark and asset questions;
- dependencies retain their own licenses;
- `deploy/inner_skills/` contains eight ZIP payloads and none contains a file
  named LICENSE, NOTICE, COPYING, or equivalent at this pin;
- the second repository `openocta/openocta_skills` is separately MIT-licensed;
- the commercial OpenOcta Server offering is not granted by the desktop
  repository's Apache license.

Do not copy the bundled ZIP skills, screenshots, mascot, binary installers, or
marketplace entries into jeo-skills merely because the root source is Apache-2.0.
Inspect the exact asset and its provenance first.

Primary license:
https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/LICENSE

## Source-of-truth order

When claims disagree, use this order:

1. exact release metadata and checksums for downloadable artifacts;
2. source code at the pinned commit for runtime behavior;
3. tests at the pinned commit for observable contracts;
4. configuration and security docs for intent, checked against source;
5. README and website for positioning only;
6. third-party articles only as discovery leads.

A status badge, README sentence, or search snippet is not evidence that a release,
endpoint, or feature exists today.

## Verified drift at v1.0.8

### Release number

- `README.md` calls v1.0.6 the latest release.
- GitHub Releases identifies v1.0.8 as latest and points it at the audited commit.
- Use `https://api.github.com/repos/openocta/openocta/releases/latest` or an exact
  release page instead of parsing README prose.

### Toolchain

- The README badge says Go 1.24+.
- `src/go.mod` declares `go 1.26.0`.
- Use the module file for a source build and verify that the required Go version
  is available before installing dependencies.

### Gateway port

- `src/pkg/paths/paths.go` sets `defaultGatewayPort = 18900`.
- desktop code and service packaging also use 18900.
- one Cobra help string in `src/cmd/openocta/commands/gateway.go` says the default
  is 18789.
- Treat 18900 as runtime source truth unless config or environment overrides it.

### Platform surface

- Product prose emphasizes Windows and macOS desktop installation.
- v1.0.8 also publishes Linux amd64 and arm64 DEB, RPM, and tar archives.
- the Linux package post-install script enables and starts a systemd service.
- Do not infer that Linux has the same desktop UI, signing, state location, or
  trust boundary as a macOS or Windows package.

### Documentation links

At the audited pin, README links to files that are absent:

- `docs/compare-openclaw-hermes.md`
- `CONTRIBUTING.md`

The repository also has no root `SECURITY.md`. Some documentation points at
`docs.openocta.ai`, which did not resolve during the audit. The docs themselves
state that source should win when implementation and prose disagree.

### Skills implementation lineage

The README says the architecture was inspired by OpenClaw's gateway protocol and
control UI experience. Runtime paths retain compatibility names:

- `CLAWDBOT_STATE_DIR`
- `CLAWDBOT_CONFIG_PATH`
- `CLAWDBOT_GATEWAY_PORT`
- `OPENCLAW_BUNDLED_SKILLS_DIR`
- `OPENCLAW_CONTROL_UI_BASE_PATH`

The UI package is still named `openclaw-control-ui`. These are useful migration
and troubleshooting facts. They do not prove that every OpenClaw behavior is
compatible.

Some docs describe an `agentsdk-go` foundation, while `src/go.mod` does not list
that module and the current implementation imports CloudWeGo Eino and related
packages. Use the current module graph and source code for implementation claims.

## Live service caveats at the audit date

- `openocta.com` resolved and served the public site.
- `resource.openocta.com`, advertised as the Skills marketplace, did not resolve.
- `amc.openocta.com`, advertised for the enterprise offering, did not resolve.
- an open issue reported marketplace installation failures.
- GitHub showed no published security advisories, which is not proof that no
  vulnerability exists.

Recheck live endpoints before telling a user to depend on them. Prefer GitHub
release assets and the separately auditable `openocta/openocta_skills` source
when marketplace infrastructure is unavailable.

## Security-significant source defaults

Two source behaviors are broader than the surrounding configuration prose makes
obvious:

### CozeLoop trace export

When the top-level `cozeloop` config section is absent,
`resolveCozeLoopSettings` sets export enabled and uses a workspace identifier and
API credential embedded in source. `SetupCozeLoop` then installs a global Eino
callback handler. The helper never prints the bundled credential.

Treat omission as enabled at this pin. Set `cozeloop.enabled: false` explicitly
unless the user approves trace export and provides an operator-owned workspace,
credential, retention policy, and egress boundary. Environment variables can
also re-enable a section whose flag is false when both credential and workspace
are present, so verify the process environment by key presence without printing
values.

### Local CLI agent delegation

`LocalAgentsConfig.IsEnabled` returns true when the section or `enabled` field is
absent. An empty `allowed` list permits every recognized installed local agent,
and the `local_agent` tool can run multiple Codex, Cursor, OpenCode, Trae, Hermes,
or OpenClaw tasks. Although the schema defines `requireApproval`, the audited
`local_agent` tool and runner do not read that field.

Set `localAgents.enabled: false` unless delegation is intentional. If it is
needed, use a short `allowed` list and govern the tool through the effective
command policy and approval queue; do not rely on `requireApproval` alone.

## Repository hygiene observations

These observations are review leads, not a malware verdict:

- `src/.env`, `src/embed/.env`, and `ui/.env` are tracked. At this pin they
  contain build and site API settings, not a live model credential; the UI value
  points at a private-network site API endpoint, so the auditor reports its key
  name but deliberately suppresses the value.
- `.DS_Store` is tracked despite a matching ignore rule.
- several bundled Skill archives have no license file.
- the source references a personal fork for one WeCom SDK dependency.
- package startup can terminate other processes with the OpenOcta executable
  names unless the singleton-kill override is set.

A future pin must be re-audited rather than inheriting this conclusion.

## Reproducible checks

```bash
git clone --filter=blob:none https://github.com/openocta/openocta.git
git -C openocta checkout 6b130c72cdc40d8b3bed304d3e6a64345e3d2622
python3 .agent-skills/openocta/scripts/audit-openocta.py source \
  --repo openocta \
  --expect-commit 6b130c72cdc40d8b3bed304d3e6a64345e3d2622 \
  --format json
```

The helper is intentionally read-only. A `WARN` result at this pin records known
drift and archive-license gaps; a `BLOCKED` result means the source path, origin,
commit, required files, or license marker did not match the contract.

## Primary sources

- Pinned tree: https://github.com/openocta/openocta/tree/6b130c72cdc40d8b3bed304d3e6a64345e3d2622
- v1.0.8 release: https://github.com/openocta/openocta/releases/tag/v1.0.8
- Environment variables: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/docs/environment-variables.md
- Security model: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/docs/security.md
- Architecture: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/docs/architecture.md
- Module graph: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/src/go.mod
- CozeLoop trace setup: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/src/pkg/agent/eino/cozeloop.go
- Local-agent tool: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/src/pkg/agent/tools/local_agent_tool.go
