---
name: aidlc-workflows
description: >
  Operate awslabs/aidlc-workflows (AI-DLC, the AI-Driven Development Life Cycle, MIT-0): a harness-neutral
  workflow engine installed as the native `aidlc` command that configures Claude Code, Kiro, Codex CLI, Cursor,
  opencode or GitHub Copilot with agents, workflow profiles, staged phases and human approval gates, started with
  `/aidlc` (`$aidlc` in Codex). Use when the user names AI-DLC, AIDLC, aidlc-workflows, `aidlc config` or `/aidlc`,
  wants to install or pin it, pick a profile such as express, bugfix or enterprise, wire it into a project, or audit
  what it writes, pre-approves and registers. Choose harness and scope first, preview with `aidlc config --dry-run`,
  and keep MCP servers, host trust, Bedrock settings and guard bypasses behind separate approval. Do not use for a
  one-off coding task, for spec-kit or BMAD, or for editing the upstream repository. Triggers on: AI-DLC, AIDLC,
  aidlc config, /aidlc, aidlc-workflows, AI-Driven Development Life Cycle, AI 주도 개발 수명주기, 에이아이디엘씨.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  macOS x64/arm64, Linux x64/arm64 (glibc or musl) or Windows x64; a native install needs no Python, Node.js or Bun.
  The Unix installer needs curl or wget plus sha256sum or shasum and refuses root. The install writes under the
  user's home, `aidlc config` writes hooks, settings and instruction blocks into a project, and the harness runs those
  hooks on the user's machine, so every step below is a disclosure and write decision.
license: MIT-0
metadata:
  version: "1.0.0"
  source: https://github.com/awslabs/aidlc-workflows
  upstream_commit: a8721be3631e6a254cf524ea57e5932aa56b4149
---

# AI-DLC operator

Adopt AI-DLC deliberately: pick the harness and the profile, run the offline gate, preview every write, then let the
user drive the approval gates. This skill was audited against release `v2.11.3` (commit
`a8721be3631e6a254cf524ea57e5932aa56b4149`, 2026-11-04); audited facts, the pin and the differences from
unreleased `main` are in [`references/upstream.md`](references/upstream.md).

## When to use this skill

- Install AI-DLC, check an existing install, pin a project to a release, update, roll back or uninstall.
- Configure a project for one harness and decide model provider, MCP consent and plugins.
- Choose between profiles (`classic`, `express`, `feature`, `enterprise`, `mvp`, `poc`, `bugfix`, `refactor`, `infra`, `security-patch`, `workshop`) or the adaptive composer.
- Audit what AI-DLC pre-approves, which hooks it registers and which MCP servers it starts.
- Not for a single coding task (just do it), for GitHub's Spec-Driven Development (`spec-kit`), for the BMAD method (`bmad`), or for slicing a backlog (`task-planning`).

## Instructions

### 1. Decide harness, profile and scope before anything else

| Decision | Rule |
|---|---|
| Harness | One of Claude Code, Kiro (IDE or CLI), Codex CLI, Cursor, opencode, GitHub Copilot. Harness ids changed after v2.11.3 (Kiro v3 is `kiro-ide` at the pin and `kiro` on main), so read `aidlc config --help` on the installed release before scripting `--harness`. |
| Profile | `poc`, `bugfix`, `express`, `refactor` and `security-patch` run 5 to 7 stages at minimal depth, and `express` and `bugfix` also switch ceremonies off; they suit well-understood work. Ambiguous, cross-team, regulated or architecture-heavy work wants `feature` or `enterprise`; unknown work wants the composer. |
| Scope | The install is per user. A project is changed only by `aidlc config` run from that project, and only with the user's approval of the directory. |

### 2. Run the offline gate first

The helper reads host facts and, with `--project`, names and pins in a project; with `--repo`, a checkout. It never
runs `aidlc`, the installer, `gh`, a harness or git beyond reading a checkout's HEAD, opens no sockets and writes
nothing:

```bash
python3 .agent-skills/aidlc-workflows/scripts/preflight.py --json
python3 .agent-skills/aidlc-workflows/scripts/preflight.py --project /path/to/project --json
python3 .agent-skills/aidlc-workflows/scripts/preflight.py --repo /path/to/aidlc-workflows --expect-commit a8721be3631e6a254cf524ea57e5932aa56b4149 --json
```

An installed skill uses `python3 "$SKILLS_ROOT/aidlc-workflows/scripts/preflight.py"`. It reports platform support, the
installer's download and checksum tools, root or sudo, existing installs, environment overrides that redirect downloads
or the provenance trust root, guard-bypass variables (names only), and for a project the pin, pre-approved permissions,
hook counts and MCP servers (host names only, header values never read).

### 3. Gate every side effect

Require separate explicit approval for each:

1. **Running the installer.** It downloads and executes code and writes `~/.local/share/aidlc` and `~/.local/bin/aidlc` (Windows: `%LOCALAPPDATA%\aidlc` and the User PATH). Prefer download first, then run: fetch `install.sh` to a temporary directory, optionally verify it with `gh attestation verify` against `awslabs/aidlc-workflows/.github/workflows/release.yml`, then `sh` it. The README's `curl ... | sh` skips both. Without a compatible `gh` only SHA-256 protects the install, and there is no OS code-signing.
2. **`aidlc config` in a project.** It writes a harness tree with hooks and settings, an `aidlc/` workspace, a marked block in `.gitignore` (and in `AGENTS.md` for every harness except Claude Code), and for Claude a pre-approved `Edit(/**)`. Run `aidlc config --harness <id> --dry-run` first and apply it with the printed `--plan-token`.
3. **MCP servers.** Choose `--mcp none` unless the user wants them: `defaults` registers `context7` (needs `CONTEXT7_API_KEY`) and four AWS servers started with `uvx ...@latest`, which runs whatever the registry publishes at each start. `--yes` never adds MCP entries.
4. **Host trust.** Kiro's "Trust Folder", Codex's `/hooks` trust and Copilot's trusted folders let hooks run commands. They are the user's own acts; never perform or script them.
5. **Providers.** `aidlc config providers --provider amazon-bedrock` writes a region and profile to `.claude/settings.local.json` and relies on the user's AWS credentials; model access and IAM cannot be checked offline.
6. **Guard bypasses and flags.** `aidlc config flags --bypass NAME` or `/aidlc config set guard.<fence> off` weakens a check. Do it only on an explicit request for one named switch, and give the `--clear-bypass` undo.
7. **Pin, update, use, uninstall.** `aidlc update`, `config --pin` and `config --download` can reach the release host; `uninstall` removes files. Say what each changes first.
8. **Running a workflow.** `/aidlc` edits files, runs sensors (linters, type checks) and spends model tokens. Approval gates belong to the user: never answer one for them, and grant "Continue automatically" only when they choose it.

### 4. Follow the matching reference branch

- Install, authentication, roots, Windows and Alpine → **Install and authentication** in `references/upstream.md`.
- What config writes, pins, coexistence → **What `aidlc config` writes**.
- Permissions, hooks, sensors, trust → **Hooks, permissions and sensors**; MCP → **MCP servers**.
- Providers and bypasses → **Providers, flags and bypasses**; profiles → **Profiles**.
- Network behavior and telemetry → **Network surface**; release drift → **Release versus main**.

### 5. Verify narrowly

After approval, run `aidlc doctor` (add `--project-dir` for another project; `--check-updates` contacts the release
host) and `aidlc config trust --check`, then start a small `bugfix` or `poc` on a throwaway branch and read the first
approval gate before widening. Report what was not exercised.

## Examples

### "Set up AI-DLC for Claude Code in this repo"

Run the preflight with `--project`, report platform, tools, existing installs and any pre-approved permissions, propose
the download-first install and `aidlc config --harness claude --mcp none --dry-run`, and ask before applying either.

### "Fix this login timeout bug with AI-DLC"

Recommend `/aidlc bugfix` (6 stages, minimal depth, regression test), note that it turns learnings and summary
confirmation off, and keep the gates with the user. If the bug's cause is unknown, suggest `feature` instead.

## Best practices

- Treat `references/upstream.md` as a snapshot of v2.11.3; newer releases change harness ids, profile stage counts and hooks, so read `aidlc config --help` and the installed docs first.
- Prefer `--mcp none`, a pinned `.aidlc-version` committed with the project, and `--dry-run` before every config change.
- Keep the helper honest: a found `aidlc` is never executed, so an installed version is unverified until `aidlc version` is run with approval.
- Report host trust, MCP registration and provider access as pending until the user has done and verified them.

## References

- [Audited AI-DLC facts, hazards and pin](references/upstream.md)
- [Pinned source manifest](references/source.json)
- [README at the audited commit](https://github.com/awslabs/aidlc-workflows/blob/a8721be3631e6a254cf524ea57e5932aa56b4149/README.md)
- [Install and Lifecycle guide](https://github.com/awslabs/aidlc-workflows/blob/a8721be3631e6a254cf524ea57e5932aa56b4149/docs/guide/18-install-and-lifecycle.md)
- [Workflow profiles](https://github.com/awslabs/aidlc-workflows/blob/a8721be3631e6a254cf524ea57e5932aa56b4149/docs/guide/workflow-profiles.md)
- [MIT-0 license at the pin](https://github.com/awslabs/aidlc-workflows/blob/a8721be3631e6a254cf524ea57e5932aa56b4149/LICENSE)
- [Offline helper](scripts/preflight.py)
