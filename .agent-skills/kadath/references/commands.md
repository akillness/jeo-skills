# KADATH command reference

Two entry points exist: the interactive `./kadath.sh` frontend (first-boot setup, menus, Docker
runtime preparation) and the direct `kadath` Python CLI (`kadath/cli.py`, installed via
`pyproject.toml`'s `[project.scripts]`). `./kadath.sh <command> RUN_ID [...]` forwards to the same
backend after validating the Docker runtime, so both surfaces operate on the same run state.

## Interactive frontend

```bash
./kadath.sh
```

Opens the terminal UI. Arrow keys navigate, Enter selects, `Ctrl-C` exits cleanly. First launch
collects an OpenAI API key and model ID, generates PostgreSQL/MinIO/LiteLLM/SearXNG secrets into
`.kadath/config.env` (owner-only permissions), and prepares Docker images/services. A new run then
collects: goal, epoch duration, population size, epoch count — followed by an Architect benchmark
approval screen before generation one starts.

## Direct run lifecycle (`kadath` CLI / `./kadath.sh <command> RUN_ID`)

| Command | Purpose |
|---|---|
| `kadath init --goal "..." [--criterion ...] [--epochs N] [--population N] [--epoch-seconds N] [--executor docker\|command\|simulated]` | Propose an objective and create an **unapproved** run; prints the Architect's JSON proposal. Does not spend organism budget. |
| `kadath start --goal "..." [same flags] [--dashboard]` | Propose, render the approval screen, prompt to confirm, approve, and launch in one step. |
| `kadath approve RUN_ID` | Approve a run created with `init`; locks objective/Architect/tool-manifest/runtime hashes and creates generation one. |
| `kadath run RUN_ID [--epochs N] [--dashboard]` | Run (or continue running) an approved run's epochs. |
| `kadath pause RUN_ID` | Requests a pause; takes effect after the current durable epoch boundary. |
| `kadath resume RUN_ID [--epochs N]` | Resume a paused run. |
| `kadath status RUN_ID` | Print JSON run/epoch/population/leaderboard/operations status. |
| `kadath dashboard RUN_ID [--interval S] [--watch]` | Render the live terminal dashboard once, or keep refreshing until the run completes/pauses. |
| `kadath continue RUN_ID --genome GENOME_HASH --epochs N [--population N] [--epoch-seconds N]` | Start a **new** run that births its initial population from one selected historical genome of `RUN_ID`. Does not overwrite the source run's history. |
| `kadath continue-export EXPORT_DIR --genome GENOME_HASH --epochs N [--population N] [--epoch-seconds N]` | Same as `continue`, but from a verified export directory (`.kadath/exports/RUN_ID`) instead of a live run — verifies the export manifest first. |
| `kadath export RUN_ID` | Export a terminal (complete/failed) run to `.kadath/exports/RUN_ID/`. |
| `kadath reset RUN_ID --yes` | Remove one run's labeled Docker containers, relational rows, artifact prefix, and run directory. Verified exports are preserved. `--yes` is required; there is no unconfirmed form. |
| `kadath cleanup --older-than-days N` or `kadath cleanup --all` | Remove completed-run history (mutually exclusive flags). Active/paused/ready/awaiting-approval runs are always protected. |

### `init`/`start` shared flags

- `--goal` (required) — the objective text.
- `--criterion` — optional requested criterion; the Architect proposes the final measurement
  regardless.
- `--epochs` (default 3), `--population` (default 100), `--epoch-seconds` (default 1800).
- `--executor {docker,command,simulated}` (default `docker`) — `docker` runs real model-driven
  organisms; `simulated` is test-only.
- `--command` — organism command for `command`/`docker` executors (default
  `python /organism/organism.py`).
- `--image` (default `kadath-organism:latest`) — organism image for `--executor docker`.
- `--network` (default `kadath-agent`) — isolated Docker network for broker/browser/search access.
- `--agent-env KEY=VALUE` (repeatable) — extra environment variable passed only to the organism
  runtime. Cannot override reserved control variables (`KADATH_DATABASE_URL`, `LITELLM_API_KEY`,
  `LITELLM_MASTER_KEY`, `LITELLM_API_BASE`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `DOCKER_HOST`, `KADATH_WORKER_TOKEN`, `KADATH_WORKER_BROKER_URL`).

## Retrieving results after export

```
.kadath/exports/RUN_ID/
├── final-population/          # one complete runnable agent framework directory per surviving agent
├── epoch-champions/records.json   # winner of each epoch, including the final winner
├── leaderboards/records.json      # full ranking
├── top-historical-genomes/records.json  # strong agents that did not survive, still recoverable
└── git-repository/            # canonical bare Git repo covering the full genome lineage
```

Every regular file in an export is covered by a manifest with byte size and SHA-256 checksum;
`continue-export` verifies that manifest and rejects unlisted files or symlinks before birthing a
new population.

## Runtime services (Docker Compose)

| Service | Role |
|---|---|
| `control` | Kernel, CLI backend, scheduler, grading formulas, selection, recovery, exports. Only this container gets the Docker socket and infrastructure credentials. |
| `organism-worker` image | Parent and temporary-worker runtime (base framework + dependency launcher). |
| PostgreSQL | Runs, agents, genomes, scores, attempts, lineage, events, knowledge/memory, ratings. |
| MinIO | S3-compatible artifact storage under run/epoch/agent prefixes. |
| LiteLLM | OpenAI-compatible model gateway for specialists, parents, and workers. |
| SearXNG | Local web-search service exposed as an approved organism tool. |
| Playwright MCP | Browser automation for isolated parent/worker browser contexts. |

## Configuration (`.env` / `.kadath/config.env`)

Key variables (see `.env.example`): `OPENAI_API_KEY`, `KADATH_MODEL_GLOBAL_CONCURRENCY`,
`KADATH_GRADER_CHUNK_TOKENS`, `KADATH_WORKER_GLOBAL_LIMIT`, `KADATH_BROWSER_FLEET`,
`KADATH_DOCKER_SOCKET` (set explicitly for Docker Desktop on macOS — use the value from
`docker context inspect`), and optional `KADATH_GRADER_CONNECTOR_LEDGER_URL` /
`_TOKEN` for an independent read-only outcome-measurement connector.
