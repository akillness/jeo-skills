---
name: ecc
description: >
  Install, configure, verify, update, or recover affaan-m/ECC, the MIT-licensed
  agent harness with native Claude Code and Codex plugins plus selective adapters
  for other supported clients. Use when the user names ECC, Everything Claude Code,
  ecc-universal, ecc@ecc, `ecc setup`, or an ECC plugin, hook, rule, skill, or
  harness installation. Route generic agent-team design to `harness2`, delivery
  workflow selection to `agentic-skills`, and BMAD phase selection to `bmad`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  ECC's universal package requires Node.js 18 or newer. Claude plugin setup also
  requires Git and Claude Code 2.1 or newer. Native Codex plugin support depends
  on the installed Codex release and requires its explicit hook-trust decision.
license: MIT
metadata:
  version: "2.2.2"
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
multiple agents. Use `harness2` to design a bespoke team, `agentic-skills` for generic
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

### 2. Review each branch with the current Jev profile

Use the current coding-agent host's assigned `JEV_PROFILE`, selected through
[Jev control plane](../jev-control-plane/SKILL.md). Keep that profile for the
whole flow; do not borrow another host's profile or assume `jeopi` is a default.
Inspect its status before a review:

```bash
node ~/.agents/jev/jev-harness.mjs --profile "${JEV_PROFILE:?Select the current agent profile first}" status
```

Review these decisions when the configured profile is available:

- **Entry routing.** When the request could belong to ECC or to `harness2`,
  `agentic-skills`, or `bmad`, route once and follow the selected skill:

  ```bash
  node ~/.agents/jev/jev-harness.mjs --profile "${JEV_PROFILE:?Select the current agent profile first}" route-skills --top-k 1 "<task>"
  ```

  Continue here only when `ecc` is selected. An unavailable routing result leaves
  the choice with the user rather than selecting an arbitrary skill.

- **Later branches.** Review the installation path, Claude scope and hook profile,
  dry-run-to-apply gate, and each update or recovery choice using an exact proposal:

  ```bash
  node ~/.agents/jev/jev-harness.mjs --profile "${JEV_PROFILE:?Select the current agent profile first}" review "<task>" '<proposal-json>'
  ```

  `bash .agent-skills/ecc/scripts/ecc.sh plan <target> ... --proposal` emits the
  proposal as its final `jevproposal=` line. Review those exact commands and
  normalized choices, not a paraphrase. The helper only prints plans; it does
  not call Jev or perform the installation.

Record the verdict, backend tier, and `receipt`. `reject` never proceeds, regardless
of tier: revise that proposal and review it again before any apply path.
`unavailable` (including an OFF, missing, or unhealthy profile), mock,
`unvalidated`, and `proposal_only` results provide no Jev approval; present the
unresolved branch for explicit human choice without overriding a rejection.
Even a validated `permit` is decision evidence, not user consent or a host
permission grant. Every mutation still requires approval for the exact plan and
the host/provider's own authorization. Changed scope, hooks, or commands
require renewed review and approval. The review questions are fixed
(`addresses_task`, `evidence_supports`, `unrelated_changes`, `needs_clarification`);
do not alter the proposal to force a favorable verdict.

### 3. Pick exactly one supported path per harness

| Harness | Preferred install path | Do not combine with |
| --- | --- | --- |
| Claude Code | ECC's `ecc setup` plugin workflow or Claude native plugin commands | full/manual ECC install |
| Codex | native `codex plugin` marketplace workflow | legacy `sync-ecc-to-codex.sh` |
| Kimi Code | project-local `ecc install --target kimi` | Claude hook-profile setup |
| Other supported adapters | selected `install.sh --target <target>` profile | a second adapter for the same harness |

Read [installation and recovery](references/installation-and-recovery.md) before
choosing a path. Run the path-selection proposal review before confirming a
row; an `unavailable` or unhealthy profile leaves the choice to the user. For
a planned command without mutation, use:

```bash
bash .agent-skills/ecc/scripts/ecc.sh plan claude user standard
bash .agent-skills/ecc/scripts/ecc.sh plan codex
```

### 4. Preview and confirm every mutating install

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

Present that plan and get explicit confirmation before any command that installs a
plugin, changes scope, writes a project adapter, or enables hooks. A Jev `permit`
does not replace this approval or provider-owned trust. If the scope, hook value,
or command sequence changes, review and confirm the changed proposal again. Never use an
interactive `ecc setup` through a non-TTY agent shell.

### 5. Apply the approved path and verify it separately

Use the same explicit options without `--dry-run` only after the user has approved
that exact plan and the host/provider permits it; a Jev verdict is not authorization.

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

### 6. Update or recover without widening scope

Re-inventory before an update. Re-run the selected native path at the existing target;
do not switch to a manual/legacy path to work around a conflict. Review each
recovery branch — reinstall in place at the same target, a repair dry run, or a
scope migration — with its own proposal before applying it. Use a recovery or
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
- Jev verdicts and receipts inform decisions; no verdict grants user consent or
  host permissions. `unavailable`, mock, `unvalidated`, and `proposal_only` are
  never approval, and even validated `permit` preserves the explicit approval gate.
- An ECC installation is not proof that a project has passed its tests, review, or
  deployment gates.

## Examples

- Route an ambiguous request once with `route-skills --top-k 1`, then follow the selected skill or ask the user if routing is unavailable.
- Inspect an existing Claude Code installation before selecting an ECC scope or hook profile.
- Preview a Codex marketplace installation and wait for the provider's hook-trust decision.
- Record a `proposal_only` review verdict and its receipt next to scope and hook choices, then re-present the branch to the user.
- Recover one duplicate ECC installation through the original native path instead of adding a second adapter.

## Best practices

- Keep the chosen harness, scope, hook mode, Jev verdict and tier, receipt, and provider verification result in the change record.
- Use native provider inventory as the source of truth for installed plugin state.
- One proposal review per branch: renew review and approval when its target, scope, hook profile, or commands change.
- Treat provider updates, scope migrations, hook changes, repairs, and automatic updates as separate mutations.

## References

- [Installation and recovery](references/installation-and-recovery.md)
- [Jev control plane](../jev-control-plane/SKILL.md)
- [ECC repository](https://github.com/affaan-m/ECC)
- [Upstream configuration skill](https://github.com/affaan-m/ECC/blob/main/skills/configure-ecc/SKILL.md)
