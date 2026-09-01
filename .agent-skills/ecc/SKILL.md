---
name: ecc
description: >
  Install, configure, verify, update, or recover affaan-m/ECC, the MIT-licensed
  agent harness with native Claude Code and Codex plugins plus selective adapters
  for other supported clients. Use when the user names ECC, Everything Claude Code,
  ecc-universal, ecc@ecc, `ecc setup`, or an ECC plugin, hook, rule, skill, or
  harness installation. Route generic agent-team design to `harness`, delivery
  workflow selection to `agentic-skills`, and BMAD phase selection to `bmad`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  ECC's universal package requires Node.js 18 or newer. Claude plugin setup also
  requires Git and Claude Code 2.1 or newer. Native Codex plugin support depends
  on the installed Codex release and requires its explicit hook-trust decision.
license: MIT
metadata:
  version: "2.2.1"
  source: https://github.com/affaan-m/ECC
---

# ECC agent harness

ECC is an external operating layer that adds agent skills, commands, hooks, rules,
and platform adapters. It is not a replacement for this catalog's generic planning,
testing, or team-design skills. Choose one ECC installation method per harness;
layering native plugins, manual copies, or legacy syncs can duplicate hooks,
commands, and skills.

## When to use this skill

- Install, configure, update, inspect, or recover ECC.
- Choose the native ECC path for Claude Code, Codex, Kimi Code, or another supported
  harness.
- Resolve an ECC plugin-scope conflict, duplicate installation, hook profile, or
  upgrade issue.
- Audit an existing ECC checkout or configuration before a mutation.

Do not use this skill merely because a coding task needs planning, tests, review, or
multiple agents. Use `harness` to design a bespoke team, `agentic-skills` for generic
quality-gated delivery, and `bmad` for BMAD packet routing.

## Instructions

### 1. Inventory before selecting an installer

Run the local read-only helper first:

```bash
bash .agent-skills/ecc/scripts/ecc.sh doctor
```

Then inspect the selected harness without changing it:

```bash
claude plugin marketplace list --json
claude plugin list --json
# or
codex plugin marketplace list --json
codex plugin list --json
```

Record the harness, existing `ecc@ecc` installation(s), scope or active plugin state,
and whether hooks are already enabled. Do not treat a binary's presence as proof that
ECC is installed.

### 2. Pick exactly one supported path per harness

| Harness | Preferred install path | Do not combine with |
| --- | --- | --- |
| Claude Code | ECC's `ecc setup` plugin workflow or Claude native plugin commands | full/manual ECC install |
| Codex | native `codex plugin` marketplace workflow | legacy `sync-ecc-to-codex.sh` |
| Kimi Code | project-local `ecc install --target kimi` | Claude hook-profile setup |
| Other supported adapters | selected `install.sh --target <target>` profile | a second adapter for the same harness |

Read [installation and recovery](references/installation-and-recovery.md) before
choosing a path. For a planned command without mutation, use:

```bash
bash .agent-skills/ecc/scripts/ecc.sh plan claude user standard
bash .agent-skills/ecc/scripts/ecc.sh plan codex
```

### 3. Preview and confirm every mutating install

For Claude Code, choose an explicit `user`, `project`, or `local` scope and one hook
profile: `off`, `minimal`, `standard`, or `strict`. Preview before applying:

```bash
npx --yes --package ecc-universal ecc setup --mode claude-plugin \
  --scope <scope> --hooks <hooks> --dry-run --json
```

For Codex, inspect the marketplace and current plugin list before adding ECC. For a
project-local adapter, run its installer with `--dry-run --json` from a trusted ECC
checkout. A plan must name the exact target directory, plugin scope, hook choice,
and whether an existing installation will be updated or migrated.

Present that plan and get confirmation before any command that installs a plugin,
changes a scope, writes a project adapter, or enables hooks. Never use a bare
interactive `ecc setup` through a non-TTY agent shell.

### 4. Apply the approved path and verify it separately

Use the same explicit options without `--dry-run` only after confirmation. For example:

```bash
npx --yes --package ecc-universal ecc setup --mode claude-plugin \
  --scope <scope> --hooks <hooks> --yes --json
```

Verify the provider-owned state, not only ECC's exit code:

```bash
claude plugin list --json
# or
codex plugin list --json
```

Require one enabled `ecc@ecc` entry at the approved Claude scope, or the expected
active Codex plugin state. Restart or reload the host only after successful provider
verification. Codex hook trust is provider-owned; do not claim that Claude's four hook
profiles apply to Codex.

### 5. Update or recover without widening scope

Re-inventory before an update. Re-run the selected native path at the existing target;
do not switch to a manual/legacy path to work around a conflict. Use a recovery or
repair dry run before a repair that writes managed files. Never run ECC's automatic
update workflow during blanket setup: it fetches and pulls an existing checkout before
reinstalling recorded targets.

## Safety boundaries

- Use only ECC's official GitHub repository, `ecc-universal` npm package, or `ecc@ecc`
  marketplace plugin; do not install a re-upload or mirror.
- Keep Claude Code, Codex, and every other harness as separate installation decisions.
- Do not copy plugin components by hand, overwrite a provider configuration, or delete
  a conflicting ECC scope without first reading the provider inventory and recovery.
- Hook activation changes local automation. Make it an explicit, recorded choice.
- An ECC installation is not proof that a project has passed its tests, review, or
  deployment gates.

## Examples

- Inspect an existing Claude Code installation before selecting an ECC scope or hook profile.
- Preview a Codex marketplace installation and wait for the provider's hook-trust decision.
- Recover one duplicate ECC installation through the original native path instead of adding a second adapter.

## Best practices

- Keep the chosen harness, scope, hook mode, and provider verification result in the change record.
- Use native provider inventory as the source of truth for installed plugin state.
- Treat provider updates, scope migrations, hook changes, repairs, and automatic updates as separate mutations.

## References

- [Installation and recovery](references/installation-and-recovery.md)
- [ECC repository](https://github.com/affaan-m/ECC)
- [Upstream configuration skill](https://github.com/affaan-m/ECC/blob/main/skills/configure-ecc/SKILL.md)
