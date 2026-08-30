# Skills, MCP, Channels, and Builds

## Keep the two skill systems distinct

This jeo-skills entry teaches an agent how to operate the named OpenOcta product.
OpenOcta also has its own runtime Skill loader. The two systems both use a
`SKILL.md` name, but tool IDs, loading paths, metadata expectations, packaging,
and runtime authority can differ.

Do not promise that a jeo-skills folder is a drop-in OpenOcta Skill. Port the
behavior deliberately and translate tools to those actually registered in the
target OpenOcta runtime.

## OpenOcta Skill loading

At the audited pin, upstream documents this precedence:

1. workspace Skills;
2. managed Skills under `~/.openocta/skills`;
3. bundled Skills;
4. extra directories configured in `skills.load.extraDirs`.

A higher-precedence same-name Skill can shadow a lower one. Before debugging a
Skill, enumerate every loaded source and record which path won. Do not delete a
shadowed copy until ownership and rollback are clear.

OpenOcta accepts a folder with `SKILL.md` and also documents a bare Markdown
form. Prefer a folder for references, prompts, examples, scripts, tests, and
versioned metadata.

## Author or port a Skill

### Step 1: Freeze the job

State:

- exact OpenOcta trigger and non-trigger cases;
- registered tool IDs and permissions;
- model and runtime assumptions;
- filesystem and network boundary;
- credentials and external systems;
- expected observable output;
- approval and rollback rules.

Route generic reusable Agent Skill design to `skill-standardization` or
`write-a-skill`. Return here for OpenOcta loader, tool, upload, and execution
contracts.

### Step 2: Inspect real tools

The separate `openocta/openocta_skills` repository includes examples using
OpenOcta-specific tool names such as database query and slow-log tools. A
jeo-skills frontmatter line such as `Bash Read Glob Grep` does not prove those
names exist or carry the same authority in OpenOcta.

List the target runtime's registered tools. For each one, record:

- input schema;
- read versus mutation behavior;
- target selection;
- authentication source;
- output and error shape;
- timeout, row, size, and cost limits;
- approval requirement.

### Step 3: Write the smallest portable package

Upstream upload guidance expects `SKILL.md` with at least name, description, and
allowed tools. The name should be lowercase letters, digits, and hyphens. ZIP
uploads are limited to 50 MB in the documented local upload path.

Use only the support folders required by the workflow. Never include:

- API keys, bot tokens, passwords, SSH material, cookies, or live config;
- production data, logs, customer content, or internal host lists;
- dependency caches, virtual environments, binaries, or generated indexes;
- another project or vendor's Skill without license and provenance review.

### Step 4: Static review before installation

Read the complete package, including scripts and references. Check:

- prompt injection and authority expansion;
- subprocess, shell, PowerShell, network, browser, database, and cloud calls;
- encoded or downloaded code;
- persistence, hooks, schedules, or self-modification;
- hidden paths and symlinks;
- dependency and license boundaries;
- destructive defaults and missing confirmation gates.

### Step 5: Install locally, then test

Upstream says its upload target is the local managed directory, not automatic
publication to the website marketplace. Review the destination and same-name
shadowing, confirm installation, then test in a disposable workspace with a
harmless request.

Verify that:

- the intended Skill loaded from the intended path;
- non-trigger requests did not select it;
- tool schemas matched;
- denied operations stayed denied;
- no credential value appeared in output;
- uninstall or rollback restored the prior loader state.

Marketplace publication is a separate external action with its own license,
review, identity, and approval. The advertised marketplace hostname did not
resolve during the 2026-08-30 audit, so recheck it before offering that path.

## Bundled digital employees

A digital employee composes role, prompt, tools, Skills, memory, schedules, and
possibly channels. Treat installation as a bundle of authority, not a persona
skin.

Before enabling one:

1. enumerate every bundled Skill and tool;
2. map credentials and network targets;
3. remove unused mutation capabilities;
4. inspect schedules and inbound channels;
5. run a read-only test in a non-production environment;
6. confirm the final authority set;
7. record disable and removal steps.

Do not redistribute the ZIP payloads from `deploy/inner_skills/`; none includes a
license file at the audited pin.

## MCP servers

MCP adds a server process and tools to the agent boundary. For each server,
record:

- package or binary source and exact version;
- transport and command;
- working directory;
- environment key names, never values;
- network destinations;
- tool names and schemas;
- data read and mutation scope;
- lifecycle, timeout, update, and removal.

Install or start one server at a time. Use a read-only tool to validate it before
enabling mutations. A successful connection does not prove the declared sandbox
contains the server's own subprocess or network behavior.

OpenOcta expands environment references for MCP processes from its process
environment. Existing OS variables can override JSON-backed values, so diagnose
key precedence without echoing the value.

## Channels

Upstream documents Feishu, DingTalk, WeCom, WeChat, QQ, Telegram, and other
channel surfaces, but implementation depth varies by channel and release. Read
the source and current issue state for the exact channel rather than assuming
feature parity.

Channel rollout packet:

- provider and channel type;
- inbound transport and callback or stream mode;
- sender, group, and conversation allowlists;
- mention or command requirement;
- attachment policy;
- reply authority;
- execution authority;
- credential storage and rotation;
- test conversation;
- disable and revoke path.

Creating a provider bot, saving its credential, sending a test message, and
enabling OpenOcta are separate external changes. Obtain confirmation at each
materially different consequence.

## Webhooks and schedules

A webhook can wake an agent outside an interactive session. A schedule can do so
repeatedly. Require authentication, event validation, bounded target agent, tool
allowlist, idempotency, timeout, concurrency, spend cap, and audit records.

Never embed untrusted event content in a system prompt or shell command. Parse it
as data, validate it, and let a narrow workflow decide what evidence to read.

## Knowledge Vault

Knowledge Vault stores operational source material and derived indexes locally.
Before importing content, classify:

- public versus internal;
- personal or customer data;
- credential and secret risk;
- retention and deletion;
- source of truth and update owner;
- embedding provider and possible egress;
- backup and restore.

An index is derived data, not the only copy. Verify deletion in source, index,
cache, and backup according to the agreed retention contract.

## Source build

### Toolchain truth at the audited pin

- Go module: `github.com/openocta/openocta`
- Go directive: 1.26.0
- UI: npm project with Vite and Vitest
- desktop packaging: Wails v2 and platform-specific signing/installer tools
- root build: UI, embedded assets, then Go binary

The repository has 74 Go test files and a separate UI test surface. There is no
active GitHub Actions workflow at this pin; local results and release artifacts
must be verified directly.

### Read before execution

```bash
git -C /path/to/openocta status --short
git -C /path/to/openocta rev-parse HEAD
sed -n '1,220p' /path/to/openocta/Makefile
sed -n '1,120p' /path/to/openocta/src/go.mod
node -e "const p=require('/path/to/openocta/ui/package.json'); console.log(p.scripts)"
```

Dependency installation reaches external registries and can run lifecycle
scripts. Review lockfiles, registries, proxy settings, and disk requirements
before `npm install`, Go module download, Wails installation, or packaging tools.

### Test order

```bash
cd /path/to/openocta/src
go test ./...

cd /path/to/openocta/ui
npm test

cd /path/to/openocta
make build
```

Run the narrow changed package first. `make build` invokes npm install through
the root Makefile, so it is not a pure compilation step. Do not run release,
signing, notarization, package publication, or installer execution as a generic
validation shortcut.

### Build verification

Record:

- commit and worktree state;
- Go, Node, npm, and Wails versions;
- dependency lock state;
- test command and exact result;
- artifact type, architecture, digest, and path;
- whether it was only built, installed locally, signed, or published.

A green build does not mean an installer is published or a gateway is running.

## Contribution boundary

The repository has no root `CONTRIBUTING.md` or `SECURITY.md` at the audited pin.
Before opening an issue or pull request, inspect current templates and maintainer
activity. Never include production config, logs with secrets, tokens, internal
hostnames, or customer data in an issue.

Use source line evidence for a bug report. If docs and implementation disagree,
state both and propose the smallest verified correction.

## Primary sources

- Skills: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/docs/skills.md
- Skill creation: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/docs/skill-create-guide.md
- MCP: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/docs/mcp-configuration.md
- Channels: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/docs/channels-overview.md
- Digital employees: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/docs/digital-employees.md
- Knowledge Vault: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/docs/knowledge-vault.md
- Build Makefile: https://github.com/openocta/openocta/blob/6b130c72cdc40d8b3bed304d3e6a64345e3d2622/Makefile
- Separate upstream Skills repo: https://github.com/openocta/openocta_skills
