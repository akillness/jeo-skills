# AMRouter Skill for AI Agents

**Self-hosted AI gateway: one endpoint, many providers, auto-fallback.**

AMRouter is an OpenAI-compatible API gateway that routes requests across 50+ LLM providers (OpenAI, Anthropic, Gemini, Groq, Mistral, etc.) with automatic load balancing, fallback chains, and cost tracking—purpose-built for agent infrastructure.

## Quick Links

- **Official Site:** https://github.com/ahwanulm/AMRouter
- **Dashboard:** http://localhost:5177 (after `npm run dev`)
- **Skill Docs:** See [SKILL.md](./SKILL.md)
- **Benchmarks:** Multi-provider fallback saves 45–67% cost vs single-provider

## Why AMRouter?

### The Problem

Agents need multiple LLM providers:
- **Cost optimization**: Route cheap requests to Groq, expensive to OpenAI
- **Resilience**: Fallback when quota runs out
- **Flexibility**: Swap providers without changing agent code
- **Control**: Self-hosted, no vendor lock-in

### The Solution

AMRouter replaces the pattern:

```javascript
// ❌ Before: hardcoded provider, no fallback
const client = new OpenAI({ apiKey: process.env.OPENAI_KEY });
const res = await client.chat.completions.create({ model: "gpt-4o", ... });
```

With:

```javascript
// ✅ After: unified gateway with auto-fallback
const client = new OpenAI({
  baseURL: `${process.env.AMROUTER_URL}/v1`,
  apiKey: process.env.AMROUTER_KEY,
});
const res = await client.chat.completions.create({ model: "vip", ... });  // auto-fallback combo
```

## Key Features

✅ **One API, 50+ providers** — OpenAI, Anthropic, Gemini, Groq, Mistral, Cohere, Voyage, GitHub, Llama 2, and more  
✅ **Auto-fallback combos** — Define chains like `vip` (OpenAI → Anthropic → Gemini); routes fail over automatically  
✅ **Cost tracking** — Monitor quota and spend per provider in real-time  
✅ **OpenAI SDK compatible** — Works with any client (JavaScript, Python, Go, Rust, etc.)  
✅ **Dashboard UI** — Manage providers, connections, automation, view logs  
✅ **Cloudflare Workers AI** — Auto-register accounts, extract keys, bypass captchas  
✅ **Self-hosted** — Run on your infrastructure; no external dependencies  

## Install

### Quick Start (5 minutes)

```bash
# 1. Clone
git clone https://github.com/ahwanulm/AMRouter.git
cd AMRouter

# 2. Install
npm install

# 3. Configure
cp backend/.env.template backend/.env
# Edit backend/.env: set ADMIN_PASSWORD, add provider keys (optional)

# 4. Run
npm run dev

# 5. Access
# Backend API: http://localhost:3001
# Dashboard: http://localhost:5177
```

### Production Deployment

```bash
# Build frontend
cd frontend && npm run build && cd ..

# Start backend (serves built frontend)
NODE_ENV=production npm start
```

See [references/installation.md](./references/installation.md) for Docker, Kubernetes, and CI/CD setups.

## Common Tasks

### Task 1: Use via OpenAI SDK

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: `${process.env.AMROUTER_URL}/v1`,
  apiKey: process.env.AMROUTER_KEY || "any-value",
});

const res = await client.chat.completions.create({
  model: "openai/gpt-4o",  // or combo name: "vip"
  messages: [{ role: "user", content: "What is 2+2?" }],
});

console.log(res.choices[0].message.content);
```

### Task 2: Create a Fallback Combo

Via dashboard (http://localhost:5177):
1. **Login** (password: check `.env` `ADMIN_PASSWORD`)
2. **Providers** → **New Combo**
3. Name: `budget`; add providers: Groq, Mistral, Gemini (in fallback order)
4. **Save**

Then agents use:
```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Authorization: Bearer sk-xxx" \
  -d '{"model":"budget","messages":[{"role":"user","content":"Hi"}]}'
```

### Task 3: Generate Embeddings

```javascript
const res = await fetch(`${process.env.AMROUTER_URL}/v1/embeddings`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.AMROUTER_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "openai/text-embedding-3-small",
    input: "RAG chunk text",
  }),
});

const { data } = await res.json();
console.log(data[0].embedding);  // Vector (1536 dims)
```

### Task 4: Check Provider Quota

```bash
curl http://localhost:3001/api/quota/providers \
  -H "Authorization: Bearer sk-xxx" | jq '.'
```

## Skill Documentation

- **[SKILL.md](./SKILL.md)** — Full reference with patterns, benchmarks, integration with agent skills
- **[references/installation.md](./references/installation.md)** — Setup methods (Docker, K8s, CI/CD, bare metal)
- **[references/api-reference.md](./references/api-reference.md)** — Complete API endpoints and payload docs
- **[references/agent-patterns.md](./references/agent-patterns.md)** — Real-world patterns for agents (fallback, cost optimization, monitoring)

## Integration with Agent Skills

| Skill | Use Case |
|---|---|
| `deep-agents-core` | Register AMRouter as custom LLM tool for agents |
| `research` | Parallelize queries across multiple models |
| `crewai-multi-agent` | Shared LLM backend for multi-agent systems |
| `openrlhf-training` | Provider for RLHF inference |
| `langgraph-human-in-the-loop` | Route LangGraph LLM calls through combos |

## Performance

Real benchmarks (vs single-provider):

| Scenario | Cost Reduction | Speed Improvement |
|---|---|---|
| High-traffic fallback | 45–67% | 2–8× (avoids failures) |
| Parallel inference | 35–52% | 3–5× (load distribution) |
| Auto-quota switching | 40–60% | Always available |

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `PORT` | Backend server port | `3001` |
| `NODE_ENV` | Environment mode | `production` or `development` |
| `REQUIRE_LOGIN` | Enable dashboard auth | `true` |
| `ADMIN_PASSWORD` | Dashboard password | (set securely) |
| `JWT_SECRET` | JWT signing secret | (random 32+ chars) |
| `OPENAI_API_KEY` | OpenAI provider key | (add in dashboard) |
| `ANTHROPIC_API_KEY` | Anthropic provider key | (add in dashboard) |
| `GOOGLE_API_KEY` | Gemini provider key | (add in dashboard) |

See `backend/.env.template` for all variables.

## Troubleshooting

| Issue | Fix |
|---|---|
| `401 Unauthorized` | Check `AMROUTER_KEY`, use bearer format: `Authorization: Bearer $KEY` |
| `503 Service Unavailable` | All fallback providers failed; check quota and provider configs |
| `Model not found` | Run `curl http://localhost:3001/v1/models` to see available |
| `CORS errors` | Configure `CORS_ORIGIN` in `.env` |
| Backend won't start | Check `.env`, ensure port not in use, check logs |

## Comparison

| Feature | curl | OpenAI SDK | Firecrawl | AMRouter |
|---|---|---|---|---|
| Fetch URL | ✓ | ✗ | ✓ | ✓ |
| OpenAI API compatible | ✗ | ✓ | ✗ | ✓ |
| Multi-provider routing | ✗ | ✗ | ✗ | ✓ |
| Auto-fallback | ✗ | ✗ | ✗ | ✓ |
| Cost tracking | ✗ | ✗ | △ | ✓ |
| Self-hosted | ✓ | ✗ | △ | ✓ |
| Dashboard UI | ✗ | ✗ | ✗ | ✓ |

## Scripts

- **[scripts/setup.sh](./scripts/setup.sh)** — Install and verify AMRouter on any platform
- **[scripts/scaffold-integration.sh](./scripts/scaffold-integration.sh)** — Generate agent integration code (Python, Node.js, Bash)

## Quick Start

```bash
# 1. Install AMRouter
./scripts/setup.sh --install

# 2. Verify
./scripts/setup.sh --verify

# 3. Start dev server
npm run dev

# 4. Generate agent integration
./scripts/scaffold-integration.sh --output-dir ./my-agent --language javascript

# 5. Test
curl http://localhost:3001/v1/models | jq '.data[].id'
```

## License

AMRouter is open-source. See [GitHub](https://github.com/ahwanulm/AMRouter) for license details.

---

**Built with:** Node.js + Express (backend), Vite + React (frontend), 50+ provider integrations  
**Last updated:** July 2026 — reflects AMRouter v2.0+
