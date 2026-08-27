# Workflow graphs, durable state, and evidence exports

## Message graph model

The established Node product is a pub/sub coordination layer backed by an append-only
SQLite ledger. Agents subscribe to topics, execute when triggers match, and publish new
messages. A workflow JSON defines agents, roles, triggers, prompts, model rules, hooks,
and optional sub-clusters.

The audited base-template set contained:

| Template | Agents | Main roles |
|---|---:|---|
| `single-worker` | 1 | implementation |
| `worker-validator` | 2 | implementation, validator |
| `debug-workflow` | 4 | planning, implementation, validator, orchestrator |
| `full-workflow` | 7 | planning, implementation, coordinator, validators |
| `quick-validation` | 3 | two validators and consensus coordinator |
| `heavy-validation` | 3 | two validators and consensus coordinator |

The normal top-level default is `conductor-bootstrap`, which classifies and resolves a
base template. Internal base-template files and hand-written documentation can drift.
Use the live installed CLI and checked-out files as evidence before naming an available
config:

```bash
zeroshot config list
zeroshot config show conductor-bootstrap
zeroshot agents list --json
```

Do not assume that a base template is directly addressable by name from every released
package. When deterministic topology matters, supply an explicit JSON file and validate
that exact file.

## Custom config workflow

Start with the smallest graph that proves the requirement:

1. name every agent with a unique id;
2. give each agent a role;
3. define at least one trigger so the agent can wake;
4. pair each produced topic with a real consumer;
5. define bounded retry or escape logic for cycles;
6. keep validation agents independent of executor session reasoning;
7. define observable output and handoff contracts;
8. keep provider and model selection explicit;
9. validate before a paid run;
10. simulate where the installed version supports it.

Run the upstream validator:

```bash
zeroshot config validate ./mine.json --strict --json
```

Or use the bundled wrapper, which rejects a symlink and delegates to that validator:

```bash
bash .agent-skills/zeroshot/scripts/zeroshot.sh \
  validate-config ./mine.json --strict
```

At the audited commit the semantic validator checked, among other things:

- `agents` exists and is non-empty;
- agent ids are unique and roles exist;
- triggers have topics and valid logic scripts;
- agents are not left unreachable;
- message topics have viable producers and consumers;
- validator prompts do not use Git state as proof;
- template variables have matching output contracts;
- hooks have valid actions and logic;
- cycles of three or more agents have escape logic;
- sub-cluster nesting does not exceed five levels;
- provider ids, model levels, and provider feature requests are coherent.

A successful config validation proves structure and declared semantics, not provider
account access, task clarity, runtime safety, or eventual correctness. JavaScript trigger
predicates are code. Review them and bound cycles rather than treating a schema pass as
a sandbox audit.

## Validation ownership

The executor should make the change. A separate validator should reproduce behavior
from the repository and acceptance criteria, not approve an executor's summary.

Good verifier evidence includes:

- reading the changed file or public interface;
- invoking the exact command or request;
- checking stdout, stderr, exit code, and produced artifacts;
- running the repository's own tests or build checks;
- reproducing a reported failure;
- checking every acceptance criterion explicitly.

Bad evidence includes:

- the executor says tests passed;
- a file exists;
- `git diff` looks plausible;
- an agent process exited zero;
- a PR was opened;
- the workflow reached a topic named `COMPLETE`.

TRIVIAL local runs can route to one worker with no validator. Name that limitation in
the final report. A workflow label is not evidence that a distinct verifier actually
ran.

## Durable Node state

Normal Node locations:

| Path | Meaning |
|---|---|
| `~/.zeroshot/clusters.json` | cluster metadata index |
| `~/.zeroshot/<id>.db` | cluster SQLite message ledger |
| `~/.zeroshot/worktrees/` | ZeroShot-owned worktree roots |
| `~/.zeroshot/*.log` | daemon or resume logs |
| repository `.zeroshot/settings.json` | repository-scoped settings |
| global `~/.zeroshot/settings.json` | user-scoped settings |

Do not edit a ledger or metadata file to force a status. Use `list`, `status`, `logs`,
`stop`, `resume`, and owned cleanup commands. Keep database and worktree identities
together when collecting evidence.

For diagnosis:

```bash
zeroshot list --json
zeroshot status <id> --json
zeroshot inspect <id> --json
zeroshot logs <id> -n 200
```

`inspect` can sample process activity. Logs may contain sensitive payloads. Capture only
the minimum needed to diagnose the first failing boundary.

## Trace export

The deterministic trace format is newline-delimited JSON with:

1. one `header` using schema `zeroshot.trace.v1`;
2. ordered `ledger_message` records;
3. one `task` record per causally referenced task;
4. zero or more base64 `task_output_chunk` records;
5. one `footer` with completeness, counts, byte total, and issue codes.

Create a new export path:

```bash
zeroshot export <id> --format trace --output run.trace.jsonl
```

Trace preserves exact selected prompts and raw task-log bytes. It is provider-neutral and
can be complete even when semantic interpretation is unavailable. It is sensitive and
can be large.

The footer can be incomplete when a task row is missing, unreadable, non-terminal, has
ambiguous agent ownership, or its output could not be captured safely. Do not discard
those issues just because the JSONL parsed.

## Semantic export

The semantic format uses schema `zeroshot.semantic.v1`. It projects provider logs through
stateful adapters into bounded events such as text, thinking, tool calls, tool results,
and terminal results. It also records diagnostics when projection is incomplete.

```bash
zeroshot export <id> --format semantic --output run.semantic.jsonl
```

Main record types are:

- `header` with parser bounds;
- `task` with provider, adapter, prompt reference, and raw-output digest;
- `event` with canonical payload and source span;
- `diagnostic` with a stable code;
- `task_end` with source and semantic completeness;
- `footer` with task, event, diagnostic, and issue totals.

Semantic completeness is stricter than raw-source completeness. An unknown provider,
malformed record, missing terminal result, output after terminal result, oversized value,
changed log, or missing source can produce diagnostics without changing the underlying
trace.

## Content-free export verification

Use the bundled standard-library helper:

```bash
python3 .agent-skills/zeroshot/scripts/trace_summary.py \
  run.trace.jsonl --strict

python3 .agent-skills/zeroshot/scripts/trace_summary.py \
  run.semantic.jsonl --format json
```

It:

- rejects symlinks and non-regular inputs;
- enforces a bounded JSONL line size;
- verifies header, footer, schema, media type, and count consistency;
- validates trace chunk base64 and decoded byte totals;
- validates semantic task, task-end, event, and diagnostic totals;
- reports completeness, issue and diagnostic codes, provider and status counts;
- computes a SHA-256 digest;
- never prints prompts, ledger bodies, raw output, or event payloads.

Exit status:

- `0`: structurally valid; complete unless strict mode was omitted;
- `1`: structurally invalid or unsafe input;
- `2`: structurally valid but incomplete under `--strict`.

This helper is not a signature verifier and does not prove that a provider result is
true. It verifies the export envelope and supports safe triage.

## Command proofs

ZeroShot can resolve configured command proofs through `cmdproof`. The proof command may
reuse a cached signed result or run the expensive command, depending on the selected
mode and cache state. Treat `zeroshot cmdproof check <id>` as potentially executing the
configured command when its fallback is `run`.

Before using a proof:

1. inspect its id, scope, profile, and exact command in repository settings;
2. confirm the command is safe in the selected workspace;
3. identify the cache and signing-key ownership;
4. confirm whether a miss will execute;
5. include the proof outcome as evidence, not as a substitute for all acceptance tests.

Do not add a broad command merely to obtain one green reusable proof.

## Evidence handoff packet

A trustworthy completion report should contain:

```yaml
zeroshot_result:
  run_id: ...
  product: node | rust
  source_version: ...
  task_contract: ...
  isolation: worktree | docker | current | native-local | named-target
  provider_and_models: ...
  workflow: ...
  distinct_verifier_ran: true | false
  delivery: none | pr | ship
  terminal_state: ...
  acceptance_evidence:
    - command: ...
      result: ...
  export:
    kind: trace | semantic | none
    complete: true | false | unknown
    sha256: ...
    issues: ...
  residual_risk: ...
```

Read back PR or merge state from the hosting platform when delivery was requested. A
run's claim that it pushed, opened, or merged is not the final authority.
