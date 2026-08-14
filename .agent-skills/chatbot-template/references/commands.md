# chatbot-template — command & file reference

Curated reference for [shadcn-ui/chatbot-template](https://github.com/shadcn-ui/chatbot-template),
grouped by workflow stage. Package manager is **pnpm** (repo ships
`pnpm-lock.yaml` + `pnpm-workspace.yaml`); do not substitute npm/yarn.

## Scaffold

```bash
git clone --depth 1 https://github.com/shadcn-ui/chatbot-template.git
cd chatbot-template
pnpm install
```

One-click deploy (no local setup, no env vars — OIDC handles gateway auth):
`https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fshadcn-ui%2Fchatbot-template`

## Local credentials

```bash
# Option A: pull an OIDC token from a linked Vercel project
vercel link
vercel env pull

# Option B: manual API key (Vercel dashboard → AI Gateway → API Keys)
cp .env.example .env.local
# then set AI_GATEWAY_API_KEY=... in .env.local
```

| Env var | Required | Description |
|---|---|---|
| `AI_GATEWAY_API_KEY` | Local dev only | AI Gateway API key. Not needed on Vercel deployments (OIDC). |

## package.json scripts

```bash
pnpm dev         # next dev
pnpm build       # next build
pnpm start       # next start (serve the production build)
pnpm lint        # eslint
pnpm format      # prettier --write "**/*.{ts,tsx}"
pnpm typecheck   # tsc --noEmit
```

## Adding shadcn/ui components

```bash
npx shadcn@latest add button
```

Component registry/config lives in `components.json`.

## Key files

| File | Purpose |
|---|---|
| `app/api/chat/route.ts` | Streams responses with `streamText`; public, unauthenticated by default |
| `components/chat.tsx` | Renders the conversation via `useChat` + shadcn chat primitives |
| `components/chat-message.tsx` | Switches on `part.type`, delegates to a component in `components/parts/` |
| `lib/models.ts` | `MODELS` list + `DEFAULT_MODEL` (first entry) + `isModelAllowed()` |
| `tools/index.ts` | Composes `baseTools` + conditional `web_search`; exports `InferUITools`-derived `ChatUIMessage` type |
| `tools/<name>.ts` | One file per tool; filename is the model-facing tool name |
| `components.json` | shadcn/ui component registry config |

## Built-in tools

| Tool file | Model-facing name | Behavior |
|---|---|---|
| `tools/github_repo.ts` | `github_repo` | Server-executed fetch of GitHub repo stats (stars/forks/issues/language); 5s timeout, returns `{ error }` on failure |
| `tools/ask_user.ts` | `ask_user` | No `execute` — UI-answered. Model asks 1+ questions, each with exactly 3 choices; user can also free-answer |
| `tools/web_search.ts` | `web_search` | Provider-native search — `openai.tools.webSearch()` for `openai/*` models, `anthropic.tools.webSearch_20260209()` for `anthropic/*` models, `undefined` otherwise |

## Tool part → component map

Assistant messages are typed parts; `components/chat-message.tsx` switches
on `part.type` and delegates to `components/parts/`:

| Part type | Component | Renders |
|---|---|---|
| `text` | `text-part.tsx` | Markdown via `react-markdown` + shadcn/typeset |
| `tool-github_repo` | `github-repo-part.tsx` | Spinner while running, then a linked stat line |
| `tool-web_search` | `web-search-part.tsx` | "Searching the web…" status, then a persistent "Searched the web" line per search |
| `tool-ask_user` | `ask-user-part.tsx` | Answered questions inline; pending questions render via `question-card.tsx`, pinned to the scroller bottom |
| `source-url` | `sources-part.tsx` | Web search citations, deduped into a "Searched N websites" drawer once streaming finishes |

Tool parts move through `input-streaming` → `input-available` →
`output-available` (or `output-error`) as the stream progresses; part
components switch on `part.state`.

## Adding a new tool — checklist

1. Create `tools/<name>.ts` exporting `tool({ description, inputSchema,
   execute })` — omit `execute` for UI-answered tools like `ask_user`.
2. Register it in `tools/index.ts` (`baseTools`, or conditionally like
   `web_search`).
3. Add `components/parts/<name>-part.tsx`.
4. Add `case "tool-<name>"` in `components/chat-message.tsx`.

`InferUITools` types `part.input`/`part.output` from the tool definition, so
a renamed field is a build error, not a silent `undefined`.

## Security checklist before public traffic

- [ ] Rate limit `/api/chat` (Vercel Firewall/WAF or `@upstash/ratelimit`)
- [ ] Set an AI Gateway spend limit as a backstop
- [ ] Add auth if the chatbot isn't meant to be public
- (Already handled by the template) request body validation, model
      allowlist via `lib/models.ts`, output token/step caps, abort on client
      disconnect

## License

MIT — see `LICENSE` in the upstream repo.
