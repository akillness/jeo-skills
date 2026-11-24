<div align="center">

<img src="web/public/logo.svg" width="84" alt="ARTEX logo" />

# ARTEX

**Autonomous penetration testing that keeps its receipts.**


Self-hosted multi-agent offensive security. A planner explores, workers run real tools,
and every finding stays bound to the assets and HTTP traffic that prove it.

[![Release](https://img.shields.io/github/v/release/BaaRai/ARTEX?label=release&color=6b34db)](https://github.com/BaaRai/ARTEX/releases)
[![License](https://img.shields.io/github/license/BaaRai/ARTEX?color=6b34db)](LICENSE)
[![CI](https://github.com/BaaRai/ARTEX/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/BaaRai/ARTEX/actions/workflows/ci.yml)
[![Go](https://img.shields.io/github/go-mod/go-version/BaaRai/ARTEX?color=6b34db)](go.mod)

[Quick start](#quick-start) · [Screenshots](#screenshots) · [How it works](#how-it-works) · [Install](#installation) · [Configuration](#configuration) · [Security](SECURITY.md)

</div>

---

ARTEX is a self-hosted, LLM-driven penetration testing platform. It is not a chat wrapper around
a scanner: a planner splits a goal into intents, workers execute them with real tools, and the
results are written back into **two linked graphs**: one for what you know about the target, one
for how the test is progressing. Every finding can carry the captured request and response that
justify it, and every autonomous action passes through scope rules, approval gates and budgets.

- **It explores, it doesn't chat.** Goal decomposition, intent dispatch, worker execution and
  write-back form a closed loop that keeps advancing until the goal is proven.
- **Two graphs, one audit trail.** The shared asset graph says *what exists*; the per-task
  exploration graph says *what was tried, what it produced, and why*. Anchors link the two.
- **Findings with evidence.** A recording MITM proxy and a browser extension capture real traffic;
  findings, evidence quotes and retests are tied to the exact request/response.
- **Autonomy with brakes.** Human-in-the-loop approvals, argv-prefix rules, scope/deny gates,
  token and turn budgets, a target noise governor, and prompt-injection framing on tool output.
- **Self-hosted and model-agnostic.** One Go binary with the Next.js UI embedded, PostgreSQL,
  your own Anthropic/OpenAI-compatible endpoint, or a local Ollama.

---

## Quick start

```bash
git clone https://github.com/BaaRai/ARTEX.git
cd ARTEX
cp .env.example .env            # set POSTGRES_PASSWORD (and optionally an LLM key)
docker compose up -d --build    # builds from this checkout, starts PostgreSQL
```

Open **http://localhost:8787**. On the first visit `/setup` asks for the one-time setup token
printed at startup:

```bash
docker compose logs artex | grep "Setup token"
```

> Multi-arch release images (`linux/amd64`, `linux/arm64`) are published to GitHub Container
> Registry at `ghcr.io/baarai/artex` from the next tagged release; v0.7.0 predates the publish
> step. For pulling the prebuilt image and all other installation paths (script, binaries,
> source, release archives), see [Installation](#installation).

---

## Multi-provider workers

In **System → LLM**, configure the profiles you want to use. In **System → Settings**,
set the concurrent worker count to at least **2** before starting a task (the count
applies to subsequently started tasks). In **System → Agents → Worker**, leave the
model set to follow the task; a fixed Worker model takes precedence over rotation.

When creating a task, select both profiles in **LLM config chain**, arrange their
order, and enable **Enable multi-LLM worker rotation**. For an existing task, open
its LLM config control, change the switch or profile order, and save.

Rotation assigns successive worker intents A, B, A, B, regardless of completion
order. Separate intents can run concurrently on different providers; each intent
keeps its selected provider unless it fails over. Planner and other unbound roles
continue using the task's current profile. Turning rotation off restores ordered
task-level failover. An excluded provider is skipped, so an intent pinned to an
exhausted profile falls back to the task's current profile instead of retrying it;
rotation keeps cycling the whole list and does not rebalance around a dead provider.
Saving the chain resets their failure state. Changes do not interrupt in-flight
calls. The rotation cursor starts again after a server restart and saving the chain
does not reset it; the profile order and switch remain persisted.

The task creation and `PUT /api/tasks/{id}/llm` APIs accept `llm_rotate: true` alongside
the ordered `llm_profile_ids`. Omitting `llm_rotate` on an update preserves its value.

## Screenshots

| Tasks | Findings |
| :---: | :---: |
| ![Tasks](screenshots/tasks.png) | ![Findings](screenshots/findings.png) |

| Task execution: sessions and tool calls | Exploration graph |
| :---: | :---: |
| ![Execution](screenshots/sessions.png) | ![Exploration graph](screenshots/graph.png) |

| Asset coverage graph | Traffic recording |
| :---: | :---: |
| ![Asset coverage graph](screenshots/assets_test.png) | ![Traffic](screenshots/traffic.png) |

| Human-in-the-loop chat | Interception approvals |
| :---: | :---: |
| ![Chat](screenshots/chat.png) | ![Interception](screenshots/intercept.png) |

<details>
<summary>More screenshots (assets, agents, LLM, logs)</summary>

| Assets | Agent management |
| :---: | :---: |
| ![Assets](screenshots/assets.png) | ![Agent](screenshots/agents.png) |

| LLM configuration | Backend logs |
| :---: | :---: |
| ![LLM](screenshots/llm.png) | ![Logs](screenshots/logs.png) |

</details>

---

## How it works

### Dual-graph architecture: exploration graph + asset graph

ARTEX separates *what the goals are* from *how far testing has progressed* into two independent
graphs linked by anchors:

- **Asset graph (shared across tasks).** One source of truth for `root_domain / subdomain / ip /
  service / app / endpoint`, owned by companies. Parent-child relationships and deduplication keys
  are computed by the program; agents only submit raw observations.
- **Exploration graph (per task).** The task's reasoning and progress: `goal / intent / fact /
  finding / hint` nodes connected by `spawns / derived_from / yields / proves` edges into a lineage
  chain.
- **Anchors link them.** `exploration_anchors(node_id, asset_id)` ties intents, facts and findings
  to concrete assets: which assets a direction touched, and which intents tested a given asset.
  This also powers **asset test coverage** and the coverage graph.

```mermaid
flowchart LR
  subgraph EG["Exploration graph (per-task · advance chain)"]
    direction TB
    G["goal"]
    I1["intent A"]
    F1["fact"]
    I2["intent B"]
    FD["finding (vulnerability)"]
    G -->|spawns| I1
    I1 -->|yields| F1
    F1 -->|derived_from| I2
    I2 -->|proves| FD
  end
  subgraph AG["Asset graph (globally shared · source of truth)"]
    direction TB
    RD["root_domain"]
    SD["subdomain"]
    SV["service"]
    EP["endpoint"]
    RD --> SD --> SV --> EP
  end
  I1 -. anchor .-> SD
  F1 -. anchor .-> SV
  I2 -. anchor .-> EP
  FD -. anchor .-> EP
```

The **planner** reads the exploration graph, judges goals, and dispatches intents only when there
is an uncovered direction; a **worker** claims one intent, executes it, writes assets/facts/findings
back into both graphs, then stops.

### The engine loop

The engine is event-driven: any graph change wakes the planner, workers claim and execute intents,
write-back triggers the next round, until `prove_goal` closes the task.

```mermaid
sequenceDiagram
  autonumber
  participant EV as graph-change debounce
  participant P as planner
  participant FR as frontier intent queue
  participant W as worker
  participant PX as recording proxy
  participant DB as dual graphs + activity

  EV-->>P: wake up
  P->>DB: read situation (graph_overview prefetch + coverage/scope)
  P->>FR: dispatch 0..N intents (with asset_ids)
  Note over P,FR: most wake-ups dispatch 0 (no new direction means done)
  W->>FR: claimNext claims one intent
  W->>DB: fetch the raw assets of the intent's asset_ids
  W->>PX: real tool execution (Kali / Bash / HTTP)
  PX-->>W: response (fully traced + CA verified)
  W->>DB: write back fact / asset / finding + per-step activity
  DB-->>EV: graph change
  EV-->>P: wake again (closed loop)
```

### Durable attack chains, shared worker memory

Real attack chains are multi-step and ordered (find an injection → get credentials → move
laterally). The planner keeps a **todolist retained per task across wake-ups**: it records the
chain once, then dispatches the next step only when its prerequisites are satisfied by facts.

Workers can also **search each other's execution traces** (`search_all_worker_traces`,
`list_worker_traces`, `get_worker_trace`). Observations that never became formal facts (an error
message, a response snippet, a hidden parameter) are still reusable by the next worker, while each
worker remains confined to the intent it claimed.

---

## Features

### Evidence, not chat logs

- **Recording MITM proxy** (`:8788`) with a generated CA: every Bash/HTTP tool call is traced, and
  request/response evidence can be bound to a finding.
- **Browser extension** (`extension/`) for authenticated targets: log in once (captcha, email OTP,
  2FA included), capture the session, and the requests/responses land in the same traffic store.

  <details>
  <summary>Using the traffic capture extension</summary>

  - Load the unpacked extension from `extension/` (Chrome/Edge: Developer Mode → Load unpacked);
  - In the popup, set your ARTEX URL and token, then press **Start capture** on the tab you are
    browsing;
  - Use the site normally; text requests/responses are batched to `POST /api/traffic/ingest`
    (authenticated). Binary bodies (images, fonts) are skipped, bodies are truncated at 256 KiB,
    batches are capped at 50 entries;
  - Press **Stop** when done. Everything stays in your local traffic store.

  </details>
- **Verified findings**: findings carry a POE level, a verification status and a note; a finding is
  `verified` only when a bound proof/response and verbatim evidence quotes support it. Gzip/deflate
  bodies are decoded before the quote check. The findings table supports bulk status updates, and
  the report and export show each finding's proof strength next to its status.
- **Traffic replay**: open a captured exchange and replay the recorded request (method, URL,
  headers and stored body) from the traffic detail; replay stays disabled while only the body
  preview is loaded.
- **Vulnerability retest loop**: a dedicated `retester` agent re-runs a finding with optional fixed
  version/conditions, records `Still reproducible / Fixed / Cannot confirm`, and can move the
  finding to `Fixed` automatically. Original evidence and reports are preserved.
- **Reports and exports**: findings, evidence and task archives, with traffic snapshots kept
  encrypted at rest.

### Control without slowing down

- **Interception gate**: every tool call can require human approval, with rules by `string`,
  `regex` or **argv prefix**. An argv rule is a JSON array of 1 to 8 tokens (Bash only, for
  example `["git","push"]`); it matches only a single simple command whose parsed prefix equals
  the pattern exactly. Pipes, lists, redirections, prefix assignments, subshells, background jobs,
  wrapper programs and command/parameter substitutions do not match; flags are ignored by
  construction (`["git","push"]` covers `git push --force`, but `git -C /repo push` matches
  nothing). Each approval records who decided: `human`, `rule`, `model` or `system`.
- **Scope and target gate**: scope rows define the coverage denominator; assets outside the
  declared scope are not explored. The target gate (off by default, API-only) can refuse
  destinations that were not approved.
- **Budgets**: `ARTEX_TASK_BUDGET_TOKENS` / `ARTEX_TASK_BUDGET_TURNS` cap a whole task (planner and
  workers); `ARTEX_INTENT_BUDGET_TOKENS` / `ARTEX_INTENT_BUDGET_TURNS` cap one worker run. Near the
  limit the task enters a forced wrap-up; a worker is not started when the remaining budget cannot
  cover it. Spend already in `llm_usage` is restored after a restart. A task that is already inside
  the wrap-up reserve only has that reserve left, so the revived run wraps up instead of starting
  another worker. The per-worker cost estimate starts again from the defaults (50,000 tokens and
  10 turns) until a worker finishes in this process.
- **Noise governor**: `ARTEX_NOISE_PROFILE=quiet|balanced|aggressive` paces requests ARTEX sends to
  targets (per-host rate, burst, in-flight limit, jitter, backoff on 429/503, short GET caching).
  With a profile set, agents also receive low-and-slow flags for the installed scanners.
- **Untrusted-output boundary (on by default)**: tool results are framed between nonce-tagged
  markers so the model treats them as data, not instructions. Disable with
  `ARTEX_UNTRUSTED_BOUNDARY=0`.

### Assets and coverage

- **Coverage ledger and force-directed coverage graph**: in-scope assets are highlighted as tested
  or untested, with linked intents, facts and findings per node.
- **Company-scoped asset graph**: shared across tasks, deduplicated by the program, with
  domain → subdomain → service → endpoint containment.
- **ScopeSentry sync**: pull asset data from a
  [ScopeSentry](https://github.com/Autumn-27/ScopeSentry) instance by project or task, merged by
  company scope into the asset graph for agents to explore.

  <details>
  <summary>Syncing from ScopeSentry</summary>

  - On the **Asset Sync** page, enter the ScopeSentry address and API key;
  - Choose the targets and asset types by **project** or **task** (domains / subdomains / IPs /
    ports / sites / endpoints…);
  - Import: rows are merged by company asset scope and become part of the asset graph.

  </details>
- **Task categories, templates, relations and archives** for repeatable engagements.

### Platform

- **LLM profiles with failover**: Anthropic, OpenAI, OpenAI-compatible relays and keyless Ollama;
  multiple profiles per task with automatic failover.
- **Token accounting**: per-task and per-session usage, cache reads/writes, and an LLM record view
  for every call.
- **MCP servers, skills, memory and a workspace**: extend the agent with remote tools and reusable
  prompt/playbook material.
- **Web search**: the agent's search tool uses Brave, Tavily or the opt-in Keenable backend,
  configured in **System → Settings** with the key encrypted at rest; search can also egress
  through its own proxy.
- **Single binary**: the Next.js UI is embedded with `go:embed`; PostgreSQL is the only external
  dependency.

---

## Installation

> Requires **PostgreSQL**; exploration requires an **LLM** (`ANTHROPIC_API_KEY` or
> `OPENAI_API_KEY`, also configurable in the UI).

### Option 1: one-click install script (recommended)

```bash
git clone https://github.com/BaaRai/ARTEX.git
cd ARTEX
./install.sh
```

The script detects or installs Docker, then offers **① all-Docker** (writes `.env`, runs
`docker compose up -d --build`) or **② local build and run** (generates `config.json`, builds the
embedded binary, starts it).

Open **http://localhost:8787**; `/setup` asks for the one-time setup token printed at startup
(`docker compose logs artex | grep "Setup token"`).

The UI listens on `127.0.0.1` by default. To reach it from another machine (or from Windows when
ARTEX runs inside WSL), set `ARTEX_BIND_ADDR=0.0.0.0` in `.env` (the setup token still protects the
first-run claim), or keep loopback and use a reverse proxy or SSH tunnel.

### Option 2: Docker (Compose checkout build or prebuilt GHCR image)

Build from a checkout with Docker Compose:

```bash
git clone https://github.com/BaaRai/ARTEX.git
cd ARTEX
cp .env.example .env            # set POSTGRES_PASSWORD, optionally ANTHROPIC_API_KEY
docker compose up -d --build
# → http://localhost:8787
```

The checkout build needs the Docker **buildx** plugin (BuildKit). Docker Desktop and
get.docker.com include it; distro packages and Homebrew's docker CLI (Colima) may not. If
`docker buildx version` fails, install `docker-buildx-plugin` or `docker-buildx`, or on macOS
`brew install docker-buildx`. Without it the build stops at the first stage with
`failed to parse platform`.

The release workflow publishes a multi-arch image (`linux/amd64`, `linux/arm64`) to GitHub
Container Registry on each `v*` tag, with tags `:latest`, `:v<version>`, and `:<version>`.
v0.7.0 predates that step, so there is no `artex` package yet: until the next tagged release,
use the checkout build above, and `docker-compose.ghcr.yml` and the `docker pull` below will
fail with `denied`. GHCR packages start private; after the first publish the package visibility
must be set to Public, and the release workflow verifies that the image pulls anonymously and
fails the job otherwise.

Once the image is published, the standalone container requires an existing PostgreSQL database
reachable from the container.
Set the `ARTEX_PG_*` variables below. The example uses Docker Desktop's
`host.docker.internal` to reach PostgreSQL on the host. On native Linux Docker Engine, add
`--add-host=host.docker.internal:host-gateway` to `docker run` for a host database, or use
the reachable hostname of your database server.

```bash
docker pull ghcr.io/baarai/artex:latest

mkdir -p data keys
docker run -d --name artex \
  --security-opt no-new-privileges:true \
  -p 127.0.0.1:8787:8787 \
  -p 127.0.0.1:8788:8788 \
  -e ARTEX_PG_HOST=host.docker.internal \
  -e ARTEX_PG_PORT=5432 \
  -e ARTEX_PG_USER=artex \
  -e ARTEX_PG_PASSWORD='yourpass' \
  -e ARTEX_PG_DBNAME=artex \
  -e ARTEX_PG_SSLMODE=disable \
  -e ARTEX_JWT_KEY_DIR=/app/keys \
  -v "$PWD/data:/app/data" \
  -v "$PWD/keys:/app/keys" \
  ghcr.io/baarai/artex:latest
# → http://localhost:8787  (docker logs artex | grep "Setup token")
```

In `docker-compose.yml` and `docker-compose.ghcr.yml`, `POSTGRES_PASSWORD` is passed to ARTEX as
its own variable. The server percent-encodes it into the connection URL, so a password may contain
`/`, `?`, `%`, `@`, `:` or spaces. In `.env`, quote a value that contains `#`, and write `$$` for a
literal `$`. The `ARTEX_PG_*` variables take the password raw; quote it in a shell.

The image includes a scanner toolchain (`nmap`, `nuclei`, `httpx`, `katana`, `ffuf`, `dalfox`,
`sqlmap`, `ripgrep`, `curl`, `npm`, …) and built-in `/app/skills`. The GHCR Compose file below
persists `./keys` and `./data`; it does not mount a host `skills/` directory, so the image's
built-in skills are used.

#### Compose stack from the prebuilt image

`docker-compose.ghcr.yml` runs the same ARTEX + PostgreSQL stack from the released image, with no
checkout build. The image is not published yet: v0.7.0 predates the GHCR publish step, so use the
checkout build above until the next tagged release. Once the first image is published, download
the file and `.env.example` once:

```bash
curl -fsSLO https://raw.githubusercontent.com/BaaRai/ARTEX/main/docker-compose.ghcr.yml
curl -fsSLO https://raw.githubusercontent.com/BaaRai/ARTEX/main/.env.example
cp .env.example .env            # set POSTGRES_PASSWORD, optionally an LLM key
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
# → http://localhost:8787  (docker compose -f docker-compose.ghcr.yml logs artex | grep "Setup token")
```

Update the stack without a git checkout:

```bash
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
```

Pin a version with `ARTEX_IMAGE_TAG=v0.7.1` in `.env` (or `0.7.1`); unset uses `latest`. To use
custom skills, copy them into a host directory and add `- ./skills:/app/skills` to the `artex`
volumes, which overrides the built-in `/app/skills`.

For remote MCP you can choose `http` (Streamable HTTP) or `sse` (legacy SSE) in system settings.
Legacy SSE servers usually establish the event stream with `GET /sse` and receive JSON-RPC over
`/message?sessionId=...`; configure the URL as `/sse` and send `Authorization: Bearer <token>`.

### Option 3: prebuilt binaries (Releases)

Download the zip for your platform from [Releases](https://github.com/BaaRai/ARTEX/releases). It
contains `artex`, `start.sh` (`start.bat` on Windows), `skills/` and `config.example.json`:

```bash
cp config.example.json config.json   # fill in the database connection
./start.sh                           # → http://localhost:8787
```

Start with `start.sh` / `start.bat`, not `./artex`: it is a daemon script that restarts the process
after a backoff. To keep it in the background: `nohup ./start.sh >artex.log 2>&1 &`.

#### Verifying a release

Each release attaches `SHA256SUMS` and a CycloneDX SBOM, `artex-<tag>.cdx.json` (Go modules in the
linux/amd64 binary, the frontend `package-lock.json`, `go.mod`/`go.sum`), next to the zips. The zips
also carry a GitHub build provenance attestation. Releases published before this was added have
neither.

```bash
sha256sum -c SHA256SUMS                           # add --ignore-missing if you downloaded only some zips
gh attestation verify <zip> --repo BaaRai/ARTEX   # built by this repository's release workflow
```

### Option 4: build the single binary from source

```bash
cd web && npm ci && npm run build:static && cd ..
cp -r web/out server/webui/dist
CGO_ENABLED=0 go build -tags embedui -o artex ./cmd/artex
./start.sh
```

Only `-tags embedui` embeds the frontend into the binary.

### Option 5: cross-platform release archives

`build.sh` builds and embeds the frontend, strips debug info, and writes zips for Linux
amd64/arm64, macOS amd64/arm64 and Windows amd64 by default:

```bash
./build.sh --release
# output: dist/artex-<version>-*.zip

ARTEX_TARGETS=linux/amd64,windows/amd64 ./build.sh --release
./build.sh --target linux/amd64 --upx
```

UPX is disabled by default: self-extracting binaries may be incompatible with some kernels,
virtualization environments or security policies. Pass `--upx` only after confirming the target
runtime supports it.

---

## Configuration

**Database** (`config.json`, `ARTEX_PG_DSN`, or `ARTEX_PG_*` environment variables — see [External PostgreSQL](#external-postgresql)):

```json
{
  "database": {
    "host": "127.0.0.1", "port": 5432,
    "user": "artex", "password": "yourpass",
    "dbname": "artex", "sslmode": "disable"
  }
}
```

**LLM**: `export ANTHROPIC_API_KEY=sk-...` (or `OPENAI_API_KEY`), or configure it in the UI's
"LLM Configuration" page, which can also add a local Ollama server as a keyless provider (format
"Ollama", default base URL `http://127.0.0.1:11434/v1`). Optional:
`ARTEX_LLM_PROVIDER` (`anthropic | openai | openai-responses | ollama | bedrock-gateway`), `ARTEX_LLM_MODEL`,
`ARTEX_LLM_BASE_URL`, `ARTEX_LLM_PROXY`.

**Base URL gotcha**: for the Anthropic format, enter the host **without** `/v1` (for example
`https://api.anthropic.com`); ARTEX appends `/v1/messages`. OpenAI-format providers append
`/chat/completions` (or `/responses` for `openai-responses`), so their base **does** end in `/v1`
(for example `https://api.openai.com/v1`).

**OpenAI-compatible gateways**: any provider that serves an OpenAI-style
`/v1/chat/completions` endpoint works through the **OpenAI** format — no dedicated format
needed. Create a profile with format **OpenAI**, set **Base URL** to the gateway's `/v1`
root, paste the key, then click the **↻** button next to *Model* to load the provider's
catalog (`GET /v1/models`) and pick a model; models the provider adds later appear on the
next refresh. For example, [NotHoly](https://notholy.com) (offensive-security models) uses
base URL `https://api.notholy.com/v1` with an API key from its console.

**Bedrock gateway**: select **Bedrock gateway** in System → LLM for a gateway that
exposes the Bedrock `InvokeModel` and `InvokeModelWithResponseStream` paths and accepts
bearer-token authentication. Enter the gateway's base URL (for example,
`https://gateway.example.com/bedrock`), the full Bedrock model ID, and the token
in **Bearer token**. If required, enter static headers as one `Name: Value` per line
in **Custom gateway headers**. ARTEX adds `/model/{model}/invoke` (or
`/invoke-with-response-stream`), sends `anthropic_version: bedrock-2023-05-31`,
and decodes Bedrock's binary event stream. Enter the model ID manually; this
gateway format does not have a model-list operation. The token and custom header
values are encrypted in the database and are write-only in the UI. Editing the
gateway URL requires re-entering the token, so saved credentials cannot be sent
to a different host by changing the URL. This format is for bearer-authenticated
gateways; direct AWS Bedrock with SigV4 credentials is not supported.

For environment-based setup, set `ARTEX_LLM_PROVIDER=bedrock-gateway`,
`ARTEX_LLM_BASE_URL`, `ARTEX_LLM_MODEL`, and `ARTEX_LLM_API_KEY`. Optional
`ARTEX_LLM_CUSTOM_HEADERS` uses the same newline-separated `Name: Value` format.

**Task archive storage**: local disk by default. Set `ARTEX_ARCHIVE_STORAGE=s3` to
store cold task packages in an S3-compatible bucket and release their local
package space after verification. Existing local archives remain usable. See
[Task archive storage](docs/task-archive-storage.md) for configuration, permissions,
integrity checks, temporary disk requirements and recovery.

**Concurrency**: work agents per task, in "System Settings" (default 3).

**Untrusted-output boundary (on by default)**: tool results for the worker, planner, chat and main
agent are framed between nonce-tagged markers so the model treats them as data, not instructions.
Unset or empty, the boundary is on; set `ARTEX_UNTRUSTED_BOUNDARY=0` (or `false` / `off` / `no`) to
disable it. Cost: about 154 bytes per tool result plus one system note.

**Noise profile (off by default)**: `ARTEX_NOISE_PROFILE` paces the requests ARTEX sends to targets
(WebFetch, HTTP custom tools, the enrich probe). Unset or `off` keeps today's behaviour: no limit,
no cache. `quiet` = 2 req/s per host (burst 4, 1 in flight), `balanced` = 5 req/s (burst 10, 2 in
flight), `aggressive` = 20 req/s (burst 40, 4 in flight). A profile adds jitter, backs off on
429/503 (honours `Retry-After`, bounded retries, GET/HEAD/OPTIONS only), deduplicates identical
in-flight GETs and caches them briefly (60/30/10 s; never POST/PUT/PATCH/DELETE), and logs a
per-host noise line each minute. `ARTEX_TARGET_USER_AGENT` sets a User-Agent on target requests
that carry none. With traffic capture on, Bash commands that use the proxy (curl, wget,
python-requests) are paced too, per host by the same rate and jitter, and counted in the same
per-host lines. The in-flight caps, retries and cache apply only to ARTEX's own requests. This is
best effort, not a security boundary. Raw scanners such as nmap are not paced, and neither is a
command that bypasses the proxy (`--noproxy`, a removed proxy variable). With capture off,
nothing launched from Bash is paced. The low-and-slow prompt block supplies the rate flags in
every case.
The **Target noise** card in System settings sets the profile at runtime (no restart) and shows the
per-host counters; once saved, that setting takes precedence over `ARTEX_NOISE_PROFILE`.

**Scanner User-Agent (opt-in per task)** adds a stable ARTEX User-Agent to supported
target requests so defenders can correlate them with an approved assessment. See the
[configuration and WAF triage guide](docs/scanner-user-agent.md).

**Low-and-slow agent guidance (off by default)**: when a noise profile is set, the planner, worker,
main agent and chat agents receive a code-owned prompt block with the profile's per-host limits and
exact rate/delay flags for the installed scanners. It tells them to test one host at a time, back
off on 429/503 and never raise the rate to meet a deadline.

**Run budgets (off by default)**: `ARTEX_TASK_BUDGET_TOKENS` / `ARTEX_TASK_BUDGET_TURNS` cap a
task's total spend (planner rounds and workers); `ARTEX_INTENT_BUDGET_TOKENS` /
`ARTEX_INTENT_BUDGET_TURNS` cap one worker run. Unset or `0` means unlimited. A worker is not
started when the remaining task budget cannot cover its estimated cost (the average of finished
workers, else 50,000 tokens and 10 turns). Near the wrap-up reserve (the larger of 5% and 20,000
tokens, and 2 turns) the task enters a forced wrap-up: the planner writes a summary and final goal
judgment, and workers may only write back. The task then ends `done` if its goals are met, else
`timeout`. Practical floor: below 50,000 tokens no worker starts; 50,000-70,000 typically gives one
worker then wrap-up; pick well above 70,000 for real exploration. Planner, worker, judge, and
compactor rows in `llm_usage` are counted back into the cap when a ledger is created, including
after a restart and after a revived run drops its ledger. A restored task already inside the
wrap-up reserve does not get another worker: only that reserve remains, and the run wraps up.
Chat, goal decomposition, and side questions are stored on the same task and are not counted.
The per-worker average is not restored (usage rows have no run boundary), so the estimate starts
from the defaults until a worker finishes in this process.

**Common flags**: `./start.sh -addr :8787 -proxy :8788` (`-addr` frontend/API, `-proxy` traffic
recording proxy).

### External PostgreSQL

ARTEX already supports an external PostgreSQL 16+ instance — the `postgres` service in
`docker-compose.yml` is only the bundled default. Because the database is startup configuration and
the system's single source of truth, there is no runtime database switcher in the UI: change the
environment variables and restart the server to point at another instance.

Configure the connection with either a full connection string or individual parts:

- **`ARTEX_PG_DSN`**: full PostgreSQL connection URL (for example
  `postgres://artex:pass@db.example.internal:5432/artex?sslmode=require`). When set, it takes
  precedence over the `ARTEX_PG_*` variables and you are responsible for percent-encoding any
  URL-special characters in the username or password.
- **`ARTEX_PG_*` parts** (recommended when passwords contain `/`, `?`, `%`, `@`, `:`, or spaces —
  ARTEX percent-encodes the user and password and removes `ARTEX_PG_PASSWORD` from the environment
  at startup):
  - `ARTEX_PG_HOST` — PostgreSQL host
  - `ARTEX_PG_PORT` — PostgreSQL port (default `5432`)
  - `ARTEX_PG_USER` — database user
  - `ARTEX_PG_PASSWORD` — database password (raw, not URL-encoded)
  - `ARTEX_PG_DBNAME` — database name
  - `ARTEX_PG_SSLMODE` — TLS mode (`disable`, `require`, `verify-ca`, `verify-full`)

#### Compose without the bundled `postgres` service

To run ARTEX against an external PostgreSQL server with Docker Compose, remove the `postgres`
service, the `depends_on` block, and the `pgdata` volume from `docker-compose.yml`, and point
`artex` at your database:

```yaml
services:
  artex:
    image: ghcr.io/baarai/artex:latest
    security_opt:
      - "no-new-privileges:true"
    environment:
      # Option A: individual parts (recommended; percent-encodes special characters)
      ARTEX_PG_HOST: ${ARTEX_PG_HOST:?Set ARTEX_PG_HOST in .env}
      ARTEX_PG_PORT: ${ARTEX_PG_PORT:-5432}
      ARTEX_PG_USER: ${ARTEX_PG_USER:-artex}
      ARTEX_PG_PASSWORD: ${ARTEX_PG_PASSWORD:?Set ARTEX_PG_PASSWORD in .env}
      ARTEX_PG_DBNAME: ${ARTEX_PG_DBNAME:-artex}
      ARTEX_PG_SSLMODE: ${ARTEX_PG_SSLMODE:-require}
      # Option B: full DSN (overrides ARTEX_PG_* when set)
      # ARTEX_PG_DSN: ${ARTEX_PG_DSN}
      ARTEX_JWT_KEY_DIR: /app/keys
    ports:
      - "${ARTEX_BIND_ADDR:-127.0.0.1}:8787:8787"
      - "127.0.0.1:8788:8788"
    volumes:
      - ./data:/app/data
      - ./keys:/app/keys
    restart: unless-stopped
```

#### Local disk usage (`data/`)

Moving PostgreSQL to an external host does **not** move the runtime `data/` directory off local
disk. `data/` still stores spilled HTTP/TCP traffic blobs (`data/traffic/_blobs`), LLM
transcripts, task working files, and local task archives, so heavy workloads can still fill the
host disk if `data/` is on a small volume. Mount `data/` on a suitably sized volume, and consider
setting `ARTEX_ARCHIVE_STORAGE=s3` (see [Task archive storage](docs/task-archive-storage.md)) to
offload cold task archives to object storage.

### Reverse proxy deployment (HTTPS / exposing only 443)

The frontend, API and SSE stream share port 8787 (the binary listens on `127.0.0.1:8787` by
default; the Docker container publishes on `127.0.0.1`), and the activity stream is same-origin by
default, so **no `NEXT_PUBLIC_SSE_BASE` is needed**: expose 443 and keep 8787 internal.

SSE keeps a long-lived connection with continuous pushes, so the proxy **must disable buffering**;
otherwise the browser connects but never receives events.

Redirect plain HTTP first, so a bookmarked `http://` URL never reaches the app unencrypted:

```nginx
server {
    listen 80;
    server_name your.domain.com;
    return 301 https://$host$request_uri;
}
```

Then the TLS server:

```nginx
server {
    listen 443 ssl;
    server_name your.domain.com;
    # ssl_certificate / ssl_certificate_key ...

    location / {
        # 512 MiB combined file limit plus 1 MiB of multipart metadata.
        client_max_body_size 513m;
        proxy_request_buffering off;

        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # SSE essentials: buffering off, long timeouts, HTTP/1.1
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
}
```

**Login rate limit behind a proxy**: login allows 10 attempts per minute per client IP. Behind a
proxy every request comes from the proxy's address, so without further setup all users share one
budget and an attacker who fails 10 logins blocks everyone, admin included, for up to 15 minutes.
Keep the `X-Forwarded-For` line and set `ARTEX_TRUSTED_PROXIES` (comma-separated CIDRs, empty by
default) to the address ARTEX sees the proxy connect from:

- **nginx and ARTEX both on the host** (binary, `./start.sh`): the peer is `127.0.0.1`; start ARTEX
  with `ARTEX_TRUSTED_PROXIES=127.0.0.1/32`.
- **nginx on the host, ARTEX in Docker** (`docker-compose.yml`): the connection reaches the
  container from the Docker bridge gateway (a `172.x` address), not from `127.0.0.1`. Find it with
  `docker network inspect artex_default --format '{{(index .IPAM.Config 0).Gateway}}'` (the network
  is `<project directory>_default`), put `ARTEX_TRUSTED_PROXIES=<gateway>/32` in `.env`, then
  `docker compose up -d`.

For a peer in that list, ARTEX reads `X-Forwarded-For` from the right and takes the first address
that is not a trusted proxy; from any other peer the header is ignored. Trust only proxies you run:
a trusted peer can claim any client address.

**Security headers**: every response carries `X-Content-Type-Options: nosniff`, a same-origin
referrer policy and a `frame-ancestors 'self'` CSP; console documents additionally get a
`Permissions-Policy` and COOP/CORP. `Strict-Transport-Security` is sent only when the request is
known to be HTTPS: directly over TLS, or via `X-Forwarded-Proto: https` from a trusted proxy. The
same list above enables it, so with nginx in front, the 443 server answers with HSTS after you set
`ARTEX_TRUSTED_PROXIES`.

> Only when SSE needs a different origin from the page (e.g. a dedicated subdomain) should you set
> `NEXT_PUBLIC_SSE_BASE` **at build time** (it is baked into the static bundle during `next build`;
> setting it at container runtime has no effect).

---

## Operations

### Troubleshooting an empty tool call

In the task's session transcript, expand the affected tool call and compare **Command** and
**Output**. The `UNTRUSTED_OUTPUT` markers identify the boundary around tool output. They are
expected and should stay enabled while troubleshooting.

- **Command shows `{}`.** The recorded tool input is an empty JSON object. For a tool that
  requires a command, this means its command argument was missing. Check which model and version
  produced the call.
- **Command shows `(empty)` or `(failed to load)`.** The transcript has no input detail to display
  or could not fetch it. If the session record contains a command, include that discrepancy in a
  report.
- **Output shows `[]`.** This is the recorded result body. Check the row's success or failure
  indicator and its input separately before drawing conclusions about what ran.

For a recurring problem, share the ARTEX version or commit, the model and version, and a sanitized
excerpt of the affected input and result. Remove credentials, target data, and other sensitive
content before sharing.

### Backups

`scripts/backup.sh` dumps the Postgres database (and optionally the data directory) with
timestamped output and rotation:

```bash
scripts/backup.sh --with-data          # db dump + data/ archive, keep 14
scripts/backup.sh --keep 7             # db only, keep 7
```

Restore into a running stack:

```bash
gunzip -c backups/artex-db-<timestamp>.sql.gz | docker compose exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Stored secrets (LLM API keys, proxies and gateway custom headers, MCP env, task credentials, notification channel config,
Brave/Tavily search keys, web search and global proxies, the execution spec of custom tools, the
capture-proxy rewrite rules) are
encrypted in the database with the key in `keys/secret.key` (generated at first start, mode 0600,
next to `jwt.key`). **A database backup without that key cannot restore those secrets**: back up
`keys/` with the dump, separately. Deployments without a persistent disk set
`ARTEX_SECRET_KEY` (32 bytes, base64 or hex, e.g. `openssl rand -base64 32`). ARTEX refuses to start
when the database holds encrypted secrets and no key is available.

Daily cron example (03:20, operator crontab):

```
20 3 * * * cd /path/to/ARTEX && scripts/backup.sh --with-data >> backups/backup.log 2>&1
```

### Updating and upgrading

> Upgrading swaps the program and never touches data: the Postgres volume `pgdata`, `./data`
> (traffic index, task files, transcripts), `./keys` (`jwt.key`, `secret.key`) and `./skills` are
> preserved. **No manual database step is needed**: on every start ARTEX applies its embedded
> `schema.sql` baseline, then any pending numbered migration from `db/migrations/`, in order, each
> in its own transaction. Restarting the new binary is the upgrade. Back up `./data`, `keys/` and
> the database before upgrading.

**Update banner (opt-in, off by default)**: start ARTEX with `ARTEX_UPDATE_CHECK=1` to ask the
public GitHub releases API for the latest tag, at most once per 24 hours (cached in memory; a
failed check is not retried within that window). When the release is newer, the web UI shows a
dismissible strip linking to Releases. The request sends only `User-Agent: artex-update-check`.
Unset, ARTEX makes no update request and shows no banner.

#### Upgrading from a clone made before 2026-10-23

The repository history was rewritten that day to drop a personal email address from the commit
metadata. A clone made before then cannot fast-forward, and `./update.sh` now stops instead of
silently rebuilding stale code. Recover once, then upgrade normally:

```bash
git stash                 # only if you have local changes
git fetch origin
git reset --hard origin/main
git stash pop             # only if you stashed
```

Your data is unaffected: `./data`, the `pgdata` volume and `./skills` are not part of git history.

#### Option 1: one-click update script

```bash
cd ARTEX
./update.sh
```

The script optionally `git pull`s, then offers **① Docker update** (`docker compose build artex` →
`docker compose up -d artex`) or **② local build update** (rebuild the frontend static assets, then
recompile `./artex`; restart the process for it to take effect).

#### Option 2: Docker (Compose or GHCR image)

```bash
cd ARTEX
git pull
docker compose build artex
docker compose up -d artex
docker image prune -f            # optional
```

If running the prebuilt `ghcr.io/baarai/artex` container directly, pull the new tag (`docker pull
ghcr.io/baarai/artex:latest` or a pinned `:v<version>`) and recreate the container with the same
`/app/data` and `/app/keys` mounts. If you run the prebuilt Compose stack, the update is:

```bash
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
```

#### Option 3: prebuilt binaries

Download the new zip, stop the old process, overwrite `artex` and `skills/` (keep `config.json` and
`data/`), then restart:

```bash
cp -r <extracted dir>/skills ./ && cp <extracted dir>/artex ./
./start.sh
```

#### Option 4: build from source

```bash
git pull
cd web && npm ci && npm run build:static && cd ..
cp -r web/out server/webui/dist
CGO_ENABLED=0 go build -tags embedui -o artex ./cmd/artex
# restart ./start.sh
```

---

## Development

```bash
./dev.sh    # backend(:8787) + traffic proxy(:8788) + frontend next dev(:5173) → http://localhost:5173
```

- Backend: `go run ./cmd/artex` (without `-tags embedui`, the frontend is not embedded)
- Frontend: `cd web && npm run dev` (`/api` is reverse-proxied to the backend, with hot reload)
- Tests: `go test ./...`
- Reproduce the fast CI checks locally: `./scripts/verify.sh` (add `--full` for `-race` and the static web build; add `--security` for `govulncheck`)
- Security scan: install `govulncheck` and run `./scripts/verify.sh --security` (CI runs this on every push and pull request)
- Mock preview (no backend): `cd web && NEXT_PUBLIC_MOCK=1 npm run dev`

---

## Architecture

ARTEX is an **LLM multi-agent-driven autonomous penetration testing system**: a Go monolithic
backend (with the Next.js UI embedded) + PostgreSQL. Agent capabilities come from the
[`norma`](https://github.com/Autumn-27/norma) SDK (`agentcore` / `tool` / `permission` / `harness` /
`memory` / `transcript`). At its core is the **dual-graph architecture**, plus two autonomy
mechanisms: **process-level information exchange between workers** and the **planner's multi-round
shared todolist**.

```mermaid
flowchart TB
  subgraph FE["Frontend Next.js (go:embed embedded single binary)"]
    UI["Dashboard · Tasks · Assets · Coverage graph · Traffic · Workspace · System settings"]
  end
  subgraph SRV["server (Go net/http)"]
    API["REST /api/*  JWT auth  SSE"]
    ENG["engine scheduling loop"]
    MGR["Manager  task/engine/store lifecycle"]
  end
  subgraph AG["agent (norma SDK)"]
    GO["goals  goal decomposition + scope extraction"]
    PL["planner  the planner (sole intent generator)"]
    WK["worker  executor ×N"]
    MA["mainagent  human-in-the-loop"]
  end
  subgraph DB["PostgreSQL"]
    AGRAPH["Asset graph  assets / companies / task_scope"]
    EGRAPH["Exploration graph  exploration_nodes / anchors / activity"]
  end
  subgraph SUB["Supporting subsystems"]
    PROXY["Traffic recording proxy  MITM + CA tracing"]
    GUARD["guard / intercept  tool approval gate"]
    ENR["enrich  DNS / HTTP async enrichment"]
    EXT["MCP · skills · memory · report"]
  end

  UI -->|HTTP| API
  API --> MGR --> ENG
  ENG --> PL
  ENG --> WK
  API --> MA
  API --> GO
  PL --> DB
  WK --> DB
  MA --> DB
  GO --> DB
  WK -->|"Bash / HTTP fully traced"| PROXY
  WK --> GUARD
  WK --> ENR
  PL -.-> EXT
  WK -.-> EXT
  MA -.-> EXT
```

| Layer | Responsibility |
| --- | --- |
| **Frontend** | Next.js static export embedded via `go:embed`; tasks, assets, exploration and coverage graphs, traffic, human-in-the-loop chat |
| **server** | `net/http` routing, JWT auth, SSE; `Manager` owns tasks, engines and DB stores |
| **engine** | One `plannerLoop` + N worker goroutines per task; intent claiming, timeout/pause/drain |
| **agent** | goals / planner / worker / mainagent; `ToolSet` exposes the dual graphs as LLM tools |
| **db** | PostgreSQL persistence (pgx); embedded schema and numbered migrations applied at startup |
| **Supporting** | Recording MITM proxy, approval gate, async enrichment, MCP/skills/memory/report |

For the code-level map (execution flow, trust boundaries, decisions) see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); for startup, configuration precedence,
backup and key rotation see [docs/OPS.md](docs/OPS.md).

---

## Security

Please report vulnerabilities privately through GitHub Security Advisories; see
[SECURITY.md](SECURITY.md).

Operational security properties:

- **Secrets at rest**: LLM keys/proxies/gateway headers, MCP environment, task credentials, notification config,
  search keys, proxies, custom-tool execution specs, capture-proxy rewrite rules and traffic
  evidence snapshots are encrypted
  with AES-256-GCM using `keys/secret.key` (or `ARTEX_SECRET_KEY`). ARTEX refuses to start when
  encrypted data exists and no usable key is available.
- **First-run claim**: `/setup` requires a one-time token printed at startup; the UI binds to
  `127.0.0.1` by default.
- **Login protection**: 10 attempts per minute per client IP, with `ARTEX_TRUSTED_PROXIES` for
  correct client attribution behind a reverse proxy.
- **Untrusted tool output**: framed as data for every agent by default (prompt-injection boundary).
- **Release integrity**: SHA-256 sums, CycloneDX SBOM and GitHub build provenance attestations for
  release archives.

---

## About this fork

This repository is the English translation and continuation of ARTEX, originally by [Autumn-27](https://github.com/Autumn-27). The upstream repository is no longer public, so the link points to the author profile. Changes in this fork are tracked in [CHANGELOG.md](CHANGELOG.md), under the same AGPL-3.0 license.

---

## References and prior art

- [Cairn](https://github.com/oritera/Cairn)
- Approval-details UI inspired by [AegisHook](https://github.com/RuoJi6/AegisHook)

---

## License and disclaimer

### Open source license

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**; see the
[LICENSE](LICENSE) file for the full terms.

Anyone may use, modify and distribute this project, but **derivative works must also be open-sourced
under AGPL-3.0**; in particular, **if you modify this project and provide it to users over a
network (for example as an online service), you must make the corresponding complete source code
available to those users**.

> **Important**: the open source license does not restrict how the software is used. The usage
> restrictions and disclaimer below are additional terms from the maintainers.

**ARTEX is an offensive-security tool. Use it only against systems you own, or that you are
explicitly authorized to test (your own lab, your organization's assets, or a bug bounty /
vulnerability disclosure program's targets within its published scope and rules of engagement).
Any use without authorization violates these terms.**

### Permitted use

- Read, learn and study this project's source code;
- Run it against systems you own or in isolated lab environments;
- Run it against authorized bug bounty / vulnerability disclosure targets, within their published
  scope and rules of engagement;
- Academic research and code review.

### Prohibited actions

- Scanning, probing, exploiting or attacking any website, online service or networked system
  without the explicit authorization of its owner;
- Testing outside a program's published scope, or in violation of its rules of engagement;
- Illegal intrusion, data theft, extortion, denial of service, or any destructive or criminal
  activity;
- Any use that violates the laws and regulations of your country or region.

### Compliance responsibility

Users must comply with all laws and regulations of their country or region regarding cybersecurity,
data protection and computer crime. **All legal liability and consequences arising from the use of
this tool are borne by the user.**

### Disclaimer

This project is provided "as is", without any express or implied warranty. The authors and
contributors are not liable for any direct or indirect loss, data loss, system damage or legal
dispute caused by the use of this tool (whether used properly or not). **Downloading, installing or
using this project means you have read, understood and agreed to all of the above terms.**
