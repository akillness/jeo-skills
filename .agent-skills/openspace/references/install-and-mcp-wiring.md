# Install and MCP Wiring

All facts below are grounded in the upstream OpenSpace README (Quick Start, Path A,
Path B, and the host-skills/env-var sections).

## Requirements

- Python **3.12+**
- `openspace-mcp --help` must succeed after install (this is the verification gate)
- Node.js **≥ 20** only if you also want the local dashboard (`apps/dashboard`)

## Quick Start (Path A: for your agent)

```bash
git clone https://github.com/HKUDS/OpenSpace.git && cd OpenSpace
pip install -e .
openspace-mcp --help  # verify installation
```

Lightweight clone that skips the ~50 MB `assets/` folder:

```bash
git clone --filter=blob:none --sparse https://github.com/HKUDS/OpenSpace.git
cd OpenSpace
git sparse-checkout set --no-cone '/*' '!/assets/'
pip install -e .
```

If `openspace-mcp --help` is unavailable, install with an explicit interpreter:

```bash
python -m pip install -e .
```

## MCP server config

Add an MCP server named `openspace`. Prefer stdio for local use.

```json
{
  "mcpServers": {
    "openspace": {
      "command": "openspace-mcp",
      "toolTimeout": 600,
      "env": {
        "OPENSPACE_HOST_SKILL_DIRS": "/path/to/your/agent/skills",
        "OPENSPACE_WORKSPACE": "/path/to/OpenSpace",
        "OPENSPACE_CLOUD_MODE": "live",
        "OPENSPACE_CLOUD_API_KEY": "sk-xxx (optional, for cloud)"
      }
    }
  }
}
```

**In this repo (jeo-skills):** set `OPENSPACE_HOST_SKILL_DIRS` to
`$HOME/.agents/skills` — that is the shared skills root other jeo-skills installers
(for example `scrapling`'s `scripts/install.sh`) copy skills into for host agents to
load, so it is what OpenSpace should scan and rank against. Set `OPENSPACE_WORKSPACE`
to the absolute path of the cloned `OpenSpace` repo root.

Credentials (API key, model) are auto-detected from nanobot and OpenClaw configs.
Other hosts should set `OPENSPACE_LLM_API_KEY` / `OPENSPACE_MODEL`, or rely on
`openspace/.env` (see `openspace/.env.example`).

## Three launch modes

- **stdio** — keep `command: "openspace-mcp"` in the host config. Simplest option.
- **SSE** — start `openspace-mcp --transport sse --host 127.0.0.1 --port 8080`.
  Endpoint: `http://127.0.0.1:8080/sse`.
- **streamable HTTP** — start `openspace-mcp --transport streamable-http --host 127.0.0.1 --port 8081`.
  Endpoint: `http://127.0.0.1:8081/mcp`.

`stdio` is the simplest option. HTTP modes keep OpenSpace as a standalone server, but
host-specific registration syntax and host-side timeouts still apply.

## Copy the two host skills

```bash
cp -r OpenSpace/openspace/host_skills/delegate-task/ /path/to/your/agent/skills/
cp -r OpenSpace/openspace/host_skills/skill-discovery/ /path/to/your/agent/skills/
```

These teach the host agent when and how to use OpenSpace with no additional prompting:

- `openspace/host_skills/skill-discovery/SKILL.md` — teaches the agent to search & discover skills
- `openspace/host_skills/delegate-task/SKILL.md` — teaches the agent to execute, fix, and upload

For jeo-skills, copy both into `$HOME/.agents/skills/` (this is what
`scripts/install-openspace.sh` automates).

## Path B: command line (no host agent required)

```bash
# Interactive command-line mode
openspace

# Execute task
openspace --model "anthropic/claude-sonnet-4-5" --query "Create a monitoring dashboard for my Docker containers"
```

Create a `.env` file with your LLM API key first. For cloud community access,
provision the agent key with `openspace-cloud-auth bootstrap-agent-key` (refer to
`openspace/.env.example`).

## Cloud bootstrap (optional)

```bash
openspace-cloud-auth bootstrap-agent-key --email you@example.com --agent-name openspace-local-agent
```

This stores `OPENSPACE_CLOUD_MODE=live` and `OPENSPACE_CLOUD_API_KEY` locally without
printing the raw key. Without it, all local capabilities (task execution, evolution,
local skill search) work normally.

## Local dashboard (optional)

Requires Node.js ≥ 20.

```bash
# Terminal 1: backend API
openspace-dashboard --port 7788

# Terminal 2: frontend dev server
cd apps/dashboard
npm install  # only needed once
npm run dev
```

## Verification checklist before reporting success

- `openspace-mcp --help` works
- the MCP client can see OpenSpace's tools
- a lightweight local skill search works
- long `execute_task` calls have a timeout of at least 600 seconds
- report back: MCP config path, skill directory, chosen transport, verification results
