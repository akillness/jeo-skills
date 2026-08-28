# Open Executive setup, providers, and cost

Verified against upstream commit `3a48f77a35e6980335553b9bdd02724e00f6f239`.
Model names and provider pricing change; re-read current upstream and the
provider before promising a cost.

## Prerequisites

| Requirement | Expectation | Verify |
|---|---|---|
| Git | clone the repository | `git --version` |
| Python | 3.11 or newer | `python3 --version` |
| uv | Python package manager used by the repo | `uv --version` |
| Node.js | 22 or newer for the UI | `node --version` |
| npm | UI dependency install | `npm --version` |
| Make | convenience targets | `make --version` |
| Docker | alternative to a native toolchain | `docker --version` |
| flyctl | only for Fly.io deployment | `flyctl version` |

The bundled helper reports all of these without installing anything:

```bash
bash .agent-skills/openexecutive/scripts/openexecutive.sh doctor /path/to/OpenExecutive
```

## First run

```bash
git clone https://github.com/SenteLabsAI/OpenExecutive.git
cd OpenExecutive
cp .env.example .env          # edit before starting; .env is gitignored
make dev                      # API on 8000, UI on 3000
```

Without Make:

```bash
cd packages/core && uv sync && source .venv/bin/activate
uvicorn openexecutive.api.main:app --reload --port 8000
# second terminal
cd packages/ui && npm install && npm run dev
```

Docker Compose:

```bash
docker compose -f docker/docker-compose.yml up --build
```

The first start installs heavy ML dependencies and downloads a roughly 90 MB
embedding model to build the local vector index, so expect minutes before the
app is usable. Later starts are fast.

## Providers

At least one provider must be configured or the app refuses to start.

### Anthropic (default)

```bash
ANTHROPIC_API_KEY=sk-ant-...
DEFAULT_MODEL=claude-sonnet-4-6
DEEP_REASONING_MODEL=claude-opus-4-7
ROUTING_MODEL=claude-haiku-4-5-20251001
```

### OpenRouter

```bash
OPENROUTER_ENABLED=true
OPENROUTER_API_KEY=...
```

Routing Claude calls through OpenRouter bills usage to the OpenRouter account
and unlocks a curated set of non-Anthropic models that can be selected per
agent in the UI.

### Local models, no Anthropic key

```bash
LOCAL_MODELS_ENABLED=true
LOCAL_BASE_URL=http://localhost:11434/v1     # include the version path
LOCAL_MODELS=llama3.3,qwen2.5:14b
LOCAL_TIMEOUT_S=300
DEFAULT_MODEL=llama3.3
DEEP_REASONING_MODEL=llama3.3
ROUTING_MODEL=llama3.3
```

Base URLs differ by server: Ollama uses `:11434/v1`, LM Studio `:1234/v1`, and
vLLM `:8000/v1`. Note that vLLM's default port collides with the Open Executive
API port, so move one of them. Model slugs are sent verbatim and must match
what the server actually serves. Server-side web search has no local
equivalent and is disabled for local models, and tool-use quality depends
entirely on the chosen model.

## Cost surfaces

Every user turn can cost more than one model call:

1. the Executive orchestrator turn;
2. one call per consulted specialist, in parallel;
3. deep-reasoning models for CSO, CFO, GC, and Board;
4. a background episodic-extraction pass after every response;
5. optional server-side web searches, billed per search and multiplied by
   specialist fan-out;
6. optional overnight client rotation, which costs per parked client per night
   when enabled.

### The web-search default trap

`.env.example` says web search is "Off by default since each search is billed
separately" and sets `ENABLE_WEB_SEARCH=false` with `WEB_SEARCH_MAX_USES=5`.

The code disagrees. In `packages/core/openexecutive/config.py`:

- `enable_web_search` defaults to `True`
- `web_search_max_uses` defaults to `2`

So a deployment that never sets the variable, for example a container or Fly
app configured only with secrets, has **billable web search enabled**. Copying
`.env.example` into `.env` is what turns it off.

Always set the variable explicitly rather than relying on either document:

```bash
ENABLE_WEB_SEARCH=false        # or true with a deliberate WEB_SEARCH_MAX_USES
```

Optional allowlist or blocklist variables exist for domains; set at most one.

### Other paid toggles

- `XCRAWL_ENABLED` defaults to `false` and adds a scrape/SERP dependency when on.
- `HONCHO_ENABLED` defaults to `false` and requires a self-hosted endpoint.
- Client rotation is off by default and is a conscious opt-in.

## Prompt caching rules

Upstream states plainly that breaking caching multiplies cost roughly tenfold.
When touching prompts, tools, or the cache manager:

- keep tool definitions sorted by name;
- keep the Executive persona a module constant, never interpolated;
- keep the company profile and knowledge index in their own blocks;
- never place dynamic content in a block carrying `cache_control`;
- pass retrieval context in the user turn.

## Access control and secrets

| Variable | Purpose |
|---|---|
| `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google sign-in for the UI |
| `ALLOWED_EMAILS` | allow-list of Google accounts permitted to sign in |
| `AUTH_TRUST_HOST`, `AUTH_URL` | required behind a proxy and on Fly, or callbacks redirect to the bind address |
| `BACKEND_SHARED_SECRET` | shared header between the UI proxy and the API; leave unset for local `make dev` |
| `BACKEND_ALLOWED_ORIGINS` | extra CORS origins; localhost is always allowed |

Channel access for email, Telegram, and Discord is roster-driven through Person
rows in the app, not through env-var allowlists.

Audit an existing configuration. Only non-sensitive posture settings such as
feature flags and model names are echoed; credentials, hostnames, and email
addresses are reported as present or absent:

```bash
python3 .agent-skills/openexecutive/scripts/audit-config.py /path/to/OpenExecutive/.env
python3 .agent-skills/openexecutive/scripts/audit-config.py /path/to/.env --json
```

## Data locations

| Setting | Default | Contents |
|---|---|---|
| `VECTOR_STORE_PATH` | `./chroma_db` | ChromaDB index |
| `EPISODIC_DB_PATH` | `./episodic_memory.db` | episodic memory, alerts, audit |
| `COMPANY_PROFILE_PATH` | `./company/profile.yaml` | structured company profile |

Uploaded documents live under the company directory. All of it is gitignored.
Company data leaves the machine only inside model prompts sent to the
configured provider, which is a privacy fact worth stating to any user
uploading confidential material.

## Google Workspace and Gmail

Outbound email uses Gmail through a Workspace MCP server authenticated as
`EXEC_EMAIL_ADDRESS`. Setup requires OAuth desktop credentials, enabling the
Gmail, Calendar, and Drive APIs, setting `GOOGLE_OAUTH_CLIENT_ID` and
`GOOGLE_OAUTH_CLIENT_SECRET`, then running the workspace MCP auth command,
which opens a browser sign-in.

That sign-in grants a running application the ability to send mail as that
account. Never perform it on a user's behalf without explicit approval, and
never as an account other than the configured executive address.
