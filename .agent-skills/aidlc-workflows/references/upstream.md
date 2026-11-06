# AI-DLC audited reference

Audit of [`awslabs/aidlc-workflows`](https://github.com/awslabs/aidlc-workflows) at release tag
[`v2.11.3`](https://github.com/awslabs/aidlc-workflows/releases/tag/v2.11.3), commit
[`a8721be3631e6a254cf524ea57e5932aa56b4149`](https://github.com/awslabs/aidlc-workflows/tree/a8721be3631e6a254cf524ea57e5932aa56b4149)
(committed 2026-11-04T05:46:34Z, "promote v2.11.3-preview.20261103.1 as v2.11.3"; release published
2026-11-04T06:09:40Z), observed 2026-11-06. License: MIT No Attribution (MIT-0). The pin is the release commit
because `releases/latest/download/install.sh` installs that release. Unreleased `main` had already moved to
`df98e29e55eb413c2b84473db8f10c8650d98112` (2026-11-06T04:46:58Z) and its docs differ (see
[Release versus main](#release-versus-main)). `references/source.json` records the SHA-256 of the 10 files this
audit read.

## Identity

"AI-DLC (AI-Driven Development Life Cycle) turns AI coding assistants into structured, verifiable
software-delivery workflows." One harness-neutral core (`core/`) with thin per-harness projections
(`harness/<name>/`) for Claude Code, Kiro (IDE and CLI), Codex CLI, Cursor, opencode and GitHub Copilot.
Counted at the pin: 14 agent files in `core/agents` (the README says 11 domain experts, 2 reviewers and an
adaptive composer), 11 profile ("scope") files in `core/scopes`, and 33 stage files in
`core/aidlc-common/stages` across five phases (initialization 3, ideation 7, inception 9, construction 7,
operation 7). The README at the pin claims a 131-event audit trail; this audit did not count events.

## Install and authentication

- README quick start: `curl -fsSL https://github.com/awslabs/aidlc-workflows/releases/latest/download/install.sh | sh`
  (PowerShell: `irm .../install.ps1 | iex`). The install guide (`docs/guide/18-install-and-lifecycle.md`) documents
  the safer shape: download `install.sh` to a temporary directory, run it, and optionally authenticate the script
  first with `gh release download` plus `gh attestation verify ... --signer-workflow awslabs/aidlc-workflows/.github/workflows/release.yml`.
- Per user, no `sudo`. The Unix installer refuses root; `--allow-root` (or `AIDLC_ALLOW_ROOT=1`) is only for a
  container, CI job or agent sandbox where root is the only user, and is refused under `sudo`.
- Unix writes versions to `${XDG_DATA_HOME:-$HOME/.local/share}/aidlc/versions/`, a launcher at `$HOME/.local/bin/aidlc`,
  and a plugin catalogue at `.../aidlc/plugins/`. It edits a shell startup file only with an explicit
  `--profile <absolute-path>`. Windows uses `%LOCALAPPDATA%\aidlc\` and registers its bin directory in the User PATH
  unless `-NoModifyPath`. The installer asks no harness question: every harness runtime comes with the binary.
- Integrity (`scripts/install.sh` confirms the download tool, `sha256sum`/`shasum` and `gh attestation` branches):
  `version.json`, `checksums.txt` and `aidlc-release.intoto.jsonl` are fetched; SHA-256 and declared byte length are
  mandatory for the binary and harness archives; with a compatible GitHub CLI the `checksums.txt` attestation is also
  verified, otherwise provenance verification is skipped and only checksums protect the install. There is no OS
  code-signing or notarization. Metadata is capped at 1 MiB and each asset at 1 GiB; archive extraction rejects
  links, special files, traversal and duplicates. The installer yields to an existing Homebrew or Nix `aidlc`.
- `AIDLC_RELEASE_BASE_URL`, `AIDLC_RELEASE_REPOSITORY`, `AIDLC_RELEASE_WORKFLOW`, `AIDLC_CA_BUNDLE` and `AIDLC_GH_BIN`
  redirect downloads or the provenance trust root; changing the base URL alone does not change the trusted signer.
- Release assets (v2.11.3): `aidlc-{darwin-arm64,darwin-x64,linux-arm64,linux-arm64-musl,linux-x64,linux-x64-musl}`,
  `aidlc-windows-x64.exe`, `aidlc-runtime-2.11.3.tar.gz`, `aidlc-copy-runtime-2.11.3.tar.gz` (+ `.sha256`),
  `checksums.txt`, `aidlc-release.intoto.jsonl`, `version.json`, `install.sh`, `install.ps1`. Alpine needs the system
  `libgcc` and `libstdc++` first; the installer prints that command and never installs system packages.

## The six public commands

`aidlc --help` lists exactly `config`, `doctor`, `version`, `update`, `use` and `uninstall`; hidden `engine` and
`system` namespaces exist. Exit codes: 0 success, 1 operational failure, 2 usage or invalid machine configuration,
3 required network result or retained runtime unavailable, 4 integrity or ownership refusal, 5 check completed and
action required. `--json` and `--quiet` are supported; destructive commands ask nothing at a terminal (they print
what they remove) and need `--yes` without one.

## What `aidlc config` writes

`aidlc config` is transactional and works from the release already installed; it downloads one only when you agree
at the prompt or pass `--download`. It creates the selected harness tree, an `aidlc/` workspace shell, root
integrations, a projection stamp and an ownership baseline, but no workflow intent. `--dry-run` previews and prints a
plan token; applying with that `--plan-token` fails closed if the source or project state changed.

| Surface | Policy at the pin |
|---|---|
| `.gitignore` | one marked AI-DLC block; bytes outside it are preserved |
| `AGENTS.md` | one marked block for Kiro, Codex, Cursor, opencode and Copilot; project instructions preserved |
| `.mcp.json` (Claude), `.kiro/settings/mcp.json` (Kiro CLI) | consent-managed MCP entries; see below |
| `opencode.json`, `.vscode/settings.json` | AI-DLC adds its own entries only where absent and records what it wrote |
| Harness tree (`.claude/`, `.kiro/`, `.codex/`, `.aidlc/`, ...) | hooks, agents, skills, rules, settings; harness pairs that share `.kiro/`, `.aidlc/` or an exclusive `AGENTS.md` block cannot coexist |

A refresh while work is open is done, not refused. `aidlc config --pin <version>` writes a committed
`.aidlc-version` and registers the project in a machine-local `pins.json`; a pin to a release the machine lacks asks
before downloading.

## Hooks, permissions and sensors (Claude Code projection)

The shipped `harness/claude/settings.json` allows `Edit(/**)`, `Bash(bun .claude/tools/aidlc.ts engine *)`,
`Bash(bun .claude/tools/aidlc-*)`, `Task` and `WebSearch`, sets `AWS_AIDLC_DEFAULT_SCOPE=classic`, and registers 16
hook commands that run `bun .../aidlc.ts engine hook ...` (the copy channel; the README says a native install runs
its hooks through `aidlc` and does not call `bun`): PreToolUse 3, UserPromptSubmit 1, SessionStart 1, SessionEnd 1,
PostToolUse 7, PreCompact 1, SubagentStop 1, Stop 1. [INFERENCE] Under Claude Code's permission syntax a leading `/`
is relative to the project root, so `Edit(/**)` covers edits inside the project; confirm in Claude Code's own docs.
A Write|Edit hook (`aidlc-run-sensors.ts`) spawns `aidlc-sensor.ts fire` for each sensor attached to the active
stage; sensors such as linter and type-check run checks on your files and their verdicts become audit rows. The
`fold-usage` hook folds Claude Code transcript turns into a local usage ledger on every tool call.

Trust is the host's, not AI-DLC's: Kiro IDE asks whether to trust the folder and trusting lets `.kiro` hooks run
commands; Codex fires zero hooks until its own trust seed is accepted (`/hooks`, `t`); Copilot CLI needs the project in
its trusted folders, which AI-DLC never edits. `aidlc config trust --check` reads these without changing them.

## MCP servers

Claude's shipped `harness/claude/.mcp.json` lists five servers: `context7` (hosted HTTP at `mcp.context7.com`, key
from `CONTEXT7_API_KEY`), and four started with `uvx ...@latest`: `aws-mcp` (`mcp-proxy-for-aws` to
`aws-mcp.us-east-1.api.aws`), `aws-pricing`, `aws-iac` and `aws-serverless`. `@latest` runs whatever the registry
currently publishes at each start. Consent is `defaults` or `none`; a non-interactive run with no earlier consent
records `none`, a terminal asks, and `--yes` never adds MCP entries. Kiro CLI always ships `.kiro/settings/mcp.json`
with five servers and `none` is instruct-only there. Codex, opencode, Copilot, Kiro IDE and Cursor ship no MCP surface.

## Providers, flags and bypasses

- `aidlc config providers`: keep the harness's provider (default), or opt in to Amazon Bedrock with `--region` and
  `--profile`. Credential detection is offline: it inspects AWS environment variables, `~/.aws/config`,
  `~/.aws/credentials`, role and container credential variables and the SSO cache, and calls no network service.
  On Claude Code it writes `AWS_REGION` and optional `AWS_PROFILE` to your own `.claude/settings.local.json`.
  Model access and IAM permissions cannot be verified offline and stay as named pending actions.
- `aidlc config flags --bypass NAME` records one of 12 guard or ceremony switches (`AIDLC_SKIP_ARTIFACT_GUARD`,
  `AIDLC_SKIP_HUMAN_PRESENCE_GUARD`, `AIDLC_DISABLE_SENSORS`, `AIDLC_DISABLE_PLAN_APPROVAL_GUARD`, and others). The
  setup wizard never offers them; AI-DLC prints a one-line notice while one is on and the `--clear-bypass` command.
  Real environment variables always win over recorded settings.

## Profiles (workflow profiles, stored as scopes)

At the pin: classic 15/30 stages, express 7, feature 30, enterprise 30, mvp 20, poc 5, bugfix 6, refactor 7,
infra 10, security-patch 7, workshop 23 (counts are stages after the three initialization stages). Classic is the
engine default. Start with `/aidlc <profile>` (`$aidlc` in Codex; choose **aidlc** in Kiro IDE's agent picker), or
describe the work and AI-DLC proposes a profile or an adaptive composer route and waits for approval. Express and
bugfix switch several ceremonies off by design (reviews, learnings, summary confirmation); the guide says not to
use express for ambiguous, cross-team, regulated or architecture-heavy work.

## Network surface

Searching `core/`, `scripts/`, `harness/` and `plugins/` for URL hosts found `github.com` and `api.github.com`
(release lookup in `core/tools/aidlc-release.ts`), the MCP endpoints above, and documentation or bootstrap links
(`bun.sh`, `astral.sh`, vendor docs). Searching the same trees for telemetry, analytics, PostHog, Sentry, Datadog and
similar words found only comments about best-effort local heartbeat and metrics writes and agent knowledge text. This
is a source search, not a network capture, and the compiled binary was not inspected. `aidlc doctor --check-updates`,
`aidlc update` and `aidlc config --download` are the commands that reach the release host.

## Release versus main

Differences observed between the pin and `main` at `df98e29e`: Kiro's v3 harness is `kiro-ide` and Kiro CLI (V2) is
`kiro` at the pin, but `kiro` and `kiro-v2` on main; the Infrastructure profile is 10/30 at the pin and 12/30 on main;
main registers a SubagentStart hook the pin lacks; the README audit-trail claim is 131 events versus 132. Harness ids
change between releases, so run `aidlc config --help` for the installed release before scripting `--harness`.

## Uninstall and removal

`aidlc uninstall` removes the machine install using an explicit list of installer-owned files whose contents it checks
first; directories go only when empty, and changed, unlisted or linked files are kept and reported once. Without
`--purge` machine config, the update cache, pin registrations and the default harness are also kept; `--purge` selects
those known machine records for removal and does not broaden deletion to unrelated files. It refuses filesystem, home,
shared-system and project roots and root-owned, package-manager-owned or mixed-ownership commands; without a terminal it
needs `--yes`. On Windows both forms remove only the User PATH entry recorded in `windows-path.json`. Removing AI-DLC
from a project is a separate manual sequence in the guide (keep your records, delete AI-DLC's own files, take its marked
blocks out of shared files, check).

## Not verified

No installer, `aidlc` command, harness session, `gh attestation verify`, MCP server or network request was run during
this audit; the helper was exercised on fixture projects and the pinned checkout only. Versions on PATH are never
executed, so `runtime_verified` is always false. The audit-event count, the 131/132 difference, harness behavior and
Windows paths were not tested.
