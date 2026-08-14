---
name: chatbot-template
description: >
  Scaffold and extend chatbot-template, shadcn/ui's minimal Next.js starter for
  building an AI chatbot with the AI SDK, shadcn/react, shadcn/typeset, and the
  Vercel AI Gateway. It ships streaming markdown chat, tool calling (a
  server-executed GitHub repo lookup, provider-native web search, and a
  human-in-the-loop `ask_user` questionnaire), and one-click Vercel deploy with
  OIDC gateway auth. Use when the user wants to spin up a Next.js AI chat app
  fast, add a custom tool with a typed UI part, swap or restrict the model
  list, or harden the public `/api/chat` route before shipping. Triggers on:
  "chatbot-template", "shadcn chatbot", "AI SDK chat app", "Next.js AI SDK
  starter", "Vercel AI Gateway chat", "streaming chat with shadcn/typeset",
  "ask_user questionnaire tool", "shadcn/react message scroller".
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Node.js + pnpm (repo ships a pnpm-lock.yaml / pnpm-workspace.yaml). Next.js
  16 / React 19 / TypeScript. Needs an AI Gateway credential for local dev
  (`vercel env pull` or a manual `AI_GATEWAY_API_KEY`) — none is needed on
  Vercel deployments, which authenticate via OIDC. MIT licensed.
metadata:
  tags: chatbot-template, nextjs, ai-sdk, shadcn-ui, shadcn-react, vercel-ai-gateway, streaming-chat, tool-calling, react
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: https://github.com/shadcn-ui/chatbot-template
---

# chatbot-template

chatbot-template is shadcn/ui's minimal, opinionated Next.js starter for an AI
chatbot: streaming markdown responses (`react-markdown` + shadcn/typeset),
typed tool calling, provider-native web search, and a human-in-the-loop
`ask_user` questionnaire the model can trigger to ask clarifying questions.
It deploys to Vercel with zero configuration — the AI Gateway authenticates
automatically via OIDC — or runs locally against a gateway API key.

## When to use this skill

- Scaffolding a new Next.js AI chatbot instead of hand-wiring `useChat`,
  streaming, and markdown rendering from scratch
- Adding a custom tool (server-executed or UI-answered) with a typed part
  component that renders its `input-streaming` / `input-available` /
  `output-available` states
- Restricting or reordering the model list, or wiring web search per model
- Hardening the public `/api/chat` route (rate limiting, spend caps, auth)
  before putting it in front of real traffic
- Understanding how assistant message "parts" (`text`, `tool-*`,
  `source-url`) map to components so you can extend the chat UI safely

## When not to use this skill

- The user needs persistent chat history, multi-user auth, or a database —
  this template has none of that; build it on top rather than expecting it
  out of the box
- The target stack isn't Next.js/React — this is a Next.js App Router
  template tied to `useChat` and RSC-style API routes
- The goal is running an LLM entirely offline/bare-metal with no cloud
  gateway → not this skill; see the `nightrun` skill for a no-OS boot-to-LLM
  appliance instead
- The ask is about the AI SDK or shadcn/ui in the abstract, unrelated to this
  specific starter template → use general AI SDK / shadcn/ui docs instead

## Instructions

### Step 1: Get the code

```bash
git clone --depth 1 https://github.com/shadcn-ui/chatbot-template.git
cd chatbot-template
```

Or click "Deploy with Vercel" on the README for a zero-config deploy — no
env vars needed, since Vercel deployments authenticate to the AI Gateway via
OIDC automatically and billing runs on the team's AI Gateway credits.

### Step 2: Install and give the app a gateway credential

```bash
pnpm install
```

Then either pull an OIDC token from a linked Vercel project:

```bash
vercel link
vercel env pull
```

or create an API key in the Vercel dashboard (**AI Gateway → API Keys**) and
set it locally:

```bash
cp .env.example .env.local
# then set AI_GATEWAY_API_KEY=... in .env.local
```

### Step 3: Run the dev server

```bash
pnpm dev
```

### Step 4: Configure the model list

Edit [lib/models.ts](https://github.com/shadcn-ui/chatbot-template/blob/main/lib/models.ts) — the **first entry is the default model**, and
`isModelAllowed()` restricts `/api/chat` to only the listed model IDs (see
[Vercel AI Gateway models](https://vercel.com/ai-gateway/models) for valid IDs).

### Step 5: Add a custom tool

1. Create `tools/<name>.ts` — the filename is the model-facing tool name.
   Export a `tool()` with a `description`, an `inputSchema`, and an `execute`
   function; omit `execute` for tools the user answers in the UI (like
   `ask_user`).
2. Register it in `tools/index.ts` (add it to `baseTools`, or conditionally
   like `web_search`).
3. Add a part component in `components/parts/` and a matching
   `case "tool-<name>"` in `components/chat-message.tsx`.

Message types are inferred from tool definitions via `InferUITools`, so
`part.input`/`part.output` are typed — renaming a tool field becomes a build
error instead of a silent `undefined`. See
[references/commands.md](references/commands.md) for the full tool-part
table and file map.

### Step 6: Add shadcn/ui components as needed

```bash
npx shadcn@latest add button
```

### Step 7: Harden before public traffic

`/api/chat` is **public and unauthenticated** by default — every request
spends AI Gateway credits. Before real traffic:

- Rate limit it (Vercel Firewall/WAF, or `@upstash/ratelimit`) to prevent a
  denial-of-wallet from a single client
- Set an [AI Gateway spend limit](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets) as a backstop
- Add auth if the chatbot isn't meant to be public

The route already validates the request body, restricts models to
`lib/models.ts`, caps output tokens/step count, and aborts generation on
client disconnect — those bound a single request, not overall volume.

### Step 8: Verify before handing off

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Best practices

1. **Treat `/api/chat` as public by default** — it has no auth or rate
   limiting out of the box; do not tell a user it's production-ready without
   step 7's hardening.
2. **Register new tools in both places** — `tools/index.ts` and a
   `case "tool-<name>"` in `chat-message.tsx`. A tool with no part component
   renders nothing for its output.
3. **Model order matters** — `MODELS[0]` in `lib/models.ts` is the default;
   don't assume alphabetical or arbitrary ordering is safe to change.
4. **Use pnpm, not npm/yarn** — the repo ships `pnpm-lock.yaml` and
   `pnpm-workspace.yaml`; a different package manager will produce a
   divergent lockfile.
5. **Prefer `npx shadcn@latest add <component>` over hand-copying UI code** —
   it keeps components in sync with the project's `components.json` config.
6. **Local dev needs a gateway credential; Vercel deploys don't** — don't
   add `AI_GATEWAY_API_KEY` handling for the Vercel-deployed path, OIDC
   already covers it.

## References

- [references/commands.md](references/commands.md) — curated command
  reference, key files, and tool-part extension map
- [chatbot-template GitHub repository](https://github.com/shadcn-ui/chatbot-template)
- [AI SDK docs](https://ai-sdk.dev)
- [shadcn/ui docs](https://ui.shadcn.com)
- [Vercel AI Gateway docs](https://vercel.com/docs/ai-gateway)
- Project standards: `.agent-skills/skill-standardization/SKILL.md`

## Examples

### Example 1: Scaffold and run locally

```bash
git clone --depth 1 https://github.com/shadcn-ui/chatbot-template.git
cd chatbot-template
pnpm install
cp .env.example .env.local
# set AI_GATEWAY_API_KEY=... in .env.local
pnpm dev
```

### Example 2: Add a custom tool with a UI part

```bash
# 1. tools/weather.ts — export tool({ description, inputSchema, execute })
# 2. tools/index.ts   — add weather: weatherTool to baseTools
# 3. components/parts/weather-part.tsx — render input-streaming/available/output states
# 4. components/chat-message.tsx — add case "tool-weather": <WeatherPart part={part} />
pnpm typecheck
pnpm dev
```
