---
name: zeroshot
description: >
  Operate the-open-engine/zeroshot, the MIT-licensed agent orchestration system that routes a software task through a persistent graph of provider CLI agents, validators, worktree or Docker isolation, and optional PR delivery. Choose the established Node `zeroshot` product, the standalone `zeroshot-rust` engine, or its typed Python SDK; audit provider and credential boundaries; validate configs without paid calls; freeze acceptance, isolation, delivery, and cost before execution; monitor or recover durable runs; and verify trace or semantic JSONL evidence without exposing content. Use when the user names ZeroShot, zeroshot-rust, The Open Engine, conductor-bootstrap, `zeroshot run`, multi-agent coding workflow, ZeroShot trace export, or a ZeroShot target. Never start, resume, schedule, force-stop, create a PR, ship, clean, purge, or update without the matching approval.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  The established Node product needs Node.js 22+, npm, Linux or macOS, Git for normal software-change runs, and a supported provider CLI or configured Gateway. Docker and forge CLIs are optional by lane. The standalone Rust npm installer needs Node.js 18+ and supports Linux x64/arm64, macOS x64/arm64, and Windows x64 at the audited v0.4.0 release. Source Rust needs 1.85+; the source Python SDK needs Python 3.11+ and was not published on PyPI when audited.
license: MIT
metadata:
  category: cli-tools
  subcategory: ai-cli
  interface: cli
  tags: zeroshot, the-open-engine, multi-agent, coding-agents, conductor, worktree, docker, provider-routing, pr-delivery, rust-cli, python-sdk, trace-jsonl
  platforms: Claude, Codex, Gemini, OpenCode, Copilot, All
  version: "1.0"
  source: https://github.com/the-open-engine/zeroshot
---

# ZeroShot agent orchestration

ZeroShot coordinates real provider CLIs through a persistent message graph. It can
modify code, spend provider credit, mount credentials, start several agents, push a
branch, open a pull request, merge it, preserve worktrees and ledgers, or delete that
state. Treat it as an execution control plane, not as a harmless prompt wrapper.

This skill was audited on 2026-08-27 against upstream `main` commit
`362453b743ca1ef79d4fff3525f9db3cffdbf2ad`. For the established Node lane, prefer the
successful `v6.45.0` release commit
`f015ffd66465b50613421717c323d14cef23df27` over the audited `main`, whose push CI had a
failing fake-provider E2E job. The separately released native lane was
`zeroshot-rust-v0.4.0`. Recheck releases, registry metadata, generated help, and CI
before installation or compatibility claims.

## When to use this skill

- Assess, install, update, or troubleshoot `the-open-engine/zeroshot`
- Turn one bounded software change into a validated multi-agent workflow
- Choose between Node `zeroshot`, native `zeroshot-rust`, and the Python SDK
- Inspect provider, model, worktree, Docker, credential, network, and forge prerequisites
- Validate a Node workflow JSON or native graph/runtime plan before execution
- Start a paid run only after presenting the exact task, isolation, delivery, and cost plan
- Observe, stop, resume, recover, or diagnose a durable run
- Create or review a PR-delivery or auto-merge plan with explicit approval boundaries
- Export and structurally verify Node trace or semantic JSONL evidence
- Operate a local, direct, hosted, or named native target
- Extend the upstream Node, Rust, protocol, target, or Python surfaces with focused tests

Do **not** use this skill merely because a task could benefit from several agents. Use
`task-planning`, `tdd`, or one focused coding agent when one executor plus one test loop
is enough. Use `ooo` for a larger specification-first loop. Use `code-review` for review
of an existing diff or PR. Use `harness` when designing a reusable multi-agent team
rather than operating ZeroShot.

## Instructions

### 1. Route one request to one mode

| Mode | User intent | First safe surface |
|---|---|---|
| `fit` | Decide whether ZeroShot is justified | task and risk classification, no install |
| `install` | Install or update a product | pinned release and host check |
| `plan` | Prepare a run | `doctor`, config validation, setup plan, preflight |
| `execute` | Start a new run | approval packet, then one exact command |
| `observe` | Read current state or logs | `list`, `status`, bounded logs |
| `recover` | Stop, resume, kill, or repair a run | status and terminal-reason evidence first |
| `evidence` | Export or audit a completed run | create-only export, content-free summary |
| `target` | Operate native local or remote execution | target and auth classification first |
| `extend` | Change ZeroShot source | owning subsystem and focused CI lane |

Do not install while still deciding fit. Do not execute while asked only to plan. Do not
turn observation into resume, cleanup, delivery, or update.

### 2. Choose one product contract

Never mix commands, state, run ids, or support claims across lanes:

| Product | Authority | Choose it for |
|---|---|---|
| Node `zeroshot` | npm `@the-open-engine/zeroshot`, Node CLI and source | established guided setup, provider registry, issue sources, worktree/Docker UX, resume, Node trace exports, PR workflow |
| Native `zeroshot-rust` | native release, generated Clap help | typed JSON/NDJSON, Windows, local or named targets, stable submission idempotency |
| Python `zeroshot` SDK | `sdks/python`, Rust sidecar | typed async control, durable handles, resumable streams |

Default to Node for established local software-change orchestration. Choose Rust or
Python only for a concrete native requirement. The Python source README advertised
`pip install zeroshot-rust`, but PyPI returned 404 and the release workflow failed at
publishing during this audit. Verify registry publication before recommending it.

Read [product and installation](references/product-and-installation.md) for exact
requirements, version authority, lifecycle scripts, and installation boundaries. Read
[native Rust and Python](references/native-rust-and-python.md) before any native target
or SDK work.

### 3. Freeze the task before spending or mutation

Write a run contract with:

```yaml
zeroshot_plan:
  product: node | rust | python
  source_version: exact tag or commit
  repository: absolute path or remote
  base_branch: exact branch
  task: one bounded end state
  acceptance:
    - observable command and expected outcome
  non_goals:
    - explicit exclusions
  provider: exact id
  model_or_level: exact id or resolved level
  agents_and_workflow: bounded topology
  iteration_or_retry_limit: exact bound
  isolation: worktree | docker | current | native-local | named-target
  credentials_and_network: names and scopes, never values
  delivery: none | pr | ship
  cost_or_time_ceiling: explicit bound
  approval_needed: exact side effect
```

Ask for clarification when the acceptance criteria, base branch, provider, cost bound,
or delivery consequence is missing. A vague request such as "improve the codebase" is
not ready. Do not inflate complexity or wording to force a larger agent topology.

### 4. Inspect without secret disclosure

For the Node lane:

```bash
bash .agent-skills/zeroshot/scripts/zeroshot.sh doctor /path/to/repo
```

The helper reads versions, repository facts, settings presence, durable-state counts,
binary availability, and environment-variable presence. It never prints credential
values and never starts a ZeroShot run or provider. A missing binary is a blocked
capability, not
permission to install.

If Node ZeroShot is already installed, use its read-only setup contract:

```bash
bash .agent-skills/zeroshot/scripts/zeroshot.sh setup-plan /path/to/repo
```

`zeroshot setup plan --json` is tested upstream to omit secret-shaped fields. Applying
that plan writes settings and needs a separate request. Never store a global
`defaultDelivery=ship` simply to eliminate a warning.

Before Docker, Gateway, `GH_TOKEN`, environment forwarding, or a remote target, read
[providers and security](references/providers-and-security.md).

### 5. Validate configuration and isolation

For a custom Node graph:

```bash
bash .agent-skills/zeroshot/scripts/zeroshot.sh \
  validate-config ./workflow.json --strict
```

The upstream validator checks topology, topic producers and consumers, triggers,
variables, hooks, cycles, sub-cluster depth, provider ids, model levels, and forbidden
Git-state proof in validator prompts. A pass proves declared structure, not provider
access, prompt quality, or correctness.

Default to explicit worktree isolation. Use Docker only after reviewing effective mounts,
environment names, provider support, and network access. Current-checkout mutation needs
specific approval after showing branch and local changes.

The canonical Node resolver has important implications:

- `--ship` implies PR delivery and automatic merge behavior;
- `--pr` implies worktree unless Docker was selected;
- Docker wins over worktree;
- `--no-isolation` conflicts with worktree, Docker, PR, and ship;
- the no-flag source fallback is current-checkout isolation unless saved settings change it.

Guided setup recommending worktree is not proof that the recommendation was applied.
Always print an explicit isolation flag for a consequential run.

Read [run and delivery](references/run-and-delivery.md) before PR, ship, resume, finish,
schedule, or cleanup.

### 6. Produce a no-execution preflight

```bash
bash .agent-skills/zeroshot/scripts/zeroshot.sh preflight \
  --repo /path/to/repo \
  --input 'Add a --json flag with tests' \
  --isolation worktree \
  --delivery none \
  --provider codex
```

The helper validates safe local prerequisites and prints a shell-quoted proposed command.
It requires the installed Node product, Node 22+, a Git repo, and an explicit provider. It
adds token-free `--sim fast`, disables Docker mounts by default, and deliberately blocks:

- `--isolation none` without `--allow-current-checkout`;
- `--delivery ship` without `--allow-ship`;
- PR or ship without `--base BRANCH`, a remote, and the matching forge CLI;
- a missing selected provider CLI;
- Docker isolation without Docker;
- saved Docker mounts without the post-review `--allow-default-mounts` acknowledgement;
- a symlinked or invalid config.

The `--allow-*` flags mean approval already happened. Never pass them to bypass the
conversation. Preflight spends no provider credit, runs no agent, creates no branch, and
does not grant execution permission.

Present the run contract, helper output, unresolved risks, and exact proposed command.
Then wait for explicit approval.

### 7. Execute exactly the approved plan

Only after approval, run the unchanged command. If any provider, model, agent count,
input, base branch, credential scope, network tool, isolation, delivery mode, retry
limit, or cost bound changes, stop and re-approve.

A safe default execution shape is:

```bash
zeroshot run 'Add a --json flag with tests' \
  --worktree \
  --provider codex \
  --detach
```

This is an example, not blanket permission. `--detach` returns after startup. Foreground
`run` Ctrl+C stops the cluster, while `attach` Ctrl+C detaches and leaves it running.
Never give one universal Ctrl+C rule.

Delivery has distinct approvals:

- `--pr` pushes a branch and opens a review surface, then ZeroShot does not request merge;
- `--ship` attempts merge, merge queue, or auto-merge after gates;
- `finish <id>` is a completion-focused PR-and-merge operation, not a status repair.

Approval to run does not imply permission to PR or ship. Approval to PR does not imply
permission to merge.

### 8. Observe and recover from durable evidence

Use JSON status before taking action:

```bash
bash .agent-skills/zeroshot/scripts/zeroshot.sh status
bash .agent-skills/zeroshot/scripts/zeroshot.sh status <run-id>
zeroshot logs <run-id> -n 200
```

Logs can contain prompts, source, provider output, tool results, and external errors.
Show the smallest relevant excerpt and redact credentials. Distinguish process exit,
cluster terminal state, validator acceptance, delivery state, and hosting-platform state.

Recovery order:

1. inspect status, agent states, last activity, terminal reason, workspace, and delivery;
2. `stop <id>` for a graceful stop;
3. inspect preserved state;
4. request approval for another paid turn before `resume`;
5. use `kill <id>` only when graceful stop is insufficient;
6. use `kill-all` only for a confirmed global incident.

A resumed run can inherit provider session, worktree, delivery, and auto-merge state. Read
the effective plan again. Do not delete a ledger or worktree merely because a run failed.

Cleanup commands have different scopes. Use `gc --dry-run` where available, show the
candidate set, and confirm deletion. `clean`, `purge`, `kill-all`, settings reset,
uninstall, and recurring schedules always need explicit intent.

### 9. Verify behavior, separation, and delivery

A workflow reaching `COMPLETE` or a provider process exiting zero is not proof. Verify:

- every acceptance criterion from the repository or public interface;
- exact commands, stdout, stderr, exit code, and artifacts;
- relevant tests and build checks;
- whether a distinct validator actually ran;
- actual branch, PR, merge, and issue state from the forge;
- residual worktree, ledger, process, and credential exposure;
- provider/model usage against the approved ceiling.

TRIVIAL local Node runs can use `single-worker` and have no independent validator.
Report that honestly. PR delivery routes trivial work through `worker-validator`, but a
template label still does not prove that validation completed.

Validators must inspect direct files and observable behavior. Upstream rules explicitly
reject `git diff` and `git status` as validation proof in concurrent workflows.

### 10. Export evidence without leaking content

Create, do not overwrite, a trace or semantic export:

```bash
zeroshot export <run-id> --format trace --output run.trace.jsonl
zeroshot export <run-id> --format semantic --output run.semantic.jsonl
```

Trace can contain exact prompts and raw provider output. Semantic export contains
canonical events and diagnostics. Treat both as sensitive.

Use the bundled standard-library verifier for a content-free report:

```bash
python3 .agent-skills/zeroshot/scripts/trace_summary.py \
  run.trace.jsonl --strict
```

It rejects symlinks, enforces bounded JSONL lines, verifies the upstream schema and
footer counts, validates base64 byte totals or semantic event totals, and prints counts,
issue codes, completeness, and SHA-256. It never prints prompts, message bodies, raw
output, or event payloads. Exit `2` means structurally valid but incomplete under strict
mode. Read [workflows, state, and evidence](references/workflows-state-and-evidence.md)
for export and command-proof contracts.

### 11. Extend the owning subsystem and run focused gates

When changing ZeroShot itself, locate the owning contract before editing:

- Node CLI and orchestration: `cli/`, `src/`, `cluster-templates/`, `tests/`;
- provider execution: `src/agent-cli-provider/` and provider tests;
- native graph, server, client, protocol: Rust workspace crates and `zeroshot-rust/`;
- generated TypeScript protocol: Rust testkit source, then `npm run protocol:check`;
- Python projection: `sdks/python/`, with Rust remaining schema authority;
- generated Rust CLI docs: typed Clap command, then the repository generator.

For a Node change, run the narrow test first, then the relevant checked-in gates:

```bash
npm run typecheck
npm run lint
npm test
```

Provider and native changes have focused commands such as:

```bash
npm run check:agent-cli-provider:ci
npm run protocol:check
npm run rust:check
```

The full Node E2E and live-provider suites can be slow, networked, Docker-dependent, or
cost-bearing. Name what did and did not run. Never invoke `test:providers:live` without
provider approval. Rust source requires toolchain 1.85+ at the audited commit. Python
source gates require Python 3.11 and the pinned development extras.

Do not edit generated artifacts by hand, silently cross the Node/Rust ownership boundary,
or publish npm, native releases, containers, or PyPI artifacts without irreversible
release approval.

## Examples

### Example 1: Fit and plan a local code change

**User:** "Use ZeroShot to add JSON output to this CLI."

**Action:** Inspect the repository, freeze acceptance tests, choose the established Node
lane, run `doctor`, validate any custom config, and produce a worktree/no-delivery
preflight. Show provider, topology, iteration bound, credential exposure, cost ceiling,
and exact command. Wait for approval before `zeroshot run`.

### Example 2: Open a PR but do not merge

**User:** "Have ZeroShot fix issue 123 and open a PR for review."

**Action:** Confirm the issue source, origin, base branch, provider, worktree or Docker,
forge CLI, and cost bound. Preflight `--delivery pr`, obtain approval for provider spend,
branch push, and PR creation, then run. Read back the PR URL and state from the forge.
Do not add `--ship`, call merge, or close the issue unless separately requested.

### Example 3: Diagnose a stalled cluster

**User:** "Why is my ZeroShot run stuck?"

**Action:** Read `status <id> --json`, bounded logs, agent states, last activity, and
worktree/ledger presence. Identify the first blocked boundary. Do not resume, kill,
finish, clean, or delete state until the user chooses the recovery action.

### Example 4: Verify an export safely

**User:** "Check whether this ZeroShot semantic export is complete, but do not show its
content."

**Action:** Run `trace_summary.py FILE --format json --strict`. Report schema, digest,
tasks, event and diagnostic counts, issue codes, and completeness. Never paste event
payloads or raw provider output.

### Example 5: Use a native remote target

**User:** "Run the native software-change template on our target."

**Action:** Inspect live `zeroshot-rust` help, target origin and auth class, repository,
branch, template, exact runtime bindings, environment names, `GH_TOKEN` forwarding,
submission key, and delivery. Run `--validate-only`, show the materialized plan, and wait
for approval before submission. Read back remote and forge state after completion.

## Best practices

- Pin a successful release for reproducibility; do not treat the root
  `0.0.0-development` package value as Node release authority.
- Keep product lanes, commands, ids, state, versions, and support matrices separate.
- Prefer one bounded task with observable acceptance over broad autonomous cleanup.
- Use one executor plus an independent verifier when the consequence warrants it.
- Default Node software changes to explicit `--worktree` and delivery `none`.
- Treat Docker mounts, environment forwarding, Gateway tools, web search, and named
  targets as separate privilege grants.
- Print credential names or `SET`/`MISSING`, never values.
- Run `setup plan --json`, config validation, and native `--validate-only` before paid work.
- Ask before every new paid turn, recurring schedule, external branch, PR, merge, stop,
  force-stop, cleanup, update, or release.
- Treat `finish` as ship, not recovery.
- Treat logs, trace, and semantic JSONL as sensitive even when structurally valid.
- Verify direct behavior and hosting-platform state; Git status and agent summaries are
  not final evidence.
- Keep preserved ledgers and worktrees until recovery and evidence needs are resolved.
- Distinguish installed, authenticated, reachable, supported, executed, validated, and
  delivered in every report.

## References

- [Product lanes, releases, installation, setup](references/product-and-installation.md)
- [Node run, isolation, delivery, recovery, cleanup](references/run-and-delivery.md)
- [Providers, credentials, Docker, Gateway, targets](references/providers-and-security.md)
- [Workflow graphs, durable state, trace and semantic evidence](references/workflows-state-and-evidence.md)
- [Standalone Rust CLI and Python SDK](references/native-rust-and-python.md)
- [Upstream repository at the audit commit](https://github.com/the-open-engine/zeroshot/tree/362453b743ca1ef79d4fff3525f9db3cffdbf2ad)
- [Node v6.45.0 release](https://github.com/the-open-engine/zeroshot/releases/tag/v6.45.0)
- [Native Rust v0.4.0 release](https://github.com/the-open-engine/zeroshot/releases/tag/zeroshot-rust-v0.4.0)
- [Generated native CLI reference](https://github.com/the-open-engine/zeroshot/blob/362453b743ca1ef79d4fff3525f9db3cffdbf2ad/docs/zeroshot-rust-cli.md)
- [Security policy](https://github.com/the-open-engine/zeroshot/blob/362453b743ca1ef79d4fff3525f9db3cffdbf2ad/SECURITY.md)
