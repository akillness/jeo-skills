---
name: openexecutive
description: >
  Operate SenteLabsAI/OpenExecutive, the Apache-2.0 self-hosted virtual
  executive team that answers business questions through one Executive persona
  backed by eight specialist Claude agents over FastAPI, Next.js, ChromaDB, and
  SQLite. Route one request to one mode: fit-check the project; preflight
  Python 3.11, uv, and Node 22; choose an Anthropic, OpenRouter, or local model
  provider; run it with `make dev` or Docker; control paid spend and Anthropic
  prompt caching; connect Slack, Discord, Telegram, Google Chat, or Gmail
  without sending unwanted messages; operate fixtures, the single-instance
  scheduler, and Fly.io deploys; or contribute an agent with tests and evals.
  Use when a user wants to run, configure, extend, or debug Open Executive.
  Triggers on: openexecutive, Open Executive, SenteLabs, virtual executive
  team, virtual CFO or CSO agent, consult_specialist, openexec-api,
  episodic memory executive, fixtures reset, single-instance scheduler.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Self-hosted source install from GitHub; not published to PyPI or npm. Needs
  Python 3.11+ with uv and Node 22+ for the UI, or Docker Compose. Requires at
  least one model provider: an Anthropic API key, OpenRouter, or a local
  OpenAI-compatible server. Optional integrations reach Slack, Discord,
  Telegram, Google Chat, and Gmail. The bundled helper and config auditor are
  read-only and offline.
metadata:
  tags: openexecutive, sentelabs, multi-agent, virtual-executive, anthropic-claude, fastapi, nextjs, chromadb, rag, self-hosted
  version: "1.0"
  source: https://github.com/SenteLabsAI/OpenExecutive
---

# Open Executive self-hosted virtual executive team

Open Executive is a self-hosted application, not a library, CLI package, or MCP
server you install into another project. You clone it, configure providers, and
run two services:

```text
user message -> Executive orchestrator -> parallel specialist calls
             -> ChromaDB retrieval -> one synthesized executive answer
```

Eight specialists sit behind one voice: CSO, CFO, CHRO, General Counsel, COO,
CMO, CPO, and Board Communications. The internal agent structure is
deliberately never exposed to end users.

This skill tracks upstream commit `3a48f77a35e6980335553b9bdd02724e00f6f239`
(2026-08-27) on `main`. The repository has no Git tags or GitHub releases even
though `CHANGELOG.md` documents `0.1.0`, so pin a commit rather than a tag.

## When to use this skill

- Decide whether Open Executive fits a request, and pick local, Docker, or Fly.io
- Preflight Python 3.11+, uv, Node 22+, and provider configuration before a first run
- Choose between Anthropic, OpenRouter, and local Ollama, LM Studio, or vLLM models
- Control paid spend, including the web-search default that contradicts `.env.example`
- Preserve Anthropic prompt caching while changing prompts or tools
- Connect Slack, Discord, Telegram, Google Chat, or Gmail without unwanted outbound messages
- Load or unload demo fixtures without triggering the irreversible factory reset
- Operate the single-instance scheduler, episodic memory, and Fly.io deploys
- Add a specialist agent or workflow with the tests, evals, and docs upstream requires
- Debug 401 test failures, a stale `make eval` path, or first-boot slowness

Do not use this skill for:

- Generic multi-agent framework selection: use `microsoft-agent-framework`, `openai-agents-python`, or `goalflow`
- Provider-neutral LLM gateway routing: use `amrouter`
- LLM tracing and offline eval platforms: use `langsmith` or `opik`
- Generic FastAPI, Next.js, or ChromaDB questions unrelated to this codebase
- Business strategy advice itself; this skill operates the tool, it is not the advisor
- Fly.io-independent deployment strategy: use `deployment-automation`

## Instructions

### Step 0: Enforce the safety contract

1. **Treat every turn as billable.** Each message can fan out to several
   specialists, `claude-opus-4-7` runs deep reasoning for CSO, CFO, GC, and
   Board, and a background `claude-haiku-4-5` pass extracts episodic memory
   after every response. Confirm before running paid traffic on someone's key.
2. **Verify the web-search posture explicitly.** `config.py` defaults
   `enable_web_search` to `True` while `.env.example` claims it is off. Each
   search is billed and the cost scales with specialist fan-out. Never assume
   it is off because the sample env file says so.
3. **Integrations send real messages.** Slack, Discord, Telegram, Google Chat,
   and Gmail deliver to real people. The outbound guard is anti-spam only, it
   fails open on internal errors, and it is not an approval gate. Get explicit
   approval before enabling a channel or triggering a proactive send.
4. **Never run the destructive fixture and cleanup operations casually.**
   `POST /fixtures/reset` is an irreversible factory reset of live state and
   the snapshot. `make stop` kills any process on ports 8000 and 3000.
   `make clean` deletes the virtualenv, `node_modules`, and `.next`.
5. **Keep company data out of Git.** `packages/core/company/` and `.env` are
   gitignored on purpose. Never commit a profile, uploaded document, database,
   or key.
6. **Never print secret or personal values.** Report provider keys, tokens, and
   recipient addresses as set or unset only.
7. **Respect the single-instance rule.** The scheduler claims jobs with
   `UPDATE ... RETURNING`; a second API machine double-fires scheduled actions.

Run the read-only helpers before touching a real deployment:

```bash
bash .agent-skills/openexecutive/scripts/openexecutive.sh doctor /path/to/OpenExecutive
python3 .agent-skills/openexecutive/scripts/audit-config.py /path/to/OpenExecutive/.env
```

### Step 1: Pick exactly one operating mode

| Mode | Choose it when | First action |
|---|---|---|
| `fit-check` | It is unclear whether this project fits | Read the architecture summary in `references/upstream-and-architecture.md` |
| `preflight` | Host or provider readiness is unknown | Run `openexecutive.sh doctor` |
| `run-local` | The app must start on this machine | Confirm a provider, then `make dev` or Docker |
| `provider-cost` | Spend, models, caching, or local models matter | Run `audit-config.py`, read `references/setup-and-providers.md` |
| `integrations` | A messaging or email channel is involved | Read the outbound rules in `references/operations-and-safety.md` |
| `operate` | Fixtures, scheduler, memory, or Fly.io work is needed | Classify the operation risk tier first |
| `contribute` | Code, prompts, or a new agent will change | Read `references/contributing-and-evals.md` |
| `troubleshoot` | A concrete failure exists | Identify the failing layer before retrying |

Do not blend provider setup, paid runs, integration enablement, and deployment
into one unreviewable shell block.

### Step 2: Preflight the host and repository

```bash
bash .agent-skills/openexecutive/scripts/openexecutive.sh doctor /path/to/OpenExecutive
```

The helper checks Python 3.11+, uv, Node 22+, npm, Docker, flyctl, Git, and
Make, detects a checkout, and reports provider and integration variables as set
or unset without printing values. It installs nothing and starts nothing.

Missing pieces are lane facts, not blockers for every lane. Docker replaces uv
and Node; flyctl only matters for a Fly deployment.

### Step 3: Configure a provider before the first run

The app refuses to start with no provider. Pick one path:

- **Anthropic**: set `ANTHROPIC_API_KEY`, keep the default model trio.
- **OpenRouter**: set `OPENROUTER_ENABLED=true` and `OPENROUTER_API_KEY` to bill
  through OpenRouter and unlock non-Anthropic models per agent.
- **Local**: set `LOCAL_MODELS_ENABLED=true`, `LOCAL_BASE_URL` including the
  version path, and `LOCAL_MODELS`, then point `DEFAULT_MODEL`,
  `DEEP_REASONING_MODEL`, and `ROUTING_MODEL` at local slugs to run with no
  Anthropic key. Server-side web search has no local equivalent.

Audit the resulting file before any run:

```bash
python3 .agent-skills/openexecutive/scripts/audit-config.py /path/to/OpenExecutive/.env
```

It reports provider coverage, the effective web-search posture, outbound-guard
posture, and access-control gaps. Only an allowlist of non-sensitive settings,
such as feature flags and model names, is echoed; credentials, hostnames, and
email addresses are shown as present or absent. Details are in
`references/setup-and-providers.md`.

### Step 4: Run it locally

```bash
cp .env.example .env      # then edit; .env is gitignored
make dev                  # API on 8000, UI on 3000
```

The first run pulls heavy ML dependencies and downloads a roughly 90 MB
embedding model, so it takes minutes before the UI is usable. Docker Compose is
the alternative. Use `make stop` only when you accept that it kills every
process on ports 8000 and 3000, including unrelated dev servers.

Complete onboarding in the UI to build the company profile, or use the CLI:

```bash
openexecutive onboard
openexecutive chat
openexecutive ask "How should we price the new tier?"
```

### Step 5: Control cost and preserve prompt caching

Prompt caching is load-bearing; upstream states that breaking it multiplies
cost roughly tenfold. When editing prompts or tools:

- keep tool definitions sorted by name;
- keep the Executive persona a constant, never an f-string;
- keep dynamic content out of any block carrying `cache_control`;
- inject retrieval context into the user turn, not the cached system prompt.

Cap search spend with `ENABLE_WEB_SEARCH=false` or a low `WEB_SEARCH_MAX_USES`,
and leave `XCRAWL_ENABLED` off unless the user asked for it.

### Step 6: Treat integrations and outbound sends as external actions

Enable a channel only when the user asks. Before enabling, confirm the roster
model: Email, Telegram, and Discord access is driven by non-archived Person
rows, and the deployed UI is gated by Google sign-in plus `ALLOWED_EMAILS`.

Keep the anti-spam knobs conservative and remember they are best-effort
suppression, not authorization. `references/operations-and-safety.md` lists the
send chokepoint, guard behavior, and the questions to answer before turning on
Gmail, Slack, Discord, Telegram, or Google Chat.

### Step 7: Classify every operation by risk before running it

- **Read-only**: health, listing fixtures, reading status, viewing audit rows.
- **Stateful but recoverable**: loading a fixture, snapshotting, uploading a
  document, running a chat turn that spends money.
- **Destructive**: `POST /fixtures/reset`, `POST /fixtures/unload`,
  `DELETE /fixtures/{name}`, `openexecutive consolidate-initiatives --apply`,
  `make clean`, `make stop`, and any `flyctl secrets` change that restarts a
  live app.

Preview merges before applying them, since `--apply` deletes rows and takes an
immediate SQLite write lock:

```bash
openexecutive consolidate-initiatives            # dry run
openexecutive consolidate-initiatives --apply    # only after review
```

Pause the API before a large consolidation. Never scale the API beyond one
machine.

### Step 8: Contribute with the checks upstream actually enforces

Run unit tests with the shared secret unset, because a leftover value makes the
full-app tests return 401 instead of their expected status:

```bash
env -u BACKEND_SHARED_SECRET uv run pytest tests/unit/ -v
uv run ruff check openexecutive/ && uv run mypy openexecutive/
```

`make eval` passes a scenarios path that does not exist in the repository. The
runner's own default is also relative to the current directory and only
resolves from `evals/`, so pass an explicit scenario path instead. Adding an
agent requires prompts, registry and tool-enum updates, knowledge, evals, and
architecture-doc updates in the same pull request. See
`references/contributing-and-evals.md`.

## Examples

### Example 1: Check readiness without installing anything

```bash
bash .agent-skills/openexecutive/scripts/openexecutive.sh doctor ~/src/OpenExecutive
```

Resolve only the lane you need, then configure exactly one provider.

### Example 2: Find the real spend posture of an existing config

```bash
python3 .agent-skills/openexecutive/scripts/audit-config.py ~/src/OpenExecutive/.env --json
```

Treat an unset `ENABLE_WEB_SEARCH` as billable searches enabled, because the
code default is on.

### Example 3: Preview an initiative merge before deleting rows

```bash
openexecutive consolidate-initiatives
```

Only after reviewing the proposed clusters, re-run with `--apply`.

### Example 4: Run the eval suite on the path that exists

```bash
cd packages/core
uv run python ../../evals/run_evals.py \
  --scenarios openexecutive/evals/_scenarios/ \
  --output ../../evals/results/
```

Pass the scenario path explicitly. Both the Makefile target and the runner's
relative default resolve to a missing directory from this working directory,
and a missing directory yields zero scenarios instead of an error.

## Best practices

1. Confirm the provider and the spend before the first paid turn.
2. Set `ENABLE_WEB_SEARCH` explicitly instead of trusting the sample env file.
3. Keep the API at one machine so scheduled actions fire once.
4. Enable a messaging channel only on request, and verify the roster first.
5. Preview fixture and consolidation operations; never reach for the reset route to fix a smaller problem.
6. Keep company profiles, uploads, databases, and keys out of Git.
7. Preserve prompt-cache structure when editing prompts or tools.
8. Prefer a local or OpenRouter provider when the user wants to avoid Anthropic billing.
9. Verify claims against the code, since the sample env file and `make eval` are known to disagree with it.
10. Re-read current upstream before asserting latest behavior; this skill is pinned to one commit.

## References

- `references/upstream-and-architecture.md` - pinned metadata, layout, agent and memory architecture
- `references/setup-and-providers.md` - prerequisites, provider choices, env keys, cost controls
- `references/operations-and-safety.md` - risk tiers, destructive operations, integrations, scheduler, deploys
- `references/contributing-and-evals.md` - tests, evals, agent-addition checklist, known repo discrepancies
- `scripts/openexecutive.sh` - read-only host and repository doctor, safety summary, pinned URLs
- `scripts/audit-config.py` - offline env posture audit that never prints values
- [Open Executive repository](https://github.com/SenteLabsAI/OpenExecutive)
- [Pinned upstream source](https://github.com/SenteLabsAI/OpenExecutive/tree/3a48f77a35e6980335553b9bdd02724e00f6f239)
