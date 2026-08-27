# Node run, isolation, delivery, and recovery

## Fit comes before execution

ZeroShot is strongest when a task has observable acceptance criteria. Freeze these
before asking a conductor or worker to act:

1. target repository and base branch;
2. one bounded change or bug;
3. required behavior and explicit non-goals;
4. commands or observations that prove each requirement;
5. forbidden approaches and compatibility constraints;
6. isolation mode;
7. provider, model ceiling, and cost boundary;
8. delivery mode;
9. whether a separate verifier is mandatory even for a trivial change.

Good inputs name an end state, such as a new flag with exact output and tests. Vague
requests such as "make it faster" need investigation and a benchmark contract before a
run. Use `task-planning`, `ooo`, or `grill-me` to sharpen the task. Starting more agents
does not convert an ambiguous goal into verifiable evidence.

Every `run`, `resume`, `finish`, and scheduled execution can consume provider credits.
The upstream repository explicitly forbids starting a run without user permission. A
plan, setup report, status read, config validation, or export summary is not permission
to execute.

## Classification is a routing mechanism, not proof

The Node conductor classifies complexity and task type before execution. At the audited
commit, the effective routes were:

| Classification | Workflow shape | Verifier coverage |
|---|---|---|
| DEBUG above TRIVIAL | investigator, fixer, tester, completion detector | tester present |
| TRIVIAL with PR or ship delivery | worker-validator | one validator |
| TRIVIAL otherwise | single-worker | no validator |
| SIMPLE | worker-validator | one validator |
| STANDARD | full workflow | planner, worker, two inline validators |
| CRITICAL | full workflow with meta-coordinator | four validators in two stages |

A TRIVIAL local run can have no independent verifier. Never report that every ZeroShot
path uses executor-verifier separation. If an independent verifier is a hard
requirement, use PR delivery for a task run or supply and validate a custom graph that
contains a separate validator. Do not manipulate the wording merely to obtain a higher
classification.

Validators must inspect files and observable behavior directly. Upstream rules forbid
validator prompts from treating `git diff` or `git status` as proof because concurrent
agents can make Git state stale.

## Resolve the effective run plan explicitly

The canonical Node plan has two independent axes:

- isolation: `none`, `worktree`, or `docker`
- delivery: `none`, `pr`, or `ship`

The source resolver applies these implications:

- `--ship` implies PR delivery and automatic merge behavior;
- `--pr` implies worktree isolation unless Docker was explicitly selected;
- `--docker` wins over worktree when both are selected;
- `--no-isolation` conflicts with Docker, worktree, PR, and ship;
- saved defaults and environment options can affect a command that lacks explicit flags.

The no-flag source resolver returns isolation `none`. Guided setup recommends worktree
for a Git repository, but that recommendation matters only after it was applied. Never
assume plain `zeroshot run` is isolated.

Use the bundled preflight to print, not run, a safe explicit command:

```bash
bash .agent-skills/zeroshot/scripts/zeroshot.sh preflight \
  --repo /path/to/repo \
  --input 'Add a --json flag with tests' \
  --isolation worktree \
  --delivery none \
  --provider codex
```

The helper:

- requires an installed Node product, Node 22+, an explicit provider, and a Git repo;
- defaults to explicit worktree isolation and token-free `--sim fast`;
- verifies provider binary, Docker, config, and delivery prerequisites;
- adds `--no-mounts` to Docker unless reviewed saved mounts were explicitly approved with
  `--allow-default-mounts`;
- requires `--base BRANCH` for PR or ship and validates the branch syntax;
- blocks `none` without `--allow-current-checkout`;
- blocks `ship` without `--allow-ship`;
- runs no agent and spends no provider credit;
- prints a shell-quoted proposal that still requires user approval.

Do not pass the helper's approval flags merely to make a test green. They record that an
approval already happened outside the script. `--allow-default-mounts` approves the saved
mount plan only after its exact credential and write scopes were reviewed; it does not approve
all future settings changes.

## Isolation choices

### Worktree

Use `--worktree` for the default local coding lane:

```bash
zeroshot run 'Add a --json flag with tests' --worktree --provider codex
```

It creates a separate branch and checkout under ZeroShot-owned state. It is lightweight
and shares the host's provider and tool environment. Inspect the plan and target base
before execution. Worktree isolation separates files, not credentials, network access,
or host process authority.

### Docker

Use `--docker` for a riskier experiment or stronger filesystem separation:

```bash
zeroshot run 123 --docker --provider codex --no-mounts
```

Docker is not automatically secret-free. The Node product has credential-aware mounts
and environment passthrough. Defaults include `gh`, `git`, and `ssh` presets. Review the
effective mount and environment plan before running. Prefer read-only explicit mounts
and the smallest required credential set.

Some providers do not support Docker. At the audit commit OMP was worktree-capable but
Docker-incompatible. Let the live provider registry fail closed rather than bypassing
its capability check.

### Current checkout

`--no-isolation` modifies the active checkout. Use it only when the user explicitly
chooses that consequence after reviewing branch and local changes:

```bash
bash .agent-skills/zeroshot/scripts/zeroshot.sh preflight \
  --repo . --input issue.md --isolation none --delivery none \
  --allow-current-checkout
```

A clean status does not make current-checkout execution isolated. If another agent,
editor, or user is working in the same tree, use a worktree instead.

## Delivery semantics

| Mode | Flag | Consequence | Approval rule |
|---|---|---|---|
| No delivery | none | Changes stay in the isolated run workspace | approve the paid run |
| Human review | `--pr` | Creates and pushes a branch, opens a PR or MR, then stops | approve external branch and PR creation |
| Full delivery | `--ship` | Creates a PR and attempts merge or auto-merge after gates | approve auto-merge separately and explicitly |

`--pr` is intended to leave the PR open and unmerged. Its explicit option overrides a
repository setting that would otherwise request auto-merge. A repository-side branch
protection rule or merge queue can still merge the PR independently of ZeroShot, so
"ZeroShot did not call merge" is not the same as "the PR cannot merge."

`--ship` attempts direct merge, merge queue, auto-merge, or the platform equivalent. Its
git-pusher fails closed when required quality-gate evidence is missing or blocked, and
it is instructed not to repair code after validator handoff. That is a useful boundary,
not permission to merge. Confirm:

- target remote and base branch;
- branch protection and auto-merge behavior;
- required gates and their fresh evidence;
- issue-closing mode;
- whether the run can push and delete its branch;
- exact provider cost ceiling.

`finish <id>` is not a harmless recovery command. It converts an existing cluster to a
completion-focused task that creates a PR and merges. Treat it at least as strictly as
`--ship`.

## Start only after approval

After presenting the preflight packet, obtain an explicit user instruction to run. Then
copy the proposed command exactly or explain any change before execution.

For background execution:

```bash
zeroshot run 123 --worktree --provider codex --detach
```

Foreground and detached Ctrl+C behavior differs:

- foreground `run`: Ctrl+C stops the cluster;
- detached run: the command returns after startup;
- `attach`: Ctrl+C detaches and leaves the task running;
- Rust foreground observation also detaches on Ctrl+C rather than stopping.

Do not tell a user that Ctrl+C is universally a stop or universally a detach.

## Observe without changing state

These are read-only Node surfaces:

```bash
zeroshot list --json
zeroshot status <id> --json
zeroshot logs <id> -f
```

The bundled helper exposes only list and status because logs can contain source,
prompts, provider output, and tool results:

```bash
bash .agent-skills/zeroshot/scripts/zeroshot.sh status
bash .agent-skills/zeroshot/scripts/zeroshot.sh status <id>
```

Inspect effective status, last activity, agent states, worktree path, delivery state, and
terminal reason before deciding to resume or kill. A process exiting and a cluster
reaching a trustworthy terminal result are different facts.

## Stop, resume, and recover

Prefer the least destructive control:

1. `zeroshot stop <id>` for a graceful stop;
2. inspect status and logs;
3. `zeroshot resume <id> [prompt]` only after the user approves another provider turn;
4. `zeroshot kill <id>` only when graceful stop is insufficient;
5. `zeroshot kill-all` only for a confirmed global incident.

State persists in a SQLite ledger, normally at `~/.zeroshot/<id>.db`, with cluster
metadata in `~/.zeroshot/clusters.json`. Stopped and failed worktrees can remain for
resume or diagnosis. Successful PR and ship flows can auto-clean their worktree. Do not
manually delete a preserved workspace before reading the state and deciding whether it
is evidence or garbage.

A resumed run inherits persisted isolation, provider session, delivery, and PR options
where supported. Re-read the effective plan, especially `autoMerge`, before resuming.
The original approval does not automatically cover a new prompt, new cost, changed base,
or newly enabled ship behavior.

## Maintenance and recurring execution

Maintenance commands have different blast radii:

- `zeroshot gc --dry-run`: inspect orphaned worktrees and database candidates;
- `zeroshot gc`: removes candidates;
- `zeroshot clean`: removes selected task records and logs;
- `zeroshot purge`: kills runs and deletes all ZeroShot run data;
- `zeroshot kill-all`: kills every running task and cluster;
- `zeroshot settings reset`: replaces settings with defaults;
- `zeroshot schedule`: creates recurring provider-spending work.

Always use dry-run where available, show the exact candidate set, and obtain separate
confirmation. Do not pass `--yes` during an exploratory or blanket setup. Do not use an
OS-level recursive delete as a substitute for a command that owns task, ledger,
worktree, and provider-process boundaries.
